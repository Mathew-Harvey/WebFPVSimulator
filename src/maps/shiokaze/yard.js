/*
 * yard.js: the document Shiokaze Point flies in, as ../sunny/yard.js is
 * Sunnyfield's. The island itself comes from ./plan.js as one structure of
 * its own; this is what the built map's document format already says well:
 * the plot, the light and the ground, where the pilot starts and the named
 * gaps, the park race's ten among them in their order.
 *
 * Built fresh on every call and the same every call, with a fixed id, so
 * the map keys its marks and stamps as one place, and the id is the
 * registry's, where src/share/stamps.js can read it without loading the
 * island.
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

import { SHIOKAZE_DOC_ID } from '../registry.js';
import { W, D, SPAWN, shiokazeGaps } from './plan.js';

export const SHIOKAZE_NAME = 'Shiokaze Point';

/* Headings in whole degrees, so a yaw is a product and the same bits
 * everywhere. */
const DEG = Math.PI / 180;

function rows() {
  const out = [];
  /* The start: four mats on the forecourt, facing south down the porch and
   * through the lobby to the sea. */
  out.push(['startPads', SPAWN.px, SPAWN.py, SPAWN.deg * DEG, { pads: 4, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  for (const g of shiokazeGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  return out;
}

/* The island's document, ready for normalize(). */
export function shiokazeDocument() {
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
    if (extra.points) {
      el.points = extra.points;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: SHIOKAZE_DOC_ID,
    name: SHIOKAZE_NAME,
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
