# Making the whoop feel like a whoop

Measured on 23 September 2026 against the module as committed (`dist/sim.wasm`,
trace `de0401cd4266`) and against a scratch build of the same source with one
measuring row added. Every figure below was taken in this session and the rig
that took it is in `.loop/evidence/whoop-feel/`.

This is a plan, not a change. No source file moved.

The request: tweak the current setup, for the whoop only, so it feels more like
a whoop and less like a five inch. The standing constraints come from the
owner's own verdicts. The honest 65 mm plant "does not feel like flying". The
five inch does. And "in RL the whoop flys mostly like a 5 inch with slightly
less momentum", which Round 70 recorded as not delivered.

## 1. What the whoop is now, measured

`W` is the honest whoop plant (`SIM_AIRFRAME_WHOOP65`, still compiled, on its
own stock tune, gravity 1.0) in a life size room: what the literature says a real
65 mm whoop does. `F` is the whoop the shell flies: the five inch's plant at
gravity 1.62 in the room built `MICRO_SCALE` = 3.4289 times life size. Every
length is divided by the room's factor, so each number is what the PICTURE
does. Time is not scaled.

| picture units | W real whoop | F shipped whoop | F / W |
|---|---:|---:|---:|
| hover, of stick | 0.337 | 0.351 | same |
| thrust to weight | 5.13 | 5.21 | same |
| terminal, throttle cut | 8.0 m/s | 8.2 m/s | same |
| gravity the picture falls at | 1.00 g | 0.47 g | 0.47 |
| fall 4 m from a hover, throttle cut | 1.02 s | 1.41 s | 1.38 |
| carry: level from 4 m/s, time to half speed | 1.19 s | 1.81 s | 1.52 |
| carry: distance to half speed | 3.56 m | 5.33 m | 1.50 |
| brake: full pitch back from 4 m/s | 0.52 s, 1.36 m | 0.78 s, 1.97 m | 1.50 |
| punch: height after 0.5 s full throttle | 2.77 m | 1.56 m | 0.56 |
| 5 percent of stick over hover, climb after 1 s | 1.72 m/s | 0.79 m/s | 0.46 |
| roll, full stick, rise to 90 percent | 28 ms | 52 ms | 1.9 |
| yaw, full stick, rise to 90 percent | 26 ms | 165 ms | 6.3 |
| pack sag, sustained punch | 21 percent | 8 percent | |
| blade pass at hover, what you hear | 1.73 kHz | 0.57 kHz | 0.33 |

**The shipped whoop is a real whoop in slow motion.** The things a pilot reads
as "what it weighs" already match: hover, thrust to weight and terminal are the
same to a few percent, because the owner's gravity base of 1.62 happens to
land the five inch's thrust to weight on the whoop's. What does not match is
the clock. Everything translational, the fall, the carry, the brake and the
punch, runs about 1.4 to 1.5 times slower than a real whoop does, and that is
not a coincidence of tuning. It is the one seam the fiction has: gravity does
not come through the room's factor. A craft in a world built 3.43 times larger
under 1.62 g is dynamically the small craft under 1.62 / 3.43 = 0.47 g, and a
Froude scaled clock runs slow by the square root of that, 1.455. The measured
ratios sit either side of it.

That slow clock is what "five inch momentum" is. The craft carries half again
as far when levelled, takes half again as long to stop, and hangs at the top
of every climb. It is also a large part of why this version feels like flying
and the honest whoop did not, which is the thing the plan must not lose.

Rotation is a separate gap: a real whoop reaches its roll rate twice as fast
and its yaw rate six times as fast. And the craft sounds like a five inch,
because the audio is driven by the five inch's rotor speed.

## 2. The idea: one number for pace

Give the whoop its own plant row: the five inch's row with its **mass times k
and its own gravity divided by k**.

The weight force m g is unchanged, so everything that depends on force is
unchanged by construction: hover, thrust to weight, terminal, top speed, the
motors, the pack, the current, the Weight slider's whole table, and the rate
response. What changes is that every translational acceleration, gravity,
punch, drag and tilt, is 1 / k times stronger. It is a dial on the clock and
nothing else. At k = 1.62 / 3.4289 = 0.47 the picture falls at exactly 1 g,
which closes the seam.

Measured on the scratch row, picture units:

