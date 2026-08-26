/*
 * bf_glue.c: the seam between the simulator and the vendored Betaflight
 * sources, compiled against the real Betaflight headers with the SITL
 * target configuration.
 *
 * patches/0001 switches on the dynamic notch, the RPM filter and dynamic
 * idle for this target. All three are gated on DShot telemetry upstream,
 * which this build has no driver for and does not need: the plant knows every
 * rotor's speed exactly, and getMotorFrequencyHz below hands it over through
 * the same lag a real telemetry stream carries. Of the three, the RPM filter
 * and dynamic idle run; the dynamic notch declines to arm below a 2 kHz loop,
 * which is Betaflight's own rule and would apply to a real quad at this loop
 * rate too.
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
#include "flight/dyn_notch_filter.h"
#include "flight/mixer.h"
#include "flight/mixer_init.h"
#include "flight/pid.h"
#include "flight/pid_init.h"
#include "flight/rpm_filter.h"
#include "pg/motor.h"
#include "pg/rx.h"
#include "rx/rx.h"
#include "sensors/gyro.h"
#include "sensors/gyro_init.h"
#include "sensors/sensors.h"
#include "fc/core.h"

extern uint32_t sim_bf_now_us;
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
extern const dynNotchConfig_t pgResetTemplate_dynNotchConfig;
extern const rpmFilterConfig_t pgResetTemplate_rpmFilterConfig;

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
 * TWO PARTS, AND THE FIRST ONE IS THE POINT.
 *
 * Prop and bell imbalance is a once per revolution force, so it is a LINE at
 * each rotor's own frequency, not a hump. That matters beyond realism: a line
 * is what a dynamic notch hunts and what an RPM filter is aimed at, and a
 * model that only emits broadband hash gives neither of them anything to do.
 * Four rotors at four slightly different speeds put four moving lines in the
 * spectrum, which is exactly what a blackbox spectrogram of a real quad looks
 * like. Each is generated at its rotor's true frequency by integrating its
 * own phase, and the four carry different imbalance factors because no two
 * props are balanced alike. A rotating imbalance is inherently quadrature
 * between the two in plane axes, so roll takes the sine and pitch the cosine
 * of the same phase; yaw takes less, at 0.5, because the frame is stiffer
 * about that axis and it reaches the gyro through plate bending rather than
 * directly. That last split is a coupling model, not a derived modal
 * response, and is the one part of this that is chosen rather than physical.
 *
 * A 1 kHz gyro can represent nothing above 500 Hz. The prop fundamental runs
 * 130 Hz at idle to 426 Hz at full throttle, so the whole range fits under
 * Nyquist with room to spare. Blade passing at three times that does not, and
 * is not modelled: imbalance is once per rev and that is the term that
 * dominates a real spectrum anyway.
 *
 * The second part is a broad 80 to 350 Hz hump for frame modes and general
 * airframe hash, on the same one pole pair the propwash uses, coefficients
 * 1 - exp(-2 pi f dt) at dt = 1 ms.
 *
 * THE AMPLITUDE is set against the FILTERED figure, because that is what a
 * real blackbox log reports and so the only one that can be compared. A good
 * 5 inch reads 1 to 3 deg/s RMS of filtered gyro around cruise and 3 to 6 on
 * the power. 12 deg/s of broadband injection overshot that, measuring 4.21 at
 * 55 percent throttle and 7.35 at full. 5.0 of hump plus 3.0 of line still
 * read as a loose, unbalanced machine at full throttle on the sticks, which
 * a pilot flying this build named as too much shake rather than as a tight
 * race quad. 1.5 of hump and 0.8 of line was about a third of that energy:
 * the spectrum is still there for the filters to work on, the pad is still
 * not silent, and the video no longer swims on a punch. A tired set of
 * props runs several times either figure. On top sits a floor for the
 * sensor itself; 0.2 deg/s is roughly an ICM-42688 over a 500 Hz bandwidth.
 *
 * RAISED ONE SUBTLE STEP, owner's request, 2026-08-24. The Crapshack tune
 * entry recorded why maxed sliders feel too perfect here: the tunes real
 * quads fly pay for headroom against noise this gyro barely has. Measured
 * on the build before this change, filtered gyro noise RMS with the body
 * truth subtracted read 0.16 deg/s in the hover, 0.45 at 55 percent and
 * 1.03 at full throttle, a fifth to a sixth of the real quad band above.
 * The step is 1.5 to 2.0 of hump, 0.8 to 1.0 of line and 0.20 to 0.30 of
 * floor, about forty percent more energy, chosen deliberately small: the
 * last time these numbers moved it was DOWN, from a pilot calling 5.0 and
 * 3.0 too much shake, and the instruction here is to start subtle and let
 * the pilot say more. The floor matters most of the three at low stick,
 * where the D term lives; 0.30 is still inside what a 42688 reads at its
 * wider bandwidth settings on a warm board.
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
#define GYRO_VIB_FULL_DPS 2.0
#define GYRO_VIB_LINE_DPS 1.0
#define GYRO_VIB_REF_W 2700.0
#define GYRO_VIB_YAW_SHARE 0.6
#define GYRO_VIB_LINE_YAW_SHARE 0.5
#define GYRO_NOISE_FLOOR_DPS 0.30

/* Per rotor imbalance, as a multiple of the nominal line amplitude. No two
 * props are balanced alike and identical values would put four lines exactly
 * on top of each other whenever the motors happened to match. */
