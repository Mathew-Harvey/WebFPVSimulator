/*
 * logo.js: the event logo an author puts on their gates.
 *
 * WHAT THIS IS FOR. Every gate on a course carries a printed header board,
 * and on a real race that board carries the chapter's or the sponsor's mark.
 * So the builder takes an image and the renderer puts it on every gate. The
 * whole feature is one field in the document and this file is the half that
 * turns a file somebody chose into something that field can hold.
 *
 * THREE THINGS HAPPEN TO AN UPLOAD, and all three are the reason this is a
 * module rather than an input element.
 *
 *   IT IS RE-DRAWN, not stored. Whatever arrives is painted onto a 1200 by
 *   400 canvas and re-encoded as a PNG. That fixes the aspect ratio once,
 *   here, so the renderer can put a fixed three by one plane on the banner
 *   and no upload is ever stretched; it strips whatever metadata the
 *   original carried; and it means a 12 megapixel photograph and a 40 by 20
 *   icon cost the document the same.
 *
 *   THREE BY ONE, because that is the shape of the space. A gate's header
 *   board is 2.74 m wide and 0.58 m tall, and the number roundel takes the
 *   left end of it, so what is left for a picture is a long strip. Fitted to
 *   two by one the picture came out under a third of the board with a metre
 *   of empty printed vinyl beside it, which is not what a sponsor's board
 *   looks like. A square mark still sits centred and full height; a wide one
 *   now fills the strip it was made for.
 *
 *   IT IS FITTED, not cropped. The image is scaled to fit inside the board
 *   with its own aspect ratio kept and transparent space either side. A logo
 *   with a piece cut off it is worse than a small logo.
 *
 *   IT IS CAPPED. A track is a file people send each other and local storage
 *   is about 5 MB for the whole origin, so the encode steps down through
 *   smaller boards until it fits under model.js's cap, and says so plainly if
 *   it cannot.
 *
 * This module imports model.js for the cap and nothing else. No DOM is
 * touched beyond a canvas and an image element it creates and drops.
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
import { paintGateHeader } from '../art/banners.js';

/*
 * The board the logo is fitted to, and the sizes the encode steps down
 * through until one lands under the document's cap.
 */
export const LOGO_ASPECT = 3;
const BOARD_SIZES = [400, 256, 180, 128].map((bh) => [bh * LOGO_ASPECT, bh]);

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
 * Returns { dataUrl, name, width, height, bytes }.
 */
export async function normaliseLogo(file) {
  if (!file) {
    throw new Error('no file was chosen');
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

  let last = null;
  for (const [bw, bh] of BOARD_SIZES) {
    const canvas = document.createElement('canvas');
    canvas.width = bw;
    canvas.height = bh;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    /* Fit, never fill: the whole mark, centred, with transparent space
     * wherever its own proportions do not match the board's. */
    const scale = Math.min(bw / sw, bh / sh);
    const w = sw * scale;
    const h = sh * scale;
    ctx.drawImage(img, (bw - w) * 0.5, (bh - h) * 0.5, w, h);
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch (e) {
      throw new Error('that image cannot be re-encoded by this browser. Save it as a PNG and try again.');
    }
    last = { dataUrl, width: bw, height: bh };
    if (dataUrl.length <= LOGO_MAX_CHARS && isUsableLogo(dataUrl)) {
      return {
        dataUrl,
        name: String(file.name || 'logo'),
        width: bw,
        height: bh,
        bytes: dataUrl.length,
      };
    }
  }
  throw new Error(
    `that image will not compress under ${Math.round(LOGO_MAX_CHARS / 1024)} kB even at `
    + `${last.width} by ${last.height}. A flat logo rather than a photograph is what fits.`,
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

  const numberZone = 0.22;
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
