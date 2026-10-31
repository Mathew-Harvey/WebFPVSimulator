/*
 * signs.js: every painted plate on Kazesuna Dunes, on one canvas, so the
 * whole coast's lettering is one texture and one draw call
 * (./index.js signMesh). Render only: a sign is a picture and reaches no
 * physics, so the browser's own fonts paint it.
 *
 * The words are the place's own and nobody's brand: the dune centre's
 * name, the station's, the shops' wares (pears and sand, the coast's two
 * souvenirs), the camel rides, the lift, a swimming notice, the race's
 * numbers. Lettered the way the town letters its signs, a dark brush on a
 * pale board inside an inked border.
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

const JP = '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Noto Sans CJK JP", "WenQuanYi Zen Hei", sans-serif';
const INK = '#2c2a33';
const PAPER = '#f6f0e2';

function board(g, wd, ht, fill = PAPER, border = INK) {
  g.fillStyle = fill;
  g.fillRect(0, 0, wd, ht);
  g.strokeStyle = border;
  g.lineWidth = Math.max(3, ht * 0.06);
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, wd - g.lineWidth, ht - g.lineWidth);
}

function text(g, s, x, y, px, colour = INK, weight = '700', align = 'center') {
  g.font = `${weight} ${Math.round(px)}px ${JP}`;
  g.fillStyle = colour;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

/* Fit a line of text to a width, shrinking it if it is too long. */
function fit(g, s, x, y, px, maxW, colour, weight = '700') {
  g.font = `${weight} ${Math.round(px)}px ${JP}`;
  const m = g.measureText(s).width;
  text(g, s, x, y, m > maxW ? (px * maxW) / m : px, colour, weight);
}

const NOBORI = {
  nashi: { bg: '#c9473b', words: ['二十世紀梨', '名物'] },
  suna: { bg: '#2e4382', words: ['砂の土産', 'すな'] },
  omiyage: { bg: '#3f7a4a', words: ['おみやげ', 'らっきょう'] },
};
const SHOP = { nashi: '梨の店  PEARS', suna: '砂の店  SAND GIFTS', omiyage: 'おみやげ  SOUVENIRS' };

