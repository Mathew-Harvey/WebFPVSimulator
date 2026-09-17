/*
 * cavity-scan.js: list the openings the town draws and will not let you fly.
 *
 * Drives the real shell in headless Chromium, turns on
 * src/maps/city/cavity.js, loads Sakura City and prints every pocket of air
 * that the drawing leaves open and the game fills, worst first, with the
 * reason each one is solid: a collider index to trim, or the contact floor to
 * cut.
 *
 * Usage:
 *   node scripts/cavity-scan.js [--json=PATH] [--top=N]
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
const jsonPath = jsonArg ? jsonArg.slice(7) : join(root, 'dist/cavity-scan/cavities.json');
const top = topArg ? Number(topArg.slice(6)) : 60;
/* --probe=x,z may be repeated: dump those columns cell by cell. */
const probe = args.filter((a) => a.startsWith('--probe=')).map((a) => a.slice(8).split(',').map(Number));

const steps = [
  `--out=${join(root, 'dist/cavity-scan')}`,
  '--w=640',
  '--h=360',
  '--graphics=low',
  'until:!!window.__boot && window.__boot().frames > 2',
  /* Before the city is chosen, so buildMap sees it. */
  `eval:JSON.stringify({ tag: "arm", on: !!(globalThis.__CITY_CAVITY = ${JSON.stringify({ probe })}) })`,
  'eval:JSON.stringify({ tag: "swap", started: (window.__setMap("city"), true) })',
  'until:window.__map().id === "city" && window.__map().ready',
  'eval:JSON.stringify({ tag: "cavity", scan: window.__map().colliderCavity })',
];

const run = spawnSync('node', [join(root, 'scripts/shots.js'), ...steps], {
  cwd: root,
  encoding: 'utf8',
  timeout: 1800000,
  maxBuffer: 256 * 1024 * 1024,
});
const text = `${run.stdout ?? ''}${run.stderr ?? ''}`;
/*
 * The value is matched on any line rather than on a line starting with
 * `eval `, because shots.js echoes the expression it evaluated and an
 * expression with a newline in it puts the value on a later line. Two earlier
 * drivers matched the prefix and silently found nothing.
 */
const values = text
  .split('\n')
  .map((l) => l.match(/ = ("(?:[^"\\]|\\.)*")\s*$/))
  .filter(Boolean)
  .map((m) => { try { return JSON.parse(JSON.parse(m[1])); } catch { return null; } })
  .filter((v) => v && typeof v === 'object');
const found = values.find((v) => v.tag === 'cavity');
if (!found || !found.scan) {
  process.stdout.write(text.split('\n').slice(-40).join('\n'));
  throw new Error('cavity-scan: the page produced no scan');
}
const scan = found.scan;

mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, JSON.stringify(scan, null, 2));

const lines = [];
lines.push('');
lines.push(`grid            ${scan.grid.join(' x ')}  at ${scan.cell} m, tol ${scan.tol} m`);
lines.push(`bounds          ${scan.bounds.join(', ')}`);
lines.push(`drawn meshes    ${scan.drawnMeshes}, ${scan.drawnTris} triangles, ${scan.drawnInstances} instances`);
lines.push(`colliders       ${scan.colliders}`);
lines.push(`free air cells  ${scan.airCells}`);
lines.push(`blocked cells   ${scan.blockedCells}   (${scan.blockedVolume} m3 of invisible wall)`);
lines.push(`components      ${scan.found}`);
lines.push(`scan            ${scan.ms} ms`);
lines.push('');
lines.push('       m3  box (x0 y0 z0  x1 y1 z1)                                   why');
for (const f of scan.list.slice(0, top)) {
  const b = f.box;
  const bits = [];
  if (f.floor !== null) { bits.push(`floor ${f.floor}`); }
  if (f.plat !== null) { bits.push(`platform ${f.plat}`); }
  for (const h of f.hits) { bits.push(`${h.kind}#${h.i}`); }
  if (f.terrain === null) { bits.push('noTerrain'); }
  const why = bits.length ? bits.join(' ') : 'none';
  const near = (f.near || []).slice(0, 3).join(' ');
  lines.push(
    `  ${String(f.vol).padStart(7)}  `
    + `${String(b[0]).padStart(7)} ${String(b[1]).padStart(6)} ${String(b[2]).padStart(7)}  `
    + `${String(b[3]).padStart(7)} ${String(b[4]).padStart(6)} ${String(b[5]).padStart(7)}   ${why}   ${near}`,
  );
}
for (const p of scan.probes || []) {
  lines.push('');
  lines.push(`probe ${p.at.join(', ')}   terrain ${p.terrain}  bare ${p.bare}  outside ${p.outside}`);
  for (const r of p.rows) { lines.push(`    ${r}`); }
}
lines.push('');
lines.push(`written to ${jsonPath}`);
lines.push('');
process.stdout.write(lines.join('\n'));
if (run.status) {
  process.stdout.write(text.split('\n').slice(-20).join('\n'));
}
process.exit(run.status ?? 0);
