/*
 * signs.js: every painted board in Yumeboshi Land, on one picture: the
 * park's name over its gate, each ride's name board, the coaster's
 * station board, the castle's, the haunted house's dripping one, the eight
 * shops of the main street and the four food stalls. Lettered in Japanese
 * the way the town letters its signs (the town's own gothic face list,
 * src/maps/city/vendored/core/textures.js), each with a small line of
 * English under it, and with no brand of anybody's on any of them: every
 * name here is the park's own.
 *
 * The packing, the painting and the mesh are Hinode Park's (../park/
 * signs.js); the boards are the theme park's.
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

/* A five pointed star, the park's mark. */
function star(g, x, y, r, fill, edge = null, lw = 2) {
  g.beginPath();
  for (let k = 0; k < 10; k += 1) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (edge) {
    g.lineWidth = lw;
    g.strokeStyle = edge;
    g.stroke();
  }
}

/* A row of bulbs round a board's edge, as a fair's boards have them. */
function bulbs(g, w, h, inset, step, colour) {
  for (let x = inset; x <= w - inset + 0.1; x += step) {
    disc(g, x, inset, step * 0.22, colour);
    disc(g, x, h - inset, step * 0.22, colour);
  }
  for (let y = inset + step; y < h - inset - 0.1; y += step) {
    disc(g, inset, y, step * 0.22, colour);
    disc(g, w - inset, y, step * 0.22, colour);
  }
}

/* Candy stripes behind a board's words. */
function stripes(g, w, h, a, b, n) {
  g.fillStyle = a;
  g.fillRect(0, 0, w, h);
  g.fillStyle = b;
  const s = w / n;
  for (let k = -1; k < n + 1; k += 2) {
    g.beginPath();
    g.moveTo(k * s, h);
    g.lineTo((k + 1) * s, h);
    g.lineTo((k + 1) * s + h * 0.5, 0);
    g.lineTo(k * s + h * 0.5, 0);
    g.fill();
  }
}

/* A ride's name board: a coloured panel ringed in bulbs, the name heavy,
 * the English small under it. */
function rideBoard(fill, edge, ink, jp, en, lamp = '#fff2c8') {
  return (g, w, h) => {
    panel(g, w, h, fill, edge, h * 0.22, Math.max(3, h * 0.06));
    bulbs(g, w, h, h * 0.12, h * 0.2, lamp);
    words(g, jp, w / 2, h * 0.44, w * 0.8, h * 0.5, ink, HEAVY);
    words(g, en, w / 2, h * 0.8, w * 0.6, h * 0.16, ink);
  };
}

/* A shop's board: its name and a little picture of what it sells. */
function shopBoard(fill, ink, jp, en, pic) {
  return (g, w, h) => {
    panel(g, w, h, fill, INK, 8, 4);
    const px = h * 0.55;
    pic(g, px, h * 0.5, h * 0.36);
    words(g, jp, (w + px * 1.6) / 2, h * 0.42, w - px * 2.2, h * 0.46, ink, HEAVY);
    words(g, en, (w + px * 1.6) / 2, h * 0.8, w - px * 2.6, h * 0.16, ink);
  };
}

/* A stall's short board: one word, a stripe under it. */
function stallBoard(fill, ink, jp) {
  return (g, w, h) => {
    panel(g, w, h, fill, INK, 4, 3);
    words(g, jp, w / 2, h / 2 + 1, w * 0.86, h * 0.74, ink, HEAVY);
  };
}

