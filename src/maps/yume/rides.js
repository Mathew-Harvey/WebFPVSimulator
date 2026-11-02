/*
 * rides.js: the rides of Yumeboshi Land that move, worked out from the step
 * count. Pure: no Three.js and no JS trigonometry (src/props/trig.js's
 * sincos instead), so where a gondola or a horse is at a step is the same
 * bits in Node, in every browser and in a replay.
 *
 * WHAT MOVES: the big wheel's gondolas, spokes and pins; the carousel's
 * horses and their poles; the drop tower's ring of seats; the teacups on
 * their turntables; the swing ride's chairs and chains; the swinging
 * ship and its arms; and Ryusei's train (./coaster.js). Everything that
 * stands still about them (the wheel's rims, legs and hub, the carousel's
 * deck and canopy, the tower, the ship's frames) is an ordinary part,
 * solid in the map's parts like any wall. A wheel's rim and a carousel's
 * deck are round, so the same solid is right at every angle they turn to.
 *
 * HOW A MOVING THING IS SOLID. The module (src/native/world.c) holds
 * axis aligned boxes that the shell seats every step (setMover in
 * src/game/plantworld.js), which is how the town's train and a windmill's
 * sails are solid (src/props/windmill.js has the long account). So every
 * step `seat` takes what moves near the craft and seats boxes for it,
 * into the top RIDE_SLOTS mover slots:
 *
 *   a cube    a gondola, a cup, a horse's body, a car of the train, a
 *             chair, a ship's hull: one box round it, axis aligned. The
 *             gondolas, the cups, the tower's seats and the chairs hang or
 *             stand upright, so their box is their shape; a horse, a car
 *             and the hull are held in boxes of BOX_HALF or so along their
 *             middles, a little fuller than the drawn shape where it is
 *             turned.
 *   a rod     a spoke, a pole, a chain, a pin, an arm: a thin line that is
 *             not along an axis. Only the stretch of it near the craft is
 *             seated, as short pieces no longer than PIECE, so a box is
 *             within a few centimetres of the drawn rod however it lies.
 *
 * A thing is seated only while the craft is within WINDOW of it, and the
 * five inch reaches 0.23 m from its middle, so what is left out cannot be
 * touched in the next step even at the craft's top speed. A ride whose
 * bounds the craft is not near costs one distance test a step.
 *
 * THE PROGRAMMES. The wheel and the carousel turn all day. The tower
 * lifts, holds, drops and lowers; the swing ride spins up, flies and
 * spins down; the ship swings up to its peak and back; the teacups turn
 * on their turntables. Each is a closed form of the step count, its cycle
 * a whole number of steps, so a ride is where it is at a step and nowhere
 * else, and the drawing reads the very same numbers (./drawrides.js).
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
import { W, D } from './frame.js';
import {
  coasterLine, trainBoxes, trainAt, sampleAt, BOX_HALF as CAR_HALF, CARS, CAR_PITCH,
} from './coaster.js';

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;
const SC = { s: 0, c: 1 };
const SC2 = { s: 0, c: 1 };

/* Plan to world, the built map's (../built/place.js docToWorld). */
const wx = (px) => px - W / 2;
const wz = (py) => D / 2 - py;

/* The mover slots the rides take, from the top of the module's 64 down,
 * where a built map's traffic never reaches (../built/traffic.js caps its
 * cars below them), and how a box is written: centre, half extents and
 * velocity, world metres, which is setMover's order. */
export const RIDE_SLOTS = 32;
export const BOX_DOUBLES = 9;
export const WINDOW = 0.6;
export const PIECE = 0.3;

/* A phase of a cycle: the step's place in it as a fraction, exactly. */
const phase = (step, period) => {
  let k = step % period;
  if (k < 0) {
    k += period;
  }
  return k / period;
};

/* ------------------------------------------------------------------ *
 * THE BIG WHEEL (観覧車): a wheel in the plane across the axle, which runs
 * north and south, so the pilot sees its face from the hub. Two rims
 * RIM_GAP apart, GONDOLAS hanging between them from pins, SPOKES on each
 * rim. One turn in PERIOD steps, anticlockwise as you face it from the
 * south.
 * ------------------------------------------------------------------ */
