/*
 * autoreset-check.js: fly the real shell into a shopfront with Auto reset
 * off, on, and on with the pilot flying out of it, and say where the craft
 * is a few seconds later. bug-918a8c99.
 *
 * Three flights, each a 10 m/s head-on at the crash-check shopfront:
 *   off          the craft is set down nearby, as it always was, and stays.
 *   on, 1 s      after the delay the craft is on the start line and the sim
 *                clock restarted, which is what R does.
 *   on, 2 s,     the pilot takes off straight after the set down; the craft
 *   flown out    is in the air at the deadline and is not reset.
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
    await new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        snap('after');
        window.__stick(0, 0, 0, C.after);
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
      ['on, 2 s, flown out', { on: true, delay: 2, after: 1, watchMs: 3500 }],
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
        check(`${name}: not reset, the pilot flew out in time`, airborne && end.p[1] > 2, `height ${end.p[1].toFixed(1)} m, airborne ${airborne}`);
      } else {
        check(`${name}: set down nearby and left there`, wallD != null && wallD < 6, `${wallD == null ? 'n/a' : wallD.toFixed(1)} m from the wall`);
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
