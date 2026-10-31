/*
 * hotels.js: the five blocks of the Hotel Shiokaze, the island's reason
 * for being a map. One block written once and stood five times along the
 * cliff, as a seaside resort built its annexes one after another to the
 * same drawing, each then gone to ruin its own way.
 *
 * THE BLOCK is a Showa era resort block of seven floors, three metres
 * floor to floor (the brief's figure, and a Japanese hotel's), the shape
 * Hashima's flats share with every hot spring hotel of the sixties: a long
 * slab of rooms, a balcony the length of its sea face, an open corridor
 * the length of its land face, and the stairs in a tower of their own at
 * its east end. The sea face stands a metre back from the cliff's edge and
 * its balconies overhang the drop, so the strafe along them is thirty
 * metres over the rocks.
 *
 * WHAT A PILOT FLIES:
 *
 *   the balconies   2.4 m deep behind a 1.1 m parapet (the brief's rail
 *                   height); every room's screen wall is down on the fifth
 *                   floor of all five, so that floor is one balcony run the
 *                   length of a block, and here and there on the others
 *   the corridors   2.0 m deep on the land face, unbroken, Hashima's
 *   the stair cores a 2.5 by 3.1 m well from the open top to the ground,
 *                   the lowest flights fallen, and a door out at the foot
 *   the links       open walkways between a tower and the next block, each
 *                   at its own floor, one of them fallen
 *   the 6F of C     the third block's sixth floor burnt out from sea to
 *                   land, nothing left but its columns
 *   the lobby of C  its ground floor open under the porch, out over the
 *                   cliff
 *   the sign        the hotel's name on a frame on the first block's roof,
 *                   high enough to fly under
 *
 * Every part is written in the plan frame (./frame.js) and every solid is
 * a box on the axes, drawn from the same six numbers it stops a craft by.
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

import { rng } from './frame.js';
import { TOP } from './terrain.js';

/* The block, in the plan: its west end x0, its sea face yS, its land face
 * yN, the balcony's outer face yB and the corridor's yC. */
export const HOTEL = {
  x0: 116, pitch: 51.6, len: 36, room: 6,
  yB: 149.6, yS: 152.0, yN: 162.0, yC: 164.4,
  base: TOP, fh: 3.0, floors: 7, slab: 0.25, parapet: 1.1, roofPar: 1.0,
  tower: { w: 5.4, y0: 154.0, y1: 160.0, wall: 0.25, top: 2.2 },
  link: { y0: 155.5, y1: 158.5 },
};

/* A floor's level, the top of its slab: k = 0 is the ground floor. */
export const level = (k) => HOTEL.base + HOTEL.fh * k;
export const ROOF = level(HOTEL.floors);

/* The blocks' own: where each is, and how each has gone. */
export const BLOCKS = [
  { id: 'A', no: 1, sign: true, tanks: false },
  { id: 'B', no: 2, tanks: true },
  { id: 'C', no: 3, open: [0, 5], porch: true },
  { id: 'D', no: 4, collapse: { u1: 9, from: 4 } },
  { id: 'E', no: 5, ivy: true, tanks: true },
].map((b, i) => ({ ...b, x0: HOTEL.x0 + HOTEL.pitch * i, x1: HOTEL.x0 + HOTEL.pitch * i + HOTEL.len, seed: 1000 + 37 * i }));

/* The links, from block i's tower to block i + 1, at a floor each; the
 * third is down, its stubs left on the walls. */
export const LINKS = [
  { from: 0, k: 3 },
  { from: 1, k: 5 },
  { from: 2, k: 2, fallen: true },
  { from: 3, k: 4 },
];

/* The tower's plan box for a block. */
export function towerOf(b) {
  const t = HOTEL.tower;
  return { x0: b.x1, x1: b.x1 + t.w, y0: t.y0, y1: t.y1 };
}

/* The tower's well and its door, plan and height, for the gaps. */
export function wellOf(b) {
  const t = towerOf(b);
  return { x0: t.x0 + 1.45, x1: t.x0 + 3.95, y0: t.y0 + 1.45, y1: t.y1 - 1.45 };
}
export const DOOR = { h: 2.6 };

/* The burnt out floor and the lobby, for the gaps. */
export const C_BLOCK = 2;

/* The first block's sign: its board and its legs. */
export const SIGN = { u0: 3, u1: 33, y: 157.0, t: 0.3, h0: ROOF + 2.5, h1: ROOF + 6.5, legs: [3.3, 9.3, 15.3, 21.3, 27.3, 32.7] };

/* The porch in front of the third block's lobby. */
export const PORCH = { u0: 13, u1: 23, y1: 171.5, h: TOP + 3.6, t: 0.35 };

/* Is the floor k of block b open, its rooms burnt out from face to face? */
const isOpen = (b, k) => Boolean(b.open && b.open.includes(k));
/* Is this plan x of block b, at floor k, in its fallen corner? */
const fallen = (b, k, x0, x1 = x0) => Boolean(b.collapse && k >= b.collapse.from && x1 <= b.x0 + b.collapse.u1 + 1e-6 && x0 >= b.x0 - 1e-6);