export const WHEEL = Object.freeze({
  px: 296, py: 206, hub: 30, R: 23.5, rim: 1.8, gondolas: 18, spokes: 16, period: 240000,
  cab: { hx: 1.05, hz: 0.95, below: 0.4, tall: 2.35 },
  legs: 4.6, legSpread: 13,
});

export function wheelAngle(step) {
  return TAU * phase(step, WHEEL.period);
}

/* A gondola's pin at `step`: [x, y, z] world, and its velocity. */
export function wheelPin(step, i, out) {
  const a = wheelAngle(step) + (TAU * i) / WHEEL.gondolas;
  sincos(a, SC);
  const w = TAU / (WHEEL.period / 1000);
  out[0] = wx(WHEEL.px) + WHEEL.R * SC.c;
  out[1] = WHEEL.hub + WHEEL.R * SC.s;
  out[2] = wz(WHEEL.py);
  out[3] = -w * WHEEL.R * SC.s;
  out[4] = w * WHEEL.R * SC.c;
  out[5] = 0;
  return out;
}

/* ------------------------------------------------------------------ *
 * THE CAROUSEL (メリーゴーランド): a deck turning under a still canopy,
 * horses on poles in three rings, each rising and falling twice a turn.
 * ------------------------------------------------------------------ */
export const CAROUSEL = Object.freeze({
  px: 180, py: 112, R: 8.6, deck: 0.7, canopy: 5.6, post: 1.5, period: 20000,
  rings: Object.freeze([[3.6, 8], [5.3, 12], [7.0, 16]]),
  horse: { half: 0.36, along: 0.38, ride: 1.25, bob: 0.32 },
});

export function carouselAngle(step) {
  return TAU * phase(step, CAROUSEL.period);
}

/* Every horse as { r, a0, k }: its ring's radius, its place round, and
 * where its bob starts. */
export const HORSES = (() => {
  const out = [];
  CAROUSEL.rings.forEach(([r, n], ring) => {
    for (let i = 0; i < n; i += 1) {
      const a0 = (TAU * (i + 0.5 * (ring % 2))) / n;
      sincos(a0, SC);
      out.push({ r, a0, k: (i + ring) % 2, c0: SC.c, s0: SC.s });
    }
  });
  return Object.freeze(out);
})();

/* A horse at `step`: [x, y, z, heading cos, heading sin] of its middle
 * and its bob, into out. The heading is the way it rides, tangent to its
 * ring: the deck turns anticlockwise seen from above. */
export function horseAt(step, h, out) {
  const turn = carouselAngle(step);
  sincos(turn + h.a0, SC);
  /* Up and down twice a turn, each horse half a beat from the next. */
  sincos(2 * turn + h.k * Math.PI, SC2);
  out[0] = wx(CAROUSEL.px) + h.r * SC.c;
  out[1] = CAROUSEL.deck + CAROUSEL.horse.ride + CAROUSEL.horse.bob * SC2.s;
  out[2] = wz(CAROUSEL.py) - h.r * SC.s;
  /* Tangent, anticlockwise from above in the plan, which in the world
   * (z = -py) is (-sin, -cos). */
  out[3] = -SC.s;
  out[4] = -SC.c;
  out[5] = 2 * (TAU / (CAROUSEL.period / 1000)) * CAROUSEL.horse.bob * SC2.c;
  return out;
}

/* ------------------------------------------------------------------ *
 * THE DROP TOWER (フリーフォール): a ring of seats round a square tower,
 * lifted slowly, held, dropped, braked hard and let down. Its height and
 * speed at a step, closed form.
 * ------------------------------------------------------------------ */
export const TOWER = Object.freeze({
  px: 304, py: 96, half: 1.7, H: 64, low: 1.1, top: 56, ring: { out: 1.45, hy: 0.85 },
  wait: 12000, lift: 28000, hold: 4000, fall: 2600, brake: 4 * 9.81, down: 1.6,
});

