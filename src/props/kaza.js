/*
 * kaza.js: the colours of Kazahana Plain (src/maps/kaza/), the flat
 * Hokkaido grassland at the end of autumn with a balloon meet on it, a
 * winter illumination market at its edge, a dairy farm, larch windbreaks
 * gone gold, an old concrete arch viaduct and three wind turbines a mile
 * out. A family with no assets, as ./sunny.js is: every colour the kit
 * draws has to be in the kit's table, so this is the plain's share of it
 * and nothing else (./catalog.js, FAMILIES).
 *
 * The map merges each chunk's batches into one a look, with the colour on
 * the vertices (src/maps/sunny/palette.js), so a colour costs no draw of
 * its own. The list is still short on purpose. It is the season's: the
 * larches' gold, the birches' white and lemon, the pasture's tired green
 * against stubble and ploughed earth, a red barn and a blue farmhouse
 * roof, and the balloons and the market for every bright colour there is.
 * The shadow tints are the town's cool violets, so the plain sits in the
 * same light as every other map.
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

/* The town's deeper violet, under concrete. */
const TD = 0x5c5680;

export const MATERIALS = {
  /* the land: pasture, mown field, stubble, ploughed earth, two crops */
  kzPasture: { c: 0x9fbe66, tint: 0x55707a },
  kzMown: { c: 0xb6cf74, tint: 0x5f7a7c },
  kzStubble: { c: 0xe4c77e, tint: 0x8a7478 },
  kzSoil: { c: 0x9a7458, tint: 0x5e4a62 },
  kzSoilDark: { c: 0x7b5c4a, tint: 0x4c3a58 },
  kzBeet: { c: 0x6f9c56, tint: 0x3f5a66 },
  kzGravel: { c: 0xd6cbb4, tint: 0x847c9c },
  kzAsphalt: { c: 0x625f70, tint: 0x433f5e },
  kzLine: { f: 0xf4f1e8, noCast: true },
  kzLineYellow: { f: 0xf2c84a, noCast: true },
  kzWater: { f: 0x86bfe0, noCast: true },
  kzReed: { c: 0xc9a964, tint: 0x6e5c6c },
  /* the trees: larch gone gold, birch in lemon, fir, and the wood */
  kzLarch: { c: 0xeab340, tint: 0x8a6a62, foliage: true },
  kzLarchDeep: { c: 0xd88a2e, tint: 0x7a5462, foliage: true },
  kzBirchLeaf: { c: 0xf4d968, tint: 0x8c7a7a, foliage: true },
  kzOak: { c: 0xd9783a, tint: 0x75505e, foliage: true },
  kzFir: { c: 0x3c7560, tint: 0x2e4a5e, foliage: true },
  kzBark: { c: 0x6e5444, tint: 0x45384e },
  kzBirch: { c: 0xf1ede4, tint: 0x8a83a8 },
  kzBirchMark: { c: 0x2f2b35, tint: 0x22202e },
  /* the farm: the red barn and its white trim, the farmhouse's blue tin
   * roof and pale siding, the silos, a tin shed, the vinyl houses */
  kzBarn: { c: 0xbc4538, tint: 0x6a3a5e },
  kzBarnDark: { c: 0x8e3430, tint: 0x56304e },
  kzTrim: { c: 0xf6f1e6, tint: 0x8a83a8 },
  kzRoofGreen: { c: 0x47806c, tint: 0x324c66 },
  kzRoofBlue: { c: 0x3f72aa, tint: 0x2f3f74 },
  kzSiding: { c: 0xe9dcc2, tint: 0x8a7c96 },
  kzSilo: { c: 0xd8d2c6, tint: 0x7a7496 },
  kzTin: { c: 0xaab2bc, tint: 0x5c5a7c },
  kzRust: { c: 0xa0603e, tint: 0x5a3e5a },
  kzVinyl: { c: 0xe6eef2, tint: 0x8c96b2 },
  kzHay: { c: 0xdcbc66, tint: 0x84706a },
  kzWrap: { c: 0xf3f2ee, tint: 0x8c88a8 },
  kzWrapDark: { c: 0x3a3a42, tint: 0x24222e },
  kzTractor: { c: 0xd2463e, tint: 0x6a3a5e },
  kzTractorGreen: { c: 0x3f8a52, tint: 0x2f5056 },
  kzTyre: { c: 0x2b2a2f, tint: 0x1e1d28 },
  /* timber, iron, steel, concrete, glass */
  kzWood: { c: 0xb4885a, tint: 0x5e4a62 },
  kzWoodDark: { c: 0x75584a, tint: 0x4a3a56 },
  kzIron: { c: 0x2c2a33, tint: 0x22202e },
  kzSteel: { c: 0x9aa3ad, tint: 0x5c5a7c },
  kzWhite: { c: 0xf6f4ee, tint: 0x8a83a8 },
  kzConcrete: { c: 0xc2bcb2, tint: TD },
  kzConcreteOld: { c: 0x9e978e, tint: 0x5a5476 },
  kzMoss: { c: 0x7d9a56, tint: 0x46566a },
  kzGlass: { f: 0x82b6d8, noCast: true },
  kzGlassDark: { f: 0x44607e, noCast: true },
  /* the market: chalet timber, roofs under the first snow, canvas,
   * the shrine's vermilion */
  kzChalet: { c: 0xc9945c, tint: 0x6e5462 },
  kzChaletDark: { c: 0x8a5e40, tint: 0x55405a },
  kzSnow: { c: 0xf6f8fc, tint: 0x9096c0 },
  kzCanvas: { c: 0xf2efe6, tint: 0x8a86a6 },
  kzVermilion: { c: 0xe0523a, tint: 0x7a3a5a },
  kzStone: { c: 0xb8b2ac, tint: 0x66607e },
  /* the balloons: every gore is one of these */
  kzRed: { c: 0xe0483a, tint: 0x7a3a5a },
  kzYellow: { c: 0xf6c431, tint: 0x8c7050 },
  kzBlue: { c: 0x2f6fb4, tint: 0x2f3f74 },
  kzTeal: { c: 0x2fa4a0, tint: 0x2f5a70 },
  kzPurple: { c: 0x7d5bb4, tint: 0x45386e },
  kzOrange: { c: 0xf08a34, tint: 0x80504e },
  kzPink: { c: 0xf39ac0, tint: 0x8a5a86 },
  kzCream: { c: 0xfbf3dc, tint: 0x8c86a6 },
  kzGreen: { c: 0x4f9a52, tint: 0x3c5a6a },
  kzNavy: { c: 0x2f3f74, tint: 0x2a2f55 },
  kzWicker: { c: 0xbe8e56, tint: 0x6a5462 },
  kzLeather: { c: 0x6b4636, tint: 0x45304a },
  /* lit things, drawn flat so they read as light at any hour: warm bulbs,
   * gold, ice blue and pink strings, a burner's flame */
  kzBulb: { f: 0xffe6a6, noCast: true },
  kzBulbGold: { f: 0xffc24e, noCast: true },
  kzBulbIce: { f: 0xa8dcff, noCast: true },
  kzBulbPink: { f: 0xffb4d4, noCast: true },
  kzFlame: { f: 0xffa53c, noCast: true },
  kzLantern: { f: 0xff6a4a, noCast: true },
};
