/*
 * yard.js: the document Drift Matsuri flies in, as ../bardwell/yard.js is
 * Joshua Bardwell's house's. The place's own structures (the pits, the
 * bank, the tower, the stalls, the torii, the barriers) come from
 * ./circuit.js as one structure; this is what the built map's document
 * already says well: the plot, the time of day and the ground, the course
 * as a road, the drift cars on it, the cars parked in the pits, the trees,
 * and where the pilot starts.
 *
 * THE CARS are the built map's drift cars (src/maps/built/traffic.js, its
 * DRIFT car, which the physics module slides through every bend and
 * src/maps/built/cars.js draws countersteering with smoke off its rear
 * tyres), in three groups spread round the lap so there is always a battle
 * somewhere: two tandem pairs, a lead car and a chase car a car length and
 * a half behind it, and a train of three, which is Ebisu's own party
 * trick. Every car has the same top speed, so a group keeps its spacing on
 * the straights and closes up in the bends, as a tandem does.
 *
 * THE TREES are placed from a fixed integer hash, so the map is the same
 * every time: cherries in an avenue down the back of the course and round
 * the outside, pines on the far edge, and none nearer the road than a
 * drifting car's tail swings.
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

import { DRIFT_DOC_ID } from '../registry.js';
import { pointAt, nearestOn } from '../built/road.js';
import {
  FIELD_W, FIELD_D, courseElement, courseLine, circuitLayout, PITS, BANK, TOWER, FAIR, ROAD_WIDTH,
} from './circuit.js';

export const DRIFT_NAME = 'Drift Matsuri';

/* Every drift car's top speed, m/s: about 86 km/h down the straight. */
export const CAR_SPEED = 24;

/*
 * THE GROUPS, in order round the lap: each car's style, livery and where
 * it starts, metres along the course from its first corner. The lead car
 * of a group is the one furthest along. The game reads the same list
 * (GROUPS below) to know which cars run together.
 */
const GAP = 8.5;
export const GROUPS = [
  /* The chase car first, the lead last. */
  { name: 'Tandem', cars: [['e82', 1], ['r32', 1]], at: 40 },
  { name: 'Tandem', cars: [['r32', 2], ['e82', 2]], at: 285 },
  { name: 'Train', cars: [['r32', 3], ['e82', 3], ['r32', 4]], at: 520 },
];

/* A fixed integer hash to [0, 1), so the trees are the same every build. */
function hash(i, salt) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/* Rectangles in the plan no tree may stand in: the structures, and the
 * festival's walk. */
const KEEP_OUT = [
  { x0: PITS.x0 - 4, x1: PITS.x1 + 4, y0: PITS.y0 - 3, y1: 44 },
  { x0: BANK.x0 - 3, x1: BANK.x0 + BANK.steps * BANK.depth + 2, y0: BANK.y0 - 2, y1: BANK.y1 + 2 },
  { x0: TOWER.x - 8, x1: TOWER.x + 8, y0: TOWER.y - 8, y1: TOWER.y + 8 },
  { x0: FAIR.x0 - 6, x1: FAIR.x1 + 6, y0: FAIR.y - 12, y1: FAIR.y + 12 },
];

