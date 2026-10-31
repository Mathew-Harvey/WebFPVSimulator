/*
 * signs.js: every word Hamakaze Works has on its walls, painted once into
 * one picture and hung as one mesh (Sunnyfield's machinery, ../sunny/
 * signs.js, restated for this map's frame). The words are the generic
 * Japanese a works writes for itself, in the town's ink and paper: 安全第一
 * (safety first) on the board at the corner, 頭上注意 (mind overhead) in
 * the steel shop's doors, 火気厳禁 (no naked flames) at the tanks, 止まれ
 * (stop) painted on the road, the code numbers on the tanks and spheres.
 * The works' name is our own; there is no real company anywhere here.
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

import { worldAt } from './frame.js';

const INK = '#1d1b26';
const CREAM = '#fbf8f0';
const RED = '#c8463c';
const GREEN = '#2f8a52';
const YELLOW = '#f2c12e';
const BLUE = '#2f5a9a';
const JP = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', sans-serif`;
const HEAVY = `900 {px}px ${JP}`;
const BOLD = `700 {px}px ${JP}`;
const LATIN = '900 {px}px "Arial Black", "Helvetica Neue", Arial, sans-serif';

/* The atlas is this wide; a cell is this many pixels high unless its key
 * says otherwise, and as wide as its first use's aspect makes it. */
const ATLAS_W = 1024;
const CELL_H = 64;
const PAD = 3;

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

/* A plate: a coloured band with the kanji, and a line of English under. */
const plate = (bg, fg, jp, en = null) => (g, w, h) => {
  panel(g, w, h, bg, INK, 4, 3);
  if (en) {
    words(g, jp, w / 2, h * 0.4, w * 0.9, h * 0.56, fg);
    words(g, en, w / 2, h * 0.82, w * 0.86, h * 0.2, fg, LATIN);
  } else {
    words(g, jp, w / 2, h / 2 + 1, w * 0.9, h * 0.7, fg);
  }
};

/* A square safety sign: a coloured head with its kanji, a picture-less
 * body with the warning in big type, as JIS Z 9101 signs are laid out. */
const safety = (head, headInk, body, sub) => (g, w, h) => {
  panel(g, w, h, CREAM, INK, 4, 3);
  g.fillStyle = head;
  g.fillRect(4, 4, w - 8, h * 0.3);
  words(g, sub, w / 2, h * 0.19, w * 0.84, h * 0.2, headInk, LATIN);
  words(g, body, w / 2, h * 0.64, w * 0.86, h * 0.42, INK);
};

/* A drum's band of code: the tag big, the service small. */
const tag = (code, what) => (g, w, h) => {
  g.fillStyle = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, w, h);
  words(g, code, w * 0.36, h * 0.52, w * 0.64, h * 0.78, '#3b4a6a', LATIN);
  words(g, what, w * 0.82, h * 0.52, w * 0.32, h * 0.42, '#3b4a6a');
};

