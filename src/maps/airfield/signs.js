/*
 * signs.js: every painted sign at Kazami Airfield on one picture, and the
 * one mesh that shows them, as Sunnyfield's are (../sunny/signs.js, whose
 * packing and mesh this is): the field's name on the clubhouse, the
 * hangar's number, the runway's numbers in the grass, the shrine's plaque,
 * the race's banners, and the two safety signs every Japanese workshop
 * hangs. One draw call and one texture for all of them.
 *
 * Every word is the field's own. Kazami (風見) is "watching the wind",
 * which is what a windsock does; the rest is the plain Japanese any hangar
 * has on its walls: 安全第一, safety first, under its green cross, and
 * 火気厳禁, no naked flames. No brand anywhere.
 *
 * The painting is the browser's, a canvas and its fonts. A machine with no
 * Japanese font draws the characters in whatever it has; what is painted
 * reaches no physics either way.
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
const HEAVY = '900 {px}px "Arial Black", "Helvetica Neue", Arial, sans-serif';

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

const JP = '900 {px}px "Noto Sans CJK JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
const JP_MIN = '700 {px}px "Noto Serif CJK JP", "Hiragino Mincho ProN", "Yu Mincho", serif';

/* Lettered characters down a narrow board, one under the next. */
function down(g, text, w, h, colour, face, line = null) {
  const n = text.length;
  const px = Math.min(w * 0.78, (h / n) * 0.84);
  for (let i = 0; i < n; i += 1) {
    const y = (h * (i + 0.5)) / n;
    if (line) {
      lettered(g, text[i], w / 2, y, w * 0.9, px, colour, line, face);
    } else {
      words(g, text[i], w / 2, y, w * 0.9, px, colour, face);
    }
  }
}

const SIGNS = {
  /* The field's name along the clubhouse's parapet, in both scripts. */
  clubName: {
    h: 64,
    paint: (g, w, h) => {
      panel(g, w, h, '#2c3a5e', INK, 4, 4);
      words(g, '風見飛行場', w * 0.3, h * 0.54, w * 0.5, h * 0.7, CREAM, JP);
      words(g, 'KAZAMI AIRFIELD', w * 0.74, h * 0.54, w * 0.42, h * 0.42, '#f2c33a', HEAVY);
    },
  },
  clubDoor: { paint: (g, w, h) => { panel(g, w, h, CREAM, INK, 4, 3); words(g, 'クラブハウス', w / 2, h / 2 + 1, w * 0.88, h * 0.7, INK, JP); } },
  fuelSign: { paint: (g, w, h) => { panel(g, w, h, '#d2493e', INK, 4, 3); words(g, '給油 FUEL', w / 2, h / 2 + 1, w * 0.88, h * 0.62, CREAM, JP); } },
  /* The hangar's number in a ring on its gable, and its name. */
  hangarNo: {
    h: 128,
    paint: (g, w, h) => {
      disc(g, w / 2, h / 2, Math.min(w, h) * 0.46, CREAM, INK, 6);
      disc(g, w / 2, h / 2, Math.min(w, h) * 0.38, '#2c3a5e');
      lettered(g, '1', w / 2, h / 2 + 4, w * 0.6, h * 0.62, CREAM, INK);
    },
  },
  hangarName: {
    paint: (g, w, h) => {
      panel(g, w, h, CREAM, INK, 3, 4);
      words(g, '第1格納庫', w * 0.3, h / 2 + 1, w * 0.5, h * 0.7, INK, JP);
      words(g, 'HANGAR 1', w * 0.76, h / 2 + 1, w * 0.4, h * 0.56, '#d2493e', HEAVY);
    },
  },
  /* Safety first: the green cross on white, the words under it. */
  safety: {
    h: 96,
    paint: (g, w, h) => {
      panel(g, w, h, CREAM, '#2f7a4a', 4, 6);
      g.fillStyle = '#2f9a52';
      const c = w / 2;
      const s = h * 0.13;
      g.fillRect(c - s, h * 0.1, 2 * s, h * 0.5);
      g.fillRect(c - 2.4 * s, h * 0.35 - s, 4.8 * s, 2 * s);
      words(g, '安全第一', c, h * 0.8, w * 0.86, h * 0.24, '#2f7a4a', JP);
    },
  },
  noFire: {
    h: 96,
    paint: (g, w, h) => {
      panel(g, w, h, '#d2493e', INK, 4, 4);
      down(g, '火気厳禁', w, h, CREAM, JP);
    },
  },
  /* The runway's numbers, chalk on the mown grass, read landing over them. */
  rwy09: { h: 128, paint: (g, w, h) => { g.fillStyle = '#7ea873'; g.fillRect(0, 0, w, h); words(g, '09', w / 2, h / 2 + 4, w * 0.9, h * 0.95, '#f6f2e6', HEAVY); } },
  rwy27: { h: 128, paint: (g, w, h) => { g.fillStyle = '#7ea873'; g.fillRect(0, 0, w, h); words(g, '27', w / 2, h / 2 + 4, w * 0.9, h * 0.95, '#f6f2e6', HEAVY); } },
  /* The shrine's plaque on the torii: black, gold letters, down. */
  toriiPlaque: { h: 96, paint: (g, w, h) => { panel(g, w, h, '#2f2b36', '#c9a24a', 2, 4); down(g, '風見', w, h, '#e8c35a', JP_MIN); } },
  /* The race's banner: indigo cloth, the field's name, a wind mark. */
  gateBanner: {
    paint: (g, w, h) => {
      g.fillStyle = '#3b4f86';
      g.fillRect(0, 0, w, h);
      g.fillStyle = CREAM;
      g.fillRect(0, h * 0.08, w, h * 0.05);
      g.fillRect(0, h * 0.87, w, h * 0.05);
      words(g, '風見 KAZAMI', w / 2, h / 2 + 1, w * 0.9, h * 0.6, CREAM, JP);
    },
  },
};

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
const NORMAL = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0], up: [0, 1, 0], upE: [0, 1, 0], upW: [0, 1, 0] };
/* Which way a sign lying flat reads up: north, or toward the east or the
 * west, for a runway's number read by a pilot landing over it. */
const FLAT_UP = { up: [0, 0, -1], upE: [1, 0, 0], upW: [-1, 0, 0] };

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
    if (FLAT_UP[s.face]) {
      up.fromArray(FLAT_UP[s.face]);
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
  mesh.name = 'airfield signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
