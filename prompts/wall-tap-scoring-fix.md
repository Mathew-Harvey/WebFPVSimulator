# Fix the wall tap, and rebuild the trick measurement so the catalogue scores in real play

A prompt for one Claude Code session on WebFPVSimulator. It was written on
2026-09-03 after reading the whole contact path, the whole recogniser, the
three harnesses and the PROGRESS.md history of both problems. Every file and
line reference is against commit `7530969`, the tip of `main` that day. Read
all of it before touching anything. It names root causes with evidence, says
what to build and in what order, says how each claim is to be measured, and
says what has already been tried and must not be tried again.

Two reports from real play are being answered:

1. Wall taps stick to the wall and do not bounce off.
2. The scorer misses orbits, inverted orbits, Split-S, powerloops and Matty
   flips, and mislabels other moves such as the Juicy Flick.

Part 1 is a small change with a large effect and lands first and alone.
Part 2 is a rebuild of one layer of the scorer, with the evidence pipeline
built before the layer.

## 0. Before you start

1. Read `CLAUDE.md` in full. Its rules bind here: no em dashes or en dashes
   anywhere (prose, comments, commit messages); SI units; no `Math.sin`,
   `Math.cos`, `Math.atan2` or `Math.pow` in the physics path; physics never
   reads frame time; `main` is append only; every turn that changes code
   appends to `PROGRESS.md`, including what went wrong; never change a
   threshold to make a check pass; do not run `npm run verify` unless the
   change touches physics, the plant, the ABI or the build (Part 1 touches
   the physics path, so run it there and report what it can and cannot see);
   consult the advisor before changing the shape of the physics model or of
   a game system.
2. The repository's history was replaced a second time on 2026-08-30. The
   line ending at `20277e5` (root `84628bf`, 26 to 29 August, 70 commits) is
   reachable from no branch on the remote. The current `main` is a fresh root
   at `17071e8` whose tree carried every file of the old tip, so no code was
   lost, only the record. A container's first clone may still hold the OLD
   line as its local `main`. Run `git fetch origin` and
   `git merge-base HEAD origin/main` before you reason about a branch. If the
   merge base is empty, stop and report; do not merge, do not rebase across
   it. Work on the branch you were given, based on the current `origin/main`
   (root `17071e8`). Do not try to reattach the old line.
3. The checks you have: `npm run contact:selftest` (72 checks against
   `dist/sim.wasm`, drives the plant directly and cannot see the shell),
   `node src/trackbuilder/selftest.js` (pure JS, imports `collide.js` and the
   clip watch), `npm run score:selftest` (207 checks, flies `dist/sim.wasm`
   in Node, passes no up axis so the de banking has no coverage there),
   `npm run trick:sweep` (synthetic flights, asserts only that nothing is
   paid more than it was worth), `npm run park:fly` (the real shell in
   headless Chromium with real stick inputs, `--only=<name> --reps=N`,
   non deterministic run to run), `node scripts/shots.js` for anything
   visual. `npm run build:wasm` needs emsdk and `npm run lint:catalog` needs
   the `vendor/betaflight` submodule; both may be unavailable in a container.
   `dist/sim.wasm` is committed and dates from `17071e8`.
