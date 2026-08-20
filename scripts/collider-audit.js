/*
 * collider-audit.js: print how far the city's solid world is from its drawn
 * one, in both directions, as numbers that can be compared between rounds.
 *
 * The owner's report is always the same sentence, "the collisions need to
 * HUG the graphics, I want to hit gaps but in many places they are actually
 * invisible walls", and until this existed the only answer to it was to fly
 * the town and form an impression. This drives the real shell in headless
 * Chromium, turns on src/maps/city/scan.js, loads the city and prints:
 *
 *   PHANTOM: solid volume with nothing drawn under it, summed over the town
 *   and listed per collider worst first. This is the invisible wall, in
 *   cubic metres.
 *
 *   HOLES: drawn objects with nothing solid in them, which is the failure
 *   the other direction and the gate on any trim.
 *
 * Usage:
 *   node scripts/collider-audit.js [--json=PATH] [--top=N]
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

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const args = process.argv.slice(2);
const jsonArg = args.find((a) => a.startsWith('--json='));
const topArg = args.find((a) => a.startsWith('--top='));
const jsonPath = jsonArg ? jsonArg.slice(7) : join(root, 'dist/collider-audit/audit.json');
const top = topArg ? Number(topArg.slice(6)) : 25;

const steps = [
  `--out=${join(root, 'dist/collider-audit')}`,
  '--w=800',
  '--h=450',
  '--graphics=high',
  'until:!!window.__boot && window.__boot().frames > 2',
  /* Before the city is chosen, so buildMap sees it. */
  'eval:JSON.stringify({ tag: "arm", on: (globalThis.__CITY_SCAN = true) })',
  'eval:JSON.stringify({ tag: "swap", started: (window.__setMap("city"), true) })',
  'until:window.__map().id === "city" && window.__map().ready',
  'eval:JSON.stringify({ tag: "audit", fit: window.__map().colliderFit, scan: window.__map().colliderScan, counts: window.__colliders(), cityColliders: window.__map().cityColliders, platformSlabs: window.__map().platformSlabs })',
];

const run = spawnSync('node', [join(root, 'scripts/shots.js'), ...steps], {
  cwd: root,
  encoding: 'utf8',
  timeout: 900000,
  maxBuffer: 256 * 1024 * 1024,
});
const text = `${run.stdout ?? ''}${run.stderr ?? ''}`;
const values = text
  .split('\n')
  .map((l) => (l.startsWith('eval ') ? l.match(/ = ("(?:[^"\\]|\\.)*")\s*$/) : null))
  .filter(Boolean)
  .map((m) => JSON.parse(JSON.parse(m[1])));
const audit = values.find((v) => v.tag === 'audit');
if (!audit || !audit.scan) {
  process.stdout.write(text.split('\n').slice(-40).join('\n'));
  throw new Error('collider-audit: the page produced no scan');
}

mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, JSON.stringify(audit, null, 2));

const f = audit.fit;
const p = audit.scan.phantom;
const h = audit.scan.holes;
const lines = [];
lines.push('');
lines.push(`colliders          ${audit.counts.count} boxes (${audit.cityColliders} authored, ${f.covered} added by the cover pass, ${audit.platformSlabs} platform slabs)`);
lines.push(`fit                ${f.fitted} fitted, ${f.unmatched} left as authored, ${f.sideTrims} side trims to ${f.maxSideTrim.toFixed(2)} m, ${f.topTrims} top trims to ${f.maxTopTrim.toFixed(2)} m, ${f.roofLifts} roof lifts`);
lines.push(`drawn meshes       ${audit.scan.drawnMeshes}`);
lines.push('');
lines.push(`PHANTOM            ${p.totalPhantom} m3 of solid with nothing drawn under it, of ${p.solidVolume} m3 solid`);
lines.push(`                   ${p.overOne} boxes reach over 1 m past the drawing, ${p.overFive} over 5 m, ${p.standingOnAir} stand on air`);
lines.push(`                   by kind: ${Object.entries(p.byKind).map(([k, v]) => `${k} ${v.phantom} m3 over ${v.count}`).join(', ')}`);
lines.push('');
lines.push(`HOLES              ${h.count} solid things less than half inside a collider, of ${h.probed} probed, mean cover ${h.meanCovered}`);
lines.push(`                   soft (foliage, wires, cloth): ${h.softCount} of ${h.softProbed}`);
lines.push('');
lines.push('worst phantoms');
for (const w of p.worst.slice(0, top)) {
  lines.push(
    `  #${String(w.i).padStart(5)} ${w.kind.padEnd(8)} ${String(w.phantom).padStart(8)} m3  gap ${String(w.gap).padStart(6)} m  empty ${w.empty}  full ${w.full}  ` +
    `size ${w.size.join(' x ')}  at ${w.at.join(', ')}`,
  );
}
if (h.count > 0) {
  lines.push('');
  lines.push('holes');
  for (const w of h.worst.slice(0, top)) {
    lines.push(`  ${String(w.name).padEnd(18)} cover ${String(w.frac).padStart(5)}  vol ${String(w.vol).padStart(8)}  size ${w.size.join(' x ')}  at ${w.at.join(', ')}`);
  }
}
lines.push('');
lines.push(`written to ${jsonPath}`);
lines.push('');
process.stdout.write(lines.join('\n'));
