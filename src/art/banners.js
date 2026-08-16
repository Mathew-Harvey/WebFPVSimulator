/*
 * banners.js: the printed vinyl a race course is dressed in.
 *
 * WHAT THIS IS. Every gate on a drone racing course wears printed banner
 * sleeves, and every course is lined with printed teardrop flags. The gates
 * and walls are white vinyl, with the event's mark sitting on the header
 * board, and the flags keep the navy, red and chequer language that says
 * racing from further away than a wordmark can be read. This module paints
 * that onto canvases. It knows nothing about Three.js, nothing about the
 * physics, and nothing about the track document.
 *
 * WHY IT IS SHARED AND WHY IT LIVES HERE. Two consumers need identical
 * artwork: src/render/scene.js dresses the world with it, and
 * src/trackbuilder/view3d.js dresses the AUTHOR'S PREVIEW with it, so that
 * what somebody builds looks like what they fly. The builder is not allowed
 * to import the simulator (see src/trackbuilder/schema.md), so the artwork
 * cannot live in src/render. It is not the game and it is not the builder: it
 * is the art both of them draw from, so it is its own directory.
 *
 * NO TRADEMARKS. The reference for this look is a MultiGP course, and what is
 * reproduced is the FORM: a white header board, sleeve banners down the
 * uprights, a chequered flag band as a border, teardrop flags with a navy or
 * red sweep. The mark on the board is whatever the author uploads, and with
 * nothing uploaded it is a chequered flag device this file draws, not
 * anybody's logo.
 *
 * THE CALLER OWNS THE CANVAS. Each painter takes a 2D context and its size
 * and paints the whole of it. The caller decides how big, wraps it in
 * whatever texture object it uses, and repaints when the logo finishes
 * decoding. That is what lets one module serve two renderers.
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
 * The palette.
 *
 * WHITE IS NOT WHITE, and that is a measurement rather than a preference.
 * The renderer's own note is that a pure white flag came out brighter than
 * the sky, which inverts the value structure the whole art direction rests
 * on and makes seventy two pieces of dressing louder than the gate the pilot
 * is trying to find. The horizon band is 0xf2e3cb, so the vinyl sits a clear
 * step under it at 0xdcd6ca: on screen it still reads as white banner
 * against grass, and it can never out value the sky.
 */
export const BANNER = {
  vinyl: '#dcd6ca',
  vinylShade: '#c7c0b3',
  navy: '#1e3566',
  navyDeep: '#152648',
  red: '#b8332c',
  ink: '#1a1f2b',
  chequerDark: '#23272f',
  chequerLight: '#eae6dd',
};

/* The same colours as 0xRRGGBB, for the two Three.js consumers that cannot
 * feed a CSS string into a MeshLambertMaterial. Named rather than parsed at
 * each call site so a typo in a colour name fails here, once. */
export function bannerHex(name) {
  const s = BANNER[name];
  if (typeof s !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s)) {
    throw new Error(`banners: ${name} is not a six digit colour`);
  }
  return Number.parseInt(s.slice(1), 16);
}

/* A chequered flag band. `cells` counts the checks ACROSS the band, and the
 * band is always two checks deep, which is what a racing chequer is. */
export function chequer(ctx, x, y, w, h, cells, dark = BANNER.chequerDark, light = BANNER.chequerLight) {
  const cw = w / Math.max(1, cells);
  const ch = h / 2;
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? dark : light;
      ctx.fillRect(x + i * cw, y + j * ch, cw + 0.5, ch + 0.5);
    }
  }
}

/*
 * The default mark: a chequered flag on a staff, drawn rather than typed, so
 * a course with no logo still reads as a race course and not as a blank
 * board. Fits the box it is given, centred.
 */
export function chequerDevice(ctx, x, y, w, h) {
  const staffW = Math.max(2, w * 0.045);
  ctx.fillStyle = BANNER.ink;
  ctx.fillRect(x, y, staffW, h);
  const fw = w - staffW * 2.2;
  const fh = h * 0.62;
  const fx = x + staffW * 2.2;
  const fy = y + h * 0.06;
  ctx.save();
  ctx.beginPath();
  /* A flag flying, not a rectangle: the fly edge waves and the bottom lifts,
   * which is the difference between a chequered flag and a chessboard. */
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx + fw, fy - fh * 0.12);
  ctx.lineTo(fx + fw, fy + fh * 0.78);
  ctx.lineTo(fx, fy + fh);
  ctx.closePath();
  ctx.clip();
  const cells = 6;
  const cw = fw / cells;
  const chh = fh / 4;
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? BANNER.chequerDark : BANNER.chequerLight;
      ctx.fillRect(fx + i * cw, fy - fh * 0.14 + j * chh, cw + 0.5, chh + 0.5);
    }
  }
  ctx.restore();
}

