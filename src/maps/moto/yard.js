/*
 * yard.js: the document Ridgeline MX flies in, as ../drift/yard.js is
 * Drift Matsuri's. The place's structures (the tower, the stand, the
 * tents, the mounds and the berms) come from ./circuit.js as one structure
 * and the bikes from ./traffic.js; this is what the built map's document
 * already says well: the plot, the time of day and the ground, the pilot's
 * start, the vans in the paddock and the trees.
 *
 * THE TREES are placed from a fixed integer hash, so the map is the same
 * every time: pines and cherries standing back from the course, thick on
 * the far edges, none within a bike's fall of the line.
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

import { MOTO_DOC_ID } from '../registry.js';
import { nearestOn } from '../built/road.js';
import {
  FIELD_W, FIELD_D, circuitLayout, TOWER, TRACK_WIDTH,
} from './circuit.js';

export const MOTO_NAME = 'Ridgeline MX';

/* A fixed integer hash to [0, 1), so the trees are the same every build. */
function hash(i, salt) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function trees() {
  const { line, keep } = circuitLayout();
  const out = [];
  const clear = (x, y, r) => {
    if (x < 6 || y < 6 || x > FIELD_W - 6 || y > FIELD_D - 6) {
      return false;
    }
    if (nearestOn(line, x, y).d < TRACK_WIDTH / 2 + 11 + r) {
      return false;
    }
    for (const k of keep) {
      const dx = k.x - x;
      const dy = k.y - y;
      if (dx * dx + dy * dy < (k.r + 3) * (k.r + 3)) {
        return false;
      }
    }
    if (Math.abs(x - TOWER.x) < 9 && Math.abs(y - TOWER.y) < 9) {
      return false;
    }
    for (const t of out) {
      const dx = t.x - x;
      const dy = t.y - y;
      if (dx * dx + dy * dy < t.gap * t.gap) {
        return false;
      }
    }
    return true;
  };
  for (let i = 0; i < 2200 && out.length < 260; i += 1) {
    const x = 8 + hash(i, 11) * (FIELD_W - 16);
    const y = 8 + hash(i, 12) * (FIELD_D - 16);
    const edge = Math.min(x, y, FIELD_W - x, FIELD_D - y);
    const pine = hash(i, 15) < (edge < 26 ? 0.7 : 0.4);
    const keepP = edge < 34 ? 1 : 0.3;
    if (hash(i, 13) > keepP) {
      continue;
    }
    if (clear(x, y, pine ? 5 : 6)) {
      out.push({
        style: pine ? 'pine' : 'sakura', x, y, size: pine ? 0.9 + hash(i, 14) * 0.45 : 1 + hash(i, 14) * 0.35, gap: pine ? 6 : 8,
      });
    }
  }
  return out;
}

function rows() {
  const out = [];
  /* The start: one pad on the photographers' tower, looking south over the
   * start straight. */
  out.push({
    type: 'startPads', x: TOWER.x, y: TOWER.y, yaw: -Math.PI / 2, z: TOWER.top, dims: { pads: 1, spacing: 1.5, padSize: 0.9 },
  });
  /* The team vans in the paddock, nose out. */
  [['van', 205], ['boxtruck', 229], ['minibus', 253]].forEach(([style, x], i) => {
    out.push({
      type: 'car', style, x, y: 112, yaw: Math.PI / 2, dims: { variant: 2 + i * 3 },
    });
  });
  for (const t of trees()) {
    out.push({
      type: 'tree', style: t.style, x: t.x, y: t.y, yaw: hash(Math.round(t.x * 10), Math.round(t.y)) * 6.28, dims: { size: t.size, variant: 1 + Math.floor(hash(Math.round(t.y * 10), 5) * 9) },
    });
  }
  return out;
}

export function motoDocument() {
  const elements = rows().map((r, i) => {
    const el = {
      id: `el-${i + 1}`,
      type: r.type,
      name: '',
      position: { x: r.x ?? 0, y: r.y ?? 0, z: r.z ?? 0 },
      yaw: r.yaw ?? 0,
      pitch: 0,
      yawOverridden: r.yaw !== undefined,
      dims: { ...r.dims },
    };
    if (r.style !== undefined) {
      el.style = r.style;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: MOTO_DOC_ID,
    name: MOTO_NAME,
    createdUtc: '2026-10-29T00:00:00Z',
    modifiedUtc: '2026-10-29T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: FIELD_W, depth: FIELD_D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'golden', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
