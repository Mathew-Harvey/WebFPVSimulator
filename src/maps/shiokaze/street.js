/*
 * street.js: the top of the island behind the hotels. The hotels' forecourt
 * and car park, the back lane with its poles and wires, the row of what a
 * hot spring resort's back street had (a souvenir shop, an old ryokan, a
 * game hall, the public bath and its chimney, the staff dormitory, the
 * hotel's workshop), and the shrine on the hill over all of it, up a
 * flight of stone steps under a run of vermilion torii.
 *
 * All of it is the town's furniture gone to ruin: the town's utility poles,
 * drinks machines and kei cars (src/props/street.js), the town's tile
 * roofs, its shutters, its signboards. The words on the signs are the
 * island's own (./signs.js), and none of them is anybody's brand.
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
import { TOP, HILL_TOP } from './terrain.js';

/* The forecourt, the lane, and the line the poles stand on. */
export const FORECOURT = { x0: 112, x1: 371, y0: 164, y1: 199 };
export const LANE = { x0: 30, x1: 371, y0: 200, y1: 207 };
const POLE_Y = 208.2;

/* The steps up the hill and their torii. */
export const STEPS = { x0: 268, x1: 276, y0: 214, y1: 262, n: 24 };
export const TORII = [
  { py: 211, w: 6.2, h: 6.0 },
  { py: 226, w: 5.4, h: 5.2 },
  { py: 240, w: 5.4, h: 5.2 },
  { py: 252, w: 5.4, h: 5.2 },
  { py: 268, w: 5.0, h: 4.8 },
];
/* The shrine on the top. */
export const SHRINE = { x0: 268, x1: 278, y0: 280, y1: 290 };

/* The back street's buildings. */
export const WORKSHOP = { x0: 326, x1: 356, y0: 210, y1: 228, h: 7.2, door: 5.0 };
export const BATH = { x0: 192, x1: 222, y0: 210, y1: 231, h: 7.6, chimney: [217, 236] };

export function street(T) {
  const r = rng(2026);
  ground(T, r);
  shops(T, r);
  bath(T, r);
  dormitory(T, r);
  workshop(T, r);
  steps(T, r);
  shrine(T, r);
  poles(T, r);
  machines(T, r);
  cars(T, r);
}

/* The paint: the forecourt's asphalt and its bays, the lane, the cracks
 * with weed in them. */
function ground(T, r) {
  const F = FORECOURT;
  T.paint('skAsphalt', F.x0, F.y0, TOP + 0.005, F.x1, F.y1, TOP + 0.02);
  T.paint('skAsphalt', LANE.x0, LANE.y0, TOP + 0.005, LANE.x1, LANE.y1, TOP + 0.02);
  T.wide(() => T.dress(() => {
    /* The bays, worn: every other line gone. */
    for (let x = F.x0 + 6; x < F.x1 - 6; x += 2.6) {
      if (r.chance(0.3)) {
        continue;
      }
      T.paint('skLine', x, F.y1 - 5.4, TOP + 0.02, x + 0.12, F.y1 - 0.6, TOP + 0.03);
    }
    T.paint('skLine', F.x0 + 6, F.y1 - 5.5, TOP + 0.02, F.x1 - 6, F.y1 - 5.38, TOP + 0.03);
    /* The lane's centre line, broken. */
    for (let x = LANE.x0 + 4; x < LANE.x1 - 4; x += 6) {
      T.paint('skLine', x, (LANE.y0 + LANE.y1) / 2 - 0.06, TOP + 0.02, x + 3, (LANE.y0 + LANE.y1) / 2 + 0.06, TOP + 0.03);
    }
    /* Cracks and the weed in them, and drifts of leaves at the edges. */
    for (let q = 0; q < 70; q += 1) {
      const px = r.range(F.x0 + 1, F.x1 - 1);
      const py = r.range(F.y0 + 1, LANE.y1);
      const len = r.range(1.2, 4.5);
      T.obox('skStain', px, py, r.range(-1, 1), r.range(-1, 1), len, 0.08, TOP + 0.02, TOP + 0.03);
      if (r.chance(0.5)) {
        T.bead('skWeed', px, py, TOP + 0.1, r.range(0.15, 0.35));
      }
    }
  }));
}

