/*
 * yard.js: the document Ekimae Drift flies in, as ../drift/yard.js is Drift
 * Matsuri's. The place's own structures (the expressway, the viaduct and
 * the station, the car park, the petrol station, the police box, the
 * footbridge, the shrine, the rotary, the arcade's roof and the barriers)
 * come from ./plan.js as one structure; this is what the built map's
 * document already says well: the plot, the time of day and the ground,
 * the course as a road, the drift cars on it, the town's own buildings
 * along every street, the poles and their wires, the lamps, the trees, the
 * cars parked on the streets the course does not use, the named gaps and
 * where the pilot starts.
 *
 * THE BUILDINGS are the town's (src/props/buildings.js): shops with a flat
 * over them along the busy fronts, blocks of flats behind, offices by the
 * station and the expressway, warehouses on the harbour side. They are laid
 * along each street front from a fixed seed, every one checked against the
 * course, the structures and its neighbours before it is kept: two either
 * touch or stand an alley apart (the gap rule, src/props/parts.js).
 *
 * THE CARS are the built map's drift cars (src/maps/built/traffic.js), in
 * three tandem pairs spread round the lap, a lead car and a chase car a car
 * length and a half behind it.
 *
 * Built fresh on every call and the same every call, with a fixed id, so
 * the map keys its marks and stamps as one place.
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

import { EKIMAE_DOC_ID } from '../registry.js';
import { nearestOn } from '../built/road.js';
import { GAP_MIN } from '../../props/parts.js';
import {
  W, D, HALF, courseElement, courseLine, rng, plan,
} from './frame.js';
import { ekimaeLayout, ekimaeGaps, START, CP } from './plan.js';

export const EKIMAE_NAME = 'Ekimae Drift';

/* Every drift car's top speed, m/s: about 86 km/h down the straight. */
export const CAR_SPEED = 24;

/*
 * THE GROUPS, in order round the lap: each car's style, livery and where
 * it starts, metres along the course from its first node. The chase car
 * first, the lead last. The game reads the same list.
 */
const GAP = 8.5;
export const GROUPS = [
  { name: 'Tandem', cars: [['e82', 5], ['r32', 5]], at: 30 },
  { name: 'Tandem', cars: [['r32', 6], ['e82', 6]], at: 370 },
  { name: 'Tandem', cars: [['e82', 7], ['r32', 7]], at: 700 },
];

const DEG = Math.PI / 180;

/* The way a front faces, as a plan heading for the element's +x. */
const FACE = { e: 0, n: 90 * DEG, w: 180 * DEG, s: -90 * DEG };

/* What may stand on a front, by the kind of street it is on. */
const MIX = {
  shops: [['shop', 0.7], ['flats', 0.2], ['office', 0.1]],
  station: [['office', 0.5], ['shop', 0.4], ['flats', 0.1]],
  homes: [['flats', 0.6], ['shop', 0.4]],
  harbour: [['warehouse', 0.6], ['office', 0.25], ['flats', 0.15]],
  tall: [['office', 0.55], ['flats', 0.45]],
};

function pickStyle(r, mix) {
  let t = r.next();
  for (const [style, p] of mix) {
    t -= p;
    if (t <= 0) {
      return style;
    }
  }
  return mix[0][0];
}

/* A building's size by its style: width along the front, depth back from
 * it, and its storeys. */
function sizeOf(r, style, depthMax, tall) {
  if (style === 'shop') {
    return { width: r.int(6, 10), depth: Math.min(depthMax, r.int(9, 12)), floors: r.int(2, 4) };
  }
  if (style === 'office') {
    return { width: r.int(12, 18), depth: Math.min(depthMax, r.int(11, 16)), floors: r.int(tall ? 6 : 4, tall ? 10 : 7) };
  }
  if (style === 'warehouse') {
    return { width: r.int(18, 30), depth: Math.min(depthMax, r.int(14, 22)), floors: r.int(1, 2) };
  }
  return { width: r.int(12, 18), depth: Math.min(depthMax, r.int(8, 10)), floors: r.int(3, tall ? 8 : 6) };
}

/*
 * THE FRONTS: a street front is a line in the plan the buildings stand
 * back from, which way they face, how deep they may go, and what kind of
 * street it is. `a` and `b` run along the front (x for a north or south
 * face, y for an east or west one), `at` is the front line.
 */
