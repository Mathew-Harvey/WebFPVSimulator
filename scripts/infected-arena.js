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
 *   5. room     a room's round on two pages: seats, holds, the board's word
 *               making a tag and a shave, a bot's tag from the host's page,
 *               the last one and the table, and the infection handed on
 *               when the only infected pilot leaves
 *   6. rules    the solo round's rules one by one: who starts infected, the
 *               holds, the chain x1 to x4 and its reset, the last one and
 *               the cut clock, the closer and last caught bonuses, the
 *               bell's survivor and outlasted bonuses, a round of two, three
 *               rounds a match with the first caught starting the next, the
 *               glass tank stopping a tag, the close shave and its cool
 *               down, and the sniff's cadence
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
import {
  SchoolMap, schoolWorld, CLASSES, ROOM, FLEE, JUKE,
} from '../src/game/infectbots.js';
import {
  InfectedRound, CAP, ME, DOGFIGHT_EVERY, LEGS, TAG_R, SHAVE_R, POINTS, CHAIN_MS, CHAIN_MAX, LAST_MS, SNIFF_EVERY,
} from '../src/game/infected.js';
import { InfectedRoom } from '../src/game/infectedroom.js';

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
    inside: 0, outside: 0, firstTagMs: -1, tags: 0, feeds: 0, ms: 0, worstMs: 0, lastMs: -1, endMs: 0, stucks: 0, scrapes: 0, shaves: 0, escape: {},
  };
  const t0 = g.clockMs;
  const lo = P.worldAt(-0.3, P.DEP + 0.3, -0.1);
  const hi = P.worldAt(P.LEN + 0.3, -0.3, P.high + 0.1);
  const buf = new Float64Array(CAP * 3);
  /* When each bot began running from somebody, -1 while it is not. */
  const runAt = new Float64Array(CAP).fill(-1);
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
        /* Caught running: how long the run lasted, by the runner's skill. */
        if (e.to !== ME && runAt[e.to] >= 0) {
          const sk = g.botSkill(e.to);
          const b = stats.escape[sk] || (stats.escape[sk] = { ms: 0, n: 0 });
          b.ms += g.clockMs - runAt[e.to];
          b.n += 1;
        }
      } else if (e.type === 'last') {
        stats.lastMs = g.clockMs - g.huntAt;
      } else if (e.type === 'shave') {
        stats.shaves += 1;
      }
    }
    g.eventCount = 0;
    for (let i = 0; i < CAP; i += 1) {
      const md = g.bots.mode[i];
      const running = !g.inf[i] && (md === FLEE || md === JUKE);
      if (!running) runAt[i] = -1;
      else if (runAt[i] < 0) runAt[i] = g.clockMs;
    }
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
  /* Hard against medium only. Medium against easy was a coin flip on main
   * as well (medium outlasted easy in 3 of 6 rounds, paired), so it is not
   * asserted: the owner's pick of 2026-11-09, "Swap it for the getaway
   * check" (the line below). It is still printed. */
  check('in one round, hard clean bots stay clean longer than medium', mean('hard') > mean('medium'),
    `hard ${r1(mean('hard'))} s, medium ${r1(mean('medium'))} s, easy ${r1(mean('easy'))} s`);
  /* And the thing a pilot chasing them feels: once one is running, how
   * long it lasts. The owner, 2026-11-09: "its way too easy to catch the
   * bots". Stayed clean, above, is mostly how long a bot goes unfound,
   * and an easy bot that sits still in its hiding place goes unfound
   * about as long as a medium one that moves (see PROGRESS.md of that
   * day); this is the skill at getting away. */
  const esc = { easy: { ms: 0, n: 0 }, medium: { ms: 0, n: 0 }, hard: { ms: 0, n: 0 } };
  for (const st of mixedRows) {
    for (const [k, v] of Object.entries(st.escape)) {
      esc[k].ms += v.ms;
      esc[k].n += v.n;
    }
  }
  const run = (k) => esc[k].ms / Math.max(1, esc[k].n) / 1000;
  check('once one is running, a hard clean bot gets away longer than a medium, and a medium than an easy', run('hard') > run('medium') && run('medium') > run('easy'),
    `caught ${r1(run('hard'))} s into a run, ${r1(run('medium'))} s and ${r1(run('easy'))} s`);
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

/*
 * A ROOM, two pages and a board played by hand: the host's page (pilot 1,
 * flying bots 201 and 202) and a friend's (pilot 2). What is checked is
 * what each page does with the board's word and what it says back.
 */
