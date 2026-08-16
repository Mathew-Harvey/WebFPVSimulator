/*
 * bf_settings.c: the Betaflight CLI setting table.
 *
 * WHY THIS FILE EXISTS.
 *
 * Until this round `bf_config_apply_setting` was a chain of 25 string
 * comparisons and a final `return SIM_OK` that swallowed everything else.
 * A diff could therefore say `set d_min_roll = 30`, `set tpa_rate = 70` or
 * `set iterm_relax_cutoff = 45` and the simulator would report success and
 * change nothing. That is the exact failure mode STAGE1.md check 12 exists
 * to catch, and check 12 only ever varied a rates value, so it never did.
 *
 * Every key here is named by Betaflight's own `fc/parameter_names.h` macro
 * wherever one exists, so a rename upstream is a compile error rather than
 * a silent miss. The field each key writes is the field Betaflight's own
 * `cli/settings.c` writes for that key; the two were diffed entry by entry
 * when this table was built.
 *
 * Three outcomes, and the difference between them is the point:
 *   APPLIED  the value reaches a struct that compiled Betaflight code reads.
 *   INERT    the key is real Betaflight but addresses a subsystem this
 *            simulator does not compile (serial, OSD, blackbox, telemetry,
 *            GPS, VTX, LEDs, ESC protocol). Accepted, deliberately does
 *            nothing, listed below with its reason.
 *   UNKNOWN  not recognised at all. Counted, and reported through
 *            sim_bf_debug so scripts/preset-lint.js can fail a shipped
 *            preset that has drifted. NOT an error at runtime, because a
 *            pilot may drop a full dump from a flight controller this
 *            simulator has never heard of and that must still fly.
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
#include "config/feature.h"
#include "config/simplified_tuning.h"
#include "fc/controlrate_profile.h"
#include "fc/parameter_names.h"
#include "fc/rc_controls.h"
#include "flight/mixer.h"
#include "flight/mixer_init.h"
#include "flight/pid.h"
#include "flight/pid_init.h"
#include "pg/dyn_notch.h"
#include "pg/motor.h"
#include "pg/rpm_filter.h"
#include "pg/rx.h"
#include "rx/rx.h"
#include "sensors/gyro.h"

#include "../sim_abi.h"
#include "bf_settings.h"

/* Field widths, matching the VAR_ type column of cli/settings.c. */
typedef enum {
  T_U8,
  T_U16,
  T_I8,
  T_I16,
} bf_field_t;

typedef struct {
  const char *name;
  void *field;
  bf_field_t type;
  const char *const *lut; /* word values, index is the stored number */
  int lut_n;
} BfSetting;

/*
 * Lookup tables. Betaflight keeps these in cli/settings.c as static arrays
 * that are not exported, so the words are repeated here. Only the tables a
 * key in this file actually uses are present, and each is ordered by the
 * enum in the header named in its comment, so the index IS the enum value.
 */
static const char *const LUT_OFF_ON[] = { "OFF", "ON" };
static const char *const LUT_OFF_ON_AUTO[] = { "OFF", "ON", "AUTO" };
/* pid.h itermRelax_e */
static const char *const LUT_ITERM_RELAX[] = { "OFF", "RP", "RPY", "RP_INC", "RPY_INC" };
/* pid.h itermRelaxType_e */
static const char *const LUT_ITERM_RELAX_TYPE[] = { "GYRO", "SETPOINT" };
/* pid.h tpaMode_e */
static const char *const LUT_TPA_MODE[] = { "PD", "D" };
/* controlrate_profile.h ratesType_e */
static const char *const LUT_RATES_TYPE[] = { "BETAFLIGHT", "RACEFLIGHT", "KISS", "ACTUAL", "QUICK" };
/* filter.h filterType_e, as used by the gyro and dterm lpf type keys */
static const char *const LUT_LPF_TYPE[] = { "PT1", "BIQUAD", "PT2", "PT3" };
/* mixer.h mixerType_e */
static const char *const LUT_MIXER_TYPE[] = { "LEGACY", "LINEAR", "DYNAMIC", "EZLANDING" };
/* controlrate_profile.h throttleLimitType_e */
static const char *const LUT_THROTTLE_LIMIT_TYPE[] = { "OFF", "SCALE", "CLIP" };
/* simplified_tuning.h simplifiedTuningPidsMode_e */
static const char *const LUT_SIMPLIFIED_PIDS_MODE[] = { "OFF", "RP", "RPY" };
/* pid.h feedforwardAveraging_e */
static const char *const LUT_FF_AVERAGING[] = { "OFF", "2_POINT", "3_POINT", "4_POINT" };
/* pid.h pidCrashRecovery_e */
static const char *const LUT_CRASH_RECOVERY[] = { "OFF", "ON", "BEEP", "DISARM" };
/* gyro.h, the hardware lpf selector. Inert here, no gyro hardware. */
static const char *const LUT_GYRO_HARDWARE_LPF[] = { "NORMAL", "OPTION_1", "OPTION_2", "EXPERIMENTAL" };
/* common/axis.h flight_dynamics_index_t plus ALL */
static const char *const LUT_GYRO_DEBUG_AXIS[] = { "ROLL", "PITCH", "YAW" };

