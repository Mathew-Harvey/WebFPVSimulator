/*
 * dogfight-arena.js: the Dogfight bots flown in Node, on a real map, and
 * scored, so a change to how they fly is measured rather than guessed.
 *
 * A map is a dump of the fight's world from the browser: the two grids
 * src/game/dogfight.js's gridWorld reads, as JSON with the solids run
 * length coded. Without one it flies the self test's field with a wall.
 *
 * The pilot's slot is flown by a script (--pilot=straight, circle, jink)
 * or by a bot's brain (--pilot=bot), which is how bots are measured
 * against something that fights back.
 *
 * Usage:
 *   node scripts/dogfight-arena.js [--world=FILE] [--skill=pilot] [--bots=7]
 *     [--seconds=120] [--seed=1] [--pilot=bot] [--svg=FILE] [--impl=PATH]
 *     [--json]
 *
 * --impl points at another copy of src/game/dogfight.js, to fly an older
 * brain on the same map and compare.
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

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gridWorld } from '../src/game/dogfight.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const impl = args.impl ? pathToFileURL(resolve(args.impl)).href : '../src/game/dogfight.js';
const {
  Dogfight, MAX_PILOTS, ME, SKILLS,
} = await import(impl);
/* --tweak='{"aim":0}' changes the skill's numbers for this run, to tune. */
if (args.tweak && SKILLS) {
  Object.assign(SKILLS[args.skill || 'pilot'], JSON.parse(args.tweak));
}

function loadWorld(file) {
  if (!file) {
    return fieldWorld();
  }
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const occ = new Uint8Array(d.nx * d.nx * d.ny);
  let at = 0;
  let v = 0;
  for (const run of d.runs) {
    if (v) occ.fill(1, at, at + run);
    at += run;
    v ^= 1;
  }
  const grid = gridWorld({
    ground: Float32Array.from(d.ground), gn: d.gn, gcell: d.gcell, gx0: d.gx0, gz0: d.gz0, gout: d.gout, occ, nx: d.nx, ny: d.ny, v: d.v, yLo: d.yLo,
  });
  return {
    name: d.name,
    k: d.k,
    cruise: d.cruise,
    cx: d.cx,
    cy: d.cy,
    cz: d.cz,
    radius: d.radius,
    top: d.top,
    spawns: d.spawns,
    floorAt: grid.floorAt,
    blocked: grid.blocked,
    inside: grid.inside,
    grid: grid.data,
  };
}

/* The self test's field: flat, one wall across it. */
function fieldWorld() {
  const W = { x0: 40, x1: 42, y0: 0, y1: 30, z0: -60, z1: 60 };
  const inside = (x, y, z) => x >= W.x0 && x <= W.x1 && y >= W.y0 && y <= W.y1 && z >= W.z0 && z <= W.z1;
  return {
    name: 'field',
    k: 1,
    cruise: 24,
    cx: 0,
    cy: 2,
    cz: 0,
    radius: 120,
    top: 40,
    spawns: [{ x: 30, y: 8, z: 0 }, { x: -30, y: 8, z: 0 }, { x: 0, y: 8, z: 30 }, { x: 0, y: 8, z: -30 }],
    floorAt: () => 0,
    inside,
    blocked(ax, ay, az, bx, by, bz) {
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / 0.3));
      for (let s = 1; s <= n; s += 1) {
        const t = s / n;
        const y = ay + (by - ay) * t;
        if (y < 0 || inside(ax + (bx - ax) * t, y, az + (bz - az) * t)) return t;
      }
      return -1;
    },
  };
}

const world = loadWorld(args.world);
const k = world.k;
const seconds = Number(args.seconds || 120);
const rules = {
  bots: Number(args.bots ?? 7), skill: args.skill || 'pilot', round: 'none', hits: 'arcade',
};
const g = new Dogfight(world, rules, Number(args.seed || 1));
const pilot = args.pilot || 'bot';
const steps = Math.round((seconds * 1000) / 10);

