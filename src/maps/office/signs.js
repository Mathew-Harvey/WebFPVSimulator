/*
 * signs.js: every word and picture in Hoshino Shoji, painted once onto one
 * canvas and hung as quads on two meshes, the lit ones and the glowing ones,
 * as Sunnyfield's signs are (src/maps/sunny/signs.js says why one picture
 * and not a texture each).
 *
 * WHAT IS PAINTED. What a Japanese office has on its walls and what a manga
 * artist draws to say "an office in Japan": the 5S poster, the sales chart
 * with its paper roses, the schedule board's magnets, the kamidana's paper
 * zigzags, the noren, the exit sign's running man, the vending machine's
 * lit rows, the road's 止まれ. The company and every shop round it are made
 * up: no real firm's name or mark is on any of it.
 *
 * THE HAND. Flat colour, an ink line round every panel, heavy lettering
 * with an ink outline for anything a reader should read, the town's ink and
 * cream. The glass is painted too: two white streaks on nothing, cut out,
 * which is how a comic says a pane is there.
 *
 * Japanese is lettered in the town's stack of Japanese faces (each
 * platform ships one of them); a machine without any draws boxes, and the
 * picture under the words still says what the sign is.
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

import { worldAt, S } from './office.js';

const INK = '#1d1b26';
const CREAM = '#fbf8f0';
const RED = '#d43c33';
const BLUE = '#2f62b0';
const GREEN = '#2f8a4a';
const YELLOW = '#f2c52c';
const JP = '"Yu Gothic", "YuGothic", "Meiryo", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", "IPAGothic", sans-serif';
const HEAVY = `900 {px}px "Arial Black", "Helvetica Neue", Arial, ${JP}`;
const BOLD = `700 {px}px "Helvetica Neue", Arial, ${JP}`;
const JPH = `900 {px}px ${JP}`;
const JPB = `700 {px}px ${JP}`;
const MINCHO = `700 {px}px "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", "IPAMincho", ${JP}`;

/* The atlas is this wide; a cell is this many pixels high unless its key
 * says otherwise. */
const ATLAS_W = 1024;
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
function words(g, text, x, y, maxW, px, colour, face = JPB) {
  fit(g, text, maxW, px, face);
  g.fillStyle = colour;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/* Words with an ink outline, a comic's lettering. */
function lettered(g, text, x, y, maxW, px, colour, line = INK, face = JPH) {
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

/* Words down the page, one glyph under the next, as a Japanese sign runs. */
function down(g, text, x, y0, y1, px, colour, face = JPH, line = null) {
  const chars = [...text];
  const step = (y1 - y0) / chars.length;
  const size = Math.min(px, step * 0.92);
  font(g, face, size);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  chars.forEach((c, i) => {
    const y = y0 + step * (i + 0.5);
    if (line) {
      g.lineJoin = 'round';
      g.lineWidth = Math.max(2, size * 0.16);
      g.strokeStyle = line;
      g.strokeText(c, x, y);
    }
    g.fillStyle = colour;
    g.fillText(c, x, y);
  });
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

function rect(g, x, y, w, h, fill, edge = null, lw = 2) {
  if (fill) {
    g.fillStyle = fill;
    g.fillRect(x, y, w, h);
  }
  if (edge) {
    g.lineWidth = lw;
    g.strokeStyle = edge;
    g.strokeRect(x, y, w, h);
  }
}

function disc(g, x, y, r, fill, edge = null, lw = 2) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (edge) {
    g.lineWidth = lw;
    g.strokeStyle = edge;
    g.stroke();
  }
}

function line(g, pts, colour = INK, lw = 2) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) {
    g.lineTo(pts[i], pts[i + 1]);
  }
  g.lineWidth = lw;
  g.strokeStyle = colour;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
}

/* A seeded hand, so the scribbles and the magnets land the same each time. */
function hand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* A room's name plate over its door: white, the name in ink. */
const plate = (text) => (g, w, h) => {
  panel(g, w, h, '#f4f2ec', INK, 3, 3);
  words(g, text, w / 2, h / 2 + 1, w * 0.86, h * 0.66, INK, JPB);
};

/* A shop's fascia: a board in its colour, the name lettered across it. */
const fascia = (bg, fg, text, sub = null) => (g, w, h) => {
  panel(g, w, h, bg, INK, 4, 4);
  if (sub) {
    lettered(g, text, w / 2, h * 0.42, w * 0.92, h * 0.58, fg);
    words(g, sub, w / 2, h * 0.84, w * 0.8, h * 0.2, fg, BOLD);
  } else {
    lettered(g, text, w / 2, h / 2 + 1, w * 0.92, h * 0.66, fg);
  }
};

/* A pictogram figure: a head and a body, the toilets' and the exit's. */
function figure(g, x, y, s, colour, skirt = false) {
  disc(g, x, y - s * 0.62, s * 0.16, colour);
  g.fillStyle = colour;
  g.beginPath();
  if (skirt) {
    g.moveTo(x - s * 0.12, y - s * 0.42);
    g.lineTo(x + s * 0.12, y - s * 0.42);
    g.lineTo(x + s * 0.3, y + s * 0.15);
    g.lineTo(x - s * 0.3, y + s * 0.15);
  } else {
    g.roundRect(x - s * 0.2, y - s * 0.42, s * 0.4, s * 0.55, s * 0.06);
  }
  g.fill();
  g.fillRect(x - s * 0.14, y + s * 0.1, s * 0.1, s * 0.48);
  g.fillRect(x + s * 0.04, y + s * 0.1, s * 0.1, s * 0.48);
}

/* A drink in a vending machine's window: a can or a bottle, coloured. */
function drink(g, x, y, w, h, colour, bottle) {
  g.fillStyle = colour;
  if (bottle) {
    g.beginPath();
    g.roundRect(x + w * 0.2, y + h * 0.3, w * 0.6, h * 0.7, 3);
    g.fill();
    g.fillRect(x + w * 0.38, y + h * 0.08, w * 0.24, h * 0.24);
    g.fillStyle = CREAM;
    g.fillRect(x + w * 0.2, y + h * 0.55, w * 0.6, h * 0.16);
  } else {
    g.beginPath();
    g.roundRect(x + w * 0.18, y + h * 0.25, w * 0.64, h * 0.75, 3);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(x + w * 0.26, y + h * 0.32, w * 0.08, h * 0.6);
  }
  g.lineWidth = 1.5;
  g.strokeStyle = INK;
  g.strokeRect(x + w * 0.18, y + h * 0.25, w * 0.64, h * 0.75);
}

