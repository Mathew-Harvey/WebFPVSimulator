/*
 * gif.js: a GIF89a encoder, so a track can leave the builder as a file
 * somebody pastes into a group chat.
 *
 * WHY THIS IS HAND ROLLED. The format surface actually used here is small:
 * a header, one global colour table, a loop extension, and per frame a
 * graphic control extension, an image descriptor and an LZW stream. That is
 * a few hundred lines. The alternative is a dependency, and this project has
 * none at all, so the precedent is scripts/icons.js, which writes PNG and
 * ICO on node's own zlib rather than buying an image library. GIF cannot
 * borrow zlib: its compression is a variable width LZW of its own, which is
 * the one piece below that has to be got exactly right.
 *
 * WHY IT RUNS IN BOTH PLACES. No DOM, no Three, no node API. The builder
 * calls it in the browser to hand the pilot a file, and scripts/trackgif.js
 * reaches the same code through headless Chromium. One encoder, so a GIF
 * written by the button and a GIF written by the script cannot disagree.
 *
 * WHY NO DITHER, and this is a measured decision rather than a taste. The
 * reference animation was re-encoded at 512 by 512 both ways: undithered it
 * came to 3.43 MB, with Floyd-Steinberg it came to 14.04 MB. Dither noise
 * changes every pixel of every frame, so it destroys the frame to frame
 * coherence that the whole format depends on, and on flat shaded content it
 * looked worse as well, stippling across what should be flat colour. There
 * is therefore no dither option to get wrong.
 *
 * THE THREE THINGS THAT KEEP THE FILE SMALL, in the order they matter:
 * one palette for the whole animation rather than one per frame; disposal
 * method 1 with only the changed rectangle emitted, so a still background
 * is stored once; and a frame identical to the one before it folded into
 * its predecessor's delay rather than stored again.
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

/*
 * HISTOGRAM RESOLUTION. Six bits a channel, so 64 levels and 262144 bins.
 * Five bits is the usual choice and it is too coarse here: three quarters of
 * every frame of this animation is below luminance 40, so the darks are
 * where the palette has to be precise, and a five bit bin is eight levels
 * wide. Six bits costs 262144 counters and gives a bin two levels wide after
 * the weighted average below, which is under the eye's threshold on a
 * gradient.
 */
const HIST_BITS = 6;
const HIST_SIZE = 1 << (HIST_BITS * 3);
const HIST_SHIFT = 8 - HIST_BITS;

/*
 * NEAREST COLOUR CACHE. Without it every pixel of every frame would scan 256
 * palette entries, which at 512 by 512 by 300 frames is twenty billion
 * distance computations. Keyed on the cell rather than on the pixel, so the
 * answer does not depend on which pixel reached the cell first, which would
 * make the output depend on raster order.
 *
 * SIX BITS, MATCHING THE HISTOGRAM, and measured on the shape that matters.
 * On a dark radial light pool at 256 square, the floor this animation stands
 * on, the palette comes out with twelve entries for the gradient. A five bit
 * cache, eight levels wide, actually used seven of them and scored 35.5 dB.
 * A six bit cache used all twelve and scored 49.7 dB. The palette was never
 * the problem in either case: the lookup was discarding distinctions the
 * palette had already paid for.
 *
 * It costs bytes, 2575 against 4082 on that gradient tile, because more
 * levels in a smooth ramp is more for the compressor to say. That is the
 * right way round here. Banding in the light pool is the one quality risk
 * the 4 MB budget left open, the budget has headroom at 3.43 MB, and a
 * gradient is the worst case rather than the average frame.
 *
 * The rule this leaves behind: the cache must never be coarser than the
 * histogram, because a cell wider than a bin throws away exactly what the
 * bin width was chosen to keep.
 */
const CACHE_BITS = HIST_BITS;
const CACHE_SIZE = 1 << (CACHE_BITS * 3);

/* GIF's LZW, for a 256 entry table. */
const MIN_CODE_SIZE = 8;
const CLEAR_CODE = 1 << MIN_CODE_SIZE;
const END_CODE = CLEAR_CODE + 1;
const MAX_CODE = 4096;

/* A GIF delay is centiseconds in sixteen bits, so this is the ceiling a
 * coalesced run of identical frames is clamped to. */
const MAX_DELAY_CS = 0xffff;

/*
 * A byte sink that grows. The output of a 512 by 512 300 frame export is a
 * few megabytes, and doubling from 64 KB reaches that in seven copies, which
 * is cheaper than guessing a size and being wrong in either direction.
 */
