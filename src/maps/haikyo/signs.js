/*
 * signs.js: every painted thing on Tsukimi Danchi, on one picture. The
 * building numbers on the gables, the estate's name on the gate post, the
 * city's keep out notices on the hoarding, the shops' fascias faded on the
 * annex and under the viaduct, the race's orange plates, the word painted
 * on the lane. Each a cell of one canvas atlas, and every sign one quad on
 * one mesh, one draw call for all of them (../sunny/signs.js's mechanism,
 * whose packer and mesh these are).
 *
 * THE LETTERING is the town's: Japanese in the town's font stack
 * (../city/places/signs.js), ink outlined, on boards gone pale in forty
 * years of sun. No brand anybody owns: the shops are what they sold, the
 * estate and its name are ours.
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

import { worldAt } from './frame.js';

const INK = '#1d1b26';
const CREAM = '#f3ecdc';
const JP = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', 'IPAGothic', sans-serif`;
const HEAVY = `900 {px}px ${JP}`;
const BOLD = `700 {px}px ${JP}`;
const LATIN = '900 {px}px "Arial Black", "Helvetica Neue", Arial, sans-serif';

const ATLAS_W = 1024;
const CELL_H = 64;
const PAD = 3;

function font(g, face, px) {
  g.font = face.replace('{px}', String(Math.round(px)));
}

function fit(g, text, maxW, px, face) {
  let size = px;
  font(g, face, size);
  while (size > 6 && g.measureText(text).width > maxW) {
    size -= 1;
    font(g, face, size);
  }
  return size;
}

/* Words centred at (x, y), plain. */
function words(g, text, x, y, maxW, px, colour, face = BOLD) {
  fit(g, text, maxW, px, face);
  g.fillStyle = colour;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/* Words with an ink outline, a comic's lettering. */
function lettered(g, text, x, y, maxW, px, colour, line = INK, face = HEAVY) {
  const size = fit(g, text, maxW, px, face);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, size * 0.14);
  g.strokeStyle = line;
  g.strokeText(text, x, y);
  g.fillStyle = colour;
  g.fillText(text, x, y);
}

/* Vertical words, a character a line, centred on x. */
function column(g, text, x, y0, y1, maxW, colour, face = HEAVY, line = null) {
  const chars = [...text];
  const step = (y1 - y0) / chars.length;
  const size = Math.min(step * 0.86, maxW);
  font(g, face, size);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const y = y0 + step * (i + 0.5);
    if (line) {
      g.lineWidth = Math.max(2, size * 0.12);
      g.strokeStyle = line;
      g.strokeText(ch, x, y);
    }
    g.fillStyle = colour;
    g.fillText(ch, x, y);
  });
}

function panel(g, w, h, fill, edge = INK, round = 4, lw = 4) {
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(lw / 2, lw / 2, w - lw, h - lw, round);
  g.fill();
  if (edge) {
    g.lineWidth = lw;
    g.strokeStyle = edge;
    g.stroke();
  }
}

/* Age: rust runs and grime from the top edge, and a few hatched strokes
 * in the corner the way the town's pen shades a board. */
function weather(g, w, h, seed) {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  g.fillStyle = 'rgba(120, 72, 52, 0.28)';
  for (let i = 0; i < 6; i += 1) {
    const x = rnd() * w;
    g.fillRect(x, 0, 1 + rnd() * 3, h * (0.2 + rnd() * 0.6));
  }
  g.strokeStyle = 'rgba(29, 27, 38, 0.22)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 7; i += 1) {
    const x = w - 4 - i * 5;
    g.beginPath();
    g.moveTo(x, h - 3);
    g.lineTo(x + 10, h - 16);
    g.stroke();
  }
}

/* A shop's fascia, faded: a board in its colour and what it sold. */
const fascia = (bg, fg, text, seed) => (g, w, h) => {
  panel(g, w, h, bg, INK, 3, 3);
  lettered(g, text, w / 2, h / 2 + 1, w * 0.9, h * 0.66, fg, INK, HEAVY);
  weather(g, w, h, seed);
};

/* A race plate: orange, ink edged, the gate's number big. */
const plate = (n) => (g, w, h) => {
  panel(g, w, h, '#f08a34', INK, 10, 6);
  g.fillStyle = '#fbf3e4';
  g.beginPath();
  g.arc(w / 2, h / 2, h * 0.38, 0, Math.PI * 2);
  g.fill();
  lettered(g, String(n), w / 2, h / 2 + 2, w * 0.7, h * 0.56, INK, '#fbf3e4', LATIN);
};

