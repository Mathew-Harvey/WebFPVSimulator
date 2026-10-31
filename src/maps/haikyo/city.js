/*
 * city.js: the city round the estate. The four streets, their walks and
 * their paint; the railway viaduct down the east side with the shops
 * under its arches; the signs the partners hang on it, on the hoarding and
 * on three boards of their own. The town's buildings, poles, lamps,
 * machines, cars and trees that line the streets are document elements
 * (./yard.js), drawn by the kit in the town's own look.
 *
 * THE VIADUCT is the reinforced concrete frame a city railway is carried
 * on through the middle of a Japanese city: a pair of columns every 13 m
 * with a beam across them, the deck 8.6 m up, two tracks on ballast and an
 * overhead line on portal frames. Under it, between the columns, some bays
 * are shops and lock ups behind shutters and the rest are open, parking
 * and air. Between the columns of a pair is 8.4 m and under the beam is
 * 6.6 m, so every open bay is a window, and the portals over the tracks
 * are a slalom on the deck.
 *
 * REAL SIZES (metres): a two lane street 8 wide with 4 m walks, a back lane
 * 6, walks 0.12 over the road at the kerb; a viaduct's deck 12 wide for two
 * tracks at 4.2 m centres, standard gauge rails 1.435 apart.
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

import { rng, W, D } from './frame.js';

/* The streets: road bands along px (y0..y1) and along py (x0..x1). */
export const SOUTH = { y0: 20, y1: 28 };
export const NORTH = { y0: 126, y1: 132 };
export const WEST = { x0: 30, x1: 37 };
export const EAST = { x0: 154, x1: 161 };
/* The walks along px and along py, and the py spans the latter keep to,
 * so no two pieces of paving lie on one another. */
const WALKS_X = [[16, 20], [28, 32.8], [124.2, 126], [132, 135]];
const WALKS_Y = [[25, 30], [37, 41.9], [152.1, 154], [161, 162.4]];
const SPANS_Y = [[0, 16], [32.8, 124.2], [135, D]];
const SPANS_X = [[0, WEST.x0], [WEST.x1, EAST.x0], [EAST.x1, W]];

export const VIADUCT = {
  x0: 163, x1: 175, deck: 8.6, girder: 1.0, parapet: 1.2,
  colA: 164.2, colB: 173.8, col: 1.2, beam: 6.6, pitch: 13, first: 6.5,
  tracks: [166.4, 171.6], gauge: 1.435,
  portals: [10, 49, 88, 127, 166],
};
/* The bays under it that are shops (by the span's index from the south). */
const UNDER = [0, 2, 4, 5, 7, 10];

/* The boards on legs, each { px, py, face }, the face the way it looks. */
export const BOARD = { w: 6.4, h: 3.0, t: 0.3, lift: 4.2 };
export const LEG_BOARDS = [
  { px: 142, py: 112, face: 'w' },
  { px: 47.5, py: 118.5, face: 's' },
  { px: 47, py: 44, face: 'e' },
];
/* The ads on the viaduct's side, facing the estate, and on the hoarding,
 * facing the street. */
export const VIADUCT_ADS = [45, 92, 140];
export const HOARDING_ADS = [60, 132];

