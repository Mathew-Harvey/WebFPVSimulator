/*
 * arcade-check.js: the physics model flag actually changes the physics.
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
 * "Physics model doesn't do anything" was reported, and it was half true in
 * a way that took three separate checks to pull apart:
 *
 *   the plant reads SIM_ARCADE in four places, so the model is real;
 *   `dist/sim.wasm` does export sim_set_flight_style, so the call lands;
 *   but the Freestyle room's row was INFO ONLY and pointed at the launch
 *   card, which freestyle deliberately never shows. So on the one path
 *   where a pilot would look for it, the setting could not be changed.
 *
 * The row is fixed in ui.js. This is the other half: proof that the flag it
 * writes is worth writing. Without it the row is a control whose only
 * evidence of working is that somebody said so.
 *
 * A shell check cannot see this and neither can `npm run verify`: verify's
 * determinism checks run one style and assert the trace is STABLE, which is
 * exactly the property that would still hold if the flag did nothing at all.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim } from '../tests/lib/simmod.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * A STRAIGHT HOVER, with no stick demand at all, held for three seconds.
 *
 * The first draft commanded a hard roll, on the theory that asymmetry needs
 * a sustained demand. It does not, and the roll ruined the measurement: a
 * rolled quad flies sideways because that is what rolling does, so both
 * styles drifted four metres and the number said nothing about either.
 *
 * With no demand the discriminator is clean. Arcade is the IDEAL quad,
 * PLANT_AXIS_FLAT and no build tolerance, so it hangs exactly where it was
 * put. A real frame cannot, and Expert models a real frame.
 */
async function trace(bytes, diff, arcade) {
  const sim = await loadSim(bytes);
  sim.init(diff);
  if (typeof sim.e.sim_set_flight_style !== 'function') {
    return { missing: true };
  }
  sim.e.sim_set_flight_style(arcade ? 1 : 0);
  sim.reset();
  sim.setCellVoltage(4.2);
  let t = 0;
  const samples = [];
  for (let i = 0; i < 3000; i += 1) {
    sim.input(t, 0, 0, 0, 0.55);
    sim.step(1);
    t += 0.001;
    if (i % 500 === 0) {
      const { state } = sim.readState();
      samples.push(Array.from(state.slice(0, 6)));
    }
  }
  return { samples };
}

function lateral(samples) {
  /* The largest sideways excursion from a pure hover. A perfectly
   * symmetric quad has none; a real one always does. */
  let worst = 0;
  for (const s of samples) {
    worst = Math.max(worst, Math.abs(s[1]), Math.abs(s[2]));
  }
  return worst;
}

async function main() {
  const bytes = await readFile(join(root, 'dist', 'sim.wasm'));
  const diff = await readFile(join(root, 'configs', 'betaflight-default.diff'), 'utf8');

  const expert = await trace(bytes, diff, false);
  const arcade = await trace(bytes, diff, true);

  const failures = [];
  console.log('arcade check: does the physics model flag change the physics');

  if (expert.missing || arcade.missing) {
    console.log('  dist/sim.wasm does not export sim_set_flight_style');
    console.log('\nFAIL, the flag cannot be set at all');
    return 1;
  }

  const same = JSON.stringify(expert.samples) === JSON.stringify(arcade.samples);
  const eL = lateral(expert.samples);
  const aL = lateral(arcade.samples);

  console.log(`  expert lateral drift  ${eL.toExponential(3)} m`);
  console.log(`  arcade lateral drift  ${aL.toExponential(3)} m`);

  if (same) {
    failures.push('the two styles produce an identical trace, so the flag does nothing');
  }
  /*
   * Arcade is the IDEAL quad: PLANT_AXIS_FLAT, no build asymmetry, so a
   * demand with no lateral component produces no lateral motion at all.
   * Expert has a real frame's tolerance and must drift.
   */
  if (aL > 1e-9) {
    failures.push(`arcade drifted ${aL.toExponential(3)} m sideways, so it is not the ideal quad`);
  }
  if (eL <= 1e-6) {
    failures.push(`expert drifted only ${eL.toExponential(3)} m, so build asymmetry is not being applied`);
  }

  if (failures.length) {
    console.log(`\nFAIL, ${failures.length} problem(s):`);
    for (const f of failures) {
      console.log(`  ${f}`);
    }
    return 1;
  }
  console.log('\nPASS, arcade is the ideal quad and expert is not');
  return 0;
}

process.exit(await main());
