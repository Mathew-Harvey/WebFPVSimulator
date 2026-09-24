/*
 * textures.js: the paint a freestyle map's assets wear. Canvas2D, drawn at
 * load, nothing downloaded.
 *
 * THE STYLE IS THE TOWN'S, WITH THE VOLUME UP. The town's signs are flat
 * colour and crisp type (src/maps/city/vendored/core/textures.js), and these
 * are too; what is added is the manga vocabulary a freestyle map earns:
 * screentone dots, speed lines, heavy ink borders, lettering that shouts. A
 * billboard here is a comic panel advertising something that does not
 * exist; a bando's walls carry tags; a crane carries its builder's name.
 *
 * Every painter is a pure function of its variant number, so a billboard
 * shows the same advert every time its map loads, and every name in here is
 * invented. Nothing imitates a real company or a real product.
 *
 * Returned as canvases, not textures: ./kit.js wraps them, so this file
 * needs no renderer and could be run to make a contact sheet.
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

import { seededRandom } from './parts.js';

/* The town's own font stack for Japanese, so a sign here and a sign there
 * are set in the same face. The display face is for the shouting. */
const JP = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', sans-serif`;
const DISPLAY = `'Arial Black', 'Helvetica Neue', Impact, 'Noto Sans CJK JP', sans-serif`;

