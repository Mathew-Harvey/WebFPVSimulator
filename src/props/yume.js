/*
 * yume.js: the colours of Yumeboshi Land (src/maps/yume/), a theme park
 * with a roller coaster, a big wheel, a carousel, a drop tower, teacups, a
 * swing ride, a swinging ship, a castle and a lake. A family with no
 * assets, as ./park.js is: every colour the kit draws has to be in the
 * kit's table, so this is the theme park's share of it and nothing else
 * (./catalog.js, FAMILIES).
 *
 * THE TOWN'S HAND. The owner asked for every new map to feel like a manga
 * comic, like the town, so the paving, the stone, the concrete, the water
 * and every shadow tint are the town's own (src/maps/city/vendored/core/
 * palette.js), as Hinode Park's are. A theme park is louder than a ward
 * park, so the rides' candy colours are here too, but each is pulled
 * into the town's pale, warm, slightly hazy range and given a cool violet
 * shadow, so the coaster's red beside the town's utility pole looks drawn
 * by the same hand. The kit bakes one batch per colour per chunk and the
 * map merges each chunk's batches into one a look (src/maps/sunny/
 * palette.js), so a colour costs no draw of its own.
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

/* The town's shadow tints. */
const T = 0x6f6790;
const TD = 0x5c5680;

export const MATERIALS = {
  /* the ground: plaza paving in three tones, the paths, the turf, kerbs */
  ymPave: { c: 0xe2d9cf, tint: 0x847c9c },
  ymPaveAlt: { c: 0xd3c6be, tint: 0x7c7496 },
  ymPaveRose: { c: 0xe6c3bd, tint: 0x86708e },
  ymPath: { c: 0xe0d3bc, tint: 0x857c98 },
  ymTurfDeep: { c: 0x82aa79, tint: 0x557078 },
  ymKerb: { c: 0xc7c2d0, tint: TD },
  /* concrete, stone, rock */
  ymConcrete: { c: 0xd9d5dd, tint: TD },
  ymConcreteDark: { c: 0xa7a2b0, tint: 0x655d84 },
  ymStone: { c: 0xc6c0cb, tint: 0x66607e },
  ymStoneDark: { c: 0xa39daf, tint: 0x5c5680 },
  ymRock: { c: 0xb3a29a, tint: 0x5f5476 },
  ymRockDark: { c: 0x8f8088, tint: 0x4f4668 },
  ymMoss: { c: 0x7d9c74, tint: 0x4f6878 },
  /* water: the town's pond */
  ymWater: { f: 0x93b8ce, noCast: true },
  /* steel */
  ymSteel: { c: 0xb8bcc6, tint: 0x666090 },
  ymSteelDark: { c: 0x878b96, tint: TD },
  ymWhite: { c: 0xf6f3ee, tint: 0x8a83a8 },
  /* Ryusei: red rails on a cream spine, teal columns */
  ymCoasterRail: { c: 0xe0453f, tint: 0x7a3a5a },
  ymCoasterSpine: { c: 0xf1e6d2, tint: 0x857c9c },
  ymCoasterLeg: { c: 0x4f9ea0, tint: 0x345468 },
  /* the rides' candy */
  ymRed: { c: 0xe0524a, tint: 0x7a3a5a },
  ymPink: { c: 0xf39cbe, tint: 0x9a6a98 },
  ymRose: { c: 0xe8758f, tint: 0x8a4a72 },
  ymYellow: { c: 0xf4c033, tint: 0x80704a },
  ymGold: { c: 0xe0b44c, tint: 0x7a6a5a },
  ymBlue: { c: 0x4f7fcc, tint: 0x3a4072 },
  ymSky: { c: 0x8cc3e6, tint: 0x4f6a90 },
  ymMint: { c: 0x9fd8bf, tint: 0x557a84 },
  ymPurple: { c: 0x7a62b8, tint: 0x45386e },
  ymOrange: { c: 0xf08a3c, tint: 0x80504e },
  ymCream: { c: 0xf6ecd6, tint: T },
  /* buildings: walls and roofs */
  ymWallCream: { c: 0xf0e4cc, tint: T },
  ymWallPink: { c: 0xf2cfd0, tint: 0x8a6a8c },
  ymWallMint: { c: 0xcfe6d6, tint: 0x6a7a90 },
  ymWallSky: { c: 0xcfe0ee, tint: 0x6a7090 },
  ymWallLemon: { c: 0xf3e6a8, tint: 0x80745a },
  ymWallDark: { c: 0x5d5668, tint: 0x3b3550 },
  ymRoofRed: { c: 0xc8504a, tint: 0x6a3a5e },
  ymRoofBlue: { c: 0x4d6aa8, tint: 0x353a60 },
  ymRoofTeal: { c: 0x3f8a8c, tint: 0x344c62 },
  ymRoofPurple: { c: 0x6a5498, tint: 0x3d3260 },
  ymRoofSlate: { c: 0x59617a, tint: 0x3b3e64 },
  ymWood: { c: 0xb0917a, tint: 0x6a5578 },
  ymWoodDark: { c: 0x765f62, tint: 0x4f4060 },
  ymGlass: { f: 0x9cc0dc, noCast: true },
  ymGlassDark: { f: 0x4a5670, noCast: true },
  ymLamp: { f: 0xfff2d6, noCast: true },
  /* the haunted house and the dragon */
  ymGhost: { c: 0xeef0f6, tint: 0x8088b0 },
  ymDragon: { c: 0x4f9a6a, tint: 0x2f5a5a },
  ymDragonDark: { c: 0x3a7556, tint: 0x284a52 },
  ymTooth: { c: 0xfbf6ea, tint: 0x8a83a8 },
  /* the park's own trees: round puffs of leaf, a cherry's pink, a pine's
   * stacked cones, and their bark */
  ymLeaf: { c: 0x86b86c, tint: 0x4f6e7c, noReceive: true, foliage: true },
  ymLeafDeep: { c: 0x6c9f5f, tint: 0x456478, noReceive: true, foliage: true },
  ymLeafLight: { c: 0xa3cc78, tint: 0x5a7680, noReceive: true, foliage: true },
  ymSakura: { c: 0xf4bccf, tint: 0xd8b2c6, noReceive: true, foliage: true },
  ymSakuraDeep: { c: 0xec9fbc, tint: 0xc99cba, noReceive: true, foliage: true },
  ymPine: { c: 0x5a9070, tint: 0x3f5a72 },
  ymPineDeep: { c: 0x477c60, tint: 0x37506a },
  ymBark: { c: 0x8a6a5a, tint: 0x55466a },
  /* flowers in the beds, under the trees */
  ymFlowerPink: { c: 0xf39cbe, tint: 0x9a6a98, noReceive: true },
  ymFlowerYellow: { c: 0xf6d75a, tint: 0x8a7a50, noReceive: true },
  ymFlowerBlue: { c: 0x6f8fd8, tint: 0x45507a, noReceive: true },
};
