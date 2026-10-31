/*
 * rally.js: the colours of Tanada RX (src/maps/rally/), the rallycross
 * circuit under a hillside of rice terraces. A family with no assets, as
 * ./sunny.js and ./homes.js are: the place is built in its own map's files,
 * but every colour the kit draws has to be in the kit's table, so this is
 * the circuit's share of it and nothing else (./catalog.js, FAMILIES).
 *
 * The map merges each chunk's batches into one a look, with the colour on
 * the vertices (src/maps/sunny/palette.js), so a colour costs no draw of
 * its own. The colours are the town's: its muted walls and slate roofs,
 * its violet shadow tints, its road, so a pilot who flies in from the town
 * is in the same light. The few loud ones are the ones a rallycross
 * paddock really is loud in: the cars' liveries, the kerbs, the tyre walls'
 * paint, the nobori banners and the torii's vermilion.
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

const T = 0x6f6790;
const TD = 0x5c5680;

export const MATERIALS = {
  /* The track: the town's road for the tarmac, a warm grey gravel, the
   * darker line the cars have worn through it, and rubber on the tarmac. */
  rxTarmac: { c: PAL.road, tint: 0x6a608f },
  rxTarmacWorn: { c: PAL.roadDark, tint: 0x5f5784 },
  rxGravel: { c: 0xc7b49a, tint: 0x75668a },
  rxGravelDark: { c: 0xa48f78, tint: 0x655a80 },
  rxRubber: { c: 0x5d586a, tint: 0x45405e },
  rxPaint: { f: 0xf4f2f6, noCast: true },
  rxKerbRed: { c: 0xe0453f, tint: 0x7a4a6a },
  rxKerbWhite: { c: 0xf4f2f0, tint: T },
  /* Barriers and the stand. */
  rxJersey: { c: 0xe6e2e8, tint: T },
  rxJerseyRed: { c: 0xd8524a, tint: 0x7a4a6a },
  rxTyre: { c: 0x3a3742, tint: 0x2a2836 },
  rxTyreBand: { c: 0xf2c033, tint: 0x80704a },
  rxSteel: { c: 0x9aa3b3, tint: TD },
  rxSteelDark: { c: 0x6c7282, tint: 0x4d4a6c },
  rxSeat: { c: 0x5f86c4, tint: 0x45507e },
  rxSeatRed: { c: 0xd9655c, tint: 0x7a4a6a },
  rxRoof: { c: 0xd9dce4, tint: 0x6a6490 },
  rxRoofUnder: { c: 0xa7a9bb, tint: 0x5c5680 },
  rxScreen: { f: 0x2f3550, noCast: true },
  rxLampOff: { f: 0x5a4650, noCast: true },
  rxLampRed: { f: 0xff5145, noCast: true },
  rxLampGreen: { f: 0x6be08a, noCast: true },
  /* The tents, flags and nobori: the paddock's colours. */
  rxCanvasBlue: { c: 0x4f78c0, tint: 0x45507e },
  rxCanvasYellow: { c: 0xf2c033, tint: 0x80704a },
  rxCanvasGreen: { c: 0x4f9a6a, tint: 0x3f5a6a },
  rxCanvasRed: { c: 0xe0564c, tint: 0x7a4a6a },
  rxCanvasWhite: { c: 0xf6f3ee, tint: T },
  rxIndigo: { c: 0x34427e, tint: 0x2a2e5a },
  /* The hillside: the terrace walls of fitted stone, the bunds, the water
   * standing in the paddies under a pale sky, the young rice in rows and
   * the older rice grown thick, the earth of the paths. */
  rxStone: { c: 0xb4adb8, tint: 0x66607e },
  rxStoneDark: { c: 0x8f8898, tint: 0x55506e },
  rxBund: { c: 0x8fb878, tint: 0x56708a },
  rxPaddy: { f: 0xbcd6ec, noCast: true },
  rxPaddyDeep: { f: 0x9fbfdc, noCast: true },
  rxSeedling: { c: 0x7fb86a, tint: 0x4f6a86 },
  rxRice: { c: 0x86bc66, tint: 0x4f6a86 },
  rxRiceDeep: { c: 0x6aa25a, tint: 0x46607e },
  rxEarth: { c: 0xc2a98a, tint: 0x6e5e80 },
  rxGrassBank: { c: 0x9dc27e, tint: 0x5b6f8c },
  rxCedar: { c: 0x4f7a5e, tint: 0x3f5070, foliage: true, noReceive: true },
  rxBamboo: { c: 0x8cc07a, tint: 0x56708a, foliage: true, noReceive: true },
  rxStraw: { c: 0xd8bf7a, tint: 0x7a6a6a },
  /* The village: plaster and timber, slate and kawara, the storehouse's
   * black base, the shrine's vermilion. */
  rxPlaster: { c: PAL.wallWhite, tint: T },
  rxTimber: { c: 0x6e5a52, tint: 0x4a3e58 },
  rxTimberPale: { c: 0xb58f6c, tint: 0x6a5a78 },
  rxKawara: { c: 0x56607a, tint: 0x3b3e64 },
  rxKawaraEdge: { c: 0x434b62, tint: 0x33365a },
  rxTin: { c: 0x8a6458, tint: 0x5a4664 },
  rxTinBlue: { c: 0x6f8fb0, tint: 0x4d5478 },
  rxVermilion: { c: 0xe0573c, tint: 0x7a4058 },
  rxBlackBase: { c: 0x4a4656, tint: 0x33304a },
  rxShoji: { f: 0xf4ecd8, noCast: true },
  rxRope: { c: 0xd9c48a, tint: 0x7a6a6a },
  rxBib: { c: 0xe0453f, tint: 0x7a4a6a },
  /* The cars' liveries and the crews' overalls. */
  rxLivBlue: { c: 0x3d6ec4, tint: 0x3a4478 },
  rxLivYellow: { c: 0xf4c033, tint: 0x80704a },
  rxLivRed: { c: 0xd8433d, tint: 0x7a3a5a },
  rxLivGreen: { c: 0x3f9a6a, tint: 0x2f5a64 },
  rxLivWhite: { c: 0xf4f2f0, tint: T },
  rxLivOrange: { c: 0xf0802e, tint: 0x80504e },
  rxLivBlack: { c: 0x3c3946, tint: 0x2c2a3a },
  rxSkin: { c: 0xf0c8a8, tint: 0x8a6a7e },
};
