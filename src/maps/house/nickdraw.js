/*
 * nickdraw.js: Nick Burns drawn, an anime figure of him and his speech
 * balloon, posed every frame from ./nick.js.
 *
 * HOW HE LOOKS, from the stills of his own videos the house was built from
 * (/mnt/project-files/nick-burns-house/refs): short salt and pepper grey
 * hair brushed up at the front, big light framed glasses, clean shaven, a
 * big grin, a royal blue tee, dark jeans, a black watch on his left wrist,
 * and the red shoes with white soles. Drawn the way the house is, in plain
 * shapes and flat colour under the map's own cel light, comic hatching and
 * ink; the anime is in the proportions (a head a little big for the body),
 * the eyes (large, a highlight in each), the brushed up spikes and the grin.
 * He is 1.8 m in real metres, so 5.4 m in the house's world, his size next
 * to a door.
 *
 * ONE DRAW CALL. Every part of him is one mesh, its colours in the vertices
 * and its material the map's own cel() with vertex colours. A part belongs
 * to one bone, and each frame his vertices are moved by their bone's
 * transform on the CPU (rigid skinning: about two thousand vertices, a few
 * microseconds), so the ink, the shadow map and the comic layer all see the
 * pose that is drawn without a skinning program of their own. The skinning
 * runs only while he is in front of the camera or near it, and not at all
 * while nothing about him moves; the transform that carries him round the
 * house is the mesh's own. His shadow is his own cast, as a car's is.
 *
 * THE BALLOON is a second mesh, drawn only while he is saying something:
 * a card that faces the camera, lettered in the simulator's own hand
 * (src/ui/lettering.js) on a 512 by 256 canvas that is painted again only
 * when the line changes. It grows with distance past thirty metres, so it
 * can be read across the yard, and goes with him behind a wall, since it is
 * depth tested like anything else. Its alpha is tested, not blended, so its
 * outline is a real silhouette and the map's ink draws round it.
 *
 * Render may read frame time; this file reads only the clock the map is
 * handed and the camera. Nothing here reaches the physics.
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
import { FRAME, UMBRELLA, PERGOLA, DEP } from './house.js';
import {
  BONES, BONE, NICK_LINES, HEAD_TOP, nickAt, nickBones, nickPose,
} from './nick.js';

const C = {
  skin: 0xf6cfb2,
  blush: 0xf29a94,
  hair: 0xb9b8b6,
  hairHi: 0xe2e0dc,
  hairLo: 0x8d8b88,
  brow: 0x7c7a78,
  eye: 0xfbfbf8,
  iris: 0x6a4a32,
  pupil: 0x1a1414,
  lash: 0x2a2424,
  glasses: 0xb4bcc8,
  mouth: 0x7a2330,
  teeth: 0xfbfbf8,
  tongue: 0xd8707a,
  tee: 0x2f5fd8,
  jeans: 0x2e3d63,
  shoe: 0xe4262e,
  sole: 0xf6f4ef,
  watch: 0x1c1d22,
  watchFace: 0x3d4350,
};

/* The letters' colour, by line (NICK_LINES' order): the catfish in amber,
 * all blue in blue, the rest round the shell's inks. */
const FILLS = ['#ffd45c', '#5b8cff', INKS.bail, INKS.mint, INKS.drift, INKS.amber, INKS.sky,
  INKS.bail, INKS.mint, INKS.drift, INKS.sky, INKS.mint, INKS.bail];

/* ------------------------------------------------------------------ */
/* His body                                                            */
/* ------------------------------------------------------------------ */

/*
 * Every part in its bone's frame, real metres (./nick.js says which way is
 * which): a geometry, its bone, its colour, and where it sits, turned by
 * (rx, ry, rz) in the bones' own order and scaled by (sx, sy, sz), or
 * placed by a matrix of its own (addM).
 */
