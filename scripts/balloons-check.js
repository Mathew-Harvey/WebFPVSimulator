/*
 * balloons-check.js: Balloon chase's game in Node (src/game/balloons.js).
 * No browser, seconds of wall clock. What it pins:
 *
 *   the same seed and the same craft path give the same game, to the bit;
 *   the plane stays inside its map, keeps its speeds between the limits,
 *     never banks past what its lateral limit allows, and clears a tall
 *     block in the middle of the map on every seed tried;
 *   a balloon on the craft's swept path pops once and pays one, a gold one
 *     pays GOLD_VALUE, and nothing pops off the path, on the stand, or
 *     after the round's clock has run out;
 *   the round runs ROUND_MS from the first feed flown;
 *   the builder piece: a map document's balloonChase is placed where it
 *     stands with its dims clamped, adds no solid, a map without one has no
 *     game, and a second one is named by fs-balloons and not flown.
 *
 * Usage: node scripts/balloons-check.js
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
  BalloonChase, BALLOON_EVERY, BALLOON_MAX, GOLD_VALUE, ROUND_MS, SUPPLY,
} from '../src/game/balloons.js';
import { createTrack, createElement, normalize } from '../src/trackbuilder/model.js';
import { placeDocument, balloonChaseOf } from '../src/maps/built/place.js';
import { freestyleReport } from '../src/trackbuilder/warnings.js';

let pass = 0;
let fail = 0;
function check(ok, what) {
  if (ok) {
    pass += 1;
    console.log(`  pass  ${what}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${what}`);
  }
}

const BLOCK = 25;
const world = {
  cx: 0,
  cz: 0,
  radius: 90,
  ceilingAt: (x, z) => (Math.abs(x) < 20 && Math.abs(z) < 20 ? BLOCK : 0),
};

/* Two minutes of a plane, with a craft sitting still at the far corner. */
function fly(seed) {
  const g = new BalloonChase(world, seed);
  const craft = { x: 200, y: 2, z: 200 };
  let maxR = 0;
  let overBlock = Infinity;
  let vmin = Infinity;
  let vmax = 0;
  let bank = 0;
  let trace = 0;
  for (let c = BALLOON_EVERY; c <= 120000; c += BALLOON_EVERY) {
    g.step(true, craft, craft);
    maxR = Math.max(maxR, Math.hypot(g.p[0], g.p[2]));
    if (Math.abs(g.p[0]) < 20 && Math.abs(g.p[2]) < 20) {
      overBlock = Math.min(overBlock, g.p[1]);
    }
    vmin = Math.min(vmin, g.v);
    vmax = Math.max(vmax, g.v);
    bank = Math.max(bank, Math.abs(g.bankTan));
    trace = (trace * 31 + g.p[0] * 7 + g.p[1] * 11 + g.p[2] * 13) % 1e9;
  }
  return { g, maxR, overBlock, vmin, vmax, bank, trace };
}

console.log('balloons-check: the plane');
{
  const a = fly(7);
  const b = fly(7);
  check(a.trace === b.trace && a.g.p[0] === b.g.p[0], 'the same seed flies the same path to the bit');
  check(fly(8).trace !== a.trace, 'another seed flies another path');
  let worst = null;
  for (let s = 1; s <= 24; s += 1) {
    const r = fly(s);
    if (!worst || r.overBlock < worst.overBlock) {
      worst = { ...r, s };
    }
    if (r.maxR > world.radius + 60 || r.vmin < 10.9 || r.vmax > 25.1 || r.bank > 1.25) {
      check(false, `seed ${s}: radius ${r.maxR.toFixed(1)}, speed ${r.vmin.toFixed(1)} to ${r.vmax.toFixed(1)}, bank tan ${r.bank.toFixed(2)}`);
    }
  }
  check(fail === 0, '24 seeds: inside the map, 11 to 25 m/s, bank within its limit');
  check(worst.overBlock > BLOCK, `24 seeds: always over the ${BLOCK} m block (lowest ${worst.overBlock.toFixed(1)} m, seed ${worst.s})`);
  check(a.g.released > 0 && a.g.supplied === SUPPLY, `it drops its load and no more (${a.g.supplied} of ${SUPPLY} once the round ran)`);
}

