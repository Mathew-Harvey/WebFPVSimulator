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

---

# Corrections after adversarial review

Two hostile reviewers, a mastering engineer judging the mix from the rendered
spectra and a QA tester paid per defect judging the instruments, were given
the artefacts above and the file paths, told not to edit anything, and told
their default verdict was REJECT. Neither was given any description of what
was built. Both returned REJECT. `git status` after both runs shows no tracked
file modified by either.

Their verdicts are binding, and they found two numbers in the ledger above
that no artefact backs. Both are D8 breaches. Everything struck here stays
visible rather than being quietly edited, because a corrections list a reader
can check is worth more than a clean file they cannot.

## Struck: `glow 0.99` for the mid course forward view

The line above reporting the target gate's glow gain as 0.99 came from the
terminal output of the FIRST 1080p run of the round, which was discarded and
re-run once the audio wake step was added, and the committed sidecar comes
from the second run. The sidecar says 1.0657 at 1080p and 1.2196 at 900p. The
number was stale, from a superseded run, and there was no reason to quote a
per frame sample of a quantity that pulses on the wall clock as though it
were a property of the gate.

Fixed at the source as well as in the text: the handle now names the field
`glowGainSampled`, because that is what it is.

## Struck: `53.6 ms over 50 frames`

Real when it was measured, and measured in that same discarded first run, so
there is no log, no sidecar and no JSON behind it anywhere in this evidence
directory. A number a reader cannot check is not evidence, whatever its
provenance. It is withdrawn.

P7's verdict does not depend on it and does not change. The reproducible
spread is in the two runs that DO have artefacts, 16.8 ms over 152 frames at
1080p and 23.8 ms over 173 at 900p, and in the reviewer's independent reruns
of the same command on the same build. P7 stays CANNOT VERIFY.

## Corrected: P13 is a range, not a figure

The reviewer's reruns of the published command measured 0.20 ms at 1080p and
0.80 ms at 900p against this round's 0.40 and 0.20, a factor of 4 spread on
one build. The ceiling is 2 ms and every sample is inside it, so P13's verdict
stands, but it is a range over samples of 150 to 175 frames and is written
that way now.

The reviewer also found that P13 and P7 both time only the requestAnimationFrame
callback, so the one genuinely expensive piece of audio work in a session,
building a 44,100 sample noise buffer inside `attach()` from a `pointerdown`
handler, is invisible to both. That is a real gap in both instruments and it
is recorded in the handover as the next thing to instrument, not fixed here.

## Corrected: the quad's bounding box is a per frame sample

`0.309 by 0.110 by 0.308 m` was quoted as a fact. It is an axis aligned box
over a group containing four spinning prop discs, so it breathes with prop
angle: the reviewer measured 0.2819, 0.3088 and 0.3199 m across the sidecars
of this one round, a 13 percent spread. It is also not the motor to motor
diagonal that a 250 mm class quad is named for, so it must not be read as
"the quad is 309 mm". The field is now `worldSizeSampled` and carries a note
saying so, and T6 still has no instrument.

## Corrected: P5 at 900p

The text said P5 was not re-derived at 1600 by 900. It was: the 900p run
prints `p5_target_MB_at_1080p: 115.1` on every view, which is the same figure
by the same derivation.

## Corrected: A3 was published from the wrong trace at the wrong level

Two errors compounding in the flattering direction, both found and both
larger than the original claim.

A3 names "a normal flight render". The figure above came from the `full`
trace, a full throttle pass, which is the trace A1 names and not this one.

And the probe defaulted to `--level=0.5` while the shell runs at 0.6:
`ui.js` defaults the volume setting to 6 and `main.js` divides it by 10.
Every published loudness figure was therefore 1.58 dB below what a player
hears. The probe's default is now 0.6 and cites where that comes from.

Re-measured at the shell's own level, all four figures, both traces:

