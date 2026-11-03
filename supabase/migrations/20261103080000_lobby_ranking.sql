-- Lobby ranking: Study Lobbies lists first the sessions whose hosts fit the student best, with a
-- few short reasons. The design's weights:
--   study needs and expertise 40%: the session is for a course the student has, and the two of
--     them rated it differently (one can help the other), using ratings only this function sees
--   study habits 30%: how close their 9 habit answers are
--   This or That 10%: how many quick picks they agree on
--   history 20%: already connected (until Vibe Check exists)
-- Identity is never an input: no school, major, year or grade. The student only gets each
-- lobby's place in the list and the reasons, never a score or anyone's ratings or answers.


-- The course a session is for ---------------------------------------------------------------------
-- Set when the session is hosted: here for free when the subject names a course ("CS 2201",
-- "CS 2201 · Data Structures", "Data Structures"), or by Muse Spark (the link-session Edge
-- Function) for a free-form subject like "orgo midterm cram".

alter table public.lobbies add column course_id bigint references public.courses (id) on delete set null;

-- The school's course a subject names, preferring the host's own courses, or null
create function private.course_for_subject(school text, host uuid, subject text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  with wanted as (
    select
      lower(btrim(subject)) as text,
      case when subject ~ '^\s*[A-Za-z&]{2,6}[-\s]*[0-9]{2,5}[A-Za-z]?([^A-Za-z0-9].*)?$'
        then upper(regexp_replace(subject, '^\s*([A-Za-z&]{2,6})[-\s]*([0-9]{2,5}[A-Za-z]?).*$', '\1\2'))
      end as code
  )
  select c.id
  from public.courses c, wanted w
  where c.university_domain = school
    and (
      replace(upper(c.code), ' ', '') = w.code
      or lower(c.code) = w.text
      or lower(c.title) = w.text
      or lower(c.code || ' · ' || c.title) = w.text
    )
  order by exists (select 1 from public.user_courses uc where uc.user_id = host and uc.course_id = c.id) desc, c.id
  limit 1
$$;

revoke execute on function private.course_for_subject(text, uuid, text) from public, anon, authenticated;

create or replace function public.host_lobby(
  lobby_id uuid, subject text, max_size integer, location text, weekday integer, starts_at time, ends_at time
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
begin
  if exists (select 1 from public.lobbies where host_id = me) then
    raise exception 'You already host a session. Close it to host another.' using errcode = 'P0001';
  end if;
  perform private.count_action('host_lobby', 10, 'You’ve hosted a lot of sessions today. Try again tomorrow.');

  insert into public.lobbies (id, university_domain, host_id, subject, max_size, location, weekday, starts_at, ends_at, course_id)
  values (
    host_lobby.lobby_id, private.my_university(), me, btrim(host_lobby.subject), host_lobby.max_size,
    btrim(host_lobby.location), host_lobby.weekday, host_lobby.starts_at, host_lobby.ends_at,
    private.course_for_subject(private.my_university(), me, host_lobby.subject)
  );
  insert into public.lobby_members (lobby_id, user_id, role) values (host_lobby.lobby_id, me, 'member');
  return host_lobby.lobby_id;
end;
$$;


-- The ranking -------------------------------------------------------------------------------------

create function public.lobby_matches()
returns table (lobby_id uuid, place integer, reasons text[])
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id, private.my_university() as school
  ),
  -- The same lobbies the student can see, minus their own
  visible as (
    select l.id, l.host_id, l.course_id, l.subject, l.created_at
    from public.lobbies l, me
    where private.is_onboarded(me.id)
      and private.same_community(l.university_domain, me.school)
      and not private.blocked_between(me.id, l.host_id)
      and l.host_id <> me.id
  ),
  -- The student's own row for the session's course (by link, or by name for an unlinked
  -- subject), and the host's rating of it
  needs as (
    select v.id, mine.confidence as my_rating, mine.status as my_status, theirs.confidence as host_rating
    from visible v
    cross join me
    left join lateral (
      select uc.confidence, uc.status
      from public.user_courses uc
      left join public.courses c on c.id = uc.course_id
      where uc.user_id = me.id
        and (
          (v.course_id is not null and uc.course_id = v.course_id)
          or (v.course_id is null and lower(v.subject) in (
            lower(uc.custom_name), lower(c.code), lower(c.title), lower(c.code || ' · ' || c.title)
          ))
        )
      order by uc.confidence
      limit 1
    ) mine on true
    left join lateral (
      select uc.confidence
      from public.user_courses uc
      where uc.user_id = v.host_id and v.course_id is not null and uc.course_id = v.course_id
      limit 1
    ) theirs on true
  ),
  -- Each question both answered, scored 0 to 1: the same answer, or a flexible one ("Either
  -- works", "Both", "No preference"), is 1; on an ordered scale, neighbors are partly alike
  answer_pairs as (
    select
      v.id,
      q.kind,
      case
        when a.choice = b.choice then 1.0
        when a.choice = any (q.flexible_options) or b.choice = any (q.flexible_options) then 1.0
        when q.scale = 'ordinal' then
          1.0 - abs(a.choice - b.choice)::numeric
            / greatest(1, array_length(q.options, 1) - cardinality(q.flexible_options) - 1)
        else 0.0
      end as alike,
      a.choice = b.choice as same
    from visible v
    cross join me
    join public.survey_answers a on a.user_id = me.id
    join public.survey_questions q on q.id = a.question_id
    join public.survey_answers b on b.user_id = v.host_id and b.question_id = a.question_id
  ),
  alike as (
    select
      id,
      avg(alike) filter (where kind = 'habit') as habits,
      count(*) filter (where kind = 'habit') as habits_compared,
      avg(alike) filter (where kind = 'this_or_that') as picks,
      count(*) filter (where kind = 'this_or_that') as picks_compared,
      count(*) filter (where kind = 'this_or_that' and same) as picks_agreed
    from answer_pairs
    group by id
  ),
  scored as (
    select
      v.id,
      v.created_at,
      n.my_rating,
      n.my_status,
      a.habits,
      a.habits_compared,
      a.picks_compared,
      a.picks_agreed,
      exists (
        select 1 from public.connections c, me
        where c.status = 'connected'
          and ((c.requester_id = me.id and c.addressee_id = v.host_id) or (c.addressee_id = me.id and c.requester_id = v.host_id))
      ) as connected,
      -- Needs: 0.6 for a course they have, up to 1 when their ratings differ most; an unanswered
      -- part counts as halfway, so a missing answer neither helps nor hurts
      40 * (case when n.my_rating is null then 0
                 else 0.6 + 0.4 * coalesce(abs(n.host_rating - n.my_rating) / 4.0, 0.5) end)
        + 30 * coalesce(a.habits, 0.5)
        + 10 * coalesce(a.picks, 0.5) as partial_score
    from visible v
    join needs n on n.id = v.id
    left join alike a on a.id = v.id
  )
  select
    s.id,
    (row_number() over (order by s.partial_score + 20 * s.connected::integer desc, s.created_at desc))::integer,
    array_remove(array[
      case
        when s.my_rating <= 2 then 'Covers a course you want help with'
        when s.my_status = 'taking' then 'Covers a course you’re taking'
        when s.my_rating is not null then 'Covers a course you’ve taken'
      end,
      case when s.habits_compared >= 5 and s.habits >= 0.75 then 'Similar study habits' end,
      case when s.picks_compared >= 4 and s.picks_agreed * 2 >= s.picks_compared
        then format('You agreed on %s of %s quick picks', s.picks_agreed, s.picks_compared) end,
      case when s.connected then 'You’re connected' end
    ], null)
  from scored s
$$;

revoke execute on function public.lobby_matches() from public, anon;
grant execute on function public.lobby_matches() to authenticated;


-- Muse linking a free-form subject to a course (link-session): 10 a day, well under a cent each

alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests
  add constraint ai_requests_kind_check check (kind in (
    'read_schedule', 'suggest_courses', 'format_courses', 'theme', 'nickname', 'avatar', 'avatar_starter', 'study_spots',
    'theme_music', 'session_course'
  ));

insert into private.muse_limits (kind, limit_group, per_user, per_window, cost_cents)
values ('session_course', 'session_course', 10, interval '1 day', 1);
