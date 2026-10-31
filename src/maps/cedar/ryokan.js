/*
 * ryokan.js: the inn and everything round it. The old two storey timber
 * inn (honkan) on the car park, its bridge corridor (watari) to the
 * bathhouse, the bathhouse with its steam lantern on the ridge, the walled
 * outdoor bath, the boiler house under its chimney, the storehouse (kura),
 * the bus shelter on the road up, the road, the car park and the pipe that
 * brings the hot water down from the spring. Pure, as ./frame.js is.
 *
 * WHAT IT IS MODELLED ON. The abandoned mountain hot spring inns of the
 * haikyo photographers (onsen ryokan left in the 1990s when the coach
 * parties stopped coming): a timber frame of dark posts with cream plaster
 * between, a ground floor on a stone footing half a metre up, a guest floor
 * over it with a corridor along the sunny side behind a row of windows, a
 * kawara tiled gable roof, a covered corridor across the garden to the
 * baths, and a storehouse older than the inn. Sizes in the Japanese module,
 * the ken of 1.82 m, rounded: a two storey inn of twenty ken by seven, a
 * guest floor 3 m to the eaves, doors 1.8 m.
 *
 * THE LINES, which is what a freestyle map is for, and every one of them
 * a hole somebody could really have left:
 *
 *   the entrance     the front doors are gone: six metres wide under the
 *                    porch, straight through the lobby and out to the garden
 *   the corridor     the guest floor's corridor runs the inn's whole length
 *                    with a window open at each end
 *   the stairwell    up from the lobby to the guest floor
 *   the cave-in      the east bay's roof has fallen in, and the guest
 *                    floor under it: a slot in the ridge to dive, two floors
 *   the watari       the bridge corridor to the baths, flown along or under
 *   the steam vent   the bathhouse's ridge lantern, open at both ends,
 *                    reached from outside or up from the bath itself
 *   the kura         the storehouse's two upper shutters stand open on
 *                    either side: a window in, a window out
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

/* The inn's main building, plan metres. g the ground floor's top on its
 * footing, f1 the guest floor's slab, f1t its top, eave the walls' top. */
export const MAIN = { x0: 96, x1: 132, y0: 92, y1: 104, g: 0.45, f1: 3.4, f1t: 3.7, eave: 6.6, ridge: 10.4, t: 0.2 };
/* The front doors, under the porch. */
export const ENTRANCE = { x0: 111, x1: 117, h1: 2.9 };
/* The corridor along the guest floor's south side, and its end windows. */
export const CORRIDOR = { y0: MAIN.y0 + 0.1, y1: 94.6, w0: 92.5, w1: 94.3, h0: 4.1, h1: 6.1 };
/* Where the roof and the guest floor have fallen in. */
export const CAVE = { x0: 122.5, x1: 131.6, roofY0: 96.4, roofY1: 100.6, slabX0: 125, slabX1: 130.6, slabY0: 95.2, slabY1: 101.5 };
/* The bridge corridor to the baths, at the guest floor's height. */
export const WATARI = { x0: 101, x1: 103.6, y0: MAIN.y1, y1: 120, posts: [108, 112, 116], wall: 4.5, eave: 5.9 };
/* The bathhouse, and its ridge lantern. */
export const BATH = { x0: 90, x1: 110, y0: 120, y1: 132, top: 5.0, lantern: { y0: 124.6, y1: 127.4, h0: 7.45, h1: 9.6 } };
/* The outdoor bath behind its fence. */
export const ROTEN = { x0: 112, x1: 132, y0: 116, y1: 136, px: 122, py: 126, r: 5.4 };
/* The storehouse, and its two open shutters. */
export const KURA = { x0: 60, x1: 66, y0: 95, y1: 103, top: 6.2, win: { x0: 62.15, x1: 63.85, h0: 3.6, h1: 5.25 } };
/* The boiler house; the chimney is the document's (./yard.js). */
export const BOILER = { x0: 76, x1: 86, y0: 124, y1: 132, top: 3.8 };
export const CHIMNEY = { px: 81, py: 138.6, height: 21, radius: 2.4, door: 2.6 };
/* The bus shelter on the road up. */
export const SHELTER = { x0: 93.2, x1: 95.6, y0: 17, y1: 22.5 };
/* The road up, the car park, and the pipe. */
export const ROAD = { x0: 85.5, x1: 90.5, y1: 38 };
/* The car park is an L: gravel from island to y1 across the whole width,
 * and from y0 to island east of east, the road's mouth and the start. The
 * corner between them stays cedar. */
export const CARPARK = { x0: 48, x1: 121, y0: 36, y1: 88, island: 62, east: 84 };
export const PIPE = { x: 88, y0: 128, y1: 166, x1: 152, h: 1.5, r: 0.16 };

const DOOR_H = 2.6;

/* A hole list for a wall along x: one window every `pitch` from a0, each
 * `w` wide, h0 to h1 up, skipping the ones `skip` names by index. */
function windows(a0, n, pitch, w, h0, h1, skip = []) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    if (!skip.includes(i)) {
      out.push([a0 + i * pitch, a0 + i * pitch + w, h0, h1]);
    }
  }
  return out;
}

/*
 * A TIMBER FRAME over a plaster wall: the posts a ken apart and the two
 * rails (the sill and the head) proud of the face by a few centimetres.
 * Drawn only: the plaster behind is the solid. `axis` and `at` as
 * T.wall's, `out` the side of the wall the frame is on (+1 north or east).
 */
function frame(T, axis, at, a0, a1, h0, h1, out, holes = [], m = 'cdTimber') {
  const p = 0.06;
  const s = 0.16;
  const o0 = at + out * 0.1;
  const o1 = o0 + out * p;
  const n = Math.max(1, Math.round((a1 - a0) / 1.82));
  const step = (a1 - a0) / n;
  const inHole = (a) => holes.some(([f, to]) => a > f + 0.05 && a < to - 0.05);
  for (let i = 0; i <= n; i += 1) {
    const a = a0 + i * step;
    const lo = Math.min(Math.max(a - s / 2, a0), a1 - s);
    if (inHole(a)) {
      continue;
    }
    if (axis === 'x') {
      T.deco(m, lo, Math.min(o0, o1), h0, lo + s, Math.max(o0, o1), h1, true);
    } else {
      T.deco(m, Math.min(o0, o1), lo, h0, Math.max(o0, o1), lo + s, h1, true);
    }
  }
  for (const h of [h0, h1 - 0.18]) {
    if (axis === 'x') {
      T.deco(m, a0, Math.min(o0, o1), h, a1, Math.max(o0, o1), h + 0.18, true);
    } else {
      T.deco(m, Math.min(o0, o1), a0, h, Math.max(o0, o1), a1, h + 0.18, true);
    }
  }
}

/* A sill and a lintel round every hole, proud of the wall, so a window
 * reads as a window and not as a missing panel. Drawn only. */
function trims(T, axis, at, out, holes, m = 'cdTimberDark') {
  const o0 = at + out * 0.1;
  const o1 = o0 + out * 0.09;
  for (const [f, to, h0, h1] of holes) {
    for (const [y0, y1] of [[h0 - 0.12, h0], [h1, h1 + 0.12]]) {
      if (y0 < 0.5) {
        continue;
      }
      if (axis === 'x') {
        T.deco(m, f - 0.1, Math.min(o0, o1), y0, to + 0.1, Math.max(o0, o1), y1, true);
      } else {
        T.deco(m, Math.min(o0, o1), f - 0.1, y0, Math.max(o0, o1), to + 0.1, y1, true);
      }
    }
  }
}