/* A two storey shop or inn: walls, a tile roof gabled along x, its
 * shutter, its sign. */
function house(T, x0, y0, x1, y1, h, opts, r) {
  T.box(opts.wall || 'skPlaster', x0, y0, TOP, x1, y1, TOP + h, { kind: 'wall', name: opts.name });
  /* The roof: a gable along x, the eaves out over the walls, its solid a
   * box under the slopes. */
  const eave = 0.6;
  const rise = (y1 - y0) * 0.32;
  const top = TOP + h;
  T.prism(opts.roof || 'skRoofSlate', 'x', [[y0 - eave, top - 0.15], [(y0 + y1) / 2, top + rise], [y1 + eave, top - 0.15], [y1 + eave, top + 0.05], [(y0 + y1) / 2, top + rise + 0.22], [y0 - eave, top + 0.05]], x0 - eave, x1 + eave);
  T.prism(opts.wall || 'skPlaster', 'x', [[y0, top], [(y0 + y1) / 2, top + rise - 0.05], [y1, top]], x0, x1);
  T.box('skGrey', x0 + 0.2, (y0 + y1) / 2 - (y1 - y0) * 0.22, top, x1 - 0.2, (y0 + y1) / 2 + (y1 - y0) * 0.22, top + rise * 0.5, { draw: false, kind: 'wall', name: opts.name });
  /* The ground floor's front: the shutter, and the floor over it its
   * windows; the eaves' board between them. */
  T.paint('skShutter', x0 + 0.6, y0 - 0.03, TOP + 0.02, x1 - 0.6, y0, TOP + 2.6);
  T.deco(opts.trim || 'skWoodDark', x0 - 0.1, y0 - 0.45, TOP + 2.8, x1 + 0.1, y0, TOP + 3.0);
  for (let x = x0 + 1; x < x1 - 1.6; x += 2.4) {
    T.paint(r.chance(0.3) ? 'skGlass' : 'skVoid', x, y0 - 0.03, TOP + 3.6, x + 1.4, y0, TOP + 5.2);
  }
  T.dress(() => {
    for (let q = 0; q < 14; q += 1) {
      const z = TOP + 0.2 + q * 0.17;
      T.paint('skRail', x0 + 0.6, y0 - 0.05, z, x1 - 0.6, y0 - 0.03, z + 0.03);
    }
    for (let x = x0 + 1; x < x1 - 1.6; x += 2.4) {
      T.paint('skWood', x + 0.68, y0 - 0.05, TOP + 3.6, x + 0.72, y0 - 0.03, TOP + 5.2);
    }
  });
  if (opts.sign) {
    T.sign(opts.sign, (x0 + x1) / 2, y0 - 0.46, TOP + 3.35, Math.min(x1 - x0 - 1.0, 7.5), 0.85, 's', 0.02);
  }
}