const vending = (body, cans, title) => (g, w, h) => {
  panel(g, w, h, body, INK, 6, 4);
  /* The lit window of samples, four rows. */
  const x0 = w * 0.08;
  const y0 = h * 0.06;
  const ww = w * 0.84;
  const wh = h * 0.5;
  rect(g, x0, y0, ww, wh, '#fbfaf2', INK, 3);
  const rows = 4;
  const cols = 6;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cw = ww / cols;
      const ch = wh / rows;
      drink(g, x0 + c * cw, y0 + r * ch + 2, cw, ch * 0.78, cans[(r * cols + c) % cans.length], (r + c) % 3 === 0);
      disc(g, x0 + c * cw + cw / 2, y0 + (r + 1) * ch - 3, 2.5, r === 1 && c === 4 ? RED : '#3fb06a');
    }
    rect(g, x0, y0 + (r + 1) * (wh / rows) - 1, ww, 2, INK);
  }
  /* The name across the middle, the coin slot, the drop. */
  rect(g, x0, h * 0.6, ww, h * 0.1, INK);
  words(g, title, w / 2, h * 0.65, ww * 0.9, h * 0.07, '#fffbe8', JPH);
  rect(g, w * 0.66, h * 0.74, w * 0.2, h * 0.1, '#c9ccd0', INK, 2);
  rect(g, w * 0.72, h * 0.76, w * 0.03, h * 0.06, INK);
  rect(g, w * 0.12, h * 0.86, w * 0.6, h * 0.09, '#2a2a32', INK, 3);
};

/* ---- the signs ---- */

