/*
 * profile.js: how a rider at Shiroyama FMX rides the loop, and what they
 * pull in the air. Pure: no Three.js, no DOM and no JS trigonometry, so
 * the drawn ramps, the bikes' bodies and the camera judge's poses all read
 * the same numbers (scripts/fmx-check.js).
 *
 * THE PHYSICS MODULE DRIVES EVERY BIKE ALONG THE FLAT LOOP (src/native/
 * world.c section 5), as it drives Ridgeline MX's: where a bike is, its
 * heading and its speed are the module's, from the lap clock. What it does
 * on top of that is this file's, a pure function of how far it has driven
 * and its slot, in the shape src/maps/moto/bikes.js draws:
 *
 *   dy       how high it is over the floor: the ramp under it or its arc
 *   pitch    nose up, rad: the slope under it, the arc, or a flip
 *   yaw      how far it is turned off its heading, rad: a whip or a 360
 *   roll     how far it is laid over, rad: the turn, a whip, a nac nac
 *   air      0 on the ground, the share of the flight flown in the air
 *
 * THE ARC IS GRAVITY'S. A rider leaves the lip at SET.lip along the lane
 * and flies dy = lip + tan x - k x x, with x the distance past the lip and
 * k = g / (2 v v) for v the bike's speed over the ground, TOP, which the
 * module holds them to round the whole loop (./traffic.js). So the arc
 * drawn is the arc a real bike at that speed flies, and the landing is
 * where it meets the landing's face, solved once below, never guessed.
 *
 * THE TRICKS. Which one a rider pulls over a flight is a hash of their
 * slot, the lap and the flight, so it is the same on every page and
 * different every lap: a WHIP, a BACKFLIP, a FLAT 360, a NAC NAC (laid over
 * and kicked out), a FLIP WHIP, or a clean SUPERMAN SEAT GRAB, which on a
 * body that cannot let go reads as a long, flat, stretched-out air. Every
 * rotation starts after the lip and is back to the landing's slope before
 * the wheels touch, as it has to be.
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

import { nearestOn } from '../built/road.js';
import {
  loopLine, SET, SET_X, KICKER, LANDING, LANE_N, LANE_S, setGround,
} from './arena.js';

const G = 9.81;
/* The riders' speed over the ground, m/s, the one the arc is drawn for. */
export const TOP = 13;
/* The most a bike lays over on the ground, rad. */
export const LEAN_MAX = 0.75;
const TWO_PI = 6.283185307179586;

const K = G / (2 * TOP * TOP);

/*
 * Where the arc meets the landing's face: lip + tan x - k x x =
 * h - slope (x + lip - knuckle), the larger root, which is past the
 * knuckle. Solved once, here, so a change to a ramp moves the landing.
 */
function landingX() {
  const a = K;
  const b = -(KICKER.tan + LANDING.slope);
  const c = LANDING.h + LANDING.slope * (SET.knuckle - SET.lip) - KICKER.lip;
  const disc = b * b - 4 * a * c;
  return (-b + Math.sqrt(disc)) / (2 * a);
}
export const FLIGHT_X = landingX();
/* The height of the arc x metres past the lip. */
export function arcAt(x) {
  return KICKER.lip + KICKER.tan * x - K * x * x;
}

/* Each lane's set along the loop: the centre line's arc length where the
 * kicker starts, and the flight's start and end in the same metres. */
const LINE = loopLine();
const L = LINE.length;
function sOf(x, y) {
  return nearestOn(LINE, x, y).s;
}
export const SETS = [
  { name: 'north', s0: sOf(SET_X.n, LANE_N) },
  { name: 'south', s0: sOf(SET_X.s, LANE_S) },
].map((f, i) => ({
  ...f,
  id: i,
  a: f.s0 + SET.lip,
  b: f.s0 + SET.lip + FLIGHT_X,
  s1: f.s0 + SET.end,
}));
export const LAP = L;

/* The trick names, for the judge's callouts and the check. */
export const TRICKS = ['Whip', 'Backflip', 'Flat 360', 'Nac nac', 'Flip whip', 'Seat grab'];
export const T_WHIP = 0;
export const T_FLIP = 1;
export const T_360 = 2;
export const T_NAC = 3;
export const T_FLIPWHIP = 4;
export const T_GRAB = 5;

