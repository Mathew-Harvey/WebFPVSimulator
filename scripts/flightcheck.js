/*
 * flightcheck.js: measure the quad's flight characteristics off the compiled
 * module and put them next to STAGE1.md's declared reference airframe.
 *
 * npm run verify already bands eight of these. This exists for the two things
 * a band cannot tell you: what the numbers ARE, and whether the code still
 * agrees with the airframe the project says it is modelling. A check that is
 * inside its band can still be modelling a different aircraft from the one in
 * the specification, and that is exactly what this found.
 *
 * Read only. It measures, it does not tune.
 *
 * Usage, from the simulator root:  node scripts/flightcheck.js
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
import { THROTTLE_CAP_CHOICES } from '../configs/rates.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const G = 9.80665;
const MASS = 0.71;

/* State indices, sim_abi.h. */
const ST = { T: 0, Z: 3, VX: 4, VZ: 6, P: 11, RPM0: 14, V: 18, I: 19 };

const wasm = await readFile(join(root, 'dist/sim.wasm'));
const config = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

async function fresh(cellV = 4.2) {
  const sim = await loadSim(wasm);
  if (sim.init(config) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(cellV);
  return sim;
}

/* Hold a stick set for ms milliseconds, sampling every step. */
function hold(sim, ms, sticks, onStep) {
  const s = { roll: 0, pitch: 0, yaw: 0, throttle: 0, ...sticks };
  let t = sim.readState().state[ST.T];
  for (let i = 0; i < ms; i += 1) {
    t += 0.001;
    sim.input(t, s.roll, s.pitch, s.yaw, s.throttle);
    sim.step(1);
    if (onStep) {
      onStep(i, sim.readState().state);
    }
  }
  return sim.readState().state;
}

/* Steady climb rate after settling at a fixed throttle, m/s. */
async function climbAt(throttle) {
  const sim = await fresh();
  hold(sim, 2500, { throttle });
  const a = sim.readState().state[ST.Z];
  hold(sim, 1000, { throttle });
  const b = sim.readState().state[ST.Z];
  return b - a;
}

/* The throttle that holds altitude, by bisection on the climb rate. */
async function hoverThrottle() {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i += 1) {
    const mid = (lo + hi) / 2;
    if (await climbAt(mid) > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return (lo + hi) / 2;
}

const rows = [];
function row(what, measured, declared, note) {
  rows.push({ what, measured, declared, note });
}

/* ---- static thrust, from the motors alone ---- */
const bench = await fresh();
bench.motorOverride(-1, 1.0);
hold(bench, 3000, { throttle: 0 });
const benchState = bench.readState().state;
const rpmFull = (benchState[ST.RPM0] + benchState[ST.RPM0 + 1]
  + benchState[ST.RPM0 + 2] + benchState[ST.RPM0 + 3]) / 4;
/* kt from plant.c. Thrust is kt * omega^2 per motor. */
const KT = 1.98e-6;
const wFull = rpmFull * Math.PI / 30;
const thrustFull = 4 * KT * wFull * wFull;
const twr = thrustFull / (MASS * G);
row('static thrust to weight', `${twr.toFixed(2)} : 1`, '4.5 : 1',
  twr > 5.5 ? 'MORE THAN DOUBLE THE SPEC' : '');
row('full throttle RPM, per motor', `${rpmFull.toFixed(0)}`, '', '');
row('pack under full load', `${benchState[ST.V].toFixed(1)} V, ${benchState[ST.I].toFixed(0)} A`, '', '');

/* ---- hover ---- */
const hover = await hoverThrottle();
row('hover throttle', hover.toFixed(3), '0.20 to 0.30 (check 5)',
  hover < 0.24 ? 'bottom of the band' : '');
row('stick above hover', `${((1 - hover) * 100).toFixed(0)} percent of travel`, '', '');

/* ---- climb authority, which is what a throttle stick actually buys ---- */
const climbRows = [];
for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0]) {
  climbRows.push({ t, v: await climbAt(t) });
}

