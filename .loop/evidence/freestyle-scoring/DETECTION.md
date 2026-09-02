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
| tap | a gentle contact during a motion or just either side of it | `bump`, `tapped` |
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

## Reachable now: 57 of 90

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
| Dive | height gained then lost. The detector reads position but keeps no altitude band |
| Stall Rewind | a vertical reversal with no rotation at all. It is a trajectory, not a turn |
| Matty Stall Rewind, Half Matty Stall Rewind, 540 Half Matty Stall Rewind | the same, plus the rotation that follows |
| Knife Edge, Reverse Knife Edge, Ninja Star | passing THROUGH a gap. Nothing measures an aperture |
| Slide Disarm, Perch | arm state. The detector is never told the craft disarmed |
| Facepunch | flying at the camera. There is no camera in the physics |
| Jump Rope, Cinnamon Roll, Burrito Roll, Double Dutch | a lap over an object entered sideways. The lap machinery handles it, but the town has no obstacle a jump rope is flown over |

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
| 540 Split S | 540 Half Matty. Both are a 540 roll into half a lap from over |
| Power Swap | Immelmatt. Both are half a lap under, a half roll, half a lap over |
| Reversed Power Flip | Power Flip. They differ only in the SIGN of the flip, and the lap comparison is magnitudes only, deliberately: see CONCURRENT_TOLERANCE |
| Wall Ride, Loop Tap, Reverse Wall Ride, Downtown Tap | each is a quarter turn plus a contact, which is what happens every time a pilot clips something while turning |

### Complex sequences, not yet written

Power Switch, Beginner Switch, Mavik's Loop, Forani, Split Stall Matty
Rewind, Trippy Switch, Double Rolling Trippy Spin. Each is four or more
steps of primitives that all exist. They are work, not blockers.

## The thing that is not in this file

The town has 886 poles and 78 bars, and no obstacle that a Jump Rope is flown
over. A recogniser cannot name a trick in a world that has nothing to fly it
around. Coverage of the catalogue is bounded by the map as much as by this
file.