function bodyGeometry() {
  const pos = [];
  const nor = [];
  const col = [];
  const bone = [];
  const idx = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  let count = 0;
  const addM = (geo, b, hex, matrix) => {
    geo.applyMatrix4(matrix);
    c.setHex(hex);
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    for (let i = 0; i < p.count; i += 1) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
      bone.push(b);
    }
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i += 1) {
        idx.push(count + geo.index.getX(i));
      }
    } else {
      for (let i = 0; i < p.count; i += 1) {
        idx.push(count + i);
      }
    }
    count += p.count;
    geo.dispose();
  };
  const add = (geo, b, hex, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    e.set(rx, ry, rz, 'YXZ');
    q.setFromEuler(e);
    m.compose(v.set(x, y, z), q, s.set(sx, sy, sz));
    addM(geo, b, hex, m);
  };
  const ball = (w = 10, h = 8) => new THREE.SphereGeometry(1, w, h);
  const tube = (r0, r1, len, seg = 10) => new THREE.CylinderGeometry(r0, r1, len, seg);
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const flatShape = (pts) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
  const arc = (rx, ry, n, a0, a1) => {
    const out = [];
    for (let i = 0; i <= n; i += 1) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([rx * Math.cos(a), ry * Math.sin(a)]);
    }
    return out;
  };

  /* The pelvis: the jeans' seat. */
  const P = BONE.pelvis;
  add(tube(0.17, 0.165, 0.2, 12), P, C.jeans, 0, -0.06, 0, 0, 0, 0, 1, 1, 0.68);
  add(box(0.17, 0.1, 0.16), P, C.jeans, 0, -0.13, 0);

  /* The chest: the tee, rounded over the shoulders, a v of skin at the
   * neck, the neck. */
  const SP = BONE.spine;
  add(tube(0.19, 0.165, 0.5, 14), SP, C.tee, 0, 0.16, 0, 0, 0, 0, 1, 1, 0.62);
  add(ball(14, 8), SP, C.tee, 0, 0.41, 0, 0, 0, 0, 0.185, 0.065, 0.115);
  for (const x of [-0.2, 0.2]) {
    add(ball(), SP, C.tee, x, 0.415, 0, 0, 0, 0, 0.08, 0.08, 0.08);
  }
  add(tube(0.055, 0.058, 0.12, 10), SP, C.skin, 0, 0.5, 0);
  add(flatShape([[-0.06, 0], [0.06, 0], [0, -0.11]]), SP, C.skin, 0, 0.458, 0.088, -0.29);

  /*
   * The head, round in the anime way: a cranium a touch wider than a real
   * one, a softer jaw under it, ears, a small nose. Every feature is set on
   * the face's curve and turned out with it, a few millimetres proud.
   */
  const H = BONE.head;
  add(ball(18, 14), H, C.skin, 0, 0.135, 0.005, 0, 0, 0, 0.104, 0.118, 0.11);
  add(ball(14, 10), H, C.skin, 0, 0.07, 0.02, 0, 0, 0, 0.082, 0.07, 0.085);
  for (const side of [-1, 1]) {
    add(ball(8, 6), H, C.skin, 0.104 * side, 0.125, -0.005, 0, 0, 0, 0.02, 0.034, 0.024);
  }
  add(box(0.012, 0.02, 0.014), H, C.skin, 0, 0.1, 0.118, -0.35);
  /* The eyes, anime size: the white, a hazel iris, the pupil, a highlight
   * (the same side in both, as if lit from one window), a heavy lash line
   * over each and a raised brow. */
  for (const side of [-1, 1]) {
    const x = 0.044 * side;
    const ry = 0.42 * side;
    add(ball(12, 10), H, C.eye, x, 0.13, 0.099, 0, ry, 0, 0.031, 0.037, 0.008);
    add(ball(12, 10), H, C.iris, x + 0.002 * side, 0.126, 0.104, 0, ry, 0, 0.021, 0.029, 0.006);
    add(ball(8, 6), H, C.pupil, x + 0.003 * side, 0.124, 0.108, 0, ry, 0, 0.011, 0.016, 0.004);
    add(ball(6, 4), H, C.eye, x + 0.009, 0.137, 0.111, 0, ry, 0, 0.008, 0.008, 0.003);
    add(box(0.072, 0.01, 0.012), H, C.lash, x, 0.166, 0.099, 0, ry, -0.12 * side);
    add(box(0.05, 0.01, 0.012), H, C.brow, x + 0.002 * side, 0.196, 0.094, 0, ry, -0.15 * side);
    add(ball(8, 6), H, C.blush, 0.066 * side, 0.092, 0.083, 0, 0.75 * side, 0, 0.018, 0.009, 0.004);
  }
  /* The glasses: big light rims round the eyes, the bridge, the arms back
   * to the ears. */
  for (const side of [-1, 1]) {
    add(new THREE.TorusGeometry(0.041, 0.0035, 6, 22), H, C.glasses, 0.045 * side, 0.132, 0.116, 0, 0.3 * side, 0, 1.12, 0.9, 1);
    add(box(0.006, 0.006, 0.11), H, C.glasses, 0.103 * side, 0.14, 0.04, 0, 0.1 * side, 0);
  }
  add(box(0.016, 0.005, 0.005), H, C.glasses, 0, 0.14, 0.121);
  /* The grin: wide and open, teeth along the top, the tongue low in it. */
  add(flatShape([[-0.037, 0], ...arc(0.037, 0.027, 14, Math.PI, 2 * Math.PI)]), H, C.mouth, 0, 0.072, 0.108, 0.35);
  add(flatShape([[-0.033, 0], [0.033, 0], [0.03, -0.009], [-0.03, -0.009]]), H, C.teeth, 0, 0.072, 0.1088, 0.35);
  add(flatShape(arc(0.016, 0.007, 10, 0, 2 * Math.PI)), H, C.tongue, 0, 0.054, 0.1028, 0.35);

  /*
   * The hair: a cap tipped back off the forehead, and short spikes set on
   * its curve in rings, salt and pepper, brushed up at the front and swept
   * back over the top, the way his is. A spike stands on the cap's normal
   * bent by its ring's sweep (up, and back), its foot just inside the cap.
   */
  const CAP = { a: 0.116, b: 0.128, c: 0.124, tilt: -0.72, at: new THREE.Vector3(0, 0.145, -0.008) };
  add(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), H, C.hair,
    CAP.at.x, CAP.at.y, CAP.at.z, CAP.tilt, 0, 0, CAP.a, CAP.b, CAP.c);
  const tipped = new THREE.Matrix4().makeRotationX(CAP.tilt);
  const upY = new THREE.Vector3(0, 1, 0);
  const rings = [
    /* theta from the cap's pole (a fraction of pi), the angles round it
     * (degrees, 90 is the front), height, up, back */
    [0.47, [62, 76, 90, 104, 118], 0.068, 1.0, -0.25],
    [0.3, [30, 62, 90, 118, 150, 200, 250, 290, 340], 0.058, 0.5, 0.7],
    [0.1, [90, 270], 0.05, 0.3, 1.0],
    [0.45, [225, 255, 285, 315], 0.046, 0.1, 0.6],
    [0.5, [5, 175], 0.04, 0.7, 0.2],
  ];
  const tones = [C.hair, C.hairHi, C.hairLo];
  let tone = 0;
  for (const [th, around, h, up, back] of rings) {
    for (const deg of around) {
      const t = th * Math.PI;
      const f = (deg * Math.PI) / 180;
      const pt = new THREE.Vector3(CAP.a * Math.sin(t) * Math.cos(f), CAP.b * Math.cos(t), CAP.c * Math.sin(t) * Math.sin(f));
      const nm = new THREE.Vector3(pt.x / (CAP.a * CAP.a), pt.y / (CAP.b * CAP.b), pt.z / (CAP.c * CAP.c));
      pt.applyMatrix4(tipped).add(CAP.at);
      nm.applyMatrix4(tipped).normalize();
      const axis = nm.clone().add(new THREE.Vector3(0, up, -back)).normalize();
      const cone = new THREE.ConeGeometry(0.026, h, 6);
      cone.translate(0, h / 2, 0);
      q.setFromUnitVectors(upY, axis);
      m.compose(pt.addScaledVector(nm, -0.004), q, s.set(1, 1, 1));
      addM(cone, H, tones[tone % 3], m);
      tone += 1;
    }
  }

  /* The arms: a sleeve, the upper arm, the elbow; the forearm and the hand,
   * thumb forward; the watch on the left wrist, its face on the back of it. */
  for (const [arm, fore, side] of [[BONE.armL, BONE.foreL, 1], [BONE.armR, BONE.foreR, -1]]) {
    add(tube(0.07, 0.062, 0.16), arm, C.tee, 0, -0.065, 0);
    add(tube(0.05, 0.045, 0.16, 12), arm, C.skin, 0, -0.2, 0);
    add(ball(12, 8), arm, C.skin, 0, -0.29, 0, 0, 0, 0, 0.045, 0.045, 0.045);
    add(tube(0.045, 0.036, 0.24, 12), fore, C.skin, 0, -0.12, 0);
    add(ball(8, 8), fore, C.skin, 0, -0.29, 0.004, 0, 0, 0, 0.022, 0.05, 0.04);
    add(ball(6, 6), fore, C.skin, 0, -0.27, 0.038, 0.5, 0, 0, 0.011, 0.026, 0.011);
    if (side > 0) {
      add(tube(0.04, 0.04, 0.028, 12), fore, C.watch, 0, -0.215, 0);
      add(box(0.008, 0.026, 0.024), fore, C.watchFace, 0.041, -0.215, 0);
    }
  }

  /* The legs: jeans to the ankle; the red shoes with white soles and laces. */
  for (const [th, sh, ft] of [[BONE.thighL, BONE.shinL, BONE.footL], [BONE.thighR, BONE.shinR, BONE.footR]]) {
    add(tube(0.095, 0.074, 0.43), th, C.jeans, 0, -0.215, 0);
    add(ball(10, 8), th, C.jeans, 0, -0.43, 0, 0, 0, 0, 0.07, 0.07, 0.07);
    add(tube(0.07, 0.06, 0.4), sh, C.jeans, 0, -0.2, 0);
    add(tube(0.055, 0.06, 0.045, 10), ft, C.shoe, 0, -0.02, 0);
    add(box(0.105, 0.06, 0.24), ft, C.shoe, 0, -0.045, 0.055);
    add(ball(10, 8), ft, C.shoe, 0, -0.047, 0.17, 0, 0, 0, 0.053, 0.034, 0.055);
    add(ball(10, 8), ft, C.shoe, 0, -0.042, -0.055, 0, 0, 0, 0.053, 0.04, 0.04);
    add(box(0.112, 0.022, 0.295), ft, C.sole, 0, -0.069, 0.055);
    add(box(0.044, 0.006, 0.09), ft, C.sole, 0, -0.013, 0.09, 0.25);
  }

  const g = new THREE.BufferGeometry();
  const P32 = new Float32Array(pos);
  const N32 = new Float32Array(nor);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P32), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N32), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  /* Fixed, in his frame: his reach from the middle of him, so the frustum
   * test never needs the skinned positions. */
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), 1.5);
  return { geometry: g, rest: P32, restN: N32, bone: Uint8Array.from(bone) };
}

