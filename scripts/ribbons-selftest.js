/*
 * ribbons-selftest.js: src/game/ribbons.js in Node, on a made up world.
 *
 * The game is pure, so what it promises can be asked of it without a
 * browser: the same seed and the same craft path give the same round to
 * the bit, a ribbon hangs under a quad that hovers and streams behind one
 * that flies, never stretches and never goes through the floor, a quad
 * flying through a ribbon cuts it where it crossed and not in the knot,
 * nobody cuts their own, a ribbon cut short enough takes its pilot out,
 * the last with a ribbon wins, the clock ends a round, a jump is not a
 * cut, the bots go for ribbons and get them, and a feed with seven bots
 * costs what the dogfight's budget says it may.
 *
 * Usage: node scripts/ribbons-selftest.js
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
  RibbonCut, RibbonRoom, RIBBON, RIBBON_POINTS, RIBBON_ROUNDS, normaliseRibbonRules,
} from '../src/game/ribbons.js';
import { ME, MAX_PILOTS } from '../src/game/dogfight.js';

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

/* An open field, floor at 0, nothing standing on it. */
function world(k = 1) {
  return {
    k,
    cruise: 24,
    cx: 0,
    cy: 2 * k,
    cz: 0,
    radius: 80 * k,
    top: 30 * k,
    spawns: [
      { x: 30, y: 8, z: 0 }, { x: -30, y: 8, z: 0 }, { x: 0, y: 8, z: 30 }, { x: 0, y: 8, z: -30 },
      { x: 25, y: 10, z: 25 }, { x: -25, y: 10, z: -25 }, { x: 25, y: 10, z: -25 },
    ].map((s) => ({ x: s.x * k, y: s.y * k, z: s.z * k })),
    floorAt() {
      return 0;
    },
    blocked() {
      return -1;
    },
  };
}

function still(x, y, z, flying = true) {
  return {
    x, y, z, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying, gun: false, missile: false,
  };
}

/* The pilot on a square at 10 m, 6 m/s, looking where it goes. */
function pilotAt(n, out) {
  const s = (n * 0.06) % 160;
  let x; let z; let fx; let fz;
  if (s < 40) {
    x = -20 + s; z = -20; fx = 1; fz = 0;
  } else if (s < 80) {
    x = 20; z = -20 + (s - 40); fx = 0; fz = 1;
  } else if (s < 120) {
    x = 20 - (s - 80); z = 20; fx = -1; fz = 0;
  } else {
    x = -20; z = 20 - (s - 120); fx = 0; fz = -1;
  }
  Object.assign(out, {
    x, y: 10, z, fx, fy: 0, fz, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
  });
  return out;
}

function drain(g, tally) {
  for (let e = 0; e < g.eventCount; e += 1) {
    const t = g.events[e].type;
    if (tally) {
      tally[t] = (tally[t] || 0) + 1;
    }
  }
  g.eventCount = 0;
}

/* The longest any link of pilot i's ribbon is, over its link length. */
function stretch(g, i) {
  let most = 0;
  const base = i * RIBBON_POINTS;
  for (let s = 1; s < g.rCount[i]; s += 1) {
    const j = base + s;
    const dx = g.rx[j] - g.rx[j - 1];
    const dy = g.ry[j] - g.ry[j - 1];
    const dz = g.rz[j] - g.rz[j - 1];
    most = Math.max(most, Math.sqrt(dx * dx + dy * dy + dz * dz) / g.linkLen);
  }
  return most;
}

function lowest(g) {
  let low = Infinity;
  for (let i = 0; i < MAX_PILOTS; i += 1) {
    for (let s = 0; s < g.rCount[i]; s += 1) {
      low = Math.min(low, g.ry[i * RIBBON_POINTS + s]);
    }
  }
  return low;
}

console.log('ribbons selftest');

/* Rules. */
{
  const r = normaliseRibbonRules({ bots: 99, skill: 'god', round: '1h', length: 'huge' });
  check(r.bots === 7 && r.skill === 'rookie' && r.round === '2m' && r.length === 'normal' && r.game === 'ribbon',
    'rules from a hand edit come back in range', JSON.stringify(r));
  check(normaliseRibbonRules(null).bots === 3, 'no rules is three rookie bots');
}