/* An intact shoji or glass panel in a hole: thin, solid, the paper's
 * lattice drawn on it. */
function shoji(T, axis, at, f, to, h0, h1) {
  if (axis === 'x') {
    T.box('cdShoji', f, at - 0.03, h0, to, at + 0.03, h1, { name: 'shoji' });
  } else {
    T.box('cdShoji', at - 0.03, f, h0, at + 0.03, to, h1, { name: 'shoji' });
  }
  const cols = Math.max(2, Math.round((to - f) / 0.45));
  for (let i = 1; i < cols; i += 1) {
    const a = f + ((to - f) * i) / cols;
    for (const side of [-1, 1]) {
      const o = at + side * 0.04;
      if (axis === 'x') {
        T.paint('cdTimber', a - 0.02, Math.min(o, at + side * 0.05), h0, a + 0.02, Math.max(o, at + side * 0.05), h1, true);
      } else {
        T.paint('cdTimber', Math.min(o, at + side * 0.05), a - 0.02, h0, Math.max(o, at + side * 0.05), a + 0.02, h1, true);
      }
    }
  }
  const rows = Math.max(2, Math.round((h1 - h0) / 0.5));
  for (let j = 1; j < rows; j += 1) {
    const h = h0 + ((h1 - h0) * j) / rows;
    for (const side of [-1, 1]) {
      const o = at + side * 0.04;
      if (axis === 'x') {
        T.paint('cdTimber', f, Math.min(o, at + side * 0.05), h - 0.02, to, Math.max(o, at + side * 0.05), h + 0.02, true);
      } else {
        T.paint('cdTimber', Math.min(o, at + side * 0.05), f, h - 0.02, Math.max(o, at + side * 0.05), to, h + 0.02, true);
      }
    }
  }
}

/* Boards nailed across a hole: solid, a few planks with daylight between
 * that is too narrow to fly. */
function boarded(T, axis, at, f, to, h0, h1, out) {
  const o = at + out * 0.14;
  const n = Math.max(2, Math.round((h1 - h0) / 0.32));
  if (axis === 'x') {
    T.hidden(f, at - 0.06, h0, to, at + 0.06, h1, 'wall', 'boards');
  } else {
    T.hidden(at - 0.06, f, h0, at + 0.06, to, h1, 'wall', 'boards');
  }
  for (let j = 0; j < n; j += 1) {
    const h = h0 + ((h1 - h0) * (j + 0.5)) / n;
    if (axis === 'x') {
      T.deco('cdTimberSilver', f - 0.15, Math.min(at, o), h - 0.11, to + 0.15, Math.max(at, o), h + 0.11);
    } else {
      T.deco('cdTimberSilver', Math.min(at, o), f - 0.15, h - 0.11, Math.max(at, o), to + 0.15, h + 0.11);
    }
  }
}

/* A water stain run down the plaster under a sill: paint. */
function stain(T, axis, at, out, a, h0, h1, w) {
  const o = at + out * 0.105;
  if (axis === 'x') {
    T.paint('cdPlasterStain', a - w / 2, Math.min(o, o + out * 0.01), h0, a + w / 2, Math.max(o, o + out * 0.01), h1, true);
  } else {
    T.paint('cdPlasterStain', Math.min(o, o + out * 0.01), a - w / 2, h0, Math.max(o, o + out * 0.01), a + w / 2, h1, true);
  }
}

/* -------------------------------------------------------------------- */
/* The main building                                                     */
/* -------------------------------------------------------------------- */

