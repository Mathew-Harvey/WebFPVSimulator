/*
 * goatdraw.js: the goats drawn, every one wearing a 90%er's logo on both
 * flanks. Render only; ./herd.js says where they are.
 *
 * FOR THE LATENCY RULE. Two draw calls for the whole herd, whatever its
 * size, and one more in the sun's pass: the goats are ONE InstancedMesh in
 * the map's cel toon, and their logos are ONE more, a wrapped sticker a
 * flank, that SHARES the goats' instance matrices (the same buffer, written
 * once a frame and uploaded once), so a logo is carried by its goat on the
 * GPU and costs the CPU nothing. Which logo a goat wears is a number a goat
 * in an instanced attribute, read in the vertex shader to pick its cell of
 * one picture. The goats cast the sun's shadow, every goat in that one
 * call; the logos do not. A goat walks, trots and grazes on the GPU (THE
 * RIG, below): its legs swing and its head goes down in the vertex shader,
 * from three numbers a goat written each frame, so the CPU's work is the
 * same one matrix a goat it was, and no allocation.
 *
 * The picture is painted once, the logos cut from the Infinity Loops
 * map's two sticker sheets (../specials/infinityloops.js), which Heads'
 * house fetches anyway for its sticker wall, so it downloads nothing. A
 * sheet that does not come leaves those goats plain, and the game plays.
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

import * as THREE from 'three';
import { cel } from '../city/vendored/core/toon.js';
import { GRAZE } from './herd.js';

/* A goat's size against Joshua Bardwell's (../bardwell/goats.js), which is
 * a full sized goat: these are a little smaller, so a herd fits Heads'
 * garage. */
export const GOAT_K = 0.85;

/* Where the logo sits on a goat's flank, in its own frame (x forward, y
 * up, z right), before GOAT_K: its middle, its half size, and how far out
 * from the middle of the body, which is the flank's flat (BARREL below). */
export const LOGO = { x: -0.07, y: 0.62, half: 0.2, side: 0.18 };

/* The picture's grid of logos, and the share of each cell left clear
 * round its logo so a mip level does not bleed into the next. */
const COLS = 10;
const CELL_PX = 128;
const PAD = 0.07;

/* Their coats, as real goats wear them: the body's, the head and neck's,
 * and the legs' below the knee. White, a Boer's brown head, cream, toffee
 * with a white face, brown with dark points, grey, black with a white face,
 * an Alpine's tan with black points, cream with a dark head. A goat's coat
 * is its number's, so the same goat wears the same coat every run. */
const COATS = [
  [0xfaf6ee, 0xfaf6ee, 0xfaf6ee],
  [0xfaf6ee, 0x9a5434, 0xfaf6ee],
  [0xefe4cc, 0xefe4cc, 0xd9c8a6],
  [0xc89a68, 0xfaf6ee, 0x8a6a4a],
  [0x8a6a4a, 0x4a3a30, 0x3a302a],
  [0xb4b4b0, 0x8a8a86, 0x6a6a68],
  [0x3e3632, 0xe8e0d2, 0x3e3632],
  [0xd9b98a, 0x2e2a28, 0x2e2a28],
  [0xe8dcc8, 0x6a5a50, 0xe8dcc8],
];

/*
 * THE BODY. A barrel lofted through six rings of twelve corners, so the
 * flank is flat where the logo sits and rounds over the back and under the
 * belly: [across, up] in shares of a ring's half width and half height,
 * round from the top. The flat runs from 0.45 under the middle to 0.5 over
 * it; a logo larger than that wraps on round the curve (logoGeometry).
 */
const BARREL = [
  [0.35, 1], [0.75, 0.88], [1, 0.5], [1, -0.45], [0.8, -0.85], [0.4, -1],
  [-0.4, -1], [-0.8, -0.85], [-1, -0.45], [-1, 0.5], [-0.75, 0.88], [-0.35, 1],
];
/* On Low, eight corners with the same flat. */
const BARREL_LITE = [[0.55, 1], [1, 0.5], [1, -0.45], [0.6, -1], [-0.6, -1], [-1, -0.45], [-1, 0.5], [-0.55, 1]];
const HEX = [[0.87, 0.5], [0, 1], [-0.87, 0.5], [-0.87, -0.5], [0, -1], [0.87, -0.5]];
const SQUARE = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
/* The barrel's rings: x, half width, half height, middle height. The two
 * middle ones are the same, so the flank is flat for the logo's length. */
