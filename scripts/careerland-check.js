/*
 * careerland-check.js: a lesson's Land counts a quad resting on the pad with
 * the motors still turning, in the real shell.
 *
 * WHY THIS EXISTS. bug-ab2ede66, "the mission is not completing after i do
 * the objective", on the career's first part. The shell parks a craft only
 * once the throttle is back under its takeoff latch (TAKEOFF_THROTTLE, 0.25
 * of stick), and a five inch hovers near 0.37. A pilot who eases the throttle
 * down until the quad touches, as Lift Off's hint says, and leaves the stick
 * there, sits on the pad unparked for as long as they hold it. The land judge
 * read only the parked flag, so the objective said Land for ever and the
 * coach said nothing. Measured on unchanged main: touched down on 0.30 the
 * lesson never finished; on 0.22 it finished at once.
 *
 * WHAT IT DOES, on a fresh browser at a desktop size:
 *
 *   Lift Off      flown to its Land objective, then let down onto the pad on
 *                 a throttle above the latch and under hover: the quad sits
 *                 on the pad unparked (the case itself, asserted first), and
 *                 the lesson finishes with a medal.
 *   Forward and   flown to its Land on the pad the same way, and down on the
 *   Stop          same throttle: it finishes, so the pad's own test reads the
 *                 resting craft too.
 *   the report    a report written while a lesson flies carries the lesson,
 *                 the objective and what its judge says; one written outside
 *                 the career carries no such key.
 *
 * The objectives before Land are reached by putting the craft where they ask
 * (window.__placeCraft) on a hover throttle, as career-ui-check does for its
 * ceiling case: what is under test is the landing, not the hover. Every wait
 * is on state, never a fixed sleep standing in for one, except the short
 * looks at a craft that must stay where it is.
 *
 * Not part of `npm run verify`. Run it as `npm run check:careerland`.
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
import { lessonById } from '../src/career/curriculum.js';
import { docToWorld } from '../src/career/geometry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Above the shell's takeoff latch (0.25) and under the five inch's hover, so
 * the quad comes down onto the pad and is never parked while it is held. */
const UNDER_HOVER = 0.3;

/* The board is never asked: a lesson flies its stand in, as career-ui-check
 * explains. */
const NO_BOARD = `(() => {
  const real = window.fetch.bind(window);
  const theirs = (u) => { try { const x = new URL(u, location.href); return x.origin !== location.origin; } catch (e) { return false; } };
  window.fetch = (input, opts) => {
    const url = String(input && input.url ? input.url : input);
    return theirs(url) && /\\/api\\//.test(url) ? Promise.reject(new TypeError('Failed to fetch')) : real(input, opts);
  };
  navigator.sendBeacon = () => true;
})();`;

const seed = [NO_BOARD, `try {
  const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
  s.graphics = 'low'; s.graphicsAuto = false; s.airframeAsked = true;
  localStorage.setItem('webfpv.settings.v3', JSON.stringify(s));
} catch (e) { /* the run boots on the defaults */ }`];

/* The lesson as the page sees it, in one read. */
const LOOK = `(() => {
  const c = window.__craftState();
  const s = window.__career.status();
  const cur = s && s.current;
  return {
    career: window.__career.state(),
    landed: c.landed,
    y: c.worldY,
    phase: s ? s.phase : null,
    index: s ? s.index : null,
    kind: cur ? cur.kind : null,
    detail: cur ? cur.detail : null,
    medal: s ? s.medal || null : null,
  };
})()`;

