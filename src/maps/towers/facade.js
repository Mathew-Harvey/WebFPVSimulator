/*
 * facade.js: the towers' skins. A tower is a few big boxes, and what makes
 * one read as a tower in a comic is its window grid, drawn line by line: a
 * mullion, a spandrel, a pane catching the sky, the diagonal glint an
 * artist puts across glass. Built as boxes that grid is tens of thousands
 * of triangles a tower. Painted, it is one picture a style, repeated over
 * every face of that style, and each face is two triangles.
 *
 * So each style is painted once on a canvas, eight bays across and
 * sixteen floors up (one for the lobby's single tall storey), at the real
 * bay and floor of the kind of tower it skins (./towers.js), and every face
 * maps it in metres: a floor line on one face meets the floor line on the
 * next at the corner, and two faces side by side start at different bays
 * (the face's seed) so the repeat is not seen. The faces of one style in
 * one chunk are one mesh, filed in that chunk's group so the pipeline's
 * cull switches them with the chunk, cel shaded in the town's toon
 * material, so the comic layer's hatching falls on them in shadow
 * (src/render/comic.js) as it does on every wall in the game. They cast.
 *
 * The painting is the browser's canvas. What is painted is a picture and
 * reaches no physics: the solids are ./towers.js's boxes, placed from the
 * plan before any of this.
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
import { cel } from '../city/vendored/core/toon.js';
import { wx, wz, chunkOf, rng } from './frame.js';

const INK = '#39324f';

/* Each style: its bay and floor in metres, how many of each the picture
 * holds, and its painter. */
export const FACADES = {
  glass: { bay: 3.2, floor: 4.0, bays: 8, floors: 16, paint: glass },
  dark: { bay: 3.2, floor: 4.0, bays: 8, floors: 16, paint: dark },
  granite: { bay: 3.2, floor: 4.0, bays: 8, floors: 16, paint: granite },
  grid: { bay: 3.2, floor: 4.0, bays: 8, floors: 16, paint: grid },
  ribbon: { bay: 3.2, floor: 3.4, bays: 8, floors: 16, paint: ribbon },
  crown: { bay: 1.6, floor: 4.0, bays: 8, floors: 16, paint: crown },
  lobby: { bay: 3.2, floor: 8.0, bays: 8, floors: 1, paint: lobby },
  flats: { bay: 3.6, floor: 2.9, bays: 8, floors: 16, paint: flats },
};

const CELL_W = 64;
const CELL_H = 64;

function each(spec, fn) {
  for (let f = 0; f < spec.floors; f += 1) {
    for (let b = 0; b < spec.bays; b += 1) {
      fn(b * CELL_W, (spec.floors - 1 - f) * CELL_H, b, f);
    }
  }
}

function line(g, x0, y0, x1, y1, w, c) {
  g.strokeStyle = c;
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

/* The glint an artist draws across glass: two parallel diagonals. */
function glint(g, x, y, w, h, r) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const o = r.range(-w * 0.4, w * 0.6);
  g.globalAlpha = 0.55;
  line(g, x + o, y + h, x + o + h * 0.8, y, 3, '#f6fbff');
  g.globalAlpha = 0.35;
  line(g, x + o + 7, y + h, x + o + 7 + h * 0.8, y, 1.5, '#f6fbff');
  g.restore();
}

function glass(g, spec) {
  const r = rng(11);
  const tones = ['#a9c5d9', '#bcd4e3', '#9dbbd1', '#c9dde9', '#b0cadb'];
  each(spec, (x, y, b) => {
    g.fillStyle = r.pick(tones);
    g.fillRect(x, y, CELL_W, CELL_H);
    /* A pane in four with the blinds half down. */
    if (r.chance(0.18)) {
      g.fillStyle = '#e8eef3';
      g.fillRect(x + 3, y + 4, CELL_W - 6, r.range(8, 22));
    }
    if (r.chance(0.12)) {
      glint(g, x, y, CELL_W, CELL_H - 10, r);
    }
    /* The spandrel and its ink. */
    g.fillStyle = '#e4e1ea';
    g.fillRect(x, y + CELL_H - 10, CELL_W, 10);
    line(g, x, y + CELL_H - 10, x + CELL_W, y + CELL_H - 10, 1.5, INK);
    line(g, x, y + CELL_H - 0.5, x + CELL_W, y + CELL_H - 0.5, 1, '#8b8496');
    /* The mullions: a strong one at the bay, a fine one between. */
    line(g, x + 1.5, y, x + 1.5, y + CELL_H, 3, '#5e5a78');
    line(g, x + CELL_W / 2, y, x + CELL_W / 2, y + CELL_H - 10, 1, '#7b7896');
    void b;
  });
}