/* Each sign's painter: (g, wd, ht) on a cell of that size. */
function painter(key) {
  if (key.startsWith('gate:')) {
    const n = key.slice(5);
    return (g, wd, ht) => {
      board(g, wd, ht, '#f8f2e4');
      text(g, n, wd / 2, ht / 2 + 2, ht * 0.78, '#c9473b', '900');
    };
  }
  if (key.startsWith('shop:')) {
    const k = key.slice(5);
    return (g, wd, ht) => {
      board(g, wd, ht, '#2c2a33', '#e8b53a');
      fit(g, SHOP[k], wd / 2, ht / 2 + 2, ht * 0.62, wd * 0.9, '#f6f0e2');
    };
  }
  if (key.startsWith('nobori:')) {
    const [, k, side] = key.split(':');
    const n = NOBORI[k];
    const word = n.words[Number(side) % n.words.length];
    return (g, wd, ht) => {
      g.fillStyle = n.bg;
      g.fillRect(0, 0, wd, ht);
      g.fillStyle = '#f6f0e2';
      g.fillRect(0, 0, wd, ht * 0.06);
      g.fillRect(wd * 0.86, 0, wd * 0.14, ht);
      const chars = [...word];
      const step = (ht * 0.86) / Math.max(chars.length, 4);
      chars.forEach((c, i) => text(g, c, wd * 0.43, ht * 0.12 + step * (i + 0.5), Math.min(step * 0.92, wd * 0.72), '#f6f0e2', '900'));
    };
  }
  switch (key) {
    case 'centre':
      return (g, wd, ht) => {
        board(g, wd, ht, '#f8f2e4');
        fit(g, '風砂砂丘センター', wd * 0.33, ht / 2 + 2, ht * 0.66, wd * 0.6, INK, '900');
        fit(g, 'KAZESUNA DUNES', wd * 0.8, ht / 2 + 2, ht * 0.42, wd * 0.34, '#c9473b', '900');
      };
    case 'lookout':
      return (g, wd, ht) => {
        board(g, wd, ht);
        text(g, '展望台', wd / 2, ht * 0.38, ht * 0.42);
        text(g, 'LOOK OUT', wd / 2, ht * 0.78, ht * 0.22, '#3a6a8a');
      };
    case 'parking':
      return (g, wd, ht) => {
        board(g, wd, ht, '#2a5fa8', '#f6f0e2');
        text(g, 'P', wd / 2, ht / 2 + 4, ht * 0.8, '#f6f0e2', '900');
      };
    case 'station:door':
      return (g, wd, ht) => {
        board(g, wd, ht, '#f6f0e2');
        fit(g, '風砂駅  KAZESUNA STA.', wd / 2, ht / 2 + 2, ht * 0.6, wd * 0.9);
      };
    case 'station:name':
      return (g, wd, ht) => {
        board(g, wd, ht, '#ffffff');
        text(g, 'かざすな', wd / 2, ht * 0.34, ht * 0.4, INK, '900');
        g.fillStyle = '#2e7a4a';
        g.fillRect(wd * 0.04, ht * 0.62, wd * 0.92, ht * 0.08);
        text(g, 'KAZESUNA', wd / 2, ht * 0.53, ht * 0.13, '#555');
        text(g, '← はまかぜ', wd * 0.2, ht * 0.84, ht * 0.15, INK, '700');
        text(g, 'すなやま →', wd * 0.8, ht * 0.84, ht * 0.15, INK, '700');
      };
    case 'railcar':
      return (g, wd, ht) => {
        board(g, wd, ht, '#2c2a33', '#2c2a33');
        text(g, '普通  かざすな', wd / 2, ht / 2 + 2, ht * 0.6, '#ffd36a', '700');
      };
    case 'lift':
      return (g, wd, ht) => {
        board(g, wd, ht, '#f6f0e2');
        fit(g, 'リフト  CHAIR LIFT', wd / 2, ht / 2 + 2, ht * 0.56, wd * 0.9);
      };
    case 'kiosk':
      return (g, wd, ht) => {
        board(g, wd, ht, '#e8b53a');
        fit(g, 'きっぷ  TICKETS', wd / 2, ht / 2 + 2, ht * 0.6, wd * 0.9);
      };
    case 'camels':
      return (g, wd, ht) => {
        board(g, wd, ht, '#f6f0e2', '#8d653f');
        text(g, 'らくだ', wd * 0.3, ht * 0.5, ht * 0.56, '#8d653f', '900');
        fit(g, 'CAMEL RIDES', wd * 0.74, ht * 0.5, ht * 0.32, wd * 0.42, INK, '900');
      };
    case 'summit':
      return (g, wd, ht) => {
        board(g, wd, ht, '#d5ad7c', '#5f4333');
        const chars = [...'馬の背'];
        chars.forEach((c, i) => text(g, c, wd / 2, ht * (0.2 + i * 0.3), wd * 0.62, '#2c2a33', '900'));
      };
    case 'flag':
      return (g, wd, ht) => {
        g.fillStyle = '#e1473b';
        g.fillRect(0, 0, wd, ht / 2);
        g.fillStyle = '#f2c32d';
        g.fillRect(0, ht / 2, wd, ht / 2);
      };
    case 'lifeguard':
      return (g, wd, ht) => {
        board(g, wd, ht, '#e1473b', '#f6f0e2');
        fit(g, '監視所  LIFEGUARD', wd / 2, ht / 2 + 2, ht * 0.6, wd * 0.9, '#f6f0e2');
      };
    case 'swim':
      return (g, wd, ht) => {
        board(g, wd, ht, '#ffffff', '#c9473b');
        text(g, '遊泳注意', wd / 2, ht * 0.36, ht * 0.32, '#c9473b', '900');
        text(g, 'TAKE CARE IN THE SEA', wd / 2, ht * 0.74, ht * 0.13, INK, '700');
      };
    default:
      return null;
  }
}

/* Whether ./index.js can paint a sign, for scripts/dunes-check.js. */
export const signPainted = (key) => painter(key) !== null;

/*
 * The atlas: every distinct key once, at 80 pixels to the metre of its
 * board's height (48 to 160), packed in rows. Returns { canvas, cells, w, h },
 * cells[key] = { x, y, w, h } in pixels.
 */
export function paintSigns(signs) {
  const want = new Map();
  for (const s of signs) {
    if (!want.has(s.key)) {
      want.set(s.key, { aspect: s.w / s.h, metres: s.h });
    }
  }
  const W = 1024;
  const cells = {};
  let x = 0;
  let y = 0;
  let row = 0;
  const list = [...want.entries()].map(([key, { aspect, metres }]) => {
    const ht = Math.max(48, Math.min(160, Math.round(80 * metres)));
    const wd = Math.min(W, Math.max(16, Math.round(ht * aspect)));
    return { key, wd, ht: wd === W ? Math.round(W / aspect) : ht };
  });
  for (const c of list) {
    if (x + c.wd > W) {
      x = 0;
      y += row;
      row = 0;
    }
    cells[c.key] = { x, y, w: c.wd, h: c.ht };
    x += c.wd;
    row = Math.max(row, c.ht);
  }
  let H = 64;
  while (H < y + row) {
    H *= 2;
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  for (const [key, c] of Object.entries(cells)) {
    const paint = painter(key);
    if (!paint) {
      continue;
    }
    g.save();
    g.translate(c.x, c.y);
    g.beginPath();
    g.rect(0, 0, c.w, c.h);
    g.clip();
    paint(g, c.w, c.h);
    g.restore();
  }
  return { canvas, cells, w: W, h: H };
}
