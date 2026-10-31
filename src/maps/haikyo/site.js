/*
 * site.js: the estate's ground. The white hoarding the city put round it
 * when it was closed and the block walls it always had, the gate, the
 * courtyard gone to weeds, the playground, the bicycle shed, the bins, the
 * yard behind the annex.
 *
 * THE PLAYGROUND is the one every estate of the day was given, and every
 * piece of it is a line: the swing frame's bar is 2.6 m up between legs
 * 6 m apart; the concrete mountain (a mound for children to climb and
 * slide off, which half the parks in the country still have) has a tunnel
 * through it 2.4 m wide and 2.2 high; the climbing frame is a cube of bars
 * a quad cannot fly through and so is solid as one.
 *
 * THE BICYCLE SHED down the north side is 50 m of corrugated roof on posts
 * 2.3 m up, five metres a bay, the rows of bicycles under it left where
 * their owners left them: under its roof is a straight the length of it.
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
import { wall } from './bits.js';
import { BLOCK } from './danchi.js';

export const SITE = { x0: 42, x1: 152, y0: 33, y1: 124 };
export const GATE = { x0: 92, x1: 100, open0: 96.2, post: 0.4, h: 3.0 };
export const SWINGS = { x0: 80, x1: 86, py: 50, bar: 2.6 };
export const MOUNTAIN = { x0: 73, x1: 83, y0: 54, y1: 64, h: 3.6, t0: 76.8, t1: 79.2, th: 2.2 };
export const SHED = { x0: 64, x1: 114, y0: 112.6, y1: 118.2, h: 2.3, bay: 5 };
const GYM = { x0: 87, y0: 58, n: 3, s: 0.8 };

export function site(T) {
  const r = rng(0x517e01);
  const S = SITE;

  /* THE HOARDING along the street, three metres of white steel, with the
   * gate in it: two posts and one leaf, slid half across and rusted there. */
  const H = GATE.h;
  for (const [a, b] of [[S.x0, GATE.x0], [GATE.x1, S.x1]]) {
    T.box('hkHoarding', a, S.y0 - 0.05, 0, b, S.y0 + 0.05, H, { name: 'hoarding' });
    T.dress(() => T.wide(() => {
      for (let x = a + 0.25; x < b - 0.1; x += 0.5) {
        T.paint('hkHoardingRib', x - 0.06, S.y0 - 0.075, 0.05, x + 0.06, S.y0 - 0.05, H - 0.05);
      }
      T.paint('hkStreak', a, S.y0 - 0.08, 0, b, S.y0 - 0.075, 0.25);
    }));
    /* Its back: the posts it is bolted to and their braces, drawn only. */
    T.dress(() => {
      for (let x = a + 0.9; x < b; x += 1.8) {
        T.cyl('metal', [x, S.y0 + 0.1, 0], [x, S.y0 + 0.1, H], 0.025, 4);
        T.cyl('metal', [x, S.y0 + 0.1, H * 0.6], [x, S.y0 + 1.3, 0], 0.02, 3);
      }
    });
  }
  for (const x of [GATE.x0, GATE.x1]) {
    T.box('concreteWorn', x - GATE.post / 2, S.y0 - GATE.post / 2, 0, x + GATE.post / 2, S.y0 + GATE.post / 2, H + 0.4, { name: 'gate post' });
    T.deco('concreteDark', x - GATE.post / 2 - 0.04, S.y0 - GATE.post / 2 - 0.04, H + 0.4, x + GATE.post / 2 + 0.04, S.y0 + GATE.post / 2 + 0.04, H + 0.5);
  }
  /* The leaf: a frame of pipe and its mesh, solid as the panel it is. */
  const leafY = S.y0 + 0.4;
  T.box('hkRust', GATE.x0 + 0.2, leafY - 0.04, 0.08, GATE.open0, leafY + 0.04, 1.85, { draw: false, name: 'gate leaf' });
  T.dress(() => T.wide(() => {
    for (const h of [0.1, 1.8]) {
      T.cyl('hkRust', [GATE.x0 + 0.2, leafY, h], [GATE.open0, leafY, h], 0.03, 4);
    }
    for (let x = GATE.x0 + 0.2; x <= GATE.open0 + 0.01; x += 0.2) {
      T.cyl('hkRustDark', [x, leafY, 0.1], [x, leafY, 1.8], 0.012, 3);
    }
    T.paint('hkRustDark', GATE.x0, leafY - 0.05, 0, GATE.x1, leafY + 0.05, 0.03);
  }));
  T.sign('estatePlate', GATE.x0 + 0.21 + 0.01, S.y0, 2.1, 0.32, 1.3, 'e', 0.0);
  T.sign('estatePlate', GATE.x0, S.y0 - GATE.post / 2 - 0.01, 2.1, 0.32, 1.3, 's', 0.0);
  T.sign('keepOut', 86, S.y0 - 0.08, 1.7, 1.4, 1.0, 's');
  T.sign('keepOut', 106, S.y0 - 0.08, 1.7, 1.4, 1.0, 's');
  T.sign('danger', 70, S.y0 - 0.08, 1.6, 0.9, 1.1, 's');
  T.sign('notice', 114, S.y0 - 0.08, 1.5, 1.6, 1.1, 's');
  T.sign('keepOut', 140, S.y0 - 0.08, 1.7, 1.4, 1.0, 's');

  /* THE BLOCK WALLS round the other three sides, a stretch of each come
   * down; gates to the lane and to the yard. */
  const blockWall = (axis, at, from, to, gaps) => {
    const hs = gaps.map(([a, b]) => ({ from: a, to: b, h0: -1, h1: 3 }));
    wall(T, 'block', axis, at, 0.15, from, to, 0, 1.6, hs, { name: 'block wall' });
    wall(T, 'concreteWorn', axis, at, 0.22, from, to, 1.6, 1.72, hs, { name: 'block wall' });
  };
  blockWall('y', S.x0, S.y0 + 0.05, S.y1, [[70, 74.5]]);
  blockWall('x', S.y1, S.x0, S.x1, [[86, 92], [128, 132]]);
  blockWall('y', S.x1, S.y0 + 0.05, S.y1, [[96, 102]]);
  T.dress(() => {
    /* The fallen stretch's blocks where they fell. */
    for (let n = 0; n < 8; n += 1) {
      const y = r.range(70.2, 74.3);
      const x = S.x0 + r.range(-0.6, 1.4);
      T.deco('block', x - 0.2, y - 0.1, 0, x + 0.2, y + 0.1, r.range(0.1, 0.35));
    }
  });

  /* THE GROUND: weeds over most of the courtyard, a concrete path from the
   * gate to the pilotis, the playground's sand. */
  T.wide(() => T.dress(() => {
    T.paint('hkWalk', 94.4, S.y0 + 0.5, 0, 97.6, BLOCK.yB, 0.03);
    T.paint('hkWeed', S.x0 + 0.5, S.y0 + 0.5, 0, 72.5, 54, 0.02);
    T.paint('hkWeedDry', S.x0 + 0.5, 54, 0, 57.5, 96, 0.02);
    T.paint('hkWeed', 72.5, 70, 0, 94.4, 96, 0.02);
    T.paint('hkWeed', 97.6, S.y0 + 0.5, 0, 119.4, 96, 0.02);
    T.paint('hkWeedDry', 103, 40, 0, 117, 70, 0.025);
    T.paint('hkSand', 72.5, 42, 0, 94.4, 70, 0.025);
    T.paint('hkWeedDry', 72.5, 96, 0, 120, BLOCK.yB, 0.02);
    T.paint('hkWeed', S.x0 + 0.5, BLOCK.yC, 0, S.x1 - 0.5, S.y1 - 0.5, 0.02);
    T.paint('hkWeed', 133, S.y0 + 0.5, 0, S.x1 - 0.5, 110, 0.02);
  }));
  /* Weeds standing: clumps of tall grass, low and soft, drawn only. */
  T.dress(() => {
    for (let n = 0; n < 150; n += 1) {
      const x = r.range(S.x0 + 1, S.x1 - 1);
      const y = r.range(S.y0 + 1, S.y1 - 1);
      if (x > 50 && x < 133 && y > BLOCK.yB - 0.5 && y < BLOCK.yC + 0.5) {
        continue;
      }
      if (x > 119 && x < 133 && y > 43 && y < 89) {
        continue;
      }
      if (x > 57 && x < 73 && y > 55 && y < 71) {
        continue;
      }
      const s = r.range(0.25, 0.7);
      T.cone(r.chance(0.6) ? 'hkWeed' : 'hkWeedDry', x, y, 0, s, s * r.range(1.4, 2.6), 5);
    }
  });

  playground(T, r);
  shed(T, r);

  /* THE BINS' CAGE by the east stair: block on three sides, its net. */
  wall(T, 'block', 'x', 113, 0.15, 116, 119, 0, 1.2, [], { name: 'bin cage' });
  wall(T, 'block', 'y', 119, 0.15, 113, 116, 0, 1.2, [], { name: 'bin cage' });
  wall(T, 'block', 'x', 116, 0.15, 116, 119, 0, 1.2, [], { name: 'bin cage' });
  T.dress(() => {
    T.deco('hkPlayBlue', 116.3, 113.3, 0, 117.6, 115.6, 0.9);
    T.deco('hkCardboard', 117.7, 113.4, 0, 118.7, 114.3, 0.6);
    T.deco('hkMattress', 116.3, 115.7, 0, 118.8, 115.9, 1.6);
  });
}

