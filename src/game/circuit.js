/*
 * circuit.js: the shape of the built in course, and the only place it is
 * written down.
 *
 * WHY THIS IS ITS OWN FILE. The figure eight used to be sixteen control
 * points computed inside src/render/scene.js, which was fine while exactly
 * one thing drew it. The map screen's thumbnail draws it too, and it must
 * not import the renderer: three.js, the post chain and the whole world
 * builder to find out where fourteen gates are is the wrong trade, and a
 * second copy of the lemniscate is the kind of duplication that goes wrong
 * silently, six months later, in the direction of a thumbnail that shows a
 * course nobody can fly.
 *
 * So the curve is here, as plain arithmetic with no dependency at all, and
 * both readers take it from here.
 *
 * THE CURVE. A lemniscate of Bernoulli, 105 m by 118 m, sampled at sixteen
 * control points and fitted with a Catmull-Rom by whoever wants a curve out
 * of it. Its arc length is 569.6 m and its tightest radius of curvature is
 * 11.16 m, at the timing gate; the second figure is why the course is not
 * scaled down to close the gate spacing, since scaling it to put eight gates
 * 40 m apart would cost 8.7 g of lateral acceleration at 20 m/s and the
 * course would stop being flyable. See src/render/scene.js.
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

/* How many control points the curve is sampled at. Sixteen, and it is not a
 * free number: the world's own scenery is laid out against the curve fitted
 * through exactly these points, so changing it moves every tree. */
export const CIRCUIT_POINTS = 16;

/*
 * Stations on the built in circuit. Fourteen, argued at length in
 * src/render/scene.js: at eight, the next gate was 67.7 m out at 15.4 px of
 * aperture and the one after it was off the side of the frame, so a pilot
 * could see exactly one gate and had to fly the rest from memory.
 */
export const CIRCUIT_STATIONS = 14;

/*
 * A point on the circuit, for t in [0, 1). Scene frame, y up, metres, with
 * the curve lying in the y = 0 plane because the height field flattens a
 * corridor along it.
 */
export function circuitPoint(t) {
  const a = t * Math.PI * 2;
  const d = 1 + Math.sin(a) * Math.sin(a);
  return {
    x: (105 * Math.cos(a)) / d,
    y: 0,
    z: (118 * Math.sin(a) * Math.cos(a)) / d,
  };
}
