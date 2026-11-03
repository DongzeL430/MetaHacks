-- Study spots: real places to study at each school, found by Muse Spark on the school's own
-- website (the study-spots Edge Function). One list per school, shared by everyone there and kept
-- for 30 days, so only the first student at a school sets off a search. Hosts pick from it when
-- they host a session. Muse never invents a place: each one comes with the school page it's on.

create table public.study_spots (
  university_domain text primary key references public.universities (domain) on delete cascade,
  -- [{ name, area, kind, noise, source }]
  spots jsonb not null check (jsonb_typeof(spots) = 'array'),
  searched_at timestamptz not null default now()
);

alter table public.study_spots enable row level security;
revoke all on public.study_spots from anon, authenticated;
grant select on public.study_spots to authenticated;

-- Only the student's own school's list; the Edge Function writes it
create policy "Students see their school's study spots"
  on public.study_spots for select to authenticated
  using (university_domain = (select private.my_university()));

-- Counted like every other Muse use: 3 searches a day per student, about 10 cents each
alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests
  add constraint ai_requests_kind_check check (kind in (
    'read_schedule', 'suggest_courses', 'format_courses', 'theme', 'nickname', 'avatar', 'avatar_starter', 'study_spots'
  ));

insert into private.muse_limits (kind, limit_group, per_user, per_window, cost_cents)
values ('study_spots', 'study_spots', 3, interval '1 day', 10);
