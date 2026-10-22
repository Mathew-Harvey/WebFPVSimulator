/*
 * logos.js: the logos all over Heads' house, where each one goes, and the
 * one picture they are all cut from. Pure data and arithmetic, no Three.js
 * and no DOM, so check:heads can say where every one landed.
 *
 * The owner's ask of 2026-10-20: "make it an official map, ensure the
 * sponsors logos are all over it, and also infinity loops and 90%er logos".
 * Three kinds, each the way the simulator already does that kind:
 *
 *   SIGNS     every brand on the roster (src/partners/roster.js) hung once
 *             as its painted sign, found and stamped as on every other
 *             freestyle map: the partners and the map only partners are
 *             finds, the patrons are paint. Hung by hand, as Nick Burns'
 *             house hangs its supporters' (../house/supporters.js), because
 *             the map's chooser cannot see a structure of the map's own,
 *             and painted by the built map as a chosen one is (`markSpots`).
 *             Eight, so eight draw calls, the count any freestyle map pays.
 *   DECALS    the same signs again, and the Infinity Loops logos and the
 *             90% patch, painted on the street, the fence, the house's
 *             walls and the rooms: the "all over it". Every one is a quad
 *             in one of two meshes on one picture (ATLAS below), lit paint
 *             outside and unlit inside, the way the garage's prints were
 *             already drawn, so forty logos cost two draw calls and one
 *             texture rather than forty of each.
 *   PATCHES   the 90% patch stuck round the house and the yard to be found,
 *             each a sticker whose find is the achievement "90%er", called
 *             out every time it comes back into sight, as the Infinity
 *             Loops map's are (../specials.js) and Nick's NB stickers are.
 *
 * WHERE. Each is aimed, not measured, the way Nick's are: a point in the
 * plan (real metres, plan x east, plan y north, height up) and the way to
 * look from it; it goes on the first drawn face that line meets, so a wall
 * that moves takes its logos with it. One on the ground is aimed down and
 * sits over the highest thing under any of its corners, the street's
 * centre line included, or on the lawn where nothing is drawn under it.
 *
 * THE PICTURES are the roster's own signs (src/art/partnermark.js, never
 * redrawn here) and pieces of the 90%ers' sticker sheets that the Infinity
 * Loops map wears (assets/stickers/infinityloops/, NOTICE), cut by the crops
 * that map's own rows give them, so the logo on both maps is one picture.
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

import { FRAME, FL, FM, FU } from './heads.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import { SHEETS, STICKERS, ACHIEVEMENT } from '../specials/infinityloops.js';

export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS];
export { SHEETS, ACHIEVEMENT };

/* The two sheets' sizes in pixels, which the crops are shares of.
 * check:heads reads them off the files. */
export const SHEET_PX = [[2048, 620], [2048, 408]];

/* A row of the Infinity Loops map's stickers by its id, as a crop on its
 * sheet: { sheet (0 or 1), x, y, w, h } in shares, and its name. */
function crop(id) {
  const r = STICKERS.find((row) => row[0] === id);
  return { id, name: r[1], sheet: r[7] - 1, x: r[8], y: r[9], w: r[10], h: r[11] };
}
export const IL_LOGO = crop('el-2037');
export const IL_OUTLINE = crop('el-2040');
export const PATCH = crop('el-2041');
/* The 90%ers' own stickers, every find on that map but the 90% patches,
 * for the sticker wall over Heads' bench. */
export const WALL_STICKERS = STICKERS.filter((r) => r[12] === 1 && r[1] !== '90%').map((r) => crop(r[0]));

const cropAspect = (c) => (c.w * SHEET_PX[c.sheet][0]) / (c.h * SHEET_PX[c.sheet][1]);

/* ------------------------------------------------------------------ */
/* The atlas                                                           */
/* ------------------------------------------------------------------ */

/*
 * One picture, ATLAS_W by ATLAS_H, every logo a cell of it: { x, y, w, h }
 * in pixels, y down. The garage's four prints keep their shapes across the
 * top; under them a column packer stands the roster's signs, the two
 * Infinity Loops logos and the patch in columns, each its own aspect and
 * PAD apart, so a mip level does not bleed one into the next.
 */
