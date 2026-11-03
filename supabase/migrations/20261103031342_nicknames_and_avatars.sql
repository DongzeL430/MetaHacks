-- Nicknames and avatars.
-- A new student gets a random adjective and animal ("Sleepy Otter"), with a number only when that
-- pair is taken. Students can rename themselves and have Muse draw their avatar from their
-- nickname. Server code does both (it checks a new name first), so the browser can't change
-- either directly. Avatars live in a public bucket under random file names.


-- Generated nicknames --------------------------------------------------------------------------

create function private.generate_nickname()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- Kept kind and neutral: nothing about looks, identity, or anything a person could take badly.
  adjectives constant text[] := array[
    'Sleepy', 'Caffeinated', 'Curious', 'Focused', 'Chill', 'Cozy', 'Brave', 'Quiet',
    'Lucky', 'Sunny', 'Snacky', 'Patient', 'Clever', 'Jolly', 'Calm', 'Speedy',
    'Dizzy', 'Thoughtful', 'Bouncy', 'Plucky', 'Steady', 'Merry', 'Peppy', 'Breezy',
    'Mellow', 'Zesty', 'Studious', 'Wandering', 'Hopeful', 'Cheerful', 'Gentle', 'Daring',
    'Busy', 'Puzzled', 'Toasty', 'Frosty', 'Humming', 'Doodling', 'Determined', 'Nimble'
  ];
  -- Friendly, easy to draw, none commonly used as an insult. One word, at most 8 letters, so a
  -- name with a number still fits in 24 characters.
  animals constant text[] := array[
    'Otter', 'Fox', 'Owl', 'Panda', 'Koala', 'Hedgehog', 'Penguin', 'Bunny', 'Turtle', 'Frog',
    'Raccoon', 'Sloth', 'Duck', 'Bear', 'Kitten', 'Puppy', 'Deer', 'Hamster', 'Seal', 'Whale',
    'Dolphin', 'Octopus', 'Bee', 'Ladybug', 'Snail', 'Llama', 'Alpaca', 'Lemur', 'Badger', 'Beaver',
    'Squirrel', 'Moose', 'Puffin', 'Flamingo', 'Parrot', 'Toucan', 'Axolotl', 'Capybara', 'Corgi', 'Lynx'
  ];
  candidate text;
begin
  for attempt in 1..60 loop
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::integer]
      || ' ' || animals[1 + floor(random() * array_length(animals, 1))::integer];
    -- Plain pairs first; add a number once they keep colliding, a longer one after that
    if attempt > 20 then
      candidate := candidate || ' ' || (2 + floor(random() * (case when attempt > 40 then 9998 else 98 end)))::integer;
    end if;
    if not exists (select 1 from public.public_profiles where lower(nickname) = lower(candidate)) then
      return candidate;
    end if;
  end loop;

  raise exception 'Could not generate a unique nickname';
end;
$$;

revoke execute on function private.generate_nickname() from public, anon, authenticated;

-- New accounts use it
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
begin
  v_domain := private.edu_domain(new.email);

  if v_domain is null then
    raise exception 'Only .edu email addresses can sign up';
  end if;

  if new.raw_user_meta_data->>'adult_confirmed' is distinct from 'true' then
    raise exception 'The 18+ confirmation is required';
  end if;

  insert into public.universities (domain) values (v_domain)
  on conflict (domain) do nothing;

  insert into public.profiles (id, university_domain, adult_confirmed_at)
  values (new.id, v_domain, now());

  insert into public.public_profiles (id, nickname)
  values (new.id, private.generate_nickname());

  return new;
end;
$$;

drop function private.generate_nickname(text);

-- Existing accounts still have the old "Plucky Penguin 77" style; give them the new kind
do $$
declare
  p record;
begin
  for p in select id from public.public_profiles loop
    update public.public_profiles set nickname = private.generate_nickname() where id = p.id;
  end loop;
end;
$$;


-- Nickname and avatar rules ------------------------------------------------------------------
-- Names that differ only in capitals count as the same, so nobody can pose as someone else.

alter table public.public_profiles
  add constraint nickname_shape check (
    char_length(nickname) between 2 and 24 and nickname = btrim(nickname) and nickname !~ '\s{2,}'
  ),
  -- "<user id>/<random id>.webp" in the avatars bucket
  add column avatar_path text check (avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');

create unique index public_profiles_nickname_lower_key on public.public_profiles (lower(nickname));


-- Avatar files ---------------------------------------------------------------------------------
-- Public, so classmates' avatars load without a signed link per picture; file names are random.
-- No insert, update or delete policy: only the avatar-studio Edge Function (service role, after
-- its checks) can add or remove pictures.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp'])
on conflict (id) do nothing;


-- Daily limit ----------------------------------------------------------------------------------
-- Renames and avatar redraws share 3 a day (DAILY_CHANGES in supabase/functions/avatar-studio).
-- A new student's first avatar ('avatar_starter') doesn't count.

alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests
  add constraint ai_requests_kind_check check (kind in (
    'read_schedule', 'suggest_courses', 'format_courses', 'theme', 'nickname', 'avatar', 'avatar_starter'
  ));

-- How many renames and redraws the student has left today, for the profile window
create function public.identity_changes_left()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, 3 - count(*)::integer)
  from public.ai_requests
  where user_id = (select auth.uid())
    and kind in ('nickname', 'avatar')
    and created_at > now() - interval '24 hours'
$$;

revoke execute on function public.identity_changes_left() from public, anon;
grant execute on function public.identity_changes_left() to authenticated;
