/*
 * timeryield-check.js: the timer loop hands the frames back to the display
 * when it cannot draw faster than the display refreshes (bug-5dfce5a7), and
 * keeps them everywhere it can.
 *
 * bug-5dfce5a7, 2026-11-08: "fps is 100-180 but it looks like 20-40", on
 * Low, which paces with the timer under Frame pacing's Auto. The report: a
 * 185 Hz refresh, the timer drawing 154 frames a second (6.5 ms at the
 * median, 11.2 at the 90th), the GPU's time 6.4 ms, so timerDelay asked for
 * the display's period and got slower than it. A timer slower than the
 * display shows the same frame twice at the difference, 31 times a second.
 * src/render/timeryield.js says why at length.
 *
 * Two halves.
 *
 * NODE, instant, `--node` alone: src/render/timeryield.js driven with
 * cadences written out as numbers. The report's own (185 Hz, draws at its
 * median and 90th, the GPU past the period) hands back; the owner's laptop
 * of 2026-09-28 (60 Hz, 125 frames a second, the GPU at 7.8 ms) keeps the
 * timer; a 240 Hz panel hands back however fast its GPU; a 144 Hz one with
 * a quick GPU keeps it; no verdict before the windows are full; a stretch
 * broken by a menu does not count its gap; the verdict holds once given;
 * and a GPU that slows mid flight is caught at the next window.
 *
 * BROWSER, headless Chromium on the real shell, flying on Bardwell's yard.
 * This container's GPU is SwiftShader, which cannot beat a 60 Hz refresh,
 * so the timer here is the report's case in kind: Auto on Low hands the
 * frames to the display in flight, the report's perf block says so and
 * why, the world goes on drawing, and Settings, Advanced says so on the
 * Frame pacing row. Timer, always and ?loop=timer keep the timer through
 * the same flight; Medium never runs the timer. Refreshes with no new frame
 * are counted under each loop from a rAF of the check's own and printed,
 * for the record: SwiftShader's GPU paces both loops, so the count is not
 * a line here.
 *
 * Usage:
 *   node scripts/timeryield-check.js          both halves
 *   node scripts/timeryield-check.js --node   the instant half only
 *
 * A threshold here is never widened to make a line pass (CLAUDE.md); the
 * argument goes in PROGRESS.md.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTimerYield, YIELD_WINDOW } from '../src/render/timeryield.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeOnly = process.argv.includes('--node');

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!cond) failures += 1;
  return Boolean(cond);
}

/*
 * A flight, as the frame loop feeds the judge: the timer's drawn frames at
 * `drawGaps` (cycled), the display's refresh every `displayMs` with the
 * kept rAF firing on each refresh after a tick (so on every refresh when the
 * timer is the faster, and missing refreshes when it is not), and every
 * tick's fallback flag `fellBack`. Returns the judge and the frame at which
 * it handed back, or -1.
 */
function fly({ drawGaps, displayMs, fellBack = false, frames = 2000, judge = createTimerYield(), from = 0 }) {
  let t = from;
  let nextRefresh = Math.ceil(from / displayMs) * displayMs;
  let rafPending = false;
  let handedAt = -1;
  for (let i = 0; i < frames; i += 1) {
    /* The tick: schedule, ask for the kept rAF, draw. */
    judge.noteTick(fellBack);
    rafPending = true;
    judge.noteDraw(t);
    if (judge.check() && handedAt < 0) {
      handedAt = i;
    }
    const next = t + drawGaps[i % drawGaps.length];
    /* Every refresh before the next tick fires the pending rAF, once. */
    while (nextRefresh <= next) {
      if (rafPending) {
        judge.noteRaf(nextRefresh);
        rafPending = false;
      }
      nextRefresh += displayMs;
    }
    t = next;
  }
  return { judge, handedAt, t };
}

/* A cadence with a median and a tail: n gaps, the share `tail` of them at
 * `slow`, the rest at `fast`, spread evenly through the cycle. */