let fails = 0;
let passes = 0;
const check = (what, ok, got = '') => {
  if (ok) {
    passes += 1;
  } else {
    fails += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}${got === '' ? '' : `: ${got}`}`);
  return ok;
};

/* One fresh page per section, so a lesson that never finishes (as on the
 * base) cannot leave the next section flying in its world. */
let page = null;
const t0 = Date.now();
const state = (s) => `window.__career && window.__career.state() === ${JSON.stringify(s)}`;
const look = () => page.evaluate(LOOK);

/* Open a lesson and fly it from its briefing. Returns the start pad. */
async function flyLesson(id) {
  await page.evaluate(`window.__career.open(${JSON.stringify(id)})`);
  await page.until(state('briefing'), 60000);
  await page.until("(() => { const b = document.querySelector('#career .cr-brief .cr-btn.primary'); return b && !b.disabled; })()", 90000);
  await page.evaluate('window.__career.fly()');
  await page.until(state('flight'), 60000);
  return page.evaluate('(() => { const c = window.__craftState(); return { x: c.worldX, y: c.worldY, z: c.worldZ }; })()');
}

/* Hold the craft at a world point on a hover throttle until the lesson's
 * current objective is `kind`, or give up after `ms`. */
async function holdUntil(at, kind, ms) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await look();
    if (v.kind === kind || v.career !== 'flight' || Date.now() > end) {
      return v;
    }
    await page.evaluate(`(window.__stick(0, 0, 0, 0.5), window.__placeCraft(${at.x}, ${at.y}, ${at.z}), 1)`);
    await page.sleep(250);
  }
}

/* Let the craft down onto a point from 0.4 m on a fixed throttle and wait
 * for the lesson to end. A sampler in the page reads the lesson's report
 * probe every frame and keeps the first frame it says the craft is on the
 * ground, with whether the shell had parked it: the settle is 0.6 s of sim
 * time, which a poll from here can step straight over. */
async function setDownOn(at, thr) {
  await page.evaluate(`(() => {
    window.__groundSeen = null;
    const tick = () => {
      const r = window.__ui.careerProbe ? window.__ui.careerProbe() : null;
      if (!window.__groundSeen && r && r.grounded) {
        const c = window.__craftState();
        window.__groundSeen = { report: r, landed: c.landed, dy: c.worldY - ${at.y} };
      }
      if (window.__career.state() === 'flight') {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
    window.__stick(0, 0, 0, ${thr});
    window.__placeCraft(${at.x}, ${at.y + 0.4}, ${at.z});
  })()`);
  await page.until(`window.__career.state() !== 'flight'`, 30000).catch(() => {});
  const seen = await page.evaluate('window.__groundSeen');
  const after = await look();
  return { seen, after };
}

async function section(name, fn) {
  console.log(`\n${name}`);
  page = await openPage({ root: ROOT, width: 1280, height: 720, seed });
  try {
    await page.until('!!window.__shellReady', 180000);
    await fn();
    /* The board this page cannot reach is the one error allowed, as in
     * career-ui-check. */
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    check('no uncaught error or console.error', errs.length === 0, errs.slice(0, 4).join(' | ') || 'none');
  } catch (e) {
    check('the section ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  } finally {
    await page.close();
  }
}

await section('Lift Off, down on a throttle under hover', async () => {
  const r = await page.evaluate('(() => { const r = window.__ui.bugSnapshot(); return { has: "career" in r, keys: Object.keys(r).length }; })()');
  check('a report on the title carries no career key', r.has === false, JSON.stringify(r));
  const pad = await flyLesson('1-1');
  const v = await holdUntil({ x: pad.x, y: pad.y + 2, z: pad.z }, 'land', 60000);
  check('flown to its Land objective', v.kind === 'land', JSON.stringify(v));
  const report = await page.evaluate('(() => { const r = window.__ui.bugSnapshot(); return r.career || null; })()');
  check('a report written at Land says which lesson and which objective',
    Boolean(report) && report.lesson === '1-1' && report.kind === 'land' && report.objective === '3 of 3'
      && report.state === 'flight' && report.phase === 'flying',
    JSON.stringify(report));
  const { seen, after } = await setDownOn(pad, UNDER_HOVER);
  check(`on ${UNDER_HOVER}, the quad comes to rest on the pad unparked (the case itself), and the report says grounded`,
    Boolean(seen) && seen.landed === false && Math.abs(seen.dy) < 0.15 && seen.report.lesson === '1-1',
    JSON.stringify(seen));
  check('the lesson finishes, with a medal',
    after.career === 'results' && after.phase === 'complete' && Boolean(after.medal), JSON.stringify(after));
  check('and finished with the craft still unparked, so the resting craft is what counted',
    after.landed === false, `landed ${after.landed}`);
});

await section('Forward and Stop, down on its pad on the same throttle', async () => {
  const lesson = lessonById('1-4');
  const W = 160;
  const D = 160;
  const pad = await flyLesson('1-4');
  const circle = lesson.objectives.find((o) => o.kind === 'hold').zone;
  const c = docToWorld(W, D, circle.at[0], circle.at[1], 0);
  const v = await holdUntil({ x: c.x, y: pad.y + 2, z: c.z }, 'land', 60000);
  check('flown to its Land on the pad', v.kind === 'land', JSON.stringify(v));
  const want = lesson.objectives.find((o) => o.kind === 'land').pad;
  const p = docToWorld(W, D, want.at[0], want.at[1], 0);
  const { seen, after } = await setDownOn({ x: p.x, y: pad.y, z: p.z }, UNDER_HOVER);
  check('it comes to rest on the pad unparked', Boolean(seen) && seen.landed === false, JSON.stringify(seen));
  check('and the lesson finishes', after.career === 'results' && after.phase === 'complete', JSON.stringify(after));
});

console.log(`\ncareerland-check: ${passes} passed, ${fails} failed, ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(fails ? 1 : 0);
