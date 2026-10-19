/*
 * nickdraw.js: Nick Burns drawn, a model of him and his speech balloon,
 * posed every frame from ./nick.js.
 *
 * HOW HE LOOKS. The owner's ask of 2026-10-18: "Attached is manga render of
 * nick, let's use this rather than the poly character." He was a paper cut
 * out of that render for a day, posed by the skeleton; the owner gave a
 * second sheet on 2026-10-19 nearer him ("lets use this") and, having flown
 * past the cut out, asked for him in the round: "its timee to go to town to
 * build nice as a 3d model using the asseets you have as inspriation ...
 * you got htis go hard". So he is a model again, built from that sheet
 * when the map is (./nickmodel.js says how): his head shaped to the
 * render's faces and wearing them, his body in its clothes. He is 1.9 m in
 * real metres to the top of his hair, his head drawn about 1.3 times a real
 * one, as the render draws it, so his face reads from across the yard.
 *
 * HIS FACE is one of the render's six, chosen by what he is doing: smiling
 * as he goes about, and the face that goes with a line while he says it
 * (SAYS), the same one the balloon shows. A line said smiling or laughing
 * flips between the two about three times a second, so he talks.
 *
 * ONE DRAW CALL for him, and one for his balloon while it is up. His
 * material is the map's own cel() over his vertex colours and the atlas
 * ./nickmodel.js paints from the render, so he is lit and inked as the
 * house is. Each vertex belongs to one bone and is moved by its bone's
 * transform on the CPU (about 7,900 of them, only the bones that moved and
 * only while he is in view or near it), so the ink and the comic layer see
 * the pose that is drawn without a skinning program of their own. He casts
 * no shadow and takes none, lit like a character in a panel, as the cut
 * out was: the sun's shadow map covers the whole plot, so a shadow would
 * draw him once more in every view, seen or not, one more draw call
 * everywhere, and that is the owner's call to make (the latency rule).
 *
 * THE BALLOON is a card that faces the camera, lettered in the simulator's
 * own hand (src/ui/lettering.js) on a 640 by 256 canvas that is painted
 * again only when what he says changes, with the face that goes with the
 * line in a round panel at its left, cut from the render's sheet. It grows
 * with distance past twenty metres, so it can be read across the yard, and
 * goes with him behind a wall, since it is depth tested like anything
 * else. Its alpha is tested, not blended, so its outline is a real
 * silhouette and the map's ink draws round it.
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
 * nick's character". He is still not solid: the craft flies through him,
 * and what he says is all a hit does.
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
import { FRAME, UMBRELLA, PERGOLA, DEP } from './house.js';
import { BONES, BONE, NICK_LINES, HEAD_TOP, nickAt, nickBones, nickPose } from './nick.js';
import { AW, AH, FACES, FACE, nickModel, paintNickAtlas } from './nickmodel.js';

/* The render's sheet (NOTICE): his six faces, which his model wears and
 * his balloon shows. */
const SHEET_URL = new URL('../../../assets/house/nick-manga.webp', import.meta.url).href;

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