class Bytes {
  constructor(initial = 1 << 16) {
    this.buf = new Uint8Array(initial);
    this.len = 0;
  }

  need(n) {
    if (this.len + n <= this.buf.length) {
      return;
    }
    let size = this.buf.length;
    while (size < this.len + n) {
      size *= 2;
    }
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  u8(v) {
    this.need(1);
    this.buf[this.len] = v & 0xff;
    this.len += 1;
  }

  u16(v) {
    this.need(2);
    this.buf[this.len] = v & 0xff;
    this.buf[this.len + 1] = (v >> 8) & 0xff;
    this.len += 2;
  }

  raw(arr) {
    this.need(arr.length);
    this.buf.set(arr, this.len);
    this.len += arr.length;
  }

  ascii(s) {
    this.need(s.length);
    for (let i = 0; i < s.length; i += 1) {
      this.buf[this.len + i] = s.charCodeAt(i) & 0xff;
    }
    this.len += s.length;
  }

  /* Patch a sixteen bit little endian field written earlier. The only user
   * is the delay of a frame that later turns out to be held. */
  patchU16(offset, v) {
    this.buf[offset] = v & 0xff;
    this.buf[offset + 1] = (v >> 8) & 0xff;
  }

  readU16(offset) {
    return this.buf[offset] | (this.buf[offset + 1] << 8);
  }

  take() {
    return this.buf.slice(0, this.len);
  }
}

/*
 * MEDIAN CUT.
 *
 * Every pixel handed in lands in a six bit bin that keeps a count and the
 * running sum of the true colours that fell in it. The bins start as one box
 * and are split until there are as many boxes as colours wanted. The box
 * chosen each round is the one with the largest count multiplied by its
 * longest edge, which is a compromise between splitting where the pixels are
 * and splitting where the colours are spread: by count alone a huge flat
 * black region eats splits it cannot use, and by volume alone a handful of
 * stray bright pixels gets a quarter of the palette.
 *
 * The representative of a box is the count weighted mean of the true colours
 * in it, not the centre of the box, because a box holding one dense bin and
 * one sparse one should land on the dense one.
 */
export function buildPalette(rgbaFrames, { colors = 256 } = {}) {
  const wanted = Math.max(2, Math.min(256, Math.floor(colors)));
  const count = new Uint32Array(HIST_SIZE);
  const sumR = new Float64Array(HIST_SIZE);
  const sumG = new Float64Array(HIST_SIZE);
  const sumB = new Float64Array(HIST_SIZE);

  for (const rgba of rgbaFrames) {
    for (let i = 0; i < rgba.length; i += 4) {
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const bin = ((r >> HIST_SHIFT) << (HIST_BITS * 2))
        | ((g >> HIST_SHIFT) << HIST_BITS)
        | (b >> HIST_SHIFT);
      count[bin] += 1;
      sumR[bin] += r;
      sumG[bin] += g;
      sumB[bin] += b;
    }
  }

  /* The populated bins, and their channel coordinates, so the split below
   * sorts small integers rather than unpacking a bin index every compare. */
  let populated = 0;
  for (let i = 0; i < HIST_SIZE; i += 1) {
    if (count[i] !== 0) {
      populated += 1;
    }
  }
  const palette = new Uint8Array(768);
  if (populated === 0) {
    return palette;
  }

  const order = new Int32Array(populated);
  const binR = new Uint8Array(populated);
  const binG = new Uint8Array(populated);
  const binB = new Uint8Array(populated);
  {
    let k = 0;
    for (let i = 0; i < HIST_SIZE; i += 1) {
      if (count[i] === 0) {
        continue;
      }
      order[k] = i;
      binR[k] = (i >> (HIST_BITS * 2)) & ((1 << HIST_BITS) - 1);
      binG[k] = (i >> HIST_BITS) & ((1 << HIST_BITS) - 1);
      binB[k] = i & ((1 << HIST_BITS) - 1);
      k += 1;
    }
  }

  /* order holds indices into the bin arrays, and a box is a half open range
   * of it. Splitting partitions the range in place, so no box ever copies. */
  const slot = new Int32Array(populated);
  for (let i = 0; i < populated; i += 1) {
    slot[i] = i;
  }

  const stats = (lo, hi) => {
    let n = 0;
    let rMin = 255;
    let rMax = 0;
    let gMin = 255;
    let gMax = 0;
    let bMin = 255;
    let bMax = 0;
    for (let i = lo; i < hi; i += 1) {
      const s = slot[i];
      const c = count[order[s]];
      n += c;
      if (binR[s] < rMin) { rMin = binR[s]; }
      if (binR[s] > rMax) { rMax = binR[s]; }
      if (binG[s] < gMin) { gMin = binG[s]; }
      if (binG[s] > gMax) { gMax = binG[s]; }
      if (binB[s] < bMin) { bMin = binB[s]; }
      if (binB[s] > bMax) { bMax = binB[s]; }
    }
    const edge = Math.max(rMax - rMin, gMax - gMin, bMax - bMin);
    /* Ties go to red, then green, then blue. Any fixed order does, so long
     * as it is fixed: the same frames must always give the same palette. */
    let axis = 2;
    if (gMax - gMin === edge) { axis = 1; }
    if (rMax - rMin === edge) { axis = 0; }
    return { lo, hi, n, edge, axis, priority: n * edge };
  };

  const boxes = [stats(0, populated)];

  while (boxes.length < wanted) {
    let pick = -1;
    let best = 0;
    for (let i = 0; i < boxes.length; i += 1) {
      /* A box of one bin, or of one colour, cannot be split at all. */
      if (boxes[i].hi - boxes[i].lo < 2 || boxes[i].edge === 0) {
        continue;
      }
      if (boxes[i].priority > best) {
        best = boxes[i].priority;
        pick = i;
      }
    }
    if (pick < 0) {
      break;
    }
    const box = boxes[pick];
    const chan = box.axis === 0 ? binR : (box.axis === 1 ? binG : binB);
    const range = Array.from(slot.subarray(box.lo, box.hi));
    range.sort((a, b) => (chan[a] - chan[b]) || (a - b));
    slot.set(range, box.lo);

    /*
     * Split where half the PIXELS are, not half the bins, which is what
     * makes this a median cut rather than a mean cut.
     *
     * The cut is always between lo + 1 and hi - 1, so both halves hold at
     * least one bin. That bound is the whole correctness of the loop and not
     * a tidiness: when one bin holds more than half the box, as a saturated
     * ribbon against a dark room does, the running total never reaches the
     * half before the last position, and an unbounded cut lands on hi. That
     * gives an empty right hand box and a left hand box identical to the one
     * being split, so the box count rises while nothing is divided, and the
     * palette ends up with two real colours and 254 empty slots.
     */
    const half = box.n / 2;
    let acc = 0;
    let cut = box.lo + 1;
    for (let i = box.lo; i < box.hi - 1; i += 1) {
      acc += count[order[slot[i]]];
      cut = i + 1;
      if (acc >= half) {
        break;
      }
    }
    boxes[pick] = stats(box.lo, cut);
    boxes.push(stats(cut, box.hi));
  }

  for (let i = 0; i < boxes.length; i += 1) {
    let n = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let j = boxes[i].lo; j < boxes[i].hi; j += 1) {
      const bin = order[slot[j]];
      n += count[bin];
      r += sumR[bin];
      g += sumG[bin];
      b += sumB[bin];
    }
    if (n === 0) {
      continue;
    }
    palette[i * 3] = Math.max(0, Math.min(255, Math.round(r / n)));
    palette[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(g / n)));
    palette[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(b / n)));
  }
  return palette;
}

