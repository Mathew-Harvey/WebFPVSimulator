/*
 * sim.c: Stage 1 physics module entry points.
 *
 * This is the Loop A stub. It exposes the full ABI from sim_abi.h and
 * returns SIM_ERR_NOT_IMPLEMENTED from every entry point, so that the
 * verification harness runs end to end and reports every check as an
 * honest FAIL rather than a crash. The one exception is sim_abi_version,
 * which must report the ABI version so a host can distinguish "stub
 * loaded" from "wrong module".
 *
 * Loop B replaces the bodies here with the fixed-step integrator and wires
 * in plant.c and bridge.c. The signatures must not change without an
 * argument in PROGRESS.md, because tests/ is written against them and is
 * read-only to Loop B.
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

#include "sim_abi.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define SIM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define SIM_EXPORT
#endif

SIM_EXPORT int sim_abi_version(void) { return SIM_ABI_VERSION; }

SIM_EXPORT int sim_init(const unsigned char *diff_utf8, int len) {
  (void)diff_utf8;
  (void)len;
  return SIM_ERR_NOT_IMPLEMENTED;
}

SIM_EXPORT int sim_reset(void) { return SIM_ERR_NOT_IMPLEMENTED; }

SIM_EXPORT int sim_set_cell_voltage(double volts) {
  (void)volts;
  return SIM_ERR_NOT_IMPLEMENTED;
}

SIM_EXPORT int sim_input(double t_seconds, double roll, double pitch,
                         double yaw, double throttle) {
  (void)t_seconds;
  (void)roll;
  (void)pitch;
  (void)yaw;
  (void)throttle;
  return SIM_ERR_NOT_IMPLEMENTED;
}

SIM_EXPORT int sim_step(int n) {
  (void)n;
  return SIM_ERR_NOT_IMPLEMENTED;
}

SIM_EXPORT int sim_motor_override(int motor, double duty) {
  (void)motor;
  (void)duty;
  return SIM_ERR_NOT_IMPLEMENTED;
}

SIM_EXPORT int sim_state_size(void) { return SIM_ERR_NOT_IMPLEMENTED; }

SIM_EXPORT int sim_state(double *out) {
  (void)out;
  return SIM_ERR_NOT_IMPLEMENTED;
}
