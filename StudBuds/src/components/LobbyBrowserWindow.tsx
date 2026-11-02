import { useId, useMemo, useState } from 'react';
import AppWindow, { WINDOW_ACCENTS } from './AppWindow';
import LobbyRow from './LobbyRow';
import type { Lobby, Person } from '../dataFiles/StudyData';
import { roleIn } from '../utils/StudyState';
import {
  ALL_SIZES,
  DEFAULT_FILTERS,
  activeFilterCount,
  fitsSchedule,
  matchesSubjects,
  passesFilters,
} from '../utils/LobbyFilters';
import type { LobbyFilters } from '../utils/LobbyFilters';

interface LobbyBrowserWindowProps {
  id: string;
  open: boolean;
  onClose: () => void;
  lobbies: Lobby[];
  people: Map<string, Person>;
  /** Lobbies already open as tabs */
  openTabIds: string[];
  onOpenLobby: (lobbyId: string) => void;
  /** Opens the host form */
  onHost: () => void;
  /** Already hosting a lobby (only one at a time): the host button is disabled */
  isHosting: boolean;
  /** The user's free slots, for the "fits my free time" criterion */
  freeSlots?: string[];
  /** The user's subjects (e.g. their courses), for the "my subjects" criterion */
  subjects?: string[];
}

const SIZE_CHIP = [
  'inline-flex items-center justify-center w-9 py-0.5 rounded-md border-2 border-[#3c3c3c]/45 text-sm',
  'cursor-pointer select-none transition-colors hover:bg-[#EADBC8]/60',
  'has-checked:bg-[#F2A65A] has-checked:border-[#3c3c3c]',
  'has-disabled:opacity-40 has-disabled:cursor-not-allowed',
  'has-focus-visible:outline-2 has-focus-visible:outline-dashed has-focus-visible:outline-offset-2',
].join(' ');

