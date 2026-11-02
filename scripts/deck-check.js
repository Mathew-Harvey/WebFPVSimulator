/*
 * deck-check.js: a powerloop round a bridge is a Powerloop.
 *
 * THE REPORT THIS ANSWERS. bug-99b6fad9, a five inch on Hibari Yard, after
 * bug-865fb001 ("Ive done like 80 powerloops in all sorts of ways and it has
 * only registered like 2 of them") and bug-672f73f7 ("Can't hit a
 * powerloop"): "I figured it out... if I powerloop under the crane it works,
 * but the road bridge doesn't."
 *
 * THE CAUSE. src/game/obstacles.js made an obstacle a Powerloop can be flown
 * round only out of a pole or a BAR, and a bar had to be thin both ways
 * across its length, which is a rail. The crane's jib is a lattice of rails.
 * The footbridge over the yard's lane is one box 20 m long, 0.75 m deep and
 * 3 m across, so it was not an obstacle at all, and a loop round it wound
 * round nothing: flown through the real plant it was a 3/4 Flip. A road
 * bridge's 0.3 m deck was out twice over, because asked for the ground from
 * its own base it is its own ground. obstacles.js now has a DECK: a slab up
 * to the builder's widest bridge across, as shallow as a bar, with air under
 * it at any of nine points over its plan.
 *
 * WHAT IS CHECKED.
 *
 *   the rule       in a flat world, by hand: the footbridge's deck is one
 *                  bar along its length; too deep, too wide, or on the
 *                  ground, it is not; a road deck thinner than a step, and
 *                  one with a pier under its middle, still are; the reach is
 *                  measured from the deck's edge. No aircraft.
 *   the yard       Hibari Yard's own solids, as the built map places them:
 *                  the footbridge's deck is in the field.
 *   the ticket     the real plant (dist/sim.wasm) and the real recogniser on
 *                  the yard's solids: one loop round the crane's counter jib
 *                  and the same loop round the footbridge, both ways, are
 *                  Powerloops. With the decks taken back out of the field the
 *                  footbridge's is not, which is the bug held in place, so
 *                  this check can fail.
 *   a road bridge  the builder's road bridge, a 24 m span on one pier: a loop
 *                  round its deck in a bay is a Powerloop.
 *   not a loop     beside the footbridge, over it, and straight under it, no
 *                  Powerloop is named: a deck in the field is not a reason
 *                  for one.
 *
 * Every flight is flown twice and must name the same thing both times.
 *
 * Usage: node scripts/deck-check.js
 * Exit code is 1 if any check failed.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
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
  makeRig, buildWorld, V, add, sub, mul, norm, len, rampPath, linePath, circlePath,
} from './lib/flightrig.js';
import { deriveObstacles, ObstacleField, OB_BAR } from '../src/game/obstacles.js';
import { Colliders } from '../src/game/collide.js';
import { starterMap } from '../src/maps/built/starter.js';
import { normalize } from '../src/trackbuilder/model.js';
import {
  seatDocument, groundUnder, docToWorld, PLATFORM_REACH,
} from '../src/maps/built/place.js';
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

console.log('\ndeck-check: a powerloop round a bridge is a Powerloop\n');

/* The bars in a field within `r` of a plan point, in the field's order. */
const barsNear = (field, x, z, r) => field.items.filter(
  (o) => o.kind === OB_BAR && Math.hypot(o.cx - x, o.cz - z) <= r,
);
const decksOf = (field) => field.items.filter((o) => o.kind === OB_BAR && o.wide > 0);

/*
 * A world the built map's own way: solids into colliders, and the height
 * function the built map hands deriveObstacles, which is groundUnder over the
 * placement's tops and steps PLATFORM_REACH, as src/main.js asks it.
 */
function builtWorld(placed) {
  const colliders = new Colliders();
  addSolids(colliders, placed.solids);
  colliders.build();
  const height = (x, z, fromY) => groundUnder(placed.tops, x, z, fromY);
  return { colliders, height, field: deriveObstacles(colliders, height) };
}

