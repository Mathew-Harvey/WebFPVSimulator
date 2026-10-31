/*
 * towers.js: the colours of Kumoi Towers (src/maps/towers/), the tower
 * district with the old lanes under its feet. A family with no assets, as
 * ./sunny.js is: every colour the kit draws has to be in the kit's table,
 * so this is the district's share of it and nothing else (./catalog.js,
 * FAMILIES).
 *
 * The district is the town's, grown tall, so these are the town's own
 * colours (src/maps/city/vendored/core/palette.js) wherever the town has
 * one, and the few it has no use for are pulled into its range: a steel
 * frame in red oxide primer, the ginkgo's autumn yellow, a hoarding's
 * white and blue, a lantern's red. Each lit colour carries the town's
 * violet shadow tint, so a tower stands in the same light as a shrine.
 * The facades are not here: they are pictures, painted by
 * src/maps/towers/facade.js.
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
  /* the ground: plaza paving, pavement, kerb, road, its paint */
  twPave: { c: PAL.sidewalkAlt, tint: 0x847c9c },
  twPaveDark: { c: 0xcfc8d2, tint: 0x7c7496 },
  twWalk: { c: PAL.sidewalk, tint: 0x847c9c },
  twCurb: { c: PAL.curb, tint: TD },
  twRoad: { c: PAL.road, tint: 0x6a608f },
  twRoadDark: { c: PAL.roadDark, tint: 0x5f5784 },
  twLine: { f: PAL.lineWhite, noCast: true },
  twLineYellow: { f: PAL.lineYellow, noCast: true },
  twTactile: { f: PAL.tactile, noCast: true },
  /* the towers' roofs, parapets, podium stone and plant */
  twRoof: { c: PAL.concreteMid, tint: 0x6a6288 },
  twRoofDark: { c: PAL.concreteDark, tint: 0x655d84 },
  twParapet: { c: 0xd4cfd9, tint: TD },
  twStone: { c: PAL.stoneWarm, tint: 0x6a6288 },
  twGlassRoof: { c: 0xa9c4d6, tint: 0x5f6f9a },
  twHeli: { f: 0xf2c341, noCast: true },
  twHeliPad: { c: 0x8a8597, tint: 0x5a5678 },
  /* the frame going up, its decks and the hoarding round it */
  twSteel: { c: 0xb4604c, tint: 0x5f4f74 },
  twSteelDeep: { c: 0x8f4a3c, tint: 0x523f66 },
  twDeck: { c: 0xc9c4cc, tint: 0x655d84 },
  twHoard: { c: 0xf4f2f0, tint: T },
  twHoardBlue: { c: 0x4a7fae, tint: 0x3f4a7a },
  twMesh: { c: 0x9fb5a4, tint: 0x55627a },
  /* the expressway and the railway */
  twBridge: { c: 0xc4c0c9, tint: 0x655d84 },
  twBridgeDark: { c: 0x9e99a8, tint: 0x5a5678 },
  twGirder: { c: 0x7f8a9a, tint: 0x4f4d72 },
  twRail: { c: PAL.railMetal, tint: TD },
  twSleeper: { c: PAL.sleeper, tint: 0x4f4a66 },
  twBallast: { c: PAL.ballast, tint: 0x524c68 },
  twTrain: { c: PAL.trainBody, tint: 0x8a83a8 },
  twTrainBand: { c: 0x5fae5a, tint: 0x3f5a62 },
  /* the ginkgo, in autumn, and the plaza's water */
  twGinkgo0: { c: 0xf7d257, bands: 'soft', tint: 0xb48a6e, noReceive: true, foliage: true },
  twGinkgo1: { c: 0xebb83a, bands: 'soft', tint: 0xa47862, noReceive: true, foliage: true },
  twGinkgoLeaf: { f: 0xf2c84a, noCast: true },
  twTrunk: { c: PAL.trunkDark, tint: 0x6a5a72 },
  twWater: { f: PAL.water, noCast: true },
  twWaterDeep: { f: PAL.waterDeep, noCast: true },
  twHedge: { c: 0x5f9470, tint: 0x4f6488 },
  twGrass: { c: PAL.grass, tint: 0x5f7a86 },
  twSculpt: { c: PAL.red, tint: 0x7a3a5a },
  /* the old lanes: wood, plaster, tin, lanterns */
  twWood: { c: PAL.shrineWood, tint: 0x5e4a62 },
  twWoodDark: { c: PAL.onsenWoodDark, tint: 0x3a2e46 },
  twPlaster: { c: PAL.onsenPlaster, tint: 0x7a7096 },
  twTin: { c: 0x8e919b, tint: 0x5a5678 },
  twTinRust: { c: 0x9c6c54, tint: 0x5f4f74 },
  twTinBlue: { c: 0x6f8aa8, tint: 0x4a4a7a },
  twLantern: { f: PAL.lanternLit, noCast: true },
  twLanternRed: { f: 0xe2503f, noCast: true },
  twCrate: { c: PAL.crate, tint: 0x3f4a7a },
  twCrateRed: { c: PAL.crateAlt, tint: 0x7a3a5a },
  /* the park's shrine, in the town's own shrine colours */
  twTorii: { c: PAL.torii, tint: 0x7a3a5a },
  twBlack: { c: PAL.black, tint: 0x22202e },
  twShrineWood: { c: PAL.shrineWoodDark, tint: 0x4c3a58 },
  twShrineRoof: { c: PAL.shrineRoof, tint: 0x3b3e64 },
  /* the building site's dirt */
  twDirt: { c: PAL.dirt, tint: 0x6a5468 },
};
