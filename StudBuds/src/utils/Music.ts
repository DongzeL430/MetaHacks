/*
 * Theme music is DATA, like the rest of a theme: a short score Muse Spark writes for each new theme
 * (supabase/functions/generate-theme), saved inside the theme and played by MusicPlayer.ts as a
 * simple, calm music box in the Celtic style. No Meta model makes audio, so Muse writes the notes
 * and the browser performs them.
 *
 * Notes are scale steps in the piece's mode, not pitches: 0 is the tonic, 7 the tonic an octave
 * up, so every note stays in key. sanitizeMusic() checks a score from anywhere before it plays.
 */

/** Semitones above the tonic for each step of the four modes Irish and Scottish tunes use */
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
} as const;
export type Mode = keyof typeof MODES;

/** The melody's tonic as a MIDI note, in a music box's sweet spot (G4 to F5) */
export const TONICS = { C: 72, D: 74, E: 76, F: 77, G: 67, A: 69 } as const;
export type Tonic = keyof typeof TONICS;

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
  /** Played A, A (with a second line in thirds), B, A, then again */
  a: MusicBar[];
  b: MusicBar[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

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
  const { mode, tonic, tempo, beatsPerBar } = input;
  if (!(typeof mode === 'string' && mode in MODES) || !(typeof tonic === 'string' && tonic in TONICS)) return null;
  if (typeof tempo !== 'number' || tempo < MUSIC_LIMITS.tempoMin || tempo > MUSIC_LIMITS.tempoMax) return null;
  if (beatsPerBar !== 3 && beatsPerBar !== 4) return null;
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
    a,
    b,
  };
}

// Shorthand for writing the built-in pieces: [step, beats], with null steps as rests
const bar = (chord: number, ...notes: [number | null, number][]): MusicBar => ({
  chord,
  notes: notes.map(([step, beats]) => ({ step, beats })),
});

/*
 * The app's own two hand-written pieces. Every theme has its own music, so these never repeat
 * a theme's. The generate-theme Edge Function lists both (BUILT_IN_PIECES) so Muse writes
 * something different.
 */

/** The default theme's piece: its grassy meadow under a little mountain. Bright, climbing up the hill and back. */
export const DEFAULT_MUSIC: ThemeMusic = {
  title: 'Little Mountain Meadow',
  mode: 'ionian',
  tonic: 'G',
  tempo: 70,
  beatsPerBar: 4,
  a: [
    bar(1, [0, 1], [2, 1], [4, 2]),
    bar(4, [5, 1.5], [4, 0.5], [3, 1], [5, 1]),
    bar(1, [4, 2], [2, 1], [1, 1]),
    bar(5, [1, 3], [null, 1]),
    bar(1, [0, 1], [2, 1], [4, 1], [7, 1]),
    bar(6, [8, 1.5], [7, 0.5], [5, 2]),
    bar(5, [4, 1], [5, 1], [2, 1], [1, 1]),
    bar(1, [0, 4]),
  ],
  b: [
    bar(6, [7, 1.5], [8, 0.5], [9, 2]),
    bar(4, [8, 1], [7, 1], [5, 2]),
    bar(1, [4, 1], [5, 1], [7, 2]),
    bar(5, [8, 3], [null, 1]),
    bar(6, [9, 1], [8, 1], [7, 1], [5, 1]),
    bar(4, [7, 1.5], [5, 0.5], [4, 2]),
    bar(5, [2, 1], [4, 1], [1, 2]),
    bar(1, [0, 3], [null, 1]),
  ],
};

