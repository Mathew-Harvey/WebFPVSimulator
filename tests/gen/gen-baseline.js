/*
 * gen-baseline.js: procedurally generate tests/inputs/baseline.rec, the
 * committed 30 second stick input stream used by every replay check.
 *
 * The stream is built purely from piecewise linear breakpoint tables and
 * IEEE 754 add, subtract, multiply and divide, which are exactly specified,
 * so regenerating on any engine and any machine produces byte-identical
 * output. No transcendental functions, no randomness, no timestamps from
 * the environment.
 *
 * The file is committed and byte-stable. Regenerating it is a Loop A
 * action only; the runner never calls this, and Loop B must not run it
 * (see tests/README in SKILL.md terms: editing or regenerating baseline.rec
 * invalidates a run). The script therefore refuses to overwrite an
 * existing file unless given --force.
 *
 * Profile, 30 s at 250 Hz:
 *   0.0  -  4.0  hover with small stick jiggle
 *   4.0  -  7.0  punch-out, full throttle
 *   7.0  -  9.5  float down, catch, recover
 *   9.5  - 12.0  hover, small yaw adjust near 10.5 s
 *  12.0  - 12.8  full right roll
 *  12.8  - 15.5  recover to hover
 *  15.5  - 17.2  punch, full back flip, catch
 *  17.2  - 20.0  settle to hover
 *  20.0  - 20.6  full left roll
 *  20.6  - 24.0  hover, small yaw adjust near 22 s
 *  24.0  - 28.0  low throttle descent into own propwash, small roll jiggle
 *  28.0  - 30.0  catch and settle
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

import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodeRec } from '../lib/recfile.js';
import { sha256Hex } from '../lib/replay.js';

const RATE_HZ = 250;
const DURATION_S = 30;
const COUNT = RATE_HZ * DURATION_S;

// Breakpoint tables, [time s, value]. Linear interpolation between points,
// held flat before the first and after the last.

const THROTTLE = [
  [0.0, 0.26],
  [3.9, 0.26],
  [4.0, 1.0],
  [7.0, 1.0],
  [7.15, 0.18],
  [9.0, 0.18],
  [9.5, 0.3],
  [11.9, 0.3],
  [12.0, 0.5],
  [12.9, 0.5],
  [13.2, 0.3],
  [15.4, 0.3],
  [15.5, 0.45],
  [16.0, 0.45],
  [16.05, 0.42],
  [16.6, 0.42],
  [16.7, 0.55],
  [17.2, 0.55],
  [17.5, 0.28],
  [19.9, 0.28],
  [20.0, 0.45],
  [20.6, 0.45],
  [20.9, 0.3],
  [23.9, 0.3],
  [24.1, 0.08],
  [28.0, 0.08],
  [28.1, 0.45],
  [29.0, 0.32],
  [29.5, 0.27],
];

const ROLL = [
  [0.0, 0.0],
  [0.5, 0.0],
  [0.75, 0.02],
  [1.25, -0.02],
  [1.75, 0.02],
  [2.25, -0.02],
  [2.75, 0.02],
  [3.25, -0.02],
  [3.5, 0.0],
  [12.0, 0.0],
  [12.05, 1.0],
  [12.75, 1.0],
  [12.8, 0.0],
  [20.0, 0.0],
  [20.05, -1.0],
  [20.55, -1.0],
  [20.6, 0.0],
  [24.5, 0.0],
  [25.0, 0.03],
  [25.75, -0.03],
  [26.5, 0.03],
  [27.25, -0.03],
  [27.6, 0.0],
];

const PITCH = [
  [0.0, 0.0],
  [0.6, 0.0],
  [0.9, 0.02],
  [1.5, -0.02],
  [2.1, 0.02],
  [2.7, -0.02],
  [3.3, 0.0],
  [16.0, 0.0],
  [16.05, 1.0],
  [16.6, 1.0],
  [16.65, 0.0],
];

const YAW = [
  [0.0, 0.0],
  [10.0, 0.0],
  [10.2, 0.15],
  [10.8, 0.15],
  [11.0, 0.0],
  [21.5, 0.0],
  [21.7, -0.2],
  [22.3, -0.2],
  [22.5, 0.0],
];

function checkTable(name, bps) {
  for (let i = 1; i < bps.length; i += 1) {
    if (!(bps[i][0] > bps[i - 1][0])) {
      throw new Error(`${name}: breakpoints not strictly increasing at index ${i}`);
    }
  }
}

function sample(bps, t) {
  if (t <= bps[0][0]) {
    return bps[0][1];
  }
  for (let i = 1; i < bps.length; i += 1) {
    if (t <= bps[i][0]) {
      const t0 = bps[i - 1][0];
      const v0 = bps[i - 1][1];
      const t1 = bps[i][0];
      const v1 = bps[i][1];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return bps[bps.length - 1][1];
}

async function main() {
  checkTable('throttle', THROTTLE);
  checkTable('roll', ROLL);
  checkTable('pitch', PITCH);
  checkTable('yaw', YAW);

  const samples = new Array(COUNT);
  for (let i = 0; i < COUNT; i += 1) {
    const tUs = i * 4000;
    const t = tUs / 1e6;
    samples[i] = {
      tUs,
      roll: sample(ROLL, t),
      pitch: sample(PITCH, t),
      yaw: sample(YAW, t),
      throttle: sample(THROTTLE, t),
    };
  }
  const bytes = encodeRec(RATE_HZ, samples);
  const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const out = join(root, 'tests/inputs/baseline.rec');
  if (existsSync(out) && !process.argv.includes('--force')) {
    console.error(
      'gen:baseline: tests/inputs/baseline.rec already exists and is a committed, byte-stable artifact. Use --force only for Loop A regeneration.',
    );
    process.exit(1);
  }
  await writeFile(out, bytes);
  console.log(`gen:baseline: wrote ${out}`);
  console.log(`gen:baseline: ${COUNT} samples at ${RATE_HZ} Hz, ${bytes.length} bytes`);
  console.log(`gen:baseline: sha256 ${await sha256Hex([bytes])}`);
}

main().catch((e) => {
  console.error(`gen:baseline: fatal: ${e.stack ?? e}`);
  process.exit(1);
});
