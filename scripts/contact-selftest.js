/*
 * contact-selftest.js: the rigid-body ground plane, offset impulses, and
 * Betaflight crashflip (turtle), proven in Node against dist/sim.wasm.
 *
 * The verification harness never raises sim_set_ground or sim_contact, so
 * npm run verify cannot see a floor, a wall tap, a tumble or a turtle.
 * This file is that missing proof. It loads the same baseline diff the
 * harness uses, then:
 *
 *   1. a drop onto a plane is a dead thump, not a bounce
 *   2. a tilted drop produces a moment of spin, then the belly settles
 *   3. a wall with surface velocity spins the craft
 *   4. inverted plus crashflip plus pitch stick still flips the hull
 *      past inverted (ABI proof; the shell now drives the same mixer
 *      path: latch, prompt, pitch or roll). Peak attitude, not the
 *      leftover tumble in free air.
 *   5. a harness-style replay that never calls the new entry points
 *      still falls in free air, so the additive ABI does not leak a
 *      floor into checks 2 through 12
 *   6. inverted rest, slam, and full throttle into the dirt leave no
 *      hull corner or camera glass below the plane
 *   7. belly slide is short then sticks; props-down stops at once
 *   8. a seated punch leaves the pad immediately; settle must not
 *      cancel climb (motors at the stops, hull glued to the slop)
 *   9. an inverted flip or leftover roll in free air must not freeze
 *      vel or omega just because a ground plane exists metres below
 *  10. a 135 deg flip must not freeze in the 8 mm near halo before
 *      the hull actually hits
 *
 * Run: node scripts/contact-selftest.js   (npm run contact:selftest)
 * Exit code is the failure count.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { GROUND_E, GROUND_MU } from '../src/game/collide.js';
import { CAMERA_LENS_FORWARD, CAMERA_LENS_UP } from '../src/render/lens.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ST = {
  T: 0, X: 1, Y: 2, Z: 3, VX: 4, VY: 5, VZ: 6,
  QW: 7, QX: 8, QY: 9, QZ: 10, OX: 11, OY: 12, OZ: 13,
  RPM0: 14,
};

const wasm = await readFile(join(root, 'dist/sim.wasm'));
const config = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

let failures = 0;

function check(name, cond, detail) {
  if (cond) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}

async function fresh() {
  const sim = await loadSim(wasm);
  if (sim.init(config) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  return sim;
}

function need(sim, name) {
  if (typeof sim.e[name] !== 'function') {
    throw new Error(`sim.wasm does not export ${name}`);
  }
}

function hold(sim, ms, sticks) {
  const s = { roll: 0, pitch: 0, yaw: 0, throttle: 0, ...sticks };
  let t = sim.readState().state[ST.T];
  for (let i = 0; i < ms; i += 1) {
    t += 0.001;
    sim.input(t, s.roll, s.pitch, s.yaw, s.throttle);
    sim.step(1);
  }
  return sim.readState().state;
}

/* Crashflip is a couple, not a pose hold. Measure the peak attitude
 * and the deepest corner during the hold, not just the final sample:
 * once the hull leaves the grass an honest near flag will not damp
 * leftover rate in free air. */
function turtleHold(sim, ms, sticks) {
  const s = { roll: 0, pitch: 0, yaw: 0, throttle: 0, ...sticks };
  let t = sim.readState().state[ST.T];
  let peakUp = upZ(sim.readState().state);
  let worstCorner = Infinity;
  let peakState = sim.readState().state;
  for (let i = 0; i < ms; i += 1) {
    t += 0.001;
    sim.input(t, s.roll, s.pitch, s.yaw, s.throttle);
    sim.step(1);
    const st = sim.readState().state;
    const u = upZ(st);
    if (u > peakUp) {
      peakUp = u;
      peakState = st;
    }
    const corner = deepestHullCorner(st);
    if (corner < worstCorner) {
      worstCorner = corner;
    }
  }
  return { peakUp, worstCorner, state: peakState, end: sim.readState().state };
}

function upZ(st) {
  const x = st[ST.QX];
  const y = st[ST.QY];
  const u = 1 - 2 * (x * x + y * y);
  if (u > 1) {
    return 1;
  }
  return u < -1 ? -1 : u;
}

function omegaMag(st) {
  return Math.sqrt(st[ST.OX] * st[ST.OX] + st[ST.OY] * st[ST.OY] + st[ST.OZ] * st[ST.OZ]);
}

function speedMag(st) {
  return Math.sqrt(st[ST.VX] * st[ST.VX] + st[ST.VY] * st[ST.VY] + st[ST.VZ] * st[ST.VZ]);
}

/* Plant OBB, same numbers as CONTACT_* in src/native/sim.c. Used to
 * prove the hull stays on the plane, not just the CG. */
