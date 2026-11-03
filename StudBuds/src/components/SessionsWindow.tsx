import { useId, useState } from 'react';
import AppWindow, { WINDOW_ACCENTS } from './AppWindow';
import type { InitialSize } from './AppWindow';
import LobbyRow from './LobbyRow';
import ViewTabs, { viewPanelId, viewTabId } from './ViewTabs';
import type { Lobby, Person } from '../dataFiles/StudyData';
import { roleIn } from '../utils/StudyState';

interface SessionsWindowProps {
  id: string;
  open: boolean;
  onClose: () => void;
  lobbies: Lobby[];
  people: Map<string, Person>;
  openTabIds: string[];
  /** Opens the lobby in the lobby tabs window (the same page as from Study Lobbies) */
  onOpenLobby: (lobbyId: string) => void;
}

/** Opening size for smaller side windows (e.g. Chat), as a share of the desk */
export const LIST_WINDOW_SIZE: InitialSize = ({ width, height }) => {
  const screen = window.innerWidth;
  if (screen >= 1280) return { width: width * 0.45, height: height * 0.75 };
  if (screen >= 768) return { width: width * 0.65, height: height * 0.75 };
  return { width: width * 0.96, height: height * 0.92 };
};

type View = 'hosting' | 'joined' | 'requested';

const VIEWS: { id: View; label: string; role: 'host' | 'member' | 'requested'; empty: string }[] = [
  { id: 'hosting', label: 'Hosting', role: 'host', empty: 'You’re not hosting a session. You can host one from Study Lobbies.' },
  { id: 'joined', label: 'Joined', role: 'member', empty: 'You haven’t joined any sessions yet.' },
  { id: 'requested', label: 'Requested', role: 'requested', empty: 'No requests waiting on a host.' },
];

/**
 * Your own sessions, split into views like a nav bar: Hosting, Joined, Requested.
 * Click a session to open its full page in the lobby tabs window.
 */
export default function SessionsWindow({ id, open, onClose, lobbies, people, openTabIds, onOpenLobby }: SessionsWindowProps) {
  const baseId = useId();
  const listFor = (view: View) => lobbies.filter((l) => roleIn(l) === VIEWS.find((v) => v.id === view)!.role);

  // Starts on the first view that has something in it
  const [view, setView] = useState<View>(() => VIEWS.find((v) => listFor(v.id).length > 0)?.id ?? 'hosting');
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
    return undefined;
  };

  return (
    <AppWindow
      id={id}
      title="Sessions"
      accent={WINDOW_ACCENTS.peach}
      info="Every session you’re part of: ones you host, ones you’ve joined, and ones waiting for a host to let you in. Click one to open its page."
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
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, count: listFor(v.id).length }))}
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
              />
            ))}
          </ul>
        )}
      </div>
    </AppWindow>
  );
}