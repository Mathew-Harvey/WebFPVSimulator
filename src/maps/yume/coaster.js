/*
 * coaster.js: Ryusei, the roller coaster of Yumeboshi Land. Pure: no
 * Three.js, no clock of its own and no JS trigonometry, so the track, its
 * solids and where the train is at any step load in Node
 * (scripts/yume-check.js) exactly as they do in the browser.
 *
 * THE TRACK is laid as a turtle lays a line: a list of pieces, each a
 * length over which the heading and the pitch turn by a set amount, and
 * the bank eases to a set angle. A vertical loop is a piece whose pitch
 * turns a whole turn while the line steps sideways by LOOP_SHIFT, so the
 * way out runs beside the way in, as a real loop's does. The line is the
 * rail's middle; the train rides on the side the track's up points to,
 * which inside the loop is the loop's middle.
 *
 * Every number is reached with + - * / and Math.sqrt, which JavaScript
 * gives to the bit, and src/props/trig.js's sincos, which is written to
 * give the same bits everywhere (CLAUDE.md, determinism). The track's
 * solids go to the physics, and so does the train: its cars are seated as
 * movers every step from trainAt(step), which reads a table of times this
 * file works out once.
 *
 * THE RIDE. The train waits in the station, rolls out on the tyres, is
 * pulled up the lift at LIFT_V, and from the crest runs on what it has:
 * its speed at every point is the speed the drop gives it less a steady
 * loss to the wheels and the air (FRICTION), the way a real coaster
 * runs out of energy toward the end. The brakes take it down to TRIM and
 * the station's tyres stop it at the platform. A lap is LAP_MS, an exact
 * count of steps, so the train is where it is as a function of the step
 * count and nothing else.
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

import { sincos } from '../../props/trig.js';

const DEG = Math.PI / 180;

/* Where the line starts, plan metres (px east, py north, h up over the
 * ground), and the way it heads: north up the station. */
export const START = { px: 124, py: 70, h: 1.4, yaw: 90 };

/* The track's cross section, metres from the line: the running rails
 * either side, and the spine under them, the round steel box a modern
 * track hangs its rails from. */
export const GAUGE = 0.55;
export const RAIL_R = 0.075;
export const SPINE_DOWN = 0.5;
export const SPINE_R = 0.26;

/* How far a loop's way out runs beside its way in. */
export const LOOP_SHIFT = 3.6;

/* The train: five cars, two rows of two each, nose to tail CAR_PITCH. */
export const CARS = 5;
export const CAR_PITCH = 2.5;
export const CAR = { len: 2.2, wide: 1.5, floor: 0.3, top: 1.25 };

/*
 * THE PIECES, in order from the station's south end: [length m, yaw turn
 * deg (left positive), pitch turn deg (up positive), bank at its end deg
 * (left wing down positive), sideways step m, name]. The heading and pitch
 * turn evenly along a piece; the bank eases in over it.
 */
