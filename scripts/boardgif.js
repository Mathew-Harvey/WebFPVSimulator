/*
 * boardgif.js: draw the card animation for every room on a board that has
 * not got one, and upload it.
 *
 * WHY THIS EXISTS AT ALL. The card animation is normally made by the
 * browser that publishes the room, seconds after the publish, by
 * src/share/cardgif.js. That covers every room published from now on and
 * none of the rooms published before it existed, whose authors' edit keys
 * are in browsers nobody still has. This is the one way to give those a
 * card, and it is why the board has a BOARD_ADMIN_TOKEN at all.
 *
 * WHY IT DRIVES A BROWSER. Same reason scripts/trackgif.js does, and it is
 * the same machinery: the scene is Three.js, Three.js is WebGL, this
 * project has no node_modules, and the bare three specifier resolves only
 * through a page's import map. So the render happens in Chromium through
 * src/trackbuilder/animate.html, which means the animation this writes and
 * the animation the builder writes come out of the same code.
 *
 * WHY ONLY ROOMS. A field track's plan is worth drawing and the board draws
 * it from the listing for nothing. A room is five metres across with three
 * gates in it, so its plan is an almost empty rectangle and the thing it
 * cannot show is the thing the track is made of. The board refuses an
 * animation for a field track anyway, in inspectGif, so this filters for
 * the same reason rather than for a different one.
 *
 * usage:
 *   BOARD_ADMIN_TOKEN=... node scripts/boardgif.js --board https://webfpv.org/board
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
import { CARD_GIF } from '../src/trackbuilder/animate.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function usage() {
  console.log('usage: node scripts/boardgif.js [options]');
  console.log('  --board <origin>   the board, default http://127.0.0.1:3100');
  console.log('  --track <trk-id>   just this one, even if it already has an animation');
  console.log('  --all              redraw every room, including ones that already have one');
  console.log('  --out <dir>        also write each GIF here, to look at');
  console.log('  --dry              render and report, upload nothing');
  console.log('');
  console.log('  The upload needs BOARD_ADMIN_TOKEN in the environment, set to the same');
  console.log('  value as the board service\'s own. Without it, --dry is the only mode');
  console.log('  that does anything, because a room published from somebody else\'s');
  console.log('  browser cannot be changed without either their edit key or that token.');
  console.log('');
  console.log('  Chromium here runs on a software rasteriser, so budget five to ten');
  console.log('  seconds a room rather than the second it takes on real hardware.');
}

function parseArgs(argv) {
  const opts = {
    board: process.env.BOARD_ORIGIN || 'http://127.0.0.1:3100',
    track: '', all: false, out: '', dry: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { return null; }
    if (a === '--board') { opts.board = argv[i + 1]; i += 1; continue; }
    if (a === '--track') { opts.track = argv[i + 1]; i += 1; continue; }
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
 * and a file the button writes land on matching names. */
function slugOf(name) {
  return String(name || 'track')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'track';
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`boardgif: ${e.message}`);
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
    console.error('boardgif: no BOARD_ADMIN_TOKEN, so nothing could be uploaded. Use --dry to render anyway.');
    process.exitCode = 1;
    return;
  }

  console.log(`boardgif: ${opts.board}`);
  const listed = await fetch(`${opts.board}/api/tracks`);
  if (!listed.ok) {
    console.error(`boardgif: the board answered ${listed.status}`);
    process.exitCode = 1;
    return;
  }
  const all = (await listed.json()).tracks || [];
  /* A room, and a room that wants one. --all overrides the second half,
   * which is what to use after the animation's shape or length changes. */
  const wanted = all.filter((t) => t.trackClass === 'micro')
    .filter((t) => (opts.track ? t.id === opts.track : opts.all || !t.hasGif));

  const rooms = all.filter((t) => t.trackClass === 'micro').length;
  console.log(`  ${all.length} tracks, ${rooms} of them rooms, ${wanted.length} to draw`);
  if (!wanted.length) {
    console.log('  nothing to do');
    return;
  }
  if (opts.out) {
    await mkdir(opts.out, { recursive: true });
  }

  /* ONE BROWSER FOR THE WHOLE RUN. Starting Chromium costs more than
   * rendering a room does, and animate.html holds no state between calls:
   * exportTrackGif builds a stage, uses it and disposes it, so the second
   * room is rendered by the same page as the first with nothing carried
   * over but the loaded module. */
  const page = await openPage({
    root,
    width: Math.max(640, CARD_GIF.width + 64),
    height: Math.max(480, CARD_GIF.height + 64),
    url: '/src/trackbuilder/animate.html',
  });

  let failed = 0;
  try {
    await page.until('window.__animateReady === true', 60000);
    for (const track of wanted) {
      /* eslint-disable no-await-in-loop */
      const got = await fetch(`${opts.board}/api/tracks/${encodeURIComponent(track.id)}/document`);
      if (!got.ok) {
        console.log(`  ${track.id} ${track.name}: the document answered ${got.status}`);
        failed += 1;
        continue;
      }
      const doc = (await got.json()).document;
      const started = Date.now();
      const result = await page.evaluate(
        `window.__exportTrackGif(${JSON.stringify(doc)}, ${JSON.stringify(CARD_GIF)})`,
      );
      if (!result || !result.ok) {
        console.log(`  ${track.id} ${track.name}: ${result ? result.error : 'the page returned nothing'}`);
        failed += 1;
        continue;
      }
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const kb = (result.bytes / 1024).toFixed(0);
      if (opts.out) {
        await writeFile(join(opts.out, `${slugOf(track.name)}.gif`), Buffer.from(result.base64, 'base64'));
      }
      if (opts.dry) {
        console.log(`  ${track.name}: ${kb} kB in ${secs} s, not uploaded`);
        continue;
      }
      const up = await fetch(`${opts.board}/api/tracks/${encodeURIComponent(track.id)}/gif`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ gif: result.base64 }),
      });
      const answer = await up.json().catch(() => ({}));
      if (!up.ok) {
        console.log(`  ${track.name}: the board refused it, ${answer.error || up.status}`);
        failed += 1;
        continue;
      }
      console.log(`  ${track.name}: ${kb} kB in ${secs} s, on the board`);
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
