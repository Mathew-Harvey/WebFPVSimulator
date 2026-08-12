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

Branch: `claude/webfpv-world-sound-track-kdx9vo`, cut from `main`. `main` has
NOT been fast forwarded; the rubric is not green.

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
      [--level=0.5] [--blades=3] [--f0=HZ] [--scream=2000,8000]
      [--carrier=80,600] [--beat=6] [--seam=SEC] [--json=PATH]
    traces: hover, full, flight, idle, steady:RPM

`src/render/audio.js` grew the seam that makes that work: `attach(ctx)` builds
the graph on any `BaseAudioContext`, `update(rpm, speed, atTime)` takes the
time to schedule at, and every node is pushed onto a list so `nodeCount()` is
counted where the nodes are made. The live path is unchanged in behaviour.

**The aim sidecar.** `scripts/shots.js` writes `NAME.json` beside every
`NAME.png` recording which gate the race actually wants, its scene index and
number plate, its distance, its screen position in CSS pixels, the pixel
height its aperture subtends, its glow gain, and whether it is on screen. New
page handles in `main.js`: `window.__nextGate()`, `window.__quadScreen()`,
`window.__setRaceNext(raceIndex)` and `window.__audio`. `__boot()` now also
returns `worstAudioMs`.

## The cost ledger, measured, 1920 by 1080, round 10

Full table and the reproduction command in `.loop/evidence/r10/ledger.md`.

| # | budget | ceiling | measured | verdict |
|---|--------|---------|----------|---------|
| P1 | draw calls | 400 | **705** title attract, 691 title worst az, 484 mid course fwd, 288 mid course, 236 start line, 156 empty sky | FAIL 1.76x |
| P2 | triangles | 1,200,000 | **1,916,515** worst, **1,901,683 with nothing in frame** | FAIL 1.60x |
| P3 | full res passes | 4 | 3 | PASS |
| P4 | taps per pixel | 14 | 10 | PASS |
| P5 | render target bytes | 120 MB | 115.1 MB decimal, 109.8 MiB, default framebuffer included | PASS |
| P6 | first interactive frame | 1800 ms | **3337 ms** at 1080p, 2677 at 900p | FAIL 1.85x |
| P7 | worst sync block | 50 ms | 16.8 over 152 frames, 53.6 over 50 in another run | CANNOT VERIFY |
| P8 | allocations per frame | zero | round 9's list stands less one array literal | FAIL |
| P9 | shadow maps | 1 at 2048 | 1 at 2048 | PASS |
| P10 | attribute bytes | 48 MB | **51.2 MB** plus 7.4 MB of indices | FAIL 1.07x |
| P11 | settings ladder | 3 levels | nothing exists | FAIL |
| P12 | audio nodes | 64 | 28, context live at 44100 Hz | PASS |
| P13 | audio ms per frame | 2 ms | 0.40 ms over 152 frames, context live | PASS |

At 1600 by 900: P1 703 title attract, P2 1,916,483, P6 2677 ms, everything
else identical. Console clean at both, errors 0 warnings 0.

**P2 has no triangle culling and the proof is one line.** Camera parked on
the racing line pointed at the zenith, nothing in frame: 1,901,683
triangles, 99.2 percent of the worst view. Repeat that test every round.

## The audio baseline, and the numbers behind the word screaming

Measured on the `full` trace, 20 s, 48 kHz, in
`.loop/evidence/r10/audio-full.json`:

- **A1 margin is -22.01 dB against a bar of +12**, so 34.0 dB the wrong way.
  Scream band 2000 to 8000 Hz at -30.75 dB, blade pass band 355 to 447 Hz at
  -52.76 dB. The spectrum's peak is the 1259 Hz third octave band at
  -24.99 dB, which is exactly where `RPM_TO_HZ_SCALE = 2.9` puts the
  oscillator: 8589 / 60 x 3 x 2.9 = 1245 Hz. Spectral centroid 1909 Hz.
- **A2 fails by construction.** The tone is 2.9 times the blade pass
  frequency because a constant in the file says so. A2 wants the fundamental
  to BE the blade pass frequency within 1 percent at three throttle
  settings. Deleting the constant makes the quad sound an octave and a half
  too low, because the plant runs at about a third of a real 5 inch quad's
  RPM for reasons argued in PROGRESS.md. **The fix is a real motor model
  with harmonics of the true blade pass frequency, not a different
  constant**, and that is the next A item.
- **A3**: no sample at or over full scale, true peak -11.80 dBTP which
  passes, RMS -23.86 dBFS which is 3.9 dB below the -20 to -14 band.
- A4 to A8 and A11 all FAIL because none of it exists yet.

The probe is calibrated. Predicted carriers from the file's own constants
were 1315.701 and 1305.000 Hz; measured 1315.701 and 1305.001 Hz on a
524288 point window at 0.0916 Hz per bin. A4 needs 0.2 Hz. The band sum
normalisation was checked against the time domain: bands total -23.9 dB,
direct RMS -23.86 dBFS, same quantity in the same unit.

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
