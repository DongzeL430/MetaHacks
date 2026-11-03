import { useId, useState } from 'react';
import ChipList from './ChipList';
import PersonAvatar from './PersonAvatar';
import { ME } from '../dataFiles/StudyData';
import type { ConnectionStatus, Person } from '../dataFiles/StudyData';
import { useVisitCroft } from '../lib/croft';
import { REPORT_NOTE_MAX, REPORT_REASONS, reportStudent } from '../lib/safety';
import type { ReportReason } from '../lib/safety';
import type { StudyDispatch } from '../utils/StudyState';
import { toDayBlocks } from '../utils/ScheduleBlocks';

const CHIP = 'px-1.5 py-0.5 rounded border-2 border-ink/25 text-xs';
const SMALL_BUTTON = 'px-2.5 py-0.5 text-sm';
/** Icon-only on a narrow card (under 20rem), icon and label once there's room */
const ICON_BUTTON = 'px-1.5 @xs:px-2.5 py-0.5 text-sm flex items-center gap-1';
const LABEL = 'hidden @xs:inline';

/** Person outline with a plus (connect) or minus (remove) beside it */
function PersonIcon({ minus = false }: { minus?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0" aria-hidden="true">
      <circle cx="8" cy="7" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d={`M2.5 16.5c.6-3 2.7-4.5 5.5-4.5s4.9 1.5 5.5 4.5M13 8.5h5${minus ? '' : 'M15.5 6v5'}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A cross, for removing someone from the session */
function CrossIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Opens this person's croft (My Croft). Nothing shows where Home doesn't offer crofts. */
export function VisitCroftButton({ person, onVisit }: { person: Person; onVisit?: () => void }) {
  const visit = useVisitCroft();
  if (!visit) return null;
  const mine = person.id === ME;
  return (
    <button
      type="button"
      onClick={() => {
        onVisit?.();
        visit(person.id);
      }}
      aria-label={mine ? 'Open your croft' : `Visit ${person.name}’s croft`}
      className={SMALL_BUTTON}
    >
      {mine ? 'Your croft' : 'Visit croft'}
    </button>
  );
}

const CONNECTED_BADGE = 'px-2 py-0.5 rounded-md bg-free/60 text-sm';

/** "Connected", with a Remove button that asks once before ending the connection */
function ConnectedControl({ person, dispatch }: { person: Person; dispatch: StudyDispatch }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <span className="flex items-center gap-1.5">
        <span className={CONNECTED_BADGE}>Connected</span>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Remove ${person.name} from your connections`}
          title="Remove from your connections"
          className={ICON_BUTTON}
        >
          <PersonIcon minus />
          <span className={LABEL}>Remove</span>
        </button>
      </span>
    );
  }
  return (
    <span role="group" aria-label={`Remove ${person.name}?`} className="flex flex-wrap items-center gap-1.5 text-sm">
      <span>Remove {person.name}?</span>
      <button type="button" onClick={() => dispatch({ type: 'remove-connect', personId: person.id })} className={SMALL_BUTTON}>
        Remove
      </button>
      <button type="button" onClick={() => setConfirming(false)} className={SMALL_BUTTON} autoFocus>
        Keep
      </button>
    </span>
  );
}

/**
 * Friend-request style connect button. Shows what's possible for the current status.
 * canRemove: offers Remove on a connection (the Connections window); elsewhere it's just "Connected".
 */
