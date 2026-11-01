/*
 * Helpers for weekly time slots ("mon|09:30", the same keys AvailabilityCalendar produces).
 */

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const DAY_NAMES: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export interface DayBlocks {
  /** e.g. "Monday" */
  day: string;
  /** e.g. ["9 AM to 10:30 AM", "2 PM to 3 PM"] */
  ranges: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');

function formatTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`;
}

/** Slots both people marked as free */
export function sharedSlots(mine: string[], theirs: string[]): string[] {
  const theirSet = new Set(theirs);
  return mine.filter((slot) => theirSet.has(slot)).sort();
}

/** Total hours covered by a list of slots */
export const hoursIn = (slots: string[], slotMinutes = 30) => (slots.length * slotMinutes) / 60;

/** Groups slots by day (Monday first) and merges back-to-back slots into readable ranges */
export function toDayBlocks(slots: string[], slotMinutes = 30): DayBlocks[] {
  const byDay = new Map<string, Set<number>>();
  for (const slot of slots) {
    const [day, time] = slot.split('|');
    const [h, m] = (time ?? '').split(':').map(Number);
    if (!DAY_NAMES[day] || Number.isNaN(h) || Number.isNaN(m)) continue;
    if (!byDay.has(day)) byDay.set(day, new Set());
    byDay.get(day)!.add(h * 60 + m);
  }

  return DAY_ORDER.filter((day) => byDay.has(day)).map((day) => {
    const starts = [...byDay.get(day)!].sort((a, b) => a - b);
    const ranges: string[] = [];
    let from = starts[0];
    let prev = starts[0];
    for (const start of starts.slice(1)) {
      if (start === prev + slotMinutes) {
        prev = start;
        continue;
      }
      ranges.push(`${formatTime(from)} to ${formatTime(prev + slotMinutes)}`);
      from = prev = start;
    }
    ranges.push(`${formatTime(from)} to ${formatTime(prev + slotMinutes)}`);
    return { day: DAY_NAMES[day], ranges };
  });
}