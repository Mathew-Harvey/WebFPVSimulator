/*
 * skate.js: a rail, a ledge, a stair set and a quarter pipe.
 *
 * WHY A SKATE SET IN A DRONE GAME. The owner asked for a trick counter
 * "like the skate games", and the skate games are built out of exactly these
 * four things for a reason: each one is a line with an obvious beginning
 * and end, at a height a rider can read. For a quad they are a skim (along
 * the rail, the ledge's lip, the pipe's coping), a gap (over the stairs) and
 * a transfer (up the pipe and over the deck). The counter in Stage C scores
 * flying close to them; this file has to make them solid where they are
 * drawn, and make them look like the corner of a real town where people
 * skate.
 *
 * THE LOOK is a municipal plaza in the town's palette: pale concrete with
 * the tie holes of Japanese formwork, a stair set with hubba cheeks, yellow
 * warning tiles and a red handrail, a plywood quarter pipe with staggered
 * sheets and the park's teal side panels. What makes it a place people use
 * rather than a kit of parts is the wear, so there is wear everywhere a
 * board would put it: steel ground bright along the top of every rail and
 * every edge, wax on the ledges, skid marks, stickers and a tag or two. The
 * wear is also detail for the screen space ink to find when the pilot skims
 * past at half a metre, while the silhouettes and the four accents (red
 * rail, teal panels, yellow tiles, bright steel) carry the read at forty.
 *
 * The rail turns freely and is capsules only; the other three are boxes and
 * keep to the compass. Every curved or sloped surface (the pipe's curve, the
 * hubba cheeks) is solid as a staircase of boxes UNDER the drawn surface,
 * never above it, so a craft skimming it meets the picture first and the
 * solid a few centimetres later, which is the side of wrong a pilot
 * forgives. Every bend in a rail is solid as short straight capsules laid
 * along chords of the drawn bend, thinned so they stay inside the tube.
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

import { Parts, seededRandom, seedOf } from './parts.js';
import { sincos } from './trig.js';
import { canvas } from './textures.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const HALF_PI = Math.PI / 2;
const SC = { s: 0, c: 1 };

/* The shadow tints the kit uses, for this family's own colours. */
const TINT = 0x6f6790;
const TINT_DEEP = 0x5c5680;

/*
 * THIS FAMILY'S OWN COLOURS, merged into the kit's table by ./catalog.js.
 * Prefixed so no other family can collide with them.
 */
export const MATERIALS = {
  /* Painted steel in the town's own red, the accent it keeps for a thing
   * it wants looked at (the post box, the crossing), which is what a rail
   * in a skate corner is. */
  skateRed: { c: 0xe0453f, tint: 0x7a4a6a },
  /* Steel a board has ground bright, plain steel, and dark angle iron.
   * The thin trim casts no shadow: a strip a few centimetres wide throws a
   * shadow narrower than a shadow map texel, which is noise, not shape. */
  skateSteelBare: { c: 0xd9e0e8, tint: 0x857da6, noCast: true },
  skateSteel: { c: 0xa9b3be, tint: 0x646080 },
  skateSteelDark: { c: 0x5d6373, tint: 0x433e58, noCast: true },
  /* Concrete: the cast body, a paler capstone, the treads, the grime a
   * wet street leaves along the foot of everything, and the joints. */
  skateConcrete: { c: 0xcfc9ce, tint: 0x6a6288 },
  skateCapstone: { c: 0xe4dfe2, tint: TINT },
  skateStep: { c: 0xdbd6da, tint: TINT },
  skateGrime: { c: 0xa9a1ab, tint: 0x5f5880, noCast: true },
  skateJoint: { c: 0x958e9e, tint: TINT_DEEP, noCast: true },
  skateNosing: { c: 0x575264, tint: 0x433e58, noCast: true },
  /* The town's tactile paving, on its own two band ramp. */
  skateTactile: { c: 0xf2c53d, tint: 0x9a7f4a, bands: 2, noCast: true },
  /* The ramp: plywood sheets in three tones, the dark between them, and
   * the park's painted teal. The ply is pulled toward the town's beige
   * walls and its shadow tint toward violet: an orange tan under the cool
   * fill light goes a muddy grey brown, where the town's walls go lilac. */
  skatePlyA: { c: 0xe9d5b1, tint: 0x8a7aa8 },
  skatePlyB: { c: 0xe2cca6, tint: 0x8878a6 },
  skatePlyC: { c: 0xeedcbb, tint: 0x8c7caa },
  skatePlyGap: { c: 0x5e4d4a, tint: 0x3f3a50 },
  skateTeal: { c: 0x2f9c9a, tint: 0x3f5a70 },
  /* The fascia that edges a panel, and the scuffed kick along its foot. */
  skateTealDeep: { c: 0x22736f, tint: 0x344d66, noCast: true },
  /* Wax on steel: the dark greasy patches over the bright grind. */
  skateWaxSteel: { c: 0x7e7889, tint: 0x4d4862, noCast: true },
};

/* ------------------------------------------------------------------ *
 * PAINTED DECALS only this family uses. Pure functions of the variant,
 * every name invented, drawn in the town's ink and paper.
 * ------------------------------------------------------------------ */

const INK = '#39324f';
const PAPER = '#fbf7ee';
const JP = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', sans-serif`;
const DISPLAY = `'Arial Black', 'Helvetica Neue', Impact, 'Noto Sans CJK JP', sans-serif`;