const SIGNS = {
  /* The glass: two white streaks and a bright corner on nothing. */
  glass: {
    h: 128,
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.95)';
      for (const [a, t] of [[0.22, 0.09], [0.4, 0.035], [0.62, 0.05]]) {
        g.beginPath();
        g.moveTo(w * a, h * 0.08);
        g.lineTo(w * (a + t), h * 0.08);
        g.lineTo(w * (a + t - 0.3), h * 0.55);
        g.lineTo(w * (a - 0.3), h * 0.55);
        g.closePath();
        g.fill();
      }
      g.fillRect(w * 0.04, h * 0.04, w * 0.14, 3);
      g.fillRect(w * 0.04, h * 0.04, 3, h * 0.1);
    },
  },
  /* The meeting room's frosted band, the company's star stepped along it. */
  frost: {
    paint(g, w, h) {
      rect(g, 0, 0, w, h, '#dfe7ec');
      rect(g, 0, h * 0.18, w, 2, '#ffffff');
      rect(g, 0, h * 0.8, w, 2, '#ffffff');
      for (let x = w * 0.12; x < w; x += h * 1.2) {
        star(g, x, h / 2, h * 0.22, '#b8c6d0');
      }
    },
  },
  /* The green exit sign: the running man and the door, 非常口. */
  exit: {
    paint(g, w, h) {
      panel(g, w, h, '#1f9a52', '#0f5a2a', 3, 3);
      rect(g, w * 0.06, h * 0.14, h * 0.72, h * 0.72, '#f4fff4');
      rect(g, w * 0.06 + h * 0.1, h * 0.22, h * 0.36, h * 0.56, '#1f9a52');
      /* A running figure going out of the door. */
      const x = w * 0.06 + h * 0.86;
      disc(g, x + h * 0.22, h * 0.24, h * 0.09, '#f4fff4');
      line(g, [x + h * 0.18, h * 0.36, x + h * 0.08, h * 0.6, x - h * 0.1, h * 0.72], '#f4fff4', h * 0.1);
      line(g, [x + h * 0.08, h * 0.6, x + h * 0.26, h * 0.82], '#f4fff4', h * 0.1);
      line(g, [x - h * 0.05, h * 0.42, x + h * 0.18, h * 0.36, x + h * 0.34, h * 0.48], '#f4fff4', h * 0.08);
      words(g, '非常口 EXIT', w * 0.68, h / 2 + 1, w * 0.5, h * 0.5, '#f4fff4', JPH);
    },
  },
  floor1: { paint: floorNo('1F') },
  floor2: { paint: floorNo('2F') },
  floor3: { paint: floorNo('3F') },
  floor4: { paint: floorNo('R') },
  /* The lift's call panel: a stainless plate, the up and down buttons. */
  liftPanel: {
    paint(g, w, h) {
      panel(g, w, h, '#cdd3d8', INK, 3, 2);
      for (const [y, up] of [[h * 0.36, true], [h * 0.62, false]]) {
        disc(g, w / 2, y, w * 0.3, '#f7f2e0', INK, 1.5);
        g.fillStyle = up ? '#ff9a3a' : INK;
        g.beginPath();
        const s = up ? -1 : 1;
        g.moveTo(w / 2, y + s * w * 0.14);
        g.lineTo(w / 2 - w * 0.13, y - s * w * 0.1);
        g.lineTo(w / 2 + w * 0.13, y - s * w * 0.1);
        g.fill();
      }
    },
  },
  /* The works' notice taped over the lift: yellow and black, a man bowing. */
  liftWorks: {
    h: 128,
    paint(g, w, h) {
      rect(g, 0, 0, w, h, YELLOW);
      g.save();
      g.beginPath();
      g.rect(0, 0, w, h);
      g.rect(8, 8, w - 16, h - 16);
      g.clip('evenodd');
      g.fillStyle = INK;
      for (let x = -h; x < w + h; x += 14) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 7, 0);
        g.lineTo(x + 7 - h, h);
        g.lineTo(x - h, h);
        g.fill();
      }
      g.restore();
      rect(g, 12, 12, w - 24, h - 24, '#fffbe6');
      lettered(g, '工事中', w / 2, h * 0.24, w * 0.8, h * 0.2, RED);
      words(g, 'エレベーター', w / 2, h * 0.42, w * 0.78, h * 0.1, INK, JPB);
      words(g, 'リニューアル工事', w / 2, h * 0.53, w * 0.78, h * 0.1, INK, JPB);
      /* The helmeted man bowing his apology, the comic's stock figure. */
      const x = w / 2;
      const y = h * 0.72;
      disc(g, x - 6, y - 4, 7, '#f6d2b0', INK, 1.5);
      g.fillStyle = YELLOW;
      g.beginPath();
      g.arc(x - 6, y - 7, 8, Math.PI, 0);
      g.fill();
      g.stroke();
      line(g, [x - 2, y + 2, x + 14, y + 10, x + 14, y + 24], INK, 3);
      words(g, 'ご迷惑をおかけします', w / 2, h * 0.88, w * 0.8, h * 0.07, INK, JPB);
    },
  },
  liftFloor1: { paint: liftFloor(1) },
  liftFloor2: { paint: liftFloor(2) },
  liftFloor3: { paint: liftFloor(3) },
  /* A carton's label, the barcode and the company. */
  boxLabel: {
    paint(g, w, h) {
      rect(g, 0, 0, w, h, '#fbfaf4', INK, 2);
      words(g, '星野商事', w * 0.5, h * 0.22, w * 0.8, h * 0.22, INK, JPH);
      const r = hand(7);
      for (let x = w * 0.12; x < w * 0.88; x += 2 + Math.floor(r() * 3)) {
        rect(g, x, h * 0.42, 1 + Math.floor(r() * 2), h * 0.36, INK);
      }
      words(g, '4901 2345 6789', w / 2, h * 0.88, w * 0.8, h * 0.13, INK, BOLD);
    },
  },
  fragile: {
    paint(g, w, h) {
      rect(g, 0, 0, w, h, RED);
      rect(g, 3, 3, w - 6, h - 6, null, CREAM, 2);
      /* The wine glass that every fragile label has. */
      line(g, [w * 0.15, h * 0.2, w * 0.17, h * 0.5, w * 0.27, h * 0.5, w * 0.29, h * 0.2], CREAM, 2);
      line(g, [w * 0.22, h * 0.5, w * 0.22, h * 0.78, w * 0.15, h * 0.8, w * 0.29, h * 0.8], CREAM, 2);
      words(g, 'ワレモノ', w * 0.64, h * 0.38, w * 0.6, h * 0.34, CREAM, JPH);
      words(g, '注意', w * 0.64, h * 0.72, w * 0.6, h * 0.3, CREAM, JPH);
    },
  },
  thisway: {
    paint(g, w, h) {
      rect(g, 0, 0, w, h, '#fbfaf4', INK, 2);
      for (const x of [w * 0.2, w * 0.34]) {
        line(g, [x, h * 0.85, x, h * 0.2], INK, 3);
        line(g, [x - 5, h * 0.35, x, h * 0.18, x + 5, h * 0.35], INK, 3);
      }
      words(g, '天地無用', w * 0.68, h / 2, w * 0.56, h * 0.5, INK, JPH);
    },
  },
  rack2: { paint: rackNo('A-2') },
  rack3: { paint: rackNo('B-3') },
  rack5: { paint: rackNo('C-5') },
  /* The time card rack by the door: two columns of cards in their slots. */
  timeCards: {
    h: 128,
    paint(g, w, h) {
      panel(g, w, h, '#c9ccd0', INK, 3, 3);
      words(g, 'タイムカード', w / 2, h * 0.08, w * 0.9, h * 0.08, INK, JPH);
      const r = hand(11);
      for (const x of [w * 0.08, w * 0.54]) {
        for (let y = h * 0.16; y < h * 0.94; y += h * 0.075) {
          rect(g, x, y, w * 0.38, h * 0.065, '#e6e8ea', INK, 1);
          rect(g, x + 3, y - h * 0.03, w * 0.38 - 6, h * 0.06, r() < 0.7 ? '#f6f0d8' : '#ffd6d6', INK, 1);
        }
      }
    },
  },
  /* The banner over goods in: 安全第一 by the green cross. */
  safety: {
    paint(g, w, h) {
      panel(g, w, h, '#fbfaf2', INK, 2, 4);
      const c = h / 2;
      rect(g, h * 0.3, h * 0.12, h * 0.22, h * 0.76, GREEN);
      rect(g, h * 0.07, c - h * 0.11, h * 0.68, h * 0.22, GREEN);
      lettered(g, '安全第一', w * 0.56, c + 2, w * 0.68, h * 0.78, GREEN, INK);
    },
  },
  /* The goods in board: the day's deliveries in marker. */
  delivery: {
    h: 128,
    paint(g, w, h) {
      panel(g, w, h, '#fdfdf8', '#8a8f99', 3, 6);
      words(g, '入荷・出荷予定', w * 0.3, h * 0.14, w * 0.5, h * 0.14, INK, JPH);
      const rows = ['09:00  ヤマト  12ケース', '11:30  佐川  パレット2', '14:00  チャーター', '16:30  出荷  関西便', '18:00  出荷  東北便'];
      rows.forEach((t, i) => {
        words(g, t, w * 0.3, h * (0.32 + i * 0.14), w * 0.52, h * 0.1, i === 3 ? RED : BLUE, JPB);
      });
      const r = hand(3);
      for (let i = 0; i < 4; i += 1) {
        disc(g, w * (0.66 + r() * 0.28), h * (0.2 + r() * 0.6), h * 0.05, [RED, YELLOW, BLUE, GREEN][i], INK, 1.5);
      }
      line(g, [w * 0.62, h * 0.8, w * 0.7, h * 0.6, w * 0.78, h * 0.7, w * 0.92, h * 0.35], RED, 3);
    },
  },
  noSmoking: {
    paint(g, w, h) {
      rect(g, 0, 0, w, h, '#fbfaf2');
      disc(g, w / 2, h * 0.42, h * 0.3, null, RED, h * 0.07);
      rect(g, w * 0.3, h * 0.38, w * 0.4, h * 0.08, INK);
      line(g, [w * 0.29, h * 0.21, w * 0.71, h * 0.63], RED, h * 0.07);
      words(g, '禁煙', w / 2, h * 0.86, w * 0.8, h * 0.2, RED, JPH);
    },
  },
  extinguisher: { paint: fascia(RED, CREAM, '消火器') },
  /* The motivational banner, 目標達成! がんばろう! */
  ganbaro: {
    h: 96,
    paint(g, w, h) {
      rect(g, 0, 0, w, h, '#fbfaf2', INK, 4);
      rect(g, 0, 0, w, h * 0.14, RED);
      rect(g, 0, h * 0.86, w, h * 0.14, RED);
      lettered(g, '目標達成！', w / 2, h * 0.36, w * 0.9, h * 0.32, RED);
      lettered(g, 'がんばろう！', w / 2, h * 0.66, w * 0.9, h * 0.26, INK, CREAM);
    },
  },
  /* The 5S poster: the five words a Japanese workplace keeps tidy by. */
  fiveS: {
    h: 160,
    paint(g, w, h) {
      panel(g, w, h, '#fbfaf2', INK, 2, 4);
      lettered(g, '5S', w * 0.3, h * 0.13, w * 0.4, h * 0.2, '#e8792a');
      words(g, '運動', w * 0.66, h * 0.13, w * 0.4, h * 0.12, INK, JPH);
      const S5 = [['整理', BLUE], ['整頓', GREEN], ['清掃', '#e8792a'], ['清潔', RED], ['しつけ', '#7a4aa0']];
      S5.forEach(([t, c], i) => {
        const y = h * (0.32 + i * 0.14);
        disc(g, w * 0.16, y, h * 0.05, c);
        words(g, String(i + 1), w * 0.16, y + 1, h * 0.08, h * 0.07, CREAM, HEAVY);
        words(g, t, w * 0.56, y, w * 0.6, h * 0.1, c, JPH);
      });
    },
  },
  wcM: {
    paint(g, w, h) {
      rect(g, 0, 0, w, h, BLUE);
      figure(g, w / 2, h * 0.55, h * 0.75, CREAM);
    },
  },
  wcW: {
    paint(g, w, h) {
      rect(g, 0, 0, w, h, RED);
      figure(g, w / 2, h * 0.55, h * 0.75, CREAM, true);
    },
  },
  store: { paint: plate('倉庫') },
  archive: { paint: plate('書庫') },
  uketsuke: { paint: fascia('#f4f2ec', INK, '受付', 'RECEPTION') },
  kyutoshitsu: { paint: plate('給湯室') },
  kaigishitsu: { paint: plate('会議室') },
  shachoshitsu: { paint: plate('社長室') },
  kyukeishitsu: { paint: plate('休憩室') },
  meetingBooth: { paint: plate('打合せコーナー') },
  penthouseNo: { paint: fascia('#fbfaf2', RED, '立入禁止', '関係者以外') },
  fireEscape: { paint: fascia(GREEN, CREAM, '避難階段') },
  /* The month on the wall, Sundays in red, a day ringed. */
  calendar: {
    h: 128,
    paint(g, w, h) {
      rect(g, 0, 0, w, h, '#fbfaf2', INK, 3);
      rect(g, 0, 0, w, h * 0.3, '#6fa3c7');
      lettered(g, '10月', w / 2, h * 0.15, w * 0.8, h * 0.18, CREAM);
      for (let d = 0; d < 31; d += 1) {
        const c = (d + 3) % 7;
        const r = Math.floor((d + 3) / 7);
        const x = w * (0.09 + c * 0.13);
        const y = h * (0.38 + r * 0.12);
        words(g, String(d + 1), x, y, w * 0.12, h * 0.07, c === 0 ? RED : c === 6 ? BLUE : INK, BOLD);
        if (d === 30) {
          disc(g, x, y, h * 0.05, null, RED, 2);
        }
      }
    },
  },
  /* The wall clock: half past five, the end of the day. */
  clock: {
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      disc(g, w / 2, h / 2, w * 0.47, '#fbfaf2', INK, w * 0.06);
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        const r0 = i % 3 === 0 ? 0.3 : 0.35;
        line(g, [w / 2 + Math.sin(a) * w * r0, h / 2 - Math.cos(a) * h * r0, w / 2 + Math.sin(a) * w * 0.4, h / 2 - Math.cos(a) * h * 0.4], INK, i % 3 === 0 ? 3 : 1.5);
      }
      const hr = ((5.5) / 12) * Math.PI * 2;
      const mn = 0.5 * Math.PI * 2;
      line(g, [w / 2, h / 2, w / 2 + Math.sin(hr) * w * 0.22, h / 2 - Math.cos(hr) * h * 0.22], INK, 4);
      line(g, [w / 2, h / 2, w / 2 + Math.sin(mn) * w * 0.34, h / 2 - Math.cos(mn) * h * 0.34], INK, 2.5);
      disc(g, w / 2, h / 2, 3, RED);
    },
  },
  nameplate: { paint: plate('営業部長') },
  nameplateBoss: { paint: plate('代表取締役') },
  /* The kamidana's paper zigzags on their rope. */
  shide: {
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      for (const x of [w * 0.2, w * 0.5, w * 0.8]) {
        g.fillStyle = '#fbfbf6';
        g.beginPath();
        const s = h * 0.18;
        g.moveTo(x - s, 0);
        g.lineTo(x + s, 0);
        g.lineTo(x + s, h * 0.3);
        g.lineTo(x - s * 0.2, h * 0.3);
        g.lineTo(x - s * 0.2, h * 0.62);
        g.lineTo(x + s, h * 0.62);
        g.lineTo(x + s, h * 0.95);
        g.lineTo(x - s, h * 0.95);
        g.lineTo(x - s, h * 0.66);
        g.lineTo(x + s * 0.2, h * 0.66);
        g.lineTo(x + s * 0.2, h * 0.34);
        g.lineTo(x - s, h * 0.34);
        g.closePath();
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = INK;
        g.stroke();
      }
    },
  },
  /* The team's photo on a poster, everyone's peace sign. */
  posterTeam: {
    h: 128,
    paint(g, w, h) {
      panel(g, w, h, '#fbfaf2', INK, 2, 3);
      rect(g, w * 0.08, h * 0.08, w * 0.84, h * 0.5, '#9cc8e8', INK, 2);
      rect(g, w * 0.08, h * 0.44, w * 0.84, h * 0.14, '#7fb06a');
      const r = hand(5);
      for (let i = 0; i < 5; i += 1) {
        const x = w * (0.18 + i * 0.16);
        disc(g, x, h * 0.32, w * 0.05, '#f6d2b0', INK, 1.2);
        rect(g, x - w * 0.06, h * 0.38, w * 0.12, h * 0.2, ['#2f4a5c', '#3d5f92', '#5a3426'][i % 3]);
        rect(g, x - w * 0.05, h * 0.24, w * 0.1, h * 0.04, r() < 0.5 ? INK : '#5a3426');
      }
      lettered(g, '営業部', w / 2, h * 0.7, w * 0.8, h * 0.16, BLUE);
      words(g, 'ファイト！', w / 2, h * 0.86, w * 0.8, h * 0.12, RED, JPH);
    },
  },
  scribbles: { h: 128, paint: scribbles(21, ['売上', '目標', '会議', '次回']) },
  scribbles2: { h: 128, paint: scribbles(42, ['予算', '新規', '確認', '!!']) },
  /* The schedule board: every name, where they are, a magnet each. */
  schedule: {
    h: 128,
    paint(g, w, h) {
      panel(g, w, h, '#fdfdf8', '#8a8f99', 3, 6);
      words(g, '行動予定表', w * 0.5, h * 0.09, w * 0.4, h * 0.1, INK, JPH);
      const names = ['田中', '佐藤', '鈴木', '高橋', '伊藤', '渡辺', '山本', '中村'];
      const where = ['在席', '外出', '直帰', '会議', '在席', '出張', '休み', '在席'];
      const cols = ['在席', '外出', '会議', '直帰', '出張', '休み'];
      const cw = (w * 0.76) / cols.length;
      cols.forEach((c, i) => words(g, c, w * 0.2 + cw * (i + 0.5), h * 0.22, cw * 0.9, h * 0.07, INK, JPB));
      line(g, [w * 0.04, h * 0.27, w * 0.96, h * 0.27], INK, 1.5);
      names.forEach((n, k) => {
        const y = h * (0.33 + k * 0.083);
        words(g, n, w * 0.11, y, w * 0.12, h * 0.065, INK, JPB);
        line(g, [w * 0.04, y + h * 0.04, w * 0.96, y + h * 0.04], '#c9ccd0', 1);
        const i = cols.indexOf(where[k]);
        disc(g, w * 0.2 + cw * (i + 0.5), y, h * 0.03, [RED, BLUE, YELLOW, GREEN][k % 4], INK, 1);
        if (where[k] !== '在席') {
          words(g, ['15時戻り', 'NR', '大阪'][k % 3], w * 0.2 + cw * (i + 1.2), y, cw, h * 0.05, BLUE, JPB);
        }
      });
    },
  },
  /* The month's target, 今月の目標. */
  target: {
    paint(g, w, h) {
      rect(g, 0, 0, w, h, RED, INK, 4);
      lettered(g, '今月の目標  売上 一億円 達成！', w / 2, h / 2 + 1, w * 0.94, h * 0.66, CREAM, INK);
    },
  },
  /* The sales chart: a bar a person, the leaders crowned with paper
   * roses, the comic's sign of a sales floor. */
  salesChart: {
    h: 160,
    paint(g, w, h) {
      panel(g, w, h, '#fbfaf2', INK, 2, 4);
      words(g, '営業成績', w / 2, h * 0.07, w * 0.8, h * 0.08, INK, JPH);
      const names = ['田中', '佐藤', '鈴木', '高橋', '伊藤', '渡辺'];
      const v = [0.82, 0.55, 0.92, 0.35, 0.66, 0.48];
      const bw = (w * 0.84) / names.length;
      for (let y = h * 0.16; y < h * 0.86; y += h * 0.07) {
        line(g, [w * 0.08, y, w * 0.92, y], '#d6d8da', 1);
      }
      names.forEach((n, i) => {
        const x = w * 0.08 + bw * i;
        const top = h * 0.86 - v[i] * h * 0.66;
        rect(g, x + bw * 0.18, top, bw * 0.64, h * 0.86 - top, i % 2 ? '#e8792a' : '#d43c33', INK, 1.5);
        words(g, n, x + bw / 2, h * 0.92, bw * 0.95, h * 0.06, INK, JPB);
        if (v[i] > 0.6) {
          rose(g, x + bw / 2, top - bw * 0.22, bw * 0.24);
        }
      });
    },
  },
  hydrant: {
    h: 96,
    paint(g, w, h) {
      rect(g, 0, 0, w, h, RED, INK, 4);
      rect(g, w * 0.08, h * 0.22, w * 0.84, h * 0.7, null, CREAM, 2);
      lettered(g, '消火栓', w / 2, h * 0.12, w * 0.8, h * 0.14, CREAM);
      disc(g, w * 0.8, h * 0.56, h * 0.05, '#ffd34a', INK, 1.5);
      words(g, 'ホース', w * 0.42, h * 0.56, w * 0.5, h * 0.14, CREAM, JPH);
    },
  },
  /* 必勝: the hachimaki slogan for the end of the year. */
  goal: {
    h: 128,
    paint(g, w, h) {
      panel(g, w, h, '#fbfaf2', INK, 2, 4);
      disc(g, w / 2, h * 0.38, w * 0.32, RED);
      down(g, '必勝', w / 2, h * 0.12, h * 0.66, w * 0.34, CREAM, MINCHO);
      words(g, '年末商戦', w / 2, h * 0.8, w * 0.8, h * 0.1, INK, JPH);
      words(g, '全員営業！', w / 2, h * 0.92, w * 0.8, h * 0.08, RED, JPH);
    },
  },
  /* A poster for the safety week, a hard hat and a green cross. */
  posterSafety: {
    h: 128,
    paint(g, w, h) {
      panel(g, w, h, '#f6f0d8', INK, 2, 3);
      rect(g, w * 0.4, h * 0.12, w * 0.2, h * 0.36, GREEN);
      rect(g, w * 0.24, h * 0.21, w * 0.52, h * 0.18, GREEN);
      lettered(g, '全国安全週間', w / 2, h * 0.64, w * 0.88, h * 0.12, GREEN);
      words(g, 'ゼロ災でいこう ヨシ！', w / 2, h * 0.82, w * 0.86, h * 0.08, INK, JPH);
    },
  },
  poster: {
    h: 128,
    paint(g, w, h) {
      panel(g, w, h, '#e7f1f6', INK, 2, 3);
      disc(g, w / 2, h * 0.36, w * 0.28, '#f2c52c', INK, 2);
      line(g, [w * 0.38, h * 0.3, w * 0.42, h * 0.33], INK, 3);
      line(g, [w * 0.58, h * 0.3, w * 0.62, h * 0.33], INK, 3);
      g.beginPath();
      g.arc(w / 2, h * 0.4, w * 0.12, 0.2, Math.PI - 0.2);
      g.lineWidth = 3;
      g.strokeStyle = INK;
      g.stroke();
      lettered(g, '笑顔で挨拶', w / 2, h * 0.76, w * 0.86, h * 0.13, BLUE);
      words(g, 'おはようございます！', w / 2, h * 0.9, w * 0.86, h * 0.07, INK, JPB);
    },
  },
  /* The noren over the tea kitchen: indigo, split in three, a white mon. */
  noren: {
    h: 96,
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      rect(g, 0, 0, w, h * 0.08, '#6b4a2a');
      const n = 3;
      const u = w / n;
      for (let i = 0; i < n; i += 1) {
        rect(g, i * u + 2, h * 0.08, u - 4, h * 0.92, '#2e4382', INK, 2);
      }
      disc(g, w / 2, h * 0.4, h * 0.2, null, CREAM, 3);
      words(g, '湯', w / 2, h * 0.41, h * 0.3, h * 0.24, CREAM, MINCHO);
      words(g, 'お', u * 0.5, h * 0.55, u * 0.6, h * 0.24, CREAM, MINCHO);
      words(g, '茶', u * 2.5, h * 0.55, u * 0.6, h * 0.24, CREAM, MINCHO);
    },
  },
  /* Memos and sticky notes on a desk's partition. */
  memo: { paint: memo(['#fff27a', '#ffb0c8', '#9fe2ff']) },
  memo2: { paint: memo(['#fbfaf4', '#fff27a', '#bdf0a8']) },
  /* The boardroom's screen: a slide with the year's figures. */
  presentation: {
    h: 96,
    paint(g, w, h) {
      rect(g, 0, 0, w, h, '#f7f9fc');
      rect(g, 0, 0, w, h * 0.16, '#2f62b0');
      words(g, '第3四半期 業績報告', w * 0.36, h * 0.08, w * 0.66, h * 0.11, CREAM, JPH);
      const v = [0.3, 0.42, 0.38, 0.55, 0.72];
      v.forEach((t, i) => rect(g, w * (0.08 + i * 0.1), h * (0.9 - t), w * 0.07, h * t, i === 4 ? RED : '#6fa3c7'));
      line(g, [w * 0.6, h * 0.8, w * 0.7, h * 0.66, w * 0.8, h * 0.7, w * 0.92, h * 0.3], RED, 3);
      line(g, [w * 0.88, h * 0.28, w * 0.92, h * 0.3, w * 0.9, h * 0.35], RED, 3);
      words(g, '前年比 120%', w * 0.78, h * 0.86, w * 0.36, h * 0.1, INK, JPH);
    },
  },
  /* A daruma with one eye filled, the wish still being worked on. */
  daruma: {
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      disc(g, w / 2, h * 0.54, w * 0.44, RED, INK, 2);
      disc(g, w / 2, h * 0.44, w * 0.24, '#fbf3e6', INK, 1.5);
      disc(g, w * 0.42, h * 0.42, w * 0.06, INK);
      disc(g, w * 0.58, h * 0.42, w * 0.06, null, INK, 1.5);
      words(g, '福', w / 2, h * 0.78, w * 0.3, h * 0.18, '#f2c52c', MINCHO);
    },
  },
  /* The president's hanging scroll: 誠心誠意 down the paper. */
  scroll: {
    h: 192,
    paint(g, w, h) {
      rect(g, 0, 0, w, h, '#8a6a46');
      rect(g, w * 0.14, h * 0.06, w * 0.72, h * 0.86, '#f6efdc');
      rect(g, 0, 0, w, h * 0.03, INK);
      rect(g, 0, h * 0.95, w, h * 0.05, INK);
      down(g, '誠心誠意', w / 2, h * 0.1, h * 0.84, w * 0.56, INK, MINCHO);
      rect(g, w * 0.62, h * 0.82, w * 0.1, w * 0.1, RED);
    },
  },
  /* A framed 和 over the sofa. */
  calligraphy: {
    paint(g, w, h) {
      rect(g, 0, 0, w, h, INK);
      rect(g, w * 0.04, h * 0.07, w * 0.92, h * 0.86, '#f6efdc');
      words(g, '和', w * 0.46, h / 2, h * 0.8, h * 0.72, INK, MINCHO);
      rect(g, w * 0.78, h * 0.66, h * 0.12, h * 0.12, RED);
    },
  },
  vendDrinks: { h: 192, paint: vending('#d8343a', ['#2f62b0', '#e8792a', '#f2c52c', '#3fb06a', '#d43c33', '#7a4aa0'], 'つめた〜い') },
  vendCoffee: { h: 192, paint: vending('#2a2a32', ['#5a3426', '#8a6a46', '#2f2a26', '#c9a76a', '#d43c33'], 'あったか〜い') },
  vendTea: { h: 192, paint: vending('#2f8a4a', ['#6fa35a', '#3f7a3a', '#c9d27a', '#2f62b0'], 'お茶') },
  /* The break room's TV: the night game, the field and the score. */
  tvShow: {
    h: 96,
    paint(g, w, h) {
      rect(g, 0, 0, w, h, INK);
      rect(g, w * 0.03, h * 0.05, w * 0.94, h * 0.9, '#3f9a4f');
      g.fillStyle = '#c9a06a';
      g.beginPath();
      g.moveTo(w * 0.5, h * 0.92);
      g.lineTo(w * 0.2, h * 0.55);
      g.lineTo(w * 0.5, h * 0.3);
      g.lineTo(w * 0.8, h * 0.55);
      g.fill();
      for (const [x, y] of [[0.5, 0.88], [0.22, 0.56], [0.5, 0.33], [0.78, 0.56], [0.5, 0.6]]) {
        disc(g, w * x, h * y, h * 0.03, CREAM);
      }
      rect(g, w * 0.05, h * 0.08, w * 0.32, h * 0.18, 'rgba(20,20,30,0.85)');
      words(g, '9回裏 3-2', w * 0.21, h * 0.17, w * 0.3, h * 0.12, CREAM, JPH);
    },
  },
  /* The company trip's poster: 社員旅行, the sea and a palm. */
  posterTrip: {
    h: 128,
    paint(g, w, h) {
      panel(g, w, h, '#7fd0e8', INK, 2, 3);
      rect(g, 3, h * 0.48, w - 6, h * 0.2, '#2f8ac0');
      rect(g, 3, h * 0.66, w - 6, h * 0.12, '#f6e2a8');
      disc(g, w * 0.76, h * 0.2, w * 0.1, '#ffd34a');
      line(g, [w * 0.24, h * 0.7, w * 0.3, h * 0.3], '#6b4a2a', 4);
      for (const a of [-1.2, -0.6, 0, 0.6, 1.2]) {
        line(g, [w * 0.3, h * 0.3, w * 0.3 + Math.sin(a) * w * 0.16, h * 0.3 + Math.cos(a) * h * 0.06], '#3a8a4a', 4);
      }
      lettered(g, '社員旅行', w / 2, h * 0.84, w * 0.84, h * 0.12, CREAM, BLUE);
      words(g, '沖縄 2泊3日', w / 2, h * 0.94, w * 0.84, h * 0.06, INK, JPB);
    },
  },
  tank: { paint: fascia('#e6ecf0', BLUE, '受水槽') },
  /* An outdoor unit's fan grille. */
  fan: {
    paint(g, w, h) {
      rect(g, 0, 0, w, h, '#e7e4dc');
      disc(g, w / 2, h / 2, w * 0.44, '#4c4f5c', INK, 2);
      for (let r = w * 0.1; r < w * 0.44; r += w * 0.06) {
        disc(g, w / 2, h / 2, r, null, '#9aa0a8', 1.2);
      }
      line(g, [w * 0.06, h / 2, w * 0.94, h / 2], '#9aa0a8', 1.5);
      line(g, [w / 2, h * 0.06, w / 2, h * 0.94], '#9aa0a8', 1.5);
      disc(g, w / 2, h / 2, w * 0.06, '#9aa0a8', INK, 1.5);
    },
  },
  /* The company's name over the street, the star its mark. */
  roofSign: {
    h: 128,
    paint(g, w, h) {
      panel(g, w, h, '#fbf8f0', INK, 2, 6);
      rect(g, 6, h * 0.82, w - 12, h * 0.12, BLUE);
      star(g, h * 0.5, h * 0.42, h * 0.3, '#f2c52c', INK);
      lettered(g, '星野商事株式会社', w * 0.5 + h * 0.2, h * 0.42, w - h * 1.5, h * 0.62, BLUE, INK);
      words(g, 'HOSHINO SHOJI  CO., LTD.   TEL 03-0000-1234', w / 2, h * 0.885, w * 0.8, h * 0.09, CREAM, BOLD);
    },
  },
  /* The road's 止まれ, painted to be read by a driver coming up to it. */
  tomare: {
    h: 192,
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(Math.PI);
      down(g, '止まれ', 0, -h * 0.48, h * 0.48, w * 0.95, '#f1ede2', JPH);
      g.restore();
    },
  },
  /* A manhole cover's pattern, every city's own; this one a town's
   * cherry blossoms in a ring. */
  manhole: {
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      disc(g, w / 2, h / 2, w * 0.48, '#55565e', INK, 2);
      disc(g, w / 2, h / 2, w * 0.4, null, '#7a7c86', 3);
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        disc(g, w / 2 + Math.sin(a) * w * 0.2, h / 2 - Math.cos(a) * h * 0.2, w * 0.1, '#6c6e78', '#888a94', 1.5);
      }
      disc(g, w / 2, h / 2, w * 0.08, '#888a94');
    },
  },
  poleTag: {
    h: 96,
    paint(g, w, h) {
      rect(g, 0, 0, w, h, '#fbfaf2', INK, 2);
      down(g, '本町幹', w / 2, h * 0.04, h * 0.5, w * 0.7, INK, JPB);
      down(g, '12', w / 2, h * 0.52, h * 0.96, w * 0.7, RED, HEAVY);
    },
  },
  /* The curve mirror at the corner: the street in it, round. */
  mirror: {
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      disc(g, w / 2, h / 2, w * 0.48, '#e9762a', INK, 2);
      disc(g, w / 2, h / 2, w * 0.38, '#cfe3ee', INK, 1.5);
      rect(g, w * 0.3, h * 0.55, w * 0.4, h * 0.2, '#6a6c7c');
      disc(g, w * 0.4, h * 0.38, w * 0.12, 'rgba(255,255,255,0.8)');
    },
  },
  /* A kei truck's yellow plate. */
  plate: {
    paint(g, w, h) {
      panel(g, w, h, '#f2d23a', INK, 4, 2);
      words(g, '本町 480', w * 0.5, h * 0.26, w * 0.7, h * 0.26, GREEN, JPB);
      words(g, 'ひ 12-34', w * 0.5, h * 0.68, w * 0.86, h * 0.48, GREEN, HEAVY);
    },
  },
  wheel: {
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      disc(g, w / 2, h / 2, w * 0.48, '#25262d');
      disc(g, w / 2, h / 2, w * 0.26, '#c9ccd0', INK, 2);
      disc(g, w / 2, h / 2, w * 0.07, INK);
    },
  },
  buildingName: { paint: fascia('#5a4a3a', '#f2e2b0', '星野ビル', 'HOSHINO BLDG.') },
  address: {
    paint(g, w, h) {
      panel(g, w, h, BLUE, CREAM, 3, 2);
      words(g, '本町3-12', w / 2, h / 2 + 1, w * 0.86, h * 0.7, CREAM, JPB);
    },
  },
  ramenSign: { paint: fascia('#d43c33', '#fff3c8', 'らーめん 一番星', '創業昭和四十八年') },
  /* A red paper lantern, ラーメン down it. */
  chochin: {
    h: 96,
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      rect(g, w * 0.3, 0, w * 0.4, h * 0.08, INK);
      rect(g, w * 0.3, h * 0.92, w * 0.4, h * 0.08, INK);
      g.fillStyle = '#ff5a3a';
      g.beginPath();
      g.ellipse(w / 2, h / 2, w * 0.46, h * 0.44, 0, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = INK;
      g.stroke();
      for (let y = h * 0.16; y < h * 0.9; y += h * 0.1) {
        line(g, [w * 0.12, y, w * 0.88, y], 'rgba(30,20,30,0.25)', 1);
      }
      down(g, 'らーめん', w / 2, h * 0.14, h * 0.86, w * 0.42, INK, JPH);
    },
  },
  corpo: { paint: fascia('#e6dcc4', '#5a4a3a', 'コーポ ひばり') },
  /* The corner shop: not anybody's chain, a family mart of its own. */
  mart: {
    paint(g, w, h) {
      rect(g, 0, 0, w, h, '#fbfaf2', INK, 3);
      rect(g, 0, h * 0.06, w, h * 0.16, '#3fb06a');
      rect(g, 0, h * 0.78, w, h * 0.16, '#e8792a');
      lettered(g, 'ひばりマート  24時間', w / 2, h / 2, w * 0.9, h * 0.5, '#2f62b0', CREAM);
    },
  },
  /* The tenants' sign down a mixed block: a bar, a mahjong room, a
   * dentist, an English school, one floor each. */
  tenants: {
    h: 320,
    paint(g, w, h) {
      const t = [['スナック夢', '#7a4aa0'], ['麻雀', GREEN], ['歯科', BLUE], ['英会話', '#e8792a'], ['居酒屋', RED]];
      const u = h / t.length;
      t.forEach(([s, c], i) => {
        rect(g, 0, i * u, w, u, c, INK, 2);
        rect(g, 3, i * u + 3, w - 6, u - 6, null, CREAM, 1);
        down(g, s, w / 2, i * u + u * 0.08, (i + 1) * u - u * 0.08, w * 0.7, CREAM, JPH);
      });
    },
  },
  fudosan: { paint: fascia('#2f62b0', CREAM, 'ひばり不動産', '賃貸・売買') },
  /* The estate agent's window: rooms to let, a sheet each. */
  listings: {
    h: 96,
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      const r = hand(9);
      for (let i = 0; i < 8; i += 1) {
        const x = (i % 4) * (w / 4) + 4;
        const y = Math.floor(i / 4) * (h / 2) + 4;
        const cw = w / 4 - 8;
        const ch = h / 2 - 8;
        rect(g, x, y, cw, ch, '#fbfaf4', INK, 1.5);
        rect(g, x + 4, y + 4, cw - 8, ch * 0.18, i % 3 ? BLUE : RED);
        words(g, `${Math.floor(4 + r() * 8)}.${Math.floor(r() * 9)}万円`, x + cw / 2, y + ch * 0.13, cw * 0.86, ch * 0.13, CREAM, JPH);
        words(g, ['1K', '1LDK', '2DK', '1R'][i % 4], x + cw / 2, y + ch * 0.42, cw * 0.6, ch * 0.2, INK, HEAVY);
        rect(g, x + cw * 0.15, y + ch * 0.58, cw * 0.7, ch * 0.32, null, INK, 1);
        line(g, [x + cw * 0.5, y + ch * 0.58, x + cw * 0.5, y + ch * 0.9], INK, 1);
      }
    },
  },
  laundry: { paint: fascia('#2f9ad0', CREAM, 'コインランドリー', '24H') },
};

