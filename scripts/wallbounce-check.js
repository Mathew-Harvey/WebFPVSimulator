/*
 * wallbounce-check.js: a craft held against a wall is one bounce on the
 * OSD, not one every few hundred milliseconds.
 *
 * THE BUG. bug-3c840d7f, the bug board, 2026-11-23, the whoop on the town:
 * "when i crashed in the wall my bounces went higher if i stayed on the
 * surface", expected "if i land on the wall the bounces should go up by 1".
 * The OSD's "N bounces" row counted a solid's bounce on any frame whose
 * contact pass had applied an impulse, behind a cooldown of
 * BOUNCE_COOLDOWN_MS on the WALL clock. A craft held on a face takes an
 * impulse every few milliseconds for as long as it is there (the knock buzz),
 * so the count climbed about five times a second: on the base, one slow
 * arrival on the shopfront held three seconds read 24. The ground's half of
 * the same row was already judged per step on the sim clock by CrashJudge,
 * on GRAZE_SPEED_MAX, with a slide one bounce.
 *
 * THE FIX. CrashJudge judges a solid's bounce too (A SOLID'S BOUNCE in
 * src/game/collide.js): a step whose world report closes on a face at
 * GRAZE_SPEED_MAX or more, BOUNCE_COOLDOWN_MS of sim clock after the last one
 * counted. The shell counts crashJudge.solidHit; the impact cue, the sound
 * and the shake, keeps its own gate and is unchanged.
 *
 * WHAT IS ASSERTED.
 *   THE RULE, in Node, deterministic, at frame pacings of 1, 7, 16, 33 and
 *   100 ms: one smack held on the face for three seconds of knock buzz is
 *   one bounce; two smacks half a second apart are two; a second smack
 *   inside the cooldown is the same one; a Wall Tap under the line is none,
 *   and the line is GRAZE_SPEED_MAX exactly; forget() and a clock that went
 *   backwards end the cooldown.
 *   THE SHELL, with --shell: the whoop on the town on Low, flown at the
 *   shopfront at a smack's speed, nose down into it with the throttle in, so
 *   it stays on the face for two seconds of sim time, under its roof and
 *   without reaching the street. It must arrive at a smack, come back to
 *   the face at a walking pace while it is held there, and the OSD's count
 *   must go up by exactly one. Then the same craft put at rest in the slot
 *   between the shopfront and the fence (stuckslot-check's pose, on its
 *   side, throttle cut), read once the ground has judged its drop onto the
 *   street, where it lies on the faces until it is set down: no bounce at
 *   all, because nothing hit anything. On the base the held smack read 14
 *   to 17 and the slot 6 or 7.
 *
 * Usage:
 *   node scripts/wallbounce-check.js            the rule, Node only, instant
 *   node scripts/wallbounce-check.js --shell    and the page, about a minute
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
  CrashJudge, GRAZE_SPEED_MAX, BOUNCE_COOLDOWN_MS, DULL_OUT_MIN, DULL_OUT_MAX,
} from '../src/game/collide.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* stuckTick's clock in src/main.js. */
const STUCK_MS = 1500;

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
 * THE RULE. A trace is a list of steps, one per sim millisecond, each the
 * world report's closing speed for that step or 0 for no solid contact. The
 * craft is level, in the air (no ground contact) and moving at `speed`, so
 * the judge's ground and STOP rules have nothing to say and only the solid
 * one is asked. Run through CrashJudge a frame at a time, beginFrame() and
 * then the frame's steps, the way src/main.js runs it, and counted the way
 * the shell counts: one bounce for a frame whose solidHit is set.
 */
function state(speed) {
  const s = new Float64Array(19);
  s[4] = speed;
  s[7] = 1;
  return s;
}
function report(closing) {
  const r = new Float64Array(11);
  if (closing > 0) {
    r[0] = 1;
    r[1] = closing;
    r[3] = 0;
    /* A wall: its normal is level and points back at the craft. */
    r[4] = -1;
    r[8] = 1;
  } else {
    r[3] = -1;
  }
  return r;
}
function countBounces(trace, frameMs, { startMs = 1, speed = 2, between = null } = {}) {
  const judge = new CrashJudge();
  const st = state(speed);
  let n = 0;
  const at = [];
  for (let f = 0; f < trace.length; f += frameMs) {
    judge.beginFrame();
    for (let i = f; i < f + frameMs && i < trace.length; i += 1) {
      if (between && between[i]) {
        between[i](judge);
      }
      const ms = typeof startMs === 'function' ? startMs(i) : startMs + i;
      judge.step(st, st, 0, report(trace[i]), ms, false);
    }
    if (judge.solidHit) {
      n += 1;
      at.push(judge.solidHitAtMs);
    }
  }
  return { n, at };
}
const PACINGS = [1, 7, 16, 33, 100];
function atEveryPacing(name, trace, want, opts) {
  const got = PACINGS.map((p) => countBounces(trace, p, opts).n);
  check(`${name}, at every pacing`, got.every((g) => g === want),
    `${got.map((g, i) => `${PACINGS[i]} ms ${g}`).join(', ')}, want ${want}`);
}

