/*
 * Data for study lobbies and connections.
 * The SAMPLE_ values are made-up data for building the UI. Replace them with real data from your backend.
 */

/** Group size limits, counting the host */
export const MIN_GROUP_SIZE = 2;
export const MAX_GROUP_SIZE = 5;

/** The signed-in user's id inside lobby member and request lists */
export const ME = 'me';

export interface Person {
  id: string;
  name: string;
  /** Image URL. Leave out to show colored initials instead. */
  avatar?: string;
  /** Subjects they're looking for help with */
  seekingHelpWith: string[];
  /** Weekly slots ("mon|09:30") when they and the current user are both free */
  sharedSlots: string[];
  /** Courses they've taken */
  coursesTaken: string[];
}

export interface Lobby {
  id: string;
  hostId: string;
  /** What the session is for, e.g. "Organic Chemistry" */
  subject: string;
  /** Total spots, host included: MIN_GROUP_SIZE to MAX_GROUP_SIZE */
  maxSize: number;
  /** Everyone in the lobby, host first */
  memberIds: string[];
  /** People waiting for the host to accept them */
  requestIds: string[];
  /** When the session meets: one block of weekly slots ("wed|14:00", "wed|14:30", …) on one day */
  timeSlots: string[];
}

/** Friend-request style: 'sent' = you asked them, 'received' = they asked you */
export type ConnectionStatus = 'none' | 'sent' | 'received' | 'connected';

/** Suggestions offered while typing a subject when hosting */
export const SUBJECT_SUGGESTIONS = [
  'Calculus I',
  'Calculus II',
  'Linear Algebra',
  'Statistics',
  'Organic Chemistry',
  'General Chemistry',
  'Physics I',
  'Data Structures',
  'Discrete Math',
  'Microeconomics',
  'Econometrics',
];

/** Every 30-minute slot from `from` up to (not including) `to`, e.g. slotsBetween('mon', '09:00', '10:30') */
function slotsBetween(day: string, from: string, to: string): string[] {
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const out: string[] = [];
  for (let m = toMins(from); m < toMins(to); m += 30) {
    out.push(`${day}|${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

export const SAMPLE_PEOPLE: Person[] = [
  {
    id: 'maya-ortiz',
    name: 'Maya Ortiz',
    seekingHelpWith: ['Organic Chemistry', 'Statistics'],
    sharedSlots: [...slotsBetween('mon', '09:00', '10:30'), ...slotsBetween('wed', '14:00', '16:00')],
    coursesTaken: ['General Chemistry I', 'General Chemistry II', 'Calculus I', 'Cell Biology'],
  },
  {
    id: 'devin-park',
    name: 'Devin Park',
    seekingHelpWith: ['Discrete Math', 'Linear Algebra', 'Data Structures'],
    sharedSlots: [...slotsBetween('tue', '11:00', '12:00'), ...slotsBetween('thu', '11:00', '12:30')],
    coursesTaken: ['Intro to Programming', 'Calculus I', 'Calculus II'],
  },
  {
    id: 'priya-shah',
    name: 'Priya Shah',
    seekingHelpWith: ['Econometrics'],
    sharedSlots: [...slotsBetween('fri', '13:00', '15:00')],
    coursesTaken: ['Microeconomics', 'Macroeconomics', 'Statistics', 'Linear Algebra'],
  },
  {
    id: 'sam-oconnor',
    name: 'Sam O’Connor',
    seekingHelpWith: ['Physics I', 'Calculus II'],
    sharedSlots: [],
    coursesTaken: ['Calculus I', 'Intro to Engineering'],
  },
];

export const SAMPLE_LOBBIES: Lobby[] = [
  {
    id: 'lobby-orgo',
    hostId: 'maya-ortiz',
    subject: 'Organic Chemistry',
    maxSize: 4,
    memberIds: ['maya-ortiz', 'priya-shah'],
    requestIds: [],
    timeSlots: slotsBetween('wed', '14:00', '16:00'),
  },
  {
    id: 'lobby-linalg',
    hostId: 'devin-park',
    subject: 'Linear Algebra',
    maxSize: 3,
    memberIds: ['devin-park', 'priya-shah', 'sam-oconnor'],
    requestIds: [],
    timeSlots: slotsBetween('thu', '11:00', '12:30'),
  },
  {
    id: 'lobby-stats',
    hostId: 'priya-shah',
    subject: 'Statistics',
    maxSize: 5,
    memberIds: ['priya-shah'],
    requestIds: [],
    timeSlots: slotsBetween('fri', '13:00', '14:00'),
  },
  // One you host, with someone waiting, so the host view has something to show
  {
    id: 'lobby-mine',
    hostId: ME,
    subject: 'Calculus II',
    maxSize: 3,
    memberIds: [ME],
    requestIds: ['sam-oconnor'],
    timeSlots: slotsBetween('mon', '09:00', '10:30'),
  },
];

/** Sample of the signed-in user's free times (what the pre-survey calendar saves) */
export const SAMPLE_MY_AVAILABILITY: string[] = [
  ...slotsBetween('mon', '09:00', '12:00'),
  ...slotsBetween('tue', '13:00', '17:00'),
  ...slotsBetween('wed', '10:00', '15:00'),
  ...slotsBetween('thu', '09:00', '11:00'),
  ...slotsBetween('fri', '12:00', '16:00'),
];

/** Sample of the signed-in user's subjects, for the lobby browser's "My subjects" filter */
export const SAMPLE_MY_SUBJECTS: string[] = ['Statistics', 'Organic Chemistry', 'Calculus II'];

export const SAMPLE_CONNECTIONS: Record<string, ConnectionStatus> = {
  'maya-ortiz': 'connected',
  'devin-park': 'received',
};