| trace | RMS dBFS | true peak dBTP | peak sample | at or over full scale |
|---|---|---|---|---|
| flight, which is what A3 names | **-30.38** | -13.21 | 0.2177 | 0 |
| full, which is what A1 names | -22.28 | -10.22 | 0.3083 | 0 |

A3's band is -20 to -14 dBFS. On the render A3 names the mix is **10.38 dB
too quiet**, not the 3.9 dB the text above claimed. No weighting is stated by
the bar, so none is applied, and that is worth a human's attention because
"-20 to -14 dBFS" is only fully meaningful with one.

## Corrected: A1's margin, with the bandwidth asymmetry published beside it

A1 as worded compares the band containing the blade pass fundamental, 92 Hz
wide, against 2 kHz to 8 kHz, 6000 Hz wide. That is the comparison the bar
asks for and the probe makes it: **-22.01 dB**, unchanged, and level
independent. But 18 dB of that margin is bandwidth rather than loudness, so
the headline "34.0 dB the wrong way" overstates what a listener hears.

The probe now also publishes the same comparison on equal bandwidth, loudest
third octave overall against loudest third octave inside the scream band:

    full trace:   -23.41 dB minus -31.43 dB  =  8.02 dB
    flight trace: -36.13 dB minus -43.31 dB  =  7.18 dB

Both are short of 12 and A1 remains FAIL. The reviewer computed 8.02 dB
independently from the original evidence file and the probe now agrees to two
decimal places, which is a cross check on the new code as well as on the
claim. The honest statement is: the mix fails A1 by 4.0 dB on equal
bandwidth, and by 34.0 dB as the bar is worded.

## Retracted as false: the binaural discriminator

The round 10 text above says "a monaural beat shows in the mono sum, a
binaural one does not". **That is wrong.** Two carriers a few Hz apart summed
to mono ARE an amplitude modulation at their difference frequency; that is
what a beat is. A reviewer proved it on a synthesised 200 Hz and 206 Hz pair:
each channel alone reads -63.7 dB at 6 Hz, correctly absent, and the mono sum
reads -3.63 dB at a depth of 0.659.

An implementer building to that sentence would have built something that is
not a binaural tone. The derivation, the measurement and what the correct
discriminator is are in `.loop/threshold-disputes.md` entry 5, and A4 is
recorded there as BLOCKED WITH ARGUMENT because the rubric's own last clause
carries the same error. No other part of A4 is affected.

## A9 fails, and it is not fixable here

Two `OfflineAudioContext` renders of the identical graph inside one page
differ in 293,580 of 576,000 samples by one float32 ULP. Recorded in
`.loop/blocked.md` entry 7. The probe now prints a truncated SHA-256 of every
rendered channel so this is visible in every report; nobody noticed it for a
whole round because there was no digest and every published figure was a
reduction printed to fifteen digits.

## Instrument defects found and fixed this round

All of these were live in the numbers published above.

- **True peak skipped the first and last 16 samples.** A 0.99 sample at index
  5 of a 4096 sample buffer reported -19.740 dBTP against a -0.087 dBFS
  sample peak: a 19.65 dB under-report, and a true peak below the sample
  peak, which is impossible. The r10 renders happened to be unaffected
  because the master gain ramps up from silence. The first crash or drum
  transient near a boundary would have inverted the headroom claim silently.
  The filter now treats the signal as zero outside its own extent.
- **The one third octave table double counted 13 bins** and dropped every bin
  above 22387 Hz, under-reading white noise by 0.30 dB. It cancelled on the
  motor only render, which is the signal the normalisation was validated on.
  Bands are half open now, the top band runs to Nyquist, and every band
  publishes its bin count so a band narrower than the analysis resolution
  cannot be quoted as measured. At 8192 points the 20 Hz band is empty and
  the 25 and 40 Hz bands are one bin wide, which matters for a sub bass line.
