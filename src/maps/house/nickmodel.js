/*
 * nickmodel.js: Nick Burns as a model, built when his map is: a body of
 * lofted rings in his own clothes and a head shaped to the owner's manga
 * render of him and wearing its faces, for ./nickdraw.js to pose.
 *
 * The owner, 2026-10-19, after flying the paper cut out: "its timee to go
 * to town to build nice as a 3d model using the asseets you have as
 * inspriation ... you got htis go hard". The assets are the second manga
 * sheet he made with Grok (NOTICE): six faces drawn straight on, all to one
 * framing, and seven side views of him walking. Nothing of the first poly
 * figure (October 18, set aside for the cut out) is reused but the way it
 * is moved.
 *
 * THE HEAD is the render's. It is a surface of rings whose outline seen
 * from the front is the faces' own outline, row by row (FACE_ROWS, read off
 * the smiling face with a grid over it, the ears left off), and whose
 * profile is the walk view's: the forehead, the nose, the lips and the
 * chin in front, the hair's depth behind. It wears three pictures, each
 * on the part of it that faces the way the picture was drawn from, as a
 * slide is projected on a screen. The front wears a face, straight on, so
 * from the front it is that face exactly: the glasses, the stubble, the
 * grey at the temples, the expression, all the render's. Each side wears
 * the head of the walk view, drawn larger (SIDE), so in profile it is the
 * render's profile: the ear, the arm of the glasses, the hair swept back.
 * The back wears the back of his head, painted when the map is built
 * (paintBack): his salt and pepper hair down to the nape. Where two
 * pictures meet, each side of the line keeps its own copy of the vertex,
 * so no triangle smears one picture across another, and both copies share
 * one normal, so the shading does not show the line. The nose stands out
 * of the face (NOSE), so it has a profile, and the ears are made, wearing
 * the walk view's ear. His head is drawn about 1.3 times a real one, as
 * the render draws it, so a quad across the yard can read his face; the
 * top of his hair is HEAD_TOP over the head bone, which ./nick.js says.
 *
 * His faces are the six the render drew, packed into one row of the atlas
 * at one framing. ./nickdraw.js picks one by moving the front's texture
 * coordinates along the row (setFace), which touches a few hundred
 * numbers and only when the face changes.
 *
 * THE BODY, from the walk view and the pieces the sheet was cut into: a
 * royal blue crew neck tee with short sleeves, hemmed, worn out over dark
 * jeans with their seams, back pockets and a rolled cuff; red low top
 * sneakers with white soles and white laces; a black watch on his left
 * wrist; his hands loose, thumbs forward. Every part is a loft of rings
 * whose sizes are written out below in real metres, smooth enough that the
 * map's ink (which draws where the surface folds) draws his outline and
 * not his facets.
 *
 * Every vertex belongs to one bone (BONES in ./nick.js) and moves with it
 * alone. A bone that turns about a joint far enough to open a gap carries
 * a ball there whose middle is the joint itself, which no turn about that
 * joint moves: the shoulders, elbows, hips and knees. So he is skinned on
 * the CPU by bone, as before, with no weights to blend, and the ink, the
 * shadow and the comic layer all see the pose that is drawn.
 *
 * Render only. Nothing here reaches the physics.
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
import { BONES, BONE } from './nick.js';

/* ------------------------------------------------------------------ */
/* The faces                                                           */
/* ------------------------------------------------------------------ */

/* His faces in ../../../assets/house/nick-manga.webp, [x, y, w, h] px:
 * laughing, frowning, crying, shouting, sad, smiling, packed in that
 * order. Each is drawn to the same framing: the crown at its top edge, his
 * middle at half its width. */
export const FACES = [
  [36, 611, 267, 355], [378, 614, 263, 350], [718, 614, 264, 350],
  [1056, 611, 267, 355], [1396, 612, 268, 354], [1737, 612, 265, 354],
];
export const FACE = { laugh: 0, frown: 1, cry: 2, shout: 3, sad: 4, smile: 5 };

/*
 * His side, from the same sheet: the head of the walk view the cut out's
 * body was cut from, [x, y, w, h] px of the sheet, facing left, so his
 * left side as he walks; his right is the same drawing seen through the
 * other way, as a mirror shows it. The crown is at row 39 and the chin's
 * underside at SIDE_CHIN, his nose's tip at column SIDE_NOSE; KS real
 * metres of his drawn head to a pixel.
 */
const SIDE_SRC = [60, 30, 140, 110];
const SIDE_CHIN = 133;
const SIDE_NOSE = 102;
const KS = 0.3 / 94;
const NOSE_TIP = 0.181;

/*
 * The atlas his model wears, painted when the map is built
 * (paintNickAtlas): the six faces in a row of tiles, each on a ground of
 * his hair over his skin; his side drawn larger beside them; the back of
 * his head under them, painted; and a white patch that every part but his
 * head reads, so its vertex colour is its colour.
 */
export const AW = 2048;
export const AH = 512;
const TILE_W = 280;
const TILE_H = 360;
const SIDE = { x: 6 * TILE_W, y: 0, s: 2.6 };
const BACK = { x: 0, y: 368, w: 1000, h: 144 };
const WHITE = [1200, 410, 96, 80];
const WU = (WHITE[0] + WHITE[2] / 2) / AW;
const WV = 1 - (WHITE[1] + WHITE[3] / 2) / AH;

/*
 * The face's frame: K real metres of his drawn head to a pixel of a face,
 * which draws him 0.3 m from crown to chin, and the face's row Y0 that is
 * level with the head bone (the chin, row 270, is CHIN over it). The head
 * bone is the top of his spine (./nick.js), so the neck is under the chin.
 */
const K = 0.3 / 270;
const CHIN = 0.075;
const Y0 = 270 + CHIN / K;
/* How far inside a face's outline its edge is read, px: the render inks
 * its outline. */
const INSET = 7;
/* The rows under this one are his neck, painted skin over the render's
 * collar, which the model's own tee covers. */
