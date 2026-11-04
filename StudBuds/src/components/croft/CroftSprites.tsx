import type { CropKey, CropStage, DecorationKey } from '../../dataFiles/Croft';
import { CROFT_COLORS as C } from './CroftScene';

/*
 * The croft's pixel sprites, drawn in code on a 16 × 16 grid: six crops at four stages each
 * (seed, sprout, growing, ready), the seven decorations, and small status pictures for the village
 * list. Same fixed palette as the scene, so they look the same in every theme. Decorative: each
 * tile's button already says what's on it, for screen readers.
 */

/** [x, y, width, height, color] */
type Px = [number, number, number, number, string];

/** Colors the plants need beyond the scene's palette */
const P = {
  oat: '#9cc263',
  oatLight: '#b9d77f',
  oatGold: '#e3c66e',
  oatGoldDark: '#c4a24c',
  barley: '#86b452',
  barleyLight: '#a3cc68',
  barleyGold: '#d9b45a',
  barleyAwn: '#b8913a',
  kale: '#3c7a47',
  kaleLight: '#5c9c5a',
  kaleRib: '#9fc98a',
  kaleEdge: '#5a5f7e',
  leek: '#4f8f73',
  leekLight: '#6fae86',
  leekWhite: '#eef0e2',
  bean: '#4a8f3c',
  beanLight: '#6fb050',
  pod: '#c2dd78',
  podTip: '#8fae4c',
  flaxStem: '#6a9f5e',
  flaxBlue: '#7fa3c9',
  flaxBlueDark: '#5c80ab',
  iron: '#3b3632',
  pink: '#d9889a',
};

/** Seed colors, so even a planted row hints at what's in it */
const SEED_COLOR: Record<CropKey, string> = {
  oats: '#d9c27a',
  kale: '#5b4636',
  leeks: '#2f2a26',
  barley: '#d6b25a',
  beans: '#e2d3b0',
  flax: '#8a5a3a',
};

/** Three little mounds with a seed showing in each */
const seed = (crop: CropKey): Px[] =>
  [3, 7, 11].flatMap((x, i) => {
    const y = i === 1 ? 12 : 11;
    return [
      [x, y, 3, 1, C.soilDark],
      [x + 1, y - 1, 1, 1, C.soilLight],
      [x + 1, y - 1, 1, 1, SEED_COLOR[crop]],
    ] as Px[];
  });

/** Grass-like blades: [x, top, height] each, darker at the base */
const blades = (list: [number, number, number][], color: string, tip: string): Px[] =>
  list.flatMap(([x, top, h]) => [
    [x, top, 1, h, color],
    [x, top, 1, 1, tip],
  ] as Px[]);

