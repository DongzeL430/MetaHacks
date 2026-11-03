import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ME } from '../dataFiles/StudyData';
import type { ConnectionStatus, Lobby, LobbyInvite } from '../dataFiles/StudyData';

export interface StudyState {
  lobbies: Lobby[];
  /** Connection status per person id. Anyone missing counts as 'none'. */
  connections: Record<string, ConnectionStatus>;
  /** Lobby invites the user sent (inviterId ME) or got (inviteeId ME) */
  invites: LobbyInvite[];
}

/** Everything the user can do. Each one is also passed to onAction, so a backend can mirror it. */
export type StudyAction =
  | { type: 'host'; lobby: Lobby }
  | { type: 'close-lobby'; lobbyId: string }
  | { type: 'lock-lobby'; lobbyId: string }
  | { type: 'unlock-lobby'; lobbyId: string }
  | { type: 'request-join'; lobbyId: string }
  | { type: 'cancel-join'; lobbyId: string }
  | { type: 'leave'; lobbyId: string }
  | { type: 'accept-join'; lobbyId: string; personId: string }
  | { type: 'decline-join'; lobbyId: string; personId: string }
  | { type: 'kick'; lobbyId: string; personId: string }
  /** Invites one of your connections to a lobby you're in */
  | { type: 'invite'; lobbyId: string; personId: string }
  | { type: 'accept-invite'; lobbyId: string }
  | { type: 'decline-invite'; lobbyId: string }
  | { type: 'connect'; personId: string }
  | { type: 'cancel-connect'; personId: string }
  | { type: 'accept-connect'; personId: string }
  | { type: 'decline-connect'; personId: string }
  /** Ends a connection, from either side */
  | { type: 'remove-connect'; personId: string };

export type StudyDispatch = (action: StudyAction) => void;

/** How the current user relates to a lobby */
export type LobbyRole = 'host' | 'member' | 'requested' | 'locked' | 'full' | 'open';

export function roleIn(lobby: Lobby): LobbyRole {
  if (lobby.hostId === ME) return 'host';
  if (lobby.memberIds.includes(ME)) return 'member';
  if (lobby.requestIds.includes(ME)) return 'requested';
  // Not taking new requests: same as full for everyone outside it
  if (lobby.locked) return 'locked';
  if (lobby.memberIds.length >= lobby.maxSize) return 'full';
  return 'open';
}