function shops(T, r) {
  house(T, 120, 209, 134, 219, 6.2, { name: 'souvenir shop', sign: 'omiyage', roof: 'skRoofSlate' }, r);
  house(T, 138, 209, 162, 226, 6.6, { name: 'ryokan', sign: 'ryokan', wall: 'skCream', roof: 'skRoofSlate', trim: 'skWood' }, r);
  /* The ryokan's porch: a little roof on two posts over its door. */
  T.prism('skRoofSlate', 'x', [[206.6, TOP + 3.0], [209, TOP + 3.7], [209, TOP + 3.85], [206.6, TOP + 3.15]], 146, 154);
  for (const px of [146.3, 153.7]) {
    T.post('skWood', px, 207.0, TOP, TOP + 3.0, 0.1, { kind: 'pole', name: 'porch post' });
  }
  T.paint('skNoren', 147.5, 208.96, TOP + 1.7, 152.5, 208.99, TOP + 2.75);
  /* The game hall: a flat roofed box with its sign frame over the front. */
  const g = { x0: 166, x1: 188, y0: 209, y1: 224, h: 7.4 };
  T.box('skPink', g.x0, g.y0, TOP, g.x1, g.y1, TOP + g.h, { kind: 'wall', name: 'game hall' });
  T.box('skGrey', g.x0, g.y0, TOP + g.h, g.x1, g.y1, TOP + g.h + 0.6, { kind: 'wall', name: 'game hall' });
  T.box('skIron', g.x0 + 1, g.y0 - 0.1, TOP + g.h + 0.6, g.x1 - 1, g.y0 + 0.2, TOP + g.h + 3.2, { kind: 'wall', name: 'game hall sign' });
  T.sign('gameHall', (g.x0 + g.x1) / 2, g.y0 - 0.1, TOP + g.h + 1.9, g.x1 - g.x0 - 2.4, 2.3, 's', 0.03);
  T.paint('skVoid', g.x0 + 2, g.y0 - 0.03, TOP + 0.02, g.x1 - 2, g.y0, TOP + 2.8);
  T.dress(() => {
    /* The hall's dead lights round its doors, and its strip of glass. */
    for (let x = g.x0 + 2.2; x < g.x1 - 2; x += 0.9) {
      T.ball('skLamp', x, g.y0 - 0.12, TOP + 3.1, 0.09);
    }
    T.deco('skSteel', g.x0 + 1.4, g.y0 - 0.5, TOP + 2.95, g.x1 - 1.4, g.y0, TOP + 3.25);
  });
}

/* THE PUBLIC BATH: a tall gabled hall, its chimney behind, and the
 * gable's ornament over the door; the town's chimney (src/props). */
function bath(T, r) {
  const B = BATH;
  house(T, B.x0, B.y0, B.x1, B.y1, B.h, { name: 'bath house', sign: 'sento', wall: 'skCream', roof: 'skRoofSlate', trim: 'skWood' }, r);
  /* The entrance's own gable, facing the lane. */
  const mx = (B.x0 + B.x1) / 2;
  T.prism('skRoofSlate', 'y', [[mx - 4.2, TOP + 4.6], [mx, TOP + 6.6], [mx + 4.2, TOP + 4.6], [mx + 4.2, TOP + 4.8], [mx, TOP + 6.85], [mx - 4.2, TOP + 4.8]], B.y0 - 2.4, B.y0 + 0.4);
  for (const px of [mx - 3.6, mx + 3.6]) {
    T.post('skWood', px, B.y0 - 2.0, TOP, TOP + 4.6, 0.14, { kind: 'pole', name: 'bath porch post' });
  }
  T.asset({ type: 'chimney', dims: { height: 22, radius: 1.1 } }, 1, B.chimney[0], B.chimney[1], TOP, 0);
  T.paint('skNoren', mx - 1.6, B.y0 - 0.04, TOP + 1.4, mx + 1.6, B.y0 - 0.01, TOP + 2.7);
}

/* THE STAFF DORMITORY: three floors of the hotels' own concrete, the
 * Hashima flats' long balcony on its south face. */
