/*
 * pollclock-check.js: the sticks' clock in the real shell under the
 * display's loop, and the keyboard stick it makes. bug-e464f141, a keyboard
 * pilot's tune report from the town whose pitch travel read -1.14, past the
 * end of a stick no key can pass.
 *
 * InputManager.poll() has two callers, the 2 ms timer with performance.now()
 * and the frame. The frame handed in the display loop's own timestamp, which
 * is when the frame began, not when it ran, and a timer poll in between is
 * later than that. On the base, in this page on the field under ?loop=raf, a
 * third of the frame's polls arrived up to 17 ms before the last poll, and
 * the keyboard's rates ran backwards for that poll: a released key's spring
 * pushed the stick outward, a held key's ramp stepped back. The Node half,
 * the guard in poll() itself, is the bug-e464f141 section of
 * scripts/input-selftest.js.
 *
 * The real shell on the field, Low, under the display's loop. Every poll is
 * watched by wrapping window.__input.poll, which reads the stamp it is
 * handed and the channels it leaves and changes nothing. Then the pitch key
 * (ArrowUp, Mode 2) is held most of the way up its ramp and let go, six
 * times, through real key events.
 *
 *   no poll is handed a stamp before the last poll's
 *   while the key is held the stick never steps back towards centre
 *   let go, it never springs outward on its way back, and never past full
 *   the flight's record, which a report carries, never reads past full
 *
 * Usage: node scripts/pollclock-check.js
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
import { openPage, keyInfo } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOLDS = 6;
/* A headless page polls slower than a pilot's, about every 40 ms here, and
 * the hold clock moves 40 ms a poll at most (readKeyboard), so a hold may
 * not reach the stop; the ramp needs 1250 ms of that clock. Every hold has
 * to pass three quarters of the stick, which is where a step back or an
 * outward spring is plain. */
const HOLD_MS = 3000;
const DEEP = 0.75;
const REST_MS = 600;

/* The watcher. `hold` is set by the check, and each row is the hold it was
 * taken in, whether the key was down at that poll (the page's own key set,
 * not the check's guess at when the event landed), and the pitch the poll
 * left. A stamp handed in before the clock the poll found is counted. */
const WATCH = `
  const im = window.__input;
  const orig = im.poll;
  const w = window.__pollWatch = { hold: -1, rows: [], polls: 0, stale: 0, worst: 0 };
  im.poll = function (stamp) {
    const before = this.lastWall;
    const r = orig.call(this, stamp);
    w.polls += 1;
    if (stamp < before) {
      w.stale += 1;
      w.worst = Math.min(w.worst, stamp - before);
    }
    if (w.hold >= 0) {
      w.rows.push([w.hold, this.keys.has('ArrowUp') ? 1 : 0, this.channels.pitch]);
    }
    return r;
  };
  return 1;`;

async function main() {
  let fails = 0;
  const check = (ok, what, got) => {
    fails += ok ? 0 : 1;
    console.log(`     ${ok ? 'pass' : 'FAIL'}  ${what}${got ? `: ${got}` : ''}`);
  };
  const page = await openPage({ root: ROOT, width: 640, height: 360, url: '/index.html?loop=raf' });
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
  const key = (type) => cdp.send('Input.dispatchKeyEvent', { type, ...keyInfo('ArrowUp') }, sessionId);
  try {
    for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady')); i += 1) {
      await sleep(500);
    }
    await ev(`const ui = window.__ui; ui.settings.map = 'field'; ui.settings.graphics = 'low';
      ui.onAction('fly', ui.settings); return 1;`);
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
    await sleep(1500);
    const loop = await ev('return { screen: window.__ui.screen, timer: new URLSearchParams(location.search).get(\'loop\') }');
    check(loop.screen === 'flight' && loop.timer === 'raf', 'flying the field under the display\'s loop', JSON.stringify(loop));
    await ev(WATCH);
    for (let h = 0; h < HOLDS; h += 1) {
      /* eslint-disable no-await-in-loop */
      await ev(`window.__pollWatch.hold = ${h}; return 1;`);
      await key('keyDown');
      await sleep(HOLD_MS);
      await key('keyUp');
      await sleep(REST_MS);
    }
    const w = await ev(`const w = window.__pollWatch; w.hold = -1;
      return { polls: w.polls, stale: w.stale, worst: w.worst, rows: w.rows,
        travel: window.__input.flightReport() && window.__input.flightReport().travel.pitch };`);
    console.log(`  ${w.polls} polls watched, ${w.rows.length} through the ${HOLDS} holds`);
    check(w.polls > 200, 'the polls were watched', String(w.polls));
    check(w.stale === 0, 'no poll is handed a stamp before the last poll\'s',
      w.stale ? `${w.stale} were, the worst ${w.worst.toFixed(1)} ms before` : '');
    let back = 0;
    let out = 0;
    let past = 0;
    let deep = 0;
    let rest = 0;
    let deepest = 0;
    for (let h = 0; h < HOLDS; h += 1) {
      const rows = w.rows.filter((r) => r[0] === h);
      let prev = null;
      for (const [, held, p] of rows) {
        deepest = Math.min(deepest, p);
        past += p < -1 ? 1 : 0;
        if (prev !== null) {
          if (held && Math.abs(p) < Math.abs(prev)) {
            back += 1;
          }
          if (!held && Math.abs(p) > Math.abs(prev)) {
            out += 1;
          }
        }
        prev = p;
      }
      deep += rows.some((r) => r[1] === 1 && r[2] <= -DEEP) ? 1 : 0;
      rest += rows.length > 0 && rows[rows.length - 1][2] === 0 ? 1 : 0;
    }
    check(deep === HOLDS && rest === HOLDS, `each of the ${HOLDS} holds passed ${DEEP} of the stick and came back to centre`,
      `${deep} did, ${rest} at rest, the deepest ${deepest}`);
    check(back === 0, 'while the key is held the stick never steps back towards centre', back ? `${back} polls did` : '');
    check(out === 0 && past === 0, 'let go, it never springs outward on its way back, and never past full stick',
      out || past ? `${out} polls sprang outward, ${past} read past full, the deepest ${deepest}` : '');
    check(Array.isArray(w.travel) && w.travel[0] >= -1, 'the flight\'s record, which a report carries, never reads past full',
      JSON.stringify(w.travel));
    /* The board is not running beside this page, so its calls are refused;
     * that is not the page's error. */
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    check(errs.length === 0, 'no page error', errs.slice(0, 3).join(' | '));
  } catch (e) {
    fails += 1;
    console.log(`  FAIL  the run did not complete: ${e.message}`);
  } finally {
    await page.close?.();
  }
  console.log(`\npollclock-check: ${fails === 0 ? 'all pass' : `${fails} failed`}`);
  process.exit(fails);
}

main();
