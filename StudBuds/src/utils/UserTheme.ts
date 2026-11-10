import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Json } from '../../../supabase/database.types.ts';
import { sanitizeMusic } from './Music';
import { applyThemeColors, backgroundStyle, sanitizeTheme } from './Theme';
import type { UserTheme } from './Theme';
import { actingId } from '../lib/demo.ts';

/** How long a signed link to a generated background lasts. It's renewed whenever the theme loads. */
const SIGNED_URL_SECONDS = 60 * 60;

/** A theme in the student's library, for the theme window */
export interface ThemeLibraryItem {
  id: string;
  theme: UserTheme;
  /** A short-lived link to its background picture, for the preview */
  previewUrl?: string;
}

/** The theme's own generated picture in the user-backgrounds bucket, if it has one */
const generatedPath = (theme: UserTheme | null | undefined) =>
  theme?.background?.image.kind === 'generated' ? theme.background.image.path : null;

/**
 * The signed-in user's theme.
 *  - Loads their saved theme from the user_themes table and applies it (colors + background).
 *  - switchToDefault() / switchToSaved() switch between the default look and their saved custom theme.
 *  - generate(prompt) asks the generate-theme Edge Function for a new theme, checks it, applies and saves it.
 * Everything coming back from the database or the Edge Function goes through sanitizeTheme() first.
 * Unmounting puts the default colors back, so other pages always start from the default look.
 */
