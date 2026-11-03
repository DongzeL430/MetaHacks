-- Tests for migrations/*_kick_and_disconnect.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- H hosts a session and M joins it; H2 hosts another. A and B are connected.

begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'h@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('a2000000-0000-4000-8000-00000000000a', 'h2@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b1000000-0000-4000-8000-00000000000b', 'm@vanderbilt.edu', '{"adult_confirmed": true}');
update public.profiles set onboarding_status = 'onboarded';

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.host_lobby('10000000-0000-4000-8000-000000000001', 'Kick Test', 3, 'Library', 2, '14:00', '16:00');
set local request.jwt.claims to '{"sub": "a2000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.host_lobby('10000000-0000-4000-8000-000000000002', 'Another Session', 3, 'Library', 2, '14:00', '16:00');
set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select public.request_join('10000000-0000-4000-8000-000000000001');
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.answer_join('10000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000b', true);


-- Removing someone from a session -----------------------------------------------------------------

set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select throws_ok(
  $$select public.kick_from_lobby('10000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-00000000000a')$$,
  'P0001', 'Only the host can remove someone from a session.',
  'Only the host can remove anyone'
);

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select throws_ok(
  $$select public.kick_from_lobby('10000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-00000000000a')$$,
  'P0001', 'You can’t remove yourself. Close the session instead.',
  'The host can''t remove themselves'
);
select throws_ok(
  $$select public.kick_from_lobby('10000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-00000000000a')$$,
  'P0001', 'They’re not in this session.',
  'Only members can be removed'
);
select lives_ok(
  $$select public.kick_from_lobby('10000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000b')$$,
  'The host removes M'
);
select is(
  (select count(*)::integer from public.lobby_members
   where lobby_id = '10000000-0000-4000-8000-000000000001' and user_id = 'b1000000-0000-4000-8000-00000000000b'),
  0,
  'M is out of the session'
);

set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select throws_ok(
  $$select public.request_join('10000000-0000-4000-8000-000000000001')$$,
  'P0001', 'You were removed from this session.',
  'M can''t ask to join that session again'
);
select lives_ok(
  $$select public.request_join('10000000-0000-4000-8000-000000000002')$$,
  'Other sessions are still open to M'
);
select throws_ok($$select * from public.lobby_removals$$, '42501', null, 'Students can''t read who was removed');


-- Removing a connection ---------------------------------------------------------------------------

select public.connect_with('a1000000-0000-4000-8000-00000000000a');
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.answer_connection('b1000000-0000-4000-8000-00000000000b', true);
select lives_ok(
  $$select public.remove_connection('b1000000-0000-4000-8000-00000000000b')$$,
  'Either side can remove a connection (here the one who accepted)'
);
select is(
  (select count(*)::integer from public.connections),
  0,
  'Then they''re not connected'
);
select throws_ok(
  $$select public.remove_connection('b1000000-0000-4000-8000-00000000000b')$$,
  'P0001', 'You’re not connected with them.',
  'Removing again says so'
);

reset role;

select * from finish();
rollback;