/* Determinism, and the bots fighting. */
function round(seed, feeds, rules = { bots: 7, skill: 'ace', round: 'none', length: 'long' }) {
  const g = new RibbonCut(world(), rules, seed);
  const me = {};
  let hash = 2166136261;
  const mix = (v) => {
    const b = new Float64Array([v]);
    const u = new Uint32Array(b.buffer);
    hash = Math.imul(hash ^ u[0], 16777619);
    hash = Math.imul(hash ^ u[1], 16777619);
  };
  const tally = {};
  let worst = 0;
  let low = Infinity;
  for (let n = 0; n < feeds; n += 1) {
    g.step(pilotAt(n, me));
    for (let i = 0; i < MAX_PILOTS; i += 1) {
      mix(g.x[i]); mix(g.y[i]); mix(g.z[i]); mix(g.rCount[i]);
      const j = i * RIBBON_POINTS + RIBBON_POINTS - 1;
      mix(g.rx[j]); mix(g.ry[j]); mix(g.rz[j]);
      worst = Math.max(worst, stretch(g, i));
    }
    low = Math.min(low, lowest(g));
    drain(g, tally);
    if (g.over) {
      break;
    }
  }
  return {
    g, hash: hash >>> 0, tally, worst, low,
  };
}

{
  const a = round(99, 12000);
  const b = round(99, 12000);
  const c = round(100, 12000);
  check(a.hash === b.hash, 'the same seed and path give the same round to the bit', `${a.hash} vs ${b.hash}`);
  check(a.hash !== c.hash, 'another seed gives another round');
  const cuts = (a.tally.cut || 0) + (a.tally.out || 0);
  check(cuts > 0, 'seven ace bots cut ribbons', JSON.stringify(a.tally));
  check((a.tally.out || 0) > 0, 'and put somebody out', JSON.stringify(a.tally));
  check(a.worst <= 1 + 1e-9, 'no link ever stretches past its length', `worst ${a.worst.toFixed(4)}`);
  check(a.low >= 0, 'no ribbon goes under the floor', `lowest ${a.low.toFixed(3)} m`);
}

/* Hanging and streaming. */
{
  const g = new RibbonCut(world(), { bots: 0, round: 'none' }, 1);
  const me = still(0, 10, 0);
  for (let n = 0; n < 500; n += 1) {
    g.step(me);
  }
  const base = ME * RIBBON_POINTS;
  const tail = base + RIBBON_POINTS - 1;
  const drop = g.ry[base] - g.ry[tail];
  const len = RIBBON.lengths.normal;
  check(drop > len * 0.5, 'a ribbon hangs down under a quad that hovers', `tail ${drop.toFixed(2)} m below of ${len} m`);
  /* Now fly along +x at 20 m/s for two seconds. */
  for (let n = 0; n < 200; n += 1) {
    me.x += 0.2;
    g.step(me);
  }
  const back = g.rx[base] - g.rx[tail];
  const sag = g.ry[base] - g.ry[tail];
  check(back > len * 0.85, 'and streams out behind one that flies', `tail ${back.toFixed(2)} m behind, ${sag.toFixed(2)} m below`);
  /* Land it: the ribbon lies on the floor. */
  me.y = 0.05;
  me.flying = false;
  for (let n = 0; n < 600; n += 1) {
    g.step(me);
  }
  check(Math.abs(g.ry[tail]) < 0.05, 'and lies on the floor under one that has landed', `tail at ${g.ry[tail].toFixed(3)} m`);
}

/* A cut by hand: bot 1's ribbon laid straight along +x from (0, 10, 0),
 * the pilot crossing it across z at a chosen point. */
function crossing(at, { cutter = ME, owner = 1, started = true } = {}) {
  const g = new RibbonCut(world(), { bots: 2, round: 'none', length: 'normal' }, 5);
  g.step(still(-50, 10, -50, true));
  drain(g);
  /* Park the bots' flying: they are not in the test. */
  g.isBot[1] = 0;
  g.isBot[2] = 0;
  if (started) {
    g.startedMs = 0;
    g.clockMs = RIBBON.graceMs + 10;
  }
  const L = g.linkLen;
  const base = owner * RIBBON_POINTS;
  for (let s = 0; s < RIBBON_POINTS; s += 1) {
    g.rx[base + s] = s * L;
    g.ry[base + s] = 10;
    g.rz[base + s] = 0;
  }
  g.x[owner] = -0.1;
  g.y[owner] = 10;
  g.z[owner] = 0;
  g.xPrev[cutter] = at;
  g.yPrev[cutter] = 10;
  g.zPrev[cutter] = -0.5;
  g.x[cutter] = at;
  g.y[cutter] = 10;
  g.z[cutter] = 0.5;
  g.cutsBy(cutter, g.clockMs);
  const tally = {};
  const evs = [];
  for (let e = 0; e < g.eventCount; e += 1) {
    evs.push({ ...g.events[e] });
  }
  drain(g, tally);
  return {
    g, tally, evs, L,
  };
}

