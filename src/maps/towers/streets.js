/*
 * streets.js: the ground of Kumoi Towers and what stands on it between the
 * blocks: the two boulevards and the two avenues, their pavements, the
 * crossings, the ginkgo rows, the signals and the lamps; the expressway
 * on its piers down the south avenue; the railway viaduct along the south
 * edge with its shops under the arches; and the pedestrian deck from the
 * plaza to the hall.
 *
 * REAL-WORLD MEASURES, from public references and not from any game:
 *   - A Tokyo arterial of four lanes is about 3.25 m a lane (Japan's Road
 *     Structure Ordinance, class 4), so the carriageways here are 16 m,
 *     with 6 m pavements: the Nishi-Shinjuku grid's boulevards are 30 to
 *     40 m between the building lines, and these are 28.
 *   - The Metropolitan Expressway's viaducts carry a deck about 10 m up on
 *     single column piers 30 to 40 m apart; this one is 10.0 m to the deck
 *     on piers 36 m apart.
 *   - A JR viaduct's rail level is about 7 m over the street, which is why
 *     a lorry fits under the girder bridges (the "gado shita" underpasses)
 *     and why a row of bars fits in each arch.
 *   - A ginkgo street tree (icho namiki) is 12 to 20 m tall when grown and
 *     planted about 8 to 10 m apart; these are 9 to 12 m, 9 m apart.
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

import { W, D, rng } from './frame.js';

/* The boulevards (north to south) and avenues (east to west): their middle
 * lines, the carriageway's half width and the pavement's width. */
export const BLVD_A = 150;
export const BLVD_B = 300;
export const AVE_S = 124;
export const AVE_N = 244;
export const ROAD_HALF = 8;
export const WALK = 6;
export const HALF = ROAD_HALF + WALK;

/* The blocks between them, [x0, y0, x1, y1]; the south row stops at the
 * railway's viaduct. */
export const RAIL = { y0: 2, y1: 14, deck: 7.0, rail: 7.6 };
export const XS = [[0, BLVD_A - HALF], [BLVD_A + HALF, BLVD_B - HALF], [BLVD_B + HALF, W]];
export const YS = [[RAIL.y1 + 2, AVE_S - HALF], [AVE_S + HALF, AVE_N - HALF], [AVE_N + HALF, D]];
export const block = (c, r) => ({ x0: XS[c][0], y0: YS[r][0], x1: XS[c][1], y1: YS[r][1] });

/* The expressway's deck: its plan strip, its underside and its top. */
export const EXPRESS = { y0: AVE_S - 7, y1: AVE_S + 7, under: 10.0, top: 11.4, pier: 36 };

/* The pedestrian deck from the plaza to the hall, across the north avenue. */
export const DECK = { x0: 214, x1: 236, y0: AVE_N - HALF - 8, y1: AVE_N + HALF + 2, h: 6.2, t: 0.6 };

const PAINT = 0.015;
const WALK_H = 0.03;

/* Whether a plan x is inside a boulevard's carriageway or a y inside an
 * avenue's, so nothing is planted in a lane. */
const inBlvd = (x, pad = 0) => Math.abs(x - BLVD_A) < HALF + pad || Math.abs(x - BLVD_B) < HALF + pad;

