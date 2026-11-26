/*
 * autolow-check.js: a machine on Auto's Low is still measured, so Auto can
 * take it back up when its GPU has the room.
 *
 * THE BUG. bug-3402c0cd, the bug board, 2026-11-25, Brave on "Laptop and
 * desktop with 5x series GPUs": "Used to look amazing now very clearly
 * grainy. Nothing has been changed across my settings or computers." The
 * report: Graphics on Auto, drawing at Low at full scale (pixel ratio 0.81 on
 * a 1.5 screen), the timer loop pacing at 123 frames a second, the GPU timed
 * at 6.7 ms. Frame pacing's Auto paces Low with the timer (pacingTimerOn in
 * src/ui/ui.js), and Auto graphics stood down for every frame the timer
 * paced, so the evidence for a promotion, which observe() gathers and nothing
 * else does, was never gathered again. However a machine reached Auto's Low,
 * it stayed there; the faster the machine, the more surely, because the
 * timer hands the frames back to the display only when it cannot outdraw it.
 * The board's last 400 closed reports hold the same picture at least once
 * more (bug-5702dc41, Auto Low, the timer, 125 frames a second, 6.5 ms).
 *
 * THE FIX. Under the timer, where it is pacing because the preset is Low
 * (Frame pacing on Auto, no ?loop= force, a device whose own default is not
 * Low), Auto keeps one watch: observeHeadroom in src/render/autoscale.js,
 * the promote evidence by observe()'s rule and nothing else. It moves no
 * scale and never asks for a lower preset. The decision is autoWatch, beside
 * it.
 *
 * WHAT IS ASSERTED.
 *   THE RULE, in Node: autoWatch's table; the report's own machine (the
 *   timer at 8.1 ms a frame, the GPU at 6.7) asks for a higher preset after
 *   forty five seconds and not before, with the scale never touched; a GPU
 *   at half a frame, slow frames, and no fences never ask, for ten minutes;
 *   a busy moment starts the forty five seconds again; nothing here ever
 *   asks for a lower preset or a new scale; and the ask goes where
 *   autoPresetMove sends it, Low to Medium, and nowhere past a ceiling.
 *   THE SHELL, with --shell, in headless Chromium on the real page: a
 *   profile on Auto's Low boots onto the title with the timer pacing, and
 *   Auto watches its frames there; this machine (SwiftShader) has no
 *   headroom, so nothing moves: the preset, the scale and the loop are what
 *   they were. Then the three cases the watch must leave alone, each booted
 *   on its own: Timer, always; ?loop=timer; and a Steam Deck's user agent.
 *   On the base the title is never watched: warmMs stays 0.
 *
 * Usage:
 *   node scripts/autolow-check.js            the rule, Node only, instant
 *   node scripts/autolow-check.js --shell    and the page, about two minutes
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
import * as autoscale from '../src/render/autoscale.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let failed = 0;
function check(name, ok, note) {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${note ? `: ${note}` : ''}`);
  return Boolean(ok);
}

const { autoPresetMove, createAutoScale } = autoscale;
/* On the base neither exists, and that is the first thing found wrong. */
const autoWatch = typeof autoscale.autoWatch === 'function' ? autoscale.autoWatch : null;
const FRAME_MS = 1000 / 60;

/*
 * Feed one controller `ms` of frames `dtMs` apart with the GPU at `gpuMs`,
 * through the watch autoWatch picks for `watchArgs`, the way main.js does.
 * Returns what happened: whether a higher or lower preset was ever asked
 * for, when the first ask came, and whether the scale was ever moved.
 */
function feed(auto, { ms, dtMs, gpuMs, fences = true, watchArgs, busyAt = -1 }) {
  const out = { promoteAtMs: -1, demoted: false, dirty: 0, watched: 0 };
  let t = 0;
  while (t < ms) {
    const busy = busyAt >= 0 && t >= busyAt && t < busyAt + 200;
    const gate = { on: fences, samples: fences ? 100 : 0, gpuMs: busy ? 15 : gpuMs };
    const watch = autoWatch ? autoWatch(watchArgs) : 'none';
    if (watch === 'all') {
      auto.observe(dtMs, 2, 3, gate, true, FRAME_MS);
      out.watched += 1;
    } else if (watch === 'headroom' && typeof auto.observeHeadroom === 'function') {
      auto.observeHeadroom(dtMs, gate, FRAME_MS);
      out.watched += 1;
    }
    out.dirty += auto.state.dirty ? 1 : 0;
    if (auto.state.promote && out.promoteAtMs < 0) {
      out.promoteAtMs = t;
    }
    out.demoted = out.demoted || auto.state.demote;
    t += dtMs;
  }
  return out;
}

/* The report's case: the timer pacing a Low that Frame pacing's Auto chose. */
const LOW_TIMER = { timer: true, forced: false, pacing: 'auto', graphics: 'low', deviceLow: false };

