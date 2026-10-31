/*
 * homes.js: the colours of a house that is lived in, for the three maps
 * that have one (src/maps/house/, Nick Burns' house, src/maps/heads/,
 * Heads' house, and src/maps/bardwell/, Joshua Bardwell's house). Each
 * after the first takes the first's colours wherever they read the same
 * and adds its own at the end.
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
  /* Heads' house (src/maps/heads/), from its stills: the sage siding, the
   * cream of the wing's back wall, the dark green shutters, the brick red
   * stamped patio, the red Japanese maple and the dark purple shrubs. Every
   * other colour it draws is one of the above. */
  headsSiding: { c: 0x8f9c88, tint: 0x5f6684 },
  headsCream: { c: 0xe4dfca, tint: 0x8f88a6 },
  headsShutter: { c: 0x2d4834, tint: 0x283646 },
  headsPatio: { c: 0xb86a50, tint: 0x6a4a66 },
  headsMaple: { c: 0x7c2a40, tint: 0x4a2a50 },
  headsPurple: { c: 0x4c3240, tint: 0x342840 },
  /* Joshua Bardwell's house (src/maps/bardwell/), outside only, from the
   * Uncrashed Workshop map of it and its screenshots: the cream brick and
   * its mortar, the orange shingle roof and its courses, the dark split
   * rails, the gravel and the dirt, the woodshed's weathered planks and its
   * timber frame, the firewood and its cut ends, the lean-to's tin, the
   * practice cages' black steel, the race's pink gates and yellow
   * inflatables, the bright bushes and the terracotta pots. Every other
   * colour it draws is one of the above. */
  bardwellBrick: { c: 0xe2d2a6, tint: 0x8f88a6 },
  bardwellMortar: { c: 0xc8b88c, tint: 0x7f7894 },
  bardwellShingle: { c: 0xd9963c, tint: 0x7a5a62 },
  bardwellCourse: { c: 0xb2732c, tint: 0x6a4a5a },
  bardwellFence: { c: 0x5a3e2a, tint: 0x3a2e40 },
  bardwellGravel: { c: 0xaaa394, tint: 0x6a6480 },
  bardwellDirt: { c: 0x8c7c62, tint: 0x56506a },
  bardwellPlank: { c: 0x7f7b75, tint: 0x4f4c64 },
  bardwellTimber: { c: 0x6a5846, tint: 0x40364c },
  bardwellFirewood: { c: 0x8a6544, tint: 0x4f3e4c },
  bardwellLogEnd: { c: 0xc9a777, tint: 0x7a6878 },
  bardwellTin: { c: 0xb2ada4, tint: 0x6a6680 },
  bardwellCube: { c: 0x2b2f36, tint: 0x22242f },
  bardwellGate: { c: 0xe0479e, tint: 0x7a3a6e },
  bardwellYellow: { c: 0xf2c230, tint: 0x8a7050 },
  bardwellBush: { c: 0x6c9e45, tint: 0x3f5a5a },
  bardwellPot: { c: 0xb3613f, tint: 0x6a4a5a },

  /* Thomas More's Shop (src/maps/warehouse/): eighteen colours, fewer
   * than any house, read off the frames of his flight through it: the teal
   * of the racking, the green of the mouldings racks and the stripe, the
   * maroon girders in whRed with the stripe's red. Every one but the apron's
   * is two band and takes no shadow, because inside the hall everything is
   * under the roof's, and a crate in the roof's shadow reads lavender. */
  whConcrete: { c: 0x9d9d9a, tint: 0x6c6a84, noReceive: true },
  whWall: { c: 0xe0d6c1, tint: 0x938aa4, noReceive: true },
  whDeck: { c: 0x50525a, tint: 0x363650, noReceive: true },
  whSteel: { c: 0x6c7078, tint: 0x45455e, noReceive: true },
  whColumn: { c: 0xe9dfc6, tint: 0x9a90a8, noReceive: true },
  whCrate: { c: 0xc99c62, tint: 0x7c5a62, noReceive: true },
  whCrateDark: { c: 0x8c6a46, tint: 0x4f3e4c, noReceive: true },
  whBoard: { c: 0xd9b27a, tint: 0x806066, noReceive: true },
  whWhite: { c: 0xf0eee8, tint: 0x9a96b2, noReceive: true },
  whBlack: { c: 0x262830, tint: 0x1e2030, noReceive: true },
  whRackTeal: { c: 0x2a7f8c, tint: 0x2e4f6a, noReceive: true },
  whRackOrange: { c: 0xdc6a2c, tint: 0x7a4260, noReceive: true },
  whOrange: { c: 0xe8801f, tint: 0x80482e, noReceive: true },
  whGreen: { c: 0x4c8f58, tint: 0x3a5a5a, noReceive: true },
  whYellow: { c: 0xe6bc2c, tint: 0x8a7050, noReceive: true },
  whRed: { c: 0x9d3d42, tint: 0x5a3050, noReceive: true },
  whLamp: { f: 0xfff6e2, noCast: true },
  whAsphalt: { c: 0x50535a, tint: 0x3a3850 },

  /* The neighbourhood round Heads' house on the goat map (src/maps/goats/):
   * the made up houses' siding, sage, blue, yellow and clay, and the
   * porches' pumpkins. Every other colour it draws is one of the above. */
  goatSage: { c: 0xa7b59a, tint: 0x6a7088 },
  goatBlue: { c: 0x8fa6bf, tint: 0x5f6a90 },
  goatYellow: { c: 0xe2cf8e, tint: 0x8f8296 },
  goatClay: { c: 0xc28a6a, tint: 0x6f5470 },
  goatPumpkin: { c: 0xe8822a, tint: 0x80482e },
  /* Drift Matsuri (src/maps/drift/): the torii's vermilion and its black
   * cap, the indigo of a festival happi coat and a nobori, a nobori's red,
   * and tyre rubber. Every other colour it draws is one of the town's. */
  drToriiRed: { c: 0xe4472c, tint: 0x7a3a5a },
  drToriiBlack: { c: 0x2b2830, tint: 0x221f2c },
  drIndigo: { c: 0x2e4382, tint: 0x2a2e5a },
  drNoboriRed: { c: 0xd8333d, tint: 0x6e2f52 },
  drTyre: { c: 0x2f2e34, tint: 0x24222e },
  drSkin: { c: 0xebc6a2, tint: 0x8a6a7a },
  /* Quad Ball (src/maps/ball/): the pitch, its lines and the two teams'
   * walls, sakura pink and mint, the backs of the goals lit. */
  qbPitch: { c: 0x7fa07c, tint: 0x4c6a6a },
  qbPitchB: { c: 0x8db78a, tint: 0x56787a },
  qbLine: { c: 0xf3ead4, tint: 0xd8cfc0, noCast: true },
  qbBand: { c: 0x3a3f58, tint: 0x2a2e45, noCast: true },
  qbSakura: { c: 0xf2a6bd, tint: 0x9a6a8a },
  qbMint: { c: 0x8fe0b8, tint: 0x5a8a8a },
  qbSakuraGlow: { f: 0xffc0d4, noCast: true },
  qbMintGlow: { f: 0xb8ffd8, noCast: true },
  /* Ridgeline MX (src/maps/moto/): the packed dirt of the mounds and the
   * track, the darker dirt of the berms, hay, the team tents' colours and
   * the bikes' and riders' paint. Every other colour it draws is one of
   * the town's. */
  mxDirt: { c: 0xa8744a, tint: 0x6a4a5e },
  mxDirtDark: { c: 0x82583a, tint: 0x553f52 },
  mxTrack: { c: 0xb98a5c, tint: 0x75556a },
  mxHay: { c: 0xdcbc58, tint: 0x8a7458 },
  mxOrange: { c: 0xf0721e, tint: 0x80482e },
  mxBlue: { c: 0x2f6fd0, tint: 0x2e4a7a },
  mxGreen: { c: 0x2f9a4c, tint: 0x2e5a4a },
  mxRed: { c: 0xd8333d, tint: 0x6e2f52 },
  /* Bakuon Dome (src/maps/dome/): the hall's dirt and the ramps' darker
   * dirt, the concourse's paving, the cream concrete of the bowl and its
   * fascia, the outer walls' panel white, the roof's steel, the catwalk's
   * grating and the big screen's case. Everything finer (seats, people,
   * cars, flags) is one vertex coloured batch of its own (./draw.js). */
  dmDirt: { c: 0xb07a4c, tint: 0x6a4a5e },
  dmDirtDark: { c: 0x8a5d3c, tint: 0x553f52 },
  dmWalk: { c: 0xc9c2b8, tint: 0x7d7596, noReceive: true },
  dmBarrier: { c: 0xf1ead8, tint: 0x8a83a8 },
  dmStand: { c: 0xd9d2c4, tint: 0x7d7596 },
  dmFascia: { c: 0x2b3554, tint: 0x232840 },
  dmColumn: { c: 0xe6dfd0, tint: 0x8a83a8, noReceive: true },
  dmWall: { c: 0xeee8dc, tint: 0x7d7596 },
  dmSteel: { c: 0xe9eef2, tint: 0x6f6d8a },
  dmGrate: { c: 0x6c7381, tint: 0x4d4a6c },
  dmScreenBox: { c: 0x26242e, tint: 0x1f1d28 },
};

/*
 * TWO BANDS INDOORS, a manga page's light and shade with nothing between.
 * The owner, 2026-10-18: "Let's make the house interior less blocky, less
 * like Roblox more like a manga comic book with cell shading." Three bands
 * put a middle grey on every face turned part way from the sun, which is
 * what made a room of boxes read as a room of plastic blocks; two put each
 * face in the light or in its tinted shade, and the house's black pen
 * (src/maps/house/index.js) draws the edge between them. Every colour that
 * is only seen indoors, which is the set marked noReceive above. It costs
 * nothing: the same program, a two texel ramp instead of a three.
 */
for (const spec of Object.values(MATERIALS)) {
  if (spec.noReceive && spec.c !== undefined) {
    spec.bands = 2;
  }
}
