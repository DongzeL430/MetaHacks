import { useEffect, useId, useRef, useState } from 'react';
import AppWindow from './AppWindow';
import { MAX_PROGRAMS, YEAR_OPTIONS } from '../dataFiles/AcademicOptions';
import { CHIP, FIELD_LABEL, blockEnter, mergeSuggestions } from './CoursesSection';
import type { AcademicProfile, CourseSearchResult, CourseSuggestionQuery, MajorEntry } from './CoursesSection';

interface AboutYouWindowProps {
  value: AcademicProfile;
  onChange: (next: AcademicProfile) => void;
  onClose: () => void;
  /** The course search. Without it the Find button stays disabled. */
  suggestCourses?: (query: CourseSuggestionQuery) => Promise<CourseSearchResult>;
  /** Called after suggestions were added, with how many and what the search returned */
  onFilled?: (added: number, result: CourseSearchResult) => void;
  /** Cover the whole screen instead of the desk area (use while the window behind is full screen) */
  coverScreen?: boolean;
}

/** Graduation years offered: last year (just finished) through six years out */
const thisYear = new Date().getFullYear();
const GRAD_YEARS = Array.from({ length: 8 }, (_, i) => String(thisYear - 1 + i));

/**
 * A popup window that floats above the survey window. Render it inside the same
 * `relative` desk area as the main window: it stays inside that area, while the
 * shade behind it dims the whole page.
 */
