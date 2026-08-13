# Handover

Read `CLAUDE.md` first, then this, then `.loop/state.json`, then
`.loop/tried-and-rejected.md`, then `.loop/blocked.md`, then
`.loop/threshold-disputes.md`.

## Which loop is running

The world, sound and track loop. Three things have to hold at once: a world
that makes a stranger believe this is a commercial product and runs on a
machine with no discrete GPU, a mix somebody would choose to wear headphones
for, and a real MultiGP course at real MultiGP dimensions under MultiGP
rules. The G and P items carry over from the low spec loop unchanged. The A
sound items and the T track items are new.

Branch: `claude/webfpv-world-sound-track-kdx9vo`, cut from `main`.

`main` was fast forwarded to round 10 **on the human owner's explicit
instruction**, not because the rubric went green. It did not: G, A and T are
largely FAIL and the definition of done, two consecutive rounds with every
item PASS by adversarial review, has not been met. Round 10 contains
instruments, evidence, a data module nothing imports yet, and an audio
refactor with no audible change, so merging it costs nothing and loses no
work. Do not read the merge as a completion signal, and do not stop looping
because of it. The next round's first item is unchanged: the regulation gate
and UTT 3.

Round numbering: `PROGRESS.md` rounds 1 to 5 are the old polish loop, 6 to 9
are the low spec loop, and this loop continues the overall count from 10.
`.loop/state.json` carries the overall number.

## Container setup, do this first, neither step is optional

    git submodule update --init --depth 1 vendor/betaflight
    git clone --depth 1 https://github.com/emscripten-core/emsdk /opt/emsdk
    cd /opt/emsdk && ./emsdk install 3.1.61 && ./emsdk activate 3.1.61
    source /opt/emsdk/emsdk_env.sh    # every new shell, before npm run verify

Without them check 1 fails for want of a compiler and `npm run verify`
reports 11 of 13, which looks like a regression and is not one.

There is no PIL and no working numpy or pdfminer in this container. Do not
spend a round trying to install one. `scripts/pixels.js` decodes PNGs and a
20 line Node script can decode, crop and cluster one; that is how the
MultiGP diagram below was measured.

## Round 15 built the second map. Read this before anything below it.

Branch `claude/freestyle-city-map-x22okv`, cut from `main` at `e57cba1`.
`npm run verify` is **15 of 16**, `yaw-coupling` the one red. Determinism hash
is now **5d51dbbe08eb**, not `000931016224`: the plant changed, which is what
checks 2, 3 and 4 exist to police, and all three agree.

Full account in PROGRESS.md round 15. The short version of what a next round
has to know:

**There are two maps now and the shell is split.** `src/render/shell.js` owns
the renderer, camera and airframe for the session; a MapInstance owns its
scene, post chain, colliders and contact data and disposes all of it on a
swap. The contract is written down in `src/maps/README.md`. Read it before
touching `main.js`.

**The city is 59 vendored MIT files under `src/maps/city/vendored/`.** Two
patches, both recorded as `.diff` files beside the tree: the planet bake is
optional, and a dead `flatShading` parameter is removed. `NOTICE` carries the
provenance. Do not edit anything else in there; wrap it in our own GPLv3 code
under `src/maps/city/` instead.

**Two of the survey's blockers were measured and are WRONG.** Every city
collider has a `top`, so a quad flies over a signpost the way a walker steps
over a kerb; and the unculled 900 k triangle floor is a property of the planet
bake, which we do not run. The design's determinism and licence findings held.

**P1 fails on the city by 12.3x and the reason is structural.** 4,935 draw
calls at street level after a spatial material merge, instanced chunking and
distance culling, down from 16,647. The floor under that is 3,545 distinct
materials, 3,048 of them used by exactly one mesh, because every sign and
fascia carries its own Canvas2D texture. Getting past it means atlasing three
thousand generated textures. **No threshold was moved and none should be.**

**Do not quote the attract view on either map.** Its camera orbits on the wall
clock. Park it with `__setCam` and wait on `__boot().frames`, not on a timer:
`__setCam` only lands on the next animation frame and `__budget` renders
directly.

### Owed, in priority order

1. **Gyro noise. The D term chain is still decorative.** This is the one plant
   item of the four that did not get done, and it is the one that makes the
   quad tunable. Deterministic shaped noise into `s->omega` as read by the
   bridge only, seeded from `step_index`, in `src/native/bf/bf_glue.c` around
   line 271 where `gyro.gyroADCf` is written.
2. **The motor constants, as one derivation.** `plant.c` carries the ESC
   current ceiling as a comment with its numbers because applying it takes
   check 8 from 18 ms to 51 ms. The band and a 48 A limit cannot both be met
   by this kt, kq, ke, r_motor and j_rotor. Re-derive all five against a real
   2207, and re-specify check 8, which reads a small signal time constant with
   a zero to full step from rest. Peak pack current today is 409.8 A and
   1.54 V a cell.
3. **yaw-coupling's floor.** It measures -0.06 deg against 2.0, with a real
   mechanism and the right sign for the first time. Reaching 2.0 needs about
   44 degrees of motor misalignment. The floor is a "Loop A harness choice" in
   `thresholds.json`, not a measurement. Argue it with the algebra in
   PROGRESS.md round 15, do not lower it quietly.
