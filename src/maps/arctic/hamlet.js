/*
 * hamlet.js: the fishing hamlet on the south shore of Hyoura Island, where
 * the pilot starts. A quay, two breakwaters with their harbour lights and
 * their armour of wave blocks, a pier on piles, four net sheds, the fishing
 * cooperative's office, boats moored and hauled out, and the clutter of a
 * working winter harbour: salmon hung to dry on racks, kelp laid out in
 * rows, fish boxes, buoys and nets. Up the slope behind it, a few houses of
 * the kind every snow country village has: a tin roof in a strong colour, a
 * windbreak porch at the door and a kerosene tank on legs at the side.
 *
 * THE REAL PLACE behind it is a Shiretoko fishing port, Rausu or Utoro, in
 * February: the port is low concrete, the sea outside is white with drift
 * ice, and the sheds (banya, the fishermen's working houses) are dark board
 * under red or blue roofs. Every word painted here is the hamlet's own:
 * the cooperative is the Hyoura one, and no sign names a real business.
 *
 * Solids are the town's rule: a wall, a post, a boat, the quay and the
 * breakwaters are boxes and capsules drawn and solid from the same numbers;
 * what hangs on them is set dressing, fine and drawn near the camera only.
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
import { HAMLET_H, QUAY_TOP, groundAt } from './terrain.js';

/* The quay's apron: its sea face is the coast at z = QUAY.z1. */
export const QUAY = { x0: 27, x1: 129, z0: 84, z1: 99 };
/* The pier, on two rows of piles, its deck high enough to fly under. */
export const PIER = { x0: 58.5, x1: 61.5, z0: 99, z1: 128, deck0: 2.9, deck1: 3.2, piles: [58.8, 61.2] };
/* The net shed that stands open at both ends. */
export const NET_SHED = { x0: 70, x1: 85, z0: 56, z1: 68, doorW: 5, doorH: 3.6 };
/* The breakwaters' arms, and the lights at their ends. */
const BREAKWATERS = [
  { x0: 129, x1: 135, z0: 99, z1: 172 }, { x0: 100, x1: 135, z0: 166, z1: 172 },
  { x0: 21, x1: 27, z0: 99, z1: 156 }, { x0: 21, x1: 62, z0: 150, z1: 156 },
];
export const LIGHTS = [
  { x: 103.5, z: 169, m: 'arRed', name: 'east harbour light' },
  { x: 58.5, z: 153, m: 'arWhite', name: 'west harbour light' },
];
const BW_TOP = 4;
/* The road along the back of the quay. */
export const ROAD = { x0: 18, x1: 134, z0: 73, z1: 81 };
/* The cooperative's office. */
export const COOP = { x0: 110, x1: 130, z0: 52, z1: 69, h: 7.4 };
/* The sheds, west to east; the third is the net shed. */
const SHEDS = [
  { x0: 30, x1: 45, z0: 56, z1: 68, roof: 'arTinRed' },
  { x0: 50, x1: 65, z0: 56, z1: 68, roof: 'arTinBlue' },
  { ...NET_SHED, roof: 'arTinBlue', open: true },
  { x0: 90, x1: 105, z0: 56, z1: 68, roof: 'arTinRed' },
];
const WALL_H = 4.2;
const RIDGE = 2.4;

/*
 * A GABLE ROOF over x0..x1 by z0..z1, its ridge along x, from the wall top
 * at y up `rise`, with its eaves out by `eave`: the tin, a skin of snow on
 * it, and a solid of three steps inside the slope.
 */
export function gableX(I, m, x0, x1, z0, z1, y, rise, eave = 0.5, snow = true) {
  const zc = (z0 + z1) / 2;
  I.prism(m, 'x', [[z0 - eave, y - 0.12], [zc, y + rise], [z1 + eave, y - 0.12], [z1 + eave, y - 0.3], [zc, y + rise - 0.2], [z0 - eave, y - 0.3]], x0 - eave, x1 + eave);
  if (snow) {
    const s = 0.22;
    const at = (f) => y - 0.12 + (rise + 0.12) * f;
    I.prism('arSnow', 'x', [[z0 - eave * 0.6, at(0.08) + 0.02], [zc, y + rise + s], [z1 + eave * 0.6, at(0.08) + 0.02], [z1 + eave * 0.6, at(0.08) - 0.05 + s * 0.2], [zc, y + rise + 0.02], [z0 - eave * 0.6, at(0.08) - 0.05 + s * 0.2]], x0 - eave + 0.1, x1 + eave - 0.1);
  }
  const half = (z1 - z0) / 2;
  for (let k = 0; k < 3; k += 1) {
    const inset = (half * (k + 1)) / 3.4;
    const h = y + (rise * (inset + eave - 0.6)) / (half + eave) - 0.05;
    if (h > y + 0.1) {
      I.hidden(x0, y - 0.01, zc - (half - inset), x1, h, zc + (half - inset), 'wall', 'roof');
    }
  }
}

