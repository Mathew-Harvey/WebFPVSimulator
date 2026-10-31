/*
 * circuit.js: Tanada RX, the circuit. Pure: no Three.js, so its solids,
 * its lines and its gaps load in Node (scripts/rally-check.js) as they do
 * in the browser, and the two cannot disagree about where a barrier is.
 *
 * WHAT IT IS. A rallycross circuit of our own, laid out the way the real
 * ones are (FIA circuits run 800 to 1,400 m a lap, a little over half of
 * it sealed, with a joker: a longer way round every car must take once a
 * race): a long tarmac start straight under the start lights and the
 * grandstand, a fast tarmac sweep into the gravel, a gravel hairpin and a
 * gravel back straight under the spectators' footbridge, a tarmac left
 * onto the infield straight, where the jump is, in front of the stand, a
 * tarmac hairpin and the return straight, and the gravel hairpin at the
 * west end, with the joker swinging wide round the outside of it. 1,267 m
 * on the racing line, about two fifths of it gravel.
 *
 * THE CARS ARE DRIVEN BY THE PHYSICS MODULE along three lines a lane apart
 * (./traffic.js) and lifted over the jump by ./ride.js, render only. The
 * jump here is that profile, drawn and solid from the same numbers.
 *
 * THE FRAME is ./frame.js's: plan metres, x east, y north, h up, converted
 * once, in w().
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
import { w, turn, origin, hash } from './frame.js';

/* The course, its corners in the plan, driven in this order. The first is
 * the west hairpin's exit onto the start straight. */
export const COURSE_NODES = [
  [34, 190], [300, 190], [368, 166], [385, 110], [355, 52], [250, 46], [150, 50], [105, 82],
  [150, 118], [322, 118], [322, 154], [112, 154], [34, 154],
];
/* The joker: the same course, but at the west end it swings out round the
 * outside of the hairpin, 66 m longer. */
export const JOKER_NODES = [
  ...COURSE_NODES.slice(0, 12), [74, 136], [10, 136], [10, 190],
];
export const TRACK_WIDTH = 12;
export const TRACK_RADIUS = 18;
/* The cars' three lines, metres to the left of the centre. The middle one
 * is the joker's: it drives the centre line everywhere but the joker. */
export const LANE_OFFSETS = [-3, 0, 3];

function offsetNodes(nodes, d) {
  const n = nodes.length;
  return nodes.map(([x, y], i) => {
    const [px, py] = nodes[(i + n - 1) % n];
    const [nx, ny] = nodes[(i + 1) % n];
    const a = Math.hypot(x - px, y - py);
    const b = Math.hypot(nx - x, ny - y);
    const n1 = [-(y - py) / a, (x - px) / a];
    const n2 = [-(ny - y) / b, (nx - x) / b];
    const dot = n1[0] * n2[0] + n1[1] * n2[1];
    const k = d / (1 + dot);
    return [x + (n1[0] + n2[0]) * k, y + (n1[1] + n2[1]) * k];
  });
}

/* A line as a road element, d metres to the left: the main course, or the
 * joker's when `joker`. */
