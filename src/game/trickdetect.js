/*
 * trickdetect.js: what the pilot just did, named.
 *
 * THE PROBLEM. Tony Hawk knows what trick you did because you pressed the
 * button for it. An FPV quad has four analogue channels and no trick button,
 * so the trick has to be READ BACK out of the flight. This file reads it.
 *
 * THE METHOD, and it is deliberately the dullest one that works. Betaflight
 * and the plant already agree on body angular rate, p q r in rad/s, and a
 * trick in the freestyle vocabulary is almost always a whole number of
 * quarter turns about ONE body axis. So:
 *
 *   1. Integrate each body rate into a signed angle. A "run" opens when the
 *      rate crosses RATE_ON and closes when it falls under RATE_OFF and
 *      stays there, or when it changes sign.
 *   2. On close, divide by a turn and snap to the nearest quarter. The
 *      craft's own attitude at that moment settles the ambiguous cases: a
 *      roll that ends upright is a whole number of turns and a roll that
 *      ends inverted is a half, whatever the integral says to three decimal
 *      places. That check is what makes this robust to a pilot who
 *      overshoots, which is every pilot.
 *   3. That is a PRIMITIVE: one axis, a signed quarter-turn count, a start
 *      and end time, and how long the craft was stalled before it began.
 *   4. Match a buffer of primitives against a table of patterns, longest
 *      first. Three primitives reading half roll, whole flip, half roll the
 *      same way round is a Rubik's Cube and is worth 325, where the same
 *      three scored separately are worth 200. Longest match wins, which is
 *      the whole reason the buffer exists.
 *
 * WHY INTEGRATING RATE AND NOT READING THE QUATERNION. Body rotations do not
 * commute, so this integral is not the geometric angle when two axes move at
 * once, and it drifts on a badly coordinated trick. That is not a defect
 * here: it is what the pilot's own gyro sees, it is what an OSD flip counter
 * counts, and it is what a judge watching the video counts. A quaternion
 * difference cannot tell a 360 roll from a 720 at all, because both end
 * level. Counting is the right operation.
 *
 * WHAT THIS DOES NOT DO YET, and none of it is hidden. Everything in the
 * catalogue that needs to know about an OBSTACLE is out of reach: a
 * Powerloop is a flip around something, a Matty is a flip over something, a
 * Wall Tap needs a wall. The catalogue carries all 90 of them; this file
 * recognises the ones that are pure air. Obstacle awareness is stage 2 and
 * the shape it needs is written down in PROGRESS.md. A trick this file
 * cannot name is not scored, rather than being scored as something else.
 *
 * NO TRIGONOMETRY. There is not a sin, cos, atan or pow in this file. The
 * attitude test is one polynomial in the quaternion's components and the
 * turn count is a division by a constant, so the same recording names the
 * same tricks in Node and in a browser, which is what makes the self-test in
 * scripts/score-selftest.js mean anything.
 *
 * Units: SI in, per CLAUDE.md. Rates are rad/s, times are seconds at the
 * boundary and milliseconds inside where a threshold reads better as 500
 * than as 0.5. Rotation is counted in TURNS.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { OB_BAR, OB_KIND_NAME, OB_POLE, sameAxis } from './obstacles.js';
/*
 * The line between a graze and a real hit, borrowed rather than redrawn.
 * collide.js already decides at 4 m/s of velocity change that a contact is
 * a graze, and a DELIBERATE tap is exactly a graze: the workbook says
 * "gently tap the wall". Inventing a second number here would be the third
 * threshold on the same question that the ground path's own comment warns
 * about, and nobody would be able to defend it six months later.
 */
import { GRAZE_SPEED_MAX } from './collide.js';
/*
 * The catalogue, for its PRICES ONLY, and only where two patterns of the
 * same length both describe the motion in the buffer. Nothing here repeats
 * a number the catalogue holds: bestMatch asks it which of two names is
 * worth more, and singleFor asks nothing at all. The split the header
 * describes, this file names a trick and tricks.js prices it, is intact.
 */
import { trickPoints } from './tricks.js';

/* One turn, in radians. Written out rather than 2 * Math.PI so that the
 * constant in the file is the constant in the arithmetic. */
const TURN = 6.283185307179586;

export const AXIS_ROLL = 0;
export const AXIS_PITCH = 1;
export const AXIS_YAW = 2;
export const AXIS_NAME = ['roll', 'pitch', 'yaw'];

/*
 * Where a rotation starts and stops counting.
 *
 * RATE_ON is 3.0 rad/s, 172 deg/s, which on Betaflight's default rates is
 * about 48% of roll stick and turns 360 degrees in 2.1 seconds. RATE_OFF is
 * 1.2 rad/s with a hold, so the brief dip through the middle of a two turn
 * flip does not saw one primitive into two.
 *
 * THE FLOOR WAS SWEPT ON THE REAL AIRCRAFT RATHER THAN GUESSED, and the
 * answer was to leave it alone. Lower is tempting, because a deliberately
 * slow roll under 172 deg/s currently scores nothing. Measured through
 * dist/sim.wasm at 3.0, 2.2, 1.8, 1.4 and 1.0:
 *
 *   every setting stayed silent through ten seconds of twitchy cruising,
 *   six hard corners, a punch out and a slow circling turn at 49 deg/s;
 *   at 1.8 and below, a COORDINATED CIRCLING TURN at 109 deg/s started
 *   scoring a Yaw Spin, which is a pilot being handed points for flying
 *   round a corner;
 *   and 2.2, the last setting that survived, buys only the narrow band of
 *   rolls between 126 and 172 deg/s while leaving a 16% margin against
 *   that circling case, where 3.0 leaves 58%.
 *
 * A false positive is far worse than a missed slow roll: a score that goes
 * up for ordinary flying stops meaning anything. So the floor stays at 3.0,
 * and scripts/score-selftest.js now flies the circling case every run so
 * that anybody who lowers this finds out immediately.
 */
const RATE_ON = 3.0;
const RATE_OFF = 1.2;
const RATE_OFF_HOLD_MS = 90;

/*
 * A rotation smaller than an eighth of a turn is a correction, not a trick.
 * This is the floor under the quarter-turn snap: it rejects the run before
 * the snap can round it up to a quarter.
 */
const MIN_TURNS = 0.125;

/*
 * How far the integral may sit from the quarter it is snapped to. 0.2 turns
 * is 72 degrees, which sounds enormous until you remember what it is for:
 * the snap has already been told which residue class to land in by the
 * craft's attitude, so this only has to bridge the gap between two
 * candidates a half turn apart. Anything further out than this is not a
 * trick that was flown badly, it is a manoeuvre that is not a trick.
 */
const SNAP_TOLERANCE = 0.2;

/*
 * The stall, which several tricks are defined in terms of. A quad that has
 * run out of momentum at the top of a climb is doing under 2.5 m/s and it is
 * the pause a judge sees. The workbook asks for half a second of it in a
 * Segmented Flip.
 */
const STALL_SPEED = 2.5;

/*
 * How long the matcher waits, after a primitive closes, for the primitive
 * that would make it part of something bigger.
 *
 * It only ever waits when a longer pattern is actually still reachable, so a
 * plain 360 roll names itself the instant it stops: no pattern in the table
 * begins with a whole roll. A HALF roll waits, because four patterns begin
 * with one. 450 ms is about as long as a pilot takes to set up the second
 * half of a Rubik's Cube and short enough that the name still lands while
 * the quad is where the trick happened.
 */
const SETTLE_MS = 450;

/*
 * THE PATH SIDE: winding around an obstacle.
 *
 * PATH_RATE_ON is 0.35 turns per second, one full lap in under three
 * seconds. Below that the craft is flying past an object rather than
 * around it, and a pilot who cruises down a fence line at four metres
 * subtends a slow drift of angle that must not read as half a powerloop.
 * PATH_RATE_OFF is where the winding stops counting, with the same hold
 * the rotation runs use.
 *
 * PATH_MIN_RADIUS guards the arithmetic rather than the game: the winding
 * rate goes to infinity at the axis itself, so a craft that flies straight
 * through a railing counts nothing rather than counting a spike.
 */
/*
 * THE RATE GATE WAS IN THE WRONG UNIT, AND IT MADE THE ORBIT IMPOSSIBLE.
 *
 * Angular rate is tangential speed OVER RADIUS, so a threshold written in
 * turns per second says "the wider the circle, the faster you must fly".
 * That is backwards: a wide orbit is the harder trick, not the lesser one.
 * At 0.35 turns/s a lap had to close in 2.9 seconds, which a powerloop does
 * and NO ORBIT EVER DOES. Measured, two laps of a pole: 5.0 s named Orbit
 * x2 ten times out of ten, 7.0 s named NOTHING ten times out of ten, at
 * every radius from 3 to 12 m and with up to 50 degrees of nose wander. The
 * cutoff sat exactly on 0.35 turns/s and had nothing to do with how well
 * the orbit was flown. That is the owner's "orbits and trippy spin are not
 * picking up at all", and it was never a tolerance problem.
 *
 * So the opening test is now the two questions separately. PATH_RATE_ON is
 * only "is this going round at all", low enough for a 12 second lap, and
 * PATH_TANGENT_ON is the one with the physics in it: metres per second
 * around the axis, which a craft hovering beside a post and drifting cannot
 * reach and a craft flying round it always can, at any radius.
 *
 * The floors that actually keep a fly past out are the WINDING TOTALS, not
 * this: a straight line subtends strictly less than half a turn about any
 * point off it, and POLE_MIN_TURNS, HALF_LAP_MIN and WHOLE_LAP_MIN are all
 * above that. The rate gate never was the discriminator. It was only ever
 * a proxy, and the proxy was wrong.
 */
const PATH_RATE_ON = 0.08;
const PATH_TANGENT_ON = 2.5;
/*
 * GOING ROUND IT versus GOING AT IT, and this is the test that tells them
 * apart at any radius.
 *
 * Angular rate cannot: it is high on a close fly past and low on a wide
 * orbit, which is the wrong way round twice over. But a craft CIRCLING
 * holds its distance to the axis and a craft arriving or leaving does not,
 * so compare the speed around the axis with the speed towards or away from
 * it. On a lap the radius barely breathes and the ratio is enormous; on a
 * departure the motion is nearly all radial and the ratio collapses.
 *
 * This is what stops a slow drift away from a rail carrying the lap's high
 * water mark out with it. Measured on a flown loop around a real rail: the
 * loop wound 1.06 turns from under and back to under, and without this the
 * winding kept creeping forward as the craft flew off, reaching 1.111
 * turns with the far side of the rail underneath it. Start side under, end
 * side over, which is a HALF lap, which is not a whole one, and the flown
 * Powerloop came out as a bare Flip.
 */
const PATH_TANGENT_RATIO = 1.0;
/*
 * PATH_RATE_OFF is a floor under "still going round", and it has to sit
 * below the slowest orbit anybody flies and above nothing at all. A two lap
 * orbit taking forty seconds still winds at 0.05 turns/s. It is NOT the
 * reversal test any more, so it does not have to be brave: PATH_REVERSE_TURNS
 * ends an out and back, and this only ends a lap the craft has simply
 * stopped flying.
 *
 * The hold stays at the 220 ms the rotation runs use. It was briefly 700,
 * which is long enough for the lap to close AFTER the rotations inside it
 * have already settled and been matched on their own: an Immelmann came out
 * as its own half loop, unnamed, plus a Juicy Flick.
 */
/*
 * AND IT HAS TO SIT BELOW PATH_RATE_ON, WHICH IT DID NOT.
 *
 * It was 0.12 against an ON gate of 0.08, so the pair was INVERTED: a lap
 * could open at a winding rate the very next millisecond was entitled to
 * close it. Every other run in this file has the hysteresis the right way
 * round, RATE_ON 3.0 against RATE_OFF 1.2, and the comment above this one
 * has said all along that the off gate "has to sit below the slowest orbit
 * anybody flies" and that "a two lap orbit taking forty seconds still winds
 * at 0.05 turns/s". 0.12 is not below 0.05. When PATH_RATE_ON came down from
 * 0.35 to 0.08 to make the orbit reachable at all, this half of the pair was
 * left where it was.
 *
 * What it costs is the WIDE SLOW orbit, which is the harder trick and the
 * one a pilot is proud of. Measured on the real aircraft round the training
 * park's mast, two laps at 8 m:
 *
 *   5.0 s a lap   winds 0.20 turns/s   one run of 2.41 turns   Orbit x2
 *   7.0 s a lap   winds 0.14 turns/s   THIRTEEN fragments, the
 *                                      longest 1.00 turns       nothing
 *
 * At 7 s the rate sits 19 percent over the off gate, so an ordinary wobble
 * dips under it, the 220 ms hold expires and the lap closes; the next one
 * opens immediately and closes again. The fragments in that trace are 220
 * samples long, which is the hold exactly.
 *
 * 0.04 is half the ON gate, below the 0.05 the comment above cites for a
 * forty second orbit, and above nothing at all. Nothing else loosens: what
 * keeps a fly past out is the WINDING TOTALS, which this file has said from
 * the first version, and `circling` still has to hold for a millisecond to
 * be counted at all.
 */
const PATH_RATE_OFF = 0.04;
const PATH_OFF_HOLD_MS = 220;
const PATH_MIN_RADIUS = 0.45;
/*
 * A REVERSAL IS MEASURED IN TURNS, NOT IN AN INSTANT.
 *
 * Out and back is not a lap and must end one. The old test compared the
 * filtered rate's SIGN against the lap's, which is a fair test at 0.35
 * turns/s and a coin toss at 0.08: a human holds nothing steady, and the
 * top of a real powerloop is a float where the craft is barely winding at
 * all and the sign is whatever the last wobble said. Accumulated backward
 * winding does not care about wobble, because a wobble cancels itself and
 * a genuine reversal does not. 0.12 turns is 43 degrees of going back the
 * way you came.
 */
const PATH_REVERSE_TURNS = 0.08;
/* A lap cannot run forever: past this it is drift, not a trick. */
const PATH_MAX_MS = 20000;
/*
 * Whether the lap's axis lies clearly enough along ONE body axis for the
 * loop's own turn to be attributed to it.
 *
 * DEBANK_MIN_OWN is measured PER SAMPLE, and that is what makes an absolute
 * number safe here. 0.9 is a rail lying within 26 degrees of square to the
 * nose for the whole lap, which is what flying a loop on the pitch axis
 * means. A craft rolling about its nose keeps the rail permanently across it
 * and reads 1.0 the whole way round; a craft YAWING through the lap swings
 * the rail between the nose and the wing and reads about 0.83, which is a
 * rail sitting 56 degrees from the nose on average and is not square to
 * anything.
 *
 * An earlier version put a floor of 0.72 on the SIGNED AVERAGE instead, and
 * that is a different quantity: a roll makes the signed components average
 * towards nothing while the per sample magnitude stays at one, so the floor
 * threw away a 450 point Power Roll on every sample of the sweep. The
 * quantity was the mistake, not the idea of a floor.
 *
 * DEBANK_MARGIN is how far ahead the winner has to be of the other
 * candidate: at a margin of one they would be equally entitled and there is
 * no answer to give, so 1.5 asks for a clear one.
 */
/*
 * A FLOOR THAT REJECTS NOISE, NOT ONE THAT CERTIFIES A SUBTRACTION.
 *
 * At 0.9 this was doing a job it no longer has. While the loop's own turn
 * was taken off as a lump scaled by the MEAN alignment, a high mean was
 * what made the subtraction valid at all, so the floor had to be near one.
 * PathRun.resid takes it off per sample and never touches the mean, so the
 * mean's only remaining job is saying WHICH body axis the turn goes back
 * on, and that is a comparison between two candidates, which the margin
 * test makes. What is left for a floor is refusing an answer drawn from
 * noise.
 *
 * 0.9 refused real readings. An Inverted 360 Powerloop owns 0.87 and a
 * Split Yaw 0.89, both of them plain wins over their other candidate, and
 * both fell back to the raw body integral: 650 and 300 points that could
 * not be scored. Half is the point where the winning axis carries more of
 * the rail's direction than everything else put together, which is a
 * statement about the reading rather than about any one trick.
 *
 * AND IT STAYS AT 0.9 ANYWAY, because the argument above is sound and the
 * measurement still says no. At 0.5 the sweep names 41 of 47 rather than
 * 37, and one of the four it gains is paid for by a Cinnamon Roll that
 * over-claims on a third of its samples: its ownership pair is 0.64 against
 * 0.63, a tie its margin test refuses at bank 0 and lets through at other
 * banks, and what comes out the far side is a dearer trick nobody flew.
 * Four more tricks named is not worth one trick lied about.
 *
 * What this is really waiting on is a better ownership test, one that can
 * tell a genuine tie from a clear win without leaning on an absolute floor
 * to cover for it. Until there is one the floor stays where the evidence
 * puts it.
 */
const DEBANK_MIN_OWN = 0.5;
const DEBANK_MARGIN = 1.5;

/*
 * The floors on a lap, and both come from the straight line theorem written
 * out on snapPathTurns: a straight line subtends strictly less than half a
 * turn about any point off it, so nothing at or under half a turn is
 * evidence of having gone around anything.
 *
 * HALF_LAP_MIN is 0.55: above the theorem's 0.5, below the 0.61 an honest
 * flown Immelmann reads, and well above the 0.463 the worst false positive
 * reached. WHOLE_LAP_MIN is 0.65, unchanged in effect from the old band
 * around a whole turn.
 *
 * POLE_MIN_TURNS is the same bound for an axis that has no sides to check.
 */
const HALF_LAP_MIN = 0.55;

/*
 * THE HALF LAP IS STILL MARGINAL AND THIS IS THE INSTRUMENT, NOT THE FIX.
 *
 * The straight line theorem cannot separate the two populations AT the half
 * turn, and the floor above pretends it can. A straight line's supremum is
 * half a turn and it never reaches it, but a PERFECT half loop centred on
 * the axis sweeps EXACTLY half a turn, so the honest loop and the dishonest
 * fly-by meet at the same number from opposite sides. Measured on real city
 * bars, a clean Split-S reads anywhere from 0.50 to 0.612 turns depending
 * only on where the craft entered the loop, so a tightly flown, well centred
 * one is thrown away and a loose one is kept. That is the same "a better
 * flown trick scoring less than a worse one" failure snapPathTurns already
 * records once.
 *
 * The radius is the quantity that should decide it. Going AROUND something
 * means staying at roughly one distance from it: measured on twelve real
 * city bars, a flown half loop breathes between 1.41 and 1.59, max over
 * min. Going PAST something means the distance has a sharp minimum at the
 * closest approach and grows at both ends, which is the theorem's own fact
 * said in a quantity that does not run out at a half turn.
 *
 * SO WHY IS THE FLOOR STILL 0.55. Because lowering it means the ratio has
 * to carry the weight instead, and the three flights it would have to
 * reject were measured on the REAL AIRCRAFT, not constructed: a ballistic
 * fall past a railing at 0.463, a straight descending pass at 0.500, a
 * straight climb at 0.377. Their radius ratios have not been measured. A
 * constructed straight pass does not reproduce them, because the rate gate
 * throws it out before it becomes a lap at all, so the number cannot be
 * had from a rig. Setting the threshold without it would be picking a
 * number to make a check pass, and then editing the checks that measured
 * those flights to accommodate it.
 *
 * The ratio is therefore TRACKED and carried out on every lap, and nothing
 * reads it yet. Fly the three cases on the real aircraft, read
 * `radiusRatio` off the primitive, and if the populations separate the
 * floor can come down to 0.45 in one line with the evidence beside it.
 */
const WHOLE_LAP_MIN = 0.65;
const POLE_MIN_TURNS = 0.55;

/*
 * How much of a motion must be flown belly up for it to count as an
 * inverted trick.
 *
 * ONE BAR FOR BOTH KINDS, laps and rotations alike, because the question is
 * the same question: was the craft on its back while it did this, or did it
 * merely pass through inverted on the way somewhere. Measured: the upright
 * orbit that was wrongly named a Trippy Spin had a lap window whose upZ
 * never went below +0.379, so its inverted fraction is zero. A genuine
 * inverted orbit is inverted throughout. Four fifths leaves room for the
 * roll in and the roll out.
 *
 * A rotation carries no roll in and no roll out, because the roll that
 * put the craft on its back is a run on a DIFFERENT axis and closed before
 * this one opened. So four fifths is if anything generous for a yaw spin,
 * and the slack it leaves is for a pilot who is still settling the roll
 * as the yaw begins.
 */
/*
 * HOW MUCH OF A LAP HAS TO BE FLOWN BELLY UP, and 0.8 is more than the
 * physics allows.
 *
 * A quadcopter is inverted exactly when its thrust axis points below the
 * horizon, and thrust points down only when the WANTED force does, which
 * needs a downward acceleration greater than gravity. So an inverted lap is
 * a fall, it is expensive in altitude, and it cannot begin or end inverted:
 * the craft has to roll in and roll out, and those ends are upright.
 *
 * Flown, in the town, a genuine inverted lap of a post at 1.3 g of fall
 * came out 0.61 belly up and named nothing. Two whole inverted laps are not
 * a tuning problem at all: at that rate they cost about eighty metres of
 * altitude and the training park is thirty four metres tall.
 *
 * 0.55 is above every UPRIGHT pole lap measured, which read 0.00, and this
 * is only ever asked of a pole: the bar families tell over from under with
 * the lap's own sides instead, which is just as well, because a Powerloop
 * is inverted across the top of itself and measured as high as 0.51.
 */
const INVERTED_MIN = 0.55;

/*
 * HOW SHORT A LAP READS, and this is the number that made Orbit x2 and
 * Trippy Spin x2 unreachable in flight.
 *
 * A rotation is a closed quantity and a lap is not: the winding rate gate
 * opens a fifth of the way into the loop and shuts before the craft has
 * finished coming out of it, so a lap always reads SHORT by whatever the
 * gate truncated, and how much depends on the radius and on where the
 * craft entered. Measured on the constructed two lap orbits in
 * scripts/score-selftest.js, a commanded 2.00 turns reads:
 *
 *   radius 1.5 m   1.772 turns    snapped 1.75
 *   radius 2.5 m   1.802 turns    snapped 1.75
 *   radius 3.5 m   1.875 turns    snapped 2.00
 *   radius 5.0 m   1.904 turns    snapped 2.00
 *
 * The pattern demanded EXACTLY 2, so the same trick round the same post
 * scored 500 points or nothing at all depending on how close the pilot
 * flew, and three or four laps scored nothing at all because nothing names
 * a 3. That is not a tuning problem, it is an equality test applied to a
 * measurement that is systematically biased low.
 *
 * So a pole pattern asks for a lap count as a FLOOR, `turnsAtLeast`, and
 * this is how far under the floor a lap may read and still count. A quarter
 * turn is the snap resolution, so it is the smallest step that can mean
 * anything, and it covers every reading above.
 *
 * A BAR still asks for an exact `turns` and is right to. Its parity is a
 * topological fact rather than an estimate: the craft went in over the rail
 * and came out under it, so it crossed that plane an odd number of times,
 * so the answer IS a half integer and the nearest one names it. See
 * snapPathTurns, which argues this at length. A pole has no sides and so
 * has no parity to lean on, which is why it is the one that needs a floor.
 *
 * This replaces PATH_SNAP_TOLERANCE, which sat here at 0.35 and was read by
 * nothing: it is the ghost of the version that knew a lap was not a closed
 * quantity, left behind when the bar snap moved to parity.
 */
const LAP_TRUNCATION = 0.25;

