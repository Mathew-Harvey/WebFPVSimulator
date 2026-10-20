/*
 * partnermark.js: a partner's mark, painted into a freestyle map as a sign.
 *
 * WHAT IT IS. The partners in src/partners/roster.js are painted into every
 * freestyle map, the town and every map somebody built, the owner's ask of
 * 2026-09-27: "their logos always added to any freestyle map, finding one
 * pops an achievement like the old STF one". The STF mark is spray paint,
 * a stencil with overspray, because it is the project's own tag on the
 * world. A partner's mark is their livery, so it is a painted sign: the
 * partner's own artwork, in their own colours, on a flat panel of the
 * roster's `mark.field` with the town's ink line round it and a little
 * weather on it, the way a club's banner on a practice field or a shop's
 * panel over a door looks after a season outside. The artwork is never
 * redrawn, recoloured or stretched here: it is drawn from the partner's own
 * file, whole, at its own aspect.
 *
 * THE SIGN'S SHAPE follows the artwork: the logo takes LOGO_SHARE of the
 * sign's height and the same margin is left at each end, so the sign is
 * signAspect(p) = LOGO_SHARE * aspect + (1 - LOGO_SHARE) wide for each
 * metre it is high. ./maps/built/egg.js sizes a partner's wall to that, so
 * the sign is fitted to a wall rather than letterboxed on it.
 *
 * THE INTERFACE, which src/maps/built/index.js and
 * src/maps/city/places/index.js both call:
 *
 *   signAspect(p) -> number        the sign's width over its height
 *   partnerCanvas(p) -> canvas     the painted sign, SIGN_W wide, made once
 *                                  per partner and cached. The panel is
 *                                  painted at once; the artwork arrives
 *                                  when its file does and repaints every
 *                                  texture already made from the canvas.
 *   partnerDataUrl(p) -> string    the same canvas as a PNG data URL, for
 *                                  the found panel in the HUD.
 *   partnerSignReady(p) -> Promise the canvas, once its artwork has come or
 *                                  failed to, for a map that copies the sign
 *                                  into an atlas of its own (Heads' house).
 *   makePartnerMark(THREE, p, { width, height, look, shade }) -> Mesh
 *       Exactly makeStfMark's contract in ./stf.js: a plane `width` by
 *       `height` in its own XY plane facing +Z, lit by the same cel ramp,
 *       giving back the same share of its own colour at dusk, overcast or
 *       in shade (paintGlow), letterboxed and never stretched, castShadow
 *       false, renderOrder 1, userData.noOutline true. Its name ends in
 *       Trim, 'partnerMarkTrim', for the reason the STF mark's does: the
 *       town's collider fit, cover pass and audit read that suffix as drawn
 *       and not solid, which paint is. userData.partner is the slug.
 *
 * THE FILES are fetched rather than handed to an <img> by address, and made
 * into a picture from the bytes with the type their extension says, because
 * a static server with no MIME table answers an SVG as a stream of bytes
 * and a browser will not draw one of those (see logo() in
 * src/ui/credits.js). They are found from THIS file, two levels up and then
 * LOGO_DIR, so the address is right from index.html and from the board's
 * thumbnail page, src/share/orbit.html, alike. A file that does not load
 * leaves the panel with the partner's name lettered on it, which is still
 * their sign, and says so once in the console.
 *
 * Render only, like ./stf.js: nothing here reaches the physics.
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

import { LOGO_DIR } from '../partners/roster.js';
import { paintMaterial, paintGlow } from './stf.js';

/* How much of the sign's height the artwork takes. The rest is the margin,
 * the same at the ends as above and below, which is what reads as a panel
 * made for the logo rather than a logo on a wall. */
export const LOGO_SHARE = 0.7;

/* Min and max aspect ratios for text-only patron signs, so the size comes
 * out deterministic. */
const TEXT_ASPECT_MIN = 1.5;
const TEXT_ASPECT_MAX = 6.0;

