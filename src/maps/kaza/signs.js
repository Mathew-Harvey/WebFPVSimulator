/*
 * signs.js: every painted sign on Kazahana Plain on one picture, and the
 * one mesh that shows them, Sunnyfield's way (../sunny/signs.js): a stall's
 * name board, the market's gate, the stage's backdrop, the meet's banner,
 * the bus stop, the barn's name, each a quad on a cell of one canvas, so
 * every sign on the map is one draw call and one texture.
 *
 * Every word is the plain's own, in Japanese with a little English, the
 * way a Hokkaido market letters its stalls: what is sold, never a brand.
 * The painting is the browser's, its canvas and its fonts; a font that
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

import { worldAt } from './frame.js';

const INK = '#1d1b26';
const CREAM = '#fbf8f0';
const JP = `'Yu Gothic', 'Hiragino Kaku Gothic ProN', 'Meiryo', 'Noto Sans JP', 'IPAGothic', sans-serif`;
const HEAVY = `900 {px}px ${JP}`;
const BOLD = `700 {px}px ${JP}`;

/* The atlas is this wide; a cell is this many pixels high unless its key
 * says otherwise, and as wide as its first use's aspect makes it. */
const ATLAS_W = 1024;
const CELL_H = 64;
const PAD = 3;

/* ---- the painter's hand ---- */

function font(g, face, px) {
  g.font = face.replace('{px}', String(Math.round(px)));
}

/* Words centred at (x, y), shrunk until they fit maxW. */
function words(g, text, x, y, maxW, px, colour, face = HEAVY) {
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

/* Words with an ink outline, a comic's lettering. */
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
  g.lineWidth = Math.max(2, size * 0.16);
  g.strokeStyle = line;
  g.strokeText(text, x, y);
  g.fillStyle = colour;
  g.fillText(text, x, y);
}

function panel(g, w, h, fill, edge = INK, round = 6, lw = 4) {
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

function disc(g, x, y, r, fill, edge = null, lw = 2) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  if (edge) {
    g.lineWidth = lw;
    g.strokeStyle = edge;
    g.stroke();
  }
}

/* ---- the hands ---- */

/* A stall's name board: dark timber, the goods lettered in cream, a small
 * English word under, a sprig of colour at each end. */
const stall = (text, sub, accent) => (g, w, h) => {
  panel(g, w, h, '#5a3a2c', INK, 4, 4);
  g.fillStyle = accent;
  g.fillRect(6, 6, 10, h - 12);
  g.fillRect(w - 16, 6, 10, h - 12);
  lettered(g, text, w / 2, h * 0.42, w * 0.78, h * 0.6, CREAM, INK);
  words(g, sub, w / 2, h * 0.83, w * 0.6, h * 0.2, accent, BOLD);
};

/* A kitchen car's board: its colour, the dish lettered across it. */
const board = (bg, fg, text) => (g, w, h) => {
  panel(g, w, h, bg, INK, 4, 4);
  lettered(g, text, w / 2, h / 2 + 1, w * 0.9, h * 0.7, fg, INK);
};

const GOODS = {
  jaga: ['じゃがバター', 'POTATO', '#f6c431'],
  corn: ['焼きとうもろこし', 'CORN', '#f08a34'],
  cocoa: ['ホットココア', 'COCOA', '#e0483a'],
  oden: ['おでん', 'ODEN', '#f6c431'],
  ramen: ['ラーメン', 'RAMEN', '#e0483a'],
  crepe: ['クレープ', 'CREPES', '#f39ac0'],
  imo: ['焼き芋', 'SWEET POTATO', '#b07ad8'],
  milk: ['牧場の牛乳', 'FARM MILK', '#a8dcff'],
  cheese: ['チーズ', 'CHEESE', '#f6c431'],
  butadon: ['豚丼', 'PORK BOWL', '#f08a34'],
  soft: ['ソフトクリーム', 'SOFT SERVE', '#fbf3dc'],
  amazake: ['甘酒', 'AMAZAKE', '#fbf3dc'],
  candle: ['キャンドル', 'CANDLES', '#ffc24e'],
  glass: ['ガラス細工', 'GLASS', '#a8dcff'],
  wood: ['木の工房', 'WOODCRAFT', '#c9945c'],
  yarn: ['毛糸', 'WOOL', '#f39ac0'],
  mittens: ['手袋', 'MITTENS', '#e0483a'],
  ornament: ['オーナメント', 'ORNAMENTS', '#4f9a52'],
  salmon: ['鮭', 'SALMON', '#f08a34'],
  mochi: ['いももち', 'POTATO MOCHI', '#f6c431'],
  honey: ['はちみつ', 'HONEY', '#ffc24e'],
  tea: ['お茶', 'TEA', '#4f9a52'],
  bread: ['パン', 'BREAD', '#c9945c'],
  soup: ['スープカレー', 'SOUP CURRY', '#e0483a'],
};

