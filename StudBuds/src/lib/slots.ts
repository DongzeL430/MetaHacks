/*
 * The calendar works in 30-minute slot keys ("mon|09:30"); the database stores weekly ranges
 * (weekday 1 = Monday to 7 = Sunday, "09:30" to "11:00"). These convert between the two.
 */

const DAY_KEYS = ['', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/** Matches the availability calendar's slot length */
export const SLOT_MINUTES = 30;

const pad = (n: number) => String(n).padStart(2, '0');
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeOf = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

export interface WeeklyRange {
  weekday: number;
  starts_at: string;
  ends_at: string;
}

/** Ranges (Monday 09:00 to 10:00) to slot keys ("mon|09:00", "mon|09:30"), sorted */
export function rangesToSlots(ranges: WeeklyRange[]): string[] {
  const slots: string[] = [];
  for (const r of ranges) {
    for (let m = minutesOf(r.starts_at); m < minutesOf(r.ends_at); m += SLOT_MINUTES) {
      slots.push(`${DAY_KEYS[r.weekday]}|${timeOf(m)}`);
    }
  }
  return slots.sort();
}

/** One block of slots on one day (a lobby's time) to a single range, or null if it isn't one */
export function slotsToRange(slots: string[]): WeeklyRange | null {
  if (slots.length === 0) return null;
  const [day] = slots[0].split('|');
  const weekday = DAY_KEYS.indexOf(day);
  const starts = slots.map((s) => minutesOf(s.split('|')[1])).sort((a, b) => a - b);
  if (weekday < 1 || slots.some((s) => s.split('|')[0] !== day)) return null;
  return { weekday, starts_at: timeOf(starts[0]), ends_at: timeOf(starts[starts.length - 1] + SLOT_MINUTES) };
}
