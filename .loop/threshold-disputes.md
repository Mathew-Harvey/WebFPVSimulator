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

## 4. T3 five distinct obstacle types and T4 reproduce a published UTT may be jointly unsatisfiable, BLOCKED WITH ARGUMENT pending one check

T4 offers two branches: reproduce a published UTT diagram, or state plainly
that the course is an original chapter layout. T3 requires at least five
distinct obstacle types on the track.

UTT 3 Bessel Run, whose layout this round recovered in full from MultiGP's
own guide, requires exactly two: "4 standard MultiGP gates and 1 standard
MultiGP start/finish timing gate", and states "No flags allowed." Building it
faithfully therefore fails T3 by three obstacle types, and adding three more
obstacle types to it stops it being UTT 3, which fails T4's first branch.
Taking T4's second branch makes both satisfiable, at the cost of not being a
real MultiGP course, which is the thing the T section exists to get.

The tension is real but it is not yet proven impossible. Ten UTTs are
published and only UTT 3's guide has been read. UTT 9 is called MegaUTT and
is the obvious candidate for a layout using towers, ladders, dive gates and
hurdles as well as plain gates. **Before either bar is called impossible, a
round must download the remaining nine guides and count the distinct
obstacle types each one requires.** The method is written down in
.loop/evidence/r10/utt3-layout.md and takes one curl and one raster
extraction per track.

No threshold has been changed. If the count comes back and no published UTT
uses five distinct obstacle types, this entry becomes a real conflict for a
human to rule on, and the honest interim build is the UTT with the most
types, labelled as what it is.
