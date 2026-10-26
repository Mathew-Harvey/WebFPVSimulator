/*
 * avatar.js: a pilot's manga portrait, built from parts.
 *
 * Every pilot in a room has a face: a head, hair, eyes, maybe something to
 * wear, in their own colours, and a livery that is both their jacket and
 * their quad. Only the part numbers travel (the board's AVATAR_FIELDS, eight
 * small integers), so a portrait costs a room nothing but those bytes, and
 * every machine draws it here from the same atlas.
 *
 * THE PARTS are the owner's Grok sheets of 25 October 2026, cut and packed
 * into assets/avatar/parts.png (NOTICE, "Pilot avatars"; src/net/avatarparts.js
 * says where each sits). They are drawn in key colours: skin and anything
 * else meant to take the skin tone is white or grey, hair is blue, irises
 * are magenta, a shirt and anything worn is green. Recolouring reads the
 * hue band and keeps the shading, so a key pixel at half the key's
 * brightness is the new colour at half brightness, and one brighter than
 * the key goes toward white. This is the thread's compose.py, line for line,
 * so a portrait here is the one the preview sheet showed the owner.
 *
 * An EXPRESSION is a face for a line: calm, hello, laugh, wow, smug, oops,
 * fierce and crash. It picks the eyes from the pilot's eye style, a mouth,
 * and a mark (a blush, a sweat drop, an anger vein), so "Crashed..." always
 * comes with the oops face, as the dialogue promises.
 *
 * COST. Nothing here runs in flight. A portrait is composed the first time
 * it is asked for, a few milliseconds of canvas work, and kept. The atlas
 * (about 140 KB) is fetched the first time a portrait is asked for, which
 * is the first time a pilot opens Fly together or a room, never for a solo
 * flight.
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

import { PARTS } from './avatarparts.js';

const ATLAS_URL = new URL('../../assets/avatar/parts.png', import.meta.url).href;

/* The board's fields (src/rooms.js AVATAR_FIELDS), each an integer 0 to 31. */
export const AVATAR_FIELDS = ['face', 'hair', 'eyes', 'acc', 'skin', 'hairColour', 'eyeColour', 'livery'];

export const HEADS = ['oval', 'round', 'sharp', 'square'];
export const HAIRS = ['spiky', 'bob', 'long', 'ponytail', 'buzz', 'messy', 'buns', 'twintails'];
/* Wear: 0 is nothing. */
export const WEARS = ['', 'goggles', 'fpv', 'headphones', 'cap', 'glasses', 'beanie', 'headband', 'scarf'];
/* An eye style is the pair a pilot's calm face wears; the other faces take
 * their eyes from the same family, bright or sleepy. */
export const EYE_STYLES = ['bright-calm', 'bright-calm2', 'bright-calm3', 'sleepy-calm', 'sleepy-calm2', 'sleepy-calm3'];
export const SKINS = ['#ffe0c7', '#f5c9a6', '#e0ac86', '#c68863', '#9c6644', '#6f4429'];
export const HAIR_COLOURS = ['#2b2b33', '#6b4226', '#e8c66a', '#c2452d', '#3a6fd8', '#f28ab8', '#3faf6b', '#ededed', '#7b52c9'];
export const EYE_COLOURS = ['#7a4a2a', '#3b82f6', '#2e9e5b', '#e0a030', '#9b59d0', '#d02f7c'];
/*
 * Liveries, by the avatar's livery number less one; 0 is "none chosen" and
 * takes one from the pilot's id. The product's own colours first, then the
 * brighter ones a pilot picks so their friends can find them. Kept apart
 * from mint, which this product paints a record in. src/render/roomcraft.js
 * paints the quads from this same list.
 */
export const LIVERIES = Object.freeze([
  0xe8a8b8, 0xffd45c, 0x9db3c8, 0xf3ead4, 0xff7a59, 0x5ab0ff,
  0xb07cff, 0xff5c8a, 0x3fd0c9, 0xc9e265, 0xff9e3d, 0xe0e4ea,
]);

