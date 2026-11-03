import { CROFT_COLUMNS, CROPS, DECORATIONS, cropStage, minutesLeft } from '../../dataFiles/Croft';
import type { CroftTile } from '../../dataFiles/Croft';

/*
 * The croft's field: CROFT_COLUMNS × CROFT_ROWS tiles. This is the plain version, with words and
 * theme colors; the pixel-art version (sprites drawn in code) replaces what each tile shows.
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

export default function CroftField({ tiles, now, selected, onSelect }: CroftFieldProps) {
  return (
    <div
      role="group"
      aria-label="Croft field"
      // Square tiles: capped so the whole field fits in the window
      className="grid gap-1 w-full max-w-md mx-auto"
      style={{ gridTemplateColumns: `repeat(${CROFT_COLUMNS}, minmax(0, 1fr))` }}
    >
      {tiles.map((tile) => {
        const stage = cropStage(tile, now);
        const label = describeTile(tile, now);
        return (
          <button
            key={tile.index}
            type="button"
            onClick={() => onSelect(tile.index)}
            aria-label={`Tile ${tile.index + 1}: ${label}`}
            aria-pressed={selected === tile.index}
            title={label}
            className={[
              'aspect-square min-w-0 p-1 flex items-center justify-center text-center text-[11px] leading-tight rounded',
              'border-2 [border-image:none] transition-colors',
              tile.ground === 'soil' ? 'bg-sand' : 'bg-free/50',
              stage === 'ready' ? 'border-accent' : 'border-ink/20',
              selected === tile.index ? 'outline-2 outline-dashed outline-ink outline-offset-1' : '',
            ].join(' ')}
          >
            <span className="line-clamp-3">
              {tile.decoration ? DECORATIONS[tile.decoration].name : tile.crop ? CROPS[tile.crop].name : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
