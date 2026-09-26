/*
 * counter-check.js: the counter's geometry (src/game/gaps.js and
 * src/game/closecall.js) proven in Node against REAL colliders, where
 * scripts/score-selftest.js proves the same rules against solids it builds
 * itself.
 *
 *   HIBARI YARD. The starter map (src/maps/built/starter.js), normalized
 *   and placed by src/maps/built/place.js exactly as the map module places
 *   it, its solids through src/props/solids.js addSolids into a Colliders
 *   exactly as the map hands them to the shell. Its named gaps come from
 *   placeDocument's zones through namedGaps, the one conversion; each is
 *   flown square through its middle both ways, and beside every edge. Then
 *   lines on its real solids: a skim along a container stack, the
 *   container tunnel end to end (a gap, an under, a thread and a skim in
 *   one line), the lane under the footbridge; and a crash twin for each
 *   that runs into the thing and must pay nothing.
 *
 *   THE TOWN. tests/fixtures/town-crash.json, the town's solids round
 *   crash-check.js's shopfront as the shell handed them to the module,
 *   turned back into the Three.js frame through src/render/frame.js: a
 *   skim along the shopfront and its crash twin, and the covered walk north
 *   of it. The town has no named gaps.
 *
 *   THE COST of a close call feed, measured on each line and in open air,
 *   per feed and per query, on this machine.
 *
 * Every run goes through scripts/lib/counterrun.js, the shell's own order.
 *
 * Usage: node scripts/counter-check.js [--verbose]   (npm run check:counter)
 * Exit code is the failure count, like the other selftests.
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { starterMap } from '../src/maps/built/starter.js';
import { normalize } from '../src/trackbuilder/model.js';
import { placeDocument, docToWorld, groundUnder } from '../src/maps/built/place.js';
import { addSolids } from '../src/props/solids.js';
import { Colliders, CRAFT_WORLD_R } from '../src/game/collide.js';
import { namedGaps, NamedGapCounter, GAP_REARM_M } from '../src/game/gaps.js';
import { CloseCalls, CC_EVERY } from '../src/game/closecall.js';
import { simPosToThree } from '../src/render/frame.js';
import { townShapes } from './lib/worldruns.js';
import {
  polyline, flyCounter, ofKind, CONTACT_M,
} from './lib/counterrun.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '..', 'tests', 'fixtures', 'town-crash.json');
const VERBOSE = process.argv.includes('--verbose');

let failures = 0;

function check(name, cond, detail) {
  if (cond) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`);
  }
  if (detail && (VERBOSE || !cond)) {
    console.log(`        ${detail}`);
  }
}

/* What a run scored, in one line: every counter event but the banks, and
 * a bail as what it lost. */
function said(run) {
  return run.events
    .filter((e) => e.kind !== 'bank')
    .map((e) => (e.kind === 'bail' ? `bailed, lost ${e.points}` : `${e.name} ${e.points}`))
    .join(', ') || 'nothing';
}

/*
 * The cost of a close call feed along a path, alone: a fresh CloseCalls fed
 * every CC_EVERY steps for the path's own length, REPS times over so the
 * engine has settled, in microseconds a feed and distance queries a feed.
 * Only the feeds on the path are counted, never the idle ones after it.
 */
const REPS = 40;
const costs = [];
function cost(label, colliders, path, ground) {
  const feedsPer = Math.floor(path.steps / CC_EVERY);
  let queries = 0;
  let ms = 0;
  for (let r = 0; r < REPS; r += 1) {
    const cc = new CloseCalls(colliders);
    const t0 = performance.now();
    for (let k = 1; k <= feedsPer; k += 1) {
      const s = k * CC_EVERY;
      const p = path.at(s);
      cc.step(s, p, ground(p.x, p.z), false, false);
    }
    ms += performance.now() - t0;
    queries = cc.queries;
  }
  costs.push({
    label, us: (ms * 1000) / (REPS * feedsPer), q: queries / feedsPer, feeds: feedsPer,
  });
}

const R = CRAFT_WORLD_R;

/* ------------------------------------------------------------------
 * Hibari Yard
 * ------------------------------------------------------------------ */