export const PIECES = [
  [36, 0, 0, 0, 0, 'station'],
  [12, 0, 32, 0, 0, 'lift foot'],
  [56, 0, 0, 0, 0, 'lift'],
  [12, 0, -32, 0, 0, 'crest'],
  [5, 0, 0, 0, 0, 'top'],
  [13, 0, -56, 0, 0, 'drop lip'],
  [22, 0, 0, 0, 0, 'drop'],
  [24, 0, 56, 0, 0, 'pull out'],
  [8, 0, 0, 0, 0, 'skim'],
  [33, 90, 0, 58, 0, 'lake turn'],
  [9, 0, 0, 0, 0, 'loop run in'],
  [2 * Math.PI * 11.5, 0, 360, 0, -LOOP_SHIFT, 'loop'],
  [6, 0, 0, 0, 0, 'loop run out'],
  [12, 0, 28, 0, 0, 'hill up'],
  [7, 0, 0, 0, 0, 'hill climb'],
  [18, 0, -56, 0, 0, 'airtime'],
  [7, 0, 0, 0, 0, 'hill fall'],
  [12, 0, 28, 0, 0, 'hill out'],
  [27, 90, 0, 62, 0, 'west turn'],
  [10, 0, 0, 0, 0, 'west run'],
  [12, 0, 24, 0, 0, 'camel up'],
  [6, 0, 0, 0, 0, 'camel climb'],
  [17, 0, -48, 0, 0, 'camelback'],
  [6, 0, 0, 0, 0, 'camel fall'],
  [12, 0, 24, 0, 0, 'camel out'],
  [15, 30, 0, 40, 0, 'snake in'],
  [30, -60, 0, -50, 0, 'snake'],
  [15, 30, 0, 0, 0, 'snake out'],
  [34, 0, 0, 0, 0, 'tunnel'],
  [10, 0, 14, 0, 0, 'bunny up'],
  [12, 0, -28, 0, 0, 'bunny hop'],
  [10, 0, 14, 0, 0, 'bunny out'],
  [1.8, 0, 0, 0, 0, 'helix run in'],
  [8, 0, 6, 0, 0, 'helix climb in'],
  [2 * Math.PI * 14 * 1.25, 450, 0, 55, 0, 'helix'],
  [8, 0, -6, 0, 0, 'helix climb out'],
  [10, 0, 0, 0, 0, 'helix run out'],
  [10, 0, -24, 0, 0, 'step down'],
  [23.31, 0, 0, 0, 0, 'step'],
  [10, 0, 24, 0, 0, 'step out'],
  [14.18, 0, 0, 0, 0, 'home run'],
  [30, 90, 0, 45, 0, 'home turn'],
  [18, 0, 0, 0, 0, 'brakes'],
];

/* The longest a sample is, m. */
const STEP = 0.5;

const SC = { s: 0, c: 1 };
const SC2 = { s: 0, c: 1 };

/* An ease from 0 to 1, smoothstep. */
const ease = (t) => t * t * (3 - 2 * t);

/*
 * THE LINE, sampled: { n, s[], p[] (px, py, h triples), t[] (unit
 * tangent), u[] (the track's up), l[] (its left), bank[], piece[] }, and
 * the line's length. Built once.
 */
let LINE = null;
export function coasterLine() {
  if (LINE) {
    return LINE;
  }
  const s = [0];
  const p = [START.px, START.py, START.h];
  const tan = [];
  const up = [];
  const left = [];
  const bank = [];
  const piece = [];
  let yaw = START.yaw * DEG;
  let pitch = 0;
  let b = 0;
  let x = START.px;
  let y = START.py;
  let h = START.h;
  let at = 0;
  /* The frame at a sample: tangent from yaw and pitch, the pitch's up, the
   * flat left, then the bank turning up and left about the tangent. */
  const frame = (yw, pt, bk, pc) => {
    sincos(yw, SC);
    sincos(pt, SC2);
    const cy = SC.c;
    const sy = SC.s;
    const cp = SC2.c;
    const sp = SC2.s;
    const tx = cp * cy;
    const ty = cp * sy;
    const tz = sp;
    const ux0 = -sp * cy;
    const uy0 = -sp * sy;
    const uz0 = cp;
    const lx0 = -sy;
    const ly0 = cy;
    sincos(bk, SC);
    const cb = SC.c;
    const sb = SC.s;
    tan.push(tx, ty, tz);
    /* Banked left (positive) the up leans to the left: the inside of a
     * left hand turn. */
    up.push(cb * ux0 + sb * lx0, cb * uy0 + sb * ly0, cb * uz0);
    left.push(cb * lx0 - sb * ux0, cb * ly0 - sb * uy0, -sb * uz0);
    bank.push(bk);
    piece.push(pc);
  };
  frame(yaw, pitch, b, 0);
  PIECES.forEach(([len, dyaw, dpitch, bankEnd, shift, name], k) => {
    const n = Math.max(1, Math.ceil(len / STEP));
    const ds = len / n;
    const y0 = yaw;
    const p0 = pitch;
    const b0 = b;
    const dy = dyaw * DEG;
    const dp = dpitch * DEG;
    const bk = bankEnd * DEG;
    /* A sideways step is across the heading the piece starts on, flat. */
    sincos(y0, SC);
    const sx = -SC.s * (shift / n);
    const sy = SC.c * (shift / n);
    for (let i = 0; i < n; i += 1) {
      /* The direction at the middle of this sample, so a turn's chord is
       * the arc's. */
      const mid = (i + 0.5) / n;
      sincos(y0 + dy * mid, SC);
      sincos(p0 + dp * mid, SC2);
      x += SC2.c * SC.c * ds + sx;
      y += SC2.c * SC.s * ds + sy;
      h += SC2.s * ds;
      at += ds;
      const f = (i + 1) / n;
      yaw = y0 + dy * f;
      pitch = p0 + dp * f;
      /* A turn's bank eases in over its first half and out over the next
       * straight's; a piece that does not turn eases back to level. */
      b = b0 + (bk - b0) * ease(dy !== 0 ? Math.min(1, f * 2) : f);
      s.push(at);
      p.push(x, y, h);
      frame(yaw, pitch, b, k);
    }
    if (name === 'loop') {
      pitch = 0;
    }
  });
  /* The pieces close the lap to a few millimetres; what is left is
   * spread along the line, so the last sample is the first. */
  const last = s.length - 1;
  const ex = p[3 * last] - START.px;
  const ey = p[3 * last + 1] - START.py;
  const ez = p[3 * last + 2] - START.h;
  for (let i = 1; i <= last; i += 1) {
    const f = s[i] / at;
    p[3 * i] -= ex * f;
    p[3 * i + 1] -= ey * f;
    p[3 * i + 2] -= ez * f;
  }
  LINE = {
    n: s.length, s, p, t: tan, u: up, l: left, bank, piece, length: at, closure: Math.sqrt(ex * ex + ey * ey + ez * ez),
  };
  return LINE;
}

