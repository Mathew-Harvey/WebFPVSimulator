/*
 * hotaru-check.js: Hotaru Valley (src/maps/hotaru/), proved buildable and
 * flyable in plain Node, the way scripts/sunny-check.js proves Sunnyfield,
 * whose sweeps and gap rule these are.
 *
 *   1. layout     every part finite, every colour one of the valley's
 *                 family (src/props/hotaru.js) or a tree's (street.js's
 *                 cedar and grove tones), every one of the family drawn,
 *                 and two builds the same to the bit
 *   2. land       the floor the plant is given is the drawn land at every
 *                 grid corner, and the water's level wherever it is lower
 *   3. placed     the document normalizes with no repairs, the valley goes
 *                 in as the built map puts it in, the start is seated on
 *                 the road and a ball a metre across over it is clear, and
 *                 the shapes are under the module's limits
 *   4. lines      lines a pilot flies, swept with a ball twice the craft's
 *                 radius against every solid and over the land: the valley
 *                 road, the village street, the barn, the kura alley, the
 *                 loft, the flume, round the wheel, the castle's wall line,
 *                 its gate and the breach in its keep, the torii tunnel,
 *                 under the arch, the boat shed, under the pier, along the
 *                 squid boats, through the sea torii
 *   5. gaps       every named gap's window clear of every solid and of the
 *                 land by the craft's radius, and wider and taller than the
 *                 gap rule
 *   6. slots      the gap rule inside the valley's own boxes
 *
 * Usage: node scripts/hotaru-check.js
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

import { hotaruLayout, hotaruGaps, hotaruFloor, worldAt, SPAWN } from '../src/maps/hotaru/plan.js';
import { hotaruDocument } from '../src/maps/hotaru/yard.js';
import { heights, GX, GY, WATER, landAt } from '../src/maps/hotaru/land.js';
import { MATERIALS } from '../src/props/hotaru.js';
import { MATERIALS as STREET } from '../src/props/street.js';
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
  for (const q of L.T.prisms) {
    h.update(`${q.m}|${q.axis}`);
    for (const v of [...q.profile.flat(), q.e0, q.e1]) {
      num(v);
    }
  }
  return h.digest('hex');
}

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

/* ------------------------------------------------------------------ */
/* 1. The layout                                                       */
/* ------------------------------------------------------------------ */

/* The trees' tones are street.js's, the town's own cedars and groves. */
const TREE_TONES = ['stCedar0', 'stCedar1', 'stCedar2', 'stCedarWood', 'stGrove0', 'stGrove1', 'stGrove2'];

function layoutBlock() {
  console.log('\n1. layout');
  const L = hotaruLayout();
  const { parts, T } = L;
  const nums = (p) => (p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]);
  const bad = parts.filter((p) => nums(p).some((v) => !Number.isFinite(v)));
  const badDrawn = [
    ...T.prisms.map((q) => [...q.profile.flat(), q.e0, q.e1]),
    ...T.cyls.map((c) => [...c.a, ...c.b, c.r]),
    ...T.rods.map((r) => [...r.a, ...r.b, r.w, r.t]),
    ...T.slabs.map((s) => [...s.pts.flat(), s.h0, s.h1]),
    ...T.wires.map((w) => [...w.a, ...w.b, w.sag, w.r]),
    ...L.trees.map((t) => [t.px, t.py, t.h, t.k]),
  ].filter((v) => v.some((x) => !Number.isFinite(x)));
  check('every part and every drawn shape is finite', bad.length + badDrawn.length === 0,
    `${parts.length} parts, ${bad.length + badDrawn.length} with a non-finite number`);
  const lists = [parts.filter((p) => p.draw), T.cyls, T.prisms, T.discs, T.balls, T.cones, T.frusta, T.wires, T.rods, T.slabs];
  const colours = new Set(lists.flatMap((l) => l.map((x) => x.m)));
  const foreign = [...colours].filter((m) => !MATERIALS[m] && !(STREET[m] && TREE_TONES.includes(m)));
  check('every colour the valley draws is one of src/props/hotaru.js', foreign.length === 0, foreign.join(', ') || `${colours.size} colours`);
  /* The trees draw some of the family themselves (./trees.js). */
  const byTrees = ['hvBambooLeaf0', 'hvBambooLeaf1', 'hvBamboo', 'hvKakiLeaf', 'hvKaki', 'hvWood'];
  const unused = Object.keys(MATERIALS).filter((m) => !colours.has(m) && !byTrees.includes(m));
  check('every colour of the family is drawn', unused.length === 0, unused.join(', ') || 'all drawn');
  const a = hashOf(L);
  const b = hashOf(hotaruLayout());
  check('two builds are the same to the bit', a === b, a.slice(0, 16));
  console.log(`        ${parts.filter((p) => p.solid).length} solids, ${parts.filter((p) => p.draw).length} drawn parts, ${L.trees.length} trees, ${T.wires.length} wires`);
  return L;
}