function roads(T) {
  /* Carriageways, the four lanes of each, then the pavements beside them. */
  for (const x of [BLVD_A, BLVD_B]) {
    T.paint('twRoad', x - ROAD_HALF, 0, 0, x + ROAD_HALF, D, PAINT);
    T.paint('twWalk', x - HALF, RAIL.y1, 0, x - ROAD_HALF, D, WALK_H);
    T.paint('twWalk', x + ROAD_HALF, RAIL.y1, 0, x + HALF, D, WALK_H);
  }
  for (const y of [AVE_S, AVE_N]) {
    T.paint('twRoad', 0, y - ROAD_HALF, 0, W, y + ROAD_HALF, PAINT);
    T.paint('twWalk', 0, y - HALF, 0, W, y - ROAD_HALF, WALK_H);
    T.paint('twWalk', 0, y + ROAD_HALF, 0, W, y + HALF, WALK_H);
  }
  T.dress(() => T.wide(() => {
    /* The kerbs: a pale edge along every pavement. */
    for (const x of [BLVD_A, BLVD_B]) {
      for (const s of [-1, 1]) {
        const e = x + s * ROAD_HALF;
        T.paint('twCurb', e - 0.15, RAIL.y1, 0, e + 0.15, D, WALK_H + 0.01);
      }
    }
    for (const y of [AVE_S, AVE_N]) {
      for (const s of [-1, 1]) {
        const e = y + s * ROAD_HALF;
        T.paint('twCurb', 0, e - 0.15, 0, W, e + 0.15, WALK_H + 0.01);
      }
    }
    /* Lane lines: a dashed white line between each pair of lanes and a
     * solid yellow one down the middle, left hand traffic. */
    for (const x of [BLVD_A, BLVD_B]) {
      for (let y = 4; y < D - 4; y += 10) {
        if (Math.abs(y - AVE_S) < HALF + 2 || Math.abs(y - AVE_N) < HALF + 2) {
          continue;
        }
        for (const o of [-4, 4]) {
          T.paint('twLine', x + o - 0.08, y, PAINT, x + o + 0.08, y + 5, PAINT + 0.006);
        }
        T.paint('twLineYellow', x - 0.18, y, PAINT, x - 0.04, y + 10, PAINT + 0.006);
        T.paint('twLineYellow', x + 0.04, y, PAINT, x + 0.18, y + 10, PAINT + 0.006);
      }
    }
    for (const y of [AVE_S, AVE_N]) {
      for (let x = 2; x < W - 4; x += 10) {
        if (inBlvd(x, 2)) {
          continue;
        }
        for (const o of [-4, 4]) {
          T.paint('twLine', x, y + o - 0.08, PAINT, x + 5, y + o + 0.08, PAINT + 0.006);
        }
        T.paint('twLineYellow', x, y - 0.18, PAINT, x + 10, y - 0.04, PAINT + 0.006);
        T.paint('twLineYellow', x, y + 0.04, PAINT, x + 10, y + 0.18, PAINT + 0.006);
      }
    }
    /* The zebra crossings, on every side of every crossroads. */
    for (const x of [BLVD_A, BLVD_B]) {
      for (const y of [AVE_S, AVE_N]) {
        for (const s of [-1, 1]) {
          const cy = y + s * (HALF + 2.5);
          for (let k = -ROAD_HALF + 0.6; k < ROAD_HALF - 0.4; k += 1.2) {
            T.paint('twLine', x + k, cy - 2, PAINT, x + k + 0.6, cy + 2, PAINT + 0.006);
          }
          const cx = x + s * (HALF + 2.5);
          for (let k = -ROAD_HALF + 0.6; k < ROAD_HALF - 0.4; k += 1.2) {
            T.paint('twLine', cx - 2, y + k, PAINT, cx + 2, y + k + 0.6, PAINT + 0.006);
          }
          /* The stop lines, a lane's width back from each crossing. */
          T.paint('twLine', x + (s < 0 ? -ROAD_HALF : 0), cy + s * 3, PAINT, x + (s < 0 ? 0 : ROAD_HALF), cy + s * 3 + s * 0.4, PAINT + 0.006);
          T.paint('twLine', cx + s * 3, y + (s < 0 ? 0 : -ROAD_HALF), PAINT, cx + s * 3 + s * 0.4, y + (s < 0 ? ROAD_HALF : 0), PAINT + 0.006);
        }
      }
    }
    /* The tactile strip down every pavement, the yellow line a Tokyo
     * pavement always has. */
    for (const x of [BLVD_A, BLVD_B]) {
      for (const s of [-1, 1]) {
        const e = x + s * (ROAD_HALF + 2.2);
        T.paint('twTactile', e - 0.15, RAIL.y1, WALK_H, e + 0.15, D, WALK_H + 0.006);
      }
    }
    for (const y of [AVE_S, AVE_N]) {
      for (const s of [-1, 1]) {
        const e = y + s * (ROAD_HALF + 2.2);
        T.paint('twTactile', 0, e - 0.15, WALK_H, W, e + 0.15, WALK_H + 0.006);
      }
    }
  }));
}

/*
 * THE GINKGO ROWS down both sides of both boulevards and the north
 * avenue, 9 m apart, in autumn yellow: a trunk, a tall crown of three
 * clumps, and the leaves it has dropped round its foot. The trunk is
 * solid as a tree and the crown as a canopy, which is the contact the
 * town's trees give.
 */
