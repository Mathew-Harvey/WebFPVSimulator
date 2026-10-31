/*
 * signs.js: every painted sign on Shiokaze Point on one picture, and the
 * one mesh that shows them, Sunnyfield's device (../sunny/signs.js): each
 * sign a quad on a cell of one canvas, so the island's fifty and more cost
 * one draw call and one texture.
 *
 * The words are the island's own, in the hand a Showa resort painted its
 * signs in: the hotel's name across its roof, the annexes' numbers on their
 * end walls, a floor number by every landing, the green running man over
 * every stair door, the back street's shop boards, the harbour's. No word
 * names a real business or brand. Every board is faded and stained, the
 * way the town's are, because the place has been shut for thirty years.
 *
 * The painting is the browser's: a canvas, its 2D context and its fonts. A
 * machine with no Japanese face draws the Latin line under each board and
 * boxes for the rest, which is a picture and reaches no physics.
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

import { worldAt, rng } from './frame.js';

const INK = '#2a2536';
const CREAM = '#f2e7d3';
const PAPER = '#ece2cc';
const JP = '700 {px}px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "Noto Serif CJK JP", "MS Mincho", serif';
const JPG = '800 {px}px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", "Noto Sans CJK JP", "Meiryo", sans-serif';
const LATIN = '700 {px}px "Helvetica Neue", Arial, sans-serif';

const ATLAS_W = 1024;
const CELL_H = 64;
const PAD = 3;

function font(g, face, px) {
  g.font = face.replace('{px}', String(Math.round(px)));
}

/* Words centred at (x, y), shrunk until they fit maxW. */
function words(g, text, x, y, maxW, px, colour, face = LATIN) {
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

/* Words down a board, one character under the next, as a Japanese
 * signboard reads. */
function down(g, text, x, y0, y1, px, colour, face = JP) {
  const chars = [...text];
  const step = (y1 - y0) / chars.length;
  const size = Math.min(px, step * 0.92);
  font(g, face, size);
  g.fillStyle = colour;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  chars.forEach((c, i) => g.fillText(c, x, y0 + step * (i + 0.5)));
}

function panel(g, w, h, fill, edge = INK, lw = 4) {
  g.fillStyle = fill;
  g.fillRect(0, 0, w, h);
  if (edge) {
    g.lineWidth = lw;
    g.strokeStyle = edge;
    g.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
  }
}

/*
 * THE WEATHER on a board, the same hand on every one: rust running down
 * from the top edge, a few flakes gone to the board's ground, and a hatch
 * of fine diagonal lines over one corner the way a manga shades a worn
 * thing. Seeded by the board's key, so it is the same board every time.
 */
function weather(g, w, h, seed, rust = 'rgba(122,70,50,0.45)') {
  const r = rng(seed);
  for (let i = 0; i < Math.max(3, Math.round(w / 40)); i += 1) {
    const x = r.range(0, w);
    const len = r.range(0.2, 0.9) * h;
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, rust);
    gr.addColorStop(1, 'rgba(122,70,50,0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, r.range(2, 6), len);
  }
  g.fillStyle = 'rgba(60,52,70,0.18)';
  for (let i = 0; i < Math.round((w * h) / 900); i += 1) {
    g.fillRect(r.range(0, w), r.range(0, h), r.range(2, 7), r.range(1, 4));
  }
  g.strokeStyle = 'rgba(42,37,54,0.22)';
  g.lineWidth = 1;
  const cx = r.chance(0.5) ? 0 : w;
  for (let k = 0; k < 14; k += 1) {
    const d = k * 5;
    g.beginPath();
    g.moveTo(cx === 0 ? d : w - d, h);
    g.lineTo(cx === 0 ? d + h * 0.5 : w - d - h * 0.5, h * 0.5);
    g.stroke();
  }
}

function hash(key) {
  let h = 7;
  for (const c of key) {
    h = (h * 31 + c.charCodeAt(0)) | 0;
  }
  return h;
}

/* A shop board: the Japanese name big, the Latin line small under it. */
const board = (bg, fg, jp, latin, edge = INK) => (g, w, h, key) => {
  panel(g, w, h, bg, edge, 4);
  words(g, jp, w / 2, h * 0.42, w * 0.9, h * 0.58, fg, JP);
  if (latin) {
    words(g, latin, w / 2, h * 0.82, w * 0.7, h * 0.18, fg, LATIN);
  }
  weather(g, w, h, hash(key));
};

/* A gate's number plate: a white disc, the number, the ring. */
const gatePlate = (n) => (g, w, h) => {
  g.fillStyle = INK;
  g.fillRect(0, 0, w, h);
  g.beginPath();
  g.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2);
  g.fillStyle = CREAM;
  g.fill();
  g.lineWidth = w * 0.06;
  g.strokeStyle = n % 2 ? '#3f8a7a' : '#c86a7a';
  g.stroke();
  words(g, String(n), w / 2, h / 2 + 2, w * 0.6, h * 0.56, INK, '900 {px}px "Arial Black", "Helvetica Neue", Arial, sans-serif');
};

