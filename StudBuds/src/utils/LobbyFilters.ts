import type { Lobby } from '../dataFiles/StudyData';
import { MAX_GROUP_SIZE, MIN_GROUP_SIZE } from '../dataFiles/StudyData';

/** Matching criteria for the lobby browser. Each one can be switched off. */
export interface LobbyFilters {
  /** Only lobbies that meet entirely during the user's free time */
  schedule: boolean;
  /** Only lobbies for one of the user's subjects */
  subjects: boolean;
  /** Only lobbies with one of the `sizes` below */
  size: boolean;
  /** Group sizes to show when `size` is on (host included) */
  sizes: number[];
  /** Hide lobbies with no open spots */
  openSpots: boolean;
  /** Hide lobbies you host, joined or asked to join (they're always in Sessions too) */
  hideMine: boolean;
}

export const ALL_SIZES = Array.from({ length: MAX_GROUP_SIZE - MIN_GROUP_SIZE + 1 }, (_, i) => MIN_GROUP_SIZE + i);

/** Matching is on by default; the user switches off what they don't care about */
export const DEFAULT_FILTERS: LobbyFilters = {
  schedule: true,
  subjects: true,
  size: true,
  sizes: ALL_SIZES,
  openSpots: false,
  hideMine: false,
};

const normalize = (text: string) => text.trim().toLowerCase();

/** Every one of the lobby's slots is a time the user marked free */
export const fitsSchedule = (lobby: Lobby, freeSet: ReadonlySet<string>) =>
  lobby.timeSlots.length > 0 && lobby.timeSlots.every((slot) => freeSet.has(slot));

/** The lobby's subject matches one of the user's (either name containing the other, any capitalization) */
export const matchesSubjects = (lobby: Lobby, subjects: string[]) => {
  const subject = normalize(lobby.subject);
  return subjects.some((s) => {
    const mine = normalize(s);
    return !!mine && (subject.includes(mine) || mine.includes(subject));
  });
};

export interface MatchContext {
  /** The user's free slots. Empty means unknown, and the schedule criterion is skipped. */
  freeSet: ReadonlySet<string>;
  /** The user's subjects. Empty means unknown, and the subject criterion is skipped. */
  subjects: string[];
}

/** Whether a lobby passes every criterion that's switched on (and has the data it needs) */
export function passesFilters(lobby: Lobby, filters: LobbyFilters, ctx: MatchContext): boolean {
  if (filters.schedule && ctx.freeSet.size > 0 && !fitsSchedule(lobby, ctx.freeSet)) return false;
  if (filters.subjects && ctx.subjects.length > 0 && !matchesSubjects(lobby, ctx.subjects)) return false;
  if (filters.size && !filters.sizes.includes(lobby.maxSize)) return false;
  if (filters.openSpots && lobby.memberIds.length >= lobby.maxSize) return false;
  return true;
}

/** How many criteria are actually narrowing the list right now (for the Filters button) */
export function activeFilterCount(filters: LobbyFilters, ctx: MatchContext): number {
  return [
    filters.schedule && ctx.freeSet.size > 0,
    filters.subjects && ctx.subjects.length > 0,
    filters.size && filters.sizes.length < ALL_SIZES.length,
    filters.openSpots,
    filters.hideMine,
  ].filter(Boolean).length;
}