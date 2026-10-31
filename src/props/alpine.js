/*
 * alpine.js: the colours of Raicho Ridge (src/maps/alps/), the Japanese
 * Alps ridge with the hut on the col, the ropeway down the south face and
 * the dam at the foot of the valley. A family with no assets, as
 * ./homes.js and ./sunny.js are: the place is built in its own map's
 * files, and every colour the kit draws it in is named here, so the kit
 * bakes them like any other and two families cannot claim one name.
 *
 * The town's palette, carried up the mountain: pale masses with violet
 * shadow tints, one strong colour at a time (the hut's red tin roof, the
 * ropeway's red cabin, the helipad's yellow), and the rock and the snow
 * kept in the same key as the town's concrete and its clouds, so a pilot
 * arriving from the town is in the same comic.
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

/* The town's shadow tints: a cool violet under a pale colour and a deeper
 * one under a dark colour. */
const T = 0x6f6790;
const TD = 0x5c5680;

export const MATERIALS = {
  /* concrete: the stations, the dam, the snow shed */
  alConcrete: { c: 0xd8d3db, tint: 0x6f6790 },
  alConcreteMid: { c: 0xbfb9c6, tint: 0x655d84 },
  alConcreteDark: { c: 0x9d97a8, tint: TD },
  alDam: { c: 0xd2ced6, tint: 0x6a6288 },
  /* the hut: timber, plaster, its tin roof, and the stone it stands on */
  alTimber: { c: 0x9a7f5e, tint: 0x5c5680 },
  alTimberDark: { c: 0x6f5943, tint: 0x554d72 },
  alTimberPale: { c: 0xc4a074, tint: 0x6f5f7a },
  alPlaster: { c: 0xf2e9d6, tint: 0x8a83a8 },
  alRoofRed: { c: 0xb8463e, tint: 0x5e3e62 },
  alRoofBlue: { c: 0x4f6c8e, tint: 0x3b3e64 },
  alRoofTeal: { c: 0x4f7a72, tint: 0x324c66 },
  alStone: { c: 0xbdb7c0, tint: T },
  alStoneDark: { c: 0x918b9c, tint: TD },
  /* steel: the ropeway's towers and their red bands, the rails */
  alSteel: { c: 0x9aa1ae, tint: 0x5e5a80 },
  alSteelDark: { c: 0x6e7482, tint: 0x4d4a6c },
  alRed: { c: 0xdc4a3f, tint: 0x7a4a6a },
  alYellow: { c: 0xf2c13a, tint: 0x7d6a74 },
  alWhite: { c: 0xf6f4ef, tint: 0x8a83a8 },
  alCable: { c: 0x3d3a45, tint: 0x4b4560 },
  /* the cabins */
  alCabinRed: { c: 0xd9483e, tint: 0x6a3a5e },
  alCabinCream: { c: 0xf4eedf, tint: 0x8a83a8 },
  /* the mountain's own: boulders, snow, dwarf pine */
  alRock: { c: 0xb7b0ba, tint: 0x6a6390 },
  alRockDark: { c: 0x8f889a, tint: 0x534d74 },
  alSnow: { c: 0xf7f8fc, tint: 0x9aa4cc },
  alPine0: { c: 0x6f9a6a, tint: 0x55678a, noReceive: true, foliage: true },
  alPine1: { c: 0x4e7a5c, tint: 0x4b5d84, noReceive: true, foliage: true },
  alPine2: { c: 0x3d6450, tint: 0x43547c, noReceive: true, foliage: true },
  alBirch: { c: 0xeee8de, tint: 0x8a83a8 },
  alBroad0: { c: 0x86ad78, tint: 0x55678a, noReceive: true, foliage: true },
  alBroad1: { c: 0x9cbd82, tint: 0x5c6c8c, noReceive: true, foliage: true },
  /* glass, water, paint */
  alGlass: { f: 0x9dc0d4, noCast: true },
  alGlassDark: { f: 0x53627a, noCast: true },
  alWater: { f: 0x83bccb, noCast: true },
  alWaterDeep: { f: 0x6aa6bd, noCast: true },
  alFoam: { f: 0xf2f7fa, noCast: true },
  alAsphalt: { c: 0x86829a, tint: 0x6a608f },
  alLine: { f: 0xf4f2f6, noCast: true },
  alLineYellow: { f: 0xf0c341, noCast: true },
  alPath: { c: 0xc8b69a, tint: 0x7d74a0, noCast: true },
  /* the hut's washing: futons over the rail, a flag */
  alFutonPink: { c: 0xec9aa2, tint: 0x84607e },
  alFutonBlue: { c: 0x7fa3d8, tint: 0x5f6f9a },
  alFutonCream: { c: 0xf4e7cb, tint: 0x958ea8 },
  alShrineStone: { c: 0xcfcad2, tint: T },
  alBib: { c: 0xd8453f, tint: 0x6a3a5e },
  alSolar: { c: 0x3c4e78, tint: 0x2f3450 },
};