/* Names for the editor's buttons. */
export const PART_NAMES = {
  face: ['Oval', 'Round', 'Sharp', 'Square'],
  hair: ['Spiky', 'Bob', 'Long', 'Ponytail', 'Buzz', 'Messy', 'Buns', 'Twin tails'],
  eyes: ['Bright', 'Bright two', 'Bright three', 'Sleepy', 'Sleepy two', 'Sleepy three'],
  acc: ['Nothing', 'Goggles', 'FPV goggles', 'Headphones', 'Cap', 'Glasses', 'Beanie', 'Headband', 'Scarf'],
};
/* How many of each field there are, for the editor and for a roll. */
export const FIELD_COUNTS = {
  face: HEADS.length,
  hair: HAIRS.length,
  eyes: EYE_STYLES.length,
  acc: WEARS.length,
  skin: SKINS.length,
  hairColour: HAIR_COLOURS.length,
  eyeColour: EYE_COLOURS.length,
  livery: LIVERIES.length + 1,
};

export const EXPRESSIONS = ['calm', 'hello', 'laugh', 'wow', 'smug', 'oops', 'fierce', 'crash'];

/* The livery's index into LIVERIES, from the avatar or else from the id. */
export function liveryIndex(avatar, id) {
  const n = avatar && Number.isInteger(avatar.livery) && avatar.livery > 0
    ? avatar.livery - 1
    : Number(id) || 0;
  return ((n % LIVERIES.length) + LIVERIES.length) % LIVERIES.length;
}

export function liveryCss(avatar, id) {
  return `#${LIVERIES[liveryIndex(avatar, id)].toString(16).padStart(6, '0')}`;
}

/* Every field in range, whatever came in: a pilot from an older build, a
 * board that sent nothing, a value someone typed into storage. */
export function cleanAvatar(raw) {
  const a = {};
  for (const k of AVATAR_FIELDS) {
    const v = raw && Number.isInteger(raw[k]) ? raw[k] : 0;
    a[k] = v >= 0 && v < FIELD_COUNTS[k] ? v : 0;
  }
  return a;
}

/* A new face, from any source of numbers in [0, 1). Livery is always chosen,
 * so a rolled pilot is never the colour their id happened to give. */
export function rollAvatar(rand = Math.random) {
  const pick = (n) => Math.min(n - 1, Math.floor(rand() * n));
  return {
    face: pick(HEADS.length),
    hair: pick(HAIRS.length),
    eyes: pick(EYE_STYLES.length),
    /* One in four wear nothing, so a room is not all goggles. */
    acc: rand() < 0.25 ? 0 : 1 + pick(WEARS.length - 1),
    skin: pick(SKINS.length),
    hairColour: pick(HAIR_COLOURS.length),
    eyeColour: pick(EYE_COLOURS.length),
    livery: 1 + pick(LIVERIES.length),
  };
}

/* ------------------------------------------------------------------ *
 * Expressions
 * ------------------------------------------------------------------ */

/* An expression's eyes, from the pilot's eye style. */
function eyesFor(style, expr) {
  const sleepy = style.startsWith('sleepy');
  const odd = EYE_STYLES.indexOf(style) % 2 === 1;
  switch (expr) {
    case 'hello': return sleepy ? 'sleepy-happy' : 'bright-happy';
    case 'smug': return sleepy ? 'sleepy-smug' : 'bright-smug';
    case 'laugh': return 'bright-laugh';
    case 'wow': return odd ? 'round-surprised2' : 'round-surprised';
    case 'oops': return odd ? 'bright-oops2' : 'bright-oops';
    case 'fierce': return odd ? 'bright-fierce2' : 'bright-fierce';
    case 'crash': return 'round-surprised3';
    default: return style;
  }
}

const MOUTHS = {
  calm: 'calm', hello: 'smile', laugh: 'laugh', wow: 'o', smug: 'smirk', oops: 'wobble', fierce: 'grit', crash: 'wobble',
};
const MARKS = {
  hello: 'blush', laugh: 'note', wow: 'lines', smug: 'sparkles', oops: 'sweat', fierce: 'vein', crash: 'dizzy',
};
/* Where each mark sits, as a share of the face: across from the face's
 * centre, down from the skull top, and the mark's width. compose.py's. */
const MARK_AT = {
  sweat: [0.42, 0.18], vein: [-0.36, 0.02], sparkles: [0.62, 0.05], lines: [0, -0.1],
  note: [0.66, 0.3], dizzy: [0, -0.12],
};

function mouthFor(expr, open) {
  const m = MOUTHS[expr] || 'calm';
  if (m === 'o') {
    return 'mouth-o-open';
  }
  if (open) {
    return m === 'calm' ? 'mouth-talk-open' : `mouth-${m}-open`;
  }
  return `mouth-${m}-shut`;
}