export function hotels(T) {
  for (const b of BLOCKS) {
    block(T, b);
    tower(T, b);
  }
  for (const l of LINKS) {
    link(T, l);
  }
  sign(T, BLOCKS[0]);
  porch(T, BLOCKS[C_BLOCK]);
}

/* ------------------------------------------------------------------ */
/* the block                                                           */
/* ------------------------------------------------------------------ */

function block(T, b) {
  const H = HOTEL;
  const r = rng(b.seed);
  const { x0, x1 } = b;
  const top = ROOF;
  const cx = b.collapse ? x0 + b.collapse.u1 : x0;
  /* THE CORE, the rooms and their walls, as solid runs of floors with the
   * open floors left out; in the fallen corner the runs stop at the
   * collapse's floor. */
  const runs = [];
  let from = H.base;
  for (let k = 0; k < H.floors; k += 1) {
    if (isOpen(b, k)) {
      if (level(k) > from) {
        runs.push([from, level(k)]);
      }
      from = level(k + 1) - H.slab;
    }
  }
  runs.push([from, top]);
  for (const [h0, h1] of runs) {
    if (b.collapse && h1 > level(b.collapse.from)) {
      const cut = level(b.collapse.from);
      if (h0 < cut) {
        T.box('skCream', x0, H.yS, h0, cx, H.yN, cut, { kind: 'wall', name: 'hotel' });
      }
      T.box('skCream', cx, H.yS, h0, x1, H.yN, h1, { kind: 'wall', name: 'hotel' });
    } else {
      T.box('skCream', x0, H.yS, h0, x1, H.yN, h1, { kind: 'wall', name: 'hotel' });
    }
  }
  /* The open floors: the columns, the soot, the rubble on the slab. */
  for (let k = 0; k < H.floors; k += 1) {
    if (isOpen(b, k)) {
      openFloor(T, b, k, r);
    }
  }
  /* THE BALCONIES and THE CORRIDORS, floor by floor. */
  for (let k = 1; k < H.floors; k += 1) {
    const L = level(k);
    const lx0 = fallen(b, k, x0, cx) ? cx : x0;
    /* the sea face: the slab, the parapet, the room's screens */
    T.box('skSlab', lx0, H.yB, L - H.slab, x1, H.yS, L, { kind: 'wall', name: 'balcony' });
    if (!isOpen(b, k)) {
      parapetRun(T, b, lx0, x1, H.yB, H.yB + 0.15, L, r, 'balcony parapet');
    }
    for (let u = H.room; u < H.len - 0.01; u += H.room) {
      const px = x0 + u;
      if (px < lx0 + 0.1) {
        continue;
      }
      /* The fifth floor's screens are all down, in every block: the run. */
      if (k === 4 || isOpen(b, k) || r.chance(0.22)) {
        /* A screen that fell leaves its stub on the wall. */
        T.deco('skGrey', px - 0.06, H.yS - 0.35, L, px + 0.06, H.yS, L + 2.75, false);
        continue;
      }
      T.box('skGrey', px - 0.06, H.yB + 0.15, L, px + 0.06, H.yS, L + H.fh - H.slab, { kind: 'wall', name: 'balcony screen' });
    }
    /* the land face: the slab, the parapet */
    T.box('skSlab', lx0, H.yN, L - H.slab, x1, H.yC, L, { kind: 'wall', name: 'corridor' });
    if (!isOpen(b, k)) {
      parapetRun(T, b, lx0, x1, H.yC - 0.15, H.yC, L, r, 'corridor parapet');
    }
  }
  /* The slab edges' rule, the slab's own colour a shade darker under the
   * lip, so each floor reads as a line across the face from the sea. */
  T.wide(() => {
    T.dress(() => {
      for (let k = 1; k < H.floors; k += 1) {
        const L = level(k);
        const lx0 = fallen(b, k, x0, cx) ? cx : x0;
        T.paint('skStain', lx0, H.yB - 0.02, L - H.slab - 0.18, x1, H.yB + 0.15, L - H.slab);
        T.paint('skStain', lx0, H.yC - 0.15, L - H.slab - 0.18, x1, H.yC + 0.02, L - H.slab);
      }
    });
  });
  /* THE ROOF: the parapet round it, the lift's machine room, the tanks. */
  const rp = H.roofPar;
  T.box('skGrey', cx, H.yS, top, x1, H.yS + 0.15, top + rp, { kind: 'wall', name: 'roof parapet' });
  T.box('skGrey', cx, H.yN - 0.15, top, x1, H.yN, top + rp, { kind: 'wall', name: 'roof parapet' });
  T.box('skGrey', cx, H.yS, top, cx + 0.15, H.yN, top + rp, { kind: 'wall', name: 'roof parapet' });
  T.box('skGrey', x1 - 0.15, H.yS, top, x1, H.yN, top + rp, { kind: 'wall', name: 'roof parapet' });
  T.paint('skStain', cx + 0.15, H.yS + 0.15, top, x1 - 0.15, H.yN - 0.15, top + 0.02);
  const mx = x0 + H.len * 0.62;
  T.box('skCream', mx, H.yS + 3.2, top, mx + 4.2, H.yS + 7.4, top + 2.8, { kind: 'wall', name: 'machine room' });
  T.box('skSlab', mx - 0.2, H.yS + 3.0, top + 2.8, mx + 4.4, H.yS + 7.6, top + 3.05, { kind: 'wall', name: 'machine room' });
  T.paint('skVoid', mx + 1.4, H.yS + 3.17, top + 0.02, mx + 2.6, H.yS + 3.2, top + 2.1);
  if (b.tanks) {
    tanks(T, x0 + 7, H.yS + 5, top);
  }
  facade(T, b, r);
  ends(T, b);
  if (b.collapse) {
    collapse(T, b, r);
  }
  if (b.ivy) {
    ivy(T, b, r);
  }
  T.dress(() => roofJunk(T, b, r));
}

