# The polish loop

The prompt to hand the next session. Everything in it is measured on `main` at
`4220a7e`, not asserted, and the numbers that turned out to be wrong last round
are called out so they are not inherited a second time.

---

Take the current state and make it as close to perfect as it can be measured to
be. Nothing here is a green field: two maps work, sixteen checks exist, fifteen
pass. Your job is the gap between "it works" and "there is nothing left to find",
and the only evidence that counts is a number you produced this session.

Read first, in this order: `CLAUDE.md`, then `.loop/HANDOVER.md`, then the last
two entries of `PROGRESS.md` (rounds 15 and 15b). Round 15b is the important
one: it is a list of things round 15 got wrong, including a claim round 15
published that was false, and the shape of those mistakes is the shape of the
ones still in here.

State you are inheriting: `main` at `4220a7e`, `npm run verify` at **15 of 16**
with `yaw-coupling` the one red at -0.09 deg. Determinism hash
**3fdde8bd11da**, identical in Node and headless Chrome and across four frame
rates. Two maps: a MultiGP race field and a freestyle city vendored from
sakura-crossing.

**Container setup, neither step optional, or check 1 fails for want of a
compiler and verify reports 14 of 16, which looks like a regression and is not
one:**

    git submodule update --init --depth 1 vendor/betaflight
    git clone --depth 1 https://github.com/emscripten-core/emsdk /opt/emsdk
    cd /opt/emsdk && ./emsdk install 3.1.61 && ./emsdk activate 3.1.61
    source /opt/emsdk/emsdk_env.sh    # every new shell, before npm run verify

The sakura source is not in the container. You only need it to diff the
vendored tree against upstream, and if you do, clone it once, on its own, with a
generous timeout:

    GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 \
      https://github.com/kenton-gmi/sakura-crossing \
      /workspace/kenton-gmi/sakura-crossing

MIT, Copyright (c) 2026 Kenton Wang. Fifty eight of the 59 vendored files are
byte identical; two carry recorded patches, `PATCH-world-index.diff` and
`PATCH-core-toon.diff`, both beside the tree. Do not edit anything else in
there. Wrap it in our own GPLv3 code under `src/maps/city/` instead.

## The cost ledger as it actually stands, measured at 1920 by 1080

Race field, camera parked at the spawn. Identical to `c3c6e44`, and check 16
asserts that, including after a city round trip:

    P1  214        P2  1,931,413      P5  69.8 MB     P10  42.8 MB

Freestyle city, camera parked at the crossing:

    P1  4,080      P2  2,678,471      P5  104.2 MB    P10  72.2 MB
    budgets: 400              1,200,000        120 MB          48 MB

So the city **passes P5** at 104.2 MB, which is worth knowing because round 15
never measured it at 1080p and the extrapolation in `budget.js` reports 153.8,
which is wrong for this map: `p5_target_MB_at_1080p` scales targets by pixel
area, and the city's pipeline is clamped by its own `pixelBudget` instead, so
it does not scale that way. **Do not quote that field for the city.** Measure at
the real resolution.

P1 fails by 10.2x and P2 by 2.2x, and the reason P1 cannot be closed by more of
what round 15 did is measured: the town has 3,545 distinct materials, 3,048 of
them used by exactly one mesh, because every shop sign, fascia and price strip
carries its own Canvas2D texture. Merging by material already took 18,466 meshes
to 2,180. The floor under that is the material count.

**P6, P7 and P8 have never been measured for the city at all.** The city's boot
is about twelve seconds against a P6 budget of 1800 ms. That number needs to
exist, and the honest framing of it is probably that P6 as written is a budget
for the field and the city needs its own, argued in `PROGRESS.md`, not a
threshold quietly widened.

## What is owed, in the order I would take it

### 1. The D term chain is still decorative

Nothing disturbs the quad, ever. Thirty seconds of hover is bit exact zero
lateral drift and zero body rate, so `gyro_lpf1_static_hz` and `dterm_lpf*` do
nothing measurable and the machine cannot be tuned, because the thing tuning
fights is not simulated. This is the fourth of four plant items from round 12
and the only one still untouched.

