-- Crofts across schools, like lobbies, invites and connections already are (20261103170000).
-- Until now a croft could only be visited, watered or listed by students at the same school (or a
-- linked one), so "Visit croft" on a card from another school ended in "That croft isn't open to
-- you." Now any student who finished the survey can visit and help any croft, the village lists
-- crofts from every school, the weekly valley counts everyone, and visitors' names show in the
-- feed whatever their school. Blocks still hide both sides. Each function is its earlier version
-- with only the school check removed. The croft presence rule (croft_topic_allowed) goes through
-- can_visit_croft, so it follows too.

create or replace function private.can_visit_croft(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select owner = (select auth.uid())
    or (
      private.is_onboarded(owner)
      and not private.blocked_between((select auth.uid()), owner)
    )
$$;

create or replace function public.croft_village()
returns table (
  owner_id uuid,
  nickname text,
  avatar_path text,
  dry_seeds integer,
  growing integer,
  ready integer,
  helped_today boolean,
  connected boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id
  ),
  crofts as (
    select
      c.user_id,
      p.nickname,
      p.avatar_path,
      c.active_at,
      (select count(*)::integer from public.croft_tiles t where t.user_id = c.user_id and t.crop is not null and t.ready_at is null) as dry_seeds,
      (select count(*)::integer from public.croft_tiles t where t.user_id = c.user_id and t.ready_at > now()) as growing,
      (select count(*)::integer from public.croft_tiles t where t.user_id = c.user_id and t.ready_at <= now()) as ready,
      exists (
        select 1 from public.croft_help h
        where h.helper_id = me.id and h.owner_id = c.user_id and h.helped_on = (now() at time zone 'utc')::date
      ) as helped_today,
      exists (
        select 1 from public.connections k
        where k.status = 'connected'
          and ((k.requester_id = me.id and k.addressee_id = c.user_id) or (k.addressee_id = me.id and k.requester_id = c.user_id))
      ) as connected
    from public.crofts c
    cross join me
    join public.profiles pr on pr.id = c.user_id
    join public.public_profiles p on p.id = c.user_id
    where private.is_onboarded(me.id)
      and c.user_id <> me.id
      and pr.onboarding_status = 'onboarded'
      and not private.blocked_between(me.id, c.user_id)
  )
  select user_id, nickname, avatar_path, dry_seeds, growing, ready, helped_today, connected
  from crofts
  order by (dry_seeds > 0 and not helped_today) desc, connected desc, active_at desc
  limit 60
$$;

create or replace function public.croft_valley()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with neighbors as (
    select p.id from public.profiles p
  )
  select case when private.is_onboarded((select auth.uid())) then jsonb_build_object(
    'harvests', (
      select count(*) from public.croft_harvests h join neighbors n on n.id = h.user_id
      where h.harvested_at >= date_trunc('week', now())
    ),
    'helps', (
      select count(*) from public.croft_help h join neighbors n on n.id = h.owner_id
      where h.created_at >= date_trunc('week', now())
    ),
    'crofts', (select count(*) from public.crofts c join neighbors n on n.id = c.user_id)
  ) end
$$;

create or replace function public.croft_names(ids uuid[])
returns table (id uuid, nickname text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nickname, p.avatar_path
  from public.public_profiles p
  join public.profiles pr on pr.id = p.id
  where p.id = any (croft_names.ids[1:20])
    and pr.onboarding_status = 'onboarded'
    and not private.blocked_between((select auth.uid()), p.id)
$$;
