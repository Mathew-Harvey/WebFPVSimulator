/*
 * wallpin-check.js: a craft wedged at the foot of a wall is set down.
 *
 * THE REPORT THIS ANSWERS. bug-6c405527, "Wall Sticking", a five inch on the
 * keyboard in acro: "Whenever I hit a wall, i sometimes glitch in and get
 * stuck, forcing me to start over". Expected: "My drone to bounce off, maybe
 * crash". The report's craft probe had it 0.1 m up, 52 degrees over (upZ
 * 0.62), at 0 m/s, not landed, the sticks centred and the keyboard holding
 * hover, and no set down in the last two minutes.
 *
 * THE CAUSE. stuckTick in src/main.js sets a still craft down nearby, but it
 * only counted one more than 60 degrees from level as stuck (upZ under
 * TURTLE_EXIT_UPZ), so a craft leaning on a wall at 52 degrees was left where
 * it was for good. And it cannot be flown out: flown below through the real
 * plant, a keyboard tap forward from a low hover two metres from a wall puts
 * the craft in the corner of the wall and the ground at the ticket's own
 * numbers, where pitching either way drives a blade into one of the two
 * faces and the thrust presses it into the wall. heldStill in
 * src/game/collide.js is now the pose half of stuckTick, and counts a craft
 * that is still, beside a solid and past the perch's tilt as stuck too.
 *
 * WHAT IS ASSERTED. The rule's own cases, as numbers, including the ticket's
 * pose and the ones that must stay free (an upright craft pressed to a
 * ceiling, a hover in open air, a 3D craft on its back); then the crash
 * itself, at two spawn yaws because a direction through the spawn rotation
 * is how wall-check's bug hid: that it wedges in the band the old test
 * missed, that the old test would never have set it down, and that the new
 * one holds it as stuck for longer than STUCK_MS, so stuckTick sets it down.
 * Whether the pilot could have flown out is measured and printed, not
 * counted: it is a property of the contact model, which is the owner's to
 * tune, and the set down is right either way.
 *
 * AND IN THE SHELL, with --shell: the same tap and let go flown in the real
 * page, in the town beside crash-check's shopfront, three times. Each must
 * come to rest beside a solid in the band, and is then held to crash-check's
 * own guard read with heldStill: never left in stuckTick's test for more
 * than its 1.5 s and half a second of frames without a set down. That is the
 * wiring in src/main.js, which nothing in Node can see: what it passes
 * heldStill, and that it asks at all.
 *
 * Deterministic without --shell: no browser, no wall clock, no random. The
 * shell half runs on the frame clock, so it asserts what happens and not
 * when. Usage:
 *   node scripts/wallpin-check.js            seconds, Node only
 *   node scripts/wallpin-check.js --shell    and the page, a few minutes
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
import { makeRig, buildWorld, V } from './lib/flightrig.js';
import { deriveObstacles } from '../src/game/obstacles.js';
import {
  heldStill, STUCK_LEAN_UPZ, STUCK_SPEED, STUCK_RATE, TURTLE_EXIT_UPZ, LAND_TILT_MAX_DEG,
  CRAFT_WORLD_R, makeStillMeter, stillMeterStep,
} from '../src/game/collide.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const WASM = join(root, 'dist', 'sim.wasm');

/* stuckTick's clock in src/main.js: still this long, in sim ms, and it sets
 * the craft down. It asks once a frame, so this does too, at 60 Hz. */
const STUCK_MS = 1500;
const FRAME_MS = 16;
/* How long the pilot leaves it after letting go. The wedge takes up to
 * 2.8 s to settle into the corner, and stuckTick has no deadline, so this
 * is long enough to see whether the clock ever reaches STUCK_MS. */
const WATCH_MS = 6000;