/* A parapet from xa to xb, broken here and there: where it is broken a
 * bent rail stands in its place, drawn only, and a craft goes through. */
function parapetRun(T, b, xa, xb, ya, yb, L, r, name) {
  const H = HOTEL;
  let x = xa;
  while (x < xb - 0.01) {
    const len = Math.min(xb - x, r.range(7, 16));
    const broken = r.chance(0.14) && len > 3 && x > xa + 1;
    if (broken) {
      /* The gap: a stub at each end and the bent rail. */
      T.box('skGrey', x, ya, L, x + 0.4, yb, L + H.parapet, { kind: 'wall', name });
      T.box('skGrey', x + len - 0.4, ya, L, x + len, yb, L + H.parapet, { kind: 'wall', name });
      T.dress(() => {
        const mid = (ya + yb) / 2;
        T.cyl('skRust', [x + 0.4, mid, L + 0.9], [x + len * 0.5, mid - 0.25, L + 0.35], 0.03, 4);
        T.cyl('skRust', [x + len * 0.5, mid - 0.25, L + 0.35], [x + len - 0.4, mid, L + 0.95], 0.03, 4);
      });
    } else {
      T.box('skGrey', x, ya, L, x + len, yb, L + H.parapet, { kind: 'wall', name });
    }
    x += len;
  }
}

/* THE FACES: every room's window and door, painted on the core a few
 * centimetres proud, and their frames, which are fine. */
function facade(T, b, r) {
  const H = HOTEL;
  const { x0 } = b;
  const cx = b.collapse ? x0 + b.collapse.u1 : x0;
  for (let k = 0; k < H.floors; k += 1) {
    if (isOpen(b, k)) {
      continue;
    }
    const L = level(k);
    for (let u = 0; u < H.len - 0.01; u += H.room) {
      const ra = x0 + u;
      const rb = ra + H.room;
      if (fallen(b, k, ra, rb) || ra < cx - 0.01 && k >= (b.collapse ? b.collapse.from : 99)) {
        continue;
      }
      /* The sea face: a sliding door the width of the room, or on the
       * ground floor the dining room's long window. */
      const wa = ra + 0.8;
      const wb = rb - 0.8;
      const lit = r.chance(0.12);
      const shut = !lit && r.chance(0.2);
      const m = lit ? 'skRoom' : shut ? 'skShutter' : 'skVoid';
      if (k === 0) {
        T.paint('skVoid', ra + 0.4, H.yS - 0.03, L + 0.6, rb - 0.4, H.yS, L + 2.5);
      } else {
        T.paint(m, wa, H.yS - 0.03, L + 0.05, wb, H.yS, L + 2.3);
      }
      /* The land face: a door and a small window per room. */
      const da = ra + 0.7;
      T.paint(r.chance(0.3) ? 'skMint' : 'skWoodDark', da, H.yN, L + 0.02, da + 0.9, H.yN + 0.03, L + 2.05);
      T.paint('skVoid', ra + 2.4, H.yN, L + 1.1, ra + 4.2, H.yN + 0.03, L + 2.0);
      T.dress(() => {
        T.wide(() => {
          /* The sliding door's frame and its mullion, and the small
           * window's bars; a curtain left in one in four. */
          if (k > 0) {
            T.paint('skSteel', wa - 0.06, H.yS - 0.05, L + 2.3, wb + 0.06, H.yS, L + 2.38);
            T.paint('skSteel', (wa + wb) / 2 - 0.04, H.yS - 0.05, L + 0.05, (wa + wb) / 2 + 0.04, H.yS, L + 2.3);
            if (r.chance(0.25)) {
              T.paint('skFuton', wa + 0.1, H.yS - 0.04, L + 0.8, wa + 1.4, H.yS - 0.01, L + 2.25);
            }
          }
          for (let q = 1; q < 4; q += 1) {
            const bx = ra + 2.4 + q * 0.45;
            T.paint('skRail', bx - 0.02, H.yN + 0.02, L + 1.1, bx + 0.02, H.yN + 0.06, L + 2.0);
          }
          /* The rain's stains, under the window's sill, down the wall. */
          if (r.chance(0.5)) {
            const sx = ra + r.range(0.8, 5.0);
            T.paint('skStain', sx, H.yN, L - 0.6, sx + r.range(0.25, 0.6), H.yN + 0.02, L + 1.0);
          }
        });
        /* A meter box and the pipe beside the door. */
        if (k > 0 && r.chance(0.6)) {
          T.deco('skSteel', da + 1.05, H.yN, L + 1.3, da + 1.4, H.yN + 0.14, L + 1.75);
        }
      });
    }
    /* The air conditioner units on the balconies, and the laundry poles. */
    if (k > 0) {
      T.dress(() => {
        for (let u = 0; u < H.len - 0.01; u += H.room) {
          const ra = x0 + u;
          if (fallen(b, k, ra, ra + H.room) || !r.chance(0.55)) {
            continue;
          }
          T.deco('skSteel', ra + 4.6, H.yS - 0.6, L, ra + 5.4, H.yS - 0.05, L + 0.6);
          T.deco('skIron', ra + 4.75, H.yS - 0.61, L + 0.1, ra + 5.25, H.yS - 0.6, L + 0.5);
          if (r.chance(0.4)) {
            T.cyl('skSteel', [ra + 0.6, H.yS - 1.2, L + 2.2], [ra + 4.4, H.yS - 1.2, L + 2.2], 0.025, 4);
          }
        }
      });
    }
  }
  /* The ground floor's land face: the shutters of the old shops and the
   * hall's glass, but the lobby of the open block. */
  if (!isOpen(b, 0)) {
    T.paint('skShutter', x0 + 2, H.yN, TOP + 0.02, x0 + 10, H.yN + 0.04, TOP + 2.6);
    T.paint('skVoid', x0 + 13, H.yN, TOP + 0.02, x0 + 23, H.yN + 0.04, TOP + 2.7);
    T.paint('skShutter', x0 + 26, H.yN, TOP + 0.02, x0 + 34, H.yN + 0.04, TOP + 2.6);
    T.dress(() => {
      for (let q = 0; q < 16; q += 1) {
        const y = TOP + 0.2 + q * 0.15;
        T.paint('skRail', x0 + 2, H.yN + 0.04, y, x0 + 10, H.yN + 0.06, y + 0.03);
        T.paint('skRail', x0 + 26, H.yN + 0.04, y, x0 + 34, H.yN + 0.06, y + 0.03);
      }
    });
  }
}

