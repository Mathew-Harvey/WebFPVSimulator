/*
 * trickspot-check.js: a lesson that asks for a trick round an object sends
 * the pilot to an object the trick can be flown round.
 *
 * THE REPORTS THIS ANSWERS. Two pilots on career lesson 9-2, Powerloop, on
 * Hibari Yard, on the same day, each with the objective at 0 of 1:
 * bug-d0d887f6, "It didn't recognise my multiple powerloops", and
 * bug-39be50e4, "i tried to do a lot of powerloops and actually made some,
 * but the system did not recognize it as such".
 *
 * THE CAUSE. The recogniser names a Powerloop for one thing only: a whole lap
 * begun UNDER a bar, the craft's position winding once round the bar's line
 * (src/game/trickdetect.js, `path: 'bar', from: 'under'`), and the bars are
 * what src/game/obstacles.js derives from the colliders: rails, poles and,
 * since 2026-11-02, decks with air under them. scripts/deck-check.js holds
 * the rule from the other side: a loop flown over the footbridge without
 * going under it is not a Powerloop. The lesson's briefing said "Fly
 * towards a container stack or the bando wall, low. Pull back hard with
 * throttle up, over the top of it", and its hint said "Pull up and over
 * something solid". A container stack and a wall stand on the ground. There
 * is no under, no bar, and so no lap: flown through the real plant, a whole
 * loop over the tall stack is a 1/2 Flip. A pilot who did exactly what the
 * lesson said could never pass it. The Split-S of 9-3 and the Freestyle
 * Final of 10-3 were the same fault in other words: "a roof edge", "a
 * Powerloop over anything solid", "Up and over something solid".
 *
 * WHAT IS CHECKED.
 *
 *   the words   no Node module but the curriculum, the patterns and the
 *               yard's document. For every career lesson whose objective is
 *               a trick flown round a bar (any pattern with a `path: 'bar'`
 *               step, which is the Powerloop, Split-S and Matty families),
 *               every line the pilot reads (the briefing, the note, the
 *               objectives' text and hints, the crash and score tips) names
 *               no object in its world that a lap has not been flown round
 *               below, says nothing that promises any solid will do (a wall,
 *               a roof edge, "anything solid"), and names at least one object
 *               that has been. The lesson's own gap objectives' names are
 *               taken out first, because a gap is an objective's own object:
 *               10-3 flies the container tunnel as a gap. Every element type
 *               in the world has a row in TYPE_WORDS or PLACES, so a new kind
 *               of thing in the yard is a decision and not a silent pass.
 *   the flights the real plant (dist/sim.wasm) and the real recogniser, on
 *               the lesson's own world document: a loop under the footbridge,
 *               both ways, and under the billboard, is a Powerloop with no
 *               contact. Those are FLOWN, the only objects the words may
 *               name. A Split-S and a Matty Flip are half laps round the same
 *               bars, so a bar a whole lap is counted round is one a half lap
 *               is counted round too.
 *   the bug     the loop the old briefing asked for, over the tall container
 *               stack, both ways and wider, names no Powerloop, with no
 *               contact. This is why the words above refuse a container.
 *
 * Every flight is flown twice and must name the same thing both times.
 *
 * Usage: node scripts/trickspot-check.js   (npm run check:trickspots)
 * Exit code is 1 if any check failed. Without dist/sim.wasm the words are
 * still checked and the flights are skipped, as deck-check does.
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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeRig, V, add, sub, mul, norm, len, rampPath, circlePath,
} from './lib/flightrig.js';
import { CHAPTERS } from '../src/career/curriculum.js';
import { PATTERNS } from '../src/game/trickdetect.js';
import { deriveObstacles, OB_BAR } from '../src/game/obstacles.js';
import { Colliders } from '../src/game/collide.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument, groundUnder, docToWorld } from '../src/maps/built/place.js';
import { addSolids } from '../src/props/solids.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const WASM = join(root, 'dist', 'sim.wasm');

let passed = 0;
let failed = 0;
function check(name, ok, note) {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
  }
  if (note) {
    console.log(`        ${note}`);
  }
}

console.log('\ntrickspot-check: a trick lesson sends the pilot to something the trick can be flown round\n');

/* ---- which lessons, and which world ---- */

