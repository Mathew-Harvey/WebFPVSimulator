# How each trick is recognised

The catalogue in `src/game/tricks.js` says what a trick is WORTH. The
Tricktionary in `tricktionary-outdoor.json` beside this file says what it IS,
in the owner's own words. This file is the third thing: how the recogniser in
`src/game/trickdetect.js` decides it happened.

It exists because 69 of the 90 outdoor tricks were unreachable and nobody
could see which, or why, or what it would take. A trick with no row here is a
trick nobody has thought about yet.

## What the recogniser can observe

Everything below is built from six measurements and nothing else.

| primitive | what it is | where |
| --- | --- | --- |
| rotation | a run on one body axis, snapped to a quarter turn, with a direction | `closeRun` |
| lap | winding around an obstacle axis, with the side it started on | `closePath` |
| concurrent rotation | net turning on each axis WHILE a lap was flown | `closePath`, `rot` |
| inversion | the fraction of a motion flown belly up | `invertedFrac` |
| tracking | the fraction of a lap with the object on the screen | `trackFrac` |
| tap | a gentle contact during a motion or just after it | `bump`, `tapped` |
| gap | the distance to the nearest solid during a motion | `Colliders.gapAt`, `near` |
| stall | time under `STALL_SPEED` before a motion | `stallBeforeMs` |

A trick is a PATTERN: an ordered list of steps, each describing one
primitive. `matchSteps` decides whether the buffer fits, and `bestMatch`
takes the longest fit, then the cleanest, then the dearest.

## Tolerance, and what never gets it

Nobody flies a trick to the quarter turn. A step may match loosely at a cost
of one slack point, up to `SLACK_MAX` of two, and any slack at all grades the
trick SLOPPY, which is the workbook's own word for "completed, execution too
segmented" and costs 35%. Nothing was widened; a cheaper grade was opened
underneath.

Slack is asymmetric on turn counts: **you cannot complete a trick by doing
less of it.** A 450 degree roll is a Roll flown long. A 270 degree roll is a
`3/4 Roll`, which the workbook prices at 75, and 270 degrees of yaw is a
pilot turning a corner, which is what the whole SINGLES floor exists to keep
silent.

These never slacken, because slackening them turns one trick into a
different one:

- the **axis**. A roll is not a flip.
- the **direction**: `dir`, `sameAs`, `oppTo`. Segmented Flips/Rolls and
  Invert Rewind are the same two half turns and differ only in whether the
  second went back the other way.
- the **kind**. A lap is not a rotation.
- the **side** a lap started from. Over a rail and under it are not a quarter
  turn apart, they are different facts.
- the **tap**. A wall trick that did not touch the wall is MISSED, not sloppy.

## Reachable now: 63 of 90

The loop families are all one shape: a lap around a bar carrying a concurrent
rotation, and what separates them is which rotation and how much. The
workbook says so itself, and the recogniser was already measuring it and
throwing it away on everything but two tricks.

| family | separated by |
| --- | --- |
| Powerloops | a whole lap from under, pitch 1; extra pitch, roll or yaw names the variant |
| Maverick loops | the same lap with pitch 0, flown facing forward |
| Matty flips | half a lap from over; the pitch through it names the variant |
| Splits | half a lap from over carrying a half roll |
| Immelmanns | half a lap from under, then a half roll to level out |
| Pole tricks | laps around a pole, split by inversion and by tracking |
| Wall tricks | a rotation carrying a gentle tap |

## Not reachable, and what each needs

### Needs a new primitive

| trick | needs |
| --- | --- |
| Knife Edge, Reverse Knife Edge, Ninja Star | passing THROUGH a gap. `gapAt` gives a distance to the nearest solid, which is not the same as an aperture with air on both sides |
| Dive | height gained then lost. The detector reads position but keeps no altitude band |
| Stall Rewind | a vertical reversal with no rotation at all. It is a trajectory, not a turn |
| Matty Stall Rewind, Half Matty Stall Rewind, 540 Half Matty Stall Rewind | the same, plus the rotation that follows |
| Slide Disarm, Perch | arm state. The detector is never told the craft disarmed |
| Facepunch | flying at the camera. There is no camera in the physics |
| Burrito Roll | a roll into a rewind back down the same side, which is two laps that share a window and `sameMotionLap` now drops one of |
| Double Dutch | indistinguishable from Side Loop: both are a whole lap from under carrying a roll |

### Needs tracking on a partial lap

`trackFrac` exists and is only asked for on whole orbits. Cradle, Whiplash,
Side-Lock Rewind and Pole Dance are all "keep the object in view while flying
PAST it", which is a partial lap with tracking. This is a small change and
the most valuable of the group: six tricks.

### Ambiguous, and left out on purpose

These cannot be told apart from a trick already implemented, using the
primitives above. Adding them would mean one of the two firing on the other's
flight, which is worse than neither firing.

| trick | indistinguishable from |
| --- | --- |
| Power Swap | Immelmatt. Both are half a lap under, a half roll, half a lap over |
| Reversed Power Flip | Power Flip. They differ only in the SIGN of the flip, and the lap comparison is magnitudes only, deliberately: see CONCURRENT_TOLERANCE |
| 540 Split S | 540 Half Matty, again |

### Complex sequences, not yet written

Power Switch, Beginner Switch, Mavik's Loop, Forani, Split Stall Matty
Rewind, Trippy Switch, Double Rolling Trippy Spin. Each is four or more
steps of primitives that all exist. They are work, not blockers.

## The map is half the recogniser

The town has 888 poles and 79 bars. The seventy ninth is new: a 30 m rail at
2.60 m in the practice field, built because the Jump Rope, the Cinnamon Roll
and the Side Loop are flown over and under a low bar and the town did not have
one. A recogniser cannot name a trick in a world with nothing to fly it
around, and the fastest way to reach the rest of this list may well be to
build the shapes rather than to write the patterns.

What the four wall tricks needed was the same thing in the other direction:
`Colliders.gapAt`. A Wall Ride never touches the wall, so no contact fires,
and a quarter roll out and back is also what banking round a corner looks
like. `hit()` cannot answer it, and was tried: it is a swept intersection
test, so a stationary query returns the query radius rather than a distance.
Measured against the practice field's wall, a point 0.1 m off its face came
back as 2.0 m and a point 0.3 m off it came back as nothing at all.
