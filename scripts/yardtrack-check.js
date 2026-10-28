/*
 * yardtrack-check.js: the yard track (src/maps/yardtrack/), RaceGOW6 Track
 * 3 in Heads' front yard, Nick Burns' back yard and out the back of Joshua
 * Bardwell's, proved in plain Node to stand clear of each place and to time
 * a lap the way the shell times it (src/game/yardrace.js).
 *
 *   1. clear     nothing solid of the place in the track's way: a margin
 *                round every pipe, a ball round the racing line, and the
 *                air over the start
 *   2. laps      the racing line flown from the start, three times round,
 *                through the race: every station in order, three laps
 *   3. leave     flying out of reach resets the race; a disarmed race (a
 *                five inch at Bardwell's) scores nothing
 *   4. floor     MiniFigs.me and RaceGOW6 inside the board's two ground
 *                logo pieces, apart, flat on the grass, at their own shape
 *   5. zone      Bardwell's landing zone holds the track and not the
 *                map's own start
 *
 * Usage: node scripts/yardtrack-check.js
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

import { headsLayout, headsYardTrack } from '../src/maps/heads/heads.js';
import { houseLayout, houseYardTrack } from '../src/maps/house/house.js';
import { bardwellLayout, bardwellYardTrack, worldAt as bardwellAt, SPAWN } from '../src/maps/bardwell/bardwell.js';
import { floorQuads, inAskZone, FLOOR_MARKS } from '../src/maps/yardtrack/yardtrack.js';
import { YardRace } from '../src/game/yardrace.js';

/* The race keeps its best lap in the browser's storage. */
globalThis.localStorage = { getItem: () => null, setItem() {} };

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

const MAPS = [
  { id: 'heads', layout: headsLayout, track: headsYardTrack },
  { id: 'house', layout: houseLayout, track: houseYardTrack },
  { id: 'bardwell', layout: bardwellLayout, track: bardwellYardTrack },
];

/* A solid part's box. */
function aabb(p) {
  if (p.t === 'box') {
    return [p.lo, p.hi];
  }
  return [
    [0, 1, 2].map((i) => Math.min(p.a[i], p.b[i]) - p.r),
    [0, 1, 2].map((i) => Math.max(p.a[i], p.b[i]) + p.r),
  ];
}
const meets = (a, b) => a[1][0] >= b[0][0] && a[0][0] <= b[1][0] && a[1][1] >= b[0][1] && a[0][1] <= b[1][1]
  && a[1][2] >= b[0][2] && a[0][2] <= b[1][2];

/* Fly `pts` through the race, at `speed` metres a millisecond, one
 * millisecond a step: the stations passed and the laps counted. */
function fly(yr, pts, speed, t0 = 0) {
  let ms = t0;
  let prev = pts[0];
  const passed = [];
  let laps = 0;
  let left = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / speed));
    for (let j = 1; j <= n; j += 1) {
      const c = { x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n, z: a.z + ((b.z - a.z) * j) / n };
      ms += 1;
      const r = yr.step(prev, c, ms, ms, true);
      if (r.passed != null) {
        passed.push(r.passed);
      }
      laps += r.lap ? 1 : 0;
      left += r.left ? 1 : 0;
      prev = c;
    }
  }
  return { passed, laps, left, ms };
}

