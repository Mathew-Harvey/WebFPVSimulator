/*
 * nickdraw.js: Nick Burns drawn, the owner's manga render of him and his
 * speech balloon, posed every frame from ./nick.js.
 *
 * HOW HE LOOKS. The owner's ask of 2026-10-18: "Attached is manga render of
 * nick, let's use this rather than the poly character." The render was a
 * sheet of seven side views of him walking and six of his face, which the
 * owner made and gave. The seven walk views turned out to be one pose, so
 * drawn as a flip book he slid along, and seated he was cut off at the
 * hips; the owner, 2026-10-19: "nick no longer walks properly no
 * animation, that should be fixed. also he has no legs or red shoes
 * anymore, fix that." He asked the same day whether the likeness could be
 * better ("can we improve the likeness of nicks face at allk?") and made
 * a second sheet in the same layout, nearer him (salt and pepper hair
 * combed across, clear glasses, a crew neck, his red shoes): "lets use
 * this". Its figures came cut from their grey; they are packed into one
 * atlas, ../../../assets/house/nick-manga.webp (NOTICE).
 * So he is a cut out now, the way a paper puppet is: one view's body from
 * the hips up, and its front leg stood straight and cut at the hip, the
 * knee and the ankle into a thigh, a shin and a shoe, each piece inked
 * round where it was cut, twice (the far leg's a shade darker). The
 * pieces are posed every frame from the skeleton ./nick.js already keeps,
 * so he walks with its stride, sits with its thighs level and shins down,
 * and gets up and sits down through its own blend; outside a walk his feet
 * are kept on the floor by bending the knee. The whole cut out turns about
 * his own axis to face the camera, as a cut out in a panel does, drawn in
 * the render's own colour and ink and unlit, so the map's light does not
 * shade him twice, and mirrored when the way he faces points to the right
 * of the screen. He is 1.83 m in real metres standing, his size next to a
 * door.
 *
 * ONE DRAW CALL for him and one for his balloon while it is up, both the
 * same program (a texture, alpha tested, no fog). No skinning and no
 * shadow: seven quads in one buffer whose 28 corners are written each
 * frame, a few hundred multiplications, and each piece a hair in front of
 * the one it covers so the depth test lays them in order.
 *
 * THE BALLOON is a card that faces the camera, lettered in the simulator's
 * own hand (src/ui/lettering.js) on a 640 by 256 canvas that is painted
 * again only when what he says changes, with the face that goes with the
 * line in a round panel at its left, cut from the same atlas. It grows with
 * distance past twenty metres, so it can be read across the yard, and goes
 * with him behind a wall, since it is depth tested like anything else. Its
 * alpha is tested, not blended, so its outline is a real silhouette and the
 * map's ink draws round it.
 *
 * WHAT HE SAYS. His four lines on his own clock (./nick.js), and two the
 * owner asked for that answer the craft, the way round he settled on
 * 2026-10-19 after the first build had them the other way: "If you fly
 * close say thankyou line, if you hit him exlaim the catfish line". Close
 * is within NEAR_R of him and he thanks you, smiling; a hit is the craft
 * inside his body (HIT_R round his axis, from his feet to the top of his
 * head) and he shouts "Holy Catfish!". Each goes off once as the craft
 * arrives and not again until it has gone away (REARM_NEAR, REARM_HIT),
 * a hit's shout is not talked over by the thanks, and while one is up it
 * is what the balloon says. Every balloon comes from him, over his head:
 * the answers were pinned in front of the camera for a day, and the owner
 * asked on 2026-10-19 for "nicks speach bubbles should only come from
 * nick's character". He is still not solid: the craft
 * flies through him, and what he says is all a hit does.
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
import { drawWord, wordWidth, INK, PAPER, INKS } from '../../ui/lettering.js';
import { FRAME, UMBRELLA, PERGOLA, DEP } from './house.js';
import { NICK_LINES, BONE, nickAt, nickPose } from './nick.js';

/* ------------------------------------------------------------------ */
/* The atlas                                                           */
/* ------------------------------------------------------------------ */

const ATLAS_URL = new URL('../../../assets/house/nick-manga.webp', import.meta.url).href;
const AW = 2048;
const AH = 1024;
/* Pixels to a real metre: his stride view is laid about 515 px from
 * crown to sole, 1.8 m. */
const PX_M = 515 / 1.8;
/*
 * The pieces, [x, y, w, h] px in the atlas, and their joints in the
 * piece's own pixels: the body from the hips up with the hip it turns
 * about, and each leg's thigh (hip to knee), shin (knee to ankle) and
 * shoe (the ankle), drawn standing straight, near and far.
 */
