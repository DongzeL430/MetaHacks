import { callFunction } from './edgeFunctions.ts';
import { supabase } from './supabase.ts';
import type { Database } from '../../../supabase/database.types.ts';
import type {
  AcademicProfile,
  CourseMatchQuery,
  CourseMatchResult,
  CourseSearchResult,
  CourseSuggestionQuery,
} from '../components/CoursesSection';
import { actingId } from './demo.ts';

type Grade = Database['public']['Enums']['letter_grade'];

interface FoundCourse {
  code: string;
  title: string;
  term: string | null;
}

/**
 * "Find courses": Muse Spark searches the student's school catalog for each major and returns
 * the courses they have most likely already finished (supabase/functions/suggest-courses).
 * Courses come back named like "CS 2500 · Fundamentals of CS 1".
 */
export async function findCourses(query: CourseSuggestionQuery): Promise<CourseSearchResult> {
  const data = await callFunction<{ courses: FoundCourse[]; sources: string[]; failed: string[] }>('suggest-courses', {
    majors: query.majors,
    gradYear: Number(query.gradYear),
    classYear: query.year,
  });

  return {
    courses: data.courses.map((c) => ({
      name: c.title && c.title !== c.code ? `${c.code} · ${c.title}` : c.code,
      status: 'taken' as const,
      code: c.code,
    })),
    sources: data.sources ?? [],
    failed: data.failed ?? [],
  };
}

/**
 * Muse matches typed course names ("orgo 1") to the school's official courses
 * (supabase/functions/format-courses). Names it can't place come back with a null code.
 */
export async function matchCourses(query: CourseMatchQuery): Promise<CourseMatchResult> {
  const data = await callFunction<{ courses: CourseMatchResult['courses']; checked?: boolean }>('format-courses', {
    names: query.names,
    majors: query.majors.filter((m) => m.name.trim()),
    gradYear: Number(query.gradYear) || undefined,
  });
  // No "checked" field: every name matched in the free first pass, so nothing needed Muse
  return { courses: data.courses ?? [], checked: data.checked ?? true };
}

/** Saves the student's majors (with tracks) and minors, replacing what was saved before. */
export async function savePrograms(academics: AcademicProfile): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = actingId(data.session?.user);
  if (!userId) throw new Error('Not signed in');

  const rows = [
    ...academics.majors.map((m, i) => ({ kind: 'major' as const, position: i + 1, name: m.name, track: m.track || null })),
    ...academics.minors.map((name, i) => ({ kind: 'minor' as const, position: i + 1, name, track: null })),
  ];

  const { error: clearError } = await supabase.from('user_programs').delete().eq('user_id', userId);
  if (clearError) throw clearError;
  if (rows.length === 0) return;

  const { error } = await supabase.from('user_programs').insert(rows);
  if (error) throw error;
}

/**
 * Saves the student's courses, replacing what was saved before (public.save_my_courses).
 * A course with a code joins the school's shared list; one without is kept privately under the
 * name the student typed.
 */
export async function saveCourses(academics: AcademicProfile): Promise<void> {
  const short = academics.courses.find((c) => c.name.trim().length < 2);
  if (short) throw new Error('Course names need at least 2 characters.');

  const courses = academics.courses.map((c) => ({
    code: c.code ?? null,
    custom_name: c.code ? null : c.name.trim().replace(/\s+/g, ' ').slice(0, 80),
    status: c.status === 'taken' ? ('completed' as const) : ('taking' as const),
    confidence: c.confidence,
    grade: (c.grade || null) as Grade | null,
  }));

  const { error } = await supabase.rpc('save_my_courses', { courses });
  if (error) {
    throw new Error(
      // private.enforce_row_limit: 15 new codes per student, 40 courses each
      error.message.startsWith('You can add at most')
        ? 'You’ve reached the course limit. Remove a course, or pick ones already in your school’s list.'
        : 'Your courses didn’t save. Check your connection and try again.',
    );
  }
}

/** Everything on the Courses page: majors and minors, then courses */
export async function saveAcademics(academics: AcademicProfile): Promise<void> {
  await savePrograms(academics);
  await saveCourses(academics);
}
