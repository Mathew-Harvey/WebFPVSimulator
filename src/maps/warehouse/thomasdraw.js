/*
 * thomasdraw.js: Thomas More as a model and his speech balloon, for
 * ./thomas.js's life.
 *
 * The owner's ask of 2026-11-16, relaying Thomas: "Then we need me walking
 * around yelling Canadian stereotypes". The owner made a manga sheet of him
 * with Grok, as he did for Heads and Dan, and gave it on 17 November 2026:
 * six faces straight on at one framing (laughing, frowning, shouting,
 * talking, surprised, a calm smile), his left side, the back and the top of
 * his head, and him standing and walking in a black hoodie and black
 * trousers. The owner, 17 November 2026: "Let's dress Thomas in a red
 * flanno", so he wears a red and black buffalo check flannel shirt instead,
 * open over a black tee. It came as one picture, not cut into pieces; the thread's
 * pack.py cuts it, turns his hair and beard to the ginger of Thomas's photo,
 * and puts the parts used into one atlas, assets/warehouse/thomas-manga.webp
 * (NOTICE), printing the head's outline tables below.
 *
 * It is built the way ../heads/mandraw.js builds Heads, with the same loft
 * builder, skeleton and balloon painter, written again here (the builder
 * and the balloon from ../heads/mandraw.js, the skeleton in ./thomas.js) so
 * the shop does not load Heads' house, which is 93 kB and its imports.
 *
 * THE HEAD is a ring for each row of the smiling face, as wide as the
 * face's outline there and as deep as his side's, each triangle
 * painted from the face, his side or the back of his head by the way it
 * faces; the face changes by moving the front's texture coordinates along
 * the row of faces. THE BODY is the flannel shirt: the check is a tile pack.py
 * paints into the atlas, wrapped round his body and his sleeves by the
 * angle round each part, and a strip down his front is the black tee under
 * the open shirt. ONE MESH, every vertex on one bone and skinned on the CPU,
 * so he is one draw call, and the balloon is one more only while he shouts.
 *
 * HOW BIG. The shop is drawn S times its plan metres (./warehouse.js FRAME),
 * and he is too: a person standing in a shop a whoop is the right size for.
 *
 * Render may read frame time; this file reads only the clock the map is
 * handed, the camera and where the drawn craft is. Nothing here reaches the
 * physics.
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
import { drawWord, wordWidth, INK, PAPER, INKS } from '../../ui/lettering.js';
import { FRAME } from './warehouse.js';
import { BONES, BONE, THOMAS_LINES, thomasAt, thomasBones, thomasPose } from './thomas.js';

/* ------------------------------------------------------------------ */
/* The sheet                                                           */
/* ------------------------------------------------------------------ */

/* Packed by the thread's pack.py. Every [x, y] below is px of the atlas,
 * from its top left. */
const SHEET_URL = new URL('../../../assets/warehouse/thomas-manga.webp', import.meta.url).href;
const AW = 1536;
const AH = 768;
/* Six faces, each a TW wide tile along the top, drawn to one framing: his
 * crown at row FACE_TOP and the middle of his temples at column FACE_MID. */
const TW = 180;
export const FACE = { smile: 0, laugh: 1, shout: 2, talk: 3, surprised: 4, frown: 5 };
const FACE_TOP = 4;
const FACE_MID = 90;
/* His left side facing left, its crown at row SIDE_TOP; the column his
 * head's upright axis stands on is SIDE_AXIS. The back of his head, its
 * middle at BACK_MID. */
const SIDE = [1080, 0];
const SIDE_TOP = 4;
const SIDE_AXIS = 100;
const BACK = [1310, 0];
const BACK_TOP = 4;
const BACK_MID = 93;
/* The flannel's buffalo check: three periods by three, each PLAID_PX px of
 * the atlas and PLAID_M metres of shirt (a red square and a black one each
 * way), top left at PLAID. A triangle is painted from the middle period,
 * shifted by whole periods to where it sits, so its corners stay inside
 * the tile. */
const PLAID = [256, 210];
const PLAID_PX = 96;
const PLAID_M = 0.15;
const WHITE = [180, 210, 64, 64];

/* Real metres of a head from crown to chin, and the px that is in a face
 * and in his side (195 of each), as the sheet draws them. About a third
 * bigger than life, as Heads' and Dan's are, so a quad across the shop can
 * read his face. */