export const ATLAS_W = 2048;
export const ATLAS_H = 1024;
const PAD = 4;
const SIGN_PX = 360;

const CELL_ASPECT = {};
function packAtlas() {
  const cells = {
    stickers: { x: 0, y: 0, w: 1024, h: 428 },
    banner: { x: 1024, y: 0, w: 1024, h: 333 },
    sign: { x: 1024, y: 337, w: 448, h: 60 },
    flag: { x: 1476, y: 337, w: 172, h: 96 },
  };
  const items = [
    ...BRANDS.map((p) => ({ name: p.slug, w: SIGN_PX, a: signAspect(p) })),
    { name: 'il', w: SIGN_PX, a: cropAspect(IL_LOGO) },
    { name: 'patch', w: 256, a: cropAspect(PATCH) },
    { name: 'ilOutline', w: 491, a: cropAspect(IL_OUTLINE) },
  ];
  const top = 436;
  let x = 0;
  let y = top;
  let wide = 0;
  for (const it of items) {
    const h = Math.round(it.w / it.a);
    if (y + h > ATLAS_H) {
      x += wide + PAD;
      y = top;
      wide = 0;
    }
    if (x + it.w > ATLAS_W || y + h > ATLAS_H) {
      throw new Error(`heads logos: ${it.name} does not fit in the atlas`);
    }
    cells[it.name] = { x, y, w: it.w, h };
    CELL_ASPECT[it.name] = it.a;
    y += h + PAD;
    wide = Math.max(wide, it.w);
  }
  return cells;
}
export const CELLS = packAtlas();

/* A cell's width over its height as drawn on a face: the artwork's own,
 * not the rounded pixels'. */
export function cellAspect(name) {
  return CELL_ASPECT[name] ?? CELLS[name].w / CELLS[name].h;
}

/* ------------------------------------------------------------------ */
/* Aiming                                                              */
/* ------------------------------------------------------------------ */

/* Which way to look: east, west, north (to the back), south (to the
 * street), down, up. In the world, plan y runs to -z. */
const DIRS = { e: [1, 0, 0], w: [-1, 0, 0], n: [0, 0, -1], s: [0, 0, 1], down: [0, -1, 0], up: [0, 1, 0] };

/* Furthest a line looks for a face, real metres. */
const REACH = 6;
/* How far proud of its face a decal or a patch stands, world metres. */
const PROUD = 0.012;

/* The boxes a logo can go on: the drawn ones. */
export const drawnBoxes = (parts) => parts.filter((p) => p.t === 'box' && p.draw);

/*
 * Where a line from `from` (plan x, plan y, height, real metres) the way
 * `dir` names first meets a box in `boxes`, within REACH: { p, n, hit } in
 * the world, `p` on the face and `n` its normal back along the line, `hit`
 * the box's name. Null for a line that meets nothing. Nick Burns' house's
 * aimAt (../house/stickers.js) in this house's frame.
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

/*
 * A logo of `w` real metres in the cell `cell`, aimed from `from` the way
 * `dir` names: { p, n, up, w, h, hit } in the world, `p` the middle of the
 * face it is on, `w` and `h` world metres, or null for a line that meets
 * nothing. One aimed down lies on the ground with its top toward `top`
 * (a plan way, 'n' by default), over the highest drawn top that reaches
 * under any of it from below `from`'s height, so a street's lines stay
 * under its paint, or on the lawn where nothing drawn is under it; one
 * aimed up is stuck under what it meets, its top toward `top` the same way.
 */
