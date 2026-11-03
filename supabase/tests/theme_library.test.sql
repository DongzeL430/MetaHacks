-- Tests for migrations/*_theme_library.sql.
-- Everything runs in one transaction that is rolled back, so no test data is left behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-00000000000a', 'a@northeastern.edu', '{"adult_confirmed": true}'),
  ('b2000000-0000-4000-8000-00000000000b', 'b@northeastern.edu', '{"adult_confirmed": true}');

-- Server code (the test owner here) saves A's themes
insert into public.saved_themes (id, user_id, theme) values
  ('10000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-00000000000a', '{"version": 1, "name": "Forest"}'),
  ('10000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-00000000000a', '{"version": 1, "name": "Ocean"}');
insert into public.user_themes (user_id, theme, use_custom, saved_theme_id)
values ('a1000000-0000-4000-8000-00000000000a', '{"version": 1, "name": "Ocean"}', true, '10000000-0000-4000-8000-000000000002');

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select is((select count(*)::integer from public.saved_themes), 2, 'A student sees every theme they made');
select throws_ok(
  $$insert into public.saved_themes (theme) values ('{"version": 1, "name": "Sneaky"}')$$,
  '42501', null,
  'Students can''t add to the library themselves; only the theme function does'
);
select lives_ok(
  $$update public.user_themes set theme = '{"version": 1, "name": "Forest"}', saved_theme_id = '10000000-0000-4000-8000-000000000001'
    where user_id = 'a1000000-0000-4000-8000-00000000000a'$$,
  'A student can switch to another saved theme'
);
select lives_ok(
  $$delete from public.saved_themes where id = '10000000-0000-4000-8000-000000000001'$$,
  'A student can delete a saved theme'
);
select is(
  (select saved_theme_id from public.user_themes where user_id = 'a1000000-0000-4000-8000-00000000000a'),
  null::uuid,
  'Deleting the theme in use leaves its copy in place, no longer linked to the library'
);

set local request.jwt.claims to '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
select is((select count(*)::integer from public.saved_themes), 0, 'Another student sees none of them');
select lives_ok(
  $$delete from public.saved_themes where id = '10000000-0000-4000-8000-000000000002'$$,
  'Another student deleting one does nothing'
);

reset role;

select is(
  (select count(*)::integer from public.saved_themes where id = '10000000-0000-4000-8000-000000000002'),
  1,
  'And the theme is still there'
);

select * from finish();
rollback;
