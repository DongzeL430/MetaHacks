-- Kicking: the host can remove a member from their session. The student loses the lobby and its
-- chat right away, and can't ask to join that session again; hosting a new session starts fresh.
-- Removals sit out of every student's reach, like connection declines, and go when the lobby
-- closes. Other members only see one fewer person (Realtime announces the deleted row by key alone).


create table private.lobby_removals (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (lobby_id, user_id)
);

create index lobby_removals_user_id_idx on private.lobby_removals (user_id);

revoke all on private.lobby_removals from public, anon, authenticated;


create function public.kick_from_lobby(lobby_id uuid, student uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lobbies%rowtype;
begin
  select * into l from public.lobbies where id = kick_from_lobby.lobby_id and host_id = (select auth.uid());
  if l.id is null then
    raise exception 'Only the host can remove people.' using errcode = 'P0001';
  end if;
  if student = l.host_id then
    raise exception 'You can’t remove yourself. Close the lobby instead.' using errcode = 'P0001';
  end if;

  delete from public.lobby_members m where m.lobby_id = l.id and m.user_id = student and m.role = 'member';
  if found then
    insert into private.lobby_removals (lobby_id, user_id) values (l.id, student) on conflict do nothing;
  end if;
end;
$$;

revoke execute on function public.kick_from_lobby(uuid, uuid) from public, anon;
grant execute on function public.kick_from_lobby(uuid, uuid) to authenticated;


-- Asking to join again: refused once the host removed you from that session
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
  if exists (select 1 from private.lobby_removals r where r.lobby_id = l.id and r.user_id = me) then
    raise exception 'The host removed you from this session.' using errcode = 'P0001';
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
