/*
 * concert.js: the colours of Hanabi Sound (src/maps/concert/), the open air
 * dance music festival at dusk. A family with no assets, as ./fest.js is:
 * the place is built in its own map's files, but every colour the kit draws
 * has to be in the kit's table, so this is the festival's share of it and
 * nothing else (./catalog.js, FAMILIES).
 *
 * The kit bakes one batch per material per chunk and the map folds each
 * chunk's plain batches into one with the colour on the vertices
 * (src/maps/sunny/palette.js), so a colour costs no draw of its own. What a
 * dance festival adds to the colours Tonbo Fest and Drift Matsuri already
 * paint in: the stage's black and its scaffold's galvanised grey, the
 * barrier's steel, the speakers' felt, the trodden field, the wristband
 * colours of the bars and food trucks, the ferris wheel's paint, and the
 * cabins. The shadow tints are the town's cool violets, so the field sits
 * in the town's light at dusk.
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

const T = 0x6f6790;
const TD = 0x4c4670;

export const MATERIALS = {
  /* The stage: its matt black, the deck's rubber, the scaffold's grey, the
   * roof's white skin and the speakers' felt. */
  cxStageBlack: { c: 0x26232c, tint: 0x1c1a26 },
  cxDeck: { c: 0x3a3642, tint: 0x24202e, noCast: true },
  cxScaffold: { c: 0xa9aeb6, tint: 0x5e5a80 },
  cxSpeaker: { c: 0x1f1e24, tint: 0x18161f },
  cxGrille: { c: 0x3c3a44, tint: 0x24222e },
  /* The barrier's and the fences' galvanised steel. */
  cxSteel: { c: 0xb8bcc2, tint: 0x66628a },
  /* The field: trodden grass in front of the stage, the trackway's panels,
   * the gravel walks. */
  cxTrodden: { c: 0x8c9a62, tint: 0x56607a, noCast: true },
  cxTrack: { c: 0x7c8086, tint: TD, noCast: true },
  cxWalk: { c: 0xc4b59a, tint: T, noCast: true },
  /* The festival's own colours: the hot pink and the electric teal of the
   * banners and the wristbands, the bars' gold, the food trucks' paints. */
  cxPink: { c: 0xf0508c, tint: 0x7a3a6a },
  cxTeal: { c: 0x2ec4c0, tint: 0x2f5a7a },
  cxGold: { c: 0xf2b632, tint: 0x8a5a4a },
  cxViolet: { c: 0x7a4cc8, tint: 0x3f3470 },
  cxMint: { c: 0x9ae6c4, tint: 0x4a7a7a },
  cxCream: { c: 0xf4ead2, tint: 0xa89cb4 },
  /* The ferris wheel's paint and its cabins. */
  cxWheel: { c: 0xe9e4ee, tint: 0x7a74a0 },
  cxCabinA: { c: 0xf06a5a, tint: 0x7a3a5a },
  cxCabinB: { c: 0x5ab0f0, tint: 0x3a4a7a },
  cxCabinC: { c: 0xf2d24a, tint: 0x8a6a4a },
  /* The decks on the DJ's table and the desks at front of house: a dark
   * grey face with a lit edge. */
  cxDesk: { c: 0x3f3d48, tint: 0x24222e },
  cxDeskFace: { c: 0x5c5a66, tint: 0x34324a, noCast: true },
  /* The firework racks behind the stage: green painted mortar boxes. */
  cxMortar: { c: 0x4f6f4a, tint: 0x2f3f4a },
  /* Lights that stay lit at any hour are the kit's lampGlow and lampRed;
   * these are the coloured gels of the stage's fixtures. */
  cxGelPink: { f: 0xff7ab0, noCast: true },
  cxGelTeal: { f: 0x7af0ec, noCast: true },
};
