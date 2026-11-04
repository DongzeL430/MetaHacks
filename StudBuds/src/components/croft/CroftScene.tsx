import type { CSSProperties, ReactNode } from 'react';
import type { CroftTile } from '../../dataFiles/Croft';

/*
 * The farm around a croft's field: a pixel-art strip above it (hills, trees, a thatched cottage, a
 * barn, a rowan tree and a stone fountain, with sheep in the meadow) and a meadow with a dry-stone
 * wall around the field. Everything is drawn in code
 * on a pixel grid with one fixed, earthy palette, so it looks the same in every theme (the window
 * around it still follows the theme). Purely decorative, so screen readers skip it.
 * The crops and decorations on the field are in CroftSprites.tsx.
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
  glow: '#f5d78a',
  slate: '#5e6872',
  slateLight: '#7a8590',
  slateDark: '#4a535c',
  barnRed: '#9a3a2a',
  barnRedDark: '#74291d',
  loft: '#3a3330',
  water: '#6fb3d8',
  waterLight: '#bfe4f3',
  waterDark: '#4a90b8',
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

/* ---------- The farm buildings ---------- */

/**
 * The croft cottage: whitewashed stone walls, a thick thatch held down with ropes and hanging
 * stones, a stone chimney, lit windows with flower boxes, and a plank door.
 */
const COTTAGE: Sprite = (() => {
  const px: Sprite['px'] = [
    // Chimney (the thatch covers its foot)
    [36, 0, 4, 9, C.stone],
    [35, 0, 6, 1, C.stoneDark],
    [39, 1, 1, 7, C.stoneDark],
  ];
  // Thatch: a ridge, then rows widening to the full eaves, a darker band every third row
  for (let r = 0; r < 14; r++) {
    const x0 = Math.max(0, 15 - 2 * r);
    const x1 = Math.min(50, 35 + 2 * r);
    px.push([x0, 5 + r, x1 - x0 + 1, 1, r === 0 || r === 13 ? C.thatchEdge : r % 3 === 2 ? C.thatchDark : C.thatch]);
  }
  // Ropes over the thatch, each with a stone weight below the eaves
  for (const x of [9, 19, 31, 41]) {
    const top = Math.max(6, Math.ceil((15 - x) / 2) + 5, Math.ceil((x - 35) / 2) + 5);
    px.push([x, top, 1, 19 - top, C.soilDark], [x, 19, 2, 2, C.stoneDark]);
  }
  px.push(
    // Walls, a little shade at the far end, a few stones showing through the whitewash, the footing
    [3, 19, 45, 14, C.wall],
    [41, 19, 7, 14, C.wallShade],
    [5, 21, 2, 1, C.wallShade],
    [17, 30, 2, 1, C.wallShade],
    [30, 21, 2, 1, C.wallShade],
    [44, 25, 2, 1, C.stone],
    [2, 32, 47, 1, C.stoneDark],
    // Door with a stone lintel, a plank line and a brass handle
    [20, 22, 10, 1, C.stone],
    [21, 23, 8, 10, C.wood],
    [24, 23, 1, 10, C.soilDark],
    [27, 28, 1, 1, C.thatch],
  );
  // Two lit windows with crossbars, and a flower box under each
  for (const x of [7, 33]) {
    px.push(
      [x, 22, 9, 7, C.wood],
      [x + 1, 23, 7, 5, C.glow],
      [x + 4, 23, 1, 5, C.wood],
      [x + 1, 25, 7, 1, C.wood],
      [x, 30, 9, 2, C.woodLight],
      [x + 1, 29, 1, 1, C.berry],
      [x + 3, 29, 1, 1, C.daisy],
      [x + 5, 29, 1, 1, C.berry],
      [x + 7, 29, 1, 1, C.flax],
    );
  }
  return { w: 51, h: 33, px };
})();