let passed = 0;
let failed = 0;
function check(name, ok, note) {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${note ? `: ${note}` : ''}`);
}

console.log('\nwallpin-check: a craft wedged at the foot of a wall is set down\n');

console.log(' the rule, as numbers');
check('the lean limit is the perch tilt, cos(LAND_TILT_MAX_DEG)',
  Math.abs(STUCK_LEAN_UPZ - Math.cos((LAND_TILT_MAX_DEG * Math.PI) / 180)) < 1e-3,
  `${STUCK_LEAN_UPZ} against ${Math.cos((LAND_TILT_MAX_DEG * Math.PI) / 180).toFixed(4)}`);
check("the ticket's craft, 52 degrees over at the foot of a wall, is stuck",
  heldStill(0.62, 0, 0, true, false) === true);
check('and the 60 degree test alone would never have said so', !(0.62 < TURTLE_EXIT_UPZ));
check('the same pose touching nothing is not, the rule is about what holds it',
  heldStill(0.62, 0, 0, false, false) === false);
check('an upright craft pressed to a ceiling or a wall is not',
  heldStill(0.99, 0.05, 0.2, true, false) === false);
check('a hover in open air is not', heldStill(0.995, 0.1, 0.3, false, false) === false);
check('more than 60 degrees over and still is, touching or not',
  heldStill(0.3, 0.1, 0.5, false, false) && heldStill(-0.97, 0, 0, false, false));
check('a craft sliding down the face is not, yet',
  heldStill(0.62, STUCK_SPEED, 0, true, false) === false);
check('nor one still turning', heldStill(0.62, 0, STUCK_RATE, true, false) === false);
check('in 3D, flat on its back is its other base and is left alone',
  heldStill(-0.97, 0, 0, false, true) === false && heldStill(-0.97, 0, 0, true, true) === false);
check('in 3D, leaning on a wall upside down is the same wedge',
  heldStill(-0.62, 0, 0, true, true) === true);

if (!existsSync(WASM)) {
  console.log('\n  SKIP  dist/sim.wasm is not built, so nothing was flown');
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

const wasmBytes = readFileSync(WASM);
const diffText = readFileSync(join(root, 'configs', 'betaflight-default.diff'), 'utf8');

/* A wall from the ground up, long enough that the craft cannot slide off
 * its end, with the face at x = 30 looking down -x. */
const FACE_X = 30;
const world = buildWorld([
  { kind: 'box', material: 'wall', x0: FACE_X, y0: 0, z0: -20, x1: FACE_X + 1.5, y1: 8, z1: 20 },
], deriveObstacles, 0);
/* The rig's hover stick on the five inch, which the keyboard holds at rest
 * in its hover mode. */
const HOVER = 0.345;

/*
 * THE TICKET'S CRASH. Settle at 0.8 m, two metres from the face and facing
 * it, tap the nose down for 120 ms as a keyboard pitch key does in acro, and
 * let go with the throttle at hover. A negative pitch stick lowers the nose
 * on this rig (wall-check has the measurement). Then stuckTick's own view of
 * it, a frame at a time: beside a solid is besideSolid's question, a solid
 * within the craft's swept radius of its centre, and the clock runs while
 * the test holds, by the old test and by heldStill. Both read the speed and
 * the rate as stuckTick does since bug-243d42f7, through a still meter fed
 * the plant's state once a frame (stillMeterStep in src/game/collide.js), so
 * the two differ by the pose rule and nothing else.
 */
async function wedge(spawnYaw, after) {
  const rig = await makeRig({
    wasmBytes, diffText, colliders: world.colliders, field: world.field,
    spawn: V(FACE_X - 15, 0, 0), spawnYaw, groundY: 0,
  });
  rig.hold(200, 0, 0, 0, 0.5);
  rig.settle(V(FACE_X - 2, 0.8, 0), Math.atan2(1, 0), 2.6);
  rig.hold(120, 0, -0.5, 0, HOVER);
  const run = { old: 0, now: 0, oldMax: 0, nowMax: 0 };
  const meter = makeStillMeter();
  for (let ms = FRAME_MS; ms <= WATCH_MS; ms += FRAME_MS) {
    rig.hold(FRAME_MS, after[0], after[1], after[2], after[3]);
    const st = rig.state();
    const c = rig.craft();
    const upz = c.upZ;
    stillMeterStep(meter, rig.simMs(), st[1], st[2], st[3], st[7], st[8], st[9], st[10]);
    const { speed, rate } = meter;
    const onSolid = world.colliders.gapAt(c.p.x, c.p.y, c.p.z, CRAFT_WORLD_R) < CRAFT_WORLD_R;
    const oldStill = upz < TURTLE_EXIT_UPZ && speed < STUCK_SPEED && rate < STUCK_RATE;
    run.old = oldStill ? run.old + FRAME_MS : 0;
    run.now = heldStill(upz, speed, rate, onSolid, false) ? run.now + FRAME_MS : 0;
    run.oldMax = Math.max(run.oldMax, run.old);
    run.nowMax = Math.max(run.nowMax, run.now);
  }
  const c = rig.craft();
  const st = rig.state();
  return {
    rig,
    run,
    upz: c.upZ,
    y: c.p.y,
    gap: FACE_X - c.p.x,
    speed: Math.hypot(st[4], st[5], st[6]),
    contacts: rig.stats.contacts,
  };
}

for (const [label, yaw] of [['0', 0], ['180', Math.PI]]) {
  console.log(`\n the ticket's crash, spawn yaw ${label} deg`);
  const w = await wedge(yaw, [0, 0, 0, HOVER]);
  check('it reaches the wall', w.contacts > 0, `${w.contacts} contact steps`);
  check('and comes to rest wedged at its foot, the way the report has it',
    w.speed < STUCK_SPEED && w.y < 0.3 && w.gap < 0.3,
    `${w.speed.toFixed(2)} m/s, ${w.y.toFixed(2)} m up, ${w.gap.toFixed(2)} m from the face`);
  check('past the perch tilt and short of 60 degrees, the band the old test missed',
    w.upz >= TURTLE_EXIT_UPZ && w.upz < STUCK_LEAN_UPZ, `upZ ${w.upz.toFixed(3)}`);
  check('the old test never held it for STUCK_MS, so it was never set down',
    w.run.oldMax < STUCK_MS, `longest ${w.run.oldMax} ms`);
  check('heldStill holds it for STUCK_MS, so stuckTick sets it down',
    w.run.nowMax >= STUCK_MS, `longest ${w.run.nowMax} ms of ${WATCH_MS}`);

  /* Measured, not counted: whether the pilot could have got out alone. */
  const from = w.rig.craft().p;
  w.rig.hold(1000, 0, 1, 0, 1);
  const to = w.rig.craft().p;
  const moved = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  console.log(`  note  full pitch back and full throttle for 1 s moves it ${moved.toFixed(3)} m`);
}