/* A shed's wall along x (its face north or south) or along z, with holes. */
function wallX(I, m, x0, x1, z, t, y0, y1, holes = []) {
  I.P.wall(m, { axis: 'x', at: z, t, from: x0, to: x1, y0, y1, holes }, { kind: 'wall', name: 'shed wall' });
}
function wallZ(I, m, z0, z1, x, t, y0, y1, holes = []) {
  I.P.wall(m, { axis: 'z', at: x, t, from: z0, to: z1, y0, y1, holes }, { kind: 'wall', name: 'shed wall' });
}

/* A NET SHED: board walls with battens, a window or two, a door, the roof,
 * its sign, and the gear round it. */
function shed(I, s, r) {
  const y = HAMLET_H;
  const t = 0.25;
  const mid = (s.x0 + s.x1) / 2;
  const door = s.open
    ? [{ from: mid - s.doorW / 2, to: mid + s.doorW / 2, y0: y - 1, y1: y + s.doorH }]
    : [{ from: mid - 1.6, to: mid + 1.6, y0: y - 1, y1: y + 3.0 }];
  /* The sea side has the big door; the back has the open one's other end. */
  wallX(I, 'arBoard', s.x0, s.x1, s.z1 - t / 2, t, y, y + WALL_H, door);
  wallX(I, 'arBoard', s.x0, s.x1, s.z0 + t / 2, t, y, y + WALL_H, s.open ? door : []);
  wallZ(I, 'arBoard', s.z0 + t, s.z1 - t, s.x0 + t / 2, t, y, y + WALL_H);
  wallZ(I, 'arBoard', s.z0 + t, s.z1 - t, s.x1 - t / 2, t, y, y + WALL_H);
  /* The gable ends over the walls, board too. */
  const zc = (s.z0 + s.z1) / 2;
  for (const x of [s.x0, s.x1 - t]) {
    I.prism('arBoard', 'x', [[s.z0, y + WALL_H], [zc, y + WALL_H + RIDGE - 0.15], [s.z1, y + WALL_H]], x, x + t);
  }
  gableX(I, s.roof, s.x0, s.x1, s.z0, s.z1, y + WALL_H, RIDGE, 0.6);
  /* The inside of the open shed is dark, so it reads as a way through. */
  if (s.open) {
    I.paint('arIron', s.x0 + 0.3, y + 0.01, s.z0 + 0.3, s.x1 - 0.3, y + 0.03, s.z1 - 0.3);
    I.dress(() => {
      /* Nets hung from the tie beams, and a stack of floats on the floor. */
      for (const x of [s.x0 + 2, s.x1 - 2]) {
        I.ball('arNet', x, y + 1.0, zc, 1.1, 0.8);
        I.ball('arOrange', x + 0.8, y + 0.4, zc - 1.6, 0.35);
        I.ball('arOrange', x + 1.3, y + 0.4, zc - 1.2, 0.35);
      }
    });
    I.deco('arBoardPale', s.x0, y + WALL_H - 0.3, zc - 0.15, s.x1, y + WALL_H, zc + 0.15);
  }
  I.dress(() => {
    /* Battens down the board, every 0.9 m, on the long faces. */
    for (let x = s.x0 + 0.45; x < s.x1; x += 0.9) {
      if (Math.abs(x - mid) < (s.open ? s.doorW / 2 + 0.2 : 1.8)) {
        continue;
      }
      I.paint('arBoardPale', x - 0.05, y + 0.2, s.z1 + 0.0, x + 0.05, y + WALL_H - 0.1, s.z1 + 0.06);
      I.paint('arBoardPale', x - 0.05, y + 0.2, s.z0 - 0.06, x + 0.05, y + WALL_H - 0.1, s.z0);
    }
    /* Windows on the gable ends. */
    for (const x of [s.x0 - 0.04, s.x1 - 0.02]) {
      I.paint('arGlassDark', x, y + 1.6, zc - 1.6, x + 0.06, y + 2.6, zc - 0.4);
      I.paint('arGlassDark', x, y + 1.6, zc + 0.4, x + 0.06, y + 2.6, zc + 1.6);
    }
    /* Buoys hung on the wall in a string, and a drift of snow on the lee. */
    for (let k = 0; k < 6; k += 1) {
      I.ball(k % 2 ? 'arOrange' : 'arYellow', s.x0 + 1.2 + k * 0.55, y + 2.4 - (k % 3) * 0.12, s.z1 + 0.3, 0.24);
    }
    I.ball('arSnow', s.x0 - 0.5, y, s.z0 + 2, 1.6, 0.45);
    I.ball('arSnow', s.x1 + 0.6, y, s.z0 + 5, 1.3, 0.4);
    /* Fish boxes by the door. */
    const bx = s.open ? s.x1 - 2.5 : mid + 2.4;
    for (let k = 0; k < r.int(2, 4); k += 1) {
      I.deco(k % 2 ? 'arFishBox' : 'arYellow', bx, y + k * 0.32, s.z1 + 0.5, bx + 0.9, y + 0.3 + k * 0.32, s.z1 + 1.1);
    }
  });
}

