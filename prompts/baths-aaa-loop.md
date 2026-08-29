# Municipal baths: collisions, lines, cel AAA, laptop cost

You are running a loop on Municipal baths (`src/maps/baths`, id `baths`).
Read `CLAUDE.md` first. It is the constitution for the product. This file
is the constitution for THIS loop. Do not rewrite it.

The three repositories are one product. Do not import the city. Do not
import the bando. Do not edit `vendor/betaflight`. Do not change the plant,
the ABI, or a verify threshold.

## THE PRIME DIRECTIVE

You may not change a threshold, budget, rubric item, or success criterion
to make a check pass. If a bar is hard, the answer is better authoring.
If a bar is genuinely impossible next to another bar, write the derivation
into `.loop/baths-aaa/disputes.md`, mark that item BLOCKED WITH ARGUMENT,
and keep every other bar intact.

Do not fabricate evidence. A number, a leftover count, a screenshot
description, or a CLEAR on a line you did not probe is a lie. Measure it
or do not write it down.

Do not rewrite this document.

## WHAT THIS MAP IS

A compact civic baths. One 50 m hall and a lido, not a campus of sheds.
Cel shaded. Freestyle. A 5 inch flies it. The drawing is the solid world:
a gap you see is a gap you fly, a box you see is a hit.

Design lock, already made, do not reopen:

- id `baths`, player-facing name Municipal baths
- palette cream / aqua tile / coral and lemon as unlit trim / navy, chlorine
  daylight, city ink. Not kiln golden hour. Not city pastel.
- cel kit copied into `src/maps/baths/cel`, no city import, no bando import
- 50 m basin (the kiln tube of this map), 10 m diving tower, two roof light
  wells, south mouth 12.4 x 5.8 m, west door to the teaching pool, hopper
  pit punched into the deep end
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
| P9 | Shadow maps | one, 2048 or smaller | quality.js `baths.shadowMap` |
| Lights | PointLights on Low and Medium | 0 | `__map().pointLights` |

High may light a lamp if P1 and P5 still pass. Low keeps ink off, scale
at or below 0.85, shadows off. Isolation: choosing baths must not fetch
the city. `MAP_MODULE_COUNT.baths` must match the fetch.

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
- C4. Visual equals solid. A painted gap must not hide a collider, and a
  drawn box must be the box you hit. Overlay `__colliderBoxes` on a still
  when the claim is "hugs the graphics". Signs, banners and letter holes
  are air.
- C5. `node scripts/attract-check.js baths` reports `through` 0.

### L. Lines (FPV)

A Velocidrone indoor is flown from 20 m out. Each line has to read at
that distance, then stay honest when the craft is inside it. Inner
clears are the authored numbers; do not shrink them.

- L1. South mouth, plaza through the 12.4 x 5.8 m door, then the coral
  hoop at z 7.8. Title still shows the door, not a hoop filling the lens.
- L2. Pool bore, west shallow to east deep, six lanes, about y 0.6 so it
  clears the west goal lintel and the bulkhead slot. This is the kiln
  tube. It has to read empty and flyable from the mouth.
- L3. Bulkhead slot, 3.4 m, sill -1.9, lintel 2.38. An honest hole.
- L4. West door to the lido, then over the mushroom, not through its cap.
- L5. Teaching pool, lemon hoop, mushroom is a hit. Drop tower is a
  three sided shaft, open north, landable decks.
- L6. Dive hoop at x 21.2 and the 10 m tower. Boards at 3, 5.2, 7.6, 10.
- L7. Hopper pit, punched east wall of the deep end, leftover 0 with
  the wall. A cellar you can enter, not a sealed box.
- L8. Roof light wells, two holes, chrome bars across. Fly beside the
  bar, not through it.
- L9. Gallery west bridge and the hoop under it at x -7.4. Decks landable.
- L10. Catch hoop over the bulkhead, inner Y 1.62 as authored.

