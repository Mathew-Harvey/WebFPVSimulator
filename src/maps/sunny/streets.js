/*
 * streets.js: Sunnyfield's streets, kerbs and pavements, and the furniture a
 * street has: crossings, a double yellow line down Main Street, stop signs,
 * two sets of traffic lights, hydrants, manholes, drains, street name
 * blades, benches, bins, a bus shelter. Pure, as ./frame.js is.
 *
 * THE NETWORK, plan metres, every carriageway 9 m (two lanes of 4.5) with a
 * 3 m pavement each side, its kerb 12 cm up:
 *
 *   Main Street   py 126, the whole width of the plot, east to west.
 *   Oak Street    px 50, from the south edge to Main and on north to the
 *                 dump's gate.
 *   Pine Street   px 296, from the south edge to Main.
 *   Maple Avenue  py 24, between Oak and Pine.
 *   Birch Lane    py 86, east off Oak into the cul-de-sac's turning circle.
 *   Mill Road     px 236, north off Main to the gate at the foot of the hill.
 *   Plant Road    px 352, north off Main to the power plant's gate.
 *
 * The carriageway is paint on the grass; the pavement is solid, so a quad
 * landed on it sits on it. The cars (./yard.js) drive the loop of Oak, Main,
 * Pine and Maple on the right, the way the town they belong to drives.
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

export const HALF = 4.5;
export const WALK = 3;
export const KERB = 0.12;
const ROAD_H = 0.02;

export const MAIN_Y = 126;
export const OAK_X = 50;
export const PINE_X = 296;
export const MAPLE_Y = 24;
export const BIRCH_Y = 86;
export const MILL_X = 236;
export const PLANT_X = 352;
export const OAK_END = 206;
export const MILL_END = 180;
export const PLANT_END = 152;
export const BIRCH_END = 226;
export const BULB = { px: 236, py: 86, r: 13 };

/* The carriageways, [px0, py0, px1, py1]. */
export const ROADS = [
  [0, MAIN_Y - HALF, W, MAIN_Y + HALF],
  [OAK_X - HALF, 0, OAK_X + HALF, MAIN_Y - HALF],
  [OAK_X - HALF, MAIN_Y + HALF, OAK_X + HALF, OAK_END],
  [PINE_X - HALF, 0, PINE_X + HALF, MAIN_Y - HALF],
  [OAK_X + HALF, MAPLE_Y - HALF, PINE_X - HALF, MAPLE_Y + HALF],
  [OAK_X + HALF, BIRCH_Y - HALF, BIRCH_END, BIRCH_Y + HALF],
  [MILL_X - HALF, MAIN_Y + HALF, MILL_X + HALF, MILL_END],
  [PLANT_X - HALF, MAIN_Y + HALF, PLANT_X + HALF, PLANT_END],
];

const MN = MAIN_Y + HALF;
const MS = MAIN_Y - HALF;

/* The pavements, [px0, py0, px1, py1], each a strip along a carriageway
 * stopped at the next one across it. */
