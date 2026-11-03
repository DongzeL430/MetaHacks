import PersonAvatar from './PersonAvatar';
import { SpotPips } from './LobbyView';
import type { Lobby, Person } from '../dataFiles/StudyData';
import { roleIn } from '../utils/StudyState';
import type { LobbyRole } from '../utils/StudyState';
import { describeSlots } from '../utils/ScheduleBlocks';

export const LOBBY_STATUS: Record<LobbyRole, { label: string; className: string }> = {
  host: { label: 'Hosting', className: 'bg-accent/45' },
  member: { label: 'Joined', className: 'bg-free/60' },
  requested: { label: 'Requested', className: 'bg-info/60' },
  locked: { label: 'Locked', className: 'bg-ink/15' },
  full: { label: 'Full', className: 'bg-ink/15' },
  open: { label: 'Open', className: 'bg-paper border-2 border-ink/30' },
};

interface LobbyRowProps {
  lobby: Lobby;
  people: Map<string, Person>;
  /** Already open as a tab: outlined darker */
  isOpenTab: boolean;
  onOpen: (lobbyId: string) => void;
  /** Small match labels, e.g. "Fits your free time" */
  tags?: string[];
  /** Extra line, e.g. "2 people waiting" for a lobby you host */
  note?: string;
}

/** One lobby in a list: host, subject, when it meets, spots, and your status. Click to open it. */
export default function LobbyRow({ lobby, people, isOpenTab, onOpen, tags = [], note }: LobbyRowProps) {
  const status = LOBBY_STATUS[roleIn(lobby)];
  const host = people.get(lobby.hostId);
  const when = describeSlots(lobby.timeSlots, { short: true });

  return (
    <li className="list-none">
      <button
        type="button"
        onClick={() => onOpen(lobby.id)}
        aria-label={`${lobby.subject}, hosted by ${host?.name ?? 'someone'}${when ? `, ${describeSlots(lobby.timeSlots)}` : ''}${lobby.location ? `, at ${lobby.location}` : ''}, ${lobby.memberIds.length} of ${lobby.maxSize} spots, ${status.label}${tags.length ? `, ${tags.join(', ')}` : ''}`}
        className={[
          'w-full p-3 flex items-center gap-3 text-left rounded-md',
          'border-2 [border-image:none] bg-paper transition-colors',
          'hover:bg-sand/60 hover:border-ink/70',
          isOpenTab ? 'border-ink/70' : 'border-ink/25',
        ].join(' ')}
      >
        {host && <PersonAvatar person={host} className="w-11 h-11" />}

        <span className="flex-1 min-w-0 flex flex-col gap-0.5" aria-hidden="true">
          <span className="text-lg leading-tight truncate">{lobby.subject}</span>
          <span className="text-xs opacity-70 truncate">Host: {host?.name ?? 'Unknown'}</span>
          {when && <span className="text-xs truncate">{when}</span>}
          {lobby.location && <span className="text-xs truncate opacity-80">At {lobby.location}</span>}
          {note && <span className="text-xs text-danger truncate">{note}</span>}
          {tags.length > 0 && (
            <span className="flex flex-wrap gap-1 mt-0.5">
              {tags.map((tag) => (
                <span key={tag} className="px-1.5 rounded bg-free/45 text-[11px]">
                  {tag}
                </span>
              ))}
            </span>
          )}
        </span>

        <span className="shrink-0 flex flex-col items-end gap-1" aria-hidden="true">
          <SpotPips filled={lobby.memberIds.length} max={lobby.maxSize} />
          <span className={`px-2 rounded text-xs ${status.className}`}>{status.label}</span>
        </span>
      </button>
    </li>
  );
}