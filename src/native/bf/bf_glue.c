/*
 * bf_glue.c: the seam between the simulator and the vendored Betaflight
 * sources, compiled against the real Betaflight headers with the SITL
 * target configuration.
 *
 * Everything with control feel in it is Betaflight's own compiled code:
 * updateRcCommands and processRcCommand (rc command handling and the
 * rates curves), pidController (PID, D term filtering, feedforward,
 * iterm relax, anti gravity, TPA), and mixTable (mixer and airmode).
 * This file only feeds the simulated gyro in, pushes stick samples into
 * rcData, applies parsed CLI diff values onto the real parameter group
 * structs, and reads the motor outputs back out. The few driver layer
 * symbols Betaflight expects (motor endpoint conversion, a handful of
 * externs that normally live in files we do not compile) are provided
 * here; that is the hardware abstraction seam STAGE1.md says to stub.
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

#include "platform.h"

#include <string.h>

#include "common/axis.h"
#include "common/maths.h"
#include "config/config.h"
#include "config/feature.h"
#include "fc/controlrate_profile.h"
#include "fc/rc.h"
#include "fc/rc_controls.h"
#include "fc/rc_modes.h"
#include "fc/runtime_config.h"
#include "flight/mixer.h"
#include "flight/mixer_init.h"
#include "flight/pid.h"
#include "flight/pid_init.h"
#include "pg/motor.h"
#include "pg/rx.h"
#include "rx/rx.h"
#include "sensors/gyro.h"

extern uint32_t sim_bf_now_ms;

#include "../sim_abi.h"
#include "../sim_internal.h"

/* Externs Betaflight expects from files we do not compile. */
gyro_t gyro;
float rcData[MAX_SUPPORTED_RC_CHANNEL_COUNT];
struct pidProfile_s *currentPidProfile;

/* Betaflight parameter group reset helpers we call directly instead of
 * walking the pg registry (config/config.c stays uncompiled). */
extern void pgResetFn_controlRateProfiles(controlRateConfig_t *controlRateConfig);
extern void pgResetFn_rxConfig(rxConfig_t *rxConfig);
extern void pgResetFn_motorConfig(motorConfig_t *motorConfig);

static int str_eq2(const char *a, const char *b) { return strcmp(a, b) == 0; }

/* Driver layer stubs: linear 1000 to 2000 endpoints, no dshot device. */
void motorInitEndpoints(const motorConfig_t *motorConfig, float outputLimit,
                        float *outputLow, float *outputHigh, float *disarm,
                        float *deadbandMotor3DHigh, float *deadbandMotor3DLow) {
  (void)motorConfig;
  const float low = 1000.0f + 1000.0f * 0.055f * 0.0f; /* idle handled by dynIdle off */
  *outputLow = low + (2000.0f - low) * 0.055f;
  *outputHigh = 2000.0f * outputLimit;
  *disarm = 1000.0f;
  *deadbandMotor3DHigh = 1500.0f;
  *deadbandMotor3DLow = 1500.0f;
}

float motorConvertFromExternal(uint16_t externalValue) { return externalValue; }
uint16_t motorConvertToExternal(float motorValue) {
  if (motorValue < 0.0f) {
    return 0;
  }
  return (uint16_t)motorValue;
}
bool motorIsEnabled(void) { return true; }
bool motorIsMotorEnabled(uint8_t index) { (void)index; return true; }

void bf_config_begin(void) {
  memset(&gyro, 0, sizeof(gyro));
  memset(rcData, 0, sizeof(rcData));

  pgResetFn_controlRateProfiles(controlRateProfilesMutable(0));
  pgResetFn_rxConfig(rxConfigMutable());
  pgResetFn_motorConfig(motorConfigMutable());
  resetPidProfile(pidProfilesMutable(0));

  currentPidProfile = pidProfilesMutable(0);
  currentControlRateProfile = controlRateProfilesMutable(0);

  /* Simulator posture: quad X, airmode always on. RC smoothing is left at
   * the Betaflight default and must stay on: getFeedforward returns the
   * smoothed value, so disabling it silently zeroes feedforward on every
   * axis. That bug cost a tuning session; see PROGRESS.md. */
  mixerConfigMutable()->mixerMode = MIXER_QUADX;
  mixerConfigMutable()->yaw_motors_reversed = false;
  featureConfigMutable()->enabledFeatures = FEATURE_AIRMODE;
}

