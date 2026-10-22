/*
 * stickers.js: stickers stuck round Joshua Bardwell's house and yard, to
 * be found, each one an achievement that plays one of his clips.
 *
 * The owner's ask of 2026-10-22: his clips "should play on only Bardwell's
 * map, add stickers there". The map had none. These are the same kind as
 * Nick Burns' (../house/stickers.js): aimed, not measured, from a point in
 * the plan along a direction, stuck on the first drawn face the line
 * meets, found by the shell's own sticker test (findStickers in
 * src/main.js), called out with the word and how many are found, stamped
 * once per browser. No Bardwell logo has been supplied, so the sticker is
 * a plain one lettered in the simulator's own hand with his initials, die
 * cut on a white border, painted on a canvas when the map is built: no
 * picture to fetch.
 *
 * ONE DRAW CALL for all of them, the same program as the house's stickers.
 * Paint only; nothing here is solid.
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

import { FRAME } from './bardwell.js';
import { aimAt, drawnBoxes } from './logos.js';
import { drawWord, wordWidth, INK, INKS } from '../../ui/lettering.js';

export const STICKER_WORD = 'Stickers';

/* An id, what the callout calls it, where it is aimed from (plan x, plan
 * y, height, metres; y grows north), which way, and how wide. */
export const JB_SPOTS = [
  { id: 'porch', name: 'On the porch', from: [-0.8, 6.5, 1.4], dir: 'n', size: 0.3 },
  { id: 'porch-table', name: 'By the porch table', from: [-3.7, 8, 1.0], dir: 'n', size: 0.22 },
  { id: 'chimney', name: 'On the chimney', from: [-14, 13.5, 1.6], dir: 'e', size: 0.3 },
  { id: 'east-wall', name: 'By the east window', from: [8, 15, 1.5], dir: 'w', size: 0.3 },
  { id: 'air-con', name: 'On the air conditioner', from: [8, 18, 0.5], dir: 'w', size: 0.2 },
  { id: 'back-stoop', name: 'On the back stoop', from: [6, 19.7, 0.3], dir: 'w', size: 0.2 },
  { id: 'woodshed', name: 'On the woodshed', from: [-4, 17.5, 2.0], dir: 'n', size: 0.17 },
  { id: 'firewood', name: 'On the firewood', from: [-2.5, 20, 0.7], dir: 'n', size: 0.3 },
  { id: 'doghouse', name: 'On the doghouse', from: [35.2, -23, 0.55], dir: 'n', size: 0.25 },
  { id: 'lean-to', name: 'In the lean-to', from: [28.4, -22, 1.0], dir: 'n', size: 0.3 },
  { id: 'barrow', name: 'On the wheelbarrow', from: [27.2, -25, 0.5], dir: 'n', size: 0.2 },
  { id: 'mailbox', name: 'On the mailbox', from: [35.6, -95, 1.17], dir: 's', size: 0.2 },
];

const PROUD = 0.012;

/* Each spot stuck on the first drawn box its line meets: { id, name, p,
 * n, w, hit, turn } in the world, PROUD of the face, or null for a spot
 * whose line meets nothing. */
export function placeStickers(parts) {
  const boxes = drawnBoxes(parts);
  return JB_SPOTS.map((spot, i) => {
    const at = aimAt(boxes, spot.from, spot.dir);
    if (!at) {
      return null;
    }
    const p = at.p.map((v, k) => v + at.n[k] * PROUD);
    return { id: spot.id, name: spot.name, p, n: at.n, w: FRAME.S * spot.size, hit: at.hit, turn: ((i * 7919) % 13) / 13 - 0.5 };
  });
}

/*
 * The sticker, painted once when the map is built: a die cut white border
 * round a dark round, "JB" lettered in the simulator's hand in amber. The
 * canvas is the texture (alpha tested, so the border is a real edge) and
 * the picture the found panel shows. `naturalWidth` is set because the
 * panel's crop reads it, as it does on a decoded image.
 */
export function paintSticker(THREE) {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  cv.naturalWidth = N;
  cv.naturalHeight = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(N / 2, N / 2, N / 2 - 4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(N / 2, N / 2, N / 2 - 20, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = INKS.amber;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(N / 2, N / 2, N / 2 - 34, 0, Math.PI * 2);
  g.stroke();
  const px = 112;
  const w = wordWidth(g, 'JB', px);
  drawWord(g, 'JB', (N - w) / 2, N / 2 + px * 0.34, px, INKS.amber);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
