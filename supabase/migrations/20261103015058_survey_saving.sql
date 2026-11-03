-- Saving the pre-survey: a confidence rating on every course, grades from any grading system,
-- courses Muse couldn't place, the 9 habit questions plus 8 This or That picks, and a last step
-- that puts a finished student into the match pool.


-- Grades --------------------------------------------------------------------------------------
-- Schools grade in different ways: letter grades (some add A+, some fail with E instead of F),
-- pass / no pass, satisfactory / unsatisfactory, credit / no credit, an honors scale, and marks
-- like withdrew, incomplete or audit. Grades stay optional for every course.
-- Postgres can't use a new enum value in the migration that adds it, so nothing below does.

alter type public.letter_grade add value if not exists 'A+' before 'A';
alter type public.letter_grade add value if not exists 'E' after 'F';
alter type public.letter_grade add value if not exists 'NP' after 'P';
alter type public.letter_grade add value if not exists 'S' after 'NP';
alter type public.letter_grade add value if not exists 'U' after 'S';
alter type public.letter_grade add value if not exists 'CR' after 'U';
alter type public.letter_grade add value if not exists 'NC' after 'CR';
alter type public.letter_grade add value if not exists 'H' after 'NC';
alter type public.letter_grade add value if not exists 'HP' after 'H';
alter type public.letter_grade add value if not exists 'LP' after 'HP';
alter type public.letter_grade add value if not exists 'W' after 'LP';
alter type public.letter_grade add value if not exists 'I' after 'W';
alter type public.letter_grade add value if not exists 'AU' after 'I';


-- Courses a student takes or took ------------------------------------------------------------
-- Every course gets a 1 to 5 confidence rating (1 = lost, 5 = could teach it). A course Muse
-- couldn't find at the school is kept under the name the student typed, in custom_name. It stays
-- private: it never goes into the shared course list, is never shown to anyone else, and isn't
-- used for matching. No saved course exists yet, so the new required column needs no default.

alter table public.user_courses
  drop constraint completed_courses_have_a_grade,
  drop constraint user_courses_pkey,
  add column id bigint generated always as identity primary key,
  add column confidence smallint not null check (confidence between 1 and 5),
  add column custom_name text check (
    char_length(custom_name) between 2 and 80 and custom_name = btrim(custom_name)
  ),
  alter column course_id drop not null,
  add constraint user_courses_course_or_custom_name check ((course_id is null) <> (custom_name is null)),
  add constraint user_courses_user_course_key unique (user_id, course_id);

create unique index user_courses_custom_name_key
  on public.user_courses (user_id, lower(custom_name)) where custom_name is not null;

grant insert (custom_name, confidence), update (confidence) on public.user_courses to authenticated;

drop policy "Students manage their own courses" on public.user_courses;
create policy "Students manage their own courses"
  on public.user_courses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      course_id is null
      or exists (select 1 from public.courses where courses.id = user_courses.course_id)
    )
  );