/*
 * THE SAME CRASH IN THE SHELL. The town, on Low, beside crash-check's
 * shopfront (its face at x = 5.6, looking down -x, the spawn street in front
 * of it), flown by the page's own pilot (scripts/lib/pilot.js): settle at a
 * height and a distance from the face, nose down for a moment at hover, let
 * go at hover and watch for five seconds. A step backwards in the module's
 * clock is a set down, as crash-check reads it, and the notice is the one
 * stuckTick shows. Where it comes to rest is not the shopfront itself but a
 * lower solid in front of it, 0.13 to 0.16 m from the centre when it was
 * measured, which is the same wedge.
 */
async function shell() {
  const { openPage } = await import('../tests/lib/page.js');
  const { PILOT } = await import('./lib/pilot.js');
  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
  const page = await openPage({ root, width: 400, height: 260, url: '/index.html' });
  const { cdp, sessionId } = page;
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true,
    }, sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };
  try {
    for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady')); i += 1) {
      await sleep(500);
    }
    await ev("const ui = window.__ui; ui.settings.map = 'city'; ui.settings.graphics = 'low'; ui.onAction('fly', ui.settings); return 1;");
    let ready = false;
    for (let i = 0; i < 260 && !ready; i += 1) {
      const m = await ev('return window.__map ? window.__map() : null');
      ready = Boolean(m && m.ready);
      if (!ready) {
        await sleep(500);
      }
    }
    check('the town loads', ready);
    if (!ready) {
      return;
    }
    /* The town keeps baking after it says it is ready; see park-fly.js. */
    await sleep(6000);
    await ev(`${PILOT}\nreturn 1;`);
    await ev('window.__drawOff(true); return 1;');
    for (const [alt, dist, tapMs] of [[0.8, 2, 120], [1.5, 4, 120], [0.8, 2, 160]]) {
      console.log(`\n in the shell: ${alt} m up, ${dist} m from the shopfront, nose down for ${tapMs} ms`);
      /* eslint-disable no-await-in-loop */
      const rows = await ev(`
        const { V } = window.__vm;
        await window.__settle(V(${5.6 - dist}, ${alt}, 29.3), 1.5708, 1.6);
        await window.__settle(V(${5.6 - dist}, ${alt}, 29.3), 1.5708, 0.8);
        const rows = [];
        const phase = (ms, sticks) => new Promise((res) => {
          const t0 = performance.now();
          const tick = () => {
            const c = window.__craftState();
            rows.push({
              ms: window.__stickPath().moduleMs, upY: c.up ? c.up.y : 1, spd: c.speed, landed: c.landed,
              rate: c.rates ? Math.hypot(c.rates.p, c.rates.q, c.rates.r) : 0,
              /* Infinity does not survive JSON, and null would read as 0. */
              held: [c.held.speed, c.held.rate].map((v) => (Number.isFinite(v) ? v : 1e9)),
              gap: window.__nearSolid(c.worldX, c.worldY, c.worldZ, 1) ?? 9, banner: c.banner,
            });
            window.__stick(...sticks);
            if (performance.now() - t0 >= ms) { res(); return; }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await phase(${tapMs}, [0, -0.5, 0, 0.34]);
        await phase(8000, [0, 0, 0, 0.34]);
        return rows;`);
      /* A step backwards in the module's clock is a set down. */
      let downs = 0;
      let held = 0;
      let longest = 0;
      let wedged = null;
      for (let i = 1; i < rows.length; i += 1) {
        const r = rows[i];
        const d = r.ms - rows[i - 1].ms;
        if (d < 0) {
          downs += 1;
        }
        const beside = r.gap < CRAFT_WORLD_R;
        const test = !r.landed && heldStill(r.upY, r.held[0], r.held[1], beside, false);
        held = test && d >= 0 ? held + d : 0;
        longest = Math.max(longest, held);
        if (!wedged && test && r.upY >= TURTLE_EXIT_UPZ) {
          wedged = r;
        }
      }
      check('it comes to rest beside a solid, past the perch tilt and short of 60 degrees', Boolean(wedged),
        wedged ? `up.y ${wedged.upY.toFixed(3)}, ${wedged.gap.toFixed(3)} m from the solid` : 'never, in eight seconds');
      check('and is never left there: set down within 1.5 s and half a second of frames',
        longest <= STUCK_MS + 500,
        `longest ${longest} ms in stuckTick's test, ${downs} set down${downs === 1 ? '' : 's'}`
        + `${rows.some((r) => /^Stuck/.test(r.banner || '')) ? ', "Stuck" on screen' : ''}`);
    }
  } catch (e) {
    check('the shell run completes', false, e.message);
  } finally {
    await page.close?.();
  }
}

if (process.argv.includes('--shell')) {
  await shell();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