const TOWER_V = 9.81 * (TOWER.fall / 1000);
const TOWER_FALL = 0.5 * 9.81 * (TOWER.fall / 1000) * (TOWER.fall / 1000);
const TOWER_BRAKE_S = TOWER_V / TOWER.brake;
const TOWER_BRAKE_D = (TOWER_V * TOWER_V) / (2 * TOWER.brake);
const TOWER_STOP = TOWER.top - TOWER_FALL - TOWER_BRAKE_D;
const TOWER_DOWN_S = (TOWER_STOP - TOWER.low) / TOWER.down;
export const TOWER_CYCLE = TOWER.wait + TOWER.lift + TOWER.hold + TOWER.fall
  + Math.ceil(TOWER_BRAKE_S * 1000) + Math.ceil(TOWER_DOWN_S * 1000);

/* The seats' height and vertical speed at `step`: [y, vy]. */
export function towerAt(step, out) {
  let t = step % TOWER_CYCLE;
  if (t < 0) {
    t += TOWER_CYCLE;
  }
  const T = TOWER;
  if (t < T.wait) {
    out[0] = T.low;
    out[1] = 0;
    return out;
  }
  t -= T.wait;
  if (t < T.lift) {
    /* Eased up and eased to a stop at the top. */
    const f = t / T.lift;
    const e = f * f * (3 - 2 * f);
    out[0] = T.low + (T.top - T.low) * e;
    out[1] = ((T.top - T.low) * 6 * f * (1 - f)) / (T.lift / 1000);
    return out;
  }
  t -= T.lift;
  if (t < T.hold) {
    out[0] = T.top;
    out[1] = 0;
    return out;
  }
  t -= T.hold;
  if (t < T.fall) {
    const s = t / 1000;
    out[0] = T.top - 0.5 * 9.81 * s * s;
    out[1] = -9.81 * s;
    return out;
  }
  t -= T.fall;
  const brakeMs = Math.ceil(TOWER_BRAKE_S * 1000);
  if (t < brakeMs) {
    const s = t / 1000 < TOWER_BRAKE_S ? t / 1000 : TOWER_BRAKE_S;
    out[0] = T.top - TOWER_FALL - TOWER_V * s + 0.5 * T.brake * s * s;
    out[1] = -TOWER_V + T.brake * s;
    return out;
  }
  t -= brakeMs;
  const s = t / 1000;
  const y = TOWER_STOP - T.down * s;
  out[0] = y > T.low ? y : T.low;
  out[1] = y > T.low ? -T.down : 0;
  return out;
}

/* ------------------------------------------------------------------ *
 * THE TEACUPS (コーヒーカップ): a turntable turning slowly one way, three
 * small turntables on it turning faster the other, three cups on each.
 * A cup is round, so one box holds it whichever way it spins.
 * ------------------------------------------------------------------ */
export const TEACUPS = Object.freeze({
  px: 252, py: 60, R: 11.4, deck: 0.45, period: 26000, sub: 6.0, subPeriod: 7000, cupR: 2.3,
  cup: { half: 0.95, tall: 1.25 }, roof: 6.4, posts: 8, postR: 13.2,
});

export function cupAt(step, i, out) {
  const T = TEACUPS;
  const big = TAU * phase(step, T.period);
  const small = -TAU * phase(step, T.subPeriod);
  const j = (i / 3) | 0;
  const k = i % 3;
  sincos(big + (TAU * j) / 3, SC);
  const cx = T.sub * SC.c;
  const cz = -T.sub * SC.s;
  sincos(small + (TAU * k) / 3 + j, SC2);
  const ox = T.cupR * SC2.c;
  const oz = -T.cupR * SC2.s;
  const w1 = TAU / (T.period / 1000);
  const w2 = -TAU / (T.subPeriod / 1000);
  out[0] = wx(T.px) + cx + ox;
  out[1] = T.deck;
  out[2] = wz(T.py) + cz + oz;
  /* Velocity: each turn's own about the vertical, (w x r) with y up is
   * (w r_z, 0, -w r_x). */
  out[3] = w1 * (cz + oz) + w2 * oz;
  out[4] = 0;
  out[5] = -w1 * (cx + ox) - w2 * ox;
  return out;
}

