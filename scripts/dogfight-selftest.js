/*
 * dogfight-selftest.js: src/game/dogfight.js in Node, on a made up world.
 *
 * The game is pure, so everything it promises can be asked of it without a
 * browser: the same seed and the same craft path give the same fight to the
 * bit, the bots keep off the floor and never pass through a wall, a gun hit
 * does less the farther it flew and more from behind, a locked missile
 * homes and a straight one does not, a popped pilot comes back when the
 * rules say, a round ends on its clock, and a step with seven bots and the
 * gun held costs what the plan says it may.
 *
 * Usage: node scripts/dogfight-selftest.js
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
  Dogfight, GUN, MISSILE, HITS, ME, MAX_PILOTS, DOGFIGHT_EVERY, SKILLS,
} from '../src/game/dogfight.js';
import { ATTACK, EXTEND, PATROL } from '../src/game/dogbrain.js';

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

/* A flat field with one wall across it: x 40 to 42, up to 30 m, z -60 to
 * 60. The wall's segment test is a slab walk, as the shell's is. */
const WALL = { x0: 40, x1: 42, y0: 0, y1: 30, z0: -60, z1: 60 };
function segBox(b, ax, ay, az, bx, by, bz) {
  const d = [bx - ax, by - ay, bz - az];
  const a = [ax, ay, az];
  const lo = [b.x0, b.y0, b.z0];
  const hi = [b.x1, b.y1, b.z1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]) < 1e-12) {
      if (a[i] < lo[i] || a[i] > hi[i]) return -1;
    } else {
      let u = (lo[i] - a[i]) / d[i];
      let v = (hi[i] - a[i]) / d[i];
      if (u > v) [u, v] = [v, u];
      if (u > t0) t0 = u;
      if (v < t1) t1 = v;
      if (t0 > t1) return -1;
    }
  }
  return t0;
}
function world(k = 1, wall = true) {
  return {
    k,
    cruise: 24,
    cx: 0,
    cy: 2 * k,
    cz: 0,
    radius: 120 * k,
    top: 40 * k,
    spawns: [
      { x: 30, y: 8, z: 0 }, { x: -30, y: 8, z: 0 }, { x: 0, y: 8, z: 30 }, { x: 0, y: 8, z: -30 },
      { x: 25, y: 10, z: 25 }, { x: -25, y: 10, z: -25 }, { x: 25, y: 10, z: -25 },
    ].map((s) => ({ x: s.x * k, y: s.y * k, z: s.z * k })),
    floorAt() {
      return 0;
    },
    blocked(ax, ay, az, bx, by, bz) {
      return wall ? segBox(WALL, ax, ay, az, bx, by, bz) : -1;
    },
  };
}

/* The pilot flying a slow circle at 10 m, looking where it goes. */
function pilotAt(stepIdx, out) {
  const t = stepIdx * 0.01;
  /* A square path, to keep JS trig out of the test as well. */
  const s = (t * 6) % 160;
  let x;
  let z;
  let fx;
  let fz;
  if (s < 40) {
    x = -20 + s; z = -20; fx = 1; fz = 0;
  } else if (s < 80) {
    x = 20; z = -20 + (s - 40); fx = 0; fz = 1;
  } else if (s < 120) {
    x = 20 - (s - 80); z = 20; fx = -1; fz = 0;
  } else {
    x = -20; z = 20 - (s - 120); fx = 0; fz = -1;
  }
  out.x = x;
  out.y = 10;
  out.z = z;
  out.fx = fx;
  out.fy = 0;
  out.fz = fz;
  out.ux = 0;
  out.uy = 1;
  out.uz = 0;
  out.flying = true;
  out.gun = (stepIdx % 300) < 120;
  out.missile = stepIdx % 700 === 0;
  return out;
}