/* ------------------------------------------------------------------ *
 * The atlas and recolouring
 * ------------------------------------------------------------------ */

let atlasPromise = null;
let atlasData = null;
let atlasW = 0;

/* Fetched once, on the first portrait anybody asks for. */
export function loadAvatarAtlas() {
  if (!atlasPromise) {
    atlasPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        atlasData = g.getImageData(0, 0, c.width, c.height).data;
        atlasW = c.width;
        resolve();
      };
      img.onerror = () => {
        atlasPromise = null;
        reject(new Error('The avatar parts did not load.'));
      };
      img.src = ATLAS_URL;
    });
  }
  return atlasPromise;
}

export function avatarAtlasReady() {
  return Boolean(atlasData);
}

/* Hue in degrees, saturation 0 to 1, value 0 to 255: common.py's hsv. */
function hsv(r, g, b, out) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  out.s = mx > 0 ? d / Math.max(mx, 1) : 0;
  out.v = mx;
  if (d <= 0) {
    out.h = 0;
    return;
  }
  let h;
  if (r === mx) {
    h = (mx - b) / d - (mx - g) / d;
  } else if (g === mx) {
    h = 2 + (mx - r) / d - (mx - b) / d;
  } else {
    h = 4 + (mx - g) / d - (mx - r) / d;
  }
  out.h = ((((h / 6) % 1) + 1) % 1) * 360;
}

const SKIN = (h, s) => s < 0.15;
const CLOTH = (h, s) => s > 0.12 && h > 80 && h < 175;
const HAIR = (h, s) => s > 0.12 && h > 190 && h < 255;
const IRIS = (h, s) => s > 0.25 && h > 285 && h < 355;
const GLASS = (h, s, v) => s < 0.1 && v > 150;
const LENSES = new Set(['wear-glasses', 'wear-goggles']);

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* The brightness a part's key pixels are drawn at: the 75th percentile of
 * the ones fully inked, as key_value in compose.py. */
const keys = new Map();
function keyValue(name, rule) {
  const id = `${name}|${rule.name}`;
  if (keys.has(id)) {
    return keys.get(id);
  }
  const [x0, y0, w, h] = PARTS[name].rect;
  const vs = [];
  const c = { h: 0, s: 0, v: 0 };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = ((y0 + y) * atlasW + x0 + x) * 4;
      if (atlasData[i + 3] < 230) {
        continue;
      }
      hsv(atlasData[i], atlasData[i + 1], atlasData[i + 2], c);
      if (rule(c.h, c.s, c.v)) {
        vs.push(c.v);
      }
    }
  }
  vs.sort((a, b) => a - b);
  const v = vs.length ? vs[Math.min(vs.length - 1, Math.floor(vs.length * 0.75))] : 255;
  keys.set(id, v);
  return v;
}

/*
 * One part out of the atlas, recoloured, on a canvas of its own. `jobs` is
 * a list of [rule, hex, keyV or null]; a pixel takes the first rule it
 * matches. Kept by name and colours, because a room of sixteen shares a
 * handful of heads and hair colours.
 */
const partCache = new Map();
function partCanvas(name, jobs) {
  const id = `${name}|${jobs.map((j) => `${j[0].name}${j[1]}`).join(',')}`;
  const kept = partCache.get(id);
  if (kept) {
    return kept;
  }
  const [x0, y0, w, h] = PARTS[name].rect;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const plan = jobs.map(([rule, hex, kv]) => ({
    rule, rgb: rgbOf(hex), kv: kv || keyValue(name, rule),
  }));
  const lens = LENSES.has(name);
  const p = { h: 0, s: 0, v: 0 };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = ((y0 + y) * atlasW + x0 + x) * 4;
      const o = (y * w + x) * 4;
      const a = atlasData[i + 3];
      let r = atlasData[i];
      let gg = atlasData[i + 1];
      let b = atlasData[i + 2];
      let alpha = a;
      if (a > 0) {
        hsv(r, gg, b, p);
        for (const job of plan) {
          if (!job.rule(p.h, p.s, p.v)) {
            continue;
          }
          const shade = p.v / job.kv;
          if (shade <= 1) {
            r = job.rgb[0] * shade;
            gg = job.rgb[1] * shade;
            b = job.rgb[2] * shade;
          } else {
            const t = Math.min(1, Math.max(0, (shade - 1) / Math.max(255 / job.kv - 1, 1e-3)));
            r = job.rgb[0] + (255 - job.rgb[0]) * t;
            gg = job.rgb[1] + (255 - job.rgb[1]) * t;
            b = job.rgb[2] + (255 - job.rgb[2]) * t;
          }
          break;
        }
        /* Glass is see through: the eyes show behind the lenses. Read
         * from the part as drawn, before any colour went on. */
        if (lens && GLASS(p.h, p.s, p.v)) {
          alpha = a * 0.28;
        }
      }
      d[o] = r;
      d[o + 1] = gg;
      d[o + 2] = b;
      d[o + 3] = alpha;
    }
  }
  g.putImageData(img, 0, 0);
  if (partCache.size > 400) {
    partCache.clear();
  }
  partCache.set(id, c);
  return c;
}

