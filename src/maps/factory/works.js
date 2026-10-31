/*
 * works.js: the heavy end of Hamakaze Works, the half that makes steel. The
 * canal basin and its quay, the unloader gantry over a moored barge, the
 * No. 2 steel shop with its overhead crane and the ladle hanging from it,
 * the red and white stack and the flue that feeds it, the ore and coal
 * yard, the long belt up to the transfer tower and the enclosed gallery
 * that carries the belt from the tower into the steel shop's gable.
 *
 * WHAT IT IS MODELLED ON. A works of the Keihin coast, the reclaimed
 * shoreline between Tokyo and Yokohama where steel, oil and power stand
 * shoulder to shoulder on islands cut by canals: low sheds of corrugated
 * sheet a hundred metres long, belt galleries strung between towers, a
 * stack banded red and white because Japanese air law asks it of anything
 * that tall, pipes on racks along every road, and the quay at the end of
 * every one of them. The sizes are a works', not a game's: see SIZES.
 * Nothing here is anybody's plant; the layout is ours, drawn to fly.
 *
 * SIZES, and where each came from. A melt shop's crane runway sits 10 to
 * 14 m up and its eaves 16 to 22 m (steel mill building practice, the
 * AISE Technical Report 13 range); ours are 11 to 12 and 18. A pipe rack's
 * tiers stand 5 to 6 m and 3 to 4 m apart, the bottom tier high enough for
 * a truck under it (process plant layout guides, the 6 m road clearance
 * most Japanese plants paint on their pipe bridges); ours are 6 and 10. A
 * stack this side of 60 m wears seven bands of red and white (the Civil
 * Aeronautics Act's daytime marking); ours is 52 m with seven.
 *
 * THE FLIGHT LINES, which are the reason for the numbers below.
 *
 *   1. THROUGH THE MELT SHOP, west to east: a 16 m door in each gable,
 *      14 m high, a hundred metres of shed between them, the hanging
 *      ladle and the furnace to one side of the line and the rail car
 *      under it.
 *   2. OVER THE CRANE: between the crane's girders (14 m) and the roof
 *      trusses' bottom chords (16.8 m), east to west the length of the
 *      shed, on the side of the bridge the trolley is not.
 *   3. THE GALLERY: in at the tower's middle floor, along the belt for
 *      sixty metres inside a tube 3.6 m wide, over the plant road, and out
 *      through the hole it makes in the steel shop's east gable, under the
 *      first truss and down.
 *   4. THE GANTRY DUCK: east to west through the unloader's leg frame,
 *      between its two portal ties.
 *   5. UNDER THE FLUE, the low duct from the shop to the stack, and
 *      THROUGH THE TOWER, the transfer tower's open first storey.
 *   6. The long belt up from the coal yard, flown under, over or along.
 *
 * THE GAP RULE, the town's: a leftover between two solids is 0, a shared
 * face, or at least 1.4 m. scripts/factory-check.js finds the slots.
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

import { W } from './frame.js';
import { ringSolid } from './plant.js';

/* ------------------------------------------------------------------ *
 * The places, in plan metres, for the other files and the checks.
 * ------------------------------------------------------------------ */

/* The basin: its quay walls, its water, the floor a craft lands on there. */
export const CANAL = { y0: 3, y1: 20, water: -2.6 };

/* The quay apron and the road along it. */
export const QUAY = { y0: 20, y1: 40, road0: 25, road1: 35 };

/* The unloader: its two leg lines on the rails, its legs' x, its girder. */
export const GANTRY = { x0: 86, x1: 98, yA: 22, yB: 38, sill: 20, girder: 22, top: 24.5, tie0: 8.0, tie1: 8.8, tie2: 12, tie3: 13 };

/* The moored barge, in the basin under the unloader's outreach. */
export const BARGE = { x0: 70, x1: 118, y0: 6, y1: 16, deck: -1.2 };

/* No. 2 steel shop. */
export const HALL = {
  x0: 24, x1: 124, y0: 56, y1: 92, eave: 18, ridge: 19.8, ridgeY: 74,
  doorY0: 66, doorY1: 82, doorH: 14, bay: 10, wall: 0.4,
  runway: 11, crane: 12, craneTop: 14, chord: 16.8,
};

/* The overhead crane: its bridge's x, the trolley's y, the ladle under it. */
export const CRANE = { x: 70, trolleyY: 62, ladleH0: 3.5, ladleH1: 6.8, ladleR: 2.0 };

/* The hole where the roof sheets are off, over one bay of the south slope. */
export const ROOF_HOLE = { x0: 54, x1: 64, y0: 60, y1: 68 };

/* The stack and its flue from the shop. */
export const STACK = { px: 112, py: 106, r0: 3.0, r1: 1.8, h: 52, bands: 7 };
export const FLUE = { x0: 110.8, x1: 113.2, y0: 92.4, y1: 103.6, h0: 4.6, h1: 7.0 };

/* The transfer tower, its floors, and the gallery from it into the shop. */
export const TOWER = { x0: 186, x1: 194, y0: 70, y1: 78, floors: [8, 16, 24], roof: 27 };
export const GALLERY = { x0: HALL.x1 + HALL.wall, x1: TOWER.x0, y0: 72.5, y1: 76.5, floor: 16, roof: 19.2, belt: 16.8 };

/* The long belt from the yard to the tower's top floor. */
export const BELT = { x0: 300, x1: TOWER.x1 + 0.5, y: 74, h0: 1.0, h1: 24.3 };

/* The yard's three heaps: { o, i, h, m } the foot, the crest, the height. */
export const HEAPS = [
  { o: { x0: 210, y0: 46, x1: 250, y1: 66 }, i: { x0: 220, y0: 53, x1: 240, y1: 59 }, h: 9, m: 'fkOre' },
  { o: { x0: 260, y0: 46, x1: 306, y1: 66 }, i: { x0: 271, y0: 53, x1: 295, y1: 59 }, h: 8, m: 'fkCoal' },
  { o: { x0: 242, y0: 82, x1: 306, y1: 104 }, i: { x0: 254, y0: 89, x1: 294, y1: 97 }, h: 10, m: 'fkOre' },
];

/* The belt's height at plan x. */
export function beltAt(px) {
  const t = (px - BELT.x0) / (BELT.x1 - BELT.x0);
  return BELT.h0 + (BELT.h1 - BELT.h0) * t;
}

/* The roof's top at plan y: a straight rise of one in ten to the ridge. */
const ROOF_T = 0.25;
const OVERHANG = 0.6;
function roofAt(py) {
  const run = Math.abs(py - HALL.ridgeY);
  return HALL.ridge - (HALL.ridge - HALL.eave) * (run / (HALL.ridgeY - HALL.y0));
}

/* ------------------------------------------------------------------ *
 * The basin and the quay.
 * ------------------------------------------------------------------ */

