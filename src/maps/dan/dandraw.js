/*
 * dandraw.js: Dan as a model and his speech balloon, for ./dan.js's life.
 *
 * The owner's ask of 2026-10-21: Dan in the corner of every RaceGOW room,
 * watching the quad and judging the pilot. His likeness is the owner's Grok
 * sheet (segments_3.zip in the thread's files), cut into pieces the way
 * Heads' was: six faces straight on at one framing, his left side, the back
 * of his head, and the grey tee and shorts from the front. The thread's
 * pack.py puts the ones used into one atlas, assets/dan/dan-manga.webp
 * (NOTICE), and prints the head's outline tables below.
 *
 * It is built the way ../heads/mandraw.js builds Heads, and with its parts:
 * the same loft builder, the same skeleton (../heads/man.js), the same
 * balloon painter. THE HEAD is a ring for each row of the smiling face, as
 * wide as the face's outline there and as deep as his side's, each triangle
 * painted from the face, his side or the back of his head by the way it
 * faces; the face changes by moving the front's texture coordinates along
 * the row of faces. ONE MESH, every vertex on one bone and skinned on the
 * CPU, so he is one draw call, and the balloon is one more only while he
 * speaks.
 *
 * HOW BIG. The room is built MICRO_SCALE times life size so a 65 mm whoop
 * can fly it (src/game/track.js), so Dan is drawn at the same factor: a
 * person standing in a room a whoop is the right size for. His bones are in
 * real metres and the mesh is scaled by that factor.
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
import { INKS } from '../../ui/lettering.js';
import {
  Build, lerpRows, rgb, paintBalloon, BW, BH, BALLOON_W, BALLOON_H, TIP,
} from '../heads/mandraw.js';
import {
  BONES, BONE, headsBones,
} from '../heads/man.js';
import { makeJudge, danState, danAt, SAY_MS } from './dan.js';

/* ------------------------------------------------------------------ */
/* The sheet                                                           */
/* ------------------------------------------------------------------ */

/* Packed by the thread's pack.py. Every [x, y] below is px of the atlas,
 * from its top left. */
const SHEET_URL = new URL('../../../assets/dan/dan-manga.webp', import.meta.url).href;
const AW = 1536;
const AH = 512;
/* Six faces, each a TW wide tile along the top, drawn to one framing: his
 * crown at row FACE_TOP and the middle of his eyes at column FACE_MID. */
const TW = 200;
export const FACE = {
  smile: 0, laugh: 1, shout: 2, talk: 3, surprised: 4, frown: 5,
};
const FACE_TOP = 4;
const FACE_MID = 100;
/* His left side facing left, its crown at row SIDE_TOP; the column his
 * head's upright axis stands on (under his ear) is SIDE_AXIS. The back of
 * his head, its middle at BACK_MID. Both are drawn smaller than the faces. */
const SIDE = [1204, 0];
const SIDE_TOP = 6;
const SIDE_AXIS = 105;
const BACK = [1384, 0];
const BACK_TOP = 2;
const BACK_MID = 76;
/* The tee from the front: the middle of it, the row of its collar and of
 * its hem. The shorts: the middle of each leg and the rows of the waist
 * and of the hem. */
const TEE = [0, 262];
const TEE_MID = 105;
const TEE_COLLAR = 14;
const TEE_HEM = 176;
const SHORTS = [216, 262];
const SHORTS_MID = 81;
const SHORTS_LEG = [42, 120];
const SHORTS_WAIST = 3;
const SHORTS_HEM = 85;
const WHITE = [384, 262, 64, 64];

/* Real metres of a head from crown to chin, and the px that is in a face
 * (219 of them) and in his side (178), as the sheet draws them. */
const HEAD_H = 0.34;
const HEAD_TOP_Y = 0.375;
const K = HEAD_H / 216;
const KS = HEAD_H / 178;