- **The tempo function had no null hypothesis.** It returned 137.20 BPM at
  r = 0.823 on white noise and 187.50 BPM at r = 0.984 on a single steady
  sine, while a real synthetic 173 BPM breakbeat scored only r = 0.349,
  behind its own half tempo. It also could not distinguish a true 177 BPM
  from 175.78, which is inside A5's window: at hop 256 the only reachable BPM
  values between 170 and 176 were 170.455, 173.077 and 175.781, so a track
  that fails A5 would have passed it. The hop is 128 now, the peak lag is
  parabolically refined so the reported BPM is continuous, the flux is band
  limited to 60 Hz to 10 kHz so the motors cannot drive the estimate, and a
  shuffled flux null distribution is measured and published: 24 trials, fixed
  seed, 95th percentile. On the `full` trace the null floor is r = 0.0385 and
  the top peak is r = 0.5640 at 128.16 BPM, which is the 1 second noise loop
  and its harmonics, not music. No tempo from the old function is quotable.
- **The amplitude modulation detector was a knife edge with no floor.** With
  50 percent true modulation at 6.00 Hz it read -6.11 dB at 6.00 Hz, -12.07
  at 6.05 and -24.15 at 6.20, because the bin was 0.083 Hz wide with no
  window, and the round 10 evidence probed a hand calculated 8.48 Hz. It is
  now Hann windowed, scanned over plus and minus 0.5 Hz, and every result
  carries a floor measured on the same envelope at an unrelated frequency.
  Re-measured on `steady:9000`: left -20.85 dB against a floor of -57.57,
  right -8.33 against -60.58, mono sum -13.37 against -56.79. The left
  channel is 36.7 dB above its own floor, so "absent" was never the right
  word for it.
- **`aperturePx` had no validity gate.** It published 17988.1 px at 1080p and
  14990.1 at 900p for gates 0.45 m BEHIND a zenith pointing camera, and the
  run log printed both. A gate 126 m behind read 14.900 px against 14.910 for
  the same gate in front, because the sign flip cancels under an absolute
  value. It returns null now unless both projected points are in front of the
  camera, and it says in the sidecar that it is a vertical chord and not the
  width of a yawed gate.
- **Screen positions behind the camera were mirrored and published as
  positions.** `project` divides by a negative w behind the camera, so the
  old mid course sidecar reported `671, 553`, comfortably inside the frame,
  for a gate 126 m behind it, and the ledger printed that pair. The sidecar
  now carries `inFront` and `mirrored` beside every screen coordinate.
- **`onScreen` was a single point test with no clipping and no occlusion,**
  and the reviewer produced a capture where it returns false while the target
  gate's ring fills the left third of the frame. It is renamed
  `centreInFrame`, which is what it measures, and the sidecar says in words
  that it cannot settle G3 on its own.
- **`span250mmPx` emitted `Infinity`,** which `JSON.stringify` launders into
  `null` so a reader cannot tell it from "not applicable", and `boxPx`
  bracketed a reflection because four of the eight box corners were behind
  the near plane. Both are refused now, with the reason in the payload, when
  the camera is inside the near plane.
- **Camera space depth was missing.** A projected size scales with depth, not
  with Euclidean distance, and at 55 degrees off axis the two differ enough
  to overstate a size by 74 percent. The cross check above divided by 44.4 m
  where the depth is 44.20 m and landed at 35.7 against 35.9 by luck. Both
  are published now: with depth it is 35.88 against 35.90.
- **`__setRaceNext` left the race inconsistent.** It set `race.next` and
  nothing else, so `lapStartMs` stayed null, no lap clock could start, and
  `race.update` would treat a gate frame tap as a lap to void and flash
  "Gate touched, lap void" across a capture. It resets the race now and
  returns the previous value so a run can restore it.
- **Both harness scripts pasted an absolute output path onto the repository
  root,** which is how four scratch screenshots from an earlier session and a
  bisect frame came to be committed under `tmp/`. Fixed with `isAbsolute`,
  and the five stray files are deleted in this round's commit.
- **Sidecar failures were counted in the same total as console errors,** so
  `errors 0` was two gates wearing one number. They are counted and printed
  separately now, and both still fail the run.
