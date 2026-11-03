-- This or That picks get two more answers, "Both" and "No preference". In matching both fit any
-- answer, so a question can now have more than one such option and flexible_option becomes the
-- list flexible_options. The new options go at the end, so answers already saved keep their
-- numbers.

alter table public.survey_questions
  drop constraint flexible_option_exists,
  drop constraint this_or_that_has_two_options,
  add column flexible_options smallint[] not null default '{}';

update public.survey_questions
set flexible_options = array[flexible_option]
where flexible_option is not null;

update public.survey_questions
set options = options || array['Both', 'No preference'],
    flexible_options = '{3,4}'
where kind = 'this_or_that';

alter table public.survey_questions
  drop column flexible_option,
  -- Every listed option exists (numbered from 1)
  add constraint flexible_options_exist check (
    flexible_options <@ (case array_length(options, 1) when 2 then '{1,2}' when 3 then '{1,2,3}' else '{1,2,3,4}' end)::smallint[]
  );