export const WALKS = [
  /* Main Street, north side and south side */
  [0, MN, OAK_X - HALF, MN + WALK], [OAK_X + HALF, MN, MILL_X - HALF, MN + WALK],
  [MILL_X + HALF, MN, PLANT_X - HALF, MN + WALK], [PLANT_X + HALF, MN, W, MN + WALK],
  [0, MS - WALK, OAK_X - HALF, MS], [OAK_X + HALF, MS - WALK, PINE_X - HALF, MS], [PINE_X + HALF, MS - WALK, W, MS],
  /* Oak Street, south of Main */
  [OAK_X - HALF - WALK, 0, OAK_X - HALF, MS - WALK],
  [OAK_X + HALF, 0, OAK_X + HALF + WALK, MAPLE_Y - HALF],
  [OAK_X + HALF, MAPLE_Y + HALF, OAK_X + HALF + WALK, BIRCH_Y - HALF],
  [OAK_X + HALF, BIRCH_Y + HALF, OAK_X + HALF + WALK, MS - WALK],
  /* Oak Street, north of Main, to the dump */
  [OAK_X - HALF - WALK, MN + WALK, OAK_X - HALF, OAK_END],
  [OAK_X + HALF, MN + WALK, OAK_X + HALF + WALK, OAK_END],
  /* Pine Street */
  [PINE_X - HALF - WALK, 0, PINE_X - HALF, MAPLE_Y - HALF],
  [PINE_X - HALF - WALK, MAPLE_Y + HALF, PINE_X - HALF, MS - WALK],
  [PINE_X + HALF, 0, PINE_X + HALF + WALK, MS - WALK],
  /* Maple Avenue */
  [OAK_X + HALF + WALK, MAPLE_Y - HALF - WALK, PINE_X - HALF - WALK, MAPLE_Y - HALF],
  [OAK_X + HALF + WALK, MAPLE_Y + HALF, PINE_X - HALF - WALK, MAPLE_Y + HALF + WALK],
  /* Birch Lane, to the turning circle */
  [OAK_X + HALF + WALK, BIRCH_Y - HALF - WALK, BIRCH_END, BIRCH_Y - HALF],
  [OAK_X + HALF + WALK, BIRCH_Y + HALF, BIRCH_END, BIRCH_Y + HALF + WALK],
  /* Mill Road and Plant Road */
  [MILL_X - HALF - WALK, MN + WALK, MILL_X - HALF, MILL_END],
  [MILL_X + HALF, MN + WALK, MILL_X + HALF + WALK, MILL_END],
  [PLANT_X - HALF - WALK, MN + WALK, PLANT_X - HALF, PLANT_END],
  [PLANT_X + HALF, MN + WALK, PLANT_X + HALF + WALK, PLANT_END],
];

/* The crossings: [px, py, axis] where axis is the way the stripes run
 * (the way a walker crosses). */
const CROSSINGS = [
  [OAK_X - HALF - 3.2, MAIN_Y, 'y'], [OAK_X + HALF + 3.2, MAIN_Y, 'y'], [OAK_X, MS - 3.2, 'x'], [OAK_X, MN + 3.2, 'x'],
  [PINE_X - HALF - 3.2, MAIN_Y, 'y'], [PINE_X + HALF + 3.2, MAIN_Y, 'y'], [PINE_X, MS - 3.2, 'x'],
  [MILL_X - HALF - 3.2, MAIN_Y, 'y'], [MILL_X + HALF + 3.2, MAIN_Y, 'y'],
  [PLANT_X - HALF - 3.2, MAIN_Y, 'y'], [PLANT_X + HALF + 3.2, MAIN_Y, 'y'],
  [OAK_X, MAPLE_Y + HALF + 2.6, 'x'], [PINE_X, MAPLE_Y + HALF + 2.6, 'x'],
];

/* Where the utility poles stand, for ./yard.js: the residential streets'
 * verges, so their wires run the length of each street. */
export const POLES = [
  ...[12, 40, 68, 96].map((py) => [OAK_X - HALF - 0.7, py]),
  ...[80, 112, 144, 176, 208, 240, 272].map((px) => [px, MAPLE_Y - HALF - 0.7]),
  ...[78, 108, 138, 168, 198].map((px) => [px, BIRCH_Y + HALF + 0.7]),
  ...[12, 40, 68, 96].map((py) => [PINE_X + HALF + 0.7, py]),
];

/* The street lamps down Main Street, both sides, staggered. */
export const LAMPS = [
  ...[18, 76, 104, 132, 160, 188, 216, 256, 284, 314, 380].map((px) => [px, MN + 0.8, -Math.PI / 2]),
  ...[30, 90, 118, 146, 174, 202, 230, 262, 316, 344, 372].map((px) => [px, MS - 0.8, Math.PI / 2]),
];

