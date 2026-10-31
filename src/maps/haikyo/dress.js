/*
 * dress.js: what the people left. The set dressing of the estate (./frame.js
 * dress): the rooms' tatami and paper doors, the fridges and the
 * televisions, the futons still over the balustrades, the poles and the
 * washing on the balconies, the air conditioners, the umbrellas and the
 * tricycles in the corridors, the shops' counters, the clinic's beds, the
 * ivy up the gables and the junk in the courtyard.
 *
 * None of it is solid and all of it is fine, so Low draws none of it and
 * the flight is the same on every preset; High and Medium draw it near the
 * camera only (NEAR_R in ./index.js). A pilot brushes through a futon as a
 * five inch would, near enough, and never meets a thing that is not drawn.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { rng } from './frame.js';
import { BLOCK, WALLS, BALCONIES, FLOOR_HOLES, DROP_BAY, PILOTIS_BAY } from './danchi.js';
import { ANNEX, BOILER } from './annex.js';
import { SITE } from './site.js';

const CLOTHS = ['bldClothPink', 'bldClothBlue', 'bldClothYellow', 'bldClothWhite', 'bldFuton'];

/* Whether a plan point on floor k of Block 1 is over a hole in that floor. */
function overHole(k, x, y, pad = 0.4) {
  return FLOOR_HOLES.some((q) => q.k === k && x > q.x0 - pad && x < q.x1 + pad && y > q.y0 - pad && y < q.y1 + pad);
}

export function estateDressing(T) {
  const r = rng(0xd7e55e);
  T.dress(() => {
    rooms(T, r);
    balconies(T, r);
    corridors(T, r);
    annexRooms(T, r);
    yard(T, r);
  });
  T.dress(() => T.wide(() => ivy(T, r)));
}

/* THE FLATS: each a front room of tatami behind the sliding doors and a
 * kitchen of boards along the corridor, and what was left in them. */