/*
 * How many obstacles may be wound around at once.
 *
 * IT WAS SIX, and the comment under it said "the craft is inside the reach
 * of one to four axes in ordinary flight and of six only in the densest
 * street furniture". Re-measured on the town that exists now, standing four
 * metres under each of forty real bars, which is exactly where a powerloop
 * passes:
 *
 *   obstacles within reach   1 1 1 2 2 2 3 4 4 4 4 4 5 5 6 6 6 6 6 6 6
 *                            9 10 11 12 12 14 16 16 17 18 18 18 20 23
 *                            23 23 29 29 30
 *
 * Nineteen of the forty are over the old cap and the worst is thirty. The
 * town has 886 poles against 78 bars, so a railing is nearly always
 * surrounded by fence posts, lamp posts and tree trunks that are NEARER
 * than it is. Nearest first then drops the one thing in reach that a
 * Powerloop, a Matty Flip or a Split-S can be flown around, and keeps six
 * poles the pilot is flying past.
 *
 * Thirty two covers every case measured. The cost is one stepOneLap per
 * engaged axis per millisecond, which is a cross product, a dot product and
 * two square roots: at thirty two axes that is about a thousand flops per
 * millisecond, against the plant's own thousands. It is not the reason this
 * was six.
 */
const MAX_PATH_RUNS = 32;

/*
 * TRACKING: how near the nose an object has to be to count as being flown
 * AROUND rather than merely flown past, and for how much of the lap.
 *
 * An Orbit is defined by keeping the object centred on the screen. The
 * first version of the pattern tried to test that with the concurrent YAW,
 * on the reasoning that holding an object centred through a full circle is
 * a 360 of yaw. That reasoning is sound and its converse, which the pattern
 * actually relied on, is false: heading rotates once per lap in ANY steady
 * circle, wherever the nose points. Measured, an ordinary coordinated turn
 * flown twice round a lamp post with the nose on the FLIGHT PATH, the post
 * sitting 88.9 degrees off the nose and off the edge of any FPV frame the
 * whole way, read concurrent yaw 1.86 and was named Orbit x2. The nose-in
 * and nose-forward flights differed by 0.00 turns of yaw to two decimals.
 *
 * So tracking is measured directly, as the angle between where the craft is
 * pointing and where the object is.
 *
 * 0.55 is 57 degrees, and it is the LENS. The first number here was 0.77,
 * about 40 degrees, written down as "roughly an FPV camera's half angle".
 * That is not what an FPV camera is: a 150 degree diagonal lens on a 4:3
 * sensor sees about 120 degrees across, which is sixty either side of the
 * nose, and forty is well inside the frame rather than the edge of it.
 *
 * Measured, flown: an orbit tracked to within 1.2 m of a 5.5 m circle held
 * the post between 37 and 45 degrees off the nose for two whole laps, which
 * is an orbit by any reading and is a post sitting comfortably on screen.
 * At 0.77 it counted for 7 percent of the lap and the trick named nothing.
 *
 * The false positive this exists to refuse is nowhere near the new line
 * either: the coordinated turn that first broke the yaw based version had
 * the post 88.9 degrees off the nose, off the edge of any lens there is.
 */
const TRACK_DOT = 0.55;
const TRACK_LAP_MIN = 0.7;
const PATH_MIN_TURNS = 0.375;

/*
 * HOW FAR BACK A LAP'S BEGINNING IS LOOKED FOR, in milliseconds.
 *
 * The winding rate ramps up: a powerloop starts as a shallow arc and only
 * becomes a lap once the craft is committed. Measured on the real aircraft,
 * the rate gate opens about a fifth of the way into the loop, and by then
 * the craft has already crossed from under the rail to over it. Read
 * naively, the lap then says it started ABOVE the bar and ended above it,
 * which for a full powerloop still gives the right parity by luck, and for
 * every half lap trick, an Immelmann, a Matty, a Split-S, gives the wrong
 * one and loses the trick.
 *
 * So the run keeps a rolling snapshot of the last 800 ms and, when it
 * opens, backdates itself to the oldest one: the winding, the side, the
 * time and the rotation totals all come from there. 800 ms is comfortably
 * longer than the ramp and comfortably shorter than a whole lap, so a lap
 * can never backdate into the previous one.
 *
 * The buffer holds one entry per STEP and the shell steps at exactly 1 kHz,
 * so entries and milliseconds are the same thing here. See sim_abi.h.
 */
const PATH_LOOKBACK = 800;

/*
 * How far a concurrent rotation may sit from what a pattern asks for.
 *
 * A powerloop's flip is not a clean 360: the craft is being flown round an
 * object at the same time, the pilot is holding an attitude relative to it
 * rather than counting degrees, and the plant is fighting gravity through
 * the top. Measured, a flown powerloop's concurrent pitch reads 1.01 turns.
 *
 * A quarter turn is the widest this can be and still tell 0 from 0.5, which
 * is the only distinction these patterns need: a Powerloop flips through
 * the loop and a Maverick Loop does not, a Matty Flip half flips over the
 * object and a Beginner Matty does not.
 *
 * MAGNITUDES ONLY, never signs. The sign of a lap depends on which way the
 * obstacle's axis happens to be written down, and the sign of a rotation on
 * which way the craft was facing when it started, so a pattern that
 * compared them would name a trick flown left to right and refuse the same
 * trick flown right to left. What separates these tricks is HOW MUCH the
 * craft rotated while it went round, not which way.
 */
const CONCURRENT_TOLERANCE = 0.25;

/*
 * How near a rotation a contact has to be to be part of it.
 *
 * A wall tap is flown as one motion: pitch back, touch, pitch forward. The
 * touch can land a little before the rotation the pattern hangs it on
 * opens, because the craft is already moving toward the wall, or a little
 * after it closes, because the rotation finished and the craft coasted the
 * last few centimetres. A fifth of a second either side covers both and is
 * well under the settle window, so a tap cannot reach across a gap into the
 * next trick.
 */
const TAP_WINDOW_MS = 200;

/*
 * Dead time inside a trick before it stops being one motion. The workbook's
 * word for that is SLOPPY and it costs 35%: "lacks constant loop motion,
 * execution is too segmented". A pattern step that ASKS for a stall does not
 * pay for it, which is why Segmented Flips/Rolls is not sloppy by
 * definition.
 */
const SLOPPY_GAP_MS = 600;

/*
 * THE PATTERNS.
 *
 * Every `name` must exist in src/game/tricks.js; scripts/score-selftest.js
 * asserts it, so a typo here fails a check rather than silently scoring
 * zero. Points are NOT repeated here. This file names the trick; the
 * catalogue prices it. That split is the whole reason the workbook can be
 * re-read without touching the recogniser.
 *
 * A step matches one primitive:
 *   axis      the axis it must be, by name
 *   axisIn    a set it must be one of, when the trick allows either
 *   axisAs    it must be the same axis as the step at this index
 *   turns     the exact snapped turn count
 *   turnsAtLeast  a FLOOR on the snapped count instead of an exact reading,
 *             slackened by LAP_TRUNCATION. Poles only, and the comment on
 *             that constant is why
 *   inverted  true if the motion must have been flown belly up, false if it
 *             must not have been. Judged over the whole motion, not at its
 *             end: see INVERTED_MIN
 *   sameAs    same direction as the step at this index
 *   oppTo     opposite direction to the step at this index
 *   dir       an absolute direction, +1 or -1, in the body-rate sign
 *             convention of sim_abi.h: +p rolls right, +q pitches the nose
 *             DOWN, +r yaws the nose left
 *   stallMs   at least this much stall between the previous step and this one
 *
 * Order matters only in that longest wins; within a length, the higher
 * scoring pattern wins, which is decided by the catalogue at match time.
 */
export const PATTERNS = [
  /* Three step patterns. These have to be tried before their own prefixes,
   * and the matcher does that by length, not by position in this list. */
  {
    name: "Rubik's Cube",
    steps: [
      { axis: 'roll', turns: 0.5 },
      { axis: 'pitch', turns: 1 },
      { axis: 'roll', turns: 0.5, sameAs: 0 },
    ],
  },
  {
    name: "Cubik's Rube",
    steps: [
      { axis: 'pitch', turns: 0.5 },
      { axis: 'roll', turns: 1 },
      { axis: 'pitch', turns: 0.5, sameAs: 0 },
    ],
  },
  {
    /* Sharp 180 yaw, a 360 roll as the quad starts moving backward, then
     * 180 yaw the same way to finish. */
    name: 'Vanny Roll',
    steps: [
      { axis: 'yaw', turns: 0.5 },
      { axis: 'roll', turns: 1 },
      { axis: 'yaw', turns: 0.5, sameAs: 0 },
    ],
  },

  /* Two step patterns. */
  {
    /* 180 into a stall of at least half a second, then another 180 the same
     * way. The stall is the trick. */
    name: 'Segmented Flips/Rolls',
    steps: [
      { axisIn: ['roll', 'pitch'], turns: 0.5 },
      { axisAs: 0, turns: 0.5, sameAs: 0, stallMs: 500 },
    ],
  },
  {
    /* 180 one way, straight back the other. */
    name: 'Invert Rewind',
    steps: [
      { axisIn: ['roll', 'pitch'], turns: 0.5 },
      { axisAs: 0, turns: 0.5, oppTo: 0 },
    ],
  },
  {
    /* Pitch FORWARD to inverted under power, then roll out. +q is nose
     * down, so the flick is +1. */
    name: 'Juicy Flick',
    steps: [
      { axis: 'pitch', turns: 0.5, dir: 1 },
      { axis: 'roll', turns: 0.5 },
    ],
  },
  {
    /* The same shape pitched BACKWARD, which is a different trick with the
     * same price. Under an object in the workbook's description; in the air
     * it is still the only thing this shape can be. */
    name: 'Snapback',
    steps: [
      { axis: 'pitch', turns: 0.5, dir: -1 },
      { axis: 'roll', turns: 0.5 },
    ],
  },

  /*
   * THE OBSTACLE TRICKS.
   *
   * A `path` step matches a LAP: the craft's position winding round an
   * obstacle's axis. `from` is which side of a bar the lap began on, under
   * it or over it, which is a fact about geometry and not about the pilot.
   * `rot` is how much the craft rotated on each axis WHILE it went round,
   * in turns, as a magnitude.
   *
   * Those three numbers separate the whole family. Every one of these is a
   * lap of one half or one whole turn around the same rail; what makes them
   * different tricks is where the lap started and what the craft was doing
   * while it flew.
   *
   *   under, whole lap, flipped     Powerloop
   *   under, whole lap, upright     Maverick Loop
   *   under, half lap, half flip    Immelmann, once the roll lands
   *   over,  half lap, half flip    Matty Flip
   *   over,  half lap, and a roll   Split-S
   *   over,  half lap, upright      Beginner Matty
   *
   * Two step entries come first so a half lap that is followed by the roll
   * that completes an Immelmann is not named a bare half loop first.
   */
  {
    /* "Begin a Powerloop, but at the peak execute a rapid 180 Roll." Half
     * a loop from under the object to over it, then the roll. */
    name: 'Immelmann Turn',
    steps: [
      { path: 'bar', turns: 0.5, from: 'under', rot: { pitch: 0.5 } },
      { axis: 'roll', turns: 0.5 },
    ],
  },
  {
    /* Under the object, all the way round it, flipping with the loop. */
    name: 'Powerloop',
    steps: [{ path: 'bar', turns: 1, from: 'under', rot: { pitch: 1 } }],
  },
  {
    /*
     * The same lap flown facing forward the whole way: no flip.
     *
     * THE ROLL IS THE LAP'S OWN AND HAS TO BE NAMED. Flying a circle
     * points the thrust at the middle of it, so a lap is always a rotation
     * about something: a Powerloop spends it on pitch because the nose
     * follows the path, and a Maverick spends it on ROLL because the nose
     * lies along the rail instead. There is no third option, and a lap
     * with rot { pitch: 0 } and nothing else said was not describing a
     * Maverick, it was describing every Maverick AND every Mavvy Roll,
     * because a Mavvy Roll's roll of 1 is exactly what the bare lap
     * already has. The dearer name won, so every Maverick Loop was paid
     * 250 instead of 100. See PROGRESS.md, 2026-09-03.
     */
    name: 'Maverick Loop',
    steps: [{ path: 'bar', turns: 1, from: 'under', rot: { pitch: 0, roll: 1 } }],
  },
  {
    /* Over the object, a 180 roll, then down the back and under it. */
    name: 'Split-S',
    steps: [{ path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0.5, pitch: 0.5 } }],
  },
  {
    /* Over the object, a partial front flip, out underneath it. */
    name: 'Matty Flip',
    steps: [{ path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0, pitch: 0.5 } }],
  },
  {
    /* The same, flown flat: throttle down, back out underneath. */
    name: 'Beginner Matty',
    steps: [{ path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0, pitch: 0 } }],
  },
  /*
   * THE POLE TRICKS, and they are the one family that asks for a lap count
   * as a FLOOR rather than as an exact reading. See LAP_TRUNCATION for the
   * measurement that settled it. A bar pattern still says `turns`, because
   * a bar has sides and its parity is a topological fact rather than an
   * estimate; a pole has neither.
   *
   * They are TIERED, so a pilot who flies four laps is not worse off than
   * one who flies two, and one who flies one is not worse off than one who
   * flies none. bestMatch picks the highest priced pattern that matches, so
   * the order they are written in here decides nothing.
   */
  {
    /*
     * Two laps of a pole with the object held on the screen, which is what
     * the workbook asks for and is measured directly. It used to be
     * inferred from the concurrent yaw, and could not be: see TRACK_DOT.
     */
    name: 'Orbit x2',
    steps: [{ path: 'pole', turnsAtLeast: 2, track: true, inverted: false }],
  },
  {
    /* The same, inverted, with the object held at the top of the screen. */
    name: 'Trippy Spin x2',
    steps: [{ path: 'pole', turnsAtLeast: 2, inverted: true }],
  },
  {
    /*
     * ONE inverted lap, which the workbook prices as a building block
     * rather than as a trick: "1 Trippy Spin", 100 points, a fifth of the
     * pair. Without it a pilot who came out of an inverted orbit after one
     * revolution scored nothing at all for it, which is the same complaint
     * the whole building block table exists to answer.
     *
     * There is deliberately no upright twin. The workbook has no block for
     * a single orbit, and it is right not to: one nose-in circle round a
     * post IS a 360 of yaw, and the yaw run releaseHeld hands back already
     * names it a Yaw Spin at 50. Naming it twice would pay twice for one
     * motion.
     */
    name: '1 Trippy Spin',
    steps: [{ path: 'pole', turnsAtLeast: 1, inverted: true }],
  },

  /* ---------------------------------------------------------------- *
   * THE LOOP FAMILIES, transcribed from the Tricktionary.
   *
   * Every one of these is the same shape: a lap around a bar with a
   * concurrent rotation, and what separates them is WHICH rotation and how
   * much. The workbook says so in as many words. "Initiate a Powerloop,
   * then at the peak of the loop, perform a Flip" is a full lap from under
   * carrying two flips instead of one; "at the peak of the loop, execute a
   * Roll" is the same lap carrying a flip and a roll. The recogniser
   * already measures the net rotation across a lap on all three axes and
   * threw it away on everything but the Powerloop and the Maverick Loop.
   *
   * The definitions are in .loop/evidence/freestyle-scoring/
   * tricktionary-outdoor.json, which is the copy of record for what a
   * trick IS the way src/game/tricks.js is for what it is worth. A pattern
   * here that disagrees with the paragraph there is the pattern that is
   * wrong.
   *
   * NOTHING HERE CONSTRAINS AN AXIS IT DOES NOT NAME, and that is
   * deliberate. A Powerloop asks for a flip and says nothing about roll, so
   * a Power Roll matches BOTH; bestMatch then takes the dearer of two equal
   * length, equally clean readings, which is the Power Roll, because the
   * pilot did roll. Adding `roll: 0` to the Powerloop would instead throw
   * the trick away on a wobble.
   * ---------------------------------------------------------------- */

  /* Powerloops: a whole lap from under, flipping with the loop. */
  {
    /* "at the peak of the loop, perform a Flip": the loop's own flip and
     * one more. */
    name: 'Power Flip',
    steps: [{ path: 'bar', turns: 1, from: 'under', rot: { pitch: 2 } }],
  },
  {
    /* "at the peak of the loop, execute a Roll". */
    name: 'Power Roll',
    steps: [{ path: 'bar', turns: 1, from: 'under', rot: { pitch: 1, roll: 1 } }],
  },
  {
    /* "when reaching the peak, perform a 360 Yaw spin while inverted". */
    /*
     * ROLL 0 IS PART OF THE DESCRIPTION, not an omission. This is a
     * POWERLOOP with a spin at the peak, so the nose follows the path and
     * the lap's turn is a flip: there is no roll in it. Left unsaid, the
     * pattern matched any lap carrying a flip and a spin whatever else was
     * in it, and a Cinnamon Roll flown at 45 degrees of bank came out an
     * Inverted 360 Powerloop, 650 points for a 175 point trick.
     */
    name: 'Inverted 360 Powerloop',
    steps: [{ path: 'bar', turns: 1, from: 'under', rot: { pitch: 1, roll: 0, yaw: 1 } }],
  },
  {
    /* "just before reaching it, execute a 180 yaw spin and immediately
     * pitch back to initiate a blind powerloop over the object". */
    name: 'Blindflip',
    steps: [
      { axis: 'yaw', turns: 0.5 },
      { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1 } },
    ],
  },
  {
    /* "once you pass the peak of the loop, immediately rewind into a Split
     * S, taking you back over and then under the object": two laps. */
    name: 'Power Split',
    steps: [
      { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1 } },
      { path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0.5, pitch: 0.5 } },
    ],
  },
  {
    /* "as you reach the peak, execute a precise 180 inverted Yaw spin.
     * Conclude with a Matty Flip back under the object." */
    name: 'Barani',
    steps: [
      { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1, yaw: 0.5 } },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
    ],
  },
  {
    /* A Barani with a roll between the yaw and the Matty. */
    name: 'Rollani',
    steps: [
      { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1, yaw: 0.5 } },
      { axis: 'roll', turns: 1 },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
    ],
  },
  {
    /* A Barani with a flip between the yaw and the Matty. */
    name: 'Flipani',
    steps: [
      { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1, yaw: 0.5 } },
      { axis: 'pitch', turns: 1 },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
    ],
  },

  /* Maverick loops: the same lap flown facing forward, so no flip. */
  {
    /*
     * "at the peak of the loop, execute a 360 roll": the loop's own roll
     * and one more, which is 2. This reads oddly beside the workbook's
     * "360 roll" until you notice Power Flip is written the same way, as
     * pitch 2 for "the loop's own flip and one more".
     */
    name: 'Mavvy Roll',
    steps: [{ path: 'bar', turns: 1, from: 'under', rot: { pitch: 0, roll: 2 } }],
  },
  {
    /* "execute a 180 Pitch down to invert. Follow this with a 360 Yaw
     * spin, and finally complete the loop." */
    /*
     * THE BASE ROLL HAS TO BE NAMED, like every other Maverick's.
     *
     * This sits in the Maverick section, "the same lap flown facing
     * forward", so its lap is carried on ROLL and a Donkey Loop always has
     * a whole turn of it. Leaving that unsaid made the pattern match any
     * lap with half a flip and a spin in it, however it was flown, and in
     * the real town a Cinnamon Roll came out a Donkey Loop: 600 points for
     * a 175 point trick, on a flight with a roll of 0.13. Naming the roll
     * costs a real Donkey Loop nothing, because a real one has it.
     */
    name: 'Donkey Loop',
    steps: [{ path: 'bar', turns: 1, from: 'under', rot: { pitch: 0.5, roll: 1, yaw: 1 } }],
  },
  {
    /* "a 180 Pitch down to invert. Follow with a 180 Yaw spin, and finish
     * with a Matty flip back under the object." */
    name: 'Mavani',
    steps: [
      { path: 'bar', turns: 1, from: 'under', rot: { pitch: 0.5, yaw: 0.5 } },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
    ],
  },
  {
    /* "a maverick motion... when above the object, a quick 180 pitch down
     * flick so that you're upside down, then a 180 roll to level out." */
    name: 'Mavvelmann',
    steps: [
      { path: 'bar', turns: 0.5, from: 'under', rot: { pitch: 0, roll: 0.5 } },
      { axis: 'pitch', turns: 0.5 },
      { axis: 'roll', turns: 0.5 },
    ],
  },

  /* Immelmanns: half a loop from under, then a half roll to level out. */
  {
    /* "...then promptly perform a beginner Matty." */
    name: 'Immelloop',
    steps: [
      { path: 'bar', turns: 0.5, from: 'under', rot: { pitch: 0.5 } },
      { axis: 'roll', turns: 0.5 },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0 } },
    ],
  },
  {
    /* "...and then promptly execute a Matty flip." */
    name: 'Immelmatt',
    steps: [
      { path: 'bar', turns: 0.5, from: 'under', rot: { pitch: 0.5 } },
      { axis: 'roll', turns: 0.5 },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
    ],
  },

  /* Matty flips: half a lap from over, out underneath. */
  {
    /* "a full backflip, overflipping by 15 to 30 degrees". */
    name: 'Anti Matty',
    steps: [{ path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 1 } }],
  },
  {
    /* "a 540 flip, 1.5x flips". */
    name: 'Power Matty',
    steps: [{ path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 1.5 } }],
  },
  {
    /* "a 270 pitch forward so you're looking at the sky, then a 360 roll". */
    name: 'Matty Roll',
    steps: [{ path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.75, roll: 1 } }],
  },
  {
    /* "a Matty flip and immediately a 360 yaw spin before passing under". */
    name: 'Matty 360',
    steps: [{ path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5, yaw: 1 } }],
  },
  {
    /* "pitch down and perform a 360 roll, immediately followed by a Matty
     * flip in one fluid motion." */
    name: 'Matty Twister',
    steps: [
      { axis: 'roll', turns: 1 },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
    ],
  },
  {
    /* "a 180 roll, smoothly transitioning into the second half of a Matty
     * flip", with an optional half second stall the pattern does not
     * demand because the workbook offers it as decoration. */
    name: 'Half Matty',
    steps: [
      { axis: 'roll', turns: 0.5 },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
    ],
  },
  {
    /* The same entered off a 540 roll. Longer than Half Matty by nothing,
     * so the roll's own turn count is what separates them. */
    name: '540 Half Matty',
    steps: [
      { axis: 'roll', turns: 1.5 },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
    ],
  },

  /* Splits: over the object, a half roll, and down the back of it. */
  {
    /* "while descending, incorporate a 180 yaw spin". */
    name: 'Split Yaw',
    steps: [{ path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0.5, pitch: 0.5, yaw: 0.5 } }],
  },
  {
    /* "a 180 roll as you pass over it, immediately a backflip". */
    name: 'Split-Back',
    steps: [{ path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0.5, pitch: 1 } }],
  },

  {
    /* "a 180 Roll toward the object you wish to track, then a Yaw spin in
     * the OPPOSITE direction to keep it centred, then a 180 Roll." The
     * opposite direction is the trick: rolling and yawing the same way
     * sweeps the object off the screen rather than holding it. */
    name: 'Inverted Yaw Tracking',
    steps: [
      { axis: 'roll', turns: 0.5 },
      { axis: 'yaw', turns: 1, oppTo: 0, inverted: true },
      { axis: 'roll', turns: 0.5 },
    ],
  },
  {
    /* "at the peak of your ascent, a throttle blip, a 180 pitch down and a
     * 360 Roll as you dive back down." */
    name: 'Eject Roll',
    steps: [
      { axis: 'pitch', turns: 0.5 },
      { axis: 'roll', turns: 1 },
    ],
  },
  {
    /* "an eject roll, concluding the 360 roll with a Matty flip motion." */
    name: 'Stellar Eject Roll',
    steps: [
      { axis: 'pitch', turns: 0.5 },
      { axis: 'roll', turns: 1 },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
    ],
  },
  {
    /* "a juicy flick, then a 180 inverted yaw spin, then the second half of
     * a powerloop while passing under the object." */
    name: 'True Barani',
    steps: [
      { axis: 'pitch', turns: 0.5, dir: 1 },
      { axis: 'roll', turns: 0.5 },
      { axis: 'yaw', turns: 0.5, inverted: true },
      { path: 'bar', turns: 0.5, from: 'under', rot: { pitch: 0.5 } },
    ],
  },
  {
    /*
     * "a 90 yaw spin while applying throttle with a slight roll toward the
     * object to fly over it. At the peak, reduce throttle and add a small
     * roll the other way to descend down the other side."
     *
     * Over the top and down, entered sideways. The quarter yaw is what
     * separates it from a Maverick Loop, which is the same lap flown facing
     * along it, and the workbook names that yaw first for the same reason.
     * The rolls are small and are not asked for: "slight" and "small" are
     * not a turn count.
     */
    name: 'Jump Rope',
    steps: [
      { axis: 'yaw', turns: 0.25 },
      { path: 'bar', turns: 1, from: 'under', rot: { pitch: 0, roll: 0 } },
    ],
  },
  {
    /* "combine a Jump Rope with a slow 360 yaw spin, timed to finish as you
     * pass back under the object." */
    name: 'Cinnamon Roll',
    steps: [
      { axis: 'yaw', turns: 0.25 },
      { path: 'bar', turns: 1, from: 'under', rot: { pitch: 0, yaw: 1 } },
    ],
  },
  {
    /* "a 90 Yaw spin as you pass beneath it, then roll toward the object to
     * fly over it while inverted": a powerloop flown on roll, not pitch. */
    name: 'Side Loop',
    steps: [
      { axis: 'yaw', turns: 0.25 },
      { path: 'bar', turns: 1, from: 'under', rot: { roll: 1, pitch: 0 } },
    ],
  },
  {
    /* "a Maverick loop, swiftly transitioning into a Half Matty to go back
     * under the object." */
    name: 'Half Mavvy',
    steps: [
      { path: 'bar', turns: 1, from: 'under', rot: { pitch: 0, roll: 1 } },
      { axis: 'roll', turns: 0.5 },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
    ],
  },
  {
    /*
     * "cut the throttle just before reaching the top, then execute a flip
     * as you stall."
     *
     * The stall is what makes this a 275 point trick rather than a 50 point
     * Flip, and it is a real one: `stallBeforeMs` only accrues below
     * STALL_SPEED, so the craft has to be nearly stationary, not merely
     * pausing between tricks.
     */
    name: 'Flip Stall Rewind',
    steps: [{ axis: 'pitch', turns: 1, stallMs: 400 }],
  },
  {
    /* The same, rolling. */
    name: '360 Stall Rewind',
    steps: [{ axis: 'roll', turns: 1, stallMs: 400 }],
  },

  /* ---------------------------------------------------------------- *
   * WALL TRICKS, where the contact IS the trick.
   *
   * Only the ones whose shape is distinctive enough to be safe. Wall Ride
   * is "a 90 degree roll away from the wall and a 90 degree roll back",
   * which is also what banking round a corner looks like; Loop Tap,
   * Reverse Wall Ride and Downtown Tap are each a quarter turn plus a
   * contact, and a quarter turn plus a contact is what happens every time
   * a pilot clips something while turning. They are left out on purpose
   * rather than added and then quietly firing all over the town. See the
   * design note in PROGRESS.md.
   * ---------------------------------------------------------------- */
  {
    /* "a 90 pitch back while cutting the throttle. Gently tap the wall,
     * then a 90 pitch forward to level out and fly away." Out and back on
     * the same axis, which is a shape ordinary flying does not make. */
    name: 'Wall Tap',
    steps: [
      { axis: 'pitch', turns: 0.25 },
      { axis: 'pitch', turns: 0.25, oppTo: 0, tap: true },
    ],
  },
  {
    /* "a 270 roll towards the wall, executing a wall tap as you go." */
    name: 'Roll Tap',
    steps: [{ axis: 'roll', turns: 0.75, tap: true }],
  },
  {
    /*
     * "a 90 Roll and a 45 pitch back, enabling a Wall tap while facing
     * backward. Immediately a 180 Pitch back."
     *
     * The pitch CONTINUES the same way after the tap, and that one word is
     * what separates it from a Wall Tap, which pitches back the other way
     * to level out. Same opening quarter, same contact, opposite intent.
     * The simultaneous roll the workbook also describes is not asked for:
     * two runs started together close in whichever order they finish, so a
     * pattern that demanded it would match on some flights and not others.
     */
    name: 'Loop Tap',
    steps: [
      { axis: 'pitch', turns: 0.25 },
      { axis: 'pitch', turns: 0.5, sameAs: 0, tap: true },
    ],
  },
  {
    /* "you're looking downward and away from the object as you tap it.
     * After the tap, smoothly perform a front flip." A whole flip out
     * rather than the Loop Tap's half. */
    name: 'Downtown Tap',
    steps: [
      { axis: 'pitch', turns: 0.25 },
      { axis: 'pitch', turns: 1, sameAs: 0, tap: true },
    ],
  },
  {
    /*
     * "just a few inches away from the wall, a 90 roll AWAY from it, cut
     * the throttle to glide alongside, then roll to level out."
     *
     * NOTHING IS TOUCHED, which is why this needed `gapAt`. A quarter roll
     * out and a quarter roll back is also what banking round a corner looks
     * like; the wall is the whole trick and until the recogniser could
     * measure a distance it could not see it. A metre is generous against
     * the workbook's "few inches" and tight enough that open air fails it.
     */
    name: 'Wall Ride',
    steps: [
      { axis: 'roll', turns: 0.25, nearMax: 1.0 },
      { axis: 'roll', turns: 0.25, oppTo: 0, nearMax: 1.0, gapMs: 1600 },
    ],
  },
  {
    /* "approach a wall as if for a wall ride, then quickly switch to face
     * backward with a 180 yaw spin. Conclude by rolling toward the wall to
     * level out." */
    name: 'Reverse Wall Ride',
    steps: [
      { axis: 'yaw', turns: 0.5, nearMax: 1.0 },
      { axis: 'roll', turns: 0.25, nearMax: 1.0, gapMs: 1600 },
    ],
  },
  {
    /*
     * "a 180 pitch back to tap the ceiling, then level out."
     *
     * `dir: -1` is the nose going UP, in the body rate convention of
     * sim_abi.h where +q pitches the nose down. Without it any half flip
     * that brushed anything was a 300 point Ceiling Tap, and a half flip
     * near a wall is not rare.
     */
    name: 'Ceiling Tap',
    steps: [{ axis: 'pitch', turns: 0.5, dir: -1, tap: true }],
  },
  {
    /* "a Maverick Loop. As you reach the object at the top of the loop,
     * pitch down 90 so that you tap it. Then a Matty Flip back under." */
    name: 'Maverick Tap Rewind',
    steps: [
      { path: 'bar', turns: 0.5, from: 'under', rot: { pitch: 0, roll: 0.5 }, tap: true },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
    ],
  },
  {
    /* "a powerloop. At the peak, pitch back to look downward and tap the
     * object. Then a Matty flip to rewind back under." */
    name: 'Power Switch Tap',
    steps: [
      { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1 }, tap: true },
      { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
    ],
  },

  /* One step patterns: the named whole rotations. Everything shorter or
   * odder falls through to the building blocks in singleName below. */
  { name: 'Double Flip', steps: [{ axis: 'pitch', turns: 2 }] },
  { name: 'Double Roll', steps: [{ axis: 'roll', turns: 2 }] },
  { name: 'Flip', steps: [{ axis: 'pitch', turns: 1 }] },
  { name: 'Roll', steps: [{ axis: 'roll', turns: 1 }] },
  { name: 'Yaw Spin', steps: [{ axis: 'yaw', turns: 1 }] },
  /*
   * THE SAME 360 OF YAW, FLOWN ON ITS BACK, and it is worth eight times as
   * much: 400 against 50.
   *
   * That is not the catalogue being generous. A yaw spin the right way up
   * is one stick held over while the quad holds itself level. Inverted,
   * gravity pulls the craft the way the throttle pushes it, so the pilot is
   * flying the altitude by hand on pitch and roll for the whole revolution
   * while the horizon turns underneath them. It is a different trick that
   * happens to be the same rotation.
   *
   * THIS USED TO BE A THREE STEP PATTERN and it is now one, which is the
   * same correction TRACK_DOT records for the Orbit. The workbook writes
   * the trick as "180 Pitch/Roll to invert, an inverted 360 Yaw spin, then
   * a Flip/Roll in the same direction", and the pattern followed it
   * literally: half a roll, a yaw, half a roll back the SAME way. So it
   * asked the entry and the exit to prove the craft was upside down,
   * because at the time nothing measured whether it actually was. A pilot
   * who rolled in one way and out the other, which is the ordinary way to
   * do it, scored 50 for a Yaw Spin.
   *
   * A rotation now carries the fraction of itself flown belly up, the same
   * way a lap has since INVERTED_MIN was written, so the craft's own
   * attitude answers the question and the entry and the exit are free to be
   * whatever the pilot flew. They are still paid for: a half roll either
   * side is a building block worth 50 each, exactly as it is anywhere else.
   *
   * NO `inverted: false` ON THE UPRIGHT ONE, because it does not need it.
   * Both patterns are one step long and both match an inverted spin, and
   * bestMatch takes the higher priced of two matches of equal length. An
   * ordinary yaw spin has an inverted fraction near zero and never reaches
   * this one at all.
   */
  { name: 'Inverted Yaw Spin', steps: [{ axis: 'yaw', turns: 1, inverted: true }] },
];

