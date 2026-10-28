/*
 * palette.js: Sunnyfield's batches, one a look rather than one a colour.
 *
 * The kit bakes a chunk's parts into one mesh per material (../../props/
 * kit.js), and every one of this town's colours is a material of its own:
 * a cel colour with its own shadow tint (../../props/sunny.js). Six chunks
 * of a hundred and more colours came to about four hundred and forty
 * batches, and with the whole town in view that was 530 draw calls on High
 * where the plan promised about 180.
 *
 * So after the pipeline has built the map, the batches of each chunk that
 * differ only in their colour and their tint are merged into one, and the
 * colour and the tint ride on the vertices instead: three bytes of each,
 * the sRGB hex exactly as the family wrote it, turned linear in the vertex
 * shader by the same curve three uses for a material's colour, so a wall
 * draws the same pixels it drew as a batch of its own. The tint is the
 * cel shader's uShadowTint (../city/vendored/core/toon.js), which the hook
 * below points at the vertex's tint instead of the material's uniform; the
 * comic layer's hook (../../render/comic.js) still runs after it, as it
 * does on every toon material.
 *
 * Only plain batches are merged: no picture, no transparency, no vertex
 * colours of their own, and none the comic layer marks as ground. The
 * trees' canopies merge too, but only with each other, by kind: their leaf
 * clumps are a mark the merged look keeps, and a blob batch's codes ride
 * on its vertices as they did. Everything else stays as the kit made it.
 * That was four batches a chunk more before the set dressing (./frame.js
 * dress), and is what pays for its near cells' draws. Nothing
 * here is solid or reaches the physics: the colliders were placed from the
 * plan's parts before any of this, and the shadow proxies were cut from
 * the batches before they were merged, so the shadows are unchanged too.
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

/* sRGB to linear, the curve of three's SRGBToLinear, per channel. */
const LINEAR_GLSL = `
vec3 sfLinear(vec3 c) {
  return mix(pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045))));
}
`;

/* The cel patch's declaration of its tint, which the merged look reads
 * from the vertex instead. */
const TINT_UNIFORM = 'uniform vec3 uShadowTint;';

const KEEP = new Set(['position', 'normal', 'uv']);
const IDENTITY = new THREE.Matrix4();

/* Whether a batch can be merged, and if so the look it shares with others. */
function lookOf(mesh) {
  const m = mesh.material;
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.userData.shadowProxy || !m || Array.isArray(m)) {
    return null;
  }
  if (m.map || m.alphaMap || m.vertexColors || m.transparent || m.alphaTest > 0 || !m.color) {
    return null;
  }
  if (m.userData.comicGround) {
    return null;
  }
  /* A canopy's tones merge with the other canopies' and with nothing else:
   * the comic layer reads the mark from the material (comic.js, FOLIAGE),
   * which the merged look copies. A canopy's blob batch carries its blob
   * codes on its vertices (comicBlobBaked), which ride along, so it merges
   * only with other blob batches. */
  const leaf = m.userData.comicFoliage ? (m.userData.comicBlobBaked ? 'blob' : 'leaf') : (m.userData.comicBlobBaked ? null : '-');
  if (!leaf) {
    return null;
  }
  const g = mesh.geometry;
  if (!g || !g.attributes.position || !g.attributes.normal || Object.keys(g.morphAttributes).length) {
    return null;
  }
  if (Object.keys(g.attributes).some((n) => !KEEP.has(n) && !(n === 'comicBlob' && leaf === 'blob'))) {
    return null;
  }
  if (leaf === 'blob' && !g.attributes.comicBlob) {
    return null;
  }
  if (!(g.attributes.position.array instanceof Float32Array) || !(g.attributes.normal.array instanceof Float32Array)) {
    return null;
  }
  const flags = [m.side, m.fog, m.toneMapped, m.depthWrite, m.depthTest, m.blending, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder];
  if (m.isMeshToonMaterial) {
    if (!m.userData.shadowTint) {
      return null;
    }
    return ['toon', leaf, m.gradientMap ? m.gradientMap.uuid : '-', m.emissive.getHex(), m.emissiveIntensity, ...flags].join('|');
  }
  if (m.isMeshBasicMaterial) {
    return ['flat', ...flags].join('|');
  }
  return null;
}