/* ------------------------------------------------------------------ *
 * THE SWING RIDE (空中ブランコ): chairs on chains from a canopy that spins
 * up, flies the chairs out and spins down. The chairs' lean is the lean a
 * chain takes when the canopy spins at its speed, eased in with it.
 * ------------------------------------------------------------------ */
export const SWINGS = Object.freeze({
  px: 256, py: 146, mast: 11.4, hang: 9.6, top: 5.2, chain: 8.4, chairs: 20,
  still: 10000, up: 6000, fly: 20000, down: 6000, turnMs: 5200, lean: 44,
  chair: { half: 0.42, tall: 0.6 },
});
export const SWING_CYCLE = SWINGS.still + SWINGS.up + SWINGS.fly + SWINGS.down;

/* The canopy's angle and the share of full speed at `step`. Speed eases
 * linearly up and down, so the angle is its integral, closed form. */
function swingState(step, out) {
  let t = step % SWING_CYCLE;
  if (t < 0) {
    t += SWING_CYCLE;
  }
  const S = SWINGS;
  const w = TAU / S.turnMs;
  let a = 0;
  let f = 0;
  if (t < S.still) {
    a = 0;
    f = 0;
  } else if (t < S.still + S.up) {
    const u = t - S.still;
    f = u / S.up;
    a = (w * u * u) / (2 * S.up);
  } else if (t < S.still + S.up + S.fly) {
    const u = t - S.still - S.up;
    f = 1;
    a = (w * S.up) / 2 + w * u;
  } else {
    const u = t - S.still - S.up - S.fly;
    f = 1 - u / S.down;
    a = (w * S.up) / 2 + w * S.fly + w * (u - (u * u) / (2 * S.down));
  }
  /* The angle as a turn's fraction, wrapped, so sincos gets a small one. */
  const turns = a / TAU;
  out[0] = TAU * (turns - Math.floor(turns));
  out[1] = f;
  return out;
}

/* A chair at `step`: [x, y, z of the chair, x, y, z of its chain's top,
 * vx, vz]. */
const SW = [0, 0];
export function chairAt(step, i, out) {
  const S = SWINGS;
  swingState(step, SW);
  sincos(SW[0] + (TAU * i) / S.chairs, SC);
  sincos(S.lean * DEG * SW[1] * SW[1], SC2);
  const r = S.top + S.chain * SC2.s;
  const cx = wx(S.px);
  const cz = wz(S.py);
  out[0] = cx + r * SC.c;
  out[1] = S.hang - S.chain * SC2.c;
  out[2] = cz - r * SC.s;
  out[3] = cx + S.top * SC.c;
  out[4] = S.hang;
  out[5] = cz - S.top * SC.s;
  const w = (TAU / (S.turnMs / 1000)) * SW[1];
  out[6] = -w * r * SC.s;
  out[7] = -w * r * SC.c;
  return out;
}

/* ------------------------------------------------------------------ *
 * THE SWINGING SHIP (バイキング): a galleon on two arms from an axle
 * between two A frames, the axle running north and south, so it swings
 * east and west. It swings up to PEAK and back down over a cycle.
 * ------------------------------------------------------------------ */
export const SHIP = Object.freeze({
  px: 72, py: 186, axle: 15.5, arm: 11.2, half: 7.4, beam: 1.9, period: 7600, cycle: 48000, peak: 68,
  frame: 5.2, foot: 9.5, hull: [-6.2, -3.1, 0, 3.1, 6.2], hullHalf: 1.35, hullUp: 0.6,
});

/* The swing's angle and its rate at `step`: [angle, rate] in radians and
 * radians a second. The amplitude rises over the first two fifths of the
 * cycle, holds a fifth and falls over the next two fifths. */
