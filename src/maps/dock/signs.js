/*
 * signs.js: every painted sign in Kamome Wharf on one picture, and the one
 * mesh that shows them, the way Sunnyfield's are (../sunny/signs.js): the
 * lines' names on the boxes, the cranes' numbers, the block letters on the
 * paving, the gate's lane numbers, the ship's name, the warehouse's plate.
 * Each is a quad on a cell of one canvas, so several hundred signs cost one
 * draw call and one texture.
 *
 * Every word and every mark is the port's own. The shipping lines are
 * birds and weather of our own naming, and none is a real line's name,
 * colours or mark. The Japanese is what a port has painted on it: the
 * berth, the gate, the blocks, safety first, the reefer rack.
 *
 * The painting is the browser's: a canvas, its 2D context and its fonts,
 * the town's Japanese font list first (../city/vendored/core/textures.js).
 * What is painted is a picture and reaches no physics.
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
const JP = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'IPAGothic', sans-serif`;
const HEAVY = `900 {px}px "Arial Black", "Helvetica Neue", Arial, ${JP}`;
const BOLD = `700 {px}px "Helvetica Neue", Arial, ${JP}`;
const KANA = `700 {px}px ${JP}`;

const ATLAS_W = 1024;
const CELL_H = 64;
const PAD = 3;

function font(g, face, px) {
  g.font = face.replace('{px}', String(Math.round(px)));
}

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

/* A shipping line's name on a box's side, in paint gone a little chalky,
 * with its mark: a gull, a swallow, a wave, a star, a cloud, a sun. */
const MARKS = {
  gull: (g, x, y, r, c) => {
    g.strokeStyle = c;
    g.lineWidth = r * 0.28;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - r, y);
    g.quadraticCurveTo(x - r * 0.5, y - r * 0.8, x, y);
    g.quadraticCurveTo(x + r * 0.5, y - r * 0.8, x + r, y);
    g.stroke();
  },
  swallow: (g, x, y, r, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(x - r, y - r * 0.6);
    g.lineTo(x + r, y);
    g.lineTo(x - r, y + r * 0.6);
    g.lineTo(x - r * 0.3, y);
    g.closePath();
    g.fill();
  },
  wave: (g, x, y, r, c) => {
    g.strokeStyle = c;
    g.lineWidth = r * 0.25;
    for (const dy of [-0.35, 0.35]) {
      g.beginPath();
      g.moveTo(x - r, y + dy * r);
      g.bezierCurveTo(x - r * 0.5, y + (dy - 0.5) * r, x, y + (dy + 0.5) * r, x + r, y + dy * r);
      g.stroke();
    }
  },
  star: (g, x, y, r, c) => {
    g.fillStyle = c;
    g.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    g.closePath();
    g.fill();
  },
  cloud: (g, x, y, r, c) => {
    g.fillStyle = c;
    for (const [dx, dy, rr] of [[-0.5, 0.1, 0.45], [0, -0.2, 0.55], [0.5, 0.1, 0.45]]) {
      g.beginPath();
      g.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2);
      g.fill();
    }
  },
  sun: (g, x, y, r, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, r * 0.7, 0, Math.PI * 2);
    g.fill();
  },
};

const line = (name, mark, colour) => (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.globalAlpha = 0.92;
  MARKS[mark](g, h * 0.55, h / 2, h * 0.38, colour);
  words(g, name, w / 2 + h * 0.3, h / 2 + 1, w - h * 1.4, h * 0.62, colour);
  g.globalAlpha = 1;
};

/* A painted plate: a board, lettering, an optional line of kana under. */
const plate = (bg, fg, text, sub = null) => (g, w, h) => {
  panel(g, w, h, bg, INK, 4, 4);
  if (sub) {
    words(g, text, w / 2, h * 0.38, w * 0.88, h * 0.5, fg);
    words(g, sub, w / 2, h * 0.78, w * 0.8, h * 0.26, fg, KANA);
  } else {
    words(g, text, w / 2, h / 2 + 1, w * 0.9, h * 0.66, fg);
  }
};

/* Kana and a number painted straight on steel or concrete. */
const stencil = (text, colour, face = KANA) => (g, w, h) => {
  g.clearRect(0, 0, w, h);
  words(g, text, w / 2, h / 2 + 1, w * 0.94, h * 0.8, colour, face);
};

