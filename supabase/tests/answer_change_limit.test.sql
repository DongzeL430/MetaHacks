-- Tests for migrations/*_answer_change_limit.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- A has finished the survey; N is still taking it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4000000-0000-4000-8000-00000000000a', 'a@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b4000000-0000-4000-8000-00000000000b', 'n@vanderbilt.edu', '{"adult_confirmed": true}');
update public.profiles set onboarding_status = 'onboarded' where id = 'a4000000-0000-4000-8000-00000000000a';

create temp table answer_set on commit drop as
  select jsonb_agg(jsonb_build_object('key', key, 'choice', 1)) as answers
  from public.survey_questions where approved;
grant select on answer_set to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub": "a4000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select lives_ok(
  $$select public.save_my_answers((select answers from answer_set)) from generate_series(1, 20)$$,
  'A student who finished the survey can save answers 20 times in a day'
);
select throws_ok(
  $$select public.save_my_answers((select answers from answer_set))$$,
  'P0001', 'You’ve changed your survey answers a lot today. Try again tomorrow.',
  'The 21st save that day is turned down'
);
select throws_ok(
  $$update public.survey_answers set choice = 2$$,
  'P0001', 'You’ve changed your survey answers a lot today. Try again tomorrow.',
  'Writing the table directly counts too'
);

set local request.jwt.claims to '{"sub": "b4000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select lives_ok(
  $$select public.save_my_answers((select answers from answer_set)) from generate_series(1, 25)$$,
  'The survey itself has no limit'
);

set local request.jwt.claims to '{"sub": "a4000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select lives_ok($$select public.delete_my_account()$$, 'A student at the limit can still delete their account');

select * from finish();
rollback;
