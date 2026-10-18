/*
 * nickdraw.js: Nick Burns drawn, a cartoon of him and his speech balloon,
 * posed every frame from ./nick.js.
 *
 * HOW HE LOOKS, from the stills of his own videos the house was built from
 * and his channel's thumbnails (/mnt/project-files/nick-burns-house/refs,
 * looked at, none of it shipped). A caricature: what is his, made more so.
 * His head is drawn at 1.4 times a real one so a quad across the yard can
 * read his face. A long face with a square jaw and a strong chin under a
 * shadow of grey stubble; a straight, prominent nose; narrowed, friendly
 * blue grey eyes under raised brows, with crow's feet; the clear
 * rectangular glasses he always wears; a wide open grin with smile lines.
 * His hair is short salt and pepper, silver at the temples and darker on
 * top, combed up and back from a quiff at the front. A heather blue crew
 * neck tee, dark jeans, a black watch on his left wrist, and the red shoes
 * with white soles. Drawn the way the house is, in plain shapes and colour
 * under the map's own cel light, comic hatching and ink. The ink draws a
 * line wherever the depth folds, so his rounded parts have segments enough
 * that it draws the outline of an arm and not each facet along it. He is
 * 1.8 m in real metres, so 5.4 m in the house's world, his size next to a
 * door.
 *
 * ONE DRAW CALL. Every part of him is one mesh, its colours in the vertices
 * and its material the map's own cel() with vertex colours. A part belongs
 * to one bone, and each frame his vertices are moved by their bone's
 * transform on the CPU (rigid skinning: about 8,300 vertices, about 0.14 ms
 * in a container that does it slowly), so the ink, the shadow map and the
 * comic layer all see the pose that is drawn without a skinning program of
 * their own. The skinning runs only while he is in front of the camera or
 * near it, and not at all while nothing about him moves; the transform
 * that carries him round the house is the mesh's own. His shadow is his
 * own cast, as a car's is. A tube whose ends are buried in a joint is
 * built without them.
 *
 * THE BALLOON is a second mesh, drawn only while he is saying something:
 * a card that faces the camera, lettered in the simulator's own hand
 * (src/ui/lettering.js) on a 512 by 256 canvas that is painted again only
 * when the line changes. It grows with distance past twenty metres, so it
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
  skin: 0xedb99d,
  skinLo: 0xc98e74,
  stubble: 0xcfab99,
  hair: 0x6c645e,
  hairHi: 0xd4d0ca,
  hairTop: 0x968f88,
  hairLo: 0xc9c4be,
  brow: 0x635a54,
  eye: 0xfbfbf8,
  iris: 0x5d84a6,
  pupil: 0x1a1414,
  lash: 0x3a302c,
  glasses: 0xd2dde6,
  glint: 0xffffff,
  mouth: 0x6e2028,
  teeth: 0xfbfbf8,
  tongue: 0xd8707a,
  tee: 0x3d68c8,
  teeLo: 0x30559f,
  jeans: 0x2e3d63,
  shoe: 0xe4262e,
  sole: 0xf6f4ef,
  watch: 0x1c1d22,
  watchFace: 0x3d4350,
};

/* The letters' colour, by line (NICK_LINES' order): the catfish in amber,
 * the rest round the shell's inks. */