function cadence(fast, slow = fast, tail = 0, n = 40) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    acc += tail;
    if (acc >= 1) {
      acc -= 1;
      out.push(slow);
    } else {
      out.push(fast);
    }
  }
  return out;
}

function nodeHalf() {
  console.log('node: src/render/timeryield.js against cadences written as numbers');
  /* The report: 185 Hz, draws 6.5 ms at the median with a tenth at 11.2,
   * the GPU's 6.4 ms past the 5.4 ms period, so every tick fell back. */
  const report = fly({ drawGaps: cadence(6.5, 11.2, 0.1), displayMs: 1000 / 185, fellBack: true });
  const ry = report.judge.yielded();
  check('bug-5dfce5a7: 185 Hz, the timer drawing at 6.5 ms, hands the frames back', Boolean(ry), JSON.stringify(ry));
  check('  on the drawn signal, measuring the report\'s 6.5 against the display\'s 5.4',
    ry && ry.why === 'drawn' && ry.drawMs === 6.5 && Math.abs(ry.displayMs - 5.4) < 0.05, JSON.stringify(ry));
  check('  inside two windows of flying', report.handedAt >= 0 && report.handedAt <= 2 * YIELD_WINDOW, `frame ${report.handedAt}`);
  /* The same draws with a GPU that never fell back: the drawn signal alone. */
  const drawnOnly = fly({ drawGaps: cadence(6.5, 11.2, 0.1), displayMs: 1000 / 185, fellBack: false });
  check('  and on the drawn signal alone, with no tick falling back', Boolean(drawnOnly.judge.yielded()),
    JSON.stringify(drawnOnly.judge.yielded()));
  /* The owner's laptop, 2026-09-28: 60 Hz, 125 frames a second (8 ms, 9.7 at
   * the 90th), the GPU at 7.8 ms, so period less GPU, never the fallback. */
  const laptop = fly({ drawGaps: cadence(8, 9.7, 0.1), displayMs: 1000 / 60, fellBack: false, frames: 4000 });
  check('the owner\'s laptop: 60 Hz, the timer at 125 frames a second, keeps the timer',
    laptop.judge.yielded() === null, JSON.stringify(laptop.judge.yielded()));
  /* 240 Hz: the timer's floor is 4 ms plus the main thread, 4.2 here. */
  const fast = fly({ drawGaps: cadence(4.2), displayMs: 1000 / 240, fellBack: false });
  check('240 Hz: a timer at its 4.2 ms floor hands back, however fast the GPU',
    Boolean(fast.judge.yielded()), JSON.stringify(fast.judge.yielded()));
  /* 144 Hz with a 2 ms GPU: period less GPU is 4.9, which a timeout gives
   * as 4 plus a little. */
  const panel = fly({ drawGaps: cadence(4.4, 5.2, 0.1), displayMs: 1000 / 144, fellBack: false, frames: 4000 });
  check('144 Hz with a quick GPU: the timer at 4.4 ms keeps the timer',
    panel.judge.yielded() === null, JSON.stringify(panel.judge.yielded()));
  /* The fallback alone: the GPU cannot beat a 144 Hz display, so every tick
   * asks for its 6.94 ms period, which a timeout takes as 6, and an idle
   * main thread fires it at 6.2: more than the drawn signal's margin
   * inside the period, and still nothing gained by racing a GPU that
   * cannot finish a frame in one refresh. */
  const idle = fly({ drawGaps: cadence(6.2), displayMs: 1000 / 144, fellBack: true });
  const iy = idle.judge.yielded();
  check('144 Hz with a GPU slower than the display hands back on the period signal, the draws just inside it',
    iy && iy.why === 'period' && iy.fallback === 1, JSON.stringify(iy));
  /* Not before the windows are full. */
  const short = fly({ drawGaps: cadence(6.5), displayMs: 1000 / 185, fellBack: true, frames: YIELD_WINDOW });
  check('no verdict before a window of drawn gaps', short.judge.yielded() === null && short.handedAt < 0,
    `after ${YIELD_WINDOW} frames`);
  /* A menu between two stretches: the gap across it is not a cadence. */
  {
    const judge = createTimerYield();
    const a = fly({ drawGaps: cadence(8), displayMs: 1000 / 60, frames: 70, judge });
    judge.pause();
    fly({ drawGaps: cadence(8), displayMs: 1000 / 60, frames: 300, judge, from: a.t + 60 });
    check('a stretch broken by a menu does not count the gap across it', judge.yielded() === null,
      JSON.stringify(judge.yielded()));
  }
  /* Once given, the verdict holds, and check() answers true only once. */
  {
    const judge = createTimerYield();
    const r = fly({ drawGaps: cadence(6.5), displayMs: 1000 / 185, fellBack: true, judge });
    const first = judge.yielded();
    let again = 0;
    for (let i = 0; i < 500; i += 1) {
      judge.noteDraw(r.t + i * 2);
      judge.noteTick(false);
      if (judge.check()) {
        again += 1;
      }
    }
    check('the verdict holds once given, and is announced once', first && judge.yielded() === first && again === 0,
      `again ${again}`);
  }
  /* A GPU that slows mid flight: kept at first, caught at the next window. */
  {
    const judge = createTimerYield();
    const a = fly({ drawGaps: cadence(8), displayMs: 1000 / 60, frames: 600, judge });
    const kept = judge.yielded() === null;
    const b = fly({ drawGaps: cadence(20), displayMs: 1000 / 60, frames: 600, judge, from: a.t });
    check('a GPU that slows mid flight is kept at first and caught at a later window',
      kept && Boolean(judge.yielded()) && b.handedAt >= 0 && b.handedAt <= 2 * YIELD_WINDOW,
      `kept ${kept}, then ${JSON.stringify(judge.yielded())} at frame ${b.handedAt}`);
  }
}

