/*
 * signs.js: every painted thing in Tonbo Fest on one picture, and the one
 * mesh that shows them, as Sunnyfield's signs are (../sunny/signs.js): the
 * festival's banners, the gate numbers, the nobori, the teams' valances,
 * the stage's screen and header, the lap board, the river's boards. Each is
 * a quad on a cell of one canvas, so two hundred signs cost one draw call
 * and one texture.
 *
 * The stalls' signs, their noren and the river's gauge are the town's own
 * pictures (../city/vendored/core/textures.js), painted into a cell here,
 * so a takoyaki stall on this field is the stall the town's matsuri has.
 * Everything else is painted here in the town's hand: its paper cream, its
 * ink, its Japanese font stack, and our own words. Every team, club and
 * pilot named is made up; no real brand, event or person is on the field.
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
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as TownTex from '../city/vendored/core/textures.js';
import { w } from './venue.js';

const INK = '#1d1b26';
const PAPER = '#f6efdc';
const RED = '#c8352e';
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

/* The festival's mark: a dragonfly seen from above, inked, four wings,
 * the long body, the big eyes, in a ring. Centred at (x, y), `s` across. */
function tonbo(g, x, y, s, body = RED) {
  g.save();
  g.translate(x, y);
  g.lineJoin = 'round';
  g.lineWidth = Math.max(1.5, s * 0.03);
  g.strokeStyle = INK;
  for (const [dy, len, tilt] of [[-0.12, 0.46, -0.12], [0.02, 0.42, 0.1]]) {
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(side * s * (len / 2 + 0.04), dy * s, s * len / 2, s * 0.085, side * tilt, 0, Math.PI * 2);
      g.fillStyle = 'rgba(214,238,244,0.95)';
      g.fill();
      g.stroke();
    }
  }
  g.beginPath();
  g.roundRect(-s * 0.045, -s * 0.18, s * 0.09, s * 0.62, s * 0.04);
  g.fillStyle = body;
  g.fill();
  g.stroke();
  for (let i = 1; i < 6; i += 1) {
    g.beginPath();
    g.moveTo(-s * 0.045, -s * 0.05 + i * s * 0.08);
    g.lineTo(s * 0.045, -s * 0.05 + i * s * 0.08);
    g.stroke();
  }
  for (const side of [-1, 1]) {
    g.beginPath();
    g.arc(side * s * 0.055, -s * 0.24, s * 0.07, 0, Math.PI * 2);
    g.fillStyle = '#52b07a';
    g.fill();
    g.stroke();
  }
  g.restore();
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

/* A town picture into a cell, stretched to it. */
const town = (fn, arg) => (g, wd, ht) => {
  const tex = TownTex[fn](arg);
  g.drawImage(tex.image, 0, 0, wd, ht);
};

/* ---- the signs ---- */

const NUM_COLOURS = ['#f0721e', '#e8463c', '#2f6fd0', '#2f9a4c', '#f2a6bd', '#8fe0b8', '#f2bd34', '#2e4382'];

/* A gate's number: a disc in a colour, the number lettered white over ink. */
function numberSign(n) {
  return (g, wd, ht) => {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, wd, ht);
    g.beginPath();
    g.arc(wd / 2, ht / 2, wd * 0.44, 0, Math.PI * 2);
    g.fillStyle = NUM_COLOURS[(n - 1) % NUM_COLOURS.length];
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = INK;
    g.stroke();
    words(g, String(n), wd / 2, ht / 2 + 3, wd * 0.7, ht * 0.62, '#ffffff', HEAVY, INK);
  };
}

const NOBORI = [
  { bg: '#e8463c', fg: PAPER, t: 'ドローン祭' },
  { bg: '#2e4382', fg: PAPER, t: 'とんぼ杯' },
  { bg: PAPER, fg: '#c8352e', t: 'FPVレース' },
  { bg: '#f2bd34', fg: INK, t: '河辺の空' },
];

const TEAMS = [
  { name: 'KAWABE FPV', bg: '#f0721e' }, { name: 'SORAMAME', bg: '#2f6fd0' }, { name: 'AKANE AIR', bg: '#2f9a4c' },
  { name: 'HAYATE GUMI', bg: '#d8333d' }, { name: 'MOGURA WORKS', bg: '#f2a6bd' }, { name: 'KAMOME FPV', bg: '#8fe0b8' },
  { name: 'YUUHI RACING', bg: '#f2bd34' }, { name: 'TONBO CLUB', bg: '#2e4382' },
];

/* A plain plate: Japanese over English, as an event's signs are. */
const plate = (jp, en, bg = PAPER, fg = INK) => (g, wd, ht) => {
  panel(g, wd, ht, bg, INK, 4);
  words(g, jp, wd * 0.3, ht / 2 + 1, wd * 0.5, ht * 0.7, fg, JPB);
  words(g, en, wd * 0.74, ht / 2 + 1, wd * 0.42, ht * 0.5, fg, BOLD);
};

