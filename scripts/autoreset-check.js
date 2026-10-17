/*
 * autoreset-check.js: fly the real shell into a shopfront with Auto reset
 * off, on, and on with the pilot flying out of it, and say where the craft
 * is a few seconds later. bug-918a8c99.
 *
 * Four flights, each a 10 m/s head-on at the crash-check shopfront:
 *   off          the crash is a dull bounce (2026-10-16) and the craft
 *                comes down by the wall, and stays.
 *   on, 1 s      after the delay the craft is on the start line and the sim
 *                clock restarted, which is what R does.
 *   on, 2 s,     the pilot pulls the nose back until the craft leans away
 *   flown out    from the wall and opens the throttle straight after the bounce; the craft is in the air
 *                at the deadline and is not reset: the sim clock never starts
 *                again. Until the bounce the pilot only opened the throttle,
 *                because the set down had already put the craft upright, and
 *                the check passed on height alone, which a reset to the line
 *                and a climb from there also gives.
 *   on, 1 s,     as on, 1 s, with Esc and Resume inside the wait: a pause
 *   paused       holds the deadline and the craft still goes back.
 *
 * Usage: node scripts/autoreset-check.js
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
import { PILOT } from './lib/pilot.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EAST = 1.5708;

/* In the page: one head-on flight at the shopfront, then `watchMs` of frames
 * with the sticks centred (throttle `after`). Rows are the craft's position
 * and landed flag with the sim clock. */
function fly(cfg) {
  return `
    const { V } = window.__vm;
    const C = ${JSON.stringify(cfg)};
    const ui = window.__ui;
    ui.settings.autoReset = C.on;
    ui.settings.autoResetS = C.delay;
    await window.__settle(V(-2, 2.5, 29.3), ${EAST}, 1.4);
    const rows = [];
    const snap = (phase) => {
      const c = window.__craftState();
      rows.push({ phase, ms: window.__stickPath().moduleMs, p: [c.worldX, c.worldY, c.worldZ], landed: c.landed });
    };
    const path = window.__ramp(V(-2, 2.5, 29.3), V(7.5, 2.5, 29.3), 1.8, 10);
    await window.__fly(path, { heading: ${EAST}, extraMs: 100, watch: () => snap('fly') });
    if (C.pause) {
      /* Esc inside the wait, then Resume: the deadline is held, not lost. */
      ui.onAction('pause', ui.settings);
      ui.show('paused');
      await new Promise((r) => setTimeout(r, 300));
      ui.onAction('resume', ui.settings);
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        snap('after');
        /* A pilot flying out pulls the nose back off the face first: with
         * no set down, centred sticks hold whatever attitude the bounce left.
         * The pull holds until the top leans away from the wall, which faces
         * west here, because a craft stood straight up still leaning a few
         * degrees into it is pressed onto it by full throttle and slides down
         * it, which is what the first version of this pilot did. */
        const up = window.__craftState().up;
        const pulling = C.pullMs && performance.now() - t0 < C.pullMs && (!up || up.x > -0.1);
        window.__stick(0, pulling ? 1 : 0, 0, C.after);
        if (performance.now() - t0 >= C.watchMs) { res(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    ui.settings.autoReset = false;
    return rows;`;
}

async function main() {
  const page = await openPage({ root: ROOT, width: 400, height: 260, url: '/index.html' });
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
  let fails = 0;
  const check = (what, ok, got) => {
    fails += ok ? 0 : 1;
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}: ${got}`);
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
    if (!ready) {
      throw new Error('the city never became ready');
    }
    await sleep(6000);
    await ev(`${PILOT}\nreturn 1;`);
    await ev('window.__drawOff(true); return 1;');
    console.log(`autoreset-check: city loaded\n`);
    /* The first flight after boot is a cold one: thrown away, as crash-check does. */
    await ev(fly({ on: false, delay: 1, after: 0.34, watchMs: 500 }));

    const flights = [
      ['off', { on: false, delay: 1, after: 0, watchMs: 3500 }],
      ['on, 1 s', { on: true, delay: 1, after: 0, watchMs: 3500 }],
      ['on, 2 s, flown out', { on: true, delay: 2, after: 1, pullMs: 800, watchMs: 3500 }],
      ['on, 1 s, paused in the wait', { on: true, delay: 1, after: 0, watchMs: 3500, pause: true }],
    ];
    for (const [name, cfg] of flights) {
      const rows = await ev(fly(cfg));
      const after = rows.filter((r) => r.phase === 'after');
      const end = after[after.length - 1];
      const hit = rows.findIndex((r) => r.p[0] > 5.1);
      const wallAt = hit >= 0 ? rows[hit].p : null;
      const wallD = wallAt ? Math.hypot(end.p[0] - wallAt[0], end.p[2] - wallAt[2]) : null;
      const airborne = after.some((r) => !r.landed && r.ms > 0);
      console.log(`${name}: ends ${end.p.map((v) => v.toFixed(1)).join(', ')}${end.landed ? ', landed' : ', in the air'}, ${wallD == null ? 'never reached the wall' : `${wallD.toFixed(1)} m from the wall`}`);
      check(`${name}: the craft reached the wall`, hit >= 0, hit >= 0 ? 'yes' : 'no');
      if (cfg.on && cfg.after === 0) {
        /* A set down nearby is within 3.5 m of the wall; the start line is not. */
        check(`${name}: back on the start line after the delay`, end.landed && wallD > 5, `${wallD.toFixed(1)} m from the wall, landed ${end.landed}`);
      } else if (cfg.on) {
        /* Reset is the sim clock starting again, which is what R does. */
        const restarted = after.some((r, i) => i > 0 && r.ms < after[i - 1].ms);
        check(`${name}: not reset, the pilot flew out in time`, airborne && end.p[1] > 2 && !restarted,
          `height ${end.p[1].toFixed(1)} m, airborne ${airborne}, ${restarted ? 'reset' : 'never reset'}`);
      } else {
        check(`${name}: left by the wall, not reset`, wallD != null && wallD < 6, `${wallD == null ? 'n/a' : wallD.toFixed(1)} m from the wall`);
      }
    }
  } finally {
    await page.close?.();
  }
  console.log(`\nautoreset-check: ${fails} failed`);
  process.exit(fails);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