/*
 * The fallback price list: one primitive that is part of nothing larger.
 *
 * These are the workbook's own "Custom Trick Building Blocks". Highest entry
 * that the rotation covers wins, and the remainder is handed back to the
 * buffer, so a 540 roll is a Roll and then a 1/2 Roll rather than a Roll
 * with 180 degrees thrown away.
 *
 * WHAT IS DELIBERATELY MISSING, and it is the single most important
 * judgement call in this file. The workbook prices a 1/4 Roll at 25 and a
 * 1/2 Yaw Spin at 50, and this table used to hand those out. Flying the real
 * aircraft through six hard corners then scored TWELVE tricks: a quarter
 * roll and a half yaw spin per corner, from a pilot who was turning a
 * corner. That is not a fault in the workbook. Those blocks exist so a JUDGE
 * can price a custom trick a competitor DECLARED, and a competitor does not
 * declare "I banked into a turn".
 *
 * So the floor is drawn where a rotation stops being incidental:
 *
 *   yaw          only a WHOLE turn. Half a yaw spin is turning around to
 *                fly backwards, which every pilot does every few seconds.
 *   roll, pitch  a half turn or more. You do not end up inverted by
 *                accident; you do bank to 90 degrees and pitch 90 down
 *                into a dive constantly.
 *
 * Quarter turns are still matched INSIDE a pattern if a trick ever calls
 * for one. They are simply not worth anything on their own. A rotation that
 * finds no entry here is dropped rather than scored as something smaller,
 * which is what keeps the corner silent.
 */
const SINGLES = [
  { axis: AXIS_PITCH, turns: 2, name: 'Double Flip' },
  { axis: AXIS_PITCH, turns: 1, name: 'Flip' },
  { axis: AXIS_PITCH, turns: 0.75, name: '3/4 Flip' },
  { axis: AXIS_PITCH, turns: 0.5, name: '1/2 Flip' },
  { axis: AXIS_ROLL, turns: 2, name: 'Double Roll' },
  { axis: AXIS_ROLL, turns: 1, name: 'Roll' },
  { axis: AXIS_ROLL, turns: 0.75, name: '3/4 Roll' },
  { axis: AXIS_ROLL, turns: 0.5, name: '1/2 Roll' },
  /*
   * `inverted` names what the same block is called when it was flown belly
   * up, and only yaw has one, because only yaw has a catalogue entry that
   * is the same rotation on its back. Without it a 720 of inverted yaw fell
   * through here and came out as two upright Yaw Spins at 50 apiece, which
   * is a pilot being paid a fifth of the price for flying the harder thing
   * twice. The pattern only reaches a whole turn; this reaches every
   * multiple of one.
   */
  { axis: AXIS_YAW, turns: 1, name: 'Yaw Spin', inverted: 'Inverted Yaw Spin' },
];

/*
 * Largest single that fits inside this rotation, or null. Takes the whole
 * primitive rather than an axis and a count, because which block a rotation
 * is depends on which way up it was flown as well as on how far it went.
 */
function singleFor(prim) {
  const axis = prim.axis;
  const turns = prim.turns;
  let best = null;
  for (const s of SINGLES) {
    if (s.axis !== axis || s.turns > turns + 1e-9) {
      continue;
    }
    if (!best || s.turns > best.turns) {
      best = s;
    }
  }
  if (!best) {
    return null;
  }
  if (best.inverted && (prim.invertedFrac ?? 0) >= INVERTED_MIN) {
    return { axis: best.axis, turns: best.turns, name: best.inverted };
  }
  return best;
}

/* Which residue class a turn count falls in: whole turns, half turns, or a
 * quarter either way. */
function turnClass(t) {
  const f = t - Math.floor(t);
  if (f < 0.125 || f > 0.875) {
    return 'whole';
  }
  if (f > 0.375 && f < 0.625) {
    return 'half';
  }
  return 'edge';
}

/*
 * Snap a signed turn count to a quarter, using how the craft's attitude
 * CHANGED across the rotation to choose between the candidates a quarter
 * apart.
 *
 * upZ is the world z component of the body up axis: +1 level, -1 inverted,
 * 0 on its side. For the quaternion (w, x, y, z) that is 1 - 2(x^2 + y^2),
 * one polynomial and no trigonometry.
 *
 * IT IS THE CHANGE, NOT THE END STATE, and getting that wrong is the whole
 * reason this comment is here. The first version asked only where the craft
 * ended: upright meant a whole number of turns, inverted meant a half. That
 * is true for a trick begun the right way up and false for every trick that
 * is not, and the middle of a Rubik's Cube is exactly that case. A Cube is a
 * half roll to inverted, then a WHOLE flip that begins inverted and ends
 * inverted, then a half roll home. The old rule read that flip's end
 * attitude, decided it wanted a half, and only failed to corrupt the count
 * because the candidates it then reached for were further away than the
 * tolerance allowed. It got the right answer by being unable to apply the
 * wrong one, which is not the same as being right: flown a little long, at
 * 1.15 turns, it would have snapped to 1.25 and the Cube would have come
 * apart into a Flip and a quarter.
 *
 * The invariant that actually holds is that a rotation about a horizontal
 * body axis inverts the craft if and only if it covers a half-integer
 * number of turns. So the classes are:
 *
 *   started and ended the same way up   -> a whole number of turns
 *   started and ended opposite ways up  -> a half
 *   ended on its side                   -> a quarter or three quarters
 *
 * When the START attitude is itself on edge, none of that is reliable, and
 * the plain nearest quarter is the honest answer.
 *
 * A yaw does not change which way up the craft is, so attitude says nothing
 * about it and it always takes the plain nearest quarter.
 */
export function snapTurns(rawTurns, axis, startUpZ, endUpZ) {
  const mag = rawTurns < 0 ? -rawTurns : rawTurns;
  if (mag < MIN_TURNS) {
    return 0;
  }
  const nearest = Math.round(mag * 4) / 4;
  if (axis === AXIS_YAW) {
    return nearest;
  }
  const sUp = startUpZ > 0.5;
  const sDown = startUpZ < -0.5;
  if (!sUp && !sDown) {
    return nearest;
  }
  const eUp = endUpZ > 0.5;
  const eDown = endUpZ < -0.5;
  let want;
  if (!eUp && !eDown) {
    want = 'edge';
  } else {
    want = (sUp === eUp) ? 'whole' : 'half';
  }
  if (turnClass(nearest) === want) {
    return nearest;
  }
  /* Reach a quarter either side for a candidate that agrees with the
   * attitude, and take it only if the integral supports it. */
  let best = nearest;
  let bestErr = Infinity;
  for (const cand of [nearest - 0.25, nearest + 0.25, nearest - 0.5, nearest + 0.5]) {
    if (cand < MIN_TURNS || turnClass(cand) !== want) {
      continue;
    }
    const err = cand > mag ? cand - mag : mag - cand;
    if (err <= SNAP_TOLERANCE && err < bestErr) {
      bestErr = err;
      best = cand;
    }
  }
  return best;
}

/*
 * Snap a lap count to a quarter, the same way snapTurns does for attitude
 * and for the same reason.
 *
 * For a BAR the side of the axis plays the part upZ plays for a rotation: a
 * lap that begins under the rail and ends under it went all the way round,
 * and one that begins under and ends over went half way. That is what
 * separates a Powerloop from an Immelmann, and it is a fact about where the
 * craft is rather than about how accurately the pilot flew.
 *
 * For a POLE there is no above or below, so an orbit takes the plain
 * nearest quarter.
 */
export function snapPathTurns(rawTurns, kind, startSide, endSide) {
  const mag = rawTurns < 0 ? -rawTurns : rawTurns;
  if (kind !== OB_BAR || startSide === 0 || endSide === 0) {
    /* A pole has no sides, so nothing here can be checked against them. */
    return mag < POLE_MIN_TURNS ? 0 : Math.round(mag * 4) / 4;
  }

  /*
   * THE STRAIGHT LINE THEOREM, which is what this whole function is for.
   *
   * A straight line subtends STRICTLY LESS THAN half a turn about any point
   * not on it. That is exact, not a tuning claim: as the craft runs from one
   * end of an infinite straight line to the other, the radius vector to a
   * fixed point sweeps from one asymptote to the other, and those asymptotes
   * are anti-parallel. Half a turn is the supremum and it is never reached.
   *
   * So any lap reading at or under half a turn is consistent with the craft
   * having flown DEAD STRAIGHT past the obstacle, and is therefore no
   * evidence at all of having gone around it. Going around something means
   * curving around it, and curving is precisely what buys the extra angle.
   *
   * This is not a threshold moved to make a test pass. It is the reason the
   * first version of this file was wrong, and it was wrong in three places
   * at once, all found by flying:
   *
   *   a quad DESCENDING in a straight line past a footbridge rail scored a
   *   Beginner Matty, because a descending pass really does cross from over
   *   the rail to under it, and the old floor of 0.375 turns let the 0.5 a
   *   straight line gives sail through;
   *   a quad falling ballistically past a railing, throttle at 0.05, with a
   *   lazy 0.37 of roll and pitch on the way down, scored a CLEAN Split-S;
   *   a quad CLIMBING straight past a rail scored an Immelmann Turn.
   *
   * Measured on the real aircraft: those false laps read 0.377 to 0.463
   * turns, all of them hugging the old floor from above. An honest flown
   * Immelmann reads 0.610 and an honest flown Split-S reads 0.82 to 0.85,
   * because the craft physically curves around the axis. The two
   * populations do not overlap and the boundary between them is the
   * theorem's own 0.5, with a little margin for the rate gate truncating
   * the tail of a real lap.
   */
  const parityHalf = startSide !== endSide;
  if (mag < (parityHalf ? HALF_LAP_MIN : WHOLE_LAP_MIN)) {
    return 0;
  }

  /*
   * AND NO TOLERANCE GATE ON THE HALF, which is the other half of the same
   * idea. The sides are a topological fact: the craft went in over the rail
   * and came out under it, so it crossed that plane an odd number of times,
   * so the answer IS a half integer. The only question left is WHICH half
   * integer, and the nearest one answers it.
   *
   * The old code demanded the reading also fall within a third of a turn of
   * 0.5, which put a CEILING on a Split-S at 0.85. Flown tighter, at pitch
   * stick 0.60 rather than 0.45, a real Split-S reads 0.933 and scored
   * nothing: zero of eight rail placements. A better flown trick scoring
   * less than a worse one is the wrong way round, and it came from applying
   * an accuracy tolerance to something that is not an estimate.
   */
  if (parityHalf) {
    /* The nearest number of the form k + 1/2, never below a half. */
    const halves = Math.round(mag - 0.5) + 0.5;
    return halves < 0.5 ? 0.5 : halves;
  }

  /*
   * An even parity is consistent with ZERO laps, so this one does keep a
   * band: the craft came out the side it went in, which is what both a full
   * lap and a plain fly-by look like from the sides alone. WHOLE_LAP_MIN
   * separates them and the nearest whole turn names it.
   */
  const whole = Math.round(mag);
  return whole < 1 ? 0 : whole;
}

/* One axis of rotation, accumulating. Plain fields, no allocation per step. */
class Run {
  constructor(axis) {
    this.axis = axis;
    this.acc = 0;
    this.open = false;
    this.startMs = 0;
    /* Which way up the craft was when this rotation began. snapTurns reads
     * the CHANGE across the run, not the end state. */
    this.startUpZ = 1;
    this.offMs = 0;
    /* Total time inside the run spent under RATE_OFF, which is how a
     * segmented rotation gives itself away. */
    this.slowMs = 0;
    /*
     * How much of the rotation was flown belly up. Steps, not milliseconds,
     * and the two are the same thing here because the shell steps at
     * exactly 1 kHz: see sim_abi.h. This is the exact twin of PathRun's own
     * pair and exists for the same reason, which is that whether a trick
     * was flown inverted is a fact about the WHOLE motion and not about the
     * instant it happened to end. startUpZ and the closing upZ answer a
     * different question, which is how many quarter turns the integral is
     * allowed to be, and snapTurns is welcome to them.
     */
    this.invSamples = 0;
    this.spanSamples = 0;
  }

  /* Note this step's attitude against the rotation now running. */
  sample(upZ) {
    this.spanSamples += 1;
    if (upZ < 0) {
      this.invSamples += 1;
    }
  }

  /* Start counting again, for a run that has just opened. */
  clearSamples() {
    this.invSamples = 0;
    this.spanSamples = 0;
  }

  invertedFrac() {
    return this.spanSamples > 0 ? this.invSamples / this.spanSamples : 0;
  }

  reset() {
    this.acc = 0;
    this.open = false;
    this.offMs = 0;
    this.slowMs = 0;
    this.clearSamples();
  }
}

/*
 * The winding of the craft's position about one obstacle axis.
 *
 * This is the exact translational twin of Run above. Where Run integrates a
 * body rate into an angle and snaps it to a quarter turn, this integrates
 * the angle the craft SUBTENDS at an axis and snaps that. Where Run reads
 * the craft's attitude to settle whether a rotation was a half or a whole
 * turn, this reads which SIDE of the axis the craft was on, which for a bar
 * is above it or below it and is exactly the same kind of fact.
 *
 * The increment is computed without trigonometry, as the cross product of
 * the two successive radius vectors over the product of their lengths. That
 * is the sine of the step angle rather than the angle, and it is short by
 * one part in six of the cube: at 1 kHz and a fast lap of two turns a
 * second the step angle is 0.0126 rad and the shortfall is 3.3e-7 rad per
 * step, which does not reach the fourth decimal place of a turn over a
 * whole lap.
 */
