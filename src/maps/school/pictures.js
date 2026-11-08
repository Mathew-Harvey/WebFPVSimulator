/*
 * pictures.js: everything drawn by hand on Midori Gakuen's walls, painted
 * once into one picture and hung as one mesh, the way Sunnyfield's and
 * Kirigaoka's signs are (../sunny/signs.js, ../sana/signs.js): each class's
 * blackboard with its own lesson in chalk, the music room's staves, the
 * lunch room's menu, the plates over the doors, the posters down the
 * hallways, the papers on the classrooms' notice boards and the art club's
 * canvases. The owner's review of 8 November 2026 asked for the school to
 * be "hand drawn manga" and not polygons, and a bare wall is the one thing
 * a drawn school never has.
 *
 * WHAT IT COSTS. One draw call, and it took the place of one: the boards
 * were a colour of their own (scBoard in src/props/school.js), and with the
 * boards drawn here that colour is gone, so the school draws as many calls
 * as it did. A few hundred triangles. One picture of 2048 by 1024 painted
 * once while the map loads (about 4 ms, 28 the first time, headless),
 * nothing a frame.
 *
 * THE HAND. Titles are lettered in the simulator's own hand
 * (src/ui/lettering.js drawWord), so a poster on the wall is lettered as
 * the menus and the trick calls are; ink lines wobble a little, seeded by
 * the picture's key, so a picture is drawn the same on every load and no
 * two are drawn quite alike. All the words are English, in capitals a
 * child of eight reads; nothing needs a Japanese font, which a machine
 * without one draws as boxes.
 *
 * The plan (./school.js) asks for a picture with H.picture(key, ...); this
 * paints each key once at the shape of its first use. Render only: nothing
 * here is solid.
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

import { worldAt, S } from './school.js';
import { drawWord, wordWidth } from '../../ui/lettering.js';

const INK = '#22202a';
const CHALK = '#f4f1e6';
const BOARD = '#2f5243';
const PAPER = '#f7f0dc';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const ATLAS_W = 2048;
const PAD = 4;

/* ------------------------------------------------------------------ */
/* The pen                                                             */
/* ------------------------------------------------------------------ */

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  }
  return h | 0;
}

/* A line through the points, drawn by a hand: each leg cut in short steps
 * that wander a little off the true line. */
function hand(g, pts, r, amp = 1.2, close = false) {
  const p = close ? [...pts, pts[0]] : pts;
  g.beginPath();
  g.moveTo(p[0][0] + (r() - 0.5) * amp, p[0][1] + (r() - 0.5) * amp);
  for (let k = 1; k < p.length; k += 1) {
    const [ax, ay] = p[k - 1];
    const [bx, by] = p[k];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 14));
    for (let s = 1; s <= n; s += 1) {
      const t = s / n;
      g.lineTo(ax + (bx - ax) * t + (r() - 0.5) * amp, ay + (by - ay) * t + (r() - 0.5) * amp);
    }
  }
  if (close) {
    g.closePath();
  }
}

function inkRect(g, x, y, w, h, r, lw = 3, fill = null) {
  hand(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], r, 1.4, true);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  g.lineWidth = lw;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.stroke();
}

