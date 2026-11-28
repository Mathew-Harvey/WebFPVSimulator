/*
 * i18n-collect.js: walk the Steam edition's menus and list every string the
 * page showed that has no translation.
 *
 *   node scripts/i18n-collect.js [--lang=zz] [--out=file.json] [--only=title,builder]
 *
 * lang=zz is the collector's own language, which has no translations, so
 * every string is listed: that is how scripts/i18n/source.json was first
 * made. With a real language it lists what that language still shows in
 * English, which is how a new screen's text is found after the fact.
 *
 * It drives one page per place and never reloads between rows, because the
 * strings are what is wanted, not a map of the menus (scripts/menu-map.js
 * is that). The page keeps its own list (?i18n=collect, src/i18n/i18n.js);
 * this reads the list and every row's label, value and note.
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

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerQuadPicker, openPage } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const LANG = argv.lang || 'zz';
const OUT = argv.out || '';
const only = new Set((argv.only || '').split(',').filter(Boolean));
const Q = `edition=steam&lang=${LANG}&i18n=collect`;

const AWAY = /^(trackbuilder|trackbuilder-new|mapbuilder|builder|remix|editown|leaderboard|seat-board|wiki|support|wishlist|steampage|partners|card-board|patreon|steam|discord|board-.*|share.*|copy.*|export.*|import.*|reset.*|delete.*|forget.*|clear.*|signout|logout|quit.*|exit.*|language.*)$/;

const SIG = `(() => { const u = window.__ui; if (!u) return ''; const t = window.__together ? window.__together() : null;
  return [u.screen, u.screen === 'title' && u.onGate && u.onGate() ? u.gatePageNow() : '', ['freestyle', 'courses'].includes(u.screen) && u.pickerShelf ? u.pickerShelf() : '',
    document.querySelector('.qp-page') ? 'qp' : document.querySelector('.df-page') ? 'df' : '', t && t.sheet ? t.sheet : '',
    u.fightPick ? 'fight:' + u.fightPick.game : u.hostPick ? 'host' : u.mapGamePick ? 'mapgame' : ''].filter(Boolean).join('/'); })()`;
const ITEMS = `(() => { const u = window.__ui; if (!u || !u.items) return []; let its = []; try { its = u.items(); } catch (e) { return []; }
  return its.map((i) => ({ label: String(i.label || i.card || ''), value: i.value == null ? '' : String(i.value), note: String(i.note || ''), title: String(i.title || ''),
    action: typeof i.action === 'string' ? i.action : '', section: Boolean(i.section), disabled: Boolean(i.disabled),
    options: (i.options || []).map((o) => String(o.label || '')) })); })()`;
const MISSES = '(() => JSON.stringify([...(window.__i18nMisses || [])]))()';

const found = new Map();
const note = (s, where) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length > 1 && /[A-Za-z]/.test(t) && !found.has(t)) {
    found.set(t, where);
  }
};

async function harvest(page, where) {
  try {
    for (const s of JSON.parse(await page.evaluate(MISSES))) {
      note(s, where);
    }
    for (const it of await page.evaluate(ITEMS)) {
      note(it.label, where); note(it.value, where); note(it.note, where); note(it.title, where);
      it.options.forEach((o) => note(o, where));
    }
  } catch (e) {
    /* A page mid navigation: the next harvest has it. */
  }
}

async function ready(page, place) {
  await page.until('window.__shellReady && window.__ui && window.__ui.screen', 150000);
  if (place.fly) {
    await answerQuadPicker(page, 90000).catch(() => {});
    await page.until("window.__ui.screen === 'flight'", 90000).catch(() => {});
    await page.sleep(3000);
    await harvest(page, `${place.id}/flight`);
    await page.evaluate("window.__ui.act('pause'); window.__ui.show('paused');").catch(() => {});
  }
  await page.sleep(700);
}

/* Breadth first over the menus. A row is pressed, what it opened is read,
 * and Escape is pressed until the page is back; a row that cannot be
 * escaped from (it flew, or it changed the room for good) costs a reload
 * and a replay of the path. */