/* A small integer hash to [0, 1). */
export function hash01(a, b, c) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* The trick a rider pulls on a flight this lap, and its side. */
export function trickOf(slot, lap, flight, out) {
  const h = hash01(slot * 131 + 7, lap, flight);
  out.trick = h < 0.22 ? T_WHIP : h < 0.47 ? T_FLIP : h < 0.6 ? T_360 : h < 0.75 ? T_NAC : h < 0.88 ? T_FLIPWHIP : T_GRAB;
  out.side = hash01(slot * 17 + 3, lap + 11, flight) < 0.5 ? -1 : 1;
  return out;
}

/* A bell on 0..1, 0 at both ends and 1 in the middle. */
const bell = (u) => 4 * u * (1 - u);
/* 0 to 1 between u0 and u1, smooth at both ends. */
function ease(u, u0, u1) {
  if (u <= u0) {
    return 0;
  }
  if (u >= u1) {
    return 1;
  }
  const t = (u - u0) / (u1 - u0);
  return t * t * (3 - 2 * t);
}
/* A hold: up by u0 + 0.15, held, down by u1. */
function hold(u, u0, u1) {
  return ease(u, u0, u0 + 0.18) * (1 - ease(u, u1 - 0.18, u1));
}

/* The slope of the ground at s, as a pitch. */
function slopePitch(g1, g2, span) {
  const slope = (g1 - g2) / span;
  return slope / (1 + 0.28 * slope * slope);
}

/* The set s is in, or null, and the along distance into it. */
function setAt(s) {
  for (let i = 0; i < SETS.length; i += 1) {
    const f = SETS[i];
    let a = s - f.s0;
    if (a < 0) {
      a += L;
    }
    if (a >= 0 && a <= SET.end) {
      return f;
    }
  }
  return null;
}

/* The ground's height at centre arc length s. */
export function groundAt(s) {
  const f = setAt(s);
  if (!f) {
    return 0;
  }
  let a = s - f.s0;
  if (a < 0) {
    a += L;
  }
  return setGround(a);
}

const TRICK = { trick: 0, side: 1 };

/*
 * How the bike with `slot` rides at arc length `s` on lap `lap`, going
 * `speed` round a bend of `curvature` (1/m, left positive), into `out`.
 */
export function rideAt(slot, lap, s, speed, curvature, out) {
  let x = s - L * Math.floor(s / L);
  let dy = 0;
  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  let air = 0;
  const k = speed * speed * curvature / G;
  let lean = 0.95 * k / (1 + 0.4 * k * k);
  lean = lean > LEAN_MAX ? LEAN_MAX : (lean < -LEAN_MAX ? -LEAN_MAX : lean);
  let flight = null;
  let fx = 0;
  for (let i = 0; i < SETS.length; i += 1) {
    const f = SETS[i];
    const d = x - f.a;
    if (d >= 0 && d < FLIGHT_X) {
      flight = f;
      fx = d;
    }
  }
  if (flight) {
    const u = fx / FLIGHT_X;
    dy = arcAt(fx);
    const slope = KICKER.tan - 2 * K * fx;
    pitch = slope / (1 + 0.28 * slope * slope);
    trickOf(slot, lap, flight.id, TRICK);
    const side = TRICK.side;
    switch (TRICK.trick) {
      case T_WHIP: {
        const b = hold(u, 0.1, 0.8);
        yaw = side * 0.85 * b;
        roll = side * 0.95 * b;
        break;
      }
      case T_FLIP:
        pitch += TWO_PI * ease(u, 0.08, 0.86);
        break;
      case T_360:
        yaw += side * TWO_PI * ease(u, 0.1, 0.85);
        roll = side * 0.25 * bell(u);
        break;
      case T_NAC: {
        const b = hold(u, 0.15, 0.82);
        roll = side * 0.55 * b;
        yaw = -side * 0.2 * b;
        break;
      }
      case T_FLIPWHIP: {
        pitch += TWO_PI * ease(u, 0.06, 0.7);
        const b = hold(u, 0.62, 0.95);
        yaw = side * 0.7 * b;
        roll = side * 0.8 * b;
        break;
      }
      default: {
        /* The stretched air: nose held down and flat, the bike pushed out
         * level for a long beat. */
        const b = hold(u, 0.2, 0.85);
        pitch = pitch * (1 - 0.6 * b);
        roll = side * 0.18 * b;
        break;
      }
    }
    air = u > 0 ? u : 0.001;
  } else {
    const g0 = groundAt(x);
    dy = g0;
    pitch = slopePitch(groundAt(x + 0.6), groundAt(x - 0.6), 1.2);
    roll = setAt(x) ? 0 : lean;
  }
  out.dy = dy;
  out.pitch = pitch;
  out.yaw = yaw;
  out.roll = roll;
  out.air = air;
  return out;
}