const HULL_HX = 0.094;
const HULL_HY = 0.094;
const HULL_HZ_DOWN = 0.045;
const HULL_HZ_UP = 0.038;
const HULL_SLOP = 0.002;
const HULL_CORNERS = [
  [-HULL_HX, -HULL_HY, -HULL_HZ_DOWN],
  [HULL_HX, -HULL_HY, -HULL_HZ_DOWN],
  [-HULL_HX, HULL_HY, -HULL_HZ_DOWN],
  [HULL_HX, HULL_HY, -HULL_HZ_DOWN],
  [-HULL_HX, -HULL_HY, HULL_HZ_UP],
  [HULL_HX, -HULL_HY, HULL_HZ_UP],
  [-HULL_HX, HULL_HY, HULL_HZ_UP],
  [HULL_HX, HULL_HY, HULL_HZ_UP],
];

function rotateByQuat(qw, qx, qy, qz, vx, vy, vz) {
  const uvx = qy * vz - qz * vy;
  const uvy = qz * vx - qx * vz;
  const uvz = qx * vy - qy * vx;
  const uuvx = qy * uvz - qz * uvy;
  const uuvy = qz * uvx - qx * uvz;
  const uuvz = qx * uvy - qy * uvx;
  return {
    x: vx + 2 * (qw * uvx + uuvx),
    y: vy + 2 * (qw * uvy + uuvy),
    z: vz + 2 * (qw * uvz + uuvz),
  };
}

const CAMERA_BODY = [CAMERA_LENS_FORWARD, 0.0, CAMERA_LENS_UP];

function cameraPlantZ(st) {
  const r = rotateByQuat(
    st[ST.QW], st[ST.QX], st[ST.QY], st[ST.QZ],
    CAMERA_BODY[0], CAMERA_BODY[1], CAMERA_BODY[2],
  );
  return st[ST.Z] + r.z;
}

function grass(sim) {
  return sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E);
}

function deepestHullCorner(st) {
  let worst = Infinity;
  for (const c of HULL_CORNERS) {
    const r = rotateByQuat(st[ST.QW], st[ST.QX], st[ST.QY], st[ST.QZ], c[0], c[1], c[2]);
    const z = st[ST.Z] + r.z;
    if (z < worst) {
      worst = z;
    }
  }
  return worst;
}

