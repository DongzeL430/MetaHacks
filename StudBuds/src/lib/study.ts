import { useCallback, useEffect, useRef, useState } from 'react';
import { avatarUrlOf } from './profile.ts';
import { rangesToSlots, slotsToRange } from './slots.ts';
import { supabase } from './supabase.ts';
import { ME } from '../dataFiles/StudyData';
import type { Lobby, Person } from '../dataFiles/StudyData';
import type { StudyAction, StudyState } from '../utils/StudyState';

/** After a burst of changes (a request, then an accept), reload once */
const RELOAD_DELAY_MS = 250;

const EMPTY: StudyState = { lobbies: [], connections: {} };

/**
 * Lobbies at the student's school, the people in them, and every lobby action, through Supabase.
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

    const [lobbies, members, cards] = await Promise.all([
      supabase.from('lobbies').select('id, host_id, subject, max_size, location, weekday, starts_at, ends_at, locked'),
      supabase.from('lobby_members').select('lobby_id, user_id, role, joined_at').order('joined_at'),
      supabase.rpc('lobby_people'),
    ]);
    if (lobbies.error || members.error || cards.error) {
      setError('Couldn’t load lobbies right now. Check your connection.');
      return;
    }

    setState((prev) => ({
      ...prev,
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
        default:
          // Connection requests arrive with Step 4
          return;
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

  return { ready, state, people, error, clearError: () => setError(''), act };
}
