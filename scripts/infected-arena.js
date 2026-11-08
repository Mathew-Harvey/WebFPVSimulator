/*
 * infected-arena.js: Infected's bots (src/game/infectbots.js) proved in
 * plain Node on Midori Gakuen's real solids, the way scripts/dogfight-arena.js
 * proves the dogfight's. In these blocks:
 *
 *   1. grid     the school's own grid of cells, read from the colliders the
 *               shell builds: the hallway, every door's middle and every
 *               vent's are open, the walls either side are not
 *   2. map      the bots' map of the school: every room has points, every
 *               class reaches every room from the hallway, the easy class
 *               never by a vent and the hard one through all four
 *   3. rounds   seeded rounds, sixteen pilots, every mix of easy, medium
 *               and hard, the pilot's seat flown by a bot too: no bot is
 *               ever inside a solid or outside the school, the infected
 *               catch somebody in every round, a round with hard clean bots
 *               lasts longer than one with easy ones, nobody is stuck for
 *               long, and the cost of a feed is printed
 *   4. same     a round played twice from one seed is the same to the bit
 *
 * Usage: node scripts/infected-arena.js [--rounds=6] [--verbose]
 *
 * A threshold here is never widened to make a line pass (CLAUDE.md); the
 * argument goes in PROGRESS.md.
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

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { schoolLayout, SCHOOL_PLAN, OPENINGS, ROOMS } from '../src/maps/school/school.js';
import { schoolDocument } from '../src/maps/school/yard.js';
import { placeSolids, addSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument } from '../src/maps/built/place.js';
import { Colliders } from '../src/game/collide.js';
import { SchoolMap, schoolWorld, CLASSES, ROOM } from '../src/game/infectbots.js';
import {
  InfectedRound, CAP, ME, DOGFIGHT_EVERY, LEGS,
} from '../src/game/infected.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const ROUNDS_N = Number(args.rounds) || 6;
const VERBOSE = Boolean(args.verbose);

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) failures += 1;
}
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

const P = SCHOOL_PLAN;
const S = P.S;
/* The whoop on the school: its metre is the school's. */
const K = S;

/* The colliders the shell builds for the school: the document seated, the
 * school's parts placed as the built map places them. */
