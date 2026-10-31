/*
 * yard.js: Bakuon Dome's document. The hall itself is ./stadium.js's, so
 * what this holds is everything a builder's element can say: the start
 * pad on the floor, the named gaps, and the town round the dome, which is
 * the town's own assets (shops, flats and offices on the streets, the
 * poles and their wires, lamps, vending machines, sakura and pines, the
 * cars in the car park, the haulers and the containers in the pits).
 *
 * Plan coordinates, as every document's: x east from the field's west
 * edge, y south from its north edge (./stadium.js toPlan).
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

import { DOME_DOC_ID } from '../registry.js';
import {
  DOME_NAME, FIELD_W, FIELD_D, SPAWN, OUTER, GATES, toPlan, domeGaps,
} from './stadium.js';

function hash(i, salt) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

const Q = Math.PI / 2;

/* Where the dome stands in the plan, with a margin for its canopies. */
const HALL = (() => {
  const [x0, y0] = toPlan(-OUTER.x - 6, OUTER.z + 6);
  const [x1, y1] = toPlan(OUTER.x + 6, -OUTER.z - 6);
  return { x0, y0, x1, y1 };
})();

function rows() {
  const out = [];
  /* The start: one pad on the floor at the west end, facing east down the
   * hall, the infield open in front of it. */
  {
    const [x, y] = toPlan(SPAWN.x, SPAWN.z);
    out.push({
      type: 'startPads', x, y, yaw: 0, dims: { pads: 1, spacing: 1.5, padSize: 0.9 },
    });
  }
  /* The named gaps. */
  for (const g of domeGaps()) {
    const [x, y] = toPlan(g.x, g.z);
    out.push({
      type: 'gap', x, y, z: g.y, yaw: g.yaw, dims: { width: g.w, height: g.h }, name: g.name, points: g.points,
    });
  }
  /* THE STREETS. A row of shops and flats along the north and the south
   * edges, facing the dome across the plaza; offices on the east. */
  const STYLES = ['shop', 'flats', 'shop', 'shop', 'flats', 'office'];
  let v = 1;
  for (const [y, yaw] of [[22, -Q], [FIELD_D - 22, Q]]) {
    for (let x = 18; x < FIELD_W - 16; x += 0) {
      const style = STYLES[v % STYLES.length];
      const w = style === 'shop' ? 8 + Math.floor(hash(v, 1) * 3) : (style === 'flats' ? 16 : 18);
      const floors = style === 'shop' ? 2 + Math.floor(hash(v, 2) * 3) : (style === 'flats' ? 4 + Math.floor(hash(v, 3) * 3) : 6 + Math.floor(hash(v, 4) * 4));
      const depth = style === 'shop' ? 11 : (style === 'flats' ? 10 : 14);
      out.push({
        type: 'building', style, x: x + w / 2, y, yaw, dims: { width: w, depth, floors, passage: 0, variant: v },
      });
      v += 1;
      x += w + 0.6;
    }
  }
  /* Offices up the east edge, behind the pits. */
  for (let y = 70; y < FIELD_D - 60; y += 22) {
    out.push({
      type: 'building', style: 'office', x: FIELD_W - 14, y, yaw: Math.PI, dims: {
        width: 18, depth: 14, floors: 5 + Math.floor(hash(y, 5) * 6), passage: 0, variant: v,
      },
    });
    v += 1;
  }
  /* The poles along both streets, the lamps across the plaza. */
  for (const y of [38, FIELD_D - 38]) {
    for (let x = 14; x < FIELD_W - 10; x += 26) {
      out.push({
        type: 'utilityPole', x, y, yaw: 0, dims: { height: 10 },
      });
    }
  }
  for (const y of [HALL.y0 - 10, HALL.y1 + 10]) {
    for (let x = HALL.x0; x <= HALL.x1; x += 20) {
      out.push({
        type: 'lamp', x, y, yaw: 0, dims: { height: 7 },
      });
    }
  }
  /* Vending machines by every gate, the way a Japanese station has them. */
  for (const s of [-1, 1]) {
    GATES.x.forEach((gx, i) => {
      const [x, y] = toPlan(gx + 8, s * (OUTER.z + OUTER.t + 1));
      out.push({
        type: 'vending', x, y, yaw: s > 0 ? Q : -Q, dims: { count: 2 + (i % 2), variant: 1 + i },
      });
    });
  }
  /* THE TREES: sakura round the plaza, pines in the corners. */
  for (const y of [HALL.y0 - 18, HALL.y1 + 18]) {
    for (let x = 30; x < FIELD_W - 30; x += 11) {
      if (x > HALL.x0 - 4 && x < HALL.x1 + 4 && Math.abs(y - FIELD_D / 2) < 100) {
        if (GATES.x.some((g) => Math.abs(toPlan(g, 0)[0] - x) < 10)) {
          continue;
        }
      }
      out.push({
        type: 'tree', style: 'sakura', x: x + (hash(x, 7) - 0.5) * 2, y, yaw: hash(x, 8) * 6.28, dims: { size: 0.9 + hash(x, 9) * 0.3, variant: 1 + Math.floor(hash(x, 10) * 9) },
      });
    }
  }
  for (let i = 0; i < 18; i += 1) {
    const x = i < 9 ? 14 + hash(i, 11) * 70 : FIELD_W - 84 + hash(i, 11) * 30;
    const y = 50 + hash(i, 12) * (FIELD_D - 100);
    if (i >= 9 && y > 110 && y < 220) {
      continue;
    }
    out.push({
      type: 'tree', style: 'pine', x, y, yaw: hash(i, 13) * 6.28, dims: { size: 0.9 + hash(i, 14) * 0.4, variant: 1 + (i % 9) },
    });
  }
  /* THE CAR PARK, west of the dome: rows of cars nose in. */
  const CARS = ['sedan', 'hatch', 'wagon', 'minivan', 'kei', 'sedan', 'van'];
  let c = 0;
  for (let row = 0; row < 4; row += 1) {
    const x = 34 + row * 16;
    for (let y = 110; y < 222; y += 3.2) {
      if (hash(c, 21) < 0.28) {
        c += 1;
        continue;
      }
      out.push({
        type: 'car', style: CARS[c % CARS.length], x: x + (row % 2) * 5.5, y, yaw: row % 2 ? Math.PI : 0, dims: { variant: 1 + (c % 9) },
      });
      c += 1;
    }
  }
  /* THE PITS, east of the dome: the trucks' haulers and the crews'
   * containers. */
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = toPlan(OUTER.x + 22, -36 + i * 24);
    out.push({
      type: 'car', style: 'boxtruck', x, y, yaw: Q, dims: { variant: 2 + i * 2 },
    });
    out.push({
      type: 'containers', style: '40ft', x: x + 14, y, yaw: Q, dims: { stack: 1 + (i % 2), variant: 1 + i },
    });
  }
  return out;
}

export function domeDocument() {
  const elements = rows().map((r, i) => {
    const el = {
      id: `el-${i + 1}`,
      type: r.type,
      name: r.name ?? '',
      position: { x: r.x, y: r.y, z: r.z ?? 0 },
      yaw: r.yaw ?? 0,
      pitch: 0,
      yawOverridden: r.yaw !== undefined,
      dims: { ...r.dims },
    };
    if (r.style !== undefined) {
      el.style = r.style;
    }
    if (r.points !== undefined) {
      el.points = r.points;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: DOME_DOC_ID,
    name: DOME_NAME,
    createdUtc: '2026-10-31T00:00:00Z',
    modifiedUtc: '2026-10-31T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: FIELD_W, depth: FIELD_D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'noon', ground: 'concrete' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
