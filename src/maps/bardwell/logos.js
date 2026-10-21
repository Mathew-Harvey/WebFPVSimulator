/*
 * logos.js: the sponsors' logos all over Joshua Bardwell's house, where
 * each one goes, and the one picture the painted ones are cut from. Pure
 * data and arithmetic, no Three.js and no DOM, so check:bardwell can say
 * where every one landed. Heads' house's (../heads/logos.js) done again
 * for this place, the owner's ask of 2026-10-21: "do the same as we did
 * for heads house". Two kinds:
 *
 *   SIGNS    every brand on the roster (src/partners/roster.js) hung once
 *            as its painted sign, found and stamped as on every freestyle
 *            map, the partners findable and the patrons paint, through the
 *            built map's `markSpots`. Eight, so eight draw calls.
 *   DECALS   the same signs again on the road, on banner boards on the
 *            field's fence, on the barn, the sheds, the long building, the
 *            house and the brick wall: quads of one picture (ATLAS) in one
 *            lit mesh, so thirty logos cost one draw call and one texture.
 *
 * Each is aimed, as Nick's and Heads' are: a point in the plan, metres,
 * and the way to look; it goes on the first drawn face that line meets.
 * One on the road is aimed down and lies over the highest drawn top under
 * any of it.
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

import { FRAME, BANNERS } from './bardwell.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';

export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS];
const BY_SLUG = new Map(BRANDS.map((p) => [p.slug, p]));

/* ------------------------------------------------------------------ */
/* The atlas                                                           */
/* ------------------------------------------------------------------ */

/* One picture, the roster's signs in columns, each its own aspect and PAD
 * apart so a mip level does not bleed one into the next: { x, y, w, h }
 * in pixels, y down. */
export const ATLAS_W = 1024;
export const ATLAS_H = 512;
const PAD = 4;
const SIGN_PX = 320;

function packAtlas() {
  const cells = {};
  let x = 0;
  let y = 0;
  for (const p of BRANDS) {
    const h = Math.round(SIGN_PX / signAspect(p));
    if (y + h > ATLAS_H) {
      x += SIGN_PX + PAD;
      y = 0;
    }
    if (x + SIGN_PX > ATLAS_W || y + h > ATLAS_H) {
      throw new Error(`bardwell logos: ${p.slug} does not fit in the atlas`);
    }
    cells[p.slug] = { x, y, w: SIGN_PX, h };
    y += h + PAD;
  }
  return cells;
}
export const CELLS = packAtlas();

/* ------------------------------------------------------------------ */
/* Aiming                                                              */
/* ------------------------------------------------------------------ */

const DIRS = { e: [1, 0, 0], w: [-1, 0, 0], n: [0, 0, -1], s: [0, 0, 1], down: [0, -1, 0] };
const REACH = 6;
const PROUD = 0.012;

export const drawnBoxes = (parts) => parts.filter((p) => p.t === 'box' && p.draw);

/* Where a line from `from` (plan x, plan y, height) the way `dir` names
 * first meets a drawn box within REACH: { p, n, hit } in the world, or
 * null. Heads' house's aimAt (../heads/logos.js) in this place's frame. */
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

/* A brand's logo `w` metres wide aimed from `from` the way `dir` names:
 * { p, n, up, w, h, hit } in the world. Aimed down it lies flat with its
 * top toward `top`, over the highest drawn top under any of it. */
function aimLogo(boxes, slug, from, dir, wReal, top = 'n') {
  const { OX, OZ, S } = FRAME;
  const w = S * wReal;
  const h = w / signAspect(BY_SLUG.get(slug));
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
  return at ? { p: at.p, n: at.n, up: [0, 1, 0], w, h, hit: at.hit } : null;
}

/* ------------------------------------------------------------------ */
/* The signs                                                           */
/* ------------------------------------------------------------------ */

/* Each brand's sign: where it is aimed from (plan x, plan y, height,
 * metres), which way, and how wide. Seven where the yard and the field
 * see them, one on the house. */