console.log('Hibari Yard, placed as the map module places it');
const { doc } = normalize(starterMap());
const placed = placeDocument(doc);
const yard = new Colliders();
addSolids(yard, placed.solids);
yard.build();
const W = placed.W;
const D = placed.D;
/* A document point in the world, through place.js's own conversion. */
const at = (x, y, z) => {
  const p = docToWorld(W, D, x, y, z, {});
  return [p.x, p.y, p.z];
};
/* The yard's ground under the craft, the map's `height` as the shell asks
 * it (SURFACE_BIAS 0.4 under the CG, and the CG). */
const yardGround = (x, z) => groundUnder(placed.tops, x, z, 2.6, 3);
const yardGroundAt = (y) => (x, z) => groundUnder(placed.tops, x, z, y - 0.4, y);

const rects = namedGaps(placed.zones);
const gapEls = doc.elements.filter((e) => e.type === 'gap');
check('the yard has its five named gaps', rects.length === 5 && gapEls.length === 5,
  rects.map((r) => `${r.name} ${r.tier}`).join(', '));
{
  let same = rects.length === gapEls.length;
  for (let i = 0; i < gapEls.length && same; i += 1) {
    const e = gapEls[i];
    const p = docToWorld(W, D, e.position.x, e.position.y, e.position.z || 0, {});
    const r = rects[i];
    same = r.name === e.name && r.tier === e.points && r.x === p.x && r.y === p.y && r.z === p.z
      && r.hw === e.dims.width / 2 && r.h === e.dims.height;
  }
  check('each is its element, through docToWorld, with its name, tier and size', same);
}
{
  /* The crane gap faces north (a document yaw of a quarter turn): its
   * normal is the world's -z, the document's +y. */
  const crane = rects.find((r) => r.name === 'CRANE GAP');
  const tunnel = rects.find((r) => r.name === 'CONTAINER TUNNEL');
  check('a gap facing north is flown along the world\'s -z, one facing east along +x',
    crane && Math.abs(crane.nx) < 1e-6 && Math.abs(crane.nz + 1) < 1e-6
    && tunnel && Math.abs(tunnel.nx - 1) < 1e-12 && Math.abs(tunnel.nz) < 1e-12);
}

