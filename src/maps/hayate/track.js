/*
 * track.js: Hayate Circuit's track furniture, the things every road course
 * in Japan has round its tarmac and that make it read as a circuit from the
 * air and from the cockpit: armco along both sides, gravel traps on the
 * outside of the corners with a tyre wall behind, red and white kerbs at
 * every apex and exit, the walls and catch fence down the main straight,
 * the start line and the grid, brake boards counting down to turn one and
 * the chicane, marshal posts with their flag boards, the TV camera towers,
 * corner number boards and the hoardings along the barriers.
 *
 * Distances are real ones (FIA circuit guidance and Japanese national
 * circuits measured off aerial photographs): a gravel trap 15 to 22 m
 * deep, armco 0.75 m high on posts every 2 m, a catch fence 4 m, kerbs
 * 1 m wide, a grid slot every 8 m with the second row offset.
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

import { pointAt } from '../built/road.js';
import {
  courseLine, sAt, lapped, bendAt, beside, HALF,
} from './frame.js';

/* The start line, plan x, and where the main straight's walls run. */
export const START_X = 330;
export const STRAIGHT = { x0: 150, x1: 536, y: 70 };
export const SOUTH_WALL = { y0: 57.6, y1: 58.2, h: 1.1, fence: 4.4 };
export const PIT_WALL = { x0: 194, x1: 506, y0: 78.6, y1: 79.4, h: 1.1 };

/*
 * THE CORNERS, as the furniture sees them: which course corner, how far
 * before and after it the outside's gravel runs, how deep it is, and
 * whether a tyre wall stands behind it. The rest of the outside, and the
 * whole of the inside, is a grass verge and armco.
 */
const CORNERS = [
  { k: 1, before: 34, after: 16, deep: 22, tyres: true, name: 'T1' },
  { k: 2, before: 10, after: 18, deep: 16, tyres: true, name: 'T2' },
  { k: 3, before: 10, after: 10, deep: 12, tyres: false, name: 'T3' },
  { k: 4, before: 10, after: 10, deep: 12, tyres: false, name: 'T4' },
  { k: 5, before: 10, after: 10, deep: 12, tyres: false, name: 'T5' },
  { k: 6, before: 22, after: 10, deep: 18, tyres: true, name: 'T6' },
  { k: 7, before: 10, after: 22, deep: 16, tyres: true, name: 'T7' },
  { k: 10, before: 18, after: 10, deep: 18, tyres: false, name: 'T8' },
  { k: 11, before: 10, after: 10, deep: 22, tyres: true, name: 'T9' },
  { k: 12, before: 10, after: 18, deep: 18, tyres: false, name: 'T10' },
  { k: 13, before: 14, after: 6, deep: 14, tyres: true, name: 'T11' },
  { k: 14, before: 6, after: 12, deep: 12, tyres: true, name: 'T12' },
  { k: 15, before: 16, after: 8, deep: 18, tyres: false, name: 'T13' },
  { k: 0, before: 10, after: 14, deep: 16, tyres: true, name: 'T14' },
];

/* Where the outside is deep, as arcs of s with a depth, so the armco on
 * the outside stands behind the gravel and the rest stands on the verge. */
function outsideDepth() {
  const L = courseLine().length;
  const arcs = [];
  for (const c of CORNERS) {
    const s = sAt(c.k);
    arcs.push({ s0: s - c.before, s1: s + c.after, deep: c.deep, tyres: c.tyres, c });
  }
  return {
    arcs,
    at(s) {
      let best = 0;
      for (const a of arcs) {
        const d = s - a.s0 - Math.floor((s - a.s0) / L) * L;
        if (d <= a.s1 - a.s0 && a.deep > best) {
          best = a.deep;
        }
      }
      return best;
    },
  };
}

/* The main straight and the pit straight, where walls stand instead of
 * armco: the arc of s the straight takes, inside the two end bends. */
function onStraight(x, y) {
  return y > 56 && y < 84 && x > STRAIGHT.x0 - 6 && x < STRAIGHT.x1 + 4;
}

