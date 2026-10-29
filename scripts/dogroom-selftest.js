/*
 * dogroom-selftest.js: a dogfight in a room, two pages and a board in one
 * process. Page A is the host and flies two bots; page B is another pilot.
 * The board here is a small stand in for the real one's dogfightMessage
 * (the board's own src/rooms-test.js checks the real one): it believes
 * every hit and keeps health, so what is checked is the simulator's half:
 * who judges which shot, what goes on the wire, and that both pages end up
 * agreeing. Run: node scripts/dogroom-selftest.js
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

import { DogfightRoom } from '../src/game/dogroom.js';
import { ME, HITS, SHIELD_MS, DOGFIGHT_EVERY } from '../src/game/dogfight.js';

let failed = 0;
let passed = 0;
function check(ok, what, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${what}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${what}${detail ? `: ${detail}` : ''}`);
  }
}

console.log('dogroom selftest');

/* An open field with one wall, as the dogfight self test's. */
function world() {
  return {
    k: 1,
    cruise: 24,
    cx: 0,
    cy: 2,
    cz: 0,
    radius: 120,
    top: 40,
    spawns: [
      { x: 30, y: 8, z: 0 }, { x: -30, y: 8, z: 0 }, { x: 0, y: 8, z: 30 }, { x: 0, y: 8, z: -30 },
    ],
    floorAt() {
      return 0;
    },
    blocked() {
      return -1;
    },
  };
}

/* A craft's quaternion from its nose (-Z) and up (+Y), square roots only. */
function quat(fx, fy, fz, ux, uy, uz, out) {
  /* Columns: right = up x back, up, back = -nose. */
  const bx = -fx; const by = -fy; const bz = -fz;
  const rx = uy * bz - uz * by;
  const ry = uz * bx - ux * bz;
  const rz = ux * by - uy * bx;
  const tr = rx + uy + bz;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    out.qw = 0.25 * s;
    out.qx = (uz - by) / s;
    out.qy = (bx - rz) / s;
    out.qz = (ry - ux) / s;
  } else if (rx > uy && rx > bz) {
    const s = Math.sqrt(1 + rx - uy - bz) * 2;
    out.qw = (uz - by) / s;
    out.qx = 0.25 * s;
    out.qy = (ux + ry) / s;
    out.qz = (bx + rz) / s;
  } else if (uy > bz) {
    const s = Math.sqrt(1 + uy - rx - bz) * 2;
    out.qw = (bx - rz) / s;
    out.qx = (ux + ry) / s;
    out.qy = 0.25 * s;
    out.qz = (by + uz) / s;
  } else {
    const s = Math.sqrt(1 + bz - rx - uy) * 2;
    out.qw = (ry - ux) / s;
    out.qx = (bx + rz) / s;
    out.qy = (by + uz) / s;
    out.qz = 0.25 * s;
  }
  return out;
}

const clock = { t: 1000 };
const now = () => clock.t;
const toLocal = (ms) => ms;
const A = new DogfightRoom(world(), { now, seed: 11 });
const B = new DogfightRoom(world(), { now, seed: 22 });
const YOU_A = 1;
const YOU_B = 2;
const BOTS = [{ id: 201, name: 'MOCHI', skill: 'ace' }, { id: 202, name: 'GIZMO', skill: 'ace' }];
A.setYou(YOU_A, true);
B.setYou(YOU_B, false);
A.setBots(BOTS);