/* The end walls: the block's number, big, as an annex is numbered, and the
 * end windows. The numbers are the sign atlas's (./signs.js). */
function ends(T, b) {
  const H = HOTEL;
  const mid = (H.yS + H.yN) / 2;
  if (!b.collapse) {
    T.sign(`blockNo${b.no}`, b.x0, mid, level(5) + 0.4, 6.4, 4.2, 'w', 0.03);
  } else {
    T.sign(`blockNo${b.no}`, b.x0 + b.collapse.u1, mid, level(2) + 1.5, 6.4, 4.2, 'w', 0.03);
  }
  for (let k = 0; k < H.floors; k += 1) {
    if (isOpen(b, k) || fallen(b, k, b.x0)) {
      continue;
    }
    if (k >= 4 && !b.collapse) {
      continue;
    }
    T.paint('skVoid', b.x0 - 0.03, H.yS + 1.2, level(k) + 0.9, b.x0, H.yS + 2.4, level(k) + 2.1);
    T.paint('skVoid', b.x0 - 0.03, H.yN - 2.4, level(k) + 0.9, b.x0, H.yN - 1.2, level(k) + 2.1);
  }
}

/* A burnt out floor: the columns that stand, a wall stub in the middle,
 * soot on the slab above, rubble and a few things the fire left. */