function paintBalloon(canvas, say, sheet) {
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
  if (sheet) {
    const [fx, fy, fw, fh] = FACES[say.face];
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
    ctx.clip();
    /* The head fills the panel; the panel's middle is about his eyes. */
    const k = (2.3 * r) / fw;
    ctx.drawImage(sheet, fx, fy, fw, fh, cx - (fw * k) / 2, cy - fh * k * 0.42, fw * k, fh * k);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Nick                                                                */
/* ------------------------------------------------------------------ */

/* World metres within which he is moved even out of the view. */
const NEAR_SKIN = 12;
/* A line said smiling or laughing flips between those two faces, his
 * mouth shut and open, every TALK_MS of the line, and holds its own face
 * for its last TALK_HOLD. */
const TALK_MS = 170;
const TALK_HOLD = 250;
const FACE_NAMES = Object.fromEntries(Object.entries(FACE).map(([k, v]) => [v, k]));

/* A bone's matrix that has not changed since its run was last moved. */
function same(M, L, o) {
  for (let k = 0; k < 12; k += 1) {
    if (M[o + k] !== L[o + k]) {
      return false;
    }
  }
  return true;
}

/* Ranges not yet sent (moved near him but drawn in no pass) would pile up;
 * past a handful they become the one span that covers them. */
function span(attr) {
  const r = attr.updateRanges;
  let lo = Infinity;
  let hi = 0;
  for (const g of r) {
    lo = Math.min(lo, g.start);
    hi = Math.max(hi, g.start + g.count);
  }
  attr.clearUpdateRanges();
  attr.addUpdateRange(lo, hi - lo);
}

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
  const model = nickModel();
  const geometry = model.geometry;
  const posAttr = geometry.attributes.position;
  const norAttr = geometry.attributes.normal;
  const uvAttr = geometry.attributes.uv;

  /* His atlas, painted once with his hair and skin and again when the
   * render's sheet has come with his faces; he is shown from then, so he
   * is never faceless. */
  const skinCanvas = document.createElement('canvas');
  skinCanvas.width = AW;
  skinCanvas.height = AH;
  paintNickAtlas(skinCanvas, null);
  const skinMap = new THREE.CanvasTexture(skinCanvas);
  skinMap.colorSpace = THREE.SRGBColorSpace;
  skinMap.anisotropy = 4;
  let sheet = null;
  new THREE.ImageLoader().load(SHEET_URL, (img) => {
    sheet = img;
    paintNickAtlas(skinCanvas, img);
    skinMap.needsUpdate = true;
    mesh.visible = true;
    painted = null;
  }, undefined, () => {
    /* No sheet: he still walks, a head of hair and skin with no face. */
    mesh.visible = true;
  });
  /* Banded high, so the shade across his face is a step and not a mask. */
  const material = cel({ color: 0xffffff, map: skinMap, vertexColors: true, bands: 'soft3', tint: 0x8a7c96, cache: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'nick';
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
  balloon.name = 'nick balloon';
  balloon.castShadow = false;
  balloon.receiveShadow = false;
  /* Painted now, so its texture is whole from the start, and again when
   * the sheet has come and the face can go in. Hidden, it is still
   * warmed: three's compile walks every material in the scene, shown or
   * not. */
  let painted = SAYS[0];
  paintBalloon(canvas, painted, null);
  balloon.visible = false;

  const group = new THREE.Group();
  group.name = 'nick';
  group.add(mesh, balloon);

  const NB = BONES.length;
  const pose = nickPose();
  const M = new Float64Array(NB * 12);
  /* Each bone's matrix as it was last moved; NaN moves every bone the
   * first time. */
  const L = new Float64Array(NB * 12).fill(NaN);
  const eye = { x: 0, y: 0, h: 0 };
  const frustum = new THREE.Frustum();
  const pm = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const top = new THREE.Vector3();
  let clock = 0;
  let last = null;
  let seated = false;
  let skinnedAt = null;
  let skins = 0;
  let lastMoved = 0;
  let face = 0;
  /* What he is saying to the craft, if anything, and for how long yet. */
  let react = null;
  let reactAge = 0;
  let armNear = true;
  let armHit = true;
  let hits = 0;
  let closes = 0;

  /* Bone by bone, each bone's matrix in locals, and only the bones whose
   * matrix changed since they were last moved: seated, his legs hold still
   * while he talks. Only the runs that moved go to the GPU. */
  function skin() {
    const out = posAttr.array;
    const outN = norAttr.array;
    const rp = model.rest;
    const rn = model.restN;
    const run = model.start;
    let from = -1;
    let moved = 0;
    for (let b = 0; b <= NB; b += 1) {
      const dirty = b < NB && run[b + 1] > run[b] && !same(M, L, b * 12);
      if (dirty) {
        const o = b * 12;
        for (let k = 0; k < 12; k += 1) {
          L[o + k] = M[o + k];
        }
        const m0 = M[o];
        const m1 = M[o + 1];
        const m2 = M[o + 2];
        const m3 = M[o + 3];
        const m4 = M[o + 4];
        const m5 = M[o + 5];
        const m6 = M[o + 6];
        const m7 = M[o + 7];
        const m8 = M[o + 8];
        const tx = M[o + 9];
        const ty = M[o + 10];
        const tz = M[o + 11];
        const k1 = run[b + 1] * 3;
        for (let k = run[b] * 3; k < k1; k += 3) {
          const x = rp[k];
          const y = rp[k + 1];
          const z = rp[k + 2];
          out[k] = m0 * x + m1 * y + m2 * z + tx;
          out[k + 1] = m3 * x + m4 * y + m5 * z + ty;
          out[k + 2] = m6 * x + m7 * y + m8 * z + tz;
          const a = rn[k];
          const c = rn[k + 1];
          const d = rn[k + 2];
          outN[k] = m0 * a + m1 * c + m2 * d;
          outN[k + 1] = m3 * a + m4 * c + m5 * d;
          outN[k + 2] = m6 * a + m7 * c + m8 * d;
        }
        moved += run[b + 1] - run[b];
        if (from < 0) {
          from = run[b];
        }
      } else if (from >= 0 && (b === NB || run[b + 1] > run[b])) {
        /* The end of a run of moved bones (an empty bone does not end one). */
        posAttr.addUpdateRange(from * 3, (run[b] - from) * 3);
        norAttr.addUpdateRange(from * 3, (run[b] - from) * 3);
        from = -1;
      }
    }
    if (posAttr.updateRanges.length > 4) {
      span(posAttr);
      span(norAttr);
    }
    lastMoved = moved;
    if (moved > 0) {
      posAttr.needsUpdate = true;
      norAttr.needsUpdate = true;
      skins += 1;
    }
  }

  /* His face k: the front of his head reads tile k of the atlas. */
  function setFace(k) {
    if (k === face) {
      return;
    }
    const uv = uvAttr.array;
    const du = k * model.tileU;
    for (let i = 0; i < model.face.length; i += 1) {
      uv[model.face[i] * 2] = model.faceU[i] + du;
    }
    uvAttr.needsUpdate = true;
    face = k;
  }

  /* The top of his hair in the world, into `out`, from the bones. */
  function headTop(out, over) {
    const h = BONE.head * 12;
    out.set(M[h + 9], M[h + 10] + HEAD_TOP + over, M[h + 11]);
    return mesh.localToWorld(out);
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
    const head = M[BONE.head * 12 + 10] + HEAD_TOP;
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
    nickBones(pose, M);
    seated = pose.sit > 0.5;
    answer(d);

    mesh.position.set(OX + S * pose.x, 0, OZ - S * pose.y);
    mesh.rotation.y = pose.yaw;
    mesh.updateMatrixWorld();

    /* What he says, and the face that goes with it. */
    const say = react || (pose.line >= 0 ? SAYS[pose.line] : null);
    const age = react ? reactAge : pose.lineAge;
    const dur = react ? react.ms : pose.lineDur;
    let look = FACE.smile;
    if (say) {
      look = say.face;
      if ((look === FACE.smile || look === FACE.laugh) && age < dur - TALK_HOLD && Math.floor(age / TALK_MS) % 2 === 1) {
        look = look === FACE.smile ? FACE.laugh : FACE.smile;
      }
    }
    setFace(look);

    const dist = cam.distanceTo(mesh.position);
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    sphere.center.set(mesh.position.x, mesh.position.y + S * 1.0, mesh.position.z);
    sphere.radius = S * 1.6;
    /* Moved only when he is in the view, or near enough that a fast turn
     * could bring him in before the camera's matrix catches up: with no
     * shadow, nothing else draws him. */
    const seen = dist < NEAR_SKIN || frustum.intersectsSphere(sphere);
    /* A still pose (his clock stopped and the camera too far for him to
     * look at it) is not moved again. */
    const still = skinnedAt === clock && pose.look === 0 && pose.wave === 0;
    if (seen && !still) {
      skin();
      skinnedAt = clock;
    }

    headTop(top, 0);
    if (!say || cam.distanceTo(top) > 150) {
      balloon.visible = false;
      return;
    }
    if (say !== painted) {
      paintBalloon(canvas, say, sheet);
      texture.needsUpdate = true;
      painted = say;
    }
    balloon.visible = true;
    const pop = (0.65 + 0.35 * Math.min(1, age / 160)) * (1 - 0.6 * Math.max(0, (age - dur + 150) / 150));
    /* Over his head, a little higher outdoors than under a ceiling; and
     * over the umbrella when he is under it and the camera is above it,
     * where the canopy would hide it, and over the rafters when the camera
     * is above those, where the beam would. */
    headTop(top, pose.indoors ? 0.02 : 0.08);
    if (!pose.indoors && eye.h > RAFTERS && pose.x > PERGOLA.x0 - 0.3 && pose.x < PERGOLA.x1 + 0.3 && pose.y > DEP && pose.y < PERGOLA.y1 + 0.5) {
      top.y = S * (RAFTERS + 0.05);
    } else if (pose.cover && eye.h > UMBRELLA.h0) {
      top.y = S * (UMBRELLA.h0 + UMBRELLA.h + 0.05);
    }
    balloon.position.copy(top);
    balloon.quaternion.copy(camera.quaternion);
    const far = Math.min(3, Math.max(1, cam.distanceTo(top) / 20));
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
      line: react ? react.text : (pose.line >= 0 ? NICK_LINES[pose.line].text : null),
      answering: react === CATFISH ? 'hit' : (react === THANKS ? 'close' : null),
      face: FACE_NAMES[face],
      hits,
      closes,
      seated,
      looking: pose.look > 0,
      waving: pose.wave > 0,
      skins,
      moved: lastMoved,
      vertices: posAttr.count,
      triangles: geometry.index.count / 3,
      ready: mesh.visible,
    }),
  };
}
