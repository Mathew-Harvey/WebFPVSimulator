/*
 * inspect.mjs: dump the raw contents of a Velocidrone .trk so an import can
 * be checked against ground truth. Read only, writes nothing.
 *
 * Usage, from the simulator root:
 *   node tracks/inspect.mjs "2024 WA states aligned ironoid.trk"
 *   node tracks/inspect.mjs --raw "WCMRC Round 5.trk"
 *   node tracks/inspect.mjs --list
 *
 * The .trk layout, confirmed against dutchdronesquad/trackdraw's exporter
 * (src/lib/export/exportVelocidroneTrk.ts):
 *
 *   plaintext = sceneId \n trackName \n valueJson \n type \n onlineId
 *   valueJson = { gates: [...], barriers: [...] }
 *   gate      = { prefab, trans, gate, start, finish, lap1only }
 *   barrier   = { prefab, trans }
 *   trans     = { pos: [x,y,z]*100, rot: [w,x,y,z]*1000, scale: [x,y,z]*100 }
 *
 * `gate` is the checkpoint's index in the flying order. Unity is left handed
 * and Y up, so pos is metres east, up, north and a positive yaw turns +Z
 * toward +X, which is CLOCKWISE seen from above.
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

import { parseTrk, eulerFromRot, metres, PREFAB_NAMES } from './trk.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const deg = (r) => (r * 180 / Math.PI);

function fmt(n, p = 2) {
  return Number(n).toFixed(p).padStart(p + 5);
}

function prefabName(id) {
  return PREFAB_NAMES[id] || `prefab ${id}`;
}

async function dump(file, showRaw) {
  const parsed = parseTrk(await readFile(join(here, file), 'utf8'));
  const v = parsed.value;
  const gates = [...(v.gates || [])];
  const barriers = v.barriers || [];

  console.log(`\n${'='.repeat(112)}`);
  console.log(`FILE   ${file}`);
  console.log(`NAME   ${parsed.name}   scene ${parsed.sceneId}   type ${parsed.type}   onlineId ${parsed.onlineId}`);
  console.log(`VALUE  keys: ${Object.keys(v).join(', ')}`);

  if (showRaw) {
    console.log(`\nRAW first three gate records, verbatim:`);
    for (const g of gates.slice(0, 3)) {
      console.log(`  ${JSON.stringify(g)}`);
    }
    console.log(`RAW first two barrier records, verbatim:`);
    for (const b of barriers.slice(0, 2)) {
      console.log(`  ${JSON.stringify(b)}`);
    }
    const keys = new Set();
    for (const g of gates) {
      for (const k of Object.keys(g)) {
        keys.add(k);
      }
    }
    console.log(`ALL gate record keys seen: ${[...keys].join(', ')}`);
  }

  /* Ground level. A physical gate stands on the floor, so the lowest one is
   * the floor. Reading it off every object instead picks up cones and posts
   * that are deliberately sunk into the ground and reads a metre too low. */
  const standing = gates.filter((g) => PREFAB_NAMES[Number(g.prefab)] === 'gate');
  const floor = standing.length
    ? Math.min(...standing.map((g) => metres(g.trans.pos).height))
    : Math.min(...gates.map((g) => metres(g.trans.pos).height));

  console.log(`\nGATES (${gates.length}) sorted by the gate field, which is the flying order.`);
  console.log(`  ord  prefab  what              start fin |       x       z    agl  |    yaw   pitch    roll  | scale           | step`);
  const order = gates.slice().sort((a, b) => (a.gate ?? 0) - (b.gate ?? 0));
  let prev = null;
  for (const g of order) {
    const p = metres(g.trans.pos);
    const s = g.trans.scale || [100, 100, 100];
    const e = eulerFromRot(g.trans.rot || [1000, 0, 0, 0]);
    const step = prev ? Math.hypot(p.x - prev.x, p.z - prev.z) : 0;
    console.log(
      `  ${String(g.gate).padStart(3)}  ${String(g.prefab).padStart(6)}  ${prefabName(g.prefab).padEnd(16)}`
      + ` ${String(!!g.start).padStart(5)} ${String(!!g.finish).padStart(3)} |`
      + ` ${fmt(p.x)} ${fmt(p.z)} ${fmt(p.height - floor)}  |`
      + ` ${fmt(deg(e.yaw), 1)} ${fmt(deg(e.pitch), 1)} ${fmt(deg(e.roll), 1)}  |`
      + ` ${String(s.join(',')).padEnd(15)} | ${step ? `${step.toFixed(1)} m` : ''}`,
    );
    prev = p;
  }
  if (prev && order.length) {
    const first = metres(order[0].trans.pos);
    console.log(`  lap closes with ${Math.hypot(first.x - prev.x, first.z - prev.z).toFixed(1)} m back to the start`);
  }

  const byPrefab = new Map();
  for (const b of barriers) {
    byPrefab.set(Number(b.prefab), (byPrefab.get(Number(b.prefab)) || 0) + 1);
  }
  console.log(`\nBARRIERS (${barriers.length}) by prefab:`);
  for (const [id, n] of [...byPrefab.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(id).padStart(5)} x${String(n).padStart(3)}  ${prefabName(id)}`);
  }

  /* Every barrier, with where it sits, so a checkpoint standing in free air
   * can be matched to the flag it turns or the prop it clears. */
  const markers = barriers.length <= 60 ? barriers : barriers.filter((b) => PREFAB_NAMES[Number(b.prefab)]);
  if (markers.length) {
    console.log(`\nBARRIER POSITIONS:`);
    for (const b of markers) {
      const p = metres(b.trans.pos);
      const e = eulerFromRot(b.trans.rot || [1000, 0, 0, 0]);
      let near = '';
      let best = Infinity;
      for (const g of order) {
        const q = metres(g.trans.pos);
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < best) {
          best = d;
          near = `checkpoint ${g.gate} at ${d.toFixed(2)} m`;
        }
      }
      console.log(
        `  ${String(b.prefab).padStart(5)}  ${prefabName(Number(b.prefab)).padEnd(16)}`
        + ` ${fmt(p.x)} ${fmt(p.z)} ${fmt(p.height - floor)}  yaw ${fmt(deg(e.yaw), 1)}  nearest ${near}`,
      );
    }
  }
}

const args = process.argv.slice(2);
const showRaw = args.includes('--raw');
const files = args.filter((a) => !a.startsWith('--'));
const wanted = files.length ? files : (await readdir(here)).filter((f) => f.endsWith('.trk'));
for (const f of wanted) {
  await dump(f, showRaw);
}