function mainBuilding(T) {
  const M = MAIN;
  const t = M.t;
  /* The stone footing and the ground floor on it, solid to its top. */
  T.box('cdStoneDark', M.x0 - 0.1, M.y0 - 0.1, 0, M.x1 + 0.1, M.y1 + 0.1, M.g, { name: 'footing' });
  T.paint('cdFloor', M.x0 + t / 2, M.y0 + t / 2, M.g, M.x1 - t / 2, M.y1 - t / 2, M.g + 0.015, true);
  T.paint('cdTatami', 98, 96, M.g + 0.015, 106, 103.4, M.g + 0.03, true);

  /* GROUND FLOOR. South: the entrance and four windows, one boarded. */
  const gS = [[ENTRANCE.x0, ENTRANCE.x1, M.g, ENTRANCE.h1], [99, 103, 1.15, 2.75], [105, 109, 1.15, 2.75], [119, 123, 1.15, 2.75], [125, 129, 1.15, 2.75]];
  T.wall('cdPlaster', 'x', M.y0, M.x0, M.x1, M.g, M.f1, t, gS, { name: 'inn wall' });
  frame(T, 'x', M.y0, M.x0, M.x1, M.g, M.f1, -1, gS);
  trims(T, 'x', M.y0, -1, gS.slice(1));
  boarded(T, 'x', M.y0, 105, 109, 1.15, 2.75, -1);
  shoji(T, 'x', M.y0 + 0.4, 125, 129, 1.15, 2.75);
  /* North: three wide openings onto the garden, their doors long gone. */
  const gN = [[99, 105, M.g, 2.7], [113, 119, M.g, 2.7], [124, 129, M.g, 2.7]];
  T.wall('cdPlaster', 'x', M.y1, M.x0, M.x1, M.g, M.f1, t, gN, { name: 'inn wall' });
  frame(T, 'x', M.y1, M.x0, M.x1, M.g, M.f1, 1, gN);
  /* West and east ends: a side door on the west. */
  const gW = [[97.5, 99.5, M.g, M.g + DOOR_H]];
  T.wall('cdPlaster', 'y', M.x0, M.y0, M.y1, M.g, M.f1, t, gW, { name: 'inn wall' });
  frame(T, 'y', M.x0, M.y0, M.y1, M.g, M.f1, -1, gW);
  T.wall('cdPlaster', 'y', M.x1, M.y0, M.y1, M.g, M.f1, t, [], { name: 'inn wall' });
  frame(T, 'y', M.x1, M.y0, M.y1, M.g, M.f1, 1);
  /* Inside: the lobby between two partitions, each with a doorway. */
  T.wall('cdPlaster', 'y', 107.5, M.y0, M.y1, M.g, M.f1, 0.12, [[96.5, 98.5, M.g, M.g + DOOR_H], [100.5, 102.5, M.g, M.g + DOOR_H]], { name: 'partition' });
  T.wall('cdPlaster', 'y', 121, M.y0, M.y1, M.g, M.f1, 0.12, [[92.6, 95.6, M.g, M.g + DOOR_H], [100.4, 102.4, M.g, M.g + DOOR_H]], { name: 'partition' });
  /* The front desk, and the shoe shelves of the genkan. */
  T.box('cdTimberDark', 109, 100.6, M.g, 112.5, 101.4, M.g + 1.05, { name: 'desk' });
  T.deco('cdTimberSilver', 108.2, 92.4, M.g, 110.6, 92.9, M.g + 1.7);
  T.deco('cdTimberSilver', 117.4, 92.4, M.g, 119.8, 92.9, M.g + 1.7);
  /* A fallen ceiling board, propped on the desk. */
  T.cyl('cdTimberSilver', [112.6, 100.9, M.g + 1.05], [114.8, 98.2, M.g + 0.02], 0.09, 4, null, true);

  /* THE STAIRS, up from the lobby's east side to the guest floor, and the
   * well in the slab they rise through. Each tread solid to the floor. */
  const st = { x0: 117.4, x1: 120.6, y0: 96.6, y1: 103.6 };
  const steps = 11;
  for (let i = 0; i < steps; i += 1) {
    const y0 = st.y1 - ((i + 1) * (st.y1 - st.y0)) / steps;
    const h = M.g + ((i + 1) * (M.f1t - M.g)) / steps;
    T.box('cdTimber', st.x0, y0, M.g, st.x1, y0 + (st.y1 - st.y0) / steps, h, { name: 'stair' });
  }

  /* THE GUEST FLOOR's slab, with the stairwell and the cave-in cut out. */
  const slabHoles = [
    { x0: st.x0, x1: st.x1, y0: st.y0 - 1.6, y1: st.y0 + 2.8 },
    { x0: CAVE.slabX0, x1: CAVE.slabX1, y0: CAVE.slabY0, y1: CAVE.slabY1 },
  ];
  slabWithHoles(T, M.x0, M.y0, M.x1, M.y1, M.f1, M.f1t, slabHoles);
  T.paint('cdTatami', 98, 95.6, M.f1t, 104.2, 103.4, M.f1t + 0.02, true);
  T.paint('cdTatami', 108.8, 95.6, M.f1t, 113.2, 103.4, M.f1t + 0.02, true);
  /* The broken slab's edge hangs down into the lobby. */
  T.cyl('cdFloor', [CAVE.slabX0 + 0.4, CAVE.slabY1, M.f1], [CAVE.slabX0 + 2.2, CAVE.slabY1 - 2.4, M.g + 0.5], 0.12, 4, null, true);
  T.box('cdFloor', CAVE.slabX1 - 1.6, CAVE.slabY0 + 0.6, M.g, CAVE.slabX1 - 0.2, CAVE.slabY0 + 4.2, M.g + 0.7, { name: 'fallen floor' });

  /* GUEST FLOOR walls. South: ten windows, three still papered. */
  const uS = windows(97.2, 10, 3.5, 2.6, CORRIDOR.h0, CORRIDOR.h1);
  T.wall('cdPlaster', 'x', M.y0, M.x0, M.x1, M.f1t, M.eave, t, uS, { name: 'inn wall' });
  frame(T, 'x', M.y0, M.x0, M.x1, M.f1t, M.eave, -1, uS);
  trims(T, 'x', M.y0, -1, uS);
  for (const i of [1, 4, 8]) {
    const [f, to, h0, h1] = uS[i];
    shoji(T, 'x', M.y0 + 0.2, f, to, h0, h1);
  }
  /* A railing outside the windows, the way a ryokan's guest floor has. */
  for (let i = 0; i <= 18; i += 1) {
    T.cyl('cdTimberDark', [M.x0 + 0.3 + i * 1.97, M.y0 - 0.55, M.f1t], [M.x0 + 0.3 + i * 1.97, M.y0 - 0.55, M.f1t + 0.85], 0.04, 4, null, true);
  }
  T.box('cdTimberDark', M.x0, M.y0 - 0.62, M.f1t + 0.82, M.x1, M.y0 - 0.48, M.f1t + 0.92, { name: 'rail' });
  T.box('cdTimberDark', M.x0, M.y0 - 0.7, M.f1, M.x1, M.y0, M.f1t, { name: 'ledge' });
  /* North: small windows, and the door to the bridge corridor. */
  const uN = [[WATARI.x0 + 0.1, WATARI.x1 - 0.1, M.f1t, WATARI.eave - 0.15], [107, 109, 4.3, 5.6], [114, 116, 4.3, 5.6], [126.2, 128.2, 4.3, 5.6]];
  T.wall('cdPlaster', 'x', M.y1, M.x0, M.x1, M.f1t, M.eave, t, uN, { name: 'inn wall' });
  frame(T, 'x', M.y1, M.x0, M.x1, M.f1t, M.eave, 1, uN);
  trims(T, 'x', M.y1, 1, uN.slice(1));
  /* The ends: the corridor's window open at each. */
  const uE = [[CORRIDOR.w0, CORRIDOR.w1, CORRIDOR.h0, CORRIDOR.h1], [98.4, 100.6, 4.3, 5.6]];
  T.wall('cdPlaster', 'y', M.x0, M.y0, M.y1, M.f1t, M.eave, t, uE, { name: 'inn wall' });
  frame(T, 'y', M.x0, M.y0, M.y1, M.f1t, M.eave, -1, uE);
  trims(T, 'y', M.x0, -1, uE);
  T.wall('cdPlaster', 'y', M.x1, M.y0, M.y1, M.f1t, M.eave, t, uE, { name: 'inn wall' });
  frame(T, 'y', M.x1, M.y0, M.y1, M.f1t, M.eave, 1, uE);
  trims(T, 'y', M.x1, 1, uE);
  /* The corridor's inner wall, a sliding door into each room. */
  const rooms = [[99.4, 101.2], [108.6, 110.4], [113.8, 115.6], [123.2, 125]];
  T.wall('cdShoji', 'x', CORRIDOR.y1, M.x0, M.x1, M.f1t, M.eave, 0.1, rooms.map(([a, b]) => [a, b, M.f1t, M.f1t + 1.95]), { name: 'fusuma' });
  /* The rooms' partitions, square to the corridor. */
  for (const px of [105, 112, 117, 122]) {
    T.wall('cdPlaster', 'y', px, CORRIDOR.y1, M.y1, M.f1t, M.eave, 0.1, [[98.6, 100.4, M.f1t, M.f1t + 1.95]], { name: 'partition' });
  }

  /* THE ROOF: a closed gable over the west twenty six metres, and over the
   * east bay what is left of one, its two sides broken off short of the
   * ridge. The tiles' gable ends are plaster triangles. */
  const eaveH = M.eave;
  const a0 = M.y0 - 1.25;
  const a1 = M.y1 + 1.25;
  const e0 = M.x0 - 1.1;
  const e1 = M.x1 + 1.1;
  T.gable('cdKawara', 'x', a0, a1, eaveH, M.ridge, e0, CAVE.x0, 0.28, 8, 'inn roof');
  const mid = (a0 + a1) / 2;
  const slopeAt = (a) => eaveH + 0.28 + ((M.ridge - eaveH) * (a < mid ? a - a0 : a1 - a)) / (mid - a0);
  T.slope('cdKawara', 'x', a0, eaveH + 0.28, CAVE.roofY0, slopeAt(CAVE.roofY0), CAVE.x0, e1, 0.28, 'broken roof');
  T.slope('cdKawara', 'x', CAVE.roofY1, slopeAt(CAVE.roofY1), a1, eaveH + 0.28, CAVE.x0, e1, 0.28, 'broken roof');
  /* The gable end over the east wall, plaster, open where the ridge fell. */
  T.prism('cdPlaster', 'x', [[M.y0, eaveH], [CAVE.roofY0, slopeAt(CAVE.roofY0) - 0.3], [CAVE.roofY0, eaveH]], M.x1 - 0.1, M.x1 + 0.1);
  T.prism('cdPlaster', 'x', [[CAVE.roofY1, eaveH], [CAVE.roofY1, slopeAt(CAVE.roofY1) - 0.3], [M.y1, eaveH]], M.x1 - 0.1, M.x1 + 0.1);
  T.hidden(M.x1 - 0.1, M.y0, eaveH, M.x1 + 0.1, CAVE.roofY0 - 0.6, eaveH + 1.3, 'wall', 'gable');
  T.hidden(M.x1 - 0.1, CAVE.roofY1 + 0.6, eaveH, M.x1 + 0.1, M.y1, eaveH + 1.3, 'wall', 'gable');
  /* The ridge, its tiles heaped, and the demon tiles (onigawara) at its
   * ends. */
  T.box('cdKawaraDark', e0 - 0.1, mid - 0.32, M.ridge + 0.1, CAVE.x0, mid + 0.32, M.ridge + 0.62, { name: 'ridge' });
  T.box('cdKawaraDark', e0 - 0.35, mid - 0.45, M.ridge - 0.1, e0 + 0.3, mid + 0.45, M.ridge + 0.95, { name: 'onigawara' });
  /* The fallen ridge's tiles on the guest floor, and the rafters left
   * hanging over the hole. */
  T.box('cdKawaraDark', 126, 97, M.f1t, 129.6, 99.2, M.f1t + 0.5, { name: 'fallen tiles' });
  for (const [x, y, h, x2, y2, h2] of [[123.6, 96.2, 9.6, 125.4, 98.6, 7.0], [127.2, 100.8, 9.6, 128.5, 98.4, 6.4], [130.4, 96.2, 9.6, 131.2, 97.6, 8.0]]) {
    T.cyl('cdTimberDark', [x, y, h], [x2, y2, h2], 0.1, 4, null, true);
  }
  /* Moss on the tiles of the north side. */
  T.paint('cdKawaraMoss', 100, mid + 2.2, slopeAt(mid + 2.2) - 0.05, 111, mid + 4.6, slopeAt(mid + 2.2) + 0.08, true);

  /* THE PENT ROOF (hisashi) over the ground floor's south windows. */
  T.slope('cdKawara', 'x', M.y0 - 1.4, M.f1 - 0.25, M.y0, M.f1 + 0.25, M.x0 - 0.3, ENTRANCE.x0 - 1, 0.18, 'hisashi');
  T.slope('cdKawara', 'x', M.y0 - 1.4, M.f1 - 0.25, M.y0, M.f1 + 0.25, ENTRANCE.x1 + 1, M.x1 + 0.3, 0.18, 'hisashi');

  /* THE PORCH over the entrance: four posts and a gable to the south. */
  const P = { x0: ENTRANCE.x0 - 1, x1: ENTRANCE.x1 + 1, y0: 87.6 };
  for (const px of [P.x0 + 0.2, P.x1 - 0.2]) {
    T.post('cdTimberDark', px, P.y0 + 0.3, 0, 3.5, 0.15, { name: 'porch post' });
  }
  T.box('cdTimberDark', P.x0, P.y0 + 0.15, 3.35, P.x1, P.y0 + 0.45, 3.6, { name: 'porch beam' });
  T.gable('cdKawara', 'y', P.x0 - 0.6, P.x1 + 0.6, 3.6, 5.4, P.y0 - 0.4, M.y0, 0.24, 5, 'porch roof');
  /* The paving under it, and the step up. */
  T.paint('cdPaving', P.x0, P.y0, 0, P.x1, M.y0, 0.04);
  T.box('cdStone', ENTRANCE.x0, M.y0 - 0.9, 0, ENTRANCE.x1, M.y0, 0.22, { name: 'step' });
  /* The inn's name board over the door: dark wood, brush strokes in
   * nobody's words. */
  T.deco('cdTimberDark', 112.2, P.y0 - 0.48, 4.0, 115.8, P.y0 - 0.36, 4.9);
  brushColumn(T, 112.9, P.y0 - 0.5, 4.8, 0.62, 'x');
  brushColumn(T, 114.0, P.y0 - 0.5, 4.8, 0.62, 'x');
  brushColumn(T, 115.1, P.y0 - 0.5, 4.8, 0.62, 'x');

  /* Water stains under the guest floor's sills, and a drainpipe. */
  for (const a of [99.5, 106.8, 113.6, 120.6, 127.7]) {
    stain(T, 'x', M.y0, -1, a, 3.8, 4.1, 0.5);
  }
  T.post('cdRust', M.x1 - 0.4, M.y0 - 0.25, 0, M.eave, 0.06, { fine: true, solid: false });
}

