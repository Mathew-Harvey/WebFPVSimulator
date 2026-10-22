/*
 * og.js: the share card, drawn in the simulator's own manga hand.
 *
 * Every link to webfpv.org posted anywhere renders a 1200 by 630 image, and
 * until 2026-10-22 the one the simulator and the board used was a frame of
 * the race field under a plain wordmark, the look the product had before its
 * menus became manga pages. This draws the card the product looks like now:
 * paper, ink panels, and the wordmark and the panel captions lettered by
 * src/ui/lettering.js, the very code the shell letters its titles with, so
 * the card cannot drift from the hand.
 *
 * No dev text on it, by the owner's rule for anything a player reads.
 *
 * WHAT IT IS MADE OF. scripts/og.html draws it on a canvas from three
 * pictures the shell already ships (assets/gate/race.jpg, assets/thumbs/city.jpg,
 * assets/gate/whoop.jpg). This script serves the repo, opens that page in
 * headless Chromium, and photographs the canvas as a JPEG: a JPEG because a
 * card of flat ink and three pictures is about 150 kB that way and several
 * times that as a PNG, and WhatsApp is reported to drop a preview over about
 * 300 kB. The data a visitor's link costs somebody is the whole reason.
 *
 * REGENERATE, DO NOT EDIT, the same rule as the icons:
 *
 *     npm run gen:og                                  # this repo, og.jpg
 *     node scripts/og.js . ../WebFPVSimulator-LeaderBoard/public
 *
 * A directory named on the command line gets og.jpg, and the board's copy
 * carries the board's own line under the wordmark. Not the front door: its
 * card is its own first screen, drawn by its own scripts/og.js.
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
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Facebook, X and LinkedIn all read 1.91:1 and all crop anything else. */
const W = 1200;
const H = 630;
const QUALITY = 84;

/* The board's copy says what the board is for, in its own words. */
const BOARD_LINE = 'Maps and Tracks, and the times flown on them.';

const targets = (process.argv.slice(2).length ? process.argv.slice(2) : ['.'])
  .map((d) => resolve(root, d));

async function draw(query) {
  const page = await openPage({
    root, width: W, height: H, url: `/scripts/og.html${query}`,
  });
  try {
    await page.until('window.__done === true', 30000);
    if (page.errors.length) {
      throw new Error(page.errors.join('\n'));
    }
    const shot = await page.cdp.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: QUALITY,
      clip: {
        x: 0, y: 0, width: W, height: H, scale: 1,
      },
    }, page.sessionId);
    return Buffer.from(shot.data, 'base64');
  } finally {
    await page.close();
  }
}

for (const dir of targets) {
  const board = /LeaderBoard/i.test(dir);
  const bytes = await draw(board ? `?line=${encodeURIComponent(BOARD_LINE)}&sub=${encodeURIComponent('Pick one, fly it, and see where you land.')}` : '');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'og.jpg'), bytes);
  console.log(`og.jpg (${bytes.length} bytes) -> ${join(dir, 'og.jpg')}`);
}
