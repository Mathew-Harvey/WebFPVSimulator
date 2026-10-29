/*
 * circuit.js: Ridgeline MX, the place. Pure: no Three.js, so its solids,
 * its line and its zones load in Node (scripts/moto-check.js) as they do in
 * the browser, and the two cannot disagree about where a mound is.
 *
 * WHAT IT IS. A motocross track on a ridge above the town, laid out the
 * way Japan's national circuits and the American supercross-style outdoor
 * tracks are: a long start straight with the gate and a tabletop, a big
 * double to land under the grandstand's eye, left hand berms with the bank
 * built up on the outside, a back straight with a two jump rhythm and a
 * run of whoops, a step down into the hairpin, and the finish jump. 870 m a
 * lap, ten bikes in three lines. The owner's ask of 29 October 2026: "motor
 * cross cam chase, the bikes should rip, rail, whip and just look like IRL".
 *
 * THE BIKES ARE DRIVEN BY THE PHYSICS MODULE along three parallel lines
 * (./traffic.js) and ridden over the ground by ./profile.js. The mounds
 * here are that profile, drawn and solid from the same numbers: a mound is
 * a run of capsules lying across it, each at its height, so a quad that
 * skims a face meets a slope and not a staircase.
 *
 * THE FRAME is the built map's (src/maps/built/place.js): the document's
 * plan in metres from its near left corner, x east and y north, and the
 * world's Three.js metres from the plot's middle, Y up. Every point here is
 * written in the plan and converted once, in w().
 *
 * WHAT THE GAME READS (src/game/film.js): ZONES, the circles round the
 * lips, the berms and the whoops where a shot counts for more, and the
 * groups the bikes run in.
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

import { Parts } from '../../props/parts.js';
import { roadOf, pointAt, nearestOn } from '../built/road.js';
import { FEATURES } from './profile.js';

/* The plot, metres. */
export const FIELD_W = 340;
export const FIELD_D = 240;

/* A plan point (x east, y north, h up) as the world's [x, y, z]. */
export function w(x, y, h = 0) {
  return [x - FIELD_W / 2, h, FIELD_D / 2 - y];
}

/* The course, its corners in the plan, driven in this order. */
export const COURSE_NODES = [
  [60, 40], [240, 40], [285, 62], [300, 110], [275, 150], [225, 160], [205, 195], [140, 205],
  [80, 205], [40, 180], [55, 145], [110, 125], [160, 105], [120, 80], [55, 85], [28, 62],
];
export const TRACK_WIDTH = 8;
export const TRACK_RADIUS = 22;

/* The three lines the bikes run, metres to the left of the centre. */
export const LANE_OFFSETS = [-2.4, 0, 2.4];

/* Half the width of a mound, metres either side of the centre line. */
export const MOUND_HALF = 5.6;

/*
 * The course's corners moved `d` metres to the left of the line (negative
 * is right), each along the bisector of its two edges so the edges stay
 * `d` apart. The road tool eases the offset corners with the same radius,
 * which keeps the lines apart through a bend within a metre or so.
 */
function offsetNodes(d) {
  const n = COURSE_NODES.length;
  return COURSE_NODES.map(([x, y], i) => {
    const [px, py] = COURSE_NODES[(i + n - 1) % n];
    const [nx, ny] = COURSE_NODES[(i + 1) % n];
    const a = Math.hypot(x - px, y - py);
    const b = Math.hypot(nx - x, ny - y);
    const n1 = [-(y - py) / a, (x - px) / a];
    const n2 = [-(ny - y) / b, (nx - x) / b];
    const dot = n1[0] * n2[0] + n1[1] * n2[1];
    const k = d / (1 + dot);
    return [x + (n1[0] + n2[0]) * k, y + (n1[1] + n2[1]) * k];
  });
}