4. **The city's draw calls**, if a texture atlas is ever worth a round.
5. **Betaflight's dropped diff settings**, 96 percent silently discarded, and
   the 250 Hz RC claim against sticks sampled at the frame rate. Both untouched
   and both still in the round 12 list below.

## Round 13 CLOSED five of the owed findings. Read this before the list below.

The art director review did return. Five items are fixed and measured, and
one of its recommendations is refused with an argument. Details and numbers
in PROGRESS.md rounds 13, 13b, 13c, 13d, 13e. Summary:

- **CLOSED, the rim halo.** `celmat.js` RIM_CHUNK quantised the rim with
  `step(0.5, celRim)`. On a gate upright 7 px wide at 1.2 m the step was true
  across the tube's whole visible width, so the rim REPLACED the material
  rather than edging it: 0.209 flat where the material reads 0.140, 49
  percent overbright with no shading left in it. Now a cubed smoothstep
  scaled by the luminance of the fragment under it. Craft rim strengths, the
  highest in the scene and on its darkest materials, cut to 0.26 to 0.28.
- **CLOSED, the sun.** 10,393 px of a 1600 by 900 frame had all three
  channels at 254 or higher. Both sun terms were added on top of a sky
  already at 0.59, 0.72, 0.83 at the sun's altitude. AND `vDir` was
  normalised per vertex but not per fragment, so `dot(vDir, sun)` was short
  by up to half a percent inside each triangle of the 40 by 24 dome and the
  disc threshold only fired in patches following the tessellation: it was
  never a circle. Clipped pixels now 0, disc a symmetric 0.889 peak.
- **CLOSED, the mountain ladder.** It was solved against a sky of 0.781 and
  ground of 0.428, both DERIVED from authored colours. Measured off a capture
  they are 0.487 and 0.192, so the ladder climbed past its own ceiling and
  rings 1 to 3 rendered brighter than the sky behind them. Re-solved on the
  measured anchors: 0.250, 0.310, 0.370, 0.430.
- **CLOSED, gate spacing.** Eight stations to fourteen, 71.2 m to 40.7 m.
  Measured from the spawn frame, eight put exactly one gate on screen and the
  next at screen x=-1356, off frame; fourteen puts two in frame. Shrinking the
  circuit was rejected on measurement, see the refusal below.
- **CLOSED, no audio assertions in tests/.** New check 14, `audio-bed`,
  drives the real page with a real key gesture. `npm run verify` is now 13
  of 14.
- **REFUSED with an argument, FOG_FAR to 600-900.** Shortening it raises the
  terrain's far edge, and the rebuilt ridge ladder pins that below about 0.22
  or ring 0 at 0.250 loses its separation from the ground in front of it.
  Ground haze now costs the mountain ladder. No threshold moved either way.
- **REFUSED with an argument, shrinking the circuit for gate spacing.** The
  tightest radius of curvature is already 11.16 m, 3.7 g at 20 m/s. Scaling
  it to give eight gates 40 m spacing means 4.7 m and 8.7 g, and the course
  stops being flyable. Fourteen gates on the same geometry instead.

**Also fixed as a side effect, and worth knowing about:** the gate number
plate was `DIGITS[index % 10]`, which painted gate 13 as a 3 and gate 10 as a
0. Raising the station count is what exposed it. It now renders as many
glyphs as the number needs.

**Two instrument defects of my own, both caught by measuring twice.** A
scratch clip counting script hardcoded a 4 byte PNG stride where these
captures are colour type 2 at three bytes, which shears each row across 1.33
rows of source and reported 7774 clipped px where the truth was 10393;
`decodePng` in `scripts/pixels.js` returns `channels` for exactly this reason,
so read it. And the music scheduler's step counter advances in lookahead
chunks, so a short window implies a wrong tempo: 23 steps in the first 1500 ms
reads as 230 BPM on a 174 BPM bed. Do not publish a tempo from that counter.

## Round 12 review findings still OWED.

Four reviewers ran on flight feel, graphics, scale and focus audio.
Everything below is a real, measured, unfixed defect with a file. The art
director's items are now recorded above, fixed or refused.

### The plant, from the pilot review. None of this is addressed.

- **CLOSED in round 15, the descent sign.** Thrust to weight at a fixed duty
  now FALLS with descent rate (0.468, 0.509, 0.474, 0.439, 0.403, 0.368, 0.332
  at 1.8 to 10.2 m/s) where it used to rise and plateau on the 1.35 clamp. A
  deterministic per motor share of the ring state loss means the four rotors no
  longer stall together. The original finding follows, for the record:
- **No propwash, and the descent aerodynamics have the WRONG SIGN.** Measured:
  hover, chop to idle, catch, and the peak body rate disturbance is 0.00 deg/s.
  Roll rate is 170.6 deg/s at every descent rate to a tenth. Worse, at hover
  duty the thrust/weight RISES from 1.063 still to 1.434 at 6.2 m/s of descent,
  so the model hands you **35 percent MORE thrust** exactly where vortex ring
  should cost you it. The `axial > 1.35` clamp at `plant.c:244` then deletes the
  aerodynamic rate damping in one step. Fix: a descent branch past
  `va/pitch_speed` about -0.3 rolling thrust off toward 0.75, with a
  deterministic per motor inflow asymmetry so the four stop cancelling.
