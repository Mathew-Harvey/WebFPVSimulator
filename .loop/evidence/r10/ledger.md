# Round 10, the harness round. Cost ledger and audio baseline.

Nothing about the world, the mix or the track changed this round. Two whole
rubric sections, A and the G3 part of G, were unmeasurable, and an
unmeasurable rubric section is where fabricated numbers come from. This
round built the two instruments and published what they say about the build
as it stands.

## How to reproduce

Container setup first, both steps, or check 1 fails for want of a compiler:

    git submodule update --init --depth 1 vendor/betaflight
    git clone --depth 1 https://github.com/emscripten-core/emsdk /opt/emsdk
    cd /opt/emsdk && ./emsdk install 3.1.61 && ./emsdk activate 3.1.61
    source /opt/emsdk/emsdk_env.sh

The ledger and capture run, at both resolutions:

    RAF='const raf=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));'
    node scripts/shots.js --out=DIR --w=1920 --h=1080 \
      until:window.__shellReady "expect:window.__mode==='title'" click:200,200 \
      "until:window.__audio&&window.__audio.ctx&&window.__audio.ctx.state==='running'" wait:1500 \
      shot:01-title "eval:JSON.stringify(window.__budget('title attract'))" \
      "eval:(async()=>{${RAF}const g=window.__trackPoint(0);const a=Math.PI/3;window.__setCam(g.x+Math.sin(a)*19,g.ground+7,g.z+Math.cos(a)*19,g.x,g.ground+2.5,g.z);await raf();return 1;})()" \
      wait:600 shot:02-title-worst "eval:JSON.stringify(window.__budget('title worst azimuth'))" \
      "eval:window.__setCam(null)" wait:400 \
      tap:Enter "until:window.__mode==='flight'" wait:1500 \
      shot:03-startline "eval:JSON.stringify(window.__budget('start line'))" \
      "eval:(async()=>{${RAF}const p=window.__trackPoint(0.30);window.__setCam(p.x,p.ground+3,p.z,p.x+p.tx*60,p.ground+5,p.z+p.tz*60);await raf();return 1;})()" \
      wait:900 shot:04-midcourse "eval:JSON.stringify(window.__budget('mid course'))" \
      "eval:JSON.stringify(window.__setRaceNext(6))" \
      "eval:(async()=>{${RAF}const p=window.__trackPoint(0.30);window.__setCam(p.x,p.ground+3,p.z,p.x-p.tx*60,p.ground+5,p.z-p.tz*60);await raf();return 1;})()" \
      wait:900 shot:05-midcourse-forward "eval:JSON.stringify(window.__budget('mid course forward'))" \
      "eval:(async()=>{${RAF}const p=window.__trackPoint(0.30);window.__setCam(p.x,p.ground+3,p.z,p.x,p.ground+600,p.z+1);await raf();return 1;})()" \
      wait:900 shot:06-empty-sky "eval:JSON.stringify(window.__budget('empty sky'))" \
      "eval:window.__setCam(null)" wait:400 \
      tap:KeyR down:KeyW wait:900 up:KeyW wait:2500 \
      shot:07-inflight "eval:JSON.stringify(window.__budget('in flight'))" \
      "eval:JSON.stringify(window.__quadScreen())" wait:80000 \
      "eval:JSON.stringify(window.__boot())" \
      "eval:JSON.stringify({audioNodes:window.__audio.nodeCount(),audioState:window.__audio.ctx.state,sampleRate:window.__audio.ctx.sampleRate})"

The audio probe:

    node scripts/audio-probe.js --trace=full --seconds=20 --json=.loop/evidence/r10/audio-full.json
    node scripts/audio-probe.js --trace=steady:9000 --seconds=12 --carrier=1000,1800 \
      --beat=8.48 --json=.loop/evidence/r10/audio-steady9000.json

Frames in `.loop/evidence/r10/1080p` and `.loop/evidence/r10/900p`. Every
PNG now has a `.json` beside it recording which gate the race actually
wanted, where it was on screen, and how many pixels its aperture subtended.

## The cost ledger, 1920 by 1080, devicePixelRatio 1

Six views. Every number is `window.__budget(name)` on one real frame in the
real page, with two animation frames allowed to pass after each camera move.

| # | budget | ceiling | title attract | title worst az | start line | mid course | mid course fwd | empty sky | verdict |
|---|--------|---------|---------------|----------------|------------|------------|----------------|-----------|---------|
| P1 | draw calls | 400 | **705** | 691 | 236 | 288 | 484 | 156 | FAIL, 1.76x in the worst view |
| P2 | triangles | 1,200,000 | **1,916,515** | 1,916,363 | 1,904,447 | 1,905,119 | 1,910,349 | 1,901,683 | FAIL, 1.60x in every view |
| P3 | full res passes | 4 | 3 | 3 | 3 | 3 | 3 | 3 | PASS |
| P4 | taps per pixel | 14 | 10 | 10 | 10 | 10 | 10 | 10 | PASS |
| P5 | target bytes | 120 MB | 115.1 MB | same | same | same | same | same | PASS |
| P9 | shadow maps | 1 at 2048 | 1 at 2048 | same | same | same | same | same | PASS |
| P10 | attribute bytes | 48 MB | **51.2 MB** | same | same | same | same | same | FAIL, 1.07x |

