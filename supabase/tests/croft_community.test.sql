-- Tests for migrations/*_croft_community.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- A and B play (Vanderbilt); D is at Vanderbilt but never opened the game; N is at a school that
-- isn't linked, and still sees and visits all of it, since crofts work across schools
-- (migrations/*_crofts_across_schools.sql). The live database may hold real crofts too, so checks
-- look only at these students, and the valley's counts are compared with where they started.

begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b1000000-0000-4000-8000-00000000000b', 'b@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('d1000000-0000-4000-8000-00000000000d', 'd@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('c1000000-0000-4000-8000-00000000000c', 'n@northeastern.edu', '{"adult_confirmed": true}');
update public.profiles set onboarding_status = 'onboarded'
where id in ('a1000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-00000000000b',
             'd1000000-0000-4000-8000-00000000000d', 'c1000000-0000-4000-8000-00000000000c');

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select set_config('test.valley', public.croft_valley()::text, true);
set local request.jwt.claims to '{"sub": "c1000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select set_config('test.valley_n', public.croft_valley()::text, true);
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.croft_act('sow', 0, 'kale');
select public.croft_act('sow', 1, 'oats');
select public.croft_act('water', 1);

set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select public.croft_view();


-- The village --------------------------------------------------------------------------------------

select is(
  (select array_agg(owner_id order by owner_id) from public.croft_village()
   where owner_id in ('a1000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-00000000000d')),
  array['a1000000-0000-4000-8000-00000000000a']::uuid[],
  'B''s village lists A, who plays, and not D, who never opened the game'
);
select is(
  (select jsonb_build_array(dry_seeds, growing, ready, helped_today) from public.croft_village() where owner_id = 'a1000000-0000-4000-8000-00000000000a'),
  '[1, 1, 0, false]'::jsonb,
  'With what''s happening there: a seed waiting for water, a crop growing'
);
select is(
  (select jsonb_array_length(public.croft_view('d1000000-0000-4000-8000-00000000000d') -> 'tiles')),
  30,
  'Visiting D shows a starting croft'
);
reset role;
select is(
  (select count(*)::integer from public.crofts where user_id = 'd1000000-0000-4000-8000-00000000000d'),
  0,
  'Without making one, so D still isn''t in the village'
);
set local role authenticated;
set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select throws_ok(
  $$select public.croft_help('d1000000-0000-4000-8000-00000000000d', 0)$$,
  'P0001', 'Pick a crop that’s still growing.',
  'There''s nothing to help with on a croft nobody has played'
);


-- Thanking ----------------------------------------------------------------------------------------

select public.croft_help('a1000000-0000-4000-8000-00000000000a', 0);
select is(
  (select helped_today from public.croft_village() where owner_id = 'a1000000-0000-4000-8000-00000000000a'),
  true,
  'After helping, the village says so'
);
select is(
  (select count(*)::integer from public.croft_help where helper_id = 'b1000000-0000-4000-8000-00000000000b'),
  1,
  'The helper can see their own help, so a thank-you reaches them live'
);
select throws_ok(
  format('select public.croft_thank(%s)', (select id from public.croft_help where helper_id = 'b1000000-0000-4000-8000-00000000000b')),
  'P0001', 'That’s already been thanked.',
  'Only the owner can thank (for anyone else it''s as if there''s nothing to thank)'
);

set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select is(
  (select public.croft_view() -> 'helpers' -> 0 ->> 'thanked'),
  'false',
  'A sees B''s help, not yet thanked'
);
select is(
  (select public.croft_thank((public.croft_view() -> 'helpers' -> 0 ->> 'id')::bigint) -> 'helpers' -> 0 ->> 'thanked'),
  'true',
  'A thanks B'
);
select throws_ok(
  format('select public.croft_thank(%s)', (select public.croft_view() -> 'helpers' -> 0 ->> 'id')),
  'P0001', 'That’s already been thanked.',
  'Once per help'
);

set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select is(
  (select public.croft_view() -> 'thanks' -> 0 ->> 'crop'),
  'kale',
  'B''s croft shows the thank-you for watering A''s kale'
);


-- The valley --------------------------------------------------------------------------------------

reset role;
update public.croft_tiles set ready_at = now() - interval '1 minute'
where user_id = 'a1000000-0000-4000-8000-00000000000a' and idx = 1;
set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.croft_act('harvest', 1);

select is(
  (select jsonb_build_array(
     (v ->> 'harvests')::integer - (b ->> 'harvests')::integer,
     (v ->> 'helps')::integer - (b ->> 'helps')::integer,
     (v ->> 'crofts')::integer - (b ->> 'crofts')::integer)
   from public.croft_valley() v, (select current_setting('test.valley')::jsonb) x(b)),
  '[1, 1, 2]'::jsonb,
  'The valley counts this week''s harvest and help, and the two new crofts in it'
);

set local request.jwt.claims to '{"sub": "c1000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select is(
  (select jsonb_build_array(
     (v ->> 'harvests')::integer - (b ->> 'harvests')::integer,
     (v ->> 'helps')::integer - (b ->> 'helps')::integer,
     (v ->> 'crofts')::integer - (b ->> 'crofts')::integer)
   from public.croft_valley() v, (select current_setting('test.valley_n')::jsonb) x(b)),
  '[1, 1, 2]'::jsonb,
  'A student at another school shares the same valley'
);
select ok(
  exists (select 1 from public.croft_village() where owner_id = 'a1000000-0000-4000-8000-00000000000a'),
  'And sees A in the village'
);


-- "Visiting now" ----------------------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "b1000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select is(
  (select array_agg(id order by id) from public.croft_names(array['a1000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-00000000000c']::uuid[])),
  array['a1000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-00000000000c']::uuid[],
  'Names come back for visitors from any school'
);
select ok(
  private.croft_topic_allowed('croft:a1000000-0000-4000-8000-00000000000a'),
  'B may join the presence channel of A''s croft'
);
select ok(
  private.croft_topic_allowed('croft:c1000000-0000-4000-8000-00000000000c'),
  'And of a croft at another school'
);
select ok(
  not private.croft_topic_allowed('lobby:anything'),
  'Or of any channel that isn''t a croft'
);

set local request.jwt.claims to '{"sub": "c1000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select ok(
  private.croft_topic_allowed('croft:a1000000-0000-4000-8000-00000000000a'),
  'A student at another school can join A''s'
);
select public.block_student('a1000000-0000-4000-8000-00000000000a');
select throws_ok(
  $$select public.croft_view('a1000000-0000-4000-8000-00000000000a')$$,
  'P0001', 'That croft isn’t open to you.',
  'Blocking still closes crofts both ways'
);

reset role;

select * from finish();
rollback;
