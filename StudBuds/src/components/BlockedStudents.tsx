import PersonAvatar from './PersonAvatar';
import { useBlockedStudents } from '../lib/safety';

/**
 * Profile > Account: the students you've blocked, each with Unblock. Loads when the tab shows.
 * onUnblocked: reload the lobby lists, so their sessions show again.
 */
export default function BlockedStudents({ active, onUnblocked }: { active: boolean; onUnblocked?: () => void }) {
  const { blocked, error, unblock } = useBlockedStudents(active);

  return (
    <section className="flex flex-col gap-2 pt-3 border-t-2 border-ink/15" aria-labelledby="blocked-students-title">
      <h3 id="blocked-students-title" className="m-0 text-lg">
        Blocked students
      </h3>
      {error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}
      {blocked === null ? (
        !error && <p className="m-0 text-sm opacity-70">Loading…</p>
      ) : blocked.length === 0 ? (
        <p className="m-0 text-sm opacity-70">You haven’t blocked anyone. Report or Block is at the bottom of any card.</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {blocked.map((b) => (
            <li key={b.id} className="list-none flex items-center gap-3">
              <PersonAvatar person={b} className="w-8 h-8 shrink-0" />
              <span className="flex-1 min-w-0 truncate">{b.name}</span>
              <button
                type="button"
                onClick={() =>
                  void unblock(b.id).then((ok) => {
                    if (ok) onUnblocked?.();
                  })
                }
                aria-label={`Unblock ${b.name}`}
                className="px-2.5 py-0.5 text-sm"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
