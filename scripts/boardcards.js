/*
 * boardcards.js: draw the share card for every track and map on a board
 * that has not got one, and upload it.
 *
 * WHY THIS EXISTS AT ALL. The share card, the picture a link to a track or
 * a map shows when it is posted, is normally drawn by the browser that
 * publishes it, seconds after the publish, by src/share/card.js. That
 * covers everything published from now on and nothing published before it
 * existed, whose authors' edit keys are in browsers nobody still has. This
 * is the one way to give those a card, with the board's admin token, the
 * way scripts/boardgif.js gives old rooms their animation.
 *
 * WHY IT DRIVES A BROWSER. The card is a frame of the real renderer, and
 * the real renderer is Three.js in a WebGL context. So this opens the same
 * page the publishing browser opens, src/share/orbit.html with ?card=1, in
 * headless Chromium: the card written here and the card the builder writes
 * come out of the same code, and a track looks the same whichever drew it.
 *
 * ONE BROWSER FOR THE RUN, ONE DOCUMENT PER CARD. Starting Chromium costs
 * more than a card does, but a card is a whole world built and thrown away,
 * so each one gets a fresh document by navigation rather than sharing a
 * page with the last one's leftovers.
 *
 * THE PAGE FETCHES THE TRACK ITSELF, from ?board=, exactly as it does for
 * the builder. So Chromium has to be able to reach the board, which on a
 * normal machine it can. In a container whose Chromium does not inherit a
 * proxy it cannot, and the card fails with the board's address in the
 * error; run it where a browser can open the board.
 *
 * usage:
 *   BOARD_ADMIN_TOKEN=... node scripts/boardcards.js --board https://webfpv.org/board
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

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The card's own size, CARD_W and CARD_H in src/share/card.js, so the
 * page is laid out the way the builder's hidden frame is. */
const CARD_W = 1200;
const CARD_H = 630;

/* A software rasteriser builds the town in about a minute; a GPU in two
 * seconds. This is the software one's minute with room to spare. */
const CARD_WAIT_MS = 240000;

function usage() {
  console.log('usage: node scripts/boardcards.js [options]');
  console.log('  --board <origin>   the board, default http://127.0.0.1:3100');
  console.log('  --only <trk-id>    just this track or map, even if it already has a card');
  console.log('  --all              redraw every card, including ones already there');
  console.log('  --out <dir>        also write each card here, to look at');
  console.log('  --dry              draw and report, upload nothing');
  console.log('');
  console.log('  The upload needs BOARD_ADMIN_TOKEN in the environment, set to the same');
  console.log('  value as the board service\'s own. Without it, --dry is the only mode');
  console.log('  that does anything, because a track published from somebody else\'s');
  console.log('  browser cannot be changed without either their edit key or that token.');
  console.log('');
  console.log('  Chromium here runs on a software rasteriser, so budget five to fifteen');
  console.log('  seconds a card rather than the second or two it takes on real hardware.');
}

function parseArgs(argv) {
  const opts = {
    board: process.env.BOARD_ORIGIN || 'http://127.0.0.1:3100',
    only: '', all: false, out: '', dry: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { return null; }
    if (a === '--board') { opts.board = argv[i + 1]; i += 1; continue; }
    if (a === '--only') { opts.only = argv[i + 1]; i += 1; continue; }
    if (a === '--out') { opts.out = argv[i + 1]; i += 1; continue; }
    if (a === '--all') { opts.all = true; continue; }
    if (a === '--dry') { opts.dry = true; continue; }
    throw new Error(`unknown option ${a}`);
  }
  opts.board = String(opts.board || '').replace(/\/+$/, '');
  if (!opts.board) {
    throw new Error('--board wants an origin');
  }
  return opts;
}

/* The slug rule the builder's exportFilename uses, so a file written here
 * is named the way the builder names one. */
function slugOf(name) {
  return String(name || 'track')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'track';
}

/* The orbit page's address for one card: cardPageUrl in src/share/card.js,
 * written out here because that one resolves against a page. `n` makes
 * each address unique, so the wait below cannot read the last card's
 * answer out of a document that has not been replaced yet. */
