-- Tests for migrations/*_linked_schools_and_connections.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- V and V2 at Vanderbilt and R at RIT (linked schools); N at Northeastern (not linked).

begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'v@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('a2000000-0000-4000-8000-00000000000a', 'v2@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b1000000-0000-4000-8000-00000000000b', 'r@rit.edu', '{"adult_confirmed": true}'),
  ('c1000000-0000-4000-8000-00000000000c', 'n@northeastern.edu', '{"adult_confirmed": true}');
update public.profiles set onboarding_status = 'onboarded';


-- Linked schools: lobbies ------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select lives_ok(
  $$select public.host_lobby('10000000-0000-4000-8000-000000000001', 'Linear Algebra', 3, 'Library', 2, '14:00', '16:00')$$,
  'A student at RIT hosts a session'
);

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select is((select count(*)::integer from public.lobbies where id = '10000000-0000-4000-8000-000000000001'), 1, 'A student at a linked school (Vanderbilt) sees it');
select lives_ok($$select public.request_join('10000000-0000-4000-8000-000000000001')$$, 'And can ask to join');

set local request.jwt.claims to '{"sub": "c1000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select is((select count(*)::integer from public.lobbies where id = '10000000-0000-4000-8000-000000000001'), 1, 'A school that isn''t linked sees it too (filtered out by default in the app)');
select ok(
  not exists (select 1 from public.my_community() d where d in ('rit.edu', 'vanderbilt.edu')),
  'But it isn''t in their community, so "Only my school" hides it'
);


-- Connections ----------------------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select lives_ok($$select public.connect_with('b1000000-0000-4000-8000-00000000000b')$$, 'V sends R a connection request');
select is(
  (select status from public.connections where requester_id = 'a1000000-0000-4000-8000-00000000000a'),
  'pending',
  'V sees it as pending'
);
select throws_ok(
  $$select public.connect_with('c1000000-0000-4000-8000-00000000000c')$$,
  'P0001', 'You can’t connect with this student.',
  'Students at schools that aren''t linked can''t connect'
);
select throws_ok(
  $$insert into public.connections (requester_id, addressee_id) values ('a1000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-00000000000a')$$,
  '42501', null,
  'Requests only go through connect_with'
);

set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select is(
  (select count(*)::integer from public.connections where addressee_id = 'b1000000-0000-4000-8000-00000000000b'),
  1,
  'R sees the request'
);
select ok(
  exists (select 1 from public.lobby_people() where id = 'a1000000-0000-4000-8000-00000000000a'),
  'And V''s card, so the Connections window can show who asked'
);
select lives_ok($$select public.answer_connection('a1000000-0000-4000-8000-00000000000a', true)$$, 'R accepts');

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select is(
  (select status from public.connections where requester_id = 'a1000000-0000-4000-8000-00000000000a'),
  'connected',
  'Now both are connected'
);

-- A silent decline
select lives_ok($$select public.connect_with('a2000000-0000-4000-8000-00000000000a')$$, 'V asks V2');
set local request.jwt.claims to '{"sub": "a2000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select lives_ok($$select public.answer_connection('a1000000-0000-4000-8000-00000000000a', false)$$, 'V2 declines');
select is(
  (select count(*)::integer from public.connections),
  0,
  'The request leaves V2''s list'
);
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select is(
  (select status from public.connections where addressee_id = 'a2000000-0000-4000-8000-00000000000a'),
  'pending',
  'V still sees "pending": the decline is silent'
);
select throws_ok($$select * from private.connection_declines$$, '42501', null, 'Students can''t read declines');

set local request.jwt.claims to '{"sub": "a2000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select lives_ok($$select public.connect_with('a1000000-0000-4000-8000-00000000000a')$$, 'V2 changes their mind and connects');
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select is(
  (select status from public.connections where addressee_id = 'a2000000-0000-4000-8000-00000000000a'),
  'connected',
  'Then they''re connected'
);

reset role;

select * from finish();
rollback;
