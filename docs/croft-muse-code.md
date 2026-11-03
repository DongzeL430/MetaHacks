# My Croft: brief for Muse Code

My Croft is a small farming game inside StudBuds. Each student has a croft (a small Scottish farm)
in a Celtic valley. They till, sow, water and harvest, and classmates visit from profile cards and
water one crop a day for them. The game works today with a plain look: words on colored squares.
Your job is to make it look and feel like a cozy medieval Celtic croft, with pixel art drawn in code.

It's an original game. Don't copy any existing farming game's names, characters, art, screens or
icons.

## Where to work

- Branch `feature/farm`.
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
- `CroftWindow.tsx`: the window, which shows the selected tile's actions, the shop pickers and
  the list of who helped.
- `CroftField.tsx`: the field. This is the main thing to redraw.

## What to draw

1. **Tiles:** grass and tilled soil.
2. **Crops:** six crops at four stages each: oats, kale, leeks, barley, beans and flax, each as
   a seed, sprout, growing and ready.
3. **Decorations:** wicker fence, herb bed, beehive skep, lantern, rowan tree, standing stone and
   sheep.
4. **The farm around the field:** a thatched cottage, a dry-stone wall, a well and hills behind
   it. Use a strip above the field or a frame around it.
5. **The selected tile:** it needs a highlight, and a ready crop needs a small cue that it can be
   harvested.

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
npm run dev        # Home → "Croft" in the nav bar
npx tsc -b         # must pass
npm run build      # must pass
```

To test visiting, sign in as a second student in another browser, open a lobby the first student
is in, and press "Visit croft" on their card.

## Done when

The field reads as a little Celtic croft at a glance. Every crop stage and decoration has its own
sprite, and the selected and ready tiles are easy to spot. It works at 320 px wide and at full
screen, and type checking and the build both pass.
