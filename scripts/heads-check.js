/*
 * heads-check.js: Heads' house (src/maps/heads/), proved buildable,
 * flyable and cheap in plain Node, the way scripts/house-check.js proves
 * Nick Burns' house, whose machinery this is: the same sweeps, the same
 * gap rule, the same module flight. What changes is the house's own data:
 * its floors, the lines a pilot flies through it, its roofs and its start.
 *
 *   1. layout     every part finite, every colour one the kit knows, the
 *                 house's colours within its draw call budget, Heads'
 *                 own six colours in src/props/homes.js all drawn, and two
 *                 builds the same to the bit
 *   2. placed     the document normalizes with no repairs, the house goes
 *                 in as the built map puts it in, the start is seated on
 *                 the garage floor and a ball the size of a craft is clear
 *                 over it, the ground under the basement is its floor,
 *                 and the module's broadphase holds the map
 *   3. lines      the lines a pilot flies, swept with a ball twice the
 *                 craft's radius: out of the garage, down into the
 *                 basement and round it, up both flights, through every
 *                 room, out of the windows that are openings, round the
 *                 yard, through the gates
 *   4. gaps       every named gap's window clear of every solid by the
 *                 craft's radius
 *   5. slots      the gap rule inside the house's own boxes
 *   6. roofs      under the slopes, the solid within one band of the drawn
 *                 surface and never over it; under each rake, air
 *   7. module     with a build of dist/sim.wasm, the craft lifted off the
 *                 start and off the basement floor and held at a metre and
 *                 a half for two seconds, touching nothing, twice to the bit
 *   8. logos      (./src/maps/heads/logos.js, run before 7) the sheets the
 *                 size the crops say, the atlas's cells in it and apart,
 *                 every roster brand hung once and each sign on its face
 *                 all over, every decal and patch landed and flat on what
 *                 it is on with nothing through it, no brand painted
 *                 again, the Infinity Loops logo six, and the
 *                 patch under Heads' car found by the game's own test
 *                 flying in under it and from nowhere a pilot stands
 *
 * Usage: node scripts/heads-check.js
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
import { headsLayout, basementFloorAt, S, FL, FG, FM, FU, worldAt, FRAME } from '../src/maps/heads/heads.js';
import { headsDocument } from '../src/maps/heads/yard.js';
import { MATERIALS as HOME_MATERIALS } from '../src/props/homes.js';
import { GAP_MIN } from '../src/props/parts.js';
import { placeSolids, addSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument, indexTops, topUnder, groundUnder, SUPPORT_TIE } from '../src/maps/built/place.js';
import { Colliders, CRAFT_WORLD_R, GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { uploadWorld, setWorldFrame } from '../src/game/plantworld.js';
import { threePosToSim } from '../src/render/frame.js';
import { sincos } from '../src/props/trig.js';
import { seesMark } from '../src/game/egg.js';
import { coplanarPairs, separateCoplanar, LIFT } from '../src/props/coplanar.js';
import {
  headsAt, headsPose, headsBones, BONE as MAN_BONE, SOLE as MAN_SOLE, STOPS, HEADS_PHASES, HEADS_PERIOD_MS, HEADS_LINES,
} from '../src/maps/heads/man.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;

function check(name, ok, detail = '') {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

const r3 = (v) => Math.round(v * 1000) / 1000;

/* The house's own draw calls, as house-check.js holds Nick's: one a colour
 * in its chunk. */
const HOUSE_COLOURS_MAX = 45;
/* The swept ball: twice the craft's radius, so a line that passes has the
 * craft's width of air either side of it. */
const BALL = 2 * CRAFT_WORLD_R;
/* One band of a roof's solid in the world's metres (BAND in heads.js,
 * 5 real cm, times S), and the rounding the arithmetic is allowed. */
const BAND_WORLD = S * 0.05;
/* A roof's slab, real metres (ROOF_T in heads.js). */
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
  for (const f of L.flats) {
    h.update(f.m);
    for (const v of [...f.pts.flat(), f.h0, f.h1]) {
      num(v);
    }
  }
  return h.digest('hex');
}