/* A slab from (x0, y0) to (x1, y1), h0 to h1, with rectangles cut out:
 * solid, as the boxes that are left, by the same grid cut a wall uses. */
function slabWithHoles(T, x0, y0, x1, y1, h0, h1, holes) {
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h.x0, h.x1])])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i += 1) {
    const xa = xs[i];
    const xb = xs[i + 1];
    const xc = (xa + xb) / 2;
    const cuts = holes.filter((h) => xc > h.x0 && xc < h.x1).sort((a, b) => a.y0 - b.y0);
    let y = y0;
    for (const c of cuts) {
      if (c.y0 > y) {
        T.box('cdFloor', xa, y, h0, xb, c.y0, h1, { name: 'floor' });
      }
      y = Math.max(y, c.y1);
    }
    if (y < y1) {
      T.box('cdFloor', xa, y, h0, xb, y1, h1, { name: 'floor' });
    }
  }
}

/*
 * A COLUMN OF BRUSH STROKES on a board, top down from h: a few short
 * strokes a character, three characters. Not a word in any language, the
 * shape of signwriting only, so nothing on the map can be read as anybody's
 * name. `along` is the face's plan axis ('x' for a face looking north or
 * south), `at` the face's plane.
 */
function brushColumn(T, a, at, h, len, along) {
  const R = rng(Math.round(a * 97 + h * 31));
  const ch = len / 3;
  for (let c = 0; c < 3; c += 1) {
    const top = h - c * ch - 0.04;
    const n = R.int(3, 5);
    for (let s = 0; s < n; s += 1) {
      const u0 = R.range(-0.13, 0.08);
      const u1 = u0 + R.range(0.06, 0.2);
      const v0 = top - R.range(0, ch * 0.75);
      const v1 = v0 - R.range(0, ch * 0.35);
      if (along === 'x') {
        T.stroke('cdToriiBlack', [a + u0, at, v0], [a + u1, at, v1], 0.022, true);
      } else {
        T.stroke('cdToriiBlack', [at, a + u0, v0], [at, a + u1, v1], 0.022, true);
      }
    }
  }
}

/* -------------------------------------------------------------------- */
/* The bridge corridor, the bathhouse, the outdoor bath                  */
/* -------------------------------------------------------------------- */