- **Nothing disturbs the quad, ever.** Thirty seconds of hover: lateral drift
  0.00e0 m, peak body rate 0.00e0, motor spread 0.00e0. Bit exact zero. No
  wind, no gusts, no ground effect, and **zero gyro noise, which makes the
  entire D term filter chain decorative**: `gyro_lpf1_static_hz` and
  `dterm_lpf*` do nothing measurable, so the quad cannot be tuned because the
  thing tuning fights is not simulated. Fix: deterministic shaped noise into
  `s->omega` as read by the bridge only, seeded from `step_index`.
- **REFUSED in round 15 with a measurement, still open.** The 48 A ceiling
  works (409.8 A to 192.0 A, 1.54 to 2.95 V a cell) and takes check 8 from
  18 ms to 51 ms. See item 2 above. The original finding follows:
- **300 A and 13.5 V five milliseconds into a punch** on a full pack, from
  `plant.c:248` having no winding inductance and no ESC limit. 2.25 V per cell
  is a destroyed pack. Fix: a first order current lag at L/R about 200 us and a
  per motor ceiling near 45 to 50 A.
- **PARTLY CLOSED in round 15.** The mechanism is real now and the sign is
  right: -0.06 deg against 0.00. Still below the 2.0 deg floor, and the fix the
  finding proposes, an OUTWARD tilt, cannot work: a force along r has zero
  moment about z. The tilt that does work is tangential build tolerance. See
  PROGRESS.md round 15. The original finding follows:
- **yaw-coupling can never pass.** The QUADX roll and yaw mixer columns are
  orthogonal and each roll pair holds one CW and one CCW motor, so the yaw
  torque sum is exactly zero independent of any nonlinearity. Fix: tilt each
  motor's thrust axis outward 1 to 2 degrees, which is real arm splay and earns
  the check honestly. DO NOT lower the threshold.
- **A dropped Betaflight diff is 96 percent silently discarded.**
  `bf_config_apply_setting` maps 25 keys and everything else returns SIM_OK.
  Not honoured: `d_min_*`, `dterm_lpf*`, `gyro_lpf*`, `iterm_relax*`,
  `anti_gravity_gain`, `tpa_*`, `feedforward_*`, `thrust_linear`, `motor_idle`,
  `vbat_sag_compensation` and more. **Zero of the twelve master section
  settings in this repo's own `configs/freestyle.diff` are honoured.** That
  contradicts the project's premise. Fix: return `SIM_ERR_CONFIG_PARSE` for
  unmapped `set` keys so it fails loudly, then extend the table.
- `sim_bf_sag_cell_cv` is initialised to 420 and never updated
  (`bf_stubs.c:78`), so the modelled sag never reaches the flight controller.
- **Betaflight is told 250 Hz while sticks arrive at the frame rate.** Sampled
  once per frame and forward filled across the 4 ms grid, so rc smoothing is
  tuned for 250 Hz on a 60 Hz staircase: measured 3x the setpoint jerk at
  60 fps, 5x at 30. Fix: drive `RC_HZ` from the measured frame rate, or poll on
  a 250 Hz interval independent of requestAnimationFrame.
- **`scripts/flight-report.js` "forward flight" measures 6.7 backflips.** It
  holds pitch -0.55 for 12 s in ACRO, which is a rate command: 2399 degrees of
  integrated rotation, ending 87 m lower. Its "26.8 m/s" is a tumbling quad
  falling. This instrument has been feeding the review loop.
- Land thresholds to ARGUE, not silently change: 2.0 m/s is 30 to 50 percent
  too strict for mown grass, and 3.0 m/s HORIZONTAL makes a 0.19 m low pass at
  race speed an instant crash, which is not what the constant's name says.
- The sphere collider throws away 21 percent of every gate's vertical window:
  `CRAFT_R` 0.1885 is right for a tumbling quad and wrong for level flight,
  where the craft is 0.06 m tall. Fix: a tilt aware vertical half extent,
  `0.030 + 0.1885 sin(tilt)`, horizontal unchanged.

### Scale, from the scale review. Gate and craft verified EXACT; the dressing is not.

Verified PASS and not to be touched: all **12 openings across 8 obstacles are
exact to four decimals** (1.5240, 2.1336 by 1.8288, sills 1.5240 and 4.5720,
ladder pitch 1.5574). The ratio test passes at **0.002 percent**: gate 98.6493
px against craft 16.1482 px at equal depth, ratio 6.1090 against a predicted
6.1091. The 100 degree vertical field of view is 135.3 degrees diagonal, at the
NARROW end of real FPV, and it is exonerated: the 30 degree uptilt MAGNIFIES a
horizon height target by 1/cos30, measured 135.1 px tilted against 115.1 level.

Fixed this round: grass width 0.0985 m measured to 8 to 18 mm, grass height to
3 to 9 cm mown, wind tip travel 0.461 m to about a quarter of blade height,
flag poles 3.4 m by 0.106 m to 1.6 m by 0.018 m with the collider following,
and the parked craft now rests at 0.075 m instead of floating at 0.9 m.

