/*
 * dunes-check.js: Kazesuna Dunes (src/maps/dunes/), proved buildable and
 * flyable in plain Node, the way scripts/sunny-check.js proves Sunnyfield,
 * whose sweeps and gap rule these are.
 *
 *   1. layout     every part finite, every colour one the kit knows
 *                 (src/props/homes.js, src/props/street.js), every sign
 *                 painted, and two builds the same to the bit
 *   2. sand       the floor finite everywhere, the same twice, never under
 *                 the sea, and the slip face as steep as a real one and no
 *                 steeper than sand stands
 *   3. placed     the document normalizes with no repairs, the coast goes
 *                 in as the built map puts it in, the start is seated on
 *                 the look out and a ball a metre across over it is clear,
 *                 and the shapes are under the module's limits
 *   4. gaps       every named gap's window clear of every solid by the
 *                 craft's radius, off the sand, and wider and taller than
 *                 the gap rule; the race's twelve in order
 *   5. lines      lines a pilot flies, swept with a ball twice the craft's
 *                 radius: off the look out, under the lift, through the
 *                 camel hut, along the platform under the shelter
 *   6. the mark   the hidden Konex Drone sign inside the camel hut, where
 *                 the hut's own gap looks at it
 *
 * Usage: node scripts/dunes-check.js
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
  coastLayout, dunesMarkSpots, raceGates, DECK, SPAWN, LIFT, HUT, PLATFORM,
} from '../src/maps/dunes/plan.js';
import { W, D, CELL, SEA, w, floor, groundAt } from '../src/maps/dunes/terrain.js';
import { dunesDocument } from '../src/maps/dunes/yard.js';
import { signPainted } from '../src/maps/dunes/signs.js';
import { MATERIALS as HOMES } from '../src/props/homes.js';
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

/* A kit that draws nothing and remembers every colour asked of it: the
 * draws are the browser's, but which colours they name is plain data. */
function colourKit(seen) {
  return new Proxy({}, {
    get: (_, name) => (name === 'then' ? undefined : (...args) => {
      if (typeof args[0] === 'string') {
        seen.add(args[0]);
      }
    }),
  });
}

function hashOf(L) {
  const h = createHash('sha256');
  const buf = new Float64Array(1);
  for (const p of L.parts) {
    h.update(`${p.t}|${p.m}|${p.solid}|${p.draw}|${p.kind}|${p.name}`);
    for (const v of p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]) {
      buf[0] = v;
      h.update(Buffer.from(buf.buffer));
    }
  }
  h.update(JSON.stringify([L.signs, L.wires, L.gaps, L.assets.map((a) => [a.x, a.y, a.h, a.yaw, a.el.type, a.el.style])]));
  return h.digest('hex');
}

async function layoutBlock() {
  console.log('\n1. layout');
  const L = coastLayout();
  const nums = (p) => (p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]);
  const bad = L.parts.filter((p) => nums(p).some((v) => !Number.isFinite(v)));
  check('every part is finite', bad.length === 0, `${L.parts.length} parts, ${bad.length} with a non-finite number`);
  const seen = new Set(L.parts.filter((p) => p.draw !== false).map((p) => p.m));
  const K = colourKit(seen);
  for (const d of L.draws) {
    d.fn(K);
  }
  /* The kit's own tones (SPEC in src/props/kit.js, not exported), rope
   * for the wires, and the town's. */
  const kitSrc = await readFile(join(root, 'src/props/kit.js'), 'utf8');
  const inKit = (m) => new RegExp(`[{ ,]${m}: \\{`).test(kitSrc);
  const foreign = [...seen].filter((m) => !HOMES[m] && !STREET[m] && m !== 'rope' && !inKit(m));
  check('every colour the coast names is one the kit knows', foreign.length === 0, foreign.join(', ') || `${seen.size} colours`);
  const named = new Set([...seen, ...L.parts.map((p) => p.m)]);
  const unused = Object.keys(HOMES).filter((m) => m.startsWith('dn') && !named.has(m));
  check('every dn colour in src/props/homes.js is used', unused.length === 0, unused.join(', ') || 'all used');
  const keys = [...new Set(L.signs.map((s) => s.key))];
  const unpainted = keys.filter((k) => !signPainted(k));
  check('every sign the coast hangs is painted', unpainted.length === 0, unpainted.join(', ') || `${keys.length} signs, ${L.signs.length} hung`);
  const a = hashOf(L);
  check('two builds are the same to the bit', a === hashOf(L), a.slice(0, 16));
  console.log(`        ${L.parts.filter((p) => p.solid).length} solids, ${L.draws.length} draws, ${L.assets.length} assets, ${L.pines} pines, ${L.gaps.length} gaps`);
  return L;
}

