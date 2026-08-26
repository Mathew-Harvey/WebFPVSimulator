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
    { x: -46, y: 64, z: 12 },
    { x: -46, y: 64, z: 0 },
    { x: -46, y: 40, z: 0 },
    { x: -46, y: 18, z: 0 },
    { x: -46, y: 12, z: 0 },
    { x: -46, y: 9.7, z: 0 },
    { x: -43, y: 9.7, z: 0 },
    { x: -34, y: 9.7, z: 0 },
    { x: -18, y: 9.7, z: 0 },
    { x: 0, y: 9.7, z: 0 },
    { x: 12, y: 9.7, z: 0 },
    { x: 22, y: 9.7, z: 0 },
    { x: 24, y: 9.7, z: 0 },
    { x: 29.2, y: 9.7, z: 0 },
    { x: 30.5, y: 17.3, z: 0 },
    { x: 32.2, y: 17.3, z: 4.3 },
    { x: 35, y: 17.3, z: 4.3 },
    { x: 38, y: 17.3, z: 4.3 },
    { x: 41, y: 17.3, z: 4.3 },
    { x: 42.4, y: 17.3, z: 4.3 },
    { x: 45, y: 13, z: 10 },
    { x: 46, y: 12, z: 16 },
    { x: 18, y: 16, z: 28 },
    { x: -20, y: 36, z: 32 },
    { x: -46, y: 64, z: 22 },
  ];
  return pts.map((p) => {
    const floor = groundHeight(p.x, p.z);
    return { x: p.x, y: Math.max(p.y, floor + 2.8), z: p.z };
  });
}
