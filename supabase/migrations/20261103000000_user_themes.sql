-- Custom themes: each user's saved theme, and a private bucket for generated background images.
--
-- A theme is data (colors + a background description), never CSS or code. The app checks every
-- theme with sanitizeTheme() (src/utils/Theme.ts) before applying it, so a bad row can only ever
-- fall back to the default look. Themes and images are private: only their owner can read them.

-------------------------------------------------------------------------------
-- Saved themes: one row per user
-------------------------------------------------------------------------------

create table if not exists public.user_themes (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  theme jsonb not null,
  -- false = the default look is in use, but the custom theme stays saved for the star button
  use_custom boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint user_themes_theme_is_object check (jsonb_typeof(theme) = 'object'),
  constraint user_themes_theme_size check (pg_column_size(theme) <= 16384)
);

create or replace function public.touch_user_themes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_themes_touch on public.user_themes;
create trigger user_themes_touch
  before update on public.user_themes
  for each row execute function public.touch_user_themes();

alter table public.user_themes enable row level security;

drop policy if exists "Users read their own theme" on public.user_themes;
create policy "Users read their own theme" on public.user_themes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users save their own theme" on public.user_themes;
create policy "Users save their own theme" on public.user_themes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users update their own theme" on public.user_themes;
create policy "Users update their own theme" on public.user_themes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users delete their own theme" on public.user_themes;
create policy "Users delete their own theme" on public.user_themes
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.user_themes to authenticated;

-------------------------------------------------------------------------------
-- Generated backgrounds: private bucket, one folder per user ("<user id>/<file>.webp")
-------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-backgrounds', 'user-backgrounds', false, 5242880, array['image/webp'])
on conflict (id) do nothing;

-- Owners can view (through signed links) and delete their own images
drop policy if exists "Users read their own backgrounds" on storage.objects;
create policy "Users read their own backgrounds" on storage.objects
  for select to authenticated
  using (bucket_id = 'user-backgrounds' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete their own backgrounds" on storage.objects;
create policy "Users delete their own backgrounds" on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-backgrounds' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- No insert or update policy on purpose: only the generate-theme Edge Function (using the
-- service role, after its checks) can add images, so nothing unchecked ever lands here.
