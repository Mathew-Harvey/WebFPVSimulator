/*
 * school-check.js: Midori Gakuen (src/maps/school/), the Infected mini
 * game's school, proved buildable, flyable and cheap in plain Node, the way
 * scripts/warehouse-check.js proves Thomas More's Shop. In these blocks:
 *
 *   1. layout   every part finite, every colour one of src/props/school.js,
 *               at most the school's colour budget (each is a draw call, and
 *               the pictures on the walls are one more), every picture
 *               painted and hung on something, no two colours drawn in one
 *               plane, two builds the same to the bit
 *   2. placed   the document normalizes with no repairs, the school goes in
 *               as the built map puts it in, the start is seated on the
 *               floor with a ball clear over it, and the shape and candidate
 *               counts are under the physics module's caps
 *   3. lines    the lines a pilot flies, swept with a ball twice the craft's
 *               radius: every door, open window, transom and hatch straight
 *               through, the vents, the book lift, both stairs, the hallways
 *               and the aisles between the furniture; and every pad clear
 *   4. paths    the bots' led ways (PATHS in src/maps/school/school.js), the
 *               stairs, the lift and the vents, swept the same way
 *   5. slots    the gap rule (GAP_MIN in src/props/parts.js) inside the school
 *   6. leaks    the air the craft can reach from the start, as a grid of
 *               cells: it never leaves the school, every room is reached,
 *               it is never inside a thing drawn thick, and no drawn sheet
 *               has it on both sides
 *   7. module   with a build of dist/sim.wasm, the craft lifted off the
 *               start and held at a metre and a half for three seconds in the
 *               real module, touching nothing, twice to the bit
 *
 * Usage: node scripts/school-check.js
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
import {
  schoolLayout, S, FLOOR0, F1, worldAt, FRAME, OPENINGS, PATHS, PADS, TANK_PAD, ROOMS, LEN, DEP, HIGH, floorOf,
} from '../src/maps/school/school.js';
import { schoolDocument } from '../src/maps/school/yard.js';
import { paintsKey } from '../src/maps/school/pictures.js';
import { MATERIALS as HOME_MATERIALS } from '../src/props/school.js';
import { GAP_MIN } from '../src/props/parts.js';
import { placeSolids, addSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument, indexTops, topUnder, groundUnder, SUPPORT_TIE } from '../src/maps/built/place.js';
import { Colliders, CRAFT_WORLD_R, GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { uploadWorld, setWorldFrame } from '../src/game/plantworld.js';
import { threePosToSim } from '../src/render/frame.js';
import { sincos } from '../src/props/trig.js';
import { coplanarPairs, separateCoplanar, LIFT } from '../src/props/coplanar.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;

function check(name, ok, detail = '') {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

const r3 = (v) => Math.round(v * 1000) / 1000;

/* The school's own draw calls: one a colour in its chunk (the kit bakes a
 * batch per material per chunk), and src/props/school.js holds the school to
 * this many. */
const HOUSE_COLOURS_MAX = 16;
/* The swept ball: twice the craft's radius, so a line that passes has the
 * craft's width of air either side of it. */
const BALL = 2 * CRAFT_WORLD_R;
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
  for (const u of L.pictures || []) {
    h.update(`${u.key}|${u.face}`);
    for (const v of [u.px, u.py, u.h, u.w, u.ht]) {
      num(v);
    }
  }
  return h.digest('hex');
}

/* Every picture the plan hangs is one that is painted, and hangs on
 * something: a drawn part is within six centimetres behind its middle and
 * the picture itself is not inside one, so no poster floats in the air and
 * none is buried in its wall. */
