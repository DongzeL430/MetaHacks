import { CROFT_COLUMNS, CROPS, DECORATIONS, cropStage, minutesLeft } from '../../dataFiles/Croft';
import type { CroftTile } from '../../dataFiles/Croft';
import { CROFT_COLORS, tileGroundStyle } from './CroftScene';

/*
 * The croft's field: CROFT_COLUMNS × CROFT_ROWS tiles of grass or tilled soil, drawn in pixels
 * (CroftScene). Crops and decorations still show as small name labels; their sprites are Muse
 * Code's part (docs/croft-muse-code.md) and replace what each label shows.
 * Keep the props and the button per tile, so the window, keyboard use and screen readers still work.
 */

interface CroftFieldProps {
  tiles: CroftTile[];
  /** The time to draw growth at (useNow) */
  now: number;
  selected: number | null;
  onSelect: (index: number) => void;
}

/** What a tile is, in words: for the plain look and for screen readers */
export function describeTile(tile: CroftTile, now: number): string {
  if (tile.decoration) return DECORATIONS[tile.decoration].name;
  if (!tile.crop) return tile.ground === 'soil' ? 'Tilled soil' : 'Grass';
  const name = CROPS[tile.crop].name;
  const stage = cropStage(tile, now);
  if (stage === 'seed') return `${name} seed, needs water`;
  if (stage === 'ready') return `${name}, ready to harvest`;
  return `${name}, ready in ${minutesLeft(tile, now)} min`;
}

/** How far a watered crop has grown, 0 to 1 */
function grown(tile: CroftTile, now: number): number {
  if (!tile.crop || !tile.readyAt) return 0;
  const left = new Date(tile.readyAt).getTime() - now;
  return Math.min(1, Math.max(0, 1 - left / (CROPS[tile.crop].growMinutes * 60_000)));
}

/** A small water drop: this seed still needs watering */
function Droplet() {
  return (
    // Hidden on the smallest fields, where the dashed border alone marks a dry seed
    <svg viewBox="0 0 6 8" className="hidden @[16rem]:block w-1.5 h-2 shrink-0" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="2" y="0" width="2" height="2" fill={CROFT_COLORS.flax} />
      <rect x="1" y="2" width="4" height="2" fill={CROFT_COLORS.flax} />
      <rect x="0" y="4" width="6" height="3" fill={CROFT_COLORS.flax} />
      <rect x="1" y="7" width="4" height="1" fill={CROFT_COLORS.flax} />
      <rect x="1" y="4" width="1" height="2" fill="#ffffff" />
    </svg>
  );
}

export default function CroftField({ tiles, now, selected, onSelect }: CroftFieldProps) {
  return (
    <div
      role="group"
      aria-label="Croft field"
      // @container: labels size themselves to the field's width, down to a 320px phone
      className="@container grid gap-[3px] w-full"
      style={{ gridTemplateColumns: `repeat(${CROFT_COLUMNS}, minmax(0, 1fr))` }}
    >
      {tiles.map((tile) => {
        const stage = cropStage(tile, now);
        const label = describeTile(tile, now);
        const name = tile.decoration ? DECORATIONS[tile.decoration].name : tile.crop ? CROPS[tile.crop].name : null;
        const isSelected = selected === tile.index;
        const isGrowing = stage === 'sprout' || stage === 'growing';
        return (
          <button
            key={tile.index}
            type="button"
            onClick={() => onSelect(tile.index)}
            aria-label={`Tile ${tile.index + 1}: ${label}`}
            aria-pressed={isSelected}
            title={label}
            style={{
              ...tileGroundStyle(tile),
              // A ready crop glows gold around the edge
              boxShadow: stage === 'ready' ? `inset 0 0 0 2px ${CROFT_COLORS.ripe}` : undefined,
            }}
            className={[
              'relative aspect-square min-w-0 p-0 @[16rem]:p-0.5 flex items-center justify-center text-center rounded-[3px]',
              // [border-image:none]: its own look, not a doodle button
              'border-0 [border-image:none] cursor-pointer hover:brightness-110',
              isSelected ? 'z-10 outline-[3px] outline-dashed outline-ink outline-offset-1 ring-2 ring-inset ring-paper' : '',
            ].join(' ')}
          >
            {name && (
              <span
                className={[
                  'max-w-full inline-flex items-center gap-0.5 px-px @[16rem]:px-0.5 @[24rem]:px-1 py-px rounded-sm border text-ink',
                  // Text grows with the field: 8px on a 320px phone, 9px on most phones, 10px on wider windows
                  'text-[8px] @[16rem]:text-[9px] @[24rem]:text-[10px] leading-tight [overflow-wrap:anywhere]',
                  stage === 'ready'
                    ? 'croft-sway font-bold'
                    : stage === 'seed'
                      ? 'bg-paper/90 border-dashed border-ink/50'
                      : 'bg-paper/90 border-transparent',
                ].join(' ')}
                style={stage === 'ready' ? { backgroundColor: CROFT_COLORS.ripe, borderColor: CROFT_COLORS.thatchDark } : undefined}
              >
                {stage === 'seed' && <Droplet />}
                <span className="line-clamp-3 @[16rem]:line-clamp-2">{name}</span>
              </span>
            )}
            {isGrowing && (
              <span aria-hidden="true" className="absolute left-1 right-1 bottom-1 h-[3px] rounded-full bg-black/25">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.round(grown(tile, now) * 100)}%`, backgroundColor: CROFT_COLORS.ripe }}
                />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
