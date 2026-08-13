# Prompt for the next session

Paste everything below the line.

---

Build the freestyle city map and make it real. Four deliverables, all of them
measured, none of them declared done on a claim.

## Read first, in this order

`CLAUDE.md`, then `.loop/CITY-MAP-DESIGN.md` (the survey and the chosen
architecture, with its caveats), then `.loop/HANDOVER.md` (every owed finding
with a file and a line), then the last three rounds of `PROGRESS.md`.

State you are inheriting: `main` at `c3c6e44`, development branch
`claude/webfpv-world-sound-track-kdx9vo`, `npm run verify` at 13 of 14 with
`yaw-coupling` the one red. The race field map works: 14 gate stations, P10
passing at 42.8 MB, determinism hash `000931016224`.

The source city is not in the container. Clone it first, one clone, generous
timeout, and do not run it in parallel with anything:

    GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 \
      https://github.com/kenton-gmi/sakura-crossing \
      /workspace/kenton-gmi/sakura-crossing

It is MIT, Copyright (c) 2026 Kenton Wang. MIT into GPLv3 is a one way fit: the
copied files keep their MIT notice and copyright, the combined work ships
GPLv3, and a NOTICE entry records the provenance.

## 1. The city map, working and flyable

Follow the chosen design in `.loop/CITY-MAP-DESIGN.md`: split `buildScene` into
a session lived shell and a swappable `MapInstance`, vendor the 59 files
`src/world/index.js` actually reaches, and run sakura's own ink pipeline for the
city while the race field keeps ours. Do NOT run `bakeToPlanet`: the authoring
is flat and says so at `src/world/index.js:734-737`, and taking the flat
authoring is what keeps the Z up to Y up conversion in exactly one place.

**Re measure before you rely on anything.** The determinism judge found two
fabricated numbers inside the winning design and said so, and the third judge
never returned. Every quantitative claim in that document is a lead, not a
fact.

The blockers that will actually bite, all recorded with evidence in the design
document:

- **A gateless map crashes the shell twice.** `main.js` dereferences
  `view.gates[0].heading` and `view.gates[0].position` at boot and
  `new Race(view.gates)` dereferences `gates[0].position`. Separately, every
  `shot:` step in `scripts/shots.js` requires `window.__nextGate` to return a
  gate and records a harness fault plus a non zero exit otherwise, so a
  gateless map makes every capture fail even when the frame is perfect. Give
  the sidecar an opt out; do not weaken the gate for the race map.
- **Frame time is inside the city's collision.** The level crossing booms are
  colliders whose `top` toggles on `seq.armT`, and `armT` integrates raw `dt`.
  The gate state is a function of `train.x`, also a `dt` accumulation, measured
  drifting to 234.9999999999908 at dt 1/60 against 235.00000000001353 at dt
  1/50. Port anything that touches collision as a closed form of the fixed step
  count. Cosmetic animation may keep `dt`.
- **2,708 of 2,731 colliders are infinitely tall walls** with no `bottom`, so a
  quad can be stopped by a 0.2 m signpost at 40 m altitude. Give them real
  heights. Boxes must not contribute to `this.maxR`, because
  `collide.js:262-266` pads every query by `CRAFT_R + this.maxR`.
- **Draw calls are the wall, not triangles.** 13,600 in the city's worst view
  against the 157 our current view reports, plus a roughly 900 k triangle
  unculled floor from meshes whose bounding sphere is the planet. Merge and
  chunk with real bounding spheres. If a budget cannot be met, publish it as a
  failure with the number. Do not buy a budget by deleting districts, and do
  not touch `tests/thresholds.json`.
- **The two post chains cannot both run**: each ends with its own sRGB transfer,
  so chaining applies the curve twice. Only the active map's chain exists.
  Sakura's `Pipeline.setSize` forces `renderer.setPixelRatio(1)` and resizes the
  canvas, so the shell must own sizing.
- Every sakura mesh is on layer 0, which is the layer our outline prepass
  renders with `scene.overrideMaterial`.
- Landing and crashing must work on roofs, the overbridge deck and the
  supermarket roof car park, which is most of what a city offers a quad. Use a
  `surfaceAt(x, z, fromY)` contact model. Keep the existing thresholds:
  2.0 m/s descent, 3.0 m/s horizontal, 25 degrees tilt, 4.0 m/s graze.

## 2. Scale, and treat it as a first class check

This project has shipped a scale error before and every number in the ledger
stayed correct while it did: grass blades were 0.26 to 0.68 m, which made a
1.524 m regulation gate vanish from frame. Blades are now 0.03 to 0.09 m. Do
not regress it, and do not introduce the city's version of it.