function basin(T) {
  const { y0, y1, water } = CANAL;
  /* The quay walls, from the water to the apron, and their copings. The
   * north one is the quay the works stands on; the south one the far bank. */
  T.box('fkQuay', 0, y1 - 0.4, water, W, y1, 0, { name: 'quay wall' });
  T.box('fkQuay', 0, y0, water, W, y0 + 0.4, 0, { name: 'far quay wall' });
  T.box('fkQuay', 0, y0 + 0.4, water, 0.4, y1 - 0.4, 0, { name: 'basin end' });
  T.box('fkQuay', W - 0.4, y0 + 0.4, water, W, y1 - 0.4, 0, { name: 'basin end' });
  T.box('concreteWorn', 0, y1 - 0.6, 0, W, y1 + 0.6, 0.3, { name: 'quay coping' });
  T.box('concreteWorn', 0, y0 - 0.4, 0, W, y0 + 0.6, 0.3, { name: 'far coping' });
  /* The water, a hand's breadth over the floor the plant is given. */
  T.paint('fkWater', 0.4, y0 + 0.4, water, W - 0.4, y1 - 0.4, water + 0.01);
  T.wide(() => {
    T.dress(() => {
      /* The tide line and the weed on the quay faces. */
      T.paint('fkWaterDeep', 0.4, y1 - 0.42, water + 0.01, W - 0.4, y1 - 0.4, water + 0.7);
      T.paint('fkWaterDeep', 0.4, y0 + 0.4, water + 0.01, W - 0.4, y0 + 0.42, water + 0.7);
    });
  });
  T.dress(() => {
    /* Fenders down the quay face, bollards along its edge, and a ladder
     * every sixty metres, the furniture of every berth. */
    for (let x = 6; x < W - 4; x += 12) {
      T.deco('fkFender', x, y1 - 0.75, water + 0.3, x + 1.4, y1 - 0.4, -0.5);
    }
    for (let x = 12; x < W - 6; x += 18) {
      T.cyl('fkFender', [x, y1 + 0.3, 0.3], [x, y1 + 0.3, 0.95], 0.22, 8);
      T.cyl('fkFender', [x, y1 + 0.3, 0.95], [x, y1 + 0.3, 1.05], 0.32, 8);
    }
    for (let x = 30; x < W; x += 60) {
      for (const s of [-0.25, 0.25]) {
        T.deco('fkRail', x + s - 0.03, y1 - 0.46, water + 0.2, x + s + 0.03, y1 - 0.4, 0.9);
      }
      for (let h = water + 0.5; h < 0.6; h += 0.35) {
        T.deco('fkRail', x - 0.25, y1 - 0.46, h, x + 0.25, y1 - 0.42, h + 0.04);
      }
    }
  });
  /* The apron's road and its paint: the quay is a road a lorry backs down. */
  T.paint('asphalt', 0, QUAY.road0, 0, W, QUAY.road1, 0.012);
  T.wide(() => {
    T.dress(() => {
      for (let x = 2; x < W; x += 6) {
        T.paint('lineWhite', x, (QUAY.road0 + QUAY.road1) / 2 - 0.07, 0.012, x + 3, (QUAY.road0 + QUAY.road1) / 2 + 0.07, 0.016);
      }
      T.paint('fkFloorLine', 0, QUAY.y1 - 0.2, 0.012, W, QUAY.y1 - 0.05, 0.016);
      /* The unloader's two rails, flush in the apron. */
      for (const y of [GANTRY.yA, GANTRY.yB]) {
        T.paint('fkSteelDark', 30, y - 0.05, 0.012, 160, y + 0.05, 0.03);
      }
    });
  });
}

/* ------------------------------------------------------------------ *
 * The barge, its hold and the coils in it.
 * ------------------------------------------------------------------ */

function barge(T) {
  const { x0, x1, y0, y1, deck } = BARGE;
  const w = CANAL.water;
  /* The hull to its deck, black with a red boot top, solid. */
  T.box('fkFender', x0, y0, w, x1, y1, deck, { name: 'barge hull' });
  T.dress(() => {
    T.paint('fkRed', x0 - 0.01, y0 - 0.01, w + 0.01, x1 + 0.01, y1 + 0.01, w + 0.3);
  });
  /* The hold's coaming, four low walls round the cargo. */
  const hx0 = x0 + 5;
  const hx1 = x1 - 8;
  T.box('fkSteelDark', hx0, y0 + 0.8, deck, hx1, y0 + 1.1, deck + 0.9, { name: 'coaming' });
  T.box('fkSteelDark', hx0, y1 - 1.1, deck, hx1, y1 - 0.8, deck + 0.9, { name: 'coaming' });
  T.box('fkSteelDark', hx0, y0 + 1.1, deck, hx0 + 0.3, y1 - 1.1, deck + 0.9, { name: 'coaming' });
  T.box('fkSteelDark', hx1 - 0.3, y0 + 1.1, deck, hx1, y1 - 1.1, deck + 0.9, { name: 'coaming' });
  /* Coils in two rows on the hold's floor, lying along the barge. Each is
   * solid as the box inside its round. */
  for (let i = 0; i < 6; i += 1) {
    for (const yc of [y0 + 3.3, y1 - 3.3]) {
      const xc = hx0 + 3 + i * 5.4;
      coil(T, xc, yc, deck, 'x');
    }
  }
  /* The wheelhouse aft, solid, with its windows and a mast. */
  const sx0 = x1 - 6;
  T.box('fkWhite', sx0, y0 + 2, deck, x1 - 1, y1 - 2, deck + 3.4, { name: 'wheelhouse' });
  T.box('fkSteelDark', sx0 - 0.2, y0 + 1.8, deck + 3.4, x1 - 0.8, y1 - 1.8, deck + 3.6, { name: 'wheelhouse roof' });
  T.dress(() => {
    T.wide(() => {
      for (let k = 0; k < 3; k += 1) {
        const yy = y0 + 2.6 + k * 1.7;
        T.paint('glassDark', sx0 - 0.02, yy, deck + 2.1, sx0, yy + 1.2, deck + 3.0);
      }
    });
    T.cyl('fkSteelDark', [x1 - 3, (y0 + y1) / 2, deck + 3.6], [x1 - 3, (y0 + y1) / 2, deck + 7], 0.08, 6);
    T.ball('lampRed', x1 - 3, (y0 + y1) / 2, deck + 7.1, 0.14);
    /* The mooring lines to the bollards, hanging slack. */
    T.wire('rope', [x0 + 1, y1 - 0.5, deck + 0.4], [x0 - 3, CANAL.y1 + 0.3, 0.9], 0.6, 0.04);
    T.wire('rope', [x1 - 1, y1 - 0.5, deck + 0.4], [x1 + 4, CANAL.y1 + 0.3, 0.9], 0.6, 0.04);
  });
}

/* A steel coil, its axis along plan x or y, standing on h. */
function coil(T, xc, yc, h, axis, r = 0.9, len = 1.4) {
  const k = r * 0.7;
  if (axis === 'x') {
    T.box('fkLag', xc - len / 2, yc - k, h, xc + len / 2, yc + k, h + 2 * k, { name: 'coil', draw: false });
    T.cyl('fkLag', [xc - len / 2, yc, h + r], [xc + len / 2, yc, h + r], r, 12);
    T.cyl('fkSteelDark', [xc - len / 2 - 0.01, yc, h + r], [xc + len / 2 + 0.01, yc, h + r], r * 0.35, 10);
  } else {
    T.box('fkLag', xc - k, yc - len / 2, h, xc + k, yc + len / 2, h + 2 * k, { name: 'coil', draw: false });
    T.cyl('fkLag', [xc, yc - len / 2, h + r], [xc, yc + len / 2, h + r], r, 12);
    T.cyl('fkSteelDark', [xc, yc - len / 2 - 0.01, h + r], [xc, yc + len / 2 + 0.01, h + r], r * 0.35, 10);
  }
}

/* ------------------------------------------------------------------ *
 * The unloader gantry.
 * ------------------------------------------------------------------ */