const HEAD_H = 0.33;
const HEAD_TOP_Y = 0.375;
const K = HEAD_H / 195;
const KS = HEAD_H / 195;

/*
 * THE HEAD'S SHAPE, printed by pack.py from the face and the side with the
 * hood's black taken out: for a row of the smiling face, the left and right
 * of its outline (FRONT_ROWS), and for the same height of his side, the
 * front and back of its outline (SIDE_ROWS), his nose taken out (rows 112
 * to 136 of the side are a straight line from his brow to his lip, because
 * the face's picture draws the nose and a nose of geometry would push the
 * whole face forward).
 */
const FRONT_ROWS = [
  [4, 88, 91], [10, 61, 118], [16, 51, 129], [22, 43, 135], [28, 39, 141], [34, 35, 146], [40, 31, 149],
  [46, 29, 153], [52, 27, 154], [58, 25, 155], [64, 26, 156], [70, 26, 155], [76, 26, 155], [82, 26, 156],
  [88, 27, 154], [94, 27, 153], [100, 28, 157], [106, 23, 159], [112, 20, 162], [118, 20, 162], [124, 20, 161],
  [130, 23, 159], [136, 26, 155], [142, 29, 152], [148, 39, 142], [154, 40, 141], [160, 41, 140], [166, 43, 138],
  [172, 46, 135], [178, 50, 130], [184, 56, 124], [190, 61, 119], [196, 67, 113],
];
const SIDE_ROWS = [
  [10, 68, 124], [16, 56, 142], [22, 43, 150], [28, 34, 156], [34, 29, 158], [40, 23, 163], [46, 21, 168],
  [52, 25, 170], [58, 25, 171], [64, 23, 173], [70, 21, 173], [76, 20, 173], [82, 17, 175], [88, 15, 173],
  [94, 15, 171], [100, 18, 170], [106, 17, 167], [142, 15, 152], [148, 14, 150], [154, 14, 150], [160, 18, 148],
  [166, 18, 150], [172, 21, 150], [178, 20, 149], [184, 18, 135], [190, 19, 121], [196, 23, 110],
];

function lerpRows(table, r) {
  if (r <= table[0][0]) {
    return [table[0][1], table[0][2]];
  }
  for (let i = 1; i < table.length; i += 1) {
    if (r <= table[i][0]) {
      const [r0, a0, b0] = table[i - 1];
      const [r1, a1, b1] = table[i];
      const t = (r - r0) / (r1 - r0);
      return [a0 + (a1 - a0) * t, b0 + (b1 - b0) * t];
    }
  }
  const last = table[table.length - 1];
  return [last[1], last[2]];
}

const SKIN = '#e6baa7';
const SHIRT = '#a8222a';
const TEE = '#262628';
const TROUSERS = '#2c2c2e';
const SHOE = '#313131';
const SOLE = '#d7cfc8';

const uvAt = (px, py) => [px / AW, 1 - py / AH];
const WHITE_UV = uvAt(WHITE[0] + WHITE[2] / 2, WHITE[1] + WHITE[3] / 2);

/* The three ways a part of his head is painted, by which way it faces. */
const headFront = (x, y) => uvAt(FACE_MID + x / K, FACE_TOP + (HEAD_TOP_Y - y) / K);
const headSide = (x, y, z) => uvAt(SIDE[0] + SIDE_AXIS - z / KS, SIDE[1] + SIDE_TOP + (HEAD_TOP_Y - y) / KS);
const headBack = (x, y) => uvAt(BACK[0] + BACK_MID - x / KS, BACK[1] + BACK_TOP + (HEAD_TOP_Y - y) / KS);

/* The check for one triangle whose middle is (cx, cy, cz), on a part whose
 * upright axis is at (ox, oz) and whose girth is about r: round the part is
 * the angle times r, up it is y. Each corner is measured from the middle's
 * angle the short way round, so a triangle across the back seam is not
 * stretched round the whole body. */
function plaidAt(cx, cy, cz, r, ox = 0, oz = 0) {
  const ac = Math.atan2(cx - ox, cz - oz);
  const ku = Math.floor((ac * r) / PLAID_M);
  const kv = Math.floor(cy / PLAID_M);
  return (x, y, z) => {
    let d = Math.atan2(x - ox, z - oz) - ac;
    d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
    const u = (ac + d) * r - (ku - 1) * PLAID_M;
    const v = y - (kv - 1) * PLAID_M;
    return uvAt(PLAID[0] + (u / PLAID_M) * PLAID_PX, PLAID[1] + 3 * PLAID_PX - (v / PLAID_M) * PLAID_PX);
  };
}