/* ---- angular response: roll acceleration from a step, which is torque over
 * inertia and so is the only direct read on the inertia tensor ---- */
const roll = await fresh();
hold(roll, 1500, { throttle: 0.35 });
let peakAccel = 0;
let lastP = roll.readState().state[ST.P];
hold(roll, 400, { throttle: 0.35, roll: 1 }, (i, st) => {
  const a = (st[ST.P] - lastP) / 0.001;
  lastP = st[ST.P];
  if (a > peakAccel) {
    peakAccel = a;
  }
});
row('peak roll acceleration', `${(peakAccel * 180 / Math.PI).toFixed(0)} deg/s^2`, '', '');

console.log('\nFLIGHT CHARACTERISTICS, measured off dist/sim.wasm\n');
console.log(`${'quantity'.padEnd(30)}${'measured'.padEnd(26)}${'STAGE1.md says'.padEnd(24)}note`);
for (const r of rows) {
  console.log(`${r.what.padEnd(30)}${String(r.measured).padEnd(26)}${String(r.declared).padEnd(24)}${r.note}`);
}

console.log('\nCLIMB RATE AGAINST THROTTLE, steady state after 2.5 s\n');
console.log(`${'stick'.padStart(6)}${'climb m/s'.padStart(12)}   what the stick is doing`);
for (const c of climbRows) {
  const bar = '#'.repeat(Math.max(0, Math.round(Math.abs(c.v) / 1.2)));
  console.log(`${c.t.toFixed(2).padStart(6)}${c.v.toFixed(1).padStart(12)}   ${c.v < -0.5 ? 'falling ' : ''}${bar}`);
}

/* Where a pilot actually lives: the band around hover that gives a sane
 * climb, as a fraction of stick travel. */
const usable = climbRows.filter((c) => Math.abs(c.v) <= 8);
console.log(`\nhover sits at ${(hover * 100).toFixed(0)} percent of stick travel.`);
console.log(`sampled stick positions inside +/- 8 m/s: ${usable.map((c) => c.t.toFixed(2)).join(', ') || 'none'}`);

/*
 * The throttle cap, measured rather than assumed.
 *
 * This is the check that the setting reaches the motors at all. It appends
 * the same two rate profile lines the menu writes, re-inits, and finds hover
 * again: under SCALE, hover must move UP the stick by exactly 1/cap, and the
 * top of the stick must still reach full thrust times the cap.
 */
console.log('\nTHROTTLE CAP, Betaflight throttle_limit_type = SCALE\n');
console.log(`${'cap'.padStart(5)}${'hover stick'.padStart(14)}${'predicted'.padStart(12)}${'climb at full stick'.padStart(22)}`);
for (const cap of THROTTLE_CAP_CHOICES) {
  const lines = `\nrateprofile 0\nset throttle_limit_type = ${cap < 100 ? 'SCALE' : 'OFF'}\nset throttle_limit_percent = ${cap}\n`;
  const capped = async () => {
    const sim = await loadSim(wasm);
    if (sim.init(config + lines) !== SIM_OK) {
      throw new Error('sim_init failed with the cap lines');
    }
    sim.reset();
    sim.setCellVoltage(4.2);
    return sim;
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i += 1) {
    const mid = (lo + hi) / 2;
    const sim = await capped();
    hold(sim, 2500, { throttle: mid });
    const a = sim.readState().state[ST.Z];
    hold(sim, 1000, { throttle: mid });
    if (sim.readState().state[ST.Z] - a > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  const stick = (lo + hi) / 2;
  const top = await capped();
  hold(top, 2500, { throttle: 1 });
  const z0 = top.readState().state[ST.Z];
  hold(top, 1000, { throttle: 1 });
  const climb = top.readState().state[ST.Z] - z0;
  console.log(
    `${String(cap).padStart(5)}${`${(stick * 100).toFixed(1)} pct`.padStart(14)}`
    + `${`${(hover / (cap / 100) * 100).toFixed(1)} pct`.padStart(12)}${`${climb.toFixed(1)} m/s`.padStart(22)}`,
  );
}
