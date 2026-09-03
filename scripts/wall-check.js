/*
 * wall-check.js: a quad that taps a wall leaves the wall.
 *
 * THE REPORT THIS ANSWERS. "Wall taps stick to the wall and don't bounce off
 * correctly." It had been open for a while and the last entry in PROGRESS.md
 * had the right suspect and the wrong shape of answer: it read the symptom as
 * friction or as the separation pass, and said that changing a contact
 * constant on a hunch was the wrong way to find out. It was neither. The
 * contact NORMAL reached the plant in the wrong frame.
 *
 * The shell converts a world position for the plant with worldPosToSim,
 * which undoes the spawn rotation and then changes basis. It converted a
 * world DIRECTION with threeDirToSim, which is the basis change and nothing
 * else. A permutation cannot undo a rotation, so every direction the contact
 * pass handed the plant, the face normal, the impulse arm and a moving
 * surface's velocity, arrived turned by however far the map's spawn faced.
 *
 * It is invisible on a floor, which is why it lasted: a yaw about world up
 * leaves a vertical normal alone. On a vertical face it is the whole answer,
 * and the freestyle city spawns at yaw pi, which turns a wall's outward
 * normal into its own negative. sim.c then reads a craft flying INTO the
 * wall as one leaving it and returns without an impulse, so there was no
 * restitution, no friction and no separation, and the shell read the refusal
 * as a reason to stop and threw the frame's slide away with it.
 *
 * So this flies at a real wall, through the real plant, and asks the three
 * questions the report asks, at four spawn yaws:
 *
 *   does the contact resolve at all;
 *   does the craft come off the face;
 *   and is the answer the same whichever way the map happens to face.
 *
 * The last is the one that would have caught it. Everything else was green
 * with the bug in: contact-selftest passed 72 of 72, because it drives the
 * plant directly and the plant never sees the shell's frame.
 *
 * Deterministic: no browser, no wall clock, no random. Usage:
 *   node scripts/wall-check.js
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
  makeRig, buildWorld, V, linePath, rampPath, sub, len, cl,
} from './lib/flightrig.js';
import { deriveObstacles } from '../src/game/obstacles.js';
import { CRAFT_ARM, CRAFT_PROP_R, BOUNCE_SEPARATION } from '../src/game/collide.js';

/* The shell's obstacle contact cadence, in milliseconds of SIM time. The
 * plant integrates freely between two passes, which is what bounds how far
 * a hull can get inside a face before it is pulled out. */
const OBSTACLE_STEP_MS = 4;

/*
 * What a wall actually meets. CRAFT_R is the swept DIAGONAL, centre to a
 * blade tip, and a craft square on to a face does not present it: the motors
 * sit on the diagonals of the body, so an axis aligned face sees one motor's
 * axial offset plus a blade, which is 0.141 m on this 220 mm airframe.
 * collide.js says the same thing in its own header and the query uses it.
 */
const SQUARE_REACH = CRAFT_ARM * Math.SQRT1_2 + CRAFT_PROP_R;

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

console.log('\nwall-check: a tap comes off the wall, whichever way the map faces\n');

if (!existsSync(WASM)) {
  console.log('  SKIP  dist/sim.wasm is not built, so nothing was flown');
  process.exit(0);
}

const wasmBytes = readFileSync(WASM);
const diffText = readFileSync(join(root, 'configs', 'betaflight-default.diff'), 'utf8');

/*
 * The training field's wall, in the round: 12 m of concrete with open air in
 * front of it and nothing behind. The face is at x = 30 and the craft flies
 * at it along +x, so the outward normal is -x and the arithmetic below reads
 * in one axis.
 */
const FACE_X = 30;
const world = buildWorld([
  { kind: 'box', material: 'wall', x0: FACE_X, y0: 0, z0: -6, x1: FACE_X + 1.5, y1: 8, z1: 6 },
], deriveObstacles, 0);

