/*
 * latency-probe.js: key to screen under the conditions a pilot's machine is
 * really in, for the Steam against browser question (2026-11-19).
 *
 * WHY THIS EXISTS. The Steam build is this same page in Electron, which is
 * Chromium. So on a clean machine the two pipelines are the same code, and
 * any difference comes from what else shares the browser: other tabs and
 * windows, extensions injected into the page, and the browser's own power
 * savings. This drives the real shell in headless Chromium, presses a key
 * the way a pilot does, and reads two numbers per press:
 *
 *   - the sim's own Input to screen (Event Timing duration, latency.js),
 *     which is what Settings shows a pilot;
 *   - event to frame done: from the key's hardware timestamp to the end of
 *     the first frame callback after it, measured in the page, which is
 *     finer than Event Timing's 8 ms grain.
 *
 * It is a PROXY. There is no GPU here: SwiftShader rasterises on the same
 * four cores the other tabs run on, so contention is exaggerated, and the
 * headless compositor is not a real one. Read the ratios between rows,
 * never the milliseconds, and confirm on a real machine with the sim's own
 * reading (the recipe is in PROGRESS.md).
 *
 *   node scripts/latency-probe.js [scenario ...]
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PRESSES = Number(process.env.PRESSES || 60);

/* In the page before the app: every key's timestamp, and the end of the
 * first frame callback after it, whichever loop drives the frame. */
const PROBE = `
(() => {
  const pending = [];
  const rows = window.__probeRows = [];
  addEventListener('keydown', (e) => { if (e.code === 'KeyP') pending.push(e.timeStamp); }, true);
  const raf = window.requestAnimationFrame.bind(window);
  const iv = window.__probeIv = [];
  let last = 0;
  window.requestAnimationFrame = (cb) => raf((t) => {
    const start = performance.now();
    if (last) iv.push(start - last);
    last = start;
    const took = pending.splice(0);
    cb(t);
    const end = performance.now();
    for (const ts of took) rows.push({ wait: start - ts, done: end - ts });
  });
  const et = window.__probeEt = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.name === 'keydown') et.push({ dur: e.duration, delay: e.processingStart - e.startTime });
    }
  }).observe({ type: 'event', durationThreshold: 16 });
})();`;

/* What a tab does. A background tab in Chrome gets about one timer a
 * second; a tab in another visible window (Discord, a stream, a video)
 * paints every frame. */
const BACKGROUND_TAB = `data:text/html,<script>setInterval(()=>{const e=performance.now()+15;while(performance.now()<e){}},1000)</script>`;
const ACTIVE_TAB = `data:text/html,<canvas id=c width=1280 height=720></canvas><div style="width:200px;height:200px;background:red;animation:s 1s linear infinite"></div><style>@keyframes s{to{transform:rotate(360deg)}}</style><script>
const g=document.getElementById('c').getContext('2d');let n=0;
(function f(){n++;for(let i=0;i<400;i++){g.fillStyle='hsl('+((i+n)%360)+',80%,50%)';g.fillRect((i*37+n)%1280,(i*53)%720,40,40)}requestAnimationFrame(f)})();
setInterval(()=>{const e=performance.now()+5;while(performance.now()<e){}},50);
</script>`;
/* An extension's content script: a MutationObserver on the whole page and
 * a little periodic work, which is what most of them amount to. */
const EXTENSION = `addEventListener('DOMContentLoaded',()=>{new MutationObserver((m)=>{let k=0;for(const r of m)k+=r.addedNodes.length;}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});setInterval(()=>{const e=performance.now()+3;while(performance.now()<e){}document.querySelectorAll('a,img').length},250);});`;

const SCENARIOS = {
  quiet: { what: 'the sim alone (the Steam build\'s case)' },
  steamflags: { what: 'alone, Electron style flags (no background throttling)', args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] },
  uncapped: { what: 'alone, frame rate limit and vsync off', args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] },
  bgtabs: { what: '20 background tabs', tabs: { bg: 20 } },
  busy: { what: '20 background tabs, 2 active pages, an extension', tabs: { bg: 20, active: 2 }, ext: true },
  lowend: { what: 'the sim alone, CPU slowed 4x', throttle: 4 },
  lowendbusy: { what: 'busy, CPU slowed 4x', tabs: { bg: 20, active: 2 }, ext: true, throttle: 4 },
};

function stats(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { n: s.length, mean: +mean.toFixed(1), p50: +q(0.5).toFixed(1), p90: +q(0.9).toFixed(1) };
}

async function run(name) {
  const sc = SCENARIOS[name];
  const seed = [PROBE];
  if (sc.ext) seed.push(EXTENSION);
  const page = await openPage({
    root: ROOT, width: 480, height: 270, url: `/index.html?loop=${process.env.LOOP || 'display'}`, seed, args: sc.args || [],
  });
  const { cdp, sessionId } = page;
  const ev = (expr) => page.evaluate(`(async()=>{${expr}})()`);
  try {
    for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady').catch(() => false)); i += 1) await sleep(500);
    await ev(`const ui = window.__ui; ui.settings.map = 'field'; ui.settings.graphics = 'low';
      ui.onAction('fly', ui.settings); return 1;`);
    for (let i = 0; i < 260; i += 1) {
      const m = await ev('return window.__map ? window.__map() : null').catch(() => null);
      if (m && m.ready) break;
      await sleep(500);
    }
    const t = sc.tabs || {};
    for (let i = 0; i < (t.bg || 0); i += 1) await cdp.send('Target.createTarget', { url: BACKGROUND_TAB, background: true });
    for (let i = 0; i < (t.active || 0); i += 1) await cdp.send('Target.createTarget', { url: ACTIVE_TAB, newWindow: true, background: true });
    if (sc.throttle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: sc.throttle }, sessionId);
    await sleep(4000);
    await ev('window.__probeRows.length = 0; window.__probeEt.length = 0; window.__probeIv.length = 0; return 1;');
    for (let i = 0; i < PRESSES; i += 1) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 }, sessionId);
      await sleep(40);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 }, sessionId);
      await sleep(120 + ((i * 37) % 90));
    }
    await sleep(800);
    const out = await ev('return { rows: window.__probeRows, et: window.__probeEt, iv: window.__probeIv }');
    return {
      name,
      what: sc.what,
      wait: stats(out.rows.map((r) => r.wait)),
      done: stats(out.rows.map((r) => r.done)),
      et: stats(out.et.map((r) => r.dur)),
      etReported: out.et.length,
      frame: stats(out.iv),
      delay: stats(out.et.map((r) => r.delay)),
      errors: page.errors.slice(0, 3),
    };
  } finally {
    await page.close();
  }
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOS);
const results = [];
for (const n of names) {
  const r = await run(n);
  results.push(r);
  console.log(JSON.stringify(r));
}
console.log('\nscenario      frame p50/p90   to frame start p50/p90   to frame done p50/p90   Input to screen p50/p90 (n)');
for (const r of results) {
  const f = (s) => (s ? `${s.p50}/${s.p90}` : 'n/a');
  console.log(`${r.name.padEnd(13)} ${f(r.frame).padEnd(15)} ${f(r.wait).padEnd(24)} ${f(r.done).padEnd(23)} ${f(r.et)} (${r.etReported})`);
}