export const GINKGO = [];
function ginkgoRows() {
  const out = [];
  for (const x of [BLVD_A, BLVD_B]) {
    for (const s of [-1, 1]) {
      for (let y = RAIL.y1 + 6; y < D - 3; y += 9) {
        if (Math.abs(y - AVE_S) < HALF + 5 || Math.abs(y - AVE_N) < HALF + 5) {
          continue;
        }
        out.push([x + s * (ROAD_HALF + 4.4), y]);
      }
    }
  }
  for (const s of [-1, 1]) {
    for (let x = 6; x < W - 3; x += 9) {
      if (inBlvd(x, 5) || (x > DECK.x0 - 3 && x < DECK.x1 + 3)) {
        continue;
      }
      out.push([x, AVE_N + s * (ROAD_HALF + 4.4)]);
    }
  }
  return out;
}

export function ginkgo(T, px, py, k, seed) {
  const r = rng(seed);
  const h = 4.2 * k;
  T.post('twTrunk', px, py, 0, h + 2.4 * k, 0.16 * k, { kind: 'tree', name: 'ginkgo' });
  T.cap('twGinkgo0', [px, py, h + 1.2 * k], [px, py, h + 5.2 * k], 1.7 * k, { kind: 'canopy', name: 'ginkgo crown', draw: false });
  T.ball('twGinkgo1', px + r.range(-0.3, 0.3), py + r.range(-0.3, 0.3), h + 1.6 * k, 2.2 * k);
  T.ball('twGinkgo0', px + r.range(-0.4, 0.4), py + r.range(-0.4, 0.4), h + 3.4 * k, 1.9 * k);
  T.ball('twGinkgo0', px + r.range(-0.2, 0.2), py + r.range(-0.2, 0.2), h + 5.0 * k, 1.25 * k);
  T.dress(() => T.wide(() => {
    /* The square of soil it stands in, its grate, and its fallen leaves. */
    T.paint('twWoodDark', px - 0.75, py - 0.75, 0, px + 0.75, py + 0.75, WALK_H + 0.008);
    for (let i = 0; i < 4; i += 1) {
      const a = r.range(-2.4, 2.4);
      const b = r.range(-2.4, 2.4);
      const s = r.range(0.25, 0.6);
      T.paint('twGinkgoLeaf', px + a, py + b, WALK_H, px + a + s, py + b + s * 0.7, WALK_H + 0.012);
    }
  }));
}

/* A Japanese signal at a corner: a grey pole, an arm out over the lanes
 * and the long horizontal head of three lamps, the walkers' box beside. */
function signal(T, px, py, dx, dy) {
  T.post('metalDark', px, py, 0, 6.2, 0.11, { name: 'signal pole' });
  const ax = px + dx * 5.5;
  const ay = py + dy * 5.5;
  T.cap('metalDark', [px, py, 5.9], [ax, ay, 5.9], 0.07, { name: 'signal arm' });
  const ns = dx === 0;
  const hw = 0.75;
  const [x0, x1, y0, y1] = ns ? [ax - 0.2, ax + 0.2, ay - hw, ay + hw] : [ax - hw, ax + hw, ay - 0.2, ay + 0.2];
  T.box('twGirder', x0, y0, 5.55, x1, y1, 6.0, { name: 'signal head' });
  T.dress(() => T.wide(() => {
    for (let k = -1; k <= 1; k += 1) {
      const m = k === -1 ? 'lampGlow' : k === 0 ? 'twHeli' : 'lampRed';
      const cx = ns ? ax : ax + k * 0.48;
      const cy = ns ? ay + k * 0.48 : ay;
      T.disc(m, cx, cy, 0.15, 5.6, 5.95, 8, true);
    }
    T.deco('twGirder', px - 0.18, py - 0.18, 2.6, px + 0.18, py + 0.18, 3.3, true);
  }));
}

/* A Tokyo street lamp: a tall pole, one arm, a flat head. */
function lamp(T, px, py, dx, dy) {
  T.post('metal', px, py, 0, 8.4, 0.09, { name: 'lamp' });
  T.cap('metal', [px, py, 8.3], [px + dx * 1.8, py + dy * 1.8, 8.5], 0.05, { name: 'lamp arm' });
  T.dress(() => T.wide(() => {
    T.deco('lampHead', px + dx * 1.8 - 0.35, py + dy * 1.8 - 0.35, 8.35, px + dx * 1.8 + 0.35, py + dy * 1.8 + 0.35, 8.55, true);
    T.paint('lampGlow', px + dx * 1.8 - 0.28, py + dy * 1.8 - 0.28, 8.33, px + dx * 1.8 + 0.28, py + dy * 1.8 + 0.28, 8.35, true);
  }));
}