/* Each gap flown through the middle of its window, both ways, and just
 * outside each of its four edges. */
{
  const empty = new Colliders().build();
  let through = 0;
  let back = 0;
  let clear = 0;
  let outside = 0;
  const lines = [];
  for (const r of rects) {
    const mid = [r.x, r.y + r.h / 2, r.z];
    const a = [mid[0] - 3 * r.nx, mid[1], mid[2] - 3 * r.nz];
    const b = [mid[0] + 3 * r.nx, mid[1], mid[2] + 3 * r.nz];
    const fwd = flyCounter({ colliders: empty, gaps: rects, path: polyline(a, [{ to: b, speed: 15 }]), groundY: -50 });
    const rev = flyCounter({ colliders: empty, gaps: rects, path: polyline(b, [{ to: a, speed: 15 }]), groundY: -50 });
    const g1 = ofKind(fwd.events, 'gap');
    const g2 = ofKind(rev.events, 'gap');
    if (g1.length === 1 && g1[0].name === r.name && g1[0].tier === r.tier && g1[0].points === r.tier) {
      through += 1;
    }
    if (g2.length === 1 && g2[0].name === r.name) {
      back += 1;
    }
    lines.push(`${r.name} ${g1.length}/${g2.length}`);
    /* The window's middle line is clear of every solid a metre either side
     * of it: flying the gap is not flying into what it is cut in. */
    let ok = true;
    for (let s = -1; s <= 1.0001; s += 0.05) {
      if (yard.gapAt(mid[0] + s * r.nx, mid[1], mid[2] + s * r.nz, CONTACT_M) < CONTACT_M) {
        ok = false;
      }
    }
    clear += ok ? 1 : 0;
    /* Beside, over and under: 5 cm outside each edge. */
    const edges = [
      [r.hw + 0.05, r.h / 2], [-r.hw - 0.05, r.h / 2], [0, r.h + 0.05], [0, -0.05],
    ];
    for (const [u, v] of edges) {
      const p = [r.x + u * r.ax, r.y + v, r.z + u * r.az];
      const pa = [p[0] - 3 * r.nx, p[1], p[2] - 3 * r.nz];
      const pb = [p[0] + 3 * r.nx, p[1], p[2] + 3 * r.nz];
      const run = flyCounter({ colliders: empty, gaps: [r], path: polyline(pa, [{ to: pb, speed: 15 }]), groundY: -50 });
      outside += ofKind(run.events, 'gap').length;
    }
  }
  check('each gap flown square through its middle pays once, its name at its tier', through === rects.length, lines.join(', '));
  check('and flown back the other way pays once', back === rects.length);
  check('and its middle line is clear of every solid a metre either side', clear === rects.length);
  check('and 5 cm outside any edge pays nothing', outside === 0, `${outside} paid outside`);
}
{
  /* Rocking in the crane gap's window, then away and back. */
  const r = rects.find((g) => g.name === 'CRANE GAP');
  const mid = [r.x, r.y + r.h / 2, r.z];
  const off = (s) => [mid[0] + s * r.nx, mid[1], mid[2] + s * r.nz];
  const legs = [];
  for (let i = 0; i < 12; i += 1) {
    legs.push({ to: off(0.4), speed: 5 }, { to: off(-0.4), speed: 5 });
  }
  legs.push({ to: off(-(GAP_REARM_M + 0.5)), speed: 6 }, { to: off(3), speed: 12 });
  const run = flyCounter({ colliders: new Colliders().build(), gaps: rects, path: polyline(off(-0.4), legs), groundY: -50 });
  const g = ofKind(run.events, 'gap');
  check('rocking in the crane gap pays it once, and flying back through pays it again at three quarters',
    run.gapsRun.crossings === 2 && g.length === 2 && g[0].points === 1000 && g[1].points === 750,
    g.map((e) => `${e.name} ${e.points}`).join(', '));
}
{
  /* A step through a gap's window is found at any speed: the sweep. */
  const r = rects.find((g) => g.name === 'WATER TOWER');
  const mid = [r.x, r.y + r.h / 2, r.z];
  const gc = new NamedGapCounter();
  gc.setGaps(rects);
  gc.step(1, mid[0] - 0.04 * r.nx, mid[1], mid[2] - 0.04 * r.nz);
  gc.step(2, mid[0] + 0.04 * r.nx, mid[1], mid[2] + 0.04 * r.nz);
  gc.cut();
  gc.step(3, mid[0] - 0.04 * r.nx, mid[1], mid[2] - 0.04 * r.nz);
  gc.step(4000, mid[0] - 0.04 * r.nx, mid[1], mid[2] - 0.04 * r.nz);
  check('one step of 8 cm across a window is a crossing, and a set down across it is not',
    gc.crossings === 1 && gc.events.length === 1 && gc.events[0].name === 'WATER TOWER');
}