P5 is 115.1 MB decimal, 109.8 MiB, and includes the default framebuffer at
8,294,400 bytes. Quote the decimal figure.

Run scoped budgets, same run:

| # | budget | ceiling | measured | verdict |
|---|--------|---------|----------|---------|
| P6 | first interactive frame | 1800 ms | **3337 ms** at 1080p, 2677 ms at 900p | FAIL, 1.85x |
| P7 | worst sync block | 50 ms | 16.8 ms over 152 frames at 1080p, 23.8 ms over 173 at 900p, and **53.6 ms** over 50 frames in an earlier run of the same build | CANNOT VERIFY |
| P8 | allocations per frame | zero | one array literal removed this round; the rest of the round 9 finding stands | FAIL |
| P11 | settings ladder | 3 levels | nothing exists | FAIL |
| P12 | audio nodes, steady state | 64 | **28**, context running at 44100 Hz | PASS |
| P13 | audio scheduling per frame | 2 ms, zero allocation | **0.40 ms** worst at 1080p, 0.20 ms at 900p, over 152 and 173 frames, with the context live | PASS on the number, sample size noted |

P6 improved from round 9's 5122 ms without anything being done to it, which
is a warning about the figure rather than good news: it is a wall clock
measurement on a software rasteriser in a shared container. It is still
1.85x over.

P7 remains CANNOT VERIFY and the reason is now stronger than it was. The
same build on the same container measured 53.6 ms over 50 frames and 16.8 ms
over 152 frames, a factor of 3.2 apart. Neither is a worst case statistic.
The rubric asks for at least 600 frames, and 600 frames of flight at this
container's 1.9 frames per second at 1080p is five minutes of wall clock per
run. A human on real hardware settles this in ten seconds.

P13's 0.40 ms is a real measurement of the live path, not of a null context:
the run clicks the page to satisfy the browser's gesture requirement and
then asserts `__audio.ctx.state === 'running'` before any capture. The
earlier version of this run measured the same 0.40 ms with the context null,
which would have been a fabricated pass.

## At 1600 by 900

P1 703 title attract, 692 title worst azimuth, 236 start line, 288 mid
course, 484 mid course forward, 156 empty sky. P2 1,916,483 title attract,
identical to 1080p everywhere else. P3, P4, P9, P10, P12 identical. P5 was
not re-derived this round. P6 2677 ms. Console clean at both resolutions,
errors 0 warnings 0.

## The culling test, repeated, and it still fails

Camera parked on the racing line at u = 0.30 pointed at the zenith, 600 m
above the track, so the frame is empty sky:

    empty sky: 156 draw calls, 1,901,683 triangles

That is **99.2 percent** of the worst view's triangle count with nothing in
frame. The build has no working triangle level culling. Draw calls do move
with the camera, 156 against 705, so object level frustum culling is
partially working; the triangles are in a handful of unculled meshes.

## The G3 harness gap, closed, and it was real

The round 9 handover suspected the mid course capture was measuring the
wrong object. It was, and the sidecar proves it:

    04-midcourse: target race gate 0 (scene 0, plate 0) at 126.3 m,
                  screen 671,553 OFF SCREEN, aperture 14.9 px

The camera in that view looks along `+tangent`, which is the direction the
course runs in parameter space and the **opposite** of the direction the
craft flies, so the target gate was 126 m behind the camera and off screen.
Every G3 measurement taken in that view measured whichever ring happened to
be lit by the glow ladder, which was not the target. G3 stays FAIL, now for
a stated reason rather than an unsettled one.

The new `mid course forward` view looks the way the pilot flies and calls
`__setRaceNext(6)` first, so the race's next gate is scene gate 2 at
u = 0.222, which is genuinely the next gate ahead of a craft at u = 0.30:

    05-midcourse-forward: target race gate 6 (scene 2, plate 6) at 44.4 m,
                          screen 1000,560 on screen, aperture 35.9 px,
                          glow 0.99

## Projection instrument, cross checked

The aperture pixel figures are worth trusting only if the projection is
right, so it is checked against the geometry by hand. Gate aperture clear
span is 3.5 m, read out of the torus at runtime as 2 x (1.9 - 0.15). Camera
vertical field of view is 100 degrees at 1080 px:

    1080 * (3.5 / 44.4) / (2 * tan(50 deg)) = 35.7 px

Measured: 35.9 px. The instrument and the geometry agree.

## The 07-inflight view is mislabelled and here is why

`down:KeyW wait:900 up:KeyW` raises the throttle while the key is held, and
at 1.9 frames per second only about two frames of key handling happen in
900 ms, so the throttle never left the bottom and the craft never launched.
The frame is the start line view again: 236 calls, 1,904,447 triangles,
target at 7.1 m, identical to `03-startline`. It is kept in the evidence
because deleting a capture that did not do what its name says is how a
capture set starts lying. Do not quote it as a flight measurement.

