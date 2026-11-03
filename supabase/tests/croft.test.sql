-- Tests for migrations/*_croft.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- now() is fixed inside a transaction, so growing times compare exactly.
-- A farms; B (Vanderbilt) and C (RIT, a linked school) visit; N is at a school that isn't linked.

begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b1000000-0000-4000-8000-00000000000b', 'b@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b2000000-0000-4000-8000-00000000000b', 'c@rit.edu', '{"adult_confirmed": true}'),
  ('c1000000-0000-4000-8000-00000000000c', 'n@northeastern.edu', '{"adult_confirmed": true}');
update public.profiles set onboarding_status = 'onboarded'
where id in ('a1000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-00000000000b',
             'b2000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000c');

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';


-- A new croft --------------------------------------------------------------------------------------

select is(
  (select jsonb_array_length(public.croft_view() -> 'tiles')),
  30,
  'Opening the game makes a croft of 30 tiles'
);
select is(
  (select (v ->> 'pennies')::integer from public.croft_view() v),
  20,
  'It starts with 20 pennies'
);
select is(
  (select count(*)::integer from jsonb_array_elements(public.croft_view() -> 'tiles') t where t ->> 'ground' = 'soil'),
  6,
  'And the first row tilled'
);


-- Farming ------------------------------------------------------------------------------------------

select is(
  (select (v ->> 'pennies')::integer from public.croft_act('sow', 0, 'oats') v),
  18,
  'Sowing oats costs 2 pennies'
);
select is(
  (select public.croft_view() -> 'tiles' -> 0 ->> 'readyAt'),
  null,
  'A sown seed waits for water'
);
select is(
  (select (public.croft_act('water', 0) -> 'tiles' -> 0 ->> 'readyAt')::timestamptz),
  now() + interval '20 minutes',
  'Watering starts it: oats are ready 20 minutes later'
);
select throws_ok(
  $$select public.croft_act('harvest', 0)$$,
  'P0001', 'That isn’t ready to harvest yet.',
  'Nothing can be harvested early'
);

reset role;
update public.croft_tiles set ready_at = now() - interval '1 minute'
where user_id = 'a1000000-0000-4000-8000-00000000000a' and idx = 0;
set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select is(
  (select (v ->> 'pennies')::integer from public.croft_act('harvest', 0) v),
  23,
  'A ready crop sells for its price (oats: 5)'
);
select throws_ok(
  $$select public.croft_act('sow', 10, 'oats')$$,
  'P0001', 'Seeds go on empty tilled soil.',
  'Seeds only go on tilled soil'
);
select is(
  (select public.croft_act('till', 10) -> 'tiles' -> 10 ->> 'ground'),
  'soil',
  'Tilling turns grass into soil, for free'
);
select is(
  (select (v ->> 'pennies')::integer from public.croft_act('place', 20, 'fence') v),
  13,
  'A wicker fence costs 10 pennies and goes on grass'
);
select throws_ok(
  $$select public.croft_act('place', 21, 'sheep')$$,
  'P0001', 'You need 80 pennies for that.',
  'Nothing can be bought without the pennies'
);
select lives_ok($$select public.croft_act('sow', 1, 'kale')$$, 'A sows kale and leaves it dry');


-- Visiting and helping -----------------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select is(
  (select jsonb_build_array(v -> 'isMine', v -> 'pennies', v -> 'canHelpToday')
   from public.croft_view('a1000000-0000-4000-8000-00000000000a') v),
  '[false, null, true]'::jsonb,
  'A classmate visiting sees the croft, not its pennies, and can help today'
);
select is(
  (select (public.croft_help('a1000000-0000-4000-8000-00000000000a', 1) -> 'tiles' -> 1 ->> 'readyAt')::timestamptz),
  now() + interval '45 minutes',
  'Helping on a dry seed waters it'
);
select throws_ok(
  $$select public.croft_help('a1000000-0000-4000-8000-00000000000a', 1)$$,
  'P0001', 'You’ve already helped on this croft today. Come back tomorrow.',
  'Once a day per croft'
);

set local request.jwt.claims to '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select is(
  (select (public.croft_help('a1000000-0000-4000-8000-00000000000a', 1) -> 'tiles' -> 1 ->> 'readyAt')::timestamptz),
  now() + interval '33 minutes 45 seconds',
  'A student at a linked school helps too, taking a quarter of the 45 minutes off'
);

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select is(
  (select jsonb_array_length(public.croft_view() -> 'helpers')),
  2,
  'The owner sees both helpers'
);

set local request.jwt.claims to '{"sub": "c1000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select throws_ok(
  $$select public.croft_view('a1000000-0000-4000-8000-00000000000a')$$,
  'P0001', 'That croft isn’t open to you.',
  'A school that isn''t linked can''t visit'
);
select throws_ok(
  $$select * from public.crofts$$,
  '42501', null,
  'Crofts are only read and changed through the game''s functions'
);

reset role;

select * from finish();
rollback;