/* ------------------------------------------------------------------ */
/* 2. The land                                                         */
/* ------------------------------------------------------------------ */

function landBlock() {
  console.log('\n2. land');
  const H = heights();
  const ny = GY.length;
  let worst = 0;
  for (let i = 0; i < GX.length; i += 1) {
    for (let j = 0; j < ny; j += 1) {
      const [x, , z] = worldAt(GX[i], GY[j], 0);
      const want = Math.max(H[i * ny + j], WATER);
      worst = Math.max(worst, Math.abs(hotaruFloor(x, z) - want));
    }
  }
  check('the floor is the drawn land, or the water over it, at every grid corner', worst < 1e-6, `${GX.length * ny} corners, worst ${worst}`);
  /* And between corners, on the split the mesh draws. */
  let mid = 0;
  for (let i = 0; i + 1 < GX.length; i += 7) {
    for (let j = 0; j + 1 < ny; j += 5) {
      const px = GX[i] + (GX[i + 1] - GX[i]) * 0.7;
      const py = GY[j] + (GY[j + 1] - GY[j]) * 0.2;
      const h00 = H[i * ny + j];
      const h10 = H[(i + 1) * ny + j];
      const h11 = H[(i + 1) * ny + j + 1];
      const want = h00 + 0.7 * (h10 - h00) + 0.2 * (h11 - h10);
      mid = Math.max(mid, Math.abs(landAt(px, py) - want));
    }
  }
  check('between corners the land is the triangle the mesh draws', mid < 1e-9, `worst ${mid}`);
}

/* ------------------------------------------------------------------ */
/* 3. Placed as the built map places it                                */
/* ------------------------------------------------------------------ */

async function placedBlock(L) {
  console.log('\n3. placed');
  const { doc, repairs } = normalize(hotaruDocument(L.info));
  check('the document normalizes with no repairs', repairs.length === 0, repairs.join(' | ') || `${doc.elements.length} elements`);
  const { placed } = seatDocument(doc);
  const first = placed.solids.length;
  placeSolids(L.parts, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
  const own = placed.solids.slice(first);
  placed.tops = indexTops(placed.solids);
  const sp = placed.spawn;
  sp.y = topUnder(placed.tops, sp.x, sp.z, sp.base);
  check('the start is the pads', sp.from === 'pads', sp.from);
  check('the start is seated on the road', Math.abs(sp.y - SPAWN.h) < 0.05, `${r3(sp.y)} m`);
  check('nothing inflated', (placed.stats.inflated || 0) === 0, `${placed.stats.inflated || 0}`);
  const near = gridOf(placed.solids);
  const over = [sp.x, sp.y + 0.6, sp.z];
  const hit = hitAt(near(over), over, 0.5);
  check('a ball a metre across over the start is clear', !hit, hit ? hit.name : 'clear');
  const lim = await worldLimits();
  check(`the map's ${placed.solids.length} shapes are under world.c's WORLD_MAX_SHAPES`, placed.solids.length < lim.shapes, `${lim.shapes}`);
  return { placed, near, own };
}

/* ------------------------------------------------------------------ */
/* 4. Lines                                                            */
/* ------------------------------------------------------------------ */

const through = (px, py, deg, h, reach = 4) => {
  const sc = sincos((deg * Math.PI) / 180, { s: 0, c: 0 });
  return [[px - reach * sc.c, py - reach * sc.s, h], [px + reach * sc.c, py + reach * sc.s, h]];
};

function linesOf(L, gaps) {
  const g = (name) => gaps.find((x) => x.name === name);
  const mid = (x) => (x.h0 + x.h1) / 2;
  const gate = g('CASTLE GATE');
  const breach = g('KEEP BREACH');
  const torii = L.info.village.torii;
  const t0 = torii[0];
  const t1 = torii[torii.length - 1];
  const mill = L.info.village.mill;
  const orbit = [];
  for (let k = -8; k <= 8; k += 1) {
    const sc = sincos((k * 10 * Math.PI) / 180, { s: 0, c: 0 });
    orbit.push([mill.hub[0] + 4.6 * sc.c, mill.hub[1] + 4.6 * sc.s, mill.hub[2]]);
  }
  return [
    ['up the valley road at three metres', [[232, 86, 3], [232, 194, 3]]],
    ['along the village street at four metres', [[224, 204, 4], [130, 204, 4]]],
    ['through the barn, door to door', [[g('BARN RUN').px, 144, 2.5], [g('BARN RUN').px, 178, 2.5]]],
    ['down the kura alley', [[g('KURA ALLEY').px, 180, 2.5], [g('KURA ALLEY').px, 197, 2.5]]],
    ['through the loft, gable to gable', [[g('THE LOFT').px, 209, mid(g('THE LOFT'))], [g('THE LOFT').px, 238, mid(g('THE LOFT'))]]],
    ['under the flume', through(g('UNDER THE FLUME').px, g('UNDER THE FLUME').py, 0, 2.2, 8)],
    ['round the water wheel', orbit],
    ['down the castle\'s east wall, low', [[141, 248, 3], [141, 262, 3], [141, 278, 6.5], [141, 296, 6.5]]],
    ['up the castle steps and through the gate', [[gate.px, 238, 12], [gate.px, gate.py - 1, gate.h0 + 1.6], [gate.px, gate.py + 8, gate.h0 + 1.6]]],
    ['through the breach in the keep', [[breach.px + 6, breach.py, breach.h0 + 2.5], [breach.px - 22, breach.py, breach.h0 + 2.5]]],
    ['up the torii tunnel', [[t0.px - 1, 245.5, t0.h0 + 1.3], [t1.px + 0.5, 245.5, t1.h0 + 1.3]]],
    ['under the arch bridge, down the river', [[273, 106, 0.5], [268, 118, 0.5], [262, 128, 0.5]]],
    ['through the boat shed, sea to road', [[g('BOAT SHED').px, 42, 1.9], [g('BOAT SHED').px, 63, 1.9]]],
    ['under the pier', [[g('UNDER THE PIER').px, 0, 0.7], [g('UNDER THE PIER').px, 40, 0.7]]],
    ['along the quay past the boats', [[310, 44.8, 2.4], [400, 44.8, 2.4]]],
    ['down the squid boats\' line', [[389.5, 44, 2.4], [389.5, 8, 2.4]]],
    ['through the sea torii', through(262, 20, 90, 3, 10)],
    ['through the fish market', through(g('FISH MARKET').px + 10, g('FISH MARKET').py, 0, 2.5, 12)],
    ['down the bamboo lane', [296, 307, 318, 329, 340].map((py) => [g('BAMBOO LANE').px, py, Math.max(0, landAt(g('BAMBOO LANE').px, py)) + 1.6])],
  ];
}

function linesBlock(L, near, gaps) {
  console.log(`\n4. lines, swept with a ball of ${r3(BALL)} m`);
  const step = 0.05;
  for (const [name, pts] of linesOf(L, gaps)) {
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
        if (!hit && p[1] - hotaruFloor(p[0], p[2]) < BALL) {
          hit = { name: 'the land' };
        }
        if (hit) {
          at = pts[i].map((v, j) => r3(v + (pts[i + 1][j] - v) * t));
        }
      }
    }
    check(name, !hit, hit ? `${hit.name || hit.kind} at plan ${JSON.stringify(at)}` : 'clear');
  }
}