STILL OWED:
- **Gate spacing is 71.2 m of line per gate and a gate stops being readable at
  about 40 m.** Measured lap 569.6 m, legs 54 to 85 m, against UTT 3's 7, 21
  and 28 m. The pilot flies the first 40 to 60 percent of every leg on the glow
  alone. Fix: `scene.js:172` curve coefficients 105 and 118 to about 62 and 70,
  or raise `gateCount` from 8 to 14 with matching `gateU` and `stationKinds`.
- **Grass ground cover is 14.5 percent at about 10 blades per square metre**
  against a real 10,000 to 30,000 shoots. Narrowing the blades made cover worse.
  Raising `BLADES` is the fix and it makes P2 and P10 worse and changes the rng
  stream, so it regenerates the world. Say so if you do it.
- Clouds are 100 to 170 m across at 190 to 380 m altitude, sitting AT and BELOW
  mountain summits of 100 to 310 m. Real cumulus is 0.5 to 2 km wide at 600 m
  plus.
- Mountain flanks average 56.9 degrees against a real 25 to 40.
- The corridor is mathematically flat: `__trackPoint(u).ground` is 0.000 at all
  24 sampled u. The height field's finest component has a 91 m wavelength and is
  zeroed within 30 m of the line, so there is no relief at any wavelength a
  pilot at 0.762 m can perceive. MultiGP asks for flat, not for a plane.
- Tree trunks are about 3x too thick for their height.
- **CLOSED in round 15.** `main.js` altitude reads the surface under the craft
  through the same query the collision test uses, on both maps. It was measuring
  from the SPAWN ground height, which is wrong by seven metres over the city's
  overbridge.

### Audio, from the mastering and composition review. Fixed and owed.

Fixed this round: the 16 bar loop, the bass phrase, the pad, the break raised
with slower attacks, stereo, the flight duck replacing the useless music duck,
the periodic wave motor voice with noise detune, the 600 rpm mute and 60 Hz
highpass, the linear loudness law, and the focus carrier moved to 1000 Hz.

STILL OWED:
- **`tests/` contains ZERO audio assertions.** `grep -riE "audio|music|dbfs|
  dbtp|scream|bpm|binaural"` over `tests/` returns nothing. Every audio number
  in this project is ungated: `npm run verify` would not notice the mix
  regressing to the 22 dB scream it started at.
- The metre is ambiguous: 173.74 BPM at r 0.3768 against a 2/3 tempo peak at
  115.61 BPM at r 0.3665, a gap of 0.010. The ghost kick and the hat accent on
  every beat exist partly to move the estimator, which is instrument driven
  composition and costs the two step its character.
- Re-measure the A2 three throttle sweep, the tempo, the seam at the NEW
  22.06897 s loop period, and the band split, all against the rebuilt graph.
  Only loudness, A1 and the cue advantage were re-measured after the rebuild.

## Round 11: the world is solid and the mix stopped screaming

Full evidence in `.loop/evidence/r11/ledger.md` and `ledger-numbers.md`. What a
next round has to know:

**Collisions are real and exact.** `src/game/collide.js`, one primitive (a
capsule), and the swept test is the closed form segment to segment distance, so
there is no sampling and no tunnelling at any frame rate. 1777 colliders. The
query allocates nothing. `window.__colliders()` reports counts by kind and the
grid statistics. Colliders are recorded WHERE THE GEOMETRY IS BUILT, because the
baker merges instances into anonymous buffers, and no new `rng()` draw may ever
be added inside the scenery loop.

**Landing is a shell state, not a physics clamp, and it cannot be otherwise.**
The ABI has no call that writes a position or a velocity. Thresholds: descent at
or below 2.0 m/s, horizontal at or below 3.0 m/s, tilt at or below 25 degrees.
Anything else is a crash, as is touching any collider. Verified in page at
1.2730 m/s (lands) and 13.9154 m/s (crashes). KNOWN LIMITATION: the frozen state
keeps its touchdown descent rate, so a takeoff dips before thrust wins.

**Every obstacle is at its published MultiGP dimension** and no dimension is
typed twice: `scene.js` imports `OBSTACLES` and `FRAME_TUBE_OD` from
`src/game/track.js`. The opening measures 1.524 by 1.524 m and a load time
assertion throws if any obstacle drifts more than 10 mm. Six types on the
course, including two ladders (the triple stacks) and a dive gate at a 4.572 m
sill. The course is an ORIGINAL CHAPTER STYLE LAYOUT from regulation obstacles,
T4's second branch, and it says so.

**P2 is now attributed, and the answer is not only the grass.** `__budget()`
reports `p2_top_meshes`. Measured at 1280 by 720:

    552,000 tris  ShaderMaterial   frustumCulled FALSE  bounds 634 m   grass
    109,972 tris  MeshBasicMaterial      culled true    bounds 672 m   mountains
    105,800 tris  MeshToonMaterial       culled true    bounds 1202 m  terrain
     27,760 / 24,800 / 23,120 / 21,920   culled true    bounds ~670 m  baked scenery
     11,360 tris  ShaderMaterial         culled true    bounds 1025 m  clouds