function dark(g, spec) {
  const r = rng(23);
  const tones = ['#55617d', '#4b566f', '#5f6c88', '#47526a', '#5a6680'];
  each(spec, (x, y) => {
    g.fillStyle = r.pick(tones);
    g.fillRect(x, y, CELL_W, CELL_H);
    if (r.chance(0.1)) {
      glint(g, x, y, CELL_W, CELL_H - 6, r);
    }
    g.fillStyle = '#3d4660';
    g.fillRect(x, y + CELL_H - 6, CELL_W, 6);
    line(g, x, y + CELL_H - 6, x + CELL_W, y + CELL_H - 6, 1, '#8e97ae');
    line(g, x + 1, y, x + 1, y + CELL_H, 2, '#99a1b8');
    line(g, x + CELL_W / 3, y, x + CELL_W / 3, y + CELL_H - 6, 1, '#6c7690');
    line(g, x + (2 * CELL_W) / 3, y, x + (2 * CELL_W) / 3, y + CELL_H - 6, 1, '#6c7690');
  });
}

/* Stone, a grid of deep set windows in pairs, the fins between them. */
function granite(g, spec) {
  const r = rng(37);
  each(spec, (x, y) => {
    g.fillStyle = r.chance(0.5) ? '#ddd5cc' : '#d6cec6';
    g.fillRect(x, y, CELL_W, CELL_H);
    for (const k of [0, 1]) {
      const wx0 = x + 9 + k * 25;
      const wy0 = y + 14;
      g.fillStyle = r.chance(0.15) ? '#8fa7bd' : '#5a6680';
      g.fillRect(wx0, wy0, 19, 34);
      /* The reveal: a shadow down the left and along the top, which is
       * what makes it read as set in. */
      g.fillStyle = '#9c95a8';
      g.fillRect(wx0, wy0, 3, 34);
      g.fillRect(wx0, wy0, 19, 3);
      line(g, wx0, wy0, wx0 + 19, wy0, 1, INK);
      line(g, wx0, wy0 + 34, wx0 + 19, wy0 + 34, 1.5, '#f2ece4');
    }
    line(g, x + 1, y, x + 1, y + CELL_H, 2.5, '#a39daf');
    line(g, x, y + 4, x + CELL_W, y + 4, 1, '#b4adb8');
    line(g, x, y + CELL_H - 1, x + CELL_W, y + CELL_H - 1, 1.5, '#a39daf');
  });
}

function grid(g, spec) {
  const r = rng(41);
  each(spec, (x, y) => {
    g.fillStyle = '#e4ddcf';
    g.fillRect(x, y, CELL_W, CELL_H);
    const wx0 = x + 8;
    const wy0 = y + 10;
    g.fillStyle = r.chance(0.2) ? '#9db8cc' : '#61708c';
    g.fillRect(wx0, wy0, CELL_W - 16, CELL_H - 22);
    g.fillStyle = '#a8a1ac';
    g.fillRect(wx0, wy0, 5, CELL_H - 22);
    g.fillRect(wx0, wy0, CELL_W - 16, 4);
    line(g, wx0 + (CELL_W - 16) / 2, wy0, wx0 + (CELL_W - 16) / 2, wy0 + CELL_H - 22, 1.5, '#cfc9d3');
    g.strokeStyle = INK;
    g.lineWidth = 1.2;
    g.strokeRect(wx0, wy0, CELL_W - 16, CELL_H - 22);
  });
}

function ribbon(g, spec) {
  const r = rng(53);
  each(spec, (x, y) => {
    g.fillStyle = '#f3eee5';
    g.fillRect(x, y, CELL_W, CELL_H);
    g.fillStyle = r.chance(0.25) ? '#f0dfc0' : '#5d6984';
    g.fillRect(x, y + 12, CELL_W, 30);
    if (r.chance(0.3)) {
      g.fillStyle = '#efe6d8';
      g.fillRect(x + 4, y + 12, r.range(10, 28), 30);
    }
    line(g, x, y + 12, x + CELL_W, y + 12, 1.5, INK);
    line(g, x, y + 42, x + CELL_W, y + 42, 1, '#8b8496');
    line(g, x + 1, y + 12, x + 1, y + 42, 2, '#9aa3b5');
    line(g, x + CELL_W / 2, y + 12, x + CELL_W / 2, y + 42, 1, '#9aa3b5');
    /* A balcony rail line under every other window. */
    line(g, x, y + 50, x + CELL_W, y + 50, 1, '#cfc9d3');
  });
}

/* A crown's metal fins, vertical and close, the light catching every
 * other one. */
function crown(g, spec) {
  each(spec, (x, y, b) => {
    g.fillStyle = b % 2 ? '#7d8aa6' : '#8d9ab4';
    g.fillRect(x, y, CELL_W, CELL_H);
    g.fillStyle = '#4f5a74';
    g.fillRect(x + 20, y, 24, CELL_H);
    line(g, x + 20, y, x + 20, y + CELL_H, 1.5, INK);
    line(g, x + 44, y, x + 44, y + CELL_H, 1, '#c3cbdc');
  });
}

/* The lobby: a storey of tall glass, lit warm inside, deep mullions, and
 * a transom band. */