/*
 * The LZW half. Bits go out least significant first into sub blocks of at
 * most 255 bytes, which is the format's own framing.
 */
class LzwWriter {
  constructor(out) {
    this.out = out;
    this.block = new Uint8Array(255);
    this.blockLen = 0;
    this.cur = 0;
    this.bits = 0;
  }

  emit(code, size) {
    this.cur |= code << this.bits;
    this.bits += size;
    while (this.bits >= 8) {
      this.block[this.blockLen] = this.cur & 0xff;
      this.blockLen += 1;
      this.cur >>= 8;
      this.bits -= 8;
      if (this.blockLen === 255) {
        this.flushBlock();
      }
    }
  }

  flushBlock() {
    if (this.blockLen === 0) {
      return;
    }
    this.out.u8(this.blockLen);
    this.out.raw(this.block.subarray(0, this.blockLen));
    this.blockLen = 0;
  }

  /* The tail: any bits still in hand become one more byte, the last partial
   * sub block goes out, and a zero length sub block ends the stream. */
  finish() {
    if (this.bits > 0) {
      this.block[this.blockLen] = this.cur & 0xff;
      this.blockLen += 1;
      this.cur = 0;
      this.bits = 0;
      if (this.blockLen === 255) {
        this.flushBlock();
      }
    }
    this.flushBlock();
    this.out.u8(0);
  }
}

