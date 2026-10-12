/*
 * sponsorpaint.js: how a sponsor's mark is put on each kind of surface.
 *
 * A course's logos used to be stamped everywhere the same way: flat, at 93
 * percent ink, edge to edge (paintGroundLogo in ./banners.js). That reads as
 * a sticker on every surface and as paint on none. The owner asked on 12
 * October 2026 for a better renderer, one look per surface:
 *
 *   sprayed     on grass: a football pitch sponsor. Line marking paint put
 *               down by a machine, so the edge is a little soft, a faint
 *               overspray halo sits round it, and the blades take some of
 *               the paint, so the mark breaks up on the grass.
 *   graffiti    on a derelict building (a bando): hand sprayed, slightly
 *               off true, a wider overspray, drips running off the lower
 *               edge, and the concrete's pits eating the paint.
 *   sign        on the side of an ordinary building: a fascia board fitted
 *               to the wall, a pale panel with a thin keyline and four
 *               screws, the mark sitting in it with room to breathe.
 *   billboard   on a billboard: the mark framed neatly across the whole
 *               face on clean paper, which covers the advert under it.
 *
 * LATENCY. Every painter here runs ONCE, on the canvas a mark already had,
 * when the mark has decoded. Nothing in this file runs in a frame: no
 * shader, no extra mesh, no extra draw call (each mark is still the one
 * plane it always was), no texture upload beyond the one it always made.
 * The speckle pass touches each pixel of a canvas of at most 512 by 512 a
 * single time.
 *
 * DETERMINISM OF THE LOOK. The noise is an integer hash of the pixel and a
 * seed, so a mark breaks up the same way on every machine and on every
 * visit, and two copies of one logo on one map do not break up identically
 * because each decal gives its own seed. Plain numbers, no Math.random.
 *
 * Pure canvas calls: nothing here imports Three.js, so a Node check could
 * drive it with a stand in context.
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

/* The surfaces a mark can be painted for. */
export const SURFACES = ['sprayed', 'graffiti', 'sign', 'billboard'];

/* A canvas of this size, off screen. A function so a test can swap it. */
/* CPU backed from the start (willReadFrequently is read on the first
 * getContext call only): the speckle pass reads pixels back, and a read back
 * from a GPU backed canvas waits for the GPU to finish what it has queued,
 * which in a headless run was 1.2 s the first time and on a real machine is
 * a stall in the middle of a map load. Every canvas in this file is made
 * here, so none of them is ever one the GPU owns. */
function scratch(w, h) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  cv.getContext('2d', { willReadFrequently: true });
  return cv;
}

/* The mark fitted into a w by h box, centred, never stretched. */
function fitInto(ctx, img, x, y, w, h) {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  if (!(sw > 0 && sh > 0)) {
    return;
  }
  const k = Math.min(w / sw, h / sh);
  ctx.drawImage(img, x + (w - sw * k) * 0.5, y + (h - sh * k) * 0.5, sw * k, sh * k);
}

/* A hash of two integers and a seed to [0, 1): the same on every engine. */
function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* Value noise: the hash on a lattice, smoothly blended, so the grain has a
 * size. cell is the lattice spacing in pixels. */
