/*
 * yard.js: the document Kazahana Plain flies in, as ../sunny/yard.js is
 * Sunnyfield's. The plain itself comes from ./plan.js as one structure of
 * its own; this is what the built map's document format already says
 * well: the plot, the light and the ground, where the pilot starts, the
 * named gaps, the power lines along the roads, the drinks machines, the
 * cars in the market's car park, and the balloon chase over the farm.
 *
 * Built fresh on every call and the same every call, with a fixed id, so
 * the map keys its marks and stamps as one place, and the id is the
 * registry's, where src/share/stamps.js can read it without loading the
 * plain.
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

import { KAZA_DOC_ID } from '../registry.js';
import { W, D, SPAWN, kazaGaps } from './plan.js';
import { ROAD, SOUTH_ROAD, BUS } from './farm.js';
import { rng } from './frame.js';

export const KAZA_NAME = 'Kazahana Plain';

/* Headings in whole degrees, so a yaw is a product and the same bits
 * everywhere. */
const DEG = Math.PI / 180;

function rows() {
  const out = [];
  /* The start: four mats on the matting south of the field, facing north
   * to the balloons. */
  out.push(['startPads', SPAWN.px, SPAWN.py, 90 * DEG, { pads: 4, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  for (const g of kazaGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  /* The power line along the south road, and the one up the farm road to
   * the farm and on to the old line. Concrete poles, the town's: this is
   * Japan, and its poles are lettered in Japanese. */
  for (let x = 12; x < W - 4; x += 40) {
    out.push(['utilityPole', x, SOUTH_ROAD.y1 + 1.6, 0, { height: 10 }]);
  }
  for (let y = 74; y < ROAD.y1 - 20; y += 40) {
    out.push(['utilityPole', ROAD.x1 + 2.2, y, 90 * DEG, { height: 9 }]);
  }
  /* Drinks machines: at the bus stop, by the market's tables and at the
   * meet's tent. */
  out.push(['vending', BUS.px + 1.0, BUS.py + 3.6, 180 * DEG, { count: 1, variant: 4 }]);
  out.push(['vending', 612, 386, 180 * DEG, { count: 2, variant: 7 }]);
  out.push(['vending', 86, 186, 90 * DEG, { count: 2, variant: 2 }]);
  /* The market's car park: three rows of cars nosed in. */
  const r = rng(2024);
  const styles = ['kei', 'keivan', 'hatch', 'wagon', 'minivan', 'sedan', 'kei', 'keivan'];
  for (let row = 0; row < 3; row += 1) {
    const y = 52 + row * 20;
    for (let i = 0; i < 9; i += 1) {
      if (r.chance(0.3)) {
        continue;
      }
      out.push(['car', 480 + i * 3.2, y, (row % 2 ? 270 : 90) * DEG, { variant: r.int(1, 30) }, { style: r.pick(styles) }]);
      out.push(['car', 560 + i * 3.2, y, (row % 2 ? 270 : 90) * DEG, { variant: r.int(1, 30) }, { style: r.pick(styles) }]);
    }
  }
  /* The balloon chase: a light plane streaming balloons over the farm,
   * the meet's own game. */
  out.push(['balloonChase', 330, 900, 0, { radius: 170, height: 16, speed: 1 }]);
  return out;
}

/* The plain's document, ready for normalize(). */
export function kazaDocument() {
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
    id: KAZA_DOC_ID,
    name: KAZA_NAME,
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
