/*
 * path-check.js: what the craft's own path says it did.
 *
 * WHAT THIS IS CHECKING. src/game/trickdetect.js has always measured an
 * obstacle trick as the WINDING of the craft's position about a line derived
 * from the colliders. `PathTrack`, new, measures the turning of the flight
 * PATH instead, from the craft's own trajectory and its own frame, with no
 * derived geometry in it at all. This is the evidence for that measurement.
 *
 * It is not yet what names a trick. The pattern table still reads the
 * winding; these numbers are computed beside it and read by nothing but this
 * file. That is deliberate and the order matters: the whole history of this
 * recogniser is of measurements that looked right in a constructed flight
 * and were wrong in the air, so the measurement is proven on the real
 * aircraft before anything is allowed to depend on it.
 *
 * WHAT THE NUMBERS ARE FOR, and the four properties below are the argument
 * for the rewrite:
 *
 *   A Powerloop and a Maverick Loop are the same circle flown with the nose
 *   in different places, and the difference is the whole of what de-banking
 *   was invented to recover from the body integrals, with a sign convention
 *   that had to be measured per lap and was backwards in the real shell for
 *   four days. Measured against the PATH's own axis it is one comparison and
 *   there is no convention in it.
 *
 *   A flip and a flick flown in the air enclose NOTHING. The path does turn
 *   through them, because a quad flipping is a quad falling and a falling
 *   craft's path curves, but the curve has nothing in the middle of it and
 *   its radius is a metre where a loop's is five. The old winding cannot
 *   say either thing: a craft flying dead past a rail subtends up to half a
 *   turn about it, which is exactly where a real half loop lands, and the
 *   file's own comment above HALF_LAP_MIN spends a page on the two
 *   populations meeting at the same number from opposite sides.
 *
 *   The thing flown around does not have to be a pole or a bar. It is found
 *   by asking the colliders one distance question at the middle of the turn,
 *   so a wall, a roof edge or a building corner answers as well as a rail.
 *
 *   And none of it can carry a frame error, because the angular velocity is
 *   taken from the observed rotation of the craft's own frame rather than
 *   from a gyro channel whose sign has to be agreed with the renderer's.
 *
 * Deterministic: the real plant, the real colliders, the real recogniser, no
 * browser and no wall clock. Usage:
 *   node scripts/path-check.js
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
  makeRig, buildWorld, V, sub, mul, norm, len, rampPath, linePath, circlePath, TURN,
} from './lib/flightrig.js';
import { deriveObstacles } from '../src/game/obstacles.js';
import { TrickDetector } from '../src/game/trickdetect.js';

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

console.log('\npath-check: the turning of the path, measured on the real aircraft\n');

if (!existsSync(WASM)) {
  console.log('  SKIP  dist/sim.wasm is not built, so nothing was flown');
  process.exit(0);
}

const wasmBytes = readFileSync(WASM);
const diffText = readFileSync(join(root, 'configs', 'betaflight-default.diff'), 'utf8');

/* Every turn the measurement closes, collected as it happens. */
let turnsSeen = [];
const closeTrack = TrickDetector.prototype.closeTrack;
TrickDetector.prototype.closeTrack = function collect() {
  const r = closeTrack.call(this);
  if (r) {
    turnsSeen.push(r);
  }
  return r;
};
const takeTurns = (min = 0.3) => {
  const rows = turnsSeen.filter((t) => t.turns >= min);
  turnsSeen = [];
  return rows;
};
const describe = (t) => `turns ${t.turns.toFixed(2)} ${t.axis} loop ${t.loop.toFixed(2)} `
  + `on ${t.loopOn} fwd ${t.forward.toFixed(2)} object ${t.object} R ${t.radius.toFixed(1)}`;

/* A rail to loop around, and a post to orbit, well apart. */
const BAR = V(0, 6.3, 0);
const POST = V(40, 0, 0);
const world = buildWorld([
  {
    kind: 'capsule', material: 'obstacle', ax: -5, ay: BAR.y, az: 0, bx: 5, by: BAR.y, bz: 0, r: 0.12,
  },
  {
    kind: 'box', material: 'wall', x0: POST.x - 0.16, y0: 0, z0: -0.16, x1: POST.x + 0.16, y1: 12, z1: 0.16,
  },
], deriveObstacles, 0);

async function rig(spawnZ = -20, yaw = Math.PI) {
  const r = await makeRig({
    wasmBytes,
    diffText,
    colliders: world.colliders,
    field: world.field,
    spawn: V(0, 0, spawnZ),
    spawnYaw: yaw,
    groundY: 0,
  });
  r.hold(200, 0, 0, 0, 0.5);
  return r;
}

