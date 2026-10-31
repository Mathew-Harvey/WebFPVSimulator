/*
 * signs.js: every painted plate in Hinode Park, on one picture: the park's
 * name on its gate stones, the rules boards, the scoreboard, the toilets'
 * pictograms, the clock, the 止まれ on the lane, the floodlights' lamps.
 * Lettered in Japanese the way the town letters its signs (the town's own
 * gothic face list, src/maps/city/vendored/core/textures.js), with no
 * brand of anybody's on any of them.
 *
 * The packing, the painting and the mesh are Sunnyfield's (../sunny/
 * signs.js); the signs are the park's.
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

const INK = '#2a2536';
const CREAM = '#fbf8f0';
const JP = "'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', 'WenQuanYi Zen Hei', sans-serif";
const HEAVY = `900 {px}px ${JP}`;
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

/* Words read top to bottom, one glyph under the next. */
function column(g, text, x, y0, y1, px, colour, face = HEAVY) {
  const chars = [...text];
  const step = (y1 - y0) / chars.length;
  font(g, face, Math.min(px, step * 0.92));
  g.fillStyle = colour;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  chars.forEach((c, i) => g.fillText(c, x, y0 + step * (i + 0.5)));
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

/* A small figure for a pictogram: a head and a body. */
function figure(g, x, y, s, colour, skirt) {
  disc(g, x, y - s * 0.62, s * 0.18, colour);
  g.fillStyle = colour;
  g.beginPath();
  if (skirt) {
    g.moveTo(x, y - s * 0.4);
    g.lineTo(x + s * 0.3, y + s * 0.25);
    g.lineTo(x - s * 0.3, y + s * 0.25);
  } else {
    g.rect(x - s * 0.18, y - s * 0.4, s * 0.36, s * 0.62);
  }
  g.fill();
  g.fillRect(x - s * 0.14, y + s * 0.2, s * 0.1, s * 0.4);
  g.fillRect(x + s * 0.04, y + s * 0.2, s * 0.1, s * 0.4);
}

/* A rule: a pictogram in a ring, struck through or not, and its words. */
function rule(g, x, y, r, draw, banned, text) {
  disc(g, x, y, r, CREAM, banned ? '#d33a32' : '#2f7a4a', r * 0.16);
  draw(g, x, y, r);
  if (banned) {
    g.strokeStyle = '#d33a32';
    g.lineWidth = r * 0.16;
    g.beginPath();
    g.moveTo(x - r * 0.68, y - r * 0.68);
    g.lineTo(x + r * 0.68, y + r * 0.68);
    g.stroke();
  }
  words(g, text, x, y + r * 1.45, r * 2.6, r * 0.46, INK);
}

const SIGNS = {
  /* The park's name, cut in its gate stone. */
  pkParkName: { h: 96, paint: (g, w, h) => {
    g.fillStyle = '#b9b2bf';
    g.fillRect(0, 0, w, h);
    words(g, '日の出公園', w / 2, h * 0.42, w * 0.9, h * 0.5, '#3a3448', HEAVY);
    words(g, 'HINODE PARK', w / 2, h * 0.8, w * 0.7, h * 0.16, '#4a4458');
  } },
  /* The ground's name on the backstop's foot. */
  pkGround: { h: 48, paint: (g, w, h) => {
    g.fillStyle = '#c2bdc8';
    g.fillRect(0, 0, w, h);
    words(g, '日の出公園 野球場', w / 2, h / 2 + 1, w * 0.9, h * 0.66, '#3d4f46', HEAVY);
  } },
  pkDist82: { h: 48, paint: (g, w, h) => {
    panel(g, w, h, '#fbf8f0', '#3d4f46', 4, 3);
    words(g, '82m', w / 2, h / 2 + 1, w * 0.8, h * 0.7, '#3d4f46', HEAVY);
  } },
  /* The scoreboard: the ground's name, nine innings, two rows of chalk
   * zeros, and the ball, strike and out lamps. */
  pkScore: { h: 160, paint: (g, w, h) => {
    g.fillStyle = '#2f4f42';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e8efe6';
    g.lineWidth = 2;
    g.strokeRect(4, 4, w - 8, h - 8);
    words(g, '日の出公園野球場', w / 2, h * 0.13, w * 0.6, h * 0.14, '#f4f2ea', HEAVY);
    const x0 = w * 0.16;
    const cw = (w * 0.66) / 10;
    const rows = [h * 0.38, h * 0.58];
    for (let i = 0; i < 10; i += 1) {
      const x = x0 + cw * (i + 0.5);
      words(g, i < 9 ? String(i + 1) : '計', x, h * 0.25, cw, h * 0.1, '#f4d36a');
      for (const [k, y] of rows.entries()) {
        g.strokeStyle = '#4f7062';
        g.strokeRect(x - cw * 0.42, y - h * 0.085, cw * 0.84, h * 0.17);
        const runs = [[0, 1, 0, 0, 2, 0, 0, 1, '', 4], [1, 0, 0, 3, 0, 0, 1, 0, '', 5]][k][i];
        words(g, String(runs), x, y, cw, h * 0.14, '#fbf8f0', HEAVY);
      }
    }
    words(g, 'ひので', w * 0.09, rows[0], w * 0.12, h * 0.1, '#fbf8f0', HEAVY);
    words(g, 'かわせみ', w * 0.09, rows[1], w * 0.12, h * 0.1, '#fbf8f0', HEAVY);
    const lamps = [['B', '#7fd06a', 3], ['S', '#f4d36a', 2], ['O', '#ef6a60', 2]];
    lamps.forEach(([l, c, n], j) => {
      const y = h * 0.8;
      const xs = w * (0.22 + j * 0.22);
      words(g, l, xs, y, 30, h * 0.11, '#f4f2ea', HEAVY);
      for (let k = 0; k < n; k += 1) {
        disc(g, xs + 22 + k * 22, y, 8, k === 0 ? c : '#3f5f52');
      }
    });
    words(g, 'H', w * 0.86, h * 0.38, 30, h * 0.12, '#f4d36a', HEAVY);
    words(g, 'E', w * 0.86, h * 0.58, 30, h * 0.12, '#f4d36a', HEAVY);
  } },
  pkFlood: { h: 32, paint: (g, w, h) => {
    g.fillStyle = '#5c5a6c';
    g.fillRect(0, 0, w, h);
    disc(g, w / 2, h / 2, w * 0.4, '#fff4d8', '#9a97a8', 2);
  } },
  pkTeam1: { h: 32, paint: (g, w, h) => {
    g.fillStyle = '#3d6ec4';
    g.fillRect(0, 0, w, h);
    words(g, '一塁側', w / 2, h / 2 + 1, w * 0.6, h * 0.8, CREAM, HEAVY);
  } },
  pkTeam3: { h: 32, paint: (g, w, h) => {
    g.fillStyle = '#e0453f';
    g.fillRect(0, 0, w, h);
    words(g, '三塁側', w / 2, h / 2 + 1, w * 0.6, h * 0.8, CREAM, HEAVY);
  } },
  /* The boats' board at the pier: swan boats, thirty minutes. */
  pkBoats: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, CREAM, '#3d6ec4', 6, 4);
    words(g, 'ボート乗り場', w / 2, h * 0.38, w * 0.86, h * 0.4, '#3d6ec4', HEAVY);
    words(g, 'スワン 30分', w / 2, h * 0.76, w * 0.8, h * 0.24, INK);
  } },
  pkBridgeName: { h: 128, paint: (g, w, h) => {
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, w, h);
    column(g, '日の出橋', w / 2, h * 0.05, h * 0.95, w * 0.9, INK);
  } },
  /* The playground's rules, as every ward's board has them. */
  pkPlayRules: { h: 128, paint: (g, w, h) => {
    panel(g, w, h, CREAM, '#2f7a4a', 6, 4);
    words(g, 'あそびばの おやくそく', w / 2, h * 0.13, w * 0.9, h * 0.13, '#2f7a4a', HEAVY);
    const r = h * 0.15;
    rule(g, w * 0.2, h * 0.45, r, (gg, x, y, rr) => figure(gg, x, y, rr * 1.2, INK, false), false, 'じゅんばんに');
    rule(g, w * 0.5, h * 0.45, r, (gg, x, y, rr) => {
      disc(gg, x, y, rr * 0.4, '#e0453f');
    }, true, 'ボールあそび');
    rule(g, w * 0.8, h * 0.45, r, (gg, x, y, rr) => {
      gg.fillStyle = INK;
      gg.fillRect(x - rr * 0.5, y - rr * 0.1, rr, rr * 0.2);
      gg.fillRect(x - rr * 0.1, y - rr * 0.5, rr * 0.2, rr);
    }, true, 'はなび');
  } },
  /* The park's rules by the south gate. */
  pkRules: { h: 160, paint: (g, w, h) => {
    panel(g, w, h, CREAM, '#2f7a4a', 6, 5);
    g.fillStyle = '#2f7a4a';
    g.fillRect(5, 5, w - 10, h * 0.2);
    words(g, '公園を利用するみなさんへ', w / 2, h * 0.11, w * 0.86, h * 0.13, CREAM, HEAVY);
    const lines = ['ボール遊びは野球場で', '犬のフンは持ち帰りましょう', '池に入らないでください', '花火・たき火は禁止です', 'ドローンの飛行は許可が必要です'];
    lines.forEach((t, i) => words(g, `・${t}`, w / 2, h * (0.32 + i * 0.13), w * 0.84, h * 0.09, INK));
    words(g, '日の出公園管理事務所', w * 0.7, h * 0.94, w * 0.5, h * 0.06, '#4a4458');
  } },
  pkToilet: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, CREAM, INK, 4, 3);
    words(g, 'トイレ', w * 0.24, h / 2, w * 0.36, h * 0.5, INK, HEAVY);
    figure(g, w * 0.58, h * 0.55, h * 0.7, '#3d6ec4', false);
    figure(g, w * 0.78, h * 0.55, h * 0.7, '#e0453f', true);
  } },
  /* The clock: a face, its hours, its hands at ten to five. */
  pkClock: { h: 96, paint: (g, w, h) => {
    g.fillStyle = '#f8f5f0';
    g.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.44;
    disc(g, cx, cy, r, '#fbf8f0', INK, 4);
    for (let k = 0; k < 12; k += 1) {
      const a = (k * Math.PI) / 6;
      const x = cx + Math.sin(a) * r * 0.82;
      const y = cy - Math.cos(a) * r * 0.82;
      disc(g, x, y, k % 3 === 0 ? 4 : 2.2, INK);
    }
    const hand = (a, len, lw) => {
      g.strokeStyle = INK;
      g.lineWidth = lw;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len);
      g.stroke();
    };
    hand(((4 + 50 / 60) * Math.PI) / 6, r * 0.5, 5);
    hand((50 * Math.PI) / 30, r * 0.74, 3);
    disc(g, cx, cy, 4, '#e0453f');
  } },
  /* 止まれ, painted on the lane, read from the driver's side. */
  pkStopPaint: { h: 64, paint: (g, w, h) => {
    g.fillStyle = '#8e8a9c';
    g.fillRect(0, 0, w, h);
    words(g, '止まれ', w / 2, h / 2, w * 0.95, h * 0.9, '#f4f2f6', HEAVY);
  } },
  pkMirrorTag: { h: 64, paint: (g, w, h) => {
    g.fillStyle = '#ef8a3c';
    g.fillRect(0, 0, w, h);
    column(g, '注意', w / 2, h * 0.08, h * 0.92, w * 0.9, CREAM);
  } },
  /* The shrine's plaque on the last torii. */
  pkShrine: { h: 96, paint: (g, w, h) => {
    g.fillStyle = '#2a2536';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8b25a';
    g.lineWidth = 3;
    g.strokeRect(3, 3, w - 6, h - 6);
    column(g, '稲荷', w / 2, h * 0.1, h * 0.9, w * 0.8, '#d8b25a');
  } },
};

/* The keys a map may name, for a check that every sign it hangs is
 * painted. */
export const SIGN_KEYS = Object.keys(SIGNS);

/* The cells, each key's first use setting its shape. */
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

/* The picture, painted. */
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

/* Every sign as a quad on its cell, one mesh. */
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
  mesh.name = 'park signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
