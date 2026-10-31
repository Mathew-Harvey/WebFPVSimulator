/*
 * index.js: Kazesuna Dunes as a map, built the way Sunnyfield is
 * (../sunny/index.js): the built map's pipeline (../built/index.js) does
 * the sky, the light, the ink, the shadows, the colliders, the cull, the
 * named gaps and the marks, and this file hands it the coast (./plan.js)
 * as one structure of its own, with the sand as its floor (./terrain.js).
 *
 * WHAT THIS FILE DRAWS that the parts cannot say:
 *
 *   THE SAND, one mesh a 128 m chunk, filed with the chunk's other batches
 *   so the pipeline's cull takes it with them, in one cel material that
 *   carries the wind ripples as a picture and the colour of the ground in
 *   its vertices (dry sand, wet sand at the sea's edge, the pond's damp
 *   ring, the pine needles on the bluff and the terrace). One draw call a
 *   chunk, and no shadow cast: the slip faces are shaded by the toon ramp
 *   and hatched by the comic layer (src/render/comic.js), which is where a
 *   manga page puts the shade of a dune.
 *
 *   THE SEA AND THE POND, two flat meshes in one unlit material, coloured
 *   in their vertices from the shallows to the deep, and the surf as two
 *   ribbons of foam along the line where the sand meets the water.
 *
 *   THE SAND FENCES, one plane a panel in one cut out material, so a row
 *   of slats is drawn with its gaps and inked along every slat (the ink
 *   pass reads depth), for one draw call a chunk.
 *
 *   THE SIGNS, painted on one canvas and drawn as one mesh, and the wires,
 *   as one set of lines.
 *
 * ON LOW, what the plan marks fine is not drawn (the footprints, the dune
 * grass, the people, the sleepers, the deck's boards); nothing fine is
 * solid, so the flight is the same.
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
import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import { qualityFor } from '../../render/quality.js';
import { loblollyDraw } from '../../props/street.js';
import { paintMaterial } from '../../art/stf.js';
import { cel } from '../city/vendored/core/toon.js';
import {
  W, D, CELL, COARSE, grid, floor, sandAt, shoreY, POND, SEA, w,
} from './terrain.js';
import {
  coastLayout, chunkOf, dunesMarkSpots, DECK, FENCE_H, tourPoints,
} from './plan.js';
import { dunesDocument } from './yard.js';
import { paintSigns } from './signs.js';

/* ---- the sand ---- */

/* The wind ripples: crests a few centimetres apart, bending as the wind
 * bends them, a shade darker in their troughs, on a warm paper ground.
 * Tiled every TILE metres. */
const TILE = 6;
function rippleCanvas() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(150, 118, 92, 0.30)';
  x.lineWidth = 2.2;
  for (let k = -2; k < 26; k += 1) {
    x.beginPath();
    for (let i = 0; i <= 64; i += 1) {
      const px = i * 4;
      const py = k * 10.6 + 3.2 * Math.sin(px / 256 * Math.PI * 2 * 2 + k * 0.7) + 1.4 * Math.sin(px / 256 * Math.PI * 2 * 5 + k);
      if (i === 0) {
        x.moveTo(px, py);
      } else {
        x.lineTo(px, py);
      }
    }
    x.stroke();
  }
  /* And grain: specks a shade either way. */
  let s = 7;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < 1400; i += 1) {
    x.fillStyle = rnd() < 0.5 ? 'rgba(120, 96, 80, 0.16)' : 'rgba(255, 255, 255, 0.5)';
    x.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5);
  }
  return c;
}

function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/* The colours of the ground, as sRGB hex, multiplied over the ripples. */
const DRY = new THREE.Color(0xf2d7a4);
const PALE = new THREE.Color(0xf8e6bf);
const WET = new THREE.Color(0xb99a74);
const DAMP = new THREE.Color(0xd6bb8c);
const NEEDLES = new THREE.Color(0x9a9a62);
const MOSS = new THREE.Color(0x8aa066);

