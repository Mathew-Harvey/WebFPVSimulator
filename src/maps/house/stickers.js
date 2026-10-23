/*
 * stickers.js: Nick Burns' NB sticker, stuck round his house to be found.
 *
 * The owner's ask of 2026-10-18: "put nick burns logo in the map when you
 * frame it, achievement is, 'stickers'". The logo is the NB mark the owner
 * gave the same evening, cut from its white and set on a die cut border
 * (the top of ../../../assets/house/nb-sheet.webp, NOTICE). It is stuck in ten
 * places, a room each, and framing one, which is the shell's own test for
 * a sticker (seesMark in src/game/egg.js: near enough, in front of it, in
 * the middle of the picture and nothing in between), calls out "Stickers"
 * with the sticker and how many this browser has found, every time it
 * comes back into sight, as the Infinity Loops map's do (findStickers in
 * src/main.js). Each find is stamped once, under the house's key.
 *
 * WHERE. Each sticker is aimed, not measured: a point in a room, real
 * metres in the plan, and the way to look from it. placeStickers walks
 * that line through the house's drawn boxes and sticks the sticker on the
 * first face it meets, a centimetre proud, square to it and turned a few
 * degrees as a hand sticks one. So a wall or a cupboard that moves takes
 * its sticker with it, and check:house says where each one landed.
 *
 * ONE DRAW CALL for all ten, the same program as Nick's card (a texture,
 * alpha tested, no fog). Paint only; nothing here is solid. The picture
 * in the upstairs hall (HALL_PICTURE in ./house.js) is drawn in the same
 * mesh off the same sheet, so it costs two triangles and no call.
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

import { FRAME, FLOOR0, FLOOR1, BF, HALL_PICTURE } from './house.js';

/* One sheet, 512 by 640: the sticker in the top 512 by 512, and under it,
 * past 32 rows of nothing, the hall's picture at (8, 552), 447 by 65, its
 * edge pixels carried out round it so its smaller mip levels keep their
 * edges. Each piece as [u0, v0, u1, v1], v up from the sheet's foot as
 * the texture is drawn, and the sticker's piece as the shell's callout
 * crops it (findStickers in src/main.js), shares from the top left. */
export const STICKER_URL = new URL('../../../assets/house/nb-sheet.webp', import.meta.url).href;
export const SHEET = { sticker: [0, 0.2, 1, 1], picture: [8 / 512, 1 - 617 / 640, 455 / 512, 1 - 552 / 640] };
export const STICKER_CROP = { x: 0, y: 0, w: 1, h: 0.8 };
export const STICKER_WORD = 'Stickers';

/* Which way to look from a spot: east, west, north (to the back), south
 * (to the street), down. In the world, plan y runs to -z. */
const DIRS = { e: [1, 0, 0], w: [-1, 0, 0], n: [0, 0, -1], s: [0, 0, 1], down: [0, -1, 0] };

/* The ten: an id, what the callout calls it, where it is aimed from (plan
 * x, plan y, height, real metres), which way, and how wide it is. */
export const NB_SPOTS = [
  { id: 'front-door', name: 'By the front door', from: [5.2, -2.0, FLOOR0 + 1.35], dir: 'n', size: 0.26 },
  { id: 'hall', name: 'In the hall', from: [7.2, 2.6, FLOOR0 + 1.55], dir: 'e', size: 0.24 },
  { id: 'dining', name: 'On the dining room hutch', from: [2.3, 2.1, FLOOR0 + 1.1], dir: 'w', size: 0.2 },
  { id: 'family', name: 'In the family room', from: [2.0, 6.4, FLOOR0 + 1.6], dir: 'w', size: 0.24 },
  { id: 'island', name: 'On the kitchen island', from: [11.6, 5.2, FLOOR0 + 0.6], dir: 'n', size: 0.22 },
  { id: 'landing', name: 'At the top of the stair', from: [6.0, 3.6, FLOOR1 + 1.5], dir: 'w', size: 0.24 },
  { id: 'upstairs', name: 'Upstairs', from: [2.5, 6.0, FLOOR1 + 1.4], dir: 'n', size: 0.24 },
  { id: 'lounge', name: 'In the basement lounge', from: [2.1, 2.5, BF + 1.45], dir: 'w', size: 0.24 },
  { id: 'workshop', name: 'In the workshop', from: [12.0, 4.0, BF + 1.3], dir: 'e', size: 0.26 },
  { id: 'back', name: 'Out the back', from: [3.0, 10.5, FLOOR0 + 1.5], dir: 's', size: 0.3 },
];