static const double GYRO_VIB_IMBALANCE[SIM_MOTOR_COUNT] = { 1.00, 0.78, 1.24, 0.92 };
/* Fixed phase offsets, radians, so the four lines do not start aligned. */
static const double GYRO_VIB_PHASE0[SIM_MOTOR_COUNT] = { 0.0, 1.9, 3.6, 5.1 };

static unsigned int g_vib_seed;
static double g_vib_fast[XYZ_AXIS_COUNT];
static double g_vib_slow[XYZ_AXIS_COUNT];
static double g_vib_phase[SIM_MOTOR_COUNT];

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
  static const double TWO_PI = 6.283185307179586;
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
    /* Arcade reads a perfect gyro. The channel and the seed still advance
     * above, same rule as the propwash field: only the injection is gated,
     * so flipping the style between runs cannot cold start a filter. */
    if (!SIM_ARCADE) {
      g_gyro_dps[a] += (float)(band * (amp * axis + GYRO_NOISE_FLOOR_DPS));
    }
  }
  /* One imbalance line per rotor, at that rotor's own frequency. Phase is
   * integrated rather than derived from a step count so it stays correct
   * while the motor speed changes, which is the whole point of it: the line
   * has to slide up the spectrum with the throttle for a dynamic notch or an
   * RPM filter to have anything to track. */
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    const double w = s->motor_omega[m];
    double p = g_vib_phase[m] + w * SIM_DT;
    /* One conditional wrap is enough: the step advance is at most 2.8 rad. */
    if (p > TWO_PI) {
      p -= TWO_PI;
    }
    g_vib_phase[m] = p;
    const double r = w / GYRO_VIB_REF_W;
    const double a_line = GYRO_VIB_LINE_DPS * r * r * GYRO_VIB_IMBALANCE[m];
    if (a_line < 1e-4 || SIM_ARCADE) {
      continue;
    }
    /* sin_approx wraps to -PI..PI itself and is Betaflight's own compiled
     * polynomial, so this stays inside the no-host-libm rule. */
    const float ph = (float)(p + GYRO_VIB_PHASE0[m]);
    const float sn = sin_approx(ph);
    const float cs = cos_approx(ph);
    g_gyro_dps[FD_ROLL] += (float)a_line * sn;
    g_gyro_dps[FD_PITCH] += (float)a_line * cs;
    g_gyro_dps[FD_YAW] += (float)(a_line * GYRO_VIB_LINE_YAW_SHARE) * sn;
  }
}