/* The white tubular guard rail along a pavement's edge. */
function guardRail(T, x0, y0, x1, y1) {
  T.dress(() => {
    const alongX = Math.abs(x1 - x0) > Math.abs(y1 - y0);
    const len = alongX ? x1 - x0 : y1 - y0;
    const n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      T.cyl('white', [px, py, 0], [px, py, 0.8], 0.035, 5);
    }
    T.cyl('white', [x0, y0, 0.8], [x1, y1, 0.8], 0.03, 5);
    T.cyl('white', [x0, y0, 0.45], [x1, y1, 0.45], 0.025, 5);
  });
}

function furniture(T) {
  for (const [px, py] of ginkgoRows()) {
    GINKGO.push([px, py]);
    ginkgo(T, px, py, 1 + ((Math.round(px * 7 + py * 13) % 5) - 2) * 0.06, Math.round(px * 31 + py * 17));
  }
  /* Signals on two corners of every crossroads, facing the traffic. */
  for (const x of [BLVD_A, BLVD_B]) {
    for (const y of [AVE_S, AVE_N]) {
      const c = ROAD_HALF + 1.2;
      signal(T, x - c, y - c - 2, 1, 0);
      signal(T, x + c, y + c + 2, -1, 0);
      signal(T, x + c + 2, y - c, 0, 1);
      signal(T, x - c - 2, y + c, 0, -1);
    }
  }
  /* Lamps down the boulevards, between the trees, both sides. */
  for (const x of [BLVD_A, BLVD_B]) {
    for (const s of [-1, 1]) {
      for (let y = RAIL.y1 + 10.5; y < D - 3; y += 27) {
        if (Math.abs(y - AVE_S) < HALF + 4 || Math.abs(y - AVE_N) < HALF + 4) {
          continue;
        }
        lamp(T, x + s * (ROAD_HALF + 0.7), y, -s, 0);
      }
    }
  }
  for (const s of [-1, 1]) {
    for (let x = 10.5; x < W - 3; x += 27) {
      if (inBlvd(x, 4) || (Math.abs(x - 225) < 15)) {
        continue;
      }
      lamp(T, x, AVE_N + s * (ROAD_HALF + 0.7), 0, -s);
    }
  }
  /* Guard rails along the avenues' pavements, broken at the crossings. */
  for (const y of [AVE_S, AVE_N]) {
    for (const s of [-1, 1]) {
      const e = y + s * (ROAD_HALF + 0.5);
      const spans = [[2, BLVD_A - HALF - 6], [BLVD_A + HALF + 6, BLVD_B - HALF - 6], [BLVD_B + HALF + 6, W - 2]];
      for (const [a, b] of spans) {
        guardRail(T, a, e, b, e);
      }
    }
  }
}

/*
 * THE EXPRESSWAY down the south avenue, the whole width of the plot: a
 * deck of four lanes on single T piers in the avenue's middle, the piers
 * 36 m apart and none in a crossroads, its parapets solid, its underside
 * ribbed with girders, a green direction sign over each carriageway.
 * Under it is the line the pilot flies the length of the district.
 */