function aimLogo(boxes, cell, from, dir, wReal, top = 'n') {
  const { OX, OZ, S } = FRAME;
  const w = S * wReal;
  const h = w / cellAspect(cell);
  if (dir === 'down') {
    const up = DIRS[top];
    const x = OX + S * from[0];
    const z = OZ - S * from[1];
    const hx = Math.abs(up[0]) > 0 ? h / 2 : w / 2;
    const hz = Math.abs(up[0]) > 0 ? w / 2 : h / 2;
    const below = S * from[2];
    let y = 0;
    let hit = 'ground';
    for (const b of boxes) {
      if (b.hi[1] < below && b.hi[1] > y && b.lo[0] < x + hx && b.hi[0] > x - hx && b.lo[2] < z + hz && b.hi[2] > z - hz) {
        y = b.hi[1];
        hit = b.name || b.m;
      }
    }
    return { p: [x, y, z], n: [0, 1, 0], up, w, h, hit };
  }
  const at = aimAt(boxes, from, dir);
  if (!at) {
    return null;
  }
  return { p: at.p, n: at.n, up: dir === 'up' ? DIRS[top] : [0, 1, 0], w, h, hit: at.hit };
}

/* ------------------------------------------------------------------ */
/* The signs                                                           */
/* ------------------------------------------------------------------ */

/* Each brand's sign: where it is aimed from (plan x, plan y, height, real
 * metres), which way, and how wide it is in real metres. Its height is its
 * artwork's. Seven outside where the street, the drive and the yard see
 * them, one in the garage the pilot starts in. */
export const SIGN_SPOTS = [
  /* The two storey part's east wall, upstairs between its windows, over
   * the drive. */
  { slug: 'gds', from: [19.5, 4.4, 3.8], dir: 'w', w: 2.2 },
  /* The wing's west wall under its two windows, to the cross street. */
  { slug: 'mantisfpv', from: [-1.5, 4.25, 1.1], dir: 'e', w: 3.4 },
  /* The garage's back wall, outside, to the back yard. */
  { slug: 'wcmrc', from: [15.9, 10.0, 1.25], dir: 's', w: 2.0 },
  /* The back fence, inside, facing the house across the lawn. */
  { slug: 'webleedfpv', from: [4.93, 22.5, 0.95], dir: 'n', w: 1.9 },
  /* The west fence, outside, to the cross street. */
  { slug: 'mattsflooring', from: [-8.0, 13.425, 1.0], dir: 'e', w: 2.1 },
  /* In the garage, the west wall past the flag, by the bench. */
  { slug: 'yourfpv', from: [14.6, 7.0, 1.3], dir: 'w', w: 0.8 },
  /* The east fence, inside. */
  { slug: 'quadconfig', from: [19.5, 15.775, 1.0], dir: 'e', w: 2.2 },
  /* The fence between the side gate and the house, to the front. */
  { slug: 'konexdrone', from: [-1.2, 3.5, 1.0], dir: 'n', w: 1.6 },
];

/* Each sign on the first drawn face its line meets, as `markSpots` wants
 * it: { slug, p, n, up, w, chunk, hit }, `p` on the face. Null for a line
 * that meets nothing. */
export function placeSigns(parts, chunk) {
  const boxes = drawnBoxes(parts);
  return SIGN_SPOTS.map((spot) => {
    const at = aimAt(boxes, spot.from, spot.dir);
    if (!at) {
      return null;
    }
    return { slug: spot.slug, p: at.p, n: at.n, up: [0, 1, 0], w: FRAME.S * spot.w, chunk, hit: at.hit };
  });
}

/* ------------------------------------------------------------------ */
/* The decals                                                          */
/* ------------------------------------------------------------------ */

/* The street's middle lines, the cross street's middle, in the plan. */
const STREET_A = -16.8;
const STREET_B = -15.0;

/* Each decal: its cell, where it is aimed from, which way, how wide in
 * real metres, the plan way its top faces when it lies flat, and whether
 * it is indoors (drawn unlit, as the garage's prints are). */
