/*
 * airfield.js: the colours of Kazami Airfield (src/maps/airfield/), the
 * grass strip in a mountain valley with the arched hangar, the terraced
 * paddies and the cedar slopes. A family with no assets, as ./sunny.js is:
 * the place is built in its own map's files, but every colour the kit draws
 * has to be in the kit's table, so this is the airfield's share of it and
 * nothing else (./catalog.js, FAMILIES).
 *
 * THE TOWN'S HAND. Every colour here is set beside the town's own (the
 * palette in src/maps/city/vendored/core/palette.js): the same cream and
 * slate, the same soft reds, the same violet shadow tints, so the valley
 * sits in the town's golden light and reads as a page of the same comic.
 * Where the town already has the colour (its concrete, its sheet metal and
 * ribs, its red and white mast paint, its cream walls) the map uses the
 * town's, and it is not repeated here.
 *
 * The map merges each chunk's batches into one a look, with the colour on
 * the vertices (src/maps/sunny/palette.js), so a colour costs no draw call
 * of its own.
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
  /* the strip: the mown runway, its chalk, the tyre markers */
  afMown: { c: 0x93b884, tint: 0x5f7390 },
  afMownDark: { c: 0x7ea873, tint: 0x55688a },
  afChalk: { f: 0xf6f2e6, noCast: true },
  afTyre: { c: 0x34303a, tint: 0x26232f },
  afTyreWhite: { c: 0xf2efe8, tint: T },
  /* the terraces: the bench's grass, the paddies three ways, the walls */
  afBench: { c: 0x9cbd80, tint: 0x5f7390 },
  afBenchDry: { c: 0xb9bf86, tint: 0x6a6f8a },
  afPaddyGold: { c: 0xe4c46e, tint: 0x8a7484 },
  afPaddyGreen: { c: 0x8cbf72, tint: 0x557a86 },
  afPaddyWater: { f: 0xc6d8e2, noCast: true },
  afStone: { c: 0xbab3ab, tint: 0x655d84 },
  afStoneDark: { c: 0x958e8c, tint: 0x5a5478 },
  afEarth: { c: 0xb0906c, tint: 0x6a5468 },
  afRock: { c: 0xa49aa4, tint: 0x5c5680 },
  afHasa: { c: 0xd8b260, tint: 0x84705e },
  afHasaPole: { c: 0x86684f, tint: 0x4f3e58 },
  /* the woods: two cedar greens, the trunks, autumn maples in two tones */
  afCedar: { c: 0x4f7d5e, tint: 0x3a4f6c, foliage: true },
  afCedarDeep: { c: 0x3e6853, tint: 0x334664, foliage: true },
  afCedarTrunk: { c: 0x7d5c4c, tint: 0x4d3e58 },
  afMaple: { c: 0xe0683f, tint: 0x8a4a62, foliage: true },
  afMapleGold: { c: 0xebb04a, tint: 0x8a6a62, foliage: true },
  /* the stream, its concrete banks and its weir */
  afWater: { f: 0x9fc6d8, noCast: true },
  afFoam: { f: 0xeef4f6, noCast: true },
  afBank: { c: 0xc4bfb8, tint: TD },
  /* the hangar: its painted steel, its doors, its floor */
  afFrame: { c: 0x5c7290, tint: 0x3f4468 },
  afDoor: { c: 0xd8d3c6, tint: 0x7d7698 },
  afDoorStripe: { c: 0xd2493e, tint: 0x6a3a5e },
  afFloor: { c: 0xc2bdb6, tint: 0x6a6288 },
  afFloorLine: { f: 0xf2c33a, noCast: true },
  afOil: { f: 0x8f8a8e, noCast: true },
  afToolRed: { c: 0xcf4a3f, tint: 0x6a3a5e },
  afBench2: { c: 0x8a6a50, tint: 0x55425c },
  afDrum: { c: 0x3f6aa0, tint: 0x33406a },
  afDrumRed: { c: 0xc2463c, tint: 0x6a3a5e },
  /* the aircraft: a white high wing with a red and navy cheat line, the
   * glider white, the tyres the strip's */
  afPlane: { c: 0xf4f1e8, tint: 0x8a83a8 },
  afPlaneRed: { c: 0xcc453c, tint: 0x6a3a5e },
  afPlaneNavy: { c: 0x334d78, tint: 0x2a2f55 },
  afCanopy: { f: 0x55687e, noCast: true },
  afProp: { c: 0x3a3640, tint: 0x26232f },
  /* the windsock and the signal square */
  afSock: { c: 0xee7330, tint: 0x80504e },
  afSockWhite: { c: 0xf6f3ec, tint: T },
  /* the clubhouse and the tower cab */
  afRoof: { c: 0x56637c, tint: 0x3b3e64 },
  afCab: { f: 0x8fb4c8, noCast: true },
  afBeaconGreen: { f: 0x7fe08a, noCast: true },
  /* the shrine: vermilion, its dark wood, stone, rope and paper */
  afShrine: { c: 0xd8553c, tint: 0x7a4a6a },
  afShrineDark: { c: 0x2f2b36, tint: 0x24212e },
  afShrineWood: { c: 0x7c5c4a, tint: 0x4c3a58 },
  afLantern: { c: 0xc8c1b6, tint: 0x6a6288 },
  afRope: { c: 0xe2d4a4, tint: 0x8a7a84 },
  afPaper: { f: 0xfbf8f0, noCast: true },
  /* the farm belt: vinyl house film and its hoops, tilled soil, the
   * crops, straw, wrapped bales, the storehouse's plaster, new leaf */
  afVinyl: { c: 0xe6eceb, tint: 0x8890ac },
  afVinylRib: { c: 0x7d879c, tint: 0x4a4e70 },
  afSoil: { c: 0xa47c5e, tint: 0x5e4660 },
  afSoilDark: { c: 0x8c6a52, tint: 0x54405c },
  afCabbage: { c: 0xa9cf7e, tint: 0x5a7a86 },
  afNegi: { c: 0x74b062, tint: 0x4c6e7e },
  afStraw: { c: 0xdcc07a, tint: 0x857462 },
  afSwath: { f: 0xb7c27e, noCast: true },
  afBaleWrap: { c: 0xf3f1ea, tint: 0x8a83a8 },
  afBalePink: { c: 0xf0c2c8, tint: 0x8c6c8c },
  afKura: { c: 0xf5f1e8, tint: 0x8a83a8 },
  afLeaf: { c: 0x8fbe5c, tint: 0x4f6e72, foliage: true },
  /* the race: banner cloth in the town's two reds and its indigo */
  afBanner: { c: 0x3b4f86, tint: 0x2c3260 },
  afBannerRed: { c: 0xe0503f, tint: 0x7a3a5a },
  afBannerCream: { c: 0xf6ecd4, tint: 0x8a83a8 },
};