function watari(T) {
  const Wt = WATARI;
  const f1 = MAIN.f1;
  const f1t = MAIN.f1t;
  /* The deck, on three pairs of posts. */
  T.box('cdTimber', Wt.x0, Wt.y0, f1, Wt.x1, Wt.y1, f1t, { name: 'watari deck' });
  for (const py of Wt.posts) {
    for (const px of [Wt.x0 + 0.14, Wt.x1 - 0.14]) {
      T.post('cdTimberDark', px, py, 0, f1, 0.13, { name: 'watari post' });
    }
    T.box('cdTimberDark', Wt.x0, py - 0.1, f1 - 0.35, Wt.x1, py + 0.1, f1, { name: 'watari beam' });
  }
  /* The sides: a plank wall to the waist, then open between posts. */
  for (const px of [Wt.x0 + 0.05, Wt.x1 - 0.05]) {
    T.box('cdTimberSilver', px - 0.05, Wt.y0, f1t, px + 0.05, Wt.y1, Wt.wall, { name: 'watari side' });
    for (let py = Wt.y0 + 1.6; py < Wt.y1 - 0.5; py += 2.4) {
      T.post('cdTimberDark', px, py, Wt.wall, Wt.eave, 0.07, { name: 'watari post' });
    }
  }
  T.gable('cdKawara', 'y', Wt.x0 - 0.5, Wt.x1 + 0.5, Wt.eave, Wt.eave + 0.9, Wt.y0, Wt.y1, 0.2, 3, 'watari roof');
}

function bathhouse(T) {
  const B = BATH;
  const L = B.lantern;
  const t = 0.25;
  /* The noren doorways on the south (the blue curtain the men's, the red
   * the women's), clerestory windows on the north, the garden door to the
   * east, and the bridge corridor's door high on the south wall. */
  const holesS = [[93.4, 95.4, 0, 2.3], [104.6, 106.6, 0, 2.3], [WATARI.x0 + 0.1, WATARI.x1 - 0.1, MAIN.f1t, B.top]];
  const holesN = [[92.6, 96.6, 3.0, 4.4], [99.6, 103.6, 3.0, 4.4], [105.6, 108.6, 3.0, 4.4]];
  T.wall('cdPlaster', 'x', B.y0, B.x0, B.x1, 0, B.top, t, holesS, { name: 'bath wall' });
  frame(T, 'x', B.y0, B.x0, B.x1, 0, B.top, -1, holesS);
  T.wall('cdPlaster', 'x', B.y1, B.x0, B.x1, 0, B.top, t, holesN, { name: 'bath wall' });
  frame(T, 'x', B.y1, B.x0, B.x1, 0, B.top, 1, holesN);
  trims(T, 'x', B.y1, 1, holesN);
  T.wall('cdPlaster', 'y', B.x0, B.y0, B.y1, 0, B.top, t, [], { name: 'bath wall' });
  frame(T, 'y', B.x0, B.y0, B.y1, 0, B.top, -1);
  const holesE = [[125, 127.2, 0, 2.3]];
  T.wall('cdPlaster', 'y', B.x1, B.y0, B.y1, 0, B.top, t, holesE, { name: 'bath wall' });
  frame(T, 'y', B.x1, B.y0, B.y1, 0, B.top, 1, holesE);
  /* The noren: cloth hanging in the top of each doorway, drawn only. */
  for (const [f, to, m] of [[93.4, 95.4, 'cdNorenBlue'], [104.6, 106.6, 'cdNorenRed']]) {
    for (let i = 0; i < 3; i += 1) {
      const a = f + 0.04 + (i * (to - f - 0.08)) / 3;
      T.paint(m, a, B.y0 - 0.2, 1.65, a + (to - f - 0.08) / 3 - 0.04, B.y0 - 0.17, 2.3, true);
    }
  }
  /* The floor tiles and the big bath, its water level with its rim. */
  T.paint('cdPaving', B.x0 + 0.15, B.y0 + 0.15, 0, B.x1 - 0.15, B.y1 - 0.15, 0.03);
  T.box('cdStoneDark', 95, 124.2, 0, 105.4, 129.6, 0.55, { name: 'bath' });
  T.paint('cdOnsen', 95.3, 124.5, 0.55, 105.1, 129.3, 0.57);
  /* The washing places along the west wall: a shelf, stools, buckets. */
  T.deco('cdPaving', 90.15, 121, 0.0, 90.7, 131, 0.75);
  for (let py = 122; py < 131; py += 1.8) {
    T.deco('cdTimberSilver', 91.0, py - 0.2, 0, 91.4, py + 0.2, 0.35, true);
    T.cyl('cdTimber', [91.9, py + 0.5, 0], [91.9, py + 0.5, 0.25], 0.16, 7, 0.19, true);
  }
  /* THE ROOF, two sides that stop short of the ridge, and the lantern over
   * the gap between them on posts, open along both sides and at both
   * ends: the steam vent. */
  const a0 = B.y0 - 1.0;
  const a1 = B.y1 + 1.0;
  const e0 = B.x0 - 0.9;
  const e1 = B.x1 + 0.9;
  const pitch = (L.h0 - B.top) / (L.y0 - B.y0);
  T.slope('cdKawara', 'x', a0, B.top - pitch * 1.0 + 0.24, L.y0 - 0.2, L.h0 + 0.24, e0, e1, 0.24, 'bath roof');
  T.slope('cdKawara', 'x', L.y1 + 0.2, L.h0 + 0.24, a1, B.top - pitch * 1.0 + 0.24, e0, e1, 0.24, 'bath roof');
  /* The gable ends, plaster, up to the lantern's sill and no higher. */
  for (const px of [B.x0, B.x1]) {
    T.prism('cdPlaster', 'x', [[B.y0, B.top], [L.y0, L.h0], [L.y1, L.h0], [B.y1, B.top]], px - t / 2, px + t / 2);
    T.hidden(px - t / 2, B.y0 + 1.2, B.top, px + t / 2, B.y1 - 1.2, B.top + (L.h0 - B.top) * 0.55, 'wall', 'gable');
    T.hidden(px - t / 2, L.y0 - 0.6, B.top + (L.h0 - B.top) * 0.55, px + t / 2, L.y1 + 0.6, L.h0 - 0.05, 'wall', 'gable');
  }
  for (let px = B.x0 + 1.0; px <= B.x1 - 0.9; px += 4.5) {
    for (const py of [L.y0, L.y1]) {
      T.post('cdTimberDark', px, py, L.h0, L.h1, 0.09, { name: 'lantern post' });
    }
  }
  T.gable('cdKawara', 'x', L.y0 - 0.7, L.y1 + 0.7, L.h1, L.h1 + 1.05, e0 + 0.5, e1 - 0.5, 0.2, 3, 'lantern roof');
  /* The hot spring mark on the gable end, over the west wall. */
  onsenMark(T, B.x0 - 0.16, (B.y0 + B.y1) / 2, 6.0, 0.55, 'y', -1);
}

/*
 * THE HOT SPRING MARK, a bowl and three rising wisps, drawn as strokes on
 * a red plate. It has meant "hot spring" on Japanese maps since the Meiji
 * survey, and needs no words. `along` the face's plan axis, `out` which
 * way it faces.
 */
