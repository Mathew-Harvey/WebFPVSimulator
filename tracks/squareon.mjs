/*
 * squareon.mjs: which imported gates cannot be flown as ordered.
 *
 * A gate is a hole. You go through it along its normal, so if the authored
 * normal is square to the direction the lap travels through that gate, the
 * lap cannot use the hole: from the cockpit it is a gate standing sideways
 * across the course. This lists every one, per track, with the angle.
 *
 * Read only.
 *
 * Usage, from the simulator root:  node tracks/squareon.mjs
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCourse } from './course.mjs';
import { TRK_FILES } from './sources.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DEG = 180 / Math.PI;

let total = 0;
for (const spec of TRK_FILES) {
  const course = readCourse(await readFile(join(here, spec.file), 'utf8'), spec.name);
  const stops = course.stops.filter((s) => s.repeatOf == null);
  const bad = [];
  for (let i = 0; i < stops.length; i += 1) {
    const s = stops[i];
    const site = course.sites[s.siteId];
    if (site.role !== 'gate' || !site.headingTrusted) {
      continue;
    }
    const before = stops[(i - 1 + stops.length) % stops.length];
    const after = stops[(i + 1) % stops.length];
    /* Entry and exit separately. The chord between the neighbours is the
     * bisector of the turn and condemns a perfectly placed gate at a corner;
     * see course.mjs. */
    let best = 0;
    for (const [dx, dz] of [[s.x - before.x, s.z - before.z], [after.x - s.x, after.z - s.z]]) {
      const len = Math.hypot(dx, dz);
      if (len < 1) {
        continue;
      }
      best = Math.max(best, Math.abs((Math.sin(site.heading) * dx + Math.cos(site.heading) * dz) / len));
    }
    const off = Math.acos(Math.min(1, best)) * DEG;
    if (best > 0 && off > 60) {
      bad.push({ order: s.order, off, site });
    }
  }
  if (bad.length) {
    total += bad.length;
    console.log(`\n${spec.name}: ${bad.length} of ${stops.length}`);
    for (const b of bad) {
      console.log(`   stop ${String(b.order).padStart(3)}  prefab ${String(b.site.members[0].prefab).padStart(4)}`
        + `  normal is ${b.off.toFixed(0)} deg off the way the lap goes through it`
        + `  at ${b.site.x.toFixed(1)}, ${b.site.z.toFixed(1)}`);
    }
  }
}
console.log(`\n${total} gates cannot be flown on their authored heading.`);
