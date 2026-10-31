/*
 * alps-check.js: Raicho Ridge (src/maps/alps/), proved buildable and
 * flyable in plain Node, the way scripts/sunny-check.js proves Sunnyfield.
 *
 *   1. ground     the lattice the same to the bit on two builds, floorAt
 *                 equal to the lattice at its points and between them on
 *                 the cut the mesh draws, every pad level, the map as big
 *                 and as tall as its brief, and none of the ground's or
 *                 the solids' files calling a Math function the engines
 *                 are free to round differently
 *   2. layout     every part finite, every colour one of the family
 *                 (src/props/alpine.js), and two builds the same to the bit
 *   3. placed     the document normalizes with no repairs, the start is
 *                 seated on the helipad and a ball a metre across over it
 *                 is clear, and the shapes are under the module's limits
 *   4. lines      lines a pilot flies, swept with a ball twice the craft's
 *                 radius: down the ropeway beside its towers, through each
 *                 station, door to door through the hut, through the snow
 *                 shed on the road, through the spillway
 *   5. gaps       every named gap's window clear of every solid by the
 *                 craft's radius, and wider and taller than the gap rule,
 *                 but for the hut's door and window, which are the brief's
 *                 sizes on purpose
 *
 * Usage: node scripts/alps-check.js
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
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  heights, floorAt, gridDigest, padLevel, PADS, HALF, CELL, N, LAKE,
} from '../src/maps/alps/terrain.js';
import { layout, HELI, HUT, ROPE, SHED } from '../src/maps/alps/places.js';
import { plant } from '../src/maps/alps/nature.js';
import { alpsDocument } from '../src/maps/alps/yard.js';
import { MATERIALS } from '../src/props/alpine.js';
import { GAP_MIN } from '../src/props/parts.js';
import { placeSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument, indexTops, topUnder } from '../src/maps/built/place.js';
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
/* Geometry, as sunny-check.js has it                                  */
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
    for (let i = Math.floor((p[0] - 3) / cell); i <= Math.floor((p[0] + 3) / cell); i += 1) {
      for (let k = Math.floor((p[2] - 3) / cell); k <= Math.floor((p[2] + 3) / cell); k += 1) {
        for (const s of map.get(key(i, k)) ?? []) {
          out.add(s);
        }
      }
    }
    return [...out];
  };
}

/* ------------------------------------------------------------------ */
/* 1. The ground                                                       */
/* ------------------------------------------------------------------ */

