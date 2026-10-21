/*
 * mandraw.js: Heads as a model and his speech balloon, for ./man.js's pose.
 *
 * The owner's ask of 2026-10-21 was a manga Heads, and what the owner sent
 * were three pictures of him: a stream still (grey swept hair, stubble,
 * headphones, a red tee), a vertical clip (a grey Infinity Loops tee with a
 * pumpkin, a lapel mic, tattooed forearms, the sticker wall behind) and a
 * cartoon of him with a grey beard. No sheet of faces was drawn, so he is
 * painted here from those, and what it takes from them is written below
 * rather than guessed at: the hair, the beard, the tee and its logo, the
 * mic, the arms. The headphones are left off, because only one of the three
 * has them and they are not what makes him him.
 *
 * ONE MESH. Lofted rings and ellipsoids, every vertex on one bone of
 * ./man.js, skinned on the CPU by bone (no blending, so a bone that opens a
 * gap carries a ball at its joint), read as one draw call with one texture
 * atlas: three faces (neutral, talking, shouting), the tee's chest with its
 * logo, and one white texel for every part that is a colour. His head is
 * drawn about 1.25 times a real one so a quad across the garage can read his
 * face. The map's ink draws his outline where the surface folds.
 *
 * THE BALLOON is one more draw call while he speaks and none otherwise, a
 * card that faces the camera over his head, drawn from the shell's lettering
 * (src/ui/lettering.js) and so the same hand as the score and the titles.
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
/* The atlas                                                           */
/* ------------------------------------------------------------------ */

const AW = 1024;
const AH = 320;
/* Three faces, each TW by TH px, packed along the top. */
const TW = 160;
const TH = 200;
export const FACE = { neutral: 0, talk: 1, shout: 2 };
/* The tee's chest, SW by SH px, after them. */
const SX = 3 * TW;
const SW = 200;
const SH = 310;
/* One white texel, which every part that is a plain colour reads. */
const WHITE = [800, 20, 20, 20];

/* The head's front is projected onto a face tile: x over HX across the tile,
 * y over HY down it; the chest likewise over CX and CY from CY0 down. */
const HX = 0.3;
const HY = 0.38;
const CX = 0.4;
const CY = 0.62;
const CY0 = 0.52;

const SKIN = '#efbfa1';
const BEARD = '#9a9796';
const TEE = '#b7b9bd';

