/*
 * trig.js: a sine and cosine that give the same bits in every engine.
 *
 * WHY THIS EXISTS. A prop placed in a built freestyle map becomes solids, and
 * those solids go into the physics module (src/game/plantworld.js). A crane
 * jib turned to 30 degrees is a capsule whose two ends are the jib's local
 * ends turned by 30 degrees, and turning them takes a sine and a cosine.
 * CLAUDE.md forbids JS Math.sin and Math.cos in the physics path because the
 * language does not specify them to the bit: two browsers can put the same
 * jib a few ulps apart, and the same stick input then flies a different
 * trace. So the turn is done here, with + - * / and Math.round only, every
 * one of which JavaScript does specify to the bit (IEEE 754 double, round to
 * nearest, no fused multiply add).
 *
 * THE METHOD is the one fdlibm uses and the one src/native/world.c uses for
 * the plant's own frame: reduce the angle by the nearest multiple of pi/2
 * with a two part constant (Cody and Waite), then evaluate fdlibm's minimax
 * polynomials on what is left, which lies in [-pi/4, pi/4]. Accurate to about
 * one ulp over the range a heading can have, and identical on every host.
 *
 * Render code is free to use Math.sin and Math.cos; a mesh a few ulps off
 * is invisible. Only numbers that reach the physics come through here.
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

/* pi/2 in two parts, fdlibm's pio2_1 and pio2_1t: the high part has its low
 * 33 bits clear, so k * PIO2_HI is exact for any k a heading can need. */
const PIO2_HI = 1.57079632673412561417e+00;
const PIO2_LO = 6.07710050650619224932e-11;
const INV_PIO2 = 6.36619772367581382433e-01;

/* fdlibm __kernel_sin and __kernel_cos. */
const S1 = -1.66666666666666324348e-01;
const S2 = 8.33333333332248946124e-03;
const S3 = -1.98412698298579493134e-04;
const S4 = 2.75573137070700676789e-06;
const S5 = -2.50507602534068634195e-08;
const S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02;
const C2 = -1.38888888888741095749e-03;
const C3 = 2.48015872894767294178e-05;
const C4 = -2.75573143513906633035e-07;
const C5 = 2.08757232129817482790e-09;
const C6 = -1.13596475577881948265e-11;

function kernelSin(x) {
  const z = x * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + x * z * (S1 + z * r);
}

function kernelCos(x) {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  /* 1 - z/2 + z*r, written the way fdlibm writes it so the large terms
   * are added last. */
  const hz = 0.5 * z;
  const w = 1 - hz;
  return w + (((1 - w) - hz) + z * r);
}

/*
 * sin and cos of `a`, into `out` as { s, c }. Allocates nothing. Headings
 * are small numbers (a document wraps them to (-pi, pi]); anything past a
 * few thousand radians is not a heading and is not supported.
 */
export function sincos(a, out = { s: 0, c: 0 }) {
  if (!Number.isFinite(a)) {
    out.s = 0;
    out.c = 1;
    return out;
  }
  const k = Math.round(a * INV_PIO2);
  const r = (a - k * PIO2_HI) - k * PIO2_LO;
  const s = kernelSin(r);
  const c = kernelCos(r);
  /* ((k % 4) + 4) % 4, done with integer arithmetic that cannot round. */
  const q = ((k % 4) + 4) % 4;
  if (q === 0) {
    out.s = s;
    out.c = c;
  } else if (q === 1) {
    out.s = c;
    out.c = -s;
  } else if (q === 2) {
    out.s = -s;
    out.c = -c;
  } else {
    out.s = -c;
    out.c = s;
  }
  return out;
}

/*
 * THE NEAREST QUARTER TURN, as an integer 0 to 3, and it is exact.
 *
 * A prop built of boxes can only face the four compass headings, because the
 * physics world holds axis aligned boxes and nothing else (see
 * FREESTYLE-MAPS-PLAN.md, section 10). A box turned by a quarter turn is
 * still an axis aligned box, with its extents swapped, and that swap is
 * exact: no sine is taken at all. A document stores headings rounded to six
 * places, so a quarter turn arrives as 1.570796 rather than pi/2, and taking
 * its sine would give 0.99999999999989 rather than 1. Snapping to the index
 * first is what makes a quarter turned roof exactly level with its
 * neighbour's.
 */
export function quarterTurns(a) {
  if (!Number.isFinite(a)) {
    return 0;
  }
  const k = Math.round(a * INV_PIO2);
  return ((k % 4) + 4) % 4;
}

/* The heading a quarter turn index stands for, for drawing. */
export function quarterYaw(q) {
  return (((q % 4) + 4) % 4) * (Math.PI / 2);
}

/*
 * Turn a local point about +y (Three.js up) by a heading given as sin and
 * cos, the same rotation Object3D.rotation.y applies:
 *
 *   x' =  x c + z s
 *   z' = -x s + z c
 *
 * Written out rather than built as a matrix so the order of the operations
 * is fixed, which is part of what makes the result the same everywhere.
 */
export function turnY(x, z, s, c, out) {
  out.x = x * c + z * s;
  out.z = -x * s + z * c;
  return out;
}

/* The exact sin and cos of a quarter turn index. */
export function quarterSinCos(q, out = { s: 0, c: 1 }) {
  const n = ((q % 4) + 4) % 4;
  out.s = n === 1 ? 1 : n === 3 ? -1 : 0;
  out.c = n === 0 ? 1 : n === 2 ? -1 : 0;
  return out;
}
