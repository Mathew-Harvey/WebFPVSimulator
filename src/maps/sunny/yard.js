/*
 * yard.js: the document Sunnyfield flies in, as ../bardwell/yard.js is Joshua
 * Bardwell's house's. The town itself comes from ./plan.js as one structure
 * of its own; this is what the built map's document format already says
 * well: the plot, the light and the ground, where the pilot starts, the
 * named gaps, the roads the cars drive and the cars, and the power line.
 *
 * Built fresh on every call and the same every call, with a fixed id, so
 * the map keys its marks and stamps as one place, and the id is the
 * registry's, where src/share/stamps.js can read it without loading the
 * town.
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

import { SUNNY_DOC_ID } from '../registry.js';
import { W, D, SPAWN, sunnyGaps, trafficLoops } from './plan.js';
import { PYLONS } from './landmarks.js';

export const SUNNY_NAME = 'Sunnyfield';

/* Headings in whole degrees, so a yaw is a product and the same bits
 * everywhere. */
const DEG = Math.PI / 180;

/* The cars, each on one of the two loops (./plan.js trafficLoops), a lap
 * shared out evenly, every car on a loop at the loop's one speed so none
 * catches another. */
/* Six, three a loop: a moving car is about fifteen draw calls with its
 * shadow, so each one costs about what a whole chunk of the town does. */
const CARS = [
  ['sedan', 2], ['wagon', 5], ['minivan', 3], ['boxtruck', 1],
  ['hatch', 7], ['van', 2],
];
const SPEED = 12;

function rows() {
  const out = [];
  /* The start: four mats in the town square, facing north to the gorge. */
  out.push(['startPads', SPAWN.px, SPAWN.py, 90 * DEG, { pads: 4, spacing: 1.5, padSize: 0.9 }, { z: SPAWN.h }]);
  /* The named gaps. */
  for (const g of sunnyGaps()) {
    out.push(['gap', g.px, g.py, g.deg * DEG, { width: g.w, height: g.h1 - g.h0 }, { z: g.h0, name: g.name, points: g.points }]);
  }
  /* The power line down the east side. The poles, the lamps and the water
   * tower are the town's own (./streets.js, ./landmarks.js): the builder's
   * are lettered in Japanese. */
  for (const [px, py] of PYLONS) {
    out.push(['pylon', px, py, 90 * DEG, { height: 30 }]);
  }
  /* The two loops and their cars, last, so nothing above moves when a car
   * is added. A road's place is its first node, its nodes relative to it;
   * a vehicle's place is its road and its offset along it. */
  const loops = trafficLoops();
  const first = out.length + 1;
  loops.forEach((l) => {
    const [ox, oy] = l.nodes[0];
    out.push(['road', ox, oy, 0, { width: 4.5, lanes: 1, radius: l.radius }, {
      name: l.name, closed: true, nodes: l.nodes.map(([x, y]) => [x - ox, y - oy]),
    }]);
  });
  const perLoop = CARS.length / loops.length;
  CARS.forEach(([style, variant], i) => {
    const loop = i % loops.length;
    const k = Math.floor(i / loops.length);
    /* An even share of a lap: the loops are about 700 m round. */
    const offset = Math.round((k * 690) / perLoop);
    out.push(['vehicle', 0, 0, 0, { offset, speed: SPEED, variant }, { style, road: `el-${first + loop}` }]);
  });
  return out;
}

/* The town's document, ready for normalize(). */
export function sunnyDocument() {
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
    id: SUNNY_DOC_ID,
    name: SUNNY_NAME,
    createdUtc: '2026-10-28T00:00:00Z',
    modifiedUtc: '2026-10-28T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: W, depth: D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'noon', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
