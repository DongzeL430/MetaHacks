-- Tests for migrations/*_course_search.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- Students A and B at Northeastern.

begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b7000000-0000-4000-8000-00000000000b', 'b@northeastern.edu', '{"adult_confirmed": true}');


-- Majors and minors ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "a7000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select lives_ok(
  $$insert into public.user_programs (kind, position, name, track)
    values ('major', 1, 'Computer Science', 'Artificial Intelligence')$$,
  'A student can add a major with a track'
);
select lives_ok(
  $$insert into public.user_programs (kind, position, name) values
    ('major', 2, 'Mathematics'), ('major', 3, 'Physics'), ('minor', 1, 'Music')$$,
  'A student can have up to three majors, plus minors'
);
select throws_ok(
  $$insert into public.user_programs (kind, position, name) values ('major', 4, 'Chemistry')$$,
  '23514', null,
  'A fourth major is rejected'
);
select throws_ok(
  $$insert into public.user_programs (kind, position, name, track) values ('minor', 2, 'Art', 'Painting')$$,
  '23514', null,
  'Only majors have a track'
);
select throws_ok(
  $$insert into public.user_programs (kind, position, name) values ('minor', 2, '  MUSIC ')$$,
  '23505', null,
  'The same program cannot be added twice, whatever the capitalization'
);
select throws_ok(
  $$insert into public.user_programs (user_id, kind, position, name)
    values ('b7000000-0000-4000-8000-00000000000b', 'minor', 1, 'Art')$$,
  '42501', null,
  'A student cannot add programs for someone else'
);
select throws_ok(
  $$select * from public.course_search_cache$$,
  '42501', null,
  'Students cannot read the search cache directly'
);
select throws_ok(
  $$select public.add_found_courses('northeastern.edu', '[{"code": "CS 9999", "title": "Made up"}]')$$,
  '42501', null,
  'Students cannot add courses to the shared list through the server function'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "b7000000-0000-4000-8000-00000000000b", "role": "authenticated"}';

select is((select count(*)::integer from public.user_programs), 0, 'Programs are private to their student');

reset role;


-- Adding found courses (server) ------------------------------------------------------------------

-- A student added this code earlier, without a title.
insert into public.courses (university_domain, code, created_by)
values ('northeastern.edu', 'TEST 3000', 'a7000000-0000-4000-8000-00000000000a');

-- Server code calls with the service key, so no student is signed in.
set local role service_role;
set local request.jwt.claims to '{"role": "service_role"}';
select lives_ok(
  $$select public.add_found_courses('northeastern.edu',
    '[{"code": "TEST 2500", "title": "Fundamentals of Testing 1"}, {"code": "TEST3000", "title": "Object-Oriented Testing"}]')$$,
  'Server code can add found courses to the shared list'
);
reset role;

select ok(
  (select count(*) from public.courses where university_domain = 'northeastern.edu' and code like 'TEST%') = 2
  and exists (select 1 from public.courses where code = 'TEST 2500' and title = 'Fundamentals of Testing 1' and created_by is null)
  and exists (select 1 from public.courses where code = 'TEST 3000' and title = 'Object-Oriented Testing'),
  'Found courses are added once, and an existing course without a title gets one'
);


-- Other changes -----------------------------------------------------------------------------

select lives_ok(
  $$insert into public.ai_requests (user_id, kind) values ('a7000000-0000-4000-8000-00000000000a', 'suggest_courses')$$,
  'Course searches are counted in the usage log'
);
select hasnt_column('public', 'profiles', 'major', 'The single major column is gone; majors live in user_programs');

delete from auth.users where id = 'a7000000-0000-4000-8000-00000000000a';
select is(
  (select count(*)::integer from public.user_programs where user_id = 'a7000000-0000-4000-8000-00000000000a'),
  0,
  'Deleting an account removes its programs'
);

select * from finish();
rollback;
