/*
 * plaza.js: the plaza the pilot starts on, between the four towers, and
 * the park and shrine at the district's south west corner.
 *
 * THE PLAZA is the open superblock every tower district keeps at its
 * middle: stone paving on a grid, a sunken fountain, a red ring of a
 * sculpture big enough to fly through (public art on that scale stands in
 * front of half the towers in Japan), a glass canopy on columns at its
 * east side, the stair down to the subway, benches, bollards, ginkgo. The
 * pads are at its south end facing north: the hall straight ahead, its
 * twin crowns 243 m up, the deck rising to its terrace, the first line.
 *
 * THE PARK, after the green and the old shrine at the edge of the real
 * district (Shinjuku Central Park holds Kumano Shrine), is a pond, a
 * vermilion torii, a small hall and cherry trees, the town's own.
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

import { block, ginkgo } from './streets.js';
import { rng } from './frame.js';
import { sincos } from '../../props/trig.js';

const SC = { s: 0, c: 1 };

const P = block(1, 1);
export const PADS = { px: (P.x0 + P.x1) / 2, py: P.y0 + 12, yaw: Math.PI / 2 };
export const FOUNTAIN = { px: (P.x0 + P.x1) / 2, py: P.y0 + 52, r: 9 };
export const RING = { px: P.x0 + 24, py: P.y0 + 58, h: 4.6, R: 3.6, t: 0.45 };
export const CANOPY = { x0: P.x1 - 22, x1: P.x1 - 6, y0: P.y0 + 24, y1: P.y1 - 18, h: 5.4 };
export const SUBWAY = { x0: P.x0 + 8, x1: P.x0 + 20, y0: P.y1 - 20, y1: P.y1 - 8 };

const PAVE_H = 0.035;

function plazaGround(T) {
  T.paint('twPave', P.x0, P.y0, 0, P.x1, P.y1, PAVE_H);
  T.dress(() => T.wide(() => {
    /* The paving's grid, a joint every 4 m, and a darker band every 16. */
    for (let x = P.x0 + 4; x < P.x1; x += 4) {
      const m = (x - P.x0) % 16 === 0 ? 'twPaveDark' : 'twCurb';
      T.paint(m, x - 0.05, P.y0, PAVE_H, x + 0.05, P.y1, PAVE_H + 0.006);
    }
    for (let y = P.y0 + 4; y < P.y1; y += 4) {
      const m = (y - P.y0) % 16 === 0 ? 'twPaveDark' : 'twCurb';
      T.paint(m, P.x0, y - 0.05, PAVE_H, P.x1, y + 0.05, PAVE_H + 0.006);
    }
  }));
}

function fountain(T) {
  const { px, py, r } = FOUNTAIN;
  /* A sunken bowl: the rim is solid to sit on, the water a step down. */
  T.disc('twStone', px, py, r + 0.8, 0, 0.55, 40);
  T.disc('twWaterDeep', px, py, r, 0.05, 0.56, 40);
  T.disc('twWater', px, py, r - 1.2, 0.05, 0.57, 40);
  T.box('twStone', px - r - 0.8, py - 0.6, 0, px + r + 0.8, py + 0.6, 0.3, { solid: false });
  /* The jets: white columns of water, never solid. */
  T.dress(() => T.wide(() => {
    for (const [dx, dy, h] of [[0, 0, 6.5], [-3, 0, 3.2], [3, 0, 3.2], [0, -3, 3.2], [0, 3, 3.2]]) {
      T.cyl('white', [px + dx, py + dy, 0.5], [px + dx, py + dy, h], 0.14, 6, 0.05, true);
    }
  }));
  T.hidden(px - r - 0.8, py - r - 0.8, 0, px + r + 0.8, py + r + 0.8, 0.55, 'wall', 'fountain bowl');
}

/* The red ring: a torus on edge, its axis east to west, on a black plinth,
 * solid as twelve short capsules round it. */
function ring(T) {
  const { px, py, h, R, t } = RING;
  T.torus('twSculpt', px, py, h, R, t, 1, 0, 10, 40);
  const n = 12;
  for (let i = 0; i < n; i += 1) {
    sincos((i / n) * 2 * Math.PI, SC);
    const [c0, s0] = [SC.c, SC.s];
    sincos(((i + 1) / n) * 2 * Math.PI, SC);
    T.cap('twSculpt', [px, py + R * c0, h + R * s0], [px, py + R * SC.c, h + R * SC.s], t, { draw: false, name: 'red ring' });
  }
  T.box('twBlack', px - 0.9, py - 1.2, 0, px + 0.9, py + 1.2, h - R + t * 0.3, { name: 'ring plinth' });
}

