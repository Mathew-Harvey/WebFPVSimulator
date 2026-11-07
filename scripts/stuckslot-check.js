/*
 * stuckslot-check.js: a craft knocked in place is still stuck, and is set
 * down.
 *
 * THE BUG. Found on the bug board run of 2026-11-07 while chasing
 * bug-20d37c64 ("the screen is stopped, I only hear it moving"), in
 * crash-check's own head on hit at 10 m/s with the throttle cut, about one
 * run in two: the craft drops off the town's shopfront (face at x = 5.6) into
 * the 10 cm slot between it and the wooden fence in front of it (back face at
 * x = 5.5, top 1.518 m) and lies there on its side for good. Its position did
 * not change by a millimetre in seven seconds; the bounce counter, which is
 * the impact sound, ran on; nothing set it down.
 *
 * THE CAUSE. A knock (CrashJudge.knock) puts a craft off the face it touches
 * at DULL_OUT_MIN, 0.3 m/s, and stuckTick counted a frame still only under
 * STUCK_SPEED, also 0.3 m/s. In the slot the knocks never stop, so the 1.5 s
 * clock restarted on every one: every few hundred milliseconds lying on its
 * side, and on every single frame stood on edge across the slot.
 * stuckClockStep in src/game/collide.js now asks whether the craft moved, not
 * whether the frame was quiet. See its comment.
 *
 * WHAT IS ASSERTED.
 *   THE RULE, in Node, deterministic: the two traces the shell recorded
 *   (a knock every few hundred milliseconds with jitter between, and a knock
 *   on every frame), each held for STUCK_MS and set down, where the old test
 *   never got past one frame; and what must stay free: an upright craft, a
 *   tumble, a slide past the mark, a crash flip that turns it over, a craft
 *   in flight leaving the mark, and a quiet still craft exactly as before.
 *   THE SHELL, with --shell: the town on Low, the craft put in the slot in
 *   four poses (on its side either way, on edge across it either way) with
 *   the throttle cut. Each must start in the slot, not upright, and be set
 *   down, "Stuck" on screen, inside STUCK_MS and two seconds of frames. On
 *   the shell before the fix two of the four buzzed there for good.
 *
 * Usage:
 *   node scripts/stuckslot-check.js            the rule, Node only, instant
 *   node scripts/stuckslot-check.js --shell    and the page, about a minute
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  heldStill, stuckClockStep, STUCK_SPEED, STUCK_RATE, DULL_OUT_MIN, STUCK_DRIFT_M,
} from '../src/game/collide.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* stuckTick's clock in src/main.js, asked once a frame. */
const STUCK_MS = 1500;
const FRAME_MS = 16;

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

/*
 * A trace through both clocks, a frame at a time, the way stuckTick asks:
 * the old one (heldStill with the frame's own speed and spin, restarted by
 * any frame that was not still) and the new one. Each sample is
 * { x, y, z, upz, speed, rate, beside }. Returns the longest run of each in
 * ms, which is what stuckTick compares with STUCK_MS.
 */
function runClocks(samples) {
  let old = -1;
  let oldMax = 0;
  const c = { since: -1, x: 0, y: 0, z: 0, upz: 1 };
  let nowMax = 0;
  samples.forEach((s, i) => {
    const t = i * FRAME_MS;
    if (heldStill(s.upz, s.speed, s.rate, s.beside, false)) {
      old = old < 0 ? t : old;
      oldMax = Math.max(oldMax, t - old);
    } else {
      old = -1;
    }
    const quiet = s.speed < STUCK_SPEED && s.rate < STUCK_RATE;
    const posed = heldStill(s.upz, 0, 0, s.beside, false);
    if (stuckClockStep(c, t, s.x, s.y, s.z, s.upz, posed, quiet)) {
      nowMax = Math.max(nowMax, t - c.since);
    }
  });
  return { oldMax, nowMax };
}

const frames = (ms, fn) => Array.from({ length: Math.round(ms / FRAME_MS) }, (_, i) => fn(i));

console.log('\nstuckslot-check: a craft knocked in place is still stuck, and is set down\n');
console.log(' the rule, as numbers');
check('a knock leaves a face at exactly the stuck test\'s speed limit, which is the bug\'s whole cause',
  DULL_OUT_MIN === STUCK_SPEED, `DULL_OUT_MIN ${DULL_OUT_MIN}, STUCK_SPEED ${STUCK_SPEED}`);