/* Measure the aspect ratio for a text-only sign. Returns the sign's width
 * over its height, clamped to sensible bounds. Falls back to a conservative
 * default in Node (where document is not available). */
function measureTextAspect(text) {
  if (typeof document === 'undefined') {
    const charCount = String(text).length;
    const avgCharAspect = 0.6;
    const logoAspect = charCount * avgCharAspect;
    const signAspect = LOGO_SHARE * logoAspect + (1 - LOGO_SHARE);
    return signAspect < TEXT_ASPECT_MIN ? TEXT_ASPECT_MIN : (signAspect > TEXT_ASPECT_MAX ? TEXT_ASPECT_MAX : signAspect);
  }
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  const testH = 100;
  const bh = testH * LOGO_SHARE;
  const size = Math.round(bh * 0.6);
  g.font = `italic 900 ${size}px system-ui, sans-serif`;
  const wide = g.measureText(text).width;
  const logoAspect = wide / bh;
  const signAspect = LOGO_SHARE * logoAspect + (1 - LOGO_SHARE);
  return signAspect < TEXT_ASPECT_MIN ? TEXT_ASPECT_MIN : (signAspect > TEXT_ASPECT_MAX ? TEXT_ASPECT_MAX : signAspect);
}

export function signAspect(p) {
  if (!p) {
    return 2;
  }
  if (!p.logo) {
    return measureTextAspect(p.short);
  }
  const a = p.logo.aspect > 0 ? p.logo.aspect : 2;
  return LOGO_SHARE * a + (1 - LOGO_SHARE);
}

/* The canvas is this wide and as high as the sign's aspect makes it. */
const SIGN_W = 1024;

/* The town's ink (PAL.ink in src/maps/city/vendored/core/palette.js), for
 * the line round the panel, as ./stf.js writes it out. */
const INK = '#39324f';
/* The line, the rim of transparent canvas outside it, and the corner. */
const LINE = 12;
const RIM = 6;

/* mulberry32, as ./stf.js has it: the same weather on every load. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A seed per partner from its slug, so each sign weathers its own way. */
function seedOf(slug) {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i += 1) {
    h = Math.imul(h ^ slug.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* Dark ink on a light panel and the palette's cream on a dark one, for the
 * lettered name a panel wears until its artwork arrives. */
function onField(field) {
  const hex = String(field).replace('#', '');
  const v = parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16);
  const lum = ((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114;
  return lum > 140 ? '#19171e' : '#f3ead4';
}

/*
 * The panel: the ink line, the field inside it, and the weather, soft
 * patches of the ink's violet and of white laid over the field only, so
 * the line keeps its edge. Then either the artwork or, until it arrives,
 * the partner's short name in heavy type.
 */
function paintSign(canvas, p, img) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const R = seeded(seedOf(p.slug));
  const r = Math.min(H * 0.16, 60);
  g.clearRect(0, 0, W, H);
  g.fillStyle = INK;
  roundRect(g, RIM, RIM, W - 2 * RIM, H - 2 * RIM, r);
  g.fill();
  const inset = RIM + LINE;
  g.fillStyle = p.mark.field;
  roundRect(g, inset, inset, W - 2 * inset, H - 2 * inset, Math.max(2, r - LINE * 0.7));
  g.fill();
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 18; i += 1) {
    const x = R() * W;
    const y = R() * H;
    const rad = 30 + R() * 110;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, R() < 0.5 ? 'rgba(57, 50, 79, 0.10)' : 'rgba(255, 255, 255, 0.08)');
    gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.restore();
  /* The artwork's box: LOGO_SHARE of the height, centred, and the same
   * margin at the ends. The artwork is fitted inside it at its own aspect. */
  const bh = H * LOGO_SHARE;
  const bw = W - (H - bh);
  if (img) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const s = Math.min(bw / iw, bh / ih);
    g.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
  } else {
    g.fillStyle = onField(p.mark.field);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = Math.round(bh * 0.6);
    g.font = `italic 900 ${size}px system-ui, sans-serif`;
    const wide = g.measureText(p.short).width;
    if (wide > bw) {
      size = Math.floor((size * bw) / wide);
      g.font = `italic 900 ${size}px system-ui, sans-serif`;
    }
    g.fillText(p.short, W / 2, H / 2);
  }
}

