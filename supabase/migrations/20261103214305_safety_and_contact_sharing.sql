-- Blocking, reporting, and sharing contact details with a connection.
--
-- Blocks and reports were tied to "pairings", which the app never creates, so nobody could block or
-- report anyone. They now go through block_student / report_student, for any student you can see.
-- A block is one-sided and silent, and it also ends what links the two: their connection, their
-- places in each other's sessions, invites between them, and shared contact details.
-- Reports carry a reason and an optional note (up to 300 characters). Only the team reads them.
--
-- Contact sharing: in Connections, a student can share their Discord, Instagram and phone (only
-- what they filled in) with one connection at a time. It ends when the connection does.


-- Blocking ------------------------------------------------------------------------------------------

drop policy "Students block someone they were paired with" on public.blocks;
drop policy "Students report someone they were paired with" on public.reports;
revoke insert on public.blocks, public.reports from authenticated;

alter table public.action_log drop constraint action_log_kind_check;
alter table public.action_log
  add constraint action_log_kind_check check (kind in (
    'host_lobby', 'join_request', 'connect', 'croft', 'kick', 'lobby_invite', 'block', 'report'
  ));

create function public.block_student(person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
begin
  if person is null or person = me or not exists (select 1 from public.profiles where id = person) then
    raise exception 'Pick someone to block.' using errcode = 'P0001';
  end if;
  perform private.count_action('block', 50, 'You’ve blocked a lot of people today. Try again tomorrow.');

  insert into public.blocks (blocker_id, blocked_id) values (me, person) on conflict do nothing;

  -- What linked the two, both ways (contact sharing ends with the connection, by trigger below)
  delete from public.connections c
  where (c.requester_id = me and c.addressee_id = person) or (c.requester_id = person and c.addressee_id = me);
  delete from public.lobby_members m
  using public.lobbies l
  where l.id = m.lobby_id
    and ((l.host_id = me and m.user_id = person) or (l.host_id = person and m.user_id = me));
  delete from public.lobby_invites i
  where (i.inviter_id = me and i.invitee_id = person) or (i.inviter_id = person and i.invitee_id = me);
end;
$$;

create function public.unblock_student(person uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.blocks where blocker_id = (select auth.uid()) and blocked_id = unblock_student.person;
$$;


-- Reporting -----------------------------------------------------------------------------------------

create function public.report_student(person uuid, reason public.report_reason, details text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
  note text := nullif(btrim(coalesce(report_student.details, '')), '');
begin
  if person is null or person = me or not exists (select 1 from public.profiles where id = person) then
    raise exception 'Pick someone to report.' using errcode = 'P0001';
  end if;
  if reason is null then
    raise exception 'Pick a reason.' using errcode = 'P0001';
  end if;
  if char_length(note) > 300 then
    raise exception 'Keep the note to 300 characters.' using errcode = 'P0001';
  end if;
  perform private.count_action('report', 20, 'You’ve sent a lot of reports today. Try again tomorrow.');

  insert into public.reports (reporter_id, reported_id, reason, details) values (me, person, reason, note);
end;
$$;


-- Sharing contact details with a connection -------------------------------------------------------

create table public.contact_grants (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id),
  constraint contact_grant_not_self check (owner_id <> viewer_id)
);
create index contact_grants_viewer_idx on public.contact_grants (viewer_id);
alter table public.contact_grants enable row level security;
revoke all on public.contact_grants from anon, authenticated;

-- A connection ending (removed, or a block) takes its sharing with it, both ways
create function private.end_contact_sharing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.contact_grants g
  where (g.owner_id = old.requester_id and g.viewer_id = old.addressee_id)
     or (g.owner_id = old.addressee_id and g.viewer_id = old.requester_id);
  return old;
end;
$$;
revoke execute on function private.end_contact_sharing() from public, anon, authenticated;
create trigger connections_end_contact_sharing after delete on public.connections
  for each row execute function private.end_contact_sharing();

create function public.set_contact_shared(person uuid, share boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
begin
  if not share then
    delete from public.contact_grants where owner_id = me and viewer_id = person;
    return;
  end if;
  if not exists (
    select 1 from public.connections c
    where c.status = 'connected'
      and ((c.requester_id = me and c.addressee_id = person) or (c.addressee_id = me and c.requester_id = person))
  ) then
    raise exception 'You can only share your contact with your connections.' using errcode = 'P0001';
  end if;
  insert into public.contact_grants (owner_id, viewer_id) values (me, person) on conflict do nothing;
end;
$$;

-- For the Connections window: who you share with, whose details you can see (only connected,
-- not blocked, and only what they filled in), and whether you have anything to share yet
create function public.contact_sharing()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id)
  select case when private.is_onboarded((select id from me)) then jsonb_build_object(
    'sharingWith', coalesce((select jsonb_agg(g.viewer_id) from public.contact_grants g, me where g.owner_id = me.id), '[]'::jsonb),
    'sharedWithMe', coalesce((
      select jsonb_agg(jsonb_build_object('person', p.id, 'discord', p.discord, 'instagram', p.instagram, 'phone', p.phone))
      from public.contact_grants g
      join public.profiles p on p.id = g.owner_id
      cross join me
      where g.viewer_id = me.id
        and not private.blocked_between(me.id, g.owner_id)
        and exists (
          select 1 from public.connections c
          where c.status = 'connected'
            and ((c.requester_id = me.id and c.addressee_id = g.owner_id) or (c.addressee_id = me.id and c.requester_id = g.owner_id))
        )
        and (p.discord is not null or p.instagram is not null or p.phone is not null)
    ), '[]'::jsonb),
    'haveContact', (select p.discord is not null or p.instagram is not null or p.phone is not null from public.profiles p, me where p.id = me.id)
  ) end
$$;


revoke execute on function public.block_student(uuid) from public, anon;
revoke execute on function public.unblock_student(uuid) from public, anon;
revoke execute on function public.report_student(uuid, public.report_reason, text) from public, anon;
revoke execute on function public.set_contact_shared(uuid, boolean) from public, anon;
revoke execute on function public.contact_sharing() from public, anon;
grant execute on function public.block_student(uuid) to authenticated;
grant execute on function public.unblock_student(uuid) to authenticated;
grant execute on function public.report_student(uuid, public.report_reason, text) to authenticated;
grant execute on function public.set_contact_shared(uuid, boolean) to authenticated;
grant execute on function public.contact_sharing() to authenticated;