/* ------------------------------------------------------------------ */
/* 5. The named gaps                                                   */
/* ------------------------------------------------------------------ */

function gapsBlock(placed, near, named) {
  console.log('\n5. gaps');
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
        if (!hit && p[1] - hotaruFloor(p[0], p[2]) < CRAFT_WORLD_R) {
          hit = { name: 'the land' };
        }
      }
    }
    check(`${z.name} is clear by the craft's radius`, !hit, hit ? hit.name || hit.kind : `${r3(z.w)} by ${r3(z.h)} m`);
    check(`${z.name} is wider and taller than the gap rule`, z.w >= GAP_MIN && z.h >= GAP_MIN, `${r3(z.w)} by ${r3(z.h)} m, the rule ${GAP_MIN}`);
  }
}

/* ------------------------------------------------------------------ */
/* 6. Slots                                                            */
/* ------------------------------------------------------------------ */

/*
 * Two of the valley's boxes facing each other: apart along one axis by less
 * than the gap rule and more than the craft is wide, overlapping along the
 * other two by at least twice the craft's width, and nothing solid at the
 * middle of the space between them: a slot a pilot would try and could
 * not pass. bardwell-check.js's rule, without its allowances.
 */
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
  console.log('\n6. slots');
  const found = slotsOf(own);
  const at = (p) => `plan ${JSON.stringify([r3(p[0] + 230), r3(180 - p[2]), r3(p[1])])}`;
  check(`no slot between ${r3(2 * CRAFT_WORLD_R)} and ${GAP_MIN} m between two of the valley's boxes`, found.length === 0,
    found.length ? `${found.length}: ${found.slice(0, 60).map((f) => `${f.a} and ${f.b}, ${r3(f.w)} m ${f.axis}, ${at(f.mid)}`).join('; ')}` : `${own.filter((s) => s.box).length} boxes`);
}

async function main() {
  console.log('Hotaru Valley');
  const L = layoutBlock();
  landBlock();
  const { placed, near, own } = await placedBlock(L);
  const gaps = hotaruGaps(L.info);
  linesBlock(L, near, gaps);
  gapsBlock(placed, near, gaps);
  slotsBlock(own);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