/** A small barn: stone walls, a slate roof, a hayloft and a red door with cross braces */
const BARN: Sprite = (() => {
  const px: Sprite['px'] = [];
  for (let r = 0; r < 10; r++) {
    const x0 = Math.max(0, 14 - 2 * r);
    const x1 = Math.min(30, 16 + 2 * r);
    px.push([x0, r, x1 - x0 + 1, 1, r === 9 ? C.slateDark : r % 2 ? C.slateLight : C.slate]);
  }
  px.push(
    // Hayloft with hay peeking out
    [13, 4, 5, 4, C.loft],
    [13, 6, 5, 2, C.thatch],
    [14, 5, 1, 1, C.thatchDark],
    // Stone walls with courses and a few lit stones
    [2, 10, 27, 14, C.stone],
    [2, 13, 27, 1, C.stoneDark],
    [2, 17, 27, 1, C.stoneDark],
    [2, 21, 27, 1, C.stoneDark],
    [6, 10, 1, 3, C.stoneDark],
    [24, 14, 1, 3, C.stoneDark],
    [4, 18, 1, 3, C.stoneDark],
    [26, 22, 1, 2, C.stoneDark],
    [3, 11, 2, 1, C.stoneLight],
    [26, 15, 2, 1, C.stoneLight],
    // The red double door: lintel, two leaves, braces
    [8, 12, 15, 1, C.wood],
    [9, 13, 13, 11, C.barnRed],
    [15, 13, 1, 11, C.barnRedDark],
    [9, 15, 13, 1, C.barnRedDark],
    [9, 21, 13, 1, C.barnRedDark],
    [10, 16, 1, 1, C.barnRedDark],
    [11, 17, 1, 1, C.barnRedDark],
    [12, 18, 1, 1, C.barnRedDark],
    [13, 19, 1, 1, C.barnRedDark],
    [20, 16, 1, 1, C.barnRedDark],
    [19, 17, 1, 1, C.barnRedDark],
    [18, 18, 1, 1, C.barnRedDark],
    [17, 19, 1, 1, C.barnRedDark],
    [13, 18, 1, 1, C.thatch],
    [17, 18, 1, 1, C.thatch],
  );
  return { w: 31, h: 24, px };
})();

const HAY_BALE: Sprite = {
  w: 9,
  h: 5,
  px: [
    [1, 0, 7, 1, C.thatch],
    [0, 1, 9, 3, C.thatch],
    [1, 4, 7, 1, C.thatchDark],
    [3, 1, 1, 3, C.thatchDark],
    [6, 1, 1, 3, C.thatchDark],
    [1, 1, 1, 1, C.glow],
  ],
};

/** The rowan tree by the cottage, with red berries */
const ROWAN: Sprite = {
  w: 21,
  h: 24,
  px: [
    [9, 12, 3, 12, C.wood],
    [11, 12, 1, 12, C.soilDark],
    [4, 0, 13, 3, C.leaf],
    [2, 2, 17, 8, C.leaf],
    [0, 5, 21, 5, C.leaf],
    [1, 9, 19, 2, C.leafDark],
    [5, 1, 3, 1, C.leafLight],
    [3, 4, 2, 1, C.leafLight],
    [5, 4, 1, 1, C.berry],
    [12, 3, 1, 1, C.berry],
    [17, 7, 1, 1, C.berry],
    [3, 8, 1, 1, C.berry],
    [10, 7, 1, 1, C.berry],
  ],
};

/**
 * A tiered stone fountain: a jet on top, water spilling from the top bowl into a round basin.
 * Its water has two frames that take turns, so it looks like it's flowing.
 */