function layoutBlock() {
  console.log('\n1. layout');
  const L = headsLayout();
  const bad = L.parts.filter((p) => (p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]).some((v) => !Number.isFinite(v)));
  const badPrisms = L.prisms.filter((q) => [...q.profile.flat(), q.e0, q.e1].some((v) => !Number.isFinite(v)));
  const badFlats = L.flats.filter((f) => [...f.pts.flat(), f.h0, f.h1].some((v) => !Number.isFinite(v)));
  check('every part, prism and flat is finite', bad.length + badPrisms.length + badFlats.length === 0,
    `${L.parts.length} parts, ${L.prisms.length} prisms, ${L.flats.length} flats, ${bad.length + badPrisms.length + badFlats.length} with a non-finite number`);
  const own = L.parts.filter((p) => p.draw).map((p) => p.m);
  const colours = new Set([...own, ...L.prisms.map((q) => q.m), ...L.flats.map((f) => f.m), ...L.discs.map((d) => d.m),
    ...L.cyls.map((c) => c.m), ...L.cones.map((c) => c.m)]);
  const unknown = [...colours].filter((m) => !HOME_MATERIALS[m]);
  check('every colour the house draws is one of src/props/homes.js', unknown.length === 0, unknown.join(', ') || `${colours.size} colours`);
  check(`the house draws at most ${HOUSE_COLOURS_MAX} colours, so its chunk is at most that many draw calls`,
    colours.size <= HOUSE_COLOURS_MAX, `${colours.size}`);
  const unused = Object.keys(HOME_MATERIALS).filter((m) => m.startsWith('heads') && !colours.has(m));
  check('every one of Heads\' own colours in src/props/homes.js is drawn', unused.length === 0, unused.join(', ') || 'all drawn');
  const a = hashOf(L);
  const b = hashOf(headsLayout());
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
  const { doc, repairs } = normalize(headsDocument());
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
  check('the start is seated on the garage floor', Math.abs(sp.y - S * FG) < 1e-6, `${r3(sp.y)} m, the floor is ${r3(S * FG)}`);
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
 * centre with the centre as cgY.
 */
function groundChecks(placed) {
  const ask = (px, py, h) => {
    const [x, y, z] = worldAt(px, py, h);
    return groundUnder(placed.tops, x, z, y - 0.4, y, basementFloorAt(x, z));
  };
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const family = ask(12.0, 3.0, FL + 0.05);
  check('a craft on the basement floor stands on the floor', near(family, S * FL - SUPPORT_TIE) || near(family, S * FL), `${r3(family)} m, the floor is ${r3(S * FL)}`);
  const garage = ask(15.9, 5.2, FG + 0.05);
  check('in the garage it stands on the slab', near(garage, S * FG - SUPPORT_TIE) || near(garage, S * FG), `${r3(garage)} m`);
  const living = ask(3.0, 3.6, FM + 0.05);
  check('in the living room it stands on the main floor', near(living, S * FM - SUPPORT_TIE), `${r3(living)} m`);
  const bed = ask(13.0, 2.0, FU + 0.05);
  check('upstairs it stands on the upstairs floor', near(bed, S * FU - SUPPORT_TIE), `${r3(bed)} m`);
  const tread = ask(9.6, 1.75, FM - 0.3);
  check('over the stair down it stands on the tread under it', tread < S * FM && tread > S * FL, `${r3(tread)} m`);
  const lawn = ask(-3, 2, 0.05);
  check('beside the house the ground is the lawn', near(lawn, 0), `${r3(lawn)} m`);
}

/* ------------------------------------------------------------------ */
/* 3. The lines a pilot flies                                          */
/* ------------------------------------------------------------------ */

/* Each line is plan points [px, py, h], real metres, flown straight from
 * one to the next. */
