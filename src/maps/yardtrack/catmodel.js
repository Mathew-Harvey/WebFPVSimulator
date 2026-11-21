/*
 * catmodel.js: the yard cat's shape. Pure arithmetic: corners, colours and
 * which bone carries each, as plain arrays. No three.js and no page, so the
 * check (scripts/yardcat-check.js) can build the very same cat in Node, move
 * it with ./catrig.js, and measure how near any corner of it ever comes to
 * the craft. ./catdraw.js wraps these arrays for the graphics card.
 *
 * A BLACK CAT FOR A MANGA PAGE. The owner's words: "its should be a black
 * cat ... ensure the cat model is aaa quality and fit for a manga comic".
 * What makes a drawn black cat read is not detail in the fur, which is one
 * flat dark shape on the page, but the silhouette and the face: ears a size
 * too big, a head a little large for the body, cheek tufts, long legs, a
 * long expressive tail, and eyes that take up a third of the face. So the
 * corners are spent on outline: round sections of fourteen sides on the
 * body, every joint a clean overlap that cannot pinch when a leg folds
 * right up, toes on the paws, and the pink beans underneath for the moment
 * a paw comes up at the camera. Xencelabs' note on drawing black cats is the
 * colour rule (./catdraw.js): start from a very dark cool grey and not from
 * black, and let a thin pale light find the edges.
 *
 * THE FACE IS PAINTED, NOT MODELLED. Each corner of the head carries where
 * it is on the face, and the graphics card paints the eyes, the nose and
 * the mouth's roof from that, pixel by pixel (./catdraw.js). A pupil can go
 * from a slit to a full moon and an eye can close without one corner
 * moving, there is nothing to flicker against the fur, and it costs no
 * texture: the cat is zero bytes of download beyond its code.
 *
 * ONE MESH. The body, the ground shadow's stand-ins and the comic marks
 * (the "!", the sweat drop, the swipe) are all in these arrays, so the cat
 * is one draw call (./catdraw.js says how a shadow and a mark ride along).
 *
 * The cat's frame is ./catrig.js's: x forward, y up, z to its right, metres
 * of a real cat, standing square with its paws on y = 0.
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

import { BONE, BONES, HEAD_SCALE, REST, TAIL } from './catrig.js';

/* What a corner is made of, for the graphics card's paint. */
export const KIND = {
  /* Fur: the black coat, and on the head the painted face. */
  fur: 0,
  /* Skin and such, in its own colour, lit: the beans, the ears' insides,
   * the tongue. */
  flat: 1,
  /* Its own colour whatever the light: whiskers, claws, teeth, marks. */
  unlit: 2,
  /* A stand-in that is laid on the ground as the cat's shadow. */
  shadow: 3,
};

/* A corner that moves when something is shown: which thing. */
export const MORPH = { none: 0, clawL: 1, clawR: 2, hackle: 3, whisk: 4 };

/* The comic marks, by the bone that carries them. Over the head: */
export const MARK = { none: 0, bang: 1, what: 2, vein: 3, sweat: 4, zzz: 5, heart: 6, spark: 7 };
/* At a paw: the star of a bat that connected with nothing, and the swipe. */
export const SWIPE = { none: 0, star: 1, arcs: 2 };
/* At the feet: dust. */
export const PUFF = { none: 0, dust: 1 };

/* The middle of the head, which the face is painted about. */
export const HEAD_AT = [0.226, 0.302, 0];
/* The face, in metres from the middle of the head: each eye's middle (up,
 * out), its half width and half height, how its outer corner is raised; and
 * the nose. */
export const FACE = {
  eyeY: 0.0055, eyeZ: 0.0245, eyeW: 0.0178, eyeH: 0.0158, eyeTilt: 0.2,
  noseY: -0.0125, noseW: 0.0062, noseH: 0.0044,
};

const lin = (hex) => {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
};
/* Fur's own colour is the graphics card's to make (./catdraw.js): here it
 * is only how much of it a corner takes. */
const FUR = [1, 1, 1];
const PINK = lin(0xe58ea0);
const EAR_PINK = lin(0xb9788c);
const TONGUE = lin(0xe8707f);
const IVORY = lin(0xf6f1e4);
const WHISKER = lin(0xd9d5e8);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const norm3 = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

/* The spine as a line of bones, hips to head, for sharing a corner of the
 * body between the two bones it lies between. */
