/*
 * yard.js: the document Tanada RX flies in, as ../moto/yard.js is
 * Ridgeline MX's. The place's own structures (the track, the stand, the
 * terraces, the hamlet, the paddock) come from ./circuit.js, ./hill.js and
 * ./paddock.js as one structure, and the cars from ./traffic.js; this is
 * what the built map's document already says well: the plot, the time of
 * day and the ground, the pilot's start, the named gaps, the utility poles
 * along the farm road (whose wires the pipeline hangs), the vending
 * machines, the parked cars and the trees on the flat.
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

import { RALLY_DOC_ID } from '../registry.js';
import { W, D, hash } from './frame.js';
import { SPAWN, circuitGaps, circuitLayout } from './circuit.js';
import { ROAD, TORII } from './hill.js';
import { PARK, awnings } from './paddock.js';

export const RALLY_NAME = 'Tanada RX';

const DEG = Math.PI / 180;

/* The named gaps the circuit has, and the torii on the crest. */
export function rallyGaps() {
  const M = 0.3;
  return [
    ...circuitGaps(),
    {
      name: 'THE TORII', px: TORII.x, py: TORII.y, deg: 90, w: TORII.span - 0.4 - 2 * M, h0: TORII.h + M, h1: TORII.h + TORII.top - 1.05 - M, points: 500,
    },
  ];
}

/* The trees on the flat: pines and cherries down the east edge, round the
 * service park and at the stand's ends, none within a car's slide of the
 * track or on anything built. */
function trees() {
  const { clearOf } = circuitLayout();
  const out = [];
  const spots = [];
  for (let i = 0; i < 60; i += 1) {
    spots.push([400 + hash(i, 1) * 16, 6 + hash(i, 2) * 190]);
  }
  for (let i = 0; i < 18; i += 1) {
    spots.push([2 + hash(i, 3) * 5, 8 + hash(i, 4) * 110]);
    spots.push([96 + hash(i, 5) * 8, 4 + hash(i, 6) * 30]);
  }
  for (let i = 0; i < 10; i += 1) {
    spots.push([4 + hash(i, 7) * 102, 4 + hash(i, 8) * 5]);
  }
  for (const [x, y] of spots) {
    if (clearOf(x, y) < 17 || x < 1.5 || x > W - 1.5) {
      continue;
    }
    if (out.some((t) => (t.x - x) * (t.x - x) + (t.y - y) * (t.y - y) < 30)) {
      continue;
    }
    const k = out.length;
    out.push({ x, y, style: hash(k, 9) < 0.62 ? 'pine' : 'sakura', size: 0.9 + hash(k, 10) * 0.45, variant: 1 + (k % 9) });
  }
  return out;
}

function rows() {
  const out = [];
  out.push(['startPads', SPAWN.px, SPAWN.py, SPAWN.yaw, { pads: 1, spacing: 1.5, padSize: 0.9 }]);
  for (const g of rallyGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  /* The poles along the farm road, a span apart, on its south verge. */
  for (let x = 10; x < W - 6; x += 30) {
    out.push(['utilityPole', x, ROAD.y0 - 1.6, 0, { height: 11 }]);
  }
  /* Drinks machines: by the stalls, by the stand's east end, in the park. */
  out.push(['vending', 137.5, 210.5, -90 * DEG, { count: 2, variant: 2 }]);
  out.push(['vending', 258, 214, 180 * DEG, { count: 2, variant: 5 }]);
  out.push(['vending', PARK.x1 - 2, 121, -90 * DEG, { count: 3, variant: 7 }]);
  out.push(['vending', 300, ROAD.y0 - 3, -90 * DEG, { count: 1, variant: 3 }]);
  /* The car park: three rows, a car in about every third bay. */
  const STYLES = ['kei', 'keivan', 'hatch', 'wagon', 'minivan', 'kei', 'hatch'];
  let n = 0;
  for (const [y, yaw] of [[205.5, 90], [212.5, -90], [219.5, 90]]) {
    for (let x = 268; x < 410; x += 2.9) {
      n += 1;
      if (hash(n, 11) > 0.34) {
        continue;
      }
      out.push(['car', x, y, yaw * DEG, { variant: 1 + (n % 9) }, { style: STYLES[n % STYLES.length] }]);
    }
  }
  /* A team's car under each awning, nose out to the lane. */
  for (const a of awnings()) {
    out.push(['car', a.car[0], a.car[1], a.face > 0 ? 0 : 180 * DEG, { variant: 1 + a.k }, { style: 'hatch' }]);
  }
  /* The service park's trucks, behind the east row of awnings. */
  [['boxtruck', 22], ['van', 44], ['boxtruck', 62], ['minibus', 84]].forEach(([style, y], i) => {
    out.push(['car', 78, y, 90 * DEG, { variant: 2 + i * 3 }, { style }]);
  });
  for (const t of trees()) {
    out.push(['tree', t.x, t.y, hash(Math.round(t.x * 10), Math.round(t.y)) * 6.28, { size: t.size, variant: t.variant }, { style: t.style }]);
  }
  return out;
}

export function rallyDocument() {
  const elements = rows().map(([type, x, y, yaw, dims, extra = {}], i) => {
    const el = {
      id: `el-${i + 1}`,
      type,
      name: extra.name ?? '',
      position: { x, y, z: extra.z ?? 0 },
      yaw,
      pitch: 0,
      yawOverridden: true,
      dims: { ...dims },
    };
    if (extra.style !== undefined) {
      el.style = extra.style;
    }
    if (extra.points) {
      el.points = extra.points;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: RALLY_DOC_ID,
    name: RALLY_NAME,
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
