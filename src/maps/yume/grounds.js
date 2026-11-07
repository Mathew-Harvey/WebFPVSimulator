/*
 * grounds.js: Yumeboshi Land around its rides: the wall round the plot,
 * the entrance plaza and the gate, the main street of shops, the hub and
 * its paths, the castle, the lake, Ryusei's station and the dragon
 * mountain its tunnel runs through, the haunted house, the food court,
 * lamps, benches, beds and trees. Written with the land's builder
 * (./frame.js), so every line is drawn and solid in one; pure, so
 * scripts/yume-check.js builds it in Node.
 *
 * THE MANGA FLOURISHES are a theme park's own: the shops wear what they
 * sell on their roofs, a giant cone, a popcorn bucket, a teapot, a
 * lollipop; the coaster's tunnel is a dragon's mouth with the trackbed for
 * its tongue; a ghost looks over the haunted house's roof; the castle has
 * a star on its spire. Each is drawn in the town's cel colours and inked
 * like it, and each is solid where it is drawn.
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

import { W, D, rng } from './frame.js';
import { sincos } from '../../props/trig.js';
import { roundSolid, coneSolid } from './fair.js';
import {
  WHEEL, CAROUSEL, TOWER, TEACUPS, SWINGS, SHIP,
} from './rides.js';
import { coasterLine } from './coaster.js';

const TAU = 2 * Math.PI;
const SC = { s: 0, c: 1 };

/* The spawn plaza and the gate. */
export const PLAZA = { x0: 138, x1: 222, y0: 3, y1: 24 };
export const GATE = { px: 180, y0: 24, y1: 31, open: 13, tower: 7, h: 9.2, beam: 13.4, towerH: 15 };
/* The main street, from the gate to the hub. */
export const STREET = { x0: 166, x1: 194, y0: 31, y1: 90 };
export const SHOP_ROWS = { west: [152, 166], east: [194, 208] };
/* The hub, the castle, the lake. */
export const HUB = { px: 180, py: 112, r: 26 };
export const CASTLE = { x0: 162, x1: 198, y0: 157, y1: 179, wall: 12, arch: 11, spring: 9, archW: 9 };
export const LAKE = [
  [112, 197], [150, 191], [200, 194], [236, 203], [246, 226], [234, 250],
  [198, 263], [150, 266], [117, 260], [108, 238], [109, 214],
];
/* The lake's plan bounds, which its inked sign spans, and its deep middle,
 * the shore drawn in seven tenths of the way to (176, 228). */
export const LAKE_BOX = {
  x0: Math.min(...LAKE.map((p) => p[0])), x1: Math.max(...LAKE.map((p) => p[0])),
  y0: Math.min(...LAKE.map((p) => p[1])), y1: Math.max(...LAKE.map((p) => p[1])),
};
export const LAKE_DEEP = LAKE.map(([x, y]) => [176 + (x - 176) * 0.7, 228 + (y - 228) * 0.7]);
/* Ryusei's station, round the first 36 m of the line. */
export const STATION = { x0: 116.4, x1: 133.6, y0: 68, y1: 108, roof: 6.6, platform: 1.75, track: 124 };
/* The dragon mountain the tunnel runs through. */
export const MOUNTAIN = { x0: 4, x1: 34, y0: 83, y1: 127, bore0: 15.1, bore1: 21.1, boreH: 7.2, bed: 2.0, h: 12 };
/* The haunted house, and its corridor: in through the east door, west,
 * then north and out of the north door. */
export const HAUNT = { x0: 46, x1: 92, y0: 64, y1: 104, h: 10, door: [82, 86], doorH: 4, turnX: [58, 62], northDoor: [58, 62] };
/* The food court. */
export const FOOD = { x0: 212, x1: 240, y0: 92, y1: 130 };

/* Where the hidden Konex Drone sign is: inside the haunted house, on the
 * north corridor's east wall, facing west, near the north door. Seen only
 * by a pilot flying the corridor and looking right. */
export const HIDDEN_SIGN = { px: HAUNT.turnX[1], py: 96, h: 2.2, w: 1.1, face: 'w' };

/* The partners' banners: { px, py, face } on the castle's south face either
 * side of its arch and on the gate towers' backs. */
export const BANNERS = [
  { px: 168, py: CASTLE.y0, face: 's' },
  { px: 192, py: CASTLE.y0, face: 's' },
  { px: 172.6, py: CASTLE.y0, face: 's' },
  { px: 187.4, py: CASTLE.y0, face: 's' },
  { px: GATE.px - GATE.open / 2 - GATE.tower / 2, py: GATE.y1, face: 'n' },
  { px: GATE.px + GATE.open / 2 + GATE.tower / 2, py: GATE.y1, face: 'n' },
  { px: 168, py: CASTLE.y1, face: 'n' },
  { px: 192, py: CASTLE.y1, face: 'n' },
  /* The ninth brand, at the castle's south face east end, past the other four. */
  { px: 196.2, py: CASTLE.y0, face: 's' },
];
export const BANNER = { w: 3.6, h: 1.4, lift: 2.2 };