/* ---- the rule, in a flat world ---- */
{
  check('the height functions step what obstacles.js assumes they step',
    PLATFORM_REACH === 0.55, `PLATFORM_REACH ${PLATFORM_REACH}, the town's heightAt literal 0.55`);

  /* A slab over flat ground, with the built map's height function over it. */
  const slabWorld = (boxes) => {
    const solids = boxes.map((b) => ({ kind: 'wall', box: b }));
    const placed = { solids, tops: solids };
    return builtWorld(placed);
  };
  const deck = slabWorld([[-10, 4.45, -1.5, 10, 5.2, 1.5]]);
  const d0 = decksOf(deck.field);
  check('the footbridge\'s deck, alone over flat ground, is one bar along its length',
    deck.field.count === 1 && d0.length === 1 && d0[0].dx === 1 && d0[0].dz === 0
      && d0[0].half === 10 && d0[0].wide === 1.5 && Math.abs(d0[0].cy - 4.825) < 1e-6,
    d0.length ? `axis (${d0[0].dx}, ${d0[0].dy}, ${d0[0].dz}), half ${d0[0].half}, wide ${d0[0].wide}` : 'nothing derived');
  check('a slab deeper than a bar is a block, not a deck',
    slabWorld([[-10, 4.45, -1.5, 10, 5.45, 1.5]]).field.count === 0);
  check('a slab wider than the builder\'s widest bridge is a floor, not a deck',
    slabWorld([[-15, 4.45, -10.5, 15, 5.2, 10.5]]).field.count === 0);
  check('a slab with no air under it is not a deck',
    slabWorld([[-10, 0.6, -1.5, 10, 1.35, 1.5]]).field.count === 0);
  check('the builder\'s 0.3 m road deck is a deck, though it is thinner than a step',
    decksOf(slabWorld([[-12, 5.7, -4, 12, 6.0, 4]]).field).length === 1);
  check('and so is one standing on a pier under its middle',
    decksOf(slabWorld([[-12, 5.7, -4, 12, 6.0, 4], [-1, 0, -1.5, 1, 5.7, 1.5]]).field).length === 1);

  const f = new ObstacleField();
  f.add(OB_BAR, 0, 5, 0, 1, 0, 0, 10, 1.5);
  f.add(OB_BAR, 0, 5, 40, 1, 0, 0, 10);
  f.build();
  const out = [];
  const at = (z) => f.nearAll(0, 5, z, out, 8) && out.some((e) => e.ob.id === 0);
  check('a deck\'s reach is measured from its edge, a rail\'s from its line',
    at(1.5 + 13.9) && !at(1.5 + 14.1) && f.nearAll(0, 5, 40 + 14.1, out, 8) === 0);
}

/* ---- Hibari Yard ---- */
const yardDoc = normalize(starterMap()).doc;
const yard = builtWorld(seatDocument(yardDoc).placed);
const W = yardDoc.field.width;
const D = yardDoc.field.depth;
const plan = (x, y) => docToWorld(W, D, x, y, 0, {});
const FOOT = plan(140, 92);
const footDecks = barsNear(yard.field, FOOT.x, FOOT.z, 2).filter((o) => o.wide > 0);
check('Hibari Yard\'s footbridge deck is in the field, along its span',
  footDecks.length === 1 && footDecks[0].dx === 1 && Math.abs(footDecks[0].cy - 4.825) < 1e-6,
  `${decksOf(yard.field).length} decks in the yard among ${yard.field.count} obstacles`);

