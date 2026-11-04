import { useEffect, useId, useState } from 'react';
import AppWindow, { WINDOW_ACCENTS } from '../AppWindow';
import PersonAvatar from '../PersonAvatar';
import ViewTabs, { viewPanelId, viewTabId } from '../ViewTabs';
import CroftField, { describeTile } from './CroftField';
import { CROPS, DECORATIONS, croftName, cropStage } from '../../dataFiles/Croft';
import type { CropKey, DecorationKey, VillageCroft } from '../../dataFiles/Croft';
import { useCroft, useCroftPresence, useNow, useVillage, useVisitCroft } from '../../lib/croft';

interface CroftWindowProps {
  id: string;
  open: boolean;
  onClose: () => void;
  /** Whose croft: null for your own */
  ownerId: string | null;
}

type Tab = 'croft' | 'village';

const ACTION = 'px-3 py-0.5 text-sm';

/** "2 hours ago" */
function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hour${hours === 1 ? '' : 's'} ago` : `${Math.round(hours / 24)} days ago`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 seeds need water · 3 growing", or what's left to say */
function villageStatus(c: VillageCroft): string {
  const parts = [
    c.drySeeds > 0 ? `${plural(c.drySeeds, 'seed')} need${c.drySeeds === 1 ? 's' : ''} water` : '',
    c.growing > 0 ? `${c.growing} growing` : '',
    c.ready > 0 ? `${c.ready} ready` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing planted yet';
}

/**
 * My Croft: your own small farm, or someone else's when visiting from their profile card or the
 * village. Pick a tile, then what to do with it. On someone else's croft you can water one
 * growing crop a day. The rules are in dataFiles/Croft.ts; the database checks every move.
 */
export default function CroftWindow({ id, open, onClose, ownerId }: CroftWindowProps) {
  const baseId = useId();
  const { croft, error, busy, act } = useCroft(ownerId, open);
  const here = useCroftPresence(ownerId, open);
  const now = useNow();
  const visit = useVisitCroft();
  const [tab, setTab] = useState<Tab>('croft');
  const village = useVillage(open && ownerId === null && tab === 'village');
  const [selected, setSelected] = useState<number | null>(null);
  const [seed, setSeed] = useState<CropKey>('oats');
  const [decoration, setDecoration] = useState<DecorationKey>('fence');

  useEffect(() => {
    setSelected(null);
    setTab('croft');
  }, [ownerId]);

  const tile = croft && selected !== null ? croft.tiles[selected] : null;
  const stage = tile ? cropStage(tile, now) : null;
  const mine = croft?.isMine ?? false;
  const pennies = croft?.pennies ?? 0;

  const tileActions = () => {
    if (!croft || !tile) return <p className="m-0 text-sm opacity-70">Pick a tile.</p>;
    if (!mine) {
      const growing = stage === 'seed' || stage === 'sprout' || stage === 'growing';
      return growing && croft.canHelpToday ? (
        <button type="button" disabled={busy} onClick={() => void act({ type: 'help', ownerId: croft.ownerId, index: tile.index })} className={ACTION}>
          Water it for them
        </button>
      ) : (
        <p className="m-0 text-sm opacity-70">
          {croft.canHelpToday ? 'Pick a crop that’s still growing to water it.' : 'You’ve helped here today. Come back tomorrow.'}
        </p>
      );
    }
    if (tile.decoration) {
      return (
        <button type="button" disabled={busy} onClick={() => void act({ type: 'clear', index: tile.index })} className={ACTION}>
          Clear the {DECORATIONS[tile.decoration].name.toLowerCase()}
        </button>
      );
    }
    if (tile.ground === 'grass') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => void act({ type: 'till', index: tile.index })} className={ACTION}>
            Till
          </button>
          <span className="text-sm opacity-70">or place</span>
          <select value={decoration} onChange={(e) => setDecoration(e.target.value as DecorationKey)} aria-label="Decoration" className="pl-2 pr-8 py-0.5 text-sm">
            {(Object.keys(DECORATIONS) as DecorationKey[]).map((key) => (
              <option key={key} value={key}>
                {DECORATIONS[key].name} ({DECORATIONS[key].price}p)
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || pennies < DECORATIONS[decoration].price}
            onClick={() => void act({ type: 'place', index: tile.index, decoration })}
            className={ACTION}
          >
            Place
          </button>
        </div>
      );
    }
    if (!tile.crop) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <select value={seed} onChange={(e) => setSeed(e.target.value as CropKey)} aria-label="Seed" className="pl-2 pr-8 py-0.5 text-sm">
            {(Object.keys(CROPS) as CropKey[]).map((key) => (
              <option key={key} value={key}>
                {CROPS[key].name} ({CROPS[key].seedCost}p, {CROPS[key].growMinutes} min, sells {CROPS[key].sellPrice}p)
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || pennies < CROPS[seed].seedCost}
            onClick={() => void act({ type: 'sow', index: tile.index, crop: seed })}
            className={ACTION}
          >
            Sow
          </button>
        </div>
      );
    }
    if (stage === 'seed') {
      return (
        <button type="button" disabled={busy} onClick={() => void act({ type: 'water', index: tile.index })} className={ACTION}>
          Water
        </button>
      );
    }
    if (stage === 'ready') {
      return (
        <button type="button" disabled={busy} onClick={() => void act({ type: 'harvest', index: tile.index })} className={ACTION}>
          Harvest ({CROPS[tile.crop].sellPrice}p)
        </button>
      );
    }
    return <p className="m-0 text-sm opacity-70">Growing. Come back when it’s ready.</p>;
  };

  const croftPanel = croft && (
    <>
      <CroftField tiles={croft.tiles} now={now} selected={selected} onSelect={setSelected} />

      <section aria-label="Selected tile" className="flex flex-col gap-2">
        {tile && <p className="m-0 text-sm">{describeTile(tile, now)}</p>}
        {tileActions()}
      </section>

      {croft.helpers.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="m-0 text-base">{mine ? 'Who helped' : 'Recent help'}</h3>
          <ul className="m-0 p-0 flex flex-col gap-1">
            {croft.helpers.map((h) => (
              <li key={h.id} className="list-none flex flex-wrap items-center gap-2 text-sm">
                <span className="flex-1 min-w-0">
                  {h.helperName} watered the {CROPS[h.crop].name.toLowerCase()}, {ago(h.at, now)}
                </span>
                {mine &&
                  (h.thanked ? (
                    <span className="px-1.5 rounded bg-free/45 text-xs">Thanked</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act({ type: 'thank', helpId: h.id })}
                      aria-label={`Thank ${h.helperName}`}
                      className="px-2.5 py-0.5 text-xs"
                    >
                      Thank
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {mine && croft.thanks.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="m-0 text-base">Thank-yous</h3>
          <ul className="m-0 p-0 flex flex-col gap-0.5">
            {croft.thanks.map((t) => (
              <li key={`${t.ownerName}-${t.at}`} className="list-none text-sm">
                {t.ownerName} thanked you for watering their {CROPS[t.crop].name.toLowerCase()}, {ago(t.at, now)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  const villagePanel = (
    <>
      {village.valley && (
        <p className="m-0 text-sm">
          This week in your valley: {plural(village.valley.harvests, 'crop')} harvested, {plural(village.valley.helps, 'helping hand')},{' '}
          {plural(village.valley.crofts, 'croft')}.
        </p>
      )}
      {village.crofts === null ? (
        <p className="m-0 text-sm opacity-70">Finding your neighbors…</p>
      ) : village.crofts.length === 0 ? (
        <p className="m-0 text-sm opacity-70">No one else has a croft yet.</p>
      ) : (
        <ul className="m-0 p-0 flex flex-col gap-2">
          {village.crofts.map((c) => (
            <li key={c.ownerId} className="list-none flex items-center gap-3 p-2 rounded-md border-2 border-ink/25 bg-paper">
              <PersonAvatar person={{ id: c.ownerId, name: c.ownerName, avatar: c.avatar }} className="w-9 h-9" />
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="truncate">{croftName(c.ownerName)}</span>
                <span className="text-xs opacity-75 truncate">{villageStatus(c)}</span>
              </span>
              {c.connected && <span className="px-1.5 rounded bg-free/45 text-xs">Connected</span>}
              {c.helpedToday && <span className="px-1.5 rounded bg-sand text-xs">Helped today</span>}
              {visit && (
                <button type="button" onClick={() => visit(c.ownerId)} aria-label={`Visit ${croftName(c.ownerName)}`} className="px-2.5 py-0.5 text-sm">
                  Visit
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <AppWindow
      id={id}
      title={croft ? croftName(croft.ownerName) : 'Croft'}
      accent={WINDOW_ACCENTS.mint}
      info="A small farm of your own. Till, sow, water and harvest; crops keep growing while you’re away. Other students, at any school, can visit your croft from your profile card or the village, and water one crop a day for you."
      open={open}
      onClose={onClose}
      controls={{ close: 'enabled', fullscreen: 'enabled' }}
      minWidth={300}
      minHeight={320}
      bodyClassName="p-3 flex flex-col gap-3"
      footer={
        <p role="status" className={`m-0 text-sm ${error ? 'text-danger' : 'opacity-80'}`}>
          {error || (mine ? `${pennies} pennies` : croft ? `Visiting ${croftName(croft.ownerName)}` : '')}
        </p>
      }
    >
      {!croft ? (
        <p className="m-0 text-sm opacity-70">{error ? '' : 'Opening the croft…'}</p>
      ) : (
        <>
          {here.length > 0 && (
            <p className="m-0 text-sm" aria-live="polite">
              Here now: {here.join(', ')}
            </p>
          )}

          {mine ? (
            <>
              <ViewTabs
                baseId={baseId}
                label="Croft sections"
                tabs={[
                  { id: 'croft', label: 'My croft' },
                  { id: 'village', label: 'Village' },
                ]}
                value={tab}
                onChange={setTab}
              />
              <div
                key={tab}
                role="tabpanel"
                id={viewPanelId(baseId)}
                aria-labelledby={viewTabId(baseId, tab)}
                className="flex flex-col gap-3"
              >
                {tab === 'croft' ? croftPanel : villagePanel}
              </div>
            </>
          ) : (
            croftPanel
          )}
        </>
      )}
    </AppWindow>
  );
}