/* The cooperative's office: two floors of white block with a blue band, a
 * parapet, windows all along, its name over the door, a vending pair. */
function coop(I) {
  const c = COOP;
  const y = HAMLET_H;
  const t = 0.3;
  const door = [{ from: 118.5, to: 121.5, y0: y - 1, y1: y + 2.6 }];
  I.P.wall('arWallWhite', { axis: 'x', at: c.z1 - t / 2, t, from: c.x0, to: c.x1, y0: y, y1: y + c.h, holes: door }, { kind: 'wall', name: 'coop' });
  I.P.wall('arWallWhite', { axis: 'x', at: c.z0 + t / 2, t, from: c.x0, to: c.x1, y0: y, y1: y + c.h }, { kind: 'wall', name: 'coop' });
  I.P.wall('arWallWhite', { axis: 'z', at: c.x0 + t / 2, t, from: c.z0 + t, to: c.z1 - t, y0: y, y1: y + c.h }, { kind: 'wall', name: 'coop' });
  I.P.wall('arWallWhite', { axis: 'z', at: c.x1 - t / 2, t, from: c.z0 + t, to: c.z1 - t, y0: y, y1: y + c.h }, { kind: 'wall', name: 'coop' });
  I.box('arConcrete', c.x0, y + c.h - 0.3, c.z0, c.x1, y + c.h, c.z1, { kind: 'wall', name: 'coop roof' });
  I.box('arWallWhite', c.x0, y + c.h, c.z0, c.x1, y + c.h + 0.7, c.z0 + 0.25, { kind: 'wall', name: 'parapet' });
  I.box('arWallWhite', c.x0, y + c.h, c.z1 - 0.25, c.x1, y + c.h + 0.7, c.z1, { kind: 'wall', name: 'parapet' });
  I.box('arWallWhite', c.x0, y + c.h, c.z0, c.x0 + 0.25, y + c.h + 0.7, c.z1, { kind: 'wall', name: 'parapet' });
  I.box('arWallWhite', c.x1 - 0.25, y + c.h, c.z0, c.x1, y + c.h + 0.7, c.z1, { kind: 'wall', name: 'parapet' });
  I.paint('arSnow', c.x0 + 0.25, y + c.h, c.z0 + 0.25, c.x1 - 0.25, y + c.h + 0.18, c.z1 - 0.25);
  /* The band and the windows, wall paint on every face. */
  I.paint('arBand', c.x0 - 0.04, y + 3.1, c.z1, c.x1 + 0.04, y + 3.5, c.z1 + 0.05);
  I.paint('arBand', c.x0 - 0.05, y + 3.1, c.z0 - 0.05, c.x0, y + 3.5, c.z1);
  I.paint('arBand', c.x1, y + 3.1, c.z0 - 0.05, c.x1 + 0.05, y + 3.5, c.z1);
  for (let x = c.x0 + 1.2; x < c.x1 - 1.5; x += 2.4) {
    for (const [y0, y1] of [[1.0, 2.5], [4.3, 5.9]]) {
      if (y0 < 2 && x > 117 && x < 122) {
        continue;
      }
      I.paint('arGlass', x, y + y0, c.z1, x + 1.6, y + y1, c.z1 + 0.05);
      I.paint('arGlass', x, y + y0, c.z0 - 0.05, x + 1.6, y + y1, c.z0);
    }
  }
  I.paint('arGlassDark', 118.5, y, c.z1, 121.5, y + 2.6, c.z1 + 0.04);
  /* The canopy over the door, and the name over that. */
  I.box('arConcreteDark', 117.5, y + 2.7, c.z1, 122.5, y + 2.9, c.z1 + 1.4, { kind: 'wall', name: 'canopy' });
  I.sign('coop', 120, y + 6.6, c.z1 + 0.06, 7.2, 1.0, '+z');
  /* Two vending machines by the door, the town's own. */
  I.asset({ type: 'vending', dims: { count: 2, variant: 1 } }, 125.4, y, c.z1 + 0.55, Math.PI / 2);
  /* A red post box and a bench. */
  I.post('arRed', 114.5, c.z1 + 1.2, y, y + 1.2, 0.28, { kind: 'pole', name: 'post box' });
  I.dress(() => {
    I.ball('arRed', 114.5, y + 1.25, c.z1 + 1.2, 0.3, 0.45);
    I.deco('arWood', 112, y + 0.42, c.z1 + 0.6, 114, y + 0.5, c.z1 + 1.0);
  });
  /* A radio mast on the roof. */
  I.post('arSteel', c.x0 + 2, c.z0 + 2, y + c.h, y + c.h + 7, 0.08, { kind: 'pole', name: 'coop mast' });
  I.cyl('arSteel', [c.x0 + 1, y + c.h + 6, c.z0 + 2], [c.x0 + 3, y + c.h + 6, c.z0 + 2], 0.04, 4, null, true);
}

