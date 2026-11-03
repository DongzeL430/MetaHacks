-- Linked schools, and connection requests (Home's Connections window).
--
-- Linked schools: a few schools can count as one community, so students there see each other's
-- lobbies, chat and connect. Every school not listed stays on its own, as the design says.
-- Add or remove schools in the SQL editor, for example:
--   insert into private.school_groups values ('northeastern.edu', 'studbuds-team');
--
-- Connections: friend-request style. A student sends a request; the other accepts or declines.
-- A decline is silent: the sender keeps seeing "Requested", and the decline is kept where no
-- student can read it (and it changes nothing the sender's Realtime feed could pick up).


-- Linked schools ---------------------------------------------------------------------------------

create table private.school_groups (
  domain text primary key references public.universities (domain) on delete cascade,
  group_name text not null check (char_length(group_name) between 1 and 40)
);

insert into public.universities (domain) values ('vanderbilt.edu'), ('rit.edu') on conflict (domain) do nothing;
insert into private.school_groups (domain, group_name) values
  ('vanderbilt.edu', 'studbuds-team'),
  ('rit.edu', 'studbuds-team');

create function private.same_community(a text, b text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a = b or exists (
    select 1 from private.school_groups g1
    join private.school_groups g2 on g2.group_name = g1.group_name
    where g1.domain = a and g2.domain = b
  )
$$;

/** The school is the signed-in student's own or one linked to it */
create function private.in_my_community(school text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.same_community(private.my_university(), school)
$$;

revoke execute on function private.same_community(text, text) from public, anon;
revoke execute on function private.in_my_community(text) from public, anon;
grant execute on function private.same_community(text, text) to authenticated;
grant execute on function private.in_my_community(text) to authenticated;

-- Lobbies follow it
drop policy "Students see their school's lobbies" on public.lobbies;
create policy "Students see their school's lobbies"
  on public.lobbies for select to authenticated
  using (
    private.in_my_community(university_domain)
    and private.is_onboarded((select auth.uid()))
    and not private.blocked_between((select auth.uid()), host_id)
  );

create or replace function public.request_join(lobby_id uuid)
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
  if l.id is null or not private.in_my_community(l.university_domain) or private.blocked_between(me, l.host_id) then
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


-- Connections ------------------------------------------------------------------------------------

create table public.connections (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'connected')),
  created_at timestamptz not null default now(),
  connected_at timestamptz,
  constraint cannot_connect_with_yourself check (requester_id <> addressee_id)
);

-- One row per pair, whoever asked
create unique index connections_pair_key
  on public.connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index connections_addressee_idx on public.connections (addressee_id);

-- Declines, out of every student's reach
create table private.connection_declines (
  connection_id bigint primary key references public.connections (id) on delete cascade,
  declined_at timestamptz not null default now()
);

create function private.connection_declined(connection bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.connection_declines where connection_id = connection)
$$;

revoke execute on function private.connection_declined(bigint) from public, anon;
grant execute on function private.connection_declined(bigint) to authenticated;

alter table public.connections enable row level security;
revoke all on public.connections from anon, authenticated;
grant select on public.connections to authenticated;

-- The sender always sees their request (still "Requested" after a decline); the receiver sees it
-- until they decline it
create policy "Students see their own connections"
  on public.connections for select to authenticated
  using (
    requester_id = (select auth.uid())
    or (addressee_id = (select auth.uid()) and not private.connection_declined(id))
  );

create function public.connect_with(person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
  c public.connections%rowtype;
begin
  if person = me then
    raise exception 'That’s you.' using errcode = 'P0001';
  end if;
  if not private.is_onboarded(person)
    or not private.in_my_community((select university_domain from public.profiles where id = person))
    or private.blocked_between(me, person) then
    raise exception 'You can’t connect with this student.' using errcode = 'P0001';
  end if;

  select * into c from public.connections
  where least(requester_id, addressee_id) = least(me, person)
    and greatest(requester_id, addressee_id) = greatest(me, person);

  if c.id is null then
    perform private.count_action('connect', 40, 'You’ve sent a lot of connection requests today. Try again tomorrow.');
    insert into public.connections (requester_id, addressee_id) values (me, person);
  elsif c.status = 'pending' and c.addressee_id = me then
    -- They asked first (even if this student turned it down before), so now both want it
    update public.connections set status = 'connected', connected_at = now() where id = c.id;
    delete from private.connection_declines where connection_id = c.id;
  end if;
end;
$$;

create function public.cancel_connection_request(person uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.connections
  where requester_id = (select auth.uid()) and addressee_id = person and status = 'pending';
$$;

create function public.answer_connection(person uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.connections%rowtype;
begin
  select * into c from public.connections
  where requester_id = person and addressee_id = (select auth.uid()) and status = 'pending'
    and not private.connection_declined(id);
  if c.id is null then
    return;
  end if;
  if accept then
    update public.connections set status = 'connected', connected_at = now() where id = c.id;
  else
    insert into private.connection_declines (connection_id) values (c.id) on conflict do nothing;
  end if;
end;
$$;

revoke execute on function public.connect_with(uuid) from public, anon;
revoke execute on function public.cancel_connection_request(uuid) from public, anon;
revoke execute on function public.answer_connection(uuid, boolean) from public, anon;
grant execute on function public.connect_with(uuid) to authenticated;
grant execute on function public.cancel_connection_request(uuid) to authenticated;
grant execute on function public.answer_connection(uuid, boolean) to authenticated;

alter publication supabase_realtime add table public.connections;


-- People on cards --------------------------------------------------------------------------------
-- Now also everyone the student has a connection (or request) with, and linked schools count.

create or replace function public.lobby_people()
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
    where private.same_community(l.university_domain, me.school) and not private.blocked_between(me.id, l.host_id)
  ),
  people as (
    select m.user_id
    from public.lobby_members m
    join visible v on v.id = m.lobby_id
    cross join me
    where m.user_id <> me.id
      and (m.role = 'member' or v.host_id = me.id)
    union
    select case when c.requester_id = me.id then c.addressee_id else c.requester_id end
    from public.connections c, me
    where c.requester_id = me.id
      or (c.addressee_id = me.id and not private.connection_declined(c.id))
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
  cross join me
  where private.is_onboarded(p.user_id) and not private.blocked_between(me.id, p.user_id)
$$;
