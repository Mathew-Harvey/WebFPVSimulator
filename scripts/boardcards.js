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
  console.log('  --worlds           draw the thumbnails of the worlds the simulator ships');
  console.log('                     (the town, Hibari Yard, Nick Burns\' house, Heads\' house,');
  console.log('                     Joshua Bardwell\'s house, Thomas More\'s Shop, Sunnyfield) into');
  console.log('                     assets/thumbs/, and nothing from the board');
  console.log('');
  console.log('  Every page draws the share card and the picker\'s thumbnail together.');
  console.log('  Anything missing either is drawn; the card is uploaded when it was');
  console.log('  missing or --all says so, the thumbnail whenever it was drawn.');
  console.log('');
  console.log('  The upload needs BOARD_ADMIN_TOKEN in the environment, set to the same');
  console.log('  value as the board service\'s own. Without it, --dry is the only mode');
  console.log('  that does anything, because a track published from somebody else\'s');
  console.log('  browser cannot be changed without either their edit key or that token.');
  console.log('');
  console.log('  Chromium here runs on a software rasteriser, so budget five to fifteen');
  console.log('  seconds a card rather than the second or two it takes on real hardware.');
}

/* Rejects anything that is not a plain http(s) origin, so a --board value
 * cannot be used to reach the cloud metadata service or another
 * link-local/internal address instead of the intended board. */
function isAllowedBoard(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') { return false; }
  if (u.hostname === '169.254.169.254' || u.hostname === 'metadata.google.internal') { return false; }
  return true;
}

