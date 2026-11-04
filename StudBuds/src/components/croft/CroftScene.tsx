import type { CSSProperties, ReactNode } from 'react';
import type { CroftTile } from '../../dataFiles/Croft';

/*
 * The farm around a croft's field: a pixel-art strip above it (hills, a thatched cottage, a rowan
 * tree and a well) and a meadow with a dry-stone wall around the field. Everything is drawn in code
 * on a pixel grid with one fixed, earthy palette, so it looks the same in every theme (the window
 * around it still follows the theme). Purely decorative, so screen readers skip it.
 * The crop and decoration sprites are Muse Code's part (docs/croft-muse-code.md).
 */

/** One fixed palette for the whole croft */
export const CROFT_COLORS = {
  skyTop: '#bcd8e2',
  sky: '#cfe3ea',
  skyLow: '#e1ecee',
  cloud: '#f7f4ec',
  cloudShade: '#e2e5e1',
  hillFar: '#a3bf9c',
  heather: '#a48ea8',
  hillNear: '#7a9f62',
  grass: '#86ad5e',
  grassDark: '#6e9649',
  grassLight: '#9cc06f',
  flax: '#7fa3c9',
  daisy: '#f4f1e8',
  soil: '#8b6a49',
  soilDark: '#6d5038',
  soilLight: '#a2805b',
  thatch: '#cfa64c',
  thatchDark: '#a9832f',
  thatchEdge: '#8c6a26',
  wall: '#ebe1cc',
  wallShade: '#d6c8ab',
  stone: '#aaa79c',
  stoneLight: '#bdbab0',
  stoneDark: '#8e8b81',
  stoneGap: '#6b6860',
  wood: '#6b4a33',
  woodLight: '#7d5a40',
  window: '#3f5361',
  leaf: '#5f8c4d',
  leafDark: '#4c7640',
  berry: '#b5452f',
  path: '#d2bd8f',
  smoke: '#eeece6',
  ripe: '#f3dc8a',
} as const;
const C = CROFT_COLORS;

/* ---------- Small tiled textures (data URIs, so there are no image files) ---------- */

const rect = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${fill}'/>`;

const texture = (w: number, h: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' shape-rendering='crispEdges'>${body}</svg>`,
  )}")`;

/** A little "v" of grass blades */
const tuft = (x: number, y: number) =>
  rect(x, y + 1, 1, 2, C.grassDark) + rect(x + 2, y + 1, 1, 2, C.grassDark) + rect(x + 1, y, 1, 3, C.grassDark) + rect(x + 1, y - 1, 1, 1, C.grassLight);

/** Three grass tiles, so the field doesn't look stamped */
const GRASS = [
  texture(16, 16, rect(0, 0, 16, 16, C.grass) + tuft(2, 3) + tuft(10, 10) + rect(6, 12, 1, 1, C.grassLight) + rect(13, 3, 1, 1, C.grassLight)),
  texture(16, 16, rect(0, 0, 16, 16, C.grass) + tuft(9, 2) + tuft(3, 10) + rect(13, 13, 1, 1, C.flax) + rect(5, 5, 1, 1, C.grassLight)),
  texture(16, 16, rect(0, 0, 16, 16, C.grass) + tuft(6, 6) + rect(2, 13, 1, 1, C.grassLight) + rect(12, 3, 1, 1, C.grassLight) + tuft(12, 12)),
];

/** Tilled soil: three furrows, each with a lit ridge above it */
const SOIL = texture(
  16,
  16,
  rect(0, 0, 16, 16, C.soil) +
    [2, 7, 12].map((y) => rect(0, y - 1, 16, 1, C.soilLight) + rect(0, y, 16, 2, C.soilDark)).join('') +
    rect(5, 4, 1, 1, C.soilDark) +
    rect(11, 10, 1, 1, C.soilLight) +
    rect(2, 15, 1, 1, C.soilDark),
);

/**
 * The meadow around the wall: grass with blades at uneven spots and the odd daisy or flax flower.
 * A large tile (48 pixels, shown at 96), so the repeat doesn't read as a pattern.
 */
const MEADOW = texture(
  48,
  48,
  rect(0, 0, 48, 48, C.grass) +
    [
      [4, 6],
      [19, 3],
      [37, 9],
      [11, 21],
      [29, 26],
      [43, 33],
      [6, 38],
      [22, 43],
    ]
      .map(([x, y]) => tuft(x, y))
      .join('') +
    [
      [15, 12],
      [33, 18],
      [26, 36],
      [41, 44],
      [8, 29],
    ]
      .map(([x, y]) => rect(x, y, 1, 1, C.grassLight))
      .join('') +
    rect(31, 6, 1, 1, C.daisy) +
    rect(14, 33, 1, 1, C.flax),
);

