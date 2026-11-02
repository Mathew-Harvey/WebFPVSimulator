/*
 * yume-check.js: Yumeboshi Land (src/maps/yume/), proved buildable and
 * flyable in Node, and with --browser looked at in the real shell.
 *
 *   1. the layout: finite, every colour the family's and every one drawn,
 *      every sign painted, the same to the bit twice
 *   2. placed as the built map places it: the document normalizes, the
 *      start is the pads and is clear, under world.c's shape limit
 *   3. the coaster: the lap closes, the timetable is whole, and the space
 *      the train takes and the line a pilot flies chasing it (two metres
 *      over the rails) are clear of every solid but the track's own, the
 *      whole lap round
 *   4. lines a pilot flies, swept with a ball twice the craft's radius
 *   5. the named gaps: clear by the craft's radius, and at least GAP_MIN
 *   6. slots: no box pair a pilot would try and could not pass
 *   7. the rides: never through a still solid over two of their cycles,
 *      never more boxes round the craft than their slots, the same boxes
 *      for the same step and point every time, and the near plane's answer
 *      finite where a ride is near
 *   8. no Math.sin, cos or pow in what the plant reads
 *
 *   node scripts/yume-check.js
 *   node scripts/yume-check.js --browser [--shots=DIR] [--graphics=low]
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  yumeLayout, yumeGaps, yumeMarkSpots, worldAt, SPAWN, W, D, BRANDS,
} from '../src/maps/yume/plan.js';
import { yumeDocument } from '../src/maps/yume/yard.js';
import { SIGN_KEYS } from '../src/maps/yume/signs.js';
import {
  GATE, STREET, CASTLE, STATION, MOUNTAIN, HAUNT,
} from '../src/maps/yume/grounds.js';
import {
  coasterLine, timetable, trainBoxes, supports, BOX_HALF, CARS,
} from '../src/maps/yume/coaster.js';
import {
  ridesSeat, RIDE_SLOTS, BOX_DOUBLES, WHEEL, CAROUSEL, HORSES, TOWER, TOWER_CYCLE, TEACUPS, SWINGS, SWING_CYCLE, SHIP,
  wheelPin, horseAt, towerAt, cupAt, chairAt, shipAt,
} from '../src/maps/yume/rides.js';
import { MATERIALS } from '../src/props/yume.js';
import { GAP_MIN } from '../src/props/parts.js';
import { placeSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument, indexTops, topUnder } from '../src/maps/built/place.js';
import { CRAFT_WORLD_R, KINDS } from '../src/game/collide.js';
import { MOVER_SLOTS } from '../src/game/plantworld.js';
import { sincos } from '../src/props/trig.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BROWSER = process.argv.includes('--browser');
const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const SHOTS = shotsArg ? shotsArg.slice(8) : '';
const gfxArg = process.argv.find((a) => a.startsWith('--graphics='));
const GRAPHICS = gfxArg ? gfxArg.slice(11) : 'high';
let failures = 0;

function check(name, ok, detail = '') {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const BALL = 2 * CRAFT_WORLD_R;
const wx = (px) => px - W / 2;
const wz = (py) => D / 2 - py;

/* ------------------------------------------------------------------ */
/* Geometry, as park-check.js has it                                   */
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

const distTo = (s, p) => (s.box ? boxDist(s.box, p) : segDist(s.cap, p));

