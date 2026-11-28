/*
 * steam-check.js: the Get it on Steam buttons and the Browser or Steam page.
 *
 * WHY THIS EXISTS. The Steam edition went on sale on 2026-11-27 and the
 * browser game's three Steam buttons went on saying "Wishlist on Steam" and
 * "coming to Steam" for a day, because nothing checked what they said. The
 * owner's plan of 2026-11-28 changed the words, put a page of reasons
 * between a menu button and the store, and counted each press by where it
 * was made. This is the check that sees all of it in a real page:
 *
 *   - the title's sticker says Get it on Steam, and nothing on the page
 *     says wishlist or coming to Steam;
 *   - nothing of the page's is fetched before it is opened (the module and
 *     the two pictures), which is the bandwidth rule;
 *   - a press on the sticker opens the page and leaves for nowhere;
 *   - the page has its six panels, its two pictures, and a store link
 *     tagged with the button that opened it;
 *   - while it is up a menu key does not reach the menu behind it, Escape
 *     closes it, and a pad's Back closes it;
 *   - a press on its store link sends one steam_click, sim-title;
 *   - the About room's row opens the same page, tagged about;
 *   - in the Steam edition there is no sticker, no row, and the page will
 *     not open.
 *
 * Usage: node scripts/steam-check.js [--shots=DIR]. Exit code is the number
 * of failures. --shots writes pictures of the page for a person to look at.
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


import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) || '').slice(8);

async function open(url, width, height) {
  const page = await openPage({ root: ROOT, width, height, url });
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
  const shot = async (name) => {
    if (!SHOTS) {
      return;
    }
    mkdirSync(SHOTS, { recursive: true });
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
  };
  await page.until('Boolean(window.__ui) && window.__ui.screen === "title"', 120000);
  await sleep(800);
  return { page, ev, shot };
}

/* What the page has asked the network for that is the Steam page's own. */
const FETCHED = `return performance.getEntriesByType('resource').map((e) => e.name)
  .filter((n) => /steampage[.]js|assets[/]steam[/]/.test(n)).length;`;

const PAGE = `
  const p = document.querySelector('.steam-page');
  if (!p) { return null; }
  const buy = p.querySelector('a.steam-page-buy');
  return {
    title: p.querySelector('.steam-page-title').textContent,
    panels: [...p.querySelectorAll('.steam-page-name')].map((n) => n.textContent),
    shots: p.querySelectorAll('img.steam-page-shot').length,
    href: buy ? buy.href : '',
    words: p.textContent,
    focus: document.activeElement === buy,
    fits: p.querySelector('.steam-page-sheet').getBoundingClientRect().width <= window.innerWidth,
  };`;

