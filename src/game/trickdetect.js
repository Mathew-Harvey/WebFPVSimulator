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
 * RATE_ON is 3.0 rad/s, about 172 deg/s. A quad correcting its attitude in a
 * gust or being flown around a corner does not sustain that; a flip is
 * eight hundred. RATE_OFF is 1.2 rad/s with a hold, so that the brief dip
 * through the middle of a two turn flip does not saw one primitive into two.
 * These are the two numbers most likely to want moving after a pilot flies
 * it, and they are here, together, for that reason.
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
 * These are the workbook's own "Custom Trick Building Blocks", which exist
 * so that a competitor who flies something the list does not name can still
 * add up the parts. Scoring a quarter roll as nothing would make the first
 * half of most runs read zero, which is the wrong lesson to teach somebody
 * learning. Highest entry that the rotation covers wins, and the remainder
 * is handed back to the buffer, so a 540 roll is a Roll and then a 1/2 Roll
 * rather than a Roll with 180 degrees thrown away.
 */
const SINGLES = [
  { axis: AXIS_PITCH, turns: 2, name: 'Double Flip' },
  { axis: AXIS_PITCH, turns: 1, name: 'Flip' },
  { axis: AXIS_PITCH, turns: 0.75, name: '3/4 Flip' },
  { axis: AXIS_PITCH, turns: 0.5, name: '1/2 Flip' },
  { axis: AXIS_PITCH, turns: 0.25, name: '1/4 Flip' },
  { axis: AXIS_ROLL, turns: 2, name: 'Double Roll' },
  { axis: AXIS_ROLL, turns: 1, name: 'Roll' },
  { axis: AXIS_ROLL, turns: 0.75, name: '3/4 Roll' },
  { axis: AXIS_ROLL, turns: 0.5, name: '1/2 Roll' },
  { axis: AXIS_ROLL, turns: 0.25, name: '1/4 Roll' },
  { axis: AXIS_YAW, turns: 1, name: 'Yaw Spin' },
  { axis: AXIS_YAW, turns: 0.75, name: '3/4 Yaw Spin' },
  { axis: AXIS_YAW, turns: 0.5, name: '1/2 Yaw Spin' },
  { axis: AXIS_YAW, turns: 0.25, name: '1/4 Yaw Spin' },
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

/*
 * Snap a signed turn count to a quarter, using the craft's attitude to
 * choose between the candidates a quarter apart.
 *
 * `upZ` is the world z component of the body up axis: +1 level, -1 inverted,
 * 0 on its side. For the quaternion (w, x, y, z) that is 1 - 2(x^2 + y^2),
 * one polynomial and no trigonometry.
 *
 * A yaw does not change which way up the craft is, so attitude says nothing
 * about it and it takes the plain nearest quarter.
 */
export function snapTurns(rawTurns, axis, upZ) {
  const mag = rawTurns < 0 ? -rawTurns : rawTurns;
  if (mag < MIN_TURNS) {
    return 0;
  }
  const nearest = Math.round(mag * 4) / 4;
  if (axis === AXIS_YAW) {
    return nearest;
  }
  /* Which residue class the attitude says this landed in: whole turns
   * upright, half turns inverted, quarters on edge. */
  const wantHalf = upZ < -0.5;
  const wantWhole = upZ > 0.5;
  const cls = (t) => {
    const f = t - Math.floor(t);
    if (f < 0.125 || f > 0.875) {
      return 'whole';
    }
    if (f > 0.375 && f < 0.625) {
      return 'half';
    }
    return 'edge';
  };
  const want = wantWhole ? 'whole' : (wantHalf ? 'half' : 'edge');
  if (cls(nearest) === want) {
    return nearest;
  }
  /* Reach a quarter either side for a candidate that agrees with the
   * attitude, and take it only if the integral supports it. */
  let best = nearest;
  let bestErr = Infinity;
  for (const cand of [nearest - 0.25, nearest + 0.25, nearest - 0.5, nearest + 0.5]) {
    if (cand < MIN_TURNS || cls(cand) !== want) {
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

/* One axis of rotation, accumulating. Plain fields, no allocation per step. */
class Run {
  constructor(axis) {
    this.axis = axis;
    this.acc = 0;
    this.open = false;
    this.startMs = 0;
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
  constructor(onTrick) {
    this.onTrick = onTrick;
    this.runs = [new Run(AXIS_ROLL), new Run(AXIS_PITCH), new Run(AXIS_YAW)];
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
  step(dt, p, q, r, qx, qy, speed) {
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
    this.axisStep(this.runs[AXIS_ROLL], p, dtMs, upZ);
    this.axisStep(this.runs[AXIS_PITCH], q, dtMs, upZ);
    this.axisStep(this.runs[AXIS_YAW], r, dtMs, upZ);
    this.drain(false);
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
    const turns = snapTurns(raw, run.axis, upZ);
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
    this.pending.push({
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
    });
    this.gapStallMs = 0;
    this.lastCloseMs = this.nowMs;
    this.drain(false);
  }

  /*
   * Close anything still open and name everything left in the buffer. The
   * shell calls this when a run ends, so the last trick of a run is not lost
   * to a settle timer that never expires.
   */
  flush(upZ) {
    for (const run of this.runs) {
      if (run.open) {
        this.closeRun(run, upZ === undefined ? 1 : upZ);
      }
    }
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
      /* Nothing named it. Price the first primitive on its own, hand back
       * whatever rotation that did not cover, and go round again. */
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
    if (!this.anyOpen()) {
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
      axis: AXIS_NAME[first.axis],
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
    if (this.anyOpen()) {
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
function matchSteps(steps, prims, n) {
  for (let i = 0; i < n; i += 1) {
    const s = steps[i];
    const p = prims[i];
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