async function groundBlock() {
  console.log('\n1. ground');
  const t0 = performance.now();
  const g = heights();
  const ms = performance.now() - t0;
  const a = gridDigest();
  check('the lattice is the same to the bit on two reads', a === gridDigest(), a);
  const NV = N + 1;
  let worst = 0;
  for (let j = 0; j < NV; j += 7) {
    for (let i = 0; i < NV; i += 5) {
      worst = Math.max(worst, Math.abs(floorAt(-HALF + i * CELL, -HALF + j * CELL) - g[j * NV + i]));
    }
  }
  /* To a micrometre: floorAt interpolates, and a corner comes back with
   * the rounding of the weights that pick it. */
  check('floorAt is the lattice at its points', worst < 1e-6, `worst ${worst}`);
  /* Between the points, the cut the mesh draws: (00, 11, 10) and
   * (00, 01, 11). The middle of each triangle is the mean of its corners. */
  let off = 0;
  for (let j = 3; j < N; j += 11) {
    for (let i = 5; i < N; i += 13) {
      const h = (u, v) => g[(j + v) * NV + i + u];
      const x = -HALF + i * CELL;
      const z = -HALF + j * CELL;
      const lower = (h(0, 0) + h(1, 1) + h(1, 0)) / 3;
      const upper = (h(0, 0) + h(0, 1) + h(1, 1)) / 3;
      off = Math.max(off, Math.abs(floorAt(x + (2 * CELL) / 3, z + CELL / 3) - lower), Math.abs(floorAt(x + CELL / 3, z + (2 * CELL) / 3) - upper));
    }
  }
  check('floorAt between the points is the triangle the mesh draws', off < 1e-9, `worst ${off}`);
  for (const [name, p] of Object.entries(PADS)) {
    let bad = 0;
    for (let x = p.x0; x <= p.x1; x += 2) {
      for (let z = p.z0; z <= p.z1; z += 2) {
        bad = Math.max(bad, Math.abs(floorAt(x, z) - padLevel(name)));
      }
    }
    check(`the ${name} pad is level`, bad < 1e-9, `${r3(padLevel(name))} m, worst ${bad}`);
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of g) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  check('the map is at least 1.5 km a side', 2 * HALF >= 1500, `${2 * HALF} m`);
  check('the relief is at least 300 m', hi - lo >= 300, `${r3(lo)} to ${r3(hi)} m`);
  let basin = Infinity;
  for (let x = 70; x < 530; x += 4) {
    for (let z = 70; z < 510; z += 4) {
      basin = Math.min(basin, floorAt(x, z));
    }
  }
  check('the lake\'s bed is held at the water\'s level', basin === LAKE, `${r3(basin)} m, the lake ${LAKE} m`);
  check('the lattice builds in under 400 ms', ms < 400, `${Math.round(ms)} ms`);
  /* Determinism: the ground and everything solid on it. The paint in
   * places.js may use Math for a drawn curve; its solids may not, and the
   * ground may not at all. */
  const src = await readFile(join(root, 'src/maps/alps/terrain.js'), 'utf8');
  const nat = await readFile(join(root, 'src/maps/alps/nature.js'), 'utf8');
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const bad = [...code(src).matchAll(/Math\.(sin|cos|tan|pow|exp|log|atan2?|asin|acos)\b/g), ...code(nat).matchAll(/Math\.(sin|cos|tan|pow|exp|log|atan2?|asin|acos)\b/g)];
  check('terrain.js and nature.js call no engine rounded Math function', bad.length === 0, bad.map((m) => m[0]).join(', ') || 'none');
}

/* ------------------------------------------------------------------ */
/* 2. The layout                                                       */
/* ------------------------------------------------------------------ */

function build() {
  const L = layout();
  const counts = plant(L.plan);
  return { L, counts };
}

function hashOf(parts) {
  const h = createHash('sha256');
  const buf = new Float64Array(1);
  for (const p of parts) {
    h.update(`${p.t}|${p.m}|${p.solid}|${p.draw}|${p.kind}`);
    for (const v of p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]) {
      buf[0] = v;
      h.update(Buffer.from(buf.buffer));
    }
  }
  return h.digest('hex');
}

function layoutBlock() {
  console.log('\n2. layout');
  const t0 = performance.now();
  const { L, counts } = build();
  const ms = performance.now() - t0;
  const parts = L.plan.parts;
  const nums = (p) => (p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]);
  const bad = parts.filter((p) => nums(p).some((v) => !Number.isFinite(v)));
  check('every part is finite', bad.length === 0, `${parts.length} parts, ${bad.length} with a non-finite number`);
  const foreign = [...new Set(parts.map((p) => p.m))].filter((m) => !MATERIALS[m]);
  check('every part\'s colour is one of src/props/alpine.js', foreign.length === 0, foreign.join(', ') || 'all');
  const a = hashOf(parts);
  check('two builds are the same to the bit', a === hashOf(build().L.plan.parts), a.slice(0, 16));
  check('the layout builds in under 600 ms', ms < 600, `${Math.round(ms)} ms`);
  console.log(`        ${parts.filter((p) => p.solid !== false).length} solids, ${L.plan.paint.length} paint, ${counts.trees} trees, ${counts.mats} dwarf pine, ${counts.rocks} boulders`);
  return L;
}

/* ------------------------------------------------------------------ */
/* 3. Placed as the built map places it                                */
/* ------------------------------------------------------------------ */