/* ---- the sign painters ---- */

function floorNo(text) {
  return (g, w, h) => {
    panel(g, w, h, '#2e4382', CREAM, 4, 3);
    lettered(g, text, w / 2, h * 0.46, w * 0.8, h * 0.6, CREAM, INK, HEAVY);
    words(g, text === 'R' ? '屋上' : '階', w / 2, h * 0.84, w * 0.6, h * 0.18, CREAM, JPB);
  };
}

function liftFloor(n) {
  return (g, w, h) => {
    rect(g, 0, 0, w, h, '#25262d');
    ['1', '2', '3', 'R'].forEach((t, i) => {
      words(g, t, w * (0.15 + i * 0.23), h / 2 + 1, w * 0.2, h * 0.7, i + 1 === n ? '#ffb24a' : '#4c4f5c', HEAVY);
    });
  };
}

function rackNo(text) {
  return (g, w, h) => {
    panel(g, w, h, YELLOW, INK, 4, 3);
    lettered(g, text, w / 2, h / 2 + 1, w * 0.84, h * 0.6, INK, CREAM, HEAVY);
  };
}

function star(g, x, y, r, fill, edge = null) {
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (edge) {
    g.lineWidth = 2;
    g.strokeStyle = edge;
    g.stroke();
  }
}

