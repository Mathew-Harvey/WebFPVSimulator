/*
 * floor.js: the yard track's floor logos, MiniFigs.me and RaceGOW6, for a
 * map with no picture of its own to put them in (Nick Burns' house, whose
 * one sheet is his stickers). One small atlas of the two pictures and one
 * lit mesh of their quads, so one draw call, and only while it is in view:
 * the mesh is a few metres across and the renderer leaves it out when the
 * camera is not looking at the lawn. Heads' and Bardwell's places cut these
 * logos from the atlas they already draw, for nothing.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { FLOOR_MARKS, loadFloorMarks } from './yardtrack.js';
import { paintMaterial } from '../../art/stf.js';

const W = 512;
const PAD = 4;

/* The two pictures stacked in one column, each its own aspect. */
function cells() {
  const out = {};
  let y = 0;
  for (const m of FLOOR_MARKS) {
    const h = Math.round(W / m.aspect);
    out[m.key] = { x: 0, y, w: W, h };
    y += h + PAD;
  }
  return { out, H: y };
}

/* The floor logos `quads` (floorQuads in ./yardtrack.js) as one mesh,
 * once the pictures have come. */
export async function floorMesh(THREE, quads) {
  const marks = await loadFloorMarks();
  const { out: CELLS, H } = cells();
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  for (const m of FLOOR_MARKS) {
    const { x, y, w, h } = CELLS[m.key];
    if (marks[m.key]) {
      g.drawImage(marks[m.key], x, y, w, h);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const n = new THREE.Vector3();
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (const q of quads) {
    const cell = CELLS[q.cell];
    const u0 = cell.x / W;
    const u1 = (cell.x + cell.w) / W;
    const v0 = 1 - (cell.y + cell.h) / H;
    const v1 = 1 - cell.y / H;
    n.fromArray(q.n);
    up.fromArray(q.up);
    right.crossVectors(up, n).normalize();
    up.crossVectors(n, right).normalize();
    const base = pos.length / 3;
    for (const [sx, sy, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      v.fromArray(q.p).addScaledVector(right, (sx * q.w) / 2).addScaledVector(up, (sy * q.h) / 2);
      pos.push(v.x, v.y, v.z);
      nor.push(n.x, n.y, n.z);
      uv.push(u0 + tu * (u1 - u0), v0 + tv * (v1 - v0));
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, paintMaterial(THREE, tex));
  mesh.name = 'yard track logos';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