/** Plays for a custom theme while its own music is being written (or if Muse can't write it) */
export const FALLBACK_MUSIC: ThemeMusic = {
  title: 'Hearth and Oak',
  mode: 'dorian',
  tonic: 'D',
  tempo: 63,
  beatsPerBar: 3,
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

/*
 * One piece for each default background picture (src/assets/default*bg.png), composed once by Muse
 * Spark from a design for each picture (mood, mode, key, tempo and meter) and saved here, so the
 * default theme plays the piece that goes with this session’s picture. The generate-theme Edge
 * Function lists them too (BUILT_IN_PIECES) so a custom theme’s music sounds different.
 */

/** Stormy amber sky over a lake: wistful but warm, light breaking through */
const DEFAULT2_MUSIC: ThemeMusic = {
  title: 'Amber Light Through Storm',
  mode: 'dorian',
  tonic: 'D',
  tempo: 56,
  beatsPerBar: 3,
  a: [
    bar(1, [0, 1], [1, 1], [2, 1]),
    bar(5, [4, 2], [2, 1]),
    bar(7, [1, 1], [2, 1], [1, 1]),
    bar(1, [0, 3]),
    bar(4, [0, 1], [1, 1], [4, 1]),
    bar(5, [5, 2], [4, 1]),
    bar(7, [2, 1], [1, 1], [2, 1]),
    bar(1, [0, 3]),
  ],
  b: [
    bar(1, [4, 1], [5, 1], [7, 1]),
    bar(7, [8, 2], [7, 1]),
    bar(4, [5, 1], [7, 1], [5, 1]),
    bar(4, [4, 3]),
    bar(5, [5, 1], [7, 1], [8, 1]),
    bar(7, [7, 2], [5, 1]),
    bar(5, [4, 1], [2, 1], [1, 1]),
    bar(1, [0, 3]),
  ],
};

/** Pines under towering summer clouds: open and airy */
const DEFAULT3_MUSIC: ThemeMusic = {
  title: 'Pines Under Summer Sky',
  mode: 'mixolydian',
  tonic: 'A',
  tempo: 74,
  beatsPerBar: 4,
  a: [
    bar(1, [0, 1], [2, 1], [4, 2]),
    bar(5, [5, 2], [4, 1], [2, 1]),
    bar(4, [2, 2], [4, 1], [5, 1]),
    bar(1, [4, 3], [2, 1]),
    bar(1, [0, 1], [2, 1], [4, 1], [5, 1]),
    bar(4, [7, 2], [5, 1], [4, 1]),
    bar(5, [2, 1], [4, 2], [2, 1]),
    bar(1, [0, 4]),
  ],
  b: [
    bar(1, [4, 1], [5, 1], [7, 2]),
    bar(3, [7, 2], [5, 1], [4, 1]),
    bar(5, [8, 2], [7, 1], [5, 1]),
    bar(1, [5, 3], [4, 1]),
    bar(4, [7, 2], [8, 1], [7, 1]),
    bar(7, [5, 2], [4, 1], [2, 1]),
    bar(5, [4, 2], [2, 1], [1, 1]),
    bar(1, [2, 4]),
  ],
};

/** Birch path toward a big grey rock: an easy stroll */
const DEFAULT4_MUSIC: ThemeMusic = {
  title: 'Birch Path to Greyrock',
  mode: 'ionian',
  tonic: 'F',
  tempo: 66,
  beatsPerBar: 3,
  a: [
    bar(1, [0, 1], [1, 1], [2, 1]),
    bar(5, [4, 2], [2, 1]),
    bar(1, [2, 1.5], [1, 1], [0, 0.5]),
    bar(5, [1, 3]),
    bar(1, [2, 1], [4, 1], [5, 1]),
    bar(4, [5, 2], [4, 1]),
    bar(5, [4, 1], [2, 1], [1, 1]),
    bar(1, [0, 3]),
  ],
  b: [
    bar(1, [4, 1], [5, 1], [7, 1]),
    bar(5, [7, 2], [5, 1]),
    bar(4, [5, 1.5], [4, 1], [2, 0.5]),
    bar(1, [4, 3]),
    bar(3, [5, 1], [6, 1], [5, 1]),
    bar(4, [7, 2], [5, 1]),
    bar(5, [5, 1], [4, 1], [2, 1]),
    bar(1, [1, 3]),
  ],
};

/** Farmland with a far-off cottage: homey, like a village tune */
const DEFAULT5_MUSIC: ThemeMusic = {
  title: 'Cottage Past the Hedgerows',
  mode: 'mixolydian',
  tonic: 'D',
  tempo: 72,
  beatsPerBar: 4,
  a: [
    bar(1, [0, 2], [1, 1], [2, 1]),
    bar(1, [4, 2], [2, 2]),
    bar(5, [4, 2], [5, 2]),
    bar(5, [4, 3], [2, 1]),
    bar(5, [4, 2], [5, 1], [4, 1]),
    bar(4, [5, 2], [4, 2]),
    bar(1, [2, 2], [1, 2]),
    bar(1, [0, 4]),
  ],
  b: [
    bar(1, [5, 2], [7, 2]),
    bar(7, [8, 2], [7, 2]),
    bar(4, [7, 2], [5, 2]),
    bar(1, [4, 3], [2, 1]),
    bar(4, [5, 2], [7, 2]),
    bar(7, [8, 2], [7, 1], [5, 1]),
    bar(5, [4, 2], [2, 2]),
    bar(1, [2, 3], [1, 1]),
  ],
};

/** Dusk clouds and a crescent moon: a soft lullaby */
const DEFAULT6_MUSIC: ThemeMusic = {
  title: 'Peach Clouds, Pale Moon',
  mode: 'aeolian',
  tonic: 'E',
  tempo: 52,
  beatsPerBar: 3,
  a: [
    bar(1, [0, 1], [1, 1], [2, 1]),
    bar(7, [2, 2], [1, 1]),
    bar(3, [0, 2], [-1, 1]),
    bar(1, [0, 3]),
    bar(4, [2, 1], [3, 1], [4, 1]),
    bar(5, [4, 2], [3, 1]),
    bar(4, [2, 1], [1, 1], [0, 1]),
    bar(1, [0, 3]),
  ],
  b: [
    bar(1, [4, 1], [5, 1], [7, 1]),
    bar(4, [7, 2], [5, 1]),
    bar(5, [4, 1], [5, 1], [4, 1]),
    bar(3, [2, 3]),
    bar(4, [4, 1], [5, 1], [4, 1]),
    bar(1, [7, 2], [5, 1]),
    bar(5, [4, 2], [2, 1]),
    bar(1, [0, 3]),
  ],
};

/** Each default picture's piece, by its file name without the extension */
const DEFAULT_MUSIC_BY_BACKGROUND: Record<string, ThemeMusic> = {
  defaultbg: DEFAULT_MUSIC,
  default2bg: DEFAULT2_MUSIC,
  default3bg: DEFAULT3_MUSIC,
  default4bg: DEFAULT4_MUSIC,
  default5bg: DEFAULT5_MUSIC,
  default6bg: DEFAULT6_MUSIC,
};

/** The default theme's piece for a default background picture (see utils/DefaultBackground.ts) */
export function defaultMusicFor(background: string): ThemeMusic {
  return DEFAULT_MUSIC_BY_BACKGROUND[background] ?? DEFAULT_MUSIC;
}
