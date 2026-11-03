import { Fragment, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { CONFIDENCE_LEVELS, GRADE_GROUPS, STATUS_OPTIONS } from '../dataFiles/AcademicOptions';

export type CourseStatus = (typeof STATUS_OPTIONS)[number]['value'];

export interface CourseEntry {
  id: string;
  name: string;
  status: CourseStatus;
  /** 1 to 5, null until the user picks one */
  confidence: number | null;
  /** Optional, '' when left blank */
  grade: string;
  /** Added by the suggestion search and not yet rated by the user */
  suggested?: boolean;
  /**
   * The school's course code, once known: from Find courses, a schedule screenshot, or Muse
   * matching the typed name. Without one the course is saved privately under its typed name.
   * Editing the name clears it.
   */
  code?: string;
  /** Muse already tried to match this name (so it isn't sent again) */
  checked?: boolean;
}

/** A major and its optional track or concentration */
export interface MajorEntry {
  name: string;
  track: string;
}

export interface AcademicProfile {
  /** Up to MAX_PROGRAMS. Blank entries are dropped on save. */
  majors: MajorEntry[];
  minors: string[];
  year: string;
  /** Expected graduation year, like "2028", or '' */
  gradYear: string;
  courses: CourseEntry[];
}

/** What the course suggestion search receives. Minors aren't searched. */
export type CourseSuggestionQuery = Pick<AcademicProfile, 'majors' | 'year' | 'gradYear'>;

/** A course the search or a screenshot found, added as a "Suggested" row */
export interface SuggestedCourse {
  name: string;
  status: CourseStatus;
  /** The school's course code, when the source knows it */
  code?: string;
}

/** What the course search returns */
export interface CourseSearchResult {
  courses: SuggestedCourse[];
  /** Pages the courses came from */
  sources: string[];
  /** Programs the search couldn't finish */
  failed: string[];
}

/** What Muse needs to match typed course names to the school's courses */
export interface CourseMatchQuery {
  names: string[];
  majors: MajorEntry[];
  gradYear: string;
}

/** One typed name and the course it matched, or a null code when Muse couldn't place it */
export interface CourseMatch {
  name: string;
  code: string | null;
  title: string | null;
}

/** Muse's answer. checked is false when Muse couldn't be reached, so nothing was really tried. */
export interface CourseMatchResult {
  courses: CourseMatch[];
  checked: boolean;
}

const newId = () => Math.random().toString(36).slice(2, 10);

export const newCourse = (name = '', suggested = false, status: CourseStatus = 'taken'): CourseEntry => ({
  id: newId(),
  name,
  status,
  confidence: null,
  grade: '',
  suggested,
});

export const emptyAcademics = (): AcademicProfile => ({
  majors: [{ name: '', track: '' }],
  minors: [''],
  year: '',
  gradYear: '',
  courses: [newCourse()],
});

/**
 * What makes two rows the same course: the code when the name starts with one
 * ("CS 2500 · Fundamentals of CS 1" and "cs2500" match), otherwise the whole name.
 */
const courseKey = (name: string) => {
  const code = name.trim().match(/^([A-Za-z&]{2,6})[\s-]*(\d{2,5}[A-Za-z]?)\b/);
  return (code ? code[1] + code[2] : name).replace(/\s/g, '').toLowerCase();
};

/** A row the user never touched, ignored by validation and dropped on save */
const isBlank = (c: CourseEntry) => !c.name.trim() && c.confidence === null && !c.grade;

/**
 * Error keys: 'courses' (no courses at all), '<id>:name', '<id>:confidence'.
 * Returns null when the page is complete.
 */
export function validateAcademics(profile: AcademicProfile): { message: string; missing: Set<string> } | null {
  const missing = new Set<string>();
  const used = profile.courses.filter((c) => !isBlank(c));

  if (!used.some((c) => c.name.trim())) missing.add('courses');
  for (const c of used) {
    if (!c.name.trim()) missing.add(`${c.id}:name`);
    if (c.confidence === null) missing.add(`${c.id}:confidence`);
  }

  if (missing.size === 0) return null;
  return {
    message: missing.has('courses')
      ? 'Add at least one course you’ve taken or are taking.'
      : 'Finish the highlighted courses. Each one needs a name and a confidence rating.',
    missing,
  };
}

/** Trimmed copy without blank rows or UI-only flags, ready to save */
export function cleanAcademics(profile: AcademicProfile): AcademicProfile {
  return {
    majors: profile.majors
      .map((m) => ({ name: m.name.trim(), track: m.track.trim() }))
      .filter((m) => m.name),
    minors: profile.minors.map((m) => m.trim()).filter(Boolean),
    year: profile.year,
    gradYear: profile.gradYear,
    courses: profile.courses
      .filter((c) => c.name.trim())
      .map(({ suggested: _suggested, checked: _checked, ...c }) => ({ ...c, name: c.name.trim() })),
  };
}

/** Same spacing and case rules Muse's matcher uses, so its answers line up with the rows */
const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** Typed course names Muse hasn't looked at yet: no code, not checked before */
export const namesToMatch = (profile: AcademicProfile): string[] => [
  ...new Set(
    profile.courses
      .filter((c) => c.name.trim() && !c.code && !c.checked)
      .map((c) => c.name.trim().replace(/\s+/g, ' ')),
  ),
];

/**
 * Applies Muse's matches: a matched row becomes "CODE · Official title" with its code, and every
 * row Muse looked at is marked checked. Returns how many rows matched and how many didn't.
 */
export function applyMatches(
  profile: AcademicProfile,
  matches: CourseMatch[],
): { profile: AcademicProfile; matched: number; unmatched: number } {
  const byName = new Map(matches.map((m) => [nameKey(m.name), m]));
  let matched = 0;
  let unmatched = 0;
  const courses = profile.courses.map((c) => {
    const m = !c.code && !c.checked ? byName.get(nameKey(c.name)) : undefined;
    if (!m) return c;
    if (!m.code) {
      unmatched++;
      return { ...c, checked: true };
    }
    matched++;
    return { ...c, name: m.title ? `${m.code} · ${m.title}` : m.code, code: m.code, checked: true };
  });
  return { profile: { ...profile, courses }, matched, unmatched };
}

/**
 * Adds suggested courses: fills empty rows first, then adds new rows.
 * Courses already on the list (same code, or same name) are skipped.
 * Plain names are added as "Already taken".
 */
export function mergeSuggestions(
  profile: AcademicProfile,
  suggestions: (string | SuggestedCourse)[],
): { profile: AcademicProfile; added: number } {
  const have = new Set(profile.courses.map((c) => c.name.trim() && courseKey(c.name)).filter(Boolean));
  const fresh = new Map<string, SuggestedCourse>();
  for (const raw of suggestions) {
    const s: SuggestedCourse = typeof raw === 'string' ? { name: raw, status: 'taken' } : raw;
    const name = s.name.trim();
    const key = name && courseKey(name);
    if (key && !have.has(key) && !fresh.has(key)) fresh.set(key, { name, status: s.status, code: s.code });
  }

  const queue = [...fresh.values()];
  const courses = profile.courses.map((c) => {
    if (!isBlank(c) || queue.length === 0) return c;
    const s = queue.shift()!;
    return { ...c, name: s.name, status: s.status, suggested: true, code: s.code };
  });
  courses.push(...queue.map((s) => ({ ...newCourse(s.name, true, s.status), code: s.code })));
  return { profile: { ...profile, courses }, added: fresh.size };
}

interface CoursesSectionProps {
  value: AcademicProfile;
  onChange: (next: AcademicProfile) => void;
  /** Error keys from validateAcademics */
  missing?: Set<string>;
  /** Shows the "Auto-fill courses" button, which should open the About you window */
  onOpenAutofill?: () => void;
  /** Message shown above the course list, e.g. after an auto-fill */
  notice?: string;
  /** Pages the course search used, linked under the notice so students can check them */
  sources?: string[];
}

/** "catalog.school.edu/…/computer-science-bs" instead of the full address */
function shortUrl(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const last = pathname.split('/').filter(Boolean).pop();
    return last ? `${hostname}/…/${last}` : hostname;
  } catch {
    return url;
  }
}

