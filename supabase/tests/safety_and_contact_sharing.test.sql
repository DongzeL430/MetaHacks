-- Tests for migrations/*_safety_and_contact_sharing.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- A and B are connected classmates at Vanderbilt (B is in A's session); N is at Northeastern.

begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b1000000-0000-4000-8000-00000000000b', 'b@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('c1000000-0000-4000-8000-00000000000c', 'n@northeastern.edu', '{"adult_confirmed": true}');
update public.profiles set onboarding_status = 'onboarded'
where id in ('a1000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000c');
update public.profiles set discord = 'a_studies' where id = 'a1000000-0000-4000-8000-00000000000a';

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.connect_with('b1000000-0000-4000-8000-00000000000b');
select public.host_lobby('10000000-0000-4000-8000-000000000001', 'Safety Test', 3, 'Library', 2, '14:00', '16:00');
set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select public.answer_connection('a1000000-0000-4000-8000-00000000000a', true);
select public.request_join('10000000-0000-4000-8000-000000000001');
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.answer_join('10000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000b', true);


-- Sharing contact details --------------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select is(public.contact_sharing() -> 'sharedWithMe', '[]'::jsonb, 'A connection''s details stay hidden until they share');

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select is((public.contact_sharing() ->> 'haveContact')::boolean, true, 'A has contact details to share');
select lives_ok($$select public.set_contact_shared('b1000000-0000-4000-8000-00000000000b', true)$$, 'A shares with B');
select is(public.contact_sharing() -> 'sharingWith', '["b1000000-0000-4000-8000-00000000000b"]'::jsonb, 'A sees who they share with');
select throws_ok(
  $$select public.set_contact_shared('c1000000-0000-4000-8000-00000000000c', true)$$,
  'P0001', 'You can only share your contact with your connections.',
  'Only with connections'
);

set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select is(
  public.contact_sharing() -> 'sharedWithMe' -> 0 ->> 'discord',
  'a_studies',
  'B now sees A''s Discord'
);
select is(
  public.contact_sharing() -> 'sharedWithMe' -> 0 -> 'phone',
  'null'::jsonb,
  'Only what A filled in'
);


-- Reporting ---------------------------------------------------------------------------------------

select lives_ok(
  $$select public.report_student('a1000000-0000-4000-8000-00000000000a', 'spam', '  keeps sending the same link  ')$$,
  'B reports A with a note'
);
select throws_ok(
  $$select public.report_student('a1000000-0000-4000-8000-00000000000a', 'other', repeat('x', 301))$$,
  'P0001', 'Keep the note to 300 characters.',
  'Notes are 300 characters at most'
);
select throws_ok(
  $$insert into public.reports (reported_id, reason) values ('a1000000-0000-4000-8000-00000000000a', 'spam')$$,
  '42501', null,
  'Reports only go through report_student'
);


-- Blocking ----------------------------------------------------------------------------------------

select lives_ok($$select public.block_student('a1000000-0000-4000-8000-00000000000a')$$, 'B blocks A');
select is((select count(*)::integer from public.connections), 0, 'Their connection is gone');
select is(public.contact_sharing() -> 'sharedWithMe', '[]'::jsonb, 'And so is the sharing');
select is(
  (select count(*)::integer from public.lobbies where id = '10000000-0000-4000-8000-000000000001'),
  0,
  'B no longer sees A''s session'
);
select throws_ok(
  $$insert into public.blocks (blocked_id) values ('c1000000-0000-4000-8000-00000000000c')$$,
  '42501', null,
  'Blocks only go through block_student'
);
select is(
  (select array_agg(id) from public.my_blocks()),
  array['a1000000-0000-4000-8000-00000000000a']::uuid[],
  'B''s blocked list shows A'
);

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select is((select count(*)::integer from public.my_blocks()), 0, 'A never learns they were blocked');

set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select public.unblock_student('a1000000-0000-4000-8000-00000000000a');
select is((select count(*)::integer from public.my_blocks()), 0, 'Unblocking takes A off the list');
select public.block_student('a1000000-0000-4000-8000-00000000000a');

reset role;
select is(
  (select jsonb_build_array(
     (select count(*) from public.lobby_members where lobby_id = '10000000-0000-4000-8000-000000000001' and user_id = 'b1000000-0000-4000-8000-00000000000b'),
     (select count(*) from public.reports where reported_id = 'a1000000-0000-4000-8000-00000000000a' and details = 'keeps sending the same link'))),
  '[0, 1]'::jsonb,
  'B left A''s session, and the report is kept, its note trimmed'
);

select * from finish();
rollback;