export function city(T) {
  const r = rng(0xc17e00);

  /* THE ROADS AND THE WALKS. */
  T.wide(() => {
    for (const [y0, y1] of [[SOUTH.y0, SOUTH.y1], [NORTH.y0, NORTH.y1]]) {
      T.paint('asphalt', 0, y0, 0, W, y1, 0.02);
    }
    for (const [x0, x1] of [[WEST.x0, WEST.x1], [EAST.x0, EAST.x1]]) {
      for (const [y0, y1] of [[0, SOUTH.y0], [SOUTH.y1, NORTH.y0], [NORTH.y1, D]]) {
        T.paint('asphalt', x0, y0, 0, x1, y1, 0.02);
      }
    }
  });
  for (const [y0, y1] of WALKS_X) {
    for (const [x0, x1] of SPANS_X) {
      T.box('hkWalk', x0, y0, 0, x1, y1, 0.12, { name: 'walk', cast: false });
    }
  }
  for (const [x0, x1] of WALKS_Y) {
    for (const [y0, y1] of SPANS_Y) {
      T.box('hkWalk', x0, y0, 0, x1, y1, 0.12, { name: 'walk', cast: false });
    }
  }
  /* The paint: the south street's centre line and edges, the crossing at
   * the gate, the back lane's edge lines and its green school route, the
   * stop line and the word at the lane's ends. */
  T.wide(() => T.dress(() => {
    for (let x = 1; x < W; x += 8) {
      if (x > 93 && x < 103) {
        continue;
      }
      T.paint('lineWhite', x, 23.9, 0.02, x + 4.5, 24.1, 0.03);
    }
    for (const y of [20.35, 27.65]) {
      for (const [x0, x1] of SPANS_X) {
        T.paint('lineWhite', x0 + 1, y - 0.08, 0.02, x1 - 1, y + 0.08, 0.03);
      }
    }
    for (let y = SOUTH.y0 + 0.6; y < SOUTH.y1 - 0.4; y += 0.9) {
      T.paint('lineWhite', 95, y, 0.02, 101, y + 0.45, 0.03);
    }
    for (const y of [NORTH.y0 + 0.3, NORTH.y1 - 0.3]) {
      T.paint('lineWhite', WEST.x1 + 0.5, y - 0.07, 0.02, EAST.x0 - 0.5, y + 0.07, 0.03);
    }
    T.paint('hkGreenWalk', WEST.x1 + 0.5, NORTH.y0 + 0.4, 0.02, EAST.x0 - 0.5, NORTH.y0 + 1.1, 0.025);
    for (const x of [WEST.x1 + 1.2, EAST.x0 - 1.2]) {
      T.paint('lineWhite', x - 0.2, NORTH.y0 + 0.3, 0.02, x + 0.2, NORTH.y1 - 0.3, 0.03);
    }
    for (const [x0, x1] of [[WEST.x0, WEST.x1], [EAST.x0, EAST.x1]]) {
      for (let y = 1; y < D; y += 8) {
        if ((y > SOUTH.y0 - 4 && y < SOUTH.y1 + 1) || (y > NORTH.y0 - 4 && y < NORTH.y1 + 1)) {
          continue;
        }
        T.paint('lineWhite', (x0 + x1) / 2 - 0.08, y, 0.02, (x0 + x1) / 2 + 0.08, y + 4, 0.03);
      }
    }
    /* Kerb stones on the walks' road edges. */
    for (const [y0, y1] of WALKS_X) {
      for (const [x0, x1] of SPANS_X) {
        for (const y of [y0, y1]) {
          T.paint('hkKerb', x0, y - 0.1, 0.12, x1, y + 0.1, 0.14);
        }
      }
    }
    /* Patches in the road where it was dug up and filled. */
    for (let n = 0; n < 14; n += 1) {
      const x = r.range(2, W - 6);
      const y = r.range(SOUTH.y0 + 0.5, SOUTH.y1 - 2.5);
      T.paint('concreteDark', x, y, 0.02, x + r.range(1.2, 4), y + r.range(0.8, 2), 0.026);
    }
    /* Manholes. */
    for (const x of [18, 58, 118, 146, 196]) {
      T.disc('metalDark', x, 22.2, 0.32, 0.02, 0.032, 12);
    }
  }));
  T.sign('stopWord', WEST.x1 + 2.6, (NORTH.y0 + NORTH.y1) / 2, 0.035, 2.4, 1.6, 'up', 0.0);
  T.sign('stopWord', EAST.x0 - 2.6, (NORTH.y0 + NORTH.y1) / 2, 0.035, 2.4, 1.6, 'up', 0.0);

  viaduct(T, r);
  boards(T);
}

/* THE VIADUCT: its column pairs and beams, its deck and girders, its
 * parapets, the ballast, the rails and their sleepers, the overhead
 * line's portals and wires, and the shops under it. */