function hitAt(solids, p, r, skip = null) {
  for (const s of solids) {
    if (skip && skip(s)) {
      continue;
    }
    if (distTo(s, p) < r) {
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
  return (p, reach = 2) => {
    const out = new Set();
    for (let i = Math.floor((p[0] - reach) / cell); i <= Math.floor((p[0] + reach) / cell); i += 1) {
      for (let k = Math.floor((p[2] - reach) / cell); k <= Math.floor((p[2] + reach) / cell); k += 1) {
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
  const line = coasterLine();
  for (const v of line.p) {
    num(v);
  }
  return h.digest('hex');
}

function layoutBlock() {
  console.log('\n1. layout');
  const L = yumeLayout();
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
  const kinds = [...new Set(parts.filter((p) => p.solid).map((p) => p.kind))];
  const unknown = kinds.filter((k) => !KINDS.includes(k));
  check('every solid is a kind the colliders know', unknown.length === 0, unknown.join(', ') || kinds.join(', '));
  const lists = [parts.filter((p) => p.draw), T.cyls, T.prisms, T.discs, T.balls, T.cones, T.tori, T.frusta, T.polys, T.wires];
  const colours = new Set(lists.flatMap((l) => l.map((x) => x.m)));
  /* The track (./track.js) and the hidden builder's concrete draw these
   * too, outside the lists. */
  for (const m of ['ymCoasterRail', 'ymCoasterSpine', 'ymCoasterLeg', 'ymConcrete']) {
    colours.add(m);
  }
  const foreign = [...colours].filter((m) => !MATERIALS[m]);
  check('every colour the park draws is one of src/props/yume.js', foreign.length === 0, foreign.join(', ') || `${colours.size} colours`);
  const unused = Object.keys(MATERIALS).filter((m) => !colours.has(m));
  check('every colour of the family is drawn', unused.length === 0, unused.join(', ') || 'all drawn');
  const keys = new Set(T.signs.map((s) => s.key));
  const unpainted = [...keys].filter((k) => !SIGN_KEYS.includes(k));
  check('every sign the park hangs is painted', unpainted.length === 0, unpainted.join(', ') || `${keys.size} signs, ${T.signs.length} hung`);
  const unhung = SIGN_KEYS.filter((k) => !keys.has(k));
  check('every sign painted is hung', unhung.length === 0, unhung.join(', ') || 'all hung');
  const spots = yumeMarkSpots();
  check('a banner for every brand that shows here, and the hidden sign', spots.length === BRANDS.length + 1 && spots.some((q) => /~hidden$/.test(q.key || '')), `${spots.length} spots, ${BRANDS.length} brands`);
  const a = hashOf(L);
  const b = hashOf(yumeLayout());
  check('two builds are the same to the bit', a === b, a.slice(0, 16));
  console.log(`        ${parts.filter((p) => p.solid).length} solids, ${parts.filter((p) => p.draw).length} drawn parts, ${T.scaled.length} trees, ${T.signs.length} signs`);
  return L;
}

/* ------------------------------------------------------------------ */
/* 2. Placed                                                           */
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
  const { doc, repairs } = normalize(yumeDocument());
  check('the document normalizes with no repairs', repairs.length === 0, repairs.join(' | ') || `${doc.elements.length} elements`);
  const { placed } = seatDocument(doc);
  placeSolids(L.parts, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
  const mine = [];
  placeSolids(L.T.P.list, 0, 0, 0, 0, 'quarter', mine, { });
  placed.tops = indexTops(placed.solids);
  const sp = placed.spawn;
  sp.y = topUnder(placed.tops, sp.x, sp.z, sp.base);
  check('the start is the pads', sp.from === 'pads', sp.from);
  check('the start is seated on the plaza', Math.abs(sp.y - SPAWN.h) < 0.05, `${r3(sp.y)} m`);
  check('nothing inflated', (placed.stats.inflated || 0) === 0, `${placed.stats.inflated || 0}`);
  const near = gridOf(placed.solids);
  const over = [sp.x, sp.y + 0.6, sp.z];
  const hit = hitAt(near(over), over, 0.5);
  check('a ball a metre across over the start is clear', !hit, hit ? hit.name : 'clear');
  const lim = await worldLimits();
  check(`the map's ${placed.solids.length} shapes are under world.c's WORLD_MAX_SHAPES`, placed.solids.length < lim.shapes, `${lim.shapes}`);
  return { placed, near, own: mine };
}

/* ------------------------------------------------------------------ */
/* 3. The coaster                                                      */
/* ------------------------------------------------------------------ */

const ownTrack = (s) => /^coaster /.test(s.name || '');

function coasterBlock(near) {
  console.log('\n3. the coaster');
  const L = coasterLine();
  check('the lap closes within a centimetre before it is spread', L.closure < 0.01, `${r3(L.closure * 1000)} mm over ${r3(L.length)} m`);
  const tt = timetable();
  check('the timetable is whole', Number.isFinite(tt.lapMs) && tt.lapMs > 60000 && tt.lapMs < 180000, `${r3(tt.lapMs / 1000)} s a lap`);
  /* The cars' space: every half metre of the lap, a car's two boxes. */
  const box = new Float64Array(CARS * 2 * 6);
  let carHit = null;
  let flyHit = null;
  const cars = [];
  for (let step = 0; step < tt.lapMs && !carHit; step += 97) {
    const n = trainBoxes(step, box);
    for (let k = 0; k < n; k += 1) {
      const o = 6 * k;
      cars.push([box[o], box[o + 1], box[o + 2]]);
    }
  }
  for (const [px, py, h] of cars) {
    const c = [wx(px), h, wz(py)];
    const lo = BOX_HALF - 0.02;
    for (const sx of [-1, 0, 1]) {
      for (const sy of [-1, 0, 1]) {
        for (const sz of [-1, 0, 1]) {
          const p = [c[0] + sx * lo, c[1] + sy * lo, c[2] + sz * lo];
          const s = hitAt(near(p), p, 0.001, ownTrack);
          if (s && !carHit) {
            carHit = { s, at: [r3(px), r3(py), r3(h)] };
          }
        }
      }
    }
  }
  check('the train never passes through a solid but its own track', !carHit,
    carHit ? `${carHit.s.name || carHit.s.kind} at plan ${JSON.stringify(carHit.at)}` : `${cars.length} car boxes`);
  /* The chase line: two metres over the rails, along the track's up,
   * swept with the craft's ball, everywhere but the station and tunnel,
   * whose roofs are lower and are flown under. */
  const lowRoof = new Set(['station', 'tunnel', 'brakes']);
  let flown = 0;
  for (let i = 0; i < L.n && !flyHit; i += 1) {
    if (lowRoof.has(PIECE_NAMES[L.piece[i]])) {
      continue;
    }
    const o = 3 * i;
    const p = [wx(L.p[o] + L.u[o] * 2), L.p[o + 2] + L.u[o + 2] * 2, wz(L.p[o + 1] + L.u[o + 1] * 2)];
    const s = hitAt(near(p), p, BALL, ownTrack);
    flown += 1;
    if (s) {
      flyHit = { s, at: [r3(L.p[o]), r3(L.p[o + 1]), r3(L.p[o + 2])], piece: PIECE_NAMES[L.piece[i]] };
    }
  }
  check('the chase line two metres over the rails is clear', !flyHit,
    flyHit ? `${flyHit.s.name || flyHit.s.kind} over the ${flyHit.piece} at plan ${JSON.stringify(flyHit.at)}` : `${flown} points`);
  check('the track stands on supports', supports().length > 60, `${supports().length} columns`);
}

let PIECE_NAMES = [];

/* ------------------------------------------------------------------ */
/* 4. Lines                                                            */
/* ------------------------------------------------------------------ */

const through = (px, py, deg, h, reach = 4) => {
  const sc = sincos((deg * Math.PI) / 180, { s: 0, c: 0 });
  return [[px - reach * sc.c, py - reach * sc.s, h], [px + reach * sc.c, py + reach * sc.s, h]];
};

const LINES = [
  ['off the start, north through the gate and up the main street at three metres', [[SPAWN.px, SPAWN.py, 3], [GATE.px, STREET.y1 - 2, 3]]],
  ['through the castle gate', through((CASTLE.x0 + CASTLE.x1) / 2, (CASTLE.y0 + CASTLE.y1) / 2, 90, 3, 14)],
  ['along the station under its roof', through(STATION.track, (STATION.y0 + STATION.y1) / 2, 90, 4.2, 22)],
  ['into the dragon\'s mouth and through the mountain', [[(MOUNTAIN.bore0 + MOUNTAIN.bore1) / 2, MOUNTAIN.y1 + 4, 5], [(MOUNTAIN.bore0 + MOUNTAIN.bore1) / 2, MOUNTAIN.y0 - 4, 5]]],
  ['through the haunted house door', through(HAUNT.x1, (HAUNT.door[0] + HAUNT.door[1]) / 2, 180, 2, 3)],
];

function linesBlock(near) {
  console.log(`\n4. lines, swept with a ball of ${r3(BALL)} m`);
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
/* 5. The named gaps                                                   */
/* ------------------------------------------------------------------ */

function gapsBlock(placed, near) {
  console.log('\n5. gaps');
  const named = yumeGaps();
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
/* 6. Slots                                                            */
/* ------------------------------------------------------------------ */

function slotsOf(solids) {
  const boxes = solids.filter((s) => s.box);
  const near = gridOf(solids);
  const inside = (p, skip) => near(p).some((q) => q !== skip[0] && q !== skip[1]
    && (q.box ? boxDist(q.box, p) === 0 : segDist(q.cap, p) <= 0));
  const grid = gridOf(boxes, 8);
  const index = new Map(boxes.map((b, i) => [b, i]));
  const out = [];
  boxes.forEach((A, i) => {
    const a = A.box;
    const c = [(a[0] + a[3]) / 2, 0, (a[2] + a[5]) / 2];
    for (const B of grid(c)) {
      if (index.get(B) <= i) {
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
  const at = (p) => `plan ${JSON.stringify([r3(p[0] + W / 2), r3(D / 2 - p[2]), r3(p[1])])}`;
  check(`no slot between ${r3(2 * CRAFT_WORLD_R)} and ${GAP_MIN} m between two of the park's boxes`, found.length === 0,
    found.length ? `${found.length}: ${found.slice(0, 40).map((f) => `${f.a} and ${f.b}, ${r3(f.w)} m ${f.axis}, ${at(f.mid)}`).join('; ')}` : `${own.filter((s) => s.box).length} boxes`);
}

/* ------------------------------------------------------------------ */
/* 7. The rides                                                        */
/* ------------------------------------------------------------------ */

/* A moving box clear of the still solids: its corners and middle, pulled
 * in by two centimetres, none inside one. `skip` names the parts it is
 * hung from. */
function boxClear(near, c, h, skip) {
  for (const sx of [-1, 0, 1]) {
    for (const sy of [-1, 0, 1]) {
      for (const sz of [-1, 0, 1]) {
        const p = [c[0] + sx * (h[0] - 0.02), c[1] + sy * (h[1] - 0.02), c[2] + sz * (h[2] - 0.02)];
        const s = hitAt(near(p, 4), p, 0.001, skip);
        if (s) {
          return s;
        }
      }
    }
  }
  return null;
}

function ridesBlock(near) {
  console.log('\n7. the rides');
  const named = (re) => (s) => re.test(s.name || '');
  const hits = {};
  const note = (ride, s, step) => {
    if (s && !hits[ride]) {
      hits[ride] = `${s.name || s.kind} at step ${step}`;
    }
  };
  const PIN = new Float64Array(6);
  const HO = new Float64Array(6);
  const TW = [0, 0];
  const CU = new Float64Array(6);
  const CH = new Float64Array(8);
  const SH = [0, 0];
  const span = 2 * Math.max(TOWER_CYCLE, SWING_CYCLE, SHIP.cycle);
  for (let step = 0; step < span; step += 173) {
    for (let i = 0; i < WHEEL.gondolas; i += 1) {
      wheelPin(step, i, PIN);
      const c = WHEEL.cab;
      note('the big wheel', boxClear(near, [PIN[0], PIN[1] - c.below - c.tall / 2, PIN[2]], [c.hx, c.tall / 2 + c.below / 2 - 0.25, c.hz], named(/^wheel (rim|hub|axle)/)), step);
    }
    for (const h of HORSES) {
      horseAt(step, h, HO);
      note('the carousel', boxClear(near, [HO[0], HO[1], HO[2]], [0.7, 0.36, 0.7], null), step);
    }
    towerAt(step, TW);
    const a = TOWER.half;
    const b = TOWER.half + TOWER.ring.out;
    note('the drop tower', boxClear(near, [wx(TOWER.px), TW[0] + TOWER.ring.hy, wz(TOWER.py) - (a + b) / 2], [b, TOWER.ring.hy, (b - a) / 2 - 0.03], null), step);
    for (let i = 0; i < 9; i += 1) {
      cupAt(step, i, CU);
      note('the teacups', boxClear(near, [CU[0], TEACUPS.deck + TEACUPS.cup.tall / 2 + 0.03, CU[2]], [TEACUPS.cup.half, TEACUPS.cup.tall / 2, TEACUPS.cup.half], null), step);
    }
    for (let i = 0; i < SWINGS.chairs; i += 1) {
      chairAt(step, i, CH);
      note('the swing ride', boxClear(near, [CH[0], CH[1] - SWINGS.chair.tall / 2, CH[2]], [SWINGS.chair.half, SWINGS.chair.tall / 2, SWINGS.chair.half], null), step);
    }
    shipAt(step, SH);
    const s = sincos(SH[0], { s: 0, c: 1 });
    for (const al of SHIP.hull) {
      const up = SHIP.hullUp + (al * al) / 60;
      const lx = al;
      const ly = -SHIP.arm + up;
      const c = [wx(SHIP.px) + lx * s.c - ly * s.s, SHIP.axle + lx * s.s + ly * s.c, wz(SHIP.py)];
      note('the ship', boxClear(near, c, [SHIP.hullHalf, SHIP.hullHalf, SHIP.beam], null), step);
    }
  }
  for (const ride of ['the big wheel', 'the carousel', 'the drop tower', 'the teacups', 'the swing ride', 'the ship']) {
    check(`${ride} never moves through a still solid`, !hits[ride], hits[ride] || `${Math.round(span / 1000)} s`);
  }
  /* The slots: the craft held at the busiest places, every step for a
   * while, never more boxes than the ride slots. */
  const seat = ridesSeat(MOVER_SLOTS);
  check('the rides take the top slots', seat.base === MOVER_SLOTS - RIDE_SLOTS && seat.doubles === BOX_DOUBLES, `${seat.base} up, ${seat.slots}`);
  const out = new Float64Array(RIDE_SLOTS * BOX_DOUBLES);
  const probes = [
    ['in the carousel among the horses', [wx(CAROUSEL.px) + 5.3, CAROUSEL.deck + 1.25, wz(CAROUSEL.py)]],
    ['in the wheel by the lowest gondola', [wx(WHEEL.px), WHEEL.hub - WHEEL.R - 1.5, wz(WHEEL.py)]],
    ['among the teacups', [wx(TEACUPS.px) + 6, TEACUPS.deck + 0.6, wz(TEACUPS.py)]],
    ['among the swing chairs', [wx(SWINGS.px) + SWINGS.top + 3, 3, wz(SWINGS.py)]],
    ['under the ship', [wx(SHIP.px), 2, wz(SHIP.py)]],
    ['at the station platform', [wx(STATION.track), 2.2, wz(STATION.y0 + 12)]],
  ];
  let most = 0;
  let where = '';
  let seen = 0;
  for (const [name, p] of probes) {
    for (let step = 0; step < 60000; step += 7) {
      const n = seat.seat(step, p[0], p[1], p[2], out);
      if (n > 0) {
        seen += 1;
      }
      if (n > most) {
        most = n;
        where = name;
      }
    }
  }
  check('never more boxes round the craft than the slots', most < RIDE_SLOTS, `at most ${most} of ${RIDE_SLOTS}, ${where}`);
  check('the probes meet the rides', seen > 1000, `${seen} steps with boxes`);
  /* The same step and point, the same boxes to the bit. */
  const h = (fill) => {
    const hh = createHash('sha256');
    for (const [, p] of probes) {
      for (let step = 0; step < 20000; step += 131) {
        const n = seat.seat(step, p[0] + fill, p[1], p[2], out);
        hh.update(Buffer.from(out.buffer, 0, n * BOX_DOUBLES * 8));
      }
    }
    return hh.digest('hex');
  };
  const h1 = h(0);
  const h2 = h(0);
  check('the same step and point seat the same boxes to the bit', h1 === h2, h1.slice(0, 16));
  let gap = Infinity;
  for (let step = 0; step < 20000 && !Number.isFinite(gap); step += 11) {
    gap = seat.gapAt(wx(CAROUSEL.px) + 5.3, CAROUSEL.deck + 1.25, wz(CAROUSEL.py), 0.45, step);
  }
  check('the near plane sees a horse go by', Number.isFinite(gap) && gap >= 0 && gap < 0.45, `${r3(gap)} m`);
}

/* ------------------------------------------------------------------ */
/* 8. What the plant reads                                             */
/* ------------------------------------------------------------------ */

async function trigBlock() {
  console.log('\n8. no engine trig in what the plant reads');
  for (const f of ['coaster.js', 'rides.js', 'plan.js', 'grounds.js', 'fair.js', 'frame.js', 'yard.js']) {
    const src = await readFile(join(root, 'src/maps/yume', f), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const found = code.match(/Math\.(sin|cos|pow|tan|atan2?|exp|log)\b/g) || [];
    check(`src/maps/yume/${f}`, found.length === 0, found.join(', ') || 'clean');
  }
  const words = /uncrashed|liftoff|velocidrone|tryp|disney|universal studios|six flags|usj|fuji-q|sanrio|cedar point/i;
  for (const f of ['signs.js', 'grounds.js', 'fair.js', 'plan.js', 'yard.js', 'index.js', 'drawrides.js', 'track.js', 'coaster.js', 'rides.js']) {
    const src = await readFile(join(root, 'src/maps/yume', f), 'utf8');
    check(`no other sim or real park named in ${f}`, !words.test(src), (src.match(words) || ['clean'])[0]);
    check(`no dash in ${f}`, !/[–—]/.test(src), 'none');
  }
}

/* ------------------------------------------------------------------ */
/* Browser                                                             */
/* ------------------------------------------------------------------ */

const VIEWS = [
  ['gate', [0, 6, 128], [0, 8, 90]],
  ['main street', [0, 4, 112], [0, 6, 40]],
  ['hub', [-20, 14, 50], [0, 6, 28]],
  ['coaster lift', [-30, 12, 92], [-46, 18, 40]],
  ['loop', [-80, 14, -10], [-52, 14, -40]],
  ['wheel', [100, 30, 0], [126, 30, -66]],
  ['rides', [50, 30, 60], [80, 8, -20]],
  ['whole', [-160, 90, 150], [0, 0, 0]],
];

async function browser() {
  console.log('\nyume: browser');
  const { answerQuadPicker, openPage } = await import('../tests/lib/page.js');
  const { SETTINGS_KEY } = await import('../src/ui/ui.js');
  const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = ${JSON.stringify(GRAPHICS)};
    s.graphicsAuto = false;
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused: whatever preset boot picks */ }`];
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
  }
  const page = await openPage({
    root, width: 960, height: 540, url: '/index.html?map=yume&craft=5inch&fly=1', seed,
  });
  const ev = async (body) => {
    const r = await page.cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true,
    }, page.sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };
  const until = async (body, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await ev(body)) {
        return true;
      }
      await sleep(250);
    }
    return false;
  };
  const shot = async (name) => {
    if (!SHOTS) {
      return;
    }
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const report = {};
  try {
    check('the shell comes up', await until('return !!window.__shellReady', 120000));
    check('the park is ready', await until("const m = window.__map ? window.__map() : null; return Boolean(m && m.ready && m.id === 'yume');", 240000));
    const gfx = await ev('return window.__map().graphics;');
    check(`flown at ${GRAPHICS}`, String(gfx).toLowerCase().startsWith(GRAPHICS), String(gfx));
    await answerQuadPicker(page, 60000).catch(() => {});
    await until("return window.__ui.screen === 'flight'", 20000);
    const stand = await ev('const q = window.__ground(); return { y: q.y, surf: q.surf, rest: q.rest };');
    check('the spawn stands on the plaza', Math.abs(stand.surf - SPAWN.h) < 0.05, JSON.stringify(stand));
    await shot('first-person');
    report.stats = await ev('return JSON.parse(JSON.stringify(window.__map()));');
    report.views = {};
    for (const [name, eye, at] of VIEWS) {
      await ev(`window.__setCam(${eye.join(',')}, ${at.join(',')}); return 1;`);
      await sleep(1800);
      const rs = await ev('return window.__renderStats();');
      report.views[name] = rs;
      console.log(`  info  ${name}: ${rs.calls} draw calls, ${rs.triangles} triangles`);
      await shot(name);
    }
    if (SHOTS) {
      await ev("window.__ui.root.style.visibility = 'hidden'; return 1;");
      await ev('window.__setCam(-18, 26, 120, 30, 10, 0); return 1;');
      await sleep(2500);
      await shot('card');
      await ev("window.__ui.root.style.visibility = ''; return 1;");
    }
    await ev('window.__setCam(); return 1;');
    const errs = page.errors.filter((e) => !/api\/|ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
  if (SHOTS) {
    writeFileSync(join(SHOTS, 'report.json'), JSON.stringify(report, null, 2));
  }
}

async function main() {
  console.log('Yumeboshi Land');
  const { PIECES } = await import('../src/maps/yume/coaster.js');
  PIECE_NAMES = PIECES.map((q) => q[5]);
  const L = layoutBlock();
  const { placed, near, own } = await placedBlock(L);
  coasterBlock(near);
  linesBlock(near);
  gapsBlock(placed, near);
  slotsBlock(own);
  ridesBlock(near);
  await trigBlock();
  if (BROWSER) {
    await browser();
  }
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
