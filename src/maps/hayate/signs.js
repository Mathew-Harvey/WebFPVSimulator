/*
 * signs.js: every painted sign at Hayate Circuit on one picture, and the
 * one mesh that shows them, as ../sunny/signs.js is Sunnyfield's. The
 * hoardings round the armco, the grid boxes, the brake boards, the corner
 * numbers, the garages' team fascias, the crowds in the stands, the tower's
 * crown and its clock: each a quad on a cell of one canvas, so seven
 * hundred signs cost one draw call and one texture.
 *
 * Every word is the circuit's own. The sponsors on the hoardings are made
 * up (a dragonfly soda, a lightning bolt oil, a cat's noodles and the
 * rest), so no real brand is shown or implied; the partners' marks are the
 * pipeline's, on the billboards (./layout.js). The crowds are painted, not
 * modelled: rows of heads and shirts on a cell, which reads as a full
 * stand from the track for two triangles a row.
 *
 * The painting is the browser's: a canvas, its 2D context and its fonts.
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

import { w } from './frame.js';

const INK = '#1d1b26';
const CREAM = '#fbf8f0';
const HEAVY = '900 {px}px "Arial Black", "Helvetica Neue", Arial, sans-serif';
const BOLD = '700 {px}px "Helvetica Neue", Arial, sans-serif';
const JP = `900 {px}px 'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', 'WenQuanYi Zen Hei', sans-serif`;

/* The atlas is this wide; a cell is this many pixels high unless its key
 * says otherwise, and as wide as its first use's aspect makes it. */
const ATLAS_W = 2048;
const CELL_H = 64;
const PAD = 3;

/* ---- the painter's hand ---- */

function font(g, face, px) {
  g.font = face.replace('{px}', String(Math.round(px)));
}

function fit(g, text, maxW, px, face) {
  let size = px;
  font(g, face, size);
  while (size > 6 && g.measureText(text).width > maxW) {
    size -= 1;
    font(g, face, size);
  }
  return size;
}