function fight(seed, steps, rules = { bots: 7, skill: 'pilot', round: '3m', hits: 'arcade' }) {
  const g = new Dogfight(world(), rules, seed);
  const me = {};
  let hash = 2166136261;
  const mix = (v) => {
    const b = new Float64Array([v]);
    const u = new Uint32Array(b.buffer);
    hash = Math.imul(hash ^ u[0], 16777619);
    hash = Math.imul(hash ^ u[1], 16777619);
  };
  const events = { hit: 0, pop: 0, launch: 0, boom: 0, back: 0, spark: 0 };
  let minAbove = Infinity;
  let throughWall = 0;
  for (let n = 0; n < steps; n += 1) {
    g.step(pilotAt(n, me));
    for (let i = 0; i < MAX_PILOTS; i += 1) {
      mix(g.x[i]); mix(g.y[i]); mix(g.z[i]); mix(g.hp[i]);
      if (g.isBot[i] && g.alive[i]) {
        minAbove = Math.min(minAbove, g.y[i]);
        /* Never on the far side of the wall's middle in one feed. */
        const a = g.xPrev[i] < 41;
        const b = g.x[i] < 41;
        if (a !== b && g.yPrev[i] < WALL.y1 && g.y[i] < WALL.y1 && Math.abs(g.z[i]) < 60) {
          throughWall += 1;
        }
      }
    }
    for (let e = 0; e < g.eventCount; e += 1) {
      const t = g.events[e].type;
      if (t in events) events[t] += 1;
    }
    g.eventCount = 0;
  }
  return { g, hash: hash >>> 0, events, minAbove, throughWall };
}

console.log('dogfight selftest');

{
  const a = fight(1234, 6000);
  const b = fight(1234, 6000);
  const c = fight(4321, 6000);
  check(a.hash === b.hash, 'the same seed and path give the same fight to the bit', `${a.hash} vs ${b.hash}`);
  check(a.hash !== c.hash, 'another seed gives another fight');
  check(a.events.hit > 20, 'a minute of seven bots lands hits', JSON.stringify(a.events));
  check(a.events.pop > 0, 'and pops somebody', JSON.stringify(a.events));
  check(a.events.launch > 0, 'and fires missiles', JSON.stringify(a.events));
  check(a.events.back > 0, 'and the popped come back', JSON.stringify(a.events));
  check(a.minAbove > 0, 'no bot goes under the floor', `lowest ${a.minAbove.toFixed(2)} m`);
  check(a.throughWall === 0, 'no bot passes through the wall', `${a.throughWall} crossings`);
}

/* Gun damage: one stationary target at two ranges, from in front and from
 * behind. */
function oneShot(dist, fromBehind) {
  const g = new Dogfight(world(1, false), { bots: 1, skill: 'rookie', round: 'none', hits: 'arcade' }, 7);
  /* Hold the bot still and harmless: no target for it, parked. */
  const me = {
    x: 0, y: 10, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
  };
  g.step(me);
  g.shieldUntil[ME] = 0;
  g.isBot[1] = 0;
  g.x[1] = dist;
  g.y[1] = 10;
  g.z[1] = 0;
  g.fx[1] = fromBehind ? 1 : -1;
  g.fy[1] = 0;
  g.fz[1] = 0;
  g.shieldUntil[1] = 0;
  let dmg = 0;
  me.gun = true;
  for (let n = 0; n < 200 && !dmg; n += 1) {
    g.step(me);
    me.gun = false;
    for (let e = 0; e < g.eventCount; e += 1) {
      if (g.events[e].type === 'hit') dmg = g.events[e].dmg;
    }
    g.eventCount = 0;
  }
  return dmg;
}
{
  const near = oneShot(10, false);
  const far = oneShot(150, false);
  const behind = oneShot(10, true);
  check(near >= 8 && near <= GUN.near, 'a close gun hit does nearly the most', `${near}`);
  check(far >= GUN.far && far < near, 'a far one does less', `${far} < ${near}`);
  check(behind > near, 'and one from behind more', `${behind} > ${near}`);
  check(oneShot(GUN.range + 20, false) === 0, 'past the gun\'s reach nothing lands');
}

/* A wall between: the gun's shot stops at it. */
{
  const g = new Dogfight(world(1, true), { bots: 1, skill: 'rookie', round: 'none', hits: 'arcade' }, 9);
  const me = {
    x: 0, y: 10, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: true, gun: true, missile: false,
  };
  g.step(me);
  g.isBot[1] = 0;
  g.x[1] = 60;
  g.y[1] = 10;
  g.z[1] = 0;
  g.shieldUntil[1] = 0;
  let hits = 0;
  let sparks = 0;
  for (let n = 0; n < 150; n += 1) {
    g.step(me);
    for (let e = 0; e < g.eventCount; e += 1) {
      if (g.events[e].type === 'hit') hits += 1;
      if (g.events[e].type === 'spark') sparks += 1;
    }
    g.eventCount = 0;
  }
  check(hits === 0 && sparks > 0, 'a wall in between stops the gun', `${hits} hits, ${sparks} sparks`);
}

