-- Study record: who each student studied with, when, where, and which course. Nothing else:
-- no ratings, plans, or notes.
--
-- Only server code writes sessions (the app records the sessions it sets up), so students
-- can't add fake "I studied with X" entries. Students read their own sessions and who else
-- was in them. The record is a history, never a score.


-- Shared row limit -----------------------------------------------------------------------
-- Same check as before, now for owner columns of any type (the member cap below counts by
-- session id, not user id). The value goes in as a quoted literal so Postgres still uses the
-- column's index.

create or replace function private.enforce_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  owner_column text := tg_argv[0];
  max_rows integer := tg_argv[1]::integer;
  existing integer;
begin
  execute format(
    'select count(*) from %I.%I where %I = %L',
    tg_table_schema, tg_table_name, owner_column, to_jsonb(new) ->> owner_column
  ) into existing;

  if existing >= max_rows then
    raise exception 'You can add at most % of these', max_rows
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


-- Sessions -------------------------------------------------------------------------------
-- Planned sessions and the ones that happened share one table; status tells them apart.
-- Location is typed text, so the app should steer students to public places.

create type public.session_status as enum ('planned', 'completed', 'cancelled');

create table public.study_sessions (
  id bigint generated always as identity primary key,
  -- Empty only if the course was later removed from the school's list.
  course_id bigint references public.courses (id) on delete set null,
  location text not null check (
    char_length(btrim(location)) between 2 and 120
    and location !~ '[\r\n\t]'
  ),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.session_status not null default 'planned',
  created_at timestamptz not null default now(),
  constraint session_ends_after_it_starts check (ends_at > starts_at)
);

-- Up to 4 people per session: pairs for now, room for squads later.
create table public.study_session_members (
  session_id bigint not null references public.study_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (session_id, user_id)
);

create index study_session_members_user_id_idx on public.study_session_members (user_id);

create trigger study_session_members_limit before insert on public.study_session_members
  for each row execute function private.enforce_row_limit('session_id', '4');


-- Access rules ---------------------------------------------------------------------------
-- A policy on study_session_members can't look up study_session_members itself (Postgres
-- would loop), so membership is checked by a helper that reads the table directly.

create function private.is_session_member(check_session_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.study_session_members
    where session_id = check_session_id and user_id = (select auth.uid())
  )
$$;

revoke execute on function private.is_session_member(bigint) from public, anon;
grant execute on function private.is_session_member(bigint) to authenticated;

alter table public.study_sessions enable row level security;
alter table public.study_session_members enable row level security;

revoke all on public.study_sessions, public.study_session_members from anon, authenticated;

grant select on public.study_sessions to authenticated;
grant select on public.study_session_members to authenticated;

create policy "Students see sessions they were in"
  on public.study_sessions for select to authenticated
  using (private.is_session_member(id));

create policy "Students see who was in their sessions"
  on public.study_session_members for select to authenticated
  using (private.is_session_member(session_id));