export const KONEX_STUB = { u: 18, w: 1.7, d: 0.45 };
function openFloor(T, b, k, r) {
  const H = HOTEL;
  const L = k === 0 ? H.base : level(k);
  const top = level(k + 1) - H.slab;
  const col = 0.5;
  for (let u = 0; u <= H.len + 0.01; u += H.room) {
    const px = Math.min(b.x1 - col, Math.max(b.x0, b.x0 + u - col / 2));
    T.box('skGrey', px, H.yS, L, px + col, H.yS + col, top, { kind: 'wall', name: 'column' });
    T.box('skGrey', px, H.yN - col, L, px + col, H.yN, top, { kind: 'wall', name: 'column' });
  }
  const mid = (H.yS + H.yN) / 2;
  if (k === 0) {
    /* The lobby: the front desk's counter stays, low, and two columns in
     * the middle. */
    T.box('skWood', b.x0 + 7, mid + 1.5, L, b.x0 + 11, mid + 2.2, L + 1.1, { kind: 'wall', name: 'front desk' });
    for (const u of [12, 24]) {
      T.box('skGrey', b.x0 + u - 0.3, mid - 0.3, L, b.x0 + u + 0.3, mid + 0.3, top, { kind: 'wall', name: 'column' });
    }
    T.paint('skTile', b.x0 + 0.5, H.yS + 0.5, L + 0.005, b.x1 - 0.5, H.yN - 0.5, L + 0.02);
  } else {
    /* The sixth floor: a stub of the spine wall, the columns, the soot. */
    const s = KONEX_STUB;
    T.box('skGrey', b.x0 + s.u - s.w / 2, mid - s.d / 2, L, b.x0 + s.u + s.w / 2, mid + s.d / 2, top, { kind: 'wall', name: 'spine wall' });
    for (const u of [9, 27]) {
      T.box('skGrey', b.x0 + u - 0.3, mid - 0.3, L, b.x0 + u + 0.3, mid + 0.3, top, { kind: 'wall', name: 'column' });
    }
    T.paint('skIron', b.x0 + 0.5, H.yS + 0.5, top - 0.03, b.x1 - 0.5, H.yN - 0.5, top);
    T.paint('skRoom', b.x0 + 0.5, H.yS + 0.5, L + 0.005, b.x1 - 0.5, H.yN - 0.5, L + 0.02);
  }
  /* Rubble, the burnt tatami and a fallen ceiling board, none of it
   * solid; the scorch up the faces over the openings, on the outside. */
  T.dress(() => {
    for (let q = 0; q < 14; q += 1) {
      const px = r.range(b.x0 + 1, b.x1 - 1);
      const py = r.range(H.yS + 1, H.yN - 1);
      if (Math.abs(py - mid) < 1.2) {
        continue;
      }
      const s = r.range(0.2, 0.6);
      T.deco(r.chance(0.5) ? 'skRubble' : 'skIron', px - s, py - s * 0.7, L, px + s, py + s * 0.7, L + s * 0.6);
    }
    for (let q = 0; q < 5; q += 1) {
      const px = r.range(b.x0 + 2, b.x1 - 3);
      const py = r.chance(0.5) ? r.range(H.yS + 1, mid - 1.5) : r.range(mid + 1.5, H.yN - 1.5);
      T.obox(k === 0 ? 'skCardboard' : 'skTatami', px, py, r.range(-1, 1), r.range(-1, 1), 1.8, 0.9, L + 0.02, L + 0.08);
    }
  });
  if (k > 0) {
    T.wide(() => {
      T.dress(() => {
        T.paint('skIron', b.x0, H.yB - 0.03, top + 0.05, b.x1, H.yB, top + 1.6);
        T.paint('skIron', b.x0, H.yC, top + 0.05, b.x1, H.yC + 0.03, top + 1.4);
      });
    });
  }
}

/* THE FALLEN CORNER of the fourth block: the floors above the collapse
 * floor gone at the west end, their rubble on the slab, the rebar left
 * sticking out of the cut, the broken slab edges. */
function collapse(T, b, r) {
  const H = HOTEL;
  const cut = level(b.collapse.from);
  const cx = b.x0 + b.collapse.u1;
  /* The heap: solid as low steps inside its drawn slope. */
  T.box('skRubble', b.x0 + 0.5, H.yS + 0.5, cut, cx - 0.5, H.yN - 0.5, cut + 0.6, { kind: 'wall', name: 'rubble' });
  T.box('skRubble', b.x0 + 2.5, H.yS + 2.0, cut + 0.6, cx - 1.5, H.yN - 2.0, cut + 1.3, { kind: 'wall', name: 'rubble' });
  T.dress(() => {
    for (let q = 0; q < 26; q += 1) {
      const px = r.range(b.x0 + 0.8, cx - 0.8);
      const py = r.range(H.yS + 0.6, H.yN - 0.6);
      const s = r.range(0.3, 1.1);
      T.obox('skRubble', px, py, r.range(-1, 1), r.range(-1, 1), s * 2, s, cut + 0.4, cut + 0.4 + s * 0.6);
    }
    /* The rebar out of the cut face, every floor's slab. */
    for (let k = b.collapse.from; k <= HOTEL.floors; k += 1) {
      const L = level(k);
      for (let q = 0; q < 9; q += 1) {
        const py = H.yS + 0.5 + q * 1.1;
        const len = r.range(0.4, 1.6);
        T.cyl('skRust', [cx, py, L - 0.12], [cx - len, py + r.range(-0.3, 0.3), L - 0.12 - r.range(0, 0.6)], 0.018, 3);
      }
    }
  });
  /* The cut face, raw and dark, and the slab edges' scorch. */
  T.paint('skStain', cx - 0.03, H.yS, cut, cx, H.yN, ROOF);
}

/* Ivy up the last block's tower and its east end, foliage blobs on the
 * walls and spilling over the roof's parapet. */
function ivy(T, b, r) {
  const t = towerOf(b);
  T.dress(() => {
    for (let q = 0; q < 120; q += 1) {
      const side = r.int(0, 2);
      const h = TOP + r.range(0, 18) * r.range(0.4, 1.0);
      const s = r.range(0.35, 0.8);
      if (side === 0) {
        T.bead('skIvy', t.x1 + s * 0.4, r.range(t.y0, t.y1), h, s);
      } else if (side === 1) {
        T.bead('skIvy', r.range(t.x0, t.x1), t.y0 - s * 0.4, h, s);
      } else {
        T.bead('skIvy', r.range(t.x0, t.x1), t.y1 + s * 0.4, h * 0.8 + 2, s);
      }
    }
    for (let q = 0; q < 30; q += 1) {
      T.bead('skIvy', r.range(b.x1 - 10, b.x1), HOTEL.yN + r.range(-0.1, 0.3), ROOF + r.range(-2.5, 0.8), r.range(0.4, 0.9));
    }
  });
}

