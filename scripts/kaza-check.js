/*
 * kaza-check.js: Kazahana Plain (src/maps/kaza/), proved buildable and
 * flyable in plain Node, the way scripts/sunny-check.js proves Sunnyfield,
 * whose sweeps and gap rule these are.
 *
 *   1. layout     every part finite, every colour one of the plain's family
 *                 (src/props/kaza.js) and every one of the family drawn,
 *                 every sign the plain hangs painted, every balloon's solid
 *                 inside the envelope drawn round it, and two builds the
 *                 same to the bit
 *   2. placed     the document normalizes with no repairs, the plain goes
 *                 in as the built map puts it in, the start is seated on
 *                 the matting and a ball a metre across over it is clear,
 *                 and the shapes are under the module's limits
 *   3. lines      lines a pilot flies, swept with a ball twice the craft's
 *                 radius: the first line north off the start, through the
 *                 light tunnel and down the market lane, through the barn,
 *                 under the old line's road arch, the long cruise north to
 *                 the turbines
 *   4. gaps       every named gap's window clear of every solid by the
 *                 craft's radius, and wider and taller than the gap rule
 *   5. slots      the gap rule inside the plain's own boxes
 *
 * Usage: node scripts/kaza-check.js
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

import { kazaLayout, kazaGaps, worldAt, SPAWN, W, D } from '../src/maps/kaza/plan.js';
import { kazaDocument } from '../src/maps/kaza/yard.js';
import { SIGN_KEYS } from '../src/maps/kaza/signs.js';
import { DESIGNS, PROFILE, profileAt, ENVELOPE_R, WAIST_H, THROAT_R, THROAT_H, MOUTH_H } from '../src/maps/kaza/envelope.js';
import { TUNNEL, LANE, TREE } from '../src/maps/kaza/market.js';
import { BARN } from '../src/maps/kaza/farm.js';
import { VIADUCT, archX } from '../src/maps/kaza/far.js';
import { MATERIALS } from '../src/props/kaza.js';
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
  for (const q of L.T.prisms) {
    h.update(`${q.m}|${q.axis}`);
    for (const v of [...q.profile.flat(), q.e0, q.e1]) {
      num(v);
    }
  }
  return h.digest('hex');
}

async function layoutBlock() {
  console.log('\n1. layout');
  const L = kazaLayout();
  const { parts, T } = L;
  const nums = (p) => (p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]);
  const bad = parts.filter((p) => nums(p).some((v) => !Number.isFinite(v)));
  const badDrawn = [
    ...T.prisms.map((q) => [...q.profile.flat(), q.e0, q.e1]),
    ...T.cyls.map((c) => [...c.a, ...c.b, c.r]),
    ...T.wires.map((w) => [...w.a, ...w.b, w.sag, w.r]),
    ...T.signs.map((s) => [s.px, s.py, s.h, s.w, s.ht]),
  ].filter((v) => v.some((x) => !Number.isFinite(x)));
  check('every part and every drawn shape is finite', bad.length + badDrawn.length === 0,
    `${parts.length} parts, ${bad.length + badDrawn.length} with a non-finite number`);
  /* Inside the plot and under the top balloon's crown: a box handed its
   * numbers in the wrong order is a slab hundreds of metres across, which
   * is how the roads first came out (a wall 640 m high over the start). */
  const stray = T.P.list.filter((p) => {
    const v = p.t === 'box' ? [p.lo, p.hi] : [p.a, p.b];
    return v.some((q) => q[1] < -0.5 || q[1] > 90 || Math.abs(q[0]) > W / 2 + 1 || Math.abs(q[2]) > D / 2 + 1);
  });
  check('every part is inside the plot and under 90 m', stray.length === 0,
    stray.slice(0, 4).map((p) => `${p.name || p.kind} ${p.m}`).join(', ') || `${T.P.list.length} parts`);
  const lists = [parts.filter((p) => p.draw), T.cyls, T.prisms, T.discs, T.balls, T.cones, T.tori, T.shells, T.frusta, T.wires,
    T.strings, T.vaults, T.viaducts, T.leaves];
  const colours = new Set(lists.flatMap((l) => l.map((x) => x.m)).filter(Boolean));
  /* The envelopes' colours are their designs', and the few ./index.js
   * names itself (the vault's skin, the bulbs) are read from its source. */
  for (const e of T.envelopes) {
    const d = DESIGNS[e.design];
    for (const m of [...d.gores, ...(d.bands || []).flatMap((b) => b[2])]) {
      colours.add(m);
    }
  }
  for (const m of (await readFile(join(root, 'src/maps/kaza/index.js'), 'utf8')).match(/'kz[A-Za-z]+'/g) ?? []) {
    colours.add(m.slice(1, -1));
  }
  const foreign = [...colours].filter((m) => !MATERIALS[m]);
  check('every colour the plain draws is one of src/props/kaza.js', foreign.length === 0, foreign.join(', ') || `${colours.size} colours`);
  const unused = Object.keys(MATERIALS).filter((m) => !colours.has(m));
  check('every colour of the family is drawn', unused.length === 0, unused.join(', ') || 'all drawn');
  const keys = new Set(T.signs.map((s) => s.key));
  const unpainted = [...keys].filter((k) => !SIGN_KEYS.includes(k));
  check('every sign the plain hangs is painted', unpainted.length === 0, unpainted.join(', ') || `${keys.size} signs, ${T.signs.length} hung`);
  /* The balloons' solids, inside the drawn envelope: each ball's every
   * height inside the profile's radius there, so a pilot never meets air. */
  const outside = [];
  for (const [r, h] of [[ENVELOPE_R, WAIST_H], [THROAT_R, THROAT_H]]) {
    for (let k = -8; k <= 8; k += 1) {
      const dh = (r * k) / 8;
      const need = Math.sqrt(Math.max(0, r * r - dh * dh));
      if (need > profileAt(h + dh) + 1e-6) {
        outside.push(`r ${r} at ${r3(h + dh)} m wants ${r3(need)}, the skin is ${r3(profileAt(h + dh))}`);
      }
    }
  }
  check('every balloon solid is inside its envelope', outside.length === 0, outside.slice(0, 4).join('; ') || `${T.envelopes.length} envelopes, mouth ${MOUTH_H} m, crown ${PROFILE[PROFILE.length - 1][1]} m`);
  const a = hashOf(L);
  const b = hashOf(kazaLayout());
  check('two builds are the same to the bit', a === b, a.slice(0, 16));
  console.log(`        ${parts.filter((p) => p.solid).length} solids, ${parts.filter((p) => p.draw).length} drawn parts, ${T.scaled.length} assets, ${T.leaves.length} canopies, ${T.strings.length} light strings, ${T.wires.length} wires`);
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

