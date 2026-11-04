/*
 * My Croft: every student's small farm in a Celtic valley. This file is the contract between the
 * game screen (src/components/croft/) and the database (supabase/migrations/…_croft.sql), which
 * checks every action with the same rules and numbers. Change a number in both places.
 *
 * The rules, in short:
 *  - A croft is a field of COLUMNS × ROWS tiles. Each tile is grass or soil, and soil can hold a crop.
 *  - Till grass into soil (free). Sow a seed on empty soil (costs its seed price).
 *  - A sown seed needs one watering to start growing, then it's ready after its growing time.
 *  - Harvest a ready crop for pennies; the soil stays, ready for the next seed.
 *  - Decorations go on grass. Clearing one gives nothing back.
 *  - A visitor can help once a day: watering a dry seed starts it, and watering a growing crop
 *    takes a quarter of its growing time off. The owner sees who helped and can thank them.
 *  - The village lists crofts from every school (only students who've played), and the valley
 *    counts the week's harvests and help. "Here now" shows who's on a croft at the moment.
 *  - Growth runs on the server's clock, so crops keep growing while the site is closed.
 */

export const CROFT_COLUMNS = 6;
export const CROFT_ROWS = 5;
export const CROFT_TILES = CROFT_COLUMNS * CROFT_ROWS;
/** A new croft: these pennies, and the first row already tilled */
export const STARTING_PENNIES = 20;
export const STARTING_SOIL = [0, 1, 2, 3, 4, 5];
/** How much of a crop's growing time a visitor's help takes off */
export const HELP_SPEEDUP = 0.25;

export interface CropInfo {
  name: string;
  /** From watering to ready */
  growMinutes: number;
  seedCost: number;
  sellPrice: number;
}

/** Crops grown in medieval Ireland and Scotland, quickest first */
export const CROPS = {
  oats: { name: 'Oats', growMinutes: 20, seedCost: 2, sellPrice: 5 },
  kale: { name: 'Kale', growMinutes: 45, seedCost: 3, sellPrice: 8 },
  leeks: { name: 'Leeks', growMinutes: 90, seedCost: 5, sellPrice: 14 },
  barley: { name: 'Barley', growMinutes: 180, seedCost: 8, sellPrice: 24 },
  beans: { name: 'Beans', growMinutes: 360, seedCost: 12, sellPrice: 40 },
  flax: { name: 'Flax', growMinutes: 720, seedCost: 18, sellPrice: 65 },
} as const satisfies Record<string, CropInfo>;
export type CropKey = keyof typeof CROPS;

export interface DecorationInfo {
  name: string;
  price: number;
}

export const DECORATIONS = {
  fence: { name: 'Wicker fence', price: 10 },
  herbs: { name: 'Herb bed', price: 20 },
  skep: { name: 'Beehive skep', price: 25 },
  lantern: { name: 'Lantern', price: 30 },
  rowan: { name: 'Rowan tree', price: 45 },
  stone: { name: 'Standing stone', price: 60 },
  sheep: { name: 'Sheep', price: 80 },
} as const satisfies Record<string, DecorationInfo>;
export type DecorationKey = keyof typeof DECORATIONS;

export interface CroftTile {
  /** row * CROFT_COLUMNS + column, from 0 */
  index: number;
  ground: 'grass' | 'soil';
  /** On soil only */
  crop: CropKey | null;
  /** When the crop will be ready (ISO time), or null while it's a dry seed waiting for water */
  readyAt: string | null;
  /** On grass only */
  decoration: DecorationKey | null;
}

/** Someone who helped on this croft recently */
export interface CroftHelp {
  /** For thanking it (the owner only) */
  id: number;
  helperName: string;
  crop: CropKey;
  /** ISO time */
  at: string;
  /** The owner already thanked them */
  thanked: boolean;
}

/** A thank-you you got for helping on someone's croft */
export interface CroftThanks {
  ownerName: string;
  crop: CropKey;
  /** ISO time */
  at: string;
}

/** A croft in the village, from any school (only students who've played appear) */
export interface VillageCroft {
  ownerId: string;
  ownerName: string;
  /** Public link to their avatar, if they have one */
  avatar?: string;
  /** Seeds waiting for water: where your help starts a crop */
  drySeeds: number;
  growing: number;
  ready: number;
  /** You already helped there today */
  helpedToday: boolean;
  connected: boolean;
}

/** This week in the valley, across every school (weeks start Monday) */
export interface ValleyWeek {
  harvests: number;
  helps: number;
  crofts: number;
}

/** A croft as the screen shows it: your own, or someone else's when visiting */
export interface CroftView {
  ownerId: string;
  /** "Merry Ladybug's Croft" comes from this; there's no typed text anywhere in the game */
  ownerName: string;
  isMine: boolean;
  /** Only for your own croft */
  pennies: number | null;
  tiles: CroftTile[];
  /** Newest first, the last 10 */
  helpers: CroftHelp[];
  /** Your own croft: thank-yous you got this week for helping elsewhere, newest first */
  thanks: CroftThanks[];
  /** Visiting: you can still help today */
  canHelpToday: boolean;
}

/** Everything a player can do. The database checks each one and says why if it can't. */
export type CroftAction =
  | { type: 'till'; index: number }
  | { type: 'sow'; index: number; crop: CropKey }
  | { type: 'water'; index: number }
  | { type: 'harvest'; index: number }
  | { type: 'place'; index: number; decoration: DecorationKey }
  | { type: 'clear'; index: number }
  /** On someone else's croft, once a day */
  | { type: 'help'; ownerId: string; index: number }
  /** Your own croft: thank someone who helped, once per help */
  | { type: 'thank'; helpId: number };

export type CropStage = 'seed' | 'sprout' | 'growing' | 'ready';

/**
 * How grown a tile's crop looks right now: a dry seed, then sprout (first half), growing
 * (second half), ready. null for a tile without a crop. `now` defaults to the current time.
 */
export function cropStage(tile: CroftTile, now = Date.now()): CropStage | null {
  if (!tile.crop) return null;
  if (!tile.readyAt) return 'seed';
  const left = new Date(tile.readyAt).getTime() - now;
  if (left <= 0) return 'ready';
  return left > (CROPS[tile.crop].growMinutes * 60_000) / 2 ? 'sprout' : 'growing';
}

/**
 * Minutes until a growing crop is ready (rounded up), or null. Never more than its growing time,
 * even when this device's clock runs a few seconds behind the server's.
 */
export function minutesLeft(tile: CroftTile, now = Date.now()): number | null {
  if (!tile.crop || !tile.readyAt) return null;
  const left = Math.ceil((new Date(tile.readyAt).getTime() - now) / 60_000);
  return Math.min(CROPS[tile.crop].growMinutes, Math.max(0, left));
}

/** "Merry Ladybug's Croft" */
export const croftName = (ownerName: string) => `${ownerName}’s Croft`;
