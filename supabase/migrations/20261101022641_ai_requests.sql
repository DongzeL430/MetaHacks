-- One row per call a student makes to a paid Meta model, so server code can cap each student's
-- daily use and one account can't drain the API credits. Only server code reads or writes it.

create table public.ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('read_schedule')),
  created_at timestamptz not null default now()
);

-- For "how many has this student used in the last day".
create index ai_requests_user_kind_time_idx on public.ai_requests (user_id, kind, created_at);

alter table public.ai_requests enable row level security;
revoke all on public.ai_requests from anon, authenticated;
