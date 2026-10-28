/*
 * livery.js: the paint on the pilot's own quad, the career's reward.
 *
 * Each part of the career's skill tree, flown whole, earns a livery
 * (src/career/tree.js names which), and the pilot picks the one they fly in
 * the career's Paint Shop (src/career/screens.js). It is two colours: the
 * VINYL, the cream decals on the five inch's top plate, the pack's label and
 * the zip ties, and the CHROME, the sakura printed parts (the camera cage,
 * the antenna mount and the grommets), which is the ducts on a whoop.
 *
 * WHY A TINT AND NOT A REBUILD. Each finish of src/render/herocraft.js is one
 * merged mesh whose material is white and whose colour is in its vertices,
 * so the material's own colour multiplies all of it. Setting that colour to
 * the target over the base, channel by channel in linear light, paints the
 * base exactly as the target and every shade of it in proportion: no
 * geometry, no new material, no draw call and no shader. The frame costs
 * the same in any livery.
 *
 * WHERE IT LIVES. Its own key in this browser (the Steam edition mirrors it
 * to the cloud with every other webfpv key), read at boot by src/main.js
 * without loading the career, so the quad is painted on every map and in
 * every mode, not only in a lesson. Nothing checks that a stored livery was
 * earned: it is paint, and the Paint Shop only offers earned ones.
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

/* The paint every quad is built in: herocraft.js's C.livery and C.sakura. */
export const BASE_VINYL = 0xe8dcc0;
export const BASE_CHROME = 0xe8a8b8;

/*
 * THE LIVERIES, the house paint first. Named for the part that earns them,
 * in the palette the menus are lettered in: cream, sakura, amber, mint and
 * slate, then the brighter colours a pilot's jacket takes in a room
 * (src/net/avatar.js LIVERIES), so a livery and a jacket can be matched.
 */
export const LIVERIES = Object.freeze([
  { id: 'webfpv', name: 'WebFPV', vinyl: BASE_VINYL, chrome: BASE_CHROME },
  { id: 'hover', name: 'First Hover', vinyl: 0x7dffb4, chrome: 0xf3ead4 },
  { id: 'navigator', name: 'Navigator', vinyl: 0x9db3c8, chrome: 0x5ab0ff },
  { id: 'acro', name: 'Acro', vinyl: 0xffd45c, chrome: 0x3c4048 },
  { id: 'rookie', name: 'Rookie', vinyl: 0xf3ead4, chrome: 0x7dffb4 },
  { id: 'gatekeeper', name: 'Gatekeeper', vinyl: 0xff7a59, chrome: 0xf3ead4 },
  { id: 'podium', name: 'Podium', vinyl: 0xffd45c, chrome: 0xff7a59 },
  { id: 'holeshot', name: 'Holeshot', vinyl: 0xe0e4ea, chrome: 0xff5c8a },
  { id: 'race-night', name: 'Race Night', vinyl: 0x5ab0ff, chrome: 0xffd45c },
  { id: 'tiny-whoop', name: 'Tiny Whoop', vinyl: 0xff9e3d, chrome: 0xb07cff },
  { id: 'pro-racer', name: 'Pro Racer', vinyl: 0xffd45c, chrome: 0x2f62c8 },
  { id: 'gap-hunter', name: 'Gap Hunter', vinyl: 0x3fd0c9, chrome: 0xf3ead4 },
  { id: 'flipper', name: 'Flipper', vinyl: 0xb07cff, chrome: 0xe8a8b8 },
  { id: 'segment', name: 'Segment', vinyl: 0xc9e265, chrome: 0x3c4048 },
  { id: 'proximity', name: 'Proximity', vinyl: 0x3c4048, chrome: 0x7dffb4 },
  { id: 'hibari', name: 'Hibari', vinyl: 0xe8a8b8, chrome: 0xf3ead4 },
  { id: 'lines', name: 'Lines', vinyl: 0xff5c8a, chrome: 0x3fd0c9 },
  { id: 'pro-freestyler', name: 'Pro Freestyler', vinyl: 0xe8a8b8, chrome: 0xb07cff },
  { id: 'pro', name: 'WebFPV Pro', vinyl: 0xffd45c, chrome: 0xffd45c },
]);

/* The house paint's id: the quad as it is built, which a whoop wears in its
 * own colours (src/render/whoopcraft.js). */
export const HOUSE_LIVERY = LIVERIES[0].id;

const BY_ID = new Map(LIVERIES.map((l) => [l.id, l]));

export function liveryById(id) {
  return BY_ID.get(id) || LIVERIES[0];
}

const KEY = 'webfpv.livery';

/* The livery this browser flies, or the house paint. */
export function savedLivery() {
  try {
    return liveryById(localStorage.getItem(KEY));
  } catch (e) {
    return LIVERIES[0];
  }
}

export function saveLivery(id) {
  try {
    if (!id || id === LIVERIES[0].id) {
      localStorage.removeItem(KEY);
    } else {
      localStorage.setItem(KEY, liveryById(id).id);
    }
  } catch (e) {
    /* Storage refused: the quad is painted for this visit. */
  }
}

/* One sRGB channel, 0 to 255, in linear light: what three.js's Color.setHex
 * does under its colour management, written out so this file imports
 * nothing and the career's tests can read the list. */
function linear(c8) {
  const c = c8 / 255;
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

function channels(hex) {
  return [linear((hex >> 16) & 255), linear((hex >> 8) & 255), linear(hex & 255)];
}

/* A material whose colour multiplies vertex colours painted in `base`,
 * set so that `base` is drawn as `want`. */
export function tintMaterial(mat, base, want) {
  if (!mat || !mat.color) {
    return;
  }
  const b = channels(base);
  const w = channels(want);
  const ch = (i) => (b[i] > 1e-4 ? w[i] / b[i] : 1);
  mat.color.setRGB(ch(0), ch(1), ch(2));
}

/* A livery as CSS, for the Paint Shop's swatches. */
export function cssOf(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
