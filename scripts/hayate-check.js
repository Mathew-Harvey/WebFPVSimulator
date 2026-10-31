/*
 * hayate-check.js: Hayate Circuit (src/maps/hayate/), checked in Node with
 * no browser, as scripts/sunny-check.js checks Sunnyfield. It builds the
 * circuit's layout twice and compares them to the bit, places it as the
 * built map does, flies its lines, proves every named gap clear by the
 * craft's radius, looks for slots too narrow to pass, and checks the race
 * cars fit the module's traffic: every car on the course, one speed table,
 * no pair able to catch another. Seconds, no browser.
 *
 *   node scripts/hayate-check.js        (npm run check:hayate)
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hayateLayout, hayateGaps, SPAWN } from '../src/maps/hayate/layout.js';
import { hayateDocument, hayateMaples, RACE_GROUPS } from '../src/maps/hayate/yard.js';
import { w } from '../src/maps/hayate/frame.js';
import { SIGN_KEYS } from '../src/maps/hayate/signs.js';
import { PIT, TOWER } from '../src/maps/hayate/pits.js';
import { MAIN, BRIDGE, TYRE, TYRE_HOLE, GANTRY } from '../src/maps/hayate/stands.js';
import { WHEEL } from '../src/maps/hayate/park.js';
import { STRAIGHT } from '../src/maps/hayate/track.js';
import { MATERIALS as FAMILY_MATERIALS } from '../src/props/homes.js';
import { GAP_MIN } from '../src/props/parts.js';
import { placeSolids } from '../src/props/solids.js';
import { treeLayout } from '../src/props/street.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument, indexTops, topUnder } from '../src/maps/built/place.js';
import { trafficOf } from '../src/maps/built/traffic.js';
import { CRAFT_WORLD_R } from '../src/game/collide.js';
import { sincos } from '../src/props/trig.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;

function check(name, ok, detail = '') {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

const r3 = (v) => Math.round(v * 1000) / 1000;
/* The swept ball: twice the craft's radius. */
const BALL = 2 * CRAFT_WORLD_R;

/* ------------------------------------------------------------------ */
/* Geometry, as bardwell-check.js has it                               */
/* ------------------------------------------------------------------ */

function boxDist(b, p) {
  const dx = Math.max(b[0] - p[0], 0, p[0] - b[3]);
  const dy = Math.max(b[1] - p[1], 0, p[1] - b[4]);
  const dz = Math.max(b[2] - p[2], 0, p[2] - b[5]);
  return Math.hypot(dx, dy, dz);
}

function segDist(c, p) {
  const ab = [c[3] - c[0], c[4] - c[1], c[5] - c[2]];
  const ap = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const L = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = L > 0 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L)) : 0;
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t) - c[6];
}

function hitAt(solids, p, r) {
  for (const s of solids) {
    const d = s.box ? boxDist(s.box, p) : segDist(s.cap, p);
    if (d < r) {
      return s;
    }
  }
  return null;
}

function gridOf(solids, cell = 4) {
  const map = new Map();
  const key = (i, k) => `${i},${k}`;
  for (const s of solids) {
    const b = s.box ?? [
      Math.min(s.cap[0], s.cap[3]) - s.cap[6], 0, Math.min(s.cap[2], s.cap[5]) - s.cap[6],
      Math.max(s.cap[0], s.cap[3]) + s.cap[6], 0, Math.max(s.cap[2], s.cap[5]) + s.cap[6],
    ];
    for (let i = Math.floor(b[0] / cell); i <= Math.floor(b[3] / cell); i += 1) {
      for (let k = Math.floor(b[2] / cell); k <= Math.floor(b[5] / cell); k += 1) {
        const kk = key(i, k);
        if (!map.has(kk)) {
          map.set(kk, []);
        }
        map.get(kk).push(s);
      }
    }
  }
  return (p) => {
    const out = new Set();
    for (let i = Math.floor((p[0] - 2) / cell); i <= Math.floor((p[0] + 2) / cell); i += 1) {
      for (let k = Math.floor((p[2] - 2) / cell); k <= Math.floor((p[2] + 2) / cell); k += 1) {
        for (const s of map.get(key(i, k)) ?? []) {
          out.add(s);
        }
      }
    }
    return [...out];
  };
}

/* ------------------------------------------------------------------ */
/* 1. The layout                                                       */
/* ------------------------------------------------------------------ */

