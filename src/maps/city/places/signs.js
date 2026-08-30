/*
 * signs.js: the lettering for the two places, drawn with Canvas2D at build
 * time like every other sign in this town.
 *
 * WHY NOT ./vendored/core/textures.js. That file is Kenton Wang's, MIT, and
 * it is one of the two vendored files this project has had to touch. Adding
 * a hundred and thirty first texture maker to it would put our lettering in
 * his file for no reason: nothing here is shared with the town. So the six
 * helpers at the top are a deliberate re-statement of his, the same shape and
 * the same font stack, and this file is ours.
 *
 * THE TYPE IS THE HALF THAT SELLS IT. A derelict works and a municipal pool
 * are both entirely ordinary buildings; what makes each one a PLACE is the
 * name board on it, the hours notice beside the ticket window and the
 * KEEP OUT plate wired to the gate. Everything here is set in the same
 * gothic the town uses, and everything is drawn flat and low frequency:
 * crisp shapes and type, never photographic noise.
 *
 * WEATHERING IS SUBTRACTIVE. The works signs are not drawn dirty, they are
 * drawn clean and then have paint taken off them: `flake` punches
 * background coloured bites out of the letterforms, `streak` runs rust down
 * from the fixings. That is what a steel sign that has stood outside for
 * twenty years actually looks like, and it survives the ink pass, which
 * would turn any airbrushed grime into mush.
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

import * as THREE from 'three';

const JP = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'MS Gothic', 'Hiragino Kaku Gothic ProN', sans-serif`;
const cache = new Map();

function make(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = true;
  draw(c, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/*
 * Cached by key, and the cache is deliberately never cleared.
 *
 * A CanvasTexture keeps its canvas, so `dispose()` frees the GPU copy and
 * leaves the source: re-entering the city re-uploads rather than re-draws.
 * That is exactly how ./vendored/core/textures.js behaves and the two must
 * behave the same, because `disposeSceneGraph` walks the scene and frees
 * every texture it finds without knowing which module made it.
 */
