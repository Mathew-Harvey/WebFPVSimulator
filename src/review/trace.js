/*
 * trace.js: a lap as the pilot flew it, sticks and all, for the review.
 *
 * WHY THIS IS NOT THE GHOST. A ghost (src/game/ghost.js) is a pose thirty
 * times a second, which is everything a translucent craft needs. A trace is
 * the same lap a hundred times a second with what the pilot did and what the
 * aircraft did about it: where it was, how it was pointed, how fast it was
 * going, how fast it was turning, the four sticks, the four rotors and the
 * pack. The review's replay draws from it, so a lap replays smoothly and its
 * sticks can be shown under the timeline.
 *
 * THE SAME STANDING AS THE GHOST. Downstream of the physics and feeding
 * nothing back into it. No Three.js and no DOM, so
 * scripts/review-trace-selftest.js drives every part of this in Node.
 *
 * THE CLOCK IS THE SIMULATION'S. A sample is taken on a step of the 1 kHz
 * loop whose time in milliseconds is a multiple of ten, so the grid is the
 * integrator's own and a trace does not depend on the display's rate.
 *
 * TWO FRAMES IN ONE SAMPLE, AND NOTHING CONVERTED HERE. Position and
 * attitude are the scene's, the frame src/game/race.js scores in and a ghost
 * is stored in. The shell converts them through src/render/frame.js before
 * it calls push; this file never converts a coordinate. Velocity and body
 * rates are the plant's own, in its own frame and units.
 *
 * WHAT A SAMPLE HOLDS, 24 f32, in this order (F below):
 *   t                 ms from the lap's start; negative in the lead in
 *   px py pz          scene position, world metres
 *   qx qy qz qw       scene attitude
 *   vx vy vz          plant velocity, m/s
 *   p q r             body rates, rad/s
 *   roll pitch yaw throttle
 *                     the sticks as the module was given them: -1..1 with
 *                     +roll right, +pitch nose up, +yaw nose right, and
 *                     throttle 0..1 (src/native/sim_abi.h)
 *   rpm0..rpm3        rotor speed, Betaflight motor order
 *   volts amps        the pack under load
 *
 * A LAP CARRIES A LITTLE OF BEFORE AND AFTER. Half a second before the
 * timing gate and a fifth after the finish. `lead` is how many samples sit
 * before t = 0.
 *
 * MEMORY. The buffer starts at a minute of flight and doubles when a lap
 * needs more, up to the ten minutes a ghost may last. With no lap running
 * it holds the last half second and no more.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

export const TRACE_RATE_HZ = 100;
export const TRACE_STEP_MS = 1000 / TRACE_RATE_HZ;
export const TRACE_FIELDS = 24;
/* Before the timing gate and after the finish. */
export const TRACE_LEAD_MS = 500;
export const TRACE_TAIL_MS = 200;
/* The longest lap a trace carries, the same ten minutes as a ghost. */
export const TRACE_MAX_MS = 600_000;

/* Where each number sits in a sample. */
export const F = Object.freeze({
  T: 0,
  PX: 1, PY: 2, PZ: 3,
  QX: 4, QY: 5, QZ: 6, QW: 7,
  VX: 8, VY: 9, VZ: 10,
  P: 11, Q: 12, R: 13,
  ROLL: 14, PITCH: 15, YAW: 16, THROTTLE: 17,
  RPM0: 18, RPM1: 19, RPM2: 20, RPM3: 21,
  VOLTS: 22, AMPS: 23,
});

/* Enough for the longest lap with its lead and tail, and a second to spare. */
export const TRACE_CAPACITY = Math.ceil((TRACE_MAX_MS + TRACE_LEAD_MS + TRACE_TAIL_MS + 1000) / TRACE_STEP_MS);
/* What the buffer starts at: a minute of flight. */
const START_SAMPLES = 6000;
/* With no lap running the recorder keeps the last half second and no more;
 * it tidies up when this many samples have gathered. */
const IDLE_SAMPLES = 400;

/* One recorded lap. Immutable once made. */
export class TraceLap {
  constructor({ rateHz, durationMs, splits, cuts, lead, count, data, worldScale, meta }) {
    this.rateHz = rateHz;
    this.durationMs = durationMs;
    this.splits = splits;
    this.cuts = cuts;
    this.lead = lead;
    this.count = count;
    this.data = data;
    this.worldScale = worldScale;
    this.meta = meta;
  }

  /* Field f of sample i. */
  at(i, f) {
    return this.data[i * TRACE_FIELDS + f];
  }

