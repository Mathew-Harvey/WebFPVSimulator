# Industrial bando: collisions, lines, cel AAA, laptop cost

You are running a loop on Industrial bando (`src/maps/bando`, id `bando`).
Read `CLAUDE.md` first. It is the constitution for the product. This file
is the constitution for THIS loop. Do not rewrite it.

The three repositories are one product. Do not import the city. Do not
edit `vendor/betaflight`. Do not change the plant, the ABI, or a verify
threshold.

## THE PRIME DIRECTIVE

You may not change a threshold, budget, rubric item, or success criterion
to make a check pass. If a bar is hard, the answer is better authoring.
If a bar is genuinely impossible next to another bar, write the derivation
into `.loop/bando-aaa/disputes.md`, mark that item BLOCKED WITH ARGUMENT,
and keep every other bar intact.

Do not fabricate evidence. A number, a leftover count, a screenshot
description, or a CLEAR on a line you did not probe is a lie. Measure it
or do not write it down.

Do not rewrite this document.

## WHAT THIS MAP IS

A compact cement works. One fused plant, not a courtyard campus. Cel
shaded. Freestyle. A 5 inch flies it. The drawing is the solid world: a
gap you see is a gap you fly, a box you see is a hit.

Design lock, already made, do not reopen:

- id `bando`, player-facing name Industrial bando
- palette bone / ochre / mint / rust as trim, city ink
- cel kit copied into `src/maps/bando/cel`, no city import
- square stack inner 2.8 m by 58 m, kiln bore 3.5 m through the mint
  packhouse, preheater north, three bins east with a 1.4 m split, hopper
  pit, 12 m hall mouths
- boxes with their colliders, authored together
- `mergeCell: Infinity` and PointLights 0 on Low and Medium. Those are
  the laptop fill-rate wins. Do not undo them to make a still prettier.

## THE HARDWARE CONTRACT

Same machine as `prompts/lowspec-aaa-loop.md`: a mid range laptop from
five years ago, Intel Iris Xe class, 1920 by 1080 at 60, a browser tab.
You cannot claim fps here. You can claim the proxies:

| # | Budget | Ceiling | Measure |
|---|---|---|---|
| P1 | Draw calls, worst parked view | 400 | `__budget` then `__renderStats().calls` |
| P2 | Triangles submitted | 1,200,000 | `__renderStats().triangles` |
| P5 | Render target bytes at 1080p | 120 MB | `__budget` |
| P9 | Shadow maps | one, 2048 or smaller | quality.js `bando.shadowMap` |
| Lights | PointLights on Low and Medium | 0 | `__map().pointLights` |

High may light a lamp if P1 and P5 still pass. Low keeps ink off, scale
at or below 0.85, shadows off. Isolation: choosing bando must not fetch
the city. `MAP_MODULE_COUNT.bando` must match the fetch.

## THE RUBRIC

An item passes only when the named reviewer says it passes, against a
frame or a number from this round's evidence folder. The builder does
not grade their own work.

### C. Collisions (coder + FPV)

- C1. `leftoverOverlap` is 0. Shared volume flips contact normals. That
  is the spaz.
- C2. `leftoverDeath` is 0. A leftover between solids is 0 (flush or a
  shared face) or at least `CLEAR` (1.4 m). Anything in between eats a
  5 inch.
- C3. Every named line below reports `__hit` kind null along the whole
  segment, probed with the same call the frame loop makes.
- C4. Visual equals solid. A cylinder shell must not leave an invisible
  box corner a 5 inch hits while the drawing says air, and a painted
  gap must not hide a collider. Overlay `__colliderBoxes` on a still
  when the claim is "hugs the graphics".
- C5. `node scripts/attract-check.js bando` reports `through` 0.

### L. Lines (FPV)

A Velocidrone bando is flown from 20 m out. Each line has to read at
that distance, then stay honest when the craft is inside it. Inner
clears are the authored numbers; do not shrink them.

- L1. Pack hall, south mouth to north mouth, 12 m, y about 3.4
- L2. Kiln bore, west stack mouth to east lip, inner 3.5 m
- L3. Stack inner dive, 2.8 m square, open top, east mouth into the kiln
- L4. Hopper pit, west mouth, stairs, not a sealed box
- L5. Gantry hoop through the bin split, about 1.2 m inner
- L6. Bin split itself, 1.4 m, at gantry height, not buried in a pile
- L7. Cyclone duct, inner 1.55 m, into the preheater
- L8. Preheater south mouth and floor hatches
- L9. Stack south door and the three high slots
- L10. Skybridge, 1.22 m, y 42

