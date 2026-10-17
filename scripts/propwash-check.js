/*
 * propwash-check.js: the Prop wash switch removes the shake and nothing else.
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

/*
 * WHY THIS EXISTS.
 *
 * The Prop wash row in Settings (the owner, 2026-10-16: "turn off prop wash
 * toggle in menu") writes sim_set_propwash. Three things have to hold for
 * that row to be honest, and no other check sees any of them:
 *
 *   never calling it, and calling it with 1, fly the same trace bit for
 *   bit, so every recorded golden and every board time stays what it was;
 *   calling it with 0 changes the flight, so the switch does something;
 *   and what it changes is the shake: a hard drop into the craft's own
 *   wash and the catch out of it disturb the body rates less with it off.
 *
 * The flight is flight-report.js's propwash proxy with a low hover added:
 * climb, chop to idle, fall through the wash, sit in it, punch out. Roll and pitch only, because yaw is
 * where the motors' own torque lives and wash is not what moves it.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim } from '../tests/lib/simmod.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEG = 180 / Math.PI;

/* `wash` is undefined (never called), 1 or 0. */
async function trace(bytes, diff, wash) {
  const sim = await loadSim(bytes);
  sim.init(diff);
  if (typeof sim.e.sim_set_propwash !== 'function') {
    return { missing: true };
  }
  if (wash !== undefined) {
    sim.e.sim_set_propwash(wash);
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  const legs = [{ ms: 1000, thr: 0.75 }, { ms: 1500, thr: 0.05 }, { ms: 300, thr: 0.25 }, { ms: 1200, thr: 0.55 }];
  let t = 0;
  let wobble = 0;
  let sq = 0;
  let n = 0;
  const samples = [];
  for (const leg of legs) {
    for (let i = 0; i < leg.ms; i += 1) {
      sim.input(t, 0, 0, 0, leg.thr);
      sim.step(1);
      t += 0.001;
      const { state } = sim.readState();
      const rate = Math.hypot(state[11], state[12]) * DEG;
      wobble = Math.max(wobble, rate);
      sq += rate * rate;
      n += 1;
      if (n % 250 === 0) {
        samples.push(Array.from(state.slice(0, 13)));
      }
    }
  }
  return { samples, wobble, rms: Math.sqrt(sq / n) };
}

async function main() {
  const bytes = await readFile(join(root, 'dist', 'sim.wasm'));
  const diff = await readFile(join(root, 'configs', 'betaflight-default.diff'), 'utf8');

  const never = await trace(bytes, diff, undefined);
  const on = await trace(bytes, diff, 1);
  const off = await trace(bytes, diff, 0);

  console.log('propwash check: does the Prop wash switch remove the shake and nothing else');
  if (never.missing) {
    console.log('  dist/sim.wasm does not export sim_set_propwash');
    console.log('\nFAIL, the switch cannot be set at all');
    return 1;
  }
  console.log(`  on   peak ${on.wobble.toFixed(1)} deg/s, rms ${on.rms.toFixed(2)} deg/s`);
  console.log(`  off  peak ${off.wobble.toFixed(1)} deg/s, rms ${off.rms.toFixed(2)} deg/s`);

  const failures = [];
  if (JSON.stringify(never.samples) !== JSON.stringify(on.samples)) {
    failures.push('switching it on is not the same flight as never touching it');
  }
  if (JSON.stringify(on.samples) === JSON.stringify(off.samples)) {
    failures.push('on and off fly an identical trace, so the switch does nothing');
  }
  if (!(off.rms < on.rms)) {
    failures.push('off shakes no less than on through the drop and the catch');
  }
  if (failures.length) {
    console.log(`\nFAIL, ${failures.length} problem(s):`);
    for (const f of failures) {
      console.log(`  ${f}`);
    }
    return 1;
  }
  console.log('\nPASS, on is the flight it always was and off takes the shake out');
  return 0;
}

process.exit(await main());