export function useUserTheme() {
  const [userId, setUserId] = useState<string | null>(null);
  const [saved, setSaved] = useState<UserTheme | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // Themes left this week (3 a week, counted on the server)
  const [themesLeft, setThemesLeft] = useState<number | null>(null);
  // Every theme the student has made, newest first, and which one is the current theme
  const [library, setLibrary] = useState<ThemeLibraryItem[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);

  const loadLibrary = useCallback(async (id: string) => {
    const { data } = await supabase.from('saved_themes').select('id, theme').order('created_at', { ascending: false });
    const items = (data ?? []).flatMap((row): ThemeLibraryItem[] => {
      const checked = sanitizeTheme(row.theme, id);
      return checked ? [{ id: row.id, theme: checked.theme }] : [];
    });
    const paths = [...new Set(items.map((i) => generatedPath(i.theme)).filter((p): p is string => !!p))];
    const { data: links } = paths.length
      ? await supabase.storage.from('user-backgrounds').createSignedUrls(paths, SIGNED_URL_SECONDS)
      : { data: [] };
    const byPath = new Map((links ?? []).map((l) => [l.path, l.signedUrl]));
    setLibrary(items.map((i) => ({ ...i, previewUrl: byPath.get(generatedPath(i.theme) ?? '') ?? undefined })));
  }, []);

  // Load the saved theme for whoever is signed in. Only when the student changes (not on token
  // refreshes), so a theme picked or made in this session isn't replaced by an older copy.
  useEffect(() => {
    let cancelled = false;
    let loadedFor: string | null | undefined;
    const load = async (id: string | null) => {
      if (id === loadedFor) return;
      loadedFor = id;
      setUserId(id);
      if (!id) {
        setSaved(null);
        setUseCustom(false);
        setLibrary([]);
        setSavedId(null);
        return;
      }
      void supabase.rpc('muse_uses_left', { what: 'theme' }).then(({ data }) => {
        if (!cancelled && typeof data === 'number') setThemesLeft(data);
      });
      void loadLibrary(id);
      const { data, error } = await supabase
        .from('user_themes')
        .select('theme, use_custom, saved_theme_id')
        .eq('user_id', id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const checked = sanitizeTheme(data.theme, id);
      setSaved(checked?.theme ?? null);
      setUseCustom(!!checked && data.use_custom);
      setSavedId(data.saved_theme_id);
    };
    // Supabase calls inside the auth callback can deadlock, so loading starts just after it
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void load(actingId(session?.user)), 0);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [loadLibrary]);

  const active = useCustom && saved ? saved : null;

  // Colors: apply the active theme, or the default; always put the default back when leaving
  useEffect(() => {
    applyThemeColors(active?.colors ?? null);
  }, [active]);
  useEffect(() => () => applyThemeColors(null), []);

  // Background: a short-lived signed link to the user's own generated image (never a public URL)
  useEffect(() => {
    const image = active?.background?.image;
    if (!image || image.kind !== 'generated') {
      setImageUrl(null);
      return;
    }
    let cancelled = false;
    const refresh = () =>
      supabase.storage
        .from('user-backgrounds')
        .createSignedUrl(image.path, SIGNED_URL_SECONDS)
        .then(({ data }) => {
          if (!cancelled) setImageUrl(data?.signedUrl ?? null);
        });
    void refresh();
    // A signed link stops working when it expires, so get a fresh one a few minutes before
    const timer = window.setInterval(() => void refresh(), (SIGNED_URL_SECONDS - 300) * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active]);

  // Every theme has its own music. One without any yet (made before theme music, or its music
  // didn't come out right) gets it written by Muse the first time it's in use on this visit.
  const musicRequested = useRef(new Set<string>());
  useEffect(() => {
    if (!active || active.music || !savedId || musicRequested.current.has(savedId)) return;
    musicRequested.current.add(savedId);
    const themeId = savedId;
    void supabase.functions.invoke('generate-theme', { body: { action: 'compose', themeId } }).then(({ data, error }) => {
      // Until it's written, the stand-in piece plays
      const music = error ? null : sanitizeMusic(data?.music);
      if (!music) {
        console.warn('theme music not written yet', error);
        return;
      }
      // Only swaps it in if that theme is still the one in use
      setSaved((s) => (s === active ? { ...s, music } : s));
      setLibrary((items) => items.map((i) => (i.id === themeId ? { ...i, theme: { ...i.theme, music } } : i)));
    });
  }, [active, savedId]);

  const persist = useCallback(
    async (theme: UserTheme, custom: boolean, libraryId?: string | null) => {
      if (!userId) return;
      // A theme is plain data (sanitizeTheme checked it), so it fits the jsonb column as is
      await supabase.from('user_themes').upsert({
        user_id: userId,
        theme: theme as unknown as Json,
        use_custom: custom,
        // Left out unless given, so switching on and off keeps the link to the library theme
        ...(libraryId !== undefined ? { saved_theme_id: libraryId } : {}),
      });
    },
    [userId],
  );

  /** Switches to a theme from the library */
  const switchToLibraryTheme = useCallback(
    (id: string) => {
      const item = library.find((i) => i.id === id);
      if (!item) return;
      setSaved(item.theme);
      setSavedId(id);
      setUseCustom(true);
      void persist(item.theme, true, id);
    },
    [library, persist],
  );

  /** Deletes a theme from the library, and its picture. The theme in use goes back to the default look. */
  const deleteLibraryTheme = useCallback(
    async (id: string) => {
      const item = library.find((i) => i.id === id);
      if (!item) return;
      const { error } = await supabase.from('saved_themes').delete().eq('id', id);
      if (error) throw new Error('That theme wasn’t deleted. Try again in a moment.');
      if (id === savedId) {
        setUseCustom(false);
        setSavedId(null);
        if (saved) void persist(saved, false);
      }
      const path = generatedPath(item.theme);
      if (path && !library.some((i) => i.id !== id && generatedPath(i.theme) === path)) {
        await supabase.storage.from('user-backgrounds').remove([path]);
      }
      setLibrary((items) => items.filter((i) => i.id !== id));
    },
    [library, savedId, saved, persist],
  );

  /** The sun: back to the default look. The custom theme stays saved for later. */
  const switchToDefault = useCallback(() => {
    setUseCustom(false);
    if (saved) void persist(saved, false);
  }, [saved, persist]);

  /** Switch back to the saved custom theme */
  const switchToSaved = useCallback(() => {
    if (!saved) return;
    setUseCustom(true);
    void persist(saved, true);
  }, [saved, persist]);

  /** Makes a theme from a description. Throws with a message to show if it couldn't. */
  const generate = useCallback(
    async (prompt: string): Promise<{ note?: string }> => {
      const { data, error } = await supabase.functions.invoke('generate-theme', { body: { prompt } });
      if (error) {
        // The function's own message (rate limit, too short…) is in the response body
        let message = 'Couldn’t make that theme right now. Try again in a moment.';
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (typeof body?.error === 'string') message = body.error;
        } catch {
          // keep the general message
        }
        throw new Error(message);
      }
      if (typeof data?.themesLeft === 'number') setThemesLeft(data.themesLeft);
      const checked = sanitizeTheme(data?.theme, userId ?? undefined);
      if (!checked) throw new Error('That theme didn’t come out right. Try describing it a little differently.');
      // The theme function already saved it to the library and switched it on
      setSaved(checked.theme);
      setUseCustom(true);
      setSavedId(typeof data?.savedThemeId === 'string' ? data.savedThemeId : null);
      if (userId) void loadLibrary(userId);
      return { note: typeof data?.note === 'string' ? data.note : undefined };
    },
    [userId, loadLibrary],
  );

  return {
    /** 'custom' while the saved theme is in use */
    choice: active ? ('custom' as const) : ('default' as const),
    /** The saved custom theme, even while the default look is in use */
    savedTheme: saved,
    /** Themes left this week, or null until known */
    themesLeft,
    /** Every theme the student has made, newest first */
    library,
    /** The library theme in use right now, or null on the default look */
    activeThemeId: active ? savedId : null,
    switchToLibraryTheme,
    deleteLibraryTheme,
    switchToDefault,
    switchToSaved,
    generate,
    /** Page background CSS: the generated picture if there is one, otherwise `defaultImage` */
    // The default look always uses the built-in picture, even for the moment before the custom
    // picture's link is cleared
    backgroundStyle: (defaultImage: string) =>
      backgroundStyle(active?.background, active ? (imageUrl ?? defaultImage) : defaultImage),
  };
}