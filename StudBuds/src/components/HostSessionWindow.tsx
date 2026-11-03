import { useEffect, useId, useRef, useState } from 'react';
import AppWindow, { WINDOW_ACCENTS } from './AppWindow';
import type { InitialSize } from './AppWindow';
import AvailabilityCalendar, { PICKED_BUSY } from './AvailabilityCalendar';
import { DoodleCombobox, DoodleSelect } from './DoodleSelect';
import {
  LOCATION_SUGGESTIONS,
  MAX_GROUP_SIZE,
  MIN_GROUP_SIZE,
  SUBJECT_SUGGESTIONS,
} from '../dataFiles/StudyData';
import { describeSlots, durationLabel } from '../utils/ScheduleBlocks';

/** The calendar's hours. Keep these the same as the pre-survey calendar so the free times line up. */
export interface ScheduleGrid {
  startHour: number;
  endHour: number;
  slotMinutes: 15 | 30 | 60;
}

const DEFAULT_GRID: ScheduleGrid = { startHour: 8, endHour: 23, slotMinutes: 30 };

export interface NewLobbyDetails {
  subject: string;
  /** Total spots, host included */
  maxSize: number;
  location: string;
  /** One block of weekly slots on one day ("wed|14:00", …) */
  timeSlots: string[];
}

interface HostSessionWindowProps {
  id: string;
  open: boolean;
  onClose: () => void;
  /** The user's free slots, shown on the schedule. Leave out if not known yet. */
  availability?: string[];
  /** Places offered in the location box (public cafes, libraries…). Users can also type their own. */
  locationSuggestions?: string[];
  /** Subjects offered while typing. Leave out for the defaults. */
  subjectSuggestions?: string[];
  /** Hours shown on the schedule. Defaults to the availability calendar’s 8 AM to 11 PM in 30-minute slots. */
  grid?: ScheduleGrid;
  onCreate: (details: NewLobbyDetails) => void;
}

const SIZES = Array.from({ length: MAX_GROUP_SIZE - MIN_GROUP_SIZE + 1 }, (_, i) => MIN_GROUP_SIZE + i);

/**
 * Narrower than this, the full week calendar doesn't fit (time column + 7 day columns),
 * so the form switches to a day dropdown and a time range instead.
 */
const CALENDAR_MIN_WIDTH = 470;

const DAYS = [
  { key: 'sun', long: 'Sunday' },
  { key: 'mon', long: 'Monday' },
  { key: 'tue', long: 'Tuesday' },
  { key: 'wed', long: 'Wednesday' },
  { key: 'thu', long: 'Thursday' },
  { key: 'fri', long: 'Friday' },
  { key: 'sat', long: 'Saturday' },
];

/** Opening size: room for the schedule. Tiling still takes over when 2 to 4 windows are open on a big screen. */
const HOST_SIZE: InitialSize = ({ width, height }) => {
  const screen = window.innerWidth;
  if (screen >= 1280) return { width: width * 0.55, height: height * 0.85 };
  if (screen >= 768) return { width: width * 0.75, height: height * 0.85 };
  return { width: width * 0.96, height: height * 0.92 };
};

const pad = (n: number) => String(n).padStart(2, '0');
const slotKey = (day: string, mins: number) => `${day}|${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

function formatTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`;
}

/** Day and start/end minutes of a one-day block of slots, or null if there's nothing picked */
function blockOf(slots: string[]): { day: string; from: number; to: number } | null {
  if (slots.length === 0) return null;
  const mins = slots.map((s) => {
    const [h, m] = s.split('|')[1].split(':').map(Number);
    return h * 60 + m;
  });
  return { day: slots[0].split('|')[0], from: Math.min(...mins), to: Math.max(...mins) };
}

const LABEL = 'flex flex-col gap-1';

/** Small red note under a field that still needs filling in */
function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span
      id={id}
      role="alert"
      className="flex items-center gap-1.5 text-sm text-danger motion-safe:transition motion-safe:duration-200 starting:opacity-0 starting:-translate-y-1"
    >
      <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M10 5.5v5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="10" cy="14.2" r="1.3" fill="currentColor" />
      </svg>
      {children}
    </span>
  );
}

