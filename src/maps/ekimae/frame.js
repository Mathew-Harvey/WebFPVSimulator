/*
 * frame.js: Ekimae Drift's frame, its course and its chunks. Pure: no
 * Three.js, so the course, the solids and the checks load in Node
 * (scripts/ekimae-check.js) as they do in the browser.
 *
 * THE FRAME is the built map's (src/maps/built/place.js): the document's
 * plan in metres from its south west corner, x east and y north, and the
 * world's Three.js metres from the plot's middle, Y up. Every point in this
 * map is written in the plan and turned into the world once, in w().
 *
 * THE COURSE is a closed road of one lane round four city blocks, driven
 * anticlockwise, so every drift car drives its centre line and the built
 * map's eased bends shape every corner (src/maps/built/road.js):
 *
 *   - THE EXPRESSWAY STRAIGHT, east along the shore road under the elevated
 *     expressway, past the footbridge, flat out.
 *   - TURN ONE, a square left at the big crossing, round the police box on
 *     the inside corner, the clipping point.
 *   - THE STATION ROAD, north under the railway viaduct's steel span.
 *   - TURN TWO, left at the top, along the north street past the shops.
 *   - THE ROTARY, a hairpin round the island in front of the station, the
 *     way a bus or a taxi turns round there.
 *   - THE MANJI, south through the back streets under the poles and wires,
 *     a flick right and left, under the viaduct a second time.
 *   - THE BACK STREET, west along a street of shops and flats, and the last
 *     hairpin round the petrol station onto the straight again.
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

import { roadOf } from '../built/road.js';

/* The plot, metres. */
export const W = 400;
export const D = 300;

/* A plan point (x east, y north, h up) as the world's [x, y, z]. */
export function w(x, y, h = 0) {
  return [x - W / 2, h, D / 2 - y];
}

/* A world point back to the plan. */
export function plan(x, z) {
  return [x + W / 2, D / 2 - z];
}

/*
 * THE COURSE, its corners in the plan, driven in this order. Four lanes of
 * city street are about 12 m kerb to kerb (four lanes of 3 m), and the
 * course is the whole of it, closed off.
 */
export const COURSE_NODES = [
  [46, 56], [322, 56], [322, 226], [124, 228], [124, 192], [214, 192],
  [214, 132], [190, 112], [196, 92], [50, 92],
];
export const ROAD_WIDTH = 12;
export const ROAD_RADIUS = 16;
export const HALF = ROAD_WIDTH / 2;

export function courseElement() {
  const [x0, y0] = COURSE_NODES[0];
  return {
    id: 'el-1',
    type: 'road',
    name: '',
    position: { x: x0, y: y0, z: 0 },
    yaw: 0,
    pitch: 0,
    yawOverridden: false,
    closed: true,
    dims: { width: ROAD_WIDTH, lanes: 1, radius: ROAD_RADIUS },
    nodes: COURSE_NODES.map(([x, y]) => ({ x: x - x0, y: y - y0 })),
  };
}

/* The centre line as the cars drive it. */
export function courseLine() {
  return roadOf(courseElement()).centre;
}

/*
 * THE CHUNKS: three across and two up, so the city is six cull cells and
 * six batches a look (../sunny/palette.js folds a chunk's colours into one),
 * not a 48 m grid of them. The expressway and the viaduct run the whole
 * width, so they are cut where the chunks are and each piece is filed in
 * its own.
 */
const COLS = [134, 267];
const ROW = 150;
export function chunkOf(x, z) {
  const [px, py] = plan(x, z);
  const c = px < COLS[0] ? 0 : px < COLS[1] ? 1 : 2;
  const r = py < ROW ? 0 : 1;
  return `ek${c}${r}`;
}

/* The x where the chunks are cut, for a run that crosses them. */
export const CHUNK_CUTS = COLS;

/*
 * A SEEDED RANDOM, integer arithmetic only (Math.imul is exact), so every
 * lot rolls the same on every engine: mulberry32.
 */
export function rng(seed) {
  let a = (seed | 0) ^ 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}
