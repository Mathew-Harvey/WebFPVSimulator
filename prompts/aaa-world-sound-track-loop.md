# Adversarial loop: a AAA world, a mix worth wearing headphones for, and a regulation track

You are running unattended on the repository at
github.com/Mathew-Harvey/WebFPVSimulator, branch
`claude/webfpv-world-sound-track-<suffix>`, cut from `main`.

Read `CLAUDE.md` first. It is the constitution, not advice. Then
`.loop/HANDOVER.md`, `.loop/state.json`, `.loop/tried-and-rejected.md`,
`.loop/blocked.md`, `.loop/threshold-disputes.md`.

Your job is three things that have to hold at once:

1. **The graphics and the game world** must make a stranger believe this is
   a commercial product, and must run on a machine with no discrete GPU.
2. **The sound** must stop being a scream and become a mix somebody would
   choose to wear headphones for: a real motor model, a lofi drum and bass
   bed, and a binaural focus tone.
3. **The track** must be a real MultiGP course, built from real MultiGP
   obstacles at their real dimensions, flown under MultiGP rules.

Those pull against each other, and against the hardware. That tension is
the whole point of this loop. Anything that only works on a fast machine
has failed. Anything cheap that reads as a tech demo has also failed. A
gate that looks good and is the wrong size has failed, because the whole
scale of the world is measured against it.

---

## THE PRIME DIRECTIVE

**You may not change a threshold, tolerance, budget, rubric item, reference
asset, or success criterion in order to make a check pass.**

This includes: widening a band, deleting a check, marking an item "not
applicable", raising a budget, lowering a resolution, cutting scene content
purely to fit a budget while claiming the budget was met, renaming a
failure to a "known limitation", moving a hard requirement into "future
work", or softening any wording below.

If a bar is hard, the answer is better code. Never a softer test.

If you become convinced a bar is genuinely wrong, internally inconsistent,
or physically impossible alongside another bar, you do not get to change
it. Write the derivation into `.loop/threshold-disputes.md`, mark the item
BLOCKED WITH ARGUMENT, keep every other bar intact, and continue. A human
rules on it later.

**Do not fabricate evidence.** Not a number, not a log, not a measurement,
not a description of a frame you did not render or a buffer you did not
render offline. Previous loops produced multiple cases where a number was
written into a comment or a commit message without a measurement behind
it, and a reviewer found every one. The last loop found five in a single
round, including a shadow box quoted at 58 m that was 144 m and a blade
count quoted at 46000 that was 184000. Measure it or do not write it down.

**Do not rewrite this document.**

---

## THE HARDWARE CONTRACT

Unchanged from the previous loop, and not negotiable. Minimum target
machine is **a mid range laptop from five years ago**, which in 2026 means:

- Graphics: Intel Iris Xe or AMD Vega 8 integrated, or an entry discrete
  part of the GeForce MX450 or GTX 1650 Mobile class. Take the integrated
  case as the floor: about 1.5 to 2 teraflops, 50 to 60 GB/s of memory
  bandwidth shared with the CPU.
- CPU: a quad core mobile part of the i5-10300H or Ryzen 5 4600H class.
- Panel: **1920 by 1080 at 60 frames per second**, `devicePixelRatio`
  clamped to 1. That resolution is the minimum spec, not the stretch goal.
- A browser tab, not a kiosk. Other tabs exist, the GPU is shared with the
  compositor, and now the audio thread is real work too.

You cannot measure frames per second honestly in this container: it has
software rasterisation only. `.loop/blocked.md` records that. So the
contract is expressed in proxies you can measure here.

**You CAN measure audio honestly in this container, and that is the point
of the A rubric below.** `OfflineAudioContext` renders the real graph to a
real buffer with no speakers involved, and an FFT over that buffer answers
almost every question the mix rubric asks. There is no excuse for an
unmeasured audio claim. Build the offline harness in round one.

### Hard budgets, per rendered frame, measured in this container