function rule() {
  console.log('\nautoWatch: which watch a frame gets');
  check('autoWatch is exported by src/render/autoscale.js', autoWatch !== null);
  check('observeHeadroom is on the controller', typeof createAutoScale().observeHeadroom === 'function');
  if (autoWatch) {
    for (const g of ['low', 'medium', 'high']) {
      for (const pacing of ['auto', 'timer', 'display']) {
        check(`the display loop watches everything, ${g}, pacing ${pacing}`,
          autoWatch({ timer: false, forced: false, pacing, graphics: g, deviceLow: false }) === 'all');
      }
    }
    check('the timer pacing Low under Frame pacing Auto keeps the headroom watch', autoWatch(LOW_TIMER) === 'headroom');
    check('but not under Timer, always, a pilot\'s choice of loop',
      autoWatch({ ...LOW_TIMER, pacing: 'timer' }) === 'none');
    check('nor under ?loop=timer', autoWatch({ ...LOW_TIMER, forced: true }) === 'none');
    check('nor on a Steam Deck, a phone or an iPad, whose own default is Low',
      autoWatch({ ...LOW_TIMER, deviceLow: true }) === 'none');
    check('nor on Medium or High under the timer, which only a pilot\'s choice makes',
      autoWatch({ ...LOW_TIMER, graphics: 'medium' }) === 'none' && autoWatch({ ...LOW_TIMER, graphics: 'high' }) === 'none');
  }

  console.log('\nthe headroom watch on the report\'s machine: the timer at 8.1 ms a frame, the GPU at 6.7');
  {
    const auto = createAutoScale();
    const r = feed(auto, { ms: 60000, dtMs: 8.1, gpuMs: 6.7, watchArgs: LOW_TIMER });
    check('its frames are watched', r.watched > 0, `${r.watched} frames`);
    check('it asks for a higher preset', auto.state.promote === true);
    check('after forty five seconds of headroom and not before, with the warm up',
      r.promoteAtMs >= 45000 && r.promoteAtMs <= 45600, `${r.promoteAtMs.toFixed(0)} ms`);
    check('the scale is never moved', r.dirty === 0 && auto.state.scale === 1, `${r.dirty} moves, scale ${auto.state.scale}`);
    check('and nothing lower is ever asked for', r.demoted === false);
    const none = { demoted: false, promoted: false };
    const move = autoPresetMove('low', '', '', auto.state, none);
    check('the ask moves Low to Medium, as Auto\'s own raise', move && move.next === 'medium' && move.way === 'up' && move.raised === 'medium',
      JSON.stringify(move));
    check('and a ceiling at Low, Medium tried here before and not held, keeps it on Low',
      autoPresetMove('low', '', 'low', auto.state, none) === null);
    check('as does a session that already came down',
      autoPresetMove('low', '', '', auto.state, { demoted: true, promoted: false }) === null);
  }

  console.log('\nmachines without the headroom, for ten minutes each');
  {
    const cases = [
      ['a GPU at half a frame (8.4 ms)', { dtMs: 8.1, gpuMs: 8.4 }],
      ['a GPU at a whole frame (16 ms)', { dtMs: 16.7, gpuMs: 16 }],
      ['a timer that cannot hold 57 frames a second, with the GPU idle', { dtMs: 19, gpuMs: 2 }],
      ['no fences, so no GPU timing at all', { dtMs: 8.1, gpuMs: 1, fences: false }],
    ];
    for (const [what, c] of cases) {
      const auto = createAutoScale();
      const r = feed(auto, { ms: 600000, watchArgs: LOW_TIMER, ...c });
      check(`${what}: never asks for a higher preset`, auto.state.promote === false, `promote at ${r.promoteAtMs}`);
      check(`${what}: and moves nothing`, r.dirty === 0 && auto.state.scale === 1 && !r.demoted);
    }
  }

  console.log('\na busy moment starts the forty five seconds again');
  {
    const auto = createAutoScale();
    const r = feed(auto, { ms: 80000, dtMs: 8.1, gpuMs: 6.7, watchArgs: LOW_TIMER, busyAt: 30000 });
    check('two hundred milliseconds of a busy GPU at thirty seconds push the ask past seventy five',
      r.promoteAtMs >= 75000, `${r.promoteAtMs.toFixed(0)} ms`);
  }

  console.log('\nthe cases the watch leaves alone fly as they did: nothing watched, nothing asked');
  for (const [what, args] of [
    ['Timer, always', { ...LOW_TIMER, pacing: 'timer' }],
    ['?loop=timer', { ...LOW_TIMER, forced: true }],
    ['a Steam Deck', { ...LOW_TIMER, deviceLow: true }],
  ]) {
    const auto = createAutoScale();
    const r = feed(auto, { ms: 60000, dtMs: 8.1, gpuMs: 2, watchArgs: args });
    check(`${what}: no frame is watched`, autoWatch !== null && r.watched === 0, `${r.watched} frames`);
    check(`${what}: and nothing is asked for`, auto.state.promote === false && !r.demoted && r.dirty === 0);
  }
}

/* --------------------------------------------------------------------- */

const SETTINGS_KEY = 'webfpv.settings.v3';
const DECK_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36 Steam Deck';