-- Replaces the student's course list in one go, from the Courses page. courses is a JSON array
-- of { code, custom_name, status, confidence, grade }, with either a code or a custom_name.
-- A code missing from the school's list is added to it, which the 15-new-codes limit still caps.
-- Runs with the student's own access, so every rule above still applies.
create function public.save_my_courses(courses jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  c record;
  clean_code text;
  found_id bigint;
begin
  if jsonb_typeof(courses) is distinct from 'array' or jsonb_array_length(courses) > 40 then
    raise exception 'Send a list of up to 40 courses.' using errcode = '22023';
  end if;

  delete from public.user_courses where user_id = (select auth.uid());

  for c in
    select * from jsonb_to_recordset(courses) as x (
      code text, custom_name text, status public.course_status, confidence smallint, grade public.letter_grade
    )
  loop
    if c.code is not null then
      clean_code := regexp_replace(upper(btrim(c.code)), '\s+', ' ', 'g');
      select id into found_id from public.courses
      where university_domain = (select private.my_university())
        and replace(code, ' ', '') = replace(clean_code, ' ', '');
      if found_id is null then
        insert into public.courses (code) values (clean_code) returning id into found_id;
      end if;
      insert into public.user_courses (course_id, status, confidence, grade)
      values (found_id, c.status, c.confidence, c.grade)
      on conflict do nothing;
    else
      insert into public.user_courses (custom_name, status, confidence, grade)
      values (btrim(c.custom_name), c.status, c.confidence, c.grade)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

revoke execute on function public.save_my_courses(jsonb) from public, anon;
grant execute on function public.save_my_courses(jsonb) to authenticated;


-- Survey questions ---------------------------------------------------------------------------
-- Two kinds share the table. 'habit' questions (2 to 4 options) feed the Habits part of
-- matching. 'this_or_that' picks (always 2 options) feed "You agreed on 6 of 8" and, until there
-- are interest tags, the Interests part. Keys and option order match
-- StudBuds/src/dataFiles/SurveySections.ts, which shows them; keep the two the same.
-- category holds the survey page the question is on. The table had no rows.

delete from public.survey_questions;

alter table public.survey_questions
  drop column option_a,
  drop column option_b,
  add column key text not null unique check (key ~ '^[a-z][A-Za-z0-9]{1,39}$'),
  add column kind text not null check (kind in ('habit', 'this_or_that')),
  add column position smallint not null check (position between 1 and 99),
  add column options text[] not null check (
    array_length(options, 1) between 2 and 4 and array_position(options, null) is null
  ),
  -- How matching compares two answers. 'ordinal' options run from one end to the other, so
  -- neighbors count as close. 'nominal' options are just different.
  add column scale text not null default 'nominal' check (scale in ('nominal', 'ordinal')),
  -- An option like "Either works" that fits any answer (numbered from 1), or null
  add column flexible_option smallint,
  add constraint flexible_option_exists check (flexible_option between 1 and array_length(options, 1)),
  add constraint this_or_that_has_two_options check (kind <> 'this_or_that' or array_length(options, 1) = 2);

-- An answer is the option's number, from 1. The table had no rows.
alter table public.survey_answers
  drop constraint survey_answers_choice_check,
  alter column choice type smallint using (case choice when 'a' then 1 when 'b' then 2 end),
  add constraint survey_answers_choice_check check (choice between 1 and 4);

-- The question check runs with the student's own access, so it only finds approved questions.
drop policy "Students answer approved questions" on public.survey_answers;
create policy "Students answer approved questions"
  on public.survey_answers for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.survey_questions q
      where q.id = survey_answers.question_id and survey_answers.choice <= array_length(q.options, 1)
    )
  );