const FOUNTAIN = (() => {
  const still: Sprite['px'] = [
    // Top bowl with water in it: a wide lip, tapering underneath
    [10, 6, 11, 1, C.water],
    [6, 7, 19, 1, C.stoneLight],
    [7, 8, 17, 1, C.stone],
    [8, 9, 15, 1, C.stone],
    [19, 8, 5, 2, C.stoneDark],
    [10, 10, 11, 1, C.stoneDark],
    // The stem, shaded on one side, on a small plinth
    [13, 11, 5, 8, C.stone],
    [16, 11, 2, 8, C.stoneDark],
    [12, 18, 7, 1, C.stoneDark],
    // The basin seen from the front: back rim, water, front rim, then its stone wall
    [2, 19, 27, 1, C.stoneLight],
    [1, 20, 29, 1, C.water],
    [1, 21, 29, 1, C.waterDark],
    [0, 22, 31, 1, C.stoneLight],
    [0, 23, 31, 2, C.stone],
    [0, 25, 31, 1, C.stoneDark],
    [0, 23, 1, 2, C.stoneDark],
    [30, 23, 1, 2, C.stoneDark],
    [7, 23, 1, 2, C.stoneDark],
    [15, 23, 1, 2, C.stoneDark],
    [23, 23, 1, 2, C.stoneDark],
    [2, 23, 3, 1, C.stoneLight],
  ];
  const frame = (shift: 0 | 1): Sprite['px'] => {
    const px: Sprite['px'] = [];
    // The jet, and a drop or two at its top
    px.push([15, shift, 1, 6 - shift, C.water], [14 - shift, 1 - shift, 1, 1, C.waterLight], [16 + shift, 1 - shift, 1, 1, C.waterLight]);
    // Two streams falling from the bowl's lips into the basin
    for (let y = 8; y < 20; y++) {
      const c = (y + shift) % 2 ? C.water : C.waterLight;
      px.push([6, y, 1, 1, c], [24, y, 1, 1, c]);
    }
    // Splashes where they land, and ripples on the basin
    px.push(
      [5 + 2 * shift, 19, 1, 1, C.waterLight],
      [23 + 2 * shift, 19, 1, 1, C.waterLight],
      [4 + 3 * shift, 20, 2, 1, C.waterLight],
      [13 + 3 * shift, 20, 2, 1, C.waterLight],
      [21 + 3 * shift, 20, 1, 1, C.waterLight],
      [10 - shift, 21, 2, 1, C.water],
      [18 + shift, 21, 2, 1, C.water],
    );
    return px;
  };
  return { w: 31, h: 26, still, a: frame(0), b: frame(1) };
})();

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

/** Where the barn, cottage, rowan and fountain stand: trees and bushes stay clear of it */
const FARM = [226, 400];
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

/** Bushes along the meadow's edge, some in flower or berry, clear of the buildings */
const STRIP_BUSHES = (() => {
  const rand = seeded(19);
  const kinds = [BUSH, BUSH, BERRY_BUSH, FLOWER_BUSH];
  const placed: { x: number; y: number; sprite: Sprite }[] = [];
  for (let tries = 0; placed.length < 14 && tries < 400; tries++) {
    const x = Math.round(6 + rand() * (W - 12));
    if (inFarm(x, 4) || placed.some((p) => Math.abs(p.x - x) < 16)) continue;
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

      {/* The farm: a hay bale, the barn, the cottage with a path to the field, the rowan, the fountain */}
      <Placed sprite={HAY_BALE} x={235} y={44} />
      <Placed sprite={BARN} x={256} y={44} />
      <Placed sprite={COTTAGE} x={301} y={44} />
      <Px x={298} y={44} w={6} h={H - 44} fill={C.path} />
      {/* Chimney smoke drifting up */}
      {[
        [313, 7, 2, 0],
        [315, 3, 3, 1.2],
        [312, 0, 2, 2.4],
      ].map(([x, y, w, delay]) => (
        <rect key={y} className="croft-smoke" x={x} y={y} width={w} height={2} fill={C.smoke} style={{ animationDelay: `${delay}s` }} />
      ))}
      <Placed sprite={ROWAN} x={343} y={44} />
      <g transform={`translate(${377 - Math.floor(FOUNTAIN.w / 2)} ${44 - FOUNTAIN.h})`}>
        <Rects px={FOUNTAIN.still} />
        <g className="croft-frame-a">
          <Rects px={FOUNTAIN.a} />
        </g>
        <g className="croft-frame-b" opacity={0}>
          <Rects px={FOUNTAIN.b} />
        </g>
      </g>

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
 * grazes again; its legs take turns while it goes. The fountain's water flips between two frames.
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
  .croft-legs-a { animation: croft-legs-a 0.8s step-end infinite; }
  .croft-legs-b { animation: croft-legs-b 0.8s step-end infinite; }
  .croft-frame-a { animation: croft-legs-a 0.5s step-end infinite; }
  .croft-frame-b { animation: croft-legs-b 0.5s step-end infinite; }
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
