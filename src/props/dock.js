/*
 * dock.js: the colours of Kamome Wharf (src/maps/dock/), the container
 * terminal at dusk: the quay cranes, the ship alongside, the stacks, the
 * brick warehouse and the red port tower. A family with no assets, as
 * ./sunny.js is: the port is one particular place, built in its own map's
 * files, but every colour the kit draws has to be in the kit's table, so
 * this is the port's share of it and nothing else (./catalog.js, FAMILIES).
 *
 * Everything else the port draws is the town's own colours (./kit.js): the
 * concrete, the glass and the lamps, the striped masts, and the seven
 * container colours, so a box in the yard is a box the builder would draw.
 * The kit bakes one batch per material per chunk and the map folds each
 * chunk's batches into one a look (src/maps/sunny/palette.js), so a colour
 * here costs no draw of its own. Every colour is our own, in the town's cel
 * shading and its violet shadow tints, and none is a shipping line's.
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

const TD = 0x5c5680;

export const MATERIALS = {
  /* the containers the kit does not have: a maroon, a sky, a cream, a
   * mustard, and a darker rib for each */
  dkBoxMaroon: { c: 0x8e3f4c, tint: 0x523a5c }, dkBoxMaroonRib: { c: 0x76343f, tint: 0x46334f },
  dkBoxSky: { c: 0x8fb9d8, tint: 0x56628e }, dkBoxSkyRib: { c: 0x779fbf, tint: 0x4b5682 },
  dkBoxCream: { c: 0xe9dcc0, tint: 0x837a96 }, dkBoxCreamRib: { c: 0xcdbfa3, tint: 0x726a88 },
  dkBoxMustard: { c: 0xd6a73e, tint: 0x7a6258 }, dkBoxMustardRib: { c: 0xb98e33, tint: 0x6a5550 },
  /* the quay cranes and the yard gantries: a pale sea green body, a deeper
   * one for the girders' webs, and the machinery's cream */
  dkCrane: { c: 0x9fd0cf, tint: 0x5a6a8e }, dkCraneDeep: { c: 0x76aaae, tint: 0x4c5a80 },
  dkCraneCream: { c: 0xf1ece0, tint: 0x857ea0 }, dkGantry: { c: 0xf0c64a, tint: 0x7d6a74 },
  /* the ship: the hull, its red under the waterline, the deck, the hatch
   * lids, the house and the funnel */
  dkHull: { c: 0x34405e, tint: 0x262a48 }, dkHullRed: { c: 0xb4483f, tint: 0x5e3a58 },
  dkDeck: { c: 0x7f927f, tint: 0x4c5670 }, dkHatch: { c: 0x5f8a73, tint: 0x3f506a },
  dkHouse: { c: 0xf2ede2, tint: 0x8a83a8 }, dkFunnel: { c: 0x3f6fa6, tint: 0x34406e },
  /* the quay: the wall, the tide's stain, the fenders and the bollards,
   * the crane rails and the yellow edge */
  dkQuay: { c: 0xaea8b4, tint: 0x655d84 }, dkTide: { c: 0x5a566c, tint: 0x3f3a58 },
  dkFender: { c: 0x2b2a31, tint: 0x1f1e2a }, dkBollard: { c: 0x4c5262, tint: 0x353a52 },
  dkRail: { c: 0x5c5a6a, tint: 0x433f5e }, dkEdge: { c: 0xf0c341, tint: 0x8a7a70 },
  /* the harbour: the water, flat, and the light on it */
  dkWater: { f: 0x5f86b4, noCast: true }, dkWave: { f: 0x9dbedc, noCast: true },
  /* the paving's paint */
  dkLine: { f: 0xf2f0f4, noCast: true }, dkLineYellow: { f: 0xf0c341, noCast: true },
  dkPatch: { c: 0xc9c4cf, tint: 0x6a6288 },
  /* the brick warehouse: the brick, its stone dressings, its slate */
  dkBrick: { c: 0xb65c44, tint: 0x5e3e5e }, dkBrickDark: { c: 0x8f4636, tint: 0x4e3454 },
  dkStone: { c: 0xe6dfcf, tint: 0x847c9c }, dkSlate: { c: 0x55607a, tint: 0x3b3e64 },
  dkIron: { c: 0x2f3a3a, tint: 0x22283a },
  /* the port tower */
  dkTowerRed: { c: 0xd7463c, tint: 0x6a3a5a }, dkTowerDeck: { c: 0xf4f0e8, tint: 0x8a83a8 },
  /* the yard's machines: the tractors and their tyres */
  dkTractorA: { c: 0x3b7cb8, tint: 0x3a4472 }, dkTractorB: { c: 0xe0a23c, tint: 0x7a5a58 },
  dkTyre: { c: 0x2b2a2f, tint: 0x1e1d28 }, dkRust: { c: 0x9c5a3a, tint: 0x5a3e5a },
  /* the breakwater's tetrapods and its lighthouse */
  dkPod: { c: 0xc8c3c9, tint: TD }, dkLight: { c: 0xe0453f, tint: 0x7a4a6a },
};