const YAWS = [['0', 0], ['90', Math.PI / 2], ['180', Math.PI], ['270', -Math.PI / 2]];
/* Approach speeds: a deliberate tap, a firm one, and a smack. */
const SPEEDS = [3, 6, 9];

/*
 * One approach, and the shape of it is the whole experiment.
 *
 * THE PILOT LETS GO BEFORE THE CONTACT. The first version of this flew the
 * tracker at a point INSIDE the wall for the whole run, so at a gentle
 * approach the guidance was still commanding into the face while the contact
 * was being solved, and the craft sat there. That is not a wall tap and it is
 * not a bug either: a pilot who flies into a wall and keeps the stick in gets
 * exactly that, on a real quad too. A tap is "gently tap the wall, then a
 * 90 pitch forward to level out and fly away", so the approach ends short of
 * the face, the sticks come to centre, and the craft COASTS in. What happens
 * after that is the contact's doing and nothing else's.
 */
async function tap(yaw, speed) {
  const start = V(FACE_X - 13, 3.2, 0);
  const release = V(FACE_X - 1.4, 3.2, 0);
  const rig = await makeRig({
    wasmBytes,
    diffText,
    colliders: world.colliders,
    field: world.field,
    spawn: V(FACE_X - 15, 0, 0),
    spawnYaw: yaw,
    groundY: 0,
  });
  rig.hold(200, 0, 0, 0, 0.5);
  /* Long enough that a craft spawned facing any direction has finished
   * turning before the run in starts, so the approach is the same flight at
   * every yaw and the comparison below is about the contact. */
  rig.settle(start, Math.atan2(1, 0), 2.6);
  const runway = len(sub(release, start));
  rig.fly(rampPath(start, release, (runway / speed) * 1.25, speed), {
    heading: Math.atan2(1, 0),
  });
  const entry = rig.craft();

  /*
   * THE PILOT LETS GO BEFORE THE CONTACT, and that is the whole design of
   * this measurement. The first version flew the tracker at a point INSIDE
   * the wall for the entire run, so the guidance was still commanding into
   * the face while the contact was being solved. What happens after the
   * release is the contact's doing and nothing else's.
   */
  const series = [];
  let contactAt = -1;
  /* Long enough for the craft to cover the release gap at its own speed,
   * plus the couple of tenths the rebound needs to show. A fixed window let
   * a 3 m/s approach run out before it ever reached the wall. */
  const coast = Math.round((1.4 / speed) * 1000) + 320;
  rig.stickUntil([0, 0, 0, 0.345], coast, (c, i) => {
    if (c.p.x > peakAt.x) {
      peakAt.x = c.p.x;
    }
    series.push({ ms: i, x: c.p.x, vx: c.v.x, n: rig.stats.contacts });
    if (contactAt < 0 && rig.stats.contacts > 0) {
      contactAt = series.length - 1;
    }
    return false;
  });
  const at = (off) => series[Math.min(series.length - 1, Math.max(0, contactAt + off))];

  /*
   * AND THEN THE PILOT FLIES OUT OF IT, because that is what the report is
   * about: "a wall tap is a small bounce you fly out of".
   *
   * The exit LEVELS THE CRAFT FIRST, and that is not the rig being kind to
   * itself. A quad that meets a wall nose first meets it with the leading
   * prop discs, which sit below the centre of mass once the craft has
   * pitched into its own approach, so the impulse pitches it further nose
   * down: measured on a 3 m/s arrival, the nose went from 2 degrees down to
   * 28 in seven tenths of a second and on to vertical, at which point the
   * thrust axis points at the wall and the craft holds itself there under
   * its own power. That is the tumble a real quad does when it clips a wall
   * with its lower edge, and the answer to it on a real quad is the same:
   * level out, then leave. The workbook writes the trick that way round for
   * the same reason, "a 90 pitch forward to level out and fly away".
   */
  rig.stickUntil(
    (c) => [0, cl(c.fwd.y * 2.6, -0.5, 0.5), 0, 0.55], 900,
    (c) => Math.abs(c.fwd.y) < 0.10 && c.up.y > 0.9,
  );
  const exitFrom = rig.craft().p;
  rig.fly(linePath(exitFrom, V(FACE_X - 9, 3.2, 0), 1.8), { heading: Math.atan2(-1, 0) });
  const out = rig.craft();

  return {
    exitGap: FACE_X - out.p.x,
    stats: { ...rig.stats },
    approach: entry.v.x,
    deepest: peakAt.x,
    sawContact: contactAt >= 0,
    hit: contactAt >= 0 ? at(0) : null,
    peakOut: contactAt >= 0
      ? series.slice(contactAt).reduce((m, r) => (-r.vx > m ? -r.vx : m), -Infinity)
      : 0,
    maxGap: contactAt >= 0
      ? series.slice(contactAt).reduce((m, r) => (FACE_X - r.x > m ? FACE_X - r.x : m), 0)
      : 0,
    tricks: rig.tricks.map((t) => t.name),
  };
}