function fitFont(g, text, maxW, size, font, weight = '900') {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${font}`;
    if (g.measureText(text).width <= maxW) {
      break;
    }
    s -= 2;
  } while (s > 8);
  return s;
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

/* A die cut sticker: ink round the outside, the white border the cutter
 * leaves, then the sticker's own colour. The ink is what makes a sticker
 * the size of a hand still read as a shape and not a smudge. */
function dieCut(g, shape, fill) {
  g.lineJoin = 'round';
  shape();
  g.lineWidth = 13;
  g.strokeStyle = INK;
  g.stroke();
  shape();
  g.lineWidth = 8;
  g.strokeStyle = PAPER;
  g.stroke();
  shape();
  g.fillStyle = fill;
  g.fill();
}

function letters(g, text, x, y, size, fill, font = DISPLAY, edge = 0) {
  g.font = `900 ${size}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (edge) {
    g.lineJoin = 'round';
    g.lineWidth = edge;
    g.strokeStyle = INK;
    g.strokeText(text, x, y);
  }
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

/* Eight invented stickers, each drawn about the origin at size s. */
const STICKERS = [
  /* A wheel company: a blue disc with a wind swirl. */
  (g, s) => {
    const R = s * 0.5;
    dieCut(g, () => { g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); }, '#3d6ec4');
    g.strokeStyle = PAPER;
    g.lineCap = 'round';
    g.lineWidth = s * 0.08;
    g.beginPath();
    g.arc(0, -R * 0.12, R * 0.48, Math.PI * 0.85, Math.PI * 2.15);
    g.stroke();
    g.beginPath();
    g.arc(R * 0.06, -R * 0.12, R * 0.2, Math.PI * 1.1, Math.PI * 2.4);
    g.stroke();
    letters(g, 'KAZE', 0, R * 0.62, s * 0.2, PAPER);
  },
  /* A board brand: a yellow slab, ink lettering. */
  (g, s) => {
    const w = s * 1.5;
    const h = s * 0.62;
    dieCut(g, () => roundRect(g, -w / 2, -h / 2, w, h, s * 0.12), '#f4c033');
    letters(g, 'SORA', 0, -h * 0.12, fitFont(g, 'SORA', w * 0.8, s * 0.42, DISPLAY), INK);
    letters(g, 'SKATEBOARDS', 0, h * 0.3, fitFont(g, 'SKATEBOARDS', w * 0.8, s * 0.13, DISPLAY), INK);
  },
  /* A black cat, the unofficial mascot of every plaza. */
  (g, s) => {
    const R = s * 0.42;
    dieCut(g, () => {
      g.beginPath();
      g.moveTo(-R * 0.95, -R * 0.2);
      g.lineTo(-R * 0.8, -R * 1.15);
      g.lineTo(-R * 0.3, -R * 0.78);
      g.quadraticCurveTo(0, -R * 0.9, R * 0.3, -R * 0.78);
      g.lineTo(R * 0.8, -R * 1.15);
      g.lineTo(R * 0.95, -R * 0.2);
      g.quadraticCurveTo(R * 1.05, R * 0.9, 0, R * 0.92);
      g.quadraticCurveTo(-R * 1.05, R * 0.9, -R * 0.95, -R * 0.2);
      g.closePath();
    }, '#322e3b');
    for (const k of [-1, 1]) {
      g.fillStyle = '#ffd64a';
      g.beginPath();
      g.ellipse(k * R * 0.38, 0, R * 0.2, R * 0.26, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#322e3b';
      g.fillRect(k * R * 0.38 - R * 0.04, -R * 0.2, R * 0.08, R * 0.4);
    }
    g.fillStyle = '#ff7ab6';
    g.beginPath();
    g.moveTo(-R * 0.08, R * 0.36);
    g.lineTo(R * 0.08, R * 0.36);
    g.lineTo(0, R * 0.46);
    g.closePath();
    g.fill();
  },
  /* A manga sound, a red burst: the sound of a board slapping down. */
  (g, s) => {
    const R = s * 0.55;
    dieCut(g, () => {
      g.beginPath();
      for (let i = 0; i < 24; i += 1) {
        const a = (i / 24) * Math.PI * 2;
        const r = i % 2 === 0 ? R : R * 0.7;
        g.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.85);
      }
      g.closePath();
    }, '#e0453f');
    letters(g, 'ズバッ', 0, 0, s * 0.34, PAPER, JP, s * 0.07);
  },
  /* The park itself: a teal oval with the lark. */
  (g, s) => {
    const w = s * 1.45;
    const h = s * 0.72;
    dieCut(g, () => { g.beginPath(); g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); }, '#2f9c9a');
    g.fillStyle = PAPER;
    g.beginPath();
    g.moveTo(-w * 0.34, -h * 0.02);
    g.quadraticCurveTo(-w * 0.22, -h * 0.34, -w * 0.08, -h * 0.06);
    g.quadraticCurveTo(-w * 0.2, -h * 0.14, -w * 0.34, -h * 0.02);
    g.fill();
    letters(g, 'HIBARI', w * 0.1, -h * 0.06, fitFont(g, 'HIBARI', w * 0.5, s * 0.25, DISPLAY), PAPER);
    letters(g, 'SKATE PLAZA', 0, h * 0.24, fitFont(g, 'SKATE PLAZA', w * 0.7, s * 0.12, DISPLAY), PAPER);
  },
  /* A pink slab, slanted lettering. */
  (g, s) => {
    const w = s * 1.3;
    const h = s * 0.55;
    dieCut(g, () => roundRect(g, -w / 2, -h / 2, w, h, s * 0.05), '#ff7ab6');
    g.save();
    g.transform(1, 0, -0.25, 1, 0, 0);
    letters(g, 'LOOP', 0, 0, fitFont(g, 'LOOP', w * 0.8, s * 0.4, DISPLAY), PAPER, DISPLAY, s * 0.06);
    g.restore();
  },
  /* A yellow star with a face. */
  (g, s) => {
    const R = s * 0.55;
    dieCut(g, () => {
      g.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? R : R * 0.45;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
    }, '#ffd64a');
    g.fillStyle = INK;
    g.fillRect(-R * 0.18, -R * 0.08, R * 0.08, R * 0.16);
    g.fillRect(R * 0.1, -R * 0.08, R * 0.08, R * 0.16);
  },
  /* A bearing brand: white disc, ink rings. */
  (g, s) => {
    const R = s * 0.46;
    dieCut(g, () => { g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); }, PAPER);
    g.strokeStyle = INK;
    g.lineWidth = s * 0.05;
    g.beginPath();
    g.arc(0, 0, R * 0.72, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(0, 0, R * 0.22, 0, Math.PI * 2);
    g.fill();
    letters(g, 'ORBIT', 0, -R * 0.46, fitFont(g, 'ORBIT', R * 1.1, s * 0.16, DISPLAY), INK);
  },
];

