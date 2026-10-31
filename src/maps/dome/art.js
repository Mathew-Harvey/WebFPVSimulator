/*
 * art.js: the pictures Bakuon Dome is painted with, in a manga's hand.
 * Two canvases and nothing downloaded: the crowd, four strips of fans in
 * ink and screentone that the stands wear row by row, and one sheet of
 * every sign in the hall (the big screen's panels, the ribbon round the
 * fascia, the banners, the gate numbers, the stalls' noren, the gable's
 * name), each a cell the hall's quads point into.
 *
 * The words are the hall's own and nobody's brand. A sign that a truck
 * show or a stadium somewhere wears is not copied here: the sound words
 * are the ones every manga letters (ドドド, ゴゴゴ, ドーン), the names are
 * the four yokai the trucks are painted as, and the stalls sell what any
 * Japanese festival sells.
 *
 * Browser only: these are canvases, and reach no physics.
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

const INK = '#1d1b24';
const PAPER = '#f6f0e2';
const CREAM = '#f1e3bd';
const JP = '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Noto Sans CJK JP", "Noto Sans JP", "Arial Black", sans-serif';
const HEAVY = `900 {px}px ${JP}`;
const BOLD = `700 {px}px ${JP}`;

/* A small fixed hash, so every canvas paints the same picture every time. */
function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function font(g, face, px) {
  g.font = face.replace('{px}', String(Math.round(px)));
}

