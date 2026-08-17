/*
 * bf_stubs.c: the hardware and subsystem symbols Betaflight's compiled
 * control loop references but which live in files we do not compile
 * (imu, failsafe, battery monitor, rx link, system clock). Each stub is
 * the neutral value for a healthy, armed, acro quad. The real Betaflight
 * headers are included so every signature is compiler checked against the
 * vendor tree.
 *
 * millis() is fed from the simulated clock by the glue; wall clock time
 * must never reach the physics.
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

#include "common/maths.h"
#include "drivers/time.h"
#include "fc/core.h"
#include "fc/rc_controls.h"
#include "pg/rx.h"
#include "rx/rx.h"
#include "flight/failsafe.h"
#include "flight/imu.h"
#include "io/beeper.h"
#include "scheduler/scheduler.h"
#include "sensors/acceleration.h"
#include "sensors/battery.h"
#include "sensors/gyro.h"

/* Parameter group storage normally defined in sensors/acceleration.c. */
accelerometerConfig_t accelerometerConfig_System;

/* Attitude estimate. Acro never reads it. Angle mode writes plant Euler
 * angles into this from bf_glue.c, which is what SITL does instead of
 * compiling the AHRS. */
attitudeEulerAngles_t attitude;

bool failsafeIsActive(void) { return false; }

const lowVoltageCutoff_t *getLowVoltageCutoff(void) {
  static const lowVoltageCutoff_t cutoff = { .enabled = false, .percentage = 100, .startTime = 0 };
  return &cutoff;
}

void imuQuaternionHeadfreeTransformVectorEarthToBody(t_fp_vector_def *v) { (void)v; }

bool isLaunchControlActive(void) { return false; }

/* Simulated MICROSECONDS, advanced by the glue each step.
 *
 * One counter, and milliseconds are derived from it rather than the other
 * way round. It used to be the other way round, on the argument that a 1 ms
 * step gives a microsecond clock no more information to carry. That was
 * true at 1 kHz and stops being true the moment the step is shorter than a
 * millisecond: an 8 kHz loop needs 125 us resolution or every Betaflight
 * path that reads time sees the same instant eight times running.
 *
 * Referenced by rc_modes.c's sticky mode path, which cannot run here
 * because no mode activation conditions are analysed, but the symbol has to
 * resolve now that bf_glue.c calls updateActivatedModes. */
uint32_t sim_bf_now_us;
timeMs_t millis(void) { return sim_bf_now_us / 1000u; }
timeUs_t micros(void) { return (timeUs_t)sim_bf_now_us; }

bool rxIsReceivingSignal(void) { return true; }

/* No hardware rx frame timestamps; updateRcRefreshRate falls back to its
 * call interval on the simulated clock, one frame per 1 ms step. */
timeDelta_t rxGetFrameDelta(timeDelta_t *frameAgeUs) {
  *frameAgeUs = 0;
  return 0;
}

/*
 * Parameter group storage normally defined in sensors/battery.c, WITH
 * Betaflight's own defaults, because a zeroed struct here put a pilot on
 * the ground.
 *
 * sensors/battery.c is not compiled, so its PG registration never runs and
 * nothing resets this struct: whatever is written here is what the firmware
 * reads, forever. It used to be a bare global, all zeros, and mixer.c's
 * vbat_sag_compensation computes its working range as
 *
 *   vbatRangeToCompensate = CELL_VOLTAGE_FULL_CV - vbatwarningcellvoltage
 *
 * With the real default warning voltage of 3.50 V a cell that range is
 * 0.70 V and the attenuation tops out at 70/420, about 17 percent of the
 * output span held back at full charge and released as the pack sags,
 * which is the whole feature. With the zero this struct carried, the range
 * became the full 4.20 V, the attenuation reached 1.0 at full charge, and
 * motorRangeMax collapsed onto motorRangeMin: every motor pinned at idle,
 * which the owner flew and reported as "no throttle response at all" the
 * first time the key was set. The values below are Betaflight 4.5.1's own
 * defaults, in hundredths of a volt, and the meter sources are set so the
 * feature's ADC gate, where the build carries it, sees a live meter.
 *
 * Designated initializers on purpose: the struct's field order belongs to
 * Betaflight and may change under an upstream merge.
 */
