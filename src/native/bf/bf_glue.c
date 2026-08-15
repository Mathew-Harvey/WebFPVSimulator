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
 * endpoint arithmetic that normally lives in drivers/dshot.c, the
 * battery sag reading, and (when ANGLE_MODE is on) the plant attitude
 * that pidLevel would otherwise read from the IMU. Config keys are
 * applied by bf_settings.c against the real parameter group structs.
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
#include <stdint.h>
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
#include "flight/imu.h"
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

extern double PLANT_DBG_WASH_DEPTH;
extern double PLANT_DBG_WASH_RATIO;
extern double PLANT_DBG_VA;
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

/*
 * ---- GYRO VIBRATION, WITHOUT WHICH THE WHOLE FILTER CHAIN IS DECORATIVE ----
 *
 * The simulated gyro handed Betaflight the exact body rate. Measured in a
 * steady hover, the filtered gyro moved 0.0016 deg/s from one sample to the
 * next; a real 5 inch sits at 1 to 5 deg/s filtered and 20 to 100 raw. Three
 * things follow from a perfectly clean gyro and all of them are wrong:
 * gyro_lpf and dterm_lpf could only ever cost delay, so the sim rewarded
 * removing filters where a real quad punishes it; D term gain was free, so a
 * tune that felt good here would oscillate on a real machine; and nothing in
 * the model could tell you why anyone soft mounts a stack.
 *
 * WHAT IS MODELLED. Prop and bell imbalance shake the frame, the flight
 * controller is bolted to the frame, and the gyro measures that shake on top
 * of the body rate. So this is added to the SENSOR READING and not to the
 * plant's omega: the airframe is still a rigid body, and the only way the
 * vibration reaches the trajectory is the way it does in life, through the
 * controller reacting to it. Imbalance force goes as rotor speed squared, so
 * the amplitude is scaled by (w / w_full)^2 off the actual motor speeds,
 * which is why it is quiet in a hover and loud on the power.
 *
 * THE BAND. A 1 kHz gyro can represent nothing above 500 Hz, and a real 5
 * inch's prop fundamental is 130 to 430 Hz at 8k to 26k RPM, so the content
 * that matters does fit. It is shaped as a band rather than a line because a
 * real spectrum is a broad hump: four rotors at slightly different speeds,
 * plus frame modes, is not a tone. Same one pole pair the propwash uses,
 * 80 to 350 Hz, coefficients 1 - exp(-2 pi f dt) at dt = 1 ms.
 *
 * THE AMPLITUDE is set against the FILTERED figure, because that is what a
 * real blackbox log reports and so the only one that can be compared. A good
 * 5 inch reads 1 to 3 deg/s RMS of filtered gyro around cruise and 3 to 6 on
 * the power. 12 deg/s of raw injection overshot that, measuring 4.21 at 55
 * percent throttle and 7.35 at full; 8.0 lands at 2.8 and 4.9. A tired set of
 * props runs several times either figure. Yaw is taken at 0.6 of roll and
 * pitch because the frame is stiffer in that direction. On top sits a
 * 0.2 deg/s floor for the sensor itself, roughly an ICM-42688 over a 500 Hz
 * bandwidth.
 *
 * The RMS divisor is MEASURED, not estimated: 0.340474 over eight million
 * samples of this exact recursion, peak 2.92 sigma, so unlike the propwash
 * channel it needs no clamp. The propwash comment records what happens when
 * that number is guessed instead.
 *
 * DETERMINISM. Its own xorshift32 seed, integer operations only, reset with
 * the rest of the controller state in bridge_reset.
 */
#define GYRO_VIB_A_HI 0.889099
#define GYRO_VIB_A_LO 0.395077
#define GYRO_VIB_RMS 0.340474
#define GYRO_VIB_FULL_DPS 8.0
#define GYRO_VIB_REF_W 2700.0
#define GYRO_VIB_YAW_SHARE 0.6
#define GYRO_NOISE_FLOOR_DPS 0.20

static unsigned int g_vib_seed;
static double g_vib_fast[XYZ_AXIS_COUNT];
static double g_vib_slow[XYZ_AXIS_COUNT];

static double sim_vib_noise(void) {
  unsigned int x = g_vib_seed;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  g_vib_seed = x;
  /* 24 bits to a double in -1..1, exactly representable. */
  return ((double)(x >> 8)) * (1.0 / 8388608.0) - 1.0;
}

