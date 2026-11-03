import { useCallback, useEffect, useRef, useState } from 'react';
import { callFunction } from './edgeFunctions.ts';
import { avatarUrlOf } from './profile.ts';
import { rangesToSlots, slotsToRange } from './slots.ts';
import { listenerTopic, supabase } from './supabase.ts';
import { ME } from '../dataFiles/StudyData';
import type { ConnectionStatus, Lobby, Person } from '../dataFiles/StudyData';
import type { StudyAction, StudyState } from '../utils/StudyState';

/** After a burst of changes (a request, then an accept), reload once */
const RELOAD_DELAY_MS = 250;

const EMPTY: StudyState = { lobbies: [], connections: {}, invites: [] };

/** What to tell a student when the database turns an action down */
function messageFor(error: { message: string; code?: string }): string {
  switch (error.code) {
    case 'P0001':
      // Written for students ("This session is full.")
      return error.message;
    case '42501':
      // Not allowed any more: the session closed, they were removed, the person left
      return 'That isn’t possible any more. The lists are up to date now.';
    case '23505':
      return 'That’s already done.';
    case undefined:
    case '':
      // No database code: the request never got an answer
      return 'That didn’t go through. Check your connection and try again.';
    default:
      return 'That didn’t go through. Try again in a moment.';
  }
}

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
  // Each load is numbered: a slow one that finishes after a newer one is dropped
  const loadSeq = useRef(0);
  // Until the first load works, it's tried again after 2, 4, 8… seconds (Home waits for it)
  const loaded = useRef(false);
  const retryTimer = useRef<number | undefined>(undefined);
  const retries = useRef(0);

  const load = useCallback(async () => {
    const me = myId.current;
    if (!me) return;
    const seq = ++loadSeq.current;
    const local = (id: string) => (id === me ? ME : id);

    const [lobbies, members, cards, links, matches, invites, community] = await Promise.all([
      supabase
        .from('lobbies')
        .select('id, host_id, subject, max_size, location, weekday, starts_at, ends_at, locked, university_domain'),
      supabase.from('lobby_members').select('lobby_id, user_id, role, joined_at').order('joined_at'),
      supabase.rpc('lobby_people'),
      supabase.from('connections').select('requester_id, addressee_id, status'),
      // Best fit first: the host's courses, habits and quick picks next to this student's
      supabase.rpc('lobby_matches'),
      supabase.from('lobby_invites').select('lobby_id, inviter_id, invitee_id'),
      // The student's school and the ones linked to it, for the "Only my school" filter
      supabase.rpc('my_community'),
    ]);
    if (seq !== loadSeq.current) return;
    if (lobbies.error || members.error || cards.error || links.error) {
      setError('Couldn’t load lobbies right now. Check your connection.');
      if (!loaded.current) {
        window.clearTimeout(retryTimer.current);
        retryTimer.current = window.setTimeout(() => void load(), Math.min(20_000, 2000 * 2 ** retries.current++));
      }
      return;
    }
    loaded.current = true;
    retries.current = 0;
    // Without the ranking, lobbies still load, just unranked
    // Without the school list, every lobby counts as the student's own school (nothing hidden)
    const mySchools = community.error ? null : new Set<string>(community.data ?? []);
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
      invites: (invites.data ?? []).map((i) => ({
        lobbyId: i.lobby_id,
        inviterId: local(i.inviter_id),
        inviteeId: local(i.invitee_id),
      })),
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
          school: l.university_domain,
          atMySchool: !mySchools || mySchools.has(l.university_domain),
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
    // The saved session says who's signed in without a network call (RequireAuth already checked it)
    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (cancelled || !user) return;
      myId.current = user.id;
      void load();
      // Any change to a lobby or its members reloads the lists (each student only gets changes
      // they're allowed to see). A fresh topic each time, so a quick close and reopen can't land
      // on a channel that's still leaving.
      channel = supabase
        .channel(listenerTopic('study-lobbies'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lobbies' }, reloadSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_members' }, reloadSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, reloadSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_invites' }, reloadSoon)
        .subscribe((status) => {
          // Back after a dropped connection: catch up on anything missed
          if (status === 'SUBSCRIBED') reloadSoon();
        });
    });
    return () => {
      cancelled = true;
      window.clearTimeout(reloadTimer.current);
      window.clearTimeout(retryTimer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [load, reloadSoon]);

  // The same function every render, so the 6-second timer that clears an error isn't restarted
  // by every reload
  const clearError = useCallback(() => setError(''), []);

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
        case 'kick':
          result = await supabase.rpc('kick_from_lobby', { lobby_id: action.lobbyId, student: toId(action.personId) });
          break;
        case 'invite':
          result = await supabase.rpc('invite_to_lobby', { lobby_id: action.lobbyId, person: toId(action.personId) });
          break;
        case 'accept-invite':
        case 'decline-invite':
          result = await supabase.rpc('answer_invite', {
            lobby_id: action.lobbyId,
            accept: action.type === 'accept-invite',
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
        case 'remove-connect':
          result = await supabase.rpc('remove_connection', { person: toId(action.personId) });
          break;
        case 'block':
          result = await supabase.rpc('block_student', { person: toId(action.personId) });
          break;
      }

      if (result?.error) setError(messageFor(result.error));
      reloadSoon();
    },
    [reloadSoon],
  );

  /** refresh: loads the newest lobbies now (the Refresh button), on top of the live updates */
  return { ready, state, people, error, clearError, act, refresh: load };
}