/* Words centred at (x, y), shrunk until they fit maxW. */
function words(g, text, x, y, maxW, px, colour, face = HEAVY) {
  fit(g, text, maxW, px, face);
  g.fillStyle = colour;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/* Words with an ink outline, a comic's lettering. */
function lettered(g, text, x, y, maxW, px, colour, line = INK, face = HEAVY) {
  const size = fit(g, text, maxW, px, face);
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

/* Speed lines, a comic's, across a board behind its words. */
function speedLines(g, w, h, colour) {
  g.strokeStyle = colour;
  g.lineWidth = Math.max(1, h * 0.04);
  for (let i = 0; i < 9; i += 1) {
    const y = h * (0.15 + i * 0.09);
    const x0 = w * (0.02 + ((i * 37) % 11) * 0.01);
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x0 + w * (0.08 + ((i * 13) % 5) * 0.02), y);
    g.stroke();
  }
}

/* A hoarding along the armco: a board in its colour, a mark, a name. */
const hoarding = (bg, fg, text, mark, sub = null) => (g, w, h) => {
  panel(g, w, h, bg, INK, 3, 4);
  speedLines(g, w, h, 'rgba(255,255,255,0.18)');
  const mx = h * 0.62;
  mark(g, mx, h / 2, h * 0.36, fg);
  if (sub) {
    lettered(g, text, w / 2 + h * 0.4, h * 0.42, w - h * 1.6, h * 0.56, fg);
    words(g, sub, w / 2 + h * 0.4, h * 0.82, w - h * 1.8, h * 0.2, fg, BOLD);
  } else {
    lettered(g, text, w / 2 + h * 0.4, h / 2 + 1, w - h * 1.6, h * 0.66, fg);
  }
};

/* The marks, each a few strokes in the board's lettering colour. */
const MARK = {
  dragonfly(g, x, y, r, c) {
    g.fillStyle = c;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(x, y, r * 0.16, r, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    for (const [dy, s] of [[-0.35, 1], [0.05, 0.85]]) {
      for (const side of [-1, 1]) {
        g.beginPath();
        g.ellipse(x + side * r * 0.55 * s, y + dy * r, r * 0.55 * s, r * 0.16, side * 0.15, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
  },
  bolt(g, x, y, r, c) {
    g.fillStyle = c;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + r * 0.3, y - r);
    g.lineTo(x - r * 0.45, y + r * 0.1);
    g.lineTo(x, y + r * 0.1);
    g.lineTo(x - r * 0.3, y + r);
    g.lineTo(x + r * 0.5, y - r * 0.15);
    g.lineTo(x + r * 0.02, y - r * 0.15);
    g.closePath();
    g.fill();
    g.stroke();
  },
  cat(g, x, y, r, c) {
    g.fillStyle = c;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - r * 0.8, y - r * 0.1);
    g.lineTo(x - r * 0.7, y - r);
    g.lineTo(x - r * 0.25, y - r * 0.55);
    g.lineTo(x + r * 0.25, y - r * 0.55);
    g.lineTo(x + r * 0.7, y - r);
    g.lineTo(x + r * 0.8, y - r * 0.1);
    g.quadraticCurveTo(x + r * 0.8, y + r * 0.8, x, y + r * 0.8);
    g.quadraticCurveTo(x - r * 0.8, y + r * 0.8, x - r * 0.8, y - r * 0.1);
    g.fill();
    g.stroke();
    disc(g, x - r * 0.32, y, r * 0.1, INK);
    disc(g, x + r * 0.32, y, r * 0.1, INK);
  },
  cloud(g, x, y, r, c) {
    for (const [dx, dy, k] of [[-0.45, 0.15, 0.45], [0, -0.15, 0.6], [0.45, 0.15, 0.45]]) {
      disc(g, x + dx * r, y + dy * r, k * r, c, INK, 2);
    }
    g.fillStyle = c;
    g.fillRect(x - r * 0.45, y + r * 0.1, r * 0.9, r * 0.45);
  },
  wolf(g, x, y, r, c) {
    g.fillStyle = c;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - r * 0.7, y - r);
    g.lineTo(x - r * 0.2, y - r * 0.4);
    g.lineTo(x + r * 0.2, y - r * 0.4);
    g.lineTo(x + r * 0.7, y - r);
    g.lineTo(x + r * 0.6, y + r * 0.1);
    g.lineTo(x, y + r);
    g.lineTo(x - r * 0.6, y + r * 0.1);
    g.closePath();
    g.fill();
    g.stroke();
  },
  wind(g, x, y, r, c) {
    g.strokeStyle = c;
    g.lineWidth = Math.max(2, r * 0.22);
    g.lineCap = 'round';
    for (const [dy, len] of [[-0.5, 1.6], [0, 1.9], [0.5, 1.3]]) {
      g.beginPath();
      g.moveTo(x - r, y + dy * r);
      g.lineTo(x - r + len * r, y + dy * r);
      g.stroke();
    }
  },
  mountain(g, x, y, r, c) {
    g.fillStyle = c;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - r, y + r * 0.7);
    g.lineTo(x - r * 0.25, y - r * 0.7);
    g.lineTo(x + r * 0.25, y - r * 0.7);
    g.lineTo(x + r, y + r * 0.7);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = CREAM;
    g.beginPath();
    g.moveTo(x - r * 0.25, y - r * 0.7);
    g.lineTo(x + r * 0.25, y - r * 0.7);
    g.lineTo(x + r * 0.45, y - r * 0.2);
    g.lineTo(x + r * 0.1, y - r * 0.35);
    g.lineTo(x - r * 0.15, y - r * 0.2);
    g.lineTo(x - r * 0.45, y - r * 0.25);
    g.closePath();
    g.fill();
  },
  sparrow(g, x, y, r, c) {
    disc(g, x, y + r * 0.1, r * 0.6, c, INK, 2);
    disc(g, x + r * 0.45, y - r * 0.4, r * 0.35, c, INK, 2);
    disc(g, x + r * 0.55, y - r * 0.45, r * 0.07, INK);
    g.fillStyle = '#e9a23a';
    g.beginPath();
    g.moveTo(x + r * 0.78, y - r * 0.42);
    g.lineTo(x + r * 1.05, y - r * 0.32);
    g.lineTo(x + r * 0.78, y - r * 0.25);
    g.fill();
  },
};

/* A plate with words on it, centred. */
const plate = (bg, fg, text, face = HEAVY, line = null) => (g, w, h) => {
  panel(g, w, h, bg, INK, 4, 4);
  if (line) {
    lettered(g, text, w / 2, h / 2 + 1, w * 0.9, h * 0.66, fg, line, face);
  } else {
    words(g, text, w / 2, h / 2 + 1, w * 0.9, h * 0.66, fg, face);
  }
};

/* A board with a name in big lettering and the circuit's name in kanji. */
const named = (bg, fg, text, kanji) => (g, w, h) => {
  panel(g, w, h, bg, INK, 6, 5);
  speedLines(g, w, h, 'rgba(255,255,255,0.16)');
  const split = kanji ? 0.68 : 1;
  lettered(g, text, (w * split) / 2, h / 2 + 1, w * split * 0.92, h * 0.68, fg);
  if (kanji) {
    lettered(g, kanji, w * (split + (1 - split) / 2), h / 2 + 1, w * (1 - split) * 0.9, h * 0.66, fg, INK, JP);
  }
};

/* A grid box painted on the asphalt: an open white bracket and the
 * slot's number, on nothing, so the track shows through. */
const gridBox = (n) => (g, w, h) => {
  g.strokeStyle = CREAM;
  g.lineWidth = w * 0.07;
  g.beginPath();
  g.moveTo(w * 0.08, h * 0.12);
  g.lineTo(w * 0.92, h * 0.12);
  g.moveTo(w * 0.08, h * 0.08);
  g.lineTo(w * 0.08, h * 0.6);
  g.moveTo(w * 0.92, h * 0.08);
  g.lineTo(w * 0.92, h * 0.6);
  g.stroke();
  words(g, String(n), w / 2, h * 0.62, w * 0.7, h * 0.5, CREAM);
};

/* A row of the crowd: heads and shoulders in a dozen shirts, three rows
 * deep, a flag or a raised arm here and there. `seed` picks the faces. */
const SHIRTS = ['#f0721e', '#2f6fd0', '#2f9a4c', '#d8333d', '#f4f2f0', '#dcbc58', '#f2a6bd', '#2e4382', '#e9a23a', '#3a3f58'];
const HAIR = ['#2b2830', '#3d2f2a', '#5a4030', '#2b2830', '#7a5a3a'];
const SKIN = ['#ebc6a2', '#e0b48e', '#d8a47a', '#f0d0b0'];
const crowd = (seed) => (g, w, h) => {
  g.fillStyle = '#5a5872';
  g.fillRect(0, 0, w, h);
  let k = seed * 97 + 13;
  const rnd = () => {
    k = (Math.imul(k, 1103515245) + 12345) >>> 0;
    return ((k >>> 8) & 0xffff) / 65536;
  };
  const rows = 2;
  for (let r = 0; r < rows; r += 1) {
    const base = h * (0.62 + r * 0.42);
    const step = h * 0.22;
    for (let x = step * (r ? 0.5 : 0) + rnd() * 3; x < w + step; x += step * (0.82 + rnd() * 0.36)) {
      const s = SHIRTS[Math.floor(rnd() * SHIRTS.length)];
      const head = h * 0.085;
      const y = base - h * 0.2 - rnd() * h * 0.06;
      g.fillStyle = s;
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      g.beginPath();
      g.roundRect(x - step * 0.42, y + head * 0.8, step * 0.84, h * 0.5, step * 0.25);
      g.fill();
      g.stroke();
      if (rnd() < 0.14) {
        g.strokeStyle = SKIN[Math.floor(rnd() * SKIN.length)];
        g.lineWidth = step * 0.16;
        g.beginPath();
        g.moveTo(x + step * 0.3, y + head * 1.4);
        g.lineTo(x + step * 0.45, y - head * 1.6);
        g.stroke();
        if (rnd() < 0.5) {
          g.fillStyle = SHIRTS[Math.floor(rnd() * 4)];
          g.fillRect(x + step * 0.45, y - head * 2.6, step * 0.6, head * 1.1);
        }
      }
      disc(g, x, y, head, SKIN[Math.floor(rnd() * SKIN.length)], INK, 1.5);
      g.fillStyle = HAIR[Math.floor(rnd() * HAIR.length)];
      g.beginPath();
      g.arc(x, y - head * 0.15, head * 1.02, Math.PI, 0);
      g.fill();
      if (rnd() < 0.18) {
        g.fillStyle = SHIRTS[Math.floor(rnd() * SHIRTS.length)];
        g.fillRect(x - head * 1.1, y - head * 0.9, head * 2.2, head * 0.5);
      }
    }
  }
};

/* A brake board: a white board, black numbers, a slash of red. */
const brake = (n) => (g, w, h) => {
  panel(g, w, h, CREAM, INK, 4, 4);
  g.fillStyle = '#d8333d';
  g.beginPath();
  g.moveTo(0, h * 0.82);
  g.lineTo(w, h * 0.62);
  g.lineTo(w, h * 0.74);
  g.lineTo(0, h * 0.94);
  g.fill();
  words(g, String(n), w / 2, h * 0.42, w * 0.84, h * 0.52, INK);
};

/* A corner number, on the outside of each bend. */
const cornerBoard = (n) => (g, w, h) => {
  panel(g, w, h, '#2e4382', INK, 6, 4);
  lettered(g, String(n), w * 0.38, h / 2 + 1, w * 0.5, h * 0.78, CREAM);
  g.fillStyle = '#e9a23a';
  g.beginPath();
  g.moveTo(w * 0.7, h * 0.25);
  g.lineTo(w * 0.88, h * 0.5);
  g.lineTo(w * 0.7, h * 0.75);
  g.fill();
};

const SIGNS = {
  startLine: { h: 64, paint: (g, w, h) => {
    const n = 2;
    const s = h / n;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c * s < w; c += 1) {
        g.fillStyle = (r + c) % 2 ? INK : CREAM;
        g.fillRect(c * s, r * s, s, s);
      }
    }
  } },
  b150: { h: 64, paint: brake(150) },
  b100: { h: 64, paint: brake(100) },
  b50: { h: 64, paint: brake(50) },
  adTombo: { h: 64, paint: hoarding('#2f918e', CREAM, 'TOMBO SODA', MARK.dragonfly, 'ramune since 1952') },
  adInazuma: { h: 64, paint: hoarding('#2b2830', '#f2bd34', 'INAZUMA OIL', MARK.bolt) },
  adNeko: { h: 64, paint: hoarding(CREAM, '#d8333d', 'NEKO NOODLES', MARK.cat, 'hot in three minutes') },
  adKumo: { h: 64, paint: hoarding('#2f6fd0', CREAM, 'KUMO TYRES', MARK.cloud) },
  adOkami: { h: 64, paint: hoarding('#d8333d', CREAM, 'OKAMI MOTORS', MARK.wolf) },
  adHayate: { h: 64, paint: hoarding('#f4f2f0', '#2e4382', 'HAYATE CIRCUIT', MARK.wind) },
  adFuji: { h: 64, paint: hoarding('#e8742a', CREAM, 'FUJIMI CURRY', MARK.mountain, 'mild, medium, volcano') },
  adSuzume: { h: 64, paint: hoarding('#f2bd34', INK, 'SUZUME RADIO', MARK.sparrow, '88.2 FM') },
  adTomboBig: { h: 48, paint: hoarding('#2f918e', CREAM, 'TOMBO SODA  TOMBO SODA', MARK.dragonfly) },
  pit60: { h: 128, paint: (g, w, h) => {
    disc(g, w / 2, h / 2, w * 0.42, CREAM);
    disc(g, w / 2, h / 2, w * 0.34, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out';
    disc(g, w / 2, h / 2, w * 0.33, '#000');
    g.globalCompositeOperation = 'source-over';
    words(g, '60', w / 2, h / 2 + 2, w * 0.5, h * 0.42, CREAM);
  } },
  pitOut: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#2f9a4c', INK, 6, 4);
    words(g, 'PIT', w / 2, h * 0.3, w * 0.8, h * 0.3, CREAM);
    words(g, 'OUT', w / 2, h * 0.68, w * 0.8, h * 0.34, CREAM);
  } },
  pitIn: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#2f6fd0', INK, 6, 4);
    words(g, 'PIT', w / 2, h * 0.3, w * 0.8, h * 0.3, CREAM);
    words(g, 'IN', w / 2, h * 0.68, w * 0.8, h * 0.34, CREAM);
  } },
  teamKitsune: { h: 48, paint: named('#f0721e', CREAM, 'KITSUNE RACING', '狐') },
  teamRaijin: { h: 48, paint: named('#2f6fd0', CREAM, 'RAIJIN WORKS', '雷') },
  teamMidori: { h: 48, paint: named('#2f9a4c', CREAM, 'MIDORI MOTORSPORT', '緑') },
  teamAka: { h: 48, paint: named('#d8333d', CREAM, 'AKA SPEED', '赤') },
  teamYuki: { h: 48, paint: named('#f4f2f0', '#2e4382', 'YUKI RACING', '雪') },
  teamKiiro: { h: 48, paint: named('#f2bd34', INK, 'KIIRO GARAGE', '黄') },
  hayateLong: { h: 48, paint: named('#2e4382', CREAM, 'HAYATE CIRCUIT', '疾風サーキット') },
  hayateTower: { h: 128, paint: (g, w, h) => {
    panel(g, w, h, '#f4f2f0', INK, 8, 6);
    speedLines(g, w, h, 'rgba(46,67,130,0.25)');
    lettered(g, 'HAYATE', w * 0.36, h * 0.5, w * 0.62, h * 0.6, '#d8333d');
    lettered(g, '疾風', w * 0.82, h * 0.5, w * 0.3, h * 0.66, '#2e4382', INK, JP);
  } },
  clock: { h: 128, paint: (g, w, h) => {
    disc(g, w / 2, h / 2, w * 0.47, CREAM, INK, 6);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      disc(g, w / 2 + Math.sin(a) * w * 0.38, h / 2 - Math.cos(a) * h * 0.38, w * 0.025, INK);
    }
    g.strokeStyle = INK;
    g.lineCap = 'round';
    g.lineWidth = w * 0.045;
    g.beginPath();
    g.moveTo(w / 2, h / 2);
    g.lineTo(w / 2 - w * 0.2, h / 2 - h * 0.12);
    g.stroke();
    g.lineWidth = w * 0.03;
    g.beginPath();
    g.moveTo(w / 2, h / 2);
    g.lineTo(w / 2 + w * 0.26, h / 2 - h * 0.16);
    g.stroke();
    disc(g, w / 2, h / 2, w * 0.04, '#d8333d');
  } },
  crowd0: { h: 64, paint: crowd(0) },
  crowd1: { h: 64, paint: crowd(1) },
  crowd2: { h: 64, paint: crowd(2) },
  crowd3: { h: 64, paint: crowd(3) },
  gateA: { h: 48, paint: plate('#2e4382', CREAM, 'GATE A') },
  mainStand: { h: 48, paint: named('#d8333d', CREAM, 'MAIN GRANDSTAND', '正面スタンド') },
  ichiStand: { h: 48, paint: named('#2e4382', CREAM, 'ICHI STAND', '一') },
  kurenaiStand: { h: 48, paint: named('#c22c3a', CREAM, 'KURENAI STAND', '紅') },
  chicaneStand: { h: 48, paint: named('#2f9a4c', CREAM, 'CHICANE STAND', null) },
  hayateBridge: { h: 128, paint: (g, w, h) => {
    panel(g, w, h, '#2e4382', INK, 10, 6);
    lettered(g, '疾風', w / 2, h * 0.4, w * 0.8, h * 0.5, CREAM, INK, JP);
    words(g, 'HAYATE CIRCUIT', w / 2, h * 0.8, w * 0.84, h * 0.2, '#f2bd34');
  } },
  startFinish: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, INK, INK, 2, 2);
    const s = h / 2;
    for (const x0 of [0, w - h * 2]) {
      for (let r = 0; r < 2; r += 1) {
        for (let c = 0; c < 4; c += 1) {
          g.fillStyle = (r + c) % 2 ? INK : CREAM;
          g.fillRect(x0 + c * s, r * s, s, s);
        }
      }
    }
    lettered(g, 'START  FINISH', w / 2, h / 2 + 1, w - h * 4.6, h * 0.66, '#f2bd34');
  } },
  skyWheel: { h: 48, paint: plate('#f2a6bd', INK, 'SKY WHEEL') },
  skyWheelBig: { h: 48, paint: named('#f2a6bd', INK, 'HAYATE SKY WHEEL', '観覧車') },
  medical: { h: 48, paint: (g, w, h) => {
    panel(g, w, h, CREAM, INK, 4, 4);
    const c = h * 0.5;
    g.fillStyle = '#d8333d';
    g.fillRect(h * 0.5 - c * 0.15, h / 2 - c / 2, c * 0.3, c);
    g.fillRect(h * 0.5 - c / 2, h / 2 - c * 0.15, c, c * 0.3);
    words(g, 'MEDICAL CENTRE', w / 2 + h * 0.4, h / 2 + 1, w - h * 1.6, h * 0.6, '#d8333d');
  } },
  heliH: { h: 128, paint: (g, w, h) => {
    g.strokeStyle = CREAM;
    g.lineWidth = w * 0.05;
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
    g.stroke();
    words(g, 'H', w / 2, h / 2 + 3, w * 0.5, h * 0.56, CREAM);
  } },
  hayateGate: { h: 64, paint: named('#c22c3a', CREAM, 'HAYATE CIRCUIT', '疾風') },
};
for (let i = 1; i <= 12; i += 1) {
  SIGNS[`grid${i}`] = { h: 64, paint: gridBox(i) };
}
for (let i = 1; i <= 7; i += 1) {
  SIGNS[`post${i}`] = { h: 64, paint: (g, wd, h) => {
    disc(g, wd / 2, h / 2, wd * 0.46, '#f0721e', INK, 4);
    words(g, String(i), wd / 2, h / 2 + 2, wd * 0.6, h * 0.6, CREAM);
  } };
}
for (let i = 1; i <= 14; i += 1) {
  SIGNS[`T${i}`] = { h: 64, paint: cornerBoard(i) };
}
for (let i = 1; i <= 24; i += 1) {
  SIGNS[`bay${i}`] = { h: 32, paint: plate('#2b2830', CREAM, String(i)) };
}
for (const [k, c] of [[1, '#e9b23a'], [2, '#c9ccd2'], [3, '#c98a4a']]) {
  SIGNS[`pod${k}`] = { h: 64, paint: (g, wd, h) => {
    panel(g, wd, h, c, INK, 6, 4);
    words(g, String(k), wd / 2, h / 2 + 2, wd * 0.7, h * 0.7, INK);
  } };
}

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
  const { cells, w: aw, h: ah } = packSigns(signs);
  const c = document.createElement('canvas');
  c.width = aw;
  c.height = ah;
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
  return { canvas: c, cells, w: aw, h: ah };
}

/*
 * Every sign as a quad on its cell, one mesh: positions in the world,
 * `lift` out from the face it is hung on along the plan normal (nx, ny),
 * or lying face up, its top to the north, when that normal is (0, 0).
 * Seen from in front, a sign reads left to right.
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
    if (s.nx === 0 && s.ny === 0) {
      n.set(0, 1, 0);
      up.set(0, 0, -1);
    } else {
      n.set(s.nx, 0, -s.ny).normalize();
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
  mesh.name = 'hayate signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