/*
 * ---- ROTOR SPEED TELEMETRY ----
 *
 * On hardware these live in drivers/dshot.c and are fed by bidirectional
 * DShot: the ESC sends eRPM back up the signal wire and the flight controller
 * low passes it. The RPM filter aims its notches with them and dynamic idle
 * regulates on them. This build does not compile the DShot driver and does
 * not need to, because the plant knows every rotor's speed exactly.
 *
 * IT IS NOT HANDED OVER PERFECTLY, AND THAT IS DELIBERATE. A real RPM filter
 * chases a number that arrives late: drivers/dshot.c runs each motor's
 * frequency through a PT1 at rpm_filter_lpf_hz, 150 Hz by default, and that
 * lag is why an RPM filter cannot track a fast transient perfectly and why
 * pilots still run a dynamic notch alongside it. Handing over the exact
 * instantaneous speed would make the filter better than any real one and
 * would quietly flatter every tune built against it, so the same PT1 is
 * applied here, read from the same config key.
 *
 * Frequency is mechanical Hz, revolutions per second, which is what
 * getMinMotorFrequencyHz means to dynamic idle's dynIdleMinRps.
 */
static float g_motor_hz[SIM_MOTOR_COUNT];
static float g_motor_hz_min;
static float g_motor_hz_gain = 1.0f;

float getMotorFrequencyHz(uint8_t motorIndex) {
  if (motorIndex >= SIM_MOTOR_COUNT) {
    return 0.0f;
  }
  return g_motor_hz[motorIndex];
}

float getMinMotorFrequencyHz(void) { return g_motor_hz_min; }

static void sim_update_motor_frequency(const SimState *s) {
  const float two_pi = 6.283185307179586f;
  float lo = 1e30f;
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    const float hz = (float)(s->motor_omega[m]) / two_pi;
    g_motor_hz[m] += g_motor_hz_gain * (hz - g_motor_hz[m]);
    if (g_motor_hz[m] < lo) {
      lo = g_motor_hz[m];
    }
  }
  g_motor_hz_min = lo;
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
  *dynNotchConfigMutable() = pgResetTemplate_dynNotchConfig;
  *rpmFilterConfigMutable() = pgResetTemplate_rpmFilterConfig;
  *pidConfigMutable() = pgResetTemplate_pidConfig;
  resetPidProfile(pidProfilesMutable(0));

  currentPidProfile = pidProfilesMutable(0);
  currentControlRateProfile = controlRateProfilesMutable(0);
  /* Race start default: limit forward pitch so a punch does not loop.
   * 0 is Betaflight's own default (no limit). 40 degrees is a typical
   * 5 inch launch and is still overridable from the FC screen. */
  currentPidProfile->launchControlAngleLimit = 40;

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
  targetPidLooptime = SIM_US_PER_STEP; /* microseconds, one plant step */

  gyro.targetLooptime = targetPidLooptime;
  gyro.sampleLooptime = targetPidLooptime;
  gyro.sampleRateHz = SIM_STEP_HZ;
  gyro.accSampleRateHz = SIM_STEP_HZ;
  gyro.gyroToUse = GYRO_CONFIG_USE_GYRO_1;
  gyro.gyroDebugMode = DEBUG_NONE;
  gyro.rawSensorDev = &gyro.gyroSensor1.gyroDev;
  gyro.gyroSensor1.gyroDev.gyroAlign = CW0_DEG;
  gyro.gyroSensor1.gyroDev.scale = GYRO_SCALE_2000DPS;
  gyro.gyroSensor1.gyroDev.readFn = sim_gyro_read;
  gyro.gyroSensor1.calibration.cyclesRemaining = 0;
  gyroInitFilters();

  /* Plant attitude is the accelerometer. pid_init copies
   * launch_angle_limit only when SENSOR_ACC is set; applyLaunchControl
   * is still gated on isLaunchControlActive, which stays false unless
   * the shell asks, so the harness acro path does not change. */
  sensorsSet(SENSOR_ACC);

  pidInit(currentPidProfile);
  pidResetTransientState();
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

  /* Same PT1 gain drivers/dshot.c gives the reported rotor frequency, from
   * the same config key, so the RPM filter sees the lag a real one sees.
   * rpmFilterInit and dynNotchInit are not called here: pid_init.c and
   * gyro_init.c already do it, from the chain above. */
  g_motor_hz_gain = pt1FilterGain((float)rpmFilterConfig()->rpm_filter_lpf_hz,
                                  targetPidLooptime * 1e-6f);
}