class PathRun {
  constructor() {
    this.open = false;
    this.acc = 0;
    /* Winding gone back the way the lap came, since the last forward
     * progress. See PATH_REVERSE_TURNS. */
    this.backWind = 0;
    /*
     * THE LOOP'S OWN TURN, and how the lap's axis lies in the body.
     *
     * axisAcc integrates the craft's rotation about the OBSTACLE'S axis,
     * which is the rotation the loop itself performs and is the same number
     * whatever bank the pilot flew it at. alignSum accumulates how the
     * obstacle's axis sits along the nose, the wing and the up axis, so the
     * loop's turn can be taken back out of the body integrals and what is
     * left is what the pilot ADDED. See the de-banking in closePath.
     */
    this.axisAcc = 0;
    this.startAxis = 0;
    this.lastAxis = 0;
    this.alignSum = [0, 0, 0];
    /*
     * THE PILOT'S ROTATION, with the lap's own taken out AS IT HAPPENS.
     *
     * The body integrals over a lap are the pilot's rotation and the loop's
     * own turn added together, and separating them by subtracting a lump at
     * the end only works while the body axes hold roughly still: it uses the
     * MEAN direction of the rail in the body, and a mean is only the thing
     * itself when the thing does not move. Put a 360 yaw inside the lap and
     * the rail sweeps the whole way round the body, the mean collapses
     * toward nothing, and a Donkey Loop's lap read rot [0, -0.15, -1.23]
     * where [1, 0.5, 1] had been flown.
     *
     * Subtracting it per sample has no such assumption. At every step the
     * lap's own angular velocity is the winding rate about the rail times
     * the rail's direction in the body, which is exactly what axisAcc is
     * built from, so taking it off each body rate before integrating leaves
     * the pilot's rotation and nothing else, however the craft tumbles.
     */
    this.windProj = [0, 0, 0];
    /*
     * The same alignments as MAGNITUDES, which is what decides ownership.
     * Averaging the signed components cannot tell a craft rolling about its
     * nose from one yawing through the lap: both average towards nothing.
     * Per sample, a roll keeps the rail permanently across the nose and a
     * yaw swings it between the nose and the wing, and that difference
     * survives the average. See debankLap.
     */
    this.magRoll = 0;
    this.magPerp = 0;
    this.alignN = 0;
    /*
     * The last millisecond this run was winding at all, as against lastMs
     * which is the high water mark of the WINDING. They are different
     * questions and were briefly the same field: how far round the craft
     * got is lastMs, how long the lap occupied is this. Absorption asks
     * the second one, so answering it with the first left the pitch of an
     * Immelmann outside its own lap and the trick came out a Juicy Flick.
     */
    this.tailMs = 0;
    /* When the gate actually opened, as against startMs which is backdated
     * over the approach. Diagnostics only. */
    this.openMs = 0;
    /* Set once per step by pathStep, so a run cannot be wound twice in one
     * millisecond: once as an open run and once as an engaged obstacle.
     * Winding it twice would double every increment and read one lap as
     * two. See pathStep. */
    this.stepped = false;
    /*
     * THE RADIUS BAND over the lap window, which is what tells a loop from
     * a fly-by when the angle cannot. See LAP_RADIUS_RATIO.
     */
    this.minR = 0;
    this.maxR = 0;
    this.obstacle = null;
    this.startMs = 0;
    this.startSide = 0;
    /* Net rotation on each axis when the run opened, so what the craft did
     * WHILE looping can be read off as a difference at the close. */
    this.startRot = [0, 0, 0];
    this.offMs = 0;
    /* Previous radius vector, perpendicular to the axis. */
    this.px = 0;
    this.py = 0;
    this.pz = 0;
    this.have = false;
    /* Rate of winding, turns per second, low pass filtered so a single
     * noisy millisecond cannot open or close a run on its own. */
    this.rate = 0;
    /*
     * Winding accumulated since this obstacle was engaged, whether or not a
     * run is open, plus the rolling snapshots a run backdates itself from.
     * Allocated once and written in place; nothing here allocates per step.
     */
    this.windTotal = 0;
    /*
     * Where the lap began, and the last moment it was still WINDING.
     *
     * A lap has to be trimmed at both ends. The rate gate opens late,
     * which the lookback fixes, and it closes late too: a low pass that
     * has to decay below the threshold for 220 ms keeps the run open for
     * more than a second after the craft has stopped going round, and in
     * that second the craft drifts, so the side it is on when the run
     * finally closes is not the side it was on when the lap ended. Read
     * naively a clean powerloop says it started under the rail and ended
     * over it, which is a half lap, which is not a powerloop.
     *
     * So the lap is the span over which the craft was ACTUALLY winding:
     * from the backdated open to the last moment the rate was above the
     * gate. Everything else is the approach and the exit.
     */
    this.startWind = 0;
    /* Which way this lap is turning, fixed at the moment it opened. */
    this.dirSign = 0;
    this.lastWind = 0;
    this.lastSide = 0;
    this.lastMs = 0;
    this.lastRot = [0, 0, 0];
    /*
     * How much of the lap was flown INVERTED, as a count of samples inside
     * the winding span. Not the attitude at the close: closePath fires when
     * the rate filter finally decays, which is 300 to 1500 ms after the lap
     * itself ended, and in that gap the craft can roll to anything. Reading
     * it there made Trippy Spin x2, a 500 point trick, a coin toss on how
     * long the pilot happened to fly level before rolling out: measured, an
     * UPRIGHT orbit with a half roll on the exit was named Trippy Spin in
     * four of eight exit delays, and in six of six pole heights and radii.
     */
    this.invSamples = 0;
    /* Samples of the lap with the object near the nose. See TRACK_DOT. */
    this.trackSamples = 0;
    this.haveFwd = false;
    this.haveUp = false;
    this.spanSamples = 0;
    this.histWind = new Float64Array(PATH_LOOKBACK);
    this.histRot = new Float64Array(PATH_LOOKBACK * 3);
    this.histMs = new Float64Array(PATH_LOOKBACK);
    this.histSide = new Int8Array(PATH_LOOKBACK);
    this.histIdx = 0;
    this.histFill = 0;
  }

  reset() {
    this.open = false;
    this.acc = 0;
    this.obstacle = null;
    this.offMs = 0;
    this.have = false;
    this.rate = 0;
    this.dirSign = 0;
    this.clearHistory();
  }

  clearHistory() {
    this.windTotal = 0;
    this.histIdx = 0;
    this.histFill = 0;
  }

  /* Record where things stand, and return the oldest record still held. */
  snapshot(side, ms, rot) {
    const i = this.histIdx;
    const old = this.histFill >= PATH_LOOKBACK
      ? {
        wind: this.histWind[i],
        side: this.histSide[i],
        ms: this.histMs[i],
        r0: this.histRot[i * 3],
        r1: this.histRot[i * 3 + 1],
        r2: this.histRot[i * 3 + 2],
      }
      : null;
    this.histWind[i] = this.windTotal;
    this.histSide[i] = side;
    this.histMs[i] = ms;
    this.histRot[i * 3] = rot[0];
    this.histRot[i * 3 + 1] = rot[1];
    this.histRot[i * 3 + 2] = rot[2];
    this.histIdx = i + 1 >= PATH_LOOKBACK ? 0 : i + 1;
    if (this.histFill < PATH_LOOKBACK) {
      this.histFill += 1;
    }
    if (old) {
      return old;
    }
    /* Not full yet: the oldest record is the first one written. */
    const j = 0;
    return {
      wind: this.histWind[j],
      side: this.histSide[j],
      ms: this.histMs[j],
      r0: this.histRot[j * 3],
      r1: this.histRot[j * 3 + 1],
      r2: this.histRot[j * 3 + 2],
    };
  }
}

/*
 * The recogniser.
 *
 * Fed one physics step at a time. Emits named tricks through `onTrick`,
 * which is called with a plain object the scorer owns the meaning of:
 *
 *   { name, axis, turns, startMs, endMs, execution, primitives }
 *
 * `execution` is this file's opinion of HOW it was flown, in the workbook's
 * vocabulary: CLEAN, or SLOPPY when the motion broke up, or BUMP when the
 * craft touched something while doing it. CRASH is not decided here; a crash
 * is a fact about the run and the scorer is told about it directly.
 */

/* ---------------------------------------------------------------- *
 * THE PATH, MEASURED FROM THE PATH.
 *
 * Everything above this line that concerns an obstacle measures a LAP as the
 * winding of the craft's position about a line derived from the colliders.
 * That has been the shape of the path side since it was written, and four
 * rounds of this log have now found faults that all trace back to it rather
 * than to any threshold:
 *
 *   a trick can only exist where the derivation found an axis, so a Split-S
 *   over a wall, a roof edge or a building corner is unnameable, and the
 *   catalogue's own open air blocks, Split-S at 100 and the quarter, half
 *   and three quarter Power Loops, are unreachable by construction;
 *   the lap's concurrent rotation is a BODY integral that has to be repaired
 *   afterwards by de-banking, with a sign convention measured per lap,
 *   because body axes tumble with the craft;
 *   and the straight line theorem, which is what refuses a fly past, runs
 *   out exactly where it is needed: a straight line subtends a supremum of
 *   half a turn about a point off it, and a perfect half loop sweeps exactly
 *   half a turn, so the honest trick and the dishonest fly past meet at the
 *   same number from opposite sides. The file says so itself, at length,
 *   above HALF_LAP_MIN.
 *
 * This measures the PATH instead, and the last of those three is the reason
 * it is worth the rewrite. The turning of the flight path is not a quantity
 * a straight line has any of: a craft flying dead past an object turns
 * through nothing at all, whatever the object subtends, while a half loop
 * turns through exactly half a turn wherever it is flown and whatever is or
 * is not inside it. The two populations stop overlapping, so the floors stop
 * being a coin toss.
 *
 * WHAT IS MEASURED, and all of it from the craft's own trajectory and its
 * own frame, with no derived geometry in it:
 *
 *   turns     how far the flight path turned, from the integral of the
 *             tangent's own rotation
 *   axis      which way that turning pointed: horizontal is a loop in a
 *             vertical plane, vertical is an orbit in a horizontal one
 *   loop      the craft's rotation ABOUT the path's own turning axis, which
 *             is what a Powerloop has one of and a Maverick Loop none of,
 *             and which is bank independent because the axis is the path's
 *             and not the body's
 *   rollT     the craft's rotation about its own VELOCITY, which is the half
 *             roll of a Split-S, an Immelmann and a Juicy Flick
 *   spin      the craft's rotation about world up, which is the yaw of a
 *             Cinnamon Roll or an Inverted 360 Powerloop
 *   loopOn    whether the turning axis lies along the nose or across it,
 *             which is the whole of the difference between the Powerloop
 *             family and the Maverick family
 *   forward   the mean of nose against direction of travel: a Matty Flip
 *             comes out backwards and a Split-S comes out forwards
 *   object    whether anything solid is inside the circle the craft flew
 *
 * NO TRIGONOMETRY, the same rule the rest of the file keeps: cross products,
 * dot products and square roots only, so the same recording names the same
 * tricks in Node and in a browser.
 *
 * THE ANGULAR VELOCITY IS TAKEN FROM THE FRAME, NOT FROM THE GYRO, and that
 * is deliberate. The body rates arrive in Betaflight's own sign convention
 * and the body axes arrive in the renderer's, and the one thing this file
 * has been bitten by more than any other is a sign that was assumed to
 * relate the two. For an orthonormal frame the angular velocity is
 * one half the sum of e cross e-dot over the three axes, which uses only the
 * OBSERVED rotation of the frame the caller already passes. It needs no
 * convention to be agreed, so there is none to get wrong.
 * ---------------------------------------------------------------- */

/*
 * Where the path's turning starts and stops counting, in turns per second.
 *
 * What refuses ordinary flying is the TOTAL turning at the close, not this;
 * this only has to keep the APPROACH out of the figure. Measured on the real
 * aircraft, a powerloop turns at about 0.34 turns/s at a radius of 3 to 5 m
 * and an orbit of a wide circle at 0.14 at 6 to 14 m, while the run in to
 * either curves through thirty degrees over a couple of seconds at a radius
 * of thirty metres and more. Counting that ramp put the turn's beginning up
 * the approach instead of at the figure, and the side tests then read the
 * entry of a loop as being on the wrong side of the loop's own middle.
 *
 * OFF sits well below ON, which is the way round every other run in this
 * file has it and the way round the old path gate did not.
 */
const PATH_TURN_ON = 0.10;
const PATH_TURN_OFF = 0.04;
const PATH_TURN_HOLD_MS = 220;
/* Below this the direction of travel is noise and the tangent means nothing:
 * a hovering craft's velocity points wherever the last millisecond of drift
 * did. The turning is held rather than counted while it is slower. */
const PATH_MIN_SPEED = 1.5;
/* A turn wider than this is a heading correction on a cruise, not a figure
 * flown around anything. Sixty metres is four times the widest powerloop the
 * log has measured and wider than any orbit the town has room for. */
const PATH_MAX_RADIUS = 16;
/*
 * HOW FAR INSIDE THE FIGURE A SOLID HAS TO BE to count as the thing that was
 * flown around, as a fraction of the radius the figure was flown at.
 *
 * A solid out at the rim is something the craft flew PAST on its way round,
 * not the thing it went around. Measured on the real aircraft: a powerloop
 * commanded at 3.4 m around a rail put its own centre 1.5 m from that rail
 * at a measured radius of 5.0, which is 0.30 of the radius; an orbit of a
 * post at 6 m put its centre on the post exactly, 0.00. The entry and exit
 * arcs of the same flights, which are turns the craft made in open air on
 * its way in and out, found nothing within a whole radius at all.
 */
const OBJECT_INSIDE = 0.6;
/*
 * How far the path may turn BACK on itself before the figure is over.
 *
 * The winding side asks for 0.08 of a turn and is right to: winding about a
 * fixed axis is a smooth quantity and going back round is unambiguous. The
 * PATH's own turning is not smooth in the same way, because a real figure is
 * flown with the sticks and the tangent wobbles as the craft is corrected
 * through it.
 *
 * MEASURED AT THREE VALUES against the two cases that pull opposite ways,
 * rather than picked to make either pass:
 *
 *   0.10   a flown Matty Flip still comes apart, 0.31 then 0.53
 *   0.12   the Matty is one turn of 0.47, and an orbit still separates from
 *          the arcs it flew in and out on
 *   0.14   the Matty holds, but an orbit MERGES with its entry arc and the
 *          measured centre is dragged three metres off the post
 *
 * So 0.12, and the two failures either side of it are what says so.
 */
const PATH_TURN_REVERSE = 0.12;

/*
 * THE PATH'S OWN TURNING, accumulated as a vector.
 *
 * One of these per detector, not one per obstacle: the path is the craft's
 * and there is only one of it. That alone removes a family of faults the log
 * records, because there is no longer a set of candidate axes to choose
 * between, nothing to wind twice, and no way for a fence's second rail to be
 * paid for the same loop.
 */
class PathTrack {
  constructor() {
    this.open = false;
    /* The integral of the tangent's rotation. Its length is how far the path
     * turned and its direction is the axis it turned about. */
    this.tx = 0;
    this.ty = 0;
    this.tz = 0;
    /* The integral of the craft's own angular velocity, so the rotation
     * about any fixed axis is one dot product at the close. */
    this.wx = 0;
    this.wy = 0;
    this.wz = 0;
    /* Rotation about the craft's own velocity, which has to be accumulated
     * per sample because the velocity is what moves. */
    this.rollT = 0;
    /* How the turning axis lay against the nose, weighted by how much
     * turning each sample carried, so a sample that turned through nothing
     * cannot vote. */
    this.alongNose = 0;
    this.acrossNose = 0;
    this.alignW = 0;
    /* The nose against the direction of travel, and the belly against the
     * sky, both over the turning window. */
    this.fwdSum = 0;
    this.invSamples = 0;
    this.spanSamples = 0;
    /* Where the centre of the turn is, as a mean weighted the same way. */
    this.cx = 0;
    this.cy = 0;
    this.cz = 0;
    this.minR = 0;
    this.maxR = 0;
    /* The radius the turn was actually flown at, weighted the same way the
     * centre is: the instantaneous curvature of a sample that turned through
     * nothing is enormous and says nothing about the figure. */
    this.rSum = 0;
    /* The object on the screen, for an orbit. */
    this.trackSamples = 0;
    /* Backward turning since the last forward progress, which is what ends
     * an out and back. */
    this.back = 0;
    this.dir = 0;
    this.rate = 0;
    this.offMs = 0;
    this.startMs = 0;
    this.openMs = 0;
    this.tailMs = 0;
    this.startStallMs = 0;
    /* Where the craft entered and left the turn, so which side of the
     * turn's own centre each end was on can be read off. */
    this.p0x = 0;
    this.p0y = 0;
    this.p0z = 0;
    this.p1x = 0;
    this.p1y = 0;
    this.p1z = 0;
    /* Previous sample: position, tangent and the three body axes. */
    this.have = false;
    this.px = 0;
    this.py = 0;
    this.pz = 0;
    this.htx = 0;
    this.hty = 0;
    this.htz = 0;
    this.haveT = false;
    this.efx = 0;
    this.efy = 0;
    this.efz = 0;
    this.eux = 0;
    this.euy = 0;
    this.euz = 0;
    this.erx = 0;
    this.ery = 0;
    this.erz = 0;
    this.haveE = false;
    /* A short rolling record, so a turn can be backdated to where the craft
     * committed to it rather than to where the filter noticed. */
    this.histX = new Float64Array(PATH_LOOKBACK);
    this.histY = new Float64Array(PATH_LOOKBACK);
    this.histZ = new Float64Array(PATH_LOOKBACK);
    this.histMs = new Float64Array(PATH_LOOKBACK);
    this.histIdx = 0;
    this.histFill = 0;
  }

  reset() {
    this.open = false;
    this.have = false;
    this.haveT = false;
    this.haveE = false;
    this.rate = 0;
    this.offMs = 0;
    this.dir = 0;
    this.histIdx = 0;
    this.histFill = 0;
  }

  /*
   * Start a turn.
   *
   * THE TIME IS BACKDATED AND THE PLACE IS NOT, and they are different
   * questions. startMs reaches back so a rotation flown into the turn is
   * still contiguous with it, which is what the step gap is measured
   * against. But WHERE the craft was 800 ms ago is somewhere up the
   * approach, and using it for the side tests read the entry of a whole
   * loop as being on the wrong side of the loop's own middle. The turn
   * begins where it begins.
   */
  openAt(nowMs, stallMs) {
    const j = this.histFill >= PATH_LOOKBACK ? this.histIdx : 0;
    this.open = true;
    this.startMs = this.histFill > 0 ? this.histMs[j] : nowMs;
    this.p0x = this.px;
    this.p0y = this.py;
    this.p0z = this.pz;
    this.openMs = nowMs;
    this.tailMs = nowMs;
    this.startStallMs = stallMs;
    this.tx = 0;
    this.ty = 0;
    this.tz = 0;
    this.wx = 0;
    this.wy = 0;
    this.wz = 0;
    this.rollT = 0;
    this.alongNose = 0;
    this.acrossNose = 0;
    this.alignW = 0;
    this.fwdSum = 0;
    this.invSamples = 0;
    this.spanSamples = 0;
    this.trackSamples = 0;
    this.cx = 0;
    this.cy = 0;
    this.cz = 0;
    this.minR = Infinity;
    this.maxR = 0;
    this.rSum = 0;
    this.back = 0;
    this.dir = 0;
  }

  snapshot(x, y, z, ms) {
    const i = this.histIdx;
    this.histX[i] = x;
    this.histY[i] = y;
    this.histZ[i] = z;
    this.histMs[i] = ms;
    this.histIdx = i + 1 >= PATH_LOOKBACK ? 0 : i + 1;
    if (this.histFill < PATH_LOOKBACK) {
      this.histFill += 1;
    }
  }

  turns() {
    return Math.sqrt(this.tx * this.tx + this.ty * this.ty + this.tz * this.tz) / TURN;
  }
}

export class TrickDetector {
  constructor(onTrick, obstacles = null) {
    this.onTrick = onTrick;
    this.runs = [new Run(AXIS_ROLL), new Run(AXIS_PITCH), new Run(AXIS_YAW)];
    /* The obstacle field, or null on a map that has none. With none, this
     * is exactly the open-air recogniser it was before. */
    this.obstacles = obstacles;
    /*
     * ONE LAP PER ENGAGED OBSTACLE, not one lap for the nearest.
     *
     * See ObstacleField.nearAll. A rail in this town almost always has a
     * lamp post beside it, and choosing between them at the millisecond the
     * question is asked cut real powerloops into pieces. So the recogniser
     * winds around everything within reach at once, and whichever produced
     * an actual lap is the one that names the trick.
     *
     * Bounded and pooled: at most MAX_PATH_RUNS live at a time, taken
     * nearest first, and the objects are recycled so the hot path does not
     * allocate.
     */
    this.paths = [];
    this.pathPool = [];
    this.engaged = [];
    /*
     * THE PATH, measured from the path. One of them, because the craft has
     * one trajectory. See PathTrack.
     */
    this.track = new PathTrack();
    /*
     * HOW THE RECOGNISER ASKS THE WORLD A QUESTION, and the only way it
     * does. One method, gapAt(x, y, z, maxR), which is the distance to the
     * nearest solid or Infinity if there is none within maxR: exactly what
     * src/game/collide.js already answers for the wall tricks. The shell and
     * the rigs supply it; a caller that does not is simply flying in open
     * air as far as this file is concerned, which is the safe way round.
     */
    this.solids = null;
    /* The last turn it closed, as plain numbers, for a rig to read. Nothing
     * in the matcher looks at this yet. */
    this.lastTurn = null;
    /*
     * Net turns on each axis since the run began, never reset. A path run
     * reads the difference across its own window to find out what the craft
     * was DOING while it went round, which is the only thing separating a
     * Powerloop from a Maverick Loop: the path is identical and one of them
     * flips.
     */
    this.totalTurns = [0, 0, 0];
    /*
     * Rotation primitives that closed while a path run was open. They are
     * held rather than buffered, because if the loop turns out to be a
     * Powerloop then its flip is PART of the Powerloop and scoring it again
     * as a Flip would pay twice for one motion. If the loop names nothing,
     * they are released into the buffer and scored on their own.
     */
    this.heldByPath = [];
    /*
     * Windows of laps that have already been NAMED, so a rotation that was
     * part of one but had not finished when the lap closed can still be
     * absorbed. An orbit's yaw is exactly that: the craft yaws continuously
     * for the whole orbit and for a moment after, so the yaw run closes
     * after the lap does and `heldByPath` never sees it. Without this an
     * Orbit x2 scores as an Orbit and then two Yaw Spins.
     */
    this.lapWindows = [];
    /* The distinct obstacles this run has flown around, in the order they
     * were first used. See groupOf. */
    this.groups = [];
    this.haveFwd = false;
    this.haveUp = false;
    this.fwdX = 0;
    this.fwdY = 0;
    this.fwdZ = 0;
    this.pending = [];
    this.nowMs = 0;
    this.lastCloseMs = -1e9;
    this.stallMs = 0;
    /* Stall accumulated since the last primitive closed, handed to the next
     * primitive and then cleared. */
    this.gapStallMs = 0;
    /* A contact seen since the current pending group started, so a trick
     * flown into a wall is marked BUMP rather than CLEAN. */
    this.touched = false;
    /* When the last contact was, so a rotation can record that it happened
     * during one. Negative infinity is "never touched anything". */
    this.tapAtMs = -1e9;
    /* The nearest solid seen since the last rotation closed, in metres.
     * Infinity is open sky. See near(). */
    this.nearest = Infinity;
    this.enabled = true;
  }

  /* Forget everything. Called when a run resets, and after a crash, because
   * a half roll from before the crash must not combine with a half roll
   * after it into an Invert Rewind that nobody flew. */
  reset() {
    for (const r of this.runs) {
      r.reset();
    }
    for (const run of this.paths) {
      run.reset();
      this.pathPool.push(run);
    }
    this.paths.length = 0;
    this.track.reset();
    this.heldByPath.length = 0;
    this.lapWindows.length = 0;
    this.groups.length = 0;
    this.pending.length = 0;
    this.lastCloseMs = -1e9;
    this.stallMs = 0;
    this.gapStallMs = 0;
    this.touched = false;
    this.tapAtMs = -1e9;
    this.nearest = Infinity;
  }

