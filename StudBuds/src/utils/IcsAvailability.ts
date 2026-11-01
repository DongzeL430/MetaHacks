import type { DayKey } from '../components/AvailabilityCalendar';

/*
 * Turns an .ics calendar file into availability slot keys ("mon|09:30").
 *
 * The calendar is a weekly template, so this looks at ONE real week of the file:
 * the next 7 days if the file has events then, otherwise the week its events start
 * (handy for an exported class schedule from a past or future term).
 *
 * Handles: timed events, UTC / TZID / floating times, DTEND or DURATION,
 * DAILY and WEEKLY repeats (INTERVAL, BYDAY, UNTIL, COUNT), EXDATE,
 * edited single instances (RECURRENCE-ID), cancelled events and events marked "free".
 * Skips: all-day events, and treats MONTHLY / YEARLY repeats as one-off events.
 */

export interface IcsImportOptions {
  /** Days shown in the calendar, so hidden days aren't filled in */
  dayKeys: DayKey[];
  startHour: number;
  endHour: number;
  slotMinutes: number;
  /** 'busy' (default): event times are unavailable. 'free': event times are available. */
  eventsMean?: 'busy' | 'free';
  /** For testing. Defaults to right now. */
  now?: Date;
}

export interface IcsImportResult {
  /** Sorted slot keys to mark available */
  slots: string[];
  /** How many event occurrences fell in the week that was used */
  eventCount: number;
  /** First day of the week that was used (local midnight) */
  weekStart: Date;
}

const WEEKDAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_MS = 86_400_000;
/** How far a repeating event is followed from its first date (about 5 years) */
const MAX_REPEAT_DAYS = 1830;

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface WallTime {
  y: number;
  mo: number; // 1-12
  d: number;
  h: number;
  mi: number;
  s: number;
}

type Zone = { kind: 'utc' } | { kind: 'local' } | { kind: 'tz'; tz: string };

interface DateValue {
  wall: WallTime;
  zone: Zone;
  allDay: boolean;
}

interface IcsEvent {
  uid?: string;
  start: DateValue;
  startMs: number;
  durationMs: number;
  rrule?: Record<string, string>;
  exdates: number[];
  recurrenceId?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/* ---------- Reading the file ---------- */

/** Long lines in .ics files are wrapped onto lines that start with a space or tab */
const unfold = (text: string) =>
  text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');

/** NAME;PARAM=VALUE;PARAM="VALUE":property value */
function parseLine(line: string): Prop | null {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;

  const [name, ...rawParams] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1).trim() };
}

/* ---------- Time zones ---------- */

const formatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

function isValidZone(tz: string) {
  try {
    zoneFormatter(tz);
    return true;
  } catch {
    return false; // e.g. Outlook's "Eastern Standard Time"
  }
}

/** How far ahead of UTC the zone's clocks are at a given moment */
function zoneOffsetMs(tz: string, utcMs: number) {
  const parts = zoneFormatter(tz).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

function toInstant({ wall, zone }: Pick<DateValue, 'wall' | 'zone'>): number {
  const { y, mo, d, h, mi, s } = wall;
  if (zone.kind === 'utc') return Date.UTC(y, mo - 1, d, h, mi, s);
  if (zone.kind === 'local') return new Date(y, mo - 1, d, h, mi, s).getTime();

  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = guess - zoneOffsetMs(zone.tz, guess);
  return guess - zoneOffsetMs(zone.tz, first); // second pass settles daylight saving edges
}

/* ---------- Values ---------- */

function parseDateValue(value: string, params: Record<string, string>): DateValue | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;

  const wall = {
    y: +m[1],
    mo: +m[2],
    d: +m[3],
    h: +(m[4] ?? 0),
    mi: +(m[5] ?? 0),
    s: +(m[6] ?? 0),
  };
  const tz = params.TZID?.replace(/^\//, '');
  const zone: Zone = m[7]
    ? { kind: 'utc' }
    : tz && isValidZone(tz)
      ? { kind: 'tz', tz }
      : { kind: 'local' }; // floating time, or a zone name the browser doesn't know

  return { wall, zone, allDay: !m[4] || params.VALUE === 'DATE' };
}

function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const secs = (+(w ?? 0) * 7 + +(d ?? 0)) * 86_400 + +(h ?? 0) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0);
  return (sign === '-' ? -secs : secs) * 1000;
}

