/*
 * park-fly.js: FLY THE TRAINING PARK, on the real aircraft, and see what
 * the recogniser makes of it.
 *
 * Copyright (C) 2026 Mathew Harvey
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General
 * Public License for more details. You should have received a copy of the
 * GNU General Public License along with this program. If not, see
 * <https://www.gnu.org/licenses/>.
 *
 *
 * WHY THIS EXISTS
 *
 * Every trick in this repository used to be checked against a CONSTRUCTED
 * flight: a circle drawn by arithmetic, a constant turn rate, a nose
 * pointed by assignment, handed straight to the recogniser. Nothing in
 * those traces has ever been through Betaflight, a motor, a propeller or
 * gravity, and a recogniser tuned against them is tuned against a robot
 * that does not exist. The owner's report, twice, was that the tricks did
 * not fire in the air.
 *
 * This flies them. A guidance law tracks a target path; the plant answers
 * however it answers; and whatever comes out the other side is what a
 * pilot would actually hand the recogniser.
 *
 *
 * HOW THE PILOT WORKS
 *
 * A quadcopter can only push along its own up axis, so making it go
 * somewhere is two problems: decide what acceleration is wanted, then point
 * the aircraft so its thrust supplies it.
 *
 *   a_cmd = a_path + Kp (p_path - p) + Kd (v_path - v)
 *   f_des = a_cmd + g          thrust must carry the weight as well
 *   b3    = where the craft's up points now
 *   err   = b3 x normalise(f_des)      the rotation that fixes it
 *
 * err is a world space axis. Its component along the nose is a ROLL and its
 * component along the right wing is a PITCH, which is the whole attitude
 * controller. Throttle is the part of f_des that lies along b3, so a craft
 * still rotating into place does not punch sideways on the way.
 *
 * The elegant part, and the reason one controller flies the whole park: the
 * loop is a circle whatever the nose is doing, so WHERE THE NOSE POINTS
 * decides which body axis goes round. Nose across the rail and the aircraft
 * pitches through the loop, which is a Powerloop. Nose along the rail and
 * the same circle is flown on roll, which is a Maverick Loop. The pattern
 * table asks for exactly that distinction and this rig produces it by
 * turning the aircraft, the way a pilot does.
 */

import { openPage } from '../tests/lib/page.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * The park, in world metres, read off src/maps/city/places/training.js and
 * confirmed against window.__obstacleField() on a loaded map. The obstacle
 * the recogniser sees is listed beside each, because a trick that needs a
 * lap needs the recogniser to HAVE the thing as a bar or a pole.
 */
const PARK = {
  /* Two loop arches. The head rail runs along z, so a loop around it is
   * flown in the x/y plane and entered along x. */
  arch: { x: 24.0, y: 6.3, z: 139.0, axis: 'z', span: 4.05 },
  arch2: { x: 40.0, y: 6.3, z: 139.0, axis: 'z', span: 4.05 },
  /* The wall, its face and the height its target sits at. */
  wall: {
    x: 56.0, faceZ: 152.325, target: 3.2, x0: 50.0, x1: 62.0,
  },
  /* The Split-S station: a high bar to come over and a gate to come out of. */
  splitBar: { x: 24.0, y: 12.6, z: 168.0, axis: 'z', span: 4.0 },
  splitGate: { x: 24.0, y: 3.2, z: 168.0, axis: 'z', span: 1.69 },
  /* The jump rope rail, running along x, so its loop is flown in y/z.
   * y is the obstacle's own centre, read back off the field, not the
   * rail height in training.js: the collider is fatter than the paint. */
  jump: { x: 81.0, y: 3.2, z: 125.0, axis: 'x', span: 15.0 },
  /*
   * A post to go round. NOT the mast: the 34 m tower reaches the obstacle
   * field only as a 3 m stub centred at y 36.2, so everything a pilot can
   * reach is invisible to the recogniser. See PROGRESS. This is the
   * Split-S station's near post, which spans y 0.7 to 12.9 and is the
   * tallest thing in the park a lap can actually be flown around.
   */
  post: { x: 24.0, y: 6.8, z: 164.0 },
};

/* ------------------------------------------------------------------ *
 * The in-page pilot. Injected as one string because it has to live in
 * the tab with the aircraft.
 * ------------------------------------------------------------------ */