/* A boat: a white hull with a blue band and a pointed bow at +z or -z, a
 * wheelhouse aft, a mast and a radar. `y` is the waterline (or the cradle). */
function boat(I, x0, x1, z0, z1, y, bowSouth, r) {
  const xc = (x0 + x1) / 2;
  const bow = 2.2;
  const pts = bowSouth
    ? [[x0, z0], [x1, z0], [x1, z1 - bow], [xc, z1], [x0, z1 - bow]]
    : [[x0, z1], [x0, z0 + bow], [xc, z0], [x1, z0 + bow], [x1, z1]];
  const fb = y + 1.5;
  I.poly('arHull', 'arHull', pts, y - 0.6, fb);
  I.poly('arHullBlue', 'arHullBlue', pts.map(([px, pz]) => [px + (px < xc ? -0.03 : 0.03), pz]), y - 0.62, y + 0.35);
  const sz0 = bowSouth ? z0 : z0 + bow;
  const sz1 = bowSouth ? z1 - bow : z1;
  I.box('arHull', x0, y - 0.6, sz0, x1, fb, sz1, { draw: false, kind: 'wall', name: 'hull' });
  /* The wheelhouse, aft. */
  const wz0 = bowSouth ? z0 + 0.6 : z1 - 3.6;
  const wz1 = wz0 + 3;
  I.box('arWhite', x0 + 0.4, fb, wz0, x1 - 0.4, fb + 2.1, wz1, { kind: 'wall', name: 'wheelhouse' });
  I.box('arHullBlue', x0 + 0.3, fb + 2.1, wz0 - 0.1, x1 - 0.3, fb + 2.3, wz1 + 0.1, { kind: 'wall', name: 'wheelhouse roof' });
  I.paint('arGlassDark', x0 + 0.6, fb + 1.2, bowSouth ? wz1 : wz0 - 0.05, x1 - 0.6, fb + 1.8, bowSouth ? wz1 + 0.05 : wz0);
  I.post('arSteel', xc, (wz0 + wz1) / 2, fb + 2.3, fb + 6, 0.07, { kind: 'pole', name: 'mast' });
  I.dress(() => {
    I.cyl('arWhite', [xc - 0.6, fb + 3, (wz0 + wz1) / 2], [xc + 0.6, fb + 3, (wz0 + wz1) / 2], 0.08, 4);
    /* The flags fishermen fly, on a pole at the bow. */
    const bz = bowSouth ? z1 - 2.6 : z0 + 2.6;
    I.cyl('arSteel', [xc, fb, bz], [xc, fb + 3.2, bz], 0.04, 4);
    I.paint(r.chance(0.5) ? 'arRed' : 'arYellow', xc, fb + 2.4, bz - 0.02, xc + 1.1, fb + 3.1, bz + 0.02);
    I.ball('arOrange', x0 - 0.1, y + 0.8, (z0 + z1) / 2, 0.28);
    I.ball('arOrange', x1 + 0.1, y + 0.8, (z0 + z1) / 2 + 1.5, 0.28);
    I.paint('arSnow', x0 + 0.2, fb, (bowSouth ? wz1 : sz0) + 0.2, x1 - 0.2, fb + 0.08, (bowSouth ? sz1 : wz0) - 0.2);
  });
}

