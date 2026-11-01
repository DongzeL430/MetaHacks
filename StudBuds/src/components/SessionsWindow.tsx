import type { ReactNode } from 'react';
import AppWindow from './AppWindow';
import type { InitialSize } from './AppWindow';
import LobbyRow from './LobbyRow';
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
  onHost: () => void;
}

const SESSIONS_SIZE: InitialSize = ({ width, height }) => {
  const screen = window.innerWidth;
  if (screen >= 1280) return { width: width * 0.45, height: height * 0.75 };
  if (screen >= 768) return { width: width * 0.65, height: height * 0.75 };
  return { width: width * 0.96, height: height * 0.92 };
};

function Group({ title, empty, children, count }: { title: string; empty: ReactNode; children: ReactNode; count: number }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-base opacity-80">
        {title} {count > 0 && <span className="opacity-70">({count})</span>}
      </h3>
      {count === 0 ? <p className="m-0 text-sm opacity-60">{empty}</p> : <ul className="m-0 p-0 list-none flex flex-col gap-2">{children}</ul>}
    </section>
  );
}

/** Your own sessions: the lobby you host, ones you've joined, and ones you've asked to join */
export default function SessionsWindow({ id, open, onClose, lobbies, people, openTabIds, onOpenLobby, onHost }: SessionsWindowProps) {
  const hosting = lobbies.filter((l) => roleIn(l) === 'host');
  const joined = lobbies.filter((l) => roleIn(l) === 'member');
  const requested = lobbies.filter((l) => roleIn(l) === 'requested');

  const row = (lobby: Lobby, note?: string) => (
    <LobbyRow
      key={lobby.id}
      lobby={lobby}
      people={people}
      isOpenTab={openTabIds.includes(lobby.id)}
      onOpen={onOpenLobby}
      note={note}
    />
  );

  return (
    <AppWindow
      id={id}
      title="Sessions"
      open={open}
      onClose={onClose}
      controls={{ close: 'enabled', fullscreen: 'enabled' }}
      initialSize={SESSIONS_SIZE}
      minWidth={300}
      minHeight={260}
      bodyClassName="p-3 flex flex-col gap-5"
    >
      <Group
        title="Hosting"
        count={hosting.length}
        empty={
          <span className="flex flex-wrap items-center gap-2">
            You’re not hosting a session.
            <button type="button" onClick={onHost} className="px-3 py-0.5 text-sm">
              + Host a session
            </button>
          </span>
        }
      >
        {hosting.map((l) =>
          row(l, l.requestIds.length > 0 ? `${l.requestIds.length} ${l.requestIds.length === 1 ? 'person' : 'people'} waiting to join` : undefined),
        )}
      </Group>

      <Group title="Joined" count={joined.length} empty="You haven’t joined any sessions yet.">
        {joined.map((l) => row(l))}
      </Group>

      <Group title="Requested" count={requested.length} empty="No requests waiting on a host.">
        {requested.map((l) => row(l, 'Waiting for the host to let you in'))}
      </Group>
    </AppWindow>
  );
}