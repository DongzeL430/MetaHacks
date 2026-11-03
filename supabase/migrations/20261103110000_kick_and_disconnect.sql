-- Hosts can remove someone from their session (the lobby window's Remove button), and anyone can
-- remove a connection. Someone removed from a session can't ask to join that same session again;
-- other sessions are open to them as before.


-- Removing someone from a session -----------------------------------------------------------------

create table public.lobby_removals (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (lobby_id, user_id)
);
alter table public.lobby_removals enable row level security;
revoke all on public.lobby_removals from anon, authenticated;

alter table public.action_log drop constraint action_log_kind_check;
alter table public.action_log
  add constraint action_log_kind_check check (kind in ('host_lobby', 'join_request', 'connect', 'croft', 'kick'));

create function public.kick_from_lobby(lobby_id uuid, student uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
begin
  if not exists (select 1 from public.lobbies l where l.id = kick_from_lobby.lobby_id and l.host_id = me) then
    raise exception 'Only the host can remove someone from a session.' using errcode = 'P0001';
  end if;
  if student = me then
    raise exception 'You can’t remove yourself. Close the session instead.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.lobby_members m
    where m.lobby_id = kick_from_lobby.lobby_id and m.user_id = student and m.role = 'member'
  ) then
    raise exception 'They’re not in this session.' using errcode = 'P0001';
  end if;
  perform private.count_action('kick', 50, 'You’ve removed a lot of people today. Try again tomorrow.');

  delete from public.lobby_members m where m.lobby_id = kick_from_lobby.lobby_id and m.user_id = student;
  insert into public.lobby_removals (lobby_id, user_id) values (kick_from_lobby.lobby_id, student)
  on conflict do nothing;
end;
$$;

-- Same as before, plus: someone the host removed can't ask to join this session again
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
  if exists (select 1 from public.lobby_removals r where r.lobby_id = l.id and r.user_id = me) then
    raise exception 'You were removed from this session.' using errcode = 'P0001';
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


-- Removing a connection ---------------------------------------------------------------------------
-- Either of the two can remove it. It just ends: no message to the other person, whose
-- Connections list updates live. Sending a new request later works as usual.

create function public.remove_connection(person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
begin
  delete from public.connections c
  where c.status = 'connected'
    and ((c.requester_id = me and c.addressee_id = person) or (c.addressee_id = me and c.requester_id = person));
  if not found then
    raise exception 'You’re not connected with them.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.kick_from_lobby(uuid, uuid) from public, anon;
revoke execute on function public.remove_connection(uuid) from public, anon;
grant execute on function public.kick_from_lobby(uuid, uuid) to authenticated;
grant execute on function public.remove_connection(uuid) to authenticated;
