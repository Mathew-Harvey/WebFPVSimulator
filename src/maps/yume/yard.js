/*
 * yard.js: the document Yumeboshi Land flies in, as ../park/yard.js is
 * Hinode Park's. The park itself comes from ./plan.js as one structure of
 * its own; this is what the built map's document format already says
 * well: the plot, the light and the ground, where the pilot starts and
 * the named gaps. No roads and no cars: the moving things here are the
 * rides, which ./rides.js seats near the craft every step.
 *
 * GOLDEN HOUR, the town's own light (../built/looks.js), as every map
 * drawn in its hand has it.
 *
 * Built fresh on every call and the same every call, with a fixed id, the
 * registry's, so src/share/stamps.js can key the map without loading it.
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

import { YUME_DOC_ID } from '../registry.js';
import {
  W, D, SPAWN, yumeGaps,
} from './plan.js';

export const YUME_NAME = 'Yumeboshi Land';

/* Headings in whole degrees, so a yaw is a product and the same bits
 * everywhere. */
const DEG = Math.PI / 180;

function rows() {
  const out = [];
  out.push(['startPads', SPAWN.px, SPAWN.py, 90 * DEG, { pads: 4, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  for (const g of yumeGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  return out;
}

/* The park's document, ready for normalize(). */
export function yumeDocument() {
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
    id: YUME_DOC_ID,
    name: YUME_NAME,
    createdUtc: '2026-11-02T00:00:00Z',
    modifiedUtc: '2026-11-02T00:00:00Z',
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
