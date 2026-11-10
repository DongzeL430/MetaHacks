-- Tests for migrations/*_demo_viewer.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- S is a student. D is a demo login showing S. Requests are made the way PostgREST makes them:
-- role and token claims first, then the pre-request function.

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('a6000000-0000-4000-8000-00000000000a', 's@rit.edu', '{"adult_confirmed": true}', '{}'),
  ('b6000000-0000-4000-8000-00000000000b', 'demo@studbuds-demo.edu', '{"adult_confirmed": true}',
   '{"demo_of": "a6000000-0000-4000-8000-00000000000a"}');
update public.profiles set onboarding_status = 'onboarded' where id = 'a6000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and not c.relispartition
     and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'demo_read_only')),
  0,
  'Every table in public and private refuses demo writes (new tables: select private.add_demo_guard(...))'
);

-- A demo request
set local role authenticated;
set local request.jwt.claims to '{"sub": "b6000000-0000-4000-8000-00000000000b", "role": "authenticated", "app_metadata": {"demo_of": "a6000000-0000-4000-8000-00000000000a"}}';
select public.demo_pre_request();

select is(auth.uid(), 'a6000000-0000-4000-8000-00000000000a'::uuid, 'A demo request answers as the student it shows');
select is(
  (select onboarding_status::text from public.profiles where id = 'a6000000-0000-4000-8000-00000000000a'),
  'onboarded',
  'It can read that student''s private profile'
);
select throws_ok(
  $$update public.profiles set discord = 'changed' where id = 'a6000000-0000-4000-8000-00000000000a'$$,
  'P0001', 'This is a view-only demo account, so changes aren’t saved.',
  'It cannot change the profile'
);
select throws_ok(
  $$select public.host_lobby('16000000-0000-4000-8000-000000000001', 'Demo Test', 4, 'Library', 2, '13:00', '14:00')$$,
  'P0001', 'This is a view-only demo account, so changes aren’t saved.',
  'It cannot host a session, even through a security definer function'
);
select throws_ok(
  $$select public.delete_my_account()$$,
  'P0001', 'This is a view-only demo account, so changes aren’t saved.',
  'It cannot delete the account'
);
select throws_ok(
  $$delete from public.availability_slots where user_id = 'a6000000-0000-4000-8000-00000000000a'$$,
  'P0001', 'This is a view-only demo account, so changes aren’t saved.',
  'It cannot clear the student''s free time'
);

-- The student themselves, as usual
set local request.jwt.claims to '{"sub": "a6000000-0000-4000-8000-00000000000a", "role": "authenticated", "app_metadata": {}}';
select public.demo_pre_request();
select is(auth.uid(), 'a6000000-0000-4000-8000-00000000000a'::uuid, 'A normal request keeps its own id');
select lives_ok(
  $$update public.profiles set discord = 'mine' where id = 'a6000000-0000-4000-8000-00000000000a'$$,
  'A normal student can still change their profile'
);

-- No token at all (anon key): untouched
set local request.jwt.claims to '';
select lives_ok($$select public.demo_pre_request()$$, 'A request without claims passes through');

reset role;
select throws_ok(
  $$update auth.users set encrypted_password = 'x' where id = 'b6000000-0000-4000-8000-00000000000b'$$,
  'P0001', 'The demo account’s sign-in can’t be changed.',
  'The demo login''s password can''t be changed'
);
select lives_ok(
  $$update auth.users set encrypted_password = 'x' where id = 'a6000000-0000-4000-8000-00000000000a'$$,
  'A student''s password still can'
);

select * from finish();
rollback;