/* Furthest a spot looks for a face, real metres. */
const REACH = 6;
/* How far proud of the face, world metres. */
const PROUD = 0.012;

/*
 * Where a line from `from` (plan x, plan y, height, real metres) the way
 * `dir` names first meets a box in `boxes`, within REACH: { p, n, hit } in
 * the world, `p` on the face and `n` the face's normal, back along the
 * line, with `hit` the box's name. Null for a line that meets nothing.
 * The supporters' signs are hung the same way (./supporters.js).
 */
export function aimAt(boxes, from, dir) {
  const { OX, OZ, S } = FRAME;
  const o = [OX + S * from[0], S * from[2], OZ - S * from[1]];
  const d = DIRS[dir];
  let best = Infinity;
  let hit = null;
  for (const b of boxes) {
    let t0 = 0;
    let t1 = S * REACH;
    for (let k = 0; k < 3; k += 1) {
      if (d[k] === 0) {
        if (o[k] < b.lo[k] || o[k] > b.hi[k]) {
          t0 = Infinity;
          break;
        }
        continue;
      }
      const a = (b.lo[k] - o[k]) / d[k];
      const c = (b.hi[k] - o[k]) / d[k];
      t0 = Math.max(t0, Math.min(a, c));
      t1 = Math.min(t1, Math.max(a, c));
    }
    if (t0 <= t1 && t0 > 1e-6 && t0 < best) {
      best = t0;
      hit = b;
    }
  }
  if (!hit) {
    return null;
  }
  return { p: o.map((v, k) => v + d[k] * best), n: d.map((v) => -v), hit: hit.name || hit.m };
}

/* The boxes a sticker or a sign can be stuck on: the drawn ones. */
export const drawnBoxes = (parts) => parts.filter((p) => p.t === 'box' && p.draw);

/*
 * Each spot stuck on the first drawn box its line meets: { id, name, p,
 * n, w, hit } in the world frame, PROUD of the face, with `w` the
 * sticker's width and `hit` the box's name, or null for a spot whose line
 * meets nothing.
 */
export function placeStickers(parts) {
  const boxes = drawnBoxes(parts);
  return NB_SPOTS.map((spot, i) => {
    const at = aimAt(boxes, spot.from, spot.dir);
    if (!at) {
      return null;
    }
    const p = at.p.map((v, k) => v + at.n[k] * PROUD);
    return {
      id: spot.id, name: spot.name, p, n: at.n, w: FRAME.S * spot.size, hit: at.hit, turn: ((i * 7919) % 13) / 13 - 0.5, uv: SHEET.sticker,
    };
  });
}

/*
 * The hall's picture on its frame's mount: aimed as a sticker is, from the
 * hall at the picture's middle, PROUD of the first face its line meets,
 * which is the mount, upright and square to the wall. { p, n, w, h, uv,
 * hit } in the world frame, or null if the line meets nothing.
 */
export function placeHallPicture(parts) {
  const P = HALL_PICTURE;
  const at = aimAt(drawnBoxes(parts), [P.x, P.from, P.h], 's');
  if (!at) {
    return null;
  }
  const p = at.p.map((v, k) => v + at.n[k] * PROUD);
  return { id: 'hall-picture', p, n: at.n, w: FRAME.S * P.w, h: FRAME.S * P.ht, uv: SHEET.picture, turn: 0, hit: at.hit };
}

export { stickerMesh } from '../stickermesh.js';
