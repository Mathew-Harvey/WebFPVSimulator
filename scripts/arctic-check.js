/*
 * arctic-check.js: Hyoura Island's layout, checked in Node with no browser
 * (npm run check:arctic). It reads the same pure modules the map builds
 * from (src/maps/arctic/plan.js) and asks the questions a pilot would
 * otherwise answer by crashing:
 *
 *   - every named gap's window is clear of every solid, by the craft's
 *     radius, across its whole width and height, and stands above the
 *     ground under it;
 *   - the start is on the quay's top with nothing solid over the pads;
 *   - the island's solids fit the world's shape limit;
 *   - the plant's ground is finite everywhere on the plot, and the sea
 *     is at 0 off the land;
 *   - the hidden Konex Drone sign is where the README of the map says,
 *     on a face, inside the grotto.
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

import { arcticLayout, arcticGaps, arcticMarkSpots, SPAWN, HIDDEN_KONEX } from '../src/maps/arctic/plan.js';
import { groundAt, GROTTO, GX0, GZ0, CELL, QUAY_TOP } from '../src/maps/arctic/terrain.js';
import { arcticDocument } from '../src/maps/arctic/yard.js';

/* The five inch's sweep radius, as the shell reports it (__craft().sweepM),
 * rounded up. */
const CRAFT_R = 0.18;
const WORLD_MAX_SHAPES = 49152;

let failed = 0;
const say = (ok, what, detail = '') => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failed += 1;
  }
};

const { parts, stats } = arcticLayout();
const solids = parts.filter((p) => p.solid);

/* Distance from point to segment, squared. */
function segD2(px, py, pz, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 0 ? ((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = a[0] + dx * t - px;
  const ey = a[1] + dy * t - py;
  const ez = a[2] + dz * t - pz;
  return ex * ex + ey * ey + ez * ez;
}

/* The first solid within r of the point, or null. */
function hit(x, y, z, r) {
  for (const p of solids) {
    if (p.t === 'box') {
      const cx = Math.max(p.lo[0], Math.min(x, p.hi[0]));
      const cy = Math.max(p.lo[1], Math.min(y, p.hi[1]));
      const cz = Math.max(p.lo[2], Math.min(z, p.hi[2]));
      const d2 = (cx - x) ** 2 + (cy - y) ** 2 + (cz - z) ** 2;
      if (d2 < r * r) {
        return p;
      }
    } else if (p.t === 'cap') {
      if (segD2(x, y, z, p.a, p.b) < (p.r + r) ** 2) {
        return p;
      }
    }
  }
  return null;
}

console.log('arctic-check: Hyoura Island');
console.log(`  parts ${parts.length}, solids ${solids.length}, cliff runs ${stats.rim}`);

say(solids.length < WORLD_MAX_SHAPES / 4, 'the solids fit well inside the world shape limit', `${solids.length} of ${WORLD_MAX_SHAPES}`);

/* THE GAPS. Their windows sampled every 25 cm, on the plane through the
 * gap's foot and a metre either side along its axis. */
for (const g of arcticGaps()) {
  let blocked = null;
  let samples = 0;
  for (let s = -1; s <= 1 && !blocked; s += 0.5) {
    for (let u = -g.w / 2; u <= g.w / 2 + 1e-9 && !blocked; u += 0.25) {
      for (let y = g.h0; y <= g.h1 + 1e-9 && !blocked; y += 0.25) {
        const x = g.along === 'x' ? g.x + s : g.x + u;
        const z = g.along === 'x' ? g.z + u : g.z + s;
        samples += 1;
        const p = hit(x, y, z, CRAFT_R);
        if (p) {
          blocked = { x, y, z, name: p.name };
        }
      }
    }
  }
  say(!blocked, `${g.name} (${g.points}) is clear, ${g.w.toFixed(1)} by ${(g.h1 - g.h0).toFixed(1)} m`,
    blocked ? `${blocked.name} at ${blocked.x.toFixed(2)}, ${blocked.y.toFixed(2)}, ${blocked.z.toFixed(2)}` : `${samples} points`);
  const floor = groundAt(g.x, g.z);
  say(floor < g.h0, `${g.name} stands above its ground`, `ground ${floor.toFixed(2)}, sill ${g.h0.toFixed(2)}`);
  say(g.w >= 1.4, `${g.name} is wider than the builder's least gap`);
}

/* The document names them all, with points. */
const doc = arcticDocument();
const named = doc.elements.filter((e) => e.type === 'gap');
say(named.length === arcticGaps().length && named.every((e) => e.name && e.points > 0), 'every gap is in the document, named, with points', `${named.length}`);

/* THE START. */
let overPads = null;
for (let dx = -3; dx <= 3; dx += 0.5) {
  for (let dz = -3; dz <= 3; dz += 0.5) {
    const p = hit(SPAWN.x + dx, QUAY_TOP + 0.6, SPAWN.z + dz, CRAFT_R);
    if (p) {
      overPads = p.name;
    }
  }
}
say(!overPads, 'nothing solid over the start pads', overPads || '');
say(SPAWN.y === QUAY_TOP, 'the start is on the quay top', `${SPAWN.y}`);

/* THE GROUND, every 1.5 m over the plot. */
let bad = 0;
let seaOff = 0;
for (let x = -500; x <= 500; x += 1.5) {
  for (let z = -500; z <= 500; z += 1.5) {
    const h = groundAt(x, z);
    if (!Number.isFinite(h) || h < 0 || h > 200) {
      bad += 1;
    }
    if ((x < GX0 || z < GZ0) && h !== 0) {
      seaOff += 1;
    }
  }
}
say(bad === 0, 'the ground is finite and between the sea and 200 m everywhere');
say(seaOff === 0, 'off the land the ground is the sea, at 0');

/* THE HIDDEN SIGN. */
const k = arcticMarkSpots().find((s) => s.slug === 'konexdrone');
const gx0 = GX0 + GROTTO.i0 * CELL;
const gx1 = GX0 + (GROTTO.i1 + 1) * CELL;
say(Boolean(k), 'the hidden Konex Drone sign is placed');
if (k) {
  say(k.key === 'arctic#konexdrone~hidden', 'it keys as a hidden mark', k.key);
  say(k.p[0] > gx0 && k.p[0] < gx1 && k.p[2] === GZ0 + (GROTTO.j1 + 1) * CELL, 'it is on the grotto\'s back wall', k.p.map((v) => v.toFixed(1)).join(', '));
  say(k.p[1] === HIDDEN_KONEX.p[1] && k.p[1] < 9, 'it is under the grotto\'s roof', `${k.p[1]} m up`);
}
say(arcticMarkSpots(() => false).length === 0, 'with no partner allowed (the Steam edition), no mark is placed');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
