import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CROPS, CROFT_TILES, DECORATIONS } from '../dataFiles/Croft';
import type { CroftAction, CroftHelp, CroftTile, CroftView, CropKey, DecorationKey } from '../dataFiles/Croft';
import { supabase } from './supabase.ts';

/** How often crops visibly grow on screen; the database's clock decides when they're ready */
const TICK_MS = 15_000;

const isCrop = (v: unknown): v is CropKey => typeof v === 'string' && v in CROPS;
const isDecoration = (v: unknown): v is DecorationKey => typeof v === 'string' && v in DECORATIONS;

/** The database's croft (public.croft_view) as a checked CroftView, or null if it isn't one */
function toView(raw: unknown): CroftView | null {
  const v = raw as Record<string, unknown> | null;
  if (!v || typeof v.ownerId !== 'string' || !Array.isArray(v.tiles) || v.tiles.length !== CROFT_TILES) return null;
  const tiles = (v.tiles as Record<string, unknown>[]).map(
    (t): CroftTile => ({
      index: Number(t.index),
      ground: t.ground === 'soil' ? 'soil' : 'grass',
      crop: isCrop(t.crop) ? t.crop : null,
      readyAt: typeof t.readyAt === 'string' ? t.readyAt : null,
      decoration: isDecoration(t.decoration) ? t.decoration : null,
    }),
  );
  const helpers = (Array.isArray(v.helpers) ? v.helpers : []).flatMap((h): CroftHelp[] =>
    isCrop(h?.crop) && typeof h?.helperName === 'string' && typeof h?.at === 'string'
      ? [{ helperName: h.helperName, crop: h.crop, at: h.at }]
      : [],
  );
  return {
    ownerId: v.ownerId,
    ownerName: typeof v.ownerName === 'string' ? v.ownerName : 'A student',
    isMine: v.isMine === true,
    pennies: typeof v.pennies === 'number' ? v.pennies : null,
    tiles,
    helpers,
    canHelpToday: v.canHelpToday === true,
  };
}

/** The time now, updated every `ms`, so growing crops change stage on screen */
export function useNow(ms = TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(timer);
  }, [ms]);
  return now;
}

/**
 * A croft for the game screen: your own when `ownerId` is null, or someone else's when visiting.
 * `act` sends one CroftAction; the database checks it and the croft updates from its answer.
 * Refusals ("You need 80 pennies for that.") come back in `error`. On your own croft, help from
 * visitors shows up live in `helpNotice`. Nothing loads while `enabled` is false (a closed window).
 */
export function useCroft(ownerId: string | null, enabled = true) {
  const [croft, setCroft] = useState<CroftView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [helpNotice, setHelpNotice] = useState('');
  const latest = useRef(ownerId);
  latest.current = ownerId;

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc('croft_view', ownerId ? { owner: ownerId } : {});
    if (latest.current !== ownerId) return;
    if (loadError) {
      setError(loadError.code === 'P0001' ? loadError.message : 'Couldn’t open the croft right now. Check your connection.');
      return;
    }
    setCroft(toView(data));
    setError('');
  }, [ownerId]);

  useEffect(() => {
    setCroft(null);
    if (enabled) void load();
  }, [load, enabled]);

  // Your own croft: when a visitor helps, reload and say who
  useEffect(() => {
    if (ownerId || !enabled) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      channel = supabase
        .channel('croft-help')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'croft_help', filter: `owner_id=eq.${data.user.id}` },
          async () => {
            const { data: fresh } = await supabase.rpc('croft_view', {});
            const view = toView(fresh);
            if (cancelled || !view) return;
            setCroft(view);
            const newest = view.helpers[0];
            if (newest) setHelpNotice(`${newest.helperName} watered your ${CROPS[newest.crop].name.toLowerCase()}.`);
          },
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [ownerId, enabled]);

  const act = useCallback(
    async (action: CroftAction) => {
      setBusy(true);
      const { data, error: actError } =
        action.type === 'help'
          ? await supabase.rpc('croft_help', { owner: action.ownerId, tile: action.index })
          : await supabase.rpc('croft_act', {
              action: action.type,
              tile: action.index,
              item: action.type === 'sow' ? action.crop : action.type === 'place' ? action.decoration : undefined,
            });
      setBusy(false);
      if (actError) {
        // P0001 messages are written for students
        setError(actError.code === 'P0001' ? actError.message : 'That didn’t go through. Check your connection and try again.');
        return false;
      }
      const view = toView(data);
      if (view) setCroft(view);
      setError('');
      return true;
    },
    [],
  );

  return { croft, error, busy, helpNotice, clearHelpNotice: () => setHelpNotice(''), act, refresh: load };
}

/** Lets any profile card open someone's croft ("Visit croft"), wherever it sits on Home */
export const CroftVisitContext = createContext<((personId: string) => void) | null>(null);
export const useVisitCroft = () => useContext(CroftVisitContext);