const NECK_ROW = 284;
/* His hair, px of a face, comes down to this row over the ears. */
const EAR_ROW = 134;
/* Where a point of his head is read: on a face, on his side, or on the
 * back of his head, by its height and the way round it is. */
const faceUV = (x, row, hwPx, xc) => [
  (TILE_W / 2 + xc / K + ((x - xc) / K) * (1 - INSET / Math.max(20, hwPx))) / AW,
  1 - Math.min(TILE_H - 4, Math.max(5, row)) / AH,
];
const sideUV = (y, z) => [
  (SIDE.x + (SIDE_NOSE + (NOSE_TIP - z) / KS - SIDE_SRC[0]) * SIDE.s) / AW,
  1 - (SIDE.y + (SIDE_CHIN - (y - CHIN) / KS - SIDE_SRC[1]) * SIDE.s) / AH,
];
const backUV = (q, row) => [
  (BACK.x + 3 + q * (BACK.w - 6)) / AW,
  1 - (BACK.y + Math.min(TILE_H - 2, Math.max(2, row)) * (BACK.h / TILE_H)) / AH,
];

const RGB = {
  skin: '#eab291',
  hair: '#5c4e42',
  hairSide: '#76685e',
  hairTop: '#4c4036',
  salt: 'rgba(196, 190, 184, 0.42)',
  pepper: 'rgba(44, 36, 30, 0.5)',
  ink: '#241a16',
};

/* A small seeded generator, so the painted hair is the same every time. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The nape's hairline, a face's row, across the back of his head from one
 * side drawing's edge (0) to the other (1): where his side shows it there,
 * and a little lower in the middle. */
const hairline = (q) => 224 + 22 * Math.sin(Math.PI * q);

/* The back of his head: hair over skin, combed down from the crown in
 * strands of salt and pepper, inked along the hairline. */
function paintBack(ctx) {
  const { x: x0, y: y0, w, h } = BACK;
  const k = h / TILE_H;
  ctx.fillStyle = RGB.skin;
  ctx.fillRect(x0, y0, w, h);
  const line = new Path2D();
  line.moveTo(x0, y0);
  for (let i = 0; i <= 64; i += 1) {
    const q = i / 64;
    line.lineTo(x0 + q * w, y0 + hairline(q) * k);
  }
  line.lineTo(x0 + w, y0);
  line.closePath();
  ctx.save();
  ctx.clip(line);
  const g = ctx.createLinearGradient(0, y0, 0, y0 + 240 * k);
  g.addColorStop(0, RGB.hairTop);
  g.addColorStop(0.55, RGB.hair);
  g.addColorStop(1, RGB.hairSide);
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, w, h);
  const rnd = seeded(1955);
  ctx.lineCap = 'round';
  for (let i = 0; i < 420; i += 1) {
    const q = rnd();
    const v = y0 + rnd() * 150 * k;
    const len = (60 + rnd() * 120) * k;
    const drift = (0.5 - q) * 40 + (rnd() - 0.5) * 30;
    const x = x0 + q * w;
    ctx.strokeStyle = rnd() < 0.45 ? RGB.salt : RGB.pepper;
    ctx.lineWidth = 0.8 + rnd() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, v);
    ctx.quadraticCurveTo(x + drift * 0.3, v + len * 0.5, x + drift, v + len);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = RGB.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 64; i += 1) {
    const q = i / 64;
    if (i === 0) {
      ctx.moveTo(x0 + q * w, y0 + hairline(q) * k);
    } else {
      ctx.lineTo(x0 + q * w, y0 + hairline(q) * k);
    }
  }
  ctx.stroke();
}

/*
 * The atlas, onto `canvas` (AW by AH), from the render's sheet `sheet` (an
 * image, or null while it loads, when the faces and his side are left
 * blank). Each face is laid on its tile's middle with its crown on the top
 * edge, on a ground of hair to EAR_ROW and skin under it, and its rows from
 * NECK_ROW down are painted skin, the neck under the model's own collar.
 * His side is drawn SIDE.s times larger, its collar and shoulder painted
 * over with the neck's skin.
 */
export function paintNickAtlas(canvas, sheet) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, AW, AH);
  for (let i = 0; i < FACES.length; i += 1) {
    const x0 = i * TILE_W;
    ctx.fillStyle = RGB.hairSide;
    ctx.fillRect(x0, 0, TILE_W, EAR_ROW);
    ctx.fillStyle = RGB.skin;
    ctx.fillRect(x0, EAR_ROW, TILE_W, TILE_H - EAR_ROW);
    if (sheet) {
      const [fx, fy, fw, fh] = FACES[i];
      ctx.drawImage(sheet, fx, fy, fw, fh, x0 + (TILE_W - fw) / 2, 0, fw, fh);
    }
    ctx.fillStyle = RGB.skin;
    ctx.fillRect(x0, NECK_ROW, TILE_W, TILE_H - NECK_ROW);
  }
  const [sx, sy, sw, sh] = SIDE_SRC;
  const at = (x, y) => [SIDE.x + (x - sx) * SIDE.s, SIDE.y + (y - sy) * SIDE.s];
  ctx.fillStyle = RGB.hair;
  ctx.fillRect(...at(sx, sy), sw * SIDE.s, (117 - sy) * SIDE.s);
  ctx.fillStyle = RGB.skin;
  ctx.fillRect(...at(sx, 117), sw * SIDE.s, (sy + sh - 117) * SIDE.s);
  if (sheet) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sheet, sx, sy, sw, sh, ...at(sx, sy), sw * SIDE.s, sh * SIDE.s);
  }
  ctx.fillStyle = RGB.skin;
  ctx.fillRect(...at(sx, SIDE_CHIN + 1), sw * SIDE.s, AH);
  ctx.fillRect(...at(158, 125), (sx + sw - 158) * SIDE.s, AH);
  ctx.fillRect(...at(170, 113), (sx + sw - 170) * SIDE.s, AH);
  paintBack(ctx);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(...WHITE);
}

/* ------------------------------------------------------------------ */
/* Colours                                                             */
/* ------------------------------------------------------------------ */