#define MAX_SETTINGS 200
static BfSetting g_table[MAX_SETTINGS];
static int g_count;

static int g_applied;
static int g_inert;
static int g_unknown;

static void add(const char *name, void *field, bf_field_t type,
                const char *const *lut, int lut_n) {
  if (g_count < MAX_SETTINGS) {
    g_table[g_count].name = name;
    g_table[g_count].field = field;
    g_table[g_count].type = type;
    g_table[g_count].lut = lut;
    g_table[g_count].lut_n = lut_n;
    g_count += 1;
  }
}

#define U8(n, f) add((n), &(f), T_U8, 0, 0)
#define U16(n, f) add((n), &(f), T_U16, 0, 0)
#define I8(n, f) add((n), &(f), T_I8, 0, 0)
#define I16(n, f) add((n), &(f), T_I16, 0, 0)
#define LUT8(n, f, t) add((n), &(f), T_U8, (t), (int)(sizeof(t) / sizeof((t)[0])))
#define LUTI8(n, f, t) add((n), &(f), T_I8, (t), (int)(sizeof(t) / sizeof((t)[0])))

/*
 * Build the table against the live parameter group structs. Called after
 * the groups are reset, because the addresses are of static storage and do
 * not move, but building it there keeps the ordering obvious.
 */
