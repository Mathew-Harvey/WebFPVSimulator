/*
 * concert-check.js: Hanabi Sound's venue, held to its gaps, its start, its
 * crowd and its marks, in plain Node (src/maps/concert/venue.js is pure).
 * Tonbo Fest's check (./fest-check.js) with two things more: a gap is
 * tested over its whole window against every solid, capsules included,
 * not only at its middle against boxes, because this venue's openings are
 * mostly between tubes (scaffold, truss, the wheel's spokes); and the
 * crowd is held to its blocks, so nobody is drawn standing where a quad
 * could fly through them.
 *
 * Run with: npm run check:concert
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

import { readFileSync } from 'node:fs';
import {
  venueLayout, w, SPAWN, HIDDEN_KONEX, DELAYS, DELAY, BANNERS, CROWD_BLOCKS, CROWD_H,
} from '../src/maps/concert/venue.js';
import { concertDocument } from '../src/maps/concert/yard.js';
import { seatDocument, indexTops, topUnder } from '../src/maps/built/place.js';
import { placeSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { MAPS, CONCERT_DOC_ID } from '../src/maps/registry.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `: ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}

/* The craft's radius (CRAFT_WORLD_R in src/game/collide.js). */
const CRAFT_R = 0.17;

const L = venueLayout();
console.log('the venue');
check('it has parts, ops, signs, gaps, people and a crowd',
  L.parts.length > 400 && L.ops.length > 100 && L.signs.length > 12 && L.gaps.length >= 15 && L.fans.length > 60 && L.crowd.length > 3000,
  `${L.parts.length} parts, ${L.ops.length} ops, ${L.signs.length} signs, ${L.gaps.length} gaps, ${L.fans.length} people, ${L.crowd.length} in the crowd`);

const bad = [];
const finite = (v, path) => {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      bad.push(path);
    }
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => finite(x, `${path}[${i}]`));
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      finite(x, `${path}.${k}`);
    }
  }
};
finite(L, 'venue');
check('every number is finite', bad.length === 0, bad.slice(0, 5).join(', '));

