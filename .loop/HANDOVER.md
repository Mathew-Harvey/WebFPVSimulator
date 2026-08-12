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
