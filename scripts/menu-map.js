/*
 * WebFPVSimulator: a browser FPV racing simulator.
 * Copyright (C) 2026 the WebFPVSimulator authors.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * THE MENU MAP. The owner, 2026-11-11: "do a full menu mapping logic sweep,
 * map all menu options and look for inconsitencies at all places a player
 * could reach". A headless walk of every menu from a set of starting places
 * (the title's pages, and the pause of each kind of flight), pressing every
 * row that goes somewhere and then Back, and writing down where each press
 * landed and where Back took it. It does not judge feel; it finds the
 * mechanical inconsistencies: a row that goes nowhere, a Back that does not
 * come back, a press that throws, a screen with no way out.
 *
 *   node scripts/menu-map.js [--out=FILE.json] [--only=title,city]
 *
 * The rows that leave the page (the builders, the board, the wiki) are
 * written down and not pressed. A press that starts a flight is followed
 * once, to see that it does, and the walk starts that place again.
 */

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerQuadPicker, openPage } from '../tests/lib/page.js';

const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const only = new Set((argv.only || '').split(',').filter(Boolean));
const OUT = argv.out || '';

/* Rows that leave the page or reach the network: recorded, never pressed. */
const AWAY = /^(trackbuilder|trackbuilder-new|mapbuilder|builder|remix|editown|leaderboard|seat-board|wiki|support|wishlist|partners|card-board|patreon|steam|discord|board-.*|share.*|copy.*|export.*|import.*|reset.*|delete.*|forget.*|clear.*|signout|logout)$/;

/* Where the page is, as a pilot would say it. */
const SIG = `(() => {
  const u = window.__ui;
  const t = window.__together ? window.__together() : null;
  const page = document.querySelector('.qp-page') ? 'quad-picker' : document.querySelector('.df-page') ? 'game-page' : '';
  return JSON.stringify({
    screen: u.screen,
    gate: u.screen === 'title' && u.onGate() ? u.gatePageNow() : '',
    shelf: ['freestyle', 'courses'].includes(u.screen) && u.pickerShelf ? u.pickerShelf() : '',
    page,
    sheet: t && t.sheet ? t.sheet : '',
    pick: u.fightPick ? 'fight:' + u.fightPick.game : u.hostPick ? 'host' : u.mapGamePick ? 'mapgame' : '',
  });
})()`;

const ITEMS = `(() => {
  const u = window.__ui;
  if (document.querySelector('.qp-page') || document.querySelector('.df-page')) return [];
  return u.items().map((i, n) => ({
    n,
    label: String(i.label || i.card || ''),
    value: i.value == null ? '' : String(i.value),
    action: typeof i.action === 'string' ? i.action : '',
    card: i.card || '',
    section: Boolean(i.section),
    info: Boolean(i.info),
    disabled: Boolean(i.disabled),
    kind: i.cards ? 'cards' : i.sw ? 'switch' : i.num ? 'number' : i.options ? 'choice' : (i.step || i.adjust) ? 'stepper' : '',
    note: String(i.note || '').slice(0, 160),
  }));
})()`;

function log(...a) {
  console.log(...a);
}

async function boot(url, fly) {
  const page = await openPage({ root: ROOT, width: 1280, height: 720, url });
  await page.until('window.__shellReady && window.__ui && window.__ui.screen', 150000);
  if (fly) {
    await answerQuadPicker(page, 90000).catch(() => {});
    await page.until("window.__ui.screen === 'flight'", 90000).catch(() => {});
  }
  await page.sleep(600);
  return page;
}

const sigOf = async (page) => JSON.parse(await page.evaluate(SIG));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const name = (s) => [s.screen, s.gate, s.shelf, s.page, s.sheet, s.pick].filter(Boolean).join('/');

/*
 * One starting place: how to reach it from a fresh page, and the walk of
 * everything under it to a depth.
 */