/* An annex's number on its end wall: the big numeral and its 号館. */
const blockNo = (n) => (g, w, h, key) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(233,223,204,0.0)';
  g.fillRect(0, 0, w, h);
  words(g, String(n), w * 0.36, h * 0.52, w * 0.5, h * 0.95, '#3a4670', '900 {px}px "Arial Black", "Helvetica Neue", Arial, sans-serif');
  down(g, '号館', w * 0.78, h * 0.18, h * 0.86, h * 0.34, '#3a4670', JPG);
  weather(g, w, h, hash(key), 'rgba(122,70,50,0.3)');
};

const floorNo = (n) => (g, w, h) => {
  panel(g, w, h, CREAM, INK, 3);
  words(g, `${n}F`, w / 2, h / 2 + 1, w * 0.8, h * 0.7, INK, LATIN);
};

const SIGNS = {
  hotelName: { h: 128, paint: (g, w, h, key) => {
    panel(g, w, h, '#efe4cc', INK, 6);
    words(g, 'ホテル潮風', w * 0.5, h * 0.42, w * 0.92, h * 0.74, '#b5322f', JPG);
    words(g, 'HOTEL SHIOKAZE', w * 0.5, h * 0.86, w * 0.6, h * 0.16, '#3a4670', LATIN);
    weather(g, w, h, hash(key));
  } },
  hotelNameBack: { h: 128, paint: (g, w, h, key) => {
    panel(g, w, h, '#d9cfba', INK, 6);
    words(g, 'ホテル潮風', w * 0.5, h * 0.48, w * 0.9, h * 0.7, 'rgba(181,50,47,0.55)', JPG);
    weather(g, w, h, hash(key) + 1);
  } },
  lobby: { h: 32, paint: board('#3a4670', CREAM, '正面玄関', 'MAIN ENTRANCE', '#1d1b26') },
  exit: { h: 40, paint: (g, w, h) => {
    panel(g, w, h, '#2f8a52', '#1d1b26', 3);
    g.fillStyle = CREAM;
    const s = h * 0.75;
    const x = h * 0.2;
    g.beginPath();
    g.arc(x + s * 0.55, h * 0.24, s * 0.12, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x + s * 0.3, h * 0.38, s * 0.3, s * 0.36);
    words(g, '非常口', w * 0.66, h * 0.5, w * 0.55, h * 0.6, CREAM, JPG);
  } },
  omiyage: { paint: board('#e0453f', CREAM, 'おみやげ', 'SOUVENIRS') },
  ryokan: { paint: board('#3d2f2a', '#efe4cc', '旅館 磯波', 'ISONAMI INN', '#1d1b26') },
  gameHall: { h: 96, paint: (g, w, h, key) => {
    panel(g, w, h, '#2a2536', '#0e0d14', 6);
    for (let i = 0; i < 18; i += 1) {
      g.beginPath();
      g.arc((w * (i + 0.5)) / 18, h * 0.12, h * 0.05, 0, Math.PI * 2);
      g.fillStyle = i % 2 ? '#f2c53d' : '#e0453f';
      g.fill();
    }
    words(g, 'ゲームセンター', w / 2, h * 0.52, w * 0.9, h * 0.5, '#f39ac0', JPG);
    words(g, 'GAME CENTER  NAMI', w / 2, h * 0.84, w * 0.6, h * 0.14, '#9fd0e0', LATIN);
    weather(g, w, h, hash(key), 'rgba(160,140,120,0.3)');
  } },
  sento: { paint: board('#3d5a8a', CREAM, 'ゆ  潮の湯', 'PUBLIC BATH', '#1d1b26') },
  dorm: { paint: board('#efe4cc', INK, '従業員寮', 'STAFF') },
  workshop: { paint: board('#5c5868', CREAM, '営繕', 'WORKS') },
  market: { paint: board('#f2e7d3', '#3a4670', '魚市場', 'FISH MARKET') },
  ice: { paint: board('#3d6ec4', CREAM, '製氷', 'ICE') },
  tunnel: { paint: board('#d2ced6', INK, '潮風隧道', 'SHIOKAZE TUNNEL') },
  tunnelN: { paint: board('#d2ced6', INK, '潮風隧道', 'SHIOKAZE TUNNEL') },
  busStop: { h: 64, paint: (g, w, h) => {
    g.fillStyle = '#3d6ec4';
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    g.fill();
    words(g, '岬', w / 2, h * 0.42, w * 0.6, h * 0.4, CREAM, JPG);
    words(g, 'BUS', w / 2, h * 0.75, w * 0.5, h * 0.18, CREAM, LATIN);
  } },
  lightDoor: { h: 64, paint: (g, w, h) => {
    g.fillStyle = '#4e6a7e';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#c9c0b4';
    g.fillRect(w * 0.7, h * 0.5, w * 0.12, h * 0.05);
  } },
  lightWindow: { h: 32, paint: (g, w, h) => {
    g.fillStyle = '#3a4258';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = CREAM;
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, w - 3, h - 3);
  } },
};
for (let n = 1; n <= 5; n += 1) {
  SIGNS[`blockNo${n}`] = { h: 128, paint: blockNo(n), clear: true };
}
for (let n = 1; n <= 7; n += 1) {
  SIGNS[`floor${n}`] = { h: 32, paint: floorNo(n) };
}
for (let n = 1; n <= 10; n += 1) {
  SIGNS[`gate${n}`] = { h: 64, paint: gatePlate(n) };
}
void PAPER;

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
      s.paint(g, cell.w, cell.h, key);
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
  mesh.name = 'shiokaze signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
