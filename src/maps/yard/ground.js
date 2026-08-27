/*
 * ground.js: mowed lawn, asphalt drive, no retaining bowl.
 *
 * A homestead sits on land, not in a quarry. Ground height is the grass
 * everywhere. Hills are painted flats. Wear is decals, not colliders.
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

import { L, slab, decal, fillAround } from './kit.js';
import { buildDistantHills } from './sky.js';

export function groundHeight() {
  return 0;
}

export function buildGround(root, colliders, M) {
  const lawn = { x0: -80, x1: 80, z0: -80, z1: 80 };
  const drive = L.drive;
  fillAround(root, colliders, M.grass, lawn.x0, lawn.z0, lawn.x1, lawn.z1, -0.35, 0.02, [drive], {
    solid: false, cast: false, receive: true,
  });
  slab(root, colliders, M.asphalt, drive.x0, -0.32, drive.z0, drive.x1, 0.04, drive.z1, {
    solid: false, cast: false, receive: true,
  });

  decal(root, colliders, M.gravel, 9.4, 0.03, -2.2, 10.7, 0.06, 5.2);
  decal(root, colliders, M.gravel, 5.4, 0.03, -9.2, 10.7, 0.055, -8.1);
  decal(root, colliders, M.gravel, -19.2, 0.03, 4.4, -7.4, 0.055, 6.2);
  decal(root, colliders, M.gravel, -20.4, 0.03, 6.2, -18.6, 0.055, 12.2);
  decal(root, colliders, M.gravel, -10.8, 0.03, -8.8, -6.6, 0.055, -4.8);
  decal(root, colliders, M.asphalt, 6.8, 0.03, -8.4, 10.6, 0.055, -4.6);
  decal(root, colliders, M.gravel, -26.2, 0.03, -24.5, -13.8, 0.05, -16.2);

  decal(root, colliders, M.dry, -18, 0.03, -14, -8, 0.055, -6);
  decal(root, colliders, M.dry, 6, 0.03, 16, 16, 0.055, 24);
  decal(root, colliders, M.dry, -6.2, 0.03, -37.4, 1.4, 0.05, -35.2);
  decal(root, colliders, M.dry, -33.8, 0.03, 12.0, -19.2, 0.05, 16.0);
  decal(root, colliders, M.dry, -44, 0.03, -48, -28, 0.05, -40);
  decal(root, colliders, M.dry, 28, 0.03, 36, 48, 0.05, 52);
  decal(root, colliders, M.hayShade, -32.4, 0.04, 12.05, -20.6, 0.07, 15.8);
  decal(root, colliders, M.grassSun, -8, 0.025, -20, 8, 0.05, -10);
  decal(root, colliders, M.grassSun, -4, 0.025, 12, 6, 0.05, 20);
  decal(root, colliders, M.hillShade, -70, 0.02, -70, -48, 0.04, -52);
  decal(root, colliders, M.hillShade, 48, 0.02, 52, 72, 0.04, 74);
  decal(root, colliders, M.litter, -28.2, 0.04, 24.02, -26.4, 0.08, 25.1);

  buildDistantHills(root, M);
}
