# Industrial bando: 60 fps, good resolution, cel AAA held

You are running a loop on Industrial bando (`src/maps/bando`, id `bando`).
Read `CLAUDE.md` first. It is the constitution for the product. This file
is the constitution for THIS loop. Do not rewrite it.

The art, collision and line loop in `prompts/bando-aaa-loop.md` is closed
(r10 and r11 all ACCEPT). Do not reopen stack inner, kiln bore, hopper,
gantry, leftoverOverlap, leftoverDeath hoop pairs, hall-west graffiti, or
the palette. A gap you see is still a gap you fly.

The three repositories are one product. Do not import the city. Do not
edit `vendor/betaflight`. Do not change the plant, the ABI, or a verify
threshold.

## THE PRIME DIRECTIVE

You may not change a threshold, budget, rubric item, or success criterion
to make a check pass. If a bar is hard, the answer is better authoring.
If a bar is genuinely impossible next to another bar, write the derivation
into `.loop/bando-perf/disputes.md`, mark that item BLOCKED WITH ARGUMENT,
and keep every other bar intact.

Do not fabricate evidence. A frame time, a scale, a leftover count, or a
screenshot description of a frame you did not render is a lie. Measure it
or do not write it down.

Do not rewrite this document.

Do not delete world content to make a number go down and then report the
budget as met. Do not switch the named graphics preset mid flight. Do not
undo `mergeCell: Infinity` or PointLights 0 on Low and Medium.

## WHAT THIS LOOP IS FOR

The plant is cheap on paper (about 200 draws, about 32 k triangles) and
still hitching on a real desktop. The cost is fill rate, not mesh count:

- High `minScale: 1` used to win against `pixelBudget`, so a 1440p or 4K
  panel rendered native CSS into HalfFloat scene targets plus ink, grade,
  FXAA and a 2048 shadow map.
- The default framebuffer restored session `devicePixelRatio` (capped at
  2), so the last pass could be 4x the internal scene.

This loop makes the pixel budget bind at every panel size, matches the
canvas backing store to the internal buffer, and paces that buffer so a
frame stays at or under 16.7 ms without turning the picture into 480p.

## THE HARDWARE CONTRACT

Same machine class as `prompts/lowspec-aaa-loop.md`: a mid range laptop
from five years ago, Intel Iris Xe class, 1920 by 1080 at 60, a browser
tab. This desktop is the measurement machine for absolute frame time,
because headless Chromium here is a software rasteriser and must not be
quoted as fps.

You may quote fps, rAF dt, render ms and shell ms from a GPU tab on this
machine. You may not quote fps from `scripts/shots.js`.

Proxies still hold, worst parked view, not attract:

| # | Budget | Ceiling | Measure |
|---|---|---|---|
| P1 | Draw calls | 400 | `__budget` then `__renderStats().calls` |
| P2 | Triangles submitted | 1,200,000 | `__renderStats().triangles` |
| P5 | Render target bytes at 1080p | 120 MB | `__budget` |
| P9 | Shadow maps | one, 2048 or smaller | quality.js `bando.shadowMap` |
| Lights | PointLights on Low and Medium | 0 | `__map().pointLights` |

High may not light a lamp if P1 and P5 still pass. Isolation: choosing
bando must not fetch the city. `MAP_MODULE_COUNT.bando` must match the
fetch.

## THE RUBRIC

An item passes only when the named reviewer says it passes, against a
frame or a number from this round's evidence folder. The builder does
not grade their own work.

### F. Frame time (engineer)

- F1. At CSS 1920x1080, 2560x1440 and 3840x2160, High internal pixels
  are at most `pixelBudget` (2.6e6). `__scaleAt(w,h)` and the live
  pipeline size must agree. Native 4K HalfFloat is a FAIL.
- F2. The default framebuffer width and height equal the internal
  scene target, not CSS times devicePixelRatio. Stretch is CSS.
- F3. On this GPU, High, Industrial bando, a parked establishing view
  AND a flight-like camera through the hall: rAF dt EMA under 16.7 ms,
  p95 under 18 ms, over at least 180 frames after warmup. Software
  rasterisers are BLOCKED WITH ARGUMENT, not a pass.
