/*
 * boardpresets.js: put the shipped tracks on a board, cards and all.
 *
 * WHY THIS EXISTS. The builder ships a set of tracks. A pilot who opens one
 * gets a copy under a fresh id, flies it, and never publishes it, because
 * publishing somebody else's reconstruction under your own name is not a
 * thing most people do. So the board's whoop side stayed almost empty while
 * the simulator carried three finished rooms, and a visitor who arrived at
 * the board first saw a series with one track in it. This is the one way the
 * shipped set reaches the board as itself.
 *
 * THE ID IS DERIVED FROM THE PRESET'S, NOT MINTED. newTrackId is random,
 * which is right for a track a pilot builds and wrong for this: a second run
 * of a random id is a second copy of the same track on the board, which is
 * the exact failure this is meant to repair. sha256 of the preset id, first
 * eight hex, is the same id on every machine and on every run.
 *
 * THE AUTHOR IS WHO BROUGHT THE TRACK OVER, NOT WHO DESIGNED IT. The board's
 * `author` is the seat that published, and the RaceGOW5 set is eight tracks
 * by seven designers reconstructed from the official animations. Crediting
 * the designer in that field would claim they published here, which they did
 * not; the designer, the series and the source ride in the document's own
 * credit block, where the card prints them. So the author is credit.
 * broughtOverBy, and --author overrides it for a fork.
 *
 * WHY IT DRIVES A BROWSER. A room's card on the board is an animation of one
 * lap of it, and only a browser can draw one: the scene is Three.js, Three.js
 * is WebGL, and the board renders nothing and never will. Same machinery as
 * scripts/boardgif.js and for the same reason, which is also why the two
 * produce the same picture: both call exportTrackGif through
 * src/trackbuilder/animate.html.
 *
 * WHY A RE-RUN NEEDS THE TOKEN AND A FIRST RUN DOES NOT. The board mints an
 * edit key on a first publish and that key is the only way to update the
 * track afterwards. This script uses the key it was just handed to upload the
 * card and then forgets it, deliberately: an edit key written to a file in a
 * public repository is a published secret. So a track already on the board is
 * left alone unless --replace is given, and --replace takes it off with
 * BOARD_ADMIN_TOKEN and publishes it again from scratch. That removes the
 * times posted on it, which is why it is a flag and not the default.
 *
 * usage:
 *   node scripts/boardpresets.js --board https://webfpv.org/board --dry
 *   BOARD_ADMIN_TOKEN=... node scripts/boardpresets.js --board ... --replace
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

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { CARD_GIF } from '../src/trackbuilder/animate.js';
import { PRESETS } from '../src/trackbuilder/presets.js';
import { TRACK_CLASSES } from '../src/trackbuilder/elements.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * WHAT A SHIPPED TRACK IS FOR, in the board's own vocabulary.
 *
 * Two, not five. 'race' because these are a published race series' tracks
 * rather than a drill somebody built to practise one turn, and 'micro'
 * because the board's word for a small field is what a room is. A third
 * would be a guess about somebody else's track, and a tag that is a guess
 * is worse than no tag: it answers a filter it should not have answered.
 */
const PRESET_TAGS = ['race', 'micro'];

function usage() {
  console.log('usage: node scripts/boardpresets.js [options]');
  console.log('  --board <origin>   the board, default http://127.0.0.1:3100');
  console.log('  --class <name>     which shipped set, default micro');
  console.log('  --author <name>    who published, default the track\'s own broughtOverBy');
  console.log('  --preset <id>      just this one, by its preset id');
  console.log('  --replace          take an id already on the board off first, and its times with it');
  console.log('  --dry              say what would happen, send nothing');
  console.log('');
  console.log('  --replace needs BOARD_ADMIN_TOKEN in the environment, set to the same');
  console.log('  value as the board service\'s own. A first publish needs no token at');
  console.log('  all: the board mints the edit key and hands it back, and this uses it');
  console.log('  to upload the card seconds later.');
  console.log('');
  console.log('  Chromium here runs on a software rasteriser, so budget five to ten');
  console.log('  seconds a room rather than the second it takes on real hardware.');
}

function parseArgs(argv) {
  const opts = {
    board: process.env.BOARD_ORIGIN || 'http://127.0.0.1:3100',
    trackClass: 'micro',
    author: '',
    preset: '',
    replace: false,
    dry: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { return null; }
    if (a === '--board') { opts.board = argv[i + 1]; i += 1; continue; }
    if (a === '--class') { opts.trackClass = argv[i + 1]; i += 1; continue; }
    if (a === '--author') { opts.author = argv[i + 1]; i += 1; continue; }
    if (a === '--preset') { opts.preset = argv[i + 1]; i += 1; continue; }
    if (a === '--replace') { opts.replace = true; continue; }
    if (a === '--dry') { opts.dry = true; continue; }
    throw new Error(`unknown option ${a}`);
  }
  opts.board = String(opts.board || '').replace(/\/+$/, '');
  if (!opts.board) {
    throw new Error('--board wants an origin');
  }
  if (!TRACK_CLASSES.includes(opts.trackClass)) {
    throw new Error(`--class wants one of ${TRACK_CLASSES.join(', ')}`);
  }
  return opts;
}

/*
 * The board's id for a shipped track. Prefixed before hashing so that a
 * preset id and anything else that might one day be hashed into a trk- id
 * cannot land on the same eight characters by agreeing about their input.
 */
export function boardIdForPreset(presetId) {
  const hex = createHash('sha256').update(`webfpv/preset/${presetId}`).digest('hex');
  return `trk-${hex.slice(0, 8)}`;
}

