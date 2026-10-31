-- Tests for migrations/*_user_details.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- Students: A and B at Northeastern, C at MIT.

begin;
create extension if not exists pgtap with schema extensions;

select plan(39);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b2000000-0000-4000-8000-00000000000b', 'b@northeastern.edu', '{"adult_confirmed": true}'),
  ('c3000000-0000-4000-8000-00000000000c', 'c@mit.edu', '{"adult_confirmed": true}');

insert into public.survey_questions (prompt, option_a, option_b, category, source, approved) values
  ('test: Silent library or cafe noise?', 'Silent library', 'Cafe noise', 'studying', 'team', true),
  ('test: unreviewed AI question', 'One', 'Two', 'studying', 'ai', false);

insert into public.interests (slug, label)
select 'test-interest-' || g, 'Test interest ' || g from generate_series(1, 11) as g;

insert into public.accessories (slot, name, image_path, source, approved) values
  ('head', 'test: tiny chef hat', 'accessories/test-chef-hat.png', 'team', true),
  ('face', 'test: unreviewed glasses', 'accessories/test-glasses.png', 'ai', false);

-- Students can't see this question, so remember its id while running as the test owner.
do $$
begin
  perform set_config('test.unapproved_question',
    (select id::text from public.survey_questions where prompt = 'test: unreviewed AI question'), true);
end;
$$;


-- Student A ------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

-- Courses
select lives_ok($$insert into public.courses (code) values ('CS 2500')$$, 'A student can add a course code');

select throws_ok($$insert into public.courses (code) values ('CS2500')$$, '23505', null,
  'The same code without the space counts as a duplicate');
select throws_ok($$insert into public.courses (code) values ('cs 3000')$$, '23514', null,
  'Codes must be uppercase');
select throws_ok($$insert into public.courses (code) values ('CS<b>3000')$$, '23514', null,
  'Codes only allow letters, digits, spaces, dots, dashes, and slashes');
select throws_ok($$insert into public.courses (code, title) values ('CS 3000', 'Anything')$$, '42501', null,
  'Students cannot set a course title');

select lives_ok(
  $$insert into public.courses (code) select 'LIMIT ' || g from generate_series(1, 14) as g$$,
  'A student can add up to 15 courses to the list'
);
select throws_ok($$insert into public.courses (code) values ('LIMIT 15')$$, '23514', null,
  'The 16th new course is rejected');

-- Courses the student takes or took
select lives_ok(
  $$insert into public.user_courses (course_id) select id from public.courses where code = 'CS 2500'$$,
  'A student can add a course they are taking, without a grade'
);
select throws_ok(
  $$insert into public.user_courses (course_id, status) select id, 'completed' from public.courses where code = 'LIMIT 1'$$,
  '23514', null,
  'A completed course needs a grade'
);
select lives_ok(
  $$insert into public.user_courses (course_id, status, grade) select id, 'completed', 'A-' from public.courses where code = 'LIMIT 1'$$,
  'A completed course with a grade is accepted'
);
select throws_ok(
  $$insert into public.user_courses (course_id) select id from public.courses where code = 'CS 2500'$$,
  '23505', null,
  'The same course cannot be added twice'
);
select throws_ok(
  $$insert into public.user_courses (user_id, course_id) select 'b2000000-0000-4000-8000-00000000000b', id from public.courses where code = 'LIMIT 2'$$,
  '42501', null,
  'A student cannot add courses for someone else'
);
select lives_ok(
  $$update public.user_courses set grade = 'B+' where course_id = (select id from public.courses where code = 'CS 2500')$$,
  'A student can update their grade'
);

-- Availability
select lives_ok(
  $$insert into public.availability_slots (weekday, starts_at, ends_at) values (1, '09:00', '11:00')$$,
  'A student can add a free time slot'
);
select throws_ok(
  $$insert into public.availability_slots (weekday, starts_at, ends_at) values (2, '11:00', '09:00')$$,
  '23514', null,
  'A slot must end after it starts'
);
select throws_ok(
  $$insert into public.availability_slots (weekday, starts_at, ends_at) values (8, '09:00', '10:00')$$,
  '23514', null,
  'Weekday must be 1 (Monday) to 7 (Sunday)'
);
select lives_ok(
  $$insert into public.availability_slots (weekday, starts_at, ends_at)
    select 1 + (g % 7), make_time(6 + g / 7, 15, 0), make_time(6 + g / 7, 45, 0) from generate_series(1, 29) as g$$,
  'A student can have up to 30 slots'
);
select throws_ok(
  $$insert into public.availability_slots (weekday, starts_at, ends_at) values (7, '20:00', '21:00')$$,
  '23514', null,
  'The 31st slot is rejected'
);

-- Survey
select is(
  (select count(*)::integer from public.survey_questions where prompt like 'test:%'),
  1,
  'Students only see approved questions'
);
select lives_ok(
  $$insert into public.survey_answers (question_id, choice)
    select id, 'a' from public.survey_questions where prompt = 'test: Silent library or cafe noise?'$$,
  'A student can answer an approved question'
);
select lives_ok(
  $$update public.survey_answers set choice = 'b'
    where question_id = (select id from public.survey_questions where prompt = 'test: Silent library or cafe noise?')$$,
  'A student can change their answer'
);
select throws_ok(
  $$update public.survey_answers set choice = 'c'
    where question_id = (select id from public.survey_questions where prompt = 'test: Silent library or cafe noise?')$$,
  '23514', null,
  'Answers can only be a or b'
);
select throws_ok(
  $$insert into public.survey_answers (question_id, choice)
    values (current_setting('test.unapproved_question')::bigint, 'a')$$,
  '42501', null,
  'A student cannot answer an unapproved question'
);

-- Interests. The typed-in check runs first: once the limit is reached, the limit error wins.
select throws_ok(
  $$insert into public.user_interests (interest_slug) values ('anything-typed-in')$$,
  '23503', null,
  'Only interests from the fixed list can be picked'
);
select lives_ok(
  $$insert into public.user_interests (interest_slug) select 'test-interest-' || g from generate_series(1, 10) as g$$,
  'A student can pick up to 10 interests'
);
select throws_ok(
  $$insert into public.user_interests (interest_slug) values ('test-interest-11')$$,
  '23514', null,
  'The 11th interest is rejected'
);

-- Contact handles
select lives_ok(
  $$update public.profiles set instagram = 'sleepy.reads', discord = 'sleepy_reads', phone = '+16175550100'
    where id = 'a1000000-0000-4000-8000-00000000000a'$$,
  'A student can save contact handles'
);
select throws_ok(
  $$update public.profiles set instagram = '@sleepy' where id = 'a1000000-0000-4000-8000-00000000000a'$$,
  '23514', null,
  'Handles are stored without the @'
);
select throws_ok(
  $$update public.profiles set phone = '617-555-0100' where id = 'a1000000-0000-4000-8000-00000000000a'$$,
  '23514', null,
  'Phone numbers use the +16175550100 format'
);

-- Accessories
select is(
  (select count(*)::integer from public.accessories where name like 'test:%'),
  1,
  'Students only see approved accessories'
);
select throws_ok(
  $$insert into public.user_accessories (user_id, accessory_id)
    select 'a1000000-0000-4000-8000-00000000000a', id from public.accessories where name = 'test: tiny chef hat'$$,
  '42501', null,
  'Students cannot unlock accessories themselves'
);

reset role;


-- Other students -------------------------------------------------------------------------

insert into public.user_accessories (user_id, accessory_id)
select 'a1000000-0000-4000-8000-00000000000a', id from public.accessories where name = 'test: tiny chef hat';

do $$
begin
  perform set_config('test.cs2500',
    (select id::text from public.courses where code = 'CS 2500' and university_domain = 'northeastern.edu'), true);
end;
$$;

set local role authenticated;
set local request.jwt.claims to '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}';

select is(
  (select count(*)::integer from public.courses where code = 'CS 2500'),
  1,
  'A classmate at the same school sees the shared course list'
);
select is(
  (
    (select count(*) from public.user_courses)
    + (select count(*) from public.availability_slots)
    + (select count(*) from public.survey_answers)
    + (select count(*) from public.user_interests)
    + (select count(*) from public.user_accessories)
  )::integer,
  0,
  'A classmate sees none of A''s courses, grades, times, answers, interests, or accessories'
);
select is(
  (select instagram from public.profiles where id = 'a1000000-0000-4000-8000-00000000000a'),
  null::text,
  'A classmate cannot read A''s contact handles'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "c3000000-0000-4000-8000-00000000000c", "role": "authenticated"}';

select is(
  (select count(*)::integer from public.courses where university_domain = 'northeastern.edu'),
  0,
  'A student at another school does not see Northeastern courses'
);
select throws_ok(
  $$insert into public.user_courses (course_id) values (current_setting('test.cs2500')::bigint)$$,
  '42501', null,
  'A student at another school cannot add a Northeastern course, even knowing its id'
);

reset role;
set local role anon;

select throws_ok($$select * from public.courses$$, '42501', null, 'Signed-out visitors cannot read courses');

reset role;


-- Account deletion -----------------------------------------------------------------------

delete from auth.users where id = 'a1000000-0000-4000-8000-00000000000a';

select is(
  (
    (select count(*) from public.user_courses where user_id = 'a1000000-0000-4000-8000-00000000000a')
    + (select count(*) from public.availability_slots where user_id = 'a1000000-0000-4000-8000-00000000000a')
    + (select count(*) from public.survey_answers where user_id = 'a1000000-0000-4000-8000-00000000000a')
    + (select count(*) from public.user_interests where user_id = 'a1000000-0000-4000-8000-00000000000a')
    + (select count(*) from public.user_accessories where user_id = 'a1000000-0000-4000-8000-00000000000a')
  )::integer,
  0,
  'Deleting an account removes all of that student''s rows'
);
select ok(
  exists (select 1 from public.courses where code = 'CS 2500' and created_by is null),
  'Courses a deleted student added stay in the shared list'
);

select * from finish();
rollback;
