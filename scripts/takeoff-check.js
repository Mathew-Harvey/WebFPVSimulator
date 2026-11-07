/*
 * takeoff-check.js: roll the throttle on gently from the grass and watch the
 * camera, because the camera is what a pilot calls the craft.
 *
 * WHY THIS EXISTS. Two tickets on 4 and 5 October said the same thing in two
 * hands: bug-2d0907fa, "when I want to take off smoothly the quad starts
 * sinking into the ground first before it gets lift", and bug-eaae5428,
 * "when throttling up my drone is being pushed down". Both were flying the
 * 65 mm whoop on the five inch's plant. The plant was innocent: from rest on
 * a plane, a slow ramp leaves the ground near 42 percent and only ever goes
 * up. The picture was not. The parked lift (PARKED_LIFT in src/main.js), the
 * 30 cm the lens is raised while the craft sits on the ground, was eased away
 * the frame the craft was released at 25 percent, so the lens dropped toward
 * the grass for most of a second with the craft still sitting on it, and then
 * climbed. Measured before the fix, on the field, whoop, four second ramp:
 * camera 0.363 m to 0.061 m with four hull points on the ground.
 *
 * The camera read is the lens mount (`fpvY` in window.__craftState), which is
 * where the parked lift lives, and not the drawn camera, which the predicted
 * view moves a centimetre or two ahead of the mount while the craft is
 * accelerating. That lead is a different feature and is not this check's.
 *
 * Each case gets a page of its own: the airframe is seated from the settings
 * the first run starts with, and a second run on one page was seen to start
 * with no frames drawn, so nothing here depends on a page's history.
 *
 * WHAT IS ASSERTED, per airframe, for a gentle ramp and a punch, sticks
 * centred, on flat ground:
 *   - the camera never drops more than SINK_TOL below the highest it has
 *     been since the throttle came up, until the craft is a metre up. A
 *     vertical takeoff is a picture that only rises.
 *   - by the time the craft is a metre up, the lift is gone: the lens is
 *     within LENS_TOL of the craft's centre, where the mount puts it.
 *   - the craft did take off, inside the time given.
 *
 * Not deterministic to the bit, because the sticks are written on the frame
 * clock of a headless browser, so every assertion is an inequality.
 *
 * Usage: node scripts/takeoff-check.js. Exit code is the number of failures.
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
import { SETTINGS_KEY } from '../src/ui/ui.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A centimetre of frame to frame interpolation wobble, and no more. The
 * fault this guards was 30 cm. */
const SINK_TOL = 0.01;
/* The mount sits a couple of centimetres over the centre; the lift is 30. */
const LENS_TOL = 0.10;
const HIGH_ENOUGH = 1.0;

/* Seconds to reach the top throttle, the top, and how long to watch. */
const RAMPS = [
  { name: 'gentle ramp', rampS: 4, top: 0.6, watchS: 6 },
  { name: 'punch', rampS: 0.3, top: 0.8, watchS: 3 },
];
const AIRFRAMES = (process.env.TAKEOFF_AF || '5inch,whoop65').split(',');

function flyRamp(R) {
  return `
    window.__stick(0, 0, 0, 0);
    await new Promise((r) => setTimeout(r, 1500));
    const rows = [];
    const t0 = performance.now();
    await new Promise((done) => {
      function f() {
        const t = (performance.now() - t0) / 1000;
        const thr = Math.min(${R.top}, (t / ${R.rampS}) * ${R.top});
        window.__stick(0, 0, 0, thr);
        const g = window.__ground();
        const c = window.__craftState();
        rows.push({ t, thr, craftY: g.y, above: g.above, landed: g.landed, hits: g.hits, camY: c.fpvY });
        if (t < ${R.watchS}) {
          requestAnimationFrame(f);
        } else {
          done();
        }
      }
      requestAnimationFrame(f);
    });
    window.__stick(0, 0, 0, 0);
    return rows;`;
}