/**
 * Finds lobbies to join, like a game's server browser.
 * Lobbies you host, joined or asked to join are listed first and always shown (the matching
 * criteria don't hide your own lobbies), unless "Hide lobbies I'm in" is ticked.
 */
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
  freeSlots = [],
  subjects = [],
}: LobbyBrowserWindowProps) {
  const panelId = useId();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<LobbyFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const ctx = useMemo(() => ({ freeSet: new Set(freeSlots), subjects }), [freeSlots, subjects]);
  const scheduleKnown = ctx.freeSet.size > 0;
  const subjectsKnown = subjects.length > 0;
  const activeCount = activeFilterCount(filters, ctx);

  const set = (patch: Partial<LobbyFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleSize = (n: number) =>
    set({ sizes: filters.sizes.includes(n) ? filters.sizes.filter((s) => s !== n) : [...filters.sizes, n].sort((a, b) => a - b) });

  const isMine = (l: Lobby) => {
    const role = roleIn(l);
    return role === 'host' || role === 'member' || role === 'requested';
  };
  const q = query.trim().toLowerCase();
  const shown = lobbies
    .filter((l) => !q || l.subject.toLowerCase().includes(q))
    // Your own lobbies skip the matching criteria; only "Hide lobbies I'm in" removes them
    .filter((l) => (isMine(l) ? !filters.hideMine : passesFilters(l, filters, ctx)))
    // Yours first, then everything else in its original order
    .sort((a, b) => Number(isMine(b)) - Number(isMine(a)));

  const tagsFor = (lobby: Lobby) => [
    ...(scheduleKnown && fitsSchedule(lobby, ctx.freeSet) ? ['Fits your free time'] : []),
    ...(subjectsKnown && matchesSubjects(lobby, subjects) ? ['Your subject'] : []),
  ];

  const checkboxRow = 'flex items-start gap-2 text-sm';

  return (
    <AppWindow
      id={id}
      title="Study Lobbies"
      accent={WINDOW_ACCENTS.sky}
      info="Browse study sessions other students are hosting. Use Filters to match lobbies to your free time, subjects and group size, or host your own."
      open={open}
      onClose={onClose}
      controls={{ close: 'enabled', fullscreen: 'enabled' }}
      // No initialSize: opened from the nav bar, it takes as much room as the current layout allows
      minWidth={320}
      minHeight={280}
      bodyClassName="p-3 flex flex-col gap-3"
    >
      {/* SEARCH + FILTERS + HOST */}
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
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
          aria-controls={panelId}
          className="px-3 py-1"
        >
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        <button
          type="button"
          onClick={onHost}
          disabled={isHosting}
          title={isHosting ? 'You already host a session. Find it under Sessions.' : undefined}
          className="px-3 py-1"
        >
          + Host a session
        </button>
      </div>

      {/* FILTER PANEL */}
      {showFilters && (
        <fieldset
          id={panelId}
          className="m-0 min-w-0 px-3 pb-3 pt-1 flex flex-col gap-2 motion-safe:transition motion-safe:duration-200 starting:opacity-0 starting:-translate-y-1"
        >
          <legend className="px-1 text-sm">Match lobbies to me</legend>

          <label className={checkboxRow}>
            <input type="checkbox" checked={filters.schedule} onChange={(e) => set({ schedule: e.target.checked })} />
            <span>
              Fits my free time
              <span className="block text-xs opacity-70">
                {scheduleKnown
                  ? 'The whole session falls during times you marked free.'
                  : 'Your free times aren’t saved yet, so this doesn’t hide anything for now.'}
              </span>
            </span>
          </label>

          <label className={checkboxRow}>
            <input type="checkbox" checked={filters.subjects} onChange={(e) => set({ subjects: e.target.checked })} />
            <span>
              My subjects
              <span className="block text-xs opacity-70">
                {subjectsKnown
                  ? subjects.join(', ')
                  : 'Your subjects aren’t saved yet, so this doesn’t hide anything for now.'}
              </span>
            </span>
          </label>

          <div className="flex flex-col gap-1">
            <label className={checkboxRow}>
              <input type="checkbox" checked={filters.size} onChange={(e) => set({ size: e.target.checked })} />
              <span>Group size</span>
            </label>
            <div role="group" aria-label="Group sizes to show" className="flex flex-wrap gap-1.5 pl-6">
              {ALL_SIZES.map((n) => (
                <label key={n} className={SIZE_CHIP}>
                  <input
                    type="checkbox"
                    checked={filters.sizes.includes(n)}
                    disabled={!filters.size}
                    onChange={() => toggleSize(n)}
                    aria-label={`Groups of ${n}`}
                    className="sr-only"
                  />
                  {n}
                </label>
              ))}
            </div>
          </div>

          <label className={checkboxRow}>
            <input type="checkbox" checked={filters.openSpots} onChange={(e) => set({ openSpots: e.target.checked })} />
            <span>Only lobbies with open spots</span>
          </label>

          <label className={checkboxRow}>
            <input type="checkbox" checked={filters.hideMine} onChange={(e) => set({ hideMine: e.target.checked })} />
            <span>
              Hide lobbies I’m in
              <span className="block text-xs opacity-70">
                Ones you host, joined or asked to join. They’re always in Sessions.
              </span>
            </span>
          </label>

          <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="self-start px-3 py-0.5 text-sm">
            Reset filters
          </button>
        </fieldset>
      )}

      <p role="status" className="m-0 text-xs opacity-70">
        Showing {shown.length} of {lobbies.length} {lobbies.length === 1 ? 'lobby' : 'lobbies'}.
      </p>

      {shown.length === 0 ? (
        <p className="m-auto text-center text-sm opacity-70">
          {lobbies.length === 0
            ? 'No open lobbies right now. Host one!'
            : 'No lobbies match. Try turning off a filter or changing your search.'}
        </p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {shown.map((lobby) => (
            <LobbyRow
              key={lobby.id}
              lobby={lobby}
              people={people}
              isOpenTab={openTabIds.includes(lobby.id)}
              onOpen={onOpenLobby}
              tags={tagsFor(lobby)}
            />
          ))}
        </ul>
      )}
    </AppWindow>
  );
}