const SPINE = [
  [BONE.hips, REST.hips], [BONE.spine1, REST.spine1], [BONE.spine2, REST.spine2],
  [BONE.chest, REST.chest], [BONE.neck, REST.neck], [BONE.head, REST.head],
];
function spineW(p) {
  let best = 1e9;
  let bi = 0;
  let bt = 0;
  for (let i = 0; i < SPINE.length - 1; i += 1) {
    const a = SPINE[i][1];
    const b = SPINE[i + 1][1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
    const tc = clamp(t, i === 0 ? -9 : 0, i === SPINE.length - 2 ? 9 : 1);
    const d = Math.hypot(p[0] - (a[0] + dx * tc), p[1] - (a[1] + dy * tc));
    if (d < best - 1e-9) {
      best = d;
      bi = i;
      bt = clamp(t, 0, 1);
    }
  }
  const b = SPINE[bi][0];
  if (bt < 0.5) {
    return bi === 0 ? [b, b, 1] : [b, SPINE[bi - 1][0], 0.5 + bt];
  }
  /* The neck's far half is the neck's alone: the head turns on it like a
   * ball in a cup, and a corner shared with the head would be wrung. */
  return bi >= 4 ? [b, b, 1] : [b, SPINE[bi + 1][0], 1.5 - bt];
}
function tailW(p) {
  const t0 = (REST.tail[0] - p[0]) / REST.tailStep;
  if (t0 < 0) {
    return [BONE.tail1, BONE.hips, clamp(0.5 + t0, 0, 0.5)];
  }
  const i = Math.min(TAIL - 1, Math.floor(t0));
  const t = t0 - i;
  const b = BONE.tail1 + i;
  if (t < 0.5) {
    return [b, i === 0 ? BONE.hips : b - 1, 0.5 + t];
  }
  return i === TAIL - 1 ? [b, b, 1] : [b, b + 1, 1.5 - t];
}

/*
 * The cat, as arrays. `lite` is the Low preset's: fewer sides to every
 * section and no toes, about half the corners, the same outline from where
 * a pilot sees it.
 *
 *   position, color   three numbers a corner
 *   bone    four: the two bones that carry it, the first one's share, and
 *           for a shadow stand-in which layer it is laid in
 *   aux     four: for a corner that moves when shown, by how much, and the
 *           MORPH that shows it; for a mark's corner, which mark
 *   look    four: its KIND, and where it is from the middle of the head
 *   index   the triangles: the shadow's first, then the body, then the marks
 */
export function buildCat(opt = {}) {
  const lite = opt.lite === true;
  const pos = [];
  const col = [];
  const bon = [];
  const aux = [];
  const look = [];
  const idx = [];
  const N = lite
    ? { body: 10, limb: 6, tail: 6, headA: 12, headT: 9, paw: 7, proxy: 4, round: 6, rows: 4 }
    : { body: 14, limb: 9, tail: 8, headA: 18, headT: 13, paw: 10, proxy: 5, round: 8, rows: 5 };

  let layer = 0;
  let kind = KIND.fur;
  const vert = (p, c, bw, ax) => {
    pos.push(p[0], p[1], p[2]);
    col.push(c[0], c[1], c[2]);
    bon.push(bw[0], bw[1], bw[2], kind === KIND.shadow ? layer : 0);
    if (ax) {
      aux.push(ax[0], ax[1], ax[2], ax[3]);
    } else {
      aux.push(0, 0, 0, 0);
    }
    look.push(kind, p[0] - HEAD_AT[0], p[1] - HEAD_AT[1], p[2] - HEAD_AT[2]);
    return pos.length / 3 - 1;
  };
  const tri = (a, b, c) => idx.push(a, b, c);
  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  /* A corner where it is when everything is shown, for telling a part's
   * outside from its inside. */
  const shown = (i) => [pos[i * 3] + aux[i * 4], pos[i * 3 + 1] + aux[i * 4 + 1], pos[i * 3 + 2] + aux[i * 4 + 2]];
  const flip = (t0) => {
    for (let i = t0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  };
  /* A closed part, wound so that its faces look outward whichever way it
   * was built (a mirrored part comes out inside out). */
  const closed = (fn) => {
    const t0 = idx.length;
    fn();
    let vol = 0;
    for (let i = t0; i < idx.length; i += 3) {
      const a = shown(idx[i]);
      const b = shown(idx[i + 1]);
      const c = shown(idx[i + 2]);
      vol += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
    if (vol < 0) {
      flip(t0);
    }
  };
  /* An open part, wound to face `dir`. */
  const facing = (dir, fn) => {
    const t0 = idx.length;
    fn();
    let s = 0;
    for (let i = t0; i < idx.length; i += 3) {
      const a = shown(idx[i]);
      const b = shown(idx[i + 1]);
      const c = shown(idx[i + 2]);
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const vx = c[0] - a[0];
      const vy = c[1] - a[1];
      const vz = c[2] - a[2];
      s += (uy * vz - uz * vy) * dir[0] + (uz * vx - ux * vz) * dir[1] + (ux * vy - uy * vx) * dir[2];
    }
    if (s < 0) {
      flip(t0);
    }
  };

  /*
   * A LOFT: a skin over a row of rings. A ring is a middle `c`, two axes
   * `ax` (its side) and `ay` (its up), a radius to the side `rs`, up `ru`
   * and down `rd`, and optionally a squareness `pw` (under 1 is squarer).
   * A ring with no `rs` is one corner, which closes an end. `bw` is the
   * bones for the whole part, or a rule from where a corner is.
   */
  function loft(rings, segs, o) {
    const rows = [];
    for (const r of rings) {
      const c = r.col || o.col || FUR;
      const row = [];
      if (!(r.rs > 0)) {
        row.push(vert(r.c, c, typeof o.bw === 'function' ? o.bw(r.c) : o.bw, null));
      } else {
        for (let k = 0; k < segs; k += 1) {
          const a = (k / segs) * Math.PI * 2 + (o.spin || 0);
          let cs = Math.cos(a);
          let sn = Math.sin(a);
          if (r.pw) {
            cs = Math.sign(cs) * Math.pow(Math.abs(cs), r.pw);
            sn = Math.sign(sn) * Math.pow(Math.abs(sn), r.pw);
          }
          const s = r.rs * cs;
          const u = (sn >= 0 ? r.ru : r.rd) * sn;
          const p = [
            r.c[0] + r.ax[0] * s + r.ay[0] * u,
            r.c[1] + r.ax[1] * s + r.ay[1] * u,
            r.c[2] + r.ax[2] * s + r.ay[2] * u,
          ];
          row.push(vert(p, c, typeof o.bw === 'function' ? o.bw(p) : o.bw, null));
        }
      }
      rows.push(row);
    }
    for (let i = 0; i < rows.length - 1; i += 1) {
      const A = rows[i];
      const B = rows[i + 1];
      if (A.length === 1 && B.length === 1) {
        continue;
      }
      for (let k = 0; k < segs; k += 1) {
        const k1 = (k + 1) % segs;
        if (A.length === 1) {
          tri(A[0], B[k], B[k1]);
        } else if (B.length === 1) {
          tri(A[k], B[0], A[k1]);
        } else {
          quad(A[k], B[k], B[k1], A[k1]);
        }
      }
    }
  }
  /* A ring across a loft that runs in the cat's upright plane at `ang`
   * from forward, at side `z`. */
  const ring = (x, y, z, ang, rs, ru, rd, more) => ({
    c: [x, y, z], ax: [0, 0, z < 0 ? -1 : 1], ay: [-Math.sin(ang), Math.cos(ang), 0], rs, ru, rd, ...more,
  });
  /* A limb's bone as a loft from joint `a` to joint `b` at side `z`: rows
   * of [how far along, radius to the front, to the back, to the side]. A
   * row of zeros is a closing corner. */
  function limb(a, b, z, spec, bw, segs) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tx = (b[0] - a[0]) / L;
    const ty = (b[1] - a[1]) / L;
    const ang = Math.atan2(ty, tx);
    closed(() => {
      loft(spec.map(([t, rf, rb, rl]) => ring(a[0] + tx * t * L, a[1] + ty * t * L, z, ang, rl, rf, rb)), segs, { bw });
    });
  }
  /* A ball, squashed: `r` its three radii, about `c`. */
  function blob(c, r, segs, rows, o) {
    const rings = [{ c: [c[0] + r[0], c[1], c[2]] }];
    for (let i = 1; i < rows; i += 1) {
      const th = (i / rows) * Math.PI;
      rings.push({
        c: [c[0] + r[0] * Math.cos(th), c[1], c[2]], ax: [0, 0, 1], ay: [0, 1, 0],
        rs: r[2] * Math.sin(th), ru: r[1] * Math.sin(th), rd: r[1] * Math.sin(th),
      });
    }
    rings.push({ c: [c[0] - r[0], c[1], c[2]] });
    closed(() => loft(rings, segs, o));
  }
  /* A spike: a three sided point from `base` out to `tip`, `r` wide. With
   * `morph` it lies shut inside the fur until that is shown. */
  function spike(base, tip, r, bw, c, morph) {
    const ax = norm3(tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]);
    /* Two directions square to it. */
    const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm3(ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]);
    const v = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
    closed(() => {
      const ring3 = [];
      for (let k = 0; k < 3; k += 1) {
        const a = (k / 3) * Math.PI * 2;
        const cs = Math.cos(a) * r;
        const sn = Math.sin(a) * r;
        ring3.push(vert([base[0] + u[0] * cs + v[0] * sn, base[1] + u[1] * cs + v[1] * sn, base[2] + u[2] * cs + v[2] * sn], c, bw, null));
      }
      const apex = morph
        ? vert(base, c, bw, [tip[0] - base[0], tip[1] - base[1], tip[2] - base[2], morph])
        : vert(tip, c, bw, null);
      for (let k = 0; k < 3; k += 1) {
        tri(ring3[k], ring3[(k + 1) % 3], apex);
      }
      tri(ring3[2], ring3[1], ring3[0]);
    });
  }

  /* ---------------------------------------------------------------- *
   * THE SHADOW'S STAND-INS, first, so they are drawn first. Each is a
   * simple round thing on one bone, laid flat on the ground along the
   * sun by the graphics card (./catdraw.js). Each has a layer of its own
   * a hair above the last, which is what lets two of them overlap without
   * the ground under both going twice as dark.
   * ---------------------------------------------------------------- */
  kind = KIND.shadow;
  const proxy = (fn) => {
    fn();
    layer += 1;
  };
  const cap = (a, b, z, ra, rb, bone) => proxy(() => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tx = (b[0] - a[0]) / L;
    const ty = (b[1] - a[1]) / L;
    const ang = Math.atan2(ty, tx);
    closed(() => loft([
      { c: [a[0] - tx * ra * 0.9, a[1] - ty * ra * 0.9, z] },
      ring(a[0], a[1], z, ang, ra, ra, ra),
      ring(b[0], b[1], z, ang, rb, rb, rb),
      { c: [b[0] + tx * rb * 0.9, b[1] + ty * rb * 0.9, z] },
    ], N.proxy, { bw: [bone, bone, 1] }));
  });
  proxy(() => blob([-0.15, 0.21, 0], [0.07, 0.058, 0.063], N.round, N.rows, { bw: [BONE.hips, BONE.hips, 1] }));
  proxy(() => blob([-0.055, 0.206, 0], [0.07, 0.058, 0.06], N.round, N.rows, { bw: [BONE.spine1, BONE.spine1, 1] }));
  proxy(() => blob([0.04, 0.202, 0], [0.07, 0.064, 0.064], N.round, N.rows, { bw: [BONE.spine2, BONE.spine2, 1] }));
  proxy(() => blob([0.115, 0.205, 0], [0.058, 0.064, 0.058], N.round, N.rows, { bw: [BONE.chest, BONE.chest, 1] }));
  cap([0.155, 0.243], [0.196, 0.282], 0, 0.044, 0.038, BONE.neck);
  proxy(() => blob([0.23, 0.3, 0], [0.06, 0.048, 0.058], N.round, N.rows, { bw: [BONE.head, BONE.head, 1] }));
  for (const side of [-1, 1]) {
    proxy(() => closed(() => {
      const bw = [side < 0 ? BONE.earL : BONE.earR, side < 0 ? BONE.earL : BONE.earR, 1];
      const a = vert([0.214, 0.336, 0.011 * side], FUR, bw, null);
      const b = vert([0.204, 0.315, 0.048 * side], FUR, bw, null);
      const c = vert([0.19, 0.335, 0.03 * side], FUR, bw, null);
      const t = vert([0.196, 0.397, 0.047 * side], FUR, bw, null);
      tri(a, b, t);
      tri(b, c, t);
      tri(c, a, t);
      tri(a, c, b);
    }));
  }
  for (const side of [-1, 1]) {
    const fb = BONE.flU + (side < 0 ? 0 : 4);
    const hb = BONE.hlU + (side < 0 ? 0 : 4);
    const zf = side * REST.halfF;
    const zh = side * REST.halfH;
    cap(REST.shoulder, REST.elbow, zf, 0.03, 0.023, fb);
    cap(REST.elbow, REST.wrist, zf, 0.021, 0.016, fb + 1);
    cap(REST.wrist, REST.forePaw, zf, 0.016, 0.016, fb + 2);
    cap([REST.forePaw[0] - 0.004, 0.013], [REST.forePaw[0] + 0.026, 0.012], zf, 0.02, 0.016, fb + 3);
    cap(REST.hip, REST.knee, zh, 0.044, 0.026, hb);
    cap(REST.knee, REST.hock, zh, 0.024, 0.015, hb + 1);
    cap(REST.hock, REST.hindPaw, zh, 0.015, 0.015, hb + 2);
    cap([REST.hindPaw[0] - 0.004, 0.013], [REST.hindPaw[0] + 0.028, 0.012], zh, 0.018, 0.015, hb + 3);
  }
  for (let j = 0; j < TAIL; j += 1) {
    const x0 = REST.tail[0] - j * REST.tailStep;
    cap([x0 + 0.004, REST.tail[1]], [x0 - REST.tailStep - 0.004, REST.tail[1]], 0, 0.021 - j * 0.0009, 0.0202 - j * 0.0009, BONE.tail1 + j);
  }
  const layers = layer;
  /* The first drawn lies highest. */
  for (let i = 0; i < bon.length / 4; i += 1) {
    bon[i * 4 + 3] = layers - 1 - bon[i * 4 + 3];
  }
  const shadowEnd = idx.length;

  /* ---------------------------------------------------------------- *
   * THE BODY.
   * ---------------------------------------------------------------- */
  kind = KIND.fur;

  /* The trunk and the neck, one skin shared along the spine. Rows of
   * [x, middle height, half width, radius up, radius down, how far the
   * section is tipped back as the neck rises]. */
  const TRUNK = [
    [-0.206, 0.224, 0.033, 0.032, 0.034, 0],
    [-0.184, 0.219, 0.051, 0.046, 0.051, 0],
    [-0.142, 0.213, 0.062, 0.053, 0.061, 0],
    [-0.092, 0.209, 0.059, 0.053, 0.06, 0],
    [-0.036, 0.207, 0.06, 0.053, 0.063, 0],
    [0.024, 0.205, 0.064, 0.055, 0.069, 0],
    [0.08, 0.203, 0.063, 0.057, 0.071, 0],
    [0.122, 0.207, 0.057, 0.053, 0.067, 0.1],
    [0.15, 0.226, 0.048, 0.043, 0.058, 0.38],
    [0.168, 0.25, 0.043, 0.039, 0.041, 0.7],
    [0.186, 0.268, 0.039, 0.035, 0.036, 0.7],
    [0.2, 0.286, 0.036, 0.031, 0.031, 0.7],
  ];
  closed(() => {
    const rings = [{ c: [-0.2155, 0.225, 0] }];
    for (const [x, y, w, ru, rd, ang] of TRUNK) {
      rings.push(ring(x, y, 0, ang, w, ru, rd));
    }
    rings.push({ c: [0.209, 0.296, 0] });
    loft(rings, N.body, { bw: spineW, spin: Math.PI / N.body });
  });

  /* The tail: fifteen rings, two to a bone, so it bends as a curve. */
  closed(() => {
    const rings = [{ c: [-0.176, REST.tail[1], 0] }];
    const count = lite ? 10 : 15;
    for (let k = 0; k < count; k += 1) {
      const t = k / (count - 1);
      const x = lerp(-0.186, -0.499, t);
      const r = t < 0.12 ? lerp(0.023, 0.0205, t / 0.12) : t < 0.8 ? lerp(0.0205, 0.018, (t - 0.12) / 0.68) : lerp(0.018, 0.0125, Math.pow((t - 0.8) / 0.2, 1.6));
      rings.push(ring(x, REST.tail[1], 0, Math.PI, r, r, r));
    }
    rings.push({ c: [-0.5075, REST.tail[1], 0] });
    loft(rings, N.tail, { bw: tailW });
  });

  /* The head: a squashed ball pushed out where the muzzle, the cheeks and
   * the chin are, in rings from the nose back. */
  const HR = [0.05, 0.046, 0.057];
  const LOBES = [
    [norm3(0.9, -0.36, 0.27), 0.2, 0.05],
    [norm3(0.9, -0.36, -0.27), 0.2, 0.05],
    [norm3(0.3, -0.44, 0.85), 0.085, 0.1],
    [norm3(0.3, -0.44, -0.85), 0.085, 0.1],
    [norm3(0.84, -0.54, 0), 0.06, 0.03],
  ];
  const headPoint = (d) => {
    let r = 1;
    for (const [m, amp, wd] of LOBES) {
      r += amp * Math.exp(-(1 - (d[0] * m[0] + d[1] * m[1] + d[2] * m[2])) / wd);
    }
    return [HEAD_AT[0] + d[0] * HR[0] * r, HEAD_AT[1] + d[1] * HR[1] * r, HEAD_AT[2] + d[2] * HR[2] * r];
  };
  const HEADW = [BONE.head, BONE.head, 1];
  closed(() => {
    const rows = [];
    for (let i = 0; i <= N.headT; i += 1) {
      const th = (i / N.headT) * Math.PI;
      const row = [];
      if (i === 0 || i === N.headT) {
        row.push(vert(headPoint([Math.cos(th), 0, 0]), FUR, HEADW, null));
      } else {
        for (let k = 0; k < N.headA; k += 1) {
          const ph = (k / N.headA) * Math.PI * 2;
          row.push(vert(headPoint([Math.cos(th), Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)]), FUR, HEADW, null));
        }
      }
      rows.push(row);
    }
    for (let i = 0; i < N.headT; i += 1) {
      const A = rows[i];
      const B = rows[i + 1];
      for (let k = 0; k < N.headA; k += 1) {
        const k1 = (k + 1) % N.headA;
        if (A.length === 1) {
          tri(A[0], B[k], B[k1]);
        } else if (B.length === 1) {
          tri(A[k], B[0], A[k1]);
        } else {
          quad(A[k], B[k], B[k1], A[k1]);
        }
      }
    }
  });

  /* The ears: a rim of five corners, a furred band inside it, the pink
   * hollow inside that, and a rounded back. Big, as a manga cat's are. */
  for (const side of [-1, 1]) {
    const bw = [side < 0 ? BONE.earL : BONE.earR, side < 0 ? BONE.earL : BONE.earR, 1];
    const rim = [
      [0.2145, 0.335, 0.0095 * side],
      [0.2075, 0.372, 0.0215 * side],
      [0.1955, 0.398, 0.047 * side],
      [0.198, 0.362, 0.0585 * side],
      [0.2045, 0.314, 0.047 * side],
    ];
    const mid = [0, 0, 0];
    for (const p of rim) {
      mid[0] += p[0] / rim.length;
      mid[1] += p[1] / rim.length;
      mid[2] += p[2] / rim.length;
    }
    /* The hollow reaches down into the head, where its foot is hidden. */
    const inner = rim.map((p, n) => {
      const q = mix3(p, mid, n === 0 || n === 4 ? 0.22 : 0.36);
      return [q[0] - 0.0035, q[1] - (n === 0 || n === 4 ? 0.004 : 0), q[2]];
    });
    closed(() => {
      kind = KIND.fur;
      const a = rim.map((p) => vert(p, FUR, bw, null));
      const b = inner.map((p) => vert(p, FUR, bw, null));
      for (let n = 0; n < 5; n += 1) {
        const n1 = (n + 1) % 5;
        quad(a[n], a[n1], b[n1], b[n]);
      }
      const back = vert([mid[0] - 0.0165, mid[1] - 0.006, mid[2] - 0.002 * side], FUR, bw, null);
      const c = rim.map((p) => vert(p, FUR, bw, null));
      for (let n = 0; n < 5; n += 1) {
        tri(c[(n + 1) % 5], c[n], back);
      }
      kind = KIND.flat;
      const d = inner.map((p) => vert(p, EAR_PINK, bw, null));
      const pit = vert([mid[0] - 0.0085, mid[1] - 0.004, mid[2]], mix3(EAR_PINK, [0.02, 0.012, 0.02], 0.55), bw, null);
      for (let n = 0; n < 5; n += 1) {
        tri(d[n], d[(n + 1) % 5], pit);
      }
      kind = KIND.fur;
    });
  }

  /* Cheek tufts and a ruff at the breast: the spikes of a drawn cat. */
  for (const side of [-1, 1]) {
    spike([0.232, 0.281, 0.046 * side], [0.219, 0.2645, 0.0705 * side], 0.0135, HEADW, FUR, 0);
    spike([0.226, 0.294, 0.049 * side], [0.209, 0.2855, 0.0735 * side], 0.0125, HEADW, FUR, 0);
  }
  const CHESTW = [BONE.chest, BONE.chest, 1];
  spike([0.16, 0.204, 0], [0.19, 0.172, 0], 0.017, CHESTW, FUR, 0);
  for (const side of [-1, 1]) {
    spike([0.156, 0.2, 0.02 * side], [0.181, 0.165, 0.027 * side], 0.014, CHESTW, FUR, 0);
  }

  /* The jaw. Shut, it is the chin under the muzzle; open, its top is the
   * tongue, and the fangs show. The mouth's roof is painted on the head. */
  const JAWW = [BONE.jaw, BONE.jaw, 1];
  closed(() => {
    loft([
      { c: [0.222, 0.265, 0] },
      { c: [0.23, 0.2645, 0], ax: [0, 0, 1], ay: [0, 1, 0], rs: 0.021, ru: 0.0072, rd: 0.011 },
      { c: [0.248, 0.2642, 0], ax: [0, 0, 1], ay: [0, 1, 0], rs: 0.0198, ru: 0.0076, rd: 0.0112 },
      { c: [0.2625, 0.2645, 0], ax: [0, 0, 1], ay: [0, 1, 0], rs: 0.0155, ru: 0.0072, rd: 0.0102 },
      { c: [0.2715, 0.2655, 0], ax: [0, 0, 1], ay: [0, 1, 0], rs: 0.009, ru: 0.005, rd: 0.007 },
      { c: [0.276, 0.2662, 0] },
    ], lite ? 6 : 8, { bw: JAWW });
  });
  kind = KIND.flat;
  facing([0, 1, 0], () => {
    const mid = vert([0.247, 0.2738, 0], TONGUE, JAWW, null);
    const n = 8;
    const rim = [];
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * Math.PI * 2;
      rim.push(vert([0.2465 + 0.0125 * Math.cos(a), 0.2722, 0.0115 * Math.sin(a)], mix3(TONGUE, [0.2, 0.02, 0.04], 0.35), JAWW, null));
    }
    for (let k = 0; k < n; k += 1) {
      tri(mid, rim[k], rim[(k + 1) % n]);
    }
  });
  kind = KIND.unlit;
  for (const side of [-1, 1]) {
    spike([0.2655, 0.2765, 0.0074 * side], [0.266, 0.2668, 0.007 * side], 0.0024, HEADW, IVORY, 0);
  }

  /* Whiskers: three a side on a bone of their own, so they can swing
   * forward at prey and back along the cheeks in a fright, and two over
   * each eye. Each is two thin blades crossed, so it is there from any
   * side. */
  const whisker = (root, dir, len, droop, bw) => {
    const d = norm3(dir[0], dir[1], dir[2]);
    const tip = [root[0] + d[0] * len, root[1] + d[1] * len - droop, root[2] + d[2] * len];
    const midp = [root[0] + d[0] * len * 0.5, root[1] + d[1] * len * 0.5 - droop * 0.22, root[2] + d[2] * len * 0.5];
    const w = 0.0008;
    /* Every corner is kept at the root and let out by MORPH.whisk, so a
     * whisker can be drawn in to nothing from far away. */
    const at = (p) => vert(root, WHISKER, bw, [p[0] - root[0], p[1] - root[1], p[2] - root[2], MORPH.whisk]);
    for (const [ox, oy] of [[0, 1], [1, 0]]) {
      const a0 = at([root[0] + ox * w, root[1] + oy * w, root[2]]);
      const a1 = at([root[0] - ox * w, root[1] - oy * w, root[2]]);
      const b0 = at([midp[0] + ox * w * 0.7, midp[1] + oy * w * 0.7, midp[2]]);
      const b1 = at([midp[0] - ox * w * 0.7, midp[1] - oy * w * 0.7, midp[2]]);
      const t = at(tip);
      /* Both faces. */
      quad(a0, a1, b1, b0);
      quad(a1, a0, b0, b1);
      tri(b0, b1, t);
      tri(b1, b0, t);
    }
  };
  for (const side of [-1, 1]) {
    const bw = [side < 0 ? BONE.whiskL : BONE.whiskR, side < 0 ? BONE.whiskL : BONE.whiskR, 1];
    whisker([0.2705, 0.2835, 0.0205 * side], [0.1, 0.2, side], 0.078, 0.006, bw);
    whisker([0.2715, 0.2795, 0.0215 * side], [0.16, 0, side], 0.086, 0.01, bw);
    whisker([0.2705, 0.2755, 0.0205 * side], [0.1, -0.2, side], 0.074, 0.012, bw);
    if (!lite) {
      whisker([0.258, 0.3285, 0.0195 * side], [-0.1, 0.9, side * 0.45], 0.034, 0, HEADW);
      whisker([0.2565, 0.3275, 0.0245 * side], [-0.15, 0.8, side * 0.75], 0.029, 0, HEADW);
    }
  }

  /* The legs. Every bone is its own closed shape, overlapping the next at
   * the joint: nothing to pinch however far a leg folds, and on a black
   * cat the overlaps are one silhouette. */
  kind = KIND.fur;
  for (const side of [-1, 1]) {
    const fb = BONE.flU + (side < 0 ? 0 : 4);
    const hb = BONE.hlU + (side < 0 ? 0 : 4);
    const zf = side * REST.halfF;
    const zh = side * REST.halfH;
    const bladeB = side < 0 ? BONE.bladeL : BONE.bladeR;

    /* The shoulder blade: a flat lobe under the skin from the shoulder up
     * and back to the withers. Standing, only its top shows, as the bump
     * either side of the spine. Stalking, the chest is let down between
     * the two and they stand up over the back. */
    limb([0.127, 0.176], [0.1, 0.25], side * 0.037, [
      [-0.06, 0, 0, 0], [0.1, 0.018, 0.017, 0.014], [0.5, 0.025, 0.023, 0.017], [0.86, 0.018, 0.017, 0.014], [1.02, 0, 0, 0],
    ], [bladeB, bladeB, 1], lite ? 5 : 7);

    limb(REST.shoulder, REST.elbow, zf, [
      [-0.36, 0, 0, 0], [-0.14, 0.023, 0.022, 0.019], [0.16, 0.031, 0.029, 0.024], [0.6, 0.026, 0.028, 0.0225], [1, 0.021, 0.024, 0.02], [1.2, 0, 0, 0],
    ], [fb, fb, 1], N.limb);
    limb(REST.elbow, REST.wrist, zf, [
      [-0.19, 0, 0, 0], [-0.04, 0.0185, 0.023, 0.0185], [0.3, 0.0185, 0.021, 0.018], [0.7, 0.0165, 0.0175, 0.0165], [1, 0.0158, 0.0162, 0.0158], [1.14, 0, 0, 0],
    ], [fb + 1, fb + 1, 1], N.limb);
    limb(REST.wrist, REST.forePaw, zf, [
      [-0.4, 0, 0, 0], [0, 0.0158, 0.0162, 0.0158], [1, 0.0162, 0.0158, 0.0162], [1.4, 0, 0, 0],
    ], [fb + 2, fb + 2, 1], N.limb);

    limb(REST.hip, REST.knee, zh, [
      [-0.5, 0, 0, 0], [-0.3, 0.027, 0.03, 0.02], [0.02, 0.041, 0.046, 0.03], [0.42, 0.038, 0.044, 0.031], [0.8, 0.029, 0.032, 0.026], [1, 0.0235, 0.0245, 0.022], [1.17, 0, 0, 0],
    ], [hb, hb, 1], N.limb);
    limb(REST.knee, REST.hock, zh, [
      [-0.16, 0, 0, 0], [0, 0.0235, 0.024, 0.021], [0.36, 0.0195, 0.023, 0.0185], [0.78, 0.0145, 0.0168, 0.0148], [1, 0.0142, 0.0158, 0.0142], [1.13, 0, 0, 0],
    ], [hb + 1, hb + 1, 1], N.limb);
    limb(REST.hock, REST.hindPaw, zh, [
      [-0.2, 0, 0, 0], [0, 0.0145, 0.016, 0.014], [0.5, 0.0138, 0.0146, 0.0135], [1, 0.015, 0.0148, 0.015], [1.2, 0, 0, 0],
    ], [hb + 2, hb + 2, 1], N.limb);

    /* The paws: a mitt with a flat sole, toes along its front, the pink
     * beans underneath, and on the fore paws the claws, sheathed. */
    for (const fore of [true, false]) {
      const pb = (fore ? fb : hb) + 3;
      const z = fore ? zf : zh;
      const p0 = fore ? REST.forePaw : REST.hindPaw;
      const wd = fore ? 0.0218 : 0.0198;
      const ln = fore ? 1 : 1.06;
      const bw = [pb, pb, 1];
      const up = { ax: [0, 0, side], ay: [0, 1, 0] };
      closed(() => loft([
        { c: [p0[0] - 0.018, 0.0145, z] },
        { c: [p0[0] - 0.011, 0.0138, z], ...up, rs: wd * 0.7, ru: 0.013, rd: 0.0132 },
        { c: [p0[0] + 0.005 * ln, 0.0135, z], ...up, rs: wd * 0.95, ru: 0.015, rd: 0.0131, pw: 0.85 },
        { c: [p0[0] + 0.02 * ln, 0.0128, z], ...up, rs: wd, ru: 0.0136, rd: 0.0124, pw: 0.8 },
        { c: [p0[0] + 0.031 * ln, 0.0112, z], ...up, rs: wd * 0.86, ru: 0.01, rd: 0.0108, pw: 0.8 },
        { c: [p0[0] + 0.039 * ln, 0.009, z] },
      ], N.paw, { bw }));
      const toeZ = [-0.0128, -0.0044, 0.0044, 0.0128];
      if (!lite) {
        for (let n = 0; n < 4; n += 1) {
          const edge = n === 0 || n === 3;
          blob([p0[0] + (edge ? 0.0285 : 0.0335) * ln, 0.0095, z + toeZ[n] * (wd / 0.0178)], [0.0092, 0.008, 0.0062], 5, 3, { bw });
        }
      }
      kind = KIND.flat;
      facing([0, -1, 0], () => {
        const disc = (cx, cz, rx, rz, n, c) => {
          const m = vert([cx, -0.0012, cz], c, bw, null);
          const r = [];
          for (let k = 0; k < n; k += 1) {
            const a = (k / n) * Math.PI * 2;
            r.push(vert([cx + rx * Math.cos(a), 0.0002, cz + rz * Math.sin(a)], c, bw, null));
          }
          for (let k = 0; k < n; k += 1) {
            tri(m, r[k], r[(k + 1) % n]);
          }
        };
        disc(p0[0] + 0.0075 * ln, z, 0.0086, 0.0102, lite ? 6 : 8, PINK);
        for (let n = 0; n < 4; n += 1) {
          const edge = n === 0 || n === 3;
          disc(p0[0] + (edge ? 0.023 : 0.0275) * ln, z + toeZ[n] * (wd / 0.0178) * 0.92, 0.004, 0.0036, lite ? 5 : 6, PINK);
        }
      });
      if (fore) {
        kind = KIND.unlit;
        for (let n = 0; n < 4; n += 1) {
          const edge = n === 0 || n === 3;
          const bx = p0[0] + (edge ? 0.031 : 0.036);
          const tz = toeZ[n] * (wd / 0.0178);
          spike([bx, 0.0095, z + tz], [bx + 0.014, 0.004, z + tz * 1.1], 0.0028, bw, IVORY, side < 0 ? MORPH.clawL : MORPH.clawR);
        }
      }
      kind = KIND.fur;
    }
  }

  /* Hackles: spikes along the spine and round the tail that lie shut in
   * the fur until the cat is frightened, and then it is twice the cat. */
  {
    const xs = lite ? [0.12, 0.06, 0, -0.06, -0.12, -0.175] : [0.132, 0.092, 0.05, 0.008, -0.034, -0.076, -0.118, -0.158, -0.19];
    for (const x of xs) {
      /* The back's own height here, from the trunk's rows. */
      let top = 0.258;
      for (let i = 0; i < TRUNK.length - 1; i += 1) {
        if (x >= TRUNK[i][0] && x <= TRUNK[i + 1][0]) {
          const t = (x - TRUNK[i][0]) / (TRUNK[i + 1][0] - TRUNK[i][0]);
          top = lerp(TRUNK[i][1] + TRUNK[i][3], TRUNK[i + 1][1] + TRUNK[i + 1][3], t);
        }
      }
      const base = [x, top - 0.012, 0];
      spike(base, [x - 0.013, top + 0.03, 0], 0.014, spineW(base), FUR, MORPH.hackle);
    }
    if (!lite) {
      for (let j = 0; j < TAIL; j += 1) {
        for (let n = 0; n < 3; n += 1) {
          const x = REST.tail[0] - (j + 0.18 + 0.3 * n) * REST.tailStep;
          const a = (n / 3) * Math.PI * 2 + j * 1.1;
          const base = [x, REST.tail[1], 0];
          const bw = tailW(base);
          spike(base, [x - 0.008, REST.tail[1] + 0.03 * Math.cos(a), 0.03 * Math.sin(a)], 0.009, [bw[0], bw[0], 1], FUR, MORPH.hackle);
        }
      }
    }
  }
  const bodyEnd = idx.length;

  /* ---------------------------------------------------------------- *
   * THE MARKS. Flat shapes on a bone that ./catdraw.js turns to face the
   * camera, each with a number so that only the one being shown is drawn.
   * Drawn about the bone's own spot, in tenths of a metre or so: the bone
   * sizes them. The ink pass outlines them like anything else.
   * ---------------------------------------------------------------- */
  kind = KIND.unlit;
  const M0 = REST.mark;
  const glyph = (bone, id) => {
    const bw = [bone, bone, 1];
    const v = (x, y, c, zz) => vert([M0[0] + x, M0[1] + y, M0[2] + (zz || 0)], c, bw, [0, 0, 0, id]);
    return {
      /* A filled shape that can be seen whole from its middle. */
      fan(pts, c, zz) {
        let cx = 0;
        let cy = 0;
        for (const p of pts) {
          cx += p[0] / pts.length;
          cy += p[1] / pts.length;
        }
        facing([0, 0, 1], () => {
          const m = v(cx, cy, c, zz);
          const r = pts.map((p) => v(p[0], p[1], c, zz));
          for (let k = 0; k < r.length; k += 1) {
            tri(m, r[k], r[(k + 1) % r.length]);
          }
        });
      },
      /* A stroke along a line of points, `w` wide at each. */
      stroke(pts, ws, c, zz) {
        facing([0, 0, 1], () => {
          const L = [];
          const R = [];
          for (let k = 0; k < pts.length; k += 1) {
            const a = pts[Math.max(0, k - 1)];
            const b = pts[Math.min(pts.length - 1, k + 1)];
            const d = norm3(b[0] - a[0], b[1] - a[1], 0);
            const w = (typeof ws === 'number' ? ws : ws[k]) * 0.5;
            L.push(v(pts[k][0] - d[1] * w, pts[k][1] + d[0] * w, c, zz));
            R.push(v(pts[k][0] + d[1] * w, pts[k][1] - d[0] * w, c, zz));
          }
          for (let k = 0; k < pts.length - 1; k += 1) {
            quad(L[k], R[k], R[k + 1], L[k + 1]);
          }
        });
      },
    };
  };
  const circle = (cx, cy, rx, ry, n, a0, a1) => {
    const out = [];
    for (let k = 0; k < n; k += 1) {
      const a = lerp(a0 === undefined ? 0 : a0, a1 === undefined ? Math.PI * 2 : a1, a1 === undefined ? k / n : k / (n - 1));
      out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return out;
  };
  const AMBER = lin(0xffc93a);
  const CREAM = lin(0xfff6dc);
  const RED = lin(0xff4b4b);
  const BLUE = lin(0x9ad8ff);
  const WHITE = lin(0xffffff);
  const ROSE = lin(0xff7aa6);
  const DUST = lin(0xe8e0cc);
  {
    /* "!": noticed. Leaning, as a drawn one does. */
    const g = glyph(BONE.mark, MARK.bang);
    const sk = (x, y) => [x + 0.22 * y, y];
    g.fan([sk(-0.016, 0.118), sk(0.016, 0.118), sk(0.0075, 0.04), sk(-0.0075, 0.04)], AMBER);
    g.fan(circle(0.22 * 0.014, 0.014, 0.0125, 0.0125, 8), AMBER);
  }
  {
    /* "?": lost it. */
    const g = glyph(BONE.mark, MARK.what);
    const hook = circle(0, 0.086, 0.027, 0.027, 9, Math.PI * 1.05, -Math.PI * 0.42);
    hook.push([0.004, 0.052], [0.002, 0.04]);
    g.stroke(hook, 0.017, CREAM);
    g.fan(circle(0.002, 0.014, 0.0115, 0.0115, 8), CREAM);
  }
  {
    /* The vein: cross. Four hooks back to back. */
    const g = glyph(BONE.mark, MARK.vein);
    for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      const a0 = Math.atan2(-sy, -sx) - 0.75;
      g.stroke(circle(sx * 0.04, 0.06 + sy * 0.04, 0.03, 0.03, 6, a0, a0 + 1.5), [0.007, 0.014, 0.016, 0.016, 0.014, 0.007], RED);
    }
  }
  {
    /* The drop: embarrassed, or that was close. */
    const g = glyph(BONE.mark, MARK.sweat);
    const pts = circle(0, 0.036, 0.026, 0.028, 9, Math.PI * 0.18, -Math.PI * 1.18);
    pts.push([0, 0.105]);
    g.fan(pts, BLUE);
    g.fan(circle(-0.009, 0.03, 0.006, 0.01, 6), WHITE, 0.002);
  }
  {
    /* "z z z": asleep. */
    const g = glyph(BONE.mark, MARK.zzz);
    for (const [x, y, s] of [[-0.035, 0.012, 0.03], [0.004, 0.05, 0.042], [0.055, 0.1, 0.056]]) {
      const w = s * 0.24;
      g.stroke([[x - s / 2, y + s / 2], [x + s / 2, y + s / 2]], w, CREAM);
      g.stroke([[x + s / 2 - w * 0.2, y + s / 2], [x - s / 2 + w * 0.2, y - s / 2]], w * 1.05, CREAM);
      g.stroke([[x - s / 2, y - s / 2], [x + s / 2, y - s / 2]], w, CREAM);
    }
  }
  {
    /* The heart: for a craft that has landed and let itself be sniffed. */
    const g = glyph(BONE.mark, MARK.heart);
    const pts = [];
    for (let k = 0; k < 16; k += 1) {
      const t = (k / 16) * Math.PI * 2;
      pts.push([
        0.0036 * 16 * Math.pow(Math.sin(t), 3),
        0.066 + 0.0036 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
      ]);
    }
    g.fan(pts, ROSE);
  }
  {
    /* The twinkle: eyes gone big. */
    const g = glyph(BONE.mark, MARK.spark);
    for (const [x, y, s] of [[-0.03, 0.05, 0.05], [0.04, 0.095, 0.034]]) {
      g.fan([[x, y + s], [x + s * 0.16, y + s * 0.16], [x + s, y], [x + s * 0.16, y - s * 0.16], [x, y - s], [x - s * 0.16, y - s * 0.16], [x - s, y], [x - s * 0.16, y + s * 0.16]], CREAM);
    }
  }
  {
    /* The star where a paw batted and met nothing. */
    const g = glyph(BONE.swipe, SWIPE.star);
    const pts = [];
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * Math.PI * 2;
      const r = k % 2 === 0 ? 0.07 : 0.03;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    g.fan(pts, CREAM);
  }
  {
    /* The swipe: three claw lines. */
    const g = glyph(BONE.swipe, SWIPE.arcs);
    for (const [r, w] of [[0.1, 0.013], [0.078, 0.012], [0.056, 0.01]]) {
      g.stroke(circle(0, -0.02, r, r, 7, Math.PI * 0.2, Math.PI * 0.78), [0.001, w * 0.6, w, w, w * 0.8, w * 0.45, 0.001], WHITE);
    }
  }
  {
    /* Dust, kicked up by a landing or a start. */
    const g = glyph(BONE.puff, PUFF.dust);
    for (const [x, y, r] of [[-0.035, 0.012, 0.03], [0.012, 0.026, 0.036], [0.05, 0.008, 0.024], [-0.004, -0.004, 0.022]]) {
      g.fan(circle(x, y, r, r * 0.86, 8), DUST);
    }
  }

  /* The head is modelled at a real cat's size and then made the manga's: it
   * and everything on it (ears, jaw, whiskers, their shadows) grows about
   * the bone the head turns on. The face is painted from where a corner WAS
   * (`look`, already written), so the eyes grow with it. */
  for (let i = 0; i < pos.length / 3; i += 1) {
    const b = bon[i * 4];
    if (b >= BONE.head && b <= BONE.whiskR) {
      for (let k = 0; k < 3; k += 1) {
        pos[i * 3 + k] = REST.head[k] + (pos[i * 3 + k] - REST.head[k]) * HEAD_SCALE;
        aux[i * 4 + k] *= HEAD_SCALE;
      }
    }
  }

  /* The corners' own directions, each the mean of the faces that meet at
   * it: round things shade as round. */
  const count = pos.length / 3;
  const nor = new Float32Array(count * 3);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i];
    const b = idx[i + 1];
    const c = idx[i + 2];
    const pa = shown(a);
    const pb = shown(b);
    const pc = shown(c);
    const ux = pb[0] - pa[0];
    const uy = pb[1] - pa[1];
    const uz = pb[2] - pa[2];
    const vx = pc[0] - pa[0];
    const vy = pc[1] - pa[1];
    const vz = pc[2] - pa[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      nor[v * 3] += nx;
      nor[v * 3 + 1] += ny;
      nor[v * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < count; i += 1) {
    const l = Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) || 1;
    nor[i * 3] /= l;
    nor[i * 3 + 1] /= l;
    nor[i * 3 + 2] /= l;
  }

  return {
    position: new Float32Array(pos),
    normal: nor,
    color: new Float32Array(col),
    bone: new Float32Array(bon),
    aux: new Float32Array(aux),
    look: new Float32Array(look),
    index: new Uint16Array(idx),
    count,
    triangles: idx.length / 3,
    /* Where the three runs of triangles end. */
    shadowEnd,
    bodyEnd,
    layers,
  };
}