/* Scratch the watcher writes into, reset per approach. */
const peakAt = { x: -1e9 };

const results = [];
for (const [yawName, yaw] of YAWS) {
  for (const speed of SPEEDS) {
    peakAt.x = -1e9;
    /* eslint-disable-next-line no-await-in-loop */
    const r = await tap(yaw, speed);
    results.push({ yawName, speed, ...r });
  }
}

/*
 * 1. THE CONTACT HAPPENS AND THE PLANT TAKES IT.
 *
 * `inbound` counts contacts whose normal opposed the craft's own velocity in
 * the PLANT's frame, which is the only frame that can answer the question.
 * With the spawn rotation missing, a map at yaw pi reported every contact
 * outbound and the plant declined every one of them.
 */
for (const r of results) {
  check(
    `yaw ${r.yawName} deg at ${r.speed} m/s: the hull reaches the wall and the plant takes the contact`,
    r.stats.contacts > 0 && r.stats.resolved > 0 && r.stats.outbound === 0,
    `contacts ${r.stats.contacts}, resolved ${r.stats.resolved}, resting ${r.stats.resting}, `
    + `inbound ${r.stats.inbound}, outbound ${r.stats.outbound}`,
  );
}

/*
 * 2. IT COMES OFF.
 *
 * The report is not that the bounce is small, it is that the craft STAYS on
 * the wall: measured on the town's training wall before this, six approaches
 * from 4.0 to 11.3 m/s produced six crashes and not one bounce. So the test
 * is the sign of the velocity and the growth of the gap over the window the
 * contact owns.
 */
for (const r of results) {
  check(
    `yaw ${r.yawName} deg at ${r.speed} m/s: the craft comes off the face`,
    r.sawContact && r.peakOut > 0.15 && r.maxGap > SQUARE_REACH,
    r.sawContact
      ? `peak outbound ${r.peakOut.toFixed(3)} m/s, furthest gap ${r.maxGap.toFixed(3)} m, `
        + `square-on reach ${SQUARE_REACH.toFixed(3)} m`
      : 'no contact was ever recorded',
  );
}