/* The scripted pilot, in the open: a lap of the arena's spawn at a height. */
const me = {
  x: world.cx, y: world.cy + 4 * k, z: world.cz, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, gun: false, missile: false, flying: true,
};
let ang = 0;
function script(n) {
  const sp = world.cruise * 0.8 * k;
  const r = Math.min(world.radius * 0.3, 30 * k);
  if (pilot === 'straight') {
    /* Up and down a line through the spawn. */
    const L = r * 2;
    const s = ((n * 0.01 * sp) % (2 * L));
    const along = s < L ? s - L / 2 : L * 1.5 - s;
    me.x = world.cx + along;
    me.z = world.cz;
    me.fx = s < L ? 1 : -1;
    me.fz = 0;
  } else {
    /* A circle without trig: a unit vector turned a little each step. */
    if (!script.c) script.c = { cx: 1, cz: 0 };
    const c = script.c;
    const step = sp * 0.01 / r;
    const nx = c.cx - c.cz * step;
    const nz = c.cz + c.cx * step;
    const m = Math.sqrt(nx * nx + nz * nz);
    c.cx = nx / m;
    c.cz = nz / m;
    let jx = 0;
    let jz = 0;
    if (pilot === 'jink') {
      /* Throw it about every 400 ms. */
      const ph = Math.floor(n / 40) % 4;
      const amt = [0, 3, -3, 1][ph] * k;
      jx = c.cx * amt;
      jz = c.cz * amt;
    }
    me.x = world.cx + c.cx * r + jx;
    me.z = world.cz + c.cz * r + jz;
    me.fx = -c.cz;
    me.fz = c.cx;
  }
  me.y = world.cy + 4 * k;
  me.fy = 0;
  ang += 1;
}