Top ten total about 889,000 of 1,915,103. Two things follow. The grass is the
single biggest item AND the only one with culling switched off, so it is the
first fix. But every other heavy mesh has a bounding sphere spanning most or
all of the 1700 m world, so `frustumCulled: true` on them buys nothing: the
frustum test always passes. Fixing P2 means SPATIAL CHUNKING of the grass and
of the baked scenery buckets, not just setting a flag. Chunk count trades
against P1, which now has only 79 draw calls of headroom.

**P1 PASSES for the first time: 321 draw calls against a 400 ceiling**, down
from 692, because obstacle materials are shared and their static parts bake.
Meshes 317 to 141. **P2 did not move and is the next item**: `grassField` sets
`frustumCulled = false` on one 900 m mesh, 552,000 triangles unconditionally,
and empty sky is still 99.8 percent of the worst view.

**The mix.** A1 margin +21.09 dB against a bar of +12, from -22.01 dB.
Centroid 1909 to 606 Hz. `RPM_TO_HZ_SCALE` is deleted; the fundamental IS the
blade pass frequency. A3 flight render -18.48 dBFS, true peak -5.84 dBTP, worst
case -1.39 dBTP with zero clipped samples. `MASTER_CEILING` is 0.85 and that is
load bearing: with the soft clip saturating, the true peak in dBTP equals the
master gain in dB, so a master of 1.0 measures +0.01 dBTP and a player on
volume ten clips. A5 tempo 173.73 BPM, r 0.3641 against a shuffled null p95 of
0.0241. A6 seam delta at the 5th percentile of the interior distribution. A4
carriers 220.000 and 226.000 Hz, 6.000 Hz apart, per channel AM 122 dB down and
the mono sum 123 dB above it. 52 audio nodes of 64.

**Two owed measurements, do these first:** the A2 three throttle sweep against
the new graph (the identity is in the code but the sweep was not re-run), and
the A7 cue level advantage in its own band now that the probe's analysis frame
is adaptive. Both are one probe run each.

**New probe flags:** `--motors=N --wind=N --musiclevel=N --music=0|1
--focus=0|1 --cue=kind@seconds --window=t0,t1`. A1 is measured with the bed
muted, because A1 is a property of the motor model and A8 requires the bed to
occupy other bands; the full mix figure is published beside it. A tempo whose r
is not well above `nullP95` means nothing was found.

**Sharp edge added this round:** the regulation gate exposed a scale error that
no number caught. Grass at 0.26 to 0.68 m is knee deep beside a 1.524 m
opening, and the gates vanished from the title frame while every ledger figure
stayed correct. Grass is 0.09 to 0.24 m now and the attract camera is 9 m out.
Any future change to obstacle size has to be checked against grass height,
camera framing and the lit aperture bar width together.

## What round 10 built, and why nothing else

Two rubric sections had no instrument at all, and an unmeasurable rubric
section is where fabricated numbers come from. Round 10 is instruments only.

**`scripts/audio-probe.js`** launches headless Chromium, imports
`src/render/audio.js` into `scripts/audio-probe.html` (a blank same origin
page), builds that exact graph on an `OfflineAudioContext`, drives it through
the real `update()` from a scripted RPM and airspeed trace, renders it, pulls
the samples back into Node in 1 MiB base64 chunks, and reports peak sample,
count of samples at or over full scale, RMS in dBFS, true peak in dBTP at
four times oversampling, one third octave bands, arbitrary band energies,
spectral centroid, per channel peak frequencies to sub bin precision,
amplitude modulation depth at a named frequency per channel and in the mono
sum, tempo by autocorrelation of spectral flux, and the sample delta at a
named loop seam against the distribution inside the loop.

    node scripts/audio-probe.js [--trace=NAME] [--seconds=20] [--rate=48000]
      [--level=0.6] [--blades=3] [--f0=HZ] [--scream=2000,8000]
      [--carrier=80,600] [--beat=6] [--seam=SEC] [--json=PATH]
    traces: hover, full, flight, idle, steady:RPM

`src/render/audio.js` grew the seam that makes that work: `attach(ctx)` builds
the graph on any `BaseAudioContext`, `update(rpm, speed, atTime)` takes the
time to schedule at, and every node is pushed onto a list so `nodeCount()` is
counted where the nodes are made. The live path is unchanged in behaviour.

**The aim sidecar.** `scripts/shots.js` writes `NAME.json` beside every
`NAME.png` recording which gate the race actually wants, its scene index and
number plate, its distance, its camera space depth, its screen position in
device pixels with `inFront` and `mirrored` flags, the pixel height its
aperture subtends or an explicit refusal, its sampled glow gain, and whether
the aperture centre is in frame. New
page handles in `main.js`: `window.__nextGate()`, `window.__quadScreen()`,
`window.__setRaceNext(raceIndex)` and `window.__audio`. `__boot()` now also
returns `worstAudioMs`.

## The cost ledger, measured, 1920 by 1080, round 10

Full table and the reproduction command in `.loop/evidence/r10/ledger.md`.

