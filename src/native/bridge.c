/*
 * bridge.c: the seam between the plant and Betaflight, plus the config
 * shim that parses a Betaflight CLI diff.
 *
 * Target shape per STAGE1.md: simulated gyro in, motor outputs out, with
 * Betaflight's own rc command handling, rates, PID loop and mixer compiled
 * from vendor/betaflight. The current state is the interim scaffold: the
 * config shim parses and stores the diff, and bridge_run passes throttle
 * straight to all four motors with no stabilisation at all. There is
 * deliberately no home grown PID here and there never will be one;
 * CLAUDE.md forbids approximating Betaflight, so attitude control arrives
 * only when the vendored sources are compiled in and this scaffold is
 * deleted. Until then the rate checks fail honestly.
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

static SimRates g_rates;

const SimRates *bridge_rates(void) { return &g_rates; }

/* Minimal tokenizer for "set key = value" lines. Everything else in the
 * diff (comments, batch markers, profile selectors, board_name) is
 * accepted and ignored for now. */

static int str_eq(const char *a, const char *b) {
  int i = 0;
  while (a[i] != 0 && b[i] != 0) {
    if (a[i] != b[i]) {
      return 0;
    }
    i += 1;
  }
  return a[i] == 0 && b[i] == 0;
}

static void set_defaults(void) {
  /* Betaflight 4.5 rateprofile defaults: ACTUAL rates. */
  g_rates.rates_type = 2;
  for (int a = 0; a < 3; a += 1) {
    g_rates.rc_rate[a] = 7.0;
    g_rates.expo[a] = 0.0;
    g_rates.srate[a] = 67.0;
  }
}

static int apply_set(const char *key, const char *value) {
  double num = 0.0;
  int neg = 0;
  int have_num = 0;
  {
    int i = 0;
    if (value[i] == '-') {
      neg = 1;
      i += 1;
    }
    double frac = 0.0;
    double scale = 1.0;
    int in_frac = 0;
    while (value[i] != 0) {
      const char c = value[i];
      if (c >= '0' && c <= '9') {
        if (in_frac) {
          scale *= 10.0;
          frac = frac * 10.0 + (double)(c - '0');
        } else {
          num = num * 10.0 + (double)(c - '0');
        }
        have_num = 1;
      } else if (c == '.' && !in_frac) {
        in_frac = 1;
      } else {
        have_num = 0;
        break;
      }
      i += 1;
    }
    if (have_num) {
      num += frac / scale;
      if (neg) {
        num = -num;
      }
    }
  }

  if (str_eq(key, "rates_type")) {
    if (str_eq(value, "BETAFLIGHT")) {
      g_rates.rates_type = 0;
    } else if (str_eq(value, "RACEFLIGHT")) {
      g_rates.rates_type = 1;
    } else if (str_eq(value, "KISS")) {
      g_rates.rates_type = 3;
    } else if (str_eq(value, "ACTUAL")) {
      g_rates.rates_type = 2;
    } else if (str_eq(value, "QUICK")) {
      g_rates.rates_type = 4;
    } else {
      return SIM_ERR_CONFIG_PARSE;
    }
    return SIM_OK;
  }
  if (str_eq(key, "roll_rc_rate")) { g_rates.rc_rate[0] = num; return SIM_OK; }
  if (str_eq(key, "pitch_rc_rate")) { g_rates.rc_rate[1] = num; return SIM_OK; }
  if (str_eq(key, "yaw_rc_rate")) { g_rates.rc_rate[2] = num; return SIM_OK; }
  if (str_eq(key, "roll_expo")) { g_rates.expo[0] = num; return SIM_OK; }
  if (str_eq(key, "pitch_expo")) { g_rates.expo[1] = num; return SIM_OK; }
  if (str_eq(key, "yaw_expo")) { g_rates.expo[2] = num; return SIM_OK; }
  if (str_eq(key, "roll_srate")) { g_rates.srate[0] = num; return SIM_OK; }
  if (str_eq(key, "pitch_srate")) { g_rates.srate[1] = num; return SIM_OK; }
  if (str_eq(key, "yaw_srate")) { g_rates.srate[2] = num; return SIM_OK; }
  /* Unknown keys are accepted so a full Betaflight diff loads; the
   * Betaflight port consumes the rest as it lands. */
  return SIM_OK;
}

int bridge_parse_config(const unsigned char *diff_utf8, int len) {
  set_defaults();
  char key[64];
  char value[64];
  int i = 0;
  while (i < len) {
    /* find end of line */
    int j = i;
    while (j < len && diff_utf8[j] != '\n') {
      j += 1;
    }
    /* parse "set key = value" */
    int k = i;
    while (k < j && (diff_utf8[k] == ' ' || diff_utf8[k] == '\t' || diff_utf8[k] == '\r')) {
      k += 1;
    }
    if (j - k > 4 && diff_utf8[k] == 's' && diff_utf8[k + 1] == 'e' &&
        diff_utf8[k + 2] == 't' && diff_utf8[k + 3] == ' ') {
      k += 4;
      int ki = 0;
      while (k < j && diff_utf8[k] != ' ' && diff_utf8[k] != '=' && ki < 63) {
        key[ki] = (char)diff_utf8[k];
        ki += 1;
        k += 1;
      }
      key[ki] = 0;
      while (k < j && (diff_utf8[k] == ' ' || diff_utf8[k] == '=')) {
        k += 1;
      }
      int vi = 0;
      while (k < j && diff_utf8[k] != '\r' && diff_utf8[k] != ' ' && vi < 63) {
        value[vi] = (char)diff_utf8[k];
        vi += 1;
        k += 1;
      }
      value[vi] = 0;
      if (ki > 0 && vi > 0) {
        const int rc = apply_set(key, value);
        if (rc != SIM_OK) {
          return rc;
        }
      }
    }
    i = j + 1;
  }
  return SIM_OK;
}

void bridge_reset(void) {
  /* Controller state reset arrives with the Betaflight port. */
}

void bridge_run(const SimState *s, const double rc[4],
                double duty[SIM_MOTOR_COUNT]) {
  (void)s;
  /* Interim scaffold: throttle passthrough, no stabilisation. Replaced by
   * the compiled Betaflight loop; see file header. */
  double t = rc[3];
  if (t < 0.0) {
    t = 0.0;
  }
  if (t > 1.0) {
    t = 1.0;
  }
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    duty[m] = t;
  }
}