/* ------------------------------------------------------------------ */
/* The balloon                                                         */
/* ------------------------------------------------------------------ */

const BW = 512;
const BH = 256;
/* The balloon in real metres, and where its tail's tip is on it. */
const BALLOON_W = 1.3;
const BALLOON_H = 0.65;
const TIP = [172, 250];
/* The top of the pergola's rafters, real metres. */
const RAFTERS = PERGOLA.h + 0.36;
const TEXT_W = 400;

function balloonShape(ctx) {
  ctx.beginPath();
  ctx.ellipse(256, 104, 234, 90, 0, 0, Math.PI * 2);
  ctx.moveTo(200, 172);
  ctx.lineTo(TIP[0], TIP[1]);
  ctx.lineTo(252, 186);
  ctx.closePath();
}

/* The space between words, as a fraction of the size: the lettering's own
 * space closes up under its slant and outline. */
const GAP = 0.32;

function rowWidth(ctx, row, px) {
  const words = row.split(' ');
  return words.reduce((w, word) => w + wordWidth(ctx, word, px), 0) + GAP * px * (words.length - 1);
}

/* The rows a line is lettered in, and the size: one row if it will go at a
 * readable size, else two split where they are most even. */
function rowsOf(ctx, text) {
  const one = rowWidth(ctx, text, 80);
  if ((80 * TEXT_W) / one >= 52) {
    return { rows: [text], px: Math.min(80, (80 * TEXT_W) / one) };
  }
  const words = text.split(' ');
  let best = null;
  for (let k = 1; k < words.length; k += 1) {
    const a = words.slice(0, k).join(' ');
    const b = words.slice(k).join(' ');
    const w = Math.max(rowWidth(ctx, a, 56), rowWidth(ctx, b, 56));
    if (!best || w < best.w) {
      best = { rows: [a, b], w };
    }
  }
  return { rows: best.rows, px: Math.min(56, (56 * TEXT_W) / best.w) };
}

