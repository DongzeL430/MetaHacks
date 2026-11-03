-- Tests for migrations/*_kick_from_lobby.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- A hosts. B and C are classmates who join; C tries to kick B.

begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b2000000-0000-4000-8000-00000000000b', 'b@northeastern.edu', '{"adult_confirmed": true}'),
  ('c3000000-0000-4000-8000-00000000000c', 'c@northeastern.edu', '{"adult_confirmed": true}');

update public.profiles set onboarding_status = 'onboarded';

set local role authenticated;

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.host_lobby('10000000-0000-4000-8000-000000000001', 'Kick test', 4, 'Snell Library', 2, '14:00', '16:00');

set local request.jwt.claims to '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select public.request_join('10000000-0000-4000-8000-000000000001');
set local request.jwt.claims to '{"sub": "c3000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select public.request_join('10000000-0000-4000-8000-000000000001');

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.answer_join('10000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-00000000000b', true);
select public.answer_join('10000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-00000000000c', true);


-- Who can kick -------------------------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "c3000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select throws_ok(
  $$select public.kick_from_lobby('10000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-00000000000b')$$,
  'P0001', 'Only the host can remove people.',
  'A member can''t remove someone'
);

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select throws_ok(
  $$select public.kick_from_lobby('10000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-00000000000a')$$,
  'P0001', 'You can’t remove yourself. Close the lobby instead.',
  'The host can''t remove themselves'
);
select lives_ok(
  $$select public.kick_from_lobby('10000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-00000000000b')$$,
  'The host can remove a member'
);
select is(
  (select count(*)::integer from public.lobby_members where lobby_id = '10000000-0000-4000-8000-000000000001' and role = 'member'),
  2,
  'They''re gone from the lobby; the host and C stay'
);


-- After a kick -------------------------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select is(
  (select count(*)::integer from public.lobby_messages where lobby_id = '10000000-0000-4000-8000-000000000001'),
  0,
  'The removed student can''t read the chat'
);
select throws_ok(
  $$insert into public.lobby_messages (lobby_id, body) values ('10000000-0000-4000-8000-000000000001', 'hi')$$,
  '42501', null,
  'Or post in it'
);
select throws_ok(
  $$select public.request_join('10000000-0000-4000-8000-000000000001')$$,
  'P0001', 'The host removed you from this session.',
  'Or ask to join that session again'
);
select throws_ok(
  $$select count(*) from private.lobby_removals$$,
  '42501', null,
  'Students can''t read who was removed'
);


-- Closing clears removals ----------------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.close_lobby('10000000-0000-4000-8000-000000000001');
select public.host_lobby('10000000-0000-4000-8000-000000000002', 'Kick test again', 4, 'Snell Library', 2, '14:00', '16:00');

set local request.jwt.claims to '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select lives_ok(
  $$select public.request_join('10000000-0000-4000-8000-000000000002')$$,
  'A removed student can ask to join the host''s next session'
);

reset role;
select is((select count(*)::integer from private.lobby_removals), 0, 'Closing the lobby deletes its removals');

select * from finish();
rollback;
