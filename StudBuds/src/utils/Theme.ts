import type { CSSProperties } from 'react';
import { sanitizeMusic } from './Music';
import type { ThemeMusic } from './Music';

/*
 * Themes are DATA, never code: a list of color values plus a background description.
 * Everything is checked by sanitizeTheme() before it's applied, whoever made it (the user, the
 * generate-theme Edge Function, or a saved row). Only names listed here, valid hex colors, readable
 * contrast and in-range numbers survive; anything else falls back to the default look.
 */

/** The default look. Keep in sync with the @theme static block in main.css. */
export const DEFAULT_COLORS = {
  ink: '#3c3c3c',
  'ink-strong': '#2b2b2b',
  paper: '#fdf7f1',
  surface: '#fffdfa',
  sand: '#eadbc8',
  'sand-soft': '#f6ede2',
  nav: '#6b5e54',
  'nav-ink': '#fdf7f1',
  accent: '#f2a65a',
  info: '#a9c7e8',
  free: '#9fd6a6',
  busy: '#f2a99e',
  'busy-strong': '#e0745f',
  danger: '#a8402c',
  'danger-strong': '#c4553f',
  'danger-soft': '#f2c9c4',
  'title-sky': '#bfd8ee',
  'title-mint': '#c6e5c9',
  'title-peach': '#f6cfa8',
  'title-lilac': '#d9cbee',
  'title-butter': '#f2e2a6',
  'title-rose': '#f2c9c4',
} as const;

export type ThemeColor = keyof typeof DEFAULT_COLORS;
export const THEME_COLOR_NAMES = Object.keys(DEFAULT_COLORS) as ThemeColor[];

/** Pairs that must stay readable: [text color, the background it sits on]. WCAG AA for normal text. */
const READABLE_PAIRS: [ThemeColor, ThemeColor][] = [
  ['ink', 'paper'],
  ['ink', 'surface'],
  ['ink', 'sand'],
  ['ink', 'sand-soft'],
  ['ink-strong', 'paper'],
  ['nav-ink', 'nav'],
  ['danger', 'surface'],
  // Text also sits on these (chips, badges, calendar slots, window title bars). Same list as the
  // generate-theme Edge Function, so a theme Muse made always passes here too.
  ['danger', 'paper'],
  ['ink', 'accent'],
  ['ink', 'info'],
  ['ink', 'free'],
  ['ink', 'busy'],
  ['ink', 'danger-soft'],
  ['ink', 'title-sky'],
  ['ink', 'title-mint'],
  ['ink', 'title-peach'],
  ['ink', 'title-lilac'],
  ['ink', 'title-butter'],
  ['ink', 'title-rose'],
];
const MIN_CONTRAST = 4.5;

export interface ThemeBackground {
  /** The built-in picture, or a generated one in the user's private storage folder */
  image: { kind: 'default' } | { kind: 'generated'; path: string };
  /** Which part of the picture stays in view when it's cropped, in percent (0 to 100) */
  focus?: { x: number; y: number };
  /** A color laid over the picture, to calm busy images or match the colors */
  tint?: { color: string; opacity: number };
}

export interface UserTheme {
  version: 1;
  /** Shown to the user, e.g. "Forest" */
  name: string;
  /** Only the colors that differ from the default */
  colors: Partial<Record<ThemeColor, string>>;
  background?: ThemeBackground;
  /** The piece Muse composed for this theme (Music.ts). Without one, the default piece plays. */
  music?: ThemeMusic;
}

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_NAME = 40;
const MAX_TINT = 0.6;
/** Generated images live at "<user id>/<name>.webp" in the user-backgrounds bucket */
const GENERATED_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,64}\.webp$/;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/* ---------- Contrast (WCAG 2) ---------- */

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** 1 (no contrast) to 21 (black on white) */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- Validation ---------- */

/**
 * Checks a theme from anywhere and returns a safe copy, or null if it isn't a theme at all.
 * Unknown names, bad values and unreadable color pairs are dropped (those fall back to the default),
 * and each one is listed in `problems`.
 * Pass the signed-in user's id so a generated background can only point at their own folder.
 */