export function courseElement(d = 0, id = 'el-1', joker = false) {
  const nodes = offsetNodes(joker ? JOKER_NODES : COURSE_NODES, d);
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

export function courseLine() {
  return roadOf(courseElement(0, 'rx-centre')).centre;
}

export function jokerLine() {
  return roadOf(courseElement(0, 'rx-joker', true)).centre;
}

/* Which way the line bends at s: +1 left, -1 right, 0 straight. */
export function bendAt(line, s, span = 4, eps = 3e-3) {
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

/* ------------------------------------------------------------------ */
/* Where things are on the lap                                         */
/* ------------------------------------------------------------------ */

/*
 * THE SURFACES, as runs of the main line between plan points (found on the
 * line, so a change to the nodes moves them with it): tarmac from the west
 * hairpin's exit through the sweep, gravel from the sweep's end round the
 * south hairpin and down half the back straight, tarmac through the infield
 * left, gravel down the infield straight (the jump's crest is tarmac), tarmac
 * through the infield hairpin and the return straight, gravel round the west
 * hairpin. The joker is gravel all the way round.
 */
const SURFACE_MARKS = [
  ['tarmac', 34, 190], ['gravel', 380, 128], ['tarmac', 200, 47], ['gravel', 152, 118],
  ['tarmac', 296, 118], ['gravel', 70, 154],
];

/* The jump, on the infield straight heading east: a kicker of 1.5 m over
 * 10 m, a short table, and a long landing back to the ground. [s from the
 * kicker's foot, h] in metres; its foot is at plan x JUMP_X. */
export const JUMP_X = 206;
export const JUMP_PROFILE = [[0, 0], [3, 0.35], [6, 0.85], [10, 1.5], [13, 1.55], [16, 1.35], [22, 0.75], [28, 0.25], [32, 0]];
export const JUMP_HALF = 7.4;

/* The ground over the jump at a distance `d` past its foot, metres. */
export function jumpGround(d) {
  const p = JUMP_PROFILE;
  if (d <= 0 || d >= p[p.length - 1][0]) {
    return 0;
  }
  for (let i = 1; i < p.length; i += 1) {
    if (p[i][0] >= d) {
      const t = (d - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
      return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t;
    }
  }
  return 0;
}

/* THE GRANDSTAND, on the foot of the hill facing south over the start
 * straight and the jump: twelve rows of 0.9 m treads rising 0.42 m, a back
 * wall, and a roof on a line of columns at the back, cantilevered out over
 * the seats. Between the back wall's top and the roof there is a slot the
 * whole length of the stand: the roof gap. */
export const STAND = {
  x0: 150, x1: 250, y0: 206.5, rows: 12, tread: 0.9, rise: 0.42, front: 1.1,
  wall: 7.2, roof0: 10.6, roof1: 10.95, roofY0: 202.5, roofY1: 221.5, colY: 219.6, bay: 10,
};
STAND.yBack = STAND.y0 + STAND.rows * STAND.tread;
STAND.top = STAND.front + STAND.rise * (STAND.rows - 1);

/* The spectators' footbridge over the back straight. */
export const BRIDGE = { x: 250, y0: 32, y1: 60, deck: 5.0, w: 3.0, t: 0.45 };

/* The commentary tower in the infield, on four legs: fly between them. */
export const TOWER = { x: 286, y: 82, half: 1.3, deck: 6.2, top: 9.4 };

/* The big screen in the infield, facing the stand, on two legs. */
export const SCREEN = { x: 214, y: 74, w: 11, h0: 4.2, h1: 10.2, legs: 4.4 };

/* The start lights over the start straight. */
export const GANTRY = { x: 96, y: 190, h0: 5.4, h1: 6.2, span: 9.2 };

/* Where the pilot starts: a pad on the grass of the infield, looking east
 * down the infield with the jump on the left and the stand beyond it. */
export const SPAWN = { px: 168, py: 92, yaw: 0 };

/* The hidden Konex Drone sign: on the inside face of the grandstand's back
 * wall, above the top row and under the roof, in the bay west of the
 * middle. A pilot sees it only from under the roof. */
export const KONEX = { px: 172, py: STAND.yBack + 0.42, h: STAND.top + 1.25, w: 1.1 };

/* ------------------------------------------------------------------ */
/* The layout                                                          */
/* ------------------------------------------------------------------ */

let MEMO = null;

/*
 * Everything the circuit is, worked out once:
 *
 *   line, joker   the centre line and the joker's
 *   surfaces      [{ kind, s0, s1 }] runs of the centre line
 *   jump          { s0, s1, x, y } where the jump is on the centre line
 *   barriers      [{ a, b, look }] plan segments, each with its solid
 *   kerbs         [{ x, y, tx, ty, len, red }]
 *   gaps          the named gaps, for ./yard.js
 */
export function circuitLayout() {
  if (MEMO) {
    return MEMO;
  }
  const line = courseLine();
  const joker = jokerLine();
  const L = line.length;
  /* The surfaces. */
  const marks = SURFACE_MARKS.map(([kind, x, y]) => ({ kind, s: nearestOn(line, x, y).s })).sort((a, b) => a.s - b.s);
  const surfaces = [];
  for (let i = 0; i < marks.length; i += 1) {
    const a = marks[i];
    const b = marks[(i + 1) % marks.length];
    if (b.s > a.s) {
      surfaces.push({ kind: a.kind, s0: a.s, s1: b.s });
    } else {
      surfaces.push({ kind: a.kind, s0: a.s, s1: L });
      if (b.s > 0) {
        surfaces.push({ kind: a.kind, s0: 0, s1: b.s });
      }
    }
  }
  const surfaceAt = (s) => {
    const x = s - Math.floor(s / L) * L;
    for (const r of surfaces) {
      if (x >= r.s0 && x < r.s1) {
        return r.kind;
      }
    }
    return 'tarmac';
  };
  const jumpS0 = nearestOn(line, JUMP_X, 118).s;
  const jump = { s0: jumpS0, s1: jumpS0 + JUMP_PROFILE[JUMP_PROFILE.length - 1][0] };

  /* Where the joker leaves the course and comes back to it. */
  const JL = joker.length;
  const offAt = (s) => {
    const p = pointAt(joker, s - Math.floor(s / JL) * JL);
    return nearestOn(line, p.x, p.y).d > 1.5;
  };
  let split = null;
  let merge = null;
  for (let s = 1; s < 2 * JL && merge === null; s += 1) {
    if (split === null && offAt(s) && !offAt(s - 1)) {
      split = s;
    } else if (split !== null && !offAt(s) && offAt(s - 1)) {
      merge = s;
    }
  }

  /* How far a plan point is from the nearest track centre, the joker's
   * included: what a barrier and a tree keep clear of. */
  const clearOf = (x, y) => Math.min(nearestOn(line, x, y).d, nearestOn(joker, x, y).d);

  /* THE BARRIERS. On a straight, concrete blocks a few metres off the edge
   * on both sides; on the outside of a bend, a tyre wall further out behind
   * a gravel trap. A piece that would stand on another stretch of track, or
   * on the joker, is left out, so where two stretches run close there is one
   * line of blocks between them and not two. */
  const barriers = [];
  const SEG = 3.2;
  const n = Math.round(L / SEG);
  for (let i = 0; i < n; i += 1) {
    const sa = (i * L) / n;
    const sb = ((i + 1) * L) / n;
    const sm = (sa + sb) / 2;
    const bend = bendAt(line, sm, 8, 6e-3);
    for (const side of [-1, 1]) {
      const outside = bend !== 0 && side === -bend;
      const off = outside ? 11.5 : 8.6;
      const look = outside ? 'tyres' : (i % 9 === 0 ? 'red' : 'jersey');
      const a = beside(line, sa, side * off);
      const b = beside(line, sb, side * off);
      const m = beside(line, sm, side * off);
      if (clearOf(a.x, a.y) < off - 0.3 || clearOf(b.x, b.y) < off - 0.3 || clearOf(m.x, m.y) < off - 0.3) {
        continue;
      }
      if (a.x < 2 || b.x < 2 || a.y < 2 || b.y < 2) {
        continue;
      }
      barriers.push({ a: [a.x, a.y], b: [b.x, b.y], look, i, gravelTrap: outside ? side : 0, s: sm });
    }
  }
  /* And along the joker where it is out on its own. */
  if (split !== null) {
    const jn = Math.round((merge - split) / SEG);
    for (let i = 1; i < jn - 1; i += 1) {
      const wrap = (v) => v - Math.floor(v / JL) * JL;
      const sa = wrap(split + (i * (merge - split)) / jn);
      const sb = wrap(split + ((i + 1) * (merge - split)) / jn);
      const sm = wrap(split + ((i + 0.5) * (merge - split)) / jn);
      const bend = bendAt(joker, sm, 8, 6e-3);
      const side = bend ? -bend : -1;
      const a = beside(joker, sa, side * 10.5);
      const b = beside(joker, sb, side * 10.5);
      if (nearestOn(line, a.x, a.y).d < 9 || a.x < 1.5 || b.x < 1.5) {
        continue;
      }
      barriers.push({ a: [a.x, a.y], b: [b.x, b.y], look: 'tyres', i, gravelTrap: 0, s: -1 });
    }
  }

  /* THE KERBS, on the inside of every tarmac bend. */
  const kerbs = [];
  for (let s = 0; s < L; s += 1.6) {
    const bend = bendAt(line, s, 6, 8e-3);
    if (!bend || surfaceAt(s) !== 'tarmac') {
      continue;
    }
    const q = beside(line, s, bend * (TRACK_WIDTH / 2 - 0.45));
    kerbs.push({ x: q.x, y: q.y, tx: q.tx, ty: q.ty, len: 1.6, red: Math.floor(s / 1.6) % 2 === 0 });
  }

  MEMO = {
    line, joker, surfaces, surfaceAt, jump, barriers, kerbs, split, merge, clearOf,
  };
  return MEMO;
}

/* ------------------------------------------------------------------ */
/* The solids and drawings                                             */
/* ------------------------------------------------------------------ */

/* A run of something drawn along a plan segment: the kit turned onto it,
 * its local x along the run from 0 to `len`. */
function along(K, chunk, a, b, h, fn) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  turn(K, chunk, a[0], a[1], h, Math.atan2(dy, dx));
  fn(len);
}

/* The jump: its solid, capsules lying across the track every 0.8 m at the
 * height the ground has there, and the drawing over them. */
function jumpParts(T, Lay) {
  const { line, jump } = Lay;
  const p0 = pointAt(line, jump.s0);
  const y = p0.y;
  for (let d = 0.4; d < jump.s1 - jump.s0; d += 0.8) {
    const h = jumpGround(d);
    if (h < 0.14) {
      continue;
    }
    const r = 0.45;
    T.cap('rxTarmac', [p0.x + d, y - JUMP_HALF, Math.max(h - r, 0)], [p0.x + d, y + JUMP_HALF, Math.max(h - r, 0)], r, { draw: false, kind: 'wall', name: 'jump' });
  }
  T.draw(p0.x, y, (K, c) => {
    /* A wedge per piece of the profile, in the plan's east and up. */
    turn(K, c, p0.x, y, 0, 0);
    const side = [];
    for (const [d, h] of P) {
      side.push([d, h]);
    }
    const shape = [[0, 0], ...side.slice(1, -1), [P[P.length - 1][0], 0]];
    K.extrude('rxGravel', shape, -JUMP_HALF, JUMP_HALF);
    K.extrude('rxTarmac', shape.map(([x, hh]) => [x, hh > 0.001 ? hh + 0.03 : 0]), -JUMP_HALF + 1.2, JUMP_HALF - 1.2);
    /* The white line painted across the lip. */
    K.box('rxPaint', 9.6, 1.53, -JUMP_HALF + 1.2, 10.4, 1.6, JUMP_HALF - 1.2);
  });
}

/* The barriers' solids and drawings. A concrete block is a capsule 0.45
 * round lying at 0.45; a tyre wall is two rows of tyres, a capsule 0.6
 * round at 0.55. */
function barrierParts(T, Lay) {
  for (const b of Lay.barriers) {
    const tyres = b.look === 'tyres';
    const r = tyres ? 0.62 : 0.42;
    const h = tyres ? 0.55 : 0.42;
    T.cap(tyres ? 'rxTyre' : 'rxJersey', [b.a[0], b.a[1], h], [b.b[0], b.b[1], h], r, { draw: false, kind: tyres ? 'obstacle' : 'wall', name: tyres ? 'tyre wall' : 'barrier' });
    T.draw((b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2, (K, c) => {
      along(K, c, b.a, b.b, 0, (len) => {
        if (tyres) {
          const k = Math.max(1, Math.round(len / 0.72));
          for (let i = 0; i < k; i += 1) {
            const x = (i + 0.5) * (len / k);
            for (const z of [-0.36, 0.36]) {
              K.cyl('rxTyre', [x, 0, z], [x, 1.08, z], 0.34, 8);
            }
            /* Every other column of tyres has a yellow band painted on it,
             * as a tyre wall's are, so its run reads from the air. */
            if ((i + b.i) % 2 === 0) {
              K.cyl('rxTyreBand', [x, 0.72, -0.36], [x, 0.9, -0.36], 0.345, 8);
            }
          }
          /* The belt strapped along the front. */
          K.box('rxIndigo', 0, 0.38, -0.73, len, 0.62, -0.69);
        } else {
          /* A New Jersey block: the profile of the real one, 0.81 m tall. */
          const prof = [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.2, 0.25], [0.08, 0.81], [-0.08, 0.81], [-0.2, 0.25], [-0.3, 0.08]];
          turn(K, c, b.a[0], b.a[1], 0, Math.atan2(b.b[1] - b.a[1], b.b[0] - b.a[0]) + Math.PI / 2);
          K.extrude(b.look === 'red' ? 'rxJerseyRed' : 'rxJersey', prof, 0.02, len - 0.02);
        }
      });
    });
  }
}

/* The grandstand. The rows are stacked boxes, so the underside is closed
 * and a row's top is ground to land on. The back wall, the columns and the
 * roof are boxes and posts; the roof gap is what is left between them. */
function grandstand(T) {
  const S = STAND;
  T.box('rxJersey', S.x0, S.y0 - 0.3, 0, S.x1, S.y0, S.front + 0.2, { name: 'stand front' });
  for (let k = 0; k < S.rows; k += 1) {
    const y0 = S.y0 + k * S.tread;
    const h = S.front + k * S.rise;
    T.box(k % 2 ? 'rxJersey' : 'concrete', S.x0, y0, 0, S.x1, y0 + S.tread, h, { name: 'stand row' });
  }
  /* The back wall, to the slot. */
  T.box('rxSteel', S.x0, S.yBack, 0, S.x1, S.yBack + 0.3, S.wall, { name: 'stand back wall' });
  /* The end walls, closing the rows. */
  for (const x of [S.x0 - 0.3, S.x1]) {
    T.box('rxSteel', x, S.y0 - 0.3, 0, x + 0.3, S.yBack + 0.3, S.wall, { name: 'stand end' });
  }
  /* The columns at the back, through the slot to the roof. */
  for (let x = S.x0; x <= S.x1 + 0.01; x += S.bay) {
    T.post('rxSteelDark', x, S.colY, 0, S.roof0, 0.22, { name: 'stand column' });
  }
  /* The roof, and its fascia. */
  T.box('rxRoof', S.x0 - 1, S.roofY0, S.roof0, S.x1 + 1, S.roofY1, S.roof1, { name: 'stand roof' });
  T.draw((S.x0 + S.x1) / 2, S.y0, (K, c) => {
    origin(K, c);
    const a = w(S.x0 - 1.02, S.roofY0 - 0.02, S.roof0 - 0.7);
    const b = w(S.x1 + 1.02, S.roofY0 + 0.02, S.roof1 + 0.05);
    K.box('rxCanvasBlue', a[0], a[1], Math.min(a[2], b[2]), b[0], b[1], Math.max(a[2], b[2]));
    const u = w(S.x0 - 1, S.roofY0, S.roof0 - 0.02);
    const v = w(S.x1 + 1, S.roofY1, S.roof0);
    K.box('rxRoofUnder', u[0], u[1], Math.min(u[2], v[2]), v[0], v[1], Math.max(u[2], v[2]));
    /* The roof's cantilever beams over the seats, one a column, deep at the
     * back and thin at the front: a wedge under the roof. */
    for (let x = S.x0; x <= S.x1 + 0.01; x += S.bay) {
      turn(K, c, x, S.colY, 0, Math.PI / 2);
      K.extrude('rxSteelDark', [[0, S.roof0 - 1.0], [0, S.roof0], [-(S.colY - S.roofY0), S.roof0], [-(S.colY - S.roofY0), S.roof0 - 0.25]], -0.12, 0.12);
      origin(K, c);
    }
    /* Seats: a strip of plastic on every row, blue with a red block in
     * the middle of the stand, and the steps up through it. */
    for (let k = 0; k < S.rows; k += 1) {
      const y0 = S.y0 + k * S.tread;
      const h = S.front + k * S.rise;
      for (let x = S.x0 + 0.4; x < S.x1 - 0.4; x += 0.55) {
        if (Math.abs(x - (S.x0 + S.x1) / 2) < 0.9 || Math.abs(x - S.x0 - 25) < 0.9 || Math.abs(x - S.x1 + 25) < 0.9) {
          continue;
        }
        const mid = Math.abs(x - (S.x0 + S.x1) / 2) < 10 && k > 3 && k < 9;
        const p = w(x, y0 + 0.62, h);
        K.box(mid ? 'rxSeatRed' : 'rxSeat', p[0] - 0.21, h, p[2] - 0.2, p[0] + 0.21, h + 0.12, p[2] + 0.2);
        K.box(mid ? 'rxSeatRed' : 'rxSeat', p[0] - 0.21, h + 0.12, p[2] - 0.24, p[0] + 0.21, h + 0.45, p[2] - 0.2);
      }
    }
    /* Crash rails along the front and the stairs' hand rails. */
    const r0 = w(S.x0, S.y0 - 0.15, S.front + 1.05);
    const r1 = w(S.x1, S.y0 - 0.15, S.front + 1.05);
    K.cyl('rxSteel', r0, r1, 0.04, 6);
    for (let x = S.x0 + 2; x < S.x1; x += 4) {
      const p = w(x, S.y0 - 0.15, S.front + 0.2);
      K.cyl('rxSteel', p, [p[0], S.front + 1.05, p[2]], 0.03, 4);
    }
  });
}

/* The spectators' footbridge over the back straight: two stair towers and
 * a deck between them, its rails drawn and its deck solid from below too. */
function footbridge(T) {
  const B = BRIDGE;
  const x0 = B.x - B.w / 2;
  const x1 = B.x + B.w / 2;
  T.box('rxSteel', x0, B.y0, B.deck, x1, B.y1, B.deck + B.t, { name: 'footbridge deck' });
  /* The stair towers, solid, and the flights up them drawn. */
  for (const [ya, yb] of [[B.y0 - 6, B.y0], [B.y1, B.y1 + 6]]) {
    T.box('rxSteelDark', x0 - 0.5, ya, 0, x1 + 0.5, yb, 0.2, { name: 'stair foot' });
    for (const [px, py] of [[x0 - 0.4, ya + 0.2], [x1 + 0.4, ya + 0.2], [x0 - 0.4, yb - 0.2], [x1 + 0.4, yb - 0.2]]) {
      T.post('rxSteelDark', px, py, 0, B.deck + B.t, 0.12, { name: 'stair post' });
    }
    T.box('rxSteel', x0, ya, B.deck, x1, yb, B.deck + B.t, { name: 'landing' });
  }
  /* The deck's girders' posts, standing beside the track's barriers. */
  T.draw(B.x, (B.y0 + B.y1) / 2, (K, c) => {
    origin(K, c);
    for (const [ya, yb] of [[B.y0 - 6, B.y1 + 6]]) {
      for (const px of [x0, x1]) {
        /* The rail and its balusters. */
        const a = w(px, ya, B.deck + B.t + 1.1);
        const b = w(px, yb, B.deck + B.t + 1.1);
        K.cyl('rxSteel', a, b, 0.04, 6);
        const a2 = w(px, ya, B.deck + B.t + 0.55);
        const b2 = w(px, yb, B.deck + B.t + 0.55);
        K.cyl('rxSteel', a2, b2, 0.025, 4);
        for (let y = ya; y <= yb + 0.01; y += 1.4) {
          const p = w(px, y, B.deck + B.t);
          K.cyl('rxSteel', p, [p[0], p[1] + 1.1, p[2]], 0.025, 4);
        }
      }
      /* A girder down each side under the deck, painted the circuit's
       * blue, and a banner panel on each face. */
      for (const px of [x0 - 0.05, x1 + 0.05]) {
        const a = w(px - 0.08, B.y0, B.deck - 0.55);
        const b = w(px + 0.08, B.y1, B.deck);
        K.box('rxCanvasBlue', a[0], a[1], Math.min(a[2], b[2]), b[0], b[1], Math.max(a[2], b[2]));
      }
    }
    /* The flights of steps, sawtooth boxes climbing each tower. */
    for (const [ya, dir] of [[B.y0 - 6, 1], [B.y1 + 6, -1]]) {
      for (let k = 0; k < 14; k += 1) {
        const y = ya + dir * k * 0.42;
        const h = (k + 1) * (B.deck / 14);
        const a = w(x0, y, h - 0.06);
        const b = w(x1, y + dir * 0.42, h);
        K.box('rxSteelDark', a[0], a[1], Math.min(a[2], b[2]), b[0], b[1], Math.max(a[2], b[2]));
      }
    }
  });
}

/* The commentary tower: four legs braced, a cabin with windows all round,
 * a flat roof with a mast. The legs are the gap. */
function commentary(T) {
  const { x, y, half, deck, top } = TOWER;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    T.post('rxSteelDark', x + dx * half, y + dy * half, 0, deck, 0.15, { kind: 'pole', name: 'tower leg' });
  }
  T.box('rxPlaster', x - 2.4, y - 2.4, deck, x + 2.4, y + 2.4, deck + 0.3, { name: 'tower floor' });
  T.box('rxPlaster', x - 2.3, y - 2.3, deck + 0.3, x + 2.3, y + 2.3, deck + 1.1, { name: 'tower cabin' });
  T.box('rxPlaster', x - 2.3, y - 2.3, deck + 2.5, x + 2.3, y + 2.3, top - 0.25, { name: 'tower cabin' });
  for (const [ax, ay] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
    T.post('rxPlaster', x + ax, y + ay, deck + 1.1, deck + 2.5, 0.1, { name: 'tower mullion' });
  }
  T.box('rxCanvasBlue', x - 2.7, y - 2.7, top - 0.25, x + 2.7, y + 2.7, top, { name: 'tower roof' });
  T.post('rxSteel', x + 1.8, y + 1.8, top, top + 3.2, 0.05, { kind: 'pole', name: 'tower mast' });
  T.draw(x, y, (K, c) => {
    origin(K, c);
    /* Glass all round between the cabin's sill and head, and the braces. */
    for (const [a, b] of [[[-2.25, -2.3], [2.25, -2.3]], [[-2.25, 2.3], [2.25, 2.3]], [[-2.3, -2.25], [-2.3, 2.25]], [[2.3, -2.25], [2.3, 2.25]]]) {
      const p = w(x + a[0], y + a[1], deck + 1.1);
      const q = w(x + b[0], y + b[1], deck + 2.5);
      const lo = [Math.min(p[0], q[0]) - 0.01, p[1], Math.min(p[2], q[2]) - 0.01];
      const hi = [Math.max(p[0], q[0]) + 0.01, q[1], Math.max(p[2], q[2]) + 0.01];
      K.box('glassBlue', lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
    }
    for (const [dx, dy, ex, ey] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
      K.cyl('rxSteel', w(x + dx * half, y + dy * half, 0.5), w(x + ex * half, y + ey * half, deck - 0.5), 0.04, 4);
    }
    /* A ladder up the north side and a flag on the mast. */
    K.ladder('rxSteel', w(x, y + half + 0.2, 0), w(x, y + half + 0.2, deck), 0.5);
    const m = w(x + 1.8, y + 1.8, top + 2.4);
    K.box('rxLivYellow', m[0], m[1], m[2] - 0.02, m[0] + 1.2, m[1] + 0.75, m[2] + 0.02);
  });
}

/* The big screen, facing north to the stand, on two legs with a cross
 * beam; the screen itself is a picture (./signs.js). */
function bigScreen(T) {
  const { x, y, w: sw, h0, h1, legs } = SCREEN;
  for (const dx of [-legs / 2, legs / 2]) {
    T.post('rxSteelDark', x + dx, y, 0, h0, 0.22, { kind: 'pole', name: 'screen leg' });
  }
  T.box('rxSteelDark', x - sw / 2, y - 0.35, h0, x + sw / 2, y + 0.25, h1, { name: 'big screen' });
}

/* The start lights: two posts, a beam, five lamp pods hung under it, and
 * the start line and the grid boxes painted on the tarmac behind it. */
function gantry(T) {
  const G = GANTRY;
  for (const dy of [-G.span, G.span]) {
    T.post('rxSteelDark', G.x, G.y + dy, 0, G.h1, 0.2, { kind: 'pole', name: 'gantry post' });
  }
  T.box('rxSteelDark', G.x - 0.3, G.y - G.span, G.h0, G.x + 0.3, G.y + G.span, G.h1, { name: 'gantry beam' });
  T.draw(G.x, G.y, (K, c) => {
    origin(K, c);
    for (let k = -2; k <= 2; k += 1) {
      const p = w(G.x - 0.32, G.y + k * 1.2, G.h0 - 0.05);
      K.box('rxLivBlack', p[0] - 0.12, p[1] - 1.05, p[2] - 0.35, p[0] + 0.12, p[1], p[2] + 0.35);
      for (let j = 0; j < 2; j += 1) {
        const lamp = w(G.x - 0.45, G.y + k * 1.2, G.h0 - 0.32 - j * 0.45);
        K.cyl(j === 0 ? 'rxLampRed' : 'rxLampOff', [lamp[0] - 0.02, lamp[1], lamp[2]], [lamp[0] - 0.08, lamp[1], lamp[2]], 0.16, 10);
      }
    }
    /* The start line, chequered, across the track at the gantry. */
    for (let i = 0; i < 24; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        if ((i + j) % 2) {
          continue;
        }
        const a = w(G.x + 0.4 + j * 0.5, G.y - 6 + i * 0.5, 0.035);
        K.box('rxPaint', a[0], 0.03, a[2] - 0.5, a[0] + 0.5, 0.04, a[2]);
      }
    }
    /* The grid: two rows of boxes, staggered, behind the line. */
    for (let k = 0; k < 6; k += 1) {
      const gx = G.x - 8 - k * 8;
      const gy = G.y + (k % 2 ? -3 : 3);
      const p = w(gx, gy, 0.03);
      K.box('rxPaint', p[0] - 0.1, 0.03, p[2] - 1.1, p[0] + 0.1, 0.04, p[2] + 1.1);
      K.box('rxPaint', p[0] - 2.2, 0.03, p[2] - 1.1, p[0], 0.04, p[2] - 0.95);
      K.box('rxPaint', p[0] - 2.2, 0.03, p[2] + 0.95, p[0], 0.04, p[2] + 1.1);
    }
  });
}

/* ------------------------------------------------------------------ */
/* The named gaps                                                       */
/* ------------------------------------------------------------------ */

/* Clearance kept inside every frame, metres. */
const M = 0.3;

export function circuitGaps() {
  const S = STAND;
  const mid = (S.x0 + S.x1) / 2;
  return [
    /* The roof gap, in the middle bay: between two columns, over the back
     * wall and under the roof. */
    {
      name: 'ROOF GAP', px: mid + S.bay / 2, py: S.colY, deg: 90, w: S.bay - 2 * 0.22 - 2 * M, h0: S.wall + M, h1: S.roof0 - M, points: 1000,
    },
    {
      name: 'START LIGHTS', px: GANTRY.x, py: GANTRY.y, deg: 0, w: 2 * GANTRY.span - 0.4 - 2 * M, h0: M, h1: GANTRY.h0 - 1.2 - M, points: 100,
    },
    {
      name: 'FOOTBRIDGE', px: BRIDGE.x, py: (BRIDGE.y0 + BRIDGE.y1) / 2, deg: 0, w: BRIDGE.y1 - BRIDGE.y0 - 2 * M, h0: M, h1: BRIDGE.deck - M, points: 250,
    },
    {
      name: 'TOWER LEGS', px: TOWER.x, py: TOWER.y, deg: 0, w: 2 * TOWER.half - 0.3 - 2 * M, h0: M, h1: TOWER.deck - M, points: 1000,
    },
    {
      name: 'UNDER THE SCREEN', px: SCREEN.x, py: SCREEN.y, deg: 90, w: SCREEN.legs - 0.44 - 2 * M, h0: M, h1: SCREEN.h0 - M, points: 250,
    },
    {
      name: 'THE JUMP', px: JUMP_X + 13, py: 118, deg: 0, w: 2 * JUMP_HALF - 2 * M, h0: 3.2, h1: 12, points: 100,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* The circuit's parts                                                  */
/* ------------------------------------------------------------------ */

export function circuitParts(T) {
  const Lay = circuitLayout();
  jumpParts(T, Lay);
  barrierParts(T, Lay);
  grandstand(T);
  footbridge(T);
  commentary(T);
  bigScreen(T);
  gantry(T);
  return Lay;
}

export { hash };