async function walkMenus(page, place) {
  const seen = new Set();
  const reach = async (path) => {
    await harvest(page, 'reload');
    await page.evaluate('window.location.reload()').catch(() => {});
    await page.sleep(1500);
    await ready(page, place);
    for (const a of path) {
      await page.evaluate(`window.__ui.act(${JSON.stringify(a)})`).catch(() => {});
      await page.sleep(900);
    }
  };
  const queue = [{ path: [] }];
  /* Every room by name too, for the ones no row on the walk opens. */
  const rooms = (await page.evaluate('JSON.stringify(Object.keys(window.__ui.screens || {}))').then(JSON.parse).catch(() => []))
    .filter((r) => !['flight', 'title'].includes(r));
  /* A place that flies is walked for its flight and its pause menu only:
   * the rooms are the title's, and a reload there costs a takeoff. */
  for (const r of place.fly ? [] : rooms) {
    queue.push({ path: [], show: r });
  }
  while (queue.length) {
    const { path, show } = queue.shift();
    if (path.length > place.depth) {
      continue;
    }
    await reach(path);
    if (show) {
      await page.evaluate(`window.__ui.show(${JSON.stringify(show)})`).catch(() => {});
      await page.sleep(900);
    }
    const here = await page.evaluate(SIG);
    await harvest(page, here);
    if (seen.has(here)) {
      continue;
    }
    seen.add(here);
    console.log(`  ${here}  (${found.size} strings)`);
    const items = await page.evaluate(ITEMS);
    for (const it of items) {
      if (it.section || it.disabled || !it.action || it.action === 'noop' || it.action === 'back' || AWAY.test(it.action)) {
        continue;
      }
      if (/^(map:|boardmap:|course|card:|track:|week|card-fly|title$)/.test(it.action)) {
        continue;
      }
      let to = here;
      try {
        await page.evaluate(`window.__ui.act(${JSON.stringify(it.action)})`);
        await page.sleep(900);
        to = await page.evaluate(SIG);
        await harvest(page, to);
      } catch (e) {
        console.log(`    ${it.action}: ${e.message.slice(0, 100)}`);
      }
      if (to === here) {
        continue;
      }
      if (to.startsWith('flight')) {
        await page.sleep(2500);
        await harvest(page, 'flight');
      } else if (!seen.has(to) && !show) {
        queue.push({ path: [...path, it.action] });
      }
      for (let k = 0; k < 3 && !to.startsWith('flight') && (await page.evaluate(SIG).catch(() => '')) !== here; k += 1) {
        await page.tap('Escape');
        await page.sleep(700);
      }
      if ((await page.evaluate(SIG).catch(() => '')) !== here) {
        await reach(path);
        if (show) {
          await page.evaluate(`window.__ui.show(${JSON.stringify(show)})`).catch(() => {});
          await page.sleep(900);
        }
        if ((await page.evaluate(SIG).catch(() => '')) !== here) {
          break;
        }
      }
    }
  }
}

const PLACES = [
  { id: 'title', url: `/index.html?${Q}`, depth: 5 },
  { id: 'city', url: `/index.html?map=city&craft=5inch&fly=1&${Q}`, fly: true, depth: 0 },
  { id: 'race', url: `/index.html?map=custom&craft=5inch&fly=1&${Q}`, fly: true, depth: 0 },
  { id: 'house', url: `/index.html?map=house&craft=whoop65&fly=1&${Q}`, fly: true, depth: 0 },
  { id: 'builder', url: `/src/trackbuilder/index.html?mode=race&${Q}`, builder: true },
  { id: 'builder-free', url: `/src/trackbuilder/index.html?mode=freestyle&${Q}`, builder: true },
  { id: 'builder-whoop', url: `/src/trackbuilder/index.html?${Q}`, builder: true },
];

for (const place of PLACES) {
  if (only.size && !only.has(place.id)) {
    continue;
  }
  console.log(`== ${place.id}`);
  let page = null;
  try {
    page = await openPage({ root: ROOT, width: 1280, height: 720, url: place.url });
    if (place.builder) {
      await page.sleep(9000);
      await harvest(page, place.id);
      /* Every button once, so a panel that opens on a press is read. */
      const n = await page.evaluate("document.querySelectorAll('button').length");
      for (let i = 0; i < Math.min(n, 150); i += 1) {
        await page.evaluate(`(() => { const b = document.querySelectorAll('button')[${i}]; if (b && !/publish|share|export|import|delete|fly|open|new|leave|sim|board|bundle|animate/i.test(b.textContent + b.className + b.id)) { try { b.click(); } catch (e) {} } })()`).catch(() => {});
        await page.sleep(120);
        if (i % 10 === 0) {
          await harvest(page, place.id);
        }
      }
      await harvest(page, place.id);
    } else {
      await ready(page, place);
      await walkMenus(page, place);
    }
    await harvest(page, place.id);
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|api\/|Failed to load resource|net::/.test(e));
    if (errs.length) {
      console.log(`  page errors: ${errs.slice(0, 5).join(' | ').slice(0, 600)}`);
    }
  } catch (e) {
    console.log(`  FAILED ${e.message.slice(0, 300)}`);
  }
  if (page) {
    await page.close().catch(() => {});
  }
  if (OUT) {
    await writeFile(OUT, JSON.stringify([...found].map(([text, where]) => ({ text, where })), null, 1));
  }
}
console.log(`${found.size} strings${LANG === 'zz' ? '' : ` with no ${LANG} translation`}`);
process.exit(0);
