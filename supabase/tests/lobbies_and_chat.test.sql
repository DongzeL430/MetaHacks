-- Tests for migrations/*_lobbies_and_chat.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- A hosts. B, C, F and G are classmates at Northeastern, D is at MIT, E hasn't finished the survey.

begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b2000000-0000-4000-8000-00000000000b', 'b@northeastern.edu', '{"adult_confirmed": true}'),
  ('c3000000-0000-4000-8000-00000000000c', 'c@northeastern.edu', '{"adult_confirmed": true}'),
  ('d4000000-0000-4000-8000-00000000000d', 'd@mit.edu', '{"adult_confirmed": true}'),
  ('e5000000-0000-4000-8000-00000000000e', 'e@northeastern.edu', '{"adult_confirmed": true}'),
  ('f6000000-0000-4000-8000-00000000000f', 'f@northeastern.edu', '{"adult_confirmed": true}'),
  ('a7000000-0000-4000-8000-000000000007', 'g@northeastern.edu', '{"adult_confirmed": true}');

update public.profiles set onboarding_status = 'onboarded' where id <> 'e5000000-0000-4000-8000-00000000000e';
insert into public.blocks (blocker_id, blocked_id) values ('a1000000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-000000000007');

-- C's courses and free time, for the lobby card
insert into public.courses (university_domain, code, title, created_by) values ('northeastern.edu', 'TEST 2500', 'Test Fundamentals', null);
insert into public.user_courses (user_id, course_id, status, confidence)
select 'c3000000-0000-4000-8000-00000000000c', id, 'completed', 2 from public.courses where code = 'TEST 2500';
insert into public.user_courses (user_id, custom_name, status, confidence)
values ('c3000000-0000-4000-8000-00000000000c', 'Secret Typed Course', 'taking', 4);
insert into public.availability_slots (user_id, weekday, starts_at, ends_at) values
  ('a1000000-0000-4000-8000-00000000000a', 2, '13:00', '15:00'),
  ('c3000000-0000-4000-8000-00000000000c', 2, '14:00', '17:00'),
  ('c3000000-0000-4000-8000-00000000000c', 3, '09:00', '10:00');


-- Hosting ---------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select lives_ok(
  $$select public.host_lobby('10000000-0000-4000-8000-000000000001', 'TEST 2500', 3, 'Snell Library', 2, '14:00', '16:00')$$,
  'A student can host a session'
);
select lives_ok(
  $$select public.host_lobby('10000000-0000-4000-8000-000000000002', 'Other', 2, 'Library', 3, '10:00', '11:00')$$,
  'A student can host more than one session'
);
select lives_ok(
  $$select public.close_lobby('10000000-0000-4000-8000-000000000002')$$,
  'And close one while keeping the other'
);
select throws_ok(
  $$insert into public.lobbies (university_domain, host_id, subject, max_size, location, weekday, starts_at, ends_at)
    values ('northeastern.edu', 'a1000000-0000-4000-8000-00000000000a', 'Direct', 2, 'Library', 1, '09:00', '10:00')$$,
  '42501', null,
  'Lobbies can only be made through host_lobby'
);


-- Joining ---------------------------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select is((select count(*)::integer from public.lobbies), 1, 'A classmate sees the session');
select lives_ok($$select public.request_join('10000000-0000-4000-8000-000000000001')$$, 'A classmate can ask to join');
select is(
  (select role::text from public.lobby_members where user_id = 'b2000000-0000-4000-8000-00000000000b'),
  'requested',
  'They see their own request'
);

set local request.jwt.claims to '{"sub": "c3000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select is(
  (select count(*)::integer from public.lobby_members where role = 'requested'),
  0,
  'Another classmate doesn''t see who asked to join'
);
select lives_ok($$select public.request_join('10000000-0000-4000-8000-000000000001')$$, 'A second classmate asks to join');

set local request.jwt.claims to '{"sub": "d4000000-0000-4000-8000-00000000000d", "role": "authenticated"}';
select is((select count(*)::integer from public.lobbies), 1, 'Students at another school see the session too');
select is(
  (select count(*)::integer from public.lobby_members),
  1,
  'They see who''s in it (the host), but not who asked to join'
);

set local request.jwt.claims to '{"sub": "a7000000-0000-4000-8000-000000000007", "role": "authenticated"}';
select is((select count(*)::integer from public.lobbies), 0, 'Someone the host blocked doesn''t see the session');

set local request.jwt.claims to '{"sub": "e5000000-0000-4000-8000-00000000000e", "role": "authenticated"}';
select throws_ok(
  $$select public.request_join('10000000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'A student who hasn''t finished the survey can''t join'
);

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select is((select count(*)::integer from public.lobby_members where role = 'requested'), 2, 'The host sees both requests');
select lives_ok(
  $$select public.answer_join('10000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-00000000000b', true)$$,
  'The host accepts one'
);
select lives_ok(
  $$select public.answer_join('10000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-00000000000c', true)$$,
  'And the other, filling the session'
);

-- Lobby card for C: course names only, help wanted from 1-2 ratings, overlapping free time only
select is(
  (select row(courses_taken, seeking_help_with, shared_free)::text from public.lobby_people()
   where id = 'c3000000-0000-4000-8000-00000000000c'),
  row(array['TEST 2500 · Test Fundamentals'], array['TEST 2500 · Test Fundamentals'],
      '[{"weekday": 2, "ends_at": "15:00:00", "starts_at": "14:00:00"}]'::jsonb)::text,
  'A card shows course names, help wanted, and only the free time both share; typed course names stay private'
);

set local request.jwt.claims to '{"sub": "f6000000-0000-4000-8000-00000000000f", "role": "authenticated"}';
select throws_ok(
  $$select public.request_join('10000000-0000-4000-8000-000000000001')$$,
  'P0001', 'This session is full.',
  'A full session takes no more requests'
);


-- Chat ------------------------------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select lives_ok(
  $$insert into public.lobby_messages (lobby_id, body) values ('10000000-0000-4000-8000-000000000001', '  hi all  ')$$,
  'A member can post'
);
select is((select body from public.lobby_messages limit 1), 'hi all', 'Messages are trimmed');
select lives_ok(
  $$insert into public.lobby_messages (lobby_id, body) values ('10000000-0000-4000-8000-000000000001', 'hi all')$$,
  'Sending the same message twice in a row is allowed'
);
select lives_ok(
  $$insert into public.lobby_messages (lobby_id, body)
    select '10000000-0000-4000-8000-000000000001', 'message ' || g from generate_series(3, 5) as g$$,
  'Five messages in a burst are fine'
);
select throws_ok(
  $$insert into public.lobby_messages (lobby_id, body) values ('10000000-0000-4000-8000-000000000001', 'one more')$$,
  'P0001', 'rate_limited',
  'The sixth within 10 seconds is refused'
);
select throws_ok(
  $$insert into public.lobby_messages (lobby_id, body) values ('10000000-0000-4000-8000-000000000001', repeat('x', 501))$$,
  'P0001', 'rate_limited',
  'Limits are checked before length'
);

set local request.jwt.claims to '{"sub": "f6000000-0000-4000-8000-00000000000f", "role": "authenticated"}';
select is((select count(*)::integer from public.lobby_messages), 0, 'Non-members can''t read the chat');
select throws_ok(
  $$insert into public.lobby_messages (lobby_id, body) values ('10000000-0000-4000-8000-000000000001', 'let me in')$$,
  '42501', null,
  'Non-members can''t post'
);


-- Leaving, locking, closing ---------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select lives_ok($$select public.leave_lobby('10000000-0000-4000-8000-000000000001')$$, 'A member can leave');

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select lives_ok($$select public.set_lobby_locked('10000000-0000-4000-8000-000000000001', true)$$, 'The host can lock it');

set local request.jwt.claims to '{"sub": "f6000000-0000-4000-8000-00000000000f", "role": "authenticated"}';
select throws_ok(
  $$select public.request_join('10000000-0000-4000-8000-000000000001')$$,
  'P0001', 'The host isn’t taking new requests for this session.',
  'A locked session takes no new requests, even with a spot open'
);

set local request.jwt.claims to '{"sub": "c3000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select lives_ok($$select public.close_lobby('10000000-0000-4000-8000-000000000001')$$, 'A member closing it does nothing');

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select lives_ok($$select public.close_lobby('10000000-0000-4000-8000-000000000001')$$, 'The host can close it');

reset role;

select is(
  (select count(*)::integer from public.lobby_messages where lobby_id = '10000000-0000-4000-8000-000000000001'),
  0,
  'Closing a session deletes its chat'
);

select * from finish();
rollback;