/* Two water tanks on a steel stand. */
function tanks(T, px, py, top) {
  const stand = 2.0;
  for (const [dx, dy] of [[0, 0], [4.6, 0]]) {
    const x = px + dx;
    const y = py + dy;
    T.disc('skMint', x, y, 1.8, top + stand, top + stand + 2.6, 16);
    T.disc('skSteel', x, y, 1.9, top + stand + 2.6, top + stand + 2.75, 16);
    T.hidden(x - 1.25, y - 1.25, top + stand, x + 1.25, y + 1.25, top + stand + 2.6, 'wall', 'water tank');
    for (const [lx, ly] of [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]]) {
      T.post('skRust', x + lx, y + ly, top, top + stand, 0.08, { kind: 'pole', name: 'tank stand' });
    }
    T.dress(() => {
      T.cyl('skRust', [x - 1.3, y - 1.3, top + 0.2], [x + 1.3, y + 1.3, top + stand - 0.1], 0.03, 3);
      T.cyl('skRust', [x + 1.3, y - 1.3, top + 0.2], [x - 1.3, y + 1.3, top + stand - 0.1], 0.03, 3);
    });
  }
}

/* What a roof keeps: aerials, a vent, a broken chair, a drift of leaves. */
function roofJunk(T, b, r) {
  const H = HOTEL;
  for (let q = 0; q < 5; q += 1) {
    const px = r.range(b.x0 + (b.collapse ? b.collapse.u1 + 2 : 2), b.x1 - 2);
    const py = r.range(H.yS + 1, H.yN - 1);
    T.cyl('skRail', [px, py, ROOF], [px, py, ROOF + r.range(1.4, 2.6)], 0.025, 4);
    T.cyl('skRail', [px - 0.6, py, ROOF + 1.2], [px + 0.6, py, ROOF + 1.2], 0.015, 3);
    T.cyl('skRail', [px - 0.4, py, ROOF + 1.0], [px + 0.4, py, ROOF + 1.0], 0.015, 3);
  }
  for (let q = 0; q < 3; q += 1) {
    const px = r.range(b.x0 + 12, b.x1 - 3);
    const py = r.range(H.yS + 1.5, H.yN - 1.5);
    T.deco('skSteel', px - 0.4, py - 0.4, ROOF, px + 0.4, py + 0.4, ROOF + 0.7);
    T.cone('skSteel', px, py, ROOF + 0.7, 0.55, 0.3, 8);
  }
  for (let q = 0; q < 10; q += 1) {
    T.bead('skWeed', r.range(b.x1 - 6, b.x1 - 0.5), r.range(H.yS + 0.3, H.yS + 2), ROOF + 0.15, r.range(0.25, 0.5));
  }
}

/* ------------------------------------------------------------------ */
/* the stair tower                                                     */
/* ------------------------------------------------------------------ */

function tower(T, b) {
  const H = HOTEL;
  const t = towerOf(b);
  const w = H.tower.wall;
  const top = ROOF + H.tower.top;
  const well = wellOf(b);
  /* The walls: south and east whole, north with the door at the foot. */
  T.box('skCream', t.x0, t.y0, H.base, t.x1, t.y0 + w, top, { kind: 'wall', name: 'stair tower' });
  T.box('skCream', t.x1 - w, t.y0, H.base, t.x1, t.y1, top, { kind: 'wall', name: 'stair tower' });
  T.box('skCream', t.x0, t.y1 - w, H.base, well.x0, t.y1, top, { kind: 'wall', name: 'stair tower' });
  T.box('skCream', well.x1, t.y1 - w, H.base, t.x1 - w, t.y1, top, { kind: 'wall', name: 'stair tower' });
  T.box('skCream', well.x0, t.y1 - w, H.base + DOOR.h, well.x1, t.y1, top, { kind: 'wall', name: 'stair tower' });
  /* Its cap: the coping round the open top. */
  T.deco('skSlab', t.x0, t.y0 - 0.05, top, t.x1 + 0.05, t.y0 + w, top + 0.12);
  T.deco('skSlab', t.x1 - w, t.y0 - 0.05, top, t.x1 + 0.05, t.y1 + 0.05, top + 0.12);
  T.deco('skSlab', t.x0, t.y1 - w, top, t.x1 + 0.05, t.y1 + 0.05, top + 0.12);
  /* The flights and landings, from the first floor up: the ground floor's
   * flights fell, and lie in the well's foot. */
  const ix0 = t.x0;
  const ix1 = t.x1 - w;
  const iy0 = t.y0 + w;
  const iy1 = t.y1 - w;
  for (let k = 1; k <= H.floors; k += 1) {
    const L = level(k);
    /* The floor's landing, at the west against the core. */
    T.box('skSlab', ix0, iy0, L - H.slab, well.x0, iy1, L, { kind: 'wall', name: 'landing' });
    if (k === H.floors) {
      break;
    }
    const half = L + H.fh / 2;
    /* The half landing at the east. */
    T.box('skSlab', well.x1, iy0, half - H.slab, ix1, iy1, half, { kind: 'wall', name: 'landing' });
    /* Up the south side west to east, back up the north side. */
    flight(T, well.x0, well.x1, iy0, well.y0, L, half, true);
    flight(T, well.x0, well.x1, well.y1, iy1, half, L + H.fh, false);
  }
  /* The fallen flights at the foot, drawn only. */
  T.dress(() => {
    const r = rng(b.seed + 5);
    for (let q = 0; q < 8; q += 1) {
      T.obox('skRubble', r.range(well.x0 + 0.4, well.x1 - 0.4), r.range(iy0 + 0.4, well.y0), r.range(-1, 1), r.range(-1, 1), r.range(0.6, 1.4), 0.5, H.base, H.base + r.range(0.2, 0.5));
    }
  });
  /* The slit windows up the east face, glass block, a floor each, and the
   * floor numbers on the south face by the door of each landing. */
  for (let k = 0; k < H.floors; k += 1) {
    const L = level(k);
    T.paint('skGlassDark', t.x1, (t.y0 + t.y1) / 2 - 0.6, L + 0.6, t.x1 + 0.03, (t.y0 + t.y1) / 2 + 0.6, L + 2.6);
    T.dress(() => {
      T.wide(() => {
        for (let q = 1; q < 6; q += 1) {
          const y = L + 0.6 + q * 0.33;
          T.paint('skCream', t.x1 + 0.01, (t.y0 + t.y1) / 2 - 0.6, y - 0.02, t.x1 + 0.04, (t.y0 + t.y1) / 2 + 0.6, y + 0.02);
        }
      });
    });
    T.sign(`floor${k + 1}`, (t.x0 + t.x1) / 2, t.y0, L + 2.2, 0.9, 0.6, 's', 0.03);
  }
  /* The door's frame at the foot, and the stair sign over it. */
  T.paint('skIron', well.x0 - 0.12, t.y1, H.base, well.x0, t.y1 + 0.04, H.base + DOOR.h + 0.12);
  T.paint('skIron', well.x1, t.y1, H.base, well.x1 + 0.12, t.y1 + 0.04, H.base + DOOR.h + 0.12);
  T.paint('skIron', well.x0, t.y1, H.base + DOOR.h, well.x1, t.y1 + 0.04, H.base + DOOR.h + 0.12);
  T.sign('exit', (well.x0 + well.x1) / 2, t.y1, H.base + DOOR.h + 0.5, 1.2, 0.45, 'n', 0.04);
}

