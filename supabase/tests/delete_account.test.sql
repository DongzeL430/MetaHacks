-- Tests for migrations/*_delete_account.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- A and B were paired, studied together, and reported each other. A deletes their account.

begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b5000000-0000-4000-8000-00000000000b', 'b@northeastern.edu', '{"adult_confirmed": true}');

insert into public.pairings (user_low, user_high)
values ('a5000000-0000-4000-8000-00000000000a', 'b5000000-0000-4000-8000-00000000000b');

insert into public.reports (reporter_id, reported_id, reason, details) values
  ('a5000000-0000-4000-8000-00000000000a', 'b5000000-0000-4000-8000-00000000000b', 'spam', 'test: filed by A'),
  ('b5000000-0000-4000-8000-00000000000b', 'a5000000-0000-4000-8000-00000000000a', 'spam', 'test: filed by B');

insert into public.study_sessions (location, starts_at, ends_at, status)
values ('test: Snell Library', '2026-11-01 18:00-05', '2026-11-01 20:00-05', 'completed');

insert into public.study_session_members (session_id, user_id)
select id, unnest(array['a5000000-0000-4000-8000-00000000000a', 'b5000000-0000-4000-8000-00000000000b']::uuid[])
from public.study_sessions where location = 'test: Snell Library';


-- Who can call it -------------------------------------------------------------------------

set local role anon;
select throws_ok($$select public.delete_my_account()$$, '42501', null, 'Signed-out visitors cannot call it');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"role": "authenticated"}';
select throws_ok($$select public.delete_my_account()$$, '42501', null, 'It refuses to run without a signed-in student');
reset role;


-- A deletes their account -----------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "a5000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select lives_ok($$select public.delete_my_account()$$, 'A signed-in student can delete their account');
reset role;

select ok(
  not exists (select 1 from auth.users where id = 'a5000000-0000-4000-8000-00000000000a'),
  'The login is gone'
);
select ok(
  not exists (select 1 from public.profiles where id = 'a5000000-0000-4000-8000-00000000000a')
  and not exists (select 1 from public.public_profiles where id = 'a5000000-0000-4000-8000-00000000000a'),
  'Both profiles are gone'
);
select ok(
  exists (select 1 from auth.users where id = 'b5000000-0000-4000-8000-00000000000b'),
  'Nobody else is deleted'
);
select ok(
  not exists (select 1 from public.pairings where user_low = 'a5000000-0000-4000-8000-00000000000a'),
  'Pairings with the deleted student are gone'
);
select ok(
  exists (select 1 from public.reports where details = 'test: filed by A' and reporter_id is null),
  'Reports the student filed stay for review, without the reporter'
);
select ok(
  not exists (select 1 from public.reports where details = 'test: filed by B'),
  'Reports about the deleted student are gone'
);
select is(
  (select array_agg(m.user_id) from public.study_session_members m
   join public.study_sessions s on s.id = m.session_id where s.location = 'test: Snell Library'),
  array['b5000000-0000-4000-8000-00000000000b']::uuid[],
  'A shared study session stays in the partner''s record, without the deleted student'
);

select * from finish();
rollback;
