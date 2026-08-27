/*
 * references.js: tape-measure the yard against the public homestead.
 *
 * 2.5 acres, a missing fence panel, stall mouths a 5 inch can leave.
 * Numbers are read off the layout after the colliders exist.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { L } from './kit.js';

export function yardReferences(root, colliders, platforms) {
  const site = L.site;
  const acres = ((site.x1 - site.x0) * (site.z1 - site.z0)) / 4046.86;
  const gapW = L.gap.x1 - L.gap.x0;
  const stallW = L.stalls[0].x1 - L.stalls[0].x0;
  const deck = platforms.find((p) => (
    p.top > 1.2 && p.top < 1.5 && p.z0 >= L.deck.z0 - 0.05 && p.z1 <= L.deck.z1 + 0.05
  ));
  const under = L.deck.y - L.deck.thick;
  void root;
  return {
    acres: { measured: acres, unit: 'acre', real: 'about 2.5 acres mowed' },
    gapWidth: { measured: gapW, unit: 'm', real: 'missing fence panel, 2.4 m+' },
    stallWidth: { measured: stallW, unit: 'm', real: 'horse stall mouth, 2.0 m+' },
    deckY: {
      measured: deck ? deck.top : L.deck.y,
      unit: 'm',
      real: 'raised back deck, 1.2 to 1.5 m',
    },
    undercroft: { measured: under, unit: 'm', real: 'fly under the deck, 1.0 m+' },
    colliderBoxes: { measured: colliders.ax.length, unit: 'count', real: 'authored with the mesh' },
  };
}
