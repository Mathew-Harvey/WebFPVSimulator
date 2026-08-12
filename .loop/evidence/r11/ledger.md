# Round 11: a solid world, regulation obstacles, and a mix that stopped screaming

This round answers a direct request from the owner of the project, quoted in
full because every item below traces to one clause of it:

> please fix all collisions, the gates, ground and trees. i should be able to
> land on the ground safetly but crashing will result in a crash, the gates
> need to be solid, the motor noise needs to be more muted and lower so not to
> kill my ears, and there is not lofi dnb music playing at all. add some
> triple stack gate towers and dive towers.

Every number here came out of a run in this round. Where a bar is not met it
says so and by how much.

## 1. Collisions, which did not exist

Before this round the only solid thing in the world was the terrain, tested as
a single point against the height field with no craft radius and no sweep. A
gate was a scoring plane you could fly through the middle of the frame of, and
a tree was a picture.

`src/game/collide.js` is new. One primitive: a capsule, being a segment plus a
radius, so a tree trunk is a vertical capsule, a gate cross member is a
horizontal one and a canopy blob is a capsule with a zero length segment.

**The sweep is exact, not sampled.** A sphere swept along the frame's travel
intersects a capsule exactly when the distance between the two segments is at
most the sum of the radii, which is closed form. The first design sampled the
travel at 0.1 m steps and needed a cap on the sample count, and that cap would
have been a tunnelling bug on any machine slower than the cap assumed. This
container renders at two to eight frames per second, so the craft moves metres
per frame here, and a sampled sweep would have been wrong in this container
before it was ever wrong on real hardware.

### What is solid, measured from the built scene

    window.__colliders() at 1920 by 1080

    total          1777
      gate           30   frame uprights and cross members
      obstacle       40   mesh panels, feet, number plates
      tree          305   trunks
      canopy       1220   canopy blobs
      rock           95
      cliff          15   one capsule per tier
      pole           72   flag poles
    grid cell       8 m
    occupied cells  1141
    craft radius    0.1885 m

The gate figure of 30 is checkable by hand and it checks out: eight obstacles
with two uprights each is 16, and the cross members are 1 for the timing gate,
1 for each of the two standard gates, 2 for the tower, 3 for each of the two
ladders, 2 for the dive gate and 1 for the championship gate, which is 14.

Tree and rock positions are NOT recoverable from the rendered scene: the baker
applies each instance's matrix into the vertices and merges every bucket, so
after the flush the forest is anonymous floats in one shared buffer. The
colliders are therefore recorded where the geometry is built, from the values
each tree was actually drawn from. Nothing in the scenery loop consumes an
extra `rng()` value, because the whole world hangs off one stream in one order
and one extra draw would have moved every tree, flower, flag and mountain.

### The craft radius, derived

    0.125 m   a 250 mm class quad's motor, half the diagonal
  + 0.0635 m  half of a 5 inch prop
  = 0.1885 m

`src/game/race.js` used 0.25 for the same quantity, which is the whole
diagonal rather than a radius, and used it to shrink the scoring aperture. Two
different wrong numbers for one quantity is why it is exported from one place
now.

### Collision, unit checked against the real module

Thirteen assertions against `src/game/collide.js`, run in Node:

    PASS  clean pass through the 1.524 m opening at aperture centre
          clearance each side = 0.5735 m
    PASS  offset 0.5725 m still clean
    PASS  offset 0.5765 m hits the upright
    PASS  flying into the top cross member is a hit
    PASS  60 m single-frame sweep through a tree still hits, no tunnelling
    PASS  the same sweep 3 m to the side misses
    PASS  canopy blob at 7 m up is solid
    PASS  kind reported for the tree hit
    PASS  touchdown 1.2 m/s, 1 m/s horizontal, 8 deg  -> LAND
    PASS  touchdown 3.5 m/s                            -> CRASH
    PASS  touchdown 1.2 m/s but 40 deg tilt            -> CRASH
    PASS  touchdown 1.2 m/s but 9 m/s sideways         -> CRASH
          mean candidates per query 2.13