function sameState(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

{
  const sim = await fresh();
  need(sim, 'sim_contact');
  need(sim, 'sim_set_ground');
  need(sim, 'sim_ground_contacts');
  need(sim, 'sim_set_crashflip');
  need(sim, 'sim_crashflip_active');
  need(sim, 'sim_set_pose');
  console.log('contact selftest');
  check('exports are present', true);
}

{
  const sim = await fresh();
  /* Seat 1.5 m up, identity quat, then a grass plane through z = 0.
   * Motors off: airmode at stick-idle is not a drop. */
  check('sim_set_pose seats the drop',
    sim.e.sim_set_pose(0, 0, 1.5, 1, 0, 0, 0) === SIM_OK);
  sim.rest();
  sim.motorOverride(-1, 0);
  check('sim_set_ground raises the plane',
    grass(sim) === SIM_OK);
  const mid = hold(sim, 400, { throttle: 0 });
  check('the drop has left the start height',
    mid[ST.Z] < 1.2, `z=${mid[ST.Z].toFixed(3)}`);
  const st = hold(sim, 1600, { throttle: 0 });
  const hits = sim.e.sim_ground_contacts();
  check('a 2 s drop has met the plane',
    hits > 0 || st[ST.Z] < 0.12, `z=${st[ST.Z].toFixed(3)} hits=${hits}`);
  check('it settles instead of bouncing forever',
    Math.abs(st[ST.VZ]) < 0.15 && omegaMag(st) < 0.4,
    `vz=${st[ST.VZ].toFixed(3)} w=${omegaMag(st).toFixed(3)} z=${st[ST.Z].toFixed(3)}`);
  check('the hull sits near REST_HEIGHT, not underground',
    st[ST.Z] > 0.02 && st[ST.Z] < 0.12, `z=${st[ST.Z].toFixed(3)}`);
}

{
  const sim = await fresh();
  /* 25 deg roll about body x: qw = cos(12.5 deg), qx = sin(12.5 deg). */
  const h = 25 * Math.PI / 360;
  const qw = Math.cos(h);
  const qx = Math.sin(h);
  sim.e.sim_set_pose(0, 0, 1.2, qw, qx, 0, 0);
  sim.rest();
  sim.motorOverride(-1, 0);
  grass(sim);
  let peakW = 0;
  let t = sim.readState().state[ST.T];
  for (let i = 0; i < 700; i += 1) {
    t += 0.001;
    sim.input(t, 0, 0, 0, 0);
    sim.step(1);
    const w = omegaMag(sim.readState().state);
    if (w > peakW) {
      peakW = w;
    }
  }
  const st = sim.readState().state;
  check('a tilted drop produces spin on first contact',
    peakW > 0.4, `peakW=${peakW.toFixed(3)}`);
  check('then the belly settles instead of keeping the tumble',
    omegaMag(st) < 1.5 && Math.abs(st[ST.VZ]) < 0.25,
    `w=${omegaMag(st).toFixed(3)} vz=${st[ST.VZ].toFixed(3)} z=${st[ST.Z].toFixed(3)}`);
}

{
  const sim = await fresh();
  sim.e.sim_set_pose(0, 0, 4.0, 1, 0, 0, 0);
  sim.rest();
  sim.motorOverride(-1, 0);
  grass(sim);
  const st = hold(sim, 2500, { throttle: 0 });
  check('a hard drop stays finite',
    Number.isFinite(st[ST.Z]) && Number.isFinite(st[ST.VZ]) && Number.isFinite(omegaMag(st)));
  check('and has dumped most of the fall',
    Math.abs(st[ST.VZ]) < 0.25, `vz=${st[ST.VZ].toFixed(3)} z=${st[ST.Z].toFixed(3)}`);
}

{
  const sim = await fresh();
  sim.e.sim_set_pose(0, 0, 0.5, 1, 0, 0, 0);
  sim.rest();
  /* Wall at -x, outward n = +x, surface coming at +8 m/s. Support vertex
   * is a hull corner, so the impulse has a lever arm. */
  const code = sim.e.sim_contact(1, 0, 0, 0.32, 0.38, 0, 0, 0.5, 8, 0, 0);
  check('sim_contact accepts a unit wall', code === SIM_OK);
  const st = sim.readState().state;
  check('an offset wall hit produces spin',
    omegaMag(st) > 0.5, `w=${omegaMag(st).toFixed(3)}`);
  check('and shoves the hull along the normal',
    st[ST.VX] > 0.5, `vx=${st[ST.VX].toFixed(3)}`);
}

{
  const sim = await fresh();
  /* Inverted: 180 deg about x. Rest the hull just above a plane. */
  sim.e.sim_set_pose(0, 0, 0.08, 0, 1, 0, 0);
  sim.rest();
  grass(sim);
  hold(sim, 200, { throttle: 0 });
  const before = sim.readState().state;
  check('the seated hull is inverted',
    upZ(before) < -0.7, `upz=${upZ(before).toFixed(3)}`);
  check('crashflip latches',
    sim.e.sim_set_crashflip(1) === SIM_OK && sim.e.sim_crashflip_active() === 1);
  hold(sim, 80, { pitch: 1 });
  const rpmA = sim.readState().state;
  const rpms = [rpmA[ST.RPM0], rpmA[ST.RPM0 + 1], rpmA[ST.RPM0 + 2], rpmA[ST.RPM0 + 3]];
  const rpmMax = Math.max(...rpms);
  const rpmMin = Math.min(...rpms);
  check('crashflip with pitch splits the motors',
    rpmMax > rpmMin + 200, `rpm=${rpms.map((n) => n.toFixed(0)).join(',')}`);

  /* Fresh inverted pose on the plane, then a long pitch hold. Pitch
   * negative is the mixer sign that raises this airframe; the other
   * sign is still tried so a mixer-table change cannot silently skip
   * the proof. */
  const simB = await fresh();
  simB.e.sim_set_pose(0, 0, 0.08, 0, 1, 0, 0);
  simB.rest();
  simB.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, 0.55, 0.28);
  hold(simB, 250, { throttle: 0 });
  simB.e.sim_set_crashflip(1);
  const startUp = upZ(simB.readState().state);
  const pos = turtleHold(simB, 1800, { pitch: -1 });
  const simC = await fresh();
  simC.e.sim_set_pose(0, 0, 0.08, 0, 1, 0, 0);
  simC.rest();
  simC.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, 0.55, 0.28);
  hold(simC, 250, { throttle: 0 });
  simC.e.sim_set_crashflip(1);
  const neg = turtleHold(simC, 1800, { pitch: 1 });
  const best = pos.peakUp > neg.peakUp ? pos : neg;
  check('turtle pitch raises the hull toward upright',
    best.peakUp > startUp + 0.35, `start=${startUp.toFixed(3)} peak=${best.peakUp.toFixed(3)}`);
  check('and it crosses out of inverted',
    best.peakUp > 0, `peak=${best.peakUp.toFixed(3)}`);
  check('turtle does not clip the hull through the plane',
    best.worstCorner > -HULL_SLOP - 0.001,
    `corner=${best.worstCorner.toFixed(4)}`);
}

