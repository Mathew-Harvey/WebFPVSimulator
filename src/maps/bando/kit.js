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
import { PAL } from './palette.js';
import { cel, flat } from './cel/toon.js';
export { mergeStatic } from '../compact-perf.js';

export const STEP = 0.55;
export const SLAB_THICK = 0.3;
export const SLAB_CLEAR = 0.02;
export const PLATFORM_MIN = 0.6;
export const CLEAR = 1.4;

/*
 * Plan of the plant. X along the kiln, west stack to east bins. Z across
 * the yard, south dock to north preheater. Metres, Three.js Y up.
 *
 * A leftover between solids is 0 (flush or a shared face) or at least
 * CLEAR. Anything in between eats a 5 inch. The bin split is authored
 * at CLEAR on purpose: that is the hoop, not a leftover.
 */
export const L = {
  pack: {
    x0: -28, x1: 28, z0: -7, z1: 7, h: 16, t: 0.45, door: 6,
  },
  stack: {
    cx: -46, cz: 0, inner: 2.8, wall: 0.8, h: 58,
  },
  kiln: {
    y0: 8, inner: 3.5, wall: 0.5, x0: -43.8, x1: 24,
  },
  pre: {
    x0: -22, x1: -10, z0: -22, z1: -7, h: 42, rise: 6,
  },
  bins: {
    cx: 38, zs: [-8.6, 0, 8.6], w: 7.2, hs: [16, 22, 28],
  },
  gantry: {
    x0: 28, x1: 40.6, z0: 3.62, z1: 4.98, y: 16,
  },
  gantrySouth: {
    x0: 28, x1: 40.6, z0: -4.98, z1: -3.62, y: 16,
  },
  hopper: {
    x0: 32, x1: 44, z0: -12, z1: 12, y0: -8, y1: 0,
  },
  dock: {
    x0: 10, x1: 26, z0: 7, z1: 15, h: 2.2,
  },
  spawn: { x: 4.8, z: 19.2, yaw: Math.PI + 0.28 },
};

export function materials() {
  const t = PAL.shadowTint;
  return {
    boneSun: cel({ color: PAL.boneSun, bands: 2, tint: t }),
    bone: cel({ color: PAL.bone, bands: 2, tint: t }),
    boneViolet: cel({ color: PAL.boneViolet, bands: 2, tint: t }),
    mint: cel({ color: PAL.mint, bands: 2, tint: t }),
    ochre: cel({ color: PAL.ochre, bands: 2, tint: t }),
    ochreShade: cel({ color: PAL.ochreShade, bands: 2, tint: t }),
    dry: cel({ color: PAL.dryGrass, bands: 2, tint: t }),
    hillShade: cel({ color: PAL.hillShade, bands: 2, tint: t }),
    rust: cel({ color: PAL.rust, bands: 2, tint: t }),
    steel: cel({ color: PAL.steel, bands: 2, tint: t }),
    steelDark: cel({ color: PAL.steelDark, bands: 2, tint: t }),
    litter: cel({ color: PAL.litter, bands: 2, tint: t }),
    stackSun: cel({ color: PAL.boneSun, bands: 3, tint: t }),
    silo: cel({ color: PAL.boneSun, bands: 3, tint: t }),
    siloDark: cel({ color: PAL.boneViolet, bands: 3, tint: t }),
    siloShell: cel({ color: PAL.boneSun, bands: 3, tint: t, side: THREE.DoubleSide }),
    siloShellDark: cel({ color: PAL.boneViolet, bands: 3, tint: t, side: THREE.DoubleSide }),
    cyclone: cel({ color: PAL.rust, bands: 3, tint: t, side: THREE.DoubleSide }),
    kiln: cel({ color: PAL.steel, bands: 3, tint: t, side: THREE.DoubleSide }),
    kilnDrum: cel({ color: PAL.kilnShell, bands: 3, tint: t, side: THREE.DoubleSide }),
    glassDark: flat({ color: PAL.glassDark }),
    mintShell: cel({ color: PAL.mint, bands: 2, tint: t, side: THREE.DoubleSide }),
    stack: cel({ color: PAL.bone, bands: 3, tint: t, side: THREE.DoubleSide }),
    safety: flat({ color: PAL.safety }),
    bandRed: flat({ color: PAL.bandRed }),
    bandWhite: flat({ color: PAL.bandWhite }),
    pane: flat({ color: PAL.boneViolet }),
    inkFlat: flat({ color: PAL.ink }),
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
  colliders.addBox('wall', xa, top - thick, za, xb, top - SLAB_CLEAR, zb);
  platforms.push({
    x0: xa, z0: za, x1: xb, z1: zb, top, thick,
  });
}

/* Axis-aligned pipe. r is the half-width of the box that stands in for
 * the tube. Graphics equal solid: a drawn pipe is a hit. */
export function pipe(root, colliders, mat, axis, a0, a1, p, q, r, opts = {}) {
  const kind = opts.kind || 'pole';
  if (axis === 'x') {
    return slab(root, colliders, mat, a0, p - r, q - r, a1, p + r, q + r, { ...opts, kind });
  }
  if (axis === 'y') {
    return slab(root, colliders, mat, p - r, a0, q - r, p + r, a1, q + r, { ...opts, kind });
  }
  return slab(root, colliders, mat, p - r, q - r, a0, p + r, q + r, a1, { ...opts, kind });
}

/* Square fly-through duct along X. Inner clear is `inner`. Floor is a
 * deck so it is landable. Ends stay open. */
export function ductX(root, colliders, platforms, mat, x0, x1, y0, zMid, inner, t = 0.26) {
  const y1 = y0 + inner;
  const z0 = zMid - inner * 0.5;
  const z1 = zMid + inner * 0.5;
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  slab(root, colliders, mat, xa, y0 - t, z0, xb, y0, z1);
  slab(root, colliders, mat, xa, y1, z0, xb, y1 + t, z1);
  slab(root, colliders, mat, xa, y0, z1, xb, y1, z1 + t);
  slab(root, colliders, mat, xa, y0, z0 - t, xb, y1, z0);
  if (platforms) {
    platforms.push({ x0: xa, z0, x1: xb, z1, top: y0 });
  }
}

export function ductZ(root, colliders, platforms, mat, z0, z1, y0, xMid, inner, t = 0.26) {
  const y1 = y0 + inner;
  const x0 = xMid - inner * 0.5;
  const x1 = xMid + inner * 0.5;
  const za = Math.min(z0, z1);
  const zb = Math.max(z0, z1);
  slab(root, colliders, mat, x0, y0 - t, za, x1, y0, zb);
  slab(root, colliders, mat, x0, y1, za, x1, y1 + t, zb);
  slab(root, colliders, mat, x1, y0, za, x1 + t, y1, zb);
  slab(root, colliders, mat, x0 - t, y0, za, x0, y1, zb);
  if (platforms) {
    platforms.push({ x0, z0: za, x1, z1: zb, top: y0 });
  }
}