const SIGNS = {
  /* The block's number, painted on both gables: big, a little chalky. */
  gable1: { h: 256, paint: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    lettered(g, '1', w / 2, h * 0.4, w * 0.9, h * 0.62, '#4f7f86', '#e4dccb', LATIN);
    lettered(g, '号棟', w / 2, h * 0.84, w * 0.8, h * 0.17, '#4f7f86', '#e4dccb', HEAVY);
  } },
  /* The estate's name on the gate post, cast in a plate, vertical. */
  estatePlate: { h: 256, paint: (g, w, h) => {
    panel(g, w, h, '#8a7a62', INK, 2, 3);
    column(g, '月見団地', w / 2, h * 0.06, h * 0.94, w * 0.8, '#efe4c8', HEAVY, INK);
  } },
  keepOut: { h: 96, paint: (g, w, h) => {
    panel(g, w, h, '#f6f2e8', INK, 2, 4);
    g.fillStyle = '#d6443a';
    g.fillRect(4, 4, w - 8, h * 0.36);
    words(g, '危険', w / 2, h * 0.22, w * 0.8, h * 0.28, '#fbf3e4', HEAVY);
    words(g, '立入禁止', w / 2, h * 0.62, w * 0.9, h * 0.3, INK, HEAVY);
    words(g, 'KEEP OUT', w / 2, h * 0.86, w * 0.6, h * 0.13, INK, LATIN);
  } },
  danger: { h: 128, paint: (g, w, h) => {
    panel(g, w, h, '#f6c431', INK, 2, 4);
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(w / 2, h * 0.08);
    g.lineTo(w * 0.85, h * 0.6);
    g.lineTo(w * 0.15, h * 0.6);
    g.closePath();
    g.fill();
    words(g, '!', w / 2, h * 0.42, w * 0.3, h * 0.3, '#f6c431', LATIN);
    words(g, '倒壊注意', w / 2, h * 0.8, w * 0.86, h * 0.2, INK, HEAVY);
  } },
  notice: { h: 96, paint: (g, w, h) => {
    panel(g, w, h, '#f4f0e6', INK, 2, 3);
    words(g, 'お知らせ', w / 2, h * 0.18, w * 0.6, h * 0.18, INK, HEAVY);
    g.fillStyle = 'rgba(29,27,38,0.5)';
    for (let i = 0; i < 5; i += 1) {
      g.fillRect(w * 0.12, h * (0.36 + i * 0.11), w * (0.76 - (i % 2) * 0.2), 3);
    }
    weather(g, w, h, 7);
  } },
  annexSign: { h: 96, paint: (g, w, h) => {
    panel(g, w, h, '#e8dcc0', INK, 3, 4);
    lettered(g, '月見ショッピングセンター', w / 2, h * 0.46, w * 0.92, h * 0.5, '#c4544a', INK, HEAVY);
    words(g, 'TSUKIMI SHOPPING CENTRE', w / 2, h * 0.84, w * 0.6, h * 0.14, '#5a4a4a', LATIN);
    weather(g, w, h, 3);
  } },
  annexNo: { h: 96, paint: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    lettered(g, '2', w / 2, h * 0.5, w * 0.9, h * 0.8, '#4f7f86', '#e4dccb', LATIN);
  } },
  shop0: { h: 48, paint: fascia('#d9e4dc', '#2f6a4a', '八百屋', 11) },
  shop1: { h: 48, paint: fascia('#f0dcc4', '#b0503e', 'クリーニング', 12) },
  shop2: { h: 48, paint: fascia('#e4e0ec', '#3f4f8a', '理容', 13) },
  shop3: { h: 48, paint: fascia('#f2e6b8', '#7a4a2a', 'たばこ', 14) },
  shop4: { h: 48, paint: fascia('#e8d4d4', '#9a3a4a', '精肉', 15) },
  shop5: { h: 48, paint: fascia('#dde8ee', '#2f5a7a', '薬局', 16) },
  boilerSign: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#d8d2c6', INK, 2, 3);
    lettered(g, 'ボイラー室', w / 2, h / 2 + 1, w * 0.86, h * 0.6, '#3a3646', '#d8d2c6', HEAVY);
  } },
  tankNo: { h: 96, paint: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    lettered(g, '月見団地', w / 2, h * 0.5, w * 0.92, h * 0.62, '#3f6f8a', '#dce8ee', HEAVY);
  } },
  clock: { h: 64, paint: (g, w, h) => {
    g.fillStyle = '#f4f0e6';
    g.beginPath();
    g.arc(w / 2, h / 2, h * 0.46, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    g.beginPath();
    g.moveTo(w / 2, h / 2);
    g.lineTo(w / 2 + h * 0.2, h / 2 + h * 0.18);
    g.moveTo(w / 2, h / 2);
    g.lineTo(w / 2 - h * 0.05, h * 0.16);
    g.stroke();
  } },
  bikes: { h: 48, paint: (g, w, h) => {
    panel(g, w, h, '#2f5a8a', CREAM, 3, 3);
    words(g, '自転車置場', w / 2, h / 2 + 1, w * 0.9, h * 0.66, CREAM, HEAVY);
  } },
  stopWord: { h: 128, paint: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    words(g, 'とまれ', w / 2, h / 2, w * 0.96, h * 0.8, 'rgba(246,244,236,0.92)', HEAVY);
  } },
  pierNo: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#f4f0e6', INK, 2, 3);
    words(g, 'R', w / 2, h * 0.3, w * 0.8, h * 0.3, INK, LATIN);
    words(g, '高架', w / 2, h * 0.7, w * 0.86, h * 0.3, INK, HEAVY);
  } },
  underA: { h: 48, paint: fascia('#3a3646', '#f6c431', 'お好み焼', 21) },
  underB: { h: 48, paint: fascia('#e6e0d4', '#3a3646', 'タイヤ', 22) },
  underC: { h: 48, paint: fascia('#c4544a', '#fbf3e4', '居酒屋', 23) },
  underD: { h: 48, paint: fascia('#e6e0d4', '#2f5a7a', '月極駐車場', 24) },
  underE: { h: 48, paint: fascia('#2f6a4a', '#fbf3e4', '倉庫', 25) },
  underF: { h: 48, paint: fascia('#f2e6b8', '#7a4a2a', '自転車', 26) },
};
for (let n = 1; n <= 12; n += 1) {
  SIGNS[`race${n}`] = { h: 96, paint: plate(n) };
}