function expressway(T) {
  const { y0, y1, under, top } = EXPRESS;
  T.box('twBridge', 0, y0, under, W, y1, top, { name: 'expressway deck' });
  T.box('twBridgeDark', 0, y0, under - 0.9, W, y0 + 0.5, under, { name: 'expressway edge beam' });
  T.box('twBridgeDark', 0, y1 - 0.5, under - 0.9, W, y1, under, { name: 'expressway edge beam' });
  /* Parapets, solid, and their sound screens over them. */
  T.box('twParapet', 0, y0, top, W, y0 + 0.35, top + 1.0, { name: 'expressway parapet' });
  T.box('twParapet', 0, y1 - 0.35, top, W, y1, top + 1.0, { name: 'expressway parapet' });
  T.dress(() => T.wide(() => {
    for (const yy of [y0 + 0.05, y1 - 0.25]) {
      T.paint('twTinBlue', 0, yy, top + 1.0, W, yy + 0.2, top + 2.6);
    }
    for (let x = 0; x < W; x += 6) {
      T.deco('twGirder', x, y0 + 0.02, top + 1.0, x + 0.18, y0 + 0.4, top + 2.7);
      T.deco('twGirder', x, y1 - 0.4, top + 1.0, x + 0.18, y1 - 0.02, top + 2.7);
    }
    /* The deck's own paint. */
    for (let x = 0; x < W; x += 12) {
      T.paint('twLine', x, AVE_S - 0.08, top, x + 6, AVE_S + 0.08, top + 0.008);
    }
    T.paint('twLine', 0, y0 + 0.9, top, W, y0 + 1.05, top + 0.008);
    T.paint('twLine', 0, y1 - 1.05, top, W, y1 - 0.9, top + 0.008);
  }));
  /* Girders under the deck, along it. */
  for (const gy of [y0 + 3, AVE_S, y1 - 3]) {
    T.deco('twGirder', 0, gy - 0.35, under - 1.4, W, gy + 0.35, under);
  }
  /* The piers, in the avenue's median, none in a crossroads. */
  for (let x = 18; x < W; x += EXPRESS.pier) {
    if (inBlvd(x, 3)) {
      continue;
    }
    T.box('twBridge', x - 1.2, AVE_S - 1.2, 0, x + 1.2, AVE_S + 1.2, under - 1.4, { name: 'expressway pier' });
    T.box('twBridge', x - 1.4, y0 + 0.6, under - 2.6, x + 1.4, y1 - 0.6, under - 1.4, { name: 'pier head' });
    T.dress(() => T.wide(() => {
      T.paint('twHoardBlue', x - 1.22, AVE_S - 1.22, 0.4, x + 1.22, AVE_S + 1.22, 1.4);
    }));
  }
  /* The direction signs, a green board over each carriageway on a gantry
   * hung off the deck's edge, with the town's own lettering on them. */
  for (const [sx, face, sy] of [[60, 's', y0 - 0.6], [380, 'n', y1 + 0.6]]) {
    T.box('twTrainBand', sx - 4, sy - 0.15, under - 3.6, sx + 4, sy + 0.15, under - 1.0, { name: 'expressway sign' });
    T.dress(() => T.wide(() => {
      const fy = sy + (face === 'n' ? 0.16 : -0.16);
      const lo = Math.min(fy, fy + (face === 'n' ? 0.01 : -0.01));
      T.paint('white', sx - 3.8, lo, under - 3.45, sx + 3.8, lo + 0.01, under - 3.35);
      T.paint('white', sx - 3.8, lo, under - 1.25, sx + 3.8, lo + 0.01, under - 1.15);
      for (const [ax, w] of [[-2.4, 1.6], [0.2, 2.2], [2.6, 1.0]]) {
        T.paint('white', sx + ax - w / 2, lo, under - 2.2, sx + ax + w / 2, lo + 0.01, under - 1.8);
        T.paint('white', sx + ax - 0.08, lo, under - 3.0, sx + ax + 0.08, lo + 0.01, under - 2.3);
      }
    }));
  }
}

/*
 * THE RAILWAY VIADUCT along the south edge: a concrete deck on portal
 * piers 15 m apart, two tracks on ballast with their sleepers and rails,
 * the overhead line's masts and wires, a parapet each side, and a
 * stopped commuter train on the far track. Under the arches between the
 * boulevards, the bars and noodle counters a JR viaduct always has, with
 * their lanterns and noren. The boulevards pass under on girder bridges.
 */
