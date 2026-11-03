-- My Croft: every student's small farm, a side game on Home (StudBuds/src/dataFiles/Croft.ts has
-- the same rules and numbers; change both together). Every action goes through a function here
-- that checks it on the server's clock, so a croft others visit is always one that was really
-- grown. Visiting follows the lobby rules: the same school community, and nobody blocked.
-- There's no typed text anywhere, so nothing here needs moderating.


-- What can be grown and placed --------------------------------------------------------------------

create table private.croft_items (
  key text primary key,
  kind text not null check (kind in ('crop', 'decoration')),
  grow_minutes integer check (grow_minutes > 0),
  seed_cost integer check (seed_cost > 0),
  sell_price integer check (sell_price > 0),
  price integer check (price > 0),
  constraint croft_crop_numbers check (kind <> 'crop' or (grow_minutes is not null and seed_cost is not null and sell_price is not null)),
  constraint croft_decoration_price check (kind <> 'decoration' or price is not null)
);

insert into private.croft_items (key, kind, grow_minutes, seed_cost, sell_price, price) values
  ('oats', 'crop', 20, 2, 5, null),
  ('kale', 'crop', 45, 3, 8, null),
  ('leeks', 'crop', 90, 5, 14, null),
  ('barley', 'crop', 180, 8, 24, null),
  ('beans', 'crop', 360, 12, 40, null),
  ('flax', 'crop', 720, 18, 65, null),
  ('fence', 'decoration', null, null, null, 10),
  ('herbs', 'decoration', null, null, null, 20),
  ('skep', 'decoration', null, null, null, 25),
  ('lantern', 'decoration', null, null, null, 30),
  ('rowan', 'decoration', null, null, null, 45),
  ('stone', 'decoration', null, null, null, 60),
  ('sheep', 'decoration', null, null, null, 80);


-- Crofts, their tiles, and who helped -------------------------------------------------------------

create table public.crofts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  pennies integer not null default 20 check (pennies between 0 and 1000000),
  created_at timestamptz not null default now()
);

-- 6 columns × 5 rows; index = row * 6 + column
create table public.croft_tiles (
  user_id uuid not null references public.crofts (user_id) on delete cascade,
  idx smallint not null check (idx between 0 and 29),
  ground text not null check (ground in ('grass', 'soil')),
  crop text references private.croft_items (key),
  -- null while a sown seed waits for water
  ready_at timestamptz,
  decoration text references private.croft_items (key),
  primary key (user_id, idx),
  constraint croft_crop_on_soil check (crop is null or ground = 'soil'),
  constraint croft_decoration_on_grass check (decoration is null or ground = 'grass'),
  constraint croft_ready_needs_crop check (ready_at is null or crop is not null)
);

create table public.croft_help (
  id bigint generated always as identity primary key,
  helper_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.crofts (user_id) on delete cascade,
  crop text not null references private.croft_items (key),
  -- One help a day for each croft a student visits (UTC days)
  helped_on date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  constraint croft_help_once_a_day unique (helper_id, owner_id, helped_on),
  constraint croft_help_not_own check (helper_id <> owner_id)
);

create index croft_help_owner_time_idx on public.croft_help (owner_id, created_at desc);

alter table public.crofts enable row level security;
alter table public.croft_tiles enable row level security;
alter table public.croft_help enable row level security;
revoke all on public.crofts, public.croft_tiles, public.croft_help from anon, authenticated;

-- Everything goes through the functions below. The one table students read directly is their
-- own help list, so the owner's screen can show "Cozy Duck watered your oats" live.
grant select on public.croft_help to authenticated;
create policy "Owners see who helped on their croft"
  on public.croft_help for select to authenticated
  using (owner_id = (select auth.uid()));

alter publication supabase_realtime add table public.croft_help;

-- Croft actions count toward a generous daily limit, like other actions
alter table public.action_log drop constraint action_log_kind_check;
alter table public.action_log
  add constraint action_log_kind_check check (kind in ('host_lobby', 'join_request', 'connect', 'croft'));


-- Reading a croft ---------------------------------------------------------------------------------

-- A new croft: the starting pennies and the first row tilled
create function private.ensure_croft(owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.crofts (user_id) values (owner) on conflict do nothing;
  if found then
    insert into public.croft_tiles (user_id, idx, ground)
    select owner, i, case when i < 6 then 'soil' else 'grass' end from generate_series(0, 29) i;
  end if;
end;
$$;

-- Whether the signed-in student may see this croft: their own, or an onboarded student in the
-- same school community that neither has blocked
create function private.can_visit_croft(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select owner = (select auth.uid())
    or (
      private.is_onboarded(owner)
      and private.same_community(private.my_university(), (select university_domain from public.profiles where id = owner))
      and not private.blocked_between((select auth.uid()), owner)
    )
$$;

-- The croft as the game screen shows it (CroftView in Croft.ts). Your own croft if owner is left
-- out. Pennies only for your own.
create function public.croft_view(owner uuid default null)
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
  perform private.ensure_croft(whose);

  return jsonb_build_object(
    'ownerId', whose,
    'ownerName', (select nickname from public.public_profiles where id = whose),
    'isMine', whose = me,
    'pennies', case when whose = me then (select pennies from public.crofts where user_id = whose) end,
    'tiles', (
      select jsonb_agg(jsonb_build_object(
        'index', t.idx, 'ground', t.ground, 'crop', t.crop, 'readyAt', t.ready_at, 'decoration', t.decoration
      ) order by t.idx)
      from public.croft_tiles t where t.user_id = whose
    ),
    'helpers', coalesce((
      select jsonb_agg(jsonb_build_object('helperName', h.nickname, 'crop', h.crop, 'at', h.created_at) order by h.created_at desc)
      from (
        select p.nickname, c.crop, c.created_at
        from public.croft_help c
        join public.public_profiles p on p.id = c.helper_id
        where c.owner_id = whose and not private.blocked_between(me, c.helper_id)
        order by c.created_at desc
        limit 10
      ) h
    ), '[]'::jsonb),
    'canHelpToday', whose <> me and not exists (
      select 1 from public.croft_help
      where helper_id = me and owner_id = whose and helped_on = (now() at time zone 'utc')::date
    )
  );
end;
$$;


-- Playing -----------------------------------------------------------------------------------------

-- One action on your own croft (CroftAction in Croft.ts, except help). Returns the croft after it.
-- Refusals are P0001 with a sentence for the student.
create function public.croft_act(action text, tile integer, item text default null)
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

-- Helping on someone else's croft, once a day per croft: a dry seed starts growing, a growing
-- crop is ready a quarter of its growing time sooner. Returns their croft after it.
create function public.croft_help(owner uuid, tile integer)
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
  perform private.ensure_croft(owner);
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

revoke execute on function private.ensure_croft(uuid) from public, anon, authenticated;
revoke execute on function private.can_visit_croft(uuid) from public, anon, authenticated;
revoke execute on function public.croft_view(uuid) from public, anon;
revoke execute on function public.croft_act(text, integer, text) from public, anon;
revoke execute on function public.croft_help(uuid, integer) from public, anon;
grant execute on function public.croft_view(uuid) to authenticated;
grant execute on function public.croft_act(text, integer, text) to authenticated;
grant execute on function public.croft_help(uuid, integer) to authenticated;
