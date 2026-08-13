# Threshold disputes

Recorded, not acted on. No threshold has been changed. Each entry has a
derivation a human can check.

## 1. P4 punch_to_80pct_climb_ms [150, 400] is unsatisfiable jointly with P4 static_twr max 12 and harness check 7 terminal minimum 30

Climb speed approaches terminal roughly exponentially: v(t) about
vterm (1 - exp(-t / tau)) with tau = vterm / a0 and a0 = g (TWR - 1).
Time to 80 percent of peak is 1.61 tau. With terminal at its harness
floor of 30 m/s and TWR at this gate's own cap of 12, the floor is
1.61 x 30 / (9.81 x 11) = 447 ms, above the 400 ms cap, before battery
sag (real, modelled, band checked by harness check 11) slows it
further. Measured on the honest plant: 572 ms. Reaching 400 ms needs
TWR 14 plus, or terminal under 27, both forbidden by the other bands.
The t80 band appears to have been authored against a definition of
peak climb rate other than the punch's own asymptote, or against a
craft the other two bands forbid.

## 2. P5 zero_to_100_kmh_s [1.3, 1.9] is unsatisfiable jointly with P4 static_twr [8, 12]

27.8 m/s in no less than 1.3 s caps mean horizontal acceleration at
2.18 g. A craft with static TWR 8 tilted 60 degrees produces about
5.5 g horizontal net of gravity before drag; matching 2.18 g mean
requires either TWR near 4.5, which P4 forbids, or frontal drag so
large it drives max level speed under the 120 km/h floor of this same
gate. Measured on the honest plant: 0.76 s, which is what a real 6S
five inch does. The 0 to 100 band appears authored for the old 4.5
TWR plant.

## 3. Context note, harness check 7 vs P5 descent terminal

Climb terminal 30 to 40 (tests/thresholds.json, protected) plus real
TWR forces cda_plan about 2x a bare airframe's, which drags props
level descent terminal to about 20 m/s. The authored P5 descent band
15 to 30 accounts for this; a human revisiting check 7 should know the
two are coupled through one coefficient.

## 4. T3 five distinct obstacle types on the track and T4 reproduce a published UTT are jointly unsatisfiable. BLOCKED WITH ARGUMENT.

T4 offers two branches: reproduce a published UTT diagram and cite it, or
state plainly that the course is an original chapter layout built from
regulation obstacles. T3 requires that the obstacle library exist AND that at
least five distinct obstacle types appear on the track.

Five of the ten published UTT guides have now been downloaded and their
Required boxes read. Every one of them requires one or two obstacle types,
and three of the five forbid flags outright:

| track | Required, verbatim | distinct types |
|---|---|---|
| UTT 3 Bessel Run | "4 standard MultiGP gates and 1 standard MultiGP start/finish timing gate", "No flags allowed." | 2 |
| UTT 4 High Voltage | "4 standard MultiGP gates and 1 standard MultiGP start/finish timing gate", "No flags allowed." | 2 |
| UTT 5 Nautilus | "4 standard MultiGP gates and 1 standard MultiGP start/finish timing gate", "No flags allowed." | 2 |
| UTT 7 Tiny Whutt | "5 Tiny Whoop size gates: 361 sq in (19\"x19\" or 483mm x 483mm)" | 1 |
| UTT 9 MegaUTT | "2 Mega Gates, 4 Flags", and "Gates must have a 12'x12' opening." | 2 |

That is not an accident of which five were read. A Universal Time Trial
exists so that any chapter anywhere can set the same course and compare
times on one leaderboard, which means it has to be reproducible from the
minimum possible equipment list. Using five distinct obstacle types would
defeat the format. The five unchecked guides, UTT 1, 2, 6, 8 and 10, have
JPEG layout pages rather than the extractable rasters the other five use, and
a later round can read them with the method in
.loop/evidence/r10/utt3-layout.md, but the structural argument does not
depend on them.