/* A flight of stairs across x from xa to xb (a slab rising from ha at its
 * south end... along x), between ya and yb: drawn as a stepped prism along
 * y, solid as three boxes each under its third of the slope. `up` rises
 * from xa to xb; otherwise from xb to xa. */
function flight(T, xa, xb, ya, yb, ha, hb, up) {
  const n = 10;
  const run = (xb - xa) / n;
  const rise = (hb - ha) / n;
  const prof = [];
  const at = (i) => (up ? xa + i * run : xb - i * run);
  prof.push([at(0), ha - 0.3]);
  for (let i = 0; i < n; i += 1) {
    prof.push([at(i), ha + rise * (i + 1)]);
    prof.push([at(i + 1), ha + rise * (i + 1)]);
  }
  prof.push([at(n), hb - 0.3]);
  /* The profile must run one way round: the prism draws it as given. */
  T.prism('skSlab', 'y', up ? prof : [...prof].reverse(), ya, yb);
  for (let j = 0; j < 3; j += 1) {
    const s0 = up ? xa + ((xb - xa) * j) / 3 : xb - ((xb - xa) * (j + 1)) / 3;
    const s1 = s0 + (xb - xa) / 3;
    const low = ha + ((hb - ha) * j) / 3 + rise;
    T.box('skSlab', s0, ya, low - 0.3, s1, yb, low, { draw: false, kind: 'wall', name: 'stair' });
  }
}

/* ------------------------------------------------------------------ */
/* the links, the sign, the porch                                      */
/* ------------------------------------------------------------------ */

function link(T, l) {
  const H = HOTEL;
  const a = BLOCKS[l.from];
  const b = BLOCKS[l.from + 1];
  const t = towerOf(a);
  const xa = t.x1;
  const xb = b.x0;
  const L = level(l.k);
  const { y0, y1 } = H.link;
  /* The doors it ran between, painted dark. */
  T.paint('skVoid', xa, y0 + 0.4, L, xa + 0.03, y1 - 0.4, L + 2.2);
  T.paint('skVoid', xb - 0.03, y0 + 0.4, L, xb, y1 - 0.4, L + 2.2);
  if (l.fallen) {
    /* The stubs on each wall, and the deck on the ground below, broken
     * in two. */
    for (const [s0, s1] of [[xa, xa + 1.4], [xb - 1.1, xb]]) {
      T.box('skSlab', s0, y0, L - 0.3, s1, y1, L, { kind: 'wall', name: 'fallen link' });
    }
    T.box('skSlab', xa + 1.6, y0 - 0.6, H.base, xa + 5.0, y1 + 0.2, H.base + 0.3, { kind: 'wall', name: 'fallen link' });
    T.box('skSlab', xa + 5.4, y0 + 0.3, H.base, xb - 1.4, y1 + 0.9, H.base + 0.3, { kind: 'wall', name: 'fallen link' });
    T.dress(() => {
      const r = rng(l.from * 13 + 7);
      for (let q = 0; q < 12; q += 1) {
        T.obox('skRubble', r.range(xa + 1, xb - 1), r.range(y0 - 1, y1 + 1), r.range(-1, 1), r.range(-1, 1), r.range(0.4, 1.2), 0.4, H.base, H.base + r.range(0.3, 0.7));
      }
      T.cyl('skRust', [xa + 1.4, y0 + 0.5, L - 0.15], [xa + 2.4, y0 + 0.4, L - 1.8], 0.02, 3);
      T.cyl('skRust', [xa + 1.4, y1 - 0.5, L - 0.15], [xa + 2.2, y1 - 0.7, L - 1.5], 0.02, 3);
    });
    return;
  }
  T.box('skSlab', xa, y0, L - 0.3, xb, y1, L, { kind: 'wall', name: 'link' });
  T.box('skGrey', xa, y0, L, xb, y0 + 0.15, L + H.parapet, { kind: 'wall', name: 'link parapet' });
  T.box('skGrey', xa, y1 - 0.15, L, xb, y1, L + H.parapet, { kind: 'wall', name: 'link parapet' });
  T.wide(() => T.dress(() => {
    T.paint('skStain', xa, y0 - 0.02, L - 0.3, xb, y0, L + 0.4);
    T.paint('skStain', xa, y1, L - 0.3, xb, y1 + 0.02, L + 0.4);
  }));
}