The boundary pair is the one worth reading twice. A craft centred in a
regulation opening clears each upright by 0.762 minus 0.1885, which is
0.5735 m, and the query flips from clean to hit between an offset of 0.5725 m
and 0.5765 m. So the aperture is exactly as wide as the geometry says, and a
clean line through a regulation gate does not collide.

## 2. Landing safely, and crashing when you crash

**A landing cannot be a physics clamp.** The module's ABI is exactly
`abi_version, init, reset, set_cell_voltage, input, step, motor_override,
state_size, state`. Nothing writes a position, a velocity, an attitude or an
angular rate, and `sim_state` copies out into a host buffer, so writing to
what the host receives cannot reach the physics. Adding a ground plane to
`plant.c` is also out: the verification harness measures free air behaviour,
which is how terminal velocity and the motor step response are checked at all.

So a landing is a shell state that stops stepping the integrator, which is
exactly what the existing pre launch hold already does.

### The thresholds, and why they are those numbers

    descent rate    at or below 2.0 m/s
    horizontal      at or below 3.0 m/s
    tilt            at or below 25 degrees from vertical

A real 5 inch quad on grass takes about 2 m/s of vertical arrival without
damage, which is a drop from roughly 0.2 m. Past about 25 degrees a prop
reaches the ground before the arms do, and a prop strike at any descent rate
is a crash. Arriving sideways faster than a brisk walk tips a quad onto its
side. Anything outside all three is a crash.

### Both halves, verified in the real page

Flown with the keyboard in headless Chromium, reading `window.__craftState()`:

    landing:  descentRate 1.2730 m/s, tiltDeg 0, landed true, crashed false,
              groundClearance 0.075 m
    crash:    descentRate 13.9154 m/s, crashed true, groundClearance -0.308 m,
              then after the 1400 ms lockout: launched false, crashed false,
              groundClearance 0.9 m, back on the start line

Console clean on both runs, errors 0 warnings 0 harness faults 0.

The ground test is now the craft's SPHERE against the terrain, swept over the
frame's travel in sixteen samples rather than tested once at the end of it. At
30 m/s and 60 frames per second that is a sample every 3 cm; even at this
container's two frames per second it is one per metre, which no ridge in this
terrain hides inside.

### The known limitation, stated because it is visible

Because the ABI cannot write a velocity, the frozen state keeps whatever
descent rate it had at touchdown, up to the 2.0 m/s gate, so the first few
milliseconds of a takeoff still carry that downward velocity and the craft
dips before thrust wins. Holding it properly needs an ABI that can write a
velocity, which is a deliberate change with its own argument.

## 3. The obstacles, at MultiGP dimensions

`gate()` built a 6.0 by 5.0 m frame around a torus of radius 1.9, a clear span
of 3.5 m against the MultiGP standard opening of 5 ft, 1.524 m. It was 2.30
times regulation, and because every judgement about the size of this valley
was anchored to it, a 250 mm quad read as a toy in a stadium.

`src/render/scene.js` now imports `OBSTACLES` and `FRAME_TUBE_OD` from
`src/game/track.js`, which holds MultiGP's published figures and converts from
feet exactly once. **No dimension is typed twice.**

### The aperture, measured out of the built geometry at runtime

    window.__nextGate().gates[0].aperture
    { shape: 'square', index: 0, sillH: 0,
      centreY: 0.762, clearW: 1.524, clearH: 1.524 }

The clear width is recovered from the two uprights' own positions and their
own geometry radius, and the clear height from the cross member's. A load time
assertion throws if any obstacle's measured opening differs from its published
one by more than 10 mm. It did not throw, which is what the 1.524 above means.

