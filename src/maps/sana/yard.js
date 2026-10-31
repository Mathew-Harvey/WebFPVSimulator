/*
 * yard.js: the document Kirigaoka Sanatorium flies in, as ../sunny/yard.js
 * is Sunnyfield's. The sanatorium and its grounds come from ./plan.js as
 * one structure of their own; this is what the built map's document format
 * already says well: the plot, the light and the ground, where the pilot
 * starts, the named gaps, the utility poles and their wires down the road,
 * and the drinks machines at the bus stop.
 *
 * Built fresh on every call and the same every call, with a fixed id, so
 * the map keys its marks and stamps as one place, and the id is the
 * registry's, where src/share/stamps.js can read it without loading the
 * map.
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

import { SANA_DOC_ID } from '../registry.js';
import { W, D, SPAWN, sanaGaps } from './plan.js';

export const SANA_NAME = 'Kirigaoka Sanatorium';

/* Headings in whole degrees, so a yaw is a product and the same bits
 * everywhere. */
const DEG = Math.PI / 180;

/* The town's concrete poles down the road and along the wall, close enough
 * that the pipeline strings the wires between them (45 m). */
const POLES = [[105, 26], [148, 26], [188, 26], [188, 60], [186, 90], [232, 26], [276, 26], [320, 26]];

function rows() {
  const out = [];
  /* The start: one mat on the road outside the gate, facing north. */
  out.push(['startPads', SPAWN.px, SPAWN.py, SPAWN.deg * DEG, { pads: 1, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  for (const g of sanaGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  for (const [px, py] of POLES) {
    out.push(['utilityPole', px, py, 0, { height: 10 }]);
  }
  /* Two machines by the stop, still standing, facing the road. */
  out.push(['vending', 188.5, 17, 0, { count: 2, variant: 5 }]);
  return out;
}

/* The map's document, ready for normalize(). */
export function sanaDocument() {
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
    id: SANA_DOC_ID,
    name: SANA_NAME,
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