{
  const a = await fresh();
  const b = await fresh();
  /* Neither calls sim_set_ground. Identical free-air drop. */
  hold(a, 500, { throttle: 0 });
  hold(b, 500, { throttle: 0 });
  const sa = a.readState().state;
  const sb = b.readState().state;
  let same = true;
  for (let i = 0; i < sa.length; i += 1) {
    if (sa[i] !== sb[i]) {
      same = false;
      break;
    }
  }
  check('two free-air drops match bit for bit', same);
  check('free air has no floor: the craft has fallen',
    sa[ST.Z] < -0.5, `z=${sa[ST.Z].toFixed(3)}`);
  /* Calling set_ground(0) must not introduce a plane. */
  const c = await fresh();
  check('sim_set_ground(0) is a no-op',
    c.e.sim_set_ground(0, 0, 0, 1, 0, 0, 0, 0, 0) === SIM_OK);
  hold(c, 500, { throttle: 0 });
  const sc = c.readState().state;
  let sameOff = true;
  for (let i = 0; i < sa.length; i += 1) {
    if (sa[i] !== sc[i]) {
      sameOff = false;
      break;
    }
  }
  check('set_ground(0) matches a replay that never called it', sameOff);
  /* A plane 100 m below must not touch a 0.5 s drop from the origin. */
  const d = await fresh();
  d.e.sim_set_ground(1, 0, 0, 1, 0, 0, -100, GROUND_MU, GROUND_E);
  hold(d, 500, { throttle: 0 });
  const sd = d.readState().state;
  check('a distant plane does not change a short free-air drop',
    Math.abs(sd[ST.Z] - sa[ST.Z]) < 1e-9 && d.e.sim_ground_contacts() === 0,
    `z=${sd[ST.Z].toFixed(6)} vs ${sa[ST.Z].toFixed(6)} hits=${d.e.sim_ground_contacts()}`);
}

{
  const a = await fresh();
  const b = await fresh();
  a.e.sim_set_pose(0, 0, 1.2, 1, 0, 0, 0);
  b.e.sim_set_pose(0, 0, 1.2, 1, 0, 0, 0);
  a.rest();
  b.rest();
  a.motorOverride(-1, 0);
  b.motorOverride(-1, 0);
  grass(a);
  grass(b);
  hold(a, 900, { throttle: 0 });
  hold(b, 900, { throttle: 0 });
  check('two grounded drops match bit for bit',
    sameState(a.readState().state, b.readState().state));
}

{
  const sim = await fresh();
  /* Seat first, then shove, so the slide is on the grass, not in the air. */
  sim.e.sim_set_pose(0, 0, 0.045, 1, 0, 0, 0);
  sim.rest();
  sim.motorOverride(-1, 0);
  grass(sim);
  hold(sim, 20, { throttle: 0 });
  const seated = sim.readState().state;
  sim.e.sim_contact(1, 0, 0, 0.0, 0.0, seated[ST.X], seated[ST.Y], seated[ST.Z], 8, 0, 0);
  const launched = sim.readState().state;
  const vx0 = launched[ST.VX];
  const x0 = launched[ST.X];
  check('a seated shove leaves the hull with speed along the grass',
    vx0 > 2, `vx=${vx0.toFixed(3)}`);
  grass(sim);
  const early = hold(sim, 20, { throttle: 0 });
  check('a belly landing still slides a little at first',
    early[ST.VX] > 0.15, `vx=${early[ST.VX].toFixed(3)} z=${early[ST.Z].toFixed(3)}`);
  const st = hold(sim, 180, { throttle: 0 });
  check('then grass dumps the slide instead of skating',
    Math.abs(st[ST.VX]) < 0.15, `vx0=${vx0.toFixed(3)} vx=${st[ST.VX].toFixed(3)}`);
  check('the belly slide is short',
    Math.abs(st[ST.X] - x0) < 0.40, `dx=${(st[ST.X] - x0).toFixed(3)}`);
  check('the sliding hull stays on the plane',
    st[ST.Z] > 0.02 && st[ST.Z] < 0.16, `z=${st[ST.Z].toFixed(3)}`);
}

{
  const sim = await fresh();
  sim.e.sim_set_pose(0, 0, 0.5, 1, 0, 0, 0);
  sim.rest();
  sim.motorOverride(-1, 0);
  /* Impart inbound speed toward -x, then hit a wall whose outward normal
   * is +x: the bounce has to reverse the closing component. */
  sim.e.sim_contact(-1, 0, 0, 0.12, 0.20, 0, 0, 0.5, -16, 0, 0);
  const inbound = sim.readState().state;
  check('the inbound shove is toward the wall',
    inbound[ST.VX] < -4, `vx=${inbound[ST.VX].toFixed(3)}`);
  sim.e.sim_contact(1, 0, 0, 0.38, 0.28, 0, 0, 0.5, 0, 0, 0);
  const out = sim.readState().state;
  check('the bounce is relative to the wall normal',
    out[ST.VX] > 0, `vx=${out[ST.VX].toFixed(3)} in=${inbound[ST.VX].toFixed(3)}`);
  check('a racing-speed hit dumps energy instead of pinballing',
    Math.abs(out[ST.VX]) < Math.abs(inbound[ST.VX]) * 0.85,
    `in=${inbound[ST.VX].toFixed(3)} out=${out[ST.VX].toFixed(3)}`);
}

