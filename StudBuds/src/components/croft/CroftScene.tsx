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
  hillFar: '#9cc48c',
  heather: '#a48ea8',
  hillNear: '#5f9e45',
  grass: '#6db044',
  grassDark: '#55933a',
  grassLight: '#8ccc5c',
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
  leaf: '#4b8e3a',
  leafDark: '#3a7330',
  leafLight: '#69ad4e',
  pine: '#386b34',
  pineDark: '#2c5729',
  pineLight: '#4f8746',
  wool: '#f4f0e6',
  woolShade: '#d8d2c2',
  sheepFace: '#3b3632',
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

/* ---------- Sprites: trees, pines, bushes and sheep ---------- */

/** [x, y, width, height, color], on the sprite's own pixel grid */
type Sprite = { w: number; h: number; px: [number, number, number, number, string][] };

const TREE: Sprite = {
  w: 13,
  h: 16,
  px: [
    [4, 0, 5, 1, C.leaf],
    [2, 1, 9, 1, C.leaf],
    [1, 2, 11, 5, C.leaf],
    [2, 7, 9, 2, C.leaf],
    [2, 8, 9, 1, C.leafDark],
    [4, 9, 5, 1, C.leafDark],
    [8, 5, 3, 2, C.leafDark],
    [4, 2, 2, 1, C.leafLight],
    [3, 3, 1, 2, C.leafLight],
    [6, 3, 1, 1, C.leafLight],
    [5, 10, 3, 6, C.wood],
    [7, 10, 1, 6, C.soilDark],
  ],
};

const PINE: Sprite = {
  w: 9,
  h: 16,
  px: [
    [4, 0, 1, 1, C.pine],
    [3, 1, 3, 2, C.pine],
    [2, 3, 5, 2, C.pine],
    [3, 5, 3, 1, C.pine],
    [2, 6, 5, 2, C.pine],
    [1, 8, 7, 2, C.pine],
    [2, 10, 5, 1, C.pine],
    [1, 11, 7, 1, C.pine],
    [0, 12, 9, 1, C.pine],
    [5, 3, 2, 2, C.pineDark],
    [5, 6, 2, 2, C.pineDark],
    [5, 8, 3, 2, C.pineDark],
    [5, 11, 3, 2, C.pineDark],
    [3, 2, 1, 1, C.pineLight],
    [2, 7, 1, 1, C.pineLight],
    [4, 13, 1, 3, C.wood],
  ],
};

const BUSH: Sprite = {
  w: 9,
  h: 5,
  px: [
    [2, 0, 5, 1, C.leaf],
    [1, 1, 7, 1, C.leaf],
    [0, 2, 9, 3, C.leaf],
    [1, 4, 7, 1, C.leafDark],
    [6, 2, 2, 2, C.leafDark],
    [2, 1, 2, 1, C.leafLight],
    [1, 2, 1, 1, C.leafLight],
  ],
};
const BERRY_BUSH: Sprite = { ...BUSH, px: [...BUSH.px, [3, 2, 1, 1, C.berry], [5, 3, 1, 1, C.berry], [7, 1, 1, 1, C.berry]] };
const FLOWER_BUSH: Sprite = { ...BUSH, px: [...BUSH.px, [2, 3, 1, 1, C.daisy], [5, 1, 1, 1, C.daisy], [7, 3, 1, 1, C.flax]] };

/** A sheep facing right. Two sets of legs take turns, so it looks like it's walking. */
const SHEEP_BODY: Sprite['px'] = [
  [2, 0, 5, 1, C.wool],
  [1, 1, 8, 4, C.wool],
  [0, 2, 10, 2, C.wool],
  [1, 4, 8, 1, C.woolShade],
  [6, 1, 2, 1, C.woolShade],
  [0, 1, 1, 1, C.woolShade],
  [9, 1, 3, 3, C.sheepFace],
  [9, 0, 1, 1, C.sheepFace],
];
const SHEEP_LEGS_A: Sprite['px'] = [
  [2, 5, 1, 2, C.sheepFace],
  [7, 5, 1, 2, C.sheepFace],
];
const SHEEP_LEGS_B: Sprite['px'] = [
  [3, 5, 1, 2, C.sheepFace],
  [6, 5, 1, 2, C.sheepFace],
];
const SHEEP_W = 12;
const SHEEP_H = 7;

