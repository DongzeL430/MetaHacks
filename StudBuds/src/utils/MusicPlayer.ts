import { useCallback, useEffect, useRef, useState } from 'react';
import { MODES, TONICS } from './Music';
import type { AccompanimentVoice, MelodyVoice, MusicBar, ThemeMusic } from './Music';

/*
 * Plays a theme's score (Music.ts) in a loop with the Web Audio API. Every sound is made here:
 *  - lute, harp and dulcimer are plucked strings (Karplus-Strong), rendered once per pitch
 *  - recorder, flute and fiddle are oscillators with a breathy attack and a slow vibrato
 *  - an optional low drone, a soft frame drum, and a small room reverb over everything
 * Notes are scheduled a few seconds ahead of time, so the loop is seamless and keeps going in a
 * background tab. Switching pieces fades one out and the next in.
 */

type Voice = MelodyVoice | AccompanimentVoice;
type Plucked = 'lute' | 'harp' | 'dulcimer';

interface NoteEvent {
  /** Beats from the start of the loop */
  beat: number;
  midi: number;
  beats: number;
  voice: Voice;
  velocity: number;
  part: 'melody' | 'harmony' | 'accompaniment' | 'drum';
}

/** How far ahead notes are scheduled, and how often the scheduler wakes up */
const LOOKAHEAD_SECONDS = 3;
const TICK_MS = 250;
const FADE_SECONDS = 1.5;
/** How long each plucked string rings, in seconds (time to fade by 60 dB) */
const RING: Record<Plucked, number> = { lute: 1.6, harp: 3, dulcimer: 2.2 };
/** Lute and harp patterns: scale steps above the chord's root, one per eighth note or beat */
const LUTE_PATTERN = { 3: [0, 4, 7, 9, 7, 4], 4: [0, 4, 7, 9, 7, 4, 7, 4] };
const HARP_CHORD = [-7, 0, 4, 7, 9];
const DULCIMER_PATTERN = [0, 4, 7, 4];

const isPlucked = (v: Voice): v is Plucked => v === 'lute' || v === 'harp' || v === 'dulcimer';
const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** The MIDI note for a scale step of the piece, `octaves` up or down from the melody's range */
function pitchOf(music: ThemeMusic, step: number, octaves = 0): number {
  const scale = MODES[music.mode];
  const octave = Math.floor(step / 7);
  const degree = ((step % 7) + 7) % 7;
  return TONICS[music.tonic] + scale[degree] + 12 * (octave + octaves);
}

/**
 * The whole loop as a list of notes: A, A again with a second voice a third below (gymel, the
 * medieval way of singing in thirds), B, then A. The accompaniment and drum follow each bar's chord.
 */
function arrange(music: ThemeMusic): { events: NoteEvent[]; beats: number } {
  const events: NoteEvent[] = [];
  const perBar = music.beatsPerBar;
  const sections: { bars: MusicBar[]; gymel: boolean }[] = [
    { bars: music.a, gymel: false },
    { bars: music.a, gymel: true },
    { bars: music.b, gymel: false },
    { bars: music.a, gymel: false },
  ];

  let start = 0;
  for (const section of sections) {
    for (const bar of section.bars) {
      let t = start;
      for (const n of bar.notes) {
        if (n.step !== null) {
          events.push({ beat: t, midi: pitchOf(music, n.step), beats: n.beats, voice: music.melody, velocity: 0.5, part: 'melody' });
          if (section.gymel) {
            events.push({ beat: t, midi: pitchOf(music, n.step - 2), beats: n.beats, voice: music.melody, velocity: 0.26, part: 'harmony' });
          }
        }
        t += n.beats;
      }

      // Chord roots on the 5th, 6th or 7th degree sit below the tonic, so the bass stays close
      const root = bar.chord - 1 >= 4 ? bar.chord - 8 : bar.chord - 1;
      const accompany = (beat: number, step: number, beats: number, velocity: number) =>
        events.push({ beat, midi: pitchOf(music, root + step, -1), beats, voice: music.accompaniment, velocity, part: 'accompaniment' });
      if (music.accompaniment === 'lute') {
        LUTE_PATTERN[perBar].forEach((step, i) => accompany(start + i * 0.5, step, 1, i === 0 ? 0.36 : 0.24));
      } else if (music.accompaniment === 'harp') {
        // A rolled chord, low to high
        HARP_CHORD.forEach((step, i) => accompany(start + i * 0.09, step, perBar, 0.26));
        if (perBar === 4) HARP_CHORD.slice(1, 4).forEach((step, i) => accompany(start + 2 + i * 0.09, step, 2, 0.17));
      } else {
        for (let beat = 0; beat < perBar; beat++) accompany(start + beat, DULCIMER_PATTERN[beat % 4], 1, beat === 0 ? 0.3 : 0.2);
      }

      if (music.drum) {
        events.push({ beat: start, midi: 0, beats: 1, voice: 'lute', velocity: 0.5, part: 'drum' });
        if (perBar === 4) events.push({ beat: start + 2, midi: 0, beats: 1, voice: 'lute', velocity: 0.28, part: 'drum' });
      }
      start += perBar;
    }
  }
  events.sort((x, y) => x.beat - y.beat);
  return { events, beats: start };
}

