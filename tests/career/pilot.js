/*
 * pilot.js: a scripted pilot that flies career lessons through the real
 * aircraft, in Node, and has the lesson's own judges watch.
 *
 * The aircraft is the game's: dist/sim.wasm, Betaflight's own rate curve and
 * PID loop and the plant, through the simulator's flight rig
 * (scripts/lib/flightrig.js), which feeds the game's own trick
 * recogniser the numbers the shell feeds it. The lesson is the career's:
 * src/career/objectives.js judging frame records built the way main.js
 * builds them (careerFrame), sixty a second on the sim clock.
 *
 * Two pilots. In Angle the sticks are tilt, so this one asks for the tilt
 * that gives the acceleration it wants, the way a person flies a first hover:
 * look where you want to be, lean that way, ease off as you arrive. In Acro
 * the rig's own guidance law flies a path (fly), and the rotations are flown
 * as stick inputs held until the turn is done.
 *
 * STICK SIGNS, as this simulator's channels have them and src/input/input.js
 * documents: roll +1 is right, yaw +1 turns the nose right, and pitch -1 is
 * FORWARD (nose down), +1 back.
 *
 * WHAT IT IS NOT. Not the shell: there is no perch here, so "landed" is read
 * as the shell would end up reading it, the craft on the ground and nearly
 * still, and there is no solid world unless a test hands one in. It answers
 * "can a lesson be finished with this aircraft, and in about what time", not
 * "will a person find it easy".
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeRig, V, linePath } from '../../scripts/lib/flightrig.js';
import { createRun } from '../../src/career/objectives.js';
import { docToWorld, headingOf, angleDiff } from '../../src/career/geometry.js';

const here = dirname(fileURLToPath(import.meta.url));
const GAME = join(here, '..', '..');
const WASM = readFileSync(join(GAME, 'dist', 'sim.wasm'));
const DIFF = readFileSync(join(GAME, 'configs', 'betaflight-default.diff'), 'utf8');

const G = 9.81;
const FRAME_MS = 16;
/* Angle mode's tilt at full stick, Betaflight 4.5's angle_limit default. */
const ANGLE_LIMIT = (60 * Math.PI) / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/*
 * A smooth path through world points at a cruise speed: a Catmull-Rom
 * curve, flown at constant speed along its length with a gentle start and
 * stop, in the {p, v, a} shape the rig's guidance law and angleTrack read.
 */