| # | Budget | Ceiling | How to measure |
|---|--------|---------|----------------|
| P1 | Draw calls, **worst view, not best** | **400** | `window.__budget()` in the title, start line and mid course views |
| P2 | Triangles submitted, summed over every pass | **1,200,000** | same, same three views |
| P3 | Full resolution post passes at 1080p | **4** | `window.__budget().p3_fullres_passes` |
| P4 | Post chain texture taps per output pixel, full res passes | **14** | `window.__budget().p4_fullres_taps` |
| P5 | Render target bytes at 1920 by 1080, **including the default framebuffer** | **120 MB decimal** | `window.__budget().p5_target_MB` |
| P6 | Navigation to the first interactive frame | **1800 ms** | `window.__boot().firstFrameMs` |
| P7 | Longest synchronous main thread block after load | **50 ms** | `window.__boot().worstBlockMs`, over at least 600 frames |
| P8 | Steady state allocation per frame | **zero new objects in the render loop** | read the loop; every `new`, object literal, array literal or spread in a per frame path is a finding |
| P9 | Shadow map resolution and count | **one map, 2048 or smaller** | `src/render/scene.js` |
| P10 | Vertex attribute bytes resident | **48 MB decimal** | `window.__budget().p10_attribute_MB` |
| P11 | A settings ladder, at least three quality levels | each level shows a **measured** difference in the ledger | publish `__budget()` at every level |
| P12 | **Audio graph node count, steady state** | **64 AudioNodes** | count the nodes you create; a per note oscillator that is never disconnected is a leak, and a leak here is a click and then a stall |
| P13 | **Audio scheduling work on the main thread** | **2 ms per frame worst case, zero allocation** | instrument the audio update the way `__boot()` instruments the frame |

P5 says decimal megabytes deliberately. A previous round reported mebibytes
under a megabyte heading, which is 4.9 percent lenient at this scale and
was the difference between passing and failing. `budget.js` now prints
both. Quote the decimal one.

P5 also says including the default framebuffer deliberately. A previous
round's ledger could not see it, because the canvas is bound by passing
`null` to `setRenderTarget`, and published 109.8 MB for a frame that was
really using 131.7 MB.

**Culling and level of detail must be proven, not asserted.** Publish the
three view numbers every round. A build where draw calls and triangles do
not change when the camera turns has no culling. The previous loop's
reviewer settled this by pointing the camera at empty sky and still
measuring 1,902,533 triangles, which is 99.3 percent of the worst case.
Repeat that test every round; it is one line and it cannot be argued with.

### The budgets are not permission to build a smaller world

Breath of the Wild renders a continent on a Nintendo Switch: roughly one
teraflop, 25 GB/s shared, 900p at 30 frames per second. The minimum machine
here has more compute and about twice the bandwidth, and it has to draw one
valley with one race track in it. When a budget bites, the answer is a
better representation of the same world, not less world. **Deleting content
to make a number go down is a Prime Directive violation if you then report
the budget as met.** Say what you removed and why, in the ledger, every
time.

---

## T. THE TRACK, AND IT IS A REAL ONE

This is new and it is the item most likely to be done badly, because it is
the one where inventing a plausible number feels harmless. It is not.
Every dimension below comes from MultiGP's own published material and is
cited. If you need a dimension that is not listed here, **fetch it from
multigp.com and cite the page in PROGRESS.md**. Do not derive it, do not
estimate it from a photograph, and do not carry over a number from the
current build, because the current build is wrong.

### What the current build gets wrong

`gate()` in `src/render/scene.js` builds a gate `w = 6.0` metres wide and
`h = 5.0` metres tall with a torus of radius 1.9, so an aperture 3.8 m
across. The MultiGP standard gate opening is **5 feet square, 1.524 m**.
The build's aperture is about **2.5 times regulation**. That single error
is a large part of why the world has never read at the right scale: a
250 mm quad flying through a 3.8 m hole looks like a toy in a stadium, and
every judgement about how big the valley is has been anchored to it.

### The obstacle library, at MultiGP dimensions

Source: <https://www.multigp.com/multigp-drone-race-course-obstacles/> and
the MultiGP shop product pages. Convert to metres at the boundary and keep
SI internally, per `CLAUDE.md`.