function rooms(T, r) {
  const B = BLOCK;
  for (let k = 0; k < B.floors; k += 1) {
    const h = k * B.fh;
    for (let i = 0; i < B.n; i += 1) {
      const w = WALLS[`${i},${k}`];
      if (w.south === 'none' || (i === PILOTIS_BAY && k === 0)) {
        continue;
      }
      const xa = B.x0 + i * B.bay + 0.4;
      const xb = xa + B.bay - 0.8;
      /* The tatami, six mats in two rows of three, edged; some lifted. */
      for (let a = 0; a < 3; a += 1) {
        for (let b = 0; b < 2; b += 1) {
          const x0 = xa + 0.1 + a * 1.75;
          const y0 = B.yS + 0.4 + b * 0.9;
          if (overHole(k, x0 + 0.9, y0 + 0.45) || r.chance(0.18)) {
            continue;
          }
          T.paint('hkTatami', x0, y0, h + 0.005, x0 + 1.72, y0 + 0.88, h + 0.055);
          T.paint('hkTatamiEdge', x0, y0, h + 0.055, x0 + 1.72, y0 + 0.06, h + 0.06);
        }
      }
      /* The kitchen's boards, the counter and its sink along the corridor
       * wall. */
      if (!overHole(k, xa + 2.5, B.yN - 1.5, 0)) {
        T.paint('hkBoards', xa, B.yN - 3.2, h + 0.005, xb, B.yN - 0.15, h + 0.03);
      }
      if (r.chance(0.7) && !overHole(k, xa + 4, B.yN - 0.6)) {
        T.deco('hkFridge', xa + 2.9, B.yN - 0.75, h, xa + 4.9, B.yN - 0.12, h + 0.85);
        T.deco('metal', xa + 3.4, B.yN - 0.6, h + 0.85, xa + 4.1, B.yN - 0.2, h + 0.87);
        /* and the tiles over it, the one wipeable wall in the flat */
        T.paint('hkBathTile', xa + 2.9, B.yN - 0.13, h + 0.87, xa + 4.9, B.yN - 0.11, h + 1.55);
      }
      /* A paper door fallen flat, a wardrobe's doors, a fridge, a
       * television on its back, a heap of bedding, boxes. */
      const things = r.int(2, 4);
      for (let n = 0; n < things; n += 1) {
        const x = r.range(xa + 0.4, xb - 0.6);
        const y = r.range(B.yS + 0.5, B.yN - 1.2);
        if (overHole(k, x, y, 0.8)) {
          continue;
        }
        const kind = r.int(0, 5);
        if (kind === 0) {
          T.deco('hkFusuma', x - 0.45, y - 0.9, h + 0.06, x + 0.45, y + 0.9, h + 0.1);
        } else if (kind === 1) {
          T.deco('hkFridge', x - 0.3, y - 0.3, h, x + 0.3, y + 0.3, h + 1.3);
        } else if (kind === 2) {
          T.deco('hkTelly', x - 0.3, y - 0.25, h, x + 0.3, y + 0.25, h + 0.45);
        } else if (kind === 3) {
          T.deco(r.pick(CLOTHS), x - 0.8, y - 0.5, h, x + 0.8, y + 0.5, h + 0.25);
        } else if (kind === 4) {
          T.deco('hkCardboard', x - 0.25, y - 0.2, h, x + 0.25, y + 0.2, h + 0.4);
          T.deco('hkCardboard', x - 0.15, y - 0.1, h + 0.4, x + 0.2, y + 0.2, h + 0.7);
        } else {
          T.deco('hkBoards', x - 0.45, y - 0.3, h, x + 0.45, y + 0.3, h + 1.7);
        }
      }
      /* Ceiling boards hanging down from the slab over the front room. */
      if (r.chance(0.35)) {
        const x = r.range(xa + 0.5, xb - 1.5);
        T.deco('hkWallpaper', x, B.yS + 1.2, h + B.fh - B.slab - 0.9, x + 1.2, B.yS + 1.24, h + B.fh - B.slab);
      }
    }
  }
  /* Rubble at the foot of every hole, on the floor under it. */
  for (const q of FLOOR_HOLES) {
    if (q.k > 4 || q.k < 1) {
      continue;
    }
    const h = (q.k - 1) * BLOCK.fh;
    if (q.k === 1 && q.x0 > BLOCK.x0 + DROP_BAY * BLOCK.bay && q.x1 < BLOCK.x0 + (DROP_BAY + 1) * BLOCK.bay) {
      /* Not in the drop's run out: leave the ground floor's line clear. */
      continue;
    }
    for (let n = 0; n < 6; n += 1) {
      const x = r.range(q.x0, q.x1);
      const y = r.range(q.y0, q.y1);
      const s = r.range(0.15, 0.45);
      T.deco('rubble', x - s, y - s, h, x + s, y + s * 0.8, h + s * 0.6);
    }
  }
}

/* THE BALCONIES: washing poles and what is still on them, futons over
 * the balustrade, the air conditioners' outdoor units, buckets and dead
 * plants. */
function balconies(T, r) {
  const B = BLOCK;
  for (let k = 1; k < B.floors; k += 1) {
    const h = k * B.fh;
    for (let i = 0; i < B.n; i += 1) {
      const x0 = B.x0 + i * B.bay;
      if (k === 4 && i >= 10) {
        continue;
      }
      if (r.chance(0.6)) {
        /* The pole on its two hangers off the slab above. */
        const hp = h + 2.05;
        T.cyl('metal', [x0 + 0.6, 99.1, hp], [x0 + 5.4, 99.1, hp], 0.02, 3);
        for (const x of [x0 + 0.8, x0 + 5.2]) {
          T.cyl('metal', [x, 99.1, hp], [x, 99.1, h + B.fh - B.slab], 0.012, 3);
        }
        for (let c = 0; c < r.int(0, 4); c += 1) {
          const x = r.range(x0 + 1, x0 + 5);
          T.deco(r.pick(CLOTHS), x - 0.3, 99.06, hp - r.range(0.5, 0.9), x + 0.3, 99.14, hp);
        }
      }
      if (!BALCONIES.lost.has(`${i},${k}`) && r.chance(0.25)) {
        const x = r.range(x0 + 1.2, x0 + 4.8);
        T.deco(r.pick(['bldFuton', 'bldClothBlue', 'bldClothPink']), x - 0.9, B.yB - 0.06, h + 0.3, x + 0.9, B.yB + 0.26, h + B.parapet + 0.06);
      }
      if (r.chance(0.45)) {
        T.deco('acUnit', x0 + 4.4, 98.5, h, x0 + 5.2, 98.85, h + 0.6);
        T.cyl('hkFridge', [x0 + 5.0, 98.9, h + 0.4], [x0 + 5.0, 99.95, h + 2.0], 0.03, 3);
      }
      if (r.chance(0.4)) {
        const x = r.range(x0 + 0.8, x0 + 3.5);
        T.cyl('hkPlayBlue', [x, 99.0, h], [x, 99.0, h + 0.3], 0.16, 6, 0.2);
        T.cone('hkWeedDry', x + 0.5, 99.3, h, 0.25, 0.7, 5);
      }
    }
  }
}