/** A plucked string at one pitch: rendered once, then reused */
function renderPluck(ctx: BaseAudioContext, freq: number, voice: Plucked): { buffer: AudioBuffer; rate: number } {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * (RING[voice] + 0.4));
  // The delay line's length sets the pitch; the small rounding error is fixed with playbackRate
  const size = Math.max(2, Math.floor(rate / freq - 0.5));
  const line = new Float32Array(size);
  // Softer noise for a darker pluck: the lute is warm, the dulcimer bright
  const smooth = voice === 'lute' ? 0.65 : voice === 'harp' ? 0.4 : 0.15;
  let prev = 0;
  let mean = 0;
  for (let i = 0; i < size; i++) {
    prev = prev * smooth + (Math.random() * 2 - 1) * (1 - smooth);
    line[i] = prev;
    mean += prev / size;
  }
  for (let i = 0; i < size; i++) line[i] -= mean;

  const decay = Math.pow(0.001, 1 / (RING[voice] * freq));
  const buffer = ctx.createBuffer(1, length, rate);
  const out = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0, at = 0; i < length; i++) {
    const next = (at + 1) % size;
    out[i] = line[at];
    peak = Math.max(peak, Math.abs(out[i]));
    line[at] = decay * 0.5 * (line[at] + line[next]);
    at = next;
  }
  const fade = Math.floor(rate * 0.05);
  for (let i = 0; i < length; i++) out[i] *= (0.9 / (peak || 1)) * Math.min(1, (length - i) / fade);
  return { buffer, rate: freq / (rate / (size + 0.5)) };
}