const PILOT = `
const V = (x, y, z) => ({ x, y, z });
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => V(
  a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x,
);
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => { const l = len(a) || 1; return mul(a, 1 / l); };
const cl = (v, a, b) => (v < a ? a : (v > b ? b : v));
const G = 9.81;
/* Each manoeuvre is evaluated in its own scope, so the vector helpers have
 * to be reachable from outside this one. See PRELUDE. */
window.__vm = { V, add, sub, mul, dot, cross, len, norm, cl };

/* The two unit vectors spanning the plane a lap is flown in, given which
 * way the rail runs. A lap about a rail along z is flown in x and y. */
window.__basis = (axis) => (axis === 'z'
  ? [V(1, 0, 0), V(0, 1, 0)]
  : (axis === 'x' ? [V(0, 0, 1), V(0, 1, 0)] : [V(1, 0, 0), V(0, 0, 1)]));

/*
 * A circular path. c is the centre, (e1, e2) the plane, r the radius, secs
 * how long one whole turn takes, ph0 where on the circle it starts, and
 * turns how far round to go. Returns position, velocity and acceleration,
 * because a tracker that is only given position always lags.
 */
window.__circle = (c, e1, e2, r, secs, ph0, turns) => {
  const w = (Math.PI * 2) * (turns >= 0 ? 1 : -1) / secs;
  const total = Math.abs(turns) * secs;
  const fn = (t) => {
    const tt = t > total ? total : t;
    const ph = ph0 + w * tt;
    const cs = Math.cos(ph); const sn = Math.sin(ph);
    const done = t >= total;
    return {
      p: add(c, add(mul(e1, r * cs), mul(e2, r * sn))),
      v: done ? V(0, 0, 0) : mul(add(mul(e1, -sn), mul(e2, cs)), r * w),
      a: done ? V(0, 0, 0) : mul(add(mul(e1, cs), mul(e2, sn)), -r * w * w),
      done,
    };
  };
  fn.total = total;
  fn.at = (t) => fn(t).p;
  return fn;
};

/* A straight run from a to b taking secs, with a cosine ease so the tracker
 * is never asked for a step change in velocity. */
window.__line = (a, b, secs) => {
  const d = sub(b, a);
  const fn = (t) => {
    const tt = cl(t / secs, 0, 1);
    const s = 0.5 - 0.5 * Math.cos(Math.PI * tt);
    const ds = (Math.PI / (2 * secs)) * Math.sin(Math.PI * tt);
    const dds = (Math.PI * Math.PI / (2 * secs * secs)) * Math.cos(Math.PI * tt);
    return { p: add(a, mul(d, s)), v: mul(d, ds), a: mul(d, dds), done: t >= secs };
  };
  fn.total = secs;
  return fn;
};

/*
 * A RUN IN THAT ARRIVES AT SPEED.
 *
 * __line eases to a stop at both ends, which is right for going somewhere
 * and wrong for entering a loop: the tracker was handed a path that stopped
 * dead and then a circle that wanted nine metres a second on its first
 * millisecond, so every lap began eleven metres behind itself and the
 * attitude loop spent the entry saturated. This one starts at rest and
 * ARRIVES at vEnd, which is what an approach actually is.
 *
 * s(u) = a u^2 + b u^3 with s(1) = 1 and s'(1) chosen to match the wanted
 * arrival speed. s'(0) = 0 falls out, so it leaves the hover smoothly.
 */
window.__ramp = (a, b, secs, vEnd) => {
  const d = sub(b, a);
  const D = len(d) || 1;
  const G1 = cl((vEnd * secs) / D, 0.2, 2.6);
  const c2 = 3 - G1;
  const c3 = G1 - 2;
  const fn = (t) => {
    const u = cl(t / secs, 0, 1);
    const sv = c2 * u * u + c3 * u * u * u;
    const dv = (2 * c2 * u + 3 * c3 * u * u) / secs;
    const av = (2 * c2 + 6 * c3 * u) / (secs * secs);
    return { p: add(a, mul(d, sv)), v: mul(d, dv), a: mul(d, av), done: t >= secs };
  };
  fn.total = secs;
  return fn;
};

/*
 * ADD A FALL TO A PATH.
 *
 * A craft is inverted when its thrust points DOWNWARD, and thrust points
 * downward only when the wanted force does, which needs a downward
 * acceleration greater than gravity. That is the whole physics of an
 * inverted orbit and it is expensive: at 1.3 g, two laps of a post cost
 * about eighty metres of altitude, and the training park is thirty four
 * metres tall. One lap in under two seconds fits; two do not, and no amount
 * of tuning will make them.
 */
window.__drop = (path, g2) => {
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
};

/*
 * FLY ON FROM WHERE THE CRAFT ACTUALLY IS.
 *
 * An exit written as a line between two constants starts wherever the
 * manoeuvre was SUPPOSED to end, and the tracker then hauls the craft to
 * that point: a jump the recogniser reads as rotation, which is where the
 * spurious Invert Rewinds and Snapbacks after every trick came from. The
 * exit is part of the flight and has to begin at the aircraft.
 */
window.__on = (dir, metres, secs) => {
  const c = window.__craftState();
  const here = V(c.worldX, c.worldY, c.worldZ);
  return window.__line(here, add(here, mul(norm(dir), metres)), secs);
};

/* Hold a point. */
window.__hold3 = (p, secs) => {
  const fn = () => ({ p, v: V(0, 0, 0), a: V(0, 0, 0), done: false });
  fn.total = secs;
  return fn;
};

/* Join paths end to end. */
window.__seq = (...parts) => {
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
};

/*
 * Fly a path. opts:
 *   heading  world radians the nose should hold, or a function of t. Only
 *            enforced while the nose is within sixty degrees of level,
 *            because atan2 of a vertical nose is noise and a loop puts the
 *            nose straight up twice.
 *   yawRate  stick units added on top, for the tricks that spin as they go.
 *   extraMs  keep flying the last point for this long after the path ends.
 */
window.__fly = (path, opts = {}) => new Promise((res) => {
  const t0 = performance.now();
  let last = t0; let I = 0;
  const trail = [];
  let worstErr = 0;
  const tick = () => {
    const c = window.__craftState();
    const now = performance.now();
    const dt = Math.max(0.002, Math.min(0.05, (now - last) / 1000));
    last = now;
    const t = (now - t0) / 1000;
    if (!c || !c.up || !c.vel) { requestAnimationFrame(tick); return; }
    const d = path(t);
    const p = V(c.worldX, c.worldY, c.worldZ);
    const ep = sub(d.p, p);
    const ev = sub(d.v, c.vel);
    const e = len(ep);
    if (e > worstErr) { worstErr = e; }
    const KP = opts.kp ?? 3.5;
    const KD = opts.kd ?? 4.5;
    const aCmd = add(d.a, add(mul(ep, KP), mul(ev, KD)));
    const f = V(aCmd.x, aCmd.y + G, aCmd.z);
    /*
     * Belly up. The guidance law aims the THRUST axis at the wanted force,
     * so asking for the opposite aims the craft's back at it and the same
     * path is flown inverted. Throttle then has to be negated too, which is
     * what "keeping it pinned" on the stick actually is.
     */
    const fWant = opts.invert ? mul(f, -1) : f;
    const b3 = V(c.up.x, c.up.y, c.up.z);
    const fwd = norm(V(c.fwd.x, c.fwd.y, c.fwd.z));
    const right = norm(cross(fwd, b3));
    const err = cross(b3, norm(fWant));
    /*
     * ATTITUDE, IN REAL UNITS.
     *
     * err is the sine of the angle between where thrust points and where it
     * should, so asin makes it an angle and KA turns an angle into a RATE:
     * a quarter turn out of place asks for about eleven radians a second.
     * The stick is then that rate over the rate full deflection buys.
     *
     * The first version multiplied the sine by 6.5 straight into the stick,
     * which asks for FULL DEFLECTION at nine degrees of error. Full stick is
     * the better part of eight hundred degrees a second, so the craft blew
     * through level and kept going: measured, 220 ms into a straight line it
     * was already upside down at up.y -0.13, and the tracker was eighteen
     * metres from a path it had been given three seconds to fly.
     *
     * The rate terms are damping. Roll stick and body p share a sign and
     * pitch stick and body q do not, which is measured, not assumed.
     */
    const KA = opts.ka ?? 7.0;
    const MAXR = opts.maxRate ?? 12;
    const DR = opts.dr ?? 0.14;
    const rates = c.rates || { p: 0, q: 0, r: 0 };
    const angRoll = Math.asin(cl(dot(err, fwd), -1, 1));
    const angPitch = Math.asin(cl(dot(err, right), -1, 1));
    const roll = cl((KA * angRoll - DR * rates.p) / MAXR, -1, 1);
    const pitch = cl((KA * angPitch + DR * rates.q) / MAXR, -1, 1);
    /* Heading, only where atan2 of the nose means anything. */
    let yaw = 0;
    if (opts.yawRate) { yaw += opts.yawRate; }
    /*
     * HEADING CONTROL IS FOR A CRAFT THE RIGHT WAY UP.
     *
     * Where the nose points is meaningless to a craft mid loop, and the
     * inverted sign flip below turns a small heading error into a yaw
     * command pointing the other way. Through the inverted half of a
     * Powerloop that injected a whole turn of yaw the manoeuvre never asked
     * for, and the lap came out a Donkey Loop, which is a Powerloop with a
     * 360 of yaw in it. An orbit flown belly up genuinely does want the
     * nose held, and says so.
     */
    const yawInverted = opts.invertOk || opts.invert;
    if (opts.heading != null && Math.abs(fwd.y) < 0.86
      && (yawInverted || b3.y > 0.15)) {
      const want = typeof opts.heading === 'function' ? opts.heading(t, c) : opts.heading;
      const h = Math.atan2(fwd.x, fwd.z);
      let he = want - h;
      while (he > Math.PI) { he -= Math.PI * 2; }
      while (he < -Math.PI) { he += Math.PI * 2; }
      /*
       * GENTLY. Yaw is not how this rig gets anywhere: it only decides
       * which body axis a lap is flown on and where the nose looks. Full
       * yaw is twelve radians a second, so the first version's gain of 1.1
       * asked for six of them for a thirty degree error, and yawing that
       * hard while tilted sweeps the very axes the attitude loop is
       * resolving its own error onto. Measured, it thrashed: roll, pitch
       * and yaw sticks all large at once with the craft level and climbing.
       */
      const yMax = opts.yawMax ?? 0.3;
      /*
       * UPSIDE DOWN, YAW GOES THE OTHER WAY. The stick turns the craft
       * about its OWN up axis, and when that axis points at the ground the
       * world heading turns the opposite way. Without the sign the heading
       * loop drives itself: measured on an inverted lap, 5.86 turns of yaw
       * in under two seconds, and a trick that came out as eighteen
       * consecutive Yaw Spins.
       */
      const flip = b3.y < 0 ? -1 : 1;
      yaw += cl(-he * flip * (opts.ky ?? 0.35), -yMax, yMax);
    }
    yaw = cl(yaw, -1, 1);
    /* Throttle: the part of the wanted force that lies along the thrust
     * axis, mapped through a square law, with an integrator taking up
     * whatever the real hover number turns out to be. */
    const along = opts.invert ? -dot(f, b3) : dot(f, b3);
    /* Anti windup: an integrator is for trimming a steady error, not for
     * arguing with a transient. While the craft is more than a couple of
     * metres off the path the proportional term owns the problem. */
    if (e < 2.5) {
      I = cl(I + dot(ev, b3) * dt * 0.28, -0.2, 0.25);
    } else {
      I *= (1 - Math.min(1, dt * 2));
    }
    const hov = opts.hover ?? 0.345;
    const thr = cl(hov * Math.sqrt(Math.max(0.02, along) / G) + I, 0.02, 1);
    window.__stick(roll, pitch, yaw, thr);
    if (opts.watch) { opts.watch(c); }
    trail.push({
      ms: Math.round(t * 1000),
      at: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)],
      want: [+d.p.x.toFixed(1), +d.p.y.toFixed(1), +d.p.z.toFixed(1)],
      v: [+c.vel.x.toFixed(1), +c.vel.y.toFixed(1), +c.vel.z.toFixed(1)],
      wv: [+d.v.x.toFixed(1), +d.v.y.toFixed(1), +d.v.z.toFixed(1)],
      st: [+roll.toFixed(2), +pitch.toFixed(2), +yaw.toFixed(2), +thr.toFixed(2)],
      upY: +b3.y.toFixed(2), e: +e.toFixed(1),
    });
    const over = t >= path.total + (opts.extraMs ?? 0) / 1000;
    if (over || (opts.until && opts.until(c, t))) {
      res({ c, trail, worstErr: +worstErr.toFixed(2), ms: Math.round(now - t0) });
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

/* Put the craft somewhere and let the tracker settle on it before the
 * manoeuvre is asked for, so a run never starts mid lurch. */
window.__settle = async (p, heading, secs = 1.6) => {
  window.__placeCraft(p.x, p.y, p.z);
  await new Promise((r) => setTimeout(r, 260));
  return window.__fly(window.__hold3(p, secs), { heading });
};

/* Arm the recogniser tap so a run can be read as laps and primitives, not
 * only as a name. */
window.__armProbe = () => {
  const d = window.__trickDetector();
  /*
   * A CLEAN RECOGNISER FOR EVERY MANOEUVRE.
   *
   * Arming the probe only reset the PROBE. The detector kept whatever it
   * was holding from the flight before: open laps around obstacles the
   * craft had been teleported away from, buffered primitives waiting to
   * settle, a stall clock. So a manoeuvre's result depended on what had
   * been flown before it, and the same script named a Powerloop on one run
   * and a Donkey Loop on the next with nothing changed between them. That
   * is the flakiness, and most of it was the harness.
   */
  d.restart();
  window.__probe = { laps: [], tricks: [], pend: [], bumps: [] };
  if (!d.__patched) {
    d.__patched = true;
    const cp = d.closePath.bind(d);
    d.closePath = (r, u) => {
      if (r.open && r.obstacle) {
        window.__probe.laps.push({
          raw: +(r.lastWind - r.startWind).toFixed(2),
          ob: r.obstacle.kind === 1 ? 'bar' : 'pole',
          s: r.startSide, e: r.lastSide,
          rot: [0, 1, 2].map((k) => +(r.lastRot[k] - r.startRot[k]).toFixed(2)),
        });
      }
      return cp(r, u);
    };
    const pp = d.pending.push.bind(d.pending);
    d.pending.push = (x) => {
      window.__probe.pend.push(x.kind === 'path'
        ? { k: 'path', ob: x.obstacle, t: x.turns, raw: +x.rawTurns.toFixed(2),
          rot: x.rot.map((v) => +v.toFixed(2)), trk: +x.trackFrac.toFixed(2),
          inv: +x.invertedFrac.toFixed(2), tap: !!x.tapped }
        : { k: x.axis, t: x.turns, dir: x.dir, tap: !!x.tapped,
          near: x.nearest == null ? null : +x.nearest.toFixed(1) });
      return pp(x);
    };
    const bp = d.bump.bind(d);
    d.bump = (i) => {
      window.__probe.bumps.push(i === undefined ? 'ground' : +(+i).toFixed(1));
      return bp(i);
    };
    const sink = d.onTrick;
    d.onTrick = (t) => { window.__probe.tricks.push(t.name + ':' + t.execution); return sink(t); };
  }
  return 1;
};
window.__flush = () => { window.__trickDetector().flush(1); return window.__probe; };
`;