| row | g seen | fall 4 m | carry to half | carry distance | brake | punch 0.5 s | +5 pct climb |
|---|---:|---:|---:|---:|---:|---:|---:|
| F shipped, k 1 | 0.47 | 1.41 s | 1.81 s | 5.33 m | 0.78 s | 1.56 m | 0.79 |
| k 0.85 | 0.56 | 1.31 | 1.56 | 4.59 | 0.70 | 1.75 | 0.88 |
| **k 0.70** | 0.67 | 1.21 | 1.30 | 3.86 | 0.62 | 1.99 | 0.98 |
| **k 0.62** | 0.76 | 1.15 | **1.17** | 3.47 | 0.57 | 2.15 | 1.04 |
| k 0.55 | 0.86 | 1.09 | 1.05 | 3.12 | 0.53 | 2.30 | 1.09 |
| k 0.47 | 1.00 | 1.03 | 0.92 | 2.74 | 0.48 | 2.48 | 1.16 |
| **k 0.47, air 0.75** | 1.00 | **1.00** | **1.18** | **3.53** | **0.51** | 2.53 | 1.17 |
| W real whoop | 1.00 | 1.02 | 1.19 | 3.56 | 0.52 | 2.77 | 1.72 |

Hover 0.350 to 0.351, thrust to weight 5.21 to 5.22, roll 52 ms and yaw 161 to
165 ms on every row: the dial moves nothing but the clock, which is the claim.

Read down the table: **k 0.62 carries exactly like a real whoop** (1.17 s
against 1.19), and **k 0.47 with the air at 0.75 matches the real whoop on the
fall, the carry, the carry distance and the brake at once**. That last row is
the whole translational gap closed, with the five inch's thrust, hover,
throttle and rotation underneath it. It needs the existing `sim_set_air` too,
because at the full Froude clock the five inch's drag stops the craft a little
faster than a whoop's does.

### Why not the knobs that already exist

| alternative | what it does | why not |
|---|---|---|
| gravity alone, 1.785 | fall 1.34 s, carry 1.73 s | Moves the clock by 5 percent and moves thrust to weight AWAY from the whoop's, 5.21 to 4.73, and hover up to 0.372. |
| air alone, 1.5 | carry time 1.25 s | Right time, wrong distance: 2.59 m against 3.56, because it bleeds speed hard at the start. Nothing vertical moves. Available today with no rebuild, but it is a second board and record transition for a partial fix. |
| Round 70's lighter five inch, mass 0.85 at the same gravity | | Raises thrust to weight to about 6.1 and drops the hover, both away from the whoop, and shortens the carry less than the pace row at the same k, because most of the braking is rotor drag and rotor drag falls with the lighter hover thrust. The pace row is the same idea with the weight held. |
| the honest whoop plant | | The owner's verdict, on every version of it. |

## 3. The steps

Each step is flown before the next one starts. A rung is a pilot's word, which
is how every feel constant in `plant.c` got its value.

### Step 1: the whoop's own row, pace only

A third row in `PLANT_TABLE`, `SIM_AIRFRAME_WHOOP_PACE = 2`, written out in full
like the other two, identical to the five inch's except `mass_kg` 0.71 k and
`gravity` 9.80665 / k. `configs/airframes.js` points `whoop65` at `simId: 2`.
`dims` do not change, so `MICRO_SCALE`, the collider, the rest height and
`check:craft` are untouched.

- **First rung k = 0.70**, every translational time about 30 percent shorter.
  **Then k = 0.62**, where the carry is a real whoop's. The Froude rung, 0.47
  with air 0.75, is there if the pilot keeps asking for more.
- Consult the advisor first: this adds an accepted id to `sim_set_airframe`,
  which is an ABI change, additive, version unchanged. No advisor channel
  exists in these sessions, so the argument goes in PROGRESS.md the way the
  air round did it.
- Checks, the `verify-flight-model` procedure: `npm run build:wasm`, `git diff
  --stat vendor/betaflight` empty, `npm run verify` with the five inch's
  trace still `de0401cd4266`, which the scratch row here already showed.
  `npm run whoop:gates` grows gates for plant 2: hover, thrust to weight,
  terminal and motor time constant equal to plant 0's to three figures, which
  is what the pace row promises and what drift from plant 0 would break, and
  the pace figures inside bands taken from W above. `lint:presets`,
  `lint:shell`, `check:craft`.
- The first two items of section 4, the Tune row and the record key, land in
  this step, or the whoop's Tune row goes empty and its records mix.
- **Fly it.** What to look for: the craft stops when you level it, drops when
  you chop it, turns tighter at the same bank, and hover, punch and rates
  feel exactly as before. **What would count as wrong:** the throttle feels
  twitchy in the room (see risks), a landing slams, or anything about
  rotation changed, because nothing about rotation should.

