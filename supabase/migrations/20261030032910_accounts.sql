-- Step 1 of the user data layer: accounts, private profiles, anonymous public profiles.
--
-- Login and password hashes live in Supabase's auth.users. Nothing here stores a password.
-- Other students only ever see public_profiles (nickname, animal, accessories, points).
-- Everything in profiles is visible to its owner and to server code using the service key.

-- Internal helpers live in a schema the Data API does not expose, so they cannot be called over HTTP.
create schema if not exists private;
grant usage on schema private to authenticated, supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;


-- Universities ---------------------------------------------------------------
-- Any .edu domain can sign up. A domain is added here on first sign-up, unnamed,
-- and a display name is filled in by hand later.

create table public.universities (
  domain text primary key check (domain ~ '^[a-z0-9-]+\.edu$'),
  name text check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

insert into public.universities (domain, name)
values ('northeastern.edu', 'Northeastern University');


-- Profiles -------------------------------------------------------------------

create type public.onboarding_status as enum ('new', 'onboarded');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  university_domain text not null references public.universities (domain),
  major text check (char_length(major) between 1 and 80),
  -- The only age data kept: when the user ticked "I am 18 or older".
  adult_confirmed_at timestamptz not null,
  -- Set by server code once onboarding is complete. Until then the account is invisible
  -- to other students and stays out of the match pool, which keeps sign-up-only bots inert.
  onboarding_status public.onboarding_status not null default 'new',
  created_at timestamptz not null default now()
);

create table public.public_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  nickname text not null unique,
  animal text not null default 'penguin' check (animal in ('penguin')),
  -- Slot name to accessory id. The accessory tables arrive in step 2.
  equipped_accessories jsonb not null default '{}'::jsonb
    check (jsonb_typeof(equipped_accessories) = 'object'),
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now()
);

create index profiles_university_domain_idx on public.profiles (university_domain);


-- Helpers ----------------------------------------------------------------------

-- Returns the school domain for a .edu email, or null for anything else.
-- Subdomains are reduced to the school: a@cs.stanford.edu -> stanford.edu.
create function private.edu_domain(email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select substring(d from '([a-z0-9-]+\.edu)$')
  from (select lower(substring(email from '@([^@]+)$')) as d) as parts
  where d ~ '^([a-z0-9-]+\.)+edu$'
$$;

create function private.generate_nickname(animal text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- Kept kind and neutral: nothing about looks, identity, or anything a person could take badly.
  adjectives constant text[] := array[
    'Sleepy', 'Caffeinated', 'Curious', 'Focused', 'Chill', 'Cozy', 'Brave', 'Quiet',
    'Lucky', 'Sunny', 'Snacky', 'Patient', 'Clever', 'Jolly', 'Calm', 'Speedy',
    'Dizzy', 'Thoughtful', 'Bouncy', 'Plucky', 'Steady', 'Merry', 'Peppy', 'Breezy',
    'Mellow', 'Zesty', 'Studious', 'Wandering', 'Hopeful', 'Cheerful', 'Gentle', 'Daring',
    'Busy', 'Puzzled', 'Toasty', 'Frosty', 'Humming', 'Doodling', 'Determined', 'Nimble'
  ];
  max_number integer := 99;
  candidate text;
begin
  for attempt in 1..50 loop
    -- Two-digit numbers read better; widen the range only if the short ones run out.
    if attempt > 20 then
      max_number := 9999;
    end if;

    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::integer]
      || ' ' || initcap(animal)
      || ' ' || (1 + floor(random() * max_number))::integer;

    if not exists (select 1 from public.public_profiles where nickname = candidate) then
      return candidate;
    end if;
  end loop;

  raise exception 'Could not generate a unique nickname';
end;
$$;

-- Used by the public_profiles read policy. security definer lets it check onboarding
-- status without giving other users read access to the profiles table.
create function private.is_onboarded(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = user_id and onboarding_status = 'onboarded'
  )
$$;


-- Sign-up gate ---------------------------------------------------------------
-- Supabase Auth calls this before saving a new user (Authentication > Hooks >
-- Before User Created). Returning an error object rejects the sign-up with that message.
-- The 18+ flag arrives from the sign-up call as options.data.adult_confirmed.

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if private.edu_domain(event->'user'->>'email') is null then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'Please sign up with your school email address (ending in .edu).'
    ));
  end if;

  if event->'user'->'user_metadata'->>'adult_confirmed' is distinct from 'true' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'You need to confirm that you are 18 or older.'
    ));
  end if;

  return '{}'::jsonb;
end;
$$;


-- New users ------------------------------------------------------------------
-- Repeats the hook's checks so users created any other way (admin API, SQL) meet the
-- same rules, then creates both profile rows.

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
begin
  v_domain := private.edu_domain(new.email);

  if v_domain is null then
    raise exception 'Only .edu email addresses can sign up';
  end if;

  if new.raw_user_meta_data->>'adult_confirmed' is distinct from 'true' then
    raise exception 'The 18+ confirmation is required';
  end if;

  insert into public.universities (domain) values (v_domain)
  on conflict (domain) do nothing;

  insert into public.profiles (id, university_domain, adult_confirmed_at)
  values (new.id, v_domain, now());

  insert into public.public_profiles (id, nickname)
  values (new.id, private.generate_nickname('penguin'));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();


-- Email changes ----------------------------------------------------------------
-- Without this, a user could sign up with .edu and then switch to any address.
-- Supabase stores a requested change in email_change and moves it into email once confirmed,
-- so the request is rejected early and the university follows the confirmed address.

create function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
begin
  if new.email_change is distinct from old.email_change
     and coalesce(new.email_change, '') <> ''
     and private.edu_domain(new.email_change) is null then
    raise exception 'Your email must stay a .edu address';
  end if;

  if new.email is distinct from old.email then
    v_domain := private.edu_domain(new.email);
    if v_domain is null then
      raise exception 'Your email must stay a .edu address';
    end if;

    insert into public.universities (domain) values (v_domain)
    on conflict (domain) do nothing;

    update public.profiles set university_domain = v_domain where id = new.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_email_change
  before update of email, email_change on auth.users
  for each row execute function private.handle_user_email_change();


-- Access rules ---------------------------------------------------------------
-- Table grants say which columns a role may touch; row level security says which rows.
-- Signed-out visitors get nothing. Server code uses the service key, which bypasses both.

alter table public.universities enable row level security;
alter table public.profiles enable row level security;
alter table public.public_profiles enable row level security;

revoke all on public.universities, public.profiles, public.public_profiles from anon, authenticated;

grant select on public.universities to authenticated;
grant select on public.profiles to authenticated;
grant update (major) on public.profiles to authenticated;
grant select on public.public_profiles to authenticated;

create policy "Signed-in users can read universities"
  on public.universities for select
  to authenticated
  using (true);

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can see their own and onboarded public profiles"
  on public.public_profiles for select
  to authenticated
  using ((select auth.uid()) = id or private.is_onboarded(id));


-- Function permissions -------------------------------------------------------
-- Postgres lets everyone execute new functions by default; narrow that to who needs each one.

revoke execute on function private.edu_domain(text) from public, anon, authenticated;
revoke execute on function private.generate_nickname(text) from public, anon, authenticated;
revoke execute on function private.is_onboarded(uuid) from public, anon;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
revoke execute on function private.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;

grant execute on function private.is_onboarded(uuid) to authenticated;
grant execute on function private.edu_domain(text) to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
