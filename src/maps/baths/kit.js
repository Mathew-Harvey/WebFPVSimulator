/*
 * kit.js: one box is a mesh and a collider, written together.
 *
 * A wall is one call, and a gap is the absence of a call. Platforms are
 * the other half, so a gallery is landable from above and solid from below.
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
import { PAL } from './palette.js';
import { cel, flat } from './cel/toon.js';

export const STEP = 0.55;
export const SLAB_THICK = 0.3;
export const SLAB_CLEAR = 0.02;
export const PLATFORM_MIN = 0.6;
export const CLEAR = 1.4;

/*
 * Plan of the hall. X along the 50 m pool, west shallow to east deep.
 * Z across the hall, south mouth to north gallery. Metres, Three.js Y up.
 *
 * A leftover between solids is 0 (flush or a shared face) or at least
 * CLEAR. Anything in between eats a 5 inch.
 */
export const L = {
  hall: {
    x0: -29, x1: 31, z0: -13, z1: 13, h: 16, t: 0.45,
  },
  door: {
    half: 6.2, h: 5.8,
  },
  pool: {
    x0: -25, x1: 25, z0: -6.25, z1: 6.25, wall: 0.4,
    shallowX: -5, shallowY: -1.35,
    midX: 10, midY: -2.2,
    deepY: -5,
  },
  gallery: {
    y: 6.5, w: 4.2, thick: 0.28, parapet: 1.15,
  },
  tower: {
    x0: 25.0, x1: 30.55, z0: -1.8, z1: 1.8,
    boardX: 23.5,
    ys: [3.0, 5.2, 7.6, 10.0],
    thick: 0.22,
  },
  plant: {
    x0: 25.4, x1: 30.55, z0: -12.4, z1: -4.2, y0: -3.6, lip: 1.15,
  },
  lockers: {
    x0: 29.15, x1: 30.55, z0: 8.4, z1: 12.55,
  },
  wells: [
    { x0: -16, x1: -6, z0: -5.5, z1: 5.5 },
    { x0: 6, x1: 16, z0: -5.5, z1: 5.5 },
  ],
  sw: {
    x0: -29.5, x1: -24.2, z0: -13.5, z1: -8.2, h: 20,
  },
  ne: {
    x0: 26.2, x1: 31.5, z0: 8.2, z1: 13.5, h: 20,
  },
  spawn: { x: 0, z: 22, yaw: Math.PI },
  site: { x0: -52, x1: 48, z0: -32, z1: 36 },
};

export function materials() {
  const t = PAL.shadowTint;
  return {
    creamSun: cel({ color: PAL.creamSun, bands: 3, tint: t }),
    cream: cel({ color: PAL.cream, bands: 2, tint: t }),
    creamShade: cel({ color: PAL.creamShade, bands: 2, tint: t }),
    plaza: cel({ color: PAL.plaza, bands: 2, tint: t }),
    dry: cel({ color: PAL.dryGrass, bands: 2, tint: t }),
    hillShade: cel({ color: PAL.hillShade, bands: 2, tint: t }),
    tile: cel({ color: PAL.tile, bands: 3, tint: t }),
    tileDeep: cel({ color: PAL.tileDeep, bands: 3, tint: t }),
    steel: cel({ color: PAL.steel, bands: 2, tint: t }),
    steelDark: cel({ color: PAL.steelDark, bands: 2, tint: t }),
    litter: cel({ color: PAL.litter, bands: 2, tint: t }),
    orange: flat({ color: PAL.orange }),
    navy: flat({ color: PAL.navy }),
    white: flat({ color: PAL.bandWhite }),
    safety: flat({ color: PAL.safety }),
    bandRed: flat({ color: PAL.bandRed }),
    pane: flat({ color: PAL.glassDark }),
    tileLine: flat({ color: PAL.tileLine }),
    hill: flat({ color: PAL.hill, fog: true }),
    hillFar: flat({ color: PAL.hillFar, fog: true }),
    well: flat({ color: PAL.creamSun }),
  };
}

