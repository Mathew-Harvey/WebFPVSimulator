/*
 * yard.js: the document Tsukimi Danchi flies in, as ../sunny/yard.js is
 * Sunnyfield's. The estate itself comes from ./plan.js as one structure of
 * its own; this is what the built map's document format already says well:
 * the plot, the light and the ground, where the pilot starts, the named
 * gaps, and the town's own things round the estate, drawn by the kit in
 * the town's look: the buildings that line the four streets, the concrete
 * poles and their wires, the lamps, the drinks machines, the parked cars,
 * the cherries gone wild in the courtyard, the boiler house's chimney and
 * the containers in the yard behind the annex.
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

import { HAIKYO_DOC_ID } from '../registry.js';
import { W, D, SPAWN, haikyoGaps } from './plan.js';

export const HAIKYO_NAME = 'Tsukimi Danchi';

/* Headings in whole degrees, so a yaw is a product and the same bits
 * everywhere. East 0, north 90, west 180, south 270. */
const DEG = Math.PI / 180;

/* THE STREETS' BUILDINGS, each [px, py, faces, style, width, floors,
 * variant]: a row along each street, facing it, the gaps between them a
 * few metres, which is what a Japanese street is. Depth is 9 throughout. */
const BUILDINGS = [
  /* the south side of the south street, facing north */
  [8, 7.5, 90, 'shop', 13, 2, 1], [23.5, 7.5, 90, 'flats', 10, 3, 2],
  [44, 7.5, 90, 'shop', 10, 2, 3], [57.5, 7.5, 90, 'flats', 12, 4, 1], [71.5, 7.5, 90, 'shop', 11, 3, 4],
  [85, 7.5, 90, 'office', 10, 5, 2], [99, 7.5, 90, 'shop', 12, 2, 5], [113, 7.5, 90, 'flats', 11, 3, 3],
  [127, 7.5, 90, 'shop', 10, 2, 6], [141.5, 7.5, 90, 'office', 12, 6, 1],
  [185, 7.5, 90, 'shop', 10, 2, 7], [199, 7.5, 90, 'flats', 12, 4, 4], [213, 7.5, 90, 'shop', 9, 3, 2],
  /* the west side of the west street, facing east */
  [13, 42, 0, 'flats', 12, 3, 5], [13, 57, 0, 'shop', 11, 2, 8], [13, 72.5, 0, 'office', 13, 5, 3],
  [13, 88, 0, 'shop', 10, 2, 9], [13, 102, 0, 'flats', 12, 4, 6], [13, 116, 0, 'shop', 9, 2, 10],
  [13, 146, 0, 'flats', 12, 3, 7], [13, 162, 0, 'shop', 10, 2, 11],
  /* the north side of the back lane, facing south */
  [46, 145, 270, 'shop', 11, 2, 12], [60, 145, 270, 'flats', 12, 3, 8], [75, 145, 270, 'shop', 10, 2, 13],
  [90, 145, 270, 'office', 13, 4, 4], [106, 145, 270, 'flats', 12, 3, 9], [121, 145, 270, 'shop', 10, 2, 14],
  [136, 145, 270, 'flats', 12, 4, 10], [186, 145, 270, 'shop', 12, 2, 15], [202, 145, 270, 'flats', 12, 3, 11],
  /* beyond the viaduct, facing west, and a taller line behind them */
  [192, 45, 180, 'office', 12, 7, 5], [192, 62, 180, 'flats', 12, 4, 12], [192, 78, 180, 'shop', 10, 2, 16],
  [192, 95, 180, 'office', 13, 5, 6], [192, 112, 180, 'shop', 10, 3, 17],
  [210, 50, 180, 'flats', 14, 7, 13], [210, 90, 180, 'office', 14, 9, 7], [210, 120, 180, 'flats', 12, 6, 14],
];

/* The concrete poles, [px, py], the kit wiring each to the next within
 * 45 m; the lamps, [px, py, faces]; the drinks machines [px, py, faces,
 * count, variant]. */