/** Dry-stone wall: two courses of irregular stones with dark gaps between them */
const STONES = texture(
  16,
  8,
  rect(0, 0, 16, 8, C.stoneGap) +
    rect(0, 0, 6, 3, C.stone) +
    rect(1, 0, 4, 1, C.stoneLight) +
    rect(7, 0, 5, 3, C.stoneDark) +
    rect(13, 0, 3, 3, C.stone) +
    rect(0, 4, 3, 3, C.stoneDark) +
    rect(4, 4, 6, 3, C.stone) +
    rect(5, 4, 3, 1, C.stoneLight) +
    rect(11, 4, 5, 3, C.stoneDark),
);

const PIXELATED: CSSProperties = { imageRendering: 'pixelated' };

/** What a field tile's ground looks like: tilled soil, or one of three grass patterns */
export function tileGroundStyle(tile: CroftTile): CSSProperties {
  return {
    ...PIXELATED,
    backgroundImage: tile.ground === 'soil' ? SOIL : GRASS[(tile.index * 7) % GRASS.length],
    backgroundSize: '100% 100%',
    backgroundColor: tile.ground === 'soil' ? C.soil : C.grass,
  };
}

/* ---------- The strip above the field ---------- */

/** The scene's pixel grid: wide, so it fills full screen without stretching; the middle holds the farm */
const W = 640;
const H = 48;

type Wave = [amplitude: number, period: number, phase: number];
const heightAt = (x: number, base: number, waves: Wave[]) =>
  Math.round(base + waves.reduce((sum, [a, p, ph]) => sum + a * Math.sin(x / p + ph), 0));

/** A hill line drawn in pixel steps */
function ridge(base: number, waves: Wave[]): string {
  let d = `M0 ${H}`;
  for (let x = 0; x < W; x += 2) d += ` V${heightAt(x, base, waves)} H${x + 2}`;
  return `${d} V${H} Z`;
}

const FAR: Wave[] = [
  [3, 41, 0.3],
  [2, 17, 1.2],
  [1, 7, 2],
];
const NEAR: Wave[] = [
  [2.5, 33, 2],
  [1.5, 11, 0.5],
];
const FAR_RIDGE = ridge(27, FAR);
const NEAR_RIDGE = ridge(37, NEAR);
const HEATHER = [40, 132, 214, 404, 488, 590].map((x) => ({ x, y: heightAt(x, 27, FAR) + 2 }));
const CLOUDS = [
  [56, 6],
  [178, 11],
  [300, 4],
  [436, 9],
  [560, 5],
];
const GROUND_TUFTS = Array.from({ length: 28 }, (_, i) => 9 + i * 23);

/** The thatched roof: rows widening by two pixels a side, darker every third row */
const ROOF = Array.from({ length: 11 }, (_, i) => ({
  y: 23 + i,
  x: 255 - (2 * i + 3),
  w: 4 * i + 6,
  fill: i === 10 ? C.thatchEdge : i % 3 === 2 ? C.thatchDark : C.thatch,
}));
const WELL_ROOF = Array.from({ length: 5 }, (_, i) => ({ y: 23 + i, x: 360 - (2 * i + 2), w: 4 * i + 4 }));

function Px({ x, y, w = 1, h = 1, fill }: { x: number; y: number; w?: number; h?: number; fill: string }) {
  return <rect x={x} y={y} width={w} height={h} fill={fill} />;
}