function dormitory(T, r) {
  const d = { x0: 286, x1: 318, y0: 212, y1: 222, fh: 3.0, n: 3 };
  const h = d.n * d.fh;
  T.box('skGrey', d.x0, d.y0, TOP, d.x1, d.y1, TOP + h, { kind: 'wall', name: 'dormitory' });
  T.box('skGrey', d.x0, d.y0, TOP + h, d.x1, d.y1, TOP + h + 0.8, { draw: false, kind: 'wall', name: 'dormitory' });
  T.deco('skGrey', d.x0, d.y0, TOP + h, d.x1, d.y0 + 0.15, TOP + h + 0.8);
  T.deco('skGrey', d.x0, d.y1 - 0.15, TOP + h, d.x1, d.y1, TOP + h + 0.8);
  T.deco('skGrey', d.x0, d.y0, TOP + h, d.x0 + 0.15, d.y1, TOP + h + 0.8);
  T.deco('skGrey', d.x1 - 0.15, d.y0, TOP + h, d.x1, d.y1, TOP + h + 0.8);
  for (let k = 1; k < d.n; k += 1) {
    const L = TOP + k * d.fh;
    T.box('skSlab', d.x0, d.y0 - 1.6, L - 0.25, d.x1, d.y0, L, { kind: 'wall', name: 'dormitory balcony' });
    T.box('skGrey', d.x0, d.y0 - 1.6, L, d.x1, d.y0 - 1.45, L + 1.1, { kind: 'wall', name: 'dormitory balcony' });
  }
  for (let k = 0; k < d.n; k += 1) {
    const L = TOP + k * d.fh;
    for (let x = d.x0 + 0.8; x < d.x1 - 2; x += 3.2) {
      T.paint('skVoid', x, d.y0 - 0.03, L + 0.3, x + 1.6, d.y0, L + 2.2);
      T.paint('skWoodDark', x + 1.9, d.y0 - 0.03, L + 0.02, x + 2.7, d.y0, L + 2.0);
    }
  }
  T.sign('dorm', d.x1, (d.y0 + d.y1) / 2, TOP + 6.5, 4.0, 1.2, 'e', 0.03);
  T.dress(() => {
    for (let k = 1; k < d.n; k += 1) {
      const L = TOP + k * d.fh;
      for (let x = d.x0 + 1; x < d.x1 - 3; x += 6.4) {
        if (r.chance(0.5)) {
          T.cyl('skSteel', [x, d.y0 - 0.8, L + 2.0], [x + 3, d.y0 - 0.8, L + 2.0], 0.02, 4);
          T.deco('skFuton', x + 0.4, d.y0 - 1.55, L + 0.6, x + 1.8, d.y0 - 1.45, L + 1.6);
        }
      }
    }
  });
}

/* THE WORKSHOP: a steel shed open at both ends, its east half roofed and
 * its west half's roof fallen in. */
function workshop(T, r) {
  const S = WORKSHOP;
  const top = TOP + S.h;
  const mid = (S.y0 + S.y1) / 2;
  const half = S.door / 2;
  /* The long walls, and the end walls round their doors. */
  T.box('skRoofTin', S.x0, S.y0, TOP, S.x1, S.y0 + 0.2, top, { kind: 'wall', name: 'workshop' });
  T.box('skRoofTin', S.x0, S.y1 - 0.2, TOP, S.x1, S.y1, top, { kind: 'wall', name: 'workshop' });
  for (const [xa, xb] of [[S.x0, S.x0 + 0.2], [S.x1 - 0.2, S.x1]]) {
    T.box('skRoofTin', xa, S.y0 + 0.2, TOP, xb, mid - half, top, { kind: 'wall', name: 'workshop' });
    T.box('skRoofTin', xa, mid + half, TOP, xb, S.y1 - 0.2, top, { kind: 'wall', name: 'workshop' });
    T.box('skRoofTin', xa, mid - half, TOP + S.door, xb, mid + half, top, { kind: 'wall', name: 'workshop' });
  }
  /* The roof: the east half on its trusses, the west half gone. */
  const rx = (S.x0 + S.x1) / 2;
  T.box('skRoofRust', rx, S.y0, top, S.x1, S.y1, top + 0.12, { kind: 'wall', name: 'workshop roof' });
  for (let x = S.x0 + 3; x < S.x1 - 1; x += 3) {
    T.cyl('skRust', [x, S.y0 + 0.2, top - 0.1], [x, S.y1 - 0.2, top - 0.1], 0.08, 4);
    T.cyl('skRust', [x, S.y0 + 0.2, top - 0.1], [x, mid, top - 1.0], 0.05, 3);
    T.cyl('skRust', [x, S.y1 - 0.2, top - 0.1], [x, mid, top - 1.0], 0.05, 3);
  }
  T.sign('workshop', S.x0, mid, TOP + S.door + 1.0, 5.0, 1.0, 'w', 0.03);
  /* The fallen roof sheets on the floor, a lathe, oil drums. */
  T.dress(() => {
    for (let q = 0; q < 10; q += 1) {
      T.obox('skRoofRust', r.range(S.x0 + 2, rx - 1), r.range(S.y0 + 1.5, S.y1 - 1.5), r.range(-1, 1), r.range(-0.4, 0.4), 3.0, 0.9, TOP + 0.05, TOP + 0.12);
    }
    for (let q = 0; q < 6; q += 1) {
      const px = r.range(rx + 1, S.x1 - 1.5);
      const py = r.chance(0.5) ? S.y0 + 0.9 : S.y1 - 0.9;
      T.disc(r.chance(0.5) ? 'skBlue' : 'skRust', px, py, 0.3, TOP, TOP + 0.9, 10);
    }
  });
  T.box('skMint', rx + 3, S.y1 - 2.4, TOP, rx + 6, S.y1 - 1.2, TOP + 1.3, { kind: 'wall', name: 'lathe' });
}