/* A crane's number, big in a white roundel, for the machinery house. */
const craneNo = (n) => (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = CREAM;
  g.strokeStyle = INK;
  g.lineWidth = 4;
  g.beginPath();
  g.arc(h * 0.55, h / 2, h * 0.42, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  words(g, String(n), h * 0.55, h / 2 + 2, h * 0.6, h * 0.62, INK);
  words(g, `KW-${n}`, w * 0.66, h * 0.36, w * 0.56, h * 0.36, '#2f4a6a');
  words(g, 'かもめ埠頭', w * 0.66, h * 0.74, w * 0.56, h * 0.24, '#2f4a6a', KANA);
};

const SIGNS = {
  line0: { paint: line('KAMOME LINES', 'gull', '#fbf8f0'), h: 48 },
  line1: { paint: line('TSUBAME', 'swallow', '#fbf8f0'), h: 48 },
  line2: { paint: line('NAGISA', 'wave', '#fbf8f0'), h: 48 },
  line3: { paint: line('HOSHIZORA', 'star', '#f6e7a8'), h: 48 },
  line4: { paint: line('KUMO EXPRESS', 'cloud', '#fbf8f0'), h: 48 },
  line5: { paint: line('ASAHINO', 'sun', '#ffd6c4'), h: 48 },
  crane1: { paint: craneNo(1), h: 96 },
  crane2: { paint: craneNo(2), h: 96 },
  crane3: { paint: craneNo(3), h: 96 },
  gantry0: { paint: plate('#2b2a31', '#f0c64a', 'TC-01') },
  gantry1: { paint: plate('#2b2a31', '#f0c64a', 'TC-02') },
  gantry2: { paint: plate('#2b2a31', '#f0c64a', 'TC-03') },
  gantry3: { paint: plate('#2b2a31', '#f0c64a', 'TC-04') },
  gantry4: { paint: plate('#2b2a31', '#f0c64a', 'TC-05') },
  gantry5: { paint: plate('#2b2a31', '#f0c64a', 'TC-06') },
  blockA: { paint: stencil('A', '#f2f0f4', HEAVY), h: 96 },
  blockB: { paint: stencil('B', '#f2f0f4', HEAVY), h: 96 },
  blockC: { paint: stencil('C', '#f2f0f4', HEAVY), h: 96 },
  berth: { paint: stencil('7号岸壁', '#f0c341'), h: 96 },
  reefer: { paint: plate('#3f6fa6', CREAM, 'REEFER', '冷凍コンテナ') },
  safety: { paint: plate('#2f7a4a', CREAM, '安全第一', 'SAFETY FIRST') },
  shipName: { paint: stencil('TSUBAME MARU  つばめ丸', '#fbf8f0', BOLD), h: 64 },
  shipStern: { paint: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    words(g, 'TSUBAME MARU', w / 2, h * 0.36, w * 0.9, h * 0.44, CREAM);
    words(g, 'KOBE', w / 2, h * 0.78, w * 0.5, h * 0.3, CREAM);
  }, h: 96 },
  funnel: { paint: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    MARKS.swallow(g, w / 2, h / 2, h * 0.42, '#d7463c');
  }, h: 96 },
  tug: { paint: stencil('第八 はやて丸', CREAM), h: 48 },
  brick: { paint: plate('#e6dfcf', '#5e3e5e', '二号倉庫', 'No.2 WAREHOUSE  1911') },
  rest: { paint: plate('#2f4a6a', CREAM, '休憩所  REST') },
  gate: { paint: plate('#3f6fa6', CREAM, 'GATE  ゲート  入口  徐行') },
  lane1: { paint: plate('#2b2a31', '#9cf04a', '1'), h: 48 },
  lane2: { paint: plate('#2b2a31', '#9cf04a', '2'), h: 48 },
  lane3: { paint: plate('#2b2a31', '#ff5145', '3'), h: 48 },
  lane4: { paint: plate('#2b2a31', '#9cf04a', '4'), h: 48 },
  lane5: { paint: plate('#2b2a31', '#ff5145', '5'), h: 48 },
  wharf: { paint: plate('#f2ede2', '#2f4a6a', 'KAMOME WHARF', 'かもめ埠頭 コンテナターミナル'), h: 96 },
  tower: { paint: plate('#d7463c', CREAM, 'PORT TOWER  ポートタワー'), h: 48 },
};

export const SIGN_KEYS = Object.keys(SIGNS);

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

const NORMAL = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0], up: [0, 1, 0] };

/* Every sign as a quad on its cell, one mesh. A sign on the paving reads
 * from the south, a sign on a wall upright. */
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
  mesh.name = 'dock signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
