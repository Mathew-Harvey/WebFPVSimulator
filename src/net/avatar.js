/*
 * avatar.js: a pilot's manga portrait, built from parts.
 *
 * Every pilot in a room has a face: a head, hair, eyes, maybe something to
 * wear, in their own colours, and a livery that is both their jacket and
 * their quad. Only the part numbers travel (the board's AVATAR_FIELDS, nine
 * small integers, the last the career's title), so a portrait costs a room
 * nothing but those bytes, and every machine draws it here from the same
 * atlas.
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

import { PARTS, UNIT } from './avatarparts.js';
import { TITLE_IDS } from '../career/titles.js';

const ATLAS_URL = new URL('../../assets/avatar/parts.png', import.meta.url).href;

/* The board's fields (src/rooms.js AVATAR_FIELDS), each an integer 0 to 31:
 * the eight parts a portrait is drawn from, then `title`, the career's word
 * for how far the pilot has flown (src/career/titles.js), which the room
 * prints beside the handle and the portrait never reads. The editor never
 * sets it: src/net/together.js adds it to the look it sends. */
export const LOOK_FIELDS = ['face', 'hair', 'eyes', 'acc', 'skin', 'hairColour', 'eyeColour', 'livery'];
export const AVATAR_FIELDS = [...LOOK_FIELDS, 'title'];

export const HEADS = ['oval', 'round', 'sharp', 'square'];
/* The styles after the twin tails are drawn here rather than cut from the
 * atlas (see drawHair): the short cuts the owner's four legends wear, a
 * quiff, a side parting, slicked back and shaved (the owner, 2026-10-26:
 * "Add Joshua bardwell, nick burns, heads and botgrinder characterisation
 * to the avatar picker / builder", and then "Just inter mingle the
 * characters, don't make a legends tab"). */
export const HAIRS = ['spiky', 'bob', 'long', 'ponytail', 'buzz', 'messy', 'buns', 'twintails',
  'quiff', 'sidepart', 'slick', 'shaved'];
/* The editor's order: the short cuts beside the buzz, then the long ones. */
export const HAIR_STYLE_ORDER = [4, 11, 10, 9, 8, 0, 5, 1, 6, 3, 2, 7];
/* Wear: 0 is nothing. The ones after the scarf are drawn here rather than
 * cut from the atlas (see drawWear). The last three are the legends'
 * glasses: thin dark specs, clear frames and thick black frames. */
export const WEARS = ['', 'goggles', 'fpv', 'headphones', 'cap', 'glasses', 'beanie', 'headband', 'scarf',
  'cat', 'bow', 'flower', 'stars', 'prop', 'shades', 'halo', 'specs', 'clear', 'frames'];
/* The editor's order: kit, then hats, then what is pinned in the hair. */
export const ACC_ORDER = [0, 2, 1, 3, 5, 16, 17, 18, 14, 4, 6, 13, 7, 9, 10, 11, 12, 15, 8];
/* An eye style is the pair a pilot's calm face wears; the other faces take
 * their eyes from the same family, bright or sleepy. */
export const EYE_STYLES = ['bright-calm', 'bright-calm2', 'bright-calm3', 'sleepy-calm', 'sleepy-calm2', 'sleepy-calm3'];
/*
 * FACIAL HAIR, drawn here: stubble, a short beard, a full one and a
 * moustache. It rides in the eyes' number, a style and a beard each:
 * eyes = style + 6 * beard, so the board's eight numbers stay eight and
 * every one stays under 32, as the face marks ride in the face's. An older
 * build reads a number past its six styles as the first style and no beard,
 * which is a pilot without a beard, not a broken one.
 */
export const BEARDS = ['', 'stubble', 'short', 'full', 'moustache'];
export const eyeStyleOf = (av) => (av.eyes || 0) % EYE_STYLES.length;
export const beardOf = (av) => Math.floor((av.eyes || 0) / EYE_STYLES.length) % BEARDS.length;
export const eyesOf = (style, beard) => style + EYE_STYLES.length * beard;
/*
 * Colours, by number. A number is what a pilot's look stores and the board
 * passes on, so a colour is only ever added at the end of its list; the
 * editor shows each list in the order of its _ORDER, which is where a new
 * colour finds its place among the others. The later ones are the anime
 * staples the first lists lacked (the owner, 2026-10-26: "an amazing anime
 * manga experience"): orange, teal, silver, platinum, crimson, navy, lilac,
 * sky and mint hair; red, teal, grey, gold, sky and near black eyes; a
 * fairer and a deeper skin.
 */
export const SKINS = ['#ffe0c7', '#f5c9a6', '#e0ac86', '#c68863', '#9c6644', '#6f4429', '#fff0e4', '#4e2d1c'];
export const SKIN_ORDER = [6, 0, 1, 2, 3, 4, 5, 7];
/*
 * INK, drawn here: face tattoos (a rose on the forehead and a word and a
 * few marks beside the eyes, as BotGrinder wears them, the owner,
 * 2026-10-27) and a ring through the nose, either or both. It rides in the
 * skin's number, a tone and the ink each: skin = tone + 8 * ink, where the
 * ink's first bit is the tattoos and its second the ring, which keeps every
 * number under 32 as the beards and the face marks do. An older build reads
 * a number past its eight tones as the first tone and no ink.
 */
export const SKIN_INKS = ['', 'tattoos', 'ring', 'both'];
export const toneOf = (av) => (av.skin || 0) % SKINS.length;
export const inkOf = (av) => Math.floor((av.skin || 0) / SKINS.length) % SKIN_INKS.length;
export const skinOf = (tone, ink) => tone + SKINS.length * ink;
export const HAIR_COLOURS = [
  '#2b2b33', '#6b4226', '#e8c66a', '#c2452d', '#3a6fd8', '#f28ab8', '#3faf6b', '#ededed', '#7b52c9',
  '#f08a2e', '#25b8b8', '#9aa1ad', '#f4e3ad', '#99203a', '#27346a', '#c9a6ec', '#79c4ff', '#93e2c2',
  '#8b8378',
];
/* The last is salt and pepper, a warm grey, for a pilot going grey. */
export const HAIR_ORDER = [0, 14, 1, 13, 3, 9, 2, 12, 7, 18, 11, 5, 15, 8, 4, 16, 10, 6, 17];
export const EYE_COLOURS = [
  '#7a4a2a', '#3b82f6', '#2e9e5b', '#e0a030', '#9b59d0', '#d02f7c',
  '#d93636', '#159d9d', '#7d8896', '#e8c030', '#53c6ff', '#3a2b2b',
];
export const EYE_ORDER = [11, 0, 3, 9, 6, 5, 4, 1, 10, 7, 2, 8];
/*
 * FACE MARKS, drawn here rather than cut from a sheet: a plaster on the
 * cheek or across the nose (the sheets were asked for one and drew a second
 * pair of goggles instead), freckles, a star or a heart sticker, whisker
 * marks and a beauty spot. They share the face's number with the head, a
 * head and a mark each: face = head + 4 * mark, which keeps the eight
 * numbers the board stores and every one of them under 32.
 */
export const FACE_MARKS = ['', 'plaster', 'nose', 'freckles', 'star', 'heart', 'whiskers', 'spot'];
export const headOf = (av) => (av.face || 0) % HEADS.length;
export const markOf = (av) => Math.floor((av.face || 0) / HEADS.length) % FACE_MARKS.length;
export const faceOf = (head, mark) => head + HEADS.length * mark;
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
  /* A royal blue and a charcoal, the tees two of the legends wear. */
  0x2f62c8, 0x3c4048,
]);

/* Names for the editor's buttons. */
export const PART_NAMES = {
  face: ['Oval', 'Round', 'Sharp', 'Square'],
  mark: ['Nothing', 'Plaster', 'Nose plaster', 'Freckles', 'Star', 'Heart', 'Whiskers', 'Beauty spot'],
  hair: ['Spiky', 'Bob', 'Long', 'Ponytail', 'Buzz', 'Messy', 'Buns', 'Twin tails',
    'Quiff', 'Side part', 'Slicked back', 'Shaved'],
  eyes: ['Bright', 'Sparkly', 'Keen', 'Sleepy', 'Dreamy', 'Gentle'],
  beard: ['None', 'Stubble', 'Short beard', 'Full beard', 'Moustache'],
  ink: ['None', 'Face tattoos', 'Nose ring', 'Both'],
  acc: ['Nothing', 'Goggles', 'FPV goggles', 'Headphones', 'Cap', 'Round glasses', 'Beanie', 'Headband', 'Scarf',
    'Cat ears', 'Bow', 'Sakura', 'Star clips', 'Prop beanie', 'Shades', 'Halo', 'Thin specs', 'Clear specs', 'Thick specs'],
};
/* How many of each field there are, for the editor and for a roll. */
export const FIELD_COUNTS = {
  face: HEADS.length * FACE_MARKS.length,
  hair: HAIRS.length,
  eyes: EYE_STYLES.length * BEARDS.length,
  acc: WEARS.length,
  skin: SKINS.length * SKIN_INKS.length,
  hairColour: HAIR_COLOURS.length,
  eyeColour: EYE_COLOURS.length,
  livery: LIVERIES.length + 1,
  title: TITLE_IDS.length + 1,
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

/* The colour a name takes on its livery: ink, or cream on the dark ones
 * (the royal blue and the charcoal), where ink could not be read. */
export function liveryInk(avatar, id) {
  const n = LIVERIES[liveryIndex(avatar, id)];
  return 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255) < 110 ? '#f3ead4' : '#0b1116';
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
    /* Most faces have no mark, so a mark is a pilot's own. */
    face: faceOf(pick(HEADS.length), rand() < 0.6 ? 0 : 1 + pick(FACE_MARKS.length - 1)),
    hair: pick(HAIRS.length),
    /* One in six has facial hair. */
    eyes: eyesOf(pick(EYE_STYLES.length), rand() < 5 / 6 ? 0 : 1 + pick(BEARDS.length - 1)),
    /* One in four wear nothing, so a room is not all goggles. */
    acc: rand() < 0.25 ? 0 : 1 + pick(WEARS.length - 1),
    /* One in ten has tattoos, a ring or both. */
    skin: skinOf(pick(SKINS.length), rand() < 0.9 ? 0 : 1 + pick(SKIN_INKS.length - 1)),
    hairColour: pick(HAIR_COLOURS.length),
    eyeColour: pick(EYE_COLOURS.length),
    livery: 1 + pick(LIVERIES.length),
    /* A roll is a face, not a career: the title is added when a room is
     * sent the look (src/net/together.js). */
    title: 0,
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
/* The atlas at its own scale, and a half size copy made from it once,
 * which every small portrait (a chip, a list, a tile) is composed from:
 * a quarter of the pixels to recolour and to cut under a hat, so a face in
 * a room's chat costs what it did before the parts were drawn larger. */
const atlas = [null, null];

/* Fetched once, on the first portrait anybody asks for. */
export function loadAvatarAtlas() {
  if (!atlasPromise) {
    atlasPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const read = (w, h) => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, 0, w, h);
          return { data: g.getImageData(0, 0, w, h).data, w };
        };
        atlas[0] = read(img.naturalWidth, img.naturalHeight);
        atlas[1] = read(Math.ceil(img.naturalWidth / 2), Math.ceil(img.naturalHeight / 2));
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
  return Boolean(atlas[0]);
}

