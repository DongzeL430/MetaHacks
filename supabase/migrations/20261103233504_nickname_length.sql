-- A generated nickname could reach 25 characters ("Caffeinated Flamingo 9999") once the plain and
-- two-digit names kept colliding, one over the 24 a nickname allows, which would stop that
-- student's sign-up. Candidates over 24 are now skipped.

create or replace function private.generate_nickname()
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
  -- Friendly, easy to draw, none commonly used as an insult. One word, at most 8 letters.
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
    -- "Caffeinated Flamingo 9999" is 25: too long for a nickname, so pick again
    if char_length(candidate) <= 24
       and not exists (select 1 from public.public_profiles where lower(nickname) = lower(candidate)) then
      return candidate;
    end if;
  end loop;

  raise exception 'Could not generate a unique nickname';
end;
$$;

revoke execute on function private.generate_nickname() from public, anon, authenticated;
