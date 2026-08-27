/*
 * trees.js: trunks you weave, canopies you fly under.
 *
 * Trunks are poles. A canopy starts at 2.5 m so a 5 inch fits under.
 * Tree lines share one canopy slab so neighbouring crowns are not a
 * leftover slot. Yard trees sit 6 m apart. Extra crown boxes are paint.
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

import { slab } from './kit.js';

const UNDER = 2.52;

export function buildTrees(root, colliders, M) {
  northLine(root, colliders, M);
  westLine(root, colliders, M);
  eastLine(root, colliders, M);
  yardTrees(root, colliders, M);
}

function trunk(root, colliders, M, x, z, r, h) {
  slab(root, colliders, M.woodDark, x - r, 0, z - r, x + r, h, z + r, { kind: 'tree' });
}

function canopy(root, colliders, M, x0, z0, x1, z1, y1, mat) {
  slab(root, colliders, mat, x0, UNDER, z0, x1, y1, z1, { kind: 'canopy' });
}

function northLine(root, colliders, M) {
  for (let x = -42; x <= 40; x += 5) {
    trunk(root, colliders, M, x, 38.4, 0.28, UNDER);
  }
  canopy(root, colliders, M, -44.2, 35.8, -10.0, 41.2, 9.4, M.leafDark);
  canopy(root, colliders, M, -10.0, 35.8, 16.0, 41.2, 9.4, M.leaf);
  canopy(root, colliders, M, 16.0, 35.8, 42.2, 41.2, 9.4, M.leafSun);
}

function westLine(root, colliders, M) {
  for (let z = -38; z <= 34; z += 5) {
    trunk(root, colliders, M, -42.2, z, 0.28, UNDER);
  }
  canopy(root, colliders, M, -45.0, -40.2, -39.2, -2.0, 9.1, M.leafDark);
  canopy(root, colliders, M, -45.0, -2.0, -39.2, 18.0, 9.1, M.leaf);
  canopy(root, colliders, M, -45.0, 18.0, -39.2, 35.8, 9.1, M.leafDark);
}

function eastLine(root, colliders, M) {
  for (let z = -22; z <= 28; z += 6) {
    trunk(root, colliders, M, 22.4, z, 0.26, UNDER);
  }
  canopy(root, colliders, M, 19.6, -24.4, 25.2, 4.0, 8.6, M.leaf);
  canopy(root, colliders, M, 19.6, 4.0, 25.2, 30.4, 8.6, M.leafSun);
}

function yardTrees(root, colliders, M) {
  const spots = [
    { x: -14.0, z: 6.0, h: 8.2 },
    { x: -8.0, z: 14.0, h: 9.0 },
    { x: 8.5, z: 18.0, h: 7.4 },
    { x: 16.0, z: -8.4, h: 8.2 },
    { x: 15.8, z: 8.2, h: 9.0 },
    { x: -12.2, z: -12.0, h: 7.4 },
  ];
  for (const s of spots) {
    trunk(root, colliders, M, s.x, s.z, 0.32, UNDER);
    canopy(root, colliders, M, s.x - 2.0, s.z - 2.0, s.x + 2.0, s.z + 2.0, s.h, M.leaf);
    slab(root, colliders, M.leafSun, s.x - 1.1, UNDER + 2.2, s.z - 1.3, s.x + 1.5, s.h + 0.4, s.z + 1.1, {
      solid: false, cast: true,
    });
    slab(root, colliders, M.leafDark, s.x - 1.8, UNDER + 0.4, s.z + 0.6, s.x + 0.4, UNDER + 2.0, s.z + 2.0, {
      solid: false, cast: false,
    });
  }
}
