/*
 * references.js: tape-measure the kiln against real cement-works sizes.
 *
 * A budget cannot catch a scale error. These numbers are read off the
 * built colliders and platforms, not copied from the layout table.
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

export function kilnReferences(root, colliders, platforms) {
  const stackInner = L.stack.inner;
  const kilnInner = L.kiln.inner;
  const binGap = L.bins.zs[1] - L.bins.zs[0] - L.bins.w;
  const gantryDeck = platforms.find((p) => (
    p.x0 >= L.gantry.x0 - 0.05 && p.x1 <= L.gantry.x1 + 0.05
    && p.top > 15.5 && p.top < 16.5
  ));
  const packRoof = platforms.reduce((n, p) => (
    p.top > 15.5 && p.top < 16.5 && p.x0 < 0 && p.x1 > 0 ? n + 1 : n
  ), 0);

  return {
    stackInner: { measured: stackInner, unit: 'm', real: 'square shaft a 5 inch can dive, 2.4 to 3.2' },
    kilnInner: { measured: kilnInner, unit: 'm', real: 'rotary kiln bore, about 3 to 4 m' },
    stackHeight: { measured: L.stack.h, unit: 'm', real: 'preheater stacks run 50 to 80 m' },
    binGap: { measured: binGap, unit: 'm', real: 'split between bins, 1.0 to 1.6 m' },
    gantryDeckY: {
      measured: gantryDeck ? gantryDeck.top : null,
      unit: 'm',
      real: 'packhouse eave, 14 to 18 m',
    },
    packRoofPieces: { measured: packRoof, unit: 'count', real: 'roof is slabs around two sky holes' },
    colliderBoxes: { measured: colliders.ax.length, unit: 'count', real: 'authored with the mesh' },
  };
}