/* ------------------------------------------------------------------ *
 * Composing a portrait
 * ------------------------------------------------------------------ */

const HATS = new Set(['cap', 'beanie']);
const TAILS = new Set(['twintails']);
const HAT_LIP = 0.05;
/* Wear that is drawn dark whatever the livery: goggles, glasses and cans
 * are kit, a cap or a scarf is clothing. */
const KIT = new Set(['goggles', 'fpv', 'headphones', 'glasses']);
const KIT_COLOUR = '#3a3f46';

function layer(side) {
  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  return c;
}

/*
 * HAIR UNDER A HAT. A hat hides the hair under and above it, column by
 * column, so spikes and buns do not poke through the crown: inside the
 * hat's columns the hair stops a lip above the hat's bottom edge, where the
 * hat covers the cut.
 *
 * Beyond the hat's sides there is nothing to cover a cut, and that is where
 * the first version showed. It carried the brim on level, so a bob or long
 * hair under a beanie came out as a square block with a flat top and a
 * corner (the owner, 2026-10-26: "the hat and the hair don't work together
 * due to the overlays being square"). Now the hair comes out from under the
 * rim and falls away in a rounded shoulder: a quarter ellipse from the rim
 * at the hat's edge down to the hair's outer edge, as hair pushed down by a
 * hat does. The new edge gets an ink line, the width of the parts' own, so
 * it reads as drawn rather than cut. Twin tails come out at the sides above
 * the brim, so their sides are left alone.
 *
 * Once per portrait, kept with it, never in flight.
 */
