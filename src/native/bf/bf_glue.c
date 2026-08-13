/*
 * bf_glue.c: the seam between the simulator and the vendored Betaflight
 * sources, compiled against the real Betaflight headers with the SITL
 * target configuration.
 *
 * Everything with control feel in it is Betaflight's own compiled code:
 * gyroUpdate and gyroFiltering (the gyro filter chain, lpf1, lpf2, the
 * static notches and the dynamic lpf), updateRcCommands and
 * processRcCommand (rc command handling, the rates curves and rc
 * smoothing), pidController (PID, D term filtering, feedforward, iterm
 * relax, anti gravity, TPA, D max), mixTable (mixer, airmode, throttle
 * boost, thrust linearisation) and applySimplifiedTuning (the slider
 * tuning the published race presets are written in).
 *
 * This file only provides the hardware abstraction layer STAGE1.md says
 * to stub: a gyro device read that returns the simulated body rates as
 * 16 bit counts exactly as Betaflight's own SITL target does, the motor
 * endpoint arithmetic that normally lives in drivers/dshot.c, and the
 * battery sag reading. Config keys are applied by bf_settings.c against
 * the real parameter group structs.
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

#include <math.h>
#include <string.h>

#include "common/axis.h"
#include "common/maths.h"
#include "config/config.h"
#include "config/feature.h"
#include "drivers/accgyro/accgyro.h"
#include "build/debug.h"
#include "drivers/dshot.h"
#include "drivers/dshot_command.h"
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
#include "sensors/gyro_init.h"

extern uint32_t sim_bf_now_ms;
extern uint16_t sim_bf_sag_cell_cv;

#include "../sim_abi.h"
#include "../sim_internal.h"
#include "bf_settings.h"

/* Externs Betaflight expects from files we do not compile. gyro itself is
 * no longer here: sensors/gyro.c defines it now, and defines it because
 * this build compiles the real filter chain rather than writing filtered
 * rates straight into gyroADCf. */
float rcData[MAX_SUPPORTED_RC_CHANNEL_COUNT];
struct pidProfile_s *currentPidProfile;

/* Betaflight parameter group reset helpers we call directly instead of
 * walking the pg registry (config/config.c stays uncompiled). */
extern void pgResetFn_controlRateProfiles(controlRateConfig_t *controlRateConfig);
extern void pgResetFn_rxConfig(rxConfig_t *rxConfig);
extern void pgResetFn_motorConfig(motorConfig_t *motorConfig);
extern void pgResetFn_mixerConfig(mixerConfig_t *mixerConfig);
extern void pgResetFn_gyroConfig(gyroConfig_t *gyroConfig);
extern const pidConfig_t pgResetTemplate_pidConfig;

/*
 * ---- The gyro device ----
 *
 * Betaflight's own SITL target hands its flight controller int16 counts at
 * the 2000 deg/s full scale (target/SITL/sitl.c, virtualGyroSet), so the
 * firmware sees the same quantisation a real 16 bit gyro gives it. This
 * read function is that driver. Everything above it, the alignment, the
 * downsample into gyro.sampleSum and the whole filter chain, is
 * Betaflight's compiled code.
 */
static float g_gyro_dps[XYZ_AXIS_COUNT];

static bool sim_gyro_read(gyroDev_t *dev) {
  for (int a = 0; a < XYZ_AXIS_COUNT; a += 1) {
    float counts = g_gyro_dps[a] / GYRO_SCALE_2000DPS;
    if (counts > 32767.0f) {
      counts = 32767.0f;
    }
    if (counts < -32768.0f) {
      counts = -32768.0f;
    }
    dev->gyroADCRaw[a] = (int16_t)lrintf(counts);
  }
  return true;
}

/*
 * ---- The motor driver ----
 *
 * Mirrors drivers/dshot.c dshotInitEndpoints and drivers/motor.c
 * getDigitalIdleOffset, which is what a DShot ESC does with
 * motor_output_limit and dshot_idle_value. Modelling DShot rather than
 * analogue PWM is deliberate: it is what a 5 inch race quad runs, and it
 * is the only way `set dshot_idle_value` in a preset can mean anything.
 * The previous version hardcoded a 5.5 percent idle and ignored both
 * settings.
 */
float getDigitalIdleOffset(const motorConfig_t *motorConfig) {
  return CONVERT_PARAMETER_TO_PERCENT(motorConfig->digitalIdleOffsetValue * 0.01f);
}

