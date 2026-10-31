/*
 * yard.js: the document Hinode Park flies in, as ../sunny/yard.js is
 * Sunnyfield's. The park itself comes from ./plan.js as one structure of
 * its own; this is what the built map's document format already says
 * well: the plot, the light and the ground, where the pilot starts, the
 * named gaps, the town's utility poles round the lane (the built map
 * strings their wires), the lane the cars drive and the cars.
 *
 * GOLDEN HOUR, the town's own light number for number (../built/looks.js),
 * because the owner asked for the park to look like the town: the warm sun
 * low in the west, violet shadows, the pink haze on the horizon.
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

import { PARK_DOC_ID } from '../registry.js';
import { W, D, SPAWN, parkGaps, trafficLoops, polePoints } from './plan.js';

export const PARK_NAME = 'Hinode Park';

/* Headings in whole degrees, so a yaw is a product and the same bits
 * everywhere. */
const DEG = Math.PI / 180;

/* Three cars on the lane: a moving car is about fifteen draw calls with
 * its shadow, so three and no more. */
const CARS = [['kei', 4], ['keivan', 2], ['minibus', 1]];
const SPEED = 9;

function rows() {
  const out = [];
  out.push(['startPads', SPAWN.px, SPAWN.py, 90 * DEG, { pads: 4, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  for (const g of parkGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  for (const [px, py] of polePoints()) {
    out.push(['utilityPole', px, py, 0, { height: 10 }]);
  }
  const loops = trafficLoops();
  const first = out.length + 1;
  loops.forEach((l) => {
    const [ox, oy] = l.nodes[0];
    out.push(['road', ox, oy, 0, { width: 6, lanes: 2, radius: l.radius }, {
      name: l.name, closed: true, nodes: l.nodes.map(([x, y]) => [x - ox, y - oy]),
    }]);
  });
  CARS.forEach(([style, variant], i) => {
    /* An even share of the lane, which is about 800 m round. */
    const offset = Math.round((i * 800) / CARS.length);
    out.push(['vehicle', 0, 0, 0, { offset, speed: SPEED, variant }, { style, road: `el-${first}` }]);
  });
  return out;
}

/* The park's document, ready for normalize(). */
export function parkDocument() {
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
    if (type === 'road') {
      el.nodes = extra.nodes.map(([nx, ny]) => ({ x: nx, y: ny }));
      el.closed = extra.closed === true;
    }
    if (type === 'vehicle') {
      el.road = extra.road;
      el.reverse = false;
      el.drift = false;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: PARK_DOC_ID,
    name: PARK_NAME,
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