/*
 * Draw an image to fit a box, keeping its own proportions, centred. Every
 * painter below takes the logo this way, so an upload is never stretched and
 * never cropped whatever shape it is.
 */
function fit(ctx, img, x, y, w, h) {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  if (!(sw > 0 && sh > 0)) {
    return;
  }
  const k = Math.min(w / sw, h / sh);
  ctx.drawImage(img, x + (w - sw * k) * 0.5, y + (h - sh * k) * 0.5, sw * k, sh * k);
}

/*
 * THE GATE HEADER, the banner sleeved over the top rail.
 *
 * White vinyl, with the sponsor's mark sitting on it. That is the whole of
 * the board a pilot reads at commit range: a pale sheet and a picture, not
 * a navy field with a mark squeezed between two red flashes.
 *
 * BOTH ENDS ARE LEFT CLEAR, and it has to be both. The gate number sits at
 * one end as real geometry, a pale roundel with the numeral raised on it,
 * because a number painted into this texture would mean one texture per gate
 * and fourteen gates would be fourteen draw calls where there is now one.
 * The banner is printed on both faces of the header and the reverse is
 * mirrored, so the end the roundel lands on is the LEFT end from one side
 * and the RIGHT end from the other. Clearing one end would put the roundel
 * on top of the mark for every pilot arriving the other way.
 *
 * `numberZone` is that clear fraction of the width at each end, so the two
 * halves of the design cannot disagree about where the roundel lands.
 */
/*
 * Fraction of a gate header's width kept clear at EACH end for the roundel.
 * The painter here and everyone who has to place a roundel ON a header have
 * to agree, and they did not: this number was written out again in
 * render/scene.js and a third time in trackbuilder/logo.js, each with a
 * comment claiming it was shared. Exported so the claim is true.
 */
export const HEADER_NUMBER_ZONE = 0.22;

export function paintGateHeader(ctx, w, h, opts = {}) {
  const numberZone = opts.numberZone ?? HEADER_NUMBER_ZONE;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BANNER.vinyl;
  ctx.fillRect(0, 0, w, h);

  /* The hems: a shade darker bound edge top and bottom, which is what stops
   * a white sheet reading as a hole in the sky at any distance. */
  ctx.fillStyle = BANNER.vinylShade;
  ctx.fillRect(0, 0, w, h * 0.045);
  ctx.fillRect(0, h * 0.955, w, h * 0.045);

  /*
   * A chequer band along the foot, full width. On a white board this is the
   * one dark motif that still says racing from further away than the logo
   * can be read. A racing chequer is a border, not a stripe, so it stays
   * thin: most of the board is the white the mark sits on.
   */
  chequer(ctx, 0, h * 0.88, w, h * 0.075, Math.round(w / (h * 0.06)));

  const left = w * numberZone;
  const right = w * (1 - numberZone);
  /* The mark gets nearly the whole board between the hems and the chequer.
   * Fitted, never cropped: a logo with a piece cut off it is worse than a
   * small logo. */
  const boxY = h * 0.07;
  const boxH = h * 0.79;
  if (opts.logo) {
    fit(ctx, opts.logo, left, boxY, right - left, boxH);
  } else {
    chequerDevice(ctx, left + (right - left) * 0.30, boxY, (right - left) * 0.40, boxH);
  }
}

/*
 * THE UPRIGHT SLEEVE, the banner wrapped round each leg.
 *
 * Painted the tall way: the canvas is narrow and tall and lands on the gate
 * the same way up. White vinyl, a chequer column down the outer edge so a
 * white wall still has a silhouette, and the mark turned on its side in the
 * middle, which is exactly what a printed sleeve does with a horizontal logo.
 */
