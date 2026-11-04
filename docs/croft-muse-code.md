# My Croft: brief for Muse Code

My Croft is a small farming game inside StudBuds. Each student has a croft (a small Scottish farm)
in a Celtic valley. They till, sow, water and harvest, and classmates visit from profile cards and
water one crop a day for them. The game works today with a plain look: words on colored squares.
Your job is to make it look and feel like a cozy medieval Celtic croft, with pixel art drawn in code.

It's an original game. Don't copy any existing farming game's names, characters, art, screens or
icons.

## Setup: the cheapest way, without secrets

- **Where:** work in the second copy of the repo at `../MetaHacks-muse`, on branch `muse/croft-art`.
- **No secrets there:** its `.env` has only the three public browser keys, which already ship
  inside the website. Never open or copy the main folder's `.env`.
- **Model:** Muse Spark 1.3 in Contributor mode, which is on by default in Muse Code. It's the
  cheapest model. Meta may train on what it reads, which is why that copy has no secrets. Don't
  use Muse Wonder for this.
- **Start it:**

  ```sh
  cd ../MetaHacks-muse
  muse
  ```

  Then say: "Follow docs/croft-muse-code.md."
- **Handing back:** commit on `muse/croft-art`. In the main folder, merge that branch into
  `feature/farm` and try it there.

## Where to work

- Change only files in `StudBuds/src/components/croft/`. Add new files there.
- Don't change these without asking. The database checks every move against them:
  - `StudBuds/src/dataFiles/Croft.ts`: the rules and numbers;
  - `StudBuds/src/lib/croft.ts`: the data hook;
  - anything in `supabase/`.

## What's there

- `StudBuds/src/dataFiles/Croft.ts`: the field size (6 × 5), crops, decorations, prices,
  growing times, and `cropStage()` (seed, sprout, growing, ready).
- `StudBuds/src/lib/croft.ts`: `useCroft(ownerId, enabled)` gives the croft and `act(action)`,
  and `useNow()` ticks so crops grow on screen.
- `CroftWindow.tsx`: the window. Your own croft has two tabs:
  - **My croft:** the field, the selected tile's actions, the shop pickers, who helped (with a
    Thank button) and the thank-yous you got;
  - **Village:** this week in the valley, and crofts from every school with Visit.
- **"Here now":** at the top of the window, the people on the croft at this moment.
- `CroftScene.tsx`: already drawn. The pixel strip above the field (hills, thatched cottage, rowan
  tree, well), the meadow, the dry-stone wall, the grass and soil tile textures, and
  `CROFT_COLORS`, the croft's fixed palette. Use those colors for your sprites.
- `CroftField.tsx`: the field. Crops and decorations still show as small name labels (with a
  water drop for dry seeds, a progress bar while growing, and a gold glow and sway when ready).
  Your sprites replace those labels.
- **Opening it:** the game is under "Upcoming" in the nav bar, then Croft.

## What to draw

Already done in `CroftScene.tsx` and `CroftField.tsx`: the grass and soil tiles, the farm around
the field (strip, meadow, wall), the selected tile's highlight and the ready crop's cue. What's
left:

1. **Crops:** six crops at four stages each: oats, kale, leeks, barley, beans and flax, each as
   a seed, sprout, growing and ready. Replace the name label on the tile; keep the progress bar.
2. **Decorations:** wicker fence, herb bed, beehive skep, lantern, rowan tree, standing stone and
   sheep.
3. **The village list:** a small croft icon per row, or a status picture for seeds that need
   water. Keep the Visit buttons.

## Art rules

- **How to draw:** inline SVG sprites on a 16 × 16 grid, with `shape-rendering="crispEdges"`.
  Use no image files, no fonts and no new packages.
- **Colors:** one fixed, earthy palette for every sprite: greens, peat browns, thatch gold, stone
  grays, flax blue and heather purple. Crops look the same in every theme.
- **The window around the game** uses the app's theme colors (`bg-paper`, `bg-surface`,
  `text-ink`, `border-ink/…`), which change when a student picks a theme.
- **No text or emoji inside sprites.**
- **Motion:** keep it gentle, like a ready crop swaying or a small burst on harvest. Only use
  `motion-safe:` classes, so reduced-motion settings are respected.

## Keep working as it does now

- `CroftField` keeps its props: `tiles`, `now`, `selected` and `onSelect`.
- Every tile stays a `<button>` with `aria-label={`Tile ${index + 1}: ${describeTile(tile, now)}`}`
  and `aria-pressed` for the selected tile, so keyboards, screen readers and the tests keep working.
- There's no typed text anywhere in the game. The croft's name comes from the nickname.
- Any words you add: short and plain, no em dashes, no emoji, and curly apostrophes (’) like the
  rest of the app.

## Check your work

```sh
cd StudBuds
npm run dev        # Home → "Upcoming" in the nav bar → Croft
npx tsc -b         # must pass
npm run build      # must pass
```

To test visiting, sign in as a second student in another browser, open a lobby the first student
is in, and press "Visit croft" on their card.

## Done when

The field reads as a little Celtic croft at a glance. Every crop stage and decoration has its own
sprite, and the selected and ready tiles are easy to spot. It works at 320 px wide and at full
screen, and type checking and the build both pass.