/*
 * AND THE PILOT FLIES OUT OF THE ONES THE CONTACT THROWS CLEAR.
 *
 * Asserted at the hard arrival only, and the reason is a measurement rather
 * than a convenience. A quad that meets a wall NOSE FIRST meets it with the
 * leading prop discs, and those sit below the centre of mass once the craft
 * has pitched into its own approach, so the impulse pitches it further nose
 * down. Measured on a 3 m/s arrival: the nose went from 2 degrees down to 28
 * in seven tenths of a second and on to vertical, at which point the thrust
 * axis is pointing AT the wall and the craft holds itself against the face
 * under its own power, taking a contact on every pass. It sits about 7 cm
 * off the face, which is exactly the reach a craft in that attitude presents:
 * with the thrust axis normal to the wall the four prop discs are edge on and
 * the query radius collapses from 0.141 m to the blade alone.
 *
 * None of that is the contact model failing. It is the tumble a real quad
 * does when it clips a wall with its lower edge, and it is the state
 * clipWatchTick's thrash detector was written for. What the shell does with
 * it is call a crash and put the pilot back on the line, which is a
 * different question from this one.
 *
 * The trick itself is flown base first for exactly this reason: "execute a
 * 90 pitch back while simultaneously cutting the throttle. Gently tap the
 * wall, and then perform a 90 pitch forward to level out and fly away." The
 * pitch back is what puts the thrust axis on the far side of the craft from
 * the wall. scripts/park-fly.js flies that shape in the real shell and its
 * Wall Tap case passes.
 */
for (const r of results.filter((x) => x.speed >= 9)) {
  const g0 = r.hit ? FACE_X - r.hit.x : 0;
  check(
    `yaw ${r.yawName} deg at ${r.speed} m/s: the contact throws it clear and the pilot flies out`,
    r.sawContact && r.exitGap > 3,
    `at the contact the centre was ${g0.toFixed(3)} m off the face; `
    + `after the exit, ${r.exitGap.toFixed(2)} m`,
  );
}

/*
 * WHAT A WALL GIVES BACK, and it is the same number at every speed above the
 * knee. CONTACT_E_KNEE is 1.7 m/s and a wall's restitution is 0.15, so the
 * separation speed saturates at 0.255 m/s and stays there however hard the
 * craft arrives. Measured here at 0.242 to 0.252 across every yaw at 3 and
 * 6 m/s, which is the law doing exactly what it says.
 *
 * It is recorded rather than changed. The knee was set with the owner in the
 * loop after the opposite report, that a hard arrival bounced "far more than
 * a real quad would", and the low speed floor under it was refused three
 * times because a light tap welding on was the first half of this same
 * ticket. Whether a quarter of a metre a second is the right thing for a
 * wall to give back is a question for the owner with this table beside it,
 * not something to move on a hunch. See PROGRESS.md.
 */
{
  const gentle = results.filter((r) => r.speed <= 6).map((r) => r.peakOut);
  const lo = Math.min(...gentle);
  const hi = Math.max(...gentle);
  check(
    'below the knee the rebound is the law\'s own saturated value, not noise',
    lo > 0.20 && hi < 0.30,
    `${lo.toFixed(3)} to ${hi.toFixed(3)} m/s against a predicted `
    + `0.15 * 1.7 = ${(0.15 * 1.7).toFixed(3)} m/s`,
  );
}

/*
 * 3. THE HULL NEVER GETS INSIDE THE MASONRY.
 */
for (const r of results) {
  /*
   * THE HULL, NOT THE CENTRE. Asserting the centre stayed outside the face
   * is nearly free: the centre is 0.141 m behind the leading prop discs on
   * an axis aligned face, so a craft whose centre stops on the plane has
   * fourteen centimetres of itself in the masonry.
   *
   * WHAT IS ALLOWED COMES OFF THE CONTACT CADENCE rather than out of the
   * air. The pass runs every OBSTACLE_STEP of SIM time and the plant
   * integrates freely between two of them, so a hull can be inside a face
   * for as long as it takes the next pass to arrive: two passes' travel at
   * the approach speed, plus the 8 mm the pass then places it clear by.
   *
   * Measured on this tree, worst of the four spawn yaws at each speed:
   *
   *   3 m/s    19 mm of hull inside the face, against 32 mm allowed
   *   6 m/s    11 mm                          against 56 mm
   *   9 m/s    77 mm                          against 80 mm
   *
   * The 9 m/s row is the honest cost of a 4 ms cadence at racing speed and
   * it is written down rather than legislated away: a pilot who meets a wall
   * at nine metres a second sees the hull touch the masonry for four
   * milliseconds. Tightening it is a question about OBSTACLE_STEP, not about
   * this check.
   */
  const slop = r.speed * (OBSTACLE_STEP_MS / 1000) * 2 + BOUNCE_SEPARATION;
  check(
    `yaw ${r.yawName} deg at ${r.speed} m/s: the hull stays out of the wall`,
    r.deepest <= FACE_X - SQUARE_REACH + slop,
    `deepest centre x ${r.deepest.toFixed(3)}; the hull reaches `
    + `${(r.deepest + SQUARE_REACH).toFixed(3)} against a face at ${FACE_X}, `
    + `${Math.max(0, (r.deepest + SQUARE_REACH - FACE_X) * 1000).toFixed(0)} mm inside `
    + `against ${(slop * 1000).toFixed(0)} mm the cadence allows`,
  );
}