export const PAINTERS = {
  /* A slap of three or four stickers, overlapping the way they build up on
   * a spot over a summer. Two to one, like the graffiti. */
  skateStickers: {
    variants: 6,
    paint(v) {
      const c = canvas(256, 128);
      const g = c.getContext('2d');
      g.clearRect(0, 0, 256, 128);
      const rng = seededRandom(0x5c47 + v * 7919);
      const order = STICKERS.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng.next() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const n = 3 + (v % 2);
      for (let i = 0; i < n; i += 1) {
        g.save();
        g.translate(34 + (i + rng.range(0.1, 0.9)) * (188 / n), 64 + rng.range(-16, 16));
        g.rotate(rng.range(-0.4, 0.4));
        STICKERS[order[i]](g, rng.range(58, 80));
        g.restore();
      }
      return c;
    },
  },
  /* Wax: a dark greasy build up along an edge, broken where it wore off. */
  skateWax: {
    variants: 3,
    paint(v) {
      const c = canvas(256, 32);
      const g = c.getContext('2d');
      g.clearRect(0, 0, 256, 32);
      const rng = seededRandom(0x3a1 + v * 131);
      g.fillStyle = '#9e96a6';
      let x = rng.range(0, 12);
      while (x < 244) {
        const len = rng.range(18, 70);
        g.beginPath();
        g.ellipse(x + len / 2, 16 + rng.range(-3, 3), len / 2, rng.range(4, 9), rng.range(-0.04, 0.04), 0, Math.PI * 2);
        g.fill();
        x += len + rng.range(-8, 16);
      }
      return c;
    },
  },
  /* Skid marks: the black arcs urethane leaves on concrete. */
  skateScuff: {
    variants: 3,
    paint(v) {
      const c = canvas(256, 128);
      const g = c.getContext('2d');
      g.clearRect(0, 0, 256, 128);
      const rng = seededRandom(0x51d + v * 977);
      g.strokeStyle = '#a19aa9';
      g.lineCap = 'round';
      for (let i = 0; i < 3; i += 1) {
        g.lineWidth = rng.range(2, 3.5);
        g.beginPath();
        const y = rng.range(20, 108);
        g.moveTo(rng.range(10, 60), y);
        g.quadraticCurveTo(128, y + rng.range(-40, 40), rng.range(190, 246), y + rng.range(-20, 20));
        g.stroke();
      }
      return c;
    },
  },
  /* Rain streaks: the grey runs that hang under every top edge of exposed
   * concrete in the town, the weathering an anime background always draws
   * and a render never does. Tall and thin, hanging from the top. */
  skateStreaks: {
    variants: 3,
    paint(v) {
      const c = canvas(128, 256);
      const g = c.getContext('2d');
      g.clearRect(0, 0, 128, 256);
      const rng = seededRandom(0x7a1 + v * 613);
      /* Slender, long and only a little darker than the concrete: wide
       * ones read as painted icicles close up, and dark thin ones break
       * into a row of dots at twenty metres. These fade out instead. */
      g.fillStyle = '#aba3ad';
      let x = rng.range(4, 20);
      while (x < 116) {
        const w = rng.range(5, 12);
        const len = rng.range(120, 252);
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + w, 0);
        g.lineTo(x + w * 0.78, len * 0.88);
        g.quadraticCurveTo(x + w * 0.5, len, x + w * 0.22, len * 0.88);
        g.closePath();
        g.fill();
        x += w + rng.range(14, 44);
      }
      return c;
    },
  },
  /* A rust run from a bolt or a weld, down a face. */
  skateRust: {
    variants: 2,
    paint(v) {
      const c = canvas(64, 256);
      const g = c.getContext('2d');
      g.clearRect(0, 0, 64, 256);
      const rng = seededRandom(0x2a57 + v * 389);
      g.fillStyle = '#a97a62';
      for (let i = 0; i < 3; i += 1) {
        const x = 18 + i * 12 + rng.range(-4, 4);
        const w = rng.range(4, 9);
        const len = rng.range(90, 250);
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + w, 0);
        g.lineTo(x + w * 0.6, len);
        g.lineTo(x + w * 0.35, len);
        g.closePath();
        g.fill();
      }
      return c;
    },
  },
  /* The cone hole a formwork tie leaves in exposed concrete, the grid of
   * small dark dots every Japanese retaining wall carries. */
  skateTieHole: {
    variants: 1,
    paint() {
      const c = canvas(32, 32);
      const g = c.getContext('2d');
      g.clearRect(0, 0, 32, 32);
      /* Drawn small in its square: the kit draws no decal under 5 cm, and
       * a tie hole is 3. */
      g.fillStyle = '#a19aa8';
      g.beginPath();
      g.arc(16, 16, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6a6474';
      g.beginPath();
      g.arc(16, 16, 5.5, 0, Math.PI * 2);
      g.fill();
      return c;
    },
  },
  /* The dots of a tactile warning tile, to lie on the yellow. */
  skateDots: {
    variants: 1,
    paint() {
      const c = canvas(64, 64);
      const g = c.getContext('2d');
      g.clearRect(0, 0, 64, 64);
      g.fillStyle = '#cf9f1c';
      for (let j = 0; j < 5; j += 1) {
        for (let i = 0; i < 5; i += 1) {
          g.beginPath();
          g.arc(7 + i * 12.5, 7 + j * 12.5, 4.2, 0, Math.PI * 2);
          g.fill();
        }
      }
      return c;
    },
  },
  /* The park's own mark, painted on a quarter pipe's side: a roundel with
   * the lark, and its name. */
  skateParkMark: {
    variants: 1,
    paint() {
      const c = canvas(512, 256);
      const g = c.getContext('2d');
      g.clearRect(0, 0, 512, 256);
      g.fillStyle = PAPER;
      g.strokeStyle = INK;
      g.lineWidth = 12;
      g.beginPath();
      g.arc(118, 128, 104, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      /* The lark, in ink, over a board. */
      g.fillStyle = INK;
      g.beginPath();
      g.moveTo(60, 120);
      g.quadraticCurveTo(92, 52, 128, 104);
      g.quadraticCurveTo(150, 60, 184, 70);
      g.quadraticCurveTo(152, 96, 146, 128);
      g.quadraticCurveTo(110, 150, 60, 120);
      g.fill();
      roundRect(g, 58, 168, 120, 16, 8);
      g.fill();
      for (const x of [78, 158]) {
        g.beginPath();
        g.arc(x, 192, 9, 0, Math.PI * 2);
        g.fill();
      }
      letters(g, 'ひばり', 360, 92, fitFont(g, 'ひばり', 260, 110, JP), PAPER, JP, 16);
      letters(g, 'SKATE PARK', 360, 190, fitFont(g, 'SKATE PARK', 270, 54, DISPLAY), PAPER, DISPLAY, 12);
      return c;
    },
  },
};

/* ------------------------------------------------------------------ *
 * Drawing helpers. Render only: nothing here reaches the physics, so
 * JavaScript's own trigonometry is fine in them.
 * ------------------------------------------------------------------ */

/* Unit geometries, built once from the kit's Three.js and shared by every
 * element, because the kit's batches clone what they are given. */
let UNITS = null;
function units(T) {
  if (!UNITS) {
    /* The top of a tube, along +x: the band of bare steel that grinding
     * leaves on a painted rail. */
    const strip = new T.CylinderGeometry(1, 1, 1, 5, 1, true, 1.5 * Math.PI - 0.95, 1.9);
    strip.rotateZ(-HALF_PI);
    UNITS = { box: new T.BoxGeometry(1, 1, 1), strip, bends: new Map() };
  }
  return UNITS;
}

/* A box from a to b in the x-y plane, `t` thick about that line, spanning
 * z0 to z1: an angle iron or a strip on a slope. */
function beam(K, mat, a, b, t, z0, z1) {
  const T = K.THREE;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) {
    return;
  }
  const m = new T.Matrix4().compose(
    new T.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (z0 + z1) / 2),
    new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.atan2(dy, dx)),
    new T.Vector3(len, t, Math.abs(z1 - z0)),
  );
  K.add(mat, units(T).box, m);
}

/* Bare steel along the top of a tube of radius r from a to b (same z), or
 * another material laid the same way. */
function wear(K, a, b, r, mat = 'skateSteelBare') {
  const T = K.THREE;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 0.02) {
    return;
  }
  const m = new T.Matrix4().compose(
    new T.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]),
    new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.atan2(dy, dx)),
    new T.Vector3(len, r, r),
  );
  K.add(mat, units(T).strip, m);
}

/* A grind run: bright steel from a to b along the top of a tube, with a
 * few dark patches of wax on it where a board stuck. */
function grind(K, a, b, r, rng) {
  wear(K, a, b, r * 1.06);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.floor(len / 0.9);
  for (let i = 0; i < n; i += 1) {
    const t0 = rng.range(0, 1 - 0.3 / len);
    const t1 = Math.min(1, t0 + rng.range(0.08, 0.3) / len);
    const p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2]];
    wear(K, p(t0), p(t1), r * 1.1, 'skateWaxSteel');
  }
}

/* A quarter bend of tube in the x-y plane, centre (cx, cy), turned by rot
 * (0 draws the arc from +x round to +y). */
function bendArc(K, mat, cx, cy, z, rot, bend, r) {
  const T = K.THREE;
  const u = units(T);
  const key = `${bend.toFixed(4)}:${r.toFixed(4)}`;
  let g = u.bends.get(key);
  if (!g) {
    g = new T.TorusGeometry(bend, r, 10, 6, HALF_PI);
    u.bends.set(key, g);
  }
  const m = new T.Matrix4().makeRotationZ(rot);
  m.setPosition(cx, cy, z);
  K.add(mat, g, m);
}

/* A strip of a circle's inside, facing its centre, from angle th0 to th1
 * (0 at the bottom of the circle, pi/2 at its -x side), spanning z0 to z1.
 * Normals point at the centre, so the cel bands follow the curve in smooth
 * sweeps rather than facet by facet. */
function arcStrip(K, mat, cx, cy, rad, th0, th1, z0, z1) {
  const T = K.THREE;
  const segs = Math.max(2, Math.ceil(((th1 - th0) / HALF_PI) * 20));
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segs; i += 1) {
    const th = th0 + (th1 - th0) * (i / segs);
    const s = Math.sin(th);
    const c = Math.cos(th);
    const x = cx - rad * s;
    const y = cy - rad * c;
    pos.push(x, y, z0, x, y, z1);
    nor.push(s, c, 0, s, c, 0);
    uv.push(i / segs, 0, i / segs, 1);
  }
  for (let i = 0; i < segs; i += 1) {
    const a = 2 * i;
    const b = 2 * (i + 1);
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  K.add(mat, g);
}

/* A painted cylinder that holds a capsule of radius r: its flats sit on
 * the capsule, so the drawing is never inside the solid. */
function tube(K, mat, a, b, r, seg = 10) {
  K.cyl(mat, a, b, r / Math.cos(Math.PI / seg), seg);
}

/* ------------------------------------------------------------------ *
 * A BENT TUBE RAIL, shared by the flat bar and the stair handrails.
 *
 * `pts` are the corners of the rail's centre line in the x-y plane at
 * height z: the first and last are the corners over the two legs, and the
 * segments next to them are level. Each leg rises from its base, turns
 * through a quarter bend of radius `bend` onto the rail, and the corners in
 * between are welded kinks.
 * ------------------------------------------------------------------ */

const BEND_STEPS = 3;