/* Missiles: locked one homes onto a crossing target, a straight one does
 * not. */
function missileAt(lockFirst) {
  const g = new Dogfight(world(1, false), { bots: 1, skill: 'rookie', round: 'none', hits: 'arcade' }, 11);
  const me = {
    x: 0, y: 10, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
  };
  g.step(me);
  g.isBot[1] = 0;
  g.x[1] = 80;
  g.y[1] = 10;
  g.z[1] = 0;
  g.shieldUntil[1] = 0;
  if (lockFirst) {
    for (let n = 0; n < (MISSILE.lockMs / DOGFIGHT_EVERY) + 5; n += 1) g.step(me);
  }
  const locked = g.locked(ME);
  me.missile = true;
  g.step(me);
  me.missile = false;
  /* The target crosses at 15 m/s. */
  let dmg = 0;
  for (let n = 0; n < 600 && !dmg; n += 1) {
    g.z[1] += 15 * 0.01;
    g.vz[1] = 15;
    g.step(me);
    for (let e = 0; e < g.eventCount; e += 1) {
      if (g.events[e].type === 'hit') dmg = g.events[e].dmg;
    }
    g.eventCount = 0;
  }
  return { locked, dmg };
}
{
  const a = missileAt(true);
  const b = missileAt(false);
  check(a.locked, 'a target held in the circle locks');
  check(a.dmg >= MISSILE.blastFar, 'a locked missile catches a crossing target', `${a.dmg}`);
  check(!b.locked && b.dmg === 0, 'an unlocked one flies straight past it', `${b.dmg}`);
}

/* Pops, coming back, and the round's end. */
{
  const g = new Dogfight(world(1, false), { bots: 1, skill: 'rookie', round: '3m', hits: 'hard' }, 13);
  const me = {
    x: 0, y: 10, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
  };
  g.step(me);
  g.shieldUntil[ME] = 0;
  g.damage(ME, 1, 1000, 'gun', 0, 10, 0);
  check(!g.alive[ME] && g.popped[ME] === 1 && g.pops[1] === 1, 'a pilot out of health pops, and the shooter scores');
  const back = HITS.hard.backMs / DOGFIGHT_EVERY;
  for (let n = 0; n < back - 2; n += 1) g.step(me);
  check(!g.alive[ME], 'and is still out just before the rules say');
  for (let n = 0; n < 3; n += 1) g.step(me);
  check(g.alive[ME] && g.hp[ME] === HITS.hard.hp, 'and back, whole, when they do');
  check(!g.hittable(ME), 'with a shield');
  g.damage(ME, 1, 10, 'gun', 0, 10, 0);
  check(g.hp[ME] === HITS.hard.hp, 'that takes no damage');
  for (let n = 0; n < 180000 / DOGFIGHT_EVERY; n += 1) g.step(me);
  check(g.over, 'three minutes end the round');
}

/* Landed, nothing starts. */
{
  const g = new Dogfight(world(), { bots: 3 }, 5);
  const me = {
    x: 0, y: 0.05, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: false, gun: true, missile: true,
  };
  let hits = 0;
  for (let n = 0; n < 3000; n += 1) {
    g.step(me);
    for (let e = 0; e < g.eventCount; e += 1) if (g.events[e].type === 'hit') hits += 1;
    g.eventCount = 0;
  }
  check(g.startedMs < 0 && hits === 0, 'on the ground the round has not begun and nothing lands');
}

/* A world built at another scale gives the same fight in its own units,
 * for the first three seconds; after that rounding in the last bit is
 * allowed to send a bot a different way, as it would in any chaotic
 * system, so it is not asked for longer. */
{
  const a = new Dogfight(world(1, false), { bots: 4 }, 21);
  const b = new Dogfight(world(3.5, false), { bots: 4 }, 21);
  const me = {};
  const me2 = {};
  let worst = 0;
  for (let n = 0; n < 300; n += 1) {
    pilotAt(n, me);
    pilotAt(n, me2);
    me2.x *= 3.5; me2.y *= 3.5; me2.z *= 3.5;
    a.step(me);
    b.step(me2);
  }
  for (let i = 1; i <= 4; i += 1) {
    worst = Math.max(worst, Math.abs(a.y[i] * 3.5 - b.y[i]));
  }
  check(worst < 0.05, 'a world built bigger flies the bots bigger, not differently', `${worst.toFixed(2)}`);
}