The title camera is an establishing shot, not a flight line. It must
not clip (C5). It is allowed to skip L3 to L10.

### D. Detail (designer)

Cel AAA, not photoreal, not a grey leisure centre.

- D1. Title still: CIVIC BATHS fascia, cream hall, cyan pool, 10 m
  tower. A 236 px world card still has a silhouette. A lemon hoop filling
  the lens is a FAIL.
- D2. Palette holds. Chlorine daylight. No bando ochre, no city pastel,
  no fifth accent, no unlit grey Lambert where a toon ramp should band.
- D3. Ink on silhouettes at High and Medium. Low may drop ink.
- D4. Interiors readable without PointLights on Low and Medium: light
  wells, clerestory, unlit cream, tile that still bands. The pool tube
  must not go black.
- D5. The plaza is a set. Flight height (0.5 m to 8 m) carries fascia,
  lockers, start blocks, a boundary. An empty cream apron is a FAIL.
- D6. Scale references in `references.js` still match the real-world
  bands written next to them.
- D7. At 5 m, a wall is a wall with a wainscot, a waterline, a sill or a
  throw, not a single cream box. Big shapes first, dress on them, no
  noise texture.
- D8. Cool shade on cream, sun on tile. Two or three cel bands. The hall
  is chlorine noon, not a grey gym.

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
3. **FPV pilot.** 5 inch freestyle pilot who has flown indoor halls.
   Grades C3, C4, and L1 to L10. REJECT if a line that looks flyable is
   not, or if the 20 m read is a wall of same-value boxes.

Each finding is MUST-FIX, SHOULD, or NIT. The next build does every
MUST-FIX. A SHOULD becomes MUST-FIX if two reviewers name it. A NIT
is recorded and may wait.

Verdict is ACCEPT or REJECT. ACCEPT means every item that reviewer
owns is PASS or BLOCKED WITH ARGUMENT. One FAIL is REJECT.

## A ROUND

1. **MEASURE.** Shots at 1600x900 High, parked cameras, not attract.
   Leftover counts, named line `__hit` probes, `__budget` on the
   establishing view and one interior, `node scripts/attract-check.js baths`.
   Evidence goes in `.loop/baths-aaa/rN/`. Low is measured when High
   dress changed.
2. **BREAK.** The three reviewers, in parallel, with the stills and
   the numbers. They write `.loop/baths-aaa/rN/{designer,coder,pilot}.md`.
3. **BUILD.** Highest cost MUST-FIX first. One shape of change per
   round if the changes would fight. Append to `PROGRESS.md`.
4. Stop only when two consecutive rounds are all three ACCEPT.

Cheap checks this loop: `node scripts/attract-check.js baths`, the
shots run, leftover and line probes printed by the shots eval. Do not
run `npm run verify` unless the plant, the ABI, the WASM build, or a
threshold moved.

## INSTRUMENTS

    node .loop/baths-aaa/rN/run-shots.mjs
    node scripts/attract-check.js baths

Page handles: `__setCam`, `__hit`, `__budget`, `__map`, `__colliders`,
`__colliderBoxes`, `__boot().frames`. `__setCam` lands on the next
frame. Wait two.

## SHARP EDGES

- Overlapping AABBs flip contact normals. Shared faces are fine.
  Shared volumes are not.
- `heightAt` cannot make a deck solid from underneath. A raised
  platform needs the slab collider `deck()` already writes.
- `mergeCell` is Infinity on purpose. Do not put a 20 m cell back.
- PointLights on MeshToon are the fill-rate bomb. Interiors get unlit
  flats and light wells, not lamps, until High has budget.
- Reviewer subagents can write. `git status` after every review.
- Do not quote fps. Do not quote attract for P1.
- No em dashes or en dashes anywhere this loop writes.
- The catch hoop inner Y is 1.62 on purpose. Do not shrink it to
  make a still tighter. Do not grow named hoops to CLEAR.
