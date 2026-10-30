/*
 * ball-door-check.js: Quad Ball's door (src/ui/dogfightpages.js
 * askBallHow) in the real page, headless Chromium. Picking Quad Ball on the
 * map selector opens it; each way out reaches the right call: bots flies,
 * make a game and quick match carry the match's rules to the room, a code
 * goes to the join, and a bad code stays on the page.
 *
 *   node scripts/ball-door-check.js
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
import { answerQuadPicker, openPage } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => {
  setTimeout(r, ms);
});
let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) {
    failures += 1;
  }
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

const page = await openPage({ root: ROOT, width: 1280, height: 720, url: '/index.html?mp=1' });
const ev = async (body) => {
  const r = await page.cdp.send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true }, page.sessionId);
  if (r.exceptionDetails) {
    throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
  }
  return r.result.value;
};
const until = async (b, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ev(b)) {
      return true;
    }
    await sleep(200);
  }
  return false;
};
const click = (sel) => ev(`document.querySelector('${sel}').click(); return 1`);
const calls = () => ev('return window.__calls.map((c) => c.join(":")).join(" | ")');
try {
  await until("return Boolean(window.__ui && window.__ui.screen === 'title')", 120000);
  await ev("window.__ui.pickerShelfChosen('maps'); return 1;");
  await until('return Boolean(window.__ui.pickerLib)', 60000);
  await sleep(500);
  await ev(`window.__calls = []; const u = window.__ui;
    u.onFlyTogether = (e) => window.__calls.push(['make', e.game, e.rules.size]);
    u.onQuickBall = (e) => window.__calls.push(['quick', e.game, e.rules.size]);
    u.onJoinCode = (c) => window.__calls.push(['join', c]);
    window.__e = u.pickerEntries().find((e) => e.item && e.item.action === 'map:ball'); return 1;`);
  const open = async () => {
    await ev("window.__ui.pickerAction('fly', window.__e); return 1;");
    const ok = await until("return Boolean(document.querySelector('.df-door'))", 20000);
    await sleep(500);
    return ok;
  };
  check('the door opens when Quad Ball is flown from the map selector', await open());
  await ev("[...document.querySelectorAll('.df-chip')].find((b) => b.textContent === 'Make a game').click(); return 1");
  check('Make a game asks Set the match for a private game', await until("return Boolean(document.querySelector('.df-rows'))", 8000)
    && (await ev("return document.querySelector('.qp-kicker').textContent")) === 'Quad Ball, private game');
  await sleep(500);
  await click('.qp-fly');
  await sleep(300);
  check('and opens a ball room with the rules', (await calls()) === 'make:ball:2', await calls());
  await open();
  await click('.df-doorcard:nth-child(3)');
  await until("return Boolean(document.querySelector('.df-rows'))", 8000);
  await sleep(500);
  await click('.qp-fly');
  await sleep(300);
  check('Quick match carries the rules to quickBall', (await calls()).endsWith('quick:ball:2'), await calls());
  await open();
  await ev("const c = document.querySelector('.df-code'); c.value = 'kx49qp'; c.dispatchEvent(new Event('input')); [...document.querySelectorAll('.df-chip')].find((b) => b.textContent === 'Join').click(); return 1");
  await sleep(300);
  check('a code is joined, upper case', (await calls()).endsWith('join:KX49QP'), await calls());
  await open();
  await ev("const c = document.querySelector('.df-code'); c.value = 'ab'; c.dispatchEvent(new Event('input')); [...document.querySelectorAll('.df-chip')].find((b) => b.textContent === 'Join').click(); return 1");
  await sleep(300);
  check('a short code stays on the page, marked', await ev("return Boolean(document.querySelector('.df-code.is-bad'))"));
  await page.tap('Escape');
  await sleep(300);
  await page.tap('Escape');
  await sleep(300);
  check('Back leaves the door and nothing more was called', await ev("return !document.querySelector('.df-door')") && (await ev('return window.__calls.length')) === 3);
  await open();
  await click('.df-doorcard:nth-child(1)');
  await until("return Boolean(document.querySelector('.df-rows'))", 8000);
  await sleep(500);
  await click('.qp-fly');
  await answerQuadPicker(page).catch(() => {});
  check('Bots flies the solo match', await until("return Boolean(window.__dogfight && window.__dogfight())", 150000));
} catch (e) {
  failures += 1;
  console.log(`  FAIL  ${e.message}`);
}
await page.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
