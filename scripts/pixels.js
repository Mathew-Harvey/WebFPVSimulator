/*
 * pixels.js: measure patches of a captured frame.
 *
 * Value band arguments cannot be settled by looking. "The gate ring is the
 * same value as the grass behind it" is a number, and a reviewer produced
 * that number before this project could. This decodes a PNG with zlib and
 * prints the mean colour and relative luminance of named rectangles, so a
 * claim about the frame can be checked rather than asserted.
 *
 * Usage:
 *   node scripts/pixels.js FRAME.png name=x,y,w,h [name=x,y,w,h ...]
 *
 * Luminance is Rec. 709 on linearised sRGB, the same quantity a bloom
 * high pass filter thresholds on, so the numbers here are comparable with
 * the bloom threshold in src/render/post.js.
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

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/* Minimal decoder: 8 bit RGB or RGBA, no interlace, which is what
 * Chromium's Page.captureScreenshot produces. */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error('not a PNG');
  }
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  let bitDepth = 8;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) {
        throw new Error('interlaced PNG not supported');
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG: depth ${bitDepth} colour type ${colorType}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[p];
    p += 1;
    const line = raw.subarray(p, p + stride);
    p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      const x = line[i];
      let v;
      if (filter === 0) {
        v = x;
      } else if (filter === 1) {
        v = x + a;
      } else if (filter === 2) {
        v = x + b;
      } else if (filter === 3) {
        v = x + ((a + b) >> 1);
      } else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        const pred = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
        v = x + pred;
      } else {
        throw new Error(`bad PNG filter ${filter}`);
      }
      cur[i] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

function toLinear(u) {
  const c = u / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: node scripts/pixels.js FRAME.png name=x,y,w,h [...]');
  console.error('       node scripts/pixels.js FRAME.png name=walk:x,y,dx,dy,n');
  process.exit(2);
}
const img = decodePng(readFileSync(args[0]));
console.log(`${args[0]} ${img.width} by ${img.height}`);

function lumAt(x, y) {
  const i = y * img.width * img.channels + x * img.channels;
  return 0.2126 * toLinear(img.data[i])
    + 0.7152 * toLinear(img.data[i + 1])
    + 0.0722 * toLinear(img.data[i + 2]);
}

/*
 * walk: single pixel luminances along a line, which is how G4's "a
 * reviewer walking any edge must find a real coverage pixel" is settled.
 * An aliased edge steps from one value to the other in one pixel. An
 * antialiased one puts at least one intermediate value between them, and
 * the intermediate has to be a real blend rather than bloom bleed, so the
 * run is printed rather than summarised.
 */
for (const spec of args.slice(1)) {
  const [name, rect] = spec.split('=');
  if (rect.startsWith('walk:')) {
    const [x, y, dx, dy, n] = rect.slice(5).split(',').map(Number);
    const vals = [];
    for (let i = 0; i < n; i += 1) {
      const xx = x + dx * i;
      const yy = y + dy * i;
      if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) {
        break;
      }
      vals.push(lumAt(xx, yy).toFixed(3));
    }
    console.log(`${name.padEnd(16)} walk ${x},${y} step ${dx},${dy}: ${vals.join(' ')}`);
    continue;
  }
  const [x, y, w, h] = rect.split(',').map(Number);
  let r = 0;
  let g = 0;
  let b = 0;
  let lum = 0;
  let n = 0;
  for (let yy = y; yy < Math.min(y + h, img.height); yy += 1) {
    for (let xx = x; xx < Math.min(x + w, img.width); xx += 1) {
      const i = yy * img.width * img.channels + xx * img.channels;
      r += img.data[i];
      g += img.data[i + 1];
      b += img.data[i + 2];
      lum += 0.2126 * toLinear(img.data[i])
        + 0.7152 * toLinear(img.data[i + 1])
        + 0.0722 * toLinear(img.data[i + 2]);
      n += 1;
    }
  }
  console.log(
    `${name.padEnd(16)} rgb ${(r / n).toFixed(0).padStart(3)} ${(g / n).toFixed(0).padStart(3)} ${(b / n).toFixed(0).padStart(3)}` +
    `   linear luminance ${(lum / n).toFixed(3)}   ${n} pixels`,
  );
}
