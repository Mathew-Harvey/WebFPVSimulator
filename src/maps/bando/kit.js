/*
 * kit.js: one box is a mesh and a collider, written together.
 *
 * The city's invisible walls were walker rectangles standing off the
 * drawing. This map never gets that far: a wall is one call, and a gap is
 * the absence of a call. Platforms are the other half, so a roof is
 * landable from above and solid from below.
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

/*
 * Plan of the plant. X along the kiln, west stack to east bins. Z across
 * the yard, south dock to north preheater. Metres, Three.js Y up.
 */
export const L = {
  pack: {
    x0: -28, x1: 28, z0: -7, z1: 7, h: 16,
  },
  stack: {
    cx: -46, cz: 0, inner: 2.8, wall: 0.8, h: 58,
  },
  kiln: {
    y0: 8, inner: 3.5, wall: 0.5, x0: -44.6, x1: 24,
  },
  pre: {
    x0: -22, x1: -10, z0: -22, z1: -8, h: 42, rise: 6,
  },
  bins: {
    cx: 38, zs: [-8.6, 0, 8.6], w: 7.2, hs: [16, 22, 28],
  },
  gantry: {
    x0: 28, x1: 40.6, z0: 3.62, z1: 4.98, y: 16,
  },
  hopper: {
    x0: 32, x1: 44, z0: -12, z1: 12, y0: -8, y1: 0,
  },
  dock: {
    x0: 10, x1: 26, z0: 7, z1: 15, h: 2.2,
  },
  spawn: { x: 0, z: 18, yaw: Math.PI },
};

export function materials() {
  const t = PAL.shadowTint;
  return {
    boneSun: cel({ color: PAL.boneSun, bands: 2, tint: t }),
    bone: cel({ color: PAL.bone, bands: 2, tint: t }),
    boneViolet: cel({ color: PAL.boneViolet, bands: 2, tint: t }),
    mint: cel({ color: PAL.mint, bands: 2, tint: t }),
    ochre: cel({ color: PAL.ochre, bands: 2, tint: t }),
    dry: cel({ color: PAL.dryGrass, bands: 2, tint: t }),
    hillShade: cel({ color: PAL.hillShade, bands: 2, tint: t }),
    rust: cel({ color: PAL.rust, bands: 2, tint: t }),
    steel: cel({ color: PAL.steel, bands: 2, tint: t }),
    steelDark: cel({ color: PAL.steelDark, bands: 2, tint: t }),
    litter: cel({ color: PAL.litter, bands: 2, tint: t }),
    stackSun: cel({ color: PAL.boneSun, bands: 3, tint: t }),
    silo: cel({ color: PAL.boneSun, bands: 3, tint: t }),
    siloDark: cel({ color: PAL.boneViolet, bands: 3, tint: t }),
    kiln: cel({ color: PAL.steel, bands: 3, tint: t, side: THREE.DoubleSide }),
    kilnDrum: cel({ color: PAL.steel, bands: 3, tint: t, side: THREE.DoubleSide }),
    mintShell: cel({ color: PAL.mint, bands: 2, tint: t, side: THREE.DoubleSide }),
    stack: cel({ color: PAL.bone, bands: 3, tint: t, side: THREE.DoubleSide }),
    safety: flat({ color: PAL.safety }),
    bandRed: flat({ color: PAL.bandRed }),
    bandWhite: flat({ color: PAL.bandWhite }),
    pane: flat({ color: PAL.glassDark }),
    well: flat({ color: PAL.boneSun }),
    pool: flat({ color: PAL.boneSun, fog: true }),
    hill: flat({ color: PAL.hill, fog: true }),
    hillFar: flat({ color: PAL.hillFar, fog: true }),
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
    x0: xa, z0: za, x1: xb, z1: zb, top,
  });
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
