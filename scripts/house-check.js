/*
 * house-check.js: Nick Burns' house (src/maps/house/), proved buildable,
 * flyable and cheap in plain Node.
 *
 * The house is one structure of a few thousand parts written in plan terms
 * and turned into the world's metres by one helper, so what can go wrong
 * with it is a number: a NaN, a wall where a door was meant, a roof's band
 * standing proud of its slope, a colour that is one more draw call, a
 * spawn seated on the paving under the floor. None of it shows in a
 * screenshot until a pilot hits it. This looks for it, in these blocks:
 *
 *   1. layout     every part finite, every colour one the kit knows, the
 *                 house's own colours within its draw call budget, and two
 *                 builds the same to the bit
 *   2. placed     the document normalizes with no repairs, the house goes
 *                 in as the built map puts it in (addExtra in
 *                 src/maps/built/index.js), the start is seated on the
 *                 floor and a ball the size of a craft is clear over it,
 *                 and the module's broadphase (src/native/world.c) holds
 *                 it: its shapes under WORLD_MAX_SHAPES and the most any
 *                 one step can gather under WORLD_MAX_CAND, past which a
 *                 contact would be dropped
 *   3. lines      the lines a pilot flies, as straight runs in plan metres,
 *                 swept with a ball twice the craft's radius: through every
 *                 door of the ground floor's loop, up the stairs, into every
 *                 room upstairs, out of the windows that are openings, into
 *                 the garage, under the pergola and through its rafters,
 *                 through the porch and the swings
 *   4. gaps       every named gap's window clear of every solid by the
 *                 craft's radius
 *   5. slots      the gap rule (GAP_MIN in src/props/parts.js) inside the
 *                 house: no two of its boxes face each other across a space
 *                 the craft fits into and cannot fly through, with nothing
 *                 between them. Two kinds are allowed and counted, each
 *                 with its reason in ALLOWED below
 *   6. roofs      under the slopes, the solid's top within one band of the
 *                 drawn surface and never over it, and under a gable's
 *                 rake, air under the slab
 *   7. module     with a build of dist/sim.wasm, the craft lifted off the
 *                 start and held at a metre and a half for two seconds in
 *                 the real module, touching nothing, twice to the bit
 *   8. nick       Nick at his patio table (src/maps/house/nick.js), every
 *                 twentieth of a second of his hour: every number finite,
 *                 no step faster than a walk and no turn faster than a
 *                 person turns, his lowest sole on the floor under him, the
 *                 hour wrapping where it started; his chair and the sofa
 *                 under the seats he sits on; every walk swept with a
 *                 person's width, clear of every solid but the chair he
 *                 gets up from; and every line called, none twice running
 *
 * Usage: node scripts/house-check.js
 *
 * WHAT A FAILURE MEANS. The line names the line or the place and the solid
 * in the way. A threshold here is never widened to make a line pass
 * (CLAUDE.md); the argument goes in PROGRESS.md.
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
import { houseLayout, basementFloorAt, S, FLOOR0, BF, worldAt } from '../src/maps/house/house.js';
import { houseDocument } from '../src/maps/house/yard.js';
import { MATERIALS as HOME_MATERIALS } from '../src/props/homes.js';
import { GAP_MIN } from '../src/props/parts.js';
import { placeSolids, addSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument, indexTops, topUnder, groundUnder, SUPPORT_TIE } from '../src/maps/built/place.js';
import { Colliders, CRAFT_WORLD_R, GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { uploadWorld, setWorldFrame } from '../src/game/plantworld.js';
import { threePosToSim } from '../src/render/frame.js';
import { sincos } from '../src/props/trig.js';
import {
  nickAt, nickPose, nickBones, BONE as NICK_BONE, SOLE as NICK_SOLE, NICK_PERIOD_MS, NICK_PLACES, NICK_SEAT,
  NICK_LINES, NICK_CALLS,
} from '../src/maps/house/nick.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;

function check(name, ok, detail = '') {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

const r3 = (v) => Math.round(v * 1000) / 1000;

/* The house's own draw calls: one a colour in its chunk (the kit bakes a
 * batch per material per chunk), and src/props/homes.js holds the house to
 * this many. */
