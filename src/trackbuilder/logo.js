/*
 * logo.js: the sponsors' logos an author puts on their course.
 *
 * WHAT THIS IS FOR. Every gate on a course carries a printed header board,
 * every flag carries a sail, and on a real race those carry the chapter's or
 * the sponsor's logo. A course can hold five of them, dealt out round the
 * gates so each sponsor is on a share of them, and any of them can also be
 * painted on the grass. The whole feature is one list in the document and
 * this file is the half that turns a file somebody chose into something that
 * list can hold.
 *
 * THREE THINGS HAPPEN TO AN UPLOAD, and all three are the reason this is a
 * module rather than an input element.
 *
 *   IT IS RE-DRAWN, not stored. Whatever arrives is painted onto a fresh
 *   canvas and re-encoded as a PNG. That strips whatever metadata the
 *   original carried, and it means a 12 megapixel photograph and a 40 by 20
 *   icon cost the document about the same.
 *
 *   IT KEEPS ITS OWN SHAPE. The canvas is the image's own aspect ratio,
 *   scaled to fit inside a 1200 by 400 box. It used to be that box exactly,
 *   with transparent bars painted either side of a logo that was not three
 *   by one, and that was wrong twice over. Every surface that draws a logo
 *   fits it into a space, so the transparent bars were fitted along with the
 *   ink and a square logo came out a third of the size it should have been;
 *   and a logo painted on the grass has a footprint on the field, which is
 *   its own shape and not the board's.
 *
 *   IT IS CAPPED. A track is a file people send each other, five logos share
 *   one budget, and local storage is about 5 MB for the whole origin, so the
 *   encode steps down through smaller boxes until it fits what is left, and
 *   says plainly how much that was if it cannot.
 *
 * A RASTER IS NEVER ENLARGED. Scaling a 40 by 20 icon up to 1200 by 600 buys
 * no detail and costs a hundred times the bytes: the surfaces that draw it
 * will scale it anyway, and they will scale it exactly as blurrily from the
 * small copy. An SVG is the exception, because scaling a vector up is where
 * its detail comes from, so it is rasterised at the full box.
 *
 * This module imports model.js for the caps and banners.js for the preview.
 * No DOM is touched beyond a canvas and an image element it creates and
 * drops.
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

import { LOGO_MAX_CHARS, isUsableLogo } from './model.js';
import { HEADER_NUMBER_ZONE, paintGateHeader, paintGroundLogo } from '../art/banners.js';

/*
 * The box a logo is fitted inside, and the boxes the encode steps down
 * through until one lands under the budget. 1200 by 400 is the gate header's
 * own proportions at a resolution the header texture never exceeds, so a
 * wide logo loses nothing and a tall one is still 400 px on its long side.
 */
const BOXES = [[1200, 400], [768, 256], [540, 180], [384, 128]];

/* Refused before it is decoded. A browser will happily try to decode a 40
 * megapixel image and take the tab with it. */
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const TYPES = /^image\/(png|jpeg|webp|gif|svg\+xml)$/;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('that file could not be read as an image'));
    };
    img.src = url;
  });
}

/*
 * Turn a chosen file into a data URL the document can hold, or throw with a
 * sentence a person can act on.
 *
 * `budget` is how many characters this ONE logo may spend, which the caller
 * works out from what the other logos on the course already cost. It is
 * never allowed above LOGO_MAX_CHARS, because that is what a reader of the
 * document will accept for a single logo whatever the total says.
 *
 * Returns { dataUrl, name, width, height, bytes }.
 */