/* ------------------------------------------------------------------ */
/* The model                                                           */
/* ------------------------------------------------------------------ */

const rgb = (hex) => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
const lin = (c) => c.map((v) => v ** 2.2);

class Build {
  /* `white` is where the atlas's white block is, for a part that is a colour. */
  constructor(white) {
    this.white = white;
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.bone = [];
    this.idx = [];
  }

  vertex(bone, p, n, uv, c) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    const t = uv || this.white;
    this.uv.push(t[0], t[1]);
    const k = uv ? [1, 1, 1] : lin(c);
    this.col.push(k[0], k[1], k[2]);
    this.bone.push(bone);
    return this.pos.length / 3 - 1;
  }

  /*
   * A loft of rings round the bone's y axis, bottom to top: each ring is
   * { y, rx, rz, cx, cz, c } with c its colour, `n` points round. Painted
   * one of two ways. `map(x, y, z)` gives a vertex its place on the sheet
   * (or null for its ring's colour), shared by every triangle that meets
   * there: for a picture that wraps without a seam. `pick(nx, ny, nz, cx,
   * cy, cz)` gives each triangle, by the way it faces and where its middle is, a map of its own or null, and the
   * triangle then has its own three vertices, so two pictures meet at an
   * edge and neither is smeared across the other; `track` collects the
   * vertices `pick` sent to `front`, so the face can be changed.
   */
  loft(bone, rings, { n = 12, map = null, pick = null, front = null, track = null } = {}) {
    const P = [];
    for (const r of rings) {
      const ring = [];
      for (let j = 0; j < n; j += 1) {
        const a = (2 * Math.PI * j) / n;
        ring.push([(r.cx || 0) + r.rx * Math.sin(a), r.y, (r.cz || 0) + r.rz * Math.cos(a)]);
      }
      P.push(ring);
    }
    const R = rings.length;
    const NN = [];
    for (let i = 0; i < R; i += 1) {
      const row = [];
      for (let j = 0; j < n; j += 1) {
        const up = P[Math.min(i + 1, R - 1)][j];
        const dn = P[Math.max(i - 1, 0)][j];
        const nx = P[i][(j + 1) % n];
        const pv = P[i][(j + n - 1) % n];
        const t1 = [up[0] - dn[0], up[1] - dn[1], up[2] - dn[2]];
        const t2 = [nx[0] - pv[0], nx[1] - pv[1], nx[2] - pv[2]];
        /* The around tangent crossed with the up one is the outward normal
         * for rings wound this way: z forward at j = 0 and x at j = 1. */
        let v = [t2[1] * t1[2] - t2[2] * t1[1], t2[2] * t1[0] - t2[0] * t1[2], t2[0] * t1[1] - t2[1] * t1[0]];
        const len = Math.hypot(v[0], v[1], v[2]);
        v = len < 1e-9 ? [0, i === 0 ? -1 : 1, 0] : [v[0] / len, v[1] / len, v[2] / len];
        row.push(v);
      }
      NN.push(row);
    }
    const quads = (fn) => {
      for (let i = 0; i + 1 < R; i += 1) {
        for (let j = 0; j < n; j += 1) {
          const j1 = (j + 1) % n;
          fn([i, j], [i, j1], [i + 1, j]);
          fn([i, j1], [i + 1, j1], [i + 1, j]);
        }
      }
    };
    if (!pick) {
      const base = this.pos.length / 3;
      for (let i = 0; i < R; i += 1) {
        for (let j = 0; j < n; j += 1) {
          const p = P[i][j];
          this.vertex(bone, p, NN[i][j], map ? map(p[0], p[1], p[2]) : null, rings[i].c);
        }
      }
      quads((a, b, c) => this.idx.push(...[a, b, c].map(([i, j]) => base + i * n + j)));
      return;
    }
    quads((...tri) => {
      const [A, B, C] = tri.map(([i, j]) => P[i][j]);
      const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const fl = Math.hypot(f[0], f[1], f[2]) || 1;
      const how = pick(f[0] / fl, f[1] / fl, f[2] / fl, (A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3);
      for (const [i, j] of tri) {
        const p = P[i][j];
        const k = this.vertex(bone, p, NN[i][j], how ? how(p[0], p[1], p[2]) : null, rings[i].c);
        if (track && how === front) {
          track.push(k);
        }
        this.idx.push(k);
      }
    });
  }

  /* An ellipsoid between two polar angles from its top (0 is the top, PI the
   * bottom), `lat` rings. */
  ellipsoid(bone, c, r, colour, { from = Math.PI, to = 0, lat = 6, n = 12, pick = null } = {}) {
    const rings = [];
    for (let k = 0; k <= lat; k += 1) {
      const f = from + ((to - from) * k) / lat;
      const s = Math.max(Math.sin(f), 0.0012);
      rings.push({ y: c[1] + r[1] * Math.cos(f), rx: r[0] * s, rz: r[2] * s, cx: c[0], cz: c[2], c: colour });
    }
    this.loft(bone, rings, { n, pick });
  }
}