/*
 * The cat's corners where they are in the world, worked out the way the
 * graphics card works them out (./catdraw.js's own arithmetic, kept to
 * match): for the check, which wants the truth about how near the craft a
 * corner came and not a stand-in for it. `bones` is ./catrig.js's, `at` the
 * cat's spot, `morph` how far each MORPH is shown. Shadow and mark corners
 * are left where they are and flagged 0 in `live`.
 */
export function skinCat(model, bones, at, morph, out, live) {
  const n = model.count;
  for (let i = 0; i < n; i += 1) {
    const k = model.look[i * 4];
    const b0 = model.bone[i * 4];
    const body = k !== KIND.shadow && !(b0 >= BONE.mark && b0 <= BONE.puff);
    if (live) {
      live[i] = body ? 1 : 0;
    }
    if (!body) {
      continue;
    }
    const b1 = model.bone[i * 4 + 1];
    const w = model.bone[i * 4 + 2];
    const m = model.aux[i * 4 + 3];
    const mw = m > 0 && morph ? morph[m] || 0 : 0;
    const x = model.position[i * 3] + model.aux[i * 4] * mw;
    const y = model.position[i * 3 + 1] + model.aux[i * 4 + 1] * mw;
    const z = model.position[i * 3 + 2] + model.aux[i * 4 + 2] * mw;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    for (let pass = 0; pass < 2; pass += 1) {
      const b = (pass === 0 ? b0 : b1) * 12;
      const share = pass === 0 ? w : 1 - w;
      if (share === 0 || b < 0 || b >= BONES * 12) {
        continue;
      }
      ox += share * (bones[b] * x + bones[b + 1] * y + bones[b + 2] * z + bones[b + 3]);
      oy += share * (bones[b + 4] * x + bones[b + 5] * y + bones[b + 6] * z + bones[b + 7]);
      oz += share * (bones[b + 8] * x + bones[b + 9] * y + bones[b + 10] * z + bones[b + 11]);
    }
    out[i * 3] = at[0] + ox;
    out[i * 3 + 1] = at[1] + oy;
    out[i * 3 + 2] = at[2] + oz;
  }
  return out;
}