async function browserHalf() {
  const { openPage } = await import('../tests/lib/page.js');
  const { SETTINGS_KEY } = await import('../src/ui/ui.js');
  const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
  /* The page's verdict and draw count. A shell without the hook (the base,
   * before this check's fix) answers with its loop and its frame count, so
   * the lines fail rather than the script. */
  const STATE = "(window.__timerYield ? window.__timerYield() : { loop: window.__loopNow(), yielded: null, draws: window.__boot().frames, hook: false })";
  const seed = (graphics, pacing) => `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.airframeAsked = true;
    s.graphics = ${JSON.stringify(graphics)};
    s.graphicsAuto = false;
    s.pacing = ${JSON.stringify(pacing)};
    s.airframe = '5inch';
    s.map = 'bardwell';
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* defaults */ }`;
  /* Refreshes that showed no new frame, from a rAF of the check's own:
   * each rAF is a refresh, and the world's draw count says whether one was
   * drawn since the last. */
  const COUNT = `(() => new Promise((done) => {
    const draws = () => (window.__timerYield ? window.__timerYield().draws : window.__boot().frames);
    let last = draws();
    let refreshes = 0;
    let repeats = 0;
    const t0 = performance.now();
    const step = () => {
      const d = draws();
      refreshes += 1;
      if (d === last) repeats += 1;
      last = d;
      if (performance.now() - t0 < 1500) requestAnimationFrame(step); else done({ refreshes, repeats });
    };
    requestAnimationFrame(step);
  }))()`;
  const fly = async (page) => {
    await page.until('window.__shellReady === true', 120000);
    await page.until('window.__map && window.__map().ready', 120000);
    await page.evaluate("(() => { window.__ui.act('fly'); return 1; })()");
    await page.until("window.__mode === 'flight' && window.__ui.screen === 'flight'", 30000);
  };

  /* How long Auto took to hand back, which the explicit choices then fly
   * for and more, so "keeps the timer" is not said of a flight too short
   * to have been judged. */
  let handMs = 0;
  console.log('browser: Auto on Low, SwiftShader, Bardwell');
  {
    const page = await openPage({ root, width: 960, height: 540, url: '/index.html', seed: [seed('low', 'auto')] });
    try {
      await fly(page);
      const before = await page.evaluate(STATE);
      check('the timer paces the flight at first', before.loop === 'timer' && before.yielded === null, JSON.stringify(before));
      const underTimer = await page.evaluate(COUNT);
      /* SwiftShader draws a handful of frames a second here, so a window
       * of 120 drawn gaps is most of a minute; on the report's machine it
       * is under one. */
      const t0 = Date.now();
      let handed = null;
      try {
        await page.until(`${STATE}.yielded !== null && ${STATE}.loop === 'raf'`, 180000);
      } catch (e) {
        /* Read below, and the lines fail. */
      }
      handed = await page.evaluate(STATE);
      handMs = Date.now() - t0;
      console.log(`        handed back after ${(handMs / 1000).toFixed(1)} s of flying under the timer`);
      check('in flight it hands the frames to the display', handed.loop === 'raf' && handed.yielded !== null, JSON.stringify(handed));
      const y = handed.yielded || {};
      check('  and says why, with what it measured', (y.why === 'drawn' || y.why === 'period')
        && y.drawMs > 0 && y.displayMs > 0 && y.fallback >= 0, JSON.stringify(y));
      const loopNow = await page.evaluate('window.__loopNow()');
      check('  window.__loopNow agrees', loopNow === 'raf', loopNow);
      const d0 = handed.draws;
      await wait(1500);
      const later = await page.evaluate(STATE);
      check('the world goes on drawing under the display loop', later.draws > d0 + 5 && later.loop === 'raf',
        `${d0} to ${later.draws}`);
      const underDisplay = await page.evaluate(COUNT);
      console.log(`        refreshes with no new frame: timer ${underTimer.repeats} of ${underTimer.refreshes}, display ${underDisplay.repeats} of ${underDisplay.refreshes}`);
      const perf = await page.evaluate('window.__ui.perfProbe ? window.__ui.perfProbe() : null');
      check('the report\'s perf block says the display paces, and why', perf && perf.loop === 'raf'
        && perf.timerYield && perf.timerYield.why === y.why, JSON.stringify(perf && { loop: perf.loop, timerYield: perf.timerYield }));
      const note = await page.evaluate("(() => { window.__ui.show('advanced'); const it = window.__ui.items().find((r) => r.label === 'Frame pacing'); return it ? it.note : ''; })()");
      check('Settings, Advanced says so on the Frame pacing row', /showing frames twice/.test(note), note.slice(0, 90));
    } finally {
      await page.close();
    }
  }

  for (const [label, pacing, url] of [
    ['Timer, always', 'timer', '/index.html'],
    ['?loop=timer', 'auto', '/index.html?loop=timer'],
  ]) {
    console.log(`browser: ${label} on Low`);
    const page = await openPage({ root, width: 960, height: 540, url, seed: [seed('low', pacing)] });
    try {
      await fly(page);
      const flyMs = Math.max(15000, Math.min(handMs, 180000) + 15000);
      await wait(flyMs);
      const s = await page.evaluate(STATE);
      check(`${label} keeps the timer through ${(flyMs / 1000).toFixed(0)} s of flight, longer than Auto took to hand back`,
        s.loop === 'timer' && s.yielded === null, JSON.stringify(s));
    } finally {
      await page.close();
    }
  }

  console.log('browser: Medium');
  {
    const page = await openPage({ root, width: 960, height: 540, url: '/index.html', seed: [seed('medium', 'auto')] });
    try {
      await fly(page);
      await wait(4000);
      const s = await page.evaluate(STATE);
      check('Medium never runs the timer, so there is nothing to hand back', s.loop === 'raf' && s.yielded === null, JSON.stringify(s));
    } finally {
      await page.close();
    }
  }
}

nodeHalf();
if (!nodeOnly) {
  await browserHalf();
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exitCode = failures ? 1 : 0;