{
  const { L, g: g0 } = crossing(0);
  const first = g0.firstLink;
  /* Through link 12 of 15: the cut is at the first link within reach,
   * which is within a link and a half of it. */
  const a = crossing(L * 11.5);
  const left = a.g.rCount[1];
  check(left >= 10 && left <= 12, 'a quad through a ribbon cuts it where it crossed', `${left} points left`);
  check(a.tally.cut === 1 && a.g.alive[1] === 1, 'and a long enough ribbon stays in', JSON.stringify(a.tally));
  check(a.evs[0] && a.evs[0].by === ME && a.evs[0].to === 1 && a.evs[0].end === RIBBON_POINTS && a.evs[0].at === left - 1,
    'the cut says who cut whose, and what fell', JSON.stringify(a.evs[0]));
  check(a.g.snips[ME] === 1 && a.g.cuts[ME] === 0, 'it counts as a snip, not a ribbon taken');

  const k = crossing(0.1);
  check(k.g.rCount[1] === RIBBON_POINTS && !k.tally.cut && !k.tally.out, 'a pass right by the quad, through the knot, cuts nothing', JSON.stringify(k.tally));
  check(first >= 3, 'the knot is more than the cut\'s reach', `first cuttable link ${first}`);

  const o = crossing(L * (first + 0.5));
  check(o.g.rCount[1] === 0 && o.g.alive[1] === 0, 'a ribbon cut down to a stub is gone, and its pilot is out');
  check(o.tally.out === 1 && o.g.cuts[ME] === 1, 'and that is a ribbon taken', JSON.stringify(o.tally));

  const self = crossing(L * 8, { cutter: 1, owner: 1 });
  check(self.g.rCount[1] === RIBBON_POINTS, 'nobody cuts their own ribbon');

  const early = crossing(L * 8, { started: false });
  check(!early.g.cutting, 'nothing can be cut before the round starts');

  const miss = crossing(L * 8);
  miss.g.zPrev[ME] = 2;
  miss.g.z[ME] = 3;
  miss.g.rCount[1] = RIBBON_POINTS;
  miss.g.rSafeUntil[1] = 0;
  miss.g.cutsBy(ME, miss.g.clockMs);
  check(miss.g.rCount[1] === RIBBON_POINTS, 'a pass two metres off cuts nothing');

  const twice = crossing(L * 13.5);
  const c1 = twice.g.rCount[1];
  twice.g.xPrev[ME] = L * (c1 - 3.5);
  twice.g.x[ME] = L * (c1 - 3.5);
  twice.g.cutsBy(ME, twice.g.clockMs + 10);
  check(twice.g.rCount[1] === c1, 'a ribbon just cut cannot be cut again at once');
  twice.g.cutsBy(ME, twice.g.clockMs + RIBBON.safeMs + 10);
  check(twice.g.rCount[1] < c1, 'and can be once the moment has passed', `${c1} then ${twice.g.rCount[1]} points`);
}

/* The last with a ribbon wins. */
{
  const g = new RibbonCut(world(), { bots: 1, round: 'none' }, 9);
  const me = still(-40, 10, -40);
  g.step(me);
  for (let n = 0; n < 300; n += 1) {
    g.step(me);
  }
  drain(g);
  g.isBot[1] = 0;
  const L = g.linkLen;
  const base = RIBBON_POINTS;
  for (let s = 0; s < RIBBON_POINTS; s += 1) {
    g.rx[base + s] = s * L;
    g.ry[base + s] = 10;
    g.rz[base + s] = 0;
  }
  g.xPrev[ME] = L * (g.firstLink + 0.5);
  g.zPrev[ME] = -0.5;
  g.x[ME] = L * (g.firstLink + 0.5);
  g.z[ME] = 0.5;
  g.cutsBy(ME, g.clockMs);
  /* The next feed sees one left. */
  g.isBot[1] = 1;
  me.x = g.x[ME];
  me.z = g.z[ME];
  g.step(me);
  check(g.over && g.winner === ME, 'the last with a ribbon wins', `over ${g.over} winner ${g.winner}`);
  const rows = g.standings();
  check(rows[0].slot === ME && rows[0].alive && !rows[1].alive, 'and tops the table');
}

