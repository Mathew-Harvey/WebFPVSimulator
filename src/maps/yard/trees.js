/*
 * trees.js: shade trees, not hedge walls and not cubes.
 *
 * City grove language, copied not imported: a baked cylinder trunk and
 * limbs, instanced icosahedron blobs in three greens. Canopies do not
 * receive shadow (a ramp in shade is a black circle in the sky).
 *
 * Leftover law still applies. Blobs overlap, so they cannot each be a
 * collider. One hull per tree, from UNDER so a 5 inch fits under, half
 * extent HALF so neighbours at 7 m have a 1.4 m+ slot. Blobs are
 * clamped inside that hull. No perimeter slab.
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
import { bake, rngKit, trs } from './cel/util.js';

const UNDER = 2.52;
const HALF = 2.08;
const LIMB = [
  [1, 0.42, 0],
  [0.72, 0.5, 0.72],
  [0, 0.46, 1],
  [-0.72, 0.5, 0.72],
  [-1, 0.42, 0],
  [-0.72, 0.5, -0.72],
  [0, 0.46, -1],
  [0.72, 0.5, -0.72],
];

export function buildTrees(root, colliders, M) {
  const spots = plant();
  const woodParts = [];
  const blobs = [[], [], []];
  const trunkGeo = new THREE.CylinderGeometry(0.62, 1.0, 1, 7, 1);
  const branchGeo = new THREE.CylinderGeometry(0.28, 0.6, 1, 5, 1);
  const blobGeo = new THREE.IcosahedronGeometry(1, 0);

  for (const spot of spots) {
    grow(spot, woodParts, blobs, trunkGeo, branchGeo, colliders);
  }

  const wood = new THREE.Mesh(bake(woodParts), M.woodDark);
  wood.castShadow = true;
  wood.receiveShadow = true;
  wood.name = 'yardWood';
  root.add(wood);

  const mats = [M.leafSun, M.leaf, M.leafDark];
  blobs.forEach((list, i) => {
    if (!list.length) {
      return;
    }
    const inst = new THREE.InstancedMesh(blobGeo, mats[i], list.length);
    list.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = false;
    inst.userData.noMerge = true;
    inst.name = 'yardCanopy' + i;
    inst.frustumCulled = false;
    root.add(inst);
  });

  trunkGeo.dispose();
  branchGeo.dispose();
}

function plant() {
  const spots = [];
  let seed = 11;
  const add = (x, z, scale) => {
    seed += 17;
    spots.push({ x, z, scale, seed });
  };
  for (let x = -40; x <= 37; x += 7) {
    add(x, 39, 0.92);
  }
  for (let z = -35; z <= 32; z += 7) {
    add(-44, z, 0.88);
  }
  for (let z = -35; z <= 28; z += 7) {
    add(23, z, 0.9);
  }
  const south = [-38, -31, -24, -17, -3, 4, 18, 25, 32];
  for (const x of south) {
    add(x, -44, 0.86);
  }
  add(-16, 8, 1.05);
  add(-11, 18, 1.12);
  add(6, 20, 0.98);
  add(3, 13.4, 0.9);
  add(15.4, -10, 1.0);
  add(15.4, 12, 1.08);
  add(-14, -12, 0.94);
  add(-22, 5, 1.02);
  add(-8, -22, 0.88);
  add(8, 26, 0.95);
  return spots;
}

function grow(spot, woodParts, blobs, trunkGeo, branchGeo, colliders) {
  const rng = rngKit(spot.seed);
  const S = spot.scale;
  const x = spot.x;
  const z = spot.z;
  const trunkH = 3.55 * S * rng.range(0.92, 1.12);
  const trunkR = 0.22 * S;
  woodParts.push({
    geometry: trunkGeo,
    matrix: trs(x, trunkH * 0.5, z, 0, 0, 0, trunkR, trunkH, trunkR),
  });
  woodParts.push({
    geometry: trunkGeo,
    matrix: trs(x, 0.18 * S, z, 0, 0, 0, trunkR * 1.55, 0.38 * S, trunkR * 1.55),
  });

  const topY = trunkH;
  const nLimb = 4 + (rng.next() < 0.5 ? 1 : 0);
  const centers = [];
  for (let i = 0; i < nLimb; i += 1) {
    const d = LIMB[(i * 2 + (rng.next() < 0.5 ? 1 : 0)) % LIMB.length];
    const len = 1.35 * S * rng.range(0.82, 1.18);
    const reach = Math.min(HALF * 0.72, len);
    const ex = x + d[0] * reach;
    const ey = topY + d[1] * len;
    const ez = z + d[2] * reach;
    const mx = (x + ex) * 0.5;
    const my = (topY + ey) * 0.5;
    const mz = (z + ez) * 0.5;
    const dx = ex - x;
    const dy = ey - topY;
    const dz = ez - z;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx / L, dy / L, dz / L),
    );
    woodParts.push({
      geometry: branchGeo,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(mx, my, mz),
        q,
        new THREE.Vector3(0.14 * S, L, 0.14 * S),
      ),
    });
    centers.push({ x: ex, y: ey, z: ez });
  }

  const count = 24 + Math.floor(rng.next() * 8);
  const yTop = UNDER + 4.6 * S;
  for (let i = 0; i < count; i += 1) {
    const c = centers[Math.floor(rng.next() * centers.length)];
    const r = 0.62 * S * rng.range(0.72, 1.18);
    const ry = r * rng.range(0.7, 0.9);
    const px = clamp(c.x + rng.range(-1.05, 1.05) * S, x - (HALF - r), x + (HALF - r));
    const pz = clamp(c.z + rng.range(-1.05, 1.05) * S, z - (HALF - r), z + (HALF - r));
    const py = clamp(c.y + rng.range(-0.45, 1.15) * S, UNDER + ry, yTop - ry);
    const hi = (py - UNDER) / Math.max(0.8, yTop - UNDER);
    let tone = hi > 0.66 ? 0 : hi < 0.32 ? 2 : 1;
    if (rng.next() < 0.18) {
      tone = (tone + 1) % 3;
    }
    blobs[tone].push(trs(
      px, py, pz,
      rng.range(0, 3), rng.range(0, 3), rng.range(0, 3),
      r, ry, r,
    ));
  }
  for (let i = 0; i < 4; i += 1) {
    const r = 0.55 * S * rng.range(0.8, 1.1);
    const ry = r * 0.78;
    const px = clamp(x + rng.range(-0.7, 0.7) * S, x - (HALF - r), x + (HALF - r));
    const pz = clamp(z + rng.range(-0.7, 0.7) * S, z - (HALF - r), z + (HALF - r));
    const py = yTop - ry - rng.range(0.05, 0.45);
    blobs[0].push(trs(px, py, pz, rng.range(0, 3), rng.range(0, 3), rng.range(0, 3), r, ry, r));
  }

  colliders.addBox('tree', x - trunkR, 0, z - trunkR, x + trunkR, UNDER, z + trunkR);
  colliders.addBox('canopy', x - HALF, UNDER, z - HALF, x + HALF, yTop, z + HALF);
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