const FACE_OUT = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0] };
function pictureLines(L) {
  const uses = L.pictures || [];
  const keys = [...new Set(uses.map((u) => u.key))];
  const unpainted = keys.filter((k) => !paintsKey(k));
  check('every picture the school hangs is painted', uses.length > 0 && unpainted.length === 0,
    unpainted.join(', ') || `${uses.length} hung, ${keys.length} pictures`);
  const boxes = L.parts.filter((p) => p.draw && p.t === 'box');
  const inside = (q, eps = 0) => boxes.some((b) => q.every((v, i) => v >= b.lo[i] - eps && v <= b.hi[i] + eps));
  const bad = [];
  for (const u of uses) {
    const nums = [u.px, u.py, u.h, u.w, u.ht];
    const n = FACE_OUT[u.face];
    if (!n || nums.some((v) => !Number.isFinite(v)) || u.w <= 0 || u.ht <= 0
      || u.px < 0 || u.px > LEN || u.py < 0 || u.py > DEP || u.h < 0 || u.h > HIGH) {
      bad.push(`${u.key} out of the school`);
      continue;
    }
    const c = worldAt(u.px, u.py, u.h);
    const at = (d) => c.map((v, i) => v + n[i] * S * d);
    let backed = false;
    for (let d = 0.002; d <= 0.06 && !backed; d += 0.002) {
      backed = inside(at(-d));
    }
    if (!backed) {
      bad.push(`${u.key} hangs on nothing`);
    } else if (inside(at(0.001))) {
      bad.push(`${u.key} is inside a part`);
    }
  }
  check('every picture hangs on something and in front of it', bad.length === 0,
    bad.slice(0, 6).join('; ') || `${uses.length} hung`);
}

function layoutBlock() {
  console.log('\n1. layout');
  const L = schoolLayout();
  const bad = L.parts.filter((p) => (p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]).some((v) => !Number.isFinite(v)));
  const badPrisms = L.prisms.filter((q) => [...q.profile.flat(), q.e0, q.e1].some((v) => !Number.isFinite(v)));
  check('every part and prism is finite', bad.length === 0 && badPrisms.length === 0,
    `${L.parts.length} parts, ${L.prisms.length} prisms, ${bad.length + badPrisms.length} with a non-finite number`);
  const own = L.parts.filter((p) => p.draw).map((p) => p.m);
  const colours = new Set([...own, ...L.prisms.map((q) => q.m), ...L.discs.map((d) => d.m), ...L.cones.map((c) => c.m)]);
  const unknown = [...colours].filter((m) => !HOME_MATERIALS[m]);
  check('every colour the school draws is one of src/props/school.js', unknown.length === 0, unknown.join(', ') || `${colours.size} colours`);
  /* The pictures on the walls (src/maps/school/pictures.js) are one mesh,
   * so one draw call more than the colours: they took the blackboards'
   * colour's place, and the budget is the same budget. */
  check(`the school draws at most ${HOUSE_COLOURS_MAX} calls, its colours and its pictures`,
    colours.size + 1 <= HOUSE_COLOURS_MAX, `${colours.size} colours and 1 picture sheet`);
  pictureLines(L);
  /* The table is shared with the houses: their colours are checked as drawn by their own scripts. */
  const unused = Object.keys(HOME_MATERIALS).filter((m) => !colours.has(m));
  check('every colour in src/props/school.js is drawn', unused.length === 0, unused.join(', ') || 'all drawn');
  const a = hashOf(L);
  const b = hashOf(schoolLayout());
  check('two builds are the same to the bit', a === b, a.slice(0, 16));
  /* No two colours drawn in one plane, which the depth buffer shows as a
   * wall shimmering between them (src/props/coplanar.js). The plan may
   * have them; what is drawn may not, and the plan itself, which the solids
   * are placed from, is left as it was. */
  const flush = coplanarPairs(L.parts).length;
  const drawn = separateCoplanar(L.parts);
  const left = coplanarPairs(drawn.parts).length;
  const planKept = hashOf(L) === a;
  check('no two colours are drawn in one plane', left === 0 && planKept,
    `${flush} pairs flush in the plan, ${drawn.moved} faces drawn ${LIFT * 1000} mm out, ${left} left`);
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
  const { doc, repairs } = normalize(schoolDocument());
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
  check('the start is seated on the floor', Math.abs(sp.y - S * FLOOR0) < 1e-6, `${r3(sp.y)} m, the floor is ${r3(S * FLOOR0)}`);
  check('nothing inflated', (placed.stats.inflated || 0) === 0, `${placed.stats.inflated || 0}`);
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

/* Each line is plan points [px, py, h], real metres, flown straight from
 * one to the next. */
/* Each line is plan points [px, py, h], real metres, flown straight from
 * one to the next. Every opening that is not glass, straight through it at
 * its middle, 70 cm each side; then the long lines a round is flown on. */
