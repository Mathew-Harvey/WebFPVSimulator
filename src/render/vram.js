/*
 * vram.js: what this page has uploaded to the GPU, estimated from the scene.
 *
 * WHY THIS EXISTS. The Show FPS readout has a MEM row because a hardware
 * monitor's overlay has one (the owner's ask of 2026-11-06, with a picture
 * of one), and a browser cannot read the card's memory: WebGL has no query
 * for it, and the renderer's info.memory counts geometries and textures and
 * never bytes. So this walks the live scene and adds up what the uploads
 * must have cost: every attribute and index of every distinct geometry,
 * every instanced mesh's matrix buffer, and every distinct texture a
 * material or a uniform points at, at four bytes a texel (eight or sixteen
 * for the float types), a third more where mipmaps are made, times six for
 * a cube. It is an estimate of this page's share and nothing else on the
 * card, and the row's note says so. Render targets and the drawing buffer
 * are left out: they are the pipeline's, sized from the window, and the
 * same on every map.
 *
 * A walk of four thousand nodes is about a millisecond, so the readout
 * calls this every few seconds, never per frame.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
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

function textureBytes(t) {
  const img = Array.isArray(t.image) ? t.image[0] : t.image;
  if (!img) {
    return 0;
  }
  const w = img.width || img.naturalWidth || img.videoWidth || 0;
  const h = img.height || img.naturalHeight || img.videoHeight || 0;
  if (!(w > 0 && h > 0)) {
    return 0;
  }
  let perTexel = 4;
  if (t.type === THREE.FloatType) {
    perTexel = 16;
  } else if (t.type === THREE.HalfFloatType) {
    perTexel = 8;
  } else if (t.isCompressedTexture) {
    perTexel = 1;
  }
  let bytes = w * h * perTexel;
  if (t.isCubeTexture) {
    bytes *= 6;
  }
  if (t.generateMipmaps !== false && t.minFilter !== THREE.NearestFilter && t.minFilter !== THREE.LinearFilter) {
    bytes *= 4 / 3;
  }
  return bytes;
}

function noteTexture(t, seen, acc) {
  if (t && t.isTexture && !seen.has(t)) {
    seen.add(t);
    acc.textureBytes += textureBytes(t);
  }
}

/* Bytes this scene's geometry and textures take on the GPU, by the estimate
 * above, with the distinct counts beside them. */
export function estimateSceneBytes(scene) {
  const geos = new Set();
  const texs = new Set();
  const acc = { geometryBytes: 0, textureBytes: 0 };
  scene.traverse((o) => {
    const g = o.geometry;
    if (g && !geos.has(g)) {
      geos.add(g);
      for (const name in g.attributes) {
        const a = g.attributes[name];
        if (a && a.array) {
          acc.geometryBytes += a.array.byteLength;
        }
      }
      if (g.index && g.index.array) {
        acc.geometryBytes += g.index.array.byteLength;
      }
    }
    if (o.isInstancedMesh && o.instanceMatrix && o.instanceMatrix.array) {
      acc.geometryBytes += o.instanceMatrix.array.byteLength;
      if (o.instanceColor && o.instanceColor.array) {
        acc.geometryBytes += o.instanceColor.array.byteLength;
      }
    }
    const m = o.material;
    if (!m) {
      return;
    }
    for (const mat of Array.isArray(m) ? m : [m]) {
      for (const k in mat) {
        noteTexture(mat[k], texs, acc);
      }
      if (mat.uniforms) {
        for (const k in mat.uniforms) {
          const u = mat.uniforms[k];
          noteTexture(u ? u.value : null, texs, acc);
        }
      }
    }
  });
  return {
    geometryBytes: acc.geometryBytes,
    textureBytes: acc.textureBytes,
    bytes: acc.geometryBytes + acc.textureBytes,
    geometries: geos.size,
    textures: texs.size,
  };
}
