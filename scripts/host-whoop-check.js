/*
 * host-whoop-check.js: Host a room from the front screen still hosts when
 * the pilot's last flight was whoop racing.
 *
 * The owner, 2026-11-10: "i clicked host a room and nothing happened". Host
 * a room opens the Maps shelf, which flies the five inch, so a pilot last
 * on the whoop is seated on the five inch first. That swap shows the title
 * for a moment (main.js syncWorld) because no picker is open yet, show()
 * ends hosting on any screen that is not a card screen, and the maps came
 * up with Fly this on them instead of Host a room here. He flew solo.
 *
 * Usage: node scripts/host-whoop-check.js
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

/* Last flown: whoop racing, the aircraft question answered. */
const seed = [`try {
  const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
  s.airframe = 'whoop65'; s.airframeAsked = true; s.graphics = 'low'; s.graphicsAuto = false;
  localStorage.setItem('webfpv.settings.v3', JSON.stringify(s));
} catch (e) { /* the run boots on the defaults */ }`];

async function main() {
  const page = await openPage({ root: ROOT, width: 960, height: 540, url: '/index.html?edition=web', seed });
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
  const until = async (expr, ms) => {
    for (let t = 0; t < ms; t += 250) {
      if (await ev(`return Boolean(${expr})`)) {
        return true;
      }
      await sleep(250);
    }
    return false;
  };
  let fails = 0;
  const check = (what, ok, got) => {
    fails += ok ? 0 : 1;
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}: ${got}`);
  };
  /* A card by its class, clicked the way a mouse does. */
  const click = (sel) => ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (el) el.click(); return Boolean(el);`);
  try {
    await until('window.__shellReady === true', 120000);
    await until('window.__map && window.__map().ready === true', 60000);
    /* The first run's keyboard or pad question, if it is up. */
    if (await click('.gate-card-hands-keys')) {
      await sleep(800);
    }
    check('the pilot is on the whoop', await ev('return window.__ui.settings.airframe') === 'whoop65', await ev('return window.__ui.settings.airframe'));
    await click('.gate-card-together');
    check('Multiplayer opens its page', await until("document.querySelector('.gate-card-mp-host')", 8000), await ev('return window.__ui.gatePage'));
    await click('.gate-card-mp-host');
    /* A pilot nobody has met yet is asked who they are first. */
    if (await until("document.querySelector('#tg [data-k=keep]')", 8000)) {
      await click('#tg [data-k=keep]');
    }
    const hosting = await until("window.__ui.screen === 'freestyle' && window.__ui.hostPick && document.querySelector('.room-picker.is-hosting')", 20000);
    await sleep(1500);
    check('Host a room opens the maps, hosting', hosting && Boolean(await ev('return window.__ui.hostPick')),
      await ev('return `${window.__ui.screen} ${JSON.stringify(window.__ui.hostPick)} ${window.__ui.settings.airframe}`'));
    await until("document.querySelector('.wp-card')", 15000);
    await ev("window.__ui.picker.select('map:bardwell'); return 1;");
    await sleep(400);
    const acts = await ev("return [...document.querySelectorAll('.wp-act')].map((b) => b.textContent).join()");
    check('and the map\'s one button is Host a room here', acts === 'Host a room here', acts);
  } finally {
    await page.close?.();
  }
  console.log(`\nhost-whoop-check: ${fails} failed`);
  process.exit(fails);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
