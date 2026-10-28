/*
 * sunny.js: the colours of Sunnyfield (src/maps/sunny/), the sunny
 * cartoon American suburb with the power plant, the giant donut and the
 * gorge. A family with no assets, as ./homes.js is: the town is one
 * particular place, built in its own map's files, but every colour the kit
 * draws has to be in the kit's table, so this is Sunnyfield's share of it
 * and nothing else (./catalog.js, FAMILIES).
 *
 * The kit bakes one batch per material per chunk, and the map then merges
 * each chunk's batches into one a look, with the colour on the vertices
 * (src/maps/sunny/palette.js), so a colour costs no draw of its own. The
 * list is still short on purpose: six house sidings, four roofs, three
 * doors, three shutters, and the landmarks' own. A colour that would read
 * the same as another at a glance is that other colour. All of it is our
 * own: bright, warm and a little candy, the way a sunny cartoon town
 * reads, in the town's cel shading and its violet shadow tints, and none
 * of it matched to anybody's show.
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

/* The town's shadow tints: a cool violet under a warm colour and a deeper
 * one under a dark colour, so Sunnyfield sits in the same light. */
const T = 0x6f6790;
const TD = 0x5c5680;

export const MATERIALS = {
  /* the houses: six sidings, the trim, four roofs */
  sfPeach: { c: 0xf4bf98, tint: 0x8a6f8e },
  sfMint: { c: 0xa9dcc0, tint: 0x5f7a92 },
  sfButter: { c: 0xf6dc86, tint: 0x8c7a84 },
  sfSky: { c: 0x9fcbea, tint: 0x5f6f9a },
  sfLilac: { c: 0xcbb6e4, tint: 0x6f6596 },
  sfSalmon: { c: 0xee9e8e, tint: 0x84607e },
  sfTrim: { c: 0xfbf8f0, tint: 0x8a83a8 },
  sfRoofRed: { c: 0xb8504a, tint: 0x5e3e62 },
  sfRoofSlate: { c: 0x56688a, tint: 0x3b3e64 },
  sfRoofBrown: { c: 0x7c5844, tint: 0x4c3a58 },
  sfRoofTeal: { c: 0x3f8a86, tint: 0x324c66 },
  /* doors and shutters */
  sfDoorRed: { c: 0xd2463e, tint: 0x6a3a5e },
  sfDoorNavy: { c: 0x2f4a7c, tint: 0x2a2f55 },
  sfDoorGreen: { c: 0x3f8a52, tint: 0x2f5056 },
  sfGlass: { f: 0x7fb3d8, noCast: true },
  sfGlassDark: { f: 0x3e5a7a, noCast: true },
  /* the ground's furniture */
  sfAsphalt: { c: 0x5f5d6c, tint: 0x433f5e },
  sfLine: { f: 0xf2d24a, noCast: true },
  sfPaint: { f: 0xf6f4ee, noCast: true },
  sfWalk: { c: 0xd9d3c8, tint: 0x847c9c },
  sfConcrete: { c: 0xbab5b0, tint: TD },
  sfHedge: { c: 0x4f9a52, tint: 0x3c5a6a },
  sfLawn: { c: 0x7cc05e, tint: 0x4e7a6a },
  sfWood: { c: 0xa87a52, tint: 0x5e4a62 },
  sfPoleWood: { c: 0x75584a, tint: 0x4a3a56 },
  sfIron: { c: 0x2c2a33, tint: 0x22202e },
  sfSteel: { c: 0x9aa3ad, tint: 0x5c5a7c },
  sfBrick: { c: 0xb0634c, tint: 0x62527a },
  sfWater: { f: 0x48b4e8, noCast: true },
  /* the shops' signs and stripes */
  sfPink: { c: 0xf39ac0, tint: 0x8a5a86 },
  sfRed: { c: 0xe0483a, tint: 0x7a3a5a },
  sfYellow: { c: 0xf6c431, tint: 0x8c7050 },
  sfOrange: { c: 0xf08a34, tint: 0x80504e },
  sfPurple: { c: 0x7d5bb4, tint: 0x45386e },
  sfTeal: { c: 0x2fa4a0, tint: 0x2f5a70 },
  sfLamp: { f: 0xfff2c8, noCast: true },
  /* the donut */
  sfDough: { c: 0xd8954e, tint: 0x7c5462 },
  sfGlaze: { c: 0xffa6cf, tint: 0x9a6a98 },
  /* the plant */
  sfTower: { c: 0xe6e2da, tint: 0x8c86a6 },
  sfTowerIn: { c: 0x8f8a94, tint: 0x55506e, noReceive: true },
  sfPlant: { c: 0xc9ccd4, tint: 0x6e6c8e },
  sfHazard: { c: 0xf2c12e, tint: 0x80704a },
  sfGlow: { f: 0x9cf04a, noCast: true },
  /* the dump, the gorge and the hill */
  sfRust: { c: 0x9c5a3a, tint: 0x5a3e5a },
  sfTyre: { c: 0x2b2a2f, tint: 0x1e1d28 },
  sfDirt: { c: 0xb79466, tint: 0x6a5468 },
  sfRock: { c: 0xc08a5a, tint: 0x6e4e62 },
  sfRockDark: { c: 0x8e6244, tint: 0x553f58 },
  sfStone: { c: 0xb4aeb8, tint: 0x66607e },
  sfFire: { f: 0xff8a2a, noCast: true },
  /* the set dressing's own: the pavement's joints, the road's patches,
   * cardboard */
  sfJoint: { c: 0xb9b2a6, tint: 0x847c9c },
  sfPatch: { c: 0x4f4d5c, tint: 0x3a3654 },
  sfCardboard: { c: 0xc9a06a, tint: 0x7a6062 },
};