/**
 * Popup form for hosting a new study lobby: subject, group size, where, and when it meets.
 * Dims the whole page, floats above every other window, and stays out of the tiling layout.
 * Closes with its X, Cancel, Escape, or a click on the dimmed area.
 * Render it in the desk area (which needs `relative`), not inside a WindowLayer.
 */
/** Matches the lobbies table's limit */
const SUBJECT_MAX = 60;

export default function HostSessionWindow({
  id,
  open,
  onClose,
  availability,
  locationSuggestions = LOCATION_SUGGESTIONS,
  subjectSuggestions = SUBJECT_SUGGESTIONS,
  grid = DEFAULT_GRID,
  onCreate,
}: HostSessionWindowProps) {
  const fieldId = useId();
  const titleId = useId();
  const subjectRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const timeAreaRef = useRef<HTMLDivElement>(null);
  // Turns on after the first Create click with something missing; each warning clears as its field is filled
  const [showErrors, setShowErrors] = useState(false);
  const [subject, setSubject] = useState('');
  const [size, setSize] = useState(3);
  const [location, setLocation] = useState('');
  // The picked session time, as slot keys on one day ("wed|14:00", "wed|14:30", …)
  const [slots, setSlots] = useState<string[]>([]);
  // True when the window is too narrow for the week calendar
  const [compact, setCompact] = useState(false);

  // Fresh form each time it opens
  useEffect(() => {
    if (!open) return;
    setSubject('');
    setSize(3);
    setLocation('');
    setSlots([]);
    setShowErrors(false);
    requestAnimationFrame(() => subjectRef.current?.focus());
  }, [open]);

  // Watch the space the schedule has, so the form can switch between calendar and dropdowns
  useEffect(() => {
    const el = timeAreaRef.current;
    if (!open || !el) return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < CALENDAR_MIN_WIDTH));
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  const rows: number[] = [];
  for (let m = grid.startHour * 60; m < grid.endHour * 60; m += grid.slotMinutes) rows.push(m);

  const trimmed = subject.trim();
  const place = location.trim();
  const known = !!availability && availability.length > 0;
  const freeSet = new Set(availability ?? []);
  const busyMinutes = known ? slots.filter((s) => !freeSet.has(s)).length * grid.slotMinutes : 0;

  // What still needs filling in
  // A picked suggestion can be longer than typing allows, so the length is checked here too
  const subjectTooLong = trimmed.length > SUBJECT_MAX;
  const needs = {
    subject: trimmed.length < 2 || subjectTooLong,
    location: place.length < 2,
    time: slots.length === 0,
  };
  const warn = {
    subject: showErrors && needs.subject,
    location: showErrors && needs.location,
    time: showErrors && needs.time,
  };

  /** Creates the lobby, or points out every field that still needs filling in, starting with the first */
  const create = () => {
    if (!needs.subject && !needs.location && !needs.time) {
      onCreate({ subject: trimmed, maxSize: size, location: place, timeSlots: slots });
      return;
    }
    setShowErrors(true);
    if (needs.subject) subjectRef.current?.focus();
    else if (needs.location) locationRef.current?.focus();
    else timeAreaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const summary =
    slots.length > 0
      ? `${describeSlots(slots, { slotMinutes: grid.slotMinutes })} (${durationLabel(slots.length * grid.slotMinutes)})`
      : '';

  /* Compact time picker: a day, then a start and end time. Writes the same slot keys as the calendar. */
  const block = blockOf(slots);
  const buildSlots = (day: string, from: number, to: number) =>
    rows.filter((m) => m >= from && m <= to).map((m) => slotKey(day, m));

  const pickDay = (day: string) => {
    if (!day) return setSlots([]);
    // New pick: an hour from the first time of the day
    const from = block?.from ?? rows[0];
    const to = block?.to ?? Math.min(from + 60 - grid.slotMinutes, rows[rows.length - 1]);
    setSlots(buildSlots(day, from, to));
  };
  const pickStart = (from: number) => block && setSlots(buildSlots(block.day, from, Math.max(from, block.to)));
  const pickEnd = (lastStart: number) => block && setSlots(buildSlots(block.day, block.from, lastStart));

  if (!open) return null;

  return (
    <>
      {/* Dims the whole page, taskbar included. Clicking it closes the popup. */}
      <div
        aria-hidden="true"
        onPointerDown={onClose}
        className="fixed inset-0 z-[45] bg-ink/25 motion-safe:transition-opacity motion-safe:duration-200 starting:opacity-0"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // No background of its own: this layer only keeps the popup inside the desk area
        className="absolute inset-0 z-50 p-3"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose(); // click on the dimmed area around the popup
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault(); // so a full screen window behind doesn't also exit
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <AppWindow
          id={id}
          title="Host a session"
          accent={WINDOW_ACCENTS.rose}
          info="Start your own study session. Pick a subject, how many people can join, where you’ll meet, and when. Others request to join, and you choose who gets in."
          titleId={titleId}
          onClose={onClose}
          // A popup: never tiled, and it doesn't push the other windows around
          excludeFromLayout
          tourTarget="host-window"
          controls={{ close: 'enabled', fullscreen: 'hidden', pin: 'hidden' }}
          initialSize={HOST_SIZE}
          minWidth={300}
          minHeight={360}
          footer={
            // Buttons together on the right, so nothing wraps awkwardly on narrow screens
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3 py-0.5 text-sm">
                Cancel
              </button>
              <button type="button" onClick={create} data-tour="host-create" className="px-3 py-0.5 text-sm">
                Create lobby
              </button>
            </div>
          }
        >
          {/* SUBJECT */}
          <div className={LABEL} data-tour="host-subject">
            <label htmlFor={`${fieldId}-subject`} className="text-sm">
              What are you studying?
            </label>
            <DoodleCombobox
              id={`${fieldId}-subject`}
              inputRef={subjectRef}
              value={subject}
              onChange={setSubject}
              suggestions={subjectSuggestions}
              placeholder="e.g. Linear Algebra"
              maxLength={SUBJECT_MAX}
              invalid={warn.subject}
              describedBy={warn.subject ? `${fieldId}-subject-error` : undefined}
            />
            {warn.subject && (
              <FieldError id={`${fieldId}-subject-error`}>
                {subjectTooLong
                  ? `Shorten it to ${SUBJECT_MAX} characters (it’s ${trimmed.length} now).`
                  : 'Add what you’ll be studying.'}
              </FieldError>
            )}
          </div>

          {/* LOCATION: suggestions plus anything the user types */}
          <div className={LABEL} data-tour="host-place">
            <label htmlFor={`${fieldId}-place`} className="text-sm">
              Where will you meet?
            </label>
            <DoodleCombobox
              id={`${fieldId}-place`}
              inputRef={locationRef}
              value={location}
              onChange={setLocation}
              suggestions={locationSuggestions}
              placeholder="Pick a cafe or library, or type your own"
              maxLength={80}
              footer="Not listed? Just type the place."
              invalid={warn.location}
              describedBy={warn.location ? `${fieldId}-place-error` : undefined}
            />
            {warn.location && <FieldError id={`${fieldId}-place-error`}>Add where you’ll meet.</FieldError>}
            <span className="text-xs opacity-70">Choose a public spot from the list or type any place, like a room number.</span>
          </div>

          {/* GROUP SIZE */}
          <div className={`${LABEL} self-start`} data-tour="host-size">
            <label htmlFor={`${fieldId}-size`} className="text-sm">
              Group size
            </label>
            <DoodleSelect
              id={`${fieldId}-size`}
              value={size}
              onChange={setSize}
              options={SIZES.map((n) => ({ value: n, label: `${n} people (you + ${n - 1})` }))}
              className="w-56 max-w-full"
            />
            <span className="text-xs opacity-70">People request to join, and you choose who gets in.</span>
          </div>

          {/* TIME */}
          <section className="flex flex-col gap-2" data-tour="host-time">
            <h3 className="m-0 text-base">When does it meet?</h3>
            {warn.time && <FieldError id={`${fieldId}-time-error`}>Pick when the session meets.</FieldError>}

            {/* Red dashed frame around the whole time picker while it still needs a pick */}
            <div
              ref={timeAreaRef}
              aria-describedby={warn.time ? `${fieldId}-time-error` : undefined}
              className={`min-w-0 rounded-md transition-[outline-color] ${
                warn.time ? 'outline-2 outline-dashed outline-danger-strong outline-offset-4' : ''
              }`}
            >
              {compact ? (
                // Narrow window: day, then a start and end time
                <div className="flex flex-col gap-3">
                  <div className={`${LABEL} self-start`}>
                    <label htmlFor={`${fieldId}-day`} className="text-sm">
                      Day
                    </label>
                    <DoodleSelect
                      id={`${fieldId}-day`}
                      value={block?.day ?? null}
                      onChange={pickDay}
                      options={DAYS.map((d) => ({ value: d.key, label: d.long }))}
                      placeholder="Pick a day"
                      className="w-48 max-w-full"
                    />
                  </div>

                  <div role="group" aria-labelledby={`${fieldId}-time`} className="flex flex-col gap-1">
                    <span id={`${fieldId}-time`} className="text-sm">
                      Time
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <DoodleSelect
                        aria-label="Starts at"
                        value={block?.from ?? null}
                        onChange={pickStart}
                        options={rows.map((m) => ({ value: m, label: formatTime(m) }))}
                        placeholder="Start"
                        disabled={!block}
                        className="w-32"
                      />
                      <span className="text-sm">to</span>
                      <DoodleSelect
                        aria-label="Ends at"
                        value={block?.to ?? null}
                        onChange={pickEnd}
                        // Value is the last slot's start; the label is when that slot ends
                        options={rows
                          .filter((m) => !block || m >= block.from)
                          .map((m) => ({ value: m, label: formatTime(m + grid.slotMinutes) }))}
                        placeholder="End"
                        disabled={!block}
                        className="w-32"
                      />
                    </div>
                    {!block && <span className="text-xs opacity-70">Pick a day first.</span>}
                  </div>
                </div>
              ) : (
                <>
                  <p className="m-0 mb-2 text-sm opacity-70">
                    Drag down a day on your schedule to pick the session’s time. It can be as long as you like.
                  </p>
                  {/* The same calendar as the pre-survey, in block mode: your free/busy time underneath, one block on top */}
                  <AvailabilityCalendar
                    mode="block"
                    freeSlots={availability}
                    value={slots}
                    onChange={setSlots}
                    allowIcsImport={false}
                    startHour={grid.startHour}
                    endHour={grid.endHour}
                    slotMinutes={grid.slotMinutes}
                  />
                </>
              )}
            </div>

            {slots.length > 0 && (
              <div className="flex flex-col gap-1">
                <p role="status" className="m-0 text-sm">
                  <span className="opacity-70">Session: </span>
                  {summary}
                </p>
                {busyMinutes > 0 && (
                  // Pops up whenever the picked time overlaps busy time, in either mode
                  <p
                    role="alert"
                    className="m-0 flex items-start gap-2 p-2 rounded-md border-2 border-danger-strong/50 bg-danger-soft/40 text-sm text-danger motion-safe:transition motion-safe:duration-200 starting:opacity-0 starting:-translate-y-1"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 w-4 h-4 shrink-0 rounded-sm border-2 border-ink ${PICKED_BUSY}`}
                    />
                    Heads up: {durationLabel(busyMinutes)} of this falls during time you marked as busy. You can still
                    create it.
                  </p>
                )}
              </div>
            )}
          </section>
        </AppWindow>
      </div>
    </>
  );
}