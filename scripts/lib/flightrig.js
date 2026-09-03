/*
 * flightrig.js: fly the real aircraft through a real solid world, in Node.
 *
 * WHY THIS EXISTS, and it is the same reason scripts/park-fly.js exists,
 * arrived at from the other side.
 *
 * Every check this repository has had on the trick recogniser was one of
 * three things, and each was blind to a different fault:
 *
 *   scripts/score-selftest.js flies the real plant but hands the recogniser
 *   no nose and no up axis, so the whole de-banking path has never had a
 *   single case run through it;
 *   scripts/trick-sweep.js builds its attitudes out of the same position
 *   arithmetic the winding uses, so a frame convention error cancelled
 *   between the two halves and it reported forty seven patterns clean over
 *   a Powerloop that read minus three and three quarter turns in the shell;
 *   scripts/park-fly.js flies the real shell in a real browser and is the
 *   only one that caught that, and it is NOT DETERMINISTIC: the same case
 *   passes and fails across otherwise identical runs, so a green run is not
 *   evidence and the log says so in as many words.
 *
 * This is the fourth thing. It flies dist/sim.wasm, through Betaflight's own
 * rate curve and PID loop and the plant, along a guidance law rather than a
 * script of stick timings, through the same src/game/collide.js the shell
 * uses, and feeds the same src/game/trickdetect.js the same six-plus-six
 * numbers the shell feeds it, through the same src/render/frame.js seam. It
 * has no browser, no renderer and no wall clock in it, so the same flight
 * produces the same trace and the same trick names every time it is run.
 *
 * WHAT IT IS NOT. It is not the shell. The shell has a camera, a menu, a
 * ghost, audio and a race in it, and none of that is here. What is here is
 * every part of the shell that stands between the plant and the recogniser:
 * the ground plane, the obstacle contact pass on the sim clock, the frame
 * conversions with the spawn rotation in them, and the detector feed. Where
 * one of those is ported rather than shared, the comment says so, because a
 * port that drifts is worse than no rig at all.
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

import { loadSim, SIM_OK } from '../../tests/lib/simmod.js';
import { simPosToThree, threePosToSim, threeDirToSim } from '../../src/render/frame.js';
import {
  Colliders, contactPatch, contactMaterial, craftVerticalHalf,
  GROUND_MU, GROUND_E, GRAZE_SPEED_MAX, BOUNCE_SEPARATION,
} from '../../src/game/collide.js';
import { TrickDetector } from '../../src/game/trickdetect.js';

/* The shell's own numbers, and they have to stay the shell's. */
const SPAWN_ALT = 0.045;
const OBSTACLE_STEP = 4;
const BOUNCE_COOLDOWN_MS = 180;
/*
 * THE RADIO'S OWN RATE, and it has to be the shell's.
 *
 * Betaflight derives its feedforward gain and its RC smoothing cutoffs from
 * the interval it MEASURES between frames, so a rig that talks to it at a
 * different rate is flying a differently tuned aircraft. The shell runs at
 * RC_HZ = 250, a 4 ms period; the first version of this file used 2 ms
 * because that is what scripts/score-selftest.js uses, and a rig whose
 * answers are meant to transfer to the shell cannot afford the difference.
 */
const RC_PERIOD = 1 / 250;
const G = 9.81;
export const TURN = 6.283185307179586;

/* ---------------------------------------------------------------- *
 * Vectors and quaternions, written out. This runs in Node and there is
 * no three.js here; there is also no trigonometry in anything that
 * reaches the plant, only in the guidance law, which is a pilot and not
 * a physics path.
 * ---------------------------------------------------------------- */
export const V = (x, y, z) => ({ x, y, z });
export const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => V(
  a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x,
);
export const len = (a) => Math.sqrt(dot(a, a));
export const norm = (a) => {
  const l = len(a) || 1;
  return mul(a, 1 / l);
};
export const cl = (v, a, b) => (v < a ? a : (v > b ? b : v));

/* A rotation about world +Y by `a`, applied to a vector: the shell's
 * qSpawn, which is setFromAxisAngle(AXIS_Y, startYaw). */
