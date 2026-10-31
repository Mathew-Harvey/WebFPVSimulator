/*
 * forest.js: Kodama Onsen's cedars. Pure numbers, as ./frame.js is: where
 * each tree stands, how tall, how thick and how its crown is stacked, and
 * the solids that go with it. ./index.js draws them from the same numbers.
 *
 * WHAT A PLANTED SUGI LOOKS LIKE. Japan's cedar plantations (Cryptomeria
 * japonica, planted on most of the country's mountain slopes after the
 * war) are rows of dead straight stems, pruned bare for the first half of
 * their height so the timber grows without knots, under a narrow dark cone
 * of a crown. A mature stand is 30 to 40 m tall with trunks 0.5 to 1 m
 * through, thinned to 3 to 6 m apart. That is the forest a pilot flies in
 * here: a hall of bare grey brown columns with a roof of crowns far over
 * it, and the gaps between the columns are the lines.
 *
 * THREE KINDS OF STAND.
 *
 *   the avenue     the giants either side of the shrine's approach, older
 *                  than the plantation, 38 to 44 m, the way the cedar
 *                  avenues of the old shrine roads are (Togakushi's, Nikko's)
 *   plantations    blocks planted in rows, each at its own heading and
 *                  spacing, 4 to 5 m: the rows ARE the slalom, and from the
 *                  right angle each block opens into long straight aisles
 *   the rest       older, self sown and thinned, on a jittered 6.5 m grid,
 *                  mixed heights, so the forest between the blocks reads as
 *                  a forest and not a field of rows
 *
 * WHAT IS SOLID. The trunk, as a capsule of its own radius from the ground
 * to halfway up the crown, and each whorl of the crown as the largest
 * capsule that fits up its axis inside the slant (the town's coneSolid,
 * ../../props/street.js). A pilot who clips a crown is where the picture
 * says they are, and the needles at a whorl's skirt are drawn and not
 * solid, which is the side to be wrong on for leaves.
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

import { rng, W, D } from './frame.js';
import { sincos } from '../../props/trig.js';

const TAU = 6.283185307179586;
/* A hexagon's inradius over its circumradius: the crowns are six sided. */
const HEX_IN = 0.8660254037844386;

/* The approach's axis and the avenue's two rows either side of it. */
export const AVENUE = { px: 30, off: 5.6, y0: 50, y1: 165, step: 7.4 };

/*
 * THE PLANTATION BLOCKS, each a plan rectangle, the spacing of its rows and
 * the heading they run at in whole degrees. The north block is square to
 * the plot, so its aisles run straight east and west under the shrine's
 * hill; the east block is turned 35 degrees, so its aisles are diagonals
 * off the forestry road; the block behind the inn is the tightest, 4 m, a
 * slalom that starts at the outdoor bath's fence.
 */
export const BLOCKS = [
  { name: 'north', x0: 58, y0: 238, x1: 296, y1: 296, s: 4.4, deg: 0 },
  { name: 'east', x0: 220, y0: 4, x1: 296, y1: 232, s: 4.8, deg: 35 },
  { name: 'behind the inn', x0: 140, y0: 112, x1: 202, y1: 164, s: 4.0, deg: 0 },
];

/* One cedar, as numbers: { px, py, H, r, cb, tiers, leader, big }. Each
 * tier { y, h, r, ell, spin, tone } is a cone standing at height y. */
function cedar(px, py, R, kind) {
  let H;
  let r;
  if (kind === 'avenue') {
    H = R.range(38, 44);
    r = R.range(0.5, 0.62);
  } else if (kind === 'plant') {
    H = R.range(29, 36);
    r = R.range(0.27, 0.38);
  } else {
    H = R.range(22, 38);
    r = 0.25 + 0.2 * ((H - 22) / 16) + R.range(-0.03, 0.03);
  }
  /* Pruned plantation stems are bare for half their height and more; the
   * self sown are bare for less, and the giants for most of theirs. */
  const bare = kind === 'plant' ? R.range(0.52, 0.6) : kind === 'avenue' ? R.range(0.5, 0.58) : R.range(0.38, 0.52);
  const cb = H * bare;
  const L = H - cb;
  const Rc = (kind === 'avenue' ? 0.115 : 0.1) * H * R.range(0.88, 1.1);
  const n = 3;
  const tiers = [];
  for (let k = 0; k < n; k += 1) {
    const u = k / n;
    tiers.push({
      y: cb + L * u * 0.9 + R.range(-0.4, 0.4),
      h: L * R.range(0.4, 0.46),
      r: Rc * (1 - 0.24 * k) * R.range(0.9, 1.08),
      ell: R.range(0.86, 1.14),
      spin: R.range(0, TAU),
      tone: k === 0 ? 2 : k === 1 ? 1 : 0,
    });
  }
  const leader = { y: cb + L * 0.74, h: L * R.range(0.28, 0.34), r: Rc * 0.36, ell: 1, spin: R.range(0, TAU), tone: 0 };
  return { px, py, H, r, cb, tiers, leader, big: kind === 'avenue' };
}