/* A part's rectangle in the atlas at scale `half` (0 full, 1 half), and a
 * point of the part's own (a frame's or an anchor's) at that scale. The
 * half rectangle is the full one's pixels rounded outward, so the point
 * moves by the half pixel that rounding took. */
function rectOf(name, half) {
  const r = PARTS[name].rect;
  if (!half) {
    return r;
  }
  const x0 = Math.floor(r[0] / 2);
  const y0 = Math.floor(r[1] / 2);
  return [x0, y0, Math.ceil((r[0] + r[2]) / 2) - x0, Math.ceil((r[1] + r[3]) / 2) - y0];
}

function frameOf(name, half) {
  const f = PARTS[name].frame;
  if (!half) {
    return f;
  }
  const r = PARTS[name].rect;
  const dx = (r[0] % 2) / 2;
  const dy = (r[1] % 2) / 2;
  return {
    top: f.top / 2 + dy, chin: f.chin / 2 + dy, width: f.width / 2, cx: f.cx / 2 + dx,
  };
}

function anchorOf(name, half) {
  const a = PARTS[name].anchor;
  if (!half) {
    return a;
  }
  const r = PARTS[name].rect;
  return [a[0] / 2 + (r[0] % 2) / 2, a[1] / 2 + (r[1] % 2) / 2];
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
 * the ones fully inked, as key_value in compose.py. Read from the full
 * atlas whatever the scale, so both scales shade alike. */
const keys = new Map();
function keyValue(name, rule) {
  const id = `${name}|${rule.name}`;
  if (keys.has(id)) {
    return keys.get(id);
  }
  const { data, w: aw } = atlas[0];
  const [x0, y0, w, h] = PARTS[name].rect;
  const vs = [];
  const c = { h: 0, s: 0, v: 0 };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = ((y0 + y) * aw + x0 + x) * 4;
      if (data[i + 3] < 230) {
        continue;
      }
      hsv(data[i], data[i + 1], data[i + 2], c);
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
 * THE IRISES' OWN SHADING. The sheets drew each iris one flat colour and a
 * dot, which reads as a sticker. Manga eyes are dark under the lid and
 * light toward the bottom, with a glint up top and a second, smaller one
 * below it. So each iris (the left and right halves of an eyes part are
 * the two eyes) is shaded top to bottom from its own extent, and the two
 * glints go on after, in the iris's own frame. A closed or squeezed eye
 * has too little iris for any of this and is left as drawn.
 */
function irisBoxes(src, aw, x0, y0, w, h) {
  const boxes = [
    { l: w, r: -1, t: h, b: -1, n: 0 },
    { l: w, r: -1, t: h, b: -1, n: 0 },
  ];
  const c = { h: 0, s: 0, v: 0 };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = ((y0 + y) * aw + x0 + x) * 4;
      if (src[i + 3] < 128) {
        continue;
      }
      hsv(src[i], src[i + 1], src[i + 2], c);
      if (!IRIS(c.h, c.s, c.v)) {
        continue;
      }
      const bx = boxes[x < w / 2 ? 0 : 1];
      bx.l = Math.min(bx.l, x);
      bx.r = Math.max(bx.r, x);
      bx.t = Math.min(bx.t, y);
      bx.b = Math.max(bx.b, y);
      bx.n += 1;
    }
  }
  return boxes.filter((bx) => bx.n > 0 && bx.b - bx.t >= h * 0.12 && bx.r - bx.l >= 3);
}

/*
 * One part out of the atlas, recoloured, on a canvas of its own. `jobs` is
 * a list of [rule, hex, keyV or null]; a pixel takes the first rule it
 * matches. Kept by name, colours and scale, because a room of sixteen
 * shares a handful of heads and hair colours.
 *
 * The canvas carries `fill`, a second canvas whose alpha is the part's
 * flat fill in its first colour: the hair's lit colour, the head's lit
 * skin. The shine on hair and the shadow hair casts on a face are drawn
 * through it, so they land on the colour and never on an ink line.
 */