| Obstacle | Dimension as published |
|---|---|
| Standard gate | 5 ft by 5 ft opening (1.524 m square) |
| Championship gate | 7 ft by 6 ft opening (2.134 m wide, 1.829 m tall) |
| Tower | a standard gate elevated 5 ft off the ground; the 7x6 tower is elevated 6 ft |
| Double gate tower | two gates stacked vertically |
| Ladder | three gates stacked vertically |
| Topless ladder | a ladder without the topmost panel |
| Dive gate | 7x6, elevated 15 ft, slightly angled for entry |
| Launch gate | 7x6, not angled, panels facing the ground for upward entry |
| Split-S gate | 7x6 with flags 1.5 ft behind and to the side of the gate |
| Offset 90 gate | tower and gate joined at a 90 degree angle |
| Hurdle | standard hurdle |
| h-Hurdle | 5 ft tall, 10 ft wide, with a gate leg panel addition |
| Gate plus flag | 5x5 gate with a side panel at least 5 ft tall and at least 1 ft wide |
| Micro or whoop gate | 19 in by 19 in, 483 mm square, 361 square inches |

### The track itself

MultiGP publishes ten Universal Time Trial tracks, each with a setup
diagram and a PDF:
<https://www.multigp.com/universal-time-trial-utt/>. They are UTT 1, UTT 2
Tsunami, UTT 3 Bessel Run, UTT 4 High Voltage, UTT 5 Nautilus, UTT 6 Fury,
UTT 7 Tiny Whutt, UTT 8 Revenge, UTT 9 MegaUTT, UTT 10 Prairie Rage.

Build one of them, to its diagram, and say in PROGRESS.md which one and
where you got the layout. The diagram PDFs did not render through this
container's fetch tool on the last attempt, so the first honest step may be
to record in `.loop/blocked.md` that a human has to supply the layout
coordinates, and to build a track that uses the real obstacle library at
real dimensions in the meantime. **A track built to invented coordinates
and described as UTT 5 is fabricated evidence.** A track built to the real
obstacle library and described as "a chapter style course, not a UTT" is
honest and passes T4 below.

### T items, falsifiable

- **T1. Gate geometry is regulation.** Read the aperture out of the built
  geometry at runtime and assert it: the standard gate's clear opening is
  1.524 m by 1.524 m, within 10 mm. Publish the measured number. If the
  track uses championship gates, 2.134 m by 1.829 m.
- **T2. The gate reads as a MultiGP gate.** Square opening, not a torus.
  PVC tube frame, mesh side panels, a top panel carrying the gate number.
  A photograph of a real MultiGP gate and a screenshot of yours should be
  recognisably the same object.
- **T3. The obstacle library exists and at least five distinct obstacle
  types appear on the track**, each at the published dimension, each
  measurable from the geometry at runtime.
- **T4. The course is a real layout or is honestly labelled.** Either
  reproduce a published UTT diagram and cite it, or state plainly in the
  interface and in PROGRESS.md that the course is an original chapter style
  layout built from regulation obstacles.
- **T5. MultiGP race rules.** Every gate must be passed through, in order.
  A missed gate is not a lap: the pilot must turn around and pass through
  it. Timing reports **fastest single lap and fastest three consecutive
  laps**, which is what UTT is scored on.
- **T6. Scale reads.** With a 1.524 m gate and a 250 mm quad, a capture
  from the racing line must let a reviewer measure the gate's on screen
  height and the quad's on screen width and get a ratio within 15 percent
  of 6.1 to 1. Publish both pixel measurements.
- **T7. The regulation flat surface and the AAA relief requirement are
  reconciled, not oscillated over.** MultiGP says the course terrain
  should be as flat as possible. The world rubric G6 says terrain must have
  relief inside the flight corridor and must occlude part of the course at
  some point on a lap. **The resolution is decided and you will implement
  it, not relitigate it: the regulation racing surface is flat within the
  course footprint, and the relief, occlusion and middle distance interest
  live in the valley around and beyond that footprint.** A pilot flying the
  timed line is on a legal flat course. A pilot looking up is in a place.
  If you think this is wrong, `.loop/threshold-disputes.md`, and continue.

---

## A. THE SOUND

The current state, read from `src/render/audio.js`: one sawtooth per motor
running to 4200 Hz plus a square partial running to 8000 Hz, four of them,
through a lowpass that opens to 9000 Hz, over a bandpass noise bed. Four
detuned sawtooths in the upper midrange is a chord of car alarms. The
human who owns this project describes it as **loud screaming**, and that is
the defect statement of record.

