/*
 * signs.js: every sign at Kirigaoka Sanatorium, painted once into one
 * picture and hung as one mesh, the way Sunnyfield's are
 * (../sunny/signs.js): the name over the door and on the gatepost, the
 * wards' plates, the stopped clocks, the keep out boards on the wall, the
 * bus stop. Lettered in the town's Japanese face, and weathered: every
 * sign gets the same stain wash and grit after it is lettered, so none of
 * them looks new on a building that is not.
 *
 * The plan (./plan.js, ./wards.js) asks for a sign with T.sign(key, px, py,
 * h, w, ht, face); this paints each key once at the shape of its first use
 * and builds the mesh of every use. Render only: nothing here is solid.
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

import { worldAt } from '../sunny/frame.js';

/* The town's Japanese face (../city/places/signs.js), and its ink. */
const JP = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'MS Gothic', 'Hiragino Kaku Gothic ProN', sans-serif`;
const MIN = `'Yu Mincho', 'Hiragino Mincho ProN', 'MS Mincho', serif`;
const INK = '#2a2433';
const ATLAS_W = 1024;
const CELL_H = 128;
const PAD = 4;

/* Words fitted to a width, centred on (x, y). */
function words(g, text, x, y, maxW, px, colour, face = JP, weight = 700) {
  g.font = `${weight} ${px}px ${face}`;
  const w = g.measureText(text).width;
  const k = w > maxW ? maxW / w : 1;
  g.save();
  g.translate(x, y);
  g.scale(k, 1);
  g.fillStyle = colour;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  g.restore();
}

/* Words down a column, one character under the next, as a plaque is. */
function column(g, text, x, y0, y1, px, colour, face = MIN) {
  const chars = [...text];
  const step = (y1 - y0) / chars.length;
  chars.forEach((c, i) => words(g, c, x, y0 + step * (i + 0.5), px * 1.2, Math.min(px, step * 0.92), colour, face, 800));
}

function board(g, w, h, fill, edge = INK, lw = 6) {
  g.fillStyle = fill;
  g.fillRect(0, 0, w, h);
  g.lineWidth = lw;
  g.strokeStyle = edge;
  g.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
}

/*
 * The weather, over every sign: a wash of tea brown from the top edge
 * down where rain has run, rust blooms from the fixings, and grit. Seeded
 * by the key, so a sign weathers the same on every load.
 */
function weather(g, w, h, seed) {
  let a = seed | 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 6; i += 1) {
    const x = rnd() * w;
    const len = h * (0.3 + rnd() * 0.7);
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, 'rgba(110,80,50,0.35)');
    grad.addColorStop(1, 'rgba(110,80,50,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 6 + rnd() * w * 0.08, len);
  }
  for (let i = 0; i < 4; i += 1) {
    g.fillStyle = 'rgba(150,80,40,0.28)';
    g.beginPath();
    g.ellipse(rnd() * w, rnd() * h, 4 + rnd() * 12, 3 + rnd() * 8, 0, 0, 6.283);
    g.fill();
  }
  for (let i = 0; i < (w * h) / 220; i += 1) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(40,30,40,0.18)' : 'rgba(255,250,235,0.2)';
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  g.restore();
}

const SIGNS = {
  /* The name in relief letters over the hall's door. */
  name: { paint: (g, w, h) => {
    board(g, w, h, '#ece3cf', '#8e7a4e', 8);
    words(g, '霧ヶ丘療養所', w / 2, h / 2 + 2, w * 0.9, h * 0.66, '#5f5236', MIN, 800);
  } },
  /* The same on the gatepost, brushed on a timber plate. */
  plaque: { paint: (g, w, h) => {
    board(g, w, h, '#d9c7a4', '#5a4634', 6);
    column(g, '霧ヶ丘療養所', w / 2, h * 0.06, h * 0.94, w * 0.62, INK);
  } },
  ward1: { paint: (g, w, h) => {
    board(g, w, h, '#f1eadb', INK, 6);
    column(g, '第一病棟', w / 2, h * 0.08, h * 0.92, w * 0.6, INK, JP);
  } },
  ward2: { paint: (g, w, h) => {
    board(g, w, h, '#f1eadb', INK, 6);
    column(g, '第二病棟', w / 2, h * 0.08, h * 0.92, w * 0.6, INK, JP);
  } },
  chapel: { paint: (g, w, h) => {
    board(g, w, h, '#c9b08a', '#4a3a2c', 6);
    words(g, '礼拝堂', w / 2, h / 2, w * 0.8, h * 0.66, '#2e2418', MIN, 800);
  } },
  boiler: { paint: (g, w, h) => {
    board(g, w, h, '#eeeae2', INK, 5);
    words(g, 'ボイラー室', w / 2, h / 2, w * 0.86, h * 0.62, INK);
  } },
  keepout: { paint: (g, w, h) => {
    board(g, w, h, '#f6f3ec', '#c8362f', 8);
    words(g, '立入禁止', w / 2, h * 0.42, w * 0.86, h * 0.48, '#c8362f', JP, 900);
    words(g, '管理者', w / 2, h * 0.8, w * 0.5, h * 0.18, INK);
  } },
  danger: { paint: (g, w, h) => {
    g.fillStyle = '#f2c12e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = INK;
    for (let x = -h; x < w; x += 26) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 13, h);
      g.lineTo(x + 13 + h * 0.18, h * 0.82);
      g.lineTo(x + h * 0.18, h * 0.82);
      g.fill();
    }
    words(g, '危険', w / 2, h * 0.3, w * 0.6, h * 0.38, INK, JP, 900);
    words(g, '崩落注意', w / 2, h * 0.62, w * 0.7, h * 0.22, INK, JP, 800);
  } },
  notice: { paint: (g, w, h) => {
    board(g, w, h, '#f4f1e8', INK, 4);
    words(g, 'お知らせ', w / 2, h * 0.16, w * 0.6, h * 0.16, INK);
    g.fillStyle = 'rgba(42,36,51,0.55)';
    for (let i = 0; i < 6; i += 1) {
      g.fillRect(w * 0.1, h * (0.32 + i * 0.1), w * (0.55 + ((i * 37) % 30) / 100), 3);
    }
  } },
  /* The clock: a cream face, its ring, the hours, its hands stopped. */
  clock: { paint: (g, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 3;
    g.fillStyle = '#7d6a44';
    g.beginPath();
    g.arc(cx, cy, r, 0, 6.283);
    g.fill();
    g.fillStyle = '#f4ecd8';
    g.beginPath();
    g.arc(cx, cy, r * 0.86, 0, 6.283);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 4;
    for (let k = 0; k < 12; k += 1) {
      const a = (k * 6.283) / 12;
      const s = Math.sin(a);
      const c = Math.cos(a);
      g.beginPath();
      g.moveTo(cx + s * r * 0.62, cy - c * r * 0.62);
      g.lineTo(cx + s * r * 0.78, cy - c * r * 0.78);
      g.stroke();
    }
    const hand = (a, len, lw) => {
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len);
      g.stroke();
    };
    hand(3.2 * 0.5236, r * 0.42, 7);
    hand(12 * 0.1047, r * 0.66, 5);
  } },
  /* The green running man over a door, lit once, dark now. */
  exit: { paint: (g, w, h) => {
    board(g, w, h, '#3e9a62', INK, 4);
    g.fillStyle = '#eaf4ea';
    g.beginPath();
    g.arc(h * 0.62, h * 0.24, h * 0.12, 0, 6.283);
    g.fill();
    g.fillRect(h * 0.45, h * 0.38, h * 0.22, h * 0.32);
    g.fillRect(h * 0.25, h * 0.68, h * 0.25, h * 0.12);
    g.fillRect(h * 0.62, h * 0.66, h * 0.12, h * 0.28);
    words(g, '非常口', w * 0.62, h / 2, w * 0.5, h * 0.6, '#eaf4ea', JP, 900);
  } },
  busstop: { paint: (g, w, h) => {
    const r = Math.min(w, h) / 2 - 2;
    g.fillStyle = '#f6f3ec';
    g.beginPath();
    g.arc(w / 2, h / 2, r, 0, 6.283);
    g.fill();
    g.lineWidth = r * 0.16;
    g.strokeStyle = '#2f6fb0';
    g.stroke();
    words(g, 'バス', w / 2, h * 0.34, r * 1.1, r * 0.34, '#2f6fb0', JP, 900);
    words(g, '療養所前', w / 2, h * 0.62, r * 1.5, r * 0.32, INK, JP, 800);
  } },
  timetable: { paint: (g, w, h) => {
    board(g, w, h, '#f4f1e8', INK, 4);
    words(g, '時刻表', w / 2, h * 0.1, w * 0.7, h * 0.12, INK);
    g.fillStyle = 'rgba(42,36,51,0.6)';
    for (let i = 0; i < 9; i += 1) {
      g.fillRect(w * 0.1, h * (0.22 + i * 0.085), w * 0.18, 4);
      g.fillRect(w * 0.36, h * (0.22 + i * 0.085), w * (0.2 + ((i * 29) % 40) / 100), 4);
    }
  } },
};

/*
 * The cells: each key's first use sets its shape, painted CELL_H high
 * (more for a tall sign), in rows left to right. Returns { cells, w, h }.
 */
function pack(signs) {
  const aspect = new Map();
  for (const s of signs) {
    if (!aspect.has(s.key)) {
      aspect.set(s.key, s.w / s.ht);
    }
  }
  const items = [...aspect.entries()].map(([key, a]) => {
    const h = a < 0.6 ? 256 : CELL_H;
    return { key, w: Math.min(ATLAS_W, Math.max(16, Math.round(h * a))), h };
  });
  items.sort((p, q) => q.h - p.h || q.w - p.w || (p.key < q.key ? -1 : 1));
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
  let h = 64;
  while (h < y + row) {
    h *= 2;
  }
  return { cells, w: ATLAS_W, h };
}

/* The picture: a canvas with every sign painted and weathered. */
export function paintSigns(signs) {
  const { cells, w, h } = pack(signs);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  let seed = 11;
  for (const [key, cell] of Object.entries(cells)) {
    g.save();
    g.translate(cell.x, cell.y);
    g.beginPath();
    g.rect(0, 0, cell.w, cell.h);
    g.clip();
    const s = SIGNS[key];
    if (s) {
      s.paint(g, cell.w, cell.h);
      weather(g, cell.w, cell.h, (seed += 7919));
    } else {
      g.fillStyle = '#ff00ff';
      g.fillRect(0, 0, cell.w, cell.h);
    }
    g.restore();
  }
  return { canvas: c, cells, w, h };
}

const NORMAL = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0] };

/* Every use as a quad on the picture, one mesh. */
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
  mesh.name = 'sana signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