function roomBlock(w) {
  console.log('\n5. room');
  let clock = 1000;
  const now = () => clock;
  const toLocal = (t) => t;
  const host = new InfectedRoom(w, { now, seed: 7, pen: { plan: P } });
  const pal = new InfectedRoom(w, { now, seed: 8, pen: { plan: P } });
  const seats = [{ id: 201, name: 'MOCHI', skill: 'ace' }, { id: 202, name: 'GIZMO', skill: 'rookie' }];
  host.setYou(1, true);
  pal.setYou(2, false);
  const state = {
    phase: 'pit', round: '2m', head: 5, first: 'me', n: 0, leg: 0, goAt: 0, huntAt: 0, endAt: 0, nextAt: 0, pz: -1, gold: -1, winner: null, rows: [],
  };
  host.heard(state, toLocal);
  pal.heard(state, toLocal);
  host.setBots(seats);
  pal.setBots(seats);
  const b1 = host.slotOf(201);
  const b2 = host.slotOf(202);
  const onPad = (g, i) => Math.hypot(g.x[i], g.z[i]) > 1 && g.y[i] > 0;
  check('a room\'s bots sit on pads of their own in the pit, on the host\'s page', b1 > 0 && b2 > 0 && onPad(host, b1) && onPad(host, b2)
    && Math.hypot(host.x[b1] - host.x[b2], host.z[b1] - host.z[b2]) > K);
  check('flown by the host\'s page only', !host.puppet[b1] && pal.puppet[pal.slotOf(201)] === 1);
  check('their skills are the seats\'', host.botSkill(b1) === 'hard' && host.botSkill(b2) === 'easy');
  /* Where the pages' pilots are, as each page is told the other's. */
  const meOf = (g) => ({
    x: g.seatX[ME], y: g.seatY[ME] + 0.03 * K, z: g.seatZ[ME], fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: false,
  });
  const drawn = (g, id, x, y, z) => g.remote(id, {
    px: x, py: y, pz: z, qx: 0, qy: 0, qz: 0, qw: 1, cut: false,
  }, { handle: `P${id}`, avatar: null });
  drawn(host, 2, 0, 0, 0);
  drawn(pal, 1, 0, 0, 0);
  const rows = (o) => [
    { id: 1, inf: true, pad: -1, pts: 0, total: 0, tags: 0, shaves: 0, chain: 0, caughtAt: 0, last: false, left: false, cleanMs: 0, ...(o[1] || {}) },
    { id: 2, inf: false, pad: 0, pts: 0, total: 0, tags: 0, shaves: 0, chain: 0, caughtAt: 0, last: false, left: false, cleanMs: 0, ...(o[2] || {}) },
    { id: 201, inf: false, pad: 1, pts: 0, total: 0, tags: 0, shaves: 0, chain: 0, caughtAt: 0, last: false, left: false, cleanMs: 0, ...(o[201] || {}) },
    { id: 202, inf: false, pad: 2, pts: 0, total: 0, tags: 0, shaves: 0, chain: 0, caughtAt: 0, last: false, left: false, cleanMs: 0, ...(o[202] || {}) },
  ];
  const goAt = clock + 5000;
  const count = {
    ...state, phase: 'count', n: 1, goAt, huntAt: goAt + 5000, endAt: goAt + 5000 + 120_000, pz: 1, rows: rows({}),
  };
  const hostSerial = host.seatSerial;
  host.heard(count, toLocal);
  pal.heard(count, toLocal);
  const [tx, , tz] = P.worldAt(P.TANK_PAD.px, P.TANK_PAD.py, 0);
  const [p0x, , p0z] = P.worldAt(P.PADS[0].px, P.PADS[0].py, 0);
  check('the round seats this page\'s pilot: the first infected in the tank', host.seatSerial === hostSerial + 1
    && Math.hypot(host.seatX[ME] - tx, host.seatZ[ME] - tz) < 0.01 && host.inf[ME] === 1 && host.pz === ME);
  check('and the friend on the pad the board dealt them', Math.hypot(pal.seatX[ME] - p0x, pal.seatZ[ME] - p0z) < 0.01 && pal.inf[ME] === 0);
  check('everybody is held through the countdown', host.holdsMe() && pal.holdsMe() && host.phase === 'wait');
  const events = (g) => {
    const out = [];
    for (let n = 0; n < g.eventCount; n += 1) out.push(g.events[n].type);
    g.eventCount = 0;
    return out;
  };
  const feed = (g, me) => g.step(me, false);
  const both = (ms) => {
    const seen = { host: [], pal: [] };
    for (let t = 0; t < ms; t += DOGFIGHT_EVERY) {
      clock += DOGFIGHT_EVERY;
      feed(host, meOf(host));
      feed(pal, meOf(pal));
      seen.host.push(...events(host));
      seen.pal.push(...events(pal));
    }
    return seen;
  };
  let seen = both(5000);
  check('GO on the board\'s time, on both pages', seen.host.includes('go') && seen.pal.includes('go'));
  host.heard({ ...count, phase: 'live' }, toLocal);
  pal.heard({ ...count, phase: 'live' }, toLocal);
  check('the first infected stays held through the head start, the friend is free', host.holdsMe() && !pal.holdsMe() && host.phase === 'head');
  const padAt = [host.x[b1], host.z[b1]];
  seen = both(5200);
  check('the head start ends: out of the tank', seen.host.includes('free') && seen.pal.includes('free') && !host.holdsMe());
  seen = both(2000);
  check('the host\'s clean bots fly off their pads', Math.hypot(host.x[b1] - padAt[0], host.z[b1] - padAt[1]) > 0.3 * K);
  host.takeOutbox();
  /* The friend's quad right on the host's: the host's page says the tag,
   * once, and nothing is true until the board says it back. */
  const at = (g, slot, x, y, z) => {
    g.x[slot] = x; g.y[slot] = y; g.z[slot] = z;
  };
  const [hx, hy, hz] = P.worldAt(20, 8.7, P.floors[0] + 1.2);
  const meAt = { ...meOf(host), x: hx, y: hy, z: hz };
  drawn(host, 2, hx + 0.3 * K, hy, hz);
  clock += DOGFIGHT_EVERY;
  host.step(meAt, true);
  let out = host.takeOutbox() || [];
  const tag = out.find((m) => m.t === 'ifTag');
  check('a touch with nothing between is sent to the board as a tag', tag && tag.to === 2 && tag.by === undefined && tag.n === 1, JSON.stringify(out));
  check('and is not true until the board says so', host.inf[host.slotOf(2)] === 0);
  clock += DOGFIGHT_EVERY;
  drawn(host, 2, hx + 0.3 * K, hy, hz);
  host.step(meAt, false);
  out = host.takeOutbox() || [];
  check('the same touch is not sent again while the board answers', !out.some((m) => m.t === 'ifTag'));
  events(host);
  events(pal);
  const said = {
    t: 'ifTag', n: 1, by: 1, to: 2, got: POINTS.tag, chain: 1, last: false,
  };
  host.heardTag(said);
  pal.heardTag(said);
  const ev = (g) => {
    for (let n = 0; n < g.eventCount; n += 1) if (g.events[n].type === 'tag') return g.events[n];
    return null;
  };
  const he = ev(host);
  const pe = ev(pal);
  check('the board\'s word makes the tag, on both pages', host.inf[host.slotOf(2)] === 1 && pal.inf[ME] === 1 && he && he.by === ME && he.pts === POINTS.tag && pe && pe.to === ME);
  events(host);
  events(pal);
  /* A bot's tag goes from the host's page with the bot named. */
  const infected = {
    ...count, phase: 'live', rows: rows({ 2: { inf: true, caughtAt: clock }, 201: { inf: true, caughtAt: clock } }),
  };
  host.heard(infected, toLocal);
  pal.heard(infected, toLocal);
  const caughtAt = clock;
  both(12_000);
  check('a pilot caught keeps the alive points they had, and gets no more', pal.inf[ME] === 1 && pal.pts[ME] === POINTS.alive * Math.floor((caughtAt - count.huntAt) / 10000)
    && host.pts[host.slotOf(202)] === POINTS.alive * Math.floor((clock - count.huntAt) / 10000), `${pal.pts[ME]} ${host.pts[host.slotOf(202)]}`);
  at(host, b2, host.x[b1] + 0.3 * K, host.y[b1], host.z[b1]);
  clock += DOGFIGHT_EVERY;
  host.step(meOf(host), false);
  out = host.takeOutbox() || [];
  const botTag = out.find((m) => m.t === 'ifTag' && m.by === 201);
  check('the host\'s page says its bot\'s tag, naming the bot', botTag && botTag.to === 202, JSON.stringify(out));
  check('the friend\'s page judges nobody\'s bots', !(pal.takeOutbox() || []).some((m) => m.t === 'ifTag' && m.by));
  /* A close shave: the friend clean again in a new round, an infected
   * pilot close and then away. */
  const r2 = {
    ...count, phase: 'live', n: 2, leg: 1, goAt: clock - 20_000, huntAt: clock - 10_000, endAt: clock + 100_000, pz: 1, rows: rows({}),
  };
  host.heard(r2, toLocal);
  pal.heard(r2, toLocal);
  pal.takeOutbox();
  const px = pal.x[ME];
  const py = pal.y[ME] + 0.6 * K;
  const pz0 = pal.z[ME];
  const pme = { ...meOf(pal), x: px, y: py, z: pz0 };
  drawn(pal, 1, px + (TAG_R + SHAVE_R) * 0.5 * K, py, pz0);
  clock += DOGFIGHT_EVERY;
  pal.step(pme, true);
  drawn(pal, 1, px + 2.5 * K, py, pz0);
  clock += DOGFIGHT_EVERY;
  pal.step(pme, false);
  out = pal.takeOutbox() || [];
  const shave = out.find((m) => m.t === 'ifShave');
  check('a close shave of this page\'s pilot is sent to the board', shave && shave.by === 1 && shave.to === undefined, JSON.stringify(out));
  check('a clean pilot\'s alive points run on the board\'s clock', pal.pts[ME] === POINTS.alive * Math.floor((clock - r2.huntAt) / 10000), `${pal.pts[ME]}`);
  pal.heardShave({
    t: 'ifShave', n: 2, by: 1, to: 2, pts: POINTS.shave,
  });
  check('the board\'s word pays the shave', pal.shaves[ME] === 1 && pal.pts[ME] === POINTS.shave + POINTS.alive * Math.floor((clock - r2.huntAt) / 10000));
  /* The last one, then the table. */
  host.heard({ ...r2, gold: 2, endAt: clock + 45_000, rows: rows({ 201: { inf: true, caughtAt: clock }, 202: { inf: true, caughtAt: clock } }) }, toLocal);
  check('the last one is gold on the others\' pages', host.gold === host.slotOf(2) && host.phase === 'last');
  const results = {
    ...r2, phase: 'results', gold: -1, winner: 2, nextAt: clock + 9000, endAt: clock, rows: rows({ 2: { pts: 1800, total: 1800, last: true, cleanMs: 60_000 }, 201: { inf: true }, 202: { inf: true } }),
  };
  host.heard(results, toLocal);
  pal.heard(results, toLocal);
  const top = pal.matchStandings()[0];
  check('the round\'s table is the board\'s, and the last one wins', pal.over && pal.winner === ME && top.slot === ME && top.total === 1800 && host.winner === host.slotOf(2));
  check('with the match not over yet', !pal.matchOver && pal.leg === 1);
  check('nothing on a room page judges the round\'s end', host.judged === false);
  /* The hand off: the only infected pilot leaves in the head start, and
   * the board gives it to the friend as a tag by nobody (infHandOff in the
   * board's src/rooms.js). */
  const r3 = {
    ...count, phase: 'live', n: 3, leg: 0, goAt: clock - 1000, huntAt: clock + 4000, endAt: clock + 124_000, pz: 1, gold: -1, winner: null, nextAt: 0, rows: rows({}),
  };
  pal.heard(r3, toLocal);
  events(pal);
  check('a clean friend is free in the head start', !pal.holdsMe() && pal.phase === 'head');
  pal.heard({ ...r3, rows: rows({ 1: { left: true }, 2: { inf: true, caughtAt: clock } }) }, toLocal);
  const before = pal.ptsBase[ME];
  pal.heardTag({
    t: 'ifTag', n: 3, by: -1, to: 2, got: 0, chain: 0, last: false, hand: true,
  });
  let handEv = null;
  for (let n = 0; n < pal.eventCount; n += 1) if (pal.events[n].type === 'tag') handEv = pal.events[n];
  check('handed the infection, the friend is infected, with no tagger and no points', pal.inf[ME] === 1 && handEv && handEv.by < 0 && handEv.to === ME
    && handEv.pts === 0 && pal.ptsBase[ME] === before, JSON.stringify(handEv && { by: handEv.by, to: handEv.to, pts: handEv.pts }));
  check('and is not held for the rest of the head start, which would stop them where they are', !pal.holdsMe() && !pal.holds(ME));
  events(pal);
  const palSeen = [];
  for (let t = 0; t < 6000; t += DOGFIGHT_EVERY) {
    clock += DOGFIGHT_EVERY;
    pal.step(meOf(pal), false);
    palSeen.push(...events(pal));
  }
  check('nobody who left is let out of the tank', !palSeen.includes('free') && pal.phase === 'hunt', palSeen.join(','));
  /* A friend who came in during the head start, in the tank, is held. */
  const r4 = {
    ...count, phase: 'live', n: 4, leg: 0, goAt: clock - 1000, huntAt: clock + 4000, endAt: clock + 124_000, pz: 1, gold: -1, winner: null, nextAt: 0,
    rows: rows({ 2: { inf: true, pad: -1 } }),
  };
  pal.heard(r4, toLocal);
  check('a friend in by the tank is held in it through the head start', pal.inf[ME] === 1 && pal.holdsMe());
  const g0 = new InfectedRound(w, { bots: 3 }, 1, { plan: P });
  check('the solo round is untouched by the room', typeof g0.judges === 'function' && g0.judges(0, 1) === true);
}

