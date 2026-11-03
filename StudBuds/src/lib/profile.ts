import { useCallback, useEffect, useState } from 'react';
import { callFunction } from './edgeFunctions.ts';
import { saveAvailability } from './onboarding.ts';
import { supabase } from './supabase.ts';
import type { MyProfile } from '../dataFiles/StudyData';

const DAY_KEYS = ['', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// Matches the availability calendar's slot length
const SLOT_MINUTES = 30;
const pad = (n: number) => String(n).padStart(2, '0');
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Saved weekly ranges (Monday 09:00 to 10:00) back to calendar slots ("mon|09:00", "mon|09:30") */
function rangesToSlots(rows: { weekday: number; starts_at: string; ends_at: string }[]): string[] {
  const slots: string[] = [];
  for (const r of rows) {
    for (let m = minutesOf(r.starts_at); m < minutesOf(r.ends_at); m += SLOT_MINUTES) {
      slots.push(`${DAY_KEYS[r.weekday]}|${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    }
  }
  return slots.sort();
}

const avatarUrlOf = (path: string | null) =>
  path ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : undefined;

/**
 * Contact handles in the database's formats: Instagram without the @, Discord in lowercase,
 * phone as +16175550100 (10-digit numbers are taken as US/Canada). Throws a message to show.
 */
function cleanContact(contact: MyProfile['contact']) {
  const instagram = contact.instagram.trim().replace(/^@/, '');
  const discord = contact.discord.trim().toLowerCase();
  const digits = contact.phone.replace(/[^0-9]/g, '');
  const phone = !contact.phone.trim()
    ? ''
    : contact.phone.trim().startsWith('+')
      ? `+${digits}`
      : digits.length === 10
        ? `+1${digits}`
        : `+${digits}`;
  if (discord && !/^[a-z0-9._]{2,32}$/.test(discord)) {
    throw new Error('Discord usernames are 2 to 32 letters, numbers, periods or underscores.');
  }
  if (phone && !/^\+[1-9][0-9]{6,14}$/.test(phone)) {
    throw new Error('Add your phone number with its country code, like +1 617 555 0100.');
  }
  return { instagram: instagram || null, discord: discord || null, phone: phone || null };
}

// One first-avatar request per page load, even if the hook mounts twice (React dev mode does)
let starterRequested = false;

interface StudioAnswer {
  nickname: string;
  avatarPath: string | null;
  changesLeft: number | null;
}

/**
 * The signed-in student's own profile for Home: nickname, Muse avatar, free times and contact
 * handles, plus how many nickname or avatar changes they have left today.
 * A student with no avatar yet gets their first one drawn in the background.
 */
export function useMyProfile() {
  const [ready, setReady] = useState(false);
  const [nickname, setNickname] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [availability, setAvailability] = useState<string[]>([]);
  const [contact, setContact] = useState<MyProfile['contact']>({ discord: '', instagram: '', phone: '' });
  const [changesLeft, setChangesLeft] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const id = auth.user?.id;
      if (!id) return;
      const [pub, priv, slots, left] = await Promise.all([
        supabase.from('public_profiles').select('nickname, avatar_path').eq('id', id).single(),
        supabase.from('profiles').select('instagram, discord, phone').eq('id', id).single(),
        supabase.from('availability_slots').select('weekday, starts_at, ends_at'),
        supabase.rpc('identity_changes_left'),
      ]);
      if (cancelled) return;
      setNickname(pub.data?.nickname ?? '');
      setAvatarPath(pub.data?.avatar_path ?? null);
      setContact({
        instagram: priv.data?.instagram ?? '',
        discord: priv.data?.discord ?? '',
        phone: priv.data?.phone ?? '',
      });
      setAvailability(rangesToSlots(slots.data ?? []));
      setChangesLeft(left.data ?? null);
      setReady(true);

      if (pub.data && !pub.data.avatar_path && !starterRequested) {
        starterRequested = true;
        try {
          const res = await callFunction<StudioAnswer>('avatar-studio', { action: 'starter' });
          if (!cancelled) setAvatarPath(res.avatarPath);
        } catch (err) {
          // Initials show until they draw one themselves from the profile window
          console.warn('first avatar not drawn', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Muse draws a new avatar from the current nickname. Throws a message to show. */
  const redrawAvatar = useCallback(async () => {
    const res = await callFunction<StudioAnswer>('avatar-studio', { action: 'redraw' });
    setAvatarPath(res.avatarPath);
    if (res.changesLeft !== null) setChangesLeft(res.changesLeft);
  }, []);

  /**
   * Saves the profile window: a new nickname (checked by Muse, uses one of today's changes),
   * free times and contact handles. Throws a message to show; nothing after a failed step saves.
   */
  const save = useCallback(
    async (next: MyProfile) => {
      if (next.nickname !== nickname) {
        const res = await callFunction<StudioAnswer>('avatar-studio', { action: 'rename', nickname: next.nickname });
        setNickname(res.nickname);
        if (res.changesLeft !== null) setChangesLeft(res.changesLeft);
      }
      if (next.availability.join() !== availability.join()) {
        await saveAvailability(next.availability);
        setAvailability(next.availability);
      }
      if (JSON.stringify(next.contact) !== JSON.stringify(contact)) {
        const { data: auth } = await supabase.auth.getUser();
        const clean = cleanContact(next.contact);
        const { error } = await supabase.from('profiles').update(clean).eq('id', auth.user!.id);
        if (error) throw new Error('Your contact details didn’t save. Check them and try again.');
        setContact({ instagram: clean.instagram ?? '', discord: clean.discord ?? '', phone: clean.phone ?? '' });
      }
    },
    [nickname, availability, contact],
  );

  return {
    ready,
    nickname,
    avatarUrl: avatarUrlOf(avatarPath),
    availability,
    contact,
    changesLeft,
    redrawAvatar,
    save,
  };
}

/** Deletes the account and everything tied to it (public.delete_my_account), then signs out here */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new Error('Your account wasn’t deleted. Try again in a moment.');
  // The account is gone on the server, so only this browser's copy of the session is left
  await supabase.auth.signOut({ scope: 'local' });
}