/* Every manoeuvre body is evaluated on its own, so it opens by taking the
 * vector helpers out of the pilot's namespace. */
const PRELUDE = 'const { V, add, sub, mul, dot, cross, len, norm, cl } = window.__vm;';

/* ------------------------------------------------------------------ *
 * The manoeuvres. Each names what it is trying to fly and what the
 * catalogue should call it.
 * ------------------------------------------------------------------ */

/* A lap around a rail. `noseAlong` picks which body axis goes round: across
 * the rail pitches (Powerloop family), along it rolls (Maverick family). */
function lapPlan(ob, opts = {}) {
  const {
    radius = 3.4, secs = 3.0, turns = -1, ph0 = -Math.PI / 2,
    noseAlong = false, yawRate = 0, runUp = 14, after = null, afterTurns = 0.5,
    liftY = 0,
  } = opts;
  return `
    const OB = ${JSON.stringify(ob)};
    const [e1, e2] = window.__basis(OB.axis);
    /*
     * The loop's centre need not be the rail. A rail low enough that a lap
     * around it puts the bottom of the circle in the grass is flown with
     * the centre RAISED, which is what a pilot does at the jump rope: the
     * rail sits at 3.2 m, and a 2.1 m circle on it bottoms out at 1.1 m,
     * which with two metres of tracking error is the ground. The lap still
     * encloses the rail as long as the lift is inside the radius.
     */
    const c = V(OB.x, OB.y + ${liftY}, OB.z);
    const R = ${radius};
    const lap = window.__circle(c, e1, e2, R, ${secs}, ${ph0}, ${turns});
    /*
     * THE RUN IN COMES FROM WHERE THE LAP IS GOING.
     *
     * Placed by hand it was placed on the wrong side: the craft arrived at
     * six metres a second and the circle's first millisecond asked for six
     * the other way, so every lap opened with a twelve metre a second
     * reversal and the tracker never recovered. Taking the entry velocity
     * off the path itself cannot get this wrong whichever way the rail
     * runs or whichever way round the lap goes.
     */
    const d0 = lap(0);
    const vEnt = len(d0.v);
    const dir = norm(d0.v);
    const start = d0.p;
    const from = sub(start, mul(dir, ${runUp}));
    /* Nose across the rail pitches through the loop, nose along it rolls. */
    const along = OB.axis === 'x' ? V(1, 0, 0) : (OB.axis === 'z' ? V(0, 0, 1) : V(0, 1, 0));
    const head = ${noseAlong}
      ? Math.atan2(along.x, along.z)
      : Math.atan2(dir.x, dir.z);
    await window.__settle(from, head, 1.8);
    window.__armProbe();
    await window.__fly(window.__ramp(from, start, ${runUp} * 1.9 / Math.max(2, vEnt), vEnt),
      { heading: head });
    const r = await window.__fly(lap, { heading: head, yawRate: ${yawRate} });
    /* The stick that finishes the trick, where the trick has one: an
     * Immelmann is half a loop and then the roll out of it. */
    if (${JSON.stringify(after)}) {
      const TURN2 = Math.PI * 2;
      const want = TURN2 * ${afterTurns};
      await window.__stickHold(
        ${JSON.stringify(after)} === 'roll' ? [0.9, 0, 0, 0.5] : [0, 0.9, 0, 0.5],
        900,
        (cc, tt, aa) => (${JSON.stringify(after)} === 'roll'
          ? Math.abs(aa.p) >= want : Math.abs(aa.q) >= want),
      );
    }
    /*
     * OUT THE WAY THE LAP ENDED, not the way it began.
     *
     * On a whole lap those are the same and on a HALF lap they are
     * opposite, so flying out along the entry direction curls the craft
     * back round the rail and finishes the circle: a Matty Flip, which is
     * half a lap, was recorded as a whole one at 1.28 turns and named
     * nothing of the kind.
     */
    const outDir = norm(lap(lap.total).v.x === 0 && lap(lap.total).v.y === 0
      ? dir : lap(lap.total * 0.999).v);
    await window.__fly(window.__on(outDir, 11, 1.9), { heading: head });
    window.__stick(0, 0, 0, 0);
    await new Promise((z) => setTimeout(z, 900));
    window.__flush();
    return { worstErr: r.worstErr, probe: window.__probe,
      trail: r.trail.filter((_, i) => i % 4 === 0) };
  `;
}