/* The bytes of a colour's sRGB hex. */
function bytesOf(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/* A batch's geometry with only what the merged look reads: where, which
 * way, and its colour and tint as bytes on every vertex. */
function painted(mesh) {
  const src = mesh.geometry;
  const n = src.attributes.position.count;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.attributes.position.clone());
  g.setAttribute('normal', src.attributes.normal.clone());
  if (src.attributes.comicBlob) {
    g.setAttribute('comicBlob', src.attributes.comicBlob.clone());
  }
  if (src.index) {
    g.setIndex(src.index.clone());
  } else {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i += 1) {
      idx[i] = i;
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  const m = mesh.material;
  const fill = (hex) => {
    const [r, gr, b] = bytesOf(hex);
    const a = new Uint8Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      a[i * 3] = r;
      a[i * 3 + 1] = gr;
      a[i * 3 + 2] = b;
    }
    return new THREE.BufferAttribute(a, 3, true);
  };
  g.setAttribute('color', fill(m.color.getHex()));
  if (m.isMeshToonMaterial) {
    g.setAttribute('sfTint', fill(m.userData.shadowTint.value.getHex()));
  }
  if (!mesh.matrix.equals(IDENTITY)) {
    g.applyMatrix4(mesh.matrix);
  }
  return g;
}

/*
 * The batches end to end, by hand: three's mergeGeometries reads a
 * normalised attribute back as a fraction and writes the fraction into the
 * bytes, so every colour came out as one part in 255 and the town black.
 */
function concat(geos) {
  const names = Object.keys(geos[0].attributes);
  const verts = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const tris = geos.reduce((a, g) => a + g.index.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const first = geos[0].attributes[name];
    const arr = new first.array.constructor(verts * first.itemSize);
    let at = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array, at);
      at += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, first.itemSize, first.normalized));
  }
  const idx = verts > 65535 ? new Uint32Array(tris) : new Uint16Array(tris);
  let at = 0;
  let base = 0;
  for (const g of geos) {
    const src = g.index.array;
    for (let i = 0; i < src.length; i += 1) {
      idx[at + i] = src[i] + base;
    }
    at += src.length;
    base += g.attributes.position.count;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* The merged look for a toon batch: the first batch's material, white, its
 * colour and tint from the vertices. */
function toonLook(m) {
  const look = m.clone();
  look.color.setRGB(1, 1, 1);
  look.vertexColors = true;
  /* Read through the comic layer's accessor this is its wrapper, and the
   * cel factory's own hook is the wrapper's comicUser: run that, then point
   * its tint at the vertex. */
  const wrapped = m.onBeforeCompile;
  const cel = wrapped && 'comicUser' in wrapped ? wrapped.comicUser : wrapped;
  look.onBeforeCompile = function sunnyPalette(shader, renderer) {
    if (cel) {
      cel.call(this, shader, renderer);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 sfTint;\nvarying vec3 vSfTint;\n${LINEAR_GLSL}`)
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.xyz = sfLinear(vColor.xyz);\n  vSfTint = sfLinear(sfTint);');
    shader.fragmentShader = shader.fragmentShader.replace(TINT_UNIFORM, 'varying vec3 vSfTint;\n#define uShadowTint vSfTint');
  };
  look.customProgramCacheKey = () => 'sunnyPalette';
  look.userData = { ...m.userData };
  look.name = 'sunnyPalette';
  return look;
}

/* The merged look for a flat batch: unlit, its colour from the vertices. */
function flatLook(m) {
  const look = m.clone();
  look.color.setRGB(1, 1, 1);
  look.vertexColors = true;
  look.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${LINEAR_GLSL}`)
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.xyz = sfLinear(vColor.xyz);');
  };
  look.customProgramCacheKey = () => 'sunnyPaletteFlat';
  look.name = 'sunnyPaletteFlat';
  return look;
}

/*
 * Merge every chunk's plain batches by look. Returns { from, to }: how many
 * batches there were and how many meshes they became.
 */
export function mergePalette(props) {
  const stats = { from: 0, to: 0 };
  const looks = new Map();
  for (const chunk of props.children) {
    const groups = new Map();
    for (const mesh of chunk.children) {
      const key = lookOf(mesh);
      if (!key) {
        continue;
      }
      let list = groups.get(key);
      if (!list) {
        list = [];
        groups.set(key, list);
      }
      list.push(mesh);
    }
    for (const [key, list] of groups) {
      if (list.length < 2) {
        continue;
      }
      const geos = list.map(painted);
      const geo = concat(geos);
      for (const g of geos) {
        g.dispose();
      }
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      /* The shell's Gem look tones every vertex coloured geometry once
       * (../../render/look.js), in place and as fractions. These colours
       * were each a material's before this, which it never toned, and they
       * are bytes, so it is told they are done. */
      geo.userData.gemToned = true;
      let look = looks.get(key);
      if (!look) {
        const first = list[0].material;
        look = first.isMeshToonMaterial ? toonLook(first) : flatLook(first);
        looks.set(key, look);
      }
      const mesh = new THREE.Mesh(geo, look);
      mesh.name = 'propBatch';
      mesh.castShadow = list[0].castShadow;
      mesh.receiveShadow = list[0].receiveShadow;
      mesh.renderOrder = list[0].renderOrder;
      chunk.add(mesh);
      for (const old of list) {
        chunk.remove(old);
        old.geometry.dispose();
      }
      stats.from += list.length;
      stats.to += 1;
    }
  }
  return stats;
}
