/*
 * signs.js: every painted plate at Hanabi Sound on one picture, Tonbo
 * Fest's way (../fest/signs.js): a shelf packed atlas of the signs the
 * venue uses, painted once at build in the comic's hand, and one mesh of
 * quads that read from it, so every sign on the field is one draw. The
 * moving pictures (the LED wall, the side screens) are not here: they are
 * ./show.js's.
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

import { w } from './venue.js';

const INK = '#1d1b26';
const PAPER = '#f6efdc';
const JP = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'MS Gothic', 'Hiragino Kaku Gothic ProN', sans-serif`;
const HEAVY = `900 {px}px "Arial Black", "Helvetica Neue", Arial, ${JP}`;
const BOLD = `700 {px}px "Helvetica Neue", Arial, ${JP}`;
const JPB = `bold {px}px ${JP}`;

const ATLAS_W = 2048;
const PAD = 4;

/* ---- the painter's hand ---- */

function font(g, face, px) {
  g.font = face.replace('{px}', String(Math.round(px)));
}

/* Words centred at (x, y), shrunk to fit maxW, with an ink line round
 * them when `line` is given: a comic's lettering. */
function words(g, text, x, y, maxW, px, colour, face = HEAVY, line = null) {
  let size = px;
  font(g, face, size);
  while (size > 6 && g.measureText(text).width > maxW) {
    size -= 1;
    font(g, face, size);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (line) {
    g.lineJoin = 'round';
    g.lineWidth = Math.max(2, size * 0.16);
    g.strokeStyle = line;
    g.strokeText(text, x, y);
  }
  g.fillStyle = colour;
  g.fillText(text, x, y);
}

/* Characters down a column, as a nobori or a plate is written. */
function column(g, text, x, y0, step, px, colour, line = null) {
  [...text].forEach((ch, i) => words(g, ch, x, y0 + i * step, px * 1.3, px, colour, JPB, line));
}

function panel(g, wd, ht, fill, edge = INK, lw = 4) {
  g.fillStyle = fill;
  g.fillRect(0, 0, wd, ht);
  if (edge) {
    g.lineWidth = lw;
    g.strokeStyle = edge;
    g.strokeRect(lw / 2, lw / 2, wd - lw, ht - lw);
  }
}

/* Speed lines, the manga's, fanned from a point off the left. */
function speedLines(g, wd, ht, colour, n = 18) {
  g.save();
  g.strokeStyle = colour;
  for (let i = 0; i < n; i += 1) {
    const y = ((i * 37) % 100) / 100 * ht;
    g.lineWidth = 1 + (i % 3);
    g.beginPath();
    g.moveTo(wd * (0.55 + ((i * 13) % 30) / 100), y);
    g.lineTo(wd, y + (y - ht / 2) * 0.08);
    g.stroke();
  }
  g.restore();
}

/* A firework burst: rays from a point, a dot at each tip, in a colour. */
function burst(g, x, y, r, colour) {
  g.save();
  g.strokeStyle = colour;
  g.fillStyle = colour;
  g.lineCap = 'round';
  const n = 16;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    g.lineWidth = Math.max(1.5, r * 0.06);
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25);
    g.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85);
    g.stroke();
    g.beginPath();
    g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, Math.max(1.5, r * 0.07), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

const PINK = '#f0508c';
const TEAL = '#2ec4c0';
const GOLD = '#f2b632';
const NIGHT = '#1d1b2e';

/* A plain plate: Japanese over English, as an event's signs are. */
const plate = (jp, en, bg = PAPER, fg = INK) => (g, wd, ht) => {
  panel(g, wd, ht, bg, INK, 4);
  words(g, jp, wd * 0.3, ht / 2 + 1, wd * 0.5, ht * 0.7, fg, JPB);
  words(g, en, wd * 0.74, ht / 2 + 1, wd * 0.42, ht * 0.5, fg, BOLD);
};

/* The festival's word mark across a cell: HANABI SOUND over the kana, a
 * burst each end. */
function wordmark(g, wd, ht, bg) {
  panel(g, wd, ht, bg, null);
  speedLines(g, wd, ht, 'rgba(240,80,140,0.22)', 26);
  burst(g, ht * 0.62, ht / 2, ht * 0.4, GOLD);
  burst(g, wd - ht * 0.62, ht / 2, ht * 0.4, TEAL);
  words(g, 'HANABI SOUND', wd / 2, ht * 0.44, wd * 0.72, ht * 0.62, PINK, HEAVY, PAPER);
  words(g, '花火サウンド  ·  DANCE FES', wd / 2, ht * 0.85, wd * 0.6, ht * 0.18, PAPER, JPB);
}

/*
 * EVERY SIGN, its cell's size in pixels and its painter. A sign's quad is
 * whatever size the venue gives it; the cell's shape is chosen to match.
 */
