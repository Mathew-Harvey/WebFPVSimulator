/*
 * ball-selftest.js: Quad Ball's pure game (src/game/quadball.js) and its
 * arena, driven in Node with no browser: the ball's bounce, a goal, a
 * quad's hit, a bots' match to the end, and the same seed twice.
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
  BallRound, arenaStep, normaliseBallRules, BALL, KICK_MS, GOAL_MS, BALL_ROUNDS,
} from '../src/game/quadball.js';
import { ME } from '../src/game/dogfight.js';
import { ARENA } from '../src/maps/ball/arena.js';

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

function world(k = 1) {
  return {
    k,
    cruise: 24,
    cx: 0,
    cy: 2 * k,
    cz: 0,
    radius: 80 * k,
    top: 30 * k,
    spawns: [{ x: 30, y: 8, z: 0 }, { x: -30, y: 8, z: 0 }, { x: 0, y: 8, z: 20 }],
    floorAt() {
      return 0;
    },
    blocked() {
      return -1;
    },
    inside() {
      return false;
    },
    arena: ARENA,
  };
}

const ball = (o) => ({
  x: 0, y: 5, z: 0, vx: 0, vy: 0, vz: 0, ...o,
});

console.log('arena');
{
  const b = ball({ y: 12 });
  let low = 99;
  for (let i = 0; i < 600; i += 1) {
    arenaStep(b, 1.5, 1, ARENA, 0.01);
    low = Math.min(low, b.y);
  }
  check(low >= 1.5 - 1e-9, 'a dropped ball stays above the floor', `${low}`);
  check(Math.abs(b.vy) < 12, 'and loses height at each bounce', `${b.vy}`);
}
{
  const b = ball({ x: 40, vx: 30, vz: 18 });
  let hit = 0;
  for (let i = 0; i < 400; i += 1) {
    hit = arenaStep(b, 1.5, 1, ARENA, 0.01) || hit;
  }
  check(hit === 0 && Math.abs(b.x) <= ARENA.hx && Math.abs(b.z) <= ARENA.hz, 'a ball shot at the wall off the mouth bounces', `${b.x},${b.z}`);
}
{
  const b = ball({ x: 40, y: 3, vx: 30 });
  let side = 0;
  for (let i = 0; i < 100 && !side; i += 1) {
    side = arenaStep(b, 1.5, 1, ARENA, 0.01);
  }
  check(side === 1, 'a ball shot at the east mouth is a goal in the east goal', `${side}`);
  const c = ball({ x: -40, y: 3, vx: -30 });
  let w = 0;
  for (let i = 0; i < 100 && !w; i += 1) {
    w = arenaStep(c, 1.5, 1, ARENA, 0.01);
  }
  check(w === -1, 'and the west one', `${w}`);
}
{
  const b = ball({ x: 40, y: 14, vx: 30 });
  let side = 0;
  for (let i = 0; i < 100; i += 1) {
    side = arenaStep(b, 1.5, 1, ARENA, 0.01) || side;
  }
  check(side === 0, 'a ball over the lintel is not a goal', `${side}`);
}

console.log('rules');
{
  const r = normaliseBallRules({ size: 9, skill: 'x', round: 'y' });
  check(r.size === 2 && r.skill === 'rookie' && r.round === '3m' && r.game === 'ball', 'bad rules fall back');
  const g = new BallRound(world(), { size: 3 }, 1);
  check(g.inFight.reduce((a, v) => a + v, 0) === 6, '3 a side is six in the match');
  check(g.team[0] === 0 && g.team[2] === 0 && g.team[3] === 1 && g.team[5] === 1, 'the pilot and two bots are pink, three bots mint');
}

console.log('a hit');
{
  const g = new BallRound(world(), { size: 1 }, 7);
  const me = (x, flying = true) => ({
    x, y: 1.6, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying, gun: false, missile: false,
  });
  /* Start the clock, wait out the countdown with the pilot parked. */
  for (let i = 0; i < KICK_MS / 10 + 20; i += 1) {
    g.step(me(-30), i === 0);
  }
  check(g.inPlay, 'the ball is live after the countdown');
  g.ball.x = 0; g.ball.y = 1.6; g.ball.z = 0; g.ball.vx = 0; g.ball.vy = 0; g.ball.vz = 0;
  let x = -8;
  let top = 0;
  for (let i = 0; i < 80; i += 1) {
    x += 0.2;
    g.step(me(x), false);
    top = Math.max(top, g.ball.vx);
  }
  check(top > 20, 'a quad at 20 m/s sends the ball away faster than that', `${top}`);
  check(g.touches[ME] >= 1 && g.lastTouch === ME, 'the touch is the pilot\'s', `${g.touches[ME]}`);
}

console.log('a bots\' match');
function match(seed, size, skill) {
  const g = new BallRound(world(), { size, skill, round: '3m' }, seed);
  const me = {
    x: -50, y: 12, z: 20, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
  };
  let bad = 0;
  let steps = 0;
  const goals = [];
  while (!g.over && steps < 60000) {
    g.step(me, steps === 0);
    steps += 1;
    const b = g.ball;
    if (!Number.isFinite(b.x + b.y + b.z) || Math.abs(b.x) > ARENA.hx + ARENA.gd + 2 || Math.abs(b.z) > ARENA.hz + 1 || b.y > ARENA.ceil + 1 || b.y < 0) {
      bad += 1;
    }
    for (let i = 0; i < g.cap; i += 1) {
      if (g.inFight[i] && !Number.isFinite(g.x[i] + g.y[i] + g.z[i])) {
        bad += 1;
      }
    }
    for (let e = 0; e < g.eventCount; e += 1) {
      if (g.events[e].type === 'goal') {
        goals.push(g.events[e].to);
      }
    }
    g.eventCount = 0;
  }
  return { g, steps, bad, goals };
}
{
  const a = match(11, 2, 'ace');
  check(a.bad === 0, 'a 2v2 ace match keeps the ball and the bots finite and inside', `${a.bad}`);
  check(a.g.over, 'it ends', `${a.steps}`);
  check(a.goals.length > 0, 'and the bots score', `${a.goals.length} goals, ${a.g.teamScore[0]}-${a.g.teamScore[1]}`);
  const t = a.g.touches.reduce((s, v) => s + v, 0);
  check(t > 10, 'and they touch the ball', `${t}`);
  const b = match(11, 2, 'ace');
  check(a.steps === b.steps && a.g.teamScore[0] === b.g.teamScore[0] && a.g.teamScore[1] === b.g.teamScore[1], 'the same seed plays the same match');
  check(a.g.winnerTeam === (a.g.teamScore[0] > a.g.teamScore[1] ? 0 : 1) || a.g.teamScore[0] === a.g.teamScore[1], 'the winner is the leader');
  const c = match(5, 1, 'pilot');
  check(c.bad === 0 && c.g.over, '1v1 plays through', `${c.g.teamScore[0]}-${c.g.teamScore[1]}`);
  const d = match(9, 3, 'rookie');
  check(d.bad === 0 && d.g.over, '3v3 rookies play through', `${d.g.teamScore[0]}-${d.g.teamScore[1]}`);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