for (const M of MAPS) {
  const L = M.layout();
  const t = M.track();
  const own = new Set(t.parts);
  console.log(`\n${M.id} (scale ${t.scale.toFixed(4)})`);

  /* 1. clear */
  const probes = [];
  for (const p of t.parts) {
    const [lo, hi] = aabb(p);
    const m = 0.15 * t.scale;
    probes.push({ what: 'pipe', b: [lo.map((v) => v - m), hi.map((v) => v + m)] });
  }
  const R = 0.35 * t.scale;
  for (const q of t.line) {
    probes.push({ what: 'line', b: [[q.x - R, q.y - R, q.z - R], [q.x + R, q.y + R, q.z + R]] });
  }
  probes.push({ what: 'start', b: [[t.start.x - R, t.y + 0.05, t.start.z - R], [t.start.x + R, t.y + 2 * R, t.start.z + R]] });
  const hits = new Set();
  for (const p of L.parts) {
    if (!p.solid || own.has(p)) {
      continue;
    }
    const b = aabb(p);
    /* The grass and the paths it lies on are under the track, not in it. */
    if (b[1][1] < t.y + 0.02 * t.scale) {
      continue;
    }
    for (const q of probes) {
      if (meets(b, q.b)) {
        hits.add(`${p.name || p.m} in the ${q.what}`);
      }
    }
  }
  check('nothing of the place in the track\'s way', hits.size === 0, [...hits].slice(0, 6).join(', ') || `${probes.length} probes`);
  check('the track is all in the layout', t.parts.every((p) => L.parts.includes(p)), `${t.parts.length} parts`);

  /* 2. laps */
  const yr = new YardRace(t);
  const run = [{ x: t.start.x, y: t.y + 1, z: t.start.z }];
  for (let k = 0; k < 3; k += 1) {
    run.push(...t.line);
  }
  const speed = (8 * t.scale) / 1000;
  const r = fly(yr, run, speed);
  const want = [];
  for (let k = 0; k < 3; k += 1) {
    want.push(...t.gates.map((g, i) => i));
  }
  want.push(0);
  check('the line from the start passes every station in order, three times', r.passed.join() === want.join(), `${r.passed.length} passes`);
  check('three laps counted', r.laps === 3 && yr.race.laps.length === 3, yr.race.laps.map((ms) => (ms / 1000).toFixed(2)).join(', '));
  check('the clock started at the start gate', yr.started);

  /* 3. leave */
  const away = { x: t.centre.x + t.leaveR * 1.2, y: t.y + 1, z: t.centre.z };
  const back = { x: t.start.x, y: t.y + 1, z: t.start.z };
  const out = fly(yr, [run[run.length - 1], away], speed, r.ms);
  check('flying out of reach resets the race', out.left === 1 && !yr.started && yr.race.next === 0 && yr.race.laps.length === 0);
  check('and the best lap is kept', yr.race.bestMs != null);
  const again = fly(yr, [away, back, ...t.line, t.line[0]], speed, out.ms);
  check('flown back in, it times again from the start gate', again.laps === 1, `${again.passed.length} passes`);
  const off = new YardRace(t);
  off.armed = false;
  const none = fly(off, run, speed);
  check('a disarmed race scores nothing', none.passed.length === 0 && none.laps === 0 && !off.started);

  /* 4. floor */
  const quads = floorQuads(t, L.parts);
  const foot = (q) => {
    const across = Math.abs(q.up[0]) > 0.5;
    const hx = (across ? q.h : q.w) / 2;
    const hz = (across ? q.w : q.h) / 2;
    return [q.p[0] - hx, q.p[2] - hz, q.p[0] + hx, q.p[2] + hz];
  };
  const rects = t.logos.map((g) => {
    const across = Math.abs(g.yaw % Math.PI) > 0.5;
    const hx = (across ? g.d : g.w) / 2;
    const hz = (across ? g.w : g.d) / 2;
    return [g.x - hx, g.z - hz, g.x + hx, g.z + hz];
  });
  const inside = (f, g) => f[0] >= g[0] - 1e-6 && f[1] >= g[1] - 1e-6 && f[2] <= g[2] + 1e-6 && f[3] <= g[3] + 1e-6;
  const feet = quads.map(foot);
  check('two floor logos, the track\'s own', quads.map((q) => q.cell).join() === FLOOR_MARKS.map((m) => m.key).join(), quads.map((q) => q.cell).join(', '));
  check('each at its picture\'s shape', quads.every((q, i) => Math.abs(q.w / q.h - FLOOR_MARKS[i].aspect) < 1e-9));
  check('each inside a ground logo piece', feet.every((f) => rects.some((g) => inside(f, g))));
  let apart = true;
  for (let i = 0; i < feet.length; i += 1) {
    for (let j = i + 1; j < feet.length; j += 1) {
      const a = feet[i];
      const b = feet[j];
      if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) {
        apart = false;
      }
    }
  }
  check('none over another', apart);
  check('flat, just over the grass', quads.every((q) => q.n[1] === 1 && q.p[1] > t.y && q.p[1] < t.y + 0.05), quads.map((q) => q.p[1].toFixed(3)).join(', '));

  /* 5. zone */
  if (M.id === 'bardwell') {
    const a = t.ask;
    const b = t.box;
    check('the landing zone holds the track', a.x0 <= b.x0 && a.x1 >= b.x1 && a.z0 <= b.z0 && a.z1 >= b.z1);
    const [sx, , sz] = bardwellAt(SPAWN.px, SPAWN.py, 0);
    check('and not the map\'s own start', !inAskZone(t, sx, sz), `start ${sx.toFixed(1)}, ${sz.toFixed(1)}`);
    check('its boundary is painted', L.parts.filter((p) => p.name === 'yard zone').length === 4);
  }
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
