/*
 * factory.js: the colours of Hamakaze Works (src/maps/factory/), the steel
 * and chemical works on the canal. A family with no assets, as ./sunny.js
 * is: the works is one particular place, built in its own map's files, but
 * every colour the kit draws has to be in the kit's table, so this is the
 * works' share of it and nothing else (./catalog.js, FAMILIES).
 *
 * THE LOOK IS THE TOWN'S. The works borrows the kit's own town colours
 * where the town already has the thing (corrugated sheet and its ribs,
 * concrete, block, rust, glass, the cranes' yellow, the blossom), and adds
 * here only what a works has and a town does not: the red and white of a
 * tall stack, the code colours Japanese plants paint their pipes in (steam
 * a dark red, water a blue, gas a yellow, oil a brown, air a pale grey),
 * the aluminium lagging most of them wear instead, the green epoxy of a
 * shop floor, the yellow of every handrail and the iron ore of the yard.
 * Every one is pulled toward the town's cream and slate and sits on the
 * town's violet shadow tints, so a pilot who flies here from the town is
 * looking at the same light.
 *
 * The map merges each chunk's batches into one a look, the colour riding
 * on the vertices (src/maps/sunny/palette.js), so a colour costs no draw of
 * its own; the list is still short, because a colour that reads the same
 * as another at a glance is that other colour.
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

/* The town's shadow tints. */
const T = 0x6f6790;
const TD = 0x5c5680;

export const MATERIALS = {
  /* the stack's bands, the flare's and the gantry's warning paint */
  fkRed: { c: 0xc8524a, tint: 0x6a3f62 },
  fkWhite: { c: 0xf1ede4, tint: 0x857ea4 },
  /* the pipes: lagged in aluminium, or bare in their code colours */
  fkLag: { c: 0xd6d9dc, tint: 0x6f6c92 },
  fkLagBand: { c: 0xa9adb6, tint: TD },
  fkSteam: { c: 0x9a4a46, tint: 0x5a3a5e },
  fkWaterPipe: { c: 0x5f86ad, tint: 0x46497a },
  fkGas: { c: 0xe8c04a, tint: 0x7f6a58 },
  fkOil: { c: 0x8a6a4c, tint: 0x55445e },
  fkAir: { c: 0xc4ccd2, tint: T },
  fkValve: { c: 0xc9473c, tint: 0x66395c },
  /* structural steel: the racks' grey green, the gantry's and the hall
   * crane's yellow (the kit's craneYellow is the tower crane's), the
   * handrails, and the steel of the hall's frame inside */
  fkSteel: { c: 0x8f9c98, tint: 0x5a5a7c },
  fkSteelDark: { c: 0x5e6670, tint: 0x45446a },
  fkYellow: { c: 0xecb93a, tint: 0x7c6458 },
  fkRail: { c: 0xf0c43e, tint: 0x80684e },
  /* the hall's and the control house's walls and floors */
  fkPanel: { c: 0xd8d2c4, tint: 0x7a739a },
  fkPanelBlue: { c: 0x9fb2c2, tint: 0x5e638a },
  fkFloor: { c: 0x7e9c84, tint: 0x4e5a72 },
  fkFloorLine: { f: 0xf2d24a, noCast: true },
  fkConsole: { c: 0xc9cfcf, tint: T },
  fkScreen: { f: 0x6fd0b0, noCast: true },
  fkScreenDark: { f: 0x2a3a48, noCast: true },
  /* the spheres and tanks, pale, on the soft ramp the town's water tank
   * wears, so a ball under three lights is one soft step and not a gem */
  fkSphere: { c: 0xeef0ea, bands: 'soft3', tint: 0xb8b2d2 },
  fkTank: { c: 0xe2e0d6, tint: 0x8580a2 },
  fkTankRoof: { c: 0xb9bcc0, tint: 0x6a6890 },
  /* the yard: ore, coal, the canal, the quay's edge */
  fkOre: { c: 0x9a5a48, tint: 0x5a3e5a },
  fkCoal: { c: 0x3f3c48, tint: 0x2c2a3a },
  fkWater: { f: 0x5f8f9c, noCast: true },
  fkWaterDeep: { f: 0x4a7482, noCast: true },
  fkQuay: { c: 0xb8b2aa, tint: TD },
  fkFender: { c: 0x2e2c34, tint: 0x22202e },
  fkBelt: { c: 0x34323a, tint: 0x26243a },
  /* rust streaks, soot and the heat of the ladles */
  fkRust: { c: 0xa0644a, tint: 0x5c4060 },
  fkSoot: { c: 0x4c4650, tint: 0x34303f },
  fkHot: { f: 0xff9a3c, noCast: true },
  /* lamps, and the green cross of the safety flag */
  fkLamp: { f: 0xfff2c8, noCast: true },
  fkCross: { c: 0x3f9a5a, tint: 0x2f5a5a },
  /* timber pallets and the blue tarps over what waits outside */
  fkPallet: { c: 0xc4a070, tint: 0x6f5f7a },
  fkTarp: { c: 0x4f7fc0, tint: 0x3f4a7a },
};