function throughLines() {
  const out = [];
  for (const o of OPENINGS) {
    if (o.glass || o.kind === 'vent') {
      continue;
    }
    const a = (o.a0 + o.a1) / 2;
    const h = (o.h0 + o.h1) / 2;
    const d = 0.7;
    const pts = o.axis === 'x' ? [[a, o.at - d, h], [a, o.at + d, h]] : [[o.at - d, a, h], [o.at + d, a, h]];
    out.push([`through ${o.id}`, pts]);
  }
  return out;
}
const LINES = [
  ...throughLines(),
  ['down the ground floor hallway, end to end', [[0.6, 8.7, 1.5], [39.4, 8.7, 1.5]]],
  ['down the upstairs hallway, end to end', [[0.6, 8.7, F1 + 1.5], [39.4, 8.7, F1 + 1.5]]],
  ['down the ground floor hallway low, under the banners, by the south wall', [[1.0, 7.85, 0.6], [39.0, 7.85, 0.6]]],
  ['down the upstairs hallway high, under the banners', [[1.0, 9.2, F1 + 2.05], [39.0, 9.2, F1 + 2.05]]],
  ['across 1-A between the desks and out the back door', [[4.4, 6.75, 1.0], [4.4, 1.8, 1.0], [10.2, 1.8, 1.0], [10.2, 6.9, 1.0], [10.05, 8.0, 1.0]]],
  ['over the desks in 1-B', [[22.4, 1.2, 1.3], [28.2, 6.2, 1.3]]],
  ['round the glass tank in the lab', [[12.45, 6.7, 1.35], [14.1, 6.5, 1.35], [14.1, 2.5, 1.35], [17.9, 2.5, 1.35], [17.9, 6.5, 1.35], [21.6, 6.05, 1.35]]],
  ['up out of the tank', [[16.0, 4.5, 0.6], [16.0, 4.5, 2.4]]],
  ['down the library aisles', [[13.65, 1.0, F1 + 1.0], [13.65, 5.9, F1 + 1.0], [15.5, 5.9, F1 + 1.0], [15.5, 0.6, F1 + 1.0], [17.3, 0.6, F1 + 1.0], [17.3, 5.9, F1 + 1.0]]],
  ['over the library shelves', [[12.0, 3.4, F1 + 2.3], [19.5, 3.4, F1 + 2.3]]],
  ['between the lunch tables', [[3.6, 13.4, 1.0], [14.4, 13.4, 1.0]]],
  ['round the kitchen island', [[16.9, 11.2, 1.3], [18.2, 13.2, 1.3], [16.9, 15.0, 1.3], [15.5, 13.2, 1.3], [16.9, 11.2, 1.3]]],
  ['round the staff room islands', [[20.4, 11.0, 1.2], [20.4, 16.4, 1.2], [24.0, 16.4, 1.2], [24.0, 11.0, 1.2], [26.6, 13.8, 1.2]]],
  ['between the nurse\'s beds and out to the store', [[29.24, 16.6, 1.2], [29.24, 14.0, 1.2], [29.5, 12.95, 1.2], [32.6, 12.95, 1.2], [36.4, 13.2, 1.2]]],
  ['down the store aisle', [[31.4, 13.2, 1.0], [36.6, 13.2, 1.0]]],
  ['between the shoe lockers', [[29.6, 5.0, 1.0], [36.4, 5.0, 1.0], [36.4, 3.3, 1.0], [29.6, 3.3, 1.0], [29.6, 1.4, 1.0], [36.4, 1.4, 1.0]]],
  ['across the music room over the risers', [[29.6, 1.2, F1 + 1.4], [36.4, 6.6, F1 + 1.4]]],
  ['through the art room between the tables', [[3.8, 13.85, F1 + 1.2], [14.4, 13.85, F1 + 1.2]]],
  ['down the computer room rows', [[15.6, 13.0, F1 + 1.3], [26.5, 13.0, F1 + 1.3], [26.5, 15.0, F1 + 1.3], [15.6, 15.0, F1 + 1.3]]],
  ['through the club room\'s gate', [[33.61, 11.6, F1 + 0.4], [33.61, 13.2, F1 + 0.4]]],
  ['round the club room', [[28.0, 11.0, F1 + 1.2], [36.0, 11.0, F1 + 1.2], [35.0, 15.0, F1 + 1.4], [28.0, 15.0, F1 + 1.2]]],
];