/* THE PLAYGROUND: the swings, the concrete mountain, the climbing frame,
 * the sandpit and its benches. */
function playground(T, r) {
  const W = SWINGS;
  /* The swing frame: two A frames and the bar between them. */
  for (const x of [W.x0, W.x1]) {
    T.cap('hkPlayBlue', [x, W.py - 1.1, 0], [x, W.py, W.bar], 0.07, { name: 'swing leg' });
    T.cap('hkPlayBlue', [x, W.py + 1.1, 0], [x, W.py, W.bar], 0.07, { name: 'swing leg' });
  }
  T.cap('hkPlayYellow', [W.x0, W.py, W.bar], [W.x1, W.py, W.bar], 0.08, { name: 'swing bar' });
  T.dress(() => {
    for (let s = 0; s < 3; s += 1) {
      const x = W.x0 + 1 + s * 2;
      const down = s === 2 ? 1.2 : 0.45;
      T.cyl('metal', [x - 0.25, W.py, W.bar], [x - 0.25, W.py + (s === 1 ? 0.3 : 0), down], 0.01, 3);
      T.cyl('metal', [x + 0.25, W.py, W.bar], [x + 0.25, W.py + (s === 1 ? 0.3 : 0), s === 2 ? 0.3 : down], 0.01, 3);
      T.deco('hkPlayRed', x - 0.3, W.py - 0.12 + (s === 1 ? 0.3 : 0), down - 0.04, x + 0.3, W.py + 0.12 + (s === 1 ? 0.3 : 0), down);
    }
    /* The fence round the swings, knee high. */
    for (const y of [W.py - 2, W.py + 2]) {
      T.cyl('hkPlayYellow', [W.x0 - 1, y, 0.6], [W.x1 + 1, y, 0.6], 0.03, 4);
    }
  });

  /* The concrete mountain: two halves either side of the tunnel and the
   * piece over it, each a sloped mound, all one shape from outside. */
  const M = MOUNTAIN;
  const cx0 = (M.x0 + M.x1) / 2 - 2;
  const cx1 = (M.x0 + M.x1) / 2 + 2;
  const cy0 = (M.y0 + M.y1) / 2 - 2;
  const cy1 = (M.y0 + M.y1) / 2 + 2;
  const sides = [
    [{ x0: M.x0, x1: M.t0, y0: M.y0, y1: M.y1 }, { x0: cx0, x1: M.t0, y0: cy0, y1: cy1 }],
    [{ x0: M.t1, x1: M.x1, y0: M.y0, y1: M.y1 }, { x0: M.t1, x1: cx1, y0: cy0, y1: cy1 }],
  ];
  for (const [o, i] of sides) {
    T.frustum('concreteWorn', o, 0, i, M.h);
    T.frustumSolid(o, 0, i, M.h, 5, 'concrete mountain');
  }
  /* Over the tunnel: the same slopes cut at the tunnel's roof. */
  const f = M.th / M.h;
  const o = { x0: M.t0, x1: M.t1, y0: M.y0 + (cy0 - M.y0) * f, y1: M.y1 - (M.y1 - cy1) * f };
  const i = { x0: M.t0, x1: M.t1, y0: cy0, y1: cy1 };
  T.frustum('concreteWorn', o, M.th, i, M.h);
  T.frustumSolid(o, M.th, i, M.h, 2, 'concrete mountain');
  T.dress(() => {
    /* Its slide down the east flank, the handholds, a tyre on top. */
    T.deco('metal', M.x1 - 0.2, (M.y0 + M.y1) / 2 - 0.4, 0.1, M.x1 + 2.6, (M.y0 + M.y1) / 2 + 0.4, 0.2);
    for (let n = 0; n < 10; n += 1) {
      const y = r.range(M.y0 + 1, M.y1 - 1);
      const t = r.range(0.2, 0.75);
      const x = M.x0 + (cx0 - M.x0) * t;
      T.ball(r.pick(['hkPlayRed', 'hkPlayYellow', 'hkPlayBlue']), x, y, M.h * t, 0.12);
    }
    T.torus('hkTelly', (M.x0 + M.x1) / 2, (M.y0 + M.y1) / 2, M.h + 0.15, 0.4, 0.14, 0, 0, 6, 12);
  });

  /* The climbing frame: a cube of bars, solid as the cube. */
  const G = GYM;
  const side = G.n * G.s;
  T.box('hkPlayRed', G.x0, G.y0, 0, G.x0 + side, G.y0 + side, side, { draw: false, name: 'climbing frame' });
  for (let a = 0; a <= G.n; a += 1) {
    for (let b = 0; b <= G.n; b += 1) {
      const u = G.x0 + a * G.s;
      const v = G.y0 + b * G.s;
      T.cyl('hkPlayRed', [u, v, 0], [u, v, side], 0.025, 4);
      T.cyl('hkPlayGreen', [G.x0, v, a * G.s], [G.x0 + side, v, a * G.s], 0.02, 4);
      T.cyl('hkPlayGreen', [u, G.y0, b * G.s], [u, G.y0 + side, b * G.s], 0.02, 4);
    }
  }

  /* The sandpit's frame and the benches, a spring rider gone pale, the
   * park's clock on its post. */
  T.dress(() => {
    T.deco('concreteWorn', 82, 60, 0, 86, 60.25, 0.3);
    T.deco('concreteWorn', 82, 64.75, 0, 86, 65, 0.3);
    T.deco('concreteWorn', 82, 60, 0, 82.25, 65, 0.3);
    T.deco('concreteWorn', 85.75, 60, 0, 86, 65, 0.3);
    for (const [x, y] of [[90, 46], [74, 46.5], [91, 66]]) {
      T.deco('hkBoards', x - 0.9, y - 0.2, 0.42, x + 0.9, y + 0.2, 0.47);
      T.deco('concreteWorn', x - 0.8, y - 0.15, 0, x - 0.6, y + 0.15, 0.42);
      T.deco('concreteWorn', x + 0.6, y - 0.15, 0, x + 0.8, y + 0.15, 0.42);
    }
    T.cyl('metal', [88.6, 52, 0], [88.6, 52, 0.5], 0.03, 4);
    T.ball('hkFridge', 88.6, 52, 0.75, 0.3);
    T.ball('hkTelly', 88.6, 51.8, 0.88, 0.11);
    T.deco('hkPlayYellow', 88.3, 51.7, 0.8, 88.9, 52.3, 0.85);
  });
  T.post('metal', 92.5, 56, 0, 3.0, 0.06, { name: 'clock post' });
  T.box('hkFridge', 92.2, 55.7, 3.0, 92.8, 56.3, 3.6, { name: 'clock' });
  T.sign('clock', 92.5, 55.68, 3.3, 0.5, 0.5, 's');
}

