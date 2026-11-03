-- Tests for migrations/*_muse_budget.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b2000000-0000-4000-8000-00000000000b', 'b@northeastern.edu', '{"adult_confirmed": true}');

-- Only today's test rows count toward the shared budget here
delete from public.ai_requests where created_at > now() - interval '24 hours';


-- A student's own limit -------------------------------------------------------------------------

select is(
  (select array_agg((public.claim_muse_use('a1000000-0000-4000-8000-00000000000a', 'theme'))->>'ok' order by g)
   from generate_series(1, 4) as g),
  array['true', 'true', 'true', 'false'],
  'Three themes a week, then no more'
);
select is(
  (public.claim_muse_use('a1000000-0000-4000-8000-00000000000a', 'theme'))->>'reason',
  'student',
  'The refusal says it''s the student''s own limit'
);
select ok(
  ((public.claim_muse_use('a1000000-0000-4000-8000-00000000000a', 'theme'))->>'retry_at')::timestamptz > now() + interval '6 days',
  'And when the next one frees up, a week after the first'
);

update public.ai_requests set created_at = now() - interval '8 days'
where user_id = 'a1000000-0000-4000-8000-00000000000a' and kind = 'theme';
select is(
  (public.claim_muse_use('a1000000-0000-4000-8000-00000000000a', 'theme'))->>'ok',
  'true',
  'Themes older than a week no longer count'
);

select is(
  (select array_agg((public.claim_muse_use('a1000000-0000-4000-8000-00000000000a', k))->>'ok' order by k)
   from unnest(array['avatar', 'nickname', 'nickname']) as k),
  array['true', 'true', 'true'],
  'Renames and redraws share one limit of 3'
);
select is(
  (public.claim_muse_use('a1000000-0000-4000-8000-00000000000a', 'avatar'))->>'ok',
  'false',
  'A fourth change of either kind is refused'
);
select is(
  (public.claim_muse_use('b2000000-0000-4000-8000-00000000000b', 'avatar'))->>'ok',
  'true',
  'Another student has their own limit'
);
select throws_ok(
  $$select public.claim_muse_use('a1000000-0000-4000-8000-00000000000a', 'unknown')$$,
  'P0001', null,
  'An unknown kind is an error, not a free pass'
);


-- The shared budget ------------------------------------------------------------------------------

update private.muse_settings set daily_budget_cents = 30;
select is(
  (public.claim_muse_use('b2000000-0000-4000-8000-00000000000b', 'suggest_courses'))->>'reason',
  'everyone',
  'Once everyone''s use would pass the daily budget, Muse pauses for everyone'
);


-- Students -------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select is(public.muse_uses_left('theme'), 2, 'A student sees their themes left this week');
select is(public.identity_changes_left(), 0, 'And their nickname or avatar changes left today');
select throws_ok(
  $$select public.claim_muse_use('a1000000-0000-4000-8000-00000000000a', 'theme')$$,
  '42501', null,
  'Students can''t claim uses themselves'
);

reset role;

select * from finish();
rollback;