/* The course as a road element, d metres to the left. `id` names it. */
export function courseElement(d = 0, id = 'el-1') {
  const nodes = offsetNodes(d);
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

/* The centre line as the bikes' middle line drives it. */
export function courseLine() {
  return roadOf(courseElement()).centre;
}

/* Which way the line bends at s: +1 left, -1 right, 0 straight. */
export function bendAt(line, s, span = 3, eps = 1e-3) {
  const a = pointAt(line, s - span);
  const b = pointAt(line, s + span);
  const cross = a.tx * b.ty - a.ty * b.tx;
  return cross > eps ? 1 : (cross < -eps ? -1 : 0);
}

/* A plan point `off` metres to the left (+) of the line at s. */
export function beside(line, s, off) {
  const p = pointAt(line, s);
  return { x: p.x - p.ty * off, y: p.y + p.tx * off, tx: p.tx, ty: p.ty };
}

/* Wrap s onto the lap. */
function lapped(line, s) {
  const L = line.length;
  return s - Math.floor(s / L) * L;
}

/* ------------------------------------------------------------------ */
/* The furniture                                                       */
/* ------------------------------------------------------------------ */

/* A box in the plan: x and y the plan's, h up. */
function pbox(P, m, x0, y0, h0, x1, y1, h1, opts) {
  const a = w(x0, y0, h0);
  const b = w(x1, y1, h1);
  return P.box(m, a[0], a[1], a[2], b[0], b[1], b[2], opts);
}

function ppost(P, m, x, y, h0, h1, r, opts) {
  const a = w(x, y, h0);
  return P.post(m, a[0], a[2], h0, h1, r, opts);
}

/* The photographers' tower on the infield side of the start straight, where
 * the pilot starts: the first table, the double and the turn after it are
 * all in front of it. */
export const TOWER = { x: 168, y: 66, half: 2.6, deck: 7, top: 7.4 };
export const MX_PAD_BASE = TOWER.top;
function tower(P, decor) {
  const { x, y, half, deck, top } = TOWER;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ppost(P, 'metal', x + dx * (half - 0.4), y + dy * (half - 0.4), 0, deck, 0.2, { kind: 'pole', name: 'tower leg' });
  }
  decor.push({ t: 'brace', x, y, half: half - 0.4, h0: 0.6, h1: deck - 0.6 });
  pbox(P, 'plywood', x - half, y - half, deck, x + half, y + half, top);
  decor.push({ t: 'rail', x, y, half, h: top });
  decor.push({ t: 'ladder', a: [x - half + 0.4, y - half - 0.3, 0], b: [x - half + 0.4, y - half - 0.3, deck] });
}

/* The start gate across the line at s = 14: a bar the riders' wheels hit,
 * dropped (lying flat) as the pack goes, so only its posts are solid. */
function startGate(line, P, decor) {
  const s = 16;
  const p = pointAt(line, s);
  for (const side of [-1, 1]) {
    const q = beside(line, s, side * 9.5);
    ppost(P, 'metal', q.x, q.y, 0, 2.4, 0.1, { kind: 'pole', name: 'gate post' });
  }
  decor.push({ t: 'gate', x: p.x, y: p.y, tx: p.tx, ty: p.ty });
}

/* The paddock, behind the infield side of the start straight: tents under
 * team colours, two fences of hay. Solid at the tents' height only. */
/* The sponsor board by the paddock's near end, facing the course, where the
 * hidden Konex Drone sign is hung (./index.js): the plot's world point. */
export const SIGN = { p: [0, 0, 0] };
{
  const q = w(197.2, 86.38, 1.3);
  SIGN.p = [q[0], q[1], q[2] + 0.03];
}

const TENT_COLOURS = ['mxOrange', 'mxBlue', 'mxGreen', 'mxRed', 'white'];
function paddock(P, decor, keep) {
  pbox(P, 'plywood', 196, 86.4, 0.6, 198.4, 86.6, 2.0, { name: 'sponsor board' });
  ppost(P, 'metal', 196.1, 86.5, 0, 0.6, 0.08, { kind: 'pole', name: 'board leg' });
  ppost(P, 'metal', 198.3, 86.5, 0, 0.6, 0.08, { kind: 'pole', name: 'board leg' });
  for (let i = 0; i < 5; i += 1) {
    const x = 196 + i * 12;
    const y = 96;
    pbox(P, 'white', x, y, 0, x + 8, y + 6, 2.5, { draw: false, name: 'tent' });
    decor.push({ t: 'tent', x, y, wd: 8, dp: 6, m: TENT_COLOURS[i % TENT_COLOURS.length] });
    decor.push({ t: 'bikeOnStand', x: x + 3.4, y: y + 2.6, yaw: 0.2 * i, m: TENT_COLOURS[(i + 2) % TENT_COLOURS.length] });
    keep.push({ x: x + 4, y: y + 3, r: 7 });
  }
}