Fix: deterministic shaped noise into the gyro AS READ BY THE BRIDGE, not into
the rigid body state, seeded from `step_index`, at `src/native/bf/bf_glue.c:271`
where `gyro.gyroADCf` is written. It must use `sim_math` only, never libc libm,
and checks 2, 3 and 4 have to stay green, which is the whole test of whether you
did it deterministically.

### 2. The motor constants, as one derivation, and check 8 with them

`src/native/plant.c` carries a 48 A ESC current ceiling as a comment with its
measurements rather than as code. It works: peak pack current 409.8 A to 192.0 A
and minimum cell voltage 1.54 V to 2.95 V. It also takes check 8 from 18 ms to
51 ms, out of its 10 to 30 ms band. That is not a tuning problem. The unlimited
model's mechanical time constant is `j R / ke^2 = 21.4 ms`, which is how it
lands in band, and it reaches that only by drawing 184 to 280 A per motor for
the whole rise. Meeting the band at 48 A would need `j_rotor` near 2.4e-6
against a real 5 inch triblade plus 2207 bell of about 9e-6.

So the band and the limit cannot both be met by this kt, kq, ke, r_motor and
j_rotor. Re-derive all five together against a real 2207, and re-specify check
8, which reads a SMALL SIGNAL time constant with a zero to full step from rest.
Do not lower the band and do not delete the limit; either one on its own is the
easy wrong answer.

### 3. yaw-coupling, and whether its floor is a measurement or a choice

It reads -0.09 deg against a 2.0 deg floor. It has a real mechanism and the
right sign for the first time, from a motor thrust axis misalignment table. The
algebra for why a symmetric QUADX yaws EXACTLY zero for any nonlinearity is in
`plant.c` above `PLANT_CANT_TANGENT_DEG`, and it is worth reading before you
try anything: it rules out propwash, inflow asymmetry and the outward tilt an
earlier handover proposed, all of which produce identically zero.

Reaching 2.0 deg needs about 44 degrees of column asymmetry. The floor's own
source line in `tests/thresholds.json` says "Loop A harness choice, floor that
makes 'non-zero' in STAGE1.md check 10 measurable", so it is a chosen number.
**Do not lower it because it is inconvenient.** Either find a real mechanism
that reaches it, or argue in `PROGRESS.md` that the check should measure what a
real quad does, with a number from a real quad behind the argument.

### 4. Three defects a review found and round 15b recorded without fixing

- **`Colliders.hit()` returns the first collider in GRID SCAN ORDER, not the
  first along the travel**, and `hitNormalDot` is computed for that one only.
  `src/game/collide.js`. Two solid things in one frame's travel and the reported
  one is whichever cell the broadphase reached first, which is what decides
  graze against crash in `main.js`. A gate upright clipped at t=0.85 can swallow
  a tree hit at t=0.15 and the craft flies on. Pre-existing, not introduced by
  the city, and the fix is to carry the earliest contact parameter through the
  query rather than returning on the first hit.
- **The field's `dispose` frees the composer's render targets but none of its
  pass materials**, `src/maps/field.js`. three.js releases a cached
  `WebGLProgram` only when the material owning it is disposed, so a handful leak
  per swap: the copy pass, the outline pass, the grade pass, and `post.js`'s
  `normalMaterial` and `grassMaskMaterial`. Invisible to every budget, which
  counts targets and triangles.
- **`setBoxTop` has no `lo <= hi` guard** and `src/maps/city/animation.js`
  writes `colliders.fay[i]` directly, so the invariant the box distance solver
  depends on is maintained by convention across two files. An inverted box
  rejects every query silently, which makes the crossing permeable rather than
  loud.

### 5. Two leaks and an off by two that I found while writing this and did not fix

- **`registered` in `src/render/celmat.js` is never pruned.** Every
  `celMaterial` pushes its `uCelTime` uniform onto a module level array in
  `onBeforeCompile`, and nothing removes it when the material is disposed.
  `updateCelTime` walks that array EVERY FRAME, so a field to city to field
  round trip leaves it walking dozens of dead uniform objects belonging to
  disposed materials, and it grows for the life of the session. Verified by
  reading the file: there is no removal path.