function onsenMark(T, a, b, h, s, along, out) {
  const at = (u, v, lift) => (along === 'y' ? [a + out * lift, b + u, h + v] : [a + u, b + out * lift, h + v]);
  if (along === 'y') {
    T.deco('cdSignRed', a + out * 0.02 - 0.02, b - s, h - s, a + out * 0.02 + 0.02, b + s, h + s, true);
  } else {
    T.deco('cdSignRed', a - s, b + out * 0.02 - 0.02, h - s, a + s, b + out * 0.02 + 0.02, h + s, true);
  }
  const L = 0.06;
  const r = 0.035 * (s / 0.55);
  /* The bowl, a U of four strokes. */
  const bowl = [[-0.34, -0.05], [-0.25, -0.3], [0, -0.38], [0.25, -0.3], [0.34, -0.05]];
  for (let i = 0; i + 1 < bowl.length; i += 1) {
    T.stroke('cdPaper', at(bowl[i][0] * s * 1.6, bowl[i][1] * s * 1.6, L), at(bowl[i + 1][0] * s * 1.6, bowl[i + 1][1] * s * 1.6, L), r, true);
  }
  /* Three wisps, each a zigzag of three. */
  for (const u of [-0.16, 0, 0.16]) {
    const z = [[u, -0.12], [u + 0.05, 0.02], [u - 0.03, 0.16], [u + 0.03, 0.3]];
    for (let i = 0; i + 1 < z.length; i += 1) {
      T.stroke('cdPaper', at(z[i][0] * s * 1.6, z[i][1] * s * 1.6, L), at(z[i + 1][0] * s * 1.6, z[i + 1][1] * s * 1.6, L), r, true);
    }
  }
}

function roten(T) {
  const R = ROTEN;
  const h = 2.0;
  /* The bamboo fence, open toward the bathhouse's garden door and toward
   * the plantation behind. */
  T.wall('cdBamboo', 'y', R.x0, R.y0, R.y1, 0, h, 0.12, [[124.4, 127.8, 0, h]], { name: 'fence' });
  T.wall('cdBamboo', 'y', R.x1, R.y0, R.y1, 0, h, 0.12, [[123.6, 128.4, 0, h]], { name: 'fence' });
  T.wall('cdBamboo', 'x', R.y0, R.x0, R.x1, 0, h, 0.12, [], { name: 'fence' });
  T.wall('cdBamboo', 'x', R.y1, R.x0, R.x1, 0, h, 0.12, [], { name: 'fence' });
  /* The fence's bamboo, a cane every 15 cm drawn as a rail top and
   * bottom and posts, with the dry canes darker. */
  for (const [axis, at, a0, a1] of [['y', R.x0, R.y0, R.y1], ['y', R.x1, R.y0, R.y1], ['x', R.y0, R.x0, R.x1], ['x', R.y1, R.x0, R.x1]]) {
    for (let a = a0 + 0.9; a < a1; a += 1.8) {
      if (axis === 'y') {
        T.post('cdBambooDry', at, a, 0, h + 0.15, 0.05, { fine: true, solid: false });
      } else {
        T.post('cdBambooDry', a, at, 0, h + 0.15, 0.05, { fine: true, solid: false });
      }
    }
    for (const y of [0.45, 1.6]) {
      if (axis === 'y') {
        T.deco('cdBambooDry', at - 0.1, a0, y, at + 0.1, a1, y + 0.07, true);
      } else {
        T.deco('cdBambooDry', a0, at - 0.1, y, a1, at + 0.1, y + 0.07, true);
      }
    }
  }
  /* The pool, its stones round it, solid as balls. */
  T.paint('cdPaving', R.x0 + 0.1, R.y0 + 0.1, 0, R.x1 - 0.1, R.y1 - 0.1, 0.02);
  T.disc('cdOnsen', R.px, R.py, R.r, 0.02, 0.12, 28);
  const rnd = rng(0x0b5e7);
  /* Positions round the rim, from a table of unit vectors made once with
   * the seeded random's angle, so no JS sine reaches a solid. */
  const dirs = [
    [1, 0], [0.94, 0.34], [0.77, 0.64], [0.5, 0.87], [0.17, 0.98], [-0.17, 0.98], [-0.5, 0.87], [-0.77, 0.64], [-0.94, 0.34],
    [-1, 0], [-0.94, -0.34], [-0.77, -0.64], [-0.5, -0.87], [-0.17, -0.98], [0.17, -0.98], [0.5, -0.87], [0.77, -0.64], [0.94, -0.34],
  ];
  dirs.forEach(([dx, dy], i) => {
    const rr = rnd.range(0.45, 0.85);
    const px = R.px + dx * (R.r + rr * 0.6);
    const py = R.py + dy * (R.r + rr * 0.6);
    T.ball(i % 4 === 0 ? 'cdStoneMoss' : 'cdStoneDark', px, py, rr * 0.55, rr);
    T.cap('cdStoneDark', [px, py, rr * 0.55], [px, py, rr * 0.55], rr * 0.9, { draw: false, name: 'rock', kind: 'wall' });
  });
  /* The big rock the water falls from, mossy, on the north side. */
  T.ball('cdStoneMoss', R.px + 1.5, R.py + R.r + 1.2, 1.1, 1.6);
  T.cap('cdStoneDark', [R.px + 1.5, R.py + R.r + 1.2, 1.1], [R.px + 1.5, R.py + R.r + 1.2, 1.1], 1.45, { draw: false, name: 'rock', kind: 'wall' });
  /* A bamboo spout pouring into the pool. */
  T.cyl('cdBamboo', [R.px + 1.5, R.py + R.r + 0.2, 2.2], [R.px + 1.2, R.py + R.r - 0.8, 1.6], 0.06, 6, null, true);
  /* The little roof (azumaya) over the pool's west end: four posts and a
   * pyramid of tile. */
  const A = { x0: 114.2, x1: 118.6, y0: 128.6, y1: 133 };
  for (const [px, py] of [[A.x0, A.y0], [A.x1, A.y0], [A.x0, A.y1], [A.x1, A.y1]]) {
    T.post('cdTimberDark', px, py, 0, 2.7, 0.1, { name: 'azumaya post' });
  }
  const o = { x0: A.x0 - 0.7, y0: A.y0 - 0.7, x1: A.x1 + 0.7, y1: A.y1 + 0.7 };
  const i = { x0: (A.x0 + A.x1) / 2 - 0.15, y0: (A.y0 + A.y1) / 2 - 0.15, x1: (A.x0 + A.x1) / 2 + 0.15, y1: (A.y0 + A.y1) / 2 + 0.15 };
  T.frustum('cdKawara', o, 2.7, i, 4.3);
  T.frustumSolid(o, 2.7, i, 4.3, 4, 'azumaya roof');
}

/* -------------------------------------------------------------------- */
/* The storehouse, the boiler house, the shelter, the road               */
/* -------------------------------------------------------------------- */