/* The cache, one entry per partner: the canvas, its data URL, and every
 * texture made from it, so the artwork arriving repaints what a map already
 * shows. A texture leaves its set when its map disposes it. */
const SIGNS = new Map();

const TYPES = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp' };

function loadArtwork(p, entry) {
  if (!p.logo) {
    return Promise.resolve(entry.canvas);
  }
  const file = p.logo.colour;
  const url = new URL(`../../${LOGO_DIR}/${file}`, import.meta.url).href;
  const type = TYPES[String(file).split('.').pop().toLowerCase()] || 'application/octet-stream';
  return fetch(url)
    .then((res) => {
      if (!res.ok) {
        throw new Error(String(res.status));
      }
      return res.arrayBuffer();
    })
    .then((bytes) => new Promise((resolve, reject) => {
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type }));
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('not a picture'));
      };
      img.src = blobUrl;
    }))
    .then((img) => {
      paintSign(entry.canvas, p, img);
      entry.dataUrl = null;
      entry.ready = true;
      for (const t of entry.live) {
        t.needsUpdate = true;
      }
      return entry.canvas;
    })
    .catch((e) => {
      console.warn(`partnermark: ${file} did not load (${e.message}); the lettered panel stands`);
      return entry.canvas;
    });
}

function signFor(p) {
  let entry = SIGNS.get(p.slug);
  if (entry) {
    return entry;
  }
  const canvas = document.createElement('canvas');
  canvas.width = SIGN_W;
  canvas.height = Math.round(SIGN_W / signAspect(p));
  entry = { canvas, dataUrl: null, live: new Set(), ready: !p.logo, loaded: null };
  SIGNS.set(p.slug, entry);
  paintSign(canvas, p, null);
  entry.loaded = loadArtwork(p, entry);
  return entry;
}

export function partnerCanvas(p) {
  return signFor(p).canvas;
}

/* The painted sign once its artwork has arrived, or once it has failed to
 * and the lettered panel stands: for a map that copies the sign into a
 * picture of its own rather than making a texture of the canvas, which the
 * artwork's arrival could not repaint (src/maps/heads/index.js). Never
 * rejects. */
export function partnerSignReady(p) {
  return signFor(p).loaded;
}

export function partnerDataUrl(p) {
  const entry = signFor(p);
  if (!entry.dataUrl) {
    entry.dataUrl = entry.canvas.toDataURL('image/png');
  }
  return entry.dataUrl;
}

export function makePartnerMark(THREE, p, { width, height, look = null, shade = false } = {}) {
  const entry = signFor(p);
  const map = new THREE.CanvasTexture(entry.canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  /* Letterboxed, never stretched: the canvas's rim is transparent and
   * clamping repeats it across the margin. */
  const own = entry.canvas.width / entry.canvas.height;
  const a = width / height;
  if (a > own * 1.001) {
    map.repeat.x = a / own;
    map.offset.x = (1 - map.repeat.x) / 2;
  } else if (a < own / 1.001) {
    map.repeat.y = own / a;
    map.offset.y = (1 - map.repeat.y) / 2;
  }
  entry.live.add(map);
  map.addEventListener('dispose', () => entry.live.delete(map));

  const mat = paintMaterial(THREE, map);
  mat.name = 'partnerMark';
  const glow = paintGlow(look, shade);
  if (glow) {
    mat.emissive.set(0xffffff);
    mat.emissiveMap = map;
    mat.emissiveIntensity = glow;
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.name = 'partnerMarkTrim';
  mesh.userData.partner = p.slug;
  mesh.userData.noOutline = true;
  return mesh;
}
