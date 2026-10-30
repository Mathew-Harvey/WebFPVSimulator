/*
 * bedslot-check.js: a craft the knock rattles in a slot is still, and is set
 * down.
 *
 * THE REPORT THIS ANSWERS. bug-243d42f7, "Got stuck between a bed and a
 * wall", a whoop on a radio in acro in Nick Burns' house. The report's craft
 * probe had it at (-28, 11.7, -49.6), which is bedroom 4, 0.34 m over the
 * floor in real metres, in the 10.5 cm slot between the mattress and the
 * back wall; on its side (upZ -0.13), at 0 m/s, not landed, the sticks
 * centred and the throttle down, and no set down in the last two minutes.
 *
 * THE CAUSE. The whoop here flies the five inch's plant at world scale 1,
 * whose contact hull is 7.1 cm thick and 18.8 cm across, so it drops
 * edgewise into the slot, and wedged there its thrust is into one face or
 * the other: it cannot be flown out, and stuckTick in src/main.js is what is
 * meant to set it down. stuckTick read the speed and the rate off the
 * plant's state, and the shell's knock (CrashJudge.knock, then
 * putDullBounce, in src/game/collide.js) writes a craft that touches a solid
 * off it at DULL_OUT_MIN, 0.3 m/s, which is STUCK_SPEED. Tipped as it lies, the hull
 * spans all but about 3 mm of the slot, so the craft reaches the other face
 * inside a frame and is knocked back: a frame in every few ended at 0.300
 * m/s, or with the solver's answer to the knock at up to 1.87 rad/s, so the
 * 1.5 s clock never ran past half a second while the craft never left the
 * slot. Since bug-243d42f7 stuckTick reads a still meter instead
 * (stillMeterStep): the displacement and the turn over a tenth of a second
 * of sim time.
 *
 * WHAT IS ASSERTED. The meter as numbers, including the rattle; then the
 * wedge itself through the real plant WITH the shell's knock
 * (scripts/lib/flightrig.js, `bounce`), which is how this hid from every rig
 * check: without the knock the same wedge rests still and the old test sets
 * it down. Dropped edgewise into bedroom 4's slot at the house's spawn frame,
 * at two tilts, hands off and with a pilot working the sticks: that it
 * wedges and stays, that the knock rattles it, that the plant's own speed
 * and rate never hold stuckTick's test for STUCK_MS (the ticket), and that
 * the meter's do (the fix).
 *
 * AND IN THE SHELL, with --shell: the real house on the whoop, the same drop
 * into the same slot in the real page, after a moment in the open in the
 * bedroom so the set down has the pilot's side of the wall to go to. Each
 * must come to rest in the slot, be set down within STUCK_MS and half a
 * second of frames with "Stuck" on screen, and be put down in the bedroom,
 * not through the wall. That is the wiring in src/main.js: that stuckTick
 * feeds the meter and reads it.
 *
 * Deterministic without --shell: no browser, no wall clock, no random. The
 * shell half runs on the frame clock, so it asserts what happens and not
 * when. Usage:
 *   node scripts/bedslot-check.js            seconds, Node only
 *   node scripts/bedslot-check.js --shell    and the page, a few minutes
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
import { threePosToSim } from '../src/render/frame.js';
import { sincos } from '../src/props/trig.js';
import {
  heldStill, makeStillMeter, stillMeterStep, STILL_WINDOW_MS, STUCK_SPEED, STUCK_RATE, DULL_OUT_MIN, CRAFT_WORLD_R,
} from '../src/game/collide.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const WASM = join(root, 'dist', 'sim.wasm');

/* stuckTick's clock in src/main.js, in sim ms, asked once a frame. */
const STUCK_MS = 1500;
const FRAME_MS = 16;
/* From the drop: it is in the slot inside half a second. */
const WATCH_MS = 6000;
const SETTLED_MS = 800;

/*
 * BEDROOM 4, as the page's colliders have it (__colliderBoxes on the house,
 * 2026-10-30), world metres: the back wall, the bed frame flush against it,
 * the mattress 3 cm in from the frame's edge (bed() in
 * src/maps/house/house.js), which is the slot, 10.5 cm wide in the world,
 * and the headboard. The upper floor is 10.5 m up, the frame's top 11.55,
 * the mattress's 12.425. Nothing else is within 0.8 m of the ticket's craft.
 */