function gantry(T) {
  const G = GANTRY;
  const legs = [[G.x0, G.yA], [G.x1, G.yA], [G.x0, G.yB], [G.x1, G.yB]];
  for (const [x, y] of legs) {
    /* The bogie on its rail and the leg on the bogie. */
    T.box('fkYellow', x - 1.6, y - 0.7, 0, x + 1.6, y + 0.7, 0.9, { name: 'gantry bogie' });
    T.box('fkYellow', x - 0.5, y - 0.5, 0.9, x + 0.5, y + 0.5, G.sill, { name: 'gantry leg' });
    T.dress(() => {
      for (const dx of [-1.0, 1.0]) {
        T.cyl('fkSteelDark', [x + dx, y - 0.72, 0.4], [x + dx, y + 0.72, 0.4], 0.38, 10);
      }
    });
  }
  /* The sills along each rail, tying a leg pair at the top. */
  for (const y of [G.yA, G.yB]) {
    T.box('fkYellow', G.x0 - 0.5, y - 0.5, G.sill, G.x1 + 0.5, y + 0.5, G.girder, { name: 'gantry sill' });
  }
  /* The portal ties, two at each leg line, and the slot between them is
   * the duck: 3.2 m between the low tie's top and the high tie's foot. */
  for (const x of [G.x0, G.x1]) {
    T.box('fkYellow', x - 0.4, G.yA + 0.5, G.tie0, x + 0.4, G.yB - 0.5, G.tie1, { name: 'gantry tie' });
    T.box('fkYellow', x - 0.4, G.yA + 0.5, G.tie2, x + 0.4, G.yB - 0.5, G.tie3, { name: 'gantry tie' });
  }
  /* The two box girders, out over the basin and back over the apron. */
  const gy0 = 1.0;
  const gy1 = QUAY.y1 + 6;
  T.box('fkYellow', G.x0 - 0.5, gy0, G.girder, G.x0 + 1.0, gy1, G.top, { name: 'gantry girder' });
  T.box('fkYellow', G.x1 - 1.0, gy0, G.girder, G.x1 + 0.5, gy1, G.top, { name: 'gantry girder' });
  T.box('fkYellow', G.x0 - 0.5, gy1 - 1.2, G.girder, G.x1 + 0.5, gy1, G.top, { name: 'gantry end beam' });
  T.box('fkYellow', G.x0 - 0.5, gy0, G.girder, G.x1 + 0.5, gy0 + 1.0, G.top, { name: 'gantry end beam' });
  /* The machinery house on the back reach, and the trolley out over the
   * barge with its cab slung under. */
  T.box('fkWhite', G.x0 + 1.0, gy1 - 8, G.top, G.x1 - 1.0, gy1 - 1.2, G.top + 3.2, { name: 'machinery house' });
  T.box('fkSteelDark', G.x0 + 0.8, gy1 - 8.2, G.top + 3.2, G.x1 - 0.8, gy1 - 1.0, G.top + 3.45, { name: 'machinery roof' });
  const ty = (BARGE.y0 + BARGE.y1) / 2;
  T.box('fkYellow', G.x0 - 0.3, ty - 2.5, G.top, G.x1 + 0.3, ty + 2.5, G.top + 2.2, { name: 'trolley' });
  T.box('fkWhite', G.x0 + 1.4, ty + 2.6, G.girder - 2.8, G.x0 + 4.2, ty + 5.0, G.girder - 0.2, { name: 'operator cab' });
  T.box('fkSteelDark', G.x0 + 1.0, ty + 2.6, G.girder - 0.2, G.x0 + 1.4, ty + 3.0, G.girder, { name: 'cab hanger' });
  /* The grab, open over the hold, on its four ropes. */
  const gx = (G.x0 + G.x1) / 2;
  const grabH = 2.2;
  T.box('fkSteelDark', gx - 1.2, ty - 1.0, grabH, gx + 1.2, ty + 1.0, grabH + 1.4, { name: 'grab' });
  for (const [dx, dy] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]]) {
    T.cap('rope', [gx + dx, ty + dy, grabH + 1.4], [gx + dx, ty + dy, G.top], 0.05, { name: 'hoist rope', kind: 'pole' });
  }
  T.dress(() => {
    /* The grab's jaws, open, and its sheave head. */
    for (const s of [-1, 1]) {
      T.prism('fkSteelDark', 'x', [[ty + s * 1.0, grabH + 0.2], [ty + s * 2.0, grabH - 1.4], [ty + s * 1.5, grabH - 1.6], [ty + s * 0.6, grabH + 0.2]].map(([a, h]) => [a, h]), gx - 1.1, gx + 1.1);
    }
    T.cyl('fkYellow', [gx - 0.9, ty, grabH + 1.6], [gx + 0.9, ty, grabH + 1.6], 0.35, 10);
    /* The cab's windows, the walkway along the girders with its yellow
     * rail, and the warning lamps at the girder's tip. */
    T.paint('glassDark', G.x0 + 1.38, ty + 2.8, G.girder - 2.4, G.x0 + 1.4, ty + 4.8, G.girder - 1.0);
    T.paint('glassDark', G.x0 + 1.6, ty + 4.98, G.girder - 2.4, G.x0 + 4.0, ty + 5.0, G.girder - 1.0);
    for (const x of [G.x0 - 1.4, G.x1 + 1.4]) {
      T.deco('grating', x - 0.6, gy0, G.top - 0.12, x + 0.6, gy1, G.top);
      T.deco('fkRail', x + (x < gx ? -0.6 : 0.56), gy0, G.top + 1.0, x + (x < gx ? -0.56 : 0.6), gy1, G.top + 1.06);
      for (let y = gy0 + 1; y < gy1; y += 3) {
        T.deco('fkRail', x + (x < gx ? -0.6 : 0.56), y, G.top, x + (x < gx ? -0.56 : 0.6), y + 0.06, G.top + 1.0);
      }
    }
    T.ball('lampRed', G.x0, gy0 + 0.4, G.top + 0.3, 0.2);
    T.ball('lampRed', G.x1, gy0 + 0.4, G.top + 0.3, 0.2);
    /* Ladders up two legs, as every leg of every gantry has. */
    for (const [x, y] of [legs[0], legs[3]]) {
      const lx = x + (x < gx ? -0.56 : 0.5);
      for (const dy of [-0.3, 0.3]) {
        T.deco('fkSteelDark', lx, y + dy - 0.03, 0.9, lx + 0.06, y + dy + 0.03, G.sill);
      }
      for (let h = 1.2; h < G.sill; h += 0.6) {
        T.deco('fkSteelDark', lx, y - 0.3, h, lx + 0.06, y + 0.3, h + 0.04);
      }
    }
    /* The hazard stripes on the bogies, which every quay crane wears. */
    for (const [x, y] of legs) {
      T.paint('hazard', x - 1.62, y - 0.72, 0.1, x + 1.62, y + 0.72, 0.7);
    }
  });
  T.sign('crane', gx, gy1 + 0.02, G.girder + 1.2, 6.4, 1.6, 'n');
  T.sign('crane', gx, gy0 - 0.02, G.girder + 1.2, 6.4, 1.6, 's');
}

/* ------------------------------------------------------------------ *
 * No. 2 steel shop.
 * ------------------------------------------------------------------ */

/* The roof between plan y a and b over x e0 to e1, a skin ROOF_T thick
 * that rises from the eaves to the ridge and falls again. */
function roofPiece(T, e0, e1, a, b) {
  const pts = [a];
  if (a < HALL.ridgeY && b > HALL.ridgeY) {
    pts.push(HALL.ridgeY);
  }
  pts.push(b);
  const top = pts.map((y) => [y, roofAt(y)]);
  const bottom = [...pts].reverse().map((y) => [y, roofAt(y) - ROOF_T]);
  T.prism('sheetBlueRib', 'x', [...top, ...bottom], e0, e1);
}

