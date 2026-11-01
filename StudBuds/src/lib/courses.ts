import { callFunction } from './edgeFunctions.ts';
import { supabase } from './supabase.ts';
import type { AcademicProfile, CourseSearchResult, CourseStatus, CourseSuggestionQuery } from '../components/CoursesSection';

interface FoundCourse {
  code: string;
  title: string;
  status: CourseStatus;
  term: string | null;
}

/**
 * "Find courses": Muse Spark searches the student's school catalog for each major and minor
 * (supabase/functions/suggest-courses). Courses come back named like "CS 2500 · Fundamentals of CS 1".
 */
export async function findCourses(query: CourseSuggestionQuery): Promise<CourseSearchResult> {
  const data = await callFunction<{ courses: FoundCourse[]; sources: string[]; failed: string[] }>('suggest-courses', {
    majors: query.majors,
    minors: query.minors,
    gradYear: Number(query.gradYear),
    classYear: query.year,
  });

  return {
    courses: data.courses.map((c) => ({
      name: c.title && c.title !== c.code ? `${c.code} · ${c.title}` : c.code,
      status: c.status,
    })),
    sources: data.sources ?? [],
    failed: data.failed ?? [],
  };
}

/** Saves the student's majors (with tracks) and minors, replacing what was saved before. */
export async function savePrograms(academics: AcademicProfile): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
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