const WALL_FACE = -49.7;
const MATTRESS_SIDE = -49.595;
const MATTRESS_TOP = 12.425;
const FLOOR = 10.5;
const LIP = 11.55;
const BOXES = [
  { kind: 'box', material: 'wall', x0: -56, y0: 9.1, z0: -50.4, x1: -7, y1: 13.3, z1: WALL_FACE },
  { kind: 'box', material: 'wall', x0: -30.59, y0: FLOOR, z0: WALL_FACE, x1: -23.59, y1: LIP, z1: -44.8 },
  {
    kind: 'box', material: 'wall', x0: -30.485, y0: LIP, z0: MATTRESS_SIDE, x1: -23.695, y1: MATTRESS_TOP, z1: -44.905,
  },
  { kind: 'box', material: 'wall', x0: -30.59, y0: FLOOR, z0: WALL_FACE, x1: -30.31, y1: 14.525, z1: -44.8 },
];
/* The house's spawn, which is the plant's frame: its yaw is a quarter turn. */
const SPAWN = V(-23.45, 0.524, -40.95);
const SPAWN_YAW = 1.5707966732051033;
/* The weight slider at 100 percent on the plant both aircraft fly. */
const GRAVITY = 1.62;

/* A quaternion about the plant's x axis: with the house's quarter turn that
 * stands the craft on its edge along the slot, tipped by deg - 90 past it. */
function edgewise(deg) {
  const h = sincos((deg * Math.PI) / 360);
  return [h.c, h.s, 0, 0];
}

/* Over the slot, where the ticket's craft was, and above the mattress. */
const DROP = { x: -28, y: 12.7, z: -49.645 };
/* A pilot trying to get out, a stick at a time, 0.3 s each, from 0.7 s. */
const WORKING = [[0, 0, 0, 0.6], [0.6, 0, 0, 0.6], [0, 0.6, 0, 0.6], [0, 0, 0.6, 0.6], [-0.6, -0.6, 0, 1]];
/*
 * HOW IT LANDS DEPENDS WHICH WAY IT LEANS, measured on this rig every 2.5
 * degrees from 60 to 120. Leaning on the mattress (under 90) it lies quiet
 * in the slot at up.y +0.01, no knock, and the old test always set that
 * down. Leaning on the wall, 90 to 102.5, it settles at up.y -0.17, the
 * ticket's pose, and rattles 140 to 190 times in five seconds; from 105 it
 * hangs on the slot's top edge at the mattress's height and rattles too.
 * `top` is that last one. The page lands the same drop a little differently
 * (its motors have spun for a quarter of a second in the bedroom first), so
 * the shell's cases are the ones measured there, in SHELL_CASES.
 */
const CASES = [
  { name: 'leaning on the wall, hands off', deg: 92.5, x: -28 },
  { name: 'leaning further, further along the bed, hands off', deg: 100, x: -25.5 },
  { name: 'leaning on the wall, a pilot working the sticks', deg: 97.5, x: -28, working: true },
  { name: 'hung on the top edge of the slot, hands off', deg: 110, x: -28, top: true },
];
const SHELL_CASES = [
  { name: 'tipped 7.5 degrees past its edge, hands off', deg: 97.5, x: -28 },
  { name: 'tipped 15 degrees past its edge, hands off', deg: 105, x: -28 },
  { name: 'tipped 7.5 degrees, further along the bed, hands off', deg: 97.5, x: -25.5 },
  { name: 'tipped 7.5 degrees, a pilot working the sticks', deg: 97.5, x: -28, working: true },
];

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

console.log('\nbedslot-check: a craft the knock rattles in a slot is still, and is set down\n');

/* ------------------------------------------------------------------ */
/* The meter, as numbers                                               */
/* ------------------------------------------------------------------ */