/* Scores. */
const S = {
  modeMs: [], speed: [], low: [], fireRange: [], predict: [], predictN: [], hist: [],
};
for (let i = 0; i < MAX_PILOTS; i += 1) {
  S.modeMs.push(new Float64Array(8));
  S.speed.push(0);
  S.low.push(Infinity);
  S.fireRange.push([]);
  S.fireOff = S.fireOff || [];
  S.fireOff.push([]);
  S.lowMs = S.lowMs || [];
  S.lowMs.push(0);
  S.predict.push(0);
  S.predictN.push(0);
  S.hist.push([]);
}
const events = {
  hit: 0, pop: 0, launch: 0, boom: 0, back: 0, spark: 0, dodge: 0,
};
const meHits = { by: 0, taken: 0 };
const launchesAt = new Int32Array(MAX_PILOTS);
const missileHits = new Int32Array(MAX_PILOTS);
const trails = [];
for (let i = 0; i < MAX_PILOTS; i += 1) trails.push([]);
let through = 0;
const t0 = process.hrtime.bigint();
let brainNs = 0n;
for (let n = 0; n < steps; n += 1) {
  if (pilot === 'bot') {
    g.isBot[ME] = 0;
    const ox = g.x[ME];
    const oy = g.y[ME];
    const oz = g.z[ME];
    if (g.alive[ME] && g.brain && g.brain.fly) {
      g.brain.fly(ME, g.clockMs, g.running);
    }
    me.x = g.x[ME]; me.y = g.y[ME]; me.z = g.z[ME];
    /* The game finds the pilot's velocity from where it was. */
    g.x[ME] = ox; g.y[ME] = oy; g.z[ME] = oz;
    me.fx = g.fx[ME]; me.fy = g.fy[ME]; me.fz = g.fz[ME];
    me.ux = g.ux[ME]; me.uy = g.uy[ME]; me.uz = g.uz[ME];
  } else {
    script(n);
    me.gun = false;
  }
  const a = process.hrtime.bigint();
  g.step(me, n === 0);
  brainNs += process.hrtime.bigint() - a;
  if (pilot === 'bot' && n === 0) {
    /* Start the pilot's brain where the pilot is. */
    g.brain.spawned(ME);
  }
  for (let e = 0; e < g.eventCount; e += 1) {
    const ev = g.events[e];
    if (ev.type in events) events[ev.type] += 1;
    if (ev.type === 'hit' && ev.to === ME) meHits.taken += 1;
    if (ev.type === 'hit' && ev.by === ME) meHits.by += 1;
    if (ev.type === 'launch' && ev.to >= 0) launchesAt[ev.to] += 1;
    if (ev.type === 'hit' && ev.weapon === 'missile') missileHits[ev.to] += 1;
  }
  g.eventCount = 0;
  for (let i = 0; i < MAX_PILOTS; i += 1) {
    if (!g.inFight[i] || !g.alive[i]) {
      S.hist[i].length = 0;
      continue;
    }
    if (g.brain && g.brain.mode) S.modeMs[i][g.brain.mode[i]] += 10;
    S.speed[i] += Math.hypot(g.vx[i], g.vy[i], g.vz[i]) / k;
    const alt = (g.y[i] - world.floorAt(g.x[i], g.y[i], g.z[i])) / k;
    S.low[i] = Math.min(S.low[i], alt);
    if (alt < 0.8) S.lowMs[i] += 10;
    if (g.firing[i] && g.target[i] >= 0) {
      const t = g.target[i];
      const dd = Math.hypot(g.x[t] - g.x[i], g.y[t] - g.y[i], g.z[t] - g.z[i]);
      S.fireRange[i].push(dd / k);
      const on = ((g.x[t] - g.x[i]) * g.fx[i] + (g.y[t] - g.y[i]) * g.fy[i] + (g.z[t] - g.z[i]) * g.fz[i]) / dd;
      S.fireOff[i].push(Math.sqrt(Math.max(0, 2 - 2 * on)) * dd / k);
    }
    /* Predictability: where a straight line from half a second's history
     * says it will be in a second, against where it is. */
    if (n % 10 === 0) {
      S.hist[i].push([g.x[i], g.y[i], g.z[i]]);
      const h = S.hist[i];
      if (h.length > 16) h.shift();
      if (h.length === 16) {
        const [p0, p5, p15] = [h[0], h[5], h[15]];
        const vx = (p5[0] - p0[0]) / 0.5;
        const vy = (p5[1] - p0[1]) / 0.5;
        const vz = (p5[2] - p0[2]) / 0.5;
        const ex = p5[0] + vx * 1 - p15[0];
        const ey = p5[1] + vy * 1 - p15[1];
        const ez = p5[2] + vz * 1 - p15[2];
        S.predict[i] += Math.hypot(ex, ey, ez) / k;
        S.predictN[i] += 1;
      }
    }
    if (n % 5 === 0 && n < 3000) trails[i].push([g.x[i], g.z[i], g.y[i]]);
    /* Through a solid between two feeds, without sliding along it. */
    if (world.inside && world.inside(g.x[i], g.y[i], g.z[i]) && !world.inside(g.xPrev[i], g.yPrev[i], g.zPrev[i]) && i > 0) {
      through += 1;
    }
  }
}
const wallNs = process.hrtime.bigint() - t0;
const names = ['YOU', 'MOCHI', 'GIZMO', 'PIP', 'TOFU', 'ZIPPY', 'BOLT', 'NORI'];
const MODES = ['patrol', 'hunt', 'attack', 'defend', 'evade', 'extend', 'hide', '-'];
const rows = [];
let predAll = 0;
let predN = 0;
for (let i = 0; i < MAX_PILOTS; i += 1) {
  if (!g.inFight[i]) continue;
  const alive = Math.max(1, S.modeMs[i].reduce((a, b) => a + b, 0));
  const fr = S.fireRange[i].sort((a, b) => a - b);
  const pred = S.predictN[i] ? S.predict[i] / S.predictN[i] : 0;
  if (i > 0) {
    predAll += S.predict[i];
    predN += S.predictN[i];
  }
  rows.push({
    who: names[i],
    pops: g.pops[i],
    popped: g.popped[i],
    acc: g.shots[i] ? `${((g.hits[i] / g.shots[i]) * 100).toFixed(0)}%` : '-',
    shots: g.shots[i],
    dodged: g.dodged[i],
    mslAt: launchesAt[i],
    speed: (S.speed[i] / (alive / 10)).toFixed(1),
    low: S.low[i].toFixed(1),
    lowPct: `${((S.lowMs[i] / alive) * 100).toFixed(0)}%`,
    fireAt: fr.length ? fr[Math.floor(fr.length / 2)].toFixed(0) : '-',
    offM: S.fireOff[i].length ? S.fireOff[i].sort((a, b) => a - b)[Math.floor(S.fireOff[i].length / 2)].toFixed(1) : '-',
    pred1s: pred.toFixed(2),
    scrapesPerMin: g.brain && g.brain.scrapes ? (g.brain.scrapes[i] / (alive / 60000)).toFixed(1) : '-',
    floorPerMin: g.brain && g.brain.floorScrapes ? (g.brain.floorScrapes[i] / (alive / 60000)).toFixed(1) : '-',
    stuck: g.brain && g.brain.stucks ? g.brain.stucks[i] : '-',
    modes: g.brain && g.brain.mode ? MODES.map((m, j) => (S.modeMs[i][j] ? `${m} ${Math.round((S.modeMs[i][j] / alive) * 100)}` : '')).filter(Boolean).join(', ') : '',
  });
}
const report = {
  world: world.name,
  skill: rules.skill,
  pilot,
  seconds,
  events,
  meTaken: meHits.taken,
  meDealt: meHits.by,
  through,
  predict1s: predN ? (predAll / predN).toFixed(2) : '-',
  usPerFeed: (Number(brainNs) / 1000 / steps).toFixed(2),
  wallS: (Number(wallNs) / 1e9).toFixed(1),
  rows,
};
if (args.json) {
  console.log(JSON.stringify(report));
} else {
  console.log(`${report.world}, ${report.skill}, pilot ${pilot}, ${seconds} s: ${report.usPerFeed} us a feed, `
    + `predict 1 s ahead off by ${report.predict1s} m, through walls ${through}`);
  console.log(`events ${JSON.stringify(events)}, pilot took ${meHits.taken} hits, dealt ${meHits.by}`);
  console.table(rows);
}

