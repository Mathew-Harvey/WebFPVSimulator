/*
 * registry.js: the maps, and the only place any of them is named.
 *
 * THE LOADERS ARE DYNAMIC IMPORTS AND THAT IS THE POINT. The freestyle city
 * is 59 vendored source files, about nineteen thousand meshes and a few
 * hundred Canvas2D textures. A player who only ever flies a track must
 * not pay for any of it: no module fetch, no geometry, no texture generation,
 * no render target. A static import at the top of main.js would fetch the
 * whole graph at boot, so the import lives inside the loader thunk and
 * nothing calls that thunk until a map is chosen. tests/lib/checks.js
 * measures that, by recording every request the page makes with a track
 * selected and asserting none of them is under src/maps/city.
 *
 * There used to be four freestyle worlds. Industrial bando, Municipal baths
 * and Bardwell's yard were removed on 2026-08-30 on the owner's ask, so
 * Freestyle offered the town and nothing else. They are in the history at
 * 974f4ce if they are ever wanted back; what is not in the history is the
 * time a player spends deciding between four things when they wanted one.
 *
 * THAT DECISION IS REVERSED FOR ONE WORLD, on the owner's ask of 24 September
 * 2026 (FREESTYLE-MAPS-PLAN.md, section 6): Freestyle offers the town and
 * Your map, the freestyle map the pilot built in the track builder, or the
 * starter yard until they have built one. Two worlds is a choice worth a
 * card each; it is not the four that were removed.
 *
 * The track world is loaded the same way, for symmetry and because the loading
 * screen then has one shape to report. It is loaded at boot because the title
 * screen has a world behind it.
 *
 * `poster` is the still the world card shows while its clip is being made.
 * A first visit to Freestyle used to be four dark rectangles with the word
 * "loading" on them for the best part of a minute, which is the worst
 * possible moment to tell somebody nothing about the place they are choosing.
 * The file is generated: `npm run gen:posters`, see scripts/posters.js, which
 * also holds the camera each one is taken from. A map with no poster falls
 * back to the rectangle, so the field is optional rather than load bearing.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { MAP_BUILD_MS } from './build-cost.js';

export const MAPS = [
  {
    id: 'custom',
    name: 'Track',
    mode: 'race',
    note: 'A track from the board, or one you built. Opening the sim loads the most flown track.',
    buildMs: MAP_BUILD_MS.custom,
    load: () => import('./custom.js'),
  },
  {
    id: 'city',
    name: 'The town',
    mode: 'freestyle',
    note: 'A whole town. No gates, no lap, no clock. Roofs, alleys, a level crossing, and a works road out to a derelict factory and the municipal pool.',
    buildMs: MAP_BUILD_MS.city,
    poster: 'assets/posters/city.jpg',
    load: () => import('./city/index.js'),
  },
  {
    id: 'built',
    name: 'Your map',
    mode: 'freestyle',
    note: 'A freestyle map you built in the builder, or Hibari Yard, the starter yard, until you have built one.',
    buildMs: MAP_BUILD_MS.built,
    load: () => import('./built/index.js'),
  },
  /*
   * NICK BURNS' HOUSE, on the owner's ask of 17 October 2026, with Nick's
   * permission: his house, its yard and its end of the street at three and
   * a half times life size (S in src/maps/house/house.js), so a five inch
   * flies it the way a whoop flies a real house. A fixed world like the
   * town, built by the built map's pipeline, and like Your map off the
   * board: the board keeps no runs for it, so nothing flown here is posted.
   */
  {
    id: 'house',
    name: "Nick Burns' house",
    mode: 'freestyle',
    note: "Nick Burns' house, flown on a whoop: every room, the stairs, the garage, the pergola, the pool and the street.",
    buildMs: MAP_BUILD_MS.house,
    /* Drawn as the whoop, the five inch's physics under it: the owner's ask
     * of 18 October 2026, "for just this map, lets introduce a new quad.
     * 75mm whoop, the flight physics don't change, but the pre launch
     * cinematic does". See buildCraft in src/render/craft.js.
     *
     * `hudScale` is the house's S (house.js), and it is what the OSD reads
     * so the flight display reads as the whoop in a real house: the owner,
     * 2026-10-21, "in the house maps the ui needs to reflect a 1s 75mm
     * whoop, so speed and battery stats need editing, the flight feel is
     * good though". Display only: see whoopHud in src/main.js. */
    craftModel: 'whoop65',
    /* Flown on the whoop and nothing else, the owner's call on bug-3261ce67
     * (2026-10-23): a five inch seated here was drawn as a whoop and flew a
     * five inch's plant, "it sounds like a 5 inch, but i think it might be
     * whoop sized". The aircraft this world is for is `craft`: choosing the
     * map seats it, and a five inch is moved off the map. See keepOffForcedMaps
     * in src/ui/ui.js. The whoop flies the five inch's plant, tune and
     * weight (simId in configs/airframes.js), so the flight is the one the
     * owner liked here, and `hudScale` still sets the OSD. */
    craft: 'whoop65',
    hudScale: 3.5,
    load: () => import('./house/index.js'),
  },
  /*
   * HEADS' HOUSE, on the owner's ask of 20 October 2026: the house and yard
   * of Heads of Infinity Loops, rebuilt from stills of their videos, at Nick
   * Burns' house's scale and flown the same way, as the whoop. Built by the
   * same pipeline (src/maps/heads/) and, like the house, off the board.
   */
  {
    id: 'heads',
    name: "Heads' house",
    mode: 'freestyle',
    note: "Heads' house from Infinity Loops, flown on a whoop: the garage, the basement, the stairs, every room, the yard and the corner.",
    buildMs: MAP_BUILD_MS.heads,
    craftModel: 'whoop65',
    craft: 'whoop65',
    hudScale: 3.5,
    load: () => import('./heads/index.js'),
  },
  /*
   * JOSHUA BARDWELL'S HOUSE, on the owner's ask of 21 October 2026: the
   * house and yard of Joshua Bardwell, outside only, at life size and
   * flown on the five inch, "no need to blow it up to make it feel like a
   * whoop map". Rebuilt the same day from the layout of the Uncrashed
   * Workshop map of it the owner sent, when the first build from stills
   * was wrong. Built by the same pipeline (src/maps/bardwell/) and, like
   * the houses, off the board.
   */
  {
    id: 'bardwell',
    name: "Joshua Bardwell's house",
    mode: 'freestyle',
    note: "Joshua Bardwell's house, flown on a five inch: the brick house and its porch, the woodshed, the pen, the drive, the field's cages and the race's gates through all of it, over the ridge and back.",
    buildMs: MAP_BUILD_MS.bardwell,
    /* The yard track out the back (src/maps/yardtrack/) is the whoop's, so
     * the whoop may be flown here too: a five inch that lands in its zone
     * is offered the swap (src/main.js), the owner's ask of 2026-10-24.
     * Choosing the map still seats the five inch. */
    whoopYard: true,
    load: () => import('./bardwell/index.js'),
  },
  /*
   * THOMAS MORE'S WAREHOUSE, on the owner's ask of 27 October 2026: the
   * exhibit builders' shop and store Thomas More flies, rebuilt from the
   * frames of his own whoop flight through it, at the houses' scale and
   * flown the same way, as the whoop. Built by the same pipeline
   * (src/maps/warehouse/) and, like the houses, off the board.
   */
  {
    id: 'warehouse',
    name: "Thomas More's Shop",
    mode: 'freestyle',
    note: "Thomas More's Shop, flown on a whoop: the dock wall, the crate aisle to the white office, the workshop, the wide doorway into the machine room, and the spray room.",
    buildMs: MAP_BUILD_MS.warehouse,
    craftModel: 'whoop65',
    craft: 'whoop65',
    hudScale: 3.5,
    load: () => import('./warehouse/index.js'),
  },
  /*
   * SUNNYFIELD, on the owner's ask of 28 October 2026 ("make a springfield
   * map", then "build it, it should be of the same detail and polish as
   * the japanese town"): a sunny cartoon American town of our own, life
   * size and flown on the five inch, with the gags a town like that has
   * and nobody's characters, names or pictures (src/maps/sunny/). Built by
   * the same pipeline and, like the houses, off the board.
   */
  {
    id: 'sunny',
    name: 'Sunnyfield',
    mode: 'freestyle',
    note: 'Sunnyfield, flown on a five inch: Main Street, the giant donut, the clock tower, the gorge, the power plant and its cooling towers, the hill with the big house, the dump, the water tower and the skate park.',
    buildMs: MAP_BUILD_MS.sunny,
    load: () => import('./sunny/index.js'),
  },
];

/* The house's document id (src/maps/house/yard.js), here so the stamps can
 * key the map without loading the house to find it (src/share/stamps.js). */
export const HOUSE_DOC_ID = 'trk-4e0b5e11';

/* Heads' house's document id (src/maps/heads/yard.js), for the same reason. */
export const HEADS_DOC_ID = 'trk-4ead5100';

/* Joshua Bardwell's house's (src/maps/bardwell/yard.js), the same way. */
export const BARDWELL_DOC_ID = 'trk-ba4dbe11';

/* Thomas More's Shop's (src/maps/warehouse/yard.js), the same way. */
export const WAREHOUSE_DOC_ID = 'trk-7a3e0f27';

/* Sunnyfield's (src/maps/sunny/yard.js), the same way. */
export const SUNNY_DOC_ID = 'trk-5a77f1e1';

export function mapById(id) {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
