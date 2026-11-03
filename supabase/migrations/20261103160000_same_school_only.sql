-- Same school only, again: lobbies, people's cards, join requests, invites and the ranking stay
-- inside the student's school and the schools linked to it (private.same_community), as the
-- design says. 20261103150000_open_lobbies_and_invites opened them to every school; its invites
-- and up to 5 hosted sessions stay. Each function below is that migration's version with the
-- school check put back.
--
-- Also from the audit:
--  - Cards (lobby_people) only for students who finished the pre-survey, like everything else.
--  - Someone you asked to connect with shows only their name and avatar until they accept, so a
--    silent decline no longer leaves you their courses and free times.


-- Lobbies ------------------------------------------------------------------------------------------

drop policy "Students see lobbies" on public.lobbies;

create policy "Students see their school's lobbies"
  on public.lobbies for select to authenticated
  using (
    private.in_my_community(university_domain)
    and private.is_onboarded((select auth.uid()))
    and not private.blocked_between((select auth.uid()), host_id)
  );

create or replace function public.request_join(lobby_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
  l public.lobbies%rowtype;
begin
  select * into l from public.lobbies where id = request_join.lobby_id;
  if l.id is null or not private.in_my_community(l.university_domain) or private.blocked_between(me, l.host_id) then
    raise exception 'That session isn’t available anymore.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lobby_members m where m.lobby_id = l.id and m.user_id = me) then
    return;
  end if;
  if exists (select 1 from public.lobby_removals r where r.lobby_id = l.id and r.user_id = me) then
    raise exception 'You were removed from this session.' using errcode = 'P0001';
  end if;
  if l.locked then
    raise exception 'The host isn’t taking new requests for this session.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.lobby_members m where m.lobby_id = l.id and m.role = 'member') >= l.max_size then
    raise exception 'This session is full.' using errcode = 'P0001';
  end if;
  perform private.count_action('join_request', 40, 'You’ve sent a lot of join requests today. Try again tomorrow.');

  insert into public.lobby_members (lobby_id, user_id, role) values (l.id, me, 'requested');
end;
$$;

-- Cards --------------------------------------------------------------------------------------------

create or replace function public.lobby_people()
returns table (
  id uuid,
  nickname text,
  avatar_path text,
  courses_taken text[],
  seeking_help_with text[],
  shared_free jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id, private.my_university() as school
  ),
  -- Lobbies at the student's school (and linked schools), like the lobbies policy
  visible as (
    select l.id, l.host_id from public.lobbies l, me
    where private.is_onboarded(me.id)
      and private.same_community(l.university_domain, me.school)
      and not private.blocked_between(me.id, l.host_id)
  ),
  -- Who to show, and whether the whole card: people in those lobbies, connections, and anyone
  -- who asked to connect get the whole card. Someone the student asked to connect with shows only
  -- their name and avatar until they accept, so a silent decline gives nothing away.
  people as (
    select m.user_id, true as whole
    from public.lobby_members m
    join visible v on v.id = m.lobby_id
    cross join me
    where m.user_id <> me.id
      and (m.role = 'member' or v.host_id = me.id)
    union all
    select case when c.requester_id = me.id then c.addressee_id else c.requester_id end,
           c.status = 'connected' or c.addressee_id = me.id
    from public.connections c, me
    where private.is_onboarded(me.id)
      and (c.requester_id = me.id or (c.addressee_id = me.id and not private.connection_declined(c.id)))
  ),
  shown as (
    select user_id, bool_or(whole) as whole from people group by user_id
  )
  select
    p.user_id,
    pp.nickname,
    pp.avatar_path,
    case when p.whole then coalesce((
      select array_agg(coalesce(c.code || ' · ' || c.title, c.code) order by c.code)
      from public.user_courses uc join public.courses c on c.id = uc.course_id
      where uc.user_id = p.user_id and uc.status = 'completed'
    ), '{}') else '{}' end,
    case when p.whole then coalesce((
      select array_agg(coalesce(c.code || ' · ' || c.title, c.code) order by c.code)
      from public.user_courses uc join public.courses c on c.id = uc.course_id
      where uc.user_id = p.user_id and uc.confidence <= 2
    ), '{}') else '{}' end,
    case when p.whole then coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', a.weekday,
        'starts_at', greatest(a.starts_at, b.starts_at),
        'ends_at', least(a.ends_at, b.ends_at)
      ) order by a.weekday, greatest(a.starts_at, b.starts_at))
      from public.availability_slots a
      join public.availability_slots b
        on b.weekday = a.weekday and b.starts_at < a.ends_at and a.starts_at < b.ends_at
      cross join me
      where a.user_id = p.user_id and b.user_id = me.id
    ), '[]'::jsonb) else '[]'::jsonb end
  from shown p
  join public.public_profiles pp on pp.id = p.user_id
  cross join me
  where private.is_onboarded(p.user_id) and not private.blocked_between(me.id, p.user_id)
