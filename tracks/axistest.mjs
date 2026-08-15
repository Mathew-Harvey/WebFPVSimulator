/*
 * axistest.mjs: which local axis of a prefab points through the hole.
 *
 * A gate mesh and a Velocidrone checkpoint volume are authored in different
 * poses: the gate stands up already, the checkpoint is made lying flat and
 * stood up with a quarter turn about X, sometimes with a roll on top. Reading
 * a yaw out of the quaternion and calling it a heading therefore works for
 * one and not the other, which is exactly the kind of thing that produces a
 * course full of gates turned side on.
 *
 * So ask the data. For every checkpoint, take the direction of travel through
 * it and score the object's three local axes by how well each lines up. The
 * axis that goes through the hole wins.
 *
 * Usage, from the simulator root:  node tracks/axistest.mjs
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

import { parseTrk, metres, axesFromRot, PREFAB_NAMES } from './trk.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const AXES = ['right', 'up', 'forward'];

const tally = new Map();

function bucket(kind) {
  if (!tally.has(kind)) {
    tally.set(kind, { n: 0, right: 0, up: 0, forward: 0 });
  }
  return tally.get(kind);
}

const files = (await readdir(here)).filter((f) => f.endsWith('.trk')).sort();
for (const file of files) {
  const parsed = parseTrk(await readFile(join(here, file), 'utf8'));
  const order = [...(parsed.value.gates || [])].sort((a, b) => (a.gate ?? 0) - (b.gate ?? 0));
  for (let i = 0; i < order.length; i += 1) {
    const g = order[i];
    const kind = PREFAB_NAMES[Number(g.prefab)] || `p${g.prefab}`;
    if (kind === 'flag' || kind === 'cone') {
      continue;
    }
    const at = metres(g.trans.pos);
    const before = metres(order[(i - 1 + order.length) % order.length].trans.pos);
    const after = metres(order[(i + 1) % order.length].trans.pos);
    const inLen = Math.hypot(at.x - before.x, at.z - before.z);
    const outLen = Math.hypot(after.x - at.x, after.z - at.z);
    if (inLen < 3 || outLen < 3) {
      continue;
    }
    const ix = (at.x - before.x) / inLen;
    const iz = (at.z - before.z) / inLen;
    const ox = (after.x - at.x) / outLen;
    const oz = (after.z - at.z) / outLen;
    if (ix * ox + iz * oz < 0.9) {
      continue;
    }
    const dx = ix + ox;
    const dz = iz + oz;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const ax = axesFromRot(g.trans.rot);
    const acc = bucket(kind);
    acc.n += 1;
    for (const name of AXES) {
      const v = ax[name];
      /* Compared flat: a tilted aperture's normal leans out of the ground
       * plane and its horizontal part is still what points down the course. */
      const h = Math.hypot(v.x, v.z) || 1e-9;
      acc[name] += Math.abs((v.x / h) * ux + (v.z / h) * uz);
    }
  }
}

console.log('Mean |cos| between a local axis, flattened, and the travel direction.\n');
console.log(`${'prefab role'.padEnd(16)}${'n'.padStart(5)}  ${AXES.map((a) => a.padStart(10)).join('')}`);
for (const [kind, acc] of [...tally.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(
    `${kind.padEnd(16)}${String(acc.n).padStart(5)}  `
    + AXES.map((a) => (acc[a] / acc.n).toFixed(3).padStart(10)).join(''),
  );
}