/* A paper rose: the ring of petals stuck on a leader's bar. */
function rose(g, x, y, r) {
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    disc(g, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, '#ff5a7a', INK, 1);
  }
  disc(g, x, y, r * 0.4, '#ffd34a', INK, 1);
}

function scribbles(seed, said) {
  return (g, w, h) => {
    panel(g, w, h, '#fdfdf8', '#8a8f99', 3, 6);
    const r = hand(seed);
    const pens = [BLUE, RED, INK, GREEN];
    said.forEach((t, i) => {
      const x = w * (0.18 + (i % 2) * 0.46 + r() * 0.08);
      const y = h * (0.24 + Math.floor(i / 2) * 0.4 + r() * 0.06);
      words(g, t, x, y, w * 0.3, h * 0.16, pens[i % pens.length], JPH);
      if (r() < 0.6) {
        g.beginPath();
        g.ellipse(x, y, w * 0.12, h * 0.12, 0, 0, Math.PI * 2);
        g.lineWidth = 2;
        g.strokeStyle = pens[(i + 1) % pens.length];
        g.stroke();
      }
    });
    for (let k = 0; k < 3; k += 1) {
      const x0 = w * (0.1 + r() * 0.7);
      const y0 = h * (0.15 + r() * 0.7);
      line(g, [x0, y0, x0 + w * 0.1, y0 + h * (r() - 0.5) * 0.3, x0 + w * 0.2, y0], pens[k % pens.length], 2);
      line(g, [x0 + w * 0.17, y0 - 5, x0 + w * 0.2, y0, x0 + w * 0.17, y0 + 5], pens[k % pens.length], 2);
    }
    rect(g, w * 0.06, h * 0.86, w * 0.88, 3, '#c9ccd0');
  };
}

