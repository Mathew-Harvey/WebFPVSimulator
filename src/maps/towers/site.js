/*
 * site.js: the tower going up, at the district's north east corner. A
 * steel frame of thirty floors on a 15 by 14 m column grid, the bottom
 * eighteen with their concrete decks poured and the rest bare beams, a
 * concrete lift core rising through the middle of it, safety mesh on the
 * low floors, and round it the white and blue hoarding a Japanese site
 * always wears, the site office of stacked cabins, steel and rebar laid
 * out, and the cranes (document assets, in ./yard.js).
 *
 * REAL MEASURES: a Japanese office floor in steel is 4.0 to 4.4 m floor
 * to floor (4.2 here); a column grid of 12 to 18 m is the usual long span
 * office bay; a hammerhead crane on a site like this stands 60 to 80 m
 * with a 50 to 70 m jib (the brief's own figure, and the builder's crane
 * asset allows 80 m and 70 m).
 *
 * Every bay of every bare floor is a window to fly; the decked floors
 * each leave one bay open (the hoist shaft), a vertical line from the
 * eighteenth floor to the ground.
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

import { block } from './streets.js';
import { rng } from './frame.js';

const B = block(2, 2);
const XS = [B.x0 + 24, B.x0 + 39, B.x0 + 54, B.x0 + 69, B.x0 + 84];
const YS = [B.y0 + 20, B.y0 + 34, B.y0 + 48, B.y0 + 62, B.y0 + 76];
const STOREY = 4.2;
const FLOORS = 30;
const DECKED = 18;
const COL = 0.45;
const BEAM = 0.3;
const BEAM_D = 0.6;
export const FRAME = {
  x0: XS[0], x1: XS[4], y0: YS[0], y1: YS[4], storey: STOREY, floors: FLOORS, decked: DECKED,
  top: FLOORS * STOREY,
  /* the lift core, in the middle bay */
  core: { x0: XS[1] + 4, x1: XS[2] - 4, y0: YS[2] + 3, y1: YS[3] - 3 },
  /* the open bay every decked floor leaves: the hoist shaft */
  shaft: { x0: XS[2], x1: XS[3], y0: YS[0], y1: YS[1] },
};
export const SITE = B;

function frame(T) {
  const top = FRAME.top;
  /* The columns: the outer ones to the top, the inner ones as far as the
   * frame has got, three floors short. */
  for (const [i, x] of XS.entries()) {
    for (const [j, y] of YS.entries()) {
      const edge = i === 0 || j === 0 || i === 4 || j === 4;
      const h = edge ? top + 1.2 : top - 3 * STOREY;
      T.box('twSteel', x - COL, y - COL, 0, x + COL, y + COL, h, { name: 'column' });
    }
  }
  for (let f = 1; f <= FLOORS; f += 1) {
    const h = f * STOREY;
    const bare = f > DECKED;
    /* Beams on every grid line, east to west and north to south. */
    for (const y of YS) {
      T.box('twSteelDeep', XS[0] - COL, y - BEAM / 2, h - BEAM_D, XS[4] + COL, y + BEAM / 2, h, { name: 'beam' });
    }
    for (const x of XS) {
      T.box('twSteelDeep', x - BEAM / 2, YS[0] - COL, h - BEAM_D, x + BEAM / 2, YS[4] + COL, h, { name: 'beam' });
    }
    if (bare) {
      continue;
    }
    /* The deck, round the hoist shaft. */
    const S = FRAME.shaft;
    const deckParts = [
      [XS[0], YS[0], S.x0, YS[4]], [S.x1, YS[0], XS[4], YS[4]], [S.x0, S.y1, S.x1, YS[4]],
    ];
    for (const [a, b, c, d] of deckParts) {
      T.box('twDeck', a, b, h, c, d, h + 0.25, { name: 'deck' });
    }
  }
  /* The lift core, poured concrete, a floor or two ahead of the steel. */
  const C = FRAME.core;
  T.box('concreteMid', C.x0, C.y0, 0, C.x1, C.y1, top + 2 * STOREY, { name: 'core' });
  T.box('twRoof', C.x0 - 0.3, C.y0 - 0.3, top + 2 * STOREY, C.x1 + 0.3, C.y1 + 0.3, top + 2 * STOREY + 0.5, { name: 'core top' });
  /* The climbing formwork on top of the core: a cage of platforms. */
  T.box('twHoardBlue', C.x0 - 1.2, C.y0 - 1.2, top + 2 * STOREY - 3, C.x1 + 1.2, C.y0, top + 2 * STOREY + 1.5, { name: 'formwork' });
  T.box('twHoardBlue', C.x0 - 1.2, C.y1, top + 2 * STOREY - 3, C.x1 + 1.2, C.y1 + 1.2, top + 2 * STOREY + 1.5, { name: 'formwork' });
  /* The safety mesh on the low floors' faces, green, never solid: flown
   * through, it is mesh. */
  T.dress(() => T.wide(() => {
    for (let f = 0; f < 6; f += 1) {
      const h0 = f * STOREY + 1.0;
      const h1 = (f + 1) * STOREY - 0.7;
      T.box('twMesh', XS[0] - 0.7, YS[0] - 0.75, h0, XS[4] + 0.7, YS[0] - 0.65, h1, { solid: false, cast: false });
      T.box('twMesh', XS[0] - 0.75, YS[0] - 0.7, h0, XS[0] - 0.65, YS[4] + 0.7, h1, { solid: false, cast: false });
    }
    /* The decks' edges, painted, and a yellow stripe on each core face. */
    for (let f = 1; f <= DECKED; f += 1) {
      const h = f * STOREY;
      T.paint('twDeck', XS[0] - 0.05, YS[0] - 0.05, h - 0.02, XS[4] + 0.05, YS[0] + 0.05, h + 0.28);
    }
  }));
}

