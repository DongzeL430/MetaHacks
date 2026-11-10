-- Tests for migrations/*_demo_muse.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- S is a student, D is a demo login showing S.

begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('a7000000-0000-4000-8000-00000000000a', 's@rit.edu', '{"adult_confirmed": true}', '{}'),
  ('b7000000-0000-4000-8000-00000000000b', 'demo@studbuds-demo.edu', '{"adult_confirmed": true}',
   '{"demo_of": "a7000000-0000-4000-8000-00000000000a"}');
update public.profiles set onboarding_status = 'onboarded' where id = 'a7000000-0000-4000-8000-00000000000a';
-- Room in the shared budget, so only the demo's own limit is tested
update private.muse_settings set daily_budget_cents = 1000000, demo_daily_uses = 10;

-- Ten uses of one kind: more than a student's limit for it, all allowed for the demo
select is(
  (select count(*)::int from generate_series(1, 10) g
   where (public.claim_muse_use('b7000000-0000-4000-8000-00000000000b', 'read_schedule') ->> 'ok')::boolean),
  10,
  'The demo gets 10 uses a day, past the per-feature limit'
);
select is(
  public.claim_muse_use('b7000000-0000-4000-8000-00000000000b', 'theme') ->> 'reason',
  'student',
  'The 11th use, of any kind, is refused'
);
select is(
  (select count(*)::int from public.ai_requests where user_id = 'a7000000-0000-4000-8000-00000000000a'),
  0,
  'Demo uses never count against the shown student'
);

-- As a demo request, uses left are the demo's
set local role authenticated;
set local request.jwt.claims to '{"sub": "b7000000-0000-4000-8000-00000000000b", "role": "authenticated", "app_metadata": {"demo_of": "a7000000-0000-4000-8000-00000000000a"}}';
select public.demo_pre_request();
select is(public.muse_uses_left('theme'), 0, 'The demo sees its own uses left');
select is(public.muse_uses_left('nickname'), 0, 'Renames stay off for the demo');

-- A student's own limits are unchanged
set local request.jwt.claims to '{"sub": "a7000000-0000-4000-8000-00000000000a", "role": "authenticated", "app_metadata": {}}';
select public.demo_pre_request();
select is(
  public.muse_uses_left('theme'),
  (select per_user from private.muse_limits where kind = 'theme'),
  'A student still has their full per-feature limit'
);

select * from finish();
rollback;
