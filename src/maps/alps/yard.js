/*
 * yard.js: the document Raicho Ridge flies in, as ../moto/yard.js is
 * Ridgeline MX's. Everything that stands on the ridge comes from
 * ./places.js and ./nature.js as one structure, and the ground from
 * ./terrain.js; the document says what it says well: the plot, the time
 * of day, where the pilot starts and the named gaps.
 *
 * THE PLOT is the terrain's lattice, 2 km square, so the document's
 * frame and the world's agree: x in the document is world x plus 1000,
 * and y is 1000 less world z (docToWorld in src/maps/built/place.js).
 *
 * THE START is one pad on the helipad on the col, facing south down the
 * face, the ropeway on the right and the lake on the left: the first line
 * is the dive.
 *
 * Built fresh on every call and the same every call, with a fixed id, so
 * the map keys its marks and stamps as one place, and the id is the
 * registry's, where src/share/stamps.js can read it without loading this.
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

import { ALPS_DOC_ID } from '../registry.js';
import { HALF } from './terrain.js';
import { HELI } from './places.js';
import { GAP_POINTS } from '../../props/types.js';

export const ALPS_NAME = 'Raicho Ridge';

/* Facing south, in the document's headings (+x east, +y north). */
const SOUTH = -Math.PI / 2;
const EAST = 0;

const doc = (x, z) => ({ x: x + HALF, y: HALF - z });

/* The document, from the laid out places: `heliTop` the helipad's top and
 * `gaps` the plan's named gaps in the world. */
export function alpsDocument(heliTop, gaps) {
  const rows = [];
  const pad = doc(HELI.x, HELI.z + 5);
  rows.push({
    type: 'startPads', x: pad.x, y: pad.y, z: heliTop, yaw: SOUTH, dims: { pads: 1, spacing: 1.5, padSize: 0.9 },
  });
  for (const g of gaps) {
    const p = doc(g.x, g.z);
    rows.push({
      type: 'gap', x: p.x, y: p.y, z: g.y, yaw: g.along === 'x' ? EAST : SOUTH, name: g.name, points: GAP_POINTS[g.points], dims: { width: g.w, height: g.h },
    });
  }
  const elements = rows.map((r, i) => {
    const el = {
      id: `el-${i + 1}`,
      type: r.type,
      name: r.name ?? '',
      position: { x: r.x, y: r.y, z: r.z },
      yaw: r.yaw,
      pitch: 0,
      yawOverridden: true,
      dims: { ...r.dims },
    };
    if (r.points) {
      el.points = r.points;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: ALPS_DOC_ID,
    name: ALPS_NAME,
    createdUtc: '2026-10-31T00:00:00Z',
    modifiedUtc: '2026-10-31T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: 2 * HALF, depth: 2 * HALF, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'golden', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