function measure(rows) {
  const start = rows.findIndex((r) => r.thr > 0);
  let peak = -Infinity;
  let worstSink = 0;
  let worstAt = null;
  let highRow = null;
  let released = false;
  for (let i = start; i < rows.length; i += 1) {
    const r = rows[i];
    released = released || !r.landed;
    if (r.above >= HIGH_ENOUGH) {
      highRow = r;
      break;
    }
    peak = Math.max(peak, r.camY);
    if (peak - r.camY > worstSink) {
      worstSink = peak - r.camY;
      worstAt = r;
    }
  }
  return { worstSink, worstAt, highRow, released };
}

/*
 * The aircraft is seated by the settings the page boots with, not set on a
 * live page. Setting it on a live page and flying in the same call was how
 * the whoop's lines used to run: the class change seats the whoop's own
 * stand in track a moment later and the world rebuilds onto the title, so
 * the whoop never flew and its lines read a parked craft (PROGRESS.md,
 * round 2 merge fixes). Seated at boot, the boot builds the aircraft's own
 * world once and the run flies in it.
 */
async function openShell(airframe) {
  const seed = `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, { airframe: ${JSON.stringify(airframe)}, map: 'custom', graphics: 'low', graphicsAuto: false });
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* the run then reports what it finds */ }`;
  const page = await openPage({ root: ROOT, width: 400, height: 260, url: '/index.html', seed: [seed] });
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
  for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady')); i += 1) {
    await sleep(500);
  }
  return { page, ev };
}

async function main() {
  let fails = 0;
  const check = (ok, what, got) => {
    fails += ok ? 0 : 1;
    console.log(`     ${ok ? 'pass' : 'FAIL'}  ${what}${got ? `: ${got}` : ''}`);
  };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  for (const airframe of AIRFRAMES) {
    for (const R of RAMPS) {
      /* eslint-disable no-await-in-loop */
      const { page, ev } = await openShell(airframe);
      try {
        let ready = false;
        for (let i = 0; i < 260 && !ready; i += 1) {
          ready = await ev(`const m = window.__map ? window.__map() : null;
            return Boolean(m && m.ready && m.id === 'custom' && window.__craft().run === '${airframe}');`);
          if (!ready) {
            await sleep(500);
          }
        }
        if (!ready) {
          throw new Error('the track never became ready on this aircraft');
        }
        await ev("const ui = window.__ui; ui.firstRun = false; ui.craftGate = false; ui.mode = 'race'; ui.onAction('fly', ui.settings); return 1;");
        let flying = false;
        for (let i = 0; i < 120 && !flying; i += 1) {
          flying = await ev("return window.__ui.screen === 'flight' && window.__craftState().mode === 'flight';");
          if (!flying) {
            await sleep(500);
          }
        }
        if (!flying) {
          throw new Error(`the run never reached flight: ${await ev("return window.__ui.screen + ' ' + window.__craftState().mode")}`);
        }
        await sleep(2000);
        const craft = await ev('return window.__craft()');
        const rows = await ev(flyRamp(R));
        const m = measure(rows);
        console.log(`  ${airframe}, ${R.name} to ${R.top} in ${R.rampS} s`);
        check(craft.run === airframe, 'the run is flying the airframe asked for', craft.run);
        check(rows.length > 30, 'the page drew the flight', `${rows.length} frames`);
        check(m.released && m.highRow !== null, `the craft took off and reached ${HIGH_ENOUGH} m`,
          m.highRow ? `at ${r3(m.highRow.t)} s` : 'it never did');
        check(m.worstSink <= SINK_TOL, 'the view never sinks before the craft lifts',
          m.worstAt
            ? `worst ${r3(m.worstSink)} m at ${r3(m.worstAt.t)} s, throttle ${r3(m.worstAt.thr)}, `
              + `${m.worstAt.hits} hull points down, craft ${r3(m.worstAt.above)} m up`
            : 'it never dropped');
        if (m.highRow) {
          const lens = m.highRow.camY - m.highRow.craftY;
          check(lens <= LENS_TOL, 'a metre up, the parked lift is gone', `lens ${r3(lens)} m over the centre`);
        }
      } catch (e) {
        fails += 1;
        console.log(`  FAIL  the run did not complete: ${e.message}`);
      } finally {
        await page.close?.();
      }
    }
  }
  console.log(`\ntakeoff-check: ${fails === 0 ? 'all pass' : `${fails} failed`}`);
  process.exit(fails);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
