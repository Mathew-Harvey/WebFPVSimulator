/*
 * warehouse-check.js: Thomas More's warehouse (src/maps/warehouse/), proved
 * buildable, flyable and cheap in plain Node, the way scripts/house-check.js
 * proves Nick Burns' house. In these blocks:
 *
 *   1. layout   every part finite, every colour one the kit knows, at most
 *               the warehouse's colour budget (each is a draw call), no two
 *               colours drawn in one plane, two builds the same to the bit
 *   2. placed   the document normalizes with no repairs, the hall goes in as
 *               the built map puts it in, the start is seated on the slab
 *               with a ball clear over it, and the shape and candidate
 *               counts are under the physics module's caps
 *   3. lines    the lines a pilot flies, swept with a ball twice the craft's
 *               radius: the doors, the aisle, the trailer, the racking
 *   4. gaps     every named gap's window clear by the craft's radius
 *   5. slots    the gap rule (GAP_MIN in src/props/parts.js) inside the hall
 *   6. module   with a build of dist/sim.wasm, the craft lifted off the
 *               start and held at a metre and a half for three seconds in the
 *               real module, touching nothing, twice to the bit
 *
 * Usage: node scripts/warehouse-check.js
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
import { warehouseLayout, S, FLOOR0, worldAt, FRAME } from '../src/maps/warehouse/warehouse.js';
import { warehouseDocument } from '../src/maps/warehouse/yard.js';
import { MATERIALS as HOME_MATERIALS } from '../src/props/homes.js';
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

/* The warehouse's own draw calls: one a colour in its chunk (the kit bakes a
 * batch per material per chunk), and src/props/homes.js holds the warehouse to
 * this many. */
const HOUSE_COLOURS_MAX = 18;
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
  return h.digest('hex');
}

function layoutBlock() {
  console.log('\n1. layout');
  const L = warehouseLayout();
  const bad = L.parts.filter((p) => (p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]).some((v) => !Number.isFinite(v)));
  const badPrisms = L.prisms.filter((q) => [...q.profile.flat(), q.e0, q.e1].some((v) => !Number.isFinite(v)));
  check('every part and prism is finite', bad.length === 0 && badPrisms.length === 0,
    `${L.parts.length} parts, ${L.prisms.length} prisms, ${bad.length + badPrisms.length} with a non-finite number`);
  const own = L.parts.filter((p) => p.draw).map((p) => p.m);
  const colours = new Set([...own, ...L.prisms.map((q) => q.m), ...L.discs.map((d) => d.m), ...L.cones.map((c) => c.m)]);
  const unknown = [...colours].filter((m) => !HOME_MATERIALS[m]);
  check('every colour the warehouse draws is one of src/props/homes.js', unknown.length === 0, unknown.join(', ') || `${colours.size} colours`);
  check(`the warehouse draws at most ${HOUSE_COLOURS_MAX} colours, so its chunk is at most that many draw calls`,
    colours.size <= HOUSE_COLOURS_MAX, `${colours.size}`);
  /* The table is shared with the houses: their colours are checked as drawn by their own scripts. */
  const unused = Object.keys(HOME_MATERIALS).filter((m) => m.startsWith('wh') && !colours.has(m));
  check('every colour of the warehouse\'s in src/props/homes.js is drawn', unused.length === 0, unused.join(', ') || 'all drawn');
  const a = hashOf(L);
  const b = hashOf(warehouseLayout());
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
  const { doc, repairs } = normalize(warehouseDocument());
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
  check('the start is seated on the slab', Math.abs(sp.y - S * FLOOR0) < 1e-6, `${r3(sp.y)} m, the floor is ${r3(S * FLOOR0)}`);
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
const LINES = [
  ['in the glass door and across the office to its north door', [[5.3, -3.0, 1.6], [5.3, 6.0, 1.6], [8.2, 8.0, 1.6], [8.2, 12.0, 1.6]]],
  ['in the drive in door and up the front of the hall', [[22.0, -3.0, 1.8], [22.0, 12.0, 1.8]]],
  ['from the front into the crate aisle and up it to the dock', [[14.4, 4.5, 1.8], [14.4, 40.0, 1.8], [14.4, 52.0, 1.8]]],
  ['up the aisle low, under the cart', [[13.9, 20.0, 0.5], [13.9, 30.0, 0.5]]],
  ['through the black wall\'s door from the carpet racks to the aisle', [[9.0, 23.2, 1.6], [15.0, 23.2, 1.6]]],
  ['out of dock one', [[9.6, 50.0, 1.8], [9.6, 64.0, 1.8]]],
  ['through the trailer and back', [[15.6, 52.0, 2.4], [15.6, 66.0, 2.4], [15.6, 54.0, 2.4]]],
  ['over the crates, under the lights', [[19.0, 14.0, 5.0], [19.0, 44.0, 5.0]]],
  ['down the red corridor', [[2.0, 11.0, 1.4], [2.0, 43.0, 1.4]]],
  ['out of the corridor into the carpet racks', [[2.0, 23.2, 1.5], [8.0, 23.2, 1.5]]],
  ['out the corridor\'s last door into the dock end', [[1.7, 40.0, 1.5], [1.7, 48.0, 1.5]]],
  ['between the plywood stacks', [[30.0, 26.8, 1.6], [38.0, 26.8, 1.6]]],
  ['across the woodshop between the benches and the saws', [[24.0, 26.0, 2.0], [34.0, 26.0, 2.0]]],
  ['under a bench', [[27.0, 14.0, 0.5], [27.0, 20.0, 0.5]]],
  ['down the racking aisle', [[23.0, 5.5, 1.8], [39.0, 5.5, 1.8]]],
  ['through a rack bay at the second shelf', [[28.0, 1.0, 2.4], [28.0, 12.0, 2.4]]],
  ['into the spray booth and to its hood', [[26.0, 49.4, 1.6], [34.0, 49.4, 1.6], [34.0, 53.0, 1.6]]],
  ['out of the booth by its south door', [[35.3, 48.0, 1.6], [35.3, 40.0, 1.6]]],
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
const ALLOWED = [
  ['under a bench or a trestle: the top over the slab with its legs round it, the space a whoop flies under a table',
    (a, b, axis) => axis === 'up' && (a === 'bench' || a === 'table' || a === 'desk' || a === 'sawhorse' || a === 'mitre saw' || a === 'cart')
      && b === 'slab'],
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
  check(`no slot between ${r3(2 * CRAFT_WORLD_R)} and ${GAP_MIN} m between two of the warehouse's boxes`, bad.length === 0,
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
  console.log('warehouse-check: Thomas More\'s warehouse, src/maps/warehouse/');
  const L = layoutBlock();
  const { placed, near, own } = await placedBlock(L);
  linesBlock(near);
  gapsBlock(placed, near);
  slotsBlock(own);
  await moduleBlock(placed);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