function trees(line) {
  const out = [];
  /* Round every piece of the furniture, a circle no trunk stands in. */
  const { keep } = circuitLayout();
  const clear = (x, y, r) => {
    for (const k of keep) {
      const dx = k.x - x;
      const dy = k.y - y;
      if (dx * dx + dy * dy < (k.r + 2) * (k.r + 2)) {
        return false;
      }
    }
    if (x < 6 || y < 6 || x > FIELD_W - 6 || y > FIELD_D - 6) {
      return false;
    }
    if (nearestOn(line, x, y).d < ROAD_WIDTH / 2 + r) {
      return false;
    }
    for (const k of KEEP_OUT) {
      if (x > k.x0 && x < k.x1 && y > k.y0 && y < k.y1) {
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
  const put = (style, x, y, size, gap) => {
    out.push({ style, x, y, size, gap });
  };
  /* The avenue: both sides of the back of the course, from turn one's
   * exit through the torii to the hairpin, every nine metres. */
  const s0 = nearestOn(line, 248, 162).s;
  const s1 = nearestOn(line, 60, 178).s;
  for (let s = s0, i = 0; s < s1; s += 9, i += 1) {
    for (const side of [-1, 1]) {
      const p = pointAt(line, s);
      const off = side * (ROAD_WIDTH / 2 + 6.5 + hash(i, side + 3) * 2);
      const x = p.x - p.ty * off;
      const y = p.y + p.tx * off;
      if (clear(x, y, 5.5)) {
        put('sakura', x, y, 1.15 + hash(i, side + 9) * 0.3, 7);
      }
    }
  }
  /* Scattered cherries over the rest of the plot, thinning toward the
   * middle, and pines on the far edges. */
  for (let i = 0; i < 1400 && out.length < 230; i += 1) {
    const x = 8 + hash(i, 11) * (FIELD_W - 16);
    const y = 8 + hash(i, 12) * (FIELD_D - 16);
    const edge = Math.min(x, y, FIELD_W - x, FIELD_D - y);
    const pine = edge < 13 && hash(i, 15) < 0.55;
    const keep = edge < 30 ? 1 : 0.35;
    if (hash(i, 13) > keep) {
      continue;
    }
    if (clear(x, y, pine ? 6 : 6.5)) {
      put(pine ? 'pine' : 'sakura', x, y, pine ? 0.9 + hash(i, 14) * 0.4 : 1 + hash(i, 14) * 0.35, pine ? 7 : 8);
    }
  }
  return out;
}

function rows() {
  const line = courseLine();
  const out = [];
  out.push(courseElement());
  /* The drift cars, group by group, the lead car last so it is the one
   * furthest along. */
  for (const g of GROUPS) {
    g.cars.forEach(([style, variant], k) => {
      out.push({
        type: 'vehicle', style, road: 'el-1', drift: true, reverse: false,
        dims: { speed: CAR_SPEED, offset: g.at + k * GAP, variant },
      });
    });
  }
  /* The start: one pad on the tower's roof, looking out over the straight
   * and turn one, south east. */
  out.push({ type: 'startPads', x: TOWER.x, y: TOWER.y, yaw: -Math.PI / 4, z: TOWER.top, dims: { pads: 1, spacing: 1.5, padSize: 0.9 } });
  /* The pit cars, nose in to their garages, one in every bay but the
   * ends. */
  for (let k = 1; k < 14; k += 2) {
    const style = k % 4 === 1 ? 'r32' : 'e82';
    out.push({ type: 'car', style, x: PITS.x0 + 5 + k * 10, y: PITS.y1 + 3.2, yaw: -Math.PI / 2, dims: { variant: 1 + (k % 5) } });
  }
  for (const t of trees(line)) {
    out.push({ type: 'tree', style: t.style, x: t.x, y: t.y, yaw: hash(Math.round(t.x * 10), Math.round(t.y)) * 6.28, dims: { size: t.size, variant: 1 + Math.floor(hash(Math.round(t.y * 10), 5) * 9) } });
  }
  return out;
}

export function driftDocument() {
  const elements = rows().map((r, i) => {
    if (r.type === 'road') {
      return r;
    }
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
    for (const k of ['style', 'road', 'drift', 'reverse']) {
      if (r[k] !== undefined) {
        el[k] = r[k];
      }
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: DRIFT_DOC_ID,
    name: DRIFT_NAME,
    createdUtc: '2026-10-28T00:00:00Z',
    modifiedUtc: '2026-10-28T00:00:00Z',
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

/* Which drift car is in which group, by element id, for the game: the
 * same order rows() puts them in. */
export function groupIds(doc) {
  const cars = doc.elements.filter((e) => e.type === 'vehicle');
  const out = [];
  let k = 0;
  for (const g of GROUPS) {
    out.push({ name: g.name, ids: cars.slice(k, k + g.cars.length).map((e) => e.id) });
    k += g.cars.length;
  }
  return out;
}
