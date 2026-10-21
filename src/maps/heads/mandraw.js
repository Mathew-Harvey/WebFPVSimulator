/*
 * mandraw.js: Heads as a model and his speech balloon, for ./man.js's pose.
 *
 * The owner's ask of 2026-10-21 was a manga Heads. A first figure painted in
 * code from three photographs was, in the owner's word, trash, and the
 * owner made a sheet of him with Grok the way Nick Burns' was made: six
 * faces straight on at one framing (smiling, laughing, shouting, talking,
 * surprised, frowning), his left side, the back and the top of his head,
 * and him standing and walking in the Infinity Loops tee. It came cut into
 * pieces; the thread's pack.py puts the ones used into one atlas,
 * assets/heads/heads-manga.webp (NOTICE).
 *
 * THE HEAD is shaped from the sheet: one ring for each row of the smiling
 * face, as wide as the face's outline there and as deep as his side's
 * (FRONT_ROWS, SIDE_ROWS). Each triangle of it is painted from the face, his
 * side or the back of his head by the way it faces, with vertices of its
 * own, so two pictures meet along an edge and neither smears across the
 * other. The face changes by moving the front's texture coordinates along
 * the row of faces (setFace). His head is drawn about 1.3 times a real one,
 * as the sheet draws it, so a quad across the garage can read his face.
 *
 * THE BODY wears the sheet where it can: the tee's front with the script and
 * the pumpkin and the mic on his collar, the tattooed arm wrapped round both
 * forearms, the jeans' front on his legs; the rest is the sheet's colours.
 *
 * ONE MESH. Every vertex is on one bone of ./man.js and skinned on the CPU by
 * bone (no blending, so a bone that opens a gap carries a ball at its joint),
 * read as one draw call. The map's ink draws his outline where it folds.
 *
 * THE BALLOON is one more draw call while he speaks and none otherwise, a
 * card that faces the camera beside his head, drawn from the shell's
 * lettering (src/ui/lettering.js), the same hand as the score and titles.
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
import { FRAME } from './heads.js';
import { BONES, BONE, HEADS_LINES, HEAD_TOP, headsAt, headsBones, headsPose } from './man.js';

/* ------------------------------------------------------------------ */
/* The sheet                                                           */
/* ------------------------------------------------------------------ */

/* The owner's Grok sheet of Heads (NOTICE), packed into one atlas by the
 * thread's pack.py: the faces, his side, the back of his head, him
 * standing, a tattooed arm and a white block. Every [x, y] below is px of
 * it, from its top left. */
const SHEET_URL = new URL('../../../assets/heads/heads-manga.webp', import.meta.url).href;
const AW = 2048;
const AH = 768;
/* Six faces, each a TW wide tile along the top, drawn to one framing: his
 * crown at row FACE_TOP and the middle of his eyes at column FACE_MID. */
const TW = 280;
export const FACE = { smile: 0, laugh: 1, shout: 2, talk: 3, surprised: 4, frown: 5 };
const FACE_TOP = 4;
const FACE_MID = 138;
/* His left side facing left, its crown at row SIDE_TOP; the column his
 * head's upright axis stands on is SIDE_AXIS. The back of his head, its
 * middle at BACK_MID. Both are drawn smaller than the faces. */
const SIDE = [1690, 0];
const SIDE_TOP = 6;
const SIDE_AXIS = 120;
const BACK = [1870, 0];
const BACK_TOP = 6;
const BACK_MID = 90;
/* Him standing, facing us: the middle of his body, his shoulders' row, the
 * tee's hem and each knee's middle column (his right, then his left). */
const BODY = [0, 310];
const BODY_MID = 92;
const BODY_SHOULDER = 112;
const BODY_HEM = 250;
const LEG_MID = [72, 113];
/* A tattooed arm from his sleeve to his wrist, and the white. */
const ARM = [190, 310, 49, 91];
const WHITE = [256, 310, 64, 64];

/* Real metres to the faces' px, and to the side's and the back's: the
 * crown to the chin is 0.37 m of head, which is 228 px of a face and 206
 * of the side, as the sheet draws them. */
const HEAD_H = 0.37;
const HEAD_TOP_Y = 0.375;
const K = HEAD_H / 228;
const KS = HEAD_H / 206;

