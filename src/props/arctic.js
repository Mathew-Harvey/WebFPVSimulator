/*
 * arctic.js: the colours of Hyoura Island (src/maps/arctic/), the drift ice
 * coast. A family with no assets, as ./sunny.js is: the island is one
 * particular place, built in its own map's files, but every colour the kit
 * draws has to be in the kit's table, so this is the island's share of it
 * and nothing else (./catalog.js, FAMILIES).
 *
 * The palette is the town's, carried into winter: snow is the town's paper
 * white with its violet shadow, rock and basalt are the slate of its roofs
 * taken darker, ice is a pale cyan that goes to a deep teal in the shade
 * rather than to grey, and the hamlet's sheds and boats are the faded
 * colours of a working harbour (weathered board, tin roofs in red and blue,
 * buoys in orange). The cel shading and the comic layer's hatching do the
 * rest, as they do in the town: a shaded face of a cliff carries the pen's
 * strokes, and the ink pass draws every column of the basalt.
 *
 * The map merges each chunk's batches into one a look with the colour on
 * the vertices (src/maps/sunny/palette.js), so a colour here costs no draw
 * call of its own.
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

/* The town's shadow tints, and the cold one snow and ice take. */
const T = 0x6f6790;
const TD = 0x5c5680;
const COLD = 0x7f84b8;

export const MATERIALS = {
  /* the land: snow on the level, rock where it is too steep to hold, the
   * basalt of the sea cliffs, and the grey shingle at the water */
  arSnow: { c: 0xf6f3f7, tint: COLD },
  arSnowDirty: { c: 0xe2dde4, tint: 0x77739e },
  arRock: { c: 0x6c7086, tint: 0x3f3d5e },
  arBasalt: { c: 0x535a70, tint: 0x33344f },
  arBasaltPale: { c: 0x6a7188, tint: 0x3b3c5a },
  arShingle: { c: 0x8d8b98, tint: 0x55516f },
  /* ice: a floe's top, an iceberg's walls and its deep blue cracks */
  arIce: { c: 0xdff3f7, tint: 0x6f92bc },
  arIceDeep: { c: 0x9fd4e6, tint: 0x4f73a6 },
  arIceBlue: { c: 0x6fb6d6, tint: 0x3d5c94 },
  arIcicle: { c: 0xe8f8fc, tint: 0x7f9cc6, noCast: true },
  /* the sea, and the water that falls into it */
  arSea: { c: 0x46708a, tint: 0x2e3f66, noCast: true },
  arFoam: { f: 0xf4fbfd, noCast: true },
  arFall: { c: 0xd8f0f6, tint: 0x7e9cc8, noCast: true },
  /* the harbour: concrete, weathered board, tin roofs, paint */
  arConcrete: { c: 0xc9c5cf, tint: TD },
  arConcreteDark: { c: 0x9b97a6, tint: 0x55506f },
  arTetra: { c: 0xb8b4bf, tint: 0x5a5576 },
  arBoard: { c: 0x75605a, tint: 0x45394f },
  arBoardPale: { c: 0x9a8676, tint: 0x584a5c },
  arTinRed: { c: 0xb4544a, tint: 0x5e3c5c },
  arTinBlue: { c: 0x50709e, tint: 0x353f68 },
  arTinGreen: { c: 0x5f8a74, tint: 0x3a5064 },
  arWallWhite: { c: 0xf2efe8, tint: 0x8a83a8 },
  arWallCream: { c: 0xeee2c8, tint: 0x857a98 },
  arBand: { c: 0x3f62a0, tint: 0x2f3966 },
  arRed: { c: 0xd2443c, tint: 0x6a3a5e },
  arWhite: { c: 0xfbf9f4, tint: 0x8a83a8 },
  arYellow: { c: 0xf2c43c, tint: 0x80704e },
  arOrange: { c: 0xf08a34, tint: 0x80504e },
  arIron: { c: 0x2f2e38, tint: 0x22202e },
  arSteel: { c: 0x9aa3ad, tint: 0x5c5a7c },
  arRust: { c: 0x9a5a40, tint: 0x5a3e58 },
  arTyre: { c: 0x2c2b31, tint: 0x1e1d28 },
  arHull: { c: 0xf4f2ee, tint: 0x857fa4 },
  arHullBlue: { c: 0x3b5d92, tint: 0x2c3460 },
  arNet: { c: 0x3f7a62, tint: 0x2f4a5c },
  arSalmon: { c: 0xe0805a, tint: 0x7a4a5a },
  arKelp: { c: 0x3c4434, tint: 0x2a2c34, noCast: true },
  arFishBox: { c: 0x4a86c0, tint: 0x334e7a },
  arWood: { c: 0xa87a52, tint: 0x5e4a62 },
  arTorii: { c: 0xd9483a, tint: 0x6e3a5c },
  arGlass: { f: 0x7fa6c8, noCast: true },
  arGlassDark: { f: 0x3a4a66, noCast: true },
  arLamp: { f: 0xfff2c8, noCast: true },
  arLampRed: { f: 0xff5a4a, noCast: true },
  arLampGreen: { f: 0x6af0a0, noCast: true },
  arAsphalt: { c: 0x666474, tint: 0x433f5e },
  arLine: { f: 0xf2f0ea, noCast: true },
  arLineYellow: { f: 0xf2c84a, noCast: true },
  /* the firs: needles, and the bark */
  arFir: { c: 0x3f6656, tint: 0x2c3e52 },
  arFirDark: { c: 0x30524a, tint: 0x24324a },
  arBark: { c: 0x5a463e, tint: 0x3a3048 },
  /* the seals on the floes, and a sea eagle's white */
  arSeal: { c: 0x8b8796, tint: 0x4c4864 },
  arSealDark: { c: 0x5c5866, tint: 0x3a3650 },
  /* the snow poles' stripes, the road mirror, the bear sign */
  arPoleRed: { c: 0xe0483a, tint: 0x7a3a5a },
  arMirror: { c: 0xf08a34, tint: 0x80504e },
  arMirrorFace: { f: 0xc8d8ea, noCast: true },
};
