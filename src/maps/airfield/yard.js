/*
 * yard.js: the document Kazami Airfield flies in, as ../sunny/yard.js is
 * Sunnyfield's. The place itself comes from ./plan.js as one structure of
 * its own; this is what the built map's document format already says
 * well: the plot, the light and the ground, where the pilot starts, the
 * named gaps, and the town's own furniture: utility poles wired along the
 * farm track and the access road, vending machines at the clubhouse, the
 * cars and kei trucks in the car park, cherry trees along the channel and
 * the lane.
 *
 * Built fresh on every call and the same every call, with a fixed id, so
 * the map keys its marks and stamps as one place, and the id is the
 * registry's, where src/share/stamps.js can read it without loading the
 * map. Golden hour, the town's own light.
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

import { AIRFIELD_DOC_ID } from '../registry.js';
import { W, D, SPAWN, airfieldGaps } from './plan.js';
import { wallPy, PROFILE, CHANNEL } from './valley.js';
import { SHRINE, RED_BRIDGE, FARM_BRIDGE } from './field.js';

export const AIRFIELD_NAME = 'Kazami Airfield';

/* Headings in whole degrees, so a yaw is a product and the same bits
 * everywhere. */
const DEG = Math.PI / 180;

function rows() {
  const out = [];
  out.push(['startPads', SPAWN.px, SPAWN.py, SPAWN.deg * DEG, { pads: 4, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  for (const g of airfieldGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  /* The poles: along the farm track on the south, and up the access road
   * on the north to the clubhouse. The pipeline wires each to the next. */
  for (let x = 14; x < W; x += 34) {
    out.push(['utilityPole', x, 96.6, 0, { height: 10 }]);
  }
  for (let x = 284; x < W; x += 32) {
    out.push(['utilityPole', x, 257, 0, { height: 11 }]);
  }
  /* Two vending machines by the clubhouse door, and two by the sheds. */
  out.push(['vending', 249.4, 225.0, -90 * DEG, { count: 2, variant: 2 }]);
  out.push(['vending', 194.6, 230.2, 180 * DEG, { count: 1, variant: 5 }]);
  /* The car park: kei cars and vans nose in, a white kei truck. */
  const cars = [['kei', 1, 284], ['keivan', 3, 287.2], ['hatch', 2, 290.4], ['kei', 6, 296.8], ['minivan', 4, 300]];
  for (const [style, variant, x] of cars) {
    out.push(['car', x, 232, 90 * DEG, { variant }, { style }]);
  }
  out.push(['car', 196.5, 236, 180 * DEG, { variant: 2 }, { style: 'kei' }]);
  /* Cherry trees: a row along the channel's north bank, gaps left at the
   * bridges and where the race drops into the channel; a few along the
   * lane behind the hangar and round the clubhouse; two by the shrine. */
  const keep = [FARM_BRIDGE.px, RED_BRIDGE.px, 336];
  for (let x = 22; x < W - 10; x += 26) {
    if (keep.some((k) => Math.abs(x - k) < 12)) {
      continue;
    }
    out.push(['tree', x, CHANNEL.y1 + 3.6, 0, { size: 0.9 + ((x * 7) % 5) * 0.06, variant: 1 + (x % 4) }, { style: 'sakura' }]);
  }
  for (const [x, y] of [[132, 262], [150, 264], [244, 262], [276, 247], [326, 236], [340, 248], [110, 226]]) {
    out.push(['tree', x, y, 0, { size: 1.1, variant: 2 }, { style: 'sakura' }]);
  }
  const h = PROFILE[0][SHRINE.bench].h;
  const yb = wallPy(0, SHRINE.bench, SHRINE.px) - 3.6;
  out.push(['tree', SHRINE.px - 5, yb + 0.5, 0, { size: 1.2, variant: 3 }, { style: 'sakura', z: h }]);
  return out;
}

/* The airfield's document, ready for normalize(). */
export function airfieldDocument() {
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
    id: AIRFIELD_DOC_ID,
    name: AIRFIELD_NAME,
    createdUtc: '2026-10-31T00:00:00Z',
    modifiedUtc: '2026-10-31T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: W, depth: D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'golden', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