function Rects({ px }: { px: Sprite['px'] }) {
  return (
    <>
      {px.map(([x, y, w, h, fill], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
      ))}
    </>
  );
}

function SheepRects() {
  return (
    <>
      <Rects px={SHEEP_BODY} />
      <g className="croft-legs-a">
        <Rects px={SHEEP_LEGS_A} />
      </g>
      <g className="croft-legs-b" opacity={0}>
        <Rects px={SHEEP_LEGS_B} />
      </g>
    </>
  );
}

/** How a sheep wanders: how far (pixels), one round trip (seconds), and where in it to start */
type Wander = { d: number; t: number; delay: number };
const wanderStyle = ({ d, t, delay }: Wander) =>
  ({ '--d': `${d}px`, '--t': `${t}s`, '--delay': `${delay}s` }) as CSSProperties;

/** Same "random" every visit: a small seeded generator, so nothing jumps between renders */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- The strip above the field ---------- */

/** The scene's pixel grid: wide, so it fills full screen without stretching; the middle holds the farm */
const W = 640;
const H = 60;

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

/** Where the cottage, rowan and well stand: trees stay clear of it */
const FARM = [224, 396];
const inFarm = (x: number, pad = 0) => x > FARM[0] - pad && x < FARM[1] + pad;

/** Trees along the meadow's edge and small pines up on the far hills, spaced apart, never in the farm */
const STRIP_TREES = (() => {
  const rand = seeded(7);
  const placed: { x: number; y: number; sprite: Sprite }[] = [];
  for (let tries = 0; placed.length < 16 && tries < 400; tries++) {
    const x = Math.round(8 + rand() * (W - 16));
    const far = placed.length < 6;
    if (inFarm(x, far ? 0 : 10) || placed.some((p) => Math.abs(p.x - x) < (far ? 14 : 20))) continue;
    placed.push(
      far
        ? { x, y: heightAt(x, 27, FAR) + 4, sprite: PINE }
        : { x, y: 44 + Math.round(rand() * 2), sprite: rand() < 0.35 ? PINE : TREE },
    );
  }
  // Far ones first, so nearer trees overlap them
  return placed.sort((a, b) => a.y - b.y);
})();

/** Bushes along the meadow's edge, some in flower or berry; a few near the farm, clear of the buildings */
const STRIP_BUSHES = (() => {
  const rand = seeded(19);
  const kinds = [BUSH, BUSH, BERRY_BUSH, FLOWER_BUSH];
  const placed: { x: number; y: number; sprite: Sprite }[] = [];
  for (let tries = 0; placed.length < 14 && tries < 400; tries++) {
    const x = Math.round(6 + rand() * (W - 12));
    const nearBuildings = (x > 228 && x < 284) || (x > 344 && x < 378) || (x > 296 && x < 326);
    if (nearBuildings || placed.some((p) => Math.abs(p.x - x) < 16)) continue;
    placed.push({ x, y: 47 + Math.round(rand() * 2), sprite: kinds[Math.floor(rand() * kinds.length)] });
  }
  return placed;
})();

/** Grass and flowers in the foreground meadow */
const FOREGROUND = (() => {
  const rand = seeded(31);
  return Array.from({ length: 70 }, () => ({
    x: Math.round(rand() * W),
    y: 50 + Math.round(rand() * 9),
    kind: rand() < 0.82 ? 'tuft' : rand() < 0.5 ? 'daisy' : 'flax',
  }));
})();

/** Sheep in the foreground meadow, a few in the middle so phones see them too */
const STRIP_SHEEP: { x: number; y: number; wander: Wander }[] = [
  { x: 52, y: 52, wander: { d: 18, t: 24, delay: -3 } },
  { x: 142, y: 55, wander: { d: 14, t: 20, delay: -11 } },
  { x: 236, y: 54, wander: { d: 16, t: 26, delay: -7 } },
  { x: 300, y: 50, wander: { d: 20, t: 22, delay: -15 } },
  { x: 388, y: 55, wander: { d: 12, t: 18, delay: -1 } },
  { x: 476, y: 51, wander: { d: 22, t: 28, delay: -19 } },
  { x: 574, y: 54, wander: { d: 15, t: 21, delay: -9 } },
];

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

