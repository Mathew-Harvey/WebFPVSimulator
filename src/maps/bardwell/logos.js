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
 *   DECALS   the same signs again along the road and on the banner stands
 *            round the course, the lean-to and the timber stand: quads of
 *            one picture (ATLAS) in one lit mesh, so thirty logos cost one
 *            draw call and one texture.
 *
 * The house itself carries none: it is Joshua's, and the race's furniture
 * is where a race puts its sponsors. Each is aimed, as Nick's and Heads'
 * are: a point in the plan, metres, and the way to look; it goes on the
 * first drawn face that line meets. One on the road is aimed down and lies
 * over the highest drawn top under any of it.
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

import { FRAME, STANDS, ROAD } from './bardwell.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import { FLOOR_MARKS } from '../yardtrack/yardtrack.js';

export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS];
const BY_SLUG = new Map(BRANDS.map((p) => [p.slug, p]));

/* ------------------------------------------------------------------ */
/* The atlas                                                           */
/* ------------------------------------------------------------------ */

/* One picture, the roster's signs in columns, each its own aspect and PAD
 * apart so a mip level does not bleed one into the next: { x, y, w, h }
 * in pixels, y down. */
export const ATLAS_W = 1024;
export const ATLAS_H = 768;
const PAD = 4;
const SIGN_PX = 320;

function packAtlas() {
  const cells = {};
  let x = 0;
  let y = 0;
  /* The roster's signs, and the yard track's two floor pictures
   * (../yardtrack/), each cell named by the slug or the key. */
  const items = [
    ...BRANDS.map((p) => ({ name: p.slug, a: signAspect(p) })),
    ...FLOOR_MARKS.map((m) => ({ name: m.key, a: m.aspect })),
  ];
  for (const it of items) {
    const h = Math.round(SIGN_PX / it.a);
    if (y + h > ATLAS_H) {
      x += SIGN_PX + PAD;
      y = 0;
    }
    if (x + SIGN_PX > ATLAS_W || y + h > ATLAS_H) {
      throw new Error(`bardwell logos: ${it.name} does not fit in the atlas`);
    }
    cells[it.name] = { x, y, w: SIGN_PX, h };
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
 * metres), which way, and how wide. Six on the banner stands round the
 * course, one on the lean-to's back to the yard, one on the timber stand's
 * board. */
export const SIGN_SPOTS = [
  /* The stand north of the start, to the start. */
  { slug: 'gds', from: [22.5, 29, 1.15], dir: 'n', w: 2.3 },
  /* The two stands either side of the run to the cage. */
  { slug: 'mantisfpv', from: [52, 28, 1.15], dir: 'n', w: 2.6 },
  { slug: 'wcmrc', from: [52, 21.5, 1.15], dir: 's', w: 2.3 },
  /* The stand by the hoops, to the line up the field. */
  { slug: 'webleedfpv', from: [65.5, -10, 1.15], dir: 'e', w: 2.0 },
  /* The lean-to's plank back, to the yard. */
  { slug: 'mattsflooring', from: [29.5, -16.5, 1.4], dir: 's', w: 2.2 },
  /* The timber stand's board, to the yard. */
  { slug: 'yourfpv', from: [32.5, -11, 4.07], dir: 's', w: 1.3 },
  /* The stand inside the north fence, to the field. */
  { slug: 'quadconfig', from: [30, 45, 1.15], dir: 'n', w: 2.6 },
  /* The stand in the west woods, to the line past the flags. */
  { slug: 'konexdrone', from: [-26.5, 18, 1.15], dir: 'e', w: 2.3 },
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

/* A stand's banner: as wide as fits the board's 1.2 m of height, and no
 * wider than 2.7 m. */
const bannerW = (slug) => Math.min(2.7, 1.05 * signAspect(BY_SLUG.get(slug)));

/* Each stand's two faces, from its own side: the face its sign is on, if
 * it has one, and the other. A stand with no sign gets two decals. */
function standFaces(s) {
  const off = 2.5;
  return s.dir === 'x'
    ? [{ from: [s.px, s.py - off, 1.15], dir: 'n' }, { from: [s.px, s.py + off, 1.15], dir: 's' }]
    : [{ from: [s.px - off, s.py, 1.15], dir: 'e' }, { from: [s.px + off, s.py, 1.15], dir: 'w' }];
}
/* Which brand each stand face carries, in STANDS order, two a stand; a
 * null is the face a sign is hung on. */
const STAND_BRANDS = [
  [null, 'mattsflooring'], [null, 'yourfpv'], ['quadconfig', null], [null, 'konexdrone'], ['gds', 'mantisfpv'],
  [null, 'wcmrc'], [null, 'webleedfpv'], ['yourfpv', 'quadconfig'], ['konexdrone', 'gds'], ['mantisfpv', 'wcmrc'],
];

/* Each decal: the brand, where it is aimed from, which way, how wide, and
 * the plan way its top faces when it lies flat. */
export const DECAL_SPOTS = [
  /* THE ROAD, every brand painted twice along its middle, reading from
   * the house, clear of where the drive comes in. */
  ...[-44, -34, -24, -14, -4, 6, 16, 26, 52, 62, 72, 82, 92, 102, 108, -48].map((x, i) => ({
    slug: BRANDS[i % BRANDS.length].slug, from: [x, ROAD.y, 3], dir: 'down', w: 3.6, top: 's',
  })),
  /* THE STANDS, the faces their signs are not on. */
  ...STANDS.flatMap((s, i) => standFaces(s).map((f, k) => {
    const slug = STAND_BRANDS[i][k];
    return slug ? { slug, ...f, w: bannerW(slug) } : null;
  })).filter(Boolean),
  /* Inside the lean-to, and the timber stand's board's back. */
  { slug: 'webleedfpv', from: [29.5, -20.5, 1.4], dir: 'n', w: 1.4 },
  { slug: 'wcmrc', from: [32.5, -14.5, 4.07], dir: 'n', w: 1.4 },
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