/* ------------------------------------------------------------------ */
/* 2. The sand                                                         */
/* ------------------------------------------------------------------ */

function sandBlock() {
  console.log('\n2. sand');
  let bad = 0;
  let under = 0;
  let differ = 0;
  let top = -Infinity;
  let steep = 0;
  const h = createHash('sha256');
  const buf = new Float64Array(1);
  for (let x = -W / 2 - 40; x <= W / 2 + 40; x += 1.7) {
    for (let z = -D / 2 - 40; z <= D / 2 + 40; z += 1.3) {
      const y = floor(x, z);
      buf[0] = y;
      h.update(Buffer.from(buf.buffer));
      if (!Number.isFinite(y)) {
        bad += 1;
      } else if (y < SEA - 1e-9) {
        under += 1;
      }
      if (floor(x, z) !== y) {
        differ += 1;
      }
      top = Math.max(top, y);
      /* The slope over one cell, along both axes. */
      const s = Math.max(Math.abs(floor(x + CELL, z) - y), Math.abs(floor(x, z + CELL) - y)) / CELL;
      steep = Math.max(steep, s);
    }
  }
  check('the floor is finite over the slice and its ring', bad === 0, `${bad} non-finite`);
  check('the floor is never under the sea', under === 0, `${under} below`);
  check('the floor is the same asked twice', differ === 0, h.digest('hex').slice(0, 16));
  /* Tottori's Uma-no-Senaka stands about 47 m over the sea (watabi.org). */
  check('the crest stands between 40 and 55 m', top > 40 && top < 55, `${r3(top)} m`);
  /* Dry sand slips at about 34 degrees; the slip face is cut a little past
   * it, as a fresh one is, and nowhere a wall. */
  const deg = (Math.atan(steep) * 180) / Math.PI;
  check('the steepest sand is a slip face, not a cliff', deg > 30 && deg < 50, `${r3(deg)} degrees`);
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
  const { doc, repairs } = normalize(dunesDocument());
  check('the document normalizes with no repairs', repairs.length === 0, repairs.join(' | ') || `${doc.elements.length} elements`);
  const { placed } = seatDocument(doc);
  /* addExtra in src/maps/built/index.js, restated. */
  placeSolids(L.parts, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
  placed.tops = indexTops(placed.solids);
  const sp = placed.spawn;
  sp.y = topUnder(placed.tops, sp.x, sp.z, DECK.top);
  check('the start is the pads', sp.from === 'pads', sp.from);
  check('the start is seated on the look out', Math.abs(sp.y - DECK.top) < 0.05, `${r3(sp.y)} m`);
  const wp = w(SPAWN.x, SPAWN.y, 0);
  check('the start is where the plan puts it', Math.abs(sp.x - wp[0]) < 0.01 && Math.abs(sp.z - wp[2]) < 0.01, `${r3(sp.x)}, ${r3(sp.z)}`);
  const near = gridOf(placed.solids);
  const over = [sp.x, sp.y + 0.6, sp.z];
  const hit = hitAt(near(over), over, 0.5);
  check('a ball a metre across over the start is clear', !hit, hit ? hit.name : 'clear');
  /* The first line: on the start's heading, two metres up (the pilot
   * lifts off first, and the rail round the out end is waist high), 30 m. */
  const sc = sincos((SPAWN.yaw * Math.PI) / 180, { s: 0, c: 0 });
  let block = null;
  for (let d = 0; d <= 30 && !block; d += 0.1) {
    const p = w(SPAWN.x + sc.c * d, SPAWN.y + sc.s * d, DECK.top + 2);
    block = hitAt(near(p), p, BALL) || (p[1] < groundAt(SPAWN.x + sc.c * d, SPAWN.y + sc.s * d) + BALL ? { name: 'sand' } : null);
  }
  check('the first line off the start is clear for 30 m', !block, block ? block.name || block.kind : 'clear');
  const lim = await worldLimits();
  check(`the map's ${placed.solids.length} shapes are under world.c's WORLD_MAX_SHAPES`, placed.solids.length < lim, `${lim}`);
  return { placed, near };
}

/* ------------------------------------------------------------------ */
/* 4. The named gaps                                                   */
/* ------------------------------------------------------------------ */

function gapsBlock(L, placed, near) {
  console.log('\n4. gaps');
  check('every named gap is in the document', placed.zones.length === L.gaps.length, `${placed.zones.length} of ${L.gaps.length}`);
  const gates = raceGates();
  check('the race is twelve frames, numbered in order', gates.length === 12 && gates.every((g, i) => g.name.startsWith(`${i + 1} `)), `${gates.length}`);
  for (const z of placed.zones) {
    const sc = sincos(z.yaw, { s: 0, c: 0 });
    const across = [-sc.s, 0, -sc.c];
    let hit = null;
    let low = Infinity;
    for (let i = 0; i <= 8 && !hit; i += 1) {
      for (let j = 0; j <= 8 && !hit; j += 1) {
        const u = (i / 8 - 0.5) * z.w;
        const v = (j / 8) * z.h;
        const p = [z.x + across[0] * u, z.y + v, z.z + across[2] * u];
        hit = hitAt(near(p), p, CRAFT_WORLD_R);
        if (j === 0) {
          low = Math.min(low, p[1] - floor(p[0], p[2]));
        }
      }
    }
    check(`${z.name} is clear by the craft's radius`, !hit, hit ? hit.name || hit.kind : `${r3(z.w)} by ${r3(z.h)} m`);
    check(`${z.name} is off the sand`, low > -0.05, `${r3(low)} m over it at its lowest`);
    check(`${z.name} is wider and taller than the gap rule`, z.w >= GAP_MIN && z.h >= GAP_MIN, `${r3(z.w)} by ${r3(z.h)} m, the rule ${GAP_MIN}`);
  }
}

/* ------------------------------------------------------------------ */
/* 5. Lines                                                            */
/* ------------------------------------------------------------------ */

const LINES = [
  ['under the chair lift, down its line at four metres', () => {
    const hA = groundAt(LIFT.x, LIFT.yTop + 14) + 4;
    const hB = groundAt(LIFT.x, LIFT.yFoot - 8) + 4;
    return [[LIFT.x - 3.2, LIFT.yTop + 14, hA], [LIFT.x - 3.2, LIFT.yFoot - 8, hB]];
  }],
  ['through the camel hut, west to east', () => {
    const y = (HUT.y0 + HUT.y1) / 2 - 0.6;
    const h = groundAt(HUT.x0, y) + 1.6;
    return [[HUT.x0 - 6, y, h], [HUT.x1 + 2.5, y, h]];
  }],
  ['along the platform under the shelter', () => [[PLATFORM.x0 + 2, 33.35, PLATFORM.top + 1.4], [PLATFORM.x1 - 2, 33.35, PLATFORM.top + 1.4]]],
];

function linesBlock(near) {
  console.log(`\n5. lines, swept with a ball of ${r3(BALL)} m`);
  for (const [name, make] of LINES) {
    const pts = make();
    let hit = null;
    let at = null;
    for (let i = 0; i + 1 < pts.length && !hit; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.05));
      for (let k = 0; k <= n && !hit; k += 1) {
        const t = k / n;
        const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        const p = w(q[0], q[1], q[2]);
        hit = hitAt(near(p), p, BALL) || (q[2] < groundAt(q[0], q[1]) + BALL ? { name: 'sand' } : null);
        if (hit) {
          at = q.map(r3);
        }
      }
    }
    check(name, !hit, hit ? `${hit.name || hit.kind} at plan ${JSON.stringify(at)}` : 'clear');
  }
}