const SEG = 4;
const ARMCO_H = 0.75;

/*
 * The armco, both sides, all the way round: a capsule at rail height every
 * SEG metres, solid and not drawn, under a pair of w beam rails and a post
 * drawn turned onto the road. On the outside of a corner it stands behind
 * the gravel; elsewhere 6 m off the edge, on the verge.
 */
function armco(T, depth) {
  const line = courseLine();
  const n = Math.round(line.length / SEG);
  const step = line.length / n;
  for (const side of [1, -1]) {
    for (let i = 0; i < n; i += 1) {
      const sa = i * step;
      const sb = sa + step;
      const sm = (sa + sb) / 2;
      const bend = bendAt(sm, 6, 2e-3);
      const outside = bend !== 0 && side === -bend;
      const deep = outside ? depth.at(sm) : 0;
      const off = HALF + (deep > 0 ? deep + 1.5 : 6);
      const a = beside(sa, side * off);
      const b = beside(sb, side * off);
      const m = beside(sm, side * off);
      if (onStraight(m.x, m.y)) {
        continue;
      }
      T.cap('metal', [a.x, a.y, 0.45], [b.x, b.y, 0.45], 0.45, { draw: false, kind: 'wall', name: 'armco' });
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy) + 0.05;
      const tx = dx / (len - 0.05);
      const ty = dy / (len - 0.05);
      /* The two rails, on the road's side of the posts. */
      const fx = -ty * side * 0.12;
      const fy = tx * side * 0.12;
      T.obox('hyArmco', m.x - fx, m.y - fy, ARMCO_H - 0.32, ARMCO_H - 0.02, len, 0.1, tx, ty);
      T.obox('hyArmco', m.x - fx, m.y - fy, ARMCO_H - 0.6, ARMCO_H - 0.38, len, 0.08, tx, ty, true);
      T.obox('metalDark', m.x + fx, m.y + fy, 0, ARMCO_H, 0.12, 0.12, tx, ty, true);
      T.obox('metalDark', a.x + fx, a.y + fy, 0, ARMCO_H, 0.12, 0.12, tx, ty, true);
    }
  }
}

/*
 * THE GRAVEL TRAPS and the tyre walls behind them: a strip of gravel on
 * the outside of each corner from 1.5 m off the edge (a strip of grass
 * between, as at every Japanese circuit), and stacked tyres, red and white
 * banded, along the armco where a car leaving the road at speed would
 * arrive. The gravel is paint on the grass: a car or a quad meets the
 * ground, and gravel is ground.
 */
function traps(T, depth) {
  for (const a of depth.arcs) {
    const s = (a.s0 + a.s1) / 2;
    const side = -bendAt(s, 6, 2e-3) || -1;
    T.op({
      t: 'strip', m: 'hyGravel', s0: a.s0, s1: a.s1, off0: side * (HALF + 1.5), off1: side * (HALF + a.deep), h: 0.025, x: beside(s, 0).x, y: beside(s, 0).y,
    });
    /* A ragged edge of darker gravel where the cars have been through. */
    T.op({
      t: 'strip', m: 'hyGravelDark', s0: a.s0 + 4, s1: a.s1 - 4, off0: side * (HALF + 2.4), off1: side * (HALF + 4.2), h: 0.03, x: beside(s, 0).x, y: beside(s, 0).y,
    });
    if (!a.tyres) {
      continue;
    }
    const off = side * (HALF + a.deep + 0.7);
    const n = Math.max(1, Math.round((a.s1 - a.s0) / 0.8));
    for (let i = 0; i < n; i += 1) {
      const q = beside(a.s0 + (i + 0.5) * ((a.s1 - a.s0) / n), off);
      T.op({
        t: 'tyres', x: q.x, y: q.y, n: 3, band: i % 4 === 0, fine: i % 2 === 1,
      });
    }
    /* Solid where it stands: a capsule along it, the stack's height. */
    for (let s0 = a.s0; s0 < a.s1 - 0.5; s0 += SEG) {
      const s1 = Math.min(a.s1, s0 + SEG);
      const p = beside(s0, off);
      const q = beside(s1, off);
      T.cap('drTyre', [p.x, p.y, 0.4], [q.x, q.y, 0.4], 0.4, { draw: false, kind: 'wall', name: 'tyre wall' });
    }
  }
}

