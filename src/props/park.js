/*
 * park.js: the colours of Hinode Park (src/maps/park/), a Japanese city park
 * with a ball ground, a pond and its drum bridge, and a playground. A family
 * with no assets, as ./sunny.js is: every colour the kit draws has to be in
 * the kit's table, so this is the park's share of it and nothing else
 * (./catalog.js, FAMILIES).
 *
 * THE TOWN'S COLOURS, NOT NEW ONES. The owner's ask is that the park look
 * like the town, so nearly every value here is the town's own palette
 * (src/maps/city/vendored/core/palette.js), written out with the name it
 * has there, because a family file imports nothing: the ground's clay and
 * its lime, the town's stone and water, its concrete, its roofs, its play
 * reds and yellows. The shadow tints are the town's cool violets. What the
 * town has no word for (a vermilion bridge, wisteria, a ball net's green)
 * is pulled into its pale, warm, slightly hazy range, so a drum bridge
 * beside the town's own utility pole looks drawn by the same hand.
 *
 * The kit bakes one batch per material per chunk and the map merges each
 * chunk's batches into one a look (src/maps/sunny/palette.js), so a colour
 * costs no draw of its own.
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
  /* the ground: the town's clay (PAL.clay) and its lime, the mown turf,
   * the decomposed granite of the paths, the paving */
  pkClay: { c: 0xcfb59c, tint: 0x7d6a84 },
  pkClayWorn: { c: 0xbea38c, tint: 0x725f80 },
  pkLime: { f: 0xf4f2f6, noCast: true },
  pkTurf: { c: 0x93b886, tint: 0x5d7a7c },
  pkTurfDeep: { c: 0x82aa79, tint: 0x557078 },
  pkPath: { c: 0xe0d3bc, tint: 0x857c98 },
  pkPave: { c: 0xdcd8e2, tint: 0x847c9c },
  pkPaveAlt: { c: 0xe7e2e6, tint: 0x847c9c },
  pkKerb: { c: 0xc7c2d0, tint: TD },
  pkTactile: { c: 0xf2c53d, tint: 0x80704a },
  pkRoad: { c: 0x8e8a9c, tint: 0x6a608f },
  pkRoadLine: { f: 0xf4f2f6, noCast: true },
  pkRoadGreen: { c: 0x7fae8c, tint: 0x557078 },
  /* concrete, block and stone, the town's */
  pkConcrete: { c: 0xd9d5dd, tint: TD },
  pkConcreteMid: { c: 0xc2bdc8, tint: 0x6a6288 },
  pkConcreteDark: { c: 0xa7a2b0, tint: 0x655d84 },
  pkBlock: { c: 0xd2cabe, tint: 0x6a6288 },
  pkStone: { c: 0xc6c0cb, tint: 0x66607e },
  pkStoneDark: { c: 0xa39daf, tint: 0x5c5680 },
  pkMoss: { c: 0x7d9c74, tint: 0x4f6878 },
  /* steel, painted: the ground's nets' poles in their dark green, the
   * town's galvanised grey, the playground's colours */
  pkNetPole: { c: 0x5f7468, tint: 0x3f4a60 },
  pkNet: { net: true },
  pkSteel: { c: 0xb8bcc6, tint: 0x666090 },
  pkSteelDark: { c: 0x878b96, tint: TD },
  pkFenceGreen: { c: 0x5f9470, tint: 0x435a6a },
  pkPlayRed: { c: 0xe0453f, tint: 0x7a3a5a },
  pkPlayYellow: { c: 0xf4c033, tint: 0x80704a },
  pkPlayBlue: { c: 0x3d6ec4, tint: 0x3a4072 },
  pkPlayTeal: { c: 0x2f9c9a, tint: 0x2f5a70 },
  pkOctopus: { c: 0xef8a8e, tint: 0x8a5070 },
  pkOctopusDeep: { c: 0xd8676f, tint: 0x7a4466 },
  pkSand: { c: 0xdccaa6, tint: 0x857890 },
  /* timber and the bridge's lacquer */
  pkWood: { c: 0xb0917a, tint: 0x6a5578 },
  pkWoodDark: { c: 0x765f62, tint: 0x4f4060 },
  pkLacquer: { c: 0xd94a3c, tint: 0x7c3a5c },
  pkLacquerDeep: { c: 0xb0362f, tint: 0x66304e },
  pkBrass: { c: 0xd8b25a, tint: 0x7a6a5a },
  /* roofs and walls the town doesn't name in the kit */
  pkRoofSlate: { c: 0x59617a, tint: 0x3b3e64 },
  pkRoofBrown: { c: 0x6b585c, tint: 0x45384e },
  pkRoofBlue: { c: 0x4d5c78, tint: 0x353a60 },
  pkRoofTeal: { c: 0x4f6b70, tint: 0x344c62 },
  pkWallBeige: { c: 0xe7dbc4, tint: T },
  /* water: the town's pond (PAL.water, waterDeep, waterSky) */
  pkWater: { f: 0x93b8ce, noCast: true },
  pkWaterDeep: { f: 0x7fa6c0, noCast: true },
  pkWaterSky: { f: 0xcadff0, noCast: true },
  pkLily: { c: 0x6f9c6a, tint: 0x4a6478 },
  /* planting the kit's canopies don't cover: wisteria, the clipped
   * azaleas and their flowers, the iris bed */
  pkWisteria: { c: 0xbca4dc, bands: 'soft', tint: 0x8a7cb0, noReceive: true, foliage: true },
  pkWisteriaDeep: { c: 0x9d83c8, bands: 'soft', tint: 0x7466a0, noReceive: true, foliage: true },
  pkShrub: { c: 0x5f9470, tint: 0x4f6488, noReceive: true, foliage: true },
  pkAzalea: { c: 0xf39cbe, tint: 0x9a6a98, noReceive: true },
  pkIris: { c: 0x6f68c0, tint: 0x45386e, noReceive: true },
  /* the ground's own: the scoreboard's green, its lamps */
  pkBoard: { c: 0x2f4f42, tint: 0x24304a },
  pkLamp: { f: 0xfff2d6, noCast: true },
  pkSwan: { c: 0xf8f5f0, tint: 0x8a83a8 },
  pkBeak: { c: 0xef8a3c, tint: 0x80504e },
  pkKoi: { f: 0xf2894a, noCast: true },
  pkRed: { c: 0xdb4038, tint: 0x6a3a5e },
  pkBlue: { c: 0x5d8fb8, tint: 0x45507a },
};
