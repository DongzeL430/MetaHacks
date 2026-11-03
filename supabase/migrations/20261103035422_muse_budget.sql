-- Guarding the Muse credit.
-- Every Edge Function that calls a Meta model first claims the use here, in one step: the
-- student's own limit for that kind (some kinds share one), then a budget shared by everyone.
-- Claims for the same student, and for the shared budget, wait their turn, so parallel clicks
-- can't slip past a limit. A use that fails on our side is refunded by deleting its row.
--
-- To change a limit or the budget, edit these tables in the SQL editor, for example:
--   update private.muse_settings set daily_budget_cents = 1500;
--   update private.muse_limits set per_user = 5 where kind = 'theme';


create table private.muse_limits (
  kind text primary key,
  -- Kinds with the same group share one limit (renames and avatar redraws)
  limit_group text not null,
  per_user integer not null check (per_user > 0),
  per_window interval not null,
  -- A rounded-up guess of what one use costs, for the shared budget
  cost_cents integer not null check (cost_cents >= 0)
);

insert into private.muse_limits (kind, limit_group, per_user, per_window, cost_cents) values
  ('read_schedule', 'read_schedule', 5, interval '1 day', 1),
  ('suggest_courses', 'suggest_courses', 3, interval '1 day', 20),
  ('format_courses', 'format_courses', 10, interval '1 day', 8),
  ('theme', 'theme', 3, interval '7 days', 3),
  ('nickname', 'identity', 3, interval '1 day', 1),
  ('avatar', 'identity', 3, interval '1 day', 4),
  ('avatar_starter', 'avatar_starter', 3, interval '100 years', 4);

create table private.muse_settings (
  only_row boolean primary key default true check (only_row),
  -- Everyone's Muse use together, over any 24 hours. $10 a day keeps a $150 credit going for
  -- two weeks even if every limit is used up.
  daily_budget_cents integer not null check (daily_budget_cents >= 0)
);

insert into private.muse_settings (daily_budget_cents) values (1000);

-- For adding up the last day's use
create index ai_requests_created_at_idx on public.ai_requests (created_at);


-- Claiming a use (server code) --------------------------------------------------------------------
-- Returns {"ok": true, "id": <ai_requests id>, "left": <uses left after this one>}, or
-- {"ok": false, "reason": "student", "retry_at": <when one frees up>} when the student is out, or
-- {"ok": false, "reason": "everyone"} when today's shared budget is spent.

create function public.claim_muse_use(student uuid, what text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim private.muse_limits%rowtype;
  used integer;
  oldest timestamptz;
  spent integer;
  new_id bigint;
begin
  select * into lim from private.muse_limits where kind = what;
  if lim.kind is null then
    raise exception 'Unknown Muse use: %', what;
  end if;

  -- One claim at a time per student and limit, then one at a time for the shared budget
  perform pg_advisory_xact_lock(hashtext('muse:' || student::text || ':' || lim.limit_group));
  select count(*), min(r.created_at) into used, oldest
  from public.ai_requests r
  join private.muse_limits l on l.kind = r.kind
  where r.user_id = student and l.limit_group = lim.limit_group and r.created_at > now() - lim.per_window;
  if used >= lim.per_user then
    return jsonb_build_object('ok', false, 'reason', 'student', 'retry_at', oldest + lim.per_window);
  end if;

  perform pg_advisory_xact_lock(hashtext('muse:budget'));
  select coalesce(sum(l.cost_cents), 0) into spent
  from public.ai_requests r
  join private.muse_limits l on l.kind = r.kind
  where r.created_at > now() - interval '24 hours';
  if spent + lim.cost_cents > (select daily_budget_cents from private.muse_settings) then
    return jsonb_build_object('ok', false, 'reason', 'everyone');
  end if;

  insert into public.ai_requests (user_id, kind) values (student, what) returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id, 'left', lim.per_user - used - 1);
end;
$$;

revoke execute on function public.claim_muse_use(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_muse_use(uuid, text) to service_role;


-- What the signed-in student has left -------------------------------------------------------------

create function public.muse_uses_left(what text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, lim.per_user - (
    select count(*)::integer
    from public.ai_requests r
    join private.muse_limits l on l.kind = r.kind
    where r.user_id = (select auth.uid())
      and l.limit_group = lim.limit_group
      and r.created_at > now() - lim.per_window
  ))
  from private.muse_limits lim
  where lim.kind = what
$$;

revoke execute on function public.muse_uses_left(text) from public, anon;
grant execute on function public.muse_uses_left(text) to authenticated;

-- Renames and redraws now read their limit from private.muse_limits
create or replace function public.identity_changes_left()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.muse_uses_left('nickname')
$$;