const SIGNS = {
  /* The speakers' fronts: a line array's box (two cones and the horn), a
   * sub's one big cone, a delay's column of three. */
  arrayFace: [256, 122, (g, wd, ht) => speakerFace(g, wd, ht, [[0.22, 0.5, 0.36], [0.78, 0.5, 0.36]], true)],
  subFace: [192, 166, (g, wd, ht) => speakerFace(g, wd, ht, [[0.5, 0.5, 0.42]])],
  delayFace: [128, 300, (g, wd, ht) => speakerFace(g, wd, ht, [[0.5, 0.2, 0.36], [0.5, 0.5, 0.36], [0.5, 0.8, 0.36]])],
  stageHead: [1536, 100, (g, wd, ht) => wordmark(g, wd, ht, NIGHT)],
  entrance: [1024, 96, (g, wd, ht) => {
    panel(g, wd, ht, NIGHT, null);
    burst(g, ht * 0.6, ht / 2, ht * 0.38, PINK);
    burst(g, wd - ht * 0.6, ht / 2, ht * 0.38, GOLD);
    words(g, 'WELCOME TO HANABI SOUND', wd / 2, ht * 0.4, wd * 0.76, ht * 0.5, PAPER, HEAVY, INK);
    words(g, 'ようこそ 花火サウンドへ', wd / 2, ht * 0.82, wd * 0.5, ht * 0.2, GOLD, JPB);
  }],
  goalBanner: [1536, 100, (g, wd, ht) => {
    panel(g, wd, ht, NIGHT, null);
    speedLines(g, wd, ht, 'rgba(46,196,192,0.25)', 22);
    words(g, 'MAKE SOME NOISE', wd * 0.36, ht / 2 + 2, wd * 0.5, ht * 0.66, PAPER, HEAVY, INK);
    words(g, '騒げ!', wd * 0.78, ht / 2 + 2, wd * 0.2, ht * 0.7, PINK, JPB, PAPER);
  }],
  wingBanner: [320, 500, (g, wd, ht) => {
    /* A tall banner: the mark's burst, the kanji down the middle, the
     * name sideways up the edge. */
    panel(g, wd, ht, NIGHT, null);
    burst(g, wd / 2, ht * 0.16, wd * 0.32, PINK);
    burst(g, wd / 2, ht * 0.16, wd * 0.16, GOLD);
    column(g, '花火', wd * 0.5, ht * 0.42, ht * 0.2, ht * 0.15, PAPER, PINK);
    g.save();
    g.translate(wd * 0.86, ht * 0.62);
    g.rotate(-Math.PI / 2);
    words(g, 'HANABI SOUND', 0, 0, ht * 0.7, wd * 0.15, TEAL, HEAVY);
    g.restore();
    words(g, 'DJ', wd * 0.4, ht * 0.86, wd * 0.6, ht * 0.1, GOLD, HEAVY, INK);
  }],
  djBooth: [768, 148, (g, wd, ht) => {
    panel(g, wd, ht, PINK, null);
    speedLines(g, wd, ht, 'rgba(255,255,255,0.35)', 18);
    burst(g, ht * 0.55, ht / 2, ht * 0.36, PAPER);
    burst(g, wd - ht * 0.55, ht / 2, ht * 0.36, PAPER);
    words(g, '花火 HANABI', wd / 2, ht / 2 + 2, wd * 0.66, ht * 0.62, PAPER, HEAVY, INK);
  }],
  foh: [512, 40, (g, wd, ht) => {
    panel(g, wd, ht, NIGHT, null);
    words(g, 'FRONT OF HOUSE  ·  音響', wd / 2, ht / 2 + 1, wd * 0.9, ht * 0.7, TEAL, HEAVY);
  }],
  bar: [384, 64, plate('バー', 'BAR', GOLD, INK)],
  toilet: [384, 80, plate('トイレ', 'TOILETS', '#2f6fd0', PAPER)],
  merch: [384, 64, plate('グッズ', 'MERCH', '#7a4cc8', PAPER)],
  firstaid: [384, 64, plate('救護所', 'FIRST AID', PAPER, '#2f9a4c')],
  info: [384, 64, plate('案内', 'INFO', TEAL, INK)],
  danger: [160, 120, (g, wd, ht) => {
    panel(g, wd, ht, '#f2bd34', INK, 6);
    words(g, '危険', wd / 2, ht * 0.36, wd * 0.8, ht * 0.36, '#c8352e', JPB);
    words(g, 'FIREWORKS', wd / 2, ht * 0.74, wd * 0.84, ht * 0.18, INK, HEAVY);
  }],
};

