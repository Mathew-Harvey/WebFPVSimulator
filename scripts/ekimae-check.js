/*
 * ekimae-check.js: Ekimae Drift's place, in Node. `npm run check:ekimae`.
 *
 * The course is a road the built map can drive with no problem raised,
 * every drift car is driven, nothing solid stands where a car's tail swings
 * (below a car's roof), every named gap is open all the way through, the
 * start pad is on the car park's roof, every sign has a painter, the hidden
 * mark is where the alley is, and the same document comes out twice. The
 * film judge itself is scripts/drift-check.js's: this map only hands it
 * cars, groups and zones.
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

import { W, D, HALF, w } from '../src/maps/ekimae/frame.js';
import {
  ekimaeLayout, ekimaeGaps, ekimaeMarkSpots, START, CP, ALLEY, VIA, TRAIN,
} from '../src/maps/ekimae/plan.js';
import { ekimaeDocument, groupIds } from '../src/maps/ekimae/yard.js';
import { signKeys } from '../src/maps/ekimae/signs.js';
import { trafficOf } from '../src/maps/built/traffic.js';
import { seatDocument, indexTops, topUnder } from '../src/maps/built/place.js';
import { placeSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { nearestOn } from '../src/maps/built/road.js';
import { GAP_MIN } from '../src/props/parts.js';
import { existsSync, readFileSync } from 'node:fs';
import { makeRig, buildWorld, V, linePath } from './lib/flightrig.js';
import { deriveObstacles } from '../src/game/obstacles.js';
import { heldStill } from '../src/game/collide.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `: ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}

const L = ekimaeLayout();
const doc = ekimaeDocument();
const t = trafficOf(doc);

console.log('the course');
check('the course raises no road problem', t.problems.length === 0, t.problems.map((p) => p.message).join('; '));
check('a lap is between 800 and 1200 m', L.line.length > 800 && L.line.length < 1200, `${L.line.length.toFixed(0)} m`);
check('every drift car is driven', t.vehicles.length > 0 && t.vehicles.every((v) => v.drift > 0), `${t.vehicles.length} cars`);
const groups = groupIds(doc);
check('three tandems', groups.length === 3 && groups.every((g) => g.ids.length >= 2), groups.map((g) => g.ids.length).join(','));
check('four clipping zones and one under the tracks', L.zones.length === 5, L.zones.map((z) => z.name).join(', '));
check('the document is the same every build', JSON.stringify(ekimaeDocument()) === JSON.stringify(doc));

/* The whole place's solids, as the built map seats them: the document,
 * then the map's own parts (addExtra in src/maps/built/index.js). */
const { placed } = seatDocument(normalize(doc).doc);
placeSolids(L.parts, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
placed.tops = indexTops(placed.solids);

/*
 * NOTHING IN A TAIL'S WAY: below a car's roof (3 m), the barriers stand
 * outside the road, and no other solid stands inside the line of their
 * faces (half a metre past the kerb); a post the barrier stands in front
 * of is behind it. Sampled along each solid's
 * plan footprint, so a long wall is seen along its length.
 */
function footprint(s) {
  if (s.box) {
    const [x0, , z0, x1, , z1] = s.box;
    const pts = [];
    const nx = Math.max(1, Math.ceil((x1 - x0) / 1));
    const nz = Math.max(1, Math.ceil((z1 - z0) / 1));
    for (let i = 0; i <= nx; i += 1) {
      for (let j = 0; j <= nz; j += 1) {
        if (i === 0 || j === 0 || i === nx || j === nz) {
          pts.push([x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz, 0]);
        }
      }
    }
    return pts;
  }
  const [ax, , az, bx, , bz, r] = s.cap;
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    pts.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, r]);
  }
  return pts;
}
function bottom(s) {
  return s.box ? s.box[1] : Math.min(s.cap[1], s.cap[4]) - s.cap[6];
}
let near = Infinity;
let nearName = '';
let barrierNear = Infinity;
for (const s of placed.solids) {
  if (bottom(s) > 3) {
    continue;
  }
  for (const [x, z, r] of footprint(s)) {
    const d = nearestOn(L.line, x + W / 2, D / 2 - z).d - r;
    if (s.name === 'barrier') {
      barrierNear = Math.min(barrierNear, d);
    } else if (d < near) {
      near = d;
      nearName = s.name || s.kind;
    }
  }
}
check(`no solid but a barrier within ${HALF + 0.5} m of the course's middle`, near >= HALF + 0.5, `nearest ${near.toFixed(2)} m (${nearName})`);
check(`every barrier outside the road's ${HALF} m`, barrierNear >= HALF, `nearest ${barrierNear.toFixed(2)} m`);