/* The tricks flown round a bar: every pattern with a lap step. */
const LAP_TRICKS = new Set(PATTERNS.filter((p) => p.steps.some((s) => s.path === 'bar')).map((p) => p.name));
const lapTrickOf = (o) => o.kind === 'trick' && (o.need || []).some(
  (n) => (n.names || []).some((name) => LAP_TRICKS.has(name)),
);
const lessons = [];
for (const c of CHAPTERS) {
  for (const l of c.lessons) {
    if (l.objectives.some(lapTrickOf)) {
      lessons.push(l);
    }
  }
}
check('the curriculum has lessons that ask for a trick flown round a bar',
  lessons.length >= 4, lessons.map((l) => l.id).join(', '));

/* The world every flight below is flown in: lesson 9-2's, the Powerloop. */
const home = lessons.find((l) => l.objectives.some((o) => lapTrickOf(o)
  && o.need.some((n) => n.names.includes('Powerloop'))));
const worldKey = (l) => (l.world && l.world.map === 'built' && l.world.doc
  ? JSON.stringify(normalize(l.world.doc).doc.elements) : null);
const HOME_KEY = home ? worldKey(home) : null;
check('every one of them is flown in the world the flights below are flown in',
  HOME_KEY !== null && lessons.every((l) => worldKey(l) === HOME_KEY),
  lessons.filter((l) => worldKey(l) !== HOME_KEY).map((l) => `${l.id} is in another world, which nothing here has flown`).join('; '));

const doc = home ? normalize(home.world.doc).doc : null;

/* ---- the words ---- */

/*
 * The words a line uses for each kind of thing in the yard, by element type.
 * A line that names one of these sends the pilot to it, and it must then be
 * one FLOWN below. Matched on the line lower cased.
 */
const TYPE_WORDS = {
  bando: /\bbando\b/,
  building: /\boffice\b|\broofs?\b|\bbuildings?\b|\bblock\b/,
  scaffold: /\bscaffold/,
  crane: /\bcrane\b|\bjib\b/,
  containers: /\bcontainers?\b/,
  billboard: /\bbillboard\b/,
  bridge: /\bfootbridge\b|\bbridge\b/,
  car: /\bcars?\b/,
  vehicle: /\btruck\b|\bvan\b|\bcoupe\b|\bdrift car\b|\btraffic\b/,
  utilityPole: /\bpoles?\b|\bwires?\b/,
  pylon: /\bpylons?\b|\bpower line\b/,
  waterTower: /\bwater tower\b/,
  chimney: /\bchimney\b/,
  quarterPipe: /\bquarter pipe\b/,
  ledge: /\bledge\b/,
  rail: /\brail\b/,
  stairs: /\bstairs?\b/,
  vending: /\bvending\b/,
  tree: /\btrees?\b/,
};
/*
 * The kinds of element a line can only ever use as a PLACE, never as the
 * thing a trick is flown round: the pads lie on the ground, a road and its
 * lane are paint on it, and a named gap is an objective's own window.
 */
const PLACES = new Set(['startPads', 'road', 'gap']);
/* Words that promise a solid the recogniser does not count a lap round. */
const ANY_SOLID = /\b(?:any|some)thing solid\b|\bwalls?\b|\broof edges?\b/;

const typesInWorld = doc ? [...new Set(doc.elements.map((e) => e.type))] : [];
const unknown = typesInWorld.filter((t) => !TYPE_WORDS[t] && !PLACES.has(t));
check('every kind of thing in the yard has its words here, or is a place',
  doc !== null && unknown.length === 0, unknown.length ? `no row for ${unknown.join(', ')}` : '');

/* The objects a lap trick is flown round below. The flights fill in what each
 * actually named; the words are judged against this list. */
const FLOWN = ['bridge', 'billboard'];

function linesOf(l) {
  const out = [];
  const b = l.briefing || {};
  out.push(['goal', b.goal], ['why', b.why], ...(b.steps || []).map((s, i) => [`step ${i + 1}`, s]), ['note', b.note]);
  for (const [i, o] of l.objectives.entries()) {
    out.push([`objective ${i + 1}`, o.text], [`hint ${i + 1}`, o.hint]);
  }
  out.push(['crashTip', l.crashTip], ['scoreTip', l.scoreTip]);
  const gaps = l.objectives.filter((o) => o.kind === 'gap').flatMap((o) => o.names || []).map((n) => n.toLowerCase());
  return out.filter(([, s]) => typeof s === 'string' && s).map(([where, s]) => {
    let t = s.toLowerCase();
    for (const g of gaps) {
      t = t.split(g).join(' ');
    }
    return [where, s, t];
  });
}