/*
 * THE HEAD'S SHAPE, printed by pack.py: for a row of the smiling face, the
 * left and right of its outline (FRONT_ROWS), and for the same height of his
 * side, the front and back of its outline (SIDE_ROWS), his nose taken out
 * (rows 96 to 138 of the side are a straight line from his brow to his lip,
 * because the face's picture draws the nose and a nose of geometry would
 * push the whole face forward).
 */
const FRONT_ROWS = [
  [4, 101, 121], [10, 61, 128], [16, 53, 138], [22, 49, 153], [28, 34, 159], [34, 32, 163], [40, 28, 165],
  [46, 25, 169], [52, 20, 174], [58, 21, 176], [64, 19, 178], [70, 18, 180], [76, 17, 180], [82, 17, 180],
  [88, 17, 180], [94, 18, 180], [100, 19, 178], [106, 21, 177], [112, 22, 176], [118, 23, 177], [124, 22, 179],
  [130, 21, 180], [136, 20, 180], [142, 21, 180], [148, 22, 179], [154, 24, 177], [160, 27, 174], [166, 31, 168],
  [172, 39, 160], [178, 42, 158], [184, 44, 155], [190, 46, 154], [196, 49, 151], [202, 53, 146], [208, 61, 138],
  [214, 73, 126], [220, 89, 111],
];
const SIDE_ROWS = [
  [6, 40, 106], [12, 28, 127], [18, 22, 137], [24, 17, 141], [30, 13, 154], [36, 13, 158], [42, 15, 162],
  [48, 13, 165], [54, 23, 167], [60, 22, 169], [66, 19, 172], [72, 16, 172], [78, 16, 172], [84, 15, 172],
  [90, 16, 171], [96, 16, 170], [138, 14, 150], [144, 13, 148], [150, 15, 143], [156, 16, 141], [162, 16, 83],
  [168, 17, 77], [174, 23, 73], [180, 35, 58],
];

const SKIN = '#e0ac86';
const TEE_COLOUR = '#878787';
const SHORTS_COLOUR = '#646a6b';
const SLIDE = '#17181b';

const uvAt = (px, py) => [px / AW, 1 - py / AH];
const WHITE_UV = uvAt(WHITE[0] + WHITE[2] / 2, WHITE[1] + WHITE[3] / 2);

/* The three ways a part of his head is painted, by which way it faces. */
const headFront = (x, y) => uvAt(FACE_MID + x / K, FACE_TOP + (HEAD_TOP_Y - y) / K);
const headSide = (x, y, z) => uvAt(SIDE[0] + SIDE_AXIS - z / KS, SIDE[1] + SIDE_TOP + (HEAD_TOP_Y - y) / KS);
const headBack = (x, y) => uvAt(BACK[0] + BACK_MID - x / KS, BACK[1] + BACK_TOP + (HEAD_TOP_Y - y) / KS);

/* ------------------------------------------------------------------ */
/* The model                                                           */
/* ------------------------------------------------------------------ */