console.log('balloons-check: popping');
{
  const g = new BalloonChase(world, 3);
  const craft = { x: 0, y: 5, z: 0 };
  const prev = { x: 0, y: 5, z: 0 };
  /* On the stand: nothing pops and the round has not begun. */
  g.step(false, craft, prev);
  g.born[0] = g.clockMs;
  g.bx[0] = 0;
  g.by[0] = 5;
  g.bz[0] = 0;
  g.gold[0] = 0;
  g.step(false, craft, prev);
  check(g.popped === 0 && g.startedMs < 0, 'on the stand nothing pops and the round waits');
  /* Clear the sky so only the balloons placed below are in it. */
  const clear = () => {
    g.born.fill(-1);
    g.nextReleaseMs = 1e12;
  };
  clear();
  g.step(true, craft, null);
  check(g.startedMs === g.clockMs, 'the round starts at the first feed flown');
  /* One balloon right on the swept path, one a metre and a half off it. */
  g.born[0] = g.clockMs;
  g.bx[0] = 0.5;
  g.by[0] = 5;
  g.bz[0] = 0.1;
  g.gold[0] = 0;
  g.born[1] = g.clockMs;
  g.bx[1] = 0.5;
  g.by[1] = 5;
  g.bz[1] = 1.5;
  g.gold[1] = 0;
  craft.x = 1;
  g.step(true, craft, prev);
  check(g.popped === 1 && g.score === 1 && g.born[0] < 0 && g.born[1] >= 0, 'on the path pops and pays one, off it does not');
  check(g.popCount === 1 && g.pops[0].gold === false, 'the pop is reported once');
  g.popCount = 0;
  g.step(true, craft, prev);
  check(g.popped === 1, 'a popped balloon cannot pop again');
  /* Gold. */
  clear();
  g.born[2] = g.clockMs;
  g.bx[2] = 0.5;
  g.by[2] = 5;
  g.bz[2] = 0;
  g.gold[2] = 1;
  g.step(true, craft, prev);
  check(g.score === 1 + GOLD_VALUE && g.goldPopped === 1, `gold pays ${GOLD_VALUE}`);
  check(g.streak === 2, 'two pops close together are a streak of two');
  /* The clock: run it out in flying feeds with the craft far away. */
  const far = { x: 500, y: 5, z: 500 };
  while (g.clockMs - g.startedMs < ROUND_MS / 2) {
    g.step(true, far, far);
  }
  check(g.leftMs() === ROUND_MS / 2, 'leftMs counts down from the start');
  while (g.clockMs - g.startedMs < ROUND_MS) {
    g.step(true, far, far);
  }
  check(g.over && g.leftMs() === 0 && g.sinceOverMs() === 0, 'the round is over at ROUND_MS');
  clear();
  g.born[3] = g.clockMs;
  g.bx[3] = 0.5;
  g.by[3] = 5;
  g.bz[3] = 0;
  g.step(true, craft, prev);
  check(g.born[3] >= 0 && g.score === 1 + GOLD_VALUE, 'nothing pops after the clock has run out');
  g.reset(1);
  check(g.score === 0 && !g.over && g.startedMs < 0 && g.born.every((b) => b < 0), 'a new round starts clean');
  check(g.born.length === BALLOON_MAX, `the pool is ${BALLOON_MAX} and never grows`);
}

console.log('balloons-check: a cleared round');
{
  const g = new BalloonChase(world, 5);
  const far = { x: 500, y: 5, z: 500 };
  /* Ten seconds on the stand: it streams for show, and none of it counts. */
  for (let i = 0; i < 2500; i += 1) {
    g.step(false, far, null);
  }
  check(g.supplied === 0 && g.released > 10, 'the stand streams for show and spends none of the load');
  g.step(true, far, null);
  check(g.airborne() === 0, 'the round begins with an empty sky');
  let cutAt = -1;
  while (!g.over && g.clockMs - g.startedMs <= ROUND_MS) {
    g.step(true, far, far);
    if (cutAt < 0 && g.supplied === SUPPLY) {
      cutAt = g.clockMs;
    }
  }
  check(g.over && g.cleared && g.endMs < ROUND_MS && g.endMs > 0, `the round ends when the sky is empty, not at ROUND_MS (${g.endMs} ms)`);
  check(g.supplied === SUPPLY && g.released >= SUPPLY, 'exactly the load was dropped');
  check(g.leftMs() === 0 && g.airborne() === 0, 'nothing is left in the air');
  /* Popped ones clear it as well: pop all of the last load as it drops. */
  const h = new BalloonChase(world, 6);
  h.step(true, far, null);
  let pops = 0;
  while (!h.over && h.clockMs - h.startedMs <= ROUND_MS) {
    for (let i = 0; i < BALLOON_MAX; i += 1) {
      if (h.born[i] >= 0) {
        const near = { x: h.bx[i], y: h.by[i], z: h.bz[i] };
        h.step(true, near, near);
        break;
      }
    }
    h.step(true, far, null);
    pops = h.popped;
  }
  check(h.over && h.cleared && h.endMs < 40000 && pops > 0, `popping them as they drop ends it early (${pops} popped, ${h.endMs} ms)`);
}

console.log('balloons-check: the builder piece');
{
  const mapDoc = (chases) => {
    const doc = createTrack('Balloon check', 'full', 'freestyle');
    doc.elements.push(createElement(doc, 'startPads', { x: 10, y: 10, z: 0 }, 0));
    for (const [x, y, dims] of chases) {
      const el = createElement(doc, 'balloonChase', { x, y, z: 0 }, 0);
      Object.assign(el.dims, dims);
      doc.elements.push(el);
    }
    return normalize(doc).doc;
  };
  const none = placeDocument(mapDoc([]));
  check(balloonChaseOf(none) === null, 'a map without the piece has no game');
  const one = placeDocument(mapDoc([[60, 40, { radius: 500, height: 2, speed: 1.2 }]]));
  const bc = balloonChaseOf(one);
  const it = one.items.find((t) => t.el.type === 'balloonChase');
  check(bc && bc.x === it.x && bc.z === it.z, 'the game flies round where the piece stands');
  check(bc && bc.radius === 200 && bc.height === 8 && bc.speed === 1.2, `its dims are held to their limits (${bc && [bc.radius, bc.height, bc.speed].join(', ')})`);
  check(one.solids.length === none.solids.length, 'the piece adds no solid');
  const fs = (doc) => freestyleReport(doc).warnings.filter((w) => w.code === 'fs-balloons');
  check(fs(mapDoc([[60, 40, {}]])).length === 0, 'one piece draws no fs-balloons');
  const twoDoc = mapDoc([[60, 40, { radius: 50 }], [120, 90, { radius: 120 }]]);
  const two = fs(twoDoc);
  const second = twoDoc.elements.filter((e) => e.type === 'balloonChase')[1];
  check(two.length === 1 && two[0].elementId === second.id, `a second piece is named (${two.map((w) => w.message).join(' | ')})`);
  check(balloonChaseOf(placeDocument(twoDoc)).radius === 50, 'and the first is the one flown');
}

console.log(`\nballoons-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
