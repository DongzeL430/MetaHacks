-- Two helpers for the pre-survey: saving every answer in one go, and the course list Muse
-- matches typed course names against.


-- Replaces the student's answers. answers is a JSON array of { key, choice }, where key is the
-- question's key and choice is the option's number from 1. Unknown keys are skipped. Runs with
-- the student's own access, so only approved questions and real options get through.
-- (A plain upsert can't do this: it would also need permission to change question_id.)
create function public.save_my_answers(answers jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(answers) is distinct from 'array' or jsonb_array_length(answers) > 99 then
    raise exception 'Send a list of up to 99 answers.' using errcode = '22023';
  end if;

  delete from public.survey_answers where user_id = (select auth.uid());

  insert into public.survey_answers (question_id, choice)
  select q.id, a.choice
  from jsonb_to_recordset(answers) as a (key text, choice smallint)
  join public.survey_questions q on q.key = a.key;
end;
$$;

revoke execute on function public.save_my_answers(jsonb) from public, anon;
grant execute on function public.save_my_answers(jsonb) to authenticated;


-- One school's course list for matching typed names: courses saved by students in the same
-- majors first (most of them first), then the rest. Returns codes, titles and a count, never
-- who saved what. Server code only.
create function public.known_courses_for(school text, majors text[])
returns table (code text, title text, classmates integer)
language sql
stable
set search_path = ''
as $$
  select
    c.code,
    c.title,
    (count(distinct p.user_id))::integer as classmates
  from public.courses c
  left join public.user_courses uc on uc.course_id = c.id
  left join public.user_programs p
    on p.user_id = uc.user_id
    and p.kind = 'major'
    and lower(btrim(p.name)) in (select lower(btrim(m)) from unnest(majors) as m)
  where c.university_domain = school
  group by c.id, c.code, c.title
  order by classmates desc, c.title is null, c.code
  limit 500;
$$;

revoke execute on function public.known_courses_for(text, text[]) from public, anon, authenticated;
grant execute on function public.known_courses_for(text, text[]) to service_role;