/* A map with few open spots hands two bots the same one. Found in the
 * town on the first browser run: two bots on one point had no line
 * between them and the closer one's heading went NaN. */
{
  const w = world(1, false);
  w.spawns = [{ x: 40, y: 6, z: 0 }];
  const g = new Dogfight(w, { bots: 3 }, 9);
  const me = {
    x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, gun: false, missile: false, flying: false,
  };
  let finite = true;
  for (let n = 0; n < 500; n += 1) {
    g.step(me, n === 0);
    g.eventCount = 0;
    for (let i = 0; i < 4; i += 1) {
      finite = finite && Number.isFinite(g.x[i]) && Number.isFinite(g.y[i]) && Number.isFinite(g.fx[i]);
    }
  }
  check(finite, 'bots that start on the same spot stay finite');
}

/*
 * THE BOTS' BRAINS (src/game/dogbrain.js). What makes them fight like
 * pilots rather than like cursors, each asked of the open field so the
 * map is not what is measured.
 */
function openField() {
  const w = world(1, false);
  w.radius = 150;
  return w;
}
/* A pilot flying a circle of 30 m at 19 m/s, 6 m up, turned without trig;
 * `jink` throws it 3 m in and out every 400 ms. Returns the hits it took. */
function circling(skill, seed, jink, bots = 3) {
  const g = new Dogfight(openField(), { bots, skill, round: 'none' }, seed);
  const me = {
    x: 30, y: 6, z: 0, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
  };
  let cx = 1;
  let cz = 0;
  let taken = 0;
  for (let n = 0; n < 6000; n += 1) {
    const st = (19 * 0.01) / 30;
    const nx = cx - cz * st;
    const nz = cz + cx * st;
    const m = Math.sqrt(nx * nx + nz * nz);
    cx = nx / m;
    cz = nz / m;
    const off = jink ? [0, 3, -3, 1][Math.floor(n / 40) % 4] : 0;
    me.x = cx * (30 + off);
    me.z = cz * (30 + off);
    me.fx = -cz;
    me.fz = cx;
    g.step(me, n === 0);
    for (let e = 0; e < g.eventCount; e += 1) {
      if (g.events[e].type === 'hit' && g.events[e].to === ME) taken += 1;
    }
    g.eventCount = 0;
  }
  return { g, taken };
}
{
  const steady = circling('pilot', 1, false).taken + circling('pilot', 2, false).taken;
  const jinky = circling('pilot', 1, true).taken + circling('pilot', 2, true).taken;
  check(steady > 20, 'bots lead a pilot flying a steady circle and hit it', `${steady} hits in two minutes`);
  check(jinky < steady, 'and a pilot who jinks is hit less, because what a bot sees lags what is', `${jinky} < ${steady}`);
  const rookie = circling('rookie', 1, false).taken + circling('rookie', 2, false).taken;
  const ace = circling('ace', 1, false).taken + circling('ace', 2, false).taken;
  check(rookie < steady && steady < ace, 'a rookie hits less than a pilot and a pilot less than an ace', `${rookie} < ${steady} < ${ace}`);
}

/* Missiles: fired locked from far at one bot, forty times. A rookie never
 * gets away; an ace often does, by flying side on and breaking late. */