/* ---- the signs ---- */

const SIGNS = {
  marketGate: { h: 96, paint: (g, w, h) => {
    panel(g, w, h, '#2f3f74', INK, 8, 5);
    g.fillStyle = '#ffc24e';
    for (let x = 14; x < w - 8; x += 22) {
      disc(g, x, 9, 3.5, x % 44 < 22 ? '#ffc24e' : '#a8dcff');
      disc(g, x, h - 9, 3.5, x % 44 < 22 ? '#a8dcff' : '#ffc24e');
    }
    lettered(g, '風花ウィンターマーケット', w / 2, h * 0.44, w * 0.9, h * 0.46, CREAM, INK);
    words(g, 'KAZAHANA WINTER MARKET', w / 2, h * 0.76, w * 0.7, h * 0.16, '#ffc24e', BOLD);
  } },
  stageBack: { h: 128, paint: (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#2f3f74');
    sky.addColorStop(1, '#7d5bb4');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i += 1) {
      disc(g, (i * 97) % w, (i * 53) % (h * 0.6), 1.5 + (i % 3), i % 2 ? '#fbf3dc' : '#a8dcff');
    }
    /* Three balloons over a line of hills, the meet's picture. */
    g.fillStyle = '#3c7560';
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 20) {
      g.lineTo(x, h * 0.8 - 10 * Math.sin(x / 40));
    }
    g.lineTo(w, h);
    g.fill();
    for (const [x, y, c] of [[0.2, 0.42, '#e0483a'], [0.5, 0.3, '#f6c431'], [0.8, 0.45, '#2fa4a0']]) {
      disc(g, w * x, h * y, h * 0.14, c, INK, 3);
      g.fillStyle = '#be8e56';
      g.fillRect(w * x - 5, h * y + h * 0.2, 10, 8);
    }
    lettered(g, '風花バルーンフェスタ', w / 2, h * 0.62, w * 0.6, h * 0.2, CREAM, INK);
  } },
  meetBanner: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, CREAM, '#e0483a', 4, 5);
    lettered(g, 'バルーンフェスタ', w / 2, h * 0.45, w * 0.86, h * 0.56, '#e0483a', INK);
    words(g, 'BALLOON MEET', w / 2, h * 0.84, w * 0.5, h * 0.18, '#2f3f74', BOLD);
  } },
  shrinePlaque: { h: 96, paint: (g, w, h) => {
    panel(g, w, h, '#1d1b26', '#c9a964', 2, 4);
    g.save();
    g.translate(w / 2, h / 2);
    g.fillStyle = '#e8c86a';
    font(g, HEAVY, w * 0.62);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('風', 0, -h * 0.2);
    g.fillText('宮', 0, h * 0.22);
    g.restore();
  } },
  busStop: { h: 64, paint: (g, w, h) => {
    disc(g, w / 2, h / 2, w * 0.46, '#2f6fb4', CREAM, 4);
    words(g, 'バス', w / 2, h * 0.4, w * 0.7, h * 0.3, CREAM, BOLD);
    words(g, '風花原', w / 2, h * 0.68, w * 0.7, h * 0.18, CREAM, BOLD);
  } },
  barnName: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, CREAM, INK, 4, 4);
    lettered(g, '風花牧場', w / 2, h * 0.44, w * 0.8, h * 0.5, '#bc4538', INK);
    words(g, 'KAZAHANA DAIRY', w / 2, h * 0.82, w * 0.6, h * 0.18, INK, BOLD);
  } },
  oldLine: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#d8d2c6', INK, 3, 3);
    words(g, '旧風花線 第八橋梁', w / 2, h * 0.4, w * 0.9, h * 0.32, INK, BOLD);
    words(g, 'OLD LINE, BRIDGE 8', w / 2, h * 0.76, w * 0.7, h * 0.2, '#5a3a2c', BOLD);
  } },
  kcCrepe: { h: 48, paint: board('#fbf3dc', '#e0483a', 'クレープ') },
  kcCurry: { h: 48, paint: board('#fbf3dc', '#2f7a6a', 'カレー') },
  kcCoffee: { h: 48, paint: board('#5a3a2c', '#fbf3dc', 'コーヒー') },
  kcDonut: { h: 48, paint: board('#fbf3dc', '#c0508a', 'ドーナツ') },
};
for (const [key, [text, sub, accent]] of Object.entries(GOODS)) {
  SIGNS[key] = { h: 48, paint: stall(text, sub, accent) };
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
  mesh.name = 'kaza signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