console.log('\nclose calls on the yard\'s solids');
{
  /* Along the south face of the three high stack of forty foot containers
   * at (92, 47): its face is 1.22 m south of the middle, and the line is
   * 0.4 m of hull clear of it, 3 m up, at 15 m/s, then peels away south. */
  const y = 47 - 1.22 - R - 0.4;
  const line = (into) => polyline(at(80, y, 3), into
    ? [{ to: at(96, y, 3), speed: 15 }, { to: at(98, 46.5, 3), speed: 15 }]
    : [{ to: at(104, y, 3), speed: 15 }, { to: at(110, y - 8, 3), speed: 15 }]);
  const run = flyCounter({ colliders: yard, path: line(false), groundY: yardGroundAt(3) });
  cost('yard, skim along a container stack', yard, line(false), yardGroundAt(3));
  const skims = ofKind(run.events, 'skim');
  check('a skim along the container stack pays one Wall skim',
    skims.length === 1 && skims[0].name === 'Wall skim' && skims[0].points > 0 && skims[0].holdMs > 700,
    said(run));
  /* The stack's face, measured from the middle of the line. */
  const mid = at(92, y, 3);
  const face = yard.gapAt(mid[0], mid[1], mid[2], 2) - R;
  check('at the clearance flown past its face', skims.length === 1 && Math.abs(skims[0].clearance - face) < 0.01,
    skims[0] ? `${skims[0].clearance} m against ${face.toFixed(3)}` : '');
  console.log(`        ${said(run)}`);
  const crash = flyCounter({ colliders: yard, path: line(true), groundY: yardGroundAt(3), crashOnContact: true });
  check('the same skim ending in the stack pays nothing',
    crash.crashedAt > 0 && crash.counter.total() === 0 && ofKind(crash.events, 'skim').length === 0
    && crash.ccEvents.some((e) => e.kind === 'lost' && e.of === 'skim'),
    said(crash));
}
{
  /* The container tunnel, end to end along its gap's line, through the
   * middle of its window: 1.35 m up, the window's middle. */
  const tunnel = rects.find((g) => g.name === 'CONTAINER TUNNEL');
  const h = tunnel.y + tunnel.h / 2;
  const line = (into) => polyline(at(78, 40, h), into
    ? [{ to: at(94, 40, h), speed: 12 }, { to: at(96, 41.5, h), speed: 12 }]
    : [{ to: at(104, 40, h), speed: 12 }, { to: at(106, 36, 4), speed: 12 }]);
  const run = flyCounter({
    colliders: yard, gaps: rects, path: line(false), groundY: yardGroundAt(h),
  });
  cost('yard, the container tunnel', yard, line(false), yardGroundAt(h));
  const kinds = run.events.filter((e) => e.kind !== 'bank').map((e) => e.kind).sort().join(' ');
  check('the container tunnel end to end pays its gap, an Under, a Thread and a Wall skim',
    kinds === 'gap skim thread under'
    && ofKind(run.events, 'gap')[0].name === 'CONTAINER TUNNEL', said(run));
  check('and they bank in one combo, times four',
    ofKind(run.events, 'bank').length === 1 && ofKind(run.events, 'bank')[0].mult === 4);
  console.log(`        ${said(run)}, banked ${run.counter.total()}`);
  const crash = flyCounter({
    colliders: yard, gaps: rects, path: line(true), groundY: yardGroundAt(h), crashOnContact: true,
  });
  check('the same line into the tunnel\'s wall halfway pays nothing',
    crash.crashedAt > 0 && crash.counter.total() === 0
    && ofKind(crash.events, 'skim').length === 0 && ofKind(crash.events, 'thread').length === 0
    && ofKind(crash.events, 'under').length === 0,
    `${said(crash)}; lost ${crash.ccEvents.filter((e) => e.kind === 'lost').map((e) => e.of).join(' ')}`);
}
{
  /* North up the lane under the footbridge, through its named gap, 2 m up. */
  const line = (into) => polyline(at(140, 76, 2), into
    ? [{ to: at(140, 93.5, 2), speed: 12 }, { to: at(140, 93.5, 4.9), speed: 8 }]
    : [{ to: at(140, 108, 2), speed: 12 }]);
  const run = flyCounter({ colliders: yard, gaps: rects, path: line(false), groundY: yardGroundAt(2) });
  cost('yard, under the footbridge', yard, line(false), yardGroundAt(2));
  const unders = ofKind(run.events, 'under');
  const gaps = ofKind(run.events, 'gap');
  check('up the lane under the footbridge pays FOOTBRIDGE and an Under',
    gaps.length === 1 && gaps[0].name === 'FOOTBRIDGE' && unders.length === 1, said(run));
  console.log(`        ${said(run)}`);
  const crash = flyCounter({
    colliders: yard, gaps: rects, path: line(true), groundY: yardGroundAt(2), crashOnContact: true,
  });
  check('the same line climbing into the deck pays nothing',
    crash.crashedAt > 0 && crash.counter.total() === 0 && ofKind(crash.events, 'under').length === 0,
    said(crash));
}
{
  /* Open air over the yard, 20 m up: nothing near, one query a feed. */
  const run = flyCounter({
    colliders: yard, path: polyline(at(20, 20, 20), [{ to: at(140, 140, 20), speed: 20 }]), groundY: yardGround,
  });
  cost('yard, open air 20 m up', yard, polyline(at(20, 20, 20), [{ to: at(140, 140, 20), speed: 20 }]), yardGround);
  check('open air pays nothing', run.events.length === 0);
  check('and asks at most one query a feed', run.cc.queries <= run.feeds, `${run.cc.queries} in ${run.feeds}`);
}
{
  /* Determinism: the tunnel twice, the same events to the bit. */
  const tunnel = rects.find((g) => g.name === 'CONTAINER TUNNEL');
  const h = tunnel.y + tunnel.h / 2;
  const once = () => flyCounter({
    colliders: yard,
    gaps: rects,
    path: polyline(at(78, 40, h), [{ to: at(104, 40, h), speed: 12 }, { to: at(106, 36, 4), speed: 12 }]),
    groundY: yardGroundAt(h),
  });
  const a = once();
  const b = once();
  check('the same line twice gives the same events to the bit',
    JSON.stringify(a.events) === JSON.stringify(b.events) && JSON.stringify(a.ccEvents) === JSON.stringify(b.ccEvents));
}