export function studyReducer(state: StudyState, action: StudyAction): StudyState {
  const editLobby = (id: string, edit: (lobby: Lobby) => Lobby, invites = state.invites): StudyState => ({
    ...state,
    invites,
    lobbies: state.lobbies.map((l) => (l.id === id ? edit(l) : l)),
  });
  const setConnection = (personId: string, status: ConnectionStatus): StudyState => ({
    ...state,
    connections: { ...state.connections, [personId]: status },
  });
  const without = (list: string[], id: string) => list.filter((x) => x !== id);

  switch (action.type) {
    case 'host':
      return { ...state, lobbies: [action.lobby, ...state.lobbies] };
    case 'close-lobby':
      return { ...state, lobbies: state.lobbies.filter((l) => l.id !== action.lobbyId) };
    case 'lock-lobby':
    case 'unlock-lobby':
      // Only the host can lock or unlock their own lobby
      return editLobby(action.lobbyId, (l) =>
        l.hostId === ME ? { ...l, locked: action.type === 'lock-lobby' } : l,
      );
    case 'request-join':
      return editLobby(action.lobbyId, (l) =>
        roleIn(l) === 'open' ? { ...l, requestIds: [...l.requestIds, ME] } : l,
      );
    case 'cancel-join':
      return editLobby(action.lobbyId, (l) => ({ ...l, requestIds: without(l.requestIds, ME) }));
    case 'leave':
      return editLobby(action.lobbyId, (l) =>
        l.hostId === ME ? l : { ...l, memberIds: without(l.memberIds, ME) },
      );
    case 'accept-join':
      return editLobby(action.lobbyId, (l) =>
        l.memberIds.length >= l.maxSize || !l.requestIds.includes(action.personId)
          ? l
          : {
              ...l,
              memberIds: [...l.memberIds, action.personId],
              requestIds: without(l.requestIds, action.personId),
            },
      );
    case 'decline-join':
      return editLobby(action.lobbyId, (l) => ({ ...l, requestIds: without(l.requestIds, action.personId) }));
    case 'kick':
      // Only the host can remove someone, and never themselves
      return editLobby(action.lobbyId, (l) =>
        l.hostId === ME && action.personId !== ME ? { ...l, memberIds: without(l.memberIds, action.personId) } : l,
      );
    case 'invite':
      if (state.invites.some((i) => i.lobbyId === action.lobbyId && i.inviteeId === action.personId)) return state;
      return { ...state, invites: [...state.invites, { lobbyId: action.lobbyId, inviterId: ME, inviteeId: action.personId }] };
    case 'accept-invite': {
      const invite = receivedInvite(state, action.lobbyId);
      if (!invite) return state;
      const invites = state.invites.filter((i) => i !== invite);
      // The host's invite lets you straight in; a member's becomes a join request
      return editLobby(action.lobbyId, (l) => {
        const role = roleIn(l);
        if (role === 'host' || role === 'member' || role === 'requested') return l;
        return invite.inviterId === l.hostId
          ? { ...l, memberIds: [...l.memberIds, ME] }
          : { ...l, requestIds: [...l.requestIds, ME] };
      }, invites);
    }
    case 'decline-invite':
      return { ...state, invites: state.invites.filter((i) => !(i.lobbyId === action.lobbyId && i.inviteeId === ME)) };
    case 'connect':
      return setConnection(action.personId, 'sent');
    case 'cancel-connect':
    case 'decline-connect':
    case 'remove-connect':
      return setConnection(action.personId, 'none');
    case 'accept-connect':
      return setConnection(action.personId, 'connected');
  }
}

/** The invite the user got to this lobby, if any */
export const receivedInvite = (state: StudyState, lobbyId: string) =>
  state.invites.find((i) => i.lobbyId === lobbyId && i.inviteeId === ME);

/**
 * Invites the user got and can still answer: the lobby is visible, and they aren't already in it
 * or waiting on it
 */
export function pendingInvites(state: StudyState): { invite: LobbyInvite; lobby: Lobby }[] {
  const byId = new Map(state.lobbies.map((l) => [l.id, l]));
  return state.invites.flatMap((invite) => {
    const lobby = invite.inviteeId === ME ? byId.get(invite.lobbyId) : undefined;
    if (!lobby) return [];
    const role = roleIn(lobby);
    return role === 'host' || role === 'member' || role === 'requested' ? [] : [{ invite, lobby }];
  });
}

/** The reducer plus one internal action: replacing everything with the backend's copy */
const withSync = (state: StudyState, action: StudyAction | { type: 'sync'; state: StudyState }): StudyState =>
  action.type === 'sync' ? action.state : studyReducer(state, action);

/**
 * Lobby + connection state. Updates locally right away, and passes every action to onAction
 * (e.g. to send it to your backend). When `server` is given, each new copy of it replaces the
 * local state, so what the backend says (including other students' changes) wins.
 */
export function useStudyState(initial: StudyState, onAction?: (action: StudyAction) => void, server?: StudyState) {
  const [state, localDispatch] = useReducer(withSync, initial);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  // Each new copy from the backend replaces what's shown; it isn't passed to onAction
  useEffect(() => {
    if (server) localDispatch({ type: 'sync', state: server });
  }, [server]);

  const dispatch = useCallback<StudyDispatch>((action) => {
    localDispatch(action);
    onActionRef.current?.(action);
  }, []);

  return [state, dispatch] as const;
}