function canopy(T) {
  const C = CANOPY;
  T.box('twGlassRoof', C.x0, C.y0, C.h, C.x1, C.y1, C.h + 0.35, { name: 'canopy' });
  T.box('metal', C.x0 - 0.2, C.y0 - 0.2, C.h + 0.35, C.x1 + 0.2, C.y1 + 0.2, C.h + 0.6, { name: 'canopy edge' });
  for (let y = C.y0 + 2; y < C.y1; y += 8) {
    for (const x of [C.x0 + 2, C.x1 - 2]) {
      T.post('metal', x, y, 0, C.h, 0.2, { name: 'canopy column' });
    }
  }
  T.dress(() => T.wide(() => {
    for (let y = C.y0 + 1; y < C.y1; y += 2.5) {
      T.paint('twGirder', C.x0, y, C.h - 0.05, C.x1, y + 0.12, C.h);
    }
  }));
}

/* The subway entrance: a sloped glass hood over a stair going down. */
function subway(T) {
  const S = SUBWAY;
  T.box('twStone', S.x0, S.y0, 0, S.x1, S.y0 + 0.4, 1.1, { name: 'subway wall' });
  T.box('twStone', S.x0, S.y0, 0, S.x0 + 0.4, S.y1, 1.1, { name: 'subway wall' });
  T.box('twStone', S.x1 - 0.4, S.y0, 0, S.x1, S.y1, 1.1, { name: 'subway wall' });
  T.box('twRoadDark', S.x0 + 0.4, S.y0 + 0.4, 0, S.x1 - 0.4, S.y1, 0.04, { solid: false });
  T.prism('twGlassRoof', 'y', [[S.x0, 3.6], [S.x1, 3.6], [S.x1, 3.3], [S.x0, 3.3]], S.y0 + 0.4, S.y1);
  T.box('twGlassRoof', S.x0, S.y0 + 0.4, 3.3, S.x1, S.y1, 3.6, { draw: false, name: 'subway hood' });
  for (const [x, y] of [[S.x0 + 0.2, S.y1 - 0.2], [S.x1 - 0.2, S.y1 - 0.2], [S.x0 + 0.2, S.y0 + 0.6], [S.x1 - 0.2, S.y0 + 0.6]]) {
    T.post('metal', x, y, 1.1, 3.3, 0.08, { name: 'hood post' });
  }
  T.plate('stationSign', 0, (S.x0 + S.x1) / 2, S.y0 - 0.03, 2.4, 3.6, 0.9, 's');
}

function furniture(T) {
  const r = rng(907);
  /* Ginkgo round the plaza's edge. */
  for (let x = P.x0 + 6; x < P.x1 - 3; x += 10) {
    if (Math.abs(x - (P.x0 + P.x1) / 2) < 14) {
      continue;
    }
    ginkgo(T, x, P.y1 - 4, 0.95, Math.round(x * 3));
    if (x < CANOPY.x0 - 3) {
      ginkgo(T, x, P.y0 + 30, 0.9, Math.round(x * 5));
    }
  }
  /* Benches round the fountain, and bollards along the plaza's south edge. */
  T.dress(() => {
    for (let k = 0; k < 8; k += 1) {
      sincos((k / 8) * 2 * Math.PI + 0.2, SC);
      const bx = FOUNTAIN.px + (FOUNTAIN.r + 4) * SC.c;
      const by = FOUNTAIN.py + (FOUNTAIN.r + 4) * SC.s;
      T.box('twWood', bx - 0.9, by - 0.25, 0.42, bx + 0.9, by + 0.25, 0.5);
      T.box('metalDark', bx - 0.8, by - 0.2, 0, bx - 0.7, by + 0.2, 0.42);
      T.box('metalDark', bx + 0.7, by - 0.2, 0, bx + 0.8, by + 0.2, 0.42);
    }
    for (let x = P.x0 + 2; x < P.x1; x += 3) {
      T.cyl('metal', [x, P.y0 + 0.6, 0], [x, P.y0 + 0.6, 0.8], 0.09, 6);
    }
    /* People's things: a couple of bicycles by the canopy, a stack of
     * flyers' boards. */
    for (let k = 0; k < 5; k += 1) {
      const by = CANOPY.y0 + 4 + k * 1.1;
      const bx = CANOPY.x0 - 2;
      T.cyl('metalDark', [bx - 0.8, by, 0.35], [bx + 0.8, by, 0.35], 0.03, 4);
      T.torus('rope', bx - 0.6, by, 0.35, 0.33, 0.035, 0, 1, 4, 12);
      T.torus('rope', bx + 0.6, by, 0.35, 0.33, 0.035, 0, 1, 4, 12);
    }
    void r;
  });
}

