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
 * Industrial bando is the same kind of isolation: it copies the cel kit into
 * src/maps/bando/cel rather than importing the city's, so choosing that world
 * does not fetch a single city module, and choosing the city does not fetch
 * the bando. Municipal baths and Bardwell's yard copy the cel kit the same way.
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
    name: 'Freestyle city',
    mode: 'freestyle',
    note: 'A whole town. No gates, no lap, no clock. Roofs, alleys, a level crossing, and a works road out to a derelict factory and the municipal pool.',
    buildMs: MAP_BUILD_MS.city,
    poster: 'assets/posters/city.jpg',
    load: () => import('./city/index.js'),
  },
  {
    id: 'bando',
    name: 'Industrial bando',
    mode: 'freestyle',
    note: 'A cement works. Dive the stack, fly the kiln. No gates, no lap, no clock.',
    buildMs: MAP_BUILD_MS.bando,
    poster: 'assets/posters/bando.jpg',
    load: () => import('./bando/index.js'),
  },
  {
    id: 'baths',
    name: 'Municipal baths',
    mode: 'freestyle',
    note: 'A 50 m hall and a lido. Loop the bars, split-S the bulkhead. No gates, no lap, no clock.',
    buildMs: MAP_BUILD_MS.baths,
    poster: 'assets/posters/baths.jpg',
    load: () => import('./baths/index.js'),
  },
  {
    id: 'yard',
    name: "Bardwell's yard",
    mode: 'freestyle',
    note: 'A 2.5 acre homestead. Deck, barn, missing fence rail. No gates, no lap, no clock.',
    buildMs: MAP_BUILD_MS.yard,
    poster: 'assets/posters/yard.jpg',
    load: () => import('./yard/index.js'),
  },
];

export function mapById(id) {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