/* The roof's solid over x e0 to e1, y a to b: stepped boxes, each from
 * the skin's underside at its low edge to the skin's top at its high
 * edge, so the solid never stands more than a step's rise proud of what
 * is drawn. */
function roofSolid(T, e0, e1, a, b) {
  const STEP = 1.5;
  for (let y = a; y < b - 1e-6; y += STEP) {
    const y1 = Math.min(b, y + STEP);
    const lo = Math.min(roofAt(y), roofAt(y1));
    const hi = Math.max(roofAt(y), roofAt(y1));
    T.hidden(e0, y, lo - ROOF_T, e1, y1, hi, 'wall', 'shop roof');
  }
}

/* A long wall of the shop between x a and b at the face y0 to y1: block to
 * three metres, sheet to the eaves, and a band of windows between. Bays
 * listed in `open` have their glass gone, and those are entries. */
function longWall(T, y0, y1, outward, open) {
  const { x0, x1, eave } = HALL;
  T.box('block', x0, y0, 0, x1, y1, 3, { name: 'shop dado' });
  T.box('sheetBlue', x0, y0, 3, x1, y1, 13, { name: 'shop cladding' });
  T.box('sheetBlue', x0, y0, 15.6, x1, y1, eave, { name: 'shop cladding' });
  for (let k = 0; k < (x1 - x0) / HALL.bay; k += 1) {
    const b0 = x0 + k * HALL.bay;
    if (open.includes(k)) {
      /* The bay's mullions are gone with the glass: the band is open
       * from column to column, 9.2 by 2.6 m. */
      T.box('sheetBlue', b0, y0, 13, b0 + 0.4, y1, 15.6, { name: 'shop pier' });
      T.box('sheetBlue', b0 + HALL.bay - 0.4, y0, 13, b0 + HALL.bay, y1, 15.6, { name: 'shop pier' });
      continue;
    }
    T.box('glassDark', b0, y0, 13, b0 + HALL.bay, y1, 15.6, { name: 'shop windows', kind: 'wall' });
  }
  T.wide(() => {
    T.dress(() => {
      /* The ribs of the sheet, standing proud every 0.8 m, and the sill
       * and head of the window band. */
      const f = outward < 0 ? y0 - 0.06 : y1;
      const g = outward < 0 ? y0 : y1 + 0.06;
      for (let x = x0 + 0.4; x < x1; x += 0.8) {
        T.paint('sheetBlueRib', x, f, 3.05, x + 0.12, g, 12.95);
        T.paint('sheetBlueRib', x, f, 15.65, x + 0.12, g, eave - 0.05);
      }
      T.paint('trim', x0, f - 0.04 * -outward, 12.9, x1, g + 0.04 * outward, 13.1);
      T.paint('trim', x0, f - 0.04 * -outward, 15.5, x1, g + 0.04 * outward, 15.7);
      /* Rust run down from the sill, three bays in five. */
      for (let k = 0; k < 10; k += 1) {
        if ((k * 3) % 5 < 3) {
          const b0 = x0 + k * HALL.bay + 1 + ((k * 7) % 5);
          T.paint('fkRust', b0, f - 0.02 * -outward, 10.4 - (k % 3), b0 + 0.35, g + 0.02 * outward, 12.9);
        }
      }
      /* The mullions of the glazed bays. */
      for (let k = 0; k < 10; k += 1) {
        if (open.includes(k)) {
          continue;
        }
        for (let m = 1; m < 5; m += 1) {
          const x = x0 + k * HALL.bay + m * 2;
          T.paint('trim', x - 0.05, f - 0.04 * -outward, 13, x + 0.05, g + 0.04 * outward, 15.6);
        }
      }
    });
  });
}

/* A gable: block and sheet to the eaves round its door, then the triangle
 * to the ridge, drawn and stepped solid, except where `hole` ({ y0, y1,
 * h0, h1 }) is cut through it. */
function gable(T, e0, e1, outward, hole = null) {
  const { y0, y1, eave, doorY0, doorY1, doorH } = HALL;
  T.box('block', e0, y0 - HALL.wall, 0, e1, doorY0, 3, { name: 'gable dado' });
  T.box('block', e0, doorY1, 0, e1, y1 + HALL.wall, 3, { name: 'gable dado' });
  T.box('sheetBlue', e0, y0 - HALL.wall, 3, e1, doorY0, eave, { name: 'gable' });
  T.box('sheetBlue', e0, doorY1, 3, e1, y1 + HALL.wall, eave, { name: 'gable' });
  const pieces = hole ? [[doorY0, hole.y0], [hole.y1, doorY1]] : [[doorY0, doorY1]];
  for (const [a, b] of pieces) {
    T.box('sheetBlue', e0, a, doorH, e1, b, eave, { name: 'gable head' });
  }
  if (hole) {
    T.box('sheetBlue', e0, hole.y0, doorH, e1, hole.y1, hole.h0, { name: 'gable head' });
  }
  /* The triangle: up to the roof's underside. */
  const tri = hole ? [[y0 - HALL.wall, hole.y0], [hole.y1, y1 + HALL.wall]] : [[y0 - HALL.wall, y1 + HALL.wall]];
  for (const [a, b] of tri) {
    const pts = [a];
    if (a < HALL.ridgeY && b > HALL.ridgeY) {
      pts.push(HALL.ridgeY);
    }
    pts.push(b);
    const prof = [[a, eave], ...pts.map((y) => [y, roofAt(y) - ROOF_T]), [b, eave]];
    T.prism('sheetBlue', 'x', prof, e0, e1);
    for (let y = a; y < b - 1e-6; y += 1.5) {
      const yb = Math.min(b, y + 1.5);
      const hi = Math.min(roofAt(y), roofAt(yb)) - ROOF_T;
      if (hi > eave + 0.05) {
        T.hidden(e0, y, eave, e1, yb, hi, 'wall', 'gable');
      }
    }
  }
  T.wide(() => {
    T.dress(() => {
      const f = outward < 0 ? e0 - 0.06 : e1;
      const g = outward < 0 ? e0 : e1 + 0.06;
      for (let y = y0; y < y1; y += 0.8) {
        if (y > doorY0 - 0.2 && y < doorY1 + 0.2) {
          T.paint('sheetBlueRib', f, y, doorH + 0.05, g, y + 0.12, eave - 0.05);
          continue;
        }
        T.paint('sheetBlueRib', f, y, 3.05, g, y + 0.12, eave - 0.05);
      }
      /* The door's steel frame, and the hazard paint up its jambs. */
      T.paint('fkSteelDark', f - 0.04 * -outward, doorY0 - 0.5, 0, g + 0.04 * outward, doorY0, doorH + 0.5);
      T.paint('fkSteelDark', f - 0.04 * -outward, doorY1, 0, g + 0.04 * outward, doorY1 + 0.5, doorH + 0.5);
      T.paint('fkSteelDark', f - 0.04 * -outward, doorY0 - 0.5, doorH, g + 0.04 * outward, doorY1 + 0.5, doorH + 0.5);
      T.paint('hazard', f - 0.06 * -outward, doorY0 - 0.5, 0, g + 0.06 * outward, doorY0, 2.2);
      T.paint('hazard', f - 0.06 * -outward, doorY1, 0, g + 0.06 * outward, doorY1 + 0.5, 2.2);
    });
  });
  /* The two sliding door leaves, run back along the wall either side. */
  const lx0 = outward < 0 ? e0 - 0.5 : e1 + 0.1;
  const lx1 = outward < 0 ? e0 - 0.1 : e1 + 0.5;
  T.box('sheetGreen', lx0, doorY0 - 8.6, 0, lx1, doorY0 - 0.6, doorH - 0.6, { name: 'door leaf' });
  T.box('sheetGreen', lx0, doorY1 + 0.6, 0, lx1, doorY1 + 8.6, doorH - 0.6, { name: 'door leaf' });
  T.dress(() => {
    const f = outward < 0 ? lx0 - 0.04 : lx1;
    const g = outward < 0 ? lx0 : lx1 + 0.04;
    for (const [a, b] of [[doorY0 - 8.6, doorY0 - 0.6], [doorY1 + 0.6, doorY1 + 8.6]]) {
      for (let y = a + 0.4; y < b; y += 0.8) {
        T.paint('sheetGreenRib', f, y, 0.1, g, y + 0.14, doorH - 0.7);
      }
    }
  });
}