export const TRAIN = { x0: 172, x1: 268, y0: 8.6, y1: 11.6 };
function railway(T) {
  const { y0, y1, deck, rail } = RAIL;
  T.box('twBridge', 0, y0, deck - 0.9, W, y1, deck, { name: 'viaduct deck' });
  T.box('twParapet', 0, y0, deck, W, y0 + 0.3, deck + 1.3, { name: 'viaduct parapet' });
  T.box('twParapet', 0, y1 - 0.3, deck, W, y1, deck + 1.3, { name: 'viaduct parapet' });
  T.box('twBallast', 0, y0 + 0.4, deck, W, y1 - 0.4, deck + 0.3, { name: 'ballast' });
  for (let x = 7.5; x < W; x += 15) {
    if (inBlvd(x, -2)) {
      continue;
    }
    for (const py of [y0 + 0.8, y1 - 0.8]) {
      T.box('twBridge', x - 0.6, py - 0.6, 0, x + 0.6, py + 0.6, deck - 0.9, { name: 'viaduct pier' });
    }
    T.box('twBridgeDark', x - 0.7, y0, deck - 1.8, x + 0.7, y1, deck - 0.9, { name: 'viaduct cross beam' });
  }
  /* Girder bridges over the boulevards: blue steel, riveted. */
  for (const x of [BLVD_A, BLVD_B]) {
    T.box('twHoardBlue', x - HALF, y0 - 0.2, deck - 1.6, x + HALF, y0 + 0.4, deck + 0.2, { name: 'girder' });
    T.box('twHoardBlue', x - HALF, y1 - 0.4, deck - 1.6, x + HALF, y1 + 0.2, deck + 0.2, { name: 'girder' });
    for (const s of [-1, 1]) {
      T.box('twBridge', x + s * (HALF + 0.8) - 0.8, y0, 0, x + s * (HALF + 0.8) + 0.8, y1, deck - 0.9, { name: 'abutment' });
    }
  }
  T.dress(() => T.wide(() => {
    for (const ty of [5.4, 10.6]) {
      for (const o of [-0.53, 0.53]) {
        T.deco('twRail', 0, ty + o - 0.04, deck + 0.3, W, ty + o + 0.04, deck + 0.46);
      }
      for (let x = 0.3; x < W; x += 1.2) {
        T.paint('twSleeper', x, ty - 1.2, deck + 0.3, x + 0.3, ty + 1.2, deck + 0.34);
      }
    }
  }));
  /* The overhead line: a mast on the north parapet every 30 m, its arm
   * over both tracks, and the contact wires. */
  const masts = [];
  for (let x = 4; x < W; x += 30) {
    T.post('twGirder', x, y1 - 0.15, deck, deck + 6.4, 0.14, { name: 'catenary mast' });
    T.box('twGirder', x - 0.1, y0 + 2.2, deck + 5.6, x + 0.1, y1, deck + 5.9, { name: 'catenary arm' });
    masts.push(x);
  }
  for (let i = 0; i + 1 < masts.length; i += 1) {
    for (const ty of [5.4, 10.6]) {
      T.wire('rope', [masts[i], ty, deck + 5.4], [masts[i + 1], ty, deck + 5.4], 0.25, 0.02);
      T.wire('rope', [masts[i], ty, deck + 5.85], [masts[i + 1], ty, deck + 5.85], 0.05, 0.02);
    }
  }
  /* The stopped train: four cars, cream with the green band, on the north
   * track over the lanes. */
  for (let c = 0; c < 4; c += 1) {
    const x0 = TRAIN.x0 + c * 24;
    const x1 = x0 + 23.2;
    T.box('twTrain', x0, TRAIN.y0, rail + 0.4, x1, TRAIN.y1, rail + 3.9, { name: 'train car' });
    T.box('twTrainBand', x0 - 0.02, TRAIN.y0 - 0.02, rail + 1.5, x1 + 0.02, TRAIN.y1 + 0.02, rail + 1.8, { solid: false });
    T.box('twRoofDark', x0 + 0.3, TRAIN.y0 + 0.2, rail + 3.9, x1 - 0.3, TRAIN.y1 - 0.2, rail + 4.2, { name: 'train roof' });
    T.dress(() => T.wide(() => {
      for (let k = 0; k < 6; k += 1) {
        const wx0 = x0 + 1.6 + k * 3.6;
        for (const [yy, f] of [[TRAIN.y0 - 0.03, 0], [TRAIN.y1 + 0.03, 1]]) {
          const a = f ? yy - 0.01 : yy;
          T.paint(k % 2 ? 'glassDark' : 'trim', wx0, a, rail + 2.0, wx0 + (k % 2 ? 1.6 : 1.3), a + 0.01, rail + 3.4);
        }
      }
    }));
    T.box('twBallast', x0 + 2, TRAIN.y0 + 0.3, rail - 0.3, x0 + 5, TRAIN.y1 - 0.3, rail + 0.4, { name: 'bogie' });
    T.box('twBallast', x1 - 5, TRAIN.y0 + 0.3, rail - 0.3, x1 - 2, TRAIN.y1 - 0.3, rail + 0.4, { name: 'bogie' });
  }
  /* The bars under the arches, in the bays between the two boulevards
   * and east of the second: a shopfront filling the bay's south face with
   * a counter, a noren over the door, a red lantern each side. */
  for (let x = 7.5; x + 15 < W; x += 15) {
    const a = x + 0.6;
    const b = x + 15 - 0.6;
    if (inBlvd(a, 2) || inBlvd(b, 2) || x < BLVD_A) {
      continue;
    }
    T.box('twPlaster', a, y1 - 0.6, 0, b, y1 - 0.4, deck - 1.8, { name: 'arch shopfront' });
    T.dress(() => T.wide(() => {
      const mid = (a + b) / 2;
      T.paint('twWoodDark', mid - 1.0, y1 - 0.4, 0, mid + 1.0, y1 - 0.38, 2.2);
      T.plate('norenTex', ((x / 15) % 3 === 0) ? 'ramen' : 'soba', mid, y1 - 0.36, 2.0, 1.9, 0.75, 'n');
      T.plate('shopFascia', ((x / 15) % 2 === 0) ? 'kokuya' : 'ramen', mid, y1 - 0.37, 4.2, Math.min(9, b - a - 1), 1.1, 'n');
      T.paint('glassLit', a + 1, y1 - 0.4, 0.9, mid - 1.6, y1 - 0.38, 2.4);
      T.paint('glassLit', mid + 1.6, y1 - 0.4, 0.9, b - 1, y1 - 0.38, 2.4);
    }));
    T.dress(() => {
      for (const lx of [a + 1.1, b - 1.1]) {
        T.cyl('twLanternRed', [lx, y1 + 0.3, 2.2], [lx, y1 + 0.3, 2.9], 0.22, 8);
      }
    });
  }
}