/* The shell's trace on its side in the slot (2026-11-07, frame by frame):
 * 0.025 m/s and 0.3 to 1.6 rad/s of jitter, a knock at 0.300 m/s and no spin
 * every 27 frames or so, a spin spike over 1.5 rad/s now and then, and the
 * position the same to the millimetre. */
const onSide = frames(6000, (i) => ({
  x: 5.547, y: 0.129 + (i % 7) * 0.0002, z: 29.434, upz: -0.135 + ((i % 5) - 2) * 0.003,
  speed: i % 27 === 0 ? 0.3 : 0.025, rate: i % 27 === 0 ? 0 : (i % 11 === 0 ? 1.75 : 0.8), beside: true,
}));
let r = runClocks(onSide);
check('on its side, knocked every few hundred ms: the old clock never reached STUCK_MS',
  r.oldMax < STUCK_MS, `longest ${r.oldMax} ms`);
check('and the new one does, so stuckTick sets it down', r.nowMax >= STUCK_MS, `longest ${r.nowMax} ms`);

/* On edge across the slot: a knock on every frame. */
const onEdge = frames(6000, () => ({ x: 5.552, y: 0.104, z: 29.399, upz: -0.126, speed: 0.3, rate: 0, beside: true }));
r = runClocks(onEdge);
check('on edge, knocked on every frame: the old clock never started', r.oldMax === 0, `longest ${r.oldMax} ms`);
check('and the new one starts on the first frame and runs to STUCK_MS', r.nowMax >= STUCK_MS, `longest ${r.nowMax} ms`);

/* Wedged leaning on a wall, 52 degrees over, knocked every frame: the band
 * wallpin-check's ticket was in, where heldStill reads the solid. */
const wedgeKnocked = frames(4000, () => ({ x: 29.9, y: 0.1, z: 0, upz: 0.62, speed: 0.3, rate: 0, beside: true }));
check('wedged 52 degrees over against a wall and knocked every frame: set down',
  runClocks(wedgeKnocked).nowMax >= STUCK_MS);

console.log('\n what must stay free');
const upright = frames(4000, () => ({ x: 0, y: 0.04, z: 0, upz: 0.99, speed: 0.3, rate: 0, beside: true }));
check('an upright craft pressed to a wall, knocked every frame, is not stuck', runClocks(upright).nowMax === 0);
const quietStill = frames(4000, () => ({ x: 1, y: 0.1, z: 1, upz: -0.9, speed: 0, rate: 0, beside: false }));
r = runClocks(quietStill);
check('a quiet craft on its back counts exactly as it did', r.nowMax === r.oldMax && r.nowMax >= STUCK_MS,
  `old ${r.oldMax} ms, new ${r.nowMax} ms`);
/* A tumble across the ground: 4 m/s, past 60 degrees, never still. */
const tumble = frames(4000, (i) => ({
  x: i * 0.064, y: 0.15, z: 0, upz: Math.cos(i * 0.4), speed: 4, rate: 12, beside: false,
}));
check('a tumble along the ground is never stuck', runClocks(tumble).nowMax < 2 * FRAME_MS);
/* Knocked along a wall: a knock a frame, but carried 6 mm a frame along it. */
const scraping = frames(4000, (i) => ({ x: 29.9, y: 0.1, z: i * 0.006, upz: -0.1, speed: 0.36, rate: 0, beside: true }));
r = runClocks(scraping);
check(`a craft knocked along a wall, leaving the mark by ${STUCK_DRIFT_M} m, keeps restarting the clock`,
  r.nowMax < STUCK_MS, `longest ${r.nowMax} ms`);
/* A crash flip that rolls it over where it lies: from flat on its back to
 * upright in a second, spinning at 3 rad/s, not going anywhere. */
const flip = frames(1000, (i) => ({
  x: 3, y: 0.05, z: 3, upz: -Math.cos((Math.PI * i) / 62), speed: 0.1, rate: 3, beside: false,
}));
r = runClocks(flip);
check('a crash flip rolling it over in place restarts the clock as it turns', r.nowMax < 300,
  `longest ${r.nowMax} ms`);