`__quadScreen()` in that state returns `span250mmPx: null` and a 1541 px
box, both correct and both useless: the camera is inside the airframe at
0 m, in front of the 0.2 m near plane. T6 has to be measured from a parked
external camera with `visible: true`. What the handle does report honestly
is the model's world bounding box, **0.309 by 0.110 by 0.308 m**, which is
the first measured figure this project has for how big the quad actually is.

## The audio baseline, and it is worse than "loud screaming" suggested

Rendered through `OfflineAudioContext` at 48 kHz, stereo, from the real
graph in `src/render/audio.js`, driven through the real `update()` by a
scripted RPM and airspeed trace.

### A1, the scream test, trace `full`, 20 seconds

    mean commanded RPM 8589, blade pass 429.5 Hz at 3 blades
    fundamental band, 355 to 447 Hz:   -52.76 dB
    scream band, 2000 to 8000 Hz:      -30.75 dB
    A1 margin:                         -22.01 dB     needs at least +12

**34.0 dB the wrong way.** The energy is not near the blade pass frequency
at all. The one third octave table puts the peak at the 1259 Hz band,
-24.99 dB, with a second peak at 3981 Hz, -33.01 dB, and the 429.5 Hz band
28 dB below the 1259 Hz band. Spectral centroid 1909 Hz.

That 1259 Hz peak is exactly where the code puts it. `RPM_TO_HZ_SCALE` is
2.9, so the oscillator sits at 8589 / 60 x 3 x 2.9 = 1245 Hz, in the 1259 Hz
third octave band. A2 asks for the fundamental to BE the blade pass
frequency. It is 2.9 times it, by construction, and the constant is
documented in the file as a deliberate register correction. A2 FAIL, and the
fix is a real motor model, not a smaller constant.

### A3, loudness and headroom, trace `full`

    peak sample                 0.2569
    samples at or over 0 dBFS    0
    RMS                        -23.86 dBFS    band is -20 to -14
    true peak                  -11.80 dBTP    needs below -1

No clipping, and 3.9 dB too quiet on RMS. FAIL on the loudness band, PASS on
clipping and true peak. Publishing all three because A3 is three claims.

### A5, the bed, and A6, the seam

There is no bed. Tempo autocorrelation over the `full` render returns its
strongest peak at 127.84 BPM with r = 0.5814, which is the trace's own
periodicity and the noise bed's envelope, not music. A5 FAIL, A6 not
applicable yet and recorded as FAIL rather than not applicable, because the
Prime Directive forbids the second word.

### A4, binaural, and A7, A8, A11

No focus tone, no ducking, no per stem levels. FAIL, FAIL, FAIL, FAIL. The
instrument to prove them exists now and is calibrated: see below.

### The probe's own calibration

An instrument that lies is worse than no instrument, so the probe is checked
against a signal whose frequencies are predictable from the constants in the
file. Trace `steady:9000`, 12 s. The four motors run at the commanded RPM
times `MOTOR_SPREAD` = [1.0, 0.9935, 1.0082, 0.9971], and the panner puts
motors 2 and 3 left, 0 and 1 right.

    predicted, motor 2, left:  9000 / 60 x 3 x 2.9 x 1.0082 = 1315.701 Hz
    measured, left channel:                                   1315.701 Hz
    predicted, motor 0, right: 9000 / 60 x 3 x 2.9 x 1.0     = 1305.000 Hz
    measured, right channel:                                  1305.001 Hz

Peak frequency estimation is accurate to 1 mHz on a known signal with a
524288 point window, 0.0916 Hz per bin. A4 asks for 0.2 Hz. The instrument
has 200 times the precision the bar needs.

The amplitude modulation detector was checked on the same render. Motors 0
and 1 beat at 1305.0 - 1296.5 = 8.48 Hz, and both are panned right, so the
beat must be present in the mono sum:

    AM at 8.48 Hz: left -21.23 dB, right -8.45 dB, mono sum -13.56 dB

It is, and it is 12.8 dB stronger in the channel that carries both beating
motors than in the other one. That is the discrimination A4 needs: a
monaural beat shows in the mono sum, a binaural one does not.

The spectrum normalisation was checked against the time domain. Summing the
one third octave band powers of the `full` render gives -23.9 dB; the direct
time domain RMS is -23.86 dBFS. The band sums and the RMS are the same
quantity in the same unit, so a band figure can be compared to a loudness
figure without a hidden factor.

## D items this round

- D1: `npm run verify` 12 of 13, table pasted in PROGRESS.md, run in the
  same turn. yaw-coupling is the known red and its threshold is untouched.
- D2: `git diff --stat vendor/betaflight` empty, and check 1 asserts it.
- D3: errors 0, warnings 0, at 1920x1080 and 1600x900.
- D4: nothing added to the physics path. The audio changes are additive
  arguments and a node list; `update()` still only reads values already
  exposed.
- D5: no new dependency and no external asset. The MultiGP diagrams read
  this round are deliberately NOT vendored, see utt3-layout.md.
- D7: `git diff HEAD -- tests/` empty.
- D8: every number above came out of a run in this round.