function lobby(g, spec) {
  const r = rng(67);
  each(spec, (x, y) => {
    g.fillStyle = r.chance(0.5) ? '#f1e3c6' : '#e9dcc4';
    g.fillRect(x, y, CELL_W, CELL_H);
    g.fillStyle = '#d9cdb6';
    g.fillRect(x, y + CELL_H * 0.55, CELL_W, 3);
    g.fillStyle = '#c2bdc8';
    g.fillRect(x, y, CELL_W, 10);
    line(g, x, y + 10, x + CELL_W, y + 10, 1.5, INK);
    line(g, x + 1.5, y, x + 1.5, y + CELL_H, 3, '#3d3a50');
    line(g, x + CELL_W / 2, y + 10, x + CELL_W / 2, y + CELL_H, 1.5, '#5e5a78');
  });
}

/* A block of flats: each bay a balcony with its rail, the sliding door
 * behind it, and now and then the washing or a futon over the rail. */
function flats(g, spec) {
  const r = rng(79);
  const walls = ['#f2e7d3', '#e7dbc4', '#dde2d6', '#f0dcda'];
  const wall = walls[0];
  each(spec, (x, y) => {
    g.fillStyle = wall;
    g.fillRect(x, y, CELL_W, CELL_H);
    g.fillStyle = r.chance(0.2) ? '#f0dfc0' : '#6a7690';
    g.fillRect(x + 8, y + 10, CELL_W - 16, 34);
    line(g, x + CELL_W / 2, y + 10, x + CELL_W / 2, y + 44, 1.5, '#cfc9d3');
    g.fillStyle = '#c9c2bb';
    g.fillRect(x, y + 40, CELL_W, 18);
    line(g, x, y + 40, x + CELL_W, y + 40, 1.5, INK);
    line(g, x, y + 58, x + CELL_W, y + 58, 1, '#8b8496');
    if (r.chance(0.25)) {
      g.fillStyle = r.pick(['#f4f2f6', '#fbc6d8', '#d6e3ee', '#f4c033']);
      g.fillRect(x + r.range(6, 30), y + 30, r.range(10, 20), 18);
    }
    line(g, x + 1, y, x + 1, y + CELL_H, 3, '#bdb6b0');
  });
  void walls;
}

const TEXTURES = new Map();
function textureOf(style) {
  let tex = TEXTURES.get(style);
  if (!tex) {
    const spec = FACADES[style];
    const c = document.createElement('canvas');
    c.width = spec.bays * CELL_W;
    c.height = spec.floors * CELL_H;
    const g = c.getContext('2d');
    spec.paint(g, spec);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    TEXTURES.set(style, tex);
  }
  return tex;
}

/* The outward normal of a plan face, in the world. */
const NORMAL = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0] };

/*
 * Every facade as meshes: { mesh, chunk } a style a chunk, the faces'
 * corners in the world, their normal, and their picture's coordinates in
 * repeats of it.
 */
export function facadeMeshes(facades) {
  const groups = new Map();
  for (const f of facades) {
    const spec = FACADES[f.style];
    const ns = f.face === 'n' || f.face === 's';
    const midA = (f.a0 + f.a1) / 2;
    const [mx, mz] = ns ? [wx(midA), wz(f.at)] : [wx(f.at), wz(midA)];
    const key = `${chunkOf(mx, mz)}|${f.style}`;
    let gr = groups.get(key);
    if (!gr) {
      gr = { chunk: chunkOf(mx, mz), style: f.style, pos: [], nor: [], uv: [] };
      groups.set(key, gr);
    }
    const n = NORMAL[f.face];
    const corner = (a, h) => (ns ? [wx(a), h, wz(f.at)] : [wx(f.at), h, wz(a)]);
    /* Along the face from the viewer's left to right, so the picture reads
     * the right way round from outside. */
    const [aL, aR] = { s: [f.a0, f.a1], n: [f.a1, f.a0], e: [f.a0, f.a1], w: [f.a1, f.a0] }[f.face];
    const width = spec.bays * spec.bay;
    const height = spec.floors * spec.floor;
    const u0 = (f.seed % spec.bays) * spec.bay;
    const v0 = (f.seed % 5) * spec.floor;
    const uv = (a, h) => [(u0 + Math.abs(a - aL)) / width, (v0 + h) / height];
    const p = [corner(aL, f.h0), corner(aR, f.h0), corner(aR, f.h1), corner(aL, f.h1)];
    const t = [uv(aL, f.h0), uv(aR, f.h0), uv(aR, f.h1), uv(aL, f.h1)];
    /* Two triangles, wound to face out along n. */
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const out = cx * n[0] + cy * n[1] + cz * n[2] > 0;
    const order = out ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of order) {
      gr.pos.push(...p[i]);
      gr.nor.push(...n);
      gr.uv.push(...t[i]);
    }
  }
  const out = [];
  for (const gr of groups.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(gr.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(gr.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(gr.uv, 2));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const mat = cel({ color: 0xffffff, map: textureOf(gr.style), bands: 3, tint: 0x6f6790, cache: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `facade ${gr.style}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    out.push({ mesh, chunk: gr.chunk });
  }
  return out;
}

/* The pictures, for dispose. */
export function facadeTextures() {
  return [...TEXTURES.values()];
}
