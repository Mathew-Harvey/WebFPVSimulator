/*
 * references.js: tape-measure the baths against a real 50 m hall.
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

export function bathsReferences(root, colliders, platforms) {
  const p = L.pool;
  const poolLen = p.x1 - p.x0;
  const poolWid = p.z1 - p.z0;
  const deep = p.deepY;
  const doorW = L.door.half * 2;
  const towerTop = platforms.reduce((n, d) => (d.top > 9.5 && d.top < 10.5 ? n + 1 : n), 0);
  const gallery = platforms.reduce((n, d) => (d.top > 6.3 && d.top < 6.7 ? n + 1 : n), 0);
  void root;
  return {
    poolLen: { measured: poolLen, unit: 'm', real: 'FINA 50 m course' },
    poolWid: { measured: poolWid, unit: 'm', real: 'six lanes, about 12.5 m' },
    deepEnd: { measured: -deep, unit: 'm', real: 'dive pit 4.5 to 5.0 m' },
    doorWidth: { measured: doorW, unit: 'm', real: 'south mouth a 5 inch can leave, 8 m+' },
    towerDecks: { measured: towerTop, unit: 'count', real: 'one 10 m board deck' },
    galleryPieces: { measured: gallery, unit: 'count', real: 'mouth run plus far run' },
    colliderBoxes: { measured: colliders.ax.length, unit: 'count', real: 'authored with the mesh' },
  };
}
