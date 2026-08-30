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
const PATH_RATE_ON = 0.35;
const PATH_RATE_OFF = 0.12;
const PATH_OFF_HOLD_MS = 220;
const PATH_MIN_RADIUS = 0.45;
const PATH_MIN_TURNS = 0.375;

/*
 * How far a lap count may sit from the whole or half turn its side parity
 * demands. This is a THIRD of a turn where the attitude snap allows a
 * fifth, and the difference is not slackness, it is that the two
 * measurements are not the same kind of thing.
 *
 * A rotation is a closed quantity: a quad that ends level has turned a
 * whole number of times and the only error is how well the pilot stopped.
 * A lap is not closed. The craft enters the loop somewhere and leaves it
 * somewhere else, and the angle between those two rays is added to or
 * taken off the turn, so the same powerloop around the same rail measures
 * differently depending on where along the rail's height the rail happens
 * to be. Measured on the real aircraft, a clean powerloop reads anywhere
 * from about 0.95 to 1.3 turns depending on where the bar sits inside the
 * loop.
 *
 * 0.35 makes a full lap anything in [0.65, 1.35], which still leaves the
 * half turn a straight fly-by sweeps out in the rejected zone, and that
 * fly-by is the case this whole test exists to throw away.
 */
const PATH_SNAP_TOLERANCE = 0.35;

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
    /* "180 Pitch/Roll to invert, an inverted 360 Yaw spin, then a Flip/Roll
     * in the same direction." Either axis, but the same one both times. */
    name: 'Inverted Yaw Spin',
    steps: [
      { axisIn: ['roll', 'pitch'], turns: 0.5 },
      { axis: 'yaw', turns: 1 },
      { axisAs: 0, turns: 0.5, sameAs: 0 },
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
    /* The same lap flown facing forward the whole way: no flip. */
    name: 'Maverick Loop',
    steps: [{ path: 'bar', turns: 1, from: 'under', rot: { pitch: 0 } }],
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
  {
    /*
     * Two laps of a pole with the nose tracking it, which is what makes the
     * yaw match the lap: keeping an object centred on the screen through a
     * full circle IS a 360 of yaw.
     */
    name: 'Orbit x2',
    steps: [{ path: 'pole', turns: 2, rot: { yaw: 2 }, inverted: false }],
  },
  {
    /* The same, inverted, with the object held at the top of the screen. */
    name: 'Trippy Spin x2',
    steps: [{ path: 'pole', turns: 2, inverted: true }],
  },

  /* One step patterns: the named whole rotations. Everything shorter or
   * odder falls through to the building blocks in singleName below. */
  { name: 'Double Flip', steps: [{ axis: 'pitch', turns: 2 }] },
  { name: 'Double Roll', steps: [{ axis: 'roll', turns: 2 }] },
  { name: 'Flip', steps: [{ axis: 'pitch', turns: 1 }] },
  { name: 'Roll', steps: [{ axis: 'roll', turns: 1 }] },
  { name: 'Yaw Spin', steps: [{ axis: 'yaw', turns: 1 }] },
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
  { axis: AXIS_YAW, turns: 1, name: 'Yaw Spin' },
];

