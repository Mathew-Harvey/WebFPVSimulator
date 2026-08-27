/*
 * gap-scan.js: find visual openings the city's colliders still fill.
 *
 * The phantom scan in src/maps/city/scan.js measures solid ABOVE the drawn
 * roof, so a bus shelter whose box runs from the ground to the lid is
 * honest by that metric and a wall to a pilot. This one asks the question
 * the owner actually flies: is there a point inside a compact collider
 * where a 5 inch quad would hit, inset far enough that the hit cannot be
 * a post or a wall the drawing actually has.
 *
 * Usage:
 *   node scripts/gap-scan.js [--json=PATH]
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

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const jsonArg = args.find((a) => a.startsWith('--json='));
const jsonPath = jsonArg ? jsonArg.slice(7) : join(root, 'dist/gap-scan/gaps.json');

const SCAN = `(() => {
  const hit = window.__hit;
  const boxesOf = window.__colliderBoxes;
  const seen = new Set();
  const boxes = [];
  for (let x = -80; x <= 185; x += 5) {
    for (let z = -125; z <= 120; z += 5) {
      const list = boxesOf(x, z, 7);
      for (let i = 0; i < list.length; i += 1) {
        const b = list[i];
        const k = b[0].toFixed(3) + "," + b[1].toFixed(3) + "," + b[2].toFixed(3)
          + "," + b[3].toFixed(3) + "," + b[4].toFixed(3) + "," + b[5].toFixed(3);
        if (seen.has(k)) continue;
        seen.add(k);
        boxes.push(b);
      }
    }
  }
  const issues = [];
  const INSET = 0.36;
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i];
    const sx = b[3] - b[0];
    const sy = b[4] - b[1];
    const sz = b[5] - b[2];
    if (sx < 0.70 || sz < 0.70 || sy < 0.90) continue;
    if (sx * sz > 18) continue;
    if (sy > 5.2) continue;
    if (b[1] > 2.4) continue;
    const x0 = b[0] + INSET;
    const x1 = b[3] - INSET;
    const z0 = b[2] + INSET;
    const z1 = b[5] - INSET;
    if (!(x1 > x0) || !(z1 > z0)) continue;
    const yLow = b[1] + Math.min(0.55, sy * 0.28);
    const yMid = b[1] + Math.min(1.15, sy * 0.55);
    const yHi = b[1] + Math.min(1.75, sy * 0.78);
    const ys = yHi > yMid + 0.2 ? [yLow, yMid, yHi] : [yLow, yMid];
    const xs = [x0, (x0 + x1) * 0.5, x1];
    const zs = [z0, (z0 + z1) * 0.5, z1];
    let n = 0;
    let hits = 0;
    let sample = null;
    for (let yi = 0; yi < ys.length; yi += 1) {
      for (let xi = 0; xi < 3; xi += 1) {
        for (let zi = 0; zi < 3; zi += 1) {
          const x = xs[xi];
          const y = ys[yi];
          const z = zs[zi];
          n += 1;
          const h = hit(x, y, z, x, y, z, 0.04);
          if (h.kind) {
            hits += 1;
            if (!sample) sample = { x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), kind: h.kind, index: h.index };
          }
        }
      }
    }
    const frac = hits / n;
    if (frac < 0.28) continue;
    issues.push({
      at: [+((b[0] + b[3]) * 0.5).toFixed(2), +((b[1] + b[4]) * 0.5).toFixed(2), +((b[2] + b[5]) * 0.5).toFixed(2)],
      size: [+sx.toFixed(2), +sy.toFixed(2), +sz.toFixed(2)],
      y0: +b[1].toFixed(2),
      frac: +frac.toFixed(2),
      hits,
      n,
      sample,
    });
  }
  issues.sort((a, b) => b.frac - a.frac || (b.size[0] * b.size[2]) - (a.size[0] * a.size[2]));
  return { tag: "gaps", boxes: boxes.length, issues: issues.length, list: issues };
})()`;

const steps = [
  `--out=${join(root, 'dist/gap-scan')}`,
  '--w=800',
  '--h=450',
  '--graphics=high',
  'until:!!window.__boot && window.__boot().frames > 2',
  'eval:JSON.stringify({ tag: "swap", started: (window.__setMap("city"), true) })',
  'wait:8000',
  'until:window.__map().id === "city" && window.__map().ready',
  'wait:2000',
  `eval:JSON.stringify(${SCAN})`,
];

const run = spawnSync('node', [join(root, 'scripts/shots.js'), ...steps], {
  cwd: root,
  encoding: 'utf8',
  timeout: 900000,
  maxBuffer: 64 * 1024 * 1024,
});
const text = `${run.stdout ?? ''}${run.stderr ?? ''}`;
const values = text
  .split('\n')
  .map((l) => (l.startsWith('eval ') ? l.match(/ = ("(?:[^"\\]|\\.)*")\s*$/) : null))
  .filter(Boolean)
  .map((m) => JSON.parse(JSON.parse(m[1])));
const gaps = values.find((v) => v.tag === 'gaps');
if (!gaps) {
  process.stdout.write(text.split('\n').slice(-50).join('\n'));
  throw new Error('gap-scan: the page produced no scan');
}

mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, JSON.stringify(gaps, null, 2));

const lines = [];
lines.push('');
lines.push(`boxes probed        ${gaps.boxes}`);
lines.push(`blocked interiors   ${gaps.issues}`);
lines.push('');
const top = gaps.list.slice(0, 80);
for (const w of top) {
  const s = w.sample;
  lines.push(
    `  ${String(w.frac).padStart(4)}  ${String(w.size[0]).padStart(5)} x ${String(w.size[1]).padStart(5)} x ${String(w.size[2]).padStart(5)}  `
    + `at ${w.at.join(', ')}  y0 ${w.y0}  `
    + (s ? `hit ${s.kind} #${s.index} @ ${s.x},${s.y},${s.z}` : ''),
  );
}
lines.push('');
lines.push(`written to ${jsonPath}`);
lines.push('');
process.stdout.write(lines.join('\n'));
if (run.status) {
  process.stdout.write(text.split('\n').slice(-20).join('\n'));
}
process.exit(run.status ?? 0);
