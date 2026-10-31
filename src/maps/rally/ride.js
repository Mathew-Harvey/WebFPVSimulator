/*
 * ride.js: a rallycross car over the jump, render only. Pure.
 *
 * The physics module drives every car on flat ground (../built/traffic.js,
 * "ROAD HEIGHT"), so a car that reaches the jump would drive through it.
 * This lifts the DRAWN car onto the jump's face, off its lip on a ballistic
 * arc at the speed the pose says it has, and back onto the ground where the
 * arc meets it, pitched along the way it is going: the long, nose high
 * flight a rallycross jump is built for. It is a pure function of the
 * pose the physics used, so a car flies the same arc on every run and a
 * dropped frame changes nothing. Its solid stays on the ground under it,
 * as a bike's does on Ridgeline MX: the module holds one box a car.
 *
 * The jump runs east along the infield straight (./circuit.js JUMP_X), so
 * how far past its foot a car is is its plan x less JUMP_X, while it heads
 * east and is on the straight. No trigonometry on anything solid; the
 * arctangent here is the body's pitch, which only the picture sees.
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

import { W, D } from './frame.js';
import { JUMP_X, JUMP_PROFILE, JUMP_HALF, jumpGround } from './circuit.js';

const G = 9.81;
/* The lip: where the kicker ends and the car leaves it, and the face's
 * slope there. */
const LIP = 10;
const LIP_H = 1.5;
const LIP_SLOPE = (1.5 - 0.85) / 4;
const END = JUMP_PROFILE[JUMP_PROFILE.length - 1][0];
/* The furthest a car can carry, metres past the foot. */
const REACH = 52;
/* The body pitches with the arc, a little less than the arc does, as a
 * car's nose drops under its own weight in the air. */
const PITCH_SHARE = 0.75;

/* The height over the ground, d metres past the foot, of a car that left
 * the lip at `v` m/s; and its slope there. */
function arc(d, v, out) {
  const x = d - LIP;
  const c2 = 1 + LIP_SLOPE * LIP_SLOPE;
  const k = (G * c2) / (2 * v * v);
  out.h = LIP_H + LIP_SLOPE * x - k * x * x;
  out.slope = LIP_SLOPE - 2 * k * x;
}

const ARC = { h: 0, slope: 0 };

/*
 * The car's lift and pitch at a pose: world x and z, its heading's x, and
 * its speed. Writes out.lift (metres up) and out.pitch (radians, nose up).
 */
export function rideAt(x, z, hx, speed, out) {
  out.lift = 0;
  out.pitch = 0;
  if (hx < 0.6) {
    return out;
  }
  const px = x + W / 2;
  const py = D / 2 - z;
  const d = px - JUMP_X;
  if (d <= 0 || d >= REACH || Math.abs(py - 118) > JUMP_HALF + 1) {
    return out;
  }
  const ground = jumpGround(d);
  const groundSlope = (jumpGround(d + 0.25) - jumpGround(d - 0.25)) / 0.5;
  if (d <= LIP || speed < 6) {
    out.lift = ground;
    out.pitch = Math.atan(groundSlope);
    return out;
  }
  arc(d, Math.max(speed, 6), ARC);
  if (ARC.h > ground) {
    out.lift = ARC.h;
    out.pitch = Math.atan(ARC.slope) * PITCH_SHARE;
    return out;
  }
  out.lift = d < END ? ground : 0;
  out.pitch = d < END ? Math.atan(groundSlope) : 0;
  return out;
}
