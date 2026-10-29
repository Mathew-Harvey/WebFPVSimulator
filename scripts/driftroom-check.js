/*
 * driftroom-check.js: Drift Matsuri in a room (src/game/driftroom.js),
 * proved in plain Node. Two pages, the host's flying two bots, and a
 * board in a few lines that keeps each take's score as src/rooms.js
 * driftMessage does. It holds that:
 *
 *   - every take this page judges is said to the room, the host's bots'
 *     too, and every take is cut by one minute and a second
 *   - a score said only goes up, and is said no more than four times a
 *     second for any take, the board's limit
 *   - both pages end on the same table and the same winner
 *   - a feed costs little, and the wire carries little
 *
 * The cars are two, circling, with a judge of the drift map's shape; the
 * real map's cars are the browser check's (scripts/minigames-check.js).
 *
 * Usage: node scripts/driftroom-check.js
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

import { DOGFIGHT_EVERY } from '../src/game/dogfight.js';
import { DriftRoom } from '../src/game/driftroom.js';
import { Film } from '../src/game/film.js';

let failures = 0;

function check(name, ok, detail = '') {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

function judge() {
  const film = new Film();
  film.setCars([{ slot: 0, group: 0, height: 1.3 }, { slot: 1, group: 0, height: 1.3 }]);
  film.setGroups([{ name: 'A', size: 2 }]);
  film.setZones([{ name: 'z', x: 0, z: 0, r: 10 }]);
  return film;
}

let t = 0;
/* Two cars chasing round a 10 m circle, sliding. */
function onCircle(a) {
  return { s: Math.sin(a), c: Math.cos(a) };
}
function poses() {
  const out = [];
  for (const lag of [0, 0.4]) {
    const { s, c } = onCircle(t / 1000 - lag);
    out.push({
      on: true, x: 10 * c, y: 0, z: 10 * s, hx: -s, hz: c, vx: -10 * s, vz: 10 * c, slip: 0.5,
    });
  }
  return out;
}

const world = {
  k: 1,
  cruise: 20,
  cx: 0,
  cy: 0,
  cz: 0,
  radius: 200,
  top: 50,
  spawns: [{ x: 20, y: 5, z: 20 }, { x: -20, y: 5, z: 20 }],
  floorAt: () => 0,
  blocked: () => -1,
};
const now = () => t;
const A = new DriftRoom(world, { now, seed: 1, pen: { film: judge(), poses } });
const B = new DriftRoom(world, { now, seed: 2, pen: { film: judge(), poses } });
const BOTS = [{ id: 201, name: 'MOCHI', skill: 'ace' }, { id: 202, name: 'GIZMO', skill: 'pilot' }];
A.setYou(1, true);
B.setYou(2, false);
A.setBots(BOTS);
B.setBots(BOTS);

const rows = new Map([1, 2, 201, 202].map((id) => [id, { score: 0, done: false }]));
let phase = 'live';
let winner = null;
let went = 0;
let bytes = 0;
let down = 0;
let tooFast = 0;
const saidAt = new Map();
const state = () => ({
  phase, n: 1, goAt: 0, endAt: 68000, winner, rows: [...rows].map(([id, r]) => ({ id, ...r })),
});
A.heard(state(), (x) => x);
B.heard(state(), (x) => x);
const me = {
  x: 0, y: 5, z: 30, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, flying: true,
};
let cost = 0;
let feeds = 0;
console.log('drift room: two pages, two bots on the host\'s');
while (phase === 'live' && t < 75000) {
  t += DOGFIGHT_EVERY;
  for (const [P, you] of [[A, 1], [B, 2]]) {
    const t0 = performance.now();
    P.step(me);
    cost += performance.now() - t0;
    feeds += 1;
    for (const m of P.takeOutbox() || []) {
      if (m.t !== 'drReel') {
        continue;
      }
      went += 1;
      bytes += JSON.stringify(m).length;
      const by = m.by === undefined ? you : m.by;
      const r = rows.get(by);
      if (m.score < r.score) {
        down += 1;
      }
      const last = saidAt.get(by);
      if (!m.done && last !== undefined && t - last < 250) {
        tooFast += 1;
      }
      saidAt.set(by, t);
      r.score = Math.max(r.score, m.score);
      r.done = r.done || m.done;
      (P === A ? B : A).heardReel({ ...m, by });
    }
  }
  if ([...rows.values()].every((r) => r.done)) {
    phase = 'results';
    let best = -1;
    for (const [id, r] of rows) {
      if (r.score > best) {
        best = r.score;
        winner = id;
      }
    }
  }
}
A.heard(state(), (x) => x);
B.heard(state(), (x) => x);

check('every take is cut, the bots\' too', phase === 'results', `${(t / 1000).toFixed(1)} s`);
check('by a minute and a second', t <= 61000 + 2 * DOGFIGHT_EVERY, `${t} ms`);
check('the bots filmed something', rows.get(201).score > 0 && rows.get(202).score > 0, `${rows.get(201).score}, ${rows.get(202).score}`);
check('a score said never goes down', down === 0, `${down}`);
check('and is said no more than four times a second', tooFast === 0, `${tooFast}`);
const table = (P) => P.standings().filter((r) => P.isBot[r.slot]).map((r) => `${P.idAt(r.slot)}:${r.reel}`).join(' ');
check('both pages end on the same table', table(A) === table(B), `${table(A)} / ${table(B)}`);
check('and the same winner', A.over && B.over && A.idAt(A.winner) === winner && B.idAt(B.winner) === winner, `${winner}`);
const us = (1000 * cost) / feeds;
check('a feed is cheap', us < 200, `${us.toFixed(1)} µs`);
const perSecond = bytes / (t / 1000);
check('the wire carries little', perSecond < 1000, `${Math.round(perSecond)} B/s from both pages, ${went} messages`);

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
