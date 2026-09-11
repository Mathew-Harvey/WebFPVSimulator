/*
 * gif-selftest.js: decode what src/trackbuilder/gif.js encodes, and check
 * that the bytes say what the encoder meant.
 *
 * WHY A SECOND IMPLEMENTATION. An encoder checked against itself proves
 * nothing: a round trip through one author's idea of LZW passes whether or
 * not that idea matches the format. The decoder below was written from the
 * specification rather than from the encoder, and in particular it grows its
 * code width on its own schedule, which is the one place a GIF writer can be
 * subtly wrong and still look fine until some other program opens the file.
 *
 * WHAT IS NOT CHECKED HERE. Nothing compares rendered pixels to a stored
 * image. What the stage draws depends on the GPU, the driver and the fonts
 * the machine happens to have, so a byte comparison of a rendered animation
 * would fail honestly on a different computer and teach nobody anything.
 * This file checks the container and the compression, which are arithmetic
 * and must be identical everywhere.
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

import { buildPalette, GifEncoder } from '../src/trackbuilder/gif.js';

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    return;
  }
  failed += 1;
  console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
}

/*
 * The decoder. GIF's LZW, read from the specification: codes go in least
 * significant bit first, the table starts at clear plus two, and the width
 * grows the moment the next free slot will not fit in it. The awkward case
 * is a code that is not in the table yet, which the format allows and which
 * always resolves to the previous string plus its own first byte.
 */
function lzwDecode(minCodeSize, data, pixelCount) {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const first = new Uint8Array(4096);
  for (let i = 0; i < clear; i += 1) {
    suffix[i] = i;
    first[i] = i;
  }
  const out = new Uint8Array(pixelCount);
  const stack = new Uint8Array(4096);
  let codeSize = minCodeSize + 1;
  let next = clear + 2;
  let prev = -1;
  let bit = 0;
  let o = 0;
  const totalBits = data.length * 8;

  const read = () => {
    if (bit + codeSize > totalBits) {
      return end;
    }
    let code = 0;
    for (let i = 0; i < codeSize; i += 1) {
      code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
      bit += 1;
    }
    return code;
  };

  while (o < pixelCount) {
    const code = read();
    if (code === end) {
      break;
    }
    if (code === clear) {
      codeSize = minCodeSize + 1;
      next = clear + 2;
      prev = -1;
      continue;
    }
    if (prev === -1) {
      out[o] = suffix[code];
      o += 1;
      prev = code;
      continue;
    }
    let cur = code;
    let sp = 0;
    if (code >= next) {
      stack[sp] = first[prev];
      sp += 1;
      cur = prev;
    }
    while (cur >= clear) {
      stack[sp] = suffix[cur];
      sp += 1;
      cur = prefix[cur];
    }
    stack[sp] = cur;
    sp += 1;
    const head = cur;
    while (sp > 0 && o < pixelCount) {
      sp -= 1;
      out[o] = stack[sp];
      o += 1;
    }
    if (next < 4096) {
      prefix[next] = prev;
      suffix[next] = head;
      first[next] = first[prev];
      next += 1;
      if (next >= (1 << codeSize) && codeSize < 12) {
        codeSize += 1;
      }
    }
    prev = code;
  }
  return out;
}

