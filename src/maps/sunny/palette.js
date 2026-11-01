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
    mergeChildren(chunk, looks, stats);
  }
  return stats;
}

/*
 * One car's parts, merged as a cell's batches are (the AAA pass of
 * 2026-11-01): a car body from src/art/cars.js is five toon parts and
 * eight flat ones, thirteen draw calls a car. `keep` is the meshes left
 * as they are (the tail lamp, which brakes on its own). The looks are
 * shared across every car merged through the same `looks` map.
 */
export function mergeCar(body, looks, keep = null) {
  const stats = { from: 0, to: 0 };
  body.updateMatrixWorld(true);
  for (const o of body.children) {
    o.updateMatrix();
  }
  mergeChildren(body, looks, stats, keep);
  return stats;
}

function mergeChildren(chunk, looks, stats, keep = null) {
  {
    const groups = new Map();
    for (const mesh of chunk.children) {
      if (keep && keep.has(mesh)) {
        continue;
      }
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
}

/* ------------------------------------------------------------------ *
 * THE DECALS (the AAA pass of 2026-11-01). A painted sign, a poster, a
 * graffiti tag or a shop's lettering is an unlit quad on a picture of its
 * own, and the kit bakes each picture into a batch of its own in every
 * cell it appears in. Tsukimi Danchi drew 185 of these in its four cells,
 * on 96 pictures, which was two thirds of its draw calls.
 *
 * So the pictures go onto shared pages, and each cell's decals on one
 * page and with one set of flags become one batch, their texture
 * coordinates moved onto their picture's place on the page. Only a decal
 * that cannot tell the difference is moved: an unlit picture, clamped,
 * not repeated, its coordinates inside the picture, no vertex colours.
 * Each picture is drawn on its page with its edge pixels pulled out by
 * PAD, so the page's smaller mip levels do not bleed a neighbour's colour
 * into its edge. The page is the same pixels as the pictures were, so the
 * memory is what it was: the pictures' own textures are no longer
 * uploaded, because nothing draws them.
 * ------------------------------------------------------------------ */

/* A page is 4096 square where the GPU takes it, which holds every
 * picture of the heaviest map (Tsukimi Danchi, 14 million pixels) on one
 * page with room over, and 2048, the least WebGL 2 promises, where not. */
let PAGE = 2048;
const PAD = 4;

function decalOf(mesh) {
  const m = mesh.material;
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.userData.shadowProxy || !m || Array.isArray(m) || !m.isMeshBasicMaterial) {
    return null;
  }
  /* Only the kit's own batches: a partner's mark or anything else that is
   * looked for by its mesh or its material (a name, a mark in userData)
   * is left as it is. */
  if (mesh.name !== 'propBatch' || m.name || Object.keys(m.userData).some((k) => k !== 'propCast' && k !== 'propReceive')) {
    return null;
  }
  const t = m.map;
  if (!t || m.alphaMap || m.vertexColors || m.envMap || m.aoMap || m.lightMap || !t.image) {
    return null;
  }
  const im = t.image;
  const w = im.width;
  const h = im.height;
  if (!(w > 0 && h > 0) || w > PAGE - PAD * 2 || h > PAGE - PAD * 2) {
    return null;
  }
  if (typeof HTMLCanvasElement === 'undefined' || !(im instanceof HTMLCanvasElement || (typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap) || (typeof HTMLImageElement !== 'undefined' && im instanceof HTMLImageElement))) {
    return null;
  }
  if (t.wrapS !== THREE.ClampToEdgeWrapping || t.wrapT !== THREE.ClampToEdgeWrapping) {
    return null;
  }
  if (t.repeat.x !== 1 || t.repeat.y !== 1 || t.offset.x !== 0 || t.offset.y !== 0 || t.rotation !== 0 || t.matrixAutoUpdate === false) {
    return null;
  }
  const g = mesh.geometry;
  if (!g || !g.attributes.position || !g.attributes.uv || Object.keys(g.morphAttributes).length) {
    return null;
  }
  if (Object.keys(g.attributes).some((n) => !KEEP.has(n))) {
    return null;
  }
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (u < -1e-4 || u > 1 + 1e-4 || v < -1e-4 || v > 1 + 1e-4) {
      return null;
    }
  }
  return [
    m.color.getHex(), m.opacity, m.transparent, m.alphaTest, m.side, m.fog, m.toneMapped, m.depthWrite, m.depthTest, m.blending,
    m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits,
    mesh.castShadow, mesh.receiveShadow, mesh.renderOrder,
    t.colorSpace, t.magFilter, t.minFilter, t.premultiplyAlpha,
  ].join('|');
}