4. Debug hooks in the shell: `window.__contacts()` returns the contact pass
   counters (`buried`, `sepFail`, `resolved`, `dvZero`, `kind`, `code`, `e`,
   `mu`); `window.__craftState()` (attitude, velocity, body rates, nose and
   up in the renderer's frame); `window.__stick(r, p, y, t)`;
   `window.__drawOff`; `window.__trickDetector()`; `window.__obstacles()`;
   `window.__nearSolid(x, y, z, r)`; `window.__hit(...)`;
   `window.__armProbe()`, `window.__probe`, `window.__flush()`.
5. Where things live:
   - `src/game/collide.js`: colliders, the swept query `hit()`, `gapAt()`,
     the contact patch `contactPatch()`, the materials, the clip watch.
   - `src/main.js`: `obstacleContactPass()` at line 4383 (runs every
     `OBSTACLE_STEP` = 4 ms of sim time inside the 1 kHz step loop),
     `resolveContactAt()` at 4290, `contactSeparation()` at 4269,
     `separateAt()` at 4331, `raiseGroundFromState()` at 4222,
     `worldPosToSim()` at 4135, `poseFromState()` at 4143, the detector feed
     at 5133, the contact to recogniser wiring at 5402, `feelImpact()` at
     2023.
   - `src/native/sim.c`: `contact_impulse()` at 335, `sim_contact_at()` at
     840, the ground model, the `CONTACT_` constants at 77 to 176.
   - `src/render/frame.js`: the only place the Y up to Z up permutation
     lives.
   - `src/game/trickdetect.js`: the recogniser. `PATTERNS` at 617,
     `snapTurns` at 1416, `snapPathTurns` at 1471, `PathRun` at 1620,
     `step()` at 2081, `stepOneLap()` at 2246, `closePath()` at 2571,
     `debankLap()` at 2735, `closeRun()` at 3079, `bestMatch()` at 3514,
     `matchSteps()` at 3743.
   - `src/game/obstacles.js`: poles and bars derived from the colliders.
   - `src/game/tricks.js`: the catalogue and every price. `src/game/score.js`:
     the workbook arithmetic and the combo layer. `src/game/proven.js`:
     generated.
   - `scripts/park-fly.js`: the rig. `scripts/trick-sweep.js`: the synthetic
     sweep. `scripts/score-selftest.js`: the unit suite.
   - `.loop/evidence/freestyle-scoring/`: `tricktionary-outdoor.json` (what a
     trick IS, in the owner's words), `twp-calculator.json` (what it is
     worth), `audit-2026-09-03.json` (seven findings on the recogniser),
     `DETECTION.md`.
   - `tests/lib/recfile.js` and `tests/inputs/baseline.rec`: the recorded
     stick input format the determinism check already replays.

## Part 1. Wall taps stick to the wall

### 1.1 The root cause, with the evidence

The obstacle contact normal reaches the plant in the wrong frame, and in the
freestyle city it reaches it exactly reversed.

- `resolveContactAt` (`src/main.js:4290`) converts the renderer's world
  normal with `threeDirToSim(nx, ny, nz, nSim)` (line 4292), the contact
  patch arm with `threeDirToSim(rPatch...)` (line 4301), and the moving
  surface velocity with `threeDirToSim(msx, msy, msz, vsSim)` (line 4497).
- `src/render/frame.js:128` says what `threeDirToSim` is: an axis
  permutation. The comment on `threePosToSim` beside it says the spawn
  offset and the spawn yaw "live in the shell".
- The shell knows. `worldPosToSim` (`src/main.js:4135`) applies `qSpawnInv`
  before the permutation, and `raiseGroundFromState` (`src/main.js:4222`)
  applies `qSpawnInv` to the GROUND normal, with a comment describing
  exactly this class of bug: "threeDirToSim is a basis permutation that
  cannot undo a rotation... It never showed on level ground or on a deck,
  where the normal is straight up and a yaw about up is the identity". The
  obstacle path never received the same fix.
- The freestyle city spawns at `yaw: Math.PI` (`src/maps/city/index.js:77`).
  A rotation of pi about the up axis negates x and z, so for every VERTICAL
  face in the town the normal handed to `sim_contact_at` is `-n`. The custom
  map spawns at yaw 0 (`src/maps/custom.js:98`) and the club field's sites
  at 0 or a quarter turn (`src/render/scene.js:703` to 711), which is why a
  gate on the race field bounces and nobody saw the town's walls do
  otherwise.
- In the plant, `contact_impulse` (`src/native/sim.c:335`) computes
  `vn = v . n` at the patch and returns without doing anything when
  `vn >= 0` and `pen <= CONTACT_SLOP` (line 346). The shell always passes
  `pen = 0` (lines 812 and 879). With `n` reversed, a genuine approach reads
  as separating and receives NO impulse, no restitution and no friction; a
  genuine departure reads as an approach and receives an impulse of
  `(1 + e) * |vn|` INTO the wall. The shell then parks the craft 8 mm off
  the face (`contactSeparation`, line 4269), the pass breaks out on
  `dv <= 0` (line 4518) and the tangential travel of that 4 ms is discarded.

That is the whole symptom list in the log, read back: "a 4.0 m/s approach
resolved to a dv of 0.09 m/s and a 9.7 m/s approach to nothing at all"
(`src/main.js:1690` to 1697); six head on approaches at the training wall
all ending as `stuck` clip crashes (`src/game/collide.js:2359`); the Wall
Tap trick having to be re keyed to the sweep's `obsTouched` because the
impulse never arrived (`src/main.js:5402`); and the owner's "the craft
sticking to the wall after a tap", which the last entry of PROGRESS.md
leaves open with the right suspect, "the separation pass rather than the
friction".

Confirm it before you fix it:

1. Add a counter to `passStats` in `resolveContactAt`: whether the sign of
   `n_plant . v_plant` agrees with the sign of `n_three . v_three`. The
   plant velocity is `stateCurr[4..6]`; convert the renderer's normal the
   way `poseFromState` converts a position, minus the offset. Fly
   `npm run park:fly --only="Wall Tap"` and read `window.__contacts()`:
   expect every contact in the town to DISAGREE.
2. Fly a gate on the race field (spawn yaw 0): expect agreement. That
   difference is the proof, and it is the reason the bug lived this long.

### 1.2 The fix, in order

1. One seam for directions. Add `worldDirToSim(x, y, z, out)` beside
   `worldPosToSim` in `src/main.js`: apply `qSpawnInv`, then
   `threeDirToSim`. Use it for the contact normal, the patch arm and the
   moving surface velocity, and make `raiseGroundFromState` use it too, so
   there is one path. Then grep `src/main.js` for every remaining
   `threeDirToSim(` and either convert it or justify it in a comment. The
   goal is that `main.js` no longer calls the bare permutation at all;
   `frame.js` stays the only place the permutation lives, which is
   CLAUDE.md's rule and which the ground slope fix already argued.
2. Keep the guard. Leave the sign check from 1.1 in `passStats` permanently
   and add a pure JS check (the trackbuilder selftest already imports
   `collide.js`; a new small script is also fine) that drives a synthetic
   contact through the same conversion at spawn yaw 0, pi/2 and pi and
   asserts the plant frame normal opposes the plant frame velocity in all
   three. This is the third time this class of bug has been found in the
   repository (the ground slope was the second, PROGRESS.md about 22990).
   The check is what stops the fourth.
3. Do not drop the slide when the plant declines the impulse. In
   `obstacleContactPass` the `dv <= 0` branch (line 4518) breaks out of the
   pass and never commits the leftover travel. With the normal right,
   `contact_impulse` still declines every contact whose patch is already
   moving away from the face (`vn >= 0`), which is the ordinary state while
   a pilot banks off a wall with the hull still overlapping it. Treat a
   declined impulse as a resting or separating contact: project the leftover
   travel onto the face and continue exactly as the `dv > 0` branch does,
   and count it separately (`passStats.resting`). Keep `passStats.dvZero`
   for the case where the plant returned an error code.
4. Separate by the real overlap, not by 8 mm. `Colliders.hit()` writes
   `hitPen` for a box only when the CENTRE is inside it
   (`src/game/collide.js:1508`) and for a capsule when the centre is within
   reach (line 1575). A box face with the centre outside but the four disc
   ellipsoid overlapping reports `hitPen = 0`, so `contactSeparation()`
   nudges 8 mm, the next pass hits at `t = 0` and nudges 8 mm again, and the
   craft creeps off the face at up to 2 m/s with its tangential motion
   thrown away each pass. Report the ellipsoid's overlap along the face
   normal for that case (the semi axis along the face normal, `crx`, `vh`
   or `crz`, minus the centre's overhang from the face) and use it in
   `contactSeparation()`. The moving box branch (line 1453) never writes
   `hitPen` at all; PROGRESS.md 19974 records that as found and not fixed.
   Fix it the same way.
5. Re measure the prop strike. `feelImpact` (`src/main.js:2089`) spins the
   rotors down by `IMPACT_PROP_MAX * dv / IMPACT_FULL`. With a real `dv`
   arriving for the first time, a 6 m/s tap now costs 14 percent of rotor
   speed. Measure whether a tap still flies away (it should sag, not drop)
   and record the numbers. Do not retune `IMPACT_PROP_MAX` unless the
   measurement says a tap cannot be flown out of.
6. Do not touch the restitution law or the materials in this change.
   `CONTACT_E_KNEE`, `CONTACT_E_FLOOR`, `CONTACT_REST_VN` and
   `contactMaterial` were set with the owner in the loop (PROGRESS.md 20378
   to 20500: the owner called a 0.514 m/s rebound "far more than a real quad
   would", and lowering the low speed floor was refused three times). The
   law as it stands gives a wall a constant rebound of `e * CONTACT_E_KNEE`
   = 0.255 m/s at any approach above 1.7 m/s. After the frame fix, measure
   the rebound at 2, 4, 6 and 8 m/s head on and at 45 degrees, write the
   table in PROGRESS.md, and put the question of whether a constant quarter
   of a metre a second reads as a tap to the owner as an OPEN QUESTION with
   the numbers beside it. If you believe it should scale with approach
   speed, argue it there. Do not change it in this turn.

### 1.3 How to prove it

Every claim below is a measurement through the real shell. The self tests
cannot see the shell's frame conversion: `contact:selftest` drives the plant
directly and passed 72 of 72 with this bug present.

1. Head on, three speeds. Add a rig case to `MANOEUVRES` in
   `scripts/park-fly.js` that flies at the training wall (face at
   z 152.325, x 50 to 62, target height 3.2 m, per `PARK.wall`) at 3, 6 and
   9 m/s with the sticks centred on arrival, and returns from
   `window.__contacts()` and `window.__craftState()`: the first contact's
   `dv`, the plant velocity along the face normal one pass before and one
   pass after, the centre's distance from the face 100 ms after, and the
   clip watch outcome. Acceptance: `dvZero` 0 and `resolved` at least 1 on
   the first contact; velocity along the outward normal after the pass at
   least +0.25 m/s for any approach at or above 1.7 m/s (that is
   `e * CONTACT_E_KNEE` for a wall, the law as it stands); the centre at
   least 0.149 m from the face (0.141 of hull plus the 8 mm separation); no
   `stuck`, `thrash`, `inside` or `buried` crash; the distance from the face
   still growing 300 ms later with the sticks centred.
2. Tangential. The same at 45 degrees: the tangential speed after the
   contact is at least 40 percent of the tangential speed before it
   (Coulomb with mu 0.42 against a 6 m/s normal approach removes at most
   about 2.6 m/s), and the craft slides along the face rather than stopping
   on it.
3. Frame independence. The same case against a gate on the race field
   (spawn yaw 0) and against a face at a different world yaw in the town
   (the arch's posts, or the wall's end faces): `dv` agrees to within
   5 percent across them. Before the fix the town and the field disagree by
   the whole impulse.
4. The trick. `npm run park:fly --only="Wall Tap" --reps=5`: 5 of 5, and
   tighten the case so it also asserts the craft LEFT the wall (distance
   along the normal growing after the tap). A rig that can pass a Wall Tap
   with the craft welded to the wall is the rig that passed it on
   2026-09-03.
5. Regression. `npm run contact:selftest` stays 72 of 72 (the plant is
   untouched); `node src/trackbuilder/selftest.js` passes with the new frame
   check added; `npm run verify` is run and reported honestly, including
   that its replay never raises a ground plane or calls a contact entry
   point, so a green determinism hash is not evidence about this change.
6. Determinism. Everything in this part runs on the sim clock inside
   `obstacleContactPass`. Do not add anything that reads `performance.now()`
   or a frame delta into the pass. While you are there: the trick tap
   cooldown at `src/main.js:5414` (`nowWall - trickTouchAtWall`) is on the
   WALL clock, which is a frame rate dependence in a scoring input. Move it
   to sim time.

### 1.4 What not to do

- Do not lower `CONTACT_E_FLOOR`, raise `e`, lower `mu` or change
  `CONTACT_E_KNEE` to make the tap "feel" right before the frame fix is in
  and measured. Every one of those was proposed while this bug was the
  actual cause, and the log refused every one on evidence.
- Do not move the obstacle pass off the sim clock, sample it at frame rate,
  or add a frame delta to the separation. PROGRESS.md 20020 records why each
  was wrong.
- Do not edit `scripts/contact-selftest.js` or anything under `tests/` to
  pass.
- Do not re propose "a hard base first tap should snap into a tumble". The
  owner struck it (PROGRESS.md 20449): "a tap you cannot fly out of is not
  realism, it is a punish".

## Part 2. The scorer misses orbits, inverted orbits, Split-S, powerloops and Matty flips, and mislabels the Juicy Flick

### 2.1 Why this keeps coming back

The same five tricks have been reported missing from real play and closed
at least four times (PROGRESS.md 24714, 25688, 26226, 27523), each time by a
fix to a different layer: angle mode, an empty obstacle field, a probe
waiting on a setting, a frame convention. The recogniser is 3,930 lines.
Its pattern table is well written, its catalogue and its scorer are right,
and its MEASUREMENT layer is not fit for the purpose. Specifically:

1. A lap only exists around a derived axis. `src/game/obstacles.js` reduces
   the colliders to poles (at most 0.9 m across, at least 2.5 m tall) and
   bars (at most 0.8 m thick, at least 2 m long, 1.5 m of daylight beneath).
   Everything the recogniser knows about a loop is the winding of the
   craft's position about one of those axes. So an orbit of the training
   park's 34 m mast scores nothing, because the mast is a 3.0 m section box
   and reaches the field only as "a 3 m stub centred at y 36.2"
   (`scripts/park-fly.js:91`; open since PROGRESS.md 26433 and named
   unfixed five times). A Split-S over a wall, a roof edge, a tree or a
   building corner scores nothing. A powerloop over anything that is not a
   thin rail scores nothing. A pilot in a town flies over roofs and walls far
   more than over railings.
2. The building blocks the sheet prices for open air are unreachable.
   `src/game/tricks.js` prices `Split-S` at 100 as a BUILDING BLOCK with no
   object, and `1/4 powerloop`, `1/2 Power Loop`, `3/4 Power Loop` and
   `1/2 Maverick` likewise, but the recogniser only ever names a Split-S as
   a bar lap `from: 'over'` (`src/game/trickdetect.js:743`). Half of
   "Split-S not registering" is a pilot flying one where the recogniser had
   no bar.
3. The lap's rotation is measured in the body frame and then repaired.
   `PathRun` integrates body rates per axis, subtracts the lap's own turn
   per sample with a sign convention that is "measured per lap from the
   product of two observed signs" (`trickdetect.js:2787`), then decides which
   body axis "owns" the loop by comparing per sample alignment magnitudes
   against `DEBANK_MIN_OWN` and `DEBANK_MARGIN`. The audit at
   `.loop/evidence/freestyle-scoring/audit-2026-09-03.json` (finding 1)
   says a per body axis integral of a banked loop "is not a measurable
   quantity", and the log's own consequences run from "past 41 degrees of
   bank a Powerloop is a Donkey Loop" to "a Cinnamon Roll came out an
   Inverted 360 Powerloop, 650 points for a 175 point trick, in the real
   town". `DEBANK_MIN_OWN` has been 0.72, 0.9, 0.5, 0.9 and 0.5, and its
   comment still says "AND IT STAYS AT 0.9 ANYWAY" above a value of 0.5. The
   Donkey Loop is admitted three times to need "a frame carried along the
   lap" (PROGRESS.md 27162, 27387, 27395). That is a measurement model being
   patched, not tuned.
4. Tricks that differ by PATH are told apart by rotation. Juicy Flick,
   Snapback, Immelmann Turn and Split-S are all a half pitch and a half
   roll. A Juicy Flick is a snap in place with the path barely turning; an
   Immelmann is a climbing half loop whose path turns 180 degrees; a Split-S
   is the roll first and the half loop downward. The recogniser separates
   them by the presence of a bar lap, the sign of the pitch, and "a 200 ms
   coast" (PROGRESS.md 24957). That is why a Juicy Flick is mislabelled: in
   open air it is whichever of the two open air patterns the pitch sign
   picks, and near a rail it becomes an Immelmann or a bare lap. The
   Immelmann also "cannot tell itself from its mirror" (24967).
5. The evidence is synthetic or non deterministic. `score:selftest` passes
   no up axis, so `debankLap` has zero coverage there. `trick:sweep` builds
   attitudes out of the same position maths as the winding, so a frame sign
   error cancelled and it reported 47 patterns clean over a Powerloop
   reading -3.76 turns in the real shell (PROGRESS.md 27530). `park:fly`
   flies the real thing but "varies run to run" and "a single green run is
   not evidence" (27664). There is no recording of the owner's own flight
   that did not score, and no way to replay one.
6. Two frames meet inside the recogniser. It is fed body rates in the
   plant's Z up frame and positions, nose and up in the renderer's Y up
   frame with the spawn yaw premultiplied (`src/main.js:5133`). CLAUDE.md
   says the frames meet exactly once, in `frame.js`.

### 2.2 The decision: rebuild the measurement layer, keep everything above it

Keep, unchanged in meaning:

- `src/game/tricks.js`: the catalogue, the prices, the execution grades, the
  repeat and obstacle tables. Not a number changes.
- `src/game/score.js`: the workbook arithmetic and the combo layer.
- The pattern language: a trick is an ordered list of steps over
  primitives, matched longest, then cleanest, then dearest, with asymmetric
  slack and SLOPPY for any slack; the tap and near primitives; the SINGLES
  floor that keeps cornering silent; the rule that a trick that cannot be
  named is not scored.
- The open air rotation runs (`Run`, `axisStep`, `closeRun`, `snapTurns`).
  Counting quarter turns on one body axis is right for Flip, Roll, Yaw Spin,
  Double Flip and Roll, Rubik's Cube, Cubik's Rube, Vanny Roll, the Rewinds
  and the Stall Rewinds, and it is proven.
- The sweep's property: nothing is ever paid more than it was worth.
- `src/ui/scorehud.js`, `src/ui/trickfilm.js`, `src/game/proven.js` as
  generated output.

Replace:

- The `PathRun` winding model, `debankLap`, `sideOf`, `snapPathTurns`, the
  `rot` triple on a path primitive, `heldByPath` and `lapWindows` as they
  stand, and the pole and bar derivation as the ONLY way an object can take
  part in a trick.

Build in its place a PATH primitive measured from the craft's own
trajectory, in one frame, with objects as a qualifier looked up in the full
collider set. During the migration the old winding may run beside the new
primitive for comparison in the fixture replay, but it must not name
anything, and it is deleted before the work is handed over.

### 2.3 The new measurement model

Do all of it in the renderer's world frame (Y up), because the colliders
live there, and convert the plant state into it through
`src/render/frame.js` only. Add to `frame.js` the one missing conversion,
`simRateToThree(p, q, r, quatThree, out)`: the body rate vector takes the
same component permutation `simQuatToThree` applies to the quaternion's
vector part, then is rotated by the body to world quaternion (spawn
premultiplied, as `scoreQuat` already is at `src/main.js:5133`). Verify the
permutation with three fixtures before anything else: a pure right roll, a
pure nose up pitch and a pure nose left yaw, checked against the sign
convention in `src/native/sim_abi.h` and the craft's drawn axes in
`src/render/craft.js`. Get this wrong and everything below is wrong the same
way, and no synthetic check will show it.

Per 1 ms step the detector receives, in that frame: position `p`, velocity
`v`, body up `b3`, body nose `b1`, world angular velocity `w`. From these it
maintains, allocation free and without trigonometry (dot, cross, sqrt and
small angle sums, the way `stepOneLap` already does), these features:

- Path turning. With `t = v / |v|`, frozen while `|v|` is under a floor of
  about 1.5 m/s so a stall at the top of a loop does not spray the frame,
  accumulate the turning vector `T += t_prev x t`, a small angle rotation
  vector per step. Over a window `|T|` is how far the path turned and
  `T / |T|` is the axis it turned about. A vertical loop gives about one
  turn about a HORIZONTAL axis; an orbit gives turns about the VERTICAL
  axis; a straight line gives nothing; a fly past gives strictly less than a
  half. This replaces winding: it needs no obstacle, and a banked loop is
  still a loop.
- Rotation about the path. `rollT += (w . t) dt`, the body's roll about its
  own velocity: the half roll of a Split-S, an Immelmann and a Juicy Flick,
  the whole roll of a Power Roll, bank independent by construction.
  `loop += (w . n) dt` with `n = T / |T|` over the current turn, the body's
  rotation about the loop's own axis: a Powerloop carries one turn of it, a
  Power Flip two, a Beginner Matty none. `spin += (w . up) dt`, rotation
  about world up: the yaw of a Cinnamon Roll, a Donkey Loop, an Inverted 360
  Powerloop, and the tracking yaw of an orbit.
- Which body axis the loop is on. `|n . b1|` per sample, averaged over the
  turn: near 0 is a loop flown across the nose (pitch, the Powerloop
  family), near 1 is a loop flown along the nose (roll, the Maverick
  family). This is the code's existing alignment idea measured against the
  PATH axis instead of an obstacle axis, so it works around any object and
  in open air, and it does not need a sign convention.
- Nose against path. `b1 . t` per sample: forward flight near +1, backward
  near -1. A Matty Flip exits flying backwards; a Split-S exits forwards;
  an orbit's nose is on the centre, not on the path.
- Inversion. `b3 . up < 0` per sample, and the fraction over a primitive, as
  today.
- Centre of curvature. From the acceleration perpendicular to `v`
  (differenced from `v` per step and low passed), `c = p + n_perp * |v|^2 /
  |a_perp|`. For an orbit `c` stays within about half the radius of one
  point for the whole primitive; for a loop it traces the loop's centre.
  Carry `radius = |p - c|` and its max over min, which is the `radiusRatio`
  instrument the code already carries and never reads.
- Objects. When a path primitive closes, ask the colliders, not the derived
  field: `view.colliders.gapAt(c.x, c.y, c.z, radius)` at the loop's centre
  answers "something solid inside this loop" (the mast, a rail, a wall, a
  tree, a roof edge all answer); the segment from the entry point to the
  exit point through `crossedStatic`, or `gapAt` at its midpoint, answers
  "went over it and came back under it"; a solid inside the circle at the
  craft's height band answers "orbited a pole". Keep `deriveObstacles` only
  for the scorer's obstacle identity (`groupOf`, the repeat obstacle and
  obstacle bonus tables), where a collider index or a merged axis id is
  enough; it no longer gates whether a trick exists. Fix its mast bug while
  you are there: a box 3 m across and 34 m tall is an obstacle for its whole
  height, and a `pole` for the scorer's purposes is anything the craft went
  round.

The primitives are then:

- `rot`, unchanged: one body axis, quarter turns, direction, inversion
  fraction, tap, nearest.
- `path`: `turns` (from `|T|`, snapped to a quarter); `axis` (`horizontal`
  or `vertical`, from `T / |T|`); `startBelow` and `endBelow` (for a
  horizontal axis loop, whether the craft entered under or over the loop's
  centre height, which replaces `sideOf`); `loopOn` (`pitch` or `roll`, from
  `|n . b1|`); `rollT`, `loop`, `spin`; `forward` (the mean of `b1 . t`);
  `inverted` fraction; `track` fraction (the angle between `b1` and `c - p`,
  the orbit's tracking, against the lens half angle `TRACK_DOT` = 0.55 that
  was measured); `radiusRatio`; `object` (`none`, `inside`, `overUnder`);
  `tapped`; `startMs`, `endMs`, `orderMs`.

Write the loop families in those terms. Do not carry the old `rot` triple
forward. As a start, to be corrected against the fixtures and against
`tricktionary-outdoor.json`, which is the copy of record for what a trick IS:

- Powerloop: `path`, horizontal axis, turns 1, `startBelow`, `loopOn` pitch,
  `loop` 1, `object` inside. Without an object it is a `Flip` block, or the
  `1/2 Power Loop` and `3/4 Power Loop` blocks for the partial turns, which
  the sheet prices and which are unreachable today.
- Maverick Loop: the same with `loopOn` roll and `rollT` near 0. Mavvy Roll:
  `rollT` near 1.
- Immelmann Turn: `path` half turn CLIMBING, `startBelow`, `loopOn` pitch,
  then `rot` roll 0.5 within `STEP_GAP_MAX`; or one `path` whose `rollT`
  reaches 0.5 late in the turn. The mirror (a nose down half loop) is a
  different trick, so the climb is part of the definition.
- Split-S: `rot` roll 0.5 to inverted, then `path` half turn DESCENDING with
  `loopOn` pitch and a forward exit. The object is optional: the block at
  100 has none and the catalogue entry at 100 has one, so name it either way
  and record the object for the obstacle tables.
- Matty Flip: `path` half turn descending from over an object, `loopOn`
  pitch, `loop` 0.5, exit BACKWARDS (`forward` near -1), `object`
  overUnder. Beginner Matty: the same without inversion and with `loop`
  near 0.
- Juicy Flick: `rot` pitch 0.5 forward with the PATH turning under a quarter
  during it, then `rot` roll 0.5 within `STEP_GAP_MAX`. Snapback: the pitch
  backward. Neither needs an object. Both are refused when the path turned
  more than about a third of a turn during the pitch, because that was an
  Immelmann or a loop, not a flick.
- Orbit x2: `path` vertical axis, turns at least 2 (a floor, as today),
  `track` at least 0.7, upright, `object` inside the circle. Trippy Spin x2
  and 1 Trippy Spin: `inverted` at least 0.55. Keep the deliberate absence
  of a single upright orbit (it is a Yaw Spin, and paying twice for one
  motion was a real bug).
- Wall Tap and the wall family: unchanged patterns over `rot` plus
  `tapped`, which Part 1 makes real.

Keep the dead band and tie break rules the audit argued for (findings 3, 5
and 6, already applied in `matchSteps`): a quantity that separates two
tricks by half a turn is accepted free within a quarter, at one slack out to
the band, and refused beyond it; a superset pattern beats its subset only on
positive evidence; length never beats contiguity (`STEP_GAP_MAX`). A trick
that reads halfway between two names is named neither.

### 2.4 The evidence pipeline, and build it FIRST

Nothing in 2.3 can be judged without it, and the log's own lesson is that
every harness so far was blind to a different fault. Build this before
touching the recogniser, and use it to characterise the current recogniser's
misses so the rebuild has a baseline to beat.

1. Record the exact stick stream. `src/share/flightlog.js` samples once per
   rendered frame, which cannot be replayed exactly. Add a recorder that
   captures every RC frame the shell hands to `sim_input` (sim timestamp in
   microseconds plus the four channels) and writes the `.rec` format that
   `tests/lib/recfile.js` defines and `tests/inputs/baseline.rec` uses,
   with a small JSON sidecar: map id, spawn pose, config diff name, the
   `dist/sim.wasm` hash, and free text labels ("orbit of the mast from
   0:42"). Put it behind the existing flight log toggle and a key, and make
   the file downloadable. This is the instrument the owner uses to hand you
   a flight that did not score.
2. Replay it deterministically in the real shell. Add a replay mode (a query
   parameter or a `window.__replay(recBytes, sidecar)` hook) that drives
   `sim_input` from the file ON THE SIM CLOCK, with drawing off
   (`window.__drawOff`), the same map, spawn and config, and reports the
   named tricks with timestamps and a hash of the state trace. CLAUDE.md
   promises that the same input stream gives a bit identical trace, and the
   verify harness already proves it for `tests/browser/harness.html`; extend
   the proof to the shell by replaying one fixture twice, and once at a
   different simulated frame batching, and asserting identical hashes and
   identical trick lists. A Node replay through `dist/sim.wasm` alone is not
   enough, because ground raising and the obstacle contact pass live in the
   shell; use headless Chromium through `tests/lib/page.js` the way
   `park:fly` does.
3. Turn the rig into a fixture generator. When a `park:fly` case passes,
   save its stick stream and its expected name as a fixture
   (`tests/fixtures/tricks/<name>-<n>.rec` plus sidecar). A rig that varies
   run to run becomes a permanent, deterministic test the moment one good
   run is captured. Do the same for negative cases: a coordinated turn, fly
   pasts of a rail at 3, 5 and 8 m, a straight climb and a straight dive
   past a bar, a lap of the town with no tricks, a landing, a ground scuff.
   The sweep's over claim property becomes "no negative fixture names
   anything", which is a stronger statement than the sweep ever made.
4. Get the owner's flights. Ask, in the PR and in PROGRESS.md, for
   recordings of each reported miss flown in the practice field: an orbit
   of the mast, an inverted orbit, a Split-S over the split bar and over the
   wall, a powerloop of each arch, a Matty Flip, a Juicy Flick, a Snapback,
   a Wall Tap. Those recordings are the specification. Until they exist,
   the rig's captures stand in, and say so.
5. A trick replay script. `scripts/trick-replay.js <fixture>` prints the
   primitives and the names with timestamps; `--all` runs every fixture and
   reports positives named, negatives silent, and any over claim, in the
   sweep's buckets (silent, under, over, right). This is the check to run
   after every change to the recogniser. It is deterministic, so one green
   run is evidence, which nothing in the repository can say today.

### 2.5 Acceptance

- Every positive fixture for Orbit x2, Trippy Spin x2, 1 Trippy Spin,
  Powerloop (tight, wide and banked), Maverick Loop, Immelmann Turn, Split-S
  (over the arch, over the wall, and in open air), Matty Flip, Juicy Flick,
  Snapback, Flip, Roll, Yaw Spin, Inverted Yaw Spin and Wall Tap names the
  trick, CLEAN or SLOPPY, on every replay. No negative fixture names
  anything. No fixture is paid more than its label is worth.
- The orbit of the 34 m mast in the park scores.
- The Juicy Flick, Snapback, Immelmann and Split-S fixtures are separated by
  path turning and by direction, and `DETECTION.md` says how.
- `npm run score:selftest` is rewritten to feed the new inputs. The
  constructed cases that fed the pattern table its own numbers back
  (PROGRESS.md 24943) are replaced by replayed fixtures, not preserved.
- `npm run trick:sweep` either drives the new primitives from real frames
  or is retired in favour of the fixture replay. Do not leave a synthetic
  sweep whose blind spot is documented as load bearing.
- `src/game/proven.js` is regenerated from the fixture replay, and the
  trick list reads it.
- The tap cooldown and every other scoring input is on the sim clock.
- The recogniser stays deterministic across engines: no `Math.sin`,
  `Math.cos`, `Math.atan2` or `Math.pow` in `trickdetect.js` or in the new
  conversion, so a fixture names the same tricks in Node and in the browser.

### 2.6 What not to do

- Do not add a fourth de banking heuristic to `debankLap`. The audit and
  the log both say the frame is the problem, not the threshold.
- Do not widen `HALF_LAP_MIN`, `CONCURRENT_TOLERANCE`, `TRACK_DOT` or
  `INVERTED_MIN` to make a fixture pass. If a threshold is wrong, the
  fixture corpus is the argument: write the measured populations on both
  sides in PROGRESS.md.
- Do not keep the winding model naming tricks beside the new one past the
  migration. Two measurements of one loop is how a Powerloop was paid twice
  (PROGRESS.md 25938).
- Do not trust a green `park:fly`. Capture it as a fixture and trust the
  replay.
- Do not change a price in `tricks.js`. The sheet is the argument.
- Do not edit anything under `tests/` to pass, and do not commit
  screenshots.

## 3. Order of work, and what to hand back

1. Part 1: 1.1, then 1.2 items 1 to 4, with the measurements in 1.3.
   Commit and push with a PROGRESS.md entry that carries the numbers. Land
   this first and alone; it is a small change with a large effect.
2. Part 2, section 2.4: the pipeline, then a baseline. Replay every fixture
   through the CURRENT recogniser and record what it names. That table is
   the before picture and it goes in PROGRESS.md.
3. Part 2, section 2.3, family by family: Powerloop and Maverick; the half
   loop family (Immelmann, Split-S, Matty Flip, Beginner Matty); the open
   air pair (Juicy Flick, Snapback); the orbits; then the loop variants
   (Power Flip, Power Roll, Inverted 360 Powerloop, Donkey Loop, Cinnamon
   Roll, Jump Rope, Side Loop). Run the fixture replay after each family
   and never regress a family already landed.
4. Consult the advisor before 2.3, which changes the shape of a game
   system, and before any change to the contact law in Part 1. The frame
   fix in 1.2 needs none.
5. Every turn appends to PROGRESS.md, including what went wrong. No em
   dashes or en dashes anywhere, including commit messages. Nothing is
   reported as passing that was not run in the same turn, and every check
   that ran is named with what it can and cannot see.
6. Report honestly at the end: which checks ran, which could not run in the
   container (`build:wasm`, `lint:catalog`), which fixtures exist and where
   they came from (the owner's flights or the rig's), and the open questions
   for the owner, starting with the rebound law.