/* Which piece is named what, by index. */
export function pieceIndex(name) {
  return PIECES.findIndex((q) => q[5] === name);
}

/* The arc length where the named piece starts and ends. */
export function pieceSpan(name) {
  const L = coasterLine();
  const k = pieceIndex(name);
  let a = -1;
  let b = -1;
  for (let i = 1; i < L.n; i += 1) {
    if (L.piece[i] === k) {
      if (a < 0) {
        a = L.s[i - 1];
      }
      b = L.s[i];
    }
  }
  return [a, b];
}

/* The sample at or before arc length a (wrapped onto the lap), and how far
 * on toward the next one: { i, f }. Halving, a dozen comparisons. */
const AT = { i: 0, f: 0 };
export function sampleAt(a, out = AT) {
  const L = coasterLine();
  let x = a % L.length;
  if (x < 0) {
    x += L.length;
  }
  let lo = 0;
  let hi = L.n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (L.s[mid] <= x) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  out.i = lo;
  out.f = (x - L.s[lo]) / (L.s[hi] - L.s[lo]);
  return out;
}

/* A point on the line, or a frame vector, between two samples: v is one
 * of the line's arrays. Into out[o..o+2]. */
export function lerp3(v, i, f, out, o = 0) {
  const a = 3 * i;
  const b = a + 3;
  out[o] = v[a] + (v[b] - v[a]) * f;
  out[o + 1] = v[a + 1] + (v[b + 1] - v[a + 1]) * f;
  out[o + 2] = v[a + 2] + (v[b + 2] - v[a + 2]) * f;
  return out;
}

/*
 * THE RIDE'S NUMBERS.
 *
 *   G          gravity, m/s/s
 *   LIFT_V     the chain's speed up the lift, m/s
 *   ROLL_A     the station tyres' push out and their stop, m/s/s
 *   FRICTION   the steady loss to the wheels and the air: the squared
 *              speed falls by twice this every metre, m/s/s
 *   BRAKE_A    the magnetic brakes, m/s/s, down to TRIM
 *   STOP_AT    where the train's middle stops in the station, m
 *   DWELL_MS   how long it waits there, so a lap is a whole count of steps
 */
export const G = 9.81;
export const LIFT_V = 3.6;
const ROLL_A = 0.9;
const FRICTION = 0.25;
const BRAKE_A = 5;
const TRIM = 2;
export const STOP_AT = 18;
const DWELL_MS = 14000;
const V_MIN = 0.3;

