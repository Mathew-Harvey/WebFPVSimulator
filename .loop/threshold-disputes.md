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
