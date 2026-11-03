-- Visits to a croft, for the owner's live chat feed on Home ("Cozy Duck is visiting your croft").
-- Recorded when someone opens another student's croft, at most once a day per visitor, so opening
-- and closing a croft over and over can't flood anyone's feed. Only the owner can read them.

create table public.croft_visits (
  visitor_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.crofts (user_id) on delete cascade,
  visited_on date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  primary key (visitor_id, owner_id, visited_on),
  constraint croft_visit_not_own check (visitor_id <> owner_id)
);
create index croft_visits_owner_idx on public.croft_visits (owner_id, visited_on);

alter table public.croft_visits enable row level security;
revoke all on public.croft_visits from anon, authenticated;
grant select on public.croft_visits to authenticated;
create policy "Owners see who visited their croft"
  on public.croft_visits for select to authenticated
  using (owner_id = (select auth.uid()));

alter publication supabase_realtime add table public.croft_visits;

-- The same croft view as before, now recording the visit
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
  -- A visit shows in the owner's live chat feed, once a day per visitor; a week of them is kept
  if whose <> me and exists (select 1 from public.crofts where user_id = whose) then
    insert into public.croft_visits (visitor_id, owner_id) values (me, whose) on conflict do nothing;
    if found then
      delete from public.croft_visits where owner_id = whose and visited_on < (now() at time zone 'utc')::date - 7;
    end if;
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
