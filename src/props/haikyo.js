/*
 * haikyo.js: the colours of Tsukimi Danchi (src/maps/haikyo/), the
 * abandoned housing estate in the middle of the town's kind of city. A
 * family with no assets, as ./sunny.js is: the estate is one particular
 * place, built in its own map's files, but every colour the kit draws has
 * to be in the kit's table, so this is the estate's share of it and
 * nothing else (./catalog.js, FAMILIES).
 *
 * Most of what the estate is made of is already in the table and is the
 * town's own: its concretes, its block, its sheet metal, its glass, the
 * bando's renders and rebar (./kit.js, ./buildings.js). What is here is
 * what a dead danchi adds to that: the steel doors and the faded
 * balcony paint of the 1970s, the rooms behind them (tatami, fusuma,
 * wallpaper gone to the colour of tea), the weeds and the ivy that took
 * the courtyard, the playground's enamel, the water tank's panels, the
 * white hoarding round the site, and the viaduct's rails. Every one is in
 * the town's light: a cel colour with a cool violet shadow tint under it,
 * the warm ones a shade dustier than new, because nothing here has been
 * painted for forty years.
 *
 * The kit bakes one batch per material per chunk and the map folds them
 * to one a look (src/maps/sunny/palette.js), so a colour here costs no
 * draw of its own.
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

/* The town's shadow tints: a cool violet under a pale colour and a
 * deeper one under a dark colour. */
const T = 0x6a6288;
const TD = 0x5c5680;

export const MATERIALS = {
  /* the block's skin: the render it wore, the band painted along each
   * floor's slab edge, the streaks the rain drew under every sill */
  hkRender: { c: 0xe4dccb, tint: T },
  hkRenderShade: { c: 0xcfc6b4, tint: T },
  hkBand: { c: 0x9fb6b4, tint: 0x5a6688 },
  hkStreak: { c: 0xa59ea4, tint: 0x57507a, noCast: true },
  hkFrame: { c: 0xc9c3c6, tint: 0x655d84 },
  /* the steel doors, two greens and a brown, and their frames */
  hkDoorGreen: { c: 0x6f9089, tint: 0x4a5a74 },
  hkDoorBlue: { c: 0x7d93a8, tint: 0x4f5a7c },
  hkDoorBrown: { c: 0x8a6650, tint: 0x55465e },
  hkSash: { c: 0xa9a7a2, tint: TD },
  /* the rooms: tatami, the paper doors, wallpaper, boards, a bath */
  hkTatami: { c: 0xc2b07a, tint: 0x6f6478 },
  hkTatamiEdge: { c: 0x4c5a48, tint: 0x3a3f50 },
  hkFusuma: { c: 0xe6dcc2, tint: 0x7d74a0 },
  hkWallpaper: { c: 0xd6c8ae, tint: 0x6f6790 },
  hkBoards: { c: 0x9c7a56, tint: 0x5e4a62 },
  hkBathTile: { c: 0x9fc8c4, tint: 0x5f6a86 },
  /* the green: weeds, dry grass, ivy, moss on the slabs */
  hkWeed: { c: 0x86a85e, tint: 0x4f6488, noReceive: true, foliage: true },
  hkWeedDry: { c: 0xc2b074, tint: 0x6f6478, noReceive: true, foliage: true },
  hkIvy: { c: 0x5a8a54, tint: 0x3f5a6a, noReceive: true, foliage: true },
  hkMossSlab: { c: 0x8ea070, tint: 0x55607e },
  /* the playground's enamel, chipped, and its sand */
  hkPlayRed: { c: 0xd65a48, tint: 0x6a4060 },
  hkPlayYellow: { c: 0xeec04a, tint: 0x7d6a74 },
  hkPlayBlue: { c: 0x5a86c0, tint: 0x45487a },
  hkPlayGreen: { c: 0x5c9c74, tint: 0x3f5a6a },
  hkSand: { c: 0xd8c6a0, tint: 0x7a6f8a },
  /* the roof: its water tank's panels, the asphalt felt, the drains */
  hkTankPanel: { c: 0xb9cdd6, tint: 0x5f6a8c },
  hkTankRib: { c: 0x95adb9, tint: 0x55607e },
  hkFelt: { c: 0x7c7884, tint: 0x4f4a6a },
  /* the site: the white hoarding and its rib, the gate's rust */
  hkHoarding: { c: 0xebe8e2, tint: 0x7d74a0 },
  hkHoardingRib: { c: 0xcdc9c2, tint: T },
  hkRust: { c: 0x9a5e42, tint: 0x5a4064 },
  hkRustDark: { c: 0x6e4636, tint: 0x46384e },
  /* the street: kerbs and the walk's paving, the white line, the green
   * line of a school route */
  hkKerb: { c: 0xd5cfc8, tint: T },
  hkWalk: { c: 0xc4bcc0, tint: 0x605a80 },
  hkGreenWalk: { c: 0x6fa47c, tint: 0x3f5a6a },
  /* the viaduct: its concrete, its ballast, its rails and its sleepers */
  hkViaduct: { c: 0xbcb7bb, tint: 0x5f5880 },
  hkBallast: { c: 0x8e8890, tint: 0x55507a },
  hkRail: { c: 0x6c6670, tint: 0x46405a },
  hkSleeper: { c: 0x7c736c, tint: 0x4a4258 },
  /* the junk: a mattress, a fridge, cardboard, a television, a bicycle's
   * frames in three colours */
  hkMattress: { c: 0xdccfb2, tint: 0x7a6f8a },
  hkFridge: { c: 0xe8e4da, tint: 0x7d74a0 },
  hkCardboard: { c: 0xc4a072, tint: 0x6f5a6a },
  hkTelly: { c: 0x3c3a46, tint: 0x2c2a3a },
  hkBikeRed: { c: 0xc2504a, tint: 0x6a3a5a },
  hkBikeSilver: { c: 0xb4b8be, tint: 0x5f5c80 },
  hkBikeBlack: { c: 0x34323c, tint: 0x2a2838 },
  /* the race: the orange the plates are painted and the dark of their
   * numerals, and the unlit dark of a room seen from outside */
  hkOrange: { c: 0xf08a34, tint: 0x80504e },
  hkInk: { c: 0x2a2632, tint: 0x22202e },
  hkDark: { f: 0x3a3646, noCast: true },
};