export async function normaliseLogo(file, budget = LOGO_MAX_CHARS) {
  const cap = Math.max(0, Math.min(LOGO_MAX_CHARS, Math.round(budget)));
  if (!file) {
    throw new Error('no file was chosen');
  }
  if (cap < 1024) {
    throw new Error('the logos on this track have used their whole size budget. Remove one first.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`that file is ${Math.round(file.size / (1024 * 1024))} MB. The limit is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
  }
  if (file.type && !TYPES.test(file.type)) {
    throw new Error(`${file.type} is not an image this can use. PNG, JPEG, WebP, GIF or SVG.`);
  }
  const img = await loadImage(file);
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  if (!(sw > 0 && sh > 0)) {
    /* An SVG with no intrinsic size. It can be drawn, but not measured, and
     * guessing a size for somebody's artwork is worse than asking. */
    throw new Error('that image has no size of its own. Export it at a fixed pixel size and try again.');
  }
  /* A vector is rasterised at the box; a raster is never enlarged past its
   * own pixels. See the header. */
  const vector = file.type === 'image/svg+xml';

  let last = null;
  for (const [bw, bh] of BOXES) {
    const scale = Math.min(bw / sw, bh / sh, vector ? Infinity : 1);
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch (e) {
      throw new Error('that image cannot be re-encoded by this browser. Save it as a PNG and try again.');
    }
    last = { dataUrl, width: w, height: h };
    if (dataUrl.length <= cap && isUsableLogo(dataUrl)) {
      return {
        dataUrl,
        name: String(file.name || 'logo'),
        width: w,
        height: h,
        bytes: dataUrl.length,
      };
    }
  }
  throw new Error(
    `that image will not compress under ${Math.round(cap / 1024)} kB even at `
    + `${last.width} by ${last.height}. A flat logo rather than a photograph is what fits, `
    + 'and removing another logo frees more of the budget.',
  );
}

/*
 * Draw the gate's header board as the renderer builds it, so an author sees
 * where their logo lands before they fly it rather than after.
 *
 * The print comes from src/art/banners.js, the same painter the world and
 * the 3D preview use, so this cannot drift into a maroon board while the
 * gates in the air are white. The roundel is geometry in the world, so it
 * is drawn on top here as a stand in, in the number zone the painter left
 * clear. The builder must not import the renderer; sharing the artwork
 * module is the allowed half of that split.
 */
export function drawBannerPreview(canvas, dataUrl, image) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 300;
  /* 0.58 m of board on 2.74 m of gate, so the preview is the board's own
   * shape rather than a strip that flatters a logo the gate will not. */
  const h = Math.round(w * 0.212);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const logo = dataUrl && image && image.complete && image.naturalWidth > 0 ? image : null;
  paintGateHeader(ctx, w, h, { logo });

  const numberZone = HEADER_NUMBER_ZONE;
  const roundelR = h * 0.32;
  const roundelX = w * numberZone * 0.5;
  ctx.beginPath();
  ctx.arc(roundelX, h * 0.5, roundelR, 0, Math.PI * 2);
  ctx.fillStyle = '#e4d9bf';
  ctx.fill();
  ctx.strokeStyle = '#18202f';
  ctx.lineWidth = Math.max(2, h * 0.045);
  ctx.stroke();
  ctx.fillStyle = '#18202f';
  ctx.font = `700 ${Math.round(roundelR * 1.25)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('1', roundelX, h * 0.54);
}

/*
 * The same logo as it lands on the grass, on a strip of mown turf, so an
 * author choosing a logo for a painted footprint sees it the way a pilot
 * will rather than as a picture on a dark panel.
 *
 * `wm` by `dm` is the footprint in metres, so the preview's proportions are
 * the decal's own and a logo in a box the wrong shape reads small here for
 * exactly the reason it will read small on the field.
 */
export function drawGroundPreview(canvas, image, wm = 10, dm = 4) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 300;
  const shape = Math.max(0.1, Math.min(3, (dm || 1) / Math.max(0.1, wm || 1)));
  const h = Math.round(w * shape);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const logo = image && image.complete && image.naturalWidth > 0 ? image : null;
  /* Stripes at the preview's own scale: the metres per stripe are the
   * field's, so a 10 m footprint shows two mower passes across it. */
  paintGroundLogo(ctx, w, h, { logo, stripePx: (w / Math.max(0.1, wm)) * 5 });
}
