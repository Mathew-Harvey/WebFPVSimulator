/*
 * yard.js: the document Kumoi Towers flies in, as ../sunny/yard.js is
 * Sunnyfield's. The district itself comes from ./plan.js as one structure
 * of its own; this is what the built map's document format already says
 * well: the plot, the light and the ground, where the pilot starts, the
 * named gaps, the cranes, the town's own buildings, trees, poles and
 * vending machines, and the road round the plaza and its cars.
 *
 * Built fresh on every call and the same every call, with a fixed id, so
 * the map keys its marks and stamps as one place, and the id is the
 * registry's, where src/share/stamps.js can read it without loading the
 * district.
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

import { TOWERS_DOC_ID } from '../registry.js';
import { W, D, SPAWN, towersGaps, trafficLoops } from './plan.js';
import { block, BLVD_A, BLVD_B, AVE_N, HALF } from './streets.js';
import { PARK_TREES, CANOPY } from './plaza.js';
import { POLES, LANES, BOUNDS as LANE_BLOCK } from './yokocho.js';
import { CRANES } from './site.js';

export const TOWERS_NAME = 'Kumoi Towers';

const DEG = Math.PI / 180;

/* The cars round the plaza: a taxi's sedan, a kei van, a bus, a box
 * lorry, a hatch and a wagon, a lap shared out evenly. A moving car is
 * about fifteen draw calls with its shadow, so six is the budget. */
const CARS = [
  ['sedan', 4], ['keivan', 2], ['minibus', 1], ['boxtruck', 3], ['hatch', 6], ['wagon', 5],
];
const SPEED = 12;

/*
 * THE MID RISE BLOCK, south east, between the slot towers and the
 * railway: the town's own buildings (src/props/buildings.js) at the sizes
 * a street of them has, with alleys of three to four metres between. Each
 * is [style, px, py, deg, width, depth, floors, passage].
 */
const MID = block(2, 0);
const BUILDINGS = [
  ['office', MID.x0 + 14, MID.y1 - 10, 90, 24, 16, 11, 0],
  ['office', MID.x0 + 42, MID.y1 - 10, 90, 22, 16, 9, 6],
  ['office', MID.x0 + 70, MID.y1 - 11, 90, 24, 18, 13, 0],
  ['flats', MID.x0 + 96, MID.y1 - 9, 90, 18, 14, 8, 0],
  ['shop', MID.x0 + 115, MID.y1 - 8, 90, 10, 12, 4, 0],
  ['flats', MID.x0 + 13, MID.y0 + 40, 0, 20, 12, 7, 0],
  ['shop', MID.x0 + 31, MID.y0 + 40, 0, 8, 11, 3, 0],
  ['flats', MID.x0 + 50, MID.y0 + 40, 0, 22, 12, 6, 4],
  ['office', MID.x0 + 78, MID.y0 + 42, 0, 20, 16, 10, 0],
  ['flats', MID.x0 + 106, MID.y0 + 40, 0, 20, 12, 8, 0],
  ['shop', MID.x0 + 10, MID.y0 + 10, 270, 9, 11, 3, 0],
  ['shop', MID.x0 + 24, MID.y0 + 10, 270, 9, 11, 4, 0],
  ['shop', MID.x0 + 38, MID.y0 + 10, 270, 8, 11, 3, 0],
  ['flats', MID.x0 + 60, MID.y0 + 11, 270, 20, 12, 5, 0],
  ['shop', MID.x0 + 84, MID.y0 + 10, 270, 9, 11, 3, 0],
  ['office', MID.x0 + 108, MID.y0 + 12, 270, 22, 14, 7, 0],
];

/* Low buildings round the sky garden and behind the hall, so no tower
 * stands in a car park. */
const NW = block(0, 2);
const CN = block(1, 2);
const LOW = [
  ['shop', NW.x0 + 12, NW.y1 - 10, 90, 10, 12, 4, 0],
  ['flats', NW.x0 + 34, NW.y1 - 10, 90, 22, 12, 6, 0],
  ['office', NW.x0 + 64, NW.y1 - 12, 90, 20, 16, 8, 0],
  ['flats', NW.x0 + 98, NW.y1 - 10, 90, 22, 12, 7, 0],
  ['office', CN.x0 + 12, CN.y1 - 9, 90, 16, 12, 6, 0],
  ['office', CN.x1 - 12, CN.y1 - 9, 90, 16, 12, 5, 0],
];