Everything below is measurable in this container by rendering the graph
through `OfflineAudioContext` and running an FFT over the result. Build
that harness first, as `scripts/audio-probe.js`, so every A claim in every
later round has a number behind it. It should be able to render N seconds
of the real audio graph driven by a scripted RPM and airspeed trace, and
report: peak sample, RMS, true peak, per band energy in 1/3 octaves,
spectral centroid, per channel spectra, and an onset autocorrelation for
tempo.

- **A1. It does not scream.** Over a 20 second render of a full throttle
  pass, the energy in the 2 kHz to 8 kHz band must be at least **12 dB
  below** the energy in the band containing the blade pass fundamental.
  Publish both figures and the band edges.
- **A2. The motor tone is derived, not invented.** The fundamental must be
  the blade pass frequency, motor RPM divided by 60 and multiplied by the
  blade count, tracked from the simulator's actual per motor RPM. Assert it
  against the RPM the module reports, within 1 percent, at three different
  throttle settings. State the blade count you modelled and why.
- **A3. Loudness and headroom.** Integrated RMS of a normal flight render
  between **-20 and -14 dBFS**, true peak **below -1 dBFS**, and **no
  sample at or above 0 dBFS anywhere in the render**. A clipped sample is a
  failure, not a style.
- **A4. The binaural focus tone is genuinely binaural.** Two carriers, one
  per ear, differing by the target beat frequency. Prove it: FFT the left
  and right channels separately and show the two carrier peaks and their
  difference, within 0.2 Hz of target. Then sum to mono and show the beat
  is **not** present as an amplitude modulation, which is what separates a
  binaural beat from a monaural one. State the target frequency and the
  band you chose it from. It must be off by default, selectable in
  settings, and the interface must say plainly that it needs headphones and
  must make no health or performance claim.
- **A5. The bed is lofi drum and bass and it is generated, not sampled.**
  Tempo in the **170 to 176 BPM** range, measured by onset autocorrelation
  over a 60 second render and published. Breakbeat pattern with syncopated
  snare placement, a sub bass line, and lofi character that you define in
  measurable terms and then measure: for example a stated high shelf
  rolloff above a stated corner frequency, and a stated amount of pitch or
  timing wow. No external audio assets and no new dependency, because of
  the licence and because of P6. Everything from `OscillatorNode`,
  `AudioBufferSourceNode` over noise you generate, and filters.
- **A6. The loop is seamless.** Render two consecutive loop periods and
  show there is no discontinuity at the seam: the sample delta across the
  boundary must be within the distribution of deltas inside the loop. A
  click at the loop point is the single most obvious tell of cheap audio.
- **A7. The mix has a hierarchy and it survives full throttle.** With the
  bed, the motors and the wind all running at maximum, a gate proximity cue
  and a crash must each remain audible: show at least **6 dB** of level
  advantage in their own band at the moment they play. The bed must duck
  under them, and the duck must be measurable.
- **A8. The music never competes with the flight instrument.** Motor sound
  in this project is a flight instrument, not decoration: a pilot flies
  partly on the pitch of the motors. The bed must sit in bands the motor
  model does not use, and you must show the band split.
- **A9. Audio is deterministic and never touches physics.** The same input
  trace produces the same offline render, byte for byte, in two runs.
  Nothing in the audio path may read or write simulator state other than
  the values already exposed. `npm run verify` must be unaffected.
- **A10. Zero allocation per frame and no node leak.** P12 and P13. Note
  and drum voices must be pooled or scheduled with a lookahead scheduler,
  not created per event and dropped for the garbage collector.
- **A11. A mute and a mix that a human can live with.** Separate levels for
  motors, wind, music and the focus tone. Every level must show a measured
  difference in the probe output, not just a different label.

---

## G. THE WORLD

Carried over from the previous loop unchanged, because every one of these
is still open. Do not re-derive the measurements listed in
`.loop/HANDOVER.md`; start from them.

- **G1. Value structure.** Sky, ground, mid distance and near objects each
  occupy a distinct luminance band. For every object and background pair a
  reviewer samples, either the linear luminance difference is at least
  **0.06** or an unbroken ink line separates them.