{
  const sim = await fresh();
  /* 90 deg roll: on its side. Single-support, not a four-leg table. */
  const h = Math.PI / 4;
  const qw = Math.cos(h);
  const qx = Math.sin(h);
  sim.e.sim_set_pose(0, 0, 0.35, qw, qx, 0, 0);
  sim.rest();
  sim.motorOverride(-1, 0);
  grass(sim);
  hold(sim, 350, { throttle: 0 });
  const st = sim.readState().state;
  check('a side arrival rolls instead of locking attitude',
    omegaMag(st) > 0.5, `w=${omegaMag(st).toFixed(3)} upz=${upZ(st).toFixed(3)} z=${st[ST.Z].toFixed(3)}`);
  check('and stays finite while it rolls',
    Number.isFinite(st[ST.Z]) && Number.isFinite(omegaMag(st)) && Math.abs(st[ST.Z]) < 2);
}

{
  const sim = await fresh();
  sim.e.sim_set_pose(0, 0, 0.08, 0, 1, 0, 0);
  sim.rest();
  grass(sim);
  const st = hold(sim, 1800, { throttle: 0 });
  check('inverted on the grass with airmode still settles enough to turtle',
    speedMag(st) < 4 && upZ(st) < 0, `v=${speedMag(st).toFixed(3)} upz=${upZ(st).toFixed(3)}`);
  check('inverted rest leaves no hull corner under the plane',
    deepestHullCorner(st) > -HULL_SLOP - 0.001,
    `corner=${deepestHullCorner(st).toFixed(4)} z=${st[ST.Z].toFixed(4)}`);
  check('inverted rest leaves the camera glass on the plane',
    cameraPlantZ(st) > -HULL_SLOP - 0.001,
    `cam=${cameraPlantZ(st).toFixed(4)} z=${st[ST.Z].toFixed(4)}`);
}

{
  /* Continue from a completed turtle: drop crashflip, punch, climb. */
  const sim = await fresh();
  sim.e.sim_set_pose(0, 0, 0.08, 0, 1, 0, 0);
  sim.rest();
  grass(sim);
  hold(sim, 250, { throttle: 0 });
  sim.e.sim_set_crashflip(1);
  let flip = turtleHold(sim, 1800, { pitch: -1 });
  if (!(flip.peakUp > 0)) {
    flip = turtleHold(sim, 1800, { pitch: 1 });
  }
  check('turtle reached a non-inverted pose before takeoff',
    flip.peakUp > 0, `peak=${flip.peakUp.toFixed(3)}`);
  /* Crashflip off, seat upright on the pad. The mixer couple is allowed
   * to keep tumbling once the hull leaves the grass; the old "near"
   * flag damped that in free air and left a lucky upright pose. */
  sim.e.sim_set_crashflip(0);
  sim.e.sim_set_pose(0, 0, 0.045, 1, 0, 0, 0);
  sim.rest();
  const z0 = sim.readState().state[ST.Z];
  const up0 = upZ(sim.readState().state);
  const flown = hold(sim, 700, { throttle: 1 });
  check('after turtle, throttle is flight again',
    flown[ST.Z] > z0 + 0.15 || speedMag(flown) > 1.5,
    `z0=${z0.toFixed(3)} z=${flown[ST.Z].toFixed(3)} v=${speedMag(flown).toFixed(3)} up0=${up0.toFixed(3)} up=${upZ(flown).toFixed(3)}`);
}

{
  const sim = await fresh();
  sim.e.sim_set_pose(0, 0, 1.5, 0, 1, 0, 0);
  sim.rest();
  sim.motorOverride(-1, 0);
  grass(sim);
  let worst = Infinity;
  let t = sim.readState().state[ST.T];
  for (let i = 0; i < 2000; i += 1) {
    t += 0.001;
    sim.input(t, 0, 0, 0, 0);
    sim.step(1);
    const corner = deepestHullCorner(sim.readState().state);
    if (corner < worst) {
      worst = corner;
    }
  }
  const st = sim.readState().state;
  check('an inverted slam CG stays above the plane',
    st[ST.Z] > -0.02, `z=${st[ST.Z].toFixed(4)}`);
  check('an inverted slam never puts a hull corner through the plane',
    worst > -HULL_SLOP - 0.001, `worst=${worst.toFixed(4)} z=${st[ST.Z].toFixed(4)}`);
}