const RINGS = [
  [-0.54, 0.08, 0.1, 0.7],
  [-0.48, 0.15, 0.19, 0.67],
  [-0.3, 0.18, 0.23, 0.62],
  [0.16, 0.18, 0.23, 0.62],
  [0.35, 0.17, 0.22, 0.65],
  [0.45, 0.11, 0.16, 0.74],
];

/*
 * THE RIG, which the vertex shader reads (goatRig below). Each corner
 * carries [leg, head, coat]: leg 1 to 4 for the front left, front right,
 * hind left and hind right, plus a half below the knee, 0 for none; head,
 * how much of the nod it takes, 1 for the head, less down the neck; coat,
 * 0 the body's, 1 the head's, 2 the legs', 3 its own colour (eyes, horns,
 * hooves). The legs swing about the hip and bend at the knee, the head
 * goes down about the withers. Each goat's [stride phase, swing, nod] is
 * an instanced attribute written each frame.
 */
const HIP_F = [0.28, 0.56];
const HIP_H = [-0.35, 0.58];
const KNEE_F = [0.28, 0.31];
const KNEE_H = [-0.39, 0.33];
const WITHERS = [0.32, 0.68];
/* How far down the head goes to graze, radians, and how far a leg swings
 * at a run. */
const NOD = 1.5;
const SWING = 0.6;

/* Corner arithmetic, on [x, y, z]. */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

/* One goat facing +x, standing on y 0, flat shaded, its rig on every
 * corner: 464 triangles, and on Low (`lite`), with an eight cornered
 * barrel, three joint horns and no beard, 368. */