export default function AboutYouWindow({
  value,
  onChange,
  onClose,
  suggestCourses,
  onFilled,
  coverScreen = false,
}: AboutYouWindowProps) {
  const titleId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  // Latest value, so a slow search doesn't overwrite edits made while it ran
  const valueRef = useRef(value);
  valueRef.current = value;
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const update = (patch: Partial<AcademicProfile>) => onChange({ ...valueRef.current, ...patch });

  const setMajor = (index: number, patch: Partial<MajorEntry>) =>
    update({ majors: valueRef.current.majors.map((m, i) => (i === index ? { ...m, ...patch } : m)) });
  const removeMajor = (index: number) => {
    const rest = valueRef.current.majors.filter((_, i) => i !== index);
    update({ majors: rest.length > 0 ? rest : [{ name: '', track: '' }] });
  };
  const setMinor = (index: number, name: string) =>
    update({ minors: valueRef.current.minors.map((m, i) => (i === index ? name : m)) });
  const removeMinor = (index: number) => {
    const rest = valueRef.current.minors.filter((_, i) => i !== index);
    update({ minors: rest.length > 0 ? rest : [''] });
  };

  const majors = value.majors.filter((m) => m.name.trim());
  const hasEnough = majors.length > 0 && !!value.gradYear;

  const findCourses = async () => {
    if (!suggestCourses) return;
    setSearching(true);
    setNote('');
    try {
      const result = await suggestCourses({
        majors: majors.map((m) => ({ name: m.name.trim(), track: m.track.trim() })),
        year: value.year,
        gradYear: value.gradYear,
      });
      const { profile, added } = mergeSuggestions(valueRef.current, result.courses);
      onChange(profile);
      if (added > 0) onFilled?.(added, result);
      else if (result.failed.length > 0) setNote(`Couldn’t search ${result.failed.join(', ')} right now. Try again in a minute.`);
      else setNote('Muse didn’t find courses from past terms. If this is your first term, add the ones you’re taking now yourself.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Couldn’t get suggestions right now. You can still add courses yourself.');
    } finally {
      setSearching(false);
    }
  };

  const footerNote = !suggestCourses
    ? 'Course search isn’t connected yet.'
    : !hasEnough
      ? 'Add a major and your graduation year first.'
      : searching
        ? 'Muse is searching your school’s catalog. This can take a minute.'
        : note;

  const removeButton = 'shrink-0 px-2 py-1 text-sm';

  return (
    <>
      {/* Dims the WHOLE page, taskbar included. Fixed to the viewport, so it isn't limited to the desk area.
          Sits above the survey window (also when that one is full screen) and below this popup.
          Clicking it closes the popup. */}
      <div
        aria-hidden="true"
        onPointerDown={onClose}
        className={`fixed inset-0 bg-[#3c3c3c]/25 ${coverScreen ? 'z-[65]' : 'z-[45]'} motion-safe:transition-opacity motion-safe:duration-200 starting:opacity-0`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // No background of its own: this layer only keeps the popup inside the desk area
        className={`${coverScreen ? 'fixed z-[70]' : 'absolute z-50'} inset-0 p-3`}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose(); // click on the dimmed area around the popup
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault(); // so the full screen window behind doesn't also exit
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <AppWindow
          title="About you"
          titleId={titleId}
          // A modal popup: keep it out of the auto-arranging, and don't let the survey window move for it
          excludeFromLayout
          controls={{ close: 'enabled', fullscreen: 'disabled', pin: 'hidden' }}
          onClose={onClose}
          initialSize={{ width: 600, height: 560 }}
          minWidth={300}
          minHeight={280}
          footerClassName="p-0"
          footer={
            <>
              <div className="px-3 py-1.5 flex items-center gap-3">
                <p role="status" className="m-0 flex-1 min-w-0 text-sm opacity-80">
                  {footerNote}
                </p>
                <button
                  type="button"
                  onClick={findCourses}
                  disabled={!suggestCourses || !hasEnough || searching}
                  className="px-3 py-0.5 text-sm"
                >
                  {searching ? 'Searching…' : 'Find courses'}
                </button>
              </div>
              {/* Edge where the footer strip meets the lighter area below it */}
              <hr className="m-0" />
            </>
          }
        >
          <p className="m-0 text-sm opacity-80">
            Muse looks up your majors in your school’s catalog and adds courses you’ve most likely already taken. Check each one.
          </p>

          {/* MAJORS, each with an optional track */}
          <div className="flex flex-col gap-2">
            <p className={`m-0 ${FIELD_LABEL}`}>Majors</p>
            {value.majors.map((major, i) => (
              <div key={i} className="flex items-end gap-2">
                <label className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="sr-only">Major {i + 1}</span>
                  <input
                    ref={i === 0 ? firstFieldRef : undefined}
                    type="text"
                    value={major.name}
                    onChange={(e) => setMajor(i, { name: e.target.value })}
                    onKeyDown={blockEnter}
                    placeholder="e.g. Computer Science"
                    autoComplete="off"
                    maxLength={80}
                    className="w-full px-2 py-1"
                  />
                </label>
                <label className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="sr-only">Track for major {i + 1} (optional)</span>
                  <input
                    type="text"
                    value={major.track}
                    onChange={(e) => setMajor(i, { track: e.target.value })}
                    onKeyDown={blockEnter}
                    placeholder="Track or concentration (optional)"
                    autoComplete="off"
                    maxLength={80}
                    className="w-full px-2 py-1"
                  />
                </label>
                {value.majors.length > 1 && (
                  <button type="button" onClick={() => removeMajor(i)} className={removeButton} aria-label={`Remove major ${i + 1}`}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {value.majors.length < MAX_PROGRAMS && (
              <button
                type="button"
                onClick={() => update({ majors: [...valueRef.current.majors, { name: '', track: '' }] })}
                className="self-start px-3 py-0.5 text-sm"
              >
                + Add another major
              </button>
            )}
          </div>

          {/* MINORS */}
          <div className="flex flex-col gap-2">
            <p className={`m-0 ${FIELD_LABEL}`}>
              Minors <span className="opacity-60">(optional)</span>
            </p>
            {value.minors.map((minor, i) => (
              <div key={i} className="flex items-end gap-2">
                <label className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="sr-only">Minor {i + 1}</span>
                  <input
                    type="text"
                    value={minor}
                    onChange={(e) => setMinor(i, e.target.value)}
                    onKeyDown={blockEnter}
                    placeholder="e.g. Mathematics"
                    autoComplete="off"
                    maxLength={80}
                    className="w-full px-2 py-1"
                  />
                </label>
                {value.minors.length > 1 && (
                  <button type="button" onClick={() => removeMinor(i)} className={removeButton} aria-label={`Remove minor ${i + 1}`}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {value.minors.length < MAX_PROGRAMS && (
              <button
                type="button"
                onClick={() => update({ minors: [...valueRef.current.minors, ''] })}
                className="self-start px-3 py-0.5 text-sm"
              >
                + Add another minor
              </button>
            )}
          </div>

          <div>
            <p id={`${titleId}-year`} className={`m-0 mb-1 ${FIELD_LABEL}`}>
              Year
            </p>
            <div role="radiogroup" aria-labelledby={`${titleId}-year`} className="flex flex-wrap gap-2">
              {YEAR_OPTIONS.map((year) => (
                <label key={year} className={`${CHIP} has-checked:bg-[#EADBC8]`}>
                  <input
                    type="radio"
                    name="year"
                    value={year}
                    checked={value.year === year}
                    onChange={() => update({ year })}
                    className="sr-only"
                  />
                  {year}
                </label>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 self-start">
            <span className={FIELD_LABEL}>Expected graduation</span>
            <select
              value={value.gradYear}
              onChange={(e) => update({ gradYear: e.target.value })}
              // Room on the right for doodle.css's arrow, which px-2 would cover
              className="pl-2 pr-8 py-1"
            >
              <option value="">Pick a year</option>
              {GRAD_YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </AppWindow>
      </div>
    </>
  );
}