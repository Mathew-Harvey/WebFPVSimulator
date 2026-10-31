/*
 * shiokaze.js: the colours of Shiokaze Point (src/maps/shiokaze/), the
 * ruined seaside hotels on a cliff island off a hot spring coast. A family
 * with no assets, as ./sunny.js is: the island is one particular place,
 * built in its own map's files, but every colour the kit draws has to be
 * in the kit's table, so this is the island's share of it and nothing else
 * (./catalog.js, FAMILIES).
 *
 * The town's palette, weathered. The hotels are the town's cream and grey
 * concrete gone to stains and rust, the sea is the town's canal water
 * taken out to the deep, the rock is the warm grey of a volcanic coast,
 * and every shadow tint is the town's cool violet, so a ruin in the late
 * sun reads as a panel of the same comic. A colour that would read the
 * same as another at a glance is that other colour.
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
 * one under a dark one. */
const T = 0x6f6790;
const TD = 0x55507a;

export const MATERIALS = {
  /* the hotels: two concretes, the stained band, the dark of an empty
   * window, the room's back wall seen through one, the slab edges */
  skCream: { c: 0xe9dfcc, tint: 0x857c9e },
  skGrey: { c: 0xc9c4c8, tint: T },
  skStain: { c: 0xa8a0a2, tint: TD },
  skVoid: { c: 0x3a3548, tint: 0x24212f, noReceive: true },
  skRoom: { c: 0x7b7282, tint: 0x45405c },
  skSlab: { c: 0xd8d2d0, tint: 0x7d7698 },
  skTile: { c: 0x9fb8c0, tint: 0x56607e },
  skPink: { c: 0xe8c9c4, tint: 0x8a6f8e },
  /* metal: the rails, the rust, the old paint on steel */
  skRail: { c: 0x6b6472, tint: 0x3f3a52 },
  skRust: { c: 0x9a5a40, tint: 0x5a3e58 },
  skRustDark: { c: 0x6e4434, tint: 0x45304a },
  skIron: { c: 0x2f2b38, tint: 0x201e2a },
  skSteel: { c: 0xa9adb6, tint: 0x5c5a7c },
  skMint: { c: 0x8fbfb0, tint: 0x4f6a7e },
  skBlue: { c: 0x5f86b0, tint: 0x3a4670 },
  /* roofs and the back street */
  skRoofSlate: { c: 0x59617a, tint: 0x3b3e64 },
  skRoofTin: { c: 0x7f8a96, tint: 0x4b4f6e },
  skRoofRust: { c: 0x8a5844, tint: 0x553c56 },
  skWood: { c: 0x9a7a62, tint: 0x5e4a62 },
  skWoodDark: { c: 0x6a5450, tint: 0x433650 },
  skPlaster: { c: 0xf2e7d3, tint: 0x8a809e },
  skShutter: { c: 0x847f92, tint: 0x4e4a66 },
  skNoren: { c: 0x3d5a8a, tint: 0x2a3060 },
  /* the shrine */
  skVermilion: { c: 0xd8453f, tint: 0x6e3a5a },
  skStone: { c: 0xcfcad2, tint: 0x6e6888 },
  skRope: { c: 0xd9c08a, tint: 0x7e6a6a },
  skPaper: { f: 0xfbf8f0, noCast: true },
  /* the ground: paving, the lines, the asphalt, the grass, the moss */
  skPave: { c: 0xdcd8e2, tint: 0x847c9c },
  skAsphalt: { c: 0x8e8a9c, tint: 0x5e587e },
  skLine: { f: 0xf4f2f6, noCast: true },
  skYellow: { c: 0xf0c341, tint: 0x8c7050 },
  skMoss: { c: 0x7d9c74, tint: 0x4e6670 },
  skWeed: { c: 0x6f9a62, tint: 0x46606a, foliage: true },
  skIvy: { c: 0x5a8a5c, tint: 0x3c5662, foliage: true },
  skPineLeaf: { c: 0x4f7a62, tint: 0x34485a, foliage: true },
  skBark: { c: 0x765f62, tint: 0x4a3a56 },
  /* the coast: three rocks, the sand, the tetrapods, the foam */
  skRock: { c: 0x9a9296, tint: 0x58506e },
  skRockDark: { c: 0x6f6872, tint: 0x3f3a56 },
  skRockWarm: { c: 0xb09a8a, tint: 0x6a5468 },
  skSand: { c: 0xdccaa6, tint: 0x857a8e },
  skPod: { c: 0xbdb8c0, tint: 0x6a6488 },
  skFoam: { f: 0xf3f4f8, noCast: true },
  skWet: { c: 0x5c5868, tint: 0x34304a },
  /* the harbour: the boats, the buoys, the nets, the beacon */
  skHull: { c: 0xf4f2ee, tint: 0x8a83a8 },
  skHullRed: { c: 0xc8463e, tint: 0x6a3a5e },
  skHullBlue: { c: 0x3d6ec4, tint: 0x2a3a78 },
  skBuoy: { c: 0xef8a3c, tint: 0x7e5050 },
  skNet: { c: 0x3f7f60, tint: 0x2c4c56 },
  skBeaconRed: { c: 0xe0453f, tint: 0x7a3a5a },
  skBeaconWhite: { c: 0xf7f4ee, tint: 0x8a83a8 },
  /* the lights: a lamp glass, the lighthouse lens, a lit vending panel */
  skLamp: { f: 0xfff2c8, noCast: true },
  skLens: { f: 0xfff6d8, noCast: true },
  skCan: { f: 0xe0453f, noCast: true },
  skCanBlue: { f: 0x3d6ec4, noCast: true },
  skGlass: { f: 0x9dc0d4, noCast: true },
  skGlassDark: { f: 0x53627a, noCast: true },
  /* the set dressing's own: rubble, the cardboard, the tatami, a futon */
  skRubble: { c: 0xb4aeb0, tint: 0x66607e },
  skCardboard: { c: 0xc9a06a, tint: 0x7a6062 },
  skTatami: { c: 0xc8bb84, tint: 0x7a7066 },
  skFuton: { c: 0xd9e3ee, tint: 0x6a7296 },
};
