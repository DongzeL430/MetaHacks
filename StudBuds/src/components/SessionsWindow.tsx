import { useId, useState } from 'react';
import AppWindow, { WINDOW_ACCENTS } from './AppWindow';
import type { InitialSize } from './AppWindow';
import LobbyRow from './LobbyRow';
import ViewTabs, { viewPanelId, viewTabId } from './ViewTabs';
import type { Lobby, LobbyInvite, Person } from '../dataFiles/StudyData';
import { roleIn } from '../utils/StudyState';
import type { StudyDispatch } from '../utils/StudyState';

interface SessionsWindowProps {
  id: string;
  open: boolean;
  onClose: () => void;
  lobbies: Lobby[];
  people: Map<string, Person>;
  openTabIds: string[];
  /** Opens the lobby in the lobby tabs window (the same page as from Study Lobbies) */
  onOpenLobby: (lobbyId: string) => void;
  /** Invites waiting for the user's answer (see pendingInvites) */
  invites?: { invite: LobbyInvite; lobby: Lobby }[];
  dispatch?: StudyDispatch;
}

/** Opening size for smaller side windows (e.g. Chat), as a share of the desk */
export const LIST_WINDOW_SIZE: InitialSize = ({ width, height }) => {
  const screen = window.innerWidth;
  if (screen >= 1280) return { width: width * 0.45, height: height * 0.75 };
  if (screen >= 768) return { width: width * 0.65, height: height * 0.75 };
  return { width: width * 0.96, height: height * 0.92 };
};

type View = 'hosting' | 'joined' | 'requested' | 'invites';

const VIEWS: { id: View; label: string; empty: string }[] = [
  { id: 'hosting', label: 'Hosting', empty: 'You’re not hosting a session. You can host one from Study Lobbies.' },
  { id: 'joined', label: 'Joined', empty: 'You haven’t joined any sessions yet.' },
  { id: 'requested', label: 'Requested', empty: 'No requests waiting on a host.' },
  { id: 'invites', label: 'Invites', empty: 'No invites right now. When a connection invites you to a session, it shows up here.' },
];

const ROLE_OF: Record<Exclude<View, 'invites'>, 'host' | 'member' | 'requested'> = {
  hosting: 'host',
  joined: 'member',
  requested: 'requested',
};

/**
 * Your own sessions, split into views like a nav bar: Hosting, Joined, Requested, and Invites
 * (sessions your connections invited you to, with a red dot while any wait for an answer).
 * Click a session to open its full page in the lobby tabs window.
 */
export default function SessionsWindow({
  id,
  open,
  onClose,
  lobbies,
  people,
  openTabIds,
  onOpenLobby,
  invites = [],
  dispatch,
}: SessionsWindowProps) {
  const baseId = useId();
  const listFor = (view: View) =>
    view === 'invites' ? invites.map((i) => i.lobby) : lobbies.filter((l) => roleIn(l) === ROLE_OF[view]);
  const inviteFor = (lobbyId: string) => invites.find((i) => i.lobby.id === lobbyId)?.invite;

  // Starts on invites waiting for an answer, or else the first view that has something in it
  const [view, setView] = useState<View>(() =>
    invites.length > 0 ? 'invites' : (VIEWS.find((v) => listFor(v.id).length > 0)?.id ?? 'hosting'),
  );
  const current = VIEWS.find((v) => v.id === view)!;
  const list = listFor(view);

  const noteFor = (lobby: Lobby) => {
    if (view === 'hosting') {
      const n = lobby.requestIds.length;
      const waiting = n > 0 ? `${n} ${n === 1 ? 'person' : 'people'} waiting to join` : '';
      if (lobby.locked) return waiting ? `Locked · ${waiting}` : 'Locked: not taking new requests';
      return waiting || undefined;
    }
    if (view === 'requested') return 'Waiting for the host to let you in';
    if (view === 'invites') {
      const invite = inviteFor(lobby.id);
      const who = invite ? people.get(invite.inviterId)?.name ?? 'Someone' : 'Someone';
      return invite?.inviterId === lobby.hostId ? `${who} (the host) invited you` : `${who} invited you`;
    }
    return undefined;
  };

  // Accept: a host's invite joins straight away; a member's sends the host a join request
  const actionsFor = (lobby: Lobby) => {
    if (view !== 'invites' || !dispatch) return undefined;
    const fromHost = inviteFor(lobby.id)?.inviterId === lobby.hostId;
    const isFull = lobby.memberIds.length >= lobby.maxSize;
    const blocked = isFull || (!fromHost && lobby.locked);
    return (
      <>
        <button
          type="button"
          onClick={() => dispatch({ type: 'decline-invite', lobbyId: lobby.id })}
          aria-label={`Decline the invite to ${lobby.subject}`}
          className="px-3 py-0.5 text-sm"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'accept-invite', lobbyId: lobby.id })}
          disabled={blocked}
          title={isFull ? 'This session is full' : blocked ? 'The host isn’t taking new requests' : undefined}
          aria-label={`${fromHost ? 'Join' : 'Ask to join'} ${lobby.subject}`}
          className="px-3 py-0.5 text-sm"
        >
          {fromHost ? 'Join' : 'Ask to join'}
        </button>
      </>
    );
  };

  return (
    <AppWindow
      id={id}
      title="Sessions"
      tourTarget="sessions-window"
      accent={WINDOW_ACCENTS.peach}
      info="Every session you’re part of: ones you host, ones you’ve joined, ones waiting for a host to let you in, and invites from your connections. Click one to open its page."
      open={open}
      onClose={onClose}
      controls={{ close: 'enabled', fullscreen: 'enabled' }}
      // No initialSize: opened from the nav bar, it takes as much room as the current layout allows
      minWidth={300}
      minHeight={260}
      bodyClassName="p-3 flex flex-col gap-3"
    >
      <ViewTabs
        baseId={baseId}
        label="Your sessions"
        tabs={VIEWS.map((v) => ({
          id: v.id,
          label: v.label,
          count: listFor(v.id).length,
          dot: v.id === 'invites' && invites.length > 0,
        }))}
        value={view}
        onChange={setView}
      />

      {/* VIEW: keyed so switching views fades the new list in */}
      <div
        key={view}
        role="tabpanel"
        id={viewPanelId(baseId)}
        aria-labelledby={viewTabId(baseId, view)}
        className="flex-1 min-h-0 flex flex-col motion-safe:transition-opacity motion-safe:duration-200 starting:opacity-0"
      >
        {list.length === 0 ? (
          <p className="m-auto text-center text-sm opacity-70">{current.empty}</p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {list.map((lobby) => (
              <LobbyRow
                key={lobby.id}
                lobby={lobby}
                people={people}
                isOpenTab={openTabIds.includes(lobby.id)}
                onOpen={onOpenLobby}
                note={noteFor(lobby)}
                actions={actionsFor(lobby)}
              />
            ))}
          </ul>
        )}
      </div>
    </AppWindow>
  );
}