function untilMs(value: string, eventZone: Zone): number {
  const parsed = parseDateValue(value, {});
  if (!parsed) return Infinity;
  const wall = parsed.allDay ? { ...parsed.wall, h: 23, mi: 59, s: 59 } : parsed.wall;
  return toInstant({ wall, zone: parsed.zone.kind === 'utc' ? parsed.zone : eventZone });
}

/* ---------- Events ---------- */

function buildEvent(props: Prop[]): IcsEvent | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const all = (name: string) => props.filter((p) => p.name === name);

  if (get('STATUS')?.value.toUpperCase() === 'CANCELLED') return null;
  if (get('TRANSP')?.value.toUpperCase() === 'TRANSPARENT') return null; // marked as "free"

  const dtstart = get('DTSTART');
  const start = dtstart && parseDateValue(dtstart.value, dtstart.params);
  if (!start || start.allDay) return null;
  const startMs = toInstant(start);

  let durationMs: number | null = null;
  const dtend = get('DTEND');
  const duration = get('DURATION');
  if (dtend) {
    const end = parseDateValue(dtend.value, dtend.params);
    if (end) durationMs = toInstant(end) - startMs;
  } else if (duration) {
    durationMs = parseDuration(duration.value);
  }
  if (!durationMs || durationMs <= 0) return null;

  const rruleProp = get('RRULE');
  const rrule = rruleProp
    ? Object.fromEntries(
        rruleProp.value.split(';').map((kv) => {
          const [k, v = ''] = kv.split('=');
          return [k.toUpperCase(), v.toUpperCase()];
        }),
      )
    : undefined;

  const exdates = all('EXDATE').flatMap((p) =>
    p.value
      .split(',')
      .map((v) => parseDateValue(v, p.params))
      .filter((v): v is DateValue => !!v)
      .map(toInstant),
  );

  const recurrence = get('RECURRENCE-ID');
  const recurrenceValue = recurrence && parseDateValue(recurrence.value, recurrence.params);

  return {
    uid: get('UID')?.value,
    start,
    startMs,
    durationMs,
    rrule,
    exdates,
    recurrenceId: recurrenceValue ? toInstant(recurrenceValue) : undefined,
  };
}

function parseEvents(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Prop[] | null = null;
  let nested = 0; // inside a VALARM or similar block within the event

  for (const line of unfold(text)) {
    const prop = parseLine(line);
    if (!prop) continue;
    const value = prop.value.toUpperCase();

    if (prop.name === 'BEGIN' && value === 'VEVENT') {
      current = [];
      nested = 0;
    } else if (!current) {
      continue;
    } else if (prop.name === 'END' && value === 'VEVENT') {
      const event = buildEvent(current);
      if (event) events.push(event);
      current = null;
    } else if (prop.name === 'BEGIN') {
      nested++;
    } else if (prop.name === 'END') {
      nested--;
    } else if (nested === 0) {
      current.push(prop);
    }
  }
  return events;
}

/** Monday-based week number for a UTC-midnight day (day 0 of 1970 was a Thursday) */
const weekNumber = (dayMs: number) => Math.floor((dayMs / DAY_MS + 3) / 7);

