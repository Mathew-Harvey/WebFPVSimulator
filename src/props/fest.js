/*
 * fest.js: the colours of Tonbo Fest (src/maps/fest/), the drone racing
 * festival on the river's sports ground under the levee. A family with no
 * assets, as ./sunny.js is: the place is built in its own map's files, but
 * every colour the kit draws has to be in the kit's table, so this is the
 * festival's share of it and nothing else (./catalog.js, FAMILIES).
 *
 * The kit bakes one batch per material per chunk, and the map then folds
 * each chunk's plain batches into one a look with the colour on the
 * vertices (src/maps/sunny/palette.js), so a colour costs no draw of its
 * own. The festival's loud colours (the inflatables, the tents, the stalls)
 * are the colours Drift Matsuri, Quad Ball and Ridgeline MX already paint
 * in; these are what a river ground adds: water, levee concrete, ballast,
 * the sluice gate's blue, the nets' green, the dragonfly's own, and the
 * ground's dirt. The shadow tints are the town's cool violets, so the field
 * sits in the town's light.
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

const T = 0x6f6790;
const TD = 0x5c5680;

export const MATERIALS = {
  /* The river: a flat blue the way the manga page colours water, and the
   * white strokes of its ripples. */
  fsWater: { c: 0x7fb0c8, tint: 0x5a6a92, noCast: true },
  fsRipple: { f: 0xeaf4f6, noCast: true },
  /* The ground: the walks' crushed stone, the diamond's dirt and the
   * infield's worn grass. */
  fsGravel: { c: 0xcdbfa6, tint: T, noCast: true },
  fsDirt: { c: 0xb98c62, tint: 0x6a4a5e, noCast: true },
  fsGrass2: { c: 0x8fb37a, tint: 0x55707a, noCast: true },
  /* The levee's weathered steps, the railway's ballast and masts, the
   * truss's grey green, the sluice gate's blue and its machine house. */
  fsLevee: { c: 0xc9c3bc, tint: 0x6a6288 },
  fsBallast: { c: 0x8f8a86, tint: TD },
  fsMast: { c: 0x9aa4a0, tint: TD },
  fsTruss: { c: 0x8fa8a0, tint: 0x56607e },
  fsSluiceBlue: { c: 0x4f86b8, tint: 0x3f4a78 },
  fsSluiceBlueDeep: { c: 0x3e6e9c, tint: 0x353f6c },
  fsSluiceHouse: { c: 0xe8e2d6, tint: T },
  /* The ground's green safety nets, their posts. */
  fsNet: { c: 0x3f8c60, tint: 0x2f4f5a },
  fsNetPost: { c: 0x5f8f6e, tint: 0x3f4f62 },
  /* The festival: the arch's red, a partner banner's cream field, the
   * pilots' canopy, a quad's props, the stage's floor, truss and roof. */
  fsInflateRed: { c: 0xe8463c, tint: 0x7a3a5a },
  fsBannerField: { c: 0xf3ead4, tint: 0xa89cb4, noCast: true },
  fsCanopy: { c: 0x2e8a8c, tint: 0x2f4f6a },
  fsProp: { c: 0xf0721e, tint: 0x80482e, noCast: true },
  fsStageFloor: { c: 0x45404e, tint: 0x2c2838, noCast: true },
  fsTrussSilver: { c: 0xc4cad2, tint: 0x6a6490 },
  fsRoofSkin: { c: 0xf2f0ec, tint: 0x8a82a8 },
  /* The tonbo: a dragonfly's red body, its big green eyes, its wings. */
  fsTonboBody: { c: 0xe0552e, tint: 0x7a3a50 },
  fsTonboEye: { c: 0x52b07a, tint: 0x2f5a5a },
  fsTonboWing: { c: 0xd8eef2, tint: 0x8a9ab8, noCast: true },
  /* Blue picnic sheets, the park's green benches, a balloon, the loos. */
  fsTarp: { c: 0x3f7fd0, tint: 0x2e4a7a, noCast: true },
  fsBench: { c: 0x4f8a5a, tint: 0x3a4f5a },
  fsBalloonA: { c: 0xf2a6bd, tint: 0x9a6a8a },
  fsLooBlue: { c: 0x3a78b8, tint: 0x2e4a7a },
};