/* A grandstand of plain benches with a roof, facing the double. */
const STAND = { x0: 150, x1: 190, y: 92, depth: 5 };
function stand(P, decor, keep) {
  const { x0, x1, y, depth } = STAND;
  for (let k = 0; k < 3; k += 1) {
    pbox(P, 'plywood', x0, y + k * 1.4, k * 0.5, x1, y + k * 1.4 + 1.4, k * 0.5 + 0.5);
  }
  for (const x of [x0 + 0.3, (x0 + x1) / 2, x1 - 0.3]) {
    ppost(P, 'metal', x, y + depth - 0.2, 0, 4.2, 0.1, { kind: 'pole', name: 'stand post' });
  }
  pbox(P, 'mxOrange', x0 - 0.5, y + depth - 2.4, 4.0, x1 + 0.5, y + depth + 0.6, 4.2, { name: 'stand roof' });
  decor.push({ t: 'crowd', x0: x0 + 1, x1: x1 - 1, y, rows: 3 });
  keep.push({ x: (x0 + x1) / 2, y: y + 3, r: 24 });
}

/* Hay bales stacked against the outside of the hairpin and the corner after
 * the finish: boxes of three in a pyramid. Soft kind: they are bales. */
function hay(line, P, decor, s0, s1, off) {
  const n = Math.max(1, Math.round((s1 - s0) / 2.4));
  for (let i = 0; i < n; i += 1) {
    const s = s0 + (i + 0.5) * ((s1 - s0) / n);
    const sign = -(bendAt(line, s) || 1);
    const q = beside(line, s, off * sign);
    decor.push({
      t: 'hay', x: q.x, y: q.y, tx: q.tx, ty: q.ty, rows: i % 3 === 0 ? 2 : 1,
    });
    const a = w(q.x, q.y, 0.45);
    P.cap('mxHay', a, a, 0.62, { draw: false, kind: 'obstacle', name: 'hay bale' });
  }
}

/* Orange tape stakes along the outside of the straights' infield edge, a
 * stake every 18 m. Drawn only. */
function stakes(line, decor) {
  const L = line.length;
  for (let s = 8; s < L; s += 18) {
    if (bendAt(line, s, 6, 4e-3) !== 0) {
      continue;
    }
    for (const side of [-1, 1]) {
      const q = beside(line, s, side * (TRACK_WIDTH / 2 + 0.5));
      decor.push({ t: 'stake', x: q.x, y: q.y });
    }
  }
}

/* Braking bumps: a run of low ridges across the track in front of every
 * bend that follows a straight, where riders brake and the dirt ripples.
 * Drawn only, a decimetre high. Not on a mound's ground. */
function bumps(line, decor) {
  const L = line.length;
  let last = -99;
  for (let s = 6; s < L - 12; s += 1) {
    if (bendAt(line, s, 4, 4e-3) !== 0 || bendAt(line, s + 10, 4, 4e-3) === 0) {
      continue;
    }
    if (s - last < 40 || FEATURES.some((f) => s > f.s0 - 14 && s < f.s1 + 6)) {
      continue;
    }
    last = s;
    for (let i = 0; i < 6; i += 1) {
      const q = pointAt(line, s - i * 1.3);
      decor.push({
        t: 'bump', x: q.x, y: q.y, tx: q.tx, ty: q.ty, k: i,
      });
    }
  }
}

/* The finish arch over the start line, bunting down both sides of the start
 * straight, marshals' huts by the big jumps and clods of dirt along the
 * edges. The arch's legs and the bunting's poles are solid (a quad can hit
 * them), its beam too, high enough to fly under; the rest is drawn only. */
