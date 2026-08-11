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

/* Sim world position (metres, z up) to a Three.js Vector3 like object. */
export function simPosToThree(x, y, z, out) {
  out.set(-y, z, -x);
  return out;
}

/* Sim body-to-world quaternion (w x y z) to a Three.js Quaternion. */
export function simQuatToThree(w, x, y, z, out) {
  out.set(-y, z, -x, w);
  return out;
}
