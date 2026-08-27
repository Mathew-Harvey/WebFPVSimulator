/*
 * world.js: assemble the baths and answer height queries.
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
import { buildGround, groundHeight, poolFloor } from './ground.js';
import { buildHall } from './hall.js';
import { buildPool } from './pool.js';
import { buildDress } from './dress.js';
import { bathsReferences } from './references.js';

export function buildWorld(scene) {
  const root = new THREE.Group();
  root.name = 'baths';
  scene.add(root);

  const colliders = new Colliders();
  const platforms = [];
  const M = materials();

  buildGround(root, colliders, M);
  buildHall(root, colliders, platforms, M);
  buildPool(root, colliders, platforms, M);
  buildDress(root, colliders, M);

  const references = bathsReferences(root, colliders, platforms);
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
    audit: () => auditWorld(heightAt, colliders, platforms),
  };
}

export function attractPath(world) {
  const pts = [
    { x: 0, y: 5.5, z: 26 },
    { x: 0, y: 3.2, z: 14 },
    { x: 0, y: 2.4, z: 0 },
    { x: 11, y: 2.2, z: 0 },
    { x: 11, y: 18, z: 0 },
    { x: 0, y: 18, z: 24 },
    { x: 0, y: 8, z: 28 },
  ];
  return pts.map((p) => {
    const floor = groundHeight(p.x, p.z);
    return { x: p.x, y: Math.max(p.y, floor + 2.8), z: p.z };
  });
}

function auditWorld(heightAt, colliders, platforms) {
  const p = L.pool;
  let poolWrong = 0;
  let poolOk = 0;
  for (let x = p.x0 + 0.5; x < p.x1; x += 1) {
    for (let z = p.z0 + 0.5; z < p.z1; z += 1) {
      const want = poolFloor(x, z);
      const got = heightAt(x, z, want + 0.2);
      if (want === null) {
        continue;
      }
      if (Math.abs(got - want) > 0.08) {
        poolWrong += 1;
      } else {
        poolOk += 1;
      }
    }
  }
  let wellGhost = 0;
  const wells = [
    { x0: -16, x1: -6, z0: -5.5, z1: 5.5 },
    { x0: 6, x1: 16, z0: -5.5, z1: 5.5 },
  ];
  for (const w of wells) {
    for (let x = w.x0 + 0.4; x < w.x1; x += 0.8) {
      for (let z = w.z0 + 0.4; z < w.z1; z += 0.8) {
        const h = heightAt(x, z, 16.2);
        if (h > 14) {
          wellGhost += 1;
        }
      }
    }
  }
  let galleryMiss = 0;
  const gy = L.gallery.y;
  for (let x = -20; x <= 20; x += 2) {
    const h = heightAt(x, 10.4, gy + 0.2);
    if (Math.abs(h - gy) > 0.08) {
      galleryMiss += 1;
    }
  }
  return {
    poolOk,
    poolWrong,
    wellGhost,
    galleryMiss,
    platforms: platforms.length,
    boxes: colliders.ax.length,
  };
}