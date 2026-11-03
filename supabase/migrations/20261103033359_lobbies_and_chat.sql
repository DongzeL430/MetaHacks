-- Study lobbies and their group chat (Home's Lobbies, Sessions and Chat windows).
-- A host posts a session for a subject at one weekly time and place, for 2 to 5 people counting
-- the host. Classmates at the same school ask to join; the host accepts or declines, and can lock
-- the lobby to stop new requests. Members chat live. Closing a lobby deletes it, its member list
-- and every message: chat is temporary, as the design says.
-- Every change goes through the functions below, so the rules hold whatever the browser sends.


-- Tables ---------------------------------------------------------------------------------------

create table public.lobbies (
  id uuid primary key default gen_random_uuid(),
  university_domain text not null references public.universities (domain),
  host_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (char_length(subject) between 2 and 60 and subject = btrim(subject) and subject !~ '[\r\n]'),
  max_size smallint not null check (max_size between 2 and 5),
  -- Typed or picked by the host; the app steers hosts to public places
  location text not null check (char_length(location) between 2 and 80 and location = btrim(location) and location !~ '[\r\n]'),
  -- One block of the week, in the school's local time, like availability_slots
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint lobby_ends_after_it_starts check (ends_at > starts_at)
);

-- One hosted lobby at a time
create unique index lobbies_one_per_host_key on public.lobbies (host_id);
create index lobbies_university_domain_idx on public.lobbies (university_domain);

create type public.lobby_role as enum ('member', 'requested');

-- The host is a member too. The id is the key so a deleted row, which Realtime announces by key
-- alone, doesn't tell other students who left or was declined.
create table public.lobby_members (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.lobby_role not null,
  joined_at timestamptz not null default now(),
  unique (lobby_id, user_id)
);

create index lobby_members_user_id_idx on public.lobby_members (user_id);

create table public.lobby_messages (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index lobby_messages_lobby_time_idx on public.lobby_messages (lobby_id, created_at desc);
create index lobby_messages_sender_time_idx on public.lobby_messages (sender_id, created_at desc);

-- Spam limits on things that aren't AI calls: hosting, join requests, and (Step 4) connection
-- requests. Server code only.
create table public.action_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('host_lobby', 'join_request', 'connect')),
  created_at timestamptz not null default now()
);

create index action_log_user_kind_time_idx on public.action_log (user_id, kind, created_at);


-- Helpers --------------------------------------------------------------------------------------

create function private.blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

create function private.lobby_host(lobby uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select host_id from public.lobbies where id = lobby
$$;

create function private.is_lobby_member(lobby uuid, who uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.lobby_members where lobby_id = lobby and user_id = who and role = 'member')
$$;

/** Counts one action toward today's limit, or refuses with a message once it's reached */
create function private.count_action(what text, per_day integer, message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*) from public.action_log
    where user_id = (select auth.uid()) and kind = what and created_at > now() - interval '24 hours'
  ) >= per_day then
    raise exception '%', message using errcode = 'P0001';
  end if;
  insert into public.action_log (user_id, kind) values ((select auth.uid()), what);
end;
$$;

/** The signed-in student, who must have finished the pre-survey */
create function private.onboarded_me()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or not private.is_onboarded(me) then
    raise exception 'Finish the pre-survey first.' using errcode = '42501';
  end if;
  return me;
end;
$$;

revoke execute on function private.blocked_between(uuid, uuid) from public, anon;
revoke execute on function private.lobby_host(uuid) from public, anon;
revoke execute on function private.is_lobby_member(uuid, uuid) from public, anon;
revoke execute on function private.count_action(text, integer, text) from public, anon, authenticated;
revoke execute on function private.onboarded_me() from public, anon, authenticated;
grant execute on function private.blocked_between(uuid, uuid) to authenticated;
grant execute on function private.lobby_host(uuid) to authenticated;
grant execute on function private.is_lobby_member(uuid, uuid) to authenticated;


-- Reading ----------------------------------------------------------------------------------------
-- Lobbies: onboarded students see their school's, minus any across a block.
-- Members: everyone who sees a lobby sees who's in it; a join request is seen only by the host
-- and the student who sent it. Messages: members only.

alter table public.lobbies enable row level security;
alter table public.lobby_members enable row level security;
alter table public.lobby_messages enable row level security;
alter table public.action_log enable row level security;

revoke all on public.lobbies, public.lobby_members, public.lobby_messages, public.action_log from anon, authenticated;
grant select on public.lobbies, public.lobby_members, public.lobby_messages to authenticated;
grant insert (lobby_id, body) on public.lobby_messages to authenticated;

