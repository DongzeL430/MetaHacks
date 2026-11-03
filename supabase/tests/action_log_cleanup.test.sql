-- Tests for migrations/*_action_log_cleanup.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@vanderbilt.edu', '{"adult_confirmed": true}'),
  ('b1000000-0000-4000-8000-00000000000b', 'b@vanderbilt.edu', '{"adult_confirmed": true}');
update public.profiles set onboarding_status = 'onboarded'
where id in ('a1000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-00000000000b');

-- Yesterday's moves, and B's from two days ago
insert into public.action_log (user_id, kind, created_at)
select 'a1000000-0000-4000-8000-00000000000a', 'croft', now() - interval '2 days' from generate_series(1, 5);
insert into public.action_log (user_id, kind, created_at)
values ('a1000000-0000-4000-8000-00000000000a', 'croft', now() - interval '1 hour'),
       ('a1000000-0000-4000-8000-00000000000a', 'connect', now() - interval '2 days'),
       ('b1000000-0000-4000-8000-00000000000b', 'croft', now() - interval '2 days');

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select public.croft_act('till', 10);
reset role;

select is(
  (select count(*)::integer from public.action_log
   where user_id = 'a1000000-0000-4000-8000-00000000000a' and kind = 'croft' and created_at <= now() - interval '24 hours'),
  0,
  'A croft move deletes that student''s croft entries older than a day'
);
select is(
  (select count(*)::integer from public.action_log
   where user_id = 'a1000000-0000-4000-8000-00000000000a' and kind = 'croft'),
  2,
  'The last day''s entry stays, and the new move is counted'
);
select is(
  (select count(*)::integer from public.action_log
   where user_id = 'a1000000-0000-4000-8000-00000000000a' and kind = 'connect'),
  1,
  'Other kinds wait for their own next use'
);
select is(
  (select count(*)::integer from public.action_log where user_id = 'b1000000-0000-4000-8000-00000000000b'),
  1,
  'Other students'' entries are left alone'
);

select * from finish();
rollback;