export function ConnectControl({
  person,
  status,
  dispatch,
  canRemove = false,
}: {
  person: Person;
  status: ConnectionStatus;
  dispatch: StudyDispatch;
  canRemove?: boolean;
}) {
  switch (status) {
    case 'connected':
      return canRemove ? (
        <ConnectedControl person={person} dispatch={dispatch} />
      ) : (
        <span className={CONNECTED_BADGE}>Connected</span>
      );
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
          title="Send a connection request"
          className={ICON_BUTTON}
        >
          <PersonIcon />
          <span className={LABEL}>Connect</span>
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
  /** Shown to the host on everyone else's card: removes them from the session */
  onKick?: () => void;
  /** Shows the "Visit croft" button (only on someone's profile popup for now) */
  showCroft?: boolean;
  /** Runs before "Visit croft" opens their croft, e.g. to close the popup the card is in */
  onVisitCroft?: () => void;
}

/** The host's Remove button, which asks once before removing someone for good */
function KickControl({ name, onKick }: { name: string; onKick: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${name} from this session`}
        title="Remove from this session"
        className={`${ICON_BUTTON} self-start`}
      >
        <CrossIcon />
        <span className={LABEL}>Remove</span>
      </button>
    );
  }
  return (
    <div role="group" aria-label={`Remove ${name}?`} className="flex flex-wrap items-center gap-2 text-sm">
      <span>Remove {name}? They can’t ask to join this session again, but you can invite them back.</span>
      <button type="button" onClick={onKick} className={SMALL_BUTTON}>
        Remove
      </button>
      <button type="button" onClick={() => setConfirming(false)} className={SMALL_BUTTON} autoFocus>
        Keep
      </button>
    </div>
  );
}

/** Small text buttons, quieter than the card's real actions */
const QUIET_BUTTON =
  'p-0 border-0 [border-image:none] bg-transparent text-xs underline underline-offset-2 opacity-70 hover:opacity-100 cursor-pointer';
const SAFETY_PANEL = 'flex flex-col gap-2 p-2.5 rounded-md border-2 border-dashed border-ink/30 text-sm';

type SafetyStep = 'closed' | 'report' | 'reported' | 'block' | 'blocked';

/**
 * Report and Block, at the bottom of someone's card. Reporting picks a reason and an optional
 * note for the StudBuds team; blocking asks once. Neither is ever shown to the other student.
 */
function SafetyControl({ person, dispatch }: { person: Person; dispatch: StudyDispatch }) {
  const baseId = useId();
  const [step, setStep] = useState<SafetyStep>('closed');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setStep('closed');
    setReason(null);
    setNote('');
    setError('');
  };

  const send = async () => {
    if (!reason || sending) return;
    setSending(true);
    setError('');
    const failed = await reportStudent(person.id, reason, note);
    setSending(false);
    if (failed) setError(failed);
    else setStep('reported');
  };

  const block = () => {
    dispatch({ type: 'block', personId: person.id });
    setStep('blocked');
  };

  switch (step) {
    case 'closed':
      return (
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setStep('report')} className={QUIET_BUTTON} aria-label={`Report ${person.name}`}>
            Report
          </button>
          <button type="button" onClick={() => setStep('block')} className={QUIET_BUTTON} aria-label={`Block ${person.name}`}>
            Block
          </button>
        </div>
      );

    case 'report':
      return (
        <form
          className={SAFETY_PANEL}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <fieldset className="m-0 p-0 border-0 flex flex-col gap-1">
            <legend className="mb-1 p-0 font-bold">Why are you reporting {person.name}?</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${baseId}-reason`}
                  value={r.id}
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1">
            <span>
              Anything we should know? <span className="opacity-60">(optional)</span>
            </span>
            <textarea
              rows={3}
              value={note}
              maxLength={REPORT_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-2 py-1 resize-y"
            />
            <span className="self-end text-xs opacity-60">
              {note.length}/{REPORT_NOTE_MAX}
            </span>
          </label>
          <p className="m-0 text-xs opacity-70">Only the StudBuds team reads reports. {person.name} isn’t told.</p>
          {error && (
            <p role="alert" className="m-0 text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!reason || sending} className={SMALL_BUTTON}>
              {sending ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" onClick={close} className={SMALL_BUTTON}>
              Cancel
            </button>
          </div>
        </form>
      );

    case 'reported':
      return (
        <div role="status" className={SAFETY_PANEL}>
          <p className="m-0">Thanks. Your report is with the StudBuds team.</p>
          <p className="m-0 text-xs opacity-70">You can also block {person.name} so you stop seeing each other.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStep('block')} className={SMALL_BUTTON}>
              Block {person.name}
            </button>
            <button type="button" onClick={close} className={SMALL_BUTTON}>
              Done
            </button>
          </div>
        </div>
      );

    case 'block':
      return (
        <div role="group" aria-label={`Block ${person.name}?`} className={SAFETY_PANEL}>
          <p className="m-0">
            Block {person.name}? Your connection ends and neither of you will see the other’s sessions. They aren’t
            told, and you can unblock them in Profile › Account.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={block} className={SMALL_BUTTON}>
              Block
            </button>
            <button type="button" onClick={close} className={SMALL_BUTTON} autoFocus>
              Keep
            </button>
          </div>
        </div>
      );

    case 'blocked':
      return (
        <p role="status" className="m-0 text-sm opacity-80">
          {person.name} is blocked. You can undo it in Profile › Account.
        </p>
      );
  }
}

/** A filled lobby slot: who they are, what they need help with, when you're both free, what they've taken */
export default function PersonCard({
  person,
  isHost = false,
  isMe = false,
  status,
  dispatch,
  onKick,
  showCroft = false,
  onVisitCroft,
}: PersonCardProps) {
  const blocks = toDayBlocks(person.sharedSlots);

  return (
    <article className="@container flex flex-col gap-3 p-3 rounded-md border-2 border-ink/40 bg-paper motion-safe:transition motion-safe:duration-300 starting:opacity-0 starting:scale-95">
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
            <ChipList
              items={person.seekingHelpWith}
              chipClassName={`${CHIP} bg-accent/25`}
              title={`${person.name} is looking for help with`}
              empty="Nothing listed"
            />
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
            <ChipList
              items={person.coursesTaken}
              chipClassName={CHIP}
              title={`${person.name}’s courses taken`}
              empty="None listed"
            />
          </div>
        </>
      )}

      {((onKick && !isMe) || showCroft) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          {onKick && !isMe ? <KickControl name={person.name} onKick={onKick} /> : <span />}
          {showCroft && <VisitCroftButton person={person} onVisit={onVisitCroft} />}
        </div>
      )}

      {!isMe && <SafetyControl person={person} dispatch={dispatch} />}
    </article>
  );
}