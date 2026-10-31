/*
 * office.js: the colours of Hoshino Shoji (src/maps/office/), a small
 * Japanese trading company's building: a goods-in warehouse on the ground
 * floor, the sales floor over it, the management floor over that, and the
 * street, the alley and the neighbours round it.
 *
 * A FAMILY WITH NO ASSETS, as src/props/homes.js is: the building is one
 * particular building and not a thing a builder drags, but its walls, desks
 * and boxes are drawn by the same kit as every asset, and a colour the kit
 * draws has to be in the kit's table (./catalog.js, FAMILIES).
 *
 * MANY COLOURS, FEW DRAWS. The kit bakes a batch per colour per chunk, and
 * the map folds every plain batch of a chunk into one afterwards, its colour
 * and its shadow tint riding on the vertices (src/maps/sunny/palette.js,
 * mergePalette). So a colour here is not a draw call, and the office can
 * have a binder's red and a binder's yellow where the warehouse made do with
 * eighteen colours in all.
 *
 * WHAT IS LIT AND WHAT IS NOT. Outside, the street, the tiles and the
 * neighbours take the sun's shadow the way the town does. Inside, nothing
 * does (`noReceive`): the floor above would put every room in its one dark
 * band all day. The sun still comes in, as the patches it lays on the floor
 * under the windows (ofSun), which the plan works out from the town's sun
 * and paints, so the light through the blinds is drawn the way a comic draws
 * it rather than measured by a shadow map.
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
 * one under a dark colour. */
const T = 0x6f6790;
const TD = 0x5c5680;

