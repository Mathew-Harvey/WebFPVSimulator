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
import { L, STEP, CLEAR, materials, mergeStatic } from './kit.js';
import { restrictCasters } from '../compact-perf.js';
import { buildGround, groundHeight, poolFloor, teachFloor } from './ground.js';
import { buildHall } from './hall.js';
import { buildPool } from './pool.js';
import { buildPlay } from './play.js';
import { buildDress } from './dress.js';
import { bathsReferences } from './references.js';

export function buildWorld(scene, opts = {}) {
  const root = new THREE.Group();
  root.name = 'baths';
  scene.add(root);

  const colliders = new Colliders();
  const platforms = [];
  const M = materials();

  buildGround(root, colliders, M);
  buildHall(root, colliders, platforms, M);
  buildPool(root, colliders, platforms, M);
  buildPlay(root, colliders, platforms, M);
  buildDress(root, colliders, M);

  const references = bathsReferences(root, colliders, platforms);
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
    { x: 0, y: 2.8, z: 16.2 },
    { x: 0, y: 2.6, z: 12.45 },
    { x: 0, y: 2.8, z: 7.8 },
    { x: 0, y: 0.4, z: 0 },
    { x: 0, y: 6.7, z: 0 },
    { x: -7.4, y: 2.8, z: 0 },
    { x: -11.2, y: 9.8, z: 0 },
    { x: -20.6, y: 1.8, z: 0 },
    { x: -23.2, y: 0.1, z: 0 },
    { x: -28.8, y: 2.2, z: -3.8 },
    { x: -36, y: 1.8, z: 0 },
    { x: -39, y: 3.4, z: 0 },
    { x: -40, y: 6.2, z: -10 },
    { x: -11, y: 13.2, z: 0 },
    { x: 12.6, y: 9.8, z: 3.8 },
    { x: 16, y: -2.9, z: 0 },
    { x: 21.3, y: 6.3, z: 0 },
    { x: 24, y: 12, z: 0 },
    { x: 0, y: 8, z: 22 },
  ];
  void world;
  return pts.map((p) => {
    const floor = groundHeight(p.x, p.z);
    const pad = floor >= -0.05 ? 2.4 : 0.45;
    return { x: p.x, y: Math.max(p.y, floor + pad), z: p.z };
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
          samples.push({
            kind: axis,
            i,
            j,
            gap: axis === 'x' ? -ox : axis === 'y' ? -oy : -oz,
            a: [ax[i], ay[i], az[i], bx[i], by[i], bz[i]],
            b: [ax[j], ay[j], az[j], bx[j], by[j], bz[j]],
          });
        }
    }
  }
  return { death, overlap, samples };
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
      if (got < want - 0.08) {
        poolWrong += 1;
      } else {
        poolOk += 1;
      }
    }
  }
  let teachWrong = 0;
  let teachOk = 0;
  const tch = L.teach;
  for (let x = tch.x0 + 0.5; x < tch.x1; x += 1) {
    for (let z = tch.z0 + 0.5; z < tch.z1; z += 1) {
      const want = teachFloor(x, z);
      const got = heightAt(x, z, want + 0.2);
      if (want === null) {
        continue;
      }
      if (got < want - 0.08) {
        teachWrong += 1;
      } else {
        teachOk += 1;
      }
    }
  }
  let wellGhost = 0;
  for (const w of L.wells) {
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
  for (let x = -18; x <= 18; x += 2) {
    const h = heightAt(x, 10.4, gy + 0.2);
    if (Math.abs(h - gy) > 0.08) {
      galleryMiss += 1;
    }
  }
  const leftover = leftoverScan(colliders);
  return {
    poolOk,
    poolWrong,
    teachOk,
    teachWrong,
    wellGhost,
    galleryMiss,
    leftoverDeath: leftover.death,
    leftoverOverlap: leftover.overlap,
    leftoverSamples: leftover.samples,
    platforms: platforms.length,
    boxes: colliders.count,
  };
}