| # | budget | ceiling | measured | verdict |
|---|--------|---------|----------|---------|
| P1 | draw calls | 400 | **692** title worst azimuth, the reproducible worst view. 484 mid course fwd, 288 mid course, 236 start line, 156 empty sky | FAIL 1.73x |
| P2 | triangles | 1,200,000 | **1,916,379** title worst azimuth, **1,901,683 with nothing in frame** | FAIL 1.60x |
| P3 | full res passes | 4 | 3 | PASS |
| P4 | taps per pixel | 14 | 10 | PASS |
| P5 | render target bytes | 120 MB | 115.1 MB decimal, 109.8 MiB, default framebuffer included | PASS |
| P6 | first interactive frame | 1800 ms | 2500 to 5100 ms across runs of one build | FAIL |
| P7 | worst sync block | 50 ms | 16.8, 17.9, 23.8 and 38.3 ms over 152 to 174 frames | CANNOT VERIFY |
| P8 | allocations per frame | zero | round 9's list stands less one array literal | FAIL |
| P9 | shadow maps | 1 at 2048 | 1 at 2048 | PASS |
| P10 | attribute bytes | 48 MB | **51.2 MB** plus 7.4 MB of indices | FAIL 1.07x |
| P11 | settings ladder | 3 levels | nothing exists | FAIL |
| P12 | audio nodes | 64 | 28, context live at 44100 Hz | PASS |
| P13 | audio ms per frame | 2 ms | 0.20 to 0.80 ms over 150 to 175 frames, context live | PASS on the number |

At 1600 by 900 every parked view is identical to 1080p. Console clean at both,
errors 0, warnings 0, harness faults 0.

**Do not quote the title attract view.** Its camera orbits on the wall clock,
so it samples a different azimuth every run: 705, 700 and 701 draw calls
across three runs of one build, and a reviewer measured 701 independently.
`title worst azimuth` parks the camera and returns 692 and 1,916,379 for
everyone, every time.

**P2 has no triangle culling and the proof is one line.** Camera parked on
the racing line pointed at the zenith, nothing in frame: 1,901,683
triangles, 99.2 percent of the worst view. Repeat that test every round.

## The audio baseline, and the numbers behind the word screaming

Measured on the `full` trace, 20 s, 48 kHz, in
`.loop/evidence/r10/audio-full.json`:

- **A1 margin is -22.01 dB against a bar of +12** as the bar is worded, and
  **8.02 dB against 12 on equal bandwidth**. Publish both: the worded
  comparison puts a 92 Hz band against a 6000 Hz one, so 18 dB of the headline
  is bandwidth rather than loudness. The spectrum's peak is the 1259 Hz third
  octave band, which is exactly where `RPM_TO_HZ_SCALE = 2.9` puts the
  oscillator: 8589 / 60 x 3 x 2.9 = 1245 Hz. Spectral centroid 1909 Hz.
- **A2 fails by construction.** The tone is 2.9 times the blade pass
  frequency because a constant in the file says so. A2 wants the fundamental
  to BE the blade pass frequency within 1 percent at three throttle
  settings. Deleting the constant makes the quad sound an octave and a half
  too low, because the plant runs at about a third of a real 5 inch quad's
  RPM for reasons argued in PROGRESS.md. **The fix is a real motor model
  with harmonics of the true blade pass frequency, not a different
  constant**, and that is the next A item.
- **A3**, on the `flight` trace, which is the normal flight render A3 names,
  at the shell's own mix level of 0.6: no sample at or over full scale, true
  peak -13.21 dBTP which passes, RMS **-30.38 dBFS** which is 10.38 dB below
  the -20 to -14 band. The `full` trace gives -22.28 dBFS. Render at 0.6:
  `ui.js` defaults the volume to 6 and `main.js` divides by 10, and the probe
  spent a round at 0.5, which flattered every loudness figure by 1.58 dB.
- A4 to A8 and A11 all FAIL because none of it exists yet.

The probe is calibrated where it counts and its limits are written down.
Predicted carriers from the file's own constants were 1315.701 and 1305.000
Hz; measured 1315.701 and 1305.001 Hz on a 524288 point window at 0.0916 Hz
per bin. The band sum normalisation was checked against the time domain and a
reviewer independently confirmed it to 0.0000 dB on tones and 0.0025 dB on
noise.

**Eleven instrument defects were found by review and fixed in the same round.**
The list with the measurement behind each is in the Corrections section of
`.loop/evidence/r10/ledger.md`. Read it before trusting any figure the probe
prints, and read these three at least:

- True peak used to skip the first and last 16 samples, so a transient near a
  buffer edge could report a true peak BELOW the sample peak.
- The tempo function had no null hypothesis and scored a steady sine at
  r = 0.984. It now publishes a measured shuffled flux null, and a tempo below
  that floor means nothing was found. Do not quote a BPM without the null
  beside it.
- `aperturePx` had no validity gate and published 17,988 px for a gate behind
  the camera. It refuses now, and the sidecar carries depth, `inFront` and
  `mirrored`.

Still not fixed, and each will corrupt a claim if forgotten:
`peakFreq().db` is an unnormalised log magnitude published beside dBFS
figures. The probe asserts nothing and exits 0 whatever it measures, so it
belongs in `npm run verify` or `scripts/gates.js`. The sidecar is sampled at
least one frame after the PNG. `worstBlockMs` and `worstAudioMs` both time
only the animation frame callback, so building the 44,100 sample noise buffer
inside `attach()` from a `pointerdown` handler is invisible to P7 and P13.
Every band figure is a whole render average, so A7's "at the moment they play"
and A11's per stem differences are not yet measurable at all. And the RPM
trace is an analytic function in the probe, not a recording from `sim.wasm`,
so A2's second half cannot be answered until a recorder exists.