/* Walk the container and hand back everything a test might want to assert. */
function parseGif(bytes) {
  let p = 0;
  const u8 = () => { const v = bytes[p]; p += 1; return v; };
  const u16 = () => { const v = bytes[p] | (bytes[p + 1] << 8); p += 2; return v; };
  const ascii = (n) => {
    let s = '';
    for (let i = 0; i < n; i += 1) { s += String.fromCharCode(bytes[p + i]); }
    p += n;
    return s;
  };
  const subBlocks = () => {
    const parts = [];
    for (;;) {
      const n = u8();
      if (n === 0) { break; }
      parts.push(bytes.subarray(p, p + n));
      p += n;
    }
    let total = 0;
    for (const part of parts) { total += part.length; }
    const joined = new Uint8Array(total);
    let at = 0;
    for (const part of parts) { joined.set(part, at); at += part.length; }
    return joined;
  };

  const signature = ascii(6);
  const width = u16();
  const height = u16();
  const packed = u8();
  const background = u8();
  const aspect = u8();
  let gct = null;
  if (packed & 0x80) {
    const n = 1 << ((packed & 0x07) + 1);
    gct = bytes.subarray(p, p + n * 3);
    p += n * 3;
  }

  const frames = [];
  let loop = null;
  let pendingDelay = 0;
  let pendingDisposal = 0;
  let trailer = false;

  for (;;) {
    if (p >= bytes.length) { break; }
    const marker = u8();
    if (marker === 0x3b) { trailer = true; break; }
    if (marker === 0x21) {
      const label = u8();
      if (label === 0xf9) {
        const size = u8();
        const flags = u8();
        pendingDelay = u16();
        u8();
        u8();
        pendingDisposal = (flags >> 2) & 0x07;
        if (size !== 4) { throw new Error('bad graphic control block size'); }
      } else if (label === 0xff) {
        const size = u8();
        const name = ascii(size);
        const body = subBlocks();
        if (name === 'NETSCAPE2.0' && body.length >= 3 && body[0] === 1) {
          loop = body[1] | (body[2] << 8);
        }
      } else {
        subBlocks();
      }
      continue;
    }
    if (marker === 0x2c) {
      const x = u16();
      const y = u16();
      const w = u16();
      const h = u16();
      const flags = u8();
      if (flags & 0x80) {
        p += 3 * (1 << ((flags & 0x07) + 1));
      }
      const minCodeSize = u8();
      const data = subBlocks();
      frames.push({
        x, y, w, h,
        delay: pendingDelay,
        disposal: pendingDisposal,
        interlaced: Boolean(flags & 0x40),
        localTable: Boolean(flags & 0x80),
        indices: lzwDecode(minCodeSize, data, w * h),
      });
      continue;
    }
    throw new Error(`unknown block 0x${marker.toString(16)} at ${p - 1}`);
  }

  return { signature, width, height, packed, background, aspect, gct, loop, frames, trailer };
}

/* Paint the frames onto one canvas the way a viewer would, which for
 * disposal 1 is simply leaving every previous pixel where it is. */
function composite(parsed) {
  const canvas = new Uint8Array(parsed.width * parsed.height);
  const shots = [];
  for (const f of parsed.frames) {
    for (let row = 0; row < f.h; row += 1) {
      for (let col = 0; col < f.w; col += 1) {
        canvas[(f.y + row) * parsed.width + (f.x + col)] = f.indices[row * f.w + col];
      }
    }
    shots.push(canvas.slice());
  }
  return shots;
}

function sameBytes(a, b) {
  if (a.length !== b.length) { return false; }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) { return false; }
  }
  return true;
}

/*
 * A palette of widely separated colours, so the encoder's nearest entry
 * lookup has one obvious answer for every colour used below and a failed
 * assertion means the container or the compression is wrong rather than the
 * quantiser being one step off.
 */
const INK = [
  [0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0],
  [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255],
];

function paletteOf(colours) {
  const pal = new Uint8Array(768);
  for (let i = 0; i < colours.length; i += 1) {
    pal[i * 3] = colours[i][0];
    pal[i * 3 + 1] = colours[i][1];
    pal[i * 3 + 2] = colours[i][2];
  }
  return pal;
}

/* Indices to RGBA, so a test can hand the encoder pixels rather than codes
 * and still know exactly which codes it should produce. */
