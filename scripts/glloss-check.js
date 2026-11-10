/*
 * glloss-check.js: a graphics context the browser takes away and does not
 * give back is said, to the pilot on screen and in the bug report.
 *
 * THE TICKETS. bug-44d3b178 (2026-11-06, "i cannot see its fully blank"),
 * bug-dda2725a ("fine for just 15 miutes exacly then it goes blank but the
 * uid i still can see") and bug-97c1f894 ("my screen goes black but i can
 * see the HUD and music"), all an Intel HD Graphics 620 on Bardwell's yard
 * at Low. A context lost and never restored is every one of those symptoms:
 * forced here with WEBGL_lose_context, the frames stop drawing while the
 * plant, the OSD and the sound run on. Before this nothing said so. The
 * banner said nothing, and the report carried no sign of it, so three
 * tickets could not be told from a renderer bug. Chrome refuses a restore to
 * a page it blames for a GPU reset, so the pilot's way back is a reload, and
 * the banner says so.
 *
 * WHAT IT DOES, in headless Chromium on the real shell, flying: a loss the
 * browser restores at once says nothing on screen and is counted; a loss
 * left open is said by the banner after GL_LOSS_SAY_MS and not at once,
 * the report says it is open and for how long, and the plant is still
 * running underneath (which is the symptom); a restore takes the banner
 * away, the frames draw again and the report says so.
 *
 * Usage: node scripts/glloss-check.js
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
/* src/main.js's GL_LOSS_SAY_MS. */
const SAY_MS = 3000;
const SAID = /graphics card stopped drawing/;

const rows = [];
let failed = 0;
function check(name, ok, detail) {
  rows.push(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail !== undefined ? `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  if (!ok) {
    failed += 1;
  }
  console.log(rows[rows.length - 1]);
}

const page = await openPage({ root: ROOT, width: 640, height: 360, url: '/index.html' });
const ev = async (expr) => {
  const res = await page.cdp.send('Runtime.evaluate', {
    expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true,
  }, page.sessionId);
  if (res.exceptionDetails) {
    throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 900));
  }
  return res.result.value;
};
/* What the pilot and a report see now. */
const look = () => ev(`const snap = window.__ui.bugSnapshot();
  return { banner: window.__ui.banner.textContent, gl: snap.perf ? snap.perf.gl : undefined,
    drawn: window.__auto().gate.drawn, simMs: window.__stickPath().moduleMs, lost: window.__glExt.gl.isContextLost() };`);
/* The banner's words sampled for `ms`, every 200 ms, with when each was seen. */
async function watch(ms) {
  const out = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    out.push({ t: Date.now() - t0, ...(await look()) });
    await page.sleep(200);
  }
  return out;
}

try {
  await page.until('!!window.__shellReady', 180000);
  await ev("const ui = window.__ui; ui.settings.graphics = 'low'; ui.onAction('fly', ui.settings); return 1;");
  await page.until('window.__map && window.__map() && window.__map().ready', 240000);
  await page.sleep(1500);
  await ev("window.__ui.act('fly'); return 1;");
  for (let i = 0; i < 120; i += 1) {
    const st = await ev("const d = document.querySelector('.name-dialog'); return { mode: window.__mode, screen: window.__ui.screen, picker: Boolean(d && !d.hidden && document.querySelector('.qp-page')) };");
    if (st.mode === 'flight' && st.screen === 'flight') {
      break;
    }
    if (st.picker) {
      await page.sleep(450);
      await page.tap('Enter');
    }
    await page.sleep(1000);
  }
  /* In the air and hovering, so the plant is stepping and nothing else
   * (a launch prompt, the takeoff line) owns the banner for long. */
  await ev("window.__placeCraft(0, 6, 0); window.__stick(0, 0, 0, 0.36); return 1;");
  await page.sleep(2500);
  await ev(`const c = document.getElementById('view'); const gl = c.getContext('webgl2') || c.getContext('webgl');
    window.__glExt = { gl, lose: gl.getExtension('WEBGL_lose_context') }; return Boolean(window.__glExt.lose);`);

  const start = await look();
  check('flying, the report counts no loss', start.gl && start.gl.lost === 0 && start.gl.restored === 0
    && start.gl.lostNow === false && start.gl.lostForS === null, start.gl);

  console.log('\n a loss the browser gives back at once');
  await ev('window.__glExt.lose.loseContext(); return 1;');
  await page.sleep(150);
  await ev('window.__glExt.lose.restoreContext(); return 1;');
  const quick = await watch(SAY_MS + 1500);
  check('says nothing on screen', quick.every((x) => !SAID.test(x.banner)),
    quick.filter((x) => SAID.test(x.banner)).map((x) => x.t));
  const q = quick[quick.length - 1];
  check('and is counted, lost and restored', q.gl && q.gl.lost === 1 && q.gl.restored === 1 && q.gl.lostNow === false, q.gl);
  check('and the frames draw again', !q.lost && q.drawn > quick[0].drawn, `drawn ${quick[0].drawn} to ${q.drawn}`);

  console.log('\n a loss left open, as Chrome leaves it after a GPU reset it blames on the page');
  await ev('window.__glExt.lose.loseContext(); return 1;');
  const open = await watch(SAY_MS + 2500);
  const firstSaid = open.find((x) => SAID.test(x.banner));
  check(`the banner says it, after ${SAY_MS} ms and not at once`,
    Boolean(firstSaid) && firstSaid.t >= SAY_MS - 600 && firstSaid.t <= SAY_MS + 1500,
    firstSaid ? `first at ${firstSaid.t} ms: ${JSON.stringify(firstSaid.banner)}` : 'never');
  const o = open[open.length - 1];
  check('and is still saying it', SAID.test(o.banner) && /Reload/.test(o.banner), o.banner);
  check('the report says a loss is open, and for how long', o.gl && o.gl.lost === 2 && o.gl.restored === 1
    && o.gl.lostNow === true && o.gl.lostForS >= Math.floor(SAY_MS / 1000), o.gl);
  check('the plant runs on under it, which is the tickets\' symptom', o.lost && o.simMs > open[0].simMs + 2000,
    `sim ${open[0].simMs} to ${o.simMs} ms`);
  check('and nothing is drawn', o.drawn === open[2].drawn, `drawn ${open[2].drawn} to ${o.drawn}`);

  console.log('\n then the browser gives it back');
  await ev('window.__glExt.lose.restoreContext(); return 1;');
  const back = await watch(3000);
  const b = back[back.length - 1];
  check('the banner lets it go', !SAID.test(b.banner), b.banner);
  check('the report says restored', b.gl && b.gl.lost === 2 && b.gl.restored === 2 && b.gl.lostNow === false
    && b.gl.lostForS === null, b.gl);
  check('and the frames draw again', !b.lost && b.drawn > back[0].drawn, `drawn ${back[0].drawn} to ${b.drawn}`);
  const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|favicon/.test(e));
  check('no page error', errs.length === 0, errs.slice(0, 4));
} catch (e) {
  check('the run completes', false, e.message);
} finally {
  await page.close();
}

console.log(`\n${rows.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
