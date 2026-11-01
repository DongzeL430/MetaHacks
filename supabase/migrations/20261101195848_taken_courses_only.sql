-- Students now list only courses they are taking or have finished at their own school, so
-- 'planned' and 'transferred' are gone. Postgres can't drop enum values, so the type is rebuilt.
-- No saved course used either value.

alter table public.user_courses
  drop constraint completed_courses_have_a_grade,
  alter column status drop default;

alter type public.course_status rename to course_status_old;
create type public.course_status as enum ('taking', 'completed');

alter table public.user_courses
  alter column status type public.course_status using status::text::public.course_status,
  alter column status set default 'taking',
  add constraint completed_courses_have_a_grade check (status <> 'completed' or grade is not null);

drop type public.course_status_old;


-- Saved searches listed current and planned courses. Find courses now looks only for finished
-- ones, so the old results would add the wrong courses.
delete from public.course_search_cache;