/* ------------------------------------------------------------------ */
/* 6. The hidden mark                                                  */
/* ------------------------------------------------------------------ */

function markBlock(near) {
  console.log('\n6. the mark');
  const spots = dunesMarkSpots();
  check('one hidden Konex Drone sign', spots.length === 1 && spots[0].slug === 'konexdrone' && spots[0].key.startsWith('dunes#'), spots.map((s) => s.key).join(', '));
  const s = spots[0];
  /* It hangs on a wall: a solid within a few centimetres behind its face,
   * and nothing in front of it for the metre a camera reads it from. */
  const behind = [s.p[0] - s.n[0] * 0.08, s.p[1], s.p[2] - s.n[2] * 0.08];
  check('it hangs on the hut\'s back wall', Boolean(hitAt(near(behind), behind, 0.06)), `${r3(s.p[0])}, ${r3(s.p[1])}, ${r3(s.p[2])}`);
  let block = null;
  for (let d = 0.2; d <= 1.6 && !block; d += 0.05) {
    const p = [s.p[0] + s.n[0] * d, s.p[1], s.p[2] + s.n[2] * d];
    block = hitAt(near(p), p, 0.05);
  }
  check('nothing stands in front of it', !block, block ? block.name || block.kind : 'clear');
}

async function main() {
  console.log('Kazesuna Dunes');
  const L = await layoutBlock();
  sandBlock();
  const { placed, near } = await placedBlock(L);
  gapsBlock(L, placed, near);
  linesBlock(near);
  markBlock(near);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
