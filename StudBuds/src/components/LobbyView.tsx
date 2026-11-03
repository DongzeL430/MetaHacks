import PersonAvatar from './PersonAvatar';
import PersonCard, { VisitCroftButton } from './PersonCard';
import { ME } from '../dataFiles/StudyData';
import type { ConnectionStatus, Lobby, Person } from '../dataFiles/StudyData';
import { roleIn } from '../utils/StudyState';
import type { StudyDispatch } from '../utils/StudyState';
import { describeSlots } from '../utils/ScheduleBlocks';

/** A row of dots, one per spot: filled for taken spots, hollow for open ones */
export function SpotPips({ filled, max }: { filled: number; max: number }) {
  return (
    <span className="flex items-center gap-1" role="img" aria-label={`${filled} of ${max} spots filled`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`w-2.5 h-2.5 rounded-full border-2 border-ink ${i < filled ? 'bg-ink' : 'bg-transparent'}`}
        />
      ))}
    </span>
  );
}

/** Join requests shown on the lobby page before "View all" takes over */
export const MAX_INLINE_REQUESTS = 3;

/** One person asking to join: avatar, name, Accept (unless the lobby is full) and Decline */
export function JoinRequestRow({
  lobby,
  person,
  dispatch,
}: {
  lobby: Lobby;
  person: Person;
  dispatch: StudyDispatch;
}) {
  const isFull = lobby.memberIds.length >= lobby.maxSize;
  return (
    <li className="list-none flex items-center gap-3 p-2 rounded-md border-2 border-ink/25 bg-paper">
      <PersonAvatar person={person} className="w-8 h-8" />
      <span className="flex-1 min-w-0 truncate">{person.name}</span>
      {/* A look at their croft before letting them in */}
      <VisitCroftButton person={person} />
      <button
        type="button"
        onClick={() => dispatch({ type: 'accept-join', lobbyId: lobby.id, personId: person.id })}
        disabled={isFull}
        title={isFull ? 'The lobby is full' : undefined}
        aria-label={`Let ${person.name} join`}
        className="px-2.5 py-0.5 text-sm"
      >
        Accept
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'decline-join', lobbyId: lobby.id, personId: person.id })}
        aria-label={`Decline ${person.name}’s request`}
        className="px-2.5 py-0.5 text-sm"
      >
        Decline
      </button>
    </li>
  );
}

interface LobbyViewProps {
  lobby: Lobby;
  people: Map<string, Person>;
  connections: Record<string, ConnectionStatus>;
  dispatch: StudyDispatch;
  /** Opens this lobby's chat (shown to the host and members) */
  onOpenChat?: (lobbyId: string) => void;
  /** Opens the popup with every join request, once there are more than MAX_INLINE_REQUESTS */
  onViewAllRequests?: (lobbyId: string) => void;
}

const ACTION_BUTTON = 'px-4 py-1';

