/*
 * build-cost.js: how long each map takes to build, measured.
 *
 * It is its own file for one reason: src/boot.js needs the number BEFORE it
 * imports anything else, so the loading screen's stage weights are right from
 * the first frame, and importing src/maps/registry.js there would be fine
 * today and a trap tomorrow. The registry's whole job is to hold the
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
  /* Your map, measured on the starter yard (src/maps/built/starter.js, 47
   * placed assets) at 1280 by 720 on High, as the loading screen's world
   * stage: 1305, 1565 and 1190 ms, and 1209 on Low. A pilot's own map is
   * as heavy as what they put on it, so this is the weight of a full yard
   * rather than a promise about every map. */
  built: 1353,
  /* Nick Burns' house (src/maps/house/), the built map's pipeline with the
   * house as one structure of its own, measured at 1280 by 720 on High as
   * the loading screen's world stage: 1616, 1569 and 1824 ms. The starter
   * yard, loaded between them on the same container, took 3447, 3290 and
   * 3563, so this container ran slower than the day `built` was measured,
   * and the house builds in about half the yard's time. */
  house: 1670,
  /* Heads' house (src/maps/heads/), the same pipeline, measured on
   * 2026-10-20 at 1280 by 720 on High as the loading screen's world stage:
   * 1772 ms, with Nick's house at 1668 on the same container that hour. */
  heads: 1770,
  /* Joshua Bardwell's house (src/maps/bardwell/), the same pipeline,
   * measured on 2026-10-21 the same way: 1341 ms in headless Chromium.
   * Rebuilt that day from the Workshop layout, with two hundred loblolly
   * and broad trees, and measured again: 2947, 1138 and 2481 ms, Nick's
   * house 1092 and 1121 between them in the same session. */
  bardwell: 2189,
  /* Thomas More's Shop (src/maps/warehouse/), the same pipeline. An
   * estimate from Heads' house, which has the same call count and a quarter
   * more parts; measured by node scripts/shots.js when it is next run on a
   * quiet container. */
  warehouse: 1700,
  /* The 90%er goat herding map (src/maps/goats/): Heads' house and the
   * neighbourhood round it. An estimate until it is measured, below. */
  goats: 3800,
  /* Sunnyfield (src/maps/sunny/), the same pipeline, measured on
   * 2026-10-28 at 1280 by 720 on High as the loading screen's world stage:
   * 4054, 3899 and 4067 ms, with Bardwell's house at 3920 between them on
   * the same container, so it builds in about Bardwell's time. Scaled to
   * Bardwell's figure here, as this container ran slower than the day that
   * was measured. */
  sunny: 2240,
  /* Drift Matsuri (src/maps/drift/): a plot of trees and a festival round a
   * drift course. An estimate until it is measured. */
  drift: 2600,

  /* Quad Ball (src/maps/ball/): a plain arena, a few dozen boxes. An
   * estimate until it is measured. */
  ball: 900,
  /* Ridgeline MX (src/maps/moto/): a plot of trees, a track of mounds and
   * berms and ten bikes. An estimate until it is measured. */
  moto: 2400,
  /* Raicho Ridge (src/maps/alps/): its own ground, a forest, the hut, the
   * ropeway and the dam. An estimate until it is measured. */
  alps: 3600,
};
