/*
 * fieldwatch.js: where every other pilot in a room has been, and how far
 * round the course they are, for the overview camera.
 *
 * The overview (the owner's ask of 28 October 2026) is a free camera over
 * the whole field, with a long trail behind every quad and a race board a
 * commentator can call a race from. Both come from here, and both come
 * from the poses this page already draws: nothing new is sent or asked
 * for, and the board is not involved.
 *
 * RECORDED ALWAYS, DRAWN ONLY WHEN WATCHED. The owner's pick of the same
 * day: the trails are kept from the moment a pilot is in a room, so a
 * commentator pressing O sees the race that has been flown, not one that
 * starts now. Keeping them is a distance check per pilot per frame and,
 * every 0.6 m a quad flies, four numbers written into a buffer allocated
 * once per pilot. Nothing is drawn and nothing reaches the GPU until the
 * overview is open (src/render/trails.js), so a pilot who is flying pays
 * for the check and nothing else.
 *
 * FROM THE DRAWN POSE. The trail is fed the pose the quad is drawn at,
 * which src/net/remote.js has already smoothed through the kept poses with
 * the ghost's spline, so a far pilot sent five times a second still leaves
 * a curve and not a string of straight lines, and the trail ends exactly
 * at the quad. A teleport (a reset, a crash put back) breaks the trail, so
 * it never draws a line through a wall.
 *
 * HOW FAR ROUND. In a room race the board keeps the laps (src/rooms.js
 * there). The gates in between are worked out here, on the watcher's own
 * page, by the same test a real lap is: the segment between two samples
 * through the next gate's plane, close enough to its middle, in order. A
 * gate missed holds the count there, as it holds a real lap. The time a
 * pilot reaches each gate of each lap gives the gap to whoever reached it
 * first, which is how a broadcast's gap is measured.
 *
 * No three.js and no DOM, so scripts/net-selftest.js drives this in Node.
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

/* Samples kept per pilot, and the distance between two. 1024 at 0.6 m is
 * 600 m of flight, a lap of every track on the board; a room of 30 keeps
 * under half a megabyte. */
export const TRAIL_CAP = 1024;
export const TRAIL_STEP = 0.6;
/* A sample at least this often while a quad moves at all, so a slow line
 * through a gate still has its time. */
const TRAIL_STEP_MS = 400;
/* How close to a gate's middle a crossing of its plane counts. A gate's
 * opening is 1.75 m at the board's scale and a whoop map's is built at the
 * same size in world metres, so this is a little over its diagonal: a
 * commentator's count, generous where the sim's own is strict. */
const GATE_REACH = 3.2;
/* The speed shown for a pilot, smoothed over about this long. */
const SPEED_MS = 300;

export class FieldWatch {
  constructor({ cap = TRAIL_CAP, step = TRAIL_STEP } = {}) {
    this.cap = cap;
    this.step2 = step * step;
    /* id -> { buf: Float32Array(cap * 4) of x y z t, head, n, lx ly lz lt,
     * speed, cuts, gate progress }. t is ms since this object was made, so
     * a float holds it to a millisecond for hours. */
    this.pilots = new Map();
    this.t0 = 0;
    this.course = null;
    /* The race being counted: its number, GO on this page's clock, and
     * the first time anyone reached each gate of each lap. */
    this.raceN = 0;
    this.goAt = 0;
    this.firsts = new Map();
  }

  /*
   * One pilot's drawn pose this frame, in scene world metres, at nowMs on
   * this page's clock. cut: inside a teleport. Allocates only the first
   * time a pilot is seen.
   */
  note(id, px, py, pz, cut, nowMs) {
    if (!this.t0) {
      this.t0 = nowMs - 1;
    }
    const t = nowMs - this.t0;
    let p = this.pilots.get(id);
    if (!p) {
      p = {
        buf: new Float32Array(this.cap * 4), head: 0, n: 0,
        lx: px, ly: py, lz: pz, lt: t, broke: true,
        speed: 0, sx: px, sy: py, sz: pz, st: t,
        lap: 0, next: 0, passed: 0, reached: 0, started: false, lapAt: 0, cuts: 0,
      };
      this.pilots.set(id, p);
    }
    if (cut) {
      /* A teleport is a reset: a crash put back, or the start line. */
      if (!p.broke) {
        p.cuts += 1;
      }
      p.broke = true;
      return;
    }
    /* The speed, from the drawn pose, a few times a second. */
    const sdt = t - p.st;
    if (sdt >= 50) {
      const dx = px - p.sx;
      const dy = py - p.sy;
      const dz = pz - p.sz;
      const v = Math.sqrt(dx * dx + dy * dy + dz * dz) / (sdt / 1000);
      p.speed += (v - p.speed) * Math.min(1, sdt / SPEED_MS);
      p.sx = px;
      p.sy = py;
      p.sz = pz;
      p.st = t;
    }
    const dx = px - p.lx;
    const dy = py - p.ly;
    const dz = pz - p.lz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (!p.broke && d2 < this.step2 && (t - p.lt < TRAIL_STEP_MS || d2 < 1e-6)) {
      return;
    }
    if (!p.broke && this.course) {
      this.gates(p, p.lx, p.ly, p.lz, px, py, pz, p.lt, t);
    }
    this.push(p, p.broke ? NaN : px, py, pz, t);
    if (p.broke) {
      /* The break is a sample with no position; the pose after it starts
       * the line again. */
      this.push(p, px, py, pz, t);
      p.broke = false;
    }
    p.lx = px;
    p.ly = py;
    p.lz = pz;
    p.lt = t;
  }