/** Start times of an event's occurrences that overlap [winStart, winEnd) */
function occurrencesIn(event: IcsEvent, winStart: number, winEnd: number, skip: Set<number>): number[] {
  const out: number[] = [];
  const consider = (s: number) => {
    if (!skip.has(s) && s < winEnd && s + event.durationMs > winStart) out.push(s);
  };

  const rule = event.rrule;
  const freq = rule?.FREQ;
  if (!rule || (freq !== 'DAILY' && freq !== 'WEEKLY')) {
    consider(event.startMs);
    return out;
  }

  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? untilMs(rule.UNTIL, event.start.zone) : Infinity;
  const byDay = rule.BYDAY
    ? new Set(rule.BYDAY.split(',').map((d) => ICS_DAYS.indexOf(d.slice(-2))))
    : null;

  // Step through the event's own calendar dates so repeats keep their clock time across DST
  const { wall } = event.start;
  const firstDay = Date.UTC(wall.y, wall.mo - 1, wall.d);
  const weekdays = byDay ?? new Set([new Date(firstDay).getUTCDay()]);
  let seen = 0;

  for (let i = 0; i < MAX_REPEAT_DAYS; i++) {
    const day = firstDay + i * DAY_MS;
    const weekday = new Date(day).getUTCDay();
    const matches =
      freq === 'DAILY'
        ? i % interval === 0 && (!byDay || byDay.has(weekday))
        : (weekNumber(day) - weekNumber(firstDay)) % interval === 0 && weekdays.has(weekday);
    if (!matches) continue;

    const date = new Date(day);
    const start = toInstant({
      zone: event.start.zone,
      wall: { ...wall, y: date.getUTCFullYear(), mo: date.getUTCMonth() + 1, d: date.getUTCDate() },
    });
    if (start > until || seen >= count || start >= winEnd) break;
    seen++;
    consider(start);
  }
  return out;
}

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/* ---------- Main ---------- */

export function icsToAvailability(text: string, options: IcsImportOptions): IcsImportResult {
  const { dayKeys, startHour, endHour, slotMinutes, eventsMean = 'busy', now = new Date() } = options;

  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error('That file isn’t a calendar (.ics) file.');
  }

  const events = parseEvents(text);
  if (events.length === 0) {
    throw new Error('No timed events found in that file. All-day events are skipped.');
  }

  // Edited single instances of a repeating event replace that instance of the original
  const edited = new Map<string, number[]>();
  for (const e of events) {
    if (e.uid && e.recurrenceId !== undefined) {
      edited.set(e.uid, [...(edited.get(e.uid) ?? []), e.recurrenceId]);
    }
  }
  const skipFor = (e: IcsEvent) =>
    new Set([...e.exdates, ...(e.recurrenceId === undefined && e.uid ? edited.get(e.uid) ?? [] : [])]);

  const busyIn = (weekStart: Date) => {
    const from = weekStart.getTime();
    const to = addDays(weekStart, 7).getTime();
    return events.flatMap((e) =>
      occurrencesIn(e, from, to, skipFor(e)).map((s) => [s, s + e.durationMs] as const),
    );
  };

  let weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  let busy = busyIn(weekStart);

  if (busy.length === 0) {
    // Nothing in the next 7 days (a past or future term): use the week the events start
    weekStart = new Date(Math.min(...events.map((e) => e.startMs)));
    weekStart.setHours(0, 0, 0, 0);
    busy = busyIn(weekStart);
  }
  if (busy.length === 0) {
    throw new Error('Couldn’t find any events to use in that file.');
  }

  const visible = new Set(dayKeys);
  const slots: string[] = [];

  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const dayKey = WEEKDAY_KEYS[day.getDay()];
    if (!visible.has(dayKey)) continue;

    for (let mins = startHour * 60; mins < endHour * 60; mins += slotMinutes) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(mins / 60), mins % 60).getTime();
      const end = start + slotMinutes * 60_000;
      const overlapsEvent = busy.some(([bs, be]) => bs < end && be > start);

      if (overlapsEvent === (eventsMean === 'free')) {
        slots.push(`${dayKey}|${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`);
      }
    }
  }

  return { slots: slots.sort(), eventCount: busy.length, weekStart };
}