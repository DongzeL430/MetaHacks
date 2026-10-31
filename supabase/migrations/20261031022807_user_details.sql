-- Step 2 of the user data layer: courses and grades, weekly availability, the This or That
-- survey, interests, contact handles, and penguin accessories.
--
-- Structure only. Matching, accessory unlocking, and AI question generation come later.
--
-- To keep prejudice out of pairing, nothing here describes who a person is. Grades, major,
-- and contact handles are private; interests come from a fixed list instead of free text.
--
-- Students read and write their own rows directly from the frontend. Each table caps how many
-- rows one student can add, so a single account can't flood it.


-- Shared helpers ---------------------------------------------------------------

-- Rejects an insert once the owner already has max_rows rows in this table.
-- Attach with: execute function private.enforce_row_limit('<owner column>', '<max rows>').
create function private.enforce_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  owner_column text := tg_argv[0];
  max_rows integer := tg_argv[1]::integer;
  existing integer;
begin
  execute format('select count(*) from %I.%I where %I = $1', tg_table_schema, tg_table_name, owner_column)
    into existing
    using (to_jsonb(new) ->> owner_column)::uuid;

  if existing >= max_rows then
    raise exception 'You can add at most % of these', max_rows
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create function private.my_university()
returns text
language sql
stable
set search_path = ''
as $$
  select university_domain from public.profiles where id = (select auth.uid())
$$;

revoke execute on function private.enforce_row_limit() from public, anon, authenticated;
revoke execute on function private.my_university() from public, anon;
grant execute on function private.my_university() to authenticated;

-- Who wrote a survey question or made an accessory: our team or Muse AI.
create type public.content_source as enum ('team', 'ai');


-- Courses ------------------------------------------------------------------------
-- One shared list per school, so two students in "CS 2500" point at the same row and the
-- frontend can offer autocomplete. Codes are stored uppercase with single spaces;
-- "CS2500" and "CS 2500" count as the same course. Students can only enter the code, from a
-- small character set, because every student at the school sees this list. Titles are
-- filled in by server code.

create table public.courses (
  id bigint generated always as identity primary key,
  university_domain text not null default private.my_university()
    references public.universities (domain),
  code text not null check (
    char_length(code) between 2 and 20
    and code ~ '^[A-Z0-9][A-Z0-9 ./-]*$'
    and code = btrim(code)
    and code !~ '\s{2,}'
  ),
  title text check (char_length(title) between 1 and 120),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index courses_university_code_key
  on public.courses (university_domain, replace(code, ' ', ''));

create type public.course_status as enum ('taking', 'completed');
create type public.letter_grade as enum (
  'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'P'
);

create table public.user_courses (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  course_id bigint not null references public.courses (id) on delete cascade,
  status public.course_status not null default 'taking',
  -- Self-reported. Optional while taking the course, required once it's completed.
  grade public.letter_grade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id),
  constraint completed_courses_have_a_grade check (status = 'taking' or grade is not null)
);

-- For finding everyone in a given course.
create index user_courses_course_id_idx on public.user_courses (course_id);


-- Availability -------------------------------------------------------------------
-- Weekly free time in the school's local time. weekday follows ISO: 1 = Monday, 7 = Sunday.

create table public.availability_slots (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  constraint slot_ends_after_it_starts check (ends_at > starts_at),
  unique (user_id, weekday, starts_at)
);


-- This or That survey ----------------------------------------------------------------
-- Team-written questions are seeded as approved. AI-written ones stay hidden until approved.