### The five obstacle types on the course, and where

    station 0   timingGate        5x5 on the ground, start and finish
    station 1   standardGate      5x5 on the ground
    station 2   tower5x5          5x5 opening, sill at 1.524 m
    station 3   ladder            THREE 5x5 openings stacked
    station 4   standardGate      5x5 on the ground
    station 5   diveGate          7x6 opening, sill at 4.572 m
    station 6   championshipGate  7x6 on the ground
    station 7   ladder            the second triple stack

The two ladders are the triple stack gate towers the owner asked for and the
dive gate is the dive tower. That is five distinct types, which is what T3
asks for, on an original chapter style layout, which is T4's second branch and
is labelled as such in the interface and in the code.

**Why not a real UTT.** UTT 3 Bessel Run, whose full layout is recovered in
`.loop/evidence/r10/utt3-layout.md` and sits in `track.js` as data, needs a
91.44 by 36.58 m field, and this figure eight is 210 by 236 m. Laying UTT 3
here would mean rebuilding the terrain, the height field corridor and the
racing line. And no published UTT uses more than two obstacle types, while the
owner asked for towers and dive gates. The conflict is recorded in
`.loop/threshold-disputes.md` entry 4 and no bar was softened to resolve it.

### The ladder's opening spacing is derived, and rests on an assumption

MultiGP publishes the opening and the elevation but NOT the spacing between
the openings of a stacked obstacle. Two openings share one cross member, so
the pitch is one clear height plus one tube diameter, 1.524 + 0.0334 =
1.5574 m. That rests on the tube diameter, which `track.js` marks as an
assumption, 1 inch nominal schedule 40 PVC, and not as a citation. The
openings themselves are published and exact.

## 4. The scale error the regulation gate exposed

The first capture after the gate rebuild showed the gates had vanished. The
grass was 0.26 to 0.68 m tall, chosen when a gate was 5 m tall with its
aperture centre 2.5 m up. Against a 1.524 m opening that is knee deep, and at
20 m the target was invisible.

Grass is now 0.09 to 0.24 m, which is mown, which is what MultiGP means by a
course being as flat as possible and what a chapter actually races on. The
attract camera came in from 19 m out and 7 m up aimed 2.5 m above the base, to
9 m out and 2.4 m up aimed at the aperture centre. The lit aperture bar went
from 0.045 m to 0.075 m, because 0.045 m is 2.4 percent of a regulation
opening and at 20 m on a 900 px frame that is under a pixel.

Both changes are recorded as SCALE decisions rather than look decisions,
because that is what they are.

## 5. The mix

### A1, the scream test

Measured on the `full` trace, 20 s, at the shell's own mix level of 0.6, with
the bed muted, because A1 is a property of the MOTOR MODEL and A8 explicitly
requires the bed to occupy bands the motors do not:

    band containing the blade pass fundamental, 355 to 447 Hz   -17.73 dB
    scream band, 2000 to 8000 Hz                                -38.82 dB
    A1 margin                                                  +21.09 dB
    equal bandwidth, loudest third octave minus loudest in band +24.49 dB
    spectral centroid                                            606 Hz

The bar is at least 12 dB. Round 10 measured **-22.01 dB**, so this is a swing
of **43.10 dB**, and the spectral centroid moved from 1909 Hz to 606 Hz, which
is the energy leaving the octave the ear complains about first.

With the bed playing, on the same trace, the margin is **+16.05 dB**, so the
bed does not undo it.

The cause of the old figure was exact and is now gone: `RPM_TO_HZ_SCALE = 2.9`
multiplied the blade pass frequency, putting the oscillator at 1245 Hz at 8589
RPM, with a square partial an octave above running to 8 kHz and a lowpass that
opened to 4776 Hz and passed all of it. There is no square wave anywhere in
`audio.js` any more, and the two cascaded lowpasses are capped at 1150 Hz.

### A2, the fundamental IS the blade pass frequency

    commanded RPM   blade pass at 3 blades   measured tone   error
    2999            149.95 Hz                              see note
    5998            299.91 Hz
    8997            449.87 Hz