function noise2(x, y, cell, seed) {
  const gx = x / cell;
  const gy = y / cell;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

/* Scale the alpha of the 2 by 2 block at (x, y) by `take`, inside the
 * canvas. */
function scaleAlpha(d, w, h, x, y, take) {
  for (let dy = 0; dy < 2 && y + dy < h; dy += 1) {
    for (let dx = 0; dx < 2 && x + dx < w; dx += 1) {
      const i = ((y + dy) * w + x + dx) * 4 + 3;
      d[i] = Math.max(0, Math.min(255, Math.round(d[i] * take)));
    }
  }
}

/* A softened copy of a canvas: down to 1/k and back up with smoothing on.
 * Portable (ctx.filter is not in every browser) and cheap at these sizes. */
function soften(src, k) {
  const w = src.width;
  const h = src.height;
  const small = scratch(w / k, h / k);
  const sg = small.getContext('2d');
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(src, 0, 0, small.width, small.height);
  const out = scratch(w, h);
  const og = out.getContext('2d');
  og.imageSmoothingQuality = 'high';
  og.drawImage(small, 0, 0, w, h);
  return out;
}

/*
 * SPRAYED. The football pitch sponsor.
 *
 * Three layers, all from the one fitted copy of the mark: a wide faint halo
 * (the overspray a marking machine leaves), the mark itself with its edge
 * relaxed by a pixel or two, and then the grass's share: blade sized
 * speckle takes the paint thin in patches, and a broad low frequency
 * mottle makes the coverage uneven the way it is where the machine goes
 * over a rut. The alpha never reaches 1, because paint on grass is not
 * opaque, and there is no hard edge anywhere.
 *
 * opts.seed   the decal's own, so repeats do not match
 * opts.scale  pixels per metre of the canvas, so the blades are the right
 *             size whatever the canvas is (default: 1/12 of the shorter side
 *             is a metre)
 */
export function paintSprayed(ctx, w, h, opts = {}) {
  if (!opts.logo) {
    return;
  }
  const seed = opts.seed | 0;
  const mark = scratch(w, h);
  const mg = mark.getContext('2d');
  mg.imageSmoothingQuality = 'high';
  fitInto(mg, opts.logo, 0, 0, w, h);

  const px = Math.max(1, Math.min(w, h) / 6);
  const halo = soften(mark, Math.max(2, Math.round(px / 3)));
  const edge = soften(mark, 2);

  const out = scratch(w, h);
  const og = out.getContext('2d');
  og.globalAlpha = 0.3;
  og.drawImage(halo, 0, 0);
  og.globalAlpha = 1;
  og.drawImage(edge, 0, 0);

  const img = og.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const blade = Math.max(1.5, px * 0.045);
  const mottle = Math.max(6, px * 1.2);
  /* In blocks of two by two, one verdict per block: the speckle is blade
   * sized anyway, and a quarter of the evaluations keeps the one-off paint
   * short on a weak machine. */
  const ow = out.width;
  for (let y = 0; y < out.height; y += 2) {
    for (let x = 0; x < ow; x += 2) {
      const i0 = (y * ow + x) * 4 + 3;
      if (d[i0] === 0 && d[i0 + 4] === 0 && (y + 1 >= out.height || (d[i0 + ow * 4] === 0 && d[i0 + ow * 4 + 4] === 0))) {
        continue;
      }
      /* Blades: short strokes taller than wide, so the speckle is stretched
       * along y the way a mown stripe's grain is. */
      const grain = noise2(x, y * 0.55, blade, seed);
      const patch = noise2(x, y, mottle, seed ^ 0x5bd1e995);
      let take = 1.0 - 0.22 * (grain > 0.62 ? 1 : grain / 0.62) - 0.15 * patch;
      if (hash2(x, y, seed ^ 0x2545f491) > 0.93) {
        take *= 0.45;
      }
      scaleAlpha(d, ow, out.height, x, y, take);
    }
  }
  og.putImageData(img, 0, 0);
  ctx.drawImage(out, 0, 0);
}

/*
 * GRAFFITI. Spray paint on bare concrete.
 *
 * The mark is turned a degree or two off true and made a touch smaller than
 * its box, because nobody paints up to a wall's edge. The overspray is a
 * wider, thinner halo than the pitch's. The paint is then taken by the
 * wall: coarse pits (the concrete's pores) and fine grain, in a pass over
 * the alpha; and drips: from a handful of places along the lowest edge of
 * the paint, a thin run of the paint's own colour, as long as the paint was
 * wet. Run last, over the pits, because a drip lies in the pores it runs
 * through and is the one thing on a sprayed wall that is not broken up.
 */
export function paintGraffiti(ctx, w, h, opts = {}) {
  if (!opts.logo) {
    return;
  }
  const seed = opts.seed | 0;
  const rng = mulberry(seed ^ 0x1b873593);
  const mark = scratch(w, h);
  const mg = mark.getContext('2d');
  mg.imageSmoothingQuality = 'high';
  mg.translate(w / 2, h / 2);
  mg.rotate((rng() - 0.5) * 0.05);
  mg.translate(-w / 2, -h / 2);
  /* Smaller than the box, so the drips have somewhere to run. */
  fitInto(mg, opts.logo, w * 0.06, h * 0.04, w * 0.88, h * 0.76);

  const px = Math.max(1, Math.min(w, h));
  const halo = soften(mark, Math.max(2, Math.round(px / 40)));
  const edge = soften(mark, 2);

  const out = scratch(w, h);
  const og = out.getContext('2d');
  og.globalAlpha = 0.34;
  og.drawImage(halo, 0, 0);
  og.globalAlpha = 1;
  og.drawImage(edge, 0, 0);

  const img = og.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const pore = Math.max(2, px * 0.011);
  const pitch = Math.max(5, px * 0.05);
  /* Where the paint is thickest along each column, for the drips, before
   * the pits are cut into it. */
  const lowest = new Int32Array(out.width).fill(-1);
  for (let x = 0; x < out.width; x += 1) {
    for (let y = out.height - 1; y >= 0; y -= 1) {
      if (d[(y * out.width + x) * 4 + 3] > 200) {
        lowest[x] = y;
        break;
      }
    }
  }
  const colourAt = (x, y) => {
    const j = (y * out.width + x) * 4;
    return [d[j], d[j + 1], d[j + 2]];
  };
  const drips = [];
  const count = 3 + Math.floor(rng() * 5);
  for (let n = 0; n < count; n += 1) {
    const x = Math.floor(out.width * (0.1 + 0.8 * rng()));
    if (lowest[x] < 0) {
      continue;
    }
    const y = Math.max(0, lowest[x] - 2);
    drips.push({
      x,
      y,
      len: px * (0.03 + 0.1 * rng() * rng()),
      w: Math.max(1, px * (0.004 + 0.006 * rng())),
      colour: colourAt(x, y),
    });
  }
  const ow = out.width;
  for (let y = 0; y < out.height; y += 2) {
    for (let x = 0; x < ow; x += 2) {
      const i0 = (y * ow + x) * 4 + 3;
      if (d[i0] === 0 && d[i0 + 4] === 0 && (y + 1 >= out.height || (d[i0 + ow * 4] === 0 && d[i0 + ow * 4 + 4] === 0))) {
        continue;
      }
      const grain = noise2(x, y, pore, seed);
      const mottle = noise2(x, y, pitch, seed ^ 0x68e31da4);
      let take = 1.0 - 0.14 * mottle - (grain > 0.74 ? 0.3 : 0);
      if (hash2(x, y, seed ^ 0x7feb352d) > 0.965) {
        take *= 0.3;
      }
      scaleAlpha(d, ow, out.height, x, y, take);
    }
  }
  og.putImageData(img, 0, 0);
  og.lineCap = 'round';
  for (const dr of drips) {
    og.strokeStyle = `rgba(${dr.colour[0]}, ${dr.colour[1]}, ${dr.colour[2]}, 0.9)`;
    og.lineWidth = dr.w;
    og.beginPath();
    og.moveTo(dr.x, dr.y);
    og.lineTo(dr.x + (rng() - 0.5) * dr.w * 0.6, dr.y + dr.len);
    og.stroke();
    /* The bead at the end of a run. */
    og.fillStyle = og.strokeStyle;
    og.beginPath();
    og.arc(dr.x, dr.y + dr.len, dr.w * 0.8, 0, Math.PI * 2);
    og.fill();
  }
  ctx.drawImage(out, 0, 0);
}

/*
 * SIGN. A fascia board fitted to a wall.
 *
 * A pale panel (the banner vinyl's off white rather than a pure one, for the
 * reason banners.js gives), a thin dark keyline inside its edge, a bevel
 * lighter on top and darker below, four screws, and a soft shadow under it
 * so it stands off the wall by the thickness of a board. The mark sits in
 * the panel with a margin of about a tenth of its height.
 */
export function paintSign(ctx, w, h, opts = {}) {
  const pad = Math.max(2, Math.min(w, h) * 0.03);
  const bx = pad;
  const by = pad;
  const bw = w - pad * 2.4;
  const bh = h - pad * 2.4;
  const r = Math.min(bw, bh) * 0.06;
  const board = (x, y, ww, hh) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  };
  ctx.save();
  /* The shadow, then the board over it. */
  ctx.fillStyle = 'rgba(40, 34, 60, 0.35)';
  board(bx + pad * 0.7, by + pad * 0.9, bw, bh);
  ctx.fill();
  const g = ctx.createLinearGradient(0, by, 0, by + bh);
  g.addColorStop(0, '#ece6d8');
  g.addColorStop(1, '#d3ccbd');
  ctx.fillStyle = g;
  board(bx, by, bw, bh);
  ctx.fill();
  ctx.lineWidth = Math.max(1, pad * 0.45);
  ctx.strokeStyle = 'rgba(70, 62, 90, 0.55)';
  board(bx + pad * 0.9, by + pad * 0.9, bw - pad * 1.8, bh - pad * 1.8);
  ctx.stroke();
  ctx.restore();
  if (opts.logo) {
    const m = Math.min(bw, bh) * 0.12;
    fitInto(ctx, opts.logo, bx + m, by + m, bw - m * 2, bh - m * 2);
  }
  /* Screws last, over everything. */
  ctx.fillStyle = 'rgba(80, 74, 100, 0.8)';
  const sr = Math.max(1, pad * 0.35);
  for (const [sx, sy] of [[0.04, 0.12], [0.96, 0.12], [0.04, 0.88], [0.96, 0.88]]) {
    ctx.beginPath();
    ctx.arc(bx + bw * sx, by + bh * sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
}

/*
 * BILLBOARD. Framed neatly across the whole face.
 *
 * Clean paper to the edges of the face (the board's own frame is geometry,
 * so this is only the sheet), a hair line a few percent in from the edge,
 * and the mark centred inside it with a wide margin. Opaque: it replaces
 * what the board was advertising, so no text shows through.
 */
export function paintBillboard(ctx, w, h, opts = {}) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#ebe6da');
  g.addColorStop(1, '#ddd7c9');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const inset = Math.min(w, h) * 0.05;
  ctx.strokeStyle = 'rgba(70, 62, 90, 0.35)';
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.008);
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  if (opts.logo) {
    const m = Math.min(w, h) * 0.14;
    fitInto(ctx, opts.logo, m, m, w - m * 2, h - m * 2);
  }
}

/* A small seeded generator for the few random choices (which columns drip,
 * how long). Same shape as props/parts.js seededRandom, kept local so this
 * file stays pure canvas. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* One entry point for the planes that choose by name. */
export function paintSponsor(surface, ctx, w, h, opts = {}) {
  switch (surface) {
    case 'sprayed': return paintSprayed(ctx, w, h, opts);
    case 'graffiti': return paintGraffiti(ctx, w, h, opts);
    case 'sign': return paintSign(ctx, w, h, opts);
    case 'billboard': return paintBillboard(ctx, w, h, opts);
    default: return null;
  }
}