function crossing(T, px, py, axis) {
  /* Eight bars a metre long, half a metre apart, across the carriageway. */
  for (let k = -4; k < 4; k += 1) {
    const a = k * 1.1 + 0.25;
    if (axis === 'y') {
      T.paint('sfPaint', px - 1.3, py + a, ROAD_H, px + 1.3, py + a + 0.6, ROAD_H + 0.006);
    } else {
      T.paint('sfPaint', px + a, py - 1.3, ROAD_H, px + a + 0.6, py + 1.3, ROAD_H + 0.006);
    }
  }
}

/* A hydrant: a red barrel with a cap and two nozzles. */
function hydrant(T, px, py) {
  T.post('sfRed', px, py, KERB, KERB + 0.75, 0.14, { kind: 'pole', name: 'hydrant' });
  T.cyl('sfRed', [px, py, KERB + 0.75], [px, py, KERB + 0.86], 0.17, 8, 0.07, true);
  T.cyl('sfRed', [px - 0.25, py, KERB + 0.5], [px + 0.25, py, KERB + 0.5], 0.06, 6, null, true);
  T.cyl('sfTrim', [px, py, KERB + 0.12], [px, py, KERB + 0.18], 0.17, 8, null, true);
}

/* A stop sign at a corner, facing the traffic coming at it. */
function stopSign(T, px, py, face) {
  T.post('sfSteel', px, py, KERB, KERB + 2.6, 0.04, { kind: 'pole', name: 'sign post' });
  T.sign('stop', px, py, KERB + 2.3, 0.75, 0.75, face, face === 'n' || face === 'e' ? 0.05 : 0.05);
}

/* A street name blade pair on a post at a corner. */
function nameBlades(T, px, py, a, b) {
  T.post('sfSteel', px, py, KERB, KERB + 3.0, 0.04, { kind: 'pole', name: 'name post' });
  T.sign(a, px, py, KERB + 2.85, 1.4, 0.25, 's', 0.03);
  T.sign(a, px, py, KERB + 2.85, 1.4, 0.25, 'n', 0.03);
  T.sign(b, px, py, KERB + 2.55, 1.4, 0.25, 'e', 0.03);
  T.sign(b, px, py, KERB + 2.55, 1.4, 0.25, 'w', 0.03);
}

/* Traffic lights on a mast arm over the carriageway: the mast at (px, py),
 * the arm reaching `reach` along the plan axis, three heads hung off it. */
function signals(T, px, py, axis, reach) {
  const top = KERB + 6.2;
  T.post('sfIron', px, py, KERB, top + 0.2, 0.13, { kind: 'pole', name: 'signal mast' });
  const end = axis === 'x' ? [px + reach, py, top] : [px, py + reach, top];
  T.cap('sfIron', [px, py, top], end, 0.08, { kind: 'pole', name: 'signal arm' });
  for (const f of [0.45, 0.8]) {
    const hx = axis === 'x' ? px + reach * f : px;
    const hy = axis === 'x' ? py : py + reach * f;
    T.box('sfYellow', hx - 0.2, hy - 0.2, top - 1.3, hx + 0.2, hy + 0.2, top - 0.1, { kind: 'pole', name: 'signal head' });
    /* The three lamps, both ways along the street the arm crosses. */
    const lens = axis === 'x' ? ['n', 's'] : ['e', 'w'];
    for (const face of lens) {
      T.sign('lampRed', hx, hy, top - 0.35, 0.24, 0.24, face, 0.21);
      T.sign('lampAmber', hx, hy, top - 0.7, 0.24, 0.24, face, 0.21);
      T.sign('lampGreen', hx, hy, top - 1.05, 0.24, 0.24, face, 0.21);
    }
  }
}

