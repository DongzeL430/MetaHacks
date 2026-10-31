-- Tests for migrations/*_study_record.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.
-- Session 1: A and B studied together. Session 2: C alone. All at Northeastern.

begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b4000000-0000-4000-8000-00000000000b', 'b@northeastern.edu', '{"adult_confirmed": true}'),
  ('c4000000-0000-4000-8000-00000000000c', 'c@northeastern.edu', '{"adult_confirmed": true}'),
  ('d4000000-0000-4000-8000-00000000000d', 'd@northeastern.edu', '{"adult_confirmed": true}'),
  ('e4000000-0000-4000-8000-00000000000e', 'e@northeastern.edu', '{"adult_confirmed": true}');

insert into public.courses (university_domain, code) values ('northeastern.edu', 'TEST 2500');

insert into public.study_sessions (course_id, location, starts_at, ends_at, status)
select id, 'test: Snell Library, 2nd floor', '2026-11-02 18:00-05', '2026-11-02 20:00-05', 'completed'
from public.courses where code = 'TEST 2500';
insert into public.study_sessions (course_id, location, starts_at, ends_at)
select id, 'test: Curry Student Center', '2026-11-03 15:00-05', '2026-11-03 16:00-05'
from public.courses where code = 'TEST 2500';

-- Students only see their own sessions, so remember the ids while running as the test owner.
do $$
begin
  perform set_config('test.s1', (select id::text from public.study_sessions where location = 'test: Snell Library, 2nd floor'), true);
  perform set_config('test.s2', (select id::text from public.study_sessions where location = 'test: Curry Student Center'), true);
end;
$$;

insert into public.study_session_members (session_id, user_id) values
  (current_setting('test.s1')::bigint, 'a4000000-0000-4000-8000-00000000000a'),
  (current_setting('test.s1')::bigint, 'b4000000-0000-4000-8000-00000000000b'),
  (current_setting('test.s2')::bigint, 'c4000000-0000-4000-8000-00000000000c');


-- What students can see and do --------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "a4000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select is(
  (select count(*)::integer from public.study_sessions where location like 'test:%'),
  1,
  'A student sees the sessions they were in'
);
select is(
  (select count(*)::integer from public.study_session_members where session_id = current_setting('test.s1')::bigint),
  2,
  'A student sees who was in their session'
);
select is(
  (select count(*)::integer from public.study_session_members where session_id = current_setting('test.s2')::bigint),
  0,
  'A student cannot see who was in someone else''s session'
);
select throws_ok(
  $$insert into public.study_sessions (location, starts_at, ends_at)
    values ('Anywhere', now(), now() + interval '1 hour')$$,
  '42501', null,
  'Students cannot add sessions'
);
select throws_ok(
  $$insert into public.study_session_members (session_id, user_id)
    values (current_setting('test.s2')::bigint, 'a4000000-0000-4000-8000-00000000000a')$$,
  '42501', null,
  'Students cannot add themselves to a session'
);
select throws_ok(
  $$update public.study_sessions set status = 'cancelled'$$,
  '42501', null,
  'Students cannot change a session'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "c4000000-0000-4000-8000-00000000000c", "role": "authenticated"}';

select is(
  (select count(*)::integer from public.study_sessions where id = current_setting('test.s1')::bigint),
  0,
  'Nobody outside a session can see it'
);

reset role;
set local role anon;

select throws_ok($$select * from public.study_sessions$$, '42501', null, 'Signed-out visitors cannot read sessions');

reset role;


-- Rules every session follows ----------------------------------------------------------------

select throws_ok(
  $$insert into public.study_sessions (location, starts_at, ends_at)
    values ('Snell Library', '2026-11-02 20:00-05', '2026-11-02 18:00-05')$$,
  '23514', null,
  'A session must end after it starts'
);
select throws_ok(
  $$insert into public.study_sessions (location, starts_at, ends_at)
    values (repeat('x', 121), '2026-11-02 18:00-05', '2026-11-02 20:00-05')$$,
  '23514', null,
  'Locations are capped at 120 characters'
);
select throws_ok(
  $$insert into public.study_sessions (location, starts_at, ends_at)
    values (E'Snell\nLibrary', '2026-11-02 18:00-05', '2026-11-02 20:00-05')$$,
  '23514', null,
  'Locations are one line'
);

select lives_ok(
  $$insert into public.study_session_members (session_id, user_id) values
    (current_setting('test.s1')::bigint, 'c4000000-0000-4000-8000-00000000000c'),
    (current_setting('test.s1')::bigint, 'd4000000-0000-4000-8000-00000000000d')$$,
  'A session can hold up to 4 people'
);
select throws_ok(
  $$insert into public.study_session_members (session_id, user_id)
    values (current_setting('test.s1')::bigint, 'e4000000-0000-4000-8000-00000000000e')$$,
  '23514', null,
  'A 5th person is rejected'
);
select throws_ok(
  $$insert into public.study_session_members (session_id, user_id)
    values (current_setting('test.s2')::bigint, 'c4000000-0000-4000-8000-00000000000c')$$,
  '23505', null,
  'The same person cannot be in a session twice'
);

set local role service_role;
select lives_ok(
  $$insert into public.study_sessions (location, starts_at, ends_at)
    values ('Snell Library', '2026-11-04 18:00-05', '2026-11-04 19:00-05')$$,
  'Server code can record a session'
);
reset role;


-- Deletions --------------------------------------------------------------------------------

delete from auth.users where id = 'b4000000-0000-4000-8000-00000000000b';

select ok(
  exists (select 1 from public.study_sessions where id = current_setting('test.s1')::bigint)
  and not exists (
    select 1 from public.study_session_members
    where session_id = current_setting('test.s1')::bigint and user_id = 'b4000000-0000-4000-8000-00000000000b'
  ),
  'When a partner deletes their account, the session stays in the others'' record without them'
);

delete from public.courses where code = 'TEST 2500';

select ok(
  exists (select 1 from public.study_sessions where id = current_setting('test.s1')::bigint and course_id is null),
  'Removing a course from the list keeps the session'
);

select * from finish();
rollback;
