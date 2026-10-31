/*
 * touge.js: the colours of Momiji Pass (src/maps/touge/), the mountain
 * pass road in autumn. A family with no assets, as ./sunny.js is: the pass
 * is one particular place built in its own map's files, but every colour
 * the kit draws has to be in the kit's table, so this is the pass's share
 * of it and nothing else (./catalog.js, FAMILIES).
 *
 * The palette is the town's light on an autumn mountain: the town's violet
 * shadow tints under everything, so the pass sits in the same light as the
 * town, a dry gold verge and harvested fields, cedar forest a deep blue
 * green, the maples in three reds, and the vermilion of the bridge and the
 * torii, which is the one loud colour, on purpose.
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
  /* the ground */
  tgGrass: { c: 0xa3b860, tint: 0x5f6a7e },
  tgForest: { c: 0x6b8550, tint: 0x4f5a72 },
  tgVerge: { c: 0xc9b46c, tint: 0x7a6a7e },
  tgField: { c: 0xd9b866, tint: 0x82708a },
  tgRock: { c: 0xa8988a, tint: 0x5f5578 },
  tgRockDark: { c: 0x7d7068, tint: 0x4f4868 },
  tgCut: { c: 0xbdbab0, tint: TD },
  tgGravel: { c: 0xb9ae9c, tint: 0x6a6288 },
  tgRiverBed: { c: 0xb0a48e, tint: 0x655d84 },
  tgWater: { f: 0x6fb9d8, noCast: true },
  tgFoam: { f: 0xf2f6f6, noCast: true },
  /* the road */
  tgAsphalt: { c: 0x67657a, tint: 0x45405e },
  tgLineWhite: { f: 0xf4f2ec, noCast: true },
  tgLineYellow: { f: 0xf2c43a, noCast: true },
  tgRail: { c: 0xeeeeea, tint: T },
  tgSteel: { c: 0x9aa2ac, tint: 0x5c5a7c },
  tgOrange: { c: 0xf0812e, tint: 0x80504e },
  tgMirror: { f: 0xcfe6f2, noCast: true },
  tgPaper: { c: 0xf6f3ea, tint: 0x8a83a8 },
  /* built things */
  tgConcrete: { c: 0xc6c1ba, tint: TD },
  tgConcreteDark: { c: 0x9e9a96, tint: 0x55507a },
  tgLining: { c: 0xd9d2bf, tint: 0x6a6288, noReceive: true },
  tgLiningDark: { c: 0x8e8a86, tint: 0x4f4a6c, noReceive: true },
  tgTile: { c: 0xa9c3c6, tint: 0x5f6a86, noReceive: true },
  tgVermilion: { c: 0xe0482e, tint: 0x7a3a5a },
  tgVermilionDark: { c: 0xb03424, tint: 0x5e3052 },
  tgBronze: { c: 0x8a7a3e, tint: 0x4e4a5a },
  tgIron: { c: 0x2c2a33, tint: 0x22202e },
  tgInk: { c: 0x2a2630, tint: 0x201c2a },
  tgWood: { c: 0xb88a5a, tint: 0x5e4a62 },
  tgWoodDark: { c: 0x5e4436, tint: 0x3f3248 },
  tgPlaster: { c: 0xf2ece0, tint: 0x8a83a8 },
  tgShoji: { f: 0xf6efd8, noCast: true },
  tgRoofTile: { c: 0x4f5668, tint: 0x33344e },
  tgRoofCopper: { c: 0x6fa898, tint: 0x3f5a6a },
  tgStone: { c: 0xb4ada2, tint: 0x5f5880 },
  tgStoneDark: { c: 0x8a847c, tint: 0x4d4a6c },
  tgRed: { c: 0xd8352c, tint: 0x6e3050 },
  tgIndigo: { c: 0x2f3f6e, tint: 0x262a50 },
  tgTeal: { c: 0x2f8c8a, tint: 0x2f5068 },
  tgRice: { c: 0xd8b45a, tint: 0x7c6a68 },
  /* the trees */
  tgTrunk: { c: 0x6a4c3c, tint: 0x45364e },
  tgCedar0: { c: 0x4f7a5c, tint: 0x3e4e6a, noReceive: true, foliage: true },
  tgCedar1: { c: 0x3d6650, tint: 0x364462, noReceive: true, foliage: true },
  tgCedar2: { c: 0x2f5444, tint: 0x2e3a58, noReceive: true, foliage: true },
  tgMaple0: { c: 0xe8452e, tint: 0x7a3456, bands: 'soft', noReceive: true, foliage: true },
  tgMaple1: { c: 0xf27a2a, tint: 0x80485a, bands: 'soft', noReceive: true, foliage: true },
  tgMaple2: { c: 0xc42a32, tint: 0x6a2c52, bands: 'soft', noReceive: true, foliage: true },
  tgGinkgo: { c: 0xf5c62e, tint: 0x8a6e5a, bands: 'soft', noReceive: true, foliage: true },
};
