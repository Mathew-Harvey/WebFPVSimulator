/*
 * remote.js: where another pilot's quad is, now, from poses that arrive
 * late, unevenly and sometimes not at all.
 *
 * The answer is drawn a little in the past. Every pose carries its sender's
 * clock, so the gap between when it was sent and when it arrived is known
 * up to one constant, the difference between the two clocks, and that
 * constant is learnt from the poses themselves: the quickest arrival seen
 * is the floor, and the others are late by how far they sit above it. The
 * quad is then drawn at the sender's time minus a short delay, long enough
 * that the next pose has usually arrived by the time it is needed, so the
 * draw is an interpolation and not a guess.
 *
 * THE DELAY FOLLOWS THE RATE. The board sends the nearest eight pilots at
 * 20 Hz and the rest at 5 Hz, so a pilot moving from far to near has its
 * poses arrive four times as often. The delay is one and a half intervals
 * plus a margin, eased toward its target over half a second so the switch
 * never makes the quad jump in time. Near pilots are drawn about 105 ms in
 * the past, far ones about 330 ms; a far pilot is a speck where the extra
 * quarter second cannot be seen, and a near one is where it matters.
 *
 * THE SMOOTHING IS THE GHOST'S. src/game/ghost.js draws a recorded lap
 * with a Catmull-Rom spline through its samples and normalised lerp for
 * the attitude, and treats any segment faster than GHOST_CUT_SPEED as a
 * teleport to hold across rather than sweep through. The same here, with
 * the spline's tangents taken over real time because live poses are not on
 * a grid, and with a second way to see a teleport: the pose's reset count,
 * which moves when the craft is put back after a crash, so even a far
 * pilot whose two poses either side of a reset were 200 ms apart is cut and
 * not smoothed.
 *
 * WHEN A POSE IS LATE, the quad carries on along its last velocity for at
 * most 150 ms and then holds. A pilot who has parked sends nothing at all,
 * and holding is exactly right for them.
 *
 * No three.js, so scripts/net-selftest.js drives this in Node.
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

import { GHOST_CUT_SPEED } from '../game/ghost.js';

/* Poses kept per pilot: two seconds at 5 Hz, under a second at 20 Hz. */
const KEEP = 12;
const EXTRAPOLATE_MS = 150;
/* The delay, from the interval between poses: 1.5 intervals plus 30 ms,
 * never under 60 ms or over 450 ms. */
const DELAY_INTERVALS = 1.5;
const DELAY_MARGIN_MS = 30;
const DELAY_MIN_MS = 60;
const DELAY_MAX_MS = 450;
const DELAY_EASE_MS = 500;
/* The floor rises this fraction of the way to a late arrival each pose,
 * so a clock that drifts, or a route that got slower, is followed within a
 * few seconds while a single slow pose moves it hardly at all. */
const FLOOR_RISE = 0.02;
/* A silence this long means the next pose starts a new line: the sender's
 * clock wraps every 65.5 s, and two poses half a wrap apart cannot be told
 * apart from two in the wrong order. */
const RESTART_MS = 20000;

export class RemotePilot {
  constructor(id) {
    this.id = id;
    this.t = new Float64Array(KEEP);
    this.pos = new Float64Array(KEEP * 3);
    this.quat = new Float64Array(KEEP * 4);
    this.reset = new Uint8Array(KEEP);
    this.n = 0;
    this.head = 0;
    this.lastRaw = 0;
    this.senderMs = 0;
    this.floor = 0;
    this.interval = 50;
    this.delay = DELAY_MAX_MS;
    this.lastArrival = -Infinity;
    this.lastSampleAt = -Infinity;
    this.spinning = false;
    this.poses = 0;
  }

  /* Index of the k-th oldest kept pose, 0 the oldest. */
  slot(k) {
    return (this.head - this.n + k + KEEP) % KEEP;
  }