const POLES = [
  [12, 31.2], [48, 31.2], [82, 31.2], [117, 31.2], [150, 31.2], [190, 31.2],
  [39.6, 52], [39.6, 84], [39.6, 116],
  [52, 125.1], [86, 125.1], [120, 125.1], [150, 125.1],
  [153.2, 52], [153.2, 88],
];
const LAMPS = [[30, 17.5, 90], [70, 17.5, 90], [130, 17.5, 90], [27, 70, 0], [27, 130, 0], [182, 133, 270]];
const VENDING = [[87.5, 31.9, 270, 2, 1], [150.3, 30.2, 270, 1, 2], [38.4, 120, 0, 1, 3], [120, 128.2 + 4.2, 270, 1, 4]];

/* Parked cars [px, py, faces, style, variant]: on the street, in the yard
 * behind the annex left to rust, under the viaduct. */
const CARS = [
  [60, 21.6, 0, 'kei', 1], [133, 26.4, 180, 'van', 2], [33.4, 60, 90, 'keivan', 3], [33.4, 140, 270, 'hatch', 4],
  [140, 70, 90, 'sedan', 5], [146, 40, 0, 'kei', 6], [143, 92, 90, 'boxtruck', 2],
  [169, 52, 90, 'keivan', 7], [169, 101, 270, 'hatch', 8], [169, 155, 90, 'minivan', 9],
  [112, 92.5, 0, 'sedan', 10],
];

/* Trees [px, py, style, size, variant]: the courtyard's cherries gone
 * wild, the old street trees by the west wall, a pine by the lane, the
 * street's own. */
const TREES = [
  [110, 50, 'sakura', 1.3, 1], [114, 64, 'sakura', 1.2, 2], [106, 91, 'sakura', 1.1, 3], [88, 88, 'sakura', 1.4, 4],
  [76, 91, 'sakura', 1.2, 5], [104.5, 40.5, 'sakura', 1.0, 6], [48, 62, 'street', 1.5, 1], [48, 92, 'street', 1.4, 2],
  [56, 46, 'street', 1.2, 3], [140, 118, 'pine', 1.2, 1], [118, 42, 'pine', 1.0, 2],
  [20, 18, 'street', 1.0, 4], [62, 18, 'street', 1.0, 5], [138, 18, 'street', 1.0, 6], [204, 18, 'street', 1.0, 7],
];

function rows() {
  const out = [];
  out.push(['startPads', SPAWN.px, SPAWN.py, SPAWN.yaw * DEG, { pads: 4, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  for (const g of haikyoGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  /* The boiler house's chimney, its door to the south. */
  out.push(['hollowChimney', 50, 84, 270 * DEG, { height: 30, radius: 2.6, door: 2.8 }]);
  out.push(['containers', 142, 56, 90 * DEG, { stack: 2, variant: 3 }, { style: '20ft' }]);
  out.push(['containers', 146.5, 76, 90 * DEG, { stack: 1, variant: 5 }, { style: '40ft open' }]);
  for (const [px, py, deg, style, width, floors, variant] of BUILDINGS) {
    out.push(['building', px, py, deg * DEG, { width, depth: 9, floors, passage: 0, variant }, { style }]);
  }
  for (const [px, py] of POLES) {
    out.push(['utilityPole', px, py, 0, { height: 11 }]);
  }
  for (const [px, py, deg] of LAMPS) {
    out.push(['lamp', px, py, deg * DEG, { height: 6.5 }]);
  }
  for (const [px, py, deg, count, variant] of VENDING) {
    out.push(['vending', px, py, deg * DEG, { count, variant }]);
  }
  for (const [px, py, deg, style, variant] of CARS) {
    out.push(['car', px, py, deg * DEG, { variant }, { style }]);
  }
  for (const [px, py, style, size, variant] of TREES) {
    out.push(['tree', px, py, 0, { size, variant }, { style }]);
  }
  return out;
}

/* The estate's document, ready for normalize(). */
export function haikyoDocument() {
  const elements = rows().map(([type, x, y, yaw, dims, extra = {}], i) => {
    const el = {
      id: `el-${i + 1}`,
      type,
      name: extra.name ?? '',
      position: { x, y, z: extra.z ?? 0 },
      yaw,
      pitch: 0,
      yawOverridden: false,
      dims: { ...dims },
    };
    if (extra.style) {
      el.style = extra.style;
    }
    if (extra.points) {
      el.points = extra.points;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: HAIKYO_DOC_ID,
    name: HAIKYO_NAME,
    createdUtc: '2026-10-31T00:00:00Z',
    modifiedUtc: '2026-10-31T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: W, depth: D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'golden', ground: 'tarmac' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