export function shipAt(step, out) {
  const S = SHIP;
  const f = phase(step, S.cycle);
  const amp = (f < 0.4 ? f / 0.4 : f < 0.6 ? 1 : f < 1 ? (1 - f) / 0.4 : 0) * S.peak * DEG;
  const e = amp * amp < 1e-12 ? 0 : amp;
  sincos(TAU * phase(step, S.period), SC);
  out[0] = e * SC.s;
  out[1] = e * SC.c * (TAU / (S.period / 1000));
  return out;
}

/* ------------------------------------------------------------------ *
 * THE SEATING, every step, round the craft.
 * ------------------------------------------------------------------ */

/* Distance from p to an axis aligned box, squared. */
function boxD2(px, py, pz, cx, cy, cz, hx, hy, hz) {
  const dx = Math.max(0, Math.abs(px - cx) - hx);
  const dy = Math.max(0, Math.abs(py - cy) - hy);
  const dz = Math.max(0, Math.abs(pz - cz) - hz);
  return dx * dx + dy * dy + dz * dz;
}

/*
 * The seats for one step. `put(cx, cy, cz, hx, hy, hz, vx, vy, vz)`
 * writes a box and returns false once the slots are full.
 */
function seater(out) {
  let n = 0;
  const put = (cx, cy, cz, hx, hy, hz, vx, vy, vz) => {
    if (n >= RIDE_SLOTS) {
      return false;
    }
    const o = n * BOX_DOUBLES;
    out[o] = cx;
    out[o + 1] = cy;
    out[o + 2] = cz;
    out[o + 3] = hx;
    out[o + 4] = hy;
    out[o + 5] = hz;
    out[o + 6] = vx;
    out[o + 7] = vy;
    out[o + 8] = vz;
    n += 1;
    return true;
  };
  return { put, count: () => n, reset: () => { n = 0; } };
}

/* A box, if the craft is within WINDOW of it. */
function cube(S, p, cx, cy, cz, hx, hy, hz, vx, vy, vz) {
  const r = WINDOW;
  if (boxD2(p[0], p[1], p[2], cx, cy, cz, hx, hy, hz) > r * r) {
    return;
  }
  S.put(cx, cy, cz, hx, hy, hz, vx, vy, vz);
}

/* A rod a to b of radius r, moving at v (the same along it, or va to vb),
 * as short pieces round the point nearest the craft. */
function rod(S, p, ax, ay, az, bx, by, bz, r, vax, vay, vaz, vbx = vax, vby = vay, vbz = vaz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const L2 = dx * dx + dy * dy + dz * dz;
  if (L2 < 1e-12) {
    return;
  }
  let t = ((p[0] - ax) * dx + (p[1] - ay) * dy + (p[2] - az) * dz) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - p[0];
  const qy = ay + dy * t - p[1];
  const qz = az + dz * t - p[2];
  const reach = r + WINDOW;
  if (qx * qx + qy * qy + qz * qz > reach * reach) {
    return;
  }
  const L = Math.sqrt(L2);
  const span = (WINDOW + r + PIECE) / L;
  const t0 = t - span < 0 ? 0 : t - span;
  const t1 = t + span > 1 ? 1 : t + span;
  const pieces = Math.max(1, Math.ceil(((t1 - t0) * L) / PIECE));
  for (let k = 0; k < pieces; k += 1) {
    const u0 = t0 + ((t1 - t0) * k) / pieces;
    const u1 = t0 + ((t1 - t0) * (k + 1)) / pieces;
    const um = 0.5 * (u0 + u1);
    const hx = 0.5 * Math.abs(dx * (u1 - u0)) + r;
    const hy = 0.5 * Math.abs(dy * (u1 - u0)) + r;
    const hz = 0.5 * Math.abs(dz * (u1 - u0)) + r;
    if (!S.put(
      ax + dx * um, ay + dy * um, az + dz * um, hx, hy, hz,
      vax + (vbx - vax) * um, vay + (vby - vay) * um, vaz + (vbz - vaz) * um,
    )) {
      return;
    }
  }
}

/* Whether p is within `r` of a ride's round bounds (centre x, z, a
 * height band y0 to y1). */
