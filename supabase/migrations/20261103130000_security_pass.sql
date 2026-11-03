-- Security pass: closing gaps found while checking the whole database.
--  - Four functions in public exist only in the live database (no migration made them) and
--    nothing uses them: no policy, trigger or app code. Two are trigger bodies and two answer
--    "is the signed-in student the host / a member", so they leaked nothing, but signed-out
--    visitors could call them. Now they can't. Signed-in access is left as it was.
--  - Help on a croft was kept forever; now each croft keeps 30 days of it, like the other logs.

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.is_lobby_host(uuid)', 'public.is_lobby_member(uuid)',
    'public.check_lobby_capacity()', 'public.add_host_as_member()'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
    end if;
  end loop;
end;
$$;

-- The same as before, keeping 30 days of help per croft
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
  -- The help list and the valley only look back a week or so; older help on this croft goes
  delete from public.croft_help where owner_id = owner and created_at < now() - interval '30 days';

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