/*
 * THE HEAD'S SHAPE, read off the sheet with a ruler: for a row of the smiling
 * face, the left and right of its outline (FRONT_ROWS), and for the same
 * height of his side, the front and back of its outline (SIDE_ROWS), his
 * nose taken out (rows 120 to 156 of the side are a straight line from his
 * brow to his lip, because the face's picture draws the nose and a nose of
 * geometry would push the whole face forward). Each row is one ring: as wide
 * as the face, as deep as the side.
 */
const FRONT_ROWS = [
  [4, 107, 148], [10, 95, 163], [16, 86, 181], [22, 79, 191], [28, 73, 201], [34, 70, 208], [40, 67, 209],
  [46, 65, 210], [52, 65, 213], [58, 64, 216], [64, 62, 218], [70, 61, 218], [76, 61, 218], [82, 62, 217],
  [88, 63, 216], [94, 64, 214], [100, 65, 213], [106, 66, 212], [112, 66, 211], [118, 66, 210], [124, 65, 213],
  [130, 61, 217], [136, 60, 217], [142, 60, 217], [148, 61, 216], [154, 62, 214], [160, 63, 213], [166, 65, 211],
  [172, 68, 210], [178, 71, 204], [184, 77, 200], [190, 78, 198], [196, 79, 197], [202, 81, 195], [208, 83, 192],
  [214, 85, 190], [220, 85, 190], [226, 86, 190], [232, 92, 184],
];
const SIDE_ROWS = [
  [6, 67, 138], [12, 36, 151], [18, 25, 167], [24, 20, 174], [30, 14, 179], [36, 14, 184], [42, 14, 191],
  [48, 16, 192], [54, 14, 194], [60, 27, 195], [66, 27, 196], [72, 26, 197], [78, 24, 197], [84, 23, 197],
  [90, 21, 196], [96, 19, 195], [102, 18, 193], [108, 20, 191], [114, 19, 189], [162, 16, 168], [168, 18, 166],
  [174, 20, 166], [180, 21, 166], [186, 23, 167], [192, 23, 169], [198, 21, 171], [204, 22, 175], [212, 26, 178],
];