function rotY(v, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return V(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

/* Rotate a vector by a quaternion given as (w, x, y, z). */
function qRot(q, v) {
  const [w, x, y, z] = q;
  const ux = 2 * (y * v.z - z * v.y);
  const uy = 2 * (z * v.x - x * v.z);
  const uz = 2 * (x * v.y - y * v.x);
  return V(
    v.x + w * ux + (y * uz - z * uy),
    v.y + w * uy + (z * ux - x * uz),
    v.z + w * uz + (x * uy - y * ux),
  );
}

/* qa * qb, both (w, x, y, z). */
function qMul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

const scratch = () => ({
  x: 0,
  y: 0,
  z: 0,
  set(a, b, c) {
    this.x = a;
    this.y = b;
    this.z = c;
  },
});

/* ---------------------------------------------------------------- *
 * Paths. The same four shapes park-fly flies, restated here so a case
 * can be written once and flown by either rig.
 * ---------------------------------------------------------------- */
export function circlePath(c, e1, e2, r, secs, ph0, turns) {
  const w = (TURN * (turns >= 0 ? 1 : -1)) / secs;
  const total = Math.abs(turns) * secs;
  const fn = (t) => {
    const tt = t > total ? total : t;
    const ph = ph0 + w * tt;
    const cs = Math.cos(ph);
    const sn = Math.sin(ph);
    const done = t >= total;
    return {
      p: add(c, add(mul(e1, r * cs), mul(e2, r * sn))),
      v: done ? V(0, 0, 0) : mul(add(mul(e1, -sn), mul(e2, cs)), r * w),
      a: done ? V(0, 0, 0) : mul(add(mul(e1, cs), mul(e2, sn)), -r * w * w),
      done,
    };
  };
  fn.total = total;
  return fn;
}

export function linePath(a, b, secs) {
  const d = sub(b, a);
  const fn = (t) => {
    const tt = cl(t / secs, 0, 1);
    const s = 0.5 - 0.5 * Math.cos(Math.PI * tt);
    const ds = (Math.PI / (2 * secs)) * Math.sin(Math.PI * tt);
    const dds = ((Math.PI * Math.PI) / (2 * secs * secs)) * Math.cos(Math.PI * tt);
    return { p: add(a, mul(d, s)), v: mul(d, ds), a: mul(d, dds), done: t >= secs };
  };
  fn.total = secs;
  return fn;
}

/* Starts at rest and ARRIVES at vEnd, which is what an approach is. */
export function rampPath(a, b, secs, vEnd) {
  const d = sub(b, a);
  const D = len(d) || 1;
  const g1 = cl((vEnd * secs) / D, 0.2, 2.6);
  const c2 = 3 - g1;
  const c3 = g1 - 2;
  const fn = (t) => {
    const u = cl(t / secs, 0, 1);
    const sv = c2 * u * u + c3 * u * u * u;
    const dv = (2 * c2 * u + 3 * c3 * u * u) / secs;
    const av = (2 * c2 + 6 * c3 * u) / (secs * secs);
    return { p: add(a, mul(d, sv)), v: mul(d, dv), a: mul(d, av), done: t >= secs };
  };
  fn.total = secs;
  return fn;
}

/* Add a fall, which is the only way a quad flies a lap belly up. */
export function dropPath(path, g2) {
  const fn = (t) => {
    const d = path(t);
    return {
      p: V(d.p.x, d.p.y - 0.5 * g2 * t * t, d.p.z),
      v: V(d.v.x, d.v.y - g2 * t, d.v.z),
      a: V(d.a.x, d.a.y - g2, d.a.z),
      done: d.done,
    };
  };
  fn.total = path.total;
  return fn;
}

export function seqPath(...parts) {
  const fn = (t) => {
    let acc = 0;
    for (const part of parts) {
      if (t < acc + part.total || part === parts[parts.length - 1]) {
        return part(t - acc);
      }
      acc += part.total;
    }
    return parts[parts.length - 1](0);
  };
  fn.total = parts.reduce((s, p) => s + p.total, 0);
  return fn;
}

/* ---------------------------------------------------------------- *
 * The rig.
 * ---------------------------------------------------------------- */

/*
 * opts:
 *   wasmBytes   dist/sim.wasm
 *   diffText    a Betaflight config diff
 *   spawn       {x, y, z} world metres, the craft's start
 *   spawnYaw    radians. NOT a detail: the shell premultiplies every pose
 *               by it and the freestyle city spawns at pi, which is how a
 *               contact normal came to reach the plant reversed. A rig that
 *               always spawned at zero could never see that class of bug, so
 *               cases are flown at more than one yaw on purpose.
 *   colliders   a built Colliders, or null for empty sky
 *   field       an ObstacleField for the recogniser, or null
 *   groundY     world height of the flat ground plane
 *   cell        battery cell voltage
 */
export async function makeRig(opts) {
  const {
    wasmBytes, diffText, colliders = null, field = null,
    spawn = V(0, 0, 0), spawnYaw = 0, groundY = 0, cell = 4.0,
  } = opts;

  const sim = await loadSim(wasmBytes);
  if (sim.init(diffText) !== SIM_OK) {
    throw new Error('flightrig: sim_init failed');
  }
  sim.reset();
  if (cell) {
    sim.setCellVoltage(cell);
  }

  const tricks = [];
  const det = new TrickDetector((t) => tricks.push(t), field);
  /* The world, as the recogniser asks about it: one distance query. See
   * TrickDetector.solids. */
  if (colliders) {
    det.solids = {
      gapAt: (x, y, z, r) => colliders.gapAt(x, y, z, r),
    };
  }

  /* ---- the frame seam, exactly as the shell draws it ---- */
  const sc = scratch();
  const qSpawn = [Math.cos(spawnYaw / 2), 0, Math.sin(spawnYaw / 2), 0];

  function poseToWorld(st) {
    simPosToThree(st[1], st[2], st[3] + SPAWN_ALT, sc);
    const r = rotY(V(sc.x, sc.y, sc.z), spawnYaw);
    return V(r.x + spawn.x, r.y + spawn.y, r.z + spawn.z);
  }
  function worldPosToSim(w) {
    const p = rotY(sub(w, spawn), -spawnYaw);
    const o = threePosToSim(p.x, p.y, p.z, scratch());
    o.z -= SPAWN_ALT;
    return o;
  }
  /* The fix this rig exists partly to guard: a DIRECTION carries the spawn
   * rotation, and threeDirToSim is a permutation that cannot supply it. */
  function worldDirToSim(d) {
    const u = rotY(d, -spawnYaw);
    return threeDirToSim(u.x, u.y, u.z, scratch());
  }
  /* simQuatToThree writes (-y, z, -x, w) as (x, y, z, w); the rig keeps
   * quaternions as (w, x, y, z), so the components are reordered here. */
  function attitudeWorld(st) {
    const q = [st[7], -st[9], st[10], -st[8]];
    return qMul(qSpawn, q);
  }
  function velWorld(st) {
    simPosToThree(st[4], st[5], st[6], sc);
    return rotY(V(sc.x, sc.y, sc.z), spawnYaw);
  }

  /* ---- state ---- */
  let stepIdx = 0;
  let rcNext = 0;
  let sticks = [0, 0, 0, 0];
  let st = sim.readState().state;
  let obsPhase = 0;
  let obsPrev = null;
  const track = [];
  let touchedThisPass = false;
  let closingThisPass = 0;
  let lastTapSimMs = -1e9;
  const stats = {
    contacts: 0, resolved: 0, resting: 0, inbound: 0, outbound: 0, buried: 0,
  };

  function craft() {
    const p = poseToWorld(st);
    const q = attitudeWorld(st);
    return {
      p,
      v: velWorld(st),
      up: qRot(q, V(0, 1, 0)),
      fwd: qRot(q, V(0, 0, -1)),
      rates: { p: st[11], q: st[12], r: st[13] },
      upZ: 1 - 2 * (st[8] * st[8] + st[9] * st[9]),
      simMs: stepIdx,
    };
  }

  /*
   * THE GROUND, raised every step, as the shell does. Flat here, so the
   * normal is straight up and the spawn rotation is the identity on it;
   * it still goes through worldDirToSim so the rig cannot quietly diverge
   * from the shell on the one conversion this all turns on.
   */
  function raiseGround() {
    const w = poseToWorld(st);
    const p = worldPosToSim(V(w.x, groundY, w.z));
    const n = worldDirToSim(V(0, 1, 0));
    sim.e.sim_set_ground(1, n.x, n.y, n.z, p.x, p.y, p.z, GROUND_MU, GROUND_E);
  }

  /*
   * THE SOLID WORLD, on the sim clock, every OBSTACLE_STEP milliseconds.
   *
   * A port of obstacleContactPass in src/main.js, cut down to what a rig
   * needs: the sweep, the placement on the free side, the impulse at the
   * four-disc patch, and the slide. It keeps the two things the shell's
   * version turns on, because they are the two the wall tap needed: the
   * normal and the arm go through worldDirToSim, and a contact the plant
   * declines carries its slide instead of ending the pass.
   */
  function contactPass() {
    if (!colliders || !obsPrev) {
      obsPrev = poseToWorld(st);
      return;
    }
    const to = poseToWorld(st);
    const from = obsPrev;
    obsPrev = to;
    const q = attitudeWorld(st);
    const up = qRot(q, V(0, 1, 0));
    const vh = craftVerticalHalf(Math.sqrt(Math.max(0, 1 - up.y * up.y)));
    /* collide.js and contactPatch both want the WORLD attitude as three.js
     * orders it, (x, y, z, w), which is the shell's qObs: the plant
     * quaternion through simQuatToThree and then premultiplied by qSpawn. */
    const qw = qMul(qSpawn, [st[7], -st[9], st[10], -st[8]]);
    const aqx = qw[1];
    const aqy = qw[2];
    const aqz = qw[3];
    const aqw = qw[0];

    let a = from;
    let b = to;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const k = colliders.hit(a.x, a.y, a.z, b.x, b.y, b.z, vh, aqx, aqy, aqz, aqw);
      if (k < 0) {
        if (attempt > 0 && (b.x !== a.x || b.y !== a.y || b.z !== a.z)) {
          const ps = worldPosToSim(b);
          if (sim.e.sim_set_pose(ps.x, ps.y, ps.z, st[7], st[8], st[9], st[10]) === SIM_OK) {
            st = sim.readState().state;
          }
        }
        break;
      }
      stats.contacts += 1;
      touchedThisPass = true;
      const nx = colliders.hitNx;
      const ny = colliders.hitNy;
      const nz = colliders.hitNz;
      const speed = Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]);
      const closing = speed * colliders.hitNormalDot;
      if (closing > closingThisPass) {
        closingThisPass = closing;
      }
      const ht = cl(colliders.hitT, 0, 1);
      const c = V(
        a.x + (b.x - a.x) * ht, a.y + (b.y - a.y) * ht, a.z + (b.z - a.z) * ht,
      );
      const depth = Math.max(colliders.hitPen, colliders.hitOverlap);
      const sep = (colliders.hitT <= 1e-6 && depth > 0)
        ? depth + BOUNCE_SEPARATION
        : BOUNCE_SEPARATION;

      if (colliders.hitT <= 1e-6 && colliders.hitPen > 0.05) {
        stats.buried += 1;
        const place = V(c.x + nx * sep, c.y + ny * sep, c.z + nz * sep);
        const ps = worldPosToSim(place);
        if (sim.e.sim_set_pose(ps.x, ps.y, ps.z, st[7], st[8], st[9], st[10]) !== SIM_OK) {
          break;
        }
        st = sim.readState().state;
        a = poseToWorld(st);
        b = a;
        continue;
      }

      const mat = contactMaterial(colliders.kindName(k));
      /* Leftover travel with the into-face part removed: the slide. */
      let rx = (b.x - a.x) * (1 - ht);
      let ry = (b.y - a.y) * (1 - ht);
      let rz = (b.z - a.z) * (1 - ht);
      const dn = rx * nx + ry * ny + rz * nz;
      if (dn < 0) {
        rx -= nx * dn;
        ry -= ny * dn;
        rz -= nz * dn;
      }

      const place = V(c.x + nx * sep, c.y + ny * sep, c.z + nz * sep);
      const ps = worldPosToSim(place);
      const nS = worldDirToSim(V(nx, ny, nz));
      const nl = Math.sqrt(nS.x * nS.x + nS.y * nS.y + nS.z * nS.z);
      if (!(nl > 1e-9)) {
        break;
      }
      const patch = contactPatch(nx, ny, nz, aqx, aqy, aqz, aqw, { x: 0, y: 0, z: 0 });
      const rS = worldDirToSim(V(patch.x, patch.y, patch.z));
      const vn = (nS.x * st[4] + nS.y * st[5] + nS.z * st[6]) / nl;
      if (vn > 0.05) {
        stats.outbound += 1;
      } else if (vn < -0.05) {
        stats.inbound += 1;
      }
      const v0 = [st[4], st[5], st[6]];
      const code = sim.e.sim_contact_at(
        nS.x / nl, nS.y / nl, nS.z / nl, mat.e, mat.mu,
        ps.x, ps.y, ps.z, 0, 0, 0, rS.x, rS.y, rS.z,
      );
      if (code !== SIM_OK) {
        break;
      }
      st = sim.readState().state;
      const dv = Math.sqrt(
        (st[4] - v0[0]) ** 2 + (st[5] - v0[1]) ** 2 + (st[6] - v0[2]) ** 2,
      );
      a = poseToWorld(st);
      if (dv <= 0) {
        stats.resting += 1;
        if (rx * rx + ry * ry + rz * rz <= 1e-12) {
          b = a;
          break;
        }
        b = V(a.x + rx, a.y + ry, a.z + rz);
        continue;
      }
      stats.resolved += 1;
      b = V(a.x + rx, a.y + ry, a.z + rz);
    }
    obsPrev = poseToWorld(st);
  }

  /* One millisecond: sticks on the RC grid, the ground, one plant step, the
   * detector, and the contact pass on its own cadence. */
  function stepOne() {
    const t = stepIdx / 1000;
    if (t >= rcNext) {
      sim.input(t, sticks[0], sticks[1], sticks[2], sticks[3]);
      rcNext += RC_PERIOD;
    }
    raiseGround();
    sim.step(1);
    stepIdx += 1;
    st = sim.readState().state;

    const c = craft();
    track.push([c.p.x, c.p.y, c.p.z]);
    det.step(
      0.001, st[11], st[12], st[13], st[8], st[9],
      Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]),
      c.p.x, c.p.y, c.p.z,
      c.fwd.x, c.fwd.y, c.fwd.z,
      c.up.x, c.up.y, c.up.z,
    );
    if (colliders) {
      /* The recogniser's distance question, once every contact pass rather
       * than every millisecond: the shell asks it once a frame for the same
       * reason, which is that "was the craft near something" does not change
       * that fast and a broadphase query per step is sixty times the work. */
      if (obsPhase === 0) {
        det.near(colliders.gapAt(c.p.x, c.p.y, c.p.z, 2.0));
      }
    }

    obsPhase += 1;
    if (obsPhase >= OBSTACLE_STEP) {
      obsPhase = 0;
      touchedThisPass = false;
      closingThisPass = 0;
      contactPass();
      if (touchedThisPass && stepIdx - lastTapSimMs >= BOUNCE_COOLDOWN_MS) {
        lastTapSimMs = stepIdx;
        det.bump(closingThisPass);
      }
    }
  }

  function stick(r, p, y, thr) {
    sticks = [cl(r, -1, 1), cl(p, -1, 1), cl(y, -1, 1), cl(thr, 0, 1)];
  }

  function hold(ms, r = 0, p = 0, y = 0, thr = 0.5) {
    stick(r, p, y, thr);
    for (let i = 0; i < ms; i += 1) {
      stepOne();
    }
  }

  /*
   * Hold a stick until a predicate says stop, or until msMax. `acc`
   * integrates the body rates so "a quarter turn" is a measurement and not
   * a stopwatch, which is the whole reason park-fly grew __quarter.
   */
  function stickUntil(sticksOf, msMax, done) {
    const acc = { p: 0, q: 0, r: 0 };
    for (let i = 0; i < msMax; i += 1) {
      const c = craft();
      const s = typeof sticksOf === 'function' ? sticksOf(c, i, acc) : sticksOf;
      stick(s[0], s[1], s[2], s[3]);
      stepOne();
      acc.p += st[11] * 0.001;
      acc.q += st[12] * 0.001;
      acc.r += st[13] * 0.001;
      if (done && done(craft(), i, acc)) {
        break;
      }
    }
    return acc;
  }

  /*
   * A QUARTER TURN THAT STOPS AT A QUARTER, ported from park-fly's own
   * __quarter for the same reason it exists there: the stick is a RATE, so
   * releasing it leaves the craft still turning, and a quarter held to a
   * quarter arrives at a third. Two of those in a row came out a Double
   * Flip, which is a different trick at a different price. So the turn is
   * flown to most of the way and then BRAKED with opposite stick.
   */
  function quarter(sign, turns = 0.25) {
    const acc = stickUntil(
      [0, sign * 0.55, 0, 0.58], 900,
      (c, i, a) => Math.abs(a.q) >= TURN * turns * 0.62,
    );
    stickUntil([0, -sign * 0.5, 0, 0.6], 500, (c) => Math.abs(c.rates.q) < 1.2);
    hold(120, 0, 0, 0, 0.58);
    return acc.q;
  }

  /*
   * THE PILOT. A port of park-fly's geometric guidance law, gains and all,
   * flown on the SIM clock rather than on requestAnimationFrame, which is
   * the reason this rig repeats and that one does not: there, dt was
   * whatever the browser gave it, so the same case flew a different line
   * every run.
   */
  function fly(path, o = {}) {
    const kp = o.kp ?? 3.5;
    const kd = o.kd ?? 4.5;
    const ka = o.ka ?? 7.0;
    const maxRate = o.maxRate ?? 12;
    const dr = o.dr ?? 0.14;
    const hover = o.hover ?? 0.345;
    const yMax = o.yawMax ?? 0.3;
    const ky = o.ky ?? 0.35;
    const extra = o.extraMs ?? 0;
    const totalMs = Math.round(path.total * 1000) + extra;
    let integ = 0;
    let worst = 0;
    for (let i = 0; i < totalMs; i += 1) {
      const c = craft();
      const t = i / 1000;
      const d = path(t);
      const ep = sub(d.p, c.p);
      const ev = sub(d.v, c.v);
      const e = len(ep);
      if (e > worst) {
        worst = e;
      }
      const aCmd = add(d.a, add(mul(ep, kp), mul(ev, kd)));
      const f = V(aCmd.x, aCmd.y + G, aCmd.z);
      const fWant = o.invert ? mul(f, -1) : f;
      const b3 = c.up;
      const fwd = norm(c.fwd);
      const right = norm(cross(fwd, b3));
      const err = cross(b3, norm(fWant));
      const angRoll = Math.asin(cl(dot(err, fwd), -1, 1));
      const angPitch = Math.asin(cl(dot(err, right), -1, 1));
      const roll = cl((ka * angRoll - dr * c.rates.p) / maxRate, -1, 1);
      const pitch = cl((ka * angPitch + dr * c.rates.q) / maxRate, -1, 1);
      let yaw = o.yawRate ?? 0;
      const yawInverted = o.invertOk || o.invert;
      if (o.heading != null && Math.abs(fwd.y) < 0.86 && (yawInverted || b3.y > 0.15)) {
        const want = typeof o.heading === 'function' ? o.heading(t, c) : o.heading;
        const h = Math.atan2(fwd.x, fwd.z);
        let he = want - h;
        while (he > Math.PI) { he -= Math.PI * 2; }
        while (he < -Math.PI) { he += Math.PI * 2; }
        const flip = b3.y < 0 ? -1 : 1;
        yaw += cl(-he * flip * ky, -yMax, yMax);
      }
      yaw = cl(yaw, -1, 1);
      const along = o.invert ? -dot(f, b3) : dot(f, b3);
      if (e < 2.5) {
        integ = cl(integ + dot(ev, b3) * 0.001 * 0.28, -0.2, 0.25);
      } else {
        integ *= (1 - Math.min(1, 0.002));
      }
      const thr = cl(hover * Math.sqrt(Math.max(0.02, along) / G) + integ, 0.02, 1);
      stick(roll, pitch, yaw, thr);
      stepOne();
      if (o.watch) {
        o.watch(craft(), i);
      }
    }
    return { worstErr: worst };
  }

  /* Settle at a point, facing a heading, so a case starts from flight and
   * not from a hover: a rotation out of a dead hover is a Stall Rewind and
   * the catalogue is right to name it one. */
  function settle(p, heading, secs = 1.6) {
    fly(linePath(craft().p, p, secs), { heading });
    fly(linePath(p, p, 0.5), { heading });
  }

  function done(tailMs = 900) {
    hold(tailMs, 0, 0, 0, 0.5);
    det.flush(craft().upZ);
    return tricks;
  }

  return {
    sim,
    det,
    stick,
    hold,
    stickUntil,
    quarter,
    fly,
    settle,
    done,
    craft,
    tricks,
    track,
    stats,
    state: () => st,
    simMs: () => stepIdx,
    names: () => tricks.map((t) => t.name).join(' + '),
    graded: () => tricks.map((t) => `${t.name}:${t.execution}`).join(' + '),
  };
}

/* A flat world with a handful of solids in it, built the way a map builds
 * one. Returns { colliders, field } with the obstacle field derived by the
 * same src/game/obstacles.js the shell uses. */
export function buildWorld(parts, deriveObstacles, groundY = 0) {
  const c = new Colliders();
  for (const part of parts) {
    if (part.kind === 'box') {
      c.addBox(part.material ?? 'wall', part.x0, part.y0, part.z0, part.x1, part.y1, part.z1);
    } else if (part.kind === 'capsule') {
      c.add(
        part.material ?? 'obstacle',
        part.ax, part.ay, part.az, part.bx, part.by, part.bz, part.r,
      );
    }
  }
  c.build();
  const field = deriveObstacles ? deriveObstacles(c, () => groundY) : null;
  return { colliders: c, field };
}

export { GRAZE_SPEED_MAX };
