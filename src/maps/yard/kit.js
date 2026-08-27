/*
 * kit.js: one box is a mesh and a collider, written together.
 *
 * A wall is one call, and a gap is the absence of a call. Platforms are
 * the other half, so a deck is landable from above and solid from below.
 * Leftovers between solids are 0 (flush) or at least CLEAR. Anything in
 * between eats a 5 inch.
 *
 * Plan of the yard. Public sources, not an address: Joshua Bardwell's
 * 2.5 acre East Tennessee lot as flown in his videos and as Liftoff
 * published "Bardwell's Yard". Cream split-level, raised north deck,
 * south porch swing, east driveway with an iron gate, horse stable,
 * open hay shed, board fence with one missing panel. Metres, Three.js Y up.
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

export const L = {
  site: { x0: -50, x1: 50, z0: -50, z1: 50 },
  /* Main living west of the split, floor at deck height. */
  main: {
    x0: -6.6, x1: 2.2, z0: -4.6, z1: 4.8, y0: 1.28, y1: 4.92,
  },
  /* Basement / walk-out, driveway side. Shares x=2.2 with main. */
  base: {
    x0: 2.2, x1: 6.8, z0: -4.6, z1: 4.8, h: 2.72,
  },
  house: {
    x0: -6.6, x1: 6.8, z0: -4.6, z1: 4.8, h: 4.92, t: 0.28,
  },
  porch: {
    x0: -5.2, x1: 2.2, z0: -8.8, z1: -4.6, y: 1.28, roof: 2.88,
  },
  deck: {
    x0: -5.6, x1: 1.8, z0: 4.8, z1: 9.5, y: 1.28, thick: 0.18,
  },
  garage: {
    x0: 6.8, x1: 10.6, z0: -1.2, z1: 4.8, h: 2.72,
  },
  drive: {
    x0: 10.6, x1: 15.2, z0: -44.0, z1: 6.5,
  },
  gate: {
    x0: 10.4, x1: 15.4, z: -42.0,
  },
  pad: {
    x0: -36.0, x1: 18.0, z0: -36.0, z1: 32.0,
  },
  gap: {
    x0: -4.8, x1: -2.4, z: -36.0,
  },
  stable: {
    x0: -34.0, x1: -19.0, z0: 12.0, z1: 24.0, h: 5.8, t: 0.28, loft: 2.88,
  },
  stalls: [
    { x0: -32.4, x1: -30.2 },
    { x0: -27.6, x1: -25.4 },
    { x0: -22.8, x1: -20.6 },
  ],
  aisle: { z0: 16.2, z1: 18.4 },
  hay: {
    x0: -32.0, x1: -20.0, z0: 24.0, z1: 30.5, h: 3.62, t: 0.22,
  },
  car: {
    x0: 12.3, x1: 14.2, z0: -6.0, z1: -1.5, h: 1.48,
  },
  spawn: { x: -1.6, z: 6.9, y: 1.28, yaw: 0 },
};

