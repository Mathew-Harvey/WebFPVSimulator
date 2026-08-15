/*
 * png.mjs: a minimal RGB PNG writer and a tiny 2D drawing surface, so a
 * track can be looked at rather than read off a table of numbers.
 *
 * This exists because judging "is this import right" from columns of
 * coordinates does not work. A plan view of the raw .trk beside a plan view
 * of the converted document settles an ordering or mirroring question in one
 * glance. It is a review tool: nothing in the simulator or the builder
 * imports it.
 *
 * No dependencies. PNG needs a zlib stream and node has one.
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

import { deflateSync } from 'node:zlib';

function crcTable() {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c;
  }
  return t;
}
const CRC = crcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/* A 5 by 7 bitmap font. Only the glyphs a track plan needs. */
const GLYPHS = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '01100', '11000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
  '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '#': ['01010', '11111', '01010', '01010', '01010', '11111', '01010'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
};

export class Surface {
  constructor(width, height, bg = [255, 255, 255]) {
    this.w = width;
    this.h = height;
    this.px = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i += 1) {
      this.px[i * 3] = bg[0];
      this.px[i * 3 + 1] = bg[1];
      this.px[i * 3 + 2] = bg[2];
    }
  }

  set(x, y, rgb, alpha = 1) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) {
      return;
    }
    const o = (iy * this.w + ix) * 3;
    for (let c = 0; c < 3; c += 1) {
      this.px[o + c] = Math.round(this.px[o + c] * (1 - alpha) + rgb[c] * alpha);
    }
  }

  dot(x, y, r, rgb) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (dx * dx + dy * dy <= r * r) {
          this.set(x + dx, y + dy, rgb);
        }
      }
    }
  }

  ring(x, y, r, rgb, thick = 1) {
    for (let a = 0; a < 360 * 4; a += 1) {
      const t = (a / 4) * Math.PI / 180;
      for (let k = 0; k < thick; k += 1) {
        this.set(x + Math.cos(t) * (r + k), y + Math.sin(t) * (r + k), rgb);
      }
    }
  }

  line(x0, y0, x1, y1, rgb, thick = 1, alpha = 1) {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    const half = (thick - 1) / 2;
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (let dy = -half; dy <= half; dy += 1) {
        for (let dx = -half; dx <= half; dx += 1) {
          this.set(x + dx, y + dy, rgb, alpha);
        }
      }
    }
  }

  dashed(x0, y0, x1, y1, rgb, dash = 6) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.round(len / dash));
    for (let i = 0; i < steps; i += 2) {
      const a = i / steps;
      const b = Math.min(1, (i + 1) / steps);
      this.line(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b, rgb);
    }
  }

  rect(x0, y0, x1, y1, rgb) {
    this.line(x0, y0, x1, y0, rgb);
    this.line(x1, y0, x1, y1, rgb);
    this.line(x1, y1, x0, y1, rgb);
    this.line(x0, y1, x0, y0, rgb);
  }

  text(x, y, s, rgb, scale = 1) {
    let cx = Math.round(x);
    for (const ch of String(s).toUpperCase()) {
      const g = GLYPHS[ch] || GLYPHS['?'];
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 5; c += 1) {
          if (g[r][c] === '1') {
            for (let sy = 0; sy < scale; sy += 1) {
              for (let sx = 0; sx < scale; sx += 1) {
                this.set(cx + c * scale + sx, y + r * scale + sy, rgb);
              }
            }
          }
        }
      }
      cx += 6 * scale;
    }
  }

  /* Text with a background halo, so a label stays readable over the line. */
  label(x, y, s, rgb, scale = 1, bg = [255, 255, 255]) {
    const w = String(s).length * 6 * scale;
    for (let dy = -2; dy < 7 * scale + 2; dy += 1) {
      for (let dx = -2; dx < w + 1; dx += 1) {
        this.set(x + dx, y + dy, bg, 0.82);
      }
    }
    this.text(x, y, s, rgb, scale);
  }

  toPng() {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y += 1) {
      raw[y * (this.w * 3 + 1)] = 0;
      this.px.copy(raw, y * (this.w * 3 + 1) + 1, y * this.w * 3, (y + 1) * this.w * 3);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}
