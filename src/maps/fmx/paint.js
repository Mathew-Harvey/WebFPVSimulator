/*
 * paint.js: Shiroyama FMX's painted surfaces, every one drawn on a canvas
 * here and nowhere fetched: the boards round the floor, the crowd, the big
 * screen, the castle's stones, the yagura's red and white skirt, the
 * nobori, the roof tiles, the dirt and the moat. Browser only.
 *
 * DRAWN THE WAY THE TOWN'S SIGNS ARE (src/props/textures.js), in a manga
 * hand: flat colour, a heavy ink line, screentone dots for shade, speed
 * lines. Every word on them is the show's own, in Japanese with a line of
 * English, and no brand of anybody's is on any of them. So the boards read
 * as a real contest's furniture and are nobody's advertising.
 *
 * ONE CANVAS A KIND, NOT ONE A SIGN. The boards are one atlas of eight
 * designs and each board takes its strip of it by its UVs, so every board
 * round the floor and every scrim on the stands is one material, which is
 * one draw call a chunk. The same for the nobori. Each canvas is a few
 * hundred kilobytes of texture at most and is made once a build.
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

const INK = '#2b2633';
const JP = `'Yu Gothic', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', 'IPAGothic', sans-serif`;
const DISPLAY = `'Arial Black', 'Helvetica Neue', Impact, 'Noto Sans CJK JP', 'IPAGothic', sans-serif`;

function canvas(wd, ht) {
  const c = document.createElement('canvas');
  c.width = wd;
  c.height = ht;
  return c;
}

/* A seeded stream, so every canvas is the same every build. */
function stream(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Text shrunk to fit a width. */
function fitText(g, text, maxW, size, font, weight = '900') {
  let s = size;
  for (; s > 8; s -= 2) {
    g.font = `${weight} ${s}px ${font}`;
    if (g.measureText(text).width <= maxW) {
      break;
    }
  }
  return s;
}

/* A field of screentone dots over a rectangle. */
function tone(g, x, y, wd, ht, step, r, colour) {
  g.fillStyle = colour;
  for (let j = 0; j * step < ht; j += 1) {
    for (let i = 0; i * step < wd; i += 1) {
      const ox = (j % 2) * step * 0.5;
      g.beginPath();
      g.arc(x + i * step + ox, y + j * step, r, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/* Speed lines out of a point, the manga way. */
function speedLines(g, cx, cy, r0, r1, n, colour, rand) {
  g.fillStyle = colour;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.05;
    const wdt = 0.006 + rand() * 0.014;
    const rr0 = r0 * (0.8 + rand() * 0.5);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * rr0, cy + Math.sin(a) * rr0);
    g.lineTo(cx + Math.cos(a - wdt) * r1, cy + Math.sin(a - wdt) * r1);
    g.lineTo(cx + Math.cos(a + wdt) * r1, cy + Math.sin(a + wdt) * r1);
    g.closePath();
    g.fill();
  }
}

/*
 * THE BOARDS: eight designs, one a row, 1024 by 128 each. BOARD_ROWS is
 * how many; a board's v runs over its row.
 */
export const BOARD_ROWS = 8;
const BOARDS = [
  { bg: '#e4472c', fg: '#fff7ec', jp: '城山 FMX', en: 'SHIROYAMA FREESTYLE MOTOCROSS' },
  { bg: '#f4efe4', fg: INK, jp: '空中戦', en: 'BATTLE IN THE AIR', sun: true },
  { bg: '#2e4382', fg: '#fff7ec', jp: '大技', en: 'BIG TRICKS ONLY' },
  { bg: '#f2c230', fg: INK, jp: 'FMX', en: 'SEND IT', chevrons: true },
  { bg: '#26232c', fg: '#fff7ec', jp: '宙返り', en: 'BACKFLIP' },
  { bg: '#f2a6bd', fg: INK, jp: '祭', en: 'AIR MATSURI' },
  { bg: '#8fe0b8', fg: INK, jp: '城下町', en: 'CASTLE TOWN JAM' },
  { bg: '#f4efe4', fg: '#e4472c', jp: '実況席', en: 'LIVE FROM THE BOOTH' },
];

export function boardAtlas() {
  const W = 1024;
  const H = 128;
  const c = canvas(W, H * BOARD_ROWS);
  const g = c.getContext('2d');
  const rand = stream(11);
  BOARDS.forEach((b, k) => {
    const y = k * H;
    g.fillStyle = b.bg;
    g.fillRect(0, y, W, H);
    if (b.sun) {
      g.save();
      g.beginPath();
      g.rect(0, y, W, H);
      g.clip();
      speedLines(g, 860, y + 64, 40, 520, 70, 'rgba(43,38,51,0.22)', rand);
      g.fillStyle = '#e4472c';
      g.beginPath();
      g.arc(860, y + 64, 44, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    if (b.chevrons) {
      g.fillStyle = INK;
      for (let i = 0; i < 6; i += 1) {
        const x = 700 + i * 50;
        g.beginPath();
        g.moveTo(x, y + 18);
        g.lineTo(x + 26, y + 64);
        g.lineTo(x, y + 110);
        g.lineTo(x + 16, y + 110);
        g.lineTo(x + 42, y + 64);
        g.lineTo(x + 16, y + 18);
        g.closePath();
        g.fill();
      }
    }
    /* The big word, inked round in the contrast colour, and its English. */
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const s = fitText(g, b.jp, 520, 96, b.jp === 'FMX' ? DISPLAY : JP);
    g.font = `900 ${s}px ${b.jp === 'FMX' ? DISPLAY : JP}`;
    g.lineWidth = 10;
    g.strokeStyle = b.fg === INK ? '#fff7ec' : INK;
    g.lineJoin = 'round';
    g.strokeText(b.jp, 34, y + 58);
    g.fillStyle = b.fg;
    g.fillText(b.jp, 34, y + 58);
    const tw = g.measureText(b.jp).width;
    g.font = `900 ${fitText(g, b.en, 600 - Math.min(tw, 420) * 0.4, 30, DISPLAY)}px ${DISPLAY}`;
    g.fillStyle = b.fg;
    g.fillText(b.en, Math.min(70 + tw, 600), y + 72);
    /* A rule top and bottom, and the board's ink edge. */
    g.fillStyle = INK;
    g.fillRect(0, y, W, 6);
    g.fillRect(0, y + H - 6, W, 6);
    g.fillRect(0, y, 6, H);
    g.fillRect(W - 6, y, 6, H);
  });
  return c;
}

/*
 * THE CROWD: a strip of people as a manga artist fills a stand, heads and
 * shoulders, shirts in the show's colours with screentone in the folds,
 * arms up, a towel or a flag here and there. Transparent between them, so
 * a row is a plane and still reads as people. 1024 by 192, about 22 people
 * across, which ./dress.js lays at 12 m a repeat.
 */
export const CROWD_REPEAT_M = 12;
export function crowdStrip(seed = 3) {
  const W = 1024;
  const H = 192;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const rand = stream(seed);
  const shirts = ['#e4472c', '#fff7ec', '#2e4382', '#f2c230', '#8fe0b8', '#f2a6bd', '#3a3f58', '#f0721e', '#fff7ec', '#2f6fd0'];
  const skin = ['#f1d2b2', '#e8c09a', '#d9a982', '#f4dcc2'];
  const hair = ['#2b2633', '#3d3040', '#5a3e2a', '#2b2633'];
  g.lineJoin = 'round';
  const n = 22;
  const step = W / n;
  for (let i = 0; i < n; i += 1) {
    const x = step * (i + 0.5) + (rand() - 0.5) * step * 0.35;
    const tall = rand();
    const top = 52 + tall * 26;
    const shirt = shirts[Math.floor(rand() * shirts.length)];
    const up = rand();
    /* Arms up behind the head, for a third of them. */
    if (up < 0.35) {
      g.strokeStyle = INK;
      g.lineWidth = 15;
      g.beginPath();
      g.moveTo(x - 14, top + 46);
      g.lineTo(x - 26, top - 4);
      g.moveTo(x + 14, top + 46);
      g.lineTo(x + 24, top - 6);
      g.stroke();
      g.strokeStyle = shirt;
      g.lineWidth = 9;
      g.stroke();
      g.fillStyle = skin[i % skin.length];
      g.beginPath();
      g.arc(x - 26, top - 8, 6, 0, Math.PI * 2);
      g.arc(x + 24, top - 10, 6, 0, Math.PI * 2);
      g.fill();
    }
    /* A towel held up over the head, for some. */
    if (up > 0.86) {
      g.fillStyle = rand() < 0.5 ? '#e4472c' : '#2e4382';
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.fillRect(x - 30, top - 30, 60, 18);
      g.strokeRect(x - 30, top - 30, 60, 18);
      g.fillStyle = '#fff7ec';
      g.fillRect(x - 20, top - 25, 40, 7);
    }
    /* Shoulders and body. */
    g.fillStyle = shirt;
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x - 21, H);
    g.lineTo(x - 21, top + 50);
    g.quadraticCurveTo(x - 20, top + 34, x, top + 33);
    g.quadraticCurveTo(x + 20, top + 34, x + 21, top + 50);
    g.lineTo(x + 21, H);
    g.closePath();
    g.fill();
    g.stroke();
    g.save();
    g.clip();
    tone(g, x + 4, top + 40, 22, H - top - 40, 6, 1.5, 'rgba(43,38,51,0.35)');
    g.restore();
    /* Head and hair. */
    g.fillStyle = skin[(i * 3) % skin.length];
    g.beginPath();
    g.arc(x, top + 18, 15, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = hair[(i * 7) % hair.length];
    g.beginPath();
    g.arc(x, top + 14, 15.5, Math.PI * 1.05, Math.PI * 1.95);
    g.closePath();
    g.fill();
    if (rand() < 0.2) {
      /* A cap. */
      g.fillStyle = shirts[(i + 4) % shirts.length];
      g.fillRect(x - 15, top, 30, 9);
      g.fillRect(x - 2, top + 6, 22, 5);
      g.strokeRect(x - 15, top, 30, 9);
    }
  }
  return c;
}

/*
 * THE BIG SCREEN: a manga page's panel, a rider at the top of a backflip
 * in silhouette against speed lines, the show's name in a burst. It is the
 * one picture on the map that is a light, so it is drawn bright.
 */
export function screenPanel() {
  const W = 1024;
  const H = 576;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const rand = stream(21);
  g.fillStyle = '#fff7ec';
  g.fillRect(0, 0, W, H);
  speedLines(g, 600, 250, 60, 900, 120, 'rgba(43,38,51,0.85)', rand);
  /* A soft sunset band under the lines. */
  const grad = g.createLinearGradient(0, H * 0.55, 0, H);
  grad.addColorStop(0, 'rgba(242,166,189,0)');
  grad.addColorStop(1, 'rgba(240,114,30,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  /* The rider: the bike upside down at the top of the flip. */
  g.save();
  g.translate(600, 250);
  g.rotate(Math.PI * 0.85);
  g.fillStyle = INK;
  for (const wx of [-70, 70]) {
    g.beginPath();
    g.arc(wx, 40, 36, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff7ec';
    g.beginPath();
    g.arc(wx, 40, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
  }
  g.beginPath();
  g.moveTo(-80, 30);
  g.lineTo(-20, -10);
  g.lineTo(60, -14);
  g.lineTo(90, 30);
  g.lineTo(20, 20);
  g.closePath();
  g.fill();
  g.fillStyle = '#e4472c';
  g.fillRect(-30, -24, 70, 18);
  g.fillStyle = INK;
  g.beginPath();
  g.ellipse(0, -60, 22, 34, 0.3, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(16, -104, 22, 0, Math.PI * 2);
  g.fill();
  g.restore();
  /* The burst and the words. */
  g.save();
  g.translate(250, 150);
  g.fillStyle = '#fff7ec';
  g.strokeStyle = INK;
  g.lineWidth = 8;
  g.beginPath();
  for (let i = 0; i < 26; i += 1) {
    const a = (i / 26) * Math.PI * 2;
    const r = i % 2 ? 120 : 180;
    g.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 0.75);
  }
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#e4472c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 92px ${JP}`;
  g.lineWidth = 10;
  g.strokeText('城山', 0, -18);
  g.fillText('城山', 0, -18);
  g.fillStyle = INK;
  g.font = `900 54px ${DISPLAY}`;
  g.fillText('FMX', 0, 58);
  g.restore();
  g.fillStyle = INK;
  g.font = `900 64px ${JP}`;
  g.textAlign = 'right';
  g.fillText('宙返り!!', W - 40, H - 60);
  /* The panel's border. */
  g.lineWidth = 18;
  g.strokeStyle = INK;
  g.strokeRect(9, 9, W - 18, H - 18);
  return c;
}

/* THE CASTLE'S STONES: an ishigaki's coursed granite, every stone inked,
 * the corners a little hatched. 512 square, laid at 6 m a repeat. */
export const STONE_REPEAT_M = 6;
export function stoneWall() {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const rand = stream(5);
  g.fillStyle = '#9d968c';
  g.fillRect(0, 0, S, S);
  const greys = ['#c9c1b4', '#bdb5a8', '#d4cdc0', '#b2aa9c', '#c4bcae'];
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  let y = 0;
  while (y < S) {
    const h = 44 + Math.floor(rand() * 34);
    const rowH = Math.min(h, S - y);
    let x = -Math.floor(rand() * 60);
    while (x < S) {
      const wd = 56 + Math.floor(rand() * 96);
      const j = () => (rand() - 0.5) * 9;
      g.fillStyle = greys[Math.floor(rand() * greys.length)];
      g.beginPath();
      g.moveTo(x + 3 + j(), y + 3 + j());
      g.lineTo(x + wd - 3 + j(), y + 3 + j());
      g.lineTo(x + wd - 2 + j(), y + rowH - 3 + j());
      g.lineTo(x + 2 + j(), y + rowH - 2 + j());
      g.closePath();
      g.fill();
      g.lineWidth = 3.5;
      g.stroke();
      /* A few strokes of shade along the stone's foot. */
      g.lineWidth = 1.5;
      g.beginPath();
      for (let k = 0; k < 3; k += 1) {
        const hx = x + 10 + rand() * (wd - 20);
        g.moveTo(hx, y + rowH - 5);
        g.lineTo(hx + 7, y + rowH - 14);
      }
      g.stroke();
      x += wd;
    }
    y += rowH;
  }
  /* Wrap the tile: the last row's seam is the first row's. */
  g.fillStyle = INK;
  g.fillRect(0, 0, S, 2);
  return c;
}

/* THE YAGURA'S SKIRT: kohaku, red and white, the festival stripe. */
export function kohaku() {
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i += 1) {
    g.fillStyle = i % 2 ? '#fff7ec' : '#e4472c';
    g.fillRect(i * 32, 0, 32, 64);
  }
  g.fillStyle = INK;
  g.fillRect(0, 0, 256, 4);
  g.fillRect(0, 60, 256, 4);
  return c;
}

/* THE NOBORI: four tall festival banners, one a column, 128 by 512. */
export const NOBORI_COLS = 4;
const NOBORI = [
  { bg: '#e4472c', fg: '#fff7ec', text: '城山大技' },
  { bg: '#2e4382', fg: '#fff7ec', text: '空中祭' },
  { bg: '#fff7ec', fg: '#e4472c', text: 'FMX' },
  { bg: '#f2c230', fg: INK, text: '宙返り' },
];
export function noboriAtlas() {
  const c = canvas(128 * NOBORI_COLS, 512);
  const g = c.getContext('2d');
  NOBORI.forEach((b, k) => {
    const x = k * 128;
    g.fillStyle = b.bg;
    g.fillRect(x, 0, 128, 512);
    /* The sleeve the pole goes through, and the chichi loops. */
    g.fillStyle = INK;
    g.fillRect(x, 0, 14, 512);
    for (let y = 30; y < 512; y += 60) {
      g.fillRect(x + 14, y, 10, 12);
    }
    g.fillStyle = b.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const chars = b.text === 'FMX' ? ['F', 'M', 'X'] : [...b.text];
    const each = Math.min(110, 440 / chars.length);
    g.font = `900 ${Math.floor(each * 0.86)}px ${b.text === 'FMX' ? DISPLAY : JP}`;
    chars.forEach((ch, i) => {
      g.lineWidth = 6;
      g.strokeStyle = b.fg === INK ? '#fff7ec' : INK;
      g.strokeText(ch, x + 70, 50 + each * (i + 0.5));
      g.fillText(ch, x + 70, 50 + each * (i + 0.5));
    });
    g.fillStyle = INK;
    g.fillRect(x + 14, 504, 114, 8);
  });
  return c;
}

/* THE ROOF TILES: rows of round tiles down a slope, light and shade, 256
 * square, laid at 1.6 m a repeat across the slope. */
export const TILE_REPEAT_M = 1.6;
export function roofTiles(base = '#5d8f87', dark = '#3f6a64', light = '#86b5ab') {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i += 1) {
    const x = i * 32;
    g.fillStyle = dark;
    g.fillRect(x, 0, 6, 256);
    g.fillStyle = light;
    g.fillRect(x + 12, 0, 8, 256);
  }
  g.fillStyle = 'rgba(43,38,51,0.35)';
  for (let y = 0; y < 256; y += 64) {
    g.fillRect(0, y, 256, 3);
  }
  return c;
}

/* THE DIRT: packed, stippled and scuffed, the floor's own grit. 512
 * square, laid at 9 m a repeat. */
export const DIRT_REPEAT_M = 9;
export function dirtTile() {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const rand = stream(9);
  g.fillStyle = '#d2a676';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i += 1) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 0.8 + rand() * 2.2;
    g.fillStyle = rand() < 0.6 ? 'rgba(120,82,52,0.45)' : 'rgba(236,206,164,0.6)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(110,74,48,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 70; i += 1) {
    const x = rand() * S;
    const y = rand() * S;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 6 + rand() * 18, y + (rand() - 0.5) * 6);
    g.stroke();
  }
  return c;
}

/* THE MOAT: still water with the manga's white ripple strokes on it. 256
 * square, laid at 10 m a repeat. */
export const WATER_REPEAT_M = 10;
export function moatWater() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const rand = stream(13);
  g.fillStyle = '#5f9fbf';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,252,240,0.85)';
  g.lineCap = 'round';
  for (let i = 0; i < 26; i += 1) {
    const x = rand() * 256;
    const y = rand() * 256;
    const l = 14 + rand() * 30;
    g.lineWidth = 2 + rand() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + l / 2, y - 4, x + l, y);
    g.stroke();
  }
  g.fillStyle = 'rgba(43,38,51,0.12)';
  for (let y = 0; y < 256; y += 8) {
    g.fillRect(0, y, 256, 1);
  }
  return c;
}

/* The kicker's deck: non slip steel plate, its tread inked. */
export function deckPlate() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#b9bec6';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(43,38,51,0.45)';
  g.lineWidth = 3;
  for (let y = 8; y < 128; y += 16) {
    for (let x = (y / 16) % 2 ? 0 : 8; x < 128; x += 16) {
      g.beginPath();
      g.moveTo(x, y + 3);
      g.lineTo(x + 7, y - 3);
      g.stroke();
    }
  }
  return c;
}