/* Sampled from the walk view and the pieces it was cut into, the cloth a
 * little brighter, since the map's light shades it again. */
const C = {
  white: 0xffffff,
  skin: 0xeab291,
  tee: 0x2e5aa2,
  teeLo: 0x22437c,
  jeans: 0x2c4262,
  jeansLo: 0x1f2f47,
  stitch: 0x4a6185,
  shoe: 0xb03a3a,
  shoeLo: 0x8a2c2c,
  sole: 0xf0e8de,
  lace: 0xf6f4ef,
  watch: 0x1c1d22,
  watchFace: 0x46505e,
};

/* ------------------------------------------------------------------ */
/* The head's shape                                                    */
/* ------------------------------------------------------------------ */

/*
 * Rows down his head, each [row, half width, middle, front, back, widest,
 * squareness in front, behind]. `row` is the faces' pixel row (crown 0,
 * chin 270), and the half width and the middle are px of the smiling face
 * read off its outline: hair down to the ears, then the face's own edge
 * under them, then the neck. Front, back and where he is widest are real
 * metres along the way he faces from the head bone, read off the walk
 * view's profile at the same height: the hair's quiff over the forehead,
 * the face behind the nose, the lips, the chin and the throat under it,
 * and the back of the hair. The squareness flattens his face where it is
 * over 2 and narrows his chin where it is under.
 */
const FACE_ROWS = [
  [4, 32, 133, 0.111, -0.013, 0.05, 2, 2],
  [10, 40.5, 134.5, 0.127, -0.025, 0.05, 2, 2],
  [20, 57.5, 128.5, 0.148, -0.043, 0.045, 2, 2],
  [30, 70, 127, 0.157, -0.057, 0.04, 2, 2],
  [45, 84.5, 130.5, 0.164, -0.077, 0.035, 2.1, 2],
  [65, 93.5, 130.75, 0.161, -0.087, 0.03, 2.2, 2],
  [90, 97.5, 129.5, 0.153, -0.093, 0.03, 2.3, 2],
  [110, 94.5, 129.5, 0.156, -0.096, 0.03, 2.5, 2],
  [128, 92, 129.5, 0.158, -0.091, 0.03, 2.6, 2],
  [136, 78, 132, 0.158, -0.089, 0.025, 2.6, 2],
  [150, 73, 133, 0.157, -0.084, 0.02, 2.6, 2],
  [170, 72, 132.5, 0.156, -0.074, 0.02, 2.6, 2],
  [190, 72, 133, 0.156, -0.061, 0.025, 2.4, 2],
  [210, 68.5, 130.5, 0.156, -0.049, 0.03, 2.2, 2],
  [230, 62, 130, 0.152, -0.042, 0.035, 1.9, 2],
  [250, 61, 130, 0.149, -0.046, 0.03, 1.6, 2],
  [263, 61, 131, 0.141, -0.054, 0.025, 1.5, 2],
  [272, 60.5, 131, 0.118, -0.06, 0.02, 1.7, 2],
  [282, 59.5, 131, 0.088, -0.062, 0.01, 2, 2],
  [305, 58.5, 131, 0.074, -0.064, 0.005, 2, 2],
  [337.5, 57.5, 133, 0.066, -0.066, 0, 2, 2],
  [372, 54, 133, 0.06, -0.06, 0, 2, 2],
];
/* Rings between two rows: more over the face, where the nose is. */
const ROW_STEPS = FACE_ROWS.map(([row]) => (row >= 128 && row < 282 ? 3 : 2));
/*
 * The ways round his head each of his three pictures is read from: a face
 * across the front to T1 either side (radians round from straight ahead,
 * which ringPoint's angle is), his side drawing from there to T2, and the
 * painted back between; and the columns across each, the front's denser in
 * the middle.
 */
const T1 = 0.96;
const T2 = 2.18;
const FRONT_N = 22;
const SIDE_N = 8;
const BACK_N = 12;

/* His nose out of the face, metres forward, by height over the head bone:
 * the bridge between the eyes, the tip, and back under it; and its width.
 * The render draws it at the face's middle, its tip at row 185. */
const NOSE = [[0.218, 0, 0.008], [0.205, 0.006, 0.009], [0.19, 0.013, 0.011], [0.172, 0.023, 0.013], [0.165, 0.021, 0.015], [0.157, 0.008, 0.016], [0.152, 0, 0.016]];

function lerpRows(table, y) {
  if (y >= table[0][0]) {
    return table[0].slice(1);
  }
  for (let i = 1; i < table.length; i += 1) {
    if (y >= table[i][0]) {
      const a = table[i - 1];
      const b = table[i];
      const t = (y - b[0]) / (a[0] - b[0]);
      return a.slice(1).map((v, k) => b[k + 1] + (v - b[k + 1]) * t);
    }
  }
  return table[table.length - 1].slice(1);
}

/* Catmull-Rom through the rows, row by row, t from 0 to the last row. */
function headRow(t) {
  const i = Math.min(FACE_ROWS.length - 2, Math.floor(t));
  const u = t - i;
  const at = (k) => FACE_ROWS[Math.max(0, Math.min(FACE_ROWS.length - 1, k))];
  const p0 = at(i - 1);
  const p1 = at(i);
  const p2 = at(i + 1);
  const p3 = at(i + 2);
  return p1.map((_, k) => {
    const a = p0[k];
    const b = p1[k];
    const c = p2[k];
    const d = p3[k];
    return 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  });
}

const pw = (v, e) => Math.sign(v) * Math.abs(v) ** e;

/* A point of a ring: half width hw about xc, front zf, back zb, widest at
 * zm, at angle a round from the front toward his left. */
function ringPoint(a, hw, xc, zf, zb, zm, pf, pb) {
  const s = Math.sin(a);
  const c = Math.cos(a);
  if (c >= 0) {
    return [xc + hw * pw(s, 2 / pf), zm + (zf - zm) * c ** (2 / pf)];
  }
  return [xc + hw * pw(s, 2 / pb), zm - (zm - zb) * (-c) ** (2 / pb)];
}

