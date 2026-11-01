import { Fragment, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, PointerEvent } from 'react';
import { icsToAvailability } from '../utils/IcsAvailability';

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

const DAYS: { key: DayKey; short: string; long: string }[] = [
  { key: 'sun', short: 'Sun', long: 'Sunday' },
  { key: 'mon', short: 'Mon', long: 'Monday' },
  { key: 'tue', short: 'Tue', long: 'Tuesday' },
  { key: 'wed', short: 'Wed', long: 'Wednesday' },
  { key: 'thu', short: 'Thu', long: 'Thursday' },
  { key: 'fri', short: 'Fri', long: 'Friday' },
  { key: 'sat', short: 'Sat', long: 'Saturday' },
];

/** Every slot starts unavailable (red). Dragging marks it available (green). */
const SLOT_UNAVAILABLE = 'bg-[#F2A99E] hover:bg-[#EC978A]';
const SLOT_AVAILABLE = 'bg-[#9FD6A6] hover:bg-[#8DCB95]';
const LINE = 'border-[#3c3c3c]/40';

/* Block mode: the user's free/busy time is shown faintly under the picked block.
   Picked time is solid orange, or red stripes where it covers busy time (a warning). */
const BG_FREE = 'bg-[#9FD6A6]/55 hover:bg-[#9FD6A6]/80';
const BG_BUSY = 'bg-[#F2A99E]/55 hover:bg-[#F2A99E]/80';
const BG_UNKNOWN = 'bg-[#EADBC8]/40 hover:bg-[#EADBC8]/70';
const PICKED = 'bg-[#F2A65A]';
export const PICKED_BUSY = 'bg-[repeating-linear-gradient(45deg,#E0745F_0_5px,#C4553F_5px_10px)]';

export type CalendarMode = 'paint' | 'block';

interface AvailabilityCalendarProps {
  /**
   * 'paint' (default): drag to mark any slots as free, for saving availability.
   * 'block': drag down one day to pick a single time block (e.g. when a session meets).
   *          `freeSlots` show underneath, and picked time over busy slots is striped as a warning.
   */
  mode?: CalendarMode;
  /** Block mode: the user's free slots, shown under the selection. Leave out if unknown. */
  freeSlots?: string[];
  /** Block mode: the picked slots, if you want to control them from the parent */
  value?: string[];
  /** Name of the hidden input, so slots appear in the parent form's FormData */
  name?: string;
  /** Which days to show, in order. Defaults to all 7. e.g. ['mon','tue','wed','thu','fri'] */
  days?: DayKey[];
  /** Used only when `days` isn't given: 0 = week starts Sunday, 1 = Monday */
  weekStartsOn?: 0 | 1;
  /** First visible hour, 0-23 */
  startHour?: number;
  /** Last hour (exclusive): 17 means the final slot ends at 5 PM */
  endHour?: number;
  slotMinutes?: 15 | 30 | 60;
  /** Slots that start out available */
  defaultValue?: string[];
  /** Called with sorted available slot keys like "mon|09:30" (user's local time) */
  onChange?: (slots: string[]) => void;
  /** Shows the "Import .ics" button */
  allowIcsImport?: boolean;
  /** 'busy' (default): event times become unavailable. 'free': event times become available. */
  icsEventsMean?: 'busy' | 'free';
}

type ImportStatus = { kind: 'ok' | 'error'; text: string } | null;

const MAX_ICS_BYTES = 5 * 1024 * 1024;

const pad = (n: number) => String(n).padStart(2, '0');
const toTimeKey = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

function formatTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`;
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`w-4 h-4 rounded-sm border-2 border-[#3c3c3c] ${color}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export default function AvailabilityCalendar({
  mode = 'paint',
  freeSlots,
  value,
  name = 'availability',
  days,
  weekStartsOn = 0,
  startHour = 9,
  endHour = 17,
  slotMinutes = 30,
  defaultValue = [],
  onChange,
  allowIcsImport = true,
  icsEventsMean = 'busy',
}: AvailabilityCalendarProps) {
  const columns = useMemo(() => {
    if (days) return days.map((k) => DAYS.find((d) => d.key === k)!);
    return [...DAYS.slice(weekStartsOn), ...DAYS.slice(0, weekStartsOn)];
  }, [days, weekStartsOn]);

  const rows = useMemo(() => {
    const out: number[] = [];
    for (let m = startHour * 60; m < endHour * 60; m += slotMinutes) out.push(m);
    return out;
  }, [startHour, endHour, slotMinutes]);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultValue));
  // Mirrors `selected` so fast drags never read a stale copy between renders
  const selectedRef = useRef(selected);
  const [focusPos, setFocusPos] = useState({ r: 0, c: 0 }); // roving tabindex
  const dragMode = useRef<'add' | 'remove' | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>(null);
  // Selection from before the last import, so it can be undone
  const [beforeImport, setBeforeImport] = useState<Set<string> | null>(null);

  const replaceSelection = (next: Set<string>) => {
    selectedRef.current = next;
    setSelected(next);
    onChange?.([...next].sort());
  };

  const handleIcsFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be picked again
    if (!file) return;

    if (file.size > MAX_ICS_BYTES) {
      setImportStatus({ kind: 'error', text: 'That file is too big. Calendar files are usually under 5 MB.' });
      return;
    }

    try {
      const result = icsToAvailability(await file.text(), {
        dayKeys: columns.map((d) => d.key),
        startHour,
        endHour,
        slotMinutes,
        eventsMean: icsEventsMean,
      });

      setBeforeImport(selectedRef.current);
      replaceSelection(new Set(result.slots));

      const week = result.weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const n = result.eventCount;
      const rule =
        icsEventsMean === 'busy'
          ? 'Times without events are marked available.'
          : 'Times during events are marked available.';
      setImportStatus({
        kind: 'ok',
        text: `Filled in from ${n} event${n === 1 ? '' : 's'} in the week of ${week}. ${rule} Adjust anything that’s off.`,
      });
    } catch (err) {
      setImportStatus({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Couldn’t read that file.',
      });
    }
  };

  const undoImport = () => {
    if (!beforeImport) return;
    replaceSelection(beforeImport);
    setBeforeImport(null);
    setImportStatus(null);
  };

  const setSlot = (key: string, on: boolean) => {
    const current = selectedRef.current;
    if (current.has(key) === on) return; // nothing to change
    const next = new Set(current);
    if (on) next.add(key);
    else next.delete(key);
    selectedRef.current = next;
    setSelected(next);
    onChange?.([...next].sort());
  };

  /* ---------- Block mode ---------- */
  const isBlock = mode === 'block';
  const freeSet = useMemo(() => new Set(freeSlots ?? []), [freeSlots]);
  const freeKnown = !!freeSlots && freeSlots.length > 0;
  // What's drawn as selected: the parent's value when it controls block mode, otherwise our own
  const shown = isBlock && value ? new Set(value) : selected;
  const blockAnchor = useRef<{ c: number; r: number } | null>(null);

  /** Replace the selection with rows `from`..`to` (inclusive) of one day column */
  const setBlock = (c: number, from: number, to: number) => {
    const day = columns[c].key;
    const keys = rows.slice(from, to + 1).map((mins) => `${day}|${toTimeKey(mins)}`);
    const current = isBlock && value ? value : [...selectedRef.current];
    if (keys.join(',') === current.join(',')) return; // same block as now: nothing to update
    const next = new Set(keys);
    selectedRef.current = next;
    setSelected(next);
    onChange?.(keys);
  };

  const cellAt = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-slot]');
    return el ? { c: Number(el.dataset.c), r: Number(el.dataset.r) } : null;
  };

  const slotAt = (e: PointerEvent): string | null =>
    document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('[data-slot]')?.dataset.slot ?? null;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isBlock) {
      // Block mode: start a new block on this day
      const cell = cellAt(e);
      if (!cell) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      blockAnchor.current = cell;
      setBlock(cell.c, cell.r, cell.r);
      return;
    }
    const key = slotAt(e);
    if (!key) return;
    e.currentTarget.setPointerCapture(e.pointerId); // keep receiving moves outside the grid
    dragMode.current = selectedRef.current.has(key) ? 'remove' : 'add';
    setSlot(key, dragMode.current === 'add');
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (isBlock) {
      // The block stays on the day where the drag started; moving up or down sets its length
      const a = blockAnchor.current;
      const cell = a && cellAt(e);
      if (a && cell) setBlock(a.c, Math.min(a.r, cell.r), Math.max(a.r, cell.r));
      return;
    }
    if (!dragMode.current) return;
    const key = slotAt(e);
    if (key) setSlot(key, dragMode.current === 'add');
  };

  const endDrag = () => {
    dragMode.current = null;
    if (isBlock) blockAnchor.current = null;
  };

  // Block mode by keyboard: Space/Enter starts a block on the focused slot,
  // Shift + Up/Down stretches it within that day
  const keyboardAnchor = useRef<{ c: number; r: number } | null>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
    if (!el) return;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (isBlock) {
        keyboardAnchor.current = { c, r };
        setBlock(c, r, r);
        return;
      }
      const key = el.dataset.slot!;
      setSlot(key, !selectedRef.current.has(key));
      return;
    }
    if (isBlock && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const a = keyboardAnchor.current?.c === c ? keyboardAnchor.current : { c, r };
      keyboardAnchor.current = a;
      const nr = Math.min(rows.length - 1, Math.max(0, r + (e.key === 'ArrowUp' ? -1 : 1)));
      setBlock(c, Math.min(a.r, nr), Math.max(a.r, nr));
      gridRef.current?.querySelector<HTMLElement>(`[data-r="${nr}"][data-c="${c}"]`)?.focus();
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const nr = Math.min(rows.length - 1, Math.max(0, r + move[0]));
    const nc = Math.min(columns.length - 1, Math.max(0, c + move[1]));
    gridRef.current?.querySelector<HTMLElement>(`[data-r="${nr}"][data-c="${nc}"]`)?.focus();
  };

  /** Solid line under the last slot of each hour, dashed line between the slots inside it */
  const rowBottom = (r: number, mins: number) => {
    if (r === rows.length - 1) return '';
    return (mins + slotMinutes) % 60 === 0
      ? 'border-b border-b-[#3c3c3c]/60'
      : `border-b ${LINE} [border-bottom-style:dashed]`;
  };

  const lastCol = columns.length - 1;

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {/* KEY */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        {isBlock ? (
          <>
            {freeKnown ? (
              <>
                <LegendSwatch color="bg-[#9FD6A6]/55" label="Free" />
                <LegendSwatch color="bg-[#F2A99E]/55" label="Busy" />
              </>
            ) : (
              <LegendSwatch color="bg-[#EADBC8]/40" label="Schedule not set" />
            )}
            <LegendSwatch color={PICKED} label="Picked" />
            {freeKnown && <LegendSwatch color={PICKED_BUSY} label="Picked during busy time" />}
          </>
        ) : (
          <>
            <LegendSwatch color="bg-[#F2A99E]" label="Unavailable" />
            <LegendSwatch color="bg-[#9FD6A6]" label="Available" />
          </>
        )}

        {allowIcsImport && !isBlock && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="ml-auto px-3 py-0.5 text-sm flex items-center gap-2"
              title="Fill the calendar from an .ics file (Google Calendar, Outlook, Apple Calendar)"
            >
              <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
                <path
                  d="M10 13V3M6 7l4-4 4 4M4 13v3h12v-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Import .ics
            </button>
            {/* No name, so the file itself never ends up in the form's data */}
            <input
              ref={fileRef}
              type="file"
              accept=".ics,text/calendar"
              onChange={handleIcsFile}
              className="hidden"
              tabIndex={-1}
            />
          </>
        )}
      </div>

      {importStatus && (
        <p
          role="status"
          className={`m-0 text-sm flex flex-wrap items-center gap-x-3 ${
            importStatus.kind === 'error' ? 'text-[#B23A2E]' : ''
          }`}
        >
          {importStatus.text}
          {importStatus.kind === 'ok' && beforeImport && (
            <button type="button" onClick={undoImport} className="px-2 py-0 text-sm">
              Undo
            </button>
          )}
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-max w-full rounded-md border-2 border-[#3c3c3c] overflow-hidden">
          <div
            ref={gridRef}
            role="group"
            aria-label={
              isBlock
                ? 'Pick when the session meets: press a time, then drag (or Shift + arrow keys) to extend it'
                : 'Select the times you’re free to study each week'
            }
            className="grid select-none"
            style={{
              gridTemplateColumns: `4.5rem repeat(${columns.length}, minmax(3.5rem, 1fr))`,
              touchAction: 'none', // lets touch drag select instead of scrolling
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
          >
            {/* Header row */}
            <div className={`bg-[#EADBC8] border-r ${LINE} border-b-2 border-b-[#3c3c3c]/70`} />
            {columns.map((d, c) => (
              <div
                key={d.key}
                title={d.long}
                className={`bg-[#EADBC8] py-2 text-center border-b-2 border-b-[#3c3c3c]/70 ${
                  c < lastCol ? `border-r ${LINE}` : ''
                }`}
              >
                {d.short}
              </div>
            ))}

            {/* Time rows */}
            {rows.map((mins, r) => (
              <Fragment key={mins}>
                <div
                  className={`h-7 px-2 pt-1 text-xs text-right leading-none bg-[#F6EDE2] border-r ${LINE} ${rowBottom(r, mins)}`}
                >
                  {mins % 60 === 0 ? formatTime(mins) : ''}
                </div>
                {columns.map((d, c) => {
                  const key = `${d.key}|${toTimeKey(mins)}`;
                  const on = shown.has(key);
                  const free = freeSet.has(key);
                  const color = !isBlock
                    ? on
                      ? SLOT_AVAILABLE
                      : SLOT_UNAVAILABLE
                    : on
                      ? freeKnown && !free
                        ? PICKED_BUSY
                        : PICKED
                      : !freeKnown
                        ? BG_UNKNOWN
                        : free
                          ? BG_FREE
                          : BG_BUSY;
                  return (
                    <div
                      key={key}
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`${d.long}, ${formatTime(mins)}${isBlock && freeKnown ? (free ? ', free' : ', busy') : ''}`}
                      tabIndex={focusPos.r === r && focusPos.c === c ? 0 : -1}
                      onFocus={() => setFocusPos({ r, c })}
                      data-slot={key}
                      data-r={r}
                      data-c={c}
                      className={[
                        'h-7 cursor-pointer transition-colors duration-100',
                        'outline-none focus-visible:outline-2 focus-visible:outline-dashed focus-visible:-outline-offset-4 focus-visible:outline-[#3c3c3c]',
                        color,
                        c < lastCol ? `border-r ${LINE}` : '',
                        rowBottom(r, mins),
                      ].join(' ')}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Makes the selection part of the parent <form>'s FormData (availability only, not picked blocks) */}
      {!isBlock && (
        <>
          <input type="hidden" name={name} value={JSON.stringify([...selected].sort())} />
          <input type="hidden" name={`${name}Timezone`} value={timezone} />
        </>
      )}
    </div>
  );
}