/* Seeded dots, so the stubble is the same every time. */
function dots(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* One face on its tile at (x0, 0). */
function paintFace(g, x0, kind) {
  g.save();
  g.translate(x0, 0);
  g.beginPath();
  g.rect(0, 0, TW, TH);
  g.clip();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.fillStyle = SKIN;
  g.fillRect(0, 0, TW, TH);
  /* The beard: along the jaw from ear to ear, up the cheeks to the
   * sideburns, a gap for the mouth, and over the top lip. */
  g.fillStyle = 'rgba(138,136,140,0.7)';
  g.beginPath();
  g.moveTo(0, 96);
  g.lineTo(20, 112);
  g.quadraticCurveTo(46, 126, 62, 132);
  g.lineTo(98, 132);
  g.quadraticCurveTo(114, 126, 140, 112);
  g.lineTo(TW, 96);
  g.lineTo(TW, TH);
  g.lineTo(0, TH);
  g.closePath();
  g.fill();
  /* Stubble on the cheeks and over the skin round the beard's edge. */
  const rnd = dots(0x4ead5);
  g.fillStyle = 'rgba(120,120,128,0.55)';
  for (let i = 0; i < 200; i += 1) {
    g.fillRect(rnd() * TW, 100 + rnd() * 36, 2, 2);
  }
  /* Skin round the mouth. */
  const wide = kind === 'shout';
  const mouthY = wide ? 158 : 160;
  g.fillStyle = '#d99a86';
  g.beginPath();
  g.ellipse(80, mouthY - 2, wide ? 34 : 26, wide ? 22 : 12, 0, 0, Math.PI * 2);
  g.fill();
  /* The mouth. */
  g.strokeStyle = INK;
  g.lineWidth = 3;
  if (kind === 'neutral') {
    g.beginPath();
    g.moveTo(62, mouthY);
    g.quadraticCurveTo(80, mouthY + 6, 98, mouthY - 1);
    g.stroke();
  } else {
    const w = wide ? 30 : 20;
    const h = wide ? 24 : 11;
    g.fillStyle = '#4a1d22';
    g.beginPath();
    g.ellipse(80, mouthY + 2, w, h, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#f5f0e6';
    g.fillRect(80 - w * 0.7, mouthY + 2 - h + 2, w * 1.4, wide ? 7 : 4);
    g.fillStyle = '#d6606c';
    g.beginPath();
    g.ellipse(80, mouthY + 2 + h * 0.55, w * 0.5, h * 0.35, 0, 0, Math.PI * 2);
    g.fill();
  }
  /* The nose: a line down one side and the nostrils' hook. */
  g.strokeStyle = 'rgba(11,17,22,0.8)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(84, 98);
  g.quadraticCurveTo(90, 118, 82, 128);
  g.quadraticCurveTo(76, 132, 70, 127);
  g.stroke();
  /* The eyes: big, half lidded when he is at ease, wide when he shouts, a
   * heavy brow over each. */
  const open = wide ? 1 : (kind === 'talk' ? 0.85 : 0.7);
  const browLift = wide ? 10 : 0;
  for (const side of [-1, 1]) {
    const ex = 80 + side * 30;
    const ey = 95;
    g.fillStyle = '#fbf7ee';
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(ex, ey, 17, 13 * open, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#3a5a78';
    g.beginPath();
    g.ellipse(ex - side * 2, ey + 1, 8.5, Math.min(9, 13 * open), 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(ex - side * 2, ey + 1, 4, Math.min(4.5, 6 * open), 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(ex - side * 2 - 5, ey - 6, 4, 4);
    /* The lid. */
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(ex - 18, ey - 2 - 12 * open + 2);
    g.quadraticCurveTo(ex, ey - 16 * open - 2, ex + 18, ey - 2 - 12 * open + 2);
    g.stroke();
    /* The brow, lower and slanted down toward the nose at ease. */
    g.lineWidth = 7;
    g.strokeStyle = '#6d6f76';
    g.beginPath();
    g.moveTo(ex - side * 22, 72 - browLift + (wide ? 0 : 3));
    g.lineTo(ex + side * 18, 70 - browLift - (wide ? 0 : 1) + (wide ? -4 : 5));
    g.stroke();
  }
  g.restore();
}

/* The chest: a grey tee with the Infinity Loops script in orange and the
 * pumpkin at its end. */
function paintChest(g) {
  g.save();
  g.translate(SX, 0);
  g.fillStyle = TEE;
  g.fillRect(0, 0, SW, SH);
  g.lineJoin = 'round';
  g.font = 'italic 900 31px "Brush Script MT", "Segoe Script", cursive, sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const grad = g.createLinearGradient(0, 95, 0, 125);
  grad.addColorStop(0, '#ffc13a');
  grad.addColorStop(1, '#ee4a22');
  g.lineWidth = 6;
  g.strokeStyle = '#7a1d10';
  g.strokeText('Infinity', 28, 100);
  g.fillStyle = grad;
  g.fillText('Infinity', 28, 100);
  g.strokeText('Loops', 46, 128);
  g.fillText('Loops', 46, 128);
  /* The pumpkin, ink eyes and a grin. */
  g.fillStyle = '#f08a1e';
  g.strokeStyle = '#4a2008';
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(150, 128, 15, 13, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#2a1308';
  g.beginPath();
  g.moveTo(143, 122);
  g.lineTo(148, 122);
  g.lineTo(145.5, 127);
  g.closePath();
  g.moveTo(152, 122);
  g.lineTo(157, 122);
  g.lineTo(154.5, 127);
  g.closePath();
  g.fill();
  g.fillRect(143, 133, 14, 3);
  g.restore();
}

export function paintAtlas(canvas) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, AW, AH);
  g.fillStyle = '#fff';
  g.fillRect(WHITE[0], WHITE[1], WHITE[2], WHITE[3]);
  paintFace(g, 0, 'neutral');
  paintFace(g, TW, 'talk');
  paintFace(g, 2 * TW, 'shout');
  paintChest(g);
}

/* ------------------------------------------------------------------ */
/* The model                                                           */
/* ------------------------------------------------------------------ */

const N = 12;

const rgb = (hex) => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
const lin = (c) => c.map((v) => v ** 2.2);

class Build {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.bone = [];
    this.idx = [];
  }

  /*
   * A loft of rings round the bone's y axis, bottom to top: each ring is
   * { y, rx, rz, cx, cz, c } with c its colour. `map(x, y, z)` may return a
   * [u, v] on the atlas for a vertex that wears a picture (and it then
   * keeps its own colour white), or null for one that is a plain colour.
   */
  loft(bone, rings, map = null, track = null) {
    const base = this.pos.length / 3;
    const P = [];
    for (const r of rings) {
      const ring = [];
      for (let j = 0; j < N; j += 1) {
        const a = (2 * Math.PI * j) / N;
        ring.push([(r.cx || 0) + r.rx * Math.sin(a), r.y, (r.cz || 0) + r.rz * Math.cos(a)]);
      }
      P.push(ring);
    }
    const R = rings.length;
    for (let i = 0; i < R; i += 1) {
      for (let j = 0; j < N; j += 1) {
        const p = P[i][j];
        const up = P[Math.min(i + 1, R - 1)][j];
        const dn = P[Math.max(i - 1, 0)][j];
        const nx = P[i][(j + 1) % N];
        const pv = P[i][(j + N - 1) % N];
        const t1 = [up[0] - dn[0], up[1] - dn[1], up[2] - dn[2]];
        const t2 = [nx[0] - pv[0], nx[1] - pv[1], nx[2] - pv[2]];
        /* The around tangent crossed with the up one is the outward normal
         * for rings wound this way: z forward at j = 0 and x at j = 1. */
        let n = [t2[1] * t1[2] - t2[2] * t1[1], t2[2] * t1[0] - t2[0] * t1[2], t2[0] * t1[1] - t2[1] * t1[0]];
        let len = Math.hypot(n[0], n[1], n[2]);
        if (len < 1e-9) {
          n = [0, i === 0 ? -1 : 1, 0];
          len = 1;
        }
        n = [n[0] / len, n[1] / len, n[2] / len];
        const cx = rings[i].cx || 0;
        const cz = rings[i].cz || 0;
        if (n[0] * (p[0] - cx) + n[2] * (p[2] - cz) < 0 && rings[i].rx > 0.002) {
          n = [-n[0], -n[1], -n[2]];
        }
        const uv = map ? map(p[0], p[1], p[2]) : null;
        if (uv && track) {
          track.push(this.pos.length / 3);
        }
        const c = uv ? [1, 1, 1] : lin(rings[i].c);
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(n[0], n[1], n[2]);
        const t = uv || [(WHITE[0] + WHITE[2] / 2) / AW, 1 - (WHITE[1] + WHITE[3] / 2) / AH];
        this.uv.push(t[0], t[1]);
        this.col.push(c[0], c[1], c[2]);
        this.bone.push(bone);
      }
    }
    for (let i = 0; i + 1 < R; i += 1) {
      for (let j = 0; j < N; j += 1) {
        const a = base + i * N + j;
        const b = base + i * N + ((j + 1) % N);
        const c = base + (i + 1) * N + j;
        const d = base + (i + 1) * N + ((j + 1) % N);
        this.idx.push(a, b, c, b, d, c);
      }
    }
  }

  /* An ellipsoid between two polar angles from its top (0 is the top, PI the
   * bottom), `lat` rings. */
  ellipsoid(bone, c, r, colour, { from = Math.PI, to = 0, lat = 6, shade = null, map = null } = {}) {
    const rings = [];
    for (let k = 0; k <= lat; k += 1) {
      const f = from + ((to - from) * k) / lat;
      const s = Math.max(Math.sin(f), 0.0012);
      rings.push({
        y: c[1] + r[1] * Math.cos(f), rx: r[0] * s, rz: r[2] * s, cx: c[0], cz: c[2],
        c: shade ? shade(k / lat, colour) : colour,
      });
    }
    this.loft(bone, rings, map);
  }
}

/* The parts of a bone, in the bone's own frame: its joint is the origin. */
export function headsModel() {
  const B = new Build();
  const skin = rgb(SKIN);
  const beard = rgb(BEARD);
  const tee = rgb(TEE);
  const ink = rgb('#b99f98');
  const jeans = rgb('#3c4658');
  const shoe = rgb('#2b2d34');
  const sole = rgb('#efeee8');
  const hair = rgb('#d2d5dc');
  const hairLow = rgb('#a0a4ae');
  const dark = rgb('#16181d');

  /* The hips, in jeans, and the tee over them. */
  B.loft(BONE.pelvis, [
    { y: -0.16, rx: 0.15, rz: 0.1, c: jeans }, { y: -0.03, rx: 0.175, rz: 0.115, c: jeans }, { y: 0.07, rx: 0.17, rz: 0.11, c: jeans },
  ]);
  const chest = (x, y, z) => (z > 0 ? [(SX + ((x + CX / 2) / CX) * SW) / AW, 1 - (((CY0 - y) / CY) * SH) / AH] : null);
  B.loft(BONE.spine, [
    { y: -0.07, rx: 0.176, rz: 0.116, c: tee }, { y: 0.14, rx: 0.17, rz: 0.108, c: tee },
    { y: 0.31, rx: 0.188, rz: 0.116, c: tee }, { y: 0.43, rx: 0.2, rz: 0.11, c: tee }, { y: 0.5, rx: 0.12, rz: 0.085, c: tee },
  ], chest);
  B.loft(BONE.spine, [{ y: 0.46, rx: 0.06, rz: 0.06, c: skin }, { y: 0.56, rx: 0.055, rz: 0.055, c: skin }]);
  /* The lapel mic on his left collar. */
  B.ellipsoid(BONE.spine, [0.07, 0.43, 0.11], [0.018, 0.026, 0.012], dark, { lat: 3 });

  /* The head: a face on its front, the beard and the sideburns on its sides
   * below the ear, a swept grey cap over it. */
  const face = (x, y, z) => (z > 0 ? [((x + HX / 2) / HX) * (TW / AW), 1 - (((HY - y) / HY) * TH) / AH] : null);
  const track = [];
  const headRings = [];
  for (let k = 0; k <= 9; k += 1) {
    const f = Math.PI - (Math.PI * k) / 9;
    const s = Math.max(Math.sin(f), 0.0012);
    const y = 0.19 + 0.185 * Math.cos(f);
    headRings.push({ y, rx: 0.15 * s, rz: 0.165 * s, cx: 0, cz: 0, c: y < 0.11 ? beard : skin });
  }
  B.loft(BONE.head, headRings, face, track);
  for (const s of [-1, 1]) {
    B.ellipsoid(BONE.head, [s * 0.152, 0.17, -0.005], [0.022, 0.04, 0.03], skin, { lat: 4 });
  }
  /* The hair: a cap set back so it clears his forehead, and a swept quiff
   * over it, grey, darker where it is cut short at the sides. */
  B.ellipsoid(BONE.head, [0, 0.215, -0.025], [0.162, 0.185, 0.18], hair, {
    from: 1.75, to: 0, lat: 6, shade: (t) => (t < 0.5 ? hairLow : hair),
  });
  B.ellipsoid(BONE.head, [0, 0.335, 0.07], [0.125, 0.07, 0.1], hair, { lat: 5 });
  B.ellipsoid(BONE.head, [0.03, 0.375, 0.04], [0.1, 0.045, 0.13], hair, { lat: 4 });

  for (const s of [1, -1]) {
    const arm = s > 0 ? BONE.armL : BONE.armR;
    const fore = s > 0 ? BONE.foreL : BONE.foreR;
    /* The sleeve, the skin below it, tattooed in bands. */
    B.loft(arm, [
      { y: -0.3, rx: 0.04, rz: 0.04, c: skin }, { y: -0.26, rx: 0.042, rz: 0.042, c: ink }, { y: -0.2, rx: 0.045, rz: 0.045, c: skin },
      { y: -0.15, rx: 0.049, rz: 0.049, c: ink }, { y: -0.115, rx: 0.056, rz: 0.056, c: skin },
      { y: -0.112, rx: 0.07, rz: 0.07, c: tee }, { y: -0.02, rx: 0.07, rz: 0.07, c: tee }, { y: 0.03, rx: 0.06, rz: 0.06, c: tee },
    ]);
    B.ellipsoid(arm, [0, 0, 0], [0.066, 0.066, 0.066], tee, { lat: 4 });
    B.ellipsoid(fore, [0, 0, 0], [0.046, 0.046, 0.046], skin, { lat: 4 });
    B.loft(fore, [
      { y: -0.3, rx: 0.026, rz: 0.03, c: skin }, { y: -0.24, rx: 0.034, rz: 0.038, c: ink }, { y: -0.17, rx: 0.038, rz: 0.042, c: skin },
      { y: -0.1, rx: 0.042, rz: 0.044, c: ink }, { y: -0.02, rx: 0.044, rz: 0.046, c: skin },
    ]);
    B.ellipsoid(fore, [0, -0.34, 0.012], [0.034, 0.052, 0.022], skin, { lat: 4 });
  }
  for (const s of [1, -1]) {
    const thigh = s > 0 ? BONE.thighL : BONE.thighR;
    const shin = s > 0 ? BONE.shinL : BONE.shinR;
    const foot = s > 0 ? BONE.footL : BONE.footR;
    B.ellipsoid(thigh, [0, 0, 0], [0.09, 0.09, 0.09], jeans, { lat: 4 });
    B.loft(thigh, [{ y: -0.44, rx: 0.07, rz: 0.075, c: jeans }, { y: -0.2, rx: 0.085, rz: 0.09, c: jeans }, { y: 0, rx: 0.092, rz: 0.098, c: jeans }]);
    B.ellipsoid(shin, [0, 0, 0], [0.068, 0.068, 0.068], jeans, { lat: 4 });
    B.loft(shin, [{ y: -0.43, rx: 0.052, rz: 0.054, c: jeans }, { y: -0.2, rx: 0.062, rz: 0.066, c: jeans }, { y: 0, rx: 0.07, rz: 0.075, c: jeans }]);
    B.ellipsoid(foot, [0, -0.045, 0.055], [0.052, 0.045, 0.125], shoe, { lat: 4 });
    B.ellipsoid(foot, [0, -0.075, 0.06], [0.056, 0.014, 0.13], sole, { lat: 3 });
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
/* Heads                                                               */
/* ------------------------------------------------------------------ */

/* The letters' colour for each line, cycling. */
const FILLS = ['#ffd45c', INKS.mint, INKS.sky, INKS.bail];
const SAYS = HEADS_LINES.map((l, i) => ({ ...l, fill: FILLS[i % FILLS.length] }));

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

  const atlas = document.createElement('canvas');
  atlas.width = AW;
  atlas.height = AH;
  paintAtlas(atlas);
  const map = new THREE.CanvasTexture(atlas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const material = cel({ color: 0xffffff, map, vertexColors: true, bands: 'soft3', tint: 0x8a7c96, cache: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'heads';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.scale.setScalar(S);

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
  let face = FACE.neutral;
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

    /* A shout is a wide mouth, a line is a mouth that opens and shuts. */
    let look = FACE.neutral;
    if (say) {
      look = FACE.shout;
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