/* A first publish, which carries no edit key: the board mints one and hands
 * it back, and an id already on the board is refused rather than taken over,
 * which is why the caller removes one first. */
async function publish({ board, doc, author }) {
  const sent = await fetch(`${board}/api/tracks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author, document: doc, tags: PRESET_TAGS }),
  });
  const answer = await sent.json().catch(() => ({}));
  if (!sent.ok) {
    return { error: answer.error || `the board answered ${sent.status}` };
  }
  return { id: answer.id, name: answer.name, editKey: answer.editKey };
}

async function remove({ board, id, token }) {
  const gone = await fetch(`${board}/api/tracks/${encodeURIComponent(id)}/remove`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  const answer = await gone.json().catch(() => ({}));
  if (!gone.ok) {
    return { error: answer.error || `the board answered ${gone.status}` };
  }
  return answer;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`boardpresets: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  if (!opts) {
    usage();
    process.exitCode = 1;
    return;
  }

  const token = String(process.env.BOARD_ADMIN_TOKEN || '');
  if (opts.replace && !token && !opts.dry) {
    console.error('boardpresets: --replace needs BOARD_ADMIN_TOKEN, because taking a track off the board is the one thing an edit key cannot do.');
    process.exitCode = 1;
    return;
  }

  const wanted = PRESETS
    .filter((p) => (p.trackClass || 'full') === opts.trackClass)
    .filter((p) => (opts.preset ? p.id === opts.preset : true));
  if (!wanted.length) {
    console.error(`boardpresets: no shipped ${opts.trackClass} track matched`);
    process.exitCode = 1;
    return;
  }

  console.log(`boardpresets: ${opts.board}`);
  const listed = await fetch(`${opts.board}/api/tracks`);
  if (!listed.ok) {
    console.error(`boardpresets: the board answered ${listed.status}`);
    process.exitCode = 1;
    return;
  }
  const onBoard = new Map(((await listed.json()).tracks || []).map((t) => [t.id, t]));
  console.log(`  ${onBoard.size} tracks there, ${wanted.length} shipped ${opts.trackClass} track(s) to place`);

  /* ONE BROWSER FOR THE WHOLE RUN, opened before the first publish and only
   * if there is a card to draw. Starting Chromium costs more than rendering
   * a room does, and animate.html holds nothing between calls. */
  let page = null;
  const needsCard = opts.trackClass === 'micro' && !opts.dry;
  let failed = 0;
  try {
    for (const preset of wanted) {
      /* eslint-disable no-await-in-loop */
      const id = boardIdForPreset(preset.id);
      const author = opts.author || preset.credit?.broughtOverBy || '';
      if (!author) {
        console.log(`  ${preset.name}: nobody to publish it as. Pass --author.`);
        failed += 1;
        continue;
      }
      const already = onBoard.get(id);
      if (already && !opts.replace) {
        console.log(`  ${preset.name}: already on the board as ${id}, ${already.times} time(s) posted. --replace to redo it.`);
        continue;
      }
      if (already && opts.dry) {
        console.log(`  ${preset.name}: would replace ${id}, losing ${already.times} time(s)`);
        continue;
      }
      if (already) {
        const gone = await remove({ board: opts.board, id, token });
        if (gone.error) {
          console.log(`  ${preset.name}: could not take the old one off, ${gone.error}`);
          failed += 1;
          continue;
        }
        console.log(`  ${preset.name}: took ${id} off, with ${gone.times} time(s)`);
      }
      if (opts.dry) {
        console.log(`  ${preset.name}: would publish as ${id}, by ${author}`);
        continue;
      }

      /* The shipped document, with the board's id on it. A copy, so the
       * module's own object is never mutated and a second call sees the
       * preset as it shipped. */
      const doc = JSON.parse(JSON.stringify(preset));
      doc.id = id;
      const posted = await publish({ board: opts.board, doc, author });
      if (posted.error) {
        console.log(`  ${preset.name}: the board refused it, ${posted.error}`);
        failed += 1;
        continue;
      }
      console.log(`  ${preset.name}: published as ${posted.id}, by ${author}`);

      if (!needsCard) {
        continue;
      }
      if (!page) {
        page = await openPage({
          root,
          width: Math.max(640, CARD_GIF.width + 64),
          height: Math.max(480, CARD_GIF.height + 64),
          url: '/src/trackbuilder/animate.html',
        });
        await page.until('window.__animateReady === true', 60000);
      }
      const started = Date.now();
      const drawn = await page.evaluate(
        `window.__exportTrackGif(${JSON.stringify(doc)}, ${JSON.stringify(CARD_GIF)})`,
      );
      if (!drawn || !drawn.ok) {
        console.log(`    its card could not be drawn: ${drawn ? drawn.error : 'the page returned nothing'}`);
        failed += 1;
        continue;
      }
      /* The edit key the board just handed back, used here and never
       * written down. An admin token would work too and is not reached for:
       * the narrower credential is the one that should do the job. */
      const up = await fetch(`${opts.board}/api/tracks/${encodeURIComponent(posted.id)}/gif`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gif: drawn.base64, editKey: posted.editKey }),
      });
      const answer = await up.json().catch(() => ({}));
      if (!up.ok) {
        console.log(`    its card was refused: ${answer.error || up.status}`);
        failed += 1;
        continue;
      }
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`    its card is a lap of it, ${(drawn.bytes / 1024).toFixed(0)} kB in ${secs} s`);
      /* eslint-enable no-await-in-loop */
    }
  } finally {
    if (page) {
      await page.close();
    }
  }

  if (failed) {
    console.log(`  ${failed} failed`);
    process.exitCode = 1;
  }
}

await main();
