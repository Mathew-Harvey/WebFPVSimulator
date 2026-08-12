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
