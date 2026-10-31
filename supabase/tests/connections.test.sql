-- Tests for migrations/*_connections.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- Students A, B, C, D at Northeastern. Pairing 1 is A with B, pairing 2 is A with C.
-- D was never paired with anyone.

begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b3000000-0000-4000-8000-00000000000b', 'b@northeastern.edu', '{"adult_confirmed": true}'),
  ('c3000000-0000-4000-8000-00000000000c', 'c@northeastern.edu', '{"adult_confirmed": true}'),
  ('d3000000-0000-4000-8000-00000000000d', 'd@northeastern.edu', '{"adult_confirmed": true}');

insert into public.pairings (user_low, user_high) values
  ('a3000000-0000-4000-8000-00000000000a', 'b3000000-0000-4000-8000-00000000000b'),
  ('a3000000-0000-4000-8000-00000000000a', 'c3000000-0000-4000-8000-00000000000c');

-- Students only see their own pairings, so remember the ids while running as the test owner.
do $$
begin
  perform set_config('test.p1', (select id::text from public.pairings
    where user_high = 'b3000000-0000-4000-8000-00000000000b'), true);
  perform set_config('test.p2', (select id::text from public.pairings
    where user_high = 'c3000000-0000-4000-8000-00000000000c'), true);
end;
$$;

select throws_ok(
  $$insert into public.pairings (user_low, user_high)
    values ('b3000000-0000-4000-8000-00000000000b', 'a3000000-0000-4000-8000-00000000000a')$$,
  '23514', null,
  'A pair is always stored smaller id first'
);
select throws_ok(
  $$insert into public.pairings (user_low, user_high)
    values ('a3000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-00000000000a')$$,
  '23514', null,
  'A student cannot be paired with themselves'
);


-- Pairings and Vibe or Pass -------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "a3000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select is((select count(*)::integer from public.pairings), 2, 'A student sees the pairings they are in');
select throws_ok(
  $$insert into public.pairings (user_low, user_high)
    values ('a3000000-0000-4000-8000-00000000000a', 'd3000000-0000-4000-8000-00000000000d')$$,
  '42501', null,
  'Students cannot create pairings'
);
select throws_ok(
  $$update public.pairings set mutual_at = now()$$,
  '42501', null,
  'Students cannot mark a pairing as mutual'
);
select lives_ok(
  $$insert into public.vibe_decisions (pairing_id, choice) values (current_setting('test.p1')::bigint, 'vibe')$$,
  'A student can pick Vibe'
);
select throws_ok(
  $$update public.vibe_decisions set choice = 'pass'$$,
  '42501', null,
  'A choice cannot be changed'
);
select throws_ok(
  $$insert into public.vibe_decisions (pairing_id, choice) values (current_setting('test.p1')::bigint, 'pass')$$,
  '23505', null,
  'A student chooses only once per pairing'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "c3000000-0000-4000-8000-00000000000c", "role": "authenticated"}';

select throws_ok(
  $$insert into public.vibe_decisions (pairing_id, choice) values (current_setting('test.p1')::bigint, 'vibe')$$,
  '42501', null,
  'A student cannot choose in a pairing they are not in'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "b3000000-0000-4000-8000-00000000000b", "role": "authenticated"}';

select is((select count(*)::integer from public.vibe_decisions), 0, 'A partner never sees the other student''s choice');
select lives_ok(
  $$insert into public.vibe_decisions (pairing_id, choice) values (current_setting('test.p1')::bigint, 'pass')$$,
  'A student can pick Pass'
);

reset role;


-- Cooldown -------------------------------------------------------------------------------

select ok(
  public.pair_on_cooldown('a3000000-0000-4000-8000-00000000000a', 'b3000000-0000-4000-8000-00000000000b'),
  'A pair is on cooldown right after a Pass'
);
select ok(
  public.pair_on_cooldown('b3000000-0000-4000-8000-00000000000b', 'a3000000-0000-4000-8000-00000000000a'),
  'The cooldown check works in either order'
);
select ok(
  not public.pair_on_cooldown('a3000000-0000-4000-8000-00000000000a', 'c3000000-0000-4000-8000-00000000000c'),
  'A Pass only affects that one pair'
);

update public.vibe_decisions set decided_at = now() - interval '25 hours' where choice = 'pass';

select ok(
  not public.pair_on_cooldown('a3000000-0000-4000-8000-00000000000a', 'b3000000-0000-4000-8000-00000000000b'),
  'The cooldown ends after 1 day'
);

set local role service_role;
select lives_ok(
  $$select public.pair_on_cooldown('a3000000-0000-4000-8000-00000000000a', 'b3000000-0000-4000-8000-00000000000b')$$,
  'Server code can run the cooldown check'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "a3000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select throws_ok(
  $$select public.pair_on_cooldown('a3000000-0000-4000-8000-00000000000a', 'b3000000-0000-4000-8000-00000000000b')$$,
  '42501', null,
  'Students cannot run the cooldown check'
);


-- Contact sharing ------------------------------------------------------------------------

select throws_ok(
  $$insert into public.contact_shares (pairing_id, instagram) values (current_setting('test.p1')::bigint, true)$$,
  '42501', null,
  'Sharing is only offered in a mutual pairing'
);

reset role;
update public.pairings set mutual_at = now() where id = current_setting('test.p2')::bigint;
set local role authenticated;
set local request.jwt.claims to '{"sub": "a3000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select lives_ok(
  $$insert into public.contact_shares (pairing_id, instagram, discord) values (current_setting('test.p2')::bigint, true, true)$$,
  'A student picks which platforms to share in a mutual pairing'
);
select lives_ok(
  $$update public.contact_shares set phone = true where pairing_id = current_setting('test.p2')::bigint$$,
  'A student can change what they share'
);
select throws_ok(
  $$insert into public.contact_shares (pairing_id) values (current_setting('test.p2')::bigint)$$,
  '23505', null,
  'One sharing answer per student per pairing'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "c3000000-0000-4000-8000-00000000000c", "role": "authenticated"}';

select is((select count(*)::integer from public.contact_shares), 0, 'A partner cannot read the other student''s sharing answer');
select throws_ok(
  $$insert into public.contact_shares (pairing_id, user_id, instagram)
    values (current_setting('test.p2')::bigint, 'a3000000-0000-4000-8000-00000000000a', true)$$,
  '42501', null,
  'A student cannot answer for someone else'
);


-- Blocks ---------------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "a3000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select lives_ok(
  $$insert into public.blocks (blocked_id) values ('b3000000-0000-4000-8000-00000000000b')$$,
  'A student can block someone they were paired with'
);
select throws_ok(
  $$insert into public.blocks (blocked_id) values ('d3000000-0000-4000-8000-00000000000d')$$,
  '42501', null,
  'A student cannot block someone they were never paired with'
);
select throws_ok(
  $$insert into public.blocks (blocked_id) values ('a3000000-0000-4000-8000-00000000000a')$$,
  '23514', null,
  'A student cannot block themselves'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "b3000000-0000-4000-8000-00000000000b", "role": "authenticated"}';

select is((select count(*)::integer from public.blocks), 0, 'A block is silent: the blocked student cannot see it');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "a3000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select lives_ok(
  $$delete from public.blocks where blocked_id = 'b3000000-0000-4000-8000-00000000000b'$$,
  'A student can undo a block'
);


-- Reports --------------------------------------------------------------------------------

select lives_ok(
  $$insert into public.reports (reported_id, pairing_id, reason, details)
    values ('b3000000-0000-4000-8000-00000000000b', current_setting('test.p1')::bigint, 'harassment', 'Kept sending rude messages in chat')$$,
  'A student can report someone they were paired with'
);
select throws_ok(
  $$insert into public.reports (reported_id, reason) values ('d3000000-0000-4000-8000-00000000000d', 'spam')$$,
  '42501', null,
  'A student cannot report someone they were never paired with'
);
select throws_ok(
  $$insert into public.reports (reported_id, pairing_id, reason)
    values ('b3000000-0000-4000-8000-00000000000b', current_setting('test.p2')::bigint, 'spam')$$,
  '42501', null,
  'A report''s pairing must be one with the reported student'
);
select throws_ok(
  $$insert into public.reports (reported_id, reason, details)
    values ('b3000000-0000-4000-8000-00000000000b', 'other', repeat('x', 501))$$,
  '23514', null,
  'Report notes are capped at 500 characters'
);
select throws_ok(
  $$update public.reports set status = 'reviewed'$$,
  '42501', null,
  'Students cannot mark reports as reviewed'
);
select lives_ok(
  $$insert into public.reports (reported_id, reason)
    select 'b3000000-0000-4000-8000-00000000000b', 'other' from generate_series(1, 29)$$,
  'A student can file up to 30 reports'
);
select throws_ok(
  $$insert into public.reports (reported_id, reason) values ('b3000000-0000-4000-8000-00000000000b', 'other')$$,
  '23514', null,
  'The 31st report is rejected'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "b3000000-0000-4000-8000-00000000000b", "role": "authenticated"}';

select is((select count(*)::integer from public.reports), 0, 'The reported student never sees reports about them');

reset role;
set local role anon;

select throws_ok($$select * from public.pairings$$, '42501', null, 'Signed-out visitors cannot read pairings');

reset role;


-- Account deletion -----------------------------------------------------------------------

delete from auth.users where id = 'b3000000-0000-4000-8000-00000000000b';

select is(
  (
    (select count(*) from public.pairings where 'b3000000-0000-4000-8000-00000000000b' in (user_low, user_high))
    + (select count(*) from public.reports where reported_id = 'b3000000-0000-4000-8000-00000000000b')
  )::integer,
  0,
  'Deleting an account removes its pairings and the reports about it'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "c3000000-0000-4000-8000-00000000000c", "role": "authenticated"}';

select lives_ok(
  $$insert into public.reports (reported_id, reason) values ('a3000000-0000-4000-8000-00000000000a', 'inappropriate')$$,
  'Another student files a report'
);

reset role;
delete from auth.users where id = 'c3000000-0000-4000-8000-00000000000c';

select ok(
  exists (
    select 1 from public.reports
    where reported_id = 'a3000000-0000-4000-8000-00000000000a' and reporter_id is null and reason = 'inappropriate'
  ),
  'A report stays for review after the reporter deletes their account'
);

select * from finish();
rollback;
