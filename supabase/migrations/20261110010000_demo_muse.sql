-- The view-only demo login (20261110000000_demo_viewer.sql) can try Muse: 10 uses a day in all,
-- shared by everyone using the demo, instead of a student's per-feature limits. The shared daily
-- budget still applies. Uses are recorded under the demo login's own id, never the shown student's.
--
-- To change the number: update private.muse_settings set demo_daily_uses = 20;

alter table private.muse_settings add column if not exists demo_daily_uses integer not null default 10
  check (demo_daily_uses >= 0);

-- Is this account a demo login?
create or replace function private.is_demo_login(id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where u.id = is_demo_login.id and u.raw_app_meta_data ? 'demo_of')
$$;
revoke execute on function private.is_demo_login(uuid) from public, anon, authenticated;

-- The pre-request now also keeps the demo login's own id, as demo_login, for muse_uses_left
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
  claims := jsonb_set(claims, '{demo_login}', to_jsonb(claims ->> 'sub'));
  perform set_config('request.jwt.claims', jsonb_set(claims, '{sub}', to_jsonb(target))::text, true);
  perform set_config('request.jwt.claim.sub', target, true);
exception when others then
  return;
end;
$$;

-- Same as before for students. A demo login skips the per-feature limit and gets
-- demo_daily_uses a day across every kind.
create or replace function public.claim_muse_use(student uuid, what text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim private.muse_limits%rowtype;
  demo boolean := private.is_demo_login(student);
  allowed integer;
  used integer;
  oldest timestamptz;
  spent integer;
  new_id bigint;
begin
  select * into lim from private.muse_limits where kind = what;
  if lim.kind is null then
    raise exception 'Unknown Muse use: %', what;
  end if;

  if demo then
    allowed := (select demo_daily_uses from private.muse_settings);
    perform pg_advisory_xact_lock(hashtext('muse:' || student::text || ':demo'));
    select count(*), min(r.created_at) into used, oldest
    from public.ai_requests r
    where r.user_id = student and r.created_at > now() - interval '24 hours';
    if used >= allowed then
      return jsonb_build_object('ok', false, 'reason', 'student', 'retry_at', oldest + interval '24 hours');
    end if;
  else
    allowed := lim.per_user;
    -- One claim at a time per student and limit, then one at a time for the shared budget
    perform pg_advisory_xact_lock(hashtext('muse:' || student::text || ':' || lim.limit_group));
    select count(*), min(r.created_at) into used, oldest
    from public.ai_requests r
    join private.muse_limits l on l.kind = r.kind
    where r.user_id = student and l.limit_group = lim.limit_group and r.created_at > now() - lim.per_window;
    if used >= lim.per_user then
      return jsonb_build_object('ok', false, 'reason', 'student', 'retry_at', oldest + lim.per_window);
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('muse:budget'));
  select coalesce(sum(l.cost_cents), 0) into spent
  from public.ai_requests r
  join private.muse_limits l on l.kind = r.kind
  where r.created_at > now() - interval '24 hours';
  if spent + lim.cost_cents > (select daily_budget_cents from private.muse_settings) then
    return jsonb_build_object('ok', false, 'reason', 'everyone');
  end if;

  insert into public.ai_requests (user_id, kind) values (student, what) returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id, 'left', allowed - used - 1);
end;
$$;

-- For a demo request: the demo's uses left today. Nickname and avatar changes would change the
-- shown student's profile, so those stay at 0.
create or replace function public.muse_uses_left(what text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when demo_login is null then (
      select greatest(0, lim.per_user - (
        select count(*)::integer
        from public.ai_requests r
        join private.muse_limits l on l.kind = r.kind
        where r.user_id = (select auth.uid())
          and l.limit_group = lim.limit_group
          and r.created_at > now() - lim.per_window
      ))
      from private.muse_limits lim
      where lim.kind = what
    )
    when what in ('nickname', 'avatar') then 0
    else greatest(0, (select demo_daily_uses from private.muse_settings) - (
      select count(*)::integer
      from public.ai_requests r
      where r.user_id = demo_login and r.created_at > now() - interval '24 hours'
    ))
  end
  from (
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'demo_login', '')::uuid as demo_login
  ) d
$$;
