import { useState } from 'react';
import AppWindow from './AppWindow';
import PersonAvatar from './PersonAvatar';
import { SpotPips } from './LobbyView';
import type { Lobby, Person } from '../dataFiles/StudyData';
import { roleIn } from '../utils/StudyState';
import type { LobbyRole } from '../utils/StudyState';

interface LobbyBrowserWindowProps {
  id: string;
  open: boolean;
  onClose: () => void;
  lobbies: Lobby[];
  people: Map<string, Person>;
  /** Lobbies already open as tabs */
  openTabIds: string[];
  onOpenLobby: (lobbyId: string) => void;
  /** Opens the host form, or your lobby if you already host one */
  onHost: () => void;
  isHosting: boolean;
}

const STATUS: Record<LobbyRole, { label: string; className: string }> = {
  host: { label: 'Hosting', className: 'bg-[#F2A65A]/45' },
  member: { label: 'Joined', className: 'bg-[#9FD6A6]/60' },
  requested: { label: 'Requested', className: 'bg-[#A9C7E8]/60' },
  full: { label: 'Full', className: 'bg-[#3c3c3c]/15' },
  open: { label: 'Open', className: 'bg-[#FDF7F1] border-2 border-[#3c3c3c]/30' },
};

/** The lobby list, like a game's server browser: host, subject, spots, and your status */
export default function LobbyBrowserWindow({
  id,
  open,
  onClose,
  lobbies,
  people,
  openTabIds,
  onOpenLobby,
  onHost,
  isHosting,
}: LobbyBrowserWindowProps) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? lobbies.filter((l) => l.subject.toLowerCase().includes(q)) : lobbies;

  return (
    <AppWindow
      id={id}
      title="Study Lobbies"
      open={open}
      onClose={onClose}
      controls={{ close: 'enabled', fullscreen: 'enabled' }}
      initialSize={{ width: 440, height: 560 }}
      minWidth={320}
      minHeight={280}
      bodyClassName="p-3 flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex-1 min-w-[10rem]">
          <span className="sr-only">Search lobbies by subject</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            placeholder="Search by subject"
            autoComplete="off"
            className="w-full px-2 py-1"
          />
        </label>
        <button type="button" onClick={onHost} className="px-3 py-1">
          {isHosting ? 'Your lobby' : '+ Host a session'}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="m-auto text-center text-sm opacity-70">
          {q ? 'No lobbies for that subject yet. Host one!' : 'No open lobbies right now. Host one!'}
        </p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {shown.map((lobby) => {
            const role = roleIn(lobby);
            const status = STATUS[role];
            const host = people.get(lobby.hostId);
            const isOpenTab = openTabIds.includes(lobby.id);

            return (
              <li key={lobby.id} className="list-none">
                <button
                  type="button"
                  onClick={() => onOpenLobby(lobby.id)}
                  aria-label={`${lobby.subject}, hosted by ${host?.name ?? 'someone'}, ${lobby.memberIds.length} of ${lobby.maxSize} spots, ${status.label}`}
                  className={[
                    'w-full p-3 flex items-center gap-3 text-left rounded-md',
                    'border-2 [border-image:none] bg-[#FDF7F1] transition-colors',
                    'hover:bg-[#EADBC8]/60 hover:border-[#3c3c3c]/70',
                    isOpenTab ? 'border-[#3c3c3c]/70' : 'border-[#3c3c3c]/25',
                  ].join(' ')}
                >
                  {host && <PersonAvatar person={host} className="w-11 h-11" />}

                  <span className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="text-lg leading-tight truncate">{lobby.subject}</span>
                    <span className="text-xs opacity-70 truncate">Host: {host?.name ?? 'Unknown'}</span>
                  </span>

                  <span className="shrink-0 flex flex-col items-end gap-1" aria-hidden="true">
                    <SpotPips filled={lobby.memberIds.length} max={lobby.maxSize} />
                    <span className={`px-2 rounded text-xs ${status.className}`}>{status.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </AppWindow>
  );
}