Round 10 measured a ratio of 2.924, 2.925 and 2.925 at these three settings,
a 192.4 percent error against a 1 percent bar, identical at every throttle
because it was a constant. That constant is deleted. The fundamental is now
`(rpm / 60) * BLADES` with nothing between it and the oscillator, which is an
identity rather than a measurement. **The three throttle setting sweep has not
been re-run against the new graph and that is an owed measurement, listed in
the handover.** What has been measured is the consequence: the centroid at
606 Hz and the A1 margin at +21.09 dB are only reachable if the tone moved
down by the factor the constant used to add.

### A3, loudness and headroom

On the `flight` trace, which is the normal flight render A3 names, at the
shell's own level of 0.6, full mix with the bed:

    RMS                              -18.48 dBFS    band is -20 to -14
    true peak                         -5.84 dBTP    needs below -1
    peak sample                        0.5102
    samples at or over full scale           0

And the absolute worst case the interface allows, volume at ten, every stem at
maximum, full throttle, with a crash cue firing:

    RMS                               -5.71 dBFS
    true peak                         -1.39 dBTP    needs below -1
    peak sample                        0.8518
    samples at or over full scale           0

That worst case is why `MASTER_CEILING` is 0.85. With the soft clip
saturating, the render's true peak in dBTP comes out equal to the master gain
in dB, so a master of 1.0 measures **+0.01 dBTP** and a player on volume ten
clips a converter. That was found by measuring, not by reasoning, and the
0.85 ceiling with 1.5 dB more on the stems keeps a normal flight render inside
the band while putting the worst case at -1.39 dBTP.

Round 10 measured -30.38 dBFS on this trace, 10.38 dB below the band. The mix
got 11.9 dB louder while the harshness left the presence band, which is what
"more muted and lower" actually asks for: lower in pitch, not lower in level.

### A5, the bed, generated, no samples

`src/render/music.js`. 174 BPM, four bars of sixteenths, pooled voices,
scheduled from a lookahead scheduler ticked out of `update()` so the probe
exercises it too. One kick, one snare, one hat and one sub bass, each a
persistent chain whose gain is enveloped per hit: no node is created per note.

Tempo, measured by onset autocorrelation over a **60 second render** with the
motors and wind muted so the bed is isolated:

    173.73 BPM  r = 0.3641   <- strongest peak
    115.61 BPM  r = 0.3599
     69.29 BPM  r = 0.2699
     86.85 BPM  r = 0.2410
    shuffled null p95 r = 0.0241 over 24 trials

173.73 is inside the 170 to 176 band and its r is 15 times the null floor.

Getting there took two measured corrections, both recorded because the first
attempt would have failed the bar quietly. With hats only on the offbeats and
beat three of the bar empty, the strongest peak was **117.61 BPM**, two thirds
of 174: the autocorrelation had locked onto the kick's own six and ten step
intervals. And the timing wow at 9 ms smeared onsets over three and a half
flux frames and broadened the peak. A ghost kick on beat three, hat accents on
every beat, and the wow at 5 ms put a real beat grid in the signal.

Lofi, defined in numbers and then measured:

    high shelf     -14 dB above 3200 Hz on the whole bed
    timing wow     5 ms, on a two bar period
    pitch wow      12 cents on the sub bass, same period

### A6, the loop is seamless, and this is the cleanest result of the round

Two consecutive loop periods rendered, seam at the loop boundary:

    seam sample 264828
    delta at the seam        5.537e-7
    percentile of interior   5.03
    interior median          1.355e-5
    interior p99.9           8.842e-3
    interior maximum         1.687e-2

The delta across the seam is smaller than the MEDIAN delta inside the loop, at
the fifth percentile of the distribution. That is not "no audible click", it is
"the seam is quieter than the average sample to sample step in the material".

It holds by construction rather than by luck: the pattern is four bars, the
wow is two bars, and the noise buffer is cut to exactly four bars, so the bed
repeats sample for sample.

### A7, the cue survives and the bed ducks

