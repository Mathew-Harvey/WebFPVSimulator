/*
 * rally-check.js: Tanada RX's place and its cars, in Node.
 * `npm run check:rally`.
 *
 * The lap is a rallycross lap's length and the joker longer, the three
 * lines raise no road problem and every car is driven, the lines are a
 * car's width apart, nothing solid stands on a line a car drives (the
 * jump's own solid aside), every named gap is open to a ball the craft's
 * size through its middle and a few metres either side of it, the start is
 * clear with a clear line ahead of it, a car flies the jump and lands
 * inside the reach, the same document comes out twice, and the map is
 * under the module's shape limit.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Place, w } from '../src/maps/rally/frame.js';
import {
  circuitParts, LANE_OFFSETS, SPAWN, JUMP_X, KONEX, STAND,
} from '../src/maps/rally/circuit.js';
import { hillParts, hillStanding, standingSolids } from '../src/maps/rally/hill.js';
import { paddockParts } from '../src/maps/rally/paddock.js';
import { rallyDocument, rallyGaps } from '../src/maps/rally/yard.js';
import { rallyTraffic, TOP } from '../src/maps/rally/traffic.js';
import { rideAt } from '../src/maps/rally/ride.js';
import { placeSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument, indexTops, topUnder } from '../src/maps/built/place.js';
import { CRAFT_WORLD_R } from '../src/game/collide.js';
import { sincos } from '../src/props/trig.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

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
  for (const s of solids) {
    const b = s.box ?? [
      Math.min(s.cap[0], s.cap[3]) - s.cap[6], 0, Math.min(s.cap[2], s.cap[5]) - s.cap[6],
      Math.max(s.cap[0], s.cap[3]) + s.cap[6], 0, Math.max(s.cap[2], s.cap[5]) + s.cap[6],
    ];
    for (let i = Math.floor(b[0] / cell); i <= Math.floor(b[3] / cell); i += 1) {
      for (let k = Math.floor(b[2] / cell); k <= Math.floor(b[5] / cell); k += 1) {
        const key = `${i},${k}`;
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key).push(s);
      }
    }
  }
  return (p) => {
    const out = new Set();
    for (let i = Math.floor((p[0] - 2) / cell); i <= Math.floor((p[0] + 2) / cell); i += 1) {
      for (let k = Math.floor((p[2] - 2) / cell); k <= Math.floor((p[2] + 2) / cell); k += 1) {
        for (const s of map.get(`${i},${k}`) ?? []) {
          out.add(s);
        }
      }
    }
    return [...out];
  };
}

/* 1. The lap and the cars. */
console.log('1. the lap and the cars');
const T = new Place();
const Lay = circuitParts(T);
hillParts(T);
paddockParts(T);
const L = Lay.line.length;
check('the lap is a rallycross lap, 800 m to 1.4 km', L >= 800 && L <= 1400, `${L.toFixed(0)} m`);
check('the joker is longer than the lap', Lay.joker.length > L + 30, `${(Lay.joker.length - L).toFixed(0)} m more`);
check('the joker leaves the course and comes back', Lay.split !== null && Lay.merge !== null, `${Lay.split} to ${Lay.merge}`);
const gravel = Lay.surfaces.filter((r) => r.kind === 'gravel').reduce((n, r) => n + r.s1 - r.s0, 0);
check('the lap is tarmac and gravel, a third gravel or more', gravel / L > 0.3 && gravel / L < 0.6, `${((100 * gravel) / L).toFixed(0)}% gravel`);
const rx = rallyTraffic();
check('the lines raise no road problem', rx.traffic.problems.length === 0, rx.traffic.problems.map((p) => p.message).join('; '));
check('six cars, every one driven', rx.cars.length === 6 && rx.traffic.vehicles.every((v) => v.topSpeed === TOP));
const apart = LANE_OFFSETS.slice(1).map((d, i) => d - LANE_OFFSETS[i]);
check('the lines are a car and a metre apart', apart.every((g) => g >= 2.7), apart.join(', '));