function railEnds(pts) {
  const n = pts.length - 1;
  return {
    sA: pts[1][0] > pts[0][0] ? 1 : -1,
    sB: pts[n][0] > pts[n - 1][0] ? 1 : -1,
    n,
  };
}

function railLayoutPath(P, mat, z, r, bend, pts, baseA, baseB, name) {
  const { sA, sB, n } = railEnds(pts);
  const [x0, y0] = pts[0];
  const [xk, yk] = pts[n];
  P.post(mat, x0, z, baseA, y0 - bend, r, { name: `${name}Leg`, seg: 10 });
  P.post(mat, xk, z, baseB, yk - bend, r, { name: `${name}Leg`, seg: 10 });
  /* The run between the bends, drawn by the kit as it is solid. */
  const run = [[x0 + sA * bend, y0], ...pts.slice(1, n), [xk - sB * bend, yk]];
  for (let i = 0; i < run.length - 1; i += 1) {
    P.cap(mat, [run[i][0], run[i][1], z], [run[i + 1][0], run[i + 1][1], z], r, { name, seg: 10 });
  }
  /* The bends, solid along chords of the drawn arc. A chord sits inside
   * its arc by the sagitta, so the capsule is thinned by that much and a
   * little more for the drawn tube's flats. */
  sincos(HALF_PI / BEND_STEPS / 2, SC);
  const rc = r * 0.94 - bend * (1 - SC.c);
  const chords = (cx, cy, ux) => {
    let prev = [cx + ux * bend, cy, z];
    for (let i = 1; i <= BEND_STEPS; i += 1) {
      sincos((i / BEND_STEPS) * HALF_PI, SC);
      const p = [cx + ux * bend * SC.c, cy + bend * SC.s, z];
      P.cap(mat, prev, p, rc, { draw: false, name: `${name}Bend` });
      prev = p;
    }
  };
  chords(x0 + sA * bend, y0 - bend, -sA);
  chords(xk - sB * bend, yk - bend, sB);
}

function railDrawPath(K, mat, z, r, bend, pts) {
  const { sA, sB, n } = railEnds(pts);
  const [x0, y0] = pts[0];
  const [xk, yk] = pts[n];
  bendArc(K, mat, x0 + sA * bend, y0 - bend, z, sA < 0 ? 0 : HALF_PI, bend, r);
  bendArc(K, mat, xk - sB * bend, yk - bend, z, sB > 0 ? 0 : HALF_PI, bend, r);
  for (let i = 1; i < n; i += 1) {
    K.ball(mat, [pts[i][0], pts[i][1], z], r * 1.22);
  }
}

/* A base plate and its four bolts, where a post meets the ground. Plain
 * steel with dark bolts: a dark plate vanishes into the town's tarmac and
 * leaves its bolts floating. */
function basePlate(K, x, y, z, s) {
  K.box('skateSteel', x - s, y, z - s, x + s, y + 0.012, z + s);
  const b = s * 0.68;
  for (const [dx, dz] of [[-b, -b], [b, -b], [-b, b], [b, b]]) {
    K.box('skateSteelDark', x + dx - 0.012, y + 0.012, z + dz - 0.012, x + dx + 0.012, y + 0.024, z + dz + 0.012);
  }
}

/*
 * A decal on a face, with a seeded variant, a hair off the surface. Each
 * kind sits at its own distance off the face, so two that overlap (a tie
 * hole on a rain streak) never fight for the same depth.
 */
const DECAL_OFF = { skateStreaks: 0.003, skateRust: 0.0045, skateWax: 0.004, skateScuff: 0.004, skateTieHole: 0.006, skateStickers: 0.007 };
function decal(K, key, x, y, z, w, h, face, v) {
  const o = DECAL_OFF[key] ?? 0.005;
  const d = { '+x': [o, 0, 0], '-x': [-o, 0, 0], '+y': [0, o, 0], '+z': [0, 0, o], '-z': [0, 0, -o] }[face];
  K.sign(key, x + d[0], y + d[1], z + d[2], w, h, face, v);
}

/* ------------------------------------------------------------------ *
 * THE RAIL. A flat bar: one round tube whose ends bend down into its own
 * legs, the shape every plaza rail has, with straight posts between when
 * it is long. Painted red, ground bright along the top.
 * ------------------------------------------------------------------ */

/* 64 mm tube: the heavy end of what parks use, so it holds a line in the
 * frame at forty metres. */
const RAIL_R = 0.032;

function railSpec(el) {
  const L = clamp(el.dims.length, 1.5, 30);
  const h = clamp(el.dims.height, 0.3, 3);
  const bend = Math.min(0.16, h * 0.35);
  /* Posts between the legs no more than about 2.6 m apart and never less
   * than 1.5 m, so the space between two posts is either a real opening
   * or not there (the gap rule). */
  const spans = Math.max(1, Math.min(Math.ceil(L / 2.6), Math.floor(L / 1.5)));
  return { L, h, bend, spans };
}

export function railLayout(el) {
  const s = railSpec(el);
  const P = new Parts();
  railLayoutPath(P, 'skateRed', 0, RAIL_R, s.bend, [[-s.L / 2, s.h], [s.L / 2, s.h]], 0, 0, 'rail');
  for (let i = 1; i < s.spans; i += 1) {
    const x = -s.L / 2 + (i / s.spans) * s.L;
    P.post('skateRed', x, 0, 0, s.h - RAIL_R, 0.026, { name: 'railPost', seg: 8 });
  }
  return P.list;
}

export function railDraw(el, parts, K) {
  const s = railSpec(el);
  const rng = seededRandom(seedOf(el));
  railDrawPath(K, 'skateRed', 0, RAIL_R, s.bend, [[-s.L / 2, s.h], [s.L / 2, s.h]]);
  /* The grind: bare steel along the top, in two or three worn runs that
   * stop short of the bends, where nobody's trucks reach. */
  const x0 = -s.L / 2 + s.bend + 0.12;
  const x1 = s.L / 2 - s.bend - 0.12;
  let x = x0 + rng.range(0, 0.25);
  while (x < x1 - 0.2) {
    const end = Math.min(x1, x + rng.range(0.8, 2.8));
    grind(K, [x, s.h, 0], [end, s.h, 0], RAIL_R, rng);
    x = end + rng.range(0.08, 0.35);
  }
  /* A welded collar where each post meets the bar, and a plate under
   * every foot. */
  basePlate(K, -s.L / 2, 0, 0, 0.1);
  basePlate(K, s.L / 2, 0, 0, 0.1);
  for (let i = 1; i < s.spans; i += 1) {
    const px = -s.L / 2 + (i / s.spans) * s.L;
    basePlate(K, px, 0, 0, 0.09);
    K.cyl('skateRed', [px, s.h - RAIL_R - 0.05, 0], [px, s.h - RAIL_R * 0.4, 0], 0.034, 8);
  }
}

/* ------------------------------------------------------------------ *
 * THE LEDGE. A cast concrete block under a paler capstone that overhangs
 * it, steel angle along both top edges, wax on the edges and the tie holes
 * of its formwork down its faces.
 *
 * Solid as ONE box of exactly the length, height and depth the author set,
 * so the builder's gap warnings measure what the author typed. The
 * capstone's lip is drawn 2.5 cm past it all round and is not solid: the
 * solid sits just inside the drawing, the forgiving side.
 * ------------------------------------------------------------------ */

function ledgeSpec(el) {
  const L = clamp(el.dims.length, 1, 30);
  const h = clamp(el.dims.height, 0.2, 2);
  const d = clamp(el.dims.depth, 0.3, 4);
  const capT = Math.min(0.1, h * 0.35);
  return { L, h, d, capT, lip: 0.025, body: h - capT };
}

export function ledgeLayout(el) {
  const s = ledgeSpec(el);
  const P = new Parts();
  P.box('skateConcrete', -s.L / 2, 0, -s.d / 2, s.L / 2, s.h, s.d / 2, { draw: false, name: 'ledge' });
  return P.list;
}