/* A vertical loop about the rail. noseAlong picks which family it is. */
async function loop({ noseAlong = false, secs = 2.9, yaw = Math.PI } = {}) {
  const r = await rig(-20, yaw);
  const lap = circlePath(BAR, V(0, -1, 0), V(0, 0, -1), 3.4, secs, 0, -1);
  const d0 = lap(0);
  const vEnt = len(d0.v);
  const start = sub(d0.p, mul(norm(d0.v), 12));
  const head = noseAlong ? Math.atan2(1, 0) : Math.atan2(0, -1);
  r.settle(start, head, 2.0);
  r.fly(rampPath(start, d0.p, (12 * 1.9) / Math.max(2, vEnt), vEnt), { heading: head });
  r.fly(lap, { heading: head });
  r.hold(700, 0, 0, 0, 0.45);
  r.done(700);
  return takeTurns(0.6);
}

/*
 * 1. THE POWERLOOP AND THE MAVERICK LOOP, which are the same circle.
 *
 * The nose is tangent to the path in one and along the rail in the other, so
 * the turn's own axis lies across the nose in one and along it in the other.
 * That is the whole difference, and it is one comparison against the PATH's
 * axis rather than a repair applied to a body integral.
 */
{
  const pl = await loop({ noseAlong: false });
  check(
    'a Powerloop turns the path once about a horizontal axis, on PITCH',
    pl.length === 1 && pl[0].axis === 'horizontal' && pl[0].loopOn === 'pitch'
      && Math.abs(pl[0].turns - 1) < 0.3 && Math.abs(pl[0].loop - 1) < 0.3,
    pl.length ? describe(pl[0]) : 'no turn was measured',
  );
  const mv = await loop({ noseAlong: true, secs: 2.3 });
  check(
    'the same circle flown nose along the rail is the same turn, on ROLL',
    mv.length === 1 && mv[0].axis === 'horizontal' && mv[0].loopOn === 'roll'
      && Math.abs(mv[0].turns - 1) < 0.3 && Math.abs(mv[0].loop - 1) < 0.3,
    mv.length ? describe(mv[0]) : 'no turn was measured',
  );
  check(
    'and both found the rail inside the circle they flew',
    pl.length === 1 && mv.length === 1 && pl[0].object === 'inside' && mv[0].object === 'inside',
    `powerloop ${pl[0] && pl[0].object}, maverick ${mv[0] && mv[0].object}`,
  );
}

/*
 * 2. AN ORBIT TURNS ABOUT A VERTICAL AXIS, and its entry and exit arcs do
 * not find anything inside them.
 *
 * The second half is the one that matters. A turn the craft makes on its way
 * into or out of a figure is a real turn and it will be measured; what stops
 * it being scored as one is that there is nothing in the middle of it.
 */
{
  const r = await rig(-20);
  const centre = V(POST.x, 6, 0);
  const lap = circlePath(centre, V(1, 0, 0), V(0, 0, 1), 6, 5.0, 0, 2);
  const d0 = lap(0);
  const vEnt = len(d0.v);
  const start = sub(d0.p, mul(norm(d0.v), 12));
  const look = (t, s) => Math.atan2(centre.x - s.p.x, centre.z - s.p.z);
  r.settle(start, look(0, { p: start }), 2.0);
  r.fly(rampPath(start, d0.p, (12 * 1.9) / Math.max(2, vEnt), vEnt), { heading: look });
  r.fly(lap, { heading: look, ky: 3.0, yawMax: 0.85 });
  r.hold(700, 0, 0, 0, 0.45);
  r.done(700);
  const rows = takeTurns(0.3);
  const orbit = rows.find((t) => t.turns > 1.5);
  check(
    'an orbit turns the path twice about a VERTICAL axis, with the post on the nose',
    Boolean(orbit) && orbit.axis === 'vertical' && orbit.trackFrac > 0.7
      && orbit.object === 'inside',
    orbit ? `${describe(orbit)} track ${orbit.trackFrac.toFixed(2)}` : 'no orbit was measured',
  );
  const arcs = rows.filter((t) => t.turns <= 1.5);
  check(
    'and any arc it flew in or out on has nothing inside it',
    arcs.every((t) => t.object === 'none'),
    arcs.length
      ? arcs.map((t) => `${t.turns.toFixed(2)} turns, object ${t.object}`).join('; ')
      : 'the entry and exit arcs merged into the approach, so none was measured',
  );
}