/* The knock buzz: a craft held on a face is put off it at a walking pace and
 * its thrust brings it back, a contact every few milliseconds at between
 * DULL_OUT_MIN and DULL_OUT_MAX plus what a few milliseconds of thrust adds.
 * Seeded, so the trace is the same on every run. */
function buzz(trace, fromMs, toMs) {
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let t = fromMs; t < toMs; t += 2 + Math.floor(rnd() * 30)) {
    trace[t] = DULL_OUT_MIN + rnd() * (DULL_OUT_MAX - DULL_OUT_MIN + 0.6);
  }
  return trace;
}

console.log('\n the rule, CrashJudge in Node');
const SMACK = 7.5;
{
  const t = new Array(3500).fill(0);
  t[200] = SMACK;
  buzz(t, 202, 3200);
  check('the buzz never reaches the line, or this trace is not a held craft',
    t.every((c) => c < GRAZE_SPEED_MAX || c === SMACK), `max ${Math.max(...t.filter((c) => c !== SMACK)).toFixed(2)} m/s`);
  check('and it is a contact on most of its frames (one at least every 32 ms)',
    (() => {
      let last = 200;
      for (let i = 201; i < 3200; i += 1) {
        if (t[i] > 0) {
          if (i - last > 32) {
            return false;
          }
          last = i;
        }
      }
      return true;
    })());
  atEveryPacing('a smack held on the face for three seconds is one bounce', t, 1);
  const first = countBounces(t, 16).at[0];
  check('counted on the step it smacked, not on a frame boundary', first === 201, `at ${first} ms`);
}
{
  const t = new Array(1500).fill(0);
  t[100] = SMACK;
  buzz(t, 102, 300);
  t[700] = SMACK;
  buzz(t, 702, 900);
  atEveryPacing('two smacks half a second apart are two bounces', t, 2);
}
{
  const t = new Array(1000).fill(0);
  t[100] = SMACK;
  t[100 + BOUNCE_COOLDOWN_MS - 20] = SMACK * 1.5;
  atEveryPacing('a second smack inside the cooldown is the same bounce (a corner, the next face)', t, 1);
  const u = new Array(1000).fill(0);
  u[100] = SMACK;
  u[100 + BOUNCE_COOLDOWN_MS + 1] = SMACK;
  atEveryPacing('and one just past it is a second', u, 2);
}
{
  const t = new Array(1500).fill(0);
  t[100] = 2.0;
  buzz(t, 102, 1400);
  atEveryPacing('a Wall Tap under the line, held, is no bounce', t, 0);
  const at = new Array(400).fill(0);
  at[100] = GRAZE_SPEED_MAX;
  atEveryPacing('a smack at GRAZE_SPEED_MAX is a bounce', at, 1);
  const under = new Array(400).fill(0);
  under[100] = GRAZE_SPEED_MAX - 0.01;
  atEveryPacing('and one a centimetre a second under it is not', under, 0);
}
{
  const t = new Array(400).fill(0);
  t[100] = SMACK;
  t[150] = SMACK;
  const between = [];
  between[150] = (judge) => judge.forget();
  const r = countBounces(t, 1, { between });
  check('forget() (a set down or a restart) ends the cooldown', r.n === 2, `${r.n}`);
  /* The clock going back to 1 at step 150, as a restart the shell did not
   * tell forget() about. */
  const r2 = countBounces(t, 1, { startMs: (i) => (i < 150 ? 1000 + i : i - 149) });
  check('and so does a clock that went backwards', r2.n === 2, `${r2.n}`);
}

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
    /* The ticket's airframe and map. */
    await ev("const ui = window.__ui; ui.settings.airframe = 'whoop65'; ui.settings.map = 'city'; ui.settings.graphics = 'low'; ui.onAction('fly', ui.settings); return 1;");
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
    const where = await ev(`const shop = window.__colliderBoxes(7, 29.4, 4).find((x) => Math.abs(x[0] - 5.6) < 0.02 && x[2] <= 29.6 && x[5] >= 29.6);
      const c = window.__craft();
      return { shop: shop || null, run: c.run };`);
    check('the shopfront is where this check expects it: a face at x 5.6 across z 29.6, its roof over 6 m',
      Boolean(where.shop && where.shop[4] > 6), JSON.stringify(where.shop));
    check('and the craft is the ticket\'s whoop', where.run === 'whoop65', where.run);

    console.log('\n in the shell: a smack into the shopfront, held on it with the throttle in');
    const held = await ev(`
      const sim = window.__simModule();
      /* World +x in the plant's frame: two places a metre apart. */
      window.__placeCraft(4.2, 4.2, 29.6);
      const a = sim.readState().state;
      window.__placeCraft(5.2, 4.2, 29.6);
      const b = sim.readState().state;
      const dir = [b[1] - a[1], b[2] - a[2], b[3] - a[3]];
      window.__placeCraft(4.2, 4.2, 29.6);
      let st = sim.readState().state;
      /* The yaw that points the nose at the face, then 25 degrees nose down
       * (a rotation about the plant's body y, as __holdCraft's). */
      const yaw = Math.atan2(dir[1], dir[0]);
      const y = yaw / 2;
      const p = (25 * Math.PI) / 360;
      const q = [Math.cos(y) * Math.cos(p), -Math.sin(y) * Math.sin(p), Math.cos(y) * Math.sin(p), Math.sin(y) * Math.cos(p)];
      sim.e.sim_set_pose(st[1], st[2], st[3], q[0], q[1], q[2], q[3]);
      sim.rest();
      st = sim.readState().state;
      /* Thrown at the face at a smack's speed: a pure linear impulse against
       * a surface moving at the wanted velocity, as putDullBounce writes one. */
      const V = 7;
      sim.e.sim_contact_at(dir[0], dir[1], dir[2], 0, 0, st[1], st[2], st[3], V * dir[0], V * dir[1], V * dir[2], 0, 0, 0);
      const b0 = window.__contacts().bounces;
      const s0 = window.__contacts().steps;
      const dirLen = Math.hypot(dir[0], dir[1], dir[2]);
      const rows = [];
      let touchMs = -1;
      await new Promise((done) => {
        const t0 = performance.now();
        const tick = () => {
          window.__stick(0, 0, 0, 0.52);
          const c = window.__craftState();
          const k = window.__contacts();
          const g = window.__ground();
          const ms = window.__stickPath().moduleMs;
          if (touchMs < 0 && k.steps > s0) {
            touchMs = ms;
          }
          /* The plant's own speed toward the face, in the plant's metres,
           * which GRAZE_SPEED_MAX is in: the world's are the plant's over
           * WORLD_SCALE, and a whoop's town is scaled. */
          const ps = sim.readState().state;
          const into = (ps[4] * dir[0] + ps[5] * dir[1] + ps[6] * dir[2]) / dirLen;
          rows.push({ ms, x: c.worldX, y: c.worldY, into, b: k.bounces - b0, steps: k.steps, ground: g.hits,
            above: g.above, closing: touchMs >= 0 ? c.lastClosingSpeed : 0 });
          if ((touchMs >= 0 && ms - touchMs >= 2000) || performance.now() - t0 > 30000) { done(); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      window.__stick(0, 0, 0, 0);
      return { touchMs, rows };`);
    const hr = held.rows;
    check('it reaches the face', held.touchMs >= 0);
    if (held.touchMs >= 0) {
      /* The arrival, as crash-check reads its approach: the craft's own
       * speed into the face, which looks down -x, on the last frame before
       * the touch, in the plant's metres. Not the report's closing speed as
       * the harness reads it, a frame at a time: a frame whose contact
       * steps all closed at 0 overwrites it, and it read as 0 on the touch's
       * frames in three runs of ten, on the base and with the fix, while
       * the judge, reading each step, counted the smack. */
      const after = hr.filter((r) => r.ms >= held.touchMs);
      const pre = hr.filter((r) => r.ms < held.touchMs).pop();
      const arrival = pre ? pre.into : 0;
      check('at a smack, GRAZE_SPEED_MAX or more into the face the frame before', arrival >= GRAZE_SPEED_MAX,
        `${arrival.toFixed(2)} m/s`);
      const onFace = after.filter((r) => r.x > 5.3);
      check('and stays on it, within 0.3 m of the face and under its roof, for the two seconds after',
        after.length > 4 && onFace.length === after.length && after.every((r) => r.y < where.shop[4]),
        `${onFace.length} of ${after.length} frames, x ${Math.min(...after.map((r) => r.x)).toFixed(3)} to ${Math.max(...after.map((r) => r.x)).toFixed(3)}, y ${Math.min(...after.map((r) => r.y)).toFixed(2)} to ${Math.max(...after.map((r) => r.y)).toFixed(2)}`);
      const late = after.filter((r) => r.ms >= held.touchMs + 1500);
      check('touching it all the way: contacts in its last second',
        late.length > 1 && late[late.length - 1].steps > late[0].steps,
        late.length ? `${late[late.length - 1].steps - late[0].steps} contact steps` : 'no frames');
      check('without reaching the street, so every bounce is the wall\'s',
        after.every((r) => !(r.ground > 0) && r.above > 0.3),
        `lowest ${Math.min(...after.map((r) => r.above)).toFixed(2)} m over the street`);
      /* lastClosingSpeed is the latest frame with a contact's and holds on
       * a frame without one, so a re-touch is read only on a frame whose
       * contact steps went up. */
      const again = after.filter((r, i) => i > 0 && r.ms > held.touchMs + BOUNCE_COOLDOWN_MS
        && r.steps > after[i - 1].steps).map((r) => r.closing);
      check('held there, it comes back to the face at a walking pace, never at a smack\'s',
        again.length > 4 && again.every((c) => c < GRAZE_SPEED_MAX),
        `fastest re-touch ${Math.max(0, ...again).toFixed(2)} m/s closing`);
      const end = hr[hr.length - 1].b;
      check('the OSD\'s bounce count goes up by exactly one', end === 1,
        `${end}, ${after.filter((r, i) => i > 0 && r.b > after[i - 1].b).map((r) => `+1 at ${r.ms - held.touchMs} ms`).slice(0, 8).join(', ')}`);
    }

    /* Put a few centimetres over the street, the craft first drops onto it,
     * touching a face or not on the way, and that drop is the ground's to
     * judge and is not what this asks about. So the count is read from
     * BOUNCE_COOLDOWN_MS and a little after its first touch of the street,
     * when it is lying in the slot. */
    console.log('\n in the shell: at rest in the slot between the shopfront and the fence, throttle cut');
    const slot = await ev(`
      window.__placeCraft(5.55, 0.35, 29.4);
      const sim = window.__simModule();
      const st = sim.readState().state;
      const h = (97 * Math.PI) / 360;
      sim.e.sim_set_pose(st[1], st[2], st[3], Math.cos(h), Math.sin(h), 0, 0);
      sim.rest();
      const b0 = window.__contacts().bounces;
      const s0 = window.__contacts().steps;
      const rows = [];
      await new Promise((done) => {
        const t0 = performance.now();
        const m0 = window.__stickPath().moduleMs;
        const tick = () => {
          window.__stick(0, 0, 0, 0);
          const c = window.__craftState();
          const k = window.__contacts();
          const ms = window.__stickPath().moduleMs;
          const stuck = /^Stuck/.test(c.banner || '');
          /* Up to the set down (a step back in the module's clock, or the
           * notice), which starts a new run. */
          if (ms < m0 || c.landed || stuck || ms - m0 >= 3000 || performance.now() - t0 > 30000) { done(); return; }
          rows.push({ ms, x: c.worldX, b: k.bounces - b0, steps: k.steps - s0, closing: c.lastClosingSpeed,
            ground: window.__ground().hits });
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return rows;`);
    const street = slot.findIndex((r) => r.ground > 0);
    const touch = street < 0 ? -1 : slot.findIndex((r) => r.ms >= slot[street].ms + BOUNCE_COOLDOWN_MS + 20);
    const lying = touch >= 0 ? slot.slice(touch) : [];
    const first = lying[0];
    const last = lying[lying.length - 1];
    check('it lies in the slot, touching a face, for most of a second before it is set down',
      lying.length > 2 && slot.every((r) => r.x > 5.45 && r.x < 5.65) && last.steps - first.steps > 300
        && last.ms - first.ms >= STUCK_MS / 2,
      lying.length ? `${last.steps - first.steps} contact steps over ${Math.round(last.ms - first.ms)} ms of sim time, from ${Math.round(first.ms - slot[0].ms)} ms` : 'it never lay in the slot');
    const touches = lying.filter((r, i) => i > 0 && r.steps > lying[i - 1].steps).map((r) => r.closing);
    check('touching it at a walking pace at the most, so nothing hit anything',
      touches.length > 2 && touches.every((c) => c < GRAZE_SPEED_MAX),
      touches.length ? `fastest ${Math.max(...touches).toFixed(2)} m/s closing` : '');
    /* From the frame before the first touch, so a bounce counted on the
     * touch's own frame is counted here. */
    const before = touch > 0 ? slot[touch - 1].b : 0;
    check('and the OSD counts no bounce off a face', lying.length > 2 && last.b - before === 0,
      lying.length ? `${last.b - before}` : '');
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
