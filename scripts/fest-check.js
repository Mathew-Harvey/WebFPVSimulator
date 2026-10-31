/*
 * fest-check.js: Tonbo Fest's place, in Node. `npm run check:fest`.
 *
 * The venue builds, every number in it is finite, every colour it names is
 * in the kit's table, every sign it hangs is painted, the race has its
 * sixteen gates in order and every named gap is a window a quad fits
 * through with nothing solid in it, the pilot is seated on open ground with
 * nothing in the first line, the hidden Konex Drone sign is where the map
 * says, and the same venue and the same document come out twice.
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
import { venueLayout, w, SPAWN, GATES, HIDDEN_KONEX, SLUICE, BANNERS } from '../src/maps/fest/venue.js';
import { festDocument } from '../src/maps/fest/yard.js';
import { seatDocument, indexTops, topUnder } from '../src/maps/built/place.js';
import { placeSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';

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

const L = venueLayout();
console.log('the venue');
check('it has parts, ops, signs, gaps and people', L.parts.length > 500 && L.ops.length > 100 && L.signs.length > 50 && L.gaps.length >= 25 && L.fans.length > 100,
  `${L.parts.length} parts, ${L.ops.length} ops, ${L.signs.length} signs, ${L.gaps.length} gaps, ${L.fans.length} people`);

/* Every number finite: one NaN in a part sends the camera's collider or a
 * batch's bounds to NaN, and the map draws nothing. */
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

/* Every colour named is in the kit's table: the kit throws on a name it
 * does not know, which in the page is a map that never finishes. The
 * table is kit.js's own and each family's MATERIALS, read as source. */
const known = new Set();
for (const f of ['kit.js', 'homes.js', 'fest.js', 'street.js', 'course.js']) {
  let src = '';
  try {
    src = readFileSync(new URL(`../src/props/${f}`, import.meta.url), 'utf8');
  } catch {
    continue;
  }
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
  for (const k of ['m', 'stripe']) {
    if (typeof o[k] === 'string') {
      used.add(o[k]);
    }
  }
}
for (const f of L.fans) {
  used.add(f.shirt);
}
const index = readFileSync(new URL('../src/maps/fest/index.js', import.meta.url), 'utf8');
for (const m of index.matchAll(/'((?:fs|dr|mx|qb)[A-Z][a-zA-Z0-9]*|lampRed|rope|white|metal|craneYellow|net)'/g)) {
  used.add(m[1]);
}
const unknown = [...used].filter((m) => !known.has(m));
check('every colour is in the kit\'s table', unknown.length === 0, `${used.size} colours${unknown.length ? `, unknown: ${unknown.join(', ')}` : ''}`);

/* The atlas's keys, read from ./signs.js as source: it paints with the
 * town's painters, which need three and a canvas, so Node reads the table's
 * names rather than load it. The numbers, flags, teams and stalls are made
 * in loops there, and named here as the loops make them. */