export function sanitizeTheme(input: unknown, userId?: string): { theme: UserTheme; problems: string[] } | null {
  if (!isObject(input) || input.version !== 1) return null;
  const problems: string[] = [];

  const name =
    typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, MAX_NAME) : 'My theme';

  // Colors: known names with valid hex values only
  const colors: Partial<Record<ThemeColor, string>> = {};
  if (isObject(input.colors)) {
    for (const [key, value] of Object.entries(input.colors)) {
      if (!(key in DEFAULT_COLORS)) {
        problems.push(`Unknown color "${key}" ignored.`);
      } else if (typeof value !== 'string' || !HEX.test(value)) {
        problems.push(`Color "${key}" isn't a valid color and was ignored.`);
      } else {
        colors[key as ThemeColor] = value.toLowerCase();
      }
    }
  }

  // Readability: if a text color and its background are too close, both go back to default
  for (const [text, bg] of READABLE_PAIRS) {
    const t = colors[text] ?? DEFAULT_COLORS[text];
    const b = colors[bg] ?? DEFAULT_COLORS[bg];
    if (contrastRatio(t, b) < MIN_CONTRAST && (colors[text] || colors[bg])) {
      delete colors[text];
      delete colors[bg];
      problems.push(`"${text}" on "${bg}" was too hard to read, so both use the default.`);
    }
  }

  // Background
  let background: ThemeBackground | undefined;
  if (isObject(input.background)) {
    const bg = input.background;
    let image: ThemeBackground['image'] = { kind: 'default' };
    if (isObject(bg.image) && bg.image.kind === 'generated') {
      const path = bg.image.path;
      const ownFolder = !userId || (typeof path === 'string' && path.startsWith(`${userId}/`));
      if (typeof path === 'string' && GENERATED_PATH.test(path) && ownFolder) image = { kind: 'generated', path };
      else problems.push('Background image wasn’t usable, so the default picture is shown.');
    }
    background = { image };

    if (isObject(bg.focus) && typeof bg.focus.x === 'number' && typeof bg.focus.y === 'number') {
      background.focus = { x: clamp(bg.focus.x, 0, 100), y: clamp(bg.focus.y, 0, 100) };
    }
    if (isObject(bg.tint) && typeof bg.tint.color === 'string' && HEX.test(bg.tint.color) && typeof bg.tint.opacity === 'number') {
      background.tint = { color: bg.tint.color.toLowerCase(), opacity: clamp(bg.tint.opacity, 0, MAX_TINT) };
    }
  }

  // Music: kept only if the whole score checks out
  const music = input.music === undefined ? null : sanitizeMusic(input.music);
  if (input.music !== undefined && !music) problems.push('The theme’s music wasn’t usable, so the default piece plays.');

  return {
    theme: { version: 1, name, colors, ...(background ? { background } : {}), ...(music ? { music } : {}) },
    problems,
  };
}

/* ---------- Applying ---------- */

/** Sets the theme's colors on the page. Pass null to go back to the default look. */
export function applyThemeColors(colors: Partial<Record<ThemeColor, string>> | null) {
  const root = document.documentElement;
  for (const name of THEME_COLOR_NAMES) {
    const value = colors?.[name];
    if (value) root.style.setProperty(`--color-${name}`, value);
    else root.style.removeProperty(`--color-${name}`);
  }
}

const hexToRgba = (hex: string, opacity: number) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${opacity})`;

/** The default picture's crop: keep the ground (bottom) in view */
export const DEFAULT_FOCUS = { x: 50, y: 100 };

/**
 * CSS for a page background, built only from checked values.
 * `imageUrl` is the picture to show: the built-in one, or a signed link to the user's generated one.
 */
export function backgroundStyle(background: ThemeBackground | undefined, imageUrl: string): CSSProperties {
  const focus = background?.focus ?? DEFAULT_FOCUS;
  const picture = `url(${JSON.stringify(imageUrl)})`;
  const tint = background?.tint;
  return {
    backgroundImage: tint
      ? `linear-gradient(${hexToRgba(tint.color, tint.opacity)}, ${hexToRgba(tint.color, tint.opacity)}), ${picture}`
      : picture,
    backgroundPosition: `${focus.x}% ${focus.y}%`,
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
  };
}