/* The stand in board. */
const board = {
  n: 0,
  rows: new Map(),
  sent: { dfHit: 0, dfGun: 0, dfLaunch: 0, byBot: 0 },
  state(phase) {
    return {
      phase,
      hits: 'arcade',
      round: 'none',
      n: this.n,
      goAt: this.goAt,
      endAt: 0,
      winner: null,
      rows: [...this.rows].map(([id, r]) => ({
        id, hp: r.backAt ? 0 : r.hp, pops: r.pops, popped: r.popped, dealt: r.dealt, backAt: r.backAt,
      })),
    };
  },
  start() {
    this.n += 1;
    this.goAt = clock.t + 5000;
    this.rows = new Map([YOU_A, YOU_B, 201, 202].map((id) => [id, {
      hp: HITS.arcade.hp, pops: 0, popped: 0, dealt: 0, backAt: 0, shieldUntil: this.goAt + SHIELD_MS,
    }]));
  },
  /* from: the page that sent it, and the room id it speaks as. */
  take(page, you, msg) {
    if (msg.n !== this.n) return;
    const by = msg.by !== undefined ? msg.by : you;
    if (msg.t === 'dfGun' || msg.t === 'dfLaunch') {
      this.sent[msg.t] += 1;
      const out = { ...msg, by };
      for (const p of [A, B]) {
        if (p !== page) {
          if (msg.t === 'dfGun') p.heardGun(out);
          else p.heardLaunch(out);
        }
      }
      return;
    }
    if (msg.t !== 'dfHit') return;
    this.sent.dfHit += 1;
    if (msg.by !== undefined) this.sent.byBot += 1;
    const t = clock.t;
    const shooter = this.rows.get(by);
    const target = this.rows.get(msg.to);
    for (const r of this.rows.values()) {
      if (r.backAt && t >= r.backAt) {
        r.backAt = 0;
        r.hp = HITS.arcade.hp;
      }
    }
    if (!shooter || !target || shooter.backAt || target.backAt || t < target.shieldUntil) return;
    const took = Math.min(msg.d, target.hp);
    target.hp -= took;
    shooter.dealt += took;
    const pop = target.hp <= 0;
    if (pop) {
      target.popped += 1;
      target.backAt = t + HITS.arcade.backMs;
      target.shieldUntil = target.backAt + SHIELD_MS;
      shooter.pops += 1;
    }
    const out = {
      t: 'dfHit', n: this.n, by, to: msg.to, w: msg.w, d: took, hp: target.hp, pop, backAt: target.backAt,
    };
    A.heardHit(out, toLocal);
    B.heardHit(out, toLocal);
  },
};

/* A hovers at the middle; B flies a circle round it at 20 m. */
const meA = {
  x: 0, y: 6, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
};
const meB = {
  x: 20, y: 6, z: 0, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
};
const pose = {
  px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false,
};
function posed(x, y, z, fx, fy, fz, ux, uy, uz) {
  pose.px = x; pose.py = y; pose.pz = z;
  return quat(fx, fy, fz, ux, uy, uz, pose);
}

board.start();
A.heard(board.state('count'), toLocal);
B.heard(board.state('count'), toLocal);
check(A.inFight[ME] && B.inFight[ME] && A.inFight[A.slotOf(201)], 'both pages put everybody in the round, the bots too');
check(A.puppet[A.slotOf(201)] === 0 && A.isBot[A.slotOf(201)] === 1, 'the host flies its bots');

let cx = 1;
let cz = 0;
let launchesSeenOnB = 0;
let incomingOnB = 0;
let poppedB = 0;
let goneLive = false;
for (let n = 0; n < 9000; n += 1) {
  clock.t += DOGFIGHT_EVERY;
  if (!goneLive && clock.t >= board.goAt) {
    goneLive = true;
    A.heard(board.state('live'), toLocal);
    B.heard(board.state('live'), toLocal);
  }
  const st = (20 * 0.01) / 20;
  const nx = cx - cz * st;
  const nz = cz + cx * st;
  const m = Math.sqrt(nx * nx + nz * nz);
  cx = nx / m;
  cz = nz / m;
  meB.x = cx * 20;
  meB.z = cz * 20;
  /* B looks in at A as it circles, and holds its gun down. */
  meB.fx = -cx;
  meB.fz = -cz;
  meB.gun = true;
  /* What each page draws of the other this frame. */
  A.remote(YOU_B, posed(meB.x, meB.y, meB.z, meB.fx, meB.fy, meB.fz, 0, 1, 0), { handle: 'Lou' });
  B.remote(YOU_A, posed(meA.x, meA.y, meA.z, meA.fx, meA.fy, meA.fz, 0, 1, 0), { handle: 'Host' });
  A.eachFlown((id, x, y, z, fx, fy, fz, ux, uy, uz) => {
    const name = BOTS.find((b) => b.id === id).name;
    B.remote(id, posed(x, y, z, fx, fy, fz, ux, uy, uz), { handle: name, bot: true, skill: 'ace' });
  });
  A.step(meA);
  B.step(meB);
  for (const [page, you] of [[A, YOU_A], [B, YOU_B]]) {
    const out = page.takeOutbox();
    if (out) {
      for (const msg of out) board.take(page, you, msg);
    }
  }
  for (let e = 0; e < B.eventCount; e += 1) {
    const ev = B.events[e];
    if (ev.type === 'launch' && ev.to === ME) launchesSeenOnB += 1;
    if (ev.type === 'pop' && ev.to === ME) poppedB += 1;
  }
  if (B.incoming(ME) >= 0) incomingOnB += 1;
  A.eventCount = 0;
  B.eventCount = 0;
}

