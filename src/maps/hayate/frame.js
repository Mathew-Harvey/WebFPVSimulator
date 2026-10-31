/*
 * frame.js: Hayate Circuit's plan, its one conversion to the world, its
 * cull cells and the course. Pure: no Three.js and no JS trigonometry, so
 * the solids, the road and the race cars' lanes load in Node
 * (scripts/hayate-check.js) exactly as they do in the browser.
 *
 * THE PLAN is the built map's (src/maps/built/place.js): metres from the
 * plot's south west corner, x east and y north, h up. Every point in this
 * map is written in the plan and taken to the world here, in w(), once.
 * The world is Three.js metres from the plot's middle, Y up, which is what
 * the built map's pipeline and its colliders take; src/render/frame.js
 * takes it on to the physics' Z up from there, as for every map.
 *
 * THE COURSE is a closed road of one lane, 12 m wide, driven clockwise:
 * west down the main straight past the pits, a long right at turn one, up
 * the west side through the esses, round the top corner onto the back
 * straight, the big multi apex sweeper in the north east, down the east
 * side through the chicane and the last corner onto the straight again.
 * 1.55 km round, the length of a club circuit or a short national layout,
 * which is what a five inch can chase a car round and what one map's fog
 * holds. The built road eases every corner (src/maps/built/road.js), and
 * the race cars drive lines beside its centre (./traffic.js).
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

import { roadOf, pointAt, nearestOn } from '../built/road.js';

/* The plot, metres. */
export const W = 620;
export const D = 440;

/* A plan point (x east, y north, h up) as the world's [x, y, z]. */
export function w(x, y, h = 0) {
  return [x - W / 2, h, D / 2 - y];
}

/* The world's x and z back to the plan. */
export const px = (x) => x + W / 2;
export const py = (z) => D / 2 - z;

/*
 * THE CULL CELLS: four across and three up, about 155 by 147 m. With the
 * palette merged (./index.js) a cell costs a handful of draws whatever it
 * holds, so the cells are small enough that three's frustum cull and the
 * pipeline's range cull switch most of the circuit off when it is behind
 * the camera or far down the fog, and big enough that a view of the pits
 * is a few cells and not a dozen.
 */
const COLS = 4;
const ROWS = 3;
export function chunkOf(x, z) {
  const c = Math.min(COLS - 1, Math.max(0, Math.floor((px(x) / W) * COLS)));
  const r = Math.min(ROWS - 1, Math.max(0, Math.floor((py(z) / D) * ROWS)));
  return `hy${c}${r}`;
}

/* The cell of a plan point. */
export function cellAt(x, y) {
  const p = w(x, y);
  return chunkOf(p[0], p[2]);
}

/*
 * THE COURSE, its corners in the plan, in the order the cars drive them.
 * Node 0 is the last corner, so the closed road's first point is the
 * middle of that bend and the straight follows it.
 */
export const COURSE_NODES = [
  [548, 70], [120, 70], [78, 128], [96, 196], [66, 246], [98, 300],
  [70, 360], [96, 400], [160, 376], [400, 376], [500, 392], [566, 340],
  [572, 250], [546, 205], [574, 175], [580, 118],
];
export const TRACK_WIDTH = 12;
export const TRACK_RADIUS = 40;
export const HALF = TRACK_WIDTH / 2;

/* The course as a road element `d` metres to the left of the centre
 * (negative is right), each corner moved along its bisector so the two
 * edges stay `d` apart. Arithmetic and square roots only: these points go
 * to the physics module (src/maps/built/traffic.js). */
function offsetNodes(d) {
  const n = COURSE_NODES.length;
  return COURSE_NODES.map(([x, y], i) => {
    const [ax, ay] = COURSE_NODES[(i + n - 1) % n];
    const [bx, by] = COURSE_NODES[(i + 1) % n];
    const a = Math.sqrt((x - ax) * (x - ax) + (y - ay) * (y - ay));
    const b = Math.sqrt((bx - x) * (bx - x) + (by - y) * (by - y));
    const n1 = [-(y - ay) / a, (x - ax) / a];
    const n2 = [-(by - y) / b, (bx - x) / b];
    const dot = n1[0] * n2[0] + n1[1] * n2[1];
    const k = d / (1 + dot);
    return [x + (n1[0] + n2[0]) * k, y + (n1[1] + n2[1]) * k];
  });
}

export function courseElement(d = 0, id = 'el-1') {
  const nodes = d === 0 ? COURSE_NODES : offsetNodes(d);
  const [x0, y0] = nodes[0];
  return {
    id,
    type: 'road',
    name: '',
    position: { x: x0, y: y0, z: 0 },
    yaw: 0,
    pitch: 0,
    yawOverridden: false,
    closed: true,
    dims: { width: TRACK_WIDTH, lanes: 1, radius: TRACK_RADIUS },
    nodes: nodes.map(([x, y]) => ({ x: x - x0, y: y - y0 })),
  };
}

let LINE = null;
/* The centre line, worked out once. */
export function courseLine() {
  if (!LINE) {
    LINE = roadOf(courseElement()).centre;
  }
  return LINE;
}

/* The arc length round the course of the point nearest a corner. */
export function sAt(k) {
  const [x, y] = COURSE_NODES[k];
  return nearestOn(courseLine(), x, y).s;
}

/* Wrap s onto the lap. */
export function lapped(s) {
  const L = courseLine().length;
  return s - Math.floor(s / L) * L;
}

/* Which way the line bends at s: +1 left, -1 right, 0 straight. */
export function bendAt(s, span = 3, eps = 1e-3) {
  const line = courseLine();
  const a = pointAt(line, lapped(s - span));
  const b = pointAt(line, lapped(s + span));
  const cross = a.tx * b.ty - a.ty * b.tx;
  return cross > eps ? 1 : (cross < -eps ? -1 : 0);
}

/* A plan point `off` metres to the left (+) of the line at s, with the
 * line's heading there. */
export function beside(s, off) {
  const p = pointAt(courseLine(), lapped(s));
  return { x: p.x - p.ty * off, y: p.y + p.tx * off, tx: p.tx, ty: p.ty };
}

/* How far a plan point is from the centre line. */
export function offCourse(x, y) {
  return nearestOn(courseLine(), x, y).d;
}

/* A box in the plan: x and y the plan's, h up. */
export function pbox(P, m, x0, y0, h0, x1, y1, h1, opts) {
  const a = w(x0, y0, h0);
  const b = w(x1, y1, h1);
  return P.box(m, a[0], a[1], a[2], b[0], b[1], b[2], opts);
}

/* A vertical post at a plan point. */
export function ppost(P, m, x, y, h0, h1, r, opts) {
  const a = w(x, y, h0);
  return P.post(m, a[0], a[2], h0, h1, r, opts);
}

/* A capsule between two plan points with heights. */
export function pcap(P, m, a, b, r, opts) {
  return P.cap(m, w(a[0], a[1], a[2]), w(b[0], b[1], b[2]), r, opts);
}

/* A fixed integer hash to [0, 1), so everything placed by chance is the
 * same on every build and every engine. */
export function hash(i, salt) {
  let h = Math.imul((i | 0) + 1, 0x9e3779b1) ^ Math.imul((salt | 0) + 7, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