export const CHIP = [
  'inline-flex items-center justify-center px-3 py-1 rounded-md border-2 border-ink/45',
  'cursor-pointer select-none text-sm transition-colors hover:bg-sand/60',
  'has-checked:border-ink has-focus-visible:outline-2 has-focus-visible:outline-dashed has-focus-visible:outline-offset-2',
].join(' ');
export const ERROR_TEXT = 'text-sm text-danger';
export const FIELD_LABEL = 'text-sm';

/** Enter in a text box would submit the whole page */
export const blockEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.preventDefault();
};

export default function CoursesSection({ value, onChange, missing, onOpenAutofill, notice, sources }: CoursesSectionProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // Latest value, so quick successive edits never build on an old copy
  const valueRef = useRef(value);
  valueRef.current = value;

  const update = (patch: Partial<AcademicProfile>) => onChange({ ...valueRef.current, ...patch });

  const updateCourse = (id: string, patch: Partial<CourseEntry>) =>
    update({
      courses: valueRef.current.courses.map((c) =>
        c.id === id
          ? {
              ...c,
              ...patch,
              suggested: patch.confidence != null ? false : c.suggested,
              // A renamed course is a new name to look up
              ...(patch.name !== undefined ? { code: undefined, checked: false } : {}),
            }
          : c,
      ),
    });

  const focusCourse = (id: string) =>
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLInputElement>(`[data-course-name="${id}"]`)?.focus(),
    );

  const addCourse = () => {
    const course = newCourse();
    update({ courses: [...valueRef.current.courses, course] });
    focusCourse(course.id);
  };

  const removeCourse = (id: string) => {
    const rest = valueRef.current.courses.filter((c) => c.id !== id);
    update({ courses: rest.length > 0 ? rest : [newCourse()] });
  };

  /** Enter in a course name moves to the next row, adding one at the end */
  const handleNameKey = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = value.courses[index + 1];
    if (next) focusCourse(next.id);
    else addCourse();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* COURSES */}
      <fieldset className="m-0 min-w-0 px-4 pb-4 pt-2">
        <legend className="px-2 text-lg">Courses</legend>
        <p className="m-0 mb-3 text-sm opacity-80">
          Add at least one course. Confidence: 1 means lost, 5 means you could teach it. Courses you rate 1
          or 2 show on your card as “Looking for help with”. Your ratings and grades are never shown.
        </p>

        {missing?.has('courses') && <p className={`m-0 mb-2 ${ERROR_TEXT}`}>Add a course to continue.</p>}

        {onOpenAutofill && (
          <button
            type="button"
            onClick={onOpenAutofill}
            title="Enter your major and graduation year to fill in courses you've most likely taken"
            className="mb-3 px-3 py-0.5 text-sm flex items-center gap-2"
          >
            <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
              <path
                d="M10 2.5v4M10 13.5v4M2.5 10h4M13.5 10h4M5 5l2 2M13 13l2 2M15 5l-2 2M7 13l-2 2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            Auto-fill courses
          </button>
        )}

        {notice && (
          <p role="status" className="m-0 mb-3 text-sm opacity-80">
            {notice}
          </p>
        )}

        {sources && sources.length > 0 && (
          <p className="m-0 mb-3 text-sm opacity-80">
            Sources:{' '}
            {sources.map((url, i) => (
              <Fragment key={url}>
                {i > 0 && ', '}
                <a href={url} target="_blank" rel="noreferrer" className="underline">
                  {shortUrl(url)}
                </a>
              </Fragment>
            ))}
          </p>
        )}

        <div ref={listRef} className="flex flex-col gap-3">
          {value.courses.map((course, index) => {
            const nameMissing = missing?.has(`${course.id}:name`) ?? false;
            const confidenceMissing = missing?.has(`${course.id}:confidence`) ?? false;
            const label = course.name.trim() || `Course ${index + 1}`;

            return (
              <div
                key={course.id}
                className={`flex flex-col gap-3 p-3 rounded-md border-2 bg-paper ${
                  nameMissing || confidenceMissing ? 'border-danger/70' : 'border-ink/25'
                }`}
              >
                {/* Name + remove */}
                <div className="flex items-start gap-2">
                  <label className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className={`${FIELD_LABEL} flex items-center gap-2`}>
                      Course
                      {course.suggested && (
                        <span className="px-1.5 rounded bg-accent/40 text-xs">Suggested</span>
                      )}
                    </span>
                    <input
                      data-course-name={course.id}
                      type="text"
                      value={course.name}
                      onChange={(e) => updateCourse(course.id, { name: e.target.value })}
                      onKeyDown={(e) => handleNameKey(e, index)}
                      placeholder="e.g. CS 2201 Data Structures"
                      autoComplete="off"
                      aria-invalid={nameMissing || undefined}
                      className="w-full px-2 py-1"
                    />
                    {nameMissing && <span className={ERROR_TEXT}>Name this course or remove it.</span>}
                    {course.checked && !course.code && course.name.trim() && (
                      <span className="text-xs opacity-70">
                        Not found in your school’s catalog. It’s saved as you typed it, kept private, and not used
                        for matching. Edit the name to look again.
                      </span>
                    )}
                  </label>

                  <button
                    type="button"
                    onClick={() => removeCourse(course.id)}
                    aria-label={`Remove ${label}`}
                    title="Remove course"
                    className="mt-6 shrink-0 w-8 h-8 p-0 flex items-center justify-center rounded-md border-2 border-ink/60 [border-image:none] bg-transparent transition-colors hover:bg-busy"
                  >
                    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" aria-hidden="true">
                      <path
                        d="M4 4.5 16 15.5M15.5 4 4.5 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                  {/* Taken or taking */}
                  <div>
                    <p className={`m-0 mb-1 ${FIELD_LABEL}`} aria-hidden="true">
                      Status
                    </p>
                    <div role="radiogroup" aria-label={`${label}: status`} className="flex flex-wrap gap-2">
                      {STATUS_OPTIONS.map((option) => (
                        <label key={option.value} className={`${CHIP} has-checked:bg-sand`}>
                          <input
                            type="radio"
                            name={`status-${course.id}`}
                            value={option.value}
                            checked={course.status === option.value}
                            onChange={() => updateCourse(course.id, { status: option.value })}
                            className="sr-only"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Confidence 1-5 */}
                  <div>
                    <p className={`m-0 mb-1 ${FIELD_LABEL}`} aria-hidden="true">
                      Confidence
                    </p>
                    <div
                      role="radiogroup"
                      aria-label={`${label}: confidence from 1 to 5`}
                      className="flex gap-1.5"
                    >
                      {CONFIDENCE_LEVELS.map((level) => (
                        <label
                          key={level.value}
                          title={level.label}
                          className={`${CHIP} w-9 px-0 has-checked:bg-accent`}
                        >
                          <input
                            type="radio"
                            name={`confidence-${course.id}`}
                            value={level.value}
                            checked={course.confidence === level.value}
                            onChange={() => updateCourse(course.id, { confidence: level.value })}
                            aria-label={`${level.value}, ${level.label}`}
                            className="sr-only"
                          />
                          {level.value}
                        </label>
                      ))}
                    </div>
                    {confidenceMissing && <p className={`m-0 mt-1 ${ERROR_TEXT}`}>Pick 1 to 5.</p>}
                  </div>

                  {/* Optional grade */}
                  <label className="flex flex-col gap-1">
                    <span className={FIELD_LABEL}>
                      {course.status === 'taking' ? 'Current grade' : 'Grade'}{' '}
                      <span className="opacity-60">(optional)</span>
                    </span>
                    <select
                      value={course.grade}
                      onChange={(e) => updateCourse(course.id, { grade: e.target.value })}
                      // Room on the right for doodle.css's arrow, which px-2 would cover
                      className="pl-2 pr-8 py-1"
                    >
                      <option value="">No grade</option>
                      {GRADE_GROUPS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.grades.map((grade) => (
                            <option key={grade.value} value={grade.value}>
                              {grade.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" onClick={addCourse} className="mt-3 px-3 py-0.5 text-sm">
          + Add course
        </button>
      </fieldset>
    </div>
  );
}