const HAT_INK = [24, 19, 22];
function tuckUnderHat(hg, worn, side, H, tails) {
  const hat = worn.getContext('2d').getImageData(0, 0, side, side).data;
  const bottom = new Float32Array(side).fill(-1);
  let left = side;
  let right = -1;
  for (let x = 0; x < side; x += 1) {
    for (let y = side - 1; y >= 0; y -= 1) {
      if (hat[(y * side + x) * 4 + 3] > 128) {
        bottom[x] = y;
        left = Math.min(left, x);
        right = Math.max(right, x);
        break;
      }
    }
  }
  if (right < 0) {
    return;
  }
  const img = hg.getImageData(0, 0, side, side);
  const hd = img.data;
  const lip = HAT_LIP * H;
  const cut = new Float32Array(side).fill(-1);
  for (let x = left; x <= right; x += 1) {
    cut[x] = bottom[x] >= 0 ? bottom[x] - lip : -1;
  }
  if (!tails) {
    const rimL = bottom[Math.min(right, left + 8)] - lip;
    const rimR = bottom[Math.max(left, right - 8)] - lip;
    /* How far the hair reaches past each side, read in the band just
     * under the rim, so long hair splaying at the shoulders does not
     * flatten the curve at the top. */
    let minX = left;
    let maxX = right;
    const y0 = Math.max(0, Math.floor(Math.min(rimL, rimR)));
    const y1 = Math.min(side - 1, Math.ceil(Math.max(rimL, rimR) + 0.45 * H));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = 0; x < side; x += 1) {
        if (hd[(y * side + x) * 4 + 3] > 64) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    const wl = Math.max(1, left - minX);
    const wr = Math.max(1, maxX - right);
    for (let x = 0; x < left; x += 1) {
      const t = Math.min(1, (left - x) / wl);
      cut[x] = rimL + 0.9 * wl * (1 - Math.sqrt(1 - t * t));
    }
    for (let x = right + 1; x < side; x += 1) {
      const t = Math.min(1, (x - right) / wr);
      cut[x] = rimR + 0.9 * wr * (1 - Math.sqrt(1 - t * t));
    }
  }
  /* Take the hair away above the line, keeping a fraction of the pixel the
   * line crosses so the edge is not stepped, and note what went. */
  const gone = new Uint8Array(side * side);
  for (let x = 0; x < side; x += 1) {
    const c = cut[x];
    if (c < 0) {
      continue;
    }
    for (let y = 0; y < side && y < c; y += 1) {
      const o = (y * side + x) * 4;
      if (hd[o + 3] === 0) {
        continue;
      }
      if (c - y < 1) {
        hd[o + 3] *= 1 - (c - y);
      } else {
        hd[o + 3] = 0;
      }
      gone[y * side + x] = 1;
    }
  }
  /* The ink line: every hair pixel left within reach of one taken away.
   * Inside the hat's columns it is under the hat; outside, it is the
   * outline the shoulder needs. */
  const r = 2.6;
  const rr = r * r;
  const span = Math.ceil(r);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const o = (y * side + x) * 4;
      if (hd[o + 3] < 40 || gone[y * side + x]) {
        continue;
      }
      let near = Infinity;
      for (let dy = -span; dy <= span && near > 0; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= side) continue;
        for (let dx = -span; dx <= span; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= side || !gone[yy * side + xx]) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 < near) near = d2;
        }
      }
      if (near <= rr) {
        /* Full ink inside the line, eased over its last pixel. */
        const k = Math.min(1, Math.max(0, r + 0.5 - Math.sqrt(near)));
        hd[o] += (HAT_INK[0] - hd[o]) * k;
        hd[o + 1] += (HAT_INK[1] - hd[o + 1]) * k;
        hd[o + 2] += (HAT_INK[2] - hd[o + 2]) * k;
        hd[o + 3] = Math.max(hd[o + 3], 255 * k);
      }
    }
  }
  hg.putImageData(img, 0, 0);
}

/*
 * A head and shoulders, square: the bust the dialogue stands on a speech
 * box and the editor shows large. `open` is the talking mouth. Returns a
 * canvas, kept, so the same face asked for twice is drawn once.
 */
const bustCache = new Map();
export function avatarBust(raw, expr = 'calm', open = false) {
  if (!atlasData) {
    return null;
  }
  const av = cleanAvatar(raw);
  const id = `${AVATAR_FIELDS.map((k) => av[k]).join('.')}|${expr}|${open ? 1 : 0}`;
  const kept = bustCache.get(id);
  if (kept) {
    return kept;
  }
  const head = `head-${HEADS[av.face]}`;
  const hf = PARTS[head].frame;
  const W = hf.width;
  const H = hf.chin - hf.top;
  const side = Math.round(2.05 * W);
  /* The crop, as compose.py takes it, in the head part's pixels. */
  const ox = hf.cx - side / 2;
  const oy = hf.top - 0.3 * H;
  const at = (x, y) => [x - ox, y - oy];
  const livery = liveryCss(av, 0);
  const canvas = layer(side);
  const g = canvas.getContext('2d');

  const draw = (onto, c, x, y, sx = 1, sy = sx) => {
    const [px, py] = at(x, y);
    onto.drawImage(c, px, py, c.width * sx, c.height * sy);
  };
  /* Hair and wear were drawn on a bust of their own; fit that bust's face
   * to this head's, by skull top, chin and width. */
  const fit = (onto, name, jobs) => {
    const f = PARTS[name].frame;
    const sx = W / f.width;
    const sy = H / (f.chin - f.top);
    draw(onto, partCanvas(name, jobs), hf.cx - f.cx * sx, hf.top - f.top * sy, sx, sy);
  };
  const unit = W / 150;

  draw(g, partCanvas(head, [[SKIN, SKINS[av.skin], 255], [CLOTH, livery, 158]]), 0, 0);
  /* Eyes on the line the glasses sit on, as far apart as their lenses. */
  const en = `eyes-${eyesFor(EYE_STYLES[av.eyes], expr)}`;
  const ea = PARTS[en].anchor;
  draw(g, partCanvas(en, [[IRIS, EYE_COLOURS[av.eyeColour], null]]), hf.cx - ea[0] * unit, hf.top + 0.545 * H - ea[1] * unit, unit);
  const mn = mouthFor(expr, open);
  const ma = PARTS[mn].anchor;
  draw(g, partCanvas(mn, []), hf.cx - ma[0] * unit, hf.top + 0.835 * H - ma[1] * unit, unit);
  const mark = MARKS[expr];
  if (mark === 'blush') {
    const r = PARTS['mark-blush'].rect;
    draw(g, partCanvas('mark-blush', []), hf.cx - (r[2] * unit) / 2, hf.top + 0.66 * H, unit);
  }

  const wear = WEARS[av.acc];
  const wearName = wear ? `wear-${wear}` : '';
  const wearJobs = [[CLOTH, KIT.has(wear) ? KIT_COLOUR : livery, null]];
  if (wear === 'scarf') {
    fit(g, wearName, wearJobs);
  }
  let worn = null;
  if (wear && wear !== 'scarf') {
    worn = layer(side);
    fit(worn.getContext('2d'), wearName, wearJobs);
  }
  const hairName = `hair-${HAIRS[av.hair]}`;
  const hair = layer(side);
  const hg = hair.getContext('2d');
  fit(hg, hairName, [[HAIR, HAIR_COLOURS[av.hairColour], null]]);
  if (HATS.has(wear)) {
    tuckUnderHat(hg, worn, side, H, TAILS.has(HAIRS[av.hair]));
  }
  g.drawImage(hair, 0, 0);
  if (worn) {
    g.drawImage(worn, 0, 0);
  }
  if (mark && mark !== 'blush') {
    const r = PARTS[`mark-${mark}`].rect;
    const [fx, fy] = MARK_AT[mark];
    draw(g, partCanvas(`mark-${mark}`, []), hf.cx + fx * W - (r[2] * unit) / 2, hf.top + fy * H - (r[3] * unit) / 2, unit);
  }
  if (bustCache.size > 240) {
    bustCache.clear();
  }
  bustCache.set(id, canvas);
  return canvas;
}