/* The speed at the train's middle at arc length a, s0 the lap's start. */
function speedAt(L, i, crestS, crestH, brakeEnd) {
  const a = L.s[i];
  const h = L.p[3 * i + 2];
  if (a < STOP_AT) {
    /* Still rolling in from the last lap: handled at the lap's end. */
    return V_MIN;
  }
  if (a <= crestS) {
    const push = Math.sqrt(0.25 + 2 * ROLL_A * (a - STOP_AT));
    return push < LIFT_V ? push : LIFT_V;
  }
  const e = LIFT_V * LIFT_V + 2 * G * (crestH - h) - 2 * FRICTION * (a - crestS);
  let v = e > V_MIN * V_MIN ? Math.sqrt(e) : V_MIN;
  /* The brakes, then the station's tyres to a stop STOP_AT into the next
   * lap. */
  const toEnd = brakeEnd - a;
  const vb = Math.sqrt(TRIM * TRIM + 2 * BRAKE_A * (toEnd > 0 ? toEnd : 0));
  if (vb < v) {
    v = vb;
  }
  if (a >= brakeEnd) {
    const toStop = L.length + STOP_AT - a;
    const vs = Math.sqrt(2 * ROLL_A * 0.25 * toStop);
    v = vs < TRIM ? vs : TRIM;
  }
  return v > V_MIN ? v : V_MIN;
}

/*
 * THE TIMETABLE: the time the train's middle passes every sample, from
 * the moment it leaves STOP_AT, and the speed there. The middle runs from
 * STOP_AT round the lap to STOP_AT again; the samples before STOP_AT are
 * passed at the end of the lap, so their times are counted on from the
 * last sample's. LAP_MS is the run plus the dwell, rounded up to a step.
 */
let TABLE = null;
export function timetable() {
  if (TABLE) {
    return TABLE;
  }
  const L = coasterLine();
  const [, crestS] = pieceSpan('crest');
  const crestH = L.p[3 * L.s.findIndex((v) => v >= crestS) + 2];
  const [, brakeEnd] = pieceSpan('brakes');
  const n = L.n;
  const v = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    v[i] = speedAt(L, i, crestS, crestH, brakeEnd);
  }
  /* The stop: the samples from the lap's start to STOP_AT are the roll in,
   * the station tyres bringing the train to rest. */
  for (let i = 0; i < n && L.s[i] <= STOP_AT; i += 1) {
    const toStop = STOP_AT - L.s[i];
    const vs = Math.sqrt(2 * ROLL_A * 0.25 * toStop);
    v[i] = vs < TRIM ? (vs > V_MIN ? vs : V_MIN) : TRIM;
  }
  /* Time along the lap, starting where the middle leaves STOP_AT. */
  let i0 = 0;
  while (L.s[i0] < STOP_AT) {
    i0 += 1;
  }
  const order = [];
  for (let k = i0; k < n - 1; k += 1) {
    order.push(k);
  }
  for (let k = 0; k <= i0; k += 1) {
    order.push(k);
  }
  /* order[j] is the sample the middle passes j-th; t[j] its time, and its
   * arc length unwrapped so it only grows. */
  const t = new Float64Array(order.length);
  const at = new Float64Array(order.length);
  let prevS = L.s[order[0]];
  at[0] = prevS;
  for (let j = 1; j < order.length; j += 1) {
    let sj = L.s[order[j]];
    if (sj < prevS) {
      sj += L.length;
    }
    const ds = sj - prevS;
    const vm = 0.5 * (v[order[j - 1]] + v[order[j]]);
    t[j] = t[j - 1] + ds / vm;
    at[j] = sj;
    prevS = sj;
  }
  const runMs = Math.ceil(t[order.length - 1] * 1000);
  TABLE = {
    t, at, v, order, runMs, dwellMs: DWELL_MS, lapMs: runMs + DWELL_MS, start: STOP_AT,
  };
  return TABLE;
}

/*
 * Where the train's middle is at `step` of the lap clock: { s, v, moving },
 * s its arc length on the lap and v its speed. The train leaves the
 * station DWELL_MS after the clock starts, and every LAP_MS after that.
 */