const FRONTS = [
  /* the straight's north side, between the petrol station and the manji */
  { face: 's', at: 65.5, a: 108, b: 200, depth: 9, mix: 'shops', tall: false },
  /* the back street's south side, back to back with them */
  { face: 'n', at: 83, a: 108, b: 198, depth: 8, mix: 'homes' },
  /* the big block east of the manji: the straight, the station road,
   * the manji's east side, and a row inside facing the viaduct */
  { face: 's', at: 65.5, a: 228, b: 298, depth: 16, mix: 'tall', tall: true },
  { face: 'e', at: 313, a: 80, b: 141, depth: 16, mix: 'station' },
  { face: 'w', at: 229, a: 84, b: 141, depth: 14, mix: 'homes' },
  { face: 'n', at: 141, a: 244, b: 296, depth: 12, mix: 'homes' },
  /* the shrine's block */
  { face: 's', at: 103, a: 64, b: 120, depth: 11, mix: 'homes' },
  { face: 's', at: 103, a: 142, b: 182, depth: 11, mix: 'homes' },
  { face: 'n', at: 141, a: 64, b: 100, depth: 13, mix: 'homes' },
  /* behind the car park */
  { face: 'e', at: 34, a: 110, b: 141, depth: 12, mix: 'homes' },
  /* west of the rotary: the north street, and the viaduct's lane */
  { face: 'n', at: 217, a: 2, b: 106, depth: 13, mix: 'shops' },
  { face: 's', at: 159, a: 2, b: 96, depth: 13, mix: 'shops' },
  { face: 'e', at: 98, a: 175, b: 200, depth: 12, mix: 'station' },
  /* the arcade's block: the arcade's two rows, the north street, and the
   * viaduct's lane */
  { face: 'n', at: 184, a: 224, b: 314, depth: 10, mix: 'shops', arcade: true },
  { face: 's', at: 192, a: 224, b: 314, depth: 10, mix: 'shops', arcade: true },
  { face: 'n', at: 217, a: 224, b: 314, depth: 12, mix: 'shops' },
  { face: 's', at: 159, a: 236, b: 314, depth: 12, mix: 'station' },
  /* the island inside the rotary's loop */
  { face: 'n', at: 217, a: 146, b: 206, depth: 9, mix: 'shops' },
  /* the harbour side, east of the station road */
  { face: 'w', at: 332, a: 66, b: 141, depth: 28, mix: 'harbour' },
  { face: 'w', at: 332, a: 159, b: 218, depth: 24, mix: 'harbour' },
  { face: 's', at: 65.5, a: 340, b: 398, depth: 30, mix: 'harbour' },
  /* north of the north street, and a second row behind it */
  { face: 's', at: 238.5, a: 2, b: 314, depth: 13, mix: 'shops' },
  { face: 's', at: 238.5, a: 332, b: 398, depth: 14, mix: 'tall', tall: true },
  { face: 'n', at: 298, a: 2, b: 398, depth: 18, mix: 'tall', tall: true },
  /* south of the expressway, along the south carriageway */
  { face: 'n', at: 26.5, a: 2, b: 398, depth: 20, mix: 'harbour' },
];

/* Rectangles no building may stand in, beyond the structures' own solids:
 * the plaza, the shrine's precinct, the footbridge's stairs, the arcade's
 * lane, the petrol station's forecourt, a margin round the car park. */
const KEEP = [
  { x0: 100, x1: 208, y0: 156, y1: 186 },
  { x0: 120, x1: 142, y0: 97, y1: 129 },
  { x0: 166, x1: 202, y0: 24, y1: 31 },
  { x0: 184, x1: 202, y0: 64, y1: 72 },
  { x0: 222, x1: 316, y0: 184, y1: 192 },
  { x0: 60, x1: 108, y0: 62, y1: 86 },
  { x0: 0, x1: 37, y0: 62, y1: 108 },
  { x0: 296, x1: 316, y0: 62, y1: 80 },
  { x0: 102, x1: 200, y0: 136, y1: 164 },
];