/*
 * A portrait onto a canvas of the caller's, `size` CSS pixels square, at
 * the screen's pixel ratio. `crop` is 'bust' for head and shoulders,
 * 'face' for the round chip a list or a tag wears, or 'eyes' for the
 * editor's eye tiles. Draws nothing until the
 * atlas is in; the caller draws again when loadAvatarAtlas resolves.
 */
export function paintAvatar(target, raw, { expr = 'calm', open = false, crop = 'bust', size = 64 } = {}) {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const px = Math.round(size * dpr);
  if (target.width !== px || target.height !== px) {
    target.width = px;
    target.height = px;
  }
  const g = target.getContext('2d');
  g.clearRect(0, 0, px, px);
  const bust = avatarBust(raw, expr, open);
  if (!bust) {
    return false;
  }
  const av = cleanAvatar(raw);
  const hf = PARTS[`head-${HEADS[av.face]}`].frame;
  const H = hf.chin - hf.top;
  if (crop === 'face') {
    /* The face and the top of the hair: a square 1.2 faces tall from just
     * above the skull, across the face's middle. */
    const s = 1.2 * H;
    const y = 0.3 * H - 0.12 * H;
    const x = bust.width / 2 - s / 2;
    g.drawImage(bust, x, y, s, s, 0, 0, px, px);
  } else if (crop === 'eyes') {
    /* The eyes and the brows, for the editor's eye tiles: a square two
     * thirds of a face across, on the line the eyes are drawn on. */
    const s = 0.66 * H;
    const y = 0.3 * H + 0.545 * H - s * 0.48;
    const x = bust.width / 2 - s / 2;
    g.drawImage(bust, x, y, s, s, 0, 0, px, px);
  } else {
    g.drawImage(bust, 0, 0, bust.width, bust.height, 0, 0, px, px);
  }
  return true;
}

/* A canvas element with a portrait on it, for a sheet's markup. */
export function avatarCanvas(raw, opts = {}) {
  const c = document.createElement('canvas');
  c.className = opts.crop === 'face' ? 'tg-face' : 'tg-bust';
  c.setAttribute('aria-hidden', 'true');
  const size = opts.size || 64;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  if (!paintAvatar(c, raw, opts)) {
    loadAvatarAtlas().then(() => paintAvatar(c, raw, opts)).catch(() => {});
  }
  return c;
}