function viaduct(T, r) {
  const V = VIADUCT;
  const top = V.deck;
  const under = top - V.girder;
  for (let y = V.first, j = 0; y < D; y += V.pitch, j += 1) {
    for (const x of [V.colA, V.colB]) {
      T.box('hkViaduct', x - V.col / 2, y - V.col / 2, 0, x + V.col / 2, y + V.col / 2, under, { name: 'viaduct column' });
    }
    T.box('hkViaduct', V.x0 + 0.4, y - 0.6, V.beam, V.x1 - 0.4, y + 0.6, under, { name: 'viaduct beam' });
    T.sign('pierNo', V.colA - V.col / 2 - 0.01, y, 2.2, 0.5, 0.7, 'w', 0.0);
    void j;
  }
  T.box('hkViaduct', V.x0, 0, under, V.x1, D, top, { name: 'viaduct deck' });
  T.box('hkViaduct', V.x0, 0, top, V.x0 + 0.25, D, top + V.parapet, { name: 'viaduct parapet' });
  T.box('hkViaduct', V.x1 - 0.25, 0, top, V.x1, D, top + V.parapet, { name: 'viaduct parapet' });
  T.wide(() => T.dress(() => {
    T.paint('hkStreak', V.x0 - 0.02, 0, under + 0.05, V.x0, D, under + 0.3);
    T.paint('hkBand', V.x0 - 0.02, 0, top + V.parapet - 0.1, V.x0, D, top + V.parapet);
    T.paint('hkBand', V.x1, 0, top + V.parapet - 0.1, V.x1 + 0.02, D, top + V.parapet);
  }));
  /* The track bed and the rails, the length of the plot. */
  for (const c of V.tracks) {
    T.box('hkBallast', c - 1.6, 0, top, c + 1.6, D, top + 0.3, { name: 'ballast', cast: false });
    T.wide(() => T.dress(() => {
      for (const s of [-1, 1]) {
        const x = c + (s * V.gauge) / 2;
        T.deco('hkRail', x - 0.035, 0, top + 0.42, x + 0.035, D, top + 0.56);
      }
    }));
    T.dress(() => {
      for (let y = 0.3; y < D; y += 0.6) {
        T.deco('hkSleeper', c - 1.2, y - 0.12, top + 0.3, c + 1.2, y + 0.12, top + 0.42);
      }
    });
  }
  /* The overhead line: portals across both tracks, and on each track a
   * messenger and a contact wire hung from portal to portal. */
  const mastH = 7.0;
  for (const y of V.portals) {
    for (const x of [V.x0 + 0.6, V.x1 - 0.6]) {
      T.post('stPole', x, y, top, top + mastH, 0.16, { name: 'catenary mast' });
    }
    T.box('metal', V.x0 + 0.4, y - 0.12, top + mastH - 0.5, V.x1 - 0.4, y + 0.12, top + mastH - 0.2, { name: 'portal beam' });
    T.dress(() => {
      for (const c of V.tracks) {
        T.cyl('metal', [c, y, top + mastH - 0.5], [c, y, top + 5.2], 0.02, 3);
        T.ball('insulatorWhite', c, y, top + mastH - 0.7, 0.08);
      }
    });
  }
  for (let p = 0; p + 1 < V.portals.length; p += 1) {
    for (const c of V.tracks) {
      T.wire('rope', [c, V.portals[p], top + 6.3], [c, V.portals[p + 1], top + 6.3], 0.5, 0.012);
      T.wire('rope', [c, V.portals[p], top + 5.2], [c, V.portals[p + 1], top + 5.2], 0.05, 0.01);
    }
  }
  /* THE SHOPS UNDER IT: a box of block a bay long, a shutter to the street
   * and a sign over it; the rest of the bays are open. */
  const shops = ['underA', 'underB', 'underC', 'underD', 'underE', 'underF'];
  UNDER.forEach((j, n) => {
    const y0 = V.first + j * V.pitch + V.col / 2;
    const y1 = y0 + V.pitch - V.col;
    T.box('block', V.colA - 0.4, y0, 0, V.colB + 0.4, y1, 4.2, { name: 'under shop' });
    T.box('concreteDark', V.colA - 0.5, y0, 4.2, V.colB + 0.5, y1, 4.4, { name: 'under shop' });
    T.wide(() => T.dress(() => {
      const ym = (y0 + y1) / 2;
      T.paint(n % 2 ? 'shutter' : 'shutterLight', V.colA - 0.43, ym - 3.2, 0.02, V.colA - 0.4, ym + 3.2, 3.1);
      for (let h = 0.3; h < 3.1; h += 0.3) {
        T.paint('shutter', V.colA - 0.44, ym - 3.2, h, V.colA - 0.43, ym + 3.2, h + 0.04);
      }
      T.deco('bldShutterBox', V.colA - 0.75, ym - 3.3, 3.1, V.colA - 0.4, ym + 3.3, 3.5);
    }));
    T.sign(shops[n % shops.length], V.colA - 0.42, (y0 + y1) / 2, 3.8, 4.6, 0.6, 'w');
  });
  /* In the open bays: a bicycle rack and the pay parking's machine. */
  T.dress(() => {
    for (const j of [3, 6, 8]) {
      const y = V.first + j * V.pitch + V.pitch / 2;
      T.deco('hkFridge', V.colA + 0.8, y - 0.3, 0, V.colA + 1.3, y + 0.3, 1.4);
      T.deco('hkInk', V.colA + 0.78, y - 0.2, 0.9, V.colA + 0.8, y + 0.2, 1.2);
      for (let k = 0; k < 4; k += 1) {
        T.deco('metal', V.colA + 3 + k * 1.2, y - 2.4, 0.05, V.colA + 3.1 + k * 1.2, y + 2.4, 0.1);
      }
    }
    void r;
  });
}

/* THE PARTNERS' BOARDS: three on legs high enough to fly under, three
 * panels on the viaduct's side and two on the hoarding. Each panel's face
 * is where ./plan.js hangs a sign. */
function boards(T) {
  for (const b of LEG_BOARDS) {
    const alongX = b.face === 's' || b.face === 'n';
    const hw = BOARD.w / 2;
    const ht = BOARD.t / 2;
    const [x0, x1, y0, y1] = alongX ? [b.px - hw, b.px + hw, b.py - ht, b.py + ht] : [b.px - ht, b.px + ht, b.py - hw, b.py + hw];
    const top = BOARD.lift + BOARD.h;
    T.box('billboardSteel', x0, y0, BOARD.lift, x1, y1, top, { name: 'billboard' });
    T.deco('billboardSteelDark', x0 - 0.08, y0 - 0.08, top - 0.12, x1 + 0.08, y1 + 0.08, top + 0.05);
    for (const s of [-1, 1]) {
      const [px, py] = alongX ? [b.px + s * (hw - 1.2), b.py] : [b.px, b.py + s * (hw - 1.2)];
      T.post('billboardSteelDark', px, py, 0, BOARD.lift, 0.16, { name: 'billboard leg' });
    }
  }
  for (const y of VIADUCT_ADS) {
    T.box('billboardSteel', VIADUCT.x0 - 0.25, y - 3.4, VIADUCT.deck - 0.6, VIADUCT.x0, y + 3.4, VIADUCT.deck + 2.4, { name: 'viaduct ad' });
  }
}
