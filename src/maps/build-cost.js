/*
 * build-cost.js: how long each map takes to build, measured.
 *
 * It is its own file for one reason: src/boot.js needs the number BEFORE it
 * imports anything else, so the loading screen's stage weights are right from
 * the first frame, and importing src/maps/registry.js there would be fine
 * today and a trap tomorrow. The registry's whole job is to hold the two
 * loader thunks, and the day somebody turns one of those dynamic imports into
 * a static one the city's 59 file graph would arrive at boot for every
 * player, which is exactly what deliverable 4 forbids. A file with two
 * numbers in it cannot do that.
 *
 * Measured on this container at 1280 by 720 across three runs. The city's
 * world build was 7554, 7646 and 8782 ms; the field's 2886 and 3042. These
 * are weights for a progress bar, so the spread does not matter much, but
 * replace them with a re-measurement rather than a guess.
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

export const MAP_BUILD_MS = {
  field: 2964,
  /* The same world as the field, with a designed course in place of the
   * built in one. A ten gate track builds a little faster than fourteen
   * stations, and the terrain, grass and scenery, which are most of the
   * cost, are identical. Close enough to the field's figure that giving it
   * its own would be pretending to a precision the loading bar does not
   * have. */
  custom: 2964,
  city: 7994,
  /* Compact cement works. Measured on the first kiln load in this session. */
  bando: 4046,
};
