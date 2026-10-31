/*
 * yard.js: the document Tonbo Fest flies in, as ../drift/yard.js is Drift
 * Matsuri's. The place's own structures (the levee, the sluice, the
 * railway, the nets, the inflatables, the stand, the pits, the stage, the
 * stalls) come from ./venue.js as one structure; this is what the built
 * map's document already says well: the plot, the time of day and the
 * ground, the track builder's own gates where the race uses them, the
 * race's turn flags, the trees, the pylons and the utility poles with
 * their wires, the houses over the levee, the parked cars, the vending
 * machines, every named gap, and where the pilot starts.
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

import { FEST_DOC_ID } from '../registry.js';
import {
  FIELD_W, FIELD_D, GATES, TURN_FLAGS, MGP, MGP_PITCH, DIVE, SPAWN, LEVEE, PITS, SLUICE, GATEWAY, FOOD, RAIL, hash,
} from './venue.js';

export const FEST_NAME = 'Tonbo Fest';

const DEG = Math.PI / 180;

/* The builder's gates, as ./venue.js names them. */
const GATE_TYPE = { flag: 'flaggedGate', stack: 'doubleStack', ladder: 'ladder', dive: 'diveGate' };

function builderGates() {
  const out = [];
  GATES.forEach((g, i) => {
    const type = GATE_TYPE[g.kind];
    if (!type) {
      return;
    }
    if (type === 'diveGate') {
      out.push({
        type, x: g.x, y: g.y, yaw: g.deg * DEG, pitch: Math.PI / 2,
        dims: { levels: 1, sillH: DIVE.sill, clearW: DIVE.clearW, clearH: DIVE.clearH, levelPitch: DIVE.pitch },
      });
      return;
    }
    const levels = type === 'doubleStack' ? 2 : type === 'ladder' ? 3 : 1;
    const dims = { levels, sillH: 0, clearW: MGP, clearH: MGP, levelPitch: MGP_PITCH };
    const el = { type, x: g.x, y: g.y, yaw: g.deg * DEG, dims };
    if (type === 'flaggedGate') {
      dims.flagH = 1.45;
      el.flagSide = i % 3 === 0 ? 'both' : (i % 2 ? 'left' : 'right');
    }
    out.push(el);
  });
  return out;
}

/* The trees: cherries along the foot of the levee, willows by the river,
 * pines round the ball field, a few in the lane behind the levee. */
function trees() {
  const out = [];
  const clear = (x) => !(x > SLUICE.x0 - 8 && x < SLUICE.x1 + 8) && !(x > GATEWAY.x - 12 && x < GATEWAY.x + 20)
    && !(x > FOOD.walk0 - 8 && x < FOOD.walk1 + 8) && !(x > RAIL.x0 - 9 && x < RAIL.x1 + 9) && x > 30;
  for (let x = 34, i = 0; x < 300; x += 11, i += 1) {
    if (clear(x)) {
      out.push({ style: 'sakura', x: x + hash(i, 1) * 3, y: LEVEE.y0 - 2.4, size: 1.05 + hash(i, 2) * 0.3 });
    }
  }
  for (let x = 6, i = 0; x < 316; x += 16, i += 1) {
    if (x > 30 && x < PITS.x0 + PITS.n * PITS.step + 6) {
      continue;
    }
    if (x > RAIL.x0 - 6 && x < RAIL.x1 + 6) {
      continue;
    }
    out.push({ style: 'street', x: x + hash(i, 3) * 4, y: 28.6, size: 0.95 + hash(i, 4) * 0.3 });
  }
  for (let y = 60, i = 0; y < 178; y += 13, i += 1) {
    out.push({ style: 'pine', x: 3 + hash(i, 5) * 2, y, size: 0.9 + hash(i, 6) * 0.35 });
  }
  return out;
}

/* The houses over the levee: a lane of two and three storey houses and
 * shops facing it, as a river town's back streets do. */