/*
 * THE KERBS: red and white blocks a metre wide along the inside of every
 * apex and the outside of every exit, flat on the tarmac and not solid. At
 * the chicane they are the tall sausage kerbs too, painted yellow.
 */
function kerbs(T) {
  const line = courseLine();
  const put = (s0, s1, side, step = 1.6) => {
    const n = Math.max(1, Math.round((s1 - s0) / step));
    const st = (s1 - s0) / n;
    for (let i = 0; i < n; i += 1) {
      const sm = s0 + (i + 0.5) * st;
      const q = beside(sm, side * (HALF - 0.45));
      T.op({
        t: 'kerb', x: q.x, y: q.y, tx: q.tx, ty: q.ty, len: st, red: i % 2 === 0,
      });
    }
  };
  for (const c of CORNERS) {
    const s = sAt(c.k);
    const inside = bendAt(s, 6, 2e-3) || 1;
    put(s - 14, s + 14, inside);
    put(s + 8, s + c.after + 12, -inside);
  }
  void line;
}

/*
 * THE MAIN STRAIGHT'S WALLS: a concrete wall on the stands' side with the
 * catch fence on it, posts every 4 m and a net between, and the pit wall
 * on the other, lower, with the timing stands behind it (./pits.js).
 */
function straightWalls(T) {
  const { y0, y1, h, fence } = SOUTH_WALL;
  const x0 = STRAIGHT.x0 + 8;
  const x1 = STRAIGHT.x1 - 10;
  T.box('concrete', x0, y0, 0, x1, y1, h, { name: 'straight wall' });
  T.deco('white', x0, y0 - 0.02, h - 0.22, x1, y1 + 0.02, h - 0.1);
  /* The fence over it: solid from the wall to its top, a net drawn. */
  T.solid(x0, y0 + 0.2, h, x1, y1 - 0.2, fence, 'catch fence');
  for (let x = x0; x <= x1; x += 4) {
    T.deco('metal', x - 0.06, y0 + 0.24, h, x + 0.06, y0 + 0.36, fence + 0.3);
    T.deco('metal', x - 0.04, y0 + 0.36, fence - 0.1, x + 0.04, y0 + 1.1, fence + 0.3, true);
  }
  T.op({ t: 'net', x0, x1, y: (y0 + y1) / 2, h0: h, h1: fence });
  T.deco('metal', x0, y0 + 0.26, fence - 0.04, x1, y0 + 0.34, fence + 0.04);
  /* The pit wall, and its fence: lower, a debris fence. */
  const p = PIT_WALL;
  T.box('concrete', p.x0, p.y0, 0, p.x1, p.y1, p.h, { name: 'pit wall' });
  T.deco('hyKerbRed', p.x0, p.y0 - 0.02, 0.12, p.x1, p.y0 + 0.01, 0.4, true);
  for (let x = p.x0 + 2; x < p.x1; x += 4) {
    T.deco(((x - p.x0) / 4) % 2 < 1 ? 'hyKerbRed' : 'white', x, p.y0 - 0.02, 0.12, x + 2, p.y0 + 0.01, 0.4, true);
  }
  T.solid(p.x0, p.y0 + 0.2, p.h, p.x1, p.y1 - 0.2, 3.0, 'debris fence');
  for (let x = p.x0; x <= p.x1; x += 4) {
    T.deco('metal', x - 0.05, p.y0 + 0.3, p.h, x + 0.05, p.y0 + 0.4, 3.1);
  }
  T.op({ t: 'net', x0: p.x0, x1: p.x1, y: (p.y0 + p.y1) / 2, h0: p.h, h1: 3.0 });
  T.deco('metal', p.x0, p.y0 + 0.3, 2.95, p.x1, p.y0 + 0.4, 3.05);
}