/* The colour at a plan point of height h. */
function groundColour(x, y, h, out) {
  const yS = shoreY(x);
  out.copy(DRY);
  /* The crests and the windward slope, bleached paler. */
  if (h > 20) {
    out.lerp(PALE, Math.min(1, (h - 20) / 20) * 0.7);
  }
  /* Wet sand in the last few metres before the water, and under it. */
  const toSea = yS - y;
  if (toSea < 9) {
    out.lerp(WET, Math.min(1, Math.max(0, (9 - toSea) / 7)));
  }
  /* The damp ring round the pond. */
  const px = (x - POND.cx) / POND.rx;
  const py = (y - POND.cy) / POND.ry;
  const q = px * px + py * py;
  if (q < 2.2) {
    out.lerp(DAMP, Math.min(1, (2.2 - q) / 1.2));
  }
  /* The bluff and the terrace under the pines: needles and moss. */
  if (y < 172) {
    const t = Math.min(1, (172 - y) / 50);
    out.lerp(NEEDLES, t * 0.85);
    if (y < 110) {
      out.lerp(MOSS, 0.25 + 0.15 * Math.sin(x * 0.05) * Math.sin(y * 0.07));
    }
  }
  return out;
}

/*
 * One chunk of the sand, or the coarse ring round the plot: a grid of
 * cells, each split along its south west to north east diagonal, which is
 * the split floor() interpolates across (./terrain.js inCell).
 */