void bf_settings_build(void) {
  g_count = 0;
  g_applied = 0;
  g_inert = 0;
  g_unknown = 0;

  pidProfile_t *p = pidProfilesMutable(0);
  controlRateConfig_t *r = controlRateProfilesMutable(0);
  gyroConfig_t *g = gyroConfigMutable();
  rxConfig_t *x = rxConfigMutable();
  motorConfig_t *m = motorConfigMutable();
  mixerConfig_t *mx = mixerConfigMutable();
  pidConfig_t *pc = pidConfigMutable();
  dynNotchConfig_t *dn = dynNotchConfigMutable();
  rpmFilterConfig_t *rf = rpmFilterConfigMutable();

  /* ---- PID gains, flight/pid.c ---- */
  U8("p_roll", p->pid[PID_ROLL].P);
  U8("i_roll", p->pid[PID_ROLL].I);
  U8("d_roll", p->pid[PID_ROLL].D);
  U16("f_roll", p->pid[PID_ROLL].F);
  U8("p_pitch", p->pid[PID_PITCH].P);
  U8("i_pitch", p->pid[PID_PITCH].I);
  U8("d_pitch", p->pid[PID_PITCH].D);
  U16("f_pitch", p->pid[PID_PITCH].F);
  U8("p_yaw", p->pid[PID_YAW].P);
  U8("i_yaw", p->pid[PID_YAW].I);
  U8("d_yaw", p->pid[PID_YAW].D);
  U16("f_yaw", p->pid[PID_YAW].F);

  /* D max. Betaflight still calls the fields d_min internally. */
  U8("d_min_roll", p->d_min[FD_ROLL]);
  U8("d_min_pitch", p->d_min[FD_PITCH]);
  U8("d_min_yaw", p->d_min[FD_YAW]);
  U8(PARAM_NAME_D_MAX_GAIN, p->d_min_gain);
  U8(PARAM_NAME_D_MAX_ADVANCE, p->d_min_advance);

  /* ---- D term and yaw filtering, flight/pid_init.c ---- */
  I16(PARAM_NAME_DTERM_LPF1_STATIC_HZ, p->dterm_lpf1_static_hz);
  LUT8(PARAM_NAME_DTERM_LPF1_TYPE, p->dterm_lpf1_type, LUT_LPF_TYPE);
  I16(PARAM_NAME_DTERM_LPF2_STATIC_HZ, p->dterm_lpf2_static_hz);
  LUT8(PARAM_NAME_DTERM_LPF2_TYPE, p->dterm_lpf2_type, LUT_LPF_TYPE);
  U16("dterm_lpf1_dyn_min_hz", p->dterm_lpf1_dyn_min_hz);
  U16("dterm_lpf1_dyn_max_hz", p->dterm_lpf1_dyn_max_hz);
  U8("dterm_lpf1_dyn_expo", p->dterm_lpf1_dyn_expo);
  U16(PARAM_NAME_DTERM_NOTCH_HZ, p->dterm_notch_hz);
  U16(PARAM_NAME_DTERM_NOTCH_CUTOFF, p->dterm_notch_cutoff);
  U16(PARAM_NAME_YAW_LOWPASS_HZ, p->yaw_lowpass_hz);

  /* ---- I term behaviour ---- */
  LUT8(PARAM_NAME_ITERM_RELAX, p->iterm_relax, LUT_ITERM_RELAX);
  LUT8(PARAM_NAME_ITERM_RELAX_TYPE, p->iterm_relax_type, LUT_ITERM_RELAX_TYPE);
  U8(PARAM_NAME_ITERM_RELAX_CUTOFF, p->iterm_relax_cutoff);
  U8(PARAM_NAME_ITERM_WINDUP, p->itermWindupPointPercent);
  U16("iterm_limit", p->itermLimit);
  LUT8("iterm_rotation", p->iterm_rotation, LUT_OFF_ON);

  /* ---- PID sum limits and mixer coupling ---- */
  U16(PARAM_NAME_PIDSUM_LIMIT, p->pidSumLimit);
  U16(PARAM_NAME_PIDSUM_LIMIT_YAW, p->pidSumLimitYaw);
  LUT8(PARAM_NAME_PID_AT_MIN_THROTTLE, p->pidAtMinThrottle, LUT_OFF_ON);
  U8(PARAM_NAME_MOTOR_OUTPUT_LIMIT, p->motor_output_limit);
  U8("thrust_linear", p->thrustLinearization);
  U8("transient_throttle_limit", p->transient_throttle_limit);

  /* ---- Anti gravity ---- */
  U8(PARAM_NAME_ANTI_GRAVITY_GAIN, p->anti_gravity_gain);
  U8(PARAM_NAME_ANTI_GRAVITY_CUTOFF_HZ, p->anti_gravity_cutoff_hz);
  U8(PARAM_NAME_ANTI_GRAVITY_P_GAIN, p->anti_gravity_p_gain);

  /* ---- Feedforward, flight/pid.c and fc/rc.c ---- */
  U8(PARAM_NAME_FEEDFORWARD_TRANSITION, p->feedforward_transition);
  LUT8(PARAM_NAME_FEEDFORWARD_AVERAGING, p->feedforward_averaging, LUT_FF_AVERAGING);
  U8(PARAM_NAME_FEEDFORWARD_SMOOTH_FACTOR, p->feedforward_smooth_factor);
  U8(PARAM_NAME_FEEDFORWARD_JITTER_FACTOR, p->feedforward_jitter_factor);
  U8(PARAM_NAME_FEEDFORWARD_BOOST, p->feedforward_boost);
  U8(PARAM_NAME_FEEDFORWARD_MAX_RATE_LIMIT, p->feedforward_max_rate_limit);

  /* ---- Throttle to PID attenuation ---- */
  LUT8(PARAM_NAME_TPA_MODE, p->tpa_mode, LUT_TPA_MODE);
  U8(PARAM_NAME_TPA_RATE, p->tpa_rate);
  U16(PARAM_NAME_TPA_BREAKPOINT, p->tpa_breakpoint);
  U8(PARAM_NAME_TPA_LOW_RATE, p->tpa_low_rate);
  U16(PARAM_NAME_TPA_LOW_BREAKPOINT, p->tpa_low_breakpoint);
  LUT8(PARAM_NAME_TPA_LOW_ALWAYS, p->tpa_low_always, LUT_OFF_ON);

  /* ---- Throttle boost, flight/mixer.c ---- */
  U8(PARAM_NAME_THROTTLE_BOOST, p->throttle_boost);
  U8(PARAM_NAME_THROTTLE_BOOST_CUTOFF, p->throttle_boost_cutoff);

  /* ---- Setpoint acceleration limits ---- */
  U16(PARAM_NAME_ACC_LIMIT, p->rateAccelLimit);
  U16(PARAM_NAME_ACC_LIMIT_YAW, p->yawRateAccelLimit);

  /* ---- Absolute control and integrated yaw ---- */
  U8(PARAM_NAME_ABS_CONTROL_GAIN, p->abs_control_gain);
  U8("abs_control_limit", p->abs_control_limit);
  U8("abs_control_error_limit", p->abs_control_error_limit);
  U8("abs_control_cutoff", p->abs_control_cutoff);
  LUT8(PARAM_NAME_USE_INTEGRATED_YAW, p->use_integrated_yaw, LUT_OFF_ON);
  U8("integrated_yaw_relax", p->integrated_yaw_relax);

  /* ---- Battery sag compensation, flight/pid.c ---- */
  U8(PARAM_NAME_VBAT_SAG_COMPENSATION, p->vbat_sag_compensation);

  /* ---- Dynamic idle. Reaches mixer_init, and the plant feeds it real
   * motor RPM, so a preset that turns it on gets the real loop. ---- */
  U8(PARAM_NAME_DYN_IDLE_MIN_RPM, p->dyn_idle_min_rpm);
  U8(PARAM_NAME_DYN_IDLE_P_GAIN, p->dyn_idle_p_gain);
  U8(PARAM_NAME_DYN_IDLE_I_GAIN, p->dyn_idle_i_gain);
  U8(PARAM_NAME_DYN_IDLE_D_GAIN, p->dyn_idle_d_gain);
  U8(PARAM_NAME_DYN_IDLE_MAX_INCREASE, p->dyn_idle_max_increase);
  U8(PARAM_NAME_DYN_IDLE_START_INCREASE, p->dyn_idle_start_increase);

  /* ---- Ez landing, a mixer_type option ---- */
  U8(PARAM_NAME_EZ_LANDING_THRESHOLD, p->ez_landing_threshold);
  U8(PARAM_NAME_EZ_LANDING_LIMIT, p->ez_landing_limit);
  U8(PARAM_NAME_EZ_LANDING_SPEED, p->ez_landing_speed);

  /* ---- Crash recovery, flight/pid.c ---- */
  LUT8("crash_recovery", p->crash_recovery, LUT_CRASH_RECOVERY);
  U16("crash_dthreshold", p->crash_dthreshold);
  U16("crash_gthreshold", p->crash_gthreshold);
  U16("crash_setpoint_threshold", p->crash_setpoint_threshold);
  U16("crash_time", p->crash_time);
  U16("crash_delay", p->crash_delay);
  U8("crash_recovery_angle", p->crash_recovery_angle);
  U8("crash_recovery_rate", p->crash_recovery_rate);
  U16("crash_limit_yaw", p->crash_limit_yaw);

  /* ---- Self levelling gains. pidLevel reads these when ANGLE_MODE is
   * on. Acro never does. A diff that carries them must not lose them. ---- */
  U8(PARAM_NAME_ANGLE_P_GAIN, p->pid[PID_LEVEL].P);
  U8(PARAM_NAME_ANGLE_FEEDFORWARD, p->pid[PID_LEVEL].F);
  U8(PARAM_NAME_ANGLE_FF_SMOOTHING_MS, p->angle_feedforward_smoothing_ms);
  U8(PARAM_NAME_ANGLE_LIMIT, p->angle_limit);
  U8(PARAM_NAME_ANGLE_EARTH_REF, p->angle_earth_ref);
  U8(PARAM_NAME_HORIZON_LEVEL_STRENGTH, p->pid[PID_LEVEL].I);
  U8(PARAM_NAME_HORIZON_LIMIT_STICKS, p->pid[PID_LEVEL].D);
  U8(PARAM_NAME_HORIZON_LIMIT_DEGREES, p->horizon_limit_degrees);
  LUT8(PARAM_NAME_HORIZON_IGNORE_STICKS, p->horizon_ignore_sticks, LUT_OFF_ON);
  U16(PARAM_NAME_HORIZON_DELAY_MS, p->horizon_delay_ms);
  LUT8("level_race_mode", p->level_race_mode, LUT_OFF_ON);

  /* ---- Simplified (slider) tuning. The Karate presets are written in
   * these and would be a no-op without them; `simplified_tuning apply`
   * in the diff runs Betaflight's own config/simplified_tuning.c. ---- */
  LUT8(PARAM_NAME_SIMPLIFIED_PIDS_MODE, p->simplified_pids_mode, LUT_SIMPLIFIED_PIDS_MODE);
  U8(PARAM_NAME_SIMPLIFIED_MASTER_MULTIPLIER, p->simplified_master_multiplier);
  U8(PARAM_NAME_SIMPLIFIED_I_GAIN, p->simplified_i_gain);
  U8(PARAM_NAME_SIMPLIFIED_D_GAIN, p->simplified_d_gain);
  U8(PARAM_NAME_SIMPLIFIED_PI_GAIN, p->simplified_pi_gain);
  U8(PARAM_NAME_SIMPLIFIED_DMAX_GAIN, p->simplified_dmin_ratio);
  U8(PARAM_NAME_SIMPLIFIED_FEEDFORWARD_GAIN, p->simplified_feedforward_gain);
  U8(PARAM_NAME_SIMPLIFIED_PITCH_D_GAIN, p->simplified_roll_pitch_ratio);
  U8(PARAM_NAME_SIMPLIFIED_PITCH_PI_GAIN, p->simplified_pitch_pi_gain);
  LUT8(PARAM_NAME_SIMPLIFIED_DTERM_FILTER, p->simplified_dterm_filter, LUT_OFF_ON);
  U8(PARAM_NAME_SIMPLIFIED_DTERM_FILTER_MULTIPLIER, p->simplified_dterm_filter_multiplier);
  LUT8(PARAM_NAME_SIMPLIFIED_GYRO_FILTER, g->simplified_gyro_filter, LUT_OFF_ON);
  U8(PARAM_NAME_SIMPLIFIED_GYRO_FILTER_MULTIPLIER, g->simplified_gyro_filter_multiplier);

  /* ---- Gyro filtering, sensors/gyro_init.c ---- */
  LUT8(PARAM_NAME_GYRO_LPF1_TYPE, g->gyro_lpf1_type, LUT_LPF_TYPE);
  U16(PARAM_NAME_GYRO_LPF1_STATIC_HZ, g->gyro_lpf1_static_hz);
  LUT8(PARAM_NAME_GYRO_LPF2_TYPE, g->gyro_lpf2_type, LUT_LPF_TYPE);
  U16(PARAM_NAME_GYRO_LPF2_STATIC_HZ, g->gyro_lpf2_static_hz);
  U16("gyro_lpf1_dyn_min_hz", g->gyro_lpf1_dyn_min_hz);
  U16("gyro_lpf1_dyn_max_hz", g->gyro_lpf1_dyn_max_hz);
  U8("gyro_lpf1_dyn_expo", g->gyro_lpf1_dyn_expo);
  U16("gyro_notch1_hz", g->gyro_soft_notch_hz_1);
  U16("gyro_notch1_cutoff", g->gyro_soft_notch_cutoff_1);
  U16("gyro_notch2_hz", g->gyro_soft_notch_hz_2);
  U16("gyro_notch2_cutoff", g->gyro_soft_notch_cutoff_2);
  LUT8(PARAM_NAME_GYRO_HARDWARE_LPF, g->gyro_hardware_lpf, LUT_GYRO_HARDWARE_LPF);
  LUT8("yaw_spin_recovery", g->yaw_spin_recovery, LUT_OFF_ON_AUTO);
  U16("yaw_spin_threshold", g->yaw_spin_threshold);
  LUT8("gyro_filter_debug_axis", g->gyro_filter_debug_axis, LUT_GYRO_DEBUG_AXIS);

  /*
   * ---- Dynamic notch and RPM filter ----
   *
   * Both were in the inert list, on the honest grounds that neither feature
   * was compiled and there was no gyro noise for them to remove. Both of
   * those reasons are gone: patches/0001 switches the features on for this
   * target and the gyro now carries a real spectrum with one imbalance line
   * per rotor. A preset's filter section has to reach them or a race tune
   * would be flown on Betaflight's defaults no matter what it said.
   *
   * THE RPM FILTER WORKS AND THE DYNAMIC NOTCH DOES NOT, and the reason is
   * Betaflight's own. dyn_notch_filter.c refuses to arm below a 2 kHz loop
   * (DYN_NOTCH_UPDATE_MIN_HZ) because its SDFT cannot resolve anything useful
   * at less, and CLAUDE.md fixes this build at 1 kHz. So a real quad running
   * a 1 kHz loop has no dynamic notch either, and this is the firmware
   * behaving correctly rather than a wiring fault. The keys are still applied
   * to the real parameter group, so they mean what they say the day the loop
   * rate rises; measured today they change nothing. See PROGRESS.md, where
   * raising the loop rate is raised as a question for a human.
   */
  U16("dyn_notch_min_hz", dn->dyn_notch_min_hz);
  U16("dyn_notch_max_hz", dn->dyn_notch_max_hz);
  U16("dyn_notch_q", dn->dyn_notch_q);
  U8("dyn_notch_count", dn->dyn_notch_count);
  U8("rpm_filter_harmonics", rf->rpm_filter_harmonics);
  U8("rpm_filter_weights_1", rf->rpm_filter_weights[0]);
  U8("rpm_filter_weights_2", rf->rpm_filter_weights[1]);
  U8("rpm_filter_weights_3", rf->rpm_filter_weights[2]);
  U8("rpm_filter_min_hz", rf->rpm_filter_min_hz);
  U16("rpm_filter_fade_range_hz", rf->rpm_filter_fade_range_hz);
  U16("rpm_filter_q", rf->rpm_filter_q);
  U16("rpm_filter_lpf_hz", rf->rpm_filter_lpf_hz);

  /* ---- Rates, fc/rc.c ---- */
  LUT8(PARAM_NAME_RATES_TYPE, r->rates_type, LUT_RATES_TYPE);
  U8("roll_rc_rate", r->rcRates[FD_ROLL]);
  U8("pitch_rc_rate", r->rcRates[FD_PITCH]);
  U8("yaw_rc_rate", r->rcRates[FD_YAW]);
  U8("roll_expo", r->rcExpo[FD_ROLL]);
  U8("pitch_expo", r->rcExpo[FD_PITCH]);
  U8("yaw_expo", r->rcExpo[FD_YAW]);
  U8("roll_srate", r->rates[FD_ROLL]);
  U8("pitch_srate", r->rates[FD_PITCH]);
  U8("yaw_srate", r->rates[FD_YAW]);
  U16("roll_rate_limit", r->rate_limit[FD_ROLL]);
  U16("pitch_rate_limit", r->rate_limit[FD_PITCH]);
  U16("yaw_rate_limit", r->rate_limit[FD_YAW]);
  LUT8("quickrates_rc_expo", r->quickRatesRcExpo, LUT_OFF_ON);
  U8(PARAM_NAME_THR_MID, r->thrMid8);
  U8(PARAM_NAME_THR_EXPO, r->thrExpo8);
  LUT8(PARAM_NAME_THROTTLE_LIMIT_TYPE, r->throttle_limit_type, LUT_THROTTLE_LIMIT_TYPE);
  U8(PARAM_NAME_THROTTLE_LIMIT_PERCENT, r->throttle_limit_percent);

  /* ---- Receiver and rc smoothing, fc/rc.c ---- */
  LUT8(PARAM_NAME_RC_SMOOTHING, x->rc_smoothing_mode, LUT_OFF_ON);
  U8(PARAM_NAME_RC_SMOOTHING_AUTO_FACTOR, x->rc_smoothing_auto_factor_rpy);
  U8(PARAM_NAME_RC_SMOOTHING_AUTO_FACTOR_THROTTLE, x->rc_smoothing_auto_factor_throttle);
  U8(PARAM_NAME_RC_SMOOTHING_SETPOINT_CUTOFF, x->rc_smoothing_setpoint_cutoff);
  U8(PARAM_NAME_RC_SMOOTHING_FEEDFORWARD_CUTOFF, x->rc_smoothing_feedforward_cutoff);
  U8(PARAM_NAME_RC_SMOOTHING_THROTTLE_CUTOFF, x->rc_smoothing_throttle_cutoff);
  U16("mid_rc", x->midrc);
  U16("min_check", x->mincheck);
  U16("max_check", x->maxcheck);
  U8("airmode_start_throttle_percent", x->airModeActivateThreshold);
  U8("fpv_mix_degrees", x->fpvCamAngleDegrees);

  /* ---- Motor output, drivers seam in bf_glue.c ---- */
  U16(PARAM_NAME_DSHOT_IDLE_VALUE, m->digitalIdleOffsetValue);
  U8(PARAM_NAME_MOTOR_POLES, m->motorPoleCount);
  U16("motor_kv", m->kv);
  U16("min_throttle", m->minthrottle);
  U16("max_throttle", m->maxthrottle);
  U16("min_command", m->mincommand);

  /* ---- Mixer ---- */
  LUT8(PARAM_NAME_MIXER_TYPE, mx->mixer_type, LUT_MIXER_TYPE);
  LUTI8("yaw_motors_reversed", mx->yaw_motors_reversed, LUT_OFF_ON);
  U8("crashflip_expo", mx->crashflip_expo);
  U8("crashflip_motor_percent", mx->crashflip_motor_percent);

  /* ---- Loop rate. Fixed at 1 kHz by CLAUDE.md; a diff that changes it
   * is applied so the value is visible, and bf_config_finish forces the
   * denominator back to 1 and says so. ---- */
  U8(PARAM_NAME_PID_PROCESS_DENOM, pc->pid_process_denom);
  LUT8("runaway_takeoff_prevention", pc->runaway_takeoff_prevention, LUT_OFF_ON);
}

