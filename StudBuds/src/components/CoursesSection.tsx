import { Fragment, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { CONFIDENCE_LEVELS, GRADE_OPTIONS, STATUS_OPTIONS } from '../dataFiles/AcademicOptions';

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

/** What the course suggestion search receives */
export type CourseSuggestionQuery = Pick<AcademicProfile, 'majors' | 'minors' | 'year' | 'gradYear'>;

/** A course the search or a screenshot found, added as a "Suggested" row */
export interface SuggestedCourse {
  name: string;
  status: CourseStatus;
}

/** What the course search returns */
export interface CourseSearchResult {
  courses: SuggestedCourse[];
  /** Pages the courses came from */
  sources: string[];
  /** Programs the search couldn't finish */
  failed: string[];
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
    // You can't rate a course you haven't started
    if (c.status !== 'planned' && c.confidence === null) missing.add(`${c.id}:confidence`);
  }

  if (missing.size === 0) return null;
  return {
    message: missing.has('courses')
      ? 'Add at least one course you’ve taken or are taking.'
      : 'Finish the highlighted courses. Each one needs a name, and a confidence rating unless it’s planned.',
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
      .map(({ suggested: _suggested, ...c }) => ({
        ...c,
        name: c.name.trim(),
        // Planned courses have no rating or grade yet
        ...(c.status === 'planned' ? { confidence: null, grade: '' } : {}),
      })),
  };
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
    if (key && !have.has(key) && !fresh.has(key)) fresh.set(key, { name, status: s.status });
  }

  const queue = [...fresh.values()];
  const courses = profile.courses.map((c) => {
    if (!isBlank(c) || queue.length === 0) return c;
    const s = queue.shift()!;
    return { ...c, name: s.name, status: s.status, suggested: true };
  });
  courses.push(...queue.map((s) => newCourse(s.name, true, s.status)));
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
  'inline-flex items-center justify-center px-3 py-1 rounded-md border-2 border-[#3c3c3c]/45',
  'cursor-pointer select-none text-sm transition-colors hover:bg-[#EADBC8]/60',
  'has-checked:border-[#3c3c3c] has-focus-visible:outline-2 has-focus-visible:outline-dashed has-focus-visible:outline-offset-2',
].join(' ');
export const ERROR_TEXT = 'text-sm text-[#B23A2E]';
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
        c.id === id ? { ...c, ...patch, suggested: patch.confidence != null ? false : c.suggested } : c,
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
          Add at least one course. Confidence: 1 means lost, 5 means you could teach it.
        </p>

        {missing?.has('courses') && <p className={`m-0 mb-2 ${ERROR_TEXT}`}>Add a course to continue.</p>}

        {onOpenAutofill && (
          <button
            type="button"
            onClick={onOpenAutofill}
            title="Enter your major and year to fill in courses students usually take"
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
                className={`flex flex-col gap-3 p-3 rounded-md border-2 bg-[#FDF7F1] ${
                  nameMissing || confidenceMissing ? 'border-[#B23A2E]/70' : 'border-[#3c3c3c]/25'
                }`}
              >
                {/* Name + remove */}
                <div className="flex items-start gap-2">
                  <label className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className={`${FIELD_LABEL} flex items-center gap-2`}>
                      Course
                      {course.suggested && (
                        <span className="px-1.5 rounded bg-[#F2A65A]/40 text-xs">Suggested</span>
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
                  </label>

                  <button
                    type="button"
                    onClick={() => removeCourse(course.id)}
                    aria-label={`Remove ${label}`}
                    title="Remove course"
                    className="mt-6 shrink-0 w-8 h-8 p-0 flex items-center justify-center rounded-md border-2 border-[#3c3c3c]/60 [border-image:none] bg-transparent transition-colors hover:bg-[#F2A99E]"
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
                        <label key={option.value} className={`${CHIP} has-checked:bg-[#EADBC8]`}>
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

                  {course.status !== 'planned' && (
                  <>
                  {/* Confidence 1-5. Planned courses skip it and the grade. */}
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
                          className={`${CHIP} w-9 px-0 has-checked:bg-[#F2A65A]`}
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
                      className="px-2 py-1"
                    >
                      <option value="">No grade</option>
                      {GRADE_OPTIONS.map((grade) => (
                        <option key={grade} value={grade}>
                          {grade}
                        </option>
                      ))}
                    </select>
                  </label>
                  </>
                  )}
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