/*
 * THE LINE AND THE GRID: the chequered start line across the track, the
 * grid slots behind it (the cars face west, so behind is east), pole on
 * the inside, a slot every 8 m, the second row 4 m back and across, each
 * a white bracket and a number painted on the tarmac.
 */
function grid(T) {
  const y = STRAIGHT.y;
  for (let i = 0; i < 12; i += 1) {
    for (let r = 0; r < 2; r += 1) {
      const a = y - HALF + 0.4 + i * 1.0;
      T.deco((i + r) % 2 ? 'white' : 'hyInk', START_X - 1.0 + r * 1.0, a, 0.02, START_X + r * 1.0, a + 1.0, 0.045);
    }
  }
  for (let k = 0; k < 12; k += 1) {
    const x = START_X + 10 + k * 8;
    const side = k % 2 === 0 ? 1 : -1;
    const yc = y + side * 2.6;
    T.deco('white', x - 0.15, yc - 1.4, 0.02, x + 0.15, yc + 1.4, 0.04);
    T.deco('white', x - 0.15, yc - 1.4, 0.02, x + 1.4, yc - 1.1, 0.04);
    T.deco('white', x - 0.15, yc + 1.1, 0.02, x + 1.4, yc + 1.4, 0.04);
    T.sign(`grid${k + 1}`, x + 3.2, yc, 0.045, 0, 0, 1.6, 1.6);
  }
  /* The start line's own letters on the tarmac, read from the stands. */
  T.sign('startLine', START_X + 4.2, y - HALF + 2.2, 0.045, 0, 0, 5.6, 1.4);
}

/*
 * THE BRAKE BOARDS: 150, 100 and 50 before turn one, on the stands' side
 * between the track and the wall, and the same before the chicane on the
 * east side's outside. A board on a post, the number painted both faces.
 */
function brakeBoards(T) {
  for (const [x, key] of [[262, 'b150'], [212, 'b100'], [162, 'b50']]) {
    T.post('metal', x, 60.8, 0, 2.2, 0.06, { kind: 'pole', name: 'brake board' });
    T.box('white', x - 0.05, 60.2, 2.2, x + 0.05, 61.4, 3.4, { name: 'brake board' });
    T.sign(key, x + 0.07, 60.8, 2.8, 1, 0, 1.15, 1.15);
  }
  const s13 = sAt(13);
  for (const [d, key] of [[60, 'b150'], [40, 'b100'], [20, 'b50']]) {
    const q = beside(s13 - d - 12, -(HALF + 3.5));
    T.post('metal', q.x, q.y, 0, 2.2, 0.06, { kind: 'pole', name: 'brake board' });
    T.obox('white', q.x, q.y, 2.2, 3.4, 0.1, 1.2, q.tx, q.ty);
    T.sign(key, q.x - q.tx * 0.07, q.y - q.ty * 0.07, 2.8, -q.tx, -q.ty, 1.15, 1.15);
  }
}

/*
 * THE MARSHAL POSTS: a white hut with an orange roof behind the armco at
 * every corner group, its flag board, a light panel on a pole, an
 * extinguisher. And the corner number boards, on posts on the outside.
 */
function marshals(T, depth) {
  const posts = [
    { k: 1, d: -30 }, { k: 4, d: 0 }, { k: 6, d: -14 }, { k: 9, d: 0 },
    { k: 11, d: 0 }, { k: 13, d: -10 }, { k: 0, d: -24 },
  ];
  let i = 0;
  for (const m of posts) {
    const s = sAt(m.k) + m.d;
    const inside = bendAt(s, 8, 2e-3) || 1;
    const deep = depth.at(s);
    const q = beside(s, inside * (HALF + 9));
    T.op({
      t: 'marshal', x: q.x, y: q.y, tx: q.tx, ty: q.ty, side: inside, i,
    });
    /* Solid: the hut. */
    T.box('white', q.x - 1.1, q.y - 1.1, 0, q.x + 1.1, q.y + 1.1, 2.5, { draw: false, name: 'marshal hut' });
    T.sign(`post${i + 1}`, q.x, q.y, 2.95, 0, 0, 1.6, 1.6, 0.06);
    i += 1;
    void deep;
  }
  /* The corner numbers on the outside, past the gravel. */
  for (const c of CORNERS) {
    const s = sAt(c.k);
    const outside = -(bendAt(s, 6, 2e-3) || 1);
    const q = beside(s + 4, outside * (HALF + c.deep + 3.5));
    T.post('metal', q.x, q.y, 0, 3.0, 0.07, { kind: 'pole', name: 'corner board' });
    const nx = -outside * -q.ty;
    const ny = -outside * q.tx;
    T.op({
      t: 'boardBack', x: q.x, y: q.y, nx, ny, wd: 1.6, ht: 1.0, h: 3.5,
    });
    T.sign(c.name, q.x + nx * 0.07, q.y + ny * 0.07, 3.5, nx, ny, 1.6, 1.0);
  }
}