const SIGNS = {
  hallName: { h: 96, paint: plate(CREAM, INK, '第二製鋼工場', 'No. 2 STEEL SHOP') },
  works: { h: 128, paint: (g, w, h) => {
    panel(g, w, h, '#e8e0cc', INK, 2, 3);
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(Math.PI / 2);
    words(g, '浜風製鉄所', 0, 0, h * 0.9, w * 0.62, INK);
    g.restore();
  } },
  worksPlate: { h: 96, paint: (g, w, h) => {
    panel(g, w, h, '#7a8a8a', INK, 2, 3);
    words(g, 'HAMAKAZE', w / 2, h * 0.3, w * 0.86, h * 0.18, CREAM, LATIN);
    words(g, 'WORKS', w / 2, h * 0.5, w * 0.86, h * 0.18, CREAM, LATIN);
    words(g, '正門', w / 2, h * 0.76, w * 0.8, h * 0.24, CREAM);
  } },
  safetyFirst: { h: 96, paint: (g, w, h) => {
    panel(g, w, h, CREAM, GREEN, 6, 6);
    const r = h * 0.3;
    g.fillStyle = GREEN;
    g.fillRect(w * 0.1 - r * 0.32, h / 2 - r, r * 0.64, r * 2);
    g.fillRect(w * 0.1 - r, h / 2 - r * 0.32, r * 2, r * 0.64);
    words(g, '安全第一', w * 0.56, h * 0.44, w * 0.76, h * 0.62, GREEN);
    words(g, 'ゼロ災でいこう ヨシ!', w * 0.56, h * 0.84, w * 0.7, h * 0.16, INK, BOLD);
  } },
  safetyFlag: { h: 64, paint: (g, w, h) => {
    g.fillStyle = CREAM;
    g.fillRect(0, 0, w, h);
    const r = h * 0.3;
    g.fillStyle = GREEN;
    g.fillRect(w / 2 - r * 0.33, h / 2 - r, r * 0.66, r * 2);
    g.fillRect(w / 2 - r, h / 2 - r * 0.33, r * 2, r * 0.66);
  } },
  overhead: { h: 64, paint: safety(YELLOW, INK, '頭上注意', 'CAUTION') },
  helmet: { h: 64, paint: safety(BLUE, CREAM, 'ヘルメット着用', 'HARD HATS') },
  noFire: { h: 64, paint: safety(RED, CREAM, '火気厳禁', 'NO FIRE') },
  noEntry: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, CREAM, RED, 3, 5);
    words(g, '立入禁止', w / 2, h * 0.42, w * 0.86, h * 0.5, RED);
    words(g, 'KEEP OUT', w / 2, h * 0.82, w * 0.6, h * 0.18, INK, LATIN);
  } },
  highVoltage: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, YELLOW, INK, 3, 4);
    words(g, '危険 高電圧', w / 2, h * 0.42, w * 0.86, h * 0.48, INK);
    words(g, 'DANGER HIGH VOLTAGE', w / 2, h * 0.82, w * 0.8, h * 0.18, INK, LATIN);
  } },
  bayNo: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, YELLOW, INK, 3, 4);
    words(g, 'A-1', w / 2, h / 2 + 2, w * 0.8, h * 0.78, INK, LATIN);
  } },
  crane: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, YELLOW, INK, 2, 4);
    words(g, '3号アンローダー', w * 0.36, h / 2, w * 0.6, h * 0.5, INK);
    words(g, '定格 30t', w * 0.82, h / 2, w * 0.3, h * 0.44, RED);
  } },
  capacity: { h: 48, paint: (g, w, h) => {
    panel(g, w, h, YELLOW, INK, 2, 3);
    words(g, '定格荷重 80t', w / 2, h / 2 + 1, w * 0.86, h * 0.62, INK);
  } },
  tower: { h: 64, paint: plate(CREAM, INK, '第1乗継塔', 'TRANSFER TOWER 1') },
  gallery: { h: 48, paint: plate('#6f9a7a', CREAM, 'BC-12 ベルトコンベヤ') },
  clearance: { h: 48, paint: (g, w, h) => {
    panel(g, w, h, CREAM, INK, 2, 3);
    words(g, '制限高 5.5m', w / 2, h / 2 + 1, w * 0.86, h * 0.66, RED);
  } },
  rackNo: { h: 32, paint: plate(CREAM, INK, 'R-3') },
  sphere1: { h: 48, paint: tag('S-201', 'LPG') },
  sphere2: { h: 48, paint: tag('S-202', 'LPG') },
  sphere3: { h: 48, paint: tag('S-203', 'ブタン') },
  tank1: { h: 64, paint: tag('T-101', '重油') },
  tank2: { h: 64, paint: tag('T-102', '軽油') },
  tank3: { h: 64, paint: tag('T-103', '原油') },
  tankFarm: { h: 32, paint: plate(RED, CREAM, '危険物 タンクヤード') },
  control: { h: 48, paint: plate(CREAM, INK, '中央制御室', 'CENTRAL CONTROL') },
  switchRoom: { h: 32, paint: plate(CREAM, INK, '電気室') },
  canteen: { h: 32, paint: plate(CREAM, INK, '食堂') },
  exit: { h: 32, paint: (g, w, h) => {
    panel(g, w, h, GREEN, CREAM, 2, 2);
    words(g, '非常口', w / 2, h / 2 + 1, w * 0.8, h * 0.7, CREAM);
  } },
  cooler: { h: 48, paint: plate('#5f86ad', CREAM, '冷却塔 No.2') },
  tomare: { h: 64, paint: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    words(g, '止まれ', w / 2, h / 2, w * 0.98, h * 0.8, CREAM);
  } },
  speed: { h: 64, paint: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    disc(g, w / 2, h / 2, h * 0.46, 'rgba(0,0,0,0)', CREAM, 5);
    words(g, '15', w / 2, h / 2 + 2, w * 0.6, h * 0.5, CREAM, LATIN);
  } },
  guard: { h: 32, paint: plate(CREAM, INK, '守衛所') },
  smoking: { h: 32, paint: plate('#3f3c48', CREAM, '喫煙所') },
  mirror: { h: 64, paint: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    disc(g, w / 2, h / 2, h * 0.47, '#f08a34');
    disc(g, w / 2, h / 2, h * 0.38, '#b8d4e4');
    disc(g, w * 0.42, h * 0.4, h * 0.1, 'rgba(255,255,255,0.7)');
  } },
  hydrant: { h: 32, paint: (g, w, h) => {
    panel(g, w, h, RED, INK, 2, 2);
    words(g, '消火栓', w / 2, h / 2 + 1, w * 0.86, h * 0.6, CREAM);
  } },
  workshop: { h: 48, paint: plate(CREAM, INK, '整備工場', 'MAINTENANCE') },
  siteOffice: { h: 32, paint: plate(CREAM, INK, '工事事務所') },
};

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
  mesh.name = 'factory signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
