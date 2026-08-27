/*
 * world.js: assemble the yard and answer height queries.
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
import { L, STEP, CLEAR, materials, mergeStatic } from './kit.js';
import { restrictCasters } from '../compact-perf.js';
import { buildGround, groundHeight } from './ground.js';
import { buildHouse } from './house.js';
import { buildBarn } from './barn.js';
import { buildTrees } from './trees.js';
import { buildDress } from './dress.js';
import { yardReferences } from './references.js';

export function buildWorld(scene, opts = {}) {
  const root = new THREE.Group();
  root.name = 'yard';
  scene.add(root);

  const colliders = new Colliders();
  const platforms = [];
  const M = materials();

  buildGround(root, colliders, M);
  buildHouse(root, colliders, platforms, M);
  buildBarn(root, colliders, platforms, M);
  buildTrees(root, colliders, M, opts.foliageKeep ?? 1);
  buildDress(root, colliders, M);

  const references = yardReferences(root, colliders, platforms);
  restrictCasters(root, opts.casterMin ?? 0.5);
  const merged = mergeStatic(root, { cell: opts.mergeCell ?? 24 });
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
    { x: -1.6, y: 2.4, z: 6.9 },
    { x: -1.6, y: 2.2, z: 16 },
    { x: -10, y: 1.6, z: 12 },
    { x: -8.4, y: 0.55, z: 6.4 },
    { x: -3.0, y: 0.55, z: 6.4 },
    { x: 0.6, y: 0.55, z: 6.4 },
    { x: 8.4, y: 0.7, z: 6.4 },
    { x: 11.4, y: 1.4, z: 6.2 },
    { x: 11.4, y: 1.4, z: -8 },
    { x: 11.4, y: 1.4, z: -36 },
    { x: 13, y: 1.4, z: -36 },
    { x: 13, y: 1.4, z: -44 },
    { x: 13, y: 1.4, z: -38 },
    { x: -3.6, y: 0.7, z: -38 },
    { x: -3.6, y: 0.7, z: -34 },
    { x: -10, y: 1.4, z: -12 },
    { x: 0.15, y: 1.7, z: -6.6 },
    { x: -10, y: 1.5, z: -6.6 },
    { x: -10, y: 1.5, z: 10 },
    { x: -31.3, y: 1.2, z: 10 },
    { x: -31.3, y: 1.2, z: 14 },
    { x: -31.3, y: 1.2, z: 10 },
    { x: -18.4, y: 1.2, z: 10 },
    { x: -18.4, y: 1.2, z: 17.3 },
    { x: -20.2, y: 1.2, z: 17.3 },
    { x: -20.2, y: 3.5, z: 17.3 },
    { x: -26.5, y: 3.5, z: 17.3 },
    { x: -18.6, y: 3.5, z: 17.3 },
    { x: -18.6, y: 1.2, z: 17.3 },
    { x: -18.4, y: 1.2, z: 17.3 },
    { x: -18.4, y: 1.3, z: 27.2 },
    { x: -22.0, y: 1.3, z: 27.2 },
    { x: -18.4, y: 1.3, z: 27.2 },
    { x: -12, y: 1.5, z: 16 },
    { x: -1.6, y: 2.4, z: 16 },
    { x: -1.6, y: 2.4, z: 6.9 },
  ];
  return pts.map((p) => {
    const floor = world.heightAt(p.x, p.z, p.y);
    return { x: p.x, y: Math.max(p.y, floor + 0.45), z: p.z };
  });
}

function overlapLen(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function occupies(ax, ay, az, bx, by, bz, isBox, k, x0, y0, z0, x1, y1, z1) {
  if (!isBox[k]) {
    return false;
  }
  return overlapLen(ax[k], bx[k], x0, x1) > 0.02
    && overlapLen(ay[k], by[k], y0, y1) > 0.02
    && overlapLen(az[k], bz[k], z0, z1) > 0.02;
}

function leftoverScan(colliders) {
  const n = colliders.count;
  const ax = colliders.fax;
  const ay = colliders.fay;
  const az = colliders.faz;
  const bx = colliders.fbx;
  const by = colliders.fby;
  const bz = colliders.fbz;
  const isBox = colliders.fbox;
  let death = 0;
  let overlap = 0;
  const samples = [];
  for (let i = 0; i < n; i += 1) {
    if (!isBox[i]) {
      continue;
    }
    for (let j = i + 1; j < n; j += 1) {
      if (!isBox[j]) {
        continue;
      }
      const ox = overlapLen(ax[i], bx[i], ax[j], bx[j]);
      const oy = overlapLen(ay[i], by[i], ay[j], by[j]);
      const oz = overlapLen(az[i], bz[i], az[j], bz[j]);
      if (ox > 0.02 && oy > 0.02 && oz > 0.02) {
        overlap += 1;
        if (samples.length < 8) {
          samples.push({ kind: 'overlap', i, j, ox, oy, oz });
        }
        continue;
      }
      const slot = (overA, overB, gap) => overA > 0.25 && overB > 0.25 && gap > 0.08 && gap < CLEAR;
      let axis = null;
      let gx0 = 0;
      let gy0 = 0;
      let gz0 = 0;
      let gx1 = 0;
      let gy1 = 0;
      let gz1 = 0;
      if (ox > 0.25 && oy > 0.25 && slot(ox, oy, -oz)) {
        axis = 'z';
        gx0 = Math.max(ax[i], ax[j]);
        gx1 = Math.min(bx[i], bx[j]);
        gy0 = Math.max(ay[i], ay[j]);
        gy1 = Math.min(by[i], by[j]);
        gz0 = Math.min(bz[i], bz[j]);
        gz1 = Math.max(az[i], az[j]);
      } else if (ox > 0.25 && oz > 0.25 && slot(ox, oz, -oy)) {
        axis = 'y';
        gx0 = Math.max(ax[i], ax[j]);
        gx1 = Math.min(bx[i], bx[j]);
        gz0 = Math.max(az[i], az[j]);
        gz1 = Math.min(bz[i], bz[j]);
        gy0 = Math.min(by[i], by[j]);
        gy1 = Math.max(ay[i], ay[j]);
      } else if (oy > 0.25 && oz > 0.25 && slot(oy, oz, -ox)) {
        axis = 'x';
        gy0 = Math.max(ay[i], ay[j]);
        gy1 = Math.min(by[i], by[j]);
        gz0 = Math.max(az[i], az[j]);
        gz1 = Math.min(bz[i], bz[j]);
        gx0 = Math.min(bx[i], bx[j]);
        gx1 = Math.max(ax[i], ax[j]);
      }
      if (!axis) {
        continue;
      }
      let filled = false;
      for (let k = 0; k < n; k += 1) {
        if (k === i || k === j) {
          continue;
        }
        if (occupies(ax, ay, az, bx, by, bz, isBox, k, gx0, gy0, gz0, gx1, gy1, gz1)) {
          filled = true;
          break;
        }
      }
      if (filled) {
        continue;
      }
      death += 1;
      if (samples.length < 8) {
        samples.push({ kind: axis, i, j, gap: axis === 'x' ? -ox : axis === 'y' ? -oy : -oz });
      }
    }
  }
  return { death, overlap, samples };
}

function auditWorld(heightAt, colliders, platforms) {
  const d = L.deck;
  let deckOk = 0;
  let deckMiss = 0;
  for (let x = d.x0 + 0.4; x < d.x1; x += 0.8) {
    for (let z = d.z0 + 0.4; z < d.z1; z += 0.8) {
      const h = heightAt(x, z, d.y + 0.2);
      if (Math.abs(h - d.y) > 0.08) {
        deckMiss += 1;
      } else {
        deckOk += 1;
      }
    }
  }
  const leftover = leftoverScan(colliders);
  return {
    deckOk,
    deckMiss,
    leftoverDeath: leftover.death,
    leftoverOverlap: leftover.overlap,
    leftoverSamples: leftover.samples,
    platforms: platforms.length,
    boxes: colliders.count,
  };
}