function hashOf(L) {
  const h = createHash('sha256');
  const buf = new Float64Array(1);
  const num = (v) => {
    buf[0] = v;
    h.update(Buffer.from(buf.buffer));
  };
  for (const p of L.parts) {
    h.update(`${p.t}|${p.m}|${p.solid}|${p.draw}|${p.kind}`);
    for (const v of p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]) {
      num(v);
    }
  }
  h.update(JSON.stringify(L.ops));
  h.update(JSON.stringify(L.signs));
  h.update(JSON.stringify(hayateDocument()));
  return h.digest('hex');
}

/* Every number in an op, a sign or a part, for the finite test. */
function numbersOf(o) {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'number') {
      out.push(v);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(o);
  return out;
}

function layoutBlock() {
  console.log('\n1. layout');
  const L = hayateLayout();
  const bad = [...L.parts, ...L.ops, ...L.signs].filter((p) => numbersOf(p).some((v) => !Number.isFinite(v)));
  check('every part, draw op and sign is finite', bad.length === 0,
    `${L.parts.length} parts, ${L.ops.length} ops, ${L.signs.length} signs, ${bad.length} with a non-finite number`);
  const own = new Set(Object.keys(FAMILY_MATERIALS));
  const colours = new Set([...L.parts.filter((p) => p.draw !== false).map((p) => p.m), ...L.ops.map((o) => o.m).filter(Boolean)]);
  const unknown = [...colours].filter((m) => m.startsWith('hy') && !own.has(m));
  check('every hy colour drawn is in src/props/homes.js', unknown.length === 0, unknown.join(', ') || `${colours.size} colours`);
  const keys = new Set(L.signs.map((s) => s.key));
  const unpainted = [...keys].filter((k) => !SIGN_KEYS.includes(k));
  check('every sign hung is painted', unpainted.length === 0, unpainted.join(', ') || `${keys.size} signs, ${L.signs.length} hung`);
  const a = hashOf(L);
  const b = hashOf(hayateLayout());
  check('two builds are the same to the bit', a === b, a.slice(0, 16));
  console.log(`        ${L.parts.filter((p) => p.solid).length} solids, ${L.parts.filter((p) => p.draw !== false).length} drawn parts, ${L.ops.length} draw ops, ${hayateMaples().length} maples`);
  return L;
}

/* ------------------------------------------------------------------ */
/* 2. Placed as the built map places it                                */
/* ------------------------------------------------------------------ */

async function worldLimits() {
  const src = await readFile(join(root, 'src/native/world.c'), 'utf8');
  const def = (name) => {
    const m = src.match(new RegExp(`#define ${name} \\(?([0-9.]+)(?: << ([0-9]+))?`));
    if (!m) {
      throw new Error(`src/native/world.c has no ${name}`);
    }
    return m[2] ? Number(m[1]) * 2 ** Number(m[2]) : Number(m[1]);
  };
  return { shapes: def('WORLD_MAX_SHAPES') };
}

/* The maples' solids, as ./index.js makes them. */
function mapleParts() {
  const out = [];
  for (const el of hayateMaples()) {
    const p = w(el.position.x, el.position.y, 0);
    for (const q of treeLayout(el)) {
      if (q.t === 'cap') {
        out.push({ ...q, a: [q.a[0] + p[0], q.a[1], q.a[2] + p[2]], b: [q.b[0] + p[0], q.b[1], q.b[2] + p[2]] });
      }
    }
  }
  return out;
}