/* The ink colour the whole town is drawn in (PAL.ink), and its paper. */
const INK = '#39324f';
const PAPER = '#fbf7ee';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function fit(g, text, maxW, size, font, weight = '900') {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${font}`;
    if (g.measureText(text).width <= maxW) {
      break;
    }
    s -= 2;
  } while (s > 8);
  return s;
}

/* Text with a heavy ink outline, the way manga letters a sound. */
function shout(g, text, x, y, size, fill, opts = {}) {
  g.save();
  g.font = `${opts.weight ?? '900'} ${size}px ${opts.font ?? DISPLAY}`;
  g.textAlign = opts.align ?? 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  if (opts.skew) {
    g.translate(x, y);
    g.transform(1, 0, opts.skew, 1, 0, 0);
    g.translate(-x, -y);
  }
  if (opts.shadow !== false) {
    g.fillStyle = INK;
    g.fillText(text, x + size * 0.06, y + size * 0.07);
  }
  g.lineWidth = Math.max(2, size * (opts.stroke ?? 0.16));
  g.strokeStyle = opts.strokeColor ?? INK;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
  g.restore();
}

/* Screentone: a field of dots on a 45 degree grid, the manga shading. */
function tone(g, x, y, w, h, pitch, r, color) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = color;
  const d = pitch;
  for (let j = -2; j * d * 0.5 < h + d; j += 1) {
    const off = (j % 2) * d * 0.5;
    for (let i = -1; i * d < w + d; i += 1) {
      g.beginPath();
      g.arc(x + i * d + off, y + j * d * 0.5, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/* Speed lines radiating from a focus: the manga sign for "this is fast". */
function speedLines(g, cx, cy, x, y, w, h, n, color, rng) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = color;
  const R = Math.hypot(w, h);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.02, 0.02);
    const a0 = a - rng.range(0.004, 0.018);
    const a1 = a + rng.range(0.004, 0.018);
    const inner = R * rng.range(0.16, 0.34);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    g.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
    g.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/* A starburst, for a price or a NEW!. */
function burst(g, cx, cy, r0, r1, points, fill, rng) {
  g.save();
  g.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? r1 * rng.range(0.9, 1.08) : r0;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.stroke();
  g.restore();
}

function inkRect(g, x, y, w, h, lw = 8) {
  g.lineWidth = lw;
  g.strokeStyle = INK;
  g.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
}

/* ------------------------------------------------------------------ *
 * THE MANGA ADVERT, for billboards. A two or three panel page advertising
 * an invented product, drawn in the vocabulary a manga cover uses.
 * ------------------------------------------------------------------ */

const ADS = [
  { jp: 'ゼロラーメン', en: 'ZERO RAMEN', tag: 'FLY FAST. SLURP FASTER.', bg: '#ffd64a', hot: '#e0453f', obj: 'cup' },
  { jp: 'カゼソーダ', en: 'KAZE SODA', tag: 'TASTE THE WIND', bg: '#7fd3e8', hot: '#2f7fd0', obj: 'can' },
  { jp: 'ヒバリ電機', en: 'HIBARI DENKI', tag: 'BATTERIES THAT PUNCH', bg: '#f6a2c0', hot: '#8f6fb5', obj: 'battery' },
  { jp: 'ソラ急便', en: 'SORA EXPRESS', tag: 'DELIVERED BY TOMORROW', bg: '#a6e3a1', hot: '#22736f', obj: 'box' },
  { jp: 'マッハ牛乳', en: 'MACH MILK', tag: 'ONE GULP. MACH ONE.', bg: '#fbe7c6', hot: '#ef8a3c', obj: 'milk' },
  { jp: 'ネコ保険', en: 'NEKO INSURANCE', tag: 'NINE LIVES, ONE PLAN', bg: '#e9e1ff', hot: '#3d6ec4', obj: 'cat' },
];

/* A simple product drawing: flat colour, ink outline, one highlight. */
function product(g, kind, cx, cy, s, hot, rng) {
  g.save();
  g.lineWidth = Math.max(4, s * 0.05);
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  const hl = 'rgba(255,255,255,0.75)';
  if (kind === 'cup') {
    g.beginPath();
    g.moveTo(cx - s * 0.45, cy - s * 0.35);
    g.lineTo(cx + s * 0.45, cy - s * 0.35);
    g.lineTo(cx + s * 0.32, cy + s * 0.5);
    g.lineTo(cx - s * 0.32, cy + s * 0.5);
    g.closePath();
    g.fillStyle = '#fff4e0';
    g.fill();
    g.stroke();
    g.fillStyle = hot;
    g.fillRect(cx - s * 0.4, cy - s * 0.05, s * 0.8, s * 0.2);
    g.strokeRect(cx - s * 0.4, cy - s * 0.05, s * 0.8, s * 0.2);
    /* Steam, three curls. */
    g.lineWidth = Math.max(3, s * 0.035);
    for (let i = -1; i <= 1; i += 1) {
      g.beginPath();
      const x = cx + i * s * 0.2;
      g.moveTo(x, cy - s * 0.42);
      g.bezierCurveTo(x - s * 0.1, cy - s * 0.55, x + s * 0.1, cy - s * 0.65, x, cy - s * 0.8);
      g.stroke();
    }
  } else if (kind === 'can' || kind === 'milk' || kind === 'battery') {
    const w = kind === 'battery' ? s * 0.5 : s * 0.62;
    const h = kind === 'milk' ? s * 1.05 : s;
    g.beginPath();
    g.roundRect(cx - w / 2, cy - h / 2, w, h, kind === 'milk' ? 4 : w * 0.18);
    g.fillStyle = kind === 'milk' ? '#ffffff' : hot;
    g.fill();
    g.stroke();
    g.fillStyle = kind === 'milk' ? hot : '#ffffff';
    g.fillRect(cx - w / 2 + 4, cy - h * 0.12, w - 8, h * 0.26);
    if (kind === 'battery') {
      g.fillStyle = INK;
      g.fillRect(cx - w * 0.16, cy - h / 2 - s * 0.08, w * 0.32, s * 0.08);
      /* The bolt. */
      g.beginPath();
      g.moveTo(cx + w * 0.1, cy - h * 0.1);
      g.lineTo(cx - w * 0.18, cy + h * 0.04);
      g.lineTo(cx + w * 0.02, cy + h * 0.04);
      g.lineTo(cx - w * 0.1, cy + h * 0.2);
      g.lineTo(cx + w * 0.2, cy);
      g.lineTo(cx, cy);
      g.closePath();
      g.fillStyle = '#ffd64a';
      g.fill();
      g.stroke();
    }
    g.fillStyle = hl;
    g.fillRect(cx - w * 0.36, cy - h * 0.4, w * 0.1, h * 0.7);
  } else if (kind === 'box') {
    g.beginPath();
    g.moveTo(cx - s * 0.5, cy - s * 0.2);
    g.lineTo(cx, cy - s * 0.45);
    g.lineTo(cx + s * 0.5, cy - s * 0.2);
    g.lineTo(cx + s * 0.5, cy + s * 0.35);
    g.lineTo(cx, cy + s * 0.6);
    g.lineTo(cx - s * 0.5, cy + s * 0.35);
    g.closePath();
    g.fillStyle = '#e8b98a';
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(cx - s * 0.5, cy - s * 0.2);
    g.lineTo(cx, cy + s * 0.05);
    g.lineTo(cx + s * 0.5, cy - s * 0.2);
    g.moveTo(cx, cy + s * 0.05);
    g.lineTo(cx, cy + s * 0.6);
    g.stroke();
    /* Wings: it flies. */
    g.fillStyle = '#ffffff';
    for (const d of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + d * s * 0.45, cy - s * 0.05);
      g.quadraticCurveTo(cx + d * s * 0.95, cy - s * 0.55, cx + d * s * 0.85, cy - s * 0.15);
      g.quadraticCurveTo(cx + d * s * 0.8, cy + s * 0.05, cx + d * s * 0.45, cy + s * 0.1);
      g.closePath();
      g.fill();
      g.stroke();
    }
  } else {
    /* A cat face: two ears, a round head, the eyes a manga cat has. */
    g.beginPath();
    g.moveTo(cx - s * 0.45, cy - s * 0.1);
    g.lineTo(cx - s * 0.38, cy - s * 0.55);
    g.lineTo(cx - s * 0.12, cy - s * 0.32);
    g.lineTo(cx + s * 0.12, cy - s * 0.32);
    g.lineTo(cx + s * 0.38, cy - s * 0.55);
    g.lineTo(cx + s * 0.45, cy - s * 0.1);
    g.quadraticCurveTo(cx + s * 0.5, cy + s * 0.45, cx, cy + s * 0.45);
    g.quadraticCurveTo(cx - s * 0.5, cy + s * 0.45, cx - s * 0.45, cy - s * 0.1);
    g.fillStyle = '#ffffff';
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    for (const d of [-1, 1]) {
      g.beginPath();
      g.ellipse(cx + d * s * 0.18, cy, s * 0.07, s * 0.1, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(cx + d * s * 0.16, cy - s * 0.04, s * 0.025, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = INK;
    }
    g.fillStyle = hot;
    g.beginPath();
    g.ellipse(cx - s * 0.3, cy + s * 0.15, s * 0.07, s * 0.04, 0, 0, Math.PI * 2);
    g.ellipse(cx + s * 0.3, cy + s * 0.15, s * 0.07, s * 0.04, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  void rng;
}

export function mangaAd(variant) {
  const W = 1024;
  const H = 400;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const rng = seededRandom(0x5eed + variant * 7919);
  const ad = ADS[variant % ADS.length];
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  /* Panel one, the big one: the product in a burst of speed lines on the
   * brand colour, toned. */
  const split = W * rng.range(0.52, 0.6);
  g.fillStyle = ad.bg;
  g.fillRect(12, 12, split - 18, H - 24);
  tone(g, 12, 12, split - 18, H - 24, 18, 3.2, 'rgba(57,50,79,0.16)');
  speedLines(g, split * 0.48, H * 0.52, 12, 12, split - 18, H - 24, 70, 'rgba(255,255,255,0.72)', rng);
  product(g, ad.obj, split * 0.47, H * 0.55, H * 0.5, ad.hot, rng);
  inkRect(g, 12, 12, split - 18, H - 24, 10);
  /* Panel two: the name, huge, katakana over English, on paper with a
   * slanted cut, the way a cover page cuts its title panel. */
  g.save();
  g.beginPath();
  g.moveTo(split + 6, 12);
  g.lineTo(W - 12, 12);
  g.lineTo(W - 12, H * 0.68);
  g.lineTo(split - 30, H * 0.74);
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  g.clip();
  tone(g, split - 40, 12, W - split + 40, H * 0.7, 12, 2.0, 'rgba(57,50,79,0.10)');
  g.restore();
  g.lineWidth = 10;
  g.strokeStyle = INK;
  g.beginPath();
  g.moveTo(split + 6, 12);
  g.lineTo(W - 12, 12);
  g.lineTo(W - 12, H * 0.68);
  g.lineTo(split - 30, H * 0.74);
  g.closePath();
  g.stroke();
  const tw = W - split - 50;
  const jpSize = fit(g, ad.jp, tw, 96, JP);
  shout(g, ad.jp, split + tw / 2 + 12, H * 0.25, jpSize, ad.hot, { font: JP, skew: -0.12 });
  const enSize = fit(g, ad.en, tw, 64, DISPLAY);
  shout(g, ad.en, split + tw / 2 + 12, H * 0.5, enSize, '#ffffff', { skew: -0.12, stroke: 0.2 });
  /* Panel three: the tagline strip across the bottom right. */
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(split - 24, H * 0.78);
  g.lineTo(W - 12, H * 0.72);
  g.lineTo(W - 12, H - 12);
  g.lineTo(split - 24, H - 12);
  g.closePath();
  g.fill();
  const tagSize = fit(g, ad.tag, W - split - 30, 40, DISPLAY);
  g.font = `900 ${tagSize}px ${DISPLAY}`;
  g.fillStyle = PAPER;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ad.tag, (split + W) / 2 - 6, H * 0.87);
  /* A price burst over the seam between the panels. */
  burst(g, split - 20, H * 0.2, 42, 70, 12, '#ffd64a', rng);
  shout(g, `¥${100 + (variant % 5) * 30}`, split - 20, H * 0.2, 30, ad.hot, { stroke: 0.12, shadow: false });
  /* A sound effect in the corner of the big panel. */
  shout(g, ['ドン!', 'ズバッ', 'ゴゴゴ', 'シュッ'][variant % 4], 90, H - 70, 54, '#ffffff', { font: JP, skew: -0.2, stroke: 0.2 });
  return c;
}

/* ------------------------------------------------------------------ *
 * GRAFFITI, for a bando's walls: a throw up of a short word, bubble fat,
 * outlined twice, with drips and a spray halo, on a transparent ground.
 * ------------------------------------------------------------------ */

const TAGS = ['KAZE', 'SORA', 'BANDO', 'RIPS', 'NEKO', 'ZOOM', 'DIVE', 'ORBIT', 'HIBARI', 'SEND', 'GAP', 'LOOP'];
const SPRAY = ['#ff5aa5', '#3fd0c9', '#ffd64a', '#8ee06a', '#ff7d3c', '#9d7bff', '#4fa4ff'];

export function graffiti(seed) {
  const W = 512;
  const H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const rng = seededRandom(0x6aff + seed * 104729);
  const word = rng.pick(TAGS);
  const fill = rng.pick(SPRAY);
  const outline = rng.chance(0.5) ? '#ffffff' : '#1c1a24';
  g.clearRect(0, 0, W, H);
  /* The halo a can leaves round a piece. */
  g.save();
  g.shadowColor = fill;
  g.shadowBlur = 26;
  g.globalAlpha = 0.35;
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(W / 2, H / 2, W * 0.4, H * 0.3, rng.range(-0.1, 0.1), 0, Math.PI * 2);
  g.fill();
  g.restore();
  const size = fit(g, word, W * 0.84, 150, DISPLAY);
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(rng.range(-0.12, 0.12));
  g.transform(1, 0, rng.range(-0.3, 0.1), 1, 0, 0);
  g.font = `900 ${size}px ${DISPLAY}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  /* Outer outline, inner outline, fill, a highlight: four passes is what
   * separates a piece from a word written on a wall. */
  g.lineWidth = size * 0.3;
  g.strokeStyle = '#1c1a24';
  g.strokeText(word, 0, 0);
  g.lineWidth = size * 0.17;
  g.strokeStyle = outline;
  g.strokeText(word, 0, 0);
  g.fillStyle = fill;
  g.fillText(word, 0, 0);
  g.save();
  g.beginPath();
  g.rect(-W, -size * 0.55, W * 2, size * 0.36);
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.fillText(word, 0, 0);
  g.restore();
  /* Drips off the bottom of the letters. */
  g.fillStyle = fill;
  const tw = g.measureText(word).width;
  for (let i = 0; i < 6; i += 1) {
    const x = rng.range(-tw / 2, tw / 2);
    const len = rng.range(10, 46);
    g.fillRect(x, size * 0.3, 5, len);
    g.beginPath();
    g.arc(x + 2.5, size * 0.3 + len, 4, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  /* A crown or a star over it, sometimes. */
  if (rng.chance(0.4)) {
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#1c1a24';
    g.lineWidth = 5;
    const x = W * rng.range(0.2, 0.8);
    const y = H * 0.14;
    g.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 22 : 9;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }
  return c;
}

/* ------------------------------------------------------------------ *
 * SIGNS. Plates and names, flat and crisp like the town's.
 * ------------------------------------------------------------------ */

function plate(w, h, bg, draw) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  draw(g, w, h);
  return c;
}

const FLATS = [
  ['メゾンさくら', 'MAISON SAKURA'], ['ひばりハイツ', 'HIBARI HEIGHTS'], ['コーポ青空', 'CORPO AOZORA'],
  ['グリーンヒル', 'GREEN HILL'], ['サンハイム', 'SUN HEIM'], ['つばめ荘', 'TSUBAME-SO'],
  ['パレス若葉', 'PALACE WAKABA'], ['ことぶき館', 'KOTOBUKI-KAN'],
];

const OFFICES = [
  ['HIBARI SYSTEMS', '#2f7fd0'], ['KAIUN HOLDINGS', '#22736f'], ['MINATO ELECTRIC', '#e0453f'],
  ['SORAMICHI TECH', '#8f6fb5'], ['TAKANE BANK', '#2a4f97'], ['YAMABUKI DESIGN', '#ef8a3c'],
];

const WAREHOUSES = [
  ['丸山運輸', 'MARUYAMA LOGISTICS'], ['ひばり倉庫', 'HIBARI WAREHOUSE'], ['東雲物流', 'SHINONOME FREIGHT'],
  ['大和資材', 'YAMATO MATERIALS'], ['第二倉庫', 'NO.2 STORE'], ['港湾冷蔵', 'HARBOUR COLD STORE'],
];

const LINES = [
  ['HIBARI LINE', '#ffffff'], ['SAKURA EXP', '#ffffff'], ['KAISEI', '#ffffff'], ['MOMO MARINE', '#fff2c0'],
  ['TSURU SHIPPING', '#ffffff'], ['AOI OCEAN', '#ffffff'],
];

/*
 * How many distinct looks a painted key has. A variant past this wraps, so
 * a map of forty billboards is a dozen textures and a dozen draw calls, not
 * forty of each.
 */
export const SIGN_VARIANTS = { mangaAd: 12, graffiti: 12 };

export function sign(key, variant) {
  const v = Math.abs(Math.round(variant)) || 0;
  if (key === 'mangaAd') {
    return mangaAd(v % SIGN_VARIANTS.mangaAd);
  }
  if (key === 'flatsName') {
    const [jp, en] = FLATS[v % FLATS.length];
    return plate(512, 132, '#f4efe4', (g, w, h) => {
      g.strokeStyle = '#8b8496';
      g.lineWidth = 6;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#453f4f';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `700 ${fit(g, jp, w - 40, 54, JP, '700')}px ${JP}`;
      g.fillText(jp, w / 2, h * 0.4);
      g.font = `600 22px ${JP}`;
      g.fillText(en, w / 2, h * 0.78);
    });
  }
  if (key === 'officeName') {
    const [name, colour] = OFFICES[v % OFFICES.length];
    return plate(1024, 104, 'rgba(0,0,0,0)', (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = colour;
      g.fillRect(0, 0, h * 0.9, h);
      g.fillStyle = '#ffffff';
      g.font = `900 64px ${DISPLAY}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name[0], h * 0.45, h / 2);
      g.fillStyle = '#f4f2f6';
      g.font = `900 ${fit(g, name, w - h - 20, 72, DISPLAY)}px ${DISPLAY}`;
      g.textAlign = 'left';
      g.lineWidth = 8;
      g.strokeStyle = colour;
      g.strokeText(name, h + 10, h / 2);
      g.fillText(name, h + 10, h / 2);
    });
  }
  if (key === 'warehouseName') {
    const [jp, en] = WAREHOUSES[v % WAREHOUSES.length];
    return plate(1024, 128, '#f4f2f6', (g, w, h) => {
      g.fillStyle = '#2a4f97';
      g.fillRect(0, h - 18, w, 18);
      g.fillStyle = '#2a4f97';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.font = `900 ${fit(g, jp, w * 0.45, 88, JP)}px ${JP}`;
      g.fillText(jp, 24, h * 0.45);
      g.font = `900 ${fit(g, en, w * 0.46, 40, DISPLAY)}px ${DISPLAY}`;
      g.fillText(en, w * 0.52, h * 0.45);
    });
  }
  if (key === 'craneBanner') {
    return plate(1024, 128, '#f4c033', (g, w, h) => {
      g.fillStyle = INK;
      for (let x = -h; x < w + h; x += 64) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + 32, h);
        g.lineTo(x + 32 + h * 0.25, h - h * 0.25);
        g.lineTo(x + h * 0.25, h - h * 0.25);
        g.closePath();
        g.fill();
      }
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h * 0.72);
      g.fillStyle = INK;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${fit(g, 'ひばり建設  安全第一', w - 40, 70, JP)}px ${JP}`;
      g.fillText('ひばり建設  安全第一', w / 2, h * 0.37);
    });
  }
  if (key === 'dangerPlate') {
    return plate(256, 192, '#ffffff', (g, w, h) => {
      g.fillStyle = '#e0453f';
      g.fillRect(0, 0, w, h * 0.42);
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 64px ${JP}`;
      g.fillText('危険', w / 2, h * 0.22);
      g.fillStyle = INK;
      g.font = `900 34px ${JP}`;
      g.fillText('高電圧', w / 2, h * 0.58);
      g.font = `700 26px ${DISPLAY}`;
      g.fillText('DANGER', w / 2, h * 0.83);
      g.lineWidth = 8;
      g.strokeStyle = INK;
      g.strokeRect(4, 4, w - 8, h - 8);
    });
  }
  if (key === 'containerLogo') {
    const [name, colour] = LINES[v % LINES.length];
    return plate(1024, 160, 'rgba(0,0,0,0)', (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = colour;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${fit(g, name, w - 60, 120, DISPLAY)}px ${DISPLAY}`;
      g.fillText(name, w / 2, h * 0.5);
      /* A stencil's bridges: thin gaps through the letters. */
      g.globalCompositeOperation = 'destination-out';
      for (let x = 30; x < w; x += 97) {
        g.fillRect(x, 0, 5, h);
      }
      g.globalCompositeOperation = 'source-over';
      g.font = `700 22px ${DISPLAY}`;
      g.globalAlpha = 0.85;
      g.fillText(`HBRU ${String(400000 + v * 7919).slice(0, 6)} 2`, w * 0.82, 16);
    });
  }
  if (key === 'bridgePlate') {
    const names = [['ひばり歩道橋', 'HIBARI FOOTBRIDGE'], ['ひばり大橋', 'HIBARI OHASHI']];
    const [jp, en] = names[v % names.length];
    return plate(512, 96, '#3d6ec4', (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${fit(g, jp, w - 30, 48, JP)}px ${JP}`;
      g.fillText(jp, w / 2, h * 0.42);
      g.font = `700 18px ${DISPLAY}`;
      g.fillText(en, w / 2, h * 0.82);
    });
  }
  if (key === 'polePlate') {
    return plate(64, 256, '#f4f2f6', (g, w, h) => {
      g.fillStyle = INK;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `700 30px ${JP}`;
      [...'ひばり'].forEach((ch, i) => g.fillText(ch, w / 2, 40 + i * 44));
      g.font = `700 22px ${DISPLAY}`;
      g.fillText(`${12 + (v % 80)}`, w / 2, h - 40);
    });
  }
  if (key === 'tankBand') {
    return plate(1024, 128, '#e8eef4', (g, w, h) => {
      g.fillStyle = '#2f7fd0';
      g.fillRect(0, 0, w, 14);
      g.fillRect(0, h - 14, w, 14);
      g.fillStyle = '#2a4f97';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let k = 0; k < 2; k += 1) {
        const cx = w * (0.25 + k * 0.5);
        g.font = `900 64px ${JP}`;
        g.fillText('ひばり台', cx, h * 0.5);
      }
    });
  }
  return plate(64, 64, '#ff00ff', () => {});
}

/* A vinyl barrier wrap: the race field's navy and red, chequered ends. */
export function barrierVinyl() {
  return plate(512, 256, '#2a3d63', (g, w, h) => {
    g.fillStyle = '#e0453f';
    g.fillRect(0, h * 0.12, w, h * 0.12);
    g.fillRect(0, h * 0.76, w, h * 0.12);
    const s = h / 8;
    for (let j = 0; j < 8; j += 1) {
      for (let i = 0; i < 2; i += 1) {
        if ((i + j) % 2 === 0) {
          g.fillStyle = '#ffffff';
          g.fillRect(i * s, j * s, s, s);
          g.fillRect(w - (i + 1) * s, j * s, s, s);
        }
      }
    }
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 ${fit(g, 'FREESTYLE', w * 0.6, 90, DISPLAY)}px ${DISPLAY}`;
    g.fillText('FREESTYLE', w / 2, h / 2);
  });
}

/* A pennant: a tall triangle of navy or red with a white chevron. */
export function pennant(variant) {
  const c = canvas(128, 512);
  const g = c.getContext('2d');
  const colour = variant % 2 === 0 ? '#2a3d63' : '#e0453f';
  g.clearRect(0, 0, 128, 512);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(128, 60, 110, 300);
  g.quadraticCurveTo(90, 440, 0, 512);
  g.closePath();
  g.fillStyle = colour;
  g.fill();
  g.fillStyle = '#ffffff';
  g.fillRect(0, 150, 80, 22);
  g.fillRect(0, 190, 60, 10);
  return c;
}

/* Ground patches: weeds and fallen petals, soft edged blobs. */
export function patchTex(kind, seed) {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  const rng = seededRandom(0x9a7c + seed * 31);
  g.clearRect(0, 0, 128, 128);
  const colours = kind === 'petals' ? ['#fbc6d8', '#f6bccf', '#fff0f4'] : ['#6d8f64', '#5d7f58', '#83a372'];
  const n = kind === 'petals' ? 90 : 60;
  for (let i = 0; i < n; i += 1) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * 58;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    g.fillStyle = rng.pick(colours);
    g.beginPath();
    if (kind === 'petals') {
      g.ellipse(x, y, 3.2, 2.2, rng.range(0, 3), 0, Math.PI * 2);
    } else {
      g.ellipse(x, y, rng.range(3, 8), rng.range(2, 5), rng.range(0, 3), 0, Math.PI * 2);
    }
    g.fill();
  }
  return c;
}