const SLUGS = BRANDS.map((p) => p.slug);
export const DECAL_SPOTS = [
  /* THE STREET, painted the way a race paints its sponsors on the road:
   * every brand along Street A, reading from the house's side, the 90%
   * patch in front of the house, and the Infinity Loops logo over the
   * crossing. Clear of the parked cars and of the kerb returns. */
  ...[-39, -32, -1, 15, 22, 29, 36, 43].map((x, i) => ({ cell: SLUGS[i], from: [x, STREET_A, 3], dir: 'down', w: 3.2, top: 's' })),
  { cell: 'patch', from: [7, STREET_A, 3], dir: 'down', w: 3.0, top: 's' },
  { cell: 'il', from: [STREET_B, STREET_A, 3], dir: 'down', w: 6.0, top: 's' },
  /* The cross street, reading from the house's side, north of the
   * crossing and south of it. */
  ...[[2, 'yourfpv'], [10, 'quadconfig'], [18, 'mantisfpv'], [26, 'mattsflooring'], [-34, 'konexdrone'], [-42, 'wcmrc']]
    .map(([y, cell]) => ({ cell, from: [STREET_B, y, 3], dir: 'down', w: 3.0, top: 'w' })),
  /* THE BACK LAWN: the big outlined Infinity Loops logo, reading from
   * the house, between the deck box and the tree. */
  { cell: 'ilOutline', from: [12.5, 19.0, 3], dir: 'down', w: 6.0, top: 'n' },
  /* THE FENCE, a banner a panel, the way a race hangs them, each in the
   * middle of the bay between two posts so no post stands through it: the
   * back fence inside, the west fence both sides, the east fence inside,
   * the front runs outside. */
  { cell: 'mantisfpv', from: [-2.62, 22.5, 1.0], dir: 'n', w: 2.2 },
  { cell: 'gds', from: [2.41, 22.5, 1.0], dir: 'n', w: 1.9 },
  { cell: 'il', from: [9.97, 22.5, 1.0], dir: 'n', w: 1.9 },
  { cell: 'wcmrc', from: [15.0, 22.5, 1.0], dir: 'n', w: 1.9 },
  { cell: 'yourfpv', from: [20.04, 22.5, 1.0], dir: 'n', w: 1.2 },
  { cell: 'gds', from: [-8.0, 8.725, 1.0], dir: 'e', w: 2.0 },
  { cell: 'il', from: [-8.0, 20.475, 1.0], dir: 'e', w: 1.9 },
  { cell: 'quadconfig', from: [-5.0, 11.075, 1.0], dir: 'w', w: 2.1 },
  { cell: 'konexdrone', from: [-5.0, 18.125, 1.0], dir: 'w', w: 1.9 },
  { cell: 'webleedfpv', from: [19.5, 8.725, 1.0], dir: 'e', w: 1.8 },
  { cell: 'mantisfpv', from: [19.5, 20.475, 1.0], dir: 'e', w: 2.2 },
  { cell: 'webleedfpv', from: [-5.0, 3.5, 1.0], dir: 'n', w: 1.6 },
  { cell: 'mattsflooring', from: [19.65, 3.5, 1.0], dir: 'n', w: 2.0 },
  /* THE HOUSE, outside: the upstairs front between its windows, the
   * basement's front, the wing's back wall over the grill, the upstairs
   * back, the garage's east wall. */
  { cell: 'il', from: [11.3, -1.5, 3.8], dir: 'n', w: 2.0 },
  { cell: 'webleedfpv', from: [14.7, -1.5, 3.8], dir: 'n', w: 1.5 },
  { cell: 'wcmrc', from: [9.75, -1.5, 1.65], dir: 'n', w: 1.4 },
  { cell: 'il', from: [4.3, 10.0, 2.2], dir: 's', w: 1.8 },
  { cell: 'konexdrone', from: [14.55, 10.0, 3.8], dir: 's', w: 1.6 },
  { cell: 'mantisfpv', from: [19.5, 4.2, 1.0], dir: 'w', w: 2.8 },
  /* INSIDE: the open garage door's underside, the basement's walls, the
   * living room, the bedrooms. */
  { cell: 'il', from: [15.9, 1.2, 1.5], dir: 'up', w: 2.2, top: 'n', inside: true },
  { cell: 'il', from: [9.5, 6.9, FL + 1.55], dir: 'w', w: 1.3, inside: true },
  { cell: 'gds', from: [12.5, 2.2, FL + 1.45], dir: 'e', w: 1.4, inside: true },
  { cell: 'webleedfpv', from: [12.5, 6.4, FL + 1.45], dir: 'e', w: 1.2, inside: true },
  { cell: 'il', from: [1.0, 3.5, FM + 1.6], dir: 'w', w: 0.9, inside: true },
  /* Over the TV on the wall across the middle (../heads.js mainFloor). */
  { cell: 'konexdrone', from: [4.95, 3.0, FM + 1.75], dir: 'n', w: 1.3, inside: true },
  { cell: 'mattsflooring', from: [15.0, 2.5, FU + 1.6], dir: 'n', w: 1.6, inside: true },
  { cell: 'gds', from: [11.8, 6.5, FU + 1.6], dir: 'n', w: 0.8, inside: true },
];