export class GifEncoder {
  constructor({ width, height, palette, loop = 0 }) {
    if (!Number.isInteger(width) || !Number.isInteger(height)
      || width <= 0 || height <= 0) {
      throw new Error('gif: width and height must be positive integers');
    }
    if (!palette || palette.length < 768) {
      throw new Error('gif: palette must be 768 bytes, 256 RGB triples');
    }
    this.width = width;
    this.height = height;
    this.palette = palette;
    this.out = new Bytes();
    this.prev = null;
    this.cur = new Uint8Array(width * height);
    this.done = false;
    this.frames = 0;
    /* Where the delay field of the most recently written frame lives, so a
     * frame that turns out to be identical to it can be folded in. */
    this.lastDelayAt = -1;

    this.cache = new Int16Array(CACHE_SIZE).fill(-1);

    /*
     * The LZW dictionary, as a flat table rather than a Map, because this is
     * the inner loop of the whole export. The key is prefix by 256 plus the
     * next byte, and a prefix is under 4096, so the table is 2^20 entries.
     * Clearing 4 MB at every table reset would cost more than the encode, so
     * the keys added since the last reset are remembered and only those are
     * put back to empty.
     */
    this.dict = new Int32Array(1 << 20).fill(-1);
    this.touched = new Int32Array(MAX_CODE);
    this.touchedLen = 0;

    this.writeHeader(loop);
  }

  writeHeader(loop) {
    const out = this.out;
    out.ascii('GIF89a');
    out.u16(this.width);
    out.u16(this.height);
    /* Global colour table present, eight bits of colour resolution, not
     * sorted, 256 entries. */
    out.u8(0xf7);
    /* Background index and pixel aspect ratio, neither of which anything
     * reads for an animation that covers its own canvas. */
    out.u8(0);
    out.u8(0);
    out.raw(this.palette.subarray(0, 768));
    /* The Netscape application extension, which is the only way to say
     * "loop" in this format. Zero means forever. */
    out.u8(0x21);
    out.u8(0xff);
    out.u8(0x0b);
    out.ascii('NETSCAPE2.0');
    out.u8(0x03);
    out.u8(0x01);
    out.u16(loop);
    out.u8(0);
  }

