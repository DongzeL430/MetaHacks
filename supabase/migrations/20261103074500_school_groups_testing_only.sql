-- Linked schools are a testing exception: Vanderbilt and RIT share one community only so the
-- StudBuds team, at two schools, can test lobbies, chat and connections together. Every other
-- school stays on its own. Study spots are never shared: each student gets their own school's.
-- Before launch, decide whether to keep this for the demo or delete the two rows.

comment on table private.school_groups is
  'Testing only: lets the StudBuds team at vanderbilt.edu and rit.edu see each other. Study spots stay per school.';