  push(p, x, y, z, t) {
    const i = p.head * 4;
    p.buf[i] = x;
    p.buf[i + 1] = y;
    p.buf[i + 2] = z;
    p.buf[i + 3] = t;
    p.head = (p.head + 1) % this.cap;
    if (p.n < this.cap) {
      p.n += 1;
    }
  }

  forget(id) {
    this.pilots.delete(id);
  }

  /* Every pilot back to nothing: another map, another room. */
  clear() {
    this.pilots.clear();
    this.firsts.clear();
  }

  /* Now, on this object's clock, for the trail's ages. */
  clock(nowMs) {
    return this.t0 ? nowMs - this.t0 : 0;
  }

  /*
   * The course's gates in order, [{ x, y, z, az: { x, z } }] as the sim's
   * race holds them (scene world, az the way through), or null for a map
   * with none. A new course starts every count again.
   */
  setCourse(gates) {
    this.course = gates && gates.length ? gates.map((g) => {
      const l = Math.hypot(g.az.x, g.az.z) || 1;
      return { x: g.x, y: g.y, z: g.z, nx: g.az.x / l, nz: g.az.z / l };
    }) : null;
    this.firsts.clear();
    for (const p of this.pilots.values()) {
      this.restart(p);
    }
  }

  restart(p) {
    p.lap = 0;
    p.next = 0;
    p.passed = 0;
    p.reached = 0;
    p.started = false;
    p.lapAt = 0;
  }

  /* When this pilot's lap began on this object's clock, for the trail of
   * the whole lap, or 0 when no lap is being counted: then the trail is
   * everything kept. */
  lapStart(id) {
    const p = this.pilots.get(id);
    return p && p.started ? p.lapAt : 0;
  }

  /*
   * A room race: its number and GO on this page's clock. Every count
   * starts again at a new race. Called every frame the race is on; does
   * nothing until the number changes.
   */
  race(n, goLocal) {
    if (n === this.raceN) {
      return;
    }
    this.raceN = n;
    this.goAt = goLocal ? goLocal - this.t0 : 0;
    this.firsts.clear();
    for (const p of this.pilots.values()) {
      this.restart(p);
    }
  }

  /* The segment a to b, at times ta and tb, against the next gate. */
  gates(p, ax, ay, az, bx, by, bz, ta, tb) {
    if (this.goAt && tb < this.goAt) {
      return;
    }
    const g = this.course[p.next];
    const da = (ax - g.x) * g.nx + (az - g.z) * g.nz;
    const db = (bx - g.x) * g.nx + (bz - g.z) * g.nz;
    if ((da > 0) === (db > 0) || da === db) {
      return;
    }
    const u = da / (da - db);
    const cx = ax + (bx - ax) * u - g.x;
    const cy = ay + (by - ay) * u - g.y;
    const cz = az + (bz - az) * u - g.z;
    /* Measured from the gate's own middle, about a metre up. */
    if (cx * cx + (cy - 1) * (cy - 1) + cz * cz > GATE_REACH * GATE_REACH) {
      return;
    }
    const at = ta + (tb - ta) * u;
    if (p.next === 0) {
      if (p.started) {
        p.lap += 1;
      }
      p.started = true;
      p.passed = 1;
      p.lapAt = at;
    } else {
      p.passed = p.next + 1;
    }
    p.next = (p.next + 1) % this.course.length;
    p.reached = at;
    const key = p.lap * 1024 + p.passed;
    if (!this.firsts.has(key)) {
      this.firsts.set(key, at);
    }
  }

  /*
   * How far round a pilot is: { lap, passed, gates, gap, speed }, lap the
   * laps finished by this page's count, passed the gates of this lap
   * (1 is the start gate), gap the ms behind whoever reached the same gate
   * first, 0 for them. Null for a pilot never drawn.
   */
  progress(id) {
    const p = this.pilots.get(id);
    if (!p) {
      return null;
    }
    const key = p.lap * 1024 + p.passed;
    const first = this.firsts.get(key);
    return {
      lap: p.lap,
      passed: p.passed,
      gates: this.course ? this.course.length : 0,
      started: p.started,
      gap: first == null ? 0 : p.reached - first,
      reached: p.reached,
      speed: p.speed,
      cuts: p.cuts,
      lapAt: p.lapAt,
      x: p.lx,
      y: p.ly,
      z: p.lz,
    };
  }

  /*
   * The order on the course, best first: the board's finishers first in
   * the board's order, then by gates reached, then by when. rows: the
   * board's race rows ({ id, laps, done, dnf }) or null outside a race.
   * ids: the pilots to place.
   */
  order(ids, rows) {
    const N = this.course ? this.course.length : 0;
    const row = new Map((rows || []).map((r, i) => [r.id, { ...r, i }]));
    const score = (id) => {
      const p = this.pilots.get(id);
      const r = row.get(id);
      const laps = r ? r.laps : (p ? p.lap : 0);
      return {
        id,
        done: r && r.done ? 1 : 0,
        dnf: r && r.dnf ? 1 : 0,
        i: r ? r.i : 1e9,
        far: laps * (N + 1) + (p ? p.passed : 0),
        at: p ? p.reached : Infinity,
      };
    };
    return ids.map(score).sort((a, b) => (a.dnf - b.dnf) || (b.done - a.done)
      || (a.done && b.done ? a.i - b.i : 0) || (b.far - a.far) || (a.at - b.at) || (a.id - b.id))
      .map((s) => s.id);
  }
}