export function paintGateSleeve(ctx, w, h, opts = {}) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  /*
   * `flip` paints the whole design mirrored, for the far leg of a gate, so
   * the chequer column runs down the OUTSIDE on both sides. Done in the
   * paint rather than with a negative scale on the mesh, because a negative
   * scale inverts a mesh's winding and a single sided panel turned inside
   * out is a black slab or nothing at all, depending on which pass is
   * looking at it. Both have happened.
   */
  if (opts.flip) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.fillStyle = BANNER.vinyl;
  ctx.fillRect(0, 0, w, h);

  /* The chequer column, down one edge. Narrower than it was: the wall is
   * the white, and the chequer is the border that stops it vanishing. */
  const colW = w * 0.18;
  chequerColumn(ctx, 0, 0, colW, h, Math.round(h / (colW * 0.5)));

  if (opts.logo) {
    /* Turned a quarter, reading up the banner. */
    ctx.save();
    ctx.translate(colW + (w - colW) * 0.5, h * 0.48);
    ctx.rotate(-Math.PI / 2);
    fit(ctx, opts.logo, -h * 0.34, -(w - colW) * 0.42, h * 0.68, (w - colW) * 0.84);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(colW + (w - colW) * 0.5, h * 0.48);
    ctx.rotate(-Math.PI / 2);
    chequerDevice(ctx, -h * 0.16, -(w - colW) * 0.34, h * 0.32, (w - colW) * 0.68);
    ctx.restore();
  }
  ctx.restore();
}

function chequerColumn(ctx, x, y, w, h, cells) {
  const ch = h / Math.max(1, cells);
  const cw = w / 2;
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < 2; i += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? BANNER.chequerDark : BANNER.chequerLight;
      ctx.fillRect(x + i * cw, y + j * ch, cw + 0.5, ch + 0.5);
    }
  }
}

/*
 * THE TEARDROP SAIL.
 *
 * The canvas maps straight onto the sail's own parameters: u across, from the
 * seam on the mast at 0 to the free edge at 1, and v up the mast. So the
 * LEFT of this canvas is the leading edge, and the navy sweep drawn there is
 * the one on the mast, which is what the reference flags all have.
 *
 * `accent` swaps the sweep between navy and red so a run of flags down a
 * course alternates without needing two designs.
 */
export function paintFlagSail(ctx, w, h, opts = {}) {
  const accent = opts.accent === 'red' ? BANNER.red : BANNER.navy;
  const other = opts.accent === 'red' ? BANNER.navy : BANNER.red;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BANNER.vinyl;
  ctx.fillRect(0, 0, w, h);

  /* The sweep down the leading edge, widening toward the head, which is what
   * gives a teardrop flag its shape even before it is cut out. */
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.30, 0);
  ctx.quadraticCurveTo(w * 0.16, h * 0.42, w * 0.34, h * 0.86);
  ctx.lineTo(w * 0.40, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  /* A thin rule of the other colour along the sweep, and a chequer band
   * across the waist. */
  ctx.strokeStyle = other;
  ctx.lineWidth = Math.max(2, w * 0.035);
  ctx.beginPath();
  ctx.moveTo(w * 0.335, 0);
  ctx.quadraticCurveTo(w * 0.195, h * 0.42, w * 0.375, h * 0.86);
  ctx.stroke();

  chequer(ctx, w * 0.42, h * 0.60, w * 0.58, h * 0.10, 5);
  chequer(ctx, w * 0.40, h * 0.14, w * 0.60, h * 0.085, 5);

  if (opts.logo) {
    ctx.save();
    ctx.translate(w * 0.68, h * 0.38);
    ctx.rotate(-Math.PI / 2);
    fit(ctx, opts.logo, -h * 0.18, -w * 0.24, h * 0.36, w * 0.48);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(w * 0.68, h * 0.38);
    ctx.rotate(-Math.PI / 2);
    chequerDevice(ctx, -h * 0.10, -w * 0.20, h * 0.20, w * 0.40);
    ctx.restore();
  }
}

/*
 * A canvas, made the same way by both consumers. Kept here so the two cannot
 * disagree about the size of anything.
 */
export function bannerCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/*
 * The sizes. Chosen from how much of the screen each surface ever fills: a
 * gate header is 2.74 m of vinyl a pilot passes within a metre of, and a
 * sleeve and a sail are read from further out and mostly in silhouette.
 */
export const BANNER_SIZE = {
  /*
   * Each one's ASPECT is the aspect of the surface it lands on, because a
   * chequer whose checks are not square is not a chequered flag. The header
   * is 2.74 by 0.58 m of banner, a sleeve is 0.42 by 1.83, and a sail is
   * 0.87 across by 2.38 up.
   */
  header: [512, 112],
  sleeve: [112, 512],
  sail: [192, 512],
};
