-- Tests for migrations/*_accounts.sql.
-- Run: npx supabase@2.122.0 test db --linked
-- Everything runs in one transaction that is rolled back, so no test data is left behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(25);


-- Sign-up hook ---------------------------------------------------------------

select is(
  public.hook_before_user_created('{"user": {"email": "a@gmail.com", "user_metadata": {"adult_confirmed": true}}}')->'error'->>'http_code',
  '400',
  'Hook rejects a non-.edu email'
);

select is(
  public.hook_before_user_created('{"user": {"email": "a@northeastern.edu", "user_metadata": {}}}')->'error'->>'http_code',
  '400',
  'Hook rejects a sign-up without the 18+ flag'
);

select is(
  public.hook_before_user_created('{"user": {"email": "a@cs.northeastern.edu", "user_metadata": {"adult_confirmed": true}}}'),
  '{}'::jsonb,
  'Hook accepts a .edu email with the 18+ flag'
);

select is(private.edu_domain('a@cs.stanford.edu'), 'stanford.edu', 'Subdomains reduce to the school domain');
select is(private.edu_domain('A@NorthEastern.EDU'), 'northeastern.edu', 'Domains are lowercased');
select ok(private.edu_domain('a@stanford.edu.example.com') is null, 'A domain that only contains .edu is rejected');


-- New-user trigger -----------------------------------------------------------

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'b@gmail.com', '{"adult_confirmed": true}')$$,
  'P0001', null,
  'Saving a non-.edu user fails even when the hook is bypassed'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'b@northeastern.edu', '{}')$$,
  'P0001', null,
  'Saving a user without the 18+ flag fails'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'a@husky.northeastern.edu', '{"adult_confirmed": true}'),
  ('b0000000-0000-4000-8000-000000000002', 'b@mit.edu', '{"adult_confirmed": true}');

select is(
  (select university_domain from public.profiles where id = 'a0000000-0000-4000-8000-000000000001'),
  'northeastern.edu',
  'University comes from the email domain'
);

select ok(
  exists (select 1 from public.universities where domain = 'mit.edu' and name is null),
  'An unlisted school is added by domain, without a name'
);

select matches(
  (select nickname from public.public_profiles where id = 'a0000000-0000-4000-8000-000000000001'),
  '^[A-Z][a-z]+ Penguin [0-9]+$',
  'A nickname like "Sleepy Penguin 42" is generated'
);

select is(
  (select onboarding_status::text from public.profiles where id = 'a0000000-0000-4000-8000-000000000001'),
  'new',
  'New accounts start outside the match pool'
);


-- Signed in as user A ----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}';

select is((select count(*)::integer from public.profiles), 1, 'A user can read only their own private profile');

select is(
  (select count(*)::integer from public.public_profiles where id = 'b0000000-0000-4000-8000-000000000002'),
  0,
  'Accounts that have not finished onboarding are hidden'
);

select throws_ok(
  $$update public.public_profiles set points = 999 where id = 'a0000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'Users cannot change their own points'
);

select throws_ok(
  $$update public.profiles set onboarding_status = 'onboarded' where id = 'a0000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'Users cannot mark themselves as onboarded'
);

select lives_ok(
  $$update public.profiles set major = 'Computer Science' where id = 'a0000000-0000-4000-8000-000000000001'$$,
  'Users can edit their own major'
);

-- Row level security skips rows the user can't see, so this succeeds but changes nothing.
update public.profiles set major = 'Changed by A'
where id = 'b0000000-0000-4000-8000-000000000002';

reset role;

select ok(
  (select major from public.profiles where id = 'b0000000-0000-4000-8000-000000000002') is null,
  'Users cannot edit someone else''s profile'
);


-- After user B finishes onboarding ------------------------------------------------

update public.profiles set onboarding_status = 'onboarded'
where id = 'b0000000-0000-4000-8000-000000000002';

set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}';

select is(
  (select count(*)::integer from public.public_profiles where id = 'b0000000-0000-4000-8000-000000000002'),
  1,
  'Onboarded accounts are visible to other students'
);

select is(
  (select count(*)::integer from public.profiles where id = 'b0000000-0000-4000-8000-000000000002'),
  0,
  'Private profile data stays hidden after onboarding'
);

reset role;


-- Signed out -----------------------------------------------------------------

set local role anon;

select throws_ok(
  $$select * from public.public_profiles$$,
  '42501', null,
  'Signed-out visitors cannot read profiles'
);

reset role;


-- Email changes ----------------------------------------------------------------

select throws_ok(
  $$update auth.users set email_change = 'a@gmail.com' where id = 'a0000000-0000-4000-8000-000000000001'$$,
  'P0001', null,
  'Requesting a change to a non-.edu email is blocked'
);

select throws_ok(
  $$update auth.users set email = 'a@gmail.com' where id = 'a0000000-0000-4000-8000-000000000001'$$,
  'P0001', null,
  'Switching to a non-.edu email is blocked'
);

update auth.users set email = 'a@bu.edu' where id = 'a0000000-0000-4000-8000-000000000001';

select is(
  (select university_domain from public.profiles where id = 'a0000000-0000-4000-8000-000000000001'),
  'bu.edu',
  'Moving to another school email updates the university'
);


-- Account deletion -------------------------------------------------------------

delete from auth.users where id = 'a0000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.public_profiles where id = 'a0000000-0000-4000-8000-000000000001'),
  0,
  'Deleting an account removes its profiles'
);

select * from finish();
rollback;
