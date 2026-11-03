-- Every theme a student makes is kept in their own theme library, so they can switch between them
-- later. user_themes stays the one theme in use (plus whether it's on); saved_theme_id says which
-- library theme that is. The generate-theme Edge Function adds each new theme here itself, so a
-- theme is never lost if the browser doesn't get to save it.

create table public.saved_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  theme jsonb not null,
  created_at timestamptz not null default now(),
  constraint saved_themes_theme_is_object check (jsonb_typeof(theme) = 'object'),
  constraint saved_themes_theme_size check (pg_column_size(theme) <= 16384)
);

create index saved_themes_user_time_idx on public.saved_themes (user_id, created_at desc);

-- 3 new themes a week can't fill this soon; it only stops runaway growth
create trigger saved_themes_limit before insert on public.saved_themes
  for each row execute function private.enforce_row_limit('user_id', '50');

alter table public.saved_themes enable row level security;
revoke all on public.saved_themes from anon, authenticated;
-- Students read and delete their own; only the Edge Function adds themes
grant select, delete on public.saved_themes to authenticated;

create policy "Students see their own saved themes"
  on public.saved_themes for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Students delete their own saved themes"
  on public.saved_themes for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.user_themes
  add column saved_theme_id uuid references public.saved_themes (id) on delete set null;

-- Themes made before the library existed go into it
with moved as (
  insert into public.saved_themes (user_id, theme, created_at)
  select user_id, theme, updated_at from public.user_themes
  returning id, user_id
)
update public.user_themes t set saved_theme_id = moved.id
from moved where moved.user_id = t.user_id;