  /*
   * One pose as decoded by decodePoseAt, arriving at localMs on this
   * page's clock. Out of order or repeated poses are dropped: the board
   * never reorders, but a reconnect can replay the last one.
   */
  push(pose, localMs) {
    let senderMs;
    if (!this.n || localMs - this.lastArrival > RESTART_MS) {
      this.n = 0;
      senderMs = pose.clock;
      this.floor = localMs - senderMs;
      this.delay = DELAY_MAX_MS;
    } else {
      const step = ((pose.clock - this.lastRaw + 32768) & 0xffff) - 32768;
      if (step <= 0) {
        return false;
      }
      senderMs = this.senderMs + step;
      /* The interval between poses, smoothed, for the delay. */
      this.interval += (Math.min(step, 1000) - this.interval) * 0.2;
      const offset = localMs - senderMs;
      if (offset < this.floor) {
        this.floor = offset;
      } else {
        this.floor += (offset - this.floor) * FLOOR_RISE;
      }
    }
    this.lastRaw = pose.clock;
    this.senderMs = senderMs;
    this.lastArrival = localMs;
    let { qx, qy, qz, qw } = pose;
    if (this.n) {
      /* Hemisphere aligned with the pose before, as the ghost's encoder
       * does, so the lerp below always takes the short way round. */
      const p = ((this.head - 1 + KEEP) % KEEP) * 4;
      if (qx * this.quat[p] + qy * this.quat[p + 1] + qz * this.quat[p + 2] + qw * this.quat[p + 3] < 0) {
        qx = -qx;
        qy = -qy;
        qz = -qz;
        qw = -qw;
      }
    }
    const h = this.head;
    this.t[h] = senderMs;
    this.pos[h * 3] = pose.px;
    this.pos[h * 3 + 1] = pose.py;
    this.pos[h * 3 + 2] = pose.pz;
    this.quat[h * 4] = qx;
    this.quat[h * 4 + 1] = qy;
    this.quat[h * 4 + 2] = qz;
    this.quat[h * 4 + 3] = qw;
    this.reset[h] = pose.resets;
    this.spinning = pose.spinning;
    this.head = (h + 1) % KEEP;
    this.n = Math.min(KEEP, this.n + 1);
    this.poses += 1;
    return true;
  }

  /* True between two kept poses that must not be smoothed across. */
  cutAt(a, b) {
    if (this.reset[a] !== this.reset[b]) {
      return true;
    }
    const dt = (this.t[b] - this.t[a]) / 1000;
    const dx = this.pos[b * 3] - this.pos[a * 3];
    const dy = this.pos[b * 3 + 1] - this.pos[a * 3 + 1];
    const dz = this.pos[b * 3 + 2] - this.pos[a * 3 + 2];
    return dt <= 0 || Math.sqrt(dx * dx + dy * dy + dz * dz) / dt > GHOST_CUT_SPEED;
  }

