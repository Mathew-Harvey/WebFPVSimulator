/*
 * yard.js: the document Hayate Circuit flies in, as ../sunny/yard.js is
 * Sunnyfield's. The place's own structures come from ./layout.js as one
 * structure; this is what the built map's document already says well: the
 * plot, the time of day and the ground, the course as a road, the named
 * gaps, where the pilot starts, the cars in the car park and the trees.
 *
 * THE TREES are an autumn hillside's: cedars, dark and straight, in the
 * forest round the outside, and maples through the infield and round the
 * pond and the shrine. A maple is the builder's broadleaf ('street'),
 * drawn by ./index.js in red and orange leaves rather than green, so it
 * costs the same as any tree; the cedars are the document's. They are placed from a fixed integer hash, so the map is the same
 * every time, and none stands on a solid, on the track, in a gravel trap
 * or where a stand, the paddock or the car park is.
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

import { HAYATE_DOC_ID } from '../registry.js';
import { nearestOn } from '../built/road.js';
import {
  W, D, courseElement, courseLine, hash, HALF,
} from './frame.js';
import { hayateLayout, HAYATE_NAME, SPAWN } from './layout.js';
import { CARPARK, POND, SACRED_TREE } from './park.js';
import { PARKED } from './pits.js';

/* Rectangles in the plan no tree may stand in, beyond the solids: the
 * paved and painted ground a tree would stand on. */
const KEEP_OUT = [
  { x0: 150, x1: 540, y0: 50, y1: 180 },
  { x0: CARPARK.x0 - 3, x1: CARPARK.x1 + 3, y0: CARPARK.y0 - 3, y1: CARPARK.y1 + 3 },
  { x0: 258, x1: 342, y0: 276, y1: 330 },
  { x0: 255, x1: 345, y0: 278 - 14, y1: 296 },
  { x0: 455, x1: 525, y0: 126, y1: 196 },
  { x0: 0, x1: W, y0: 0, y1: 18 },
  { x0: 110, x1: 590, y0: 420, y1: 438 },
  { x0: 210, x1: 450, y0: 14, y1: 58 },
  { x0: 136, x1: 164, y0: 226, y1: 258 },
];

