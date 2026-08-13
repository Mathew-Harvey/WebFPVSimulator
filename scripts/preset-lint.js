/*
 * preset-lint.js: prove every shipped tune actually reaches Betaflight.
 *
 * The failure this exists to catch has already happened once. Before this
 * round the config shim recognised 25 keys and returned success for every
 * other line in the file, so `configs/freestyle.diff` could and did carry
 * `set gyro_lpf1_static_hz`, `set dyn_notch_count` and `set motor_kv` that
 * changed nothing at all, and no check in tests/ could tell. A tune that
 * silently does not apply is worse than one that fails to load, because it
 * looks like it worked.
 *
 * For each file in configs/*.diff this loads the real module, parses it,
 * and reads the module's own counters back. It fails when:
 *   - sim_init rejects the file
 *   - any `set` line was not recognised at all
 *   - the file applied nothing
 * and it prints the applied/inert/unrecognised split so a preset's coverage
 * is a number rather than a hope.
 *
 * Not in tests/, because tests/ is owned by the harness. Run it with
 * `npm run lint:presets`.
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

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';
import { TUNES } from '../configs/registry.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* sim_bf_debug slots, from src/native/bf/bf_glue.c. Not the ABI. */
const DBG = { APPLIED: 13, INERT: 14, UNKNOWN: 15, TABLE: 16 };

function countSetLines(text) {
  let n = 0;
  for (const line of text.split('\n')) {
    if (/^\s*set\s+\S+\s*=/.test(line)) {
      n += 1;
    }
  }
  return n;
}

const wasm = await readFile(join(root, 'dist/sim.wasm'));
const files = (await readdir(join(root, 'configs')))
  .filter((f) => f.endsWith('.diff'))
  .sort();

const rows = [];
let failed = 0;

for (const file of files) {
  const text = await readFile(join(root, 'configs', file), 'utf8');
  const sim = await loadSim(wasm);
  if (typeof sim.e.sim_bf_debug !== 'function') {
    console.error('sim.wasm does not export sim_bf_debug; rebuild with npm run build:wasm');
    process.exit(1);
  }
  const code = sim.init(text);
  if (code !== SIM_OK) {
    rows.push([file, 'FAIL', `sim_init returned ${simErrorName(code)}`]);
    failed += 1;
    continue;
  }
  const applied = sim.e.sim_bf_debug(DBG.APPLIED);
  const inert = sim.e.sim_bf_debug(DBG.INERT);
  const unknown = sim.e.sim_bf_debug(DBG.UNKNOWN);
  const setLines = countSetLines(text);
  const reasons = [];
  if (unknown > 0) {
    reasons.push(`${unknown} key(s) unrecognised`);
  }
  if (applied === 0) {
    reasons.push('nothing applied');
  }
  if (applied + inert + unknown !== setLines) {
    reasons.push(`counted ${applied + inert + unknown} of ${setLines} set lines`);
  }
  const ok = reasons.length === 0;
  if (!ok) {
    failed += 1;
  }
  rows.push([
    file,
    ok ? 'ok' : 'FAIL',
    `${setLines} set lines: ${applied} applied, ${inert} inert by design, ${unknown} unrecognised${
      ok ? '' : `  <-- ${reasons.join('; ')}`
    }`,
  ]);
}

/* Every tune the shell offers must exist as a file. */
for (const t of TUNES) {
  if (!files.includes(`${t.id}.diff`)) {
    rows.push([`${t.id}.diff`, 'FAIL', 'named in configs/registry.js, no such file']);
    failed += 1;
  }
}

const w = Math.max(...rows.map((r) => r[0].length));
console.log('preset-lint: every shipped tune, against the compiled module\n');
for (const [name, status, detail] of rows) {
  console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} presets clean`);
process.exit(failed === 0 ? 0 : 1);