/* Whether a world point is inside any solid. */
function inside(x, y, z) {
  for (const s of placed.solids) {
    if (s.box) {
      const b = s.box;
      if (x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]) {
        return s.name || s.kind;
      }
    } else {
      const [ax, ay, az, bx, by, bz, r] = s.cap;
      const vx = bx - ax;
      const vy = by - ay;
      const vz = bz - az;
      const len = vx * vx + vy * vy + vz * vz;
      const k = len > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy + (z - az) * vz) / len)) : 0;
      const dx = ax + vx * k - x;
      const dy = ay + vy * k - y;
      const dz = az + vz * k - z;
      if (dx * dx + dy * dy + dz * dz < r * r) {
        return s.name || s.kind;
      }
    }
  }
  return null;
}

/*
 * EVERY GAP OPEN: the gap's whole rectangle, and a metre either side of it
 * along the way it is flown, holds no solid, and it is wider than the gap
 * rule's slot. `deg` 0 is flown east or west, so its width runs north and
 * south.
 */
console.log('the gaps');
const gaps = ekimaeGaps();
const docGaps = doc.elements.filter((e) => e.type === 'gap');
check('every named gap is in the document', docGaps.length === gaps.length && gaps.every((g) => docGaps.some((e) => e.name === g.name)), `${docGaps.length} gaps`);
for (const g of gaps) {
  const across = g.deg === 0 ? [0, 1] : [1, 0];
  const along = g.deg === 0 ? [1, 0] : [0, 1];
  let hit = null;
  for (let u = -g.w / 2; u <= g.w / 2 + 1e-9 && !hit; u += g.w / 8) {
    for (let h = g.h0; h <= g.h1 + 1e-9 && !hit; h += (g.h1 - g.h0) / 6) {
      for (const a of [-1, 0, 1]) {
        const px = g.px + across[0] * u + along[0] * a;
        const py = g.py + across[1] * u + along[1] * a;
        const [x, y, z] = w(px, py, h);
        hit = inside(x, y, z);
        if (hit) {
          hit = `${hit} at ${px.toFixed(1)}, ${py.toFixed(1)}, ${h.toFixed(1)} m`;
          break;
        }
      }
    }
  }
  check(`${g.name} is open`, !hit && g.w >= GAP_MIN && g.h1 - g.h0 >= GAP_MIN, hit || `${g.w.toFixed(1)} by ${(g.h1 - g.h0).toFixed(1)} m`);
}

console.log('the start, the signs, the mark');
const pad = doc.elements.find((e) => e.type === 'startPads');
check('the start pad is on the car park roof', pad && pad.position.x === START.x && pad.position.z === CP.roof);
{
  const sp = placed.spawn;
  sp.y = topUnder(placed.tops, sp.x, sp.z, CP.roof);
  check('the pilot is seated on the car park roof', sp.from === 'pads' && Math.abs(sp.y - CP.roof) < 0.5, `${sp.y.toFixed(2)} m, the roof is ${CP.roof} m`);
}
const keys = new Set(signKeys());
const unpainted = [...new Set(L.signs.map((s) => s.key))].filter((k) => !keys.has(k));
check('every sign has a painter', unpainted.length === 0, unpainted.join(', ') || `${L.signs.length} signs`);
const marks = ekimaeMarkSpots();
const konex = marks.filter((m) => m.slug === 'konexdrone');
const [mx, my] = konex.length ? [konex[0].p[0] + W / 2, D / 2 - konex[0].p[2]] : [NaN, NaN];
check('one hidden Konex mark, in the lantern alley under the tracks', marks.length === 1 && konex.length === 1
  && Math.abs(mx - ALLEY.x1) < 0.2 && my > VIA.y0 && my < VIA.y1);

/* The reference sizes the map is built to (PROGRESS.md has the sources). */
console.log('the reference sizes');
check('a city street of four 3 m lanes is 12 m', HALF * 2 === 12);
check('a commuter train car is about 20 m by 2.95 m', Math.abs(TRAIN.len + TRAIN.gap - 20) < 0.01 && Math.abs(TRAIN.half * 2 - 2.95) < 0.01);
const poles = doc.elements.filter((e) => e.type === 'utilityPole');
check('the poles stand 10 m', poles.length > 0 && poles.every((p) => p.dims.height === 10), `${poles.length} poles`);

/*
 * THE BARRIERS' FOOT, bug-99b4aa8f, 2026-11-15: "every time i hit a barrier
 * i get stuck". The barrier was one capsule lying at its own radius, a log,
 * and under its round side at the ground a wedge of air ran 0.25 m inside
 * the drawn block: a craft that met it low and slow lay there upright,
 * under concrete it could not climb through, and upright on the ground is a
 * landing, so nothing set it down. First the shape: the drawn foot of every
 * block is solid down to the ground. Then the plant flown into one.
 */