function nearRide(p, x, z, R, y0, y1) {
  const dx = p[0] - x;
  const dz = p[2] - z;
  if (dx * dx + dz * dz > (R + WINDOW + 1) * (R + WINDOW + 1)) {
    return false;
  }
  return p[1] > y0 - WINDOW - 1 && p[1] < y1 + WINDOW + 1;
}

const PIN = new Float64Array(6);
const HORSE = new Float64Array(6);
const TW = [0, 0];
const CUP = new Float64Array(6);
const CHAIR = new Float64Array(8);
const SH = [0, 0];
const TRAIN = new Float64Array(CARS * 2 * 6);
const SAM = { i: 0, f: 0 };
const TRAIN_REACH = (CARS * CAR_PITCH) / 2 + 4;

function seatWheel(S, p, step) {
  const Wh = WHEEL;
  const hx = wx(Wh.px);
  const hz = wz(Wh.py);
  if (!nearRide(p, hx, hz, Wh.R + 3.2, 0, Wh.hub + Wh.R + 1)) {
    return;
  }
  /* Only the slab of the wheel the craft is in, along the axle. */
  if (Math.abs(p[2] - hz) > Wh.rim + 1.4 + WINDOW) {
    return;
  }
  const w = TAU / (Wh.period / 1000);
  for (let i = 0; i < Wh.gondolas; i += 1) {
    wheelPin(step, i, PIN);
    const c = Wh.cab;
    const yc = PIN[1] - c.below - c.tall / 2;
    cube(S, p, PIN[0], yc, PIN[2], c.hx, c.tall / 2 + c.below / 2, c.hz, PIN[3], PIN[4], 0);
    /* The pin across from rim to rim. */
    cube(S, p, PIN[0], PIN[1], PIN[2], 0.12, 0.12, Wh.rim, PIN[3], PIN[4], 0);
  }
  /* The spokes, on each rim's plane: from the hub's drum to the rim. */
  const a0 = wheelAngle(step);
  for (const side of [-1, 1]) {
    const z = hz + side * Wh.rim;
    if (Math.abs(p[2] - z) > 0.2 + WINDOW) {
      continue;
    }
    for (let j = 0; j < Wh.spokes; j += 1) {
      sincos(a0 + (TAU * (j + 0.5)) / Wh.spokes, SC);
      const ax = hx + 1.3 * SC.c;
      const ay = Wh.hub + 1.3 * SC.s;
      const bx = hx + Wh.R * SC.c;
      const by = Wh.hub + Wh.R * SC.s;
      rod(S, p, ax, ay, z, bx, by, z, 0.09, -w * 1.3 * SC.s, w * 1.3 * SC.c, 0, -w * Wh.R * SC.s, w * Wh.R * SC.c, 0);
    }
  }
}

function seatCarousel(S, p, step) {
  const C = CAROUSEL;
  const cx = wx(C.px);
  const cz = wz(C.py);
  if (!nearRide(p, cx, cz, C.R, C.deck, C.canopy)) {
    return;
  }
  const w = TAU / (C.period / 1000);
  /* The turn and the bob once, and each horse by the angle sum, which is
   * what horseAt works out horse by horse for the drawing. */
  const turn = carouselAngle(step);
  sincos(turn, SC);
  const ct = SC.c;
  const st = SC.s;
  sincos(2 * turn, SC2);
  const bs = SC2.s;
  const bc = SC2.c;
  const hh = C.horse.half;
  const wb = 2 * w * C.horse.bob;
  for (const h of HORSES) {
    const c = ct * h.c0 - st * h.s0;
    const s = st * h.c0 + ct * h.s0;
    const x = cx + h.r * c;
    const z = cz - h.r * s;
    /* Most horses are far from the craft: their ring's distance first. */
    const dx = p[0] - x;
    const dz = p[2] - z;
    if (dx * dx + dz * dz > 4) {
      continue;
    }
    const sign = h.k ? -1 : 1;
    const y = C.deck + C.horse.ride + C.horse.bob * bs * sign;
    const vx = -w * (z - cz);
    const vz = w * (x - cx);
    /* The pole, deck to canopy, upright. */
    cube(S, p, x, (C.deck + C.canopy) / 2, z, 0.06, (C.canopy - C.deck) / 2, 0.06, vx, 0, vz);
    /* The body, two boxes along the way it rides. */
    for (const k of [-1, 1]) {
      cube(S, p, x - s * C.horse.along * k, y, z - c * C.horse.along * k, hh, hh, hh, vx, wb * bc * sign, vz);
    }
  }
}