/*
 * Keys that are real Betaflight and deliberately do nothing here, by
 * prefix. Each group names the subsystem this simulator does not compile.
 * Accepting them silently is correct: a pilot's own dump is full of them
 * and none of it changes how the craft flies.
 */
static const char *const INERT_PREFIX[] = {
  "osd_",        /* on screen display */
  "blackbox_",   /* logging */
  "vtx_",        /* video transmitter */
  "led_",        /* led strip */
  "gps_",        /* no GPS */
  "mag_",        /* no magnetometer */
  "baro_",       /* no barometer */
  "acc_",        /* accelerometer, and acc based modes are not flown here */
  "serial",      /* serial ports and receiver protocol */
  "telemetry_",  /* telemetry back to the radio */
  "beeper_",     /* buzzer */
  "sdcard_",     /* storage */
  "dashboard_",  /* i2c display */
  "camera_",     /* runcam control */
  "cam_",
  "esc_",        /* esc telemetry */
  "dshot_",      /* esc protocol details, see bf_glue.c for what is modelled */
  "msp_",        /* configurator link */
  "rssi_",       /* link quality */
  "sbus_",
  "spektrum_",
  "srxl2_",
  "crsf_",
  "failsafe_",   /* the link never fails here */
  "rx_",         /* receiver pulse limits */
  "gyro_calib",  /* the simulated gyro needs no calibration */
  "gyro_overflow",
  "gyro_offset",
  "gyro_high_range",
  "gyro_to_use",
  "vbat_",       /* the plant owns the pack, see plant.c */
  "ibat_",
  "bat_",
  "battery_",
  "current_meter",
  "use_vbat_alerts",
  "use_cbat_alerts",
  "cbat_",
  "force_battery",
  "motor_pwm_",
  "motor_output_reordering",
  "motor_pwm_inversion",
  "small_angle", /* an arming check; the craft is always armed */
  "gyro_cal_on_first_arm",
  "gyro_hardware", /* handled above when it is the lpf, this catches the rest */
  "pilot_name",
  "craft_name",
  "profile_name",
  "rateprofile_name",
  "board_name",
  "manufacturer_id",
  "acro_trainer_", /* USE_ACRO_TRAINER is not built for this target */
  "launch_",       /* launch control needs an arming sequence */
  "auto_profile_cell_count",
  "runaway_takeoff_deactivate",
  "rpm_limit",     /* the rpm limiter needs an ESC telemetry current loop */
  "thr_",          /* thr_mid and thr_expo are applied above */
  "max_aux_channels",
  "mixer_",        /* mixer_type is applied above */
  "3d_",
  "deadband",
  "yaw_deadband",
  "yaw_control_reversed",
  "pid_process_denom", /* applied above */
};