{
  const sim = await fresh();
  sim.e.sim_set_pose(0, 0, 0.08, 0, 1, 0, 0);
  sim.rest();
  grass(sim);
  hold(sim, 200, { throttle: 0 });
  let worst = Infinity;
  let t = sim.readState().state[ST.T];
  for (let i = 0; i < 800; i += 1) {
    t += 0.001;
    sim.input(t, 0, 0, 0, 1);
    sim.step(1);
    const corner = deepestHullCorner(sim.readState().state);
    if (corner < worst) {
      worst = corner;
    }
  }
  const st = sim.readState().state;
  check('inverted full throttle does not punch the CG through the plane',
    st[ST.Z] > -0.02, `z=${st[ST.Z].toFixed(4)}`);
  check('inverted full throttle leaves no hull corner under the plane',
    worst > -HULL_SLOP - 0.001, `worst=${worst.toFixed(4)} z=${st[ST.Z].toFixed(4)}`);
}

{
  const sim = await fresh();
  /* 180 about x then 35 deg about y: bump contact holds the CG, the
   * free corners used to sit under the plane. */
  const a = 35 * Math.PI / 360;
  const qw2 = Math.cos(a);
  const qy2 = Math.sin(a);
  sim.e.sim_set_pose(0, 0, 0.12, 0, qw2, 0, -qy2);
  sim.rest();
  sim.motorOverride(-1, 0);
  grass(sim);
  let worst = Infinity;
  let t = sim.readState().state[ST.T];
  for (let i = 0; i < 800; i += 1) {
    t += 0.001;
    sim.input(t, 0, 0, 0, 0);
    sim.step(1);
    const corner = deepestHullCorner(sim.readState().state);
    if (corner < worst) {
      worst = corner;
    }
  }
  const st = sim.readState().state;
  check('an angled inverted rest never puts a hull corner through the plane',
    worst > -HULL_SLOP - 0.001, `worst=${worst.toFixed(4)} z=${st[ST.Z].toFixed(4)}`);
}

{
  const sim = await fresh();
  /* Already underground: the plant must lift the hull in one step. */
  sim.e.sim_set_pose(0, 0, -1.0, 0, 1, 0, 0);
  sim.rest();
  sim.motorOverride(-1, 0);
  grass(sim);
  sim.step(1);
  const st = sim.readState().state;
  check('a hull seated a metre underground is projected onto the plane in one step',
    st[ST.Z] > -0.02 && deepestHullCorner(st) > -HULL_SLOP - 0.001,
    `z=${st[ST.Z].toFixed(4)} corner=${deepestHullCorner(st).toFixed(4)}`);
}

{
  const sim = await fresh();
  sim.e.sim_set_pose(0, 0, 0.08, 0, 1, 0, 0);
  sim.rest();
  grass(sim);
  hold(sim, 250, { throttle: 0 });
  sim.e.sim_set_crashflip(1);
  let worst = Infinity;
  let t = sim.readState().state[ST.T];
  for (let i = 0; i < 1800; i += 1) {
    t += 0.001;
    sim.input(t, 0, -1, 0, 0);
    sim.step(1);
    const corner = deepestHullCorner(sim.readState().state);
    if (corner < worst) {
      worst = corner;
    }
  }
  check('turtle rotation never sweeps a corner through the plane',
    worst > -HULL_SLOP - 0.001, `worst=${worst.toFixed(4)}`);
}

{
  const sim = await fresh();
  sim.e.sim_set_pose(0, 0, 0.5, 1, 0, 0, 0);
  sim.rest();
  sim.motorOverride(-1, 0);
  sim.e.sim_contact(-1, 0, 0, 0.12, 0.20, 0, 0, 0.5, -10, 0, 0);
  const inbound = sim.readState().state;
  const code = sim.e.sim_deflect(1, 0, 0, 0.35, 0.5, 0.5, 0, 0, 0.5);
  check('sim_deflect still exists as a wrapper', code === SIM_OK);
  const st = sim.readState().state;
  check('and still produces an offset impulse',
    omegaMag(st) > 0.2 && st[ST.VX] > inbound[ST.VX],
    `w=${omegaMag(st).toFixed(3)} vx=${st[ST.VX].toFixed(3)} in=${inbound[ST.VX].toFixed(3)}`);
}

{
  const sim = await fresh();
  /* Drop, motors off, record outbound vz after first contact. */
  sim.e.sim_set_pose(0, 0, 1.5, 1, 0, 0, 0);
  sim.rest();
  sim.motorOverride(-1, 0);
  grass(sim);
  let hit = false;
  let peakOut = 0;
  let t = sim.readState().state[ST.T];
  for (let i = 0; i < 2000; i += 1) {
    t += 0.001;
    sim.input(t, 0, 0, 0, 0);
    sim.step(1);
    const stNow = sim.readState().state;
    if (sim.e.sim_ground_contacts() > 0) {
      hit = true;
    }
    if (hit && stNow[ST.VZ] > peakOut) {
      peakOut = stNow[ST.VZ];
    }
  }
  check('an upright drop is a dead thump, not a bounce',
    hit && peakOut < 0.25, `peakOut=${peakOut.toFixed(3)} hit=${hit}`);
}