/* 2. Placed. */
console.log('\n2. placed');
const { doc, repairs } = normalize(rallyDocument());
check('the document normalizes with no repairs', repairs.length === 0, repairs.join(' | ') || `${doc.elements.length} elements`);
const { placed } = seatDocument(doc);
const parts = [...T.P.list, ...standingSolids(hillStanding())];
placeSolids(parts, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
placed.tops = indexTops(placed.solids);
const near = gridOf(placed.solids);
const src = await readFile(join(root, 'src/native/world.c'), 'utf8');
const lim = Number(src.match(/#define WORLD_MAX_SHAPES (\d+)/)[1]);
check(`the map's ${placed.solids.length} shapes are under world.c's WORLD_MAX_SHAPES`, placed.solids.length < lim, `${lim}`);
check('nothing inflated', (placed.stats.inflated || 0) === 0, `${placed.stats.inflated || 0}`);
check('the same document comes out twice', JSON.stringify(rallyDocument()) === JSON.stringify(rallyDocument()));

/* 3. The lines the cars drive are clear, the jump aside. */
console.log('\n3. the lines');
const lineHits = new Map();
for (const lane of rx.traffic.roads) {
  /* The lane as the module has it, in world metres. */
  const pts = lane.points;
  for (let i = 0; i < pts.length; i += 2) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / l;
    const nz = (b.x - a.x) / l;
    for (const off of [-1.1, 0, 1.1]) {
      const q = [a.x + nx * off, 0.6, a.z + nz * off];
      const hit = hitAt(near(q), q, 0.3);
      if (hit && hit.name !== 'jump') {
        lineHits.set(hit.name || 'unnamed', (lineHits.get(hit.name || 'unnamed') || 0) + 1);
      }
    }
  }
}
check('nothing solid stands on a line a car drives', lineHits.size === 0, [...lineHits].map(([k, n]) => `${k} x${n}`).join(', ') || 'clear');

/* 4. The gaps. */
console.log('\n4. the named gaps');
const R = CRAFT_WORLD_R;
for (const g of rallyGaps()) {
  const sc = sincos((g.deg * Math.PI) / 180, { s: 0, c: 0 });
  /* Across the window is the normal turned a quarter. */
  const ax = -sc.s;
  const ay = sc.c;
  let worst = null;
  for (const t of [-1, -0.5, 0, 0.5, 1]) {
    for (const v of [0.15, 0.5, 0.85]) {
      for (const along of [-3, 0, 3]) {
        const px = g.px + ax * t * (g.w / 2 - R) + sc.c * along;
        const py = g.py + ay * t * (g.w / 2 - R) + sc.s * along;
        const h = g.h0 + R + v * (g.h1 - g.h0 - 2 * R);
        const q = w(px, py, h);
        const hit = hitAt(near(q), q, R);
        if (hit && !worst) {
          worst = `${hit.name || 'unnamed'} at ${t},${v},${along}`;
        }
      }
    }
  }
  check(`${g.name} is open through the middle and 3 m either side`, !worst, worst || `${g.w.toFixed(1)} by ${(g.h1 - g.h0).toFixed(1)} m`);
}

/* 5. The start. */
console.log('\n5. the start');
const sp = placed.spawn;
sp.y = topUnder(placed.tops, sp.x, sp.z, sp.base);
check('the start is the pads', sp.from === 'pads', sp.from);
check('the start is on the ground', Math.abs(sp.y) < 0.1, `${sp.y.toFixed(2)} m`);
let ahead = null;
for (let d = 0; d <= 30 && !ahead; d += 1) {
  for (const h of [0.6, 1.5, 3]) {
    const q = w(SPAWN.px + d, SPAWN.py, h);
    const hit = hitAt(near(q), q, 0.6);
    if (hit) {
      ahead = `${hit.name || 'unnamed'} at ${d} m, ${h} m up`;
      break;
    }
  }
}
check('30 m clear ahead of the start, a metre and more wide', !ahead, ahead || 'clear');

/* 6. The jump. */
console.log('\n6. the jump');
const out = { lift: 0, pitch: 0 };
const o2 = { lift: 0, pitch: 0 };
let top = 0;
let landed = null;
let same = true;
for (let d = 0; d < 60; d += 0.1) {
  const [x, , z] = w(JUMP_X + d, 118);
  rideAt(x, z, 1, TOP, out);
  rideAt(x, z, 1, TOP, o2);
  same = same && out.lift === o2.lift && out.pitch === o2.pitch;
  top = Math.max(top, out.lift);
  if (d > 14 && out.lift === 0 && landed === null) {
    landed = d;
  }
}
check('the ride is the same number twice', same);
check('a car at full speed flies higher than the lip', top > 1.6 && top < 6, `${top.toFixed(2)} m`);
check('and is back on the ground inside the reach', landed !== null && landed < 52, `${landed !== null ? landed.toFixed(1) : 'never'} m past the foot`);
const [fx, , fz] = w(JUMP_X + 30, 160);
rideAt(fx, fz, 1, TOP, out);
check('a car off the jump never leaves the ground', out.lift === 0 && out.pitch === 0);

/* 7. The hidden mark. */
console.log('\n7. the hidden mark');
const kp = w(KONEX.px, KONEX.py + 0.5, KONEX.h);
const inWall = w(KONEX.px, KONEX.py - 0.17, KONEX.h);
check('the Konex sign is on the back of the stand\'s back wall, open in front', Boolean(hitAt(near(inWall), inWall, 0.02)) && !hitAt(near(kp), kp, 0.3), `${KONEX.h.toFixed(2)} m up, wall top ${STAND.wall} m`);
const alley = w(KONEX.px, (STAND.yBack + 0.3 + STAND.colY) / 2, KONEX.h);
check('the alley behind the wall is open to the craft', !hitAt(near(alley), alley, CRAFT_WORLD_R), `${(STAND.colY - STAND.yBack - 0.3 - 0.22).toFixed(2)} m wide`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
