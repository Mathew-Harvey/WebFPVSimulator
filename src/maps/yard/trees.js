/*
 * trees.js: shade trees, not hedge walls and not cubes.
 *
 * City grove language, copied not imported: a baked cylinder trunk and
 * limbs, instanced icosahedron blobs in three greens. Canopies still
 * cast, but they do not receive shadow (a ramp in shade is a black
 * circle in the sky).
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

export function buildTrees(root, colliders, M, keep = 1) {
  const spots = plant();
  const woodParts = [];
  const blobs = [[], [], []];
  const trunkGeo = new THREE.CylinderGeometry(0.62, 1.0, 1, 7, 1);
  const branchGeo = new THREE.CylinderGeometry(0.28, 0.6, 1, 5, 1);
  const blobGeo = new THREE.IcosahedronGeometry(1, 0);

  for (const spot of spots) {
    grow(spot, woodParts, blobs, trunkGeo, branchGeo, colliders, keep);
  }

  const wood = new THREE.Mesh(bake(woodParts), M.woodDark);
  wood.castShadow = true;
  wood.receiveShadow = true;
  wood.userData.keepShadow = true;
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
    inst.computeBoundingSphere();
    inst.frustumCulled = true;
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
    add(x, 39, 1.18);
  }
  for (let z = -35; z <= 32; z += 7) {
    add(-44, z, 1.12);
  }
  for (let z = -35; z <= 28; z += 7) {
    add(23, z, 1.14);
  }
  const south = [-38, -31, -24, -17, -3, 4, 18, 25, 32];
  for (const x of south) {
    add(x, -44, 1.1);
  }
  add(-16, 8, 1.05);
  add(-8, 10, 1.08);
  add(6, 20, 0.98);
  add(3, 12, 0.9);
  add(15.4, -22, 1.0);
  add(15.4, 12, 1.08);
  add(-14, -12, 0.94);
  add(-22, 5, 1.02);
  add(-8, -22, 0.88);
  add(8, 26, 0.95);
  add(12, 18, 1.04);
  add(2, 28, 1.02);
  add(-2.4, -18, 0.92);
  add(-2.4, -27, 0.9);
  return spots;
}

function grow(spot, woodParts, blobs, trunkGeo, branchGeo, colliders, keep) {
  const rng = rngKit(spot.seed);
  const S = spot.scale;
  const x = spot.x;
  const z = spot.z;
  const trunkH = 3.85 * S * rng.range(0.92, 1.12);
  const trunkR = 0.36 * S;
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
    if (rng.next() < 0.7) {
      const tw = len * rng.range(0.42, 0.62);
      const tx = ex + d[0] * tw * 0.35;
      const ty = ey + 0.22 * tw;
      const tz = ez + d[2] * tw * 0.35;
      const mx2 = (ex + tx) * 0.5;
      const my2 = (ey + ty) * 0.5;
      const mz2 = (ez + tz) * 0.5;
      const dx2 = tx - ex;
      const dy2 = ty - ey;
      const dz2 = tz - ez;
      const L2 = Math.sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2) || 1;
      const q2 = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx2 / L2, dy2 / L2, dz2 / L2),
      );
      woodParts.push({
        geometry: branchGeo,
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(mx2, my2, mz2),
          q2,
          new THREE.Vector3(0.08 * S, L2, 0.08 * S),
        ),
      });
      centers.push({ x: tx, y: ty, z: tz });
    }
  }

  /* Many small blobs, city grove language: large lumps read as boulders
   * against the sky. keep is the quality lever. Clamped to the hull. */
  const count = Math.max(12, Math.round((30 + Math.floor(rng.next() * 8)) * keep));
  const yTop = UNDER + 4.2 * S;
  const cx = x;
  const cy = UNDER + 2.05 * S;
  const cz = z;
  const put = (px0, py0, pz0, r, ry, tone) => {
    const px = clamp(px0, x - (HALF - r), x + (HALF - r));
    const pz = clamp(pz0, z - (HALF - r), z + (HALF - r));
    const py = clamp(py0, UNDER + ry, yTop - ry);
    blobs[tone].push(trs(
      px, py, pz,
      rng.range(0, 3), rng.range(0, 3), rng.range(0, 3),
      r, ry, r,
    ));
  };
  for (let i = 0; i < count; i += 1) {
    const c = centers[Math.floor(rng.next() * centers.length)];
    const r = 0.30 * S * rng.range(0.72, 1.08);
    const ry = r * rng.range(0.70, 0.88);
    let px = c.x + rng.range(-0.85, 0.85) * S;
    let pz = c.z + rng.range(-0.85, 0.85) * S;
    let py = c.y + rng.range(-0.35, 0.85) * S;
    px = cx + (px - cx) * 0.90;
    pz = cz + (pz - cz) * 0.90;
    py = cy + (py - cy) * 0.82;
    const hi = (py - UNDER) / Math.max(0.8, yTop - UNDER);
    let tone = hi > 0.66 ? 0 : hi < 0.32 ? 2 : 1;
    if (rng.next() < 0.18) {
      tone = (tone + 1) % 3;
    }
    put(px, py, pz, r, ry, tone);
  }
  for (let i = 0; i < 4; i += 1) {
    const r = 0.30 * S * rng.range(0.85, 1.12);
    const ry = r * 0.78;
    put(
      x + rng.range(-0.55, 0.55) * S,
      yTop - ry - rng.range(0.04, 0.28),
      z + rng.range(-0.55, 0.55) * S,
      r, ry, 0,
    );
  }
  for (let i = 0; i < 4; i += 1) {
    const d = LIMB[i * 2];
    const r = 0.28 * S * rng.range(0.8, 1.05);
    const ry = r * 0.72;
    put(x + d[0] * 0.55 * S, UNDER + ry + 0.1, z + d[2] * 0.55 * S, r, ry, 2);
  }

  colliders.addBox('tree', x - trunkR, 0, z - trunkR, x + trunkR, UNDER, z + trunkR);
  colliders.addSphere('canopy', x, UNDER + HALF, z, HALF);
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