function inside(c, px, py) {
  return px > c.x0 && px < c.x1 && py > c.y0 && py < c.y1;
}

/* The cone's solid: the town's coneSolid, for a six sided cone standing on
 * its base at height y, its axis straight up. */
function crownSolid(T, t, px, py) {
  const Rin = HEX_IN * t.r * (t.ell < 1 ? t.ell : 1);
  const H = t.h;
  const sinA = Rin / Math.sqrt(Rin * Rin + H * H);
  const rho = 0.7 * (H * sinA) / (1 + sinA);
  const y0 = t.y + rho;
  const y1raw = t.y + H - rho / sinA;
  const y1 = y1raw > y0 ? y1raw : y0;
  T.cap('stCedar1', [px, py, y0], [px, py, y1], rho, { draw: false, name: 'canopy', kind: 'canopy' });
}

/*
 * Plant the forest into T: every tree's numbers into T.trees and its
 * solids into T's parts. `avoid(px, py)` is true where a tree may not
 * stand: the place's clearings (T.clear) and anything the caller adds.
 */
export function plantForest(T, avoid) {
  const R = rng(0x5e61c0de);
  const trees = [];
  const blocked = (px, py, margin) => {
    if (px < 1.5 || px > W - 1.5 || py < 1.5 || py > D - 1.5) {
      return true;
    }
    for (const c of T.clear) {
      if (px > c.x0 - margin && px < c.x1 + margin && py > c.y0 - margin && py < c.y1 + margin) {
        return true;
      }
    }
    return avoid(px, py);
  };
  const add = (px, py, kind) => {
    const t = cedar(px, py, R, kind);
    trees.push(t);
  };

  /* The avenue, both rows, every step, the clearings of the approach not
   * counted: these giants stand in its margin on purpose. */
  for (let py = AVENUE.y0; py <= AVENUE.y1; py += AVENUE.step) {
    for (const side of [-1, 1]) {
      const px = AVENUE.px + side * AVENUE.off + R.range(-0.25, 0.25);
      const y = py + R.range(-0.6, 0.6);
      if (!avoid(px, y)) {
        add(px, y, 'avenue');
      }
    }
  }

  /* The plantations, row by row, each point turned to its block's heading
   * about the block's middle, jittered a little, thinned one in ten. */
  const sc = { s: 0, c: 1 };
  for (const b of BLOCKS) {
    sincos((b.deg * TAU) / 360, sc);
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    const reach = Math.sqrt((b.x1 - b.x0) * (b.x1 - b.x0) + (b.y1 - b.y0) * (b.y1 - b.y0)) / 2;
    const n = Math.ceil(reach / b.s);
    for (let i = -n; i <= n; i += 1) {
      for (let k = -n; k <= n; k += 1) {
        const u = i * b.s + R.range(-0.35, 0.35);
        const v = k * b.s + R.range(-0.35, 0.35);
        const px = cx + u * sc.c - v * sc.s;
        const py = cy + u * sc.s + v * sc.c;
        if (!inside(b, px, py) || R.chance(0.1) || blocked(px, py, 1.2)) {
          continue;
        }
        add(px, py, 'plant');
      }
    }
  }

  /* The rest, self sown, on a jittered grid, wherever no block is. */
  const G = 6.5;
  for (let gy = G / 2; gy < D; gy += G) {
    for (let gx = G / 2; gx < W; gx += G) {
      const px = gx + R.range(-2.2, 2.2);
      const py = gy + R.range(-2.2, 2.2);
      if (R.chance(0.12) || BLOCKS.some((b) => inside(b, px, py)) || blocked(px, py, 1.5)) {
        continue;
      }
      add(px, py, 'wild');
    }
  }

  for (const t of trees) {
    /* The trunk to halfway up the crown, where the whorls take over. */
    T.cap('stCedarWood', [t.px, t.py, 0], [t.px, t.py, t.cb + 0.5 * (t.H - t.cb)], t.r, { draw: false, name: 'trunk', kind: 'tree' });
    for (const tier of t.tiers) {
      crownSolid(T, tier, t.px, t.py);
    }
    T.trees.push(t);
  }
  return trees;
}
