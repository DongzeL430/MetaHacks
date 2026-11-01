-- "Delete my account": a signed-in student deletes their own account and everything tied to it.
--
-- Deleting the auth user runs the cascades already set up: profiles, courses, availability,
-- answers, interests, accessories, pairings, choices, shares, and blocks go with it. Shared
-- study sessions stay in partners' records without them, courses they added stay in the
-- school's list, and reports they filed stay for review with the reporter removed.
--
-- The function takes no arguments, so a student can only ever delete themselves.

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to delete your account' using errcode = '42501';
  end if;

  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