function hall(T) {
  const H = HALL;
  const t = H.wall;
  /* The walls. Bays 3, 4 and 7 of the south side and 2 and 6 of the north
   * have their glass out. */
  longWall(T, H.y0 - t, H.y0, -1, [3, 4, 7]);
  longWall(T, H.y1, H.y1 + t, 1, [2, 6]);
  gable(T, H.x0 - t, H.x0, -1);
  gable(T, H.x1, H.x1 + t, 1, { y0: GALLERY.y0, y1: GALLERY.y1, h0: GALLERY.floor - 0.3 });
  /* The roof, drawn in pieces round the hole, and its solid the same. */
  const e0 = H.x0 - t - OVERHANG;
  const e1 = H.x1 + t + OVERHANG;
  const a = H.y0 - t - OVERHANG;
  const b = H.y1 + t + OVERHANG;
  const RH = ROOF_HOLE;
  roofPiece(T, e0, RH.x0, a, b);
  roofPiece(T, RH.x1, e1, a, b);
  roofPiece(T, RH.x0, RH.x1, a, RH.y0);
  roofPiece(T, RH.x0, RH.x1, RH.y1, b);
  roofSolid(T, e0, RH.x0, a, b);
  roofSolid(T, RH.x1, e1, a, b);
  roofSolid(T, RH.x0, RH.x1, a, RH.y0);
  roofSolid(T, RH.x0, RH.x1, RH.y1, b);
  /* The columns at every bay, inside the wall line, the crane runway on
   * their brackets, and the trusses across from column to column. */
  for (let x = H.x0; x <= H.x1 + 1e-6; x += H.bay) {
    const cx0 = Math.max(H.x0, x - 0.4);
    const cx1 = Math.min(H.x1, x + 0.4);
    T.box('fkSteel', cx0, H.y0, 0, cx1, H.y0 + 0.8, H.eave, { name: 'shop column' });
    T.box('fkSteel', cx0, H.y1 - 0.8, 0, cx1, H.y1, H.eave, { name: 'shop column' });
    if (x > H.x0 + 1 && x < H.x1 - 1) {
      T.box('fkSteel', x - 0.2, H.y0 + 0.8, H.chord, x + 0.2, H.y1 - 0.8, H.chord + 0.4, { name: 'truss chord' });
      /* Verticals and diagonals from the chord to the roof, every three
       * metres, so the truss reads as a truss and not a beam. */
      for (let y = H.y0 + 3; y < H.y1 - 2; y += 3) {
        const top = roofAt(y) - ROOF_T - 0.05;
        T.cap('fkSteel', [x, y, H.chord + 0.4], [x, y, top], 0.08, { name: 'truss member', kind: 'pole' });
        const yn = y + 3 < H.y1 - 2 ? y + 3 : null;
        if (yn) {
          const up = y < H.ridgeY ? [x, yn, roofAt(yn) - ROOF_T - 0.05] : [x, y, top];
          const from = y < H.ridgeY ? [x, y, H.chord + 0.4] : [x, yn, H.chord + 0.4];
          T.cap('fkSteel', from, up, 0.06, { name: 'truss member', kind: 'pole' });
        }
      }
    }
  }
  for (const [y0, y1] of [[H.y0 + 0.8, H.y0 + 1.6], [H.y1 - 1.6, H.y1 - 0.8]]) {
    T.box('fkSteelDark', H.x0, y0, H.runway, H.x1, y1, H.crane, { name: 'crane runway' });
  }
  /* The floor, green, and its walkways in yellow. */
  T.paint('fkFloor', H.x0, H.y0, 0.004, H.x1, H.y1, 0.012);
  T.wide(() => {
    T.dress(() => {
      for (const y of [H.doorY0 - 0.3, H.doorY1 + 0.15]) {
        T.paint('fkFloorLine', H.x0 + 1, y, 0.012, H.x1 - 1, y + 0.15, 0.016);
      }
      /* The rail along the middle of the shop, from the west door. */
      for (const y of [(H.doorY0 + H.doorY1) / 2 - 0.55, (H.doorY0 + H.doorY1) / 2 + 0.48]) {
        T.paint('fkSteelDark', 0, y, 0.012, 48, y + 0.07, 0.05);
      }
      /* The ridge vent the whole length of the roof, and skylights. */
      T.deco('sheetBlueRib', e0 + 2, H.ridgeY - 0.7, H.ridge - 0.05, e1 - 2, H.ridgeY + 0.7, H.ridge + 0.55);
      T.deco('sheetBlue', e0 + 2, H.ridgeY - 0.9, H.ridge + 0.55, e1 - 2, H.ridgeY + 0.9, H.ridge + 0.65);
      for (let x = H.x0 + 4; x < H.x1 - 4; x += 10) {
        if (x > RH.x0 - 2 && x < RH.x1 + 2) {
          continue;
        }
        for (const y of [64, 84]) {
          T.paint('glassBlue', x, y - 1, roofAt(y) + 0.01, x + 3, y + 1, roofAt(y) + 0.03);
        }
      }
      /* The torn sheet at the hole's edges, hanging down. */
      for (let x = RH.x0 + 0.5; x < RH.x1; x += 2.2) {
        T.deco('sheetBlueRib', x, RH.y1 - 0.1, roofAt(RH.y1) - 1.6, x + 1.6, RH.y1, roofAt(RH.y1) - 0.2);
      }
    });
  });
  /* The name on the south wall and the warning in the doors. */
  T.sign('hallName', 74, H.y0 - t - 0.02, 8.4, 22, 3.6, 's');
  T.sign('hallName', 74, H.y1 + t + 0.02, 8.4, 22, 3.6, 'n');
  T.sign('overhead', H.x0 - t - 0.02, H.doorY0 - 2.4, 4.2, 1.6, 1.6, 'w');
  T.sign('overhead', H.x1 + t + 0.02, H.doorY1 + 2.4, 4.2, 1.6, 1.6, 'e');
  T.sign('helmet', H.x0 - t - 0.02, H.doorY1 + 2.4, 4.2, 1.6, 1.6, 'w');
  T.sign('noFire', H.x1 + t + 0.02, H.doorY0 - 2.4, 4.2, 1.6, 1.6, 'e');
  T.sign('bayNo', H.x0 - t - 0.02, (H.doorY0 + H.doorY1) / 2, H.doorH + 1.6, 3.2, 1.6, 'w');
  shopInside(T);
}

/* Inside the shop: the crane and its ladle, the furnace, the coils, the
 * rail car, the pulpit. */