function linesBlock(near) {
  console.log(`\n3. lines, swept with a ball of ${r3(BALL)} m`);
  for (const [name, pts] of LINES) {
    const r = sweep(near, pts);
    check(name, !r, r ? `${r.hit.name || r.hit.kind} at plan ${JSON.stringify(r.at)}` : 'clear');
  }
}

/* ------------------------------------------------------------------ */
/* 4. The pads and the bots' led ways                                  */
/* ------------------------------------------------------------------ */

function padsBlock(near) {
  console.log('\n4. pads and led ways');
  for (const p of [...PADS, TANK_PAD]) {
    const h = (p.h ?? floorOf(p.f)) + 0.3;
    const at = worldAt(p.px, p.py, h);
    const hit = hitAt(near(at), at, 0.2 * S);
    check(`the pad at ${p.px}, ${p.py} upstairs ${p.f} is clear 20 cm round over it`, !hit, hit ? hit.name || hit.kind : 'clear');
  }
}

function sweep(near, pts) {
  const step = 0.05;
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = worldAt(...pts[i]);
    const b = worldAt(...pts[i + 1]);
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
    for (let k = 0; k <= n; k += 1) {
      const t = k / n;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const hit = hitAt(near(p), p, BALL);
      if (hit) {
        return { hit, at: pts[i].map((v, j) => r3(v + (pts[i + 1][j] - v) * t)) };
      }
    }
  }
  return null;
}

function pathsBlock(near) {
  for (const w of PATHS) {
    const r = sweep(near, w.points);
    check(`the bots' way ${w.id} is clear`, !r, r ? `${r.hit.name || r.hit.kind} at plan ${JSON.stringify(r.at)}` : `${w.points.length} points`);
  }
}

/* ------------------------------------------------------------------ */
/* 6. Leaks                                                            */
/* ------------------------------------------------------------------ */

/*
 * Where a pilot gets through something that looks solid (the owner's ask
 * of 4 November 2026, "look for issues where it's possible to fly through
 * walls"). The air the craft can reach is found as a grid of cells a tenth
 * of a metre on a side over the school and a margin round it: every solid of
 * the school's, grown by the craft's radius, fills the cells whose centres it
 * covers, and the air is every cell the start reaches through empty ones,
 * face to face. The margin outside the walls and over the roof is reached
 * but not gone on from. Then three questions of that air:
 *
 *   out      it reaches outside only in front of a door that is open: a
 *            gap anywhere else in the walls or the roof is a way out
 *   inside   no air inside a thing drawn thick (all three sides over a
 *            fifth of a metre, or round and wider than a sixth) that is not
 *            solid: a pilot would fly through a crate that is only a
 *            picture of one
 *   through  no drawn sheet (a face or paint under five centimetres thick
 *            and a quarter of a square metre or more) has air six
 *            centimetres off it on both sides: a wall that is only paint
 *
 * A gap the craft only just fits may read either way at this grid, so this
 * is a net for holes and missing solids, not a ruler; the lines and the
 * gaps above are the rulers.
 */
const CELL = 0.1 * S;
const MARGIN_OUT = 0.6;