/* A wave block: four legs from a middle, as a tetrapod is. Fine. */
function tetrapod(I, x, y, z, s, r) {
  const legs = [[0, 1, 0], [0.94, -0.33, 0], [-0.47, -0.33, 0.82], [-0.47, -0.33, -0.82]];
  const turn = r.chance(0.5);
  for (const [a, b, c] of legs) {
    const [lx, lz] = turn ? [c, -a] : [a, c];
    I.cyl('arTetra', [x, y, z], [x + lx * s, y + b * s, z + lz * s], s * 0.32, 6, s * 0.2, true);
  }
}

/* A HOUSE of the snow country, on the slope: its foundation down to the
 * lowest ground under it, a tin roof, a windbreak porch, a kerosene tank. */
function house(I, x, z, w, d, roof, wall, r) {
  const g = [groundAt(x, z), groundAt(x + w, z), groundAt(x, z + d), groundAt(x + w, z + d), groundAt(x + w / 2, z + d / 2)];
  const lo = Math.min(...g) - 0.6;
  const y = Math.max(...g) + 0.4;
  I.box('arConcreteDark', x, lo, z, x + w, y, z + d, { kind: 'wall', name: 'house footing' });
  I.box(wall, x, y, z, x + w, y + 5.4, z + d, { kind: 'wall', name: 'house' });
  gableX(I, roof, x, x + w, z, z + d, y + 5.4, 1.6, 0.5);
  /* The gable ends. */
  const zc = z + d / 2;
  for (const xe of [x, x + w - 0.01]) {
    I.prism(wall, 'x', [[z, y + 5.4], [zc, y + 6.9], [z + d, y + 5.4]], xe, xe + 0.01);
  }
  /* The porch on the south face, and the tank on legs at the side. */
  const px = x + w * 0.3;
  I.box(wall, px, y, z + d, px + 2.2, y + 2.4, z + d + 1.6, { kind: 'wall', name: 'porch' });
  I.box(roof, px - 0.15, y + 2.4, z + d - 0.1, px + 2.35, y + 2.6, z + d + 1.8, { kind: 'wall', name: 'porch roof' });
  I.post('arSteel', x + w + 0.9, z + d - 1.5, y - 0.4, y + 1.0, 0.06, { kind: 'pole', name: 'tank leg' });
  I.cap('arWallCream', [x + w + 0.9, y + 1.5, z + d - 2.6], [x + w + 0.9, y + 1.5, z + d - 0.4], 0.55, { kind: 'wall', name: 'kerosene tank', look: 'capsule' });
  I.dress(() => {
    for (const fz of [z - 0.05, z + d]) {
      for (const [a, b] of [[x + 0.8, x + 2.2], [x + w - 2.2, x + w - 0.8]]) {
        for (const [y0, y1] of [[1.0, 2.2], [3.3, 4.5]]) {
          I.paint('arGlass', a, y + y0, fz, b, y + y1, fz + 0.05);
        }
      }
    }
    I.paint('arGlassDark', px + 0.6, y, z + d + 1.6, px + 1.6, y + 2.0, z + d + 1.65);
    /* A drift against the north wall and a heap from the roof. */
    I.ball('arSnow', x + w / 2, y, z - 0.6, w * 0.45, 0.25);
    I.ball('arSnow', x - 0.8, y, z + d / 2, 1.4, 0.5);
    I.cyl('arSteel', [x + w - 1.0, y + 5.6, z + 1.0], [x + w - 1.0, y + 7.6, z + 1.0], 0.12, 5);
  });
}