const TORSO = { rect: [0, 0, 292, 364], hip: [145, 322] };
const THIGH = [{ rect: [300, 0, 59, 167], at: [29, 30] }, { rect: [526, 0, 59, 167], at: [29, 30] }];
const SHIN = [{ rect: [367, 0, 52, 128], at: [27, 24] }, { rect: [593, 0, 52, 128], at: [27, 24] }];
const SHOE = [{ rect: [427, 0, 91, 51], at: [65, 23] }, { rect: [653, 0, 91, 51], at: [65, 23] }];
/* The leg in real metres, as the render draws it: hip to knee, knee to
 * ankle, ankle to sole. */
const THIGH_M = 110 / PX_M;
const SHIN_M = 105 / PX_M;
const SOLE_M = 26 / PX_M;
const LEG_M = THIGH_M + SHIN_M + SOLE_M;
/* The skeleton's hip under its pelvis, and its leg (./nick.js). */
const HIP_DROP = 0.04;
const PELVIS_STAND = 0.96;
/* The draw order, back to front, and the step between layers, real
 * metres: far shoe, shin, thigh, near shoe, shin, thigh, body. */
const LAYER = 0.004;
/* A walking shoe tips with its shin by this much, toe down behind him and
 * toe up in front; a stood or seated one is flat. */
const SHOE_TIP = 0.35;
/* Seated, the far foot a little behind the near one, so two legs read. */
const FAR_BACK = 0.05;
/* His faces, [x, y, w, h] px in the atlas: laughing, frowning, crying,
 * shouting, sad, smiling, packed in that order. */
const FACES = [
  [36, 611, 267, 355], [378, 614, 263, 350], [718, 614, 264, 350],
  [1056, 611, 267, 355], [1396, 612, 268, 354], [1737, 612, 265, 354],
];
const FACE = { laugh: 0, frown: 1, cry: 2, shout: 3, sad: 4, smile: 5 };

/* ------------------------------------------------------------------ */
/* What he says                                                        */
/* ------------------------------------------------------------------ */

/* His clock's lines, NICK_LINES' order, with the face and the letters'
 * colour for each: the catfish shouted in amber, the rest round the
 * shell's inks. */
const SAYS = [
  { face: FACE.shout, fill: '#ffd45c' },
  { face: FACE.laugh, fill: INKS.bail },
  { face: FACE.smile, fill: INKS.mint },
  { face: FACE.frown, fill: INKS.sky },
].map((s, i) => ({ ...s, text: NICK_LINES[i].text }));
/* The two that answer the craft. */
const CATFISH = { text: NICK_LINES[0].text, face: FACE.shout, fill: '#ffd45c', ms: 2200 };
const THANKS = { text: 'I appreciate your time and thanks for watching!', face: FACE.smile, fill: INKS.mint, ms: 3800 };
/* Real metres: close, a hit, and how far the craft has to go before each
 * can go off again. HIT_R is his body's half width and the craft's. */
const NEAR_R = 1.5;
const HIT_R = 0.32;
const REARM_NEAR = 2.6;
const REARM_HIT = 0.9;

/* ------------------------------------------------------------------ */
/* The balloon                                                         */
/* ------------------------------------------------------------------ */

const BW = 640;
const BH = 256;
/* The balloon in real metres, and where its tail's tip is on it. */
const BALLOON_W = 1.625;
const BALLOON_H = 0.65;
const TIP = [318, 250];
/* The top of the pergola's rafters, real metres. */
const RAFTERS = PERGOLA.h + 0.36;
/* The face's round panel and the words' box. */
const FACE_AT = [112, 120, 100];
const TEXT_X = 412;
const TEXT_Y = 108;
const TEXT_W = 350;

function balloonShape(ctx) {
  ctx.beginPath();
  ctx.ellipse(400, 108, 226, 96, 0, 0, Math.PI * 2);
  ctx.moveTo(338, 192);
  ctx.lineTo(TIP[0], TIP[1]);
  ctx.lineTo(392, 200);
  ctx.closePath();
}

/* The space between words, as a fraction of the size: the lettering's own
 * space closes up under its slant and outline. */
const GAP = 0.32;

function rowWidth(ctx, row, px) {
  const words = row.split(' ');
  return words.reduce((w, word) => w + wordWidth(ctx, word, px), 0) + GAP * px * (words.length - 1);
}

/* The rows a line is lettered in, and the size: as few rows as will go at
 * a readable size, split where they are most even, up to three. */