static int is_inert(const char *key) {
  for (unsigned i = 0; i < sizeof(INERT_PREFIX) / sizeof(INERT_PREFIX[0]); i += 1) {
    const char *pfx = INERT_PREFIX[i];
    if (strncmp(key, pfx, strlen(pfx)) == 0) {
      return 1;
    }
  }
  return 0;
}

static void store(const BfSetting *s, double num) {
  switch (s->type) {
  case T_U8: {
    long v = (long)num;
    if (v < 0) { v = 0; }
    if (v > 255) { v = 255; }
    *(uint8_t *)s->field = (uint8_t)v;
    break;
  }
  case T_U16: {
    long v = (long)num;
    if (v < 0) { v = 0; }
    if (v > 65535) { v = 65535; }
    *(uint16_t *)s->field = (uint16_t)v;
    break;
  }
  case T_I8: {
    long v = (long)num;
    if (v < -128) { v = -128; }
    if (v > 127) { v = 127; }
    *(int8_t *)s->field = (int8_t)v;
    break;
  }
  case T_I16: {
    long v = (long)num;
    if (v < -32768) { v = -32768; }
    if (v > 32767) { v = 32767; }
    *(int16_t *)s->field = (int16_t)v;
    break;
  }
  }
}

int bf_settings_apply(const char *key, const char *value, double num, int have_num) {
  for (int i = 0; i < g_count; i += 1) {
    const BfSetting *s = &g_table[i];
    if (strcmp(s->name, key) != 0) {
      continue;
    }
    if (!have_num) {
      if (s->lut == 0) {
        /* A word given for a numeric key. Betaflight's CLI rejects this,
         * and so does this: a preset with a typo must be loud. */
        return SIM_ERR_CONFIG_PARSE;
      }
      for (int k = 0; k < s->lut_n; k += 1) {
        if (strcmp(s->lut[k], value) == 0) {
          store(s, (double)k);
          g_applied += 1;
          return SIM_OK;
        }
      }
      return SIM_ERR_CONFIG_PARSE;
    }
    store(s, num);
    g_applied += 1;
    return SIM_OK;
  }
  if (is_inert(key)) {
    g_inert += 1;
    return SIM_OK;
  }
  g_unknown += 1;
  return SIM_OK;
}

