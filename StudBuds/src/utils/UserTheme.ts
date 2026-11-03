import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Json } from '../../../supabase/database.types.ts';
import { applyThemeColors, backgroundStyle, sanitizeTheme } from './Theme';
import type { UserTheme } from './Theme';

/** How long a signed link to a generated background lasts. It's renewed whenever the theme loads. */
const SIGNED_URL_SECONDS = 60 * 60;

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

  // Load the saved theme for whoever is signed in
  useEffect(() => {
    let cancelled = false;
    const load = async (id: string | null) => {
      setUserId(id);
      if (!id) {
        setSaved(null);
        setUseCustom(false);
        return;
      }
      void supabase.rpc('muse_uses_left', { what: 'theme' }).then(({ data }) => {
        if (!cancelled && typeof data === 'number') setThemesLeft(data);
      });
      const { data, error } = await supabase
        .from('user_themes')
        .select('theme, use_custom')
        .eq('user_id', id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const checked = sanitizeTheme(data.theme, id);
      setSaved(checked?.theme ?? null);
      setUseCustom(!!checked && data.use_custom);
    };
    supabase.auth.getUser().then(({ data }) => load(data.user?.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => load(session?.user.id ?? null));
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

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
    supabase.storage
      .from('user-backgrounds')
      .createSignedUrl(image.path, SIGNED_URL_SECONDS)
      .then(({ data }) => {
        if (!cancelled) setImageUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const persist = useCallback(
    async (theme: UserTheme, custom: boolean) => {
      if (!userId) return;
      // A theme is plain data (sanitizeTheme checked it), so it fits the jsonb column as is
      await supabase.from('user_themes').upsert({ user_id: userId, theme: theme as unknown as Json, use_custom: custom });
    },
    [userId],
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
      setSaved(checked.theme);
      setUseCustom(true);
      await persist(checked.theme, true);
      return { note: typeof data?.note === 'string' ? data.note : undefined };
    },
    [userId, persist],
  );

  return {
    /** 'custom' while the saved theme is in use */
    choice: active ? ('custom' as const) : ('default' as const),
    /** The saved custom theme, even while the default look is in use */
    savedTheme: saved,
    /** Themes left this week, or null until known */
    themesLeft,
    switchToDefault,
    switchToSaved,
    generate,
    /** Page background CSS: the generated picture if there is one, otherwise `defaultImage` */
    backgroundStyle: (defaultImage: string) => backgroundStyle(active?.background, imageUrl ?? defaultImage),
  };
}