function sign(T, b) {
  const S = SIGN;
  const x0 = b.x0 + S.u0;
  const x1 = b.x0 + S.u1;
  const y0 = S.y - S.t / 2;
  const y1 = S.y + S.t / 2;
  T.box('skIron', x0, y0, S.h0, x1, y1, S.h1, { kind: 'wall', name: 'hotel sign' });
  for (const u of S.legs) {
    const px = b.x0 + u;
    T.post('skRust', px, S.y, ROOF, S.h0, 0.12, { kind: 'pole', name: 'sign leg' });
    T.post('skRust', px, S.y + 1.6, ROOF, S.h0 - 0.4, 0.08, { kind: 'pole', name: 'sign strut' });
    T.cyl('skRust', [px, S.y + 1.6, S.h0 - 0.4], [px, S.y, S.h0], 0.07, 4);
  }
  /* The lattice behind the board, the catwalk, the lamps. */
  T.dress(() => {
    for (let x = x0 + 1; x < x1 - 0.5; x += 2.5) {
      T.cyl('skRust', [x, y1 + 0.05, S.h0], [x + 2.5, y1 + 0.05, S.h1], 0.025, 3);
      T.cyl('skRust', [x + 2.5, y1 + 0.05, S.h0], [x, y1 + 0.05, S.h1], 0.025, 3);
    }
    for (let x = x0 + 2; x < x1; x += 5) {
      T.cyl('skRust', [x, y0 - 0.1, S.h1], [x, y0 - 0.9, S.h1 + 0.4], 0.03, 3);
      T.ball('skLamp', x, y0 - 0.9, S.h1 + 0.35, 0.12);
    }
  });
  T.deco('skIron', x0, y0 - 0.7, S.h0 - 0.08, x1, y0, S.h0);
  /* Both faces: the name to the sea and to the forecourt. */
  T.sign('hotelName', (x0 + x1) / 2, y0, (S.h0 + S.h1) / 2, S.u1 - S.u0 - 0.6, S.h1 - S.h0 - 0.4, 's', 0.03);
  T.sign('hotelNameBack', (x0 + x1) / 2, y1, (S.h0 + S.h1) / 2, S.u1 - S.u0 - 0.6, S.h1 - S.h0 - 0.4, 'n', 0.03);
}

function porch(T, b) {
  const H = HOTEL;
  const P = PORCH;
  const x0 = b.x0 + P.u0;
  const x1 = b.x0 + P.u1;
  T.box('skSlab', x0, H.yC, P.h, x1, P.y1, P.h + P.t, { kind: 'wall', name: 'porch' });
  T.deco('skCream', x0 - 0.1, P.y1 - 0.1, P.h - 0.3, x1 + 0.1, P.y1 + 0.1, P.h + P.t + 0.25);
  for (const px of [x0 + 0.5, x1 - 0.5]) {
    T.post('skGrey', px, P.y1 - 0.6, TOP, P.h, 0.25, { kind: 'wall', name: 'porch column' });
  }
  T.sign('lobby', (x0 + x1) / 2, P.y1 + 0.1, P.h + P.t / 2 + 0.05, 7.0, 0.55, 'n', 0.03);
  T.paint('skTile', x0, H.yC, TOP + 0.005, x1, P.y1, TOP + 0.02);
  T.dress(() => {
    /* The revolving door's drum, long gone to its frame, and the planters
     * either side, gone to weed. */
    for (const px of [x0 - 1.4, x1 + 1.4]) {
      T.deco('skGrey', px - 0.6, H.yC + 1, TOP, px + 0.6, H.yC + 2.2, TOP + 0.6);
      for (let q = 0; q < 4; q += 1) {
        T.bead('skWeed', px - 0.3 + q * 0.2, H.yC + 1.6, TOP + 0.75, 0.35);
      }
    }
  });
}
