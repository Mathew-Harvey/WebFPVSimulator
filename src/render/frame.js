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
 * The owner flew it and reported the same thing twice: "the gates and the
 * town are too small compared to the drone", "the scale doesn't feel right".
 * Both maps measure correct. A MultiGP standard gate is 1.524 m because
 * MultiGP publishes 5 ft (src/game/track.js), the town's doorways are 1.9 to
 * 2.1 m and its kerbs 0.10 to 0.20 m because a tape measure in a Japanese
 * suburb says so (src/maps/city/references.js), and check 15 asserts all of
 * it. So there is nothing in either world to correct, and shrinking a gate
 * to taste would just be deleting the one citation the project has.
 *
 * What is adjustable is how big the AIRCRAFT is against all of it. This is
 * the ratio, and it is the whole of the change: at 1.25 every solid thing in
 * both maps stands a quarter larger relative to the camera than it did, the
 * craft's own camera flies a quarter lower over the same ground, and the
 * world goes past a quarter slower for its size. That is the cue the eye
 * actually reads as scale, and it is why an honest 1.524 m gate can still
 * fly like a toy hoop: angular size alone is scale invariant, so a bigger
 * gate at a proportionally greater distance looks identical. What changes
 * the feel is the size and speed of the aircraft moving through it.
 *
 * It is applied HERE and only here because this file is already the one and
 * only conversion between the physics frame and the world frame, and a scale
 * is exactly that kind of conversion. Downstream of this line the aircraft
 * is 1/1.25 of its true size and travels 1/1.25 as far per second; upstream
 * of it nothing has changed at all. The physics module, the ABI, the
 * determinism trace and every published dimension in either map are
 * untouched, which is the property that made this the right seam:
 *
 *   world metres = sim metres / WORLD_SCALE
 *
 * Everything the shell measures in world metres (terrain heights, collider
 * boxes, the surface bias, gate apertures) is the world's own truth and does
 * not pass through here. Everything that is a fact about the airframe (its
 * 0.110 m arm, its 2.0 m/s landing gate, its closing speed into a gate
 * upright) stays in sim metres, because a landing leg does not care what
 * scale the town was built at.
 */
export const WORLD_SCALE = 1.25;

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