/* THE BICYCLE SHED: its roof, its posts and its rows of bicycles. */
function shed(T, r) {
  const S = SHED;
  T.box('sheet', S.x0, S.y0, S.h, S.x1, S.y1, S.h + 0.12, { name: 'shed roof' });
  T.dress(() => T.wide(() => {
    for (let x = S.x0 + 0.15; x < S.x1; x += 0.3) {
      T.paint('sheetRib', x - 0.05, S.y0, S.h + 0.12, x + 0.05, S.y1, S.h + 0.15);
    }
  }));
  for (let x = S.x0; x <= S.x1 + 0.01; x += S.bay) {
    for (const y of [S.y0 + 0.2, S.y1 - 0.2]) {
      T.post('metal', x, y, 0, S.h, 0.06, { name: 'shed post' });
    }
  }
  T.sign('bikes', S.x0 + 0.02, (S.y0 + S.y1) / 2, 1.8, 1.4, 0.45, 'w');
  /* The bicycles: two rows, a frame, two wheels and a basket, drawn only,
   * some on their sides. */
  T.dress(() => {
    for (let x = S.x0 + 0.8; x < S.x1 - 0.5; x += 0.65) {
      for (const [y, d] of [[S.y0 + 1.6, 1], [S.y1 - 1.6, -1]]) {
        if (r.chance(0.25)) {
          continue;
        }
        const m = r.pick(['hkBikeRed', 'hkBikeSilver', 'hkBikeBlack', 'hkBikeSilver']);
        if (r.chance(0.15)) {
          T.deco(m, x - 0.3, y - 0.8, 0, x + 0.3, y + 0.8, 0.12);
          continue;
        }
        T.torus('hkTelly', x, y - d * 0.55, 0.33, 0.31, 0.025, 1, 0, 3, 10);
        T.torus('hkTelly', x, y + d * 0.45, 0.33, 0.31, 0.025, 1, 0, 3, 10);
        T.cyl(m, [x, y - d * 0.55, 0.33], [x, y, 0.75], 0.02, 3);
        T.cyl(m, [x, y, 0.75], [x, y + d * 0.45, 0.33], 0.02, 3);
        T.cyl(m, [x, y - d * 0.1, 0.4], [x, y + d * 0.35, 0.85], 0.02, 3);
        T.deco('metal', x - 0.15, y + d * 0.4, 0.82, x + 0.15, y + d * 0.65, 0.98);
      }
    }
  });
}

