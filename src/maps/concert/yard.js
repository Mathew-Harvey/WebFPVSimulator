/*
 * yard.js: the document Hanabi Sound flies in, as ../fest/yard.js is Tonbo
 * Fest's. The place's own structures (the stage, the desk, the towers, the
 * crowd, the wheel) come from ./venue.js as one structure; this is what the
 * built map's document already says well: the plot, the time of day and
 * the ground, the trees round the fence, the light towers on the walks,
 * the backstage containers and vans, every named gap, and where the pilot
 * starts.
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

import { CONCERT_DOC_ID } from '../registry.js';
import { FIELD_W, FIELD_D, FENCE, SPAWN, hash } from './venue.js';

export const CONCERT_NAME = 'Hanabi Sound';

const DEG = Math.PI / 180;

/* The trees: a belt of them outside the fence, cherries to the west and
 * north where the town would be, pines behind the stage. */
function trees() {
  const out = [];
  let i = 0;
  for (let x = 4; x < FIELD_W - 4; x += 9) {
    i += 1;
    out.push({ style: x > 200 ? 'pine' : 'sakura', x: x + hash(i, 1) * 3, y: FENCE.y1 + 6 + hash(i, 2) * 8, size: 0.95 + hash(i, 3) * 0.35 });
    out.push({ style: i % 3 ? 'street' : 'pine', x: x + hash(i, 4) * 3, y: FENCE.y0 - 6 - hash(i, 5) * 8, size: 0.9 + hash(i, 6) * 0.3 });
  }
  for (let y = 26; y < FIELD_D - 20; y += 10) {
    i += 1;
    out.push({ style: 'pine', x: FENCE.x1 + 5 + hash(i, 7) * 4, y: y + hash(i, 8) * 3, size: 1.0 + hash(i, 9) * 0.35 });
  }
  return out;
}

/* The light towers along the walks and round the back of the crowd: lit at
 * dusk, which is when this map is flown. */
function lamps() {
  const out = [];
  for (const x of [44, 70, 96, 122, 148, 174]) {
    out.push({ x, y: 47, yaw: 90 * DEG });
    out.push({ x, y: 167.5, yaw: -90 * DEG });
  }
  for (const y of [62, 88, 132, 158]) {
    out.push({ x: 28, y, yaw: 0 });
  }
  return out;
}

function rows() {
  const out = [];
  out.push({ type: 'startPads', x: SPAWN.x, y: SPAWN.y, yaw: SPAWN.deg * DEG, dims: { pads: 1, spacing: 1.5, padSize: 0.9 } });
  for (const l of lamps()) {
    out.push({ type: 'lamp', x: l.x, y: l.y, yaw: l.yaw, dims: { height: 7.5 } });
  }
  /* The production office: containers two high behind the stage, the
   * open one at the end a tunnel under the one on it. */
  out.push({ type: 'containers', style: '40ft', x: 240, y: 92, yaw: 90 * DEG, dims: { stack: 2, variant: 3 } });
  out.push({ type: 'containers', style: '40ft', x: 240, y: 128, yaw: 90 * DEG, dims: { stack: 2, variant: 5 } });
  out.push({ type: 'containers', style: '40ft open', x: 236, y: 110, yaw: 0, dims: { stack: 2, variant: 7 } });
  /* The trucks that brought the show, and the crew's vans. */
  out.push({ type: 'car', style: 'boxtruck', x: 228, y: 84, yaw: 90 * DEG, dims: { variant: 2 } });
  out.push({ type: 'car', style: 'boxtruck', x: 228, y: 136, yaw: 90 * DEG, dims: { variant: 5 } });
  out.push({ type: 'car', style: 'van', x: 244, y: 154, yaw: 0, dims: { variant: 4 } });
  out.push({ type: 'car', style: 'minivan', x: 244, y: 162, yaw: 0, dims: { variant: 6 } });
  /* The drinks machines by the toilets and the entrance. */
  out.push({ type: 'vending', x: 58, y: 25, yaw: 90 * DEG, dims: { count: 3, variant: 2 } });
  out.push({ type: 'vending', x: 22, y: 136, yaw: 0, dims: { count: 2, variant: 4 } });
  for (const t of trees()) {
    out.push({ type: 'tree', style: t.style, x: t.x, y: t.y, yaw: hash(Math.round(t.x * 10), Math.round(t.y)) * 6.28, dims: { size: t.size, variant: 1 + Math.floor(hash(Math.round(t.y * 10), Math.round(t.x)) * 9) } });
  }
  return out;
}

/* The named gaps, as the document's gap elements. */
function gapRows(gaps) {
  return gaps.map((g) => ({
    type: 'gap', x: g.x, y: g.y, z: g.z, yaw: g.deg * DEG, name: g.name, points: g.points,
    dims: { width: g.w, height: g.h },
  }));
}

/* The place's document, ready for normalize(). `gaps` are ./venue.js's. */
export function concertDocument(gaps = []) {
  const elements = [...rows(), ...gapRows(gaps)].map((r, i) => {
    const el = {
      id: `el-${i + 1}`,
      type: r.type,
      name: r.name ?? '',
      position: { x: r.x ?? 0, y: r.y ?? 0, z: r.z ?? 0 },
      yaw: r.yaw ?? 0,
      pitch: r.pitch ?? 0,
      yawOverridden: r.yaw !== undefined,
      dims: { ...r.dims },
    };
    for (const k of ['style', 'points']) {
      if (r[k] !== undefined) {
        el[k] = r[k];
      }
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: CONCERT_DOC_ID,
    name: CONCERT_NAME,
    createdUtc: '2026-11-02T00:00:00Z',
    modifiedUtc: '2026-11-02T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: FIELD_W, depth: FIELD_D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'dusk', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