function paint(indices, colours) {
  const rgba = new Uint8Array(indices.length * 4);
  for (let i = 0; i < indices.length; i += 1) {
    const c = colours[indices[i]];
    rgba[i * 4] = c[0];
    rgba[i * 4 + 1] = c[1];
    rgba[i * 4 + 2] = c[2];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

console.log('gif encoder selftest');

/* ---- The container, and a three frame animation ---- */
{
  const W = 40;
  const H = 24;
  const pal = paletteOf(INK);
  const a = new Uint8Array(W * H).fill(0);
  for (let i = 0; i < W * H; i += 1) { a[i] = (i % 5) < 2 ? 1 : 0; }
  const b = a.slice();
  for (let y = 4; y < 14; y += 1) {
    for (let x = 6; x < 16; x += 1) { b[y * W + x] = 2; }
  }
  const c = b.slice();
  for (let i = 0; i < W * H; i += 1) { c[i] = (i % 7) < 3 ? 3 : c[i]; }

  const enc = new GifEncoder({ width: W, height: H, palette: pal, loop: 0 });
  enc.addFrame(paint(a, INK), 4);
  enc.addFrame(paint(b, INK), 7);
  enc.addFrame(paint(c, INK), 4);
  const bytes = enc.finish();
  const g = parseGif(bytes);

  check('signature is GIF89a', g.signature === 'GIF89a', g.signature);
  check('screen size is the canvas', g.width === W && g.height === H, `${g.width}x${g.height}`);
  check('global colour table flag set', Boolean(g.packed & 0x80));
  check('global colour table has 256 entries', g.gct && g.gct.length === 768,
    g.gct ? String(g.gct.length) : 'absent');
  check('global colour table is the palette handed in', g.gct && sameBytes(g.gct, pal));
  check('loops forever', g.loop === 0, String(g.loop));
  check('trailer present', g.trailer);
  check('three image blocks', g.frames.length === 3, String(g.frames.length));
  check('delays survive', g.frames.map((f) => f.delay).join(',') === '4,7,4',
    g.frames.map((f) => f.delay).join(','));
  check('disposal is leave in place', g.frames.every((f) => f.disposal === 1));
  check('no local colour tables', g.frames.every((f) => !f.localTable));
  check('nothing interlaced', g.frames.every((f) => !f.interlaced));
  check('first frame covers the canvas',
    g.frames[0].x === 0 && g.frames[0].y === 0 && g.frames[0].w === W && g.frames[0].h === H);

  const shots = composite(g);
  check('frame 1 round trips', sameBytes(shots[0], a));
  check('frame 2 round trips', sameBytes(shots[1], b));
  check('frame 3 round trips', sameBytes(shots[2], c));
}

/* ---- A frame that changed in one small patch emits one small rectangle ---- */
{
  const W = 64;
  const H = 64;
  const pal = paletteOf(INK);
  const a = new Uint8Array(W * H).fill(1);
  const b = a.slice();
  for (let y = 20; y < 30; y += 1) {
    for (let x = 12; x < 22; x += 1) { b[y * W + x] = 4; }
  }
  const enc = new GifEncoder({ width: W, height: H, palette: pal, loop: 0 });
  enc.addFrame(paint(a, INK), 4);
  enc.addFrame(paint(b, INK), 4);
  const g = parseGif(enc.finish());

  check('patch: two image blocks', g.frames.length === 2, String(g.frames.length));
  const f = g.frames[1];
  check('patch: rectangle is 10 by 10', f.w === 10 && f.h === 10, `${f.w}x${f.h}`);
  check('patch: rectangle is at the patch', f.x === 12 && f.y === 20, `${f.x},${f.y}`);
  const shots = composite(g);
  check('patch: composite round trips', sameBytes(shots[1], b));
}

/* ---- An unchanged frame is held, not stored again ---- */
{
  const W = 32;
  const H = 32;
  const pal = paletteOf(INK);
  const a = new Uint8Array(W * H).fill(5);
  const b = a.slice();
  b[100] = 6;
  const enc = new GifEncoder({ width: W, height: H, palette: pal, loop: 0 });
  enc.addFrame(paint(a, INK), 4);
  enc.addFrame(paint(a, INK), 4);
  enc.addFrame(paint(a, INK), 3);
  enc.addFrame(paint(b, INK), 4);
  const g = parseGif(enc.finish());

  check('held: two image blocks for four frames', g.frames.length === 2, String(g.frames.length));
  check('held: the held delays folded into the first', g.frames[0].delay === 11,
    String(g.frames[0].delay));
  check('held: the moving frame keeps its own delay', g.frames[1].delay === 4,
    String(g.frames[1].delay));
  const shots = composite(g);
  check('held: composite round trips', sameBytes(shots[1], b));
}

/*
 * ---- Enough entropy to fill the code table and force a reset ----
 *
 * This is the case the code width transitions exist for. A deterministic
 * generator rather than Math.random, so a failure here is reproducible.
 */
{
  const W = 220;
  const H = 220;
  const colours = [];
  for (let i = 0; i < 256; i += 1) {
    colours.push([(i * 7) & 0xff, (i * 29) & 0xff, (i * 53) & 0xff]);
  }
  const pal = paletteOf(colours);
  let seed = 12345;
  const noise = new Uint8Array(W * H);
  for (let i = 0; i < noise.length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    noise[i] = (seed >> 16) & 0xff;
  }
  const enc = new GifEncoder({ width: W, height: H, palette: pal, loop: 0 });
  enc.addFrame(paint(noise, colours), 4);
  const g = parseGif(enc.finish());
  check('noise: one image block', g.frames.length === 1, String(g.frames.length));
  const shots = composite(g);
  check('noise: 48400 pixels round trip through a table reset',
    shots.length === 1 && sameBytes(shots[0], noise));
}

/* ---- A single pixel canvas, the smallest legal thing ---- */
{
  const pal = paletteOf(INK);
  const enc = new GifEncoder({ width: 1, height: 1, palette: pal, loop: 0 });
  enc.addFrame(paint(new Uint8Array([3]), INK), 4);
  const g = parseGif(enc.finish());
  check('one pixel: parses', g.frames.length === 1 && g.width === 1 && g.height === 1);
  check('one pixel: round trips', g.frames.length === 1 && g.frames[0].indices[0] === 3);
}

/* ---- buildPalette ---- */
{
  const W = 32;
  const H = 32;
  /* Two thirds near black and one third a bright red, which is the shape of
   * the animation this encoder exists for. A palette that spends all its
   * entries on the bright third would be the failure worth catching. */
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    const dark = i % 3 !== 0;
    const v = dark ? (i % 17) : 200;
    rgba[i * 4] = dark ? v : 255;
    rgba[i * 4 + 1] = dark ? v : 80;
    rgba[i * 4 + 2] = dark ? v : 60;
    rgba[i * 4 + 3] = 255;
  }
  const pal = buildPalette([rgba], { colors: 256 });
  check('palette: 768 bytes', pal.length === 768, String(pal.length));
  let dark = 0;
  let used = 0;
  for (let i = 0; i < 256; i += 1) {
    const r = pal[i * 3];
    const g = pal[i * 3 + 1];
    const b = pal[i * 3 + 2];
    if (r || g || b) { used += 1; }
    if (r < 40 && g < 40 && b < 40) { dark += 1; }
  }
  check('palette: entries were assigned', used > 1, String(used));
  check('palette: the dark end is represented', dark >= 2, String(dark));

  /* The whole point: quantising with this palette must reproduce the input
   * closely. 35 dB is the bar the plan set for flat shaded content. */
  const enc = new GifEncoder({ width: W, height: H, palette: pal, loop: 0 });
  enc.addFrame(rgba, 4);
  const g = parseGif(enc.finish());
  let sq = 0;
  for (let i = 0; i < W * H; i += 1) {
    const idx = g.frames[0].indices[i];
    const dr = rgba[i * 4] - pal[idx * 3];
    const dg = rgba[i * 4 + 1] - pal[idx * 3 + 1];
    const db = rgba[i * 4 + 2] - pal[idx * 3 + 2];
    sq += (dr * dr + dg * dg + db * db) / 3;
  }
  const psnr = 10 * Math.log10((255 * 255) / Math.max(sq / (W * H), 1e-9));
  check('palette: quantising loses little', psnr > 35, `${psnr.toFixed(1)} dB`);
}

/*
 * ---- Median cut splits every box it is given room for ----
 *
 * This is a regression guard with a specific failure behind it. The split
 * point is the position where half the pixels have been passed, and if it is
 * not clamped below the end of the box then a bin holding more than half the
 * box sends it past the last valid position: the right hand box comes back
 * empty, the left hand box is unchanged, and the loop raises the box count
 * without dividing anything. The symptom was a palette with two real colours
 * and 254 empty slots on an input with eighteen colours in it, which is the
 * exact shape of this animation, a saturated ribbon against a dark room.
 */
{
  /* Eight colours far enough apart that each one is alone in its histogram
   * bin, so a correct median cut must return each of them exactly. */
  const rgba = new Uint8Array(INK.length * 4);
  for (let i = 0; i < INK.length; i += 1) {
    rgba[i * 4] = INK[i][0];
    rgba[i * 4 + 1] = INK[i][1];
    rgba[i * 4 + 2] = INK[i][2];
    rgba[i * 4 + 3] = 255;
  }
  const pal = buildPalette([rgba], { colors: 256 });
  const got = new Set();
  for (let i = 0; i < 256; i += 1) {
    got.add(`${pal[i * 3]},${pal[i * 3 + 1]},${pal[i * 3 + 2]}`);
  }
  const missing = INK.filter((c) => !got.has(`${c[0]},${c[1]},${c[2]}`));
  check('median cut: every separated colour survives exactly',
    missing.length === 0, `${missing.length} missing`);

  /* One colour holding well over half the pixels is what broke it. */
  const W = 60;
  const H = 60;
  const skew = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    const c = i % 4 === 0 ? INK[1 + (i % 7)] : INK[0];
    skew[i * 4] = c[0];
    skew[i * 4 + 1] = c[1];
    skew[i * 4 + 2] = c[2];
    skew[i * 4 + 3] = 255;
  }
  const skewPal = buildPalette([skew], { colors: 256 });
  const skewGot = new Set();
  for (let i = 0; i < 256; i += 1) {
    skewGot.add(`${skewPal[i * 3]},${skewPal[i * 3 + 1]},${skewPal[i * 3 + 2]}`);
  }
  check('median cut: a dominant colour does not stall the split',
    skewGot.size >= 8, `${skewGot.size} distinct entries`);

  /* And it must stop where it is told to. */
  const few = buildPalette([rgba], { colors: 4 });
  let nonEmpty = 0;
  for (let i = 0; i < 256; i += 1) {
    if (few[i * 3] || few[i * 3 + 1] || few[i * 3 + 2]) { nonEmpty += 1; }
  }
  check('median cut: honours the colour ceiling', nonEmpty <= 4, String(nonEmpty));
}

/* ---- Refusals ---- */
{
  let threw = false;
  try {
    const enc = new GifEncoder({ width: 4, height: 4, palette: paletteOf(INK) });
    enc.finish();
    enc.addFrame(new Uint8Array(64), 4);
  } catch (e) { threw = true; }
  check('addFrame after finish is refused', threw);

  threw = false;
  try {
    // eslint-disable-next-line no-new
    new GifEncoder({ width: 0, height: 4, palette: paletteOf(INK) });
  } catch (e) { threw = true; }
  check('a zero width canvas is refused', threw);

  threw = false;
  try {
    // eslint-disable-next-line no-new
    new GifEncoder({ width: 4, height: 4, palette: new Uint8Array(12) });
  } catch (e) { threw = true; }
  check('a short palette is refused', threw);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