function parseArgs(argv) {
  const opts = {
    board: process.env.BOARD_ORIGIN || 'http://127.0.0.1:3100',
    only: '', all: false, out: '', dry: false, worlds: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { return null; }
    if (a === '--board') { opts.board = argv[i + 1]; i += 1; continue; }
    if (a === '--only') { opts.only = argv[i + 1]; i += 1; continue; }
    if (a === '--out') { opts.out = argv[i + 1]; i += 1; continue; }
    if (a === '--all') { opts.all = true; continue; }
    if (a === '--dry') { opts.dry = true; continue; }
    if (a === '--worlds') { opts.worlds = true; continue; }
    throw new Error(`unknown option ${a}`);
  }
  opts.board = String(opts.board || '').replace(/\/+$/, '');
  if (!opts.board || !isAllowedBoard(opts.board)) {
    throw new Error('--board wants a plain http(s) origin, not a link-local/metadata address');
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
  if (item.kind === 'world') {
    q.set('map', item.id);
    for (const [k, v] of Object.entries(item.shot || {})) {
      q.set(k, String(v));
    }
  } else if (item.kind === 'map') {
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

  if (opts.worlds) {
    await drawWorlds(opts);
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
    ...tracks.map((t) => ({
      kind: 'track', id: t.id, name: t.name, hasCard: Boolean(t.hasCard), hasThumb: Boolean(t.hasThumb),
    })),
    ...maps.map((m) => ({
      kind: 'map', id: m.id, name: m.name, hasCard: Boolean(m.hasCard), hasThumb: Boolean(m.hasThumb),
    })),
  ];
  const wanted = everything
    .filter((x) => (opts.only ? x.id === opts.only : opts.all || !x.hasCard || !x.hasThumb));
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
      const thumbBase64 = await page.evaluate('window.__thumbBase64 || ""');
      const bytes = Buffer.from(base64, 'base64');
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const kb = (bytes.length / 1024).toFixed(0);
      for (const line of page.errors.slice(errorsBefore)) {
        console.log(`    page said: ${line}`);
      }
      if (opts.out) {
        await writeFile(join(opts.out, `${item.kind}-${slugOf(item.name)}.jpg`), bytes);
        if (thumbBase64) {
          await writeFile(join(opts.out, `${item.kind}-${slugOf(item.name)}-thumb.jpg`), Buffer.from(thumbBase64, 'base64'));
        }
      }
      if (opts.dry) {
        console.log(`  ${label}: ${kb} kB in ${secs} s, not uploaded`);
        continue;
      }
      const route = item.kind === 'map' ? 'maps' : 'tracks';
      const send = async (slot, picture) => {
        const up = await fetch(`${opts.board}/api/${route}/${encodeURIComponent(item.id)}/${slot}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ card: picture }),
        });
        const answer = await up.json().catch(() => ({}));
        return up.ok ? '' : (answer.error || String(up.status));
      };
      const sent = [];
      if (opts.all || opts.only || !item.hasCard) {
        const refused = await send('card', base64);
        if (refused) {
          console.log(`  ${label}: the board refused the card, ${refused}`);
          failed += 1;
          continue;
        }
        sent.push(`card ${kb} kB`);
      }
      if (thumbBase64) {
        const refused = await send('thumb', thumbBase64);
        if (refused) {
          console.log(`  ${label}: the board refused the thumbnail, ${refused}`);
          failed += 1;
          continue;
        }
        sent.push(`thumbnail ${(Buffer.from(thumbBase64, 'base64').length / 1024).toFixed(0)} kB`);
      } else {
        console.log(`  ${label}: no thumbnail was drawn`);
      }
      console.log(`  ${label}: ${sent.join(', ') || 'nothing new'} in ${secs} s, on the board`);
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

/*
 * THE WORLDS THE SIMULATOR SHIPS, which are on no board: the town, Hibari
 * Yard (the built world with no map of the pilot's own seated), Nick
 * Burns' house, Heads' house and Joshua Bardwell's. Their thumbnails are
 * files in the simulator, drawn by the same page the board's are, so a
 * shipped world and a published one sit in the picker's strip looking like
 * one set. Regenerate, do not edit.
 */
const WORLDS = [
  /* The shots were picked by eye from four sides on 19 October 2026: the
   * yard from the side that has the road and the containers behind the
   * frame, the house from the street with its front door in the middle. */
  { id: 'city', file: 'city.jpg', name: 'The town' },
  { id: 'built', file: 'yard.jpg', name: 'Hibari Yard', shot: { tp: 0.4, tr: 0.75, ta: 1.57 } },
  { id: 'house', file: 'house.jpg', name: "Nick Burns' house", shot: { tp: 0.6, tr: 1.4, ta: -1.57 } },
  /* Heads' house, added 20 October 2026 when it became an official map, its
   * shot picked by eye the same way. */
  { id: 'heads', file: 'heads.jpg', name: "Heads' house", shot: { tp: 0.55, tr: 0.8, ta: -1.35 } },
  /* Joshua Bardwell's house, added 21 October 2026, the same way, and
   * taken again from higher and further out when it was rebuilt that day,
   * so the camera clears the trees and the field is in it. */
  { id: 'bardwell', file: 'bardwell.jpg', name: "Joshua Bardwell's house", shot: { tp: 0.72, tr: 1.45, ta: -1.1 } },
  /* Thomas More's Shop, added 27 October 2026. It has a roof, so no
   * shot from outside shows anything but the roof: the hall names its own
   * lens instead, inside under the joists (CARD_LENS in
   * src/maps/warehouse/warehouse.js), and the orbit page uses that. */
  { id: 'warehouse', file: 'warehouse.jpg', name: "Thomas More's Shop" },
  /* The goat map, added 28 October 2026: Heads' house in its street, taken
   * from Heads' own shot so the house is in the middle of it. */
  { id: 'goats', file: 'goats.jpg', name: '90%er goat herding', shot: { tp: 0.5, tr: 0.3, ta: -1.35 } },
  /* Sunnyfield, added 28 October 2026, picked by eye from four sides: the
   * one with the hill's letters, the town hall and the gorge in it. */
  { id: 'sunny', file: 'sunny.jpg', name: 'Sunnyfield', shot: { tp: 0.62, tr: 0.9, ta: -2.4 } },
  /* Hamakaze Works, added 31 October 2026, picked by eye: from over the
   * quay, the gantry, the steel shop and the stack in it. */
  { id: 'factory', file: 'factory.jpg', name: 'Hamakaze Works', shot: { tp: 0.55, tr: 0.85, ta: 2.3 } },
  /* Kazami Airfield, added 31 October 2026: the hangar and the strip
   * from over the paddies, with the mountains behind. */
  { id: 'airfield', file: 'airfield.jpg', name: 'Kazami Airfield', shot: { tp: 0.5, tr: 0.8, ta: -2.0 } },
  /* Quad Ball's stadium and Ridgeline MX, added 29 October 2026 with no
   * picture, so their map cards were blank and every picker asked the
   * server for a file that was not there (found 30 October 2026). */
  { id: 'ball', file: 'ball.jpg', name: 'Quad Ball' },
  { id: 'moto', file: 'moto.jpg', name: 'Ridgeline MX' },
  /* Hinode Park, added 31 October 2026. */
  { id: 'park', file: 'park.jpg', name: 'Hinode Park' },
  /* Kamome Wharf, added 31 October 2026. */
  { id: 'dock', file: 'dock.jpg', name: 'Kamome Wharf' },
  /* Raicho Ridge, added 31 October 2026, from high over the valley so the
   * ridge, the ropeway and the lake are all in it. */
  { id: 'alps', file: 'alps.jpg', name: 'Raicho Ridge' },
  /* Kumoi Towers, added 31 October 2026: the plaza with the twin crowns
   * over it, from the plaza's south side, picked by eye from six shots. */
  { id: 'towers', file: 'towers.jpg', name: 'Kumoi Towers', shot: { tp: 0.25, tr: 0.6, ta: 0 } },
  { id: 'dome', file: 'dome.jpg', name: 'Bakuon Dome' },
  /* Shiokaze Point, added 31 October 2026, from the sea: the hotels, the
   * wedded rocks and the stacks. */
  { id: 'shiokaze', file: 'shiokaze.jpg', name: 'Shiokaze Point', shot: { tp: 0.3, tr: 1.1, ta: -1.57 } },
  /* Kodama Onsen, added 31 October 2026, picked by eye: the inn from the
   * car park side, the shrine's approach and the forest behind it. */
  { id: 'cedar', file: 'cedar.jpg', name: 'Kodama Onsen', shot: { tp: 0.55, tr: 0.75, ta: -1.9 } },
  /* Hoshino Shoji, added 31 October 2026. Indoors like Thomas More's Shop,
   * so it names its own lens too (CARD_LENS in src/maps/office/office.js). */
  { id: 'office', file: 'office.jpg', name: 'Hoshino Shoji' },
  { id: 'kaza', file: 'kaza.jpg', name: 'Kazahana Plain' },
  /* Kirigaoka Sanatorium, added 31 October 2026, from the avenue's side
   * so the wings, the tower and the terrace stair are in it. */
  { id: 'sana', file: 'sana.jpg', name: 'Kirigaoka Sanatorium', shot: { tp: 0.45, tr: 0.9, ta: -1.57 } },
  /* Tanada RX, added 31 October 2026, from the south over the jump so
   * the stand and the terraces are in it. */
  { id: 'rally', file: 'rally.jpg', name: 'Tanada RX', shot: { tp: 0.5, tr: 0.7, ta: -1.57 } },
  /* Shiroyama FMX, added 31 October 2026 with its picture, from the
   * south east so the kickers, the yagura and the castle are in it. */
  { id: 'fmx', file: 'fmx.jpg', name: 'Shiroyama FMX', shot: { tp: 0.5, tr: 0.75, ta: -0.6 } },
];

async function drawWorlds(opts) {
  const dir = join(root, 'assets', 'thumbs');
  await mkdir(dir, { recursive: true });
  const page = await openPage({
    root, width: CARD_W, height: CARD_H, url: '/icon.svg',
  });
  let failed = 0;
  try {
    for (let n = 0; n < WORLDS.length; n += 1) {
      /* eslint-disable no-await-in-loop */
      const w = WORLDS[n];
      if (opts.only && opts.only !== w.id) {
        continue;
      }
      await page.cdp.send('Page.navigate', {
        url: `${page.origin}${cardPath({ kind: 'world', id: w.id, shot: w.shot }, opts.board, n)}`,
      }, page.sessionId);
      try {
        await page.until(`location.search.includes('n=${n}') && (window.__cardDone || window.__cardError)`, CARD_WAIT_MS);
      } catch (e) {
        console.log(`  ${w.name}: no thumbnail after ${CARD_WAIT_MS / 1000} s`);
        failed += 1;
        continue;
      }
      const thumb = await page.evaluate('window.__cardError ? "" : (window.__thumbBase64 || "")');
      if (!thumb) {
        console.log(`  ${w.name}: ${await page.evaluate('window.__cardError || "no thumbnail was drawn"')}`);
        failed += 1;
        continue;
      }
      const bytes = Buffer.from(thumb, 'base64');
      await writeFile(join(dir, w.file), bytes);
      console.log(`  ${w.name}: assets/thumbs/${w.file}, ${(bytes.length / 1024).toFixed(0)} kB`);
      /* eslint-enable no-await-in-loop */
    }
  } finally {
    await page.close();
  }
  if (failed) {
    process.exitCode = 1;
  }
}

await main();