- **The probe asserted nothing and exited 0 whatever it measured.** Still
  true, and recorded in the handover: it belongs in `npm run verify` or in
  `scripts/gates.js` so that a rubric comparison is not a human reading a
  JSON file, which is the fabrication surface this round exists to close.

## Reviewer findings accepted and NOT fixed this round, with reasons

- **The gate opening is 2.30 times the MultiGP standard**, and three parts of
  the codebase disagree about it: `scene.js` builds a 3.500 m clear span,
  `race.js` scores on an effective 3.30 m computed from the centreline radius
  while ignoring the 0.15 m tube, so a craft can be credited with a clean
  pass while its body overlaps the ring, and `src/game/track.js` says the
  standard gate is 1.524 m. The reviewer ranked this first by cost to the
  player and it is already the next round's first item. Fixing it in the same
  round as the instruments would have meant re-running every measurement
  against a moving target.
- **The rendered torus is a 32-gon,** so its true minimum clear span is
  2 x 1.75 x cos(pi / 32) = 3.483 m and not 3.500. Correct, and it stops
  mattering the moment the torus is replaced by a square regulation frame.
- **Reading `ring.geometry.parameters` is reading back the same authored
  constants through another door,** not measuring geometry. Also correct. The
  regulation gate's assertion has to come from the vertex positions or from a
  test, and `src/game/track.js` has to be imported by something for T1 to
  mean anything. Next round.
- **The sidecar is sampled at least one frame after the PNG,** because
  `captureScreenshot` returns after a frame is committed and the sidecar is a
  separate evaluate. Harmless for a parked camera and wrong for the first
  capture that actually flies.
- **P8's remaining allocations**: `ui.setOsd` allocates a nine key object
  literal every flight frame, `race.update` returns an object, `race.local`
  returns one per call, and `race.js:223` allocates an array per gate per
  sweep sample. P8 is FAIL and stays FAIL; "one array literal removed" was
  not worth a ledger line and is not claimed as progress.
- **The trace is analytic, not a recording from `sim.wasm`.** A2 asks for the
  fundamental to be asserted against the RPM the module reports, and until
  the probe can be driven from a recorded trace that assertion cannot be
  made at all. This is the second half of A2 and it needs a recorder.
- **`peakFreq().db` is an unnormalised log magnitude with no reference,**
  published in the same file as dBFS figures. Not fixed, not quoted anywhere
  in this ledger, and flagged in the handover.
- **`p5_targets` cannot attribute 50 MB of the 115.1 MB it totals**, naming
  two full resolution targets only as "Scene" and one as "unspecified". P5
  passes on a breakdown the instrument cannot fully explain.

## Re-measured after the fixes, both resolutions, this turn

Every capture in `.loop/evidence/r10/1080p` and `900p` was deleted and
re-taken with the corrected handles, and every audio JSON was re-rendered at
the shell's own mix level. These are the numbers that stand.

P1 and P2 per view, from two separate runs of the same command block:

| view | P1 1080p | P1 900p | P2 1080p | P2 900p |
|---|---|---|---|---|
| title attract | 700 | 701 | 1,916,491 | 1,916,451 |
| title worst azimuth | 692 | 692 | 1,916,379 | 1,916,379 |
| start line | 236 | 236 | 1,904,447 | 1,904,447 |
| mid course | 288 | 288 | 1,905,119 | 1,905,119 |
| mid course forward | 484 | 484 | 1,910,349 | 1,910,349 |
| empty sky | 156 | 156 | 1,901,683 | 1,901,683 |

**The title attract view is not reproducible and must stop being the
headline.** Its camera orbits on the wall clock, so it samples a different
azimuth every run: 705, 700 and 701 draw calls across three runs of this
build, and a reviewer independently measured 701. The reproducible worst view
is `title worst azimuth`, which parks the camera at 60 degrees and returns
**692 calls and 1,916,379 triangles** in every run by every party. P1 is FAIL
at 1.73x and P2 at 1.60x on that view, and those are the figures to carry
forward.

