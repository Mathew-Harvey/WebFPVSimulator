/*
 * world.js: assemble the kiln yard and answer height queries.
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

import * as THREE from 'three';
import { Colliders } from '../../game/collide.js';
import { L, STEP, materials, mergeStatic } from './kit.js';
import { buildGround, groundHeight } from './ground.js';
import { buildHall } from './hall.js';
import { buildPlant } from './plant.js';
import { buildDress } from './dress.js';
import { kilnReferences } from './references.js';

export function buildWorld(scene) {
  const root = new THREE.Group();
  root.name = 'kiln';
  scene.add(root);

  const colliders = new Colliders();
  const platforms = [];
  const M = materials();

  buildGround(root, colliders, M);
  buildHall(root, colliders, platforms, M);
  buildPlant(root, colliders, platforms, M);
  buildDress(root, colliders, M);

  const references = kilnReferences(root, colliders, platforms);
  const merged = mergeStatic(root);
  colliders.build();

  function heightAt(x, z, fromY) {
    let h = groundHeight(x, z);
    const reach = fromY === undefined ? Infinity : fromY + STEP;
    for (let i = 0; i < platforms.length; i += 1) {
      const p = platforms[i];
      if (p.top > reach) {
        continue;
      }
      if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) {
        h = Math.max(h, p.top);
      }
    }
    return h;
  }

  return {
    root,
    colliders,
    platforms,
    spawn: L.spawn,
    merged,
    heightAt,
    references,
  };
}

export function attractPath(world) {
  const pts = [
    { x: 4.6, y: 3.2, z: 18.4 },
    { x: 0.2, y: 3.2, z: 10.5 },
    { x: 0.2, y: 3.2, z: 4.8 },
    { x: -14, y: 3.2, z: 0 },
    { x: -32, y: 3.2, z: 0 },
    { x: -46, y: 3.2, z: 0 },
    { x: -46, y: 17.2, z: 0 },
    { x: -46, y: 17.2, z: 2.9 },
    { x: -46, y: 17.2, z: 0 },
    { x: -40, y: 9.7, z: 0 },
    { x: -18, y: 9.7, z: 0 },
    { x: -12.4, y: 9.7, z: 4.2 },
    { x: -12.4, y: 18.6, z: 4.4 },
    { x: -16, y: 20.4, z: -12.4 },
    { x: -13, y: 12.4, z: -22 },
    { x: -13, y: 11.2, z: -32 },
    { x: -16, y: 8.4, z: -9.2 },
    { x: 8, y: 12.4, z: -4.4 },
    { x: 24.8, y: 12.2, z: -4.3 },
    { x: 30.4, y: 17.2, z: -4.3 },
    { x: 37.6, y: 17.2, z: -4.3 },
    { x: 38, y: 3.4, z: 0 },
    { x: 38, y: -4.8, z: 0 },
    { x: 22, y: 6, z: 16 },
    { x: -18, y: 28, z: 22 },
    { x: -46, y: 64, z: 14 },
  ];
  void world;
  return pts.map((p) => {
    const floor = groundHeight(p.x, p.z);
    return { x: p.x, y: Math.max(p.y, floor + 2.8), z: p.z };
  });
}
