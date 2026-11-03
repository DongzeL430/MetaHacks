-- Tests for migrations/*_open_lobbies_and_invites.sql (lobby invites).
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- A hosts. B, E, F and G are A's connections, C is B's connection, D is connected to no one.

begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'inv-a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b2000000-0000-4000-8000-00000000000b', 'inv-b@northeastern.edu', '{"adult_confirmed": true}'),
  ('c3000000-0000-4000-8000-00000000000c', 'inv-c@northeastern.edu', '{"adult_confirmed": true}'),
  ('d4000000-0000-4000-8000-00000000000d', 'inv-d@northeastern.edu', '{"adult_confirmed": true}'),
  ('e5000000-0000-4000-8000-00000000000e', 'inv-e@northeastern.edu', '{"adult_confirmed": true}'),
  ('f6000000-0000-4000-8000-00000000000f', 'inv-f@northeastern.edu', '{"adult_confirmed": true}'),
  ('a7000000-0000-4000-8000-000000000007', 'inv-g@northeastern.edu', '{"adult_confirmed": true}');
update public.profiles set onboarding_status = 'onboarded'
where id in ('a1000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-00000000000b', 'c3000000-0000-4000-8000-00000000000c',
             'd4000000-0000-4000-8000-00000000000d', 'e5000000-0000-4000-8000-00000000000e', 'f6000000-0000-4000-8000-00000000000f',
             'a7000000-0000-4000-8000-000000000007');

insert into public.connections (requester_id, addressee_id, status, connected_at) values
  ('a1000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-00000000000b', 'connected', now()),
  ('a1000000-0000-4000-8000-00000000000a', 'e5000000-0000-4000-8000-00000000000e', 'connected', now()),
  ('a1000000-0000-4000-8000-00000000000a', 'f6000000-0000-4000-8000-00000000000f', 'connected', now()),
  ('a1000000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-000000000007', 'connected', now()),
  ('b2000000-0000-4000-8000-00000000000b', 'c3000000-0000-4000-8000-00000000000c', 'connected', now());

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.host_lobby('20000000-0000-4000-8000-000000000001', 'Invite Test', 5, 'Library', 2, '14:00', '16:00');


-- Host invites ------------------------------------------------------------------------------------

select lives_ok(
  $$select public.invite_to_lobby('20000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-00000000000b')$$,
  'The host can invite a connection'
);
select throws_ok(
  $$select public.invite_to_lobby('20000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-00000000000d')$$,
  'P0001', 'You can only invite your connections.',
  'But not someone they aren''t connected with'
);

set local request.jwt.claims to '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select is((select count(*)::integer from public.lobby_invites), 1, 'The invitee sees the invite');
select lives_ok($$select public.answer_invite('20000000-0000-4000-8000-000000000001', true)$$, 'And accepts it');
select is(
  (select role::text from public.lobby_members where lobby_id = '20000000-0000-4000-8000-000000000001' and user_id = 'b2000000-0000-4000-8000-00000000000b'),
  'member',
  'A host''s invite lets them straight in'
);
select is((select count(*)::integer from public.lobby_invites), 0, 'The answered invite is gone');


-- Member invites --------------------------------------------------------------------------------

select lives_ok(
  $$select public.invite_to_lobby('20000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-00000000000c')$$,
  'A member can invite one of their own connections'
);
set local request.jwt.claims to '{"sub": "c3000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select lives_ok($$select public.answer_invite('20000000-0000-4000-8000-000000000001', true)$$, 'They accept');
select is(
  (select role::text from public.lobby_members where lobby_id = '20000000-0000-4000-8000-000000000001' and user_id = 'c3000000-0000-4000-8000-00000000000c'),
  'requested',
  'A member''s invite becomes a join request for the host to answer'
);

set local request.jwt.claims to '{"sub": "d4000000-0000-4000-8000-00000000000d", "role": "authenticated"}';
select throws_ok(
  $$select public.invite_to_lobby('20000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-00000000000a')$$,
  'P0001', 'Only people in this session can invite others.',
  'Someone outside the lobby can''t invite anyone to it'
);


-- Locks, declines, and joining another way ---------------------------------------------------------

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.set_lobby_locked('20000000-0000-4000-8000-000000000001', true);
select public.invite_to_lobby('20000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-00000000000e');
select public.invite_to_lobby('20000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-00000000000f');
select public.set_lobby_locked('20000000-0000-4000-8000-000000000001', false);
select public.invite_to_lobby('20000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000007');
select public.set_lobby_locked('20000000-0000-4000-8000-000000000001', true);

set local request.jwt.claims to '{"sub": "e5000000-0000-4000-8000-00000000000e", "role": "authenticated"}';
select lives_ok(
  $$select public.answer_invite('20000000-0000-4000-8000-000000000001', true)$$,
  'A host''s invite works even while the lobby is locked'
);

set local request.jwt.claims to '{"sub": "f6000000-0000-4000-8000-00000000000f", "role": "authenticated"}';
select public.answer_invite('20000000-0000-4000-8000-000000000001', false);
select is(
  (select count(*)::integer from public.lobby_members where user_id = 'f6000000-0000-4000-8000-00000000000f'),
  0,
  'Declining doesn''t join'
);
select is((select count(*)::integer from public.lobby_invites), 0, 'And clears the invite');

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.set_lobby_locked('20000000-0000-4000-8000-000000000001', false);
set local request.jwt.claims to '{"sub": "a7000000-0000-4000-8000-000000000007", "role": "authenticated"}';
select public.request_join('20000000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.lobby_invites), 0, 'Asking to join another way clears the invite');

select * from finish();
rollback;