  /* A new run: forget the buffers and put the clock back to zero, so the
   * detector's own milliseconds stay level with the shell's sim clock. */
  restart() {
    this.reset();
    this.nowMs = 0;
  }

  /*
   * The craft touched something without ending the run.
   *
   * TWO THINGS COME OUT OF ONE CONTACT, and they pull opposite ways.
   *
   * The workbook's BUMP is "complete trick, but tapped a gate, wall or the
   * ground without disarming", and it costs half the points. That is an
   * ACCIDENT: the pilot clipped something on the way past.
   *
   * But a whole family of tricks is the contact. Wall Tap, Roll Tap, Loop
   * Tap, Ceiling Tap, Downtown Tap, Maverick Tap Rewind and Power Switch
   * Tap are ten tricks in the catalogue whose entire point is to touch the
   * object deliberately, and under the old code every one of them would
   * have been charged half its points for succeeding.
   *
   * So a contact records BOTH: `touched`, which still grades a trick BUMP,
   * and `tapAtMs`, which a pattern can ASK for. A pattern that asks clears
   * the bump, because the contact it is being charged for is the trick. A
   * pattern that does not ask is unaffected and still pays. See emit.
   */
  /*
   * How near the craft is to something solid, in metres, once a frame.
   *
   * The Wall Tricks that do NOT touch the wall need this and nothing else
   * can give it to them. A Wall Ride is "a 90 degree roll away from the
   * wall a few inches from it, glide alongside, roll back", and its
   * rotation signature, a quarter roll out and a quarter roll back, is also
   * what banking round a corner looks like. The wall is the whole trick and
   * the recogniser could not see it.
   *
   * FRAME RATE, NOT STEP RATE, and that is the reason this is affordable.
   * "Was the craft close to something while it did this" is a coarse
   * question and a broadphase query per millisecond would be sixty times
   * the work for an answer that does not change that fast. The shell asks
   * once a frame with an inflated radius, which is a query it already makes
   * every frame for contact, and the detector only records the smallest
   * answer it saw during a run.
   */
  near(metres) {
    if (metres < this.nearest) {
      this.nearest = metres;
    }
  }

  bump(impulse, tappable = true) {
    this.touched = true;
    /*
     * THE GROUND IS NOT A TAPPABLE SURFACE.
     *
     * Every tap trick in the catalogue taps a STRUCTURE: a wall, a ceiling,
     * the underside of a bar, the side of a building. None of them tap the
     * floor. The ground contact path in main.js called this with no impulse
     * at all, which the rule below reads as gentle, so setting the quad
     * down or scuffing the bottom plate on a landing set a tap, the tap
     * attached itself to the next rotation the pilot flew, and a pitch back
     * and forward after a scrape came out a Wall Tap. Reported from real
     * play: "crashing or bottom plate hitting the floor is scored as a wall
     * tap". It is still a BUMP, because clipping the ground should still
     * cost the grade; it is simply not a tap.
     *
     * Only a GENTLE contact is a tap. A wall trick is flown at walking pace
     * into the wall and a crash is not, so without this every hard smack
     * would offer itself as a 300 point Ceiling Tap. An impulse the caller
     * did not measure is treated as gentle, which keeps the old one
     * argument callers working and is the safe way round for a grade that
     * only ever REMOVES the bump penalty.
     */
    if (tappable && (impulse === undefined || impulse <= GRAZE_SPEED_MAX)) {
      this.tapAtMs = this.nowMs;
    }
  }

  /*
   * A step in which the craft was NOT being flown: sitting on the ground,
   * or upside down waiting to be turtled over.
   *
   * THE TWO CLOCKS HAVE TO STAY LEVEL AND THEY DID NOT. The shell advances
   * simTimeMs on every physics step, but it only feeds this detector on the
   * steps where the craft is airborne, so nowMs fell behind simTimeMs by
   * however long the pilot spent on the ground. Every run starts landed, so
   * every run started with the two clocks already apart. The scorer is
   * ticked on simTimeMs and compares it against a combo window measured
   * from a trick's endMs, which is on THIS clock: after more than the combo
   * window's three seconds on the ground, every combo therefore banked on
   * the very next tick, at a multiplier of one, and the chain a pilot
   * thought they were building never existed.
   *
   * Advancing the clock here rather than feeding the detector the landed
   * steps is the deliberate half of the choice. Feeding it would let a
   * quad sitting on the grass score a Yaw Spin off the gyro noise. This
   * advances the clock and the stall counter, which is the truth about a
   * craft that is not moving, and reads no motion at all.
   */
  idle(dtMs) {
    if (!this.enabled) {
      return;
    }
    this.nowMs += dtMs;
    this.stallMs += dtMs;
    this.gapStallMs += dtMs;
    /* Whatever was in the air a moment ago can be named now. Nothing new
     * will arrive to lengthen it: the craft is on the ground. */
    this.drain(false);
  }

  /*
   * Which THING was flown around, as a small integer that survives a
   * railing being built out of six collinear boxes.
   *
   * The scorer needs this to charge for staying on one obstacle and to pay
   * for moving between them, and the collider id will not do: obstacles.js
   * carries sameAxis precisely because a town railing is a run of separate
   * boxes on one line, and a pilot who powerloops the near end and then the
   * far end has not moved to a new obstacle. Ids would say they had, and
   * would hand out the variety bonus for standing still.
   *
   * A run touches a handful of obstacles, so the list stays short and the
   * scan stays cheap. It is cleared with everything else on reset.
   */
  groupOf(ob) {
    for (let i = 0; i < this.groups.length; i += 1) {
      if (sameAxis(this.groups[i], ob)) {
        return i;
      }
    }
    this.groups.push(ob);
    return this.groups.length - 1;
  }

  /*
   * One physics step.
   *
   *   dt     seconds, the fixed step
   *   p q r  body rates, rad/s
   *   qx qy  the x and y components of the body to world quaternion, which
   *          is all the attitude this needs
   *   speed  m/s, for the stall test
   *   fx..   where the nose points, in the obstacles' own frame
   *   ux..   where the craft's UP points, same frame. Optional, and what it
   *          buys is the only thing that makes a lap's rotation measurable:
   *          with the nose and the up axis the lap axis can be resolved into
   *          the body, and the loop's own turn separated from the pilot's.
   *          See the de-banking in closePath.
   */
  step(dt, p, q, r, qx, qy, speed, wx, wy, wz, fx, fy, fz, ux, uy, uz) {
    if (!this.enabled) {
      return;
    }
    /* Where the nose points, in the obstacles' own frame. Optional: without
     * it nothing that is defined by what the pilot was looking at can be
     * named, which is the safe way round. */
    this.haveFwd = fx !== undefined;
    if (this.haveFwd) {
      this.fwdX = fx;
      this.fwdY = fy;
      this.fwdZ = fz;
    }
    /*
     * The three body axes, in the world. roll turns about the nose, pitch
     * about the right wing and yaw about the up axis, and right is the
     * cross of the other two. Only the ALIGNMENTS matter downstream and a
     * consistent sign error in `right` cancels between them, so the handed
     * ness of this cross does not have to be argued: what must be right is
     * that p, q and r go with the nose, the wing and the up axis, and they
     * do. See axisStep, which is fed p, q, r in that order.
     */
    this.haveUp = ux !== undefined && this.haveFwd;
    if (this.haveUp) {
      this.upX = ux;
      this.upY = uy;
      this.upZ3 = uz;
      this.rgtX = fy * uz - fz * uy;
      this.rgtY = fz * ux - fx * uz;
      this.rgtZ = fx * uy - fy * ux;
    }
    const dtMs = dt * 1000;
    this.nowMs += dtMs;
    if (speed < STALL_SPEED) {
      this.stallMs += dtMs;
      this.gapStallMs += dtMs;
    } else {
      this.stallMs = 0;
      /*
       * THE STALL THAT COUNTS IS THE ONE THE TRICK STARTS FROM.
       *
       * gapStallMs used to accumulate every stalled millisecond since the
       * last primitive closed and never reset on motion, so it meant "how
       * much of this run has been spent stopped" rather than "was the craft
       * stopped when this began". A pilot who hovered on the pad, flew for
       * half a minute and then landed a clean Flip was handed a Flip Stall
       * Rewind, which is a different trick at a different price, and it was
       * reproduced every single time in the town.
       *
       * Both readers want the contiguous one. A Stall Rewind is stop and
       * then rotate. Segmented Flips are rotate, PAUSE, rotate, and the
       * pause is contiguous with the rotation that follows it too.
       */
      this.gapStallMs = 0;
    }
    const upZ = 1 - 2 * (qx * qx + qy * qy);
    /* This step's rates, so a lap can resolve them onto its own axis. */
    this.pNow = p;
    this.qNow = q;
    this.rNow = r;
    this.totalTurns[AXIS_ROLL] += (p * dt) / TURN;
    this.totalTurns[AXIS_PITCH] += (q * dt) / TURN;
    this.totalTurns[AXIS_YAW] += (r * dt) / TURN;
    /*
     * THE PATH BEFORE THE ROTATIONS, because closing a path run has to be
     * able to claim the rotation primitives that happened inside it, and a
     * rotation that closes on the same millisecond the loop does belongs to
     * the loop.
     */
    this.trackStep(dt, dtMs, wx, wy, wz, upZ);
    if (this.obstacles) {
      this.pathStep(dt, dtMs, wx, wy, wz, upZ);
    }
    this.axisStep(this.runs[AXIS_ROLL], p, dtMs, upZ);
    this.axisStep(this.runs[AXIS_PITCH], q, dtMs, upZ);
    this.axisStep(this.runs[AXIS_YAW], r, dtMs, upZ);
    this.drain(false);
  }

  /*
   * ONE STEP OF THE PATH'S OWN TURNING.
   *
   * Everything here comes from the craft: where it is, which way it is
   * going, and how its own frame is rotating. Nothing is derived from the
   * world, so a loop flown around a wall, a roof edge or nothing at all is
   * measured exactly as one flown around a rail.
   */
  trackStep(dt, dtMs, wx, wy, wz, upZ) {
    const tr = this.track;
    /* The nose and the up axis are what make the measurement possible: they
     * carry the craft's own frame, which is where the rotation comes from.
     * Without them there is nothing to measure and nothing is claimed, which
     * is the safe way round. */
    if (!this.haveUp) {
      tr.have = false;
      tr.haveT = false;
      tr.haveE = false;
      return;
    }
    if (!tr.have) {
      tr.px = wx;
      tr.py = wy;
      tr.pz = wz;
      tr.have = true;
      tr.snapshot(wx, wy, wz, this.nowMs);
      return;
    }
    const vx = (wx - tr.px) / dt;
    const vy = (wy - tr.py) / dt;
    const vz = (wz - tr.pz) / dt;
    tr.px = wx;
    tr.py = wy;
    tr.pz = wz;
    const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);

    /*
     * THE FRAME'S OWN ANGULAR VELOCITY, from the frame.
     *
     * omega = half the sum over the body axes of e cross e-dot. It needs no
     * agreement about what the sign of a gyro channel means, which is the
     * one thing this file has been caught by repeatedly.
     */
    let ox = 0;
    let oy = 0;
    let oz = 0;
    if (tr.haveE && dt > 0) {
      const k = 0.5 / dt;
      ox = k * ((tr.efy * this.fwdZ - tr.efz * this.fwdY)
        + (tr.euy * this.upZ3 - tr.euz * this.upY)
        + (tr.ery * this.rgtZ - tr.erz * this.rgtY));
      oy = k * ((tr.efz * this.fwdX - tr.efx * this.fwdZ)
        + (tr.euz * this.upX - tr.eux * this.upZ3)
        + (tr.erz * this.rgtX - tr.erx * this.rgtZ));
      oz = k * ((tr.efx * this.fwdY - tr.efy * this.fwdX)
        + (tr.eux * this.upY - tr.euy * this.upX)
        + (tr.erx * this.rgtY - tr.ery * this.rgtX));
    }
    tr.efx = this.fwdX;
    tr.efy = this.fwdY;
    tr.efz = this.fwdZ;
    tr.eux = this.upX;
    tr.euy = this.upY;
    tr.euz = this.upZ3;
    tr.erx = this.rgtX;
    tr.ery = this.rgtY;
    tr.erz = this.rgtZ;
    tr.haveE = true;

    /* Too slow for a direction of travel to mean anything. Hold the turn
     * open but stop counting, the same way a lap holds through the top of a
     * loop where the craft is barely moving. */
    if (sp < PATH_MIN_SPEED) {
      tr.haveT = false;
      if (!tr.open) {
        tr.snapshot(wx, wy, wz, this.nowMs);
      }
      return;
    }
    const tx = vx / sp;
    const ty = vy / sp;
    const tz = vz / sp;
    if (!tr.haveT) {
      tr.htx = tx;
      tr.hty = ty;
      tr.htz = tz;
      tr.haveT = true;
      if (!tr.open) {
        tr.snapshot(wx, wy, wz, this.nowMs);
      }
      return;
    }

    /* How far the tangent turned, as a vector: its length is the angle and
     * its direction is the axis. */
    const dx = tr.hty * tz - tr.htz * ty;
    const dy = tr.htz * tx - tr.htx * tz;
    const dz = tr.htx * ty - tr.hty * tx;
    tr.htx = tx;
    tr.hty = ty;
    tr.htz = tz;
    const dmag = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const rate = dmag / dt / TURN;
    tr.rate += (rate - tr.rate) * 0.02;
    /*
     * THE RADIUS COMES OFF THE FILTERED RATE, not off one millisecond's own
     * turning. A thousandth of a turn is a small number to divide by, so the
     * per sample radius is enormously noisy, and it is used for two things
     * that noise ruins: where the middle of the figure is, and how wide the
     * figure was. Measured with the raw number, a loop commanded at 3.4 m
     * reported a mean radius of 5.0 m and put its own centre a metre and a
     * half off the rail it was flown around. The filtered rate is the same
     * quantity with fifty milliseconds of smoothing on it, which is what the
     * gate already trusts.
     */
    const radius = tr.rate > 1e-9 ? sp / (tr.rate * TURN) : Infinity;
    /*
     * HYSTERESIS, AND THE RIGHT WAY ROUND. Opening takes the ON gate;
     * carrying on takes the OFF gate, which is well below it. Gating the
     * ACCUMULATION on the opening threshold instead is the same mistake the
     * old path side made with its two constants, arrived at from the other
     * direction: a real figure is not flown at a constant rate, so a dive
     * that eases through the bottom of its own arc dropped under the opening
     * gate and the turn came apart. Measured before this, a flown Matty Flip
     * split into a 0.32 and a 0.58 where one half turn had been flown.
     */
    const opening = tr.rate >= PATH_TURN_ON && radius <= PATH_MAX_RADIUS;
    const circling = tr.open
      ? tr.rate >= PATH_TURN_OFF && radius <= PATH_MAX_RADIUS
      : opening;

    if (!tr.open) {
      tr.snapshot(wx, wy, wz, this.nowMs);
      if (opening) {
        tr.openAt(this.nowMs, this.gapStallMs);
      }
      return;
    }

