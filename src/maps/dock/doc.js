/*
 * doc.js: Kamome Wharf's document, everything the built map's pipeline
 * places from a document rather than from the port's own parts: the start,
 * the named gaps, the drift cars and the apron road they run, and the
 * town's own furniture on the landside (the drinks machines by the drivers'
 * rest, the lettered poles along the road, the lamps, the trees, the cars
 * parked by the office).
 *
 * THE DRIFT CARS run the apron at night, a loop round the quay's back road
 * and under all three cranes, two by two the way a tandem runs, so the
 * chase down the apron the doc asks for has something to chase. The road's
 * own mesh is hidden (./index.js): the apron is concrete, the lanes paint.
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

import { DOCK_DOC_ID } from '../registry.js';
import { W, D, SPAWN, dockGaps } from './plan.js';
import { DRIFT_ROAD, DRIFT_WIDTH, REST, OFFICE, GATE, FENCE_Y, WAREHOUSE, TOWER } from './site.js';

export const DOCK_NAME = 'Kamome Wharf';

/* Headings in whole degrees, so a yaw is a product and the same bits
 * everywhere. */
const DEG = Math.PI / 180;

/* The drift cars: two tandems, each car its style and livery, the pairs
 * half a lap apart on a lap of about 760 m. About 70 km/h: the apron's
 * bends are tighter than a circuit's. Four and no more: a moving car is
 * about fifteen draw calls with its shadow, on every preset. */
const GROUPS = [
  { cars: [['e82', 4], ['r32', 5]], at: 20 },
  { cars: [['r32', 6], ['e82', 6]], at: 400 },
];
const GAP = 8.5;
const SPEED = 19;

function rows() {
  const out = [];
  /* The road first, so its id is el-1 whatever is added after it. */
  const [ox, oy] = DRIFT_ROAD[0];
  out.push(['road', ox, oy, 0, { width: DRIFT_WIDTH, lanes: 1, radius: 8 }, {
    name: 'Apron', closed: true, nodes: DRIFT_ROAD.map(([x, y]) => [x - ox, y - oy]),
  }]);
  for (const g of GROUPS) {
    g.cars.forEach(([style, variant], k) => {
      out.push(['vehicle', 0, 0, 0, { offset: g.at + k * GAP, speed: SPEED, variant }, { style, road: 'el-1', drift: true }]);
    });
  }
  /* The start: two mats on the open apron west of the cranes, facing east
   * down the quay, the first crane's legs straight ahead. */
  out.push(['startPads', SPAWN.px, SPAWN.py, SPAWN.deg * DEG, { pads: 2, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  for (const g of dockGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  /* The drivers' rest: a row of drinks machines under its eave, facing the
   * road. */
  out.push(['vending', (REST.x0 + REST.x1) / 2 - 3, REST.y1 + 0.8, 90 * DEG, { count: 3, variant: 2 }]);
  out.push(['vending', REST.x0 - 1.2, (REST.y0 + REST.y1) / 2, 180 * DEG, { count: 2, variant: 5 }]);
  out.push(['vending', GATE.x0 - 3, GATE.y0 - 2, 90 * DEG, { count: 2, variant: 3 }]);
  /* The town's lettered poles down the landside road, wired pole to pole. */
  for (let px = 14; px <= W - 10; px += 36) {
    out.push(['utilityPole', px, 4.2, 0, { height: 11 }]);
  }
  /* Lamps along the road behind the fence, arms out over it, the gate's
   * mouth left clear. */
  for (let px = 150; px <= W - 20; px += 30) {
    if (px > GATE.x0 - 6 && px < GATE.x1 + 6) {
      continue;
    }
    out.push(['lamp', px, FENCE_Y - 3, -90 * DEG, { height: 8 }]);
  }
  /* Street trees in front of the brick warehouse, and pines round the
   * tower's plaza. */
  for (let px = WAREHOUSE.x0 + 6, i = 0; px < WAREHOUSE.x1; px += 13, i += 1) {
    out.push(['tree', px, 38.5, (i * 47) * DEG, { size: 0.95 + (i % 3) * 0.08, variant: 1 + (i % 7) }, { style: 'street' }]);
  }
  for (let k = 0; k < 6; k += 1) {
    const a = (k * 60 + 30) * DEG;
    const r = TOWER.r0 + 7;
    /* Plan positions from the six fixed points of a hexagon: literal
     * cosines and sines, so nothing here calls Math.cos. */
    const c = [0.8660254037844387, 0, -0.8660254037844387, -0.8660254037844387, 0, 0.8660254037844387][k];
    const s = [0.5, 1, 0.5, -0.5, -1, -0.5][k];
    out.push(['tree', TOWER.px + r * c, TOWER.py + r * s, a, { size: 0.85, variant: 2 + k }, { style: 'pine' }]);
  }
  /* The office's car park: commuters' cars nose in to the kerb. */
  const parked = [['kei', 3], ['hatch', 2], ['keivan', 5], ['sedan', 4], ['minivan', 1], ['kei', 6]];
  parked.forEach(([style, variant], k) => {
    out.push(['car', OFFICE.x0 - 22 + k * 3.1, 15, 90 * DEG, { variant }, { style }]);
  });
  return out;
}

/* The port's document, ready for normalize(). */
export function dockDocument() {
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
      el.drift = extra.drift === true;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: DOCK_DOC_ID,
    name: DOCK_NAME,
    createdUtc: '2026-10-31T00:00:00Z',
    modifiedUtc: '2026-10-31T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: W, depth: D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'dusk', ground: 'concrete' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