/*
 * EVERY SIGN, its cell's size in pixels and its painter. A sign's quad is
 * whatever size the venue gives it; the cell's shape is chosen to match.
 */
const SIGNS = {
  festBanner: [1024, 192, (g, wd, ht) => {
    panel(g, wd, ht, PAPER, null);
    g.fillStyle = RED;
    g.fillRect(0, 0, wd, 16);
    g.fillRect(0, ht - 16, wd, 16);
    speedLines(g, wd, ht, 'rgba(200,53,46,0.18)', 22);
    tonbo(g, ht * 0.62, ht / 2, ht * 0.86);
    words(g, 'TONBO FEST', wd * 0.46, ht * 0.44, wd * 0.5, ht * 0.5, RED, HEAVY, INK);
    words(g, 'とんぼ ドローン祭', wd * 0.46, ht * 0.8, wd * 0.46, ht * 0.2, INK, JPB);
    words(g, '河川敷', wd * 0.86, ht * 0.36, wd * 0.2, ht * 0.3, '#2e4382', JPB);
    words(g, 'FPV RACE', wd * 0.86, ht * 0.66, wd * 0.2, ht * 0.2, '#2e4382', HEAVY);
  }],
  clubBanner: [512, 136, (g, wd, ht) => {
    panel(g, wd, ht, '#2e4382', null);
    words(g, '河辺FPVクラブ', wd / 2, ht * 0.4, wd * 0.86, ht * 0.4, PAPER, JPB);
    words(g, 'KAWABE FPV CLUB', wd / 2, ht * 0.78, wd * 0.8, ht * 0.2, '#f2bd34', HEAVY);
  }],
  stageHead: [1536, 122, (g, wd, ht) => {
    panel(g, wd, ht, INK, null);
    tonbo(g, ht * 0.7, ht / 2, ht * 0.9);
    tonbo(g, wd - ht * 0.7, ht / 2, ht * 0.9);
    words(g, 'TONBO FEST  ドローン祭  MAIN STAGE', wd / 2, ht / 2 + 2, wd * 0.8, ht * 0.62, PAPER, HEAVY, null);
  }],
  pilots: [640, 64, plate('パイロット席', 'PILOTS', '#2e8a8c', PAPER)],
  control: [384, 64, plate('大会本部', 'RACE CONTROL', PAPER, INK)],
  reception: [384, 64, plate('受付', 'ENTRY', '#e8463c', PAPER)],
  firstaid: [384, 64, plate('救護所', 'FIRST AID', PAPER, '#2f9a4c')],
  toilet: [384, 96, plate('トイレ', 'TOILETS', '#2f6fd0', PAPER)],
  ground: [384, 128, (g, wd, ht) => {
    panel(g, wd, ht, '#fbfaf4', '#2f5b52', 6);
    words(g, '河川敷 第二グラウンド', wd / 2, ht * 0.38, wd * 0.86, ht * 0.32, '#2f5b52', JPB);
    words(g, 'ボール遊びは グラウンドで', wd / 2, ht * 0.74, wd * 0.8, ht * 0.18, '#6a6577', JPB);
  }],
  sluice: [384, 112, (g, wd, ht) => {
    panel(g, wd, ht, '#e8e9e4', '#3e6e9c', 6);
    words(g, '河辺第三樋門', wd / 2, ht * 0.4, wd * 0.86, ht * 0.4, '#2c3e5a', JPB);
    words(g, '河辺市 河川課', wd / 2, ht * 0.78, wd * 0.6, ht * 0.18, '#6a6577', JPB);
  }],
  bridge: [384, 104, (g, wd, ht) => {
    panel(g, wd, ht, '#e8e2d6', INK, 6);
    words(g, '河辺川 橋りょう', wd / 2, ht * 0.42, wd * 0.86, ht * 0.42, INK, JPB);
    words(g, 'KAWABE RIVER BRIDGE', wd / 2, ht * 0.8, wd * 0.8, ht * 0.16, '#6a6577', BOLD);
  }],
  warn: [192, 320, (g, wd, ht) => {
    panel(g, wd, ht, '#f2bd34', INK, 6);
    words(g, 'あぶない', wd / 2, ht * 0.15, wd * 0.84, ht * 0.14, '#c8352e', JPB);
    column(g, '川に入るな', wd / 2, ht * 0.32, ht * 0.13, ht * 0.11, INK);
  }],
  gauge: [96, 512, town('gaugeBoard')],
  gomi: [384, 96, (g, wd, ht) => {
    panel(g, wd, ht, PAPER, INK, 4);
    const kinds = [['もえる', '#2f6fd0'], ['プラ', '#2f9a4c'], ['かん', '#e0a020'], ['びん', '#d8333d']];
    kinds.forEach(([t, c], i) => {
      g.fillStyle = c;
      g.fillRect(8 + i * (wd - 16) / 4, 8, (wd - 16) / 4 - 6, ht - 16);
      words(g, t, 8 + (i + 0.5) * (wd - 16) / 4 - 3, ht / 2, (wd - 16) / 4 - 16, ht * 0.4, '#ffffff', JPB);
    });
  }],
  screen: [768, 432, (g, wd, ht) => {
    /* The live feed: a pilot's camera low over the grass toward a gate,
     * the OSD, LIVE in the corner and the heat's caption. */
    const sky = g.createLinearGradient(0, 0, 0, ht * 0.55);
    sky.addColorStop(0, '#9fc6e6');
    sky.addColorStop(1, '#f4dcc0');
    g.fillStyle = sky;
    g.fillRect(0, 0, wd, ht);
    g.save();
    g.translate(wd / 2, ht * 0.52);
    g.rotate(-0.16);
    g.fillStyle = '#7fa86e';
    g.fillRect(-wd, 0, wd * 2, ht);
    g.fillStyle = '#c9c3bc';
    g.fillRect(-wd, -ht * 0.06, wd * 2, ht * 0.06);
    g.lineWidth = 16;
    g.strokeStyle = '#f0721e';
    g.strokeRect(-wd * 0.08, -ht * 0.28, wd * 0.16, ht * 0.26);
    g.restore();
    speedLines(g, wd, ht, 'rgba(255,255,255,0.35)', 14);
    words(g, '● LIVE', wd * 0.12, ht * 0.09, wd * 0.2, ht * 0.07, '#ff5145', HEAVY, INK);
    words(g, '16.4V', wd * 0.86, ht * 0.09, wd * 0.2, ht * 0.06, '#ffffff', HEAVY, INK);
    words(g, '0:42.18', wd * 0.5, ht * 0.09, wd * 0.3, ht * 0.07, '#ffffff', HEAVY, INK);
    g.fillStyle = 'rgba(29,27,38,0.85)';
    g.fillRect(0, ht * 0.8, wd, ht * 0.2);
    words(g, 'HEAT 3  ·  とんぼ杯 決勝', wd * 0.5, ht * 0.9, wd * 0.9, ht * 0.11, PAPER, JPB);
  }],
  lapboard: [512, 320, (g, wd, ht) => {
    panel(g, wd, ht, '#14131a', '#2a2733', 6);
    words(g, 'HEAT 3   LAP 2 / 3', wd / 2, ht * 0.12, wd * 0.9, ht * 0.11, '#f2bd34', HEAVY);
    const rows = [['1', 'KAZE', '0:42.18'], ['2', 'HAYATE', '0:43.07'], ['3', 'TOMBO', '0:44.51'], ['4', 'SORA', '0:46.90']];
    rows.forEach(([p, n, t], i) => {
      const y = ht * (0.32 + i * 0.17);
      words(g, p, wd * 0.1, y, wd * 0.1, ht * 0.12, '#8fe0b8', HEAVY);
      g.textAlign = 'left';
      font(g, HEAVY, ht * 0.11);
      g.fillStyle = PAPER;
      g.fillText(n, wd * 0.2, y);
      words(g, t, wd * 0.8, y, wd * 0.3, ht * 0.11, '#ff9a6a', HEAVY);
    });
  }],
  noren0: [256, 128, town('norenTex', 'ramen')],
  noren1: [256, 128, town('norenTex', 'soba')],
  noren2: [256, 128, town('norenTex', 'bento')],
};

for (let n = 1; n <= 16; n += 1) {
  SIGNS[`num${n}`] = [128, 128, numberSign(n)];
}
NOBORI.forEach((s, i) => {
  SIGNS[`nobori${i}`] = [96, 384, (g, wd, ht) => {
    panel(g, wd, ht, s.bg, null);
    g.fillStyle = s.fg === PAPER ? 'rgba(246,239,220,0.9)' : s.fg;
    g.fillRect(0, 0, 10, ht);
    column(g, s.t, wd / 2 + 4, ht * 0.12, ht * 0.16, ht * 0.12, s.fg, s.bg === PAPER ? null : INK);
  }];
});
TEAMS.forEach((t, i) => {
  SIGNS[`team${i}`] = [512, 80, (g, wd, ht) => {
    panel(g, wd, ht, t.bg, null);
    words(g, t.name, wd / 2, ht / 2 + 2, wd * 0.9, ht * 0.66, '#ffffff', HEAVY, INK);
  }];
});
for (let i = 0; i < 5; i += 1) {
  SIGNS[`stall${i}`] = [384, 120, town('stallSign', i)];
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
  mesh.name = 'fest signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
