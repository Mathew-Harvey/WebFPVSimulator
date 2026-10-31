/*
 * yard.js: the document Hamakaze Works flies in, as ../sunny/yard.js is
 * Sunnyfield's. The works itself comes from ./plan.js as one structure of
 * its own; this is what the built map's document format already says
 * well: the plot, the light and the ground, where the pilot starts, the
 * named gaps, and the town's own assets: the office and the store, the
 * flare's lattice, the water tower, the containers on the quay, the parked
 * cars, the vending machines, the lamps, the utility poles and their wires,
 * the cherry trees and the pines.
 *
 * Built fresh on every call and the same every call, with a fixed id, so
 * the map keys its marks and stamps as one place, and the id is the
 * registry's, where src/share/stamps.js can read it without loading the
 * works.
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

import { FACTORY_DOC_ID } from '../registry.js';
import { W, D, SPAWN, factoryGaps } from './plan.js';
import { FLARE } from './plant.js';
import { ROADS } from './site.js';

export const FACTORY_NAME = 'Hamakaze Works';

/* Headings in whole degrees, so a yaw is a product and the same bits
 * everywhere. */
const DEG = Math.PI / 180;

function rows() {
  const out = [];
  out.push(['startPads', SPAWN.px, SPAWN.py, SPAWN.deg * DEG, { pads: 4, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  for (const g of factoryGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  /* The office on the north road and the store at the east end. */
  out.push(['building', 58, 210, 0, { width: 36, depth: 14, floors: 4, passage: 0, variant: 2 }, { style: 'office' }]);
  out.push(['building', 270, 212, 0, { width: 40, depth: 22, floors: 2, passage: 0, variant: 3 }, { style: 'warehouse' }]);
  /* The flare's lattice round its stack, and the water tower by the
   * substation. */
  out.push(['mast', FLARE.px, FLARE.py, 0, { height: FLARE.h - 4, width: 2.2 }]);
  out.push(['waterTower', 64, 162, 0, { height: 16, radius: 3.6, tank: 0.8 }]);
  /* The containers on the quay's east end, aisles between the stacks. */
  [[214, 2, 1], [230, 3, 4], [246, 2, 2], [262, 1, 5], [278, 3, 3], [294, 2, 6]].forEach(([x, stack, variant]) => {
    out.push(['containers', x, 38, 0, { stack, variant }, { style: '40ft' }]);
  });
  /* The cars in the car park, nose in, and a van and a truck at work. */
  const cars = ['kei', 'keivan', 'kei', 'hatch', 'kei', 'wagon', 'kei', 'minivan', 'keivan', 'kei'];
  cars.forEach((style, i) => {
    const row = i % 2;
    const x = 92 + Math.floor(i / 2) * 7.5;
    out.push(['car', x, row ? 222 : 200, (row ? -90 : 90) * DEG, { variant: 1 + (i % 4) }, { style }]);
  });
  out.push(['car', 132, 46, 0, { variant: 2 }, { style: 'boxtruck' }]);
  out.push(['car', 196, 102, 0, { variant: 3 }, { style: 'keivan' }]);
  /* The vending machines by the bicycle shed, as every works has. */
  out.push(['vending', 184, 197.2, 90 * DEG, { count: 3, variant: 2 }]);
  out.push(['vending', HOUSE_VEND.x, HOUSE_VEND.y, 0, { count: 2, variant: 4 }]);
  /* The lamps along the plant road and the quay. */
  for (const y of [56, 92, 132, 160, 204]) {
    out.push(['lamp', ROADS.plant.x1 + 1.2, y, 180 * DEG, { height: 8 }]);
  }
  for (const x of [20, 60, 120, 200, 260, 310]) {
    out.push(['lamp', x, 40.8, -90 * DEG, { height: 9 }]);
  }
  /* The utility poles along the north road and up the plant road, which
   * the pipeline wires to their neighbours. */
  for (let x = 10; x < W; x += 30) {
    out.push(['utilityPole', x, 178.6, 0, { height: 10 }]);
  }
  for (const y of [128, 150]) {
    out.push(['utilityPole', ROADS.plant.x0 - 1.4, y, 0, { height: 10 }]);
  }
  /* Cherry trees along the office front, pines by the gate. */
  for (const x of [42, 54, 66, 78]) {
    out.push(['tree', x, 194.5, 0, { size: 1.1, variant: x % 5 }, { style: 'sakura' }]);
  }
  for (const [x, y] of [[133, 230], [164, 232], [190, 230]]) {
    out.push(['tree', x, y, 0, { size: 0.9, variant: 3 }, { style: 'pine' }]);
  }
  for (const [x, y] of [[8, 150], [12, 172], [306, 230], [314, 200]]) {
    out.push(['tree', x, y, 0, { size: 1.2, variant: 2 }, { style: 'street' }]);
  }
  return out;
}

/* Beside the control house's west door, out of the line. */
const HOUSE_VEND = { x: 197.5, y: 98 };

/* The works' document, ready for normalize(). */
export function factoryDocument() {
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
    id: FACTORY_DOC_ID,
    name: FACTORY_NAME,
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
