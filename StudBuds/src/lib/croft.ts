import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CROPS, CROFT_TILES, DECORATIONS } from '../dataFiles/Croft';
import type {
  CroftAction,
  CroftHelp,
  CroftThanks,
  CroftTile,
  CroftView,
  CropKey,
  DecorationKey,
  ValleyWeek,
  VillageCroft,
} from '../dataFiles/Croft';
import { avatarUrlOf } from './profile.ts';
import { listenerTopic, supabase } from './supabase.ts';
import { actingId } from './demo.ts';

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
    isCrop(h?.crop) && typeof h?.helperName === 'string' && typeof h?.at === 'string' && typeof h?.id === 'number'
      ? [{ id: h.id, helperName: h.helperName, crop: h.crop, at: h.at, thanked: h.thanked === true }]
      : [],
  );
  const thanks = (Array.isArray(v.thanks) ? v.thanks : []).flatMap((t): CroftThanks[] =>
    isCrop(t?.crop) && typeof t?.ownerName === 'string' && typeof t?.at === 'string'
      ? [{ ownerName: t.ownerName, crop: t.crop, at: t.at }]
      : [],
  );
  return {
    ownerId: v.ownerId,
    ownerName: typeof v.ownerName === 'string' ? v.ownerName : 'A student',
    isMine: v.isMine === true,
    pennies: typeof v.pennies === 'number' ? v.pennies : null,
    tiles,
    helpers,
    thanks,
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
 * Refusals ("You need 80 pennies for that.") come back in `error`. Your own croft reloads live
 * when a visitor helps. Nothing loads while `enabled` is false (a closed window).
 */
export function useCroft(ownerId: string | null, enabled = true) {
  const [croft, setCroft] = useState<CroftView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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

  // Your own croft: a visitor's help changes it, so reload (the chat feed says who it was)
  useEffect(() => {
    if (ownerId || !enabled) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      channel = supabase
        .channel(listenerTopic('croft-help'))
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'croft_help', filter: `owner_id=eq.${actingId(data.user)}` },
          () => void load(),
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [ownerId, enabled, load]);

  const act = useCallback(async (action: CroftAction) => {
    setBusy(true);
    const { data, error: actError } =
      action.type === 'help'
        ? await supabase.rpc('croft_help', { owner: action.ownerId, tile: action.index })
        : action.type === 'thank'
          ? await supabase.rpc('croft_thank', { help: action.helpId })
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
  }, []);

  return { croft, error, busy, act, refresh: load };
}

/** The village and this week in the valley, across every school (public.croft_village, public.croft_valley) */
export function useVillage(enabled: boolean) {
  const [crofts, setCrofts] = useState<VillageCroft[] | null>(null);
  const [valley, setValley] = useState<ValleyWeek | null>(null);

  const load = useCallback(async () => {
    const [village, week] = await Promise.all([supabase.rpc('croft_village'), supabase.rpc('croft_valley')]);
    setCrofts(
      (village.data ?? []).map((c) => ({
        ownerId: c.owner_id,
        ownerName: c.nickname,
        avatar: avatarUrlOf(c.avatar_path),
        drySeeds: c.dry_seeds,
        growing: c.growing,
        ready: c.ready,
        helpedToday: c.helped_today,
        connected: c.connected,
      })),
    );
    const w = week.data as Partial<ValleyWeek> | null;
    setValley(w ? { harvests: Number(w.harvests ?? 0), helps: Number(w.helps ?? 0), crofts: Number(w.crofts ?? 0) } : null);
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return { crofts, valley, refresh: load };
}

/**
 * "Here now": the other students on a croft at this moment (you excluded), by Realtime presence
 * on the private channel "croft:<owner id>". The database only lets in students who may see the
 * croft, and the names come from it too (public.croft_names), not from what clients announce.
 */
export function useCroftPresence(ownerId: string | null, enabled: boolean): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    setNames([]);
    if (!enabled) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const me = actingId(data.user);
      if (cancelled || !me) return;
      // Private channels are checked against the student's own session
      await supabase.realtime.setAuth();
      const live = supabase.channel(`croft:${ownerId ?? me}`, { config: { private: true, presence: { key: me } } });
      channel = live;
      live.on('presence', { event: 'sync' }, async () => {
        const ids = Object.keys(live.presenceState()).filter((id) => id !== me);
        if (ids.length === 0) {
          if (!cancelled) setNames([]);
          return;
        }
        const { data: rows } = await supabase.rpc('croft_names', { ids });
        if (!cancelled) setNames((rows ?? []).map((r) => r.nickname));
      });
      live.subscribe((status) => {
        if (status === 'SUBSCRIBED') void live.track({});
      });
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [ownerId, enabled]);

  return names;
}

/** Lets any profile card open someone's croft ("Visit croft"), wherever it sits on Home */
export const CroftVisitContext = createContext<((personId: string) => void) | null>(null);
export const useVisitCroft = () => useContext(CroftVisitContext);