function dressing(line, P, decor, keep) {
  const sa = 10;
  const pa = pointAt(line, sa);
  const legOff = TRACK_WIDTH / 2 + 2.2;
  for (const side of [-1, 1]) {
    const q = beside(line, sa, side * legOff);
    ppost(P, 'metal', q.x, q.y, 0, 6.2, 0.2, { kind: 'pole', name: 'arch leg' });
  }
  pbox(P, 'metal', pa.x - 0.3, pa.y - legOff, 5.6, pa.x + 0.3, pa.y + legOff, 6.2, { draw: false, name: 'arch beam' });
  decor.push({
    t: 'arch', x: pa.x, y: pa.y, tx: pa.tx, ty: pa.ty, off: legOff, h: 6.2,
  });
  /* Bunting. */
  for (const side of [-1, 1]) {
    let prev = null;
    for (let s = 24; s <= 152; s += 12.8) {
      const q = beside(line, s, side * (TRACK_WIDTH / 2 + 4.2));
      ppost(P, 'metal', q.x, q.y, 0, 3.4, 0.07, { kind: 'pole', name: 'bunting pole' });
      if (prev) {
        decor.push({
          t: 'bunting', ax: prev.x, ay: prev.y, bx: q.x, by: q.y, h: 3.3,
        });
      }
      prev = q;
    }
  }
  /* Advertising boards along the start straight, a hand's breadth off the
   * track's shoulder: 6 m panels in the team colours, solid at their own
   * height (the straight runs along x here, so the boxes are axis aligned). */
  for (const side of [-1, 1]) {
    for (let k = 0; k < 20; k += 1) {
      const s0 = 28 + k * 6.2;
      const a0 = beside(line, s0, side * (TRACK_WIDTH / 2 + 2.6));
      pbox(P, 'plywood', a0.x, a0.y - 0.08, 0, a0.x + 6, a0.y + 0.08, 0.95, { draw: false, name: 'board' });
      decor.push({
        t: 'board', x: a0.x, y: a0.y, k: k + (side > 0 ? 3 : 0),
      });
    }
  }
  /* Marshals' huts, and their flags, by the big jumps. */
  for (const [s, side] of [[52, -1], [104, 1], [424, -1], [622, 1], [750, -1]]) {
    const q = beside(line, s, side * (TRACK_WIDTH / 2 + 7));
    decor.push({
      t: 'hut', x: q.x, y: q.y, tx: q.tx, ty: q.ty,
    });
    pbox(P, 'white', q.x - 1, q.y - 1, 0, q.x + 1, q.y + 1, 2.4, { draw: false, name: 'marshal hut' });
    keep.push({ x: q.x, y: q.y, r: 3 });
  }
  /* Clods, thrown off the line along the edges. */
  const L = line.length;
  for (let i = 0; i < 90; i += 1) {
    const s = ((i * 97) % 1000) / 1000 * L;
    const side = i % 2 ? 1 : -1;
    const q = beside(line, s, side * (TRACK_WIDTH / 2 + 0.3 + ((i * 53) % 100) / 100 * 1.4));
    decor.push({
      t: 'clod', x: q.x, y: q.y, k: i,
    });
  }
}

/* ------------------------------------------------------------------ */
/* The layout                                                          */
/* ------------------------------------------------------------------ */

/*
 * Everything the place is, worked out once from the course.
 *
 *   parts     Parts: the solids, and what of them is drawn
 *   mounds    [{ s0, s1, pts, x, y, tx, ty }] each feature's profile and
 *             where it stands, for ./index.js to extrude
 *   berms     [{ s0, s1, sign }] the banked bends, sign the side of the
 *             bank (+1 left of the line)
 *   decor     painted things
 *   zones     { name, x, z, r, kind } circles in the world, for the judge
 *   keep      circles no tree may stand in
 */
