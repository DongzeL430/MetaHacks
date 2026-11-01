-- Study records keep deleted partners. When a student deletes their account, their row in each
-- shared session stays with their nickname and is marked as deleted, so partners' history still
-- shows who they studied with. Only the nickname is kept, and only in sessions they shared.
-- A deleted student's nickname can be given to a new student later.

-- The nickname is copied in when someone joins a session, so it outlives the account.
alter table public.study_session_members add column nickname text;

update public.study_session_members m
set nickname = p.nickname
from public.public_profiles p
where p.id = m.user_id;

alter table public.study_session_members alter column nickname set not null;

-- Deleting the account now empties user_id instead of deleting the row.
alter table public.study_session_members
  drop constraint study_session_members_pkey,
  drop constraint study_session_members_user_id_fkey;

alter table public.study_session_members
  alter column user_id drop not null,
  add column id bigint generated always as identity primary key,
  add column account_deleted boolean generated always as (user_id is null) stored,
  add constraint study_session_members_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null,
  -- Still one row per person per session. Rows of deleted accounts don't clash with each other.
  add constraint study_session_members_session_user_key unique (session_id, user_id);

create function private.set_member_nickname()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select nickname into new.nickname from public.public_profiles where id = new.user_id;

  if new.nickname is null then
    raise exception 'Only students with a profile can join a session';
  end if;

  return new;
end;
$$;

revoke execute on function private.set_member_nickname() from public, anon, authenticated;

create trigger study_session_members_nickname before insert on public.study_session_members
  for each row execute function private.set_member_nickname();