async function placedBlock(L) {
  console.log('\n2. placed');
  const { doc, repairs } = normalize(hayateDocument());
  check('the document normalizes with no repairs', repairs.length === 0, repairs.join(' | ') || `${doc.elements.length} elements`);
  const { placed } = seatDocument(doc);
  const first = placed.solids.length;
  placeSolids([...L.parts, ...mapleParts()], 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
  const own = placed.solids.slice(first);
  placed.tops = indexTops(placed.solids);
  const sp = placed.spawn;
  sp.y = topUnder(placed.tops, sp.x, sp.z, PIT.top);
  check('the start is the pads', sp.from === 'pads', sp.from);
  check('the start is seated on the pit roof', Math.abs(sp.y - SPAWN.h) < 0.05, `${r3(sp.y)} m`);
  check('nothing inflated', (placed.stats.inflated || 0) === 0, `${placed.stats.inflated || 0}`);
  const near = gridOf(placed.solids);
  const over = [sp.x, sp.y + 0.6, sp.z];
  const hit = hitAt(near(over), over, 0.5);
  check('a ball a metre across over the start is clear', !hit, hit ? hit.name : 'clear');
  const lim = await worldLimits();
  check(`the map's ${placed.solids.length} shapes are under world.c's WORLD_MAX_SHAPES`, placed.solids.length < lim.shapes, `${lim.shapes}`);
  return { placed, near, own, doc };
}

/* ------------------------------------------------------------------ */
/* 3. Lines                                                            */
/* ------------------------------------------------------------------ */

const through = (px, py, deg, h, reach = 4) => {
  const sc = sincos((deg * Math.PI) / 180, { s: 0, c: 0 });
  return [[px - reach * sc.c, py - reach * sc.s, h], [px + reach * sc.c, py + reach * sc.s, h]];
};

const LINES = [
  ['the first line: off the pit roof, over the pit lane and down onto the straight', [[SPAWN.px, SPAWN.py, SPAWN.h + 2], [SPAWN.px, PIT.balcony - 3, SPAWN.h + 2], [SPAWN.px, STRAIGHT.y + 2, 3]]],
  ['down the main straight at three metres, under the gantry and the bridge', [[STRAIGHT.x0 + 4, STRAIGHT.y, 3], [STRAIGHT.x1 - 4, STRAIGHT.y, 3]]],
  ['under the start gantry', through(GANTRY.x, (GANTRY.y0 + GANTRY.y1) / 2 + 2, 0, 3, 5)],
  ['under the footbridge', through(BRIDGE.x, 66, 0, 3, 6)],
  ['through the stand canyon, track to concourse', [[(MAIN.gap0 + MAIN.gap1) / 2, MAIN.front + 1, 4], [(MAIN.gap0 + MAIN.gap1) / 2, MAIN.back + 1, 4]]],
  ['through tunnel A under the stand', [[MAIN.tunnels[0], MAIN.front - MAIN.rows * MAIN.depth + 0.5, 1.8], [MAIN.tunnels[0], MAIN.back - 3, 1.8]]],
  ['through the roof gap over the stand\'s back wall', through(306, MAIN.back + 2, 90, (MAIN.wall + MAIN.roof0) / 2, 4)],
  ['along tower alley, between the tower and the pits', [[TOWER.x1 + 1, TOWER.y0 - 3, 4], [TOWER.x1 + 1, TOWER.y1 + 3, 4]]],
  ['through a garage, front to back', [[PIT.x0 + PIT.bay + 5, PIT.y0 - 3, 2.6], [PIT.x0 + PIT.bay + 5, PIT.y1 + 3, 2.6]]],
  ['under the tyre bridge', through(TYRE.x, (TYRE.y0 + TYRE.y1) / 2, 0, 4, 8)],
  ['through the tyre', through(TYRE.x, TYRE_HOLE.y, 0, TYRE_HOLE.h, 4)],
  ['through the sky wheel\'s window', through(...(() => {
    const g = hayateGaps().find((z) => z.name === 'SKY WHEEL');
    return [g.px, g.py, 90, (g.h0 + g.h1) / 2, 4];
  })())],
];

function linesBlock(near) {
  console.log(`\n3. lines, swept with a ball of ${r3(BALL)} m`);
  const step = 0.05;
  for (const [name, pts] of LINES) {
    let hit = null;
    let at = null;
    for (let i = 0; i + 1 < pts.length && !hit; i += 1) {
      const a = w(...pts[i]);
      const b = w(...pts[i + 1]);
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
      for (let k = 0; k <= n && !hit; k += 1) {
        const t = k / n;
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        hit = hitAt(near(p), p, BALL);
        if (hit) {
          at = pts[i].map((v, j) => r3(v + (pts[i + 1][j] - v) * t));
        }
      }
    }
    check(name, !hit, hit ? `${hit.name || hit.kind} at plan ${JSON.stringify(at)}` : 'clear');
  }
}

/* ------------------------------------------------------------------ */
/* 4. The named gaps                                                   */
/* ------------------------------------------------------------------ */

function gapsBlock(placed, near) {
  console.log('\n4. gaps');
  const named = hayateGaps();
  check('every named gap is in the document', placed.zones.length === named.length, `${placed.zones.length} of ${named.length}`);
  for (const z of placed.zones) {
    const sc = sincos(z.yaw, { s: 0, c: 0 });
    const across = [-sc.s, 0, -sc.c];
    let hit = null;
    for (let i = 0; i <= 8 && !hit; i += 1) {
      for (let j = 0; j <= 8 && !hit; j += 1) {
        const u = (i / 8 - 0.5) * z.w;
        const v = (j / 8) * z.h;
        const p = [z.x + across[0] * u, z.y + v, z.z + across[2] * u];
        hit = hitAt(near(p), p, CRAFT_WORLD_R);
      }
    }
    check(`${z.name} is clear by the craft's radius`, !hit, hit ? hit.name || hit.kind : `${r3(z.w)} by ${r3(z.h)} m`);
    check(`${z.name} is wider and taller than the gap rule`, z.w >= GAP_MIN && z.h >= GAP_MIN, `${r3(z.w)} by ${r3(z.h)} m, the rule ${GAP_MIN}`);
  }
}

/* ------------------------------------------------------------------ */
/* 5. Slots                                                            */
/* ------------------------------------------------------------------ */

function slotsOf(solids) {
  const boxes = solids.filter((s) => s.box);
  const near = gridOf(solids);
  const inside = (p, skip) => near(p).some((q) => q !== skip[0] && q !== skip[1]
    && (q.box ? boxDist(q.box, p) === 0 : segDist(q.cap, p) <= 0));
  const grid = gridOf(boxes, 8);
  const out = [];
  boxes.forEach((A, i) => {
    const a = A.box;
    const c = [(a[0] + a[3]) / 2, 0, (a[2] + a[5]) / 2];
    for (const B of grid(c)) {
      if (boxes.indexOf(B) <= i) {
        continue;
      }
      const b = B.box;
      const sep = [0, 1, 2].map((k) => Math.max(0, b[k] - a[k + 3], a[k] - b[k + 3]));
      if (sep.filter((v) => v > 1e-6).length !== 1) {
        continue;
      }
      const k = sep.findIndex((v) => v > 1e-6);
      if (sep[k] < 2 * CRAFT_WORLD_R || sep[k] >= GAP_MIN) {
        continue;
      }
      const others = [0, 1, 2].filter((m) => m !== k);
      if (others.some((m) => Math.min(a[m + 3], b[m + 3]) - Math.max(a[m], b[m]) < 4 * CRAFT_WORLD_R)) {
        continue;
      }
      const mid = [0, 1, 2].map((m) => (m === k
        ? (a[m + 3] < b[m] ? (a[m + 3] + b[m]) / 2 : (b[m + 3] + a[m]) / 2)
        : (Math.max(a[m], b[m]) + Math.min(a[m + 3], b[m + 3])) / 2));
      if (inside(mid, [A, B])) {
        continue;
      }
      out.push({ a: A.name, b: B.name, w: sep[k], axis: ['x', 'up', 'z'][k], mid });
    }
  });
  return out;
}

function slotsBlock(own) {
  console.log('\n5. slots');
  const found = slotsOf(own);
  const at = (p) => `plan ${JSON.stringify([r3(p[0] + 310), r3(220 - p[2]), r3(p[1])])}`;
  check(`no slot between ${r3(2 * CRAFT_WORLD_R)} and ${GAP_MIN} m between two of the circuit's boxes`, found.length === 0,
    found.length ? `${found.length}: ${found.slice(0, 40).map((f) => `${f.a} and ${f.b}, ${r3(f.w)} m ${f.axis}, ${at(f.mid)}`).join('; ')}` : `${own.filter((s) => s.box).length} boxes`);
}

/* ------------------------------------------------------------------ */
/* 6. The race cars                                                    */
/* ------------------------------------------------------------------ */

function carsBlock(doc) {
  console.log('\n6. race cars');
  const t = trafficOf(doc);
  const want = RACE_GROUPS.reduce((n, g) => n + g.cars.length, 0);
  check('every race car is driven', t.vehicles.length === want, `${t.vehicles.length} of ${want}, ${t.problems.map((p) => p.message).join(' | ') || 'no problems'}`);
  check('they share one lane', t.roads.length === 1, `${t.roads.length} lanes`);
  const tables = new Set(t.vehicles.map((v) => `${v.road}|${v.topSpeed}`));
  check('and one speed table, so no pair catches another', tables.size === 1, [...tables].join(', '));
  const L = t.roads[0] ? t.roads[0].length : 0;
  const offs = t.vehicles.map((v) => v.offset).sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 0; i < offs.length; i += 1) {
    const d = i + 1 < offs.length ? offs[i + 1] - offs[i] : offs[0] + L - offs[i];
    min = Math.min(min, d);
  }
  check('no two cars start closer than a car and a half', min > 6.5, `${r3(min)} m, the lap ${r3(L)} m`);
}

async function main() {
  console.log('Hayate Circuit');
  const L = layoutBlock();
  const { placed, near, own, doc } = await placedBlock(L);
  linesBlock(near);
  gapsBlock(placed, near);
  slotsBlock(own);
  carsBlock(doc);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
