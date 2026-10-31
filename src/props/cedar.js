/*
 * cedar.js: the colours of Kodama Onsen (src/maps/cedar/), the abandoned
 * hot spring inn in a cedar plantation, with its shrine up the hill. A
 * family with no assets, as ./sunny.js is: the place is built in its own
 * map's files, but every colour the kit draws has to be in the kit's table,
 * so this is Kodama Onsen's share of it and nothing else (./catalog.js,
 * FAMILIES).
 *
 * The cedars themselves are the town's own (stCedar0 to 2 and stCedarWood
 * in ./street.js), so the plantation here is the plantation on the town's
 * hills, tone for tone. What is here is what the town never needed: old
 * timber gone silver and dark, cream plaster with its water stains, a
 * storehouse's lime white and soot black, kawara tiles in the town's slate,
 * moss on everything that faces north, a shrine's vermilion faded to coral
 * on its sunny side, and the milky blue of a hot spring that is still
 * running with nobody to sit in it. Every colour in the town's cel shading
 * and its violet shadow tints, so the forest sits in the town's light.
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
 * one under a dark colour. */
const T = 0x6f6790;
const TD = 0x5c5680;

export const MATERIALS = {
  /* the inn: timber, plaster, tile */
  cdTimber: { c: 0x6a5450, tint: 0x45395a },
  cdTimberDark: { c: 0x4c3e3f, tint: 0x342c48 },
  cdTimberSilver: { c: 0x9a918a, tint: 0x5c5678 },
  cdPlaster: { c: 0xeee3c9, tint: 0x8a83a0 },
  cdPlasterStain: { c: 0xd2c4a6, tint: 0x7a7090 },
  cdKuraWhite: { c: 0xf4f1ea, tint: 0x8d88a8 },
  cdKuraBlack: { c: 0x3c3a44, tint: 0x2e2a40 },
  cdKawara: { c: 0x59617a, tint: 0x3a3b58 },
  cdKawaraDark: { c: 0x464c62, tint: 0x30304c },
  cdKawaraMoss: { c: 0x6d7f62, tint: 0x46566e },
  cdShoji: { c: 0xf5f0e2, tint: 0x9a96b2 },
  cdTatami: { c: 0xbfae7a, tint: 0x726a84 },
  cdFloor: { c: 0x8c6a52, tint: 0x55445e },
  cdGlass: { f: 0x53627a, noCast: true },
  cdNorenBlue: { c: 0x37557e, tint: 0x2a2f55 },
  cdNorenRed: { c: 0xb8483f, tint: 0x6a3a5e },
  cdTin: { c: 0x9aa2a8, tint: 0x5e5a7c },
  cdTinRust: { c: 0xa86a4c, tint: 0x5f4668 },
  cdRust: { c: 0x9c5a40, tint: 0x5a4060 },
  cdRustDark: { c: 0x6e4638, tint: 0x45344e },
  cdBusStop: { c: 0xd7cdb2, tint: 0x7d7494 },
  cdSignRed: { c: 0xd2493e, tint: 0x6a3a5e },
  /* the shrine */
  cdVermilion: { c: 0xd85a3e, tint: 0x7a4062 },
  cdVermilionFade: { c: 0xe5866a, tint: 0x84566e },
  cdToriiBlack: { c: 0x37323d, tint: 0x2c2840 },
  cdRope: { c: 0xd9c690, tint: 0x857a8e },
  cdPaper: { c: 0xfbfaf4, tint: 0x9a96b2 },
  cdBrass: { c: 0xc9a75a, tint: 0x6f5f74 },
  cdShrineWood: { c: 0x8a6c58, tint: 0x55445e },
  cdFox: { c: 0xefe9dc, tint: 0x8a83a8 },
  /* stone and ground */
  cdStone: { c: 0xb0aba3, tint: T },
  cdStoneDark: { c: 0x8f8a86, tint: TD },
  cdStoneMoss: { c: 0x93a37a, tint: 0x56647a },
  cdPaving: { c: 0xc4bfb6, tint: T },
  cdGravel: { c: 0xb9b2a6, tint: T },
  cdAsphalt: { c: 0x7c7888, tint: 0x5a5480 },
  cdLine: { c: 0xe9e6e0, tint: 0x8a83a8 },
  cdConcrete: { c: 0xbdb7b4, tint: T },
  cdMoss: { c: 0x6f9a5c, tint: 0x46607c, noReceive: true },
  cdMossDeep: { c: 0x55804c, tint: 0x3d5470, noReceive: true },
  cdLitter: { c: 0xa8876a, tint: 0x5f4f70 },
  cdFern: { c: 0x7fae66, tint: 0x4c6680, noReceive: true, foliage: true },
  cdBamboo: { c: 0xbdb67a, tint: 0x6f6a7e },
  cdBambooDry: { c: 0xcdb98a, tint: 0x7a6e84 },
  /* water */
  cdWater: { f: 0x6f97a8, noCast: true },
  cdOnsen: { f: 0xa9d0cc, noCast: true },
  cdSteam: { f: 0xf2f3f6, noCast: true },
};
