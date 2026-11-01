import { useMemo, useState } from 'react';
import { WindowLayer, useWindowManager } from './AppWindow';
import BrowserWindow from './BrowserWindow';
import ConnectionsWindow from './ConnectionsWindow';
import HostSessionWindow from './HostSessionWindow';
import LobbyBrowserWindow from './LobbyBrowserWindow';
import LobbyView from './LobbyView';
import SessionsWindow from './SessionsWindow';
import PersonAvatar from './PersonAvatar';
import { ME } from '../dataFiles/StudyData';
import type { Lobby, Person } from '../dataFiles/StudyData';
import type { StudyDispatch, StudyState } from '../utils/StudyState';

const WINDOWS = {
  browser: 'lobby-browser',
  lobbies: 'lobby-tabs',
  host: 'host-session',
  connections: 'connections',
  sessions: 'sessions',
};

const slugOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

interface StudyLayoutProps {
  /** The signed-in user, shown in lobbies they're part of */
  me: { name: string; avatar?: string };
  /** Everyone else the user can see in lobbies and connections */
  people: Person[];
  /** The user's free slots ("mon|09:30"), shown on the host form's schedule and used by lobby filters */
  myAvailability?: string[];
  /** The user's subjects (e.g. their courses), used by the lobby browser's "My subjects" filter */
  mySubjects?: string[];
  state: StudyState;
  dispatch: StudyDispatch;
  /** Lobby list window, driven by its taskbar button */
  lobbiesOpen: boolean;
  onLobbiesClose: () => void;
  /** Connections window, driven by its taskbar button */
  connectionsOpen: boolean;
  onConnectionsClose: () => void;
  /** Sessions window (lobbies you host, joined or requested), driven by its taskbar button */
  sessionsOpen: boolean;
  onSessionsClose: () => void;
}

/**
 * Every study-session window on the desk:
 *  - Study Lobbies: lobbies you could join (search, filters, host a session)
 *  - Sessions: lobbies you host, joined or asked to join
 *  - Lobbies: a browser-style window with a tab per lobby you've opened
 *  - Host a session: subject + group size form
 *  - Connections: friend-request style list
 * Render inside a WindowManagerProvider, in a desk area with `relative`.
 */
export default function StudyLayout({
  me,
  people,
  myAvailability,
  mySubjects,
  state,
  dispatch,
  lobbiesOpen,
  onLobbiesClose,
  connectionsOpen,
  onConnectionsClose,
  sessionsOpen,
  onSessionsClose,
}: StudyLayoutProps) {
  const stack = useWindowManager();
  const [tabIds, setTabIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hostOpen, setHostOpen] = useState(false);

  const peopleById = useMemo(() => {
    const map = new Map(people.map((p) => [p.id, p]));
    map.set(ME, { id: ME, name: me.name, avatar: me.avatar, seekingHelpWith: [], sharedSlots: [], coursesTaken: [] });
    return map;
  }, [people, me.name, me.avatar]);

  const lobbiesById = useMemo(() => new Map(state.lobbies.map((l) => [l.id, l])), [state.lobbies]);
  // Tabs for lobbies that were closed disappear on their own
  const tabs = tabIds.map((id) => lobbiesById.get(id)).filter((l): l is Lobby => !!l);
  const active = tabs.find((l) => l.id === activeId) ?? tabs[0];
  const myLobby = state.lobbies.find((l) => l.hostId === ME);

  const openLobby = (id: string) => {
    setTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveId(id);
    stack?.focus(WINDOWS.lobbies); // already open but behind another window: bring it forward
  };

  const closeTab = (id: string) => {
    const index = tabs.findIndex((l) => l.id === id);
    const rest = tabs.filter((l) => l.id !== id).map((l) => l.id);
    setTabIds(rest);
    if (active?.id === id) setActiveId(rest[Math.min(index, rest.length - 1)] ?? null);
  };

  const host = () => {
    if (myLobby) return openLobby(myLobby.id); // one hosted lobby at a time
    setHostOpen(true);
    stack?.focus(WINDOWS.host);
  };

  const create = (subject: string, maxSize: number, timeSlots: string[]) => {
    const lobby: Lobby = {
      id: `lobby-${Date.now().toString(36)}`,
      hostId: ME,
      subject,
      maxSize,
      memberIds: [ME],
      requestIds: [],
      timeSlots,
    };
    dispatch({ type: 'host', lobby });
    setHostOpen(false);
    openLobby(lobby.id);
  };

  return (
    <>
      <WindowLayer>
        <LobbyBrowserWindow
          id={WINDOWS.browser}
          open={lobbiesOpen}
          onClose={onLobbiesClose}
          lobbies={state.lobbies}
          people={peopleById}
          openTabIds={tabIds}
          onOpenLobby={openLobby}
          onHost={host}
          isHosting={!!myLobby}
          freeSlots={myAvailability}
          subjects={mySubjects}
        />
      </WindowLayer>

      <WindowLayer>
        <BrowserWindow
          id={WINDOWS.lobbies}
          open={tabs.length > 0}
          tabs={tabs.map((l) => {
            const lobbyHost = peopleById.get(l.hostId);
            return {
              id: l.id,
              label: l.subject,
              icon: lobbyHost ? <PersonAvatar person={lobbyHost} className="w-5 h-5" /> : undefined,
            };
          })}
          activeId={active?.id ?? null}
          onSelect={setActiveId}
          onCloseTab={closeTab}
          onClose={() => {
            setTabIds([]);
            setActiveId(null);
          }}
          address={active ? `studbuds / lobbies / ${slugOf(active.subject)}` : undefined}
        >
          {active && (
            <LobbyView lobby={active} people={peopleById} connections={state.connections} dispatch={dispatch} />
          )}
        </BrowserWindow>
      </WindowLayer>

      <WindowLayer>
        <HostSessionWindow
          id={WINDOWS.host}
          open={hostOpen}
          onClose={() => setHostOpen(false)}
          availability={myAvailability}
          onCreate={create}
        />
      </WindowLayer>

      <WindowLayer>
        <SessionsWindow
          id={WINDOWS.sessions}
          open={sessionsOpen}
          onClose={onSessionsClose}
          lobbies={state.lobbies}
          people={peopleById}
          openTabIds={tabIds}
          onOpenLobby={openLobby}
          onHost={host}
        />
      </WindowLayer>

      <WindowLayer>
        <ConnectionsWindow
          id={WINDOWS.connections}
          open={connectionsOpen}
          onClose={onConnectionsClose}
          people={people}
          connections={state.connections}
          dispatch={dispatch}
        />
      </WindowLayer>
    </>
  );
}