import { useCallback, useEffect, useRef, useState } from 'react';
import { MODES, TONICS } from './Music';
import type { MusicBar, ThemeMusic } from './Music';

/*
 * Plays a theme's score (Music.ts) in a loop as a simple music box, with the Web Audio API.
 * Each note is a struck metal tine: a pure tone with a little shimmer and a soft click, fading
 * slowly, made once per pitch and reused. A small room reverb sits over everything.
 * Notes are scheduled a few seconds ahead of time, so the loop is seamless and keeps going in a
 * background tab. Switching pieces fades one out and the next in.
 */

interface NoteEvent {
  /** Beats from the start of the loop */
  beat: number;
  midi: number;
  velocity: number;
  part: 'melody' | 'harmony' | 'accompaniment';
}

/** How far ahead notes are scheduled, and how often the scheduler wakes up */
const LOOKAHEAD_SECONDS = 3;
const TICK_MS = 250;
const FADE_SECONDS = 1.5;
/** The tine's overtones: [frequency ratio, loudness, how fast it fades relative to the tone] */
const PARTIALS: [number, number, number][] = [
  [1, 1, 1],
  [2, 0.18, 0.5],
  // A cantilevered tine's first overtone sits at about 6.27 times the tone: the metallic shimmer
  [6.27, 0.07, 0.12],
];
/** Broken chords under each bar, as scale steps above the chord's root, one per beat */
const ACCOMPANIMENT = { 3: [0, 4, 9], 4: [0, 4, 7, 4] };
/** Notes above this get too shrill for a second line or an octave */
const HIGHEST = 96;

const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** The MIDI note for a scale step of the piece, `octaves` up or down from the melody's range */
function pitchOf(music: ThemeMusic, step: number, octaves = 0): number {
  const scale = MODES[music.mode];
  const octave = Math.floor(step / 7);
  const degree = ((step % 7) + 7) % 7;
  return TONICS[music.tonic] + scale[degree] + 12 * (octave + octaves);
}

/**
 * The whole loop as a list of notes: A, A again with a second line a third below, B, then A.
 * Under every bar, a soft broken chord on its chord: a low root, then the chord's upper notes.
 */
function arrange(music: ThemeMusic): { events: NoteEvent[]; beats: number } {
  const events: NoteEvent[] = [];
  const perBar = music.beatsPerBar;
  const sections: { bars: MusicBar[]; thirds: boolean }[] = [
    { bars: music.a, thirds: false },
    { bars: music.a, thirds: true },
    { bars: music.b, thirds: false },
    { bars: music.a, thirds: false },
  ];

  let start = 0;
  for (const section of sections) {
    for (const bar of section.bars) {
      let t = start;
      for (const n of bar.notes) {
        if (n.step !== null) {
          events.push({ beat: t, midi: pitchOf(music, n.step), velocity: 0.6, part: 'melody' });
          if (section.thirds) events.push({ beat: t, midi: pitchOf(music, n.step - 2), velocity: 0.3, part: 'harmony' });
        }
        t += n.beats;
      }
      // Chord roots on the 5th, 6th or 7th degree sit below the tonic, so the bass stays close
      const root = bar.chord - 1 >= 4 ? bar.chord - 8 : bar.chord - 1;
      ACCOMPANIMENT[perBar].forEach((step, beat) => {
        const midi = pitchOf(music, root + step, -1);
        events.push({ beat: start + beat, midi: midi > HIGHEST ? midi - 12 : midi, velocity: beat === 0 ? 0.34 : 0.22, part: 'accompaniment' });
      });
      start += perBar;
    }
  }
  events.sort((x, y) => x.beat - y.beat);
  return { events, beats: start };
}