const LINES = [
  ['off the start under the drone shelf and out of the garage door', [[15.9, 5.2, 0.6], [15.9, 3.0, 0.9], [15.9, -3.0, 0.9]]],
  ['in the garage door, through the gate, to the bench', [[15.9, -6.0, 0.9], [15.9, 5.2, 0.9], [15.9, 7.3, 0.93]]],
  ['through the garage gate', [[15.875, 5.6, 0.93], [15.875, 7.2, 0.93]]],
  ['garage down into the basement through its door', [[15.0, 4.65, 0.9], [13.85, 4.65, 0.9], [12.6, 4.65, 0.5]]],
  ['round the basement: past the posts, the bag and the couch', [[12.6, 4.65, 0.5], [12.6, 1.4, 0.5], [12.3, 1.4, 0.5], [12.3, 6.6, 0.5], [10.6, 7.0, 0.6]]],
  ['through the basement gate', [[12.3, 3.6, 0.38], [9.8, 3.6, 0.38]]],
  ['out of the basement window to the front', [[11.8, 2.4, 0.8], [11.8, -3.0, 0.8]]],
  ['in the front door to the foyer', [[7.375, -4.0, 1.8], [7.375, 2.0, 1.8]]],
  ['foyer down the stair into the basement', [[7.6, 1.75, 1.6], [8.5, 1.75, 1.6], [10.0, 1.75, 0.6], [12.4, 1.75, 0.3]]],
  ['foyer up the stair to the landing', [[7.6, 0.675, 1.8], [8.5, 0.675, 1.9], [10.6, 0.675, 3.0], [11.2, 2.5, 3.0]]],
  ['foyer into the living room and out its window', [[7.4, 3.3, 1.8], [5.0, 3.3, 1.8], [2.9, 2.0, 2.4], [2.9, -3.0, 2.4]]],
  ['living room through to the dining room and out the slider', [[2.4, 3.2, 1.8], [2.4, 5.0, 1.8], [2.1, 7.5, 1.8], [2.1, 11.5, 1.8]]],
  ['foyer through the kitchen and out its window', [[7.4, 3.3, 1.8], [7.4, 5.0, 1.8], [6.2, 6.5, 2.3], [6.2, 11.0, 2.4]]],
  ['landing into the main bedroom and out its front window', [[11.2, 2.5, 3.2], [11.2, 3.3, 3.2], [13.1, 3.3, 3.2], [13.1, 1.0, 3.6], [13.1, -3.0, 3.6]]],
  ['main bedroom out the side window', [[15.0, 2.0, 3.9], [21.0, 2.0, 3.6]]],
  ['landing down the hall into the back bedrooms', [[11.2, 3.0, 3.2], [11.2, 4.6, 3.2], [12.8, 4.6, 3.2], [12.8, 6.0, 3.2], [12.8, 4.6, 3.2], [16.0, 4.6, 3.2], [16.0, 6.0, 3.2]]],
  ['round the back yard and out the side gate', [[19.0, 12.0, 1.5], [6.0, 18.0, 1.5], [-3.0, 10.0, 1.2], [-3.0, 3.0, 0.9]]],
  ['along the front walk, past the stoop and the drive', [[-3.0, -9.65, 1.0], [24.0, -9.65, 1.0]]],
  ['along the front of the house over the beds', [[-1.5, -3.0, 1.3], [12.5, -3.0, 1.3]]],
  /* Under Heads' car on the drive, across between its axles from the gap
   * by the sedan, and along it from the street between its wheels, over
   * the 90% patch: level, the hull 0.06 m up, so the ball has its whole
   * radius of air under the car's floor (carOpenLayout in
   * src/props/street.js). */
  ['under Heads\' car, across from the gap by the sedan', [[16.0, -3.15, 0.06], [18.9, -3.15, 0.06]]],
  ['under Heads\' car, along it from the street', [[17.4, -6.0, 0.06], [17.4, -0.6, 0.06]]],
  ['down Street A through the intersection', [[40.0, -14.5, 1.5], [-38.0, -14.5, 1.5]]],
  ['up the cross street', [[-15.0, -40.0, 1.5], [-15.0, 30.0, 1.5]]],
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

/*
 * The stop sign's plate is solid (stopSignSolid in heads.js, the owner's
 * ask of 2026-10-25, "so I can wall tap it"): lines along Street A at the
 * plate's height, off its post, meet the plate from either side across
 * its face, and lines past its four 45 degree corners and over its top
 * do not, so it is an octagon and not a square. Plan offsets from the
 * plate's middle, real metres, swept with the craft's own radius.
 */
const STOP = { px: -4.065, py: -11.05, h: 2.25 };
const STOP_IN = [[0.2, 0], [-0.2, 0], [0, 0.3], [0, -0.3], [0.2, 0.2], [-0.2, -0.2], [0.33, 0], [0, 0.33]];
const STOP_OUT = [[0.36, 0.36], [-0.36, 0.36], [0.36, -0.36], [-0.36, -0.36], [0, 0.46]];
function stopSignBlock(near) {
  const meets = (dy, dh, from) => {
    for (let k = 0; k <= 100; k += 1) {
      const p = worldAt(STOP.px + from * (1 - k / 50), STOP.py + dy, STOP.h + dh);
      const hit = near(p).find((x) => x.name === 'stop sign' && hitAt([x], p, CRAFT_WORLD_R));
      if (hit) {
        return r3(STOP.px + from * (1 - k / 50));
      }
    }
    return null;
  };
  const inside = STOP_IN.flatMap(([dy, dh]) => [1, -1].map((from) => ({ dy, dh, from, x: meets(dy, dh, from) })));
  const missed = inside.filter((t) => t.x === null);
  check('the stop sign\'s plate is solid across its face, from the street and from behind', missed.length === 0,
    missed.length ? `through at ${missed.map((t) => `(${t.dy}, ${t.dh}) from the ${t.from > 0 ? 'east' : 'west'}`).join(', ')}`
      : `${inside.length} lines meet it, the first at plan x ${inside[0].x}`);
  const through = STOP_OUT.filter(([dy, dh]) => meets(dy, dh, 1) !== null);
  check('and the air past its corners is open', through.length === 0,
    through.length ? `meets it at ${through.map((t) => `(${t})`).join(', ')}` : `${STOP_OUT.length} lines clear`);
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
  const at = (p) => `plan ${JSON.stringify([r3((p[0] - FRAME.OX) / S), r3((FRAME.OZ - p[2]) / S), r3(p[1] / S)])}`;
  check(`no slot between ${r3(2 * CRAFT_WORLD_R)} and ${GAP_MIN} m between two of the house's boxes`, bad.length === 0,
    bad.length ? bad.slice(0, 8).map((f) => `${f.a} and ${f.b}, ${r3(f.w)} m ${f.axis}, ${at(f.mid)}`).join('; ') : `${own.filter((s) => s.box).length} boxes`);
  ALLOWED.forEach(([why], i) => console.log(`        allowed ${allowed[i]}: ${why}`));
}

/* ------------------------------------------------------------------ */
/* 6. The roofs                                                        */
/* ------------------------------------------------------------------ */

/* The roofs' top surfaces, real metres, restated from heads.js rather than
 * imported: 5 in 12 from a wall top 0.15 over the eave's underside, a
 * 0.35 overhang. The wing's span is 0 to 8.5, the two storey part's -0.25
 * to 8.5. */
const PITCH = 5 / 12;
const wingTop = (px, py) => 3.35 + PITCH * Math.min(py + 0.35, 8.85 - py);
const upTop = (px, py) => 4.75 + PITCH * Math.min(py + 0.6, 8.85 - py);

/* Under each gable's rake overhang, a point this far under the slab's
 * underside, real metres, is air. */
const UNDER = 0.12;
const RAKES = [
  ['the wing\'s west gable', (t) => [-0.18, 0.5 + 7.5 * t], wingTop],
  ['the two storey part\'s west gable, over the wing', (t) => [8.33, 0.2 + 8.0 * t], upTop],
  ['the two storey part\'s east gable', (t) => [18.18, 0.0 + 8.3 * t], upTop],
];

function roofsBlock(placed, near) {
  console.log('\n6. roofs');
  const spans = [
    ['the wing\'s roof', 0.2, 8.3, -0.3, 8.8, wingTop],
    ['the two storey part\'s roof', 8.7, 17.8, -0.55, 8.8, upTop],
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
/* 8. The logos                                                        */
/* ------------------------------------------------------------------ */

/* A WebP's size off its header: the extended, lossless or lossy form. */
function webpSize(b) {
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8X') {
    return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  }
  if (kind === 'VP8L') {
    const v = b.readUInt32LE(21);
    return [1 + (v & 0x3fff), 1 + ((v >>> 14) & 0x3fff)];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

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

/* Every cell a decal spot names, landed or not. */
const DECAL_CELLS = (lg) => lg.DECAL_SPOTS.map((d) => d.cell);

async function logosBlock(L, placed) {
  console.log('\n8. logos');
  const lg = await import('../src/maps/heads/logos.js');
  const boxes = lg.drawnBoxes(L.parts);
  /* The two sheets the crops are shares of. */
  const sizes = await Promise.all([1, 2].map(async (k) => webpSize(await readFile(join(root, `assets/stickers/infinityloops/sheet-${k}.webp`)))));
  check('the sheets are the size the crops are shares of', sizes.every((z, k) => z[0] === lg.SHEET_PX[k][0] && z[1] === lg.SHEET_PX[k][1]),
    sizes.map((z) => z.join('x')).join(', '));
  /* The atlas: every cell inside it and none over another. */
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
  check(`the sticker wall carries the 90%ers' ${lg.WALL_STICKERS.length} stickers`, lg.WALL_STICKERS.length >= 90);
  /* The signs: every roster brand once, each on a face all over. */
  const slugs = lg.BRANDS.map((p) => p.slug);
  const hung = lg.SIGN_SPOTS.map((s) => s.slug);
  const counts = slugs.map((sl) => hung.filter((h) => h === sl).length);
  check(`every one of the roster's ${slugs.length} brands is hung once`, counts.every((c) => c === 1) && hung.length === slugs.length,
    slugs.filter((sl, i) => counts[i] !== 1).join(', '));
  const { signAspect } = await import('../src/art/partnermark.js');
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
  /* The decals and the patches: each lands, flat on what it is on with
   * nothing through it, and a ground one over something within five
   * centimetres. */
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
  /* Each brand once, its sign, and painted nowhere else (the owner,
   * 2026-10-23, "only once"; until then this asked for three more). */
  const brandsPainted = slugs.filter((sl) => DECAL_CELLS(lg).includes(sl));
  check('no brand is painted again: each is on the map once, as its sign', !brandsPainted.length, brandsPainted.join(', '));
  check(`the signs are drawn ${lg.SIGN_SCALE} of the width they were hung at`, signs.every((s, i) => !s || Math.abs(s.w - S * lg.SIGN_SCALE * lg.SIGN_SPOTS[i].w) < 1e-9),
    lg.SIGN_SPOTS.map((sp) => `${sp.slug} ${r3(lg.SIGN_SCALE * sp.w)} m`).join(', '));
  const il = decals.filter((d) => d && (d.cell === 'il' || d.cell === 'ilOutline')).length;
  check(`the Infinity Loops logo is painted ${il} times`, il >= 6);
  const patches = lg.placePatches(L.parts);
  const badPatch = [];
  patches.forEach((s, i) => {
    if (!s) {
      badPatch.push(`${lg.PATCH_SPOTS[i].id} lands nowhere`);
      return;
    }
    const miss = unbacked(boxes, s, 0.02);
    if (miss) {
      badPatch.push(`${s.id} on ${s.hit} ${r3(miss)} m`);
    }
  });
  check(`the ${patches.length} patches to find each sit flat on what they are on`, patches.length >= 10 && !badPatch.length, badPatch.join('; '));
  const ids = new Set(patches.filter(Boolean).map((s) => s.id));
  check('each patch has its own id', ids.size === patches.length);
  underCarBlock(patches.find((s) => s && s.id === 'under-car'), placed);
}

/*
 * The patch hidden under Heads' car: found by the game's own test
 * (seesMark in src/game/egg.js) flying in under the car from the gap by
 * the sedan, the hull half way up the air under the floor and the camera
 * a little down, and found from nowhere a pilot stands at round the car,
 * half a metre to a metre and a half up, looking straight at it. That
 * second half is what makes it hidden.
 */
function underCarBlock(patch, placed) {
  if (!patch) {
    check('the patch under the car lands', false, 'no under-car patch');
    return;
  }
  const colliders = new Colliders();
  addSolids(colliders, placed.solids);
  colliders.build();
  const eye = (px, py, h) => {
    const [x, y, z] = worldAt(px, py, h);
    return { x, y, z };
  };
  /* East and 10 degrees down. */
  const across = { x: 0.984807753012208, y: -0.17364817766693033, z: 0 };
  let found = null;
  for (let px = 15.9; px <= 18.0 && !found; px += 0.05) {
    if (seesMark(eye(px, -3.15, 0.12), across, patch, colliders)) {
      found = px;
    }
  }
  check('the patch under the car is found flying in under it from the gap by the sedan', found !== null,
    found !== null ? `at plan x ${r3(found)}, 0.12 m up` : 'never');
  let seen = 0;
  let tried = 0;
  for (let px = 13.0; px <= 21.0; px += 0.25) {
    for (let py = -9.0; py <= 1.0; py += 0.25) {
      for (const h of [0.5, 1.0, 1.5]) {
        const e = eye(px, py, h);
        const dx = patch.p[0] - e.x;
        const dy = patch.p[1] - e.y;
        const dz = patch.p[2] - e.z;
        const l = Math.hypot(dx, dy, dz);
        tried += 1;
        if (seesMark(e, { x: dx / l, y: dy / l, z: dz / l }, patch, colliders)) {
          seen += 1;
        }
      }
    }
  }
  check('and from nowhere 0.5 to 1.5 m up round the car', seen === 0, `${seen} of ${tried} points`);
}

/* ------------------------------------------------------------------ */
/* 7. The module                                                       */
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
  /* In the basement, the plant's ground under the lawn's. */
  const [bx, by, bz] = worldAt(12.4, 3.0, FL);
  const down = { x: bx, y: by, z: bz, yaw: 0 };
  const c = await hoverFlight(wasm, config, colliders, placed, 3000, lift, down);
  const d = await hoverFlight(wasm, config, colliders, placed, 3000, lift, down);
  check('two lift offs in the basement agree to the bit', c.hash === d.hash, c.hash.slice(0, 16));
  check('lifting off the basement floor and holding a metre and a half touches nothing', c.touched === 0 && c.top > 1.2,
    `${c.touched} steps in contact, up to ${r3(c.top)} m`);
}


/* ------------------------------------------------------------------ */
/* 9. Heads                                                            */
/* ------------------------------------------------------------------ */

/* The sweep's ball, real metres: a person's half width. His heights are
 * knee, hip, chest and head, and the shelf across the ceiling is why he
 * stays south of it. */
const MAN_R = 0.22;
const MAN_HEIGHTS = [0.3, 0.8, 1.3, 1.75];
const MAN_STEP_MS = 20;
const MAN_SPEED_MAX = 1.3;
const MAN_TURN_MAX = 6.3;
const MAN_SOLE_LO = -0.02;
const MAN_SOLE_HI = 0.03;

function manBlock(placed, near) {
  console.log('\n9. heads');
  const pose = headsPose();
  const M = new Float64Array(13 * 12);
  const soleOf = (b) => M[b * 12 + 10] - M[b * 12 + 4] * MAN_SOLE;
  let bad = 0;
  let fast = 0;
  let turn = 0;
  let soleLo = Infinity;
  let soleHi = -Infinity;
  let prev = null;
  for (let T = 0; T <= HEADS_PERIOD_MS; T += MAN_STEP_MS) {
    headsAt(T, null, 0, false, pose);
    headsBones(pose, M);
    if (![pose.x, pose.y, pose.yaw, pose.pelvisH, ...pose.J, ...M].every(Number.isFinite)) {
      bad += 1;
      continue;
    }
    if (prev) {
      fast = Math.max(fast, Math.hypot(pose.x - prev[0], pose.y - prev[1]) / (MAN_STEP_MS / 1000));
      let d = Math.abs(pose.yaw - prev[2]) % (2 * Math.PI);
      d = Math.min(d, 2 * Math.PI - d);
      turn = Math.max(turn, d / (MAN_STEP_MS / 1000));
    }
    prev = [pose.x, pose.y, pose.yaw];
    const lo = Math.min(soleOf(MAN_BONE.footL), soleOf(MAN_BONE.footR)) - pose.floor;
    soleLo = Math.min(soleLo, lo);
    soleHi = Math.max(soleHi, lo);
  }
  const samples = Math.floor(HEADS_PERIOD_MS / MAN_STEP_MS) + 1;
  check(`every number of every pose is finite, ${samples} poses over ${r3(HEADS_PERIOD_MS / 60000)} minutes`, bad === 0, `${bad} not`);
  check(`no step faster than ${MAN_SPEED_MAX} m/s`, fast <= MAN_SPEED_MAX, `${r3(fast)} m/s at most`);
  check(`no turn faster than ${MAN_TURN_MAX} rad/s`, turn <= MAN_TURN_MAX, `${r3(turn)} rad/s at most`);
  check(`his lowest sole is within ${MAN_SOLE_LO} and ${MAN_SOLE_HI} m of the floor in every pose`,
    soleLo >= MAN_SOLE_LO && soleHi <= MAN_SOLE_HI, `${r3(soleLo)} to ${r3(soleHi)} m`);

  /* Every stop and every walk between two, swept at his four heights. */
  const spots = [];
  for (const ph of HEADS_PHASES) {
    if (ph.kind === 'walk') {
      spots.push([ph.from, ph.to]);
    }
  }
  const seen = new Set();
  let hit = null;
  let at = null;
  for (const [a, b] of spots) {
    const key = `${a}>${b}`;
    if (seen.has(key) || hit) {
      continue;
    }
    seen.add(key);
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05));
    for (let k = 0; k <= n && !hit; k += 1) {
      const px = a[0] + ((b[0] - a[0]) * k) / n;
      const py = a[1] + ((b[1] - a[1]) * k) / n;
      for (const h of MAN_HEIGHTS) {
        const p = worldAt(px, py, FG + h);
        const s = hitAt(near(p), p, S * MAN_R);
        if (s) {
          hit = s;
          at = [r3(px), r3(py), r3(h)];
          break;
        }
      }
    }
  }
  check(`his ${seen.size} walks keep a person's width clear of every solid`, !hit,
    hit ? `${hit.name || hit.kind} at plan ${JSON.stringify(at)}` : `${STOPS.length} stops`);
  for (const stop of STOPS) {
    const hits = [];
    for (const h of MAN_HEIGHTS) {
      const p = worldAt(stop.at[0], stop.at[1], FG + h);
      const s = hitAt(near(p), p, S * MAN_R);
      if (s) {
        hits.push(s.name || s.kind);
      }
    }
    check(`his ${stop.id} stop has room to stand`, !hits.length, hits.join(', ') || `${stop.at}`);
  }
  check('he has lines to shout, none empty', HEADS_LINES.length > 0 && HEADS_LINES.every((l) => l.text.length > 0), `${HEADS_LINES.length}`);
}

async function main() {
  console.log('heads-check: Heads\' house, src/maps/heads/');
  const L = layoutBlock();
  const { placed, near, own } = await placedBlock(L);
  linesBlock(near);
  stopSignBlock(near);
  gapsBlock(placed, near);
  slotsBlock(own);
  roofsBlock(placed, near);
  await logosBlock(L, placed);
  await moduleBlock(placed);
  manBlock(placed, near);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
