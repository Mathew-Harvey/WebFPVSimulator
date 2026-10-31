/*
 * sanatorium.js: the colours of Kirigaoka Sanatorium (src/maps/sana/), the
 * pre-war hill sanatorium left to the weather. A family with no assets, as
 * ./sunny.js is: the place is built in its own map's files, but every
 * colour the kit draws has to be in the kit's table, so this is its share
 * of it and nothing else (./catalog.js, FAMILIES).
 *
 * Most of the sanatorium is drawn in the town's own colours, by the kit's
 * own names (wallCream, concreteWorn, slab, rubble, rustDeep, glassDark,
 * leaf0 and the rest, ./kit.js SPEC), because it is meant to read as a
 * building at the edge of the same town. What is here is only what the
 * town has no word for: plaster that has gone grey under the eaves, the
 * green black of a wall that stays wet, a verdigris roof, a stone wall's
 * two greys, the iron beds left in the wards, and a moss and an ivy that
 * take the comic layer's leaf clumps. Every shadow tint is the town's
 * violet, a little deeper under a darker colour, so the place sits in the
 * town's light. The map merges each chunk's batches into one a look with
 * the colour on the vertices (src/maps/sunny/palette.js), so a colour here
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

export const MATERIALS = {
  /* the plaster: as built, gone grey under the eaves, and the streak of a
   * wall that stays wet under a broken gutter */
  kiPlaster: { c: 0xf1e9da, tint: 0x7d7698 },
  kiStain: { c: 0xd5cbb8, tint: 0x6c6588 },
  kiDamp: { c: 0x8f9682, tint: 0x4d5468 },
  /* the frames, painted a hospital green that has peeled to the wood */
  kiFrame: { c: 0x6f9a8a, tint: 0x435a6e },
  kiTimber: { c: 0x8a6c58, tint: 0x4e4060 },
  kiTimberPale: { c: 0xb59c80, tint: 0x66587a },
  /* the roofs: verdigris copper on the tower and the chapel, the wings'
   * flat roofs a tarred deck */
  kiCopper: { c: 0x76ab9b, tint: 0x3f5c70 },
  kiCopperDark: { c: 0x5a8a7e, tint: 0x344e66 },
  kiDeck: { c: 0x8e8a96, tint: 0x56527a },
  /* the terrace wall, two greys of dressed stone, and its moss */
  kiStone: { c: 0xbdb6aa, tint: 0x655f80 },
  kiStoneDark: { c: 0x958e84, tint: 0x524c6c },
  kiMoss: { c: 0x7fa36a, tint: 0x46616e, noReceive: true, foliage: true },
  kiIvy: { c: 0x4f8a5c, tint: 0x34505f, noReceive: true, foliage: true },
  kiWisteria: { c: 0xb9a3dc, tint: 0x6a5c8e, noReceive: true, foliage: true },
  kiTurf: { c: 0x8fae80, tint: 0x55706e },
  /* the wards: tiled floors, the iron beds and their mattresses */
  kiTile: { c: 0xb9c6c0, tint: 0x5f6a80 },
  kiBed: { c: 0xdfe3e6, tint: 0x6d6c90 },
  kiMattress: { c: 0xd8cdb4, tint: 0x75688a },
  /* the boiler house and the chimney */
  kiBrick: { c: 0xa8614c, tint: 0x5e4a6e },
  kiSoot: { c: 0x4a4550, tint: 0x2e2a38 },
  /* the water in the pond, flat and dull */
  kiPond: { f: 0x6f97a6, noCast: true },
  /* a red that the town uses for a post box, here a fire hose box and the
   * bell */
  kiRed: { c: 0xd84a40, tint: 0x6e3a5c },
  kiBronze: { c: 0x8e7a4e, tint: 0x524462 },
};