function paintBalloon(canvas, line) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, BW, BH);
  ctx.lineJoin = 'round';
  /* Stroked at twice the line's width and then filled over, so the tail
   * and the ellipse share one outline and no seam. */
  balloonShape(ctx);
  ctx.lineWidth = 16;
  ctx.strokeStyle = INK;
  ctx.stroke();
  balloonShape(ctx);
  ctx.fillStyle = PAPER;
  ctx.fill();
  const text = NICK_LINES[line].text.toUpperCase();
  const { rows, px } = rowsOf(ctx, text);
  const rowH = px * 1.12;
  let y = 104 - (rowH * rows.length) / 2 + px * 0.86;
  for (const row of rows) {
    let x = 256 - rowWidth(ctx, row, px) / 2;
    for (const word of row.split(' ')) {
      x += drawWord(ctx, word, x, y, px, FILLS[line % FILLS.length], { seed: text }) + GAP * px;
    }
    y += rowH;
  }
}

/* ------------------------------------------------------------------ */
/* Nick                                                                */
/* ------------------------------------------------------------------ */

/*
 * Nick for a map: `group` goes in the map's scene (whose dispose frees it,
 * texture and all), update(step) is called with the clock the map's
 * updateAnim is handed, stats() is for the harness.
 *
 * HIS CLOCK. The clock the shell hands a map is the title's, or the run's
 * (which starts again at every run and stands still on the pads and in the
 * pause menu), or the finish's. His own clock adds up its forward steps and
 * lets a step back or a leap of more than a second go by as nothing, so a
 * new run, the title, a crash's reset or a mode change never moves him: he
 * is where he was, and a pause holds him. A harness can hold him at a time
 * of its own with `group.userData.holdMs` (scripts/ only).
 */
