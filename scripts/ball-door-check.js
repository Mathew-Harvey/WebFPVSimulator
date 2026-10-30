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


/* Phone sizes, each on a fresh page: every card and the buttons are
 * reachable without the page itself scrolling sideways. */
async function phone(w, h) {
  const pg = await openPage({ root: ROOT, width: w, height: h, url: '/index.html?mp=1' });
  const pev = async (body) => {
    const r = await pg.cdp.send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true }, pg.sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
    }
    return r.result.value;
  };
  const puntil = async (b, ms = 30000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await pev(b)) {
        return true;
      }
      await sleep(200);
    }
    return false;
  };
  try {
    await puntil("return Boolean(window.__ui && window.__ui.screen === 'title')", 120000);
    await pev("window.__ui.pickerShelfChosen('maps'); return 1;");
    await puntil('return Boolean(window.__ui.pickerLib)', 60000);
    await sleep(500);
    await pev("const u = window.__ui; u.pickerAction('fly', u.pickerEntries().find((e) => e.item && e.item.action === 'map:ball')); return 1;");
    check(`at ${w} by ${h} the door opens`, await puntil("return Boolean(document.querySelector('.df-door'))", 20000));
    await sleep(600);
    const fit = await pev(`const out = []; const vw = innerWidth; const vh = innerHeight;
      for (const e of document.querySelectorAll('.df-page .qp-btn, .df-doorcard h3, .df-code')) {
        const r = e.getBoundingClientRect();
        if (r.left < -1 || r.right > vw + 1) out.push('wide ' + (e.textContent || e.className));
      }
      const b = document.querySelector('.df-page .qp-fly').getBoundingClientRect();
      if (b.bottom > vh + 1 || b.top < 0) out.push('button off screen at ' + Math.round(b.top));
      const d = document.querySelector('.df-door');
      if (d.scrollHeight > d.clientHeight + 1 && !/auto|scroll/.test(getComputedStyle(d).overflowY)) out.push('cards cut');
      return out.join(', ');`);
    check(`at ${w} by ${h} nothing is cut off`, fit === '', fit);
    if (process.env.BALL_DOOR_SHOTS) {
      const { data } = await pg.cdp.send('Page.captureScreenshot', { format: 'png' }, pg.sessionId);
      (await import('node:fs')).writeFileSync(join(process.env.BALL_DOOR_SHOTS, `door-${w}x${h}.png`), Buffer.from(data, 'base64'));
    }
  } finally {
    await pg.close();
  }
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

  /* The second visit: back on the map cards, Quad Ball asks again. */
  await ev("window.__ui.act('pause'); return 1;");
  await sleep(300);
  await ev("window.__ui.pickerShelfChosen('maps'); return 1;");
  await until("return Boolean(window.__ui.pickerEntries && window.__ui.pickerEntries().length)", 20000);
  await sleep(500);
  await ev("window.__e = window.__ui.pickerEntries().find((e) => e.item && e.item.action === 'map:ball'); return 1;");
  check('flown once, Quad Ball still opens its door the next time', await open());
  const label = () => ev("return document.querySelector('.df-page .qp-fly').textContent");
  check('the big button says what Enter will do', (await label()) === 'Play with bots', await label());
  await page.tap('ArrowRight');
  await sleep(150);
  check('right moves to friends, and the button says Make a game', (await label()) === 'Make a game', await label());
  await page.tap('KeyK');
  await sleep(150);
  check('typing a letter types a code, and the button says Join', await ev("return document.activeElement === document.querySelector('.df-code')") && (await label()) === 'Join', await label());
  await page.tap('Escape');
  await sleep(150);
  await page.tap('ArrowDown');
  await sleep(150);
  check('down moves on too, to Quick match', (await label()) === 'Quick match', await label());
  await ev("const c = document.querySelector('.df-code'); c.value = ''; c.dispatchEvent(new Event('input')); [...document.querySelectorAll('.df-chip')].find((b) => b.textContent === 'Join').focus(); return 1;");
  await page.tap('Enter');
  await sleep(200);
  check('Enter on Join with no code asks for the code, it does not make a game', await ev("return Boolean(document.querySelector('.df-door')) && document.activeElement === document.querySelector('.df-code')") && (await ev('return window.__calls.length')) === 3);
  await ev("document.activeElement.blur(); return 1;");
  await page.tap('Escape');
  await sleep(300);
  check('Escape still leaves the door', await ev("return !document.querySelector('.df-door')"));

  /* Back from the quad page after Bots: the next Fly asks again. */
  await open();
  await click('.df-doorcard:nth-child(1)');
  await until("return Boolean(document.querySelector('.df-rows'))", 8000);
  await sleep(500);
  await click('.qp-fly');
  await until("return Boolean(document.querySelector('.qp-page')) && !document.querySelector('.df-page')", 20000);
  await sleep(500);
  await page.tap('Escape');
  await sleep(500);
  check('Back on the quad page drops the door\'s answer', await ev('return window.__ui.fightPick === null'));
  check('so the next Fly opens the door again', await open());
  await page.tap('Escape');
  await sleep(300);

  /* Mini games with friends opens the door on its middle card. */
  await ev("window.__ui.act('menu'); return 1;");
  await sleep(500);
  await ev("window.__ui.playMapGame('ball', true); return 1;");
  check('Mini games with friends opens the door on Play with friends', await until("return Boolean(document.querySelector('.df-doorcard.is-at')) && document.querySelector('.df-doorcard.is-at') === document.querySelectorAll('.df-doorcard')[1]", 30000));
  await page.tap('Escape');
  await sleep(300);

} catch (e) {
  failures += 1;
  console.log(`  FAIL  ${e.message}`);
}
await page.close();
try {
  await phone(844, 390);
  await phone(390, 844);
} catch (e) {
  failures += 1;
  console.log(`  FAIL  ${e.message}`);
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