/* The pilot cut out ends the round, a bot wins. */
{
  const g = new RibbonCut(world(), { bots: 2, round: 'none' }, 11);
  const me = still(-40, 10, -40);
  for (let n = 0; n < 300; n += 1) {
    g.step(me);
  }
  /* Both bots still in, parked apart. */
  for (let i = 1; i <= 2; i += 1) {
    g.isBot[i] = 0;
    g.alive[i] = 1;
    g.x[i] = i * 30;
    g.z[i] = 40;
    g.rCount[i] = RIBBON_POINTS;
    g.layRibbon(i);
  }
  g.rCount[ME] = 0;
  g.alive[ME] = 0;
  g.outAt[ME] = g.clockMs;
  g.step(me);
  check(g.over && g.winner === -1, 'the pilot cut out ends the round, with nobody the winner while two bots fly', `over ${g.over} winner ${g.winner}`);
  const rows = g.standings();
  check(rows[rows.length - 1].slot === ME, 'and the pilot is last in the table');
}

/* The clock. */
{
  const g = new RibbonCut(world(), { bots: 1, round: '2m' }, 12);
  /* Park the bot far away so nothing is cut. */
  const me = still(0, 10, 0);
  let n = 0;
  for (; n < 20000 && !g.over; n += 1) {
    g.isBot[1] = 0;
    g.x[1] = 70;
    g.y[1] = 10;
    g.z[1] = 70;
    g.step(me);
  }
  const ms = g.overAtMs - g.startedMs;
  check(g.over && ms === RIBBON_ROUNDS['2m'], 'the clock ends a round', `ended after ${ms} ms`);
  check(g.winner === -1, 'two whole ribbons when the clock runs out is a draw', `winner ${g.winner}`);
}

/* A jump is not a cut. */
{
  const g = new RibbonCut(world(), { bots: 1, round: 'none' }, 13);
  const me = still(-40, 10, -40);
  for (let n = 0; n < 300; n += 1) {
    g.step(me);
  }
  g.isBot[1] = 0;
  const L = g.linkLen;
  const base = RIBBON_POINTS;
  for (let s = 0; s < RIBBON_POINTS; s += 1) {
    g.rx[base + s] = s * L;
    g.ry[base + s] = 10;
    g.rz[base + s] = 0;
  }
  g.x[1] = -0.1;
  g.y[1] = 10;
  g.z[1] = 0;
  /* Put the pilot straight across the ribbon: from (-40, 10, -40) to the
   * far side of it in one feed. */
  me.x = L * 8;
  me.z = 30;
  g.step(me, false);
  check(g.rCount[1] === RIBBON_POINTS, 'a quad put somewhere else in one feed cuts nothing on the way');
}

/* Cost: seven bots, per feed. */
{
  const g = new RibbonCut(world(), { bots: 7, skill: 'ace', round: 'none', length: 'long' }, 3);
  const me = {};
  for (let n = 0; n < 500; n += 1) {
    g.step(pilotAt(n, me));
    g.eventCount = 0;
  }
  /* Keep everybody in, so the cost is the most it can be. */
  const N = 20000;
  let t = 0n;
  for (let n = 0; n < N; n += 1) {
    for (let i = 0; i < MAX_PILOTS; i += 1) {
      if (!g.alive[i]) {
        g.alive[i] = 1;
        g.rCount[i] = RIBBON_POINTS;
        g.layRibbon(i);
      }
    }
    g.over = false;
    pilotAt(n, me);
    const t0 = process.hrtime.bigint();
    g.step(me);
    t += process.hrtime.bigint() - t0;
    g.eventCount = 0;
  }
  const us = Number(t) / 1000 / N;
  console.log(`  cost  ${us.toFixed(2)} us a feed, ${(us * 100 / 60 / 1000).toFixed(4)} ms a 60 Hz frame`);
  check(us < 30, 'a feed with seven aces and eight ribbons is under 30 us', `${us.toFixed(2)} us`);
}