/* A craft falling inverted from a hang: still for a frame, then gone. */
const hang = frames(1500, (i) => {
  const t = (i * FRAME_MS) / 1000;
  return { x: 0, y: 5 - 4.9 * t * t, z: 0, upz: -1, speed: 9.8 * t, rate: 0.2, beside: false };
});
check('inverted at the top of a hang and falling is never stuck', runClocks(hang).nowMax < 8 * FRAME_MS,
  `longest ${runClocks(hang).nowMax} ms`);

async function shell() {
  const { openPage } = await import('../tests/lib/page.js');
  const sleep = (ms) => new Promise((res) => { setTimeout(res, ms); });
  const page = await openPage({ root, width: 400, height: 260, url: '/index.html' });
  const ev = async (expr) => {
    const res = await page.cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true,
    }, page.sessionId);
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 900));
    }
    return res.result.value;
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
    await ev('window.__drawOff(true); return 1;');
    const slot = await ev(`const b = window.__colliderBoxes(5.4, 29.4, 1.5);
      const fence = b.find((x) => Math.abs(x[3] - 5.5) < 0.02 && Math.abs(x[4] - 1.518) < 0.02);
      const shop = window.__colliderBoxes(7, 29.4, 4).find((x) => Math.abs(x[0] - 5.6) < 0.02 && x[2] <= 29.4 && x[5] >= 29.4);
      return { fence: Boolean(fence), shop: Boolean(shop) };`);
    check('the slot is where this check expects it: the fence\'s back at x 5.5, the shopfront at 5.6',
      slot.fence && slot.shop, JSON.stringify(slot));
    /* On its side (a roll), on edge across the slot (a pitch), either way. */
    for (const [axis, deg, what] of [['x', 97, 'on its side'], ['x', -97, 'on its other side'],
      ['y', 97, 'on edge across it'], ['y', -97, 'on its other edge']]) {
      console.log(`\n in the shell: ${what} in the slot, throttle cut`);
      /* eslint-disable no-await-in-loop */
      const res = await ev(`
        window.__placeCraft(5.55, 0.35, 29.4);
        const sim = window.__simModule();
        const st = sim.readState().state;
        const h = (${deg} * Math.PI) / 360;
        const q = ${JSON.stringify(axis)} === 'x' ? [Math.cos(h), Math.sin(h), 0, 0] : [Math.cos(h), 0, Math.sin(h), 0];
        sim.e.sim_set_pose(st[1], st[2], st[3], q[0], q[1], q[2], q[3]);
        sim.rest();
        const rows = [];
        await new Promise((done) => {
          const t0 = performance.now();
          const tick = () => {
            window.__stick(0, 0, 0, 0);
            const c = window.__craftState();
            rows.push({ ms: window.__stickPath().moduleMs, x: c.worldX, upY: c.up ? c.up.y : 1, landed: c.landed,
              stuck: /^Stuck/.test(c.banner || '') });
            if (performance.now() - t0 >= 7000) { done(); return; }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        return rows;`);
      /* The first half second: in the slot and not upright, or the case is
       * not the one this check is about. */
      const t0 = res[0].ms;
      const early = res.filter((x) => x.ms - t0 >= 200 && x.ms - t0 <= 500);
      const inSlot = early.length > 0 && early.every((x) => x.x > 5.5 && x.x < 5.6 && x.upY < 0.5 && !x.landed);
      check('it starts in the slot, not upright', inSlot,
        early.length ? `x ${early[0].x.toFixed(3)}, up.y ${early[0].upY.toFixed(3)}` : 'no frames');
      /* A step backwards in the module's clock is a set down, as
       * crash-check reads it; the notice is stuckTick's. */
      let downAt = -1;
      for (let i = 1; i < res.length && downAt < 0; i += 1) {
        if (res[i].ms < res[i - 1].ms || res[i].stuck) {
          downAt = res[i - 1].ms - t0;
        }
      }
      const said = res.some((x) => x.stuck);
      check('and is set down, "Stuck" on screen, inside STUCK_MS and two seconds',
        downAt >= 0 && downAt <= STUCK_MS + 2000 && said,
        downAt >= 0 ? `after ${downAt} ms of sim time${said ? ', "Stuck" shown' : ''}` : 'never, in seven seconds');
    }
  } catch (e) {
    check('the shell run completes', false, e.message);
  } finally {
    await page.close();
  }
}

if (process.argv.includes('--shell')) {
  await shell();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