/* The keys a map may name, for a check that every sign it hangs is
 * painted. */
export const SIGN_KEYS = Object.keys(SIGNS);

/*
 * The cells: each key's first use sets its shape; cells in rows of their
 * own height, left to right, PAD apart. Returns { cells, w, h }.
 */
export function packSigns(signs) {
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
  /* Tallest first, so each row is filled by cells of its own height. */
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

/* The picture, painted: a canvas with every cell's sign on it. */
export function paintSigns(signs) {
  const { cells, w, h } = packSigns(signs);
  const c = document.createElement('canvas');
  c.width = w;
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
    } else {
      g.fillStyle = '#ff00ff';
      g.fillRect(0, 0, cell.w, cell.h);
    }
    g.restore();
  }
  return { canvas: c, cells, w, h };
}

/* A plan face's outward normal, as the world's [x, y, z]. */
const NORMAL = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0], up: [0, 1, 0] };

/*
 * A sign round a drum: a strip of quads a sixth of a metre or so wide
 * round the arc, each facing out from the drum's axis. Seen from outside,
 * the picture reads left to right as the heading grows, which is the way
 * round a plan heading turns, east toward north.
 */
function roundSign(s, u0, u1, v0, v1, pos, nor, uv, idx) {
  const span = s.w / s.r;
  const n = Math.max(4, Math.ceil(s.w / 0.4));
  const base = pos.length / 3;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const a = s.a + (t - 0.5) * span;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const R = s.r + s.lift;
    for (const [dy, tv] of [[-s.ht / 2, 0], [s.ht / 2, 1]]) {
      const [x, y, z] = worldAt(s.px + R * c, s.py + R * sn, s.h + dy);
      pos.push(x, y, z);
      nor.push(c, 0, -sn);
      uv.push(u0 + t * (u1 - u0), v0 + tv * (v1 - v0));
    }
  }
  for (let i = 0; i < n; i += 1) {
    const a = base + i * 2;
    idx.push(a, a + 2, a + 3, a, a + 3, a + 1);
  }
}

/*
 * Every sign as a quad on its cell, one mesh: positions in the world,
 * `lift` out from the face it is hung on, normals for the light.
 */
export function signMesh(THREE, signs, atlas, material) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const n = new THREE.Vector3();
  const up = new THREE.Vector3();
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
    if (s.face === 'round') {
      roundSign(s, u0, u1, v0, v1, pos, nor, uv, idx);
      continue;
    }
    n.fromArray(NORMAL[s.face]);
    if (s.face === 'up') {
      up.set(0, 0, -1);
    } else {
      up.set(0, 1, 0);
    }
    right.crossVectors(up, n).normalize();
    const [x, y, z] = worldAt(s.px, s.py, s.h);
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
  mesh.name = 'haikyo signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