So T3 and T4's first branch cannot both hold. Adding three obstacle types to
UTT 3 to satisfy T3 stops it being UTT 3, which fails T4. Building UTT 3
faithfully fails T3 by three types. Taking T4's second branch satisfies both
bars at the cost of the course not being a real MultiGP course, which is the
thing the whole T section exists to deliver, and the loop's own text calls
the real layout the better outcome: it says an honest original layout
"passes T4" while a real UTT is what it asks for first.

**No threshold has been changed and neither bar has been softened.** A human
rules on this. There is one reading that satisfies both without weakening
either, and it is offered here rather than taken unilaterally: build UTT 3
Bessel Run exactly, as the timed course, and build the full regulation
obstacle library and place the other types on the site outside the timed
line, as the warm up and practice equipment a real chapter has lying around
a field. Then the obstacle library exists, five or more distinct obstacle
types appear at real dimensions in the world the player flies in, and the
timed course is a legal UTT. Whether "on the track" means the timed line or
the site is the question, and it is not one this loop gets to answer in its
own favour.

Until a human rules, the build takes the reading above, and both the
interface and PROGRESS.md say plainly that the timed course is UTT 3 Bessel
Run and that the additional obstacles are site equipment and not part of it.
T3 stays recorded as BLOCKED WITH ARGUMENT rather than as PASS.

## 5. A4's mono sum criterion is physically unsatisfiable. BLOCKED WITH ARGUMENT.

A4 says: "Two carriers, one per ear, differing by the target beat frequency.
Prove it: FFT the left and right channels separately and show the two carrier
peaks and their difference, within 0.2 Hz of target. Then sum to mono and show
the beat is **not** present as an amplitude modulation, which is what
separates a binaural beat from a monaural one."

The last clause cannot be satisfied by a real binaural pair, and the reason is
trigonometry rather than engineering:

    sin(2 pi f1 t) + sin(2 pi f2 t)
      = 2 sin(2 pi ((f1 + f2) / 2) t) cos(2 pi ((f1 - f2) / 2) t)

which is a carrier at the mean frequency multiplied by an envelope whose
rectified period is 1 / (f1 - f2). Summing two carriers a few Hz apart
produces an amplitude modulation at exactly the difference frequency. That is
not a defect in the signal, it is the definition of a beat.

Measured, not argued. A reviewer synthesised a genuine binaural pair, 200 Hz
in the left ear and 206 Hz in the right, and ran it through this project's own
amplitude modulation detector:

    left channel alone   -63.7 dB at 6 Hz      correctly absent
    right channel alone  -63.7 dB at 6 Hz      correctly absent
    mono sum             -3.63 dB, depth 0.659 a full beat

So a build that satisfied A4's last clause would be a build whose two carriers
are NOT a few Hz apart, which is to say not a binaural tone at all.

What actually separates a binaural beat from a monaural one is where the
carriers are, not what the sum does. A monaural beat puts both carriers in
both ears, so each ear receives the modulation and the percept survives
listening on one speaker. A binaural beat puts one carrier in each ear, so
neither ear receives any modulation and the percept is produced centrally,
which is why it needs headphones. The correct discriminator is therefore:
**both channels individually at their measured noise floor at the beat
frequency, and the mono sum well above that floor.** The first half is
already what A4 asks for.

No threshold has been changed and A4's other clauses are untouched: two
carriers, one per ear, difference within 0.2 Hz of target, off by default,
selectable in settings, a plain headphone notice and no health or performance
claim. All of those will be built and measured.

`.loop/evidence/r10/ledger.md` asserted the opposite of the truth in its round
10 text, "a monaural beat shows in the mono sum, a binaural one does not". That
sentence was wrong when it was written and is corrected in the same file's
corrections section. An implementer building to it would have built something
that is not a binaural beat, which is exactly the kind of error a rubric is
supposed to prevent rather than cause.

A human rules on the last clause. Until then A4 is BLOCKED WITH ARGUMENT and
the build will publish, for every render: the two carrier frequencies and
their difference, each channel's modulation depth at the beat frequency
against that channel's measured floor, and the mono sum's. A reader can then
apply either reading.