function sandGeometry(heights, stride, cell, x0, y0, i0, j0, ni, nj, skip) {
  const pos = [];
  const col = [];
  const uv = [];
  const idx = [];
  const c = new THREE.Color();
  const vid = new Map();
  const vert = (i, j) => {
    const key = i * 4096 + j;
    let v = vid.get(key);
    if (v !== undefined) {
      return v;
    }
    const x = x0 + i * cell;
    const y = y0 + j * cell;
    const h = heights[j * stride + i];
    const p = w(x, y, h);
    pos.push(p[0], p[1], p[2]);
    groundColour(x, y, h, c);
    col.push(c.r, c.g, c.b);
    uv.push(x / TILE, y / TILE);
    v = pos.length / 3 - 1;
    vid.set(key, v);
    return v;
  };
  for (let j = j0; j < j0 + nj; j += 1) {
    for (let i = i0; i < i0 + ni; i += 1) {
      if (skip && skip(i, j)) {
        continue;
      }
      const a = vert(i, j);
      const b = vert(i + 1, j);
      const cc = vert(i, j + 1);
      const d = vert(i + 1, j + 1);
      /* Plan y is the world's -z, so a plan anticlockwise triangle is
       * clockwise seen from above in the world: written reversed. */
      idx.push(a, d, b, a, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function drawSand(kit, material) {
  const G = grid();
  const per = 128 / CELL;
  for (let cj = 0; cj < D / 128; cj += 1) {
    for (let ci = 0; ci < W / 128; ci += 1) {
      const geo = sandGeometry(G.fine, G.FX + 1, CELL, 0, 0, ci * per, cj * per, per, per, null);
      const mid = w(ci * 128 + 64, cj * 128 + 64);
      kit.begin(0, 0, 0, 0, chunkOf(mid[0], mid[2]));
      kit.add(material, geo);
    }
  }
  /* The ring past the plot, in the coarse cells, as one batch of its own:
   * past the fog nearly all of it, so it culls as one. */
  const inPlot = (i, j) => {
    const x = G.CX0 + i * COARSE;
    const y = G.CY0 + j * COARSE;
    return x >= 0 && x + COARSE <= W && y >= 0 && y + COARSE <= D;
  };
  const ring = sandGeometry(G.coarse, G.CNX + 1, COARSE, G.CX0, G.CY0, 0, 0, G.CNX, G.CNY, inPlot);
  kit.begin(0, 0, 0, 0, 'dnRing');
  kit.add(material, ring);
}

/* ---- the water ---- */

function waveCanvas() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 256, 256);
  /* The comic's waves: short white dashes on the swell, and a few longer
   * darker strokes under them. */
  let s = 11;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  x.lineCap = 'round';
  for (let i = 0; i < 46; i += 1) {
    const px = rnd() * 256;
    const py = rnd() * 256;
    const len = 10 + rnd() * 26;
    x.strokeStyle = 'rgba(255,255,255,0.95)';
    x.lineWidth = 2.4;
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(px + len / 2, py - 3, px + len, py);
    x.stroke();
    x.strokeStyle = 'rgba(40,70,110,0.22)';
    x.lineWidth = 1.6;
    x.beginPath();
    x.moveTo(px + 4, py + 4);
    x.lineTo(px + len * 0.8, py + 4);
    x.stroke();
  }
  return c;
}

const SHALLOW = new THREE.Color(0x6fd0d4);
const MID = new THREE.Color(0x3a9fd0);
const DEEP = new THREE.Color(0x2a6fb4);

function seaMesh(material) {
  /* A grid from the back of the beach out to past the sky, coloured by
   * how far from the shore each node is. Under the sand where the sand is
   * above the water, which the depth test hides. */
  const xs = [];
  for (let x = -2400; x <= W + 2400; x += 64) {
    xs.push(x);
  }
  const ys = [];
  for (let y = 470; y <= D + 2600; y += (y < 700 ? 8 : 96)) {
    ys.push(y);
  }
  const pos = [];
  const col = [];
  const uv = [];
  const idx = [];
  const c = new THREE.Color();
  for (const y of ys) {
    for (const x of xs) {
      const p = w(x, y, SEA);
      pos.push(p[0], p[1], p[2]);
      const d = y - shoreY(Math.max(-200, Math.min(W + 200, x)));
      c.copy(SHALLOW).lerp(MID, Math.min(1, Math.max(0, d / 40))).lerp(DEEP, Math.min(1, Math.max(0, (d - 40) / 300)));
      col.push(c.r, c.g, c.b);
      uv.push(x / 40, y / 40);
    }
  }
  const nx = xs.length;
  for (let j = 0; j + 1 < ys.length; j += 1) {
    for (let i = 0; i + 1 < nx; i += 1) {
      const a = j * nx + i;
      idx.push(a, a + nx + 1, a + 1, a, a + nx, a + nx + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.name = 'dunes sea';
  return m;
}

function pondMesh(material) {
  const n = 40;
  const pos = [];
  const col = [];
  const uv = [];
  const idx = [];
  const ctr = w(POND.cx, POND.cy, POND.level);
  pos.push(ctr[0], ctr[1], ctr[2]);
  col.push(MID.r, MID.g, MID.b);
  uv.push(POND.cx / 40, POND.cy / 40);
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const x = POND.cx + Math.cos(a) * POND.rx;
    const y = POND.cy + Math.sin(a) * POND.ry;
    const p = w(x, y, POND.level);
    pos.push(p[0], p[1], p[2]);
    col.push(SHALLOW.r, SHALLOW.g, SHALLOW.b);
    uv.push(x / 40, y / 40);
  }
  for (let i = 1; i <= n; i += 1) {
    idx.push(0, i + 1, i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.name = 'dunes pond';
  return m;
}

/* Where the sand meets the sea at plan x, walking out from the beach. */
function waterline(x) {
  let y = shoreY(x) - 12;
  while (y < shoreY(x) + 20 && sandAt(x, y) > SEA + 0.02) {
    y += 0.5;
  }
  return y;
}

/* The surf: a ribbon of foam on the waterline and a broken one further
 * out where the swell breaks, in one unlit white. */
function surfMesh() {
  const pos = [];
  const idx = [];
  const strip = (off, width, dash) => {
    let prev = null;
    for (let x = -300; x <= W + 300; x += 3) {
      const on = !dash || Math.sin(x * 0.11) + Math.sin(x * 0.037) > -0.3;
      const y = waterline(Math.max(-300, Math.min(W + 300, x))) + off + Math.sin(x * 0.07) * 0.8;
      const a = w(x, y - width / 2, SEA + 0.03);
      const b = w(x, y + width / 2, SEA + 0.03);
      const base = pos.length / 3;
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      if (prev !== null && on) {
        idx.push(prev, base, prev + 1, prev + 1, base, base + 1);
      }
      prev = base;
    }
  };
  strip(0.4, 1.3, false);
  strip(9, 0.9, true);
  strip(22, 0.7, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xfbf8f0, side: THREE.DoubleSide }));
  m.name = 'dunes surf';
  return m;
}

/* ---- the sand fences ---- */

function slatCanvas() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 64);
  /* Fourteen slats a panel, each a little uneven in width and in colour,
   * the air between as wide again. */
  for (let i = 0; i < 14; i += 1) {
    const px = i * (128 / 14) + 1;
    const wd = 4 + (i % 3) * 0.6;
    const l = 168 + ((i * 37) % 30);
    x.fillStyle = `rgb(${l}, ${l - 26}, ${l - 74})`;
    x.fillRect(px, 1 + (i % 2), wd, 63 - (i % 2));
  }
  return c;
}

function fenceGeometry(list) {
  const pos = [];
  const uv = [];
  const nor = [];
  for (const f of list) {
    const a0 = w(f.x0, f.y, f.a + 0.05);
    const b0 = w(f.x1, f.y, f.b + 0.05);
    const a1 = w(f.x0, f.y, f.a + FENCE_H);
    const b1 = w(f.x1, f.y, f.b + FENCE_H);
    pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    for (let k = 0; k < 6; k += 1) {
      nor.push(0, 0, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/* ---- the signs and the wires ---- */

function signMesh(signs, atlas, material) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const n = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const s of signs) {
    const cell = atlas.cells[s.key];
    if (!cell) {
      continue;
    }
    const u0 = (cell.x + 0.5) / atlas.w;
    const u1 = (cell.x + cell.w - 0.5) / atlas.w;
    const v0 = 1 - (cell.y + cell.h - 0.5) / atlas.h;
    const v1 = 1 - (cell.y + 0.5) / atlas.h;
    n.fromArray(s.n).normalize();
    right.crossVectors(up, n).normalize();
    const base = pos.length / 3;
    for (const [sx, sy, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      c.fromArray(s.p).addScaledVector(n, s.lift).addScaledVector(right, (sx * s.w) / 2).addScaledVector(up, (sy * s.h) / 2);
      pos.push(c.x, c.y, c.z);
      nor.push(n.x, n.y, n.z);
      uv.push(u0 + tu * (u1 - u0), v0 + tv * (v1 - v0));
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.name = 'dunes signs';
  m.receiveShadow = true;
  return m;
}

const WIRE_SEGMENTS = 10;
function wireLines(wires) {
  const pts = [];
  for (const wr of wires) {
    let px = wr.a[0];
    let py = wr.a[1];
    let pz = wr.a[2];
    for (let i = 1; i <= WIRE_SEGMENTS; i += 1) {
      const t = i / WIRE_SEGMENTS;
      const x = wr.a[0] + (wr.b[0] - wr.a[0]) * t;
      const y = wr.a[1] + (wr.b[1] - wr.a[1]) * t - wr.sag * 4 * t * (1 - t);
      const z = wr.a[2] + (wr.b[2] - wr.a[2]) * t;
      pts.push(px, py, pz, x, y, z);
      px = x;
      py = y;
      pz = z;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.computeBoundingSphere();
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2c2a33 }));
  lines.name = 'dunes wire lines';
  return lines;
}

/* ---- the map ---- */

function drawCoast(kit, L, low, sand, slats) {
  drawSand(kit, sand);
  for (const d of L.draws) {
    if (low && d.fine) {
      continue;
    }
    kit.begin(0, 0, 0, 0, d.chunk);
    d.fn(kit);
  }
  for (const a of L.assets) {
    const [x, y, z] = w(a.x, a.y, a.h);
    kit.begin(x, y, z, a.yaw, chunkOf(x, z));
    if (a.el.style === 'loblolly' || a.el.style === 'broad') {
      loblollyDraw(a.el, kit);
    } else {
      kit.element(a.el);
    }
  }
  /* The fence panels, a batch a chunk. */
  const byChunk = new Map();
  for (const f of L.fences) {
    const c = w((f.x0 + f.x1) / 2, f.y);
    const k = chunkOf(c[0], c[2]);
    if (!byChunk.has(k)) {
      byChunk.set(k, []);
    }
    byChunk.get(k).push(f);
  }
  for (const [k, list] of byChunk) {
    kit.begin(0, 0, 0, 0, k);
    kit.add(slats, fenceGeometry(list));
  }
}

export async function buildMap(shell, onProgress, options) {
  const q = qualityFor(options && options.quality);
  const low = q.id === 'low';
  const L = coastLayout();
  /* The sand: the ripples tiled over it, the ground's colour in its
   * vertices. Received shadow, cast none. */
  const rippleTex = canvasTexture(rippleCanvas());
  const sand = cel({ color: 0xffffff, map: rippleTex, bands: 3, tint: 0x8a7898, vertexColors: true, cache: false });
  sand.userData.propCast = false;
  sand.userData.propReceive = true;
  /* Ground, for the comic layer's grit and stains (render/comic.js). */
  sand.userData.comicGround = true;
  const slatTex = canvasTexture(slatCanvas());
  slatTex.wrapS = THREE.ClampToEdgeWrapping;
  slatTex.wrapT = THREE.ClampToEdgeWrapping;
  const slats = cel({ color: 0xffffff, map: slatTex, bands: 3, tint: 0x6c5c70, alphaTest: 0.5, side: THREE.DoubleSide, cache: false });
  slats.userData.propCast = !low;
  const extra = {
    el: { id: 'dunes', type: 'dunes' },
    /* On Low the fine parts are left out of what is drawn; none is solid. */
    parts: low ? L.parts.filter((p) => !(p.fine && !p.solid)) : L.parts,
    draw: (kit) => drawCoast(kit, L, low, sand, slats),
    floor,
    chunkOf: (x, z) => chunkOf(x, z),
    /* The pilot starts on the look out's deck. */
    padBase: DECK.top,
  };
  const doc = dunesDocument();
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, markSpots: dunesMarkSpots(),
  });
  map.id = 'dunes';
  map.source = 'dunes';
  /* The yard's own ground and its edges are the sand's now. */
  for (const name of ['plot', 'kerb', 'verge', 'groundPaint', 'roads', 'ruts']) {
    const o = map.scene.getObjectByName(name);
    if (o) {
      o.visible = false;
    }
  }
  /* The water: the sea out to the horizon and the pond in the hollow, one
   * unlit material with the comic's wave dashes over the colour of the
   * depth, and the surf on the line where the water meets the sand. */
  const waveTex = canvasTexture(waveCanvas());
  const water = new THREE.MeshBasicMaterial({ color: 0xffffff, map: waveTex, vertexColors: true });
  map.scene.add(seaMesh(water));
  map.scene.add(pondMesh(water));
  map.scene.add(surfMesh());
  /* The signs, one mesh on one picture, and the wires. */
  const atlas = paintSigns(L.signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  map.scene.add(signMesh(L.signs, atlas, paintMaterial(THREE, tex)));
  map.scene.add(wireLines(L.wires));
  /* The title camera's tour, at its heights over the sand, rather than the
   * built map's ring at a fixed height, which would be inside the ridge. */
  map.attract = {
    ...map.attract,
    path: tourPoints().map(([x, y, h]) => {
      const p = w(x, y, Math.max(h, sandAt(x, y) + 12));
      return { x: p[0], y: p[1], z: p[2] };
    }),
    speed: 10,
  };
  const stats = map.stats;
  map.stats = () => ({ ...(stats ? stats() : {}), dunes: { parts: L.parts.length, pines: L.pines, gaps: L.gaps.length } });
  const dispose = map.dispose;
  map.dispose = () => {
    rippleTex.dispose();
    slatTex.dispose();
    waveTex.dispose();
    tex.dispose();
    sand.dispose();
    slats.dispose();
    water.dispose();
    dispose();
  };
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