const CROPS: Record<CropKey, Record<Exclude<CropStage, 'seed'>, Px[]>> = {
  oats: {
    sprout: blades([[4, 10, 4], [5, 11, 3], [10, 10, 4], [11, 12, 2]], P.oat, P.oatLight),
    growing: blades([[2, 6, 8], [3, 4, 10], [5, 7, 7], [8, 5, 9], [9, 3, 11], [11, 6, 8], [13, 5, 9]], P.oat, P.oatLight),
    ready: [
      ...blades([[2, 6, 8], [4, 4, 10], [7, 5, 9], [9, 3, 11], [12, 5, 9], [14, 7, 7]], P.oatGoldDark, P.oatGold),
      // Drooping seed heads
      [1, 4, 1, 2, P.oatGold],
      [3, 2, 1, 2, P.oatGold],
      [5, 3, 1, 1, P.oatGold],
      [6, 3, 1, 2, P.oatGold],
      [8, 1, 1, 2, P.oatGold],
      [10, 2, 1, 2, P.oatGold],
      [11, 3, 1, 2, P.oatGold],
      [13, 3, 1, 2, P.oatGold],
      [15, 5, 1, 2, P.oatGold],
    ],
  },
  barley: {
    sprout: blades([[4, 11, 3], [5, 10, 4], [6, 12, 2], [10, 11, 3], [11, 10, 4]], P.barley, P.barleyLight),
    growing: [
      ...blades([[2, 7, 7], [4, 5, 9], [6, 6, 8], [9, 5, 9], [11, 6, 8], [13, 7, 7]], P.barley, P.barleyLight),
      // Green ears coming
      [4, 3, 1, 2, P.barleyLight],
      [9, 3, 1, 2, P.barleyLight],
    ],
    ready: [
      ...blades([[2, 7, 7], [4, 6, 8], [6, 7, 7], [9, 6, 8], [11, 7, 7], [13, 6, 8]], P.barleyAwn, P.barleyGold),
      // Fat golden ears with whiskers
      ...[2, 4, 6, 9, 11, 13].flatMap((x, i) => {
        const top = i % 2 ? 2 : 3;
        return [
          [x, top, 1, 4, P.barleyGold],
          [x - 1, top - 1, 1, 1, P.barleyAwn],
          [x + 1, top - 2, 1, 1, P.barleyAwn],
        ] as Px[];
      }),
    ],
  },
  kale: {
    sprout: [
      [4, 12, 3, 2, P.kale],
      [5, 11, 1, 1, P.kaleLight],
      [10, 12, 3, 2, P.kale],
      [11, 11, 1, 1, P.kaleLight],
    ],
    growing: [
      [2, 9, 5, 5, P.kale],
      [3, 8, 3, 1, P.kaleLight],
      [4, 10, 1, 4, P.kaleRib],
      [9, 8, 6, 6, P.kale],
      [10, 7, 4, 1, P.kaleLight],
      [12, 9, 1, 5, P.kaleRib],
    ],
    ready: [
      // Big curly leaves, frilled at the edges, pale ribs down the middle
      [1, 5, 14, 9, P.kale],
      [2, 3, 5, 2, P.kale],
      [9, 2, 5, 3, P.kale],
      [0, 7, 1, 5, P.kale],
      [15, 6, 1, 5, P.kale],
      [2, 4, 1, 1, P.kaleEdge],
      [5, 3, 1, 1, P.kaleEdge],
      [10, 2, 1, 1, P.kaleEdge],
      [13, 3, 1, 1, P.kaleEdge],
      [0, 8, 1, 1, P.kaleEdge],
      [15, 9, 1, 1, P.kaleEdge],
      [3, 6, 2, 2, P.kaleLight],
      [10, 4, 2, 2, P.kaleLight],
      [4, 4, 1, 10, P.kaleRib],
      [11, 3, 1, 11, P.kaleRib],
      [7, 8, 2, 6, P.kaleRib],
    ],
  },
  leeks: {
    sprout: blades([[4, 9, 5], [6, 10, 4], [10, 9, 5], [12, 10, 4]], P.leek, P.leekLight),
    growing: [
      // White stems, then leaves fanning out
      [4, 11, 2, 3, P.leekWhite],
      [10, 11, 2, 3, P.leekWhite],
      ...blades([[3, 6, 5], [4, 4, 7], [6, 5, 6], [9, 6, 5], [10, 4, 7], [12, 5, 6]], P.leek, P.leekLight),
    ],
    ready: [
      [3, 9, 3, 5, P.leekWhite],
      [10, 9, 3, 5, P.leekWhite],
      [5, 9, 1, 5, C.wallShade],
      [12, 9, 1, 5, C.wallShade],
      ...blades([[1, 3, 6], [2, 2, 7], [4, 1, 8], [6, 2, 7], [7, 4, 5], [8, 3, 6], [9, 2, 7], [11, 1, 8], [13, 2, 7], [14, 3, 6]], P.leek, P.leekLight),
    ],
  },
  beans: {
    sprout: [
      [5, 11, 1, 3, P.bean],
      [4, 10, 1, 1, P.beanLight],
      [6, 10, 1, 1, P.beanLight],
      [10, 11, 1, 3, P.bean],
      [9, 10, 1, 1, P.beanLight],
      [11, 10, 1, 1, P.beanLight],
    ],
    growing: [
      // A hazel stake, the vine climbing halfway up it in leafy clumps
      [7, 3, 2, 11, C.wood],
      [8, 3, 1, 11, C.soilDark],
      [5, 9, 3, 2, P.bean],
      [9, 8, 3, 2, P.bean],
      [6, 11, 2, 2, P.bean],
      [9, 12, 2, 1, P.bean],
      [5, 9, 1, 1, P.beanLight],
      [10, 8, 1, 1, P.beanLight],
    ],
    ready: [
      [7, 1, 2, 13, C.wood],
      [8, 1, 1, 13, C.soilDark],
      // Leaves all the way up, with gaps so the stake shows
      [4, 2, 3, 2, P.bean],
      [9, 3, 3, 2, P.bean],
      [3, 6, 4, 2, P.bean],
      [9, 6, 4, 3, P.bean],
      [4, 10, 3, 2, P.bean],
      [9, 10, 3, 2, P.bean],
      [6, 4, 1, 1, P.bean],
      [9, 9, 1, 1, P.bean],
      [4, 2, 1, 1, P.beanLight],
      [10, 3, 1, 1, P.beanLight],
      [3, 6, 1, 1, P.beanLight],
      [11, 6, 1, 1, P.beanLight],
      // Fat pods hanging down
      [3, 8, 2, 3, P.pod],
      [3, 10, 1, 1, P.podTip],
      [12, 9, 2, 3, P.pod],
      [13, 11, 1, 1, P.podTip],
      [5, 12, 1, 2, P.pod],
      [10, 12, 1, 2, P.pod],
      [11, 4, 1, 2, P.pod],
    ],
  },
  flax: {
    sprout: blades([[4, 11, 3], [5, 10, 4], [10, 11, 3], [11, 10, 4]], P.flaxStem, P.oatLight),
    growing: [
      ...blades([[2, 5, 9], [5, 4, 10], [8, 5, 9], [11, 4, 10], [14, 6, 8]], P.flaxStem, P.oatLight),
      [3, 8, 1, 1, P.flaxStem],
      [6, 7, 1, 1, P.flaxStem],
      [9, 9, 1, 1, P.flaxStem],
      [12, 8, 1, 1, P.flaxStem],
    ],
    ready: [
      ...blades([[2, 5, 9], [5, 4, 10], [8, 5, 9], [11, 4, 10], [14, 6, 8]], P.flaxStem, P.flaxStem),
      // Sky-blue flowers on top
      ...[[2, 4], [5, 3], [8, 4], [11, 3], [14, 5]].flatMap(([x, y]) => [
        [x - 1, y - 1, 3, 1, P.flaxBlue],
        [x - 1, y, 1, 1, P.flaxBlue],
        [x + 1, y, 1, 1, P.flaxBlue],
        [x, y, 1, 1, P.flaxBlueDark],
      ] as Px[]),
    ],
  },
};