batteryConfig_t batteryConfig_System = {
  .vbatmaxcellvoltage = 430,
  .vbatfullcellvoltage = 410,
  .vbatmincellvoltage = 330,
  .vbatwarningcellvoltage = 350,
  .voltageMeterSource = VOLTAGE_METER_ADC,
  .currentMeterSource = CURRENT_METER_VIRTUAL,
};

/* Battery sag cell voltage in hundredths of a volt, fed from the plant by
 * the glue. Only read when vbat_sag_compensation is enabled. */
uint16_t sim_bf_sag_cell_cv = 420;
uint16_t getBatterySagCellVoltage(void) { return sim_bf_sag_cell_cv; }

/*
 * Throttle as a percentage of travel, from fc/core.c. Only the dynamic notch
 * calls it, and only to decide whether to publish its peak frequency for an
 * OSD this build does not have, so nothing flies differently on it. It is
 * still the real expression rather than a constant, minus the 3D branch: this
 * airframe is not reversible and FEATURE_3D is never set.
 */
int8_t calculateThrottlePercent(void) {
  const int channelData = constrain((int)rcData[THROTTLE], PWM_RANGE_MIN, PWM_RANGE_MAX);
  return (int8_t)constrain(((channelData - rxConfig()->mincheck) * 100) /
                               (PWM_RANGE_MAX - rxConfig()->mincheck),
                           0, 100);
}
uint8_t calculateThrottlePercentAbs(void) {
  const int8_t p = calculateThrottlePercent();
  return (uint8_t)(p < 0 ? -p : p);
}

/*
 * Bidirectional DShot is "fitted". mixer_init.c gates dynamic idle on it and
 * the RPM filter needs a rotor speed to aim at; bf_glue.c supplies both from
 * the plant, through the same PT1 lag drivers/dshot.c applies to a real
 * telemetry stream. Saying false here would switch dynamic idle off while the
 * config claimed it was on, which is the class of quiet lie this file has
 * already been caught in once.
 */
bool useDshotTelemetry = true;

/* DShot command plumbing. The motor endpoints in bf_glue.c model a DShot
 * ESC, so this agrees with them; every caller of it in the compiled set is
 * a crashflip or failsafe path that never runs here.
 * dynThrottle, dynLpfGyroUpdate, gyroOverflowDetected, gyroYawSpinDetected
 * and initYawSpinRecovery used to be stubbed here and are now the real
 * functions in sensors/gyro.c, which this build compiles. */
void dshotSetPidLoopTime(uint32_t pidLoopTime) { (void)pidLoopTime; }
bool isMotorProtocolDshot(void) { return true; }

/* Referenced by sensors/gyro.c's calibration and overflow paths, which
 * this build compiles for its filter chain. The simulated gyro is never
 * calibrated and never overflows, so neither ever sounds or reschedules. */
void beeper(beeperMode_e mode) { (void)mode; }
void beeperConfirmationBeeps(uint8_t beepCount) { (void)beepCount; }
void beeperSilence(void) {}
void schedulerResetTaskStatistics(taskId_e taskId) { (void)taskId; }

/* Core state: never crashed, never disarming.
 *
 * isAirmodeActivated is core.c's throttle latch, not the airmode feature.
 * The feature itself is airmodeIsEnabled() in rc_modes.c, which this file
 * once claimed to cover and did not: bf_glue.c raises it now. */
void disarm(flightLogDisarmReason_e reason) { (void)reason; }
bool isFlipOverAfterCrashActive(void) { return false; }
bool isAirmodeActivated(void) { return true; }

/* Tricopter servo correction, not a tricopter. */
void mixerTricopterInit(void) {}
float mixerTricopterMotorCorrection(int motor) { (void)motor; return 0.0f; }

/* rcmap parsing from rx/rx.c; rcData is written by function index in the
 * glue, so the map is never consulted. */
void parseRcChannels(const char *input, struct rxConfig_s *rxConfig) {
  (void)input;
  (void)rxConfig;
}
