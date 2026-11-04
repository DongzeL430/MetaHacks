-- Inviting someone back after removing them. Until now, removing someone from a session kept them
-- out for good: the host couldn't invite them again. Now the host can. Accepting the host's invite
-- lets them straight back in and lifts the removal. Everyone else still can't bring them back: a
-- member's invite to someone the host removed is refused, and so is asking to join on their own
-- (until the host has let them back in).
--
-- Both functions are 20261103170000_lobbies_across_schools.sql's versions with only that changed.

create or replace function public.invite_to_lobby(lobby_id uuid, person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
  l public.lobbies%rowtype;
begin
  select * into l from public.lobbies where id = invite_to_lobby.lobby_id;
  if l.id is null or private.blocked_between(me, l.host_id) then
    raise exception 'That session isn’t available anymore.' using errcode = 'P0001';
  end if;
  if not private.is_lobby_member(l.id, me) then
    raise exception 'Only people in this session can invite others.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.connections c
    where c.status = 'connected'
      and ((c.requester_id = me and c.addressee_id = person) or (c.addressee_id = me and c.requester_id = person))
  ) then
    raise exception 'You can only invite your connections.' using errcode = 'P0001';
  end if;
  if not private.is_onboarded(person) or private.blocked_between(person, l.host_id) then
    raise exception 'They can’t join this session.' using errcode = 'P0001';
  end if;
  -- Someone the host removed: only the host can ask them back
  if l.host_id <> me and exists (select 1 from public.lobby_removals r where r.lobby_id = l.id and r.user_id = person) then
    raise exception 'The host removed them from this session, so only the host can invite them back.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lobby_members m where m.lobby_id = l.id and m.user_id = person) then
    raise exception 'They’re already in this session, or asked to join it.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.lobby_members m where m.lobby_id = l.id and m.role = 'member') >= l.max_size then
    raise exception 'This session is full.' using errcode = 'P0001';
  end if;
  perform private.count_action('lobby_invite', 40, 'You’ve sent a lot of invites today. Try again tomorrow.');

  insert into public.lobby_invites (lobby_id, inviter_id, invitee_id)
  values (l.id, me, person)
  on conflict on constraint lobby_invites_lobby_id_invitee_id_key do nothing;
end;
$$;


create or replace function public.answer_invite(lobby_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
  inv public.lobby_invites%rowtype;
  l public.lobbies%rowtype;
begin
  select * into inv from public.lobby_invites i where i.lobby_id = answer_invite.lobby_id and i.invitee_id = me;
  if inv.id is null then
    raise exception 'That invite isn’t available anymore.' using errcode = 'P0001';
  end if;
  delete from public.lobby_invites where id = inv.id;
  if not accept then
    return;
  end if;

  select * into l from public.lobbies where id = inv.lobby_id;
  if l.id is null or private.blocked_between(me, l.host_id) then
    raise exception 'That session isn’t available anymore.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lobby_members m where m.lobby_id = l.id and m.user_id = me) then
    return;
  end if;
  if exists (select 1 from public.lobby_removals r where r.lobby_id = l.id and r.user_id = me) then
    if inv.inviter_id <> l.host_id then
      raise exception 'You were removed from this session.' using errcode = 'P0001';
    end if;
  end if;
  if (select count(*) from public.lobby_members m where m.lobby_id = l.id and m.role = 'member') >= l.max_size then
    raise exception 'This session is full.' using errcode = 'P0001';
  end if;

  if inv.inviter_id = l.host_id then
    -- The host asked them: they're in, even if the lobby is locked to new requests, and even if
    -- the host removed them before (the removal is lifted, so they can ask to join again later)
    delete from public.lobby_removals r where r.lobby_id = l.id and r.user_id = me;
    insert into public.lobby_members (lobby_id, user_id, role) values (l.id, me, 'member');
  else
    -- A member asked them: the host still decides, like any join request
    if l.locked then
      raise exception 'The host isn’t taking new requests for this session.' using errcode = 'P0001';
    end if;
    insert into public.lobby_members (lobby_id, user_id, role) values (l.id, me, 'requested');
  end if;
end;
$$;

