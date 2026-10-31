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
    /*
     * BUILT 3.5 TIMES LIFE SIZE (S in src/maps/house/house.js), and that is
     * all this map says about scale. `mapScale` is what the world scale seam
     * reads (worldScaleFor in configs/airframes.js): the whoop, whose home is
     * a room MICRO_SCALE times life size, flies it at exactly 1, the flight
     * the owner called great, and a five inch flies it at 1 / 3.5, a real
     * five inch in a real house. The HUD reads the same number, so either
     * prints its own speed and height (hudLifeScale in src/main.js).
     *
     * Until the quad picker (2026-10-28) this map carried two stand-ins for
     * that: `craftModel`, which drew the whoop over a five inch's plant, and
     * `hudScale`, which divided the OSD by S whatever was seated. Both were
     * a five inch dressed as a whoop, which is the "whoop sized five inch"
     * of bug-3261ce67, and both are gone.
     *
     * `craft` is the aircraft this world is BUILT FOR: the one the picker
     * recommends and seats first. It no longer keeps the other off the map:
     * the owner's pick of 2026-10-28, a five inch here as a "Tight!" option.
     */
    craft: 'whoop65',
    mapScale: 3.5,
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
    /* 3.5 times life size, as Nick's house: see there. */
    craft: 'whoop65',
    mapScale: 3.5,
    load: () => import('./heads/index.js'),
  },
  /*
   * JOSHUA BARDWELL'S HOUSE, on the owner's ask of 21 October 2026: the
   * house and yard of Joshua Bardwell, outside only, at life size and
   * flown on the five inch, "no need to blow it up to make it feel like a
   * whoop map". Rebuilt the same day from the layout of a
   * community workshop map of it the owner sent, when the first build from stills
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
    /* 3.5 times life size, as Nick's house: see there. */
    craft: 'whoop65',
    mapScale: 3.5,
    load: () => import('./warehouse/index.js'),
  },
  /*
   * 90%ER GOAT HERDING, on the owner's ask of 28 October 2026: Heads' house,
   * exactly as Heads' house has it, in a whole neighbourhood made up round
   * it, and a goat for every 90%er's sticker roaming it, to be herded into
   * Heads' open garage. Built by Heads' house's pipeline (src/maps/goats/)
   * and flown the same way, as the whoop; off the board like the houses.
   */
  {
    id: 'goats',
    name: '90%er goat herding',
    mode: 'freestyle',
    note: "Heads' whole neighbourhood, flown on a whoop, with a goat for every 90%er roaming it. Fly low to herd them, and get every goat into Heads' open garage.",
    buildMs: MAP_BUILD_MS.goats,
    /* 3.5 times life size, as Heads' house: the whoop recommended, the
     * five inch a Tight! choice on the quad picker. */
    craft: 'whoop65',
    mapScale: 3.5,
    load: () => import('./goats/index.js'),
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
  /*
   * DRIFT MATSURI, on the owner's ask of 28 October 2026: a drift circuit
   * at a spring festival under the cherry blossom, after Ebisu's Minami
   * course, with drift cars battling round it in tandem, and a mini game
   * where the pilot is the camera and every take is judged on the footage
   * (src/maps/drift/, src/game/film.js). Built by the built map's pipeline
   * and flown on the five inch at life size; off the board like the houses.
   */
  {
    id: 'drift',
    name: 'Drift Matsuri',
    mode: 'freestyle',
    note: 'A drift festival under the cherry blossom. Tandem battles run the track all day: you are the camera. Chase the cars, keep them in the middle of the shot, get both in frame, and land the money shot at the clipping zones.',
    buildMs: MAP_BUILD_MS.drift,
    load: () => import('./drift/index.js'),
  },
  /*
   * QUAD BALL, on the owner's ask of 29 October 2026: "rocket league but
   * with quads". One arena, two goals, a big ball (src/maps/ball/,
   * src/game/quadball.js). Built by the built map's pipeline and flown on
   * the five inch at life size; off the board like the houses.
   */
  {
    id: 'ball',
    name: 'Quad Ball',
    mode: 'freestyle',
    note: 'A floodlit arena with a goal at each end and a ball the size of a car. Push it into the other goal.',
    buildMs: MAP_BUILD_MS.ball,
    load: () => import('./ball/index.js'),
  },
  /*
   * RIDGELINE MX, on the owner's ask of 29 October 2026 ("motor cross cam
   * chase, the bikes should rip, rail, whip and just look like IRL, all
   * single and multi player"): a motocross track on a ridge, with a pack of
   * bikes racing it, and the mini game of Drift Matsuri, the pilot the
   * camera (src/maps/moto/, src/game/film.js). Built by the built map's
   * pipeline and flown on the five inch at life size; off the board like
   * the houses.
   */
  {
    id: 'moto',
    name: 'Ridgeline MX',
    mode: 'freestyle',
    note: 'A motocross track on a ridge. Ten bikes rip it: berms, whoops, tabletops and doubles, tails out and whips off every lip. You are the camera. Chase the pack, keep a rider in the middle of the shot, and catch the whips.',
    buildMs: MAP_BUILD_MS.moto,
    load: () => import('./moto/index.js'),
  },
  /*
   * RAICHO RIDGE, on the owner's ask of 31 October 2026 (the map doc's
   * section 1, "Mountain Open", built on the town's manga look): a Japanese
   * Alps ridge of our own with a mountain hut on the col, a ropeway down
   * the south face, a lake and its dam in the valley (src/maps/alps/).
   * Built by the built map's pipeline on its own ground and flown on the
   * five inch at life size; off the board like the houses.
   */
  {
    id: 'alps',
    name: 'Raicho Ridge',
    mode: 'freestyle',
    note: 'A high ridge in the Japanese Alps. Dive the south face from the col, slalom the ropeway towers, thread the mountain hut, and drop to the lake to gap the dam spillway.',
    buildMs: MAP_BUILD_MS.alps,
    load: () => import('./alps/index.js'),
  },
  /*
   * KUMOI TOWERS, on the owner's ask of 31 October 2026 (a tower city to
   * dive, built by Opus, "the maps to feel like manga comic like the
   * town"): a tower district after Nishi-Shinjuku, its old drinking lanes
   * under the viaduct and a tower going up, in the town's cel kit and ink
   * with the towers' window grids painted (src/maps/towers/). Built by the
   * built map's pipeline and flown on the five inch at life size; off the
   * board like the houses.
   */
  {
    id: 'towers',
    name: 'Kumoi Towers',
    mode: 'freestyle',
    note: 'A tower city to dive. Twin crowns from the very top, a sky garden with a hole in it, a narrow slot between two towers, a steel frame going up under two cranes, the expressway, the viaduct, and the old lanes under it all.',
    buildMs: MAP_BUILD_MS.towers,
    load: () => import('./towers/index.js'),
  },
  /*
   * BAKUON DOME, on the owner's ask of 31 October 2026 (a stadium map
   * with monster trucks, "the maps to feel like manga comic like the
   * town"): a dirt floored dome with four trucks running jumps under a
   * trussed roof (src/maps/dome/). Built by the built map's pipeline and
   * flown on the five inch at life size; off the board like the houses.
   */
  {
    id: 'dome',
    name: 'Bakuon Dome',
    mode: 'freestyle',
    note: 'A dirt floored dome with four monster trucks jumping cars and buses under its roof. Chase them over the ramps, thread the roof trusses and strafe the stands.',
    buildMs: MAP_BUILD_MS.dome,
    load: () => import('./dome/index.js'),
  },
  /*
   * KODAMA ONSEN, on the owner's ask of 31 October 2026 (a cedar forest
   * with an abandoned area, in the town's manga look): an abandoned hot
   * spring inn in a Japanese cedar plantation, with a shrine up the hill
   * behind it, our own place built from the real kind of place
   * (src/maps/cedar/). Life size and flown on the five inch, built by the
   * built map's pipeline and, like the houses, off the board.
   */
  {
    id: 'cedar',
    name: 'Kodama Onsen',
    mode: 'freestyle',
    note: 'An abandoned hot spring inn in a cedar forest, flown on a five inch: rows of cedars to slalom, the inn and its bathhouse, the storehouse, a brick chimney, a line of torii and a tunnel of them, the stream and its bridges, and the shrine up the steps.',
    buildMs: MAP_BUILD_MS.cedar,
    load: () => import('./cedar/index.js'),
  },
  /*
   * HOSHINO SHOJI, on the owner's ask of 31 October 2026 for a map from each
   * section of the list of new map ideas, built as a Japanese office: a
   * small trading company's three storey building, goods in on the ground
   * floor, the sales floor and the management floor over it, the roof and
   * the street (src/maps/office/). Flown on a whoop at 3.5 times life size,
   * as Thomas More's Shop is.
   */
  {
    id: 'office',
    name: 'Hoshino Shoji',
    mode: 'freestyle',
    note: 'A trading company after hours, flown on a whoop: the racking downstairs, the desk islands and the meeting booth on the sales floor, the boardroom and the president\'s room upstairs, an empty lift shaft from the top floor to the ground, and the roof.',
    buildMs: MAP_BUILD_MS.office,
    craft: 'whoop65',
    mapScale: 3.5,
    load: () => import('./office/index.js'),
  },
  /*
   * TANADA RX, section 19 of the owner's map list of 31 October 2026: a
   * rallycross circuit of tarmac and gravel with a jump and a joker, under
   * a hillside of rice terraces, with a pack of rallycross cars racing it
   * (src/maps/rally/). Built by the built map's pipeline in the town's
   * look, flown on the five inch at life size; off the board like Ridgeline
   * MX.
   */
  {
    id: 'rally',
    name: 'Tanada RX',
    mode: 'freestyle',
    note: 'A rallycross circuit of tarmac and gravel under a hillside of rice terraces. Six cars race it, sideways through the hairpins and long over the jump. Chase them over it, thread the grandstand roof, and find the gaps.',
    buildMs: MAP_BUILD_MS.rally,
    load: () => import('./rally/index.js'),
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

/* The 90%er goat herding map's (src/maps/goats/yard.js), the same way. */
export const GOATS_DOC_ID = 'trk-90a7c0a7';
/* Sunnyfield's (src/maps/sunny/yard.js), the same way. */
export const SUNNY_DOC_ID = 'trk-5a77f1e1';

/* Drift Matsuri's (src/maps/drift/yard.js), the same way. */
export const DRIFT_DOC_ID = 'trk-d81f7a75';

/* Quad Ball's (src/maps/ball/arena.js), the same way. */
export const BALL_DOC_ID = 'trk-ba11b0a1';
/* Ridgeline MX's (src/maps/moto/yard.js), the same way. */
export const MOTO_DOC_ID = 'trk-3c07e5a1';
/* Kumoi Towers' (src/maps/towers/yard.js), the same way. */
export const TOWERS_DOC_ID = 'trk-70e15c10';
/* Bakuon Dome's (src/maps/dome/yard.js), the same way. */
export const DOME_DOC_ID = 'trk-b4d0e0e1';

/* Kodama Onsen's (src/maps/cedar/yard.js), the same way. */
export const CEDAR_DOC_ID = 'trk-ced4a0e5';

/* Raicho Ridge's (src/maps/alps/yard.js), the same way. */
export const ALPS_DOC_ID = 'trk-a195a1e5';
/* Hoshino Shoji's (src/maps/office/yard.js), the same way. */
export const OFFICE_DOC_ID = 'trk-0f1ce5a1';

/* Tanada RX's (src/maps/rally/yard.js), the same way. */
export const RALLY_DOC_ID = 'trk-7a11c0b5';

export function mapById(id) {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
