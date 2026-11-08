/*
 * school.js: the colours of Midori Gakuen (src/maps/school/), the school
 * the Infected mini game is played in. A family with no assets, like
 * ./homes.js: the school is one particular building, and this file is its
 * share of the kit's colour table and nothing else (./catalog.js,
 * FAMILIES).
 *
 * SIXTEEN COLOURS AND NO MORE, because the school is one chunk and every
 * colour is a draw call: cream plaster, the hallway's green wainscot, pale
 * lino, honey wood, grey steel, the blackboards' green black, charcoal,
 * white, and five paints (red, blue, yellow, green, pink) for the things a
 * school paints: banners, mats, curtains, posters and books. Three are lit and keep their
 * colour at any hour: the ceiling lamps, the painted windows' sky and the
 * patches of evening sun on the floor.
 *
 * WHAT IS LIT AND WHAT IS NOT. Everything is inside, under two floors of
 * slab, and a room in the slab's shadow all day would read in its one dark
 * band. So every colour is `noReceive`, the houses' answer
 * (./homes.js says why), and costs nothing.
 *
 * GREEN IS THE GAME'S. The infected are green and the clean are white, so
 * the school's own green is the hallway's soft sage, well off the infected
 * green, and the one bright green (scGreen) is kept for the glass tank's
 * base in the science lab, where the first infected starts.
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

export const MATERIALS = {
  /* walls, floors and ceilings */
  scWall: { c: 0xf1e6cc, tint: 0x9a90ac, noReceive: true },
  scWainscot: { c: 0x9fbfa4, tint: 0x5f7484, noReceive: true },
  scLino: { c: 0xc4c9b2, tint: 0x7c7c94, noReceive: true },
  scWood: { c: 0xd29c5e, tint: 0x8a6670, noReceive: true },
  scWhite: { c: 0xf6f2ea, tint: 0xd2cad8, noReceive: true },
  /* furniture */
  scSteel: { c: 0x8a93a0, tint: 0x55587a, noReceive: true },
  scDark: { c: 0x2c2e36, tint: 0x20212e, noReceive: true },
  /* paints */
  scRed: { c: 0xd2483e, tint: 0x6e3454, noReceive: true },
  scBlue: { c: 0x4a7fc8, tint: 0x34467a, noReceive: true },
  scYellow: { c: 0xf2c440, tint: 0x8a7050, noReceive: true },
  scGreen: { c: 0x52c86a, tint: 0x2f6a5a, noReceive: true },
  scPink: { c: 0xf2a6bd, tint: 0x9a6a8a, noReceive: true },
  /* lights: the lamps, the windows' evening sky and the sun on the floor */
  scLamp: { f: 0xfff6e2, noCast: true },
  scSky: { f: 0xffd9a8, noCast: true },
  scSun: { f: 0xffe2b0, noCast: true },
};