Every other cell above is identical across both runs and both resolutions,
which is what a parked camera should give.

Run scoped, this turn:

| # | 1080p | 900p |
|---|---|---|
| P6 first interactive frame | 2712 ms | 2528 ms |
| P7 worst sync block | 38.3 ms over 157 frames | 17.9 ms over 174 frames |
| P13 worst audio ms | 0.20 ms over 157 frames | 0.50 ms over 174 frames |
| P12 audio nodes | 28, context running | 28, context running |
| console | errors 0, warnings 0, harness faults 0 | errors 0, warnings 0, harness faults 0 |

P6 is now 2712 ms against the 3337 ms published above and 5122 ms in round 9,
on a build whose boot path nobody has touched. It is a wall clock measurement
in a shared container and it should be read as a range of roughly 2500 to
5100 ms, all of it over the 1800 ms ceiling. FAIL, and the multiple is not
worth quoting to two figures.

P7 across five runs of this build now reads 16.8, 17.9, 23.8, 38.3 and 53.6
ms, over 50 to 174 frames. The last has no artefact and is withdrawn above;
the other four have one. A budget whose measurements span a factor of 2.3 on
one machine is not measured. CANNOT VERIFY stands.

## The instrument fixes, confirmed on the captures they were meant to fix

    04-midcourse   depth -106.5 m, MIRRORED behind the camera,
                   centre NOT in frame, aperturePx refused
    06-empty-sky   depth   -0.4 m, MIRRORED behind the camera,
                   centre NOT in frame, aperturePx refused

Both at both resolutions. The 17988.1 px and 14990.1 px figures the old
handle published for those two views are gone, replaced by an explicit
refusal and the camera space depth that explains it. The three views whose
target really is in front of the camera are unchanged to eleven significant
figures at 1080p, 79.06866721593508 against 79.06866721593519 between two
runs, so the gate cost no precision where the measurement is valid.

`07-inflight` is still the start line, at both resolutions, for the reason
already given: the throttle key cannot be held long enough at this frame
rate. It is still not a flight measurement.

## Audio, re-rendered at the shell's own level 0.6

| | full trace | flight trace |
|---|---|---|
| RMS dBFS | -22.28 | **-30.38** |
| true peak dBTP | -10.22 | -13.21 |
| peak sample | 0.3083 | 0.2177 |
| samples at or over full scale | 0 | 0 |
| A1 margin as worded | -22.01 dB | -25.03 dB |
| A1 margin, equal bandwidth | 8.02 dB | 7.18 dB |
| channel digests, sha256 truncated | be68688a468e85e0 5d277181e379e01f | 2cd8082a636c087a 065cb9e2e7dbd37f |

A2 at three throttle settings, measured tone in the left channel against the
blade pass frequency at 3 blades. The left channel is dominated by motor 2,
whose trace factor is 1.0082, so the expected ratio is 2.9 x 1.0082 = 2.9238:

| commanded RPM | blade pass Hz | measured Hz | ratio |
|---|---|---|---|
| 2999 | 150.0 | 438.568 | 2.924 |
| 5998 | 299.9 | 877.133 | 2.925 |
| 8997 | 449.9 | 1315.701 | 2.925 |

The bar is 1 percent. The error is 192.4 percent and it is the same at every
throttle setting, which is what "by construction" means: `RPM_TO_HZ_SCALE` is
2.9. A2 FAIL, and A2's second half cannot be answered at all until the probe
can be driven from a trace recorded out of `sim.wasm` rather than from the
analytic function in `scripts/audio-probe.js`.

A4, on `steady:9000`, with the floors the corrected detector now publishes:

    carriers        1315.701 Hz left, 1305.001 Hz right, difference 10.700 Hz
    AM at 8.48 Hz   left  -20.85 dB against a floor of -57.57
                    right  -8.33 dB against a floor of -60.58
                    mono   -13.37 dB against a floor of -56.79

Those are two motor tones, not carriers, and there is no focus tone. Published
because it is the calibration that shows the detector has a floor and reports
against it.