/* Steel angle along an edge running in x at height y, its outer face at
 * z = e, turned toward `side` (+1 or -1): a top flange, a side flange, and
 * the outer strip of the top ground bright. */
function angleX(K, x0, x1, y, e, side, leg = 0.05) {
  K.box('skateSteelDark', x0, y, e - side * leg, x1, y + 0.006, e - side * 0.016);
  K.box('skateSteelBare', x0, y, e - side * 0.016, x1, y + 0.007, e + side * 0.006);
  K.box('skateSteelDark', x0, y - leg, e, x1, y, e + side * 0.006);
}

/* Formwork on a face that runs in x at z = e: joints every panel, and a
 * pair of tie holes in each panel if the face is tall enough. */
function formworkX(K, x0, x1, y0, y1, e, side, rng) {
  const panels = Math.max(1, Math.round((x1 - x0) / 1.2));
  const pw = (x1 - x0) / panels;
  const face = side > 0 ? '+z' : '-z';
  for (let i = 0; i <= panels; i += 1) {
    const x = x0 + i * pw;
    if (i > 0 && i < panels) {
      K.box('skateJoint', x - 0.006, y0 + 0.06, e, x + 0.006, y1 - 0.02, e + side * 0.003);
    }
    if (i < panels && y1 - y0 > 0.3) {
      const yh = (y0 + y1) / 2 + rng.range(-0.02, 0.02);
      for (const f of [0.25, 0.75]) {
        decal(K, 'skateTieHole', x + pw * f, yh, e, 0.06, 0.06, face, 0);
      }
    }
  }
}

/* Rain streaks along a face that runs in x at z = e, hanging from its top
 * edge, which may slope: `topAt(x)` is the edge's height. Each streak is
 * placed wholly under the edge at its lower end. */
function streaksX(K, x0, x1, topAt, e, side, rng) {
  const face = side > 0 ? '+z' : '-z';
  let x = x0 + rng.range(0.05, 0.4);
  while (x < x1 - 0.25) {
    const w = rng.range(0.3, 0.55);
    const top = Math.min(topAt(x), topAt(x + w)) - 0.015;
    const h = Math.min(top - 0.06, rng.range(0.35, 0.9) * top);
    if (h > 0.12 && x + w < x1) {
      decal(K, 'skateStreaks', x + w / 2, top - h / 2, e, w, h, face, rng.int(0, 2));
    }
    x += w + rng.range(0.6, 1.8);
  }
}

export function ledgeDraw(el, parts, K) {
  const s = ledgeSpec(el);
  const rng = seededRandom(seedOf(el));
  K.box('skateConcrete', -s.L / 2, 0, -s.d / 2, s.L / 2, s.body, s.d / 2);
  K.box('skateCapstone', -s.L / 2 - s.lip, s.body, -s.d / 2 - s.lip, s.L / 2 + s.lip, s.h, s.d / 2 + s.lip);
  const xL = s.L / 2 + s.lip;
  const eZ = s.d / 2 + s.lip;
  for (const side of [-1, 1]) {
    angleX(K, -xL, xL, s.h, side * eZ, side);
    /* Wax in broken runs just inside the steel. */
    let x = -xL + rng.range(0.1, 0.6);
    while (x < xL - 0.4) {
      const len = Math.min(xL - 0.1 - x, rng.range(0.6, 1.6));
      decal(K, 'skateWax', x + len / 2, s.h, side * (eZ - 0.085), len, 0.07, '+y', rng.int(0, 2));
      x += len + rng.range(0.2, 1.2);
    }
    formworkX(K, -s.L / 2, s.L / 2, 0, s.body, side * s.d / 2, side, rng);
    streaksX(K, -s.L / 2, s.L / 2, () => s.body, side * s.d / 2, side, rng);
    if (s.body > 0.3 && rng.chance(0.7)) {
      const rx = rng.range(-s.L / 2 + 0.3, s.L / 2 - 0.3);
      decal(K, 'skateRust', rx, s.body - Math.min(0.3, s.body * 0.6) / 2 - 0.005, side * s.d / 2, 0.06, Math.min(0.3, s.body * 0.6), side > 0 ? '+z' : '-z', rng.int(0, 1));
    }
    /* The grime line along the foot. */
    K.box('skateGrime', -s.L / 2 - 0.003, 0, side * s.d / 2, s.L / 2 + 0.003, 0.05, side * (s.d / 2 + 0.003));
  }
  K.box('skateGrime', -s.L / 2 - 0.003, 0, -s.d / 2, -s.L / 2, 0.05, s.d / 2);
  K.box('skateGrime', s.L / 2, 0, -s.d / 2, s.L / 2 + 0.003, 0.05, s.d / 2);
  /* Stickers on an end, and a tag down the back if there is room. */
  const sw = Math.min(0.5, s.d * 0.75, (s.body - 0.08) * 2);
  if (sw > 0.12) {
    const end = rng.chance(0.5) ? 1 : -1;
    decal(K, 'skateStickers', end * s.L / 2, s.body * 0.55, rng.range(-0.1, 0.1) * s.d, sw, sw / 2, end > 0 ? '+x' : '-x', rng.int(0, 5));
  }
  const gw = Math.min(1.8, (s.body - 0.1) * 2, s.L - 0.8);
  if (gw > 0.5) {
    const gx = rng.range(-s.L / 2 + 0.4 + gw / 2, s.L / 2 - 0.4 - gw / 2);
    K.graffiti('-z', gx, 0.06 + gw / 4, -s.d / 2, gw, gw / 2, rng.int(0, 11));
  }
  if (s.L > 2.5) {
    decal(K, 'skateScuff', rng.range(-s.L / 4, s.L / 4), s.h, 0, 0.9, Math.min(0.45, s.d * 0.6), '+y', rng.int(0, 2));
  }
}

/* ------------------------------------------------------------------ *
 * THE STAIR SET. Steps rising toward -x from the bottom step at +x, and a
 * landing at the top, between two cheek walls whose tops run parallel to
 * the stair (the hubba ledges a plaza set has). A red handrail down the
 * middle when the set is wide enough for a lane each side of it, or on
 * both cheeks when it is not. Yellow warning tiles at the top and bottom,
 * the way every public stair in the town has them.
 * ------------------------------------------------------------------ */

const STAIR_RAIL_R = 0.025;
const STAIR_RAIL_H = 0.85;
const STAIR_BEND = 0.12;

function stairSpec(el) {
  const n = clamp(Math.round(el.dims.steps), 2, 24);
  const W = clamp(el.dims.width, 1.2, 12);
  const landing = clamp(el.dims.landing, 0.8, 12);
  const rise = 0.17;
  const run = 0.32;
  const total = n * run + landing;
  const xFront = total / 2;
  const cw = W >= 2.4 ? 0.3 : 0.2;
  const inner = W / 2 - cw;
  return {
    n, W, landing, rise, run, total, xFront, cw, inner,
    xBack: -total / 2,
    /* The top nosing, where the landing starts. */
    xTop: xFront - (n - 1) * run,
    top: n * rise,
    hub: 0.3,
    /* A rail down the middle only if both lanes beside it clear the gap
     * rule with room to spare. */
    centreRail: 2 * inner >= 3.0,
  };
}

/* The line through the nosings, for x on the flight. */
function nosingY(s, x) {
  const xc = clamp(x, s.xTop, s.xFront);
  return s.rise + (s.xFront - xc) * (s.rise / s.run);
}

function cheekTop(s, x) {
  return nosingY(s, x) + s.hub;
}

/* Every handrail: its z, the corners of its centre line, what its legs
 * and posts stand on. */