create table public.survey_questions (
  id bigint generated always as identity primary key,
  prompt text not null check (char_length(prompt) between 3 and 140),
  option_a text not null check (char_length(option_a) between 1 and 60),
  option_b text not null check (char_length(option_b) between 1 and 60),
  category text not null check (char_length(category) between 2 and 30),
  source public.content_source not null default 'team',
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.survey_answers (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  question_id bigint not null references public.survey_questions (id) on delete cascade,
  choice text not null check (choice in ('a', 'b')),
  answered_at timestamptz not null default now(),
  primary key (user_id, question_id)
);


-- Interests --------------------------------------------------------------------------
-- A fixed list managed by us. Tags about identity (religion, ethnicity, nationality,
-- politics, gender) don't belong in it.

create table public.interests (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  label text not null check (char_length(label) between 2 and 40),
  category text check (char_length(category) between 2 and 30)
);

create table public.user_interests (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  interest_slug text not null references public.interests (slug) on update cascade on delete cascade,
  primary key (user_id, interest_slug)
);


-- Contact handles ------------------------------------------------------------------------
-- Optional and private, like the rest of profiles. Entered at onboarding or later. Sharing
-- happens per pairing, only when the student says yes (step 3). Stored without the "@".

alter table public.profiles
  add column instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  add column discord text check (discord ~ '^[a-z0-9._]{2,32}$'),
  add column phone text check (phone ~ '^\+[1-9][0-9]{6,14}$');


-- Penguin accessories -------------------------------------------------------------------
-- The catalog holds preset items and, later, AI-generated ones, which stay hidden until
-- someone on the team has checked them. Equipped items are listed in public_profiles.

create type public.accessory_slot as enum ('head', 'face', 'neck', 'held');

create table public.accessories (
  id bigint generated always as identity primary key,
  slot public.accessory_slot not null,
  name text not null check (char_length(name) between 1 and 40),
  image_path text not null check (char_length(image_path) between 1 and 200),
  source public.content_source not null default 'team',
  -- The student whose keywords produced an AI accessory.
  created_by uuid references public.profiles (id) on delete set null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.user_accessories (
  user_id uuid not null references public.profiles (id) on delete cascade,
  accessory_id bigint not null references public.accessories (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, accessory_id)
);


-- Row limits ---------------------------------------------------------------------------

create trigger courses_limit before insert on public.courses
  for each row execute function private.enforce_row_limit('created_by', '15');

create trigger user_courses_limit before insert on public.user_courses
  for each row execute function private.enforce_row_limit('user_id', '40');

create trigger availability_slots_limit before insert on public.availability_slots
  for each row execute function private.enforce_row_limit('user_id', '30');

create trigger user_interests_limit before insert on public.user_interests
  for each row execute function private.enforce_row_limit('user_id', '10');


-- Access rules -------------------------------------------------------------------------
-- Same pattern as step 1: grants decide columns, policies decide rows, signed-out visitors
-- get nothing. Columns a student can't set (user_id, created_by, university_domain) fill
-- themselves from their login, so the frontend never sends them.

alter table public.courses enable row level security;
alter table public.user_courses enable row level security;
alter table public.availability_slots enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_answers enable row level security;
alter table public.interests enable row level security;
alter table public.user_interests enable row level security;
alter table public.accessories enable row level security;
alter table public.user_accessories enable row level security;

revoke all on
  public.courses, public.user_courses, public.availability_slots,
  public.survey_questions, public.survey_answers, public.interests,
  public.user_interests, public.accessories, public.user_accessories
from anon, authenticated;

grant select, insert (code) on public.courses to authenticated;
grant select, insert (course_id, status, grade), update (status, grade), delete
  on public.user_courses to authenticated;
grant select, insert (weekday, starts_at, ends_at), update (weekday, starts_at, ends_at), delete
  on public.availability_slots to authenticated;
grant select on public.survey_questions to authenticated;
grant select, insert (question_id, choice), update (choice), delete
  on public.survey_answers to authenticated;
grant select on public.interests to authenticated;
grant select, insert (interest_slug), delete on public.user_interests to authenticated;
grant select on public.accessories to authenticated;
grant select on public.user_accessories to authenticated;
grant update (instagram, discord, phone) on public.profiles to authenticated;

create policy "Students see courses at their school"
  on public.courses for select to authenticated
  using (university_domain = (select private.my_university()));

create policy "Students add courses at their school"
  on public.courses for insert to authenticated
  with check (
    university_domain = (select private.my_university())
    and created_by = (select auth.uid())
  );

-- The course check below runs with the student's own access, so it only finds courses at
-- their school.
create policy "Students manage their own courses"
  on public.user_courses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.courses where courses.id = user_courses.course_id)
  );

create policy "Students manage their own availability"
  on public.availability_slots for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Students see approved questions"
  on public.survey_questions for select to authenticated
  using (approved);

create policy "Students answer approved questions"
  on public.survey_answers for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.survey_questions where survey_questions.id = survey_answers.question_id)
  );

create policy "Students see the interest list"
  on public.interests for select to authenticated
  using (true);

create policy "Students manage their own interests"
  on public.user_interests for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Students see approved accessories"
  on public.accessories for select to authenticated
  using (approved);

create policy "Students see the accessories they own"
  on public.user_accessories for select to authenticated
  using (user_id = (select auth.uid()));