/* Largest single that fits inside `turns` on this axis, or null. */
function singleFor(axis, turns) {
  let best = null;
  for (const s of SINGLES) {
    if (s.axis !== axis || s.turns > turns + 1e-9) {
      continue;
    }
    if (!best || s.turns > best.turns) {
      best = s;
    }
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
  if (mag < PATH_MIN_TURNS) {
    return 0;
  }
  const nearest = Math.round(mag * 4) / 4;
  if (kind !== OB_BAR || startSide === 0 || endSide === 0) {
    return nearest;
  }
  const want = startSide === endSide ? 'whole' : 'half';
  if (turnClass(nearest) === want) {
    return nearest;
  }
  let best = 0;
  let bestErr = Infinity;
  /* Reach further than the attitude snap does, for the same reason the
   * tolerance is wider: a lap read at 1.3 turns has to be able to find 1. */
  for (const cand of [
    nearest - 0.25, nearest + 0.25, nearest - 0.5, nearest + 0.5,
    nearest - 0.75, nearest + 0.75,
  ]) {
    if (cand < PATH_MIN_TURNS || turnClass(cand) !== want) {
      continue;
    }
    const err = cand > mag ? cand - mag : mag - cand;
    if (err <= PATH_SNAP_TOLERANCE && err < bestErr) {
      bestErr = err;
      best = cand;
    }
  }
  /*
   * NO FALLBACK HERE, and that is the difference between this and
   * snapTurns. Which side of a rail the craft came out on is a hard
   * geometric fact, not an estimate of a pilot's accuracy, so a winding
   * that contradicts it is not a sloppy trick, it is not a trick.
   *
   * This is what throws away the fly-by. A quad going straight past a rail
   * at five metres sweeps up to half a turn of angle at the rail, fast
   * enough to open a run, and it goes in under the rail and comes out
   * under the rail. Same side means a whole number of turns, half a turn is
   * not one, and nothing within reach of half a turn is. Returning zero
   * drops it. Falling back to the nearest quarter would have paid a pilot
   * for flying down a street.
   */
  return best;
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
  }

  reset() {
    this.acc = 0;
    this.open = false;
    this.offMs = 0;
    this.slowMs = 0;
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
export class TrickDetector {
  constructor(onTrick, obstacles = null) {
    this.onTrick = onTrick;
    this.runs = [new Run(AXIS_ROLL), new Run(AXIS_PITCH), new Run(AXIS_YAW)];
    /* The obstacle field, or null on a map that has none. With none, this
     * is exactly the open-air recogniser it was before. */
    this.obstacles = obstacles;
    this.path = new PathRun();
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
    this.enabled = true;
  }

  /* Forget everything. Called when a run resets, and after a crash, because
   * a half roll from before the crash must not combine with a half roll
   * after it into an Invert Rewind that nobody flew. */
  reset() {
    for (const r of this.runs) {
      r.reset();
    }
    this.path.reset();
    this.heldByPath.length = 0;
    this.lapWindows.length = 0;
    this.pending.length = 0;
    this.lastCloseMs = -1e9;
    this.stallMs = 0;
    this.gapStallMs = 0;
    this.touched = false;
  }

  /* A new run: forget the buffers and put the clock back to zero, so the
   * detector's own milliseconds stay level with the shell's sim clock. */
  restart() {
    this.reset();
    this.nowMs = 0;
  }

  /* The craft touched something without ending the run. */
  bump() {
    this.touched = true;
  }

  /*
   * One physics step.
   *
   *   dt     seconds, the fixed step
   *   p q r  body rates, rad/s
   *   qx qy  the x and y components of the body to world quaternion, which
   *          is all the attitude this needs
   *   speed  m/s, for the stall test
   */
  step(dt, p, q, r, qx, qy, speed, wx, wy, wz) {
    if (!this.enabled) {
      return;
    }
    const dtMs = dt * 1000;
    this.nowMs += dtMs;
    if (speed < STALL_SPEED) {
      this.stallMs += dtMs;
      this.gapStallMs += dtMs;
    } else {
      this.stallMs = 0;
    }
    const upZ = 1 - 2 * (qx * qx + qy * qy);
    this.totalTurns[AXIS_ROLL] += (p * dt) / TURN;
    this.totalTurns[AXIS_PITCH] += (q * dt) / TURN;
    this.totalTurns[AXIS_YAW] += (r * dt) / TURN;
    /*
     * THE PATH BEFORE THE ROTATIONS, because closing a path run has to be
     * able to claim the rotation primitives that happened inside it, and a
     * rotation that closes on the same millisecond the loop does belongs to
     * the loop.
     */
    if (this.obstacles) {
      this.pathStep(dt, dtMs, wx, wy, wz, upZ);
    }
    this.axisStep(this.runs[AXIS_ROLL], p, dtMs, upZ);
    this.axisStep(this.runs[AXIS_PITCH], q, dtMs, upZ);
    this.axisStep(this.runs[AXIS_YAW], r, dtMs, upZ);
    this.drain(false);
  }

  /*
   * One step of the path side: find the obstacle being flown, accumulate
   * the angle subtended at its axis, open and close the run.
   */
  pathStep(dt, dtMs, wx, wy, wz, upZ) {
    const run = this.path;
    const ob = this.obstacles.near(wx, wy, wz);
    if (!ob) {
      if (run.open) {
        this.closePath(upZ);
      }
      run.have = false;
      run.obstacle = null;
      run.clearHistory();
      return;
    }
    /*
     * Leaving one collider for the next one along the SAME LINE is not
     * leaving the obstacle. A town railing is built from collinear
     * segments and a loop over the join is one loop.
     */
    if (run.obstacle && !sameAxis(run.obstacle, ob)) {
      if (run.open) {
        this.closePath(upZ);
      }
      run.have = false;
      run.clearHistory();
    }
    run.obstacle = ob;

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
    const side = this.sideOf(ob, cx, cy, cz);
    run.windTotal += dTurns;

    if (!run.open) {
      /* Keep the rolling record whether or not this becomes a lap. */
      const old = run.snapshot(side, this.nowMs, this.totalTurns);
      if (mag >= PATH_RATE_ON) {
        /*
         * BACKDATE. The lap did not begin when the winding rate crossed
         * the gate, it began 800 ms ago when the craft committed to it,
         * and where the craft was THEN is what decides whether this is a
         * whole lap or a half. See PATH_LOOKBACK.
         */
        run.open = true;
        run.startWind = old.wind;
        run.acc = run.windTotal - old.wind;
        run.offMs = 0;
        run.startMs = old.ms;
        run.startSide = old.side;
        run.startRot[0] = old.r0;
        run.startRot[1] = old.r1;
        run.startRot[2] = old.r2;
        run.lastWind = run.windTotal;
        run.lastSide = side;
        run.lastMs = this.nowMs;
        run.lastRot[0] = this.totalTurns[0];
        run.lastRot[1] = this.totalTurns[1];
        run.lastRot[2] = this.totalTurns[2];
        run.dirSign = run.rate > 0 ? 1 : -1;
      }
      return;
    }
    /* Still winding: this is where the lap currently ends. */
    if (mag >= PATH_RATE_ON) {
      run.lastWind = run.windTotal;
      run.lastSide = side;
      run.lastMs = this.nowMs;
      run.lastRot[0] = this.totalTurns[0];
      run.lastRot[1] = this.totalTurns[1];
      run.lastRot[2] = this.totalTurns[2];
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
    if (run.acc !== 0 && (run.acc > 0) !== (run.rate > 0) && mag >= PATH_RATE_ON) {
      this.closePath(upZ);
      return;
    }
    run.acc += dTurns;
    if (mag < PATH_RATE_OFF) {
      run.offMs += dtMs;
      if (run.offMs >= PATH_OFF_HOLD_MS) {
        this.closePath(upZ);
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
  closePath(upZ) {
    const run = this.path;
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
    this.pending.push({
      kind: 'path',
      obstacle: OB_KIND_NAME[ob.kind],
      obstacleId: ob.id,
      turns,
      dir: acc >= 0 ? 1 : -1,
      startMs: run.startMs,
      endMs: run.lastMs,
      startSide: run.startSide,
      endSide,
      /* Net rotation while the lap was flown, per axis, in turns. */
      rot: [
        run.lastRot[0] - run.startRot[0],
        run.lastRot[1] - run.startRot[1],
        run.lastRot[2] - run.startRot[2],
      ],
      upZ,
      stallBeforeMs: this.gapStallMs,
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
    let released = 0;
    for (const prim of this.heldByPath) {
      if (this.absorbedByLap(prim)) {
        continue;
      }
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
      }
      return;
    }
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
       * stall time, so the gap counter is cleared here and not before. */
      stallBeforeMs: this.gapStallMs,
      slowMs: slow,
      touched: this.touched,
    };
    this.gapStallMs = 0;
    /*
     * A rotation that happened INSIDE a lap is held, not buffered. The flip
     * of a Powerloop is part of the Powerloop; buffering it would let the
     * matcher name it a Flip as well and pay twice for one motion. If the
     * lap turns out to name nothing, releaseHeld hands it back.
     */
    if (this.path.open) {
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
    this.pending.push(prim);
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
    /* The lap first, so a rotation still open inside it is still held by
     * it and cannot be scored twice. */
    if (this.path.open) {
      this.closePath(up);
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
        this.emit(best.name, best.steps);
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
            this.pending.unshift(...back);
          }
        }
        continue;
      }
      /* Price the first rotation on its own, hand back whatever it did not
       * cover, and go round again. */
      const prim = this.pending[0];
      const single = singleFor(prim.axis, prim.turns);
      if (!single) {
        this.pending.shift();
        continue;
      }
      const rest = prim.turns - single.turns;
      this.emit(single.name, 1);
      if (rest >= 0.25 - 1e-9) {
        this.pending.unshift({
          axis: prim.axis,
          turns: rest,
          dir: prim.dir,
          startMs: prim.startMs,
          endMs: prim.endMs,
          stallBeforeMs: 0,
          slowMs: 0,
          touched: prim.touched,
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
    if (!this.anyOpen() && !this.path.open) {
      this.touched = false;
    }
  }

  /* Is any axis mid rotation? */
  anyOpen() {
    return this.runs[0].open || this.runs[1].open || this.runs[2].open;
  }

  /* Take `count` primitives off the front and report them as one trick. */
  emit(name, count) {
    const used = this.pending.splice(0, count);
    const first = used[0];
    const last = used[used.length - 1];
    for (const u of used) {
      if (u.kind === 'path') {
        this.lapWindows.push({ s: u.startMs, e: u.endMs });
      }
    }
    let dead = 0;
    let touched = false;
    for (let i = 0; i < used.length; i += 1) {
      touched = touched || used[i].touched;
      dead += used[i].slowMs;
      if (i > 0) {
        /* The gap between two primitives of one trick, minus any stall the
         * pattern asked for. A pattern that wants a stall does not get
         * charged for it: see SLOPPY_GAP_MS. */
        dead += used[i].startMs - used[i - 1].endMs - used[i].stallBeforeMs;
      }
    }
    const execution = touched ? 'BUMP' : (dead >= SLOPPY_GAP_MS ? 'SLOPPY' : 'CLEAN');
    this.onTrick({
      name,
      axis: first.kind === 'path' ? first.obstacle : AXIS_NAME[first.axis],
      turns: used.reduce((a, u) => a + u.turns, 0),
      startMs: first.startMs,
      endMs: last.endMs,
      execution,
      primitives: used.length,
    });
  }

  /* The longest pattern that matches the front of the buffer, or null. */
  bestMatch() {
    let best = null;
    for (const pat of PATTERNS) {
      const n = pat.steps.length;
      if (n > this.pending.length) {
        continue;
      }
      if (!matchSteps(pat.steps, this.pending, n)) {
        continue;
      }
      if (!best || n > best.steps) {
        best = { name: pat.name, steps: n };
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
    if (this.anyOpen() || this.path.open) {
      return true;
    }
    let wait = -1;
    for (const pat of PATTERNS) {
      if (pat.steps.length <= this.pending.length) {
        continue;
      }
      if (!matchSteps(pat.steps, this.pending, this.pending.length)) {
        continue;
      }
      const next = pat.steps[this.pending.length];
      const w = SETTLE_MS + (next.stallMs ?? 0);
      if (w > wait) {
        wait = w;
      }
    }
    return wait >= 0 && this.nowMs - this.lastCloseMs < wait;
  }
}

/* Do the first `n` steps of a pattern describe the first `n` primitives? */
const AXIS_OF_NAME = { roll: AXIS_ROLL, pitch: AXIS_PITCH, yaw: AXIS_YAW };

function matchSteps(steps, prims, n) {
  for (let i = 0; i < n; i += 1) {
    const s = steps[i];
    const p = prims[i];
    /* A lap step matches a lap and a rotation step matches a rotation.
     * Never each other: they are different measurements of different
     * things and a step that did not say which it wanted would match both. */
    if (s.path !== undefined) {
      if (p.kind !== 'path' || p.obstacle !== s.path) {
        return false;
      }
      if (s.turns !== undefined && p.turns !== s.turns) {
        return false;
      }
      if (s.from !== undefined && p.startSide !== (s.from === 'under' ? -1 : 1)) {
        return false;
      }
      if (s.inverted !== undefined && (p.upZ < 0) !== s.inverted) {
        return false;
      }
      if (s.rot !== undefined) {
        for (const key of Object.keys(s.rot)) {
          const got = p.rot[AXIS_OF_NAME[key]];
          const mag = got < 0 ? -got : got;
          const err = mag - s.rot[key];
          if ((err < 0 ? -err : err) > CONCURRENT_TOLERANCE) {
            return false;
          }
        }
      }
      continue;
    }
    if (p.kind !== 'rot') {
      return false;
    }
    if (s.axis !== undefined && AXIS_NAME[p.axis] !== s.axis) {
      return false;
    }
    if (s.axisIn !== undefined && !s.axisIn.includes(AXIS_NAME[p.axis])) {
      return false;
    }
    if (s.axisAs !== undefined && p.axis !== prims[s.axisAs].axis) {
      return false;
    }
    if (s.turns !== undefined && p.turns !== s.turns) {
      return false;
    }
    if (s.dir !== undefined && p.dir !== s.dir) {
      return false;
    }
    if (s.sameAs !== undefined && p.dir !== prims[s.sameAs].dir) {
      return false;
    }
    if (s.oppTo !== undefined && p.dir === prims[s.oppTo].dir) {
      return false;
    }
    if (s.stallMs !== undefined && p.stallBeforeMs < s.stallMs) {
      return false;
    }
  }
  return true;
}