/** A sprite standing with its bottom middle at (x, y) */
function Placed({ sprite, x, y }: { sprite: Sprite; x: number; y: number }) {
  return (
    <g transform={`translate(${x - Math.floor(sprite.w / 2)} ${y - sprite.h})`}>
      <Rects px={sprite.px} />
    </g>
  );
}

function FarmStrip() {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${W} ${H}`}
      // Fills the width at any size; on narrow windows the sides are cut, never the farm in the middle
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      className="block w-full h-[clamp(92px,19cqw,170px)]"
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

      {/* Far hills with heather, then the near hills and the meadow */}
      <path d={FAR_RIDGE} fill={C.hillFar} />
      {HEATHER.map(({ x, y }) => (
        <Px key={x} x={x} y={y} w={6} h={2} fill={C.heather} />
      ))}
      <path d={NEAR_RIDGE} fill={C.hillNear} />
      <Px x={0} y={43} w={W} h={H - 43} fill={C.grass} />
      {GROUND_TUFTS.map((x) => (
        <g key={x}>
          <Px x={x} y={44} h={2} fill={C.grassDark} />
          <Px x={x + 2} y={44} h={2} fill={C.grassDark} />
          <Px x={x + 1} y={43} h={3} fill={C.grassDark} />
        </g>
      ))}

      {/* Trees around the farm, then bushes in front of them */}
      {STRIP_TREES.map((t) => (
        <Placed key={`t${t.x}`} sprite={t.sprite} x={t.x} y={t.y} />
      ))}
      {STRIP_BUSHES.map((b) => (
        <Placed key={`b${b.x}`} sprite={b.sprite} x={b.x} y={b.y} />
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
      <Px x={253} y={44} w={4} h={H - 44} fill={C.path} />
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
      <Px x={305} y={21} w={3} fill={C.leafLight} />
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

      {/* The foreground meadow, and the sheep wandering in it */}
      {FOREGROUND.map((f, i) =>
        f.kind === 'tuft' ? (
          <g key={i}>
            <Px x={f.x} y={f.y + 1} fill={C.grassDark} />
            <Px x={f.x + 2} y={f.y + 1} fill={C.grassDark} />
            <Px x={f.x + 1} y={f.y} h={2} fill={C.grassDark} />
          </g>
        ) : (
          <Px key={i} x={f.x} y={f.y} fill={f.kind === 'daisy' ? C.daisy : C.flax} />
        ),
      )}
      {STRIP_SHEEP.map((s) => (
        <g key={s.x} transform={`translate(${s.x - SHEEP_W / 2} ${s.y - SHEEP_H})`}>
          <g className="croft-sheep" style={wanderStyle(s.wander)}>
            <SheepRects />
          </g>
        </g>
      ))}
    </svg>
  );
}

/* ---------- Groves beside the field (wide windows only) ---------- */

type GroveItem =
  | { kind: 'tree' | 'pine' | 'bush' | 'berryBush' | 'flowerBush'; left: string; top: string }
  | { kind: 'sheep'; left: string; top: string; wander: Wander };

const GROVE_SPRITES = { tree: TREE, pine: PINE, bush: BUSH, berryBush: BERRY_BUSH, flowerBush: FLOWER_BUSH };

/** Hand-placed, so each side looks different. `top` is where the sprite stands. */
const LEFT_GROVE: GroveItem[] = [
  { kind: 'tree', left: '30%', top: '24%' },
  { kind: 'bush', left: '72%', top: '14%' },
  { kind: 'pine', left: '74%', top: '50%' },
  { kind: 'flowerBush', left: '18%', top: '54%' },
  { kind: 'sheep', left: '42%', top: '74%', wander: { d: 30, t: 23, delay: -6 } },
  { kind: 'tree', left: '24%', top: '98%' },
  { kind: 'berryBush', left: '76%', top: '92%' },
];
const RIGHT_GROVE: GroveItem[] = [
  { kind: 'pine', left: '70%', top: '22%' },
  { kind: 'berryBush', left: '28%', top: '13%' },
  { kind: 'sheep', left: '30%', top: '42%', wander: { d: 26, t: 27, delay: -2 } },
  { kind: 'tree', left: '72%', top: '66%' },
  { kind: 'bush', left: '26%', top: '78%' },
  { kind: 'sheep', left: '56%', top: '96%', wander: { d: 20, t: 19, delay: -12 } },
];

/** Each grove pixel shows as this many screen pixels */
const GROVE_SCALE = 3;

function Grove({ items }: { items: GroveItem[] }) {
  return (
    // Empty on narrow windows, where the field takes the whole width
    <div aria-hidden="true" className="@container relative flex-1 min-w-0 overflow-hidden">
      {items.map((item, i) => {
        const sheep = item.kind === 'sheep';
        const w = sheep ? SHEEP_W : GROVE_SPRITES[item.kind].w;
        const h = sheep ? SHEEP_H : GROVE_SPRITES[item.kind].h;
        return (
          <div
            key={i}
            className="absolute hidden @[7rem]:block -translate-x-1/2 -translate-y-full"
            style={{ left: item.left, top: item.top }}
          >
            <svg
              viewBox={`0 0 ${w} ${h}`}
              width={w * GROVE_SCALE}
              height={h * GROVE_SCALE}
              shapeRendering="crispEdges"
              className={`block ${sheep ? 'croft-sheep' : ''}`}
              style={sheep ? wanderStyle(item.wander) : undefined}
            >
              {sheep ? <SheepRects /> : <Rects px={GROVE_SPRITES[item.kind].px} />}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Gentle motion, only when the device allows it. A sheep walks out, grazes, turns, walks back and
 * grazes again; its legs take turns while it goes.
 */
const MOTION = `
@media (prefers-reduced-motion: no-preference) {
  .croft-smoke { animation: croft-smoke 3.6s ease-out infinite; }
  .croft-sway { animation: croft-sway 2.6s ease-in-out infinite; transform-origin: 50% 100%; }
  .croft-sheep {
    animation: croft-wander var(--t, 22s) ease-in-out var(--delay, 0s) infinite;
    transform-box: fill-box;
    transform-origin: center;
  }
  .croft-legs-a { animation: croft-legs-a 0.8s linear infinite; }
  .croft-legs-b { animation: croft-legs-b 0.8s linear infinite; }
}
@keyframes croft-smoke { 0% { transform: translateY(0); opacity: 0.95; } 100% { transform: translateY(-6px); opacity: 0; } }
@keyframes croft-sway { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
@keyframes croft-wander {
  0%, 10% { transform: translateX(0) scaleX(1); }
  42%, 50% { transform: translateX(var(--d, 16px)) scaleX(1); }
  52%, 60% { transform: translateX(var(--d, 16px)) scaleX(-1); }
  92%, 98% { transform: translateX(0) scaleX(-1); }
  100% { transform: translateX(0) scaleX(1); }
}
@keyframes croft-legs-a { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
@keyframes croft-legs-b { 0%, 49% { opacity: 0; } 50%, 100% { opacity: 1; } }
`;

/** The farm, with the field (children) inside its stone wall, and groves beside it when there's room */
export default function CroftScene({ children }: { children: ReactNode }) {
  return (
    <div
      className="@container relative overflow-hidden rounded-md border-2 border-ink/40"
      style={{ ...PIXELATED, backgroundColor: C.grass, backgroundImage: MEADOW, backgroundSize: '96px 96px' }}
    >
      <style>{MOTION}</style>
      <FarmStrip />
      <div className="flex px-2.5 pb-4 pt-1 @sm:px-6 @sm:pb-6">
        <Grove items={LEFT_GROVE} />
        <div
          className="w-full max-w-[30rem] shrink-0 p-2 @sm:p-2.5 rounded-[3px]"
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
        <Grove items={RIGHT_GROVE} />
      </div>
    </div>
  );
}