$$;

-- Ranking ------------------------------------------------------------------------------------------

create or replace function public.lobby_matches()
returns table (lobby_id uuid, place integer, reasons text[])
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id, private.my_university() as school
  ),
  visible as (
    select l.id, l.host_id, l.course_id, l.subject, l.created_at
    from public.lobbies l, me
    where private.is_onboarded(me.id)
      and private.same_community(l.university_domain, me.school)
      and not private.blocked_between(me.id, l.host_id)
      and l.host_id <> me.id
  ),
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

-- Invites ------------------------------------------------------------------------------------------

create or replace function public.invite_to_lobby(lobby_id uuid, person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
  l public.lobbies%rowtype;
begin
  select * into l from public.lobbies where id = invite_to_lobby.lobby_id;
  if l.id is null or not private.in_my_community(l.university_domain) or private.blocked_between(me, l.host_id) then
    raise exception 'That session isn’t available anymore.' using errcode = 'P0001';
  end if;
  if not private.is_lobby_member(l.id, me) then
    raise exception 'Only people in this session can invite others.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.connections c
    where c.status = 'connected'
      and ((c.requester_id = me and c.addressee_id = person) or (c.addressee_id = me and c.requester_id = person))
  ) then
    raise exception 'You can only invite your connections.' using errcode = 'P0001';
  end if;
  if not private.is_onboarded(person)
    or not private.same_community(l.university_domain, (select p.university_domain from public.profiles p where p.id = person))
    or private.blocked_between(person, l.host_id)
    or exists (select 1 from public.lobby_removals r where r.lobby_id = l.id and r.user_id = person) then
    raise exception 'They can’t join this session.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lobby_members m where m.lobby_id = l.id and m.user_id = person) then
    raise exception 'They’re already in this session, or asked to join it.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.lobby_members m where m.lobby_id = l.id and m.role = 'member') >= l.max_size then
    raise exception 'This session is full.' using errcode = 'P0001';
  end if;
  perform private.count_action('lobby_invite', 40, 'You’ve sent a lot of invites today. Try again tomorrow.');

  insert into public.lobby_invites (lobby_id, inviter_id, invitee_id)
  values (l.id, me, person)
  on conflict on constraint lobby_invites_lobby_id_invitee_id_key do nothing;
end;
$$;

create or replace function public.answer_invite(lobby_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.onboarded_me();
  inv public.lobby_invites%rowtype;
  l public.lobbies%rowtype;
begin
  select * into inv from public.lobby_invites i where i.lobby_id = answer_invite.lobby_id and i.invitee_id = me;
  if inv.id is null then
    raise exception 'That invite isn’t available anymore.' using errcode = 'P0001';
  end if;
  delete from public.lobby_invites where id = inv.id;
  if not accept then
    return;
  end if;

  select * into l from public.lobbies where id = inv.lobby_id;
  if l.id is null or not private.in_my_community(l.university_domain) or private.blocked_between(me, l.host_id) then
    raise exception 'That session isn’t available anymore.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lobby_members m where m.lobby_id = l.id and m.user_id = me) then
    return;
  end if;
  if exists (select 1 from public.lobby_removals r where r.lobby_id = l.id and r.user_id = me) then
    raise exception 'You were removed from this session.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.lobby_members m where m.lobby_id = l.id and m.role = 'member') >= l.max_size then
    raise exception 'This session is full.' using errcode = 'P0001';
  end if;

  if inv.inviter_id = l.host_id then
    -- The host asked them: they're in, even if the lobby is locked to new requests
    insert into public.lobby_members (lobby_id, user_id, role) values (l.id, me, 'member');
  else
    -- A member asked them: the host still decides, like any join request
    if l.locked then
      raise exception 'The host isn’t taking new requests for this session.' using errcode = 'P0001';
    end if;
    insert into public.lobby_members (lobby_id, user_id, role) values (l.id, me, 'requested');
  end if;
end;
$$;