/* The parts of a bone, in the bone's own frame: its joint is the origin. */
export function thomasModel() {
  const B = new Build(WHITE_UV);
  const skin = rgb(SKIN);
  const shirt = rgb(SHIRT);
  const tee = rgb(TEE);
  const trousers = rgb(TROUSERS);
  const shoe = rgb(SHOE);
  const sole = rgb(SOLE);

  /* The hips in black trousers. */
  B.loft(BONE.pelvis, [
    { y: -0.16, rx: 0.15, rz: 0.1, c: trousers }, { y: -0.04, rx: 0.168, rz: 0.11, c: trousers }, { y: 0.07, rx: 0.155, rz: 0.104, c: trousers },
  ]);
  /* The flannel shirt, open down the front over the black tee: the
   * triangles either side of straight ahead are the tee's (0.5 rad of
   * the middle's angle: the body is wider than deep, so the two columns either
   * side of the front measure up to 25 degrees and the next starts at 39) (the
   * rings' colour), the rest the check. It hangs to the hips and its
   * shoulders slope in to his neck, so a quad above him sees cloth and not
   * into him. */
  const flannel = (r) => (nx, ny, nz, cx, cy, cz) => plaidAt(cx, cy, cz, r);
  const shirtFront = flannel(0.16);
  B.loft(BONE.spine, [
    { y: -0.14, rx: 0.19, rz: 0.125, c: tee }, { y: -0.06, rx: 0.196, rz: 0.13, c: tee }, { y: 0.06, rx: 0.186, rz: 0.12, c: tee },
    { y: 0.16, rx: 0.184, rz: 0.118, c: tee }, { y: 0.26, rx: 0.192, rz: 0.12, c: tee }, { y: 0.36, rx: 0.2, rz: 0.122, c: tee },
    { y: 0.42, rx: 0.205, rz: 0.118, c: tee }, { y: 0.465, rx: 0.185, rz: 0.108, c: tee }, { y: 0.5, rx: 0.13, rz: 0.09, c: tee },
    { y: 0.525, rx: 0.075, rz: 0.066, c: tee },
  ], { n: 16, pick: (nx, ny, nz, cx, cy, cz) => (Math.abs(Math.atan2(cx, cz)) < 0.5 && cy < 0.49 ? null : shirtFront(nx, ny, nz, cx, cy, cz)) });
  B.loft(BONE.spine, [{ y: 0.46, rx: 0.06, rz: 0.06, c: skin }, { y: 0.56, rx: 0.055, rz: 0.055, c: skin }]);
  /* The collar, standing round his neck and open at the front. */
  B.loft(BONE.spine, [
    { y: 0.47, rx: 0.118, rz: 0.098, cz: -0.006, c: tee }, { y: 0.515, rx: 0.1, rz: 0.088, cz: -0.008, c: tee },
    { y: 0.55, rx: 0.088, rz: 0.08, cz: -0.012, c: tee },
  ], { n: 14, pick: (nx, ny, nz, cx, cy, cz) => (Math.abs(Math.atan2(cx, cz + 0.01)) < 0.45 ? null : plaidAt(cx, cy, cz, 0.1, 0, -0.01)) });

  /* The head, ring by row of the sheet, painted from the front, his side or
   * behind by the way each triangle faces. */
  const headRings = [];
  /* Every other row is enough for the outline; the picture does the rest. */
  for (const [r, l, rr] of FRONT_ROWS.filter((row, i) => i % 2 === 0 || i === FRONT_ROWS.length - 1)) {
    const y = HEAD_TOP_Y - (r - FACE_TOP) * K;
    const s = SIDE_TOP + (r - FACE_TOP) * (K / KS);
    const [fz, bz] = lerpRows(SIDE_ROWS, s);
    const zf = (SIDE_AXIS - fz) * KS;
    const zb = (bz - SIDE_AXIS) * KS;
    headRings.push({ y, rx: ((rr - l) / 2) * K, rz: (zf + zb) / 2, cx: ((l + rr) / 2 - FACE_MID) * K, cz: (zf - zb) / 2, c: skin });
  }
  /* Closed over his crown and under his chin. */
  const first = headRings[0];
  headRings.unshift({ ...headRings[headRings.length - 1], y: headRings[headRings.length - 1].y - 0.012, rx: 0.03, rz: 0.03 });
  headRings.push({ y: HEAD_TOP_Y + 0.003, rx: 0.002, rz: 0.002, cx: first.cx, cz: first.cz, c: skin });
  headRings.sort((a, b) => a.y - b.y);
  const track = [];
  B.loft(BONE.head, headRings, {
    n: 18,
    front: headFront,
    track,
    pick: (nx, ny, nz) => {
      if (nz > 0.3) {
        return headFront;
      }
      return nz < -0.55 ? headBack : headSide;
    },
  });

  for (const s of [1, -1]) {
    const arm = s > 0 ? BONE.armL : BONE.armR;
    const fore = s > 0 ? BONE.foreL : BONE.foreR;
    /* Long flannel sleeves, a cuff, and his hand. */
    B.loft(arm, [
      { y: -0.3, rx: 0.06, rz: 0.06, c: shirt }, { y: -0.12, rx: 0.07, rz: 0.07, c: shirt }, { y: 0.03, rx: 0.07, rz: 0.07, c: shirt },
    ], { pick: flannel(0.07) });
    B.ellipsoid(arm, [0, 0, 0], [0.072, 0.072, 0.072], shirt, { lat: 4, pick: flannel(0.07) });
    B.ellipsoid(fore, [0, 0, 0], [0.058, 0.058, 0.058], shirt, { lat: 4, pick: flannel(0.055) });
    B.loft(fore, [
      { y: -0.29, rx: 0.046, rz: 0.048, c: shirt }, { y: -0.25, rx: 0.05, rz: 0.052, c: shirt }, { y: -0.17, rx: 0.052, rz: 0.054, c: shirt },
      { y: -0.02, rx: 0.058, rz: 0.058, c: shirt },
    ], { pick: flannel(0.055) });
    B.ellipsoid(fore, [0, -0.34, 0.012], [0.034, 0.052, 0.022], skin, { lat: 4 });
  }
  for (const s of [1, -1]) {
    const thigh = s > 0 ? BONE.thighL : BONE.thighR;
    const shin = s > 0 ? BONE.shinL : BONE.shinR;
    const foot = s > 0 ? BONE.footL : BONE.footR;
    B.ellipsoid(thigh, [0, 0, 0], [0.09, 0.09, 0.09], trousers, { lat: 4 });
    B.loft(thigh, [{ y: -0.44, rx: 0.07, rz: 0.075, c: trousers }, { y: -0.2, rx: 0.085, rz: 0.09, c: trousers }, { y: 0, rx: 0.092, rz: 0.098, c: trousers }]);
    B.ellipsoid(shin, [0, 0, 0], [0.07, 0.07, 0.07], trousers, { lat: 4 });
    B.loft(shin, [{ y: -0.43, rx: 0.062, rz: 0.064, c: trousers }, { y: -0.2, rx: 0.066, rz: 0.07, c: trousers }, { y: 0, rx: 0.072, rz: 0.077, c: trousers }]);
    /* Black trainers on pale soles. */
    B.ellipsoid(foot, [0, -0.04, 0.05], [0.054, 0.048, 0.125], shoe, { lat: 4 });
    B.ellipsoid(foot, [0, -0.075, 0.055], [0.058, 0.016, 0.135], sole, { lat: 3 });
  }

  const count = B.pos.length / 3;
  const rest = new Float32Array(B.pos);
  const restN = new Float32Array(B.nor);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(B.pos), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(B.nor), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(B.uv), 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(B.col), 3));
  geometry.setIndex(B.idx);
  /* A sphere that holds him whatever the pose, in his own frame. */
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.5);
  const faceIdx = Uint32Array.from(track);
  const faceU = Float32Array.from(track, (i) => B.uv[i * 2]);
  return { geometry, rest, restN, bone: Uint8Array.from(B.bone), count, faceIdx, faceU };
}