/* THE STEPS AND THE TORII: stone steps up to the hill, solid each to the
 * ground, and the torii over them, every one a gate to fly. */
function steps(T, r) {
  const S = STEPS;
  const run = (S.y1 - S.y0) / S.n;
  const rise = (HILL_TOP - TOP) / S.n;
  for (let i = 0; i < S.n; i += 1) {
    const y0 = S.y0 + i * run;
    T.box('skStone', S.x0, y0, TOP, S.x1, y0 + run, TOP + rise * (i + 1), { kind: 'wall', name: 'stone steps' });
  }
  /* The stone lanterns either side, every few steps, and the moss. */
  for (let i = 2; i < S.n; i += 4) {
    const y = S.y0 + (i + 0.5) * run;
    const h = TOP + rise * (i + 1);
    for (const px of [S.x0 - 0.8, S.x1 + 0.8]) {
      lantern(T, px, y, h);
    }
  }
  for (const t of TORII) {
    const h = t.py < S.y0 ? TOP : t.py > S.y1 ? HILL_TOP : TOP + rise * Math.ceil((t.py - S.y0) / run);
    torii(T, (S.x0 + S.x1) / 2, t.py, h, t.w, t.h);
  }
  T.dress(() => {
    for (let q = 0; q < 40; q += 1) {
      const i = r.int(0, S.n - 1);
      const y = S.y0 + (i + r.range(0.1, 0.9)) * run;
      const px = r.chance(0.5) ? S.x0 + r.range(0.1, 0.5) : S.x1 - r.range(0.1, 0.5);
      T.bead('skMoss', px, y, TOP + rise * (i + 1) + 0.05, r.range(0.12, 0.3));
    }
  });
}

/* A torii, across x at py, standing on h: two pillars, the two lintels,
 * the tie between them. The pillars and the lower lintel are solid. */
export function torii(T, px, py, h, w, ht) {
  const half = w / 2;
  for (const s of [-1, 1]) {
    T.post('skVermilion', px + s * half, py, h, h + ht, 0.2, { kind: 'pole', name: 'torii' });
    T.disc('skIron', px + s * half, py, 0.26, h, h + 0.5, 10);
  }
  /* The kasagi, black over vermilion, its ends up a little. */
  T.box('skVermilion', px - half - 0.9, py - 0.22, h + ht, px + half + 0.9, py + 0.22, h + ht + 0.32, { kind: 'wall', name: 'torii' });
  T.deco('skIron', px - half - 1.0, py - 0.26, h + ht + 0.32, px + half + 1.0, py + 0.26, h + ht + 0.5);
  T.box('skVermilion', px - half - 0.35, py - 0.14, h + ht - 0.9, px + half + 0.35, py + 0.14, h + ht - 0.62, { kind: 'wall', name: 'torii' });
  T.deco('skVermilion', px - 0.18, py - 0.12, h + ht - 0.62, px + 0.18, py + 0.12, h + ht);
}