const partCache = new Map();
function partCanvas(name, jobs, half = 0) {
  const id = `${name}|${jobs.map((j) => `${j[0].name}${j[1]}`).join(',')}|${half}`;
  const kept = partCache.get(id);
  if (kept) {
    return kept;
  }
  const { data: src, w: aw } = atlas[half];
  const [x0, y0, w, h] = rectOf(name, half);
  const c = layer(w, h);
  const g = c.g;
  const img = g.createImageData(w, h);
  const d = img.data;
  const plan = jobs.map(([rule, hex, kv]) => ({
    rule, rgb: rgbOf(hex), kv: kv || keyValue(name, rule),
  }));
  const lens = LENSES.has(name);
  const irises = plan.some((j) => j.rule === IRIS) ? irisBoxes(src, aw, x0, y0, w, h) : [];
  const wantFill = plan.length > 0 && (plan[0].rule === HAIR || plan[0].rule === SKIN);
  const fillImg = wantFill ? g.createImageData(w, h) : null;
  const p = { h: 0, s: 0, v: 0 };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = ((y0 + y) * aw + x0 + x) * 4;
      const o = (y * w + x) * 4;
      const a = src[i + 3];
      let r = src[i];
      let gg = src[i + 1];
      let b = src[i + 2];
      let alpha = a;
      if (a > 0) {
        hsv(r, gg, b, p);
        for (let k = 0; k < plan.length; k += 1) {
          const job = plan[k];
          if (!job.rule(p.h, p.s, p.v)) {
            continue;
          }
          let shade = p.v / job.kv;
          if (job.rule === IRIS && irises.length) {
            const bx = irises[x < w / 2 || irises.length === 1 ? 0 : irises.length - 1];
            const t = Math.min(1, Math.max(0, (y - bx.t) / Math.max(1, bx.b - bx.t)));
            /* Dark under the lid, lighter than the key at the bottom. */
            shade *= 0.5 + 0.75 * t * t;
          }
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
          if (k === 0 && fillImg && shade > 0.84 && a > 200) {
            fillImg.data[o + 3] = 255;
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
  /* The glints: a bright one high on the iris, toward the outside of the
   * face, and a small one low on the other side. White, over everything. */
  for (const bx of irises) {
    const iw = bx.r - bx.l + 1;
    const ih = bx.b - bx.t + 1;
    const outer = bx.l + iw / 2 < w / 2 ? -1 : 1;
    const cx = bx.l + iw / 2;
    g.fillStyle = 'rgba(255, 255, 255, 0.95)';
    g.beginPath();
    g.ellipse(cx + outer * iw * 0.16, bx.t + ih * 0.3, iw * 0.17, ih * 0.13, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.8)';
    g.beginPath();
    g.ellipse(cx - outer * iw * 0.14, bx.t + ih * 0.74, iw * 0.08, ih * 0.06, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (fillImg) {
    const f = layer(w, h);
    f.g.putImageData(fillImg, 0, 0);
    c.fill = f;
  }
  if (partCache.size > 400) {
    partCache.clear();
  }
  partCache.set(id, c);
  return c;
}

/* ------------------------------------------------------------------ *
 * Composing a portrait
 * ------------------------------------------------------------------ */

const HATS = new Set(['cap', 'beanie', 'prop']);
/* Wear drawn in code, and wear that is an atlas part with more drawn on. */
const DRAWN = new Set(['cat', 'bow', 'flower', 'stars', 'shades', 'halo', 'specs', 'clear', 'frames']);
const DRAWN_HAIR = new Set(['quiff', 'sidepart', 'slick', 'shaved']);
const WEAR_PART = { prop: 'beanie' };
const TAILS = new Set(['twintails']);
const HAT_LIP = 0.05;
/* Wear that is drawn dark whatever the livery: goggles, glasses and cans
 * are kit, a cap or a scarf is clothing. */
const KIT = new Set(['goggles', 'fpv', 'headphones', 'glasses']);
const KIT_COLOUR = '#3a3f46';

/*
 * Every canvas a portrait is composed on is kept in main memory, where
 * reading it back is cheap: the hair is read for its shine and a hat's
 * cut, and a canvas on the graphics card drawn into one in memory is a
 * copy back from the card each time, which made a look editor that redraws
 * a panel of portraits stall for seconds. Only the canvas on the page is
 * the card's, and a portrait goes up to it once.
 */
function layer(side, tall = side) {
  const c = document.createElement('canvas');
  c.width = side;
  c.height = tall;
  c.g = c.getContext('2d', { willReadFrequently: true });
  return c;
}

/* A portrait is composed a quarter taller than it is wide, so the card the
 * editor deals shows the shoulders and the livery's shirt; every square
 * crop is taken from its top. */
const TALL = 1.25;

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
function tuckUnderHat(hg, worn, side, H, tails, px) {
  const hat = worn.g.getImageData(0, 0, side, side).data;
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
    return null;
  }
  const img = hg.getImageData(0, 0, side, side);
  const hd = img.data;
  const lip = HAT_LIP * H;
  const cut = new Float32Array(side).fill(-1);
  for (let x = left; x <= right; x += 1) {
    cut[x] = bottom[x] >= 0 ? bottom[x] - lip : -1;
  }
  const rimL = bottom[Math.min(right, left + Math.round(8 * px))] - lip;
  const rimR = bottom[Math.max(left, right - Math.round(8 * px))] - lip;
  /* The skull's line: the head is taken away above it, or a head wider
   * at the crown than the hat (the square one, under a beanie) shows a
   * bald corner over the brim. Level with the rim beyond the hat's sides,
   * well above the ears. */
  const skull = new Float32Array(side);
  for (let x = 0; x < side; x += 1) {
    skull[x] = x < left ? rimL : (x > right ? rimR : Math.max(0, cut[x]));
  }
  if (!tails) {
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
  const r = 2.6 * px;
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
  return skull;
}

/*
 * MY OWN SHADING, over the sheets' flat colour, in the three places a manga
 * face is never flat:
 *
 * The shine on hair, the band of light round the crown every anime head
 * has. It is drawn as a ring of short strokes, each lit along its top and
 * cut in a point below, following the skull's curve, and only where the
 * hair is its lit colour, so an ink strand runs through it unbroken. Hair
 * under a hat has its crown covered, so no shine.
 *
 * The shadow hair throws on a face: the fringe's own shape, a little lower,
 * multiplied over the lit skin in a cool rose, so the eyes sit under the
 * hair rather than on the same sheet of paper. A hat or a band throws one
 * too.
 *
 * A warm flush on the cheeks, faint, so even the calm face is alive.
 *
 * All of it is drawn once a portrait, and kept with it.
 */
function shineColour(hex) {
  const [r, g, b] = rgbOf(hex);
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  /* Dark hair shines blue grey, light hair shines white, the rest a
   * paler copy of itself. */
  const k = lum < 70 ? 0.34 : (lum > 190 ? 0.8 : 0.5);
  const m = (c) => Math.round(c + (255 - c) * k);
  return `rgba(${lum < 70 ? m(r + 18) : m(r)}, ${m(g)}, ${lum < 70 ? m(b + 34) : m(b)}, ${lum > 190 ? 0.9 : 0.75})`;
}

function drawShine(g, cx, cy, rx, ry, H, colour) {
  g.save();
  g.fillStyle = colour;
  /* Two crescents, one each side of the parting, on an ellipse round the
   * crown: each a band lit along its top and broken below into strands of
   * uneven length that end in points, thinning toward its ends, as an
   * inker draws it. */
  const at = (deg, dr) => {
    const a = (deg * Math.PI) / 180;
    return [cx + Math.sin(a) * (rx - dr * 0.6), cy - Math.cos(a) * (ry - dr)];
  };
  const runs = [[-64, -9], [9, 64]];
  const strands = [0.55, 1, 0.4, 0.85, 0.5, 1.15, 0.45, 0.75, 0.35];
  const band = 0.045 * H;
  const long = 0.075 * H;
  runs.forEach(([d0, d1], side) => {
    const steps = strands.length;
    const span = (d1 - d0) / steps;
    g.beginPath();
    g.moveTo(...at(d0, 0));
    for (let i = 1; i <= 8; i += 1) {
      g.lineTo(...at(d0 + ((d1 - d0) * i) / 8, 0));
    }
    for (let i = steps - 1; i >= 0; i -= 1) {
      const deg = d0 + (i + 0.5) * span;
      /* A band thinnest at its two ends. */
      const t = (i + 0.5) / steps;
      const thick = band * Math.sin(Math.PI * Math.min(1, Math.max(0.12, t)));
      const n = strands[side ? steps - 1 - i : i];
      g.lineTo(...at(deg + span / 2, thick));
      g.lineTo(...at(deg + span * 0.08, thick + long * n * Math.sin(Math.PI * t)));
      g.lineTo(...at(deg - span / 2, thick));
    }
    g.closePath();
    g.fill();
  });
  g.restore();
}

/* Where the hair is: its top above the middle of the face, and its width
 * on a row, read from the hair as drawn. */
function hairTopAt(g, x, side) {
  const col = g.getImageData(Math.round(x), 0, 1, side).data;
  for (let y = 0; y < side; y += 1) {
    if (col[y * 4 + 3] > 128) {
      return y;
    }
  }
  return -1;
}

/* The lowest covered pixel of a column above `from`, or -1: where a
 * fringe or a hat's brim stops over the forehead. */
function fringeAt(g, x, from) {
  const h = Math.max(1, Math.round(from));
  const col = g.getImageData(Math.round(x), 0, 1, h).data;
  for (let y = h - 1; y >= 0; y -= 1) {
    if (col[y * 4 + 3] > 128) {
      return y;
    }
  }
  return -1;
}

function hairSpanAt(g, y, side) {
  const row = g.getImageData(0, Math.round(y), side, 1).data;
  let l = -1;
  let r = -1;
  for (let x = 0; x < side; x += 1) {
    if (row[x * 4 + 3] > 128) {
      if (l < 0) l = x;
      r = x;
    }
  }
  return [l, r];
}

/*
 * A FACE MARK, drawn in the face's own measure: `p(x, y)` is a point a
 * share of the face's width across from its middle and a share of its
 * height down from the skull's top, and W the face's width. Inked like
 * the parts, a line about a seventieth of a face wide. Stickers and the
 * plaster go on the cheek on the viewer's right, so a pilot with one
 * reads the same in every room.
 */
const MARK_INK = '#18131a';
function drawFaceMark(g, kind, p, W, skin) {
  const lw = 0.014 * W;
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const plaster = (cx, cy, len, ht, rot) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.beginPath();
    g.roundRect(-len / 2, -ht / 2, len, ht, ht / 2);
    g.fillStyle = '#f6dbb2';
    g.fill();
    g.lineWidth = lw;
    g.strokeStyle = MARK_INK;
    g.stroke();
    g.fillStyle = '#e5bd8e';
    g.beginPath();
    g.roundRect(-len * 0.17, -ht * 0.34, len * 0.34, ht * 0.68, ht * 0.12);
    g.fill();
    g.fillStyle = '#c99a6a';
    for (const sx of [-1, 1]) {
      for (const [dx, dy] of [[0.31, -0.18], [0.31, 0.18], [0.39, 0]]) {
        g.beginPath();
        g.arc(sx * dx * len, dy * ht, ht * 0.07, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  };
  const glint = (x, y, r) => {
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.beginPath();
    g.ellipse(x, y, r, r * 0.6, -0.6, 0, Math.PI * 2);
    g.fill();
  };
  if (kind === 'plaster') {
    const [x, y] = p(0.26, 0.735);
    plaster(x, y, 0.27 * W, 0.1 * W, -0.42);
  } else if (kind === 'nose') {
    const [x, y] = p(0, 0.675);
    plaster(x, y, 0.3 * W, 0.085 * W, 0.05);
  } else if (kind === 'freckles') {
    const [r, gg, b] = rgbOf(skin);
    g.fillStyle = `rgba(${Math.round(r * 0.55 + 70)}, ${Math.round(gg * 0.45 + 30)}, ${Math.round(b * 0.4 + 18)}, 0.85)`;
    const dots = [[-0.06, -0.012], [-0.026, -0.028], [0.012, -0.018], [0.048, -0.004], [-0.042, 0.016], [0.006, 0.012], [0.04, 0.024], [-0.012, 0.034]];
    for (const side of [-1, 1]) {
      for (const [dx, dy] of dots) {
        const [x, y] = p(side * (0.245 + dx), 0.705 + dy);
        g.beginPath();
        g.arc(x, y, 0.0105 * W, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (kind === 'star') {
    const [x, y] = p(0.27, 0.715);
    const ro = 0.07 * W;
    const ri = 0.03 * W;
    g.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + 0.2 + (i * Math.PI) / 5;
      const r = i % 2 ? ri : ro;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#ffd04a';
    g.fill();
    g.lineWidth = lw * 0.85;
    g.strokeStyle = MARK_INK;
    g.stroke();
    glint(x - ro * 0.22, y - ro * 0.2, ro * 0.16);
  } else if (kind === 'heart') {
    const [x, y] = p(0.27, 0.71);
    const s = 0.066 * W;
    g.beginPath();
    g.moveTo(x, y + s * 0.95);
    g.bezierCurveTo(x - s * 1.25, y + s * 0.1, x - s * 0.95, y - s * 1.0, x, y - s * 0.38);
    g.bezierCurveTo(x + s * 0.95, y - s * 1.0, x + s * 1.25, y + s * 0.1, x, y + s * 0.95);
    g.closePath();
    g.fillStyle = '#ff6b8f';
    g.fill();
    g.lineWidth = lw * 0.85;
    g.strokeStyle = MARK_INK;
    g.stroke();
    glint(x - s * 0.45, y - s * 0.3, s * 0.2);
  } else if (kind === 'whiskers') {
    g.strokeStyle = 'rgba(24, 19, 26, 0.8)';
    g.lineWidth = lw * 0.85;
    for (const side of [-1, 1]) {
      for (const dy of [-0.032, 0, 0.032]) {
        const [x0, y0] = p(side * 0.205, 0.705 + dy * 0.9);
        const [x1, y1] = p(side * 0.345, 0.698 + dy * 1.35);
        const [mx, my] = p(side * 0.275, 0.698 + dy * 1.05);
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo(mx, my, x1, y1);
        g.stroke();
      }
    }
  } else if (kind === 'spot') {
    const [x, y] = p(0.185, 0.675);
    const [r, gg, b] = rgbOf(skin);
    g.fillStyle = `rgb(${Math.round(r * 0.3)}, ${Math.round(gg * 0.22)}, ${Math.round(b * 0.2)})`;
    g.beginPath();
    g.arc(x, y, 0.012 * W, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/*
 * WEAR DRAWN HERE, in the parts' own hand: an ink line about a fiftieth of
 * a face wide, flat colour, one shade and one glint, so it sits among the
 * atlas's goggles and caps as if drawn on the same sheet. `q.p(x, y)` is a
 * point in the face's measure, as for a face mark; `q.top(x)` is the
 * hair's top at a share of the face across, in the same measure, so cat
 * ears stand on the hair and a bow is pinned to it whatever the style.
 * Cat ears are drawn before the hair, so the hair covers their roots; the
 * rest after it. Once per portrait, kept with it.
 */
const WEAR_INK = '#18131a';
function tint(hex, k) {
  const [r, g, b] = rgbOf(hex);
  const m = (c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}
function drawWear(g, kind, q) {
  const { p, W } = q;
  const lw = 0.019 * W;
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = lw;
  g.strokeStyle = WEAR_INK;
  const ink = (fill) => {
    g.fillStyle = fill;
    g.fill();
    g.stroke();
  };
  const glint = (x, y, rx, ry, rot = -0.6) => {
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    g.fill();
  };
  const star = (x, y, ro, rot, fill) => {
    g.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + rot + (i * Math.PI) / 5;
      const r = i % 2 ? ro * 0.45 : ro;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
    ink(fill);
    glint(x - ro * 0.22, y - ro * 0.22, ro * 0.17, ro * 0.1);
  };
  /* The hair's top at a share across: the lowest of three readings near
   * it, so a spike's tip is not taken for the hair's top. */
  const rest = (x, spread = 0.06) => Math.max(q.top(x - spread), q.top(x), q.top(x + spread));
  if (kind === 'cat') {
    const fill = q.hair;
    for (const side of [-1, 1]) {
      const [bx, by] = p(side * 0.29, rest(side * 0.29) + 0.11);
      g.save();
      g.translate(bx, by);
      g.rotate(side * 0.34);
      const hw = 0.165 * W;
      const ht = 0.44 * W;
      g.beginPath();
      g.moveTo(-hw, 0);
      g.quadraticCurveTo(-hw * 0.95, -ht * 0.6, -hw * 0.12, -ht);
      g.quadraticCurveTo(0, -ht * 1.04, hw * 0.12, -ht);
      g.quadraticCurveTo(hw * 0.95, -ht * 0.6, hw, 0);
      g.closePath();
      ink(fill);
      /* The ear's far side in shadow, and its pink inside. */
      g.beginPath();
      g.moveTo(side * hw * 0.2, -ht * 0.95);
      g.quadraticCurveTo(side * hw * 0.9, -ht * 0.55, side * hw * 0.95, 0);
      g.lineTo(side * hw * 0.55, 0);
      g.closePath();
      g.fillStyle = tint(fill, -0.28);
      g.fill();
      g.beginPath();
      g.moveTo(-hw * 0.55, -ht * 0.05);
      g.quadraticCurveTo(-hw * 0.5, -ht * 0.5, 0, -ht * 0.8);
      g.quadraticCurveTo(hw * 0.5, -ht * 0.5, hw * 0.55, -ht * 0.05);
      g.closePath();
      g.fillStyle = '#ffb6c8';
      g.fill();
      g.lineWidth = lw * 0.6;
      g.stroke();
      g.beginPath();
      g.moveTo(-hw * 0.18, -ht * 0.62);
      g.lineTo(-hw * 0.05, -ht * 0.4);
      g.moveTo(hw * 0.14, -ht * 0.6);
      g.lineTo(hw * 0.04, -ht * 0.42);
      g.strokeStyle = 'rgba(214, 86, 120, 0.9)';
      g.stroke();
      g.restore();
    }
  } else if (kind === 'bow') {
    const fill = q.livery;
    const [x, y] = p(0.3, rest(0.3) + 0.07);
    g.translate(x, y);
    g.rotate(0.38);
    g.scale(1.3, 1.3);
    g.lineWidth = lw / 1.3;
    const L = 0.23 * W;
    const T = 0.15 * W;
    for (const side of [-1, 1]) {
      /* A tail, then a loop over it. */
      g.beginPath();
      g.moveTo(side * 0.02 * W, 0.02 * W);
      g.lineTo(side * 0.13 * W, 0.2 * W);
      g.lineTo(side * 0.06 * W, 0.17 * W);
      g.lineTo(side * 0.03 * W, 0.22 * W);
      g.lineTo(-side * 0.03 * W, 0.04 * W);
      g.closePath();
      ink(tint(fill, -0.18));
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(side * L * 0.5, -T * 1.1, side * L * 1.15, -T * 0.9, side * L, 0);
      g.bezierCurveTo(side * L * 1.15, T * 0.9, side * L * 0.5, T * 1.1, 0, 0);
      g.closePath();
      ink(fill);
      /* The fold inside the loop, and its shade. */
      g.beginPath();
      g.moveTo(side * L * 0.2, T * 0.05);
      g.quadraticCurveTo(side * L * 0.6, T * 0.55, side * L * 0.88, T * 0.35);
      g.lineTo(side * L * 0.92, T * 0.62);
      g.quadraticCurveTo(side * L * 0.55, T * 0.85, side * L * 0.2, T * 0.05);
      g.fillStyle = tint(fill, -0.3);
      g.fill();
      g.beginPath();
      g.moveTo(side * L * 0.25, -T * 0.1);
      g.quadraticCurveTo(side * L * 0.6, -T * 0.25, side * L * 0.85, -T * 0.05);
      g.lineWidth = (lw / 1.3) * 0.6;
      g.stroke();
      g.lineWidth = lw / 1.3;
      glint(side * L * 0.55, -T * 0.42, L * 0.12, T * 0.12, side * 0.3);
    }
    g.beginPath();
    g.roundRect(-0.05 * W, -0.065 * W, 0.1 * W, 0.13 * W, 0.03 * W);
    ink(tint(fill, -0.1));
  } else if (kind === 'flower') {
    const bloom = (x, y, r, rot) => {
      for (let i = 0; i < 5; i += 1) {
        const a = rot + (i * 2 * Math.PI) / 5;
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(-r * 0.62, -r * 0.3, -r * 0.62, -r * 0.95, -r * 0.18, -r);
        g.lineTo(0, -r * 0.82);
        g.lineTo(r * 0.18, -r);
        g.bezierCurveTo(r * 0.62, -r * 0.95, r * 0.62, -r * 0.3, 0, 0);
        g.closePath();
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
        grad.addColorStop(0, '#ff7fae');
        grad.addColorStop(0.45, '#ffc2d8');
        grad.addColorStop(1, '#ffe4ee');
        ink(grad);
        g.restore();
      }
      g.beginPath();
      g.arc(x, y, r * 0.2, 0, Math.PI * 2);
      g.fillStyle = '#e8487f';
      g.fill();
      g.fillStyle = '#ffd04a';
      for (let i = 0; i < 5; i += 1) {
        const a = rot + 0.6 + (i * 2 * Math.PI) / 5;
        g.beginPath();
        g.arc(x + Math.cos(a) * r * 0.36, y + Math.sin(a) * r * 0.36, r * 0.075, 0, Math.PI * 2);
        g.fill();
      }
    };
    const [x, y] = p(-0.37, rest(-0.37, 0.04) + 0.2);
    const [x2, y2] = p(-0.17, rest(-0.17, 0.04) + 0.1);
    bloom(x2, y2, 0.11 * W, 0.5);
    bloom(x, y, 0.17 * W, 0.1);
  } else if (kind === 'stars') {
    const [x, y] = p(-0.35, rest(-0.35, 0.04) + 0.18);
    const [x2, y2] = p(-0.18, rest(-0.18, 0.04) + 0.09);
    /* The clip's bar under them, then the stars. */
    g.beginPath();
    g.moveTo(x2 - 0.02 * W, y2 + 0.03 * W);
    g.lineTo(x + 0.02 * W, y + 0.05 * W);
    g.lineWidth = lw * 1.6;
    g.stroke();
    g.lineWidth = lw * 0.7;
    g.strokeStyle = '#c9cfd8';
    g.stroke();
    g.lineWidth = lw;
    g.strokeStyle = WEAR_INK;
    star(x2, y2, 0.09 * W, 0.25, '#ffd04a');
    star(x, y, 0.125 * W, -0.15, '#ffd04a');
  } else if (kind === 'shades') {
    const [cy] = [q.eyeY];
    const lens = (side) => {
      const [x, y] = p(side * 0.235, cy);
      const w = 0.37 * W;
      const hgt = 0.22 * W;
      g.beginPath();
      g.moveTo(x - w / 2, y - hgt * 0.45);
      g.lineTo(x + w / 2, y - hgt * 0.45);
      g.bezierCurveTo(x + w / 2, y + hgt * 0.35, x + w * 0.3, y + hgt * 0.62, x + side * w * 0.05, y + hgt * 0.6);
      g.bezierCurveTo(x - w * 0.3, y + hgt * 0.62, x - w / 2, y + hgt * 0.35, x - w / 2, y - hgt * 0.45);
      g.closePath();
      const grad = g.createLinearGradient(x, y - hgt / 2, x, y + hgt / 2);
      grad.addColorStop(0, '#20232e');
      grad.addColorStop(1, '#4a5876');
      ink(grad);
      g.save();
      g.clip();
      g.fillStyle = 'rgba(255, 255, 255, 0.55)';
      g.beginPath();
      g.moveTo(x - w * 0.18, y - hgt);
      g.lineTo(x - w * 0.02, y - hgt);
      g.lineTo(x - w * 0.32, y + hgt);
      g.lineTo(x - w * 0.48, y + hgt);
      g.closePath();
      g.fill();
      g.restore();
      return [x, y, w, hgt];
    };
    const [lx, ly, w, hgt] = lens(-1);
    const [rx] = lens(1);
    g.beginPath();
    g.moveTo(lx + w / 2, ly - hgt * 0.38);
    g.quadraticCurveTo((lx + rx) / 2, ly - hgt * 0.62, rx - w / 2, ly - hgt * 0.38);
    g.lineWidth = lw * 1.3;
    g.stroke();
    g.lineWidth = lw * 1.5;
    for (const side of [-1, 1]) {
      const [ax, ay] = p(side * 0.5, cy - 0.06);
      g.beginPath();
      g.moveTo(side < 0 ? lx - w / 2 : rx + w / 2, ly - hgt * 0.38);
      g.lineTo(ax, ay);
      g.stroke();
    }
  } else if (kind === 'specs' || kind === 'clear' || kind === 'frames') {
    /* Rectangular glasses round the eyes, each the weight of the pair a
     * legend wears: thin dark metal, clear plastic with an ink edge, and
     * thick black. The glass is a faint tint and one streak of light, so
     * the eyes behind it are the eyes. */
    const w = 0.37 * W;
    const ht = 0.27 * W;
    const cy = q.eyeY - 0.015;
    const [lx, ly] = p(-0.215, cy);
    const [rx] = p(0.215, cy);
    const lens = (x) => {
      g.beginPath();
      g.roundRect(x - w / 2, ly - ht / 2, w, ht, [0.05 * W, 0.05 * W, 0.1 * W, 0.1 * W]);
    };
    for (const x of [lx, rx]) {
      lens(x);
      g.fillStyle = 'rgba(214, 232, 250, 0.16)';
      g.fill();
      g.save();
      g.clip();
      g.fillStyle = 'rgba(255, 255, 255, 0.5)';
      g.beginPath();
      g.moveTo(x + w * 0.12, ly - ht * 0.6);
      g.lineTo(x + w * 0.3, ly - ht * 0.6);
      g.lineTo(x + w * 0.02, ly + ht * 0.6);
      g.lineTo(x - w * 0.16, ly + ht * 0.6);
      g.closePath();
      g.fill();
      g.restore();
    }
    /* The arms run from each lens's outer edge to the face's edge. */
    const [ex, ey] = p(0.5, cy - 0.04);
    const [elx] = p(-0.5, cy - 0.04);
    const frame = () => {
      for (const x of [lx, rx]) {
        lens(x);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(lx + w / 2, ly - ht * 0.18);
      g.quadraticCurveTo((lx + rx) / 2, ly - ht * 0.36, rx - w / 2, ly - ht * 0.18);
      g.moveTo(lx - w / 2, ly - ht * 0.3);
      g.lineTo(elx, ey);
      g.moveTo(rx + w / 2, ly - ht * 0.3);
      g.lineTo(ex, ey);
      g.stroke();
    };
    const weights = { specs: [0.02, 0.008, '#6c7484'], clear: [0.05, 0.03, 'rgba(232, 240, 246, 0.95)'], frames: [0.058, 0.036, '#5a4840'] };
    const [outer, inner, body] = weights[kind];
    g.lineWidth = outer * W;
    g.strokeStyle = WEAR_INK;
    frame();
    g.lineWidth = inner * W;
    g.strokeStyle = body;
    frame();
    if (kind !== 'specs') {
      /* A glint on each frame's top corner. */
      g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      g.lineWidth = 0.012 * W;
      for (const x of [lx, rx]) {
        g.beginPath();
        g.moveTo(x - w * 0.36, ly - ht / 2);
        g.lineTo(x - w * 0.12, ly - ht / 2);
        g.stroke();
      }
    }
  } else if (kind === 'halo') {
    /* Over the hair, but never off the card's top: through the tips of
     * tall spikes instead. */
    const [x, y] = p(0, Math.max(-0.14, q.top(0) - 0.1));
    const rx = 0.32 * W;
    const ry = 0.075 * W;
    g.shadowColor = 'rgba(255, 214, 90, 0.85)';
    g.shadowBlur = 0.06 * W;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.lineWidth = 0.06 * W;
    g.strokeStyle = WEAR_INK;
    g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = 0.036 * W;
    g.strokeStyle = '#ffd34d';
    g.stroke();
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.55);
    g.lineWidth = 0.013 * W;
    g.strokeStyle = '#fff6c9';
    g.stroke();
  } else if (kind === 'prop') {
    /* A propeller on the beanie's crown: the stem, two blades and a hub. */
    const [x, y] = p(0, q.hat + 0.01);
    g.beginPath();
    g.roundRect(x - 0.022 * W, y - 0.09 * W, 0.044 * W, 0.1 * W, 0.01 * W);
    ink('#c9cfd8');
    g.translate(x, y - 0.1 * W);
    g.rotate(-0.12);
    g.scale(1.25, 1.25);
    g.lineWidth = lw / 1.25;
    const blade = (side, fill) => {
      g.beginPath();
      g.moveTo(0, -0.012 * W);
      g.bezierCurveTo(side * 0.1 * W, -0.06 * W, side * 0.27 * W, -0.05 * W, side * 0.29 * W, -0.005 * W);
      g.bezierCurveTo(side * 0.27 * W, 0.035 * W, side * 0.1 * W, 0.03 * W, 0, 0.014 * W);
      g.closePath();
      ink(fill);
      glint(side * 0.17 * W, -0.024 * W, 0.05 * W, 0.009 * W, 0);
    };
    blade(-1, '#ff5a52');
    blade(1, '#ffd04a');
    g.beginPath();
    g.arc(0, 0, 0.034 * W, 0, Math.PI * 2);
    ink('#4f7dff');
  }
  g.restore();
}

/*
 * THE HEADS' OWN LINES, measured off the atlas's four heads, as shares of
 * the face (across from its middle, down from the skull's top): the skull's
 * half width at each of SKULL_AT, which drawn hair has to reach past to
 * cover the skull's ink line, and the jaw's line at every twentieth across
 * from the middle out to 0.45, which a beard follows and hangs past.
 */
const SKULL_AT = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5];
const SKULLS = {
  oval: [0.14, 0.3, 0.38, 0.47, 0.51, 0.516, 0.52],
  round: [0.127, 0.287, 0.368, 0.458, 0.502, 0.515, 0.52],
  sharp: [0.142, 0.305, 0.385, 0.474, 0.51, 0.514, 0.52],
  square: [0.207, 0.427, 0.475, 0.522, 0.529, 0.525, 0.53],
};
const JAWS = {
  oval: [1.004, 1.0, 0.987, 0.965, 0.939, 0.908, 0.873, 0.833, 0.77, 0.66],
  round: [1.037, 1.035, 1.027, 1.013, 0.993, 0.968, 0.937, 0.899, 0.845, 0.73],
  sharp: [1.004, 0.999, 0.981, 0.956, 0.928, 0.897, 0.864, 0.824, 0.752, 0.64],
  square: [1.003, 1.003, 1.002, 0.999, 0.977, 0.951, 0.924, 0.895, 0.866, 0.742],
};
function skullAt(head, fy) {
  const w = SKULLS[head];
  if (fy <= 0) return w[0];
  for (let i = 1; i < SKULL_AT.length; i += 1) {
    if (fy <= SKULL_AT[i]) {
      const t = (fy - SKULL_AT[i - 1]) / (SKULL_AT[i] - SKULL_AT[i - 1]);
      return w[i - 1] + (w[i] - w[i - 1]) * t;
    }
  }
  return w[w.length - 1];
}
function jawAt(head, fx) {
  const j = JAWS[head];
  const u = Math.min(j.length - 1, Math.abs(fx) / 0.05);
  const i = Math.min(j.length - 2, Math.floor(u));
  return j[i] + (j[i + 1] - j[i]) * (u - i);
}

/* A smooth line through points already in pixels, as an inker's French
 * curve draws one (Catmull-Rom, as Bezier), from wherever the path is. */
function through(g, pts, move = false) {
  const n = pts.length;
  const at = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  if (move) g.moveTo(pts[0][0], pts[0][1]);
  else g.lineTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n - 1; i += 1) {
    const a = at(i - 1);
    const b = at(i);
    const c = at(i + 1);
    const d = at(i + 2);
    g.bezierCurveTo(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]);
  }
}

/* A number from a seed, the same every time, so stubble is drawn in the
 * same place on every portrait and in every room. */
function grain(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/*
 * A run of points, smoothed and sampled about every two pixels, for an
 * outline that has corners (where one run ends and the next begins) and
 * teeth: `teeth` is a tooth's length, every `step` along, pointing toward
 * the point `into`, as the atlas's buzz cut has along its hairline.
 */
function run(pts, teeth = 0, step = 1, into = null) {
  const n = pts.length;
  const at = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  const out = [];
  for (let i = 0; i < n - 1; i += 1) {
    const a = at(i - 1);
    const b = at(i);
    const c = at(i + 1);
    const d = at(i + 2);
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6];
    const k = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 2));
    for (let j = i ? 1 : 0; j <= k; j += 1) {
      const t = j / k;
      const u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      out.push([w[0] * b[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * c[0], w[0] * b[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * c[1]]);
    }
  }
  if (!teeth || out.length < 3) {
    return out;
  }
  const s = [0];
  for (let i = 1; i < out.length; i += 1) {
    s.push(s[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  }
  const total = s[s.length - 1];
  const base = step * 0.7;
  const res = [];
  let next = step * 0.8;
  for (let i = 0; i < out.length; i += 1) {
    if (next < total - step * 0.5 && s[i] >= next - base / 2) {
      /* The tooth: its tip off the line, leaning a little along it. */
      let j = i;
      while (j < out.length - 1 && s[j] < next) j += 1;
      const p0 = out[Math.max(0, j - 1)];
      const p1 = out[Math.min(out.length - 1, j + 1)];
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const l = Math.hypot(dx, dy) || 1;
      let nx = -dy / l;
      let ny = dx / l;
      if (into && (into[0] - out[j][0]) * nx + (into[1] - out[j][1]) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      res.push(out[i]);
      res.push([out[j][0] + nx * teeth + (dx / l) * teeth * 0.3, out[j][1] + ny * teeth + (dy / l) * teeth * 0.3]);
      while (i < out.length - 1 && s[i] < next + base / 2) i += 1;
      res.push(out[i]);
      next += step;
    } else {
      res.push(out[i]);
    }
  }
  return res;
}

/*
 * HAIR DRAWN HERE, for the legends' short cuts, in the atlas hair's own
 * hand: one flat fill in the hair's colour, the short sides a shade darker,
 * a few ink strands and a few lighter ones, a hairline with teeth and an
 * ink outline as thick as the heads' own. Each style is an outline round
 * the skull, reaching past the head's own line (skullAt) so the skull
 * never shows at a corner. `q.p` places a point in the face's measure, as
 * for wear. Drawn onto the hair layer, so a hat cuts it, the shine rings it
 * and it throws its shadow on the face as the atlas's hair does; returns
 * the flat fill alone, which the shine is drawn through.
 */
const HAIR_INK = '#18131a';
function drawHair(hg, kind, q, colour) {
  const { W } = q;
  const P = ([x, y]) => q.p(x, y);
  const sx = (fy) => skullAt(q.head, fy);
  const face = q.p(0, 0.6);
  if (kind === 'shaved') {
    /* No outline, only the shadow a shaved head's stubble makes: faint on
     * the crown, deeper on the sides and round the back, kept to the
     * head. */
    const [r, gg, b] = rgbOf(colour);
    hg.save();
    const [cx, cy] = q.p(0, 0.3);
    const grad = hg.createRadialGradient(cx, cy, 0.05 * W, cx, cy, 0.62 * W);
    grad.addColorStop(0, `rgba(${r}, ${gg}, ${b}, 0.08)`);
    grad.addColorStop(0.72, `rgba(${r}, ${gg}, ${b}, 0.2)`);
    grad.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0.42)`);
    hg.fillStyle = grad;
    hg.beginPath();
    const line = run([[-0.47, 0.55], [-0.47, 0.42], [-0.44, 0.3], [-0.36, 0.22], [-0.18, 0.18], [0, 0.17], [0.18, 0.18], [0.36, 0.22], [0.44, 0.3], [0.47, 0.42], [0.47, 0.55]].map(P), 0.014 * W, 0.045 * W, face);
    line.forEach(([x, y], i) => (i ? hg.lineTo(x, y) : hg.moveTo(x, y)));
    for (const pt of [[0.62, 0.55], [0.62, -0.12], [-0.62, -0.12], [-0.62, 0.55]]) hg.lineTo(...P(pt));
    hg.closePath();
    hg.fill();
    hg.globalCompositeOperation = 'destination-in';
    hg.drawImage(q.skin, 0, 0);
    hg.restore();
    return null;
  }
  /* Each style: runs round the outside from the left sideburn's foot over
   * the top to the right one's, then the hairline back. A run is
   * [points, tooth, step], in the face's measure. */
  const S = (pts, tooth = 0, step = 0.06) => [pts, tooth, step];
  let runs;
  let strands;
  let lights;
  let under = null;
  let sides = 0.38;
  let darker = -0.24;
  if (kind === 'quiff') {
    const front = [[0.37, 0.235], [0.26, 0.19], [0.12, 0.15], [0, 0.138], [-0.14, 0.152], [-0.27, 0.19], [-0.37, 0.235]];
    runs = [
      S([[-0.495, 0.53], [-0.53, 0.4], [-sx(0.25) - 0.032, 0.25], [-sx(0.1) - 0.052, 0.09], [-0.43, -0.02], [-0.36, -0.1]]),
      S([[-0.36, -0.1], [-0.31, -0.085]]),
      S([[-0.31, -0.085], [-0.22, -0.155], [-0.1, -0.19], [0.02, -0.195]]),
      S([[0.02, -0.195], [0.07, -0.15]]),
      S([[0.07, -0.15], [0.17, -0.165], [0.26, -0.15]]),
      S([[0.26, -0.15], [0.28, -0.105]]),
      S([[0.28, -0.105], [0.38, -0.075], [sx(0.02) + 0.075, -0.0], [sx(0.12) + 0.05, 0.12], [sx(0.25) + 0.032, 0.25], [0.53, 0.4], [0.495, 0.53]]),
      S([[0.458, 0.53], [0.462, 0.4], [0.44, 0.3], [0.37, 0.235]]),
      S(front, 0.026, 0.12),
      S([[-0.37, 0.235], [-0.44, 0.3], [-0.462, 0.4], [-0.458, 0.53]]),
    ];
    under = front;
    strands = [
      [[-0.22, 0.17], [-0.15, 0.02], [-0.06, -0.11], [0.02, -0.17]],
      [[-0.04, 0.14], [0.04, 0.02], [0.14, -0.09], [0.2, -0.14]],
      [[0.15, 0.16], [0.24, 0.06], [0.36, -0.03]],
      [[-0.36, 0.22], [-0.35, 0.07], [-0.3, -0.04]],
    ];
    lights = [[[-0.17, 0.07], [-0.09, -0.06], [0.0, -0.14]], [[0.07, 0.07], [0.15, -0.02], [0.23, -0.09]]];
  } else if (kind === 'sidepart') {
    runs = [
      S([[-0.495, 0.52], [-0.53, 0.38], [-sx(0.2) - 0.045, 0.2], [-sx(0.06) - 0.06, 0.04], [-0.38, -0.045], [-0.2, -0.085], [0.0, -0.095], [0.14, -0.088], [0.22, -0.105]]),
      S([[0.22, -0.105], [0.25, -0.065]]),
      S([[0.25, -0.065], [sx(0.02) + 0.058, -0.005], [sx(0.15) + 0.045, 0.15], [0.53, 0.38], [0.495, 0.52]]),
      S([[0.458, 0.52], [0.462, 0.38], [0.435, 0.27], [0.36, 0.215]]),
      S([[0.36, 0.215], [0.26, 0.185], [0.12, 0.18], [-0.02, 0.19], [-0.14, 0.21], [-0.22, 0.235], [-0.28, 0.285]], 0.024, 0.13),
      S([[-0.28, 0.285], [-0.31, 0.245]]),
      S([[-0.31, 0.245], [-0.37, 0.265], [-0.41, 0.32]]),
      S([[-0.41, 0.32], [-0.44, 0.3]]),
      S([[-0.44, 0.31], [-0.462, 0.4], [-0.458, 0.52]]),
    ];
    strands = [
      [[0.25, 0.19], [0.23, 0.06], [0.19, -0.065]],
      [[0.18, 0.0], [0.0, -0.025], [-0.18, 0.04], [-0.3, 0.2]],
      [[0.15, 0.11], [-0.02, 0.1], [-0.16, 0.15], [-0.26, 0.26]],
      [[0.05, -0.08], [-0.2, -0.055], [-0.38, 0.04]],
      [[0.3, 0.02], [0.38, 0.1], [0.43, 0.2]],
    ];
    lights = [[[0.1, -0.045], [-0.1, -0.04], [-0.28, 0.04]], [[-0.485, 0.22], [-0.495, 0.36]], [[0.485, 0.22], [0.495, 0.36]]];
    darker = -0.16;
  } else {
    /* Slicked back: a smooth dome, combed straight back from the brow,
     * the sides faded to the skin. */
    runs = [
      S([[-0.495, 0.5], [-0.528, 0.38], [-sx(0.2) - 0.032, 0.2], [-sx(0.05) - 0.05, 0.02], [-0.22, -0.085], [0, -0.105], [0.22, -0.085], [sx(0.05) + 0.05, 0.02], [sx(0.2) + 0.032, 0.2], [0.528, 0.38], [0.495, 0.5]]),
      S([[0.458, 0.5], [0.462, 0.38], [0.435, 0.27], [0.36, 0.2]]),
      S([[0.36, 0.2], [0.2, 0.162], [0, 0.158], [-0.2, 0.162], [-0.36, 0.2]]),
      S([[-0.36, 0.2], [-0.435, 0.27], [-0.462, 0.38], [-0.458, 0.5]]),
    ];
    strands = [-0.27, -0.13, 0.02, 0.16, 0.29].map((x) => [[x, 0.165], [x * 1.1, 0.06], [x * 1.2, -0.03]]);
    lights = [[[-0.13, 0.12], [-0.145, 0.02], [-0.165, -0.06]], [[0.13, 0.12], [0.145, 0.02], [0.165, -0.06]]];
    sides = 0.36;
    darker = -0.12;
  }
  const outline = [];
  for (const [pts, tooth, step] of runs) {
    outline.push(...run(pts.map(P), tooth * W, step * W, face));
  }
  const shape = (onto) => {
    onto.beginPath();
    outline.forEach(([x, y], i) => (i ? onto.lineTo(x, y) : onto.moveTo(x, y)));
    onto.closePath();
  };
  const fill = layer(hg.canvas.width, hg.canvas.height);
  shape(fill.g);
  fill.g.fillStyle = colour;
  fill.g.fill();
  hg.save();
  shape(hg);
  hg.fillStyle = colour;
  hg.fill();
  hg.save();
  hg.clip();
  /* The short sides, a shade darker, below a line that rises toward the
   * back, as a barber's taper does; and the shade under a quiff's front. */
  hg.fillStyle = tint(colour, darker);
  for (const s of [-1, 1]) {
    hg.beginPath();
    through(hg, [[s * sides, 0.7], [s * sides, 0.3], [s * (sides + 0.06), 0.12], [s * 0.7, 0.04]].map(P), true);
    hg.lineTo(...P([s * 0.7, 0.7]));
    hg.closePath();
    hg.fill();
  }
  if (under) {
    hg.fillStyle = tint(colour, -0.3);
    hg.beginPath();
    through(hg, under.map(P), true);
    through(hg, under.slice().reverse().map(([x, y]) => P([x * 0.9, y - 0.045 - 0.03 * (1 - Math.abs(x) / 0.37)])));
    hg.closePath();
    hg.fill();
  }
  /* The ink strands, thin, and the lighter ones beside them. */
  hg.lineCap = 'round';
  hg.lineJoin = 'round';
  hg.strokeStyle = 'rgba(24, 19, 26, 0.75)';
  hg.lineWidth = 0.008 * W;
  for (const s of strands) {
    hg.beginPath();
    through(hg, s.map(P), true);
    hg.stroke();
  }
  hg.strokeStyle = tint(colour, 0.38);
  hg.lineWidth = 0.011 * W;
  for (const s of lights) {
    hg.beginPath();
    through(hg, s.map(P), true);
    hg.stroke();
  }
  hg.restore();
  shape(hg);
  hg.strokeStyle = HAIR_INK;
  hg.lineWidth = 0.014 * W;
  hg.lineJoin = 'round';
  hg.stroke();
  if (kind === 'slick') {
    /* The fade: the sides thin to the skin from the temple down. */
    for (const s of [-1, 1]) {
      const [x0, y0] = q.p(s * 0.3, 0.2);
      const [, y1] = q.p(s * 0.3, 0.5);
      const grad = hg.createLinearGradient(x0, y0, x0, y1);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
      hg.globalCompositeOperation = 'destination-out';
      hg.fillStyle = grad;
      hg.beginPath();
      through(hg, [[s * 0.36, 0.6], [s * 0.36, 0.3], [s * 0.42, 0.16], [s * 0.7, 0.1]].map(P), true);
      hg.lineTo(...P([s * 0.7, 0.6]));
      hg.closePath();
      hg.fill();
    }
  }
  hg.restore();
  return fill;
}

/* The highlight a shaved head catches: a crescent high on the crown and a
 * fleck beside it, white, kept to the skin. */
function drawScalpShine(g, q) {
  const { W } = q;
  const s = layer(g.canvas.width, g.canvas.height);
  const sg = s.g;
  const [x, y] = q.p(-0.17, 0.075);
  sg.fillStyle = 'rgba(255, 255, 255, 0.85)';
  sg.beginPath();
  sg.ellipse(x, y, 0.15 * W, 0.04 * W, -0.42, 0, Math.PI * 2);
  sg.fill();
  const [x2, y2] = q.p(-0.33, 0.17);
  sg.beginPath();
  sg.ellipse(x2, y2, 0.035 * W, 0.018 * W, -0.9, 0, Math.PI * 2);
  sg.fill();
  sg.globalCompositeOperation = 'destination-in';
  sg.drawImage(q.skin, 0, 0);
  g.drawImage(s, 0, 0);
}

/*
 * INK (see SKIN_INKS). The tattoos are BotGrinder's, drawn as an inker draws a
 * tattoo on a manga face: one blue black line, a little shading, under the
 * eyes, the hair and the glasses and kept to the skin. A rose on the
 * forehead with a leaf each side, a word in script along the cheekbone
 * beside one eye and three dots beside the other. The ring is a septum
 * ring, a silver hoop under the nose, drawn over a beard or a moustache.
 */
const TATTOO_INK = 'rgba(40, 48, 72, 0.8)';
function drawTattoos(g, q) {
  const { W } = q;
  const t = layer(g.canvas.width, g.canvas.height);
  const tg = t.g;
  tg.lineJoin = 'round';
  tg.lineCap = 'round';
  tg.strokeStyle = TATTOO_INK;
  tg.fillStyle = TATTOO_INK;
  tg.lineWidth = 0.011 * W;
  /* The rose: a spiral for the bud, a cup of petals round it with a
   * scalloped top, a leaf each side, and a wash of the same ink for its
   * shade. It sits between the brows and wherever the hair or a hat comes
   * down to, as big as that room allows, and is left off a forehead a
   * fringe all but covers. */
  const top = Math.max(0.12, q.fringe());
  const room = 0.37 - top;
  const [cx, cy] = q.p(0, top + 0.46 * room);
  const r = Math.min(0.085 * W, 0.36 * room * q.H);
  const shade = (alpha, path) => {
    tg.save();
    tg.globalAlpha = alpha;
    path();
    tg.fill();
    tg.restore();
    path();
    tg.stroke();
  };
  if (r >= 0.04 * W) {
    shade(0.22, () => {
      tg.beginPath();
      tg.moveTo(cx - r, cy - 0.15 * r);
      tg.bezierCurveTo(cx - r * 1.05, cy + 0.75 * r, cx - 0.4 * r, cy + r, cx, cy + r);
      tg.bezierCurveTo(cx + 0.4 * r, cy + r, cx + r * 1.05, cy + 0.75 * r, cx + r, cy - 0.15 * r);
      tg.quadraticCurveTo(cx + 0.95 * r, cy - 0.8 * r, cx + 0.35 * r, cy - 0.72 * r);
      tg.quadraticCurveTo(cx, cy - 1.02 * r, cx - 0.35 * r, cy - 0.72 * r);
      tg.quadraticCurveTo(cx - 0.95 * r, cy - 0.8 * r, cx - r, cy - 0.15 * r);
      tg.closePath();
    });
    tg.beginPath();
    for (let a = 0; a <= Math.PI * 3.2; a += 0.2) {
      const rr = r * (0.08 + 0.17 * (a / Math.PI));
      tg.lineTo(cx + Math.cos(a + 1.2) * rr, cy - 0.12 * r + Math.sin(a + 1.2) * rr * 0.82);
    }
    tg.stroke();
    for (const s of [-1, 1]) {
      /* Two layers of petal each side of the bud. */
      tg.beginPath();
      tg.moveTo(cx + s * 0.95 * r, cy + 0.1 * r);
      tg.quadraticCurveTo(cx + s * 0.55 * r, cy + 0.75 * r, cx + s * 0.1 * r, cy + 0.82 * r);
      tg.moveTo(cx + s * 0.62 * r, cy - 0.5 * r);
      tg.quadraticCurveTo(cx + s * 0.72 * r, cy + 0.2 * r, cx + s * 0.2 * r, cy + 0.5 * r);
      tg.stroke();
      /* A leaf, pointed at both ends, with its vein. */
      const [lx, ly] = [cx + s * 1.05 * r, cy + 0.72 * r];
      shade(0.3, () => {
        tg.beginPath();
        tg.moveTo(lx, ly);
        tg.quadraticCurveTo(lx + s * 0.5 * r, ly - 0.55 * r, cx + s * 1.95 * r, cy + 0.98 * r);
        tg.quadraticCurveTo(lx + s * 0.35 * r, ly + 0.55 * r, lx, ly);
        tg.closePath();
      });
      tg.save();
      tg.lineWidth = 0.007 * W;
      tg.beginPath();
      tg.moveTo(lx, ly);
      tg.lineTo(lx + s * 0.62 * r, ly + 0.12 * r);
      tg.stroke();
      tg.restore();
    }
  }
  /* A word in script down the left temple (the viewer's right), beside
   * the eye and under a glasses' arm: loops of a prolate cycloid, which a
   * hand's joined up writing is near enough at this size. */
  const [x0, y0] = q.p(0.405, 0.525);
  const a = 0.0062 * W;
  const b = 0.0085 * W;
  tg.save();
  tg.translate(x0, y0);
  tg.rotate(1.2);
  tg.lineWidth = 0.0075 * W;
  tg.beginPath();
  for (let k = 0; k <= Math.PI * 9; k += 0.18) {
    tg.lineTo(a * k - b * Math.sin(k), -b * Math.cos(k) * 0.95);
  }
  tg.stroke();
  tg.restore();
  /* Three dots beside the other eye. */
  for (const [fx, fy] of [[-0.44, 0.55], [-0.465, 0.59], [-0.415, 0.592]]) {
    const [x, y] = q.p(fx, fy);
    tg.beginPath();
    tg.arc(x, y, 0.0085 * W, 0, Math.PI * 2);
    tg.fill();
  }
  tg.globalCompositeOperation = 'destination-in';
  tg.drawImage(q.skin, 0, 0);
  g.drawImage(t, 0, 0);
}

function drawNoseRing(g, q) {
  const { W } = q;
  const [x, y] = q.p(0, 0.785);
  const r = 0.034 * W;
  const hoop = () => {
    g.beginPath();
    g.arc(x, y, r, -0.12 * Math.PI, 1.12 * Math.PI);
  };
  g.save();
  g.lineCap = 'round';
  hoop();
  g.lineWidth = 0.02 * W;
  g.strokeStyle = WEAR_INK;
  g.stroke();
  hoop();
  g.lineWidth = 0.0095 * W;
  g.strokeStyle = '#d5dbe2';
  g.stroke();
  g.beginPath();
  g.arc(x, y, r, 0.62 * Math.PI, 0.86 * Math.PI);
  g.lineWidth = 0.005 * W;
  g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  g.stroke();
  g.restore();
}

/*
 * FACIAL HAIR, in the hair's colour: from a cheek line down past the jaw's
 * own line (jawAt), so the beard's edge is the face's new outline. The lips
 * are kept clear, or a dark beard swallows a closed mouth's one line; an
 * open mouth is drawn over the beard as it is over the face. Stubble is a
 * tint and a scatter of dots, no outline, as a manga face draws a day's
 * growth.
 */
function drawBeard(g, kind, q, colour) {
  const { W } = q;
  const P = ([x, y]) => q.p(x, y);
  const b = layer(g.canvas.width, g.canvas.height);
  const bg = b.g;
  bg.lineJoin = 'round';
  bg.lineCap = 'round';
  let lipsRx = 0.12;
  if (kind === 'moustache') {
    const m = [[-0.23, 0.852], [-0.18, 0.8], [-0.09, 0.78], [0, 0.79], [0.09, 0.78], [0.18, 0.8], [0.23, 0.852]];
    const under = [[0.2, 0.838], [0.14, 0.818], [0.05, 0.815], [0, 0.822], [-0.05, 0.815], [-0.14, 0.818], [-0.2, 0.838]];
    bg.beginPath();
    through(bg, m.map(P), true);
    through(bg, under.map(P));
    bg.closePath();
    bg.fillStyle = colour;
    bg.fill();
    bg.lineWidth = 0.012 * W;
    bg.strokeStyle = HAIR_INK;
    bg.stroke();
    g.drawImage(b, 0, 0);
    return;
  }
  /* The cheek line, from the left sideburn down under the nose and back
   * up to the right one; a full beard starts higher on the cheek. */
  const full = kind === 'full';
  const cheek = full
    ? [[-0.49, 0.5], [-0.46, 0.62], [-0.34, 0.71], [-0.22, 0.765], [-0.1, 0.772], [0, 0.778], [0.1, 0.772], [0.22, 0.765], [0.34, 0.71], [0.46, 0.62], [0.49, 0.5]]
    : [[-0.485, 0.52], [-0.445, 0.64], [-0.3, 0.75], [-0.19, 0.79], [-0.09, 0.785], [0, 0.792], [0.09, 0.785], [0.19, 0.79], [0.3, 0.75], [0.445, 0.64], [0.485, 0.52]];
  /* Past the jaw: a short beard by a little, a full one by a lot at the
   * chin, its foot ragged. */
  const hang = (fx) => (full ? 0.07 + 0.105 * (1 - Math.abs(fx) / 0.45) : 0.035 + 0.015 * (1 - Math.abs(fx) / 0.45));
  const foot = [];
  for (let i = 9; i >= -9; i -= 1) {
    const fx = i * 0.05;
    foot.push([fx, jawAt(q.head, fx) + hang(fx) * (full && i % 2 ? 0.84 : 1)]);
  }
  const outline = () => {
    bg.beginPath();
    through(bg, cheek.map(P), true);
    bg.lineTo(...P(foot[0]));
    through(bg, foot.map(P));
    bg.closePath();
  };
  if (kind === 'stubble') {
    const [r, gg, bb] = rgbOf(colour);
    bg.save();
    outline();
    bg.clip();
    bg.fillStyle = `rgba(${r}, ${gg}, ${bb}, 0.2)`;
    bg.fillRect(0, 0, b.width, b.height);
    /* The dots on a jittered grid, so they are even, as a screen tone is,
     * and never in clumps. */
    bg.fillStyle = `rgba(${Math.round(r * 0.7)}, ${Math.round(gg * 0.7)}, ${Math.round(bb * 0.7)}, 0.7)`;
    const rnd = grain(7);
    const [ax, ay] = q.p(-0.52, 0.55);
    const [cx, cy] = q.p(0.52, 1.1);
    const cell = 0.026 * W;
    const dot = 0.0058 * W;
    bg.beginPath();
    for (let y = ay, row = 0; y < cy; y += cell * 0.87, row += 1) {
      for (let x = ax + (row % 2) * cell * 0.5; x < cx; x += cell) {
        const dx = x + (rnd() - 0.5) * cell * 0.6;
        const dy = y + (rnd() - 0.5) * cell * 0.6;
        bg.moveTo(dx + dot, dy);
        bg.arc(dx, dy, dot, 0, Math.PI * 2);
      }
    }
    bg.fill();
    bg.restore();
    bg.globalCompositeOperation = 'destination-in';
    bg.drawImage(q.skin, 0, 0);
    lipsRx = 0.11;
  } else {
    outline();
    bg.fillStyle = colour;
    bg.fill();
    bg.save();
    bg.clip();
    /* The shade along the jaw, then strands. */
    bg.fillStyle = tint(colour, -0.3);
    bg.beginPath();
    through(bg, foot.map(([x, y]) => P([x * 0.94, y - (full ? 0.06 : 0.03)])), true);
    through(bg, foot.slice().reverse().map(([x, y]) => P([x, y + 0.02])));
    bg.closePath();
    bg.fill();
    bg.strokeStyle = 'rgba(24, 19, 26, 0.6)';
    bg.lineWidth = 0.007 * W;
    for (const fx of [-0.38, -0.28, -0.16, -0.05, 0.05, 0.16, 0.28, 0.38]) {
      bg.beginPath();
      bg.moveTo(...P([fx * 0.96, Math.max(0.87, jawAt(q.head, fx) - 0.1)]));
      bg.lineTo(...P([fx, jawAt(q.head, fx) + hang(fx) * 0.7]));
      bg.stroke();
    }
    bg.restore();
    bg.lineWidth = 0.012 * W;
    bg.strokeStyle = HAIR_INK;
    outline();
    bg.stroke();
  }
  /* The lips clear, so the mouth drawn after reads on any beard. */
  bg.globalCompositeOperation = 'destination-out';
  const [lx, ly] = q.p(0, 0.838);
  bg.beginPath();
  bg.ellipse(lx, ly + 0.012 * W, lipsRx * W, 0.03 * W, 0, 0, Math.PI * 2);
  bg.fill();
  g.drawImage(b, 0, 0);
}

/*
 * A head and shoulders, square: the bust the dialogue stands on a speech
 * box and the editor shows large. `open` is the talking mouth, `half` the
 * small scale (see the atlas above). Returns a canvas, kept, so the same
 * face asked for twice is drawn once.
 */
const bustCache = new Map();
export function avatarBust(raw, expr = 'calm', open = false, half = 0, shut = false) {
  if (!atlas[0]) {
    return null;
  }
  const av = cleanAvatar(raw);
  const id = `${LOOK_FIELDS.map((k) => av[k]).join('.')}|${expr}|${open ? 1 : 0}|${half}|${shut ? 1 : 0}`;
  const kept = bustCache.get(id);
  if (kept) {
    return kept;
  }
  const head = `head-${HEADS[headOf(av)]}`;
  const hf = frameOf(head, half);
  const W = hf.width;
  const H = hf.chin - hf.top;
  const side = Math.round(2.05 * W);
  const tall = Math.round(side * TALL);
  /* The crop, as compose.py takes it, in the head part's pixels. */
  const ox = hf.cx - side / 2;
  const oy = hf.top - 0.3 * H;
  const at = (x, y) => [x - ox, y - oy];
  const livery = liveryCss(av, 0);
  const canvas = layer(side, tall);
  const g = canvas.getContext('2d');

  const draw = (onto, c, x, y, sx = 1, sy = sx) => {
    const [px, py] = at(x, y);
    onto.drawImage(c, px, py, c.width * sx, c.height * sy);
  };
  /* Hair and wear were drawn on a bust of their own; fit that bust's face
   * to this head's, by skull top, chin and width. */
  const fit = (onto, name, jobs, fill = false) => {
    const f = frameOf(name, half);
    const sx = W / f.width;
    const sy = H / (f.chin - f.top);
    const c = partCanvas(name, jobs, half);
    if (fill && !c.fill) {
      return;
    }
    draw(onto, fill ? c.fill : c, hf.cx - f.cx * sx, hf.top - f.top * sy, sx, sy);
  };
  /* Eyes, mouths and marks are packed at the portrait's unit, a head
   * UNIT pixels wide, and at half that in the half size atlas. */
  const unit = W / (half ? UNIT / 2 : UNIT);
  const px = W / 150;
  const headJobs = [[SKIN, SKINS[toneOf(av)], 255], [CLOTH, livery, 158]];
  const headPart = partCanvas(head, headJobs, half);
  /* The head on a layer of its own, where a shaved head's shadow, its
   * shine and stubble look for the skin they may lie on; made only for
   * those. */
  let skin = null;
  const share = (y) => (y < 0 ? 0.05 : y / H - 0.3);
  /* Drawn hair, beards and wear, in the face's measure (see drawWear). */
  const q = {
    W,
    H,
    head: HEADS[headOf(av)],
    get skin() {
      if (!skin) {
        skin = layer(side, tall);
        draw(skin.g, headPart, 0, 0);
      }
      return skin;
    },
    p: (fx, fy) => at(hf.cx + fx * W, hf.top + fy * H),
    top: () => 0.05,
    hat: 0,
    eyeY: 0.545,
    hair: HAIR_COLOURS[av.hairColour],
    livery,
  };

  /* What is worn and the hair first, because the face is shaded by them. */
  const wear = WEARS[av.acc];
  const wearName = wear && !DRAWN.has(wear) ? `wear-${WEAR_PART[wear] || wear}` : '';
  const wearJobs = [[CLOTH, KIT.has(wear) ? KIT_COLOUR : livery, null]];
  let worn = null;
  if (wearName && wear !== 'scarf') {
    worn = layer(side, tall);
    fit(worn.g, wearName, wearJobs);
  }
  const hairKind = HAIRS[av.hair];
  const hairName = `hair-${hairKind}`;
  const hairJobs = [[HAIR, HAIR_COLOURS[av.hairColour], null]];
  const hair = layer(side, tall);
  const hg = hair.g;
  const drawnHair = DRAWN_HAIR.has(hairKind);
  const hairFill = drawnHair ? drawHair(hg, hairKind, q, HAIR_COLOURS[av.hairColour]) : null;
  if (!drawnHair) {
    fit(hg, hairName, hairJobs);
  }
  q.top = (fx) => share(hairTopAt(hg, hf.cx + fx * W - ox, side));
  q.hat = worn ? share(hairTopAt(worn.g, hf.cx - ox, side)) : 0;
  /* How far down the forehead the hair or a hat comes, over its middle. */
  q.fringe = () => {
    const from = (0.3 + 0.37) * H;
    const y = Math.max(fringeAt(hg, side / 2, from), worn ? fringeAt(worn.g, side / 2, from) : -1);
    return y < 0 ? 0 : y / H - 0.3;
  };
  const hatted = HATS.has(wear);
  let skull = null;
  if (hatted) {
    skull = tuckUnderHat(hg, worn, side, H, TAILS.has(HAIRS[av.hair]), px);
  } else {
    /* The shine, through the hair's lit colour, a third of the way from
     * the hair's top down to the eyes, as wide as the hair is there. */
    const eyeY = 0.3 * H + 0.545 * H;
    const topY = hairTopAt(hg, side / 2, side);
    if (topY >= 0 && topY < eyeY - 0.2 * H) {
      const ringY = topY + 0.3 * (eyeY - topY);
      const [l, r] = hairSpanAt(hg, ringY + 0.06 * H, side);
      if (r - l > 0.5 * W) {
        const lit = layer(side, tall);
        const lg = lit.getContext('2d');
        const rx = Math.min(0.62 * W, ((r - l) / 2) * 0.92);
        drawShine(lg, side / 2, ringY + 0.42 * H, rx, 0.42 * H, H, shineColour(HAIR_COLOURS[av.hairColour]));
        lg.globalCompositeOperation = 'destination-in';
        if (hairFill) {
          lg.drawImage(hairFill, 0, 0);
        } else {
          fit(lg, hairName, hairJobs, true);
        }
        hg.drawImage(lit, 0, 0);
      }
    }
  }

  draw(g, headPart, 0, 0);
  if (skull) {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.moveTo(0, 0);
    for (let x = 0; x < side; x += 2) {
      g.lineTo(x, skull[x]);
    }
    g.lineTo(side, skull[side - 1]);
    g.lineTo(side, 0);
    g.closePath();
    g.fill();
    g.restore();
  }
  /* The shadow the hair and anything on the head throw on the skin. */
  const shade = layer(side, tall);
  const sg = shade.getContext('2d');
  const drop = 0.035 * H;
  sg.drawImage(hair, 0.01 * W, drop);
  if (worn && wear !== 'glasses' && wear !== 'goggles' && wear !== 'fpv') {
    sg.drawImage(worn, 0.01 * W, drop);
  }
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = '#d9b9cc';
  sg.fillRect(0, 0, side, tall);
  sg.globalCompositeOperation = 'destination-in';
  draw(sg, headPart.fill, 0, 0);
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.drawImage(shade, 0, 0);
  g.restore();

  const mark = MARKS[expr];
  /* The flush on the cheeks, under the eyes' lower lids: faint on every
   * face, and on a blushing one deeper, with the three short strokes an
   * inker hatches across a cheek, and no outline, which would read as a
   * pair of goggles. */
  const blushing = mark === 'blush';
  /* On darker skin the flush is fainter and its strokes lighter, or it
   * reads as a red patch rather than a warm cheek. */
  const [kr, kg, kb] = rgbOf(SKINS[toneOf(av)]);
  const dark = (0.3 * kr + 0.59 * kg + 0.11 * kb) < 130;
  const deep = dark ? 0.62 : 1;
  for (const sideX of [-1, 1]) {
    const [bx, by] = at(hf.cx + sideX * 0.27 * W, hf.top + 0.72 * H);
    const r = (blushing ? 0.13 : 0.11) * W;
    const grad = g.createRadialGradient(bx, by, 0, bx, by, r);
    grad.addColorStop(0, blushing ? `rgba(255, 92, 120, ${0.5 * deep})` : `rgba(255, 105, 125, ${0.22 * deep})`);
    grad.addColorStop(blushing ? 0.6 : 0, blushing ? `rgba(255, 100, 128, ${0.32 * deep})` : `rgba(255, 105, 125, ${0.22 * deep})`);
    grad.addColorStop(1, 'rgba(255, 110, 130, 0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(bx, by, r, r * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    if (blushing) {
      g.save();
      g.strokeStyle = dark ? 'rgba(255, 158, 178, 0.85)' : 'rgba(214, 52, 88, 0.85)';
      g.lineWidth = Math.max(1, 0.012 * W);
      g.lineCap = 'round';
      g.beginPath();
      for (let k = -1; k <= 1; k++) {
        const x = bx + k * 0.05 * W;
        g.moveTo(x + 0.018 * W, by - 0.03 * W);
        g.lineTo(x - 0.018 * W, by + 0.03 * W);
      }
      g.stroke();
      g.restore();
    }
  }
  const ink = inkOf(av);
  if (ink & 1) {
    drawTattoos(g, q);
  }
  /* Eyes on the line the glasses sit on, as far apart as their lenses. */
  /* A blink is the laugh's closed lids, shown for a tenth of a second. */
  const en = `eyes-${shut ? 'bright-laugh' : eyesFor(EYE_STYLES[eyeStyleOf(av)], expr)}`;
  const ea = anchorOf(en, half);
  draw(g, partCanvas(en, [[IRIS, EYE_COLOURS[av.eyeColour], null]], half), hf.cx - ea[0] * unit, hf.top + 0.545 * H - ea[1] * unit, unit);
  const beard = BEARDS[beardOf(av)];
  if (beard) {
    drawBeard(g, beard, q, HAIR_COLOURS[av.hairColour]);
  }
  const mn = mouthFor(expr, open);
  const ma = anchorOf(mn, half);
  draw(g, partCanvas(mn, [], half), hf.cx - ma[0] * unit, hf.top + 0.835 * H - ma[1] * unit, unit);
  if (ink & 2) {
    drawNoseRing(g, q);
  }
  const faceMark = FACE_MARKS[markOf(av)];
  if (faceMark) {
    drawFaceMark(g, faceMark, (fx, fy) => at(hf.cx + fx * W, hf.top + fy * H), W, SKINS[toneOf(av)]);
  }

  if (wear === 'scarf') {
    fit(g, wearName, wearJobs);
  }
  if (wear === 'cat') {
    drawWear(g, wear, q);
  }
  g.drawImage(hair, 0, 0);
  if (hairKind === 'shaved' && !hatted) {
    drawScalpShine(g, q);
  }
  if (worn) {
    g.drawImage(worn, 0, 0);
  }
  if (wear === 'prop' || (DRAWN.has(wear) && wear !== 'cat')) {
    drawWear(g, wear, q);
  }
  if (mark && mark !== 'blush') {
    const r = rectOf(`mark-${mark}`, half);
    const [fx, fy] = MARK_AT[mark];
    draw(g, partCanvas(`mark-${mark}`, [], half), hf.cx + fx * W - (r[2] * unit) / 2, hf.top + fy * H - (r[3] * unit) / 2, unit);
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
 * 'face' for the round chip a list or a tag wears, 'eyes' and 'cheek' for
 * the editor's eye and face mark tiles, or 'card' for the editor's card,
 * a quarter taller than it is wide and a little closer in than the bust,
 * so the face is the card's. `shut` closes the eyes, for a blink. Draws
 * nothing until the atlas is in; the caller draws again when
 * loadAvatarAtlas resolves.
 *
 * The scale is the smallest that has the pixels: the half size parts
 * whenever the crop, drawn from them, is still at least as big as the
 * canvas, and the full ones only for a portrait drawn large.
 */
const CARD_ZOOM = 1.12;
const CROPS = {
  /* A square of the bust, as shares of the face: its side, and where its
   * top is, both in faces tall. */
  face: [1.2, 0.18],
  eyes: [0.66, 0.3 + 0.545 - 0.66 * 0.48],
  /* The cheeks, nose and mouth, where a face mark goes. */
  cheek: [0.72, 0.3 + 0.7 - 0.36],
  /* The eyes and the mouth and nothing over them, for an expression drawn
   * small enough that a hat would be all of it. */
  mug: [0.9, 0.3 + 0.66 - 0.45],
};
export function paintAvatar(target, raw, { expr = 'calm', open = false, crop = 'bust', size = 64, shut = false } = {}) {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const px = Math.round(size * dpr);
  const pxTall = crop === 'card' ? Math.round(px * TALL) : px;
  if (target.width !== px || target.height !== pxTall) {
    target.width = px;
    target.height = pxTall;
  }
  const g = target.getContext('2d');
  g.clearRect(0, 0, px, pxTall);
  if (!atlas[0]) {
    return false;
  }
  const av = cleanAvatar(raw);
  const hf = PARTS[`head-${HEADS[headOf(av)]}`].frame;
  const Hf = hf.chin - hf.top;
  const want = CROPS[crop] ? CROPS[crop][0] * Hf : 2.05 * hf.width;
  const half = want / 2 >= px * 0.95 ? 1 : 0;
  const bust = avatarBust(av, expr, open, half, shut);
  const k = half ? 0.5 : 1;
  const H = Hf * k;
  g.imageSmoothingQuality = 'high';
  if (CROPS[crop]) {
    const [share, top] = CROPS[crop];
    const s = share * H;
    g.drawImage(bust, bust.width / 2 - s / 2, top * H, s, s, 0, 0, px, px);
  } else if (crop === 'card') {
    /* An eighth closer, taken almost all from the shoulders, so the
     * tallest spikes and the marks over a head (a gasp's lines, a dizzy
     * swirl) stay on the card. */
    const sw = bust.width / CARD_ZOOM;
    const sh = bust.height / CARD_ZOOM;
    g.drawImage(bust, (bust.width - sw) / 2, (bust.height - sh) * 0.14, sw, sh, 0, 0, px, pxTall);
  } else {
    g.drawImage(bust, 0, 0, bust.width, bust.width, 0, 0, px, px);
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
  c.style.height = `${opts.crop === 'card' ? Math.round(size * TALL) : size}px`;
  if (!paintAvatar(c, raw, opts)) {
    loadAvatarAtlas().then(() => paintAvatar(c, raw, opts)).catch(() => {});
  }
  return c;
}