void motorInitEndpoints(const motorConfig_t *motorConfig, float outputLimit,
                        float *outputLow, float *outputHigh, float *disarm,
                        float *deadbandMotor3DHigh, float *deadbandMotor3DLow) {
  const float outputLimitOffset = DSHOT_RANGE * (1.0f - outputLimit);
  *disarm = DSHOT_CMD_MOTOR_STOP;
  *outputLow = DSHOT_MIN_THROTTLE + getDigitalIdleOffset(motorConfig) * DSHOT_RANGE;
  *outputHigh = DSHOT_MAX_THROTTLE - outputLimitOffset;
  *deadbandMotor3DHigh = DSHOT_3D_FORWARD_MIN_THROTTLE;
  *deadbandMotor3DLow = DSHOT_3D_FORWARD_MIN_THROTTLE - 1;
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
  pgResetFn_mixerConfig(mixerConfigMutable());
  pgResetFn_gyroConfig(gyroConfigMutable());
  *pidConfigMutable() = pgResetTemplate_pidConfig;
  resetPidProfile(pidProfilesMutable(0));

  currentPidProfile = pidProfilesMutable(0);
  currentControlRateProfile = controlRateProfilesMutable(0);

  /* Simulator posture: quad X, airmode always on. RC smoothing is left at
   * the Betaflight default and must stay on: getFeedforward returns the
   * smoothed value, so disabling it silently zeroes feedforward on every
   * axis. That bug cost a tuning session; see PROGRESS.md. */
  mixerConfigMutable()->mixerMode = MIXER_QUADX;
  featureConfigMutable()->enabledFeatures = FEATURE_AIRMODE;

  bf_settings_build();
}

int bf_config_apply_setting(const char *key, const char *value, double num,
                            int have_num) {
  return bf_settings_apply(key, value, num, have_num);
}

int bf_config_apply_command(const char *word0, const char *word1) {
  /* `simplified_tuning apply` is a CLI command, not a setting, and the
   * published Karate presets end their PID section with it. Betaflight
   * runs it where it appears, so lines below it still override. */
  if (strcmp(word0, "simplified_tuning") == 0 && strcmp(word1, "apply") == 0) {
    bf_settings_apply_simplified();
    return SIM_OK;
  }
  /* Everything else a diff can carry (batch, board_name, feature, profile,
   * rateprofile, defaults, resource, aux) addresses machinery this module
   * does not have. One profile and one rate profile exist here and both
   * are profile 0. */
  return SIM_OK;
}