/* Is a plan point in the lake? */
export function inLake(px, py) {
  let inside = false;
  for (let i = 0, j = LAKE.length - 1; i < LAKE.length; j = i, i += 1) {
    const [xi, yi] = LAKE[i];
    const [xj, yj] = LAKE[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/* ---- the wall round the plot, with the gap the entrance plaza is ---- */
function boundary(T) {
  const t = 0.5;
  const h = 2.6;
  const o = { kind: 'wall', name: 'boundary wall' };
  T.box('ymWallCream', 1, 1, 0, PLAZA.x0, 1 + t, h, o);
  T.box('ymWallCream', PLAZA.x1, 1, 0, W - 1, 1 + t, h, o);
  T.box('ymWallCream', 1, D - 1 - t, 0, W - 1, D - 1, h, o);
  T.box('ymWallCream', 1, 1 + t, 0, 1 + t, D - 1 - t, h, o);
  T.box('ymWallCream', W - 1 - t, 1 + t, 0, W - 1, D - 1 - t, h, o);
  /* A pink coping, drawn only, a hand proud. */
  T.paint('ymRose', 0.95, 0.95, h, PLAZA.x0, 1 + t + 0.05, h + 0.14);
  T.paint('ymRose', PLAZA.x1, 0.95, h, W - 0.95, 1 + t + 0.05, h + 0.14);
  T.paint('ymRose', 0.95, D - 1 - t - 0.05, h, W - 0.95, D - 0.95, h + 0.14);
  T.paint('ymRose', 0.95, 1, h, 1 + t + 0.05, D - 1, h + 0.14);
  T.paint('ymRose', W - 1 - t - 0.05, 1, h, W - 0.95, D - 1, h + 0.14);
  /* The plaza's flank walls up to the gate, so the way in is the gate. */
  T.box('ymWallCream', PLAZA.x0 - t, 1, 0, PLAZA.x0, GATE.y0, h, o);
  T.box('ymWallCream', PLAZA.x1, 1, 0, PLAZA.x1 + t, GATE.y0, h, o);
  T.box('ymWallCream', PLAZA.x0 - t, GATE.y0 - t, 0, GATE.px - GATE.open / 2 - GATE.tower, GATE.y0, h, o);
  T.box('ymWallCream', GATE.px + GATE.open / 2 + GATE.tower, GATE.y0 - t, 0, PLAZA.x1 + t, GATE.y0, h, o);
}

/* A five pointed star, as a profile in a plane, centre (a, h), radius r. */
function starProfile(a, h, r) {
  const out = [];
  for (let k = 0; k < 10; k += 1) {
    sincos(Math.PI / 2 + (Math.PI * k) / 5, SC);
    const rr = k % 2 === 0 ? r : r * 0.45;
    out.push([a + rr * SC.c, h + rr * SC.s]);
  }
  return out;
}

/* ---- the entrance plaza and the gate ---- */
function entrance(T) {
  T.paint('ymPave', PLAZA.x0, PLAZA.y0 - 2, 0.004, PLAZA.x1, GATE.y1 + 1, 0.014);
  T.wide(() => {
    for (let x = PLAZA.x0 + 6; x < PLAZA.x1 - 4; x += 8) {
      T.paint('ymPaveRose', x, PLAZA.y0, 0.014, x + 4, GATE.y0 - 1, 0.02);
    }
  });
  const G = GATE;
  const wx0 = G.px - G.open / 2 - G.tower;
  const wx1 = G.px - G.open / 2;
  const ex0 = G.px + G.open / 2;
  const ex1 = G.px + G.open / 2 + G.tower;
  /* The towers, round, a cream plinth and a gold band, the windows round
   * topped. Solid as a ring of posts a hand inside the drawn wall, so the
   * way in between them is as wide as it was. */
  const R = G.tower / 2;
  for (const [a, b] of [[wx0, wx1], [ex0, ex1]]) {
    const cx = (a + b) / 2;
    const cy = (G.y0 + G.y1) / 2;
    T.disc('ymWallPink', cx, cy, R, 0, G.towerH, 20);
    roundSolid(T, cx, cy, R, 0, G.towerH, 'gate tower');
    T.disc('ymWallCream', cx, cy, R + 0.12, 0, 1.3, 20);
    T.torus('ymGold', cx, cy, G.towerH - 0.25, R + 0.05, 0.3, 0, 0, 5, 24);
    T.torus('ymWhite', cx, cy, 1.3, R + 0.12, 0.16, 0, 0, 5, 24);
    T.cone('ymRoofBlue', cx, cy, G.towerH, R + 1.4, 6.5, 16);
    T.frustumSolid({ x0: cx - R, y0: cy - R, x1: cx + R, y1: cy + R }, G.towerH, { x0: cx - 1, y0: cy - 1, x1: cx + 1, y1: cy + 1 }, G.towerH + 5.5, 3, 'gate roof');
    T.ball('ymGold', cx, cy, G.towerH + 6.6, 0.32);
    T.post('ymGold', cx, cy, G.towerH + 6.5, G.towerH + 8.2, 0.08, { kind: 'pole', name: 'gate flagpole' });
    T.deco('ymRed', cx + 0.1, cy - 0.04, G.towerH + 7.0, cx + 1.7, cy + 0.04, G.towerH + 8.0);
    /* Windows, round topped, on the south face, sunk into the curve. */
    for (const [h0, h1] of [[4, 6.7], [8.5, 11.2]]) {
      arched(T, 'ymGlass', 'ymWhite', 'y', cy - R + 0.35, -1, cx - 0.9, cx + 0.9, h0, h1, 0.42);
    }
    /* The ticket window at the foot, round topped, with its red hood. */
    arched(T, 'ymGlassDark', 'ymWhite', 'y', cy - R + 0.6, -1, cx - 1.5, cx + 1.5, 1.4, 3.0, 0.7);
    T.deco('ymRed', cx - 1.9, cy - R - 0.8, 3.2, cx + 1.9, cy - R + 0.6, 3.4);
  }
  /* The beam over the way in, the sign on it, and the star on top. */
  T.box('ymWallCream', wx1 - G.tower / 2 + 0.6, G.y0 + 0.5, G.h, ex0 + G.tower / 2 - 0.6, G.y1 - 0.5, G.beam, { kind: 'wall', name: 'gate beam' });
  T.paint('ymGold', wx1 - 0.4, G.y0 + 0.44, G.h - 0.25, ex0 + 0.4, G.y1 - 0.44, G.h);
  T.sign('ymParkName', G.px, G.y0 + 0.5, (G.h + G.beam) / 2, G.open - 0.6, G.beam - G.h - 0.6, 's');
  T.sign('ymParkName', G.px, G.y1 - 0.5, (G.h + G.beam) / 2, G.open - 0.6, G.beam - G.h - 0.6, 'n');
  T.prism('ymYellow', 'y', starProfile(G.px, G.beam + 2.4, 2.4), G.y0 + 2.9, G.y1 - 2.9);
  T.box('ymYellow', G.px - 0.9, G.y0 + 2.9, G.beam, G.px + 0.9, G.y1 - 2.9, G.beam + 3.3, { draw: false, kind: 'wall', name: 'gate star' });
  /* Balloons tied at the towers' feet, and planters. */
  T.dress(() => {
    const r = rng(3101);
    for (const x of [wx0 - 1.6, ex1 + 1.6]) {
      for (let k = 0; k < 7; k += 1) {
        const bx = x + r.range(-0.8, 0.8);
        const by = G.y0 - 1.4 + r.range(-0.6, 0.6);
        const bh = 3.2 + r.range(0, 1.6);
        T.cyl('ymSteel', [x, G.y0 - 1.4, 0.9], [bx, by, bh - 0.45], 0.01, 3);
        T.ball(r.pick(['ymRed', 'ymYellow', 'ymSky', 'ymPink', 'ymMint']), bx, by, bh, 0.42);
      }
      T.cyl('ymWood', [x, G.y0 - 1.4, 0], [x, G.y0 - 1.4, 0.9], 0.3, 8);
    }
  });
  for (const x of [PLAZA.x0 + 8, PLAZA.x0 + 22, PLAZA.x1 - 22, PLAZA.x1 - 8]) {
    bed(T, x, 14, 2.4);
  }
}

/* A round flower bed with a kerb. */
function bed(T, px, py, r) {
  T.disc('ymKerb', px, py, r, 0, 0.45, 16);
  roundSolid(T, px, py, r, 0, 0.45, 'flower bed');
  T.dress(() => {
    const k = rng(Math.round(px * 31 + py * 7));
    T.disc('ymTurfDeep', px, py, r - 0.15, 0.45, 0.5, 16);
    for (let i = 0; i < 9; i += 1) {
      sincos((TAU * i) / 9 + k.range(0, 0.5), SC);
      const rr = k.range(0.3, r - 0.5);
      T.bead(k.pick(['ymFlowerPink', 'ymFlowerYellow', 'ymFlowerBlue']), px + rr * SC.c, py + rr * SC.s, 0.62, 0.22);
    }
  });
}

/* A lamp post: solid post, drawn lantern. */
function lamp(T, px, py, h = 4.2) {
  T.post('ymSteelDark', px, py, 0, h, 0.09, { kind: 'pole', name: 'lamp post' });
  T.ball('ymLamp', px, py, h + 0.3, 0.32);
  T.cone('ymRoofBlue', px, py, h + 0.55, 0.42, 0.4, 8);
}

/* A bench along x or y. */
function bench(T, px, py, alongX) {
  const [a, b] = alongX ? [1.0, 0.25] : [0.25, 1.0];
  T.box('ymWood', px - a, py - b, 0.4, px + a, py + b, 0.48, { kind: 'wall', name: 'bench' });
  T.box('ymSteelDark', px - a + 0.1, py - b + 0.05, 0, px - a + 0.2, py + b - 0.05, 0.4, { kind: 'wall', name: 'bench leg', draw: true });
  T.box('ymSteelDark', px + a - 0.2, py - b + 0.05, 0, px + a - 0.1, py + b - 0.05, 0.4, { kind: 'wall', name: 'bench leg', draw: true });
}

/*
 * THE SHOPS of the main street, each { name, sign, wall, roof, prop }: the
 * sign key of its board, its colours, and what it wears on its roof.
 */
const SHOPS = [
  { sign: 'ymShopIce', wall: 'ymWallMint', roof: 'ymRoofTeal', prop: 'ice', h: 7.5 },
  { sign: 'ymShopPop', wall: 'ymWallLemon', roof: 'ymRoofRed', prop: 'popcorn', h: 8 },
  { sign: 'ymShopTako', wall: 'ymWallCream', roof: 'ymRoofRed', prop: 'tako', h: 7.2 },
  { sign: 'ymShopGift', wall: 'ymWallPink', roof: 'ymRoofPurple', prop: 'star', h: 9 },
  { sign: 'ymShopCafe', wall: 'ymWallSky', roof: 'ymRoofBlue', prop: 'cup', h: 8 },
  { sign: 'ymShopCandy', wall: 'ymWallPink', roof: 'ymRoofTeal', prop: 'lolly', h: 7.5 },
  { sign: 'ymShopBalloon', wall: 'ymWallLemon', roof: 'ymRoofBlue', prop: 'balloons', h: 7.8 },
  { sign: 'ymShopPhoto', wall: 'ymWallMint', roof: 'ymRoofSlate', prop: 'camera', h: 8.5 },
];
/* The lots along each row, py from and to. */
const LOTS = [[32, 45], [45, 57], [61, 74], [74, 88]];

/* What a shop wears on its roof, its middle at (px, py, h). */
function roofProp(T, kind, px, py, h) {
  const solid = (r0, h0, h1) => T.post('ymConcrete', px, py, h0, h1, r0, { draw: false, kind: 'wall', name: `${kind} on the roof` });
  if (kind === 'ice') {
    T.cyl('ymGold', [px, py, h], [px, py, h + 3.0], 0.12, 12, 1.2);
    T.ball('ymPink', px, py, h + 3.4, 1.15);
    T.ball('ymMint', px, py, h + 4.6, 0.95);
    T.ball('ymRed', px, py, h + 5.5, 0.25);
    solid(1.0, h + 1.2, h + 5.2);
  } else if (kind === 'popcorn') {
    T.cyl('ymRed', [px, py, h], [px, py, h + 2.8], 1.1, 12, 1.5);
    for (let k = 0; k < 4; k += 1) {
      T.paint('ymWhite', px - 0.06 + (k - 1.5) * 0.7, py - 1.6, h + 0.1, px + 0.06 + (k - 1.5) * 0.7, py - 1.1, h + 2.7);
    }
    const r = rng(7);
    for (let k = 0; k < 9; k += 1) {
      T.ball('ymCream', px + r.range(-1, 1), py + r.range(-1, 1), h + 3.0 + r.range(0, 0.7), 0.45);
    }
    solid(1.3, h, h + 3.4);
  } else if (kind === 'tako') {
    for (let k = 0; k < 3; k += 1) {
      T.ball('ymOrange', px - 1.3 + k * 1.3, py, h + 1.2, 0.62);
      T.paint('ymWoodDark', px - 1.6 + k * 1.3, py - 0.66, h + 1.35, px - 1.0 + k * 1.3, py - 0.6, h + 1.45);
    }
    T.cyl('ymWood', [px - 2.2, py, h + 1.2], [px + 2.2, py, h + 1.2], 0.05, 4);
    T.post('ymConcrete', px - 1.3, py, h + 0.6, h + 1.8, 0.55, { draw: false, kind: 'wall', name: 'takoyaki' });
    T.post('ymConcrete', px + 1.3, py, h + 0.6, h + 1.8, 0.55, { draw: false, kind: 'wall', name: 'takoyaki' });
    T.post('ymConcrete', px, py, h + 0.6, h + 1.8, 0.55, { draw: false, kind: 'wall', name: 'takoyaki' });
    T.cyl('ymWood', [px - 0.4, py, h], [px - 0.4, py, h + 0.6], 0.06, 4);
    T.cyl('ymWood', [px + 0.4, py, h], [px + 0.4, py, h + 0.6], 0.06, 4);
  } else if (kind === 'star') {
    T.prism('ymYellow', 'y', starProfile(px, h + 2.4, 2.3), py - 0.45, py + 0.45);
    T.box('ymYellow', px - 0.9, py - 0.45, h + 0.3, px + 0.9, py + 0.45, h + 3.5, { draw: false, kind: 'wall', name: 'star on the roof' });
    T.cyl('ymSteelDark', [px, py, h], [px, py, h + 0.6], 0.12, 6);
  } else if (kind === 'cup') {
    T.cyl('ymWhite', [px, py, h + 0.3], [px, py, h + 2.4], 1.0, 14, 1.4);
    T.disc('ymWhite', px, py, 1.9, h, h + 0.3, 16);
    T.torus('ymWhite', px + 1.5, py, h + 1.4, 0.5, 0.14, 0, 1, 5, 14);
    T.disc('ymWoodDark', px, py, 1.3, h + 2.3, h + 2.42, 14);
    solid(1.2, h, h + 2.4);
  } else if (kind === 'lolly') {
    T.cyl('ymWhite', [px, py, h], [px, py, h + 2.4], 0.1, 6);
    T.disc('ymPink', px, py - 0.2, 1.4, h + 3.3 - 1.4, h + 3.3 + 1.4, 1);
    T.torus('ymWhite', px, py - 0.22, h + 3.3, 0.9, 0.12, 0, 1, 4, 18);
    T.torus('ymYellow', px, py - 0.22, h + 3.3, 0.45, 0.12, 0, 1, 4, 14);
    T.cyl('ymPink', [px, py - 0.25, h + 3.3], [px, py + 0.25, h + 3.3], 1.4, 20);
    T.box('ymConcrete', px - 1.0, py - 0.25, h + 2.3, px + 1.0, py + 0.25, h + 4.3, { draw: false, kind: 'wall', name: 'lollipop' });
    T.post('ymConcrete', px, py, h, h + 2.3, 0.1, { draw: false, kind: 'pole', name: 'lollipop stick' });
  } else if (kind === 'balloons') {
    const r = rng(11);
    for (let k = 0; k < 7; k += 1) {
      const bx = px + r.range(-1.4, 1.4);
      const by = py + r.range(-1.4, 1.4);
      const bh = h + 2.0 + r.range(0, 1.6);
      T.cyl('ymSteel', [px, py, h], [bx, by, bh - 0.6], 0.012, 3);
      T.ball(r.pick(['ymRed', 'ymYellow', 'ymSky', 'ymPink', 'ymMint', 'ymLilac']), bx, by, bh, 0.62);
    }
    solid(1.6, h + 1.5, h + 4.2);
  } else if (kind === 'camera') {
    T.box('ymSteelDark', px - 1.5, py - 0.8, h, px + 1.5, py + 0.8, h + 1.9, { kind: 'wall', name: 'camera on the roof' });
    T.box('ymWhite', px - 0.9, py - 0.81, h + 1.9, px - 0.1, py + 0.81, h + 2.3, { kind: 'wall', name: 'camera on the roof' });
    T.cyl('ymSteel', [px + 0.4, py - 0.8, h + 0.95], [px + 0.4, py - 1.6, h + 0.95], 0.65, 14);
    T.disc('ymGlassDark', px + 0.4, py - 1.62, 0.45, h + 0.5, h + 1.4, 1);
    T.cap('ymSteel', [px + 0.4, py - 0.8, h + 0.95], [px + 0.4, py - 1.6, h + 0.95], 0.62, { draw: false, kind: 'wall', name: 'camera lens' });
  }
}

/*
 * THE CARTOON PIECES the fronts are built from, each a profile extruded
 * through a hand's depth: a pane with a round top, and an awning of
 * stripes with a scallop hanging under each. A handful of triangles each,
 * and what turns a box with paint on it into a shop out of a picture book.
 */
/* A round topped opening's profile: a0 to a1 across, from h0 up to h1 at
 * the crown. */
function archProfile(a0, a1, h0, h1) {
  const r = (a1 - a0) / 2;
  const rv = Math.min(r, h1 - h0);
  const m = (a0 + a1) / 2;
  const spring = h1 - rv;
  const out = [[a0, h0], [a1, h0]];
  for (let k = 0; k <= 8; k += 1) {
    sincos((Math.PI * k) / 8, SC);
    out.push([m + r * SC.c, spring + rv * SC.s]);
  }
  return out;
}

/* A round topped pane on a face of plan axis `axis` ('x' for a face that
 * looks east or west, 'y' for one that looks north or south), a0 to a1
 * along the face, standing `d` proud of `at` toward `out` (more where it
 * is sunk into a curved wall), framed by a hand's width of `frame`. Drawn only: it sits in the wall's solid. */
function arched(T, m, frame, axis, at, out, a0, a1, h0, h1, d = 0.09) {
  const lo = (k) => Math.min(at, at + out * k);
  const hi = (k) => Math.max(at, at + out * k);
  if (frame) {
    T.prism(frame, axis, archProfile(a0 - 0.18, a1 + 0.18, h0 - 0.12, h1 + 0.18), lo(d - 0.04), hi(d - 0.04));
  }
  T.prism(m, axis, archProfile(a0, a1, h0, h1), lo(d), hi(d));
}

/* A striped awning along a face that looks east or west: from the wall at
 * frontX, hIn up, out `depth` to hOut, from py y0 to y1, its stripes `a`
 * and `b`, a scallop of the stripe's colour under each. Solid as two steps
 * a little inside the slope. */
function awning(T, frontX, out, y0, y1, hIn, hOut, depth, a, b, name) {
  const xo = frontX + out * depth;
  const n = Math.max(3, Math.round((y1 - y0) / 0.8));
  const w = (y1 - y0) / n;
  const t = 0.16;
  for (let k = 0; k < n; k += 1) {
    const m = k % 2 ? b : a;
    const s0 = y0 + k * w;
    T.prism(m, 'y', [[frontX, hIn], [xo, hOut], [xo, hOut - t], [frontX, hIn - t]], s0, s0 + w);
    /* The scallop: a half round hanging from the outer edge. */
    const prof = [];
    for (let j = 0; j <= 6; j += 1) {
      sincos(Math.PI + (Math.PI * j) / 6, SC);
      prof.push([s0 + w / 2 + (w / 2) * SC.c, hOut - t + (w * 0.55) * SC.s]);
    }
    T.prism(m, 'x', prof, Math.min(xo, xo - out * 0.06), Math.max(xo, xo - out * 0.06));
  }
  const xm = frontX + out * depth * 0.5;
  const hm = hIn + (hOut - hIn) * 0.5;
  T.hidden(Math.min(frontX, xm), y0, hm - t, Math.max(frontX, xm), y1, hIn - 0.04, 'wall', name);
  T.hidden(Math.min(xm, xo), y0, hOut - t, Math.max(xm, xo), y1, hm - 0.04, 'wall', name);
}

/* One shop: its body, roof, awning, board and windows, its front facing
 * the street (east for the west row, west for the east row). */
function shop(T, s, x0, x1, y0, y1, frontX, east) {
  const o = { kind: 'wall', name: 'shop' };
  T.box(s.wall, x0, y0, 0, x1, y1, s.h, o);
  /* The roof: a gable, ridge along the street, with a fat white eave. */
  const mid = (x0 + x1) / 2;
  T.prism(s.roof, 'y', [[x0 - 0.5, s.h - 0.1], [mid, s.h + 2.7], [x1 + 0.5, s.h - 0.1], [x1 + 0.5, s.h - 0.35], [mid, s.h + 2.4], [x0 - 0.5, s.h - 0.35]], y0 - 0.35, y1 + 0.35);
  T.prism(s.wall, 'y', [[x0, s.h], [mid, s.h + 2.4], [x1, s.h]], y0 + 0.02, y1 - 0.02);
  for (let k = 0; k < 3; k += 1) {
    const f = (k + 1) / 4;
    const ix = (mid - x0 + 0.4) * (1 - f);
    T.box(s.roof, mid - ix, y0 - 0.3, s.h + 2.6 * f * 0.999 - 2.6 / 4, mid + ix, y1 + 0.3, s.h + 2.6 * f * 0.999, { draw: false, kind: 'wall', name: 'shop roof' });
  }
  const out = east ? 1 : -1;
  /* The corners, round white pilasters with a ball on each, and the white
   * band where the walls meet the roof. */
  for (const y of [y0 + 0.35, y1 - 0.35]) {
    T.post('ymWhite', frontX, y, 0, s.h - 0.2, 0.32, { kind: 'pole', name: 'shop corner' });
    T.ball('ymGold', frontX + out * 0.05, y, s.h + 0.3, 0.34);
  }
  T.paint('ymWhite', Math.min(frontX, frontX + out * 0.12), y0 + 0.3, s.h - 0.75, Math.max(frontX, frontX + out * 0.12), y1 - 0.3, s.h - 0.45);
  /* The awning over the shop front, striped and scalloped. */
  awning(T, frontX, out, y0 + 0.75, y1 - 0.75, 3.7, 2.95, 1.7, 'ymRed', 'ymWhite', 'awning');
  T.sign(s.sign, frontX + out * 0.02, (y0 + y1) / 2, 4.6, (y1 - y0) - 2.6, 1.6, east ? 'e' : 'w');
  /* The shop windows and the door, round topped, and the windows above. */
  const c = (y0 + y1) / 2;
  arched(T, 'ymGlass', 'ymWhite', 'x', frontX, out, y0 + 1.3, c - 1.25, 0.6, 2.6);
  arched(T, 'ymGlass', 'ymWhite', 'x', frontX, out, c + 1.25, y1 - 1.3, 0.6, 2.6);
  arched(T, 'ymWoodDark', 'ymWhite', 'x', frontX, out, c - 0.7, c + 0.7, 0, 2.5);
  for (const y of [y0 + 2.2, c, y1 - 2.2]) {
    arched(T, 'ymGlass', 'ymWhite', 'x', frontX, out, y - 0.55, y + 0.55, 5.7, s.h - 0.95);
  }
  roofProp(T, s.prop, mid, (y0 + y1) / 2, s.h);
}

/* ---- the main street ---- */
function mainStreet(T) {
  const S = STREET;
  T.paint('ymPave', S.x0, S.y0, 0.004, S.x1, S.y1, 0.014);
  T.wide(() => {
    T.paint('ymPaveRose', 174, S.y0, 0.014, 186, S.y1, 0.02);
    for (let y = S.y0 + 3; y < S.y1; y += 6) {
      T.paint('ymPaveAlt', 174, y, 0.02, 186, y + 1.2, 0.026);
    }
  });
  LOTS.forEach(([y0, y1], i) => {
    shop(T, SHOPS[i], SHOP_ROWS.west[0], SHOP_ROWS.west[1], y0, y1, SHOP_ROWS.west[1], true);
    shop(T, SHOPS[i + 4], SHOP_ROWS.east[0], SHOP_ROWS.east[1], y0, y1, SHOP_ROWS.east[0], false);
  });
  /* Lamps down both sides and benches between. */
  for (let y = 36; y < S.y1; y += 10) {
    lamp(T, 170.5, y);
    lamp(T, 189.5, y);
    bench(T, 170.5, y + 5, false);
    bench(T, 189.5, y + 5, false);
  }
  /* Bunting over the street, high, drawn only, as the town's wires are. */
  T.dress(() => {
    for (let y = 40; y < S.y1; y += 12) {
      const r = rng(y);
      for (let k = 0; k < 9; k += 1) {
        const x = 168 + (k + 0.5) * (24 / 9);
        const sag = 0.9 * (1 - ((k + 0.5) / 4.5 - 1) ** 2);
        T.cone(r.pick(['ymRed', 'ymYellow', 'ymSky', 'ymPink', 'ymMint']), x, y, 7.6 - sag - 0.6, 0.35, 0.6, 3);
      }
    }
  });
  for (let y = 40; y < S.y1; y += 12) {
    T.wire('ymSteelDark', [168, y, 7.8], [192, y, 7.8], 0.45, 0.02);
  }
}

/* ---- the hub, the paths ---- */
function hub(T) {
  const H = HUB;
  T.disc('ymPave', H.px, H.py, H.r, 0.004, 0.014, 48);
  T.wide(() => {
    T.disc('ymPaveRose', H.px, H.py, H.r - 4, 0.014, 0.02, 48);
    T.disc('ymPave', H.px, H.py, CAROUSEL.R + 2.5, 0.02, 0.026, 40);
  });
  /* The paths out of it. */
  const path = (x0, y0, x1, y1) => T.paint('ymPath', x0, y0, 0.004, x1, y1, 0.014);
  path(STATION.x1, 106, H.px - H.r + 2, 118);
  path(174, H.py + H.r - 2, 186, CASTLE.y0);
  path(H.px + H.r - 2, 106, 326, 118);
  path(244, 30, 252, 106);
  path(244, 118, 252, 214);
  path(250, 200, 300, 208);
  path(296, 106, 304, 200);
  path(176, CASTLE.y1, 184, 194);
  path(60, 104, 66, 112);
  path(92, 80, 116, 88);
  path(66, 106, 116, 114);
  path(66, 112, 72, 178);
  /* Beds, lamps and benches round the hub. */
  for (let k = 0; k < 8; k += 1) {
    sincos((TAU * (k + 0.5)) / 8, SC);
    const x = H.px + (H.r - 2.2) * SC.c;
    const y = H.py + (H.r - 2.2) * SC.s;
    lamp(T, x, y);
    sincos((TAU * k) / 8 + 0.2, SC);
    if (k !== 2 && k !== 6) {
      bed(T, H.px + (H.r - 8) * SC.c, H.py + (H.r - 8) * SC.s, 1.8);
    }
  }
}

/* ---- the castle ---- */
function castle(T) {
  const C = CASTLE;
  const mid = (C.x0 + C.x1) / 2;
  const a0 = mid - C.archW / 2;
  const a1 = mid + C.archW / 2;
  const o = { kind: 'wall', name: 'castle' };
  /* The walls either side of the arch, and over it. */
  T.box('ymWallCream', C.x0, C.y0, 0, a0, C.y1, C.wall, o);
  T.box('ymWallCream', a1, C.y0, 0, C.x1, C.y1, C.wall, o);
  T.box('ymWallCream', a0, C.y0, C.arch, a1, C.y1, C.wall, o);
  /* The arch's soffit and jambs, stone. */
  T.paint('ymStone', a0, C.y0, C.arch - 0.02, a1, C.y1, C.arch);
  T.paint('ymStone', a0, C.y0 - 0.04, 0, a0 + 0.04, C.y1 + 0.04, C.arch);
  T.paint('ymStone', a1 - 0.04, C.y0 - 0.04, 0, a1, C.y1 + 0.04, C.arch);
  /*
   * The way through looks round topped from either side: a cream spandrel
   * fills each upper corner under a low curve that springs at 9 m, where
   * the flat top used to be, and meets the soffit 2 m higher at the
   * middle, and a stone ring rides round it. The way through is as high
   * at its sides as it was and higher in the middle; the corners are solid
   * as two small steps inside the drawn fill.
   */
  const SPRING = C.spring;
  const ring = (rx, ry, k) => {
    sincos((Math.PI * k) / 12, SC);
    return [mid + rx * SC.c, SPRING + ry * SC.s];
  };
  const left = [[a0, C.arch]];
  const right = [[a1, C.arch]];
  for (let k = 0; k <= 6; k += 1) {
    left.push(ring(C.archW / 2, 2, 12 - k));
    right.push(ring(C.archW / 2, 2, k));
  }
  const band = [];
  for (let k = 0; k <= 12; k += 1) {
    band.push(ring(C.archW / 2 + 0.55, 2.55, k));
  }
  for (let k = 12; k >= 0; k -= 1) {
    band.push(ring(C.archW / 2, 2, k));
  }
  for (const [e0, e1, s0, s1] of [[C.y0 - 0.04, C.y0 + 0.5, C.y0 - 0.12, C.y0], [C.y1 - 0.5, C.y1 + 0.04, C.y1, C.y1 + 0.12]]) {
    T.prism('ymWallCream', 'y', left, e0, e1);
    T.prism('ymWallCream', 'y', right, e0, e1);
    T.prism('ymStone', 'y', band, s0, s1);
  }
  for (const [x0, x1, h] of [[a0, a0 + 1.0, SPRING + 1.3], [a0 + 1.0, a0 + 2.0, SPRING + 1.7], [a1 - 1.0, a1, SPRING + 1.3], [a1 - 2.0, a1 - 1.0, SPRING + 1.7]]) {
    T.hidden(x0, C.y0, h, x1, C.y1, C.arch, 'wall', 'castle arch');
  }
  /* The parapet, solid, its merlons drawn on it. */
  T.box('ymWallCream', C.x0, C.y0, C.wall, C.x1, C.y0 + 0.7, C.wall + 1.0, o);
  T.box('ymWallCream', C.x0, C.y1 - 0.7, C.wall, C.x1, C.y1, C.wall + 1.0, o);
  for (let x = C.x0 + 0.6; x < C.x1 - 0.6; x += 2.0) {
    T.deco('ymWallCream', x, C.y0 - 0.02, C.wall + 1.0, x + 1.0, C.y0 + 0.72, C.wall + 1.5);
    T.deco('ymWallCream', x, C.y1 - 0.72, C.wall + 1.0, x + 1.0, C.y1 + 0.02, C.wall + 1.5);
  }
  T.paint('ymPink', C.x0 - 0.04, C.y0 - 0.04, 0, C.x1 + 0.04, C.y1 + 0.04, 1.4);
  /* Windows on both long faces, arched with a gold ball. */
  for (const x of [C.x0 + 4, C.x0 + 8, a1 + 3, a1 + 7]) {
    for (const [y, d] of [[C.y0, -1], [C.y1, 1]]) {
      arched(T, 'ymGlass', 'ymGold', 'y', y, d, x - 0.7, x + 0.7, 5.5, 8.7);
      T.ball('ymGold', x, y + d * 0.2, 9.15, 0.24);
    }
  }
  /* The corner towers. */
  for (const [x, y] of [[C.x0, C.y0], [C.x1, C.y0], [C.x0, C.y1], [C.x1, C.y1]]) {
    T.disc('ymWallCream', x, y, 3.6, 0, 19, 20);
    T.torus('ymGold', x, y, 19, 3.62, 0.14, 0, 0, 5, 24);
    T.cone('ymRoofBlue', x, y, 19, 4.5, 8, 16);
    T.ball('ymGold', x, y, 27.3, 0.35);
    roundSolid(T, x, y, 3.6, 0, 19, 'castle tower');
    T.frustumSolid({ x0: x - 3.0, y0: y - 3.0, x1: x + 3.0, y1: y + 3.0 }, 19, { x0: x - 0.8, y0: y - 0.8, x1: x + 0.8, y1: y + 0.8 }, 25, 3, 'castle tower roof');
    for (const h of [8, 13]) {
      arched(T, 'ymGlass', 'ymWhite', 'y', y - 3.6 + 0.35, -1, x - 0.6, x + 0.6, h, h + 2.2, 0.42);
    }
  }
  /* The keep over the arch, its hipped roof, the spire and the star. */
  const K = { x0: mid - 9, x1: mid + 9, y0: C.y0 + 4, y1: C.y1 - 4 };
  T.box('ymWallPink', K.x0, K.y0, C.wall, K.x1, K.y1, C.wall + 10, { kind: 'wall', name: 'castle keep' });
  T.frustum('ymRoofBlue', { x0: K.x0 - 0.8, y0: K.y0 - 0.8, x1: K.x1 + 0.8, y1: K.y1 + 0.8 }, C.wall + 10, { x0: mid - 4, y0: (K.y0 + K.y1) / 2 - 1.5, x1: mid + 4, y1: (K.y0 + K.y1) / 2 + 1.5 }, C.wall + 15);
  T.frustumSolid({ x0: K.x0 - 0.8, y0: K.y0 - 0.8, x1: K.x1 + 0.8, y1: K.y1 + 0.8 }, C.wall + 10, { x0: mid - 4, y0: (K.y0 + K.y1) / 2 - 1.5, x1: mid + 4, y1: (K.y0 + K.y1) / 2 + 1.5 }, C.wall + 15, 3, 'castle keep roof');
  const sy = (K.y0 + K.y1) / 2;
  T.disc('ymWallCream', mid, sy, 2.6, C.wall + 15, C.wall + 22, 16);
  T.cone('ymRoofBlue', mid, sy, C.wall + 22, 3.3, 9, 16);
  roundSolid(T, mid, sy, 2.6, C.wall + 15, C.wall + 22, 'castle spire');
  T.frustumSolid({ x0: mid - 2.2, y0: sy - 2.2, x1: mid + 2.2, y1: sy + 2.2 }, C.wall + 22, { x0: mid - 0.5, y0: sy - 0.5, x1: mid + 0.5, y1: sy + 0.5 }, C.wall + 29, 3, 'castle spire roof');
  T.prism('ymYellow', 'y', starProfile(mid, C.wall + 33, 1.9), sy - 0.3, sy + 0.3);
  T.box('ymYellow', mid - 0.7, sy - 0.3, C.wall + 31, mid + 0.7, sy + 0.3, C.wall + 34.5, { draw: false, kind: 'wall', name: 'castle star' });
  T.sign('ymCastleName', mid, K.y0, C.wall + 6.5, 7, 2.2, 's');
  for (const x of [K.x0 + 3, K.x1 - 3]) {
    arched(T, 'ymGlass', 'ymGold', 'y', K.y0, -1, x - 0.9, x + 0.9, C.wall + 2.3, C.wall + 6.2);
    arched(T, 'ymGlass', 'ymGold', 'y', K.y1, 1, x - 0.9, x + 0.9, C.wall + 2.3, C.wall + 6.2);
  }
  /* A turret on each of the keep's corners, round, with a pointed hat,
   * which is what makes a box a castle in a picture book. */
  for (const [x, y] of [[K.x0, K.y0], [K.x1, K.y0], [K.x0, K.y1], [K.x1, K.y1]]) {
    T.disc('ymWallCream', x, y, 1.5, C.wall, C.wall + 13, 14);
    roundSolid(T, x, y, 1.5, C.wall, C.wall + 13, 'castle turret');
    T.torus('ymGold', x, y, C.wall + 13, 1.52, 0.1, 0, 0, 4, 16);
    T.cone('ymRoofPurple', x, y, C.wall + 13, 2.0, 5, 12);
    coneSolid(T, x, y, 1.6, C.wall + 13, 0.5, C.wall + 16.5, 2, 'castle turret roof');
    T.ball('ymGold', x, y, C.wall + 18.2, 0.22);
    arched(T, 'ymGlass', 'ymWhite', 'y', y - 1.5 + 0.3, -1, x - 0.4, x + 0.4, C.wall + 8.5, C.wall + 10.3, 0.36);
  }
}

/* ---- the lake ---- */
function lake(T) {
  T.poly('ymStone', LAKE.map(([x, y]) => [x + (x - 176) * 0.03, y + (y - 228) * 0.05]), 0.002, 0.03);
  T.poly('ymWater', LAKE, 0.03, 0.045);
  /*
   * THE WATER INKED, not two flat tones (round 2 R2M-5, fly-yume-8.png):
   * the sea's picture (../built/sea.js) in Shiokaze's canal blues, which is
   * this lake's own colour, lying on the flat water as one sign over the
   * lake's bounds on the map's sign mesh, clipped to the shore, with its
   * deeper middle painted in the same picture a shade down (./index.js).
   * The deep tone was a poly of its own; the picture carries it now, so
   * that poly is gone and the sign costs no draw call.
   */
  T.sign('ymLake', (LAKE_BOX.x0 + LAKE_BOX.x1) / 2, (LAKE_BOX.y0 + LAKE_BOX.y1) / 2, 0.046,
    LAKE_BOX.x1 - LAKE_BOX.x0, LAKE_BOX.y1 - LAKE_BOX.y0, 'up', 0.004);
  /* Swan boats, drawn only, at rest by the north shore. */
  T.dress(() => {
    for (const [x, y] of [[160, 255], [168, 257], [176, 258]]) {
      T.ball('ymWhite', x, y, 0.4, 0.8);
      T.cyl('ymWhite', [x + 0.5, y, 0.6], [x + 0.9, y, 1.7], 0.18, 6);
      T.ball('ymOrange', x + 1.1, y, 1.75, 0.16);
    }
  });
}

/* ---- Ryusei's station ---- */
function station(T) {
  const S = STATION;
  const o = { kind: 'wall', name: 'station platform' };
  T.box('ymPaveRose', S.track + 1.6, S.y0, 0, S.x1, S.y1, S.platform, o);
  T.box('ymPaveRose', S.x0, S.y0, 0, S.track - 1.6, S.y1, S.platform, o);
  T.paint('ymYellow', S.track + 1.6, S.y0, S.platform, S.track + 1.9, S.y1, S.platform + 0.01);
  T.paint('ymYellow', S.track - 1.9, S.y0, S.platform, S.track - 1.6, S.y1, S.platform + 0.01);
  /* The roof on posts, and its gable. */
  for (let y = S.y0 + 1; y <= S.y1 - 1; y += 9.5) {
    for (const x of [S.x0 + 0.3, S.x1 - 0.3]) {
      T.post('ymRed', x, y, S.platform, S.roof, 0.22, { kind: 'pole', name: 'station post' });
    }
  }
  T.box('ymWallCream', S.x0 - 1, S.y0 - 1, S.roof, S.x1 + 1, S.y1 + 1, S.roof + 0.5, { kind: 'wall', name: 'station roof' });
  T.prism('ymRoofRed', 'y', [[S.x0 - 1.4, S.roof + 0.5], [S.track, S.roof + 3.4], [S.x1 + 1.4, S.roof + 0.5]], S.y0 - 1.2, S.y1 + 1.2);
  T.frustumSolid({ x0: S.x0 - 1, y0: S.y0 - 1.2, x1: S.x1 + 1, y1: S.y1 + 1.2 }, S.roof + 0.5, { x0: S.track - 1, y0: S.y0 - 1.2, x1: S.track + 1, y1: S.y1 + 1.2 }, S.roof + 3.2, 3, 'station roof');
  T.sign('ymCoasterName', S.track, S.y0 - 1.02, S.roof + 1.6, 9, 1.7, 's');
  T.sign('ymCoasterName', S.track, S.y1 + 1.02, S.roof + 1.6, 9, 1.7, 'n');
  /* Stairs up to the east platform from the path. */
  for (let k = 0; k < 5; k += 1) {
    T.box('ymPave', S.x1, 100 + k * 0.01, 0, S.x1 + 3.2 - k * 0.6, 106, (S.platform * (k + 1)) / 5, { kind: 'wall', name: 'station steps' });
  }
  /* The queue's rails west of the station: low, solid, drawn. */
  for (let y = 74; y <= 100; y += 4) {
    T.box('ymSteel', 96, y - 0.05, 0, S.x0 - 1.5, y + 0.05, 1.0, { kind: 'wall', name: 'queue rail' });
  }
}

/* ---- the dragon mountain and its tunnel ---- */
function mountain(T) {
  const M = MOUNTAIN;
  const o = { kind: 'wall', name: 'dragon mountain' };
  /* West and east of the bore, and its roof, stepped as rock is. */
  const tiers = [[0, 1], [M.h * 0.45, 0.82], [M.h * 0.75, 0.55]];
  for (let k = 0; k < tiers.length; k += 1) {
    const h0 = tiers[k][0];
    const h1 = k + 1 < tiers.length ? tiers[k + 1][0] : M.h;
    const f = tiers[k][1];
    const cx = (M.x0 + M.x1) / 2;
    const cy = (M.y0 + M.y1) / 2;
    const hx = ((M.x1 - M.x0) / 2) * f;
    const hy = ((M.y1 - M.y0) / 2) * (0.6 + 0.4 * f);
    const x0 = cx - hx;
    const x1 = cx + hx;
    const y0 = cy - hy;
    const y1 = cy + hy;
    const m = k === 1 ? 'ymRockDark' : 'ymRock';
    if (h1 <= M.boreH) {
      T.box(m, x0, y0, h0, M.bore0, y1, h1, o);
      T.box(m, M.bore1, y0, h0, x1, y1, h1, o);
    } else if (h0 < M.boreH) {
      T.box(m, x0, y0, h0, M.bore0, y1, h1, o);
      T.box(m, M.bore1, y0, h0, x1, y1, h1, o);
      T.box(m, M.bore0, y0, M.boreH, M.bore1, y1, h1, o);
    } else {
      T.box(m, x0, y0, h0, x1, y1, h1, o);
    }
  }
  /* Moss on its shoulders, rocks on its foot, drawn only. */
  T.dress(() => {
    const r = rng(5501);
    for (let k = 0; k < 14; k += 1) {
      const x = r.pick([r.range(M.x0 + 1, M.bore0 - 1.5), r.range(M.bore1 + 1.5, M.x1 - 1)]);
      const y = r.range(M.y0 + 1, M.y1 - 1);
      T.ball(r.pick(['ymRock', 'ymRockDark', 'ymMoss']), x, y, r.range(0.2, 0.6), r.range(0.7, 1.4));
    }
  });
  /* The trackbed through it, red: out of the mouth it is the tongue. */
  T.box('ymConcreteDark', 16.6, M.y0 - 2, 0, 19.6, M.y1, M.bed, { kind: 'wall', name: 'trackbed' });
  T.box('ymRose', 16.6, M.y1, 0, 19.6, M.y1 + 4.5, M.bed - 0.3, { kind: 'wall', name: 'dragon tongue' });
  T.ball('ymRose', 18.1, M.y1 + 4.6, M.bed - 0.6, 1.4);
  T.post('ymRose', 18.1, M.y1 + 4.6, 0, M.bed - 0.6, 1.2, { draw: false, kind: 'wall', name: 'dragon tongue' });
  /* The dragon's head on the north face: its brow over the bore, its eyes,
   * its horns, its teeth along the bore's top, and its nostrils. */
  const y = M.y1;
  const hx0 = M.bore0 - 4;
  const hx1 = M.bore1 + 4;
  T.box('ymDragon', hx0, y, M.boreH, hx1, y + 4, M.boreH + 3.6, { kind: 'wall', name: 'dragon brow' });
  T.box('ymDragon', hx0, y, 0, M.bore0, y + 3, M.boreH, { kind: 'wall', name: 'dragon cheek' });
  T.box('ymDragon', M.bore1, y, 0, hx1, y + 3, M.boreH, { kind: 'wall', name: 'dragon cheek' });
  T.prism('ymDragonDark', 'y', [[hx0 - 0.3, M.boreH + 3.6], [18.1, M.boreH + 5.4], [hx1 + 0.3, M.boreH + 3.6]], y, y + 4.2);
  T.frustumSolid({ x0: hx0, y0: y, x1: hx1, y1: y + 4 }, M.boreH + 3.6, { x0: 16, y0: y, x1: 20.2, y1: y + 4 }, M.boreH + 5.1, 2, 'dragon brow');
  for (const s of [-1, 1]) {
    const ex = 18.1 + s * 4.8;
    T.ball('ymYellow', ex, y + 4.05, M.boreH + 2.0, 1.05);
    T.ball('ymWallDark', ex + s * 0.2, y + 4.8, M.boreH + 2.0, 0.42);
    T.cyl('ymTooth', [ex, y + 1.5, M.boreH + 4.4], [ex + s * 2.4, y - 1.6, M.boreH + 8.4], 0.6, 8, 0.08);
    T.cap('ymTooth', [ex, y + 1.5, M.boreH + 4.4], [ex + s * 1.6, y - 0.6, M.boreH + 7.0], 0.35, { draw: false, kind: 'pole', name: 'dragon horn' });
    T.ball('ymDragonDark', 18.1 + s * 1.3, y + 4.1, M.boreH + 0.9, 0.4);
  }
  /* Teeth: short, along the top of the bore, kept above BORE_CLEAR. */
  for (let k = 0; k < 6; k += 1) {
    const x = M.bore0 + 0.5 + k * ((M.bore1 - M.bore0 - 1) / 5);
    T.cyl('ymTooth', [x, y + 3.2, M.boreH], [x, y + 3.2, M.boreH - 0.5], 0.28, 5, 0.03);
  }
  /* Whiskers, drawn only, curling from the snout. */
  T.dress(() => {
    for (const s of [-1, 1]) {
      T.cyl('ymGold', [18.1 + s * 2.5, y + 4, M.boreH + 0.5], [18.1 + s * 5.5, y + 6.5, M.boreH - 0.5], 0.08, 4);
      T.cyl('ymGold', [18.1 + s * 5.5, y + 6.5, M.boreH - 0.5], [18.1 + s * 7.0, y + 6.0, M.boreH - 2.2], 0.06, 4);
    }
  });
  /* The tail curling out of the south face, over the far portal. */
  T.dress(() => {
    const pts = [[26, M.y0, 6], [29, M.y0 - 3, 7.5], [31, M.y0 - 6, 6.5], [30, M.y0 - 8, 4.5]];
    for (let k = 0; k + 1 < pts.length; k += 1) {
      T.cyl('ymDragon', pts[k], pts[k + 1], 1.0 - k * 0.22, 8, 0.8 - k * 0.22);
    }
  });
  T.cap('ymDragon', [26, M.y0, 6], [31, M.y0 - 6, 6.5], 0.9, { draw: false, kind: 'wall', name: 'dragon tail' });
}

/* ---- the haunted house ---- */
function haunted(T) {
  const H = HAUNT;
  const o = { kind: 'wall', name: 'haunted house' };
  const cw = 4;
  const [d0, d1] = H.door;
  const [tx0, tx1] = H.turnX;
  /* The house is solid but for the corridor: in at the east door between
   * d0 and d1, west to the turn, north to the north door. Built as blocks
   * round the corridor. */
  const cor = H.doorH;
  /* South of the east-west corridor. */
  T.box('ymWallDark', H.x0, H.y0, 0, H.x1, d0, H.h, o);
  /* North of it, east of the north leg. */
  T.box('ymWallDark', tx1, d1, 0, H.x1, H.y1, H.h, o);
  /* West of the north leg, from the corridor's floor to the north face,
   * and the west end of the east-west corridor. */
  T.box('ymWallDark', H.x0, d0, 0, tx0, H.y1, H.h, o);
  /* Over the corridor, both legs. */
  T.box('ymWallDark', tx0, d0, cor, H.x1, d1, H.h, o);
  T.box('ymWallDark', tx0, d1, cor, tx1, H.y1, H.h, o);
  /* The corridor's walls and floor, a shade lighter, drawn on the faces. */
  T.paint('ymStoneDark', tx0, d0, 0.004, H.x1, d1, 0.012);
  T.paint('ymStoneDark', tx0, d1, 0.004, tx1, H.y1, 0.012);
  /* Ghosts on the corridor walls, drawn only, flat to the walls. */
  T.dress(() => {
    for (const x of [68, 76, 86]) {
      T.ball('ymGhost', x, d0 + 0.25, 2.0, 0.55);
    }
    T.ball('ymGhost', tx0 + 0.25, 92, 2.2, 0.55);
  });
  /* The roof: slate, steep, with a crooked tower at the north west. */
  T.prism('ymRoofSlate', 'x', [[H.y0 - 0.6, H.h], [(H.y0 + H.y1) / 2, H.h + 6], [H.y1 + 0.6, H.h]], H.x0 - 0.6, H.x1 + 0.6);
  for (let k = 0; k < 3; k += 1) {
    const f = (k + 1) / 4;
    const iy = ((H.y1 - H.y0) / 2 + 0.6) * (1 - f);
    const cy = (H.y0 + H.y1) / 2;
    T.box('ymRoofSlate', H.x0 - 0.6, cy - iy, H.h + 6 * f - 1.5, H.x1 + 0.6, cy + iy, H.h + 6 * f, { draw: false, kind: 'wall', name: 'haunted roof' });
  }
  /* The tower, round, with a witch's hat leaning off true and a lit
   * window under it. */
  const tx = H.x0 + 6;
  const ty = H.y1 - 6;
  T.disc('ymWallDark', tx, ty, 3, H.h, H.h + 12, 16);
  roundSolid(T, tx, ty, 3, H.h, H.h + 12, 'haunted tower');
  T.torus('ymStoneDark', tx, ty, H.h + 12, 3.05, 0.2, 0, 0, 4, 16);
  T.cone('ymRoofPurple', tx, ty, H.h + 12, 4.0, 4.5, 14);
  T.cone('ymRoofPurple', tx + 0.5, ty - 0.3, H.h + 16.3, 1.3, 2.6, 10);
  coneSolid(T, tx, ty, 3.4, H.h + 12, 1.0, H.h + 16, 3, 'haunted tower roof');
  arched(T, 'ymMint', 'ymWood', 'y', ty - 3 + 0.35, -1, tx - 0.7, tx + 0.7, H.h + 6, H.h + 8.6, 0.42);
  arched(T, 'ymMint', 'ymWood', 'x', tx + 3 - 0.35, 1, ty - 0.7, ty + 0.7, H.h + 6, H.h + 8.6, 0.42);
  /* Windows lit a sickly green, round topped, boarded across. */
  for (const x of [52, 60, 70, 78, 86]) {
    arched(T, 'ymMint', 'ymWood', 'y', H.y0, -1, x - 1, x + 1, 4.8, 7.6);
    T.deco('ymWood', x - 1.3, H.y0 - 0.2, 5.9, x + 1.3, H.y0 - 0.09, 6.2);
  }
  /* The east face, the way in: the door framed in old wood under a round
   * hood, and lit windows either side, up and down. */
  T.paint('ymWood', H.x1, d0 - 0.5, 0, H.x1 + 0.08, d0, cor);
  T.paint('ymWood', H.x1, d1, 0, H.x1 + 0.08, d1 + 0.5, cor);
  arched(T, 'ymStoneDark', 'ymWood', 'x', H.x1, 1, d0, d1, cor, cor + 2.0, 0.08);
  for (const y of [68, 75, 93, 99]) {
    arched(T, 'ymMint', 'ymWood', 'x', H.x1, 1, y - 1, y + 1, 5.0, 7.8);
    arched(T, 'ymMint', 'ymWood', 'x', H.x1, 1, y - 0.8, y + 0.8, 1.2, 3.4);
  }
  /* The big ghost looking over the roof, its face south, and its arms. */
  T.ball('ymGhost', 74, 86, H.h + 7.5, 3.0);
  T.cyl('ymGhost', [74, 86, H.h + 3], [74, 86, H.h + 7.5], 2.4, 12, 3.0);
  for (const s of [-1, 1]) {
    T.ball('ymWallDark', 74 + s * 1.1, 83.3, H.h + 8.0, 0.45);
    T.cyl('ymGhost', [74 + s * 2.6, 86, H.h + 6.5], [74 + s * 4.6, 84.5, H.h + 8.5], 0.6, 8, 0.4);
  }
  T.ball('ymRose', 74, 83.1, H.h + 6.8, 0.5);
  T.post('ymGhost', 74, 86, H.h + 1.5, H.h + 9.2, 2.9, { draw: false, kind: 'wall', name: 'the ghost' });
  T.sign('ymHauntName', H.x1 + 0.1, (d0 + d1) / 2, cor + 3.4, 6.5, 1.6, 'e');
  /* A crooked graveyard fence by the door, drawn and solid. */
  for (let y = H.y0 + 2; y < d0 - 2; y += 1.6) {
    T.post('ymWallDark', H.x1 + 2.5, y, 0, 1.3 + ((y * 7) % 3) * 0.12, 0.06, { kind: 'pole', name: 'haunted fence' });
  }
}

/* ---- the food court ---- */
function food(T) {
  const F = FOOD;
  T.paint('ymPaveAlt', F.x0, F.y0, 0.004, F.x1, F.y1, 0.014);
  const stalls = [['ymStallYaki', 'ymRed'], ['ymStallKaki', 'ymSky'], ['ymStallWata', 'ymPink'], ['ymStallJuice', 'ymYellow']];
  stalls.forEach(([sign, roof], k) => {
    const y0 = F.y0 + 2 + k * 9;
    const x0 = F.x1 - 4;
    const x1 = F.x1 - 0.5;
    T.box('ymWood', x0, y0, 0, x1, y0 + 6, 1.1, { kind: 'wall', name: 'stall counter' });
    T.post('ymWoodDark', x0 + 0.15, y0 + 0.15, 1.1, 2.6, 0.08, { kind: 'pole', name: 'stall post' });
    T.post('ymWoodDark', x0 + 0.15, y0 + 5.85, 1.1, 2.6, 0.08, { kind: 'pole', name: 'stall post' });
    T.box('ymWood', x1 - 0.3, y0, 1.1, x1, y0 + 6, 2.6, { kind: 'wall', name: 'stall back' });
    awning(T, x1 + 0.2, -1, y0 - 0.3, y0 + 6.3, 3.35, 2.78, x1 + 0.2 - (x0 - 0.5), roof, 'ymWhite', 'stall roof');
    T.sign(sign, x0 - 0.52, y0 + 3, 2.85, 4.2, 0.55, 'w');
    T.dress(() => {
      for (let i = 0; i < 4; i += 1) {
        T.ball('ymLamp', x0 - 0.3, y0 + 0.8 + i * 1.45, 2.25, 0.2);
      }
    });
  });
  /* Tables under parasols. */
  for (let k = 0; k < 6; k += 1) {
    const x = F.x0 + 4 + (k % 2) * 9;
    const y = F.y0 + 5 + Math.floor(k / 2) * 12;
    T.disc('ymWhite', x, y, 0.8, 0.72, 0.78, 12);
    T.post('ymSteel', x, y, 0, 2.6, 0.06, { kind: 'pole', name: 'parasol' });
    T.cone(k % 2 ? 'ymRed' : 'ymYellow', x, y, 2.2, 1.7, 0.8, 8);
    T.box('ymWhite', x - 0.55, y - 0.55, 0, x + 0.55, y + 0.55, 0.78, { draw: false, kind: 'wall', name: 'table' });
    T.box('ymWhite', x - 1.2, y - 1.2, 2.2, x + 1.2, y + 1.2, 2.6, { draw: false, kind: 'wall', name: 'parasol' });
  }
  for (const y of [F.y0 + 1, F.y1 - 1]) {
    lamp(T, F.x0 + 1, y);
  }
}

/* ---- the rides' grounds: paving round each, a fence where the rides
 * would take a visitor's head off ---- */
function rideGrounds(T) {
  T.disc('ymPaveAlt', WHEEL.px, WHEEL.py, 18, 0.004, 0.014, 32);
  T.disc('ymPaveAlt', TOWER.px, TOWER.py, 12, 0.004, 0.014, 28);
  T.disc('ymPaveAlt', TEACUPS.px, TEACUPS.py, TEACUPS.postR + 3, 0.004, 0.014, 36);
  T.disc('ymPaveAlt', SWINGS.px, SWINGS.py, 14, 0.004, 0.014, 32);
  T.disc('ymPaveAlt', SHIP.px, SHIP.py, 14, 0.004, 0.014, 32);
}

/* ---- trees ---- */
/* No tree where a coaster sample runs within CLEAR of it under the
 * crown's top, nor in a ride's swept ground or on a path. */
function treeFree(T, px, py, keep) {
  if (!T.clear(px, py, 2.2) || inLake(px, py)) {
    return false;
  }
  for (const [x, y, r] of keep) {
    const dx = px - x;
    const dy = py - y;
    if (dx * dx + dy * dy < r * r) {
      return false;
    }
  }
  const L = coasterLine();
  for (let i = 0; i < L.n; i += 4) {
    const dx = L.p[3 * i] - px;
    const dy = L.p[3 * i + 1] - py;
    if (dx * dx + dy * dy < 7.5 * 7.5 && L.p[3 * i + 2] < 16) {
      return false;
    }
  }
  return true;
}

const KEEP = [
  [WHEEL.px, WHEEL.py, 30], [TOWER.px, TOWER.py, 12], [TEACUPS.px, TEACUPS.py, 18], [SWINGS.px, SWINGS.py, 16],
  [SHIP.px, SHIP.py, 17], [CAROUSEL.px, CAROUSEL.py, HUB.r + 3], [180, 168, 24], [69, 84, 26], [226, 111, 19],
  [124, 88, 14], [180, 55, 32], [180, 14, 46], [18, 105, 26], [248, 110, 6], [300, 112, 5], [210, 112, 8],
];

/*
 * THE PARK'S OWN TREES, drawn in the comic's round hand rather than the
 * town's: a broadleaf is a trunk and four puffs of leaf, a cherry a leaning
 * trunk and five flat pink puffs, a pine three stacked cones. Each is a
 * few hundred triangles where the town's tree was two and a half thousand,
 * so the park's 250 trees cost a ninth of what they did, and their shadows
 * the same. Solid as drawn, a little inside: the trunk, and one capsule
 * through the middle of the canopy.
 */
function broadleaf(T, px, py, s, k, r) {
  const a = r.range(0, 6.28);
  const tones = ['ymLeaf', 'ymLeafDeep', 'ymLeafLight'];
  const tone = (j) => tones[(k + j) % 3];
  T.cyl('ymBark', [px, py, 0], [px, py, 3.0 * s], 0.24 * s, 7, 0.15 * s);
  T.post('ymBark', px, py, 0, 2.4 * s, 0.18 * s, { draw: false, kind: 'tree', name: 'trunk' });
  T.leaf(tone(0), px, py, 3.7 * s, 1.95 * s, 1.6 * s, a);
  for (let j = 0; j < 3; j += 1) {
    const sc = sincos(a + (j * 6.28) / 3, { s: 0, c: 1 });
    T.leaf(tone(j + 1), px + 1.15 * s * sc.c, py + 1.15 * s * sc.s, 3.2 * s + 0.3 * s * (j % 2), 1.3 * s, 1.1 * s, a + j);
  }
  T.leaf(tone(2), px, py, 4.9 * s, 1.1 * s, 0.95 * s, a + 2);
  T.post('ymLeaf', px, py, 3.3 * s, 4.1 * s, 1.45 * s, { draw: false, kind: 'canopy', name: 'canopy' });
}

function cherry(T, px, py, s, k, r) {
  const a = r.range(0, 6.28);
  const lean = sincos(a, { s: 0, c: 1 });
  const tx = px + 0.5 * s * lean.c;
  const ty = py + 0.5 * s * lean.s;
  T.cyl('ymBark', [px, py, 0], [tx, ty, 2.7 * s], 0.22 * s, 7, 0.13 * s);
  T.cap('ymBark', [px, py, 0], [tx, ty, 2.2 * s], 0.17 * s, { draw: false, kind: 'tree', name: 'trunk' });
  T.leaf(k % 2 ? 'ymSakura' : 'ymSakuraDeep', tx, ty, 3.4 * s, 2.1 * s, 1.25 * s, a);
  for (let j = 0; j < 4; j += 1) {
    const sc = sincos(a + 0.8 + (j * 6.28) / 4, { s: 0, c: 1 });
    T.leaf((k + j) % 2 ? 'ymSakuraDeep' : 'ymSakura', tx + 1.5 * s * sc.c, ty + 1.5 * s * sc.s, 3.0 * s + 0.25 * s * (j % 2), 1.35 * s, 0.9 * s, a + j);
  }
  T.post('ymSakura', tx, ty, 3.2 * s, 3.6 * s, 1.5 * s, { draw: false, kind: 'canopy', name: 'canopy' });
}

function pine(T, px, py, s, k) {
  T.cyl('ymBark', [px, py, 0], [px, py, 1.4 * s], 0.2 * s, 6, 0.16 * s);
  const tiers = [[1.0, 1.75, 2.5], [2.5, 1.35, 2.2], [3.8, 0.9, 1.9]];
  tiers.forEach(([h, rr, ht], j) => {
    T.cone((k + j) % 2 ? 'ymPine' : 'ymPineDeep', px, py, h * s, rr * s, ht * s, 8);
  });
  T.post('ymBark', px, py, 0, 1.0 * s, 0.17 * s, { draw: false, kind: 'tree', name: 'trunk' });
  T.post('ymPine', px, py, 1.6 * s, 3.4 * s, 0.75 * s, { draw: false, kind: 'canopy', name: 'canopy' });
  T.post('ymPine', px, py, 3.4 * s, 5.0 * s, 0.4 * s, { draw: false, kind: 'canopy', name: 'canopy' });
}

let TREE_K = 0;
function tree(T, style, px, py, s, r) {
  TREE_K += 1;
  T.grove(() => {
    if (style === 'pine') {
      pine(T, px, py, s, TREE_K);
    } else if (style === 'sakura') {
      cherry(T, px, py, s, TREE_K, r);
    } else {
      broadleaf(T, px, py, s, TREE_K, r);
    }
  });
  T.take(px, py, 1.6);
}

function trees(T) {
  TREE_K = 0;
  const r = rng(9091);
  /* A belt round the wall, but not before the gate. */
  const ring = [];
  for (let x = 8; x < W - 6; x += 7) {
    ring.push([x, 6], [x, D - 6]);
  }
  for (let y = 12; y < D - 10; y += 7) {
    ring.push([6, y], [W - 6, y]);
  }
  for (const [x0, y0] of ring) {
    const x = x0 + r.range(-1.2, 1.2);
    const y = y0 + r.range(-1.2, 1.2);
    if (!treeFree(T, x, y, KEEP)) {
      continue;
    }
    const style = r.chance(0.35) ? 'pine' : r.chance(0.5) ? 'sakura' : 'street';
    tree(T, style, x, y, r.range(0.9, 1.2), r);
  }
  /* Clumps in the coaster's infield, round the lake and in the east. */
  const clumps = [[40, 160, 10, 6], [92, 140, 9, 5], [100, 220, 8, 4], [44, 222, 7, 4], [150, 140, 9, 6], [214, 160, 9, 6],
    [262, 236, 8, 5], [326, 150, 8, 5], [222, 30, 9, 5], [280, 28, 9, 5], [140, 40, 9, 5], [100, 30, 9, 4], [250, 260, 7, 4], [148, 92, 6, 3], [214, 74, 6, 3]];
  for (const [cx, cy, rr, n] of clumps) {
    for (let k = 0; k < n * 3 && n > 0; k += 1) {
      const x = cx + r.range(-rr, rr);
      const y = cy + r.range(-rr, rr);
      if (!treeFree(T, x, y, KEEP)) {
        continue;
      }
      const style = r.chance(0.45) ? 'sakura' : r.chance(0.5) ? 'street' : 'pine';
      tree(T, style, x, y, r.range(0.85, 1.15), r);
    }
  }
  /* Sakura round the lake's south shore, either side of the castle. */
  for (let x = 116; x < 244; x += 8) {
    const y = 188 + r.range(-1, 1);
    if (treeFree(T, x, y, KEEP)) {
      tree(T, 'sakura', x, y, r.range(0.9, 1.1), r);
    }
  }
}

/* The grounds whole. */
export function grounds(T) {
  boundary(T);
  entrance(T);
  mainStreet(T);
  hub(T);
  castle(T);
  lake(T);
  station(T);
  mountain(T);
  haunted(T);
  food(T);
  rideGrounds(T);
  trees(T);
}
