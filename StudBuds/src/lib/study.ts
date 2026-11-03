import { useCallback, useEffect, useRef, useState } from 'react';
import { callFunction } from './edgeFunctions.ts';
import { avatarUrlOf } from './profile.ts';
import { rangesToSlots, slotsToRange } from './slots.ts';
import { supabase } from './supabase.ts';
import { ME } from '../dataFiles/StudyData';
import type { ConnectionStatus, Lobby, Person } from '../dataFiles/StudyData';
import type { StudyAction, StudyState } from '../utils/StudyState';

/** After a burst of changes (a request, then an accept), reload once */
const RELOAD_DELAY_MS = 250;

const EMPTY: StudyState = { lobbies: [], connections: {} };

/**
 * Lobbies at the student's school, the people in them, connections, and every lobby and
 * connection action, through Supabase.
 * State comes from the database and stays live with Realtime; Home updates right away on a click
 * and then settles on what the database says. The signed-in student appears as ME in lists.
 */
export function useStudyData() {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<StudyState>(EMPTY);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState('');
  const myId = useRef<string | null>(null);
  const reloadTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    const me = myId.current;
    if (!me) return;
    const local = (id: string) => (id === me ? ME : id);

    const [lobbies, members, cards, links, matches] = await Promise.all([
      supabase.from('lobbies').select('id, host_id, subject, max_size, location, weekday, starts_at, ends_at, locked'),
      supabase.from('lobby_members').select('lobby_id, user_id, role, joined_at').order('joined_at'),
      supabase.rpc('lobby_people'),
      supabase.from('connections').select('requester_id, addressee_id, status'),
      // Best fit first: the host's courses, habits and quick picks next to this student's
      supabase.rpc('lobby_matches'),
    ]);
    if (lobbies.error || members.error || cards.error || links.error) {
      setError('Couldn’t load lobbies right now. Check your connection.');
      return;
    }
    // Without the ranking, lobbies still load, just unranked
    const matchOf = new Map((matches.data ?? []).map((m) => [m.lobby_id, { place: m.place, reasons: m.reasons ?? [] }]));

    // Friend-request style statuses, from this student's side. A request they sent stays "sent"
    // even if it was declined: the database never tells the sender.
    const connections: Record<string, ConnectionStatus> = {};
    for (const c of links.data) {
      const sent = c.requester_id === me;
      connections[sent ? c.addressee_id : c.requester_id] =
        c.status === 'connected' ? 'connected' : sent ? 'sent' : 'received';
    }

    setState(() => ({
      connections,
      lobbies: lobbies.data.map((l): Lobby => {
        const rows = members.data.filter((m) => m.lobby_id === l.id);
        const joined = rows.filter((m) => m.role === 'member' && m.user_id !== l.host_id).map((m) => local(m.user_id));
        return {
          id: l.id,
          hostId: local(l.host_id),
          subject: l.subject,
          maxSize: l.max_size,
          memberIds: [local(l.host_id), ...joined],
          requestIds: rows.filter((m) => m.role === 'requested').map((m) => local(m.user_id)),
          timeSlots: rangesToSlots([{ weekday: l.weekday, starts_at: l.starts_at, ends_at: l.ends_at }]),
          location: l.location,
          locked: l.locked,
          match: matchOf.get(l.id),
        };
      }),
    }));
    setPeople(
      cards.data.map(
        (p): Person => ({
          id: p.id,
          name: p.nickname,
          avatar: avatarUrlOf(p.avatar_path),
          seekingHelpWith: p.seeking_help_with,
          coursesTaken: p.courses_taken,
          sharedSlots: rangesToSlots((p.shared_free as { weekday: number; starts_at: string; ends_at: string }[]) ?? []),
        }),
      ),
    );
    setReady(true);
  }, []);

  const reloadSoon = useCallback(() => {
    window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => void load(), RELOAD_DELAY_MS);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      myId.current = data.user.id;
      void load();
      // Any change to a lobby or its members reloads the lists (each student only gets changes
      // they're allowed to see)
      channel = supabase
        .channel('study-lobbies')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lobbies' }, reloadSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_members' }, reloadSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, reloadSoon)
        .subscribe((status) => {
          // Back after a dropped connection: catch up on anything missed
          if (status === 'SUBSCRIBED') reloadSoon();
        });
    });
    return () => {
      cancelled = true;
      window.clearTimeout(reloadTimer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [load, reloadSoon]);

  /** Sends one action to the database. On a refusal, shows why and settles back on the real state. */
  const act = useCallback(
    async (action: StudyAction) => {
      const toId = (id: string) => (id === ME ? myId.current! : id);
      let result: { error: { message: string; code?: string } | null } | null = null;

      switch (action.type) {
        case 'host': {
          const block = slotsToRange(action.lobby.timeSlots);
          if (!block) {
            setError('Pick one block of time on a single day.');
            break;
          }
          result = await supabase.rpc('host_lobby', {
            lobby_id: action.lobby.id,
            subject: action.lobby.subject,
            max_size: action.lobby.maxSize,
            location: action.lobby.location,
            ...block,
          });
          // A subject that doesn't name a course ("orgo midterm cram") gets one from Muse, so the
          // session ranks first for students who need that course. Free when it's already linked.
          if (!result.error) {
            callFunction('link-session', { lobbyId: action.lobby.id }).catch((err) =>
              console.warn('session not linked to a course', err),
            );
          }
          break;
        }
        case 'close-lobby':
          result = await supabase.rpc('close_lobby', { lobby_id: action.lobbyId });
          break;
        case 'lock-lobby':
        case 'unlock-lobby':
          result = await supabase.rpc('set_lobby_locked', {
            lobby_id: action.lobbyId,
            locked: action.type === 'lock-lobby',
          });
          break;
        case 'request-join':
          result = await supabase.rpc('request_join', { lobby_id: action.lobbyId });
          break;
        case 'cancel-join':
          result = await supabase.rpc('cancel_join', { lobby_id: action.lobbyId });
          break;
        case 'leave':
          result = await supabase.rpc('leave_lobby', { lobby_id: action.lobbyId });
          break;
        case 'accept-join':
        case 'decline-join':
          result = await supabase.rpc('answer_join', {
            lobby_id: action.lobbyId,
            student: toId(action.personId),
            accept: action.type === 'accept-join',
          });
          break;
        case 'connect':
          result = await supabase.rpc('connect_with', { person: toId(action.personId) });
          break;
        case 'cancel-connect':
          result = await supabase.rpc('cancel_connection_request', { person: toId(action.personId) });
          break;
        case 'accept-connect':
        case 'decline-connect':
          result = await supabase.rpc('answer_connection', {
            person: toId(action.personId),
            accept: action.type === 'accept-connect',
          });
          break;
      }

      if (result?.error) {
        // P0001 messages ("This session is full.") are written for students
        setError(
          result.error.code === 'P0001' ? result.error.message : 'That didn’t go through. Check your connection and try again.',
        );
      }
      reloadSoon();
    },
    [reloadSoon],
  );

  /** refresh: loads the newest lobbies now (the Refresh button), on top of the live updates */
  return { ready, state, people, error, clearError: () => setError(''), act, refresh: load };
}