/* The hoarding: 3 m white panels with a blue band, round the block, with
 * two gates for the lorries. Solid. */
function hoarding(T) {
  const h = 3.0;
  const t = 0.2;
  const gates = [[B.x0 + 30, B.x0 + 44], [B.x1 - 40, B.x1 - 26]];
  const along = (y, x0, x1) => {
    let x = x0;
    const cuts = gates.filter(([a, b]) => b > x0 && a < x1).sort((p, q) => p[0] - q[0]);
    for (const [a, b] of cuts) {
      if (a > x) {
        T.box('twHoard', x, y - t / 2, 0, a, y + t / 2, h, { name: 'hoarding' });
        T.box('twHoardBlue', x, y - t / 2 - 0.01, 0.2, a, y + t / 2 + 0.01, 0.7, { solid: false });
      }
      x = b;
    }
    if (x1 > x) {
      T.box('twHoard', x, y - t / 2, 0, x1, y + t / 2, h, { name: 'hoarding' });
      T.box('twHoardBlue', x, y - t / 2 - 0.01, 0.2, x1, y + t / 2 + 0.01, 0.7, { solid: false });
    }
  };
  along(B.y0 + 2, B.x0 + 2, B.x1 - 2);
  T.box('twHoard', B.x0 + 2 - t / 2, B.y0 + 2, 0, B.x0 + 2 + t / 2, B.y1 - 2, h, { name: 'hoarding' });
  T.box('twHoardBlue', B.x0 + 2 - t / 2 - 0.01, B.y0 + 2, 0.2, B.x0 + 2 + t / 2 + 0.01, B.y1 - 2, 0.7, { solid: false });
  T.box('twHoard', B.x0 + 2, B.y1 - 2 - t / 2, 0, B.x1 - 2, B.y1 - 2 + t / 2, h, { name: 'hoarding' });
  T.box('twHoard', B.x1 - 2 - t / 2, B.y0 + 2, 0, B.x1 - 2 + t / 2, B.y1 - 2, h, { name: 'hoarding' });
  /* The site's ground: dirt, and the lorries' track in from each gate. */
  T.paint('twDirt', B.x0 + 2, B.y0 + 2, 0, B.x1 - 2, B.y1 - 2, 0.03);
  for (const [a, b] of gates) {
    T.paint('twRoadDark', a, B.y0 - 1, 0.03, b, B.y0 + 14, 0.045);
  }
  /* Fence posts and a red cone line at each gate. */
  T.dress(() => {
    for (const [a, b] of gates) {
      for (let x = a + 1; x < b; x += 2) {
        T.cone('mastRed', x, B.y0 + 1.2, 0, 0.18, 0.7, 6);
      }
    }
  });
}

/* The site office, three cabins two high, with a stair; the steel laid
 * out; rebar bundles; a portable toilet or two. */
function yard(T) {
  const ox = B.x0 + 6;
  const oy = B.y1 - 20;
  for (let k = 0; k < 3; k += 1) {
    for (let l = 0; l < 2; l += 1) {
      const x0 = ox + k * 6.2;
      T.box(l ? 'white' : 'twParapet', x0, oy, l * 2.7, x0 + 6, oy + 2.4, l * 2.7 + 2.6, { name: 'site cabin' });
      T.dress(() => T.wide(() => {
        T.paint('glassBlue', x0 + 1, oy - 0.012, l * 2.7 + 1.0, x0 + 2.4, oy - 0.002, l * 2.7 + 2.0);
        T.paint('glassBlue', x0 + 3.4, oy - 0.012, l * 2.7 + 1.0, x0 + 4.8, oy - 0.002, l * 2.7 + 2.0);
      }));
    }
  }
  T.box('metal', ox + 18.8, oy - 1.4, 2.6, ox + 19.8, oy + 2.4, 2.75, { name: 'cabin stair landing' });
  const r = rng(521);
  /* The steel, in stacks of beams, red oxide. */
  for (let k = 0; k < 4; k += 1) {
    const x0 = B.x0 + 8 + k * 4;
    const y0 = B.y0 + 6;
    for (let l = 0; l < 3; l += 1) {
      T.box('twSteelDeep', x0, y0, l * 0.45, x0 + 2.6, y0 + 9 - r.range(0, 2), l * 0.45 + 0.4, { name: 'steel stack' });
    }
  }
  T.dress(() => {
    for (let k = 0; k < 6; k += 1) {
      const x0 = B.x1 - 14 + (k % 3) * 2.2;
      const y0 = B.y0 + 8 + Math.floor(k / 3) * 6;
      for (let l = 0; l < 4; l += 1) {
        T.cyl('rustDeep', [x0 + l * 0.15, y0, 0.1], [x0 + l * 0.15, y0 + 5, 0.1], 0.05, 4);
      }
    }
    for (const x of [B.x0 + 30, B.x0 + 32]) {
      T.box('twHoardBlue', x, B.y1 - 6, 0, x + 1.2, B.y1 - 4.8, 2.4);
    }
  });
}

export function site(T) {
  frame(T);
  hoarding(T);
  yard(T);
}

/* Where ./yard.js stands the two cranes: [px, py, deg, dims]. The tall one
 * by the frame's south west corner, its jib over the frame; the second
 * north east of it, its jib the other way, so the two jibs pass at
 * different heights the way two cranes on one site must. */
export const CRANES = [
  [B.x0 + 12, B.y0 + 12, 30, { height: 80, jib: 60, counterJib: 16, hook: 30, trolley: 0.55 }],
  [B.x1 - 10, B.y1 - 12, 210, { height: 64, jib: 50, counterJib: 14, hook: 24, trolley: 0.4 }],
];
