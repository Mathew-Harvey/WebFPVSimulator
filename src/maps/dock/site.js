/*
 * site.js: where everything in Kamome Wharf stands, in the plan's frame
 * (./frame.js), as numbers and nothing else, so every file that builds a
 * piece of the port and every check that sweeps one reads the same figures.
 *
 * THE PLACE is a container berth on a reclaimed pier of the kind Yokohama's
 * Honmoku and Kobe's Port Island are built of, and none of them in
 * particular: from south to north, the landside (the brick warehouse, the
 * drivers' rest stop, the gate, the office and its control cab), the yard
 * (three blocks of stacks under rail gantries, the reefer rack, the empties),
 * the apron (the quay cranes on their rails, the hatch lids, the drift road),
 * the quay's edge, and the harbour with the ship alongside, a tug and the
 * breakwater's red light. The port tower stands on the plaza at the quay's
 * west end, where the pilot starts.
 *
 * THE SIZES ARE THE REAL ONES (the figures and where each came from are in
 * the pull request and in ../../../PROGRESS.md):
 *
 *   an ISO container    6.058 or 12.192 m long, 2.438 m wide, 2.591 m high
 *                       (ISO 668)
 *   a quay crane        rail gauge 30.48 m (100 ft), legs about 18 m apart
 *                       along the rail so a 40 ft box turns between them,
 *                       the boom 45 to 48 m up and reaching 50 to 60 m out
 *                       past the waterside rail
 *   a yard stack        six rows a block, one to five high
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

import { QUAY_Y } from './frame.js';

/* ---- the boxes ---- */

/* ISO 668: the 20 ft and 40 ft lengths, the width, the standard height. */
export const BOX = { l20: 6.058, l40: 12.192, w: 2.438, h: 2.591 };
/* A yard's bay is a 20 ft box and the gap a straddle needs beside it; a
 * 40 ft box takes two bays. Rows are a third of a metre apart. */
export const BAY = 6.5;
export const ROW = BOX.w + 0.32;

/* ---- the yard ---- */

/* The three blocks, west to east, each thirteen bays long, and the cross
 * roads between them. */
export const BLOCKS = [{ x0: 24, name: 'A' }, { x0: 132, name: 'B' }, { x0: 240, name: 'C' }].map((b) => ({ ...b, x1: b.x0 + 13 * BAY }));
export const BLOCK_BAYS = 13;

/* A band is six rows of stacks along the block. Two bands make a double
 * block with the CANYON between them, the 3.6 m aisle a straddle carrier
 * would drive and a pilot flies; double blocks are seven metre truck lanes
 * apart, which is where the rail gantries' legs run. */
export const ROWS = 6;
export const BAND = ROWS * BOX.w + (ROWS - 1) * 0.32;
export const CANYON = 3.6;
export const LANE = 7.0;
const DB_Y0 = 54;
export const DOUBLES = [0, 1, 2].map((k) => {
  const y0 = DB_Y0 + k * (2 * BAND + CANYON + LANE);
  return { y0, y1: y0 + 2 * BAND + CANYON, canyon: [y0 + BAND, y0 + BAND + CANYON] };
});
export const BANDS = DOUBLES.flatMap((d, k) => [
  { y0: d.y0, y1: d.y0 + BAND, db: k, side: 's' },
  { y0: d.canyon[1], y1: d.y1, db: k, side: 'n' },
]);
export const YARD_Y1 = DOUBLES[2].y1;

/* The rail gantries, two to a double block, each straddling it with its
 * legs in the lanes either side: { db, x } the middle of its legs along
 * the block. 22 m to the top of the girders, a spreader over a stack of
 * five. */
export const GANTRY = { half: 4.0, legOut: 2.2, top: 22, girder: 2.0, leg: 1.0 };
export const GANTRIES = [
  { db: 0, x: 62 }, { db: 0, x: 292 },
  { db: 1, x: 182 }, { db: 1, x: 230 },
  { db: 2, x: 52 }, { db: 2, x: 150 },
];

/* The reefer rack and the empties, east of the blocks. The rack is a steel
 * frame of three walkways between two rows of plugged in reefers. */
export const REEFER = { x0: 348, x1: 348 + 6 * 13, y0: 58, rows: 4, tiers: 3, rack: 3.0 };
export const EMPTIES = { x0: 352, bays: 11, y0: 102, walls: 4, rows: 2, gap: 4.2 };