const DECORATIONS: Record<DecorationKey, Px[]> = {
  // A woven wicker hurdle: three rods woven through stakes, grass showing between them
  fence: [
    [1, 3, 2, 12, C.wood],
    [7, 3, 2, 12, C.wood],
    [13, 3, 2, 12, C.wood],
    [1, 2, 2, 1, C.woodLight],
    [7, 2, 2, 1, C.woodLight],
    [13, 2, 2, 1, C.woodLight],
    ...[5, 8, 11].flatMap((y, row) => [
      [0, y, 16, 2, C.woodLight] as Px,
      [0, y + 1, 16, 1, C.thatchDark] as Px,
      // Where the rod passes behind a stake, the stake shows through
      ...[1, 7, 13].map((x, i) => ((i + row) % 2 ? [x, y, 2, 2, C.wood] : [x + 2, y, 1, 2, C.wood]) as Px),
    ]),
  ],
  // A raised bed of herbs in flower
  herbs: [
    [1, 9, 14, 6, C.wood],
    [2, 10, 12, 3, C.soil],
    [2, 7, 4, 4, C.leaf],
    [7, 6, 3, 5, C.leafLight],
    [11, 7, 3, 4, C.leaf],
    [3, 6, 1, 1, P.pink],
    [5, 7, 1, 1, C.daisy],
    [8, 5, 1, 1, P.pink],
    [12, 6, 1, 1, C.daisy],
    [13, 7, 1, 1, P.pink],
    [1, 14, 14, 1, C.soilDark],
  ],
  // A straw beehive: coils of straw, a dark doorway, a bee out for a walk
  skep: [
    [6, 3, 4, 1, C.thatch],
    [5, 4, 6, 2, C.thatch],
    [4, 6, 8, 2, C.thatch],
    [3, 8, 10, 5, C.thatch],
    [5, 5, 6, 1, C.thatchDark],
    [4, 7, 8, 1, C.thatchDark],
    [3, 9, 10, 1, C.thatchDark],
    [3, 11, 10, 1, C.thatchDark],
    [7, 11, 2, 2, C.loft],
    [2, 13, 12, 2, C.wood],
    [13, 3, 2, 1, P.iron],
    [13, 2, 1, 1, C.glow],
  ],
  // An iron post with a glowing lantern hanging from its arm
  lantern: [
    [6, 3, 2, 12, P.iron],
    [6, 2, 6, 1, P.iron],
    [10, 3, 1, 1, P.iron],
    [9, 4, 3, 1, P.iron],
    [9, 5, 3, 4, C.glow],
    [9, 5, 1, 4, P.iron],
    [11, 5, 1, 4, P.iron],
    [9, 9, 3, 1, P.iron],
    [10, 6, 1, 2, C.daisy],
    [4, 14, 6, 1, P.iron],
  ],
  // A young rowan with red berries
  rowan: [
    [7, 9, 2, 6, C.wood],
    [8, 9, 1, 6, C.soilDark],
    [4, 1, 8, 2, C.leaf],
    [2, 3, 12, 5, C.leaf],
    [3, 8, 10, 1, C.leafDark],
    [5, 2, 2, 1, C.leafLight],
    [3, 4, 1, 2, C.leafLight],
    [4, 3, 1, 1, C.berry],
    [9, 2, 1, 1, C.berry],
    [12, 5, 1, 1, C.berry],
    [6, 6, 1, 1, C.berry],
    [10, 7, 1, 1, C.berry],
  ],
  // A standing stone with lichen and a carved spiral
  stone: [
    [6, 1, 4, 1, C.stone],
    [5, 2, 6, 12, C.stone],
    [4, 6, 1, 8, C.stone],
    [9, 2, 2, 12, C.stoneDark],
    [5, 2, 1, 4, C.stoneLight],
    [6, 5, 3, 1, C.stoneDark],
    [6, 5, 1, 3, C.stoneDark],
    [6, 7, 2, 1, C.stoneDark],
    [8, 5, 1, 2, C.stoneDark],
    [5, 10, 1, 1, C.grassLight],
    [7, 12, 2, 1, C.grassLight],
    [3, 14, 10, 1, C.grassDark],
  ],
  // A sheep, grazing
  sheep: [
    [4, 5, 5, 1, C.wool],
    [3, 6, 8, 4, C.wool],
    [2, 7, 10, 2, C.wool],
    [3, 9, 8, 1, C.woolShade],
    [8, 6, 2, 1, C.woolShade],
    [12, 7, 3, 3, C.sheepFace],
    [12, 6, 1, 1, C.sheepFace],
    [4, 10, 1, 2, C.sheepFace],
    [9, 10, 1, 2, C.sheepFace],
    [2, 12, 12, 1, C.grassDark],
  ],
};

