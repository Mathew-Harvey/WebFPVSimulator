/*
 * sim_math.h: deterministic maths for the physics path.
 *
 * CLAUDE.md requires a fixed maths implementation compiled into the WASM
 * module: no JS Math and no libc libm anywhere near the trajectory. These
 * helpers use only IEEE 754 basic operations (add, subtract, multiply,
 * divide) and the wasm f64.sqrt instruction, all of which are specified to
 * bit precision, so the same inputs produce the same bits on every engine
 * and every host.
 *
 * The trig here is intentionally small-angle only. The integrator rotates
 * the attitude quaternion by |omega| * dt per 1 ms step, which stays far
 * inside the polynomial's accurate range. Guard checks enforce that.
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

#ifndef SIM_MATH_H
#define SIM_MATH_H

/* f64.sqrt is a single deterministic wasm instruction. */
static inline double sim_sqrt(double x) { return __builtin_sqrt(x); }

static inline double sim_fabs(double x) { return x < 0.0 ? -x : x; }

/*
 * sin and cos for |x| <= 0.5 rad by Taylor series. At 0.5 rad the
 * truncation error is below 3e-10 for sin (x^9 term) and 2e-8 for cos
 * (x^8 term), far smaller than anything the plant resolves, and every
 * term is an exact IEEE operation. The integrator asserts its half-angle
 * stays under this bound.
 */
double sim_sin_small(double x);
double sim_cos_small(double x);

#endif /* SIM_MATH_H */