function cardPath(item, board, n) {
  const q = new URLSearchParams();
  if (item.kind === 'map') {
    q.set('map', 'built');
    q.set('mapshare', item.id);
  } else {
    q.set('map', 'custom');
    q.set('share', item.id);
  }
  q.set('board', board);
  q.set('card', '1');
  q.set('n', String(n));
  return `/src/share/orbit.html?${q}`;
}

async function listOf(board, route, key) {
  const res = await fetch(`${board}/api/${route}`);
  if (!res.ok) {
    throw new Error(`the board answered ${res.status} for /api/${route}`);
  }
  const body = await res.json();
  return Array.isArray(body[key]) ? body[key] : [];
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`boardcards: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  if (!opts) {
    usage();
    process.exitCode = 1;
    return;
  }

  const token = String(process.env.BOARD_ADMIN_TOKEN || '');
  if (!token && !opts.dry) {
    console.error('boardcards: no BOARD_ADMIN_TOKEN, so nothing could be uploaded. Use --dry to draw anyway.');
    process.exitCode = 1;
    return;
  }

  console.log(`boardcards: ${opts.board}`);
  let tracks;
  let maps;
  try {
    tracks = await listOf(opts.board, 'tracks', 'tracks');
    /* A board older than published maps answers 404 here, and has none. */
    maps = await listOf(opts.board, 'maps', 'maps').catch(() => []);
  } catch (e) {
    console.error(`boardcards: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  const everything = [
    ...tracks.map((t) => ({ kind: 'track', id: t.id, name: t.name, hasCard: Boolean(t.hasCard) })),
    ...maps.map((m) => ({ kind: 'map', id: m.id, name: m.name, hasCard: Boolean(m.hasCard) })),
  ];
  const wanted = everything
    .filter((x) => (opts.only ? x.id === opts.only : opts.all || !x.hasCard));
  console.log(`  ${tracks.length} tracks and ${maps.length} maps, ${wanted.length} to draw`);
  if (!wanted.length) {
    console.log('  nothing to do');
    return;
  }
  if (opts.out) {
    await mkdir(opts.out, { recursive: true });
  }

  const page = await openPage({
    root, width: CARD_W, height: CARD_H, url: '/icon.svg',
  });

  let failed = 0;
  try {
    for (let n = 0; n < wanted.length; n += 1) {
      /* eslint-disable no-await-in-loop */
      const item = wanted[n];
      const label = `${item.kind} ${item.id} ${item.name}`;
      const path = cardPath(item, opts.board, n);
      const errorsBefore = page.errors.length;
      const started = Date.now();
      await page.cdp.send('Page.navigate', { url: `${page.origin}${path}` }, page.sessionId);
      const mine = `location.search.includes('n=${n}')`;
      try {
        await page.until(`${mine} && (window.__cardDone || window.__cardError)`, CARD_WAIT_MS);
      } catch (e) {
        console.log(`  ${label}: no card after ${CARD_WAIT_MS / 1000} s`);
        failed += 1;
        continue;
      }
      const error = await page.evaluate('window.__cardError || ""');
      if (error) {
        console.log(`  ${label}: ${error}`);
        failed += 1;
        continue;
      }
      const base64 = await page.evaluate('window.__cardBase64');
      const bytes = Buffer.from(base64, 'base64');
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const kb = (bytes.length / 1024).toFixed(0);
      for (const line of page.errors.slice(errorsBefore)) {
        console.log(`    page said: ${line}`);
      }
      if (opts.out) {
        await writeFile(join(opts.out, `${item.kind}-${slugOf(item.name)}.jpg`), bytes);
      }
      if (opts.dry) {
        console.log(`  ${label}: ${kb} kB in ${secs} s, not uploaded`);
        continue;
      }
      const route = item.kind === 'map' ? 'maps' : 'tracks';
      const up = await fetch(`${opts.board}/api/${route}/${encodeURIComponent(item.id)}/card`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ card: base64 }),
      });
      const answer = await up.json().catch(() => ({}));
      if (!up.ok) {
        console.log(`  ${label}: the board refused it, ${answer.error || up.status}`);
        failed += 1;
        continue;
      }
      console.log(`  ${label}: ${kb} kB in ${secs} s, on the board`);
      /* eslint-enable no-await-in-loop */
    }
  } finally {
    await page.close();
  }

  if (failed) {
    console.log(`  ${failed} failed`);
    process.exitCode = 1;
  }
}

await main();
