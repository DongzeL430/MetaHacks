import { useCallback, useEffect, useState } from 'react';
import { applyMatches, cleanAcademics, namesToMatch } from '../components/CoursesSection';
import type { AcademicProfile, CourseEntry, MajorEntry } from '../components/CoursesSection';
import { SURVEY_SECTIONS } from '../dataFiles/SurveySections.ts';
import type { MyProfile } from '../dataFiles/StudyData';
import { matchCourses, saveCourses } from './courses.ts';
import { callFunction } from './edgeFunctions.ts';
import { saveAnswers, saveAvailability } from './onboarding.ts';
import { rangesToSlots } from './slots.ts';
import { supabase } from './supabase.ts';

/** Public link to an avatar Muse drew (the avatars bucket is public; file names are random) */
export const avatarUrlOf = (path: string | null | undefined) =>
  path ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : undefined;

/** "CS 2500 · Fundamentals of CS 1", or just the code when there's no title */
const courseLabel = (c: { code: string; title: string | null }) => (c.title ? `${c.code} · ${c.title}` : c.code);

const SURVEY_QUESTIONS = SURVEY_SECTIONS.flatMap((s) => s.questions);

/**
 * The subject lists the lobby filters use: finished courses, and the ones rated 1 or 2, which
 * classmates see as "Looking for help with". Typed names count too, since only the student sees these.
 */
const subjectsOf = (courses: CourseEntry[]) => ({
  coursesTaken: courses.filter((c) => c.status === 'taken' && c.name.trim()).map((c) => c.name),
  seekingHelpWith: courses.filter((c) => c.confidence !== null && c.confidence <= 2 && c.name.trim()).map((c) => c.name),
});

const asAcademics = (courses: CourseEntry[], majors: MajorEntry[]): AcademicProfile => ({
  majors,
  minors: [],
  year: '',
  gradYear: '',
  courses,
});

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

// One first-avatar request per student per page load, even if the hook mounts twice (React dev
// mode does). Per student, so a second account signed up in the same tab still gets one.
const starterRequested = new Set<string>();

interface StudioAnswer {
  nickname: string;
  avatarPath: string | null;
  changesLeft: number | null;
}

/**
 * The signed-in student's own profile for Home: nickname, Muse avatar, free times, contact
 * handles, and their pre-survey courses and answers, plus how many nickname or avatar changes
 * they have left today. A student with no avatar yet gets their first one drawn in the background.
 */