let MEMO = null;
export function circuitLayout() {
  if (MEMO) {
    return MEMO;
  }
  const line = courseLine();
  const P = new Parts();
  const decor = [];
  const keep = [];
  const mounds = [];
  const berms = [];
  const zones = [];
  const zoneAt = (name, x, y, r, kind) => {
    const q = w(x, y);
    zones.push({ name, x: q[0], z: q[2], r, kind });
  };

  /* THE MOUNDS: the profile drawn (./index.js) and, to the same numbers, a
   * run of capsules across it every STATION metres, each lying at the
   * height the ground has there less its radius. */
  FEATURES.forEach((f, fi) => {
    const a = pointAt(line, f.s0);
    const b = pointAt(line, f.s1);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    mounds.push({
      s0: f.s0, s1: f.s1, pts: f.pts, x: a.x, y: a.y, tx, ty, kind: f.kind, index: fi,
    });
    const r = f.kind === 'whoops' ? 0.22 : 0.45;
    const station = f.kind === 'whoops' ? 0.5 : 0.9;
    for (let s = f.s0 + station; s < f.s1 - station * 0.5; s += station) {
      // eslint-disable-next-line no-use-before-define
      const h = groundIn(f, s);
      if (h < 0.12) {
        continue;
      }
      const p = pointAt(line, s);
      const lx = -p.ty;
      const ly = p.tx;
      const lo = w(p.x - lx * MOUND_HALF, p.y - ly * MOUND_HALF, Math.max(h - r, 0));
      const hi = w(p.x + lx * MOUND_HALF, p.y + ly * MOUND_HALF, Math.max(h - r, 0));
      P.cap('mxDirt', lo, hi, r, { draw: false, kind: 'wall', name: `${f.kind} face` });
    }
    if (f.lip !== undefined) {
      const q = pointAt(line, f.lip);
      zoneAt(f.kind === 'table' ? 'Table lip' : (f.kind === 'step' ? 'Step down' : 'Lip'), q.x, q.y, 16, 'lip');
    } else if (f.kind === 'whoops') {
      const q = pointAt(line, (f.s0 + f.s1) / 2);
      zoneAt('Whoops', q.x, q.y, 22, 'whoops');
    }
  });

  /* THE BERMS: wherever the line bends harder than a gentle sweep for more
   * than a few metres, a bank on the outside. Found by walking the line, so
   * a change to the nodes moves the banks with it. */
  {
    const STEP = 3;
    let run = null;
    const close = (end) => {
      if (run && end - run.s0 >= 18) {
        berms.push({ s0: run.s0, s1: end, sign: -run.sign });
      }
      run = null;
    };
    for (let s = 0; s < line.length; s += STEP) {
      const a = pointAt(line, s - 5);
      const b = pointAt(line, s + 5);
      const cross = a.tx * b.ty - a.ty * b.tx;
      const sign = cross > 0.1 ? 1 : (cross < -0.1 ? -1 : 0);
      if (sign && run && run.sign === sign) {
        continue;
      }
      close(s);
      if (sign) {
        run = { s0: s, sign };
      }
    }
    close(line.length);
  }
  const BANK_OFF = TRACK_WIDTH / 2 + 2.3;
  const BANK_R = 1.25;
  berms.forEach((bm, bi) => {
    const n = Math.max(1, Math.round((bm.s1 - bm.s0) / 3));
    const step = (bm.s1 - bm.s0) / n;
    for (let i = 0; i < n; i += 1) {
      const pa = beside(line, bm.s0 + i * step, BANK_OFF * bm.sign);
      const pb = beside(line, bm.s0 + (i + 1) * step, BANK_OFF * bm.sign);
      /* The bank is highest in the middle of the bend and runs out at the
       * ends, so a bike comes into the berm and leaves it. */
      const u = (i + 0.5) / n;
      const hgt = 0.7 + 0.9 * 4 * u * (1 - u);
      const a = w(pa.x, pa.y, hgt);
      const b = w(pb.x, pb.y, hgt);
      P.cap('mxDirtDark', a, b, BANK_R * (0.65 + 0.35 * 4 * u * (1 - u)) + 0.15, { look: 'capsule', seg: 6, kind: 'wall', name: 'berm' });
    }
    const mid = beside(line, (bm.s0 + bm.s1) / 2, 0);
    if (bm.s1 - bm.s0 > 28) {
      zoneAt('Berm', mid.x, mid.y, 18, 'berm');
    }
    void bi;
  });

  tower(P, decor);
  startGate(line, P, decor);
  paddock(P, decor, keep);
  stand(P, decor, keep);
  /* Hay on the outside of the hairpin (the bend at the far end) and the
   * last corner. */
  const hairpin = nearestOn(line, 40, 180).s;
  hay(line, P, decor, hairpin - 14, hairpin + 14, TRACK_WIDTH / 2 + 5.5);
  const last = nearestOn(line, 28, 62).s;
  hay(line, P, decor, last - 12, last + 12, TRACK_WIDTH / 2 + 5.5);
  stakes(line, decor);
  bumps(line, decor);
  dressing(line, P, decor, keep);
  zoneAt('Start gate', pointAt(line, 16).x, pointAt(line, 16).y, 14, 'gate');

  MEMO = {
    line, parts: P.list, mounds, berms, decor, zones, keep,
  };
  return MEMO;
}

/* The height of one feature's ground at s. */
function groundIn(f, s) {
  const pts = f.pts;
  if (s <= pts[0][0] || s >= pts[pts.length - 1][0]) {
    return 0;
  }
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i][0] >= s) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = b[0] > a[0] ? (s - a[0]) / (b[0] - a[0]) : 0;
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return 0;
}

export { lapped };
