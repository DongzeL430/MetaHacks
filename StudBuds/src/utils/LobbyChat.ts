import { useCallback, useEffect, useRef, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * Chat limits. The database enforces these (supabase/migrations/…_lobby_chat.sql);
 * the browser checks them too, just to give a friendly message before sending.
 * Keep the two in sync.
 */
export const CHAT_LIMITS = {
  maxLength: 500,
  /** At most burstCount messages in burstWindowMs */
  burstCount: 5,
  burstWindowMs: 10_000,
  /** At most minuteCount messages per minute */
  minuteCount: 20,
} as const;

export interface LobbyChatMessage {
  id: number;
  lobby_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  /** Shown right away while it's being sent, then replaced by the saved message */
  pending?: boolean;
}

/**
 * idle: no lobby. loading: fetching history. live: up to date and streaming.
 * reconnecting: connection dropped; history is refetched when it's back. error: couldn't load.
 */
export type ChatStatus = 'idle' | 'loading' | 'live' | 'reconnecting' | 'error';

const COLUMNS = 'id, lobby_id, sender_id, body, created_at';
/** How many recent messages to load when a chat opens */
const HISTORY = 50;

const byTime = (a: LobbyChatMessage, b: LobbyChatMessage) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id - b.id;

/** Turns database errors into something a student can act on */
function describeChatError(error: PostgrestError): { text: string; retryAfter?: number } {
  const message = error.message ?? '';
  if (message.startsWith('rate_limited')) {
    const seconds = /retry_after=(\d+)/.exec(error.details ?? '');
    return { text: 'Slow down a little.', retryAfter: seconds ? Number(seconds[1]) : 10 };
  }
  if (error.code === '42501') return { text: 'Only people in this lobby can use its chat.' };
  // Not a real lobby id in the database (e.g. sample lobbies), or the lobby was closed
  if (error.code === '22P02' || error.code === '23503') return { text: 'Chat isn’t available for this lobby yet.' };
  if (error.code === '23514') return { text: `Messages can be 1 to ${CHAT_LIMITS.maxLength} characters.` };
  if (!error.code) return { text: 'Can’t reach the chat right now. Check your connection and try again.' };
  return { text: 'Something went wrong. Try again.' };
}

/**
 * Live chat for one lobby through Supabase Realtime.
 * Loads the latest messages, streams new ones as they're posted, and refills anything
 * missed after a dropped connection. Pass null when no chat is open.
 */
export function useLobbyChat(lobbyId: string | null) {
  const [messages, setMessages] = useState<LobbyChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [myId, setMyId] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  /** When this user's recent messages were sent, for the friendly early limit check */
  const sentTimes = useRef<number[]>([]);

  // Who's signed in, so the window can tell your messages apart
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setMyId(session?.user.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  /** Adds saved messages, skipping ones already shown and replacing their "sending…" copies */
  const merge = useCallback((incoming: LobbyChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const saved = new Map<number, LobbyChatMessage>();
      for (const m of prev) if (!m.pending) saved.set(m.id, m);
      for (const m of incoming) saved.set(m.id, m);
      const stillPending = prev.filter(
        (p) => p.pending && !incoming.some((m) => m.sender_id === p.sender_id && m.body === p.body),
      );
      return [...[...saved.values()].sort(byTime), ...stillPending];
    });
  }, []);

  // Subscribe first, then load history once the subscription is live, so nothing posted in
  // between is missed. This also runs again after a reconnect, refilling any gap.
  useEffect(() => {
    setMessages([]);
    setLoadError('');
    setSendError('');
    if (!lobbyId) {
      setStatus('idle');
      return;
    }
    setStatus('loading');
    let cancelled = false;

    const loadLatest = async () => {
      const { data, error } = await supabase
        .from('lobby_messages')
        .select(COLUMNS)
        .eq('lobby_id', lobbyId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(HISTORY);
      if (cancelled) return;
      if (error) {
        setStatus('error');
        setLoadError(describeChatError(error).text);
        return;
      }
      merge(((data ?? []) as LobbyChatMessage[]).reverse());
      setStatus('live');
    };

    const channel = supabase
      .channel(`lobby-chat:${lobbyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lobby_messages', filter: `lobby_id=eq.${lobbyId}` },
        (payload) => {
          if (!cancelled) merge([payload.new as LobbyChatMessage]);
        },
      )
      .subscribe((state) => {
        if (cancelled) return;
        if (state === 'SUBSCRIBED') void loadLatest();
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
          setStatus((s) => (s === 'error' ? s : 'reconnecting'));
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [lobbyId, merge]);

  // Count down a cooldown after hitting a limit, then clear its message
  useEffect(() => {
    setNow(Date.now());
    if (cooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= cooldownUntil) {
        window.clearInterval(timer);
        setSendError('');
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const startCooldown = (ms: number) => {
    setCooldownUntil(Date.now() + ms);
    setSendError('You’re sending messages quickly. Take a breath and try again in a moment.');
  };

  /** Sends a message. Returns false if it wasn't sent, so the window can put the text back. */
  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const body = text.trim();
      if (!lobbyId || !myId || !body) return false;
      if (body.length > CHAT_LIMITS.maxLength) {
        setSendError(`Messages can be up to ${CHAT_LIMITS.maxLength} characters.`);
        return false;
      }

      // Friendly early check, mirroring the database's limits (the database still decides)
      const t = Date.now();
      sentTimes.current = sentTimes.current.filter((s) => t - s < 60_000);
      const inBurst = sentTimes.current.filter((s) => t - s < CHAT_LIMITS.burstWindowMs);
      if (inBurst.length >= CHAT_LIMITS.burstCount) {
        startCooldown(inBurst[0] + CHAT_LIMITS.burstWindowMs - t);
        return false;
      }
      if (sentTimes.current.length >= CHAT_LIMITS.minuteCount) {
        startCooldown(sentTimes.current[0] + 60_000 - t);
        return false;
      }
      sentTimes.current.push(t);
      setSendError('');

      // Show it right away; it's replaced by the saved message (from the insert or from realtime)
      const optimistic: LobbyChatMessage = {
        id: -t,
        lobby_id: lobbyId,
        sender_id: myId,
        body,
        created_at: new Date(t).toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);

      const { data, error } = await supabase
        .from('lobby_messages')
        .insert({ lobby_id: lobbyId, body })
        .select(COLUMNS)
        .single();

      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      if (error) {
        const problem = describeChatError(error);
        if (problem.retryAfter) startCooldown(problem.retryAfter * 1000);
        else setSendError(problem.text);
        return false;
      }
      merge([data as LobbyChatMessage]);
      return true;
    },
    [lobbyId, myId, merge],
  );

  return {
    messages,
    status,
    /** Why the history couldn't load (status 'error') */
    loadError,
    /** Why the last message couldn't be sent */
    sendError,
    /** The signed-in user's id, to mark your own messages */
    myId,
    /** Seconds left before sending is allowed again after hitting a limit */
    cooldownSeconds: Math.max(0, Math.ceil((cooldownUntil - now) / 1000)),
    send,
  };
}