console.log('the barriers\' foot');
{
  const bars = placed.solids.filter((s) => s.name === 'barrier' && s.cap);
  const inBar = (x, y, z) => bars.some((s) => {
    const [ax, ay, az, bx, by, bz, r] = s.cap;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / (dx * dx + dy * dy + dz * dz)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy, z - az - t * dz) < r;
  });
  /* Across the middle and the quarter of every block, both faces, out to
   * the drawn foot's 0.42 m (src/maps/ekimae/index.js), up to 0.3 m. */
  let open = 0;
  let first = '';
  for (const seg of L.walls) {
    const dx = seg.b[0] - seg.a[0];
    const dy = seg.b[1] - seg.a[1];
    const len = Math.hypot(dx, dy);
    for (const t of [0.25, 0.5]) {
      for (const off of [-0.4, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.4]) {
        const px = seg.a[0] + dx * t - (dy / len) * off;
        const py = seg.a[1] + dy * t + (dx / len) * off;
        for (const h of [0.02, 0.08, 0.15, 0.25]) {
          const [x, , z] = w(px, py);
          if (!inBar(x, h, z)) {
            open += 1;
            if (!first) first = `block ${seg.i} at ${off} m off its axis, ${h} m up`;
          }
        }
      }
    }
  }
  check('every block\'s drawn foot is solid to the ground, no wedge under it', open === 0,
    open ? `${open} points open, first ${first}` : `${L.walls.length} blocks`);
}

const WASM = new URL('../dist/sim.wasm', import.meta.url);
if (!existsSync(WASM)) {
  console.log('  SKIP  dist/sim.wasm is not built, so nothing was flown');
} else {
  /*
   * Flown through the real plant, as scripts/wallpin-check.js flies its
   * wall: the block the ticket's craft lay against, on the start straight's
   * north side, met head on low and slow (where the wedge was), let go with
   * the throttle cut or at hover. A craft may not come to rest under the
   * block's face, and wherever it rests it either climbs away with the nose
   * up, or is still and tilted enough that stuckTick sets it down
   * (heldStill). On the base, every throttle cut run lay under the face,
   * upright, and could do neither.
   */
  const seg = L.walls.find((s) => s.a[1] === s.b[1] && s.a[0] < 197.7 && s.b[0] > 197.7 && Math.abs(s.a[1] - 62.95) < 0.01);
  const [ax, , az] = w(seg.a[0], seg.a[1]);
  const [bx] = w(seg.b[0], seg.b[1]);
  const cx = (ax + bx) / 2;
  const caps = placed.solids.filter((s) => s.name === 'barrier' && s.cap && Math.hypot(s.cap[0] - cx, s.cap[2] - az) < 30)
    .map((s) => ({ kind: 'capsule', material: 'wall', ax: s.cap[0], ay: s.cap[1], az: s.cap[2], bx: s.cap[3], by: s.cap[4], bz: s.cap[5], r: s.cap[6] }));
  const world = buildWorld(caps, deriveObstacles, 0);
  const wasmBytes = readFileSync(WASM);
  const diffText = readFileSync(new URL('../configs/betaflight-default.diff', import.meta.url), 'utf8');
  /* The rig's hover stick on the five inch (wallpin-check's). */
  const HOVER = 0.345;
  let flown = 0;
  let under = 0;
  let held = 0;
  const lay = [];
  const left = [];
  for (const h of [0.08, 0.18, 0.35]) {
    for (const speed of [1, 2]) {
      for (const after of [0, HOVER]) {
        const rig = await makeRig({ wasmBytes, diffText, colliders: world.colliders, field: world.field, spawn: V(cx, 0, az + 9), spawnYaw: 0, groundY: 0 });
        rig.hold(200, 0, 0, 0, 0.5);
        rig.settle(V(cx, h, az + 3), Math.PI, 2.5);
        rig.fly(linePath(rig.craft().p, V(cx, h, az - 2), 5 / speed), { heading: Math.PI });
        rig.hold(2500, 0, 0, 0, after);
        if (rig.stats.contacts === 0) {
          continue;
        }
        flown += 1;
        const c = rig.craft();
        const st = rig.state();
        const d = c.p.z - az;
        const v = Math.hypot(st[4], st[5], st[6]);
        const rate = Math.hypot(st[11], st[12], st[13]);
        const isUnder = d > 0 && d < 0.45 && c.p.y < 0.45;
        const setDown = heldStill(c.upZ, v, rate, true, false);
        rig.hold(250, 0, 0.4, 0, 0.6);
        rig.hold(1000, 0, 0, 0, 0.75);
        const away = rig.craft().p.y > 1.2;
        under += isUnder ? 1 : 0;
        held += !away && !setDown ? 1 : 0;
        const says = `${h} m up at ${speed} m/s, ${after ? 'hover' : 'cut'}: ${d.toFixed(2)} m off the axis, ${c.p.y.toFixed(2)} m up, upZ ${c.upZ.toFixed(2)}`;
        if (isUnder) lay.push(says);
        if (!away && !setDown) left.push(says);
      }
    }
  }
  check('the plant flown into the block meets it', flown >= 8, `${flown} of 12 flights touched it`);
  check('no flight comes to rest under the block\'s face', under === 0, under ? `${under}: ${lay.slice(0, 3).join('; ')}` : `${flown} flights`);
  check('and none is left where it can neither climb away nor be set down', held === 0, held ? `${held}: ${left.slice(0, 3).join('; ')}` : `${flown} flights`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