  /*
   * The pose to draw at localMs, written into out = { px, py, pz, qx, qy,
   * qz, qw, cut, spinning }. Returns false before the first pose. cut is
   * true while the draw time sits inside a teleport, the renderer's cue to
   * fade, as it is for a ghost.
   */
  sample(localMs, out) {
    if (!this.n) {
      return false;
    }
    /* Ease the delay toward what the arrival rate asks for. */
    const want = Math.min(DELAY_MAX_MS, Math.max(DELAY_MIN_MS, this.interval * DELAY_INTERVALS + DELAY_MARGIN_MS));
    const dtFrame = Math.min(250, Math.max(0, localMs - this.lastSampleAt));
    this.lastSampleAt = localMs;
    this.delay += (want - this.delay) * (1 - Math.exp(-dtFrame / DELAY_EASE_MS));
    const t = localMs - this.floor - this.delay;
    out.spinning = this.spinning;
    out.cut = false;

    const newest = this.slot(this.n - 1);
    if (this.n === 1 || t >= this.t[newest]) {
      /* Past the newest pose: carry on along the last velocity, briefly. */
      this.copyPose(newest, out);
      if (this.n >= 2) {
        const prev = this.slot(this.n - 2);
        if (!this.cutAt(prev, newest)) {
          const ahead = Math.min(EXTRAPOLATE_MS, t - this.t[newest]) / (this.t[newest] - this.t[prev]);
          out.px += (this.pos[newest * 3] - this.pos[prev * 3]) * ahead;
          out.py += (this.pos[newest * 3 + 1] - this.pos[prev * 3 + 1]) * ahead;
          out.pz += (this.pos[newest * 3 + 2] - this.pos[prev * 3 + 2]) * ahead;
        }
      }
      return true;
    }
    const oldest = this.slot(0);
    if (t <= this.t[oldest]) {
      this.copyPose(oldest, out);
      return true;
    }
    /* The segment that holds t. */
    let k = this.n - 2;
    while (k > 0 && this.t[this.slot(k)] > t) {
      k -= 1;
    }
    const i1 = this.slot(k);
    const i2 = this.slot(k + 1);
    if (this.cutAt(i1, i2)) {
      /* Hold the near side; the far side arrives with the next segment. */
      this.copyPose(i1, out);
      out.cut = true;
      return true;
    }
    const t1 = this.t[i1];
    const t2 = this.t[i2];
    const h = t2 - t1;
    const u = (t - t1) / h;
    const okBefore = k > 0 && !this.cutAt(this.slot(k - 1), i1);
    const okAfter = k + 2 < this.n && !this.cutAt(i2, this.slot(k + 2));
    if (okBefore && okAfter) {
      /*
       * Cubic Hermite with Catmull-Rom tangents taken over real time, the
       * ghost's spline for samples that are not evenly spaced.
       */
      const i0 = this.slot(k - 1);
      const i3 = this.slot(k + 2);
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      const s1 = h / (t2 - this.t[i0]);
      const s2 = h / (this.t[i3] - t1);
      for (let c = 0; c < 3; c += 1) {
        const p0 = this.pos[i0 * 3 + c];
        const p1 = this.pos[i1 * 3 + c];
        const p2 = this.pos[i2 * 3 + c];
        const p3 = this.pos[i3 * 3 + c];
        const v = h00 * p1 + h10 * (p2 - p0) * s1 + h01 * p2 + h11 * (p3 - p1) * s2;
        if (c === 0) out.px = v;
        else if (c === 1) out.py = v;
        else out.pz = v;
      }
    } else {
      out.px = this.pos[i1 * 3] + (this.pos[i2 * 3] - this.pos[i1 * 3]) * u;
      out.py = this.pos[i1 * 3 + 1] + (this.pos[i2 * 3 + 1] - this.pos[i1 * 3 + 1]) * u;
      out.pz = this.pos[i1 * 3 + 2] + (this.pos[i2 * 3 + 2] - this.pos[i1 * 3 + 2]) * u;
    }
    let qx = this.quat[i1 * 4] + (this.quat[i2 * 4] - this.quat[i1 * 4]) * u;
    let qy = this.quat[i1 * 4 + 1] + (this.quat[i2 * 4 + 1] - this.quat[i1 * 4 + 1]) * u;
    let qz = this.quat[i1 * 4 + 2] + (this.quat[i2 * 4 + 2] - this.quat[i1 * 4 + 2]) * u;
    let qw = this.quat[i1 * 4 + 3] + (this.quat[i2 * 4 + 3] - this.quat[i1 * 4 + 3]) * u;
    const n = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
    if (n > 1e-6) {
      qx /= n;
      qy /= n;
      qz /= n;
      qw /= n;
    } else {
      qx = 0;
      qy = 0;
      qz = 0;
      qw = 1;
    }
    out.qx = qx;
    out.qy = qy;
    out.qz = qz;
    out.qw = qw;
    return true;
  }

  copyPose(i, out) {
    out.px = this.pos[i * 3];
    out.py = this.pos[i * 3 + 1];
    out.pz = this.pos[i * 3 + 2];
    out.qx = this.quat[i * 4];
    out.qy = this.quat[i * 4 + 1];
    out.qz = this.quat[i * 4 + 2];
    out.qw = this.quat[i * 4 + 3];
  }
}