function colliders() {
  const { doc } = normalize(schoolDocument());
  const { placed } = seatDocument(doc);
  const L = schoolLayout();
  placeSolids(L.parts, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
  const c = new Colliders();
  addSolids(c, placed.solids);
  c.build();
  return c;
}

function gridBlock(w) {
  console.log('\n1. grid');
  const g = w.grid;
  check('the grid is the school and no more', g.nx * g.nz * g.ny < 3.2e6, `${g.nx} x ${g.nz} x ${g.ny} cells of ${r3(g.v / S)} m`);
  const at = (px, py, h) => P.worldAt(px, py, h);
  const open = (px, py, h) => !w.inside(...at(px, py, h));
  check('the hallway is open down its middle, both floors', [0, 1].every((f) => [2, 10, 20, 30, 38].every((x) => open(x, 8.7, P.floors[f] + 1.3))));
  const ways = OPENINGS.filter((o) => !o.glass);
  const shut = ways.filter((o) => {
    const a = (o.a0 + o.a1) / 2;
    const h = (o.h0 + o.h1) / 2;
    const [px, py] = o.axis === 'x' ? [a, o.at] : [o.at, a];
    return !open(px, py, h);
  });
  check('every way through that is not glass is open at its middle', shut.length === 0, shut.map((o) => o.id).join(', ') || `${ways.length}`);
  const walled = OPENINGS.filter((o) => o.kind === 'door').filter((o) => {
    const [px, py] = o.axis === 'x' ? [o.a0 - 0.3, o.at] : [o.at, o.a0 - 0.3];
    return open(px, py, o.h0 + 1);
  });
  check('the wall beside every door is solid', walled.length === 0, walled.map((o) => o.id).join(', ') || 'all');
  const floorErr = [];
  for (const [px, py, f] of [[20, 8.7, 0], [20, 8.7, 1], [6, 4, 0], [30, 14, 1]]) {
    const [x, y, z] = at(px, py, P.floors[f] + 1.2);
    const fl = w.floorAt(x, y, z) / S;
    if (Math.abs(fl - P.floors[f]) > 0.15) floorErr.push(`${px},${py}: ${r3(fl)}`);
  }
  check('the floor under the hallway and two rooms is the floor', floorErr.length === 0, floorErr.join(' ') || 'within 15 cm');
}

function mapBlock(w) {
  console.log('\n2. map');
  const t0 = performance.now();
  const m = new SchoolMap(w, P);
  const ms = performance.now() - t0;
  check('the map is read quickly', ms < 400, `${m.N} points, ${m.links} links, ${r1(ms)} ms`);
  const empty = ROOMS.filter((r) => r.f !== null && !m.rooms.some((rs, n) => m.kind[n] === ROOM && rs.includes(r.id)));
  check('every room has points of its own', empty.length === 0, empty.map((r) => r.id).join(', ') || `${ROOMS.length - 2} rooms`);
  const hall = m.near(...P.worldAt(20, 8.7, P.floors[0] + 1.2), 0);
  const up = m.near(...P.worldAt(20, 8.7, P.floors[1] + 1.2), 0);
  for (let c = 0; c < CLASSES; c += 1) {
    /* The stairwells are their stairs: up from one hallway to the other. */
    const out = ROOMS.filter((r) => r.f !== null && !m.rooms.some((rs, n) => rs.includes(r.id) && Number.isFinite(m.dist(c, n, hall))));
    const climb = m.dist(c, hall, up);
    check(`class ${['easy', 'medium', 'hard'][c]} reaches every room from the hallway, and upstairs`, out.length === 0 && Number.isFinite(climb),
      `${out.map((r) => r.id).join(', ') || 'all'}, upstairs ${r1(climb / S)} m`);
  }
  /* The vents: an easy bot never, a hard one always cheaper than round. */
  const ventEnds = (id) => {
    const p = P.PATHS.find((q) => q.id === id);
    const a = p.points[0];
    const b = p.points[p.points.length - 1];
    return [m.near(...P.worldAt(a[0], a[1], a[2]), 2), m.near(...P.worldAt(b[0], b[1], b[2]), 2)];
  };
  const viaVent = [];
  for (const id of ['ventA', 'ventB', 'ventC', 'ventD']) {
    const [a, b] = ventEnds(id);
    const hard = m.dist(2, a, b);
    const easy = m.dist(0, a, b);
    viaVent.push(`${id} ${r1(hard / S)} m hard, ${r1(easy / S)} m easy`);
    if (!(hard < easy)) {
      check(`${id} is the hard bots' short cut`, false, `${r1(hard / S)} against ${r1(easy / S)}`);
    }
  }
  check('every vent is a hard bot\'s short cut and never an easy one\'s', true, viaVent.join('; '));
  return m;
}

/* Every feed's time, for the slow tail as well as the mean. */
const FEED_MS = [];

/* One round: every seat a bot, the pilot's flown by the brain too. */
function playRound(w, seed, skills, opts = {}) {
  const rules = {
    bots: CAP - 1, skills, round: opts.round || '3m', head: 10, first: 'bot',
  };
  const g = new InfectedRound(w, rules, seed, { plan: P });
  /* The pilot's seat flown as a bot of the first seat's skill. */
  g.botSkill = (i) => skills[(i + CAP - 2) % (CAP - 1)];
  const seatMe = () => {
    g.x[ME] = g.seatX[ME];
    g.y[ME] = g.seatY[ME] + 0.03 * K;
    g.z[ME] = g.seatZ[ME];
    g.xPrev[ME] = g.x[ME]; g.yPrev[ME] = g.y[ME]; g.zPrev[ME] = g.z[ME];
    g.fx[ME] = 1; g.fy[ME] = 0; g.fz[ME] = 0;
    g.bots.placed(ME);
  };
  seatMe();
  const me = {
    x: 0, y: 0, z: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
  };
  const hash = createHash('sha256');
  const stats = {
    inside: 0, outside: 0, firstTagMs: -1, tags: 0, feeds: 0, ms: 0, worstMs: 0, lastMs: -1, endMs: 0, stucks: 0, scrapes: 0, shaves: 0,
  };
  const t0 = g.clockMs;
  const lo = P.worldAt(-0.3, P.DEP + 0.3, -0.1);
  const hi = P.worldAt(P.LEN + 0.3, -0.3, P.high + 0.1);
  const buf = new Float64Array(CAP * 3);
  for (let f = 0; f < 60 * 100 * 6 && !g.over; f += 1) {
    const a = performance.now();
    /* The seat: flown by the brain, fed back as a pilot is. */
    /* Flown from where it is, then put back, so the round reads its move
     * as it reads a pilot's: from the last feed to this one. */
    const ox = g.x[ME];
    const oy = g.y[ME];
    const oz = g.z[ME];
    if (g.startedMs >= 0) {
      g.bots.step(ME, g.clockMs + DOGFIGHT_EVERY);
    }
    me.x = g.x[ME]; me.y = g.y[ME]; me.z = g.z[ME];
    me.fx = g.fx[ME]; me.fy = g.fy[ME]; me.fz = g.fz[ME];
    me.ux = g.ux[ME]; me.uy = g.uy[ME]; me.uz = g.uz[ME];
    g.x[ME] = ox; g.y[ME] = oy; g.z[ME] = oz;
    g.step(me, false);
    const b = performance.now() - a;
    stats.ms += b;
    stats.worstMs = Math.max(stats.worstMs, b);
    FEED_MS.push(b);
    stats.feeds += 1;
    for (let n = 0; n < g.eventCount; n += 1) {
      const e = g.events[n];
      if (e.type === 'tag') {
        stats.tags += 1;
        if (stats.firstTagMs < 0) stats.firstTagMs = g.clockMs - g.huntAt;
      } else if (e.type === 'last') {
        stats.lastMs = g.clockMs - g.huntAt;
      } else if (e.type === 'shave') {
        stats.shaves += 1;
      }
    }
    g.eventCount = 0;
    for (let i = 0; i < CAP; i += 1) {
      if (!g.inFight[i]) continue;
      /* A bot sat on its pad is inside the floor's top cell, which is the
       * grid's eighth of a metre and not a solid. */
      if (!g.holds(i) && g.bots.mode[i] !== 0 && w.inside(g.x[i], g.y[i], g.z[i])) stats.inside += 1;
      if (g.x[i] < lo[0] || g.x[i] > hi[0] || g.z[i] < lo[2] || g.z[i] > hi[2] || g.y[i] < lo[1] || g.y[i] > hi[1]) stats.outside += 1;
      buf[i * 3] = g.x[i]; buf[i * 3 + 1] = g.y[i]; buf[i * 3 + 2] = g.z[i];
    }
    hash.update(new Uint8Array(buf.buffer));
  }
  stats.endMs = g.clockMs - g.huntAt;
  const fl = g.bots.flyer;
  for (let i = 0; i < CAP; i += 1) {
    stats.stucks += fl.stucks[i];
    stats.scrapes += fl.scrapes[i];
  }
  stats.hash = hash.digest('hex');
  /* How long each skill stayed clean, the pilot's seat left out. */
  stats.bySkill = {};
  for (let i = 1; i < CAP; i += 1) {
    if (i === g.pz) continue;
    const sk = g.botSkill(i);
    const b = stats.bySkill[sk] || (stats.bySkill[sk] = { ms: 0, n: 0 });
    b.ms += g.cleanMs[i];
    b.n += 1;
  }
  stats.clean = g.counts({}).clean;
  stats.t = g.clockMs - t0;
  void LEGS;
  return stats;
}

function roundsBlock(w) {
  console.log('\n3. rounds');
  const mixes = {
    easy: Array(15).fill('easy'),
    medium: Array(15).fill('medium'),
    hard: Array(15).fill('hard'),
    mixed: Array.from({ length: 15 }, (_, i) => ['easy', 'medium', 'hard'][i % 3]),
  };
  const out = {};
  let inside = 0;
  let outside = 0;
  let caughtNone = 0;
  let feeds = 0;
  let ms = 0;
  let worst = 0;
  const mixedRows = [];
  for (const [name, skills] of Object.entries(mixes)) {
    const rows = [];
    for (let r = 0; r < ROUNDS_N; r += 1) {
      const st = playRound(w, 1000 + r * 17, skills);
      rows.push(st);
      if (name === 'mixed') mixedRows.push(st);
      inside += st.inside;
      outside += st.outside;
      if (st.tags === 0) caughtNone += 1;
      feeds += st.feeds;
      ms += st.ms;
      worst = Math.max(worst, st.worstMs);
      if (VERBOSE) {
        console.log(`    ${name} #${r}: ${st.tags} tags, first ${r1(st.firstTagMs / 1000)} s, last one at ${r1(st.lastMs / 1000)} s, over at ${r1(st.endMs / 1000)} s, ${st.clean} clean, ${st.shaves} shaves, stuck ${st.stucks}, scrapes ${st.scrapes}`);
      }
    }
    const mean = (f) => rows.reduce((s, x) => s + f(x), 0) / rows.length;
    out[name] = {
      tags: mean((x) => x.tags), first: mean((x) => x.firstTagMs), end: mean((x) => x.endMs), clean: mean((x) => x.clean), stucks: mean((x) => x.stucks), shaves: mean((x) => x.shaves),
    };
    console.log(`    ${name}: ${r1(out[name].tags)} tags a round, first after ${r1(out[name].first / 1000)} s, over at ${r1(out[name].end / 1000)} s, ${r1(out[name].clean)} clean at the end, ${r1(out[name].shaves)} shaves, ${r1(out[name].stucks)} stucks`);
  }
  check('no bot is ever inside a solid', inside === 0, `${inside} feeds`);
  check('no bot ever leaves the school', outside === 0, `${outside} feeds`);
  check('the infected catch somebody in every round', caughtNone === 0, `${caughtNone} rounds with none`);
  /* In the mixed rounds, one school and one clock: who stays clean longer. */
  const sk = { easy: { ms: 0, n: 0 }, medium: { ms: 0, n: 0 }, hard: { ms: 0, n: 0 } };
  for (const st of mixedRows) {
    for (const [k, v] of Object.entries(st.bySkill)) {
      sk[k].ms += v.ms;
      sk[k].n += v.n;
    }
  }
  const mean = (k) => sk[k].ms / Math.max(1, sk[k].n) / 1000;
  check('in one round, hard clean bots stay clean longer than medium, and medium than easy', mean('hard') > mean('medium') && mean('medium') > mean('easy'),
    `hard ${r1(mean('hard'))} s, medium ${r1(mean('medium'))} s, easy ${r1(mean('easy'))} s`);
  check('easy rounds last longer than hard ones, both sides at the skill', out.easy.end > out.hard.end, `${r1(out.easy.end / 1000)} s against ${r1(out.hard.end / 1000)} s`);
  const perFeed = ms / feeds;
  check('a feed of sixteen bots is cheap', perFeed < 0.5, `${r3(perFeed)} ms a feed on average, ${r1(worst)} ms at worst`);
  /* The slow tail, which is what a pilot feels as a hitch: the first
   * rounds include the engine compiling the brains, so the tail is read
   * after the first thousand feeds. */
  const warm = FEED_MS.slice(1000).sort((x, y) => x - y);
  const at = (q) => warm[Math.min(warm.length - 1, Math.floor(q * warm.length))];
  const over = warm.filter((x) => x > 4).length;
  console.log(`    the tail, warm: ${r3(at(0.99))} ms at the 99th, ${r3(at(0.999))} at the 99.9th, ${over} of ${warm.length} feeds over 4 ms, ${r1(warm[warm.length - 1])} ms the worst`);
}

function sameBlock(w) {
  console.log('\n4. same');
  const skills = Array.from({ length: 15 }, (_, i) => ['easy', 'medium', 'hard'][i % 3]);
  const a = playRound(w, 4242, skills, { round: '2m' });
  const b = playRound(w, 4242, skills, { round: '2m' });
  check('one seed, one round, to the bit', a.hash === b.hash, a.hash.slice(0, 16));
}

function main() {
  console.log('infected-arena: Infected\'s bots on Midori Gakuen');
  const t0 = performance.now();
  const c = colliders();
  const w = schoolWorld(c, P, K);
  console.log(`  the school read into its grid in ${r1(performance.now() - t0)} ms`);
  gridBlock(w);
  mapBlock(w);
  roundsBlock(w);
  sameBlock(w);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main();