/* Each decal placed: { cell, p, n, up, w, h, inside, hit }, PROUD of its
 * face, or null for a line that meets nothing. */
export function placeDecals(parts) {
  const boxes = drawnBoxes(parts);
  return DECAL_SPOTS.map((d) => {
    const at = aimLogo(boxes, d.cell, d.from, d.dir, d.w, d.top);
    if (!at) {
      return null;
    }
    return { cell: d.cell, ...at, p: at.p.map((v, k) => v + at.n[k] * PROUD), inside: Boolean(d.inside) };
  });
}

/* ------------------------------------------------------------------ */
/* The patches                                                         */
/* ------------------------------------------------------------------ */

/* The eleven 90% patches to be found: an id, what the callout calls it,
 * where it is aimed from, which way, how wide (real metres), indoors or
 * out, and for one laid flat the plan way its top faces. The last is on
 * the drive under Heads' car, top to the east so it reads from the gap
 * between the two cars, where a pilot low enough sees it under the sill,
 * and from the line in under the car from that side (the owner,
 * 2026-10-22: "good spot to hide a 90% too"). */
export const PATCH_SPOTS = [
  { id: 'front-door', name: 'By the front door', from: [5.9, -1.5, 2.0], dir: 'n', w: 0.45 },
  { id: 'garage', name: 'In the garage', from: [15.0, 0.95, 1.4], dir: 'w', w: 0.4, inside: true },
  { id: 'basement', name: 'On the basement cabinet', from: [10.8, 6.8, FL + 1.4], dir: 'n', w: 0.35, inside: true },
  { id: 'living', name: 'On the living room table', from: [2.4, 2.3, FM + 1.0], dir: 'down', w: 0.35, inside: true },
  { id: 'fridge', name: 'On the fridge', from: [7.0, 4.6, FM + 1.3], dir: 'e', w: 0.3, inside: true },
  { id: 'upstairs', name: 'Upstairs', from: [15.1, 6.5, FU + 1.6], dir: 'n', w: 0.5, inside: true },
  { id: 'dresser', name: 'On the bedroom dresser', from: [16.5, 1.05, FU + 0.5], dir: 'e', w: 0.3, inside: true },
  { id: 'grill', name: 'On the grill', from: [4.3, 10.5, 0.6], dir: 's', w: 0.35 },
  { id: 'deck-box', name: 'On the deck box', from: [8.1, 14.65, 1.5], dir: 'down', w: 0.4 },
  { id: 'mailbox', name: 'On the mailbox', from: [18.5, -8.6, 1.17], dir: 'e', w: 0.22 },
  { id: 'under-car', name: 'Under the car on the drive', from: [16.95, -3.15, 0.1], dir: 'down', w: 0.3, top: 'e' },
];

/* Each patch placed: { id, name, p, n, up, w, h, inside, hit, turn }, or
 * null. Turned a few degrees each, as a hand sticks one. */
export function placePatches(parts) {
  const boxes = drawnBoxes(parts);
  return PATCH_SPOTS.map((s, i) => {
    const at = aimLogo(boxes, 'patch', s.from, s.dir, s.w, s.top);
    if (!at) {
      return null;
    }
    return {
      id: s.id, name: s.name, ...at, p: at.p.map((v, k) => v + at.n[k] * PROUD), inside: Boolean(s.inside), turn: (((i * 7919) % 13) / 13 - 0.5) * 0.35,
    };
  });
}

