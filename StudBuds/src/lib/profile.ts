import { useCallback, useEffect, useState } from 'react';
import { callFunction } from './edgeFunctions.ts';
import { saveAvailability } from './onboarding.ts';
import { rangesToSlots } from './slots.ts';
import { supabase } from './supabase.ts';
import type { MyProfile } from '../dataFiles/StudyData';

/** Public link to an avatar Muse drew (the avatars bucket is public; file names are random) */
export const avatarUrlOf = (path: string | null | undefined) =>
  path ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : undefined;

/** "CS 2500 · Fundamentals of CS 1", or just the code when there's no title */
const courseLabel = (c: { code: string; title: string | null }) => (c.title ? `${c.code} · ${c.title}` : c.code);

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
  // Own course names (typed ones included, since only they see these): finished ones, and the
  // ones rated 1 or 2, which classmates see as "Looking for help with"
  const [coursesTaken, setCoursesTaken] = useState<string[]>([]);
  const [seekingHelpWith, setSeekingHelpWith] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const id = auth.user?.id;
      if (!id) return;
      const [pub, priv, slots, left, courses] = await Promise.all([
        supabase.from('public_profiles').select('nickname, avatar_path').eq('id', id).single(),
        supabase.from('profiles').select('instagram, discord, phone').eq('id', id).single(),
        supabase.from('availability_slots').select('weekday, starts_at, ends_at'),
        supabase.rpc('identity_changes_left'),
        supabase.from('user_courses').select('status, confidence, custom_name, courses(code, title)'),
      ]);
      if (cancelled) return;
      const named = (courses.data ?? []).map((c) => ({
        ...c,
        label: c.courses ? courseLabel(c.courses) : (c.custom_name ?? ''),
      }));
      setCoursesTaken(named.filter((c) => c.status === 'completed' && c.label).map((c) => c.label));
      setSeekingHelpWith(named.filter((c) => c.confidence <= 2 && c.label).map((c) => c.label));
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
    coursesTaken,
    seekingHelpWith,
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