Build a scale check that fails loudly rather than relying on a reviewer's eye.
Concretely: assert in the harness that a known reference object measures the
size it claims. The craft is 0.155 m front to back and its collision radius is
0.1885 m. A MultiGP standard gate opening is 1.524 m square. A city doorway, a
handrail and a kerb have real world sizes; check at least three against their
real values and print the measured numbers. Capture the quad next to a building
and next to a gate and confirm both read plausibly at the same craft size.

Note the trap: sakura is authored for a walker with a roughly 1.7 m eye height,
and a quad is 0.19 m across. Things correctly sized for a walker are genuinely
large next to a quad, and that is right. The failure to hunt is anything whose
absolute size is wrong, not anything that merely looks big.

## 3. A loading screen that tells the truth

The city is 56,096 lines of procedural geometry with every texture drawn at
runtime in Canvas2D, and the container's software rasteriser already takes 2500
to 5100 ms to first frame on the small race field. On a slow connection the
user currently gets nothing.

Build a real progress indicator, not a spinner on a timer. It must reflect
actual work completing: the three.js module fetch, the map module fetch, world
construction, Canvas2D texture generation, and first frame. Report stages by
name so a stall is legible. Measure the real timings and make the stage weights
match them rather than guessing, and check it against a throttled connection so
the bar is honest when the network is the bottleneck rather than the CPU.

It should also cover the race field's own load, not just the city's.

## 4. Load the city only when it is chosen

The city must not cost the race field anything: no module fetch, no geometry, no
texture generation, no render target. Use a dynamic `import()` of the city map
module triggered by the map choice in the UI, with the loading screen driving
off its real progress. Verify the isolation by measuring, with the race field
selected, that the city's modules are never requested and that P1, P2, P5 and
P10 are unchanged from `c3c6e44`.

Add the map choice to the existing UI screen flow. Freestyle means no gates, no
lap timer and no race logic, so decide what the HUD shows instead and say why.

## Also owed, and the user asked for these explicitly

The plant findings in `.loop/HANDOVER.md` are unfixed and they are the ones that
matter most for flight feel. An agent owned them last session and died at a
session limit before making an edit, so `src/native/plant.c` is untouched.
Take them first if you want a self contained win before the large work:

- Descent aerodynamics have the WRONG SIGN: thrust to weight rises from 1.063
  to 1.434 at 6.2 m/s of descent, so the model hands the pilot 35 percent more
  thrust exactly where vortex ring state should cost it. No propwash: peak body
  rate disturbance is 0.00 deg/s.
- Nothing ever disturbs the quad, so the entire D term filter chain is
  decorative. Thirty seconds of hover gives bit exact zero drift, zero body
  rate, zero motor spread. Gyro noise must be a pure function of `step_index`
  and use the project's own fixed libm, and checks 2, 3 and 4 must still pass.
  If it cannot be made deterministic, do not ship it.
- 300 A and 13.5 V five milliseconds into a punch on a full pack. 2.25 V per
  cell is a destroyed pack.
- `yaw-coupling`, the one red check, at 0.00 deg against a 2 deg floor. The
  recorded fix is a 1 to 2 degree motor thrust axis tilt, which is what a real
  quad has. **Do not lower the threshold.**

The toolchain is live and verified: `emcc` 3.1.61 resolves via
`/opt/emsdk/emsdk_env.sh`, `npm run build:wasm` recompiles every object, and the
build is bit reproducible. Do not repeat the mistake I made of testing build
reachability with an unexported, uncalled function: dead code elimination
strips it and the binary comes back byte identical, which looks exactly like a
dead compiler.

## The bar

AAA means measured, not asserted. For anything visual, capture a frame and
measure it: `scripts/shots.js` for captures with an aim sidecar,
`scripts/pixels.js` for values, `stair:` for any antialiasing or edge claim
because walking across an edge cannot tell a blur from a resolve. Read
`img.channels` if you write your own decoder; these captures are PNG colour
type 2 at three bytes per pixel and assuming four has already produced a wrong
published number here.

Run adversarial review on the result: hostile agents that try to refute each
claim, with verdicts that bind. Every round that changes code appends to
`PROGRESS.md`, including what went wrong. Never report a check as passing
without running `npm run verify` in the same turn. Never change a threshold,
tolerance or budget to make a check pass; argue it in `PROGRESS.md` instead.
No em dashes or en dashes anywhere in prose, comments, commit messages or
documentation.

Develop on `claude/webfpv-world-sound-track-kdx9vo`, commit as you go, and push
to `main` when the city flies, the scale check passes, and the loading screen
tells the truth.
