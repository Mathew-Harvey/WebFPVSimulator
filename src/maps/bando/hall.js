/*
 * hall.js: the packhouse the kiln runs through.
 *
 * One barn, not a second map. Missing south wall is the spawn mouth.
 * Missing roof bays light the floor as graphic pools. The kiln tube is
 * plant.js; this file is the skin, the rafters and the columns.
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
import { L, slab, deck, decal, pipe } from './kit.js';

export function buildHall(root, colliders, platforms, M) {
  const { x0, x1, z0, z1, h } = L.pack;
  const t = 0.45;
  const door = 2.5;
  const kilnZ = L.kiln.inner * 0.5 + L.kiln.wall;
  const kilnY0 = L.kiln.y0;
  const kilnY1 = L.kiln.y0 + L.kiln.inner;

  kilnWall(root, colliders, M.mint, x0, x0 + t, z0, z1, h, kilnZ, kilnY0, kilnY1, {});
  kilnWall(root, colliders, M.mint, x1 - t, x1, z0, z1, h, kilnZ, kilnY0, kilnY1, {});
  decal(root, colliders, M.steelDark, x1, kilnY0 - 0.28, -kilnZ - 0.22, x1 + 0.1, kilnY0, kilnZ + 0.22);
  decal(root, colliders, M.steelDark, x1, kilnY1, -kilnZ - 0.22, x1 + 0.1, kilnY1 + 0.28, kilnZ + 0.22);
  decal(root, colliders, M.steelDark, x1, kilnY0, -kilnZ - 0.22, x1 + 0.1, kilnY1, -kilnZ);
  decal(root, colliders, M.steelDark, x1, kilnY0, kilnZ, x1 + 0.1, kilnY1, kilnZ + 0.22);

  slab(root, colliders, M.mint, x0, 0, z0, x1, h, z0 + t);
  slab(root, colliders, M.mint, x0, 0, z1 - t, -door, h, z1);
  slab(root, colliders, M.mint, door, 0, z1 - t, x1, h, z1);
  slab(root, colliders, M.steelDark, -door, 5.55, z1 - t - 0.08, door, 6.45, z1 + 0.12);
  slab(root, colliders, M.steelDark, -door - 0.38, 0, z1 - t - 0.08, -door, h, z1 + 0.12);
  slab(root, colliders, M.steelDark, door, 0, z1 - t - 0.08, door + 0.38, h, z1 + 0.12);

  const holes = [
    { x0: -16, x1: -8, z0: -3.5, z1: 3.5 },
    { x0: 8, x1: 16, z0: -3.5, z1: 3.5 },
  ];
  roofWithHoles(root, colliders, platforms, M, x0 + t, x1 - t, z0 + t, z1 - t, h, holes);

  for (let x = x0 + 4; x < x1 - 2; x += 4) {
    const a = x - 0.28;
    const b = x + 0.28;
    if (holes.some((hole) => a < hole.x1 && b > hole.x0)) {
      continue;
    }
    slab(root, colliders, M.steelDark, a, h - 1.05, z0 + t, b, h - 0.28, z1 - t);
  }

  const cols = [
    [-14, -4], [-14, 4], [0, -4], [0, 4], [14, -4], [14, 4],
  ];
  for (const [cx, cz] of cols) {
    slab(root, colliders, M.bone, cx - 0.8, 0, cz - 0.8, cx + 0.8, 0.32, cz + 0.8);
    slab(root, colliders, M.boneSun, cx - 0.6, 0.32, cz - 0.6, cx + 0.6, h - 0.3, cz + 0.6);
    slab(root, colliders, M.steelDark, cx - 0.7, h - 0.55, cz - 0.7, cx + 0.7, h - 0.22, cz + 0.7);
  }

  lineHall(root, colliders, M, x0, x1, z0, z1, h, t, door, kilnZ, kilnY0, kilnY1);
  skinHall(root, colliders, M, x0, x1, z0, z1, h, t, door);
  lightWells(root, colliders, M, holes, h);

  addPool(root, M, -12, 0, 6.2, 3.6);
  addPool(root, M, 12, 0, 6.2, 3.6);

  furnishHall(root, colliders, platforms, M, x0, x1, z0, z1, t);
}

function kilnWall(root, colliders, mat, xa, xb, z0, z1, h, kilnZ, kilnY0, kilnY1, opts) {
  const o = opts || {};
  slab(root, colliders, mat, xa, 0, z0, xb, h, -kilnZ, o);
  slab(root, colliders, mat, xa, 0, kilnZ, xb, h, z1, o);
  slab(root, colliders, mat, xa, 0, -kilnZ, xb, kilnY0, kilnZ, o);
  slab(root, colliders, mat, xa, kilnY1, -kilnZ, xb, h, kilnZ, o);
}

function lineHall(root, colliders, M, x0, x1, z0, z1, h, t, door, kilnZ, kilnY0, kilnY1) {
  const d = 0.14;
  const skin = { solid: false, cast: false, noShadow: true };
  kilnWall(root, colliders, M.boneSun, x0 + t, x0 + t + d, z0 + t, z1 - t, h - 0.2, kilnZ, kilnY0, kilnY1, skin);
  kilnWall(root, colliders, M.boneSun, x1 - t - d, x1 - t, z0 + t, z1 - t, h - 0.2, kilnZ, kilnY0, kilnY1, skin);
  decal(root, colliders, M.boneSun, x0 + t, 0.02, z0 + t, x1 - t, h - 0.2, z0 + t + d);
  decal(root, colliders, M.boneSun, x0 + t, 0.02, z1 - t - d, -door, h - 0.2, z1 - t);
  decal(root, colliders, M.boneSun, door, 0.02, z1 - t - d, x1 - t, h - 0.2, z1 - t);
}

function skinHall(root, colliders, M, x0, x1, z0, z1, h, t, door) {
  const plinth = 2.4;
  const face = 0.08;
  decal(root, colliders, M.bone, x0 - face, 0, z0 - face, x1 + face, plinth, z0 + 0.02);
  decal(root, colliders, M.bone, x0 - face, 0, z1 - 0.02, -door, plinth, z1 + face);
  decal(root, colliders, M.bone, door, 0, z1 - 0.02, x1 + face, plinth, z1 + face);
  decal(root, colliders, M.bone, x0 - face, 0, z0, x0 + 0.02, plinth, z1);
  decal(root, colliders, M.bone, x1 - 0.02, 0, z0, x1 + face, plinth, z1);

  const wy0 = 9.5;
  const wy1 = 12.5;
  windowBand(root, colliders, M, x0 + 1.2, z1 + 0.06, -door - 0.4, wy0, wy1);
  windowBand(root, colliders, M, door + 0.4, z1 + 0.06, x1 - 1.2, wy0, wy1);
  windowBand(root, colliders, M, x0 + 1.2, z0 - 0.06, x1 - 1.2, wy0, wy1);

  decal(root, colliders, M.steelDark, x0 - 0.06, h - 0.45, z0 - 0.06, x1 + 0.06, h + 0.12, z0 + t);
  decal(root, colliders, M.steelDark, x0 - 0.06, h - 0.45, z1 - t, x1 + 0.06, h + 0.12, z1 + 0.06);
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
  const drop = 1.15;
  const th = 0.12;
  for (const hole of holes) {
    decal(root, colliders, M.well, hole.x0, top - drop, hole.z0, hole.x1, top, hole.z0 + th);
    decal(root, colliders, M.well, hole.x0, top - drop, hole.z1 - th, hole.x1, top, hole.z1);
    decal(root, colliders, M.well, hole.x0, top - drop, hole.z0, hole.x0 + th, top, hole.z1);
    decal(root, colliders, M.well, hole.x1 - th, top - drop, hole.z0, hole.x1, top, hole.z1);
    decal(root, colliders, M.rust, hole.x0, top + 0.02, hole.z0, hole.x1, top + 0.12, hole.z0 + 0.08);
    decal(root, colliders, M.rust, hole.x0, top + 0.02, hole.z1 - 0.08, hole.x1, top + 0.12, hole.z1);
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
    const lip = 0.35;
    slab(root, colliders, M.mint, hole.x0, top, hole.z0, hole.x1, top + lip, hole.z0 + 0.22);
    slab(root, colliders, M.mint, hole.x0, top, hole.z1 - 0.22, hole.x1, top + lip, hole.z1);
    slab(root, colliders, M.mint, hole.x0, top, hole.z0, hole.x0 + 0.22, top + lip, hole.z1);
    slab(root, colliders, M.mint, hole.x1 - 0.22, top, hole.z0, hole.x1, top + lip, hole.z1);
  }
}

function furnishHall(root, colliders, platforms, M, x0, x1, z0, z1, t) {
  const mezY = 3.7;
  const mezZ0 = z0 + t + 0.08;
  const mezZ1 = z0 + t + 1.72;
  deck(root, colliders, platforms, M.bone, x0 + t + 0.4, mezZ0, x1 - t - 0.4, mezZ1, mezY, 0.16);
  slab(root, colliders, M.steelDark, x0 + t + 0.4, mezY, mezZ1 - 0.1, x1 - t - 0.4, mezY + 0.72, mezZ1);
  slab(root, colliders, M.bone, x1 - t - 2.4, 0, mezZ0, x1 - t - 0.6, 1.28, mezZ1);
  slab(root, colliders, M.bone, x1 - t - 2.4, 1.28, mezZ0, x1 - t - 0.6, 2.48, mezZ1 - 0.45);
  slab(root, colliders, M.bone, x1 - t - 2.4, 2.48, mezZ0, x1 - t - 0.6, mezY, mezZ1 - 0.9);

  const beltZ0 = 2.28;
  const beltZ1 = 2.98;
  const beltY = 2.52;
  slab(root, colliders, M.steelDark, x0 + 4.5, beltY, beltZ0, x1 - 4.5, beltY + 0.18, beltZ1);
  for (const x of [-18, -6, 6, 18]) {
    pipe(root, colliders, M.steelDark, 'y', 0, beltY, x, (beltZ0 + beltZ1) * 0.5, 0.08);
  }

  const porY = 4.45;
  deck(root, colliders, platforms, M.mint, -5.4, z1, 5.4, z1 + 3.8, porY, 0.18);
  pipe(root, colliders, M.steelDark, 'y', 0, porY, -5.15, z1 + 3.55, 0.1);
  pipe(root, colliders, M.steelDark, 'y', 0, porY, 5.15, z1 + 3.55, 0.1);
}

function addPool(root, M, x, z, w, d) {
  const g = new THREE.CircleGeometry(Math.max(w, d) * 0.5, 20);
  g.rotateX(-Math.PI * 0.5);
  const mesh = new THREE.Mesh(g, M.pool);
  mesh.position.set(x, 0.05, z);
  mesh.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noMerge = true;
  mesh.userData.noShadow = true;
  root.add(mesh);
}