/* A profile Auto has put on Low, and whatever else a case changes. */
function seedFor(extra = {}) {
  return `try {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
    Object.assign(s, { graphics: 'low', graphicsAuto: true, graphicsAutoMeasured: true, airframeAsked: true }, ${JSON.stringify(extra)});
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s));
  } catch (e) { /* the run boots on the defaults */ }`;
}

const NO_BOARD = `(() => {
  const real = window.fetch.bind(window);
  const theirs = (u) => { try { const x = new URL(u, location.href); return x.origin !== location.origin; } catch (e) { return false; } };
  window.fetch = (input, opts) => {
    const url = String(input && input.url ? input.url : input);
    return theirs(url) && /\\/api\\//.test(url) ? Promise.reject(new TypeError('Failed to fetch')) : real(input, opts);
  };
  navigator.sendBeacon = () => true;
})();`;

const LOOK = `(() => {
  const a = window.__auto();
  return {
    loop: window.__loopNow(), screen: window.__ui ? window.__ui.screen : null,
    graphics: a.graphics, auto: a.auto, factor: a.factor, scale: a.scale,
    warmMs: a.warmMs, dtEma: a.dtEma, easyFullMs: a.easyFullMs,
    promote: a.promote, demote: a.demote, gpuMs: a.gate.gpuMs, samples: a.gate.samples, on: a.gate.on,
  };
})()`;

/* Boot one profile onto the title, watch it for `ms`, and say what Auto
 * made of it at the start and the end. */
async function bootAndWatch({ extra = {}, url = '/index.html', ua = null, ms = 8000 }) {
  const { openPage } = await import('../tests/lib/page.js');
  const seed = [NO_BOARD, seedFor(extra)];
  if (ua) {
    seed.unshift(`Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ${JSON.stringify(ua)} });`);
  }
  const page = await openPage({ root, width: 640, height: 360, url, seed });
  try {
    await page.until('!!window.__shellReady && window.__ui && window.__ui.screen === "title"', 180000);
    await page.sleep(1500);
    const first = await page.evaluate(LOOK);
    await page.sleep(ms);
    const last = await page.evaluate(LOOK);
    return { first, last, errors: page.errors.filter((e) => !/api\/|ERR_CONNECTION_REFUSED|Failed to fetch/.test(e)) };
  } finally {
    await page.close();
  }
}

const fmt = (v) => JSON.stringify({
  loop: v.loop, graphics: v.graphics, factor: v.factor, warmMs: Math.round(v.warmMs), dtEma: +v.dtEma.toFixed(1),
  easyFullMs: Math.round(v.easyFullMs), promote: v.promote, demote: v.demote, gpuMs: +v.gpuMs.toFixed(1),
});

async function shell() {
  try {
    console.log('\n in the shell: a profile on Auto\'s Low, Frame pacing on Auto, on the title');
    const r = await bootAndWatch({});
    console.log(`    first ${fmt(r.first)}\n    last  ${fmt(r.last)}`);
    check('the title is paced by the timer, as Low is under Frame pacing Auto', r.first.loop === 'timer' && r.last.loop === 'timer');
    check('and Auto is on, drawing at Low', r.first.auto === true && r.first.graphics === 'low');
    check('Auto watches the title\'s frames: past its warm up', r.last.warmMs >= 500, `warmMs ${Math.round(r.last.warmMs)}`);
    check('and its frame average has left its starting sixty hertz',
      Math.abs(r.last.dtEma - FRAME_MS) > 0.5, `dtEma ${r.last.dtEma.toFixed(2)} ms`);
    check('this machine has no headroom to promote on (a precondition: the GPU over 45 percent of a frame)',
      r.last.on && r.last.samples >= 10 && r.last.gpuMs > 0.45 * FRAME_MS, `GPU ${r.last.gpuMs.toFixed(1)} ms`);
    check('so nothing moves: still Low, full scale, the timer, nothing asked for',
      r.last.graphics === 'low' && r.last.factor === 1 && r.last.scale === 1 && r.last.loop === 'timer'
        && !r.last.promote && !r.last.demote);
    check('and no page error', r.errors.length === 0, r.errors.slice(0, 3).join(' | '));

    for (const [what, opts] of [
      ['Timer, always', { extra: { pacing: 'timer' } }],
      ['?loop=timer', { url: '/index.html?loop=timer' }],
      ['a Steam Deck\'s user agent', { ua: DECK_UA }],
    ]) {
      console.log(`\n in the shell: ${what}, on Auto's Low`);
      const c = await bootAndWatch({ ...opts, ms: 5000 });
      console.log(`    last  ${fmt(c.last)}`);
      check(`${what}: the timer paces the title`, c.last.loop === 'timer');
      check(`${what}: Auto does not watch it, as before`, c.last.warmMs === 0 && c.last.easyFullMs === 0, `warmMs ${Math.round(c.last.warmMs)}`);
      check(`${what}: still Low at full scale`, c.last.graphics === 'low' && c.last.factor === 1);
    }
  } catch (e) {
    check('the shell run completes', false, e.message);
  }
}

rule();
if (process.argv.includes('--shell')) {
  await shell();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