/* Every colour named is in the kit's table, read as source. */
const known = new Set();
for (const f of ['kit.js', 'homes.js', 'fest.js', 'concert.js', 'street.js', 'course.js']) {
  const src = readFileSync(new URL(`../src/props/${f}`, import.meta.url), 'utf8');
  for (const m of src.matchAll(/(?:^|[\s,{])([a-zA-Z][a-zA-Z0-9]*): \{ ?(?:c|f|net|tex|map):/gm)) {
    known.add(m[1]);
  }
}
const used = new Set();
for (const p of L.parts) {
  if (p.draw !== false && p.m) {
    used.add(p.m);
  }
}
for (const o of L.ops) {
  if (typeof o.m === 'string') {
    used.add(o.m);
  }
}
for (const f of L.fans) {
  used.add(f.shirt);
}
const index = readFileSync(new URL('../src/maps/concert/index.js', import.meta.url), 'utf8');
for (const m of index.matchAll(/kit\.\w+\('([a-zA-Z0-9]+)'/g)) {
  used.add(m[1]);
}
const unknown = [...used].filter((m) => !known.has(m));
check('every colour is in the kit\'s table', unknown.length === 0, `${used.size} colours${unknown.length ? `, unknown: ${unknown.join(', ')}` : ''}`);

const signSrc = readFileSync(new URL('../src/maps/concert/signs.js', import.meta.url), 'utf8');
const keys = new Set([...signSrc.matchAll(/^  ([a-zA-Z0-9]+): \[/gm)].map((m) => m[1]));
const trucks = (signSrc.match(/^const TRUCKS = \[([\s\S]*?)^\];/m) || ['', ''])[1].split('{').length - 1;
for (let i = 0; i < trucks; i += 1) {
  keys.add(`truck${i}`);
}
const unpainted = [...new Set(L.signs.map((s) => s.key))].filter((k) => !keys.has(k));
check('every sign is painted', unpainted.length === 0, unpainted.join(', '));

console.log('the gaps');
const names = L.gaps.map((g) => g.name);
const dupes = names.filter((n, i) => names.indexOf(n) !== i);
check('every named gap has a name of its own', dupes.length === 0, dupes.join(', '));
const tiers = new Set([100, 250, 500, 1000, 2500]);
check('every gap scores a tier', L.gaps.every((g) => tiers.has(g.points)));
const tight = L.gaps.filter((g) => g.w + 0.5 < 1.3 || g.h + 0.5 < 1.3);
check('every gap is a hole of 1.3 m or more each way', tight.length === 0, tight.map((g) => g.name).join(', '));

/* The distance from a point to a solid part, in the world. Negative is
 * inside. */
function distTo(p, x, y, z) {
  if (p.t === 'box') {
    const dx = Math.max(p.lo[0] - x, 0, x - p.hi[0]);
    const dy = Math.max(p.lo[1] - y, 0, y - p.hi[1]);
    const dz = Math.max(p.lo[2] - z, 0, z - p.hi[2]);
    const out = Math.hypot(dx, dy, dz);
    if (out > 0) {
      return out;
    }
    return -Math.min(x - p.lo[0], p.hi[0] - x, y - p.lo[1], p.hi[1] - y, z - p.lo[2], p.hi[2] - z);
  }
  const ax = p.a[0];
  const ay = p.a[1];
  const az = p.a[2];
  const bx = p.b[0] - ax;
  const by = p.b[1] - ay;
  const bz = p.b[2] - az;
  const len2 = bx * bx + by * by + bz * bz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / len2)) : 0;
  return Math.hypot(x - (ax + bx * t), y - (ay + by * t), z - (az + bz * t)) - p.r;
}

/*
 * Every gap's window, sampled on a grid of points across it, clear of
 * every solid by more than the craft's radius. A gap's window is already
 * a quarter metre inside its hole, so a solid within the craft's radius of
 * the window is a solid in the hole.
 */
const solids = L.parts.filter((p) => p.solid);
const blocked = [];
for (const g of L.gaps) {
  const rad = (g.deg * Math.PI) / 180;
  /* Across the window: the heading turned left a quarter. */
  const ax = -Math.sin(rad);
  const ay = Math.cos(rad);
  let hit = null;
  for (let i = 0; i <= 8 && !hit; i += 1) {
    for (let j = 0; j <= 6 && !hit; j += 1) {
      const s = (i / 8 - 0.5) * g.w;
      const h = g.z + (j / 6) * g.h;
      const [x, y, z] = w(g.x + ax * s, g.y + ay * s, h);
      const p = solids.find((q) => distTo(q, x, y, z) < CRAFT_R);
      if (p) {
        hit = `${p.name || p.m} at ${s.toFixed(1)}, ${h.toFixed(1)}`;
      }
    }
  }
  if (hit) {
    blocked.push(`${g.name} (${hit})`);
  }
}
check('every gap\'s window is clear of every solid', blocked.length === 0, blocked.slice(0, 8).join('; '));

/* And flown: a line through each window along its heading, two metres
 * each side, clear at the window's middle. */
const shut = [];
for (const g of L.gaps) {
  const rad = (g.deg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  for (let d = -2; d <= 2; d += 0.25) {
    const [x, y, z] = w(g.x + dx * d, g.y + dy * d, g.z + g.h / 2);
    const p = solids.find((q) => distTo(q, x, y, z) < CRAFT_R);
    if (p) {
      shut.push(`${g.name} (${p.name || p.m} at ${d} m)`);
      break;
    }
  }
}
check('every gap can be flown straight through', shut.length === 0, shut.slice(0, 8).join('; '));

console.log('the crowd');
const outside = L.crowd.filter((f) => !CROWD_BLOCKS.some((b) => f.x > b.x0 + 0.1 && f.x < b.x1 - 0.1 && f.y > b.y0 + 0.1 && f.y < b.y1 - 0.1));
check('everybody in the crowd stands inside a solid block', outside.length === 0, `${outside.length} outside`);
check('the blocks reach head height', CROWD_H >= 1.65, `${CROWD_H} m`);
const front = L.crowd.filter((f) => f.x > 180).length / (12 * (CROWD_BLOCKS[3].y1 - CROWD_BLOCKS[3].y0 + CROWD_BLOCKS[4].y1 - CROWD_BLOCKS[4].y0));
check('packed at the barrier', front > 0.9, `${front.toFixed(2)} a square metre`);

console.log('the start');
const doc = concertDocument(L.gaps);
check('the document is the same every build', JSON.stringify(concertDocument(venueLayout().gaps)) === JSON.stringify(doc));
check('the venue is the same every build', JSON.stringify(venueLayout()) === JSON.stringify(L));
check('the document has the registry\'s id', doc.id === CONCERT_DOC_ID && MAPS.some((m) => m.id === 'concert'));
{
  const n = normalize(doc);
  check('the document normalises', Boolean(n && n.doc), n && n.problems ? `${n.problems.length} problems` : '');
  const { placed } = seatDocument(n.doc);
  placeSolids(L.parts, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
  placed.tops = indexTops(placed.solids);
  const sp = placed.spawn;
  sp.y = topUnder(placed.tops, sp.x, sp.z, sp.base);
  check('the pilot is seated on the ground at the pad', sp.from === 'pads' && Math.abs(sp.y) < 0.2, `${sp.y.toFixed(2)} m at ${sp.x.toFixed(1)}, ${sp.z.toFixed(1)}`);
  const [sx, , sz] = w(SPAWN.x, SPAWN.y);
  let hit = null;
  for (let d = 1; d < 18 && !hit; d += 0.25) {
    const x = sx + d * Math.cos(SPAWN.deg * Math.PI / 180);
    const z = sz - d * Math.sin(SPAWN.deg * Math.PI / 180);
    hit = solids.find((p) => distTo(p, x, 1.5, z) < CRAFT_R);
  }
  check('the first line off the pad is clear', !hit, hit ? hit.name || hit.m : '18 m');
}

console.log('the marks');
const D = DELAYS[1];
check('the hidden sign is inside the north delay tower', Math.abs(HIDDEN_KONEX.x - D.x) < DELAY.half && Math.abs(HIDDEN_KONEX.y - D.y) < DELAY.half);
check('ten partner banners', BANNERS.length === 10);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
