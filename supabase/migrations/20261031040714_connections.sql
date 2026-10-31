-- Step 3 of the user data layer: pairings, Vibe or Pass, contact sharing, blocks, and reports.
--
-- Structure only. Creating pairings, marking them mutual, and revealing handles are server
-- mechanisms for later.
--
-- To keep prejudice out of pairing: Vibe Check results are stored as counts and never
-- interpreted, and a Pass or block only ever affects that one pair. Nothing here gives a
-- student an overall score for how often they were passed, blocked, or reported.


-- Pairings -----------------------------------------------------------------------------
-- One row each time the matchmaker pairs two students. The same two can be paired again
-- later (a rematch), which adds a new row. The smaller id always goes in user_low, so a pair
-- reads the same whichever way round it was matched.

create table public.pairings (
  id bigint generated always as identity primary key,
  user_low uuid not null references public.profiles (id) on delete cascade,
  user_high uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Fact-only counts reported by the Vibe Check game when it ends.
  agreements smallint check (agreements >= 0),
  reactions smallint check (reactions >= 0),
  vibe_check_ended_at timestamptz,
  -- Set only when both students picked Vibe. A Pass leaves it empty, which looks the same to
  -- the partner as an answer that hasn't come in yet.
  mutual_at timestamptz,
  constraint pairing_ids_in_order check (user_low < user_high)
);

create index pairings_pair_idx on public.pairings (user_low, user_high);
create index pairings_user_high_idx on public.pairings (user_high);


-- Vibe or Pass ---------------------------------------------------------------------------
-- Each student's private choice for one pairing. Made once, never changed, never shown to
-- the partner.

create type public.vibe_choice as enum ('vibe', 'pass');

create table public.vibe_decisions (
  pairing_id bigint not null references public.pairings (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  choice public.vibe_choice not null,
  decided_at timestamptz not null default now(),
  primary key (pairing_id, user_id)
);

-- For the cooldown check below.
create index vibe_decisions_passes_idx on public.vibe_decisions (decided_at) where choice = 'pass';

-- True if either student passed on the other within the last day. Argument order doesn't
-- matter. For the matchmaker, which runs as server code. The cooldown length lives only here.
create function public.pair_on_cooldown(student_a uuid, student_b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.vibe_decisions d
    join public.pairings p on p.id = d.pairing_id
    where p.user_low = least(student_a, student_b)
      and p.user_high = greatest(student_a, student_b)
      and d.choice = 'pass'
      and d.decided_at > now() - interval '1 day'
  )
$$;


-- Contact sharing ------------------------------------------------------------------------
-- Asked at every mutual pairing, one choice per platform. Handles are only shown when both
-- students said yes in that pairing, and each sees just the platforms the other picked;
-- the reveal itself is a later mechanism. The handles stay in profiles.

create table public.contact_shares (
  pairing_id bigint not null references public.pairings (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  instagram boolean not null default false,
  discord boolean not null default false,
  phone boolean not null default false,
  decided_at timestamptz not null default now(),
  primary key (pairing_id, user_id)
);


-- Blocks ---------------------------------------------------------------------------------
-- Permanent until undone, one-sided, and silent. A Pass only lasts a day; a block is how a
-- student makes sure they are never paired with someone again.

create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint cannot_block_yourself check (blocker_id <> blocked_id)
);

-- The matchmaker checks blocks in both directions.
create index blocks_blocked_id_idx on public.blocks (blocked_id);


-- Reports --------------------------------------------------------------------------------
-- Reviewed by a person later. The reported student never sees them. A report outlives the
-- reporter's account so a review isn't lost when they leave.

create type public.report_reason as enum ('harassment', 'inappropriate', 'spam', 'safety', 'other');
create type public.report_status as enum ('open', 'reviewed');

create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  pairing_id bigint references public.pairings (id) on delete set null,
  reason public.report_reason not null,
  details text check (char_length(details) between 1 and 500),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);

create index reports_reported_id_idx on public.reports (reported_id);


-- Row limits -----------------------------------------------------------------------------
-- Pairings and Vibe choices only exist once the server creates a pairing, so they need none.

create trigger blocks_limit before insert on public.blocks
  for each row execute function private.enforce_row_limit('blocker_id', '200');

create trigger reports_limit before insert on public.reports
  for each row execute function private.enforce_row_limit('reporter_id', '30');


-- Access rules ---------------------------------------------------------------------------
-- Students can only act on pairings they're in, and can only block or report someone they've
-- been paired with. The pairing checks run with the student's own access, so they only ever
-- find the student's own pairings.

alter table public.pairings enable row level security;
alter table public.vibe_decisions enable row level security;
alter table public.contact_shares enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

revoke all on
  public.pairings, public.vibe_decisions, public.contact_shares, public.blocks, public.reports
from anon, authenticated;

grant select on public.pairings to authenticated;
grant select, insert (pairing_id, choice) on public.vibe_decisions to authenticated;
grant select, insert (pairing_id, instagram, discord, phone), update (instagram, discord, phone)
  on public.contact_shares to authenticated;
grant select, insert (blocked_id), delete on public.blocks to authenticated;
grant select, insert (reported_id, pairing_id, reason, details) on public.reports to authenticated;

create policy "Students see their own pairings"
  on public.pairings for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));

create policy "Students see their own Vibe choices"
  on public.vibe_decisions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Students choose Vibe or Pass in their own pairings"
  on public.vibe_decisions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.pairings p where p.id = vibe_decisions.pairing_id)
  );

create policy "Students see their own sharing choices"
  on public.contact_shares for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Students choose what to share in mutual pairings"
  on public.contact_shares for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.pairings p
      where p.id = contact_shares.pairing_id and p.mutual_at is not null
    )
  );

create policy "Students change what they share"
  on public.contact_shares for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Students see their own blocks"
  on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "Students block someone they were paired with"
  on public.blocks for insert to authenticated
  with check (
    blocker_id = (select auth.uid())
    and exists (
      select 1 from public.pairings p
      where blocks.blocked_id in (p.user_low, p.user_high)
    )
  );

create policy "Students remove their own blocks"
  on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

create policy "Students see reports they filed"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy "Students report someone they were paired with"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1 from public.pairings p
      where reports.reported_id in (p.user_low, p.user_high)
        and (reports.pairing_id is null or p.id = reports.pairing_id)
    )
  );


-- Function permissions -------------------------------------------------------------------

revoke execute on function public.pair_on_cooldown(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pair_on_cooldown(uuid, uuid) to service_role;