export function materials() {
  const t = PAL.shadowTint;
  return {
    creamSun: cel({ color: PAL.creamSun, bands: 3, tint: t }),
    cream: cel({ color: PAL.cream, bands: 2, tint: t }),
    creamShade: cel({ color: PAL.creamShade, bands: 2, tint: t }),
    roof: cel({ color: PAL.roof, bands: 2, tint: t }),
    roofSun: cel({ color: PAL.roofSun, bands: 2, tint: t }),
    grass: cel({ color: PAL.grass, bands: 2, tint: t }),
    grassSun: cel({ color: PAL.grassSun, bands: 2, tint: t }),
    dry: cel({ color: PAL.grassDry, bands: 2, tint: t }),
    hillShade: cel({ color: PAL.hillShade, bands: 2, tint: t }),
    barn: cel({ color: PAL.barn, bands: 2, tint: t }),
    barnShade: cel({ color: PAL.barnShade, bands: 2, tint: t }),
    wood: cel({ color: PAL.wood, bands: 2, tint: t }),
    woodSun: cel({ color: PAL.woodSun, bands: 2, tint: t }),
    woodDark: cel({ color: PAL.woodDark, bands: 2, tint: t }),
    asphalt: cel({ color: PAL.asphalt, bands: 2, tint: t }),
    gravel: cel({ color: PAL.gravel, bands: 2, tint: t }),
    steel: cel({ color: PAL.steel, bands: 2, tint: t }),
    steelDark: cel({ color: PAL.steelDark, bands: 2, tint: t }),
    leaf: cel({ color: PAL.leaf, bands: 2, tint: t }),
    leafSun: cel({ color: PAL.leafSun, bands: 2, tint: t }),
    leafDark: cel({ color: PAL.leafDark, bands: 2, tint: t }),
    hay: cel({ color: PAL.hay, bands: 2, tint: t }),
    hayShade: cel({ color: PAL.hayShade, bands: 2, tint: t }),
    litter: cel({ color: PAL.litter, bands: 2, tint: t }),
    pane: flat({ color: PAL.glassDark }),
    lamp: flat({ color: PAL.white }),
    white: flat({ color: PAL.white }),
    tire: flat({ color: PAL.tire }),
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

/* Stepped gable along X. Each tread shares a Y face with the one below.
 * Inset is on Z so the ridge reads as a roof, not a second storey. */
export function gableX(root, colliders, platforms, mat, x0, z0, x1, z1, eave, ridge, steps = 3) {
  const za = Math.min(z0, z1);
  const zb = Math.max(z0, z1);
  const mid = (za + zb) * 0.5;
  const half = (zb - za) * 0.5;
  const dh = (ridge - eave) / steps;
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    const inset = half * t * 0.72;
    const top = eave + (i + 1) * dh;
    const thick = dh;
    deck(root, colliders, platforms, mat, x0, mid - half + inset, x1, mid + half - inset, top, thick);
  }
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

export function deckAround(root, colliders, platforms, mat, x0, z0, x1, z1, top, thick, holes) {
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
      deck(root, colliders, platforms, mat, xa, za, xb, zb, top, thick);
    }
  }
}

function uniq(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i += 1) {
    if (i === 0 || arr[i] - arr[i - 1] > 0.001) {
      out.push(arr[i]);
    }
  }
  return out;
}

/* Wall in XY, thickness along Z. Holes are { x0, x1, y0, y1 }. */
export function punchedZ(root, colliders, mat, x0, y0, x1, y1, z0, z1, holes, opts) {
  const xs = [x0, x1];
  const ys = [y0, y1];
  for (const hole of holes) {
    xs.push(hole.x0, hole.x1);
    ys.push(hole.y0, hole.y1);
  }
  const ux = uniq(xs.sort((a, b) => a - b));
  const uy = uniq(ys.sort((a, b) => a - b));
  const o = opts || {};
  for (let i = 0; i < ux.length - 1; i += 1) {
    for (let j = 0; j < uy.length - 1; j += 1) {
      const xa = ux[i];
      const xb = ux[i + 1];
      const ya = uy[j];
      const yb = uy[j + 1];
      if (xb - xa < 0.05 || yb - ya < 0.05) {
        continue;
      }
      const mx = (xa + xb) * 0.5;
      const my = (ya + yb) * 0.5;
      if (holes.some((h) => mx > h.x0 && mx < h.x1 && my > h.y0 && my < h.y1)) {
        continue;
      }
      slab(root, colliders, mat, xa, ya, z0, xb, yb, z1, o);
    }
  }
}

/* Wall in ZY, thickness along X. Holes are { z0, z1, y0, y1 }. */
export function punchedX(root, colliders, mat, z0, y0, z1, y1, x0, x1, holes, opts) {
  const zs = [z0, z1];
  const ys = [y0, y1];
  for (const hole of holes) {
    zs.push(hole.z0, hole.z1);
    ys.push(hole.y0, hole.y1);
  }
  const uz = uniq(zs.sort((a, b) => a - b));
  const uy = uniq(ys.sort((a, b) => a - b));
  const o = opts || {};
  for (let i = 0; i < uz.length - 1; i += 1) {
    for (let j = 0; j < uy.length - 1; j += 1) {
      const za = uz[i];
      const zb = uz[i + 1];
      const ya = uy[j];
      const yb = uy[j + 1];
      if (zb - za < 0.05 || yb - ya < 0.05) {
        continue;
      }
      const mz = (za + zb) * 0.5;
      const my = (ya + yb) * 0.5;
      if (holes.some((h) => mz > h.z0 && mz < h.z1 && my > h.y0 && my < h.y1)) {
        continue;
      }
      slab(root, colliders, mat, x0, ya, za, x1, yb, zb, o);
    }
  }
}
