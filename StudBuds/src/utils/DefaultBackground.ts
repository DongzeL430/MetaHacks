/*
 * The default theme's background picture: one of the default*bg.png pictures in ../assets,
 * picked at random once per browser session (tab), so the log-in page and Home show the same one
 * and it stays put across reloads. A new tab or a new visit gets a fresh pick.
 *
 * To add a picture, drop another default<something>bg.png into src/assets.
 */

// Every default picture in assets, e.g. defaultbg.png, default2bg.png, ... (built-in URLs)
const PICTURES: Record<string, string> = import.meta.glob('../assets/default*bg.png', {
  eager: true,
  import: 'default',
  query: '?url',
});

const STORAGE_KEY = 'studbuds:default-bg';

/** This session's picture, as its path key in PICTURES */
function pick(): string {
  const names = Object.keys(PICTURES).sort();
  // sessionStorage can be missing or blocked (private windows, strict settings): then the pick
  // still holds for as long as the page stays open
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved && saved in PICTURES) return saved;
  } catch {
    /* fall through to a new pick */
  }
  const name = names[Math.floor(Math.random() * names.length)];
  try {
    sessionStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* not saved; this page load still keeps it */
  }
  return name;
}

const picked = pick();

/** The URL of this session's default background picture */
export const defaultBackground: string = PICTURES[picked];

/** Its file name without the extension, e.g. "default3bg": picks the default theme's music (defaultMusicFor) */
export const defaultBackgroundName: string = picked.split('/').pop()!.replace(/\.png$/, '');