function shopInside(T) {
  const H = HALL;
  const C = CRANE;
  /* The crane's bridge: two box girders on their end carriages. */
  const gx = [[C.x - 2.5, C.x - 1.3], [C.x + 1.3, C.x + 2.5]];
  for (const [a, b] of gx) {
    T.box('fkYellow', a, H.y0 + 1.6, H.crane, b, H.y1 - 1.6, H.craneTop, { name: 'crane girder' });
  }
  for (const [y0, y1] of [[H.y0 + 0.8, H.y0 + 2.4], [H.y1 - 2.4, H.y1 - 0.8]]) {
    T.box('fkYellow', C.x - 3.5, y0, H.crane, C.x + 3.5, y1, H.crane + 1.6, { name: 'end carriage' });
  }
  /* The trolley across both girders, and the ladle on its hook. */
  const ty = C.trolleyY;
  T.box('fkYellow', C.x - 3.2, ty - 2.4, H.craneTop, C.x + 3.2, ty + 2.4, H.craneTop + 1.0, { name: 'crane trolley' });
  const hook = C.ladleH1 + 2.2;
  T.box('fkSteelDark', C.x - 0.9, ty - 0.5, hook, C.x + 0.9, ty + 0.5, hook + 1.0, { name: 'hook block' });
  for (const dx of [-0.5, 0.5]) {
    for (const dy of [-0.25, 0.25]) {
      T.cap('rope', [C.x + dx, ty + dy, hook + 1.0], [C.x + dx, ty + dy, H.craneTop], 0.05, { name: 'crane rope', kind: 'pole' });
    }
  }
  /* The ladle's bail, from the hook to the trunnions either side. */
  for (const s of [-1, 1]) {
    T.cap('fkSteelDark', [C.x, ty + s * 0.4, hook], [C.x, ty + s * (C.ladleR + 0.3), C.ladleH1 - 0.6], 0.14, { name: 'ladle bail', kind: 'pole' });
  }
  T.post('fkSoot', C.x, ty, C.ladleH0, C.ladleH1, C.ladleR, { name: 'ladle', kind: 'wall', seg: 14 });
  T.dress(() => {
    T.cyl('fkRust', [C.x, ty, C.ladleH1 - 0.01], [C.x, ty, C.ladleH1 + 0.18], C.ladleR + 0.12, 14);
    T.disc('fkHot', C.x, ty, C.ladleR - 0.15, C.ladleH1 + 0.18, C.ladleH1 + 0.2, 14);
    for (const s of [-1, 1]) {
      T.cyl('fkSteelDark', [C.x, ty + s * C.ladleR, C.ladleH1 - 0.7], [C.x, ty + s * (C.ladleR + 0.45), C.ladleH1 - 0.7], 0.22, 8);
    }
    /* The crane's walkway rail and its cab, slung at the north end. */
    for (const [a] of gx) {
      T.deco('fkRail', a - 0.04, H.y0 + 2.4, H.craneTop + 1.0, a, H.y1 - 2.4, H.craneTop + 1.06);
    }
  });
  T.box('fkWhite', C.x + 1.3, H.y1 - 6, H.crane - 2.6, C.x + 3.7, H.y1 - 3.6, H.crane, { name: 'crane cab' });
  T.dress(() => {
    T.paint('glassDark', C.x + 3.69, H.y1 - 5.8, H.crane - 2.2, C.x + 3.72, H.y1 - 3.8, H.crane - 0.8);
  });
  T.sign('capacity', C.x, H.y1 - 2.4, H.crane + 0.8, 2.6, 0.8, 's', 0.04);
  /* The arc furnace on its platform at the west end, south of the line,
   * with its three electrodes and its fume duct up into the roof. */
  const fx = 40;
  const fy = 61.6;
  T.box('concreteMid', fx - 6, H.y0 + 0.8, 0, fx + 6, 65.4, 1.2, { name: 'furnace platform' });
  T.post('fkSoot', fx, fy, 1.2, 4.6, 3.2, { name: 'furnace', kind: 'wall', seg: 16 });
  T.post('fkSteelDark', fx, fy, 4.6, 5.6, 2.6, { name: 'furnace roof', kind: 'wall', seg: 16 });
  for (let k = 0; k < 3; k += 1) {
    const ex = fx - 1 + k;
    T.post('fkSteelDark', ex, fy, 5.6, 11, 0.32, { name: 'electrode', kind: 'pole', seg: 8 });
  }
  T.box('fkSteel', fx - 1.6, fy - 0.4, 10.2, fx + 1.6, fy + 0.4, 10.8, { name: 'electrode arm' });
  T.post('fkSteel', fx + 4.2, fy, 1.2, 10.8, 0.45, { name: 'electrode mast', kind: 'pole' });
  T.box('fkSteel', fx + 1.6, fy - 0.4, 10.2, fx + 4.6, fy + 0.4, 10.8, { name: 'electrode arm' });
  T.cap('fkSoot', [fx - 3.5, fy, 4.8], [fx - 3.5, fy, roofAt(fy) - ROOF_T - 0.1], 1.0, { name: 'fume duct', kind: 'wall' });
  T.dress(() => {
    T.disc('fkHot', fx, fy, 1.0, 5.6, 5.62, 12);
    T.cyl('fkRust', [fx, fy, 4.55], [fx, fy, 4.75], 3.35, 16);
    T.paint('hazard', fx - 6.02, 65.4, 0.1, fx + 6.02, 65.42, 1.1);
  });
  /* Coils waiting at the east end, in rows along both walls. */
  for (let i = 0; i < 6; i += 1) {
    const x = 96 + i * 4.2;
    coil(T, x, H.y1 - 4, 0, 'y');
    coil(T, x, H.y0 + 4.2, 0, 'y');
  }
  /* The flat car on the rail inside the west door, with two coils. */
  const ry = (H.doorY0 + H.doorY1) / 2;
  T.box('fkSteelDark', H.x0 + 3, ry - 1.3, 0.5, H.x0 + 15, ry + 1.3, 1.2, { name: 'flat car' });
  T.box('fkSteelDark', H.x0 + 4, ry - 1.0, 0, H.x0 + 6, ry + 1.0, 0.5, { name: 'bogie' });
  T.box('fkSteelDark', H.x0 + 12, ry - 1.0, 0, H.x0 + 14, ry + 1.0, 0.5, { name: 'bogie' });
  coil(T, H.x0 + 6.5, ry, 1.2, 'x');
  coil(T, H.x0 + 11.5, ry, 1.2, 'x');
  /* The pulpit on the north wall, where the furnace is run from. */
  T.box('fkWhite', 92, H.y1 - 4, 6, 100, H.y1 - 0.8, 9, { name: 'pulpit' });
  T.dress(() => {
    T.paint('glassDark', 92.2, H.y1 - 4.02, 7, 99.8, H.y1 - 4.0, 8.6);
    for (const x of [93, 99]) {
      T.cyl('fkSteel', [x, H.y1 - 3.6, 6], [x, H.y1 - 1.0, 4.4], 0.1, 6);
    }
  });
  T.dress(() => {
    /* Oxygen and argon cylinders by the furnace, a slag pot, drums. */
    for (let i = 0; i < 6; i += 1) {
      T.cyl(i % 2 ? 'fkGas' : 'fkWaterPipe', [52 + i * 0.32, 58.2, 0], [52 + i * 0.32, 58.2, 1.5], 0.12, 8);
    }
    T.cyl('fkSoot', [56, 60, 0], [56, 60, 1.6], 1.2, 12, 1.5);
    for (let i = 0; i < 5; i += 1) {
      T.cyl(i % 2 ? 'fkTarp' : 'fkRed', [84 + i * 0.7, 89.6, 0], [84 + i * 0.7, 89.6, 0.9], 0.3, 10);
    }
  });
}