const signSrc = readFileSync(new URL('../src/maps/fest/signs.js', import.meta.url), 'utf8');
const keys = new Set([...signSrc.matchAll(/^  ([a-zA-Z0-9]+): \[/gm)].map((m) => m[1]));
const nobori = (signSrc.match(/^const NOBORI = \[([\s\S]*?)^\];/m) || ['', ''])[1].split('{').length - 1;
const teams = (signSrc.match(/^const TEAMS = \[([\s\S]*?)^\];/m) || ['', ''])[1].split('{').length - 1;
for (let n = 1; n <= 16; n += 1) {
  keys.add(`num${n}`);
}
for (let i = 0; i < 5; i += 1) {
  keys.add(`stall${i}`);
}
for (let i = 0; i < nobori; i += 1) {
  keys.add(`nobori${i}`);
}
for (let i = 0; i < teams; i += 1) {
  keys.add(`team${i}`);
}
const unpainted = [...new Set(L.signs.map((s) => s.key))].filter((k) => !keys.has(k));
check('every sign is painted', unpainted.length === 0, unpainted.join(', '));

console.log('the race');
const gates = L.gaps.filter((g) => /^GATE \d+$/.test(g.name)).map((g) => Number(g.name.slice(5)));
const order = [...new Set(gates)].sort((a, b) => a - b);
check('sixteen gates, numbered 1 to 16', GATES.length === 16 && order.length === 16 && order[0] === 1 && order[15] === 16, order.join(','));
check('a dive gate in the race', GATES.some((g) => g.kind === 'dive'));
const names = L.gaps.map((g) => g.name);
const dupes = names.filter((n, i) => names.indexOf(n) !== i && !/^GATE \d+$/.test(n));
check('every other named gap has a name of its own', dupes.length === 0, dupes.join(', '));
const tiers = new Set([100, 250, 500, 1000, 2500]);
check('every gap scores a tier', L.gaps.every((g) => tiers.has(g.points)));
/* A gap is registered a quarter metre inside its hole on every side
 * (MARGIN in ./venue.js), so a window of 0.8 m is a hole of 1.3 m. */
const tight = L.gaps.filter((g) => g.w + 0.5 < 1.3 || g.h + 0.5 < 1.3);
check('every gap is a hole of 1.3 m or more each way', tight.length === 0, tight.map((g) => g.name).join(', '));

/* Nothing solid in a gap's window: a box that takes in the window's middle
 * makes the gap one nobody can fly. Plan to world as ./venue.js has it. */
const inside = (p, x, y, z) => (p.t === 'box'
  ? x > Math.min(p.lo[0], p.hi[0]) && x < Math.max(p.lo[0], p.hi[0]) && y > Math.min(p.lo[1], p.hi[1]) && y < Math.max(p.lo[1], p.hi[1])
    && z > Math.min(p.lo[2], p.hi[2]) && z < Math.max(p.lo[2], p.hi[2])
  : false);
const blocked = [];
for (const g of L.gaps) {
  const [x, y, z] = w(g.x, g.y, g.z + g.h / 2);
  const hit = L.parts.find((p) => p.solid && inside(p, x, y, z));
  if (hit) {
    blocked.push(`${g.name} (${hit.name || hit.m})`);
  }
}
check('no solid in the middle of a named gap', blocked.length === 0, blocked.slice(0, 6).join(', '));

console.log('the start');
const doc = festDocument(L.gaps);
check('the document is the same every build', JSON.stringify(festDocument(venueLayout().gaps)) === JSON.stringify(doc));
check('the venue is the same every build', JSON.stringify(venueLayout()) === JSON.stringify(L));
{
  const n = normalize(doc);
  check('the document normalises', Boolean(n && n.doc), n && n.problems ? `${n.problems.length} problems` : '');
  const { placed } = seatDocument(n.doc);
  placeSolids(L.parts, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
  placed.tops = indexTops(placed.solids);
  const sp = placed.spawn;
  sp.y = topUnder(placed.tops, sp.x, sp.z, sp.base);
  check('the pilot is seated on the ground at the pads', sp.from === 'pads' && Math.abs(sp.y) < 0.2, `${sp.y.toFixed(2)} m at ${sp.x.toFixed(1)}, ${sp.z.toFixed(1)}`);
  /* The first line: 18 m along the pads' heading, two metres up, clear. */
  const [sx, , sz] = w(SPAWN.x, SPAWN.y);
  let hit = null;
  for (let d = 1; d < 18 && !hit; d += 0.25) {
    const x = sx + d * Math.sin(SPAWN.deg * Math.PI / 180);
    const z = sz - d * Math.cos(SPAWN.deg * Math.PI / 180);
    hit = L.parts.find((p) => p.solid && inside(p, x, 1.5, z));
  }
  check('the first line off the pads is clear', !hit, hit ? hit.name || hit.m : '18 m');
}

console.log('the marks');
check('the hidden sign is in the sluice culvert', HIDDEN_KONEX.x > SLUICE.x0 && HIDDEN_KONEX.x < SLUICE.x1 && HIDDEN_KONEX.h + 0.4 < SLUICE.top);
check('ten partner banners on the nets', BANNERS.length === 10);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