export function plaza(T) {
  plazaGround(T);
  fountain(T);
  ring(T);
  canopy(T);
  subway(T);
  furniture(T);
}

/* ---- THE PARK AND THE SHRINE ---- */

const K = block(0, 0);
export const POND = { px: K.x0 + 34, py: K.y0 + 22, r: 12 };
export const TORII = { px: K.x0 + 94, py: K.y0 + 8, w: 5.6, h: 6.2 };

export function park(T) {
  T.paint('twGrass', K.x0, K.y0, 0, K.x1, K.y0 + 44, 0.03);
  T.disc('twStone', POND.px, POND.py, POND.r + 0.7, 0, 0.18, 36);
  T.disc('twWater', POND.px, POND.py, POND.r, 0.02, 0.19, 36);
  /* A gravel path from the torii to the hall, across the green. */
  T.paint('twPaveDark', TORII.px - 1.6, K.y0, 0.03, TORII.px + 1.6, K.y0 + 34, 0.045);
  /* The torii: two pillars, the two lintels, vermilion with black caps. */
  const { px, py, w, h } = TORII;
  for (const s of [-1, 1]) {
    T.post('twTorii', px + (s * w) / 2, py, 0, h, 0.32, { name: 'torii pillar' });
    T.cyl('twBlack', [px + (s * w) / 2, py, 0], [px + (s * w) / 2, py, 0.5], 0.4, 10);
  }
  T.box('twTorii', px - w / 2 - 1.2, py - 0.35, h - 0.1, px + w / 2 + 1.2, py + 0.35, h + 0.45, { name: 'kasagi' });
  T.box('twBlack', px - w / 2 - 1.4, py - 0.42, h + 0.45, px + w / 2 + 1.4, py + 0.42, h + 0.75, { name: 'kasagi cap' });
  T.box('twTorii', px - w / 2 - 0.5, py - 0.22, h - 1.4, px + w / 2 + 0.5, py + 0.22, h - 0.95, { name: 'nuki' });
  /* The small hall behind it: a raised floor, a gabled roof. */
  const hx = px;
  const hy = py + 26;
  T.box('twShrineWood', hx - 4, hy - 3, 0, hx + 4, hy + 3, 0.9, { name: 'shrine floor' });
  T.box('wallWhite', hx - 3.4, hy - 2.4, 0.9, hx + 3.4, hy + 2.6, 3.6, { name: 'shrine hall' });
  T.prism('twShrineRoof', 'x', [[hy - 4.2, 3.4], [hy + 4.4, 3.4], [hy + 0.1, 6.0]], hx - 4.8, hx + 4.8);
  T.frustumSolid({ x0: hx - 4.8, y0: hy - 4.2, x1: hx + 4.8, y1: hy + 4.4 }, 3.4, { x0: hx - 4.8, y0: hy - 0.3, x1: hx + 4.8, y1: hy + 0.5 }, 5.6, 3, 'shrine roof');
  T.dress(() => {
    T.cyl('rope', [hx - 2, hy - 2.6, 3.2], [hx + 2, hy - 2.6, 3.2], 0.09, 6);
    for (const s of [-1, 1]) {
      T.box('twStone', hx + s * 6 - 0.4, hy - 6.4, 0, hx + s * 6 + 0.4, hy - 5.6, 1.6);
      T.box('twStone', hx + s * 6 - 0.6, hy - 6.6, 1.6, hx + s * 6 + 0.6, hy - 5.4, 2.0);
    }
  });
}

/* The cherry trees and benches of the park, as document assets: the town's
 * own sakura (src/props/street.js), in ./yard.js. [px, py, size]. */
export const PARK_TREES = [
  [K.x0 + 10, K.y0 + 8, 1.0], [K.x0 + 14, K.y0 + 38, 1.1], [K.x0 + 56, K.y0 + 8, 0.95],
  [K.x0 + 60, K.y0 + 36, 1.05], [K.x0 + 74, K.y0 + 20, 1.0], [K.x0 + 112, K.y0 + 12, 1.1],
  [K.x0 + 116, K.y0 + 36, 0.95], [K.x0 + 128, K.y0 + 24, 1.0], [K.x0 + 22, K.y0 + 22, 0.9],
];