/*
 * THE TV CAMERA TOWERS: scaffold towers 6 m high on the outside of turn
 * one, the top corner and the sweeper, a deck and a rail, a camera and its
 * operator under a parasol. The legs are solid and 2 m apart, so a pilot
 * can thread one.
 */
export const CAMERA_TOWERS = [];
function cameraTowers(T) {
  for (const [k, d] of [[1, 8], [7, 4], [11, -8]]) {
    const s = sAt(k) + d;
    const outside = -(bendAt(s, 6, 2e-3) || 1);
    const q = beside(s, outside * (HALF + 26));
    const x = Math.round(q.x * 10) / 10;
    const y = Math.round(q.y * 10) / 10;
    const h = 6;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      T.post('scaffold', x + dx * 1.1, y + dy * 1.1, 0, h + 1.1, 0.05, { kind: 'pole', name: 'camera tower' });
    }
    T.box('plywood', x - 1.3, y - 1.3, h - 0.08, x + 1.3, y + 1.3, h + 0.04, { name: 'camera deck' });
    T.op({
      t: 'camTower', x, y, h, tx: -outside * -q.ty, ty: -outside * q.tx,
    });
    CAMERA_TOWERS.push({ x, y, h });
  }
}

/*
 * THE HOARDINGS: advertising boards on the outside armco through the
 * corners the stands look at, a board every 6 m, in the circuit's made up
 * brands (./signs.js), never a real one.
 */
const BOARD_KEYS = ['adTombo', 'adInazuma', 'adNeko', 'adKumo', 'adOkami', 'adHayate', 'adFuji', 'adSuzume'];
function hoardings(T, depth) {
  let k = 0;
  for (const [ci, s0, s1] of [[1, -30, 14], [6, -16, 8], [11, -12, 12], [13, -10, 4]]) {
    const sc = sAt(ci);
    for (let s = sc + s0; s < sc + s1; s += 6.4) {
      const outside = -(bendAt(s, 6, 2e-3) || 1);
      const deep = depth.at(s);
      const off = outside * (HALF + (deep > 0 ? deep + 1.5 : 6) - 0.35);
      const q = beside(s, off);
      const nx = outside * q.ty;
      const ny = -outside * q.tx;
      T.obox('white', q.x, q.y, ARMCO_H + 0.02, ARMCO_H + 1.0, 6.0, 0.08, q.tx, q.ty);
      T.sign(BOARD_KEYS[k % BOARD_KEYS.length], q.x + nx * 0.06, q.y + ny * 0.06, ARMCO_H + 0.51, nx, ny, 5.9, 0.95);
      k += 1;
    }
  }
}

/* The track's own edge paint the road mesh does not draw: the white line
 * a metre in from each edge is the road's; the pit lane exit's blend line
 * is drawn with the pit lane (./pits.js). */

export function trackFurniture(T) {
  const depth = outsideDepth();
  armco(T, depth);
  traps(T, depth);
  kerbs(T);
  straightWalls(T);
  grid(T);
  brakeBoards(T);
  marshals(T, depth);
  cameraTowers(T);
  hoardings(T, depth);
  return depth;
}

/* The arc of s round a corner, for the other files. */
export function cornerS(k) {
  return lapped(sAt(k));
}

export { pointAt };