{
  const sim = await fresh();
  sim.e.sim_set_pose(0, 0, 0.02, 0, 1, 0, 0);
  sim.rest();
  sim.motorOverride(-1, 0);
  grass(sim);
  hold(sim, 10, { throttle: 0 });
  const seated = sim.readState().state;
  check('the inverted seat is on the grass before the shove',
    upZ(seated) < -0.7 && deepestHullCorner(seated) > -HULL_SLOP - 0.001
      && deepestHullCorner(seated) < 0.01,
    `upz=${upZ(seated).toFixed(3)} corner=${deepestHullCorner(seated).toFixed(4)} hits=${sim.e.sim_ground_contacts()}`);
  sim.e.sim_contact(1, 0, 0, 0.0, 0.0, seated[ST.X], seated[ST.Y], seated[ST.Z], 8, 0, 0);
  const vx0 = sim.readState().state[ST.VX];
  const x0 = sim.readState().state[ST.X];
  grass(sim);
  const st = hold(sim, 5, { throttle: 0 });
  check('props-down keeps the inbound shove long enough to prove it',
    vx0 > 2, `vx0=${vx0.toFixed(3)}`);
  check('props-down stops immediately instead of sliding',
    speedMag(st) < 0.12, `v=${speedMag(st).toFixed(3)} vx0=${vx0.toFixed(3)}`);
  check('and it does not travel',
    Math.abs(st[ST.X] - x0) < 0.03, `dx=${(st[ST.X] - x0).toFixed(4)}`);
  check('and the inverted hull stays on the plane',
    deepestHullCorner(st) > -HULL_SLOP - 0.001
      && cameraPlantZ(st) > -HULL_SLOP - 0.001,
    `corner=${deepestHullCorner(st).toFixed(4)} cam=${cameraPlantZ(st).toFixed(4)}`);
}

{
  const sim = await fresh();
  /* 90 deg nose down about plant y: the lens sits 10 cm below the CG. */
  const h = Math.PI / 4;
  sim.e.sim_set_pose(0, 0, 0.20, Math.cos(h), 0, Math.sin(h), 0);
  sim.rest();
  sim.motorOverride(-1, 0);
  grass(sim);
  let worstCam = Infinity;
  let t = sim.readState().state[ST.T];
  for (let i = 0; i < 800; i += 1) {
    t += 0.001;
    sim.input(t, 0, 0, 0, 0);
    sim.step(1);
    const cam = cameraPlantZ(sim.readState().state);
    if (cam < worstCam) {
      worstCam = cam;
    }
  }
  const st = sim.readState().state;
  check('a camera-down rest never puts the lens through the plane',
    worstCam > -HULL_SLOP - 0.001,
    `worstCam=${worstCam.toFixed(4)} z=${st[ST.Z].toFixed(4)} cam=${cameraPlantZ(st).toFixed(4)}`);
}

{
  const sim = await fresh();
  /* Seated on the pad, motors live, full throttle. The old settle killed
   * every outbound normal while the hull was in the contact band, so a
   * punch crawled a fraction of a millimetre per step with the motors
   * at the stops. */
  sim.e.sim_set_pose(0, 0, 0.045, 1, 0, 0, 0);
  sim.rest();
  grass(sim);
  let leftAt = -1;
  let t = sim.readState().state[ST.T];
  let st = sim.readState().state;
  for (let i = 0; i < 500; i += 1) {
    t += 0.001;
    sim.input(t, 0, 0, 0, 1);
    sim.step(1);
    st = sim.readState().state;
    if (leftAt < 0 && st[ST.Z] > 0.12) {
      leftAt = i + 1;
    }
  }
  check('a seated punch leaves the pad instead of crawling',
    leftAt > 0 && leftAt < 200,
    `leftAt=${leftAt}ms z=${st[ST.Z].toFixed(3)} vz=${st[ST.VZ].toFixed(3)}`);
  check('and is climbing after half a second',
    st[ST.Z] > 0.5 && st[ST.VZ] > 1.0,
    `z=${st[ST.Z].toFixed(3)} vz=${st[ST.VZ].toFixed(3)} leftAt=${leftAt}ms`);
  check('the takeoff hull is still upright',
    upZ(st) > 0.7, `upz=${upZ(st).toFixed(3)}`);
}