/* A RACK of salmon hung to dry: two posts, two rails, the fish. */
function rack(I, x0, x1, z, r) {
  const y = QUAY_TOP;
  I.post('arWood', x0, z, y, y + 2.4, 0.08, { kind: 'pole', name: 'rack' });
  I.post('arWood', x1, z, y, y + 2.4, 0.08, { kind: 'pole', name: 'rack' });
  I.cap('arWood', [x0, y + 2.3, z], [x1, y + 2.3, z], 0.06, { kind: 'pole', name: 'rack rail' });
  I.dress(() => {
    I.cyl('arWood', [x0, y + 1.6, z], [x1, y + 1.6, z], 0.05, 4);
    for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.42) {
      const L = r.range(0.55, 0.75);
      I.deco('arSalmon', x - 0.08, y + 2.25 - L, z - 0.05, x + 0.08, y + 2.25, z + 0.05);
      I.deco('arSalmon', x + 0.13, y + 1.55 - L, z - 0.05, x + 0.27, y + 1.55, z + 0.05);
    }
  });
}

/* A concrete utility pole with its cross arm, the Japanese kind. Returns
 * where its wires hang from. */
export function pole(I, x, z, g, h = 10) {
  I.post('arConcrete', x, z, g, g + h, 0.16, { kind: 'pole', name: 'utility pole' });
  I.cap('arIron', [x - 0.9, g + h - 0.6, z], [x + 0.9, g + h - 0.6, z], 0.06, { kind: 'pole', name: 'cross arm' });
  I.dress(() => {
    for (const s of [-0.75, 0, 0.75]) {
      I.cyl('arWhite', [x + s, g + h - 0.55, z], [x + s, g + h - 0.35, z], 0.05, 5);
    }
    I.paint('arYellow', x - 0.17, g + 1.6, z - 0.17, x + 0.17, g + 2.2, z + 0.17);
  });
  return [[x - 0.75, g + h - 0.35, z], [x, g + h - 0.35, z], [x + 0.75, g + h - 0.35, z]];
}

export function wires(I, a, b, sag = 0.6) {
  for (let k = 0; k < a.length; k += 1) {
    I.wire('arIron', a[k], b[k], sag);
  }
}