function FarmStrip() {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${W} ${H}`}
      // Fills the width at any size; on narrow windows the sides are cut, never the farm in the middle
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      className="block w-full h-[clamp(76px,16cqw,140px)]"
    >
      {/* Sky in three bands, and clouds */}
      <Px x={0} y={0} w={W} h={10} fill={C.skyTop} />
      <Px x={0} y={10} w={W} h={12} fill={C.sky} />
      <Px x={0} y={22} w={W} h={26} fill={C.skyLow} />
      {CLOUDS.map(([x, y]) => (
        <g key={x}>
          <Px x={x + 2} y={y} w={8} fill={C.cloud} />
          <Px x={x} y={y + 1} w={12} h={2} fill={C.cloud} />
          <Px x={x + 1} y={y + 3} w={10} fill={C.cloudShade} />
        </g>
      ))}

      {/* Far hills with heather, then the near hills and the meadow edge */}
      <path d={FAR_RIDGE} fill={C.hillFar} />
      {HEATHER.map(({ x, y }) => (
        <Px key={x} x={x} y={y} w={6} h={2} fill={C.heather} />
      ))}
      <path d={NEAR_RIDGE} fill={C.hillNear} />
      <Px x={0} y={43} w={W} h={5} fill={C.grass} />
      {GROUND_TUFTS.map((x) => (
        <g key={x}>
          <Px x={x} y={44} h={2} fill={C.grassDark} />
          <Px x={x + 2} y={44} h={2} fill={C.grassDark} />
          <Px x={x + 1} y={43} h={3} fill={C.grassDark} />
        </g>
      ))}

      {/* Cottage: chimney first, so the thatch covers its foot */}
      <Px x={264} y={19} w={4} h={9} fill={C.stone} />
      <Px x={263} y={19} w={6} fill={C.stoneDark} />
      <Px x={238} y={33} w={34} h={11} fill={C.wall} />
      <Px x={266} y={33} w={6} h={11} fill={C.wallShade} />
      <Px x={237} y={43} w={36} fill={C.stoneDark} />
      <Px x={252} y={37} w={6} h={7} fill={C.wood} />
      <Px x={253} y={38} h={5} fill={C.woodLight} />
      <Px x={241} y={35} w={7} fill={C.wood} />
      <Px x={242} y={36} w={5} h={4} fill={C.window} />
      <Px x={261} y={35} w={7} fill={C.wood} />
      <Px x={262} y={36} w={5} h={4} fill={C.window} />
      {ROOF.map((row) => (
        <Px key={row.y} x={row.x} y={row.y} w={row.w} fill={row.fill} />
      ))}
      <Px x={253} y={44} w={4} h={4} fill={C.path} />
      {/* Chimney smoke drifting up */}
      {[
        [265, 15, 2, 0],
        [267, 11, 3, 1.2],
        [264, 7, 2, 2.4],
      ].map(([x, y, w, delay]) => (
        <rect key={y} className="croft-smoke" x={x} y={y} width={w} height={2} fill={C.smoke} style={{ animationDelay: `${delay}s` }} />
      ))}

      {/* Rowan tree with red berries */}
      <Px x={309} y={32} w={3} h={12} fill={C.wood} />
      <Px x={304} y={20} w={13} h={3} fill={C.leaf} />
      <Px x={302} y={22} w={17} h={8} fill={C.leaf} />
      <Px x={300} y={25} w={21} h={5} fill={C.leaf} />
      <Px x={301} y={29} w={19} h={2} fill={C.leafDark} />
      {[
        [305, 24],
        [312, 23],
        [317, 27],
        [303, 28],
        [310, 27],
      ].map(([x, y]) => (
        <Px key={`${x}-${y}`} x={x} y={y} fill={C.berry} />
      ))}

      {/* Stone well with a little thatched roof */}
      <Px x={353} y={27} w={2} h={9} fill={C.wood} />
      <Px x={367} y={27} w={2} h={9} fill={C.wood} />
      {WELL_ROOF.map((row) => (
        <Px key={row.y} x={row.x} y={row.y} w={row.w} fill={row.y === 27 ? C.thatchEdge : C.thatch} />
      ))}
      <Px x={355} y={30} w={12} fill={C.wood} />
      <Px x={361} y={31} h={3} fill={C.soil} />
      <Px x={359} y={34} w={4} h={2} fill={C.wood} />
      <Px x={351} y={35} w={20} fill={C.stoneDark} />
      <Px x={352} y={36} w={18} h={8} fill={C.stone} />
      <Px x={352} y={39} w={18} fill={C.stoneDark} />
      <Px x={352} y={42} w={18} fill={C.stoneDark} />
      <Px x={357} y={36} h={3} fill={C.stoneDark} />
      <Px x={364} y={39} h={3} fill={C.stoneDark} />
    </svg>
  );
}

/** Gentle motion, only when the device allows it */
const MOTION = `
@media (prefers-reduced-motion: no-preference) {
  .croft-smoke { animation: croft-smoke 3.6s ease-out infinite; }
  .croft-sway { animation: croft-sway 2.6s ease-in-out infinite; transform-origin: 50% 100%; }
}
@keyframes croft-smoke { 0% { transform: translateY(0); opacity: 0.95; } 100% { transform: translateY(-6px); opacity: 0; } }
@keyframes croft-sway { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
`;

/** The farm, with the field (children) inside its stone wall */
export default function CroftScene({ children }: { children: ReactNode }) {
  return (
    <div
      className="@container relative overflow-hidden rounded-md border-2 border-ink/40"
      style={{ ...PIXELATED, backgroundColor: C.grass, backgroundImage: MEADOW, backgroundSize: '96px 96px' }}
    >
      <style>{MOTION}</style>
      <FarmStrip />
      <div className="px-2.5 pb-4 pt-1 @sm:px-6 @sm:pb-6">
        <div
          className="mx-auto w-full max-w-[30rem] p-2 @sm:p-2.5 rounded-[3px]"
          style={{
            ...PIXELATED,
            backgroundColor: C.stoneGap,
            backgroundImage: STONES,
            backgroundSize: '32px 16px',
            boxShadow: '0 3px 0 rgba(0, 0, 0, 0.22)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
