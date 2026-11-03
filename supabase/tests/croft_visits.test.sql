-- Tests for migrations/*_croft_visits.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- A plays; B visits A; D never opened the game.

begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b1000000-0000-4000-8000-00000000000b', 'b@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('d1000000-0000-4000-8000-00000000000d', 'd@vanderbilt.edu', '{"adult_confirmed": true}');
update public.profiles set onboarding_status = 'onboarded';

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.croft_view();

set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select public.croft_view('a1000000-0000-4000-8000-00000000000a');
select public.croft_view('a1000000-0000-4000-8000-00000000000a');
select public.croft_view('a1000000-0000-4000-8000-00000000000a');
select public.croft_view('d1000000-0000-4000-8000-00000000000d');

select is(
  (select count(*)::integer from public.croft_visits),
  0,
  'A visitor can''t read anyone''s visits'
);

reset role;
select is(
  (select count(*)::integer from public.croft_visits where owner_id = 'a1000000-0000-4000-8000-00000000000a'),
  1,
  'Opening A''s croft three times is one visit today'
);
select is(
  (select count(*)::integer from public.croft_visits where owner_id = 'd1000000-0000-4000-8000-00000000000d'),
  0,
  'Visiting a croft nobody has played records nothing'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select is(
  (select visitor_id from public.croft_visits),
  'b1000000-0000-4000-8000-00000000000b'::uuid,
  'The owner can see who visited (for the live chat feed)'
);
select is(
  (select count(*)::integer from public.croft_visits where visitor_id = owner_id),
  0,
  'Your own croft never counts as a visit'
);

reset role;

select * from finish();
rollback;