/* A bench on the pavement, its back to `back` ('n', 's', 'e', 'w'). */
export function bench(T, px, py, back) {
  const along = back === 'n' || back === 's';
  const [hw, hd] = along ? [0.9, 0.25] : [0.25, 0.9];
  T.box('sfWood', px - hw, py - hd, KERB + 0.42, px + hw, py + hd, KERB + 0.48, { kind: 'wall', name: 'bench' });
  T.hidden(px - hw, py - hd, KERB, px + hw, py + hd, KERB + 0.42, 'wall', 'bench legs');
  for (const s of [-1, 1]) {
    if (along) {
      T.deco('sfIron', px + s * (hw - 0.1) - 0.04, py - hd, KERB, px + s * (hw - 0.1) + 0.04, py + hd, KERB + 0.42, true);
    } else {
      T.deco('sfIron', px - hw, py + s * (hd - 0.1) - 0.04, KERB, px + hw, py + s * (hd - 0.1) + 0.04, KERB + 0.42, true);
    }
  }
  const o = { n: [0, hd], s: [0, -hd], e: [hw, 0], w: [-hw, 0] }[back];
  if (along) {
    T.box('sfWood', px - hw, py + o[1] - 0.04 * Math.sign(o[1]), KERB + 0.5, px + hw, py + o[1], KERB + 0.95, { kind: 'wall', name: 'bench back' });
  } else {
    T.box('sfWood', px + o[0] - 0.04 * Math.sign(o[0]), py - hd, KERB + 0.5, px + o[0], py + hd, KERB + 0.95, { kind: 'wall', name: 'bench back' });
  }
}

/* A litter bin: a green drum. */
export function bin(T, px, py, h = KERB) {
  T.post('sfDoorGreen', px, py, h, h + 0.9, 0.3, { kind: 'wall', name: 'bin' });
  T.cyl('sfIron', [px, py, h + 0.9], [px, py, h + 0.97], 0.33, 10, null, true);
}

/* The bus shelter on Main Street's south pavement, facing the road. */
function busShelter(T, px, py) {
  const y0 = py - 1.2;
  const y1 = py + 0.4;
  /* The roof, and the back and ends of glass on steel posts. */
  T.box('sfSteel', px - 2.2, y0 - 0.1, KERB + 2.4, px + 2.2, y1 + 0.2, KERB + 2.55, { kind: 'wall', name: 'shelter roof' });
  for (const x of [px - 2.1, px + 2.1]) {
    for (const y of [y0, y1]) {
      T.post('sfSteel', x, y, KERB, KERB + 2.4, 0.05, { kind: 'pole', name: 'shelter post' });
    }
  }
  T.box('sfGlass', px - 2.1, y0 - 0.03, KERB + 0.15, px + 2.1, y0 + 0.03, KERB + 2.3, { kind: 'wall', name: 'shelter glass' });
  T.box('sfGlass', px - 2.13, y0, KERB + 0.15, px - 2.07, y1, KERB + 2.3, { kind: 'wall', name: 'shelter glass' });
  T.box('sfGlass', px + 2.07, y0, KERB + 0.15, px + 2.13, y1, KERB + 2.3, { kind: 'wall', name: 'shelter glass' });
  T.sign('busStop', px, y0, KERB + 1.5, 1.8, 1.0, 'n', 0.04);
  T.box('sfWood', px - 1.6, y0 + 0.05, KERB + 0.45, px + 1.6, y0 + 0.45, KERB + 0.5, { solid: false, fine: true });
  /* The stop's own pole at the kerb. */
  T.post('sfSteel', px + 3.2, py + 1.2, KERB, KERB + 2.8, 0.04, { kind: 'pole', name: 'stop pole' });
  T.sign('busFlag', px + 3.2, py + 1.2, KERB + 2.5, 0.5, 0.6, 'e', 0.05);
  T.sign('busFlag', px + 3.2, py + 1.2, KERB + 2.5, 0.5, 0.6, 'w', 0.05);
}

/* A newspaper box, a postbox. */
function streetBoxes(T, px, py) {
  T.box('sfDoorNavy', px - 0.3, py - 0.25, KERB, px + 0.3, py + 0.25, KERB + 1.15, { kind: 'wall', name: 'mailbox' });
  T.cyl('sfDoorNavy', [px - 0.3, py, KERB + 1.15], [px + 0.3, py, KERB + 1.15], 0.25, 10, null, true);
  T.box('sfRed', px + 0.5, py - 0.22, KERB, px + 0.95, py + 0.22, KERB + 1.0, { kind: 'wall', name: 'news box' });
  T.paint('sfGlass', px + 0.55, py - 0.23, KERB + 0.55, px + 0.9, py - 0.22, KERB + 0.85, true);
}

