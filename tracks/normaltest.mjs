/*
 * normaltest.mjs: which local axis of a Velocidrone checkpoint volume is the
 * direction you fly through it.
 *
 * Two independent tests, because getting this wrong turns a course into
 * gates stood side on and it is worth being sure.
 *
 * TEST ONE, the strong one. Several tracks put an invisible checkpoint inside
 * the opening of a real gate mesh. The two objects are then the same hole,
 * so the checkpoint's normal must agree with the gate's, and a gate's normal
 * is its local forward, which is separately established. This compares two
 * objects at the same spot and needs no guess about where the racing line
 * goes.
 *
 * TEST TWO. Score each axis against the direction of travel through the
 * checkpoint, per track, so a single odd track cannot carry the vote.
 *
 * Usage, from the simulator root:  node tracks/normaltest.mjs
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
const files = (await readdir(here)).filter((f) => f.endsWith('.trk')).sort();

function flatDot(v, ux, uz) {
  const h = Math.hypot(v.x, v.z);
  if (h < 1e-6) {
    return 0;
  }
  return Math.abs((v.x / h) * ux + (v.z / h) * uz);
}

console.log('TEST ONE: a checkpoint sitting inside a gate mesh must face the way the gate faces.\n');
const pair = { right: 0, up: 0, forward: 0, n: 0 };
for (const file of files) {
  const parsed = parseTrk(await readFile(join(here, file), 'utf8'));
  const items = parsed.value.gates || [];
  const checks = items.filter((g) => Number(g.prefab) === 88);
  const meshes = items.filter((g) => PREFAB_NAMES[Number(g.prefab)] === 'gate');
  const row = { right: 0, up: 0, forward: 0, n: 0 };
  for (const c of checks) {
    const cp = metres(c.trans.pos);
    let best = null;
    for (const m of meshes) {
      const mp = metres(m.trans.pos);
      const d = Math.hypot(mp.x - cp.x, mp.z - cp.z);
      if (d < 0.6 && (!best || d < best.d)) {
        best = { m, d };
      }
    }
    if (!best) {
      continue;
    }
    const g = axesFromRot(best.m.trans.rot).forward;
    const gh = Math.hypot(g.x, g.z) || 1;
    const ux = g.x / gh;
    const uz = g.z / gh;
    const ax = axesFromRot(c.trans.rot);
    for (const a of AXES) {
      row[a] += flatDot(ax[a], ux, uz);
      pair[a] += flatDot(ax[a], ux, uz);
    }
    row.n += 1;
    pair.n += 1;
  }
  if (row.n) {
    console.log(`  ${file.padEnd(50)} n=${String(row.n).padStart(3)}  ${AXES.map((a) => `${a} ${(row[a] / row.n).toFixed(3)}`).join('   ')}`);
  }
}
console.log(`\n  TOTAL n=${pair.n}  ${AXES.map((a) => `${a} ${(pair[a] / pair.n).toFixed(3)}`).join('   ')}\n`);

console.log('TEST TWO: each axis against the direction of travel, per track.\n');
const all = { right: 0, up: 0, forward: 0, n: 0 };
for (const file of files) {
  const parsed = parseTrk(await readFile(join(here, file), 'utf8'));
  const order = [...(parsed.value.gates || [])].sort((a, b) => (a.gate ?? 0) - (b.gate ?? 0));
  const row = { right: 0, up: 0, forward: 0, n: 0 };
  for (let i = 0; i < order.length; i += 1) {
    if (Number(order[i].prefab) !== 88) {
      continue;
    }
    const at = metres(order[i].trans.pos);
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
    if (ix * ox + iz * oz < 0.85) {
      continue;
    }
    const dx = ix + ox;
    const dz = iz + oz;
    const len = Math.hypot(dx, dz) || 1;
    const ax = axesFromRot(order[i].trans.rot);
    for (const a of AXES) {
      row[a] += flatDot(ax[a], dx / len, dz / len);
      all[a] += flatDot(ax[a], dx / len, dz / len);
    }
    row.n += 1;
    all.n += 1;
  }
  if (row.n) {
    console.log(`  ${file.padEnd(50)} n=${String(row.n).padStart(3)}  ${AXES.map((a) => `${a} ${(row[a] / row.n).toFixed(3)}`).join('   ')}`);
  }
}
console.log(`\n  TOTAL n=${all.n}  ${AXES.map((a) => `${a} ${(all[a] / all.n).toFixed(3)}`).join('   ')}`);