/* A stone lantern: base, post, firebox, cap. */
function lantern(T, px, py, h) {
  T.box('skStone', px - 0.32, py - 0.32, h, px + 0.32, py + 0.32, h + 0.3, { kind: 'wall', name: 'lantern' });
  T.post('skStone', px, py, h + 0.3, h + 1.1, 0.12, { kind: 'pole', name: 'lantern' });
  T.box('skStone', px - 0.26, py - 0.26, h + 1.1, px + 0.26, py + 0.26, h + 1.5, { kind: 'wall', name: 'lantern' });
  T.paint('skVoid', px - 0.12, py - 0.27, h + 1.18, px + 0.12, py - 0.26, h + 1.42);
  T.frustum('skStone', { x0: px - 0.45, y0: py - 0.45, x1: px + 0.45, y1: py + 0.45 }, h + 1.5, { x0: px - 0.06, y0: py - 0.06, x1: px + 0.06, y1: py + 0.06 }, h + 1.85);
}

/* THE SHRINE on the hill: its hall, its offering box, the rope and bell,
 * the guardian dogs, the big trees. */
function shrine(T, r) {
  const S = SHRINE;
  const h = HILL_TOP;
  T.box('skStone', S.x0 - 1, S.y0 - 1, h, S.x1 + 1, S.y1 + 1, h + 0.6, { kind: 'wall', name: 'shrine' });
  T.box('skWood', S.x0, S.y0, h + 0.6, S.x1, S.y1, h + 3.4, { kind: 'wall', name: 'shrine' });
  const ridge = h + 6.2;
  T.frustum('skRoofSlate', { x0: S.x0 - 1.4, y0: S.y0 - 1.6, x1: S.x1 + 1.4, y1: S.y1 + 1.2 }, h + 3.4, { x0: S.x0 + 2.5, y0: (S.y0 + S.y1) / 2 - 0.3, x1: S.x1 - 2.5, y1: (S.y0 + S.y1) / 2 + 0.3 }, ridge);
  T.frustumSolid({ x0: S.x0, y0: S.y0, x1: S.x1, y1: S.y1 }, h + 3.4, { x0: S.x0 + 2.5, y0: (S.y0 + S.y1) / 2 - 0.3, x1: S.x1 - 2.5, y1: (S.y0 + S.y1) / 2 + 0.3 }, ridge - 0.3, 3, 'shrine roof');
  for (const px of [S.x0 + 0.3, S.x1 - 0.3]) {
    T.post('skVermilion', px, S.y0 - 0.3, h + 0.6, h + 3.4, 0.14, { kind: 'pole', name: 'shrine post' });
  }
  T.box('skWoodDark', (S.x0 + S.x1) / 2 - 1, S.y0 - 1.4, h + 0.6, (S.x0 + S.x1) / 2 + 1, S.y0 - 0.6, h + 1.4, { kind: 'wall', name: 'offering box' });
  T.paint('skVoid', S.x0 + 1.5, S.y0 - 0.03, h + 0.8, S.x1 - 1.5, S.y0, h + 3.0);
  T.dress(() => {
    T.cyl('skRope', [(S.x0 + S.x1) / 2 - 2.5, S.y0 - 0.4, h + 3.2], [(S.x0 + S.x1) / 2 + 2.5, S.y0 - 0.4, h + 3.2], 0.09, 6);
    T.cyl('skRope', [(S.x0 + S.x1) / 2, S.y0 - 0.5, h + 3.2], [(S.x0 + S.x1) / 2, S.y0 - 0.5, h + 1.6], 0.04, 4);
    T.ball('skYellow', (S.x0 + S.x1) / 2, S.y0 - 0.5, h + 3.0, 0.18);
    for (let q = 0; q < 4; q += 1) {
      T.paint('skPaper', (S.x0 + S.x1) / 2 - 2 + q * 1.3, S.y0 - 0.45, h + 2.5, (S.x0 + S.x1) / 2 - 1.8 + q * 1.3, S.y0 - 0.43, h + 3.1);
    }
  });
  /* The guardian dogs on their plinths either side of the approach. */
  for (const px of [S.x0 - 1.5, S.x1 + 1.5]) {
    T.box('skStone', px - 0.5, S.y0 - 5.5, h, px + 0.5, S.y0 - 4.5, h + 1.0, { kind: 'wall', name: 'guardian' });
    T.ball('skStone', px, S.y0 - 5.0, h + 1.45, 0.45);
    T.ball('skStone', px, S.y0 - 5.25, h + 1.9, 0.3);
  }
  /* The big camphor behind the hall and the pines round the top. */
  T.asset({ type: 'tree', style: 'street', dims: { size: 1.6, variant: 41 } }, 1.6, (S.x0 + S.x1) / 2 + 9, S.y1 + 6, h, 0);
  for (const [px, py, s] of [[248, 276, 1.1], [254, 296, 1.3], [298, 274, 1.0], [304, 296, 1.2], [262, 302, 0.9], [290, 304, 1.0]]) {
    T.asset({ type: 'tree', style: 'pine', dims: { size: s, variant: Math.round(px + py) } }, 1, px, py, h, 0);
  }
}