const FILLS = ['#ffd45c', INKS.bail, INKS.mint, INKS.sky];

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
  /* `hex` is one colour, or a function of a vertex (where the geometry
   * was made, before it is placed, and its index) for a part shaded
   * across its shape. */
  const addM = (geo, b, hex, matrix) => {
    const shade = typeof hex === 'function' ? geo.attributes.position.clone() : null;
    geo.applyMatrix4(matrix);
    if (!shade) {
      c.setHex(hex);
    }
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    for (let i = 0; i < p.count; i += 1) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      if (shade) {
        hex(c, shade.getX(i), shade.getY(i), shade.getZ(i), i);
      }
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
  /* `open` leaves off the ends of a tube whose ends are buried in a joint
   * or another part, which no camera sees and every skin would pay for. */
  const tube = (r0, r1, len, seg = 10, open = false) => new THREE.CylinderGeometry(r0, r1, len, seg, 1, open);
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const flatShape = (pts) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
  /* A sphere pushed toward a box below its middle, by an exponent that
   * grows from 2 at the equator to `p` at the bottom, narrowed toward the
   * bottom by `taper` and its front pushed out there by `chin`: a square
   * jaw on a long face. */
  const blob = (p, taper = 0, chin = 0, w = 18, h = 14) => {
    const g = new THREE.SphereGeometry(1, w, h);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i += 1) {
      const x = a.getX(i);
      const y = a.getY(i);
      const z = a.getZ(i);
      const k = 2 + (p - 2) * Math.min(1, Math.max(0, -y * 1.6));
      const r = Math.pow(Math.abs(x) ** k + Math.abs(y) ** k + Math.abs(z) ** k, 1 / k);
      const below = Math.max(0, -y / r);
      a.setXYZ(i, (x / r) * (1 - taper * below), y / r, z / r + chin * below * Math.max(0, z / r));
    }
    g.computeVertexNormals();
    return g;
  };
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
  add(tube(0.17, 0.165, 0.2, 20), P, C.jeans, 0, -0.06, 0, 0, 0, 0, 1, 1, 0.68);
  add(box(0.17, 0.1, 0.16), P, C.jeans, 0, -0.13, 0);

  /* The chest: a heather blue crew neck tee, rounded off over the
   * shoulders, and a short strong neck. */
  const SP = BONE.spine;
  add(tube(0.172, 0.155, 0.46, 20), SP, C.tee, 0, 0.15, 0, 0, 0, 0, 1, 1, 0.6);
  add(ball(20, 10), SP, C.tee, 0, 0.39, 0, 0, 0, 0, 0.175, 0.095, 0.108);
  for (const x of [-0.18, 0.18]) {
    add(ball(12, 8), SP, C.tee, x, 0.398, 0, 0, 0, 0, 0.062, 0.06, 0.062);
  }
  add(new THREE.TorusGeometry(0.062, 0.011, 6, 20), SP, C.teeLo, 0, 0.463, 0.006, Math.PI / 2 - 0.15, 0, 0);
  add(tube(0.058, 0.063, 0.11, 18, true), SP, C.skin, 0, 0.5, 0.004);

  /*
   * The head, a caricature of his: drawn at 1.4 times a real head so it
   * reads from a quad across the yard, and in his shapes rather than an
   * anime's: a long face, a square jaw and a strong chin with a shadow of
   * stubble, a straight prominent nose, friendly narrowed blue grey eyes
   * under raised brows, the clear rectangular glasses he always wears, a
   * wide grin with smile lines, and short salt and pepper hair, darker at
   * the sides, brushed up into a quiff at the front. Every part is placed
   * in the head's own frame and then scaled up with the rest.
   */
  const H = BONE.head;
  const HK = 1.4;
  const headScale = new THREE.Matrix4().makeTranslation(0, -0.03, 0).multiply(new THREE.Matrix4().makeScale(HK, HK, HK));
  const addHM = (geo, hex, matrix) => addM(geo, H, hex, matrix.premultiply(headScale));
  const addH = (geo, hex, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    e.set(rx, ry, rz, 'YXZ');
    addHM(geo, hex, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(sx, sy, sz)));
  };
  /* The skull, the square jaw and a strong chin; the ears; the nose,
   * long and straight: the bridge, the tip and its wings. */
  addH(ball(28, 18), C.skin, 0, 0.14, -0.005, 0, 0, 0, 0.09, 0.112, 0.103);
  const skin = new THREE.Color(C.skin);
  const stubble = new THREE.Color(C.stubble);
  const smooth = (a, b, t) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  addH(blob(3.0, 0.38, 0.16, 30, 22), (out, x, y, z) => {
    /* Grey stubble over the chin and the jaw, and a shadow of it on the
     * upper lip, fading into the cheeks. */
    const chin = smooth(-0.02, -0.3, y) * smooth(-0.6, -0.1, z);
    const lip = smooth(0.25, 0.05, Math.abs(x)) * smooth(0.6, 0.85, z) * smooth(0.14, 0.0, y);
    out.copy(skin).lerp(stubble, Math.max(chin, lip));
  }, 0, 0.072, 0.014, 0, 0, 0, 0.073, 0.092, 0.084);
  for (const side of [-1, 1]) {
    addH(ball(10, 8), C.skin, 0.09 * side, 0.118, -0.008, 0, 0, 0, 0.017, 0.03, 0.022);
    addH(ball(8, 6), C.skinLo, 0.097 * side, 0.118, -0.002, 0, 0, 0, 0.009, 0.018, 0.012);
    addH(ball(8, 6), C.skin, 0.012 * side, 0.08, 0.104, 0, 0, 0, 0.009, 0.008, 0.009);
  }
  addH(tube(0.008, 0.014, 0.064, 10), C.skin, 0, 0.108, 0.1, -0.4, 0, 0);
  addH(ball(10, 8), C.skin, 0, 0.081, 0.114, 0, 0, 0, 0.015, 0.014, 0.015);
  /* The eyes, narrowed by the grin: the white, a blue grey iris, the
   * pupil and a glint, the upper lid's line, a crease under each, and the
   * brows, raised. */
  for (const side of [-1, 1]) {
    const x = 0.038 * side;
    const ry = 0.38 * side;
    addH(ball(12, 10), C.eye, x, 0.125, 0.086, 0, ry, 0, 0.018, 0.011, 0.006);
    addH(ball(10, 8), C.iris, x + 0.001 * side, 0.1235, 0.0905, 0, ry, 0, 0.0092, 0.0098, 0.004);
    addH(ball(8, 6), C.pupil, x + 0.001 * side, 0.1235, 0.0935, 0, ry, 0, 0.005, 0.0058, 0.003);
    addH(ball(6, 4), C.eye, x + 0.004, 0.1265, 0.0955, 0, ry, 0, 0.003, 0.003, 0.002);
    addH(box(0.044, 0.007, 0.01), C.lash, x, 0.1335, 0.0875, 0, ry, -0.05 * side);
    addH(box(0.03, 0.003, 0.006), C.skinLo, x + 0.008 * side, 0.11, 0.088, 0, ry, 0.22 * side);
    addH(box(0.012, 0.003, 0.006), C.skinLo, x + 0.03 * side, 0.122, 0.078, 0, ry * 2, 0.5 * side);
    addH(box(0.05, 0.0095, 0.011), C.brow, x + 0.003 * side, 0.153, 0.089, 0, ry, -0.08 * side);
  }
  /* His glasses: clear rectangular frames, the top a little heavier, the
   * bridge, the arms back to the ears, and a glint on each lens. */
  const rounded = (w, h, r, path) => {
    path.moveTo(-w / 2 + r, -h / 2);
    path.lineTo(w / 2 - r, -h / 2);
    path.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    path.lineTo(w / 2, h / 2 - r);
    path.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    path.lineTo(-w / 2 + r, h / 2);
    path.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    path.lineTo(-w / 2, -h / 2 + r);
    path.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return path;
  };
  const rim = rounded(0.06, 0.041, 0.011, new THREE.Shape());
  const lens = rounded(0.047, 0.028, 0.006, new THREE.Path());
  rim.holes.push(new THREE.Path(lens.getPoints(4).map((p) => new THREE.Vector2(p.x, p.y - 0.0015))));
  for (const side of [-1, 1]) {
    const frame = new THREE.ExtrudeGeometry(rim, { depth: 0.006, bevelEnabled: false, curveSegments: 4 });
    frame.translate(0, 0, -0.003);
    addH(frame, C.glasses, 0.041 * side, 0.127, 0.104, 0, 0.2 * side, 0);
    addH(box(0.005, 0.005, 0.105), C.glasses, 0.08 * side, 0.135, 0.05, 0, -0.19 * side, 0);
    addH(flatShape([[-0.006, -0.004], [-0.002, -0.004], [0.004, 0.007], [0, 0.007]]), C.glint,
      0.041 * side + 0.016 * side, 0.133, 0.1075 - 0.003, 0, 0.2 * side, 0);
  }
  addH(box(0.022, 0.005, 0.006), C.glasses, 0, 0.134, 0.109);
  /* The grin: wide and open, the top teeth, the tongue low in it, and the
   * smile lines from the nose's wings down past its corners. */
  addH(flatShape([[-0.034, 0], ...arc(0.034, 0.024, 14, Math.PI, 2 * Math.PI)]), C.mouth, 0, 0.058, 0.1035, 0.3);
  addH(flatShape([[-0.03, 0], [0.03, 0], [0.027, -0.008], [-0.027, -0.008]]), C.teeth, 0, 0.058, 0.1042, 0.3);
  addH(flatShape(arc(0.014, 0.006, 10, 0, 2 * Math.PI)), C.tongue, 0, 0.042, 0.1008, 0.3);
  for (const side of [-1, 1]) {
    addH(box(0.003, 0.032, 0.004), C.skinLo, 0.029 * side, 0.07, 0.1, 0.25, 0, 0.55 * side);
  }

  /*
   * The hair, one shell over the skull: a cap whose edge runs high off the
   * forehead, just over the ears and down to the nape, thickened over the
   * top and lifted at the front into a short quiff that rises from the
   * hairline and lies back. Alternate meridians of the cap run front to
   * back over the crown, and pushing every other one out a little combs it
   * into ridges, which the toon bands draw as strands. Salt and pepper:
   * silver at the temples and over the ears, darker toward the crown, the
   * ridges lighter than the furrows; and thin sideburns.
   */
  const silver = new THREE.Color(C.hairLo);
  const pepper = new THREE.Color(C.hairTop);
  const salt = new THREE.Color(C.hairHi);
  const dark = new THREE.Color(C.hair);
  const SEG = 32;
  const SPAN = 0.64;
  const cap = new THREE.SphereGeometry(1, SEG, 15, 0, Math.PI * 2, 0, Math.PI * SPAN);
  {
    const a = cap.attributes.position;
    const uv = cap.attributes.uv;
    const d = new THREE.Vector3();
    const tilt = new THREE.Matrix4().makeRotationX(-1.0);
    for (let i = 0; i < a.count; i += 1) {
      d.set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(tilt);
      /* 0 at the cap's edge, 1 at its pole, back over the crown. */
      const t = (uv.getY(i) - 1 + SPAN) / SPAN;
      const crown = smooth(0.15, 0.6, d.y) * smooth(0, 0.3, t);
      const quiff = smooth(0.02, 0.2, t) * smooth(-0.25, 0.55, d.z) * smooth(0.25, 0.75, d.y);
      const ridge = (i % (SEG + 1)) % 2 === 0 ? 1 : -1;
      const push = 1 + 0.09 * crown + 0.36 * quiff + 0.035 * ridge * crown;
      a.setXYZ(i, 0.096 * d.x * push, 0.142 + 0.119 * d.y * push, -0.008 + 0.11 * d.z * push);
    }
    cap.computeVertexNormals();
  }
  addHM(cap, (out, x, y, z, i) => {
    const top = smooth(0.17, 0.255, y);
    out.copy(silver).lerp(pepper, top);
    out.lerp((i % (SEG + 1)) % 2 === 0 ? salt : dark, 0.3 * top);
  }, new THREE.Matrix4());
  for (const side of [-1, 1]) {
    addH(ball(8, 6), C.hairLo, 0.086 * side, 0.106, 0.026, 0, 0.25 * side, 0, 0.004, 0.017, 0.008);
  }

  /* The arms: a sleeve, the upper arm, the elbow; the forearm and the hand,
   * thumb forward; the watch on the left wrist, its face on the back of it. */
  for (const [arm, fore, side] of [[BONE.armL, BONE.foreL, 1], [BONE.armR, BONE.foreR, -1]]) {
    add(ball(16, 8), arm, C.tee, 0, -0.02, 0, 0, 0, 0, 0.06, 0.058, 0.06);
    add(tube(0.062, 0.057, 0.15, 20), arm, C.tee, 0, -0.07, 0);
    add(tube(0.05, 0.045, 0.16, 20, true), arm, C.skin, 0, -0.2, 0);
    add(ball(14, 8), arm, C.skin, 0, -0.29, 0, 0, 0, 0, 0.045, 0.045, 0.045);
    add(tube(0.045, 0.036, 0.24, 20), fore, C.skin, 0, -0.12, 0);
    add(ball(14, 10), fore, C.skin, 0, -0.295, 0.004, 0, 0, 0, 0.027, 0.056, 0.045);
    add(ball(8, 6), fore, C.skin, 0, -0.27, 0.043, 0.5, 0, 0, 0.013, 0.029, 0.013);
    if (side > 0) {
      add(tube(0.04, 0.04, 0.028, 12), fore, C.watch, 0, -0.215, 0);
      add(box(0.008, 0.026, 0.024), fore, C.watchFace, 0.041, -0.215, 0);
    }
  }

  /* The legs: jeans to the ankle; the red shoes with white soles and laces. */
  for (const [th, sh, ft] of [[BONE.thighL, BONE.shinL, BONE.footL], [BONE.thighR, BONE.shinR, BONE.footR]]) {
    add(tube(0.095, 0.074, 0.43, 16), th, C.jeans, 0, -0.215, 0);
    add(ball(12, 8), th, C.jeans, 0, -0.43, 0, 0, 0, 0, 0.07, 0.07, 0.07);
    add(tube(0.07, 0.06, 0.4, 16, true), sh, C.jeans, 0, -0.2, 0);
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
    const far = Math.min(3, Math.max(1, dist / 20));
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