export function lerpRows(table, r) {
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

const SKIN = '#d7ae9b';
const TEE = '#a5a4a8';
const JEANS = '#1e2329';
const SHOE = '#2f3646';

const uvAt = (px, py) => [px / AW, 1 - py / AH];
const WHITE_UV = uvAt(WHITE[0] + WHITE[2] / 2, WHITE[1] + WHITE[3] / 2);

/* The three ways a part of his head is painted, by which way it faces. */
const headFront = (x, y) => uvAt(FACE_MID + x / K, FACE_TOP + (HEAD_TOP_Y - y) / K);
const headSide = (x, y, z) => uvAt(SIDE[0] + SIDE_AXIS - z / KS, SIDE[1] + SIDE_TOP + (HEAD_TOP_Y - y) / KS);
const headBack = (x, y) => uvAt(BACK[0] + BACK_MID - x / KS, BACK[1] + BACK_TOP + (HEAD_TOP_Y - y) / KS);

/* ------------------------------------------------------------------ */
/* The model                                                           */
/* ------------------------------------------------------------------ */

export const rgb = (hex) => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
const lin = (c) => c.map((v) => v ** 2.2);

export class Build {
  /* `white` is where the atlas's white block is, for a part that is a colour:
   * Heads' is his own, and another figure drawn by this class gives its own. */
  constructor(white = WHITE_UV) {
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
   * there: for a picture that wraps without a seam. `pick(nx, ny, nz)` gives
   * each triangle, by the way it faces, a map of its own or null, and the
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
      const how = pick(f[0] / fl, f[1] / fl, f[2] / fl);
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
  ellipsoid(bone, c, r, colour, { from = Math.PI, to = 0, lat = 6, n = 12 } = {}) {
    const rings = [];
    for (let k = 0; k <= lat; k += 1) {
      const f = from + ((to - from) * k) / lat;
      const s = Math.max(Math.sin(f), 0.0012);
      rings.push({ y: c[1] + r[1] * Math.cos(f), rx: r[0] * s, rz: r[2] * s, cx: c[0], cz: c[2], c: colour });
    }
    this.loft(bone, rings, { n });
  }
}

/* The parts of a bone, in the bone's own frame: its joint is the origin. */
export function headsModel() {
  const B = new Build();
  const skin = rgb(SKIN);
  const tee = rgb(TEE);
  const jeans = rgb(JEANS);
  const shoe = rgb(SHOE);
  const sole = rgb('#efeee8');

  /* The hips in jeans, painted with the sheet's from the front. */
  const hips = (x, y) => uvAt(BODY[0] + BODY_MID + x * 200, BODY[1] + BODY_HEM + 12 + (0.07 - y) * 90);
  B.loft(BONE.pelvis, [
    { y: -0.16, rx: 0.15, rz: 0.1, c: jeans }, { y: -0.04, rx: 0.168, rz: 0.11, c: jeans }, { y: 0.07, rx: 0.15, rz: 0.098, c: jeans },
  ], { map: hips });
  /* The tee: its front is the sheet's, the Infinity Loops script, the
   * pumpkin and the mic on his collar; its back and sides are its grey. */
  const chest = (x, y) => uvAt(BODY[0] + BODY_MID + x * 250, BODY[1] + BODY_SHOULDER + (0.5 - y) * ((BODY_HEM - 6 - BODY_SHOULDER) / 0.58));
  B.loft(BONE.spine, [
    { y: -0.08, rx: 0.184, rz: 0.122, c: tee }, { y: 0.06, rx: 0.172, rz: 0.11, c: tee }, { y: 0.14, rx: 0.17, rz: 0.108, c: tee },
    { y: 0.23, rx: 0.18, rz: 0.112, c: tee }, { y: 0.31, rx: 0.188, rz: 0.116, c: tee }, { y: 0.43, rx: 0.2, rz: 0.11, c: tee },
    { y: 0.5, rx: 0.12, rz: 0.085, c: tee },
  ], { n: 16, pick: (nx, ny, nz) => (nz > 0.45 ? chest : null) });
  B.loft(BONE.spine, [{ y: 0.46, rx: 0.06, rz: 0.06, c: skin }, { y: 0.56, rx: 0.055, rz: 0.055, c: skin }]);

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
    /* The sleeve, and the arm below it wearing the sheet's tattooed arm
     * from the sleeve to the wrist across both bones. */
    const ink = (t) => (x) => uvAt(ARM[0] + ARM[2] / 2 + (x / 0.05) * (ARM[2] * 0.13), ARM[1] + (0.14 + 0.7 * t) * ARM[3]);
    const upper = (x, y) => ink((-0.115 - y) / 0.485)(x);
    const lower = (x, y) => ink((0.185 - y) / 0.485)(x);
    B.loft(arm, [
      { y: -0.3, rx: 0.042, rz: 0.042, c: skin }, { y: -0.2, rx: 0.046, rz: 0.046, c: skin }, { y: -0.115, rx: 0.054, rz: 0.054, c: skin },
    ], { map: upper });
    B.loft(arm, [
      { y: -0.125, rx: 0.068, rz: 0.068, c: tee }, { y: -0.02, rx: 0.07, rz: 0.07, c: tee }, { y: 0.03, rx: 0.06, rz: 0.06, c: tee },
    ]);
    B.ellipsoid(arm, [0, 0, 0], [0.066, 0.066, 0.066], tee, { lat: 4 });
    B.ellipsoid(fore, [0, 0, 0], [0.046, 0.046, 0.046], skin, { lat: 4 });
    B.loft(fore, [
      { y: -0.3, rx: 0.028, rz: 0.032, c: skin }, { y: -0.17, rx: 0.038, rz: 0.042, c: skin }, { y: -0.02, rx: 0.044, rz: 0.046, c: skin },
    ], { map: lower });
    B.ellipsoid(fore, [0, -0.34, 0.012], [0.034, 0.052, 0.022], skin, { lat: 4 });
  }
  for (const s of [1, -1]) {
    const thigh = s > 0 ? BONE.thighL : BONE.thighR;
    const shin = s > 0 ? BONE.shinL : BONE.shinR;
    const foot = s > 0 ? BONE.footL : BONE.footR;
    /* His left is the sheet's right leg. */
    const mid = BODY[0] + LEG_MID[s > 0 ? 1 : 0];
    const upperLeg = (x, y) => uvAt(mid + x * 200, BODY[1] + 262 - y * 177);
    const lowerLeg = (x, y) => uvAt(mid + x * 200, BODY[1] + 340 - y * 150);
    B.ellipsoid(thigh, [0, 0, 0], [0.09, 0.09, 0.09], jeans, { lat: 4 });
    B.loft(thigh, [{ y: -0.44, rx: 0.07, rz: 0.075, c: jeans }, { y: -0.2, rx: 0.085, rz: 0.09, c: jeans }, { y: 0, rx: 0.092, rz: 0.098, c: jeans }], { map: upperLeg });
    B.ellipsoid(shin, [0, 0, 0], [0.068, 0.068, 0.068], jeans, { lat: 4 });
    B.loft(shin, [{ y: -0.43, rx: 0.055, rz: 0.057, c: jeans }, { y: -0.2, rx: 0.062, rz: 0.066, c: jeans }, { y: 0, rx: 0.07, rz: 0.075, c: jeans }], { map: lowerLeg });
    /* Dark canvas high tops, white rubber toes and soles. */
    B.ellipsoid(foot, [0, -0.04, 0.05], [0.054, 0.05, 0.125], shoe, { lat: 4 });
    B.ellipsoid(foot, [0, -0.055, 0.12], [0.05, 0.03, 0.06], sole, { lat: 3 });
    B.ellipsoid(foot, [0, -0.075, 0.055], [0.058, 0.014, 0.135], sole, { lat: 3 });
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

export const BW = 640;
export const BH = 256;
/* The balloon in real metres, and where its tail's tip is on it. */
export const BALLOON_W = 1.6;
export const BALLOON_H = 0.64;
export const TIP = [300, 250];
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

export function paintBalloon(canvas, say) {
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
/* Heads                                                               */
/* ------------------------------------------------------------------ */

/* The letters' colour for each line, cycling. */
const FILLS = ['#ffd45c', INKS.mint, INKS.sky, INKS.bail];
/* And the face for each: laughing, then shouting, then round again. */
const LOOKS = [FACE.laugh, FACE.shout, FACE.surprised];
const SAYS = HEADS_LINES.map((l, i) => ({ ...l, fill: FILLS[i % FILLS.length], face: LOOKS[i % LOOKS.length] }));

/* Real metres: how close the craft is when he shouts, and how far it must
 * go before he can again; and how long a shout is held, ms. */
const NEAR_R = 3.2;
const REARM_R = 5.2;
const SHOUT_MS = 2200;
/* A mouth open then shut every TALK_MS, and held shut for the last TALK_HOLD. */
const TALK_MS = 170;
const TALK_HOLD = 250;
/* World metres within which he is moved even out of the view. */
const NEAR_SKIN = 12;

/*
 * Heads for a map: `group` goes in the map's scene (whose dispose frees it),
 * update(step) is called with the clock the map's updateAnim is handed,
 * stats() is for the harness. `craftAt` answers where the drawn craft is, in
 * the world, or null.
 *
 * HIS CLOCK is the title's, the run's or the finish's, as the shell hands it:
 * his own adds up its forward steps and lets a step back or a leap of more
 * than a second go by as nothing, so a new run never moves him and a pause
 * holds him. A harness can hold him at a time of its own with
 * `group.userData.holdMs` and stand in for the craft with
 * `group.userData.craftAt`, a world { x, y, z } (scripts/ only).
 */
export function makeMan(camera, craftAt = () => null) {
  const { OX, OZ, S } = FRAME;
  const model = headsModel();
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
  mesh.name = 'heads';
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
  balloon.name = 'heads balloon';
  balloon.castShadow = false;
  balloon.receiveShadow = false;
  /* Painted now, so its texture is whole from the start; hidden, it is still
   * warmed, since three's compile walks every material in the scene. */
  let painted = SAYS[0];
  paintBalloon(canvas, painted);
  balloon.visible = false;

  const group = new THREE.Group();
  group.name = 'heads';
  group.add(mesh, balloon);

  const NB = BONES.length;
  const pose = headsPose();
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
    headsAt(clock, eye, gest, say ? say.both : false, pose);
    headsBones(pose, M);

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
    /* Beside his head, level with his eyes, rather than over it: the garage's
     * ceiling is a hand's width over his hair, and a balloon over him would
     * sink into it. The tail's tip is a little off his cheek, on the side the
     * camera's right is. */
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
