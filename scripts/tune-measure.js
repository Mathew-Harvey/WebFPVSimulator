/*
 * tune-measure.js: what the two flight feel tuning sliders do to the flight,
 * measured off the compiled module, so that a band is chosen from numbers.
 *
 * Read only. It measures, it does not tune, and nothing here is a band.
 *
 * Usage, from the simulator root:
 *   node scripts/tune-measure.js [--airframe=5inch|whoop65] [--sweep=air|kv]
 *
 *   --sweep=air   Air grip, 50 to 175 percent, through sim_set_air.
 *   --sweep=kv    Motor power, 80 to 120 percent, through sim_set_motor_kv.
 *                 Reports "not in this build" on a module without it.
 *
 * Every row is a fresh module at the machine the shell flies, which is the
 * airframe's own gravity base (configs/airframes.js) on the five inch plant
 * (both airframes carry simId 0) and the verification fixture's tune, so a
 * row at 100 is the stock quad and every other row is the stock quad with
 * one number moved.
 *
 * WHAT IS MEASURED, and why these.
 *
 *   hover     the throttle that holds altitude, by bisection on the climb
 *             rate. Air grip must not move it (the air only slows the craft
 *             down), Motor power does.
 *   coast     the hands off carry, in ANGLE mode so the craft levels itself:
 *             accelerate to 20 m/s, centre the sticks at hover throttle, and
 *             time and measure the run down to half that speed. This is what
 *             "momentum" means to a pilot, and what Air grip is for. The
 *             level out is part of it: the craft is tilted forward when the
 *             sticks come back. A row that cannot reach 20 m/s says so and
 *             coasts from where it got.
 *   flat out  the fastest level speed in angle mode with altitude held.
 *   punch     from a hover, full throttle for a second: the speed climbed to
 *             and the height gained. This is what Motor power is for.
 *
 * Determinism is not at stake here: the numbers are for a person to read.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const AIRFRAME = flag('airframe', '5inch');
const SWEEP = flag('sweep', 'air');
const ST = { T: 0, X: 1, Y: 2, Z: 3, VX: 4, VY: 5, VZ: 6 };

if (!['air', 'kv'].includes(SWEEP)) {
  throw new Error(`--sweep=${SWEEP}: air or kv`);
}

/* The speed the coast starts from: one every row can reach, so the rows
 * compare. A row that cannot reach it says so and coasts from where it got. */
const COAST_FROM = 20;

const af = airframeById(AIRFRAME);
const GRAVITY = af.gravityBase;
const wasm = await readFile(join(root, 'dist/sim.wasm'));
/*
 * THE PLANT THE SHELL FLIES, which for the whoop is the five inch's: both
 * airframe entries carry simId 0, so the whoop is the five inch plant at its
 * own gravity base. This script used to select the module's own whoop plant
 * (airframe 1) with the maker's whoop tune for --airframe=whoop65, which the
 * shell does not fly, and every whoop figure it printed was a different
 * machine's. PROGRESS.md 2026-10-08 has the correction.
 *
 * THE TUNE is the verification fixture's, as the hover tables in
 * configs/rates.js are read, so that a row compares with another row and
 * with those tables. It is shorter than the shell's own default
 * (configs/betaflight-default.diff). Flown on that one instead, on
 * 2026-10-08, hover, flat out and the punch came out the same to the digit
 * and the hands off carry 1 to 3 percent shorter (Air grip 50, 100 and 150:
 * 54.2, 26.3 and 17.4 m against 54.8, 26.9 and 18.0).
 */
const config = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