async function main() {
  let fails = 0;
  const check = (ok, what, got) => {
    fails += ok ? 0 : 1;
    console.log(`     ${ok ? 'pass' : 'FAIL'}  ${what}${got ? `: ${got}` : ''}`);
  };
  let web = null;
  let steam = null;
  try {
    console.log('  the browser edition');
    web = await open('/index.html', 1280, 800);
    const { ev, shot } = web;
    const sticker = await ev(`const a = document.querySelector('.brand-chips a.steam-wishlist');
      return a ? { words: a.textContent, href: a.href, note: a.title } : null;`);
    check(Boolean(sticker) && sticker.words === 'Get it on Steam', 'the title wears a sticker that says Get it on Steam', sticker ? sticker.words : 'none');
    check(Boolean(sticker) && sticker.href === 'https://store.steampowered.com/app/4944190/webFPV/?utm_source=sim&utm_campaign=title',
      'its address is still the store page, for a middle click', sticker ? sticker.href : '');
    const stale = await ev('return (document.body.innerText.match(/wishlist|coming to steam/gi) || []).length');
    check(stale === 0, 'nothing on the title says wishlist or coming to Steam', `${stale}`);
    check((await ev(FETCHED)) === 0, 'nothing of the page is fetched before it is opened', '');

    await ev(`window.__beacons = [];
      navigator.sendBeacon = (u, b) => { b.text().then((t) => window.__beacons.push(t)); return true; };
      window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; };
      return 1;`);
    const before = await ev('return location.href');
    await ev("document.querySelector('.brand-chips a.steam-wishlist').click(); return 1;");
    await web.page.until("Boolean(document.querySelector('.steam-page'))", 10000).catch(() => {});
    await sleep(600);
    const p = await ev(PAGE);
    check(Boolean(p) && (await ev('return location.href')) === before && (await ev('return window.__opened.length')) === 0,
      'a press on it opens the page and leaves for nowhere', p ? p.title : 'no page');
    check(Boolean(p) && p.title === 'Browser or Steam?' && p.panels.length === 6, 'the page has its title and six panels', p ? p.panels.join(', ') : '');
    check(Boolean(p) && p.shots === 2 && (await ev(FETCHED)) >= 3, 'and its two pictures, asked for now', '');
    check(Boolean(p) && p.href === 'https://store.steampowered.com/app/4944190/webFPV/?utm_source=sim&utm_campaign=title',
      'its store link is tagged with the button that opened it', p ? p.href : '');
    check(Boolean(p) && p.focus && p.fits, 'the store link has the focus and the sheet fits the window', '');
    check(Boolean(p) && !/achievement|leaderboard|wishlist|workshop|deck/i.test(p.words),
      'it names nothing the Steam build does not have yet', '');
    check(Boolean(p) && /free in your browser, and it stays free/.test(p.words), 'and says the browser game stays free', '');
    check((await ev('return window.__beacons.length')) === 0, 'opening it counted no click: nobody has left yet', '');
    await shot('steam-page-1280');

    /* A menu key while it is up must not move the menu behind it. */
    const screenBefore = await ev('return window.__ui.screen');
    const cursorBefore = await ev('return document.querySelector(".gate-card.on, .row.on") ? document.querySelector(".gate-card.on, .row.on").textContent : ""');
    await web.page.tap('ArrowRight');
    await web.page.tap('ArrowDown');
    await sleep(300);
    const cursorAfter = await ev('return document.querySelector(".gate-card.on, .row.on") ? document.querySelector(".gate-card.on, .row.on").textContent : ""');
    check(cursorBefore === cursorAfter, 'an arrow key while it is up does not step the menu behind it', '');
    check((await ev('return window.__ui.screen')) === screenBefore && Boolean(await ev(PAGE)),
      'and the menu is still where it was, with the page up', await ev('return window.__ui.screen'));

    await ev("document.querySelector('.steam-page a.steam-page-buy').addEventListener('click', (e) => e.preventDefault()); document.querySelector('.steam-page a.steam-page-buy').click(); return 1;");
    await sleep(300);
    const sent = await ev('return window.__beacons');
    check(sent.length === 1 && sent[0] === '{"v":1,"kind":"steam_click","place":"sim-title"}', 'a press on its store link sends one steam_click, sim-title', sent.join(' '));

    await web.page.tap('Escape');
    await sleep(300);
    check((await ev(PAGE)) === null && (await ev('return window.__ui.screen')) === screenBefore, 'Escape closes it and nothing else', '');

    /* The About room's row. */
    await ev('window.__ui.openSteamPage("about"); return 1;');
    await web.page.until("Boolean(document.querySelector('.steam-page'))", 10000).catch(() => {});
    const about = await ev(PAGE);
    check(Boolean(about) && /utm_campaign=about$/.test(about.href), 'the About row opens the same page, tagged about', about ? about.href : 'no page');
    await ev('window.__ui.back(); return 1;');
    await sleep(200);
    check((await ev(PAGE)) === null, 'a pad\'s Back closes it', '');
    const row = await ev(`const u = window.__ui; u.show('credits');
      await new Promise((r) => setTimeout(r, 400));
      const rows = [...document.querySelectorAll('.row-steam .row-label')].map((n) => n.textContent);
      u.show('title'); return rows;`).catch((e) => [String(e)]);
    check(row.length === 1 && row[0] === 'Get it on Steam', 'the About room has one Steam row, and it says Get it on Steam', row.join(', '));

    /* A phone. */
    await web.page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 780, deviceScaleFactor: 2, mobile: true }, web.page.sessionId);
    await ev('window.__ui.openSteamPage("title"); return 1;');
    await web.page.until("Boolean(document.querySelector('.steam-page'))", 10000).catch(() => {});
    await sleep(500);
    const phone = await ev(`${PAGE.replace('return {', 'return { wide: document.documentElement.scrollWidth,')}`);
    check(Boolean(phone) && phone.fits && phone.wide <= 390, 'on a phone the sheet fits and nothing scrolls sideways', phone ? `${phone.wide}` : '');
    await shot('steam-page-390');
    await ev('window.__ui.back(); return 1;');
    const uncaught = web.page.errors.filter((e) => e.startsWith('uncaught:'));
    check(uncaught.length === 0, 'nothing threw', uncaught.slice(0, 2).join(' | '));
    await web.page.close();
    web = null;

    console.log('  the Steam edition');
    steam = await open('/index.html?edition=steam', 1280, 800);
    const none = await steam.ev(`window.__ui.openSteamPage('title');
      await new Promise((r) => setTimeout(r, 600));
      return {
        stickers: document.querySelectorAll('a.steam-wishlist').length,
        page: document.querySelectorAll('.steam-page').length,
        fetched: performance.getEntriesByType('resource').filter((e) => /steampage[.]js|assets[/]steam[/]/.test(e.name)).length,
      };`);
    check(none.stickers === 0 && none.page === 0 && none.fetched === 0, 'no sticker, no page, and nothing of it fetched', JSON.stringify(none));
  } catch (e) {
    fails += 1;
    console.log(`     FAIL  the check itself: ${e.message}`);
  } finally {
    for (const o of [web, steam]) {
      if (o) {
        await o.page.close().catch(() => {});
      }
    }
  }
  console.log(`\nsteam-check: ${fails === 0 ? 'all pass' : `${fails} failed`}`);
  process.exit(fails);
}

main();