export function slab(root, colliders, mat, x0, y0, z0, x1, y1, z1, opts = {}) {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  const za = Math.min(z0, z1);
  const zb = Math.max(z0, z1);
  if (xb - xa < 0.002 || yb - ya < 0.002 || zb - za < 0.002) {
    return null;
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(xb - xa, yb - ya, zb - za), mat);
  mesh.position.set((xa + xb) * 0.5, (ya + yb) * 0.5, (za + zb) * 0.5);
  mesh.castShadow = opts.cast !== false && !opts.noShadow;
  mesh.receiveShadow = opts.receive !== false;
  if (opts.noShadow) {
    mesh.userData.noShadow = true;
  }
  if (opts.noMerge) {
    mesh.userData.noMerge = true;
  }
  root.add(mesh);
  if (opts.solid !== false) {
    colliders.addBox(opts.kind || 'wall', xa, ya, za, xb, yb, zb);
  }
  return mesh;
}

export function decal(root, colliders, mat, x0, y0, z0, x1, y1, z1) {
  return slab(root, colliders, mat, x0, y0, z0, x1, y1, z1, {
    solid: false, cast: false, receive: false, noShadow: true,
  });
}

export function hit(colliders, x0, y0, z0, x1, y1, z1, kind = 'wall') {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  const za = Math.min(z0, z1);
  const zb = Math.max(z0, z1);
  colliders.addBox(kind, xa, ya, za, xb, yb, zb);
}

export function deck(root, colliders, platforms, mat, x0, z0, x1, z1, top, thick = SLAB_THICK) {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const za = Math.min(z0, z1);
  const zb = Math.max(z0, z1);
  slab(root, colliders, mat, xa, top - thick, za, xb, top, zb, { solid: false, receive: true });
  if (top >= PLATFORM_MIN) {
    colliders.addBox('wall', xa, top - thick, za, xb, top - SLAB_CLEAR, zb);
  }
  platforms.push({
    x0: xa, z0: za, x1: xb, z1: zb, top, thick,
  });
}

export function fillAround(root, colliders, mat, x0, z0, x1, z1, y0, y1, holes, opts) {
  const xs = [x0];
  const zs = [z0];
  for (const h of holes) {
    xs.push(h.x0, h.x1);
    zs.push(h.z0, h.z1);
  }
  xs.push(x1);
  zs.push(z1);
  xs.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < zs.length - 1; j += 1) {
      const xa = xs[i];
      const xb = xs[i + 1];
      const za = zs[j];
      const zb = zs[j + 1];
      if (xb - xa < 0.05 || zb - za < 0.05) {
        continue;
      }
      const mx = (xa + xb) * 0.5;
      const mz = (za + zb) * 0.5;
      if (holes.some((h) => mx > h.x0 && mx < h.x1 && mz > h.z0 && mz < h.z1)) {
        continue;
      }
      slab(root, colliders, mat, xa, y0, za, xb, y1, zb, opts);
    }
  }
}

export function mergeStatic(root) {
  const groups = new Map();
  const remove = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.userData.noMerge) {
      return;
    }
    const mat = o.material;
    if (!mat || mat.transparent) {
      return;
    }
    let g = groups.get(mat.uuid);
    if (!g) {
      g = { mat, geos: [], cast: false, receive: false };
      groups.set(mat.uuid, g);
    }
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    g.geos.push(geo);
    g.cast = g.cast || o.castShadow;
    g.receive = g.receive || o.receiveShadow;
    remove.push(o);
  });
  for (const o of remove) {
    if (o.parent) {
      o.parent.remove(o);
    }
    o.geometry.dispose();
  }
  let meshes = 0;
  let triangles = 0;
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
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    mesh.frustumCulled = true;
    root.add(mesh);
    meshes += 1;
    const idx = merged.index;
    triangles += idx ? idx.count / 3 : merged.attributes.position.count / 3;
  }
  return { meshes, triangles };
}