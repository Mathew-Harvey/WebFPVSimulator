/*
 * hall.js: the packhouse the kiln runs through.
 *
 * One barn, not a second map. South and north walls are missing a 12 m
 * mouth each, full height, no lintel. Those long walls own the corners.
 * West and east walls stop at z0+t / z1-t and are missing the kiln
 * envelope from the floor up, so the undercroft and the bore are the
 * same opening. A shared face is fine. A shared volume is a spaz.
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
import { L, slab, deck, decal } from './kit.js';
import { PAL } from './palette.js';
import { flat } from './cel/toon.js';

export function buildHall(root, colliders, platforms, M) {
  const { x0, x1, z0, z1, h, t, door } = L.pack;
  const slotZ = L.kiln.inner * 0.5 + L.kiln.wall;
  const slotTop = L.kiln.y0 + L.kiln.inner + L.kiln.wall;

  punchedWall(root, colliders, M.mint, x0, 0, z0, -door, h, z0 + t, [
    { x0: -22.2, x1: -19.6, y0: 9.5, y1: 12.2 },
    { x0: -17.7, x1: -14.3, y0: 0, y1: h },
  ]);
  punchedWall(root, colliders, M.mint, door, 0, z0, x1, h, z0 + t, []);
  punchedWall(root, colliders, M.mint, x0, 0, z1 - t, -door, h, z1, []);
  punchedWall(root, colliders, M.mint, door, 0, z1 - t, x1, h, z1, [
    { x0: 19.6, x1: 22.2, y0: 9.5, y1: 12.2 },
  ]);
  slotWall(root, colliders, M.mint, x0, x0 + t, z0 + t, z1 - t, h, slotZ, slotTop, {});
  slotWall(root, colliders, M.mint, x1 - t, x1, z0 + t, z1 - t, h, slotZ, slotTop, {});

  const holes = [
    { x0: -17.4, x1: -8.2, z0: 2.55, z1: 6.45 },
    { x0: -15.2, x1: -10.6, z0: 1.85, z1: 2.55 },
    { x0: 8.2, x1: 17.4, z0: -6.45, z1: -2.55 },
    { x0: 10.6, x1: 15.2, z0: -2.55, z1: -1.85 },
  ];
  roofWithHoles(root, colliders, platforms, M, x0 + t, x1 - t, z0 + t, z1 - t, h, holes);

  for (let x = x0 + 4; x < x1 - 2; x += 4) {
    const a = x - 0.28;
    const b = x + 0.28;
    if (holes.some((hole) => a < hole.x1 && b > hole.x0)) {
      continue;
    }
    slab(root, colliders, M.steelDark, a, h - 1.22, z0 + t, b, h - 0.3, z1 - t);
  }
  slab(root, colliders, M.rust, -8.4, 13.4, 3.2, -7.7, 15.6, 5.8, { solid: false, cast: true });
  slab(root, colliders, M.rust, 7.7, 13.4, -5.8, 8.4, 15.6, -3.2, { solid: false, cast: true });

  lineHall(root, colliders, M, x0, x1, z0, z1, h, t, door, slotZ, slotTop);
  skinHall(root, colliders, M, x0, x1, z0, z1, h, t, door, slotZ);
  lightWells(root, colliders, M, holes, h);
  paintHall(root, x0, x1, z0, z1, t, door);
  rigHall(root, colliders, platforms, M, x0, x1, z0, z1, h, t, door, slotZ);
}

function punchedWall(root, colliders, mat, x0, y0, z0, x1, y1, z1, holes, opts) {
  const xs = [x0, x1];
  const ys = [y0, y1];
  for (const hole of holes) {
    xs.push(hole.x0, hole.x1);
    ys.push(hole.y0, hole.y1);
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const ux = uniq(xs);
  const uy = uniq(ys);
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
      if (holes.some((hole) => mx > hole.x0 && mx < hole.x1 && my > hole.y0 && my < hole.y1)) {
        continue;
      }
      slab(root, colliders, mat, xa, ya, z0, xb, yb, z1, o);
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

function slotWall(root, colliders, mat, xa, xb, zA, zB, h, slotZ, slotTop, opts) {
  const o = opts || {};
  slab(root, colliders, mat, xa, 0, zA, xb, h, -slotZ, o);
  slab(root, colliders, mat, xa, 0, slotZ, xb, h, zB, o);
  slab(root, colliders, mat, xa, slotTop, -slotZ, xb, h, slotZ, o);
}

function rigHall(root, colliders, platforms, M, x0, x1, z0, z1, h, t, door, slotZ) {
  decal(root, colliders, M.boneSun, x0 + t, 0.02, z0 + t, x1 - t, 0.08, z1 - t);

  for (const x of [-door - 0.12, door]) {
    decal(root, colliders, M.safety, x, 0.2, z1, x + 0.12, h - 0.4, z1 + 0.08);
    decal(root, colliders, M.inkFlat, x + 0.03, 0.2, z1 + 0.06, x + 0.09, h - 0.4, z1 + 0.1);
  }
  for (const x of [-door - 0.12, door]) {
    decal(root, colliders, M.safety, x, 0.2, z0 - 0.08, x + 0.12, h - 0.4, z0);
  }

  machine(root, colliders, M, -23.3, 5.7);
  machine(root, colliders, M, 15.0, 5.7);

  const segsS = [
    [-26.2, -20.4], [-17.8, -12.2], [12.2, 17.8], [20.4, 26.2],
  ];
  const segsN = [
    [-26.2, -17.85], [-14.15, -10.4], [12.2, 17.8], [20.4, 26.2],
  ];
  for (const [a, b] of segsS) {
    deck(root, colliders, platforms, M.steel, a, 3.05, b, 6.55, 4.5, 0.2);
    slab(root, colliders, M.steelDark, a, 0, 3.15, a + 0.22, 4.3, 3.37);
    slab(root, colliders, M.steelDark, b - 0.22, 0, 6.33, b, 4.3, 6.55);
  }
  for (const [a, b] of segsN) {
    if (b - a < 1.2) {
      continue;
    }
    deck(root, colliders, platforms, M.steel, a, -6.55, b, -3.05, 4.5, 0.2);
    slab(root, colliders, M.steelDark, a, 0, -3.37, a + 0.22, 4.3, -3.15);
    slab(root, colliders, M.steelDark, b - 0.22, 0, -6.55, b, 4.3, -6.33);
  }

  deck(root, colliders, platforms, M.steel, -23.15, -6.55, -20.85, -2.55, 9.0, 0.2);
  deck(root, colliders, platforms, M.steel, 16.85, -6.55, 19.15, -2.55, 9.0, 0.2);
  deck(root, colliders, platforms, M.steel, -19.15, 2.55, -16.85, 6.55, 9.0, 0.2);
  deck(root, colliders, platforms, M.steel, 16.85, 2.55, 19.15, 6.55, 9.0, 0.2);
  slab(root, colliders, M.steelDark, -22.18, 4.5, -6.55, -21.82, 5.98, -6.25);
  slab(root, colliders, M.steelDark, -22.18, 6.18, -6.55, -21.82, 8.8, -6.25);
  slab(root, colliders, M.steelDark, 17.82, 4.5, -6.55, 18.18, 5.98, -6.25);
  slab(root, colliders, M.steelDark, 17.82, 6.18, -6.55, 18.18, 8.8, -6.25);
  slab(root, colliders, M.steelDark, -18.18, 4.5, 6.25, -17.82, 8.8, 6.55);
  slab(root, colliders, M.steelDark, 17.82, 4.5, 6.25, 18.18, 8.8, 6.55);

  deck(root, colliders, platforms, M.bone, -26.2, -6.55, -17.85, -5.15, 6.2, 0.22);
  deck(root, colliders, platforms, M.bone, -14.15, -6.55, -10.4, -5.15, 6.2, 0.22);
  deck(root, colliders, platforms, M.bone, 10.4, -6.55, 26.2, -5.15, 6.2, 0.22);
  slab(root, colliders, M.litter, -12.6, 6.2, -6.55, -10.5, 7.15, -5.15, { kind: 'obstacle' });
  slab(root, colliders, M.boneSun, 12.8, 6.2, -6.55, 15.0, 7.0, -5.15, { kind: 'obstacle' });

  collar(root, colliders, M, x0 + t + 0.08, slotZ);
  collar(root, colliders, M, 23.4, slotZ);

  slab(root, colliders, M.litter, -17.7, 0, 5.15, -12.64, 0.7, 6.55, { kind: 'obstacle' });
  slab(root, colliders, M.rust, -17.2, 0.7, 5.35, -12.84, 1.25, 6.55, { kind: 'obstacle' });
  slab(root, colliders, M.litter, 10.4, 0, -6.55, 14.8, 0.65, -5.15, { kind: 'obstacle' });
  slab(root, colliders, M.steelDark, 11.2, 0.65, -6.55, 13.6, 1.2, -5.35, { kind: 'obstacle' });

  machine(root, colliders, M, -23.3, -5.7);
  machine(root, colliders, M, 23.3, -5.7);

  decal(root, colliders, M.steelDark, -door, h - 0.72, z1, door, h - 0.14, z1 + 0.2);
  decal(root, colliders, M.safety, -door, h - 0.58, z1 + 0.16, door, h - 0.28, z1 + 0.24);
  decal(root, colliders, M.inkFlat, -door + 0.4, h - 0.52, z1 + 0.2, -door + 1.1, h - 0.34, z1 + 0.26);
  decal(root, colliders, M.rust, -3.4, 11.4, z0 - 0.18, 1.6, 14.6, z0);
  decal(root, colliders, M.steelDark, 2.2, 13.0, z0 - 0.14, 5.4, 15.7, z0);

  frameHole(root, colliders, M, -22.2, 9.5, z0, -19.6, 12.2, z0 + t);
  frameHole(root, colliders, M, -17.7, 0, z0, -14.3, h, z0 + t);
  frameHole(root, colliders, M, 19.6, 9.5, z1 - t, 22.2, 12.2, z1);
}

function machine(root, colliders, M, x, z) {
  slab(root, colliders, M.steelDark, x - 1.15, 0, z - 0.85, x + 1.15, 1.45, z + 0.85, { kind: 'obstacle' });
  slab(root, colliders, M.steel, x - 0.95, 1.45, z - 0.85, x + 0.95, 2.55, z + 0.85, { kind: 'obstacle' });
  slab(root, colliders, M.safety, x - 0.7, 1.7, z + 0.85, x + 0.7, 2.35, z + 0.97, { solid: false });
  slab(root, colliders, M.rust, x - 0.55, 2.55, z - 0.85, x + 0.55, 2.85, z + 0.85, { kind: 'obstacle' });
}

function collar(root, colliders, M, x, slotZ) {
  const y0 = L.kiln.y0;
  const y1 = y0 + L.kiln.inner;
  const yBot = y0 - L.kiln.wall;
  const yTop = y1 + L.kiln.wall;
  slab(root, colliders, M.bone, x, yBot - 0.35, -slotZ - 0.55, x + 0.55, yBot, slotZ + 0.55);
  slab(root, colliders, M.bone, x, yTop, -slotZ - 0.55, x + 0.55, yTop + 0.35, slotZ + 0.55);
  slab(root, colliders, M.bone, x, yBot, slotZ, x + 0.55, y0, slotZ + 0.55);
  slab(root, colliders, M.bone, x, yBot, -slotZ - 0.55, x + 0.55, y0, -slotZ);
  slab(root, colliders, M.bone, x, y1, slotZ, x + 0.55, yTop, slotZ + 0.55);
  slab(root, colliders, M.bone, x, y1, -slotZ - 0.55, x + 0.55, yTop, -slotZ);
  slab(root, colliders, M.rust, x, y0, slotZ, x + 0.55, y1, slotZ + 0.55);
  slab(root, colliders, M.rust, x, y0, -slotZ - 0.55, x + 0.55, y1, -slotZ);
}

function frameHole(root, colliders, M, x0, y0, z0, x1, y1, z1) {
  const f = 0.12;
  decal(root, colliders, M.steelDark, x0, y0, z0, x0 + f, y1, z1);
  decal(root, colliders, M.steelDark, x1 - f, y0, z0, x1, y1, z1);
  decal(root, colliders, M.steelDark, x0, y0, z0, x1, y0 + f, z1);
  decal(root, colliders, M.steelDark, x0, y1 - f, z0, x1, y1, z1);
}

function lineHall(root, colliders, M, x0, x1, z0, z1, h, t, door, slotZ, slotTop) {
  const d = 0.14;
  const skin = { solid: false, cast: false, noShadow: true };
  slotWall(root, colliders, M.boneSun, x0 + t, x0 + t + d, z0 + t, z1 - t, h - 0.2, slotZ, slotTop, skin);
  slotWall(root, colliders, M.boneSun, x1 - t - d, x1 - t, z0 + t, z1 - t, h - 0.2, slotZ, slotTop, skin);
  punchedWall(root, colliders, M.boneSun, x0 + t, 0.02, z0 + t, -door, h - 0.2, z0 + t + d, [
    { x0: -22.2, x1: -19.6, y0: 9.5, y1: 12.2 },
    { x0: -17.7, x1: -14.3, y0: 0, y1: h },
  ], skin);
  punchedWall(root, colliders, M.boneSun, door, 0.02, z0 + t, x1 - t, h - 0.2, z0 + t + d, [], skin);
  punchedWall(root, colliders, M.boneSun, x0 + t, 0.02, z1 - t - d, -door, h - 0.2, z1 - t, [], skin);
  punchedWall(root, colliders, M.boneSun, door, 0.02, z1 - t - d, x1 - t, h - 0.2, z1 - t, [
    { x0: 19.6, x1: 22.2, y0: 9.5, y1: 12.2 },
  ], skin);
}

function skinHall(root, colliders, M, x0, x1, z0, z1, h, t, door, slotZ) {
  const plinth = 2.4;
  const face = 0.08;
  decal(root, colliders, M.bone, x0 - face, 0, z0 - face, -door, plinth, z0 + 0.02);
  decal(root, colliders, M.bone, door, 0, z0 - face, x1 + face, plinth, z0 + 0.02);
  decal(root, colliders, M.bone, x0 - face, 0, z1 - 0.02, -door, plinth, z1 + face);
  decal(root, colliders, M.bone, door, 0, z1 - 0.02, x1 + face, plinth, z1 + face);
  decal(root, colliders, M.bone, x0 - face, 0, z0, x0 + 0.02, plinth, -slotZ);
  decal(root, colliders, M.bone, x0 - face, 0, slotZ, x0 + 0.02, plinth, z1);
  decal(root, colliders, M.bone, x1 - 0.02, 0, z0, x1 + face, plinth, -slotZ);
  decal(root, colliders, M.bone, x1 - 0.02, 0, slotZ, x1 + face, plinth, z1);

  const wy0 = 9.5;
  const wy1 = 12.5;
  windowBand(root, colliders, M, x0 + 1.2, z1 + 0.06, -door - 0.4, wy0, wy1);
  windowBand(root, colliders, M, door + 0.4, z1 + 0.06, 19.4, wy0, wy1);
  windowBand(root, colliders, M, 22.4, z1 + 0.06, x1 - 1.2, wy0, wy1);
  windowBand(root, colliders, M, x0 + 1.2, z0 - 0.06, -22.4, wy0, wy1);
  windowBand(root, colliders, M, -19.4, z0 - 0.06, -17.85, wy0, wy1);
  windowBand(root, colliders, M, -14.15, z0 - 0.06, -door - 0.4, wy0, wy1);
  windowBand(root, colliders, M, door + 0.4, z0 - 0.06, x1 - 1.2, wy0, wy1);

  decal(root, colliders, M.steelDark, x0 - 0.06, h - 0.45, z0 - 0.06, -door, h + 0.12, z0 + t);
  decal(root, colliders, M.steelDark, door, h - 0.45, z0 - 0.06, x1 + 0.06, h + 0.12, z0 + t);
  decal(root, colliders, M.steelDark, x0 - 0.06, h - 0.45, z1 - t, -door, h + 0.12, z1 + 0.06);
  decal(root, colliders, M.steelDark, door, h - 0.45, z1 - t, x1 + 0.06, h + 0.12, z1 + 0.06);
}

function windowBand(root, colliders, M, x0, z, x1, y0, y1) {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  if (xb - xa < 1) {
    return;
  }
  const z0 = z < 0 ? z - 0.05 : z;
  const z1 = z < 0 ? z : z + 0.05;
  decal(root, colliders, M.pane, xa, y0, z0, xb, y1, z1);
  decal(root, colliders, M.steelDark, xa, y0 - 0.22, z0 - 0.06, xb, y0, z1 + 0.06);
  for (let x = xa + 4; x < xb - 0.5; x += 4) {
    decal(root, colliders, M.steelDark, x - 0.1, y0 - 0.08, z0 - 0.02, x + 0.1, y1 + 0.08, z1 + 0.02);
  }
  let drip = 0;
  for (let x = xa + 2; x < xb - 0.5; x += 8) {
    if ((drip & 1) === 0) {
      decal(root, colliders, M.rust, x - 0.12, y0 - 2.2, z0, x + 0.12, y0, z1);
    }
    drip += 1;
  }
}

function lightWells(root, colliders, M, holes, top) {
  const drop = 0.35;
  const th = 0.1;
  for (const hole of holes) {
    decal(root, colliders, M.rust, hole.x0, top - drop, hole.z0, hole.x1, top, hole.z0 + th);
    decal(root, colliders, M.rust, hole.x0, top - drop, hole.z1 - th, hole.x1, top, hole.z1);
    decal(root, colliders, M.rust, hole.x0, top - drop, hole.z0, hole.x0 + th, top, hole.z1);
    decal(root, colliders, M.rust, hole.x1 - th, top - drop, hole.z0, hole.x1, top, hole.z1);
  }
}

function inHole(x, z, holes) {
  for (const h of holes) {
    if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) {
      return true;
    }
  }
  return false;
}

function roofWithHoles(root, colliders, platforms, M, x0, x1, z0, z1, top, holes) {
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
      if (inHole(mx, mz, holes)) {
        continue;
      }
      deck(root, colliders, platforms, M.bone, xa, za, xb, zb, top);
    }
  }
  for (const hole of holes) {
    decal(root, colliders, M.rust, hole.x0, top, hole.z0, hole.x1, top + 0.06, hole.z0 + 0.16);
    decal(root, colliders, M.rust, hole.x0, top, hole.z1 - 0.16, hole.x1, top + 0.06, hole.z1);
    decal(root, colliders, M.rust, hole.x0, top, hole.z0, hole.x0 + 0.16, top + 0.06, hole.z1);
    decal(root, colliders, M.rust, hole.x1 - 0.16, top, hole.z0, hole.x1, top + 0.06, hole.z1);
  }
}

function hex(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function paint(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function sticker(root, tex, x, y, z, w, h, yaw) {
  const mat = flat({
    map: tex,
    transparent: true,
    alphaTest: 0.12,
    side: THREE.FrontSide,
    fog: true,
    cache: false,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noMerge = true;
  mesh.userData.noShadow = true;
  root.add(mesh);
}

function drips(ctx, x, y, w, h, color, n) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i += 1) {
    const dx = x + (w * (i + 0.35)) / n;
    const drop = h * (0.35 + ((i * 17) % 5) * 0.12);
    const tw = 3 + (i % 3);
    ctx.fillRect(dx, y, tw, drop);
    ctx.beginPath();
    ctx.arc(dx + tw * 0.5, y + drop, tw * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function speckle(ctx, x, y, w, h, color, n) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i += 1) {
    const px = x + ((i * 47) % w);
    const py = y + ((i * 31) % h);
    ctx.globalAlpha = 0.35 + (i % 4) * 0.1;
    ctx.fillRect(px, py, 2 + (i % 3), 2);
  }
  ctx.globalAlpha = 1;
}

function bar(ctx, x, y, w, h) {
  ctx.fillRect(x, y, w, h);
}

function paintHall(root, x0, x1, z0, z1, t, door) {
  const rust = hex(PAL.rust);
  const ink = hex(PAL.ink);
  const safety = hex(PAL.safety);
  const mint = hex(PAL.mint);
  const ochre = hex(PAL.ochre);
  const bone = hex(PAL.boneSun);

  const bando = paint(512, 256, (c) => {
    c.save();
    c.translate(24, 20);
    c.rotate(-0.05);
    c.fillStyle = rust;
    bar(c, 8, 18, 22, 110);
    bar(c, 8, 18, 62, 22);
    bar(c, 8, 62, 54, 20);
    bar(c, 8, 106, 62, 22);
    bar(c, 54, 40, 18, 22);
    bar(c, 54, 84, 18, 22);
    bar(c, 92, 18, 22, 110);
    bar(c, 114, 18, 48, 22);
    bar(c, 140, 40, 22, 88);
    bar(c, 114, 106, 48, 22);
    bar(c, 186, 18, 22, 110);
    bar(c, 208, 18, 18, 110);
    bar(c, 248, 18, 22, 110);
    bar(c, 248, 106, 58, 22);
    bar(c, 328, 18, 70, 22);
    bar(c, 328, 18, 22, 110);
    bar(c, 376, 18, 22, 110);
    bar(c, 328, 106, 70, 22);
    c.restore();
    drips(c, 16, 148, 460, 90, rust, 8);
    speckle(c, 0, 0, 512, 256, ink, 40);
  });

  const keep = paint(384, 256, (c) => {
    c.fillStyle = ink;
    c.globalAlpha = 0.55;
    c.fillRect(12, 12, 360, 232);
    c.globalAlpha = 1;
    c.fillStyle = rust;
    bar(c, 40, 40, 18, 70);
    bar(c, 40, 40, 48, 16);
    bar(c, 70, 56, 16, 54);
    bar(c, 96, 40, 18, 70);
    bar(c, 96, 40, 40, 16);
    bar(c, 96, 94, 40, 16);
    bar(c, 150, 40, 18, 70);
    bar(c, 150, 40, 44, 16);
    bar(c, 176, 56, 18, 54);
    bar(c, 208, 40, 18, 70);
    bar(c, 208, 94, 40, 16);
    bar(c, 70, 140, 18, 70);
    bar(c, 70, 140, 48, 16);
    bar(c, 70, 194, 48, 16);
    bar(c, 70, 166, 40, 16);
    bar(c, 132, 140, 18, 70);
    bar(c, 150, 140, 18, 28);
    bar(c, 168, 140, 18, 70);
    bar(c, 200, 140, 18, 70);
    bar(c, 200, 194, 48, 16);
    drips(c, 30, 214, 320, 36, rust, 5);
  });

  const throwUp = paint(384, 256, (c) => {
    c.fillStyle = safety;
    c.beginPath();
    c.moveTo(28, 160);
    c.quadraticCurveTo(18, 36, 110, 44);
    c.quadraticCurveTo(200, 12, 286, 52);
    c.quadraticCurveTo(368, 88, 348, 176);
    c.quadraticCurveTo(300, 236, 176, 228);
    c.quadraticCurveTo(56, 238, 28, 160);
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 14;
    c.stroke();
    c.fillStyle = ink;
    bar(c, 70, 78, 22, 96);
    bar(c, 70, 78, 52, 20);
    bar(c, 100, 112, 22, 28);
    bar(c, 70, 154, 52, 20);
    bar(c, 148, 78, 22, 96);
    bar(c, 170, 78, 18, 96);
    bar(c, 210, 78, 22, 96);
    bar(c, 210, 78, 48, 20);
    bar(c, 232, 98, 22, 76);
    bar(c, 210, 154, 48, 20);
    speckle(c, 20, 20, 340, 210, rust, 28);
  });

  const stencil = paint(256, 256, (c) => {
    c.fillStyle = mint;
    c.globalAlpha = 0.4;
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        if (((row * 8 + col) * 13) % 5 === 0) {
          c.fillRect(16 + col * 28, 16 + row * 28, 18, 18);
        }
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = ink;
    bar(c, 48, 48, 28, 140);
    bar(c, 48, 48, 72, 28);
    bar(c, 92, 76, 28, 112);
    bar(c, 48, 160, 72, 28);
    bar(c, 140, 48, 28, 140);
    bar(c, 140, 48, 72, 28);
    bar(c, 184, 76, 28, 112);
    bar(c, 140, 160, 72, 28);
  });

  const noFly = paint(256, 256, (c) => {
    c.strokeStyle = rust;
    c.lineWidth = 18;
    c.beginPath();
    c.arc(128, 128, 92, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(62, 62);
    c.lineTo(194, 194);
    c.stroke();
    c.fillStyle = ochre;
    bar(c, 88, 100, 18, 52);
    bar(c, 106, 100, 16, 22);
    bar(c, 122, 100, 18, 52);
    bar(c, 148, 100, 18, 52);
    bar(c, 148, 100, 28, 16);
    bar(c, 162, 116, 16, 36);
    bar(c, 148, 136, 28, 16);
  });

  const ticks = paint(256, 128, (c) => {
    c.fillStyle = mint;
    for (let i = 0; i < 9; i += 1) {
      const x = 16 + i * 26;
      c.fillRect(x, 18 + (i % 3) * 8, 14, 72 - (i % 4) * 10);
    }
    c.fillStyle = ochre;
    c.globalAlpha = 0.7;
    c.fillRect(10, 86, 228, 12);
    c.globalAlpha = 1;
  });

  const wash = paint(128, 384, (c) => {
    drips(c, 16, 0, 96, 360, rust, 6);
    c.fillStyle = ink;
    c.globalAlpha = 0.3;
    c.fillRect(44, 36, 22, 300);
    speckle(c, 0, 0, 128, 384, rust, 24);
  });

  const mascot = paint(384, 384, (c) => {
    c.fillStyle = rust;
    c.beginPath();
    c.ellipse(192, 168, 110, 96, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = safety;
    bar(c, 150, 36, 28, 70);
    bar(c, 186, 18, 28, 88);
    bar(c, 222, 36, 28, 70);
    c.fillStyle = ink;
    c.beginPath();
    c.ellipse(150, 150, 22, 28, 0, 0, Math.PI * 2);
    c.ellipse(234, 150, 22, 28, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = bone;
    c.beginPath();
    c.ellipse(150, 150, 8, 10, 0, 0, Math.PI * 2);
    c.ellipse(234, 150, 8, 10, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = ink;
    bar(c, 176, 188, 32, 36);
    c.fillStyle = safety;
    bar(c, 132, 248, 120, 22);
    c.fillStyle = rust;
    bar(c, 148, 282, 22, 48);
    bar(c, 214, 282, 22, 48);
    drips(c, 80, 300, 220, 70, rust, 6);
    speckle(c, 40, 40, 300, 300, ink, 36);
  });

  const stamp = paint(320, 160, (c) => {
    c.fillStyle = safety;
    c.globalAlpha = 0.92;
    c.fillRect(8, 18, 304, 124);
    c.globalAlpha = 1;
    c.fillStyle = ink;
    c.fillRect(20, 32, 280, 96);
    c.fillStyle = rust;
    bar(c, 36, 52, 18, 56);
    bar(c, 36, 52, 44, 14);
    bar(c, 62, 66, 14, 42);
    bar(c, 88, 52, 18, 56);
    bar(c, 88, 94, 40, 14);
    bar(c, 140, 52, 18, 56);
    bar(c, 158, 52, 14, 22);
    bar(c, 176, 52, 18, 56);
    bar(c, 206, 52, 18, 56);
    bar(c, 206, 52, 40, 14);
    bar(c, 206, 76, 32, 12);
    bar(c, 206, 94, 40, 14);
    bar(c, 258, 52, 18, 56);
    bar(c, 258, 94, 42, 14);
  });

  const crown = paint(256, 192, (c) => {
    c.fillStyle = safety;
    c.beginPath();
    c.moveTo(28, 140);
    c.lineTo(48, 48);
    c.lineTo(88, 110);
    c.lineTo(128, 32);
    c.lineTo(168, 110);
    c.lineTo(208, 48);
    c.lineTo(228, 140);
    c.closePath();
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 10;
    c.stroke();
    drips(c, 40, 140, 180, 40, safety, 4);
  });

  const skin = 0.17;
  const innerS = z1 - t - skin;
  const innerN = z0 + t + skin;
  const innerW = x0 + t + skin;
  const innerE = x1 - t - skin;
  const outerS = z1 + 0.04;
  const outerN = z0 - 0.04;

  sticker(root, mascot, -door - 4.2, 5.4, innerS, 7.6, 7.6, Math.PI);
  sticker(root, stamp, -door - 4.0, 8.6, innerS + 0.02, 4.4, 2.2, Math.PI);
  sticker(root, bando, door + 6.4, 6.8, innerS, 8.8, 4.4, Math.PI);
  sticker(root, throwUp, door + 4.6, 3.2, innerS, 3.4, 2.2, Math.PI);
  sticker(root, keep, -door - 5.0, 3.8, innerN, 5.0, 3.3, 0);
  sticker(root, stencil, door + 5.2, 5.6, innerN, 2.4, 2.4, 0);
  sticker(root, noFly, door + 8.4, 3.4, innerN, 1.8, 1.8, 0);
  sticker(root, wash, innerW, 6.2, -4.8, 1.8, 5.6, Math.PI * 0.5);
  sticker(root, ticks, innerW, 2.6, 4.4, 2.8, 1.4, Math.PI * 0.5);
  sticker(root, crown, innerE, 7.2, -4.6, 4.4, 3.2, -Math.PI * 0.5);
  sticker(root, mascot, innerE, 4.2, 4.8, 3.2, 3.2, -Math.PI * 0.5);
  sticker(root, bando, -door - 6.4, 6.4, outerS, 9.2, 4.6, 0);
  sticker(root, stamp, 3.2, 9.4, outerS, 5.2, 2.4, 0);
  sticker(root, throwUp, door + 6.2, 3.8, outerS, 4.2, 2.8, 0);
  sticker(root, crown, -door - 7.2, 8.8, outerN, 3.2, 2.4, Math.PI);
  sticker(root, ticks, door + 7.6, 3.0, outerN, 2.2, 1.1, Math.PI);
}
