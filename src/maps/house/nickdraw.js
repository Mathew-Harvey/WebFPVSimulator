/*
 * nickdraw.js: Nick Burns drawn, the owner's manga render of him and his
 * speech balloon, posed every frame from ./nick.js.
 *
 * HOW HE LOOKS. The owner's ask of 2026-10-18: "Attached is manga render of
 * nick, let's use this rather than the poly character." The render is a
 * sheet of seven side views of him walking and six of his face, which the
 * owner made and gave; the grey it was drawn on is keyed out and the frames
 * packed into one atlas, ../../../assets/house/nick-manga.webp (NOTICE). He
 * is a card standing upright that turns about its own axis to face the
 * camera, the way a cut out in a panel does, drawn in the render's own
 * colour and ink and unlit, so the map's light does not shade him twice.
 * The frames face left, so the card is mirrored whenever the way he faces
 * points to the right of the screen. Walking, the frames run through his
 * stride; standing, he holds the middle one. Seated, at the patio table or
 * on the sofa, he is the same frame from the hips up with the hips on the
 * seat, which is what the table, the sofa's back or the chair hides of a
 * man sitting anyway. He is 1.8 m in real metres, 5.4 m in the house's
 * world, his size next to a door.
 *
 * ONE DRAW CALL for him and one for his balloon while it is up, both the
 * same program (a texture, alpha tested, no fog). No skinning and no
 * shadow: the card is four vertices whose texture window moves.
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
 * owner asked for on 2026-10-18 that answer the craft: "When I fly too
 * close to nick he should exclaim, holy catfish, or if I hit him say I
 * appreciate your time and thanks for watching". Close is within NEAR_R of
 * him; a hit is the craft inside his body (HIT_R round his axis, from his
 * feet to the top of his head). Each goes off once as the craft arrives and
 * not again until it has gone away (REARM_NEAR, REARM_HIT), and while one
 * is up it is what the balloon says. He is still not solid: the craft
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
import { NICK_LINES, nickAt, nickPose } from './nick.js';

/* ------------------------------------------------------------------ */
/* The atlas                                                           */
/* ------------------------------------------------------------------ */

const ATLAS_URL = new URL('../../../assets/house/nick-manga.webp', import.meta.url).href;
const AW = 2048;
const AH = 1024;
/* The walk: seven cells side by side, CELL_W px wide, his head over each
 * cell's middle and his soles on SOLE_Y. The card shows a cell from
 * CELL_TOP to CELL_BOT. */
const WALK_FRAMES = 7;
const CELL_W = 292;
const CELL_TOP = 24;
const CELL_BOT = 560;
const SOLE_Y = 552;
/* Pixels to a real metre: his 1.8 m are about 515 px of the render. */
const PX_M = 515 / 1.8;
/* Seated, the cell is cut SIT_CUT px down, just under his hips, which is
 * SIT_DROP under the pelvis's height in a standing frame. */
const SIT_CUT = 300;
const PELVIS_STAND = 0.96;
const SIT_DROP = PELVIS_STAND - (SOLE_Y - SIT_CUT) / PX_M;
/* The frame he stands still in. */
const STILL = 3;
/* His faces, [x, y, w, h] px in the atlas: laughing, frowning, crying,
 * shouting, sad, smiling, in the render's order. */