async function placedBlock(L) {
  console.log('\n2. placed');
  const { doc, repairs } = normalize(kazaDocument());
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
  check('the start is seated on the matting', Math.abs(sp.y - SPAWN.h) < 0.05, `${r3(sp.y)} m`);
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
/* 3. Lines                                                            */
/* ------------------------------------------------------------------ */

/* Plan points [px, py, h], flown straight from one to the next. */
const through = (px, py, deg, h, reach = 4) => {
  const sc = sincos((deg * Math.PI) / 180, { s: 0, c: 0 });
  return [[px - reach * sc.c, py - reach * sc.s, h], [px + reach * sc.c, py + reach * sc.s, h]];
};

const LINES = [
  ['the first line: north off the start at four metres, between the gate balloons', [[SPAWN.px, SPAWN.py + 1, 4], [SPAWN.px, 240, 4]]],
  ['through the light tunnel at a metre and a half, on its centre line', [[LANE.cx, TUNNEL.y0 - 6, 1.5], [LANE.cx, TUNNEL.y1 + 4, 1.5]]],
  ['down the market lane at two metres to the tree', [[LANE.cx, TUNNEL.y1 + 2, 2], [LANE.cx, TREE.py - 12, 2]]],
  ['through the barn, door to door', [[(BARN.x0 + BARN.x1) / 2, BARN.y0 - 6, 2.2], [(BARN.x0 + BARN.x1) / 2, BARN.y1 + 6, 2.2]]],
  ['under the old line, the road arch', through(archX(VIADUCT.road), (VIADUCT.y0 + VIADUCT.y1) / 2, 90, 3.5, 8)],
  ['the long cruise north at thirty five metres, the start to the turbines', [[SPAWN.px, SPAWN.py, 35], [SPAWN.px, 1650, 35]]],
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
  const named = kazaGaps();
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

/*
 * Two of the town's boxes facing each other: apart along one axis by less
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
  console.log('\n5. slots');
  const found = slotsOf(own);
  const at = (p) => `plan ${JSON.stringify([r3(p[0] + W / 2), r3(D / 2 - p[2]), r3(p[1])])}`;
  check(`no slot between ${r3(2 * CRAFT_WORLD_R)} and ${GAP_MIN} m between two of the plain's boxes`, found.length === 0,
    found.length ? `${found.length}: ${found.slice(0, 60).map((f) => `${f.a} and ${f.b}, ${r3(f.w)} m ${f.axis}, ${at(f.mid)}`).join('; ')}` : `${own.filter((s) => s.box).length} boxes`);
}

async function main() {
  console.log('Kazahana Plain');
  const L = await layoutBlock();
  const { placed, near, own } = await placedBlock(L);
  linesBlock(near);
  gapsBlock(placed, near);
  slotsBlock(own);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
