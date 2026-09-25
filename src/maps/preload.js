/*
 * preload.js: the modules each lazily loaded map adds to the page, so
 * main.js can ask for all of them the moment the map is chosen rather than
 * letting the browser find them one import level at a time. See
 * scripts/gen-preload.js for why, and for the boot graph's half of the same
 * job, which lives in index.html.
 *
 * Paths are relative to src/. Everything under the marker is written by
 * `node scripts/gen-preload.js`; `npm run lint:preload` fails when it is
 * stale. A stale list costs speed, never correctness: a module left out is
 * found the slow way, and one that no longer exists is a failed hint.
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

// GENERATED BELOW
export const MAP_PRELOAD = {
  city: [
    'maps/city/index.js',
    'maps/city/vendored/core/palette.js',
    'maps/city/vendored/core/post.js',
    'maps/city/vendored/core/sky.js',
    'maps/city/vendored/core/toon.js',
    'maps/city/vendored/core/textures.js',
    'maps/city/vendored/core/util.js',
    'maps/city/vendored/core/outline.js',
    'maps/city/vendored/world/index.js',
    'maps/city/vendored/world/street.js',
    'maps/city/vendored/world/landform.js',
    'maps/city/vendored/world/railway.js',
    'maps/city/vendored/world/planet.js',
    'maps/city/vendored/world/hills.js',
    'maps/city/vendored/world/lakeform.js',
    'maps/city/vendored/world/train.js',
    'maps/city/vendored/world/shop.js',
    'maps/city/vendored/world/vending.js',
    'maps/city/vendored/world/buildings.js',
    'maps/city/vendored/world/trees.js',
    'maps/city/vendored/world/tunnel.js',
    'maps/city/vendored/world/ground.js',
    'maps/city/vendored/world/props.js',
    'maps/city/vendored/world/urayama.js',
    'maps/city/vendored/world/plots.js',
    'maps/city/vendored/world/streetprops.js',
    'maps/city/vendored/world/lake.js',
    'maps/city/vendored/world/lakeroad.js',
    'maps/city/vendored/world/vehicles.js',
    'maps/city/vendored/world/kohan.js',
    'maps/city/vendored/world/shops.js',
    'maps/city/vendored/world/school.js',
    'maps/city/vendored/world/approach.js',
    'maps/city/vendored/world/shrine.js',
    'maps/city/vendored/world/shotengai.js',
    'maps/city/vendored/world/showa.js',
    'maps/city/vendored/world/canal.js',
    'maps/city/vendored/world/district.js',
    'maps/city/vendored/world/overbridge.js',
    'maps/city/vendored/world/restcorner.js',
    'maps/city/vendored/world/library.js',
    'maps/city/vendored/world/northblock.js',
    'maps/city/vendored/world/housing.js',
    'maps/city/vendored/world/alleys.js',
    'maps/city/vendored/world/matsuri.js',
    'maps/city/vendored/world/onsen.js',
    'maps/city/vendored/world/ichome.js',
    'maps/city/vendored/world/blocks.js',
    'maps/city/vendored/world/nichome.js',
    'maps/city/vendored/world/yonchome.js',
    'maps/city/vendored/world/koenmae.js',
    'maps/city/vendored/world/tsugakuro.js',
    'maps/city/vendored/world/uramachi.js',
    'maps/city/vendored/world/gakkomae.js',
    'maps/city/vendored/world/kawabata.js',
    'maps/city/vendored/world/rokuchome.js',
    'maps/city/vendored/world/nanachome.js',
    'maps/city/vendored/world/traffic.js',
    'maps/city/vendored/world/details.js',
    'maps/city/vendored/world/petals.js',
    'maps/city/animation.js',
    'maps/city/bake.js',
    'maps/city/references.js',
    'maps/city/places/index.js',
    'maps/city/places/road.js',
    'maps/city/places/kit.js',
    'maps/city/places/works.js',
    'maps/city/places/signs.js',
    'maps/city/places/pool.js',
    'maps/city/places/training.js',
    'maps/city/places/blossom.js',
    'art/stf.js',
    'maps/city/drawn.js',
  ],
  built: [
    'maps/built/index.js',
    'maps/city/vendored/core/palette.js',
    'maps/city/vendored/core/post.js',
    'maps/city/vendored/core/sky.js',
    'maps/city/vendored/core/toon.js',
    'maps/city/vendored/core/textures.js',
    'maps/city/vendored/core/util.js',
    'maps/city/vendored/core/outline.js',
    'props/kit.js',
    'maps/city/vendored/world/vehicles.js',
    'maps/city/vendored/world/props.js',
    'maps/city/vendored/world/street.js',
    'maps/city/vendored/world/landform.js',
    'maps/city/vendored/world/vending.js',
    'props/catalog.js',
    'props/buildings.js',
    'props/parts.js',
    'props/trig.js',
    'props/textures.js',
    'props/industrial.js',
    'props/street.js',
    'props/skate.js',
    'props/course.js',
    'props/solids.js',
    'art/stf.js',
    'maps/built/place.js',
    'maps/built/starter.js',
    'maps/built/looks.js',
    'maps/built/egg.js',
  ],
};