/* ------------------------------------------------------------------ */
/* The balloon                                                         */
/* ------------------------------------------------------------------ */

const BW = 640;
const BH = 256;
/* The balloon in real metres, and where its tail's tip is on it. */
const BALLOON_W = 1.6;
const BALLOON_H = 0.64;
const TIP = [300, 250];
const TEXT_X = 320;
const TEXT_Y = 106;
const TEXT_W = 460;
const GAP = 0.32;

function balloonShape(ctx) {
  ctx.beginPath();
  ctx.ellipse(320, 108, 292, 98, 0, 0, Math.PI * 2);
  ctx.moveTo(270, 196);
  ctx.lineTo(TIP[0], TIP[1]);
  ctx.lineTo(340, 200);
  ctx.closePath();
}

function rowWidth(ctx, row, px) {
  const words = row.split(' ');
  return words.reduce((w, word) => w + wordWidth(ctx, word, px), 0) + GAP * px * (words.length - 1);
}

const ROW_PX = [96, 70, 52];
function rowsOf(ctx, text) {
  const words = text.split(' ');
  let best = null;
  for (let n = 1; n <= Math.min(3, words.length); n += 1) {
    const px = ROW_PX[n - 1];
    const cuts = [];
    const tryCut = (from, left, rows) => {
      if (left === 1) {
        cuts.push([...rows, words.slice(from).join(' ')]);
        return;
      }
      for (let k = from + 1; k <= words.length - left + 1; k += 1) {
        tryCut(k, left - 1, [...rows, words.slice(from, k).join(' ')]);
      }
    };
    tryCut(0, n, []);
    for (const rows of cuts) {
      const w = Math.max(...rows.map((r) => rowWidth(ctx, r, px)));
      const size = Math.min(px, (px * TEXT_W) / w);
      if (!best || size > best.px * 1.08) {
        best = { rows, px: size };
      }
    }
    if (best && best.px >= ROW_PX[n - 1] * 0.8) {
      break;
    }
  }
  return best;
}