/* The structures' footprints near the ground, as plan rectangles. */
function footprints(layout) {
  const out = [];
  for (const p of layout.parts) {
    if (!p.solid || p.name === 'barrier') {
      continue;
    }
    let lo;
    let hi;
    if (p.t === 'box') {
      if (p.lo[1] > 12) {
        continue;
      }
      lo = p.lo;
      hi = p.hi;
    } else {
      if (Math.min(p.a[1], p.b[1]) > 12) {
        continue;
      }
      lo = [Math.min(p.a[0], p.b[0]) - p.r, 0, Math.min(p.a[2], p.b[2]) - p.r];
      hi = [Math.max(p.a[0], p.b[0]) + p.r, 0, Math.max(p.a[2], p.b[2]) + p.r];
    }
    const [x0, y1] = plan(lo[0], lo[2]);
    const [x1, y0] = plan(hi[0], hi[2]);
    out.push({ x0, x1, y0, y1 });
  }
  return out;
}

const overlaps = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m;

/*
 * Whether a footprint keeps the gap rule with another: they overlap by
 * nothing and either touch along a face or stand GAP_MIN apart.
 */
function apart(a, b) {
  const gx = Math.max(a.x0 - b.x1, b.x0 - a.x1);
  const gy = Math.max(a.y0 - b.y1, b.y0 - a.y1);
  const gap = Math.max(gx, gy);
  if (gap < -1e-6) {
    return false;
  }
  return gap <= 1e-6 || gap >= GAP_MIN + 0.2;
}

/* The course's clearance from a rectangle: its nearest point to the line. */
function clearOfCourse(line, r, margin) {
  for (let x = r.x0; x <= r.x1 + 1e-6; x += Math.max(1, (r.x1 - r.x0) / 8)) {
    for (let y = r.y0; y <= r.y1 + 1e-6; y += Math.max(1, (r.y1 - r.y0) / 8)) {
      if (nearestOn(line, x, y).d < HALF + margin) {
        return false;
      }
    }
  }
  return true;
}

/* The buildings along every front. */
function buildings(line, solids) {
  const out = [];
  const taken = [];
  FRONTS.forEach((f, fi) => {
    const r = rng(1009 + fi * 37);
    const mix = MIX[f.mix];
    let u = f.a;
    while (u < f.b - 4) {
      const style = f.arcade ? 'shop' : pickStyle(r, mix);
      const s = sizeOf(r, style, f.depth, f.tall);
      let width = s.width;
      if (u + width > f.b) {
        width = Math.floor(f.b - u);
        if (width < 6) {
          break;
        }
      }
      /* A front set back a touch now and then, as a real street's is. */
      const back = f.arcade ? 0 : (r.chance(0.25) ? 0.6 : 0);
      const d = s.depth;
      let rect;
      let cx;
      let cy;
      if (f.face === 's' || f.face === 'n') {
        const y0 = f.face === 's' ? f.at + back : f.at - back - d;
        rect = { x0: u, x1: u + width, y0, y1: y0 + d };
        cx = u + width / 2;
        cy = y0 + d / 2;
      } else {
        const x0 = f.face === 'w' ? f.at + back : f.at - back - d;
        rect = { x0, x1: x0 + d, y0: u, y1: u + width };
        cx = x0 + d / 2;
        cy = u + width / 2;
      }
      const ok = rect.x0 >= 0.5 && rect.x1 <= W - 0.5 && rect.y0 >= 0.5 && rect.y1 <= D - 0.5
        && !KEEP.some((k) => overlaps(rect, k))
        && !solids.some((k) => overlaps(rect, k, GAP_MIN + 0.2))
        && taken.every((t) => apart(rect, t))
        && clearOfCourse(line, rect, 3.0);
      if (ok) {
        taken.push(rect);
        out.push({
          type: 'building', style, x: cx, y: cy, yaw: FACE[f.face],
          dims: { width, depth: d, floors: f.arcade ? Math.min(s.floors, 3) : s.floors, passage: 0, variant: r.int(1, 99) },
        });
        /* Touching the next, or an alley between. */
        u += width + (r.chance(0.65) ? 0 : 1.8 + r.next() * 1.4);
      } else {
        u += 2;
      }
    }
  });
  return { out, taken };
}

/*
 * THE POLES, the town's concrete ones, down the back streets on the
 * pavement's road edge, each turned so its lamp arm reaches over the
 * street. Their wires run pole to pole on their own (../built/index.js).
 */