function seatTower(S, p, step) {
  const T = TOWER;
  const cx = wx(T.px);
  const cz = wz(T.py);
  if (!nearRide(p, cx, cz, T.half + T.ring.out + 1, 0, T.top + 2)) {
    return;
  }
  towerAt(step, TW);
  const y = TW[0] + T.ring.hy;
  const a = T.half;
  const b = T.half + T.ring.out;
  /* Four sides of the ring, round the tower. */
  cube(S, p, cx, y, cz - (a + b) / 2, b, T.ring.hy, (b - a) / 2, 0, TW[1], 0);
  cube(S, p, cx, y, cz + (a + b) / 2, b, T.ring.hy, (b - a) / 2, 0, TW[1], 0);
  cube(S, p, cx - (a + b) / 2, y, cz, (b - a) / 2, T.ring.hy, a, 0, TW[1], 0);
  cube(S, p, cx + (a + b) / 2, y, cz, (b - a) / 2, T.ring.hy, a, 0, TW[1], 0);
}

function seatTeacups(S, p, step) {
  const T = TEACUPS;
  if (!nearRide(p, wx(T.px), wz(T.py), T.R, 0, T.deck + T.cup.tall)) {
    return;
  }
  for (let i = 0; i < 9; i += 1) {
    cupAt(step, i, CUP);
    cube(S, p, CUP[0], T.deck + T.cup.tall / 2, CUP[2], T.cup.half, T.cup.tall / 2, T.cup.half, CUP[3], 0, CUP[5]);
  }
}

function seatSwings(S, p, step) {
  const Sw = SWINGS;
  if (!nearRide(p, wx(Sw.px), wz(Sw.py), Sw.top + Sw.chain + 1, Sw.hang - Sw.chain - 1, Sw.hang)) {
    return;
  }
  for (let i = 0; i < Sw.chairs; i += 1) {
    chairAt(step, i, CHAIR);
    const c = Sw.chair;
    cube(S, p, CHAIR[0], CHAIR[1] - c.tall / 2, CHAIR[2], c.half, c.tall / 2, c.half, CHAIR[6], 0, CHAIR[7]);
    rod(S, p, CHAIR[3], CHAIR[4], CHAIR[5], CHAIR[0], CHAIR[1], CHAIR[2], 0.04, 0, 0, 0, CHAIR[6], 0, CHAIR[7]);
  }
}

/* The ship's frame: a point of the hull at `along` (east of its middle),
 * `up` over the hull's keel line, at swing angle th, world, and its
 * velocity. */
function shipPoint(th, rate, along, up, out) {
  const S = SHIP;
  sincos(th, SC);
  /* The arm hangs down from the axle; the hull's long axis is across it.
   * Rotating about the axle (world z, north south), angle positive swings
   * the hull east. */
  const lx = along;
  const ly = -S.arm + up;
  const x = lx * SC.c - ly * SC.s;
  const y = lx * SC.s + ly * SC.c;
  out[0] = wx(S.px) + x;
  out[1] = S.axle + y;
  out[2] = wz(S.py);
  out[3] = -rate * y;
  out[4] = rate * x;
  return out;
}

