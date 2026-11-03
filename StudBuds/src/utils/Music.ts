/*
 * Theme music is DATA, like the rest of a theme: a short score Muse Spark writes for each new theme
 * (supabase/functions/generate-theme), saved inside the theme and played by MusicPlayer.ts.
 * No Meta model makes audio, so Muse writes the notes and the browser performs them.
 *
 * Notes are scale steps in the piece's mode, not pitches: 0 is the tonic, 7 the tonic an octave
 * up, so every note stays in key. sanitizeMusic() checks a score from anywhere before it plays.
 */

/** Semitones above the tonic for each step of the old church modes */
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
} as const;
export type Mode = keyof typeof MODES;

/** The melody's tonic as a MIDI note, kept between middle C and the A above */
export const TONICS = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, Bb: 70 } as const;
export type Tonic = keyof typeof TONICS;

export const MELODY_VOICES = ['recorder', 'flute', 'fiddle', 'harp', 'dulcimer'] as const;
export const ACCOMPANIMENT_VOICES = ['lute', 'harp', 'dulcimer'] as const;
export type MelodyVoice = (typeof MELODY_VOICES)[number];
export type AccompanimentVoice = (typeof ACCOMPANIMENT_VOICES)[number];

/** Limits, the same as the generate-theme Edge Function's */
export const MUSIC_LIMITS = {
  tempoMin: 50,
  tempoMax: 84,
  stepMin: -3,
  stepMax: 11,
  barsMin: 4,
  barsMax: 8,
  notesPerBar: 8,
  titleMax: 40,
} as const;

export interface MusicNote {
  /** Scale step above the tonic, or null for a rest */
  step: number | null;
  /** Length in beats: 0.5 to 4, in halves */
  beats: number;
}

export interface MusicBar {
  /** The scale degree (1 to 7) the accompaniment's chord is built on */
  chord: number;
  /** Their beats add up to the bar's beatsPerBar exactly */
  notes: MusicNote[];
}

export interface ThemeMusic {
  title: string;
  mode: Mode;
  tonic: Tonic;
  /** Beats per minute */
  tempo: number;
  beatsPerBar: 3 | 4;
  melody: MelodyVoice;
  accompaniment: AccompanimentVoice;
  /** A low, steady tonic and fifth under everything */
  drone: boolean;
  /** A soft frame drum on the first beat */
  drum: boolean;
  /** Played A, A (with a second voice), B, A, then again */
  a: MusicBar[];
  b: MusicBar[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && list.includes(v as T);

function checkBars(input: unknown, beatsPerBar: number): MusicBar[] | null {
  if (!Array.isArray(input) || input.length < MUSIC_LIMITS.barsMin || input.length > MUSIC_LIMITS.barsMax) return null;
  const bars: MusicBar[] = [];
  for (const bar of input) {
    if (!isObject(bar) || !Number.isInteger(bar.chord) || (bar.chord as number) < 1 || (bar.chord as number) > 7) return null;
    if (!Array.isArray(bar.notes) || bar.notes.length < 1 || bar.notes.length > MUSIC_LIMITS.notesPerBar) return null;
    const notes: MusicNote[] = [];
    let total = 0;
    for (const n of bar.notes) {
      if (!isObject(n) || typeof n.beats !== 'number' || n.beats < 0.5 || n.beats > 4 || (n.beats * 2) % 1 !== 0) return null;
      const step = n.step;
      if (step !== null && (!Number.isInteger(step) || (step as number) < MUSIC_LIMITS.stepMin || (step as number) > MUSIC_LIMITS.stepMax)) {
        return null;
      }
      notes.push({ step: step as number | null, beats: n.beats });
      total += n.beats;
    }
    if (total !== beatsPerBar) return null;
    bars.push({ chord: bar.chord as number, notes });
  }
  return bars;
}

/** A safe copy of a score, or null if anything about it is off (the default piece plays instead) */
export function sanitizeMusic(input: unknown): ThemeMusic | null {
  if (!isObject(input)) return null;
  const { mode, tonic, tempo, beatsPerBar, melody, accompaniment } = input;
  if (!(typeof mode === 'string' && mode in MODES) || !(typeof tonic === 'string' && tonic in TONICS)) return null;
  if (typeof tempo !== 'number' || tempo < MUSIC_LIMITS.tempoMin || tempo > MUSIC_LIMITS.tempoMax) return null;
  if (beatsPerBar !== 3 && beatsPerBar !== 4) return null;
  if (!oneOf(MELODY_VOICES, melody) || !oneOf(ACCOMPANIMENT_VOICES, accompaniment)) return null;
  const a = checkBars(input.a, beatsPerBar);
  const b = checkBars(input.b, beatsPerBar);
  if (!a || !b) return null;
  const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, MUSIC_LIMITS.titleMax) : 'Theme music';
  return {
    title,
    mode: mode as Mode,
    tonic: tonic as Tonic,
    tempo: Math.round(tempo),
    beatsPerBar,
    melody,
    accompaniment,
    drone: input.drone === true,
    drum: input.drum === true,
    a,
    b,
  };
}

// Shorthand for writing the default piece: [step, beats], with null steps as rests
const bar = (chord: number, ...notes: [number | null, number][]): MusicBar => ({
  chord,
  notes: notes.map(([step, beats]) => ({ step, beats })),
});

/** The default theme's piece, and what any theme without its own music plays. Written by hand. */
export const DEFAULT_MUSIC: ThemeMusic = {
  title: 'Hearth and Oak',
  mode: 'dorian',
  tonic: 'D',
  tempo: 63,
  beatsPerBar: 3,
  melody: 'recorder',
  accompaniment: 'lute',
  drone: true,
  drum: false,
  a: [
    bar(1, [0, 1], [2, 1], [4, 1]),
    bar(7, [6, 1.5], [5, 0.5], [4, 1]),
    bar(4, [3, 1], [5, 1], [4, 1]),
    bar(1, [4, 2], [3, 1]),
    bar(3, [2, 1], [4, 1], [7, 1]),
    bar(7, [6, 1], [4, 1], [3, 1]),
    bar(5, [4, 1.5], [2, 0.5], [1, 1]),
    bar(1, [0, 3]),
  ],
  b: [
    bar(3, [9, 1], [8, 1], [7, 1]),
    bar(7, [6, 2], [4, 1]),
    bar(4, [5, 1], [7, 1], [8, 1]),
    bar(5, [8, 1.5], [7, 0.5], [6, 1]),
    bar(3, [7, 1], [6, 1], [4, 1]),
    bar(4, [5, 1.5], [4, 0.5], [3, 1]),
    bar(5, [4, 1.5], [3, 0.5], [1, 1]),
    bar(1, [0, 2], [null, 1]),
  ],
};