  /* Nearest palette entry to one cache cell, measured at the cell's centre.
   * Plain squared distance in RGB: the scene is flat shaded and a perceptual
   * metric moved nothing that could be seen. */
  nearest(key) {
    const cached = this.cache[key];
    if (cached >= 0) {
      return cached;
    }
    const step = 1 << (8 - CACHE_BITS);
    const half = step >> 1;
    const r = (((key >> (CACHE_BITS * 2)) & ((1 << CACHE_BITS) - 1)) << (8 - CACHE_BITS)) + half;
    const g = (((key >> CACHE_BITS) & ((1 << CACHE_BITS) - 1)) << (8 - CACHE_BITS)) + half;
    const b = ((key & ((1 << CACHE_BITS) - 1)) << (8 - CACHE_BITS)) + half;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < 256; i += 1) {
      const dr = r - this.palette[i * 3];
      const dg = g - this.palette[i * 3 + 1];
      const db = b - this.palette[i * 3 + 2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.cache[key] = best;
    return best;
  }

  /*
   * One frame. rgba is width by height by four, row major, top row first,
   * which is the orientation a caller gets after flipping a WebGL readback.
   * delayCs is centiseconds, the format's own unit: 25 fps is exactly 4.
   */
  addFrame(rgba, delayCs) {
    if (this.done) {
      throw new Error('gif: addFrame after finish');
    }
    const n = this.width * this.height;
    if (rgba.length < n * 4) {
      throw new Error('gif: frame is smaller than the canvas');
    }
    const cur = this.cur;
    for (let i = 0, p = 0; i < n; i += 1, p += 4) {
      const key = ((rgba[p] >> (8 - CACHE_BITS)) << (CACHE_BITS * 2))
        | ((rgba[p + 1] >> (8 - CACHE_BITS)) << CACHE_BITS)
        | (rgba[p + 2] >> (8 - CACHE_BITS));
      cur[i] = this.nearest(key);
    }

    const delay = Math.max(0, Math.round(delayCs));
    let x0 = 0;
    let y0 = 0;
    let x1 = this.width - 1;
    let y1 = this.height - 1;

    if (this.prev) {
      const box = this.changedBox(this.prev, cur);
      if (!box) {
        /*
         * Nothing moved. Hold the frame already written for longer rather
         * than writing an image block that paints the same pixels again. A
         * held frame is the single biggest saving on an animation whose
         * ribbon pauses, and it costs two patched bytes.
         */
        if (this.lastDelayAt >= 0) {
          const held = Math.min(MAX_DELAY_CS, this.out.readU16(this.lastDelayAt) + delay);
          this.out.patchU16(this.lastDelayAt, held);
        }
        this.frames += 1;
        return;
      }
      x0 = box.x0;
      y0 = box.y0;
      x1 = box.x1;
      y1 = box.y1;
    }

    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const out = this.out;

    /* Graphic control extension: disposal 1, leave the frame in place, which
     * is what makes emitting only the changed rectangle correct. No
     * transparent index, because nothing here needs one and a transparent
     * index would stop a pixel ever being painted back to the background. */
    out.u8(0x21);
    out.u8(0xf9);
    out.u8(0x04);
    out.u8(0x04);
    this.lastDelayAt = out.len;
    out.u16(Math.min(MAX_DELAY_CS, delay));
    out.u8(0);
    out.u8(0);

    /* Image descriptor: no local colour table, not interlaced. */
    out.u8(0x2c);
    out.u16(x0);
    out.u16(y0);
    out.u16(w);
    out.u16(h);
    out.u8(0);

    out.u8(MIN_CODE_SIZE);
    this.encodeRect(cur, x0, y0, w, h);

    if (!this.prev) {
      this.prev = new Uint8Array(n);
    }
    this.prev.set(cur);
    this.frames += 1;
  }

  changedBox(prev, cur) {
    const { width, height } = this;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        if (prev[row + x] !== cur[row + x]) {
          if (x < x0) { x0 = x; }
          if (x > x1) { x1 = x; }
          if (y < y0) { y0 = y; }
          y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }

  resetDict() {
    for (let i = 0; i < this.touchedLen; i += 1) {
      this.dict[this.touched[i]] = -1;
    }
    this.touchedLen = 0;
  }

  /*
   * GIF's LZW over one rectangle of the indexed frame.
   *
   * The code size transitions are the part of this format that is easy to
   * get subtly wrong, so they are spelled out. Codes start at nine bits with
   * the next free code at 258, because 256 is clear and 257 is end. A code
   * is emitted BEFORE the table grows, so it is always within the current
   * width. The width goes up the moment the next free code would not fit in
   * it, which is the same moment the decoder's own table reaches that size,
   * and that is what keeps the two in step. At 4096 the table is full and
   * the only legal move is to emit a clear and start again.
   */
  encodeRect(indexed, x0, y0, w, h) {
    const lzw = new LzwWriter(this.out);
    const width = this.width;
    this.resetDict();

    let codeSize = MIN_CODE_SIZE + 1;
    let next = CLEAR_CODE + 2;
    lzw.emit(CLEAR_CODE, codeSize);

    let prefix = indexed[y0 * width + x0];
    for (let y = 0; y < h; y += 1) {
      const row = (y0 + y) * width + x0;
      for (let x = (y === 0 ? 1 : 0); x < w; x += 1) {
        const k = indexed[row + x];
        const key = (prefix << 8) | k;
        const found = this.dict[key];
        if (found >= 0) {
          prefix = found;
          continue;
        }
        lzw.emit(prefix, codeSize);
        if (next === MAX_CODE) {
          lzw.emit(CLEAR_CODE, codeSize);
          this.resetDict();
          codeSize = MIN_CODE_SIZE + 1;
          next = CLEAR_CODE + 2;
        } else {
          if (next >= (1 << codeSize) && codeSize < 12) {
            codeSize += 1;
          }
          this.dict[key] = next;
          this.touched[this.touchedLen] = key;
          this.touchedLen += 1;
          next += 1;
        }
        prefix = k;
      }
    }
    lzw.emit(prefix, codeSize);
    lzw.emit(END_CODE, codeSize);
    lzw.finish();
  }

  finish() {
    if (!this.done) {
      this.out.u8(0x3b);
      this.done = true;
    }
    return this.out.take();
  }
}
