import { useId } from 'react';
import AppWindow, { WINDOW_ACCENTS } from './AppWindow';
import { JoinRequestRow } from './LobbyView';
import type { Lobby, Person } from '../dataFiles/StudyData';
import type { StudyDispatch } from '../utils/StudyState';

interface JoinRequestsPopupProps {
  /** The lobby whose requests to show. null = closed. */
  lobby: Lobby | null;
  people: Map<string, Person>;
  dispatch: StudyDispatch;
  onClose: () => void;
}

/**
 * Every join request for a lobby, in a popup that dims the page.
 * Closes with its X, Escape, or a click on the dimmed area.
 * Render it in the desk area (which needs `relative`), not inside a WindowLayer.
 */
export default function JoinRequestsPopup({ lobby, people, dispatch, onClose }: JoinRequestsPopupProps) {
  const titleId = useId();
  if (!lobby) return null;

  const requests = lobby.requestIds.map((pid) => people.get(pid)).filter((p): p is Person => !!p);
  const openSpots = lobby.maxSize - lobby.memberIds.length;

  return (
    <>
      <div
        aria-hidden="true"
        onPointerDown={onClose}
        className="fixed inset-0 z-[45] bg-[#3c3c3c]/25 motion-safe:transition-opacity motion-safe:duration-200 starting:opacity-0"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-0 z-50 p-3"
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
          title={`Join requests: ${lobby.subject}`}
          accent={WINDOW_ACCENTS.rose}
          info="Everyone asking to join your lobby. Accept to give them a spot, or decline."
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
            {requests.length} {requests.length === 1 ? 'person' : 'people'} waiting ·{' '}
            {openSpots > 0 ? `${openSpots} ${openSpots === 1 ? 'spot' : 'spots'} open` : 'Lobby is full'}
          </p>
          {requests.length === 0 ? (
            <p className="m-auto text-center text-sm opacity-70">No one is waiting right now.</p>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {requests.map((p) => (
                <JoinRequestRow key={p.id} lobby={lobby} person={p} dispatch={dispatch} />
              ))}
            </ul>
          )}
        </AppWindow>
      </div>
    </>
  );
}