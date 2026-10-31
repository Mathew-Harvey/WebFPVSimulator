/*
 * yard.js: Momiji Pass's document, the part of the map the builder's own
 * pieces say: where the pilot starts, the named gaps, the parked cars and
 * vending machines, the utility poles the built map wires up, and the road
 * the moving cars drive with the cars on it. The ground, the road's
 * drawing and everything built is ./places.js, handed to the built map as
 * one structure of its own (./index.js).
 *
 * THE START is on the rest stop's car park at the pass, facing south over
 * the top road and the lookout to the west face, the hairpins below it, the
 * gorge and the valley: the first line is a dive off the mountain.
 *
 * THE CARS keep to the left, as they do in Japan: one closed road of two
 * lanes, the loop, with half the cars driving it one way and half the
 * other (../built/traffic.js turns a reversed car to its own left). Every
 * car has the same top speed and the same cornering, so none catches the
 * one ahead (./index.js holds them to it after the built map has read
 * them).
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

import { TOUGE_DOC_ID } from '../registry.js';
import { NODES, SUMMIT, REST, VALLEY_Y, HALF, ROAD_W, BEND_R, centre } from './route.js';
import { floorAt } from './terrain.js';
import { gaps } from './places.js';

export const TOUGE_NAME = 'Momiji Pass';

const DEG = Math.PI / 180;

/* Where the pilot starts: the car park, facing south. */
export const SPAWN = { x: 136, y: 292, h: SUMMIT, deg: -90 };

/* The moving cars: style and paint, five a way round the loop. */
const CARS = [
  ['kei', 2], ['hatch', 5], ['minivan', 3], ['sedan', 7], ['keivan', 1],
  ['wagon', 4], ['kei', 8], ['boxtruck', 1], ['hatch', 2], ['sedan', 3],
];
export const CAR_SPEED = 12;

function rows() {
  const out = [];
  out.push(['startPads', SPAWN.x, SPAWN.y, SPAWN.deg * DEG, { pads: 1, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  for (const g of gaps()) {
    out.push(['gap', g.x, g.y, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  /* The rest stop's parked cars, nose to the wall, and its machines. */
  [['kei', 3, 167.5], ['minivan', 6, 176.5], ['sedan', 1, 188.5], ['wagon', 9, 200.5], ['hatch', 4, 209.5]].forEach(([style, variant, x]) => {
    out.push(['car', x, REST.y0 + 9, 90 * DEG, { variant }, { style, z: SUMMIT }]);
  });
  out.push(['vending', 172, REST.y1 - 1.2, -90 * DEG, { count: 3, variant: 2 }, { z: SUMMIT }]);
  /* The hamlet's machines by the bus stop, and a car in a yard. */
  out.push(['vending', 222, VALLEY_Y - HALF - 4.2, 90 * DEG, { count: 2, variant: 5 }, {}]);
  out.push(['car', 168, 24, 0, { variant: 6 }, { style: 'keivan' }]);
  out.push(['car', 250, 22, 0, { variant: 2 }, { style: 'kei' }]);
  /* The poles: along the valley road's south side, and up the east face
   * beside leg E1, which is how the hamlet's line reaches the pass. */
  for (let x = 132; x <= 300; x += 28) {
    out.push(['utilityPole', x, VALLEY_Y - HALF - 2.2, 0, { height: 10 }, {}]);
  }
  for (let x = 330; x <= 410; x += 30) {
    const y = 168 - HALF - 2.4;
    out.push(['utilityPole', x, y, 0, { height: 10 }, { z: floorAt(x, y) }]);
  }
  /* The loop and its cars, last. */
  const first = out.length + 1;
  const [ox, oy] = NODES[0];
  out.push(['road', ox, oy, 0, { width: ROAD_W, lanes: 2, radius: BEND_R }, {
    name: 'The pass road', closed: true, nodes: NODES.map(([x, y]) => [x - ox, y - oy]),
  }]);
  const L = centre().length;
  CARS.forEach(([style, variant], i) => {
    const reverse = i % 2 === 1;
    const k = Math.floor(i / 2);
    const offset = Math.round(((k + (reverse ? 0.5 : 0)) * L) / (CARS.length / 2));
    out.push(['vehicle', 0, 0, 0, { offset, speed: CAR_SPEED, variant }, { style, road: `el-${first}`, reverse }]);
  });
  return out;
}

/* The pass's document, ready for normalize(). */
export function tougeDocument() {
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
      el.reverse = extra.reverse === true;
      el.drift = false;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: TOUGE_DOC_ID,
    name: TOUGE_NAME,
    createdUtc: '2026-10-31T00:00:00Z',
    modifiedUtc: '2026-10-31T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: 460, depth: 460, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'golden', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