### Step 2: the whoop's voice and its ducts, shell only

Can run beside Step 1. Neither touches the plant or the harness trace. The
duct change does alter what a gate hit costs a flown lap, which is the point.

- **Voice.** `audio.update` is fed the five inch's rotor speed, so the whoop
  hums at 573 Hz in a hover (11,455 rpm) where a real one screams at 1.73 kHz
  (34,677 rpm). A per airframe pitch factor in `src/render/audio.js`, taken
  from the airframe entry. The physics says three. The owner has asked for a
  softer, lower mix more than once and the low pass cap is 1000 Hz because
  of it, so the factor is chosen by ear, starting near two, and the cap moves
  with it only if the owner says so. The `audio-bed` check in `npm run
  verify` keeps asserting the five inch.
- **Ducts.** A whoop that clips a gate bounces off it and keeps going, because
  the duct takes the hit and the blades never touch. `feelImpact` in
  `src/main.js` takes up to 28 percent of the rotor speed on every obstacle
  hit. Per airframe: near zero on the whoop.
- Checks: `lint:shell`, the audio probe, then **listen to it and fly it**:
  bump a gate at pace; wrong is a stutter in thrust on a duct tap, or a voice
  that hurts.

### Step 3: rotation, if the owner wants it

Inertia on the row, times 0.70 and then 0.60. It is the only step that touches
what the owner likes about the five inch, so it is flown on its own.

| row | roll rise | yaw rise | roll 1/4 overshoot | yaw full overshoot, reversal | hover roll RMS |
|---|---:|---:|---:|---:|---:|
| F shipped | 52 ms | 165 ms | 16 pct | 7 pct, 51 deg/s | 0.035 deg/s |
| inertia 0.70 | 46 | 91 | 13 | 7, 58 | 0.049 |
| inertia 0.60, k 0.62 | 44 | 69 | 13 | 8, 66 | 0.057 |
| inertia 0.50 | 43 | 51 | 12 | 9, 80 | 0.069 |
| W real whoop | 28 | 26 | 9 | 13, 68 | 0.086 |

Betaflight's default tune stays well damped all the way down. Roll overshoot
falls; yaw overshoot rises two points to 9 percent at half inertia, still under
the real whoop's 13; hover jitter doubles and stays under the real whoop's; and
the yaw reversal at 0.60 is the real whoop's. The yaw is where the five inch
is least like a whoop and where inertia buys the most.
Same checks as Step 1. **Fly it:** flips, rolls and yaw at gate exits. Wrong is
twitch, a bounce back when the stick centres, or hover jitter.

### Step 4: the floor cushion

`k_ground` on the row. The five inch has none because of its calibrated
envelope; the pace row has no such envelope. The form is the one the whoop
already uses, on two prop radii, so its reach in picture units is 37 mm
against the real whoop's 31 mm, and 0.7 lands the cushion on the whoop's:

| hover stick, fraction of free air | CG 2 cm | 4 cm | 8 cm |
|---|---:|---:|---:|
| W real whoop | 0.954 | 0.983 | 0.994 |
| k_ground 0.7 | 0.948 | 0.978 | 0.991 |
| k_ground 1.0 | 0.929 | 0.971 | 0.989 |

(The height loop leaves about half a percent of its own offset, 0.994 with no
cushion at all, so compare rows.) **Fly it:** skim the mat, land, hop a bottom
bar. Wrong is a sticky floor or a porpoise near it.

### Step 5: recorded, not recommended now

- **Duct lip, the nose up at pace.** About 0.03 to 0.05 on the pace row puts
  the nose up couple in the whoop's range at race pace (0.91 percent of pitch
  authority with none, 1.47 at 0.05, the real whoop 1.49, but the probe's
  passes were at unmatched speeds, so calibrate again at matched speed).
  Small, and it was part of the package the owner rejected.
- **Sag.** Four times `r_cell` gives 23 percent under a punch against the
  whoop's 21, and with it takes thrust to weight at the top of a punch from
  5.21 to 3.91, the half second punch from 1.99 m to 1.39, hover from 0.351
  to 0.357, and roll and yaw rise to 56 and 193 ms. The carry does not move.
  Too broad for a feel step.
- **Duct augmentation and its fade.** "Hangs beautifully then wades." It
  changes hover and needs `kt` re-solved round it. Last, if ever.

## 4. What has to move with it