## 6. Harness check 10 min_abs_body_yaw_deg = 2.0 is unreachable on a QUADX with an active yaw PID. BLOCKED WITH ARGUMENT.

The owner asked for this check to be fixed. It cannot be, honestly, and the
threshold is NOT changed. Here is the whole argument with the measurements.

**What the check measures.** `tests/lib/checks.js` holds full right roll stick
for 1.0 s at throttle 0.5 from rest, integrates the BODY yaw rate over the
hold, and requires |drift| >= 2.0 deg with a negative sign. Measured on this
build: **-0.079 deg**. The sign is right. The magnitude is 25x short.

**STAGE1.md asks for something this already satisfies.** Its check 10 row
reads "non-zero, correct sign". The 2.0 deg figure is not from STAGE1.md: it
is annotated in `tests/thresholds.json` as a Loop A harness choice, "floor
that makes 'non-zero' in STAGE1.md check 10 measurable". Non-zero and
correctly signed is what the specification asks for and what is delivered.

**Structurally, a symmetric QUADX yaws exactly zero in a roll.** The mixer's
roll column is (-1, -1, +1, +1) over (RR, FR, RL, FL) and the spin column is
(-1, +1, +1, -1). Each roll pair therefore holds one clockwise and one
counter clockwise motor, so for ANY per motor function f of the roll command,
sum over m of SPIN[m] f(roll[m]) = f(-1)(-1+1) + f(+1)(+1-1) = 0. Not
approximately zero and not zero by linearisation: no nonlinearity in thrust,
prop drag, advance ratio, inflow asymmetry or battery can produce it. The
same cancellation kills the prop angular momentum term, since the two pairs
change speed by equal and opposite amounts. This is already written out in
`src/native/plant.c`.

**So the coupling can only come from build asymmetry, and the amount needed
is not a real airframe.** The modelled mechanism is tangential motor cant,
currently (-0.9, +1.4, +0.6, -1.2) deg, whose sum against the roll column is
-1.1 deg. Measured by rebuilding with the whole set scaled:

| cant | measured drift |
|---|---|
| x1 (as shipped) | -0.079 deg |
| x5 | -0.600 deg |
| x25 | -1609 deg, the craft has tumbled and the number is meaningless |

Between x1 and x5 the response is close to linear, so reaching -2.0 deg needs
roughly x13, which is a tangential cant of about (-12, +18, +8, -16) degrees.
A motor mounting face is flat to a fraction of a degree; 15 degrees of thrust
axis cant is visible to the naked eye, costs 3.4 percent of that motor's
vertical thrust, and is not a quad anyone flew.

**The yaw PID is the other half of the reason.** Its I term rejects any
sustained disturbance, so even a large constant yaw bias produces no drift
over a second. The disturbance from cant only exists during the roll
acceleration transient, about 50 ms, and the loop absorbs most of it. That is
also what a real machine does, which is why a real machine's body frame yaw
integral over a roll is small.

**The second candidate mechanism does not close the gap either.** A motor
constant spread breaks the cancellation, because the sum becomes
delta * (ke_RR - ke_FR + ke_RL - ke_FL). At a realistic 2 percent spread and
a 30 A roll differential that is about 0.003 N m against the cant term's
0.008 N m: it changes the answer by tens of percent, not by a factor of 25.

**What a human should decide.** Either restate the band as STAGE1.md words
it, non-zero with the correct sign, which passes today at -0.079 deg; or
change what is measured. The quantity a pilot actually calls "the nose moved
in that roll" is HEADING change, not the body frame integral of r, and the
two are different things: a pure roll about a horizontal axis changes neither,
while a roll combined with the gyroscopic pitch coupling the props really do
produce changes heading with body r near zero. Measuring heading would test
the thing the check is named after. Both options are changes to `tests/`,
which is not the simulator implementer's to edit.
