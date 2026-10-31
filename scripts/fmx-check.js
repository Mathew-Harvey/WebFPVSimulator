/*
 * fmx-check.js: Shiroyama FMX's place and its riders, in Node.
 * `npm run check:fmx`.
 *
 * The loop raises no road problem and four riders are driven round it at
 * TOP; the gap from lip to knuckle is in the 20 to 30 m the map was asked
 * for; every flight clears the ground under it, lands on the landing's
 * face and not on the deck or the flat, and is back square to the slope
 * before the wheels touch; the ride is the same number twice; the named
 * gaps are well formed; the pilot's start is on open ground; every solid is
 * drawn by ./dress.js and not by the kit; the hidden logo is on the
 * yagura's skirt; and the same document comes out twice.
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

import { fmxTraffic, TOP } from '../src/maps/fmx/traffic.js';
import { fmxDocument, SPAWN } from '../src/maps/fmx/yard.js';
import {
  rideAt, groundAt, SETS, FLIGHT_X, LAP, LEAN_MAX,
} from '../src/maps/fmx/profile.js';
import {
  arenaLayout, w, SET, LANDING, KONEX, YAGURA,
} from '../src/maps/fmx/arena.js';

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

const f = fmxTraffic();
check('the loop raises no road problem', f.traffic.problems.length === 0, f.traffic.problems.map((p) => p.message).join('; '));
check('four riders, every one driven at TOP', f.bikes.length === 4 && f.traffic.vehicles.length === 4 && f.traffic.vehicles.every((v) => v.topSpeed === TOP));
check('the module\'s loop is the profile\'s lap', Math.abs(f.lanes[0].length - LAP) < 0.5, `${f.lanes[0].length.toFixed(2)} and ${LAP.toFixed(2)} m`);

const gap = SET.knuckle - SET.lip;
check('lip to knuckle is a 20 to 30 m gap', gap >= 20 && gap <= 30, `${gap.toFixed(1)} m`);
check('the flight lands past the knuckle and on the face', FLIGHT_X > gap && FLIGHT_X < SET.end - SET.lip, `${FLIGHT_X.toFixed(2)} m from the lip`);

const o = {};
const o2 = {};
let clear = Infinity;
let apex = 0;
let twice = 0;
let square = 0;
for (const S of SETS) {
  for (let slot = 0; slot < 4; slot += 1) {
    for (let lap = 0; lap < 12; lap += 1) {
      for (let x = 0.05; x < FLIGHT_X - 0.05; x += 0.1) {
        rideAt(slot, lap, S.a + x, TOP, 0, o);
        rideAt(slot, lap, S.a + x, TOP, 0, o2);
        if (o.dy !== o2.dy || o.pitch !== o2.pitch || o.yaw !== o2.yaw || o.roll !== o2.roll) {
          twice += 1;
        }
        clear = Math.min(clear, o.dy - groundAt(S.a + x));
        apex = Math.max(apex, o.dy);
      }
      /* Just before touchdown: no rotation left over. */
      rideAt(slot, lap, S.a + FLIGHT_X - 0.02, TOP, 0, o);
      const TWO_PI = 6.283185307179586;
      const wrap = (a) => a - TWO_PI * Math.round(a / TWO_PI);
      if (Math.abs(wrap(o.yaw)) > 0.15 || Math.abs(wrap(o.pitch) + LANDING.slope / (1 + 0.28 * LANDING.slope * LANDING.slope)) > 0.3) {
        square += 1;
      }
    }
  }
}
check('the ride is the same number twice', twice === 0, `${twice} differ`);
check('every flight clears the ground under it', clear > 0, `${clear.toFixed(2)} m at the closest`);
check('the apex is a show jump, 8 to 12 m up', apex > 8 && apex < 12, `${apex.toFixed(2)} m`);
check('every trick is square to the slope at touchdown', square === 0, `${square} of ${SETS.length * 48} land crooked`);
const end = {};
for (const S of SETS) {
  rideAt(0, 0, S.a + FLIGHT_X, TOP, 0, end);
}
check('a rider on the ground is back on the landing', end.air === 0 && end.dy > 0 && end.dy < LANDING.h, `${end.dy.toFixed(2)} m`);
let lean = 0;
for (let s = 0; s < LAP; s += 0.5) {
  rideAt(1, 3, s, TOP, 1 / 12, o);
  if (!o.air) {
    lean = Math.max(lean, Math.abs(o.roll));
  }
}
check('the lean on the ground is bounded', lean <= LEAN_MAX + 1e-9, `${lean.toFixed(2)} rad`);

const L = arenaLayout();
check('every solid is drawn by dress.js, none by the kit', L.parts.every((p) => !p.draw), `${L.parts.length} parts`);
const sp = w(SPAWN.x, SPAWN.y, 0);
const over = L.parts.filter((p) => p.t === 'box' && sp[0] > p.lo[0] - 2 && sp[0] < p.hi[0] + 2 && sp[2] > p.lo[2] - 2 && sp[2] < p.hi[2] + 2);
check('the start is on open ground, 2 m clear of any box', over.length === 0, over.map((p) => p.name).join(', '));
check('the logo is on the yagura\'s skirt, under its deck', Math.abs(KONEX.p[1] - (YAGURA.deckY - YAGURA.skirt / 2)) < 1e-9 && KONEX.n[0] === -1);

const d1 = JSON.stringify(fmxDocument());
const d2 = JSON.stringify(fmxDocument());
check('the same document comes out twice', d1 === d2);
const doc = JSON.parse(d1);
const gaps = doc.elements.filter((e) => e.type === 'gap');
const POINTS = new Set([100, 250, 500, 1000, 2500]);
check('nine named gaps', gaps.length === 9, `${gaps.length}`);
check('every gap has a name, points, a width and a height', gaps.every((g) => g.name && POINTS.has(g.points) && g.dims.width > 1 && g.dims.height > 0.5), gaps.filter((g) => !(g.dims.width > 1 && g.dims.height > 0.5)).map((g) => g.name).join(', '));
check('no two gaps share a name', new Set(gaps.map((g) => g.name)).size === gaps.length);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