const FACES = [
  [26, 596, 287, 386], [365, 598, 289, 381], [707, 597, 285, 384],
  [1052, 595, 276, 387], [1389, 596, 282, 386], [1722, 597, 296, 383],
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
const THANKS = { text: 'I appreciate your time and thanks for watching!', face: FACE.sad, fill: INKS.mint, ms: 3800 };
/* Real metres: close, a hit, and how far the craft has to go before each
 * can go off again. HIT_R is his body's half width and the craft's. */
const NEAR_R = 1.5;
const HIT_R = 0.32;
const REARM_NEAR = 2.6;
const REARM_HIT = 0.9;
/* Pinned, the balloon is PIN_D in front of the camera (world metres, well
 * inside anything the near plane keeps), PIN_W of the picture's width,
 * its tail's tip PIN_UP of the picture's height over the middle. */
const PIN_D = 0.5;
const PIN_W = 0.34;
const PIN_UP = 0.1;

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
  const card = new THREE.PlaneGeometry(1, 1);
  card.translate(0, 0.5, 0);
  const mesh = new THREE.Mesh(card, new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, fog: false }));
  mesh.name = 'nick';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  /* Shown when the atlas has come, so he is never a dark card. */
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
  let frame = STILL;
  let seated = false;
  let mirrored = false;
  /* What he is saying to the craft, if anything, and for how long yet. */
  let react = null;
  let reactAge = 0;
  let armNear = true;
  let armHit = true;
  let hits = 0;
  let shouts = 0;

  /* The atlas window the card shows: walk cell `f`, whole or from the hips
   * up. */
  function showCell(f, sit) {
    const y1 = sit ? SIT_CUT : CELL_BOT;
    atlas.repeat.set(CELL_W / AW, (y1 - CELL_TOP) / AH);
    atlas.offset.set((f * CELL_W) / AW, 1 - y1 / AH);
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
      react = THANKS;
      reactAge = 0;
      armHit = false;
      armNear = false;
      hits += 1;
    } else if (armNear && dist < NEAR_R && react !== THANKS) {
      react = CATFISH;
      reactAge = 0;
      armNear = false;
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
    nickAt(clock, eye, pose);
    seated = pose.sit > 0.5;
    answer(d);

    /* The card: stood on his floor, or seated on his hips, turned to the
     * camera about its own axis, and mirrored when he faces right. */
    const x = OX + S * pose.x;
    const z = OZ - S * pose.y;
    const yaw = Math.atan2(cam.x - x, cam.z - z);
    const side = Math.sin(pose.yaw) * Math.cos(yaw) - Math.cos(pose.yaw) * Math.sin(yaw);
    if (Math.abs(side) > 0.15) {
      mirrored = side > 0;
    }
    if (pose.walk > 0.05) {
      const u = pose.stride / (2 * Math.PI);
      frame = Math.floor((u - Math.floor(u)) * WALK_FRAMES) % WALK_FRAMES;
    } else {
      frame = STILL;
    }
    showCell(frame, seated);
    const w = S * (CELL_W / PX_M);
    if (seated) {
      mesh.scale.set(mirrored ? -w : w, S * ((SIT_CUT - CELL_TOP) / PX_M), 1);
      mesh.position.set(x, S * (pose.pelvisH - SIT_DROP), z);
    } else {
      const bob = 0.025 * pose.walk * Math.abs(Math.sin(pose.stride));
      mesh.scale.set(mirrored ? -w : w, S * ((CELL_BOT - CELL_TOP) / PX_M), 1);
      mesh.position.set(x, S * (pose.floor - (CELL_BOT - SOLE_Y) / PX_M + bob), z);
    }
    mesh.rotation.y = yaw;

    const say = react || (pose.line >= 0 ? SAYS[pose.line] : null);
    const dist = cam.distanceTo(mesh.position);
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
    const pinned = react !== null;
    if (balloon.material.depthTest === pinned) {
      /* It still writes its depth, so the map's ink, which reads depth,
       * draws round it and not the room's edges across it. */
      balloon.material.depthTest = !pinned;
      balloon.renderOrder = pinned ? 10 : 0;
    }
    if (pinned) {
      /* An answer to the craft is pinned in front of the camera, high in
       * the picture, over whatever is there: the craft that set it off is
       * in him or beside him, where a balloon over his head is out of
       * sight above or already behind it. */
      const h = 2 * PIN_D * Math.tan((camera.fov * Math.PI) / 360);
      top.set(0, PIN_UP * h, -PIN_D).applyQuaternion(camera.quaternion).add(cam);
      balloon.position.copy(top);
      balloon.quaternion.copy(camera.quaternion);
      balloon.scale.setScalar(((PIN_W * h * camera.aspect) / BALLOON_W) * pop);
      return;
    }
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
      answering: react === THANKS ? 'hit' : (react === CATFISH ? 'close' : null),
      hits,
      shouts,
      frame,
      seated,
      mirrored,
      ready: mesh.visible,
    }),
  };
}