const HOUSE_COLOURS_MAX = 45;
/* The swept ball: twice the craft's radius, so a line that passes has the
 * craft's width of air either side of it. */
const BALL = 2 * CRAFT_WORLD_R;
/* One band of a roof's solid in the world's metres (BAND in house.js,
 * three times 5 cm), and the rounding the arithmetic is allowed. */
const BAND_WORLD = 0.15;
/* A roof's slab, real metres (ROOF_T in house.js). */
const ROOF_T = 0.21;
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
  const L = houseLayout();
  const bad = L.parts.filter((p) => (p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]).some((v) => !Number.isFinite(v)));
  const badPrisms = L.prisms.filter((q) => [...q.profile.flat(), q.e0, q.e1].some((v) => !Number.isFinite(v)));
  check('every part and prism is finite', bad.length === 0 && badPrisms.length === 0,
    `${L.parts.length} parts, ${L.prisms.length} prisms, ${bad.length + badPrisms.length} with a non-finite number`);
  const own = L.parts.filter((p) => p.draw).map((p) => p.m);
  const colours = new Set([...own, ...L.prisms.map((q) => q.m), ...L.discs.map((d) => d.m), ...L.cones.map((c) => c.m)]);
  const unknown = [...colours].filter((m) => !HOME_MATERIALS[m]);
  check('every colour the house draws is one of src/props/homes.js', unknown.length === 0, unknown.join(', ') || `${colours.size} colours`);
  check(`the house draws at most ${HOUSE_COLOURS_MAX} colours, so its chunk is at most that many draw calls`,
    colours.size <= HOUSE_COLOURS_MAX, `${colours.size}`);
  const unused = Object.keys(HOME_MATERIALS).filter((m) => !colours.has(m));
  check('every colour in src/props/homes.js is drawn', unused.length === 0, unused.join(', ') || 'all drawn');
  const a = hashOf(L);
  const b = hashOf(houseLayout());
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
  const { doc, repairs } = normalize(houseDocument());
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
  check('the start is seated on the ground floor', Math.abs(sp.y - S * FLOOR0) < 1e-6, `${r3(sp.y)} m, the floor is ${r3(S * FLOOR0)}`);
  check('nothing inflated', (placed.stats.inflated || 0) === 0, `${placed.stats.inflated || 0}`);
  groundChecks(placed);
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

/*
 * THE GROUND UNDER THE BASEMENT: the built map's `height` with the house's
 * floor, asked the way the shell asks for a craft, from 0.4 under its
 * centre with the centre as cgY (src/main.js raiseGroundFromState).
 */
function groundChecks(placed) {
  const ask = (px, py, h) => {
    const [x, y, z] = worldAt(px, py, h);
    return groundUnder(placed.tops, x, z, y - 0.4, y, basementFloorAt(x, z));
  };
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const lounge = ask(4.95, 1.15, BF + 0.05);
  check('a craft on the basement floor stands on the floor', near(lounge, S * BF), `${r3(lounge)} m, the floor is ${r3(S * BF)}`);
  const table = ask(3.6, 5.7, BF + 0.81);
  check('on the basement table it stands on the table', near(table, S * (BF + 0.76) - SUPPORT_TIE), `${r3(table)} m`);
  const foyer = ask(6.0, 2.5, FLOOR0 + 0.05);
  check('on the ground floor over the basement it stands on the ground floor', near(foyer, S * FLOOR0 - SUPPORT_TIE), `${r3(foyer)} m`);
  const tread = ask(7.8, 2.5, FLOOR0 + 0.05);
  check('over the stair down it stands on the tread under it', tread < 0 && tread > S * BF, `${r3(tread)} m`);
  const lawn = ask(-5, 2, 0.05);
  check('beside the house the ground is the lawn', near(lawn, 0), `${r3(lawn)} m`);
}