static void sim_gyro_add_vibration(const SimState *s) {
  double w_sum = 0.0;
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    w_sum += s->motor_omega[m];
  }
  const double w_mean = w_sum * 0.25;
  const double ratio = w_mean / GYRO_VIB_REF_W;
  const double amp = GYRO_VIB_FULL_DPS * ratio * ratio;
  for (int a = 0; a < XYZ_AXIS_COUNT; a += 1) {
    /* Run the channel every step regardless of throttle, so spooling up does
     * not restart the vibration mid flight. */
    g_vib_fast[a] += GYRO_VIB_A_HI * (sim_vib_noise() - g_vib_fast[a]);
    g_vib_slow[a] += GYRO_VIB_A_LO * (g_vib_fast[a] - g_vib_slow[a]);
    const double band = (g_vib_fast[a] - g_vib_slow[a]) / GYRO_VIB_RMS;
    const double axis = (a == FD_YAW) ? GYRO_VIB_YAW_SHARE : 1.0;
    g_gyro_dps[a] += (float)(band * (amp * axis + GYRO_NOISE_FLOOR_DPS));
  }
}

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

  /* Simulator posture: quad X, airmode and anti gravity on. RC smoothing is
   * left at the Betaflight default and must stay on: getFeedforward returns
   * the smoothed value, so disabling it silently zeroes feedforward on every
   * axis. That bug cost a tuning session; see PROGRESS.md.
   *
   * FEATURE_ANTI_GRAVITY is in this list because Betaflight's own default is
   * FEATURE_ANTI_GRAVITY | FEATURE_AIRMODE (config/feature.c). Assigning only
   * airmode here cleared it, so anti_gravity_gain was inert no matter what a
   * preset said: three traces at gain 0, 80 and 250 hashed identically.
   * Setting the bit is only half of it; see bf_runtime_init. */
  mixerConfigMutable()->mixerMode = MIXER_QUADX;
  featureConfigMutable()->enabledFeatures = FEATURE_AIRMODE | FEATURE_ANTI_GRAVITY;

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
  /*
   * `feature NAME` and `feature -NAME`, which is how a diff carries its
   * feature set. This was discarded, so a preset could not switch airmode or
   * anti gravity even though both change how the craft flies and both are
   * compiled in. Only the two features whose subsystems this module actually
   * has are honoured; every other name addresses machinery that is not here,
   * which is the same policy bf_settings.c applies to inert keys.
   */
  if (strcmp(word0, "feature") == 0 && word1[0] != 0) {
    const char *name = word1;
    int on = 1;
    if (name[0] == '-') {
      on = 0;
      name += 1;
    }
    uint32_t bit = 0;
    if (strcmp(name, "AIRMODE") == 0) {
      bit = FEATURE_AIRMODE;
    } else if (strcmp(name, "ANTI_GRAVITY") == 0) {
      bit = FEATURE_ANTI_GRAVITY;
    }
    if (bit != 0) {
      if (on) {
        featureConfigMutable()->enabledFeatures |= bit;
      } else {
        featureConfigMutable()->enabledFeatures &= ~bit;
      }
    }
    return SIM_OK;
  }
  /* Everything else a diff can carry (batch, board_name, profile,
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

  /*
   * THE TWO FEATURE FLAGS THAT DO NOTHING UNTIL SOMETHING RUNS THEM.
   *
   * Setting a bit in enabledFeatures is not what turns a Betaflight feature
   * on. Two of them are latched into runtime state by fc/core.c, which this
   * build does not compile, so both sat off for the whole of this project's
   * life while the config said they were on.
   *
   * Airmode: mixer.c asks airmodeIsEnabled(), which returns a static in
   * rc_modes.c written only by updateActivatedModes(). With it false,
   * applyMixerAdjustment scales roll and pitch mix authority by
   * scaleRangef(throttle, 0, 0.5, 0.5, 1.0), so the craft had between 52 and
   * 100 percent of its authority depending on where the throttle stick was.
   * Measured on the mixer: peak split 0.472 duty at 2 percent throttle and
   * 0.945 above half, tracing that ramp exactly. A full roll step at 25
   * percent throttle rose to 90 percent in 59 ms against 45 ms at 55 percent.
   * That is the mushiness on a chop, and it is not what a real quad does.
   *
   * Anti gravity: pidRuntime.antiGravityEnabled is set only by
   * pidSetAntiGravityState from core.c. It is called here with the same
   * expression core.c uses, minus the aux switch this build has no channels
   * for. Must come after pidInit, which owns pidRuntime.
   *
   * And featureInit, which is the link that made the first attempt at this
   * fix change nothing at all. featureIsEnabled reads runtimeFeatureMask, a
   * static that only featureInit copies enabledFeatures into; fc/init.c calls
   * it on hardware and nothing called it here, so the mask was zero and every
   * feature in this build has always read as off. Assigning FEATURE_AIRMODE
   * in bf_config_begin was therefore never enough on its own.
   *
   * updateActivatedModes is Betaflight's own function rather than a local
   * assignment so that aux driven modes work unchanged the day this build
   * gets aux channels. With no mode activation conditions analysed its loops
   * are empty and it reduces to the airmode line.
   */
  featureInit();
  updateActivatedModes();
  pidSetAntiGravityState(featureIsEnabled(FEATURE_ANTI_GRAVITY));
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
  /* Propwash diagnostics from plant.c, motor 0. */
  case 46: return PLANT_DBG_WASH_DEPTH;
  case 47: return PLANT_DBG_WASH_RATIO;
  case 48: return PLANT_DBG_VA;
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