function cached(key, fn) {
  if (!cache.has(key)) {
    cache.set(key, fn());
  }
  return cache.get(key);
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function fit(c, text, maxW, size, weight = 'bold') {
  let s = size;
  do {
    c.font = `${weight} ${s}px ${JP}`;
    if (c.measureText(text).width <= maxW) {
      break;
    }
    s -= 2;
  } while (s > 6);
  return s;
}

function centred(c, text, x, y, maxW, size, colour, weight = 'bold', spacing = 0) {
  fit(c, text, maxW - spacing * [...text].length, size, weight);
  c.fillStyle = colour;
  c.textBaseline = 'middle';
  if (!spacing) {
    c.textAlign = 'center';
    c.fillText(text, x, y);
    return;
  }
  c.textAlign = 'left';
  const chars = [...text];
  const total = chars.reduce((a, ch) => a + c.measureText(ch).width + spacing, -spacing);
  let cx = x - total / 2;
  for (const ch of chars) {
    c.fillText(ch, cx, y);
    cx += c.measureText(ch).width + spacing;
  }
}

function vertical(c, text, x, y0, step, size, colour) {
  c.font = `bold ${size}px ${JP}`;
  c.fillStyle = colour;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  [...text].forEach((ch, i) => c.fillText(ch, x, y0 + i * step));
}

/* Deterministic noise. Every sign has to come out the same on every load and
 * in Node, so nothing here calls Math.random: this is the same 32 bit
 * multiplicative hash the town's thinning uses. */
function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Bite paint off, in the ground colour, so the letterform breaks up. */
function flake(c, w, h, ground, n, seed, scale = 1) {
  const r = rnd(seed);
  c.fillStyle = ground;
  for (let i = 0; i < n; i += 1) {
    const x = r() * w;
    const y = r() * h;
    const a = (3 + r() * 11) * scale;
    const b = (2 + r() * 7) * scale;
    c.beginPath();
    c.ellipse(x, y, a, b, r() * 3, 0, 6.3);
    c.fill();
  }
}

/** Rust running down from a fixing. */
function streak(c, x, y, len, wide, colour, seed) {
  const r = rnd(seed);
  c.fillStyle = colour;
  let cx = x;
  for (let t = 0; t < len; t += 3) {
    cx += (r() - 0.5) * 1.2;
    const wdt = wide * (1 - t / len) + 1;
    c.globalAlpha = 0.30 + 0.28 * (1 - t / len);
    c.fillRect(cx - wdt / 2, y + t, wdt, 3.4);
  }
  c.globalAlpha = 1;
}

/* ------------------------------------------------------------------ *
 * ひばり台市民プール
 * ------------------------------------------------------------------ */

/** The name board over the entrance. Enamelled steel, municipal blue. */
export const poolName = () => cached('poolName', () => make(1024, 224, (c, w, h) => {
  c.fillStyle = '#f4f1e8';
  c.fillRect(0, 0, w, h);
  c.fillStyle = hex(0x2a4f97);
  c.fillRect(0, 0, w, 14);
  c.fillRect(0, h - 14, w, 14);
  centred(c, 'ひばり台市民プール', w * 0.5, h * 0.42, w * 0.86, 116, '#22437f', 'bold', 10);
  c.font = `600 34px ${JP}`;
  c.fillStyle = '#8e94a4';
  c.textAlign = 'center';
  c.fillText('HIBARIDAI  MUNICIPAL  POOL', w * 0.5, h * 0.79);
}));

/** The hours plate beside the ticket window. */
export const poolHours = () => cached('poolHours', () => make(448, 576, (c, w, h) => {
  c.fillStyle = '#fbf8f0';
  c.fillRect(0, 0, w, h);
  c.strokeStyle = '#b8b2c2';
  c.lineWidth = 6;
  c.strokeRect(10, 10, w - 20, h - 20);
  c.fillStyle = hex(0x2a4f97);
  c.fillRect(10, 10, w - 20, 84);
  centred(c, '開場のご案内', w / 2, 52, w - 60, 52, '#fbf8f0');
  c.textAlign = 'left';
  c.font = `bold 40px ${JP}`;
  c.fillStyle = '#3c3a46';
  c.fillText('屋外プール', 42, 156);
  c.font = `500 38px ${JP}`;
  c.fillStyle = '#6a6578';
  c.fillText('７月１日 〜 ８月３１日', 42, 208);
  c.fillText('９:００ 〜 １７:００', 42, 254);
  c.font = `bold 40px ${JP}`;
  c.fillStyle = '#3c3a46';
  c.fillText('屋内プール', 42, 330);
  c.font = `500 38px ${JP}`;
  c.fillStyle = '#6a6578';
  c.fillText('通年 １０:００ 〜 ２０:００', 42, 382);
  c.fillText('水曜休館', 42, 428);
  c.fillStyle = hex(0xe0453f);
  c.fillRect(42, 470, w - 84, 5);
  c.font = `bold 34px ${JP}`;
  c.fillStyle = hex(0xb5322f);
  c.fillText('屋外プールは清掃中です', 42, 518);
}));

/** The rules board on the deck fence. */
export const poolRules = () => cached('poolRules', () => make(448, 448, (c, w, h) => {
  c.fillStyle = '#fdfbf5';
  c.fillRect(0, 0, w, h);
  c.strokeStyle = '#c8c2d0';
  c.lineWidth = 5;
  c.strokeRect(8, 8, w - 16, h - 16);
  c.fillStyle = hex(0xe0453f);
  c.fillRect(8, 8, w - 16, 70);
  centred(c, 'おねがい', w / 2, 44, w - 60, 46, '#fdfbf5');
  const lines = ['シャワーをあびてから', 'とびこみ きんし', 'かけっこ きんし', 'たべものは持ちこまない'];
  c.textAlign = 'left';
  lines.forEach((t, i) => {
    const y = 132 + i * 66;
    c.fillStyle = hex(0x2a4f97);
    c.beginPath();
    c.arc(52, y - 10, 13, 0, 6.3);
    c.fill();
    c.font = `600 34px ${JP}`;
    c.fillStyle = '#3c3a46';
    c.fillText(t, 82, y - 8);
  });
}));

/** 水深 plate, set into the coping. Two variants, shallow and deep. */
export const poolDepth = (deep = false) => cached(`poolDepth${deep ? 1 : 0}`, () => make(256, 128, (c, w, h) => {
  c.fillStyle = '#eef2f0';
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#2f2c3d';
  c.fillRect(0, h - 8, w, 8);
  centred(c, deep ? '水深 2.5m' : '水深 1.0m', w / 2, h * 0.46, w - 24, 62, '#2f3a4a');
}));

/* ------------------------------------------------------------------ *
 * 旧 ひばり製作所
 * ------------------------------------------------------------------ */

/** The works name board on the office. Painted steel, twenty years out. */
export const worksName = () => cached('worksName', () => make(1024, 256, (c, w, h) => {
  const ground = '#c6c0b4';
  c.fillStyle = ground;
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#a8a294';
  c.fillRect(0, h - 20, w, 20);
  centred(c, 'ひばり製作所', w * 0.46, h * 0.46, w * 0.62, 138, '#33507a', 'bold', 12);
  c.font = `600 40px ${JP}`;
  c.fillStyle = '#7c7668';
  c.textAlign = 'left';
  c.fillText('HIBARI  SEISAKUSHO', w * 0.74, h * 0.38);
  c.font = `500 32px ${JP}`;
  c.fillText('精密機械部品', w * 0.74, h * 0.66);
  /* The paint goes, and the fixings run. Four bolts across the top, which is
   * where the water gets in first. */
  flake(c, w, h, ground, 210, 4021, 1.15);
  for (const bx of [96, 372, 648, 924]) {
    c.fillStyle = '#7d6a58';
    c.beginPath();
    c.arc(bx, 26, 9, 0, 6.3);
    c.fill();
    streak(c, bx, 34, 150, 13, '#8a5c46', 4200 + bx);
  }
}));

/** 立入禁止 -- the plate wired to the gate. */
export const keepOut = () => cached('keepOut', () => make(384, 512, (c, w, h) => {
  const ground = '#f0ece0';
  c.fillStyle = ground;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = hex(0xb5322f);
  c.lineWidth = 12;
  c.strokeRect(16, 16, w - 32, h - 32);
  vertical(c, '立入禁止', w / 2, 118, 96, 82, hex(0xb5322f));
  c.font = `600 30px ${JP}`;
  c.fillStyle = '#5a5568';
  c.textAlign = 'center';
  c.fillText('関係者以外', w / 2, h - 96);
  c.fillText('野葉市', w / 2, h - 52);
  flake(c, w, h, ground, 90, 771, 0.9);
  streak(c, 78, 30, 200, 10, '#8a5c46', 883);
  streak(c, 306, 30, 240, 11, '#8a5c46', 991);
}));

/** 安全第一 -- the shed's safety board, most of the paint gone. */
export const safetyFirst = () => cached('safetyFirst', () => make(512, 256, (c, w, h) => {
  const ground = '#d8d2c2';
  c.fillStyle = ground;
  c.fillRect(0, 0, w, h);
  c.fillStyle = hex(0x2f9c9a);
  c.beginPath();
  c.moveTo(w / 2, 30);
  c.lineTo(w / 2 + 60, 90);
  c.lineTo(w / 2, 150);
  c.lineTo(w / 2 - 60, 90);
  c.closePath();
  c.fill();
  c.fillStyle = ground;
  c.beginPath();
  c.arc(w / 2, 90, 26, 0, 6.3);
  c.fill();
  centred(c, '安全第一', w / 2, 200, w - 80, 74, '#3f5a55', 'bold', 8);
  flake(c, w, h, ground, 190, 5510, 1.1);
}));

/** The demolition notice cable-tied to the fence. */
export const worksNotice = () => cached('worksNotice', () => make(384, 512, (c, w, h) => {
  c.fillStyle = '#f6f2e6';
  c.fillRect(0, 0, w, h);
  c.strokeStyle = '#a8a2b0';
  c.lineWidth = 5;
  c.strokeRect(12, 12, w - 24, h - 24);
  c.fillStyle = '#3c3a46';
  c.fillRect(12, 12, w - 24, 62);
  centred(c, 'お知らせ', w / 2, 42, w - 60, 42, '#f6f2e6');
  c.textAlign = 'left';
  c.font = `600 30px ${JP}`;
  c.fillStyle = '#4a4658';
  const lines = ['この建物は老朽化のため', '解体工事を予定して', 'おります。', '', '工事期間', '未定', '', '野葉市 建築指導課'];
  lines.forEach((t, i) => c.fillText(t, 36, 122 + i * 44));
  /* Rained on, curled at the bottom corner. One pale wedge does it. */
  c.fillStyle = 'rgba(180,176,192,0.55)';
  c.beginPath();
  c.moveTo(w - 12, h - 96);
  c.lineTo(w - 12, h - 12);
  c.lineTo(w - 108, h - 12);
  c.closePath();
  c.fill();
}));

/** The bay numbers stencilled on the shed floor, 1 to 4. */
export const bayDigit = (n = 1) => cached(`bayDigit${n}`, () => make(256, 256, (c, w, h) => {
  c.clearRect(0, 0, w, h);
  c.font = `bold 190px ${JP}`;
  c.fillStyle = 'rgba(70,66,84,0.62)';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(n), w / 2, h * 0.54);
  /* Worn through rather than painted over: the stencil is on a floor that
   * has been swept for forty years, so the bites have to REMOVE paint. On an
   * opaque sign `flake` fills in the ground colour; here there is no ground,
   * so the same shapes are punched out of the alpha instead. */
  c.globalCompositeOperation = 'destination-out';
  flake(c, w, h, '#000000', 46, 900 + n, 1.4);
  c.globalCompositeOperation = 'source-over';
}));