function stairRails(s) {
  /* The top leg stands back on the landing, up to a metre, and far enough
   * that even the smallest set keeps its two legs 1.4 m apart. */
  const xEnd = s.xTop - clamp(s.landing + s.run - 0.3, 0.3, 1.0);
  const pts = [
    [s.xFront + 0.3, s.rise + STAIR_RAIL_H],
    [s.xFront, s.rise + STAIR_RAIL_H],
    [s.xTop, s.top + STAIR_RAIL_H],
    [xEnd, s.top + STAIR_RAIL_H],
  ];
  /* On the cheeks when there is no room for a centre rail; on one cheek
   * only when the two would leave less than a lane between them, so the
   * way into the set is never a slot. */
  const zc = s.W / 2 - s.cw / 2;
  const both = 2 * zc - 2 * STAIR_RAIL_R >= 1.45;
  const rails = s.centreRail
    ? [{ z: 0, onCheek: false }]
    : both ? [{ z: -zc, onCheek: true }, { z: zc, onCheek: true }] : [{ z: zc, onCheek: true }];
  /* Posts on the flight, at tread centres, when the legs are more than
   * about 2.8 m apart, and never nearer than 1.4 m to a leg or each other,
   * so the space between two uprights is a real opening or none. */
  const legA = s.xFront + 0.3;
  const legSpan = legA - xEnd;
  const count = Math.max(0, Math.ceil(legSpan / 2.8) - 1);
  const posts = [];
  for (let k = 1; k <= count; k += 1) {
    const want = legA - (k * legSpan) / (count + 1);
    const i = clamp(Math.round((s.xFront - want) / s.run - 0.5), 0, s.n - 2);
    const x = s.xFront - (i + 0.5) * s.run;
    const clear = [legA, xEnd, ...posts.map((p) => p.x)].every((o) => Math.abs(o - x) >= 1.4);
    if (clear) {
      posts.push({ x, tread: (i + 1) * s.rise });
    }
  }
  return rails.map((r) => ({
    ...r,
    pts,
    baseB: r.onCheek ? s.top + s.hub : s.top,
    posts: posts.map((p) => ({ x: p.x, base: r.onCheek ? cheekTop(s, p.x) : p.tread, topY: nosingY(s, p.x) + STAIR_RAIL_H })),
  }));
}

export function stairsLayout(el) {
  const s = stairSpec(el);
  const P = new Parts();
  for (let i = 0; i < s.n - 1; i += 1) {
    P.box('skateStep', s.xFront - (i + 1) * s.run, 0, -s.inner, s.xFront - i * s.run, (i + 1) * s.rise, s.inner, { name: 'step' });
  }
  P.box('skateStep', s.xBack, 0, -s.inner, s.xTop, s.top, s.inner, { name: 'landing' });
  /* The cheeks: drawn as one sloped wall each, solid as a staircase of
   * half step slices each topped at the LOWER end of its slice, so the
   * solid is always under the drawn slope, by at most 6 cm. */
  for (const side of [-1, 1]) {
    const z0 = side * s.inner;
    const z1 = side * s.W / 2;
    const slices = (s.n - 1) * 2;
    for (let k = 0; k < slices; k += 1) {
      const xb = s.xFront - (k * s.run) / 2;
      const xa = xb - s.run / 2;
      P.box('skateConcrete', xa, 0, z0, xb, cheekTop(s, xb), z1, { draw: false, name: 'cheek' });
    }
    P.box('skateConcrete', s.xBack, 0, z0, s.xTop, s.top + s.hub, z1, { draw: false, name: 'cheek' });
  }
  for (const r of stairRails(s)) {
    railLayoutPath(P, 'skateRed', r.z, STAIR_RAIL_R, STAIR_BEND, r.pts, 0, r.baseB, 'handrail');
    for (const p of r.posts) {
      P.post('skateRed', p.x, r.z, p.base, p.topY - STAIR_RAIL_R * 0.5, 0.02, { name: 'handrailPost', seg: 8 });
    }
  }
  return P.list;
}

export function stairsDraw(el, parts, K) {
  const s = stairSpec(el);
  const rng = seededRandom(seedOf(el));
  /* A dark nosing on every tread, standing a hair proud and over the
   * riser: the line that makes a stair read, and an edge for the ink. */
  for (let i = 0; i < s.n; i += 1) {
    const x = s.xFront - i * s.run;
    const y = (i + 1) * s.rise;
    K.box('skateNosing', x - 0.055, y - 0.025, -s.inner, x + 0.012, y + 0.004, s.inner);
  }
  /* The cheeks, and steel angle along their inside top edge. */
  for (const side of [-1, 1]) {
    const z0 = side * s.inner;
    const z1 = side * s.W / 2;
    const zA = Math.min(z0, z1);
    const zB = Math.max(z0, z1);
    K.extrude('skateConcrete', [
      [s.xFront, 0], [s.xFront, s.rise + s.hub], [s.xTop, s.top + s.hub], [s.xBack, s.top + s.hub], [s.xBack, 0],
    ], zA, zB);
    const a = [s.xFront, s.rise + s.hub];
    const b = [s.xTop, s.top + s.hub];
    const zi = side * s.inner;
    const zo = zi + side * 0.05;
    /* The top flange, ground bright along its inner edge, and the side
     * flange down the face above the treads. */
    beam(K, 'skateSteelDark', [a[0], a[1] + 0.003], [b[0], b[1] + 0.003], 0.006, zi + side * 0.016, zo);
    beam(K, 'skateSteelBare', [a[0], a[1] + 0.0035], [b[0], b[1] + 0.0035], 0.007, zi - side * 0.006, zi + side * 0.016);
    beam(K, 'skateSteelDark', [a[0], a[1] - 0.025], [b[0], b[1] - 0.025], 0.05, zi - side * 0.006, zi);
    K.box('skateSteelDark', s.xBack, b[1], Math.min(zi + side * 0.016, zo), s.xTop, b[1] + 0.006, Math.max(zi + side * 0.016, zo));
    K.box('skateSteelBare', s.xBack, b[1], Math.min(zi - side * 0.006, zi + side * 0.016), s.xTop, b[1] + 0.007, Math.max(zi - side * 0.006, zi + side * 0.016));
    K.box('skateSteelDark', s.xBack, b[1] - 0.05, Math.min(zi - side * 0.006, zi), s.xTop, b[1], Math.max(zi - side * 0.006, zi));
    /* Formwork down the outside face, on the part that is a rectangle,
     * and grime along the foot. */
    const zf = side * s.W / 2;
    formworkX(K, s.xBack, s.xTop, 0, s.top + s.hub, zf, side, rng);
    streaksX(K, s.xBack, s.xFront, (x) => cheekTop(s, x), zf, side, rng);
    K.box('skateGrime', s.xBack - 0.003, 0, zf, s.xFront + 0.003, 0.05, zf + side * 0.003);
    K.box('skateGrime', s.xFront, 0, zA, s.xFront + 0.003, 0.05, zB);
    /* Wax where boards come off the landing onto the hubba. */
    decal(K, 'skateWax', s.xTop - 0.5, s.top + s.hub + 0.007, zi + side * 0.03, 0.9, 0.05, '+y', rng.int(0, 2));
  }
  /* The front of the treads' grime, and the back wall's. */
  K.box('skateGrime', s.xBack - 0.003, 0, -s.W / 2, s.xBack, 0.05, s.W / 2);
  /* Paving joints on the landing. */
  const lx0 = s.xBack;
  const lx1 = s.xTop - 0.06;
  for (let z = -s.inner + 0.6; z < s.inner - 0.2; z += 0.6) {
    K.box('skateJoint', lx0, s.top, z - 0.005, lx1, s.top + 0.002, z + 0.005);
  }
  for (let x = lx1 - 0.9; x > lx0 + 0.2; x -= 0.6) {
    K.box('skateJoint', x - 0.005, s.top, -s.inner, x + 0.005, s.top + 0.002, s.inner);
  }
  /* The warning tiles: a row behind the top nosing and a row on the
   * ground before the bottom step, each tile a yellow slab and its dots. */
  const tiles = (x0, y) => {
    const count = Math.max(1, Math.floor((2 * s.inner - 0.1) / 0.3));
    const zs = -count * 0.15;
    for (let i = 0; i < count; i += 1) {
      const za = zs + i * 0.3 + 0.004;
      const zb = za + 0.292;
      K.box('skateTactile', x0, y, za, x0 + 0.3, y + 0.006, zb);
      decal(K, 'skateDots', x0 + 0.15, y + 0.003, (za + zb) / 2, 0.28, 0.28, '+y', 0);
    }
  };
  tiles(s.xTop - 0.36, s.top);
  tiles(s.xFront + 0.4, 0);
  /* The rails: bends, welds, a flange under every foot, and the flight
   * ground bright where a board slides it. */
  for (const r of stairRails(s)) {
    railDrawPath(K, 'skateRed', r.z, STAIR_RAIL_R, STAIR_BEND, r.pts);
    const [p0, p1, p2, p3] = r.pts;
    basePlate(K, p0[0], 0, r.z, 0.08);
    basePlate(K, p3[0], r.baseB, r.z, 0.08);
    for (const p of r.posts) {
      basePlate(K, p.x, p.base, r.z, 0.07);
    }
    grind(K, [p1[0] - 0.2, p1[1] + 0.2 * (s.rise / s.run), r.z], [p2[0] + 0.15, p2[1] - 0.15 * (s.rise / s.run), r.z], STAIR_RAIL_R * 1.02, rng);
  }
  /* A tag on one cheek, the back wall, stickers on a cheek's front, and
   * skid marks on the landing. */
  const gSide = rng.chance(0.5) ? 1 : -1;
  const lLen = s.xTop - s.xBack;
  const gw = Math.min(lLen - 0.4, (s.top + s.hub - 0.2) * 2, 3.2);
  if (gw > 0.6) {
    K.graffiti(gSide > 0 ? '+z' : '-z', (s.xBack + s.xTop) / 2, 0.1 + gw / 4, gSide * s.W / 2, gw, gw / 2, rng.int(0, 11));
  }
  const bw = Math.min(2 * s.inner - 0.4, (s.top - 0.15) * 2, 3.4);
  if (bw > 0.6) {
    K.graffiti('-x', s.xBack, 0.08 + bw / 4, rng.range(-0.2, 0.2) * s.inner, bw, bw / 2, rng.int(0, 11));
  }
  const sw = Math.min(s.cw - 0.04, (s.rise + s.hub - 0.1) * 2);
  if (sw > 0.12) {
    const side = -gSide;
    decal(K, 'skateStickers', s.xFront, (s.rise + s.hub) * 0.5, side * (s.W / 2 - s.cw / 2), sw, sw / 2, '+x', rng.int(0, 5));
  }
  const depth = s.xTop - s.xBack;
  if (depth > 1.6) {
    const sw2 = Math.min(1.1, depth - 0.6);
    decal(K, 'skateScuff', s.xTop - 0.45 - sw2 / 2, s.top + 0.002, rng.range(-0.3, 0.3) * s.inner, sw2, sw2 / 2, '+y', rng.int(0, 2));
  }
}

