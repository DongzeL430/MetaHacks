-- Tests for migrations/*_muse_match_picks.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- V looks for sessions. H1 and H2 host at Vanderbilt, N hosts at Northeastern, F hosts a full
-- session, and V already asked to join H2's. The live database may hold real lobbies too, so
-- checks look only at these test sessions.

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5000000-0000-4000-8000-00000000000a', 'v@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b5000000-0000-4000-8000-00000000000b', 'h1@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('c5000000-0000-4000-8000-00000000000c', 'h2@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('d5000000-0000-4000-8000-00000000000d', 'n@northeastern.edu', '{"adult_confirmed": true}'),
  ('e5000000-0000-4000-8000-00000000000e', 'f@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('f5000000-0000-4000-8000-00000000000f', 'g@vanderbilt.edu', '{"adult_confirmed": true}');
update public.profiles set onboarding_status = 'onboarded'
where id in ('a5000000-0000-4000-8000-00000000000a', 'b5000000-0000-4000-8000-00000000000b', 'c5000000-0000-4000-8000-00000000000c',
             'd5000000-0000-4000-8000-00000000000d', 'e5000000-0000-4000-8000-00000000000e', 'f5000000-0000-4000-8000-00000000000f');

-- V is free Tuesday 1 to 3 PM, and answered one question
insert into public.availability_slots (user_id, weekday, starts_at, ends_at)
values ('a5000000-0000-4000-8000-00000000000a', 2, '13:00', '15:00');
insert into public.survey_answers (user_id, question_id, choice)
select 'a5000000-0000-4000-8000-00000000000a', id, 1 from public.survey_questions where approved order by position limit 1;
-- H1 answered too: their answer must never come back
insert into public.survey_answers (user_id, question_id, choice)
select 'b5000000-0000-4000-8000-00000000000b', id, 2 from public.survey_questions where approved order by position limit 1;

set local role authenticated;
set local request.jwt.claims to '{"sub": "b5000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select public.host_lobby('15000000-0000-4000-8000-000000000001', 'Picks Test Fully Free', 4, 'Main Library', 2, '13:00', '14:00');
set local request.jwt.claims to '{"sub": "c5000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select public.host_lobby('15000000-0000-4000-8000-000000000002', 'Picks Test Requested', 4, 'Cafe', 2, '14:00', '16:00');
set local request.jwt.claims to '{"sub": "d5000000-0000-4000-8000-00000000000d", "role": "authenticated"}';
select public.host_lobby('15000000-0000-4000-8000-000000000003', 'Picks Test Other School', 4, 'Snell Library', 3, '09:00', '10:00');
set local request.jwt.claims to '{"sub": "e5000000-0000-4000-8000-00000000000e", "role": "authenticated"}';
select public.host_lobby('15000000-0000-4000-8000-000000000004', 'Picks Test Full', 2, 'Library', 2, '14:30', '15:30');
set local request.jwt.claims to '{"sub": "f5000000-0000-4000-8000-00000000000f", "role": "authenticated"}';
select public.request_join('15000000-0000-4000-8000-000000000004');
set local request.jwt.claims to '{"sub": "e5000000-0000-4000-8000-00000000000e", "role": "authenticated"}';
select public.answer_join('15000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-00000000000f', true);
set local request.jwt.claims to '{"sub": "a5000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.request_join('15000000-0000-4000-8000-000000000002');

select throws_ok(
  $$select public.match_candidates('a5000000-0000-4000-8000-00000000000a')$$,
  '42501', null,
  'Students cannot call it; only the pick-matches function does'
);
select throws_ok($$select * from public.match_picks_cache$$, '42501', null, 'Students cannot read the cache');

reset role;
create temp table picks_test on commit drop as
  select public.match_candidates('a5000000-0000-4000-8000-00000000000a', true, 12) as mine,
         public.match_candidates('a5000000-0000-4000-8000-00000000000a', false, 12) as everywhere;
create temp table test_ids on commit drop as
  select unnest(array['15000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000002',
                      '15000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000004']) as id;

select is(
  (select jsonb_agg(c ->> 'subject' order by c ->> 'subject') from picks_test, jsonb_array_elements(mine -> 'candidates') c
   where c ->> 'lobby_id' in (select id from test_ids)),
  '["Picks Test Fully Free"]'::jsonb,
  'Only sessions V could still join at their school: not the requested one, the full one or another school''s'
);
select ok(
  (select bool_or(c ->> 'subject' = 'Picks Test Other School') from picks_test, jsonb_array_elements(everywhere -> 'candidates') c),
  'With "Only my school" off, other schools come in too'
);
select is(
  (select c ->> 'fits_your_free_time' from picks_test, jsonb_array_elements(mine -> 'candidates') c where c ->> 'subject' = 'Picks Test Fully Free'),
  'fully',
  'A session inside V''s free time fits fully'
);
select is(
  (select c ->> 'fits_your_free_time' from picks_test, jsonb_array_elements(everywhere -> 'candidates') c where c ->> 'subject' = 'Picks Test Other School'),
  'no',
  'One on a day V is busy doesn''t fit'
);
select is(
  (select c ->> 'when' from picks_test, jsonb_array_elements(mine -> 'candidates') c where c ->> 'subject' = 'Picks Test Fully Free'),
  'Tuesday 1:00 PM to 2:00 PM',
  'Times are written out for Muse'
);
select is(
  (select c ->> 'group' from picks_test, jsonb_array_elements(mine -> 'candidates') c where c ->> 'subject' = 'Picks Test Fully Free'),
  '1 of 4 spots taken',
  'And the group size'
);
select is(
  (select array_agg(distinct k order by k) from picks_test, jsonb_array_elements(mine -> 'candidates') c, jsonb_object_keys(c) k),
  array['fits_your_free_time', 'group', 'lobby_id', 'minutes', 'place', 'ranking_reasons', 'subject', 'when', 'where'],
  'Nothing about the host: no id, nickname, rating or answers'
);
select is(
  (select jsonb_array_length(mine -> 'me' -> 'preferences') from picks_test),
  1,
  'V''s own answers come along, for Muse to weigh the sessions against'
);
select ok(
  (select bool_and(prev is null or place > prev) from (
     select (c ->> 'place')::integer as place, lag((c ->> 'place')::integer) over (order by ord) as prev
     from picks_test, jsonb_array_elements(everywhere -> 'candidates') with ordinality as e(c, ord)
   ) x),
  'Candidates come in the ranking''s order'
);
select is(
  (select per_user from private.muse_limits where kind = 'match_picks'),
  10,
  'Muse picks count toward a daily limit of 10'
);

select * from finish();
rollback;
