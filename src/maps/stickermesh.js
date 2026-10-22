/*
 * stickermesh.js: a map's stickers drawn as one mesh, a quad each on one
 * texture. Shared by Nick Burns' house (./house/stickers.js) and Joshua
 * Bardwell's (./bardwell/stickers.js), so neither loads the other's plan.
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

/*
 * The stickers drawn: one mesh, a quad each, in `THREE`'s terms, on the
 * texture `map`. A sticker on a wall stands upright; one on a floor or a
 * top has its top to the north. Each is turned up to TURN either way.
 */
const TURN = 0.35;
export function stickerMesh(THREE, placed, map, name = 'nb stickers') {
  const pos = [];
  const uv = [];
  const idx = [];
  const n = new THREE.Vector3();
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const s of placed) {
    n.fromArray(s.n);
    up.set(0, 1, 0);
    if (Math.abs(n.y) > 0.9) {
      up.set(0, 0, -1);
    }
    right.crossVectors(up, n).normalize();
    up.crossVectors(n, right).normalize();
    const a = s.turn * TURN;
    const r = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    const u = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(right, -Math.sin(a));
    const h = s.w / 2;
    const base = pos.length / 3;
    for (const [sx, sy, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      c.fromArray(s.p).addScaledVector(r, sx * h).addScaledVector(u, sy * h);
      pos.push(c.x, c.y, c.z);
      uv.push(tu, tv);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, fog: false }));
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
