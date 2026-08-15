/*
 * report.mjs: what each .trk actually contains, read through course.mjs.
 *
 * Usage, from the simulator root:
 *   node tracks/report.mjs                        summary of every track
 *   node tracks/report.mjs "WCMRC Round 5.trk"    every stop, in flying order
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

import { readCourse, isDive } from './course.mjs';
import { docYaw } from './trk.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const deg = (r) => (r * 180 / Math.PI);
const f2 = (n) => Number(n).toFixed(2).padStart(7);

function tally(course) {
  const c = {
    mesh: 0, flag: 0, cone: 0, cpGate: 0, waypoint: 0, dives: 0, repeats: 0, stacks: 0, passes: 0,
  };
  for (const s of course.stops) {
    if (s.repeatOf != null) {
      c.repeats += 1;
    }
    if (s.role === 'flag') {
      c.flag += 1;
    } else if (s.role === 'cone') {
      c.cone += 1;
    } else if (s.role === 'waypoint') {
      c.waypoint += 1;
    } else if (s.mesh === 'checkpoint') {
      c.cpGate += 1;
    } else {
      c.mesh += 1;
    }
  }
  for (const site of course.sites) {
    if (site.levels.length > 1) {
      c.stacks += 1;
    }
    if (site.members.length > site.levels.length) {
      c.passes += site.members.length - site.levels.length;
    }
    if (isDive(site)) {
      c.dives += 1;
    }
  }
  return c;
}

const args = process.argv.slice(2);

if (!args.length) {
  const files = (await readdir(here)).filter((f) => f.endsWith('.trk')).sort();
  console.log(
    `${'track'.padEnd(50)}${'stops'.padStart(6)}${'sites'.padStart(6)}${'mesh'.padStart(6)}`
    + `${'cp=gate'.padStart(8)}${'waypt'.padStart(7)}${'flag'.padStart(6)}${'cone'.padStart(6)}`
    + `${'dive'.padStart(6)}${'stack'.padStart(7)}${'again'.padStart(7)}${'dup'.padStart(5)}  floor`,
  );
  for (const file of files) {
    const course = readCourse(await readFile(join(here, file), 'utf8'));
    const c = tally(course);
    console.log(
      `${file.padEnd(50)}${String(course.stops.length).padStart(6)}${String(course.sites.length).padStart(6)}`
      + `${String(c.mesh).padStart(6)}${String(c.cpGate).padStart(8)}${String(c.waypoint).padStart(7)}`
      + `${String(c.flag).padStart(6)}${String(c.cone).padStart(6)}${String(c.dives).padStart(6)}`
      + `${String(c.stacks).padStart(7)}${String(c.passes).padStart(7)}${String(c.repeats).padStart(5)}`
      + `  ${course.floor.toFixed(2)}  scene ${course.sceneId}`,
    );
  }
  console.log('\nmesh: a real gate object.  cp=gate: an invisible checkpoint standing in for a hole.');
  console.log('waypt: a checkpoint too big to be a gate, so nothing is standing there.');
  console.log('stack: sites with more than one hole.  again: extra passes through a hole already flown.');
  console.log('dup: consecutive repeats, which are dropped because two knots in one place have no direction.');
} else {
  for (const file of args) {
    const course = readCourse(await readFile(join(here, file), 'utf8'));
    console.log(`\n${'='.repeat(112)}\n${course.sourceName}   scene ${course.sceneId}   floor ${course.floor.toFixed(2)} m`);
    console.log(`  ord  becomes    prefab      x       z     agl   docYaw   tilt   opening    site/hole  notes`);
    for (const s of course.stops) {
      const site = course.sites[s.siteId];
      const notes = [];
      if (s.mesh === 'checkpoint' && s.role === 'gate') {
        notes.push('invisible checkpoint read as a hole');
      }
      if (s.repeatOf != null) {
        notes.push(`consecutive repeat of ${s.repeatOf}, dropped`);
      } else if (site.members.filter((m) => m.level === s.level).length > 1) {
        notes.push('another pass of this hole');
      }
      if (site.levels.length > 1) {
        notes.push(`${site.levels.length} holes here`);
      }
      if (isDive(site)) {
        notes.push(`tilted ${deg(site.tilt).toFixed(0)} deg, flown down through`);
      }
      if (site.pennants.length) {
        notes.push(`${site.pennants.length} pennant(s)`);
      }
      if (s.start) {
        notes.push('START and FINISH');
      }
      console.log(
        `  ${String(s.order).padStart(3)}  ${s.role.padEnd(9)}${String(s.prefab).padStart(6)}`
        + ` ${f2(s.x)} ${f2(s.z)} ${f2(s.agl)}  ${deg(docYaw(s.heading)).toFixed(1).padStart(7)}`
        + ` ${deg(s.tilt).toFixed(1).padStart(6)}`
        + `  ${s.opening ? `${s.opening.clearW.toFixed(2)}x${s.opening.clearH.toFixed(2)}` : '    -    '}`
        + `   ${String(s.siteId).padStart(3)}/${s.level}   ${notes.join('; ')}`,
      );
    }
    const pennants = course.props.filter((p) => p.attachedTo != null);
    const loose = course.props.filter((p) => p.attachedTo == null && (p.role === 'flag' || p.role === 'cone'));
    console.log(`  pennants folded into gates: ${pennants.length}`);
    console.log(`  markers placed as scenery, not in the order: ${loose.length}`);
    for (const p of loose) {
      let near = Infinity;
      for (const site of course.sites) {
        near = Math.min(near, Math.hypot(site.x - p.x, site.z - p.z));
      }
      console.log(`    ${p.role} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}, ${p.agl.toFixed(2)} m up, nearest site ${near.toFixed(2)} m`);
    }
    console.log(`  start grid in the barriers: ${course.grid ? `${course.grid.x.toFixed(1)}, ${course.grid.z.toFixed(1)}` : 'none'}`);
  }
}