/* The parts of a bone, in the bone's own frame: its joint is the origin. */
export function danModel() {
  const B = new Build(WHITE_UV);
  const skin = rgb(SKIN);
  const tee = rgb(TEE_COLOUR);
  const shorts = rgb(SHORTS_COLOUR);
  const slide = rgb(SLIDE);

  /* The hips in shorts, painted with the sheet's from the front. */
  const hips = (x, y) => uvAt(SHORTS[0] + SHORTS_MID + x * 400, SHORTS[1] + SHORTS_WAIST + (0.07 - y) * 170);
  B.loft(BONE.pelvis, [
    { y: -0.16, rx: 0.15, rz: 0.1, c: shorts }, { y: -0.04, rx: 0.165, rz: 0.11, c: shorts }, { y: 0.07, rx: 0.17, rz: 0.12, c: shorts },
  ], { map: hips });
  /* The tee: its front is the sheet's, the logo and the collar; its back
   * and sides are its grey. He is stocky, and a belly is the widest part. */
  const chest = (x, y) => uvAt(TEE[0] + TEE_MID + x * 330, TEE[1] + TEE_COLLAR + (0.46 - y) * ((TEE_HEM - TEE_COLLAR) / 0.54));
  B.loft(BONE.spine, [
    { y: -0.08, rx: 0.165, rz: 0.115, c: tee }, { y: 0.06, rx: 0.175, rz: 0.13, c: tee }, { y: 0.16, rx: 0.175, rz: 0.125, c: tee },
    { y: 0.26, rx: 0.18, rz: 0.115, c: tee }, { y: 0.35, rx: 0.195, rz: 0.105, c: tee }, { y: 0.44, rx: 0.215, rz: 0.1, c: tee },
    { y: 0.5, rx: 0.12, rz: 0.08, c: tee },
  ], { n: 16, pick: (nx, ny, nz) => (nz > 0.45 ? chest : null) });
  B.loft(BONE.spine, [{ y: 0.46, rx: 0.07, rz: 0.07, c: skin }, { y: 0.56, rx: 0.065, rz: 0.065, c: skin }]);

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
    /* A short sleeve and the arm below it, bare. */
    B.loft(arm, [
      { y: -0.3, rx: 0.05, rz: 0.05, c: skin }, { y: -0.2, rx: 0.055, rz: 0.055, c: skin }, { y: -0.115, rx: 0.06, rz: 0.06, c: skin },
    ]);
    B.loft(arm, [
      { y: -0.125, rx: 0.08, rz: 0.08, c: tee }, { y: -0.02, rx: 0.083, rz: 0.083, c: tee }, { y: 0.03, rx: 0.072, rz: 0.072, c: tee },
    ]);
    B.ellipsoid(arm, [0, 0, 0], [0.078, 0.078, 0.078], tee, { lat: 4 });
    B.ellipsoid(fore, [0, 0, 0], [0.052, 0.052, 0.052], skin, { lat: 4 });
    B.loft(fore, [
      { y: -0.3, rx: 0.032, rz: 0.036, c: skin }, { y: -0.17, rx: 0.044, rz: 0.048, c: skin }, { y: -0.02, rx: 0.05, rz: 0.052, c: skin },
    ]);
    B.ellipsoid(fore, [0, -0.34, 0.012], [0.04, 0.058, 0.026], skin, { lat: 4 });
  }
  for (const s of [1, -1]) {
    const thigh = s > 0 ? BONE.thighL : BONE.thighR;
    const shin = s > 0 ? BONE.shinL : BONE.shinR;
    const foot = s > 0 ? BONE.footL : BONE.footR;
    /* His left is the sheet's right leg. */
    const mid = SHORTS[0] + SHORTS_LEG[s > 0 ? 1 : 0];
    const leg = (x, y) => uvAt(mid + x * 480, SHORTS[1] + 38 - y * ((SHORTS_HEM - 38) / 0.29));
    B.ellipsoid(thigh, [0, 0, 0], [0.085, 0.085, 0.085], shorts, { lat: 4 });
    /* The shorts to just above the knee, then his bare leg. */
    B.loft(thigh, [{ y: -0.3, rx: 0.075, rz: 0.08, c: shorts }, { y: -0.15, rx: 0.083, rz: 0.088, c: shorts }, { y: 0, rx: 0.088, rz: 0.095, c: shorts }], { map: leg });
    B.loft(thigh, [{ y: -0.44, rx: 0.06, rz: 0.065, c: skin }, { y: -0.3, rx: 0.073, rz: 0.078, c: skin }]);
    B.ellipsoid(shin, [0, 0, 0], [0.06, 0.06, 0.06], skin, { lat: 4 });
    B.loft(shin, [{ y: -0.43, rx: 0.045, rz: 0.048, c: skin }, { y: -0.2, rx: 0.055, rz: 0.058, c: skin }, { y: 0, rx: 0.06, rz: 0.064, c: skin }]);
    /* Black slides. */
    B.ellipsoid(foot, [0, -0.045, 0.05], [0.056, 0.036, 0.125], slide, { lat: 4 });
    B.ellipsoid(foot, [0, -0.07, 0.055], [0.06, 0.014, 0.135], slide, { lat: 3 });
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
/* Dan                                                                 */
/* ------------------------------------------------------------------ */

/* The letters' colour for each line, cycling. */
const FILLS = ['#ffd45c', INKS.mint, INKS.sky, INKS.bail];
/* A mouth open then shut every TALK_MS, and held shut for the last TALK_HOLD. */
const TALK_MS = 190;
const TALK_HOLD = 450;
/* A line's gesture comes in over this long, and goes out over the last. */
const GEST_IN = 260;
const GEST_OUT = 600;
/* The balloon's width over its distance from the camera, kept between a
 * floor and a ceiling in the room's own metres (a face is read at a glance;
 * a line is read in a second or two). */
const BALLOON_REACH = 0.42;
/* A line of more than this many words is read from a card this much wider. */
const LONG_WORDS = 4;
const LONG_WIDER = 1.4;

/*
 * Dan for a room: `group` goes in the map's scene (whose dispose frees it),
 * update(step) is called with the clock the map's updateAnim is handed,
 * hear(kind, simMs, info) is what the shell tells him (see ./dan.js),
 * stats() is for the harness. `at` is where he stands, { x, y, z } in the
 * world, `scale` the room's factor over life size, and `craftAt` answers
 * where the drawn craft is, in the world, or null.
 *
 * HIS CLOCK is the run's or the title's, as the shell hands it: his own
 * adds up its forward steps and lets a step back or a leap of more than a
 * second go by as nothing, so a new run never moves him and a pause holds
 * him. A harness can hold him at a time of its own with
 * `group.userData.holdMs` and stand in for the craft with
 * `group.userData.craftAt`, a world { x, y, z } (scripts/ only).
 */
export function makeDan(camera, craftAt, at, scale) {
  const model = danModel();
  const geometry = model.geometry;
  const posAttr = geometry.attributes.position;
  const norAttr = geometry.attributes.normal;

  /* The sheet, his whole skin; he is shown once it has come, so he is never
   * a grey figure with no face. */
  let came;
  const ready = new Promise((resolve) => {
    came = resolve;
  });
  const map = new THREE.TextureLoader().load(SHEET_URL, () => {
    mesh.visible = true;
    came();
  }, undefined, came);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const material = cel({ color: 0xffffff, map, vertexColors: true, bands: 'soft3', tint: 0x8a7c96, cache: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'dan';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.scale.setScalar(scale);
  mesh.visible = false;
  mesh.position.set(at.x, at.y, at.z);

  const canvas = document.createElement('canvas');
  canvas.width = BW;
  canvas.height = BH;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const bcard = new THREE.PlaneGeometry(BALLOON_W, BALLOON_H);
  bcard.translate(-BALLOON_W * (TIP[0] / BW - 0.5), BALLOON_H * (0.5 - (1 - TIP[1] / BH)), 0);
  const balloon = new THREE.Mesh(bcard, new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, fog: false }));
  balloon.name = 'dan balloon';
  balloon.castShadow = false;
  balloon.receiveShadow = false;
  /* Painted now, so its texture is whole from the start; hidden, it is still
   * warmed, since three's compile walks every material in the scene. */
  let painted = { text: 'Missed a gate.', fill: FILLS[0] };
  paintBalloon(canvas, painted);
  balloon.visible = false;

  const group = new THREE.Group();
  group.name = 'dan';
  group.add(mesh, balloon);

  const NB = BONES.length;
  const judge = makeJudge();
  const st = danState(Math.atan2(-at.x, -at.z));
  const M = new Float64Array(NB * 12);
  const aim = { x: 0, y: 0, z: 0 };
  const frustum = new THREE.Frustum();
  const pm = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const top = new THREE.Vector3();
  const right = new THREE.Vector3();
  let clock = 0;
  let last = null;
  let skins = 0;
  let face = FACE.smile;
  /* What he is saying, how long ago, and how many lines he has said. */
  let say = null;
  let sayAt = 0;
  let sayAge = 0;
  let said = 0;

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

  /* What the shell tells him: he answers with a line, or does not. */
  function hear(kind, simMs, info) {
    const line = judge.hear(kind, simMs, info);
    if (line) {
      say = { ...line, fill: FILLS[said % FILLS.length] };
      sayAt = clock;
      sayAge = 0;
      said += 1;
    }
    return line;
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
    if (say) {
      sayAge = clock - sayAt;
      if (sayAge >= SAY_MS || sayAge < 0) {
        say = null;
      }
    }

    /* The quad, in his frame and in his own real metres. */
    const q = group.userData.craftAt || craftAt();
    let target = null;
    if (q) {
      const vx = q.x - at.x;
      const vz = q.z - at.z;
      const c = Math.cos(st.yaw);
      const s = Math.sin(st.yaw);
      aim.x = (vx * c - vz * s) / scale;
      aim.z = (vx * s + vz * c) / scale;
      aim.y = (q.y - at.y) / scale;
      target = aim;
    }
    const gest = say
      ? Math.min(1, sayAge / GEST_IN) * (1 - Math.min(1, Math.max(0, (sayAge - SAY_MS + GEST_OUT) / GEST_OUT)))
      : 0;
    st.yaw += danAt(clock, d, target, gest, say ? say.move : '', st);
    st.pose.yaw = st.yaw;
    headsBones(st.pose, M);
    mesh.rotation.y = st.yaw;
    mesh.updateMatrixWorld();

    /* A line is its face, with his mouth on the move. */
    let look = FACE.smile;
    if (say) {
      look = FACE[say.face] ?? FACE.smile;
      if (sayAge < SAY_MS - TALK_HOLD && Math.floor(sayAge / TALK_MS) % 3 === 2) {
        look = FACE.talk;
      }
    }
    setFace(look);

    const cam = camera.position;
    const dist = cam.distanceTo(mesh.position);
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    sphere.center.set(mesh.position.x, mesh.position.y + scale * 1.0, mesh.position.z);
    sphere.radius = scale * 1.9;
    /* Moved only when he is in the view. */
    if (frustum.intersectsSphere(sphere)) {
      skin();
    }

    if (!say) {
      balloon.visible = false;
      return;
    }
    if (say.text !== painted.text) {
      paintBalloon(canvas, say);
      texture.needsUpdate = true;
      painted = say;
    }
    balloon.visible = true;
    const pop = (0.65 + 0.35 * Math.min(1, sayAge / 160)) * (1 - 0.6 * Math.max(0, (sayAge - SAY_MS + 150) / 150));
    /* Over his head, its tail's tip on his crown, as wide as a line needs to
     * be read from where the camera is. */
    const h = BONE.head * 12;
    top.set(M[h + 9], M[h + 10] + 0.42, M[h + 11]);
    mesh.localToWorld(top);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const wider = say.text.split(' ').length > LONG_WORDS ? LONG_WIDER : 1;
    const width = Math.min(6 * scale, Math.max(1.3 * scale, cam.distanceTo(top) * BALLOON_REACH * wider)) * pop;
    const size = width / BALLOON_W;
    top.addScaledVector(right, size * 0.18);
    balloon.position.copy(top);
    balloon.quaternion.copy(camera.quaternion);
    balloon.scale.setScalar(size);
  }
  /* Posed once whether or not he is in view, so his first sight is a man
   * and not his parts heaped at his feet. */
  update(0);
  skin();

  const stats = () => ({
    clockMs: clock,
    at: [Math.round(at.x * 100) / 100, Math.round(at.z * 100) / 100],
    yaw: Math.round(st.yaw * 1000) / 1000,
    line: say ? say.text : null,
    said,
    face,
    skins,
    vertices: posAttr.count,
    triangles: geometry.index.count / 3,
    judge: judge.stats(),
  });
  /* For the harness, which reads a built map's scene and not the map. */
  group.userData.stats = stats;
  return {
    group, ready, update, hear, stats,
  };
}
