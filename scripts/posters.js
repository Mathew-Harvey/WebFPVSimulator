/*
 * posters.js: the still on a world card, taken by the world it is a still of.
 *
 * WHAT THIS IS FOR. A first visit to Freestyle has no clips cached, and
 * making them costs a Three.js scene per world on the main thread. The
 * cards used to spend that minute as four dark rectangles with the word
 * "loading" on them, which is the worst possible moment to tell somebody
 * nothing at all about the places they are choosing between. Now the
 * rectangle is a photograph of the place, the clip arrives over the top of
 * it when it is ready, and a pilot who picks before then has still seen
 * what they picked.
 *
 * WHY IT IS RENDERED AND NOT DRAWN, the same argument as scripts/og.js: a
 * hand-made picture of a world drifts out of date the first time the world
 * changes, and nobody notices until somebody flies a town that does not look
 * like its card. This one is a frame of the real shell, rendered by the real
 * renderer through scripts/shots.js.
 *
 * THE CAMERAS BELOW ARE THE DESIGN. One per world, parked by hand, chosen so
 * that the frame reads as a PLACE at 340 px wide on a card: an establishing
 * three quarter with a horizon in it, from outside, far enough back that the
 * world's own landmark is in the shot. Not a corridor and not a wall two
 * metres away. That constraint is the whole brief, so the numbers live here
 * rather than in somebody's shell history, and each one says what it is
 * looking at.
 *
 * REGENERATE, DO NOT EDIT, the same rule as the icons and the share card:
 *
 *     npm run gen:posters                 # all four
 *     node scripts/posters.js city       # just this one
 *
 * A run takes minutes: it builds each world in headless Chromium at the
 * authored preset, one at a time.
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

import { MAPS } from '../src/maps/registry.js';
/* The clip's own frame size, so the still and the clip that replaces it are
 * the same picture at the same shape and the card does not jump. */
import { CLIP_W, CLIP_H } from '../src/share/orbitcache.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The same number og.js and gatecards.js ship at. */
const QUALITY = 82;

/*
 * Camera, then the point it looks at. Metres, world frame, Y up, which is
 * the render frame rather than the physics frame; see CLAUDE.md.
 */
const CAMERAS = {
  /*
   * The high street looking north at the level crossing, from about a
   * first floor window. The town is the one world here that CANNOT be shot
   * from outside: its fog ends at 65 m and its cull radius is 70, so an
   * aerial of the district is a grey square. So the establishing shot is
   * the street itself, which is what the place is anyway, with the sakura
   * and the wires over it and the crossing closing the far end.
   */
  city: [2.6, 4.2, 26, 0, 3.0, 4],
  /*
   * The works from the south east, over the forecourt. Far enough out that
   * the stack, the preheater and the length of the pack hall are all in one
   * frame with the sunset behind them, which is the thing the flythrough
   * spent its whole loop inside of and never once showed.
   */
  /*
   * The corner of the entrance front, so the frame carries both the thing
   * that names the place, CIVIC BATHS over the doors, and the shape of the
   * hall behind it with its stair towers. Shot from above head height
   * because at eye level the boundary hedge takes the bottom half.
   */
  /*
   * The house across the back lawn, deck on, at about tree height. The
   * fence line and the paddock trees give it a horizon, and the sun is low
   * enough that the deck reads as a place somebody lives rather than a
   * cream box.
   */
};

/*
 * The overlay comes off entirely. og.js keeps the wordmark because a share
 * card is an advertisement; this one is a picture INSIDE the interface, and
 * a menu drawn on top of a menu is nonsense.
 */
const HIDE_UI = "(() => { const n = document.getElementById('ui');"
  + " if (n) { n.style.display = 'none'; } return 'hidden'; })()";

const wanted = process.argv.slice(2);
const targets = MAPS.filter((m) => m.poster && CAMERAS[m.id])
  .filter((m) => !wanted.length || wanted.includes(m.id));

if (!targets.length) {
  const known = MAPS.filter((m) => m.poster).map((m) => m.id).join(', ');
  throw new Error(`No poster to make. Known: ${known}`);
}

/* Every map without a camera here would silently ship the loading rectangle,
 * so say so rather than leaving it to somebody's first visit to notice. */
for (const m of MAPS) {
  if (m.poster && !CAMERAS[m.id]) {
    console.warn(`${m.id} declares a poster and has no camera in this file.`);
  }
}

const out = await mkdtemp(join(tmpdir(), 'webfpv-posters-'));
try {
  for (const map of targets) {
    const cam = CAMERAS[map.id];
    const run = spawnSync('node', [
      join(root, 'scripts/shots.js'),
      `--out=${out}`,
      `--w=${CLIP_W}`,
      `--h=${CLIP_H}`,
      /* JPEG, because this ships. A card is 340 px wide and the lossless
       * copy is four times the bytes for a difference nobody can see. The
       * quality is the one og.js and gatecards.js use, so the three
       * generators that put a rendered frame in the tree all put the same
       * kind of frame in it. */
      `--jpeg=${QUALITY}`,
      /* Headless Chromium rasterises on the CPU, so boot would otherwise
       * detect a slow machine and drop the preset, and the poster would
       * come out at whatever quality the machine that made it happened to
       * pick. The authored look, every time. */
      '--graphics=high',
      'until:!!window.__boot && window.__boot().frames > 2',
      `eval:(() => { window.__setMap(${JSON.stringify(map.id)}); return 'swap'; })()`,
      /* Both halves. `ready` alone is true of the previous world for a
       * frame or two, so the id has to agree before the camera is parked. */
      `until:window.__map().id === ${JSON.stringify(map.id)} && window.__map().ready`,
      `eval:${HIDE_UI}`,
      /* The world's own animation and the sun's shadow map both settle over
       * a few frames after a swap; a capture taken on the first one has
       * black shadows and stopped traffic. */
      'wait:900',
      `eval:JSON.stringify((() => { window.__setCam(${cam.join(',')});`
        + ' window.__posterFrame = window.__boot().frames; return "camera"; })())',
      /* Frames, not milliseconds. __setCam takes effect on the next
       * animation frame, and a wall clock wait on a software rasteriser
       * sometimes captures the frame before the camera moved. */
      'until:window.__boot().frames > window.__posterFrame + 5',
      `shot:${map.id}`,
    ], { cwd: root, stdio: 'inherit' });

    if (run.status !== 0) {
      throw new Error(`shots.js exited ${run.status} on ${map.id}`);
    }

    const dest = resolve(root, map.poster);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(out, `${map.id}.jpg`), dest);
    console.log(`${map.id} -> ${dest}`);
  }
} finally {
  await rm(out, { recursive: true, force: true });
}
