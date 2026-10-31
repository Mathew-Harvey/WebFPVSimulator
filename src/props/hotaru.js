/*
 * hotaru.js: the colours of Hotaru Valley (src/maps/hotaru/), the satoyama
 * valley of rice terraces, a water mill, a farm village of thatched
 * houses, a ruined castle on its hill and a fishing hamlet on the bay. A
 * family with no assets, as ./sunny.js is: every colour the kit draws has
 * to be in the kit's table, so this is the valley's share of it and
 * nothing else (./catalog.js, FAMILIES).
 *
 * THE TOWN'S HAND, NOT A NEW ONE. Every value here is the town's palette
 * (src/maps/city/vendored/core/palette.js) or sits on one of its ladders:
 * the onsen street's four woods and its plaster and tile, the back hills'
 * stone, the lake's boats, the shrine's vermilion. A valley that is a
 * day's walk from the town has to be lit by the same sun and drawn by the
 * same pen, so the shadow tints are the town's violets, and no colour is
 * louder than the town lets a focal object be. The trees are not here at
 * all: the cedar and the broadleaf draw in ./street.js's own tones, so a
 * forest of them adds no material and no draw call.
 *
 * The kit bakes one batch per material per chunk and the map then folds
 * each chunk's plain batches into one (src/maps/sunny/palette.js), so a
 * colour costs no draw of its own. The list is still kept short: a colour
 * that would read the same as another at a glance is that other colour.
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

import { PAL } from '../maps/city/vendored/core/palette.js';

/* The town's shadow tints. */
const T = 0x6f6790;
const TD = 0x5c5680;

export const MATERIALS = {
  /* thatch: the gassho roofs, sun bleached on the slope, darker where the
   * eaves are cut and where the ridge is capped */
  hvThatch: { c: 0xc9b07c, tint: 0x7c6a7e },
  hvThatchCut: { c: 0x9c8460, tint: 0x5e4e66 },
  hvThatchCap: { c: 0x6f5e50, tint: 0x4a3e56 },
  /* the onsen street's woods: frame, deep members, fresh cedar */
  hvWood: { c: PAL.onsenWood, tint: 0x5e4a62 },
  hvWoodDark: { c: PAL.onsenWoodDark, tint: 0x3e3048 },
  hvWoodPale: { c: PAL.onsenWoodPale, tint: 0x6f5f7a },
  hvWoodWet: { c: 0x5e4a3c, tint: 0x3e3448 },
  /* plaster, the kura's white and the houses' warmer one, and shoji */
  hvPlaster: { c: 0xf4efe4, tint: 0x8a83a8 },
  hvPlasterWarm: { c: PAL.onsenPlaster, tint: 0x847c9c },
  hvShoji: { f: 0xf2e9d4, noCast: true },
  hvShojiLit: { f: 0xffe2a8, noCast: true },
  /* tile: the kawara of the kura and the boathouses, near black at range */
  hvTile: { c: PAL.onsenTile, tint: 0x34324a },
  hvTileEdge: { c: PAL.onsenTileEdge, tint: 0x3c3a52 },
  hvTileBlue: { c: 0x5a6378, tint: 0x3e4060 },
  /* the shrine: vermilion, its black feet, the green of old copper */
  hvTorii: { c: PAL.torii, tint: 0x7a3a5a },
  hvToriiDeep: { c: PAL.toriiDeep, tint: 0x5e2e4e },
  hvBlack: { c: PAL.black, tint: 0x22202e },
  hvCopper: { c: 0x6fa898, tint: 0x3f5a6e },
  hvRope: { c: 0xe8d9a8, tint: 0x8a7a80 },
  hvPaper: { f: 0xfaf6ee, noCast: true },
  /* stone: the castle's walls, the steps, the lanterns, the jizo, moss */
  hvStone: { c: PAL.stone, tint: 0x66607e },
  hvStoneDark: { c: PAL.stoneDark, tint: TD },
  hvStoneWarm: { c: PAL.stoneWarm, tint: 0x6a6286 },
  hvMoss: { c: PAL.hillMoss, tint: 0x4e6a72 },
  hvBib: { c: PAL.shrineBib, tint: 0x6a3a5e },
  /* the fields: earth risers, the aze, mud, straw */
  hvEarth: { c: PAL.hillEarth, tint: 0x6e6486 },
  hvAze: { c: 0xa9b884, tint: 0x5e6e7c },
  hvMud: { c: 0x9c8f7c, tint: 0x5e5470 },
  hvStraw: { c: 0xdcc58e, tint: 0x8a7a80 },
  hvStrawDark: { c: 0xb79d66, tint: 0x6e5e6e },
  /* the harbour: the boats' paint, rust and tetrapod concrete */
  hvBoatWhite: { c: PAL.boatWhite, tint: 0x8a83a8 },
  hvBoatBlue: { c: 0x4a7fae, tint: 0x3e4a74 },
  hvBoatRed: { c: PAL.boatRed, tint: 0x7a4462 },
  hvBoatTeal: { c: PAL.boatTeal, tint: 0x4a6478 },
  hvDeck: { c: PAL.boatDeck, tint: 0x6e6280 },
  hvRust: { c: 0xa0624a, tint: 0x5e4260 },
  hvConcrete: { c: PAL.concreteMid, tint: 0x6a6288 },
  hvFloat: { c: 0xf0a63c, tint: 0x80584e },
  hvNet: { c: 0x5b8a7a, tint: 0x3e5468 },
  /* the persimmons and the lamps */
  hvKaki: { c: 0xf08a34, tint: 0x80504e },
  hvLamp: { f: 0xfff2c8, noCast: true },
  /* bamboo: the culms and their two greens, which are canopies */
  hvBamboo: { c: 0xa9c27a, tint: 0x5f7a72 },
  hvBambooLeaf0: { c: 0xb4cf86, tint: 0x5f7a7e, noReceive: true, foliage: true },
  hvBambooLeaf1: { c: 0x86ad6c, tint: 0x4f6a78, noReceive: true, foliage: true },
  /* the persimmon's own leaves, turning */
  hvKakiLeaf: { c: 0xc69a52, tint: 0x6e5a66, noReceive: true, foliage: true },
  /* the road and its paint */
  hvAsphalt: { c: PAL.road, tint: 0x6a608f },
  hvLine: { f: PAL.lineWhite, noCast: true },
  hvGravel: { c: PAL.gravel, tint: 0x5f5880 },
  /* the water a craft looks into: the mill race's white, a flat */
  hvFoam: { f: 0xf2f7fa, noCast: true },
};
