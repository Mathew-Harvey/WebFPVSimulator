/*
 * signs.js: every painted sign in Sunnyfield on one picture, and the one
 * mesh that shows them. A shop's fascia, a street name blade, a stop sign,
 * the plant's name on the turbine hall: each is a quad on a cell of one
 * canvas, so a hundred and more signs cost one draw call and one texture.
 *
 * Every word is the town's own. No sign names or quotes anybody's show,
 * film or brand: a corner store, a tavern, a donut shop, a burger barn, a
 * bowling alley and a power plant are what any small town has, and the
 * names are puns of our own (see ../../../PROGRESS.md, 2026-10-28).
 *
 * The painting is the browser's: a canvas, its 2D context and its fonts.
 * What is painted is a picture and reaches no physics, so a font that
 * differs a little between machines changes nothing a pilot hits.
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

import { worldAt } from './frame.js';

const INK = '#1d1b26';
const CREAM = '#fbf8f0';
const HEAVY = '900 {px}px "Arial Black", "Helvetica Neue", Arial, sans-serif';
const BOLD = '700 {px}px "Helvetica Neue", Arial, sans-serif';

/* The atlas is this wide; a cell is this many pixels high unless its key
 * says otherwise, and as wide as its first use's aspect makes it. */
const ATLAS_W = 1024;
const CELL_H = 64;
const PAD = 3;

/* ---- the painter's hand ---- */

function font(g, face, px) {
  g.font = face.replace('{px}', String(Math.round(px)));
}