export const SIGN_SPOTS = [
  /* Over the barn's big door, seen from the loop. */
  { slug: 'gds', from: [30, 4, 3.55], dir: 'n', w: 1.8 },
  /* The long building's side to the drive, between two windows. */
  { slug: 'mantisfpv', from: [4.8, -60, 1.5], dir: 'e', w: 2.6 },
  /* The brick wall, inside the courtyard. */
  { slug: 'wcmrc', from: [11.5, 17.6, 1.6], dir: 'n', w: 2.0 },
  /* The brick wall's back, to the woods. */
  { slug: 'webleedfpv', from: [4, 21, 1.5], dir: 's', w: 1.9 },
  /* The blue shed in the field. */
  { slug: 'mattsflooring', from: [33, -74.5, 1.2], dir: 'w', w: 2.4 },
  /* The barn's east wall. */
  { slug: 'yourfpv', from: [36, 12.5, 2.2], dir: 'w', w: 1.4 },
  /* The long building's north end, over its window. */
  { slug: 'quadconfig', from: [9, -52, 2.3], dir: 's', w: 2.0 },
  /* The house's west end, between its windows. */
  { slug: 'konexdrone', from: [-2, 5.0, 2.0], dir: 'e', w: 1.4 },
];

/* Each sign on the first drawn face its line meets, as `markSpots` wants
 * it: { slug, p, n, up, w, chunk, hit }, `p` on the face, or null. */
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

/* The road's middle line, in the plan. */
const ROAD_Y = -112;
/* A banner's logo: as wide as fits the board's 0.74 m of height, and no
 * wider than 2.4 m. */
const bannerW = (slug) => Math.min(2.4, 0.74 * signAspect(BY_SLUG.get(slug)));
const BANNER_ORDER = [
  'gds', 'mantisfpv', 'wcmrc', 'webleedfpv', 'mattsflooring', 'yourfpv',
  'quadconfig', 'konexdrone', 'gds', 'mantisfpv', 'wcmrc', 'webleedfpv',
];

/* Each decal: the brand, where it is aimed from, which way, how wide, and
 * the plan way its top faces when it lies flat. */
export const DECAL_SPOTS = [
  /* THE ROAD, every brand painted along its middle, reading from the
   * field, clear of where the drive comes out. */
  ...[-40, -28, -16, 12, 24, 36, 48, 60].map((x, i) => ({ slug: BRANDS[i].slug, from: [x, ROAD_Y, 3], dir: 'down', w: 4.0, top: 's' })),
  /* THE FENCE: a banner on each board (BANNERS in ./bardwell.js), looking
   * at it from the side it faces. */
  ...BANNERS.map((b, i) => {
    const slug = BANNER_ORDER[i];
    const off = b.side * 1.5;
    const from = b.dir === 'x' ? [b.along, b.at + off, 0.75] : [b.at + off, b.along, 0.75];
    const dir = b.dir === 'x' ? (b.side > 0 ? 's' : 'n') : (b.side > 0 ? 'w' : 'e');
    return { slug, from, dir, w: bannerW(slug) };
  }),
  /* THE BUILDINGS: in the barn's open bay, the barn's north end, the long
   * building over its deck, the blue shed's north side, the house's east
   * end and its front under the porch. */
  { slug: 'mattsflooring', from: [24.5, 8.0, 2.1], dir: 'e', w: 1.6 },
  { slug: 'yourfpv', from: [27.5, 20, 2.2], dir: 's', w: 1.3 },
  { slug: 'quadconfig', from: [15.5, -60.5, 2.0], dir: 'w', w: 1.6 },
  { slug: 'konexdrone', from: [30, -71, 1.2], dir: 's', w: 1.8 },
  { slug: 'mantisfpv', from: [18, 5, 2.0], dir: 'w', w: 1.6 },
  { slug: 'webleedfpv', from: [9.4, -1.5, 2.05], dir: 'n', w: 1.15 },
  /* THE BRICK WALL, inside over the grills and at the courtyard's end,
   * and outside. */
  { slug: 'gds', from: [0.5, 17.6, 1.75], dir: 'n', w: 1.6 },
  { slug: 'wcmrc', from: [15.2, 17.6, 1.6], dir: 'n', w: 1.6 },
  { slug: 'yourfpv', from: [12, 21, 1.5], dir: 's', w: 1.3 },
];

/* Each decal placed: { cell, p, n, up, w, h, hit }, PROUD of its face, or
 * null for a line that meets nothing. */
export function placeDecals(parts) {
  const boxes = drawnBoxes(parts);
  return DECAL_SPOTS.map((d) => {
    const at = aimLogo(boxes, d.slug, d.from, d.dir, d.w, d.top);
    if (!at) {
      return null;
    }
    return { cell: d.slug, ...at, p: at.p.map((v, k) => v + at.n[k] * PROUD) };
  });
}