function kura(T) {
  const K = KURA;
  const t = 0.4;
  const wn = K.win;
  const holes = [[wn.x0, wn.x1, wn.h0, wn.h1]];
  /* The upper floor's slab inside, under the windows. */
  T.box('cdFloor', K.x0, K.y0, 3.0, K.x1, K.y1, 3.25, { name: 'kura floor' });
  T.wall('cdKuraWhite', 'x', K.y0, K.x0, K.x1, 0, K.top, t, holes, { name: 'kura wall' });
  T.wall('cdKuraWhite', 'x', K.y1, K.x0, K.x1, 0, K.top, t, holes, { name: 'kura wall' });
  T.wall('cdKuraWhite', 'y', K.x0, K.y0, K.y1, 0, K.top, t, [], { name: 'kura wall' });
  T.wall('cdKuraWhite', 'y', K.x1, K.y0, K.y1, 0, K.top, t, [], { name: 'kura wall' });
  /* The black skirt round the foot, with the white grid of the tiled
   * (namako) wall on it. */
  const o = 0.06;
  T.deco('cdKuraBlack', K.x0 - t / 2 - o, K.y0 - t / 2 - o, 0, K.x1 + t / 2 + o, K.y1 + t / 2 + o, 1.4);
  for (const h of [0.45, 0.9]) {
    T.paint('cdKuraWhite', K.x0 - t / 2 - o - 0.01, K.y0 - t / 2 - o - 0.01, h, K.x1 + t / 2 + o + 0.01, K.y1 + t / 2 + o + 0.01, h + 0.05, true);
  }
  for (let px = K.x0 + 0.5; px < K.x1; px += 0.55) {
    T.paint('cdKuraWhite', px, K.y0 - t / 2 - o - 0.01, 0.05, px + 0.05, K.y0 - t / 2 - o + 0.02, 1.4, true);
  }
  /* The shutters, a heavy plaster door each side of every window, swung
   * open against the wall. */
  for (const [py, out] of [[K.y0, -1], [K.y1, 1]]) {
    const face = py + out * (t / 2);
    T.deco('cdKuraWhite', wn.x0 - 0.95, Math.min(face, face + out * 0.22), wn.h0 - 0.05, wn.x0 - 0.15, Math.max(face, face + out * 0.22), wn.h1 + 0.05);
    T.deco('cdKuraWhite', wn.x1 + 0.15, Math.min(face, face + out * 0.22), wn.h0 - 0.05, wn.x1 + 0.95, Math.max(face, face + out * 0.22), wn.h1 + 0.05);
    T.deco('cdKuraBlack', wn.x0 - 0.15, Math.min(face, face + out * 0.25), wn.h1, wn.x1 + 0.15, Math.max(face, face + out * 0.25), wn.h1 + 0.3);
  }
  /* The door on the east, shut. */
  T.deco('cdTimberDark', K.x1 + t / 2, 98, 0, K.x1 + t / 2 + 0.12, 100.6, 2.4);
  /* The heavy roof, its gable to the south, and the crest on it. */
  T.gable('cdKawara', 'y', K.x0 - 0.8, K.x1 + 0.8, K.top, K.top + 2.4, K.y0 - 0.9, K.y1 + 0.9, 0.32, 6, 'kura roof');
  T.prism('cdKuraWhite', 'y', [[K.x0 - 0.1, K.top], [(K.x0 + K.x1) / 2, K.top + 2.3], [K.x1 + 0.1, K.top]], K.y0 - 0.25, K.y0 - 0.2);
  T.disc('cdKuraBlack', (K.x0 + K.x1) / 2, K.y0 - 0.26, 0.4, 7.0, 7.0 + 0.05, 16, true);
}

function boiler(T) {
  const B = BOILER;
  const holes = [[124.6, 127.2, 0, 2.5]];
  const win = [[78, 80.4, 1.4, 2.4]];
  T.wall('cdTin', 'x', B.y0, B.x0, B.x1, 0, B.top, 0.12, win, { name: 'boiler wall' });
  T.wall('cdTin', 'x', B.y1, B.x0, B.x1, 0, B.top, 0.12, [], { name: 'boiler wall' });
  T.wall('cdTin', 'y', B.x0, B.y0, B.y1, 0, B.top, 0.12, holes, { name: 'boiler wall' });
  T.wall('cdTin', 'y', B.x1, B.y0, B.y1, 0, B.top, 0.12, [], { name: 'boiler wall' });
  /* Rust streaks down the tin. */
  for (let px = B.x0 + 0.6; px < B.x1; px += 1.3) {
    T.paint('cdTinRust', px, B.y0 - 0.075, 0.6 + (px % 1) * 1.2, px + 0.28, B.y0 - 0.065, B.top - 0.2, true);
  }
  /* A single pitched roof falling north. */
  T.slope('cdTinRust', 'x', B.y0 - 0.6, B.top + 0.75, B.y1 + 0.6, B.top - 0.1, B.x0 - 0.5, B.x1 + 0.5, 0.15, 'boiler roof');
  /* The boiler inside, and its flue out to the chimney. */
  T.box('cdRustDark', 80, 126, 0, 84.4, 130.4, 2.1, { name: 'boiler' });
  T.cyl('cdRustDark', [82.2, 130.4, 1.8], [82.2, CHIMNEY.py - CHIMNEY.radius + 0.2, 1.8], 0.32, 8);
  T.cap('cdRustDark', [82.2, 130.4, 1.8], [82.2, CHIMNEY.py - CHIMNEY.radius + 0.2, 1.8], 0.32, { draw: false, name: 'flue' });
}

function shelter(T) {
  const S = SHELTER;
  /* Back wall to the east, ends half height, a tin roof falling west. */
  T.wall('cdBusStop', 'y', S.x1, S.y0, S.y1, 0, 2.3, 0.1, [], { name: 'shelter' });
  T.wall('cdBusStop', 'x', S.y0, S.x0 + 0.6, S.x1, 0, 2.3, 0.1, [], { name: 'shelter' });
  T.wall('cdBusStop', 'x', S.y1, S.x0 + 0.6, S.x1, 0, 2.3, 0.1, [], { name: 'shelter' });
  T.slope('cdTinRust', 'y', S.x0 - 0.4, 2.45, S.x1 + 0.15, 2.75, S.y0 - 0.2, S.y1 + 0.2, 0.08, 'shelter roof');
  T.post('cdTimberDark', S.x0, S.y0 + 0.1, 0, 2.5, 0.06, { name: 'shelter post' });
  T.post('cdTimberDark', S.x0, S.y1 - 0.1, 0, 2.5, 0.06, { name: 'shelter post' });
  T.box('cdTimberSilver', S.x1 - 0.55, S.y0 + 0.3, 0, S.x1 - 0.1, S.y1 - 0.3, 0.45, { name: 'bench' });
  T.paint('cdConcrete', S.x0 - 0.3, S.y0 - 0.2, 0, S.x1 + 0.2, S.y1 + 0.2, 0.06);
  /* The stop's sign, a round plate on a pole. */
  T.post('cdTin', 92.2, 15.4, 0, 2.3, 0.04, { name: 'bus stop sign' });
  T.cyl('cdSignRed', [92.2, 15.36, 2.35], [92.2, 15.44, 2.35], 0.3, 16);
  T.cyl('cdPaper', [92.2, 15.33, 2.35], [92.2, 15.47, 2.35], 0.23, 16, null, true);
  T.deco('cdTin', 92.0, 15.38, 1.2, 92.4, 15.42, 1.9, true);
}

