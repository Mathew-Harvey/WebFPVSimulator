/*
 * stall-check.js: a smooth stick move with the page's main thread held in
 * the middle of it, and what the controller is handed. The owner's report of
 * 2026-10-21, "random occasional knocking or jumpy movements when under
 * throttle"; see THE STICK THROUGH A STALL in src/main.js.
 *
 * The real shell on the field, drawing off so a frame is cheap. The harness
 * stick is a function of the wall clock read at every poll, the way a radio's
 * gimbal is, so a stall really hides the move from the poller. Every RC frame
 * the module is handed is recorded by wrapping the module's sim_input at
 * instantiation, which reads it and changes nothing. Three pairs of flights,
 * a 300 ms eased roll and throttle move each, one with a 60 ms busy wait in
 * the middle and one without.
 *
 *   the largest step between two RC frames, with the stall, stays within
 *   twice the largest without it and under 0.06 of stick (the move's own
 *   steepest frame is 0.017; before the fix the stall's frame was 0.25)
 *
 * Usage: node scripts/stall-check.js
 * Exit code is the number of failed checks.
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
import { openPage } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Every RC frame the module is handed, while window.__rcLog.on. */
const SEED = `
(() => {
  const orig = WebAssembly.instantiate;
  WebAssembly.instantiate = async function (bytes, imports) {
    const r = await orig.call(this, bytes, imports);
    const ex = r.instance.exports;
    if (typeof ex.sim_input !== 'function') {
      return r;
    }
    const log = window.__rcLog = { on: false, rows: [] };
    const w = {};
    for (const k of Object.keys(ex)) {
      w[k] = ex[k];
    }
    w.sim_input = (t, roll, pitch, yaw, thr) => {
      if (log.on) {
        log.rows.push([t, roll, thr]);
      }
      return ex.sim_input(t, roll, pitch, yaw, thr);
    };
    return { module: r.module, instance: { exports: w } };
  };
})();`;

const STALL_MS = 60;
const STEP_MAX = 0.06;

function flight(stallMs) {
  return `
    const log = window.__rcLog;
    log.rows.length = 0;
    const ease = (u) => (u <= 0 ? 0 : (u >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * u)));
    const t0 = performance.now() + 400;
    const u = () => (performance.now() - t0) / 300;
    window.__input.harnessChannels = {
      get roll() { return 0.8 * ease(u()); },
      pitch: 0,
      yaw: 0,
      get throttle() { return 0.45 + 0.4 * ease(u()); },
    };
    await new Promise((res) => setTimeout(res, 300));
    log.on = true;
    await new Promise((res) => setTimeout(res, 200));
    if (${stallMs} > 0) {
      const end = performance.now() + ${stallMs};
      while (performance.now() < end) { /* the stall */ }
    }
    await new Promise((res) => setTimeout(res, 500));
    log.on = false;
    window.__input.harnessChannels = { roll: 0, pitch: 0, yaw: 0, throttle: 0.45 };
    let roll = 0;
    let thr = 0;
    const rows = log.rows;
    for (let i = 1; i < rows.length; i += 1) {
      roll = Math.max(roll, Math.abs(rows[i][1] - rows[i - 1][1]));
      thr = Math.max(thr, Math.abs(rows[i][2] - rows[i - 1][2]));
    }
    return { frames: rows.length, roll, thr };`;
}

async function main() {
  let fails = 0;
  const check = (ok, what, got) => {
    fails += ok ? 0 : 1;
    console.log(`     ${ok ? 'pass' : 'FAIL'}  ${what}${got ? `: ${got}` : ''}`);
  };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const page = await openPage({ root: ROOT, width: 480, height: 270, url: '/index.html', seed: [SEED] });
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
    await ev(`const ui = window.__ui; ui.settings.map = 'field'; ui.settings.graphics = 'low';
      ui.settings.propwash = false; ui.onAction('fly', ui.settings); return 1;`);
    let ready = false;
    for (let i = 0; i < 260 && !ready; i += 1) {
      const m = await ev('return window.__map ? window.__map() : null');
      ready = Boolean(m && m.ready);
      if (!ready) {
        await sleep(500);
      }
    }
    if (!ready) {
      throw new Error('the field never became ready');
    }
    await sleep(2000);
    await ev('window.__drawOff(true); return 1;');
    check(await ev('return Boolean(window.__rcLog)'), 'the module\'s RC frames are being read');
    for (let pair = 0; pair < 3; pair += 1) {
      const out = {};
      for (const stall of [0, STALL_MS]) {
        /* eslint-disable no-await-in-loop */
        const sp = (await ev('return window.__map()')).spawn;
        await ev(`window.__placeCraft(${sp.x}, ${sp.y + 4}, ${sp.z}); return 1;`);
        out[stall] = await ev(flight(stall));
      }
      const a = out[0];
      const b = out[STALL_MS];
      console.log(`  pair ${pair + 1}: steepest RC frame, roll ${r3(a.roll)} and throttle ${r3(a.thr)} without the stall, `
        + `${r3(b.roll)} and ${r3(b.thr)} with it`);
      check(a.frames > 100 && b.frames > 100, 'both flights were handed their RC frames', `${a.frames} and ${b.frames}`);
      check(b.roll <= STEP_MAX && b.roll <= 2 * a.roll, `a ${STALL_MS} ms stall leaves no roll step`, `${r3(b.roll)}`);
      check(b.thr <= STEP_MAX && b.thr <= 2 * a.thr, `a ${STALL_MS} ms stall leaves no throttle step`, `${r3(b.thr)}`);
    }
  } catch (e) {
    fails += 1;
    console.log(`  FAIL  the run did not complete: ${e.message}`);
  } finally {
    await page.close?.();
  }
  console.log(`\nstall-check: ${fails === 0 ? 'all pass' : `${fails} failed`}`);
  process.exit(fails);
}

main();
