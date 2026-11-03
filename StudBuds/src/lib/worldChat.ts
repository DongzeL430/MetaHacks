import { useCallback, useEffect, useRef, useState } from 'react';
import { CROPS } from '../dataFiles/Croft';
import { ME } from '../dataFiles/StudyData';
import type { Lobby, Person } from '../dataFiles/StudyData';
import { supabase } from './supabase.ts';

/*
 * The live activity feed at the bottom right of Home, like a game's world chat. Lines appear when:
 *  - a new session is hosted that fits you: a course you want help with or are taking, or a host
 *    you share most quick picks with (from public.lobby_matches, through Home's live lobby list)
 *  - someone visits your croft (public.croft_visits, once a day per visitor)
 *  - someone waters your croft, or thanks you for watering theirs (public.croft_help)
 * Everything arrives by Realtime push the moment it happens: no polling.
 */

export interface ChatLine {
  id: string;
  text: string;
}

/** How long a line stays (it fades out at the end, see .chat-line in index.css) */
const LINE_MS = 10_000;
const MAX_LINES = 6;
/** The same line twice within this long is shown once */
const REPEAT_MS = 60_000;
/** A session is only news for this long after it first shows up (its course may link a moment later) */
const NEW_SESSION_MS = 5 * 60_000;

const COURSE_REASONS: Record<string, string> = {
  'Covers a course you want help with': 'a course you want help with',
  'Covers a course you’re taking': 'a course you’re taking',
};

/** Why a new session is worth a line, or null if it isn't close enough to the student's needs */
function sessionNews(lobby: Lobby): string | null {
  const reasons = lobby.match?.reasons ?? [];
  for (const r of reasons) if (COURSE_REASONS[r]) return COURSE_REASONS[r];
  for (const r of reasons) {
    const picks = r.match(/^You agreed on (\d+) of (\d+) quick picks$/);
    if (picks && Number(picks[1]) >= 6 && Number(picks[1]) / Number(picks[2]) >= 0.75) return 'and you have a lot in common';
  }
  return null;
}

const cropName = (key: unknown) => (typeof key === 'string' && key in CROPS ? CROPS[key as keyof typeof CROPS].name.toLowerCase() : 'crops');

export function useWorldChat(lobbies: Lobby[], people: Map<string, Person>) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const recent = useRef(new Map<string, number>());
  const names = useRef(new Map<string, string>());

  const say = useCallback((text: string) => {
    const now = Date.now();
    const last = recent.current.get(text);
    if (last && now - last < REPEAT_MS) return;
    recent.current.set(text, now);
    const id = `${now}-${Math.random().toString(36).slice(2, 7)}`;
    setLines((current) => [...current, { id, text }].slice(-MAX_LINES));
    window.setTimeout(() => setLines((current) => current.filter((l) => l.id !== id)), LINE_MS);
  }, []);

  /** A student's nickname, from the database (public.croft_names), never from the event itself */
  const nameOf = useCallback(async (id: string) => {
    const known = names.current.get(id);
    if (known) return known;
    const { data } = await supabase.rpc('croft_names', { ids: [id] });
    const name = data?.[0]?.nickname;
    if (name) names.current.set(id, name);
    return name ?? null;
  }, []);

  // Croft visits, help and thank-yous, pushed by Realtime (each student only gets their own rows)
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const thanked = new Set<number>();
    void supabase.auth.getUser().then(({ data }) => {
      const me = data.user?.id;
      if (cancelled || !me) return;
      channel = supabase
        .channel('world-chat')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'croft_visits', filter: `owner_id=eq.${me}` }, async (e) => {
          const name = await nameOf(String(e.new.visitor_id));
          if (name && !cancelled) say(`${name} is visiting your croft`);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'croft_help', filter: `owner_id=eq.${me}` }, async (e) => {
          const name = await nameOf(String(e.new.helper_id));
          if (name && !cancelled) say(`${name} watered your ${cropName(e.new.crop)}`);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'croft_help', filter: `helper_id=eq.${me}` }, async (e) => {
          const helpId = Number(e.new.id);
          if (!e.new.thanked_at || thanked.has(helpId)) return;
          thanked.add(helpId);
          const name = await nameOf(String(e.new.owner_id));
          if (name && !cancelled) say(`${name} thanked you for watering their ${cropName(e.new.crop)}`);
        })
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [nameOf, say]);

  // New sessions that fit you, from Home's live lobby list. The ones already there when Home
  // opens aren't news (Home only shows once the list has loaded, so an empty first list is real).
  const seen = useRef<Map<string, { at: number; told: boolean }> | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (seen.current === null) {
      seen.current = new Map(lobbies.map((l) => [l.id, { at: now, told: true }]));
      return;
    }
    for (const lobby of lobbies) {
      if (lobby.hostId === ME) continue;
      let entry = seen.current.get(lobby.id);
      if (!entry) {
        entry = { at: now, told: false };
        seen.current.set(lobby.id, entry);
      }
      if (entry.told || now - entry.at > NEW_SESSION_MS) continue;
      const why = sessionNews(lobby);
      if (!why) continue;
      entry.told = true;
      const host = people.get(lobby.hostId)?.name ?? 'Someone';
      say(`${host} is hosting ${lobby.subject}, ${why}`);
    }
  }, [lobbies, people, say]);

  return lines;
}