/* THE POLES AND THE WIRES along the lane, the town's own concrete poles,
 * and a line of them down the forecourt's east side to the quays. */
const POLE_H = 10;
function poles(T, r) {
  const at = [];
  for (let x = 36; x < 370; x += 28) {
    at.push([x + r.range(-2, 2), POLE_Y]);
  }
  for (const [px, py] of at) {
    T.asset({ type: 'utilityPole', dims: { height: POLE_H } }, 1, px, py, TOP, 0);
  }
  /* Three wires and the drop to each building. */
  for (let i = 0; i + 1 < at.length; i += 1) {
    const [ax, ay] = at[i];
    const [bx, by] = at[i + 1];
    for (const [dz, dy] of [[-0.6, -0.5], [-0.6, 0.5], [-1.6, 0]]) {
      T.wire('skIron', [ax, ay + dy, TOP + POLE_H + dz], [bx, by + dy, TOP + POLE_H + dz], 0.55, 0.02);
    }
  }
  for (const [px, py] of at) {
    if (r.chance(0.6)) {
      T.wire('skIron', [px, py, TOP + POLE_H - 1.8], [px + r.range(-3, 3), py + 2.6, TOP + 5.2], 0.25, 0.015);
    }
  }
  /* One pole's wire down and broken, hanging. */
  const [hx, hy] = at[Math.floor(at.length / 2)];
  T.wire('skIron', [hx, hy, TOP + POLE_H - 1.6], [hx + 3.2, hy - 4, TOP + 0.4], 0.8, 0.02);
}

/* The town's drinks machines: two by the lane, one dead by the forecourt. */
function machines(T, r) {
  T.asset({ type: 'vending', dims: { count: 2, variant: 3 } }, 1, 236, 208.6, TOP, (3 * Math.PI) / 2);
  T.asset({ type: 'vending', dims: { count: 1, variant: 7 } }, 1, 116, 208.6, TOP, (3 * Math.PI) / 2);
  T.asset({ type: 'vending', dims: { count: 3, variant: 11 } }, 1, 362, 166.5, TOP, Math.PI);
}

/* The cars left in the car park, the town's own kei cars and vans, and
 * one on its roof by the lane. */
function cars(T, r) {
  const F = FORECOURT;
  const left = [
    ['kei', 130, 0], ['keivan', 158, 0], ['hatch', 196, 0], ['kei', 232, 1],
    ['van', 270, 0], ['kei', 318, 1], ['sedan', 346, 0],
  ];
  for (const [style, px, turn] of left) {
    T.asset({ type: 'car', style, dims: { variant: r.int(1, 12) } }, 1, px, F.y1 - 3, TOP, Math.PI / 2 + (turn ? Math.PI : 0));
  }
  /* Weed through the cars' wheels. */
  T.dress(() => {
    for (const [, px] of left) {
      for (let q = 0; q < 5; q += 1) {
        T.bead('skWeed', px + r.range(-1.2, 1.2), F.y1 - 3 + r.range(-2, 2), TOP + 0.2, r.range(0.2, 0.4));
      }
    }
  });
}