if (!existsSync(WASM)) {
  console.log('\n  SKIP  dist/sim.wasm is not built, so nothing was flown');
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

const wasmBytes = readFileSync(WASM);
const diffText = readFileSync(join(root, 'configs', 'betaflight-default.diff'), 'utf8');

/*
 * A vertical loop about a horizontal axis along world x, flown by the real
 * plant along a guidance law: in from twelve metres back at the loop's
 * bottom, once round, and out level at the loop's speed, so a lap that began
 * under the thing ends under it. `dir` is which way along z it is entered. Each is
 * flown twice and the two must name the same.
 */
async function flyOnce(world, centre, { r = 3.4, secs = 2.9, dir = -1, turns = -1 } = {}) {
  const e2 = V(0, 0, dir);
  const lap = circlePath(centre, V(0, -1, 0), e2, r, secs, 0, turns);
  const p0 = lap(0);
  const v0 = len(p0.v);
  const start = sub(p0.p, mul(norm(p0.v), 12));
  const head = Math.atan2(e2.x, e2.z);
  const rig = await makeRig({
    wasmBytes,
    diffText,
    colliders: world.colliders,
    field: world.field,
    spawn: V(start.x, 0, start.z),
    spawnYaw: Math.PI,
    groundY: 0,
  });
  rig.hold(200, 0, 0, 0, 0.5);
  rig.settle(start, head, 2.0);
  rig.fly(rampPath(start, p0.p, (12 * 1.9) / Math.max(2, v0), v0), { heading: head });
  rig.fly(lap, { heading: head });
  /*
   * Out at the loop's own speed, level, for two and a half seconds, so the
   * lap has closed before the tail's hover throttle climbs. The speed is
   * read a microsecond before the end, because circlePath says 0 at its
   * end; an exit from rest asks the craft to stop dead at the bottom of the
   * loop, and it balloons up over the thing it went round.
   */
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
async function fly(world, centre, opts) {
  const a = await flyOnce(world, centre, opts);
  const b = await flyOnce(world, centre, opts);
  return { ...a, same: a.names === b.names && a.contacts === b.contacts };
}
const said = (got) => `named ${got.names || 'nothing'}, ${got.contacts} contacts${got.same ? '' : ', AND THE TWO FLIGHTS DISAGREE'}`;

/* The deck's middle, and the counter jib past the crane's mast, clear of the
 * office roof the main jib stands over. */
const FOOT_AXIS = V(FOOT.x, footDecks.length ? footDecks[0].cy : 4.825, FOOT.z);
const CRANE = plan(24, 127);
const JIB = V(CRANE.x - 7.5, 19.8, CRANE.z);

{
  const jib = await fly(yard, JIB);
  check('the control: a loop under the crane\'s counter jib is a Powerloop, as the ticket says',
    jib.same && jib.names === 'Powerloop' && jib.contacts === 0, said(jib));
  const one = await fly(yard, FOOT_AXIS);
  check('the ticket: the same loop under the footbridge is a Powerloop',
    one.same && one.names === 'Powerloop' && one.contacts === 0, said(one));
  const two = await fly(yard, FOOT_AXIS, { dir: 1 });
  check('and entered from the other side of the bridge',
    two.same && two.names === 'Powerloop' && two.contacts === 0, said(two));
  const wide = await fly(yard, FOOT_AXIS, { r: 4.0, secs: 3.2 });
  check('and a wider one',
    wide.same && wide.names === 'Powerloop' && wide.contacts === 0, said(wide));

  /* The bug held in place: the yard's field without its decks. */
  const without = new ObstacleField();
  for (const o of yard.field.items) {
    if (o.wide === 0) {
      without.add(o.kind, o.cx, o.cy, o.cz, o.dx, o.dy, o.dz, o.half);
    }
  }
  without.build();
  const old = await fly({ colliders: yard.colliders, field: without }, FOOT_AXIS);
  check('with the decks taken back out, the footbridge\'s loop is not a Powerloop (the bug)',
    old.same && old.names !== 'Powerloop' && old.contacts === 0, said(old));
}

/* ---- the builder's road bridge ---- */
{
  const base = starterMap();
  const raw = {
    ...base,
    elements: [{
      id: 'deck-check-road', type: 'bridge', position: { x: 80, y: 80, z: 0 }, yaw: 0,
      dims: { span: 24, width: 4, height: 8, piers: 1 }, style: 'road',
    }],
  };
  const doc = normalize(raw).doc;
  const placed = seatDocument(doc).placed;
  const road = builtWorld(placed);
  const mid = docToWorld(doc.field.width, doc.field.depth, 80, 80, 0, {});
  const decks = decksOf(road.field).filter((o) => Math.hypot(o.cx - mid.x, o.cz - mid.z) < 2);
  check('the builder\'s road bridge, a 24 m span on one pier, has its deck in the field',
    decks.length === 1, `${decksOf(road.field).length} decks, ${road.field.count} obstacles`);
  if (decks.length === 1) {
    const ob = decks[0];
    /* In the bay between the abutment and the pier, on the side the gantry
     * sign is not. */
    const at = V(ob.cx - ob.dx * 7.5, ob.cy, ob.cz - ob.dz * 7.5);
    const loop = await fly(road, at, { r: 4.5, secs: 3.5 });
    check('and a loop round it in a bay is a Powerloop',
      loop.same && loop.names === 'Powerloop' && loop.contacts === 0, said(loop));
  }
}

/* ---- not a loop round anything ---- */
{
  const beside = await fly(yard, V(FOOT_AXIS.x, FOOT_AXIS.y, FOOT_AXIS.z + 10));
  check('a loop in the air ten metres beside the footbridge is not a Powerloop',
    beside.same && !/Powerloop/.test(beside.names), said(beside));
  const over = await fly(yard, V(FOOT_AXIS.x, FOOT_AXIS.y + 7, FOOT_AXIS.z));
  check('nor is one flown over it without going under',
    over.same && !/Powerloop/.test(over.names) && over.contacts === 0, said(over));
  /* Straight down the lane, under the deck, at a loop's entry speed. */
  const runOnce = async () => {
    const a = V(FOOT_AXIS.x, 2.4, FOOT_AXIS.z - 20);
    const b = V(FOOT_AXIS.x, 2.4, FOOT_AXIS.z + 20);
    const rig = await makeRig({
      wasmBytes, diffText, colliders: yard.colliders, field: yard.field, spawn: V(a.x, 0, a.z), spawnYaw: Math.PI, groundY: 0,
    });
    rig.hold(200, 0, 0, 0, 0.5);
    rig.settle(a, 0, 2.0);
    rig.fly(linePath(a, b, 4.0), { heading: 0 });
    rig.hold(700, 0, 0, 0, 0.45);
    return { names: rig.done(700).map((t) => t.name).join(' + '), contacts: rig.stats.contacts };
  };
  const u1 = await runOnce();
  const u2 = await runOnce();
  const under = { ...u1, same: u1.names === u2.names && u1.contacts === u2.contacts };
  check('and a straight run under it names nothing',
    under.same && under.names === '' && under.contacts === 0, said(under));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