int bf_config_apply_setting(const char *key, const char *value, double num,
                            int have_num) {
  controlRateConfig_t *rates = controlRateProfilesMutable(0);
  pidProfile_t *pid = pidProfilesMutable(0);

  if (str_eq2(key, "rates_type")) {
    if (str_eq2(value, "BETAFLIGHT")) {
      rates->rates_type = RATES_TYPE_BETAFLIGHT;
    } else if (str_eq2(value, "RACEFLIGHT")) {
      rates->rates_type = RATES_TYPE_RACEFLIGHT;
    } else if (str_eq2(value, "KISS")) {
      rates->rates_type = RATES_TYPE_KISS;
    } else if (str_eq2(value, "ACTUAL")) {
      rates->rates_type = RATES_TYPE_ACTUAL;
    } else if (str_eq2(value, "QUICK")) {
      rates->rates_type = RATES_TYPE_QUICK;
    } else {
      return SIM_ERR_CONFIG_PARSE;
    }
    return SIM_OK;
  }

  if (!have_num) {
    /* Word valued keys we do not map are accepted and ignored. */
    return SIM_OK;
  }
  const int n = (int)num;

  if (str_eq2(key, "roll_rc_rate")) { rates->rcRates[FD_ROLL] = n; return SIM_OK; }
  if (str_eq2(key, "pitch_rc_rate")) { rates->rcRates[FD_PITCH] = n; return SIM_OK; }
  if (str_eq2(key, "yaw_rc_rate")) { rates->rcRates[FD_YAW] = n; return SIM_OK; }
  if (str_eq2(key, "roll_expo")) { rates->rcExpo[FD_ROLL] = n; return SIM_OK; }
  if (str_eq2(key, "pitch_expo")) { rates->rcExpo[FD_PITCH] = n; return SIM_OK; }
  if (str_eq2(key, "yaw_expo")) { rates->rcExpo[FD_YAW] = n; return SIM_OK; }
  if (str_eq2(key, "roll_srate")) { rates->rates[FD_ROLL] = n; return SIM_OK; }
  if (str_eq2(key, "pitch_srate")) { rates->rates[FD_PITCH] = n; return SIM_OK; }
  if (str_eq2(key, "yaw_srate")) { rates->rates[FD_YAW] = n; return SIM_OK; }
  if (str_eq2(key, "thr_mid")) { rates->thrMid8 = n; return SIM_OK; }
  if (str_eq2(key, "thr_expo")) { rates->thrExpo8 = n; return SIM_OK; }

  if (str_eq2(key, "p_roll")) { pid->pid[PID_ROLL].P = n; return SIM_OK; }
  if (str_eq2(key, "i_roll")) { pid->pid[PID_ROLL].I = n; return SIM_OK; }
  if (str_eq2(key, "d_roll")) { pid->pid[PID_ROLL].D = n; return SIM_OK; }
  if (str_eq2(key, "f_roll")) { pid->pid[PID_ROLL].F = n; return SIM_OK; }
  if (str_eq2(key, "p_pitch")) { pid->pid[PID_PITCH].P = n; return SIM_OK; }
  if (str_eq2(key, "i_pitch")) { pid->pid[PID_PITCH].I = n; return SIM_OK; }
  if (str_eq2(key, "d_pitch")) { pid->pid[PID_PITCH].D = n; return SIM_OK; }
  if (str_eq2(key, "f_pitch")) { pid->pid[PID_PITCH].F = n; return SIM_OK; }
  if (str_eq2(key, "p_yaw")) { pid->pid[PID_YAW].P = n; return SIM_OK; }
  if (str_eq2(key, "i_yaw")) { pid->pid[PID_YAW].I = n; return SIM_OK; }
  if (str_eq2(key, "d_yaw")) { pid->pid[PID_YAW].D = n; return SIM_OK; }
  if (str_eq2(key, "f_yaw")) { pid->pid[PID_YAW].F = n; return SIM_OK; }

  /* Anything else is accepted so a full diff loads; the plant consumes
   * battery keys on its own side and the rest are irrelevant to Stage 1. */
  return SIM_OK;
}

static void bf_runtime_init(void) {
  targetPidLooptime = 1000; /* microseconds, matches the 1 kHz plant step */
  gyro.targetLooptime = targetPidLooptime;
  gyro.sampleRateHz = 1000;

  pidInit(currentPidProfile);
  initRcProcessing();
  initEscEndpoints();
  mixerInit(mixerConfig()->mixerMode);
  mixerInitProfile();
  mixerResetDisarmedMotors();

  ENABLE_ARMING_FLAG(ARMED);
  pidStabilisationState(PID_STABILISATION_ON);
}

int bf_config_finish(void) {
  bf_runtime_init();
  return SIM_OK;
}

/* Debug window into the Betaflight side, exported for harness free
 * inspection from scratch scripts. Not part of the ABI contract. */
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
EMSCRIPTEN_KEEPALIVE
#endif
double sim_bf_debug(int what) {
  switch (what) {
  case 0: return getSetpointRate(FD_YAW);
  case 1: return gyro.gyroADCf[FD_YAW];
  case 2: return pidData[FD_YAW].Sum;
  case 3: return pidData[FD_YAW].I;
  case 4: return pidData[FD_YAW].P;
  case 5: return getSetpointRate(FD_ROLL);
  case 6: return motor[0];
  case 7: return motor[1];
  default: return 0.0;
  }
}

