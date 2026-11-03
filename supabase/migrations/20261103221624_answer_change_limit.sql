-- A daily limit on changing survey answers after the survey is done. Lobby reasons ("Similar study
-- habits") come from the host's answers, so flipping one answer again and again and watching the
-- reasons change could work out a host's single answers. 20 saves a day is plenty for real edits.
-- The survey itself (before onboarding) has no limit. Deletes aren't counted, so deleting an
-- account always works.

alter table public.action_log drop constraint action_log_kind_check;
alter table public.action_log
  add constraint action_log_kind_check check (kind in (
    'host_lobby', 'join_request', 'connect', 'croft', 'kick', 'lobby_invite', 'block', 'report', 'answers'
  ));

create function private.count_answer_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_onboarded((select auth.uid())) then
    perform private.count_action('answers', 20, 'You’ve changed your survey answers a lot today. Try again tomorrow.');
  end if;
  return null;
end;
$$;
revoke execute on function private.count_answer_change() from public, anon, authenticated;

-- Once per save (save_my_answers is one delete and one insert), or per direct insert or update
create trigger survey_answers_daily_limit before insert or update on public.survey_answers
  for each statement execute function private.count_answer_change();
