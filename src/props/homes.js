/*
 * homes.js: the colours of a house that is lived in, for the one map that
 * has one (src/maps/house/, Nick Burns' house).
 *
 * A FAMILY WITH NO ASSETS. The house is not in the builder's palette: it is
 * one particular building, laid out from its owner's videos and from three
 * Uncrashed Workshop layouts of it, and no dimension a builder could drag
 * would make another house of it. But its walls, floors and furniture are
 * drawn by the same kit as every asset, and a colour the kit draws has to
 * be in the kit's table, so this file is the house's share of that table
 * and nothing else (./catalog.js, FAMILIES).
 *
 * WHAT IS LIT AND WHAT IS NOT. Outside, the house takes the sun's shadow the
 * way every other wall on a map does. Inside, nothing does: the roof and the
 * floor above would put every room in shadow all day, which in the town's
 * cel look is a room painted in its one dark band. So every colour that is
 * only ever seen indoors is `noReceive`, which is what the town does to
 * blossom for the same reason, and the rooms read in their own colours lit
 * by the sky and the fill. It costs nothing: one flag on a material.
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

/* The town's shadow tints, a cool violet under a warm colour and a deeper
 * one under a dark colour, so the house sits in the same light. */
const T = 0x6f6790;
const TD = 0x5c5680;

/*
 * FORTY THREE COLOURS AND NO MORE, because every one is a draw call: the kit
 * bakes one batch per material per chunk, and the house is one chunk. So a
 * colour that would read the same as another at a glance is that other
 * colour (a bath, a pillow and a door are one white; a lamp's base, a shelf's
 * dark back and a stool are one charcoal), and a new colour has to be a
 * thing a pilot would miss.
 *
 * The colours are the videos': warm grey board and batten outside under a
 * dark grey shingle roof, white trim, dark sashes, a red brick front block
 * and chimney; inside a honey oak floor through the ground floor, olive green
 * in the kitchen, breakfast room and back hall, pale blue grey over a dark
 * stained wainscot in the dining room, cream in the front room and the foyer,
 * cream cabinets under a dark granite top, white doors, white balusters under
 * a dark stained rail.
 */
export const MATERIALS = {
  /* outside */
  homeSiding: { c: 0xbdb6aa, tint: 0x7d7596 },
  homeTrim: { c: 0xf7f6f2, tint: 0x8a83a8 },
  homeRoof: { c: 0x5d6068, tint: 0x3f3d58 },
  homeShutter: { c: 0x2e2b2d, tint: 0x2c2840 },
  homeBrick: { c: 0xa4553f, tint: 0x62527a },
  homeFoundation: { c: 0xc4bfb8, tint: TD },
  homeWindow: { c: 0x40506a, tint: 0x2f3450 },
  homeNeighbourTan: { c: 0xcdb48e, tint: T },
  /* the yard and the street */
  homeWater: { f: 0x3fb8f0, noCast: true },
  homeWaterDeep: { f: 0x2a8fd6, noCast: true },
  homeCoping: { c: 0xa39d94, tint: TD },
  homeDrive: { c: 0xd4cfc6, tint: 0x847c9c },
  homeAsphalt: { c: 0x50535a, tint: 0x3a3850 },
  homeFenceWood: { c: 0x9b948a, tint: 0x5f5876 },
  homeMulch: { c: 0x6b4a36, tint: 0x4a3a50 },
  homeHedge: { c: 0x4f8a55, tint: 0x3f5a6a },
  /* walls and ceilings inside, one colour a room */
  homeWallIn: { c: 0xeceae6, tint: 0x9a98b4, noReceive: true },
  homeWallBlue: { c: 0xc5d2dc, tint: 0x8d93b0, noReceive: true },
  homeWallGreen: { c: 0x94925c, tint: 0x5e5e62, noReceive: true },
  homeWallCream: { c: 0xe6dcc6, tint: 0x958ea8, noReceive: true },
  homeWallKids: { c: 0x8cc7c2, tint: 0x5f7896, noReceive: true },
  /* floors, trim, doors */
  homeFloor: { c: 0xb9824d, tint: 0x6a4f5c, noReceive: true },
  homeTile: { c: 0xd9d6d0, tint: 0x8d8aa6, noReceive: true },
  homeCarpet: { c: 0xcfc6ba, tint: 0x8a8298, noReceive: true },
  homeWhite: { c: 0xf6f5f1, tint: 0x9a96b2, noReceive: true },
  /* wood, stone, steel */
  homeCabinet: { c: 0xefe6d2, tint: 0x9a94ac, noReceive: true },
  homeCounter: { c: 0x4a3a33, tint: 0x2e2836, noReceive: true },
  homeSteel: { c: 0xb9bdc4, tint: 0x6f6d8a, noReceive: true },
  homeWood: { c: 0x7a5a43, tint: 0x4a3c55, noReceive: true },
  homeShelf: { c: 0x3a2e2c, tint: 0x2a2434, noReceive: true },
  homeChair: { c: 0x2f3440, tint: 0x282838, noReceive: true },
  homeStone: { c: 0x7c7670, tint: 0x4a4560, noReceive: true },
  /* soft things */
  homeSofa: { c: 0xd8c5a2, tint: 0x8a7b8e, noReceive: true },
  homeCushion: { c: 0xc4ad86, tint: 0x7f6f86, noReceive: true },
  homeRug: { c: 0x3e5d8e, tint: 0x34406a, noReceive: true },
  homeWicker: { c: 0x9c8460, tint: 0x5a4f62, noReceive: true },
  homeBook: { c: 0xc29a3a, tint: 0x6a5a5a, noReceive: true },
  homeTeal: { c: 0x2f9d97, tint: 0x2f5a6e, noReceive: true },
  homePlay: { c: 0xd94f3c, tint: 0x6a4060, noReceive: true },
  homePlayBlue: { c: 0x3a7fd0, tint: 0x3f4d70, noReceive: true },
  /* lit from within */
  homeScreen: { f: 0x1c1f27, noCast: true },
  homeLamp: { f: 0xfff6e2, noCast: true },
  homeNeon: { f: 0xff4fd8, noCast: true },
};