/** A little water drop, top right: this seed still needs watering */
const DROP: Px[] = [
  [13, 0, 1, 1, C.flax],
  [12, 1, 3, 1, C.flax],
  [11, 2, 5, 2, C.flax],
  [12, 4, 3, 1, C.flax],
  [12, 2, 1, 1, C.daisy],
];

function Pixels({ px }: { px: Px[] }) {
  return (
    <>
      {px.map(([x, y, w, h, fill], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
      ))}
    </>
  );
}

/** What stands on a tile: a crop at its stage, or a decoration. Fills the tile. */
export function TileSprite({
  crop,
  stage,
  decoration,
}: {
  crop: CropKey | null;
  stage: CropStage | null;
  decoration: DecorationKey | null;
}) {
  const px = decoration ? DECORATIONS[decoration] : crop && stage ? (stage === 'seed' ? seed(crop) : CROPS[crop][stage]) : null;
  if (!px) return null;
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
      // A ready crop sways gently (only when motion is allowed)
      className={`absolute inset-[6%] w-[88%] h-[88%] pointer-events-none ${stage === 'ready' ? 'croft-sway' : ''}`}
    >
      <Pixels px={px} />
      {stage === 'seed' && <Pixels px={DROP} />}
    </svg>
  );
}

/** Small status pictures for the village list */
const STATUS: Record<'water' | 'ready' | 'growing' | 'empty', Px[]> = {
  water: DROP.map(([x, y, w, h, c]) => [x - 7, y + 4, w, h, c] as Px).concat(seed('oats').slice(3, 6)),
  ready: [
    ...blades([[5, 5, 9], [7, 4, 10], [9, 5, 9]], P.barleyAwn, P.barleyGold),
    [4, 3, 1, 3, P.barleyGold],
    [7, 2, 1, 3, P.barleyGold],
    [10, 3, 1, 3, P.barleyGold],
    [5, 9, 5, 1, C.wood],
  ],
  growing: CROPS.kale.sprout.map(([x, y, w, h, c]) => [x, y - 4, w, h, c] as Px).concat([[3, 11, 11, 2, C.soil]]),
  empty: [
    [2, 9, 12, 4, C.soil],
    [2, 10, 12, 1, C.soilDark],
  ],
};

export function VillageStatusIcon({ kind }: { kind: keyof typeof STATUS }) {
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true" className="w-4 h-4 shrink-0">
      <Pixels px={STATUS[kind]} />
    </svg>
  );
}