/*
 * Betaflight initialises its rc smoothing filters only after 1 s of
 * powered on time with a valid rx link (fc/rc.c: ready = millis() > 1000).
 * Until then getFeedforward returns zero, so a freshly reset craft would
 * fly its first second with no feedforward at all and a different feel.
 * A pilot's quad has been powered for minutes before they take off, so
 * reset runs the receiver path forward on the simulated clock with
 * centred sticks until those filters are live, then flight time continues
 * from the same offset. Deterministic: every reset does exactly this.
 */
#define BF_WARMUP_MS 2600
#define BF_WARMUP_FRAME_MS 4

void bridge_reset(void) {
  /* Fresh controller state for a fresh trajectory: re run the init chain
   * so PID integrators, filters and rc state start identically. */
  memset(&gyro, 0, sizeof(gyro));
  memset(rcData, 0, sizeof(rcData));
  for (int i = 0; i < 4; i += 1) {
    rcData[i] = (i == THROTTLE) ? 1000.0f : 1500.0f;
  }
  bf_runtime_init();

  for (uint32_t ms = BF_WARMUP_FRAME_MS; ms <= BF_WARMUP_MS; ms += BF_WARMUP_FRAME_MS) {
    sim_bf_now_ms = ms;
    updateRcRefreshRate((timeUs_t)ms * 1000);
    updateRcCommands();
    processRcCommand();
  }
  pidResetIterm();
}

#define SIM_RAD_TO_DEG 57.29577951308232

void bridge_run(const SimState *s, const double rc[4], int rx_new,
                double duty[SIM_MOTOR_COUNT]) {
  /* Simulated gyro in Betaflight's internal axis polarity, derived from
   * the quad X mixer table and the firmware's own channel handling, and
   * confirmed against closed loop behaviour: internal positive roll is
   * roll right (+p here), internal positive pitch is nose DOWN (+q here),
   * internal positive yaw is nose LEFT (+r here). Values in deg/s.
   * Getting pitch or yaw backwards turns that loop into positive
   * feedback; both failures are recorded in PROGRESS.md. */
  gyro.gyroADCf[FD_ROLL] = (float)(s->omega[0] * SIM_RAD_TO_DEG);
  gyro.gyroADCf[FD_PITCH] = (float)(s->omega[1] * SIM_RAD_TO_DEG);
  gyro.gyroADCf[FD_YAW] = (float)(s->omega[2] * SIM_RAD_TO_DEG);

  /* Stick channels from sim_abi.h: +roll right, +pitch nose up, +yaw nose
   * right. Betaflight internal pitch is nose down positive, so the pitch
   * channel inverts here, exactly once, at this seam. The yaw channel is
   * already inverted inside updateRcCommands (high channel gives a
   * negative internal yaw setpoint, nose right), which matches the ABI
   * direction, so yaw passes straight through. */
  rcData[ROLL] = (float)(1500.0 + 500.0 * rc[0]);
  rcData[PITCH] = (float)(1500.0 - 500.0 * rc[1]);
  rcData[YAW] = (float)(1500.0 + 500.0 * rc[2]);
  double thr = rc[3];
  if (thr < 0.0) {
    thr = 0.0;
  }
  if (thr > 1.0) {
    thr = 1.0;
  }
  rcData[THROTTLE] = (float)(1000.0 + 1000.0 * thr);

  /* Flight time continues from the warm up offset so the receiver clock
   * stays monotonic across reset. */
  sim_bf_now_ms = (uint32_t)(BF_WARMUP_MS + s->step_index);
  const timeUs_t now_us = (timeUs_t)((BF_WARMUP_MS + s->step_index) * 1000);

  /* Faithful flight controller wiring: the receiver path runs at the RC
   * frame rate, the PID loop at 1 kHz. updateRcCommands is what raises
   * isRxDataNew, so calling it only on frames is what makes Betaflight's
   * rc smoothing interpolate and its feedforward see real packet
   * intervals. processRcCommand runs every step so the smoothing filter
   * advances at loop rate, exactly as on hardware.
   *
   * updateRcRefreshRate must be called on frames too: without it the
   * feedforward path divides by a zero rx interval and poisons the whole
   * state with NaN. */
  if (rx_new) {
    updateRcRefreshRate(now_us);
    updateRcCommands();
  }
  processRcCommand();
  pidUpdateTpaFactor((float)thr);
  pidController(currentPidProfile, now_us);
  mixTable(now_us);

  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    double d = ((double)motor[m] - 1000.0) / 1000.0;
    if (d < 0.0) {
      d = 0.0;
    }
    if (d > 1.0) {
      d = 1.0;
    }
    duty[m] = d;
  }
}
