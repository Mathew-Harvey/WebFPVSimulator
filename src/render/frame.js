/*
 * frame.js: the one and only conversion between the physics frame and the
 * Three.js frame. Physics is right-handed z up, x forward, y left
 * (sim_abi.h). Three.js is right-handed y up, with -z into the screen.
 *
 * The basis change used everywhere below, a proper rotation:
 *   x_three = -y_sim   (screen right is the quad's right)
 *   y_three =  z_sim   (up stays up)
 *   z_three = -x_sim   (forward points into the screen)
 * Rotation quaternions transform by the same component permutation.
 *
 * Nothing outside this file may convert coordinates. CLAUDE.md: sign
 * errors in yaw two months from now all trace back to breaking this.
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

/*
 * How much larger the world is than the aircraft, as a pure number.
 *
 *   world metres = sim metres / WORLD_SCALE
 *
 * IT IS 1, AND THE HISTORY OF WHY IT WAS NOT IS THE REASON THIS COMMENT IS
 * LONG.
 *
 * The owner flew it and reported "the gates and the town are too small
 * compared to the drone". The response was to set this to 1.25, on the
 * reasoning, written down here at the time, that "at 1.25 every solid thing
 * in both maps stands a quarter larger relative to the camera than it did".
 *
 * That reasoning is wrong, and the second report, "the gates feel small and
 * the field is large", is what it produces. This scale divides the craft's
 * displacement about the sim origin. It does not touch the world, so it
 * cannot change how big anything in the world LOOKS: the on screen height of
 * a gate is
 *
 *   pixels = viewportHeight * clearH / (2 * depth * tan(fov / 2))
 *
 * and WORLD_SCALE appears nowhere in it. A gate seen from 10 world metres
 * subtends exactly the same angle at 1.25 as it does at 1. What the scale
 * does change is how much sim distance buys a world metre, so at 1.25 the
 * craft crossed every course a quarter slower and a 542 m lap had to be
 * flown as 678 m. That is the whole of the "field is large" report, and on a
 * project that publishes lap times to a leaderboard it is worse than a feel
 * problem: it is a quarter added to every time.
 *
 * So the lever was the wrong one. Apparent size is the CAMERA's, and the
 * camera is where it has been fixed: see src/render/lens.js, which carries
 * the derivation. Here, 1 restores the property that makes the rest
 * of the project's dimensions mean anything, which is that a metre in the
 * physics is a metre in the world.
 *
 * The seam stays, because it is the right seam if the ratio is ever wanted
 * again: this file is already the one and only conversion between the
 * physics frame and the world frame, and a scale is exactly that kind of
 * conversion. Everything the shell measures in world metres (terrain
 * heights, collider boxes, the surface bias, gate apertures) is the world's
 * own truth and does not pass through here. Everything that is a fact about
 * the airframe (its 0.110 m arm, its 2.0 m/s landing gate) stays in sim
 * metres, because a landing leg does not care what scale the town was built
 * at. tests/thresholds.json carries the declared value so that changing it
 * has to be done in two places on purpose.
 */
export const WORLD_SCALE = 1;

/* A length in sim metres as a length in world metres. Sizes and offsets that
 * belong to the AIRCRAFT go through this on their way into the scene: its
 * drawn model, its collision ellipsoid, its camera mount, its resting height
 * above the ground. */
export function simLenToWorld(metres) {
  return metres / WORLD_SCALE;
}

/*
 * Sim world position (metres, z up) to a Three.js Vector3 like object, in
 * world metres.
 *
 * The scale divides the craft's own displacement about the sim origin, which
 * is all this vector is: the shell adds the spawn's world position after the
 * conversion, precisely because that is a world length and must not be
 * scaled twice.
 */
export function simPosToThree(x, y, z, out) {
  out.set(-y / WORLD_SCALE, z / WORLD_SCALE, -x / WORLD_SCALE);
  return out;
}

/* Sim body-to-world quaternion (w x y z) to a Three.js Quaternion. */
export function simQuatToThree(w, x, y, z, out) {
  out.set(-y, z, -x, w);
  return out;
}

/*
 * Inverse of simPosToThree: a Three.js world-metre point (already stripped
 * of the spawn offset and spawn yaw, those live in the shell) back into
 * sim metres, z up. Bounce writes a plant position, so the conversion has
 * to come back through this file, the same seam it left by.
 *
 *   x_sim = -z_three * WORLD_SCALE
 *   y_sim = -x_three * WORLD_SCALE
 *   z_sim =  y_three * WORLD_SCALE
 */
export function threePosToSim(x, y, z, out) {
  out.x = -z * WORLD_SCALE;
  out.y = -x * WORLD_SCALE;
  out.z = y * WORLD_SCALE;
  return out;
}

/*
 * Inverse permutation for a direction. WORLD_SCALE is isotropic, so a unit
 * vector in the Three.js frame is a unit vector in the plant frame.
 */
export function threeDirToSim(x, y, z, out) {
  out.x = -z;
  out.y = -x;
  out.z = y;
  return out;
}