async function worldLimits() {
  const src = await readFile(join(root, 'src/native/world.c'), 'utf8');
  const m = src.match(/#define WORLD_MAX_SHAPES \(?([0-9.]+)(?: << ([0-9]+))?/);
  if (!m) {
    throw new Error('src/native/world.c has no WORLD_MAX_SHAPES');
  }
  return m[2] ? Number(m[1]) * 2 ** Number(m[2]) : Number(m[1]);
}

async function placedBlock(L) {
  console.log('\n3. placed');
  const { doc, repairs } = normalize(alpsDocument(L.heliTop, L.plan.gaps));
  check('the document normalizes with no repairs', repairs.length === 0, repairs.join(' | ') || `${doc.elements.length} elements`);
  const { placed } = seatDocument(doc);
  /* addExtra in src/maps/built/index.js, restated. */
  placeSolids(L.plan.parts, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
  placed.tops = indexTops(placed.solids);
  const sp = placed.spawn;
  sp.y = topUnder(placed.tops, sp.x, sp.z, L.heliTop);
  check('the start is the pads', sp.from === 'pads', sp.from);
  check('the start is on the helipad', Math.abs(sp.x - HELI.x) <= HELI.half && Math.abs(sp.z - HELI.z) <= HELI.half, `${r3(sp.x)}, ${r3(sp.z)}`);
  check('the start is seated on the helipad\'s top', Math.abs(sp.y - L.heliTop) < 0.05, `${r3(sp.y)} m, the pad ${r3(L.heliTop)} m`);
  check('nothing inflated', (placed.stats.inflated || 0) === 0, `${placed.stats.inflated || 0}`);
  const near = gridOf(placed.solids);
  const over = [sp.x, sp.y + 0.6, sp.z];
  const hit = hitAt(near(over), over, 0.5);
  check('a ball a metre across over the start is clear', !hit, hit ? hit.name : 'clear');
  /* The first line: south off the pad and over the edge, 3 m up. */
  let first = null;
  for (let d = 0; d <= 60 && !first; d += 0.1) {
    const p = [sp.x, Math.max(sp.y, floorAt(sp.x, sp.z + d)) + 3, sp.z + d];
    first = hitAt(near(p), p, BALL);
  }
  check('the first line, south off the pad and over the edge, is clear', !first, first ? first.name || first.kind : '60 m clear');
  const lim = await worldLimits();
  check(`the map's ${placed.solids.length} shapes are under world.c's WORLD_MAX_SHAPES`, placed.solids.length < lim, `${lim}`);
  return { placed, near };
}

/* ------------------------------------------------------------------ */
/* 4. Lines                                                            */
/* ------------------------------------------------------------------ */

/* A line in the world: points [x, y, z], or [x, null, z, over] for a point
 * `over` metres above the ground. */
function sweep(near, pts) {
  const step = 0.05;
  const lift = (q) => (q[1] === null ? [q[0], floorAt(q[0], q[2]) + q[3], q[2]] : q);
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], (b[1] ?? 0) - (a[1] ?? 0), b[2] - a[2]) / step));
    for (let k = 0; k <= n; k += 1) {
      const t = k / n;
      const q = a[1] === null
        ? [a[0] + (b[0] - a[0]) * t, null, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]
        : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const p = lift(q);
      const hit = hitAt(near(p), p, BALL);
      if (hit) {
        return { hit, at: p.map(r3) };
      }
    }
  }
  return null;
}

