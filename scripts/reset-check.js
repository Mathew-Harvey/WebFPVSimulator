/*
 * reset-check.js: a reset starts the next flight exactly where a fresh module would.
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
 * Every crash, every Restart and every new run is a sim_reset, and the
 * goldens all fly a fresh module, so nothing looked at what a reset leaves
 * behind until 3D mode's check measured it on 2026-10-21: a flight, a reset
 * and the same flight again ended 10 mm from a fresh module's on the five
 * inch and 43 mm on the whoop over 2.2 s. The leftovers were Betaflight's
 * (patches/0004) and the battery the controller was last told about, and
 * one of them was a feel bug rather than a rounding: the dynamic lowpass
 * keeps the time it last moved its cutoffs, the clock goes back to the warm
 * up at a reset, so the gyro and D term filters sat at the cutoff they had
 * at the crash until the new flight's clock passed the old one.
 *
 * So each run here is a long first flight (longer than the second, so a
 * clock that is compared across the reset is caught), a reset, and the
 * second flight, against the second flight in a fresh module, both
 * airframes, acro and angle, in the air and on the grass. Bit for bit, every
 * step: a reset is a fresh module or it is a bug.
 *
 * Plant only, no browser, a few seconds.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim } from '../tests/lib/simmod.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The shell's weights (configs/airframes.js) and each airframe's stock tune. */
const AIRFRAMES = [
  { id: 0, name: 'five inch', gravity: 1.62, diff: 'betaflight-default.diff', rest: 0.033 },
  { id: 1, name: 'whoop', gravity: 2.025, diff: 'whoop-champion.diff', rest: 0.010 },
];

/* Six seconds of flying that touches everything that keeps a memory: the
 * throttle swept through the dynamic lowpass's range, a roll, a flip's
 * worth of pitch, a chop and a hover. */
const FIRST = [
  { ms: 800, thr: 0.85 },
  { ms: 700, thr: 0.35, roll: 0.6 },
  { ms: 500, thr: 0.6, pitch: -0.8 },
  { ms: 900, thr: 0.05 },
  { ms: 1200, thr: 0.55, roll: -0.3, yaw: 0.4 },
  { ms: 900, thr: 0.95 },
  { ms: 1000, thr: 0.12 },
];
/* The flight that is compared: shorter than the first, by design. */
const SECOND = [
  { ms: 500, thr: 0.8 },
  { ms: 400, thr: 0.05 },
  { ms: 600, thr: 0.5, roll: 0.7 },
  { ms: 700, thr: 0.45 },
];

let failed = 0;
function ok(cond, what) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) {
    failed += 1;
  }
}

function setup(sim, af, angle, grass) {
  if (af.id !== 0) {
    sim.e.sim_set_airframe(af.id);
  }
  sim.e.sim_set_gravity(af.gravity);
  sim.reset();
  sim.setCellVoltage(4.2);
  sim.setAngleMode(angle);
  if (grass) {
    sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, -af.rest, 0.6, 0.0);
  }
}

/* RC frames at 1 ms; returns one hash per step of the whole state block,
 * and where the flight ended. */
function fly(sim, legs) {
  let t = 0;
  const hashes = [];
  let last = null;
  for (const leg of legs) {
    for (let i = 0; i < leg.ms; i += 1) {
      sim.input(t, leg.roll || 0, leg.pitch || 0, leg.yaw || 0, leg.thr);
      sim.step(1);
      const { bytes } = sim.readStateBytes();
      hashes.push(createHash('sha256').update(bytes).digest('hex').slice(0, 16));
      last = Array.from(sim.readState().state);
      t += 0.001;
    }
  }
  return { hashes, last };
}

async function main() {
  const bytes = await readFile(join(root, 'dist', 'sim.wasm'));
  for (const af of AIRFRAMES) {
    const diff = await readFile(join(root, 'configs', af.diff), 'utf8');
    for (const angle of [false, true]) {
      for (const grass of [false, true]) {
        const label = `${af.name}, ${angle ? 'angle' : 'acro'}, ${grass ? 'from the grass' : 'in the air'}`;
        const fresh = await loadSim(bytes);
        fresh.init(diff);
        setup(fresh, af, angle, grass);
        const want = fly(fresh, SECOND);

        const used = await loadSim(bytes);
        used.init(diff);
        setup(used, af, angle, grass);
        fly(used, FIRST);
        setup(used, af, angle, grass);
        const got = fly(used, SECOND);

        let first = -1;
        for (let i = 0; i < want.hashes.length; i += 1) {
          if (want.hashes[i] !== got.hashes[i]) {
            first = i;
            break;
          }
        }
        const gap = Math.hypot(want.last[1] - got.last[1], want.last[2] - got.last[2], want.last[3] - got.last[3]);
        ok(first < 0, `${label}: after a reset the flight is a fresh module's, bit for bit${first < 0 ? ''
          : `; first differs at step ${first}, and it ends ${(gap * 1000).toFixed(2)} mm away`}`);
      }
    }
  }
  console.log(`\nreset-check: ${failed === 0 ? 'all passed' : `${failed} FAILED`}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