function paintBalloon(canvas, say) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, BW, BH);
  ctx.lineJoin = 'round';
  /* Stroked at twice the line's width and then filled over, so the tail and
   * the ellipse share one outline and no seam. */
  balloonShape(ctx);
  ctx.lineWidth = 16;
  ctx.strokeStyle = INK;
  ctx.stroke();
  balloonShape(ctx);
  ctx.fillStyle = PAPER;
  ctx.fill();
  const text = say.text.toUpperCase();
  const { rows, px } = rowsOf(ctx, text);
  const rowH = px * 1.12;
  let y = TEXT_Y - (rowH * rows.length) / 2 + px * 0.86;
  for (const row of rows) {
    let x = TEXT_X - rowWidth(ctx, row, px) / 2;
    for (const word of row.split(' ')) {
      x += drawWord(ctx, word, x, y, px, say.fill, { seed: text }) + GAP * px;
    }
    y += rowH;
  }
}

/* ------------------------------------------------------------------ */
/* Thomas                                                              */
/* ------------------------------------------------------------------ */

/* The letters' colour for each line, cycling. */
const FILLS = ['#ffd45c', INKS.mint, INKS.sky, INKS.bail];
/* And the face for each: laughing, then shouting, then surprised. */
const LOOKS = [FACE.laugh, FACE.shout, FACE.surprised];
const SAYS = THOMAS_LINES.map((l, i) => ({ ...l, fill: FILLS[i % FILLS.length], face: LOOKS[i % LOOKS.length] }));

/* Real metres: how close the craft is when he shouts, and how far it must
 * go before he can again; and how long a shout is held, ms. */
const NEAR_R = 3.2;
const REARM_R = 5.2;
const SHOUT_MS = 2400;
/* A mouth open then shut every TALK_MS, and held shut for the last TALK_HOLD. */
const TALK_MS = 170;
const TALK_HOLD = 250;
/* World metres within which he is moved even out of the view. */
const NEAR_SKIN = 12;

