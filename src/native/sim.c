/*
 * sim.c: Stage 1 physics module entry points and the fixed-step driver.
 *
 * The module is one deterministic unit stepped at exactly 1000 Hz. Input
 * samples carry their own timestamps and are consumed by that timestamp:
 * a sample is applied before the 1 ms step containing it executes, never
 * by arrival time. How the host batches sim_step calls cannot affect the
 * trajectory; there is no frame time anywhere in this file.
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
#include "sim_internal.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define SIM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define SIM_EXPORT
#endif

#define INPUT_QUEUE_CAP 8192

typedef struct {
  long long t_us;
  double ch[4]; /* roll, pitch, yaw, throttle */
} InputSample;

static SimState S;
static int g_initialised = 0;
static double g_current_rc[4] = { 0.0, 0.0, 0.0, 0.0 };
static double g_override[SIM_MOTOR_COUNT] = { -1.0, -1.0, -1.0, -1.0 };
static InputSample g_queue[INPUT_QUEUE_CAP];
static int g_q_head = 0;
static int g_q_tail = 0;
static long long g_last_input_us = -1;

SIM_EXPORT int sim_abi_version(void) { return SIM_ABI_VERSION; }

static void reset_dynamics(void) {
  plant_reset(&S);
  bridge_reset();
  g_q_head = 0;
  g_q_tail = 0;
  g_last_input_us = -1;
  for (int i = 0; i < 4; i += 1) {
    g_current_rc[i] = 0.0;
  }
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    g_override[m] = -1.0;
  }
}

SIM_EXPORT int sim_init(const unsigned char *diff_utf8, int len) {
  if (diff_utf8 == 0 || len < 0) {
    return SIM_ERR_BAD_ARG;
  }
  const int rc = bridge_parse_config(diff_utf8, len);
  if (rc != SIM_OK) {
    return rc;
  }
  if (!g_initialised) {
    S.cell_voltage_oc = 4.2;
  }
  g_initialised = 1;
  reset_dynamics();
  return SIM_OK;
}

SIM_EXPORT int sim_reset(void) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  reset_dynamics();
  return SIM_OK;
}

SIM_EXPORT int sim_set_cell_voltage(double volts) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!(volts > 0.5) || !(volts < 5.0)) {
    return SIM_ERR_BAD_ARG;
  }
  S.cell_voltage_oc = volts;
  return SIM_OK;
}

SIM_EXPORT int sim_input(double t_seconds, double roll, double pitch, double yaw,
                         double throttle) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!(t_seconds >= 0.0)) {
    return SIM_ERR_BAD_ARG;
  }
  const long long t_us = (long long)(t_seconds * 1e6 + 0.5);
  if (t_us < g_last_input_us) {
    return SIM_ERR_BAD_ARG;
  }
  const int next = (g_q_tail + 1) % INPUT_QUEUE_CAP;
  if (next == g_q_head) {
    return SIM_ERR_BAD_STATE;
  }
  g_queue[g_q_tail].t_us = t_us;
  g_queue[g_q_tail].ch[0] = roll;
  g_queue[g_q_tail].ch[1] = pitch;
  g_queue[g_q_tail].ch[2] = yaw;
  g_queue[g_q_tail].ch[3] = throttle;
  g_q_tail = next;
  g_last_input_us = t_us;
  return SIM_OK;
}

SIM_EXPORT int sim_motor_override(int motor, double duty) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (motor < -1 || motor >= SIM_MOTOR_COUNT) {
    return SIM_ERR_BAD_ARG;
  }
  double d = duty;
  if (d > 1.0) {
    d = 1.0;
  }
  if (d < 0.0) {
    d = -1.0; /* clears */
  }
  if (motor == -1) {
    for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
      g_override[m] = d;
    }
  } else {
    g_override[motor] = d;
  }
  return SIM_OK;
}

SIM_EXPORT int sim_step(int n) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (n < 0) {
    return SIM_ERR_BAD_ARG;
  }
  for (int k = 0; k < n; k += 1) {
    /* Consume every sample whose timestamp falls inside this step. Each
     * consumed sample is an RC frame for the controller. */
    const long long step_end_us = (S.step_index + 1) * 1000;
    int rx_new = 0;
    while (g_q_head != g_q_tail && g_queue[g_q_head].t_us < step_end_us) {
      g_current_rc[0] = g_queue[g_q_head].ch[0];
      g_current_rc[1] = g_queue[g_q_head].ch[1];
      g_current_rc[2] = g_queue[g_q_head].ch[2];
      g_current_rc[3] = g_queue[g_q_head].ch[3];
      g_q_head = (g_q_head + 1) % INPUT_QUEUE_CAP;
      rx_new = 1;
    }
    double duty[SIM_MOTOR_COUNT];
    bridge_run(&S, g_current_rc, rx_new, duty);
    for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
      if (g_override[m] >= 0.0) {
        duty[m] = g_override[m];
      }
    }
    plant_step(&S, duty);
    S.step_index += 1;
  }
  return SIM_OK;
}

SIM_EXPORT int sim_state_size(void) { return SIM_STATE_DOUBLES; }

SIM_EXPORT int sim_state(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  out[0] = (double)S.step_index / 1000.0;
  out[1] = S.pos[0];
  out[2] = S.pos[1];
  out[3] = S.pos[2];
  out[4] = S.vel[0];
  out[5] = S.vel[1];
  out[6] = S.vel[2];
  out[7] = S.quat[0];
  out[8] = S.quat[1];
  out[9] = S.quat[2];
  out[10] = S.quat[3];
  out[11] = S.omega[0];
  out[12] = S.omega[1];
  out[13] = S.omega[2];
  /* rad/s to RPM is a display conversion fixed by the ABI. */
  const double to_rpm = 60.0 / (2.0 * 3.14159265358979323846);
  out[14] = S.motor_omega[0] * to_rpm;
  out[15] = S.motor_omega[1] * to_rpm;
  out[16] = S.motor_omega[2] * to_rpm;
  out[17] = S.motor_omega[3] * to_rpm;
  out[18] = S.vbat_load;
  out[19] = S.pack_current;
  return SIM_OK;
}