/* The high mast floodlights. */
export const MASTS = [
  [120.3, 93.6], [228.3, 93.6], [120.3, 136.7], [228.3, 136.7], [336.5, 93.6], [336.5, 136.7],
  [100, 204], [160, 206], [252, 206], [341, 204], [12, 120], [430, 60],
];

/* ---- the apron ---- */

/* The crane rails: the landside one, and the waterside one four metres in
 * from the quay's edge, 30.5 m apart. */
export const RAIL_L = 213.5;
export const RAIL_W = 244.0;
/* The quay cranes, west to east: each one's middle along the rail, where
 * its trolley is parked, and whether its boom is down over the ship or
 * raised for the night. */
export const CRANES = [
  { cx: 120, trolley: 236.5, load: true, raised: false, n: 1 },
  { cx: 205, trolley: 206, load: false, raised: false, n: 2 },
  { cx: 290, trolley: 228, load: false, raised: true, n: 3 },
];
export const CR = {
  legX: 9.0, legW: 1.6, legD: 2.0, bogie: 3.0, bogieH: 1.4,
  portal: 14.0, tie: 2.2, mid: 30.0, midT: 1.6,
  girder: 45.0, girderD: 3.0, girderX: 5.4, girderW: 1.4,
  back: 182, hinge: 246, tip: 302, apex: 72, apexY: 236, apexX: 7.0,
  house: [184, 199], houseH: 6.0, raise: 0.27,
};

/* The road the drift cars run, round the apron: down the backreach, a
 * kink round the hatch lids under crane two's machinery, out to the east
 * end, back west between the cranes' legs under the portals, and round
 * the plaza end. Plan points; ./doc.js makes them relative. */
export const DRIFT_ROAD = [
  [70, 188], [150, 188], [175, 198], [235, 198], [260, 188], [392, 188],
  [410, 199], [410, 219], [394, 229], [70, 229], [56, 215], [56, 201],
];
export const DRIFT_WIDTH = 8;

/* The hatch lids lifted off the ship, stacked on the apron: { x, y, n }. */
export const HATCH_STACKS = [{ x: 180, y: 206.9, n: 3 }, { x: 330, y: 206.9, n: 2 }, { x: 352, y: 206.9, n: 4 }];
export const HATCH = { w: 12.8, d: 9.8, t: 0.9 };

/* ---- the harbour ---- */

/* The ship alongside: hull from the stern's transom to where the bow
 * begins to narrow, and the bow's point; its two sides; its main deck. */
export const SHIP = {
  x0: 66, x1: 300, bow: 315, y0: 256, y1: 288, deck: 8.0, keel: -7.0,
  bays: 15, bayX0: 101, bayPitch: 13.0, rows: 12,
  house: { x0: 76, x1: 94, y0: 260, y1: 284, top: 32, wing: 28.0 },
  funnel: { x0: 67, x1: 73, y0: 267, y1: 277, top: 38 },
  fo: { x0: 295.7, h: 11.0 },
};
/* The black rubber fenders on the quay's face. */
export const FENDER = { out: 0.9, w: 1.4, h0: -3.0, h1: -0.2, every: 14 };

export const TUG = { x0: 14, x1: 42, y: 300, beam: 9 };
export const BREAKWATER = { x0: 340, x1: 470, y0: 314, y1: 322, light: [352, 318] };

/* ---- the landside ---- */

export const FENCE_Y = 46;
export const GATE = { x0: 206, x1: 246, y0: 30, y1: 44, lanes: 5, lane: 4.2, island: 2.0, h: 6.2 };
export const WAREHOUSE = { x0: 20, x1: 130, y0: 10, y1: 30, wall: 11, ridge: 15.5, pass: [71, 79], passH: 6.2 };
export const REST = { x0: 146, x1: 160, y0: 16, y1: 23, h: 3.0 };
export const OFFICE = { x0: 268, x1: 312, y0: 10, y1: 28, h: 12.4, core: [298, 306, 15, 23], cab: [292, 312, 9, 29], cab0: 24, cab1: 28.6 };

/* The port tower on the plaza at the quay's west end. */
export const TOWER = { px: 24, py: 196, r0: 9, r1: 6, h1: 52, members: 16, twist: 120, deck0: 52, deck1: 58, roof: 60.5, top: 68 };

/* Where the pilot starts: the plaza, facing east, the three cranes'
 * portals in a line ahead. */
export const SPAWN = { px: 38, py: 219.5, h: 0.03, deg: 0 };

export { QUAY_Y };
