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

#include "drivers/time.h"
#include "fc/core.h"
#include "flight/failsafe.h"
#include "flight/imu.h"
#include "io/beeper.h"
#include "scheduler/scheduler.h"
#include "rx/rx.h"
#include "sensors/acceleration.h"
#include "sensors/battery.h"
#include "sensors/gyro.h"

/* Parameter group storage normally defined in sensors/acceleration.c. */
accelerometerConfig_t accelerometerConfig_System;

/* Attitude estimate from flight/imu.c; zeroed, never used in acro. */
attitudeEulerAngles_t attitude;

bool failsafeIsActive(void) { return false; }

const lowVoltageCutoff_t *getLowVoltageCutoff(void) {
  static const lowVoltageCutoff_t cutoff = { .enabled = false, .percentage = 100, .startTime = 0 };
  return &cutoff;
}

void imuQuaternionHeadfreeTransformVectorEarthToBody(t_fp_vector_def *v) { (void)v; }

bool isLaunchControlActive(void) { return false; }

/* Simulated milliseconds, advanced by the glue each step. */
uint32_t sim_bf_now_ms;
uint32_t millis(void) { return sim_bf_now_ms; }

bool rxIsReceivingSignal(void) { return true; }

/* No hardware rx frame timestamps; updateRcRefreshRate falls back to its
 * call interval on the simulated clock, one frame per 1 ms step. */
timeDelta_t rxGetFrameDelta(timeDelta_t *frameAgeUs) {
  *frameAgeUs = 0;
  return 0;
}

/* Parameter group storage normally defined in sensors/battery.c. */
batteryConfig_t batteryConfig_System;

/* Battery sag cell voltage in hundredths of a volt, fed from the plant by
 * the glue. Only read when vbat_sag_compensation is enabled. */
uint16_t sim_bf_sag_cell_cv = 420;
uint16_t getBatterySagCellVoltage(void) { return sim_bf_sag_cell_cv; }

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
void schedulerResetTaskStatistics(taskId_e taskId) { (void)taskId; }

/* Core state: always armed, airmode on, never crashed or disarming. */
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