for (const l of lessons) {
  const bad = [];
  const named = new Set();
  for (const [where, said, text] of linesOf(l)) {
    const promise = ANY_SOLID.exec(text);
    if (promise) {
      bad.push(`${where} "${said}" promises "${promise[0]}"`);
    }
    for (const [type, re] of Object.entries(TYPE_WORDS)) {
      if (re.test(text)) {
        named.add(type);
        if (!FLOWN.includes(type)) {
          bad.push(`${where} "${said}" names ${type}, which no lap is flown round here`);
        }
      }
    }
  }
  check(`${l.id} ${l.title}: every line names only what a lap is counted round`, bad.length === 0, bad.join('\n        '));
  check(`${l.id} ${l.title}: and names at least one of them`,
    FLOWN.some((t) => named.has(t)), `names ${[...named].join(', ') || 'nothing'}`);
}

/* ---- the flights ---- */

if (!existsSync(WASM) || !doc) {
  console.log('\n  SKIP  dist/sim.wasm is not built, so nothing was flown');
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

const wasmBytes = readFileSync(WASM);
const diffText = readFileSync(join(root, 'configs', 'betaflight-default.diff'), 'utf8');

/* The lesson's world the built map's own way, as scripts/deck-check.js
 * builds it: solids into colliders, and the height function src/main.js
 * hands deriveObstacles. */
const placed = seatDocument(doc).placed;
const colliders = new Colliders();
addSolids(colliders, placed.solids);
colliders.build();
const field = deriveObstacles(colliders, (x, z, fromY) => groundUnder(placed.tops, x, z, fromY));
const world = { colliders, field };
const plan = (el) => docToWorld(doc.field.width, doc.field.depth, el.position.x, el.position.y, 0, {});
const elementOf = (type) => doc.elements.find((e) => e.type === type);
const barsNear = (p, r) => field.items.filter((o) => o.kind === OB_BAR && Math.hypot(o.cx - p.x, o.cz - p.z) <= r);

/*
 * A vertical loop about the horizontal line `axis` through `centre`, flown by
 * the real plant along a guidance law: in from twelve metres back at the
 * loop's bottom, once round, and out level at the loop's speed, deck-check's
 * flight with the axis free. The craft runs along `go` at the bottom.
 */
async function flyOnce(centre, go, { r = 3.4, secs = 2.9 } = {}) {
  const e2 = mul(go, -1);
  const lap = circlePath(centre, V(0, -1, 0), e2, r, secs, 0, -1);
  const p0 = lap(0);
  const v0 = len(p0.v);
  const start = sub(p0.p, mul(norm(p0.v), 12));
  const head = Math.atan2(e2.x, e2.z);
  const rig = await makeRig({
    wasmBytes, diffText, colliders: world.colliders, field: world.field, spawn: V(start.x, 0, start.z), spawnYaw: Math.PI, groundY: 0,
  });
  rig.hold(200, 0, 0, 0, 0.5);
  rig.settle(start, head, 2.0);
  rig.fly(rampPath(start, p0.p, (12 * 1.9) / Math.max(2, v0), v0), { heading: head });
  rig.fly(lap, { heading: head });
  const p1 = lap(secs);
  const v1 = lap(secs - 1e-6).v;
  const exit = (t) => ({
    p: add(p1.p, mul(v1, t)), v: v1, a: V(0, 0, 0), done: t >= 2.5,
  });
  exit.total = 2.5;
  rig.fly(exit, { heading: head });
  rig.hold(700, 0, 0, 0, 0.45);
  return { names: rig.done(700).map((t) => t.name).join(' + '), contacts: rig.stats.contacts };
}
async function fly(centre, go, opts) {
  const a = await flyOnce(centre, go, opts);
  const b = await flyOnce(centre, go, opts);
  return { ...a, same: a.names === b.names && a.contacts === b.contacts };
}
const said = (got) => `named ${got.names || 'nothing'}, ${got.contacts} contacts${got.same ? '' : ', AND THE TWO FLIGHTS DISAGREE'}`;
const clean = (got, name) => got.same && got.names === name && got.contacts === 0;
/* Square to a bar's line, along the ground. */
const across = (o) => norm(V(o.dz, 0, -o.dx));

const counted = new Set();

/* The footbridge: its deck is one bar along its span. Under it along the
 * lane, both ways. */
{
  const p = plan(elementOf('bridge'));
  const deck = barsNear(p, 2).filter((o) => o.wide > 0);
  check('the footbridge\'s deck is a bar in the lesson\'s world', deck.length === 1,
    `${deck.length} decks at the footbridge`);
  if (deck.length === 1) {
    const c = V(deck[0].cx, deck[0].cy, deck[0].cz);
    const one = await fly(c, across(deck[0]));
    const two = await fly(c, mul(across(deck[0]), -1));
    check('a loop under the footbridge is a Powerloop', clean(one, 'Powerloop'), said(one));
    check('and from the other end of the lane', clean(two, 'Powerloop'), said(two));
    if (clean(one, 'Powerloop') && clean(two, 'Powerloop')) {
      counted.add('bridge');
    }
  }
}

/* The billboard: its board is a stack of slats along its width, over legs
 * and a catwalk. Under the board, in from the containers' side and out
 * toward the lane: the other way the run out after the loop is the
 * container line the board stands at the end of, which is the flight's
 * business and not the trick's. */
{
  const el = elementOf('billboard');
  const p = plan(el);
  const board = barsNear(p, el.dims.width / 2 + 1);
  const ys = board.map((o) => o.cy);
  const along = board.length ? board[0] : null;
  const lane = plan(elementOf('bridge'));
  check('the billboard\'s board is bars in the lesson\'s world', board.length > 0 && along.dy === 0,
    board.length ? `${board.length} bars, from ${Math.min(...ys).toFixed(2)} to ${Math.max(...ys).toFixed(2)} m` : 'none');
  if (board.length) {
    let go = across(along);
    if ((lane.x - p.x) * go.x + (lane.z - p.z) * go.z < 0) {
      go = mul(go, -1);
    }
    const c = V(p.x, (Math.min(...ys) + Math.max(...ys)) / 2, p.z);
    const one = await fly(c, go);
    const wide = await fly(c, go, { r: 4.2, secs: 3.3 });
    check('a loop under the billboard is a Powerloop', clean(one, 'Powerloop'), said(one));
    check('and a wider one', clean(wide, 'Powerloop'), said(wide));
    if (clean(one, 'Powerloop') && clean(wide, 'Powerloop')) {
      counted.add('billboard');
    }
  }
}

check('every object the words may name had its lap counted',
  FLOWN.every((t) => counted.has(t)), `counted: ${[...counted].join(', ') || 'nothing'}`);

/* The bug held in place: the loop the old briefing asked for, over a
 * container stack. The tallest stack, three high, clear of its neighbours'
 * roofs. A loop flown over it, its bottom a metre over the roof, along both
 * horizontal axes, and a wider one. */
{
  const stacks = doc.elements.filter((e) => e.type === 'containers');
  const tall = stacks.reduce((a, b) => ((b.dims.stack || 1) > (a.dims.stack || 1) ? b : a));
  const p = plan(tall);
  const roof = Math.max(...placed.solids.filter((s) => s.box
    && Math.hypot((s.box[0] + s.box[3]) / 2 - p.x, (s.box[2] + s.box[5]) / 2 - p.z) < 3).map((s) => s.box[4]));
  check('the tallest container stack has no bar over it, beside it or under it',
    barsNear(p, 7).length === 0, `${barsNear(p, 7).length} bars within 7 m, its roof at ${roof.toFixed(2)} m`);
  const flights = [];
  for (const go of [V(0, 0, 1), V(0, 0, -1)]) {
    flights.push(await fly(V(p.x, roof + 1 + 3.4, p.z), go));
  }
  flights.push(await fly(V(p.x, roof + 0.5 + 5, p.z), V(0, 0, 1), { r: 5, secs: 3.6 }));
  check('the bug: a whole loop over a container stack, as the old briefing asked, is not a Powerloop',
    flights.every((f) => f.same && f.contacts === 0 && !/Powerloop/.test(f.names)),
    flights.map(said).join('; '));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
