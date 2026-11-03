// generate-theme: turns a theme description into a theme (colors + optional background image).
//
// Flow: sign-in check -> prompt length -> daily limit (ai_requests) -> prompt check -> colors
//       -> background image (only when switched on) -> returns the theme as data.
//
// Today the colors come from the closest built-in palette, and background images are switched off.
// To turn images on later:
//   1. Fill in metaMuse.generate(), checkImage() and cleanImage() below.
//   2. Set the secrets: supabase secrets set MUSE_API_KEY=... THEME_IMAGES_ENABLED=true
// Images stay off unless BOTH are set, and checkImage() rejects everything until it's filled in.
//
// The app re-checks whatever this returns with sanitizeTheme() (src/utils/Theme.ts), so a mistake
// here can never put anything unsafe on screen.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Themes each user can make per 24 hours */
const DAILY_LIMIT = 10;
const MIN_PROMPT = 5;
const MAX_PROMPT = 300;
const BACKGROUND_BUCKET = 'user-backgrounds';

const IMAGES_ENABLED = Deno.env.get('THEME_IMAGES_ENABLED') === 'true' && !!Deno.env.get('MUSE_API_KEY');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* ------------------------------------------------------------------ *
 * Colors: built-in palettes, picked by keywords for now.
 * Every palette keeps text readable (checked against WCAG AA in the app).
 * Later, a text model could pick or blend palettes instead; keep its output to these color names.
 * ------------------------------------------------------------------ */

interface Palette {
  name: string;
  keywords: string[];
  colors: Record<string, string>;
}

const PALETTES: Palette[] = [
  {
    name: 'Forest',
    keywords: ['forest', 'green', 'nature', 'tree', 'woods', 'moss', 'leaf', 'plant', 'earth', 'calm'],
    colors: { paper: '#f3f6ee', surface: '#fbfdf8', sand: '#d6e4cc', 'sand-soft': '#e8f0e1', nav: '#3f5a45', accent: '#e0a458' },
  },
  {
    name: 'Ocean',
    keywords: ['ocean', 'sea', 'blue', 'water', 'beach', 'wave', 'sky', 'cool', 'minimal', 'clean'],
    colors: { paper: '#eef5f8', surface: '#fafdfe', sand: '#cfe3ec', 'sand-soft': '#e3eff4', nav: '#2f5468', accent: '#ffb86b' },
  },
  {
    name: 'Autumn',
    keywords: ['autumn', 'fall', 'orange', 'brown', 'cozy', 'warm', 'pumpkin', 'harvest', 'wood', 'coffee'],
    colors: { paper: '#fbf3ea', surface: '#fffaf4', sand: '#f0d6bb', 'sand-soft': '#f7e6d4', nav: '#7a4a2e', accent: '#d9822b' },
  },
  {
    name: 'Pastel',
    keywords: ['pastel', 'pink', 'soft', 'spring', 'cute', 'blossom', 'sakura', 'candy', 'light'],
    colors: { paper: '#fdf6fa', surface: '#fffbfd', sand: '#f1dcea', 'sand-soft': '#f8ebf3', nav: '#6e5a7e', accent: '#f4a6c0' },
  },
  {
    name: 'Lavender',
    keywords: ['lavender', 'purple', 'violet', 'dream', 'magic', 'night', 'galaxy', 'star', 'moon'],
    colors: { paper: '#f6f3fb', surface: '#fcfbff', sand: '#e1d8f1', 'sand-soft': '#eee8f8', nav: '#5a4b7a', accent: '#b893e6' },
  },
  {
    name: 'Sunset',
    keywords: ['sunset', 'sunrise', 'red', 'coral', 'peach', 'summer', 'tropical', 'golden', 'bright'],
    colors: { paper: '#fff4ec', surface: '#fffaf6', sand: '#f9d5c2', 'sand-soft': '#fce6da', nav: '#8a4b5a', accent: '#ff9e64' },
  },
];