/* ------------------------------------------------------------------ *
 * THE QUARTER PIPE. A transition of radius equal to its height, rising
 * toward -x, a deck behind the top and a steel coping along the lip. A
 * plywood face in staggered sheets over a dark frame, a steel kicker plate
 * where it meets the ground, and the park's teal side and back panels.
 * ------------------------------------------------------------------ */

/*
 * Solid slices under the curve, cut at equal angles rather than equal x, so
 * the steep top of the curve is cut as finely as the shallow toe. In a slice
 * of angle d the drawn curve is at most about 0.35 R d from the solid (the
 * worst is at 45 degrees, where the step is as tall as it is deep), so the
 * count grows with the radius: 14 per metre keeps that under 4 cm.
 */
function pipeSlices(R) {
  return Math.max(12, Math.ceil(R * 14));
}
/* The face sheets stand this far proud of the solid curve, and the deck
 * boards this far over the deck. */
const SHEET = 0.012;
const COPING_R = 0.03;

function pipeSpec(el) {
  const H = clamp(el.dims.height, 0.8, 5);
  const W = clamp(el.dims.width, 2, 20);
  const deck = clamp(el.dims.deck, 0.6, 6);
  const R = H;
  const total = R + deck;
  /* The wall of the transition is at xw; the toe, where the curve meets
   * the ground, is at xw + R; the curve's centre is (xw + R, R). */
  const xw = total / 2 - R;
  return { H, W, deck, R, total, xw, cx: xw + R, cy: R, xBack: -total / 2 };
}

export function pipeLayout(el) {
  const s = pipeSpec(el);
  const P = new Parts();
  /* The deck and the frame under it, landable. */
  P.box('skatePlyGap', s.xBack, 0, -s.W / 2, s.xw, s.H, s.W / 2, { draw: false, name: 'deck' });
  /* The transition: slice i runs from angle i to i + 1 up the curve and is
   * topped at the height of its LOWER end, so every box corner touches the
   * curve from below and the solid is always under the drawn surface. */
  const slices = pipeSlices(s.R);
  for (let i = 1; i < slices; i += 1) {
    sincos((i / slices) * HALF_PI, SC);
    const xb = s.cx - s.R * SC.s;
    const top = s.cy - s.R * SC.c;
    sincos(((i + 1) / slices) * HALF_PI, SC);
    const xa = s.cx - s.R * SC.s;
    P.box('skatePlyGap', xa, 0, -s.W / 2, xb, top, s.W / 2, { draw: false, name: 'transition' });
  }
  /* The coping, proud of the face by two centimetres and level with the
   * deck boards. Drawn a little longer than it is solid, so the round ends
   * of the capsule are inside the drawn pipe. */
  P.cap('skateSteel', [s.xw + 0.022, s.H - 0.018, -s.W / 2 + 0.01], [s.xw + 0.022, s.H - 0.018, s.W / 2 - 0.01], COPING_R, { draw: false, name: 'coping', seg: 10 });
  return P.list;
}

/* The height of the side panels' curved edge at x: the curve at the
 * panel's radius, or the full height behind the lip. */
function panelTop(s, rad, x) {
  const dx = s.cx - x;
  if (dx >= rad) {
    return s.H;
  }
  if (dx <= 0) {
    return 0;
  }
  return s.cy - Math.sqrt(rad * rad - dx * dx);
}

/* The largest x at which the panel still stands at least y tall. */
function panelReach(s, rad, y) {
  const dy = s.cy - y;
  return s.cx - Math.sqrt(Math.max(0, rad * rad - dy * dy));
}

