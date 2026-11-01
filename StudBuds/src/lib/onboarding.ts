import { supabase } from './supabase.ts';

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