const ROW_PX = [80, 58, 44];
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
      const pick = { rows, px: size };
      if (!best || size > best.px * 1.08) {
        best = pick;
      }
    }
    if (best && best.px >= ROW_PX[n - 1] * 0.8) {
      break;
    }
  }
  return best;
}

function paintBalloon(canvas, say, atlas) {
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
  /* His face in a round panel over the balloon's left end, inked round. */
  const [cx, cy, r] = FACE_AT;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 14;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.fill();
  if (atlas) {
    const [fx, fy, fw, fh] = FACES[say.face];
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
    ctx.clip();
    /* The head fills the panel; the panel's middle is about his eyes. */
    const k = (2.3 * r) / fw;
    ctx.drawImage(atlas, fx, fy, fw, fh, cx - (fw * k) / 2, cy - fh * k * 0.42, fw * k, fh * k);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* The cut out                                                         */
/* ------------------------------------------------------------------ */

/* The seven pieces in draw order, each with its atlas window and the
 * joint (px in the piece) it turns about. */
const PIECES = [SHOE[1], SHIN[1], THIGH[1], SHOE[0], SHIN[0], THIGH[0], { rect: TORSO.rect, at: TORSO.hip }];

/* Seven quads, four corners each, their texture windows fixed; the
 * corners are written by posePiece every frame. */
function cutOutGeometry() {
  const n = PIECES.length;
  const pos = new Float32Array(n * 4 * 3);
  const uv = new Float32Array(n * 4 * 2);
  const index = [];
  PIECES.forEach((p, i) => {
    const [x, y, w, h] = p.rect;
    const u0 = x / AW;
    const u1 = (x + w) / AW;
    const v0 = 1 - (y + h) / AH;
    const v1 = 1 - y / AH;
    uv.set([u0, v1, u1, v1, u0, v0, u1, v0], i * 8);
    const k = i * 4;
    index.push(k, k + 2, k + 1, k + 2, k + 3, k + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.4);
  return g;
}

/* Piece i with its joint at (jx, jy), real metres in the cut out's plane
 * (x behind him, y up), turned counterclockwise by `a` as drawn, facing
 * left: a positive `a` swings a piece that hangs down behind him and leans
 * one that stands up forward. */
function posePiece(pos, i, jx, jy, a) {
  const [, , w, h] = PIECES[i].rect;
  const [ax, ay] = PIECES[i].at;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const x0 = -ax / PX_M;
  const x1 = (w - ax) / PX_M;
  const y0 = (ay - h) / PX_M;
  const y1 = ay / PX_M;
  const z = i * LAYER;
  const o = i * 12;
  const corner = (k, x, y) => {
    pos[o + k * 3] = jx + x * c - y * sn;
    pos[o + k * 3 + 1] = jy + x * sn + y * c;
    pos[o + k * 3 + 2] = z;
  };
  corner(0, x0, y1);
  corner(1, x1, y1);
  corner(2, x0, y0);
  corner(3, x1, y0);
}

/*
 * A leg's thigh and shin angles (radians from hanging straight down,
 * positive behind him) with the ankle at (tx, ty) from the hip, the knee
 * bent forward, into out[0] and out[1].
 */
function reach(tx, ty, out) {
  const d = Math.min(Math.hypot(tx, ty), THIGH_M + SHIN_M - 1e-4);
  const base = Math.atan2(tx, -ty);
  const cosA = (THIGH_M * THIGH_M + d * d - SHIN_M * SHIN_M) / (2 * THIGH_M * d);
  const t = base - Math.acos(Math.max(-1, Math.min(1, cosA)));
  const kx = THIGH_M * Math.sin(t);
  const ky = -THIGH_M * Math.cos(t);
  out[0] = t;
  out[1] = Math.atan2(tx - kx, -(ty - ky));
  return out;
}

/* ------------------------------------------------------------------ */
/* Nick                                                                */
/* ------------------------------------------------------------------ */

/*
 * Nick for a map: `group` goes in the map's scene (whose dispose frees it,
 * textures and all), update(step) is called with the clock the map's
 * updateAnim is handed, stats() is for the harness. `craftAt` answers
 * where the drawn craft is, in the world, or null.
 *
 * HIS CLOCK. The clock the shell hands a map is the title's, or the run's
 * (which starts again at every run and stands still on the pads and in the
 * pause menu), or the finish's. His own clock adds up its forward steps and
 * lets a step back or a leap of more than a second go by as nothing, so a
 * new run, the title, a crash's reset or a mode change never moves him: he
 * is where he was, and a pause holds him. A harness can hold him at a time
 * of its own with `group.userData.holdMs` (scripts/ only); what he says to
 * the craft keeps its own time, so a held Nick still answers it, and
 * `group.userData.craftAt`, a world { x, y, z }, stands in for the craft.
 */
export function makeNick(camera, craftAt = () => null) {
  const { OX, OZ, S } = FRAME;
  const atlas = new THREE.TextureLoader().load(ATLAS_URL, () => {
    mesh.visible = true;
    painted = null;
  });
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  const cut = cutOutGeometry();
  const corners = cut.attributes.position;
  const mesh = new THREE.Mesh(cut, new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, fog: false }));
  mesh.name = 'nick';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  /* Shown when the atlas has come, so he is never a dark cut out. */
  mesh.visible = false;

  const canvas = document.createElement('canvas');
  canvas.width = BW;
  canvas.height = BH;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const bcard = new THREE.PlaneGeometry(BALLOON_W, BALLOON_H);
  bcard.translate(-BALLOON_W * (TIP[0] / BW - 0.5), BALLOON_H * (0.5 - (1 - TIP[1] / BH)), 0);
  const balloon = new THREE.Mesh(bcard, new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, fog: false }));
  balloon.name = 'nick balloon';
  balloon.castShadow = false;
  balloon.receiveShadow = false;
  /* Painted now, so its texture is whole from the start, and again when
   * the atlas has come and the face can go in. Hidden, it is still
   * warmed: three's compile walks every material in the scene, shown or
   * not. */
  let painted = SAYS[0];
  paintBalloon(canvas, painted, null);
  balloon.visible = false;

  const group = new THREE.Group();
  group.name = 'nick';
  group.add(mesh, balloon);

  const pose = nickPose();
  const eye = { x: 0, y: 0, h: 0 };
  const top = new THREE.Vector3();
  let clock = 0;
  let last = null;
  const legs = [[0, 0], [0, 0]];
  const ik = [0, 0];
  let seated = false;
  let mirrored = false;
  /* What he is saying to the craft, if anything, and for how long yet. */
  let react = null;
  let reactAge = 0;
  let armNear = true;
  let armHit = true;
  let hits = 0;
  let closes = 0;

  /*
   * The cut out posed: the body on the hip, leaned as the skeleton's spine
   * is, and each leg from the skeleton's thigh and knee, `near` the leg on
   * the camera's side. Outside a walk the ankle is brought to the floor
   * where the skeleton puts it forward, so a seated or rising Nick stands
   * on the floor with the render's shorter leg; walking, the skeleton's
   * own stride is drawn as it is.
   */
  function poseCutOut(near) {
    const J = pose.J;
    const sit = pose.sit;
    const hipY = pose.pelvisH - HIP_DROP - (PELVIS_STAND - HIP_DROP - LEG_M) * (1 - sit);
    const plant = 1 - pose.walk;
    for (let k = 0; k < 2; k += 1) {
      const b = (k === 0) === near ? BONE.thighL : BONE.thighR;
      const t = J[b * 3];
      const s = t + J[(b + 1) * 3];
      const kx = THIGH_M * Math.sin(t);
      const ky = -THIGH_M * Math.cos(t);
      let ax = kx + SHIN_M * Math.sin(s);
      let ay = ky - SHIN_M * Math.cos(s);
      if (k === 1) {
        ax += FAR_BACK * sit;
      }
      const floor = pose.floor + SOLE_M - hipY;
      ay += (floor - ay) * plant;
      reach(ax, ay, ik);
      legs[k][0] = ik[0];
      legs[k][1] = ik[1];
    }
    const pos = corners.array;
    /* Far, then near: shoe, shin, thigh, at layers 0 to 5. */
    for (let k = 1; k >= 0; k -= 1) {
      const [t, s] = legs[k];
      const kx = THIGH_M * Math.sin(t);
      const ky = hipY - THIGH_M * Math.cos(t);
      const ax = kx + SHIN_M * Math.sin(s);
      const ay = ky - SHIN_M * Math.cos(s);
      const i = (1 - k) * 3;
      posePiece(pos, i, ax, ay, SHOE_TIP * s * pose.walk);
      posePiece(pos, i + 1, kx, ky, s);
      posePiece(pos, i + 2, 0, hipY, t);
    }
    posePiece(pos, 6, 0, hipY, J[BONE.spine * 3]);
    corners.needsUpdate = true;
    cut.boundingSphere.center.set(0, hipY + 0.2, 0);
  }

  /* The craft against him, in real metres: a hit, close, or neither, and
   * the arming of each again once it has gone far enough. */
  function answer(d) {
    if (react) {
      reactAge += d;
      if (reactAge >= react.ms) {
        react = null;
      }
    }
    const q = group.userData.craftAt || craftAt();
    if (!q) {
      return;
    }
    const dx = (q.x - OX) / S - pose.x;
    const dy = (OZ - q.z) / S - pose.y;
    const r = Math.hypot(dx, dy);
    const head = seated ? pose.pelvisH + (1.8 - PELVIS_STAND) : pose.floor + 1.8;
    const h = q.y / S;
    const above = Math.max(0, h - head, pose.floor - h);
    const dist = Math.hypot(r, above);
    if (r > REARM_HIT || above > 0.3) {
      armHit = true;
    }
    if (dist > REARM_NEAR) {
      armNear = true;
    }
    if (armHit && r < HIT_R && above === 0) {
      react = CATFISH;
      reactAge = 0;
      armHit = false;
      armNear = false;
      hits += 1;
    } else if (armNear && dist < NEAR_R && react !== CATFISH) {
      react = THANKS;
      reactAge = 0;
      armNear = false;
      closes += 1;
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
    nickAt(clock, eye, pose);
    seated = pose.sit > 0.5;
    answer(d);

    /* The cut out: posed, stood at his place, turned to the camera about
     * his own axis, and mirrored when he faces right. Facing left it shows
     * his left side, so the left leg is the near one. */
    const x = OX + S * pose.x;
    const z = OZ - S * pose.y;
    const yaw = Math.atan2(cam.x - x, cam.z - z);
    const side = Math.sin(pose.yaw) * Math.cos(yaw) - Math.cos(pose.yaw) * Math.sin(yaw);
    if (Math.abs(side) > 0.15) {
      mirrored = side > 0;
    }
    poseCutOut(!mirrored);
    mesh.scale.set(mirrored ? -S : S, S, S);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = yaw;

    const say = react || (pose.line >= 0 ? SAYS[pose.line] : null);
    top.set(x, S * (pose.floor + 1), z);
    const dist = cam.distanceTo(top);
    if (!say || dist > 150) {
      balloon.visible = false;
      return;
    }
    if (say !== painted) {
      paintBalloon(canvas, say, atlas.image || null);
      texture.needsUpdate = true;
      painted = say;
    }
    balloon.visible = true;
    const age = react ? reactAge : pose.lineAge;
    const dur = react ? react.ms : pose.lineDur;
    const pop = (0.65 + 0.35 * Math.min(1, age / 160)) * (1 - 0.6 * Math.max(0, (age - dur + 150) / 150));
    /* Over his head, a little higher outdoors than under a ceiling; and
     * over the umbrella when he is under it and the camera is above it,
     * where the canopy would hide it, and over the rafters when the camera
     * is above those, where the beam would. */
    const head = seated ? pose.pelvisH + (1.8 - PELVIS_STAND) : pose.floor + 1.8;
    top.set(x, S * (head + (pose.indoors ? 0.04 : 0.1)), z);
    if (!pose.indoors && eye.h > RAFTERS && pose.x > PERGOLA.x0 - 0.3 && pose.x < PERGOLA.x1 + 0.3 && pose.y > DEP && pose.y < PERGOLA.y1 + 0.5) {
      top.y = S * (RAFTERS + 0.05);
    } else if (pose.cover && eye.h > UMBRELLA.h0) {
      top.y = S * (UMBRELLA.h0 + UMBRELLA.h + 0.05);
    }
    balloon.position.copy(top);
    balloon.quaternion.copy(camera.quaternion);
    const far = Math.min(3, Math.max(1, dist / 20));
    balloon.scale.setScalar(S * (pose.indoors ? 0.75 : 1) * far * pop);
  }
  update(0);

  return {
    group,
    update,
    stats: () => ({
      clockMs: clock,
      state: pose.state,
      at: [Math.round(pose.x * 100) / 100, Math.round(pose.y * 100) / 100],
      line: react ? react.text : (pose.line >= 0 ? NICK_LINES[pose.line].text : null),
      answering: react === CATFISH ? 'hit' : (react === THANKS ? 'close' : null),
      hits,
      closes,
      legs: legs.map(([t, sh]) => [Math.round(t * 100) / 100, Math.round(sh * 100) / 100]),
      seated,
      mirrored,
      ready: mesh.visible,
    }),
  };
}
