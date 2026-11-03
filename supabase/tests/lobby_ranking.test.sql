-- Tests for migrations/*_lobby_ranking.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- V is the student looking. H1 hosts a course V rated 1 and H1 rated 5, and answered like V.
-- H2 and H3 host other subjects and answered differently; H3 is connected with V.
-- N is at a school that isn't linked. The live database may hold real sessions too, so checks
-- look only at this test's sessions (ids 10000000-…-00000000000N) and compare their places.

begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'v@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b1000000-0000-4000-8000-00000000000b', 'h1@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b2000000-0000-4000-8000-00000000000b', 'h2@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b3000000-0000-4000-8000-00000000000b', 'h3@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('c1000000-0000-4000-8000-00000000000c', 'n@northeastern.edu', '{"adult_confirmed": true}');
update public.profiles set onboarding_status = 'onboarded'
where id in ('a1000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-00000000000b', 'b2000000-0000-4000-8000-00000000000b',
             'b3000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000c');

insert into public.courses (university_domain, code, title) values ('vanderbilt.edu', 'ZZQ 4321', 'Test Ranking Structures');
insert into public.user_courses (user_id, course_id, status, confidence)
select 'a1000000-0000-4000-8000-00000000000a', id, 'taking', 1 from public.courses where code = 'ZZQ 4321';
insert into public.user_courses (user_id, course_id, status, confidence)
select 'b1000000-0000-4000-8000-00000000000b', id, 'completed', 5 from public.courses where code = 'ZZQ 4321';

-- V and H1 pick the first option everywhere; H2 and H3 the second
insert into public.survey_answers (user_id, question_id, choice)
select u, q.id, 1 from public.survey_questions q,
  unnest(array['a1000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-00000000000b']::uuid[]) u;
insert into public.survey_answers (user_id, question_id, choice)
select u, q.id, 2 from public.survey_questions q,
  unnest(array['b2000000-0000-4000-8000-00000000000b', 'b3000000-0000-4000-8000-00000000000b']::uuid[]) u;

insert into public.connections (requester_id, addressee_id, status, connected_at)
values ('a1000000-0000-4000-8000-00000000000a', 'b3000000-0000-4000-8000-00000000000b', 'connected', now());


-- Linking a subject to a course, for free ------------------------------------------------------

select is(
  private.course_for_subject('vanderbilt.edu', 'b1000000-0000-4000-8000-00000000000b', 'zzq4321 midterm review'),
  (select id from public.courses where code = 'ZZQ 4321'),
  'A subject that starts with a course code links to that course'
);
select is(
  private.course_for_subject('vanderbilt.edu', 'b1000000-0000-4000-8000-00000000000b', 'Test Ranking Structures'),
  (select id from public.courses where code = 'ZZQ 4321'),
  'So does the course''s title'
);
select is(
  private.course_for_subject('vanderbilt.edu', 'b1000000-0000-4000-8000-00000000000b', 'Pottery night'),
  null,
  'A subject that names no course stays unlinked (Muse gets a look at it)'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select public.host_lobby('10000000-0000-4000-8000-000000000001', 'ZZQ 4321 · Test Ranking Structures', 3, 'Library', 2, '14:00', '16:00');
set local request.jwt.claims to '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select public.host_lobby('10000000-0000-4000-8000-000000000002', 'Pottery night', 3, 'Library', 2, '14:00', '16:00');
set local request.jwt.claims to '{"sub": "b3000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select public.host_lobby('10000000-0000-4000-8000-000000000003', 'Art history', 3, 'Library', 2, '14:00', '16:00');
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.host_lobby('10000000-0000-4000-8000-000000000004', 'My own session', 3, 'Library', 2, '14:00', '16:00');

select is(
  (select course_id from public.lobbies where id = '10000000-0000-4000-8000-000000000001'),
  (select id from public.courses where code = 'ZZQ 4321'),
  'Hosting with a course name links the session to it'
);
select throws_ok(
  $$update public.lobbies set course_id = null where id = '10000000-0000-4000-8000-000000000004'$$,
  '42501', null,
  'Students can''t change a session''s course themselves'
);


-- The ranking -------------------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.lobby_matches() where lobby_id::text like '10000000-%'),
  3,
  'V gets a place for every session they can see except their own'
);
select is(
  (select lobby_id from public.lobby_matches() where lobby_id::text like '10000000-%' order by place limit 1),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'The host who fits best comes first: their course, opposite ratings, the same answers'
);
select ok(
  (select reasons from public.lobby_matches() where lobby_id = '10000000-0000-4000-8000-000000000001')
    @> array['Covers a course you want help with', 'Similar study habits', 'You agreed on 8 of 8 quick picks'],
  'With its reasons'
);
select ok(
  (select place from public.lobby_matches() where lobby_id = '10000000-0000-4000-8000-000000000003')
    < (select place from public.lobby_matches() where lobby_id = '10000000-0000-4000-8000-000000000002'),
  'Being connected puts a host above an otherwise equal one'
);
select is(
  (select reasons from public.lobby_matches() where lobby_id = '10000000-0000-4000-8000-000000000003'),
  array['You’re connected'],
  'And says so; different answers give no other reasons'
);
set local request.jwt.claims to '{"sub": "c1000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select is(
  (select count(*)::integer from public.lobby_matches() where lobby_id::text like '10000000-%'),
  0,
  'A school that isn''t linked sees none of them'
);

reset role;
set local role anon;
select throws_ok($$select * from public.lobby_matches()$$, '42501', null, 'Signed-out visitors can''t rank anything');
reset role;

select is(
  (select array_agg(p.parameter_name::text order by p.ordinal_position)
   from information_schema.parameters p
   join information_schema.routines r on r.specific_name = p.specific_name
   where r.routine_schema = 'public' and r.routine_name = 'lobby_matches' and p.parameter_mode = 'OUT'),
  array['lobby_id', 'place', 'reasons'],
  'It only ever returns a place and reasons: no score, ratings or answers'
);

select * from finish();
rollback;