- **G2. Aerial perspective is monotonic.** Successive distance layers
  increase with distance toward the horizon value, at least **0.05**
  between adjacent layers. Nothing beyond 300 m is exempt from haze. Every
  layer must actually appear in a rendered frame.
- **G3. The target owns the frame.** The next gate's peak luminance is the
  maximum in the frame, with at least **0.08** of headroom over the
  brightest pixel that is not the gate, in every captured view. The gate
  after next reads as the second loudest thing. **Measuring this needs a
  harness change first**: the last loop could not settle it because a
  parked camera looks at one gate while the race's next gate is elsewhere,
  so the bright ring being measured was not the target. Have `shots.js`
  record `window.__race.next` and that gate's screen position with every
  capture before you claim G3 in either direction.
- **G4. No artefact in a still.** No z fighting, no shimmer, no seam, no
  clipping through geometry, no ink on a continuous surface, no missing ink
  where two surfaces meet, no aliased silhouette without coverage pixels,
  no unresolved dark light dark fringe.
- **G5. Deliberate colour on every surface class.** Light warm, shadow
  cool, everywhere. No surface class covering more than **2 percent** of
  frame area may be unlit or exempt from the light model.
- **G6. Scale and middle distance.** Content at 20 to 200 m. Terrain relief
  and occlusion, subject to T7's resolution. The quad reads as a 250 mm
  object, and T6 is how that gets measured now that there is a regulation
  gate to measure it against.
- **G7. Motion reads.** Speed from the ground and near geometry, not camera
  shake, proved with two frames a known interval apart at speed and the
  near field displacement measured against the sky's. Altitude legible at
  all times. Propwash and dust where the craft is low. There is currently
  no particle system anywhere in `src/`.
- **G8. The world is a place.** At least six visually distinct landmark or
  biome elements, each readable at distance as its own silhouette. The
  track readable ahead by cues that are not the gates themselves.
- **G9. Water and sky are surfaces, not decals.** Water needs a light
  model, a real shoreline, and depth cued by depth. It currently computes
  depth as distance from its own disc centre, which G9 forbids by name.
- **G10. It looks like this at 1080p on the lowest setting.**

---

## D. Engineering integrity, non negotiable, checked every round

- **D1.** `npm run verify` reports **12 of 13**, run in the same turn as
  any claim about it, output pasted verbatim. `yaw-coupling` is the known
  red and its threshold has never been touched. If you ever see 11, you
  broke something, most likely the toolchain: see the container setup in
  `.loop/HANDOVER.md`.
- **D2.** `git diff --stat vendor/betaflight` is empty.
- **D3.** Zero console errors and zero console warnings, on load and after
  two minutes of flight, at both capture resolutions.
- **D4.** The physics path contains no `Math.sin`, `Math.cos`, `Math.pow`,
  and reads no frame time. A dropped frame changes nothing about the
  trajectory. **Audio must not become a new way to violate this.**
- **D5.** Every source file carries its GPLv3 header. No new dependency and
  no external asset without a justification written in PROGRESS.md first.
- **D6.** No em dashes or en dashes anywhere in prose, comments, commit
  messages or documentation.
- **D7.** `git diff HEAD -- tests/` is empty at the end of every round.
- **D8.** No number in a comment, in PROGRESS.md, or in a commit message
  that is not backed by a measurement. The previous loop found five stale
  numbers in one round. Grep your own diff for digits before committing.

---

## THE LOOP

Three phases per round. Do not merge them.

### Phase 1: BUILD, one item

Priority order: a D regression first, then whichever P budget is furthest
over its ceiling, then whichever A item is furthest from its bar, then the
T or G item whose fix most changes what a player experiences.

Round one is not a feature. Round one is `scripts/audio-probe.js` and the
`shots.js` change that records which gate is next, because two whole rubric
sections are currently unmeasurable without them, and an unmeasurable
rubric section is where fabricated numbers come from.

Keep it simple: plain JavaScript, one file doing an obvious thing, no
framework, no bundler, no state library.

### Phase 2: EVIDENCE