function memo(colours) {
  return (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = hand(colours.length * 31);
    for (let i = 0; i < 3; i += 1) {
      const x = w * (0.04 + r() * 0.5);
      const y = h * (0.04 + r() * 0.5);
      const s = w * 0.42;
      rect(g, x, y, s, s, colours[i % colours.length], INK, 1.5);
      for (let k = 1; k < 4; k += 1) {
        line(g, [x + s * 0.12, y + s * 0.22 * k, x + s * (0.5 + r() * 0.35), y + s * 0.22 * k], '#3c66ad', 1.5);
      }
    }
  };
}

export const SIGN_KEYS = Object.keys(SIGNS);

/* ---- the atlas ---- */

/*
 * Where each sign's picture lies on the atlas: one cell a key, as wide as
 * the sign is for its height, rows packed left to right, tallest first.
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
 * The signs as quads on their cells, one mesh for those the light falls
 * on and one for those that glow, `lift` out from the face each is hung
 * on. The plan's sizes are real metres; the world's are S times them.
 */
export function signMeshes(THREE, signs, atlas, lit, glow) {
  const build = (list, material, name) => {
    const pos = [];
    const nor = [];
    const uv = [];
    const idx = [];
    const n = new THREE.Vector3();
    const up = new THREE.Vector3();
    const right = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (const s of list) {
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
        c.set(x, y, z)
          .addScaledVector(n, s.lift * S)
          .addScaledVector(right, (sx * s.w * S) / 2)
          .addScaledVector(up, (sy * s.ht * S) / 2);
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
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  };
  return [
    build(signs.filter((s) => !s.glow), lit, 'office signs'),
    build(signs.filter((s) => s.glow), glow, 'office lights'),
  ];
}
