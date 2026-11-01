import { useEffect, useId, useRef, useState } from 'react';
import AppWindow from './AppWindow';
import type { InitialSize } from './AppWindow';
import AvailabilityCalendar, { PICKED_BUSY } from './AvailabilityCalendar';
import { MAX_GROUP_SIZE, MIN_GROUP_SIZE, SUBJECT_SUGGESTIONS } from '../dataFiles/StudyData';
import { describeSlots, durationLabel } from '../utils/ScheduleBlocks';

/** The calendar's hours. Keep these the same as the pre-survey calendar so the free times line up. */
export interface ScheduleGrid {
  startHour: number;
  endHour: number;
  slotMinutes: 15 | 30 | 60;
}

const DEFAULT_GRID: ScheduleGrid = { startHour: 9, endHour: 17, slotMinutes: 30 };

interface HostSessionWindowProps {
  id: string;
  open: boolean;
  onClose: () => void;
  /** The user's free slots, shown on the schedule. Leave out if not known yet. */
  availability?: string[];
  /** Hours shown on the schedule. Defaults to the availability calendar's 9 AM to 5 PM in 30-minute slots. */
  grid?: ScheduleGrid;
  /** Called with the subject, total group size (host included), and the session's time slots */
  onCreate: (subject: string, maxSize: number, timeSlots: string[]) => void;
}

const SIZES = Array.from({ length: MAX_GROUP_SIZE - MIN_GROUP_SIZE + 1 }, (_, i) => MIN_GROUP_SIZE + i);

/** Opening size: room for the schedule. Tiling still takes over when 2 to 4 windows are open on a big screen. */
const HOST_SIZE: InitialSize = ({ width, height }) => {
  const screen = window.innerWidth;
  if (screen >= 1280) return { width: width * 0.55, height: height * 0.85 };
  if (screen >= 768) return { width: width * 0.75, height: height * 0.85 };
  return { width: width * 0.96, height: height * 0.92 };
};

const CHIP = [
  'inline-flex items-center justify-center w-11 py-1 rounded-md border-2 border-[#3c3c3c]/45',
  'cursor-pointer select-none transition-colors hover:bg-[#EADBC8]/60',
  'has-checked:bg-[#F2A65A] has-checked:border-[#3c3c3c]',
  'has-focus-visible:outline-2 has-focus-visible:outline-dashed has-focus-visible:outline-offset-2',
].join(' ');

/** Form for hosting a new study lobby: subject, group size, and when it meets */
export default function HostSessionWindow({
  id,
  open,
  onClose,
  availability,
  grid = DEFAULT_GRID,
  onCreate,
}: HostSessionWindowProps) {
  const fieldId = useId();
  const subjectRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState('');
  const [size, setSize] = useState(3);
  // The picked session time, as slot keys on one day ("wed|14:00", "wed|14:30", …)
  const [slots, setSlots] = useState<string[]>([]);

  // Fresh form each time it opens
  useEffect(() => {
    if (!open) return;
    setSubject('');
    setSize(3);
    setSlots([]);
    requestAnimationFrame(() => subjectRef.current?.focus());
  }, [open]);

  const trimmed = subject.trim();
  const known = !!availability && availability.length > 0;
  const freeSet = new Set(availability ?? []);
  const busyMinutes = known ? slots.filter((s) => !freeSet.has(s)).length * grid.slotMinutes : 0;

  const missing = trimmed.length < 2 ? 'Add a subject.' : slots.length === 0 ? 'Pick a time block on the schedule.' : '';
  const create = () => !missing && onCreate(trimmed, size, slots);

  const summary =
    slots.length > 0
      ? `${describeSlots(slots, { slotMinutes: grid.slotMinutes })} (${durationLabel(slots.length * grid.slotMinutes)})`
      : '';

  return (
    <AppWindow
      id={id}
      title="Host a session"
      open={open}
      onClose={onClose}
      controls={{ close: 'enabled', fullscreen: 'enabled' }}
      initialSize={HOST_SIZE}
      minWidth={320}
      minHeight={360}
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="m-0 flex-1 min-w-[10rem] text-sm opacity-80">
            {missing}
          </p>
          <button type="button" onClick={onClose} className="px-3 py-0.5 text-sm">
            Cancel
          </button>
          <button type="button" onClick={create} disabled={!!missing} className="px-3 py-0.5 text-sm">
            Create lobby
          </button>
        </div>
      }
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm">What are you studying?</span>
        <input
          ref={subjectRef}
          type="text"
          list={`${fieldId}-subjects`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); // don't submit the page; create instead
              create();
            }
          }}
          placeholder="e.g. Linear Algebra"
          autoComplete="off"
          maxLength={60}
          className="w-full px-2 py-1"
        />
        <datalist id={`${fieldId}-subjects`}>
          {SUBJECT_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>

      <div>
        <p id={`${fieldId}-size`} className="m-0 mb-1 text-sm">
          Group size
        </p>
        <div role="radiogroup" aria-labelledby={`${fieldId}-size`} className="flex gap-2">
          {SIZES.map((n) => (
            <label key={n} className={CHIP}>
              <input
                type="radio"
                name={`${fieldId}-size`}
                value={n}
                checked={size === n}
                onChange={() => setSize(n)}
                className="sr-only"
              />
              {n}
            </label>
          ))}
        </div>
        <p className="m-0 mt-2 text-sm opacity-70">
          You plus up to {size - 1} {size - 1 === 1 ? 'other person' : 'others'}. People request to join, and you choose who gets in.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-base">When does it meet?</h3>
        <p className="m-0 text-sm opacity-70">
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

        {slots.length > 0 && (
          <div role="status" className="flex flex-col gap-1">
            <p className="m-0 text-sm">
              <span className="opacity-70">Session: </span>
              {summary}
            </p>
            {busyMinutes > 0 && (
              <p className="m-0 flex items-start gap-2 text-sm text-[#A8402C]">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 w-4 h-4 shrink-0 rounded-sm border-2 border-[#3c3c3c] ${PICKED_BUSY}`}
                />
                Heads up: {durationLabel(busyMinutes)} of this falls during time you marked as busy. You can still create it.
              </p>
            )}
          </div>
        )}
      </section>
    </AppWindow>
  );
}