- F4. Internal pixels stay at or above 1,200,000 at High while F3
  holds, unless the panel itself is smaller than that. Dropping to
  720p-class to buy F3 on a 1080p or larger panel is a FAIL. Cut
  shader cost or shadow cost first.
- F5. If render EMA is under 7 ms and shell EMA is over 9 ms while
  rAF dt is over 18 ms, the hitch is CPU. Do not drop scale. Name the
  JS or WASM cost and fix that instead.
- F6. Pacing must not allocate in the frame loop (P8). No new objects,
  arrays or strings in `pace.observe`. Resizing render targets is
  allowed only after a cooldown, not every frame.

### C, L, D (held from the art loop)

C1 leftoverOverlap 0. C2 leftoverDeath only the disputed L5 and L10
hoop pairs. C3 to C5 and L1 to L10 CLEAR. D1 to D8: hall-west.png is
the quality floor. A 1600x900 High recapture of hall-west, kiln-bore,
gantry, hopper, preheater and establishing must not sand those faces.
If a still hash moves, prove it is chrome, parked craft, or the
intended scale change, not a plant edit.

### P. Cost (engineer)

P1, P2, P5, P9, Lights, isolation as in the table. Worst view, parked
with `__setCam`, wait two frames. 1080p P5 is derived from a 1600x900
capture the same way `budget.js` already does.

## THE REVIEWERS

Two every round after evidence, before the next build. They do not
edit the tree. Verdicts are binding.

1. **Engineer.** Graphics programmer who has shipped a compact 3D
   world on integrated GPUs. Grades F1 to F6 and every P item from
   numbers. REJECT on native 4K HalfFloat, on a pacer that fights a
   CPU hitch with resolution, on P8 in the observe path, or on one
   budget over.
2. **Pilot.** 5 inch freestyle. Grades L1 to L10 and C3, C4 from the
   stills and probes. REJECT if a line that looked flyable is not, or
   if the internal scale makes the 20 m read a smear of the same-value
   boxes. On a confirmation round with no plant edit, the engineer
   may stand in and cite the previous ACCEPT plus IDENT stills.

A designer is called when a BUILD changed paint, light, ink, fog or
the title park. Confirmation-only rounds do not need one.

Each finding is MUST-FIX, SHOULD, or NIT. The next build does every
MUST-FIX. A SHOULD becomes MUST-FIX if both reviewers name it.

Verdict is ACCEPT or REJECT. ACCEPT means every item that reviewer
owns is PASS or BLOCKED WITH ARGUMENT. One FAIL is REJECT.

## A ROUND

1. **MEASURE.** `__scaleAt` at 1920x1080, 2560x1440, 3840x2160.
   `__budget` on establishing and one interior at 1600x900 High.
   `__pace` after warmup on a GPU tab. Leftover and named line probes
   when the plant moved. Evidence in `.loop/bando-perf/rN/`.
2. **BREAK.** Engineer (always). Pilot when stills or lines moved.
3. **BUILD.** Highest cost MUST-FIX first. One shape of change per
   round if the changes would fight. Append to `PROGRESS.md`.
4. Stop only when two consecutive rounds are engineer ACCEPT, F3
   held on this GPU, F4 held, and the art-loop stills have not been
   sanded.

Cheap checks: `node scripts/attract-check.js bando` when colliders
moved, the shots run, leftover and line probes. Do not run
`npm run verify` unless the plant, the ABI, the WASM build, or a
threshold moved.

## INSTRUMENTS

    node .loop/bando-perf/run-shots.mjs
    node .loop/bando-perf/run-scale.mjs

Page handles: `__setCam`, `__hit`, `__budget`, `__map`, `__pace`,
`__scaleAt`, `__boot().frames`. `__setCam` lands on the next frame.
Wait two.

## SHARP EDGES

- `pixelBudget` is a ceiling on INTERNAL pixels. `minScale` is the
  pacer floor as a CSS fraction, and it must not raise the buffer
  above the budget. That was the 4K hitch.
- Named Low / Medium / High do not change mid flight. Internal scale
  may. That is the same lever as the Render scale slider, automatic.
- Headless Chromium is SwiftShader. Its dt is not F3.
- Overlapping AABBs still flip contact normals. Do not "fix" leftover
  by widening L5 or L10.
- Reviewer subagents can write. `git status` after every review.
- No em dashes or en dashes anywhere this loop writes.