int bf_settings_count(int which) {
  switch (which) {
  case 0: return g_applied;
  case 1: return g_inert;
  case 2: return g_unknown;
  case 3: return g_count;
  default: return 0;
  }
}

/*
 * `simplified_tuning apply` in a diff. Betaflight's CLI runs this the
 * moment the command appears, so the sliders set above it take effect and
 * anything set below it overrides the result, which is exactly how the
 * published Karate presets are written.
 */
void bf_settings_apply_simplified(void) {
  applySimplifiedTuning(pidProfilesMutable(0), gyroConfigMutable());
}

typedef struct {
  char *p;
  int cap;
  int n;
} DumpBuf;

static void dputc(DumpBuf *b, char c) {
  if (b->p && b->cap > 0 && b->n < b->cap - 1) {
    b->p[b->n] = c;
  }
  b->n += 1;
}

static void dputs(DumpBuf *b, const char *s) {
  while (*s) {
    dputc(b, *s);
    s += 1;
  }
}

static void dput_long(DumpBuf *b, long v) {
  char tmp[16];
  int i = 0;
  unsigned long u;
  if (v < 0) {
    dputc(b, '-');
    u = (unsigned long)(-v);
  } else {
    u = (unsigned long)v;
  }
  if (u == 0) {
    dputc(b, '0');
    return;
  }
  while (u > 0 && i < 16) {
    tmp[i] = (char)('0' + (u % 10));
    i += 1;
    u /= 10;
  }
  while (i > 0) {
    i -= 1;
    dputc(b, tmp[i]);
  }
}