async function walk(place) {
  log(`\n== ${place.id}`);
  const nodes = new Map();
  const findings = [];
  let page = await boot(place.url, place.fly);
  const reach = async (path) => {
    await page.close().catch(() => {});
    page = await boot(place.url, place.fly);
    for (const step of place.setup || []) {
      await page.evaluate(step);
      await page.sleep(400);
    }
    for (const a of path) {
      await page.evaluate(`window.__ui.act(${JSON.stringify(a)})`);
      await page.sleep(1600);
    }
  };
  await reach([]);
  const queue = [{ path: [] }];
  const seen = new Set();
  while (queue.length) {
    const { path } = queue.shift();
    if (path.length) {
      await reach(path);
    }
    const here = await sigOf(page);
    const key = name(here);
    if (seen.has(key) || path.length > (place.depth ?? 4)) {
      continue;
    }
    seen.add(key);
    const items = await page.evaluate(ITEMS);
    const node = { key, sig: here, path, items, edges: [] };
    nodes.set(key, node);
    if (OUT) {
      await writeFile(`${OUT}.${place.id}.partial.json`, JSON.stringify({ id: place.id, nodes: [...nodes.values()], findings }, null, 2));
    }
    log(`  ${key} (${items.length} rows) via ${path.join(' > ') || 'start'}`);
    if (!items.filter((i) => !i.section).length && !here.page) {
      findings.push({ at: key, what: 'a screen with no rows' });
    }
    /* Escape from here, once, and where it lands. */
    if (path.length || place.escape) {
      await page.tap('Escape');
      await page.sleep(1200);
      node.escape = name(await sigOf(page));
      if (node.escape === key && !['flight'].includes(here.screen)) {
        findings.push({ at: key, what: 'Escape does nothing here' });
      }
      await reach(path);
    }
    const errsBefore = page.errors.length;
    for (const it of items) {
      if (it.section || !it.action || it.action === 'noop') {
        continue;
      }
      /* The map and track cards are many and all alike: the picker's own
       * checks fly them. Their buttons on the caption are walked once. */
      if (/^(map:|boardmap:|course|card:|track:|week|card-fly|fly)/.test(it.action) || (it.card && ['freestyle', 'courses'].includes(here.screen))) {
        continue;
      }
      /* Back and the way to the title are walked as Escape, below. */
      if (it.action === 'back') {
        continue;
      }
      if (AWAY.test(it.action)) {
        node.edges.push({ row: it.label, action: it.action, to: 'leaves the page (not pressed)' });
        continue;
      }
      let to;
      try {
        await page.evaluate(`window.__ui.act(${JSON.stringify(it.action)})`);
        await page.sleep(1600);
        to = await sigOf(page);
      } catch (e) {
        findings.push({ at: key, row: it.label, action: it.action, what: `pressing it threw: ${e.message.slice(0, 200)}` });
        await reach(path);
        continue;
      }
      const edge = { row: it.label, action: it.action, to: name(to) };
      node.edges.push(edge);
      const errs = page.errors.slice(errsBefore).filter((e) => !/ERR_CONNECTION_REFUSED|api\/|Failed to load resource/.test(e));
      if (errs.length) {
        findings.push({ at: key, row: it.label, action: it.action, what: `page error: ${errs.join(' | ').slice(0, 300)}` });
      }
      if (same(to, here)) {
        /* A row that changes a value in place is fine; a row that should
         * go somewhere and does nothing is not. */
        edge.stays = true;
        continue;
      }
      if (to.screen === 'flight') {
        edge.flies = true;
        await reach(path);
        continue;
      }
      /* Back, as the Escape key does it. */
      try {
        await page.tap('Escape');
        await page.sleep(1200);
        const back = await sigOf(page);
        edge.back = name(back);
        if (!same(back, here)) {
          findings.push({ at: key, row: it.label, action: it.action, what: `Back from ${name(to)} lands on ${name(back)}, not ${key}` });
        }
      } catch (e) {
        edge.back = `threw ${e.message.slice(0, 120)}`;
      }
      if (!seen.has(name(to)) && !queue.some((q) => q.to === name(to))) {
        queue.push({ path: [...path, it.action], to: name(to) });
      }
      if (edge.back !== key) {
        await reach(path);
      }
    }
  }
  await page.close().catch(() => {});
  return { id: place.id, nodes: [...nodes.values()], findings };
}

const PLACES = [
  { id: 'title', url: '/index.html', depth: 2 },
  { id: 'city', url: '/index.html?map=city&craft=5inch&fly=1', fly: true, setup: ["window.__ui.act('pause'); window.__ui.show('paused');"], depth: 0 },
  { id: 'race', url: '/index.html?map=custom&craft=5inch&fly=1', fly: true, setup: ["window.__ui.act('pause'); window.__ui.show('paused');"], depth: 0 },
  { id: 'house', url: '/index.html?map=house&craft=whoop65&fly=1', fly: true, setup: ["window.__ui.act('pause'); window.__ui.show('paused');"], depth: 0 },
];

const out = [];
for (const place of PLACES) {
  if (only.size && !only.has(place.id)) {
    continue;
  }
  try {
    out.push(await walk(place));
  } catch (e) {
    out.push({ id: place.id, error: e.message });
    log(`  FAILED ${e.message}`);
  }
}
for (const p of out) {
  log(`\n## ${p.id}: ${(p.findings || []).length} finding(s)`);
  for (const f of p.findings || []) {
    log(`  - [${f.at}] ${f.row ? `${f.row} (${f.action}): ` : ''}${f.what}`);
  }
}
if (OUT) {
  await writeFile(OUT, JSON.stringify(out, null, 2));
  log(`\nwrote ${OUT}`);
}
process.exit(0);
