/*
 * bf_settings.h: interface to the Betaflight CLI setting table in
 * bf_settings.c. Included by bf_glue.c only; bridge.c stays free of
 * Betaflight headers.
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

#ifndef BF_SETTINGS_H
#define BF_SETTINGS_H

/* Build the key table against the live parameter groups. Call after the
 * groups have been reset to Betaflight defaults. */
void bf_settings_build(void);

/* Apply one "set key = value" line. Returns SIM_OK when the key was
 * applied, accepted as inert or unrecognised, and SIM_ERR_CONFIG_PARSE
 * only when a known key was given a value it cannot hold. */
int bf_settings_apply(const char *key, const char *value, double num, int have_num);

/* Counters since the last bf_settings_build:
 *   0 applied, 1 inert, 2 unknown, 3 table size. */
int bf_settings_count(int which);

/* Run Betaflight's config/simplified_tuning.c over the current profile,
 * which is what the `simplified_tuning apply` CLI line does. */
void bf_settings_apply_simplified(void);

#endif /* BF_SETTINGS_H */
