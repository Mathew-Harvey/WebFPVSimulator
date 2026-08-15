/*
 * yawtest.mjs: work out, from the tracks themselves, which way a stored yaw
 * points.
 *
 * A gate is a hole. You go through it roughly along its normal, never along
 * its plane. So for every physical gate that is also a checkpoint, take the
 * direction of travel through it, which is the chord from the checkpoint
 * before to the checkpoint after, and score each candidate reading of the
 * yaw by how close the normal lies to that chord. Averaged over hundreds of
 * gates across a dozen real tracks, the right convention wins by a mile and
 * the wrong ones sit near the 0.64 you get from guessing.
 *
 * Usage, from the simulator root:  node tracks/yawtest.mjs
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

import { parseTrk, metres, eulerFromRot, PREFAB_NAMES } from './trk.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const CANDIDATES = {
  'sin,cos  (yaw from +Z toward +X, plain Unity)': (t) => ({ x: Math.sin(t), z: Math.cos(t) }),
  'cos,sin  (yaw from +X toward +Z)': (t) => ({ x: Math.cos(t), z: Math.sin(t) }),
  'cos,-sin (yaw from +X toward -Z)': (t) => ({ x: Math.cos(t), z: -Math.sin(t) }),
  '-sin,cos (yaw from +Z toward -X)': (t) => ({ x: -Math.sin(t), z: Math.cos(t) }),
};

const score = new Map(Object.keys(CANDIDATES).map((k) => [k, { sum: 0, n: 0 }]));
const perTrack = [];

const files = (await readdir(here)).filter((f) => f.endsWith('.trk')).sort();
for (const file of files) {
  const parsed = parseTrk(await readFile(join(here, file), 'utf8'));
  const order = [...(parsed.value.gates || [])].sort((a, b) => (a.gate ?? 0) - (b.gate ?? 0));
  const row = { file, n: 0 };
  for (const k of Object.keys(CANDIDATES)) {
    row[k] = { sum: 0, n: 0 };
  }
  for (let i = 0; i < order.length; i += 1) {
    const g = order[i];
    if (PREFAB_NAMES[Number(g.prefab)] !== 'gate') {
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
    /* Only gates on a straight. At a corner the chord is the bisector of the
     * turn and not the heading through the hole, so a hairpin would vote for
     * whichever convention happened to bisect it. */
    if (ix * ox + iz * oz < 0.94) {
      continue;
    }
    const dx = ix + ox;
    const dz = iz + oz;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const t = eulerFromRot(g.trans.rot).yaw;
    for (const [name, fn] of Object.entries(CANDIDATES)) {
      const n = fn(t);
      const d = Math.abs(n.x * ux + n.z * uz);
      const acc = score.get(name);
      acc.sum += d;
      acc.n += 1;
      row[name].sum += d;
      row[name].n += 1;
    }
    row.n += 1;
  }
  perTrack.push(row);
}

console.log('Mean |cos| between a gate normal and the chord through it. 1.0 is dead on, 0.64 is chance.\n');
const names = Object.keys(CANDIDATES);
console.log(`${'track'.padEnd(50)}${'n'.padStart(4)}  ${names.map((s) => s.slice(0, 8).padStart(9)).join('')}`);
for (const row of perTrack) {
  if (!row.n) {
    continue;
  }
  console.log(
    `${row.file.padEnd(50)}${String(row.n).padStart(4)}  `
    + names.map((k) => (row[k].sum / row[k].n).toFixed(3).padStart(9)).join(''),
  );
}
console.log('');
for (const [name, acc] of score) {
  console.log(`  ${(acc.sum / acc.n).toFixed(4)}   ${name}   over ${acc.n} gates`);
}