insert into public.survey_questions (key, kind, category, position, prompt, options, scale, flexible_option, source, approved) values
  ('sessionFormat', 'habit', 'study-style', 1, 'What does a good study session look like for you?',
    array['Working quietly side by side', 'Talking problems through out loud', 'Quizzing each other', 'A mix, depending on the day'],
    'nominal', 4, 'team', true),
  ('sessionLength', 'habit', 'study-style', 2, 'How long do your sessions usually last?',
    array['Under an hour', '1 to 2 hours', '2 to 3 hours', 'More than 3 hours'],
    'ordinal', null, 'team', true),
  ('whenStuck', 'habit', 'study-style', 3, 'When you get stuck on a problem, what do you do first?',
    array['Keep at it on my own for a while', 'Ask someone right away', 'Look it up or watch a video', 'Skip it and come back later'],
    'nominal', null, 'team', true),
  ('meetingMode', 'habit', 'environment', 4, 'Would you rather meet in person or online?',
    array['In person', 'Online', 'Either works'],
    'nominal', 3, 'team', true),
  ('location', 'habit', 'environment', 5, 'Where do you get the most done?',
    array['Library', 'Café', 'Dorm or home', 'Wherever’s free'],
    'nominal', 4, 'team', true),
  ('noise', 'habit', 'environment', 6, 'How much noise can you work with?',
    array['Total silence', 'Quiet background chatter', 'Music is fine', 'Noise doesn’t bother me'],
    'ordinal', 4, 'team', true),
  ('focus', 'habit', 'goals', 7, 'What are you mostly studying for right now?',
    array['Exams', 'Homework and problem sets', 'Projects', 'Learning something on my own'],
    'nominal', null, 'team', true),
  ('frequency', 'habit', 'goals', 8, 'How often do you want to meet with a partner?',
    array['Once a week', '2 or 3 times a week', 'Almost every day'],
    'ordinal', null, 'team', true),
  ('punctuality', 'habit', 'goals', 9, 'How much does showing up on time matter to you?',
    array['A lot, I plan around it', 'Somewhat, a heads-up is enough', 'Not much, I’m flexible'],
    'ordinal', null, 'team', true),
  ('deadlineStyle', 'this_or_that', 'this-or-that', 10, 'Night before or a week ahead?',
    array['Night before', 'A week ahead'], 'nominal', null, 'team', true),
  ('dayRhythm', 'this_or_that', 'this-or-that', 11, 'Early bird or night owl?',
    array['Early bird', 'Night owl'], 'nominal', null, 'team', true),
  ('practiceStyle', 'this_or_that', 'this-or-that', 12, 'Flashcards or practice problems?',
    array['Flashcards', 'Practice problems'], 'nominal', null, 'team', true),
  ('noteStyle', 'this_or_that', 'this-or-that', 13, 'Handwritten or typed notes?',
    array['Handwritten', 'Typed'], 'nominal', null, 'team', true),
  ('breakStyle', 'this_or_that', 'this-or-that', 14, 'Lots of short breaks or one long break?',
    array['Lots of short breaks', 'One long break'], 'nominal', null, 'team', true),
  ('planStyle', 'this_or_that', 'this-or-that', 15, 'Plan everything or wing it?',
    array['Plan everything', 'Wing it'], 'nominal', null, 'team', true),
  ('petPick', 'this_or_that', 'this-or-that', 16, 'Cats or dogs?',
    array['Cats', 'Dogs'], 'nominal', null, 'team', true),
  ('seatPick', 'this_or_that', 'this-or-that', 17, 'Window seat or aisle seat?',
    array['Window seat', 'Aisle seat'], 'nominal', null, 'team', true);


-- Finishing the survey -----------------------------------------------------------------------
-- Moves the student into the match pool once they have a course, some free time, and an answer
-- to every approved question. Server-side, so the check can't be skipped from the browser.

create function public.finish_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  missing text[] := '{}';
  n integer;
begin
  if me is null then
    raise exception 'Log in first.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.user_courses where user_id = me) then
    missing := missing || 'a course'::text;
  end if;
  if not exists (select 1 from public.availability_slots where user_id = me) then
    missing := missing || 'your free times'::text;
  end if;
  if exists (
    select 1 from public.survey_questions q
    where q.approved
      and not exists (select 1 from public.survey_answers a where a.question_id = q.id and a.user_id = me)
  ) then
    missing := missing || 'an answer to every question'::text;
  end if;

  n := cardinality(missing);
  if n > 0 then
    raise exception 'Before finishing, add %.',
      case when n = 1 then missing[1]
           else array_to_string(missing[1:n - 1], ', ') || ' and ' || missing[n] end
      using errcode = 'P0001';
  end if;

  update public.profiles set onboarding_status = 'onboarded' where id = me;
end;
$$;

revoke execute on function public.finish_onboarding() from public, anon;
grant execute on function public.finish_onboarding() to authenticated;


-- Usage log -----------------------------------------------------------------------------------
-- 'format_courses' for Muse matching typed course names. 'theme' is what generate-theme already
-- logs; without it here, those inserts failed and its daily limit never counted anything.

alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests
  add constraint ai_requests_kind_check
  check (kind in ('read_schedule', 'suggest_courses', 'format_courses', 'theme'));
