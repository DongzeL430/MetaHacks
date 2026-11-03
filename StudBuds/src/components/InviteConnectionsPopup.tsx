import { useId } from 'react';
import AppWindow, { WINDOW_ACCENTS } from './AppWindow';
import PersonAvatar from './PersonAvatar';
import { ME } from '../dataFiles/StudyData';
import type { ConnectionStatus, Lobby, LobbyInvite, Person } from '../dataFiles/StudyData';
import type { StudyDispatch } from '../utils/StudyState';

interface InviteConnectionsPopupProps {
  /** The lobby to invite people to. null = closed. */
  lobby: Lobby | null;
  people: Map<string, Person>;
  connections: Record<string, ConnectionStatus>;
  invites: LobbyInvite[];
  dispatch: StudyDispatch;
  onClose: () => void;
}

/**
 * Invite your connections to a lobby you're in, in a popup that dims the page.
 * A host's invite lets them straight in; a member's becomes a join request for the host.
 * Closes with its X, Escape, or a click on the dimmed area.
 * Render it in the desk area (which needs `relative`), not inside a WindowLayer.
 */
export default function InviteConnectionsPopup({
  lobby,
  people,
  connections,
  invites,
  dispatch,
  onClose,
}: InviteConnectionsPopupProps) {
  const titleId = useId();
  if (!lobby) return null;

  const isHost = lobby.hostId === ME;
  const isFull = lobby.memberIds.length >= lobby.maxSize;
  const friends = Object.entries(connections)
    .filter(([, status]) => status === 'connected')
    .map(([id]) => people.get(id))
    .filter((p): p is Person => !!p)
    .sort((a, b) => a.name.localeCompare(b.name));

  /** Why someone can't be invited right now, or null if they can */
  const statusOf = (p: Person) => {
    if (lobby.memberIds.includes(p.id)) return 'In this lobby';
    if (lobby.requestIds.includes(p.id)) return 'Asked to join';
    if (invites.some((i) => i.lobbyId === lobby.id && i.inviteeId === p.id)) return 'Invited';
    return null;
  };

  return (
    <>
      <div
        aria-hidden="true"
        onPointerDown={onClose}
        className="fixed inset-0 z-[65] bg-ink/25 motion-safe:transition-opacity motion-safe:duration-200 starting:opacity-0"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-0 z-[70] p-3"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <AppWindow
          title={`Invite to ${lobby.subject}`}
          accent={WINDOW_ACCENTS.mint}
          info="Invite your connections to this session. They’ll find it under Sessions > Invites. When the host invites someone they join straight away; when a member does, the host still decides."
          titleId={titleId}
          onClose={onClose}
          excludeFromLayout
          controls={{ close: 'enabled', fullscreen: 'hidden', pin: 'hidden' }}
          initialSize={({ width, height }) => ({
            width: Math.min(width * 0.9, 480),
            height: Math.min(height * 0.85, 560),
          })}
          minWidth={280}
          minHeight={240}
          bodyClassName="p-3 flex flex-col gap-3"
        >
          <p role="status" className="m-0 text-sm opacity-80">
            {isFull
              ? 'This lobby is full, so no one can be invited right now.'
              : isHost
                ? 'People you invite join as soon as they accept.'
                : 'People you invite send the host a join request when they accept.'}
          </p>

          {friends.length === 0 ? (
            <p className="m-auto text-center text-sm opacity-70">
              No connections yet. Use the Connect button on someone’s card in a lobby, then invite them here.
            </p>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {friends.map((p) => {
                const status = statusOf(p);
                return (
                  <li key={p.id} className="list-none flex items-center gap-3 p-2 rounded-md border-2 border-ink/25 bg-paper">
                    <PersonAvatar person={p} className="w-8 h-8" />
                    <span className="flex-1 min-w-0 truncate">{p.name}</span>
                    {status ? (
                      <span className="px-2 rounded bg-ink/10 text-sm">{status}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'invite', lobbyId: lobby.id, personId: p.id })}
                        disabled={isFull}
                        aria-label={`Invite ${p.name}`}
                        className="px-3 py-0.5 text-sm"
                      >
                        Invite
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </AppWindow>
      </div>
    </>
  );
}