function leaksOf(L, own) {
  const { OX, OZ } = FRAME;
  const R = CRAFT_WORLD_R;
  const gx0 = OX - MARGIN_OUT * S;
  const gz0 = OZ - (DEP + MARGIN_OUT) * S;
  const nx = Math.ceil(((LEN + 2 * MARGIN_OUT) * S) / CELL);
  const nz = Math.ceil(((DEP + 2 * MARGIN_OUT) * S) / CELL);
  const ny = Math.ceil(((HIGH + 0.5) * S) / CELL);
  const at = (i, j, k) => (k * nz + j) * nx + i;
  const centre = (i, j, k) => [gx0 + (i + 0.5) * CELL, (k + 0.5) * CELL, gz0 + (j + 0.5) * CELL];
  const cellOf = (p) => [Math.floor((p[0] - gx0) / CELL), Math.floor((p[2] - gz0) / CELL), Math.floor(p[1] / CELL)];
  const clampI = (v, n) => Math.max(0, Math.min(n - 1, v));
  /* 1 solid, 2 air reached, 3 outside reached. */
  const g = new Uint8Array(nx * ny * nz);
  for (const s of own) {
    const lo = s.box ? [s.box[0], s.box[1], s.box[2]] : [Math.min(s.cap[0], s.cap[3]) - s.cap[6], Math.min(s.cap[1], s.cap[4]) - s.cap[6], Math.min(s.cap[2], s.cap[5]) - s.cap[6]];
    const hi = s.box ? [s.box[3], s.box[4], s.box[5]] : [Math.max(s.cap[0], s.cap[3]) + s.cap[6], Math.max(s.cap[1], s.cap[4]) + s.cap[6], Math.max(s.cap[2], s.cap[5]) + s.cap[6]];
    const [i0, j0, k0] = cellOf([lo[0] - R, lo[1] - R, lo[2] - R]);
    const [i1, j1, k1] = cellOf([hi[0] + R, hi[1] + R, hi[2] + R]);
    for (let k = clampI(k0, ny); k <= clampI(k1, ny); k += 1) {
      for (let j = clampI(j0, nz); j <= clampI(j1, nz); j += 1) {
        for (let i = clampI(i0, nx); i <= clampI(i1, nx); i += 1) {
          const c = centre(i, j, k);
          if ((s.box ? boxDist(s.box, c) : segDist(s.cap, c)) < R) {
            g[at(i, j, k)] = 1;
          }
        }
      }
    }
  }
  const outside = (c) => {
    const px = (c[0] - OX) / S;
    const py = (OZ - c[2]) / S;
    return px < -0.3 || px > LEN + 0.3 || py < -0.3 || py > DEP + 0.3 || c[1] / S > HIGH + 0.25;
  };
  const start = worldAt(PADS[0].px, PADS[0].py, floorOf(PADS[0].f) + 1.2);
  const q = new Int32Array(nx * ny * nz);
  let head = 0;
  let tail = 0;
  const s0 = cellOf(start);
  q[tail++] = at(...s0);
  g[q[0]] = 2;
  const outs = [];
  while (head < tail) {
    const n = q[head++];
    const i = n % nx;
    const j = Math.floor(n / nx) % nz;
    const k = Math.floor(n / (nx * nz));
    for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const a = i + di;
      const b = j + dj;
      const c = k + dk;
      if (a < 0 || b < 0 || c < 0 || a >= nx || b >= nz || c >= ny) {
        continue;
      }
      const m = at(a, b, c);
      if (g[m] !== 0) {
        continue;
      }
      const p = centre(a, b, c);
      if (outside(p)) {
        g[m] = 3;
        outs.push(p);
        continue;
      }
      g[m] = 2;
      q[tail++] = m;
    }
  }
  const air = (p) => {
    const [i, j, k] = cellOf(p);
    return i >= 0 && j >= 0 && k >= 0 && i < nx && j < nz && k < ny && g[at(i, j, k)] >= 2;
  };
  const plan = (p) => [r3((p[0] - OX) / S), r3((OZ - p[2]) / S), r3(p[1] / S)];
  /* out: in front of an open door, or nowhere. */
  const doors = Object.values(OPENINGS).filter((o) => o.y !== undefined && (o.y < 0 || o.y > DEP));
  const ways = new Map();
  for (const p of outs) {
    const [px, py, h] = plan(p);
    const door = doors.some((o) => px > o.x0 && px < o.x1 && h > o.h0 && h < o.h1 && Math.abs(py - o.y) < 0.5);
    if (!door) {
      const key = `${Math.round(px)},${Math.round(py)},${Math.round(h)}`;
      ways.set(key, (ways.get(key) || 0) + 1);
    }
  }
  /* inside and through: the drawn parts that are not solid. */
  const inside = [];
  const through = [];
  for (const p of L.parts) {
    if (!p.draw || p.solid !== false) {
      continue;
    }
    if (p.t === 'cap') {
      for (const t of [0.25, 0.5, 0.75]) {
        const c = [0, 1, 2].map((m) => p.a[m] + (p.b[m] - p.a[m]) * t);
        if (p.r > 0.08 * S && air(c)) {
          inside.push(`${p.name || p.m} at ${plan(c).join(', ')}`);
          break;
        }
      }
      continue;
    }
    const lo = p.lo;
    const hi = p.hi;
    const d = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    if (d.every((v) => v > 0.2 * S)) {
      const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      if (air(c)) {
        inside.push(`${p.name || p.m} at ${plan(c).join(', ')}`);
      }
      continue;
    }
    const k = d.indexOf(Math.min(...d));
    const o = [0, 1, 2].filter((m) => m !== k);
    if (d[k] > 0.05 * S || d[o[0]] * d[o[1]] < 0.25 * S * S) {
      continue;
    }
    /* Six centimetres off each side: inside any wall or board it is
     * painted on, in the air if there is air there. */
    const off = d[k] / 2 + 0.06 * S;
    let hit = null;
    for (let u = lo[o[0]] + CELL; u < hi[o[0]] - CELL && !hit; u += 2 * CELL) {
      for (let v = lo[o[1]] + CELL; v < hi[o[1]] - CELL && !hit; v += 2 * CELL) {
        const c = [0, 0, 0];
        c[o[0]] = u;
        c[o[1]] = v;
        c[k] = (lo[k] + hi[k]) / 2;
        const a = c.slice();
        const b = c.slice();
        a[k] -= off;
        b[k] += off;
        if (air(a) && air(b)) {
          hit = c;
        }
      }
    }
    if (hit) {
      through.push(`${p.name || p.m} at ${plan(hit).join(', ')}`);
    }
  }
  /* Every room reached: some cell of air a metre over its floor. */
  const missed = [];
  for (const r of ROOMS) {
    const fs = r.f === null ? [0, 1] : [r.f];
    let ok = false;
    for (const f of fs) {
      for (let x = r.x0 + 0.3; x < r.x1 - 0.3 && !ok; x += 0.2) {
        for (let y = r.y0 + 0.3; y < r.y1 - 0.3 && !ok; y += 0.2) {
          ok = air(worldAt(x, y, floorOf(f) + 1.0));
        }
      }
    }
    if (!ok) {
      missed.push(r.id);
    }
  }
  return { reached: tail, ways, inside, through, missed };
}