function houses() {
  const out = [];
  const xs = [8, 24, 41, 58, 76, 95, 136, 152, 170, 188, 206, 224, 242, 292, 308];
  xs.forEach((x, i) => {
    const flats = i % 3 === 1;
    out.push({
      type: 'building', style: flats ? 'flats' : 'shop', x, y: 230.5, yaw: -90 * DEG,
      dims: { width: flats ? 15 : 13, depth: 9, floors: flats ? 3 : 2, passage: 0, variant: 1 + (i % 7) },
    });
  });
  return out;
}

/* Parked: the teams' vans behind the pits, the kitchen cars by the food
 * court, and the car park under the railway. */
function cars() {
  const out = [];
  const styles = ['keivan', 'kei', 'minivan', 'wagon', 'hatch', 'van'];
  for (let i = 0; i < PITS.n; i += 1) {
    out.push({ type: 'car', style: styles[i % 3], x: PITS.x0 + i * PITS.step + 1.5, y: 25.2, yaw: 0, dims: { variant: 1 + i } });
  }
  out.push({ type: 'car', style: 'boxtruck', x: 207, y: 140, yaw: 90 * DEG, dims: { variant: 3 } });
  out.push({ type: 'car', style: 'boxtruck', x: 207, y: 162, yaw: 90 * DEG, dims: { variant: 6 } });
  let k = 0;
  for (const x of [284, 296, 310]) {
    for (let y = 48; y < 166; y += 6.5) {
      k += 1;
      if (hash(k, 61) < 0.25) {
        continue;
      }
      out.push({
        type: 'car', style: styles[Math.floor(hash(k, 62) * styles.length)], x, y,
        yaw: x === 296 ? 180 * DEG : 0, dims: { variant: 1 + Math.floor(hash(k, 63) * 9) },
      });
    }
  }
  return out;
}

function rows() {
  const out = [];
  /* The start: one pad on the grass behind the arch, looking down the
   * straight. */
  out.push({ type: 'startPads', x: SPAWN.x, y: SPAWN.y, yaw: SPAWN.deg * DEG, dims: { pads: 1, spacing: 1.5, padSize: 0.9 } });
  out.push(...builderGates());
  for (const f of TURN_FLAGS) {
    out.push({ type: 'flag', x: f.x, y: f.y, yaw: 0, dims: { height: 2.5, poleRadius: 0.025, clearance: 1.5 } });
  }
  /* The line over the west end, on two lattice pylons. */
  out.push({ type: 'pylon', x: 24, y: 40, yaw: 90 * DEG, dims: { height: 32 } });
  out.push({ type: 'pylon', x: 24, y: 120, yaw: 90 * DEG, dims: { height: 32 } });
  /* The lane's poles, wired, and its lamps. */
  for (const x of [8, 38, 68, 98, 128, 158, 188, 218, 248, 288, 318]) {
    out.push({ type: 'utilityPole', x, y: LEVEE.lane1 - 0.6, yaw: 0, dims: { height: 10 } });
  }
  for (const x of [52, 112, 172, 232, 300]) {
    out.push({ type: 'lamp', x, y: LEVEE.lane0 + 0.5, yaw: -90 * DEG, dims: { height: 6.5 } });
  }
  out.push(...houses());
  /* The drinks machines: by the food court, by the stairs, by the pits. */
  out.push({ type: 'vending', x: 215, y: 176.5, yaw: -90 * DEG, dims: { count: 3, variant: 2 } });
  out.push({ type: 'vending', x: 136, y: 181.5, yaw: -90 * DEG, dims: { count: 2, variant: 4 } });
  out.push({ type: 'vending', x: 186.5, y: 31, yaw: 180 * DEG, dims: { count: 2, variant: 1 } });
  out.push(...cars());
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
export function festDocument(gaps = []) {
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
    for (const k of ['style', 'flagSide', 'points']) {
      if (r[k] !== undefined) {
        el[k] = r[k];
      }
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: FEST_DOC_ID,
    name: FEST_NAME,
    createdUtc: '2026-10-31T00:00:00Z',
    modifiedUtc: '2026-10-31T00:00:00Z',
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