/* ------------------------------------------------------------------ *
 * The stack and its flue.
 * ------------------------------------------------------------------ */

function stack(T) {
  const S = STACK;
  const rAt = (h) => S.r0 + (S.r1 - S.r0) * (h / S.h);
  /* Solid in stacked posts, each as wide as the stack at its top, so the
   * solid is inside the taper everywhere. */
  const N = 13;
  for (let k = 0; k < N; k += 1) {
    const h0 = (S.h * k) / N;
    const h1 = (S.h * (k + 1)) / N;
    T.cap('fkWhite', [S.px, S.py, h0], [S.px, S.py, h1], rAt(h1), { name: 'stack', kind: 'wall', draw: false });
  }
  /* Drawn in its seven bands, red at the top and the foot. */
  const band = S.h / S.bands;
  for (let b = 0; b < S.bands; b += 1) {
    T.shell(b % 2 === 0 ? 'fkRed' : 'fkWhite', S.px, S.py, b * band, (b + 1) * band, rAt(b * band), rAt((b + 1) * band), false, null, 24);
  }
  T.shell('fkSoot', S.px, S.py, S.h - 0.02, S.h, rAt(S.h) - 0.3, rAt(S.h), true, null, 24);
  T.disc('fkSoot', S.px, S.py, rAt(S.h) - 0.3, S.h - 2, S.h - 1.9, 16);
  /* The platform two thirds up, solid as a disc, and its rail and lamps. */
  const ph = 40;
  ringSolid(T, 'grating', S.px, S.py, ph - 0.2, ph, rAt(ph) + 1.1, 'stack platform');
  T.dress(() => {
    T.torus('fkRail', S.px, S.py, ph + 1.05, rAt(ph) + 1.05, 0.03, 0, 0, 4, 32);
    for (let k = 0; k < 4; k += 1) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const r = rAt(S.h - 0.5) + 0.15;
      T.ball('lampRed', S.px + r * Math.cos(a), S.py + r * Math.sin(a), S.h - 0.6, 0.22);
      const r2 = rAt(ph) + 1.0;
      T.ball('lampRed', S.px + r2 * Math.cos(a), S.py + r2 * Math.sin(a), ph + 1.2, 0.18);
    }
    /* The ladder up the north face, caged above head height. */
    const lr = (h) => rAt(h) + 0.12;
    T.cyl('fkSteelDark', [S.px - 0.25, S.py + lr(0), 2.2], [S.px - 0.25, S.py + lr(S.h), S.h], 0.03, 4);
    T.cyl('fkSteelDark', [S.px + 0.25, S.py + lr(0), 2.2], [S.px + 0.25, S.py + lr(S.h), S.h], 0.03, 4);
  });
  /* The flue from the shop's north wall, on its two trestles. */
  const F = FLUE;
  T.box('fkSteelDark', F.x0, F.y0, F.h0, F.x1, F.y1, F.h1, { name: 'flue duct' });
  for (const y of [96, 100]) {
    for (const x of [F.x0 + 0.2, F.x1 - 0.2]) {
      T.post('fkSteel', x, y, 0, F.h0, 0.2, { name: 'flue leg', kind: 'pole' });
    }
  }
  T.dress(() => {
    for (let y = F.y0 + 1; y < F.y1; y += 2) {
      T.deco('fkRust', F.x0 - 0.05, y, F.h0 - 0.05, F.x1 + 0.05, y + 0.18, F.h1 + 0.05);
    }
  });
}

/* ------------------------------------------------------------------ *
 * The yard, the belt, the tower and the gallery.
 * ------------------------------------------------------------------ */

function yard(T) {
  for (const hp of HEAPS) {
    T.frustum(hp.m, hp.o, 0, hp.i, hp.h);
    T.frustumSolid(hp.o, 0, hp.i, hp.h, 5, 'heap', 'rock');
  }
  /* The long belt up to the tower: a covered belt on a truss, every member
   * a capsule because it climbs, on four trestles. */
  const B = BELT;
  const hA = B.h0;
  const hB = B.h1;
  T.cap('fkBelt', [B.x0, B.y, hA + 0.5], [B.x1, B.y, hB + 0.5], 0.45, { name: 'belt', kind: 'wall' });
  for (const dy of [-1.1, 1.1]) {
    T.cap('fkSteel', [B.x0, B.y + dy, hA], [B.x1, B.y + dy, hB], 0.12, { name: 'belt chord', kind: 'pole' });
    T.cap('fkSteel', [B.x0, B.y + dy, hA + 1.3], [B.x1, B.y + dy, hB + 1.3], 0.08, { name: 'belt chord', kind: 'pole' });
  }
  for (const x of [280, 260, 240, 220]) {
    const h = beltAt(x);
    for (const dy of [-1.1, 1.1]) {
      T.post('fkSteel', x, B.y + dy, 0, h, 0.22, { name: 'belt trestle', kind: 'pole' });
    }
    T.cap('fkSteel', [x, B.y - 1.1, h * 0.5], [x, B.y + 1.1, h * 0.5], 0.1, { name: 'trestle tie', kind: 'pole' });
  }
  T.dress(() => {
    /* The belt's hood, its walkway rail and its verticals. */
    const steps = 30;
    for (let i = 0; i < steps; i += 1) {
      const xa = B.x0 + ((B.x1 - B.x0) * i) / steps;
      const xb = B.x0 + ((B.x1 - B.x0) * (i + 1)) / steps;
      for (const dy of [-1.1, 1.1]) {
        T.cyl('fkSteel', [xa, B.y + dy, beltAt(xa)], [xa, B.y + dy, beltAt(xa) + 1.3], 0.05, 4);
        T.cyl('fkSteel', [xa, B.y + dy, beltAt(xa)], [xb, B.y + dy, beltAt(xb) + 1.3], 0.04, 4);
      }
      T.cyl('sheetGreen', [xa, B.y, beltAt(xa) + 1.0], [xb, B.y, beltAt(xb) + 1.0], 0.75, 6);
    }
    /* The tail pulley's frame where the belt starts on the ground. */
    T.cyl('fkSteelDark', [B.x0 + 1, B.y - 1.2, 1.4], [B.x0 + 1, B.y + 1.2, 1.4], 0.6, 10);
  });
  /* The hopper the belt is fed from, at the tail end. */
  T.box('fkSteelDark', B.x0 + 2, B.y - 2.2, 0, B.x0 + 6, B.y + 2.2, 3.2, { name: 'feed hopper' });
  T.frustum('fkSteelDark', { x0: B.x0 + 1, y0: B.y - 3, x1: B.x0 + 7, y1: B.y + 3 }, 3.2, { x0: B.x0 + 0.4, y0: B.y - 3.6, x1: B.x0 + 7.6, y1: B.y + 3.6 }, 5.4);
  T.hidden(B.x0 + 1, B.y - 3, 3.2, B.x0 + 7, B.y + 3, 5.4, 'wall', 'hopper');
  tower(T);
  gallery(T);
  T.sign('noEntry', B.x0 + 4, B.y - 2.22, 2, 2.4, 1.2, 's');
}