function roadAndCarpark(T) {
  const Rd = ROAD;
  const C = CARPARK;
  /* The road up, its edge lines, its cracks mended in black. */
  T.paint('cdAsphalt', Rd.x0, 0, 0, Rd.x1, Rd.y1, 0.03);
  T.paint('cdLine', Rd.x0 + 0.2, 0, 0.03, Rd.x0 + 0.32, Rd.y1 - 2, 0.035);
  T.paint('cdLine', Rd.x1 - 0.32, 0, 0.03, Rd.x1 - 0.2, Rd.y1 - 2, 0.035);
  const R = rng(0x40ad);
  for (let i = 0; i < 9; i += 1) {
    const y = R.range(3, Rd.y1 - 3);
    const x = R.range(Rd.x0 + 0.6, Rd.x1 - 1.6);
    T.paint('cdToriiBlack', x, y, 0.03, x + R.range(0.5, 1.4), y + 0.06, 0.034, true);
  }
  /* The guard rail on the road's west side, steel on posts. */
  for (let py = 2; py <= 30; py += 2) {
    T.post('cdTin', Rd.x0 - 0.5, py, 0, 0.8, 0.05, { name: 'rail post' });
  }
  T.box('cdTin', Rd.x0 - 0.62, 2, 0.48, Rd.x0 - 0.5, 30, 0.82, { name: 'guard rail' });
  /* The curve mirror at the car park's mouth, orange on its pole. */
  T.post('cdVermilionFade', 92.4, 36.6, 0, 2.9, 0.045, { name: 'mirror pole' });
  T.cyl('cdVermilionFade', [92.2, 36.45, 3.2], [92.0, 36.32, 3.2], 0.42, 14);
  T.cyl('cdGlass', [92.0, 36.32, 3.2], [91.96, 36.3, 3.2], 0.37, 14, null, true);
  /* The car park's gravel, an L round the stand of cedars left in its
   * south west corner, its old bays, and the moss coming through. */
  T.paint('cdGravel', C.x0, C.island, 0, C.x1, C.y1, 0.02);
  T.paint('cdGravel', C.east, C.y0, 0, C.x1, C.island, 0.02);
  /* The island's kerb, low concrete, so the stand reads as kept. */
  T.box('cdConcrete', C.x0 + 1, C.island - 0.9, 0, C.east - 1, C.island - 0.6, 0.18, { name: 'kerb' });
  T.box('cdConcrete', C.east - 1.3, C.y0 + 1, 0, C.east - 1, C.island - 0.6, 0.18, { name: 'kerb' });
  /* Wheel stops along the bays, a row of short concrete bars. */
  for (let px = 56.3; px <= 92; px += 2.6) {
    T.box('cdConcrete', px + 0.45, 82.0, 0, px + 1.85, 82.25, 0.12, { name: 'wheel stop', fine: true });
  }
  for (let px = 56; px <= 92; px += 2.6) {
    T.paint('cdLine', px, 76.5, 0.02, px + 0.1, 81.5, 0.026, true);
  }
  for (let i = 0; i < 26; i += 1) {
    const x = R.range(C.x0 + 1, C.x1 - 4);
    const y = R.range(C.island + 1, C.y1 - 3);
    T.paint(i % 3 === 0 ? 'cdMossDeep' : 'cdMoss', x, y, 0.02, x + R.range(0.8, 3.4), y + R.range(0.6, 2.4), 0.03, true);
  }
  /* The path from the car park's west side to the approach. */
  T.paint('cdPaving', 28.5, 40.5, 0, C.east, 44.5, 0.025);
  /* The sign at the car park's mouth: two posts, a board, the hot spring
   * mark and a column of strokes. */
  T.post('cdTimberDark', 95.6, 40.4, 0, 3.4, 0.07, { name: 'sign post' });
  T.post('cdTimberDark', 97.8, 40.4, 0, 3.4, 0.07, { name: 'sign post' });
  T.box('cdTimberSilver', 95.4, 40.3, 1.6, 98.0, 40.5, 3.3, { name: 'sign' });
  onsenMark(T, 96.2, 40.29, 2.75, 0.32, 'x', -1);
  brushColumn(T, 97.3, 40.28, 3.15, 1.3, 'x');
}

function pipe(T) {
  const P = PIPE;
  const r = P.r;
  /* The hot water main: from the spring's hut down the stream bank, then
   * south to the boiler house, on trestles every four metres. */
  const runs = [
    { a: [P.x, P.y1, P.h], b: [P.x1, P.y1, P.h] },
    { a: [P.x, P.y0, P.h], b: [P.x, P.y1, P.h] },
  ];
  for (const { a, b } of runs) {
    T.cap('cdRust', a, b, r, { name: 'pipe', kind: 'pole', seg: 8 });
    const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    const n = Math.floor(len / 4);
    for (let i = 0; i <= n; i += 1) {
      const f = i / n;
      const px = a[0] + (b[0] - a[0]) * f;
      const py = a[1] + (b[1] - a[1]) * f;
      T.post('cdRustDark', px, py, 0, P.h - r, 0.05, { name: 'trestle' });
      if (i % 3 === 1) {
        T.cyl('cdRustDark', [px - 0.3, py - 0.3, P.h - r - 0.05], [px + 0.3, py + 0.3, P.h - r - 0.05], 0.03, 4, null, true);
      }
    }
  }
  T.ball('cdRust', P.x, P.y1, P.h, r * 1.3);
  /* The spring's concrete hut at the pipe's head, by the stream. */
  T.box('cdConcrete', P.x1, 161.5, 0, P.x1 + 4.2, 166.5, 2.6, { name: 'spring hut' });
  T.slope('cdTinRust', 'y', P.x1 - 0.3, 2.95, P.x1 + 4.5, 2.6, 161.2, 166.8, 0.1, 'hut roof');
  T.deco('cdRustDark', P.x1 - 0.08, 163.2, 0, P.x1, 164.8, 1.9);
}

/* -------------------------------------------------------------------- */
/* The whole                                                             */
/* -------------------------------------------------------------------- */

/* The steam off the open bath, a few round puffs over the water, the way
 * a manga panel letters heat: drawn only, never in the way. */
function steam(T) {
  const R = ROTEN;
  const puffs = [[-1.6, 0.8, 1.3, 1.0], [1.2, -0.6, 1.6, 1.2], [0.2, 1.9, 2.4, 0.8], [-0.6, -1.8, 2.1, 0.9], [2.4, 1.5, 2.8, 0.6]];
  for (const [dx, dy, h, r] of puffs) {
    T.ball('cdSteam', R.px + dx, R.py + dy, h, r, true);
  }
}

export function buildInn(T) {
  mainBuilding(T);
  watari(T);
  bathhouse(T);
  roten(T);
  steam(T);
  kura(T);
  boiler(T);
  shelter(T);
  roadAndCarpark(T);
  pipe(T);
  /* What the forest keeps out of. */
  T.clearing(CARPARK.x0, CARPARK.island, CARPARK.x1, CARPARK.y1, 1);
  T.clearing(CARPARK.east, CARPARK.y0, CARPARK.x1, CARPARK.island, 1);
  T.clearing(28.5, 40.5, CARPARK.east, 44.5, 1.2);
  T.clearing(ROAD.x0, 0, ROAD.x1, ROAD.y1, 1.5);
  T.clearing(MAIN.x0 - 2, 86, MAIN.x1 + 3, MAIN.y1 + 2, 1);
  T.clearing(BATH.x0 - 2, MAIN.y1, ROTEN.x1, ROTEN.y1, 1.5);
  T.clearing(KURA.x0, KURA.y0, KURA.x1, KURA.y1, 3);
  T.clearing(BOILER.x0, BOILER.y0, BOILER.x1, CHIMNEY.py + CHIMNEY.radius, 2);
  T.clearing(SHELTER.x0 - 1, 13, SHELTER.x1, SHELTER.y1, 1.5);
  T.clearing(PIPE.x - 1, PIPE.y0, PIPE.x + 1, PIPE.y1, 0.5);
  T.clearing(PIPE.x, PIPE.y1 - 1.2, PIPE.x1 + 4.5, PIPE.y1 + 1.2, 0.5);
  T.clearing(PIPE.x1 - 0.5, 161, PIPE.x1 + 4.8, 167, 1);
  T.clearing(60, 88, 96, 96, 0);
}