/* The named gaps the site gives. */
export function siteGaps() {
  const M = 0.3;
  const M2 = MOUNTAIN;
  return {
    gate: { name: 'THE GATE', px: (GATE.open0 + 0.05 + GATE.x1 - GATE.post / 2) / 2, py: SITE.y0, deg: 90, w: GATE.x1 - GATE.post / 2 - GATE.open0 - 0.05 - 2 * M, h0: M, h1: 2.8, points: 100 },
    swings: { name: 'THE SWINGS', px: (SWINGS.x0 + SWINGS.x1) / 2, py: SWINGS.py, deg: 90, w: SWINGS.x1 - SWINGS.x0 - 0.2 - 2 * M, h0: M, h1: SWINGS.bar - 0.1 - M, points: 250 },
    mountain: { name: 'THE MOUNTAIN', px: (M2.t0 + M2.t1) / 2, py: (M2.y0 + M2.y1) / 2, deg: 270, w: M2.t1 - M2.t0 - 2 * M, h0: M, h1: M2.th - M, points: 500 },
    shed: { name: 'THE BIKE SHED', px: (SHED.x0 + SHED.x1) / 2 + 2.5, py: (SHED.y0 + SHED.y1) / 2, deg: 180, w: SHED.y1 - SHED.y0 - 0.4 - 0.12 - 2 * M, h0: M, h1: SHED.h - M, points: 250 },
  };
}