const SP = new Float64Array(5);
const SQ = new Float64Array(5);
function seatShip(S, p, step) {
  const Sh = SHIP;
  if (!nearRide(p, wx(Sh.px), wz(Sh.py), Sh.arm + Sh.half + 2, 0, Sh.axle + Sh.arm + 3)) {
    return;
  }
  if (Math.abs(p[2] - wz(Sh.py)) > Sh.beam + 1.2 + WINDOW) {
    return;
  }
  shipAt(step, SH);
  for (const a of Sh.hull) {
    /* The hull's sheer rises toward the bow and the stern. */
    const rise = (a * a) / 60;
    shipPoint(SH[0], SH[1], a, Sh.hullUp + rise, SP);
    cube(S, p, SP[0], SP[1], SP[2], Sh.hullHalf, Sh.hullHalf, Sh.beam, SP[3], SP[4], 0);
  }
  /* The two arms, axle to the hull's ends, front and back of it. */
  for (const s of [-1, 1]) {
    shipPoint(SH[0], SH[1], 0, Sh.arm, SP);
    shipPoint(SH[0], SH[1], s * 3.6, 1.4, SQ);
    for (const z of [-1, 1]) {
      const zz = wz(Sh.py) + z * (Sh.beam + 0.15);
      rod(S, p, SP[0], SP[1], zz, SQ[0], SQ[1], zz, 0.16, SP[3], SP[4], 0, SQ[3], SQ[4], 0);
    }
  }
}

/* The train's cars, round the craft; the coaster's own bounds are its
 * line's, so the test is per box. */
function seatTrain(S, p, step) {
  /* The train's middle first: nothing of it is further than half its
   * length and a car's reach from there. */
  const tr = trainAt(step);
  sampleAt(tr.s, SAM);
  const L = coasterLine();
  const i = 3 * SAM.i;
  const dx = p[0] - wx(L.p[i]);
  const dy = p[1] - L.p[i + 2];
  const dz = p[2] - wz(L.p[i + 1]);
  if (dx * dx + dy * dy + dz * dz > TRAIN_REACH * TRAIN_REACH) {
    return;
  }
  const n = trainBoxes(step, TRAIN);
  const h = CAR_HALF;
  for (let k = 0; k < n; k += 1) {
    const o = k * 6;
    cube(S, p, wx(TRAIN[o]), TRAIN[o + 2], wz(TRAIN[o + 1]), h, h, h, TRAIN[o + 3], TRAIN[o + 5], -TRAIN[o + 4]);
  }
}

/*
 * The shell's view of the moving rides, as a map's `sails` (src/main.js
 * pushSails): which slots, how a box is written, the boxes round the craft
 * at a step, and how near the craft is to anything that moves, for the
 * lens's near plane.
 */
export function ridesSeat(moverSlots) {
  const base = moverSlots - RIDE_SLOTS;
  const P = [0, 0, 0];
  let S = null;
  /* The near plane's question (src/main.js fpvNear): how far the nearest
   * ride is from a point, as drawn at this step, if nearer than reach.
   * The same seating into a scratch of its own, so the plant's boxes are
   * not touched; reach is a few tenths and the seating's window is wider. */
  const G = new Float64Array(RIDE_SLOTS * BOX_DOUBLES);
  const GS = seater(G);
  const all = (Sx, step) => {
    seatTrain(Sx, P, step);
    seatWheel(Sx, P, step);
    seatCarousel(Sx, P, step);
    seatTower(Sx, P, step);
    seatTeacups(Sx, P, step);
    seatSwings(Sx, P, step);
    seatShip(Sx, P, step);
  };
  return {
    slots: RIDE_SLOTS,
    doubles: BOX_DOUBLES,
    base,
    seat(step, x, y, z, out) {
      if (!S || S.out !== out) {
        S = seater(out);
        S.out = out;
      }
      S.reset();
      P[0] = x;
      P[1] = y;
      P[2] = z;
      all(S, step);
      return S.count();
    },
    gapAt(x, y, z, reach, step) {
      GS.reset();
      P[0] = x;
      P[1] = y;
      P[2] = z;
      all(GS, step);
      let best = reach * reach;
      let hit = false;
      for (let k = 0; k < GS.count(); k += 1) {
        const o = k * BOX_DOUBLES;
        const d2 = boxD2(x, y, z, G[o], G[o + 1], G[o + 2], G[o + 3], G[o + 4], G[o + 5]);
        if (d2 < best) {
          best = d2;
          hit = true;
        }
      }
      return hit ? Math.sqrt(best) : Infinity;
    },
  };
}

/* The coaster's line is built when this module is, so the first step's
 * seating does no building. */
coasterLine();