const TRAIN = { s: STOP_AT, v: 0, moving: false };
export function trainAt(step, out = TRAIN) {
  const T = timetable();
  const L = coasterLine();
  let k = step % T.lapMs;
  if (k < 0) {
    k += T.lapMs;
  }
  if (k < T.dwellMs) {
    out.s = STOP_AT;
    out.v = 0;
    out.moving = false;
    return out;
  }
  const tm = (k - T.dwellMs) / 1000;
  if (tm >= T.t[T.t.length - 1]) {
    out.s = STOP_AT;
    out.v = 0;
    out.moving = false;
    return out;
  }
  let lo = 0;
  let hi = T.t.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (T.t[mid] <= tm) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const f = (tm - T.t[lo]) / (T.t[hi] - T.t[lo]);
  let a = T.at[lo] + (T.at[hi] - T.at[lo]) * f;
  if (a >= L.length) {
    a -= L.length;
  }
  out.s = a;
  out.v = T.v[T.order[lo]] + (T.v[T.order[hi]] - T.v[T.order[lo]]) * f;
  out.moving = true;
  return out;
}

/*
 * THE SUPPORTS: { px, py, top, r } columns from the ground to the spine's
 * underside, every SUPPORT_EVERY metres where the track is near upright
 * and high enough to need one, and the loop's two legs. A column is left
 * out where it would come within COLUMN_CLEAR of another stretch of the
 * track below its top, so no column stands in the train's way or in the
 * line a pilot flies along it.
 */
const SUPPORT_EVERY = 7;
const COLUMN_CLEAR = 3.0;
const OUTRIGGER = 3.6;
let SUPPORTS = null;
export function supports() {
  if (SUPPORTS) {
    return SUPPORTS;
  }
  const L = coasterLine();
  const out = [];
  const loopK = pieceIndex('loop');
  const stationK = pieceIndex('station');
  const tunnelK = pieceIndex('tunnel');
  const clearOf = (i, px, py, top) => {
    for (let j = 0; j < L.n; j += 1) {
      const d = Math.abs(L.s[j] - L.s[i]);
      if ((d < L.length - d ? d : L.length - d) < 4) {
        continue;
      }
      const dx = L.p[3 * j] - px;
      const dy = L.p[3 * j + 1] - py;
      if (dx * dx + dy * dy < COLUMN_CLEAR * COLUMN_CLEAR && L.p[3 * j + 2] - 1.6 < top) {
        return false;
      }
    }
    return true;
  };
  let next = 3;
  for (let i = 0; i < L.n; i += 1) {
    const k = L.piece[i];
    if (L.s[i] < next || k === loopK || k === stationK || k === tunnelK) {
      continue;
    }
    if (L.u[3 * i + 2] < 0.45) {
      continue;
    }
    /* The spine's underside, straight under the line's sample. */
    const sx = L.p[3 * i] - L.u[3 * i] * SPINE_DOWN;
    const sy = L.p[3 * i + 1] - L.u[3 * i + 1] * SPINE_DOWN;
    const top = L.p[3 * i + 2] - L.u[3 * i + 2] * SPINE_DOWN - SPINE_R * 0.6;
    if (top < 0.3) {
      continue;
    }
    /* Straight under it if that is clear; else on an outrigger, an arm
     * out to a column beside the track, outside a turn first. */
    const fl = Math.sqrt(L.l[3 * i] * L.l[3 * i] + L.l[3 * i + 1] * L.l[3 * i + 1]) || 1;
    const ox = L.l[3 * i] / fl;
    const oy = L.l[3 * i + 1] / fl;
    const out1 = L.bank[i] > 0 ? -1 : 1;
    let placed = false;
    for (const off of [0, OUTRIGGER * out1, -OUTRIGGER * out1]) {
      const px = sx + ox * off;
      const py = sy + oy * off;
      if (clearOf(i, px, py, top)) {
        out.push({ px, py, top, r: 0.2 + top * 0.006, s: L.s[i], arm: off === 0 ? null : [sx, sy, top] });
        placed = true;
        break;
      }
    }
    if (placed) {
      next = L.s[i] + SUPPORT_EVERY;
    }
  }
  /* The loop's legs, at its two sides, where the line climbs and falls
   * straight up and down: a column outside the spine. */
  let up = -1;
  let down = -1;
  for (let i = 0; i < L.n; i += 1) {
    if (L.piece[i] !== loopK) {
      continue;
    }
    if (up < 0 || L.t[3 * i + 2] > L.t[3 * up + 2]) {
      up = i;
    }
    if (down < 0 || L.t[3 * i + 2] < L.t[3 * down + 2]) {
      down = i;
    }
  }
  for (const i of [up, down]) {
    const px = L.p[3 * i] - L.u[3 * i] * (SPINE_DOWN + SPINE_R);
    const py = L.p[3 * i + 1] - L.u[3 * i + 1] * (SPINE_DOWN + SPINE_R);
    out.push({ px, py, top: L.p[3 * i + 2], r: 0.36, s: L.s[i], leg: true });
  }
  SUPPORTS = out;
  return out;
}