function linesBlock(L, placed, near) {
  console.log(`\n4. lines, swept with a ball of ${r3(BALL)} m`);
  const g = (name) => placed.zones.find((z) => z.name === name);
  const hut = g('HUT DOOR');
  const shed = g('SNOW SHED');
  const spill = g('SPILLWAY');
  const xBeside = ROPE.down + 6;
  const LINES = [
    ['down the ropeway beside its towers, 6 m over the ground', [[xBeside, null, ROPE.zTop + 20, 6], [xBeside, null, ROPE.zBot - 20, 6]]],
    ['through the top station\'s bay, along the rope', [[-160.6, g('TOP STATION').y + 1.5, -290], [-160.6, g('TOP STATION').y + 1.5, -238]]],
    ['through the valley station\'s bay, along the rope', [[-160.6, g('VALLEY STATION').y + 1.5, 150], [-160.6, g('VALLEY STATION').y + 1.5, 202]]],
    ['door to door through the hut', [[HUT.x0 - 3, hut.y + 0.7, hut.z], [HUT.x1 + 3, hut.y + 0.7, hut.z]]],
    ['through the snow shed on the road, end to end', [[SHED.x0 - 6, shed.y + 1.5, shed.z], [SHED.x1 + 6, shed.y + 1.5, shed.z]]],
    ['through the spillway, lake to river', [[spill.x - 6, spill.y + 0.8, spill.z], [spill.x + 12, spill.y + 0.8, spill.z]]],
  ];
  for (const [name, pts] of LINES) {
    const r = sweep(near, pts);
    check(name, !r, r ? `${r.hit.name || r.hit.kind} at ${JSON.stringify(r.at)}` : 'clear');
  }
}

/* ------------------------------------------------------------------ */
/* 5. The named gaps                                                   */
/* ------------------------------------------------------------------ */

/* The brief's own sizes, narrower than the gap rule on purpose: a real hut
 * door, 0.9 by 1.9 m, and a real window, 1.2 m, the threading lines the
 * house maps' doors are. */
const BRIEF_SIZED = new Map([['HUT DOOR', { w: 0.9, h: 1.9, sill: 0.1 }], ['HUT WINDOW', { w: 1.2, h: 1.2, sill: 0.1 }]]);

function gapsBlock(L, placed, near) {
  console.log('\n5. gaps');
  check('every named gap is in the document', placed.zones.length === L.plan.gaps.length, `${placed.zones.length} of ${L.plan.gaps.length}`);
  for (const z of placed.zones) {
    const sc = sincos(z.yaw, { s: 0, c: 0 });
    const across = [-sc.s, 0, -sc.c];
    /* A brief sized gap is tested over its opening less the craft's radius
     * all round: its rectangle reaches into the jambs (places.js). */
    const o = BRIEF_SIZED.get(z.name);
    const R = CRAFT_WORLD_R + 0.01;
    const W = o ? o.w - 2 * R : z.w;
    const v0 = o ? R - o.sill : 0;
    const H = o ? o.h - 2 * R : z.h;
    let hit = null;
    for (let i = 0; i <= 8 && !hit; i += 1) {
      for (let j = 0; j <= 8 && !hit; j += 1) {
        const u = (i / 8 - 0.5) * W;
        const v = v0 + (j / 8) * H;
        const p = [z.x + across[0] * u, z.y + v, z.z + across[2] * u];
        hit = hitAt(near(p), p, CRAFT_WORLD_R);
      }
    }
    check(`${z.name} is clear by the craft's radius`, !hit, hit ? hit.name || hit.kind : `${r3(W)} by ${r3(H)} m`);
    if (o) {
      check(`${z.name} is the brief's size and wider than the craft`, W > 0 && H > 0 && z.w <= o.w + 0.1 + 1e-9, `a ${o.w} by ${o.h} m opening, its rectangle ${r3(z.w)} by ${r3(z.h)} m`);
    } else {
      check(`${z.name} is wider and taller than the gap rule`, z.w >= GAP_MIN && z.h >= GAP_MIN, `${r3(z.w)} by ${r3(z.h)} m, the rule ${GAP_MIN}`);
    }
  }
}

async function main() {
  console.log('Raicho Ridge');
  await groundBlock();
  const L = layoutBlock();
  const { placed, near } = await placedBlock(L);
  linesBlock(L, placed, near);
  gapsBlock(L, placed, near);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