/* Words centred at (x, y), shrunk until they fit maxW. */
function words(g, text, x, y, maxW, px, colour, face = HEAVY) {
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

/* Words with an ink outline, a comic's lettering. */
function lettered(g, text, x, y, maxW, px, colour, line = INK, face = HEAVY) {
  let size = px;
  font(g, face, size);
  while (size > 6 && g.measureText(text).width > maxW) {
    size -= 1;
    font(g, face, size);
  }
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

/* A shop's fascia: a board in its colour, the name lettered across it. */
const fascia = (bg, fg, text, sub = null, line = INK) => (g, w, h) => {
  panel(g, w, h, bg, INK, 4, 4);
  if (sub) {
    lettered(g, text, w / 2, h * 0.42, w * 0.9, h * 0.56, fg, line);
    words(g, sub, w / 2, h * 0.82, w * 0.8, h * 0.2, fg, BOLD);
  } else {
    lettered(g, text, w / 2, h / 2 + 1, w * 0.92, h * 0.64, fg, line);
  }
};

/* A neon sign: a dark plate and glowing tubes of words. */
const neon = (text, colour) => (g, w, h) => {
  panel(g, w, h, '#221f2c', '#0e0d14', 8, 3);
  g.shadowColor = colour;
  g.shadowBlur = h * 0.18;
  words(g, text, w / 2, h / 2, w * 0.84, h * 0.6, colour, BOLD);
  g.shadowBlur = 0;
  words(g, text, w / 2, h / 2, w * 0.84, h * 0.6, '#fff6fb', BOLD);
};

/* A street name blade, green with a white rule. */
const blade = (text) => (g, w, h) => {
  panel(g, w, h, '#2f7a4a', CREAM, 4, 3);
  words(g, text, w / 2, h / 2 + 1, w * 0.86, h * 0.7, CREAM, BOLD);
};

const lamp = (colour) => (g, w, h) => {
  g.fillStyle = INK;
  g.fillRect(0, 0, w, h);
  disc(g, w / 2, h / 2, w * 0.42, colour);
  disc(g, w * 0.42, h * 0.4, w * 0.12, 'rgba(255,255,255,0.6)');
};

/* ---- the signs ---- */

const SIGNS = {
  stop: { h: 64, paint: (g, w, h) => {
    const r = w / 2 - 2;
    g.beginPath();
    for (let k = 0; k < 8; k += 1) {
      const a = Math.PI / 8 + (k * Math.PI) / 4;
      g.lineTo(w / 2 + r * Math.cos(a), h / 2 + r * Math.sin(a));
    }
    g.closePath();
    g.fillStyle = CREAM;
    g.fill();
    g.beginPath();
    for (let k = 0; k < 8; k += 1) {
      const a = Math.PI / 8 + (k * Math.PI) / 4;
      g.lineTo(w / 2 + (r - 4) * Math.cos(a), h / 2 + (r - 4) * Math.sin(a));
    }
    g.closePath();
    g.fillStyle = '#d33a32';
    g.fill();
    words(g, 'STOP', w / 2, h / 2 + 1, w * 0.74, h * 0.34, CREAM, HEAVY);
  } },
  stMain: { h: 32, paint: blade('MAIN ST') },
  stOak: { h: 32, paint: blade('OAK ST') },
  stPine: { h: 32, paint: blade('PINE ST') },
  stMill: { h: 32, paint: blade('MILL RD') },
  stPlant: { h: 32, paint: blade('PLANT RD') },
  stMaple: { h: 32, paint: blade('MAPLE AVE') },
  stBirch: { h: 32, paint: blade('BIRCH LN') },
  lampRed: { h: 16, paint: lamp('#ff4a3a') },
  lampAmber: { h: 16, paint: lamp('#5a4a2a') },
  lampGreen: { h: 16, paint: lamp('#2f5a3a') },
  busStop: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, CREAM, INK, 4, 3);
    g.fillStyle = '#2f4a7c';
    g.fillRect(4, 4, w - 8, h * 0.34);
    words(g, 'BUS STOP', w / 2, h * 0.2, w * 0.8, h * 0.26, CREAM);
    for (let k = 0; k < 4; k += 1) {
      g.fillStyle = '#8a8698';
      g.fillRect(w * 0.12, h * (0.48 + k * 0.12), w * (0.5 + 0.2 * ((k * 7) % 3) / 2), 3);
    }
  } },
  busFlag: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#2f4a7c', CREAM, 3, 3);
    words(g, 'BUS', w / 2, h * 0.36, w * 0.8, h * 0.3, CREAM);
    words(g, '7', w / 2, h * 0.72, w * 0.6, h * 0.34, '#f6c431');
  } },
  tuckShop: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#f08a34', INK, 4, 4);
    g.fillStyle = '#2fa4a0';
    g.fillRect(4, h * 0.72, w - 8, h * 0.24);
    lettered(g, 'TUCK SHOP', w * 0.42, h * 0.4, w * 0.62, h * 0.56, CREAM);
    disc(g, w * 0.86, h * 0.42, h * 0.36, '#e0483a', INK, 3);
    words(g, '24', w * 0.86, h * 0.44, h * 0.5, h * 0.4, CREAM);
    words(g, 'OPEN ALL NIGHT', w / 2, h * 0.84, w * 0.6, h * 0.17, CREAM, BOLD);
  } },
  ice: { h: 32, paint: (g, w, h) => {
    panel(g, w, h, '#9fcbea', CREAM, 3, 3);
    lettered(g, 'ICE', w / 2, h / 2, w * 0.8, h * 0.7, CREAM, '#2f4a7c');
  } },
  frosty: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#e0483a', CREAM, 4, 3);
    g.fillStyle = '#7d5bb4';
    g.beginPath();
    g.moveTo(w * 0.3, h * 0.3);
    g.lineTo(w * 0.7, h * 0.3);
    g.lineTo(w * 0.62, h * 0.82);
    g.lineTo(w * 0.38, h * 0.82);
    g.closePath();
    g.fill();
    disc(g, w / 2, h * 0.3, w * 0.22, '#f39ac0');
    words(g, 'FROSTY', w / 2, h * 0.12, w * 0.9, h * 0.15, CREAM);
  } },
  open24: { h: 40, paint: neon('OPEN 24', '#ff5aa0') },
  lotto: { h: 44, paint: (g, w, h) => {
    panel(g, w, h, '#f6c431', INK, 6, 3);
    lettered(g, 'LUCKY 7', w / 2, h / 2, w * 0.86, h * 0.5, '#e0483a', CREAM);
  } },
  tavern: { paint: fascia('#2c2a33', '#f6c431', 'CORNER TAVERN', 'COLD ONES · POOL · DARTS', '#000') },
  neonBar: { h: 48, paint: neon('BAR', '#5ad8ff') },
  tavernHang: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#a87a52', INK, 30, 4);
    g.fillStyle = '#f6c431';
    g.beginPath();
    for (let k = 0; k < 10; k += 1) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? w * 0.14 : w * 0.32;
      g.lineTo(w / 2 + r * Math.cos(a), h / 2 + r * Math.sin(a));
    }
    g.closePath();
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
  } },
  suds: { paint: fascia('#2f4a7c', CREAM, 'SUDS LAUNDRY', 'WASH · DRY · FOLD') },
  barber: { paint: fascia('#e0483a', CREAM, 'BARBER', 'CUTS & SHAVES') },
  hardware: { paint: fascia('#3f8a52', CREAM, 'HARDWARE', 'NUTS · BOLTS · PAINT · LADDERS') },
  gasCanopy: { h: 32, paint: (g, w, h) => {
    g.fillStyle = '#e0483a';
    g.fillRect(0, 0, w, h);
    words(g, 'SUNNY GAS', w / 2, h / 2 + 1, w * 0.4, h * 0.8, CREAM);
  } },
  pump: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, CREAM, INK, 3, 3);
    g.fillStyle = '#1d1b26';
    g.fillRect(w * 0.15, h * 0.12, w * 0.7, h * 0.24);
    words(g, '0.000', w / 2, h * 0.24, w * 0.6, h * 0.17, '#9cf04a', BOLD);
    disc(g, w / 2, h * 0.64, w * 0.2, '#f6c431', INK, 2);
  } },
  gasShop: { h: 32, paint: (g, w, h) => {
    g.fillStyle = '#e0483a';
    g.fillRect(0, 0, w, h);
    words(g, 'SNACKS · DRINKS · ICE · MAPS', w / 2, h / 2 + 1, w * 0.9, h * 0.7, CREAM, BOLD);
  } },
  gasPrice: { h: 128, paint: (g, w, h) => {
    panel(g, w, h, CREAM, INK, 6, 4);
    g.fillStyle = '#e0483a';
    g.fillRect(4, 4, w - 8, h * 0.32);
    disc(g, w * 0.22, h * 0.18, h * 0.1, '#f6c431');
    lettered(g, 'SUNNY', w * 0.6, h * 0.18, w * 0.6, h * 0.2, CREAM);
    for (const [k, label, price] of [[0, 'REG', '3.19'], [1, 'PLUS', '3.39'], [2, 'SUPER', '3.59']]) {
      const y = h * (0.47 + k * 0.18);
      words(g, label, w * 0.24, y, w * 0.34, h * 0.09, INK, BOLD);
      g.fillStyle = INK;
      g.fillRect(w * 0.44, y - h * 0.075, w * 0.5, h * 0.15);
      words(g, price, w * 0.69, y, w * 0.46, h * 0.12, '#ff6a3a', BOLD);
    }
  } },
  donuts: { paint: (g, w, h) => {
    panel(g, w, h, CREAM, INK, 4, 4);
    lettered(g, 'HOLE LOTTA', w * 0.32, h * 0.5, w * 0.48, h * 0.42, '#f39ac0');
    lettered(g, 'DONUTS', w * 0.76, h * 0.5, w * 0.4, h * 0.6, '#d8954e');
  } },
  coffee: { h: 48, paint: (g, w, h) => {
    panel(g, w, h, '#7c5844', CREAM, 6, 3);
    words(g, 'HOT', w / 2, h * 0.32, w * 0.8, h * 0.3, '#f6c431');
    words(g, 'COFFEE', w / 2, h * 0.68, w * 0.84, h * 0.3, CREAM);
  } },
  dozen: { h: 48, paint: (g, w, h) => {
    panel(g, w, h, '#f39ac0', INK, 6, 3);
    words(g, 'BAKER’S', w / 2, h * 0.32, w * 0.84, h * 0.26, INK, BOLD);
    words(g, 'DOZEN 13', w / 2, h * 0.7, w * 0.86, h * 0.3, CREAM);
  } },
  burger: { paint: fascia('#f6c431', '#e0483a', 'BURGER BARN', 'FLAME GRILLED · DRIVE THRU', CREAM) },
  barnX: { h: 64, paint: (g, w, h) => {
    g.fillStyle = '#b8504a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = CREAM;
    g.lineWidth = h * 0.1;
    g.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
    for (const s of [0, 1]) {
      const x0 = s ? w / 2 : 0;
      g.beginPath();
      g.moveTo(x0 + h * 0.08, h * 0.08);
      g.lineTo(x0 + w / 2 - h * 0.08, h - h * 0.08);
      g.moveTo(x0 + w / 2 - h * 0.08, h * 0.08);
      g.lineTo(x0 + h * 0.08, h - h * 0.08);
      g.stroke();
    }
  } },
  pizza: { paint: fascia('#3f8a52', CREAM, 'PIZZA PIE', 'BY THE SLICE', '#b8504a') },
  flag: { h: 48, paint: (g, w, h) => {
    g.fillStyle = '#48b4e8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = CREAM;
    g.fillRect(0, h * 0.78, w, h * 0.22);
    disc(g, w * 0.5, h * 0.45, h * 0.24, '#f6c431', INK, 2);
    g.strokeStyle = '#f6c431';
    g.lineWidth = 3;
    for (let k = 0; k < 8; k += 1) {
      const a = (k * Math.PI) / 4;
      g.beginPath();
      g.moveTo(w * 0.5 + Math.cos(a) * h * 0.3, h * 0.45 + Math.sin(a) * h * 0.3);
      g.lineTo(w * 0.5 + Math.cos(a) * h * 0.4, h * 0.45 + Math.sin(a) * h * 0.4);
      g.stroke();
    }
  } },
  bowling: { paint: (g, w, h) => {
    panel(g, w, h, '#7d5bb4', INK, 4, 4);
    g.fillStyle = '#f6c431';
    for (let k = 0; k < 18; k += 1) {
      disc(g, (w * (k + 0.5)) / 18, h * 0.1, h * 0.04, k % 2 ? '#f6c431' : CREAM);
      disc(g, (w * (k + 0.5)) / 18, h * 0.9, h * 0.04, k % 2 ? CREAM : '#f6c431');
    }
    lettered(g, 'PIN PALACE LANES', w / 2, h * 0.52, w * 0.9, h * 0.6, CREAM, INK);
  } },
  townHall: { h: 48, paint: (g, w, h) => {
    g.fillStyle = '#b4aeb8';
    g.fillRect(0, 0, w, h);
    words(g, 'S U N N Y F I E L D   T O W N   H A L L', w / 2, h / 2 + 1, w * 0.94, h * 0.7, '#3b3e64', BOLD);
  } },
  clock: { h: 128, paint: (g, w, h) => {
    disc(g, w / 2, h / 2, w * 0.48, CREAM, INK, 5);
    g.strokeStyle = INK;
    for (let k = 0; k < 12; k += 1) {
      const a = (k * Math.PI) / 6;
      g.lineWidth = k % 3 ? 2 : 5;
      g.beginPath();
      g.moveTo(w / 2 + Math.cos(a) * w * 0.36, h / 2 + Math.sin(a) * w * 0.36);
      g.lineTo(w / 2 + Math.cos(a) * w * 0.43, h / 2 + Math.sin(a) * w * 0.43);
      g.stroke();
    }
    /* Ten past ten, as every clock in a picture is. */
    g.lineCap = 'round';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(w / 2, h / 2);
    g.lineTo(w / 2 - w * 0.17, h / 2 - w * 0.1);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(w / 2, h / 2);
    g.lineTo(w / 2 + w * 0.26, h / 2 - w * 0.15);
    g.stroke();
    disc(g, w / 2, h / 2, 5, INK);
  } },
  fireStation: { paint: fascia(CREAM, '#e0483a', 'FIRE STATION', 'ENGINE COMPANY No. 1') },
  fireBadge: { h: 64, paint: (g, w, h) => {
    g.fillStyle = '#e0483a';
    g.strokeStyle = '#f6c431';
    g.lineWidth = 3;
    g.beginPath();
    for (let k = 0; k < 4; k += 1) {
      const a = (k * Math.PI) / 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      g.moveTo(w / 2, h / 2);
      g.lineTo(w / 2 + (c * 0.46 - s * 0.2) * w, h / 2 + (s * 0.46 + c * 0.2) * h);
      g.lineTo(w / 2 + (c * 0.46 + s * 0.2) * w, h / 2 + (s * 0.46 - c * 0.2) * h);
      g.closePath();
    }
    g.fill();
    g.stroke();
    disc(g, w / 2, h / 2, w * 0.18, '#f6c431', INK, 2);
    words(g, '1', w / 2, h / 2 + 1, w * 0.2, h * 0.24, INK);
  } },
  school: { h: 48, paint: (g, w, h) => {
    panel(g, w, h, '#b0634c', CREAM, 3, 3);
    words(g, 'SUNNYFIELD ELEMENTARY', w / 2, h / 2 + 1, w * 0.92, h * 0.62, CREAM, BOLD);
  } },
  schoolBus: { h: 32, paint: (g, w, h) => {
    g.fillStyle = '#f6c431';
    g.fillRect(0, 0, w, h);
    words(g, 'SCHOOL BUS', w / 2, h / 2 + 1, w * 0.7, h * 0.86, INK, HEAVY);
  } },
  churchSign: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, CREAM, INK, 3, 3);
    g.fillStyle = INK;
    for (let k = 0; k < 3; k += 1) {
      g.fillRect(6, h * (0.08 + k * 0.31) + h * 0.22, w - 12, 1);
    }
    words(g, 'SUNDAY 10 AM', w / 2, h * 0.2, w * 0.88, h * 0.2, INK, BOLD);
    words(g, 'ALL WELCOME', w / 2, h * 0.5, w * 0.88, h * 0.2, INK, BOLD);
    words(g, 'NO DRONES IN THE BELFRY', w / 2, h * 0.8, w * 0.92, h * 0.18, '#b0634c', BOLD);
  } },
  plantGate: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#2f4a7c', CREAM, 4, 3);
    lettered(g, 'GLOW VALLEY POWER', w / 2, h * 0.42, w * 0.9, h * 0.5, '#f2c12e', INK);
    words(g, 'AUTHORISED VEHICLES ONLY', w / 2, h * 0.82, w * 0.7, h * 0.2, CREAM, BOLD);
  } },
  mishap: { h: 128, paint: (g, w, h) => {
    panel(g, w, h, CREAM, '#2f4a7c', 4, 6);
    words(g, 'THIS PLANT HAS GONE', w / 2, h * 0.16, w * 0.9, h * 0.11, '#2f4a7c', BOLD);
    g.fillStyle = INK;
    g.fillRect(w * 0.36, h * 0.27, w * 0.28, h * 0.42);
    words(g, '0', w / 2, h * 0.49, w * 0.24, h * 0.38, '#9cf04a', HEAVY);
    words(g, 'DAYS WITHOUT A MISHAP', w / 2, h * 0.84, w * 0.9, h * 0.11, '#e0483a', BOLD);
  } },
  plantName: { h: 64, paint: (g, w, h) => {
    g.fillStyle = '#c9ccd4';
    g.fillRect(0, 0, w, h);
    lettered(g, 'GLOW VALLEY POWER PLANT', w / 2, h / 2 + 1, w * 0.94, h * 0.74, '#2f4a7c', CREAM);
  } },
  control: { h: 32, paint: (g, w, h) => {
    g.fillStyle = '#f2c12e';
    g.fillRect(0, 0, w, h);
    words(g, 'CONTROL ROOM  ·  KEEP DOOR SHUT', w / 2, h / 2 + 1, w * 0.92, h * 0.7, INK, BOLD);
  } },
  trefoil: { h: 64, paint: (g, w, h) => {
    disc(g, w / 2, h / 2, w * 0.48, '#f2c12e', INK, 3);
    g.fillStyle = INK;
    for (let k = 0; k < 3; k += 1) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
      g.beginPath();
      g.moveTo(w / 2, h / 2);
      g.arc(w / 2, h / 2, w * 0.4, a - Math.PI / 6, a + Math.PI / 6);
      g.closePath();
      g.fill();
    }
    disc(g, w / 2, h / 2, w * 0.13, '#f2c12e');
    disc(g, w / 2, h / 2, w * 0.08, INK);
  } },
  hazardBarrels: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#f2c12e', INK, 3, 3);
    words(g, 'DO NOT DRINK', w / 2, h * 0.36, w * 0.86, h * 0.3, INK);
    words(g, 'FROM THE BARRELS', w / 2, h * 0.7, w * 0.86, h * 0.2, INK, BOLD);
  } },
  gorgeSign: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#f2c12e', INK, 3, 3);
    words(g, 'DANGER', w / 2, h * 0.3, w * 0.8, h * 0.34, '#e0483a');
    words(g, 'SUNNYFIELD GORGE', w / 2, h * 0.7, w * 0.88, h * 0.24, INK, BOLD);
  } },
  noJumping: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, CREAM, '#e0483a', 3, 5);
    words(g, 'NO JUMPING', w / 2, h * 0.36, w * 0.88, h * 0.32, '#e0483a');
    words(g, 'THIS MEANS YOU', w / 2, h * 0.72, w * 0.7, h * 0.2, INK, BOLD);
  } },
  mansionGate: { h: 48, paint: (g, w, h) => {
    panel(g, w, h, '#2c2a33', '#f6c431', 3, 3);
    words(g, 'PRIVATE ESTATE', w / 2, h / 2 + 1, w * 0.86, h * 0.56, '#f6c431', BOLD);
  } },
  keepOut: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, CREAM, INK, 3, 3);
    words(g, 'KEEP OUT', w / 2, h * 0.36, w * 0.86, h * 0.34, '#e0483a');
    words(g, 'BEWARE OF THE DOGS', w / 2, h * 0.72, w * 0.86, h * 0.2, INK, BOLD);
  } },
  dump: { h: 48, paint: (g, w, h) => {
    panel(g, w, h, '#a87a52', INK, 3, 3);
    lettered(g, 'SUNNYFIELD DUMP', w / 2, h / 2 + 1, w * 0.9, h * 0.62, CREAM, INK);
  } },
  park: { h: 64, paint: (g, w, h) => {
    panel(g, w, h, '#3f8a52', CREAM, 6, 3);
    words(g, 'SUNNYFIELD PARK', w / 2, h * 0.4, w * 0.9, h * 0.34, CREAM);
    words(g, 'NO FLYING AFTER DARK', w / 2, h * 0.76, w * 0.8, h * 0.2, '#f6c431', BOLD);
  } },
};

/* The keys a map may name, for a check that every sign it hangs is
 * painted. */
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
  /* Tallest first, so each row is filled by cells of its own height. */
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
 * Every sign as a quad on its cell, one mesh: positions in the world,
 * `lift` out from the face it is hung on, normals for the light.
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
  mesh.name = 'sunny signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