function dodgeRate(skill) {
  let fired = 0;
  let hit = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const w = openField();
    w.spawns = [{ x: 160, y: 10, z: 0 }];
    const g = new Dogfight(w, { bots: 1, skill, round: 'none' }, seed);
    const me = {
      x: 0, y: 10, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
    };
    let shot = false;
    let done = false;
    for (let n = 0; n < 1500 && !done; n += 1) {
      const dx = g.x[1] - me.x;
      const dy = g.y[1] - me.y;
      const dz = g.z[1] - me.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      me.fx = dx / d;
      me.fy = dy / d;
      me.fz = dz / d;
      me.missile = !shot && n > 100 && d > 70 && g.locked(ME);
      shot = shot || me.missile;
      /* Its spawn shield off, so the lock comes while it is far, and the
       * pilot's on, so it cannot shoot back. */
      g.shieldUntil[1] = 0;
      g.shieldUntil[ME] = Infinity;
      g.step(me, n === 0);
      for (let e = 0; e < g.eventCount; e += 1) {
        const ev = g.events[e];
        if (ev.type === 'boom' && ev.by === ME) done = true;
        if (ev.type === 'hit' && ev.weapon === 'missile' && ev.to === 1) hit += 1;
      }
      g.eventCount = 0;
    }
    if (shot) fired += 1;
  }
  return fired ? (fired - hit) / fired : 0;
}
{
  const rookie = dodgeRate('rookie');
  const ace = dodgeRate('ace');
  check(rookie <= 0.1, 'a rookie almost never gets away from a locked missile', `${(rookie * 100).toFixed(0)}%`);
  check(ace >= 0.3, 'an ace often does', `${(ace * 100).toFixed(0)}%`);
}

/* The pilot is never mobbed: no more bots on it at once than the skill's
 * tokens and one more caught deciding in the same moment. */
{
  let worst = 0;
  for (const skill of ['rookie', 'pilot', 'ace']) {
    const g = new Dogfight(openField(), { bots: 7, skill, round: 'none' }, 5);
    const me = {
      x: 0, y: 6, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
    };
    for (let n = 0; n < 6000; n += 1) {
      g.step(me, n === 0);
      g.eventCount = 0;
      let on = 0;
      for (let i = 1; i < MAX_PILOTS; i += 1) {
        if (g.alive[i] && g.target[i] === ME && g.brain.mode[i] === ATTACK) on += 1;
      }
      worst = Math.max(worst, on - SKILLS[skill].tokens);
    }
  }
  check(worst <= 1, 'no more bots on the pilot at once than the skill allows', `${worst} over`);
}

/* Personalities: GIZMO dives and runs out to come round again, NORI waits
 * low, PIP fights close. */
{
  const g = new Dogfight(openField(), { bots: 7, skill: 'pilot', round: 'none' }, 8);
  const me = {
    x: 0, y: 6, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
  };
  const extend = new Float64Array(MAX_PILOTS);
  const lowPatrol = new Float64Array(MAX_PILOTS);
  const patrol = new Float64Array(MAX_PILOTS);
  for (let n = 0; n < 12000; n += 1) {
    g.step(me, n === 0);
    g.eventCount = 0;
    for (let i = 1; i < MAX_PILOTS; i += 1) {
      if (!g.alive[i]) continue;
      if (g.brain.mode[i] === EXTEND) extend[i] += 1;
      if (g.brain.mode[i] === PATROL) {
        patrol[i] += 1;
        lowPatrol[i] += g.y[i];
      }
    }
  }
  const others = Math.max(extend[1], extend[3], extend[5]);
  check(extend[2] > others, 'the boom and zoom bot runs out to come round more than the others', `${extend[2]} > ${others}`);
  const lowest = patrol[7] ? lowPatrol[7] / patrol[7] : Infinity;
  const gizmo = patrol[2] ? lowPatrol[2] / patrol[2] : 0;
  check(lowest < gizmo, 'the ambusher patrols lower than the diver', `${lowest.toFixed(1)} m < ${gizmo.toFixed(1)} m`);
}

/* Cost: seven bots and the gun held, per feed. */
{
  const g = new Dogfight(world(), { bots: 7, skill: 'ace' }, 3);
  const me = {};
  for (let n = 0; n < 2000; n += 1) {
    g.step(pilotAt(n, me));
    g.eventCount = 0;
  }
  const N = 20000;
  const t0 = process.hrtime.bigint();
  for (let n = 0; n < N; n += 1) {
    pilotAt(n, me);
    me.gun = true;
    g.step(me);
    g.eventCount = 0;
  }
  const us = Number(process.hrtime.bigint() - t0) / 1000 / N;
  /* 100 feeds a second is 1.7 a frame at 60: the plan's budget is 0.05 ms
   * a frame, so 30 us a feed. This world's walls are one box, so it is the
   * game's own cost, not the map's. */
  console.log(`  cost  ${us.toFixed(2)} us a feed, ${(us * 100 / 60 / 1000).toFixed(4)} ms a 60 Hz frame`);
  check(us < 30, 'a feed with seven aces and the gun held is under 30 us', `${us.toFixed(2)} us`);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
