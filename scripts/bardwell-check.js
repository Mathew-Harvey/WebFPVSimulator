/*
 * bardwell-check.js: Joshua Bardwell's house (src/maps/bardwell/), proved
 * buildable, flyable and cheap in plain Node, the way scripts/heads-check.js
 * proves Heads' house, whose machinery this is: the same sweeps, the same
 * gap rule, the same module flight, the same test that a logo is on what
 * it is on. What changes is the place's own data: life size, outside only,
 * its lines, its roofs and its start.
 *
 *   1. layout     every part finite, every colour one the kit knows, the
 *                 place's colours within its draw call budget, Joshua's own
 *                 colours in src/props/homes.js all drawn, and two builds
 *                 the same to the bit
 *   2. placed     the document normalizes with no repairs, the place goes
 *                 in as the built map puts it in, the start is seated on
 *                 the lawn and a ball the size of a craft is clear over it,
 *                 and the module's broadphase holds the map
 *   3. lines      the lines a pilot flies, swept with a ball twice the
 *                 craft's radius: off the start round the loop and down the
 *                 drive, through the porch, the gazebo, the courtyard and
 *                 the barn's bay, through the gate and between the pines,
 *                 down the field, along the road
 *   4. gaps       every named gap's window clear of every solid by the
 *                 craft's radius
 *   5. slots      the gap rule inside the place's own boxes
 *   6. roofs      under every gable and the gazebo's tiers, the solid within
 *                 one band of the drawn surface and never over it; under a
 *                 gable's rake, air
 *   7. logos      every roster brand hung once and each sign on its face
 *                 all over, every decal landed and flat on what it is on
 *                 with nothing through it, every brand painted three times
 *                 more, the atlas's cells in it and apart
 *   8. module     with a build of dist/sim.wasm, the craft lifted off the
 *                 start and held at a metre and a half for three seconds,
 *                 touching nothing, twice to the bit
 *
 * Usage: node scripts/bardwell-check.js
 *
 * A threshold here is never widened to make a line pass (CLAUDE.md); the
 * argument goes in PROGRESS.md.
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
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';
import { bardwellLayout, S, worldAt, FRAME } from '../src/maps/bardwell/bardwell.js';
import { bardwellDocument } from '../src/maps/bardwell/yard.js';
import * as logos from '../src/maps/bardwell/logos.js';
import { signAspect } from '../src/art/partnermark.js';
import { MATERIALS as HOME_MATERIALS } from '../src/props/homes.js';
import { GAP_MIN } from '../src/props/parts.js';
import { placeSolids, addSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument, indexTops, topUnder, groundUnder } from '../src/maps/built/place.js';
import { Colliders, CRAFT_WORLD_R, GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { uploadWorld, setWorldFrame } from '../src/game/plantworld.js';
import { threePosToSim } from '../src/render/frame.js';
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

/* The place's own draw calls, as heads-check.js holds Heads': one a colour
 * in its chunk. */
const HOUSE_COLOURS_MAX = 45;
/* The swept ball: twice the craft's radius. */
const BALL = 2 * CRAFT_WORLD_R;
/* One band of a roof's solid (BAND in bardwell.js), and the rounding the
 * arithmetic is allowed. */
const BAND_WORLD = S * 0.05;
const ROOF_T = 0.2;
const EPS = 1e-6;

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
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

/* The solid nearest to being hit by a ball of radius r at p, or null. */
function hitAt(solids, p, r) {
  for (const s of solids) {
    const d = s.box ? boxDist(s.box, p) : segDist(s.cap, p);
    if (d < r) {
      return s;
    }
  }
  return null;
}

/* A grid over the solids in plan, so a sweep asks the few near it. */
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
  for (const q of L.prisms) {
    h.update(`${q.m}|${q.axis}`);
    for (const v of [...q.profile.flat(), q.e0, q.e1]) {
      num(v);
    }
  }
  return h.digest('hex');
}