const TRUCKS = [
  { jp: 'たこ焼き', en: 'TAKOYAKI', bg: '#f2b632' }, { jp: 'ラーメン', en: 'RAMEN', bg: '#e8463c' },
  { jp: 'クレープ', en: 'CREPES', bg: '#f0508c' }, { jp: 'からあげ', en: 'KARAAGE', bg: '#2ec4c0' },
];
TRUCKS.forEach((t, i) => {
  SIGNS[`truck${i}`] = [512, 56, (g, wd, ht) => {
    panel(g, wd, ht, t.bg, INK, 4);
    words(g, t.jp, wd * 0.3, ht / 2 + 1, wd * 0.46, ht * 0.72, PAPER, JPB, INK);
    words(g, t.en, wd * 0.74, ht / 2 + 1, wd * 0.42, ht * 0.56, INK, HEAVY);
  }];
});

/* A speaker's front as the manga draws one: the dark cloth, each driver a
 * ring of surround, the cone, the dust cap with a crescent of light on it,
 * and the ink round them; a line array's box has its horn's slot between. */
function speakerFace(g, wd, ht, cones, horn = false) {
  g.fillStyle = '#2a2832';
  g.fillRect(0, 0, wd, ht);
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 1;
  for (let y = 3; y < ht; y += 4) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(wd, y);
    g.stroke();
  }
  for (const [fx, fy, fr] of cones) {
    const x = fx * wd;
    const y = fy * ht;
    const r = fr * Math.min(wd, ht);
    g.fillStyle = '#4a4656';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#18161e';
    g.beginPath();
    g.arc(x, y, r * 0.8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5c5868';
    g.beginPath();
    g.arc(x, y, r * 0.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(246,239,220,0.55)';
    g.lineWidth = Math.max(1.5, r * 0.07);
    g.beginPath();
    g.arc(x, y, r * 0.62, Math.PI * 1.05, Math.PI * 1.45);
    g.stroke();
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1.5, r * 0.06);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
  }
  if (horn) {
    g.fillStyle = '#101016';
    g.fillRect(wd * 0.44, ht * 0.16, wd * 0.12, ht * 0.68);
    g.strokeStyle = '#4a4656';
    g.lineWidth = 2;
    g.strokeRect(wd * 0.44, ht * 0.16, wd * 0.12, ht * 0.68);
  }
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, wd - 3, ht - 3);
}

/* ---- the atlas ---- */

/* Shelf packing: each used sign a cell of its own size, row by row. */
function pack(keys) {
  const cells = {};
  let x = 0;
  let y = 0;
  let row = 0;
  for (const key of keys) {
    const s = SIGNS[key];
    if (!s) {
      continue;
    }
    const [cw, ch] = s;
    if (x + cw + PAD > ATLAS_W) {
      x = 0;
      y += row + PAD;
      row = 0;
    }
    cells[key] = { x, y, w: cw, h: ch };
    x += cw + PAD;
    row = Math.max(row, ch);
  }
  return { cells, w: ATLAS_W, h: y + row };
}

/* Paint the atlas the venue's signs use. Browser only. */
export function paintSigns(signs) {
  const keys = [...new Set(signs.map((s) => s.key))].sort((a, b) => SIGNS[b]?.[1] - SIGNS[a]?.[1] || a.localeCompare(b));
  const { cells, w: aw, h: ah } = pack(keys);
  const c = document.createElement('canvas');
  c.width = aw;
  c.height = Math.max(4, ah);
  const g = c.getContext('2d');
  for (const [key, cell] of Object.entries(cells)) {
    g.save();
    g.translate(cell.x, cell.y);
    g.beginPath();
    g.rect(0, 0, cell.w, cell.h);
    g.clip();
    SIGNS[key][2](g, cell.w, cell.h);
    g.restore();
  }
  return { canvas: c, cells, w: aw, h: c.height };
}

/* Which keys the atlas can paint, for the check. */
export const SIGN_KEYS = Object.keys(SIGNS);

/* A plan face's outward normal, as the world's [x, y, z]. */
const NORMAL = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0], up: [0, 1, 0] };

/* Render only: a heading's normal may take the engine's cosine. */
function normalOf(face) {
  if (typeof face === 'number') {
    const a = face * Math.PI / 180;
    return [Math.cos(a), 0, -Math.sin(a)];
  }
  return NORMAL[face];
}

/* Every sign as a quad on its cell, one mesh, `lift` out from its face. */
export function signMesh(THREE, signs, atlas, material, low) {
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
    if (!cell || (low && s.fine)) {
      continue;
    }
    const u0 = (cell.x + 0.5) / atlas.w;
    const u1 = (cell.x + cell.w - 0.5) / atlas.w;
    const v0 = 1 - (cell.y + cell.h - 0.5) / atlas.h;
    const v1 = 1 - (cell.y + 0.5) / atlas.h;
    n.fromArray(normalOf(s.face));
    if (s.face === 'up') {
      up.set(0, 0, -1);
    } else {
      up.set(0, 1, 0);
    }
    right.crossVectors(up, n).normalize();
    const [x, y, z] = w(s.x, s.y, s.h);
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
  mesh.name = 'concert signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