/*
 * CALIBRATION. Before any trick is believed, the pilot has to be able to
 * fly at all: hold a point, fly a line, fly a flat circle, fly a circle in
 * the vertical plane, which is a loop. Each reports the worst distance from
 * the path it was asked for. A trick flown by a tracker that is ten metres
 * out is not a trick, it is a crash with a name on it.
 */
const TUNE = [
  {
    /* The two numbers the guidance law rests on, measured rather than
     * guessed: what throttle holds a hover, and what rate full stick buys. */
    name: 'tune: plant numbers',
    want: '-',
    tune: 99,
    body: `
      const p = V(24, 12, 130);
      const hoverAt = async (thr) => {
        window.__placeCraft(p.x, p.y, p.z);
        await new Promise((r) => setTimeout(r, 300));
        let y0 = null; let t0 = null; let vy = 0;
        await window.__stickHold([0, 0, 0, thr], 900, (c) => {
          const now = performance.now();
          if (y0 == null) { y0 = c.worldY; t0 = now; } else if (now - t0 > 500) {
            vy = (c.worldY - y0) / ((now - t0) / 1000);
          }
          return false;
        });
        window.__stick(0, 0, 0, 0);
        return vy;
      };
      const probes = [];
      for (const t of [0.30, 0.35, 0.40]) {
        probes.push({ thr: t, vy: +(await hoverAt(t)).toFixed(2) });
      }
      const rateAt = async (axis) => {
        window.__placeCraft(p.x, p.y, p.z);
        await new Promise((r) => setTimeout(r, 300));
        let peak = 0;
        await window.__stickHold(
          [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0, 0.4], 700,
          (c) => {
            if (!c.rates) { return false; }
            const v = Math.abs(axis === 0 ? c.rates.p : (axis === 1 ? c.rates.q : c.rates.r));
            if (v > peak) { peak = v; }
            return false;
          },
        );
        window.__stick(0, 0, 0, 0);
        return +peak.toFixed(1);
      };
      const rr = [await rateAt(0), await rateAt(1), await rateAt(2)];
      return { worstErr: 0, probe: { tricks: [], laps: [], pend: [] },
        tail: { climbRate: probes, fullStickRadPerSec: { roll: rr[0], pitch: rr[1], yaw: rr[2] } } };
    `,
  },
  {
    name: 'tune: hold a point',
    want: '-',
    tune: 0.6,
    body: `
      const p = V(24, 8, 130);
      await window.__settle(p, 0, 1.2);
      const r = await window.__fly(window.__hold3(p, 4), { heading: 0 });
      window.__stick(0, 0, 0, 0);
      return { worstErr: r.worstErr, probe: { tricks: [], laps: [], pend: [] },
        tail: r.trail.slice(-1)[0] };
    `,
  },
  {
    name: 'tune: line 24 m',
    want: '-',
    tune: 1.5,
    body: `
      const a = V(10, 8, 130); const b = V(34, 8, 130);
      await window.__settle(a, Math.atan2(1, 0), 1.6);
      const r = await window.__fly(window.__line(a, b, 6.0), { heading: Math.atan2(1, 0) });
      window.__stick(0, 0, 0, 0);
      return { worstErr: r.worstErr, probe: { tricks: [], laps: [], pend: [] },
        tail: r.trail.slice(-1)[0] };
    `,
  },
  {
    name: 'tune: flat circle r8',
    want: '-',
    tune: 2.0,
    body: `
      const c = V(24, 10, 130); const R = 8;
      const lap0 = window.__circle(c, V(1, 0, 0), V(0, 0, 1), R, 9, 0, 1);
      const d0 = lap0(0);
      const vEnt = len(d0.v);
      const from = sub(d0.p, mul(norm(d0.v), 10));
      await window.__settle(from, Math.atan2(c.x - from.x, c.z - from.z), 1.6);
      await window.__fly(window.__ramp(from, d0.p, 10 * 1.9 / Math.max(2, vEnt), vEnt),
        { heading: (t, st) => Math.atan2(c.x - st.worldX, c.z - st.worldZ) });
      const r = await window.__fly(lap0,
        { heading: (t, st) => Math.atan2(c.x - st.worldX, c.z - st.worldZ) });
      window.__stick(0, 0, 0, 0);
      return { worstErr: r.worstErr, probe: { tricks: [], laps: [], pend: [] },
        tail: r.trail.slice(-1)[0] };
    `,
  },
  {
    name: 'tune: vertical circle r4',
    want: '-',
    tune: 2.5,
    body: `
      const c = V(24, 9, 130); const R = 4;
      const lap = window.__circle(c, V(0, 1, 0), V(0, 0, 1), R, 4.0, Math.PI, -1);
      const d0 = lap(0);
      const vEnt = len(d0.v);
      const dir = norm(d0.v);
      const from = sub(d0.p, mul(dir, 14));
      const head = Math.atan2(dir.x, dir.z);
      await window.__settle(from, head, 1.8);
      await window.__fly(window.__ramp(from, d0.p, 14 * 1.9 / Math.max(2, vEnt), vEnt),
        { heading: head });
      const r = await window.__fly(lap, { heading: head });
      window.__stick(0, 0, 0, 0);
      return { worstErr: r.worstErr, probe: { tricks: [], laps: [], pend: [] },
        tail: r.trail.slice(-1)[0], trail: r.trail.filter((_, i) => i % 3 === 0) };
    `,
  },
];