function tower(T) {
  const R = TOWER;
  /* Four corner columns, three floors and a roof; the sides open. */
  for (const [x, y] of [[R.x0, R.y0], [R.x1, R.y0], [R.x0, R.y1], [R.x1, R.y1]]) {
    const cx = x === R.x0 ? x : x - 0.6;
    const cy = y === R.y0 ? y : y - 0.6;
    T.box('fkSteel', cx, cy, 0, cx + 0.6, cy + 0.6, R.roof, { name: 'tower column' });
  }
  for (const f of R.floors) {
    T.box('concreteMid', R.x0, R.y0, f - 0.3, R.x1, R.y1, f, { name: 'tower floor' });
  }
  T.box('sheetGreen', R.x0 - 0.3, R.y0 - 0.3, R.roof, R.x1 + 0.3, R.y1 + 0.3, R.roof + 0.3, { name: 'tower roof' });
  /* The top storey is clad, the head house over the drive; its west and
   * east faces are open where the belts come in. */
  const top = R.floors[2];
  T.box('sheetGreen', R.x0 + 0.6, R.y0, top, R.x1 - 0.6, R.y0 + 0.2, R.roof, { name: 'head house' });
  T.box('sheetGreen', R.x0 + 0.6, R.y1 - 0.2, top, R.x1 - 0.6, R.y1, R.roof, { name: 'head house' });
  /* The head pulley and the chute down to the gallery's belt. */
  T.box('fkSteelDark', R.x0 + 2, R.y0 + 2.5, top, R.x1 - 1, R.y1 - 2.5, top + 1.6, { name: 'drive' });
  T.box('fkSteelDark', R.x0 + 0.8, R.y0 + 3, GALLERY.floor, R.x0 + 2.8, R.y1 - 3, R.floors[1] + 2.0, { name: 'chute' });
  T.dress(() => {
    for (const f of R.floors) {
      for (const [y0, y1] of [[R.y0 - 0.04, R.y0], [R.y1, R.y1 + 0.04]]) {
        T.deco('fkRail', R.x0, y0, f + 1.0, R.x1, y1, f + 1.06);
        T.deco('fkRail', R.x0, y0, f + 0.5, R.x1, y1, f + 0.55);
      }
      T.paint('hazard', R.x0, R.y0 - 0.02, f - 0.3, R.x1, R.y0, f);
    }
    /* The stair up the south side, a zigzag of flights. */
    for (let k = 0; k < 3; k += 1) {
      const h0 = k * 8;
      T.prism('grating', 'y', [[R.x0 + 0.6, h0 + 0.1], [R.x1 - 0.6, h0 + 7.7], [R.x1 - 0.6, h0 + 7.5], [R.x0 + 0.6, h0 - 0.1]], R.y0 - 1.2, R.y0 - 0.1);
      T.deco('fkRail', R.x0 + 0.6, R.y0 - 1.25, h0 + 1, R.x1 - 0.6, R.y0 - 1.2, h0 + 1.05);
    }
    T.cyl('fkSteelDark', [R.x0 + 3, R.y0 + 2.5, top + 0.8], [R.x0 + 3, R.y1 - 2.5, top + 0.8], 0.75, 12);
    for (let y = R.y0 + 0.4; y < R.y1; y += 0.8) {
      T.paint('sheetGreenRib', R.x0 + 0.6, y, top, R.x0 + 0.62, y + 0.1, R.roof);
    }
  });
  T.sign('tower', (R.x0 + R.x1) / 2, R.y0 - 0.02, top + 1.6, 5.4, 1.4, 's');
}

function gallery(T) {
  const G = GALLERY;
  const H = HALL;
  const t = 0.2;
  /* The tube: floor, two walls, roof; open at both ends. */
  T.box('concreteMid', G.x0, G.y0, G.floor - 0.3, G.x1, G.y1, G.floor, { name: 'gallery floor' });
  T.box('sheetGreen', G.x0, G.y0, G.floor, G.x1, G.y0 + t, G.roof, { name: 'gallery wall' });
  T.box('sheetGreen', G.x0, G.y1 - t, G.floor, G.x1, G.y1, G.roof, { name: 'gallery wall' });
  T.box('sheetGreenRib', G.x0, G.y0 - 0.2, G.roof, G.x1, G.y1 + 0.2, G.roof + 0.3, { name: 'gallery roof' });
  /* The belt along its south side, the walkway along its north. */
  const by0 = G.y0 + t + 0.3;
  const by1 = by0 + 1.3;
  T.box('fkBelt', G.x0, by0, G.floor, G.x1, by1, G.belt, { name: 'gallery belt' });
  /* The truss under the floor and the trestles it stands on, kept clear
   * of the plant road, the branch rack and the steel shop. */
  for (const x of [134, 160, 180]) {
    for (const y of [G.y0 + 0.4, G.y1 - 0.4]) {
      T.post('fkSteel', x, y, 0, G.floor - 0.3, 0.3, { name: 'gallery trestle', kind: 'pole' });
    }
    T.cap('fkSteel', [x, G.y0 + 0.4, 2.5], [x, G.y1 - 0.4, 2.5], 0.12, { name: 'trestle tie', kind: 'pole' });
    T.cap('fkSteel', [x, G.y0 + 0.4, 9], [x, G.y1 - 0.4, 9], 0.12, { name: 'trestle tie', kind: 'pole' });
  }
  T.dress(() => {
    T.wide(() => {
      /* Windows down both walls, outside and in; most are dirty, a few
       * are broken, all of them are the reason the inside is lit. */
      for (let x = G.x0 + 2; x < G.x1 - 2; x += 3) {
        for (const [f, g] of [[G.y0 - 0.02, G.y0], [G.y0 + t, G.y0 + t + 0.02], [G.y1 - t - 0.02, G.y1 - t], [G.y1, G.y1 + 0.02]]) {
          T.paint('glassDark', x, f, G.floor + 1.2, x + 1.6, g, G.floor + 2.4);
        }
      }
      for (let x = G.x0 + 0.5; x < G.x1; x += 0.8) {
        T.paint('sheetGreenRib', x, G.y0 - 0.06, G.floor - 0.3, x + 0.12, G.y0, G.roof);
        T.paint('sheetGreenRib', x, G.y1, G.floor - 0.3, x + 0.12, G.y1 + 0.06, G.roof);
      }
    });
    /* The belt's idlers and the walkway's handrail inside. */
    for (let x = G.x0 + 1; x < G.x1; x += 1.5) {
      T.cyl('fkSteel', [x, by0, G.belt - 0.12], [x, by1, G.belt - 0.12], 0.08, 6);
    }
    T.deco('fkRail', G.x0, by1 + 0.6, G.floor + 1.0, G.x1, by1 + 0.65, G.floor + 1.05);
    for (let x = G.x0 + 2; x < G.x1; x += 4) {
      T.deco('fkRail', x, by1 + 0.6, G.floor, x + 0.05, by1 + 0.65, G.floor + 1.0);
      /* A lamp in the ceiling every four metres. */
      T.paint('fkLamp', x, (G.y0 + G.y1) / 2 - 0.15, G.roof - 0.06, x + 0.9, (G.y0 + G.y1) / 2 + 0.15, G.roof - 0.02);
    }
    /* The truss under the floor, its chords and its zigzag. */
    for (const y of [G.y0 + 0.2, G.y1 - 0.2]) {
      T.cyl('fkSteel', [G.x0, y, G.floor - 1.8], [G.x1, y, G.floor - 1.8], 0.1, 4);
      for (let x = G.x0; x < G.x1 - 3; x += 3) {
        T.cyl('fkSteel', [x, y, G.floor - 1.8], [x + 3, y, G.floor - 0.3], 0.06, 4);
      }
    }
  });
  T.sign('gallery', (H.x1 + 150) / 2 + 10, G.y0 - 0.02, G.floor + 1.8, 4.4, 1.1, 's');
}

/* Everything in this file. */
export function works(T) {
  basin(T);
  barge(T);
  gantry(T);
  hall(T);
  stack(T);
  yard(T);
}