export function makeNick(camera) {
  const { OX, OZ, S } = FRAME;
  const body = bodyGeometry();
  const material = cel({ color: 0xffffff, vertexColors: true, bands: 3, tint: 0x8a7c96, cache: false });
  const mesh = new THREE.Mesh(body.geometry, material);
  mesh.name = 'nick';
  /* He casts a shadow and takes none: lit like a character in a panel,
   * under the umbrella or indoors as well, where the house's own shade
   * turned his face to a dark mask in the first shots. */
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.scale.setScalar(S);

  const canvas = document.createElement('canvas');
  canvas.width = BW;
  canvas.height = BH;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const card = new THREE.PlaneGeometry(BALLOON_W, BALLOON_H);
  card.translate(-BALLOON_W * (TIP[0] / BW - 0.5), BALLOON_H * (0.5 - (1 - TIP[1] / BH)), 0);
  const balloon = new THREE.Mesh(card, new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, fog: false }));
  balloon.name = 'nick balloon';
  balloon.castShadow = false;
  balloon.receiveShadow = false;
  /* Painted now, so its texture is whole from the start. Hidden, it is
   * still warmed: three's compile walks every material in the scene,
   * shown or not. */
  let painted = 0;
  paintBalloon(canvas, painted);
  balloon.visible = false;

  const group = new THREE.Group();
  group.name = 'nick';
  group.add(mesh, balloon);

  const pose = nickPose();
  const M = new Float64Array(BONES.length * 12);
  const posAttr = body.geometry.attributes.position;
  const norAttr = body.geometry.attributes.normal;
  const n = body.bone.length;
  const eye = { x: 0, y: 0, h: 0 };
  const frustum = new THREE.Frustum();
  const pm = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const top = new THREE.Vector3();
  let clock = 0;
  let last = null;
  let skinnedAt = null;
  let skins = 0;
  let shownLine = -1;

  function skin() {
    nickBones(pose, M);
    const out = posAttr.array;
    const outN = norAttr.array;
    const rp = body.rest;
    const rn = body.restN;
    for (let i = 0; i < n; i += 1) {
      const o = body.bone[i] * 12;
      const k = i * 3;
      const x = rp[k];
      const y = rp[k + 1];
      const z = rp[k + 2];
      out[k] = M[o] * x + M[o + 1] * y + M[o + 2] * z + M[o + 9];
      out[k + 1] = M[o + 3] * x + M[o + 4] * y + M[o + 5] * z + M[o + 10];
      out[k + 2] = M[o + 6] * x + M[o + 7] * y + M[o + 8] * z + M[o + 11];
      const a = rn[k];
      const b = rn[k + 1];
      const c = rn[k + 2];
      outN[k] = M[o] * a + M[o + 1] * b + M[o + 2] * c;
      outN[k + 1] = M[o + 3] * a + M[o + 4] * b + M[o + 5] * c;
      outN[k + 2] = M[o + 6] * a + M[o + 7] * b + M[o + 8] * c;
    }
    posAttr.needsUpdate = true;
    norAttr.needsUpdate = true;
    skins += 1;
  }

  function update(step) {
    const hold = group.userData.holdMs;
    if (typeof hold === 'number') {
      clock = hold;
    } else if (last !== null) {
      const d = step - last;
      if (d > 0 && d <= 1000) {
        clock += d;
      }
    }
    last = step;
    const cam = camera.position;
    eye.x = (cam.x - OX) / S;
    eye.y = (OZ - cam.z) / S;
    eye.h = cam.y / S;
    nickAt(clock, eye, pose);

    mesh.position.set(OX + S * pose.x, 0, OZ - S * pose.y);
    mesh.rotation.y = pose.yaw;
    mesh.updateMatrixWorld();

    const dist = cam.distanceTo(mesh.position);
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    sphere.center.set(mesh.position.x, mesh.position.y + S * 1.0, mesh.position.z);
    sphere.radius = S * 1.6;
    const seen = dist < 40 || frustum.intersectsSphere(sphere);
    /* A still pose (his clock stopped and the camera too far for him to
     * look at it) is not moved again. */
    const still = skinnedAt === clock && pose.look === 0 && pose.wave === 0;
    if (seen && !still) {
      skin();
      skinnedAt = clock;
    }

    if (pose.line < 0 || dist > 150) {
      balloon.visible = false;
      return;
    }
    if (pose.line !== shownLine) {
      if (pose.line !== painted) {
        paintBalloon(canvas, pose.line);
        texture.needsUpdate = true;
        painted = pose.line;
      }
      shownLine = pose.line;
    }
    balloon.visible = true;
    /* Over his head, a little higher outdoors than under a ceiling; and
     * over the umbrella when he is under it and the camera is above it,
     * where the canopy would hide it, and over the rafters when the camera
     * is above those, where the beam would. */
    const h = M[BONE.head * 12 + 10] + HEAD_TOP + (pose.indoors ? 0.02 : 0.08);
    top.set(M[BONE.head * 12 + 9], h, M[BONE.head * 12 + 11]);
    mesh.localToWorld(top);
    if (!pose.indoors && eye.h > RAFTERS && pose.x > PERGOLA.x0 - 0.3 && pose.x < PERGOLA.x1 + 0.3 && pose.y > DEP && pose.y < PERGOLA.y1 + 0.5) {
      top.y = S * (RAFTERS + 0.05);
    } else if (pose.cover && eye.h > UMBRELLA.h0) {
      top.y = S * (UMBRELLA.h0 + UMBRELLA.h + 0.05);
    }
    balloon.position.copy(top);
    balloon.quaternion.copy(camera.quaternion);
    const pop = (0.65 + 0.35 * Math.min(1, pose.lineAge / 160)) * (1 - 0.6 * Math.max(0, (pose.lineAge - pose.lineDur + 150) / 150));
    const far = Math.min(2.5, Math.max(1, dist / 30));
    balloon.scale.setScalar(S * (pose.indoors ? 0.75 : 1) * far * pop);
  }
  /* Posed once whether or not he is in view, so his shadow and his first
   * sight are a man and not his parts heaped at his feet. */
  update(0);
  skin();
  skinnedAt = clock;

  return {
    group,
    update,
    stats: () => ({
      clockMs: clock,
      state: pose.state,
      at: [Math.round(pose.x * 100) / 100, Math.round(pose.y * 100) / 100],
      line: pose.line >= 0 ? NICK_LINES[pose.line].text : null,
      looking: pose.look > 0,
      waving: pose.wave > 0,
      skins,
      vertices: n,
      triangles: body.geometry.index.count / 3,
    }),
  };
}