const MANOEUVRES = [
  {
    name: 'Powerloop',
    want: 'Powerloop',
    body: lapPlan(PARK.arch, { radius: 3.4, secs: 2.4, turns: -1 }),
  },
  {
    name: 'Powerloop (wide, slow)',
    want: 'Powerloop',
    body: lapPlan(PARK.arch, { radius: 4.6, secs: 3.6, turns: -1 }),
  },
  {
    /* Nose along the rail, so the loop is flown on ROLL. The catalogue
     * calls a lap carrying a whole roll a Mavvy Roll, and it is right to:
     * a Maverick Loop is the same lap without one. */
    name: 'Roll loop (nose along the rail)',
    want: ['Mavvy Roll', 'Maverick Loop'],
    body: lapPlan(PARK.arch, { radius: 3.4, secs: 2.3, turns: -1, noseAlong: true }),
  },
  {
    /* The rope sits at 2.6 m, so the lap's radius is bounded by the
     * ground: at 2.6 the bottom of it is IN the grass, which is how the
     * first attempt came back BUMP with the craft's rotation scrambled. */
    name: 'Jump Rope rail lap',
    want: 'Powerloop',
    body: lapPlan(PARK.jump, { radius: 2.9, secs: 2.4, turns: -1, liftY: 1.3 }),
  },
  {
    name: 'Orbit x2',
    want: 'Orbit x2',
    body: `
      const T = ${JSON.stringify(PARK.post)};
      const c = V(T.x, T.y, T.z);
      const R = 5.5;
      const lap = window.__circle(c, V(1, 0, 0), V(0, 0, 1), R, 5.0, 0, 2);
      const d0 = lap(0);
      const vEnt = len(d0.v);
      const from = sub(d0.p, mul(norm(d0.v), 11));
      /* Nose on the post the whole way: that is what makes it an Orbit
       * rather than a coordinated turn that happens to go round twice. */
      const look = (t, s) => Math.atan2(T.x - s.worldX, T.z - s.worldZ);
      await window.__settle(from, look(0, { worldX: from.x, worldZ: from.z }), 1.8);
      window.__armProbe();
      await window.__fly(window.__ramp(from, d0.p, 11 * 1.9 / Math.max(2, vEnt), vEnt),
        { heading: look });
      const dots = [];
      const r = await window.__fly(lap, {
        heading: look,
        ky: 3.0,
        yawMax: 0.85,
        watch: (c) => {
          const to = norm(V(T.x - c.worldX, T.y - c.worldY, T.z - c.worldZ));
          dots.push(+(to.x * c.fwd.x + to.y * c.fwd.y + to.z * c.fwd.z).toFixed(2));
        },
      });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      const inside = dots.filter((d) => d >= 0.77).length / Math.max(1, dots.length);
      return { worstErr: r.worstErr, probe: window.__probe,
        noseOnPost: +inside.toFixed(2), dots: dots.filter((_, i) => i % 6 === 0) };
    `,
  },
  {
    name: 'Wall Tap',
    want: 'Wall Tap',
    body: `
      const W = ${JSON.stringify(PARK.wall)};
      const from = V(W.x, W.target, W.faceZ - 9);
      await window.__settle(from, Math.atan2(0, 1), 1.8);
      window.__armProbe();
      /*
       * Aim THROUGH the face, not up to it. Asked to stop a third of a
       * metre short the tracker did exactly that, and the recogniser
       * recorded a rotation whose nearest solid was 0.1 m away and never
       * touched: near is not tapped. A pilot tapping a wall flies at the
       * wall.
       */
      /* Aim THROUGH the face, not up to it: near is not tapped. */
      await window.__fly(window.__line(from, V(W.x, W.target, W.faceZ + 0.45), 2.6),
        { heading: Math.atan2(0, 1) });
      /*
       * A quarter back, touch, a quarter forward: the trick as written, and
       * flown GENTLY. At 0.6 of stick the second quarter kept going and
       * came out a whole Flip, which is a different trick; the hold has to
       * stop at a quarter, not somewhere past it.
       */
      const TURN = Math.PI * 2;
      /*
       * A quarter is a QUARTER. Held on a rate stick the craft carries on
       * past it, and two quarters that each ran to a half came out a Double
       * Flip. Each one is now stopped by flying the attitude back to level
       * on the sticks before the next is asked for.
       */
      /*
       * Two quarters, sharply, with nothing between them. A levelling pass
       * in the middle was tried and it ATE the second quarter: the pitch
       * back and the levelling that followed cancelled to one primitive and
       * the trick came out as a single quarter turn.
       */
      /* Nose up a quarter, touch, nose down a quarter, each one braked so it
       * stops where it was asked to. See window.__quarter. */
      await window.__quarter(1);
      await window.__quarter(-1);
      await window.__stickHold(
        (c) => [0, cl(c.fwd.y * 2.4, -0.45, 0.45), 0, 0.58], 700,
        (c) => Math.abs(c.fwd.y) < 0.08 && c.up.y > 0.9,
      );
      await window.__fly(window.__on(V(0, 0.15, -1), 12, 2.8), { heading: Math.atan2(0, -1) });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { probe: window.__probe };
    `,
  },
  {
    /* Two inverted laps of the post. Same circle as the Orbit, flown belly
     * up, which the catalogue prices five times higher. */
    name: '1 Trippy Spin',
    want: '1 Trippy Spin',
    body: `
      const T = ${JSON.stringify(PARK.post)};
      const c = V(T.x, 24, T.z);
      const R = 5.0;
      const flat = window.__circle(c, V(1, 0, 0), V(0, 0, 1), R, 2.3, 0, 1);
      /* Just over a g of fall, which is what puts the thrust axis under the
       * horizon and the craft on its back, and no more: at 1.3 g the lap
       * costs twenty metres and arrives travelling too fast to hold. */
      const lap = window.__drop(flat, 11.4);
      const d0 = lap(0);
      const vEnt = len(d0.v);
      const from = sub(d0.p, mul(norm(d0.v), 12));
      const look = (t, st) => Math.atan2(T.x - st.worldX, T.z - st.worldZ);
      await window.__settle(from, look(0, { worldX: from.x, worldZ: from.z }), 1.8);
      window.__armProbe();
      await window.__fly(window.__ramp(from, d0.p, 12 * 1.9 / Math.max(2, vEnt), vEnt),
        { heading: look });
      let inv = 0; let n = 0;
      const r = await window.__fly(lap, {
        heading: look, ky: 1.6, yawMax: 0.5, invertOk: true,
        watch: (cc) => { n += 1; if (cc.up.y < 0) { inv += 1; } },
      });
      await window.__fly(window.__on(V(1, 0.3, 0), 10, 1.8), { heading: 0 });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { worstErr: r.worstErr, probe: window.__probe,
        invertedFrac: +(inv / Math.max(1, n)).toFixed(2) };
    `,
  },
  {
    /*
     * secs is the time for a WHOLE turn, so a half lap takes half of it,
     * and the number has a floor as well as a ceiling. Too fast and it is
     * 2.6 g into a rail with the tracker eight metres wide of it. Too slow
     * and the craft never inverts at all: holding a circle needs the thrust
     * to point at the centre, which needs more than a g of centripetal, so
     * below about 3 s a whole turn the aircraft flies the shape without
     * ever going over and the catalogue rightly calls it a Beginner Matty.
     */
    /*
     * ON THE LOOP ARCH, not the Split-S bar. The Split-S bar sits at 12.6 m
     * with its two posts at the ends of it, and a half lap flown there
     * never wound more than a tenth of a turn however it was tuned. The
     * arch is the element a pilot would use for this anyway, and it is the
     * one every other lap here is flown around.
     */
    /*
     * A MATTY FLIP IS ENTERED INVERTED, and that is why tracking it round a
     * circle from a level approach never worked. Half a lap from OVER means
     * the wanted force points DOWN at the start, so the craft is on its back
     * before the trick begins; a tracker handed a level run in spends the
     * first third of the arc rolling over instead of flying it, and the lap
     * comes out flat, which the catalogue rightly calls a Beginner Matty.
     * Starting the arc early enough to fix the attitude just adds winding:
     * the half lap measured 1.5 turns.
     *
     * So it is FLOWN, not tracked. Over the rail with speed on, then a held
     * nose down stick that dives around the front of it and back underneath,
     * which is the manoeuvre as a pilot describes it and as the workbook
     * writes it. The trajectory is then whatever the plant does with a held
     * stick, which is the whole point of having a plant.
     */
    name: 'Matty Flip',
    want: 'Matty Flip',
    body: `
      const TURN = Math.PI * 2;
      const A = ${JSON.stringify(PARK.arch)};
      /* The rail runs along z, so the approach is along x, above it. */
      const over = V(A.x - 13, A.y + 3.4, A.z);
      const at = V(A.x - 1.5, A.y + 3.4, A.z);
      const head = Math.atan2(1, 0);
      await window.__settle(over, head, 1.8);
      window.__armProbe();
      await window.__fly(window.__ramp(over, at, 2.1, 11), { heading: head });
      /* Nose DOWN and hold: pitch stick negative pitches the nose down, and
       * the craft carves down past the near face of the rail and back under
       * it. Half a turn of pitch, braked so it does not become a whole one. */
      await window.__stickHold([0, -0.62, 0, 0.52], 1400,
        (c, t, a) => a.q >= TURN * 0.34);
      await window.__stickHold([0, 0.4, 0, 0.6], 500,
        (c) => !c.rates || Math.abs(c.rates.q) < 1.5);
      await window.__fly(window.__on(V(1, 0.1, 0), 12, 2.2), { heading: head });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { probe: window.__probe };
    `,
  },
  {
    /* Half a lap up from under, then the half roll that finishes it, which
     * is an Immelmann Turn. Flying the half lap and NOT rolling out leaves
     * the craft inverted, and righting it is a rotation of its own that the
     * catalogue reads as part of whatever comes next. */
    name: 'Immelmann Turn',
    want: 'Immelmann Turn',
    body: lapPlan(PARK.splitBar, {
      radius: 3.2, secs: 2.9, turns: -0.5, ph0: -Math.PI / 2, runUp: 15,
      after: 'roll', afterTurns: 0.42,
    }),
  },
  {
    /* A lap of the arch with a whole yaw turn inside it. */
    name: 'Cinnamon Roll',
    want: 'Cinnamon Roll',
    body: lapPlan(PARK.arch, {
      radius: 3.4, secs: 2.6, turns: -1, yawRate: 0.34,
    }),
  },
  {
    /* The plain rotations, flown on the sticks the way a pilot does them,
     * away from anything that could turn one into a lap. */
    /*
     * FLOWN WITH SPEED ON. A rotation out of a dead hover is a Stall
     * Rewind and the catalogue is right to name it one: the first version
     * of this hovered first and was duly told it had flown a 360 Stall
     * Rewind. A plain Roll is a roll while going somewhere.
     */
    name: 'Roll',
    want: 'Roll',
    body: `
      const TURN = Math.PI * 2;
      const a = V(56, 14, 132); const b = V(96, 14, 132);
      await window.__settle(a, Math.atan2(1, 0), 1.6);
      window.__armProbe();
      /* Four seconds of flying before the stick goes in. gapStallMs only
       * accrues below 2.5 m/s, but it accrues from the hover this run
       * started in, and a rotation with a stall on the books in front of it
       * is a Stall Rewind, which is a different trick at a different price. */
      await window.__fly(window.__ramp(a, V(64, 14, 132), 2.2, 13), { heading: Math.atan2(1, 0) });
      await window.__fly(window.__line(V(64, 14, 132), V(70, 14, 132), 1.0), { heading: Math.atan2(1, 0) });
      /* Let go at 0.84 of a turn. A rate command does not stop when the
       * stick centres: measured, holding to a whole turn came out at 1.25,
       * which is a different trick at a different price. */
      await window.__stickHold([0.85, 0, 0, 0.42], 1200, (c, t, a2) => a2.p >= TURN * 0.84);
      await window.__fly(window.__on(V(1, 0, 0), 18, 2.4), { heading: Math.atan2(1, 0) });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { probe: window.__probe };
    `,
  },
  {
    name: 'Flip',
    want: 'Flip',
    body: `
      const TURN = Math.PI * 2;
      const a = V(56, 14, 132); const b = V(96, 14, 132);
      await window.__settle(a, Math.atan2(1, 0), 1.6);
      window.__armProbe();
      /* Four seconds of flying before the stick goes in. gapStallMs only
       * accrues below 2.5 m/s, but it accrues from the hover this run
       * started in, and a rotation with a stall on the books in front of it
       * is a Stall Rewind, which is a different trick at a different price. */
      await window.__fly(window.__ramp(a, V(64, 14, 132), 2.2, 13), { heading: Math.atan2(1, 0) });
      await window.__fly(window.__line(V(64, 14, 132), V(70, 14, 132), 1.0), { heading: Math.atan2(1, 0) });
      await window.__stickHold([0, 0.85, 0, 0.42], 1200, (c, t, a2) => -a2.q >= TURN * 0.84);
      await window.__fly(window.__on(V(1, 0, 0), 18, 2.4), { heading: Math.atan2(1, 0) });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { probe: window.__probe };
    `,
  },
  {
    name: 'Yaw Spin',
    want: 'Yaw Spin',
    body: `
      const TURN = Math.PI * 2;
      await window.__settle(V(56, 14, 132), Math.atan2(1, 0), 1.6);
      window.__armProbe();
      await window.__fly(window.__ramp(V(56, 14, 132), V(70, 14, 132), 2.2, 12),
        { heading: Math.atan2(1, 0) });
      await window.__stickHold([0, 0, 0.9, 0.42], 2600, (c, t, a) => Math.abs(a.r) >= TURN * 0.86);
      await window.__fly(window.__on(V(1, 0, 0), 16, 2.4), { heading: null });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { probe: window.__probe };
    `,
  },
];

