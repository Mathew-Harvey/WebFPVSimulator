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
import { PILOT } from './lib/pilot.js';
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
   * A post to go round: the Split-S station's near post, which spans y 0.7
   * to 12.9.
   *
   * It used to be the only thing in the park a lap could be flown around,
   * because the 34 m mast reached the obstacle field only as a 3 m stub at
   * y 36.2. That was the height clamp in deriveObstacles asking the shell
   * for the ground WITHOUT a hint and being told the height of the mast's
   * own head deck, so each leg's bottom was clamped above its own top and
   * every one of them was dropped. Fixed on 2026-09-03; the mast is four
   * poles now and the cases below fly it.
   */
  post: { x: 24.0, y: 6.8, z: 164.0 },
  /*
   * THE MAST, and the rings the park paints on the ground under it.
   *
   * The whole element is built around a pilot being able to SEE the radius
   * they are flying: "the ground under it carries three painted rings at 6,
   * 10 and 14 m". Those three numbers are the cases, because a pilot flying
   * the circle the paint tells them to fly is the report.
   */
  mast: { x: 96.0, y: 12.0, z: 160.0, rings: [6, 10, 14] },
};

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
    liftY = 0, before = null, beforeTurns = 0.25,
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
    /*
     * The stick that OPENS the trick, flown BEFORE the run in rather than at
     * the lap's start point. Twelve patterns are [rotation, lap] and the
     * rotation has to reach the matcher as its own primitive: flown at the
     * start point it was inside the lap's open window and was held by it,
     * because the winding gate opens at 0.08 turns per second and that is a
     * long way out. A pilot yaws to line up and THEN flies at the rail.
     */
    if (${JSON.stringify(before)}) {
      const TURN3 = Math.PI * 2;
      const wantB = TURN3 * ${beforeTurns};
      await window.__stickHold([0, 0, 0.75, 0.52], 700,
        (cc, tt, aa) => Math.abs(aa.r) >= wantB * 0.7);
      await window.__stickHold([0, 0, -0.4, 0.55], 260,
        (cc) => !cc.rates || Math.abs(cc.rates.r) < 1.5);
      await window.__fly(window.__hold3(from, 0.5), {});
    }
    await window.__fly(window.__ramp(from, start, ${runUp} * 1.9 / Math.max(2, vEnt), vEnt),
      { heading: head });
    const r = await window.__fly(lap, ${yawRate}
      ? { yawRate: ${yawRate} }
      : { heading: head });
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
    /* 2.4 s was too fast for the tracker to hold: it over-rotated to two
     * whole turns of pitch, the lap's own rotation measured 1.5, and the
     * recogniser refused it, which is the right answer to a loop flown one
     * and a half times round. */
    body: lapPlan(PARK.arch, { radius: 3.4, secs: 2.9, turns: -1 }),
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
    /* The park's own painted ring at 6 m. See PARK.mast. */
    name: 'Orbit x2 (mast, 6 m ring)',
    want: 'Orbit x2',
    body: `
      const T = ${JSON.stringify(PARK.mast)};
      const c = V(T.x, T.y, T.z);
      const R = 6;
      const lap = window.__circle(c, V(1, 0, 0), V(0, 0, 1), R, 5.0, 0, 2);
      const d0 = lap(0);
      const vEnt = len(d0.v);
      const from = sub(d0.p, mul(norm(d0.v), 11));
      const look = (t, s) => Math.atan2(T.x - s.worldX, T.z - s.worldZ);
      await window.__settle(from, look(0, { worldX: from.x, worldZ: from.z }), 1.8);
      window.__armProbe();
      await window.__fly(window.__ramp(from, d0.p, 11 * 1.9 / Math.max(2, vEnt), vEnt),
        { heading: look });
      const r = await window.__fly(lap, { heading: look, ky: 3.0, yawMax: 0.85 });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { worstErr: r.worstErr, probe: window.__probe,
        obstacles: window.__obstacles() };
    `,
  },
  {
    /* The park's own painted ring at 10 m. See PARK.mast. */
    name: 'Orbit x2 (mast, 10 m ring)',
    want: 'Orbit x2',
    body: `
      const T = ${JSON.stringify(PARK.mast)};
      const c = V(T.x, T.y, T.z);
      const R = 10;
      const lap = window.__circle(c, V(1, 0, 0), V(0, 0, 1), R, 7.0, 0, 2);
      const d0 = lap(0);
      const vEnt = len(d0.v);
      const from = sub(d0.p, mul(norm(d0.v), 11));
      const look = (t, s) => Math.atan2(T.x - s.worldX, T.z - s.worldZ);
      await window.__settle(from, look(0, { worldX: from.x, worldZ: from.z }), 1.8);
      window.__armProbe();
      await window.__fly(window.__ramp(from, d0.p, 11 * 1.9 / Math.max(2, vEnt), vEnt),
        { heading: look });
      const r = await window.__fly(lap, { heading: look, ky: 3.0, yawMax: 0.85 });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { worstErr: r.worstErr, probe: window.__probe,
        obstacles: window.__obstacles() };
    `,
  },
  {
    /* The park's own painted ring at 14 m. See PARK.mast. */
    name: 'Orbit x2 (mast, 14 m ring)',
    want: 'Orbit x2',
    body: `
      const T = ${JSON.stringify(PARK.mast)};
      const c = V(T.x, T.y, T.z);
      const R = 14;
      const lap = window.__circle(c, V(1, 0, 0), V(0, 0, 1), R, 9.0, 0, 2);
      const d0 = lap(0);
      const vEnt = len(d0.v);
      const from = sub(d0.p, mul(norm(d0.v), 11));
      const look = (t, s) => Math.atan2(T.x - s.worldX, T.z - s.worldZ);
      await window.__settle(from, look(0, { worldX: from.x, worldZ: from.z }), 1.8);
      window.__armProbe();
      await window.__fly(window.__ramp(from, d0.p, 11 * 1.9 / Math.max(2, vEnt), vEnt),
        { heading: look });
      const r = await window.__fly(lap, { heading: look, ky: 3.0, yawMax: 0.85 });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { worstErr: r.worstErr, probe: window.__probe,
        obstacles: window.__obstacles() };
    `,
  },
  {
    /*
     * ONE lap, nose on the mast. There is deliberately no pattern for a
     * single upright orbit: the workbook has no block for one, and one
     * nose-in circle round a post IS a 360 of yaw, which the yaw run already
     * names. This case exists to SHOW a pilot what that costs, not to assert
     * a name.
     */
    name: 'Orbit, ONE lap only',
    want: 'Yaw Spin',
    body: `
      const T = ${JSON.stringify(PARK.mast)};
      const c = V(T.x, T.y, T.z);
      const lap = window.__circle(c, V(1, 0, 0), V(0, 0, 1), 6, 5.0, 0, 1);
      const d0 = lap(0);
      const vEnt = len(d0.v);
      const from = sub(d0.p, mul(norm(d0.v), 11));
      const look = (t, s) => Math.atan2(T.x - s.worldX, T.z - s.worldZ);
      await window.__settle(from, look(0, { worldX: from.x, worldZ: from.z }), 1.8);
      window.__armProbe();
      await window.__fly(window.__ramp(from, d0.p, 11 * 1.9 / Math.max(2, vEnt), vEnt), { heading: look });
      const r = await window.__fly(lap, { heading: look, ky: 3.0, yawMax: 0.85 });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { worstErr: r.worstErr, probe: window.__probe };
    `,
  },
  {
    /*
     * TWO laps with the nose on the FLIGHT PATH rather than on the mast,
     * which is a coordinated turn flown twice round. The Orbit is defined by
     * keeping the object on the screen and the recogniser measures that
     * directly, so it names nothing, and that is asserted rather than
     * observed: it is the false positive the tracking test exists to refuse,
     * and it is what a pilot who does not know the trick flies.
     */
    name: 'Orbit, nose NOT on the mast',
    want: 'NOTHING',
    body: `
      const T = ${JSON.stringify(PARK.mast)};
      const c = V(T.x, T.y, T.z);
      const lap = window.__circle(c, V(1, 0, 0), V(0, 0, 1), 6, 5.0, 0, 2);
      const d0 = lap(0);
      const vEnt = len(d0.v);
      const from = sub(d0.p, mul(norm(d0.v), 11));
      const ahead = (t, s) => Math.atan2(s.vel ? s.vel.x : 1, s.vel ? s.vel.z : 0);
      await window.__settle(from, ahead(0, {}), 1.8);
      window.__armProbe();
      await window.__fly(window.__ramp(from, d0.p, 11 * 1.9 / Math.max(2, vEnt), vEnt), { heading: ahead });
      const r = await window.__fly(lap, { heading: ahead, ky: 3.0, yawMax: 0.85 });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { worstErr: r.worstErr, probe: window.__probe };
    `,
  },
  {
    /* One lap of the mast flown belly up, which is what the catalogue calls
     * a 1 Trippy Spin and prices at a hundred. */
    name: '1 Trippy Spin (mast)',
    want: '1 Trippy Spin',
    body: `
      const T = ${JSON.stringify(PARK.mast)};
      const c = V(T.x, 24, T.z);
      const flat = window.__circle(c, V(1, 0, 0), V(0, 0, 1), 5.0, 2.3, 0, 1);
      const lap = window.__drop(flat, 11.4);
      const d0 = lap(0);
      const vEnt = len(d0.v);
      const from = sub(d0.p, mul(norm(d0.v), 12));
      const look = (t, s) => Math.atan2(T.x - s.worldX, T.z - s.worldZ);
      await window.__settle(from, look(0, { worldX: from.x, worldZ: from.z }), 1.8);
      window.__armProbe();
      await window.__fly(window.__ramp(from, d0.p, 12 * 1.9 / Math.max(2, vEnt), vEnt), { heading: look });
      let inv = 0; let n = 0;
      const r = await window.__fly(lap, { heading: look, ky: 1.6, yawMax: 0.5, invertOk: true,
        watch: (cc) => { n += 1; if (cc.up.y < 0) { inv += 1; } } });
      await window.__fly(window.__on(V(1, 0.3, 0), 10, 1.8), { heading: 0 });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { worstErr: r.worstErr, probe: window.__probe, invertedFrac: +(inv / Math.max(1, n)).toFixed(2) };
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
      /*
       * The dive begins just PAST the rail, not short of it. A Matty Flip
       * goes OVER the object and comes back UNDER it, so the curve has to
       * enclose the rail: started a metre and a half before it the craft
       * carved down the near face and never went round anything, and the
       * lap never formed.
       */
      /*
       * THE DIVE CIRCLE HAS TO CONTAIN THE RAIL, and that is arithmetic, not
       * taste. A dive of radius r = v / omega curves about a centre r below
       * the entry, and the lap only winds past half a turn if the rail lies
       * INSIDE that circle: a straight line subtends strictly less than half
       * a turn about any point off it, which is exactly why HALF_LAP_MIN is
       * where it is and why it must not be moved.
       *
       * At 8 m/s and full back stick the radius is about a metre, so entering
       * 3.2 m above and 2 m across put the rail nearly 3 m from a 1 m circle:
       * outside it, no wrap, and the lap wound 0.47 to 0.55, which the
       * recogniser was right to refuse as a fly past. Entering 2.5 m above
       * and 1.5 m across with a 3 m radius puts the rail 1.6 m from the
       * centre, well inside.
       */
      const over = V(A.x - 14, A.y + 3.6, A.z);
      const at = V(A.x + 2.2, A.y + 3.6, A.z);
      const head = Math.atan2(1, 0);
      await window.__settle(over, head, 1.8);
      window.__armProbe();
      /* SLOWER MAKES IT TIGHTER. The dive's radius is speed over turn rate,
       * and the lap only winds a half turn if the curve comes back UNDER the
       * rail: at 11 m/s it carved down the far side and away, winding half of
       * what was needed. */
      await window.__fly(window.__ramp(over, at, 2.1, 11), { heading: head });
      /* Nose DOWN and hold: pitch stick negative pitches the nose down, and
       * the craft carves down past the near face of the rail and back under
       * it. Half a turn of pitch, braked so it does not become a whole one. */
      /* A 3 m radius at 8 m/s is 2.7 rad/s, which is about a fifth of the
       * 12.8 rad/s full deflection was measured to buy. */
      await window.__stickHold([0, -0.62, 0, 0.50], 1700,
        (c, t, a) => a.q >= TURN * 0.44);
      /* Braked gently and briefly: a hard brake splits the pitch into two
       * primitives and the pair reads as two half flips rather than one. */
      await window.__stickHold([0, 0.22, 0, 0.6], 340,
        (c) => !c.rates || Math.abs(c.rates.q) < 2.4);
      await window.__fly(window.__on(V(1, 0.1, 0), 12, 2.2), { heading: head });
      window.__stick(0, 0, 0, 0);
      await new Promise((z) => setTimeout(z, 900));
      window.__flush();
      return { probe: window.__probe };
    `,
  },
  {
    /*
     * A Split-S is a Matty Flip with the half roll that names it flown
     * first: over the object, roll inverted, then pull through and out
     * underneath. It is the same station and the same dive as the Matty
     * Flip above, so anything that breaks one should break both, which is
     * the point of having it here: the owner reported Split-S not
     * registering in the practice field and the rig had no case for it.
     */
    name: 'Split-S',
    want: 'Split-S',
    body: `
      const TURN = Math.PI * 2;
      const A = ${JSON.stringify(PARK.arch)};
      const over = V(A.x - 14, A.y + 3.6, A.z);
      const at = V(A.x + 2.2, A.y + 3.6, A.z);
      const head = Math.atan2(1, 0);
      await window.__settle(over, head, 1.8);
      window.__armProbe();
      /*
       * THE ROLL IS FLOWN ON THE RUN IN, not on the doorstep. It takes
       * about 800 ms, which at 11 m/s is nearly nine metres, so rolling
       * after arriving carried the craft that far past the rail before the
       * dive began and the dive circle no longer enclosed it: no wrap, no
       * lap, and three loose rotations where a Split-S had been flown. The
       * ramp therefore stops nine metres short and the roll covers the
       * rest, so the dive still starts just past the rail where the Matty
       * Flip's arithmetic says it has to.
       */
      const mid = V(A.x - 6.6, A.y + 3.6, A.z);
      await window.__fly(window.__ramp(over, mid, 1.5, 11), { heading: head });
      await window.__stickHold([0.85, 0, 0, 0.52], 620,
        (c, t, a) => Math.abs(a.p) >= TURN * 0.46);
      await window.__stickHold([-0.3, 0, 0, 0.55], 180,
        (c) => !c.rates || Math.abs(c.rates.p) < 2.4);
      /* Then the same dive the Matty Flip flies. */
      await window.__stickHold([0, -0.62, 0, 0.50], 1700,
        (c, t, a) => a.q >= TURN * 0.44);
      await window.__stickHold([0, 0.22, 0, 0.6], 340,
        (c) => !c.rates || Math.abs(c.rates.q) < 2.4);
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
      /*
       * NOSE ACROSS, and the 360 SPREAD through the lap. Flown nose along
       * the rail with a spin on top this is a Side Loop with a spin, not a
       * Cinnamon Roll, and it read as one. The workbook is explicit: "a slow
       * 360 yaw spin, timed to finish as you pass back under the object",
       * and that is exactly why its lap carries neither a flip nor a roll.
       * With the nose sweeping the whole way round, the loop's own turn is
       * shared across the body axes and averages to nothing on both of them,
       * which leaves the yaw as the only thing the lap carries.
       */
      /* 0.26 of stick gave 0.79 of a turn over the lap and the trick wants a
       * whole one: short of that the nose never sweeps far enough to leave
       * the loop's turn unowned, pitch keeps it, and the lap reads as a
       * plain Powerloop. */
      radius: 3.4, secs: 3.0, turns: -1, yawRate: 0.34, noseAlong: false,
      before: 'yaw', beforeTurns: 0.25,
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
