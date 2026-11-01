-- Tests for migrations/*_ai_requests.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email, raw_user_meta_data)
values ('a6000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}');

insert into public.ai_requests (user_id, kind)
values ('a6000000-0000-4000-8000-00000000000a', 'read_schedule');

set local role authenticated;
set local request.jwt.claims to '{"sub": "a6000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select throws_ok(
  $$select * from public.ai_requests$$,
  '42501', null,
  'Students cannot read the usage log, even their own rows'
);
select throws_ok(
  $$insert into public.ai_requests (user_id, kind) values ('a6000000-0000-4000-8000-00000000000a', 'read_schedule')$$,
  '42501', null,
  'Students cannot add to the usage log'
);
select throws_ok(
  $$delete from public.ai_requests$$,
  '42501', null,
  'Students cannot erase their usage to get around the daily limit'
);

reset role;

select throws_ok(
  $$insert into public.ai_requests (user_id, kind) values ('a6000000-0000-4000-8000-00000000000a', 'something_else')$$,
  '23514', null,
  'Only known request kinds are logged'
);

delete from auth.users where id = 'a6000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::integer from public.ai_requests where user_id = 'a6000000-0000-4000-8000-00000000000a'),
  0,
  'Deleting an account removes its usage log'
);

select * from finish();
rollback;
