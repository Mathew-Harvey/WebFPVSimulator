/*
 * og.js: the share card, drawn by the thing it advertises.
 *
 * Every link to webfpv.org posted anywhere renders a 1200 by 630 image, and
 * a made-up one would drift out of date the first time the world changed.
 * This one cannot: it is a frame of the real shell, rendered by the real
 * renderer, through scripts/shots.js, which is the same harness every
 * rendering bug in this project was found with.
 *
 * WHAT THE FRAME IS. The title screen on the race field, with the menu, the
 * chips and the body copy hidden so that only the wordmark and its subtitle
 * are left over the world. The camera is parked by hand at the numbers
 * below, off to the right of the course and low, so the lit start gate sits
 * centre with the parked quad in the near left and the flags and markers
 * running away behind it. Those numbers are the whole design: change them
 * and the card changes, so they live here rather than in somebody's shell
 * history.
 *
 * WHY THE MENU GOES AND THE WORDMARK STAYS. A share card is read at about
 * 500 px wide in a feed, next to a headline. The menu is six rows of text
 * that turn to mush at that size, and the paragraph about browser storage is
 * a sentence nobody reads twice. The wordmark survives the shrink, and it is
 * the one thing on the page that says which product this is.
 *
 * REGENERATE, DO NOT EDIT, the same rule as the icons:
 *
 *     npm run gen:og                                  # this repo
 *     node scripts/og.js . ../landingpage-WebFPVSimulator- \
 *                          ../WebFPVSimulator-LeaderBoard/public
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

import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Facebook, X and LinkedIn all read 1.91:1 and all crop anything else. */
const W = 1200;
const H = 630;

/*
 * Everything in the overlay that is not the wordmark. `.brand-best` is the
 * lap chip, which says "No lap recorded yet" on a fresh browser and would
 * put that sentence on every share of the site.
 */
const HIDE = [
  '.menu-stage', '.hint', '.lede', '.title-foot',
  '.bug-chip', '.brand-best', '.keep-note', '.first-note',
];

/* Camera, then the point it looks at. Metres, world frame. */
const CAM = [108.5, 1.4, 11, 104.6, 1.4, -6];

const hide = `${JSON.stringify(HIDE)}.forEach((s) => document.querySelectorAll(s)`
  + `.forEach((n) => { n.style.display = 'none'; }));`
  + `const k = document.querySelector('.music-skip');`
  + `if (k && k.parentElement) { k.parentElement.style.display = 'none'; }`
  + `'hidden'`;

const targets = (process.argv.slice(2).length ? process.argv.slice(2) : ['.'])
  .map((d) => resolve(root, d));

const out = await mkdtemp(join(tmpdir(), 'webfpv-og-'));
try {
  const run = spawnSync('node', [
    join(root, 'scripts/shots.js'),
    `--out=${out}`,
    `--w=${W}`,
    `--h=${H}`,
    /* Headless Chromium rasterises on the CPU, so boot would otherwise
     * detect a slow machine and drop the preset, and the card would come out
     * at a different quality depending on who regenerated it. */
    '--graphics=high',
    'until:!!window.__boot && window.__boot().frames > 2',
    `eval:(() => { ${hide} })()`,
    'wait:400',
    `eval:JSON.stringify((() => { window.__setCam(${CAM.join(',')});`
      + ' window.__ogFrame = window.__boot().frames; return "camera"; })())',
    /* Frames, not milliseconds. __setCam takes effect on the next animation
     * frame, and a wall clock wait would sometimes capture the frame before
     * the camera moved. */
    'until:window.__boot().frames > window.__ogFrame + 4',
    'shot:og',
  ], { cwd: root, stdio: 'inherit' });

  if (run.status !== 0) {
    throw new Error(`shots.js exited ${run.status}`);
  }

  for (const dir of targets) {
    await mkdir(dir, { recursive: true });
    await copyFile(join(out, 'og.png'), join(dir, 'og.png'));
    console.log(`og.png -> ${join(dir, 'og.png')}`);
  }
} finally {
  await rm(out, { recursive: true, force: true });
}
