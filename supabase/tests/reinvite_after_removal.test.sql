-- Tests for migrations/*_reinvite_after_removal.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- A hosts. B and C are A's connections and each other's. A lets both in, then removes C.

begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-0000000000a1', 'reinv-a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b1000000-0000-4000-8000-0000000000b1', 'reinv-b@northeastern.edu', '{"adult_confirmed": true}'),
  ('c1000000-0000-4000-8000-0000000000c1', 'reinv-c@northeastern.edu', '{"adult_confirmed": true}');
update public.profiles set onboarding_status = 'onboarded'
where id in ('a1000000-0000-4000-8000-0000000000a1', 'b1000000-0000-4000-8000-0000000000b1', 'c1000000-0000-4000-8000-0000000000c1');

insert into public.connections (requester_id, addressee_id, status, connected_at) values
  ('a1000000-0000-4000-8000-0000000000a1', 'b1000000-0000-4000-8000-0000000000b1', 'connected', now()),
  ('a1000000-0000-4000-8000-0000000000a1', 'c1000000-0000-4000-8000-0000000000c1', 'connected', now()),
  ('b1000000-0000-4000-8000-0000000000b1', 'c1000000-0000-4000-8000-0000000000c1', 'connected', now());

set local role authenticated;

-- A hosts, invites B and C, and both accept
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select public.host_lobby('30000000-0000-4000-8000-000000000001', 'Reinvite Test', 5, 'Library', 2, '14:00', '16:00');
select public.invite_to_lobby('30000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-0000000000b1');
select public.invite_to_lobby('30000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000c1');
set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select public.answer_invite('30000000-0000-4000-8000-000000000001', true);
set local request.jwt.claims to '{"sub": "c1000000-0000-4000-8000-0000000000c1", "role": "authenticated"}';
select public.answer_invite('30000000-0000-4000-8000-000000000001', true);

-- A removes C
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select public.kick_from_lobby('30000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000c1');


-- Only the host can bring them back ----------------------------------------------------------------

set local request.jwt.claims to '{"sub": "c1000000-0000-4000-8000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$select public.request_join('30000000-0000-4000-8000-000000000001')$$,
  'P0001', 'You were removed from this session.',
  'Someone removed still can''t ask to join on their own'
);

set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$select public.invite_to_lobby('30000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000c1')$$,
  'P0001', 'The host removed them from this session, so only the host can invite them back.',
  'A member can''t invite someone the host removed'
);

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$select public.invite_to_lobby('30000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000c1')$$,
  'The host can invite them again'
);


-- Accepting lets them back in --------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "c1000000-0000-4000-8000-0000000000c1", "role": "authenticated"}';
select is((select count(*)::integer from public.lobby_invites), 1, 'They see the new invite');
select lives_ok($$select public.answer_invite('30000000-0000-4000-8000-000000000001', true)$$, 'And accept it');
select is(
  (select role::text from public.lobby_members
   where lobby_id = '30000000-0000-4000-8000-000000000001' and user_id = 'c1000000-0000-4000-8000-0000000000c1'),
  'member',
  'They''re back in the session'
);

-- The removal is lifted: after leaving, they can ask to join like anyone else
select public.leave_lobby('30000000-0000-4000-8000-000000000001');
select lives_ok($$select public.request_join('30000000-0000-4000-8000-000000000001')$$, 'The removal is lifted');
select is(
  (select role::text from public.lobby_members
   where lobby_id = '30000000-0000-4000-8000-000000000001' and user_id = 'c1000000-0000-4000-8000-0000000000c1'),
  'requested',
  'So asking to join works again'
);

select * from finish();
rollback;