check(board.sent.byBot > 0, 'the host sends its bots\' hits, naming the bot', `${board.sent.byBot}`);
check(board.sent.dfHit > board.sent.byBot, 'and each page sends its own pilot\'s', `${board.sent.dfHit - board.sent.byBot}`);
check(board.sent.dfGun > 0, 'guns going on and off are told to the others', `${board.sent.dfGun}`);
check(poppedB > 0, 'the bots pop the other page\'s pilot, and that page is told', `${poppedB} times`);
check(launchesSeenOnB === 0 || incomingOnB > 0, 'a bot\'s missile at the other pilot is flown on that page, so it can be beaten',
  `${launchesSeenOnB} launches, ${incomingOnB} feeds incoming`);
const sB = B.slotOf(YOU_A);
const sA = A.slotOf(YOU_B);
check(A.pops[ME] === B.pops[sB] && B.pops[ME] === A.pops[sA], 'both pages agree on everybody\'s pops',
  `A ${A.pops[ME]}/${B.pops[sB]}, B ${B.pops[ME]}/${A.pops[sA]}`);
const b1A = A.slotOf(201);
const b1B = B.slotOf(201);
check(A.pops[b1A] === B.pops[b1B] && A.popped[b1A] === B.popped[b1B], 'and on the bots\'',
  `${A.pops[b1A]}/${B.pops[b1B]} pops, ${A.popped[b1A]}/${B.popped[b1B]} popped`);
check(B.puppet[b1B] === 1 && B.nameOf(b1B) === 'MOCHI', 'the other page draws the bots as puppets, by name');

/* The host leaves: B becomes the host and flies the bots from where they
 * were. */
B.setYou(YOU_B, true);
B.setBots(BOTS);
const wasX = B.x[b1B];
check(B.puppet[b1B] === 0, 'a page that becomes the host takes the bots on');
for (let n = 0; n < 200; n += 1) {
  clock.t += DOGFIGHT_EVERY;
  B.step(meB);
  B.eventCount = 0;
}
check(Math.abs(B.x[b1B] - wasX) > 0.5, 'and flies them', `${(B.x[b1B] - wasX).toFixed(1)} m`);

/* Results from the board end the round on every page. */
B.heard(board.state('results'), toLocal);
check(B.over && !B.running, 'results from the board end the round');

/* Cost: the host with two bots and a room of eight others. */
{
  const H = new DogfightRoom(world(), { now, seed: 5 });
  H.setYou(1, true);
  H.setBots([{ id: 201, name: 'A', skill: 'ace' }, { id: 202, name: 'B', skill: 'ace' }, { id: 203, name: 'C', skill: 'pilot' }]);
  board.start();
  board.rows = new Map([1, 201, 202, 203, 10, 11, 12, 13, 14, 15, 16, 17].map((id) => [id, {
    hp: 100, pops: 0, popped: 0, dealt: 0, backAt: 0, shieldUntil: 0,
  }]));
  for (let id = 10; id < 18; id += 1) {
    H.remote(id, posed(id * 3 - 40, 6, 10, 1, 0, 0, 0, 1, 0), { handle: `P${id}` });
  }
  H.heard(board.state('live'), (ms) => ms - 5000);
  const me = {
    x: 0, y: 6, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: true, gun: true, missile: false,
  };
  for (let n = 0; n < 500; n += 1) {
    clock.t += DOGFIGHT_EVERY;
    for (let id = 10; id < 18; id += 1) {
      H.remote(id, posed(id * 3 - 40, 6, 10, 1, 0, 0, 0, 1, 0), null);
    }
    H.step(me);
    H.takeOutbox();
    H.eventCount = 0;
  }
  const t0 = process.hrtime.bigint();
  const N = 2000;
  for (let n = 0; n < N; n += 1) {
    clock.t += DOGFIGHT_EVERY;
    for (let id = 10; id < 18; id += 1) {
      H.remote(id, posed(id * 3 - 40, 6, 10, 1, 0, 0, 0, 1, 0), null);
    }
    H.step(me);
    H.takeOutbox();
    H.eventCount = 0;
  }
  const us = Number(process.hrtime.bigint() - t0) / 1000 / N;
  console.log(`  cost  ${us.toFixed(2)} us a feed, host, 3 bots and 8 others`);
  check(us < 60, 'a room feed stays cheap', `${us.toFixed(1)} us`);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
