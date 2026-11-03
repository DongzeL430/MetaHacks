import { useMemo, useState } from 'react';
import { WindowLayer, useWindowManager } from './AppWindow';
import BrowserWindow from './BrowserWindow';
import ConnectionsWindow from './ConnectionsWindow';
import HostSessionWindow from './HostSessionWindow';
import type { NewLobbyDetails } from './HostSessionWindow';
import LobbyBrowserWindow from './LobbyBrowserWindow';
import LobbyView from './LobbyView';
import ChatWindow from './ChatWindow';
import JoinRequestsPopup from './JoinRequestPopup';
import SessionsWindow from './SessionsWindow';
import PersonAvatar from './PersonAvatar';
import { ME } from '../dataFiles/StudyData';
import type { Lobby, Person } from '../dataFiles/StudyData';
import { roleIn } from '../utils/StudyState';
import type { StudyDispatch, StudyState } from '../utils/StudyState';

const WINDOWS = {
  browser: 'lobby-browser',
  lobbies: 'lobby-tabs',
  host: 'host-session',
  connections: 'connections',
  sessions: 'sessions',
  chat: 'lobby-chat',
};

interface StudyLayoutProps {
  /** The signed-in user, shown in lobbies they're part of */
  me: { name: string; avatar?: string };
  /** Everyone else the user can see in lobbies and connections */
  people: Person[];
  /** The user's free slots ("mon|09:30"), shown on the host form's schedule and used by lobby filters */
  myAvailability?: string[];
  /** The user's subjects (e.g. their courses), used by the lobby browser's "My subjects" filter */
  mySubjects?: string[];
  /** Places offered when hosting (public cafes, libraries…). Leave out for the defaults. */
  locationSuggestions?: string[];
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
 *  - Chat: live group chat (Supabase Realtime) for a lobby you host or joined
 *  - Join requests: popup with every request, from "View all" on your lobby's page
 *  - Lobbies: a browser-style window with a tab per lobby you've opened
 *  - Host a session: popup form (subject, group size, time block) that dims the page
 *  - Connections: friend-request style list
 * Render inside a WindowManagerProvider, in a desk area with `relative`.
 */
export default function StudyLayout({
  me,
  people,
  myAvailability,
  mySubjects,
  locationSuggestions,
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
  /** Lobby whose chat is open (one chat window, switched between lobbies) */
  const [chatLobbyId, setChatLobbyId] = useState<string | null>(null);
  /** Lobby whose "View all" join requests popup is open */
  const [requestsLobbyId, setRequestsLobbyId] = useState<string | null>(null);

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

  // Chat is only for people in the lobby: leaving it (or it closing) closes the chat too
  const chatLobby = chatLobbyId ? lobbiesById.get(chatLobbyId) : undefined;
  const chatAllowed = !!chatLobby && (roleIn(chatLobby) === 'host' || roleIn(chatLobby) === 'member');
  const requestsLobby = requestsLobbyId ? lobbiesById.get(requestsLobbyId) ?? null : null;

  const openChat = (lobbyId: string) => {
    setChatLobbyId(lobbyId);
    stack?.focus(WINDOWS.chat); // already open but behind another window: bring it forward
  };


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
  };

  const create = ({ subject, maxSize, location, timeSlots }: NewLobbyDetails) => {
    const lobby: Lobby = {
      // A real id now, so the open tab keeps pointing at this lobby once the backend saves it
      id: crypto.randomUUID(),
      hostId: ME,
      subject,
      maxSize,
      memberIds: [ME],
      requestIds: [],
      timeSlots,
      location,
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
          info="Each lobby you open gets its own tab. See who’s in it and when it meets, request to join, chat with your group, or manage requests if you’re the host."
        >
          {active && (
            <LobbyView
              lobby={active}
              people={peopleById}
              connections={state.connections}
              dispatch={dispatch}
              onOpenChat={openChat}
              onViewAllRequests={setRequestsLobbyId}
            />
          )}
        </BrowserWindow>
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

      <WindowLayer>
        <ChatWindow
          id={WINDOWS.chat}
          lobby={chatAllowed ? chatLobby! : null}
          people={peopleById}
          onClose={() => setChatLobbyId(null)}
        />
      </WindowLayer>

      {/* Popups over everything, so they go last and outside the window layers */}
      <JoinRequestsPopup
        lobby={requestsLobby}
        people={peopleById}
        dispatch={dispatch}
        onClose={() => setRequestsLobbyId(null)}
      />

      <HostSessionWindow
        id={WINDOWS.host}
        open={hostOpen}
        onClose={() => setHostOpen(false)}
        availability={myAvailability}
        locationSuggestions={locationSuggestions}
        // The student's own courses, when known, instead of the generic list
        subjectSuggestions={mySubjects && mySubjects.length > 0 ? mySubjects : undefined}
        onCreate={create}
      />
    </>
  );
}