export function hamletLayout(I) {
  const r = rng(81);
  const y = HAMLET_H;
  /* The quay: a slab of concrete, its edge painted, its face hung with
   * tyres, bollards along it. */
  I.box('arConcrete', QUAY.x0, -3, QUAY.z0, QUAY.x1, QUAY_TOP, QUAY.z1, { kind: 'wall', name: 'quay' });
  I.paint('arLineYellow', QUAY.x0, QUAY_TOP, QUAY.z1 - 0.6, QUAY.x1, QUAY_TOP + 0.02, QUAY.z1 - 0.35);
  for (let x = QUAY.x0 + 4; x < QUAY.x1 - 2; x += 9) {
    if (Math.abs(x - 60) < 3) {
      continue;
    }
    I.post('arIron', x, QUAY.z1 - 1.2, QUAY_TOP, QUAY_TOP + 0.55, 0.2, { kind: 'pole', name: 'bollard' });
    I.dress(() => {
      I.cyl('arTyre', [x + 2, QUAY_TOP - 0.5, QUAY.z1 + 0.15], [x + 2, QUAY_TOP - 0.5, QUAY.z1 + 0.5], 0.45, 8);
    });
  }
  /* The breakwaters, their armour and their lights. */
  for (const b of BREAKWATERS) {
    I.box('arConcrete', b.x0, -3, b.z0, b.x1, BW_TOP, b.z1, { kind: 'wall', name: 'breakwater' });
    I.paint('arSnow', b.x0 + 0.3, BW_TOP, b.z0 + 0.3, b.x1 - 0.3, BW_TOP + 0.08, b.z1 - 0.3);
  }
  const armour = [
    { x0: 135, x1: 140, z0: 100, z1: 177 }, { x0: 96, x1: 135, z0: 172, z1: 177 },
    { x0: 16, x1: 21, z0: 100, z1: 160 }, { x0: 16, x1: 66, z0: 156, z1: 161 },
  ];
  for (const a of armour) {
    I.box('arTetra', a.x0, -3, a.z0, a.x1, 1.2, a.z1, { kind: 'rock', name: 'armour' });
    const along = a.x1 - a.x0 > a.z1 - a.z0;
    const n = Math.floor((along ? a.x1 - a.x0 : a.z1 - a.z0) / 2.4);
    for (let k = 0; k < n; k += 1) {
      const t = (k + 0.5) / n;
      const x = along ? a.x0 + (a.x1 - a.x0) * t : (a.x0 + a.x1) / 2 + r.range(-1, 1);
      const z = along ? (a.z0 + a.z1) / 2 + r.range(-1, 1) : a.z0 + (a.z1 - a.z0) * t;
      tetrapod(I, x, 1.6, z, 1.25, r);
    }
  }
  for (const L of LIGHTS) {
    I.post(L.m, L.x, L.z, BW_TOP, BW_TOP + 9, 1.3, { kind: 'wall', name: L.name });
    I.cyl('arWhite', [L.x, BW_TOP + 3, L.z], [L.x, BW_TOP + 4.2, L.z], 1.34, 12);
    I.cyl('arGlass', [L.x, BW_TOP + 9, L.z], [L.x, BW_TOP + 10.3, L.z], 0.75, 8);
    I.ball(L.m === 'arRed' ? 'arLampRed' : 'arLampGreen', L.x, BW_TOP + 9.6, L.z, 0.45);
    I.cone(L.m, L.x, BW_TOP + 10.3, L.z, 0.95, 0.8, 10);
    I.post('arIron', L.x, L.z, BW_TOP + 10.3, BW_TOP + 11.6, 0.05, { kind: 'pole', name: 'light rod' });
  }
  /* The pier on its piles. */
  const P = PIER;
  I.box('arBoardPale', P.x0, P.deck0, P.z0, P.x1, P.deck1, P.z1, { kind: 'wall', name: 'pier deck' });
  for (let z = P.z0 + 2; z < P.z1; z += 4) {
    for (const x of P.piles) {
      I.post('arBoard', x, z, -1, P.deck0, 0.18, { kind: 'pole', name: 'pile' });
    }
  }
  I.post('arIron', P.x0 + 0.3, P.z1 - 0.5, P.deck1, P.deck1 + 4, 0.07, { kind: 'pole', name: 'pier lamp' });
  I.ball('arLamp', P.x0 + 0.3, P.deck1 + 4.1, P.z1 - 0.5, 0.25);
  I.dress(() => {
    for (let z = P.z0 + 1; z < P.z1; z += 0.6) {
      I.paint('arBoard', P.x0, P.deck1, z, P.x1, P.deck1 + 0.02, z + 0.05);
    }
  });
  /* The sheds and the cooperative. */
  for (const s of SHEDS) {
    shed(I, s, r);
  }
  coop(I);
  /* Boats: two moored, one hauled out on the quay on its blocks. */
  boat(I, 40.5, 44.5, 106, 118, 0, true, r);
  boat(I, 84, 88.4, 112, 125, 0, true, r);
  boat(I, 66, 69.5, 104, 114, 0, false, r);
  I.box('arWood', 108.5, QUAY_TOP, 87.6, 112.5, QUAY_TOP + 0.5, 88.4, { kind: 'wall', name: 'blocks' });
  I.box('arWood', 108.5, QUAY_TOP, 94.6, 112.5, QUAY_TOP + 0.5, 95.4, { kind: 'wall', name: 'blocks' });
  boat(I, 108.5, 112.5, 86, 97.6, QUAY_TOP + 0.5 + 0.6, true, r);
  /* The racks of salmon, and kelp laid out in rows on the apron. */
  rack(I, 33, 46, 89, r);
  rack(I, 92, 104, 89, r);
  I.dress(() => {
    for (let z = 86; z < 96; z += 1.1) {
      I.paint('arKelp', 66, QUAY_TOP, z, 80, QUAY_TOP + 0.03, z + 0.45);
    }
    /* Fish boxes stacked, floats in heaps, a net piled. */
    for (let k = 0; k < 5; k += 1) {
      const bx = 49 + k * 1.05;
      for (let h = 0; h < 1 + (k % 3); h += 1) {
        I.deco(h % 2 ? 'arYellow' : 'arFishBox', bx, QUAY_TOP + h * 0.33, 85.5, bx + 0.95, QUAY_TOP + 0.3 + h * 0.33, 86.2);
      }
    }
    for (let k = 0; k < 9; k += 1) {
      I.ball(k % 3 ? 'arOrange' : 'arYellow', 86 + (k % 3) * 0.7, QUAY_TOP + 0.35 + Math.floor(k / 3) * 0.45, 86 + (k % 2) * 0.5, 0.36);
    }
    I.ball('arNet', 125, QUAY_TOP, 90, 1.6, 0.55);
    I.ball('arSnow', 30, QUAY_TOP, 86, 2.2, 0.4);
    I.ball('arSnow', 127, QUAY_TOP, 85.5, 1.8, 0.5);
  });
  /* The road along the back, its edge lines, and its snow banks. */
  I.paint('arAsphalt', ROAD.x0, y, ROAD.z0, ROAD.x1, y + 0.04, ROAD.z1);
  I.paint('arLine', ROAD.x0, y + 0.04, ROAD.z0 + 0.3, ROAD.x1, y + 0.06, ROAD.z0 + 0.45);
  I.paint('arLine', ROAD.x0, y + 0.04, ROAD.z1 - 0.45, ROAD.x1, y + 0.06, ROAD.z1 - 0.3);
  I.dress(() => {
    for (let x = ROAD.x0 + 2; x < ROAD.x1; x += 6.5) {
      if (x > 108 && x < 132) {
        continue;
      }
      I.ball('arSnow', x, y, ROAD.z0 - 0.8, r.range(1.2, 2.0), 0.4);
    }
  });
  /* Street lamps along the quay side of the road. */
  for (let x = 30; x < 130; x += 24) {
    I.post('arSteel', x, ROAD.z1 + 1.2, y, y + 6.5, 0.09, { kind: 'pole', name: 'lamp' });
    I.cap('arSteel', [x, y + 6.4, ROAD.z1 + 1.2], [x, y + 6.4, ROAD.z1 - 0.4], 0.06, { kind: 'pole', name: 'lamp arm' });
    I.box('arLamp', x - 0.25, y + 6.2, ROAD.z1 - 0.7, x + 0.25, y + 6.35, ROAD.z1 - 0.2, { solid: false });
  }
  /* The poles and their wires, along the north side of the road. */
  const tops = [];
  for (let x = 24; x < 134; x += 28) {
    tops.push(pole(I, x, ROAD.z0 - 1.6, y));
  }
  for (let k = 0; k + 1 < tops.length; k += 1) {
    wires(I, tops[k], tops[k + 1]);
  }
  /* The bus stop by the cooperative: a shelter, a bench, its sign. */
  I.box('arTinBlue', 98, y + 2.4, ROAD.z0 - 3.4, 102, y + 2.55, ROAD.z0 - 1.6, { kind: 'wall', name: 'shelter roof' });
  I.post('arSteel', 98.2, ROAD.z0 - 3.2, y, y + 2.4, 0.06, { kind: 'pole', name: 'shelter post' });
  I.post('arSteel', 101.8, ROAD.z0 - 3.2, y, y + 2.4, 0.06, { kind: 'pole', name: 'shelter post' });
  I.box('arTinBlue', 98, y, ROAD.z0 - 3.5, 102, y + 2.4, ROAD.z0 - 3.35, { kind: 'wall', name: 'shelter back' });
  I.post('arSteel', 103, ROAD.z0 - 1.0, y, y + 2.6, 0.04, { kind: 'pole', name: 'bus stop' });
  I.sign('bus', 103, y + 2.3, ROAD.z0 - 0.95, 0.6, 0.6, '+z');
  /* The houses up the slope. */
  const homes = [
    [-6, 42, 8, 7, 'arTinRed', 'arWallCream'], [8, 30, 7, 7, 'arTinBlue', 'arWallWhite'],
    [-22, 58, 8, 7, 'arTinGreen', 'arWallWhite'], [38, 34, 8, 7, 'arTinBlue', 'arWallCream'],
    [60, 30, 7, 6, 'arTinRed', 'arWallWhite'], [-30, 34, 7, 7, 'arTinRed', 'arWallWhite'],
  ];
  for (const [x, z, w, d, roof, wall] of homes) {
    house(I, x, z, w, d, roof, wall, r);
  }
  /* The bear warning at the foot of the valley path. */
  I.post('arSteel', 20, 48, groundAt(20, 48), groundAt(20, 48) + 2.6, 0.05, { kind: 'pole', name: 'sign post' });
  I.sign('bear', 20, groundAt(20, 48) + 2.3, 48.06, 1.1, 1.1, '+z');
}
