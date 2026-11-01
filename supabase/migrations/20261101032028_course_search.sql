-- "Find courses": Muse Spark searches the school's catalog for each of a student's majors and
-- minors. This adds planned courses, the student's programs, a shared cache of searches, and a
-- way for server code to add the courses it finds to the school's shared course list.


-- Planned courses -----------------------------------------------------------------------------
-- Postgres can't use a new enum value in the migration that adds it, so nothing below refers to
-- 'planned'. A grade stays required only for completed courses.

alter type public.course_status add value if not exists 'planned';

alter table public.user_courses drop constraint completed_courses_have_a_grade;
alter table public.user_courses
  add constraint completed_courses_have_a_grade check (status <> 'completed' or grade is not null);


-- Majors and minors ---------------------------------------------------------------------------
-- Private, like the rest of a student's academic details. Not used in matching. Replaces the
-- single profiles.major column, which nothing used yet.

alter table public.profiles drop column major;

create type public.program_kind as enum ('major', 'minor');

create table public.user_programs (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.program_kind not null,
  -- 1 to 3 keeps each student to three majors and three minors, and keeps their order.
  position smallint not null check (position between 1 and 3),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  -- Track or concentration. Only majors have one.
  track text check (char_length(btrim(track)) between 2 and 80),
  primary key (user_id, kind, position),
  constraint only_majors_have_tracks check (kind = 'major' or track is null)
);

create unique index user_programs_no_repeats_idx on public.user_programs (user_id, kind, lower(btrim(name)));

alter table public.user_programs enable row level security;
revoke all on public.user_programs from anon, authenticated;
grant select, insert (kind, position, name, track), update (position, name, track), delete
  on public.user_programs to authenticated;

create policy "Students manage their own programs"
  on public.user_programs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- Shared search cache -------------------------------------------------------------------------
-- One program at one school for one graduation year. Classmates in the same program reuse it
-- for 7 days instead of paying for a new search. Server code only.

create table public.course_search_cache (
  university_domain text not null references public.universities (domain) on delete cascade,
  kind public.program_kind not null,
  -- Lowercased with single spaces, so "Computer  science" and "Computer Science" match.
  program_key text not null,
  -- Same for the track; '' when there is none.
  track_key text not null default '',
  grad_year smallint not null,
  courses jsonb not null,
  sources jsonb not null default '[]'::jsonb,
  searched_at timestamptz not null default now(),
  primary key (university_domain, kind, program_key, track_key, grad_year)
);

alter table public.course_search_cache enable row level security;
revoke all on public.course_search_cache from anon, authenticated;


-- Usage log -----------------------------------------------------------------------------------

alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests
  add constraint ai_requests_kind_check check (kind in ('read_schedule', 'suggest_courses'));


-- Adding found courses to the shared list -------------------------------------------------------
-- Server code adds what Muse found, with official titles. Courses already on the list are kept,
-- and get a title if they had none. found is a JSON array of { "code", "title" }.

create function public.add_found_courses(school text, found jsonb)
returns void
language sql
set search_path = ''
as $$
  -- created_by stays empty: these come from the school's catalog, not from a student.
  insert into public.courses (university_domain, code, title, created_by)
  select school, f.code, f.title, null
  from jsonb_to_recordset(found) as f (code text, title text)
  on conflict do nothing;

  update public.courses c
  set title = f.title
  from jsonb_to_recordset(found) as f (code text, title text)
  where c.university_domain = school
    and replace(c.code, ' ', '') = replace(f.code, ' ', '')
    and c.title is null;
$$;

revoke execute on function public.add_found_courses(text, jsonb) from public, anon, authenticated;
grant execute on function public.add_found_courses(text, jsonb) to service_role;
