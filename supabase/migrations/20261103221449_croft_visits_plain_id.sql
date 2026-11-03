-- croft_visits had (visitor, owner, day) as its primary key. Realtime sends a deleted row's primary
-- key to every listener without checking row security, so the weekly cleanup could tell anyone who
-- had visited whom. It gets a plain id like the other live tables. The same three columns stay
-- unique, so it's still one visit a day per visitor (croft_visit's "on conflict do nothing").

alter table public.croft_visits drop constraint croft_visits_pkey;
alter table public.croft_visits add column id bigint generated always as identity primary key;
alter table public.croft_visits
  add constraint croft_visits_once_a_day unique (visitor_id, owner_id, visited_on);