/* A fresh module at the machine the shell flies, with one slider moved. */
async function fresh(air = 1, kv = 1) {
  const sim = await loadSim(wasm);
  if (sim.e.sim_set_airframe(af.simId) !== SIM_OK) {
    throw new Error('sim_set_airframe refused');
  }
  if (sim.e.sim_set_gravity(GRAVITY) !== SIM_OK) {
    throw new Error('sim_set_gravity refused');
  }
  if (air !== 1 && sim.e.sim_set_air(air) !== SIM_OK) {
    throw new Error(`sim_set_air(${air}) refused`);
  }
  if (kv !== 1) {
    if (typeof sim.e.sim_set_motor_kv !== 'function') {
      return null;
    }
    if (sim.e.sim_set_motor_kv(kv) !== SIM_OK) {
      throw new Error(`sim_set_motor_kv(${kv}) refused`);
    }
  }
  if (sim.init(config) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  return sim;
}

/* Drive the module one millisecond at a time with a controller. */
function run(sim, ms, control, onStep) {
  let t = sim.readState().state[ST.T];
  let st = sim.readState().state;
  for (let i = 0; i < ms; i += 1) {
    t += 0.001;
    const c = control(i, st);
    sim.input(t, c.roll || 0, c.pitch || 0, c.yaw || 0, c.throttle);
    sim.step(1);
    st = sim.readState().state;
    if (onStep && onStep(i, st) === false) {
      return st;
    }
  }
  return st;
}

/* The throttle that holds altitude, by bisection on the climb over a second. */
async function hoverThrottle(air, kv) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i += 1) {
    const mid = (lo + hi) / 2;
    const sim = await fresh(air, kv);
    run(sim, 2500, () => ({ throttle: mid }));
    const a = sim.readState().state[ST.Z];
    run(sim, 1000, () => ({ throttle: mid }));
    if (sim.readState().state[ST.Z] - a > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return (lo + hi) / 2;
}

const speedOf = (st) => Math.hypot(st[ST.VX], st[ST.VY]);

/* Altitude held on a PD around the hover estimate, an integral for the
 * error in it, throttle bounded to what a stick can ask. */
function altitudeHold(hover, target) {
  let integral = 0;
  return (st) => {
    const err = target - st[ST.Z];
    integral = Math.max(-0.15, Math.min(0.15, integral + err * 0.00002));
    return Math.min(1, Math.max(0.05, hover + integral + 0.07 * err - 0.05 * st[ST.VZ]));
  };
}

/*
 * The hands off carry, and the fastest level speed, from one run. Pitch
 * forward in angle mode with altitude held until 20 m/s, centre the sticks at
 * hover throttle and time the fall from 20 to 10 m/s; the flat out figure is
 * the speed the craft settles at holding the stick forward for twelve seconds.
 */
async function flyLevel(air, kv, hover) {
  const sim = await fresh(air, kv);
  if (sim.e.sim_set_angle_mode(1) !== SIM_OK) {
    throw new Error('sim_set_angle_mode refused');
  }
  const target = 6;
  const hold = altitudeHold(hover, target);
  /* Up and steady first. */
  run(sim, 3500, (i, st) => ({ throttle: i < 700 ? Math.min(1, hover + 0.25) : hold(st) }));
  /* Forward. The sign of pitch is the module's: find the forward axis by
   * the heading the speed comes up in, and use whatever is positive. */
  let reached = -1;
  let top = 0;
  run(sim, 12000, (i, st) => ({ pitch: 1, throttle: hold(st) }), (i, st) => {
    const v = speedOf(st);
    top = Math.max(top, v);
    if (reached < 0 && v >= COAST_FROM) {
      reached = i;
      return false;
    }
    return true;
  });
  const reachedAt20 = reached >= 0;
  /* If the speed is not reachable, coast from where it got to, and say so. */
  const from = reachedAt20 ? COAST_FROM : Math.floor(top * 0.9);
  const mid = from / 2;
  let tHalf = -1;
  let dHalf = 0;
  let x0 = null;
  let tNow = 0;
  let speed3 = null;
  const level = (st) => {
    if (x0 === null) {
      x0 = [st[ST.X], st[ST.Y]];
    }
  };
  const before = sim.readState().state;
  level(before);
  /* Wait until the speed is the starting figure if the climb overshot it. */
  run(sim, 6000, () => ({ throttle: hover }), (i, st) => {
    tNow = (i + 1) / 1000;
    if (speed3 === null && tNow >= 3) {
      speed3 = speedOf(st);
    }
    if (tHalf < 0 && speedOf(st) <= mid) {
      tHalf = tNow;
      dHalf = Math.hypot(st[ST.X] - x0[0], st[ST.Y] - x0[1]);
    }
    return tHalf < 0 || speed3 === null;
  });
  /* The flat out speed: stick held forward for twelve seconds, altitude held. */
  const sim2 = await fresh(air, kv);
  sim2.e.sim_set_angle_mode(1);
  const hold2 = altitudeHold(hover, target);
  run(sim2, 3500, (i, st) => ({ throttle: i < 700 ? Math.min(1, hover + 0.25) : hold2(st) }));
  let flat = 0;
  run(sim2, 14000, (i, st) => ({ pitch: 1, throttle: hold2(st) }), (i, st) => {
    if (i > 9000) {
      flat = Math.max(flat, speedOf(st));
    }
    return true;
  });
  return {
    from, tHalf, dHalf, speed3, flat, reachedAt20,
  };
}

/* From a hover, full throttle for a second. */
async function punch(air, kv, hover) {
  const sim = await fresh(air, kv);
  const hold = altitudeHold(hover, 10);
  run(sim, 6000, (i, st) => ({ throttle: i < 900 ? Math.min(1, hover + 0.3) : hold(st) }));
  const z0 = sim.readState().state[ST.Z];
  let vmax = 0;
  run(sim, 1000, () => ({ throttle: 1 }), (i, st) => {
    vmax = Math.max(vmax, st[ST.VZ]);
    return true;
  });
  const z1 = sim.readState().state[ST.Z];
  return { vmax, gained: z1 - z0 };
}

const pcts = SWEEP === 'air'
  ? [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 175]
  : [80, 85, 90, 95, 100, 105, 110, 115, 120];

console.log(`\n${SWEEP === 'air' ? 'AIR GRIP' : 'MOTOR POWER'} on the ${af.short}, gravity ${GRAVITY}, off dist/sim.wasm\n`);
const head = ['pct', 'hover', 'coast from', 'to half', 'carried', 'speed at 3 s', 'flat out', 'punch v', 'punch up'];
console.log(head.map((h, i) => (i === 0 ? h.padStart(4) : h.padStart(13))).join(''));
let base = null;
for (const pct of pcts) {
  const air = SWEEP === 'air' ? pct / 100 : 1;
  const kv = SWEEP === 'kv' ? pct / 100 : 1;
  const probe = await fresh(air, kv);
  if (probe === null) {
    console.log('Motor power is not in this build of the module (no sim_set_motor_kv).');
    break;
  }
  const hover = await hoverThrottle(air, kv);
  const lv = await flyLevel(air, kv, hover);
  const pu = await punch(air, kv, hover);
  const cells = [
    String(pct).padStart(4),
    hover.toFixed(3).padStart(13),
    `${lv.from.toFixed(0)} m/s`.padStart(13),
    (lv.tHalf < 0 ? 'no' : `${lv.tHalf.toFixed(2)} s`).padStart(13),
    (lv.tHalf < 0 ? 'no' : `${lv.dHalf.toFixed(1)} m`).padStart(13),
    (lv.speed3 === null ? 'no' : `${lv.speed3.toFixed(1)} m/s`).padStart(13),
    `${(lv.flat * 3.6).toFixed(0)} km/h`.padStart(13),
    `${pu.vmax.toFixed(1)} m/s`.padStart(13),
    `${pu.gained.toFixed(1)} m`.padStart(13),
  ];
  if (pct === 100) {
    base = { lv, pu, hover };
  }
  console.log(cells.join(''));
}
if (base) {
  console.log(`\nstock: hover ${base.hover.toFixed(3)}, coast ${base.lv.from.toFixed(0)} to ${(base.lv.from / 2).toFixed(0)} m/s in ${base.lv.tHalf.toFixed(2)} s over ${base.lv.dHalf.toFixed(1)} m`);
}