/*
 * 2b. AND A TURN FLOWN IN OPEN AIR FINDS NOTHING, which is the half of the
 * object test that can be controlled rather than hoped for. The same wide
 * circle, flown where there is nothing to fly around.
 */
{
  const r = await rig(-20);
  const centre = V(POST.x, 6, 60);
  const lap = circlePath(centre, V(1, 0, 0), V(0, 0, 1), 6, 5.0, 0, 2);
  const d0 = lap(0);
  const vEnt = len(d0.v);
  const start = sub(d0.p, mul(norm(d0.v), 12));
  const look = (t, s) => Math.atan2(centre.x - s.p.x, centre.z - s.p.z);
  r.settle(start, look(0, { p: start }), 2.0);
  r.fly(rampPath(start, d0.p, (12 * 1.9) / Math.max(2, vEnt), vEnt), { heading: look });
  r.fly(lap, { heading: look, ky: 3.0, yawMax: 0.85 });
  r.hold(700, 0, 0, 0, 0.45);
  r.done(700);
  const rows = takeTurns(0.3);
  check(
    'the same two laps flown round nothing find nothing inside them',
    rows.length > 0 && rows.every((t) => t.object === 'none'),
    rows.length
      ? rows.map((t) => `${t.turns.toFixed(2)} turns, object ${t.object}`).join('; ')
      : 'no turn was measured at all',
  );
}

/*
 * 3. THE PROPERTY THE WINDING COULD NEVER HAVE.
 *
 * A flip and a juicy flick flown in level flight rotate the craft through a
 * whole turn and a half turn, and turn the PATH through nothing at all. The
 * winding of a straight line about a point off it runs up to half a turn,
 * which is exactly where a real half loop lands, and that overlap is what
 * HALF_LAP_MIN has been trying to legislate around since it was written.
 */
{
  const r = await rig(-60);
  r.settle(V(0, 14, -50), Math.atan2(0, 1), 2.0);
  r.fly(rampPath(V(0, 14, -50), V(0, 14, -36), 2.2, 13), { heading: Math.atan2(0, 1) });
  r.stickUntil([0, 0.85, 0, 0.42], 1400, (c, i, a) => -a.q >= TURN * 0.84);
  r.fly(linePath(r.craft().p, V(0, 14, -10), 2.4), { heading: Math.atan2(0, 1) });
  r.done(700);
  const rows = takeTurns(0.3);
  check(
    'a 360 flip in the air encloses NOTHING, so it can be no lap',
    rows.every((t) => t.object === 'none'),
    rows.length ? rows.map(describe).join('; ') : 'no path turn over a third of a turn',
  );
}
{
  const r = await rig(-60);
  r.settle(V(0, 14, -50), Math.atan2(0, 1), 2.0);
  r.fly(rampPath(V(0, 14, -50), V(0, 14, -36), 2.2, 13), { heading: Math.atan2(0, 1) });
  r.stickUntil([0, -0.8, 0, 0.5], 900, (c, i, a) => a.q >= TURN * 0.46);
  r.stickUntil([0.85, 0, 0, 0.5], 900, (c, i, a) => Math.abs(a.p) >= TURN * 0.46);
  r.fly(linePath(r.craft().p, V(0, 10, -10), 2.4), { heading: Math.atan2(0, 1) });
  r.done(700);
  const rows = takeTurns(0.3);
  check(
    'and neither does a Juicy Flick, which is a half pitch and a half roll',
    rows.every((t) => t.object === 'none'),
    rows.length ? rows.map(describe).join('; ') : 'no path turn over a third of a turn',
  );
}

/*
 * 4. AND IT CANNOT CARRY A FRAME ERROR.
 *
 * The angular velocity is taken from the observed rotation of the craft's
 * own frame rather than from a gyro channel, so there is no convention to
 * agree with the renderer and none to get wrong. The way to show that is to
 * fly the same figure on maps that face three different ways: the contact
 * pass had exactly this fault and was green at one spawn yaw and reversed at
 * another.
 */
{
  const rows = [];
  for (const yaw of [0, Math.PI / 2, Math.PI]) {
    /* eslint-disable-next-line no-await-in-loop */
    const pl = await loop({ noseAlong: false, yaw });
    rows.push(pl[0] || null);
  }
  const ok = rows.every((t) => t && t.axis === 'horizontal' && t.loopOn === 'pitch');
  const spread = ok
    ? Math.max(...rows.map((t) => t.turns)) - Math.min(...rows.map((t) => t.turns))
    : Infinity;
  check(
    'the same Powerloop measures the same at three spawn yaws',
    ok && spread < 0.25,
    rows.map((t, i) => `yaw ${[0, 90, 180][i]}: ${t ? `${t.turns.toFixed(2)} ${t.loopOn}` : 'nothing'}`).join(' | ')
    + ` (spread ${Number.isFinite(spread) ? spread.toFixed(2) : 'n/a'})`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
