import { useEffect, useId, useRef, useState } from 'react';
import AppWindow from './Appwindow';
import { YEAR_OPTIONS } from '../dataFiles/AcademicOptions';
import { CHIP, FIELD_LABEL, blockEnter, mergeSuggestions } from './CoursesSection';
import type { AcademicProfile, CourseSuggestionQuery } from './CoursesSection';

interface AboutYouWindowProps {
  value: AcademicProfile;
  onChange: (next: AcademicProfile) => void;
  onClose: () => void;
  /** The course search. Without it the Find button stays disabled. */
  suggestCourses?: (query: CourseSuggestionQuery) => Promise<string[]>;
  /** Called after suggestions were added, with how many */
  onFilled?: (added: number) => void;
  /** Cover the whole screen instead of the desk area (use while the window behind is full screen) */
  coverScreen?: boolean;
}

/**
 * A popup window that floats above the survey window. Render it inside the same
 * `relative` desk area as the main window: it covers that area and stays inside it.
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

  const hasEnough = !!value.major.trim() || !!value.year;

  const findCourses = async () => {
    if (!suggestCourses) return;
    setSearching(true);
    setNote('');
    try {
      const names = await suggestCourses({
        major: value.major.trim(),
        minor: value.minor.trim(),
        year: value.year,
      });
      const { profile, added } = mergeSuggestions(valueRef.current, names);
      onChange(profile);
      if (added > 0) onFilled?.(added);
      else setNote('No new suggestions for that major and year.');
    } catch {
      setNote('Couldn’t get suggestions right now. You can still add courses yourself.');
    } finally {
      setSearching(false);
    }
  };

  const footerNote = !suggestCourses
    ? 'Course search isn’t connected yet.'
    : !hasEnough
      ? 'Add a major or year first.'
      : note;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={`${coverScreen ? 'fixed z-[70]' : 'absolute z-40'} inset-0 p-3 bg-[#3c3c3c]/15`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose(); // click on the dimmed backdrop
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
        controls={{ close: 'enabled', fullscreen: 'disabled' }}
        onClose={onClose}
        initialSize={{ width: 560, height: 440 }}
        minWidth={300}
        minHeight={280}
        footer={
          <div className="flex items-center gap-3">
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
        }
      >
        <p className="m-0 text-sm opacity-80">
          Tell us your major and year and we’ll fill in courses students usually take. You’ll still rate each one.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Major</span>
            <input
              ref={firstFieldRef}
              type="text"
              value={value.major}
              onChange={(e) => update({ major: e.target.value })}
              onKeyDown={blockEnter}
              placeholder="e.g. Computer Science"
              autoComplete="off"
              className="w-full px-2 py-1"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>
              Minor <span className="opacity-60">(optional)</span>
            </span>
            <input
              type="text"
              value={value.minor}
              onChange={(e) => update({ minor: e.target.value })}
              onKeyDown={blockEnter}
              placeholder="e.g. Mathematics"
              autoComplete="off"
              className="w-full px-2 py-1"
            />
          </label>
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
      </AppWindow>
    </div>
  );
}