/* Street trees and cherries: [style, px, py, size]. */
function trees() {
  const out = PARK_TREES.map(([px, py, s]) => ['sakura', px, py, s]);
  /* Round the sky garden's foot, a grove of street trees. */
  for (let k = 0; k < 8; k += 1) {
    out.push(['street', NW.x0 + 10 + k * 16, NW.y0 + 10, 1.0 + (k % 3) * 0.08]);
  }
  /* Cherries along the slot towers' plaza. */
  const SE = block(2, 1);
  for (let k = 0; k < 6; k += 1) {
    out.push(['sakura', SE.x0 + 8 + k * 20, SE.y1 - 6, 0.95 + (k % 2) * 0.1]);
  }
  return out;
}

function rows() {
  const out = [];
  /* The start: four mats at the plaza's south end, facing north. */
  out.push(['startPads', SPAWN.px, SPAWN.py, 90 * DEG, { pads: 4, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  for (const g of towersGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  for (const [px, py, deg, dims] of CRANES) {
    out.push(['crane', px, py, deg * DEG, { ...dims }]);
  }
  for (const [style, px, py, deg, width, depth, floors, passage] of [...BUILDINGS, ...LOW]) {
    out.push(['building', px, py, deg * DEG, { width, depth, floors, passage, variant: Math.round(px + py) % 97 + 1 }, { style }]);
  }
  trees().forEach(([style, px, py, size], i) => {
    out.push(['tree', px, py, 0, { size, variant: i + 1 }, { style }]);
  });
  /* The poles at the lanes' ends, which the kit wires to each other. */
  for (const [px, py] of POLES) {
    out.push(['utilityPole', px, py, 0, { height: 10 }]);
  }
  /* Vending machines: a pair at the canopy, one at each lane's end. */
  out.push(['vending', CANOPY.x0 - 1.5, CANOPY.y1 - 4, 180 * DEG, { count: 3, variant: 2 }]);
  LANES.forEach((y, i) => {
    out.push(['vending', LANE_BLOCK.x1 - 1.2, y + 2.6, 180 * DEG, { count: 1, variant: 3 + i }]);
  });
  /* Kei trucks parked on the lanes' block edge and by the shrine. */
  out.push(['car', LANE_BLOCK.x0 + 6, LANE_BLOCK.y1 - 1.6, 0, { variant: 2 }, { style: 'kei' }]);
  out.push(['car', BLVD_B + HALF + 4, AVE_N + HALF + 4, 90 * DEG, { variant: 7 }, { style: 'keivan' }]);
  out.push(['car', BLVD_A - HALF - 4, 40, 90 * DEG, { variant: 3 }, { style: 'kei' }]);
  /* The road round the plaza and its cars, last, so nothing above moves
   * when a car is added. */
  const loops = trafficLoops();
  const first = out.length + 1;
  loops.forEach((l) => {
    const [ox, oy] = l.nodes[0];
    out.push(['road', ox, oy, 0, { width: 8, lanes: 2, radius: l.radius }, {
      name: l.name, closed: true, nodes: l.nodes.map(([x, y]) => [x - ox, y - oy]),
    }]);
  });
  CARS.forEach(([style, variant], i) => {
    const offset = Math.round((i * 540) / CARS.length);
    out.push(['vehicle', 0, 0, 0, { offset, speed: SPEED, variant }, { style, road: `el-${first}` }]);
  });
  return out;
}

/* The district's document, ready for normalize(). */
export function towersDocument() {
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
    if (type === 'road') {
      el.nodes = extra.nodes.map(([nx, ny]) => ({ x: nx, y: ny }));
      el.closed = extra.closed === true;
    }
    if (type === 'vehicle') {
      el.road = extra.road;
      el.reverse = false;
      el.drift = false;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: TOWERS_DOC_ID,
    name: TOWERS_NAME,
    createdUtc: '2026-10-31T00:00:00Z',
    modifiedUtc: '2026-10-31T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: W, depth: D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'golden', ground: 'concrete' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
