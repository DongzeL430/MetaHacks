-- Tests for migrations/*_nicknames_and_avatars.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email, raw_user_meta_data)
select ('a1000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'n' || g || '@northeastern.edu', '{"adult_confirmed": true}'
from generate_series(1, 30) as g;

select is(
  (select count(*)::integer from public.public_profiles
   where id::text like 'a1000000-%' and nickname ~ '^[A-Z][a-z]+ [A-Z][a-z]+( [0-9]+)?$'),
  30,
  'New students get an adjective and an animal, with a number only when needed'
);
select is(
  (select max(char_length(nickname)) <= 24 from public.public_profiles where id::text like 'a1000000-%'),
  true,
  'Generated nicknames fit in 24 characters'
);

-- Server code (the test owner here) renames students
update public.public_profiles set nickname = 'Zzyzx Otter' where id = 'a1000000-0000-4000-8000-000000000001';
select throws_ok(
  $$update public.public_profiles set nickname = 'zzyzx otter' where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '23505', null,
  'Two nicknames can''t differ only in capitals'
);
select throws_ok(
  $$update public.public_profiles set nickname = ' Spacey ' where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '23514', null,
  'Nicknames have no spaces at the ends'
);
select throws_ok(
  $$update public.public_profiles set nickname = 'A' where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '23514', null,
  'Nicknames are 2 to 24 characters'
);
select throws_ok(
  $$update public.public_profiles set avatar_path = 'https://example.com/x.png' where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '23514', null,
  'An avatar is a file in the avatars bucket, not any link'
);
select ok(
  exists (select 1 from storage.buckets where id = 'avatars' and public),
  'The avatars bucket exists and is public'
);


-- Students ------------------------------------------------------------------------------------

insert into public.ai_requests (user_id, kind) values
  ('a1000000-0000-4000-8000-000000000001', 'nickname'),
  ('a1000000-0000-4000-8000-000000000001', 'avatar_starter');

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-000000000001", "role": "authenticated"}';

select is(public.identity_changes_left(), 2, 'A rename counts toward the 3 a day; the first avatar does not');
select throws_ok(
  $$update public.public_profiles set nickname = 'Chosen Myself' where id = 'a1000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'Students can''t rename themselves without the server''s checks'
);

reset role;
set local role anon;

select throws_ok($$select public.identity_changes_left()$$, '42501', null, 'Signed-out visitors cannot check the limit');

reset role;

select * from finish();
rollback;