/* Shelf packing: pictures tallest first, left to right in rows. */
function pack(textures) {
  const order = [...textures].sort((a, b) => b.image.height - a.image.height || b.image.width - a.image.width);
  const pages = [];
  const place = new Map();
  let page = null;
  for (const t of order) {
    const w = t.image.width + PAD * 2;
    const h = t.image.height + PAD * 2;
    if (!page || (page.x + w > PAGE && page.y + page.row + h > PAGE)) {
      page = { x: 0, y: 0, row: 0, items: [] };
      pages.push(page);
    }
    if (page.x + w > PAGE) {
      page.x = 0;
      page.y += page.row;
      page.row = 0;
    }
    if (page.y + h > PAGE) {
      page = { x: 0, y: 0, row: 0, items: [] };
      pages.push(page);
    }
    const at = { page: pages.length - 1, x: page.x + PAD, y: page.y + PAD, w: t.image.width, h: t.image.height };
    page.items.push({ t, at });
    place.set(t, at);
    page.x += w;
    page.row = Math.max(page.row, h);
  }
  return { pages, place };
}

/* A page: every picture drawn at its place, its border rows and columns
 * pulled out into the padding. */
function paintPage(page, sample) {
  const height = Math.min(PAGE, page.y + page.row);
  const c = document.createElement('canvas');
  c.width = PAGE;
  c.height = Math.max(1, height);
  const g = c.getContext('2d');
  for (const { t, at } of page.items) {
    const im = t.image;
    const { x, y, w, h } = at;
    /* A texture that is not flipped has its first row at v = 0, which the
     * page (flipped, as a canvas texture is) puts at the bottom: draw it
     * upside down so the arithmetic in remap() stays one rule. */
    g.save();
    if (!t.flipY) {
      g.translate(0, y * 2 + h);
      g.scale(1, -1);
    }
    g.drawImage(im, x, y, w, h);
    /* The padding: the edge pixels stretched outward. */
    g.drawImage(im, 0, 0, 1, h, x - PAD, y, PAD, h);
    g.drawImage(im, w - 1, 0, 1, h, x + w, y, PAD, h);
    g.drawImage(im, 0, 0, w, 1, x, y - PAD, w, PAD);
    g.drawImage(im, 0, h - 1, w, 1, x, y + h, w, PAD);
    g.drawImage(im, 0, 0, 1, 1, x - PAD, y - PAD, PAD, PAD);
    g.drawImage(im, w - 1, 0, 1, 1, x + w, y - PAD, PAD, PAD);
    g.drawImage(im, 0, h - 1, 1, 1, x - PAD, y + h, PAD, PAD);
    g.drawImage(im, w - 1, h - 1, 1, 1, x + w, y + h, PAD, PAD);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = sample.colorSpace;
  tex.magFilter = sample.magFilter;
  tex.minFilter = sample.minFilter;
  tex.premultiplyAlpha = sample.premultiplyAlpha;
  tex.anisotropy = Math.max(1, ...page.items.map(({ t }) => t.anisotropy || 1));
  tex.name = 'decalPage';
  return tex;
}

/* A decal's geometry with its coordinates moved onto its place. */
function remapped(mesh, at, pageHeight) {
  const src = mesh.geometry;
  const n = src.attributes.position.count;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.attributes.position.clone());
  if (src.attributes.normal) {
    g.setAttribute('normal', src.attributes.normal.clone());
  } else {
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  }
  const uv = new Float32Array(n * 2);
  const s = src.attributes.uv;
  for (let i = 0; i < n; i += 1) {
    const u = Math.min(1, Math.max(0, s.getX(i)));
    const v = Math.min(1, Math.max(0, s.getY(i)));
    uv[i * 2] = (at.x + u * at.w) / PAGE;
    uv[i * 2 + 1] = 1 - (at.y + (1 - v) * at.h) / pageHeight;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (src.index) {
    g.setIndex(src.index.clone());
  } else {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i += 1) {
      idx[i] = i;
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  if (!mesh.matrix.equals(IDENTITY)) {
    g.applyMatrix4(mesh.matrix);
  }
  return g;
}

/*
 * Put every cell's decals on shared pages, one batch a page and a set of
 * flags in each cell. Returns { from, to, pages } and an `owned` list of
 * the pages' textures and materials, for the map's dispose.
 */
export function mergeDecals(props, maxTexture = 2048) {
  PAGE = maxTexture >= 4096 ? 4096 : 2048;
  const stats = { from: 0, to: 0, pages: 0, owned: [] };
  if (typeof document === 'undefined') {
    return stats;
  }
  const found = [];
  const textures = new Set();
  for (const chunk of props.children) {
    for (const mesh of chunk.children) {
      const key = decalOf(mesh);
      if (key) {
        found.push({ chunk, mesh, key });
        textures.add(mesh.material.map);
      }
    }
  }
  if (found.length < 2) {
    return stats;
  }
  /* Pages are cut per sampling: pictures that differ in colour space,
   * filter or alpha handling never share one. */
  const bySampling = new Map();
  for (const t of textures) {
    const k = [t.colorSpace, t.magFilter, t.minFilter, t.premultiplyAlpha].join('|');
    if (!bySampling.has(k)) {
      bySampling.set(k, []);
    }
    bySampling.get(k).push(t);
  }
  const where = new Map();
  for (const list of bySampling.values()) {
    const { pages, place } = pack(list);
    const texs = pages.map((p) => paintPage(p, list[0]));
    for (const [t, at] of place) {
      where.set(t, { at, tex: texs[at.page], h: texs[at.page].image.height });
    }
    stats.pages += texs.length;
    stats.owned.push(...texs);
  }
  /* Group by cell, page and flags. */
  const groups = new Map();
  for (const f of found) {
    const w = where.get(f.mesh.material.map);
    const k = `${f.chunk.uuid}|${w.tex.uuid}|${f.key}`;
    if (!groups.has(k)) {
      groups.set(k, { chunk: f.chunk, w, list: [] });
    }
    groups.get(k).list.push(f.mesh);
  }
  const looks = new Map();
  for (const { chunk, w, list } of groups.values()) {
    if (list.length < 2) {
      continue;
    }
    const geos = list.map((mesh) => remapped(mesh, where.get(mesh.material.map).at, w.h));
    const geo = concat(geos);
    for (const g of geos) {
      g.dispose();
    }
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const first = list[0].material;
    const lk = `${w.tex.uuid}|${decalOf(list[0])}`;
    let look = looks.get(lk);
    if (!look) {
      look = first.clone();
      look.map = w.tex;
      look.name = 'decalPage';
      looks.set(lk, look);
      stats.owned.push(look);
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
  return stats;
}

/*
 * Both merges, for a built map's props, with the decal pages handed to the
 * map's dispose. Returns mergePalette's counts with the decals' beside
 * them.
 */
export function mergeProps(props, map, shell = null) {
  const caps = shell && shell.renderer && shell.renderer.capabilities;
  const decals = mergeDecals(props, caps ? caps.maxTextureSize : 2048);
  const palette = mergePalette(props);
  if (decals.owned.length && map) {
    const dispose = map.dispose;
    map.dispose = (...a) => {
      if (dispose) {
        dispose.apply(map, a);
      }
      for (const o of decals.owned) {
        o.dispose();
      }
    };
  }
  return { ...palette, decals: { from: decals.from, to: decals.to, pages: decals.pages } };
}