- **`MAP_MODULE_COUNT.city` is 61 in `src/main.js:119` and the real count is
  63.** Only a loading bar weight, so it cannot break a load, but it is exactly
  the kind of number that should be derived or asserted rather than typed.
- The **World stage of the loading screen has no sub-progress during
  `buildWorld`**, which is one monolithic vendored call of seven to nine
  seconds. The bar sits still and the elapsed readout carries it. That is honest
  but it is not good, and the vendored builder does take a context object.

### 6. The city has never had an art or a pilot review

Round 15 built it and measured its cost; nobody judged it. `scripts/judge-loop.md`
and the `fpv-judge-loop` skill exist for exactly this. Specific things I chose
without a review and would expect a judge to argue with:

- **The fog was shortened** from the town's authored 44 to 205 m down to
  45 to 135 m, purely to hide the 145 m distance cull edge. That is a look
  change made for a cost reason and it deserves to be defended or reversed on
  measurement, not left because it shipped.
- **The spawn is `{ x: 0, z: 24, yaw: pi }`** and the attract camera orbits at
  11 m, 3.2 m up. Both were picked by eye in `src/maps/city/index.js`.
- **The shadow camera went from the town's 34 m half width to 22 m** for a
  measured 27 percent of the frame's draw calls. What that costs is a cast
  shadow from a building the pilot is about to reach, under a second of warning
  at 25 m/s. Nobody has looked at whether it reads.
- The freestyle HUD shows airtime, altitude above the ground under the craft,
  speed, pack and throttle, and nothing else. Whether that is the right set is
  a pilot's judgement and it has not been made.

## How to work

Everything this project believes it knows is in `PROGRESS.md`, and round 15b
exists because four independent reviewers found twenty four things in code that
had already been measured and captured. Assume the same is true of what you are
inheriting.

- **Capture and measure anything visual** with `scripts/shots.js` and
  `scripts/pixels.js`. Use `stair:` for any antialiasing claim, because walking
  across an edge cannot tell a blur from a resolve. Read `img.channels` if you
  write your own decoder.
- **Park the camera before you measure a frame.** The attract camera on both
  maps orbits on the wall clock. `__setCam` only takes effect on the NEXT
  animation frame and `__budget` renders directly rather than through the frame
  loop, so wait on `window.__boot().frames`, never on a timer. A cull radius
  sweep taken through the orbiting camera came out non monotonic for exactly
  this reason.
- **`__stick(roll, pitch, yaw, throttle)` is how a capture flies.** Holding W
  ramps the throttle while held and a city frame takes about half a second
  here, so five seconds of held key is ten frames of ramp and the craft never
  reaches the 0.25 takeoff threshold. A capture that cannot take off cannot
  assert anything about flight.
- **Run adversarial review, and check that it ran.** Round 15's review reported
  zero findings because its verify stage passed promises where thunks were
  wanted, so every verdict threw and the run returned an empty list, which looks
  exactly like a clean bill of health. The twenty four findings were in the
  journal. An empty finding list is a claim like any other and needs evidence.
- **Never report a check as passing without running `npm run verify` in the same
  turn.**
- **Never change a threshold to make a check pass.** Argue it in `PROGRESS.md`.
  Two thresholds are under argument already, check 8's band and check 10's
  floor, and both arguments are written down; add to them rather than acting.
- **Every turn that changes code appends to `PROGRESS.md`, including what went
  wrong.** The parts where something went wrong are the most useful parts of
  that file, and round 15b is mostly that.
- **No em dashes or en dashes** in prose, comments, commit messages or
  documentation. The vendored tree under `src/maps/city/vendored/` is somebody
  else's and keeps its own.

## The bar

Perfect here does not mean sixteen green. It means that for every number this
project publishes, somebody has tried to prove it wrong and failed. Where a
budget genuinely cannot be met, the failure is measured, the reason is
specific, and the cost of the real fix is stated. Where a claim is a judgement
rather than a measurement, it says so.