/* A top-down picture of the first 30 s of every pilot's path. */
if (args.svg) {
  const colours = ['#ffffff', '#ff7d96', '#ffc857', '#7ee0b0', '#8ab4ff', '#d48aff', '#ff9e57', '#57e3ff'];
  const R = world.radius * 1.15;
  const sx = (x) => ((x - world.cx + R) / (2 * R)) * 1000;
  const sz = (z) => ((z - world.cz + R) / (2 * R)) * 1000;
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="#1d1d24"/>';
  /* The solids at the height the fight mostly happens, as grey cells. */
  if (world.grid) {
    const d = world.grid;
    for (let band = 0; band < 2; band += 1) {
      const y = world.cy + (band ? 6 : 2) * k;
      const l = Math.floor((y - d.yLo) / d.v);
      const step = Math.max(1, Math.floor(d.nx / 250));
      for (let j = 0; j < d.nx; j += step) {
        for (let i = 0; i < d.nx; i += step) {
          if (l >= 0 && l < d.ny && d.occ[(l * d.nx + j) * d.nx + i]) {
            const x = d.gx0 + (i + 0.5) * d.v;
            const z = d.gz0 + (j + 0.5) * d.v;
            const s = (d.v * step / (2 * R)) * 1000;
            svg += `<rect x="${(sx(x) - s / 2).toFixed(1)}" y="${(sz(z) - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="${band ? '#666' : '#444'}"/>`;
          }
        }
      }
    }
  }
  for (let i = 0; i < MAX_PILOTS; i += 1) {
    const t = trails[i];
    if (t.length < 2) continue;
    let dpath = '';
    for (let p = 0; p < t.length; p += 1) {
      dpath += `${p ? 'L' : 'M'}${sx(t[p][0]).toFixed(1)},${sz(t[p][1]).toFixed(1)}`;
    }
    svg += `<path d="${dpath}" fill="none" stroke="${colours[i]}" stroke-width="${i ? 1.6 : 2.4}" opacity="0.9"/>`;
    svg += `<text x="${sx(t[0][0]).toFixed(0)}" y="${sz(t[0][1]).toFixed(0)}" fill="${colours[i]}" font-size="14" font-family="sans-serif">${names[i]}</text>`;
  }
  svg += '</svg>';
  writeFileSync(args.svg, svg);
}