/*
 * A ROOM. The board's round heard as src/net/together.js passes it on, two
 * remote pilots drawn from poses, and this page's quad flown through one of
 * their ribbons: the cut goes out to the board and is not made here, and
 * the board's word back is what shortens the ribbon.
 */
{
  let wall = 1000;
  const g = new RibbonRoom(world(), { now: () => wall });
  g.setYou(5, true);
  const pose = (x, y, z) => ({
    px: x, py: y, pz: z, qx: 0, qy: 0, qz: 0, qw: 1, cut: false,
  });
  const feed = (me, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      g.remote(7, pose(0, 10, 0), { handle: 'Kiwi' });
      g.remote(9, pose(40, 10, 40), { handle: 'Nori' });
      g.step(me);
      wall += 10;
    }
  };
  /* Nose -Z, so the ribbon trails toward +Z from the quad at the origin. */
  const r7 = g.slotFor(7);
  feed(still(-20, 10, -20), 50);
  check(g.rCount[r7] === RIBBON_POINTS && g.live(r7), 'out of a round, a pilot drawn in the room flies a whole ribbon');
  check(g.banner.startsWith('Press G'), 'the host is told how to start', g.banner);
  check(!g.cutting, 'nothing can be cut before a round');
  const rows = [5, 7, 9].map((id) => ({
    id, count: RIBBON_POINTS, out: false, outAt: 0, cuts: 0, snips: 0,
  }));
  g.heard({
    phase: 'count', length: 'normal', round: '2m', n: 1, goAt: 0, endAt: 0, winner: null, rows,
  }, wall + 2000, wall + 122000);
  check(g.banner === 'Ribbons out in 2', 'the count is on the page\'s clock', g.banner);
  feed(still(-20, 10, -20), 400);
  g.heard({ ...g.state, phase: 'live' }, g.goLocal, g.endLocal);
  feed(still(-20, 10, -20), 20);
  check(g.cutting, 'past GO and its grace, cuts can land');
  check(g.leftMs() > 110000 && g.leftMs() <= 120000, 'the clock runs from the board\'s end', String(g.leftMs()));
  /* Across the ribbon trailing behind pilot 7, three metres back. */
  const j = r7 * RIBBON_POINTS + 10;
  const cx = g.rx[j];
  const cz = g.rz[j];
  const cy = g.ry[j];
  feed(still(cx - 2, cy, cz));
  let sent = null;
  for (let n = 0; n < 8 && !sent; n += 1) {
    feed(still(cx - 1.5 + n * 0.5, cy, cz));
    sent = g.takeOutbox();
  }
  check(sent && sent.length === 1 && sent[0].t === 'rbCut' && sent[0].to === 7 && sent[0].n === 1,
    'a ribbon flown through is sent to the board as a cut', JSON.stringify(sent));
  check(g.rCount[r7] === RIBBON_POINTS, 'and is not cut on this page until the board says so');
  feed(still(cx + 2, cy, cz), 2);
  check(!g.takeOutbox(), 'the same ribbon is not asked about twice before the board answers');
  g.applyCut({
    n: 1, by: 5, to: 7, s: sent[0].s, out: false,
  });
  check(g.rCount[r7] === sent[0].s && g.events[0].type === 'cut' && g.events[0].by === ME && g.events[0].to === r7,
    'the board\'s word cuts it, as the pilot\'s own cut', `${g.rCount[r7]} ${g.events[0] && g.events[0].type}`);
  g.eventCount = 0;
  g.applyCut({
    n: 0, by: 5, to: 7, s: 5, out: true,
  });
  check(g.rCount[r7] === sent[0].s, 'a word about another round is not heard');
  g.applyCut({
    n: 1, by: 9, to: 5, s: 5, out: true,
  });
  check(!g.alive[ME] && g.rCount[ME] === 0 && g.banner.startsWith('You are out'), 'cut out by a remote pilot', g.banner);
  g.eventCount = 0;
  const end = g.state.rows.map((r) => (r.id === 5 ? { ...r, count: 0, out: true } : r.id === 7 ? { ...r, count: sent[0].s } : r));
  g.heard({
    ...g.state, phase: 'results', winner: 9, rows: end,
  }, 0, 0);
  check(g.over && g.winner === g.slotFor(9) && g.nameOf(g.winner) === 'Nori', 'the board\'s winner, by name');
  wall += 9500;
  check(g.sinceOverMs() >= 9000, 'the results time out on this page');
  feed(still(-20, 10, -20));
  g.reset();
  check(!g.over && g.rCount[ME] === RIBBON_POINTS && g.banner.startsWith('Press G'), 'then everybody flies a whole ribbon again', g.banner);
  /* A remote pilot gone quiet is not drawn and cannot be cut. */
  wall += 2000;
  check(!g.live(r7), 'a pilot not heard from is not in the air here');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
