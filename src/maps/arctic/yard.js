/*
 * yard.js: Hyoura Island's document, the part of the map the built map's
 * pipeline reads as a builder's map would be read: the plot, the time of
 * day, the start pads on the quay and the named gaps. Everything else on
 * the island is the structure ./plan.js hands the pipeline beside it.
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

import { ARCTIC_DOC_ID } from '../registry.js';
import { W, D, planOf } from './frame.js';
import { SPAWN, arcticGaps } from './plan.js';

export const ARCTIC_NAME = 'Hyoura Island';

/* Headings in whole degrees, so a yaw is a product and the same bits
 * everywhere. */
const DEG = Math.PI / 180;

function rows() {
  const out = [];
  const [sx, sy] = planOf(SPAWN.x, SPAWN.z);
  out.push(['startPads', sx, sy, SPAWN.deg * DEG, { pads: 4, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.y }]);
  /* A window's yaw is its normal: along x is 0, along z (north) is 90. */
  for (const g of arcticGaps()) {
    const [px, py] = planOf(g.x, g.z);
    out.push(['gap', px, py, (g.along === 'x' ? 0 : 90) * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  return out;
}

export function arcticDocument() {
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
    id: ARCTIC_DOC_ID,
    name: ARCTIC_NAME,
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
