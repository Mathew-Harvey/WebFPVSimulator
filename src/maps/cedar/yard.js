/*
 * yard.js: Kodama Onsen as a map document, the way Sunnyfield's is
 * (../sunny/yard.js): the start pads, the named gaps, and the few things
 * the builder's own palette already draws better than a map could: the
 * boiler house's brick chimney you can fly down (the hollow chimney), the
 * concrete annex gone to ruin (the bando) and the vehicles left in the
 * car park. Everything else is the place itself (./plan.js), which
 * ./index.js hands the pipeline as its structure.
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

import { CEDAR_DOC_ID } from '../registry.js';
import {
  W, D, SPAWN, ANNEX, CARS, CHIMNEY_EL, cedarGaps,
} from './plan.js';
import { CHIMNEY } from './ryokan.js';

export const CEDAR_NAME = 'Kodama Onsen';

/* Headings in whole degrees, so a yaw is a product and the same bits
 * everywhere. */
const DEG = Math.PI / 180;

function rows() {
  const out = [];
  /* The start: four mats in the car park, facing north to the inn. */
  out.push(['startPads', SPAWN.px, SPAWN.py, SPAWN.yaw * DEG, { pads: 4, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  for (const g of cedarGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  /* The boiler's chimney, its doorway turned to the west, away from the
   * flue that comes in from the boiler house on its south side. */
  out.push(['hollowChimney', CHIMNEY.px, CHIMNEY.py, 180 * DEG, { ...CHIMNEY_EL.dims }]);
  out.push(['bando', ANNEX.px, ANNEX.py, 0, {
    width: ANNEX.width, depth: ANNEX.depth, floors: ANNEX.floors, ruin: ANNEX.ruin, variant: ANNEX.variant,
  }]);
  for (const c of CARS) {
    out.push(['car', c.px, c.py, c.deg * DEG, { variant: c.variant }, { style: c.style }]);
  }
  return out;
}

/* The place's document, ready for normalize(). */
export function cedarDocument() {
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
    id: CEDAR_DOC_ID,
    name: CEDAR_NAME,
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