/** One music box tine at one pitch. Low notes ring longer, as on a real comb. */
function renderTine(ctx: BaseAudioContext, freq: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const ring = Math.min(4.5, Math.max(1.2, 3.6 * (300 / freq) ** 0.45));
  const length = Math.floor(rate * (ring + 0.2));
  const buffer = ctx.createBuffer(1, length, rate);
  const out = buffer.getChannelData(0);
  const attack = Math.floor(rate * 0.002);
  for (const [ratio, loudness, fade] of PARTIALS) {
    const f = freq * ratio;
    if (f > rate / 2.2) continue;
    // Fades by 60 dB over this partial's ring time. The sine comes from a two-term recurrence
    // and the fade from a running product, so rendering a note takes a few milliseconds.
    const keep = Math.exp(-Math.log(1000) / (ring * fade * rate));
    const turn = (2 * Math.PI * f) / rate;
    const twoCos = 2 * Math.cos(turn);
    let s1 = 0;
    let s2 = -Math.sin(turn);
    let level = loudness;
    for (let i = 0; i < length; i++) {
      const s = twoCos * s1 - s2;
      s2 = s1;
      s1 = s;
      out[i] += level * s2 * Math.min(1, i / attack);
      level *= keep;
    }
  }
  // The pin's click as it lets go of the tine
  for (let i = 0; i < rate * 0.004; i++) out[i] += (Math.random() * 2 - 1) * 0.04 * (1 - i / (rate * 0.004));
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const fadeOut = Math.floor(rate * 0.05);
  for (let i = 0; i < length; i++) out[i] *= (0.9 / (peak || 1)) * Math.min(1, (length - i) / fadeOut);
  return buffer;
}

/** A room-like reverb: two channels of fading noise */
function makeReverb(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 2.8);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

/** Where pieces play into: dry sound plus a little reverb, a gentle limiter so nothing clips, then the volume */
function buildMix(ctx: BaseAudioContext, level: number): { bus: GainNode; master: GainNode } {
  const bus = new GainNode(ctx);
  const reverb = new ConvolverNode(ctx, { buffer: makeReverb(ctx) });
  const wet = new GainNode(ctx, { gain: 0.36 });
  const dry = new GainNode(ctx, { gain: 0.85 });
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -14, ratio: 4, attack: 0.01, release: 0.3 });
  const master = new GainNode(ctx, { gain: level });
  bus.connect(dry).connect(limiter);
  bus.connect(reverb).connect(wet).connect(limiter);
  limiter.connect(master).connect(ctx.destination);
  return { bus, master };
}

/** One piece playing: its own fader, stereo spots for each part, and the scheduler's place in the loop */
class Performance {
  readonly music: ThemeMusic;
  private readonly ctx: BaseAudioContext;
  private readonly fader: GainNode;
  private readonly parts: Record<NoteEvent['part'], AudioNode>;
  private readonly events: NoteEvent[];
  private readonly loopSeconds: number;
  private readonly beat: number;
  private readonly tines = new Map<number, AudioBuffer>();
  private next = 0;
  private loopStart: number;

  constructor(ctx: BaseAudioContext, out: AudioNode, music: ThemeMusic, startAt: number) {
    this.ctx = ctx;
    this.music = music;
    this.beat = 60 / music.tempo;
    const { events, beats } = arrange(music);
    this.events = events;
    this.loopSeconds = beats * this.beat;
    this.loopStart = startAt;

    this.fader = new GainNode(ctx, { gain: 0 });
    this.fader.gain.setValueAtTime(0, startAt);
    this.fader.gain.linearRampToValueAtTime(1, startAt + FADE_SECONDS);
    this.fader.connect(out);
    const spot = (pan: number) => {
      const p = new StereoPannerNode(ctx, { pan });
      p.connect(this.fader);
      return p;
    };
    this.parts = { melody: spot(-0.1), harmony: spot(0.2), accompaniment: spot(0.15) };
  }

  /** Schedules every note that starts before `until`; notes the clock already passed are skipped */
  schedule(until: number) {
    const now = this.ctx.currentTime;
    for (;;) {
      const ev = this.events[this.next];
      const at = this.loopStart + ev.beat * this.beat;
      if (at > until) return;
      if (at >= now - 0.02) this.play(ev, Math.max(at, now));
      this.next++;
      if (this.next === this.events.length) {
        this.next = 0;
        this.loopStart += this.loopSeconds;
      }
    }
  }

  private play(ev: NoteEvent, at: number) {
    let buffer = this.tines.get(ev.midi);
    if (!buffer) {
      buffer = renderTine(this.ctx, midiToFreq(ev.midi));
      this.tines.set(ev.midi, buffer);
    }
    // A little unevenness in timing and touch, like a real comb and cylinder
    const t = at + (ev.part === 'melody' ? 0 : Math.random() * 0.01);
    const level = new GainNode(this.ctx, { gain: ev.velocity * (0.9 + Math.random() * 0.2) * 0.5 });
    const src = new AudioBufferSourceNode(this.ctx, { buffer });
    src.connect(level).connect(this.parts[ev.part]);
    src.start(t);
  }