The title camera is an establishing shot, not a flight line. It must
not clip (C5). It is allowed to skip L3 to L10.

### D. Detail (designer)

Cel AAA, not photoreal, not a grey tech demo.

- D1. Title still: stack, preheater, pack hall and bins read as one
  machine against the sunset. A 236 px world card still has a
  silhouette.
- D2. Palette holds. No city pastel, no fifth accent, no unlit grey
  Lambert where a toon ramp should band.
- D3. Ink on silhouettes at High and Medium. Low may drop ink.
- D4. Interiors readable without PointLights on Low and Medium: sun
  pools, lining, light wells, unlit flats. A kiln tube must not go
  black.
- D5. The yard is a set. Flight height (0.5 m to 8 m) carries rust,
  graffiti, junk, a fence or equivalent boundary. An empty ochre apron
  is a FAIL.
- D6. Scale references in `references.js` still match the real-world
  bands written next to them.
- D7. At 5 m, a wall is a wall with a plinth, a stain, a sill or a
  throw, not a single mint box. Big shapes first, dress on them, no
  noise texture.
- D8. Cool violet in shadow, warm sun on bone. Two or three cel bands.
  The plant is ochre dust, not a grey suburb.

### P. Cost (coder)

P1, P2, P5, P9, Lights as in the table. Worst view, not best. Park
with `__setCam` and wait two frames. Do not quote the attract camera.

## THE REVIEWERS

Three, every round, after evidence, before the next build. They do not
edit the tree. Verdicts are binding.

1. **Designer.** Art director who has shipped a cel shaded game. Grades
   D1 to D8 from the stills. REJECT if the title still would not make a
   stranger pick this world card.
2. **Coder.** Engine programmer who has shipped a compact 3D world on
   integrated graphics. Grades C1, C2, C4, C5, and every P item from
   numbers. REJECT on one leftover overlap, one city fetch, or one
   budget over.
3. **FPV pilot.** 5 inch freestyle pilot who has flown Velocidrone
   bandos. Grades C3, C4, and L1 to L10. REJECT if a line that looks
   flyable is not, or if the 20 m read is a wall of same-value boxes.

Each finding is MUST-FIX, SHOULD, or NIT. The next build does every
MUST-FIX. A SHOULD becomes MUST-FIX if two reviewers name it. A NIT
is recorded and may wait.

Verdict is ACCEPT or REJECT. ACCEPT means every item that reviewer
owns is PASS or BLOCKED WITH ARGUMENT. One FAIL is REJECT.

## A ROUND

1. **MEASURE.** Shots at 1600x900 High, parked cameras, not attract.
   Leftover counts, named line `__hit` probes, `__budget` on the
   establishing view and one interior, `lint:attract` for bando.
   Evidence goes in `.loop/bando-aaa/rN/`. Low is measured when High
   dress changed.
2. **BREAK.** The three reviewers, in parallel, with the stills and
   the numbers. They write `.loop/bando-aaa/rN/{designer,coder,pilot}.md`.
3. **BUILD.** Highest cost MUST-FIX first. One shape of change per
   round if the changes would fight. Append to `PROGRESS.md`.
4. Stop only when two consecutive rounds are all three ACCEPT.

Cheap checks this loop: `node scripts/attract-check.js bando`, the
shots run, leftover and line probes printed by the shots eval. Do not
run `npm run verify` unless the plant, the ABI, the WASM build, or a
threshold moved.

## INSTRUMENTS

    node .loop/bando-aaa/run-shots.mjs
    node scripts/attract-check.js bando

Page handles: `__setCam`, `__hit`, `__budget`, `__map`, `__colliders`,
`__colliderBoxes`, `__boot().frames`. `__setCam` lands on the next
frame. Wait two.

## SHARP EDGES

- Overlapping AABBs flip contact normals. Shared faces are fine.
  Shared volumes are not.
- `heightAt` cannot make a deck solid from underneath. A raised
  platform needs the slab collider `deck()` already writes.
- A 20 m merge cell exploded draw calls on this plant (209 meshes).
  `mergeCell` is Infinity on purpose.
- PointLights on MeshToon are the fill-rate bomb. Interiors get unlit
  flats, not lamps, until High has budget.
- Reviewer subagents can write. `git status` after every review.
- Do not quote fps. Do not quote attract for P1.
- No em dashes or en dashes anywhere this loop writes.