  /* A few numbers a person can check a lap against what they remember. */
  summary() {
    let top = 0;
    let thr = 0;
    let n = 0;
    for (let i = this.lead; i < this.count; i += 1) {
      if (this.at(i, F.T) > this.durationMs) {
        break;
      }
      top = Math.max(top, Math.hypot(this.at(i, F.VX), this.at(i, F.VY), this.at(i, F.VZ)));
      thr += this.at(i, F.THROTTLE);
      n += 1;
    }
    return {
      durationMs: this.durationMs,
      samples: this.count,
      lead: this.lead,
      splits: this.splits.length,
      cuts: this.cuts.length,
      topSpeed: top,
      meanThrottle: n ? thr / n : 0,
      course: this.meta.course ?? '',
    };
  }
}

/*
 * The recorder. The shell pushes a sample on every tenth step while it is
 * on, tells it when the race starts a lap, and tells it when the race
 * finishes one. Off, it holds no memory and push returns at once.
 */
export class TraceRecorder {
  constructor() {
    this.on = false;
    this.ms = null;
    this.buf = null;
    this.clear();
    /* Laps finished and not yet collected by the shell. */
    this.done = [];
  }

  setEnabled(on) {
    const want = Boolean(on);
    if (want === this.on) {
      return;
    }
    this.on = want;
    if (want) {
      this.ms = new Float64Array(START_SAMPLES);
      this.buf = new Float32Array(START_SAMPLES * TRACE_FIELDS);
    } else {
      this.ms = null;
      this.buf = null;
      this.done = [];
    }
    this.clear();
  }

  /* Forget what is held: a course change, a reset, a clock that went back. */
  clear() {
    this.count = 0;
    this.lapStartMs = null;
    this.pending = null;
    this.cutsAt = [];
    this.markNext = false;
  }

  abort() {
    this.clear();
  }

  /* Room for one more sample: double the buffer, up to TRACE_CAPACITY.
   * Returns false when it is already that big. */
  grow() {
    const have = this.ms.length;
    if (have >= TRACE_CAPACITY) {
      return false;
    }
    const size = Math.min(TRACE_CAPACITY, have * 2);
    const ms = new Float64Array(size);
    ms.set(this.ms.subarray(0, this.count));
    const buf = new Float32Array(size * TRACE_FIELDS);
    buf.set(this.buf.subarray(0, this.count * TRACE_FIELDS));
    this.ms = ms;
    this.buf = buf;
    return true;
  }

  /*
   * One sample. simMs is the simulation clock at the step just taken; the
   * shell calls this only on multiples of TRACE_STEP_MS. The pose is the
   * scene's, already converted. `st` is the module's state block and `rc`
   * the sticks it was last given.
   */
  push(simMs, px, py, pz, qx, qy, qz, qw, st, rc) {
    if (!this.on) {
      return;
    }
    if (this.count && simMs <= this.ms[this.count - 1]) {
      /* The clock went back: the module was reset. Nothing held is on the
       * new clock. */
      this.clear();
    }
    if (this.lapStartMs === null && !this.pending && this.count >= IDLE_SAMPLES) {
      this.compact(simMs);
    }
    if (this.count === this.ms.length) {
      this.compact(simMs);
      if (this.count === this.ms.length && !this.grow()) {
        /* A lap longer than a trace carries. It is not a lap. */
        this.clear();
      }
    }
    const i = this.count;
    const o = i * TRACE_FIELDS;
    const b = this.buf;
    this.ms[i] = simMs;
    b[o + F.T] = 0;
    b[o + F.PX] = px; b[o + F.PY] = py; b[o + F.PZ] = pz;
    b[o + F.QX] = qx; b[o + F.QY] = qy; b[o + F.QZ] = qz; b[o + F.QW] = qw;
    b[o + F.VX] = st[4]; b[o + F.VY] = st[5]; b[o + F.VZ] = st[6];
    b[o + F.P] = st[11]; b[o + F.Q] = st[12]; b[o + F.R] = st[13];
    b[o + F.ROLL] = rc.roll; b[o + F.PITCH] = rc.pitch; b[o + F.YAW] = rc.yaw; b[o + F.THROTTLE] = rc.throttle;
    b[o + F.RPM0] = st[14]; b[o + F.RPM1] = st[15]; b[o + F.RPM2] = st[16]; b[o + F.RPM3] = st[17];
    b[o + F.VOLTS] = st[18]; b[o + F.AMPS] = st[19];
    this.count = i + 1;
    if (this.markNext) {
      this.cutsAt.push(simMs);
      this.markNext = false;
    }
    if (this.pending && simMs >= this.pending.endMs + TRACE_TAIL_MS) {
      this.finalize();
    }
  }

  /* The craft was just moved by hand (a crash recovery): the next sample is
   * the far side of a jump, not flight from the last one. */
  markCut() {
    if (this.on) {
      this.markNext = true;
    }
  }

