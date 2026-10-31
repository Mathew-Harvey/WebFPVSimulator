/*
 * signs.js: every painted sign in Ekimae Drift on one picture, and the one
 * mesh that shows them, the way Sunnyfield's are (../sunny/signs.js): a
 * bar's name over its curtain, the station's name, the expressway's green
 * board, the car park's P, the police box's plate, each a quad on a cell
 * of one canvas, so seventy signs cost one draw call and one texture.
 *
 * Every word is the place's own and none is a brand: a station of a made
 * up name, Kamomedai (gull hill), its shopping street, bars that say what
 * they sell, and the event's own banner. The Japanese is what the signs in
 * a real station district say: 駅 station, 北口 north exit, 交番 police box,
 * 居酒屋 izakaya, 焼き鳥 yakitori, 駐車場 car park, 商店街 shopping street.
 *
 * The painting is the browser's: a canvas, its 2D context and its fonts.
 * What is painted is a picture and reaches no physics, so a font that
 * differs a little between machines changes nothing a pilot hits.
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

import { w } from './frame.js';

const INK = '#1d1b26';
const CREAM = '#fbf8f0';
const JP = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', 'WenQuanYi Zen Hei', sans-serif`;
const HEAVY = `900 {px}px "Arial Black", ${JP}`;
const BOLD = `700 {px}px ${JP}`;

const ATLAS_W = 1024;
const CELL_H = 64;
const PAD = 3;

function font(g, face, px) {
  g.font = face.replace('{px}', String(Math.round(px)));
}

/* Words centred at (x, y), shrunk until they fit maxW. */
function words(g, text, x, y, maxW, px, colour, face = BOLD) {
  let size = px;
  font(g, face, size);
  while (size > 6 && g.measureText(text).width > maxW) {
    size -= 1;
    font(g, face, size);
  }
  g.fillStyle = colour;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/* Words with an ink line round them, the manga's lettering. */
function lettered(g, text, x, y, maxW, px, colour, line = INK, face = HEAVY) {
  let size = px;
  font(g, face, size);
  while (size > 6 && g.measureText(text).width > maxW) {
    size -= 1;
    font(g, face, size);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, size * 0.14);
  g.strokeStyle = line;
  g.strokeText(text, x, y);
  g.fillStyle = colour;
  g.fillText(text, x, y);
}

/* A column of characters top to bottom, the way a shop's blade reads. */
function column(g, text, x, y0, y1, px, colour) {
  const chars = [...text];
  const step = (y1 - y0) / chars.length;
  const size = Math.min(px, step * 0.9);
  chars.forEach((c, i) => words(g, c, x, y0 + step * (i + 0.5), size * 1.1, size, colour));
}

function panel(g, wd, h, fill, edge = INK, round = 6, lw = 4) {
  g.beginPath();
  g.roundRect(lw / 2, lw / 2, wd - lw, h - lw, round);
  g.fillStyle = fill;
  g.fill();
  if (edge) {
    g.lineWidth = lw;
    g.strokeStyle = edge;
    g.stroke();
  }
}

/* A bar's name board: a plank in its colour, the name in white. */
const board = (bg, text, sub = null) => (g, wd, h) => {
  panel(g, wd, h, bg, INK, 4, 4);
  if (sub) {
    words(g, text, wd * 0.38, h / 2, wd * 0.6, h * 0.7, CREAM, HEAVY);
    words(g, sub, wd * 0.8, h / 2, wd * 0.34, h * 0.42, CREAM);
  } else {
    words(g, text, wd / 2, h / 2 + 1, wd * 0.9, h * 0.72, CREAM, HEAVY);
  }
};

/* ---- the signs ---- */

const SIGNS = {
  /* The expressway's green board, eastbound and westbound. */
  expressE: { h: 160, paint: (g, wd, h) => {
    panel(g, wd, h, '#2f7a4a', CREAM, 10, 6);
    words(g, '湾岸 港', wd * 0.3, h * 0.36, wd * 0.4, h * 0.36, CREAM);
    words(g, 'Harbour', wd * 0.3, h * 0.7, wd * 0.36, h * 0.2, CREAM);
    words(g, '空港', wd * 0.74, h * 0.36, wd * 0.36, h * 0.36, CREAM);
    words(g, 'Airport', wd * 0.74, h * 0.7, wd * 0.3, h * 0.2, CREAM);
    g.fillStyle = CREAM;
    g.fillRect(wd * 0.52, h * 0.12, 4, h * 0.76);
    g.beginPath();
    g.moveTo(wd * 0.93, h * 0.5);
    g.lineTo(wd * 0.88, h * 0.3);
    g.lineTo(wd * 0.88, h * 0.7);
    g.fill();
  } },
  expressW: { h: 160, paint: (g, wd, h) => {
    panel(g, wd, h, '#2f7a4a', CREAM, 10, 6);
    words(g, '都心', wd * 0.3, h * 0.36, wd * 0.36, h * 0.36, CREAM);
    words(g, 'City centre', wd * 0.3, h * 0.7, wd * 0.36, h * 0.2, CREAM);
    words(g, 'かもめ台', wd * 0.72, h * 0.36, wd * 0.4, h * 0.36, CREAM);
    words(g, 'Kamomedai', wd * 0.72, h * 0.7, wd * 0.34, h * 0.2, CREAM);
    g.fillStyle = CREAM;
    g.fillRect(wd * 0.52, h * 0.12, 4, h * 0.76);
  } },
  clearance: { h: 64, paint: (g, wd, h) => {
    panel(g, wd, h, '#f2bd34', INK, 4, 4);
    words(g, '高さ制限 5.8m', wd / 2, h / 2, wd * 0.9, h * 0.6, INK, HEAVY);
  } },
  yokocho: { h: 64, paint: (g, wd, h) => {
    panel(g, wd, h, '#3a2c2a', '#d8333d', 6, 4);
    words(g, 'ガード下 横丁', wd / 2, h / 2, wd * 0.9, h * 0.66, '#ffd8a0', HEAVY);
  } },
  izakaya: { h: 64, paint: board('#6b2f2a', '居酒屋', 'とり政') },
  yakitori: { h: 64, paint: board('#2a2a32', '焼き鳥', 'ひよこ') },
  bar: { h: 64, paint: board('#3a2f6a', 'BAR', 'あかり') },
  soba: { h: 64, paint: board('#1f3a5c', '手打ちそば', null) },
  staName: { h: 64, paint: (g, wd, h) => {
    panel(g, wd, h, CREAM, INK, 4, 3);
    words(g, 'かもめ台', wd / 2, h * 0.4, wd * 0.9, h * 0.5, INK, HEAVY);
    g.fillStyle = '#2f9a4c';
    g.fillRect(4, h * 0.7, wd - 8, h * 0.08);
    words(g, 'Kamomedai', wd / 2, h * 0.86, wd * 0.5, h * 0.18, INK);
  } },
  staBig: { h: 96, paint: (g, wd, h) => {
    panel(g, wd, h, CREAM, INK, 6, 5);
    lettered(g, 'かもめ台駅', wd * 0.36, h * 0.48, wd * 0.6, h * 0.66, '#2f9a4c', INK);
    words(g, 'KAMOMEDAI STATION', wd * 0.8, h * 0.5, wd * 0.34, h * 0.24, INK, HEAVY);
  } },
  exitN: { h: 64, paint: (g, wd, h) => {
    panel(g, wd, h, '#f2bd34', INK, 4, 3);
    words(g, '北口  North Exit', wd / 2, h / 2, wd * 0.9, h * 0.6, INK, HEAVY);
  } },
  exitS: { h: 64, paint: (g, wd, h) => {
    panel(g, wd, h, '#f2bd34', INK, 4, 3);
    words(g, '南口  South Exit', wd / 2, h / 2, wd * 0.9, h * 0.6, INK, HEAVY);
  } },
  gates: { h: 64, paint: (g, wd, h) => {
    panel(g, wd, h, '#2b2e3a', null, 2, 0);
    words(g, '改札  ← のりば 1・2番線 →', wd / 2, h / 2, wd * 0.94, h * 0.56, '#ffd86a');
  } },
  parkP: { h: 160, paint: (g, wd, h) => {
    panel(g, wd, h, '#3f71aa', CREAM, 8, 6);
    lettered(g, 'P', wd / 2, h * 0.42, wd * 0.9, h * 0.6, CREAM, INK);
    words(g, '空', wd / 2, h * 0.84, wd * 0.6, h * 0.2, '#7ee08a', HEAVY);
  } },
  parkName: { h: 256, paint: (g, wd, h) => {
    panel(g, wd, h, CREAM, INK, 6, 4);
    column(g, '駅前駐車場', wd / 2, h * 0.05, h * 0.95, wd * 0.8, '#3f71aa');
  } },
  gas: { h: 48, paint: (g, wd, h) => {
    panel(g, wd, h, '#d8333d', null, 2, 0);
    words(g, 'SELF  セルフ給油  OPEN 24h', wd / 2, h / 2, wd * 0.94, h * 0.66, CREAM, HEAVY);
  } },
  price: { h: 160, paint: (g, wd, h) => {
    panel(g, wd, h, '#1d1b26', CREAM, 6, 4);
    const rows = [['レギュラー', '168', '#ffd86a'], ['ハイオク', '179', '#ff8a7a'], ['軽油', '149', '#7ee08a']];
    rows.forEach(([n, p, c], i) => {
      const y = h * (0.2 + i * 0.3);
      words(g, n, wd * 0.3, y, wd * 0.5, h * 0.14, CREAM);
      words(g, p, wd * 0.74, y, wd * 0.4, h * 0.2, c, HEAVY);
    });
  } },
  koban: { h: 64, paint: (g, wd, h) => {
    panel(g, wd, h, '#203a6a', CREAM, 4, 3);
    words(g, '交番', wd * 0.34, h / 2, wd * 0.5, h * 0.66, CREAM, HEAVY);
    words(g, 'KOBAN', wd * 0.76, h / 2, wd * 0.36, h * 0.4, CREAM, HEAVY);
  } },
  event: { h: 64, paint: (g, wd, h) => {
    g.fillStyle = INK;
    g.fillRect(0, 0, wd, h);
    for (let x = 0; x < wd; x += h / 2) {
      g.fillStyle = (x / (h / 2)) % 2 ? CREAM : INK;
      g.fillRect(x, 0, h / 2, h / 6);
      g.fillStyle = (x / (h / 2)) % 2 ? INK : CREAM;
      g.fillRect(x, h - h / 6, h / 2, h / 6);
    }
    lettered(g, '駅前ドリフト  EKIMAE DRIFT', wd / 2, h / 2, wd * 0.9, h * 0.52, '#ff5a6e', CREAM);
  } },
  clock: { h: 64, paint: (g, wd, h) => {
    g.fillStyle = CREAM;
    g.beginPath();
    g.arc(wd / 2, h / 2, h * 0.46, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    g.beginPath();
    g.moveTo(wd / 2, h / 2);
    g.lineTo(wd / 2 + h * 0.2, h / 2 - h * 0.12);
    g.moveTo(wd / 2, h / 2);
    g.lineTo(wd / 2 - h * 0.05, h / 2 - h * 0.36);
    g.stroke();
  } },
  taxi: { h: 64, paint: (g, wd, h) => {
    panel(g, wd, h, '#f2bd34', INK, 4, 3);
    words(g, 'タクシー', wd / 2, h / 2, wd * 0.9, h * 0.6, INK, HEAVY);
  } },
  arcade: { h: 96, paint: (g, wd, h) => {
    panel(g, wd, h, '#1d1b26', '#f2bd34', 8, 5);
    lettered(g, 'かもめ台銀座商店街', wd / 2, h * 0.42, wd * 0.92, h * 0.5, '#ffd86a', INK);
    words(g, 'KAMOMEDAI GINZA SHOPPING STREET', wd / 2, h * 0.8, wd * 0.8, h * 0.16, CREAM);
  } },
};

/* Where each sign's cell is on the atlas, by its key. */
function packSigns(signs) {
  const aspect = new Map();
  for (const s of signs) {
    if (!aspect.has(s.key)) {
      aspect.set(s.key, s.w / s.ht);
    }
  }
  const items = [...aspect.entries()].map(([key, a]) => {
    const ch = SIGNS[key]?.h ?? CELL_H;
    return { key, w: Math.min(ATLAS_W, Math.max(8, Math.round(ch * a))), h: ch };
  });
  items.sort((a, b) => b.h - a.h || b.w - a.w || (a.key < b.key ? -1 : 1));
  const cells = {};
  let x = 0;
  let y = 0;
  let row = 0;
  for (const it of items) {
    if (x + it.w > ATLAS_W) {
      x = 0;
      y += row + PAD;
      row = 0;
    }
    cells[it.key] = { x, y, w: it.w, h: it.h };
    x += it.w + PAD;
    row = Math.max(row, it.h);
  }
  const used = y + row;
  let h = 64;
  while (h < used) {
    h *= 2;
  }
  return { cells, w: ATLAS_W, h };
}

/* Every key the plan uses has a painter: the check reads this. */
export function signKeys() {
  return Object.keys(SIGNS);
}

/* The picture, painted: a canvas with every cell's sign on it. */
export function paintSigns(signs) {
  const { cells, w: aw, h } = packSigns(signs);
  const c = document.createElement('canvas');
  c.width = aw;
  c.height = h;
  const g = c.getContext('2d');
  for (const [key, cell] of Object.entries(cells)) {
    const s = SIGNS[key];
    g.save();
    g.translate(cell.x, cell.y);
    g.beginPath();
    g.rect(0, 0, cell.w, cell.h);
    g.clip();
    if (s) {
      s.paint(g, cell.w, cell.h);
    }
    g.restore();
  }
  return { canvas: c, cells, w: aw, h };
}

/* A plan face's outward normal, as the world's [x, y, z]. */
const NORMAL = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0] };

/* The mesh: one quad a sign, on its cell. */
export function signMesh(THREE, signs, atlas, material) {
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
    n.fromArray(NORMAL[s.face]);
    right.crossVectors(up, n).normalize();
    const [x, y, z] = w(s.px, s.py, s.h);
    const base = pos.length / 3;
    for (const [sx, sy, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      c.set(x, y, z).addScaledVector(n, s.lift).addScaledVector(right, (sx * s.w) / 2).addScaledVector(up, (sy * s.ht) / 2);
      pos.push(c.x, c.y, c.z);
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
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'ekimae signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
