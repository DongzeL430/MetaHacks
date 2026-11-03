-- My Croft with the rest of the school: a village of everyone's crofts, thanking someone who
-- helped, a shared weekly harvest count for the valley, and seeing who's on a croft right now.
-- All of it stays inside the school's community (private.same_community), skips anyone blocked,
-- and uses no typed text. Only students who've played appear in the village: visiting someone
-- who hasn't shows an empty starting croft without making one.


-- New columns and the harvest log -----------------------------------------------------------------

-- When the owner last farmed, to list active crofts first in the village
alter table public.crofts add column active_at timestamptz not null default now();

alter table public.croft_help add column thanked_at timestamptz;

-- Helpers can see their own help too, so a thank-you reaches them live
drop policy "Owners see who helped on their croft" on public.croft_help;
create policy "Owners and helpers see the help"
  on public.croft_help for select to authenticated
  using (owner_id = (select auth.uid()) or helper_id = (select auth.uid()));

-- For the valley's weekly count. Each student's rows older than two weeks go as they harvest.
create table public.croft_harvests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.crofts (user_id) on delete cascade,
  crop text not null references private.croft_items (key),
  harvested_at timestamptz not null default now()
);
create index croft_harvests_time_idx on public.croft_harvests (harvested_at);
create index croft_harvests_user_idx on public.croft_harvests (user_id, harvested_at);
alter table public.croft_harvests enable row level security;
revoke all on public.croft_harvests from anon, authenticated;


-- Reading a croft ---------------------------------------------------------------------------------

create or replace function public.croft_view(owner uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
  whose uuid := coalesce(croft_view.owner, me);
begin
  if not private.can_visit_croft(whose) then
    raise exception 'That croft isn’t open to you.' using errcode = 'P0001';
  end if;
  -- Your own croft starts the first time you open it. Someone else's that doesn't exist yet
  -- shows as a starting croft, without making one, so they don't appear in the village.
  if whose = me then
    perform private.ensure_croft(me);
  end if;

  return jsonb_build_object(
    'ownerId', whose,
    'ownerName', (select nickname from public.public_profiles where id = whose),
    'isMine', whose = me,
    'pennies', case when whose = me then (select pennies from public.crofts where user_id = whose) end,
    'tiles', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'index', t.idx, 'ground', t.ground, 'crop', t.crop, 'readyAt', t.ready_at, 'decoration', t.decoration
        ) order by t.idx)
        from public.croft_tiles t where t.user_id = whose
      ),
      (
        select jsonb_agg(jsonb_build_object(
          'index', i, 'ground', case when i < 6 then 'soil' else 'grass' end, 'crop', null, 'readyAt', null, 'decoration', null
        ) order by i)
        from generate_series(0, 29) i
      )
    ),
    'helpers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'helperName', h.nickname, 'crop', h.crop, 'at', h.created_at, 'thanked', h.thanked_at is not null
      ) order by h.created_at desc)
      from (
        select c.id, p.nickname, c.crop, c.created_at, c.thanked_at
        from public.croft_help c
        join public.public_profiles p on p.id = c.helper_id
        where c.owner_id = whose and not private.blocked_between(me, c.helper_id)
        order by c.created_at desc
        limit 10
      ) h
    ), '[]'::jsonb),
    -- Your own croft: thank-yous you got for helping elsewhere this week
    'thanks', case when whose = me then coalesce((
      select jsonb_agg(jsonb_build_object('ownerName', x.nickname, 'crop', x.crop, 'at', x.thanked_at) order by x.thanked_at desc)
      from (
        select p.nickname, c.crop, c.thanked_at
        from public.croft_help c
        join public.public_profiles p on p.id = c.owner_id
        where c.helper_id = me and c.thanked_at > now() - interval '7 days' and not private.blocked_between(me, c.owner_id)
        order by c.thanked_at desc
        limit 10
      ) x
    ), '[]'::jsonb) else '[]'::jsonb end,
    'canHelpToday', whose <> me and not exists (
      select 1 from public.croft_help
      where helper_id = me and owner_id = whose and helped_on = (now() at time zone 'utc')::date
    )
  );
end;
$$;


-- Playing -----------------------------------------------------------------------------------------