function treesOf() {
  const { keep } = hayateLayout();
  const line = courseLine();
  const out = [];
  const clear = (x, y, r) => {
    if (x < 4 || y < 4 || x > W - 4 || y > D - 4) {
      return false;
    }
    /* Off the track and its traps: 30 m from the line covers the deepest
     * trap and the armco behind it. */
    if (nearestOn(line, x, y).d < HALF + 26 + r * 0.3) {
      return false;
    }
    for (const k of KEEP_OUT) {
      if (x > k.x0 && x < k.x1 && y > k.y0 && y < k.y1) {
        return false;
      }
    }
    const pdx = (x - POND.x) / (POND.rx + 4);
    const pdy = (y - POND.y) / (POND.ry + 4);
    if (pdx * pdx + pdy * pdy < 1) {
      return false;
    }
    for (const k of keep) {
      if (x > k.x0 - r && x < k.x1 + r && y > k.y0 - r && y < k.y1 + r) {
        return false;
      }
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
  /* The sacred cedar by the shrine, first, so nothing takes its place. */
  out.push({ style: 'pine', x: SACRED_TREE.x, y: SACRED_TREE.y, size: 1.5, gap: 6 });
  /* The forest: cedars thick round the edges, a few maples among them. */
  for (let i = 0; i < 4000 && out.length < 190; i += 1) {
    const x = 6 + hash(i, 21) * (W - 12);
    const y = 6 + hash(i, 22) * (D - 12);
    const edge = Math.min(x, y, W - x, D - y);
    if (edge > 40 && hash(i, 23) > 0.08) {
      continue;
    }
    const maple = hash(i, 25) < 0.18;
    if (clear(x, y, 3)) {
      out.push({
        style: maple ? 'street' : 'pine', x, y, size: maple ? 0.95 + hash(i, 24) * 0.3 : 0.85 + hash(i, 24) * 0.45, gap: maple ? 7 : 5.5,
      });
    }
  }
  /* The infield: maples, round the pond and the shrine thickest. */
  for (let i = 0; i < 4000 && out.length < 290; i += 1) {
    const x = 110 + hash(i, 31) * 450;
    const y = 180 + hash(i, 32) * 170;
    const nearPond = Math.abs(x - POND.x) < 50 && Math.abs(y - POND.y) < 34;
    const nearShrine = Math.abs(x - 150) < 40 && Math.abs(y - 252) < 50;
    if (!nearPond && !nearShrine && hash(i, 33) > 0.35) {
      continue;
    }
    if (clear(x, y, 3.5)) {
      const cedar = nearShrine && hash(i, 35) < 0.5;
      out.push({
        style: cedar ? 'pine' : 'street', x, y, size: cedar ? 1 + hash(i, 34) * 0.3 : 0.9 + hash(i, 34) * 0.35, gap: 8,
      });
    }
  }
  return out;
}

/*
 * THE RACE CARS: three pairs of GT coupes, the builder's two (src/props/
 * street.js r32 and e82) in their liveries, a pair every third of a lap,
 * nose to tail a few car lengths apart. They are the module's vehicles
 * (src/maps/built/traffic.js) on the course itself, at the module's
 * fastest top speed, 50 m/s down the straight, and cornering at
 * RACE_LATERAL (./index.js hands it the module), so a five inch at full
 * throttle has to work to stay on one. Every car shares the one speed
 * table, so a pair keeps its gap lap after lap and no pair catches
 * another.
 */
export const RACE_SPEED = 50;
export const RACE_LATERAL = 13;
const RACE_GAP = 14;
export const RACE_GROUPS = [
  { name: 'Battle', cars: [['e82', 1], ['r32', 2]], at: 60 },
  { name: 'Battle', cars: [['r32', 3], ['e82', 4]], at: 580 },
  { name: 'Battle', cars: [['e82', 2], ['r32', 1]], at: 1100 },
];

/* The cars parked in the car park: rows nose in, a gap here and there. */
const CAR_STYLES = ['sedan', 'hatch', 'wagon', 'kei', 'minivan', 'van'];
function parked() {
  const out = [];
  let k = 0;
  for (const [y, yaw] of [[CARPARK.y0 + 3.5, Math.PI / 2], [CARPARK.y0 + 20.5, -Math.PI / 2], [CARPARK.y0 + 26.5, Math.PI / 2], [CARPARK.y1 - 3.5, -Math.PI / 2]]) {
    for (let x = CARPARK.x0 + 3.3; x < CARPARK.x1 - 2; x += 2.6) {
      k += 1;
      if (hash(k, 51) < 0.32) {
        continue;
      }
      out.push({
        type: 'car', style: CAR_STYLES[Math.floor(hash(k, 52) * CAR_STYLES.length)], x, y, yaw, dims: { variant: 1 + Math.floor(hash(k, 53) * 8) },
      });
    }
  }
  /* The race cars in their garages, nose out to the pit lane, in the
   * team's order: the two coupes the builder has, in their liveries. */
  PARKED.forEach((c, i) => {
    out.push({
      type: 'car', style: i % 2 ? 'e82' : 'r32', x: c.x, y: c.y, yaw: -Math.PI / 2, dims: { variant: 1 + (c.team % 5) },
    });
  });
  return out;
}

function rows() {
  /* The layout first: it fills PARKED as it builds the garages. */
  hayateLayout();
  const out = [courseElement()];
  /* The race cars, pair by pair round the lap, the leader of each pair
   * last so it is the one furthest along. */
  for (const g of RACE_GROUPS) {
    g.cars.forEach(([style, variant], k) => {
      out.push({
        type: 'vehicle', style, road: 'el-1', drift: false, reverse: false, dims: { speed: RACE_SPEED, offset: g.at + k * RACE_GAP, variant },
      });
    });
  }
  out.push({
    type: 'startPads', x: SPAWN.px, y: SPAWN.py, yaw: SPAWN.yaw, z: SPAWN.h, dims: { pads: 1, spacing: 1.5, padSize: 0.9 },
  });
  for (const g of hayateGaps()) {
    out.push({
      type: 'gap', x: g.px, y: g.py, yaw: (g.deg * Math.PI) / 180, z: g.h0, name: g.name, points: g.points, dims: { width: g.w, height: g.h1 - g.h0 },
    });
  }
  out.push(...parked());
  for (const t of treesOf()) {
    if (t.style !== 'pine') {
      continue;
    }
    out.push({
      type: 'tree', style: t.style, x: t.x, y: t.y, yaw: hash(Math.round(t.x * 10), Math.round(t.y)) * 6.28, dims: { size: t.size, variant: 1 + Math.floor(hash(Math.round(t.y * 10), 5) * 9) },
    });
  }
  return out;
}

function hayateGaps() {
  return hayateLayout().gaps;
}

/*
 * THE MAPLES, as tree elements the document does not hold: ./index.js
 * draws each with the builder's own tree (src/props/street.js), its leaves
 * in the maples' colours, and makes it solid from the same tree's layout.
 * Upright and unturned, so the solid and the drawing are one frame.
 */
export function hayateMaples() {
  return treesOf().filter((t) => t.style === 'street').map((t, i) => ({
    id: `maple-${i + 1}`,
    type: 'tree',
    style: 'street',
    name: '',
    position: { x: t.x, y: t.y, z: 0 },
    yaw: 0,
    pitch: 0,
    yawOverridden: false,
    dims: { size: t.size, variant: 1 + (i % 9) },
  }));
}

export function hayateDocument() {
  const elements = rows().map((r, i) => {
    if (r.type === 'road') {
      return r;
    }
    const el = {
      id: `el-${i + 1}`,
      type: r.type,
      name: r.name ?? '',
      position: { x: r.x ?? 0, y: r.y ?? 0, z: r.z ?? 0 },
      yaw: r.yaw ?? 0,
      pitch: 0,
      yawOverridden: r.yaw !== undefined,
      dims: { ...r.dims },
    };
    for (const k of ['style', 'points', 'road', 'drift', 'reverse']) {
      if (r[k] !== undefined) {
        el[k] = r[k];
      }
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: HAYATE_DOC_ID,
    name: HAYATE_NAME,
    createdUtc: '2026-10-31T00:00:00Z',
    modifiedUtc: '2026-10-31T00:00:00Z',
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