- Capture with `scripts/shots.js`, which drives the real page in headless
  Chromium. **Assert the state every capture claims** with `until:` and
  `expect:`. A fixed wait is not evidence: a frame takes about 120 ms here,
  so `tap:Enter wait:400` can capture the state before the key.
- Capture at **1600x900 and 1920x1080**, both, every round.
- **Look at the screenshots.** Every real rendering bug in this project's
  history was found by looking at a frame and not one by reading the code.
  The last loop solved a mountain colour ladder to the exact right
  luminances and rendered a desert, and only the frame said so.
- **Listen to the numbers.** Render with `audio-probe.js` and publish the
  spectrum. You cannot hear it in this container, so the FFT is your ears,
  and a claim about the mix with no spectrum behind it is fabrication.
- Measure pixels with `scripts/pixels.js`. It has three modes: rectangle
  averages, `walk:` for single pixel runs along a line, and `stair:` for
  the sub pixel crossing of an edge row by row. Use `stair:` for any claim
  about antialiasing: walking across an edge cannot tell a blur from a
  resolve, and that mistake has already been made once here.
- Publish the **cost ledger**, P1 to P13, for the title view, the start
  line view and a mid course view. State the view with every number. "310
  draw calls" with no view named is not a measurement.
- Run `npm run verify` and paste the table.

### Phase 3: BREAK, adversarial review, binding

Spawn fresh reviewers with the Agent tool, in their own context. Give them
the artefacts and the file paths. Do **not** give them your summary of what
you did or what you believe you fixed. Tell them explicitly **not to edit
any file**: a reviewer that changes the code under review has invalidated
its own verdict, and that has already happened twice here. Run `git status`
after every review round.

Brief them roughly like this:

> You are reviewing a browser FPV racing simulator against a fixed rubric.
> You are hostile. Your default verdict is REJECT. The author's description
> of their own work is not evidence; only the screenshots, the measured
> numbers, the rendered audio buffers, and the code are evidence. For each
> rubric item return PASS, FAIL, or CANNOT VERIFY, and for every FAIL give
> the single most specific fix you can name, in one sentence, pointing at a
> file. If you cannot tell from the artefacts, say exactly what artefact you
> would need. Do not be encouraging. Do not praise. Do not soften. Rank your
> FAILs by how much each one costs the player. Do not edit any file.

Run at least two per round with different lenses. Pick the two that fit
what you changed:

- An art director shipping stylised titles, judging the frame.
- A graphics engineer on integrated GPUs, judging the ledger and the
  shaders, who will refuse any number without a view attached.
- **A mastering engineer, judging the mix from the rendered spectra**, who
  will refuse any loudness claim without a true peak figure.
- **A MultiGP chapter organiser, judging whether this is a legal course**,
  who has set up a real UTT and will check every dimension.
- An FPV racing pilot of ten years, judging speed, legibility and race
  legitimacy.
- A player on a five year old laptop, opening the page cold with headphones
  on.
- A QA tester paid per defect.

**Verdicts are binding.** You may only fix it, show with a new artefact
that the reviewer was factually wrong about what is on screen or in the
buffer, or record it in `.loop/blocked.md` with the reason it cannot be
done in this container. The last loop had one reviewer claim a HiDPI resize
bug that did not exist, and the correct response was to read the Three.js
source in the CDN cache and write down why it was wrong. Do that. Do not
just disagree.

### Bookkeeping, every round

Update `.loop/state.json` with the round number, the item attempted, the
cost ledger, the audio probe figures, reviewer verdicts, and the running
pass or fail state of every item. Append what did not work **and why** to
`.loop/tried-and-rejected.md`. Append the round to `PROGRESS.md`, including
what went wrong. Commit with a message that says what changed and what the
evidence was. Keep `.loop/HANDOVER.md` current at the end of every round.

If two consecutive rounds oscillate, write the conflict into
`.loop/conflicts.md` with both mechanisms, then design a third approach
that satisfies both.

---

## KNOWN BLOCKERS, DO NOT FAKE THEM

Already argued in `.loop/blocked.md`:

- Absolute frame rate on the target hardware. This container is a software
  rasteriser. P1 to P13 are the contract precisely because the real number
  is unmeasurable here. A human must confirm 1080p at 60 frames per second
  on an actual five year old mid range laptop. Never claim it yourself.
