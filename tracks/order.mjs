/*
 * order.mjs: decide, per track, whether the flying order is the `gate` field
 * or the position in the file, and report anything that says neither is
 * usable.
 *
 * A race lap is an efficient closed loop. Scrambling it lengthens it, so the
 * total length under each candidate ordering is the test, backed up by two
 * things a real lap never has: a leg of zero length, and a leg that doubles
 * back on itself over almost no distance.
 *
 * Usage, from the simulator root:  node tracks/order.mjs
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

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTrk, metres } from './trk.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function lap(points) {
  let total = 0;
  let zero = 0;
  let shortest = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    total += d;
    if (d < 0.05) {
      zero += 1;
    }
    if (d > 0.05) {
      shortest = Math.min(shortest, d);
    }
  }
  return { total, zero, shortest };
}

const files = (await readdir(here)).filter((f) => f.endsWith('.trk')).sort();
console.log('track                                              n   by gate field    by file order   verdict');
for (const file of files) {
  const parsed = parseTrk(await readFile(join(here, file), 'utf8'));
  const gates = parsed.value.gates || [];
  const byGate = [...gates].sort((a, b) => (a.gate ?? 0) - (b.gate ?? 0)).map((g) => metres(g.trans.pos));
  const byFile = gates.map((g) => metres(g.trans.pos));
  const A = lap(byGate);
  const B = lap(byFile);
  const nums = gates.map((g) => g.gate ?? -1).sort((a, b) => a - b);
  const contiguous = nums.every((n, i) => n === i);
  const verdict = A.total <= B.total ? 'gate field' : 'FILE ORDER IS SHORTER';
  console.log(
    `${file.padEnd(50)}${String(gates.length).padStart(3)}`
    + `  ${A.total.toFixed(0).padStart(6)} m ${String(A.zero).padStart(2)} zero`
    + `  ${B.total.toFixed(0).padStart(6)} m ${String(B.zero).padStart(2)} zero`
    + `   ${verdict}${contiguous ? '' : '   NUMBERS NOT 0..n-1'}`,
  );
}