/* A circle by hand. */
function ring(g, cx, cy, rad, r, lw, stroke = INK, fill = null) {
  const pts = [];
  const n = Math.max(10, Math.round(rad * 0.9));
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  hand(g, pts, r, Math.min(1.4, rad * 0.08), true);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (lw > 0) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

/* Screen tone: a grid of dots, the manga's grey. */
function tone(g, x, y, w, h, step, rad, colour) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = colour;
  for (let j = 0, yy = y; yy < y + h + step; j += 1, yy += step) {
    for (let xx = x + (j % 2 ? step / 2 : 0); xx < x + w + step; xx += step) {
      g.beginPath();
      g.arc(xx, yy, rad, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/* Lettered words in the simulator's hand, centred on cx, fitted to maxW. */
function letter(g, text, cx, y, px, fill, maxW) {
  let size = px;
  let w = wordWidth(g, text, size);
  if (w > maxW) {
    size *= maxW / w;
    w = wordWidth(g, text, size);
  }
  drawWord(g, text, cx - w / 2, y, size, fill);
}

/* Plain words, centred, fitted. */
function words(g, text, cx, cy, px, colour, maxW, weight = 800) {
  g.font = `${weight} ${px}px ${FONT}`;
  const w = g.measureText(text).width;
  const k = w > maxW ? maxW / w : 1;
  g.save();
  g.translate(cx, cy);
  g.scale(k, 1);
  g.fillStyle = colour;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  g.restore();
}

/* A sheet of paper pinned up: the paper, its ink edge, a corner's shadow
 * and a pin. */
function paper(g, w, h, r, fill = PAPER, pin = '#d2483e') {
  g.fillStyle = '#00000022';
  g.fillRect(6, 8, w - 6, h - 8);
  inkRect(g, 2, 2, w - 9, h - 10, r, 3, fill);
  ring(g, w / 2, 12, 5, r, 2, INK, pin);
}

/* ------------------------------------------------------------------ */
/* Chalk                                                               */
/* ------------------------------------------------------------------ */

function board(g, w, h, r) {
  g.fillStyle = BOARD;
  g.fillRect(0, 0, w, h);
  /* The eraser's arcs, a lesson wiped and not quite gone. */
  g.save();
  g.lineCap = 'round';
  for (let k = 0; k < 14; k += 1) {
    g.strokeStyle = `rgba(244,241,230,${0.03 + r() * 0.05})`;
    g.lineWidth = 18 + r() * 26;
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    g.arc(x, y + 40, 40 + r() * 60, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  }
  g.restore();
  /* Dust along the bottom, over the tray. */
  g.fillStyle = 'rgba(244,241,230,0.10)';
  g.fillRect(0, h - 10, w, 10);
}

/* Words in chalk: drawn three times, a hair apart, thin, so they break up
 * the way chalk does. */
function chalk(g, text, x, y, px, r, align = 'left', colour = CHALK, weight = 700) {
  g.save();
  g.font = `${weight} ${px}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  for (let k = 0; k < 3; k += 1) {
    g.globalAlpha = 0.45 + r() * 0.25;
    g.fillStyle = colour;
    g.fillText(text, x + (r() - 0.5) * 1.6, y + (r() - 0.5) * 1.6);
  }
  g.restore();
}

function chalkLine(g, pts, r, lw = 3, colour = CHALK, close = false) {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let k = 0; k < 2; k += 1) {
    g.globalAlpha = 0.55 + r() * 0.25;
    hand(g, pts, r, 1.6, close);
    g.lineWidth = lw;
    g.strokeStyle = colour;
    g.stroke();
  }
  g.restore();
}

function chalkRing(g, cx, cy, rad, r, lw = 3, colour = CHALK) {
  const pts = [];
  const n = Math.max(10, Math.round(rad * 0.7));
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  chalkLine(g, pts, r, lw, colour, true);
}

/* A whoop from above: four ducts and a body. In chalk, or in ink. */
function whoop(g, cx, cy, s, r, inked = false, fill = '#f4f1ea') {
  const d = s * 0.32;
  const draw = inked
    ? (x, y, rad) => ring(g, x, y, rad, r, Math.max(2, s * 0.05), INK, fill)
    : (x, y, rad) => chalkRing(g, x, y, rad, r, Math.max(2, s * 0.04));
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    draw(cx + sx * d, cy + sy * d, s * 0.24);
  }
  if (inked) {
    inkRect(g, cx - s * 0.12, cy - s * 0.18, s * 0.24, s * 0.36, r, Math.max(2, s * 0.05), '#2c2e36');
  } else {
    chalkLine(g, [[cx - s * 0.1, cy - s * 0.16], [cx + s * 0.1, cy - s * 0.16], [cx + s * 0.1, cy + s * 0.16], [cx - s * 0.1, cy + s * 0.16]], r, Math.max(2, s * 0.04), CHALK, true);
  }
}

/* The date and the day's two on duty, down a board's right edge, as every
 * school board keeps them. */
function duty(g, w, h, r, names) {
  const x = w - 70;
  chalkLine(g, [[x - 26, 14], [x - 26, h - 18]], r, 2);
  chalk(g, 'NOV', x + 8, 52, 26, r, 'center');
  chalk(g, '8', x + 8, 96, 44, r, 'center');
  chalk(g, 'DUTY', x + 8, 140, 18, r, 'center');
  names.forEach((n, i) => chalk(g, n, x + 8, 166 + i * 24, 20, r, 'center'));
}

/* ------------------------------------------------------------------ */
/* The pictures                                                        */
/* ------------------------------------------------------------------ */

/* Each class's board, its own lesson. */
const BOARDS = {
  /* 1-A: sums, and a whoop drawn in the corner by somebody who should
   * have been doing them. */
  '1a': (g, w, h, r) => {
    chalk(g, '12 + 7 = 19', 40, 66, 40, r);
    chalk(g, '8 x 3 = 24', 40, 120, 40, r);
    chalk(g, '15 - 9 = ?', 40, 174, 40, r);
    chalkRing(g, 238, 160, 26, r, 3, '#f2c440');
    whoop(g, w * 0.55, h * 0.45, 104, r);
    for (const k of [0, 1, 2]) {
      chalkLine(g, [[w * 0.55 - 110 - k * 12, h * 0.33 + k * 22], [w * 0.55 - 70 - k * 12, h * 0.33 + k * 22]], r, 3);
    }
    chalk(g, 'ZOOM!', w * 0.55 + 70, h * 0.25, 30, r, 'left', '#f2a6bd', 800);
    duty(g, w, h, r, ['KIWI', 'SORA']);
  },
  /* 1-B: spelling, and a quiz on Friday, boxed so nobody can say they
   * were not told. */
  '1b': (g, w, h, r) => {
    chalk(g, 'SPELLING', 40, 58, 34, r, 'left', '#f2c440', 800);
    chalkLine(g, [[40, 70], [220, 70]], r, 3, '#f2c440');
    ['WING', 'PROP', 'FLY', 'HOVER'].forEach((t, i) => chalk(g, `${i + 1}. ${t}`, 50, 112 + i * 34, 30, r));
    chalkLine(g, [[w * 0.42, 40], [w * 0.74, 40], [w * 0.74, 120], [w * 0.42, 120]], r, 3, '#f2a6bd', true);
    chalk(g, 'QUIZ', w * 0.58, 78, 36, r, 'center', '#f2a6bd', 900);
    chalk(g, 'FRIDAY!', w * 0.58, 110, 28, r, 'center', '#f2a6bd', 900);
    /* A cat, because there is always a cat. */
    const cx = w * 0.56;
    const cy = 176;
    chalkRing(g, cx, cy, 28, r);
    chalkLine(g, [[cx - 24, cy - 14], [cx - 18, cy - 40], [cx - 6, cy - 26]], r);
    chalkLine(g, [[cx + 24, cy - 14], [cx + 18, cy - 40], [cx + 6, cy - 26]], r);
    chalk(g, '. .', cx, cy, 26, r, 'center');
    duty(g, w, h, r, ['MOCHI', 'PIP']);
  },
  /* 2-A: what a plant needs. */
  '2a': (g, w, h, r) => {
    const x = w * 0.3;
    chalkRing(g, 90, 60, 26, r, 3, '#f2c440');
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      chalkLine(g, [[90 + Math.cos(a) * 34, 60 + Math.sin(a) * 34], [90 + Math.cos(a) * 46, 60 + Math.sin(a) * 46]], r, 3, '#f2c440');
    }
    chalkLine(g, [[x, 196], [x, 96]], r, 4, '#9fe0a4');
    chalkLine(g, [[x, 140], [x - 40, 110], [x - 6, 120], [x, 140]], r, 3, '#9fe0a4', true);
    chalkLine(g, [[x, 118], [x + 44, 92], [x + 8, 100], [x, 118]], r, 3, '#9fe0a4', true);
    chalkLine(g, [[x - 60, 200], [x + 60, 200]], r, 3);
    chalkLine(g, [[x, 200], [x - 20, 226], [x - 34, 230]], r, 2);
    chalkLine(g, [[x, 200], [x + 16, 228]], r, 2);
    chalk(g, 'LEAF', x + 70, 98, 24, r);
    chalk(g, 'STEM', x + 30, 160, 24, r);
    chalk(g, 'ROOT', x + 40, 230, 22, r);
    chalk(g, 'PLANTS NEED', w * 0.56, 80, 30, r, 'left', '#f2c440', 800);
    chalk(g, 'LIGHT + WATER', w * 0.56, 120, 30, r, 'left', '#8fe0ff', 800);
    duty(g, w, h, r, ['TOFU', 'BEANS']);
  },
  /* 2-B: the field trip, and what not to forget. */
  '2b': (g, w, h, r) => {
    chalk(g, 'FIELD TRIP!', 40, 62, 40, r, 'left', '#f2c440', 900);
    ['1. LUNCH', '2. HAT', '3. WATER', '4. SMILE'].forEach((t, i) => chalk(g, t, 50, 108 + i * 32, 28, r));
    /* The bus. */
    const bx = w * 0.46;
    chalkLine(g, [[bx, 120], [bx + 190, 120], [bx + 200, 150], [bx + 200, 190], [bx, 190]], r, 3, CHALK, true);
    for (let k = 0; k < 4; k += 1) {
      chalkLine(g, [[bx + 14 + k * 44, 132], [bx + 46 + k * 44, 132], [bx + 46 + k * 44, 156], [bx + 14 + k * 44, 156]], r, 2, '#8fe0ff', true);
    }
    chalkRing(g, bx + 40, 194, 14, r);
    chalkRing(g, bx + 160, 194, 14, r);
    chalk(g, 'BEEP', bx + 200, 110, 22, r, 'left', '#f2a6bd', 800);
    duty(g, w, h, r, ['YUZU', 'TAKO']);
  },
  /* The music room: five lines, a clef and a tune. */
  music: (g, w, h, r) => {
    const y0 = 70;
    for (let k = 0; k < 5; k += 1) {
      chalkLine(g, [[30, y0 + k * 22], [w - 30, y0 + k * 22]], r, 2);
    }
    /* The clef: a curl and a line through it. */
    chalkLine(g, [[70, y0 + 120], [76, y0 - 20], [92, y0 - 30], [96, y0 - 6], [62, y0 + 44], [66, y0 + 80], [96, y0 + 82], [100, y0 + 52], [74, y0 + 48]], r, 4);
    const notes = [2, 3, 4, 3, 2, 1, 0, 1, 2, 4, 3, 2];
    notes.forEach((n, i) => {
      const x = 150 + i * ((w - 220) / notes.length);
      const y = y0 + 88 - n * 11;
      g.save();
      g.globalAlpha = 0.8;
      g.fillStyle = CHALK;
      g.beginPath();
      g.ellipse(x, y, 10, 7, -0.4, 0, Math.PI * 2);
      g.fill();
      g.restore();
      chalkLine(g, [[x + 9, y], [x + 9, y - 46]], r, 2);
    });
    chalk(g, 'DO  RE  MI', w / 2, h - 30, 30, r, 'center', '#f2c440', 800);
  },
  /* The lunch room's menu. */
  lunch: (g, w, h, r) => {
    chalk(g, "TODAY'S LUNCH", w / 2, 52, 36, r, 'center', '#f2c440', 900);
    chalkLine(g, [[40, 66], [w - 40, 66]], r, 3, '#f2c440');
    ['CURRY RICE', 'SALAD', 'MILK', 'JELLY'].forEach((t, i) => chalk(g, t, 50, 108 + i * 32, 28, r));
    /* The bowl, steaming. */
    const cx = w * 0.72;
    chalkLine(g, [[cx - 60, 150], [cx + 60, 150], [cx + 40, 196], [cx - 40, 196]], r, 3, CHALK, true);
    for (const k of [-24, 0, 24]) {
      chalkLine(g, [[cx + k, 136], [cx + k + 8, 118], [cx + k - 4, 104], [cx + k + 4, 88]], r, 2);
    }
  },
};

/* The plates over the doors: what the room is, in the school's hand. */
const PLATES = {
  '1a': ['1-A', '#52c86a'], lab: ['SCIENCE', '#4a7fc8'], '1b': ['1-B', '#52c86a'],
  lunch: ['LUNCH', '#f2c440'], staff: ['STAFF', '#8a93a0'], nurse: ['NURSE', '#d2483e'], store: ['SPORTS', '#f2c440'],
  '2a': ['2-A', '#f2a6bd'], library: ['LIBRARY', '#4a7fc8'], '2b': ['2-B', '#f2a6bd'], music: ['MUSIC', '#d2483e'],
  art: ['ART', '#f2c440'], computer: ['COMPUTERS', '#8fe0ff'], club: ['CLUB', '#52c86a'],
};

function plate(g, w, h, r, [label, stripe]) {
  g.fillStyle = '#fbf7ee';
  g.fillRect(0, 0, w, h);
  g.fillStyle = stripe;
  g.fillRect(0, 0, 18, h);
  inkRect(g, 2, 2, w - 4, h - 4, r, 4);
  words(g, label, (w + 18) / 2, h / 2 + 2, h * 0.5, INK, w - 34, 900);
}

/* The posters down the hallways. */
const POSTER_PAINT = {
  /* No flying in the hall, with a whoop in the red ring: a school where
   * the game is played is exactly the school that would need one. */
  'poster-flying': (g, w, h, r) => {
    paper(g, w, h, r, '#ffe27a');
    letter(g, 'NO FLYING', w / 2, 70, 40, '#d2483e', w - 30);
    letter(g, 'IN THE HALL!', w / 2, 112, 30, '#f3ead4', w - 30);
    whoop(g, w / 2, h * 0.62, 100, r, true);
    ring(g, w / 2, h * 0.62, 76, r, 12, '#d2483e');
    g.save();
    g.strokeStyle = '#d2483e';
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(w / 2 - 52, h * 0.62 - 52);
    g.lineTo(w / 2 + 52, h * 0.62 + 52);
    g.stroke();
    g.restore();
  },
  /* The school festival: fireworks over a stall. */
  'poster-festival': (g, w, h, r) => {
    paper(g, w, h, r, '#2a3a6e', '#f2c440');
    tone(g, 8, 8, w - 22, h * 0.55, 9, 1.4, '#ffffff22');
    for (const [x, y, s, c] of [[0.3, 0.32, 40, '#f2a6bd'], [0.7, 0.24, 52, '#f2c440'], [0.62, 0.48, 30, '#8fe0ff']]) {
      for (let k = 0; k < 12; k += 1) {
        const a = (k / 12) * Math.PI * 2;
        g.strokeStyle = c;
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(w * x + Math.cos(a) * s * 0.35, h * y + Math.sin(a) * s * 0.35);
        g.lineTo(w * x + Math.cos(a) * s, h * y + Math.sin(a) * s);
        g.stroke();
      }
    }
    letter(g, 'SCHOOL', w / 2, h * 0.74, 40, '#f2c440', w - 30);
    letter(g, 'FESTIVAL', w / 2, h * 0.86, 40, '#f2a6bd', w - 30);
    words(g, 'SAT  10 TO 3', w / 2, h * 0.94, 16, '#f3ead4', w - 40);
  },
  /* The drone club, recruiting. */
  'poster-club': (g, w, h, r) => {
    paper(g, w, h, r, '#f2a6bd', '#4a7fc8');
    for (let k = 0; k < 9; k += 1) {
      const y = h * 0.34 + k * 10;
      hand(g, [[16, y], [w * 0.36, y]], r, 1);
      g.lineWidth = 2;
      g.strokeStyle = '#ffffffaa';
      g.stroke();
    }
    whoop(g, w * 0.62, h * 0.42, 110, r, true, '#f4f1ea');
    letter(g, 'DRONE CLUB', w / 2, h * 0.76, 34, '#f3ead4', w - 24);
    letter(g, 'JOIN US!', w / 2, h * 0.9, 38, '#ffd45c', w - 24);
  },
  /* Wash your hands, and the little green germ who hopes you will not. */
  'poster-hands': (g, w, h, r) => {
    paper(g, w, h, r, '#dff4ff', '#52c86a');
    letter(g, 'WASH', w / 2, 66, 46, '#4a7fc8', w - 30);
    letter(g, 'YOUR HANDS!', w / 2, 106, 30, '#f3ead4', w - 30);
    const cx = w / 2;
    const cy = h * 0.6;
    const pts = [];
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * Math.PI * 2;
      const rad = 48 + (k % 2 ? 10 : 0);
      pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
    hand(g, pts, r, 2, true);
    g.fillStyle = '#5fe06e';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.stroke();
    ring(g, cx - 16, cy - 8, 10, r, 3, INK, '#ffffff');
    ring(g, cx + 16, cy - 8, 10, r, 3, INK, '#ffffff');
    g.fillStyle = INK;
    g.beginPath();
    g.arc(cx - 14, cy - 6, 4, 0, Math.PI * 2);
    g.arc(cx + 18, cy - 6, 4, 0, Math.PI * 2);
    g.fill();
    hand(g, [[cx - 14, cy + 18], [cx, cy + 12], [cx + 14, cy + 18]], r, 1);
    g.stroke();
    for (const [x, y, s] of [[0.18, 0.84, 14], [0.3, 0.76, 9], [0.78, 0.82, 16], [0.84, 0.7, 8]]) {
      ring(g, w * x, h * y, s, r, 2, '#4a7fc8', '#ffffffcc');
    }
  },
  /* Lost: a cat called Mochi, with tabs to tear off. */
  'poster-cat': (g, w, h, r) => {
    paper(g, w, h, r, PAPER, '#4a7fc8');
    letter(g, 'LOST CAT', w / 2, 66, 38, '#d2483e', w - 30);
    const cx = w / 2;
    const cy = h * 0.46;
    ring(g, cx, cy, 52, r, 4, INK, '#f6f2ea');
    for (const s of [-1, 1]) {
      hand(g, [[cx + s * 46, cy - 22], [cx + s * 40, cy - 70], [cx + s * 14, cy - 48]], r, 1.2);
      g.fillStyle = '#f6f2ea';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = INK;
      g.stroke();
    }
    tone(g, cx + 6, cy - 50, 44, 40, 6, 1.4, '#22202a66');
    g.fillStyle = INK;
    g.beginPath();
    g.arc(cx - 18, cy - 4, 5, 0, Math.PI * 2);
    g.arc(cx + 18, cy - 4, 5, 0, Math.PI * 2);
    g.fill();
    hand(g, [[cx - 8, cy + 14], [cx, cy + 20], [cx + 8, cy + 14]], r, 0.8);
    g.lineWidth = 3;
    g.stroke();
    words(g, 'MOCHI', w / 2, h * 0.7, 26, INK, w - 40, 900);
    for (let k = 0; k < 5; k += 1) {
      const x = 14 + k * ((w - 30) / 5);
      inkRect(g, x, h * 0.78, (w - 30) / 5 - 4, h * 0.18, r, 2, '#ffffff');
      g.save();
      g.translate(x + (w - 30) / 10, h * 0.87);
      g.rotate(-Math.PI / 2);
      words(g, 'CALL 2-B', 0, 0, 12, INK, h * 0.16, 700);
      g.restore();
    }
  },
  /* Sports day: lanes and bunting. */
  'poster-sports': (g, w, h, r) => {
    paper(g, w, h, r, '#ffffff', '#d2483e');
    for (let k = 0; k < 7; k += 1) {
      const x = 12 + k * ((w - 30) / 6);
      hand(g, [[x, 26], [x + (w - 30) / 12, 52], [x + (w - 30) / 6, 26]], r, 1);
      g.fillStyle = k % 2 ? '#d2483e' : '#4a7fc8';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = INK;
      g.stroke();
    }
    g.save();
    g.beginPath();
    g.rect(10, h * 0.36, w - 24, h * 0.3);
    g.clip();
    g.fillStyle = '#d2483e';
    g.fillRect(10, h * 0.36, w - 24, h * 0.3);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    for (let k = 0; k < 5; k += 1) {
      g.beginPath();
      g.ellipse(w / 2, h * 0.68, w * 0.2 + k * 26, h * 0.12 + k * 14, 0, Math.PI, Math.PI * 2);
      g.stroke();
    }
    g.restore();
    inkRect(g, 10, h * 0.36, w - 24, h * 0.3, r, 3);
    letter(g, 'SPORTS', w / 2, h * 0.8, 42, '#d2483e', w - 30);
    letter(g, 'DAY!', w / 2, h * 0.93, 42, '#4a7fc8', w - 30);
  },
  /* Read a book: a stack of them. */
  'poster-read': (g, w, h, r) => {
    paper(g, w, h, r, '#fff3d6', '#52c86a');
    letter(g, 'READ', w / 2, 70, 50, '#52c86a', w - 30);
    letter(g, 'A BOOK!', w / 2, 112, 34, '#f3ead4', w - 30);
    const colours = ['#d2483e', '#4a7fc8', '#f2c440', '#f2a6bd', '#52c86a'];
    for (let k = 0; k < 5; k += 1) {
      const bw = w * (0.62 - (k % 2) * 0.08);
      const x = (w - bw) / 2 + (r() - 0.5) * 16;
      inkRect(g, x, h * 0.84 - k * 30, bw, 26, r, 3, colours[k]);
      hand(g, [[x + 12, h * 0.84 - k * 30 + 13], [x + bw - 12, h * 0.84 - k * 30 + 13]], r, 0.6);
      g.lineWidth = 2;
      g.strokeStyle = '#ffffffaa';
      g.stroke();
    }
  },
  /* Be kind: a heart, and petals. */
  'poster-kind': (g, w, h, r) => {
    paper(g, w, h, r, '#fde7ee', '#f2a6bd');
    const cx = w / 2;
    const cy = h * 0.46;
    hand(g, [[cx, cy + 56], [cx - 70, cy - 4], [cx - 62, cy - 50], [cx - 22, cy - 60], [cx, cy - 30], [cx + 22, cy - 60], [cx + 62, cy - 50], [cx + 70, cy - 4]], r, 2, true);
    g.fillStyle = '#d2483e';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = INK;
    g.stroke();
    for (let k = 0; k < 9; k += 1) {
      const x = 20 + r() * (w - 44);
      const y = 20 + r() * (h - 50);
      if (Math.abs(x - cx) < 80 && Math.abs(y - cy) < 70) continue;
      g.save();
      g.translate(x, y);
      g.rotate(r() * 6.28);
      g.fillStyle = '#f2a6bd';
      g.beginPath();
      g.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    letter(g, 'BE KIND', w / 2, h * 0.86, 48, '#f2a6bd', w - 30);
  },
};

/* The papers on a classroom's notice board. */
const PAPERS = {
  /* The timetable. */
  'paper-0': (g, w, h, r) => {
    paper(g, w, h, r, '#ffffff', '#4a7fc8');
    words(g, 'TIMETABLE', w / 2, 34, 18, INK, w - 30, 900);
    const x0 = 16;
    const y0 = 48;
    const cw = (w - 36) / 5;
    const ch = (h - y0 - 18) / 4;
    const tones = ['#f2a6bd', '#8fe0ff', '#f2c440', '#9fe0a4'];
    for (let j = 0; j < 4; j += 1) {
      for (let i = 0; i < 5; i += 1) {
        const c = tones[(i * 3 + j) % 4];
        inkRect(g, x0 + i * cw, y0 + j * ch, cw, ch, r, 1.5, c);
      }
    }
  },
  /* The class's goals. */
  'paper-1': (g, w, h, r) => {
    paper(g, w, h, r, '#fff6c8', '#52c86a');
    words(g, 'CLASS GOALS', w / 2, 36, 18, '#d2483e', w - 30, 900);
    ['SAY HELLO', 'TIDY UP', 'TRY HARD'].forEach((t, i) => {
      ring(g, 26, 66 + i * 30, 7, r, 2, INK, i < 2 ? '#52c86a' : null);
      words(g, t, w / 2 + 12, 66 + i * 30, 15, INK, w - 60, 800);
    });
  },
  /* A child's picture: the house and the sun. */
  'paper-2': (g, w, h, r) => {
    paper(g, w, h, r, '#ffffff', '#f2c440');
    ring(g, w * 0.78, h * 0.28, 18, r, 3, '#e08a00', '#f2c440');
    hand(g, [[w * 0.2, h * 0.84], [w * 0.2, h * 0.5], [w * 0.4, h * 0.3], [w * 0.6, h * 0.5], [w * 0.6, h * 0.84]], r, 2, true);
    g.fillStyle = '#f2a6bd';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    inkRect(g, w * 0.34, h * 0.62, w * 0.12, h * 0.22, r, 2, '#4a7fc8');
    hand(g, [[10, h * 0.86], [w - 16, h * 0.86]], r, 2);
    g.strokeStyle = '#52c86a';
    g.lineWidth = 5;
    g.stroke();
  },
  /* A child's picture of a whoop, flying, big. */
  'paper-3': (g, w, h, r) => {
    paper(g, w, h, r, '#e9f6ff', '#d2483e');
    whoop(g, w / 2, h * 0.52, Math.min(w, h) * 0.66, r, true, '#ffffff');
    words(g, 'MY WHOOP', w / 2, h - 20, 15, '#d2483e', w - 30, 900);
  },
  /* The star chart. */
  'paper-4': (g, w, h, r) => {
    paper(g, w, h, r, '#ffffff', '#f2a6bd');
    words(g, 'STARS', w / 2, 32, 18, INK, w - 30, 900);
    for (let j = 0; j < 3; j += 1) {
      hand(g, [[14, 52 + j * 30], [w - 20, 52 + j * 30]], r, 0.8);
      g.lineWidth = 1.5;
      g.strokeStyle = INK;
      g.stroke();
      const n = 2 + ((j * 7) % 4);
      for (let k = 0; k < n; k += 1) {
        star(g, 30 + k * 26, 66 + j * 30, 9, '#f2c440');
      }
    }
  },
};

function star(g, cx, cy, s, fill) {
  g.beginPath();
  for (let k = 0; k < 10; k += 1) {
    const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
    const rad = k % 2 ? s * 0.45 : s;
    if (k) g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    else g.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = INK;
  g.stroke();
}

/* The art club's canvases: in thick paint, so blobs and no ink. */
const EASELS = {
  /* Mountains at sunset. */
  'easel-0': (g, w, h, r) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#ffb07a');
    sky.addColorStop(1, '#f2a6bd');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe27a';
    g.beginPath();
    g.arc(w * 0.68, h * 0.42, 26, 0, Math.PI * 2);
    g.fill();
    for (const [c, y, a] of [['#6a5a8a', 0.55, 0.3], ['#4a3f6a', 0.68, 0.22]]) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += w / 8) {
        g.lineTo(x, h * y - Math.abs(Math.sin(x * 0.03 + a * 9)) * h * a);
      }
      g.lineTo(w, h);
      g.fill();
    }
    blobs(g, w, h, r, ['#ffffff55', '#22202a22']);
  },
  /* A cat, painted by somebody who loves it. */
  'easel-1': (g, w, h, r) => {
    g.fillStyle = '#8fe0ff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2a54a';
    g.beginPath();
    g.ellipse(w / 2, h * 0.6, w * 0.3, h * 0.28, 0, 0, Math.PI * 2);
    g.fill();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(w / 2 + s * w * 0.26, h * 0.46);
      g.lineTo(w / 2 + s * w * 0.22, h * 0.24);
      g.lineTo(w / 2 + s * w * 0.06, h * 0.36);
      g.fill();
    }
    g.fillStyle = '#22202a';
    g.beginPath();
    g.arc(w / 2 - w * 0.1, h * 0.56, 6, 0, Math.PI * 2);
    g.arc(w / 2 + w * 0.1, h * 0.56, 6, 0, Math.PI * 2);
    g.fill();
    blobs(g, w, h, r, ['#ffffff44', '#d2483e33']);
  },
  /* Fruit in a bowl. */
  'easel-2': (g, w, h, r) => {
    g.fillStyle = '#f3ead4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c9b48a';
    g.fillRect(0, h * 0.7, w, h * 0.3);
    for (const [x, y, rad, c] of [[0.38, 0.56, 26, '#d2483e'], [0.58, 0.54, 24, '#f2c440'], [0.48, 0.44, 22, '#52c86a']]) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(w * x, h * y, rad, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#4a7fc8';
    g.beginPath();
    g.ellipse(w / 2, h * 0.66, w * 0.3, h * 0.1, 0, 0, Math.PI);
    g.fill();
    blobs(g, w, h, r, ['#ffffff55', '#22202a1f']);
  },
};

/* Brush marks over a painting, so it looks painted. */
function blobs(g, w, h, r, colours) {
  for (let k = 0; k < 40; k += 1) {
    g.fillStyle = colours[k % colours.length];
    g.beginPath();
    g.ellipse(r() * w, r() * h, 4 + r() * 10, 2 + r() * 4, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.lineWidth = 6;
  g.strokeStyle = '#7a5a3a';
  g.strokeRect(0, 0, w, h);
}

/* Every key the plan may ask for, and what paints it. */
function painterOf(key) {
  if (key.startsWith('board-')) {
    const b = BOARDS[key.slice(6)];
    return b ? (g, w, h, r) => {
      board(g, w, h, r);
      b(g, w, h, r);
    } : null;
  }
  if (key.startsWith('plate-')) {
    const p = PLATES[key.slice(6)];
    return p ? (g, w, h, r) => plate(g, w, h, r, p) : null;
  }
  return POSTER_PAINT[key] || PAPERS[key] || EASELS[key] || null;
}

/* Whether a key has a painter: the plan's every picture must (scripts/school-check.js). */
export function paintsKey(key) {
  return Boolean(painterOf(key));
}

/* ------------------------------------------------------------------ */
/* The sheet and the mesh                                              */
/* ------------------------------------------------------------------ */

/* The height a key's painter draws at, in its own pixels: every painter
 * above is written for these. */
function designHeight(key) {
  if (key.startsWith('board-')) return 224;
  if (key.startsWith('plate-')) return 80;
  if (key.startsWith('poster-')) return 300;
  if (key.startsWith('easel-')) return 224;
  return 160;
}

/* The height its cell is packed at, which the painter is scaled to: chosen
 * so the whole sheet is 2048 by 1024 (8 MB, a third more with its mip
 * levels) and not 2048 by 2048, which it was at the design heights. A
 * board is still 130 pixels a metre, and is never seen closer than a
 * whoop flies to it. */
function cellHeight(key) {
  if (key.startsWith('plate-')) return 80;
  if (key.startsWith('poster-')) return 256;
  return 160;
}

/* The cells: each key's first use sets its shape, in rows of one height
 * each, tallest first. Returns { cells, w, h }. */
function pack(uses) {
  const shape = new Map();
  for (const u of uses) {
    if (!shape.has(u.key)) {
      shape.set(u.key, u.w / u.ht);
    }
  }
  const items = [...shape.entries()].map(([key, a]) => {
    const h = cellHeight(key);
    return { key, w: Math.min(ATLAS_W, Math.max(16, Math.round(h * a))), h };
  });
  items.sort((p, q) => q.h - p.h || q.w - p.w || (p.key < q.key ? -1 : 1));
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
  let h = 64;
  while (h < y + row) {
    h *= 2;
  }
  return { cells, w: ATLAS_W, h };
}

/* The picture: a canvas with every key painted once. Null with no DOM. */
export function paintPictures(uses) {
  if (typeof document === 'undefined' || !uses.length) {
    return null;
  }
  const { cells, w, h } = pack(uses);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  for (const [key, cell] of Object.entries(cells)) {
    g.save();
    g.translate(cell.x, cell.y);
    g.beginPath();
    g.rect(0, 0, cell.w, cell.h);
    g.clip();
    const paint = painterOf(key);
    if (paint) {
      const dh = designHeight(key);
      const k = cell.h / dh;
      g.scale(k, k);
      paint(g, cell.w / k, dh, rng(seedOf(key)));
    } else {
      g.fillStyle = '#ff00ff';
      g.fillRect(0, 0, cell.w, cell.h);
    }
    g.restore();
  }
  return { canvas: c, cells, w, h };
}

/* The school's plan directions as the world's: north is -z. */
const NORMAL = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0] };

/* Every use as a quad on the picture, one mesh. Real metres in, the
 * world's out (S). */
export function pictureMesh(THREE, uses, atlas, material) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  for (const u of uses) {
    const cell = atlas.cells[u.key];
    if (!cell) {
      continue;
    }
    const u0 = (cell.x + 0.5) / atlas.w;
    const u1 = (cell.x + cell.w - 0.5) / atlas.w;
    const v0 = 1 - (cell.y + cell.h - 0.5) / atlas.h;
    const v1 = 1 - (cell.y + 0.5) / atlas.h;
    const [nx, ny, nz] = NORMAL[u.face];
    /* Right as the one looking at it has it: up crossed with the normal,
     * which also winds the quad to face its normal. */
    const rx = nz;
    const rz = -nx;
    const [x, y, z] = worldAt(u.px, u.py, u.h);
    const hw = (S * u.w) / 2;
    const hh = (S * u.ht) / 2;
    const base = pos.length / 3;
    for (const [sx, sy, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      pos.push(x + rx * sx * hw, y + sy * hh, z + rz * sx * hw);
      nor.push(nx, ny, nz);
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
  mesh.name = 'school pictures';
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