/* ------------------------------------------------------------------ */
/* Building                                                            */
/* ------------------------------------------------------------------ */

/* Every bone's joint standing straight with his arms down, real metres,
 * his pelvis PELVIS over the floor (./nick.js). Every bone is unturned
 * there, so a point's place on its bone is its place less the joint. */
const PELVIS = 0.96;
const JOINT = [];
for (const [, parent, off] of BONES) {
  const p = parent < 0 ? [0, PELVIS, 0] : JOINT[parent];
  JOINT.push(parent < 0 ? p : [p[0] + off[0], p[1] + off[1], p[2] + off[2]]);
}

/*
 * The model: his rest places, normals, colours, texture coordinates and
 * bones, laid out bone by bone, for ./nickdraw.js. `face` lists the
 * vertices that wear a face, with their u on the first tile.
 */
export function nickModel() {
  const pos = [];
  const col = [];
  const uvs = [];
  const bone = [];
  const idx = [];
  const tint = new THREE.Color();
  let count = 0;
  const faceVerts = [];
  const seams = [];

  const vert = (p, hex, b, u = WU, v = WV) => {
    pos.push(p[0], p[1], p[2]);
    tint.setHex(hex);
    col.push(tint.r, tint.g, tint.b);
    uvs.push(u, v);
    bone.push(b);
    count += 1;
    return count - 1;
  };
  /* A part's triangles all face out: if the volume they bound about their
   * middle is negative, every one is turned over. */
  const orient = (from) => {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let m = 0;
    for (let t = from; t < idx.length; t += 1) {
      cx += pos[idx[t] * 3];
      cy += pos[idx[t] * 3 + 1];
      cz += pos[idx[t] * 3 + 2];
      m += 1;
    }
    cx /= m;
    cy /= m;
    cz /= m;
    let vol = 0;
    for (let t = from; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((i) => [pos[i * 3] - cx, pos[i * 3 + 1] - cy, pos[i * 3 + 2] - cz]);
      vol += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
    if (vol < 0) {
      for (let t = from; t < idx.length; t += 3) {
        const k = idx[t + 1];
        idx[t + 1] = idx[t + 2];
        idx[t + 2] = k;
      }
    }
  };
  /*
   * Rings of points, every ring as long as the first and closed round;
   * `top` and `bottom` close the first and last ring to a point. `paint`
   * is a colour, or a function of the point, its ring and its place round
   * it.
   */
  const rings = (rows, b, paint, top = null, bottom = null, uvOf = null) => {
    const from = idx.length;
    const m = rows[0].length;
    const hex = typeof paint === 'function' ? paint : () => paint;
    const put = (p, c) => (uvOf ? vert(p, c, b, ...uvOf(p)) : vert(p, c, b));
    const id = rows.map((row, r) => row.map((p, j) => put(p, hex(p, r, j))));
    for (let r = 0; r + 1 < rows.length; r += 1) {
      for (let j = 0; j < m; j += 1) {
        const a = id[r][j];
        const e = id[r][(j + 1) % m];
        const c = id[r + 1][j];
        const d = id[r + 1][(j + 1) % m];
        idx.push(a, c, e, e, c, d);
      }
    }
    if (top) {
      const t = put(top, hex(top, -1, 0));
      for (let j = 0; j < m; j += 1) {
        idx.push(t, id[0][j], id[0][(j + 1) % m]);
      }
    }
    if (bottom) {
      const t = put(bottom, hex(bottom, rows.length, 0));
      const r = rows.length - 1;
      for (let j = 0; j < m; j += 1) {
        idx.push(t, id[r][(j + 1) % m], id[r][j]);
      }
    }
    orient(from);
  };
  /* A tube down bone b from its joint, at stations [t, rx, rz, dx, dz]:
   * t down the bone, the ring's half widths across and along the way he
   * faces, and its middle off the bone's line. */
  const tube = (b, stations, seg, paint, ends = false) => {
    const [jx, jy, jz] = JOINT[b];
    const rows = stations.map(([t, rx, rz, dx = 0, dz = 0]) => {
      const row = [];
      for (let j = 0; j < seg; j += 1) {
        const a = (2 * Math.PI * j) / seg;
        row.push([jx + dx + rx * Math.sin(a), jy - t, jz + dz + rz * Math.cos(a)]);
      }
      return row;
    });
    const first = stations[0];
    const last = stations[stations.length - 1];
    rings(rows, b, paint, ends ? [jx + (first[3] || 0), jy - first[0] + 0.004, jz + (first[4] || 0)] : null,
      ends ? [jx + (last[3] || 0), jy - last[0] - 0.004, jz + (last[4] || 0)] : null);
  };
  /* A ball of radii [rx, ry, rz] about centre `o`, turned by the Euler
   * angles `e` (radians, about x, y, z). */
  const ball = (b, o, r, paint, lat = 8, lon = 14, e = [0, 0, 0], uvOf = null) => {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    const v = new THREE.Vector3();
    const rows = [];
    for (let i = 1; i < lat; i += 1) {
      const f = (Math.PI * i) / lat;
      const row = [];
      for (let j = 0; j < lon; j += 1) {
        const l = (2 * Math.PI * j) / lon;
        v.set(r[0] * Math.sin(f) * Math.sin(l), r[1] * Math.cos(f), r[2] * Math.sin(f) * Math.cos(l)).applyMatrix4(m);
        row.push([o[0] + v.x, o[1] + v.y, o[2] + v.z]);
      }
      rows.push(row);
    }
    const top = v.set(0, r[1], 0).applyMatrix4(m).toArray();
    const bot = new THREE.Vector3(0, -r[1], 0).applyMatrix4(m).toArray();
    const local = typeof paint === 'function'
      ? (p) => {
        v.set(p[0] - o[0], p[1] - o[1], p[2] - o[2]).applyMatrix4(m.clone().invert());
        return paint(v.x / r[0], v.y / r[1], v.z / r[2]);
      }
      : paint;
    rings(rows, b, local, [o[0] + top[0], o[1] + top[1], o[2] + top[2]], [o[0] + bot[0], o[1] + bot[1], o[2] + bot[2]], uvOf);
  };
  /* A tube along a path of points, radius r (a number, or one a point),
   * closed at its far end and, with `cap`, at its near one too. */
  const path = (b, pts, r, seg, paint, cap = false) => {
    const rows = [];
    const t = new THREE.Vector3();
    const n0 = new THREE.Vector3();
    const n1 = new THREE.Vector3();
    const ref = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[Math.max(0, i - 1)];
      const c = pts[Math.min(pts.length - 1, i + 1)];
      t.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]).normalize();
      if (Math.abs(t.dot(ref)) > 0.9) {
        ref.set(1, 0, 0);
      }
      n0.crossVectors(t, ref).normalize();
      n1.crossVectors(t, n0).normalize();
      const rr = Array.isArray(r) ? r[i] : r;
      const row = [];
      for (let j = 0; j < seg; j += 1) {
        const q = (2 * Math.PI * j) / seg;
        const cs = Math.cos(q) * rr;
        const sn = Math.sin(q) * rr;
        row.push([pts[i][0] + n0.x * cs + n1.x * sn, pts[i][1] + n0.y * cs + n1.y * sn, pts[i][2] + n0.z * cs + n1.z * sn]);
      }
      rows.push(row);
    }
    const p0 = pts[0];
    const p1 = pts[pts.length - 1];
    const q0 = pts[1];
    const q1 = pts[pts.length - 2];
    const rEnd = Array.isArray(r) ? r[r.length - 1] : r;
    const rStart = Array.isArray(r) ? r[0] : r;
    const out = (p, q, rr) => {
      const d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
      const l = Math.hypot(...d) || 1;
      return [p[0] + (d[0] / l) * rr * 0.7, p[1] + (d[1] / l) * rr * 0.7, p[2] + (d[2] / l) * rr * 0.7];
    };
    rings(rows, b, paint, cap ? out(p0, q0, rStart) : null, out(p1, q1, rEnd));
  };
  /* A box with flat faces, its middle at o, its sizes s, turned about x by
   * `rx`. */
  const box = (b, o, s, rx, hex) => {
    const from = idx.length;
    const cs = Math.cos(rx);
    const sn = Math.sin(rx);
    const at = (x, y, z) => [o[0] + x, o[1] + y * cs - z * sn, o[2] + y * sn + z * cs];
    const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const faces = [
      [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
      [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]],
      [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]],
      [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]],
      [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]],
      [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]],
    ];
    for (const f of faces) {
      const q = f.map((p) => vert(at(...p), hex, b));
      idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
    orient(from);
  };

  /* -------------------------------------------------------------- */
  /* The head                                                         */
  /* -------------------------------------------------------------- */

  const H = BONE.head;
  const [hx0, hy0, hz0] = JOINT[H];
  const angles = [];
  const region = [];
  for (let k = 0; k < FRONT_N; k += 1) {
    const q = (2 * k) / FRONT_N - 1;
    angles.push(T1 * q * (0.6 + 0.4 * q * q));
    region.push('front');
  }
  for (const [a0, a1, n, r] of [[T1, T2, SIDE_N, 'side'], [T2, 2 * Math.PI - T2, BACK_N, 'back'], [2 * Math.PI - T2, 2 * Math.PI - T1, SIDE_N, 'side']]) {
    for (let k = 0; k < n; k += 1) {
      angles.push(a0 + ((a1 - a0) * k) / n);
      region.push(r);
    }
  }
  const cols = angles.length;
  const ts = [];
  for (let i = 0; i + 1 < FACE_ROWS.length; i += 1) {
    for (let k = 0; k < ROW_STEPS[i]; k += 1) {
      ts.push(i + k / ROW_STEPS[i]);
    }
  }
  ts.push(FACE_ROWS.length - 1);
  /* A point of his head read as `r` says. */
  const headUV = (r, g) => {
    if (r === 'front') {
      return faceUV(g.x, g.row, g.hwPx, g.xc);
    }
    if (r === 'side') {
      return sideUV(g.y, g.z);
    }
    const a = g.a < 0 ? g.a + 2 * Math.PI : g.a;
    return backUV((a - T2) / (2 * Math.PI - 2 * T2), g.row);
  };
  const grid = ts.map((t) => {
    const [row, hwPx, xcPx, zf, zb, zm, pf, pb] = headRow(t);
    const y = (Y0 - row) * K;
    const hw = hwPx * K;
    const xc = (xcPx - 133) * K;
    const nose = lerpRows(NOSE, y);
    return angles.map((a) => {
      const [x, z] = ringPoint(a, hw, xc, zf, zb, zm, pf, pb);
      let dz = 0;
      if (Math.cos(a) > 0) {
        dz = nose[0] * Math.exp(-0.5 * ((x / nose[1]) ** 2));
        /* The lips, a little full, at row 210. */
        dz += 0.004 * Math.exp(-0.5 * ((x / 0.024) ** 2)) * Math.exp(-0.5 * (((y - 0.142) / 0.007) ** 2));
      }
      return { x, y, z: z + dz, a, row, hwPx, xc };
    });
  });
  /* Each point once for each picture whose triangles meet at it, so no
   * triangle reads across two; the front's are the ones a face changes. */
  const ids = grid.map((row) => row.map((g, j) => {
    const own = {};
    const p = [hx0 + g.x, hy0 + g.y, hz0 + g.z];
    for (const r of new Set([region[j], region[(j + cols - 1) % cols]])) {
      own[r] = vert(p, C.white, H, ...headUV(r, g));
      if (r === 'front') {
        faceVerts.push(own[r]);
      }
    }
    const copies = Object.values(own);
    if (copies.length > 1) {
      seams.push(copies);
    }
    return own;
  }));
  {
    const from = idx.length;
    for (let r = 0; r + 1 < grid.length; r += 1) {
      for (let j = 0; j < cols; j += 1) {
        const k = (j + 1) % cols;
        const q = region[j];
        idx.push(ids[r][j][q], ids[r + 1][j][q], ids[r][k][q], ids[r][k][q], ids[r + 1][j][q], ids[r + 1][k][q]);
      }
    }
    /* The crown and the bottom of the neck, closed to a point, once for
     * each picture. */
    const mid = (row, dy) => {
      let x = 0;
      let z = 0;
      for (const g of row) {
        x += g.x;
        z += g.z;
      }
      return { x: x / row.length, y: row[0].y + dy, z: z / row.length, a: 0, row: row[0].row, hwPx: 40, xc: 0 };
    };
    const last = grid.length - 1;
    for (const [g, r0, flip] of [[mid(grid[0], 0.005), 0, false], [mid(grid[last], -0.004), last, true]]) {
      const own = {};
      for (const r of ['front', 'side', 'back']) {
        const at = { ...g, a: r === 'back' ? Math.PI : 0 };
        own[r] = vert([hx0 + g.x, hy0 + g.y, hz0 + g.z], C.white, H, ...headUV(r, at));
        if (r === 'front') {
          faceVerts.push(own[r]);
        }
      }
      seams.push(Object.values(own));
      for (let j = 0; j < cols; j += 1) {
        const k = (j + 1) % cols;
        const q = region[j];
        if (flip) {
          idx.push(own[q], ids[r0][k][q], ids[r0][j][q]);
        } else {
          idx.push(own[q], ids[r0][j][q], ids[r0][k][q]);
        }
      }
    }
    orient(from);
  }

  /* His ears, standing a little out from the side of his head where his
   * side drawing has them, and wearing that drawing. */
  for (const side of [1, -1]) {
    ball(H, [hx0 + 0.092 * side, hy0 + 0.193, hz0 + 0.005], [0.011, 0.038, 0.02], C.white, 8, 12,
      [0, -0.45 * side, 0.1 * side], (p) => sideUV(p[1] - hy0, p[2] - hz0));
  }

  /* -------------------------------------------------------------- */
  /* The tee                                                          */
  /* -------------------------------------------------------------- */

  /* The tee, rows [height, half width, front, back] standing: hemmed
   * over the jeans, a little belly, the chest, the shoulders and the
   * slope up to the neck, closed under the collar. */
  const SP = BONE.spine;
  const TEE = [
    [0.885, 0.188, 0.126, -0.135],
    [0.895, 0.188, 0.126, -0.135],
    [0.905, 0.186, 0.125, -0.133],
    [0.98, 0.176, 0.118, -0.115],
    [1.06, 0.161, 0.119, -0.1],
    [1.14, 0.161, 0.123, -0.1],
    [1.22, 0.165, 0.128, -0.104],
    [1.3, 0.167, 0.131, -0.108],
    [1.36, 0.174, 0.125, -0.11],
    [1.4, 0.19, 0.115, -0.107],
    [1.44, 0.2, 0.103, -0.1],
    [1.47, 0.198, 0.093, -0.094],
    [1.495, 0.17, 0.086, -0.086],
    [1.52, 0.128, 0.08, -0.078],
    [1.545, 0.092, 0.075, -0.072],
    [1.56, 0.08, 0.072, -0.07],
  ];
  const teeSeg = 36;
  const ringOf = (y, hw, zf, zb, seg, p = 2.2) => {
    const row = [];
    for (let j = 0; j < seg; j += 1) {
      const a = (2 * Math.PI * j) / seg;
      const [x, z] = ringPoint(a, hw, 0, zf, zb, 0, p, 2.1);
      row.push([x, y, z]);
    }
    return row;
  };
  rings(TEE.map(([y, hw, zf, zb]) => ringOf(y, hw, zf, zb, teeSeg)), SP,
    (p) => (p[1] < 0.903 ? C.teeLo : C.tee), [0, 0.88, 0.003], [0, 1.566, 0]);
  /* The crew neck's rib, its front a little lower than its back. */
  {
    const pts = [];
    for (let j = 0; j <= 28; j += 1) {
      const a = (2 * Math.PI * j) / 28;
      pts.push([0.079 * Math.sin(a), 1.556 - 0.012 * Math.cos(a), 0.003 + 0.077 * Math.cos(a)]);
    }
    const rows = [];
    for (let j = 0; j < 28; j += 1) {
      const p = pts[j];
      const row = [];
      for (let k = 0; k < 6; k += 1) {
        const q = (2 * Math.PI * k) / 6;
        const out = 0.009 * Math.cos(q);
        const up = 0.009 * Math.sin(q);
        const l = Math.hypot(p[0], p[2] - 0.003) || 1;
        row.push([p[0] + (p[0] / l) * out, p[1] + up, p[2] + ((p[2] - 0.003) / l) * out]);
      }
      rows.push(row);
    }
    /* Laid round the neck, a ring of rings closed on itself. */
    const from = idx.length;
    const id = rows.map((row) => row.map((p) => vert(p, C.teeLo, SP)));
    for (let j = 0; j < 28; j += 1) {
      for (let k = 0; k < 6; k += 1) {
        const a = id[j][k];
        const e = id[j][(k + 1) % 6];
        const c = id[(j + 1) % 28][k];
        const d = id[(j + 1) % 28][(k + 1) % 6];
        idx.push(a, c, e, e, c, d);
      }
    }
    /* A torus bounds no volume about its middle, so it is turned by its
     * first triangle's normal against the way out of its tube. */
    const [a, b, c] = [idx[from], idx[from + 1], idx[from + 2]].map((i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (n.dot(a.clone().sub(new THREE.Vector3(...pts[0]))) < 0) {
      for (let t = from; t < idx.length; t += 3) {
        const k = idx[t + 1];
        idx[t + 1] = idx[t + 2];
        idx[t + 2] = k;
      }
    }
  }

  /* -------------------------------------------------------------- */
  /* The arms                                                         */
  /* -------------------------------------------------------------- */

  for (const [arm, fore, side] of [[BONE.armL, BONE.foreL, 1], [BONE.armR, BONE.foreR, -1]]) {
    const [ax, ay, az] = JOINT[arm];
    /* The shoulder, a ball of tee on the joint, and the sleeve: wide,
     * hemmed in a darker band and turned in at its edge. */
    ball(arm, [ax, ay, az], [0.057, 0.057, 0.057], C.tee, 10, 16);
    tube(arm, [[0, 0.057, 0.057], [0.05, 0.058, 0.057], [0.1, 0.058, 0.057], [0.128, 0.057, 0.056], [0.15, 0.056, 0.055], [0.152, 0.047, 0.046]], 20,
      (p) => (ay - p[1] > 0.127 ? C.teeLo : C.tee));
    /* The upper arm out of it, the elbow a ball on the joint. */
    tube(arm, [[0.1, 0.048, 0.047], [0.2, 0.045, 0.044], [0.29, 0.041, 0.04]], 16, C.skin);
    ball(arm, [ax, ay - 0.29, az], [0.041, 0.041, 0.041], C.skin, 8, 14);
    /* The forearm, the wrist flatter than the arm, and the watch. */
    const [fx, fy, fz] = JOINT[fore];
    tube(fore, [[0, 0.041, 0.04], [0.06, 0.043, 0.04], [0.15, 0.035, 0.032], [0.235, 0.025, 0.029]], 16, C.skin);
    if (side > 0) {
      tube(fore, [[0.197, 0.033, 0.034], [0.199, 0.034, 0.035], [0.215, 0.032, 0.034], [0.217, 0.031, 0.033]], 16, C.watch);
      path(fore, [[fx + 0.025, fy - 0.207, fz], [fx + 0.037, fy - 0.207, fz]], 0.014, 12, C.watchFace, true);
    }
    /* The hand, palm to his thigh and thumb forward: the palm, four
     * fingers bent a little toward it, the thumb. */
    tube(fore, [[0.232, 0.016, 0.028], [0.26, 0.017, 0.036], [0.3, 0.016, 0.044], [0.325, 0.014, 0.043], [0.334, 0.01, 0.034]], 14, C.skin, true);
    const palm = -side;
    for (const [dz, len] of [[0.03, 0.074], [0.011, 0.082], [-0.009, 0.077], [-0.027, 0.062]]) {
      const x0 = fx + palm * 0.002;
      const y0 = fy - 0.32;
      const k = len / 0.08;
      const pts = [
        [x0, y0, fz + dz],
        [x0 + palm * 0.006 * k, y0 - 0.035 * k, fz + dz * 1.05],
        [x0 + palm * 0.018 * k, y0 - 0.062 * k, fz + dz * 1.08],
        [x0 + palm * 0.032 * k, y0 - 0.078 * k, fz + dz * 1.1],
      ];
      path(fore, pts, [0.0098, 0.0094, 0.0086, 0.0078], 7, C.skin);
    }
    path(fore, [
      [fx + palm * 0.008, fy - 0.255, fz + 0.03],
      [fx + palm * 0.014, fy - 0.282, fz + 0.05],
      [fx + palm * 0.02, fy - 0.31, fz + 0.06],
      [fx + palm * 0.024, fy - 0.33, fz + 0.062],
    ], [0.012, 0.0115, 0.0105, 0.0095], 7, C.skin);
  }

  /* -------------------------------------------------------------- */
  /* The jeans                                                        */
  /* -------------------------------------------------------------- */

  /* The seat, rows [height, half width, front, back]: from under the tee
   * to the crotch, the fly down the front and a pocket stitched on each
   * cheek. */
  const P = BONE.pelvis;
  const SEAT = [
    [1.02, 0.14, 0.09, -0.085],
    [0.97, 0.155, 0.096, -0.1],
    [0.92, 0.168, 0.1, -0.118],
    [0.87, 0.162, 0.09, -0.118],
    [0.83, 0.13, 0.07, -0.095],
    [0.805, 0.075, 0.046, -0.052],
  ];
  const pocket = (p) => {
    const ax = Math.abs(p[0]);
    return p[2] < -0.06 && ax > 0.04 && ax < 0.13 && p[1] > 0.835 && p[1] < 0.93 - (ax - 0.04) * 0.15;
  };
  rings(SEAT.map(([y, hw, zf, zb]) => ringOf(y, hw, zf, zb, 32, 2.2)), P,
    (p) => (pocket(p) ? C.jeansLo : (p[2] > 0.06 && Math.abs(p[0]) < 0.008 && p[1] > 0.84 ? C.jeansLo : C.jeans)),
    null, [0, 0.795, -0.002]);

  for (const [th, sh, ft, side] of [[BONE.thighL, BONE.shinL, BONE.footL, 1], [BONE.thighR, BONE.shinR, BONE.footR, -1]]) {
    const [tx, ty, tz] = JOINT[th];
    const seg = 22;
    /* The outside seam, a lighter stitch down each leg. */
    const seam = (p) => {
      const out = (p[0] - tx) * side;
      const fwd = p[2] - tz;
      return out > 0 && Math.abs(Math.atan2(fwd, out)) < 0.08;
    };
    ball(th, [tx, ty, tz], [0.084, 0.084, 0.084], C.jeans, 10, 18);
    tube(th, [[0, 0.084, 0.087, 0, 0.003], [0.12, 0.084, 0.088, 0, 0.004], [0.25, 0.075, 0.078, 0, 0.003], [0.36, 0.066, 0.068], [0.43, 0.062, 0.062]], seg,
      (p) => (seam(p) ? C.stitch : C.jeans));
    ball(th, [tx, ty - 0.43, tz], [0.062, 0.062, 0.062], C.jeans, 8, 16);
    const [sx, sy, sz] = JOINT[sh];
    /* The shin, and the cuff rolled up once at the bottom, a step out and
     * a darker band, turned in under the hem. */
    tube(sh, [[0, 0.062, 0.062], [0.1, 0.06, 0.061], [0.25, 0.056, 0.057], [0.338, 0.056, 0.058], [0.342, 0.0625, 0.064], [0.37, 0.0625, 0.0645], [0.4, 0.064, 0.067], [0.405, 0.05, 0.052]], seg,
      (p) => (sy - p[1] > 0.339 ? C.jeansLo : (seam(p) ? C.stitch : C.jeans)), false);

    /* The sneaker, a loft from heel to toe on the foot bone: the white
     * sole with a little spring at the toe, the red upper on it, its
     * collar low at the ankle, and four white laces over the instep. */
    const [fx, fy, fz] = JOINT[ft];
    const sole = fy - 0.08;
    /* Stations [z, half width of the sole, the upper's top over the
     * sole's floor]. */
    const SHOE = [
      [-0.078, 0.02, 0.06], [-0.072, 0.034, 0.096], [-0.062, 0.041, 0.112], [-0.04, 0.044, 0.115], [-0.01, 0.046, 0.11],
      [0.02, 0.049, 0.098], [0.05, 0.052, 0.086], [0.08, 0.054, 0.074], [0.11, 0.055, 0.064], [0.14, 0.054, 0.056],
      [0.165, 0.05, 0.05], [0.185, 0.043, 0.044], [0.198, 0.032, 0.038], [0.205, 0.018, 0.032],
    ];
    const spring = (z) => Math.max(0, z - 0.13) * 0.32;
    const inner = -side * 0.004;
    const soleRows = SHOE.map(([z, w]) => {
      const row = [];
      for (let j = 0; j < 20; j += 1) {
        const a = (2 * Math.PI * j) / 20;
        const [x, y] = [pw(Math.cos(a), 0.5) * (w + 0.004), pw(Math.sin(a), 0.5) * 0.016];
        row.push([fx + inner + x, sole + spring(z) + 0.016 + y, fz + z]);
      }
      return row;
    });
    rings(soleRows, ft, C.sole, [fx + inner, sole + 0.016, fz - 0.082], [fx + inner, sole + spring(0.21) + 0.016, fz + 0.21]);
    const upperRows = SHOE.map(([z, w, h]) => {
      const row = [];
      const y0 = sole + spring(z) + 0.028;
      const y1 = sole + spring(z) + h;
      for (let j = 0; j < 20; j += 1) {
        const a = (2 * Math.PI * j) / 20;
        const [x, y] = [pw(Math.cos(a), 0.7) * w, pw(Math.sin(a), 0.8)];
        row.push([fx + inner + x, (y0 + y1) / 2 + ((y1 - y0) / 2) * y, fz + z]);
      }
      return row;
    });
    rings(upperRows, ft, (p) => (p[1] - sole > 0.098 ? C.shoeLo : C.shoe), [fx + inner, sole + 0.045, fz - 0.081], [fx + inner, sole + spring(0.208) + 0.03, fz + 0.208]);
    for (const z of [0.012, 0.037, 0.062, 0.087]) {
      const h = lerpRows(SHOE.map(([zz, , hh]) => [zz, hh]).reverse(), z)[0];
      const top = sole + spring(z) + h;
      box(ft, [fx + inner, top - 0.001, fz + z], [0.05, 0.005, 0.009], 0.35, C.lace);
    }
  }

  /* -------------------------------------------------------------- */
  /* Normals, and the layout by bone                                  */
  /* -------------------------------------------------------------- */

  /* Smooth within each part, weighted by area; where two of his head's
   * pictures meet, every copy of a vertex takes the sum, so the seam does
   * not show in the light. */
  const nor = new Float64Array(count * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const ux = pos[b * 3] - pos[a * 3];
    const uy = pos[b * 3 + 1] - pos[a * 3 + 1];
    const uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3];
    const vy = pos[c * 3 + 1] - pos[a * 3 + 1];
    const vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      nor[i * 3] += nx;
      nor[i * 3 + 1] += ny;
      nor[i * 3 + 2] += nz;
    }
  }
  for (const copies of seams) {
    for (let k = 0; k < 3; k += 1) {
      let sum = 0;
      for (const i of copies) {
        sum += nor[i * 3 + k];
      }
      for (const i of copies) {
        nor[i * 3 + k] = sum;
      }
    }
  }
  for (let i = 0; i < count; i += 1) {
    const l = Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) || 1;
    nor[i * 3] /= l;
    nor[i * 3 + 1] /= l;
    nor[i * 3 + 2] /= l;
  }

  /* Laid out bone by bone (a counting sort, stable), so each bone's
   * vertices are one run the skin walks with its bone's matrix in hand,
   * and each run's places are on its bone, joint at the origin. */
  const NB = BONES.length;
  const start = new Int32Array(NB + 1);
  for (let i = 0; i < count; i += 1) {
    start[bone[i] + 1] += 1;
  }
  for (let b = 0; b < NB; b += 1) {
    start[b + 1] += start[b];
  }
  const at = start.slice(0, NB);
  const slot = new Int32Array(count);
  for (let i = 0; i < count; i += 1) {
    slot[i] = at[bone[i]];
    at[bone[i]] += 1;
  }
  const rest = new Float32Array(count * 3);
  const restN = new Float32Array(count * 3);
  const colour = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    const s = slot[i];
    const j = JOINT[bone[i]];
    for (let k = 0; k < 3; k += 1) {
      rest[s * 3 + k] = pos[i * 3 + k] - j[k];
      restN[s * 3 + k] = nor[i * 3 + k];
      colour[s * 3 + k] = col[i * 3 + k];
    }
    uv[s * 2] = uvs[i * 2];
    uv[s * 2 + 1] = uvs[i * 2 + 1];
  }
  const tri = new (count > 65535 ? Uint32Array : Uint16Array)(idx.length);
  for (let t = 0; t < idx.length; t += 1) {
    tri[t] = slot[idx[t]];
  }
  const face = new Int32Array(faceVerts.map((i) => slot[i]));
  const faceU = new Float32Array(face.length);
  for (let k = 0; k < face.length; k += 1) {
    faceU[k] = uv[face[k] * 2];
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rest), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(restN), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(tri, 1));
  /* Fixed, in his frame: his reach from the middle of him, so the frustum
   * test never needs the skinned places. */
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), 1.5);
  return { geometry: g, rest, restN, start, face, faceU, tileU: TILE_W / AW };
}