function goatGeometry(lite) {
  const pos = [];
  const nor = [];
  const col = [];
  const rig = [];
  const idx = [];
  const k = GOAT_K;
  const c = new THREE.Color();
  /* What the next corners are: colour, leg, nod, coat. */
  let leg = 0;
  let coat = 0;
  const paint = (hex, z) => {
    c.set(hex);
    coat = z;
  };
  /* A flat face through `pts` (each [x, y, z] with its nod), its front
   * away from `inside`. */
  const face = (pts, nods, inside) => {
    let n = unit(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const mid = mul(pts.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / pts.length);
    let order = pts.map((_, i) => i);
    if (dot(n, sub(mid, inside)) < 0) {
      n = mul(n, -1);
      order = order.reverse();
    }
    const base = pos.length / 3;
    for (const i of order) {
      const p = pts[i];
      pos.push(k * p[0], k * p[1], k * p[2]);
      nor.push(n[0], n[1], n[2]);
      col.push(c.r, c.g, c.b);
      rig.push(leg, nods[i], coat);
    }
    for (let j = 1; j + 1 < pts.length; j += 1) {
      idx.push(base, base + j, base + j + 1);
    }
  };
  /*
   * A loft through `rings`, each { c, U, V, nod }: its middle, its half
   * axes across, `shape`'s corners at c + a U + b V. `caps` closes the
   * first ring, the last, or both.
   */
  const loft = (rings, shape, caps = 'both') => {
    const ps = rings.map((r) => shape.map(([a, b]) => add(r.c, add(mul(r.U, a), mul(r.V, b)))));
    for (let i = 0; i + 1 < rings.length; i += 1) {
      const inside = mul(add(rings[i].c, rings[i + 1].c), 0.5);
      for (let j = 0; j < shape.length; j += 1) {
        const j1 = (j + 1) % shape.length;
        face([ps[i][j], ps[i][j1], ps[i + 1][j1], ps[i + 1][j]],
          [rings[i].nod, rings[i].nod, rings[i + 1].nod, rings[i + 1].nod], inside);
      }
    }
    const n = rings.length - 1;
    if (caps === 'both' || caps === 'start') {
      face(ps[0], ps[0].map(() => rings[0].nod), rings[1].c);
    }
    if (caps === 'both' || caps === 'end') {
      face(ps[n], ps[n].map(() => rings[n].nod), rings[n - 1].c);
    }
  };
  /* A ring at `p` across the line `d`, `w` across it sideways (z) and `h`
   * across it in the goat's own up and down. */
  const across = (p, d, w, h, nod = 0) => {
    const D = unit(d);
    const Z = [0, 0, 1];
    const V = unit(cross(Z, D));
    return { c: p, U: mul(Z, w), V: mul(V, h), nod };
  };
  /* A rod through `pts`, round-ish, `r` its radii, its own sideways axis
   * the one most across it. */
  const rod = (pts, r, nod, shape = SQUARE) => {
    const rings = pts.map((p, i) => {
      const d = unit(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]));
      let U = Math.abs(d[2]) > 0.8 ? [1, 0, 0] : [0, 0, 1];
      U = unit(sub(U, mul(d, dot(U, d))));
      const V = unit(cross(d, U));
      return { c: pts[i], U: mul(U, r[i]), V: mul(V, r[i]), nod };
    });
    loft(rings, shape, 'end');
  };
  const FUR = 0xffffff;
  /* The barrel. */
  paint(FUR, 0);
  loft(RINGS.map(([x, w, h, y]) => ({ c: [x, y, 0], U: [0, 0, w], V: [0, h, 0], nod: 0 })), lite ? BARREL_LITE : BARREL);
  /* The tail, up and back. */
  rod([[-0.5, 0.76, 0], [-0.535, 0.82, 0], [-0.56, 0.87, 0]], [0.028, 0.024, 0.014], 0);
  /* The neck, from the withers up to the head, bending more the higher. */
  paint(FUR, 1);
  const n0 = [0.36, 0.72, 0];
  const n1 = [0.5, 0.95, 0];
  loft([across(n0, sub(n1, n0), 0.1, 0.15, 0.15), across(n1, sub(n1, n0), 0.078, 0.095, 1)], HEX, 'none');
  /* The head, back of the skull to the nose, flat at the cheeks. */
  const hd = [0.33, -0.095, 0];
  loft([
    across([0.46, 1.045, 0], hd, 0.07, 0.08, 1),
    across([0.55, 1.04, 0], hd, 0.085, 0.095, 1),
    across([0.66, 1.01, 0], hd, 0.076, 0.082, 1),
    across([0.76, 0.965, 0], hd, 0.056, 0.058, 1),
    across([0.8, 0.95, 0], hd, 0.045, 0.046, 1),
  ], HEX);
  /* The ears, out and drooping. */
  for (const s of [1, -1]) {
    loft([
      { c: [0.52, 1.07, s * 0.065], U: [0.045, 0, 0], V: [0, 0.014, 0], nod: 1 },
      { c: [0.575, 1.02, s * 0.23], U: [0.028, 0, 0], V: [0, 0.009, 0], nod: 1 },
    ], SQUARE, 'end');
  }
  /* The beard. */
  if (!lite) {
    rod([[0.7, 0.935, 0], [0.685, 0.89, 0], [0.67, 0.84, 0]], [0.022, 0.016, 0.006], 1, HEX);
  }
  /* The horns, up and swept back. */
  paint(0xcfc2a2, 3);
  for (const s of [1, -1]) {
    const horn = [[0.515, 1.09, s * 0.035], [0.5, 1.16, s * 0.045], [0.455, 1.205, s * 0.055], [0.4, 1.215, s * 0.06], [0.36, 1.19, s * 0.062]];
    const hornR = [0.022, 0.019, 0.015, 0.011, 0.005];
    const joints = lite ? [0, 2, 4] : [0, 1, 2, 3, 4];
    rod(joints.map((j) => horn[j]), joints.map((j) => hornR[j]), 1);
  }
  /* The eyes: an amber iris and a goat's flat black pupil across it, on
   * each cheek; and the nose. */
  for (const s of [1, -1]) {
    const z = s * 0.0735;
    paint(0xd8a030, 3);
    face([[0.585, 1.03, z], [0.625, 1.03, z], [0.625, 1.06, z], [0.585, 1.06, z]], [1, 1, 1, 1], [0.6, 1.04, 0]);
    paint(0x231c18, 3);
    const zp = s * 0.075;
    face([[0.588, 1.04, zp], [0.622, 1.04, zp], [0.622, 1.05, zp], [0.588, 1.05, zp]], [1, 1, 1, 1], [0.6, 1.04, 0]);
  }
  paint(0x8f5e5a, 3);
  face([[0.802, 0.93, -0.025], [0.802, 0.93, 0.025], [0.808, 0.965, 0.022], [0.808, 0.965, -0.022]], [1, 1, 1, 1], [0.7, 0.95, 0]);
  /* The legs: the upper in the body's coat, below the knee in the legs',
   * and a dark hoof. Front left 1, front right 2, hind left 3, hind
   * right 4; left is -z. */
  const LEGS = [
    [1, HIP_F, KNEE_F, 0.29, -0.1], [2, HIP_F, KNEE_F, 0.29, 0.1],
    [3, HIP_H, KNEE_H, -0.37, -0.1], [4, HIP_H, KNEE_H, -0.37, 0.1],
  ];
  for (const [id, hip, knee, footX, z] of LEGS) {
    const top = [hip[0], hip[1], z];
    const kn = [knee[0], knee[1], z];
    const foot = [footX, 0.07, z];
    leg = id;
    paint(FUR, 0);
    loft([
      { c: top, U: [0, 0, 0.055], V: [0.07, 0, 0], nod: 0 },
      { c: kn, U: [0, 0, 0.038], V: [0.045, 0, 0], nod: 0 },
    ], SQUARE, 'none');
    leg = id + 0.5;
    paint(FUR, 2);
    loft([
      { c: kn, U: [0, 0, 0.038], V: [0.045, 0, 0], nod: 0 },
      { c: foot, U: [0, 0, 0.031], V: [0.033, 0, 0], nod: 0 },
    ], SQUARE, 'none');
    paint(0x3a302a, 3);
    loft([
      { c: [footX, 0.07, z], U: [0, 0, 0.034], V: [0.04, 0, 0], nod: 0 },
      { c: [footX + 0.006, 0, z], U: [0, 0, 0.038], V: [0.046, 0, 0], nod: 0 },
    ], SQUARE);
    leg = 0;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aRig', new THREE.Float32BufferAttribute(rig, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/*
 * The rig in GLSL, for the goats' toon and for their depth in the sun's
 * pass, so a shadow walks with its goat. Each corner turned about the knee
 * and then the hip, or about the withers by its share of the nod, its
 * normal with it.
 */
function goatRig(shader) {
  const k = GOAT_K;
  const v2 = (p) => `vec2(${(k * p[0]).toFixed(4)}, ${(k * p[1]).toFixed(4)})`;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', [
      '#include <common>',
      'attribute vec3 aRig;',
      'attribute vec3 aGait;',
      'vec2 goatTurn(vec2 p, vec2 at, float a) {',
      '  vec2 d = p - at;',
      '  float c = cos(a);',
      '  float s = sin(a);',
      '  return at + vec2(c * d.x - s * d.y, s * d.x + c * d.y);',
      '}',
      'vec3 goatPose(vec3 p) {',
      '  float leg = floor(aRig.x);',
      '  if (leg > 0.5) {',
      '    bool front = leg < 2.5;',
      '    float off = (leg == 1.0 || leg == 4.0) ? 0.0 : 0.5;',
      '    float t = 6.2831853 * (aGait.x + off);',
      '    float swing = aGait.y * sin(t);',
      `    float bend = max(0.0, cos(t)) * aGait.y * ${(0.9 / SWING).toFixed(4)};`,
      '    if (aRig.x - leg > 0.25) {',
      `      p.xy = goatTurn(p.xy, front ? ${v2(KNEE_F)} : ${v2(KNEE_H)}, front ? -bend : bend);`,
      '    }',
      `    p.xy = goatTurn(p.xy, front ? ${v2(HIP_F)} : ${v2(HIP_H)}, swing);`,
      '  } else if (aRig.y > 0.0) {',
      `    p.xy = goatTurn(p.xy, ${v2(WITHERS)}, -${NOD.toFixed(3)} * aGait.z * aRig.y);`,
      '  }',
      '  return p;',
      '}',
      'vec3 goatPoseNormal(vec3 n) {',
      '  return goatPose(n) - goatPose(vec3(0.0));',
      '}',
    ].join('\n'))
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = goatPoseNormal(objectNormal);')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = goatPose(transformed);');
}