static void dterm(DumpBuf *b) {
  if (b->p && b->cap > 0) {
    int i = b->n;
    if (i >= b->cap) {
      i = b->cap - 1;
    }
    b->p[i] = 0;
  }
}

static long read_num(const BfSetting *s) {
  switch (s->type) {
  case T_U8:
    return (long)*(uint8_t *)s->field;
  case T_U16:
    return (long)*(uint16_t *)s->field;
  case T_I8:
    return (long)*(int8_t *)s->field;
  case T_I16:
    return (long)*(int16_t *)s->field;
  }
  return 0;
}

static void format_value(const BfSetting *s, DumpBuf *b) {
  const long v = read_num(s);
  if (s->lut != 0 && v >= 0 && v < s->lut_n) {
    dputs(b, s->lut[v]);
    return;
  }
  dput_long(b, v);
}

static void dump_feature(DumpBuf *b, uint32_t mask, uint32_t bit, const char *name) {
  dputs(b, "feature ");
  if ((mask & bit) == 0) {
    dputc(b, '-');
  }
  dputs(b, name);
  dputc(b, '\n');
}

int bf_settings_dump(char *out, int cap) {
  DumpBuf b;
  b.p = out;
  b.cap = cap;
  b.n = 0;
  {
    const uint32_t mask = featureConfig()->enabledFeatures;
    dump_feature(&b, mask, FEATURE_AIRMODE, "AIRMODE");
    dump_feature(&b, mask, FEATURE_ANTI_GRAVITY, "ANTI_GRAVITY");
  }
  for (int i = 0; i < g_count; i += 1) {
    const BfSetting *s = &g_table[i];
    dputs(&b, "set ");
    dputs(&b, s->name);
    dputs(&b, " = ");
    format_value(s, &b);
    dputc(&b, '\n');
  }
  dterm(&b);
  return b.n;
}

int bf_settings_get(const char *key, char *out, int cap) {
  DumpBuf b;
  b.p = out;
  b.cap = cap;
  b.n = 0;
  if (key == 0) {
    return -1;
  }
  for (int i = 0; i < g_count; i += 1) {
    const BfSetting *s = &g_table[i];
    if (strcmp(s->name, key) != 0) {
      continue;
    }
    format_value(s, &b);
    dterm(&b);
    return b.n;
  }
  return -1;
}

int bf_settings_status(const char *key) {
  if (key == 0) {
    return 2;
  }
  for (int i = 0; i < g_count; i += 1) {
    if (strcmp(g_table[i].name, key) == 0) {
      return 0;
    }
  }
  if (is_inert(key)) {
    return 1;
  }
  return 2;
}
