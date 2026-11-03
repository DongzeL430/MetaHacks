import PersonAvatar from './PersonAvatar';
import { ME } from '../dataFiles/StudyData';
import type { ConnectionStatus, Person } from '../dataFiles/StudyData';
import { useVisitCroft } from '../lib/croft';
import type { StudyDispatch } from '../utils/StudyState';
import { toDayBlocks } from '../utils/ScheduleBlocks';

const CHIP = 'px-1.5 py-0.5 rounded border-2 border-ink/25 text-xs';
const SMALL_BUTTON = 'px-2.5 py-0.5 text-sm';

/** Opens this person's croft (My Croft). Nothing shows where Home doesn't offer crofts. */
export function VisitCroftButton({ person }: { person: Person }) {
  const visit = useVisitCroft();
  if (!visit) return null;
  const mine = person.id === ME;
  return (
    <button
      type="button"
      onClick={() => visit(person.id)}
      aria-label={mine ? 'Open your croft' : `Visit ${person.name}’s croft`}
      className={SMALL_BUTTON}
    >
      {mine ? 'Your croft' : 'Visit croft'}
    </button>
  );
}

/** Friend-request style connect button. Shows what's possible for the current status. */
export function ConnectControl({
  person,
  status,
  dispatch,
}: {
  person: Person;
  status: ConnectionStatus;
  dispatch: StudyDispatch;
}) {
  switch (status) {
    case 'connected':
      return <span className="px-2 py-0.5 rounded-md bg-free/60 text-sm">Connected</span>;
    case 'sent':
      return (
        <button
          type="button"
          onClick={() => dispatch({ type: 'cancel-connect', personId: person.id })}
          title="Cancel your connection request"
          aria-label={`Cancel connection request to ${person.name}`}
          className={SMALL_BUTTON}
        >
          Requested
        </button>
      );
    case 'received':
      return (
        <span className="flex gap-1.5">
          <button
            type="button"
            onClick={() => dispatch({ type: 'accept-connect', personId: person.id })}
            aria-label={`Accept ${person.name}’s connection request`}
            className={SMALL_BUTTON}
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'decline-connect', personId: person.id })}
            aria-label={`Decline ${person.name}’s connection request`}
            className={SMALL_BUTTON}
          >
            Decline
          </button>
        </span>
      );
    default:
      return (
        <button
          type="button"
          onClick={() => dispatch({ type: 'connect', personId: person.id })}
          aria-label={`Send ${person.name} a connection request`}
          className={SMALL_BUTTON}
        >
          + Connect
        </button>
      );
  }
}

interface PersonCardProps {
  person: Person;
  isHost?: boolean;
  isMe?: boolean;
  status: ConnectionStatus;
  dispatch: StudyDispatch;
}

/** A filled lobby slot: who they are, what they need help with, when you're both free, what they've taken */
export default function PersonCard({ person, isHost = false, isMe = false, status, dispatch }: PersonCardProps) {
  const blocks = toDayBlocks(person.sharedSlots);

  return (
    <article className="flex flex-col gap-3 p-3 rounded-md border-2 border-ink/40 bg-paper motion-safe:transition motion-safe:duration-300 starting:opacity-0 starting:scale-95">
      <header className="flex items-center gap-3">
        <PersonAvatar person={person} className="w-12 h-12" />
        <div className="flex-1 min-w-0">
          <h3 className="m-0 text-lg leading-tight truncate">{person.name}</h3>
          <p className="m-0 flex gap-1.5 text-xs">
            {isHost && <span className="px-1.5 rounded bg-accent/40">Host</span>}
            {isMe && <span className="px-1.5 rounded bg-sand">You</span>}
          </p>
        </div>
        {!isMe && <ConnectControl person={person} status={status} dispatch={dispatch} />}
      </header>

      {!isMe && (
        <>
          <div className="flex flex-col gap-1">
            <p className="m-0 text-xs opacity-70">Looking for help with</p>
            {person.seekingHelpWith.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {person.seekingHelpWith.map((subject) => (
                  <span key={subject} className={`${CHIP} bg-accent/25`}>
                    {subject}
                  </span>
                ))}
              </div>
            ) : (
              <p className="m-0 text-sm opacity-70">Nothing listed</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <p className="m-0 text-xs opacity-70">Free at the same time as you</p>
            {blocks.length > 0 ? (
              <ul className="m-0 p-0 list-none flex flex-col gap-0.5 text-sm">
                {blocks.map((b) => (
                  <li key={b.day} className="list-none flex flex-wrap gap-x-2">
                    <span className="w-24 shrink-0">{b.day}</span>
                    <span>{b.ranges.join(', ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm opacity-70">No overlap yet</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <p className="m-0 text-xs opacity-70">Courses taken</p>
            {person.coursesTaken.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {person.coursesTaken.map((course) => (
                  <span key={course} className={CHIP}>
                    {course}
                  </span>
                ))}
              </div>
            ) : (
              <p className="m-0 text-sm opacity-70">None listed</p>
            )}
          </div>
        </>
      )}

      <div className="flex justify-end">
        <VisitCroftButton person={person} />
      </div>
    </article>
  );
}