-- Tests for migrations/*_study_spots.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}'),
  ('c1000000-0000-4000-8000-00000000000c', 'c@mit.edu', '{"adult_confirmed": true}');

-- Server code (the test owner here) saves Northeastern's list
insert into public.study_spots (university_domain, spots)
values ('northeastern.edu', '[{"name": "Snell Library", "area": "Floor 2", "kind": "library", "noise": "quiet", "source": "https://library.northeastern.edu/"}]')
on conflict (university_domain) do update set spots = excluded.spots;

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select is((select spots->0->>'name' from public.study_spots), 'Snell Library', 'A student sees their school''s study spots');
select throws_ok(
  $$insert into public.study_spots (university_domain, spots) values ('northeastern.edu', '[]')$$,
  '42501', null,
  'Students can''t write the list; only the study-spots function does'
);

set local request.jwt.claims to '{"sub": "c1000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
select is((select count(*)::integer from public.study_spots where university_domain = 'northeastern.edu'), 0, 'Another school''s list stays theirs');

reset role;
select is(
  (select per_user from private.muse_limits where kind = 'study_spots'),
  3,
  'Study spot searches count toward the Muse limits'
);

select * from finish();
rollback;