function layoutBlock() {
  console.log('\n1. layout');
  const L = bardwellLayout();
  const bad = L.parts.filter((p) => (p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]).some((v) => !Number.isFinite(v)));
  const badPrisms = L.prisms.filter((q) => [...q.profile.flat(), q.e0, q.e1].some((v) => !Number.isFinite(v)));
  check('every part and prism is finite', bad.length + badPrisms.length === 0,
    `${L.parts.length} parts, ${L.prisms.length} prisms, ${bad.length + badPrisms.length} with a non-finite number`);
  const colours = new Set([...L.parts.filter((p) => p.draw).map((p) => p.m), ...L.prisms.map((q) => q.m),
    ...L.rings.map((r) => r.m), ...L.discs.map((d) => d.m), ...L.cyls.map((c) => c.m), ...L.pyramids.map((c) => c.m)]);
  const unknown = [...colours].filter((m) => !HOME_MATERIALS[m]);
  check('every colour the place draws is one of src/props/homes.js', unknown.length === 0, unknown.join(', ') || `${colours.size} colours`);
  check(`the place draws at most ${HOUSE_COLOURS_MAX} colours, so its chunk is at most that many draw calls`,
    colours.size <= HOUSE_COLOURS_MAX, `${colours.size}`);
  const unused = Object.keys(HOME_MATERIALS).filter((m) => m.startsWith('bardwell') && !colours.has(m));
  check('every one of Joshua\'s own colours in src/props/homes.js is drawn', unused.length === 0, unused.join(', ') || 'all drawn');
  const a = hashOf(L);
  const b = hashOf(bardwellLayout());
  check('two builds are the same to the bit', a === b, a.slice(0, 16));
  const solid = L.parts.filter((p) => p.solid).length;
  console.log(`        ${solid} solids, ${L.parts.filter((p) => p.draw).length} drawn parts, ${L.scaled.length} trees and cars`);
  return L;
}

/* ------------------------------------------------------------------ */
/* 2. Placed as the built map places it                                */
/* ------------------------------------------------------------------ */

/* src/native/world.c's numbers, read from its source so a change there is
 * seen here. */
async function worldLimits() {
  const src = await readFile(join(root, 'src/native/world.c'), 'utf8');
  const def = (name) => {
    const m = src.match(new RegExp(`#define ${name} \\(?([0-9.]+)(?: << ([0-9]+))?`));
    if (!m) {
      throw new Error(`src/native/world.c has no ${name}`);
    }
    return m[2] ? Number(m[1]) * 2 ** Number(m[2]) : Number(m[1]);
  };
  return {
    shapes: def('WORLD_MAX_SHAPES'),
    cand: def('WORLD_MAX_CAND'),
    cellMin: def('WORLD_CELL_MIN'),
    cells: def('WORLD_MAX_CELLS'),
  };
}

/*
 * The most shapes one step's gather can return, the way world_gather()
 * makes its grid: cells of WORLD_CELL_MIN over the shapes' plan extent in
 * the plant's frame, doubled until there are few enough, and a query the
 * craft's reach across, which is under a cell, so at most two by two.
 */
function worstGather(solids, lim) {
  const plan = solids.map((s) => {
    if (s.box) {
      return [s.box[0], -s.box[5], s.box[3], -s.box[2]];
    }
    const c = s.cap;
    return [Math.min(c[0], c[3]) - c[6], -Math.max(c[2], c[5]) - c[6], Math.max(c[0], c[3]) + c[6], -Math.min(c[2], c[5]) + c[6]];
  });
  const x0 = Math.min(...plan.map((b) => b[0]));
  const y0 = Math.min(...plan.map((b) => b[1]));
  const x1 = Math.max(...plan.map((b) => b[2]));
  const y1 = Math.max(...plan.map((b) => b[3]));
  let cell = lim.cellMin;
  if (!(cell > 0)) {
    throw new Error('WORLD_CELL_MIN is not a length');
  }
  while ((Math.floor((x1 - x0) / cell) + 1) * (Math.floor((y1 - y0) / cell) + 1) > lim.cells) {
    cell *= 2;
  }
  const nx = Math.floor((x1 - x0) / cell) + 1;
  const ny = Math.floor((y1 - y0) / cell) + 1;
  const cells = Array.from({ length: nx * ny }, () => []);
  plan.forEach((b, i) => {
    for (let cx = Math.floor((b[0] - x0) / cell); cx <= Math.floor((b[2] - x0) / cell); cx += 1) {
      for (let cy = Math.floor((b[1] - y0) / cell); cy <= Math.floor((b[3] - y0) / cell); cy += 1) {
        cells[cx * ny + cy].push(i);
      }
    }
  });
  let worst = 0;
  let one = 0;
  for (let cx = 0; cx < nx; cx += 1) {
    for (let cy = 0; cy < ny; cy += 1) {
      one = Math.max(one, cells[cx * ny + cy].length);
      const four = new Set(cells[cx * ny + cy]);
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
        if (cx + dx < nx && cy + dy < ny) {
          for (const i of cells[(cx + dx) * ny + cy + dy]) {
            four.add(i);
          }
        }
      }
      worst = Math.max(worst, four.size);
    }
  }
  return { worst, one, cell };
}

