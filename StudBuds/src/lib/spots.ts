import { useEffect, useState } from 'react';
import { callFunction } from './edgeFunctions.ts';

interface StudySpot {
  name: string;
  area: string | null;
  kind: string;
  noise: string;
  source: string;
}

/** Always offered too: a session doesn't have to meet in person */
const ONLINE = 'Online (video call)';

/** "Snell Library · Floor 2", within the 80 characters a lobby location can hold */
const label = (s: StudySpot) => (s.area ? `${s.name} · ${s.area}` : s.name).slice(0, 80);

// Sign-up and the survey both start the lookup, a moment apart. While one request is on its way,
// the other shares it: a second request before the school's list is saved would pay Muse twice.
let pending: Promise<StudySpot[]> | null = null;

/**
 * The student's school's study spots (supabase/functions/study-spots): found by Muse on the
 * school's own website once per school, then shared, and ordered for this student.
 */
export function fetchStudySpots(): Promise<StudySpot[]> {
  pending ??= callFunction<{ spots: StudySpot[] }>('study-spots', {})
    .then((r) => r.spots ?? [])
    .finally(() => {
      // Later calls ask again, so the list comes back ordered by the student's newest answers
      pending = null;
    });
  return pending;
}

/** Starts the school's lookup when the account is created, so the list is ready by the time they host */
export function prefetchStudySpots(): void {
  fetchStudySpots().catch((err) => console.warn('study spots not looked up yet', err));
}

/** Places to offer on the host form: the school's study spots, then "Online (video call)" */
export function useStudySpots(): string[] {
  const [places, setPlaces] = useState<string[]>([ONLINE]);
  useEffect(() => {
    let cancelled = false;
    fetchStudySpots()
      .then((spots) => {
        if (!cancelled) setPlaces([...new Set([...spots.map(label), ONLINE])]);
      })
      // Hosts can still type any place
      .catch((err) => console.warn('study spots unavailable', err));
    return () => {
      cancelled = true;
    };
  }, []);
  return places;
}