/* ------------------------------------------------------------------ */
/* 3. The lines a pilot flies                                          */
/* ------------------------------------------------------------------ */

/* Each line is plan points [px, py, h], real metres, flown straight from
 * one to the next. */
const LINES = [
  ['in the front door to the foyer', [[6.1, -3.0, 1.2], [6.1, 1.6, 1.2]]],
  ['foyer, under the stair foot, into the dining room', [[5.9, 0.62, 1.7], [8.95, 0.62, 1.7]]],
  ['dining room through its door into the back hall', [[8.95, 0.62, 1.7], [8.95, 4.3, 1.7]]],
  ['back hall into the kitchen', [[8.95, 4.3, 1.7], [9.95, 4.3, 1.7], [9.95, 5.6, 1.7]]],
  ['kitchen along the aisle between the island and the sink', [[9.95, 5.6, 1.7], [10.2, 7.1, 1.4], [12.7, 7.1, 1.4]]],
  ['kitchen into the breakfast room', [[9.95, 5.6, 1.7], [8.0, 5.75, 1.7]]],
  ['through the LED cube on the island', [[11.6, 5.3, 1.55], [11.6, 7.3, 1.55]]],
  ['down into the LED cube under the tin panel', [[11.6, 6.2, 2.55], [11.6, 6.2, 1.5]]],
  ['breakfast room through the wide opening into the family room', [[8.0, 5.75, 1.7], [6.5, 6.3, 1.7], [2.0, 6.3, 1.7]]],
  ['breakfast room out the slider onto the patio', [[8.0, 5.75, 1.7], [5.8, 6.6, 1.7], [5.8, 9.6, 1.7]]],
  ['family room through its door into the foyer', [[2.0, 6.3, 1.7], [2.0, 4.45, 1.7], [6.0, 4.45, 1.7]]],
  ['foyer into the front room', [[6.0, 1.42, 1.7], [2.4, 1.42, 1.7]]],
  ['front room out the tall window', [[2.3, 0.5, 1.7], [2.3, -3.0, 1.7]]],
  ['up the stairs to the landing', [[7.75, 0.6, 1.0], [7.75, 2.5, 2.05], [7.75, 5.2, 4.2]]],
  ['landing into the back bedroom', [[7.75, 5.2, 4.2], [9.85, 5.2, 4.2], [9.85, 6.6, 4.2]]],
  ['landing into the kids room and out its window over the garage', [[9.0, 5.2, 4.2], [9.9, 3.35, 4.2], [12.5, 3.35, 4.2], [12.5, 4.4, 4.7], [16.0, 4.4, 4.7]]],
  ['landing into the master', [[7.75, 5.2, 4.2], [5.9, 4.45, 4.2], [2.5, 4.45, 4.2]]],
  ['landing into the front bedroom and out the tall window', [[5.9, 4.45, 4.2], [5.9, 3.3, 4.2], [2.3, 3.3, 4.2], [2.3, -3.0, 4.2]]],
  ['landing into the bathroom', [[5.9, 4.9, 4.2], [5.7, 5.2, 4.2], [5.7, 7.0, 4.2]]],
  ['landing into the end bedroom', [[9.0, 5.2, 4.2], [9.9, 5.47, 4.2], [11.6, 5.47, 4.2], [12.2, 7.4, 4.2]]],
  ['in the open garage door and through to the back hall', [[18.75, -6.0, 1.2], [18.75, 3.0, 1.2], [15.0, 4.3, 1.2], [12.0, 4.3, 1.2]]],
  ['along the porch', [[5.0, -0.8, 1.5], [13.5, -0.8, 1.5]]],
  ['between two porch posts', [[8.2, -4.0, 1.5], [8.2, -0.5, 1.5]]],
  ['in through the bay window', [[7.4, 13.5, 1.4], [8.25, 9.6, 1.4], [8.25, 8.2, 1.4]]],
  ['out through the kitchen window', [[12.1, 7.2, 1.75], [12.1, 10.5, 1.75]]],
  ['under the pergola', [[1.0, 12.0, 2.2], [11.0, 12.0, 2.2]]],
  ['down between two of the pergola rafters', [[5.5, 10.0, 5.0], [5.5, 10.0, 2.6]]],
  ['through the swings', [[28.25, 16.0, 1.5], [28.25, 22.0, 1.5]]],
  ['in the basement door and down the stair to its foot, into the lounge', [[6.2, 4.52, 1.2], [7.8, 4.52, 1.2], [7.8, 4.0, 1.05], [7.8, 1.3, -0.9], [7.8, 0.62, -1.35], [5.0, 0.62, -1.35]]],
  ['off the stair over the half wall into the main room', [[7.75, 1.6, -0.6], [6.0, 1.6, -0.6]]],
  ['from the lounge past the column to the settee', [[4.5, 1.0, -1.2], [4.9, 4.0, -1.2], [4.9, 7.0, -1.2]]],
  ['through the LED cube on the basement table', [[3.6, 4.6, -1.2], [3.6, 6.8, -1.2]]],
  ['down into the LED cube on the basement table', [[3.6, 5.7, -0.2], [3.6, 5.7, -1.4]]],
  ['through the treadmill under its console', [[0.675, 4.25, -1.65], [0.675, 1.5, -1.65]]],
  ['main room into the hall and through to the workshop', [[6.0, 4.68, -1.2], [10.0, 4.68, -1.2], [11.4, 4.68, -1.2], [11.4, 3.0, -1.2]]],
  ['hall into the playroom', [[9.0, 4.68, -1.2], [9.0, 2.6, -1.2]]],
  ['hall into the guest room', [[8.9, 4.68, -1.2], [8.9, 6.0, -1.2]]],
  ['from the stair foot along the front hall into the workshop', [[7.75, 0.62, -1.3], [10.9, 0.8, -1.3], [11.65, 1.0, -1.2], [11.65, 3.0, -1.2]]],
  ['down the workshop between the shelving and the bench', [[12.2, 1.5, -1.2], [12.2, 6.4, -1.2]]],
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

/*
 * The slots the gap rule allows here, each for its reason. Matched on the
 * two solids' names, and on the axis the slot opens along ('up' for a
 * space between a thing and what is over it).
 */
const FLOORS = new Set(['slab', 'bay slab', 'upper floor', 'porch', 'basement slab']);
const ALLOWED = [
  ['under a chair: its seat over the floor, its legs round it, the space a whoop flies under a chair',
    (a, b, axis) => axis === 'up' && ((a === 'chair' && FLOORS.has(b)) || (b === 'chair' && FLOORS.has(a)))],
  ['between two roofs, where one runs under the other\'s overhang: a wedge that opens out down the slope',
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
  const at = (p) => `plan ${JSON.stringify([r3((p[0] + 48) / S), r3((-18 - p[2]) / S), r3(p[1] / S)])}`;
  check(`no slot between ${r3(2 * CRAFT_WORLD_R)} and ${GAP_MIN} m between two of the house's boxes`, bad.length === 0,
    bad.length ? bad.slice(0, 8).map((f) => `${f.a} and ${f.b}, ${r3(f.w)} m ${f.axis}, ${at(f.mid)}`).join('; ') : `${own.filter((s) => s.box).length} boxes`);
  ALLOWED.forEach(([why], i) => console.log(`        allowed ${allowed[i]}: ${why}`));
}

/* ------------------------------------------------------------------ */
/* 6. The roofs                                                        */
/* ------------------------------------------------------------------ */

/* The roofs' top surfaces, real metres, restated from house.js rather than
 * imported, so a slip in its arithmetic is two numbers that disagree. */
const PITCH = 7 / 12;
const frontTop = (py) => 3.15 + PITCH * (py + 1.6);
const rearTop = (py) => 5.654 + PITCH * (8.4 - py);
/* The shed dormer over the dining room sits on the front plane, its roof
 * rising from its lip to the knee wall. */
const DORMER = { x0: 9.55, x1: 13.45, y0: 0.15, y1: 2.8, h0: frontTop(0.35) + 1.1 };
const dormerTop = (py) => DORMER.h0 + ((frontTop(DORMER.y1) - 0.02 - DORMER.h0) * (py - DORMER.y0)) / (DORMER.y1 - DORMER.y0);
const mainTop = (px, py) => {
  const plane = Math.min(frontTop(py), rearTop(py));
  const over = px >= DORMER.x0 && px <= DORMER.x1 && py >= DORMER.y0 && py <= DORMER.y1;
  return over ? Math.max(plane, dormerTop(py)) : plane;
};
const garageTop = (px, py) => Math.min(frontTop(py), 2.946 + PITCH * (5.75 - py));
const brickTop = (px) => 5.45 + PITCH * Math.min(px + 0.35, 4.95 - px);
const pavilionTop = (px) => 2.75 + PITCH * Math.min(px - 14.58, 21.42 - px);

/* Under each gable's rake overhang, a point this far under the slab's
 * underside, real metres, is air. */
const UNDER = 0.12;
const RAKES = [
  ['the brick block\'s front gable', (t) => [0.3 + 4.0 * t, -1.8], (px) => brickTop(px)],
  ['the main roof\'s west gable', (t) => [-0.18, 3.2 + 5.0 * t], (px, py) => mainTop(px, py)],
  ['the garage\'s east gable', (t) => [23.68, -1.2 + 6.4 * t], (px, py) => garageTop(px, py)],
];

function roofsBlock(placed, near) {
  console.log('\n6. roofs');
  const spans = [
    ['the main roof over the hall and stairs', 5.0, 9.4, -1.9, 8.7, mainTop],
    ['the main roof over the bedrooms at the east end', 12.0, 13.95, 2.0, 8.7, mainTop],
    ['the dormer over the dining room', 9.6, 13.4, 0.2, 2.75, mainTop],
    ['the brick block\'s roof', -0.3, 4.55, -1.9, 2.5, brickTop],
    ['the garage roof', 14.2, 23.6, -1.9, 5.7, garageTop],
    ['the pavilion\'s roof', 14.65, 21.35, 9.7, 15.2, pavilionTop],
  ];
  for (const [name, x0, x1, y0, y1, top] of spans) {
    let worst = 0;
    let proud = 0;
    let n = 0;
    for (let i = 0; i <= 20; i += 1) {
      for (let j = 0; j <= 40; j += 1) {
        const px = x0 + ((x1 - x0) * i) / 20;
        const py = y0 + ((y1 - y0) * j) / 40;
        const [x, , z] = worldAt(px, py, 0);
        const want = S * top(px, py);
        const got = topUnder(placed.tops, x, z, want + 2);
        worst = Math.max(worst, want - got);
        proud = Math.max(proud, got - want);
        n += 1;
      }
    }
    check(`${name}: the solid is within a band under the slope`, worst <= BAND_WORLD + EPS && proud <= EPS,
      `${n} points, at most ${r3(worst)} m under and ${r3(proud)} m over`);
  }
  for (const [name, at, top] of RAKES) {
    let hit = null;
    let n = 0;
    for (let i = 0; i <= 40 && !hit; i += 1) {
      const [px, py] = at(i / 40);
      const h = top(px, py) - ROOF_T - UNDER;
      if (h < 0.5) {
        continue;
      }
      const p = worldAt(px, py, h);
      hit = hitAt(near(p), p, 0);
      n += 1;
    }
    check(`${name}: under its rake, air under the slab`, !hit, hit ? `${hit.name || hit.kind}` : `${n} points`);
  }
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
  const y = groundUnder(placed.tops, sp.x, sp.z, sp.y, undefined, basementFloorAt(sp.x, sp.z));
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
  /* In the basement's lounge, the plant's ground seven metres under the
   * lawn's. */
  const [bx, by, bz] = worldAt(4.95, 1.15, BF);
  const down = { x: bx, y: by, z: bz, yaw: 0 };
  const c = await hoverFlight(wasm, config, colliders, placed, 3000, lift, down);
  const d = await hoverFlight(wasm, config, colliders, placed, 3000, lift, down);
  check('two lift offs in the basement agree to the bit', c.hash === d.hash, c.hash.slice(0, 16));
  check('lifting off the basement floor and holding a metre and a half touches nothing', c.touched === 0 && c.top > 1.2,
    `${c.touched} steps in contact, up to ${r3(c.top)} m`);
}

/* ------------------------------------------------------------------ */
/* 8. Nick                                                             */
/* ------------------------------------------------------------------ */

/* A walk at 1.25 m/s, with the rounding of a step that straddles two
 * phases; a person turning on the spot, about a turn in a second. Real
 * metres and seconds. */
const NICK_STEP_MS = 20;
const NICK_SPEED_MAX = 1.3;
const NICK_TURN_MAX = 6.3;
/* His lowest sole against the floor under him: a walk lifts one foot, never
 * both, and a seat holds him a centimetre or so up. */
const NICK_SOLE_LO = -0.02;
const NICK_SOLE_HI = 0.03;
/* A person's half width with an arm's swing, and the heights the sweep
 * looks at, real metres over his floor: shins to head. */
const NICK_R = 0.2;
const NICK_HEIGHTS = [0.35, 0.75, 1.15, 1.55];

function nickBlock(placed, near) {
  console.log('\n8. nick');
  const pose = nickPose();
  const M = new Float64Array(13 * 12);
  const soleOf = (b) => M[b * 12 + 10] - M[b * 12 + 4] * NICK_SOLE;
  let bad = 0;
  let fast = 0;
  let turn = 0;
  let soleLo = Infinity;
  let soleHi = -Infinity;
  let prev = null;
  for (let T = 0; T <= NICK_PERIOD_MS; T += NICK_STEP_MS) {
    nickAt(T, null, pose);
    nickBones(pose, M);
    if (![pose.x, pose.y, pose.yaw, pose.pelvisH, ...pose.J, ...M].every(Number.isFinite)) {
      bad += 1;
      continue;
    }
    if (prev) {
      fast = Math.max(fast, Math.hypot(pose.x - prev[0], pose.y - prev[1]) / (NICK_STEP_MS / 1000));
      let d = Math.abs(pose.yaw - prev[2]) % (2 * Math.PI);
      d = Math.min(d, 2 * Math.PI - d);
      turn = Math.max(turn, d / (NICK_STEP_MS / 1000));
    }
    prev = [pose.x, pose.y, pose.yaw];
    const lo = Math.min(soleOf(NICK_BONE.footL), soleOf(NICK_BONE.footR)) - pose.floor;
    soleLo = Math.min(soleLo, lo);
    soleHi = Math.max(soleHi, lo);
  }
  const samples = Math.floor(NICK_PERIOD_MS / NICK_STEP_MS) + 1;
  check(`every number of every pose is finite, ${samples} poses over his ${r3(NICK_PERIOD_MS / 60000)} minutes`, bad === 0, `${bad} not`);
  check(`no step faster than ${NICK_SPEED_MAX} m/s`, fast <= NICK_SPEED_MAX, `${r3(fast)} m/s at most`);
  check(`no turn faster than ${NICK_TURN_MAX} rad/s`, turn <= NICK_TURN_MAX, `${r3(turn)} rad/s at most`);
  check(`his lowest sole is within ${NICK_SOLE_LO} and ${NICK_SOLE_HI} m of the floor in every pose`,
    soleLo >= NICK_SOLE_LO && soleHi <= NICK_SOLE_HI, `${r3(soleLo)} to ${r3(soleHi)} m`);
  const a = nickAt(0, null, nickPose());
  const b = nickAt(NICK_PERIOD_MS, null, nickPose());
  check('the hour wraps where it started, in his chair', a.state === 'seated' && b.state === 'seated'
    && a.x === b.x && a.y === b.y && a.yaw === b.yaw, `${a.state} at ${r3(a.x)}, ${r3(a.y)}`);

  /* The seats: a solid's top under each, at the height he sits on. */
  for (const [name, seat] of [['his chair', NICK_SEAT], ...NICK_PLACES.filter((p) => p.seat).map((p) => [`the ${p.id}`, p.seat])]) {
    const [x, , z] = worldAt(seat.at[0], seat.at[1]);
    let top = 0;
    for (const s of placed.solids) {
      const q = s.box;
      if (q && x > q[0] && x < q[3] && z > q[2] && z < q[5] && q[4] <= S * (seat.top + 0.1)) {
        top = Math.max(top, q[4]);
      }
    }
    check(`${name}'s seat is under where he sits`, Math.abs(top - S * seat.top) < S * 0.01,
      `a top at ${r3(top / S)} m, he sits at ${r3(seat.top)} m`);
  }

  /* The walks, swept. The one solid allowed is the chair he gets up from,
   * whose seat his legs cross as he steps out from beside it. */
  const own = (s) => {
    const q = s.box ?? [Math.min(s.cap[0], s.cap[3]), 0, Math.min(s.cap[2], s.cap[5]), Math.max(s.cap[0], s.cap[3]), 0, Math.max(s.cap[2], s.cap[5])];
    const [x, , z] = worldAt(NICK_SEAT.at[0], NICK_SEAT.at[1]);
    return Math.hypot((q[0] + q[3]) / 2 - x, (q[2] + q[5]) / 2 - z) < S * 0.4;
  };
  for (const place of NICK_PLACES) {
    let hit = null;
    let at = null;
    const pts = place.route;
    for (let i = 0; i + 1 < pts.length && !hit; i += 1) {
      const n = Math.max(1, Math.ceil(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) / 0.05));
      for (let k = 0; k <= n && !hit; k += 1) {
        const px = pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * k) / n;
        const py = pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * k) / n;
        const f = py < 8.4 && px > 0 && px < 14 ? FLOOR0 : 0.03;
        for (const h of NICK_HEIGHTS) {
          const p = worldAt(px, py, f + h);
          const s = hitAt(near(p).filter((q) => !own(q)), p, S * NICK_R);
          if (s) {
            hit = s;
            at = [r3(px), r3(py), r3(h)];
            break;
          }
        }
      }
    }
    check(`his walk to the ${place.id} keeps a person's width clear`, !hit,
      hit ? `${hit.name || hit.kind} at plan ${JSON.stringify(at)}` : `${pts.length} points`);
  }

  /* The lines. */
  const said = new Set(NICK_CALLS.map((c) => c.line));
  const twice = NICK_CALLS.filter((c, i) => i > 0 && c.line === NICK_CALLS[i - 1].line).length;
  check(`every one of his ${NICK_LINES.length} lines is called, none twice running`,
    said.size === NICK_LINES.length && twice === 0, `${said.size} called, ${twice} repeats in ${NICK_CALLS.length}`);
}

async function main() {
  console.log('house-check: Nick Burns\' house, src/maps/house/');
  const L = layoutBlock();
  const { placed, near, own } = await placedBlock(L);
  linesBlock(near);
  gapsBlock(placed, near);
  slotsBlock(own);
  roofsBlock(placed, near);
  await moduleBlock(placed);
  nickBlock(placed, near);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