export function streets(T) {
  /* The carriageways, then the turning circle on top. */
  for (const [x0, y0, x1, y1] of ROADS) {
    T.paint('sfAsphalt', x0, y0, 0, x1, y1, ROAD_H);
  }
  T.disc('sfWalk', BULB.px, BULB.py, BULB.r + WALK, 0, KERB, 40);
  T.disc('sfAsphalt', BULB.px, BULB.py, BULB.r, 0, KERB + 0.004, 40);
  /* The turning circle's island: a round bed of grass with a tree. */
  T.disc('sfWalk', BULB.px, BULB.py, 4.2, 0, KERB + 0.06, 24);
  T.disc('sfLawn', BULB.px, BULB.py, 3.9, 0, KERB + 0.065, 24);
  T.hidden(BULB.px - 2.7, BULB.py - 2.7, 0, BULB.px + 2.7, BULB.py + 2.7, KERB + 0.06, 'wall', 'island');
  /* The ring of pavement round the circle is drawn and not solid: a box
   * wholly inside a ring three metres wide is too small to matter, and one
   * that covered it would stand out past the concrete. */

  /* The pavements, solid, a kerb's height. */
  for (const [x0, y0, x1, y1] of WALKS) {
    T.box('sfWalk', x0, y0, 0, x1, y1, KERB, { kind: 'wall', name: 'pavement' });
  }

  /* Main Street's double yellow, and the dashes down the side streets. */
  const breaks = [OAK_X, MILL_X, PINE_X, PLANT_X].map((x) => [x - HALF - 6.5, x + HALF + 6.5]);
  let from = 0;
  for (const [b0, b1] of [...breaks, [W, W]]) {
    if (b0 > from) {
      T.paint('sfLine', from, MAIN_Y - 0.25, ROAD_H, b0, MAIN_Y - 0.13, ROAD_H + 0.004);
      T.paint('sfLine', from, MAIN_Y + 0.13, ROAD_H, b0, MAIN_Y + 0.25, ROAD_H + 0.004);
    }
    from = b1;
  }
  for (let py = 4; py < MS - 6; py += 6) {
    if (Math.abs(py - MAPLE_Y) > 7 && Math.abs(py - BIRCH_Y) > 7) {
      T.paint('sfPaint', OAK_X - 0.07, py, ROAD_H, OAK_X + 0.07, py + 3, ROAD_H + 0.004, true);
      if (Math.abs(py - MAPLE_Y) > 7) {
        T.paint('sfPaint', PINE_X - 0.07, py, ROAD_H, PINE_X + 0.07, py + 3, ROAD_H + 0.004, true);
      }
    }
  }
  for (let px = OAK_X + 10; px < PINE_X - 10; px += 6) {
    T.paint('sfPaint', px, MAPLE_Y - 0.07, ROAD_H, px + 3, MAPLE_Y + 0.07, ROAD_H + 0.004, true);
  }
  for (const [px, py, axis] of CROSSINGS) {
    crossing(T, px, py, axis);
  }
  /* The stop lines where the side streets meet Main. */
  for (const x of [OAK_X, PINE_X]) {
    T.paint('sfPaint', x + 0.2, MS - 6.6, ROAD_H, x + HALF, MS - 6.2, ROAD_H + 0.006);
  }
  T.paint('sfPaint', OAK_X - HALF, MN + 6.2, ROAD_H, OAK_X - 0.2, MN + 6.6, ROAD_H + 0.006);
  T.paint('sfPaint', MILL_X - HALF, MN + 6.2, ROAD_H, MILL_X - 0.2, MN + 6.6, ROAD_H + 0.006);
  T.paint('sfPaint', PLANT_X - HALF, MN + 6.2, ROAD_H, PLANT_X - 0.2, MN + 6.6, ROAD_H + 0.006);

  /* Manholes and drains. */
  for (const px of [24, 70, 120, 170, 214, 262, 320, 372]) {
    T.disc('sfIron', px, MAIN_Y + (px % 2 ? 2.1 : -2.1), 0.42, 0, ROAD_H + 0.006, 12, true);
  }
  for (const px of [36, 84, 140, 196, 250, 330, 388]) {
    T.paint('sfIron', px - 0.45, MS - 0.05, 0, px + 0.45, MS + 0.35, ROAD_H + 0.006, true);
    T.paint('sfIron', px + 3 - 0.45, MN - 0.35, 0, px + 3 + 0.45, MN + 0.05, ROAD_H + 0.006, true);
  }

  /* Hydrants on the kerb's edge. */
  const hydrants = [
    [OAK_X + HALF + 0.5, 50], [OAK_X - HALF - 0.5, 104], [PINE_X - HALF - 0.5, 60], [PINE_X + HALF + 0.5, 30],
    [120, MAPLE_Y + HALF + 0.5], [210, MAPLE_Y - HALF - 0.5], [150, BIRCH_Y - HALF - 0.5], [96, MN + 0.5],
    [204, MS - 0.5], [326, MN + 0.5], [MILL_X + HALF + 0.5, 160], [OAK_X + HALF + 0.5, 180],
  ];
  for (const [px, py] of hydrants) {
    hydrant(T, px, py);
  }

  /* Stop signs where every side street meets the one it ends on. */
  stopSign(T, OAK_X + HALF + 0.8, MS - 1.2, 's');
  stopSign(T, PINE_X - HALF - 0.8, MS - 1.2, 's');
  stopSign(T, MILL_X - HALF - 0.8, MN + 1.2, 'n');
  stopSign(T, PLANT_X - HALF - 0.8, MN + 1.2, 'n');
  stopSign(T, OAK_X - HALF - 0.8, MN + 1.2, 'n');
  stopSign(T, OAK_X + HALF + 1.2, MAPLE_Y - HALF - 0.8, 'w');
  stopSign(T, PINE_X - HALF - 1.2, MAPLE_Y + HALF + 0.8, 'e');
  stopSign(T, OAK_X + HALF + 1.2, BIRCH_Y + HALF + 0.8, 'w');

  /* Street name blades at the corners. */
  nameBlades(T, OAK_X + HALF + 1.6, MS - 1.6, 'stMain', 'stOak');
  nameBlades(T, PINE_X + HALF + 1.6, MS - 1.6, 'stMain', 'stPine');
  nameBlades(T, MILL_X + HALF + 1.6, MN + 1.6, 'stMain', 'stMill');
  nameBlades(T, PLANT_X + HALF + 1.6, MN + 1.6, 'stMain', 'stPlant');
  nameBlades(T, OAK_X + HALF + 1.6, MAPLE_Y + HALF + 1.6, 'stMaple', 'stOak');
  nameBlades(T, PINE_X - HALF - 1.6, MAPLE_Y - HALF - 1.6, 'stMaple', 'stPine');
  nameBlades(T, OAK_X + HALF + 1.6, BIRCH_Y - HALF - 1.6, 'stBirch', 'stOak');

  /* Traffic lights at the two crossroads on Main. */
  signals(T, OAK_X + HALF + 1.0, MS - 1.0, 'y', 3.6);
  signals(T, OAK_X - HALF - 1.0, MN + 1.0, 'y', -3.6);
  signals(T, PINE_X + HALF + 1.0, MS - 1.0, 'x', -4.2);

  /* The bus stop, benches and bins along Main. */
  busShelter(T, 182, MS - 1.6);
  bench(T, 112, MN + 2.3, 'n');
  bench(T, 252, MN + 2.3, 'n');
  bench(T, 338, MS - 2.3, 's');
  for (const [px, py] of [[66, MN + 0.6], [140, MN + 0.6], [226, MN + 0.6], [300, MN + 0.6], [100, MS - 0.6], [270, MS - 0.6], [362, MS - 0.6]]) {
    bin(T, px, py);
  }
  streetBoxes(T, 128, MS - 1.5);
  streetBoxes(T, 270, MN + 1.4);
}