  /* The race started a lap at this time on the simulation clock. */
  lapBegan(startMs) {
    if (!this.on) {
      return;
    }
    this.lapStartMs = startMs;
    if (!this.pending) {
      this.compact(startMs);
    }
  }

  /*
   * The race finished the lap that began at startMs. The lap is not made
   * yet: its tail has not been flown. It is made by the push that reaches
   * the end of the tail, and waits in `done` for takeDone. Returns whether
   * a lap is coming.
   */
  cut(startMs, durationMs, splits, meta, worldScale = 1) {
    if (!this.on || startMs == null || !(durationMs > 0) || durationMs > TRACE_MAX_MS) {
      return false;
    }
    if (this.pending) {
      this.finalize();
    }
    /* The buffer has to reach back to the start, and forward to about the
     * finish, which is in the frame the shell is calling from. After a clear
     * it does neither. */
    if (!this.count || this.ms[0] > startMs || this.ms[this.count - 1] < startMs + durationMs - 100) {
      return false;
    }
    this.pending = {
      startMs,
      endMs: startMs + durationMs,
      durationMs,
      splits: [...(splits || [])],
      meta: { ...(meta || {}) },
      worldScale,
    };
    return true;
  }

  /* Make the pending lap now, with whatever tail has been flown. For a
   * pilot who stops straight after the line and opens the review. */
  flush() {
    if (this.on && this.pending) {
      this.finalize();
    }
  }

  /* The laps finished since the last call, or null. */
  takeDone() {
    if (!this.done.length) {
      return null;
    }
    const out = this.done;
    this.done = [];
    return out;
  }

  finalize() {
    const p = this.pending;
    this.pending = null;
    const from = p.startMs - TRACE_LEAD_MS;
    const to = p.endMs + TRACE_TAIL_MS;
    let i0 = 0;
    while (i0 < this.count && this.ms[i0] < from) {
      i0 += 1;
    }
    let i1 = i0;
    while (i1 < this.count && this.ms[i1] <= to) {
      i1 += 1;
    }
    const count = i1 - i0;
    if (count >= 2) {
      const data = this.buf.slice(i0 * TRACE_FIELDS, i1 * TRACE_FIELDS);
      let lead = 0;
      for (let i = 0; i < count; i += 1) {
        const t = this.ms[i0 + i] - p.startMs;
        data[i * TRACE_FIELDS + F.T] = t;
        if (t < 0) {
          lead += 1;
        }
      }
      this.done.push(new TraceLap({
        rateHz: TRACE_RATE_HZ,
        durationMs: p.durationMs,
        splits: p.splits,
        cuts: this.cutsAt.filter((c) => c >= from && c <= to).map((c) => c - p.startMs),
        lead,
        count,
        data,
        worldScale: p.worldScale,
        meta: p.meta,
      }));
    }
    this.compact(this.count ? this.ms[this.count - 1] : 0);
  }

  /* Drop what no lap can want any more: everything older than the lead in
   * of the lap being made, or of the lap being flown, or of now. */
  compact(nowMs) {
    const anchor = this.pending ? this.pending.startMs : (this.lapStartMs ?? nowMs);
    const keepFrom = anchor - TRACE_LEAD_MS;
    let i0 = 0;
    while (i0 < this.count && this.ms[i0] < keepFrom) {
      i0 += 1;
    }
    if (i0 === 0) {
      return;
    }
    this.ms.copyWithin(0, i0, this.count);
    this.buf.copyWithin(0, i0 * TRACE_FIELDS, this.count * TRACE_FIELDS);
    this.count -= i0;
    this.cutsAt = this.cutsAt.filter((c) => c >= keepFrom);
  }
}

/* This session's traces per course: the best and the previous, the two a
 * ghost book keeps and for the same reason, so a session ghost can be
 * replayed from its trace; and the best a new best replaced, which is the
 * ghost that new lap chased, so the replay has its sticks. Memory only. */
export class TraceBook {
  constructor() {
    this.byCourse = new Map();
  }

  keep(key, lap) {
    if (!lap) {
      return { best: false };
    }
    let slot = this.byCourse.get(key);
    if (!slot) {
      slot = { best: null, previous: null, replaced: null };
      this.byCourse.set(key, slot);
    }
    slot.previous = lap;
    if (!slot.best || lap.durationMs < slot.best.durationMs) {
      slot.replaced = slot.best;
      slot.best = lap;
      return { best: true };
    }
    return { best: false };
  }

  best(key) {
    const slot = this.byCourse.get(key);
    return slot ? slot.best : null;
  }

  previous(key) {
    const slot = this.byCourse.get(key);
    return slot ? slot.previous : null;
  }

  /* The best the current best replaced, or null. */
  replaced(key) {
    const slot = this.byCourse.get(key);
    return slot ? slot.replaced : null;
  }
}