function rulesBlock(w) {
  console.log('\n6. rules');
  const mk = (rules, seed = 3) => new InfectedRound(w, {
    bots: 5, round: '2m', head: 5, first: 'me', ...rules,
  }, seed, { plan: P });
  const drain = (g) => {
    const out = [];
    for (let n = 0; n < g.eventCount; n += 1) out.push({ ...g.events[n] });
    g.eventCount = 0;
    return out;
  };
  /* Who starts infected. */
  check('first: me starts the pilot infected, in the tank', mk({}).pz === ME);
  let bots = 0;
  let mine = 0;
  for (let seed = 1; seed <= 24; seed += 1) {
    if (mk({ first: 'bot' }, seed).pz !== ME) bots += 1;
    if (mk({ first: 'random' }, seed).pz === ME) mine += 1;
  }
  check('first: bot never starts the pilot infected', bots === 24);
  check('first: random starts anybody, the pilot sometimes', mine > 0 && mine < 24, `${mine} of 24`);

  /* The holds, and the chain. */
  const g = mk({});
  check('everybody is held until the round goes', [0, 1, 2, 3, 4, 5].every((i) => g.holds(i)) && g.holdsMe());
  g.go(g.clockMs);
  check('then only the first infected, through the head start', g.holdsMe() && !g.holds(1) && g.phase === 'head' && g.huntAt === g.startedMs + 5000);
  check('the sniff is due twenty seconds into the hunt', g.nextSniff === g.huntAt + SNIFF_EVERY);
  let t = g.huntAt;
  g.clockMs = t;
  check('the hunt frees the first infected', !g.holdsMe() && g.phase === 'hunt');
  g.tag(ME, 1, t);
  g.tag(ME, 2, t + 1000);
  g.tag(ME, 3, t + 2000);
  check('the chain inside thirty seconds: x1, x2, x3', g.chain[ME] === 3 && g.pts[ME] === 100 + 200 + 300 && g.tags[ME] === 3, `${g.pts[ME]}`);
  check('the first caught is remembered', g.firstCaught === 1);
  t += 2000 + CHAIN_MS + 1;
  g.tag(ME, 4, t);
  check('a tag after the chain\'s window is x1 again', g.chain[ME] === 1 && g.pts[ME] === 700);
  check('one clean left among three or more is the last one, and the clock is cut to forty five seconds',
    g.gold === 5 && g.endAt === t + LAST_MS && g.phase === 'last', `${g.gold}`);
  drain(g);
  g.tag(1, 5, t + 3000);
  const evs = drain(g);
  check('catching the last one pays them the last caught bonus and the catcher the closer\'s',
    g.pts[5] === POINTS.lastCaught && g.pts[1] === POINTS.tag + POINTS.closer && g.lastFor[5] === 1, `${g.pts[5]} ${g.pts[1]}`);
  check('nobody clean ends the round, and the last one caught wins', g.over && g.winner === 5 && evs.some((e) => e.type === 'over'));
  const tot5 = g.total[5];
  /* The chain caps at x4. */
  const c = mk({});
  c.go(c.clockMs);
  c.clockMs = c.huntAt;
  for (let k = 1; k <= 5; k += 1) c.tag(ME, k, c.huntAt + k * 100);
  /* The fifth was the last one, so the closer's bonus is on top. */
  check('the chain stops at x4', c.chain[ME] === CHAIN_MAX && c.pts[ME] === 100 + 200 + 300 + 400 + 400 + POINTS.closer, `${c.pts[ME]}`);

  /* Three rounds a match, the first caught starting the next. */
  g.reset(g.round + 1);
  check('the next round starts the first one caught last round infected', g.leg === 1 && g.pz === 1 && g.inf[1] === 1 && g.inf[ME] === 0);
  check('and the match totals carry over', g.total[5] === tot5 && g.pts[5] === 0);
  g.go(g.clockMs);
  g.clockMs = g.endAt;
  g.end(g.endAt, true);
  check('the bell with several clean pays each the survivor bonus', g.over && [ME, 2, 3, 4, 5].every((i) => g.pts[i] === POINTS.survivor) && g.lastFor[ME] === 0);
  check('and with nobody last the most points win', g.winner === g.standings()[0].slot && !g.matchOver);
  g.reset(g.round + 1);
  check('the third round', g.leg === 2);
  g.go(g.clockMs);
  g.end(g.endAt, true);
  check('which ends the match', g.matchOver);
  g.reset(g.round + 1);
  check('and the next is a new match from none', g.leg === 0 && g.total.every((v) => v === 0));

  /* A round of two: a duel, no last one, and the bell pays the clean one
   * as the last one. */
  const d = mk({ bots: 1 });
  d.go(d.clockMs);
  d.clockMs = d.huntAt + 60_000;
  check('a duel has no last one', d.gold === -1 && d.phase === 'hunt');
  d.end(d.endAt, true);
  check('the bell pays a duel\'s clean pilot for outlasting it, and they win', d.pts[1] === POINTS.lastOut && d.lastFor[1] === 1 && d.winner === 1);

  /* The glass tank: a clean pilot pressed to the glass is not tagged by
   * the first infected inside it; inside the tank they are. */
  const q = mk({ bots: 1 });
  q.go(q.clockMs);
  q.clockMs = q.huntAt;
  q.eventCount = 0;
  const T = P.TANK;
  const put = (i, px, py, h) => {
    const [x, y, z] = P.worldAt(px, py, h);
    q.x[i] = x; q.y[i] = y; q.z[i] = z;
  };
  put(ME, T.x0 + 0.25, (T.y0 + T.y1) / 2, 0.9);
  put(1, T.x0 - 0.25, (T.y0 + T.y1) / 2, 0.9);
  q.judge(q.huntAt);
  check('the tank\'s glass stops a tag through it', q.inf[1] === 0 && !drain(q).some((e) => e.type === 'tag'));
  put(1, T.x0 + 0.7, (T.y0 + T.y1) / 2, 0.9);
  q.judge(q.huntAt + 20);
  check('inside the tank, the same distance is a tag', q.inf[1] === 1 && q.over);

  /* A close shave: within SHAVE_R and away again, paid once in its cool
   * down. */
  const sh = mk({ bots: 1 });
  sh.go(sh.clockMs);
  let st = sh.huntAt;
  sh.clockMs = st;
  const pass = (at) => {
    const [hx, hy, hz] = P.worldAt(20, 8.7, 1.2);
    sh.x[1] = hx; sh.y[1] = hy; sh.z[1] = hz;
    const [nx] = P.worldAt(20 + (TAG_R + SHAVE_R) / 2, 8.7, 1.2);
    sh.x[ME] = nx; sh.y[ME] = hy; sh.z[ME] = hz;
    sh.judge(at);
    const [fx] = P.worldAt(23, 8.7, 1.2);
    sh.x[ME] = fx;
    sh.judge(at + 20);
  };
  pass(st);
  check('an infected pilot close and away again is a close shave', sh.shaves[1] === 1 && sh.pts[1] === POINTS.shave && sh.inf[1] === 0);
  pass(st + 1000);
  check('and not again inside its four second cool down', sh.shaves[1] === 1);
  st += 4100;
  pass(st);
  check('after it, again', sh.shaves[1] === 2);

  /* The sniff: every clean pilot shown, nobody infected. */
  sh.sniff(st);
  check('the sniff shows the clean, not the infected', sh.sniffOn[1] === 1 && sh.sniffOn[ME] === 0);
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
  roomBlock(w);
  rulesBlock(w);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main();