/** A room-like reverb: two channels of fading noise */
function makeReverb(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 2.6);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Where pieces play into: dry sound plus a little reverb, a gentle limiter so nothing clips, then the volume */
function buildMix(ctx: BaseAudioContext, level: number): { bus: GainNode; master: GainNode } {
  const bus = new GainNode(ctx);
  const reverb = new ConvolverNode(ctx, { buffer: makeReverb(ctx) });
  const wet = new GainNode(ctx, { gain: 0.32 });
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
  private readonly plucks = new Map<string, { buffer: AudioBuffer; rate: number }>();
  private readonly noise: AudioBuffer;
  private readonly drone: OscillatorNode[] = [];
  private next = 0;
  private loopStart: number;

  constructor(ctx: BaseAudioContext, out: AudioNode, music: ThemeMusic, noise: AudioBuffer, startAt: number) {
    this.ctx = ctx;
    this.music = music;
    this.noise = noise;
    this.beat = 60 / music.tempo;
    const { events, beats } = arrange(music);
    this.events = events;
    this.loopSeconds = beats * this.beat;
    this.loopStart = startAt;

    this.fader = ctx.createGain();
    this.fader.gain.setValueAtTime(0, startAt);
    this.fader.gain.linearRampToValueAtTime(1, startAt + FADE_SECONDS);
    this.fader.connect(out);
    const spot = (pan: number) => {
      const p = new StereoPannerNode(ctx, { pan });
      p.connect(this.fader);
      return p;
    };
    this.parts = { melody: spot(-0.15), harmony: spot(0.2), accompaniment: spot(0.25), drum: spot(0) };

    if (music.drone) this.startDrone(startAt);
  }

  /** Low tonic and fifth, slowly breathing through a soft filter */
  private startDrone(at: number) {
    const filter = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: 420, Q: 0.4 });
    const level = new GainNode(this.ctx, { gain: 0 });
    level.gain.setValueAtTime(0, at);
    level.gain.linearRampToValueAtTime(0.045, at + 4);
    // In the middle, with the drum
    filter.connect(level).connect(this.parts.drum);
    const wobble = new OscillatorNode(this.ctx, { frequency: 0.07 });
    const depth = new GainNode(this.ctx, { gain: 90 });
    wobble.connect(depth).connect(filter.frequency);
    wobble.start(at);
    this.drone.push(wobble);
    for (const step of [0, 4]) {
      const osc = new OscillatorNode(this.ctx, { type: 'sawtooth', frequency: midiToFreq(pitchOf(this.music, step, -2)) });
      osc.connect(filter);
      osc.start(at);
      this.drone.push(osc);
    }
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
    // A little looseness in timing and touch, like a person playing
    const t = at + (ev.part === 'melody' ? 0 : Math.random() * 0.012);
    const velocity = ev.velocity * (0.9 + Math.random() * 0.2);
    const out = this.parts[ev.part];
    if (ev.part === 'drum') return this.playDrum(t, velocity, out);
    const seconds = ev.beats * this.beat;
    if (isPlucked(ev.voice)) this.playPluck(ev.voice, ev.midi, t, seconds, velocity, out);
    else this.playWind(ev.voice, ev.midi, t, seconds, velocity, out);
  }

  private playPluck(voice: Plucked, midi: number, at: number, seconds: number, velocity: number, out: AudioNode) {
    const key = `${voice}:${midi}`;
    let pluck = this.plucks.get(key);
    if (!pluck) {
      pluck = renderPluck(this.ctx, midiToFreq(midi), voice);
      this.plucks.set(key, pluck);
    }
    const level = new GainNode(this.ctx, { gain: velocity * 0.55 });
    level.connect(out);
    // Harp and dulcimer ring on; the lute is damped a little after its note
    const stopAt = at + (voice === 'lute' ? Math.max(seconds, 0.6) * 1.6 : RING[voice]);
    level.gain.setValueAtTime(velocity * 0.55, Math.max(at, stopAt - 0.25));
    level.gain.linearRampToValueAtTime(0, stopAt);
    // The dulcimer has two strings per note, a hair apart in pitch
    const detunes = voice === 'dulcimer' ? [0.9984, 1.0016] : [1];
    for (const d of detunes) {
      const src = new AudioBufferSourceNode(this.ctx, { buffer: pluck.buffer, playbackRate: pluck.rate * d });
      src.connect(level);
      src.start(at);
      src.stop(stopAt + 0.05);
    }
  }

  private playWind(voice: 'recorder' | 'flute' | 'fiddle', midi: number, at: number, seconds: number, velocity: number, out: AudioNode) {
    const freq = midiToFreq(midi);
    const end = at + Math.max(0.15, seconds * 0.94);
    const fiddle = voice === 'fiddle';
    const attack = fiddle ? 0.14 : 0.06;
    const peak = velocity * (fiddle ? 0.16 : voice === 'flute' ? 0.42 : 0.3);

    const osc = new OscillatorNode(this.ctx, { type: fiddle ? 'sawtooth' : voice === 'flute' ? 'sine' : 'triangle', frequency: freq });
    const tone = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: Math.min(fiddle ? 2600 : 5000, freq * (fiddle ? 3.2 : 3)), Q: 0.5 });
    const env = new GainNode(this.ctx, { gain: 0 });
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + attack);
    env.gain.setTargetAtTime(peak * 0.8, at + attack, 0.25);
    env.gain.setTargetAtTime(0, end, 0.07);
    osc.connect(tone).connect(env).connect(out);

    // Vibrato that comes in after the note starts, like a held breath or bow
    const lfo = new OscillatorNode(this.ctx, { frequency: fiddle ? 5.6 : 4.8 });
    const depth = new GainNode(this.ctx, { gain: 0 });
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(freq * (fiddle ? 0.006 : 0.0035), at + Math.min(0.45, seconds));
    lfo.connect(depth).connect(osc.frequency);

    // A puff of breath (or bow noise) at the start of the note
    const breath = new AudioBufferSourceNode(this.ctx, { buffer: this.noise });
    const band = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency: Math.min(8000, freq * 2), Q: 1.2 });
    const puff = new GainNode(this.ctx, { gain: 0 });
    puff.gain.setValueAtTime(peak * (voice === 'flute' ? 0.5 : 0.3), at);
    puff.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    breath.connect(band).connect(puff).connect(out);

    for (const node of [osc, lfo]) {
      node.start(at);
      node.stop(end + 0.5);
    }
    breath.start(at, Math.random() * 0.5);
    breath.stop(at + 0.15);
  }

  /** A soft frame drum: a low thump and a brush of noise */
  private playDrum(at: number, velocity: number, out: AudioNode) {
    const osc = new OscillatorNode(this.ctx, { frequency: 130 });
    osc.frequency.setValueAtTime(130, at);
    osc.frequency.exponentialRampToValueAtTime(55, at + 0.2);
    const thump = new GainNode(this.ctx, { gain: 0 });
    thump.gain.setValueAtTime(velocity * 0.35, at);
    thump.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    osc.connect(thump).connect(out);
    osc.start(at);
    osc.stop(at + 0.5);

    const hiss = new AudioBufferSourceNode(this.ctx, { buffer: this.noise });
    const soft = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: 900 });
    const brush = new GainNode(this.ctx, { gain: 0 });
    brush.gain.setValueAtTime(velocity * 0.08, at);
    brush.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    hiss.connect(soft).connect(brush).connect(out);
    hiss.start(at, Math.random() * 0.5);
    hiss.stop(at + 0.15);
  }

  /** Fades out, then lets go of its sounds */
  stop(at: number) {
    this.fader.gain.cancelScheduledValues(at);
    this.fader.gain.setValueAtTime(this.fader.gain.value, at);
    this.fader.gain.linearRampToValueAtTime(0, at + FADE_SECONDS);
    for (const osc of this.drone) osc.stop(at + FADE_SECONDS + 0.1);
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
  private noise: AudioBuffer | null = null;
  private current: Performance | null = null;
  private timer: number | null = null;
  private volume: number;
  private muted: boolean;

  constructor(settings: { volume: number; muted: boolean }) {
    this.volume = settings.volume;
    this.muted = settings.muted;
  }

  private setUp(): { ctx: AudioContext; bus: GainNode; noise: AudioBuffer } {
    if (this.ctx && this.bus && this.noise) return { ctx: this.ctx, bus: this.bus, noise: this.noise };
    const ctx = new AudioContext();
    const { bus, master } = buildMix(ctx, this.level());
    const noise = makeNoise(ctx);
    this.ctx = ctx;
    this.bus = bus;
    this.master = master;
    this.noise = noise;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    return { ctx, bus, noise };
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
    const { ctx, bus, noise } = this.setUp();
    const at = ctx.currentTime + 0.05;
    this.current?.stop(at);
    this.current = new Performance(ctx, bus, music, noise, at);
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
    this.noise = null;
    this.current = null;
  }
}

/** Renders the first `seconds` of a piece without playing it, at full volume, e.g. to check how it sounds */
export function renderMusic(music: ThemeMusic, seconds: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * 44100), 44100);
  const { bus } = buildMix(ctx, 1);
  new Performance(ctx, bus, music, makeNoise(ctx), 0).schedule(seconds);
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