/* ------------------------------------------------------------------
 * The town
 * ------------------------------------------------------------------ */

console.log('\nthe town, round the shopfront (tests/fixtures/town-crash.json)');
const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const town = new Colliders();
{
  const A = { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  const B = { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  for (const s of townShapes(fx)) {
    if (s.type !== 1) {
      continue;
    }
    const a = s.args;
    simPosToThree(a[0], a[1], a[2], A);
    simPosToThree(a[3], a[4], a[5], B);
    town.addBox('wall', A.x, A.y, A.z, B.x, B.y, B.z);
  }
  town.build();
}
const townGround = fx.ground.y;
check('the fixture rebuilds as colliders', town.count === fx.shapes.length, `${town.count} shapes`);
{
  /* Along the shopfront, its face at x = 5.6, 0.4 m of hull clear of it,
   * 2.5 m up, north at 12 m/s, then away west across the street. */
  const x = fx.wall.face - R - 0.4;
  const line = (into) => polyline([x, 2.5, 25.5], into
    ? [{ to: [x, 2.5, 31], speed: 12 }, { to: [fx.wall.face, 2.5, 31.8], speed: 12 }]
    : [{ to: [x, 2.5, 32.6], speed: 12 }, { to: [-6, 2.5, 36], speed: 12 }]);
  const run = flyCounter({ colliders: town, path: line(false), groundY: townGround });
  cost('town, skim along the shopfront', town, line(false), () => townGround);
  const skims = ofKind(run.events, 'skim');
  check('a skim along the town\'s shopfront pays one Wall skim',
    skims.length === 1 && skims[0].name === 'Wall skim' && skims[0].points > 0, said(run));
  console.log(`        ${said(run)}`);
  const crash = flyCounter({ colliders: town, path: line(true), groundY: townGround, crashOnContact: true });
  check('the same skim ending in the shopfront pays nothing',
    crash.crashedAt > 0 && crash.counter.total() === 0 && ofKind(crash.events, 'skim').length === 0
    && crash.ccEvents.some((e) => e.kind === 'lost'),
    said(crash));
}
{
  /* Under the covered walk north of the shop: its roof 2.95 m up. */
  const run = flyCounter({
    colliders: town, path: polyline([-19.65, 1.5, 47], [{ to: [-19.65, 1.5, 59], speed: 12 }, { to: [-12, 4, 64], speed: 12 }]), groundY: townGround,
  });
  cost('town, under the covered walk', town, polyline([-19.65, 1.5, 47], [{ to: [-19.65, 1.5, 59], speed: 12 }]), () => townGround);
  check('under the town\'s covered walk pays an Under', ofKind(run.events, 'under').length === 1, said(run));
  console.log(`        ${said(run)}`);
}
{
  const run = flyCounter({
    colliders: town, path: polyline([-40, 30, 10], [{ to: [20, 30, 55], speed: 20 }]), groundY: townGround,
  });
  cost('town, open air 30 m up', town, polyline([-40, 30, 10], [{ to: [20, 30, 55], speed: 20 }]), () => townGround);
  check('open air over the town pays nothing, at one query a feed at most',
    run.events.length === 0 && run.cc.queries <= run.feeds);
}

console.log('\nthe cost of a close call feed (a feed every 8 ms, 125 a second)');
for (const c of costs) {
  console.log(`        ${c.label.padEnd(40)} ${c.us.toFixed(2).padStart(6)} us a feed, ${c.q.toFixed(1).padStart(4)} queries a feed, ${c.feeds} feeds`);
}
{
  const worst = costs.reduce((m, c) => (c.us > m ? c.us : m), 0);
  console.log(`        worst ${worst.toFixed(2)} us a feed, ${(worst * 125 / 1000).toFixed(3)} ms a second of flight`);
  check('every line was fed every 8 ms', costs.every((c) => c.feeds > 0) && CC_EVERY === 8);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`);
process.exit(failures);