export function pipeDraw(el, parts, K) {
  const s = pipeSpec(el);
  const rng = seededRandom(seedOf(el));
  const hw = s.W / 2;
  const arc = (rad, n) => {
    const pts = [];
    for (let i = 1; i <= n; i += 1) {
      const a = (i / n) * HALF_PI;
      pts.push([s.cx - rad * Math.sin(a), s.cy - rad * Math.cos(a)]);
    }
    return pts;
  };
  /* The frame: the whole profile, dark, on exactly the solid's curve. It
   * shows only in the joints between sheets. */
  K.extrude('skatePlyGap', [[s.cx, 0], ...arc(s.R, 24), [s.xBack, s.H], [s.xBack, 0]], -hw, hw);
  /* The face: sheets 1.22 m up the curve and 2.44 m across, the joints
   * staggered row by row the way a ramp builder lays them. */
  const rows = Math.max(2, Math.ceil((s.R * HALF_PI) / 1.22));
  const gap = 0.016;
  const tones = ['skatePlyA', 'skatePlyB', 'skatePlyC'];
  for (let r = 0; r < rows; r += 1) {
    const th0 = (r / rows) * HALF_PI + (r > 0 ? gap / 2 / s.R : 0);
    const th1 = ((r + 1) / rows) * HALF_PI - (r < rows - 1 ? gap / 2 / s.R : 0);
    const cuts = [-hw];
    for (let z = -hw + (r % 2 ? 1.22 : 2.44); z < hw - 0.4; z += 2.44) {
      cuts.push(z);
    }
    cuts.push(hw);
    for (let j = 0; j < cuts.length - 1; j += 1) {
      const z0 = cuts[j] + (j > 0 ? gap / 2 : 0);
      const z1 = cuts[j + 1] - (j < cuts.length - 2 ? gap / 2 : 0);
      arcStrip(K, rng.pick(tones), s.cx, s.cy, s.R - SHEET, th0, th1, z0, z1);
    }
  }
  /* The deck boards, the same sheets laid flat. */
  const dx0 = s.xBack;
  const dx1 = s.xw;
  const dRows = Math.max(1, Math.round((dx1 - dx0) / 1.22));
  for (let r = 0; r < dRows; r += 1) {
    const xa = dx0 + ((dx1 - dx0) * r) / dRows + (r > 0 ? gap / 2 : 0);
    const xb = dx0 + ((dx1 - dx0) * (r + 1)) / dRows - (r < dRows - 1 ? gap / 2 : 0);
    const cuts = [-hw];
    for (let z = -hw + (r % 2 ? 1.22 : 2.44); z < hw - 0.4; z += 2.44) {
      cuts.push(z);
    }
    cuts.push(hw);
    for (let j = 0; j < cuts.length - 1; j += 1) {
      const z0 = cuts[j] + (j > 0 ? gap / 2 : 0);
      const z1 = cuts[j + 1] - (j < cuts.length - 2 ? gap / 2 : 0);
      K.box(rng.pick(tones), xa, s.H, z0, xb, s.H + SHEET, z1);
    }
  }
  /* The coping: bare steel, longer than its solid so the capsule's round
   * ends are inside it, with the waxed and ground top brighter still. */
  tube(K, 'skateSteel', [s.xw + 0.022, s.H - 0.018, -hw - 0.02], [s.xw + 0.022, s.H - 0.018, hw + 0.02], COPING_R);
  /* Wax along the coping in patches: short dark sleeves over its top. */
  for (let z = -hw + rng.range(0.2, 0.8); z < hw - 0.3; z += rng.range(0.5, 1.4)) {
    const len = rng.range(0.15, 0.45);
    const T = K.THREE;
    const m = new T.Matrix4().compose(
      new T.Vector3(s.xw + 0.022, s.H - 0.018, z + len / 2),
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -HALF_PI),
      new T.Vector3(len, COPING_R * 1.12, COPING_R * 1.12),
    );
    K.add('skateWaxSteel', units(T).strip, m);
  }
  /* The steel plate a ramp builder screws down behind the coping, where
   * the trucks land: a bright band along the lip from the front and above. */
  K.box('skateSteel', s.xw - 0.3, s.H + SHEET, -hw, s.xw + 0.004, s.H + SHEET + 0.004, hw);
  for (let z = -hw + 0.3; z < hw - 0.1; z += 0.6) {
    K.box('skateSteelDark', s.xw - 0.2 - 0.01, s.H + SHEET + 0.004, z - 0.01, s.xw - 0.2 + 0.01, s.H + SHEET + 0.009, z + 0.01);
  }
  /* The kicker plate at the toe, bolted down. */
  K.box('skateSteel', s.cx - 0.08, 0, -hw, s.cx + 0.3, SHEET + 0.003, hw);
  for (let z = -hw + 0.25; z < hw - 0.1; z += 0.5) {
    K.box('skateSteelDark', s.cx + 0.2 - 0.012, SHEET + 0.003, z - 0.012, s.cx + 0.2 + 0.012, SHEET + 0.01, z + 0.012);
  }
  /* The side panels, standing a little proud of the sheets, and the back. */
  const pr = s.R - 0.02;
  const side = [[s.cx, 0], [s.cx, s.cy - pr], ...arc(pr, 24), [s.xw + 0.02, s.H + SHEET], [s.xBack - 0.02, s.H + SHEET], [s.xBack - 0.02, 0]];
  K.extrude('skateTeal', side, hw, hw + 0.02);
  K.extrude('skateTeal', side, -hw - 0.02, -hw);
  K.box('skateTeal', s.xBack - 0.02, 0, -hw - 0.02, s.xBack, s.H + SHEET, hw + 0.02);
  /* The fascia: a darker band that draws the curve and the deck edge on
   * each panel, and the scuffed kick along the foot, both a few
   * millimetres proud. The band is what makes the side read as a built
   * ramp and not a teal slab, from forty metres as much as from two. */
  const t = 0.075;
  const inner = pr + t;
  const thMin = Math.acos(Math.min(1, s.cy / inner));
  const band = [[s.cx, 0], [s.cx, s.cy - pr], ...arc(pr, 24)];
  for (let i = 24; i >= 0; i -= 1) {
    const a = thMin + (HALF_PI - thMin) * (i / 24);
    band.push([s.cx - inner * Math.sin(a), Math.max(0, s.cy - inner * Math.cos(a))]);
  }
  const kickEnd = panelReach(s, pr, 0.1) - 0.05;
  for (const sgn of [-1, 1]) {
    const za = sgn > 0 ? hw + 0.02 : -hw - 0.026;
    const zb = za + 0.006;
    K.extrude('skateTealDeep', band, za, zb);
    K.box('skateTealDeep', s.xBack - 0.02, s.H + SHEET - t, za, s.xw + 0.02 - t * 0.5, s.H + SHEET, zb);
    K.box('skateTealDeep', s.xBack - 0.02, 0, za, kickEnd, 0.09, zb);
  }
  K.box('skateTealDeep', s.xBack - 0.026, 0, -hw - 0.026, s.xBack - 0.02, 0.09, hw + 0.026);
  K.box('skateTealDeep', s.xBack - 0.026, s.H + SHEET - t, -hw - 0.026, s.xBack - 0.02, s.H + SHEET, hw + 0.026);
  /* Paint on the panels: a piece low on each side, the park's mark above
   * one of them, stickers up by the lip, and a big piece on the back. */
  for (const sgn of [-1, 1]) {
    const face = sgn > 0 ? '+z' : '-z';
    const zf = sgn * (hw + 0.02);
    let gh = Math.min(s.H * 0.42, 1.1);
    let xl = s.xBack + 0.12;
    let xr = panelReach(s, pr, 0.14 + gh + 0.06) - 0.04;
    if (xr - xl < gh * 2) {
      gh = Math.max(0.2, (xr - xl) / 2);
      xr = Math.min(xr, panelReach(s, pr, 0.14 + gh + 0.06) - 0.04);
    }
    const gw = Math.min(gh * 2, xr - xl);
    if (gw > 0.5) {
      K.graffiti(face, xl + (xr - xl) / 2 + rng.range(-0.1, 0.1) * (xr - xl - gw), 0.14 + gw / 4, zf, gw, gw / 2, rng.int(0, 11));
    }
    const top = 0.14 + gw / 2 + 0.1;
    const mh = Math.min(0.55, s.H - 0.12 - top);
    const mw = Math.min(mh * 2, s.xw - 0.1 - xl);
    if (sgn > 0 && mw > 0.5) {
      decal(K, 'skateParkMark', xl + mw / 2 + 0.05, top + mw / 4, zf, mw, mw / 2, face, 0);
    }
    /* Stickers just behind the lip, on the part of the panel that is full
     * height, unless the park's mark already reaches up there. */
    const sy = s.H - 0.22;
    const markTop = sgn > 0 && mw > 0.5 ? top + mw / 2 : 0;
    if (s.xw - 0.43 > s.xBack && markTop < sy - 0.14) {
      decal(K, 'skateStickers', s.xw - 0.23, sy, zf, 0.4, 0.2, face, rng.int(0, 5));
    }
  }
  const bw = Math.min(s.W - 0.8, (s.H - 0.3) * 2, 4);
  if (bw > 0.6) {
    K.graffiti('-x', s.xBack - 0.02, 0.15 + bw / 4, rng.range(-0.3, 0.3) * (s.W - bw) / 2, bw, bw / 2, rng.int(0, 11));
  }
}