console.log(' the meter, as numbers');
{
  const m = makeStillMeter();
  stillMeterStep(m, 1000, 1, 2, 3, 1, 0, 0, 0);
  check('it says nothing before a window has passed, and nothing is not still',
    m.speed === Infinity && !heldStill(-0.13, m.speed, m.rate, true, false));
  stillMeterStep(m, 1000 + STILL_WINDOW_MS, 1, 2, 3, 1, 0, 0, 0);
  check('a craft that has not moved reads 0 m/s and 0 rad/s', m.speed === 0 && m.rate === 0);
  stillMeterStep(m, 1000 + STILL_WINDOW_MS + FRAME_MS, 1.5, 2, 3, 1, 0, 0, 0);
  check('inside the window it holds what the last window read', m.speed === 0);
}
{
  const m = makeStillMeter();
  for (let t = 0; t <= 400; t += FRAME_MS) {
    stillMeterStep(m, t, 2 * (t / 1000), 0, 0, 1, 0, 0, 0);
  }
  check('a craft moving at 2 m/s reads 2 m/s', Math.abs(m.speed - 2) < 1e-9, `${m.speed}`);
}
{
  const m = makeStillMeter();
  for (let t = 0; t <= 400; t += FRAME_MS) {
    const h = sincos(t / 1000 / 2);
    stillMeterStep(m, t, 0, 0, 0, h.c, 0, 0, h.s);
  }
  check('a craft turning at 1 rad/s reads it within a tenth of a percent', Math.abs(m.rate - 1) < 1e-3, `${m.rate}`);
}
{
  const m = makeStillMeter();
  stillMeterStep(m, 5000, 0, 0, 0, 1, 0, 0, 0);
  stillMeterStep(m, 5000 + STILL_WINDOW_MS, 0, 0, 0, 1, 0, 0, 0);
  stillMeterStep(m, 0, 0, 0, 0, 1, 0, 0, 0);
  check('a clock that goes back, a set down or a reset, starts it over', m.speed === Infinity);
}
{
  /* The rattle as the page recorded it: knocked from face to face 5 mm
   * apart, a frame each way, at the knock's own speed, and the attitude
   * rocking by 0.007 of up a frame. */
  const m = makeStillMeter();
  let longest = 0;
  let run = 0;
  for (let t = 0; t <= 3000; t += FRAME_MS) {
    const k = (t / FRAME_MS) % 2;
    const h = sincos(-1.7 / 2 + k * 0.0035);
    stillMeterStep(m, t, 0, 0, k * 0.005, h.c, h.s, 0, 0);
    run = heldStill(-0.13, m.speed, m.rate, true, false) ? run + FRAME_MS : 0;
    longest = Math.max(longest, run);
  }
  check('a craft rattling between two faces 5 mm apart reads still',
    m.speed < STUCK_SPEED && m.rate < STUCK_RATE && longest >= STUCK_MS,
    `${m.speed.toFixed(3)} m/s, ${m.rate.toFixed(3)} rad/s, held ${longest} ms`);
  console.log(`  note  the knock leaves a craft at DULL_OUT_MIN, ${DULL_OUT_MIN} m/s, and STUCK_SPEED is ${STUCK_SPEED}:`
    + ' read off the plant, a knocked frame is never a still one');
}

