-- Tests for migrations/*_survey_saving.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- Students: A and B at Northeastern.

begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b2000000-0000-4000-8000-00000000000b', 'b@northeastern.edu', '{"adult_confirmed": true}');


-- Questions ----------------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.survey_questions where approved and kind = 'habit'),
  9,
  'The 9 habit questions are in'
);
select is(
  (select count(*)::integer from public.survey_questions where approved and kind = 'this_or_that'),
  8,
  'The 8 This or That questions are in'
);
select throws_ok(
  $$insert into public.survey_questions (key, kind, category, position, prompt, options, approved)
    values ('testThree', 'this_or_that', 'test', 99, 'test: three options?', array['One', 'Two', 'Three'], true)$$,
  '23514', null,
  'A This or That question has exactly two options'
);
select throws_ok(
  $$insert into public.survey_questions (key, kind, category, position, prompt, options, flexible_option, approved)
    values ('testFlexible', 'habit', 'test', 99, 'test: flexible option past the end?', array['One', 'Two'], 3, true)$$,
  '23514', null,
  'The "fits any answer" option must be one of the options'
);


-- Student A ----------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select throws_ok(
  $$select public.finish_onboarding()$$,
  'P0001', 'Before finishing, add a course, your free times and an answer to every question.',
  'Finishing with nothing filled in says what is missing'
);

-- Courses
select lives_ok(
  $$select public.save_my_courses('[
    {"code": "cs  2500", "status": "completed", "confidence": 4, "grade": "A+"},
    {"custom_name": "Underwater Basket Weaving", "status": "taking", "confidence": 2}
  ]'::jsonb)$$,
  'A student can save a course by code and one Muse could not place'
);
select is((select count(*)::integer from public.user_courses), 2, 'Both courses are saved');
select ok(
  exists (select 1 from public.courses where code = 'CS 2500'),
  'A new code joins the school''s shared list, cleaned up'
);
select ok(
  not exists (select 1 from public.courses where code ilike '%basket%' or title ilike '%basket%'),
  'A course kept under its typed name never joins the shared list'
);
select lives_ok(
  $$select public.save_my_courses('[
    {"custom_name": "Test E", "status": "completed", "confidence": 3, "grade": "E"},
    {"custom_name": "Test NP", "status": "completed", "confidence": 1, "grade": "NP"},
    {"custom_name": "Test CR", "status": "completed", "confidence": 3, "grade": "CR"},
    {"custom_name": "Test H", "status": "completed", "confidence": 5, "grade": "H"},
    {"custom_name": "Test W", "status": "completed", "confidence": 2, "grade": "W"},
    {"custom_name": "Test AU", "status": "taking", "confidence": 3, "grade": "AU"}
  ]'::jsonb)$$,
  'Grades from other grading systems are accepted'
);
select is((select count(*)::integer from public.user_courses), 6, 'Saving again replaces the old list');
select throws_ok(
  $$select public.save_my_courses('[{"code": "CS<3000", "status": "taking", "confidence": 3}]'::jsonb)$$,
  '23514', null,
  'A code with characters the shared list does not allow is rejected'
);
select is((select count(*)::integer from public.user_courses), 6, 'A rejected save leaves the old list as it was');
select throws_ok(
  $$select public.save_my_courses('[{"custom_name": "Test zero", "status": "taking", "confidence": 0}]'::jsonb)$$,
  '23514', null,
  'Confidence must be 1 to 5'
);
select throws_ok(
  $$insert into public.user_courses (course_id, custom_name, confidence)
    select id, 'Both at once', 3 from public.courses where code = 'CS 2500'$$,
  '23514', null,
  'A course has a code or a typed name, not both'
);
select lives_ok(
  $$select public.save_my_courses('[{"code": "CS 2500", "status": "taking", "confidence": 3}]'::jsonb)$$,
  'A student can save one course'
);

-- Free time and answers
select lives_ok(
  $$insert into public.availability_slots (weekday, starts_at, ends_at) values (1, '09:00', '11:00')$$,
  'A student can add free time'
);
select lives_ok(
  $$insert into public.survey_answers (question_id, choice) select id, 1 from public.survey_questions where approved$$,
  'A student can answer every question'
);
select throws_ok(
  $$update public.survey_answers set choice = 4
    where question_id = (select id from public.survey_questions where key = 'meetingMode')$$,
  '42501', null,
  'An answer past the last option is rejected'
);
select lives_ok($$select public.finish_onboarding()$$, 'A student with everything filled in can finish');
select is(
  (select onboarding_status::text from public.profiles where id = 'a1000000-0000-4000-8000-00000000000a'),
  'onboarded',
  'Finishing puts the student in the match pool'
);

reset role;


-- Student B and signed-out visitors -----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}';

select is(
  (select count(*)::integer from public.public_profiles where id = 'a1000000-0000-4000-8000-00000000000a'),
  1,
  'Once A finishes, a classmate can see A''s public profile'
);

reset role;
set local role anon;

select throws_ok($$select public.finish_onboarding()$$, '42501', null, 'Signed-out visitors cannot finish onboarding');
select throws_ok($$select public.save_my_courses('[]'::jsonb)$$, '42501', null, 'Signed-out visitors cannot save courses');

reset role;

select * from finish();
rollback;