/** The palette whose keywords appear most in the prompt (Autumn's warm default if none match) */
function pickPalette(prompt: string): Palette {
  const words = prompt.toLowerCase();
  let best = PALETTES[2];
  let bestScore = 0;
  for (const p of PALETTES) {
    const score = p.keywords.filter((k) => words.includes(k)).length;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Content checks. Fill these in before switching images on.
 * ------------------------------------------------------------------ */

/**
 * Checks the description before anything is made. Hook up a moderation service here
 * (sexual content, minors, graphic violence, self-harm, hate). Today the prompt only picks
 * from built-in palettes, so nothing it says can reach the screen; this matters once images are on.
 */
async function checkPrompt(_prompt: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  // TODO: call your moderation service and return { ok: false, reason } when it flags the prompt.
  return { ok: true };
}

/**
 * Checks a generated image. Fails closed: returns false (reject) until a real check is added,
 * so switching images on early can't put an unchecked picture in anyone's background.
 */
async function checkImage(_image: Uint8Array): Promise<boolean> {
  // TODO: run an image moderation service and return true only when it passes.
  return false;
}

/**
 * Resizes (max 2560px wide) and re-saves the image as WebP, which also strips hidden metadata
 * and anything that isn't a real picture. ImageScript (https://deno.land/x/imagescript) works in Deno.
 */
async function cleanImage(_image: Uint8Array): Promise<Uint8Array> {
  // TODO: decode, resize, encode to WebP, and return the new bytes.
  throw new Error('cleanImage is not set up yet.');
}

/* ------------------------------------------------------------------ *
 * Image provider: Meta Muse goes here.
 * ------------------------------------------------------------------ */

interface ImageProvider {
  name: string;
  /** Returns the image file's bytes */
  generate(prompt: string, size: { width: number; height: number }): Promise<Uint8Array>;
}

const metaMuse: ImageProvider = {
  name: 'meta-muse',
  async generate(_prompt, _size) {
    // TODO: call the Meta Muse image API here, using Deno.env.get('MUSE_API_KEY') (and an endpoint
    // secret if it needs one), and return the image bytes. Throw if the request fails.
    throw new Error('Meta Muse is not connected yet.');
  },
};

/** Wraps the user's idea in the rules every background must follow */
function backgroundPrompt(idea: string): string {
  return [
    'A wide, calm background image for a study app, in a soft pixel-art scenery style.',
    `Theme: ${idea}`,
    'Scenery, landscapes or abstract patterns only.',
    'No text, letters, numbers, logos, signs, user interface elements or QR codes.',
    'No people, faces or real, identifiable persons. No copyrighted characters.',
    'No flashing, strobing or high-contrast stripe patterns. Nothing violent, sexual or disturbing.',
    'Keep the bottom third simple so the app stays readable on top of it.',
  ].join(' ');
}

/* ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  // Who's asking: the user's own session, from the request
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Sign in to make a theme.' }, 401);

  let prompt = '';
  try {
    const body = await req.json();
    prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  } catch {
    // treated as an empty prompt below
  }
  if (prompt.length < MIN_PROMPT || prompt.length > MAX_PROMPT) {
    return json({ error: `Describe your theme in ${MIN_PROMPT} to ${MAX_PROMPT} characters.` }, 400);
  }

  // Daily limit, counted in ai_requests (service role, so the count can't be dodged from the browser)
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from('ai_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('kind', 'theme')
    .gte('created_at', since);
  if (countError) return json({ error: 'Couldn’t make a theme right now. Try again in a moment.' }, 500);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return json({ error: 'You’ve made a lot of themes today. Try again tomorrow.' }, 429);
  }
  await admin.from('ai_requests').insert({ user_id: user.id, kind: 'theme' });

  const check = await checkPrompt(prompt);
  if (!check.ok) return json({ error: check.reason }, 400);

  // Colors
  const palette = pickPalette(prompt);
  const theme: Record<string, unknown> = { version: 1, name: palette.name, colors: palette.colors };
  let note: string | undefined;

  // Background image: only when switched on, and only if every check passes
  if (IMAGES_ENABLED) {
    try {
      const raw = await metaMuse.generate(backgroundPrompt(prompt), { width: 2560, height: 1440 });
      if (await checkImage(raw)) {
        const clean = await cleanImage(raw);
        const path = `${user.id}/${crypto.randomUUID()}.webp`;
        const { error } = await admin.storage
          .from(BACKGROUND_BUCKET)
          .upload(path, clean, { contentType: 'image/webp', upsert: false });
        if (!error) theme.background = { image: { kind: 'generated', path }, focus: { x: 50, y: 50 } };
        else note = 'Your colors are ready, but the background couldn’t be saved.';
      } else {
        note = 'Your colors are ready, but that background couldn’t be used.';
      }
    } catch (err) {
      console.error('background generation failed', err);
      note = 'Your colors are ready, but the background couldn’t be made right now.';
    }
  } else {
    note = 'Custom background images are coming soon. Your colors are ready.';
  }

  return json({ theme, note });
});