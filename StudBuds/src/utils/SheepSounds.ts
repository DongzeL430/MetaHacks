import { useEffect, useRef } from 'react';

/*
 * Soft sheep bleats for the croft, made live with the Web Audio API (no sound files, like the
 * theme music). A bleat is a buzzy voice shaped into a "mehh": it opens from a closed "m", wobbles
 * like a sheep's voice does, and falls a little at the end, all filtered soft so it never sounds
 * harsh. They're quiet and spaced out: one every 7 to 10 seconds, now and then answered by another
 * sheep, well under the music and on the same volume and mute.
 */

/** How loud the bleats are next to the music, at the same volume setting */
export const SHEEP_LEVEL = 0.16;
/** Seconds between bleats */
const GAP_MIN = 7;
const GAP_MAX = 10;
/** Chance that another sheep answers, a moment later */
const ANSWER_CHANCE = 0.15;

export interface Bleat {
  /** Voice pitch in Hz */
  pitch: number;
  /** Seconds */
  length: number;
  /** -1 left to 1 right */
  pan: number;
  /** How fast the voice wobbles, in Hz */
  wobble: number;
}

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** A different sheep each time: grown-up voices mostly, a lamb now and then */
export function randomBleat(): Bleat {
  const lamb = Math.random() < 0.2;
  return {
    pitch: lamb ? between(420, 520) : between(230, 340),
    length: lamb ? between(0.5, 0.7) : between(0.7, 1.05),
    pan: between(-0.6, 0.6),
    wobble: between(6.5, 8.5),
  };
}

/** Plays one bleat into `out`, starting at `at` (the context's clock) */
export function playBleat(ctx: BaseAudioContext, out: AudioNode, at: number, b: Bleat) {
  const end = at + b.length;

  // The voice: a buzzy wave whose pitch rises into the bleat, wobbles, and falls at the end
  const voice = ctx.createOscillator();
  voice.type = 'sawtooth';
  voice.frequency.setValueAtTime(b.pitch * 0.88, at);
  voice.frequency.linearRampToValueAtTime(b.pitch, at + 0.08);
  voice.frequency.setValueAtTime(b.pitch, end - 0.25);
  voice.frequency.linearRampToValueAtTime(b.pitch * 0.84, end);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = b.wobble;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.value = b.pitch * 0.03;
  vibrato.connect(vibratoDepth).connect(voice.frequency);

  // The "m" opening into "eh": a low-pass that opens up, then two vowel bands
  const mouth = ctx.createBiquadFilter();
  mouth.type = 'lowpass';
  mouth.Q.value = 0.7;
  mouth.frequency.setValueAtTime(450, at);
  mouth.frequency.exponentialRampToValueAtTime(2400, at + 0.12);
  mouth.frequency.setValueAtTime(2400, end - 0.2);
  mouth.frequency.exponentialRampToValueAtTime(900, end);
  const low = ctx.createBiquadFilter();
  low.type = 'bandpass';
  low.frequency.value = 700;
  low.Q.value = 3;
  const high = ctx.createBiquadFilter();
  high.type = 'bandpass';
  high.frequency.value = 1650;
  high.Q.value = 5;
  const highLevel = ctx.createGain();
  highLevel.gain.value = 0.45;
  // Takes the edge off whatever is left
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 3200;

  // The shape: a quick start, a held middle, a gentle fade, and the sheep's "eh-eh-eh" wobble
  const shape = ctx.createGain();
  shape.gain.setValueAtTime(0, at);
  shape.gain.linearRampToValueAtTime(1, at + 0.06);
  shape.gain.setValueAtTime(1, end - 0.3);
  shape.gain.linearRampToValueAtTime(0.65, end - 0.18);
  shape.gain.linearRampToValueAtTime(0, end);
  const tremolo = ctx.createGain();
  tremolo.gain.value = 0.65;
  const tremoloLfo = ctx.createOscillator();
  tremoloLfo.frequency.value = b.wobble;
  const tremoloDepth = ctx.createGain();
  tremoloDepth.gain.value = 0.35;
  tremoloLfo.connect(tremoloDepth).connect(tremolo.gain);

  const pan = ctx.createStereoPanner();
  pan.pan.value = b.pan;

  voice.connect(mouth);
  mouth.connect(low).connect(shape);
  mouth.connect(high).connect(highLevel).connect(shape);
  shape.connect(tremolo).connect(soft).connect(pan).connect(out);

  for (const o of [voice, vibrato, tremoloLfo]) {
    o.start(at);
    o.stop(end + 0.05);
  }
  // Let go of the nodes once it's over
  voice.onended = () => pan.disconnect();
}

/** Renders a few bleats without playing them, at full volume, to check how they sound next to the music */
export function renderBleats(bleats: Bleat[], gap = 1.5): Promise<AudioBuffer> {
  const seconds = bleats.reduce((t, b) => t + b.length + gap, 0.2);
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * 44100), 44100);
  const out = ctx.createGain();
  out.gain.value = SHEEP_LEVEL;
  out.connect(ctx.destination);
  let at = 0.1;
  for (const b of bleats) {
    playBleat(ctx, out, at, b);
    at += b.length + gap;
  }
  return ctx.startRendering();
}

/**
 * The flock: its own small audio context, on the music's volume curve and mute, bleating now and
 * then while it's running.
 */
class Flock {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | undefined;
  private running = false;
  private level = 0;

  /** Same curve as the music (volume squared), then a good deal quieter */
  setLevel(volume: number, muted: boolean) {
    this.level = muted ? 0 : volume ** 2 * SHEEP_LEVEL;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.05);
    if (!this.running) return;
    if (this.level > 0) this.wake();
    else void this.ctx?.suspend();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.wake();
    // The first bleat comes a little after opening, not right away
    this.next(between(3, 6));
  }

  stop() {
    this.running = false;
    window.clearTimeout(this.timer);
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  /** Starts the sound after a click or key press, if the browser held it back */
  unlock() {
    if (this.running && this.level > 0 && this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  close() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  private wake() {
    if (this.level === 0) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.level;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private next(seconds: number) {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (!this.running) return;
      if (this.ctx && this.master && this.ctx.state === 'running' && this.level > 0) {
        const at = this.ctx.currentTime + 0.05;
        const first = randomBleat();
        playBleat(this.ctx, this.master, at, first);
        if (Math.random() < ANSWER_CHANCE) playBleat(this.ctx, this.master, at + first.length + between(0.5, 1.4), randomBleat());
      }
      this.next(between(GAP_MIN, GAP_MAX));
    }, seconds * 1000);
  }
}

/**
 * Sheep now and then while `active` (a croft is open) and the tab is in front, on the music's
 * volume and mute.
 */
export function useSheepSounds(active: boolean, settings: { volume: number; muted: boolean }) {
  const flockRef = useRef<Flock | null>(null);

  useEffect(() => {
    const flock = new Flock();
    flockRef.current = flock;
    const unlock = () => flock.unlock();
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      flock.close();
      flockRef.current = null;
    };
  }, []);

  useEffect(() => {
    flockRef.current?.setLevel(settings.volume, settings.muted);
  }, [settings.volume, settings.muted]);

  useEffect(() => {
    const flock = flockRef.current;
    if (!flock) return;
    const update = () => (active && !document.hidden ? flock.start() : flock.stop());
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      flock.stop();
    };
  }, [active]);
}