create policy "Students see their school's lobbies"
  on public.lobbies for select to authenticated
  using (
    university_domain = (select private.my_university())
    and private.is_onboarded((select auth.uid()))
    and not private.blocked_between((select auth.uid()), host_id)
  );

create policy "Students see who's in a lobby, and their own requests"
  on public.lobby_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.lobby_host(lobby_id) = (select auth.uid())
    or (role = 'member' and exists (select 1 from public.lobbies l where l.id = lobby_members.lobby_id))
  );

create policy "Members read their lobby's chat"
  on public.lobby_messages for select to authenticated
  using (private.is_lobby_member(lobby_id, (select auth.uid())));

create policy "Members post in their lobby's chat"
  on public.lobby_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.is_lobby_member(lobby_id, (select auth.uid())));


-- Chat limits --------------------------------------------------------------------------------------
-- The same limits StudBuds/src/utils/LobbyChat.ts checks first (CHAT_LIMITS), and the error
-- texts it reads: "rate_limited" with "retry_after=N" in the details, and "duplicate_message".

create function private.check_chat_pace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_body text;
begin
  new.body := btrim(new.body);

  if (select count(*) from public.lobby_messages
      where sender_id = new.sender_id and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'rate_limited' using detail = 'retry_after=10', errcode = 'P0001';
  end if;
  if (select count(*) from public.lobby_messages
      where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_limited' using detail = 'retry_after=60', errcode = 'P0001';
  end if;

  select body into last_body from public.lobby_messages
  where sender_id = new.sender_id and lobby_id = new.lobby_id and created_at > now() - interval '30 seconds'
  order by created_at desc limit 1;
  if last_body = new.body then
    raise exception 'duplicate_message' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function private.check_chat_pace() from public, anon, authenticated;

create trigger lobby_messages_pace before insert on public.lobby_messages
  for each row execute function private.check_chat_pace();


-- Changing lobbies ---------------------------------------------------------------------------------
-- Messages a student sees are P0001 errors with text written for them.

-- lobby_id comes from the browser so the host's open tab keeps pointing at the same lobby
create function public.host_lobby(
  lobby_id uuid, subject text, max_size integer, location text, weekday integer, starts_at time, ends_at time
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
begin
  if exists (select 1 from public.lobbies where host_id = me) then
    raise exception 'You already host a session. Close it to host another.' using errcode = 'P0001';
  end if;
  perform private.count_action('host_lobby', 10, 'You’ve hosted a lot of sessions today. Try again tomorrow.');

  insert into public.lobbies (id, university_domain, host_id, subject, max_size, location, weekday, starts_at, ends_at)
  values (
    host_lobby.lobby_id, private.my_university(), me, btrim(host_lobby.subject), host_lobby.max_size,
    btrim(host_lobby.location), host_lobby.weekday, host_lobby.starts_at, host_lobby.ends_at
  );
  insert into public.lobby_members (lobby_id, user_id, role) values (host_lobby.lobby_id, me, 'member');
  return host_lobby.lobby_id;
end;
$$;

create function public.close_lobby(lobby_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.lobbies where id = close_lobby.lobby_id and host_id = (select auth.uid());
$$;

create function public.set_lobby_locked(lobby_id uuid, locked boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.lobbies set locked = set_lobby_locked.locked
  where id = set_lobby_locked.lobby_id and host_id = (select auth.uid());
$$;

create function public.request_join(lobby_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
  l public.lobbies%rowtype;
begin
  select * into l from public.lobbies where id = request_join.lobby_id;
  if l.id is null or l.university_domain <> private.my_university() or private.blocked_between(me, l.host_id) then
    raise exception 'That session isn’t available anymore.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lobby_members m where m.lobby_id = l.id and m.user_id = me) then
    return;
  end if;
  if l.locked then
    raise exception 'The host isn’t taking new requests for this session.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.lobby_members m where m.lobby_id = l.id and m.role = 'member') >= l.max_size then
    raise exception 'This session is full.' using errcode = 'P0001';
  end if;
  perform private.count_action('join_request', 40, 'You’ve sent a lot of join requests today. Try again tomorrow.');

  insert into public.lobby_members (lobby_id, user_id, role) values (l.id, me, 'requested');
end;
$$;

create function public.cancel_join(lobby_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.lobby_members
  where lobby_members.lobby_id = cancel_join.lobby_id and user_id = (select auth.uid()) and role = 'requested';
$$;

-- The host can't leave their own lobby; they close it instead
create function public.leave_lobby(lobby_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.lobby_members m
  using public.lobbies l
  where m.lobby_id = leave_lobby.lobby_id and l.id = m.lobby_id
    and m.user_id = (select auth.uid()) and l.host_id <> m.user_id;
$$;

create function public.answer_join(lobby_id uuid, student uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lobbies%rowtype;
begin
  select * into l from public.lobbies where id = answer_join.lobby_id and host_id = (select auth.uid());
  if l.id is null then
    raise exception 'Only the host can answer requests.' using errcode = 'P0001';
  end if;

  if not accept then
    delete from public.lobby_members m where m.lobby_id = l.id and m.user_id = student and m.role = 'requested';
    return;
  end if;
  if (select count(*) from public.lobby_members m where m.lobby_id = l.id and m.role = 'member') >= l.max_size then
    raise exception 'This session is full.' using errcode = 'P0001';
  end if;
  update public.lobby_members m set role = 'member', joined_at = now()
  where m.lobby_id = l.id and m.user_id = student and m.role = 'requested';
end;
$$;

revoke execute on function public.host_lobby(uuid, text, integer, text, integer, time, time) from public, anon;
revoke execute on function public.close_lobby(uuid) from public, anon;
revoke execute on function public.set_lobby_locked(uuid, boolean) from public, anon;
revoke execute on function public.request_join(uuid) from public, anon;
revoke execute on function public.cancel_join(uuid) from public, anon;
revoke execute on function public.leave_lobby(uuid) from public, anon;
revoke execute on function public.answer_join(uuid, uuid, boolean) from public, anon;
grant execute on function public.host_lobby(uuid, text, integer, text, integer, time, time) to authenticated;
grant execute on function public.close_lobby(uuid) to authenticated;
grant execute on function public.set_lobby_locked(uuid, boolean) to authenticated;
grant execute on function public.request_join(uuid) to authenticated;
grant execute on function public.cancel_join(uuid) to authenticated;
grant execute on function public.leave_lobby(uuid) to authenticated;
grant execute on function public.answer_join(uuid, uuid, boolean) to authenticated;


-- People on lobby cards ----------------------------------------------------------------------------
-- What a card shows about someone in a lobby the student can see (or who asked to join theirs):
-- nickname, avatar, course names (never grades or ratings), "looking for help with" (courses they
-- rated 1 or 2), and only the free time that overlaps the student's own. Courses kept under a
-- typed name stay private.

create function public.lobby_people()
returns table (
  id uuid,
  nickname text,
  avatar_path text,
  courses_taken text[],
  seeking_help_with text[],
  shared_free jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id, private.my_university() as school
  ),
  visible as (
    select l.id, l.host_id from public.lobbies l, me
    where l.university_domain = me.school and not private.blocked_between(me.id, l.host_id)
  ),
  people as (
    select distinct m.user_id
    from public.lobby_members m
    join visible v on v.id = m.lobby_id
    cross join me
    where m.user_id <> me.id
      and (m.role = 'member' or v.host_id = me.id)
      and not private.blocked_between(me.id, m.user_id)
  )
  select
    p.user_id,
    pp.nickname,
    pp.avatar_path,
    coalesce((
      select array_agg(coalesce(c.code || ' · ' || c.title, c.code) order by c.code)
      from public.user_courses uc join public.courses c on c.id = uc.course_id
      where uc.user_id = p.user_id and uc.status = 'completed'
    ), '{}'),
    coalesce((
      select array_agg(coalesce(c.code || ' · ' || c.title, c.code) order by c.code)
      from public.user_courses uc join public.courses c on c.id = uc.course_id
      where uc.user_id = p.user_id and uc.confidence <= 2
    ), '{}'),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', a.weekday,
        'starts_at', greatest(a.starts_at, b.starts_at),
        'ends_at', least(a.ends_at, b.ends_at)
      ) order by a.weekday, greatest(a.starts_at, b.starts_at))
      from public.availability_slots a
      join public.availability_slots b
        on b.weekday = a.weekday and b.starts_at < a.ends_at and a.starts_at < b.ends_at
      cross join me
      where a.user_id = p.user_id and b.user_id = me.id
    ), '[]'::jsonb)
  from people p
  join public.public_profiles pp on pp.id = p.user_id
  where private.is_onboarded(p.user_id)
$$;

revoke execute on function public.lobby_people() from public, anon;
grant execute on function public.lobby_people() to authenticated;


-- Realtime ----------------------------------------------------------------------------------------
-- Changes stream to signed-in students, filtered by the read rules above.

alter publication supabase_realtime add table public.lobbies, public.lobby_members, public.lobby_messages;
