/*
 * bridge.c: Betaflight CLI diff tokenizer. Parses "set key = value" lines
 * and hands each one to the Betaflight glue in bf/bf_glue.c, which applies
 * them onto the real Betaflight parameter group structs. This file has no
 * Betaflight includes on purpose: it is plain string handling, and the
 * control behaviour lives entirely in the vendored Betaflight sources.
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

int bridge_parse_config(const unsigned char *diff_utf8, int len) {
  bf_config_begin();
  char key[64];
  char value[64];
  int i = 0;
  while (i < len) {
    int j = i;
    while (j < len && diff_utf8[j] != '\n') {
      j += 1;
    }
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
        /* numeric parse: sign, digits, one dot */
        double num = 0.0;
        double frac = 0.0;
        double scale = 1.0;
        int have_num = 0;
        int neg = 0;
        int in_frac = 0;
        int vidx = 0;
        if (value[vidx] == '-') {
          neg = 1;
          vidx += 1;
        }
        while (value[vidx] != 0) {
          const char c = value[vidx];
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
          vidx += 1;
        }
        if (have_num) {
          num += frac / scale;
          if (neg) {
            num = -num;
          }
        }
        const int rc = bf_config_apply_setting(key, value, num, have_num);
        if (rc != SIM_OK) {
          return rc;
        }
      }
    } else if (j - k > 0) {
      /*
       * A CLI line that is not "set". Published Betaflight presets end
       * their PID section with `simplified_tuning apply`, which is a
       * command rather than a setting, and a diff also carries batch,
       * board_name, feature, profile and rateprofile lines. Both words
       * are tokenised and handed to the glue, which decides. Ignoring
       * this line class is what made the Karate presets silently flat:
       * every slider was stored and nothing ever applied them.
       */
      char w0[64];
      char w1[64];
      int wi = 0;
      while (k < j && diff_utf8[k] != ' ' && diff_utf8[k] != '\t' &&
             diff_utf8[k] != '\r' && wi < 63) {
        w0[wi] = (char)diff_utf8[k];
        wi += 1;
        k += 1;
      }
      w0[wi] = 0;
      while (k < j && (diff_utf8[k] == ' ' || diff_utf8[k] == '\t')) {
        k += 1;
      }
      wi = 0;
      while (k < j && diff_utf8[k] != ' ' && diff_utf8[k] != '\t' &&
             diff_utf8[k] != '\r' && wi < 63) {
        w1[wi] = (char)diff_utf8[k];
        wi += 1;
        k += 1;
      }
      w1[wi] = 0;
      if (w0[0] != 0 && w0[0] != '#') {
        const int rc = bf_config_apply_command(w0, w1);
        if (rc != SIM_OK) {
          return rc;
        }
      }
    }
    i = j + 1;
  }
  return bf_config_finish();
}
