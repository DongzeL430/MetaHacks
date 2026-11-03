-- The students someone has blocked, for the Unblock list in Profile > Account. Only their nickname
-- and avatar, the same as any card shows, and only to the student who blocked them.

create function public.my_blocks()
returns table (id uuid, nickname text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nickname, p.avatar_path
  from public.blocks b
  join public.public_profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc
$$;

revoke execute on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;
