import { supabase } from './supabase.ts';
import type { SurveySection } from '../dataFiles/SurveySections.ts';

// Calendar day keys to the database's weekday numbers (ISO: 1 = Monday, 7 = Sunday)
const WEEKDAY: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
// Matches the availability calendar's slot length
const SLOT_MINUTES = 30;

const pad = (n: number) => String(n).padStart(2, '0');
const toTime = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/**
 * Saves the calendar as the student's weekly free time, replacing what was saved before.
 * Back-to-back slots ("mon|09:00", "mon|09:30") become one range (Monday 09:00 to 10:00).
 */
export async function saveAvailability(slots: string[]): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Not signed in');

  const startsByDay = new Map<number, number[]>();
  for (const key of slots) {
    const [day, time] = key.split('|');
    const weekday = WEEKDAY[day];
    if (!weekday || !time) continue;
    const mins = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    startsByDay.set(weekday, [...(startsByDay.get(weekday) ?? []), mins]);
  }

  const rows: { weekday: number; starts_at: string; ends_at: string }[] = [];
  for (const [weekday, starts] of startsByDay) {
    starts.sort((a, b) => a - b);
    let from = starts[0];
    let to = from + SLOT_MINUTES;
    for (const start of starts.slice(1)) {
      if (start === to) {
        to += SLOT_MINUTES;
        continue;
      }
      rows.push({ weekday, starts_at: toTime(from), ends_at: toTime(to) });
      from = start;
      to = start + SLOT_MINUTES;
    }
    rows.push({ weekday, starts_at: toTime(from), ends_at: toTime(to) });
  }

  const { error: clearError } = await supabase.from('availability_slots').delete().eq('user_id', userId);
  if (clearError) throw clearError;
  if (rows.length === 0) return;

  const { error } = await supabase.from('availability_slots').insert(rows);
  if (error) throw error;
}

/**
 * Saves every survey answer, replacing what was saved before (public.save_my_answers).
 * answers maps a question id to the option text picked; the database stores the option's
 * number, so ids and option order must match its copy of the questions.
 */
export async function saveAnswers(answers: Record<string, string>, sections: SurveySection[]): Promise<void> {
  const rows = sections.flatMap((s) =>
    s.questions
      .map((q) => ({ key: q.id, choice: q.options.indexOf(answers[q.id]) + 1 }))
      .filter((a) => a.choice > 0),
  );
  const { error } = await supabase.rpc('save_my_answers', { answers: rows });
  if (error) {
    // P0001 ("You’ve changed your survey answers a lot today…") is written for students
    throw new Error(error.code === 'P0001' ? error.message : 'Your answers didn’t save. Check your connection and try again.');
  }
}

/**
 * Puts the student in the match pool (public.finish_onboarding). The database checks they have
 * a course, some free time and every answer, and says what's missing if not.
 */
export async function finishOnboarding(): Promise<void> {
  const { error } = await supabase.rpc('finish_onboarding');
  if (error) {
    // P0001 messages ("Before finishing, add …") are written for students
    throw new Error(error.code === 'P0001' ? error.message : 'That didn’t save. Check your connection and try again.');
  }
}