- **The Tune row goes empty.** `tunesFor` in `configs/registry.js` offers a
  tune when its owner's `simId` equals the seated one. At `simId: 2` the whoop
  matches nothing. The rotation is plant 0's, so the tunes written for plant 0
  are the right ones: the airframe names the plant its tunes are written for.
- **The record key.** A lap on the pace row is a different aircraft from a lap
  on today's whoop, and `recordKey` cannot tell them apart: it keys on the
  airframe id and the gravity multiple, and neither moves. It needs the plant
  in it for the whoop, with an empty suffix for plant 0 as the key always has.
- **The board.** Every time on a room was flown on today's whoop and the laps
  will get quicker. Round 69 met the same fork and the owner left the board
  alone. Owner's call again.
- **The words.** "Indoors, 65 mm, 5 inch feel" and both blurbs, in
  `configs/airframes.js` and `src/ui/ui.js`, and the long comments there that
  argue why the whoop flies plant 0. The launch card keeps saying 6S: the
  pack is still the five inch's. And the landing page, in another repository,
  if its copy describes how the whoop flies.
- **The feel report** carries the plant id, so a report on the new whoop is
  not read as one on the old.
- **`sim_bf_debug`** grows a tap for the row's gravity, so gates compute
  thrust to weight against what is compiled in rather than 9.80665.

## 5. Risks, and what this cannot do

- **The throttle gets livelier in the room.** Five percent of stick climbs
  0.79 m/s of picture now, 0.98 at k 0.70 and 1.17 at the Froude rung,
  against the real whoop's 1.72. Round 38 found that number, five percent of
  stick against a four metre ceiling, to be most of why the honest whoop was
  hard. The ladder stops well short of it, but it is the first thing to ask
  about after each rung, and the throttle cap on the Rates screen is the
  existing answer.
- **Balloon falls.** 3.05 m after a punch now, 2.84 at k 0.70, 2.32 at 0.47,
  against the real whoop's 4.14. A whoop that floats up after a punch and a
  five inch that hangs are two different things, and the pace row gives the
  real whoop's fall without its balloon. The pilot will tell us if that reads
  wrong.
- **The seam moves, it does not vanish.** The hall is still 34 by 41 m. Only
  the picture's gravity comes toward 1 g, and it only reaches it on the last
  rung.
- **Nothing here claims feel.** Every number above is a machine measuring a
  machine. The harness can prove the five inch did not move and the pace row
  does what it says; whether it feels like a whoop is the pilot's to say.

## 6. Owner decisions

1. The first rung: k 0.70 is recommended, then 0.62.
2. Whether rotation, Step 3, joins at all.
3. The board's whoop times: leave, label, or clear.
4. The card's words for what the whoop now is.
5. The voice's pitch, by ear.

## Appendix: how the numbers were taken

- **Toolchain.** This container has none installed. `apt-get install
  emscripten` gives 3.1.6, the version the air round rebuilt with, and
  Betaflight at the pinned `77d01ba` came in as a one commit fetch into a
  scratch copy of the tree. The unmodified source rebuilt **byte for byte
  identical** to the committed `dist/sim.wasm` (sha256 `c59958ec1c9ecf85`),
  trace `de0401cd4266`, vendor tree clean after the build. So the blocker
  Round 70 recorded is gone: a session can build here. The repository's own
  `vendor/betaflight` is still an empty directory and nothing in it moved.
- **The measuring row.** `scratch-variant.patch` adds airframe id 2 as a
  runtime copy of row 0 with nine knobs behind an exported `scratch_variant`.
  With it applied the five inch's trace is still `de0401cd4266`, and the
  identity row reproduces F exactly. It is a measuring rig and must not ship.
- **The probe.** `probe.mjs` flies both modules; `results-2026-09-23.jsonl` is
  its output. Run it from the repository root, with `--scratch=` pointing at a
  module built with the patch.
- **What went wrong.** The first install died on a stale package index.
  Worse, the first probe restarted the 250 Hz stick grid at every change of
  manoeuvre, so the sample that levelled the sticks came 1 ms after the one
  before it. Feedforward read a stick four times faster than it moved, the
  craft pitched 10 degrees past level and braked, and the carry came out non
  monotonic in k. Every figure above is from the corrected probe, and the
  probe's header says so. `scripts/whoop-gates.js` restarts its grid the same
  way at `startMs`; its joins are throttle only, which feedforward does not
  read, though anti gravity and throttle boost do.
- **Limits of the rig.** The ground and nose up rows use slow hand loops, so
  they compare rows rather than give absolutes. The carry is flown in angle
  mode so the levelling is the controller's and identical on every row.