async function placedBlock(L) {
  console.log('\n2. placed');
  const { doc, repairs } = normalize(bardwellDocument());
  check('the document normalizes with no repairs', repairs.length === 0, repairs.join(' | ') || `${doc.elements.length} elements`);
  const { placed } = seatDocument(doc);
  /* addExtra in src/maps/built/index.js, restated. */
  const first = placed.solids.length;
  placeSolids(L.parts, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
  const own = placed.solids.slice(first);
  placed.tops = indexTops(placed.solids);
  const sp = placed.spawn;
  sp.y = topUnder(placed.tops, sp.x, sp.z, sp.base);
  check('the start is the pads', sp.from === 'pads', sp.from);
  check('the start is seated on the lawn', Math.abs(sp.y) < 1e-6, `${r3(sp.y)} m`);
  check('nothing inflated', (placed.stats.inflated || 0) === 0, `${placed.stats.inflated || 0}`);
  const ground = (px, py, h) => {
    const [x, y, z] = worldAt(px, py, h);
    return groundUnder(placed.tops, x, z, y - 0.4, y);
  };
  check('on the porch a craft stands on its deck', Math.abs(ground(3, -1.5, 0.65) - 0.6) < 0.02, `${r3(ground(3, -1.5, 0.65))} m`);
  check('in the field it stands on the ground', Math.abs(ground(40, -70, 0.05)) < 0.02, `${r3(ground(40, -70, 0.05))} m`);
  const near = gridOf(placed.solids);
  const over = [sp.x, sp.y + 0.6, sp.z];
  const hit = hitAt(near(over), over, 0.5);
  check('a ball a metre across over the start is clear', !hit, hit ? hit.name : 'clear');
  const lim = await worldLimits();
  check(`the map's ${placed.solids.length} shapes are under world.c's WORLD_MAX_SHAPES`, placed.solids.length < lim.shapes, `${lim.shapes}`);
  const g = worstGather(placed.solids, lim);
  check('the most one step gathers is under world.c\'s WORLD_MAX_CAND', g.worst < lim.cand,
    `${g.worst} at worst over two by two cells of ${g.cell} m, ${g.one} in one, the cap ${lim.cand}`);
  return { doc, placed, near, own };
}

/* ------------------------------------------------------------------ */
/* 3. The lines a pilot flies                                          */
/* ------------------------------------------------------------------ */

/* Each line is plan points [px, py, h], metres, flown straight from one to
 * the next. */
const loop = [];
for (let i = 0; i <= 16; i += 1) {
  const sc = sincos((i / 16) * 2 * Math.PI, { s: 0, c: 0 });
  loop.push([10 + 8.2 * sc.c, -17 + 8.2 * sc.s, 1.5]);
}
const LINES = [
  ['off the start, across the loop and down the drive to the road', [[8, -5.2, 0.6], [8, -6.5, 1.5], [1.2, -14, 2.0], [1.2, -106, 2.0]]],
  ['round the loop, round the evergreen', loop],
  ['in through the porch steps and out over its west railing', [[8, -6, 1.6], [8, -1.4, 1.6], [3.5, -1.4, 1.9], [-1.5, -1.4, 1.9]]],
  ['through the gazebo, over the table, under the beams', [[2.5, 14.5, 1.55], [13.5, 14.5, 1.55]]],
  ['down the courtyard and out of its end', [[-2, 12, 1.8], [12, 12, 1.8], [21, 12, 1.8]]],
  ['into the barn\'s open bay and out of its south end', [[18, 12, 1.4], [24, 12, 1.4], [24, 8, 1.4], [24, 4.5, 1.4]]],
  ['past the camper to the barn', [[14, 23.2, 2.0], [26, 23.2, 2.0]]],
  ['through the gate into the field', [[22, -20, 1.2], [22, -40, 1.2]]],
  ['over the fence and down between the pines', [[33.3, -24, 2.4], [33.3, -31.5, 1.5], [33.3, -40, 1.5]]],
  ['down the field past the long building\'s deck', [[66.5, -30, 1.5], [66.5, -80, 1.5]]],
  ['over the long building', [[52, -44, 4.5], [68, -44, 4.5]]],
  ['along the road', [[-45, -112, 1.5], [78, -112, 1.5]]],
  ['up the east line past the coops', [[42, -20, 1.5], [42, 28, 1.5]]],
];

function linesBlock(near) {
  console.log(`\n3. lines, swept with a ball of ${r3(BALL)} m`);
  const step = 0.05;
  for (const [name, pts] of LINES) {
    let hit = null;
    let at = null;
    for (let i = 0; i + 1 < pts.length && !hit; i += 1) {
      const a = worldAt(...pts[i]);
      const b = worldAt(...pts[i + 1]);
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
  for (const z of placed.zones) {
    /* The window, as place.js and src/game/gaps.js read it: across the
     * normal for `w`, up from the sill for `h`. */
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
  }
}

/* ------------------------------------------------------------------ */
/* 5. Slots                                                            */
/* ------------------------------------------------------------------ */

const ALLOWED = [
  ['between two roofs, where one runs under the other\'s eave: a wedge that opens out down the slope',
    (a, b, axis) => axis === 'up' && a === 'roof' && b === 'roof'],
];

/*
 * Two boxes facing each other: apart along one axis by less than the gap
 * rule and more than the craft is wide, overlapping along the other two by
 * at least twice the craft's width (so it is a slot and not a notch), and
 * nothing solid at the middle of the space between them. Boxes only: the
 * house's capsules are legs, posts and lamps' stems, which a pilot sees
 * round. Box against capsule is what the middle point is tested against.
 */
function slotsOf(solids) {
  const boxes = solids.filter((s) => s.box);
  const inside = (p, skip) => solids.some((q) => q !== skip[0] && q !== skip[1]
    && (q.box ? boxDist(q.box, p) === 0 : segDist(q.cap, p) <= 0));
  const out = [];
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i].box;
    for (let j = i + 1; j < boxes.length; j += 1) {
      const b = boxes[j].box;
      const sep = [0, 1, 2].map((k) => Math.max(0, b[k] - a[k + 3], a[k] - b[k + 3]));
      const apart = sep.filter((v) => v > 1e-6);
      if (apart.length !== 1) {
        continue;
      }
      const k = sep.findIndex((v) => v > 1e-6);
      if (sep[k] < 2 * CRAFT_WORLD_R || sep[k] >= GAP_MIN) {
        continue;
      }
      if (boxes[i].name === 'hidden' && boxes[j].name === 'hidden') {
        continue;
      }
      const others = [0, 1, 2].filter((m) => m !== k);
      if (others.some((m) => Math.min(a[m + 3], b[m + 3]) - Math.max(a[m], b[m]) < 4 * CRAFT_WORLD_R)) {
        continue;
      }
      const mid = [0, 1, 2].map((m) => (m === k
        ? (a[m + 3] < b[m] ? (a[m + 3] + b[m]) / 2 : (b[m + 3] + a[m]) / 2)
        : (Math.max(a[m], b[m]) + Math.min(a[m + 3], b[m + 3])) / 2));
      if (inside(mid, [boxes[i], boxes[j]])) {
        continue;
      }
      out.push({ w: sep[k], axis: k === 1 ? 'up' : 'across', a: boxes[i].name || boxes[i].kind, b: boxes[j].name || boxes[j].kind, mid });
    }
  }
  return out;
}

function slotsBlock(own) {
  console.log('\n5. slots');
  const found = slotsOf(own);
  const allowed = ALLOWED.map(() => 0);
  const bad = [];
  for (const f of found) {
    const i = ALLOWED.findIndex(([, ok]) => ok(f.a, f.b, f.axis));
    if (i >= 0) {
      allowed[i] += 1;
    } else {
      bad.push(f);
    }
  }
  const at = (p) => `plan ${JSON.stringify([r3((p[0] - FRAME.OX) / S), r3((FRAME.OZ - p[2]) / S), r3(p[1] / S)])}`;
  check(`no slot between ${r3(2 * CRAFT_WORLD_R)} and ${GAP_MIN} m between two of the place's boxes`, bad.length === 0,
    bad.length ? bad.slice(0, 8).map((f) => `${f.a} and ${f.b}, ${r3(f.w)} m ${f.axis}, ${at(f.mid)}`).join('; ') : `${own.filter((s) => s.box).length} boxes`);
  ALLOWED.forEach(([why], i) => console.log(`        allowed ${allowed[i]}: ${why}`));
}

/* ------------------------------------------------------------------ */
/* 6. The roofs                                                        */
/* ------------------------------------------------------------------ */

/*
 * Every gable the layout lists (its `roofs`) and the gazebo's two tiers:
 * at points over each, the highest drawn roof there against the highest
 * solid top. Where two roofs cover one point, the higher is the one seen
 * and the one the solid answers to. Then under each gable's rake past its
 * end, where the roof overhangs a gable wall by more than a hand, a point
 * a little under the slab is air.
 */
const UNDER = 0.12;
function roofsBlock(L, placed, near) {
  console.log('\n6. roofs');
  const g = { x: 8, y: 14.5 };
  const tiers = [{ h: 2.48, half: 2.2, rise: 1.2 }, { h: 3.45, half: 0.95, rise: 0.45 }];
  const drawnTop = (px, py) => {
    let best = -Infinity;
    for (const r of L.roofs) {
      const [a, e] = r.axis === 'x' ? [py, px] : [px, py];
      if (a >= r.edge0 && a <= r.edge1 && e >= r.E0 && e <= r.E1) {
        best = Math.max(best, r.top(a));
      }
    }
    for (const t of tiers) {
      const m = Math.max(Math.abs(px - g.x), Math.abs(py - g.y));
      if (m <= t.half) {
        best = Math.max(best, t.h + t.rise * (1 - m / t.half));
      }
    }
    return best;
  };
  const areas = [
    ['the house\'s roof and its dormers', L.roofs[0]],
    ...L.roofs.slice(1).map((r, i) => [`roof ${i + 2}`, r]),
  ];
  for (const [name, r] of areas) {
    let worst = 0;
    let proud = 0;
    let n = 0;
    for (let i = 1; i < 30; i += 1) {
      for (let j = 1; j < 30; j += 1) {
        const a = r.edge0 + ((r.edge1 - r.edge0) * i) / 30;
        const e = r.E0 + ((r.E1 - r.E0) * j) / 30;
        const [px, py] = r.axis === 'x' ? [e, a] : [a, e];
        const want = S * drawnTop(px, py);
        const [x, , z] = worldAt(px, py, 0);
        const got = topUnder(placed.tops, x, z, want + 2);
        worst = Math.max(worst, want - got);
        proud = Math.max(proud, got - want);
        n += 1;
      }
    }
    check(`${name}: the solid is within a band under the slope`, worst <= BAND_WORLD + EPS && proud <= EPS,
      `${n} points, at most ${r3(worst)} m under and ${r3(proud)} m over`);
  }
  {
    let worst = 0;
    let proud = 0;
    for (let i = 1; i < 30; i += 1) {
      for (let j = 1; j < 30; j += 1) {
        const px = g.x - 2.2 + (4.4 * i) / 30;
        const py = g.y - 2.2 + (4.4 * j) / 30;
        const want = S * drawnTop(px, py);
        const [x, , z] = worldAt(px, py, 0);
        const got = topUnder(placed.tops, x, z, want + 2);
        worst = Math.max(worst, want - got);
        proud = Math.max(proud, got - want);
      }
    }
    check('the gazebo\'s tiers: the solid is within a band under them', worst <= BAND_WORLD + EPS && proud <= EPS,
      `at most ${r3(worst)} m under and ${r3(proud)} m over`);
  }
  for (const [i, r] of L.roofs.entries()) {
    for (const [e0, e1] of [[r.E0, r.e0], [r.e1, r.E1]]) {
      if (!(e1 - e0 > 0.3)) {
        continue;
      }
      let hit = null;
      let n = 0;
      for (let k = 2; k <= 38 && !hit; k += 1) {
        const a = r.edge0 + ((r.edge1 - r.edge0) * k) / 40;
        const e = (e0 + e1) / 2;
        const h = r.top(a) - ROOF_T - UNDER;
        if (h < 0.5) {
          continue;
        }
        const [px, py] = r.axis === 'x' ? [e, a] : [a, e];
        const p = worldAt(px, py, h);
        hit = hitAt(near(p), p, 0);
        n += 1;
      }
      check(`roof ${i + 1}, under its rake past ${r3(e0)} to ${r3(e1)}: air under the slab`, !hit, hit ? `${hit.name || hit.kind}` : `${n} points`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 7. The logos                                                        */
/* ------------------------------------------------------------------ */

/* How far along the unit axis `d` from `o` (world) the first drawn box
 * is, or the ground's plane for a line going down, or Infinity. */
function castDrawn(boxes, o, d) {
  let best = d[1] < 0 ? o[1] / -d[1] : Infinity;
  for (const b of boxes) {
    let t0 = 0;
    let t1 = Infinity;
    for (let k = 0; k < 3; k += 1) {
      if (Math.abs(d[k]) < EPS) {
        if (o[k] < b.lo[k] || o[k] > b.hi[k]) {
          t0 = Infinity;
          break;
        }
        continue;
      }
      const a = (b.lo[k] - o[k]) / d[k];
      const c = (b.hi[k] - o[k]) / d[k];
      t0 = Math.max(t0, Math.min(a, c));
      t1 = Math.min(t1, Math.max(a, c));
    }
    if (t0 <= t1 && t0 > EPS && t0 < best) {
      best = t0;
    }
  }
  return best;
}

/*
 * Whether a logo is on something all over: from BACK real metres in front
 * of each of nine points across it, the first drawn thing back along its
 * normal is no nearer than the logo (nothing stands through it) and no
 * further than `deep` behind it (it is not over a window, a doorway or
 * the edge of what it is on). The worst point's miss, real metres, or 0.
 */
const BACK = 0.2;
function unbacked(boxes, q, deep, proud = 0) {
  const n = q.n;
  const up = q.up;
  const right = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
  const d = n.map((v) => -v);
  let worst = 0;
  for (const a of [-0.45, 0, 0.45]) {
    for (const b of [-0.45, 0, 0.45]) {
      const o = q.p.map((v, k) => v + right[k] * a * q.w + up[k] * b * q.h + n[k] * S * BACK);
      const behind = (castDrawn(boxes, o, d) - S * BACK) / S;
      const miss = behind < -proud ? -proud - behind : (behind > deep ? behind - deep : 0);
      worst = Math.max(worst, miss);
    }
  }
  return worst;
}

function logosBlock(L) {
  console.log('\n7. logos');
  const lg = logos;
  const boxes = lg.drawnBoxes(L.parts);
  const cells = Object.entries(lg.CELLS);
  const outside = cells.filter(([, c]) => c.x < 0 || c.y < 0 || c.x + c.w > lg.ATLAS_W || c.y + c.h > lg.ATLAS_H).map(([k]) => k);
  const over = [];
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const [a, A] = cells[i];
      const [b, B] = cells[j];
      if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) {
        over.push(`${a}/${b}`);
      }
    }
  }
  check(`the atlas holds its ${cells.length} cells, none over another`, !outside.length && !over.length, [...outside, ...over].join(', '));
  const slugs = lg.BRANDS.map((p) => p.slug);
  const hung = lg.SIGN_SPOTS.map((s) => s.slug);
  const counts = slugs.map((sl) => hung.filter((h) => h === sl).length);
  check(`every one of the roster's ${slugs.length} brands is hung once`, counts.every((c) => c === 1) && hung.length === slugs.length,
    slugs.filter((sl, i) => counts[i] !== 1).join(', '));
  const signs = lg.placeSigns(L.parts, 'extra');
  for (const [i, s] of signs.entries()) {
    const spot = lg.SIGN_SPOTS[i];
    if (!s) {
      check(`${spot.slug}'s sign lands`, false, 'its line meets nothing');
      continue;
    }
    const brand = lg.BRANDS.find((p) => p.slug === s.slug);
    const miss = unbacked(boxes, { ...s, h: s.w / signAspect(brand) }, 0.25, 0.15);
    check(`${spot.slug}'s sign is on ${s.hit}, all of it`, miss === 0, miss ? `${r3(miss)} m off` : '');
  }
  const decals = lg.placeDecals(L.parts);
  const lost = decals.map((d, i) => (d ? null : i)).filter((i) => i !== null);
  check(`every one of the ${decals.length} decals lands`, !lost.length, lost.join(', '));
  const bad = [];
  decals.forEach((d, i) => {
    if (!d) {
      return;
    }
    const miss = unbacked(boxes, d, d.n[1] > 0.5 ? 0.05 : 0.02);
    if (miss) {
      bad.push(`${i} ${d.cell} on ${d.hit} ${r3(miss)} m`);
    }
  });
  check('every decal is flat on what it is on, nothing through it', !bad.length, bad.join('; '));
  const painted = slugs.filter((sl) => decals.filter((d) => d && d.cell === sl).length >= 3);
  check('every brand is painted at least three times more', painted.length === slugs.length,
    slugs.filter((sl) => !painted.includes(sl)).join(', '));
}

/* ------------------------------------------------------------------ */
/* 8. The module                                                       */
/* ------------------------------------------------------------------ */

/* scripts/props-check.js's numbers, unchanged: the five inch's parked
 * height, its hover throttle, and the state's layout. */
const REST = 0.033;
const HOVER = 0.27;
const ST = { X: 1, Y: 2, Z: 3, VX: 4, VY: 5, VZ: 6, QX: 8, QY: 9 };

function call(sim, name, ...a) {
  const code = sim.e[name](...a);
  if (code < 0) {
    throw new Error(`${name}: ${simErrorName(code)}`);
  }
  return code;
}

const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const upZ = (st) => 1 - 2 * (st[ST.QX] * st[ST.QX] + st[ST.QY] * st[ST.QY]);

function heightHold(ctx, st, z) {
  const e = z - st[ST.Z];
  ctx.i = clamp(ctx.i + e * 0.004 * 0.4, -0.3, 0.3);
  const u = upZ(st);
  return clamp((HOVER + 0.15 * e - 0.1 * st[ST.VZ] + ctx.i) / (u > 0.5 ? u : 0.5), 0, 1);
}

async function hoverFlight(wasm, config, colliders, placed, ms, target, from = null) {
  const sim = await loadSim(wasm);
  call(sim, 'sim_set_airframe', 0);
  if (sim.init(config) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  uploadWorld(sim, colliders);
  const sp = from ?? placed.spawn;
  const y = groundUnder(placed.tops, sp.x, sp.z, sp.y, undefined, 0);
  setWorldFrame(sim, sp.x, y, sp.z, sp.yaw, REST);
  const o = threePosToSim(sp.x, y, sp.z, { x: 0, y: 0, z: 0 });
  call(sim, 'sim_set_pose', 0, 0, 0, 1, 0, 0, 0);
  call(sim, 'sim_rest');
  sim.setAngleMode(true);
  const rep = sim.e.malloc(11 * 8);
  const hash = createHash('sha256');
  const ctx = { i: 0 };
  let touched = 0;
  let top = -Infinity;
  let st = sim.readState().state;
  for (let t = 0; t < ms; t += 1) {
    if (t % 4 === 0) {
      sim.input(t / 1000, 0, 0, 0, heightHold(ctx, st, target(t)));
    }
    call(sim, 'sim_set_ground', 1, 0, 0, 1, 0, 0, -REST, GROUND_MU, GROUND_E);
    sim.step(1);
    st = sim.readState().state;
    hash.update(sim.readStateBytes().bytes);
    call(sim, 'sim_world_report', rep);
    if (new Float64Array(sim.e.memory.buffer, rep, 11)[0] > 0) {
      touched += 1;
    }
    top = Math.max(top, st[ST.Z]);
  }
  sim.e.free(rep);
  return { touched, top, z: st[ST.Z], hash: hash.digest('hex'), o };
}

async function moduleBlock(placed) {
  console.log('\n8. module');
  const wasmPath = join(root, 'dist/sim.wasm');
  if (!existsSync(wasmPath)) {
    console.log('  SKIP  no dist/sim.wasm to fly');
    return;
  }
  const wasm = await readFile(wasmPath);
  const config = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
  const colliders = new Colliders();
  addSolids(colliders, placed.solids);
  colliders.build();
  const lift = (t) => Math.min(1.5, 1.5 * (t / 1000));
  const a = await hoverFlight(wasm, config, colliders, placed, 3000, lift);
  const b = await hoverFlight(wasm, config, colliders, placed, 3000, lift);
  check('two lift offs agree to the bit', a.hash === b.hash, a.hash.slice(0, 16));
  check('lifting off the start and holding a metre and a half touches nothing', a.touched === 0 && a.top > 1.2,
    `${a.touched} steps in contact, up to ${r3(a.top)} m`);
}

async function main() {
  console.log('bardwell-check: Joshua Bardwell\'s house, src/maps/bardwell/');
  const L = layoutBlock();
  const { placed, near, own } = await placedBlock(L);
  linesBlock(near);
  gapsBlock(placed, near);
  slotsBlock(own);
  roofsBlock(L, placed, near);
  logosBlock(L);
  await moduleBlock(placed);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