/** One lobby's page: header, your actions, join requests (host only), and the member slots */
export default function LobbyView({ lobby, people, connections, dispatch, onOpenChat, onViewAllRequests }: LobbyViewProps) {
  const role = roleIn(lobby);
  const host = people.get(lobby.hostId);
  const members = lobby.memberIds.map((id) => people.get(id)).filter((p): p is Person => !!p);
  const requests = lobby.requestIds.map((id) => people.get(id)).filter((p): p is Person => !!p);
  const openSpots = lobby.maxSize - lobby.memberIds.length;
  const isFull = openSpots <= 0;

  return (
    <>
      {/* HEADER */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-2xl leading-tight flex flex-wrap items-center gap-2">
            {lobby.subject}
            {lobby.locked && <span className="px-2 rounded bg-ink/15 text-sm">Locked</span>}
          </h2>
          <p className="m-0 text-sm opacity-70">
            Hosted by {lobby.hostId === ME ? 'you' : host?.name ?? 'someone'}
          </p>
          {lobby.timeSlots.length > 0 && <p className="m-0 text-sm">Meets {describeSlots(lobby.timeSlots)}</p>}
          {lobby.location && <p className="m-0 text-sm">At {lobby.location}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <SpotPips filled={lobby.memberIds.length} max={lobby.maxSize} />
          {/* Hidden when this lobby's window is narrow (a container query on the window's page, not the screen) */}
          <span className="hidden @md:inline text-sm">
            {lobby.memberIds.length} / {lobby.maxSize} {isFull ? '· Full' : `· ${openSpots} open`}
          </span>
        </div>
      </header>

      {/* YOUR ACTIONS */}
      <div className="flex flex-wrap items-center gap-3">
        {role === 'open' && (
          <button type="button" onClick={() => dispatch({ type: 'request-join', lobbyId: lobby.id })} className={ACTION_BUTTON}>
            Request to join
          </button>
        )}
        {role === 'requested' && (
          <>
            <span className="text-sm">Request sent. Waiting for the host to let you in.</span>
            <button type="button" onClick={() => dispatch({ type: 'cancel-join', lobbyId: lobby.id })} className={ACTION_BUTTON}>
              Cancel request
            </button>
          </>
        )}
        {role === 'full' && <span className="text-sm opacity-70">This lobby is full.</span>}
        {role === 'locked' && (
          <span className="text-sm opacity-70">The host locked this session and isn’t taking new requests.</span>
        )}
        {(role === 'host' || role === 'member') && onOpenChat && (
          <button type="button" onClick={() => onOpenChat(lobby.id)} className={`${ACTION_BUTTON} flex items-center gap-2`}>
            <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
              <path
                d="M3.5 4.5h13v8h-7l-4 3v-3h-2z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            Chat
          </button>
        )}
        {role === 'member' && (
          <button type="button" onClick={() => dispatch({ type: 'leave', lobbyId: lobby.id })} className={ACTION_BUTTON}>
            Leave lobby
          </button>
        )}
        {role === 'host' && (
          <button
            type="button"
            onClick={() => dispatch({ type: lobby.locked ? 'unlock-lobby' : 'lock-lobby', lobbyId: lobby.id })}
            aria-pressed={!!lobby.locked}
            title={lobby.locked ? 'Start taking join requests again' : 'Stop new join requests'}
            className={`${ACTION_BUTTON} flex items-center gap-2`}
          >
            <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
              <rect x="4" y="9" width="12" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path
                d={lobby.locked ? 'M7 9V6.5a3 3 0 0 1 6 0V9' : 'M7 9V6.5a3 3 0 0 1 5.8-1'}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            {lobby.locked ? 'Unlock session' : 'Lock session'}
          </button>
        )}
        {role === 'host' && (
          <button type="button" onClick={() => dispatch({ type: 'close-lobby', lobbyId: lobby.id })} className={ACTION_BUTTON}>
            Close lobby
          </button>
        )}
      </div>

      {/* JOIN REQUESTS (host only) */}
      {role === 'host' && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-base opacity-80">Join requests {requests.length > 0 && `(${requests.length})`}</h3>
          {lobby.locked && (
            <p className="m-0 text-sm opacity-70">
              Locked: no new requests can come in.{requests.length > 0 && ' You can still answer the ones already here.'}
            </p>
          )}
          {requests.length === 0 ? (
            <p className="m-0 text-sm opacity-70">No one is waiting right now.</p>
          ) : (
            <>
              <ul className="m-0 p-0 list-none flex flex-col gap-2">
                {requests.slice(0, MAX_INLINE_REQUESTS).map((p) => (
                  <JoinRequestRow key={p.id} lobby={lobby} person={p} dispatch={dispatch} />
                ))}
              </ul>
              {requests.length > MAX_INLINE_REQUESTS && onViewAllRequests && (
                <button type="button" onClick={() => onViewAllRequests(lobby.id)} className="self-start px-3 py-0.5 text-sm">
                  View all {requests.length} requests
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* SLOTS: members, then empty spots, like a game lobby */}
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-base opacity-80">In this lobby</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {members.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              isHost={p.id === lobby.hostId}
              isMe={p.id === ME}
              status={connections[p.id] ?? 'none'}
              dispatch={dispatch}
            />
          ))}
          {Array.from({ length: Math.max(0, openSpots) }, (_, i) => (
            <div
              key={`open-${i}`}
              className="min-h-28 flex items-center justify-center rounded-md border-2 border-dashed border-ink/30 text-sm opacity-60"
            >
              Open spot
            </div>
          ))}
        </div>
      </section>
    </>
  );
}