function leaksBlock(L, own) {
  console.log('\n6. leaks');
  const { reached, ways, inside, through, missed } = leaksOf(L, own);
  console.log(`        ${reached} cells of air reached from the start`);
  const w = [...ways.entries()].map(([k, n]) => `${k} (${n})`);
  check('the air never leaves the school', w.length === 0, w.slice(0, 8).join('; ') || 'closed');
  check('every room is reached', missed.length === 0, missed.join(', ') || `${ROOMS.length} rooms`);
  check('no air inside a thing drawn thick and not solid', inside.length === 0, inside.slice(0, 8).join('; ') || 'none');
  check('no drawn sheet has air on both sides', through.length === 0, through.slice(0, 8).join('; ') || 'none');
}

/* ------------------------------------------------------------------ */
/* 5. Slots                                                            */
/* ------------------------------------------------------------------ */

/*
 * The slots the gap rule allows here, each for its reason. Matched on the
 * two solids' names, and on the axis the slot opens along ('up' for a
 * space between a thing and what is over it).
 */
const UNDER = new Set(['chair', 'desk', 'table', 'bench', 'cart']);
const ALLOWED = [
  ['under a chair, a desk, a table, a bench or a cart: the space a whoop flies under one, the slab or the floor under it',
    (a, b, axis) => axis === 'up' && ((UNDER.has(a) && b === 'slab') || (UNDER.has(b) && a === 'slab'))],
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
  check(`no slot between ${r3(2 * CRAFT_WORLD_R)} and ${GAP_MIN} m between two of the school's boxes`, bad.length === 0,
    bad.length ? bad.slice(0, 8).map((f) => `${f.a} and ${f.b}, ${r3(f.w)} m ${f.axis}, ${at(f.mid)}`).join('; ') : `${own.filter((s) => s.box).length} boxes`);
  ALLOWED.forEach(([why], i) => console.log(`        allowed ${allowed[i]}: ${why}`));
}

/* ------------------------------------------------------------------ */
/* 6. The module                                                       */
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
  console.log('\n7. module');
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
  console.log('school-check: Midori Gakuen, src/maps/school/');
  const L = layoutBlock();
  const { placed, near, own } = await placedBlock(L);
  linesBlock(near);
  padsBlock(near);
  pathsBlock(near);
  slotsBlock(own);
  leaksBlock(L, own);
  await moduleBlock(placed);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