    /*
     * ONLY WHILE IT IS ACTUALLY TURNING, and this is the difference between
     * a measurement and a running total.
     *
     * Counting every sample once the turn is open banks the entry ramp, the
     * exit and every heading correction in between, all of which curve a
     * little. Measured before this gate: a commanded whole loop read 1.17
     * turns and a commanded half read 0.73, and the weighted centre came out
     * of samples whose own radius was fifty metres and more, which put the
     * turn's middle nowhere near the middle of the turn and made the side
     * tests read backwards. The samples that turned through nothing have
     * nothing to say about how far round the craft went or about where the
     * middle was.
     */
    if (!circling) {
      if (tr.rate < PATH_TURN_OFF) {
        tr.offMs += dtMs;
      }
      if (tr.back / TURN >= PATH_TURN_REVERSE
        || tr.offMs >= PATH_TURN_HOLD_MS
        || this.nowMs - tr.startMs >= PATH_MAX_MS) {
        this.closeTrack();
      }
      return;
    }
    tr.offMs = 0;
    /* Accumulate. Weighted by how far this sample actually turned, so a
     * sample that turned through nothing cannot vote on the axis. */
    tr.tx += dx;
    tr.ty += dy;
    tr.tz += dz;
    tr.wx += ox * dt;
    tr.wy += oy * dt;
    tr.wz += oz * dt;
    tr.rollT += (ox * tx + oy * ty + oz * tz) * dt / TURN;
    tr.spanSamples += 1;
    tr.fwdSum += this.fwdX * tx + this.fwdY * ty + this.fwdZ * tz;
    if (upZ < 0) {
      tr.invSamples += 1;
    }
    if (dmag > 1e-12) {
      const inv = 1 / dmag;
      const nx = dx * inv;
      const ny = dy * inv;
      const nz = dz * inv;
      const nose = nx * this.fwdX + ny * this.fwdY + nz * this.fwdZ;
      const an = nose < 0 ? -nose : nose;
      let across = 1 - an * an;
      across = across > 0 ? Math.sqrt(across) : 0;
      tr.alongNose += an * dmag;
      tr.acrossNose += across * dmag;
      tr.alignW += dmag;
      /* Toward the centre of this sample's own turn: the turning axis
       * crossed into the direction of travel. */
      const ix = ny * tz - nz * ty;
      const iy = nz * tx - nx * tz;
      const iz = nx * ty - ny * tx;
      const cxs = wx + ix * radius;
      const cys = wy + iy * radius;
      const czs = wz + iz * radius;
      tr.cx += cxs * dmag;
      tr.cy += cys * dmag;
      tr.cz += czs * dmag;
      tr.rSum += radius * dmag;
      if (radius < tr.minR) {
        tr.minR = radius;
      }
      if (radius > tr.maxR) {
        tr.maxR = radius;
      }
      /* Is the middle of the turn on the screen? The same lens the orbit
       * has always been judged by. */
      if (this.haveFwd) {
        const tox = cxs - wx;
        const toy = cys - wy;
        const toz = czs - wz;
        const tl = Math.sqrt(tox * tox + toy * toy + toz * toz);
        if (tl > 1e-9) {
          const d2 = (tox * this.fwdX + toy * this.fwdY + toz * this.fwdZ) / tl;
          if (d2 >= TRACK_DOT) {
            tr.trackSamples += 1;
          }
        }
      }
      /* Out and back is not a turn. Measured against the turning already
       * banked, so a wobble cancels itself and a real reversal does not. */
      const tl2 = Math.sqrt(tr.tx * tr.tx + tr.ty * tr.ty + tr.tz * tr.tz);
      if (tl2 > 1e-9) {
        const along = (dx * tr.tx + dy * tr.ty + dz * tr.tz) / tl2;
        if (along < 0) {
          tr.back -= along;
        } else if (tr.back > 0) {
          tr.back -= along;
          if (tr.back < 0) {
            tr.back = 0;
          }
        }
      }
    }
    tr.tailMs = this.nowMs;
    tr.p1x = wx;
    tr.p1y = wy;
    tr.p1z = wz;
    if (tr.back / TURN >= PATH_TURN_REVERSE
      || this.nowMs - tr.startMs >= PATH_MAX_MS) {
      this.closeTrack();
    }
  }

  /*
   * Turn the accumulated turning into the numbers a pattern is written in.
   * Nothing reads them yet; the rigs do, so the measurement can be checked
   * against known flights before anything depends on it.
   */
  closeTrack() {
    const tr = this.track;
    if (!tr.open) {
      return null;
    }
    tr.open = false;
    tr.offMs = 0;
    const mag = Math.sqrt(tr.tx * tr.tx + tr.ty * tr.ty + tr.tz * tr.tz);
    tr.rate = 0;
    if (!(mag > 1e-9) || tr.alignW <= 0 || tr.spanSamples <= 0) {
      return null;
    }
    const inv = 1 / mag;
    const ax = tr.tx * inv;
    const ay = tr.ty * inv;
    const az = tr.tz * inv;
    const wInv = 1 / tr.alignW;
    const cx = tr.cx * wInv;
    const cy = tr.cy * wInv;
    const cz = tr.cz * wInv;
    /* The rotation about the turn's own axis, and about world up. Both are
     * one dot product because the axes are fixed over the turn. */
    const loop = (tr.wx * ax + tr.wy * ay + tr.wz * az) / TURN;
    const spin = tr.wy / TURN;
    const along = tr.alongNose * wInv;
    const across = tr.acrossNose * wInv;
    const meanR = tr.rSum * wInv;
    let solidGap = Infinity;
    if (this.solids && typeof this.solids.gapAt === 'function' && meanR > 1e-6) {
      solidGap = this.solids.gapAt(cx, cy, cz, meanR);
    }
    const solidInside = solidGap < meanR * OBJECT_INSIDE;
    const out = {
      turns: mag / TURN,
      /* A loop in a vertical plane turns about a HORIZONTAL axis, and an
       * orbit about a vertical one. The bar is generous because a loop flown
       * with the nose wandering tilts its own axis. */
      axis: (ay < 0 ? -ay : ay) >= 0.7 ? 'vertical' : 'horizontal',
      axisY: ay,
      loop,
      rollT: tr.rollT,
      spin,
      /* Along the nose is a lap flown on ROLL, the Maverick family; across
       * it is a lap flown on PITCH, the Powerloop family. */
      loopOn: along >= across ? 'roll' : 'pitch',
      loopOwn: along >= across ? along : across,
      forward: tr.fwdSum / tr.spanSamples,
      invertedFrac: tr.invSamples / tr.spanSamples,
      trackFrac: this.haveFwd ? tr.trackSamples / tr.spanSamples : -1,
      /* Which side of the turn's own centre each end was on. This is what
       * replaces a bar's under and over, and it needs no bar. */
      startBelow: tr.p0y < cy,
      endBelow: tr.p1y < cy,
      centre: [cx, cy, cz],
      minR: tr.minR === Infinity ? 0 : tr.minR,
      maxR: tr.maxR,
      radius: meanR,
      /*
       * IS ANYTHING SOLID INSIDE THE CIRCLE THE CRAFT FLEW?
       *
       * This is all that is left of needing the world, and it is a question
       * about the flight rather than about a catalogue of axes: not "was
       * there a bar of the right shape in the right place", which is what
       * derived obstacles could answer and nothing else, but "did the craft
       * go around something". A wall, a roof edge, a building corner, a tree
       * and a rail all answer it the same way, and open air answers no.
       *
       * Half the flown radius, because a solid out at the rim is a thing the
       * craft flew PAST on its way round, not the thing it went around.
       */
      object: solidInside ? 'inside' : 'none',
      solidGap: solidGap,
      radiusRatio: tr.minR > 1e-6 && tr.minR !== Infinity ? tr.maxR / tr.minR : 1,
      startMs: tr.startMs,
      openMs: tr.openMs,
      endMs: tr.tailMs,
      stallBeforeMs: tr.startStallMs,
    };
    this.lastTurn = out;
    return out;
  }

  /*
   * One step of the path side: find the obstacle being flown, accumulate
   * the angle subtended at its axis, open and close the run.
   */
  pathStep(dt, dtMs, wx, wy, wz, upZ) {
    const n = this.obstacles.nearAll(wx, wy, wz, this.engaged, MAX_PATH_RUNS);
    /*
     * A LAP YOU HAVE STARTED IS YOURS UNTIL IT ENDS.
     *
     * This used to retire any run whose obstacle had fallen out of the
     * nearest N, open or not, which is exactly backwards for the trick it
     * matters most to. A Powerloop is flown UNDER a rail and round it, and
     * the bottom of that loop is the moment the craft is nearest the
     * ground and therefore nearest every kerb, post and bollard around it.
     * So the rail dropped out of the nearest six precisely halfway through
     * the lap, the run was closed on the spot, and the half lap that came
     * out named a Flip or nothing at all. Measured before this change, a
     * geometrically clean powerloop flown around forty real city bars named
     * Powerloop four times in eight; a Split-S named twice in eight.
     *
     * An open run is therefore stepped whether or not its obstacle is still
     * in reach, using the obstacle it already holds. It ends when the
     * winding stops or reverses, which is the run's own business, not when
     * a lamp post gets nearer.
     */
    for (let i = this.paths.length - 1; i >= 0; i -= 1) {
      const run = this.paths[i];
      if (run.open) {
        continue;
      }
      let still = false;
      for (let j = 0; j < n; j += 1) {
        if (sameAxis(run.obstacle, this.engaged[j].ob)) {
          still = true;
          break;
        }
      }
      if (still) {
        continue;
      }
      run.reset();
      this.paths.splice(i, 1);
      this.pathPool.push(run);
    }
    /*
     * Step every OPEN run first, so an obstacle the craft has flown past
     * still gets its millisecond. `stepped` marks the ones done here so the
     * engaged pass below does not wind them twice, which would double every
     * increment and turn one lap into two.
     */
    for (const run of this.paths) {
      run.stepped = false;
    }
    for (const run of this.paths) {
      if (run.open) {
        run.stepped = true;
        this.stepOneLap(run, run.obstacle, dt, dtMs, wx, wy, wz, upZ);
      }
    }
    /* Then wind around everything in reach, opening a lap for anything new. */
    for (let j = 0; j < n; j += 1) {
      const ob = this.engaged[j].ob;
      let run = null;
      for (const r of this.paths) {
        if (sameAxis(r.obstacle, ob)) {
          run = r;
          break;
        }
      }
      if (run && run.stepped) {
        continue;
      }
      if (!run) {
        if (this.paths.length >= MAX_PATH_RUNS) {
          continue;
        }
        run = this.pathPool.pop() || new PathRun();
        run.reset();
        run.obstacle = ob;
        this.paths.push(run);
      }
      run.stepped = true;
      this.stepOneLap(run, ob, dt, dtMs, wx, wy, wz, upZ);
    }
  }

  /* One millisecond of winding about one obstacle's axis. */
  stepOneLap(run, ob, dt, dtMs, wx, wy, wz, upZ) {
    /* Radius vector: the part of the offset perpendicular to the axis. */
    const rx = wx - ob.cx;
    const ry = wy - ob.cy;
    const rz = wz - ob.cz;
    const along = rx * ob.dx + ry * ob.dy + rz * ob.dz;
    const cx = rx - ob.dx * along;
    const cy = ry - ob.dy * along;
    const cz = rz - ob.dz * along;
    const len2 = cx * cx + cy * cy + cz * cz;
    if (len2 < PATH_MIN_RADIUS * PATH_MIN_RADIUS) {
      /* Too close to the axis for the angle to mean anything. Hold the run
       * open but stop counting, so a loop that clips the rail is still one
       * loop rather than two halves. */
      run.have = false;
      return;
    }
    if (!run.have) {
      run.px = cx;
      run.py = cy;
      run.pz = cz;
      run.have = true;
      return;
    }

    /*
     * The signed angle from the previous radius vector to this one, about
     * the axis. cross(prev, now) . axis, over the product of the lengths.
     */
    const crx = run.py * cz - run.pz * cy;
    const cry = run.pz * cx - run.px * cz;
    const crz = run.px * cy - run.py * cx;
    const signed = crx * ob.dx + cry * ob.dy + crz * ob.dz;
    const prevLen = Math.sqrt(run.px * run.px + run.py * run.py + run.pz * run.pz);
    const nowLen = Math.sqrt(len2);
    run.px = cx;
    run.py = cy;
    run.pz = cz;
    const dTurns = signed / (prevLen * nowLen * TURN);
    /*
     * A first order low pass on the winding rate. The raw per millisecond
     * angle is tiny and noisy; what decides whether a run opens is the
     * sustained rate, and 0.02 is about a 50 ms time constant.
     */
    const inst = dTurns / dt;
    run.rate += (inst - run.rate) * 0.02;
    const mag = run.rate < 0 ? -run.rate : run.rate;
    /* Metres per second around the axis, against metres per second towards
     * or away from it. See PATH_TANGENT_RATIO. */
    const tangent = mag * TURN * nowLen;
    const radial = (nowLen - prevLen) / dt;
    const circling = tangent >= PATH_TANGENT_ON
      && tangent >= (radial < 0 ? -radial : radial) * PATH_TANGENT_RATIO;
    const side = this.sideOf(ob, cx, cy, cz);
    run.windTotal += dTurns;
    /*
     * THE LOOP'S OWN TURN, integrated about the OBSTACLE'S axis.
     *
     * The lap axis resolved into the body gives the direction cosines
     * against the nose, the wing and the up axis, and the craft's rotation
     * about that axis is the body rates dotted with them. That number is
     * the same whatever bank the lap was flown at, which the body integrals
     * emphatically are not. See the de-banking in closePath.
     */
    if (this.haveUp) {
      const ar = ob.dx * this.fwdX + ob.dy * this.fwdY + ob.dz * this.fwdZ;
      const ap = ob.dx * this.rgtX + ob.dy * this.rgtY + ob.dz * this.rgtZ;
      const ay = ob.dx * this.upX + ob.dy * this.upY + ob.dz * this.upZ3;
      run.axisAcc += ((this.pNow * ar + this.qNow * ap + this.rNow * ay) * dt) / TURN;
      if (run.open) {
        /*
         * THE SUBTRACTION HAPPENS ENTIRELY IN THE BODY RATE DOMAIN.
         *
         * What is being removed is the craft's rotation ABOUT the rail, and
         * the honest measure of that is the body rates projected onto the
         * rail, which is the same quantity axisAcc is built from. Taking
         * the projection off each rate leaves the rotation perpendicular to
         * the rail, which is the pilot's, and it needs no two conventions
         * to agree with each other.
         *
         * It was written with the GEOMETRIC winding, `dTurns * ar` and so
         * on, and that was wrong in a way no constructed flight could show.
         * The winding is a cross product on positions in the renderer's
         * Y up frame; the body rates are Betaflight's, in the Z up right
         * handed frame CLAUDE.md pins the physics to. The two disagree
         * about sign, so the subtraction ADDED the lap's own turn instead
         * of removing it and every bar loop read about three times its real
         * rotation. Measured on the real town: a Powerloop whose raw body
         * integral was a clean -1.24 of pitch came out of the residual at
         * -2.40 and was named a 3/4 Flip. The sweep never caught it because
         * the sweep builds its attitudes out of the same position maths the
         * winding uses, so both were wrong the same way and cancelled.
         */
        run.windProj[AXIS_ROLL] += dTurns * ar;
        run.windProj[AXIS_PITCH] += dTurns * ap;
        run.windProj[AXIS_YAW] += dTurns * ay;
      }
      if (run.open && circling) {
        run.alignSum[AXIS_ROLL] += ar;
        run.alignSum[AXIS_PITCH] += ap;
        run.alignSum[AXIS_YAW] += ay;
        run.magRoll += ar < 0 ? -ar : ar;
        run.magPerp += Math.sqrt(ap * ap + ay * ay);
        run.alignN += 1;
      }
    }

    if (!run.open) {
      /* Keep the rolling record whether or not this becomes a lap. */
      const old = run.snapshot(side, this.nowMs, this.totalTurns);
      if (mag >= PATH_RATE_ON && circling) {
        /*
         * BACKDATE. The lap did not begin when the winding rate crossed
         * the gate, it began 800 ms ago when the craft committed to it,
         * and where the craft was THEN is what decides whether this is a
         * whole lap or a half. See PATH_LOOKBACK.
         */
        run.open = true;
        run.startWind = old.wind;
        /*
         * ZERO, not the backdated winding. acc exists only to say which way
         * this lap has gone SINCE it opened, and seeding it with 800 ms of
         * approach that may have wound the other way is what made the
         * reversal test below fire on the first millisecond of every lap.
         * The lap's own span is startWind to lastWind and is untouched by
         * this.
         */
        run.acc = 0;
        run.offMs = 0;
        run.startMs = old.ms;
        run.startSide = old.side;
        /*
         * THE ROTATION WINDOW IS NOT THE WINDING WINDOW.
         *
         * startWind and startSide are backdated because the winding rate
         * ramps and where the craft WAS decides whether this is a whole lap
         * or a half; that is what PATH_LOOKBACK was argued for. The
         * ROTATION has no such need, and taking it from the same backdated
         * sample gave the lap 800 ms of whatever the pilot did before it: a
         * yaw spin flown to line up on a rail was swallowed into the lap and
         * turned a plain Powerloop into an Inverted 360 Powerloop, a 650
         * point Master trick nobody flew. How much of that 800 ms existed at
         * all depended on approach speed, so the same trick read differently
         * from a fast entry and a slow one.
         *
         * From the gate, then, which is where the winding actually starts
         * now that PATH_RATE_ON is 0.08 rather than 0.35, and which is the
         * same instant startAxis is taken from so the two agree.
         */
        run.startRot[0] = this.totalTurns[0];
        run.startRot[1] = this.totalTurns[1];
        run.startRot[2] = this.totalTurns[2];
        /* From the gate too, so the residual spans the same window. */
        run.windProj[0] = 0;
        run.windProj[1] = 0;
        run.windProj[2] = 0;
        run.lastWind = run.windTotal;
        run.lastSide = side;
        run.lastMs = this.nowMs;
        run.lastRot[0] = this.totalTurns[0];
        run.lastRot[1] = this.totalTurns[1];
        run.lastRot[2] = this.totalTurns[2];
        run.dirSign = run.rate > 0 ? 1 : -1;
        run.backWind = 0;
        run.tailMs = this.nowMs;
        run.openMs = this.nowMs;
        /* Latched at open, for the reason a rotation's is. See axisStep. */
        run.startStallMs = this.gapStallMs;
        run.startAxis = run.axisAcc;
        run.lastAxis = run.axisAcc;
        run.alignSum[0] = 0;
        run.alignSum[1] = 0;
        run.alignSum[2] = 0;
        run.magRoll = 0;
        run.magPerp = 0;
        run.alignN = 0;
        run.invSamples = 0;
        run.trackSamples = 0;
        run.haveFwd = false;
        run.spanSamples = 0;
        run.minR = nowLen;
        run.maxR = nowLen;
      }
      return;
    }
    /*
     * Still going ROUND: this is where the lap currently ends, and this is
     * where which way up the craft is actually gets counted.
     *
     * `circling` is the half of this that matters, and it has to be here
     * as well as on the opening gate. Measured on the flown loop, a real
     * one round a real rail: the craft leaves at 14.5 m/s of radius
     * against 7.3 m/s around the axis, which is a departure by any reading
     * and still winds at 0.1 turns/s because a straight line subtends
     * angle. Counted, that creeping tail took the lap from 1.008 turns
     * ending UNDER the rail to 1.111 ending OVER it, which is a half lap,
     * and a flown Powerloop came out as a bare Flip. A slow orbit and this
     * departure are indistinguishable by rate alone: 0.17 turns/s and 8
     * m/s around the axis either way. They are never indistinguishable by
     * whether the radius is holding.
     */
    if (mag >= PATH_RATE_ON && circling) {
      /*
       * THE LAP ENDS AT ITS HIGH WATER MARK, not wherever the craft
       * happened to be standing when the run closed.
       *
       * This used to assign unconditionally, which quietly subtracts the
       * exit from the trick. A craft leaving a rail winds BACKWARDS for a
       * moment before the reversal test fires, and every millisecond of
       * that came off the lap: measured on the selftest's Matty Flip, a
       * genuine 0.625 turn half lap was recorded as 0.504 and refused by
       * HALF_LAP_MIN, which is 0.55. The trick was flown, the winding was
       * there, and the recogniser gave part of it back before looking.
       *
       * Compared on the SIGNED span rather than the sign of one
       * millisecond's angle, which at 1 kHz is a ten thousandth of a turn
       * and flips on arithmetic noise.
       */
      run.tailMs = this.nowMs;
      if ((run.windTotal - run.startWind) * run.dirSign
        > (run.lastWind - run.startWind) * run.dirSign) {
        run.lastWind = run.windTotal;
        run.lastSide = side;
        run.lastMs = this.nowMs;
        run.lastRot[0] = this.totalTurns[0];
        run.lastRot[1] = this.totalTurns[1];
        run.lastRot[2] = this.totalTurns[2];
        run.lastAxis = run.axisAcc;
      }
      run.spanSamples += 1;
      if (nowLen < run.minR) {
        run.minR = nowLen;
      }
      if (nowLen > run.maxR) {
        run.maxR = nowLen;
      }
      if (upZ < 0) {
        run.invSamples += 1;
      }
      /*
       * Is the object on the screen? The direction from the craft to the
       * axis is the negated radius vector; compare it with where the nose
       * points. No trigonometry: the dot product of two unit vectors is the
       * cosine and a cosine is what the threshold is written in.
       */
      if (this.haveFwd) {
        run.haveFwd = true;
        const inv = -1 / nowLen;
        const dot = cx * inv * this.fwdX + cy * inv * this.fwdY + cz * inv * this.fwdZ;
        if (dot >= TRACK_DOT) {
          run.trackSamples += 1;
        }
      }
    }
    /*
     * A reversal ends the lap: out and back is not a lap.
     *
     * Tested on the FILTERED rate, never on the raw per step angle. The raw
     * angle at 1 kHz is a ten thousandth of a turn and its sign flips on
     * arithmetic noise whenever the craft is barely winding at all, which
     * on the approach to an obstacle closed and reopened the run sixty
     * times in a row. The filter is the same one that decides whether a
     * lap is happening; it should decide which way it is going too.
     */
    /*
     * A reversal ends the lap: out and back is not a lap.
     *
     * Against dirSign, the direction fixed when the lap opened, and on the
     * FILTERED rate. Both matter. The raw per step angle is a ten
     * thousandth of a turn and its sign flips on rounding whenever the
     * craft is barely winding, which on one approach opened and closed the
     * run sixty times in a row. And comparing against a running total that
     * had been backdated over the approach reopened the same wound from the
     * other side: measured, 0.2 turns/s of prior drift round the obstacle,
     * which is ordinary flying, made the lap thrash ninety times and lose
     * its backdate, and a genuine Matty Flip came out as a bare 1/2 Flip.
     */
    if (run.dirSign !== 0) {
      const back = dTurns * run.dirSign;
      if (back < 0) {
        run.backWind -= back;
      } else if (run.backWind > 0) {
        run.backWind -= back;
        if (run.backWind < 0) {
          run.backWind = 0;
        }
      }
      if (run.backWind >= PATH_REVERSE_TURNS) {
        this.closePath(run, upZ);
        return;
      }
    }
    run.acc += dTurns;
    if (this.nowMs - run.startMs >= PATH_MAX_MS) {
      this.closePath(run, upZ);
      return;
    }
    if (mag < PATH_RATE_OFF) {
      run.offMs += dtMs;
      if (run.offMs >= PATH_OFF_HOLD_MS) {
        this.closePath(run, upZ);
      }
    } else {
      run.offMs = 0;
    }
  }

  /*
   * Which side of the axis the craft is on, as a sign.
   *
   * For a BAR this is above or below, and it is the path side's upZ: a lap
   * that starts under and ends under is a whole turn, one that starts under
   * and ends over is a half. For a POLE there is no such thing, so the
   * snap falls back to the plain nearest quarter.
   */
  sideOf(ob, cx, cy, cz) {
    void cx;
    void cz;
    if (ob.kind !== OB_BAR) {
      return 0;
    }
    return cy > 0 ? 1 : -1;
  }

  /* Turn an accumulated lap into a path primitive, or throw it away. */
  closePath(run, upZ) {
    const open = run.open;
    run.open = false;
    run.offMs = 0;
    /* The lap is the winding span, not the run's lifetime. */
    const acc = run.lastWind - run.startWind;
    run.acc = 0;
    const ob = run.obstacle;
    if (!open || !ob) {
      this.releaseHeld();
      return;
    }
    const mag = acc < 0 ? -acc : acc;
    if (mag < PATH_MIN_TURNS) {
      this.releaseHeld();
      return;
    }
    const endSide = run.lastSide;
    const turns = snapPathTurns(mag, ob.kind, run.startSide, endSide);
    if (turns <= 0) {
      this.releaseHeld();
      return;
    }
    /*
     * ONE MOTION IS ONE TRICK, even when it went round two things.
     *
     * A fence has a top rail and a bottom rail, a footbridge has a handrail
     * over its parapet, and a powerloop through either winds around BOTH.
     * Both laps are real, both are around a genuine bar, and both name a
     * Powerloop, so the pilot was paid twice for one loop. Measured on the
     * real town: of eight clean powerloops flown around real city bars, two
     * came out as "Powerloop + Powerloop" and one as three of them.
     *
     * Two laps that cover the same milliseconds are the same motion. The
     * one kept is the one with the most winding, which is the axis the
     * craft actually went round rather than the one it clipped the edge of.
     * This is the path side's twin of absorbedByLap, which does the same
     * job for a rotation that happened inside a lap.
     */
    /* How long the lap OCCUPIED, which is at least how far round it got. */
    const endMs = run.tailMs > run.lastMs ? run.tailMs : run.lastMs;
    const overlapping = this.sameMotionLap(run.startMs, endMs, mag);
    if (overlapping === 'drop') {
      this.heldByPath.length = 0;
      this.gapStallMs = 0;
      run.clearHistory();
      return;
    }
    this.insertPending({
      kind: 'path',
      obstacle: OB_KIND_NAME[ob.kind],
      obstacleId: ob.id,
      obstacleGroup: this.groupOf(ob),
      turns,
      dir: acc >= 0 ? 1 : -1,
      startMs: run.startMs,
      /* When the winding actually started, as against the backdated start
       * the lap's SIDES are read from. See insertPending. */
      orderMs: run.openMs,
      endMs,
      startSide: run.startSide,
      endSide,
      /* Net rotation while the lap was flown, per axis, in turns, with the
       * loop's own turn put back on one axis rather than smeared across
       * two by the bank the pilot happened to fly at. See debankLap. */
      rot: this.debankLap(run, turns),
      /* What the de-banking saw: the loop's own turn about the obstacle's
       * axis, and how that axis lay in the body. Diagnostics for the rig;
       * nothing in the matcher reads them. */
      spin: run.alignN > 0 ? run.lastAxis - run.startAxis : 0,
      bodyRot: run.lastRaw ? run.lastRaw.slice() : null,
      resid: run.lastResid ? run.lastResid.slice() : null,
      align: run.alignN > 0
        ? [run.alignSum[0] / run.alignN, run.alignSum[1] / run.alignN,
          run.alignSum[2] / run.alignN]
        : null,
      own: run.alignN > 0 ? [run.magRoll / run.alignN, run.magPerp / run.alignN] : null,
      upZ,
      /* The fraction of the lap flown belly up, 0 to 1. See PathRun. */
      invertedFrac: run.spanSamples > 0 ? run.invSamples / run.spanSamples : 0,
      /* How much the distance to the axis breathed across the lap, max over
       * min. Nothing reads it yet; it is the measurement the half lap floor
       * needs before it can come down. See HALF_LAP_MIN. */
      radiusRatio: run.minR > 1e-6 ? run.maxR / run.minR : 1,
      /* The unsnapped sweep, kept so two laps of the same motion can be
       * compared before either has been named. See sameMotionLap. */
      rawTurns: mag,
      /* A gentle contact during the lap or just either side of it, so
       * Maverick Tap Rewind and Power Switch Tap can ask for the tap at the
       * top of the loop. Same field and same window a rotation carries. */
      tapped: this.tapAtMs >= run.startMs - TAP_WINDOW_MS
        && this.tapAtMs <= run.lastMs + TAP_WINDOW_MS,
      /*
       * The fraction of the lap with the object on the screen, or -1 when
       * the caller supplied no heading. Minus one FAILS a tracking test
       * rather than passing it: a recogniser that cannot see where the nose
       * was pointing must not hand out a trick that is defined by it.
       */
      trackFrac: run.haveFwd && run.spanSamples > 0
        ? run.trackSamples / run.spanSamples
        : -1,
      stallBeforeMs: run.startStallMs ?? 0,
      slowMs: 0,
      touched: this.touched,
      /* The rotations that happened inside this lap, kept so they can be
       * given back if the lap names nothing. */
      held: this.heldByPath.slice(),
    });
    this.heldByPath.length = 0;
    this.gapStallMs = 0;
    this.lastCloseMs = this.nowMs;
    /* A finished lap must not be visible to the next one's lookback. */
    run.clearHistory();
    this.drain(false);
  }

  /*
   * THE LOOP'S TURN BELONGS TO THE LOOP, NOT TO THE BANK IT WAS FLOWN AT.
   *
   * A lap's concurrent rotation used to be the plain time integral of the
   * BODY rates. Body axes tumble with the craft, so that is not "turns about
   * each axis": it is the craft's real rotation projected onto a frame that
   * is itself rotating, and for the loop family the error is not a subtle
   * second order term, it is a first order one with a closed form.
   *
   * Fly a Powerloop. The nose stays tangent, so the rail's axis is
   * perpendicular to the nose, but it sits at the BANK ANGLE phi in the
   * plane of the wing and the up axis. The gyro therefore reads
   *
   *     q = Omega cos(phi),   r = Omega sin(phi)
   *
   * and the integral comes out rot = [0, cos(phi), sin(phi)], whose pitch
   * and yaw always square to one. At 45 degrees of bank, which is ordinary
   * when the rail sits diagonal to the approach, that is [0, 0.71, 0.71]:
   * Powerloop pays one slack for a pitch error of 0.29, Donkey Loop pays one
   * for a yaw error of 0.29, they tie on length and slack, and Donkey Loop
   * is worth 600 against Powerloop's 200 so the dearer name wins. The pilot
   * never touched the yaw stick and the craft never changed heading in any
   * world sense. Past about 41 degrees of bank a Powerloop WAS a Donkey Loop.
   *
   * So the loop's own turn is measured where it actually happens, about the
   * OBSTACLE'S axis, which is bank independent; the body integrals have that
   * turn subtracted out, leaving what the PILOT added; and the loop's turn is
   * then put back on whichever body axis its axis most lies along. A lap
   * flown nose across the rail lands it on pitch, which is a Powerloop; nose
   * along the rail lands it on roll, which is the Mavvy family; and a genuine
   * yaw spin inside the loop survives in the residual, which is what makes a
   * real Donkey Loop still a Donkey Loop.
   *
   * Falls back to the raw body integral when the caller supplied no up axis,
   * which is every test written before this existed and the safe way round.
   */
  /*
   * `snapped` is the lap's turn count AFTER snapping, which is the number
   * the pattern's `turns` is matched against. The lap's own rotation goes
   * back onto the owning body axis in THOSE units, not in the raw winding.
   *
   * A powerloop round the practice rail wound 1.34 turns, snapped to 1, and
   * had 1.34 of pitch put back on it, so the same primitive said turns 1 and
   * pitch 1.34 in one breath. Powerloop asks for pitch 1, 0.34 is outside
   * the band, and a 200 point trick came out a 50 point 3/4 Flip. Nothing
   * written in whole turns could ever have matched, because the two halves
   * of one primitive were being counted in different units.
   */
  debankLap(run, snapped) {
    const raw = [
      run.lastRot[0] - run.startRot[0],
      run.lastRot[1] - run.startRot[1],
      run.lastRot[2] - run.startRot[2],
    ];
    /* Diagnostics for the rigs: what the body integrals said before any of
     * this, beside what the per sample residual said. Nothing reads them. */
    run.lastRaw = raw;
    if (!this.haveUp || run.alignN <= 0) {
      return raw;
    }
    const align = [
      run.alignSum[0] / run.alignN,
      run.alignSum[1] / run.alignN,
      run.alignSum[2] / run.alignN,
    ];
    /*
     * THE LOOP'S OWN TURN IS HOW FAR ROUND IT WENT.
     *
     * A craft holding a circle points its thrust at the middle of it, so its
     * attitude turns exactly as far as its path does: the WINDING is the
     * loop's own rotation. The integral about the rail's axis is not, quite,
     * because anything else the pilot does that has a component along that
     * axis lands in it too. A 360 yaw spin inside a loop flown with bank is
     * exactly that: the craft's up axis is tilted towards the rail, so the
     * spin subtracts from the measured rotation about it, and at 30 degrees
     * the reading collapsed from 0.97 to 0.38 and an Inverted 360 Powerloop
     * went unnamed at every bank past 20.
     *
     * Taking the winding leaves that added rotation in the RESIDUAL, which
     * is where the pilot put it. The measured integral still supplies the
     * SIGN, because the winding has none of its own.
     */
    const measured = run.lastAxis - run.startAxis;
    const wound = run.lastWind - run.startWind;
    /*
     * WHICH WAY THE TWO CONVENTIONS RUN, read off this lap rather than
     * assumed. The winding is a cross product on positions in the
     * renderer's Y up frame; the body rates are Betaflight's, in the Z up
     * right handed frame the physics is pinned to. Whether those two agree
     * about sign is a property of the frames, not of the trick, but hard
     * coding it got it right for constructed flights and BACKWARDS for the
     * real shell, where the subtraction then added the lap's own turn
     * instead of removing it: every bar loop read about three times its
     * true rotation and a Powerloop came out a 3/4 Flip.
     *
     * A lap is dominated by its own turn, which is what makes it a lap, so
     * the sign the body saw it going and the sign the geometry saw it going
     * are one event seen twice, and their product IS the relation between
     * the frames. Measured, never assumed, and so right in either.
     */
    const conv = measured === 0 || wound === 0
      ? 0
      : (measured < 0 ? -1 : 1) * (wound < 0 ? -1 : 1);
    const size = snapped === undefined || snapped <= 0 ? Math.abs(wound) : snapped;
    const spin = measured === 0
      ? 0
      : size * (measured < 0 ? -1 : 1);
    /*
     * ROLL OR NOT ROLL, and for a rail that is the whole question.
     *
     * The lap's axis either lies along the NOSE, in which case going round
     * is a roll, or across it, in which case going round is a flip. Bank
     * only decides how that across-the-nose turn is SHARED between the wing
     * and the up axis, and sharing is not a different trick: a Powerloop
     * flown with fifty degrees of bank is a Powerloop flown untidily.
     *
     * Picking the single largest component got that wrong in the one place
     * it matters. Past 45 degrees the biggest share is the up axis, so the
     * loop's turn was called a YAW, the pitch came out zero, and a swept
     * Powerloop was named a Maverick Loop, which is the trick for a lap
     * flown WITHOUT a flip. Measured over a sweep of bank, turn error and
     * drift: fifteen percent of Powerloops named as something else.
     *
     * So the perpendicular pair is compared as ONE quantity against the
     * nose, and a rail's across-the-nose turn always lands on pitch. A POST
     * keeps all three, because a nose-tangent orbit of a vertical post
     * really is a yaw and calling it a flip would be the same mistake the
     * other way up.
     */
    /*
     * OWNERSHIP IS DECIDED PER SAMPLE, not on the average.
     *
     * Averaging the signed components cannot tell a craft ROLLING about its
     * nose from one YAWING through the lap: in both the wing and the up
     * axis sweep and both averages collapse. But a roll keeps the rail
     * permanently ACROSS the nose, so its per sample perpendicular
     * magnitude stays at one, while a yaw swings the rail between the nose
     * and the wing so both readings fall to about the same middling value.
     *
     * On the average alone a Cinnamon Roll, whose lap is defined by having
     * NO flip in it, was handed the loop's whole turn as pitch and came out
     * an Inverted 360 Powerloop: 650 points for a 175 point trick.
     */
    const roll = run.magRoll / run.alignN;
    const perp = run.magPerp / run.alignN;

    let best;
    let owned;
    if (roll >= perp) {
      best = AXIS_ROLL;
      owned = roll;
    } else {
      /*
       * PITCH OR YAW IS ALSO A QUESTION, and a rail used to be assumed to
       * answer it with pitch. It does not. A lap flown with the nose
       * sweeping the whole way round puts the rail on the craft's UP axis,
       * not across its wing, and forcing the loop's turn onto pitch there
       * manufactures a flip that was never flown: a Cinnamon Roll at 45
       * degrees of bank has the rail 0.71 along its up axis and 0.01 across
       * its wing, and came out an Inverted 360 Powerloop, 650 points for a
       * 175 point trick.
       *
       * A banked Powerloop is not the counterexample it looks like. Its
       * roll makes the yaw component average away, so the rail still sits
       * on pitch at 0.64 against a yaw of 0, and the comparison picks pitch
       * for it just as the old shortcut did.
       */
      best = Math.abs(align[AXIS_PITCH]) >= Math.abs(align[AXIS_YAW])
        ? AXIS_PITCH
        : AXIS_YAW;
      owned = perp;
    }
    /*
     * DECLINE ONLY WHEN IT IS GENUINELY AMBIGUOUS, which is when the two
     * candidates are close, not when the winner is merely small.
     *
     * An absolute floor got this wrong for any lap carrying a roll. A Power
     * Roll is a Powerloop with a roll at the peak of it, and while the craft
     * is rolling the rail's direction sweeps between the wing and the up
     * axis, so the MEAN perpendicular alignment across the lap comes out
     * about 0.64 even though the rail is plainly nowhere near the nose. The
     * floor of 0.72 refused it, the raw reading stood, the pitch read 0.56
     * against the 1 the pattern wants, and a 450 point Power Roll came out
     * as a bare Roll worth 50, on every sample of the sweep.
     *
     * The question was never "how aligned", it is "which of the two", so it
     * is answered by comparing them. A small absolute floor stays for the
     * case where the craft is tumbling and NEITHER owns it.
     */
    const other = best === AXIS_ROLL ? perp : roll;
    if (owned < DEBANK_MIN_OWN || owned < other * DEBANK_MARGIN) {
      return raw;
    }
    /*
     * The pilot's rotation: the body integrals with the LAP'S OWN turn
     * taken out one sample at a time, put into the body rates' own sign by
     * conv. This used to be raw minus spin times the MEAN alignment, which
     * is the same quantity only while the body axes hold still through the
     * lap. See PathRun.windProj.
     *
     * Only the lap's own turn comes out, not everything the craft did about
     * the rail. A Power Flip's added flip is about the rail too, so a
     * residual built by projecting ALL rotation about the axis away deleted
     * it: the lap measured a body rotation of 2 turns about the rail, kept
     * none of it, and a 350 point trick came out a 200 point Powerloop.
     */
    const out = [
      raw[0] - conv * run.windProj[0],
      raw[1] - conv * run.windProj[1],
      raw[2] - conv * run.windProj[2],
    ];
    run.lastResid = out.slice();
    /* The sign follows whichever component actually carries the turn, which
     * for a banked rail lap is the larger half of the perpendicular pair. */
    /* The winning axis carries the turn, so its own sign carries it too:
     * the bar special case that used to reach across to yaw here is gone,
     * because best already IS yaw whenever yaw is the larger half. */
    const signOf = align[best];
    out[best] += spin * (signOf < 0 ? -1 : 1);
    return out;
  }

  /*
   * Is a lap covering these milliseconds already buffered, and is it the
   * better reading of the same motion?
   *
   * Returns 'drop' when the incoming lap should be thrown away, and null
   * when it should be kept. When the incoming one is the better reading,
   * the buffered one is removed here so the caller can push in its place.
   * "Most of" is half the shorter span, the same bar absorbedByLap uses,
   * because the two questions are the same question about different kinds
   * of thing.
   */
  sameMotionLap(startMs, endMs, mag) {
    for (let i = 0; i < this.pending.length; i += 1) {
      const held = this.pending[i];
      if (held.kind !== 'path') {
        continue;
      }
      const lo = startMs > held.startMs ? startMs : held.startMs;
      const hi = endMs < held.endMs ? endMs : held.endMs;
      const shorter = Math.min(endMs - startMs, held.endMs - held.startMs);
      if (hi - lo <= shorter * 0.5) {
        continue;
      }
      /* The bigger sweep is the axis the craft went round. A tie keeps the
       * one already buffered, so the answer does not depend on which run
       * happened to close first. */
      if (mag > held.rawTurns) {
        this.pending.splice(i, 1);
        return null;
      }
      return 'drop';
    }
    return null;
  }

  /*
   * Does most of this rotation lie inside a lap that has already been
   * named? Half is the bar: a rotation that merely started during a lap and
   * ran on well past it is its own trick.
   */
  absorbedByLap(prim) {
    const dur = prim.endMs - prim.startMs;
    for (let i = this.lapWindows.length - 1; i >= 0; i -= 1) {
      const w = this.lapWindows[i];
      if (this.nowMs - w.e > 4000) {
        this.lapWindows.splice(0, i + 1);
        return false;
      }
      const lo = prim.startMs > w.s ? prim.startMs : w.s;
      const hi = prim.endMs < w.e ? prim.endMs : w.e;
      if (hi - lo > dur * 0.5) {
        return true;
      }
    }
    return false;
  }

  /*
   * A lap that named nothing hands its rotations back to the buffer, EXCEPT
   * any that a lap which DID get named has already paid for.
   *
   * That exception is not a detail. A powerloop's flip spans the whole lap
   * and finishes after it, and the winding does not stop cleanly at the
   * bottom: the craft flies out of the loop still turning a little, which
   * opens a second, meaningless lap. The flip ends up held by that second
   * lap, the second lap names nothing, and the flip is handed back and
   * scored as a Flip on top of the Powerloop that already contained it.
   */
  releaseHeld() {
    if (this.heldByPath.length === 0) {
      return;
    }
    /* Another lap may still be running and may still claim these. */
    if (this.anyPathOpen()) {
      return;
    }
    let released = 0;
    for (const prim of this.heldByPath) {
      if (this.absorbedByLap(prim)) {
        continue;
      }
      /*
       * ON THE END, deliberately, and not in flight order.
       *
       * These are rotations a lap was holding and has just declined to pay
       * for, so they are being reconsidered AFTER it. Sorting them back into
       * the middle of the buffer by when they were flown puts them alongside
       * the lap that just let them go, and the orbit sweep then scored an
       * Orbit x2 AND the two yaw spins inside it: paid twice for one motion,
       * which is the whole thing heldByPath exists to prevent.
       */
      this.pending.push(prim);
      released += 1;
    }
    this.heldByPath.length = 0;
    if (released > 0) {
      this.lastCloseMs = this.nowMs;
    }
  }

  /* One axis of one step: open, accumulate, close. */
  axisStep(run, rate, dtMs, upZ) {
    const mag = rate < 0 ? -rate : rate;
    if (!run.open) {
      if (mag >= RATE_ON) {
        run.open = true;
        run.acc = 0;
        run.offMs = 0;
        run.slowMs = 0;
        run.startMs = this.nowMs;
        run.startUpZ = upZ;
        /*
         * LATCHED AT OPEN, not read at close. gapStallMs resets the moment
         * the craft moves, which is right, but the primitive was reading it
         * when it CLOSED: by then the rotation itself had been flown, the
         * counter was back to zero, and stallBeforeMs was always 0, so
         * Flip Stall Rewind and 360 Stall Rewind could never fire at all.
         * The stall that makes a Stall Rewind is the one the trick starts
         * from, so it is taken when the run opens and carried to the prim.
         */
        run.startStallMs = this.gapStallMs;
        /* Zero, not one: this step falls through to the accumulate below
         * and is counted there, the same step that first goes into acc. */
        run.clearSamples();
      } else {
        return;
      }
    }
    /* A sign change ends the run before the new direction is counted into
     * it, which is what makes a rewind two primitives and not zero. */
    if (run.acc !== 0 && (run.acc > 0) !== (rate > 0) && mag >= RATE_OFF) {
      this.closeRun(run, upZ);
      if (mag >= RATE_ON) {
        run.open = true;
        run.acc = rate * (dtMs / 1000);
        run.offMs = 0;
        run.slowMs = 0;
        run.startMs = this.nowMs;
        run.startUpZ = upZ;
        /*
         * LATCHED AT OPEN, not read at close. gapStallMs resets the moment
         * the craft moves, which is right, but the primitive was reading it
         * when it CLOSED: by then the rotation itself had been flown, the
         * counter was back to zero, and stallBeforeMs was always 0, so
         * Flip Stall Rewind and 360 Stall Rewind could never fire at all.
         * The stall that makes a Stall Rewind is the one the trick starts
         * from, so it is taken when the run opens and carried to the prim.
         */
        run.startStallMs = this.gapStallMs;
        /* This branch returns rather than falling through, and it has
         * already put this step into acc, so it counts the step itself. */
        run.clearSamples();
        run.sample(upZ);
      }
      return;
    }
    run.sample(upZ);
    run.acc += rate * (dtMs / 1000);
    if (mag < RATE_OFF) {
      run.offMs += dtMs;
      run.slowMs += dtMs;
      if (run.offMs >= RATE_OFF_HOLD_MS) {
        this.closeRun(run, upZ);
      }
    } else {
      run.offMs = 0;
    }
  }

  /* Turn an accumulated run into a primitive, or throw it away. */
  closeRun(run, upZ) {
    const raw = run.acc / TURN;
    const turns = snapTurns(raw, run.axis, run.startUpZ, upZ);
    const open = run.open;
    run.open = false;
    const acc = run.acc;
    run.acc = 0;
    run.offMs = 0;
    const slow = run.slowMs;
    run.slowMs = 0;
    const frac = run.invertedFrac();
    run.clearSamples();
    /* Read before the reset below, so the primitive carries the closest
     * approach during ITS OWN run rather than the whole flight's. */
    const nearest = this.nearest;
    this.nearest = Infinity;
    if (!open || turns <= 0) {
      return;
    }
    const prim = {
      kind: 'rot',
      axis: run.axis,
      turns,
      dir: acc >= 0 ? 1 : -1,
      startMs: run.startMs,
      endMs: this.nowMs,
      /* Time stalled between the previous primitive and this one, which the
       * Segmented pattern asks about. The rotation's own duration is not
       * stall time, so this is the value LATCHED WHEN THE RUN OPENED rather
       * than the counter now: see axisStep. */
      stallBeforeMs: run.startStallMs ?? 0,
      slowMs: slow,
      touched: this.touched,
      /* The fraction of the rotation flown belly up, 0 to 1. See Run. */
      invertedFrac: frac,
      /*
       * Did the craft touch something while this rotation was running, or
       * in the moment either side of it? A wall tap is a 90 degree pitch
       * back, a touch, and a 90 degree pitch forward, and the touch does
       * not land in the middle of the buffer: it happens while a rotation
       * is open and the rotation closes afterwards. So it is recorded ON
       * the rotation rather than as an element between two of them, which
       * is also what makes it robust to the order the two arrive in.
       */
      /*
       * A TAP ATTACHES TO THE ROTATION THAT FOLLOWS IT, NOT THE ONE BEFORE.
       *
       * This is read when the run CLOSES, so a contact that happens after
       * that moment can never reach back to it however wide the window is.
       * A wall tap is pitch back, touch, pitch forward, and the touch lands
       * between the two: it is the SECOND rotation that carries it. So a
       * pattern asks for the tap on the step after the contact, which reads
       * oddly until you notice it is also how a pilot describes it. The
       * window reaching backwards is for a contact DURING the rotation,
       * which is the Roll Tap and the Ceiling Tap.
       */
      tapped: this.tapAtMs >= run.startMs - TAP_WINDOW_MS
        && this.tapAtMs <= this.nowMs + TAP_WINDOW_MS,
      /* The nearest solid while this rotation was running. See near(). */
      nearest,
      /*
       * IN FLIGHT ORDER, not closure order: a lap opens before the rotation
       * inside it and closes after, so buffering on close puts the lap after
       * primitives that happened later and every pattern is a sequence. A
       * rotation is ordered on when it FINISHED. See insertPending.
       *
       * Set HERE rather than at the one call that buffers it, because a
       * rotation that gets held and comes back through releaseHeld or the
       * drain handback never passes that call, and used to sit in the buffer
       * with no key at all while everything around it had one.
       */
      orderMs: this.nowMs,
    };
    this.gapStallMs = 0;
    /*
     * A rotation that happened INSIDE a lap is held, not buffered. The flip
     * of a Powerloop is part of the Powerloop; buffering it would let the
     * matcher name it a Flip as well and pay twice for one motion. If the
     * lap turns out to name nothing, releaseHeld hands it back.
     *
     * INSIDE, though, not merely AT THE SAME TIME AS. This used to hold any
     * rotation that closed while ANY path run was open, and a path run opens
     * on any flypast of a post at flying speed: the town has 886 poles and
     * up to MAX_PATH_RUNS of them can be live at once. So a Jump Rope's
     * opening quarter yaw, flown well before the lap began, was diverted
     * into heldByPath because some unrelated lamp post happened to be in
     * reach that millisecond, and when the lap WAS named, emit dropped the
     * lap and the rotation with it. Twelve patterns are [rotation, lap] and
     * every one of them was unreachable whenever that happened, which is
     * why a Cinnamon Roll came out a Mavvy Roll.
     */
    if (this.insideOpenLap(prim)) {
      this.heldByPath.push(prim);
      return;
    }
    /*
     * Or it belongs to a lap that has already been named. Most of a
     * rotation lying inside a named lap means the lap paid for it.
     */
    if (this.absorbedByLap(prim)) {
      return;
    }
    this.insertPending(prim);
    this.lastCloseMs = this.nowMs;
    this.drain(false);
  }

  /*
   * Close anything still open and name everything left in the buffer. The
   * shell calls this when a run ends, so the last trick of a run is not lost
   * to a settle timer that never expires.
   */
  flush(upZ) {
    const up = upZ === undefined ? 1 : upZ;
    /* The path's own turn first: it is the outermost thing in flight and
     * anything still open inside it belongs to it. */
    this.closeTrack();
    /* The lap first, so a rotation still open inside it is still held by
     * it and cannot be scored twice. */
    for (const run of this.paths) {
      if (run.open) {
        this.closePath(run, up);
      }
    }
    for (const run of this.runs) {
      if (run.open) {
        this.closeRun(run, up);
      }
    }
    this.releaseHeld();
    this.drain(true);
  }

  /*
   * Emit as much of the buffer as can be named now.
   *
   * The rule is longest match wins, but a longer match cannot be judged
   * until the primitives that would complete it have had time to arrive. So
   * this only emits when either no longer pattern is still reachable, or the
   * settle window has passed, or the caller says the run is over.
   */
  drain(force) {
    while (this.pending.length > 0) {
      if (!force && this.hold()) {
        return;
      }
      const best = this.bestMatch();
      if (best) {
        if (this.emit(best.name, best.steps, best.slack, best.wantedTap, best.pattern)) {
          this.dropAbsorbed();
        }
        continue;
      }
      /*
       * Nothing named it. A LAP that names nothing is dropped, but it must
       * first hand back the rotations it was holding: a flip flown around
       * an object that turns out not to be a Powerloop is still a Flip, and
       * swallowing it would make flying near a railing score LESS than
       * flying in open air.
       */
      if (this.pending[0].kind === 'path') {
        const lap = this.pending.shift();
        if (lap.held && lap.held.length > 0) {
          const back = lap.held.filter((h) => !this.absorbedByLap(h));
          if (back.length > 0) {
            /* ONTO THE FRONT, deliberately. A lap that named nothing is
             * gone and the rotations it was holding are the next thing to
             * be considered, ahead of anything buffered behind it. Sorting
             * them back by when they were flown put them alongside laps
             * that had already been dropped and the orbit sweep scored an
             * Orbit x2 AND the two yaw spins inside it. */
            this.pending.unshift(...back);
          }
        }
        continue;
      }
      /* Price the first rotation on its own, hand back whatever it did not
       * cover, and go round again. */
      const prim = this.pending[0];
      const single = singleFor(prim);
      if (!single) {
        this.pending.shift();
        continue;
      }
      const rest = prim.turns - single.turns;
      this.emit(single.name, 1);
      if (rest >= 0.25 - 1e-9) {
        /*
         * `kind` was missing here and its absence was silent. matchSteps
         * rejects anything whose kind is not 'rot' before it looks at
         * anything else, so the remainder of a long rotation could never
         * take part in a pattern: a 540 roll's trailing half roll could not
         * become the first step of a Rubik's Cube. It still reached the
         * singles table, which does not ask, so the half roll was scored
         * and nothing looked wrong.
         */
        this.pending.unshift({
          kind: 'rot',
          axis: prim.axis,
          turns: rest,
          dir: prim.dir,
          startMs: prim.startMs,
          endMs: prim.endMs,
          stallBeforeMs: 0,
          slowMs: 0,
          touched: prim.touched,
          invertedFrac: prim.invertedFrac,
        });
      }
    }
    /*
     * The contact flag is cleared only when the detector is genuinely
     * IDLE: nothing buffered and nothing turning. Clearing it whenever the
     * buffer emptied was wrong and it was wrong in the one case that
     * matters. A quad that clips a branch in the middle of a flip has an
     * empty buffer, because the flip's own primitive does not exist until
     * the rotation closes, so the bump was wiped a millisecond after it
     * happened and the trick that caused it scored CLEAN.
     */
    if (!this.anyOpen() && !this.anyPathOpen()) {
      this.touched = false;
    }
  }

  /* Is any axis mid rotation? */
  anyOpen() {
    return this.runs[0].open || this.runs[1].open || this.runs[2].open;
  }

  /* Is any lap in progress? */
  /*
   * Does this rotation lie inside a lap that is still being flown? Most of
   * it must, on the same 50% bar absorbedByLap uses for a lap already named,
   * because they are the same question about a lap at two different moments.
   */
  /*
   * Buffer a primitive where it belongs in the flight.
   *
   * ON orderMs, NOT startMs. A lap's startMs is BACKDATED by up to
   * PATH_LOOKBACK, because where the craft was before the winding gate
   * opened is what decides whether the lap is a whole one or a half. Sorting
   * on it puts the lap in front of the rotation that OPENED the trick: a
   * Jump Rope's quarter yaw is flown, then the lap begins, and the lap's
   * backdated start reaches back past the yaw and sorts ahead of it. Every
   * one of the twelve [rotation, lap] patterns would be unreachable again,
   * which is the exact fault buffering in flight order was added to fix.
   *
   * The key is therefore "when was this FINISHED BEING SET UP": a lap's
   * gate, and a rotation's END. That is exactly the question a pattern asks,
   * because [rotation, lap] means the rotation was FINISHED before the lap
   * began. Ordering rotations by their start instead put a yaw spin that
   * runs the whole way round an orbit ahead of the orbit, and the orbit
   * sweep scored an Orbit x2 AND the two yaw spins inside it.
   */
  insertPending(prim) {
    const key = prim.orderMs ?? prim.startMs;
    let at = this.pending.length;
    while (at > 0 && (this.pending[at - 1].orderMs ?? this.pending[at - 1].startMs) > key) {
      at -= 1;
    }
    this.pending.splice(at, 0, prim);
  }

  insideOpenLap(prim) {
    const dur = prim.endMs - prim.startMs;
    for (const run of this.paths) {
      if (!run.open) {
        continue;
      }
      /*
       * FROM THE GATE, not from the backdate.
       *
       * run.startMs is backdated by up to PATH_LOOKBACK because where the
       * craft WAS decides whether the lap is a whole one or a half. The lap
       * does not CONTAIN that 800 ms, and claiming a rotation flown in it
       * destroys exactly the entry rotation the twelve [rotation, lap]
       * patterns are built on: the same reach insertPending refuses to sort
       * on, for the same reason.
       */
      const from = run.openMs || run.startMs;
      /*
       * AND UP TO WHERE THE WINDING GOT, not up to now.
       *
       * A run stays open for as long as it takes the rate filter to decay
       * past the off gate and hold there, which is a fifth of a second at
       * least and can be a great deal longer on a slow lap. The craft has
       * stopped going round well before that. Measuring the claim against
       * `nowMs` therefore lets a lap that has finished winding reach forward
       * and swallow the rotation flown AFTER it, which is exactly the shape
       * of an Immelmann Turn: half a loop from under, and then the half roll
       * that finishes it. The roll went into heldByPath, the two step
       * pattern had only the lap in front of it, and a 250 point trick came
       * out as a bare half loop.
       *
       * tailMs is the last millisecond this run was actually winding, and
       * the file already keeps it apart from lastMs for the neighbouring
       * reason. It is the honest upper bound for "inside this lap".
       */
      const until = run.tailMs > from ? run.tailMs : this.nowMs;
      const lo = prim.startMs > from ? prim.startMs : from;
      const hi = prim.endMs < until ? prim.endMs : until;
      if (hi - lo > dur * 0.5) {
        return true;
      }
    }
    return false;
  }

  anyPathOpen() {
    for (const run of this.paths) {
      if (run.open) {
        return true;
      }
    }
    return false;
  }

  /*
   * Take `count` primitives off the front and report them as one trick.
   * Answers whether any of them was a LAP, because a lap that has just been
   * paid for changes what the rest of the buffer is worth. See dropAbsorbed.
   */
  emit(name, count, slack = 0, wantedTap = false, steps = null) {
    const used = this.pending.splice(0, count);
    const first = used[0];
    const last = used[used.length - 1];
    let namedLap = false;
    for (const u of used) {
      if (u.kind === 'path') {
        this.lapWindows.push({ s: u.startMs, e: u.endMs });
        namedLap = true;
      }
    }
    let dead = 0;
    let touched = false;
    for (let i = 0; i < used.length; i += 1) {
      touched = touched || used[i].touched;
      dead += used[i].slowMs;
      if (i > 0) {
        /*
         * The gap between two primitives of one trick, minus any pause the
         * pattern ASKED for. A pattern that wants a stall does not get
         * charged for it, and neither does one that wants a glide: a Wall
         * Ride cuts the throttle and rides alongside the wall between its
         * two rolls, and grading that SLOPPY would be fining the pilot for
         * the part of the trick the trick is named after.
         */
        const asked = steps && steps[i]
          ? Math.max(steps[i].stallMs ?? 0, steps[i].gapMs ?? 0)
          : 0;
        dead += used[i].startMs - used[i - 1].endMs
          - Math.max(used[i].stallBeforeMs, asked);
      }
    }
    /*
     * The workbook's grade. A trick that needed slack to be recognised at
     * all is by definition "completed, execution too segmented", which is
     * what SLOPPY means and what it costs 35% for. See matchSteps: this is
     * the whole reason a near miss can be named rather than refused.
     *
     * `wanted` is a pattern that ASKED to touch something. The whole Wall
     * Tricks family is contact on purpose, and charging a Wall Tap half its
     * points for tapping the wall would be the recogniser fining a pilot
     * for succeeding. An unasked-for contact still costs, which is the
     * workbook's BUMP and is unchanged.
     */
    const wanted = wantedTap;
    const execution = (touched && !wanted)
      ? 'BUMP'
      : ((dead >= SLOPPY_GAP_MS || slack > 0) ? 'SLOPPY' : 'CLEAN');
    /* The first lap in the trick names the obstacle. A trick with no lap in
     * it was flown in open air and names none. */
    let obstacleGroup = null;
    for (const u of used) {
      if (u.kind === 'path') {
        obstacleGroup = u.obstacleGroup;
        break;
      }
    }
    this.onTrick({
      name,
      axis: first.kind === 'path' ? first.obstacle : AXIS_NAME[first.axis],
      turns: used.reduce((a, u) => a + u.turns, 0),
      startMs: first.startMs,
      endMs: last.endMs,
      execution,
      primitives: used.length,
      /*
       * WHICH THING IT WAS FLOWN AROUND, or null for open air, which is
       * what the workbook's two obstacle tables have been waiting for. It
       * was computed in closePath and thrown away here, one function short
       * of the only reader that wants it. See groupOf.
       */
      obstacle: obstacleGroup,
    });
    return namedLap;
  }

  /*
   * Throw away rotations still in the buffer that the lap just named has
   * already paid for.
   *
   * THE ORDERING BUG THIS FIXES, because absorbedByLap was already the
   * right idea and was simply being asked too early. An orbit's yaw runs
   * for the whole lap and a moment past the end of it, so the yaw run
   * closes while a second, meaningless lap has already opened behind it.
   * That makes the yaw HELD by the second lap; the second lap names
   * nothing; releaseHeld then asks absorbedByLap whether the first lap
   * paid for it, and the answer is no, because the first lap is still
   * sitting in `pending` unnamed. Nothing had put its window in
   * lapWindows yet.
   *
   * Measured on the constructed orbits in scripts/score-selftest.js: two
   * laps of a pole at a radius of 1.5 m scored Orbit x2 AND two Yaw Spins,
   * one motion paid for twice, while the same flight at 2.5 m scored the
   * Orbit alone. Whether a pilot was paid twice therefore depended on how
   * close to the post they flew, which is the kind of thing nobody would
   * ever report as a bug because it looks like generosity.
   *
   * So the question is asked again at the only moment the answer can have
   * changed, which is the moment a lap is actually named.
   */
  dropAbsorbed() {
    if (this.pending.length === 0) {
      return;
    }
    let write = 0;
    for (let i = 0; i < this.pending.length; i += 1) {
      const prim = this.pending[i];
      if (prim.kind === 'rot' && this.absorbedByLap(prim)) {
        continue;
      }
      this.pending[write] = prim;
      write += 1;
    }
    this.pending.length = write;
  }

  /*
   * The longest pattern that matches the front of the buffer, or null. Ties
   * on length go to the higher priced trick.
   *
   * THE TIE BREAK IS NEW AND THE COMMENT ON PATTERNS ALWAYS PROMISED IT.
   * The old loop kept the first match of the longest length, so which of
   * two equally long patterns won was decided by which happened to be
   * typed first. It made no difference for as long as no two patterns of
   * the same length could describe the same motion, which was true until
   * the pole tricks became tiers: two laps of a pole flown inverted
   * matches both Trippy Spin x2 and 1 Trippy Spin, and an inverted yaw spin
   * matches both Inverted Yaw Spin and Yaw Spin.
   *
   * Asking the CATALOGUE rather than carrying a priority here keeps the
   * split this file is built on: the pattern names the trick and
   * src/game/tricks.js prices it. A tier therefore cannot be got wrong by
   * being written in the wrong place in the list, and the list stays a list
   * of shapes rather than a ranking.
   */
  bestMatch() {
    let best = null;
    for (const pat of PATTERNS) {
      const n = pat.steps.length;
      if (n > this.pending.length) {
        continue;
      }
      const slack = matchSteps(pat.steps, this.pending, n);
      if (slack < 0) {
        continue;
      }
      const points = trickPoints(pat.name);
      /*
       * Longest first, then the CLEANEST reading of it, then the dearest.
       * Slack before price matters: two patterns can now both describe one
       * flight, one of them exactly and one of them by spending slack, and
       * the exact one is what the pilot flew. Without this a dearer trick
       * would buy its way in on tolerance.
       */
      if (!best
        || n > best.steps
        || (n === best.steps && slack < best.slack)
        || (n === best.steps && slack === best.slack && points > best.points)) {
        best = {
          name: pat.name,
          steps: n,
          points,
          slack,
          wantedTap: patternWantsTap(pat),
          pattern: pat.steps,
        };
      }
    }
    return best;
  }

  /*
   * Should the buffer wait rather than name what it has?
   *
   * Two reasons to wait, and the first one is the one that took a test to
   * find. A rotation that is STILL TURNING is not a gap between tricks, it
   * is the middle of one, and a settle timer that runs while the quad is
   * mid flip will always time out before the flip arrives: a 360 flip is
   * 500 ms of rotating and the timer is 450. So an open run holds the
   * buffer outright, and the timer only counts the still time after it.
   *
   * The second is that some patterns ask for a stall, and a stall is by
   * definition longer than the settle window. The wait is therefore the
   * settle plus whatever stall the NEXT step of a reachable pattern wants,
   * which for Segmented Flips/Rolls is half a second and for everything
   * else is nothing.
   */
  hold() {
    if (this.anyOpen() || this.anyPathOpen()) {
      return true;
    }
    let wait = -1;
    for (const pat of PATTERNS) {
      if (pat.steps.length <= this.pending.length) {
        continue;
      }
      if (matchSteps(pat.steps, this.pending, this.pending.length) < 0) {
        continue;
      }
      const next = pat.steps[this.pending.length];
      /*
       * `gapMs` is a pause the trick is FLOWN with, as opposed to `stallMs`
       * which is a pause the craft is nearly stationary for. A Wall Ride
       * cuts the throttle and glides alongside the wall between its two
       * quarter rolls, at speed, and the buffer used to throw the first
       * roll away after the settle window and name nothing at all.
       */
      const w = SETTLE_MS + Math.max(next.stallMs ?? 0, next.gapMs ?? 0);
      if (w > wait) {
        wait = w;
      }
    }
    return wait >= 0 && this.nowMs - this.lastCloseMs < wait;
  }
}