/* THE CORRIDORS: a lamp over every door, dead, an umbrella in a corner, a
 * tricycle, a pot. */
function corridors(T, r) {
  const B = BLOCK;
  for (let k = 1; k < B.floors; k += 1) {
    const h = k * B.fh;
    for (let i = 0; i < B.n; i += 1) {
      const x0 = B.x0 + i * B.bay;
      T.deco('hkFridge', x0 + 2.6, 109.0, h + B.fh - B.slab - 0.12, x0 + 3.0, 109.4, h + B.fh - B.slab);
      if (r.chance(0.2)) {
        T.cyl('hkInk', [x0 + 1.9, 108.25, h], [x0 + 1.95, 108.4, h + 0.9], 0.02, 3);
      }
      if (r.chance(0.12)) {
        const x = x0 + r.range(1, 5);
        T.torus('hkPlayRed', x, 109.6, h + 0.15, 0.14, 0.03, 1, 0, 3, 8);
        T.deco('hkPlayRed', x - 0.3, 109.5, h + 0.3, x + 0.3, 109.7, h + 0.36);
      }
      if (r.chance(0.2)) {
        T.cone('hkWeed', x0 + r.range(1, 5), 110.1, h, 0.2, 0.5, 5);
      }
    }
  }
}

/* THE ANNEX's ROOMS: the shops' counters and shelves on the ground floor,
 * the clinic's bed frames and chairs on the first, the offices' desks on
 * the second. */
function annexRooms(T, r) {
  const A = ANNEX;
  for (let j = 0; j < A.n; j += 1) {
    const y0 = A.y0 + j * A.bay + 0.6;
    const y1 = y0 + A.bay - 1.2;
    if (j !== 6) {
      T.deco('hkBoards', 124.8, y0 + 0.4, 0, 125.4, y1 - 0.4, 0.95);
    }
    T.deco('metal', 131.2, y0, 0, 131.6, y1, 1.8);
    for (let n = 0; n < 4; n += 1) {
      const y = r.range(y0, y1);
      T.deco('hkCardboard', 130.4, y - 0.2, 0, 130.9, y + 0.2, r.range(0.2, 0.5));
    }
    for (let k = 1; k < A.floors; k += 1) {
      const h = k * A.fh;
      const n = r.int(1, 3);
      for (let m = 0; m < n; m += 1) {
        const x = r.range(124, 130.5);
        const y = r.range(y0 + 0.4, y1 - 0.4);
        if (k === 1) {
          T.deco('metal', x - 0.45, y - 1.0, h + 0.5, x + 0.45, y + 1.0, h + 0.56);
          T.deco('hkMattress', x - 0.42, y - 0.95, h + 0.56, x + 0.42, y + 0.95, h + 0.66);
          for (const [dx, dy] of [[-0.42, -0.95], [0.42, -0.95], [-0.42, 0.95], [0.42, 0.95]]) {
            T.cyl('metal', [x + dx, y + dy, h], [x + dx, y + dy, h + 0.5], 0.02, 3);
          }
        } else {
          T.deco('hkSash', x - 0.6, y - 0.4, h + 0.7, x + 0.6, y + 0.4, h + 0.74);
          T.deco('metal', x - 0.55, y - 0.35, h, x - 0.45, y + 0.35, h + 0.7);
          T.deco('metal', x + 0.45, y - 0.35, h, x + 0.55, y + 0.35, h + 0.7);
        }
      }
      /* Paper strewn on the corridor floor. */
      for (let m = 0; m < 3; m += 1) {
        const y = r.range(y0, y1);
        const x = r.range(120.4, 122.2);
        T.paint('hkFusuma', x - 0.15, y - 0.2, h + 0.005, x + 0.15, y + 0.2, h + 0.012);
      }
    }
  }
}

/* THE YARD: a sofa in the courtyard, tyres, a fridge on its side, the
 * fallen pieces of balcony under the block, an old moped. */