export function splinePath(points, speed, { rampS = 1.5 } = {}) {
  /*
   * CENTRIPETAL Catmull-Rom (knots spaced by the square root of each leg's
   * length), not the uniform kind: with waypoints three metres apart beside
   * legs of ninety, the uniform curve overshoots and loops back on itself,
   * and a pilot told to fly a loop in the middle of a straight does.
   */
  const n = points.length;
  const ext = (a, b) => V(2 * a.x - b.x, 2 * a.y - b.y, 2 * a.z - b.z);
  const P = [n > 1 ? ext(points[0], points[1]) : points[0], ...points,
    n > 1 ? ext(points[n - 1], points[n - 2]) : points[n - 1]];
  const lerp = (a, b, ta, tb, t) => {
    const d = tb - ta;
    if (d < 1e-9) {
      return a;
    }
    const u = (t - ta) / d;
    return V(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
  };
  const knot = (a, b) => Math.sqrt(Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)));
  const dense = [];
  for (let i = 1; i < P.length - 2; i += 1) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    for (let k = 0; k < 24; k += 1) {
      const t = t1 + ((t2 - t1) * k) / 24;
      const a1 = lerp(p0, p1, t0, t1, t);
      const a2 = lerp(p1, p2, t1, t2, t);
      const a3 = lerp(p2, p3, t2, t3, t);
      const b1 = lerp(a1, a2, t0, t2, t);
      const b2 = lerp(a2, a3, t1, t3, t);
      dense.push(lerp(b1, b2, t1, t2, t));
    }
  }
  dense.push(points[n - 1]);
  const cum = [0];
  for (let i = 1; i < dense.length; i += 1) {
    const a = dense[i - 1];
    const b = dense[i];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const L = cum[cum.length - 1];
  /* Distance along the curve at time t: ramp up, cruise, ramp down. */
  const ramp = Math.min(rampS, L / speed / 2);
  const cruiseL = Math.max(0, L - speed * ramp);
  const total = ramp * 2 + cruiseL / speed;
  const sAt = (t) => {
    if (t <= 0) {
      return 0;
    }
    if (t < ramp) {
      return (speed * t * t) / (2 * ramp);
    }
    if (t < ramp + cruiseL / speed) {
      return (speed * ramp) / 2 + speed * (t - ramp);
    }
    const u = Math.min(t - ramp - cruiseL / speed, ramp);
    return (speed * ramp) / 2 + cruiseL + speed * u - (speed * u * u) / (2 * ramp);
  };
  const at = (s) => {
    if (s <= 0) {
      return dense[0];
    }
    if (s >= L) {
      return dense[dense.length - 1];
    }
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    const u = (s - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
    const a = dense[lo];
    const b = dense[hi];
    return V(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
  };
  const h = 0.02;
  const fn = (t) => {
    const p = at(sAt(t));
    const p1 = at(sAt(t + h));
    const p0 = at(sAt(t - h));
    const v = V((p1.x - p0.x) / (2 * h), (p1.y - p0.y) / (2 * h), (p1.z - p0.z) / (2 * h));
    const a = V((p1.x - 2 * p.x + p0.x) / (h * h), (p1.y - 2 * p.y + p0.y) / (h * h), (p1.z - 2 * p.z + p0.z) / (h * h));
    const lim = 25;
    const al = Math.hypot(a.x, a.y, a.z);
    const k = al > lim ? lim / al : 1;
    return { p, v, a: V(a.x * k, a.y * k, a.z * k), done: t >= total };
  };
  fn.total = total;
  fn.metres = L;
  return fn;
}

/* The waypoints that take a craft square through each ring: in front, the
 * middle, behind. Rings as the run prepares them (objectives.js). */
export function ringPoints(rings, lead = 4) {
  const out = [];
  for (const r of rings) {
    /* The first ring is approached from the pads, from wherever they are,
     * so it gets a long straight run in. */
    if (r === rings[0]) {
      out.push(V(r.c.x - r.n.x * lead * 3, r.c.y - r.n.y * lead * 3, r.c.z - r.n.z * lead * 3));
    }
    out.push(V(r.c.x - r.n.x * lead, r.c.y - r.n.y * lead, r.c.z - r.n.z * lead));
    out.push(V(r.c.x, r.c.y, r.c.z));
    out.push(V(r.c.x + r.n.x * lead, r.c.y + r.n.y * lead, r.c.z + r.n.z * lead));
  }
  return out;
}

/* The pads a world spawns on, as world position and the rig's spawn yaw. */
export function spawnOf(doc) {
  const pads = doc.elements.find((e) => e.type === 'startPads');
  const W = doc.field.width;
  const D = doc.field.depth;
  const p = docToWorld(W, D, pads.position.x, pads.position.y, 0);
  return { p: V(p.x, 0, p.z), yaw: pads.yaw - Math.PI / 2 };
}

/*
 * A lesson in the rig. `opts.angle` holds Angle mode as the lesson would.
 * Returns the pilot's verbs; every verb steps the aircraft and feeds the
 * run, and stops early once the run is over.
 */
export async function flyLesson(lesson, opts = {}) {
  const doc = lesson.world.doc;
  const spawn = opts.spawn || spawnOf(doc);
  const rig = await makeRig({
    wasmBytes: WASM, diffText: DIFF, spawn: spawn.p, spawnYaw: spawn.yaw, groundY: 0,
    colliders: opts.colliders || null,
  });
  rig.sim.setAngleMode(lesson.mode === 'angle');
  const run = createRun(lesson, {
    W: doc.field.width, D: doc.field.depth, gatesPerLap: opts.gatesPerLap || 0,
  });
  const tricks = [];
  const origTrick = rig.det.onTrick;
  rig.det.onTrick = (t) => {
    origTrick(t);
    tricks.push(t);
    run.trick(t);
  };
  let prev = rig.craft().p;
  let ms = 0;
  let hoverThr = 0.34;
  const gapSteps = opts.gaps || null;
  /* Every named gap the counter paid, in order, for a failing test to say. */
  const gapLog = [];

  function record(c) {
    const speed = Math.hypot(c.v.x, c.v.y, c.v.z);
    const height = Math.max(0, c.p.y);
    const landed = height < 0.07 && speed < 0.35;
    return {
      simMs: c.simMs,
      prev,
      pos: c.p,
      vel: landed ? V(0, 0, 0) : c.v,
      fwd: c.fwd,
      up: c.up,
      speed: landed ? 0 : speed,
      height: landed ? 0 : height,
      landed,
      gate: null,
      lap: null,
      score: 0,
    };
  }

  function over() {
    const ph = run.status().phase;
    return ph === 'complete' || ph === 'failed';
  }

  /* One millisecond of the given sticks, a frame record every FRAME_MS. */
  function step(sticks) {
    rig.hold(1, sticks[0], sticks[1], sticks[2], sticks[3]);
    ms += 1;
    if (gapSteps) {
      const c = rig.craft();
      gapSteps.step(c.simMs, c.p.x, c.p.y, c.p.z);
      for (const e of gapSteps.events) {
        gapLog.push(e.name);
        run.gap(e);
      }
      gapSteps.events.length = 0;
    }
    if (ms % FRAME_MS === 0) {
      const c = rig.craft();
      run.frame(record(c));
      prev = c.p;
    }
  }

  /* Drive with a stick law for up to `msMax`, until `until` says stop. */
  function drive(law, msMax, until = null) {
    for (let i = 0; i < msMax; i += 1) {
      if (over()) {
        return true;
      }
      const c = rig.craft();
      if (until && until(c, i)) {
        return true;
      }
      step(law(c, i));
    }
    return false;
  }

  /*
   * THE ANGLE PILOT: to a point, at up to vmax, holding a height, nose on a
   * heading (a document yaw) if one is given. Returns sticks.
   */
  function angleLaw(target, { vmax = 3, heading = null, kp = 0.8, kv = 1.4, climb = 1.6 } = {}) {
    return (c) => {
      const ex = target.x - c.p.x;
      const ez = target.z - c.p.z;
      let vx = kp * ex;
      let vz = kp * ez;
      const vm = Math.hypot(vx, vz);
      if (vm > vmax) {
        vx *= vmax / vm;
        vz *= vmax / vm;
      }
      const ax = kv * (vx - c.v.x);
      const az = kv * (vz - c.v.z);
      const h = Math.hypot(c.fwd.x, c.fwd.z) || 1;
      const fx = c.fwd.x / h;
      const fz = c.fwd.z / h;
      const rx = -fz;
      const rz = fx;
      const af = ax * fx + az * fz;
      const ar = ax * rx + az * rz;
      const pitch = clamp(-Math.atan(af / G) / ANGLE_LIMIT, -1, 1);
      const roll = clamp(Math.atan(ar / G) / ANGLE_LIMIT, -1, 1);
      const vyWant = clamp(climb * (target.y - c.p.y), -1.2, 2.5);
      const thrRaw = vertical(c, vyWant);
      let yaw = 0;
      if (heading != null) {
        const have = headingOf(c.fwd);
        /* A document yaw grows counter clockwise and the yaw stick turns
         * the nose right, clockwise, so the stick is minus the error. */
        yaw = clamp(-1.4 * angleDiff(heading, have), -0.6, 0.6);
      }
      return [roll, pitch, yaw, clamp(thrRaw, 0, 1)];
    };
  }

  /*
   * THE THROTTLE: a vertical speed held by proportion and integral, the
   * integral being where hover is, which this pilot finds as it flies the
   * way a person does rather than being told. Airborne only: on the ground
   * nothing it learns is about hover.
   */
  function vertical(c, vyWant) {
    const e = vyWant - c.v.y;
    if (c.p.y > 0.25) {
      hoverThr = clamp(hoverThr + 0.00035 * e, 0.12, 0.6);
    }
    return clamp(hoverThr + 0.06 * e, 0, 1);
  }

  /* Down gently where it is, then throttle off. */
  function landLaw(target, rate = 0.8) {
    return (c) => {
      const s = angleLaw({ ...target, y: c.p.y }, { vmax: 1.2 })(c);
      if (c.p.y < 0.06) {
        return [0, 0, 0, 0];
      }
      s[3] = vertical(c, -rate);
      return s;
    };
  }

  /*
   * THE ANGLE PILOT ON A PATH: the point the path says and the velocity it
   * says, fed forward, the nose along the way it is going. For Angle lessons
   * that are lines rather than places: rings, a figure eight, a slalom.
   */
  function angleTrack(path, { kp = 1.0, kv = 1.6 } = {}) {
    return (c, i) => {
      const d = path(i / 1000);
      const vx = d.v.x + kp * (d.p.x - c.p.x);
      const vz = d.v.z + kp * (d.p.z - c.p.z);
      const ax = d.a.x + kv * (vx - c.v.x);
      const az = d.a.z + kv * (vz - c.v.z);
      const h = Math.hypot(c.fwd.x, c.fwd.z) || 1;
      const fx = c.fwd.x / h;
      const fz = c.fwd.z / h;
      const af = ax * fx + az * fz;
      const ar = ax * -fz + az * fx;
      const pitch = clamp(-Math.atan(af / G) / ANGLE_LIMIT, -1, 1);
      const roll = clamp(Math.atan(ar / G) / ANGLE_LIMIT, -1, 1);
      const vyWant = clamp(d.v.y + 1.6 * (d.p.y - c.p.y), -2, 3);
      let yaw = 0;
      if (Math.hypot(d.v.x, d.v.z) > 0.8) {
        const want = headingOf(V(d.v.x, 0, d.v.z));
        yaw = clamp(-1.2 * angleDiff(want, headingOf(c.fwd)), -0.7, 0.7);
      }
      return [roll, pitch, yaw, vertical(c, vyWant)];
    };
  }

  const near = (t, r = 0.6) => (c) => Math.hypot(c.p.x - t.x, c.p.y - t.y, c.p.z - t.z) < r
    && Math.hypot(c.v.x, c.v.y, c.v.z) < 0.6;

  return {
    rig,
    run,
    tricks,
    gapLog,
    craft: () => rig.craft(),
    over,
    status: () => run.status(),
    elapsed: () => run.status().elapsedMs,
    drive,
    step,
    angleLaw,
    landLaw,
    angleTrack,
    near,
    /* Fly a path in Angle, from where the craft is, until the path ends. */
    angleRoute(path, extraMs = 3000) {
      return drive(angleTrack(path), Math.round(path.total * 1000) + extraMs);
    },
    /* The acro guidance law along a path, nose along the way it goes. */
    acroRoute(path, o = {}) {
      let last = Math.atan2(rig.craft().fwd.x, rig.craft().fwd.z);
      this.path(path, {
        heading: (t) => {
          const d = path(t);
          if (Math.hypot(d.v.x, d.v.z) > 0.5) {
            last = Math.atan2(d.v.x, d.v.z);
          }
          return last;
        },
        ...o,
      });
    },
    /* Down onto a point in Acro: the guidance law brings it down to just
     * over the ground, slowly, and the throttle comes off. */
    landAcro(target, secs = 4) {
      const c = rig.craft().p;
      this.path(linePath(V(c.x, c.y, c.z), V(target.x, 0.06, target.z), secs), { heading: Math.atan2(rig.craft().fwd.x, rig.craft().fwd.z) });
      return drive(() => [0, 0, 0, 0], 2500);
    },
    /* Climb straight up to `y` on the spot. */
    climb(y, msMax = 6000) {
      const c0 = rig.craft().p;
      return drive(angleLaw(V(c0.x, y, c0.z)), msMax, (c) => c.p.y > y - 0.25 && Math.abs(c.v.y) < 0.5);
    },
    /* The acro guidance law along a path, frames fed as it flies. */
    path(p, o = {}) {
      let k = 0;
      /*
       * HEIGHT, HELD BY AN OUTER LOOP. The rig's law has no integral on
       * position, and in forward flight this plant lifts more than in a
       * hover, so it cruises a metre or two above the line, which is a
       * ring's whole radius. The path is handed over lowered by what this
       * learns, the way a pilot eases the throttle back on a straight.
       */
      let biasY = 0;
      const lowered = (t) => {
        const d = p(t);
        return {
          p: V(d.p.x, d.p.y - biasY, d.p.z), v: d.v, a: d.a, done: d.done,
        };
      };
      lowered.total = p.total;
      /* The rig's law is told where hover is, and its own guess is a
       * different tune's: this pilot's, learned climbing off the pad. */
      rig.fly(lowered, {
        hover: hoverThr,
        ...o,
        watch: () => {
          k += 1;
          {
            const c = rig.craft();
            const d = p(k / 1000);
            biasY = clamp(biasY + 0.0009 * (c.p.y - d.p.y), -4, 4);
          }
          if (o.trace && k % 1000 === 0) {
            const c = rig.craft();
            const d = p(k / 1000);
            o.trace(k, c, d, run.status());
          }
          ms += 1;
          if (gapSteps) {
            const c = rig.craft();
            gapSteps.step(c.simMs, c.p.x, c.p.y, c.p.z);
            for (const e of gapSteps.events) {
              gapLog.push(e.name);
              run.gap(e);
            }
            gapSteps.events.length = 0;
          }
          if (ms % FRAME_MS === 0) {
            const c = rig.craft();
            run.frame(record(c));
            prev = c.p;
          }
        },
      });
    },
    /* Hold sticks for ms. */
    hold(ms0, r, p, y, thr) {
      return drive(() => [r, p, y, thr], ms0);
    },
    /* A rotation on one axis, full stick, until `turns` are done by the
     * gyro, then the stick the other way to stop it. Throttle low through. */
    rotate(axis, sign, turns, { thr = 0.25, rate = 1 } = {}) {
      const acc = { v: 0 };
      const idx = axis === 'roll' ? 0 : 1;
      /* The body rate in STICK terms: roll +1 rolls right and p is positive
       * rolling right, but pitch -1 is forward and q is positive nose down,
       * so the pitch rate is turned round to say which stick made it. */
      const rateOf = (c) => (axis === 'roll' ? c.rates.p : -c.rates.q);
      /* Let go a little before the turn is done, by how fast it is going:
       * the brake below takes the rest, as a pilot's thumb does. */
      drive((c) => {
        acc.v += rateOf(c) * 0.001;
        const s = [0, 0, 0, thr];
        s[idx] = sign * rate;
        return s;
      }, 4000, (c) => Math.abs(acc.v) >= 2 * Math.PI * turns - 0.09 * Math.abs(rateOf(c)));
      drive((c) => {
        const s = [0, 0, 0, thr];
        s[idx] = -Math.sign(rateOf(c)) * 0.6;
        return s;
      }, 600, (c) => Math.abs(rateOf(c)) < 1.0);
      return acc.v;
    },
    /* Back to upright and a hover, from whatever attitude, in Acro, by
     * the guidance law holding the spot it is at. */
    recover(secs = 1.2) {
      const c = rig.craft().p;
      const y = Math.max(c.y, 3);
      const p = V(c.x, y, c.z);
      const hold = (t) => ({ p, v: V(0, 0, 0), a: V(0, 0, 0) });
      hold.total = secs;
      this.path(hold, { heading: Math.atan2(rig.craft().fwd.x, rig.craft().fwd.z) });
    },
  };
}