/* Do the first `n` steps of a pattern describe the first `n` primitives? */
const AXIS_OF_NAME = { roll: AXIS_ROLL, pitch: AXIS_PITCH, yaw: AXIS_YAW };

/* Does this pattern touch something on purpose? See emit: a trick that
 * asked to tap is not also fined for tapping. */
function patternWantsTap(pat) {
  return pat.steps.some((step) => step.tap === true);
}

/*
 * HOW FAR OUT A TRICK MAY BE AND STILL BE THAT TRICK.
 *
 * Everything above this line reads a flight and turns it into quarter turns
 * and laps. This is the other half of the job and it was missing: deciding
 * whether what the pilot flew IS the trick, when nobody flies a trick to the
 * quarter turn.
 *
 * The old matcher tested `p.turns !== s.turns` and gave up. So a 360 roll
 * that came out at 450 because the pilot held the stick a beat too long was
 * not a Roll, it was a Roll and a 1/4 Roll, and a Rubik's Cube whose middle
 * flip overshot was three building blocks. The pilot flew the trick and was
 * told they flew parts.
 *
 * THE WORKBOOK ALREADY HAS THE ANSWER AND IT IS NOT A WIDER THRESHOLD. It
 * grades every trick CLEAN, SLOPPY, BUMP, MISSED or CRASH, and SLOPPY costs
 * 35% for a trick that was completed but "lacks constant loop motion,
 * execution is too segmented". A trick flown a quarter turn out is exactly
 * that: completed, and not clean. So a step may match LOOSELY at a cost of
 * one slack point, the trick is still named, and any slack at all grades it
 * SLOPPY. Nothing is widened; a second, cheaper grade is opened underneath.
 *
 * WHAT NEVER GETS SLACK, and this is what keeps it honest:
 *
 *   the axis     a roll is not a flip, at any tolerance
 *   the direction  sameAs, oppTo and dir are what separate a Rubik's Cube
 *                from a rewind and an Invert Rewind from Segmented Flips.
 *                A trick defined by going back the other way cannot be
 *                allowed to match going the same way, however sloppily
 *   which kind   a lap is not a rotation
 *
 * Only MAGNITUDES are slackened: how far it turned, how much it turned
 * while it did, how upside down it was, how long it stalled.
 */