const SIGNS = {
  /* The park's name over its gate: ゆめぼしランド, Dream Star Land, on a
   * night blue board full of stars. */
  ymParkName: { h: 160, paint: (g, w, h) => {
    panel(g, w, h, '#33407a', '#f4c033', 18, 8);
    bulbs(g, w, h, 12, 26, '#fff2c8');
    const sky = [[0.12, 0.3, 9], [0.88, 0.32, 10], [0.2, 0.72, 6], [0.82, 0.74, 7], [0.5, 0.16, 6]];
    for (const [x, y, r] of sky) {
      star(g, w * x, h * y, r * (h / 160) * 1.6, '#f4c033');
    }
    words(g, 'ゆめぼしランド', w / 2, h * 0.46, w * 0.74, h * 0.46, '#fbf8f0', HEAVY);
    words(g, 'YUMEBOSHI LAND', w / 2, h * 0.8, w * 0.5, h * 0.14, '#f4c033', HEAVY);
  } },
  /* The coaster: 流星コースター, the shooting star, over the station. */
  ymCoasterName: { h: 128, paint: (g, w, h) => {
    panel(g, w, h, '#e0453f', '#2a2536', 14, 6);
    g.strokeStyle = '#f4c033';
    g.lineWidth = h * 0.05;
    g.lineCap = 'round';
    for (let k = 0; k < 3; k += 1) {
      g.beginPath();
      g.moveTo(w * 0.04, h * (0.3 + k * 0.14));
      g.lineTo(w * 0.13, h * (0.2 + k * 0.14));
      g.stroke();
    }
    star(g, w * 0.15, h * 0.22, h * 0.16, '#f4c033', '#2a2536', 3);
    words(g, '流星コースター', w * 0.56, h * 0.44, w * 0.76, h * 0.5, '#fbf8f0', HEAVY);
    words(g, 'RYUSEI COASTER', w * 0.56, h * 0.8, w * 0.5, h * 0.15, '#fbf8f0', HEAVY);
  } },
  ymWheelName: { h: 96, paint: rideBoard('#4f7fcc', '#2a2536', '#fbf8f0', 'ほしぞら観覧車', 'STARRY SKY WHEEL') },
  ymCarouselName: { h: 64, paint: (g, w, h) => {
    stripes(g, w, h, '#f39cbe', '#fbf8f0', 14);
    g.fillStyle = '#fbf8f0';
    g.beginPath();
    g.roundRect(w * 0.12, h * 0.1, w * 0.76, h * 0.8, h * 0.4);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#2a2536';
    g.stroke();
    words(g, 'ゆめのメリーゴーランド', w / 2, h * 0.52, w * 0.7, h * 0.56, '#8a3a66', HEAVY);
  } },
  ymTowerName: { h: 96, paint: (g, w, h) => {
    panel(g, w, h, '#2a2536', '#e0453f', 10, 6);
    words(g, 'スターフォール', w / 2, h * 0.4, w * 0.86, h * 0.44, '#f4c033', HEAVY);
    words(g, '64m FREE FALL', w / 2, h * 0.78, w * 0.6, h * 0.18, '#fbf8f0', HEAVY);
  } },
  ymTeacupName: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#fbf8f0', '#2f9c9a', h * 0.4, 4);
    disc(g, h * 0.55, h / 2, h * 0.3, '#f39cbe', '#2a2536', 2);
    disc(g, w - h * 0.55, h / 2, h * 0.3, '#8cc3e6', '#2a2536', 2);
    words(g, 'くるくるティーカップ', w / 2, h * 0.52, w - h * 2.4, h * 0.6, '#2f7a78', HEAVY);
  } },
  ymSwingName: { h: 64, paint: (g, w, h) => {
    stripes(g, w, h, '#f4c033', '#fbf8f0', 12);
    g.fillStyle = '#e0453f';
    g.beginPath();
    g.roundRect(w * 0.08, h * 0.12, w * 0.84, h * 0.76, h * 0.38);
    g.fill();
    words(g, 'そらとぶブランコ', w / 2, h * 0.52, w * 0.76, h * 0.58, '#fbf8f0', HEAVY);
  } },
  ymShipName: { h: 64, paint: (g, w, h) => {
    g.fillStyle = '#765f62';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e0b44c';
    g.lineWidth = 3;
    g.strokeRect(4, 4, w - 8, h - 8);
    words(g, '海賊船 かもめ丸', w / 2, h * 0.5, w * 0.86, h * 0.6, '#f6ecd6', HEAVY);
  } },
  ymCastleName: { h: 96, paint: (g, w, h) => {
    panel(g, w, h, '#fbf8f0', '#7a62b8', h * 0.3, 6);
    star(g, w * 0.1, h * 0.5, h * 0.22, '#f4c033', '#7a62b8', 2);
    star(g, w * 0.9, h * 0.5, h * 0.22, '#f4c033', '#7a62b8', 2);
    words(g, 'ほしのお城', w / 2, h * 0.42, w * 0.66, h * 0.5, '#5a4698', HEAVY);
    words(g, 'STAR CASTLE', w / 2, h * 0.8, w * 0.44, h * 0.15, '#5a4698', HEAVY);
  } },
  /* お化け屋敷, the haunted house, the paint run down the board. */
  ymHauntName: { h: 96, paint: (g, w, h) => {
    g.fillStyle = '#2a2536';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#9fd8bf';
    for (let k = 0; k < 14; k += 1) {
      const x = w * (0.08 + k * 0.064);
      const len = h * (0.2 + ((k * 37) % 11) / 22);
      g.fillRect(x, h * 0.62, w * 0.012, len * 0.5);
      disc(g, x + w * 0.006, h * 0.62 + len * 0.5, w * 0.012, '#9fd8bf');
    }
    words(g, 'お化け屋敷', w / 2, h * 0.42, w * 0.8, h * 0.58, '#9fd8bf', HEAVY);
  } },
  ymShopIce: { h: 64, paint: shopBoard('#cfe6d6', '#2f6a5a', 'アイス', 'ICE CREAM', (g, x, y, r) => {
    g.fillStyle = '#e0b44c';
    g.beginPath();
    g.moveTo(x - r * 0.5, y);
    g.lineTo(x + r * 0.5, y);
    g.lineTo(x, y + r * 1.2);
    g.fill();
    disc(g, x, y - r * 0.15, r * 0.55, '#f39cbe', INK, 2);
  }) },
  ymShopPop: { h: 64, paint: shopBoard('#f3e6a8', '#8a3a2a', 'ポップコーン', 'POPCORN', (g, x, y, r) => {
    g.fillStyle = '#e0453f';
    g.fillRect(x - r * 0.5, y - r * 0.2, r, r * 1.1);
    for (let k = 0; k < 5; k += 1) {
      disc(g, x - r * 0.45 + k * r * 0.22, y - r * 0.35 - (k % 2) * r * 0.2, r * 0.22, '#fbf8f0', INK, 1);
    }
  }) },
  ymShopTako: { h: 64, paint: shopBoard('#f0e4cc', '#8a3a2a', 'たこやき', 'TAKOYAKI', (g, x, y, r) => {
    for (let k = 0; k < 3; k += 1) {
      disc(g, x - r * 0.5 + k * r * 0.5, y + r * 0.1, r * 0.3, '#b0703a', INK, 1.5);
    }
  }) },
  ymShopGift: { h: 64, paint: shopBoard('#f2cfd0', '#6a3a7a', 'おみやげ', 'GIFTS', (g, x, y, r) => {
    star(g, x, y, r, '#f4c033', INK, 2);
  }) },
  ymShopCafe: { h: 64, paint: shopBoard('#cfe0ee', '#2a3a6a', 'カフェ', 'CAFE', (g, x, y, r) => {
    g.fillStyle = '#fbf8f0';
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(x - r * 0.6, y - r * 0.4, r * 1.0, r * 1.0, r * 0.2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(x + r * 0.45, y + r * 0.1, r * 0.25, -Math.PI / 2, Math.PI / 2);
    g.stroke();
  }) },
  ymShopCandy: { h: 64, paint: shopBoard('#f2cfd0', '#8a3a66', 'おかし', 'SWEETS', (g, x, y, r) => {
    g.fillStyle = '#b0917a';
    g.fillRect(x - r * 0.06, y, r * 0.12, r * 1.1);
    disc(g, x, y - r * 0.1, r * 0.6, '#f39cbe', INK, 2);
    disc(g, x, y - r * 0.1, r * 0.3, '#fbf8f0');
  }) },
  ymShopBalloon: { h: 64, paint: shopBoard('#f3e6a8', '#2a3a6a', 'ふうせん', 'BALLOONS', (g, x, y, r) => {
    disc(g, x - r * 0.35, y - r * 0.2, r * 0.42, '#e0453f', INK, 1.5);
    disc(g, x + r * 0.35, y - r * 0.3, r * 0.42, '#4f7fcc', INK, 1.5);
    disc(g, x, y + r * 0.2, r * 0.42, '#f4c033', INK, 1.5);
  }) },
  ymShopPhoto: { h: 64, paint: shopBoard('#cfe6d6', '#2a3a4a', 'しゃしん', 'PHOTOS', (g, x, y, r) => {
    g.fillStyle = '#59617a';
    g.fillRect(x - r * 0.7, y - r * 0.4, r * 1.4, r * 0.9);
    disc(g, x, y + r * 0.05, r * 0.32, '#cfe0ee', INK, 2);
  }) },
  ymStallYaki: { h: 32, paint: stallBoard('#e0453f', '#fbf8f0', 'やきそば') },
  ymStallKaki: { h: 32, paint: stallBoard('#8cc3e6', '#2a3a6a', 'かき氷') },
  ymStallWata: { h: 32, paint: stallBoard('#f39cbe', '#6a2a4a', 'わたあめ') },
  ymStallJuice: { h: 32, paint: stallBoard('#f4c033', '#6a4a2a', 'ジュース') },
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
  mesh.name = 'yume signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