/* A plain stick hold, for the manoeuvres that are a rotation rather than a
 * path. Integrates the body rates so "a quarter turn" is a measurement. */
const STICK_HOLD = `
/*
 * A QUARTER TURN THAT STOPS AT A QUARTER.
 *
 * The stick is a RATE, so releasing it leaves the craft still turning: held
 * to a quarter it arrives at a third, and two of those in a row came out a
 * Double Flip, which is a different trick at a different price. A pilot
 * stops a rotation by putting in the opposite stick, and so does this.
 */
window.__quarter = async (sign, turns = 0.25) => {
  const TURN = Math.PI * 2;
  const acc = { q: 0 };
  await window.__stickHold([0, sign * 0.55, 0, 0.58], 900,
    (c, t, a) => { acc.q = a.q; return Math.abs(a.q) >= TURN * turns * 0.62; });
  /* Brake until the rate is nearly nothing, then let the coast finish it. */
  await window.__stickHold([0, -sign * 0.5, 0, 0.6], 500,
    (c) => !c.rates || Math.abs(c.rates.q) < 1.2);
  await window.__stickHold([0, 0, 0, 0.58], 120);
  return acc.q;
};

window.__stickHold = (sticks, ms, done) => new Promise((res) => {
  const t0 = performance.now();
  let lastT = t0;
  const acc = { p: 0, q: 0, r: 0 };
  const tick = () => {
    const c = window.__craftState();
    const now = performance.now();
    const dt = (now - lastT) / 1000; lastT = now;
    if (c && c.rates) { acc.p += c.rates.p * dt; acc.q += c.rates.q * dt; acc.r += c.rates.r * dt; }
    const s = typeof sticks === 'function' ? sticks(c, now - t0, acc) : sticks;
    window.__stick(s[0], s[1], s[2], s[3]);
    if ((done && done(c, now - t0, acc)) || now - t0 >= ms) { res({ c, acc }); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
`;

