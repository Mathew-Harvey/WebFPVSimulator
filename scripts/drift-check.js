/*
 * drift-check.js: Drift Matsuri's place and its camera judge, in Node.
 * `npm run check:drift`.
 *
 * THE PLACE (src/maps/drift/): the course is a road the built map can
 * drive with no problem raised, every drift car is driven, no solid stands
 * where a car's tail swings (below a car's roof), the start pad is on the tower's roof, and the
 * same document comes out twice.
 *
 * THE JUDGE (src/game/film.js), against scripted cameras and scripted cars
 * on a straight line, because the scoring is geometry and geometry can be
 * checked: a camera behind a tandem pair, looking at them, smooth, scores
 * and calls the battle in frame; the same camera looking away scores
 * nothing; twitching costs Steady; too far scores nothing; a crash cuts the
 * take and keeps the points; the take is cut at a minute; a money shot is
 * called once a zone; the same feed gives the same take twice.
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

import {
  circuitLayout, FIELD_W, FIELD_D, TOWER, ROAD_WIDTH,
} from '../src/maps/drift/circuit.js';
import { driftDocument, groupIds } from '../src/maps/drift/yard.js';
import { trafficOf } from '../src/maps/built/traffic.js';
import { nearestOn } from '../src/maps/built/road.js';
import {
  Film, FILM_EVERY, TAKE_MS, gradeOf, closeness, framing,
} from '../src/game/film.js';

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

/* ---- the place ---- */
console.log('the place');
const L = circuitLayout();
const doc = driftDocument();
const t = trafficOf(doc);
check('the course raises no road problem', t.problems.length === 0, t.problems.map((p) => p.message).join('; '));
check('a lap is between 600 and 900 m', L.line.length > 600 && L.line.length < 900, `${L.line.length.toFixed(0)} m`);
check('every drift car is driven', t.vehicles.length === 7 && t.vehicles.every((v) => v.drift > 0), `${t.vehicles.length}`);
const groups = groupIds(doc);
check('two tandems and a train', groups.length === 3 && groups[2].ids.length === 3, groups.map((g) => g.ids.length).join(','));

/* A solid's nearest point to the course, plan metres. */
const CLEAR = 7.6;
let nearest = Infinity;
let nearName = '';
for (const p of L.parts) {
  /* What stands clear over a car's roof (the gantry's beam, the torii's)
   * is not in a tail's way. */
  if (!p.solid || (p.t === 'box' ? Math.min(p.lo[1], p.hi[1]) : Math.min(p.a[1], p.b[1]) - p.r) > 3) {
    continue;
  }
  const pts = p.t === 'box'
    ? [[(p.lo[0] + p.hi[0]) / 2, (p.lo[2] + p.hi[2]) / 2], [p.lo[0], p.lo[2]], [p.hi[0], p.hi[2]], [p.lo[0], p.hi[2]], [p.hi[0], p.lo[2]]]
    : [[p.a[0], p.a[2]], [p.b[0], p.b[2]]];
  for (const [x, z] of pts) {
    const d = nearestOn(L.line, x + FIELD_W / 2, FIELD_D / 2 - z).d - (p.r || 0);
    if (d < nearest) {
      nearest = d;
      nearName = p.name;
    }
  }
}
check(`no solid within ${CLEAR} m of the course's middle`, nearest >= CLEAR, `nearest ${nearest.toFixed(2)} m (${nearName})`);
const trees = doc.elements.filter((e) => e.type === 'tree');
const treeNear = Math.min(...trees.map((e) => nearestOn(L.line, e.position.x, e.position.y).d));
check('no tree within 11 m of the course', treeNear >= 11, `${trees.length} trees, nearest ${treeNear.toFixed(1)} m`);
const inFurniture = trees.filter((e) => L.keep.some((k) => Math.hypot(k.x - e.position.x, k.y - e.position.y) < k.r + 2)).length;
check('no tree stands in the furniture', inFurniture === 0, `${L.keep.length} pieces kept clear, ${inFurniture} trees in one`);
/* Every wire and panel runs along the road's edge, never across it: a
 * run whose middle is nearer the course than the walls crosses it. */