/*
 * ANGLE MODE, kept off the acro path.
 *
 * Betaflight already compiled pidLevel into this module. ANGLE_MODE is
 * the same flag a radio aux switch raises; pidController then replaces
 * the roll and pitch rate setpoints with the level-mode output and leaves
 * the inner PID, the mixer and the plant alone. The IMU is stubbed for
 * acro, so the only extra work is feeding attitude and raising the flag.
 *
 * Attitude comes from the plant quaternion, not from compiling imu.c.
 * That is Betaflight SITL's own choice when USE_IMU_CALC is off: the
 * simulator knows the pose, so the AHRS is skipped. Pitch is written in
 * the gyro frame (nose down positive), which is what sitl.c does with
 * `imuSetAttitudeRPY(xf, -yf, zf)` and the comment "yes! pitch was
 * inverted!!". Roll is right-wing-down positive, matching +p.
 *
 * g_angle_mode defaults to 0. The harness never calls sim_set_angle_mode,
 * so the acro trajectory does not run atan2 or touch flightModeFlags.
 */
static int g_angle_mode = 0;

static int16_t bf_deci_deg(float rad) {
  float d = rad * (1800.0f / M_PIf);
  if (d > 1800.0f) {
    d = 1800.0f;
  }
  if (d < -1800.0f) {
    d = -1800.0f;
  }
  return (int16_t)lrintf(d);
}

static void bf_feed_attitude(const SimState *s) {
  const float w = (float)s->quat[0];
  const float x = (float)s->quat[1];
  const float y = (float)s->quat[2];
  const float z = (float)s->quat[3];
  /* World-up in the body frame. Plant quat is body to world, z up, y left. */
  const float ux = 2.0f * (x * z - w * y);
  const float uy = 2.0f * (y * z + w * x);
  const float uz = 1.0f - 2.0f * (x * x + y * y);
  const float horiz = __builtin_sqrtf(uy * uy + uz * uz);
  attitude.values.roll = bf_deci_deg(atan2_approx(uy, uz));
  attitude.values.pitch = bf_deci_deg(atan2_approx(-ux, horiz));
}

static void bf_apply_angle_mode_flag(void) {
  if (g_angle_mode) {
    flightModeFlags |= ANGLE_MODE;
  } else {
    flightModeFlags &= (uint16_t)~ANGLE_MODE;
  }
}

void bridge_set_angle_mode(int on) {
  g_angle_mode = on ? 1 : 0;
  bf_apply_angle_mode_flag();
}

void bridge_reset(void) {
  /* Fresh controller state for a fresh trajectory: re run the init chain
   * so PID integrators, filters and rc state start identically. */
  memset(&gyro, 0, sizeof(gyro));
  memset(rcData, 0, sizeof(rcData));
  for (int a = 0; a < XYZ_AXIS_COUNT; a += 1) {
    g_gyro_dps[a] = 0.0f;
    g_vib_fast[a] = 0.0;
    g_vib_slow[a] = 0.0;
  }
  /* Any non zero constant seeds xorshift32; fixed, which is the point. */
  g_vib_seed = 0x2545F491u;
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
  /* Reset does not clear the shell's requested mode. Re-apply after the
   * init chain so a craft that was in angle stays in angle. */
  bf_apply_angle_mode_flag();
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
  sim_gyro_add_vibration(s);

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

  /* Angle mode only. Acro never enters: g_angle_mode stays 0, attitude
   * stays untouched, pidLevel is not reached. */
  if (g_angle_mode) {
    bf_apply_angle_mode_flag();
    bf_feed_attitude(s);
  }

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
