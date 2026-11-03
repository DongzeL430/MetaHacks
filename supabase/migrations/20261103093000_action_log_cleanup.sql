-- The spam-limit log (public.action_log) only ever counts the last 24 hours, but it kept every
-- row, and My Croft adds one per move. Now each time a student acts, their own entries of that
-- kind older than a day are deleted first, so the log stays about one day long per student.

create or replace function private.count_action(what text, per_day integer, message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.action_log
  where user_id = (select auth.uid()) and kind = what and created_at <= now() - interval '24 hours';

  if (
    select count(*) from public.action_log
    where user_id = (select auth.uid()) and kind = what and created_at > now() - interval '24 hours'
  ) >= per_day then
    raise exception '%', message using errcode = 'P0001';
  end if;
  insert into public.action_log (user_id, kind) values ((select auth.uid()), what);
end;
$$;

-- Anything already older than a day
delete from public.action_log where created_at <= now() - interval '24 hours';