/* Words with an ink outline, shrunk until they fit `maxW`. */
function lettered(g, text, x, y, maxW, px, fill, line = INK, face = HEAVY, lw = 0.16) {
  let size = px;
  font(g, face, size);
  while (size > 6 && g.measureText(text).width > maxW) {
    size -= 2;
    font(g, face, size);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  if (line) {
    g.lineWidth = Math.max(2, size * lw);
    g.strokeStyle = line;
    g.strokeText(text, x, y);
  }
  g.fillStyle = fill;
  g.fillText(text, x, y);
  return size;
}

/* Screentone: dots on a 45 degree grid over the rectangle, a manga's grey. */
function tone(g, x, y, w, h, colour, step = 6, r = 1.4) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = colour;
  for (let j = 0; j * step < h + step; j += 1) {
    for (let i = 0; i * step < w + step; i += 1) {
      g.beginPath();
      g.arc(x + i * step + ((j % 2) * step) / 2, y + j * step, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/* Speed lines from a centre out past the edges, a manga's burst. */
function burst(g, cx, cy, w, h, n, colour, inner, seed) {
  const R = rnd(seed);
  g.save();
  g.fillStyle = colour;
  const far = Math.hypot(w, h);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + R() * 0.05;
    const da = 0.012 + R() * 0.02;
    const r0 = inner * (0.8 + R() * 0.6);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a - da) * far, cy + Math.sin(a - da) * far);
    g.lineTo(cx + Math.cos(a + da) * far, cy + Math.sin(a + da) * far);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/* Horizontal speed lines, for a thing going by. */
function streaks(g, x, y, w, h, n, colour, seed) {
  const R = rnd(seed);
  g.fillStyle = colour;
  for (let i = 0; i < n; i += 1) {
    const yy = y + R() * h;
    const len = w * (0.2 + R() * 0.6);
    const xx = x + R() * (w - len);
    const t = 1 + R() * 3;
    g.beginPath();
    g.moveTo(xx, yy);
    g.lineTo(xx + len, yy - t / 2);
    g.lineTo(xx + len, yy + t / 2);
    g.closePath();
    g.fill();
  }
}

function frame(g, w, h, fill, lw = 6) {
  g.fillStyle = fill;
  g.fillRect(0, 0, w, h);
  g.lineWidth = lw;
  g.strokeStyle = INK;
  g.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
}

/* A monster truck side on, in ink, for the big screen: nose to the right. */
function truckInk(g, x, y, s, body, accent) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineJoin = 'round';
  g.lineWidth = 3;
  g.strokeStyle = INK;
  /* The body: bed, cab, bonnet. */
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(-58, -40);
  g.lineTo(52, -40);
  g.lineTo(56, -52);
  g.lineTo(18, -56);
  g.lineTo(10, -78);
  g.lineTo(-16, -78);
  g.lineTo(-20, -56);
  g.lineTo(-58, -54);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#2a3446';
  g.fillRect(-12, -74, 20, 14);
  g.strokeRect(-12, -74, 20, 14);
  g.fillStyle = accent;
  g.fillRect(28, -66, 14, 10);
  g.strokeRect(28, -66, 14, 10);
  /* The shocks and the frame. */
  g.strokeStyle = '#e0a83a';
  g.lineWidth = 4;
  for (const sx of [-36, 34]) {
    g.beginPath();
    g.moveTo(sx - 6, -40);
    g.lineTo(sx - 2, -20);
    g.moveTo(sx + 6, -40);
    g.lineTo(sx + 2, -20);
    g.stroke();
  }
  /* The tyres, lugged. */
  for (const sx of [-36, 34]) {
    g.fillStyle = '#26242c';
    g.beginPath();
    g.arc(sx, -14, 18, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = '#26242c';
    for (let k = 0; k < 12; k += 1) {
      const a = (k / 12) * Math.PI * 2;
      g.fillRect(sx + Math.cos(a) * 18 - 3, -14 + Math.sin(a) * 18 - 3, 6, 6);
    }
    g.fillStyle = '#d6d8de';
    g.beginPath();
    g.arc(sx, -14, 8, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.restore();
}

/* ---- the crowd ---- */

export const CROWD_W = 1024;
export const CROWD_STRIP = 128;
export const CROWD_STRIPS = 4;
/* A strip is this many metres wide and tall in the hall. */
export const CROWD_M = { w: 14.4, h: 1.8 };

const SHIRTS = ['#d8333d', '#f0791e', '#3aa45a', '#2f6fd0', '#f6f2ea', '#26242c', '#f2c230', '#f2a6bd', '#2e4382', '#8fe0b8', '#d8333d', '#2f6fd0'];
const SKIN = ['#f1d0b0', '#e9bf98', '#d9a982', '#f4dcc4', '#c99572'];
const HAIR = ['#1d1b24', '#2b2226', '#3a2c26', '#1d1b24', '#5a3e2e', '#1d1b24'];
const FANS = ['#f2c230', '#d8333d', '#f2a6bd', '#8fe0b8', '#f6f2ea'];

/*
 * One strip of fans across the canvas at row `j`: `fill` the share of the
 * seats that have somebody in them, `stand` the share of those on their
 * feet. A metre is `k` pixels each way, so the people are the right shape
 * however the strip is stretched over a row.
 */
function crowdStrip(g, j, fill, stand, seed) {
  const R = rnd(seed);
  const k = CROWD_STRIP / CROWD_M.h;
  const y0 = (j + 1) * CROWD_STRIP;
  const pitch = 0.5 * k;
  const n = Math.round(CROWD_W / pitch);
  const at = (m) => y0 - m * k;
  for (let i = 0; i < n; i += 1) {
    if (R() > fill) {
      continue;
    }
    const cx = (i + 0.5) * pitch + (R() - 0.5) * pitch * 0.2;
    const up = R() < stand;
    const shirt = SHIRTS[Math.floor(R() * SHIRTS.length)];
    const skin = SKIN[Math.floor(R() * SKIN.length)];
    const hair = HAIR[Math.floor(R() * HAIR.length)];
    const hip = up ? 0.85 : 0.45;
    const sh = hip + (up ? 0.58 : 0.52);
    const headY = sh + 0.17;
    const hw = (0.2 + R() * 0.04) * k;
    g.lineJoin = 'round';
    g.lineWidth = 1.6;
    g.strokeStyle = INK;
    /* Legs, the trousers dark, a standing fan's apart. */
    g.fillStyle = R() < 0.6 ? '#33364a' : '#5a6078';
    if (up) {
      g.fillRect(cx - hw * 0.75, at(hip), hw * 0.62, hip * k);
      g.fillRect(cx + hw * 0.13, at(hip), hw * 0.62, hip * k);
      g.strokeRect(cx - hw * 0.75, at(hip), hw * 0.62, hip * k);
      g.strokeRect(cx + hw * 0.13, at(hip), hw * 0.62, hip * k);
    } else {
      g.fillRect(cx - hw * 0.8, at(hip), hw * 1.6, (hip - 0.05) * k);
      g.strokeRect(cx - hw * 0.8, at(hip), hw * 1.6, (hip - 0.05) * k);
    }
    /* The torso, a rounded block, toned on its shaded side. */
    const tx = cx - hw;
    const ty = at(sh);
    const th = (sh - hip) * k;
    g.fillStyle = shirt;
    g.beginPath();
    g.roundRect(tx, ty, hw * 2, th, [hw * 0.7, hw * 0.7, 2, 2]);
    g.fill();
    tone(g, tx + hw * 1.1, ty + 2, hw * 0.9, th - 2, 'rgba(29,27,36,0.35)', 3.2, 0.7);
    g.beginPath();
    g.roundRect(tx, ty, hw * 2, th, [hw * 0.7, hw * 0.7, 2, 2]);
    g.stroke();
    /* A happi coat's white collar now and then. */
    if (shirt === '#2e4382') {
      g.strokeStyle = PAPER;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - hw * 0.5, ty + 1);
      g.lineTo(cx, ty + th * 0.6);
      g.lineTo(cx + hw * 0.5, ty + 1);
      g.stroke();
      g.strokeStyle = INK;
      g.lineWidth = 1.6;
    }
    /* Arms: down, or both up in a cheer, or one up with a fan. */
    const pose = R();
    const arm = (x0, y0, x1, y1) => {
      g.strokeStyle = INK;
      g.lineWidth = 4.4;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.strokeStyle = shirt;
      g.lineWidth = 2.6;
      g.stroke();
      g.fillStyle = skin;
      g.beginPath();
      g.arc(x1, y1, 2.2, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = INK;
      g.stroke();
    };
    const top = at(headY + 0.45);
    if (pose < 0.28 || (up && pose < 0.6)) {
      arm(cx - hw * 0.8, ty + 3, cx - hw * 1.3, top);
      arm(cx + hw * 0.8, ty + 3, cx + hw * 1.3, top);
      /* A towel stretched between the hands, in a team's colour. */
      if (R() < 0.35) {
        g.fillStyle = SHIRTS[Math.floor(R() * 4)];
        g.fillRect(cx - hw * 1.35, top - 5, hw * 2.7, 6);
        g.lineWidth = 1.2;
        g.strokeStyle = INK;
        g.strokeRect(cx - hw * 1.35, top - 5, hw * 2.7, 6);
      }
    } else if (pose < 0.5) {
      arm(cx + hw * 0.8, ty + 3, cx + hw * 1.1, top);
      /* An uchiwa, a round paper fan on a stick. */
      g.fillStyle = FANS[Math.floor(R() * FANS.length)];
      g.beginPath();
      g.ellipse(cx + hw * 1.1, top - 6, 6, 5.5, 0, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = INK;
      g.stroke();
    }
    /* The head: skin, the hair over its top, now and then a hachimaki. */
    const hy = at(headY);
    const hr = 0.115 * k;
    g.fillStyle = skin;
    g.beginPath();
    g.arc(cx, hy, hr, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 1.4;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = hair;
    g.beginPath();
    g.arc(cx, hy, hr, Math.PI * 1.05, Math.PI * 1.95);
    g.lineTo(cx + hr * 0.9, hy - hr * 0.1);
    g.closePath();
    g.fill();
    if (R() < 0.18) {
      g.fillStyle = PAPER;
      g.fillRect(cx - hr, hy - hr * 0.55, hr * 2, hr * 0.38);
      g.fillStyle = '#d8333d';
      g.beginPath();
      g.arc(cx, hy - hr * 0.36, hr * 0.17, 0, Math.PI * 2);
      g.fill();
    }
    /* Eyes and a shout. */
    g.fillStyle = INK;
    g.fillRect(cx - hr * 0.45, hy, 1.4, 1.6);
    g.fillRect(cx + hr * 0.3, hy, 1.4, 1.6);
    if (R() < 0.5) {
      g.beginPath();
      g.ellipse(cx, hy + hr * 0.5, hr * 0.22, hr * 0.18, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/* The crowd, a canvas of CROWD_STRIPS strips: 0 a full house sitting,
 * 1 a full house on its feet, 2 half full, 3 a few. */
export function paintCrowd() {
  const c = document.createElement('canvas');
  c.width = CROWD_W;
  c.height = CROWD_STRIP * CROWD_STRIPS;
  const g = c.getContext('2d');
  crowdStrip(g, 0, 0.92, 0.12, 11);
  crowdStrip(g, 1, 0.95, 0.85, 23);
  crowdStrip(g, 2, 0.55, 0.2, 37);
  crowdStrip(g, 3, 0.22, 0.25, 41);
  return c;
}

/* ---- the signs ---- */

export const SHEET_W = 2048;
export const SHEET_H = 1344;

const TRUCK_PAINT = [
  { body: '#d8333d', dark: '#8e1f2e', accent: '#f1e3bd', kanji: '鬼', kana: 'オニ' },
  { body: '#f0791e', dark: '#b5531a', accent: '#1d1b24', kanji: '虎', kana: 'トラ' },
  { body: '#3aa45a', dark: '#22693c', accent: '#f2c230', kanji: '河童', kana: 'カッパ' },
  { body: '#2f6fd0', dark: '#1f4688', accent: '#e0a83a', kanji: '龍', kana: 'リュウ' },
];

/* Every cell: its size in pixels and its painter (g, w, h). */
const CELLS = {
  /* THE BIG SCREEN: four manga panels, one a face. */
  screen0: [512, 288, (g, w, h) => {
    frame(g, w, h, PAPER, 8);
    burst(g, w * 0.55, h * 0.5, w, h, 90, INK, h * 0.28, 5);
    g.fillStyle = PAPER;
    g.beginPath();
    g.ellipse(w * 0.55, h * 0.5, w * 0.3, h * 0.33, 0, 0, Math.PI * 2);
    g.fill();
    /* The truck in the air over a line of crushed cars. */
    g.save();
    g.translate(w * 0.56, h * 0.52);
    g.rotate(-0.22);
    truckInk(g, 0, 20, 1.15, '#d8333d', '#f1e3bd');
    g.restore();
    for (let i = 0; i < 6; i += 1) {
      g.fillStyle = ['#8a8d96', '#c94a3f', '#3f71aa', '#e7e5df', '#508c5e', '#f2c230'][i];
      g.fillRect(w * 0.18 + i * 54, h - 46, 50, 22);
      g.lineWidth = 3;
      g.strokeStyle = INK;
      g.strokeRect(w * 0.18 + i * 54, h - 46, 50, 22);
    }
    lettered(g, 'ドーン!!', w * 0.2, h * 0.22, w * 0.36, 70, '#f2c230', INK, HEAVY, 0.22);
    g.lineWidth = 8;
    g.strokeStyle = INK;
    g.strokeRect(4, 4, w - 8, h - 8);
  }],
  screen1: [512, 288, (g, w, h) => {
    /* 鬼 against 龍: a panel split on the slant. */
    g.fillStyle = '#d8333d';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f6fd0';
    g.beginPath();
    g.moveTo(w * 0.58, 0);
    g.lineTo(w, 0);
    g.lineTo(w, h);
    g.lineTo(w * 0.42, h);
    g.closePath();
    g.fill();
    streaks(g, 0, 0, w * 0.5, h, 40, 'rgba(29,27,36,0.4)', 9);
    streaks(g, w * 0.5, 0, w * 0.5, h, 40, 'rgba(29,27,36,0.4)', 19);
    g.lineWidth = 10;
    g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(w * 0.58, 0);
    g.lineTo(w * 0.42, h);
    g.stroke();
    lettered(g, '鬼', w * 0.24, h * 0.48, w * 0.4, 190, CREAM, INK, HEAVY, 0.12);
    lettered(g, '龍', w * 0.77, h * 0.48, w * 0.4, 190, '#e0a83a', INK, HEAVY, 0.12);
    lettered(g, 'VS', w * 0.5, h * 0.5, w * 0.3, 86, '#f2c230', INK, HEAVY, 0.25);
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
  }],
  screen2: [512, 288, (g, w, h) => {
    /* The roar: ゴゴゴゴ climbing a toned panel, the way a manga draws
     * a thing about to happen. */
    frame(g, w, h, '#2b2830', 8);
    tone(g, 0, 0, w, h, 'rgba(246,240,226,0.22)', 9, 2.2);
    const words = ['ゴ', 'ゴ', 'ゴ', 'ゴ'];
    words.forEach((t, i) => {
      g.save();
      g.translate(w * (0.18 + i * 0.21), h * (0.72 - i * 0.12));
      g.rotate(-0.15 + i * 0.08);
      lettered(g, t, 0, 0, 200, 120 + i * 14, '#b48ad8', PAPER, HEAVY, 0.18);
      g.restore();
    });
    g.lineWidth = 8;
    g.strokeStyle = INK;
    g.strokeRect(4, 4, w - 8, h - 8);
  }],
  screen3: [512, 288, (g, w, h) => {
    /* The four trucks' faces, a panel each. */
    frame(g, w, h, PAPER, 8);
    TRUCK_PAINT.forEach((t, i) => {
      const x = (i % 2) * (w / 2);
      const y = Math.floor(i / 2) * (h / 2);
      g.fillStyle = t.body;
      g.fillRect(x + 6, y + 6, w / 2 - 12, h / 2 - 12);
      streaks(g, x + 6, y + 6, w / 2 - 12, h / 2 - 12, 18, 'rgba(29,27,36,0.35)', 50 + i);
      g.lineWidth = 5;
      g.strokeStyle = INK;
      g.strokeRect(x + 6, y + 6, w / 2 - 12, h / 2 - 12);
      lettered(g, t.kanji, x + w * 0.16, y + h * 0.25, w * 0.22, 96, t.accent === '#1d1b24' ? PAPER : t.accent);
      lettered(g, t.kana, x + w * 0.37, y + h * 0.25, w * 0.15, 40, PAPER);
    });
  }],

  /* THE RIBBON round the fascia: long panels, LED bright. */
  rb0: [512, 96, (g, w, h) => {
    frame(g, w, h, '#d8333d', 5);
    streaks(g, 0, 0, w, h, 30, 'rgba(29,27,36,0.35)', 3);
    lettered(g, '爆音ドーム', w / 2, h / 2 + 2, w * 0.9, 76, PAPER, INK, HEAVY, 0.18);
  }],
  rb1: [512, 96, (g, w, h) => {
    frame(g, w, h, '#1d1b24', 5);
    for (let i = 0; i < 5; i += 1) {
      g.save();
      g.translate(w * (0.12 + i * 0.19), h * 0.52 + (i % 2 ? -6 : 6));
      g.rotate(i % 2 ? 0.12 : -0.12);
      lettered(g, 'ド', 0, 0, 120, 84, '#f2c230', PAPER, HEAVY, 0.14);
      g.restore();
    }
  }],
  rb2: [512, 96, (g, w, h) => {
    frame(g, w, h, '#f2c230', 5);
    tone(g, 0, 0, w, h, 'rgba(29,27,36,0.18)', 7, 1.6);
    lettered(g, 'MONSTER TRUCK MATSURI', w / 2, h / 2 + 2, w * 0.92, 54, INK, PAPER, HEAVY, 0.12);
  }],
  rb3: [512, 96, (g, w, h) => {
    TRUCK_PAINT.forEach((t, i) => {
      g.fillStyle = t.body;
      g.fillRect((i * w) / 4, 0, w / 4, h);
      lettered(g, t.kanji, ((i + 0.5) * w) / 4, h / 2 + 2, w / 4 - 16, 70, t.accent === '#1d1b24' ? PAPER : t.accent);
    });
    g.lineWidth = 5;
    g.strokeStyle = INK;
    for (let i = 1; i < 4; i += 1) {
      g.beginPath();
      g.moveTo((i * w) / 4, 0);
      g.lineTo((i * w) / 4, h);
      g.stroke();
    }
    g.strokeRect(2.5, 2.5, w - 5, h - 5);
  }],
  rb4: [512, 96, (g, w, h) => {
    frame(g, w, h, '#2e4382', 5);
    streaks(g, 0, 0, w, h, 26, 'rgba(246,240,226,0.25)', 13);
    lettered(g, 'ジャンプ!!', w / 2, h / 2 + 2, w * 0.88, 76, '#8fe0b8', INK, HEAVY, 0.18);
  }],
  rb5: [512, 96, (g, w, h) => {
    frame(g, w, h, PAPER, 5);
    lettered(g, 'BAKUON DOME', w / 2, h / 2 + 2, w * 0.9, 66, '#d8333d', INK, HEAVY, 0.14);
  }],
  rb6: [512, 96, (g, w, h) => {
    /* A checkered flag and the words for go. */
    for (let i = 0; i < 32; i += 1) {
      for (let j = 0; j < 6; j += 1) {
        g.fillStyle = (i + j) % 2 ? INK : PAPER;
        g.fillRect(i * 16, j * 16, 16, 16);
      }
    }
    g.fillStyle = '#d8333d';
    g.fillRect(w * 0.2, 10, w * 0.6, h - 20);
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.strokeRect(w * 0.2, 10, w * 0.6, h - 20);
    lettered(g, 'いけー!!', w / 2, h / 2 + 2, w * 0.55, 64, PAPER, INK, HEAVY, 0.16);
  }],
  rb7: [512, 96, (g, w, h) => {
    frame(g, w, h, '#f2a6bd', 5);
    lettered(g, 'バリバリ', w * 0.5, h / 2 + 2, w * 0.86, 76, PAPER, INK, HEAVY, 0.2);
  }],

  /* THE BANNERS hung from the arches, one a truck: lit cloth. */
  bn0: [128, 384, (g, w, h) => banner(g, w, h, TRUCK_PAINT[0])],
  bn1: [128, 384, (g, w, h) => banner(g, w, h, TRUCK_PAINT[1])],
  bn2: [128, 384, (g, w, h) => banner(g, w, h, TRUCK_PAINT[2])],
  bn3: [128, 384, (g, w, h) => banner(g, w, h, TRUCK_PAINT[3])],

  /* The gates' numbers over the tunnels in the stands. */
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`gate${n}`, [128, 64, (g, w, h) => {
    frame(g, w, h, '#f2c230', 4);
    g.fillStyle = INK;
    g.beginPath();
    g.arc(w * 0.26, h / 2, h * 0.36, 0, Math.PI * 2);
    g.fill();
    lettered(g, String(n), w * 0.26, h / 2 + 2, h * 0.6, 40, '#f2c230', null);
    lettered(g, 'ゲート', w * 0.66, h / 2 + 1, w * 0.48, 24, INK, null, BOLD);
  }]])),
  enter: [256, 80, (g, w, h) => {
    frame(g, w, h, '#2b2830', 5);
    g.fillStyle = '#f2c230';
    for (let i = -2; i < 18; i += 1) {
      g.beginPath();
      g.moveTo(i * 16, h);
      g.lineTo(i * 16 + 8, h);
      g.lineTo(i * 16 + 18, h - 12);
      g.lineTo(i * 16 + 10, h - 12);
      g.closePath();
      g.fill();
    }
    lettered(g, '入場', w / 2, h * 0.42, w * 0.6, 54, PAPER, INK, HEAVY, 0.1);
  }],
  exit: [256, 80, (g, w, h) => {
    frame(g, w, h, '#2b2830', 5);
    g.fillStyle = '#f2c230';
    for (let i = -2; i < 18; i += 1) {
      g.beginPath();
      g.moveTo(i * 16, h);
      g.lineTo(i * 16 + 8, h);
      g.lineTo(i * 16 + 18, h - 12);
      g.lineTo(i * 16 + 10, h - 12);
      g.closePath();
      g.fill();
    }
    lettered(g, '退場', w / 2, h * 0.42, w * 0.6, 54, PAPER, INK, HEAVY, 0.1);
  }],

  /* THE STALLS' NOREN: cloth in three panels with a slit between, which
   * the cut out of the picture leaves open. */
  nr0: [256, 96, (g, w, h) => noren(g, w, h, '#2e4382', PAPER, 'たこ焼き')],
  nr1: [256, 96, (g, w, h) => noren(g, w, h, '#d8333d', PAPER, 'やきそば')],
  nr2: [256, 96, (g, w, h) => noren(g, w, h, PAPER, '#d8333d', 'ラーメン')],
  nr3: [256, 96, (g, w, h) => noren(g, w, h, '#8fe0b8', '#2e4382', 'かき氷')],
  nr4: [256, 96, (g, w, h) => noren(g, w, h, '#f2c230', INK, 'からあげ')],
  nr5: [256, 96, (g, w, h) => noren(g, w, h, INK, '#f2c230', 'グッズ')],

  /* THE BARRIER'S PADS, painted words a pilot reads at speed. */
  pad0: [256, 64, (g, w, h) => {
    frame(g, w, h, PAPER, 4);
    lettered(g, '安全第一', w / 2, h / 2 + 1, w * 0.86, 44, '#2e7a4a', null);
  }],
  pad1: [256, 64, (g, w, h) => {
    frame(g, w, h, '#d8333d', 4);
    lettered(g, '爆音', w / 2, h / 2 + 1, w * 0.86, 48, PAPER, INK);
  }],
  pad2: [256, 64, (g, w, h) => {
    frame(g, w, h, '#2b2830', 4);
    for (let i = -2; i < 20; i += 1) {
      g.fillStyle = '#f2c230';
      g.beginPath();
      g.moveTo(i * 24, h);
      g.lineTo(i * 24 + 12, h);
      g.lineTo(i * 24 + 12 + h, 0);
      g.lineTo(i * 24 + h, 0);
      g.closePath();
      g.fill();
    }
  }],
  pad3: [256, 64, (g, w, h) => {
    frame(g, w, h, '#2e4382', 4);
    lettered(g, '熱血!!', w / 2, h / 2 + 1, w * 0.86, 46, '#f2c230', INK);
  }],
  pad4: [256, 64, (g, w, h) => {
    frame(g, w, h, '#f2c230', 4);
    lettered(g, '祭', w / 2, h / 2 + 1, w * 0.86, 50, '#d8333d', INK);
  }],

  /* THE GABLE'S NAME, outside, over each end: a disc and the words. */
  gable: [768, 192, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#d8333d';
    g.beginPath();
    g.arc(h / 2, h / 2, h * 0.46, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = INK;
    g.stroke();
    lettered(g, '爆', h / 2, h / 2 + 4, h * 0.7, 130, PAPER, INK, HEAVY, 0.1);
    lettered(g, '爆音ドーム', h + (w - h) / 2, h * 0.42, w - h - 20, 120, '#2b2830', PAPER, HEAVY, 0.1);
    lettered(g, 'BAKUON DOME', h + (w - h) / 2, h * 0.84, w - h - 40, 40, '#d8333d', PAPER, HEAVY, 0.12);
  }],
  gateA: [256, 96, (g, w, h) => gateSign(g, w, h, 'A', '東口')],
  gateB: [256, 96, (g, w, h) => gateSign(g, w, h, 'B', '正面')],
  gateC: [256, 96, (g, w, h) => gateSign(g, w, h, 'C', '西口')],

  /* Posters on the concourse's columns, a truck each. */
  ...Object.fromEntries(TRUCK_PAINT.map((t, i) => [`ps${i}`, [128, 180, (g, w, h) => {
    frame(g, w, h, t.body, 5);
    burst(g, w / 2, h * 0.42, w, h, 40, 'rgba(29,27,36,0.35)', 20, 70 + i);
    lettered(g, t.kanji, w / 2, h * 0.42, w * 0.84, 92, t.accent === '#1d1b24' ? PAPER : t.accent);
    g.fillStyle = PAPER;
    g.fillRect(6, h - 44, w - 12, 38);
    lettered(g, t.kana, w / 2, h - 25, w * 0.8, 28, INK, null, HEAVY);
    g.lineWidth = 5;
    g.strokeStyle = INK;
    g.strokeRect(2.5, 2.5, w - 5, h - 5);
  }]])),
  /* The truck tunnels' hazard surround. */
  hazard: [128, 32, (g, w, h) => {
    g.fillStyle = INK;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2c230';
    for (let i = -2; i < 10; i += 1) {
      g.beginPath();
      g.moveTo(i * 16, h);
      g.lineTo(i * 16 + 8, h);
      g.lineTo(i * 16 + 8 + h, 0);
      g.lineTo(i * 16 + h, 0);
      g.closePath();
      g.fill();
    }
  }],
};

function banner(g, w, h, t) {
  g.fillStyle = t.body;
  g.fillRect(0, 0, w, h);
  g.fillStyle = t.dark;
  g.fillRect(0, 0, w, 22);
  g.fillRect(0, h - 30, w, 30);
  /* The swallow tails at the foot, cut out. */
  g.clearRect(w / 2 - 14, h - 26, 28, 26);
  g.fillStyle = 'rgba(0,0,0,0)';
  const fg = t.accent === '#1d1b24' ? PAPER : t.accent;
  const glyphs = [...t.kanji];
  const step = (h - 120) / Math.max(1, glyphs.length);
  glyphs.forEach((ch, i) => {
    lettered(g, ch, w / 2, 60 + step * (i + 0.5), w * 0.88, glyphs.length > 1 ? 104 : 120, fg, INK, HEAVY, 0.12);
  });
  lettered(g, t.kana, w / 2, h - 58, w * 0.86, 26, PAPER, INK, HEAVY, 0.16);
  g.lineWidth = 4;
  g.strokeStyle = INK;
  g.strokeRect(2, 2, w - 4, h - 4);
}

function noren(g, w, h, bg, fg, text) {
  g.clearRect(0, 0, w, h);
  const panels = 4;
  const slit = 6;
  const pw = (w - slit * (panels - 1)) / panels;
  for (let i = 0; i < panels; i += 1) {
    const x = i * (pw + slit);
    g.fillStyle = bg;
    g.fillRect(x, 0, pw, h);
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.strokeRect(x + 1.5, 1.5, pw - 3, h - 3);
  }
  g.fillStyle = INK;
  g.fillRect(0, 0, w, 10);
  lettered(g, text, w / 2, h * 0.58, w * 0.9, 50, fg, bg === INK ? null : INK, HEAVY, 0.08);
}

function gateSign(g, w, h, letter, words) {
  frame(g, w, h, '#2b2830', 5);
  g.fillStyle = '#d8333d';
  g.fillRect(8, 8, h - 16, h - 16);
  lettered(g, letter, h / 2, h / 2 + 3, h * 0.7, 66, PAPER, null);
  lettered(g, words, h + (w - h) / 2, h / 2 + 2, w - h - 16, 48, PAPER, null, HEAVY);
}

/* Shelf packed: every cell's place on the sheet, in pixels and in uv. */
let PACK = null;
export function sheetCells() {
  if (PACK) {
    return PACK;
  }
  PACK = {};
  let x = 0;
  let y = 0;
  let row = 0;
  const pad = 4;
  const keys = Object.keys(CELLS).sort((a, b) => CELLS[b][1] - CELLS[a][1]);
  for (const key of keys) {
    const [w, h] = CELLS[key];
    if (x + w > SHEET_W) {
      x = 0;
      y += row + pad;
      row = 0;
    }
    if (y + h > SHEET_H) {
      throw new Error(`dome: sign ${key} does not fit the sheet`);
    }
    PACK[key] = {
      x, y, w, h, u0: x / SHEET_W, u1: (x + w) / SHEET_W, v0: 1 - (y + h) / SHEET_H, v1: 1 - y / SHEET_H,
    };
    x += w + pad;
    row = Math.max(row, h);
  }
  return PACK;
}

/* The sheet, painted. */
export function paintSheet() {
  const cells = sheetCells();
  const c = document.createElement('canvas');
  c.width = SHEET_W;
  c.height = SHEET_H;
  const g = c.getContext('2d');
  for (const [key, cell] of Object.entries(cells)) {
    g.save();
    g.translate(cell.x, cell.y);
    g.beginPath();
    g.rect(0, 0, cell.w, cell.h);
    g.clip();
    CELLS[key][2](g, cell.w, cell.h);
    g.restore();
  }
  return c;
}