{
  const sim = await fresh();
  /* Inverted four metres up, plane at z = 0. The old projector started
   * worst at 0, so every airborne hull looked "near" and invert-stop
   * zeroed vel and omega the moment body-up went negative. */
  sim.e.sim_set_pose(0, 0, 4.0, 0, 1, 0, 0);
  sim.rest();
  grass(sim);
  const seated = sim.readState().state;
  sim.e.sim_contact(1, 0, 0, 0.0, 0.0, seated[ST.X], seated[ST.Y], seated[ST.Z], 6, 0, 0);
  const launched = sim.readState().state;
  check('the air invert starts with a horizontal shove',
    launched[ST.VX] > 2 && upZ(launched) < -0.7,
    `vx=${launched[ST.VX].toFixed(3)} upz=${upZ(launched).toFixed(3)}`);
  const st = hold(sim, 40, { throttle: 0 });
  check('an inverted flip in free air does not freeze',
    speedMag(st) > 1.5 && st[ST.Z] > 3.5,
    `v=${speedMag(st).toFixed(3)} z=${st[ST.Z].toFixed(3)} vz=${st[ST.VZ].toFixed(3)}`);
  check('and the distant plane reports no contact',
    sim.e.sim_ground_contacts() === 0,
    `hits=${sim.e.sim_ground_contacts()} z=${st[ST.Z].toFixed(3)}`);
}

{
  const sim = await fresh();
  /* Upright leftover roll, same distant plane. Belly omega damp must
   * not run just because a floor exists. */
  sim.e.sim_set_pose(0, 0, 4.0, 1, 0, 0, 0);
  sim.rest();
  grass(sim);
  const seated = sim.readState().state;
  sim.e.sim_contact(1, 0, 0, 0.32, 0.38, seated[ST.X], seated[ST.Y], seated[ST.Z], 8, 0, 0);
  const spun = sim.readState().state;
  const w0 = omegaMag(spun);
  check('the air roll starts with leftover rate',
    w0 > 0.8, `w0=${w0.toFixed(3)}`);
  const st = hold(sim, 40, { throttle: 0 });
  check('a roll in free air does not kill leftover omega',
    omegaMag(st) > 0.4 && st[ST.Z] > 3.5,
    `w=${omegaMag(st).toFixed(3)} w0=${w0.toFixed(3)} z=${st[ST.Z].toFixed(3)}`);
}

{
  const sim = await fresh();
  /* 135 deg roll, CG ~18 cm up: a corner enters the 8 mm halo before
   * any hit. Invert-stop used to zero vel and omega there, with the
   * CG still a decimetre off the grass. */
  const h = 135 * Math.PI / 360;
  sim.e.sim_set_pose(0, 0, 0.18, Math.cos(h), Math.sin(h), 0, 0);
  sim.rest();
  grass(sim);
  const seated = sim.readState().state;
  sim.e.sim_contact(1, 0, 0, 0.32, 0.38, seated[ST.X], seated[ST.Y], seated[ST.Z], 8, 0, 0);
  const spun = sim.readState().state;
  const w0 = omegaMag(spun);
  let haloFreeze = false;
  let t = spun[ST.T];
  let st = spun;
  for (let i = 0; i < 120; i += 1) {
    t += 0.001;
    sim.input(t, 0, 0, 0, 0);
    sim.step(1);
    st = sim.readState().state;
    const corner = deepestHullCorner(st);
    if (speedMag(st) < 0.05 && omegaMag(st) < 0.05 && corner > HULL_SLOP + 0.001) {
      haloFreeze = true;
      break;
    }
  }
  check('a 135 deg flip starts with leftover rate',
    w0 > 8, `w0=${w0.toFixed(3)}`);
  check('and does not freeze in the 8 mm halo before the hull meets the plane',
    !haloFreeze,
    `haloFreeze=${haloFreeze} w=${omegaMag(st).toFixed(3)} z=${st[ST.Z].toFixed(3)} corner=${deepestHullCorner(st).toFixed(4)} upz=${upZ(st).toFixed(3)}`);
}

{
  const sim = await fresh();
  check('sim_contact rejects a non-unit normal',
    sim.e.sim_contact(2, 0, 0, 0.3, 0.3, 0, 0, 0, 0, 0, 0) !== SIM_OK);
  check('sim_contact rejects mu out of range',
    sim.e.sim_contact(1, 0, 0, 0.3, 3, 0, 0, 0, 0, 0, 0) !== SIM_OK);
  check('sim_set_ground rejects a zero normal',
    sim.e.sim_set_ground(1, 0, 0, 0, 0, 0, 0, 0.5, 0.3) !== SIM_OK);
}

{
  const sim = await loadSim(wasm);
  check('sim_set_crashflip refuses a module that was never inited',
    sim.e.sim_set_crashflip(1) !== SIM_OK);
}

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall contact checks passed');
