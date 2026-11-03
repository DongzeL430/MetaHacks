-- Tests for migrations/*_survey_helpers.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- Students: A and B at Northeastern (both Computer Science majors), C at Northeastern (Biology).

begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b2000000-0000-4000-8000-00000000000b', 'b@northeastern.edu', '{"adult_confirmed": true}'),
  ('c3000000-0000-4000-8000-00000000000c', 'c@northeastern.edu', '{"adult_confirmed": true}');

insert into public.courses (university_domain, code, title, created_by) values
  ('northeastern.edu', 'TEST 1000', 'Test Biology', null),
  ('northeastern.edu', 'TEST 2000', 'Test Programming', null),
  ('northeastern.edu', 'TEST 3000', null, null);

insert into public.user_programs (user_id, kind, position, name) values
  ('a1000000-0000-4000-8000-00000000000a', 'major', 1, 'Computer Science'),
  ('b2000000-0000-4000-8000-00000000000b', 'major', 1, 'computer science '),
  ('c3000000-0000-4000-8000-00000000000c', 'major', 1, 'Biology');

insert into public.user_courses (user_id, course_id, status, confidence)
select u, (select id from public.courses where code = 'TEST 2000'), 'taking', 3
from unnest(array['a1000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-00000000000b']::uuid[]) as u;
insert into public.user_courses (user_id, course_id, status, confidence)
values ('c3000000-0000-4000-8000-00000000000c', (select id from public.courses where code = 'TEST 1000'), 'taking', 3);


-- Course list for Muse (server code) ---------------------------------------------------------

select is(
  (select code from public.known_courses_for('northeastern.edu', array['Computer Science']) limit 1),
  'TEST 2000',
  'Courses saved by classmates in the same major come first'
);
select is(
  (select classmates from public.known_courses_for('northeastern.edu', array['Computer Science']) where code = 'TEST 2000'),
  2,
  'Majors match whatever the capitalization or spacing'
);
select is(
  (select classmates from public.known_courses_for('northeastern.edu', array['Computer Science']) where code = 'TEST 1000'),
  0,
  'A course only students in other majors saved still appears, ranked lower'
);
select is(
  (select count(*)::integer from public.known_courses_for('mit.edu', array['Computer Science']) where code like 'TEST%'),
  0,
  'Only the given school''s courses are listed'
);


-- Answers ------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select throws_ok(
  $$select * from public.known_courses_for('northeastern.edu', array['Computer Science'])$$,
  '42501', null,
  'Students cannot read the course list with classmate counts'
);
select lives_ok(
  $$select public.save_my_answers('[{"key": "sessionFormat", "choice": 2}, {"key": "petPick", "choice": 1}, {"key": "notAQuestion", "choice": 1}]'::jsonb)$$,
  'A student can save answers by question key, and unknown keys are skipped'
);
select is((select count(*)::integer from public.survey_answers), 2, 'Two answers are saved');
select lives_ok(
  $$select public.save_my_answers('[{"key": "sessionFormat", "choice": 4}]'::jsonb)$$,
  'Saving again replaces the old answers'
);
select throws_ok(
  $$select public.save_my_answers('[{"key": "petPick", "choice": 3}]'::jsonb)$$,
  '42501', null,
  'An answer past the last option is rejected'
);

reset role;

select * from finish();
rollback;
