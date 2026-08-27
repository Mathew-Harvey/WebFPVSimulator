/*
 * compact-perf.js: spatial merge and caster thinning for the compact
 * freestyle maps (bando, baths, yard).
 *
 * These maps are a hundred metres across and usually on screen, so a
 * 20 m cell exploded draw calls (209 merged meshes on the kiln). The
 * default is one bucket per material, split only on cast/receive so
 * thinned dress stays out of the shadow pass. Pass a finite cell when
 * a later map is actually city-sized.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const box = new THREE.Box3();
const sphere = new THREE.Sphere();

export function restrictCasters(root, minRadius) {
  if (!(minRadius > 0)) {
    return 0;
  }
  let n = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.castShadow) {
      return;
    }
    if (o.userData && o.userData.keepShadow) {
      return;
    }
    box.setFromObject(o);
    if (box.isEmpty()) {
      return;
    }
    box.getBoundingSphere(sphere);
    if (sphere.radius < minRadius) {
      o.castShadow = false;
      n += 1;
    }
  });
  return n;
}

export function mergeStatic(root, opts = {}) {
  const cell = opts.cell == null ? 24 : opts.cell;
  const wantTransparent = opts.transparent === true;
  const groups = new Map();
  const remove = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry || (o.userData && o.userData.noMerge)) {
      return;
    }
    const mat = o.material;
    if (!mat) {
      return;
    }
    if (mat.transparent) {
      if (!wantTransparent) {
        return;
      }
    } else if (wantTransparent) {
      return;
    }
    const geo = o.geometry;
    if (!geo.attributes || !geo.attributes.position) {
      return;
    }
    box.setFromObject(o);
    if (box.isEmpty()) {
      return;
    }
    box.getBoundingSphere(sphere);
    const cx = Number.isFinite(cell) ? Math.floor(sphere.center.x / cell) : 0;
    const cz = Number.isFinite(cell) ? Math.floor(sphere.center.z / cell) : 0;
    const indexed = geo.index ? 1 : 0;
    const attrs = Object.keys(geo.attributes).sort().join(',');
    const key = `${mat.uuid}|${cx},${cz}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${indexed}|${attrs}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        mat,
        cx,
        cz,
        geos: [],
        cast: o.castShadow,
        receive: o.receiveShadow,
      };
      groups.set(key, g);
    }
    const clone = geo.clone();
    clone.applyMatrix4(o.matrixWorld);
    g.geos.push(clone);
    g.cast = g.cast || o.castShadow;
    g.receive = g.receive || o.receiveShadow;
    remove.push(o);
  });
  const parentWorld = new THREE.Matrix4();
  if (root.matrixWorld) {
    parentWorld.copy(root.matrixWorld).invert();
  }
  for (const o of remove) {
    if (o.parent) {
      o.parent.remove(o);
    }
    o.geometry.dispose();
  }
  let meshes = 0;
  let triangles = 0;
  const cells = [];
  for (const g of groups.values()) {
    if (g.geos.length === 0) {
      continue;
    }
    const merged = mergeGeometries(g.geos, false);
    for (const geo of g.geos) {
      geo.dispose();
    }
    if (!merged) {
      continue;
    }
    if (root.matrixWorld) {
      merged.applyMatrix4(parentWorld);
    }
    merged.computeBoundingSphere();
    if (!merged.boundingSphere || merged.boundingSphere.radius < 1e-8) {
      merged.dispose();
      continue;
    }
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    const span = Number.isFinite(cell) ? cell : 0;
    mesh.userData.cellX = (g.cx + 0.5) * span;
    mesh.userData.cellZ = (g.cz + 0.5) * span;
    root.add(mesh);
    cells.push(mesh);
    meshes += 1;
    const idx = merged.index;
    triangles += idx ? idx.count / 3 : merged.attributes.position.count / 3;
  }
  return { meshes, triangles, cells };
}