  /** Fades out, then lets go of its sounds */
  stop(at: number) {
    this.fader.gain.cancelScheduledValues(at);
    this.fader.gain.setValueAtTime(this.fader.gain.value, at);
    this.fader.gain.linearRampToValueAtTime(0, at + FADE_SECONDS);
    window.setTimeout(() => this.fader.disconnect(), (FADE_SECONDS + LOOKAHEAD_SECONDS + 1) * 1000);
  }
}

/**
 * The page's music: one audio context, a volume, and the piece playing now.
 * Browsers keep a page silent until the visitor clicks or presses a key, so call unlock() then.
 */
export class MusicPlayer {
  private ctx: AudioContext | null = null;
  /** Where every piece plays into: then reverb, limiter and volume */
  private bus: GainNode | null = null;
  private master: GainNode | null = null;
  private current: Performance | null = null;
  private timer: number | null = null;
  private volume: number;
  private muted: boolean;

  constructor(settings: { volume: number; muted: boolean }) {
    this.volume = settings.volume;
    this.muted = settings.muted;
  }

  private setUp(): { ctx: AudioContext; bus: GainNode } {
    if (this.ctx && this.bus) return { ctx: this.ctx, bus: this.bus };
    const ctx = new AudioContext();
    const { bus, master } = buildMix(ctx, this.level());
    this.ctx = ctx;
    this.bus = bus;
    this.master = master;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    return { ctx, bus };
  }

  /** Volume 0 to 1, heard on a curve so the slider feels even */
  private level() {
    return this.muted ? 0 : this.volume ** 2;
  }

  private tick() {
    if (this.ctx?.state === 'running') this.current?.schedule(this.ctx.currentTime + LOOKAHEAD_SECONDS);
  }

  /** Plays a piece in a loop, fading over from whatever was playing */
  play(music: ThemeMusic) {
    if (this.current?.music === music) return;
    const { ctx, bus } = this.setUp();
    const at = ctx.currentTime + 0.05;
    this.current?.stop(at);
    this.current = new Performance(ctx, bus, music, at);
    this.tick();
  }

  /** Starts the sound after the visitor's first click or key press (browsers require one) */
  unlock() {
    if (this.ctx && this.ctx.state === 'suspended' && !this.muted) void this.ctx.resume();
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyLevel();
  }

  /** Muting also pauses the clock, so nothing plays (or uses the battery) until unmuted */
  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyLevel();
    if (!this.ctx) return;
    if (muted) window.setTimeout(() => this.muted && this.ctx?.state === 'running' && void this.ctx.suspend(), 200);
    else if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private applyLevel() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.05);
  }

  close() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
    this.bus = null;
    this.master = null;
    this.current = null;
  }
}

/** Renders the first `seconds` of a piece without playing it, at full volume, e.g. to check how it sounds */
export function renderMusic(music: ThemeMusic, seconds: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * 44100), 44100);
  const { bus } = buildMix(ctx, 1);
  new Performance(ctx, bus, music, 0).schedule(seconds);
  return ctx.startRendering();
}

/* ---------- The hook Home uses ---------- */

const SETTINGS_KEY = 'studbuds:music';
const DEFAULT_SETTINGS = { volume: 0.5, muted: false };

/** Volume and mute are remembered on this device only */
function readSettings(): { volume: number; muted: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (typeof saved?.volume === 'number' && typeof saved?.muted === 'boolean') {
      return { volume: Math.min(1, Math.max(0, saved.volume)), muted: saved.muted };
    }
  } catch {
    // Storage can be blocked (private windows); the defaults are fine
  }
  return DEFAULT_SETTINGS;
}

/**
 * Plays `music` in a loop while the page is open, starting at the visitor's first click or key
 * press. Changing `music` fades over to the new piece.
 */
export function useThemeMusic(music: ThemeMusic) {
  const [settings, setSettings] = useState(readSettings);
  const playerRef = useRef<MusicPlayer | null>(null);

  // One player while the page is open
  useEffect(() => {
    const player = new MusicPlayer(readSettings());
    playerRef.current = player;
    const unlock = () => player.unlock();
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      player.close();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    playerRef.current?.setVolume(settings.volume);
    playerRef.current?.setMuted(settings.muted);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Not remembered this time
    }
  }, [settings]);

  useEffect(() => {
    playerRef.current?.play(music);
  }, [music]);

  /** Moving the slider also unmutes */
  const setVolume = useCallback((volume: number) => setSettings({ volume, muted: false }), []);
  const toggleMute = useCallback(() => setSettings((s) => ({ ...s, muted: !s.muted })), []);

  return { title: music.title, volume: settings.volume, muted: settings.muted, setVolume, toggleMute };
}
