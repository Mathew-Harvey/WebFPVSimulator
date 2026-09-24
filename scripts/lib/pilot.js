/*
 * pilot.js: the in-page pilot that flies the real shell on feedback.
 *
 * Moved here from scripts/park-fly.js, which wrote it, so that a second
 * rig (scripts/crash-check.js) can fly the same guidance law rather than a
 * copy of it. park-fly.js imports it from here and is otherwise unchanged.
 * See park-fly.js's header for how the pilot works.
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

/* ------------------------------------------------------------------ *
 * The in-page pilot. Injected as one string because it has to live in
 * the tab with the aircraft.
 * ------------------------------------------------------------------ */
export const PILOT = `
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
    /* Primitives buffer through insertPending now, in flight order, so the
     * probe has to watch THAT rather than Array.push. */
    const pp = d.insertPending.bind(d);
    d.insertPending = (x) => {
      window.__probe.pend.push(x.kind === 'path'
        ? { k: 'path', ob: x.obstacle, t: x.turns, raw: +x.rawTurns.toFixed(2),
          rot: x.rot.map((v) => +v.toFixed(2)), spin: +(x.spin || 0).toFixed(2),
          body: x.bodyRot ? x.bodyRot.map((v) => +v.toFixed(2)) : null,
          res: x.resid ? x.resid.map((v) => +v.toFixed(2)) : null,
          align: x.align ? x.align.map((v) => +v.toFixed(2)) : null,
          trk: +x.trackFrac.toFixed(2),
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
    const hp = d.heldByPath.push.bind(d.heldByPath);
    d.heldByPath.push = (x) => {
      window.__probe.pend.push({ HELD: x.axis, t: x.turns, ms: x.startMs + '-' + x.endMs });
      return hp(x);
    };
    const sink = d.onTrick;
    d.onTrick = (t) => { window.__probe.tricks.push(t.name + ':' + t.execution); return sink(t); };
  }
  return 1;
};
window.__flush = () => { window.__trickDetector().flush(1); return window.__probe; };
`;