**A4's last clause is physically unsatisfiable and A9's is unsatisfiable in a
browser.** Both are recorded, A4 in `.loop/threshold-disputes.md` entry 5 with
the trigonometry and a measurement, A9 in `.loop/blocked.md` entry 7. Do not
try to build to either as written.

## The track. UTT 3 Bessel Run is buildable and the layout is recovered

This was expected to be blocked and it is not. `curl` downloads a MultiGP
guide PDF, and the layout page is a raster inside the PDF's own image
XObjects which this repository's PNG decoder can measure. Full derivation,
provenance, pixel measurements and the scale checked three independent ways
are in **`.loop/evidence/r10/utt3-layout.md`**. Summary:

UTT 3 Bessel Run needs "4 standard MultiGP gates and 1 standard MultiGP
start/finish timing gate", allows no flags, is traversed in the sequence 1 to
5, and fits in 100 by 40 yards. Origin at gate 3, x along the long axis,
z across the short axis:

    gate 1, timing      x =   0, z = -14, opening faces along x
    gate 2              x = +28, z =   0, opening faces along z
    gate 3              x =   0, z =   0, opening faces along z
    gate 4              x = -21, z =   0, opening faces along z
    gate 5              x = -28, z =   0, opening faces along z

The standard gate opening is **1.524 m square**. The current `gate()` builds
a clear span of 3.50 m, read out of the torus at runtime, which is 2.30 times
regulation. That single error is most of why the world has never read at the
right scale.

The direction arrows on the diagram are below the resolution of the extracted
raster. The sequence is stated in words and the topology is fixed by
MultiGP's own racing line render, which together determine the direction
through every gate up to one global choice of which way round the loop runs.
**Do not write a direction into the build as though it were read off an
arrow.** Say where it came from.

## The next round, in priority order

1. **The gate, rebuilt to regulation, and the track rebuilt as UTT 3.** This
   is one item, not two, because the gate rebuild is also the moment to bake
   the gates and kill most of P1. It changes T1, T2, T3, T4, T6, G3 and G6
   at once, and it is the single change that most changes what a player
   experiences. What it touches: `gate()` in `scene.js`, the gate placement
   loop, `GATE_HALF_W`, `GATE_H`, `RING_Y` and `RING_R` in
   `src/game/race.js` which currently restate the old geometry as constants,
   and the curve that `view.curve` builds. Hoist `frameMat`, `accent` and the
   pip material out of `gate()` before baking: they are created per gate and
   the pips use a fresh `MeshBasicMaterial` each, so the baker would bucket
   one per pip. Assert the aperture at runtime and publish the measured
   number, which is what `gate()`'s returned `aperture` is now for.
2. **P2, the triangle budget.** `grassField` sets `frustumCulled = false` on
   one mesh spanning 900 m: 552,000 triangles submitted unconditionally and
   again for the geometry prepass. `makeBaker().flush()` merges all static
   scenery into one mesh per material whose bounding spheres span the 1700 m
   world, so the frustum test is always true. Chunk both spatially with real
   bounding spheres.
3. **The motor model, for A1, A2, A7 and A8.** Harmonics of the true blade
   pass frequency, a stated blade count, and a spectrum whose energy sits
   where a quad's does rather than in the 1259 Hz band. Everything needed to
   prove it exists now.
4. **A5, the lofi drum and bass bed**, then A4 the binaural tone, then A7
   ducking and A11 the per stem levels. All measurable with the probe.
5. **P10**, 51.2 MB against 48. 25.8 MB is the grass, whose colour attribute
   is three 32 bit floats per vertex where a normalised byte triple would do.
6. **P8**, then **P6**, then **P11** which does not exist at all.
7. **G6 and T7 together**, which are one decided design and not a conflict:
   flat inside the course footprint, relief and occlusion outside it.
8. **G9**, the water, whose depth is literally distance from the disc centre.

## The instruments

    node scripts/shots.js --out=DIR --w=1920 --h=1080 STEP STEP ...
      steps: wait:MS shot:NAME tap:CODE down:CODE up:CODE click:X,Y
             move:X,Y eval:EXPR until:EXPR expect:EXPR

`until:` and `expect:` exist because a fixed wait is not evidence: a frame
takes about 120 ms here at 900p and about 520 ms at 1080p in flight, so
`tap:Enter wait:400` can capture the state the player was in BEFORE the key.
Every `shot:` now also writes `NAME.json` with the aim sidecar.

    node scripts/pixels.js FRAME.png name=x,y,w,h ...
    node scripts/pixels.js FRAME.png name=walk:x,y,dx,dy,n
    node scripts/pixels.js FRAME.png name=stair:x0,y0,w,rows,level

Use `stair:` for any claim about antialiasing. Walking ACROSS an edge cannot
tell a blur from a resolve, and that mistake has already been made once here.

    node scripts/audio-probe.js ...   see above

Page handles, all harness only, nothing in the shell reads them:
`__budget(name)`, `__boot()`, `__setCam(px,py,pz,tx,ty,tz)` and
`__setCam(null)`, `__trackPoint(u)`, `__nextGate()`, `__quadScreen()`,
`__setRaceNext(raceIndex)`, `__audio`, `__renderStats`, `__ui`, `__race`,
`__mode`, `__screen`.