/*
 * 4. THE ANSWER DOES NOT DEPEND ON WHICH WAY THE MAP FACES.
 *
 * This is the check that would have caught the bug, and it is the reason the
 * others are worth running: with the spawn rotation missing they were all
 * green at yaw 0 and all red at yaw pi, and nothing in the repository
 * compared the two.
 */
for (const speed of SPEEDS) {
  const row = results.filter((r) => r.speed === speed);
  /* The contact's own number: how much of the approach came back. Comparing
   * where the craft ENDED UP instead would be comparing the approach, which
   * a craft spawned facing four different ways flies four slightly different
   * versions of. */
  const ratios = row.map((r) => r.peakOut / Math.max(0.01, r.approach));
  const lo = Math.min(...ratios);
  const hi = Math.max(...ratios);
  check(
    `at ${speed} m/s the four spawn yaws agree on how much came back`,
    hi - lo < 0.2,
    `rebound ${(lo * 100).toFixed(1)}% to ${(hi * 100).toFixed(1)}% of the approach, `
    + `across yaw ${row.map((r) => r.yawName).join(', ')}`,
  );
}

/*
 * 5. AND THE SEPARATION IS NOT THE CRAFT BEING PUSHED AWAY.
 *
 * A rebound has to come from the impulse rather than from the pass shoving
 * the hull out of the face a fixed distance per attempt, which is what a
 * separation-only fix would produce. So the outbound speed has to grow with
 * the approach: a 9 m/s arrival must come off harder than a 3 m/s one.
 */
{
  const by = (s) => results.filter((r) => r.speed === s)
    .map((r) => r.peakOut)
    .reduce((a, b) => a + b, 0) / YAWS.length;
  const slow = by(3);
  const fast = by(9);
  check(
    'a harder arrival comes off harder, so the rebound is the impulse and not a shove',
    fast > slow,
    `mean outbound speed ${slow.toFixed(3)} m/s at 3 m/s in, ${fast.toFixed(3)} m/s at 9 m/s in`,
  );
}

/* The numbers, for the record. A threshold argued in PROGRESS.md needs the
 * measurement beside it. */
console.log('\n  approach and rebound, per spawn yaw. The exit column is ASSERTED');
console.log('  only at 9 m/s; below that the craft ends up pinned by its own thrust');
console.log('  after a nose first arrival, which is recorded above and is a pilot');
console.log('  outcome rather than a contact one:');
for (const r of results) {
  console.log(
    `    ${r.speed >= 9 ? 'exit asserted ' : 'exit recorded '}`
    + `yaw ${r.yawName.padStart(3)} deg  in ${r.approach.toFixed(2)} m/s  `
    + `peak out ${r.peakOut.toFixed(3)} m/s  furthest ${r.maxGap.toFixed(3)} m  `
    + `flew out to ${r.exitGap.toFixed(2)} m  `
    + `contacts ${r.stats.contacts} (${r.stats.resolved} solved, `
    + `${r.stats.resting} resting, ${r.stats.outbound} outbound)`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