export function useMyProfile() {
  const [ready, setReady] = useState(false);
  const [nickname, setNickname] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [availability, setAvailability] = useState<string[]>([]);
  const [contact, setContact] = useState<MyProfile['contact']>({ discord: '', instagram: '', phone: '' });
  const [changesLeft, setChangesLeft] = useState<number | null>(null);
  const [courses, setCourses] = useState<CourseEntry[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Muse matches new course names within the student's majors
  const [majors, setMajors] = useState<MajorEntry[]>([]);
  // The first load failed and is being tried again (Home says so instead of staying blank)
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    let retries = 0;
    const loadProfile = async () => {
      // The saved session says who's signed in without a network call (RequireAuth checked it)
      const { data: session } = await supabase.auth.getSession();
      const id = session.session?.user.id;
      if (!id) return;
      const [pub, priv, slots, left, saved, picks, programs] = await Promise.all([
        supabase.from('public_profiles').select('nickname, avatar_path').eq('id', id).single(),
        supabase.from('profiles').select('instagram, discord, phone').eq('id', id).single(),
        supabase.from('availability_slots').select('weekday, starts_at, ends_at'),
        supabase.rpc('identity_changes_left'),
        supabase.from('user_courses').select('id, status, confidence, grade, custom_name, courses(code, title)').order('id'),
        supabase.from('survey_answers').select('choice, survey_questions(key)'),
        supabase.from('user_programs').select('name, track').eq('kind', 'major').order('position'),
      ]);
      if (cancelled) return;
      // A failed read would show an empty profile that a Save could then write back: try again
      if (pub.error || priv.error || slots.error || saved.error || picks.error || programs.error) {
        setFailed(true);
        retryTimer = window.setTimeout(() => void loadProfile(), Math.min(20_000, 2000 * 2 ** retries++));
        return;
      }
      setFailed(false);
      setCourses(
        (saved.data ?? []).map((c) => ({
          id: String(c.id),
          name: c.courses ? courseLabel(c.courses) : (c.custom_name ?? ''),
          status: c.status === 'completed' ? 'taken' : 'taking',
          confidence: c.confidence,
          grade: c.grade ?? '',
          code: c.courses?.code,
          // A course kept under its typed name was already looked for in the catalog
          checked: !c.courses,
        })),
      );
      // Saved option numbers back to the option text the survey shows
      const picked: Record<string, string> = {};
      for (const a of picks.data ?? []) {
        const q = SURVEY_QUESTIONS.find((x) => x.id === a.survey_questions?.key);
        const option = q?.options[a.choice - 1];
        if (q && option) picked[q.id] = option;
      }
      setAnswers(picked);
      setMajors((programs.data ?? []).map((p) => ({ name: p.name, track: p.track ?? '' })));
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

      if (pub.data && !pub.data.avatar_path && !starterRequested.has(id)) {
        starterRequested.add(id);
        try {
          const res = await callFunction<StudioAnswer>('avatar-studio', { action: 'starter' });
          if (!cancelled) setAvatarPath(res.avatarPath);
        } catch (err) {
          // Initials show until they draw one themselves from the profile window
          console.warn('first avatar not drawn', err);
        }
      }
    };
    void loadProfile();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
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
   * free times, contact handles, courses and survey answers. New course names go through the
   * same Muse catalog matching as the pre-survey. Returns the profile as saved (matched course
   * names, tidied handles). Throws a message to show; nothing after a failed step saves.
   */
  const save = useCallback(
    async (next: MyProfile): Promise<MyProfile> => {
      const result = { ...next };
      if (next.nickname !== nickname) {
        const res = await callFunction<StudioAnswer>('avatar-studio', { action: 'rename', nickname: next.nickname });
        setNickname(res.nickname);
        result.nickname = res.nickname;
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
        result.contact = { instagram: clean.instagram ?? '', discord: clean.discord ?? '', phone: clean.phone ?? '' };
        setContact(result.contact);
      }
      if (JSON.stringify(next.courses) !== JSON.stringify(courses)) {
        let academics = asAcademics(next.courses, majors);
        const names = namesToMatch(academics);
        if (names.length > 0) {
          try {
            const found = await matchCourses({ names, majors, gradYear: '' });
            // Muse wasn't reached: keep what the free first pass matched, and look at the rest next time
            academics = applyMatches(academics, found.checked ? found.courses : found.courses.filter((m) => m.code)).profile;
          } catch (err) {
            // Saved as typed; the names are sent again on the next save
            console.warn('course names not matched', err);
          }
        }
        await saveCourses(cleanAcademics(academics));
        result.courses = academics.courses
          .filter((c) => c.name.trim())
          .map((c) => ({ ...c, name: c.name.trim(), suggested: false }));
        setCourses(result.courses);
      }
      if (JSON.stringify(next.answers) !== JSON.stringify(answers)) {
        await saveAnswers(next.answers, SURVEY_SECTIONS);
        setAnswers(next.answers);
      }
      return { ...result, ...subjectsOf(result.courses) };
    },
    [nickname, availability, contact, courses, answers, majors],
  );

  return {
    ready,
    /** The first load failed and is being tried again */
    failed,
    nickname,
    avatarUrl: avatarUrlOf(avatarPath),
    availability,
    contact,
    changesLeft,
    courses,
    answers,
    ...subjectsOf(courses),
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