/*
 * THE TRACK'S SOLIDS, into the land's builder T (./frame.js): the two
 * rails and the spine as capsules every SOLID_EVERY samples, and the
 * columns. Solid and not drawn: ./track.js draws the track as smooth
 * tubes, and a capsule chain this fine is within a few centimetres of
 * them on the tightest bend.
 */
const SOLID_EVERY = 4;
export function coasterParts(T) {
  const L = coasterLine();
  const pt = (i, side, down) => [
    L.p[3 * i] + L.l[3 * i] * side - L.u[3 * i] * down,
    L.p[3 * i + 1] + L.l[3 * i + 1] * side - L.u[3 * i + 1] * down,
    L.p[3 * i + 2] + L.l[3 * i + 2] * side - L.u[3 * i + 2] * down,
  ];
  for (let i = 0; i + 1 < L.n; i += SOLID_EVERY) {
    const j = Math.min(L.n - 1, i + SOLID_EVERY);
    const o = { draw: false, kind: 'pole', name: 'coaster rail' };
    T.cap('ymSteel', pt(i, GAUGE, 0), pt(j, GAUGE, 0), RAIL_R + 0.03, o);
    T.cap('ymSteel', pt(i, -GAUGE, 0), pt(j, -GAUGE, 0), RAIL_R + 0.03, o);
    T.cap('ymSteel', pt(i, 0, SPINE_DOWN), pt(j, 0, SPINE_DOWN), SPINE_R, { draw: false, kind: 'pole', name: 'coaster spine' });
  }
  for (const c of supports()) {
    T.cap('ymCoasterLeg', [c.px, c.py, 0], [c.px, c.py, c.top], c.r, { draw: false, kind: 'pole', name: 'coaster column' });
    if (c.arm) {
      T.cap('ymCoasterLeg', [c.px, c.py, c.top], c.arm, c.r * 0.8, { draw: false, kind: 'pole', name: 'coaster outrigger' });
    }
  }
}

/*
 * THE TRAIN'S SOLIDS at a step: two boxes a car, each BOX_HALF either way,
 * along the car's middle at its floor and seats, in plan metres, with the
 * car's velocity. Into `out` as [px, py, h, vx, vy, vh] six doubles a box;
 * returns the count. Allocates nothing.
 */
export const BOX_HALF = 0.7;
const BOX_ALONG = 0.55;
const BOX_UP = 0.78;
const SA = { i: 0, f: 0 };
const PV = new Float64Array(3);
const TV = new Float64Array(3);
const UV = new Float64Array(3);
export function trainBoxes(step, out) {
  const L = coasterLine();
  const tr = trainAt(step);
  let n = 0;
  for (let k = 0; k < CARS; k += 1) {
    const a = tr.s + (k - (CARS - 1) / 2) * CAR_PITCH;
    sampleAt(a, SA);
    lerp3(L.p, SA.i, SA.f, PV);
    lerp3(L.t, SA.i, SA.f, TV);
    lerp3(L.u, SA.i, SA.f, UV);
    for (const side of [-1, 1]) {
      const o = n * 6;
      out[o] = PV[0] + TV[0] * BOX_ALONG * side + UV[0] * BOX_UP;
      out[o + 1] = PV[1] + TV[1] * BOX_ALONG * side + UV[1] * BOX_UP;
      out[o + 2] = PV[2] + TV[2] * BOX_ALONG * side + UV[2] * BOX_UP;
      out[o + 3] = TV[0] * tr.v;
      out[o + 4] = TV[1] * tr.v;
      out[o + 5] = TV[2] * tr.v;
      n += 1;
    }
  }
  return n;
}
