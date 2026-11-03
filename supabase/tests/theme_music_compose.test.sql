-- Tests for migrations/*_theme_music_compose.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@vanderbilt.edu', '{"adult_confirmed": true}');

select is(
  (select array_agg((public.claim_muse_use('a1000000-0000-4000-8000-00000000000a', 'theme_music'))->>'ok' order by g)
   from generate_series(1, 6) g),
  array['true', 'true', 'true', 'true', 'true', 'false'],
  'Five pieces composed for older themes a day, then no more'
);
select is(
  (public.claim_muse_use('a1000000-0000-4000-8000-00000000000a', 'theme_music'))->>'reason',
  'student',
  'The refusal says it''s the student''s own limit'
);
select is(
  (public.claim_muse_use('a1000000-0000-4000-8000-00000000000a', 'theme'))->>'ok',
  'true',
  'And it never uses one of the weekly themes'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select is(public.muse_uses_left('theme'), 2, 'The student still has 2 of 3 themes this week');
reset role;

select * from finish();
rollback;
