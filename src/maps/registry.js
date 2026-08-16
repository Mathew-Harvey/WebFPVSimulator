/*
 * registry.js: the two maps, and the only place either one is named.
 *
 * THE LOADERS ARE DYNAMIC IMPORTS AND THAT IS THE POINT. The freestyle city
 * is 59 vendored source files, about nineteen thousand meshes and a few
 * hundred Canvas2D textures. A player who only ever flies the race field must
 * not pay for any of it: no module fetch, no geometry, no texture generation,
 * no render target. A static import at the top of main.js would fetch the
 * whole graph at boot, so the import lives inside the loader thunk and
 * nothing calls that thunk until a map is chosen. tests/lib/checks.js
 * measures that, by recording every request the page makes with the race
 * field selected and asserting none of them is under src/maps/city.
 *
 * The race field is loaded the same way, for symmetry and because the loading
 * screen then has one shape to report. It is loaded at boot because the title
 * screen has a world behind it.
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

import { MAP_BUILD_MS } from './build-cost.js';

export const MAPS = [
  {
    id: 'field',
    name: 'Race field',
    mode: 'race',
    note: 'The MultiGP circuit. Fourteen stations, a lap clock and a track record.',
    buildMs: MAP_BUILD_MS.field,
    load: () => import('./field.js'),
  },
  {
    id: 'custom',
    name: 'Custom map',
    mode: 'race',
    note: 'A course you built, or one you picked from the board. Choose this to fly it, pick another, or make one.',
    buildMs: MAP_BUILD_MS.custom,
    load: () => import('./custom.js'),
  },
  {
    id: 'city',
    name: 'Freestyle city',
    mode: 'freestyle',
    note: 'A whole town. No gates, no lap, no clock. Roofs, alleys and a level crossing.',
    buildMs: MAP_BUILD_MS.city,
    load: () => import('./city/index.js'),
  },
];

export function mapById(id) {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