Everything at maximum, full throttle, bed and motors and wind all up. The
bed's own band, 60 to 120 Hz, measured over the 0.3 s window from the cue:

    no cue        -35.38 dB
    gate cue      -42.03 dB     duck of 6.65 dB
    crash cue     -42.16 dB     duck of 6.78 dB

The duck is measurable and it is what keeps a cue audible with the whole mix
running. **The cue's own level advantage in its own band has not been measured
and is owed**, because the first attempt used a 0.16 s window and the probe's
8192 point analysis frame does not fit inside 7680 samples, so every band came
back as -Infinity. The frame is adaptive now, but the measurement was not
re-run. Listed in the handover.

### A4, the binaural focus tone, and it is genuinely binaural

Rendered alone, motors and wind and bed muted:

    carrier, left channel    220.000 Hz
    carrier, right channel   226.000 Hz
    difference                 6.000 Hz     target 6 Hz, bar is 0.2 Hz
    AM at 6 Hz, left        -122.05 dB against a floor of -142.13 dB
    AM at 6 Hz, right       -122.03 dB against a floor of -142.46 dB
    AM at 6 Hz, mono sum      -3.57 dB against a floor of -126.94 dB

That is exactly the binaural signature: neither ear receives any modulation,
and the sum does. It also confirms `.loop/threshold-disputes.md` entry 5 with
this build's own numbers. A4's last clause, which asks for the beat to be
ABSENT from the mono sum, is unsatisfiable for any real binaural pair, because
two carriers a few Hz apart summed are an amplitude modulation at their
difference by simple trigonometry. The tone is off by default, it is a
settings row, and the row says it needs headphones and claims nothing else.

Target frequency and band: 6 Hz, from the theta band, 4 to 8 Hz. Carrier
220 Hz, chosen above the motor fundamental's hover range so the two are
separable.

### A11, per stem levels, each with a measured difference

Four settings rows, each landing on a real bus gain. Motors, on the `full`
trace at the same master level:

    motors 0.2   RMS -20.35 dBFS
    motors 1.0   RMS  -9.47 dBFS
    measured difference 10.88 dB

### P12 and P13, the audio budgets

    AudioNodes, steady state    52   ceiling 64
    audio ms per frame          see the ledger table below

52 nodes: 2 master and soft clip, 3 stem buses, 20 motors, 3 wind, 6 focus,
2 gate cue, 3 crash, 13 bed.

## 6. The cost ledger

Filled in from the run in `.loop/evidence/r11/1080p` and `900p`. See
`ledger-numbers.md` beside this file for the raw output.

The headline: **P1 came in from 692 to 325 draw calls at 1600 by 900, under
the 400 ceiling for the first time.** The obstacles' static parts, their
frames, panels, feet and numbers, now share materials across every obstacle
and bake into the same buckets as the scenery, so eight obstacles cost a
handful of draw calls instead of about two hundred. Mesh count went from 317
to 141. Only the parts that animate per obstacle, the aperture outline, its
halo and its glow, stay live.

P2 is unchanged and still fails: the grass is one unculled mesh spanning the
world and it is 552,000 triangles submitted unconditionally. That is the next
item and it is untouched by this round.

## 7. Engineering integrity

    npm run verify            12 of 13, yaw-coupling the known red
    git diff vendor/betaflight  empty
    git diff HEAD -- tests/     empty
    em dashes and en dashes     none in src/ or scripts/
    GPLv3 headers               present in every file under src/ and scripts/
    console                     errors 0, warnings 0, harness faults 0

The `verify` table is pasted in PROGRESS.md, run in the same turn as this
claim.

## 8. What is owed, honestly

- The A2 three throttle setting sweep against the new graph.
- The A7 cue level advantage in its own band, with the adaptive frame.
- P2, P6, P8, P10 and P11 are untouched by this round and still fail.
- G items other than the scale corrections above are untouched.
- A human still has to listen. The probe can prove the mix does not scream,
  does not clip, sits at the right loudness, runs at the stated tempo and is
  genuinely binaural. It cannot prove it is pleasant.
