import { useCallback, useReducer, useRef } from 'react';
import { ME } from '../dataFiles/StudyData';
import type { ConnectionStatus, Lobby } from '../dataFiles/StudyData';

export interface StudyState {
  lobbies: Lobby[];
  /** Connection status per person id. Anyone missing counts as 'none'. */
  connections: Record<string, ConnectionStatus>;
}

/** Everything the user can do. Each one is also passed to onAction, so a backend can mirror it. */
export type StudyAction =
  | { type: 'host'; lobby: Lobby }
  | { type: 'close-lobby'; lobbyId: string }
  | { type: 'request-join'; lobbyId: string }
  | { type: 'cancel-join'; lobbyId: string }
  | { type: 'leave'; lobbyId: string }
  | { type: 'accept-join'; lobbyId: string; personId: string }
  | { type: 'decline-join'; lobbyId: string; personId: string }
  | { type: 'connect'; personId: string }
  | { type: 'cancel-connect'; personId: string }
  | { type: 'accept-connect'; personId: string }
  | { type: 'decline-connect'; personId: string };

export type StudyDispatch = (action: StudyAction) => void;

/** How the current user relates to a lobby */
export type LobbyRole = 'host' | 'member' | 'requested' | 'full' | 'open';

export function roleIn(lobby: Lobby): LobbyRole {
  if (lobby.hostId === ME) return 'host';
  if (lobby.memberIds.includes(ME)) return 'member';
  if (lobby.requestIds.includes(ME)) return 'requested';
  if (lobby.memberIds.length >= lobby.maxSize) return 'full';
  return 'open';
}

export function studyReducer(state: StudyState, action: StudyAction): StudyState {
  const editLobby = (id: string, edit: (lobby: Lobby) => Lobby): StudyState => ({
    ...state,
    lobbies: state.lobbies.map((l) => (l.id === id ? edit(l) : l)),
  });
  const setConnection = (personId: string, status: ConnectionStatus): StudyState => ({
    ...state,
    connections: { ...state.connections, [personId]: status },
  });
  const without = (list: string[], id: string) => list.filter((x) => x !== id);

  switch (action.type) {
    case 'host':
      // One hosted lobby at a time
      if (state.lobbies.some((l) => l.hostId === ME)) return state;
      return { ...state, lobbies: [action.lobby, ...state.lobbies] };
    case 'close-lobby':
      return { ...state, lobbies: state.lobbies.filter((l) => l.id !== action.lobbyId) };
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
    case 'connect':
      return setConnection(action.personId, 'sent');
    case 'cancel-connect':
    case 'decline-connect':
      return setConnection(action.personId, 'none');
    case 'accept-connect':
      return setConnection(action.personId, 'connected');
  }
}

/**
 * Lobby + connection state. Updates locally right away, and passes every action to onAction
 * (e.g. to send it to your backend).
 */
export function useStudyState(initial: StudyState, onAction?: (action: StudyAction) => void) {
  const [state, localDispatch] = useReducer(studyReducer, initial);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const dispatch = useCallback<StudyDispatch>((action) => {
    localDispatch(action);
    onActionRef.current?.(action);
  }, []);

  return [state, dispatch] as const;
}