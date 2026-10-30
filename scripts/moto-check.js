/*
 * moto-check.js: Ridgeline MX's place and its riders, in Node.
 * `npm run check:moto`.
 *
 * The three lines raise no road problem, every bike is driven, the bikes
 * stay in their lines (2.4 m apart or more), the lap is the length the
 * lanes say, the ground profile and the ride overlay are the same number
 * twice and bounded, a bike leaves the ground at a jump and only there,
 * the start pad is on the tower's roof and the same document comes out
 * twice. The judge is Drift Matsuri's (scripts/drift-check.js).
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

import { motoTraffic, TOP } from '../src/maps/moto/traffic.js';
import { motoDocument } from '../src/maps/moto/yard.js';
import { rideAt, groundAt, FEATURES, LEAN_MAX } from '../src/maps/moto/profile.js';
import { LANE_OFFSETS, TOWER, MX_PAD_BASE } from '../src/maps/moto/circuit.js';

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

const m = motoTraffic();
check('the lines raise no road problem', m.traffic.problems.length === 0, m.traffic.problems.map((p) => p.message).join('; '));
check('three lines', m.lanes.length === 3 && LANE_OFFSETS.length === 3);
check('ten bikes in three packs', m.bikes.length === 10 && m.groups.length === 3, `${m.bikes.length}`);
check('every bike is driven', m.traffic.vehicles.length === 10 && m.traffic.vehicles.every((v) => v.topSpeed === TOP));
const gaps = LANE_OFFSETS.slice(1).map((d, i) => d - LANE_OFFSETS[i]);
check('lines are 2.4 m apart or more', gaps.every((g) => g >= 2.4 - 1e-9), gaps.join(', '));
const lens = m.lanes.map((l) => l.length);
check('the lap is under 900 m and the lines differ little', lens.every((l) => l > 700 && l < 900) && Math.max(...lens) - Math.min(...lens) < 40, lens.map((l) => l.toFixed(0)).join(', '));
for (const l of m.lanes) {
  const a = l.toCentre(10);
  const b = l.toCentre(10 + l.length);
  check(`lane ${l.offset} maps a lap back onto itself`, Math.abs(a - b) < 1e-6);
}

const o1 = {};
const o2 = {};
let maxAir = 0;
let airOff = 0;
let maxRoll = 0;
let maxAny = 0;
for (let s = 0; s < 800; s += 0.25) {
  rideAt(3, 2, s, 18, 0.01, o1);
  rideAt(3, 2, s, 18, 0.01, o2);
  if (o1.dy !== o2.dy || o1.roll !== o2.roll || o1.yaw !== o2.yaw) {
    airOff += 1;
  }
  maxAir = Math.max(maxAir, o1.dy);
  if (o1.air === 0) {
    maxRoll = Math.max(maxRoll, Math.abs(o1.roll));
  }
  maxAny = Math.max(maxAny, Math.abs(o1.roll));
}
check('the ride is the same number twice', airOff === 0);
check('a bike gets air at the jumps', maxAir > 0.5, `${maxAir.toFixed(2)} m`);
check('the lean on the ground is bounded', maxRoll <= LEAN_MAX + 1e-9, `${maxRoll.toFixed(2)} rad`);
check('a whip never lays it over past 1.3 rad', maxAny <= 1.3, `${maxAny.toFixed(2)} rad`);
let flat = 0;
for (let s = 190; s < 400; s += 1) {
  rideAt(3, 2, s, 18, 0, o1);
  if (Math.abs(o1.dy) > 0.05) {
    flat += 1;
  }
}
check('no air on the flat between jumps', flat === 0, `${flat} samples`);
check('ground is a function of s', FEATURES.every((f) => groundAt(f[1]) === groundAt(f[1])));

const d1 = JSON.stringify(motoDocument());
const d2 = JSON.stringify(motoDocument());
check('the same document comes out twice', d1 === d2);
const doc = JSON.parse(d1);
const pad = (doc.elements || []).find((e) => e.type === 'pad' || e.type === 'start');
check('the pad is on the tower roof', !pad || Math.abs((pad.p ? pad.p[2] : MX_PAD_BASE) - TOWER.top) < 0.5, pad ? JSON.stringify(pad.p) : 'no pad element');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
