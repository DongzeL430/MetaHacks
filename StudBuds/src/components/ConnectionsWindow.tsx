import { useId, useState } from 'react';
import AppWindow, { WINDOW_ACCENTS } from './AppWindow';
import PersonAvatar from './PersonAvatar';
import { ConnectControl } from './PersonCard';
import ViewTabs, { viewPanelId, viewTabId } from './ViewTabs';
import type { ConnectionStatus, Person } from '../dataFiles/StudyData';
import { useContactSharing } from '../lib/safety';
import type { SharedContact } from '../lib/safety';
import type { StudyDispatch } from '../utils/StudyState';

interface ConnectionsWindowProps {
  id: string;
  open: boolean;
  onClose: () => void;
  people: Person[];
  connections: Record<string, ConnectionStatus>;
  dispatch: StudyDispatch;
  /** Opens someone's profile (their avatar and name are a button) */
  onViewProfile?: (personId: string) => void;
}

type View = 'received' | 'connected' | 'sent';

/**
 * Under a connection: your "Share my contact" switch, and their Discord, Instagram or phone once
 * they've shared it with you (only what they filled in)
 */
function ContactSharingRow({
  person,
  shared,
  canShare,
  theirs,
  onChange,
}: {
  person: Person;
  shared: boolean;
  /** You've filled in something to share */
  canShare: boolean;
  theirs?: SharedContact;
  onChange: (share: boolean) => void;
}) {
  const handles = theirs
    ? [
        { label: 'Discord', value: theirs.discord },
        { label: 'Instagram', value: theirs.instagram && `@${theirs.instagram}` },
        { label: 'Phone', value: theirs.phone },
      ].filter((h): h is { label: string; value: string } => !!h.value)
    : [];

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 pt-2 border-t-2 border-ink/10 text-sm">
      <label className="flex items-center gap-2" title={canShare ? undefined : 'Add your contact in Profile › Contact first'}>
        <input
          type="checkbox"
          checked={shared}
          // Turning it off always works, even after clearing your contact details
          disabled={!canShare && !shared}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={`Share my contact with ${person.name}`}
        />
        Share my contact
      </label>
      {handles.length > 0 ? (
        <dl className="m-0 flex flex-wrap gap-x-3 gap-y-0.5" aria-label={`${person.name}’s contact`}>
          {handles.map((h) => (
            <div key={h.label} className="flex gap-1">
              <dt className="opacity-70">{h.label}</dt>
              <dd className="m-0 select-all break-all">{h.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="opacity-60">They haven’t shared theirs yet</span>
      )}
    </div>
  );
}

const VIEWS: { id: View; label: string; empty: string }[] = [
  { id: 'received', label: 'Requests', empty: 'No requests right now.' },
  { id: 'connected', label: 'Connected', empty: 'No connections yet. Use the Connect button on someone’s card in a lobby.' },
  { id: 'sent', label: 'Sent', empty: 'No pending requests.' },
];

/**
 * Friend-request style connections, split into views like a nav bar:
 * Requests to answer, people you're Connected with, and requests you've Sent.
 * Click someone's avatar or name to see their profile.
 */
export default function ConnectionsWindow({
  id,
  open,
  onClose,
  people,
  connections,
  dispatch,
  onViewProfile,
}: ConnectionsWindowProps) {
  const baseId = useId();
  const listFor = (view: View) => people.filter((p) => connections[p.id] === view);

  // Starts on Requests if there are any, otherwise the first view with someone in it
  const [view, setView] = useState<View>(() => VIEWS.find((v) => listFor(v.id).length > 0)?.id ?? 'received');
  const current = VIEWS.find((v) => v.id === view)!;
  const list = listFor(view);
  // Reloads when the window opens, and when someone connects or leaves
  const connectedKey = listFor('connected')
    .map((p) => p.id)
    .sort()
    .join(',');
  const sharing = useContactSharing(open, connectedKey);

  return (
    <AppWindow
      id={id}
      title="Connections"
      tourTarget="connections-window"
      accent={WINDOW_ACCENTS.lilac}
      info="Your study buddies, like a friends list. Answer connection requests, see who you’re connected with, and keep track of requests you’ve sent. Turn on Share my contact for a connection to let them see your Discord, Instagram or phone."
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
        label="Your connections"
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, count: listFor(v.id).length }))}
        value={view}
        onChange={setView}
      />

      {view === 'connected' && list.length > 0 && sharing.loaded && !sharing.haveContact && (
        <p className="m-0 text-sm opacity-70">
          Want to keep in touch outside StudBuds? Add your Discord, Instagram or phone in Profile › Contact, then
          share it with a connection here.
        </p>
      )}
      {sharing.error && view === 'connected' && (
        <p role="alert" className="m-0 text-sm text-danger">
          {sharing.error}
        </p>
      )}

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
            {list.map((p) => (
              <li key={p.id} className="list-none flex flex-col gap-2 p-3 rounded-md border-2 border-ink/25 bg-paper">
                <div className="flex items-center gap-3">
                  {onViewProfile ? (
                    <button
                      type="button"
                      onClick={() => onViewProfile(p.id)}
                      aria-label={`View ${p.name}’s profile`}
                      title="View profile"
                      // [border-image:none]: its own look, not a doodle button; the dashed ring shows hover
                      className="flex-1 min-w-0 flex items-center gap-3 p-1 -m-1 rounded-md border-0 [border-image:none] bg-transparent text-left cursor-pointer outline-2 outline-offset-2 outline-transparent hover:outline-dashed hover:outline-ink"
                    >
                      <PersonAvatar person={p} className="w-10 h-10 shrink-0" />
                      <span className="min-w-0 truncate text-lg">{p.name}</span>
                    </button>
                  ) : (
                    <>
                      <PersonAvatar person={p} className="w-10 h-10" />
                      <span className="flex-1 min-w-0 truncate text-lg">{p.name}</span>
                    </>
                  )}
                  <ConnectControl person={p} status={connections[p.id] ?? 'none'} dispatch={dispatch} canRemove />
                </div>
                {view === 'connected' && sharing.loaded && (
                  <ContactSharingRow
                    person={p}
                    shared={sharing.sharingWith.has(p.id)}
                    canShare={sharing.haveContact}
                    theirs={sharing.sharedWithMe.get(p.id)}
                    onChange={(share) => void sharing.setShared(p.id, share)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppWindow>
  );
}