const SLACK_TURNS = 0.25;
const SLACK_ROT = 0.25;
/*
 * The widest a rot reading may miss its target and still be that trick.
 *
 * The targets are half a turn apart, so a band of a quarter each way makes the
 * classes TILE: every reading names at most one of them, and a reading exactly
 * between two names neither. The old band was a quarter free plus a quarter of
 * slack, half a turn wide, exactly the spacing, so every reading matched at
 * least two classes and the tie went to whichever cost more.
 *
 * A tenth narrower was tried, to leave dead ground between the classes rather
 * than have them meet. It refused honest flying: a loop that over-rotates by
 * half a turn should be refused, and one that misses by a fifth should not,
 * and there is no room for both inside a spacing of a half.
 */
const ROT_BAND = CONCURRENT_TOLERANCE;
/*
 * How long a pattern's steps may be apart and still be one trick, over and
 * above any pause the pattern asked for. 800 ms is comfortably longer than
 * the untidiest continuous sequence measured and comfortably shorter than
 * the second or two between two tricks a pilot flew as two tricks.
 */
const STEP_GAP_MAX = 800;
const SLACK_STALL = 0.6;
const SLACK_INVERTED = 0.2;
/*
 * Two slack points, not one and not four. One would refuse a Rubik's Cube
 * whose entry AND exit rolls were both a shade long, which is one mistake
 * made twice rather than two mistakes. Four would let a three step pattern
 * match a flight that missed on every step, which is not that trick flown
 * badly, it is a different trick.
 */
const SLACK_MAX = 2;

/*
 * Which way up, as a slack cost. Exact inside INVERTED_MIN, and a further
 * SLACK_INVERTED beyond it at a cost, so a pilot who rolled out of an
 * inverted trick a little early still flew the inverted trick.
 */
function nearInverted(frac, want) {
  const held = want ? frac : 1 - frac;
  if (held >= INVERTED_MIN) {
    return 0;
  }
  return held >= INVERTED_MIN - SLACK_INVERTED ? 1 : -1;
}

/*
 * A turn count against what the pattern asked for, as a slack cost.
 *
 * ASYMMETRIC ON PURPOSE, and this is the rule that keeps the tolerance
 * honest: you cannot complete a trick by doing LESS of it.
 *
 * Over is the trick flown long. A 450 degree roll is a Roll the pilot held
 * a beat past level, and refusing it was the whole complaint: it used to
 * come out as a Roll and a 1/4 Roll, or as nothing at all inside a longer
 * pattern.
 *
 * Under is a different, smaller thing, and the workbook already prices it.
 * Three quarters of a yaw spin is not a sloppy Yaw Spin, it is a pilot
 * turning a corner, which is what every pilot does every few seconds and
 * what the whole SINGLES floor exists to keep silent. Three quarters of a
 * roll is a 3/4 Roll at 75 points, which is a real entry in the building
 * blocks. Slackening downward would swallow both.
 */
function nearTurns(got, want, slack) {
  const over = got - want;
  if (over <= 1e-9 && over >= -1e-9) {
    return 0;
  }
  return over > 0 && over <= slack + 1e-9 ? 1 : -1;
}

/*
 * The slack this pattern needs to describe these primitives, or -1 if it
 * cannot at any cost. Zero means flown exactly as written.
 */
/*
 * WHICH ROTATION CAUGHT THE CONTACT IS NOT SOMETHING A PILOT DECIDES.
 *
 * A Wall Tap is pitch back, touch, pitch forward, and the pattern asks for
 * the tap on the second rotation because a contact BETWEEN two runs is read
 * when the later one closes. That is right for a tap the pilot places at
 * the top of the manoeuvre and wrong for one the drift places early:
 * measured on the town's training wall, flown at it, the craft was still
 * closing while it pitched back and touched at 3.7 m/s DURING the first
 * quarter turn. The two rotations were both there, the tap was there, the
 * speed was inside GRAZE_SPEED_MAX, and the trick named nothing, because
 * the tap was on step 0 and the pattern wanted it on step 1.
 *
 * So a pattern that asks for a tap asks the TRICK for it, not one step of
 * it. A step that wants a tap is satisfied by a tap anywhere inside the
 * same trick. A step that refuses one (tap: false) still refuses it on
 * itself, because that is a different claim and no pattern makes it yet.
 */
function tapAnywhere(prims, n) {
  for (let i = 0; i < n; i += 1) {
    if (prims[i] && prims[i].tapped) {
      return true;
    }
  }
  return false;
}

function matchSteps(steps, prims, n) {
  let slack = 0;
  /* One reading for the whole trick. See tapAnywhere. */
  const anyTap = tapAnywhere(prims, n);
  /* Charge a step's looseness, and give up once the budget is gone. */
  const spend = (cost) => {
    if (cost < 0) {
      return false;
    }
    slack += cost;
    return slack <= SLACK_MAX;
  };
  for (let i = 0; i < n; i += 1) {
    const s = steps[i];
    const p = prims[i];
    /*
     * ONE TRICK IS ONE MOTION, and a pattern with more steps in it used to
     * beat a shorter one no matter how far apart they were flown.
     *
     * Length wins ties before slack does, and nothing bounded the gap
     * between a pattern's steps, so the most ordinary rail sequence there
     * is, a Powerloop and then a Matty Flip rewind under the same rail a
     * second or two later, matched Barani at two steps and beat Powerloop
     * at one. The pilot was paid 700 for a Master trick nobody flew.
     *
     * emit already computes exactly this quantity to GRADE on. Refusing is
     * the right answer rather than grading it SLOPPY: two tricks with a
     * pause between them are two tricks, not one untidy one, and the pilot
     * should be paid for both.
     *
     * A pattern that ASKS for a pause is not charged for it, which is what
     * lets a Wall Ride glide between its two rolls and a Segmented Flip
     * stop between its halves.
     */
    if (i > 0) {
      const asked = Math.max(s.stallMs ?? 0, s.gapMs ?? 0);
      const gap = p.startMs - prims[i - 1].endMs
        - Math.max(p.stallBeforeMs ?? 0, asked);
      if (gap > STEP_GAP_MAX) {
        return -1;
      }
    }
    /* A lap step matches a lap and a rotation step matches a rotation.
     * Never each other: they are different measurements of different
     * things and a step that did not say which it wanted would match both. */
    if (s.path !== undefined) {
      /* A lap is not a rotation. No slack: they are different measurements
       * of different things and a step that matched both would name a trick
       * off the wrong evidence. */
      if (p.kind !== 'path' || p.obstacle !== s.path) {
        return -1;
      }
      if (s.turns !== undefined && !spend(nearTurns(p.turns, s.turns, SLACK_TURNS))) {
        return -1;
      }
      /* A floor rather than a reading, slackened by how short a lap is
       * known to measure. See LAP_TRUNCATION, which is the whole argument. */
      if (s.turnsAtLeast !== undefined && p.turns < s.turnsAtLeast - LAP_TRUNCATION) {
        return -1;
      }
      /* Which side it went in from is topological, not a reading: over a
       * rail and under it are not a quarter turn apart, they are different
       * facts. No slack. */
      if (s.from !== undefined && p.startSide !== (s.from === 'under' ? -1 : 1)) {
        return -1;
      }
      /*
       * Inverted is judged over the WHOLE LAP, not at the instant the run
       * closed. A trick flown inverted is inverted while it is being flown;
       * a lap that was belly up for a fifth of its length was an upright
       * orbit whose pilot rolled out at the end.
       */
      if (s.inverted !== undefined && !spend(nearInverted(p.invertedFrac, s.inverted))) {
        return -1;
      }
      if (s.track !== undefined) {
        if (s.track) {
          if (p.trackFrac < TRACK_LAP_MIN) {
            return -1;
          }
        } else if (p.trackFrac >= TRACK_LAP_MIN) {
          return -1;
        }
      }
      if (s.tap !== undefined
        && (s.tap ? !anyTap : Boolean(p.tapped) !== s.tap)) {
        return -1;
      }
      if (s.rot !== undefined) {
        for (const key of Object.keys(s.rot)) {
          const got = p.rot[AXIS_OF_NAME[key]];
          const mag = got < 0 ? -got : got;
          /*
           * A DEAD BAND BETWEEN THE CLASSES, because there has to be one.
           *
           * The loop family's rot targets are spaced HALF A TURN apart, and
           * the old accept band was a quarter free plus a quarter of slack:
           * a half turn wide, exactly the spacing. So adjacent tricks always
           * overlapped, every reading matched at least two of them, and the
           * tie was broken on PRICE. A five hundredth of a turn turned a 200
           * point Novice trick into a 600 point Master one, and it moved in
           * the direction that pays more.
           *
           * Exact inside half the tolerance, one slack point out to
           * ROT_BAND, and REFUSED beyond it. Refusing is the right answer in
           * the strip between two family members: a lap that is genuinely
           * halfway between two tricks is not either of them, and naming
           * nothing is honest where naming the dearer one is not.
           */
          const err = mag > s.rot[key] ? mag - s.rot[key] : s.rot[key] - mag;
          if (err > CONCURRENT_TOLERANCE * 0.5
            && !spend(err <= ROT_BAND ? 1 : -1)) {
            return -1;
          }
        }
      }
      continue;
    }
    if (p.kind !== 'rot') {
      return -1;
    }
    /* THE AXIS NEVER GETS SLACK. A roll is not a flip. */
    if (s.axis !== undefined && AXIS_NAME[p.axis] !== s.axis) {
      return -1;
    }
    if (s.axisIn !== undefined && !s.axisIn.includes(AXIS_NAME[p.axis])) {
      return -1;
    }
    if (s.axisAs !== undefined && p.axis !== prims[s.axisAs].axis) {
      return -1;
    }
    if (s.turns !== undefined && !spend(nearTurns(p.turns, s.turns, SLACK_TURNS))) {
      return -1;
    }
    /*
     * Which way up, judged over the whole rotation and by exactly the bar a
     * lap is judged by. A primitive from before this field existed, and the
     * remainder a long rotation hands back, carry no fraction at all; the
     * `?? 0` reads that as upright, which fails an `inverted: true` step
     * rather than passing it. Same rule as trackFrac's minus one: a
     * recogniser that cannot see the attitude must not hand out a trick
     * that is defined by it.
     */
    if (s.inverted !== undefined && !spend(nearInverted(p.invertedFrac ?? 0, s.inverted))) {
      return -1;
    }
    /*
     * THE DIRECTIONS NEVER GET SLACK EITHER. sameAs and oppTo are what
     * separate a Rubik's Cube from a rewind and Segmented Flips/Rolls from
     * an Invert Rewind: the two are the same two half turns and differ only
     * in whether the second went back the other way. A trick defined by
     * going back cannot be allowed to match going on, at any tolerance.
     */
    if (s.dir !== undefined && p.dir !== s.dir) {
      return -1;
    }
    if (s.sameAs !== undefined && p.dir !== prims[s.sameAs].dir) {
      return -1;
    }
    if (s.oppTo !== undefined && p.dir === prims[s.oppTo].dir) {
      return -1;
    }
    /* A stall the pattern asked for. Six tenths of it is still a pause the
     * eye reads as one, and the trick is named SLOPPY for being brisk. */
    if (s.stallMs !== undefined && p.stallBeforeMs < s.stallMs
      && !spend(p.stallBeforeMs >= s.stallMs * SLACK_STALL ? 1 : -1)) {
      return -1;
    }
    /*
     * A contact the pattern asked for. No slack: either the craft touched
     * the thing or it did not, and a wall trick that did not touch the wall
     * is the trick MISSED rather than the trick flown badly.
     */
    if (s.tap !== undefined
      && (s.tap ? !anyTap : Boolean(p.tapped) !== s.tap)) {
      return -1;
    }
    /*
     * Flown close to something, without necessarily touching it. No slack:
     * a wall ride flown ten metres off the wall is not a sloppy wall ride,
     * it is a roll.
     */
    if (s.nearMax !== undefined && !((p.nearest ?? Infinity) <= s.nearMax)) {
      return -1;
    }
  }
  return slack;
}