**`__setCam` only takes effect on the NEXT animation frame.** A sweep that
sets the camera and reads `__budget` synchronously measures the same view
every time. Always await two animation frames.

**A capture run must click the page before it can measure P12 or P13.**
Browsers need a user gesture before audio starts, and `update()` returns
immediately on a null context, so without a click the instrument reports the
cost of an early return. Assert
`__audio.ctx.state === 'running'` before any audio claim.

The full ledger command block is at the top of
`.loop/evidence/r10/ledger.md`.

## Sharp edges

- Reviewer subagents have write access to the tree. One edited `src/main.js`
  while reviewing it, and one deleted and restored tracked files under
  `tmp/` in round 8. Run `git status` after every review round.
- **The old `mid course` capture view looks the wrong way down the course.**
  It aims along `+tangent`; the craft flies along `-tangent`. The target gate
  is 126.3 m behind that camera and off screen. It is kept in the ledger for
  comparability with rounds 6 to 9 only. Use `mid course forward` for
  anything about the target.
- `down:KeyW wait:900 up:KeyW` does not launch the craft at this container's
  frame rate. Only about two frames of key handling happen in 900 ms and W
  ramps the throttle while held. The `07-inflight` capture in
  `.loop/evidence/r10` is really the start line and is labelled as such in
  the ledger. Hold the key much longer, or drive the throttle through a
  handle.
- `__quadScreen()` is meaningless with the camera inside the airframe: the
  0.25 m span sits inside the 0.2 m near plane and returns NaN, which
  `JSON.stringify` turns into null. T6 needs a parked external camera with
  `visible: true`.
- A lit material on geometry with no normal attribute washes the whole world
  to flat cream with a completely clean console. Check for normals before
  putting a lit material on anything.
- The renderer runs with `NoToneMapping`, so no colour can exceed 1.0. Any
  plan that wants a real highlight either works below that ceiling or
  changes tone mapping deliberately, in its own round, with its own review.
- `grass.receiveShadow` is a no operation: the grass is a `ShaderMaterial`
  computing its own sun term, so three.js sets the flag and nothing reads it.
- `getShadowMask()` is in `shadowmask_pars_fragment`, not
  `shadowmap_pars_fragment`, and reads a bool named `receiveShadow` that the
  renderer only declares for its own materials.
- `celMaterial` has no `customProgramCacheKey` while doing per material
  string surgery in `onBeforeCompile`. Unproven hazard, still sitting there.
- `EffectComposer.setSize` takes CSS pixels and multiplies by the pixel ratio
  it captured at construction. A reviewer called this a HiDPI bug; it is not.
  Read the r160 source in the container's CDN cache before believing
  otherwise.
- The composer's read buffer is `renderTarget2`, not 1: `RenderPass` draws
  the scene there. `post.js` disables the depth buffer on the other one,
  guarded by counting the parity of the passes that swap.
- Bulk `str.replace` edits hit every occurrence. One replace of a vertex
  shader tail hit the water shader as well as the grass one.
- `src/game/race.js` restates the gate geometry as its own constants,
  `GATE_HALF_W`, `GATE_H`, `RING_Y`, `RING_R`. Change the gate without
  changing those and the scoring aperture silently stops matching the thing
  on screen.
- MultiGP artwork is deliberately not vendored. It is under an unstated
  licence and D5 forbids adding an external asset without a justification.
  The build needs the dimensions, and those are written down.

## Round 13's own leftovers, in priority order

1. **The lake, `water()` in scene.js.** Still the art director's number one
   and untouched. Foam and the shallow band come from mesh radius, not from
   the terrain and water intersection, and depth is distance from the disc
   centre rather than `LAKE.level - height(x,z)`. No sun term, no specular, no
   fresnel sky reflection. Trees and rocks are not skipped inside `LAKE.r`.
2. **Grass ground cover, 14.5 percent at about 10 blades per square metre.**
   Visible in every frame as sparse specks on flat green, and it is the
   loudest remaining art gap now the ridges read. COUPLED to P10: the grass is
   25.8 MB of the 51.7 MB attribute total against a 48 MB budget, because its
   colour attribute is three float32 where a normalised byte triple would do.
   Fix P10 first, then raise density, or density makes P10 worse.
3. **The stem balance question the audio table cannot answer.** Music alone at
   the default level measures -22.56 dBFS against the flight bed's -17.01, and
   the full mix with music in is bit identical to the mix without it at every
   aggregate the probe prints to four decimals. The music is measurable on its
   own and moves nothing in the mix. Whether that is correctly subordinate or
   simply too quiet is an ears judgement, not a table judgement. Make it.
4. **The prepass layer mask, `post.js` around line 486.** Sky, water and the
   gate ring, halo and glow are still outside the geometry prepass layer mask,
   so the skyline and the target receive neither ink nor coverage.
5. **No place-making furniture and no motion vocabulary.** Both still true:
   nothing in `src/` produces a particle, a blur or a shake.
6. Everything in the plant list below, which needs a WASM rebuild and is
   where yaw-coupling, the one red check, actually lives.
