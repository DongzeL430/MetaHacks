import { callFunction } from '../lib/edgeFunctions.ts';
import type { DayKey } from '../components/AvailabilityCalendar';

/*
 * Fills the availability calendar from a screenshot of a class schedule or calendar.
 * Muse Spark reads the image on the server (supabase/functions/read-schedule) and returns the
 * busy blocks; like the .ics import, every visible slot that doesn't overlap one is available.
 */

export interface ScheduleBlock {
  day: DayKey;
  /** 24-hour "HH:MM" */
  start: string;
  end: string;
  label: string;
}

export interface ScheduleReadResult {
  blocks: ScheduleBlock[];
  /** Course codes Muse saw, like "CS 2500", already in the database's format */
  courseCodes: string[];
}

interface SlotOptions {
  dayKeys: DayKey[];
  startHour: number;
  endHour: number;
  slotMinutes: number;
}

/** Longest side sent to Muse. Plenty to read timetable text, and keeps uploads small. */
const MAX_SIDE = 1600;

const pad = (n: number) => String(n).padStart(2, '0');
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

async function shrinkToJpeg(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Couldn’t open that image. Use a PNG or JPEG screenshot.');
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  // JPEG has no transparency, so a transparent screenshot would otherwise turn black
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

export async function readScheduleScreenshot(file: File): Promise<ScheduleReadResult> {
  const image = await shrinkToJpeg(file);
  const data = await callFunction<{ isSchedule: boolean; events: ScheduleBlock[]; courseCodes: string[] }>(
    'read-schedule',
    { image },
  );

  if (!data?.isSchedule) {
    throw new Error('That doesn’t look like a schedule. Try a screenshot of your class schedule or calendar.');
  }
  return { blocks: data.events, courseCodes: data.courseCodes };
}

/** Sorted slot keys ("mon|09:30") that don't overlap any block, within the visible days and hours */
export function scheduleToAvailability(blocks: ScheduleBlock[], options: SlotOptions): string[] {
  const { dayKeys, startHour, endHour, slotMinutes } = options;
  const slots: string[] = [];

  for (const day of dayKeys) {
    const busy = blocks.filter((b) => b.day === day).map((b) => [toMinutes(b.start), toMinutes(b.end)] as const);
    for (let mins = startHour * 60; mins < endHour * 60; mins += slotMinutes) {
      const overlaps = busy.some(([start, end]) => start < mins + slotMinutes && end > mins);
      if (!overlaps) slots.push(`${day}|${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`);
    }
  }
  return slots.sort();
}