const POLES = [
  /* the back street, its north pavement */
  { x0: 70, x1: 180, y: 100.9, step: 22, yaw: -90 },
  /* the north street, its north pavement */
  { x0: 8, x1: 310, y: 236.4, step: 24, yaw: -90 },
  /* the station road's east pavement */
  { y0: 80, y1: 214, x: 330.3, step: 24, yaw: 180 },
  /* the south carriageway's south pavement */
  { x0: 6, x1: 396, y: 28.2, step: 30, yaw: 90 },
];

function poles(line, taken, solids) {
  const out = [];
  for (const p of POLES) {
    const along = p.x0 !== undefined;
    const lo = along ? p.x0 : p.y0;
    const hi = along ? p.x1 : p.y1;
    for (let u = lo; u <= hi; u += p.step) {
      const x = along ? u : p.x;
      const y = along ? p.y : u;
      const box = { x0: x - 0.4, x1: x + 0.4, y0: y - 0.4, y1: y + 0.4 };
      if (taken.some((t) => overlaps(box, t, GAP_MIN)) || solids.some((t) => overlaps(box, t, GAP_MIN))
        || KEEP.some((k) => overlaps(box, k)) || nearestOn(line, x, y).d < HALF + 2.2) {
        continue;
      }
      out.push({ type: 'utilityPole', x, y, yaw: p.yaw * DEG, dims: { height: 10 } });
      taken.push(box);
    }
  }
  return out;
}

/* Trees: zelkovas round the station plaza, cherries in the shrine, and a
 * few along the north street's west end. */
const TREES = [
  ['street', 106, 160, 1.0], ['street', 120, 165, 1.05], ['street', 196, 162, 1.0], ['street', 182, 168, 0.95],
  ['street', 104, 180, 0.9], ['street', 200, 178, 1.0], ['sakura', 124, 112, 1.1], ['sakura', 138.5, 104, 1.0],
  ['sakura', 124.5, 104.5, 0.95], ['street', 137, 113, 1.25], ['sakura', 160, 211, 1.0], ['sakura', 172, 211, 0.95],
];

/* Cars parked along the streets the course does not use. */
const PARKED = [
  ['van', 40, 31.6, 0], ['kei', 90, 31.6, 0], ['boxtruck', 140, 31.6, 0], ['sedan', 236, 31.6, 0], ['keivan', 290, 31.6, 0],
  ['hatch', 352, 31.6, 0], ['wagon', 30, 221.6, 180], ['kei', 62, 221.6, 180], ['minivan', 340, 60.4, 180], ['kei', 372, 60.4, 180],
  ['sedan', 324.6, 250, 90], ['keivan', 324.6, 276, 90], ['van', 319.4, 12, -90], ['hatch', 319.4, 20, -90],
];

function rows() {
  const L = ekimaeLayout();
  const line = courseLine();
  const solids = footprints(L);
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
  /* The start: one pad on the car park's roof (./plan.js START). */
  out.push({ type: 'startPads', x: START.x, y: START.y, yaw: START.yaw, z: CP.roof, dims: { pads: 1, spacing: 1.5, padSize: 0.9 } });
  /* The named gaps. */
  for (const g of ekimaeGaps()) {
    out.push({ type: 'gap', x: g.px, y: g.py, yaw: g.deg * DEG, z: g.h0, name: g.name, points: g.points, dims: { width: g.w, height: g.h1 - g.h0 } });
  }
  const { out: blds, taken } = buildings(line, solids);
  out.push(...blds);
  out.push(...poles(line, taken, solids));
  for (const [style, x, y, size] of TREES) {
    out.push({ type: 'tree', style, x, y, yaw: (x * 7 + y) % 6.28, dims: { size, variant: 1 + (Math.round(x + y) % 9) } });
  }
  PARKED.forEach(([style, x, y, deg], i) => {
    out.push({ type: 'car', style, x, y, yaw: deg * DEG, dims: { variant: 1 + (i % 7) } });
  });
  return out;
}

export function ekimaeDocument() {
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
    for (const k of ['style', 'road', 'drift', 'reverse', 'points']) {
      if (r[k] !== undefined) {
        el[k] = r[k];
      }
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: EKIMAE_DOC_ID,
    name: EKIMAE_NAME,
    createdUtc: '2026-10-31T00:00:00Z',
    modifiedUtc: '2026-10-31T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: W, depth: D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'golden', ground: 'tarmac' },
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