/* The coats in GLSL: the body's from the instance colour, the head's and
 * the legs' from two attributes of their own, a fixed colour as it is. */
function goatCoat(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 aCoatHead;\nattribute vec3 aCoatLegs;')
    .replace('#include <color_vertex>', [
      'vColor = vec3(1.0);',
      '#ifdef USE_COLOR',
      'vColor *= color;',
      '#endif',
      '#ifdef USE_INSTANCING_COLOR',
      'vColor *= aRig.z < 0.5 ? instanceColor.xyz : (aRig.z < 1.5 ? aCoatHead : (aRig.z < 2.5 ? aCoatLegs : vec3(1.0)));',
      '#endif',
    ].join('\n'));
}

/* The two flank stickers in a goat's own frame: the right one facing +z,
 * the left facing -z, each reading the right way round from its own side,
 * each laid in strips on the barrel's flat and on its curve above and
 * below, so a logo taller than the flat wraps on round the body. */
function logoGeometry(lite) {
  const k = GOAT_K;
  const { x, y, half } = LOGO;
  const [, w, h, cy] = RINGS[2];
  /* The barrel's right side, top to bottom, and how far out it is at
   * height yy along it. */
  const right = (lite ? BARREL_LITE : BARREL).filter(([a]) => a > 0);
  const out = (yy) => {
    const b = (yy - cy) / h;
    for (let j = 0; j + 1 < right.length; j += 1) {
      const [a0, b0] = right[j];
      const [a1, b1] = right[j + 1];
      if (b <= b0 && b >= b1) {
        return w * (a0 + ((a1 - a0) * (b - b0)) / (b1 - b0));
      }
    }
    return w * right[b > 0 ? 0 : right.length - 1][0];
  };
  /* A strip from each corner of the side the logo covers to the next. */
  const yb = y - half;
  const yt = y + half;
  const levels = [yb, ...right.map(([, b]) => cy + b * h).filter((l) => l > yb && l < yt).sort((p, q) => p - q), yt];
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  for (const s of [1, -1]) {
    for (let j = 0; j + 1 < levels.length; j += 1) {
      const base = pos.length / 3;
      for (const [a, l] of [[-1, j], [1, j], [1, j + 1], [-1, j + 1]]) {
        const yy = levels[l];
        /* Seen from +z, +x is to the right; from -z it is to the left. */
        pos.push(k * (x + s * a * half), k * yy, k * s * (out(yy) + 0.006));
        nor.push(0, 0, s);
        uv.push((a + 1) / 2, (yy - levels[0]) / (2 * half));
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/*
 * The logos as one picture: `crops` { sheet, x, y, w, h } in shares of a
 * sheet, y down from the top, `sheets` the decoded sheets (or null). Each
 * logo fitted in its cell keeping its shape, cell i at column i % COLS,
 * row i / COLS from the top.
 */
function paintLogos(crops, sheets, pics = []) {
  const rows = Math.ceil((crops.length + pics.length) / COLS);
  const cv = document.createElement('canvas');
  cv.width = COLS * CELL_PX;
  cv.height = rows * CELL_PX;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  crops.forEach((c, i) => {
    const img = sheets[c.sheet];
    if (!img) {
      return;
    }
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const sw = c.w * W;
    const sh = c.h * H;
    const room = CELL_PX * (1 - 2 * PAD);
    const s = Math.min(room / sw, room / sh);
    const cx = (i % COLS) * CELL_PX + CELL_PX / 2;
    const cy = Math.floor(i / COLS) * CELL_PX + CELL_PX / 2;
    g.drawImage(img, c.x * W, c.y * H, sw, sh, cx - (sw * s) / 2, cy - (sh * s) / 2, sw * s, sh * s);
  });
  /* The patrons' pictures (patronPicture) follow the crops, fitted whole. */
  pics.forEach((pic, j) => {
    const i = crops.length + j;
    const room = CELL_PX * (1 - 2 * PAD);
    g.drawImage(pic, (i % COLS) * CELL_PX + (CELL_PX - room) / 2, Math.floor(i / COLS) * CELL_PX + (CELL_PX - room) / 2, room, room);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { texture: t, rows };
}

/* The plate a patron's name is written on, by tier: [plate, rim, ink]. */
const PLATES = {
  bronze: ['#3a2a22', '#c8895a', '#faf6ee'],
  silver: ['#2a3038', '#c4ccd6', '#faf6ee'],
  gold: ['#2c2616', '#f2c14e', '#fff6d8'],
};
const PIC_PX = 256;

/*
 * A patron's picture, a PIC_PX square canvas: their logo fitted whole when
 * `img` is a decoded picture, otherwise their name on a plate in the tier's
 * colour, in one or two lines at the largest size that fits. The one place
 * the fall back is, so a logo that did not come looks the same on the goat
 * and in the callout. The canvas carries naturalWidth and naturalHeight so
 * the shell's callout (stickerPicture in src/main.js) takes it as a sheet.
 */
export function patronPicture(patron, img) {
  const cv = document.createElement('canvas');
  cv.width = PIC_PX;
  cv.height = PIC_PX;
  cv.naturalWidth = PIC_PX;
  cv.naturalHeight = PIC_PX;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    const room = PIC_PX * 0.94;
    const k = Math.min(room / img.naturalWidth, room / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    g.drawImage(img, (PIC_PX - w) / 2, (PIC_PX - h) / 2, w, h);
    return cv;
  }
  const [plate, rim, ink] = PLATES[patron.tier] || PLATES.bronze;
  g.fillStyle = plate;
  g.strokeStyle = rim;
  g.lineWidth = 14;
  g.beginPath();
  g.roundRect(10, 40, PIC_PX - 20, PIC_PX - 80, 28);
  g.fill();
  g.stroke();
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const words = String(patron.name).split(' ');
  /* Try one line, then every split into two, and keep the largest type. */
  let best = null;
  for (let cut = words.length; cut >= 1; cut -= 1) {
    const lines = cut === words.length ? [words.join(' ')] : [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
    let size = 64;
    for (; size > 14; size -= 2) {
      g.font = `800 ${size}px sans-serif`;
      if (lines.every((l) => g.measureText(l).width <= PIC_PX - 56)) {
        break;
      }
    }
    if (!best || size > best.size) {
      best = { size, lines };
    }
    if (words.length === 1) {
      break;
    }
  }
  g.font = `800 ${best.size}px sans-serif`;
  const lead = best.size * 1.1;
  best.lines.forEach((l, n) => {
    g.fillText(l, PIC_PX / 2, PIC_PX / 2 + (n - (best.lines.length - 1) / 2) * lead, PIC_PX - 56);
  });
  return cv;
}

/*
 * The herd drawn: { group, update(), dispose } for `herd` (./herd.js),
 * `crops` its logos in the herd's order, `sheets` the decoded sheets, and
 * `worldAt(px, py, h)` the plan to the world. `S` is world metres a real
 * metre. `lite` draws Low's lighter goat. `pics` are the patron goats'
 * pictures (patronPicture), which are the herd's goats after the crops.
 */
export function makeGoatDraw(herd, crops, sheets, worldAt, S, lite = false, pics = []) {
  const N = herd.count;
  const group = new THREE.Group();
  group.name = 'goats';
  /* Its own toon, not the shared one: the rig and the coats are patched
   * into its shader after the toon's own patch. */
  const material = cel({ color: 0xffffff, vertexColors: true, bands: 3, tint: 0x6c5f8c, cache: false });
  const toon = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    toon(shader, renderer);
    goatRig(shader);
    goatCoat(shader);
  };
  material.customProgramCacheKey = () => 'goat-body';
  const geometry = goatGeometry(lite);
  /* Each goat's [stride phase, swing, nod], written each frame. */
  const gait = new Float32Array(N * 3);
  const gaitAttr = new THREE.InstancedBufferAttribute(gait, 3);
  gaitAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aGait', gaitAttr);
  const coatHead = new Float32Array(N * 3);
  const coatLegs = new Float32Array(N * 3);
  const body = new THREE.InstancedMesh(geometry, material, N);
  body.name = 'goats';
  /* The sun's pass draws them through a depth material with the same rig,
   * so a shadow trots and grazes with its goat. */
  body.castShadow = true;
  body.receiveShadow = false;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = goatRig;
  depth.customProgramCacheKey = () => 'goat-depth';
  body.customDepthMaterial = depth;
  body.frustumCulled = false;
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const tint = new THREE.Color();
  for (let i = 0; i < N; i += 1) {
    const [a, b, c] = COATS[(i * 5) % COATS.length];
    body.setColorAt(i, tint.set(a));
    tint.set(b).toArray(coatHead, i * 3);
    tint.set(c).toArray(coatLegs, i * 3);
  }
  body.instanceColor.needsUpdate = true;
  geometry.setAttribute('aCoatHead', new THREE.InstancedBufferAttribute(coatHead, 3));
  geometry.setAttribute('aCoatLegs', new THREE.InstancedBufferAttribute(coatLegs, 3));
  group.add(body);

  const { texture, rows } = paintLogos(crops, sheets, pics);
  const logoMat = new THREE.MeshBasicMaterial({
    map: texture, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  /* The cell a goat's logo is in, from its number: a few lines after the
   * picture's own lookup, before anything reads it. */
  logoMat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrid = { value: new THREE.Vector2(COLS, rows) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;\nuniform vec2 uGrid;')
      .replace('#include <uv_vertex>', [
        '#include <uv_vertex>',
        '#ifdef USE_MAP',
        'vec2 goatCell = vec2(mod(aCell, uGrid.x), uGrid.y - 1.0 - floor(aCell / uGrid.x));',
        'vMapUv = (goatCell + vec2(0.07) + uv * 0.86) / uGrid;',
        '#endif',
      ].join('\n'));
  };
  logoMat.customProgramCacheKey = () => 'goat-logos';
  const logoGeo = logoGeometry(lite);
  const cells = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    cells[i] = i;
  }
  logoGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
  const logos = new THREE.InstancedMesh(logoGeo, logoMat, N);
  logos.name = 'goat logos';
  logos.castShadow = false;
  logos.receiveShadow = false;
  logos.frustumCulled = false;
  /* The goats' own matrices: one buffer, one upload. */
  logos.instanceMatrix = body.instanceMatrix;
  group.add(logos);

  const m = new THREE.Matrix4();
  const k = S;
  /* How far down each head is, eased toward where it is going. */
  const nod = new Float32Array(N);
  /*
   * Each goat placed: its plan point and facing, turned into the world's
   * x, y, z (plan y north is the world's -z), its bounce, its size; and its
   * gait: the herd's stride phase, a swing that grows with its speed, and
   * its head down while it grazes standing, up now and then to look round,
   * each goat on a clock of its own. `dt` seconds since the last.
   */
  function update(dt = 0) {
    const { X, Y, FX, FY, HOP, PHASE, SPEED, MODE } = herd;
    const e = m.elements;
    const t = herd.clock();
    const ease = Math.min(1, dt * 2.5);
    for (let i = 0; i < N; i += 1) {
      const [x, , z] = worldAt(X[i], Y[i], 0);
      /* The goat's +x is its facing, plan (fx, fy), world (fx, 0, -fy);
       * its +z is to its right, world (fy, 0, fx); y is up. */
      const fx = FX[i];
      const fz = -FY[i];
      e[0] = fx * k; e[1] = 0; e[2] = fz * k; e[3] = 0;
      e[4] = 0; e[5] = k; e[6] = 0; e[7] = 0;
      e[8] = -fz * k; e[9] = 0; e[10] = fx * k; e[11] = 0;
      e[12] = x; e[13] = HOP[i] * k; e[14] = z; e[15] = 1;
      body.setMatrixAt(i, m);
      const sp = SPEED[i];
      const grazing = MODE[i] === GRAZE && sp < 0.5 && Math.sin(t * 0.45 + i * 2.39) > -0.35;
      nod[i] += ((grazing ? 1 : 0) - nod[i]) * ease;
      gait[i * 3] = PHASE[i];
      gait[i * 3 + 1] = Math.min(SWING, sp * 0.4);
      gait[i * 3 + 2] = nod[i];
    }
    body.instanceMatrix.needsUpdate = true;
    gaitAttr.needsUpdate = true;
  }
  update();

  return {
    group,
    update,
    dispose() {
      texture.dispose();
    },
  };
}

/*
 * Where goat i's logo is, for the shell's sticker hunt: the flank facing
 * `eye` (world), its middle `p` and normal `n` written in place, and its
 * size `w` in world metres.
 */
export function logoPose(herd, i, eye, worldAt, S, out) {
  const [x, , z] = worldAt(herd.X[i], herd.Y[i], 0);
  const fx = herd.FX[i];
  const fz = -herd.FY[i];
  /* The right flank faces (fy, 0, fx) in plan terms: world (-fz, 0, fx). */
  const rx = -fz;
  const rz = fx;
  const side = rx * (eye.x - x) + rz * (eye.z - z) < 0 ? -1 : 1;
  const k = GOAT_K * S;
  out.n[0] = rx * side;
  out.n[1] = 0;
  out.n[2] = rz * side;
  out.p[0] = x + fx * LOGO.x * k + out.n[0] * (LOGO.side * k + 0.01);
  out.p[1] = (LOGO.y + herd.HOP[i]) * k;
  out.p[2] = z + fz * LOGO.x * k + out.n[2] * (LOGO.side * k + 0.01);
  out.w = 2 * LOGO.half * k;
  out.h = out.w;
}