if (!existsSync(WASM)) {
  console.log('\n  SKIP  dist/sim.wasm is not built, so nothing was flown');
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/* The wedge, through the real plant with the shell's knock            */
/* ------------------------------------------------------------------ */

const wasmBytes = readFileSync(WASM);
const diffText = readFileSync(join(root, 'configs', 'betaflight-default.diff'), 'utf8');
const world = buildWorld(BOXES, deriveObstacles, LIP);

/* Where the rig's frame puts a world point in the plant: its worldPosToSim,
 * spawn yaw, axes and spawn altitude (0.045 there). */
function toPlant(x, y, z) {
  const t = sincos(-SPAWN_YAW);
  const dx = x - SPAWN.x;
  const dz = z - SPAWN.z;
  const o = threePosToSim(t.c * dx + t.s * dz, y - SPAWN.y, -t.s * dx + t.c * dz, { x: 0, y: 0, z: 0 });
  o.z -= 0.045;
  return o;
}

/*
 * Drop it, and watch it a frame at a time as stuckTick would: the old test
 * on the plant's own speed and rate, the new on the meter's, the pose and
 * the solid beside it the same for both. The ground plane is the frame's
 * top, which is the surface the shell raises under a craft over the slot.
 */
async function drop(c, bounce) {
  const rig = await makeRig({
    wasmBytes, diffText, colliders: world.colliders, field: world.field,
    spawn: SPAWN, spawnYaw: SPAWN_YAW, groundY: LIP, cell: 4.2, bounce,
  });
  rig.sim.e.sim_set_gravity(GRAVITY);
  rig.hold(50, 0, 0, 0, 0);
  const p = toPlant(c.x, DROP.y, DROP.z);
  rig.sim.e.sim_set_pose(p.x, p.y, p.z, ...edgewise(c.deg));
  rig.sim.e.sim_rest();
  const meter = makeStillMeter();
  const run = { old: 0, now: 0, oldMax: 0, nowMax: 0 };
  let settled = null;
  let worstMove = 0;
  let knocksFrom = 0;
  let stayed = true;
  for (let ms = FRAME_MS; ms <= WATCH_MS; ms += FRAME_MS) {
    const s = c.working && ms > 700 ? WORKING[Math.floor((ms - 700) / 300) % WORKING.length] : [0, 0, 0, 0];
    rig.hold(FRAME_MS, ...s);
    const st = rig.state();
    const k = rig.craft();
    stillMeterStep(meter, rig.simMs(), st[1], st[2], st[3], st[7], st[8], st[9], st[10]);
    const beside = world.colliders.gapAt(k.p.x, k.p.y, k.p.z, CRAFT_WORLD_R) < CRAFT_WORLD_R;
    const speed = Math.hypot(st[4], st[5], st[6]);
    const rate = Math.hypot(st[11], st[12], st[13]);
    run.old = heldStill(k.upZ, speed, rate, beside, false) ? run.old + FRAME_MS : 0;
    run.now = heldStill(k.upZ, meter.speed, meter.rate, beside, false) ? run.now + FRAME_MS : 0;
    run.oldMax = Math.max(run.oldMax, run.old);
    run.nowMax = Math.max(run.nowMax, run.now);
    if (ms === SETTLED_MS) {
      settled = k.p;
      knocksFrom = rig.stats.knocks;
    } else if (settled) {
      worstMove = Math.max(worstMove, Math.hypot(k.p.x - settled.x, k.p.y - settled.y, k.p.z - settled.z));
    }
    if (ms >= SETTLED_MS && !(k.p.z > WALL_FACE && k.p.z < MATTRESS_SIDE)) {
      stayed = false;
    }
  }
  const k = rig.craft();
  return {
    run, p: k.p, upY: k.up.y, worstMove, stayed, knocks: rig.stats.knocks - knocksFrom,
  };
}

for (const c of CASES) {
  console.log(`\n through the plant, ${c.name}`);
  const w = await drop(c, true);
  check(c.top ? 'it drops onto the slot and hangs on its top edge' : 'it drops into the slot and wedges there on its side',
    w.p.z > WALL_FACE && w.p.z < MATTRESS_SIDE && Math.abs(w.upY) < 0.5
      && (c.top ? w.p.y >= MATTRESS_TOP : w.p.y < MATTRESS_TOP),
    `at ${w.p.x.toFixed(3)} ${w.p.y.toFixed(3)} ${w.p.z.toFixed(3)}, up.y ${w.upY.toFixed(3)}`);
  check('and stays between the wall and the mattress from then on', w.stayed,
    `at most ${(w.worstMove * 1000).toFixed(1)} mm from where it was at ${SETTLED_MS} ms`);
  check('while the knock rattles it between the faces', w.knocks > 50, `${w.knocks} knocks after ${SETTLED_MS} ms`);
  check("the plant's own speed and rate never held stuckTick's test for STUCK_MS, which is the ticket",
    w.run.oldMax < STUCK_MS, `longest ${w.run.oldMax} ms`);
  check("the meter's hold it for STUCK_MS, so stuckTick sets it down",
    w.run.nowMax >= STUCK_MS, `longest ${w.run.nowMax} ms of ${WATCH_MS}`);
}

/* Measured, not counted: the same drop with no knock rests still by the
 * plant's own numbers, which is why no rig check saw this before. */
{
  const w = await drop(CASES[0], false);
  console.log(`\n  note  without the knock the first case rests at up.y ${w.upY.toFixed(3)} and the plant's own`
    + ` speed and rate hold the test for ${w.run.oldMax} ms`);
}

/* ------------------------------------------------------------------ */
/* The same in the shell                                                */
/* ------------------------------------------------------------------ */

async function shell() {
  const { openPage, answerQuadPicker } = await import('../tests/lib/page.js');
  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
  const page = await openPage({ root, width: 400, height: 260, url: '/index.html?map=house&craft=whoop65&fly=1' });
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
  const until = async (expr, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await ev(expr)) {
        return true;
      }
      await sleep(250);
    }
    return false;
  };
  try {
    const ready = await until('return !!window.__shellReady', 120000)
      && await until("const m = window.__map ? window.__map() : null; return Boolean(m && m.ready && m.id === 'house');", 150000);
    check('the house loads on the whoop', ready);
    if (!ready) {
      return;
    }
    await answerQuadPicker(page, 60000).catch(() => {});
    check('and flies', await until("return window.__ui.screen === 'flight'", 20000));
    await ev('window.__drawOff(true); return 1;');
    for (const c of SHELL_CASES) {
      console.log(`\n in the shell, ${c.name}`);
      /* eslint-disable no-await-in-loop */
      const rows = await ev(`
        const sm = window.__simModule();
        window.__placeCraft(${c.x}, ${DROP.y}, ${DROP.z});
        const at = Array.from(sm.readState().state.slice(1, 4));
        window.__placeCraft(${c.x}, 14.5, -47);
        await new Promise((r) => { setTimeout(r, 250); });
        sm.e.sim_set_pose(at[0], at[1], at[2], ${edgewise(c.deg).join(', ')});
        sm.e.sim_rest();
        const plan = ${JSON.stringify(WORKING)};
        const rows = [];
        await new Promise((res) => {
          const t0 = performance.now();
          const tick = () => {
            const t = performance.now() - t0;
            const k = window.__craftState();
            rows.push({
              ms: window.__stickPath().moduleMs, x: k.worldX, y: k.worldY, z: k.worldZ, upY: k.up ? k.up.y : 1,
              landed: k.landed, banner: k.banner,
              /* Infinity does not survive JSON, and null would read as 0. */
              held: [k.held.speed, k.held.rate].map((v) => (Number.isFinite(v) ? v : 1e9)),
              gap: window.__nearSolid(k.worldX, k.worldY, k.worldZ, 1) ?? 9,
            });
            window.__stick(...(${Boolean(c.working)} && t > 700 ? plan[Math.floor((t - 700) / 300) % plan.length] : [0, 0, 0, 0]));
            if (t >= ${WATCH_MS}) { res(); return; }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        window.__stick();
        return rows;`);
      /* A step backwards in the module's clock is a set down. */
      let wedged = null;
      let down = null;
      let held = 0;
      let longest = 0;
      for (let i = 1; i < rows.length && !down; i += 1) {
        const r = rows[i];
        const d = r.ms - rows[i - 1].ms;
        if (d < 0) {
          down = r;
          break;
        }
        const test = !r.landed && heldStill(r.upY, r.held[0], r.held[1], r.gap < CRAFT_WORLD_R, false);
        held = test ? held + d : 0;
        longest = Math.max(longest, held);
        if (!wedged && test && r.z > WALL_FACE && r.z < MATTRESS_SIDE && r.y < MATTRESS_TOP) {
          wedged = r;
        }
      }
      check('it comes to rest wedged in the slot', Boolean(wedged),
        wedged ? `at ${wedged.x.toFixed(2)} ${wedged.y.toFixed(2)} ${wedged.z.toFixed(3)}, up.y ${wedged.upY.toFixed(2)}` : 'never');
      check('and is set down within 1.5 s and half a second of frames, "Stuck" on screen',
        Boolean(down) && longest <= STUCK_MS + 500 && rows.some((r) => /^Stuck/.test(r.banner || '')),
        down ? `held ${longest} ms in stuckTick's test` : `never, in ${WATCH_MS / 1000} s; longest ${longest} ms`);
      /* The picture is a frame behind the clock, so where it was put is read
       * a few frames on. */
      const after = down ? rows[Math.min(rows.length - 1, rows.indexOf(down) + 4)] : null;
      check('in the bedroom, on the near side of the wall', Boolean(after) && after.z > WALL_FACE && after.y > FLOOR,
        after ? `at ${after.x.toFixed(2)} ${after.y.toFixed(2)} ${after.z.toFixed(2)}` : 'not set down');
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