create or replace function public.croft_act(action text, tile integer, item text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
  t public.croft_tiles%rowtype;
  thing private.croft_items%rowtype;
  purse integer;
begin
  if tile is null or tile not between 0 and 29 then
    raise exception 'Pick a tile on your croft.' using errcode = 'P0001';
  end if;
  perform private.ensure_croft(me);
  perform private.count_action('croft', 1000, 'You’ve done a lot of farming today. Your croft will be here tomorrow.');
  update public.crofts set active_at = now() where user_id = me;

  select * into t from public.croft_tiles where user_id = me and idx = tile for update;
  select pennies into purse from public.crofts where user_id = me for update;
  if item is not null then
    select * into thing from private.croft_items where key = item;
  end if;

  case action
    when 'till' then
      if t.ground <> 'grass' or t.decoration is not null then
        raise exception 'Only open grass can be tilled.' using errcode = 'P0001';
      end if;
      update public.croft_tiles set ground = 'soil' where user_id = me and idx = tile;

    when 'sow' then
      if thing.kind is distinct from 'crop' then
        raise exception 'Pick a seed to sow.' using errcode = 'P0001';
      end if;
      if t.ground <> 'soil' or t.crop is not null then
        raise exception 'Seeds go on empty tilled soil.' using errcode = 'P0001';
      end if;
      if purse < thing.seed_cost then
        raise exception 'You need % pennies for that seed.', thing.seed_cost using errcode = 'P0001';
      end if;
      update public.crofts set pennies = pennies - thing.seed_cost where user_id = me;
      update public.croft_tiles set crop = thing.key, ready_at = null where user_id = me and idx = tile;

    when 'water' then
      if t.crop is null then
        raise exception 'There’s nothing to water there.' using errcode = 'P0001';
      end if;
      if t.ready_at is not null then
        raise exception 'That’s already watered and growing.' using errcode = 'P0001';
      end if;
      update public.croft_tiles
      set ready_at = now() + make_interval(mins => (select grow_minutes from private.croft_items where key = t.crop))
      where user_id = me and idx = tile;

    when 'harvest' then
      if t.crop is null or t.ready_at is null or t.ready_at > now() then
        raise exception 'That isn’t ready to harvest yet.' using errcode = 'P0001';
      end if;
      update public.crofts
      set pennies = least(1000000, pennies + (select sell_price from private.croft_items where key = t.crop))
      where user_id = me;
      update public.croft_tiles set crop = null, ready_at = null where user_id = me and idx = tile;
      -- Counted for the valley this week; this student's rows older than two weeks go
      delete from public.croft_harvests where user_id = me and harvested_at < now() - interval '14 days';
      insert into public.croft_harvests (user_id, crop) values (me, t.crop);

    when 'place' then
      if thing.kind is distinct from 'decoration' then
        raise exception 'Pick a decoration to place.' using errcode = 'P0001';
      end if;
      if t.ground <> 'grass' or t.decoration is not null then
        raise exception 'Decorations go on open grass.' using errcode = 'P0001';
      end if;
      if purse < thing.price then
        raise exception 'You need % pennies for that.', thing.price using errcode = 'P0001';
      end if;
      update public.crofts set pennies = pennies - thing.price where user_id = me;
      update public.croft_tiles set decoration = thing.key where user_id = me and idx = tile;

    when 'clear' then
      if t.decoration is null then
        raise exception 'There’s nothing to clear there.' using errcode = 'P0001';
      end if;
      update public.croft_tiles set decoration = null where user_id = me and idx = tile;

    else
      raise exception 'Unknown croft action.' using errcode = '22023';
  end case;

  return public.croft_view(null);
end;
$$;

-- Same as before, without making a croft for an owner who hasn't played: theirs has no crops
create or replace function public.croft_help(owner uuid, tile integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
  t public.croft_tiles%rowtype;
  grow integer;
begin
  if owner = me then
    raise exception 'Helping is for other students’ crofts.' using errcode = 'P0001';
  end if;
  if not private.can_visit_croft(owner) then
    raise exception 'That croft isn’t open to you.' using errcode = 'P0001';
  end if;
  if tile is null or tile not between 0 and 29 then
    raise exception 'Pick a tile on their croft.' using errcode = 'P0001';
  end if;
  perform private.count_action('croft', 1000, 'You’ve done a lot of farming today. Your croft will be here tomorrow.');

  select * into t from public.croft_tiles where user_id = owner and idx = tile for update;
  if t.crop is null or (t.ready_at is not null and t.ready_at <= now()) then
    raise exception 'Pick a crop that’s still growing.' using errcode = 'P0001';
  end if;

  begin
    insert into public.croft_help (helper_id, owner_id, crop) values (me, owner, t.crop);
  exception when unique_violation then
    raise exception 'You’ve already helped on this croft today. Come back tomorrow.' using errcode = 'P0001';
  end;

  select grow_minutes into grow from private.croft_items where key = t.crop;
  update public.croft_tiles
  set ready_at = case
    when ready_at is null then now() + make_interval(mins => grow)
    else greatest(now(), ready_at - make_interval(secs => grow * 60 * 0.25))
  end
  where user_id = owner and idx = tile;

  return public.croft_view(owner);
end;
$$;

-- Thanking someone who helped on your croft, once per help. Returns your croft after it.
create function public.croft_thank(help bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
begin
  perform private.count_action('croft', 1000, 'You’ve done a lot of farming today. Your croft will be here tomorrow.');
  update public.croft_help set thanked_at = now()
  where id = croft_thank.help and owner_id = me and thanked_at is null;
  if not found then
    raise exception 'That’s already been thanked.' using errcode = 'P0001';
  end if;
  return public.croft_view(null);
end;
$$;


-- The village and the valley ----------------------------------------------------------------------

-- Every croft in the school's community except yours, from students who've played: where help is
-- useful first (seeds waiting for water, and you haven't helped today), then your connections,
-- then whoever farmed most recently
create function public.croft_village()
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
    select (select auth.uid()) as id, private.my_university() as school
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
      and private.same_community(me.school, pr.university_domain)
      and not private.blocked_between(me.id, c.user_id)
  )
  select user_id, nickname, avatar_path, dry_seeds, growing, ready, helped_today, connected
  from crofts
  order by (dry_seeds > 0 and not helped_today) desc, connected desc, active_at desc
  limit 60
$$;

-- This week in the school's valley (weeks start Monday, UTC): crops harvested, help given, crofts
create function public.croft_valley()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select private.my_university() as school
  ),
  neighbors as (
    select p.id from public.profiles p, me where private.same_community(me.school, p.university_domain)
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

-- Nicknames for the students on a croft right now ("Visiting now"), for ids the app got from
-- Realtime presence. Only people in your school's community that you haven't blocked.
create function public.croft_names(ids uuid[])
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
    and private.same_community(private.my_university(), pr.university_domain)
    and not private.blocked_between((select auth.uid()), p.id)
$$;


-- "Visiting now": Realtime presence on a private channel per croft ---------------------------------
-- The channel is "croft:<owner id>". Only students who may see that croft can join it. (This is
-- enforced for every client once Realtime's "Allow public access" setting is off; until then the
-- app's own clients still go through it.)

create function private.croft_topic_allowed(topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if topic is null or topic !~ '^croft:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.is_onboarded((select auth.uid())) and private.can_visit_croft(substr(topic, 7)::uuid);
end;
$$;

create policy "Croft visitors see who's there"
  on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'presence' and private.croft_topic_allowed((select realtime.topic())));

create policy "Croft visitors say they're there"
  on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence' and private.croft_topic_allowed((select realtime.topic())));


revoke execute on function public.croft_thank(bigint) from public, anon;
revoke execute on function public.croft_village() from public, anon;
revoke execute on function public.croft_valley() from public, anon;
revoke execute on function public.croft_names(uuid[]) from public, anon;
revoke execute on function private.croft_topic_allowed(text) from public, anon;
grant execute on function public.croft_thank(bigint) to authenticated;
grant execute on function public.croft_village() to authenticated;
grant execute on function public.croft_valley() to authenticated;
grant execute on function public.croft_names(uuid[]) to authenticated;
grant execute on function private.croft_topic_allowed(text) to authenticated;