static void bf_runtime_init(void) {
  /* CLAUDE.md fixes the loop at 1 kHz. A diff may carry any
   * pid_process_denom; it is stored so it is visible, and forced here so
   * the physics step and the control loop cannot drift apart. */
  pidConfigMutable()->pid_process_denom = 1;
  targetPidLooptime = 1000; /* microseconds, matches the 1 kHz plant step */

  gyro.targetLooptime = targetPidLooptime;
  gyro.sampleLooptime = targetPidLooptime;
  gyro.sampleRateHz = 1000;
  gyro.accSampleRateHz = 1000;
  gyro.gyroToUse = GYRO_CONFIG_USE_GYRO_1;
  gyro.gyroDebugMode = DEBUG_NONE;
  gyro.rawSensorDev = &gyro.gyroSensor1.gyroDev;
  gyro.gyroSensor1.gyroDev.gyroAlign = CW0_DEG;
  gyro.gyroSensor1.gyroDev.scale = GYRO_SCALE_2000DPS;
  gyro.gyroSensor1.gyroDev.readFn = sim_gyro_read;
  gyro.gyroSensor1.calibration.cyclesRemaining = 0;
  gyroInitFilters();

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
  case 8: return getSetpointRate(FD_PITCH);
  case 9: return gyro.gyroADCf[FD_ROLL];
  /* Plant constants for the gate runner, so figure of merit and thrust
   * arithmetic are checked against what is actually compiled in. */
  case 10: return PLANT.kt;
  case 11: return PLANT.kq;
  case 12: {
    const double area = 3.14159265358979 * 0.0635 * 0.0635;
    const double ideal = sim_sqrt_pub(PLANT.kt * PLANT.kt * PLANT.kt) / sim_sqrt_pub(2.0 * PLANT.rho * area);
    return ideal / PLANT.kq;
  }
  /* Config coverage, so scripts/preset-lint.js can fail a shipped preset
   * whose keys stopped reaching Betaflight. */
  case 13: return bf_settings_count(0); /* applied */
  case 14: return bf_settings_count(1); /* inert by design */
  case 15: return bf_settings_count(2); /* unrecognised */
  case 16: return bf_settings_count(3); /* table size */
  /* Live tune readback, so a preset can be proved to have landed. */
  case 17: return currentPidProfile->pid[PID_ROLL].P;
  case 18: return currentPidProfile->pid[PID_ROLL].I;
  case 19: return currentPidProfile->pid[PID_ROLL].D;
  case 20: return currentPidProfile->pid[PID_ROLL].F;
  case 21: return currentPidProfile->d_min[FD_ROLL];
  case 22: return currentPidProfile->tpa_rate;
  case 23: return currentPidProfile->tpa_breakpoint;
  case 24: return currentPidProfile->iterm_relax_cutoff;
  case 25: return gyroConfig()->gyro_lpf1_static_hz;
  case 26: return gyroConfig()->gyro_lpf1_dyn_min_hz;
  case 27: return gyroConfig()->gyro_lpf1_dyn_max_hz;
  case 28: return gyroConfig()->gyro_lpf2_static_hz;
  case 29: return currentPidProfile->dterm_lpf1_dyn_min_hz;
  case 30: return currentPidProfile->dterm_lpf1_dyn_max_hz;
  case 31: return currentPidProfile->throttle_boost;
  case 32: return currentPidProfile->thrustLinearization;
  case 33: return currentPidProfile->pidSumLimitYaw;
  case 34: return currentPidProfile->itermLimit;
  case 35: return currentPidProfile->feedforward_max_rate_limit;
  case 36: return currentPidProfile->motor_output_limit;
  case 37: return motorConfig()->digitalIdleOffsetValue;
  case 38: return currentPidProfile->pid[PID_PITCH].P;
  case 39: return currentPidProfile->pid[PID_PITCH].D;
  case 40: return currentPidProfile->d_min[FD_PITCH];
  case 41: return currentControlRateProfile->rates_type;
  case 42: return currentControlRateProfile->rates[FD_ROLL];
  case 43: return currentPidProfile->vbat_sag_compensation;
  case 44: return currentPidProfile->simplified_pids_mode;
  case 45: return currentPidProfile->dterm_lpf1_dyn_expo;
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
  for (int a = 0; a < XYZ_AXIS_COUNT; a += 1) {
    g_gyro_dps[a] = 0.0f;
  }
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
  g_gyro_dps[FD_ROLL] = (float)(s->omega[0] * SIM_RAD_TO_DEG);
  g_gyro_dps[FD_PITCH] = (float)(s->omega[1] * SIM_RAD_TO_DEG);
  g_gyro_dps[FD_YAW] = (float)(s->omega[2] * SIM_RAD_TO_DEG);

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

  /* Pack voltage under load, in hundredths of a volt, which is what
   * Betaflight's battery monitor publishes and what vbat_sag_compensation
   * reads. It was a frozen 4.20 V before, so the compensation was a
   * no-op no matter what the pack was doing. */
  {
    double cv = (s->vbat_load / PLANT.cells) * 100.0;
    if (cv < 0.0) {
      cv = 0.0;
    }
    if (cv > 65535.0) {
      cv = 65535.0;
    }
    sim_bf_sag_cell_cv = (uint16_t)(cv + 0.5);
  }

  /* Flight time continues from the warm up offset so the receiver clock
   * stays monotonic across reset. */
  sim_bf_now_ms = (uint32_t)(BF_WARMUP_MS + s->step_index);
  const timeUs_t now_us = (timeUs_t)((BF_WARMUP_MS + s->step_index) * 1000);

  /* Faithful flight controller wiring, in fc/core.c's own order:
   * gyro sample, gyro filter, rc command, PID, mixer.
   *
   * The receiver path runs at the RC frame rate and the PID loop at
   * 1 kHz. updateRcCommands is what raises isRxDataNew, so calling it
   * only on frames is what makes Betaflight's rc smoothing interpolate
   * and its feedforward see real packet intervals. processRcCommand runs
   * every step so the smoothing filter advances at loop rate, exactly as
   * on hardware.
   *
   * updateRcRefreshRate must be called on frames too: without it the
   * feedforward path divides by a zero rx interval and poisons the whole
   * state with NaN. */
  gyroUpdate();
  gyroFiltering(now_us);

  if (rx_new) {
    updateRcRefreshRate(now_us);
    updateRcCommands();
  }
  processRcCommand();

  /* TPA and the anti gravity throttle filter are driven by mixTable, from
   * Betaflight's own scaled throttle and one loop behind the PID that
   * uses them, which is what fc/core.c's task order produces on hardware.
   * This file used to call pidUpdateTpaFactor with the raw stick value
   * just before pidController, which both used the wrong throttle
   * definition (no throttle limit, no mid/expo curve) and removed the
   * one loop lag. */
  pidController(currentPidProfile, now_us);
  mixTable(now_us);

  /* Betaflight motor output is in DShot units. The ESC's duty is the
   * fraction of the DShot throttle range, which is what the plant's
   * average applied voltage model wants. */
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    double d = ((double)motor[m] - (double)DSHOT_MIN_THROTTLE) / (double)DSHOT_RANGE;
    if (d < 0.0) {
      d = 0.0;
    }
    if (d > 1.0) {
      d = 1.0;
    }
    duty[m] = d;
  }
}