int bf_config_finish(void) {
  bf_runtime_init();
  return SIM_OK;
}

/* Debug window into the Betaflight side, exported for harness free
 * inspection from scratch scripts. Not part of the ABI contract. */
static int g_crashflip = 0;

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
    /* 0.0635 is PLANT.prop_r in src/native/plant.c. Restated rather than
     * imported because PLANT is that file's own struct and this is a debug
     * slot, not the physics; if the rotor ever changes size, this figure of
     * merit goes wrong quietly. */
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
  case 49: return g_crashflip;
  default: return 0.0;
  }
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
int sim_bf_dump(char *out, int cap) {
  return bf_settings_dump(out, cap);
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
int sim_bf_get(const char *key, char *out, int cap) {
  return bf_settings_get(key, cap > 0 ? out : 0, cap);
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

/*
 * LAUNCH CONTROL, kept off the acro path the same way.
 *
 * pid.c and mixer.c already compiled the hold, the idle-throttle mixer
 * and the iterm dump. fc/core.c is not compiled, so the state machine
 * that arms the mode, triggers on throttle and resets on the switch
 * lives here, copied from core.c rather than rewritten in JavaScript.
 *
 * The sim is always armed, so "captured at arm" is the moment the shell
 * raises the switch, and a reset is a fresh arm. After a trigger the
 * feature latches until the switch goes off (launch_trigger_allow_reset)
 * or the module resets. g_launch_switch defaults to 0. The harness never
 * calls sim_set_launch_control.
 */
static int g_launch_switch = 0;
static launchControlState_e g_launch_state = LAUNCH_CONTROL_DISABLED;

static void bf_apply_launch_control(void) {
  if (g_launch_switch) {
    if (g_launch_state == LAUNCH_CONTROL_DISABLED) {
      g_launch_state = LAUNCH_CONTROL_ACTIVE;
    }
  } else if (g_launch_state == LAUNCH_CONTROL_TRIGGERED) {
    if (currentPidProfile && currentPidProfile->launchControlAllowTriggerReset) {
      g_launch_state = LAUNCH_CONTROL_DISABLED;
    }
  } else {
    g_launch_state = LAUNCH_CONTROL_DISABLED;
  }
}

bool isLaunchControlActive(void) {
  return g_launch_state == LAUNCH_CONTROL_ACTIVE;
}

void bridge_set_launch_control(int on) {
  g_launch_switch = on ? 1 : 0;
  bf_apply_launch_control();
}

int bridge_launch_control_state(void) {
  if (g_launch_state == LAUNCH_CONTROL_DISABLED) {
    return 0;
  }
  if (g_launch_state == LAUNCH_CONTROL_TRIGGERED) {
    return 3;
  }
  if (!currentPidProfile) {
    return 1;
  }
  /* 4.2 OSD: blink when throttle is within 10 percent of the trigger. */
  const int trig = (int)currentPidProfile->launchControlThrottlePercent;
  const int pct = (int)calculateThrottlePercentAbs();
  if (pct + 10 >= trig && trig > 0) {
    return 2;
  }
  return 1;
}

/*
 * CRASHFLIP / TURTLE. mixer.c already compiled applyFlipOverAfterCrashModeToMotors
 * and mixTable takes that path when isFlipOverAfterCrashActive is true. The
 * stub used to return false forever, so the mixer was dead code. The shell
 * raises this when the craft is inverted and in contact; pitch and roll
 * then spin the high motors, which is Betaflight's own turtle, not a
 * reimplementation. I-term is dumped on both edges so a wound PID cannot
 * yank the craft when turtle latches or when mixTable returns to the PID.
 */
bool isFlipOverAfterCrashActive(void) {
  return g_crashflip != 0;
}

void bridge_set_crashflip(int on) {
  const int next = on ? 1 : 0;
  /* Dump I on both edges. pidController still runs during turtle (the
   * mixer just ignores it), so a wound integrator would yank the craft
   * the instant mixTable returns to the PID. Real hardware leaves
   * crashflip by disarming, which resets the same state. */
  if (next != g_crashflip) {
    pidResetIterm();
  }
  g_crashflip = next;
}

int bridge_crashflip_active(void) {
  return g_crashflip;
}

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
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    g_vib_phase[m] = 0.0;
    g_motor_hz[m] = 0.0f;
  }
  g_motor_hz_min = 0.0f;
  /* Any non zero constant seeds xorshift32; fixed, which is the point. */
  g_vib_seed = 0x2545F491u;
  for (int i = 0; i < 4; i += 1) {
    rcData[i] = (i == THROTTLE) ? 1000.0f : 1500.0f;
  }
  bf_runtime_init();

  for (uint32_t ms = BF_WARMUP_FRAME_MS; ms <= BF_WARMUP_MS; ms += BF_WARMUP_FRAME_MS) {
    sim_bf_now_us = ms * 1000;
    updateRcRefreshRate((timeUs_t)ms * 1000);
    updateRcCommands();
    processRcCommand();
  }
  pidResetIterm();
  /* Reset does not clear the shell's requested mode. Re-apply after the
   * init chain so a craft that was in angle stays in angle, and a launch
   * control switch that was on is a fresh arm rather than a latched
   * trigger from the previous sitting. */
  bf_apply_angle_mode_flag();
  if (g_launch_switch) {
    g_launch_state = LAUNCH_CONTROL_ACTIVE;
  } else {
    g_launch_state = LAUNCH_CONTROL_DISABLED;
  }
  g_crashflip = 0;
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
  /* Before gyroFiltering, which is where rpmFilterApply reads it. */
  sim_update_motor_frequency(s);

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
  /*
   * MICROSECONDS, not milliseconds times a thousand.
   *
   * This used to be `BF_WARMUP_MS + s->step_index`, which is only the time
   * if one step is one millisecond. Above 1 kHz that runs the firmware's
   * whole clock fast by the rate ratio, and every piece of Betaflight that
   * reads time (rc smoothing's interval estimate, feedforward's packet
   * delta, anti gravity, iterm relax) would be told the flight is happening
   * faster than it is. Driving microseconds off the step index and deriving
   * milliseconds from THAT keeps one timebase and gives a 125 us step
   * somewhere to be. At 1 kHz it is arithmetically the old expression.
   */
  const timeUs_t now_us =
      (timeUs_t)((long long)BF_WARMUP_MS * 1000 + (long long)s->step_index * SIM_US_PER_STEP);
  sim_bf_now_us = (uint32_t)now_us;

  /* Angle mode only, unless launch control is holding. Acro never
   * enters: both switches stay off, attitude stays untouched, pidLevel
   * is not reached. Launch control needs attitude for the optional
   * angle limit and needs ANGLE_MODE down, which is Betaflight's own
   * canUseLaunchControl rule. */
  if (g_launch_state == LAUNCH_CONTROL_ACTIVE) {
    flightModeFlags &= (uint16_t)~ANGLE_MODE;
    bf_feed_attitude(s);
    if (currentPidProfile
        && (int)calculateThrottlePercentAbs()
            > (int)currentPidProfile->launchControlThrottlePercent) {
      g_launch_state = LAUNCH_CONTROL_TRIGGERED;
      pidResetIterm();
    }
  } else if (g_angle_mode) {
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
