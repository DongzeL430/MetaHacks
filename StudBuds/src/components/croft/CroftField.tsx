import { CROFT_COLUMNS, CROPS, DECORATIONS, cropStage, minutesLeft } from '../../dataFiles/Croft';
import type { CroftTile } from '../../dataFiles/Croft';
import { CROFT_COLORS, tileGroundStyle } from './CroftScene';
import { TileSprite } from './CroftSprites';

/*
 * The croft's field: CROFT_COLUMNS × CROFT_ROWS tiles of grass or tilled soil (CroftScene), each
 * showing its crop or decoration as a pixel sprite (CroftSprites). A dry seed shows a water drop,
 * a growing crop a progress bar, and a ready one glows gold and sways.
 * Keep the props and the button per tile, so the window, keyboard use and screen readers still work.
 */

interface CroftFieldProps {
  tiles: CroftTile[];
  /** The time to draw growth at (useNow) */
  now: number;
  selected: number | null;
  onSelect: (index: number) => void;
}

/** What a tile is, in words: for the hover note, screen readers and the selected tile's line */
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

export default function CroftField({ tiles, now, selected, onSelect }: CroftFieldProps) {
  return (
    <div
      role="group"
      aria-label="Croft field"
      className="grid gap-[3px] w-full"
      style={{ gridTemplateColumns: `repeat(${CROFT_COLUMNS}, minmax(0, 1fr))` }}
    >
      {tiles.map((tile) => {
        const stage = cropStage(tile, now);
        const label = describeTile(tile, now);
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
              'relative aspect-square min-w-0 p-0 rounded-[3px]',
              // [border-image:none]: its own look, not a doodle button
              'border-0 [border-image:none] cursor-pointer hover:brightness-110',
              isSelected ? 'z-10 outline-[3px] outline-dashed outline-ink outline-offset-1 ring-2 ring-inset ring-paper' : '',
            ].join(' ')}
          >
            <TileSprite crop={tile.crop} stage={stage} decoration={tile.decoration} />
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