function yard(T, r) {
  const B = BLOCK;
  T.deco('hkMattress', 108, 86, 0, 110.2, 87, 0.45);
  T.deco('hkMattress', 108, 86.8, 0.45, 110.2, 87, 0.95);
  T.deco('hkFridge', 113, 44, 0, 114.7, 44.7, 0.7);
  for (let n = 0; n < 7; n += 1) {
    const x = r.range(136, 150);
    const y = r.range(36, 108);
    T.torus('hkTelly', x, y, 0.15 + n * 0, 0.36, 0.13, 0, 0, 5, 10);
  }
  for (let n = 0; n < 12; n += 1) {
    const x = r.range(B.x0 + 1, B.x1 - 1);
    const y = r.range(B.yB - 3, B.yB - 0.4);
    if (Math.abs(x - (B.x0 + PILOTIS_BAY * B.bay + 3)) < 3.5 || Math.abs(x - (B.x0 + DROP_BAY * B.bay + 3)) < 2.5) {
      continue;
    }
    const s = r.range(0.2, 0.55);
    T.deco(r.pick(['rubble', 'hkRender', 'concreteWorn']), x - s, y - s * 0.6, 0, x + s, y + s * 0.6, s * 0.7);
  }
  /* The old moped by the boiler house door. */
  T.torus('hkTelly', BOILER.x1 + 1.2, BOILER.y0 + 1.2, 0.25, 0.22, 0.06, 0, 1, 4, 10);
  T.torus('hkTelly', BOILER.x1 + 1.2, BOILER.y0 + 2.4, 0.25, 0.22, 0.06, 0, 1, 4, 10);
  T.deco('hkPlayRed', BOILER.x1 + 1.0, BOILER.y0 + 1.3, 0.3, BOILER.x1 + 1.4, BOILER.y0 + 2.3, 0.75);
  void SITE;
}

/* IVY up the west gable, the boiler house, the annex's south end and the
 * block walls: strips of leaf hung down the faces, each a little proud. */
/*
 * One climbing vine on a flat face: a stem up from the ground and leaves
 * in clumps along it, each clump a different width and off centre by a
 * different amount, wider at the foot where it has grown longest, so the
 * silhouette is ragged the way a hand inks one and never reads as a
 * letter. `face(u0, u1, h0, h1)` paints a patch on the face, `u` along it.
 */
function vine(face, u, top, r) {
  face(u - 0.06, u + 0.06, 0, top);
  for (let h = 0; h < top - 0.3; h += r.range(0.45, 0.8)) {
    const reach = 0.35 + 1.1 * (1 - h / top);
    const lean = r.range(-0.5, 0.5) * reach;
    const w = r.range(0.35, 1) * reach;
    face(u + lean - w, u + lean + w, h, Math.min(top, h + r.range(0.5, 0.9)));
  }
}

function ivy(T, r) {
  const B = BLOCK;
  const west = (u0, u1, h0, h1) => T.paint('hkIvy', B.x0 - 0.27, u0, h0, B.x0 - 0.23, u1, h1);
  for (let n = 0; n < 7; n += 1) {
    vine(west, r.range(B.yB + 1, B.yC - 1.2), r.range(4, 13), r);
  }
  const boiler = (u0, u1, h0, h1) => T.paint('hkIvy', u0, BOILER.y0 - 0.16, h0, u1, BOILER.y0 - 0.13, h1);
  for (let n = 0; n < 4; n += 1) {
    vine(boiler, r.range(BOILER.x0 + 1, BOILER.door0 - 1.2), r.range(2, BOILER.h + 0.3), r);
  }
  const annexSouth = (u0, u1, h0, h1) => T.paint('hkIvy', u0, ANNEX.y0 - 0.14, h0, u1, ANNEX.y0 - 0.11, h1);
  for (let n = 0; n < 3; n += 1) {
    vine(annexSouth, r.range(ANNEX.x0 + 1, 123), r.range(2, 6), r);
  }
  for (let n = 0; n < 10; n += 1) {
    const y = r.range(SITE.y0 + 2, SITE.y1 - 2);
    T.paint('hkIvy', SITE.x0 + 0.12, y, 0, SITE.x0 + 0.15, y + r.range(0.6, 2.2), r.range(0.8, 1.75));
  }
}
