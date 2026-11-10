-- A view-only demo login, so people who aren't students (employers looking at the UI) can see
-- StudBuds as one real student sees it, without being able to change anything.
--
-- The demo login is an ordinary auth user with app_metadata.demo_of set to the id of the student
-- it shows. app_metadata can only be set with the service key (scripts/demo-account.mjs), and it
-- rides along in every access token, so the database can trust it.
--
-- Three pieces:
-- 1. Reads: before each API request, PostgREST runs public.demo_pre_request(). For a demo login
--    it swaps the token's sub for the shown student's id, so auth.uid() in every policy and
--    function answers as that student. Nothing else has to know about the demo.
-- 2. Writes: a trigger on every table in public and private refuses any change made during a
--    demo request, including changes made inside security definer functions. Visiting someone's
--    croft records a visit as a side effect of reading it; that one write is skipped quietly
--    instead, so the croft still opens.
-- 3. The login itself: a demo login can't change its password or email, and a demo request can't
--    touch auth.users (delete_my_account), so a visitor can't lock others out or delete anything.
--
-- Realtime and Storage don't go through PostgREST, so they still see the demo login's own id:
-- live updates don't arrive (the lists still load and refresh), and a policy below lets it read
-- the shown student's theme backgrounds.

-- The student a demo request is showing, or null for everyone else
create or replace function private.demo_of()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'demo_of', '')::uuid
$$;
grant execute on function private.demo_of() to anon, authenticated, service_role;

-- 1. Reads
create or replace function public.demo_pre_request()
returns void
language plpgsql
set search_path = ''
as $$
declare
  claims jsonb;
  target text;
begin
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  target := claims -> 'app_metadata' ->> 'demo_of';
  if target is null or target = '' then
    return;
  end if;
  perform set_config('request.jwt.claims', jsonb_set(claims, '{sub}', to_jsonb(target))::text, true);
  -- auth.uid() reads this one first when it's set
  perform set_config('request.jwt.claim.sub', target, true);
exception when others then
  -- Never break a request over this. A demo request that can't be switched just sees the demo
  -- login's own (empty) account.
  return;
end;
$$;
revoke execute on function public.demo_pre_request() from public;
grant execute on function public.demo_pre_request() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.demo_pre_request';
notify pgrst, 'reload config';

-- 2. Writes
create or replace function private.demo_read_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'demo_of', '') is null then
    return coalesce(new, old);
  end if;
  if tg_table_schema = 'public' and tg_table_name = 'croft_visits' then
    return null;
  end if;
  raise exception 'This is a view-only demo account, so changes aren’t saved.' using errcode = 'P0001';
end;
$$;
revoke execute on function private.demo_read_only() from public, anon, authenticated;

-- Attaches the guard to one table. New tables in later migrations need it too:
-- select private.add_demo_guard('public.new_table');
-- (supabase/tests/demo_viewer.test.sql fails if a table is missing it.)
create or replace function private.add_demo_guard(t regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('drop trigger if exists demo_read_only on %s', t);
  execute format(
    'create trigger demo_read_only before insert or update or delete on %s for each row execute function private.demo_read_only()',
    t
  );
end;
$$;
revoke execute on function private.add_demo_guard(regclass) from public, anon, authenticated;

do $$
declare
  t record;
begin
  for t in
    select c.oid::regclass as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and not c.relispartition
  loop
    perform private.add_demo_guard(t.name);
  end loop;
end;
$$;

-- 3. The login itself
create or replace function private.demo_login_fixed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A demo request (delete_my_account, or anything else) never changes auth.users
  if private.demo_of() is not null then
    raise exception 'This is a view-only demo account, so changes aren’t saved.' using errcode = 'P0001';
  end if;
  -- The demo login's own sign-in details stay as they were set up. To change the password,
  -- run scripts/demo-account.mjs again: it makes the login afresh.
  if tg_op = 'UPDATE' and old.raw_app_meta_data ? 'demo_of' and (
       new.encrypted_password is distinct from old.encrypted_password
       or new.email is distinct from old.email
       or new.email_change is distinct from old.email_change
       or new.phone is distinct from old.phone
       -- Only demo_of: Supabase Auth itself rewrites other app_metadata keys (providers)
       or new.raw_app_meta_data ->> 'demo_of' is distinct from old.raw_app_meta_data ->> 'demo_of'
     ) then
    raise exception 'The demo account’s sign-in can’t be changed.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function private.demo_login_fixed() from public, anon, authenticated;

drop trigger if exists demo_login_fixed on auth.users;
create trigger demo_login_fixed
  before update or delete on auth.users
  for each row execute function private.demo_login_fixed();

-- Storage: no file changes from a demo login, and it can see the shown student's backgrounds
drop policy if exists "Demo logins add no files" on storage.objects;
create policy "Demo logins add no files" on storage.objects
  as restrictive for insert to authenticated
  with check (private.demo_of() is null);

drop policy if exists "Demo logins change no files" on storage.objects;
create policy "Demo logins change no files" on storage.objects
  as restrictive for update to authenticated
  using (private.demo_of() is null);

drop policy if exists "Demo logins delete no files" on storage.objects;
create policy "Demo logins delete no files" on storage.objects
  as restrictive for delete to authenticated
  using (private.demo_of() is null);

drop policy if exists "Demo logins read the shown student's backgrounds" on storage.objects;
create policy "Demo logins read the shown student's backgrounds" on storage.objects
  for select to authenticated
  using (bucket_id = 'user-backgrounds' and (storage.foldername(name))[1] = (select private.demo_of())::text);