export const MATERIALS = {
  /* ---- inside: floors, walls, ceilings ---- */
  /* The goods-in floor, sealed concrete, and its painted walkway lines. */
  ofSlab: { c: 0xa9a7a0, tint: 0x6c6a84, noReceive: true },
  ofSlabLine: { c: 0xe9c43a, tint: 0x8a7050, noReceive: true },
  ofSlabGreen: { c: 0x6f9a78, tint: 0x46607a, noReceive: true },
  /* The sales floor's carpet tiles, two greys laid in a check, and the
   * management floor's warmer carpet. */
  ofCarpet: { c: 0x8d94a6, tint: 0x5c5f80, noReceive: true },
  ofCarpetB: { c: 0x7c8399, tint: 0x55587a, noReceive: true },
  ofCarpetWarm: { c: 0xa39a8a, tint: 0x6a6280, noReceive: true },
  ofCarpetRed: { c: 0x9a4a4a, tint: 0x5a3456, noReceive: true },
  /* The sun's patch through a window, and through the blinds' slats. */
  ofSun: { c: 0xf6dfa8, tint: 0xb59a8a, noReceive: true },
  ofWallIn: { c: 0xebe6da, tint: 0x958ca8, noReceive: true },
  ofWallInB: { c: 0xd9dfe2, tint: 0x8790aa, noReceive: true },
  ofSkirting: { c: 0x5d6070, tint: 0x3c3d58, noReceive: true },
  ofCeiling: { c: 0xf1eee6, tint: 0xa49cb6, noReceive: true },
  ofBeam: { c: 0x8a8f99, tint: 0x55566e, noReceive: true },

  /* ---- inside: furniture ---- */
  /* The grey steel desk and its pale grey green top, every Japanese office's. */
  ofDesk: { c: 0xb8bcbc, tint: 0x6f7088, noReceive: true },
  ofDeskTop: { c: 0xcfd8c9, tint: 0x7a8288, noReceive: true },
  ofDeskPanel: { c: 0x9ea6ad, tint: 0x60667e, noReceive: true },
  ofChair: { c: 0x2e3240, tint: 0x24263a, noReceive: true },
  ofChairSeat: { c: 0x3d5f92, tint: 0x2e3a66, noReceive: true },
  ofChairBoss: { c: 0x3a2a26, tint: 0x2a2030, noReceive: true },
  ofMonitor: { c: 0x24262d, tint: 0x1d1f2c, noReceive: true },
  ofCabinet: { c: 0xd3d5d0, tint: 0x8a8ca2, noReceive: true },
  ofCabinetDark: { c: 0x8e939b, tint: 0x5a5c74, noReceive: true },
  ofBinderBlue: { c: 0x3c66ad, tint: 0x2c3a6c, noReceive: true },
  ofBinderRed: { c: 0xc8473f, tint: 0x6a3456, noReceive: true },
  ofBinderYellow: { c: 0xe8bb3a, tint: 0x8a7050, noReceive: true },
  ofBinderGreen: { c: 0x4f915c, tint: 0x345a5a, noReceive: true },
  ofPaper: { c: 0xf7f5ee, tint: 0xa29cb8, noReceive: true },
  ofPartition: { c: 0x7f8ba4, tint: 0x4c5276, noReceive: true },
  ofPartitionFrame: { c: 0xd5d7d9, tint: 0x8a8ca4, noReceive: true },
  ofWood: { c: 0xcc9d63, tint: 0x7c5a62, noReceive: true },
  ofWoodDark: { c: 0x7b5237, tint: 0x4a3446, noReceive: true },
  ofLeather: { c: 0x5a3426, tint: 0x3a2434, noReceive: true },
  ofSofa: { c: 0x2f4a5c, tint: 0x253048, noReceive: true },
  ofWhite: { c: 0xf4f2ec, tint: 0x9c97b2, noReceive: true },
  ofBlack: { c: 0x25262d, tint: 0x1e1f2c, noReceive: true },
  ofRed: { c: 0xd43c33, tint: 0x6e2f52, noReceive: true },
  ofYellow: { c: 0xf2c52c, tint: 0x8a7050, noReceive: true },
  ofOrange: { c: 0xe8792a, tint: 0x80482e, noReceive: true },
  ofTeal: { c: 0x3f9a94, tint: 0x2e5868, noReceive: true },
  ofPink: { c: 0xf0a7bc, tint: 0x9a6a8a, noReceive: true },
  ofLeaf: { c: 0x5ea05a, tint: 0x3f5f62, noReceive: true },
  ofLeafDark: { c: 0x3a7448, tint: 0x2c4a52, noReceive: true },
  ofPot: { c: 0xe7e0d2, tint: 0x948aa6, noReceive: true },
  ofSteel: { c: 0x9aa0a8, tint: 0x5e6078, noReceive: true },
  ofChrome: { c: 0xd9dde2, tint: 0x8a90a8, noReceive: true },
  ofBlind: { c: 0xece4cf, tint: 0x9a90a2, noReceive: true },
  ofFrame: { c: 0xc9ccd0, tint: 0x80849e, noReceive: true },
  /* The goods-in floor's furniture: the blue shelving with its orange
   * beams, cardboard and its tape, pallets, the roll cages, the forklift. */
  ofRack: { c: 0x3f6fb2, tint: 0x2e3c6c, noReceive: true },
  ofRackBeam: { c: 0xe5772c, tint: 0x80482e, noReceive: true },
  ofCard: { c: 0xcc9a5e, tint: 0x7c5a62, noReceive: true },
  ofCardDark: { c: 0xae7d47, tint: 0x6a4a52, noReceive: true },
  ofTape: { c: 0xe2c995, tint: 0x8c7a7c, noReceive: true },
  ofPallet: { c: 0xb68b58, tint: 0x6c5258, noReceive: true },
  ofWrap: { c: 0xdde8ee, tint: 0x8c98b2, noReceive: true },
  ofCage: { c: 0xaab1ba, tint: 0x666a84, noReceive: true },
  ofForklift: { c: 0xeeb02e, tint: 0x8a6a46, noReceive: true },
  /* The lift: its shaft's bare concrete, the stainless frames, and the
   * works' yellow and black. */
  ofShaft: { c: 0x9c9b97, tint: 0x5f5d7c, noReceive: true },
  ofStainless: { c: 0xc5cbd1, tint: 0x7a8098, noReceive: true },
  ofStair: { c: 0xbfc1bd, tint: 0x6f6f88, noReceive: true },
  ofStairNose: { c: 0x4c5a52, tint: 0x323a4c, noReceive: true },
  ofRail: { c: 0x6c5848, tint: 0x40344a, noReceive: true },

  /* ---- lit, unlit and glowing ---- */
  ofLamp: { f: 0xfffbea, noCast: true },
  ofScreen: { f: 0xc9e4f2, noCast: true },
  ofScreenWarm: { f: 0xf2e6c4, noCast: true },
  ofFrost: { f: 0xc9d3dc, noCast: true },

  /* ---- outside ---- */
  /* The building's beige tile and the darker band at each floor, its
   * aluminium sashes, and the green of a flat roof's waterproofing. */
  ofTile: { c: 0xdcc8a6, tint: T },
  ofTileDark: { c: 0xa48b70, tint: TD },
  ofSash: { c: 0xb9bec4, tint: 0x6a6a8a },
  ofRoof: { c: 0x7fa08a, tint: 0x4f6478 },
  ofRoofEdge: { c: 0xc7c3ba, tint: TD },
  ofTank: { c: 0xe6ecf0, tint: 0x8c94b0 },
  ofTankBlue: { c: 0x6b9ac2, tint: 0x3f5a86 },
  ofAc: { c: 0xe7e4dc, tint: 0x8a84a0 },
  ofSteelOut: { c: 0x667a70, tint: 0x3f4a5c },
  ofSteelOutDark: { c: 0x45524c, tint: 0x2f3444 },
  ofBillboard: { c: 0xf4efe2, tint: 0x8c86a6 },
  /* The street: asphalt, its white lines, the gutters, the poles. */
  ofAsphalt: { c: 0x5a5b6c, tint: 0x403e5c },
  ofRoadLine: { c: 0xf1ede2, tint: 0xa8a2b6 },
  ofGutter: { c: 0xb5b2aa, tint: TD },
  ofPole: { c: 0xbcb9b0, tint: TD },
  ofWire: { c: 0x2a2a30, tint: 0x22222c },
  ofMirror: { c: 0xe9762a, tint: 0x7a4260 },
  /* The neighbours: a grey concrete block, a pale teal flats, a salmon
   * tiled block across the street, a cream one, and their dark roofs. */
  ofNbGrey: { c: 0xb3b0aa, tint: TD },
  ofNbTeal: { c: 0xa6bfbd, tint: 0x5f6a90 },
  ofNbSalmon: { c: 0xd7a48a, tint: 0x7a5a78 },
  ofNbCream: { c: 0xe6dcc4, tint: T },
  ofNbBrown: { c: 0x8a6650, tint: 0x4f3e5a },
  ofNbWindow: { c: 0x4c5c78, tint: 0x30364f },
  ofNbRoof: { c: 0x5f6170, tint: 0x3f3d58 },
  ofNoren: { c: 0x2e4382, tint: 0x2a2e5a },
  ofLantern: { f: 0xff6a4a, noCast: true },
  ofKei: { c: 0xf2f2ee, tint: 0x8c88a6 },
  ofVend: { c: 0xf4f3ef, tint: 0x8c88a6 },
  ofVendRed: { c: 0xd8343a, tint: 0x6e2f52 },
  ofVendBlue: { c: 0x2f62b0, tint: 0x2a3466 },
  ofBike: { c: 0x3f8a6a, tint: 0x2f4a5a },
};