/*
 * THE PEDESTRIAN DECK from the plaza's north edge over the north avenue to
 * the hall's podium, 6.2 m up on two pairs of columns in the median, with
 * a glass balustrade and steps down to the plaza at its south end.
 */
function deck(T) {
  const { x0, x1, y0, y1, h, t } = DECK;
  T.box('twBridge', x0, y0 + 6, h - t, x1, y1, h, { name: 'pedestrian deck' });
  T.box('twBridgeDark', x0, y0 + 6, h - t - 0.5, x0 + 0.5, y1, h - t, { solid: false });
  T.box('twBridgeDark', x1 - 0.5, y0 + 6, h - t - 0.5, x1, y1, h - t, { solid: false });
  for (const cx of [x0 + 3, x1 - 3]) {
    T.box('twBridge', cx - 0.6, AVE_N - 0.6, 0, cx + 0.6, AVE_N + 0.6, h - t, { name: 'deck column' });
  }
  /* Balustrades, solid to a metre and ten. */
  for (const bx of [x0, x1 - 0.12]) {
    T.box('twParapet', bx, y0 + 6, h, bx + 0.12, y1, h + 0.25, { name: 'deck rail' });
    T.box('glassBlue', bx, y0 + 6, h + 0.25, bx + 0.12, y1, h + 1.1, { name: 'deck rail glass' });
    T.box('metal', bx - 0.02, y0 + 6, h + 1.05, bx + 0.14, y1, h + 1.15, { solid: false });
  }
  /* The steps down to the plaza, a ramp of treads. */
  const n = 18;
  for (let i = 0; i < n; i += 1) {
    const ya = y0 + 6 - ((i + 1) * 6) / n;
    const hh = h - ((i + 1) * h) / n;
    T.box('twStone', x0 + 4, ya, 0, x1 - 4, ya + 6 / n, hh + h / n, { name: 'deck steps' });
  }
  T.dress(() => T.wide(() => {
    T.paint('twPaveDark', x0 + 0.2, y0 + 6, h, x1 - 0.2, y1, h + 0.01);
    for (let y = y0 + 7; y < y1; y += 2) {
      T.paint('twPave', x0 + 0.2, y, h + 0.01, x1 - 0.2, y + 1, h + 0.016);
    }
  }));
}

export function streets(T) {
  roads(T);
  furniture(T);
  expressway(T);
  railway(T);
  deck(T);
}
