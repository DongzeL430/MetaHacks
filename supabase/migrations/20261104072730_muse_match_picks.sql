-- Muse's picks in Study Lobbies. The ranking (lobby_matches) compares a student with each host.
-- On top of it, Muse Spark looks at the student's best few sessions against what they said they
-- like (when, how long, where, how many people) and puts its best three first, with a reason
-- each. This file gives the pick-matches function what it needs, and nothing more:
--
--   public.match_candidates(viewer, my_school_only): the student's top sessions they could still
--     join, with what's safe to share: subject, time, place, group size, how it fits their free
--     time, and the ranking's own reasons. Never a host, a nickname, a rating or anyone's answers.
--     Plus the student's own survey answers and courses. Server code only.
--   public.match_picks_cache: the last picks per student, so reopening Lobbies is free.
--   'match_picks' in the Muse limits: 10 a day per student, about a cent each.

alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests
  add constraint ai_requests_kind_check check (kind in (
    'read_schedule', 'suggest_courses', 'format_courses', 'theme', 'nickname', 'avatar', 'avatar_starter', 'study_spots',
    'theme_music', 'session_course', 'match_picks'
  ));

insert into private.muse_limits (kind, limit_group, per_user, per_window, cost_cents)
values ('match_picks', 'match_picks', 10, interval '1 day', 1);


create function public.match_candidates(viewer uuid, my_school_only boolean default true, take integer default 8)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  days constant text[] := array['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  school text;
  result jsonb;
begin
  if viewer is null or not private.is_onboarded(viewer) then
    return null;
  end if;
  select p.university_domain into school from public.profiles p where p.id = viewer;

  -- lobby_matches ranks for whoever is signed in; this runs as server code, so say who that is
  -- (for this call only)
  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);

  with ranked as (
    select m.lobby_id, m.place, m.reasons from public.lobby_matches() m
  ),
  open as (
    select
      l.id,
      r.place,
      r.reasons,
      l.subject,
      l.location,
      l.weekday,
      l.starts_at,
      l.ends_at,
      l.max_size,
      (select count(*) from public.lobby_members m where m.lobby_id = l.id and m.role = 'member')::integer as members,
      extract(epoch from (l.ends_at - l.starts_at))::integer / 60 as minutes,
      coalesce((
        select sum(extract(epoch from (least(s.ends_at, l.ends_at) - greatest(s.starts_at, l.starts_at))))::integer / 60
        from public.availability_slots s
        where s.user_id = viewer and s.weekday = l.weekday and s.starts_at < l.ends_at and s.ends_at > l.starts_at
      ), 0) as free_minutes
    from ranked r
    join public.lobbies l on l.id = r.lobby_id
    where not l.locked
      and not exists (select 1 from public.lobby_members m where m.lobby_id = l.id and m.user_id = viewer)
      and not exists (select 1 from public.lobby_removals x where x.lobby_id = l.id and x.user_id = viewer)
      and (not my_school_only or private.same_community(school, l.university_domain))
  ),
  top as (
    select * from open
    where members < max_size
    order by place
    limit greatest(0, least(take, 12))
  )
  select jsonb_build_object(
    'me', jsonb_build_object(
      'wants_help_with', coalesce((
        select jsonb_agg(coalesce(c.code || ' ' || coalesce(c.title, ''), uc.custom_name))
        from public.user_courses uc left join public.courses c on c.id = uc.course_id
        where uc.user_id = viewer and uc.confidence <= 2
      ), '[]'::jsonb),
      'taking', coalesce((
        select jsonb_agg(coalesce(c.code || ' ' || coalesce(c.title, ''), uc.custom_name))
        from public.user_courses uc left join public.courses c on c.id = uc.course_id
        where uc.user_id = viewer and uc.status = 'taking'
      ), '[]'::jsonb),
      'preferences', coalesce((
        select jsonb_agg(jsonb_build_object('question', q.prompt, 'answer', q.options[a.choice]) order by q.position)
        from public.survey_answers a join public.survey_questions q on q.id = a.question_id
        where a.user_id = viewer and q.approved
      ), '[]'::jsonb)
    ),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lobby_id', t.id,
        'place', t.place,
        'subject', t.subject,
        'when', format('%s %s to %s', days[t.weekday], to_char(t.starts_at, 'FMHH12:MI AM'), to_char(t.ends_at, 'FMHH12:MI AM')),
        'minutes', t.minutes,
        'where', t.location,
        'group', format('%s of %s spots taken', t.members, t.max_size),
        'fits_your_free_time', case
          when t.free_minutes >= t.minutes then 'fully'
          when t.free_minutes > 0 then 'partly'
          else 'no'
        end,
        'ranking_reasons', to_jsonb(t.reasons)
      ) order by t.place)
      from top t
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.match_candidates(uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.match_candidates(uuid, boolean, integer) to service_role;


create table public.match_picks_cache (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- A fingerprint of what Muse was shown; the same candidates and preferences reuse the picks
  candidates_key text not null,
  picks jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.match_picks_cache enable row level security;
revoke all on public.match_picks_cache from anon, authenticated;
