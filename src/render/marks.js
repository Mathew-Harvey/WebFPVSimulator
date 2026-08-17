/*
 * marks.js: athletic paint on the racing line.
 *
 * Designed courses stand on a transparent pitch overlay. An opaque mesh
 * under that overlay is invisible: Three draws transparents after opaques,
 * so the mown turf paints over every dash. The paint is therefore a
 * transparent decal with a render order above the pitch, and the same
 * triangles are stamped into the pitch canvas so the line is IN the turf
 * as well as on it. Either half would be enough; both is what makes a
 * mark still read when the camera is on the deck in 3 cm grass.
 *
 * Colour is athletic yellow-white. Cream on mown stripes vanished. Real
 * chapters spray a pale yellow field paint, and that is what pops on
 * both the light and dark mower bands without looking like a HUD.
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

import * as THREE from 'three';
import { celMaterial } from './celmat.js';
import { tessellateGuide } from '../game/guide.js';

const PAINT = 0xffef9a;
const PAINT_CSS = '#ffef9a';
const LIFT_PITCH = 0.055;
const LIFT_GROUND = 0.05;

function liftAt(height, pitch, x, z) {
  const y = height ? height(x, z) : 0;
  return y + (pitch ? LIFT_PITCH : LIFT_GROUND);
}

function paintMaterial() {
  const mat = celMaterial({
    color: PAINT,
    rim: 0,
    cloudShadow: 0.22,
    transparent: true,
    key: 'guide-paint',
  });
  mat.depthWrite = false;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -4;
  mat.polygonOffsetUnits = -4;
  mat.side = THREE.DoubleSide;
  return mat;
}

/*
 * Stamp the taut-string paint into a top-down canvas whose UVs match a
 * PlaneGeometry(w, d) rotated -90 about X, the pitch overlay's own mesh.
 *
 *   u = (x + mownW) / width
 *   v = (z + mownD) / depth     (v=1 at +z, after the geometry's v flip)
 *   canvas y = (1-v) * h        (CanvasTexture flipY)
 */
/*
 * Build the raised decal, or null when there is nothing to paint. `pitch`
 * is the makePitch() object or null.
 */
export function buildGuideMesh(guide, height, pitch) {
  const tris = tessellateGuide(guide);
  if (tris.length < 3) {
    return null;
  }
  const pos = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i += 1) {
    const p = tris[i];
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = liftAt(height, pitch, p.x, p.z);
    pos[i * 3 + 2] = p.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, paintMaterial());
  mesh.name = 'courseGuide';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  /* Above the pitch overlay (renderOrder 0, transparent). Transparent
   * objects sort together, so a higher order is what keeps the paint
   * from being the thing the turf is drawn on top of. */
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  mesh.layers.set(1);
  return mesh;
}