async function main() {
  const args = process.argv.slice(2);
  const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
  const reps = Number((args.find((a) => a.startsWith('--reps=')) || '').split('=')[1] || 1);
  /*
   * Small and cheap, and the draw switched off once the map is up. The
   * town costs about two hundred milliseconds a frame under swiftshader,
   * and the pilot below runs once per frame, so the picture is the
   * difference between a five hertz pilot and a sixty hertz one.
   */
  const page = await openPage({
    root: ROOT, width: 400, height: 260, url: '/index.html',
  });
  const { cdp, sessionId } = page;
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true,
    }, sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };
  let failures = 0;
  try {
    for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady')); i += 1) {
      await sleep(500);
    }
    await ev("const ui = window.__ui; ui.settings.map = 'city'; ui.settings.graphics = 'low'; ui.onAction('fly', ui.settings); return 1;");
    let ready = false;
    for (let i = 0; i < 260; i += 1) {
      const m = await ev('return window.__map ? window.__map() : null');
      if (m && m.ready) { ready = true; break; }
      await sleep(500);
    }
    if (!ready) { throw new Error('the map never became ready'); }
    /* The town keeps working after it says it is ready: baking, uploading
     * and warming shaders. Measuring the control rate during that reads
     * 1.4 Hz and poisons every flight after it. */
    await sleep(6000);
    await ev(`${PILOT}\n${STICK_HOLD}\nreturn 1;`);
    /* Best of three windows. A single sample lands on whatever the town
     * happens to be finishing and has read anywhere from 1.4 to 60 Hz on a
     * run whose flights then tracked to a metre and a half. */
    const fps = await ev(`
      window.__drawOff(true);
      let best = 0;
      for (let k = 0; k < 3; k += 1) {
        let n = 0; const t0 = performance.now();
        await new Promise((res) => {
          const tick = () => { n += 1;
            if (performance.now() - t0 > 1200) { res(); return; }
            requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        });
        const hz = n / ((performance.now() - t0) / 1000);
        if (hz > best) { best = hz; }
      }
      return +best.toFixed(1);`);
    /*
     * ACRO OR NOTHING. Angle mode holds the craft to about thirty degrees
     * of bank, so every trick in the catalogue is out of reach in it and a
     * rig that has silently fallen into angle is measuring its own harness.
     * Checked once here and again on the first flight, because the mode is
     * recomputed every frame from the input source.
     */
    const mode = await ev(`
      window.__placeCraft(24, 12, 130);
      window.__stick(0, 0, 0, 0.4);
      await new Promise((r) => setTimeout(r, 400));
      const m = window.__flightMode();
      window.__stick(0, 0, 0, 0);
      return m;`);
    console.log(`park-fly: city loaded, draw off, pilot running at ${fps} Hz in ${mode}\n`);
    if (mode !== 'acro') {
      console.log('  STOP: the plant is in ANGLE mode. Angle cannot loop, roll or invert,');
      console.log('  so nothing below would mean anything. Fix wantAngleMode first.');
      throw new Error('the rig is not in acro');
    }
    if (fps < 25) {
      console.log('  WARNING: under 25 Hz the pilot cannot fly and nothing below means anything.');
    }

    const list = args.includes('--tune') ? TUNE : MANOEUVRES;
    for (const m of list) {
      if (only && !m.name.toLowerCase().includes(only.toLowerCase())) { continue; }
      const got = [];
      let lastErr = 0;
      for (let rep = 0; rep < reps; rep += 1) {
        /* eslint-disable no-await-in-loop */
        const r = await ev(`${PRELUDE}\n${m.body}`);
        lastErr = r.worstErr ?? 0;
        /* The catalogue reports "name:GRADE"; what is being asked here is
         * whether the trick was NAMED. A Powerloop graded SLOPPY is a
         * Powerloop that was flown untidily, which is the whole point of
         * having grades, and counting it as a miss hid two clean passes. */
        const names = r.probe.tricks.join(' + ') || 'NOTHING';
        const bare = r.probe.tricks.map((t) => t.split(':')[0]);
        got.push(bare.join(' + ') || 'NOTHING');
        if (m.tune != null) {
          console.log(`  ${m.name}`);
          console.log(`     worst path error ${r.worstErr} m, ended at ${JSON.stringify(r.tail)}`);
          if (r.trail) {
            const out = `/tmp/park-${m.name.replace(/[^a-z0-9]+/gi, '-')}.json`;
            writeFileSync(out, JSON.stringify(r.trail, null, 1));
            console.log(`     trail written to ${out} (${r.trail.length} rows)`);
          }
        } else if (reps === 1 || rep === 0) {
          const laps = JSON.stringify(r.probe.laps);
          const pend = JSON.stringify(r.probe.pend);
          console.log(`  ${m.name}`);
          console.log(`     want ${Array.isArray(m.want) ? m.want.join(' or ') : m.want}`);
          console.log(`     got  ${names}`);
          console.log(`     laps ${laps.length > 260 ? `${laps.slice(0, 260)}...` : laps}`);
          console.log(`     pend ${pend.length > 300 ? `${pend.slice(0, 300)}...` : pend}`);
          if (r.worstErr != null) { console.log(`     path error worst ${r.worstErr} m`); }
          if (r.invertedFrac != null) {
            console.log(`     flown belly up for ${r.invertedFrac} of the lap`);
          }
          if (r.noseOnPost != null) {
            console.log(`     nose within 40 deg of the post ${r.noseOnPost} of the lap`);
            console.log(`     nose dot ${JSON.stringify(r.dots)}`);
          }
        }
      }
      if (m.tune != null) {
        const ok = lastErr <= m.tune;
        if (!ok) { failures += 1; }
        console.log(`     ${ok ? 'PASS' : 'FAIL'}  worst ${lastErr} m, allowed ${m.tune}\n`);
      } else {
        /*
         * The NAME, exactly. A substring test passed "Flip Stall Rewind"
         * as a Flip, which is a different trick with a different price.
         * `want` may be a LIST where the catalogue genuinely offers more
         * than one reading of the same shape, which is not the same as
         * being vague: a lap flown on roll is a Mavvy Roll if the roll came
         * all the way round and a Maverick Loop if it did not, and how far
         * round it came is a real property of the flight, not a coin toss.
         */
        const wants = Array.isArray(m.want) ? m.want : [m.want];
        const hit = got.filter((g) => wants.some((w) => g.split(' + ').includes(w))).length;
        const verdict = hit === got.length ? 'PASS' : (hit > 0 ? 'FLAKY' : 'FAIL');
        if (verdict !== 'PASS') { failures += 1; }
        console.log(`     ${verdict}  ${hit}/${got.length}\n`);
      }
    }
  } catch (e) {
    console.log('park-fly ERROR', e.message);
    failures += 1;
  } finally {
    await page.close?.();
  }
  console.log(failures === 0 ? 'park-fly: all flown and named' : `park-fly: ${failures} not right yet`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