/*
 * Thomas for the shop: `group` goes in the map's scene (whose dispose frees
 * it), update(step) is called with the clock the map's updateAnim is
 * handed, stats() is for the harness. `craftAt` answers where the drawn
 * craft is, in the world, or null.
 *
 * HIS CLOCK is the title's, the run's or the finish's, as the shell hands
 * it: his own adds up its forward steps and lets a step back or a leap of
 * more than a second go by as nothing, so a new run never moves him and a
 * pause holds him. A harness can hold him at a time of its own with
 * `group.userData.holdMs` and stand in for the craft with
 * `group.userData.craftAt`, a world { x, y, z } (scripts/ only).
 */
export function makeThomas(camera, craftAt = () => null) {
  const { OX, OZ, S } = FRAME;
  const model = thomasModel();
  const geometry = model.geometry;
  const posAttr = geometry.attributes.position;
  const norAttr = geometry.attributes.normal;

  /* The sheet, his whole skin; he is shown once it has come, so he is never
   * a grey figure with no face. */
  const map = new THREE.TextureLoader().load(SHEET_URL, () => {
    mesh.visible = true;
  });
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const material = cel({ color: 0xffffff, map, vertexColors: true, bands: 'soft3', tint: 0x8a7c96, cache: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'thomas';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.scale.setScalar(S);
  mesh.visible = false;

  const canvas = document.createElement('canvas');
  canvas.width = BW;
  canvas.height = BH;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const bcard = new THREE.PlaneGeometry(BALLOON_W, BALLOON_H);
  bcard.translate(-BALLOON_W * (TIP[0] / BW - 0.5), BALLOON_H * (0.5 - (1 - TIP[1] / BH)), 0);
  const balloon = new THREE.Mesh(bcard, new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, fog: false }));
  balloon.name = 'thomas balloon';
  balloon.castShadow = false;
  balloon.receiveShadow = false;
  /* Painted now, so its texture is whole from the start; hidden, it is still
   * warmed, since three's compile walks every material in the scene. */
  let painted = SAYS[0];
  paintBalloon(canvas, painted);
  balloon.visible = false;

  const group = new THREE.Group();
  group.name = 'thomas';
  group.add(mesh, balloon);

  const NB = BONES.length;
  const pose = thomasPose();
  const M = new Float64Array(NB * 12);
  const eye = { x: 0, y: 0, h: 0 };
  const frustum = new THREE.Frustum();
  const pm = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const top = new THREE.Vector3();
  const right = new THREE.Vector3();
  let clock = 0;
  let last = null;
  let skins = 0;
  let face = FACE.smile;
  /* What he is shouting, how long ago, and which he shouts next. */
  let say = null;
  let sayAge = 0;
  let nextLine = 0;
  let armed = true;
  let shouts = 0;

  /* Every vertex by its bone's matrix, which is all the skinning there is. */
  function skin() {
    const out = posAttr.array;
    const outN = norAttr.array;
    const rp = model.rest;
    const rn = model.restN;
    const bone = model.bone;
    for (let v = 0, k = 0; v < model.count; v += 1, k += 3) {
      const o = bone[v] * 12;
      const x = rp[k];
      const y = rp[k + 1];
      const z = rp[k + 2];
      out[k] = M[o] * x + M[o + 1] * y + M[o + 2] * z + M[o + 9];
      out[k + 1] = M[o + 3] * x + M[o + 4] * y + M[o + 5] * z + M[o + 10];
      out[k + 2] = M[o + 6] * x + M[o + 7] * y + M[o + 8] * z + M[o + 11];
      const a = rn[k];
      const c = rn[k + 1];
      const d = rn[k + 2];
      outN[k] = M[o] * a + M[o + 1] * c + M[o + 2] * d;
      outN[k + 1] = M[o + 3] * a + M[o + 4] * c + M[o + 5] * d;
      outN[k + 2] = M[o + 6] * a + M[o + 7] * c + M[o + 8] * d;
    }
    posAttr.needsUpdate = true;
    norAttr.needsUpdate = true;
    skins += 1;
  }

  /* His face k: the front of his head reads tile k of the atlas. */
  function setFace(k) {
    if (k === face) {
      return;
    }
    face = k;
    const uv = geometry.attributes.uv;
    const du = (k * TW) / AW;
    const base = model.faceU;
    for (let i = 0; i < model.faceIdx.length; i += 1) {
      uv.array[model.faceIdx[i] * 2] = base[i] + du;
    }
    uv.needsUpdate = true;
  }

  /* The craft against him, in real metres: close enough to shout, and the
   * arming again once it has gone far enough. */
  function answer(d) {
    if (say) {
      sayAge += d;
      if (sayAge >= SHOUT_MS) {
        say = null;
      }
    }
    const q = group.userData.craftAt || craftAt();
    if (!q) {
      return;
    }
    const dx = (q.x - OX) / S - pose.x;
    const dy = (OZ - q.z) / S - pose.y;
    const dz = q.y / S - (pose.floor + 0.9);
    const dist = Math.hypot(dx, dy, dz);
    if (dist > REARM_R) {
      armed = true;
    }
    if (armed && dist < NEAR_R && !say) {
      say = SAYS[nextLine];
      nextLine = (nextLine + 1) % SAYS.length;
      sayAge = 0;
      armed = false;
      shouts += 1;
    }
  }

  function update(step) {
    const hold = group.userData.holdMs;
    let d = 0;
    if (last !== null) {
      const dd = step - last;
      if (dd > 0 && dd <= 1000) {
        d = dd;
      }
    }
    last = step;
    clock = typeof hold === 'number' ? hold : clock + d;
    const cam = camera.position;
    eye.x = (cam.x - OX) / S;
    eye.y = (OZ - cam.z) / S;
    eye.h = cam.y / S;
    answer(d);
    const gest = say ? Math.min(1, sayAge / 260) * (1 - Math.min(1, Math.max(0, (sayAge - SHOUT_MS + 450) / 450))) : 0;
    thomasAt(clock, eye, gest, say ? say.both : false, pose);
    thomasBones(pose, M);

    mesh.position.set(OX + S * pose.x, 0, OZ - S * pose.y);
    mesh.rotation.y = pose.yaw;
    mesh.updateMatrixWorld();

    /* A shout is its line's face, with his mouth on the move. */
    let look = FACE.smile;
    if (say) {
      look = say.face;
      if (sayAge < SHOUT_MS - TALK_HOLD && Math.floor(sayAge / TALK_MS) % 3 === 2) {
        look = FACE.talk;
      }
    }
    setFace(look);

    const dist = cam.distanceTo(mesh.position);
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    sphere.center.set(mesh.position.x, mesh.position.y + S * 1.0, mesh.position.z);
    sphere.radius = S * 1.6;
    /* Moved only when he is in the view, or near enough that a fast turn
     * could bring him in before the camera's matrix catches up. */
    if (dist < NEAR_SKIN || frustum.intersectsSphere(sphere)) {
      skin();
    }

    if (!say || dist > 150) {
      balloon.visible = false;
      return;
    }
    if (say !== painted) {
      paintBalloon(canvas, say);
      texture.needsUpdate = true;
      painted = say;
    }
    balloon.visible = true;
    const pop = (0.65 + 0.35 * Math.min(1, sayAge / 160)) * (1 - 0.6 * Math.max(0, (sayAge - SHOUT_MS + 150) / 150));
    /* Beside his head, level with his eyes, the tail's tip a little off his
     * cheek on the side the camera's right is, as Heads' is. */
    const h = BONE.head * 12;
    top.set(M[h + 9], M[h + 10] + 0.12, M[h + 11]);
    mesh.localToWorld(top);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const far = Math.min(3, Math.max(1, cam.distanceTo(top) / 20));
    const size = S * 0.6 * far * pop;
    top.addScaledVector(right, S * 0.34 * far * pop);
    balloon.position.copy(top);
    balloon.quaternion.copy(camera.quaternion);
    balloon.scale.setScalar(size);
  }
  /* Posed once whether or not he is in view, so his first sight is a man
   * and not his parts heaped at his feet. */
  update(0);
  skin();

  return {
    group,
    update,
    stats: () => ({
      clockMs: clock,
      state: pose.state,
      at: [Math.round(pose.x * 100) / 100, Math.round(pose.y * 100) / 100],
      yaw: Math.round(pose.yaw * 1000) / 1000,
      line: say ? say.text : null,
      shouts,
      face,
      looking: pose.look > 0,
      waving: pose.wave > 0,
      skins,
      vertices: posAttr.count,
      triangles: geometry.index.count / 3,
    }),
  };
}