- P7 over a real sample. Every figure so far was taken over about ten to
  forty frames, which is not a worst case statistic on any hardware.
- Real Betaflight blackbox logs from a physical 6S five inch quad.
- Stick to photon latency.
- Real radio hardware for the Gamepad path.

New, and record them properly rather than working around them silently:

- **Whether the mix actually sounds good.** An FFT can prove it is not
  screaming, is not clipping, is at the right tempo and is genuinely
  binaural. It cannot prove it is pleasant. A human has to listen. Say so.
- **The UTT layout coordinates**, if the diagram PDFs will not render in
  this container. A human supplies them or the track is honestly labelled
  as an original layout under T4.

---

## THE STATE THIS LOOP INHERITS

`main` is at the end of the previous loop's round 9. `PROGRESS.md` has the
full history. The measured ledger at 1920 by 1080:

| # | budget | ceiling | measured | verdict |
|---|--------|---------|----------|---------|
| P1 | draw calls | 400 | 705 title attract | FAIL 1.76x |
| P2 | triangles | 1,200,000 | 1,916,515 | FAIL 1.60x |
| P3 | full res passes | 4 | 3 | PASS |
| P4 | taps per pixel | 14 | 10 | PASS |
| P5 | render target bytes | 120 MB | 115.1 MB | PASS |
| P6 | first interactive frame | 1800 ms | 5122 ms | FAIL 2.8x |
| P7 | worst sync block | 50 ms | 23 ms over 37 frames | CANNOT VERIFY |
| P8 | allocations per frame | zero | about 20 at rest, over 100 in flight | FAIL |
| P9 | shadow maps | 1 at 2048 | 1 at 2048 | PASS |
| P10 | attribute bytes | 48 MB | 51.2 MB | FAIL |
| P11 | settings ladder | 3 levels | nothing exists | FAIL |

Three things worth knowing before you touch anything:

1. **P2 has no culling at all.** `grassField` sets `frustumCulled = false`
   on one mesh spanning 900 m: 552,000 triangles submitted unconditionally
   and then again for the geometry prepass, 57.6 percent of the budget. The
   baked scenery's merged bounding spheres span the whole 1700 m world. 636
   of 698 draw calls carry 0.5 percent of the triangles between them, and
   those are the 8 gates at about 25 meshes each and the 72 flag cloths.
   **This is the item to start on after the harness round**, and rebuilding
   the gates to MultiGP dimensions is the natural moment to bake them.
2. **The renderer runs with `NoToneMapping`,** so no colour can exceed 1.0.
   Any plan that wants a real highlight either works below that ceiling or
   changes tone mapping deliberately, in its own round, with its own
   review.
3. **A lit material on geometry with no normal attribute** washes the whole
   world to flat cream with a completely clean console. Check for normals
   before putting a lit material on anything.

`.loop/HANDOVER.md` has the container setup, the instruments, the open G
item measurements and a list of sharp edges. Read it before the first
commit, not after the first surprise.

---

## DEFINITION OF DONE

**Two consecutive rounds in which every G item, every A item, every T item,
every P budget and every D item is PASS by adversarial review, no reviewer
raises a new FAIL, `npm run verify` reports 12 of 13, and the console is
clean at both resolutions.**

Blocked items with a written argument do not prevent done, but they must be
listed at the top of the final handover, in plain language, as the things a
human still has to resolve. "A human must listen to the mix" and "a human
must confirm 60 fps on real hardware" are both expected to be on that list.

When done: fast forward `main`, push, and write `.loop/FINAL.md` with what
is built, what is blocked, what was tried and rejected, the final cost
ledger, the final audio probe figures, the track's obstacle manifest with
every measured dimension, and where the sharp edges are.

## IF YOU RUN OUT OF ROOM

Context exhaustion is not failure and not a reason to stop early or wrap up
prematurely. Update `.loop/HANDOVER.md` with the round state, the exact
next item you were going to build, the current cost ledger, and anything
you learned that is not yet written down. Commit and push everything. The
next instance continues from there. A handover is a baton pass, not an
ending.

Do not stop because the task is large. Stop when the rubric is green, or
when every remaining item is blocked for a reason you have written down and
a human has to break the tie.