const across = L.decor.filter((d) => (d.t === 'fence' || d.t === 'panel')
  && nearestOn(L.line, (d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2).d < ROAD_WIDTH / 2 + 1);
check('no fence crosses the course', across.length === 0, `${across.length} runs across`);
const pad = doc.elements.find((e) => e.type === 'startPads');
check('the start pad is on the tower roof', pad && pad.position.x === TOWER.x && pad.position.z === TOWER.top);
check('the document is the same every build', JSON.stringify(driftDocument()) === JSON.stringify(doc));
check('five zones', L.zones.length === 5, L.zones.map((z) => z.name).join(', '));

/* ---- the judge ---- */
console.log('the judge');

check('closeness: the sweet band is all of it, far is none', closeness(5) === 1 && closeness(40) === 0 && closeness(0.5) < 0.5);
check('framing: the middle is all of it, a corner none', framing(0, 0) === 1 && framing(1, 1) === 0);
check('grades', gradeOf(8000) === 'S' && gradeOf(5200) === 'A' && gradeOf(100) === 'D');

/* Cars on a straight line along +x at 20 m/s, a tandem 8.5 m apart, the
 * camera `back` behind the chase car, `up` over it, looking along +x (or
 * along `look`). Slot 0 is the chase car, slot 1 the lead. */
function poses() {
  const out = [];
  for (let i = 0; i < 64; i += 1) {
    out.push({ on: false, x: 0, y: 0, z: 0, hx: 1, hz: 0, slip: 0 });
  }
  return out;
}
function film(zones = []) {
  const f = new Film();
  f.setLens(Math.tan((75 * Math.PI) / 360), 16 / 9);
  f.setCars([{ slot: 0, group: 0, height: 1.3, label: 'E82' }, { slot: 1, group: 0, height: 1.3, label: 'R32' }]);
  f.setGroups([{ name: 'Tandem', size: 2 }]);
  f.setZones(zones);
  return f;
}
function fly(f, opts = {}) {
  const ps = poses();
  const cam = { x: 0, y: 0, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, rx: 0, ry: 0, rz: 1, p: 0, q: 0, r: 0 };
  const ms = opts.ms ?? 20000;
  const back = opts.back ?? 5;
  const evs = [];
  for (let s = 0; s <= ms; s += FILM_EVERY) {
    const x = 20 * s / 1000;
    ps[0].on = true;
    ps[0].x = x;
    ps[0].slip = opts.slip ?? 0;
    ps[1].on = true;
    ps[1].x = x + 8.5;
    cam.x = x - back;
    cam.y = opts.up ?? 1.5;
    if (opts.away) {
      cam.fx = -1;
      cam.rz = -1;
    }
    const twitch = opts.twitch ? ((s / FILM_EVERY) % 2 ? 2.5 : -2.5) : 0;
    cam.p = twitch;
    cam.q = 0;
    cam.r = 0;
    f.step(s, cam, ps, opts.crashAt != null && s === opts.crashAt);
    const e = f.drainEvents();
    if (e) {
      evs.push(...e);
    }
  }
  return evs;
}

let f = film();
let evs = fly(f);
const good = f.view();
check('behind a tandem, looking at it: the battle is in frame', good.tandem === 2 && good.subject === 'Tandem', `${good.subject} x${good.tandem}`);
check('and it scores about 150 points a second', good.score > 2500 && good.score < 3300, `${good.score.toFixed(0)} in 20 s`);
check('ACTION is called at the start', evs[0] && evs[0].type === 'action');

const f2 = film();
fly(f2, { away: true });
check('looking away scores nothing', f2.view().score === 0 && f2.view().subject === '');

const f3 = film();
fly(f3, { twitch: true });
check('a twitching camera loses most of its Steady', f3.view().smooth < 0.2 && f3.view().score < good.score * 0.5, `smooth ${f3.view().smooth.toFixed(2)}, ${f3.view().score.toFixed(0)}`);

const f4 = film();
fly(f4, { back: 40 });
check('forty metres back scores nothing', f4.view().score === 0);

const f5 = film();
evs = fly(f5, { crashAt: 6000 });
const crash = evs.find((e) => e.type === 'crash');
check('a crash cuts the take', Boolean(crash) && f5.done, crash ? `${crash.summary.seconds} s, ${crash.summary.score}` : 'none');
check('and keeps what was filmed', crash && crash.summary.score > 600 && f5.view().score === crash.summary.score
  || (crash && Math.abs(f5.view().score - crash.summary.score) < 1));

const f6 = film();
evs = fly(f6, { ms: TAKE_MS + 2000 });
const cut = evs.find((e) => e.type === 'cut');
check('the take is cut at a minute', Boolean(cut) && cut.summary.seconds === 60, cut ? `${cut.summary.seconds} s, grade ${cut.summary.grade}` : 'none');

/* A zone round the first 200 m of the line: one money shot, once. */
const f7 = film([{ name: 'Outer zone', x: 100, z: 0, r: 100 }]);
evs = fly(f7);
const money = evs.filter((e) => e.type === 'money');
check('a money shot is called once in a zone', money.length === 1, `${money.length}`);

const f8 = film();
evs = fly(f8, { slip: 0.4, back: 3, up: 0.8 });
check('low behind a sliding car is through the smoke', evs.some((e) => e.type === 'smoke'));

const fa = film();
const fb = film();
fly(fa, { twitch: true });
fly(fb, { twitch: true });
check('the same feed gives the same take', fa.view().score === fb.view().score);

/* The judge's cost: seven cars, a feed. */
const fc = film();
fc.setCars([0, 1, 2, 3, 4, 5, 6].map((k) => ({ slot: k, group: k < 2 ? 0 : (k < 4 ? 1 : 2), height: 1.3 })));
fc.setGroups([{ name: 'Tandem', size: 2 }, { name: 'Tandem', size: 2 }, { name: 'Train', size: 3 }]);
const ps = poses();
for (let k = 0; k < 7; k += 1) {
  ps[k].on = true;
  ps[k].x = 5 + k * 8;
}
const cam = { x: 0, y: 1.5, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, rx: 0, ry: 0, rz: 1, p: 0, q: 0, r: 0 };
const N = 200000;
const t0 = process.hrtime.bigint();
for (let s = 0; s < N; s += 1) {
  fc.step(s * FILM_EVERY % TAKE_MS, cam, ps, false);
}
const us = Number(process.hrtime.bigint() - t0) / 1000 / N;
check('a feed costs under 5 microseconds', us < 5, `${us.toFixed(2)} us`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
