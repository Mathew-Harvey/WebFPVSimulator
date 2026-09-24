/*
 * street.js: a bridge, a billboard, a utility pole, a street lamp, a
 * vending machine, a parked car and trees.
 *
 * THE BAR IS THE TOWN. Everything here is drawn to stand beside the
 * freestyle town's own street furniture (src/maps/city/vendored/world/)
 * and look as if one artist drew both: the town's pale, high key palette,
 * its violet shadow tints, and enough real structure (girders, stiffeners,
 * balustrade bars, crossarms, stringers) that the screen space ink has
 * edges to draw when the pilot skims past at half a metre, while the
 * silhouette alone carries the read at forty. Real dimensions throughout:
 * a pilot who knows what a 歩道橋 or a 電柱 looks like has to recognise it.
 *
 * The bridge, the vending machine and the car are boxes and keep to the
 * compass headings. The billboard, the poles, the lamp and the trees are
 * capsules and turn freely: a billboard's panel is solid as a stack of
 * horizontal capsules, the same way the race field makes a barrier at any
 * angle.
 *
 * THE PHYSICS CONTRACT, which every change here keeps. Anything a quad
 * could hit is a part in the layout and solid. A solid is the drawn shape
 * or sits just inside it, never outside (no invisible walls): a round post
 * is a capsule of the drawn polygon's inradius, a tapered one is two
 * capsules each as thin as its thinner end, a canopy blob holds a sphere of
 * the drawn icosahedron's inradius. A space between two solids is closed or
 * at least 1.4 m wherever a line is meant to be flown: a balustrade is a
 * solid screen, and the wedge under the foot of a stair is filled to the
 * ground where it is lower than that. Decoration that is not solid is thin
 * or out of reach.
 *
 * THE VENDING MACHINE AND THE CARS ARE THE TOWN'S, drawn by the vendored
 * builders in src/maps/city/vendored/world/ through the kit, so a kei van in
 * a built map is the same kei van that is parked outside the conbini. Their
 * solids are written here from the same dimensions those builders use.
 *
 * THE TREES ARE THE TOWN'S THREE GENERATORS, restated: buildSakura,
 * buildGrove and buildCedar from src/maps/city/vendored/world/trees.js, with
 * the same proportions, tones and ramps, laid out here with this module's
 * own sine so their solids are the same bits in every engine.
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

import { Parts, seededRandom, seedOf, around } from './parts.js';
import { sincos } from './trig.js';
import { TREE_STYLES } from './types.js';
import { canvas } from './textures.js';
import { PAL } from '../maps/city/vendored/core/palette.js';

/* ------------------------------------------------------------------ *
 * Small shared pieces.
 * ------------------------------------------------------------------ */

const TAU = 6.283185307179586;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* A dimension, read safely: a document that lost a field still builds. */
function dim(el, key, fallback, lo, hi) {
  const n = Number(el?.dims?.[key]);
  return clamp(Number.isFinite(n) ? n : fallback, lo, hi);
}

/*
 * A square root for numbers that reach the physics, from + - * / alone:
 * ECMAScript leaves Math.sqrt's last bit to the engine, and ./trig.js
 * gives the reason that matters. Newton's step from above falls
 * monotonically onto the root and stops the first time a step does not
 * fall, so the same argument gives the same bits everywhere. Drawing code
 * keeps Math.sqrt and Math.hypot.
 */
function rootOf(x) {
  if (!(x > 0)) {
    return 0;
  }
  let y = x > 1 ? x : 1;
  for (let i = 0; i < 64; i += 1) {
    const n = 0.5 * (y + x / y);
    if (!(n < y)) {
      break;
    }
    y = n;
  }
  return y;
}

/*
 * The inradius of a regular polygon of circumradius 1, cos(pi / n), as
 * literals. A cylinder drawn with n sides is a prism whose flats sit this
 * far in from its nominal radius, and a capsule solid must fit inside the
 * flats, not the corners.
 */
const INR = {
  4: 0.7071067811865476, 5: 0.8090169943749475, 6: 0.8660254037844387, 7: 0.9009688679024191,
  8: 0.9238795325112867, 10: 0.9510565162951535, 12: 0.9659258262890683, 16: 0.9807852804032304,
};

/*
 * A capsule inside a drawn cylinder from a to b, `seg` sided, with radius
 * rA at a and rB at b: as thick as the thinner end's flats allow, and pulled
 * in at both ends by its own radius so the round caps stay inside the flat
 * ends. Never drawn: the draw() paints the cylinder itself.
 */
function capIn(P, m, a, b, rA, rB, seg, opts = {}) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = rootOf(dx * dx + dy * dy + dz * dz);
  let r = (INR[seg] ?? 0.9) * (rA < rB ? rA : rB) * 0.98;
  if (len < 1e-6) {
    return null;
  }
  if (2 * r > len) {
    r = len / 2;
  }
  const k = r / len;
  return P.cap(m, [a[0] + dx * k, a[1] + dy * k, a[2] + dz * k], [b[0] - dx * k, b[1] - dy * k, b[2] - dz * k], r, { ...opts, draw: false });
}

/*
 * A tapered round post as two capsules: the lower half as thick as the
 * post is at its middle, the whole length as thick as it is at the top.
 * Overlapping them leaves no waist in the solid where they meet.
 */
function taperIn(P, m, a, b, rA, rB, seg, opts = {}) {
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const rMid = (rA + rB) / 2;
  capIn(P, m, a, mid, rA, rMid, seg, opts);
  capIn(P, m, a, b, rB, rB, seg, opts);
}

/* ------------------------------------------------------------------ *
 * Drawing helpers, browser only. Each takes the kit, `K`, which carries
 * Three.js, so this module never imports a renderer and Node can load it.
 * ------------------------------------------------------------------ */

/* Unit shapes made once and shared, the way the kit shares its own. */
const GEO = {};
function unitGeo(K, key) {
  if (!GEO[key]) {
    const T = K.THREE;
    if (key === 'box') {
      GEO[key] = new T.BoxGeometry(1, 1, 1);
    } else if (key === 'cone7') {
      /* The cedar's whorl: seven sides, base on the origin, as the town's. */
      GEO[key] = new T.ConeGeometry(1, 1, 7, 1);
      GEO[key].translate(0, 0.5, 0);
    }
  }
  return GEO[key];
}

/*
 * A box from a to b, `w` across (horizontal, square to the run) and `d`
 * deep in the plane that holds the run and the vertical. What a stringer,
 * a raked handrail or a lamp head is. The basis is (along, up, across) with
 * across = along x up, so it is right handed and no face turns inside out.
 */
function beam(K, mat, a, b, w, d) {
  const T = K.THREE;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) {
    return;
  }
  const X = new T.Vector3(dx / len, dy / len, dz / len);
  const Z = new T.Vector3(-X.z, 0, X.x);
  if (Z.lengthSq() < 1e-10) {
    Z.set(0, 0, 1);
  }
  Z.normalize();
  const Y = new T.Vector3().crossVectors(Z, X).normalize();
  const m = new T.Matrix4().makeBasis(X, Y, Z);
  m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.multiply(new T.Matrix4().makeScale(len, d, w));
  K.add(mat, unitGeo(K, 'box'), m);
}

/*
 * A run of vertical bars, [x, y0, y1, z] each, `hw` half wide, as one
 * geometry of four sided prisms with no ends: eight triangles a bar where
 * a box is twelve, and a 歩道橋 has six hundred of them. Winding is
 * outward on every face, checked by hand for +x and +z.
 */
function bars(K, mat, list, hw) {
  if (!list.length) {
    return;
  }
  const T = K.THREE;
  const n = list.length;
  const pos = new Float32Array(n * 48);
  const nor = new Float32Array(n * 48);
  const uv = new Float32Array(n * 32);
  const idx = new Uint32Array(n * 24);
  const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let v = 0;
  let k = 0;
  for (const [x, y0, y1, z] of list) {
    for (const [nx, nz] of faces) {
      const tx = -nz;
      const tz = nx;
      const cx = x + nx * hw;
      const cz = z + nz * hw;
      const corners = [
        [cx - tx * hw, y0, cz - tz * hw], [cx + tx * hw, y0, cz + tz * hw],
        [cx + tx * hw, y1, cz + tz * hw], [cx - tx * hw, y1, cz - tz * hw],
      ];
      for (let c = 0; c < 4; c += 1) {
        pos.set(corners[c], (v + c) * 3);
        nor.set([nx, 0, nz], (v + c) * 3);
      }
      idx.set([v, v + 2, v + 1, v, v + 3, v + 2], k);
      v += 4;
      k += 6;
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(nor, 3));
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.setIndex(new T.BufferAttribute(idx, 1));
  K.add(mat, g);
}

/*
 * A profile in (z, y), extruded along x from x0 to x1: a hammerhead pier
 * cap seen end on. The kit's own extrude() runs along z; this one maps the
 * shape's x to world -z so the basis stays right handed.
 */
function prismX(K, mat, profile, x0, x1) {
  const T = K.THREE;
  const shape = new T.Shape();
  profile.forEach(([z, y], i) => (i === 0 ? shape.moveTo(-z, y) : shape.lineTo(-z, y)));
  shape.closePath();
  const g = new T.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  const m = new T.Matrix4().makeBasis(new T.Vector3(0, 0, -1), new T.Vector3(0, 1, 0), new T.Vector3(1, 0, 0));
  m.setPosition(x0, 0, 0);
  K.add(mat, g, m);
}

/*
 * A plate wrapped round a pole: the utility pole's 電柱広告. The kit has
 * flat signs only, and a flat plate on a pole 0.35 m across stands off it
 * by five centimetres at its edges, which is what a pilot passing at a
 * metre sees first. One material per painted variant, made once and kept
 * for the page's life the way the kit keeps its own.
 */
const WRAP_MATS = new Map();
function wrapMat(K, v) {
  let m = WRAP_MATS.get(v);
  if (!m) {
    const T = K.THREE;
    const t = new T.CanvasTexture(polePlateCanvas(v));
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    m = new T.MeshBasicMaterial({ color: 0xffffff, map: t, side: T.DoubleSide });
    m.userData.propCast = false;
    m.userData.propReceive = true;
    WRAP_MATS.set(v, m);
  }
  return m;
}

function wrapPlate(K, v, y, r, h, faceYaw) {
  const T = K.THREE;
  /* 1.7 radians of arc, centred on +z, then turned to face its way: any
   * wider and the ends of the lettering run round the pole's flanks. */
  const g = new T.CylinderGeometry(r, r, h, 10, 1, true, -0.85, 1.7);
  const m = new T.Matrix4().makeRotationY(faceYaw);
  m.setPosition(0, y, 0);
  K.add(wrapMat(K, v), g, m);
}

/* ------------------------------------------------------------------ *
 * THIS FAMILY'S OWN COLOURS, merged into the kit's table by ./catalog.js,
 * prefixed so no other family can collide with them. Where the town has
 * the colour, it is the town's own number, so a map and the town share
 * one shader program for it.
 * ------------------------------------------------------------------ */

export const MATERIALS = {
  /* The grove (buildGrove) and the cedar plantation (buildCedar), their
   * wood and their three canopy tones, with the town's ramps. No canopy
   * receives shadow, for the reason trees.js gives at length: a ramp only
   * shapes direct light, and a shadowed deep green blob goes to ink. */
  stGroveWood: { c: PAL.trunkDark, tint: 0x6f5a80 },
  stGrove0: { c: 0x8cb884, tint: 0x5b6f8c, noReceive: true },
  stGrove1: { c: 0x5f9470, tint: 0x5b6f8c, noReceive: true },
  stGrove2: { c: PAL.cedar, tint: 0x5b6f8c, noReceive: true },
  stCedarWood: { c: PAL.cedarBark, tint: 0x6f5a80 },
  stCedar0: { c: PAL.cedarLit, tint: 0x59657f, noReceive: true },
  stCedar1: { c: PAL.cedar, tint: 0x59657f, noReceive: true },
  stCedar2: { c: PAL.cedarDeep, tint: 0x59657f, noReceive: true },
  /* The utility pole: the town's concrete, and its near black hardware. */
  stPole: { c: 0xd6d2d8, tint: 0x6a6288 },
  stPoleDark: { c: PAL.black, bands: 2, tint: 0x4b4560 },
  /* Galvanised steel: lamp posts, the gantry, the billboard's frame. */
  stGalv: { c: 0xc4c9d0, tint: 0x666090 },
  stGalvDark: { c: 0x9ea4ae, tint: 0x5c5680 },
  /* The road bridge: pale blue plate girders, a pale railing, the yellow
   * centre line, the joints, and the grey back of a road sign. */
  stGirder: { c: 0xa3bccd, tint: 0x5c6288 },
  stGirderDeep: { c: 0x87a0b3, tint: 0x545a80 },
  stRailing: { c: 0xd0d6dc, tint: 0x666090 },
  stLineYellow: { f: PAL.lineYellow, noCast: true },
  stJoint: { c: 0x5a5666, bands: 2, tint: 0x45405a },
  stSignBack: { c: 0x9aa0aa, tint: 0x5c5680 },
  stBronze: { c: 0x9c7d58, tint: 0x5f4f74 },
  /* The footbridge's stair: the town's tread and nosing (overbridge.js),
   * and a warm grey non slip deck. */
  stTread: { c: 0xc4c8d0, tint: 0x6a6288 },
  stNosing: { c: 0xe6d9a8, bands: 2, tint: 0x8f7050 },
  stWalk: { c: 0xaea8b3, tint: 0x605a80 },
  /* The billboard: a galvanised back and a white face frame. */
  stBillBack: { c: 0xb4bac3, tint: 0x5f5c80 },
  stBillFrame: { c: 0xf2efe9, tint: 0x7d74a0 },
  /* The recycling bin beside the machines, the town's teal. */
  stBin: { c: PAL.vendTeal, tint: 0x5c5680 },
  stBinHole: { c: 0x2f3140, bands: 2, tint: 0x4b4560 },
  stLabel: { f: 0xf6f2e8, noCast: true },
};

/* ------------------------------------------------------------------ *
 * THIS FAMILY'S PAINTED SIGNS. Every name is invented and every place is
 * the town's own (ひばり台, さくら坂): nothing imitates a real company, a
 * real road authority's sign or a real place.
 * ------------------------------------------------------------------ */

const JP = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', sans-serif`;
const LATIN = `'Helvetica Neue', Arial, 'Noto Sans', sans-serif`;
const INK = '#39324f';

function fitFont(g, text, maxW, size, font, weight = '700') {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${font}`;
    if (g.measureText(text).width <= maxW) {
      break;
    }
    s -= 2;
  } while (s > 8);
  return s;
}

function say(g, text, x, y, maxW, size, color, font = JP, weight = '700', align = 'center') {
  fitFont(g, text, maxW, size, font, weight);
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/* Characters one under another, the way a plate on a post is lettered. */
function column(g, text, x, y0, y1, size, color) {
  const chars = [...text];
  const step = (y1 - y0) / chars.length;
  const s = Math.min(size, step * 0.92);
  g.font = `700 ${s}px ${JP}`;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  chars.forEach((ch, i) => g.fillText(ch, x, y0 + step * (i + 0.5)));
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/* A thick white arrow from (x0, y0) to (x1, y1), head at the far end. */
function arrow(g, x0, y0, x1, y1, t, head, color) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const bx = x1 - ca * head;
  const by = y1 - sa * head;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x0 - sa * t / 2, y0 + ca * t / 2);
  g.lineTo(bx - sa * t / 2, by + ca * t / 2);
  g.lineTo(bx - sa * head * 0.62, by + ca * head * 0.62);
  g.lineTo(x1, y1);
  g.lineTo(bx + sa * head * 0.62, by - ca * head * 0.62);
  g.lineTo(bx + sa * t / 2, by - ca * t / 2);
  g.lineTo(x0 + sa * t / 2, y0 - ca * t / 2);
  g.closePath();
  g.fill();
}

/* The national route shield: an inverted shield, white edged, a number. */
function shield(g, cx, cy, s, n, fill, edge) {
  g.beginPath();
  g.moveTo(cx - s, cy - s * 0.9);
  g.lineTo(cx + s, cy - s * 0.9);
  g.quadraticCurveTo(cx + s * 1.05, cy + s * 0.25, cx, cy + s);
  g.quadraticCurveTo(cx - s * 1.05, cy + s * 0.25, cx - s, cy - s * 0.9);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = s * 0.12;
  g.strokeStyle = edge;
  g.stroke();
  say(g, String(n), cx, cy - s * 0.05, s * 1.5, s * 0.95, edge, LATIN, '900');
}

/*
 * 案内標識: the blue guide sign over a road, and the green one an
 * expressway uses. Toned a step toward the town's range, as its own signs
 * are, but still the saturated plate that is the one loud thing in a
 * Japanese street scene. Three layouts.
 */
function routeSign(v) {
  const W = 1024;
  const H = 512;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const green = v === 1;
  const bg = green ? '#2c7b58' : '#2f5fae';
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.lineWidth = 12;
  g.strokeStyle = '#f7f7f4';
  roundRect(g, 16, 16, W - 32, H - 32, 30);
  g.stroke();
  const white = '#f7f7f4';
  if (v === 0) {
    /* A crossroads: straight on, left and right, the arrows doing the work. */
    arrow(g, 512, 470, 512, 196, 44, 70, white);
    g.fillRect(372, 322, 280, 40);
    arrow(g, 400, 342, 300, 342, 40, 64, white);
    arrow(g, 624, 342, 724, 342, 40, 64, white);
    say(g, 'ひばり台', 512, 88, 420, 92, white);
    say(g, 'Hibaridai', 512, 152, 360, 38, white, LATIN, '700');
    say(g, 'さくら坂', 158, 312, 250, 70, white);
    say(g, 'Sakurazaka', 158, 372, 250, 30, white, LATIN, '700');
    say(g, 'ひばり駅', 866, 312, 250, 70, white);
    say(g, 'Hibari Sta.', 866, 372, 250, 30, white, LATIN, '700');
    shield(g, 150, 110, 52, 12, bg, white);
    shield(g, 874, 110, 52, 12, bg, white);
  } else if (v === 1) {
    /* An expressway exit: the numbered exit tab, the town, the arrow. */
    g.fillStyle = white;
    roundRect(g, 48, 48, 250, 96, 14);
    g.fill();
    say(g, '出口', 118, 96, 120, 60, bg);
    say(g, 'EXIT', 238, 96, 100, 36, bg, LATIN, '900');
    g.lineWidth = 8;
    g.strokeStyle = white;
    g.beginPath();
    g.arc(370, 96, 44, 0, TAU);
    g.stroke();
    say(g, '3', 370, 98, 60, 60, white, LATIN, '900');
    say(g, 'ひばり台', 400, 262, 600, 132, white);
    say(g, 'Hibaridai', 400, 382, 520, 54, white, LATIN, '700');
    arrow(g, 820, 430, 930, 180, 50, 90, white);
  } else {
    /* A distance sign: three places down the road ahead. */
    shield(g, 130, 256, 70, 12, bg, white);
    const rows = [['ひばり台', 'Hibaridai', '2'], ['さくら坂', 'Sakurazaka', '5'], ['ひばり山', 'Hibariyama', '12']];
    rows.forEach(([jp, en, km], i) => {
      const y = 118 + i * 138;
      say(g, jp, 250, y - 14, 300, 76, white, JP, '700', 'left');
      say(g, en, 250, y + 40, 300, 30, white, LATIN, '700', 'left');
      say(g, km, 830, y, 140, 96, white, LATIN, '900', 'right');
      say(g, 'km', 900, y + 18, 80, 44, white, LATIN, '700');
      if (i < 2) {
        g.fillStyle = 'rgba(247,247,244,0.55)';
        g.fillRect(240, y + 66, 700, 4);
      }
    });
  }
  return c;
}

/*
 * 橋名板: the bronze plates cast into a bridge's four corner posts. By
 * custom one carries the name in kanji, one in kana, one the river and one
 * the year it was finished. Raised dark letters with a lit upper edge,
 * which is how cast bronze reads at a glance.
 */
const BRIDGE_NAMES = ['ひばり大橋', 'ひばりおおはし', 'ひばり川', '令和五年竣工'];
function bridgeName(v) {
  const W = 128;
  const H = 384;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#8c6c48';
  g.fillRect(0, 0, W, H);
  g.lineWidth = 10;
  g.strokeStyle = '#5b4430';
  g.strokeRect(5, 5, W - 10, H - 10);
  g.lineWidth = 3;
  g.strokeStyle = '#c4a172';
  g.strokeRect(15, 15, W - 30, H - 30);
  const text = BRIDGE_NAMES[v % BRIDGE_NAMES.length];
  column(g, text, W / 2 + 2, 30, H - 28, 86, '#c9a877');
  column(g, text, W / 2, 28, H - 30, 86, '#3a2a1c');
  return c;
}

/* 屋外広告物 許可: the permit label every roadside hoarding carries. */
function permitPlate() {
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#f7f4ec';
  g.fillRect(0, 0, 256, 64);
  g.lineWidth = 4;
  g.strokeStyle = INK;
  g.strokeRect(2, 2, 252, 60);
  say(g, 'ひばり市許可 第12-345号', 128, 22, 236, 22, INK);
  say(g, '広告 ひばり広告社', 128, 46, 236, 18, '#6d6780');
  return c;
}

/* 住居表示: the blue block plate strapped to a street lamp. */
const BLOCKS = ['ひばり台二丁目', 'さくら坂一丁目', 'ひばり台五丁目'];
function blockPlate(v) {
  const c = canvas(96, 320);
  const g = c.getContext('2d');
  g.fillStyle = '#2f5fae';
  g.fillRect(0, 0, 96, 320);
  g.lineWidth = 5;
  g.strokeStyle = '#f7f7f4';
  g.strokeRect(8, 8, 80, 304);
  column(g, BLOCKS[v % BLOCKS.length], 48, 18, 302, 44, '#f7f7f4');
  return c;
}

/*
 * 電柱広告: the plates wrapped round a utility pole at head height, a
 * clinic's name and an arrow, or a warning. The single most Japanese
 * thing a street pole carries. Drawn here rather than borrowed from the
 * town's warning plate because it wraps (see wrapPlate).
 */
const POLE_ADS = [
  { bg: '#f2c14a', fg: INK, band: INK, t: 'ひばり内科', s: 'この先 50m' },
  { bg: '#f7f5ef', fg: '#2a4f97', band: '#e0453f', t: 'さくら坂歯科', s: '右へ 120m' },
  { bg: '#3b8a5f', fg: '#f7f5ef', band: '#f7f5ef', t: 'ひばり不動産', s: '駅前 3分' },
  { bg: '#f4c033', fg: '#322e3b', band: '#322e3b', t: '防犯カメラ', s: '作動中' },
];
function polePlateCanvas(v) {
  const ad = POLE_ADS[v % POLE_ADS.length];
  const W = 256;
  const H = 512;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = ad.bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = ad.band;
  g.fillRect(0, 0, W, 18);
  g.fillRect(0, H - 18, W, 18);
  column(g, ad.t, W / 2, 34, H - 118, 78, ad.fg);
  say(g, ad.s, W / 2, H - 70, W * 0.72, 40, ad.fg);
  return c;
}

export const PAINTERS = {
  stRouteSign: { variants: 3, paint: routeSign },
  stBridgeName: { variants: BRIDGE_NAMES.length, paint: bridgeName },
  stPermit: { variants: 1, paint: permitPlate },
  stBlock: { variants: BLOCKS.length, paint: blockPlate },
};

/* ------------------------------------------------------------------ *
 * THE BRIDGE. Two different things under one name, because a pilot means
 * two different things by it.
 *
 *   road        a Japanese urban overpass: a slab on steel plate girders,
 *               hammerhead piers (a portal frame when it is wide), concrete
 *               parapets with a railing, 親柱 corner posts with their bronze
 *               name plates, road lamps, and an overhead guide sign on a
 *               gantry when it is long enough to carry one.
 *   footbridge  the town's own kind of 歩道橋: pale green steel, a box deck
 *               with its name on the fascia and a blue guide sign hung on
 *               it, a balustrade of close bars, and at each end a landing
 *               and a stair that turns down along the road it crosses, the
 *               Z plan every 歩道橋 over a two lane road has.
 *
 * The deck is one box in both and it is landable; the air under it is the
 * point.
 * ------------------------------------------------------------------ */

function bridgeSpec(el) {
  const foot = el.style === 'footbridge';
  const span = dim(el, 'span', 24, 6, 80);
  const width = foot ? dim(el, 'width', 2.4, 1.8, 4) : dim(el, 'width', 8, 4, 20);
  const h = dim(el, 'height', 6, 3, 20);
  const piers = Math.round(dim(el, 'piers', 1, 0, 6));
  return { foot, span, width, h, piers };
}

export function bridgeLayout(el) {
  const s = bridgeSpec(el);
  return s.foot ? footLayout(s) : roadLayout(s);
}

export function bridgeDraw(el, parts, K) {
  const s = bridgeSpec(el);
  if (s.foot) {
    footDraw(s, K);
  } else {
    roadDraw(s, K);
  }
}

/* ---- the road bridge ---- */

const SLAB = 0.3;
const PAR_T = 0.35;
const PAR_H = 0.65;
const RAIL_TOP = 1.1;

/* Everything about a road bridge that the layout and the draw both need. */
function roadPlan(s) {
  const x0 = -s.span / 2;
  const x1 = s.span / 2;
  const z0 = -s.width / 2;
  const z1 = s.width / 2;
  /* Girders about two metres apart, never closer: the clear space between
   * two bottom flanges is then at least 1.5 m, a pocket a quad can be in
   * rather than a slot it cannot. */
  const n = Math.floor((s.width - 1.8) / 2.0) + 1;
  const girders = [];
  for (let i = 0; i < n; i += 1) {
    girders.push(n === 1 ? 0 : z0 + 0.9 + (i / (n - 1)) * (s.width - 1.8));
  }
  /* A plate girder is about one eighteenth of its span deep. */
  const bay = (s.span - 1.8) / (s.piers + 1);
  const gd = clamp(bay / 18, 0.7, 1.8);
  const yGb = s.h - SLAB - gd;
  const lines = [x0 + 0.9, x1 - 0.9];
  for (let i = 1; i <= s.piers; i += 1) {
    lines.push(x0 + (i / (s.piers + 1)) * s.span);
  }
  /* A hammerhead on one round column up to twelve metres wide, a portal of
   * two columns under a straight cap past that, which is what an urban
   * viaduct does. The cap stops short of the girders' ends so it reads. */
  const portal = s.width > 12;
  const capH = clamp(0.9 + s.width * 0.06, 1.0, 2.0);
  const capTop = yGb;
  const capBot = Math.max(0.8, capTop - capH);
  const colR = portal ? 0.7 : clamp(0.35 + s.width * 0.05, 0.55, 1.0);
  const cols = portal ? [z0 + 2.2, z1 - 2.2] : [0];
  const Wt = s.width - 1.0;
  const Wb = portal ? Wt : 2 * colR + 0.3;
  /* Lamps on the parapets, staggered, one per twenty six metres a side. */
  const nl = Math.max(1, Math.round(s.span / 26));
  const lamps = [];
  for (let i = 0; i < nl; i += 1) {
    lamps.push({ x: x0 + s.span * (i + 0.3) / nl, z: z0 + PAR_T / 2, o: 1 });
    lamps.push({ x: x0 + s.span * (i + 0.8) / nl, z: z1 - PAR_T / 2, o: -1 });
  }
  /* The guide sign gantry, when the span is long enough to hold it clear of
   * the lamps. The sign is centred on the road, 2:1, its underside 4.95 m
   * over the deck, which clears the 4.7 m a Japanese road asks for. */
  let gantry = null;
  if (s.span >= 16) {
    const Ws = Math.min(s.width - 1.6, 5.4);
    gantry = { x: x0 + s.span * 0.55, Ws, Hs: Ws / 2, yc: s.h + 4.95 + Ws / 4 };
  }
  return { x0, x1, z0, z1, girders, gd, yGb, lines, portal, capH, capTop, capBot, colR, cols, Wt, Wb, lamps, gantry };
}

/* The lamp's arm, as points out from the pole top toward the road. */
function roadLampArm(x, z, o, yTop) {
  return [
    [x, yTop - 0.55, z],
    [x, yTop - 0.05, z + o * 0.22],
    [x, yTop + 0.13, z + o * 0.8],
    [x, yTop + 0.2, z + o * 1.6],
  ];
}

function roadLayout(s) {
  const P = new Parts();
  const L = roadPlan(s);
  const { x0, x1, z0, z1 } = L;
  const h = s.h;
  /* The slab, landable. */
  P.box('concrete', x0, h - SLAB, z0, x1, h, z1, { name: 'deck' });
  /* The parapets: a concrete upstand, and the railing on it as one screen
   * as thick as its posts. Between the corner posts only. */
  for (const [za, zb] of [[z0, z0 + PAR_T], [z1 - PAR_T, z1]]) {
    P.box('concrete', x0 + 0.5, h, za, x1 - 0.5, h + PAR_H, zb, { name: 'parapet' });
    const zc = (za + zb) / 2;
    P.box('stRailing', x0 + 0.5, h + PAR_H, zc - 0.04, x1 - 0.5, h + RAIL_TOP, zc + 0.04, { draw: false, name: 'railing' });
  }
  /* The 親柱, one at each corner. */
  for (const [xa, xb] of [[x0, x0 + 0.5], [x1 - 0.5, x1]]) {
    for (const [za, zb] of [[z0, z0 + 0.5], [z1 - 0.5, z1]]) {
      P.box('concrete', xa, h, za, xb, h + 1.35, zb, { name: 'endPost' });
    }
  }
  /* The girders: a web and a bottom flange each, drawn by draw() with
   * their stiffeners, and solid as the two boxes they are. */
  for (const z of L.girders) {
    P.box('stGirder', x0 + 0.1, L.yGb, z - 0.07, x1 - 0.1, h - SLAB, z + 0.07, { draw: false, name: 'girder' });
    P.box('stGirder', x0 + 0.1, L.yGb, z - 0.26, x1 - 0.1, L.yGb + 0.08, z + 0.26, { draw: false, name: 'flange' });
  }
  /* The end diaphragm between each pair of girders over every pier, the
   * girders' full depth from the cap to the slab: a quad flying the pocket
   * between two girders meets it, and nothing is left above or below it
   * that is a slot. */
  for (const x of L.lines) {
    for (let i = 0; i < L.girders.length - 1; i += 1) {
      P.box('stGirderDeep', x - 0.05, L.yGb, L.girders[i] + 0.07, x + 0.05, h - SLAB, L.girders[i + 1] - 0.07, { name: 'crossFrame' });
    }
  }
  /* The piers. A hammerhead cap is a straight band on a taper; its solid is
   * the band and four boxes stepped inside the taper, so nothing solid is
   * outside the drawn cap and the steps are a hand's width at most. */
  for (const x of L.lines) {
    const xa = x - 0.7;
    const xb = x + 0.7;
    const band = L.portal ? L.capH : L.capH * 0.4;
    P.box('concrete', xa, L.capTop - band, -L.Wt / 2, xb, L.capTop, L.Wt / 2, { draw: false, name: 'cap' });
    if (!L.portal) {
      const taper = L.capTop - band - L.capBot;
      for (let k = 0; k < 4; k += 1) {
        const w = L.Wb + (L.Wt - L.Wb) * (k / 4);
        P.box('concrete', xa, L.capBot + taper * (k / 4), -w / 2, xb, L.capBot + taper * ((k + 1) / 4), w / 2, { draw: false, name: 'cap' });
      }
    }
    for (const z of L.cols) {
      capIn(P, 'concrete', [x, 0, z], [x, L.capBot + 0.4, z], L.colR, L.colR, 16, { name: 'column', kind: 'wall' });
      P.box('concreteDark', x - L.colR * 1.25, 0, z - L.colR * 1.25, x + L.colR * 1.25, 0.3, z + L.colR * 1.25, { name: 'footing' });
    }
  }
  /* The lamps: a tapered pole on the parapet, a curved arm, the head. */
  const yTop = h + 7.0;
  for (const lp of L.lamps) {
    taperIn(P, 'stGalv', [lp.x, h + PAR_H, lp.z], [lp.x, yTop, lp.z], 0.12, 0.08, 8, { name: 'lamp' });
    const arm = roadLampArm(lp.x, lp.z, lp.o, yTop);
    for (let i = 0; i < arm.length - 1; i += 1) {
      capIn(P, 'stGalv', arm[i], arm[i + 1], 0.05, 0.05, 6, { name: 'lampArm' });
    }
    P.cap('lampHead', [lp.x, yTop + 0.16, lp.z + lp.o * 1.62], [lp.x, yTop + 0.2, lp.z + lp.o * 2.2], 0.06, { draw: false, name: 'lampHead' });
  }
  /* The gantry: two posts on the parapets, a truss across (solid as its
   * envelope, since the panels of a truss are slots), the sign hung on the
   * truss's near face. */
  if (L.gantry) {
    const G = L.gantry;
    const zp = [z0 + PAR_T / 2, z1 - PAR_T / 2];
    for (const z of zp) {
      capIn(P, 'stGalv', [G.x, h + PAR_H, z], [G.x, h + 6.9, z], 0.16, 0.16, 10, { name: 'gantryPost' });
    }
    P.box('stGalv', G.x - 0.11, h + 5.78, zp[0], G.x + 0.11, h + 6.72, zp[1], { draw: false, name: 'gantry' });
    P.box('stSignBack', G.x + 0.13, G.yc - G.Hs / 2, -G.Ws / 2, G.x + 0.31, G.yc + G.Hs / 2, G.Ws / 2, { name: 'sign' });
  }
  return P.list;
}

/* A railing: posts every two metres, a mid rail and a round top rail. */
function railRun(K, mat, xa, xb, zc, y) {
  const n = Math.max(1, Math.round((xb - xa) / 2));
  for (let i = 0; i <= n; i += 1) {
    const x = xa + ((xb - xa) * i) / n;
    K.box(mat, x - 0.04, y, zc - 0.04, x + 0.04, y + 0.42, zc + 0.04);
  }
  K.cyl(mat, [xa, y + 0.2, zc], [xb, y + 0.2, zc], 0.03, 6);
  K.cyl(mat, [xa, y + 0.405, zc], [xb, y + 0.405, zc], 0.045, 8);
}

function roadDraw(s, K) {
  const L = roadPlan(s);
  const { x0, x1, z0, z1 } = L;
  const h = s.h;
  const ze0 = z0 + PAR_T;
  const ze1 = z1 - PAR_T;
  /* The carriageway: tarmac, white edge lines, a yellow centre line on a
   * road wide enough for two lanes, and a dark joint over every pier. */
  K.box('asphalt', x0 + 0.5, h - 0.01, ze0, x1 - 0.5, h + 0.012, ze1);
  K.box('asphalt', x0, h - 0.01, z0 + 0.5, x0 + 0.5, h + 0.012, z1 - 0.5);
  K.box('asphalt', x1 - 0.5, h - 0.01, z0 + 0.5, x1, h + 0.012, z1 - 0.5);
  K.box('lineWhite', x0, h + 0.012, ze0 + 0.25, x1, h + 0.02, ze0 + 0.4);
  K.box('lineWhite', x0, h + 0.012, ze1 - 0.4, x1, h + 0.02, ze1 - 0.25);
  /* One solid yellow line, 追越し禁止: a double line 0.14 m apart
   * aliases into dots at forty metres. */
  if (s.width >= 6) {
    K.box('stLineYellow', x0, h + 0.012, -0.09, x1, h + 0.02, 0.09);
  }
  for (const x of L.lines.slice(2)) {
    K.box('stJoint', x - 0.08, h + 0.012, ze0, x + 0.08, h + 0.022, ze1);
  }
  /* The slab's edge: a darker drip band under the fascia, the line that
   * separates the deck from the girders in the ink. */
  K.box('concreteDark', x0, h - SLAB - 0.001, z0 - 0.01, x1, h - SLAB + 0.08, z0 + 0.4);
  K.box('concreteDark', x0, h - SLAB - 0.001, z1 - 0.4, x1, h - SLAB + 0.08, z1 + 0.01);
  /* The parapet's coping and the railing on it; a construction joint down
   * its outer face every five metres and a scupper under the slab edge
   * between them, which is what stops a long fascia reading as one blank
   * band from the ground. */
  for (const zc of [z0 + PAR_T / 2, z1 - PAR_T / 2]) {
    K.box('wallWhite', x0 + 0.5, h + PAR_H, zc - PAR_T / 2 - 0.02, x1 - 0.5, h + PAR_H + 0.04, zc + PAR_T / 2 + 0.02);
    railRun(K, 'stRailing', x0 + 0.5, x1 - 0.5, zc, h + PAR_H + 0.04);
  }
  const nj = Math.max(1, Math.round(s.span / 5));
  for (let i = 1; i < nj; i += 1) {
    const x = x0 + (s.span * i) / nj;
    for (const [za, zb] of [[z0 - 0.008, z0], [z1, z1 + 0.008]]) {
      K.box('concreteDark', x - 0.02, h - SLAB + 0.08, za, x + 0.02, h + PAR_H, zb);
    }
    const xs = x - s.span / nj / 2;
    for (const [zo, zi] of [[z0 - 0.12, z0 + 0.1], [z1 + 0.12, z1 - 0.1]]) {
      K.cyl('stGalvDark', [xs, h - SLAB + 0.02, zi], [xs, h - SLAB - 0.28, zo], 0.05, 6);
    }
  }
  /* The 親柱: a cap on each, and a bronze plate on the face the road sees. */
  let v = 0;
  for (const [xa, xb] of [[x0, x0 + 0.5], [x1 - 0.5, x1]]) {
    for (const [za, zb, face] of [[z0, z0 + 0.5, '+z'], [z1 - 0.5, z1, '-z']]) {
      K.box('concreteDark', xa - 0.04, h + 1.35, za - 0.04, xb + 0.04, h + 1.42, zb + 0.04);
      const zf = face === '+z' ? zb + 0.012 : za - 0.012;
      K.box('stBronze', (xa + xb) / 2 - 0.16, h + 0.3, Math.min(zf, zf + (face === '+z' ? -0.01 : 0.01)),
        (xa + xb) / 2 + 0.16, h + 1.2, Math.max(zf, zf + (face === '+z' ? -0.01 : 0.01)));
      K.sign('stBridgeName', (xa + xb) / 2, h + 0.75, zf + (face === '+z' ? 0.002 : -0.002), 0.28, 0.84, face, v);
      v += 1;
    }
  }
  /* The girders: web, bottom flange and stiffeners every two metres, both
   * faces, which is what makes an underside read as steel from below. */
  const webTop = h - SLAB;
  for (const z of L.girders) {
    K.box('stGirder', x0 + 0.1, L.yGb, z - 0.07, x1 - 0.1, webTop, z + 0.07);
    K.box('stGirderDeep', x0 + 0.1, L.yGb, z - 0.26, x1 - 0.1, L.yGb + 0.08, z + 0.26);
    K.box('stGirderDeep', x0 + 0.1, webTop - 0.06, z - 0.2, x1 - 0.1, webTop, z + 0.2);
    for (let x = x0 + 1.2; x < x1 - 0.6; x += 2.0) {
      K.box('stGirderDeep', x - 0.03, L.yGb + 0.08, z - 0.2, x + 0.03, webTop - 0.06, z + 0.2);
    }
  }
  /* The piers. */
  for (const x of L.lines) {
    const xa = x - 0.7;
    const xb = x + 0.7;
    if (L.portal) {
      K.box('concrete', xa, L.capBot, -L.Wt / 2, xb, L.capTop, L.Wt / 2);
    } else {
      const band = L.capH * 0.4;
      prismX(K, 'concrete', [
        [-L.Wt / 2, L.capTop], [L.Wt / 2, L.capTop], [L.Wt / 2, L.capTop - band],
        [L.Wb / 2, L.capBot], [-L.Wb / 2, L.capBot], [-L.Wt / 2, L.capTop - band],
      ], xa, xb);
    }
    /* Bearing pads under each girder, on the cap. */
    for (const z of L.girders) {
      K.box('stJoint', x - 0.3, L.capTop - 0.02, z - 0.3, x + 0.3, L.capTop + 0.01, z + 0.3);
    }
    for (const z of L.cols) {
      K.cyl('concrete', [x, 0, z], [x, L.capBot + 0.4, z], L.colR, 16);
      K.box('concreteDark', x - L.colR * 1.25, 0, z - L.colR * 1.25, x + L.colR * 1.25, 0.3, z + L.colR * 1.25);
      /* A drain pipe down the column's flank. */
      const zd = z + L.colR + 0.07;
      K.cyl('stGalvDark', [x + 0.2, 0.3, zd], [x + 0.2, L.capBot + 0.1, zd], 0.06, 6);
      K.cyl('stGalvDark', [x + 0.2, L.capBot + 0.1, zd], [x + 0.2, L.capTop, zd], 0.06, 6);
    }
  }
  /* The lamps. */
  const yTop = h + 7.0;
  for (const lp of L.lamps) {
    K.cyl('stGalv', [lp.x, h + PAR_H, lp.z], [lp.x, yTop, lp.z], 0.12, 8, 0.08);
    K.cyl('stGalvDark', [lp.x, h + PAR_H, lp.z], [lp.x, h + PAR_H + 0.35, lp.z], 0.16, 8, 0.14);
    const arm = roadLampArm(lp.x, lp.z, lp.o, yTop);
    for (let i = 0; i < arm.length - 1; i += 1) {
      K.cyl('stGalv', arm[i], arm[i + 1], 0.05, 6);
    }
    beam(K, 'lampHead', [lp.x, yTop + 0.15, lp.z + lp.o * 1.5], [lp.x, yTop + 0.21, lp.z + lp.o * 2.3], 0.34, 0.14);
    beam(K, 'lampGlow', [lp.x, yTop + 0.075, lp.z + lp.o * 1.62], [lp.x, yTop + 0.125, lp.z + lp.o * 2.2], 0.24, 0.02);
  }
  /* The gantry: posts, a two chord truss with its web, the sign. */
  if (L.gantry) {
    const G = L.gantry;
    const zp = [z0 + PAR_T / 2, z1 - PAR_T / 2];
    for (const z of zp) {
      K.cyl('stGalv', [G.x, h + PAR_H, z], [G.x, h + 6.9, z], 0.16, 10);
      K.box('stGalvDark', G.x - 0.25, h + PAR_H, z - 0.25, G.x + 0.25, h + PAR_H + 0.06, z + 0.25);
    }
    const ya = h + 5.9;
    const yb = h + 6.6;
    K.cyl('stGalv', [G.x, ya, zp[0]], [G.x, ya, zp[1]], 0.12, 10);
    K.cyl('stGalv', [G.x, yb, zp[0]], [G.x, yb, zp[1]], 0.12, 10);
    const nb = Math.max(2, Math.round((zp[1] - zp[0]) / 0.8));
    for (let i = 0; i < nb; i += 1) {
      const za = zp[0] + ((zp[1] - zp[0]) * i) / nb;
      const zb = zp[0] + ((zp[1] - zp[0]) * (i + 1)) / nb;
      K.cyl('stGalvDark', [G.x, ya, za], [G.x, yb, za], 0.04, 5);
      K.cyl('stGalvDark', i % 2 ? [G.x, ya, za] : [G.x, yb, za], i % 2 ? [G.x, yb, zb] : [G.x, ya, zb], 0.035, 5);
    }
    /* The sign faces +x, the traffic coming toward it; its grey back and
     * the brackets that hold it face the truss. */
    K.sign('stRouteSign', G.x + 0.312, G.yc, 0, G.Ws - 0.04, G.Hs - 0.04, '+x', Math.round(s.span * 7 + s.width) % 3);
    for (const zz of [-G.Ws / 3, G.Ws / 3]) {
      K.box('stGalvDark', G.x + 0.02, G.yc - G.Hs / 2 + 0.1, zz - 0.05, G.x + 0.13, G.yc + G.Hs / 2 - 0.1, zz + 0.05);
    }
  }
}

/* ---- the footbridge ---- */

const FOOT_DECK = 0.75;
const RISE = 0.15;
const GOING = 0.3;
const MID_LANDING = 1.4;
/* A step's box reaches this far under its tread, which is enough to hold
 * the stringer drawn along it. */
const STEP_D = 0.36;
/* Under this, the wedge under a flight is a slot, and it is closed. */
const CLOSE_UNDER = 1.5;
const BAL_H = 1.15;
/* The head landings' columns: a 歩道橋 stands on few, stout pipes. */
const FOOT_COL = 0.24;

/*
 * The plan: a deck along x, a landing past each end of it, and from each
 * landing a stair that turns down along z, east one way and west the other.
 * Stairs are 0.15 m risers on 0.30 m goings with a landing at least every
 * 3.2 m of height, the proportions the town's own overbridge uses.
 */
function footPlan(s) {
  const w = s.width;
  const x0 = -s.span / 2;
  const x1 = s.span / 2;
  const z0 = -w / 2;
  const z1 = w / 2;
  const N = Math.max(2, Math.round(s.h / RISE));
  const rise = s.h / N;
  const nf = Math.max(1, Math.ceil(s.h / 3.2));
  const ends = [
    { xa: x1, xb: x1 + w, t: z1, dir: 1 },
    { xa: x0 - w, xb: x0, t: z0, dir: -1 },
  ];
  const stairs = ends.map((e) => {
    const steps = [];
    const lands = [];
    const runs = [];
    let y = s.h;
    let t = e.t;
    for (let f = 0; f < nf; f += 1) {
      const n = Math.floor(N / nf) + (f < N % nf ? 1 : 0);
      runs.push({ y0: y, t0: t, y1: y - n * rise, t1: t + e.dir * n * GOING, n });
      for (let i = 0; i < n; i += 1) {
        const top = y - (i + 1) * rise;
        const ta = t + e.dir * i * GOING;
        const tb = t + e.dir * (i + 1) * GOING;
        if (top > 1e-3) {
          steps.push({ top, t0: Math.min(ta, tb), t1: Math.max(ta, tb), front: tb });
        }
      }
      y -= n * rise;
      t += e.dir * n * GOING;
      if (f < nf - 1) {
        const tb = t + e.dir * MID_LANDING;
        lands.push({ y, t0: Math.min(t, tb), t1: Math.max(t, tb), tm: (t + tb) / 2 });
        t = tb;
      }
    }
    return { ...e, steps, lands, runs, tEnd: t };
  });
  /* A landing or a stretch of deck is carried on two columns, or on one
   * when two would leave less than the gap rule between them. */
  /* Two columns 0.3 in from the edges, 0.24 thick, leave 1.4 m between
   * them from a width of 2.48; narrower, one in the middle. */
  const colZ = w >= 2.5 ? [0.3, -0.3] : [null];
  return { x0, x1, z0, z1, w, rise, stairs, colZ };
}

/* Column lines across a stretch from a to b: inset from each edge, or one
 * in the middle when the stretch is too narrow for two with 1.4 m between. */
function footCols(F, a, b) {
  return F.colZ.map((k) => (k === null ? (a + b) / 2 : k > 0 ? a + k : b + k));
}

function footLayout(s) {
  const P = new Parts();
  const F = footPlan(s);
  const { x0, x1, z0, z1, w } = F;
  const h = s.h;
  const dy = h - FOOT_DECK;
  /* The deck and both head landings, one landable box. */
  P.box('bridgeSteel', x0 - w, dy, z0, x1 + w, h, z1, { name: 'deck' });
  /* The balustrades round it, solid screens as thick as the capping, open
   * where each stair leaves. */
  const scr = (xa, za, xb, zb, y) => P.box('bridgeSteelDark', xa, y, za, xb, y + BAL_H, zb, { draw: false, name: 'balustrade' });
  scr(x0, z0, x1 + w, z0 + 0.1, h);
  scr(x0 - w, z1 - 0.1, x1, z1, h);
  scr(x1 + w - 0.1, z0, x1 + w, z1, h);
  scr(x0 - w, z0, x0 - w + 0.1, z1, h);
  /* The guide sign hung on the +z fascia, flush to it. */
  if (s.span >= 6) {
    const Ws = Math.min(4, s.span - 2);
    P.box('stSignBack', -Ws / 2, dy, z1, Ws / 2, dy + Ws / 2, z1 + 0.14, { name: 'sign' });
  }
  /* The stairs. */
  for (const st of F.stairs) {
    for (const p of st.steps) {
      const bot = p.top - STEP_D < CLOSE_UNDER ? 0 : p.top - STEP_D;
      P.box('stTread', st.xa, bot, p.t0, st.xb, p.top, p.t1, { name: 'step', draw: bot > 0 });
      /* The raking balustrade over this tread, both sides, its top under
       * the handrail's lowest point over the tread. */
      P.box('bridgeSteelDark', st.xa, p.top, p.t0, st.xa + 0.1, p.top + 0.98, p.t1, { draw: false, name: 'balustrade' });
      P.box('bridgeSteelDark', st.xb - 0.1, p.top, p.t0, st.xb, p.top + 0.98, p.t1, { draw: false, name: 'balustrade' });
    }
    for (const ld of st.lands) {
      const bot = ld.y - STEP_D < CLOSE_UNDER ? 0 : ld.y - STEP_D;
      P.box('bridgeSteel', st.xa, bot, ld.t0, st.xb, ld.y, ld.t1, { name: 'landing' });
      scr(st.xa, ld.t0, st.xa + 0.1, ld.t1, ld.y);
      scr(st.xb - 0.1, ld.t0, st.xb, ld.t1, ld.y);
      if (bot > 0) {
        for (const xz of footCols(F, st.xa, st.xb)) {
          capIn(P, 'bridgeSteel', [xz, 0, ld.tm], [xz, bot, ld.tm], 0.17, 0.17, 12, { name: 'column' });
        }
      }
    }
    /* The head landing stands on a pair of stout columns across its
     * middle, the way a 歩道橋's stair tower does. */
    for (const z of footCols(F, z0, z1)) {
      capIn(P, 'bridgeSteel', [(st.xa + st.xb) / 2, 0, z], [(st.xa + st.xb) / 2, dy, z], FOOT_COL, FOOT_COL, 12, { name: 'column' });
    }
  }
  /* Columns under the deck, where the author asked for piers. */
  for (let i = 1; i <= s.piers; i += 1) {
    const x = x0 + (i / (s.piers + 1)) * s.span;
    for (const z of footCols(F, z0, z1)) {
      capIn(P, 'bridgeSteel', [x, 0, z], [x, dy, z], FOOT_COL, FOOT_COL, 12, { name: 'column' });
    }
  }
  return P.list;
}

/*
 * A level balustrade from `from` to `to` along `axis` ('x' or 'z') at `at`:
 * newel posts about every 1.8 m, a flat capping, a mid rail, and bars at
 * 0.11 m centres, the town's own spacing (overbridge.js): a screen you see
 * the road through, where 0.3 is a fence and 0.05 aliases into a band.
 */
function balustrade(K, axis, at, from, to, y, skip = null) {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const len = b - a;
  const put = (mat, t0, t1, y0, y1, half) => {
    if (axis === 'x') {
      K.box(mat, t0, y0, at - half, t1, y1, at + half);
    } else {
      K.box(mat, at - half, y0, t0, at + half, y1, t1);
    }
  };
  const np = Math.max(1, Math.round(len / 1.8));
  for (let i = 0; i <= np; i += 1) {
    const t = a + (len * i) / np;
    put('bridgeSteel', t - 0.035, t + 0.035, y, y + BAL_H, 0.035);
  }
  put('bridgeSteel', a - 0.035, b + 0.035, y + BAL_H - 0.03, y + BAL_H + 0.03, 0.05);
  put('bridgeSteelDark', a, b, y + 0.105, y + 0.155, 0.03);
  const nb = Math.max(2, Math.round(len / 0.11));
  const list = [];
  for (let i = 1; i < nb; i += 1) {
    const t = a + (len * i) / nb;
    if (skip && t > skip[0] && t < skip[1]) {
      continue;
    }
    list.push(axis === 'x' ? [t, y + 0.155, y + BAL_H - 0.03, at] : [at, y + 0.155, y + BAL_H - 0.03, t]);
  }
  bars(K, 'bridgeSteel', list, 0.011);
}

function footDraw(s, K) {
  const F = footPlan(s);
  const { x0, x1, z0, z1, w } = F;
  const h = s.h;
  const dy = h - FOOT_DECK;
  /* The walking surface, a warm grey inside the fascias. */
  K.box('stWalk', x0 - w + 0.1, h - 0.01, z0 + 0.1, x1 + w - 0.1, h + 0.012, z1 - 0.1);
  /* The fascia: a darker band a third of the way down both faces and
   * round the ends, and a soffit plate, the lines that make the deck read
   * as a box girder rather than a plank. */
  for (const [za, zb] of [[z0 - 0.012, z0], [z1, z1 + 0.012]]) {
    K.box('bridgeSteelDark', x0 - w, h - 0.3, za, x1 + w, h - 0.24, zb);
    K.box('bridgeSteelDark', x0 - w, dy - 0.001, za, x1 + w, dy + 0.06, zb);
  }
  K.box('bridgeSteelDark', x0 - w + 0.12, dy - 0.012, z0 + 0.12, x1 + w - 0.12, dy, z1 - 0.12);
  /* Balustrades round the deck and landings, open where the stairs leave. */
  balustrade(K, 'x', z0 + 0.05, x0, x1 + w, h);
  const sign = s.span >= 6;
  const Ws = Math.min(4, s.span - 2);
  /* Behind the guide sign the bars are never seen. */
  balustrade(K, 'x', z1 - 0.05, x0 - w, x1, h, sign ? [-Ws / 2 + 0.05, Ws / 2 - 0.05] : null);
  balustrade(K, 'z', x1 + w - 0.05, z0, z1, h);
  balustrade(K, 'z', x0 - w + 0.05, z0, z1, h);
  /* The name on both fascias, the guide sign on the +z one. */
  K.sign('bridgePlate', 0, h - 0.42, z0 - 0.014, 2.4, 0.45, '-z', 0);
  K.sign('bridgePlate', sign ? x0 + 1.5 : 0, h - 0.42, z1 + 0.014, 2.4, 0.45, '+z', 0);
  if (sign) {
    K.sign('stRouteSign', 0, dy + Ws / 4, z1 + 0.142, Ws - 0.04, Ws / 2 - 0.04, '+z', 0);
  }
  /* Two of the town's small ad boards on the -z balustrade. */
  if (s.span >= 10) {
    for (const [x, v] of [[-s.span / 4, 0], [s.span / 4, 1]]) {
      K.townSign('bridgeAd', v, x, h + 0.62, z0 - 0.02, 1.5, 0.62, '-z');
    }
  }
  /* The stairs: a nosing on every tread, stringers down both sides, and a
   * raking balustrade over them. */
  const slope = F.rise / GOING;
  for (const st of F.stairs) {
    for (const p of st.steps) {
      /* Where the wedge under the stair is filled, it is a concrete base
       * with the steel tread and riser standing on it. */
      if (p.top - STEP_D < CLOSE_UNDER) {
        K.box('stTread', st.xa, p.top - 0.2, p.t0, st.xb, p.top, p.t1);
        K.box('concrete', st.xa + 0.02, 0, p.t0, st.xb - 0.02, p.top - 0.2, p.t1);
      }
      const f = p.front;
      const back = f - st.dir * 0.06;
      K.box('stNosing', st.xa + 0.1, p.top, Math.min(f, back), st.xb - 0.1, p.top + 0.018, Math.max(f, back));
    }
    for (const run of st.runs) {
      const nose = (t) => run.y0 - Math.abs(t - run.t0) * slope;
      for (const xc of [st.xa + 0.05, st.xb - 0.05]) {
        /* The stringer: its top 0.15 over the nosing line, 0.45 deep. */
        beam(K, 'bridgeSteel', [xc, run.y0 - 0.105, run.t0], [xc, run.y1 - 0.105, run.t1], 0.11, 0.45);
        /* The handrail, 0.95 over the nosings, and the bars, one a tread. */
        K.cyl('bridgeSteel', [xc, run.y0 + 0.95, run.t0], [xc, run.y1 + 0.95, run.t1], 0.035, 6);
        const list = [];
        for (let i = 0; i < run.n; i += 1) {
          const t = run.t0 + st.dir * (i + 0.5) * GOING;
          const yb = nose(t);
          if (yb < 0.05) {
            continue;
          }
          list.push([xc, yb + 0.15, yb + 0.94, t]);
          if (i % 6 === 0) {
            K.box('bridgeSteel', xc - 0.035, yb + 0.1, t - 0.035, xc + 0.035, yb + 1.0, t + 0.035);
          }
        }
        bars(K, 'bridgeSteel', list, 0.011);
      }
    }
    for (const ld of st.lands) {
      K.box('stWalk', st.xa + 0.1, ld.y - 0.01, ld.t0, st.xb - 0.1, ld.y + 0.012, ld.t1);
      balustrade(K, 'z', st.xa + 0.05, ld.t0, ld.t1, ld.y);
      balustrade(K, 'z', st.xb - 0.05, ld.t0, ld.t1, ld.y);
      if (ld.y - STEP_D >= CLOSE_UNDER) {
        for (const xz of footCols(F, st.xa, st.xb)) {
          footColumn(K, xz, ld.tm, ld.y - STEP_D, 0.17);
        }
      }
    }
    for (const z of footCols(F, z0, z1)) {
      footColumn(K, (st.xa + st.xb) / 2, z, dy, FOOT_COL);
    }
  }
  for (let i = 1; i <= s.piers; i += 1) {
    const x = x0 + (i / (s.piers + 1)) * s.span;
    for (const z of footCols(F, z0, z1)) {
      footColumn(K, x, z, dy, FOOT_COL);
    }
  }
}

/* A steel pipe column: a base plate on a plinth, the pipe, a bracket
 * under what it carries. */
function footColumn(K, x, z, top, r) {
  K.box('concrete', x - r - 0.14, 0, z - r - 0.14, x + r + 0.14, 0.12, z + r + 0.14);
  K.box('metalDark', x - r - 0.08, 0.12, z - r - 0.08, x + r + 0.08, 0.16, z + r + 0.08);
  K.cyl('bridgeSteel', [x, 0.16, z], [x, top, z], r, 12);
  K.box('bridgeSteelDark', x - r - 0.05, top - 0.16, z - r - 0.05, x + r + 0.05, top, z + r + 0.05);
}

/* ------------------------------------------------------------------ *
 * THE BILLBOARD. A 野立て看板 on steel pipe legs: the advert in a white
 * frame on its face, a galvanised back braced by a truss the way a real one
 * is, a catwalk along its foot and lamps over its head. The gap under it is
 * the line. The face looks along +x.
 * ------------------------------------------------------------------ */

/* The catwalk's rails over its deck: a top rail, a knee rail and two
 * between, so the railing is a screen and not a 0.45 m slot. */
const CATWALK_RAILS = [0.25, 0.5, 0.75, 1.0];

/* The panel's half thickness, and so the radius of its capsule stack. */
const BB_T = 0.18;
const BB_FRAME_X = -BB_T - 0.07;

function billboardSpec(el) {
  const W = dim(el, 'width', 8, 2, 20);
  const H = dim(el, 'height', 3.2, 1.2, 8);
  const lift = dim(el, 'lift', 5, 1.5, 30);
  const legR = clamp(0.1 + W * 0.018, 0.16, 0.28);
  const legs = W < 5 ? [0] : [-W * 0.3, W * 0.3];
  const legX = -BB_T - legR;
  const legTop = lift + H * 0.85;
  /* The back frame: rails across, uprights between them, a diagonal in
   * every panel, all touching the back of the board so there is no slot
   * between the frame and the sheet. */
  const rails = H > 2.2 ? [lift + 0.2, lift + H / 2, lift + H - 0.2] : [lift + 0.2, lift + H - 0.2];
  const nu = Math.max(1, Math.round((W - 0.4) / 1.6));
  const ups = [];
  for (let i = 0; i <= nu; i += 1) {
    ups.push(-W / 2 + 0.2 + ((W - 0.4) * i) / nu);
  }
  const nl = Math.max(2, Math.round(W / 3));
  const lamps = [];
  for (let i = 0; i < nl; i += 1) {
    lamps.push(-W / 2 + (W * (i + 0.5)) / nl);
  }
  return { W, H, lift, legR, legs, legX, legTop, rails, ups, lamps };
}

export function billboardLayout(el) {
  const s = billboardSpec(el);
  const P = new Parts();
  for (const z of s.legs) {
    capIn(P, 'stGalv', [s.legX, 0, z], [s.legX, s.legTop, z], s.legR, s.legR, 12, { name: 'leg', kind: 'pole' });
  }
  /* The board, solid as a stack of horizontal capsules as thick as the
   * drawn panel, close enough to overlap, whose round ends stop at its
   * edges. */
  const r = BB_T * 0.97;
  const n = Math.max(1, Math.ceil((s.H - 2 * r) / (1.5 * r)));
  for (let i = 0; i <= n; i += 1) {
    const y = s.lift + r + (i / n) * (s.H - 2 * r);
    P.cap('stBillBack', [0, y, -s.W / 2 + r], [0, y, s.W / 2 - r], r, { draw: false, name: 'panel', kind: 'wall' });
  }
  /* The back frame. */
  for (const y of s.rails) {
    P.cap('stGalv', [BB_FRAME_X, y, -s.W / 2 + 0.2], [BB_FRAME_X, y, s.W / 2 - 0.2], 0.064, { draw: false, name: 'frame' });
  }
  const y0 = s.rails[0];
  const y1 = s.rails[s.rails.length - 1];
  for (const z of s.ups) {
    P.cap('stGalv', [BB_FRAME_X, y0, z], [BB_FRAME_X, y1, z], 0.042, { draw: false, name: 'frame' });
  }
  for (let j = 0; j < s.rails.length - 1; j += 1) {
    for (let i = 0; i < s.ups.length - 1; i += 1) {
      const up = (i + j) % 2 === 0;
      P.cap('stGalv', [BB_FRAME_X, up ? s.rails[j] : s.rails[j + 1], s.ups[i]], [BB_FRAME_X, up ? s.rails[j + 1] : s.rails[j], s.ups[i + 1]], 0.027, { draw: false, name: 'brace' });
    }
  }
  /* The catwalk: its deck as three bars inside the drawn grating, and its
   * two rails. */
  for (const x of [0.36, 0.64, 0.92]) {
    P.cap('grating', [x, s.lift - 0.11, -s.W / 2 + 0.05], [x, s.lift - 0.11, s.W / 2 - 0.05], 0.05, { draw: false, name: 'catwalk' });
  }
  for (const y of CATWALK_RAILS) {
    P.cap('stGalv', [0.96, s.lift + y, -s.W / 2 + 0.03], [0.96, s.lift + y, s.W / 2 - 0.03], 0.026, { draw: false, name: 'catwalkRail' });
  }
  /* The lamps over its head: the arm and the head. */
  for (const z of s.lamps) {
    capIn(P, 'stGalv', [0.12, s.lift + s.H + 0.02, z], [0.82, s.lift + s.H + 0.5, z], 0.035, 0.035, 5, { name: 'lampArm' });
    P.cap('lampHead', [0.95, s.lift + s.H + 0.48, z - 0.09], [0.95, s.lift + s.H + 0.48, z + 0.09], 0.07, { draw: false, name: 'lamp' });
  }
  return P.list;
}

export function billboardDraw(el, parts, K) {
  const s = billboardSpec(el);
  const rng = seededRandom(seedOf(el));
  const { W, H, lift } = s;
  const top = lift + H;
  /* The board: a galvanised box, a white frame round its face, the advert
   * in the frame, a flashing along its top. */
  K.box('stBillBack', -BB_T, lift, -W / 2, BB_T, top, W / 2);
  const fx0 = BB_T;
  const fx1 = BB_T + 0.035;
  const fw = 0.13;
  K.box('stBillFrame', fx0, top - fw, -W / 2, fx1, top, W / 2);
  K.box('stBillFrame', fx0, lift, -W / 2, fx1, lift + fw, W / 2);
  K.box('stBillFrame', fx0, lift + fw, -W / 2, fx1, top - fw, -W / 2 + fw);
  K.box('stBillFrame', fx0, lift + fw, W / 2 - fw, fx1, top - fw, W / 2);
  K.sign('mangaAd', BB_T + 0.004, lift + H / 2, 0, W - 2 * fw, H - 2 * fw, '+x', rng.int(0, 999));
  K.sign('stPermit', fx1 + 0.002, lift + fw / 2, W / 2 - 0.55, 0.44, 0.11, '+x', 0);
  K.box('stGalvDark', -BB_T - 0.04, top, -W / 2 - 0.04, BB_T + 0.06, top + 0.06, W / 2 + 0.04);
  /* The back frame, drawn as the members its solids are. */
  for (const y of s.rails) {
    K.cyl('stGalv', [BB_FRAME_X, y, -W / 2 + 0.2], [BB_FRAME_X, y, W / 2 - 0.2], 0.07, 8);
  }
  const y0 = s.rails[0];
  const y1 = s.rails[s.rails.length - 1];
  for (const z of s.ups) {
    K.cyl('stGalvDark', [BB_FRAME_X, y0, z], [BB_FRAME_X, y1, z], 0.05, 6);
  }
  for (let j = 0; j < s.rails.length - 1; j += 1) {
    for (let i = 0; i < s.ups.length - 1; i += 1) {
      const up = (i + j) % 2 === 0;
      K.cyl('stGalvDark', [BB_FRAME_X, up ? s.rails[j] : s.rails[j + 1], s.ups[i]], [BB_FRAME_X, up ? s.rails[j + 1] : s.rails[j], s.ups[i + 1]], 0.035, 5);
    }
  }
  /* The legs: pipe, a base plate with its bolts, a low round plinth. */
  for (const z of s.legs) {
    K.cyl('stGalv', [s.legX, 0.12, z], [s.legX, s.legTop, z], s.legR, 12);
    K.cyl('concrete', [s.legX, 0, z], [s.legX, 0.12, z], s.legR * 2.6, 10);
    K.box('metalDark', s.legX - s.legR * 1.5, 0.12, z - s.legR * 1.5, s.legX + s.legR * 1.5, 0.16, z + s.legR * 1.5);
    /* A collar where the leg meets the frame, and step rungs up it. */
    K.cyl('stGalvDark', [s.legX, lift - 0.25, z], [s.legX, lift + 0.05, z], s.legR * 1.12, 12);
    for (let y = 2.6; y < lift - 0.4; y += 0.4) {
      const sd = Math.round(y / 0.4) % 2 ? 1 : -1;
      K.cyl('stGalvDark', [s.legX, y, z + sd * s.legR * 0.8], [s.legX, y, z + sd * (s.legR + 0.18)], 0.014, 4);
    }
  }
  /* The catwalk: brackets off the board, a grating deck with a toe board,
   * posts and two rails. */
  for (let z = -W / 2 + 0.3; z <= W / 2 - 0.29; z += Math.max(1.2, (W - 0.6) / Math.max(1, Math.round((W - 0.6) / 1.6)))) {
    beam(K, 'stGalvDark', [BB_T, lift - 0.4, z], [1.0, lift - 0.17, z], 0.06, 0.08);
  }
  K.box('grating', BB_T + 0.01, lift - 0.16, -W / 2, 1.0, lift - 0.06, W / 2);
  K.box('stGalvDark', 0.93, lift - 0.06, -W / 2, 0.99, lift + 0.08, W / 2);
  const np = Math.max(2, Math.round(W / 1.6));
  for (let i = 0; i <= np; i += 1) {
    const z = -W / 2 + (W * i) / np;
    K.box('stGalv', 0.935, lift - 0.06, z - 0.025, 0.985, lift + 1.02, z + 0.025);
  }
  for (const y of CATWALK_RAILS) {
    K.cyl('stGalv', [0.96, lift + y, -W / 2], [0.96, lift + y, W / 2], 0.03, 8);
  }
  /* The lamps: an arm up and out, a head tipped back at the face. */
  for (const z of s.lamps) {
    K.cyl('stGalv', [0.12, top + 0.02, z], [0.82, top + 0.5, z], 0.035, 5);
    beam(K, 'lampHead', [0.76, top + 0.56, z], [1.14, top + 0.4, z], 0.34, 0.15);
    beam(K, 'lampGlow', [0.78, top + 0.475, z], [1.1, top + 0.34, z], 0.26, 0.02);
  }
}

/* ------------------------------------------------------------------ *
 * THE UTILITY POLE, the town's 電柱 (props.js makePole) at the height the
 * author asks for: a tapered concrete pole on a collar, two crossarms with
 * their insulators, a pair of transformer cans on a bracket, a switch box,
 * a 防犯灯 on its own arm, a cable bundle, step bolts, the pole's number
 * and a wrapped 電柱広告, and the yellow and black sleeve at its foot.
 *
 * The wires run from its insulator tops to the nearest other pole, drawn by
 * the map (src/maps/built/index.js, wireAnchors), which asks
 * poleWireAnchors below where the tops are: h - 0.25 over z = -0.8, 0, 0.8
 * and h - 1.38 over z = +-0.6. The wires are not solid; the pole, the arms,
 * the insulators and the cans are.
 * ------------------------------------------------------------------ */

const POLE_R0 = 0.19;
const POLE_R1 = 0.11;
/* The two crossarms' centres below the top, and where their insulators
 * stand. Each insulator is drawn from 0.05 to 0.20 over its arm's centre,
 * which puts its top at h - 0.25 and h - 1.38, the wire anchors. */
const POLE_ARMS = [
  { dy: 0.45, len: 2.0, zs: [-0.8, 0, 0.8] },
  { dy: 1.58, len: 1.52, zs: [-0.6, 0.6] },
];

/*
 * Where the wires leave a pole, in its own frame, grouped by crossarm: the
 * insulator tops. src/maps/built/index.js's wireAnchors() reads them from
 * here rather than keeping its own copy, so a change to the arms cannot
 * leave the wires hanging off air.
 */
export function poleWireAnchors(el) {
  const h = dim(el, 'height', 10, 5, 16);
  return POLE_ARMS.map((arm) => arm.zs.map((z) => [0, h - arm.dy + 0.2, z]));
}

function poleSpec(el) {
  const h = dim(el, 'height', 10, 5, 16);
  const rng = seededRandom(seedOf(el));
  return { h, ty: h - 2.95, plate: rng.int(0, POLE_ADS.length - 1), number: rng.int(0, 79) };
}

/* The pole's radius at height y, for anything strapped to it. */
const poleR = (h, y) => POLE_R0 + (POLE_R1 - POLE_R0) * (y / h);

export function poleLayout(el) {
  const s = poleSpec(el);
  const { h, ty } = s;
  const P = new Parts();
  taperIn(P, 'stPole', [0, 0, 0], [0, h, 0], POLE_R0, POLE_R1, 8, { name: 'pole' });
  /* The crossarms, a capsule inside each 0.09 by 0.10 section, and the
   * insulators standing on them: a quad skimming an arm meets those, so
   * they are solid too, each a small capsule inside its drawn pot. */
  for (const arm of POLE_ARMS) {
    const y = h - arm.dy;
    P.cap('stPoleDark', [0, y, -arm.len / 2 + 0.044], [0, y, arm.len / 2 - 0.044], 0.044, { draw: false, name: 'arm' });
    for (const z of arm.zs) {
      P.cap('insulatorWhite', [0, y + 0.105, z], [0, y + 0.145, z], 0.05, { draw: false, name: 'insulator' });
    }
  }
  /* The transformer: two cans under a bracket on the +x side, a switch box
   * opposite. */
  for (const z of [-0.42, 0.42]) {
    capIn(P, 'metal', [0.34, ty - 0.12, z], [0.34, ty + 0.6, z], 0.24, 0.24, 10, { name: 'transformer', kind: 'obstacle' });
  }
  P.cap('metal', [0.34, ty + 0.69, -0.68], [0.34, ty + 0.69, 0.68], 0.065, { draw: false, name: 'bracket' });
  capIn(P, 'stPoleDark', [-0.24, ty + 0.85, 0], [-0.24, ty + 1.35, 0], 0.14, 0.14, 4, { name: 'switch' });
  /* The 防犯灯: its arm and its shade. */
  const ly = h - 3.9;
  capIn(P, 'metal', [0, ly, 0], [-1.05, ly + 0.12, 0], 0.045, 0.045, 6, { name: 'lampArm' });
  P.cap('metal', [-1.12, ly + 0.02, 0], [-1.12, ly + 0.02, 0], 0.09, { draw: false, name: 'lamp' });
  return P.list;
}

export function poleDraw(el, parts, K) {
  const s = poleSpec(el);
  const { h, ty } = s;
  /* The pole and its collar. */
  K.cyl('stPole', [0, 0, 0], [0, h, 0], POLE_R0, 8, POLE_R1);
  K.cyl('stPole', [0, 0, 0], [0, 0.22, 0], 0.28, 8, 0.24);
  K.cyl('stPoleDark', [0, h, 0], [0, h + 0.05, 0], POLE_R1 * 1.05, 8);
  /* The crossarms, a brace under each, insulators and their pins. */
  for (const arm of POLE_ARMS) {
    const y = h - arm.dy;
    const len = arm.len;
    const zs = arm.zs;
    K.box('stPoleDark', -0.045, y - 0.05, -len / 2, 0.045, y + 0.05, len / 2);
    beam(K, 'metal', [0, y - 0.05, -len * 0.3], [0, y - 0.55, -0.02], 0.04, 0.04);
    beam(K, 'metal', [0, y - 0.05, len * 0.3], [0, y - 0.55, 0.02], 0.04, 0.04);
    for (const z of zs) {
      K.cyl('metal', [0, y + 0.05, z], [0, y + 0.1, z], 0.02, 5);
      K.cyl('insulatorWhite', [0, y + 0.05, z], [0, y + 0.2, z], 0.075, 7, 0.058);
      K.cyl('insulatorWhite', [0, y + 0.09, z], [0, y + 0.12, z], 0.09, 7);
    }
  }
  /* The transformer: a bracket, two cans with their lids and fins, the
   * bushings on top, and the switch box on the far side. */
  K.box('metal', 0.09, ty + 0.62, -0.75, 0.59, ty + 0.76, 0.75);
  for (const z of [-0.42, 0.42]) {
    K.cyl('metal', [0.34, ty - 0.12, z], [0.34, ty + 0.6, z], 0.24, 10);
    K.cyl('metalDark', [0.34, ty + 0.56, z], [0.34, ty + 0.62, z], 0.26, 10);
    K.cyl('metalDark', [0.34, ty - 0.16, z], [0.34, ty - 0.1, z], 0.2, 10);
    for (const a of [-0.8, 0.8]) {
      K.box('metalDark', 0.34 + 0.24 * a - 0.015, ty - 0.05, z - 0.12, 0.34 + 0.24 * a + 0.015, ty + 0.5, z + 0.12);
    }
    K.cyl('insulatorWhite', [0.28, ty + 0.76, z], [0.28, ty + 0.92, z], 0.04, 6);
  }
  K.box('stPoleDark', -0.38, ty + 0.85, -0.14, -0.1, ty + 1.35, 0.14);
  /* The 防犯灯: arm, conical shade, the lamp's lit disc under it. */
  const ly = h - 3.9;
  K.cyl('metal', [0, ly, 0], [-1.05, ly + 0.12, 0], 0.05, 6);
  K.cone('metal', [-1.12, ly - 0.08, 0], 0.3, 0.24, 12);
  K.cyl('lampGlow', [-1.12, ly - 0.1, 0], [-1.12, ly - 0.08, 0], 0.2, 12);
  /* The cable bundle up the road side, into the transformer. */
  K.cyl('stPoleDark', [0.15, 0.3, 0.07], [0.15, ty - 0.1, 0.07], 0.045, 5);
  /* Step bolts, alternate sides, from out of reach of a passer by. */
  for (let y = 2.4; y < h - 1.9; y += 0.45) {
    const sd = Math.round(y / 0.45) % 2 ? 1 : -1;
    const r = poleR(h, y);
    K.cyl('metalDark', [0, y, sd * r * 0.8], [0, y, sd * (r + 0.26)], 0.013, 4);
  }
  /* The yellow and black sleeve at its foot, the 電柱広告 wrapped round it
   * at head height facing the road, and the number plate on the far side. */
  K.cyl('hazard', [0, 0.25, 0], [0, 2.0, 0], poleR(h, 0.25) + 0.012, 10, poleR(h, 2.0) + 0.012);
  wrapPlate(K, s.plate, 2.5, poleR(h, 2.5) + 0.018, 0.64, Math.PI / 2);
  K.sign('polePlate', -poleR(h, 3.2) - 0.012, 3.2, 0, 0.16, 0.62, '-x', s.number);
}

/* ------------------------------------------------------------------ *
 * THE STREET LAMP, a 道路照明 pole: a galvanised taper on a flared base
 * with its access door, a bow arm out over +x, and a flat LED head lit
 * underneath. The block plate strapped to it says which 丁目 this is.
 * ------------------------------------------------------------------ */

function lampSpec(el) {
  const H = dim(el, 'height', 7, 3, 12);
  /* The arm and head scale with the pole, within what a real one does: a
   * three metre path lamp has a short stub, a twelve metre road lamp a
   * reach of two and a half. */
  const k = clamp(H / 7, 0.55, 1.3);
  const top = H - 0.35 * k;
  const arm = [
    [0, top, 0],
    [0.08 * k, H - 0.08 * k, 0],
    [0.36 * k, H + 0.08 * k, 0],
    [0.9 * k, H + 0.16 * k, 0],
    [1.5 * k, H + 0.2 * k, 0],
  ];
  const rng = seededRandom(seedOf(el));
  return { H, k, top, arm, block: rng.int(0, BLOCKS.length - 1) };
}

/* The pole's taper, below the arm. */
const LAMP_R0 = 0.11;
const LAMP_R1 = 0.065;

export function lampLayout(el) {
  const s = lampSpec(el);
  const P = new Parts();
  taperIn(P, 'stGalv', [0, 0, 0], [0, s.top, 0], LAMP_R0, LAMP_R1, 10, { name: 'lampPost' });
  for (let i = 0; i < s.arm.length - 1; i += 1) {
    capIn(P, 'stGalv', s.arm[i], s.arm[i + 1], 0.05, 0.05, 6, { name: 'lampArm' });
  }
  /* The head's capsule, inside its 0.12 deep body and 0.05 short of its
   * ends so the round caps stay in. */
  const k = s.k;
  const hx0 = 1.3 * k + 0.05;
  const hx1 = 2.02 * k - 0.05;
  const hy = (x) => s.H + 0.2 * k + (0.04 * k) * ((x - 1.3 * k) / (0.72 * k));
  P.cap('lampHead', [hx0, hy(hx0), 0], [hx1, hy(hx1), 0], 0.05, { draw: false, name: 'lampHead' });
  return P.list;
}

export function lampDraw(el, parts, K) {
  const s = lampSpec(el);
  const { H, k } = s;
  /* The base: a footing ring, a flared cover with its door, a collar. */
  K.cyl('concrete', [0, 0, 0], [0, 0.08, 0], 0.26, 10);
  K.cyl('stGalvDark', [0, 0.08, 0], [0, 0.85, 0], 0.16, 10, 0.12);
  K.box('stGalv', 0.13, 0.25, -0.05, 0.155, 0.6, 0.05);
  K.cyl('stGalvDark', [0, 0.85, 0], [0, 0.93, 0], 0.13, 10);
  /* The pole and its bow arm. */
  K.cyl('stGalv', [0, 0.08, 0], [0, s.top, 0], LAMP_R0, 10, LAMP_R1);
  for (let i = 0; i < s.arm.length - 1; i += 1) {
    K.cyl('stGalv', s.arm[i], s.arm[i + 1], 0.05, 6);
  }
  /* The head: a flat dark body with a lit lens under it, tipped up a hair
   * at its outer end the way they are. */
  beam(K, 'lampHead', [1.3 * k, H + 0.2 * k, 0], [2.02 * k, H + 0.24 * k, 0], 0.32, 0.12);
  beam(K, 'lampHead', [1.34 * k, H + 0.27 * k, 0], [1.9 * k, H + 0.3 * k, 0], 0.22, 0.04);
  beam(K, 'lampGlow', [1.38 * k, H + 0.14 * k - 0.001, 0], [1.94 * k, H + 0.17 * k - 0.001, 0], 0.22, 0.02);
  /* The block plate, facing the way the lamp faces, at eye height. */
  const y = Math.min(2.6, H * 0.45);
  const r = LAMP_R0 + (LAMP_R1 - LAMP_R0) * (y / s.top);
  K.box('metalDark', r - 0.01, y + 0.26, -0.02, r + 0.02, y + 0.3, 0.02);
  K.sign('stBlock', r + 0.014, y, 0, 0.14, 0.46, '+x', s.block);
}

/* ------------------------------------------------------------------ *
 * THE VENDING MACHINES, the town's, facing +x, in a row with the recycling
 * bin that stands beside every bank of them. 1.12 m wide, 1.95 tall and
 * 0.72 deep, from src/maps/city/vendored/world/vending.js; the solid runs
 * to the ground, which closes the slot under the plinth.
 * ------------------------------------------------------------------ */

const VEND = { W: 1.12, H: 1.95, D: 0.72 };
/* The joint between two machines in a bank. Their solids each reach half
 * of it, so the row is one wall and not a row with slots in it. */
const VEND_JOINT = 0.02;

function vendingSpec(el) {
  const n = Math.round(dim(el, 'count', 2, 1, 4));
  const zs = [];
  for (let i = 0; i < n; i += 1) {
    zs.push((i - (n - 1) / 2) * (VEND.W + VEND_JOINT));
  }
  /* The bin close against the last machine's flank. */
  const bin = { x: 0.02, z: zs[n - 1] + VEND.W / 2 + 0.26 };
  return { n, zs, bin };
}

export function vendingLayout(el) {
  const s = vendingSpec(el);
  const P = new Parts();
  for (const z of s.zs) {
    const j = VEND_JOINT / 2;
    P.box('vendWhite', -VEND.D / 2, 0, z - VEND.W / 2 - j, VEND.D / 2, VEND.H, z + VEND.W / 2 + j, { draw: false, name: 'vending', kind: 'obstacle' });
  }
  capIn(P, 'stBin', [s.bin.x, 0, s.bin.z], [s.bin.x, 0.92, s.bin.z], 0.22, 0.24, 10, { name: 'bin', kind: 'obstacle' });
  return P.list;
}

export function vendingDraw(el, parts, K) {
  const s = vendingSpec(el);
  const rng = seededRandom(seedOf(el));
  for (const z of s.zs) {
    /* The town's machine faces +z; a quarter turn puts its face on +x. */
    K.town('vending', { variant: rng.int(0, 2), seed: rng.int(1, 99) }, [0, 0, z], Math.PI / 2);
  }
  /* The bin: a teal drum, a dark lid with its two mouths, a label. */
  const { x, z } = s.bin;
  K.cyl('stBin', [x, 0, z], [x, 0.86, z], 0.22, 10, 0.24);
  K.cyl('metalDark', [x, 0.86, z], [x, 0.92, z], 0.26, 10);
  for (const d of [-0.1, 0.1]) {
    K.cyl('stBinHole', [x, 0.92, z + d], [x, 0.935, z + d], 0.075, 8);
  }
  K.box('stLabel', x + 0.228, 0.56, z - 0.14, x + 0.236, 0.68, z + 0.14);
}

/* ------------------------------------------------------------------ *
 * THE PARKED CAR, the town's, nose along +x. The dimensions are the SPEC
 * table in the vendored vehicles.js, restated here because that module
 * draws with Three.js and this one must not; the solids are that
 * builder's own masses:
 *
 *   under   ground to the sill, the valance's footprint. The drawn valance
 *           stops 0.15 m up, and a 0.15 m slot under a car is not a line.
 *   body    sill to waist, the full length and width.
 *   glass   the glasshouse as two boxes: the roof's length above half its
 *           height, and below that as far out as the raked screens reach
 *           at that half height, so the screens' wedges are solid to
 *           within half their depth rather than not at all.
 *   box     a box lorry's body.
 * ------------------------------------------------------------------ */

export const CAR_KINDS = {
  kei: { L: 3.40, W: 1.475, H: 1.70, sill: 0.38, waist: 1.00, roof: 1.70, cab: [-1.60, 1.15], rakeF: 0.42, rakeR: 0.14 },
  keivan: { L: 3.40, W: 1.475, H: 1.88, sill: 0.38, waist: 1.02, roof: 1.88, cab: [-1.66, 1.55], rakeF: 0.28, rakeR: 0.06 },
  hatch: { L: 4.05, W: 1.695, H: 1.52, sill: 0.36, waist: 0.98, roof: 1.52, cab: [-1.72, 0.88], rakeF: 0.62, rakeR: 0.52 },
  sedan: { L: 4.42, W: 1.695, H: 1.44, sill: 0.36, waist: 0.97, roof: 1.44, cab: [-1.55, 0.95], rakeF: 0.68, rakeR: 0.62 },
  wagon: { L: 4.25, W: 1.690, H: 1.54, sill: 0.36, waist: 0.97, roof: 1.54, cab: [-1.92, 0.93], rakeF: 0.60, rakeR: 0.16 },
  minivan: { L: 4.34, W: 1.695, H: 1.80, sill: 0.38, waist: 1.06, roof: 1.80, cab: [-2.00, 1.32], rakeF: 0.58, rakeR: 0.14 },
  van: { L: 4.44, W: 1.695, H: 1.98, sill: 0.40, waist: 1.12, roof: 1.98, cab: [-2.14, 2.02], rakeF: 0.32, rakeR: 0.06 },
  boxtruck: {
    L: 4.80, W: 1.755, H: 2.46, sill: 0.46, waist: 1.20, roof: 1.98, cab: [0.42, 2.16], rakeF: 0.28, rakeR: 0.10,
    box: { x0: -2.40, x1: 0.28, y0: 1.06, y1: 2.46 },
  },
  minibus: { L: 6.30, W: 2.08, H: 2.60, sill: 0.52, waist: 1.26, roof: 2.60, cab: [-3.04, 2.94], rakeF: 0.26, rakeR: 0.08 },
};
/* The body's own width, which for the box lorry is the chassis's, 1.695:
 * its box body stands 30 mm proud of the cab on each flank. */
const CAR_BODY_W = { boxtruck: 1.695 };
const CAR_COLOURS = ['white', 'white', 'pearl', 'silver', 'silver', 'cream', 'gunmetal', 'charcoal', 'skyblue', 'slate', 'mint', 'forest', 'wine', 'tea', 'mustard', 'navy'];

export function carLayout(el) {
  const kind = CAR_KINDS[el.style] ? el.style : 'kei';
  const k = CAR_KINDS[kind];
  const W = CAR_BODY_W[kind] ?? k.W;
  const P = new Parts();
  const o = { draw: false, kind: 'obstacle' };
  P.box('carBody', -(k.L - 0.16) / 2, 0, -(W - 0.07) / 2, (k.L - 0.16) / 2, k.sill, (W - 0.07) / 2, { ...o, name: 'under' });
  P.box('carBody', -k.L / 2, k.sill, -W / 2, k.L / 2, k.waist, W / 2, { ...o, name: 'body' });
  const rf = k.cab[1] - k.rakeF;
  const rr = k.cab[0] + k.rakeR;
  const ym = (k.waist + k.roof) / 2;
  const cw = (W - 0.14) / 2;
  P.box('carBody', (k.cab[0] + rr) / 2, k.waist, -cw, (k.cab[1] + rf) / 2, ym, cw, { ...o, name: 'glass' });
  P.box('carBody', rr, ym, -cw, rf, k.roof, cw, { ...o, name: 'glass' });
  if (k.box) {
    const b = k.box;
    P.box('carBody', b.x0, b.y0, -(W + 0.06) / 2, b.x1, b.y1, (W + 0.06) / 2, { ...o, name: 'box' });
    /* The 0.14 m between the cab's back and the box's front is a slot, and
     * it is closed to the cab's roof. */
    P.box('carBody', b.x1, k.waist, -cw, (k.cab[0] + rr) / 2, k.roof, cw, { ...o, name: 'cabGap' });
  }
  return P.list;
}

export function carDraw(el, parts, K) {
  const rng = seededRandom(seedOf(el));
  K.town('car', { kind: CAR_KINDS[el.style] ? el.style : 'kei', colour: rng.pick(CAR_COLOURS) }, [0, 0, 0], 0);
}

/* ------------------------------------------------------------------ *
 * TREES, the town's three: the cherry (buildSakura), the green broadleaf
 * of its groves (buildGrove) as the street tree, and the cedar of its
 * plantations (buildCedar) as the pine. Same proportions, same tones by
 * height, same faceted blobs and seven sided whorls; laid out with this
 * module's own sine and square root, so the solids are the same bits in
 * every engine.
 *
 * Every blob holds a solid sphere of the drawn icosahedron's inradius
 * (0.7947 of its smaller radius, taken as 0.78), and every whorl the
 * largest sphere it holds and a capsule up its axis inside the slant. A
 * pilot who clips a canopy is where the picture says they are, and never
 * meets leaves that are not drawn; the outermost tips of a blob or a
 * whorl's skirt are drawn and not solid, which is the side to be wrong on
 * for leaves.
 * ------------------------------------------------------------------ */

/* (1 - k / n) ^ 0.82 for n = 5 and 6: the cedar's taper, as literals,
 * because Math.pow is not the same bits in every engine. */
const CEDAR_TAPER = {
  5: [1, 0.832787, 0.657785, 0.471725, 0.267205],
  6: [1, 0.861135, 0.717142, 0.566442, 0.406219, 0.2301],
};

const SC = { s: 0, c: 1 };
const SC2 = { s: 0, c: 1 };

function unit3(v) {
  const l = rootOf(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 1, 0];
}

/* A trunk leaning by `lean` toward `dir`, from the ground, as its tip. */
function leanTip(len, lean, dir) {
  sincos(lean, SC);
  sincos(dir, SC2);
  return [SC.s * SC2.c * len, SC.c * len, SC.s * SC2.s * len];
}

/* A limb out of `from` at azimuth `a` and tilt `tilt` from vertical. */
function limbEnd(from, a, tilt, len) {
  sincos(a, SC);
  sincos(tilt, SC2);
  return [from[0] + SC.c * SC2.s * len, from[1] + SC2.c * len, from[2] + SC.s * SC2.s * len];
}

function sakuraSpec(S, rng) {
  const trunkH = 2.5 * S * rng.range(0.9, 1.12);
  const trunkR = 0.2 * S;
  const top = leanTip(trunkH, rng.range(0, 0.07), rng.range(0, TAU));
  const out = {
    style: 'sakura', S,
    trunk: { a: [0, 0, 0], b: top, r: trunkR, rTop: trunkR * 0.7, seg: 7 },
    flare: { h: 0.34 * S, r: trunkR * 1.5, rTop: trunkR * 1.05, seg: 7 },
    limbs: [], twigs: [], blobs: [], cones: [],
  };
  const limbs = 3 + rng.int(0, 1);
  const centres = [];
  for (let i = 0; i < limbs; i += 1) {
    const a = (i / limbs) * TAU + rng.range(-0.4, 0.4);
    const len = 1.9 * S * rng.range(0.82, 1.2);
    const end = limbEnd(top, a, rng.range(0.5, 0.85), len);
    out.limbs.push({ a: top, b: end, r: 0.0715 * S, rTop: 0.0325 * S, seg: 5 });
    centres.push(end);
    /* One fork a limb, three times in four. */
    if (rng.next() < 0.75) {
      const d = unit3([
        (end[0] - top[0]) / len + rng.range(-0.7, 0.7),
        (end[1] - top[1]) / len + rng.range(0.1, 0.6),
        (end[2] - top[2]) / len + rng.range(-0.7, 0.7),
      ]);
      const l2 = len * rng.range(0.5, 0.8);
      const e2 = [end[0] + d[0] * l2, end[1] + d[1] * l2, end[2] + d[2] * l2];
      out.twigs.push({ a: end, b: e2, r: 0.04 * S, rTop: 0.018 * S, seg: 4 });
      centres.push(e2);
    }
  }
  /* The blossom: many small blobs, toned by height so the crown catches
   * the light and the underside stays deeper, then a crowning cluster. */
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const c of centres) {
    yMin = Math.min(yMin, c[1]);
    yMax = Math.max(yMax, c[1]);
  }
  const count = 16 + rng.int(0, 5);
  for (let i = 0; i < count; i += 1) {
    const c = centres[rng.int(0, centres.length - 1)];
    const r = 0.56 * S * rng.range(0.68, 1.3);
    const p = [c[0] + rng.range(-1.15, 1.15) * S, c[1] + rng.range(-0.55, 0.95) * S, c[2] + rng.range(-1.15, 1.15) * S];
    const hi = (p[1] - yMin) / Math.max(0.5, yMax + 1.2 * S - yMin);
    let tone = hi > 0.62 ? 0 : hi < 0.28 ? 2 : 1;
    if (rng.chance(0.22)) {
      tone = (tone + 1) % 3;
    }
    out.blobs.push({ c: p, r, ry: r * rng.range(0.68, 0.88), tone, spin: [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)] });
  }
  for (let i = 0; i < 3; i += 1) {
    const r = 0.6 * S * rng.range(0.8, 1.15);
    out.blobs.push({
      c: [top[0] + rng.range(-0.7, 0.7) * S, top[1] + (1.25 + rng.range(0, 0.5)) * S, top[2] + rng.range(-0.7, 0.7) * S],
      r, ry: r * 0.8, tone: 0, spin: [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)],
    });
  }
  return out;
}

function groveSpec(S, rng) {
  const trunkH = 3.6 * S * rng.range(0.9, 1.15);
  const trunkR = 0.24 * S;
  const top = leanTip(trunkH, rng.range(0.02, 0.1), rng.range(0, TAU));
  const out = {
    style: 'street', S,
    trunk: { a: [0, 0, 0], b: top, r: trunkR, rTop: trunkR * 0.62, seg: 7 },
    flare: { h: 0.42 * S, r: trunkR * 1.55, rTop: trunkR * 0.96, seg: 7 },
    limbs: [], twigs: [], blobs: [], cones: [],
  };
  const limbs = 3 + rng.int(0, 2);
  const centres = [];
  for (let i = 0; i < limbs; i += 1) {
    const a = (i / limbs) * TAU + rng.range(-0.4, 0.4);
    const len = 1.5 * S * rng.range(0.8, 1.25);
    const end = limbEnd(top, a, rng.range(0.35, 0.7), len);
    out.limbs.push({ a: top, b: end, r: 0.09 * S, rTop: 0.042 * S, seg: 5 });
    centres.push(end);
  }
  /* Denser and rounder than blossom: one mass with a lit crown. */
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const c of centres) {
    yMin = Math.min(yMin, c[1]);
    yMax = Math.max(yMax, c[1]);
  }
  const count = 16 + rng.int(0, 5);
  for (let i = 0; i < count; i += 1) {
    const c = centres[rng.int(0, centres.length - 1)];
    const r = 0.72 * S * rng.range(0.7, 1.25);
    const p = [c[0] + rng.range(-1.25, 1.25) * S, c[1] + rng.range(-0.7, 1.5) * S, c[2] + rng.range(-1.25, 1.25) * S];
    const hi = (p[1] - yMin) / Math.max(0.5, yMax + 1.6 * S - yMin);
    let tone = hi > 0.66 ? 0 : hi < 0.3 ? 2 : 1;
    if (rng.chance(0.2)) {
      tone = (tone + 1) % 3;
    }
    out.blobs.push({ c: p, r, ry: r * rng.range(0.7, 0.92), tone, spin: [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)] });
  }
  return out;
}

function cedarSpec(S, rng) {
  const H = 10.6 * S * rng.range(0.82, 1.18);
  const trunkR = 0.125 * S * rng.range(0.86, 1.22);
  /* Planted sugi are dead straight, and the straightness is the tell. */
  const axis = unit3(leanTip(1, rng.range(0, 0.045), rng.range(0, TAU)));
  const at = (h) => [axis[0] * h, axis[1] * h, axis[2] * h];
  const base = H * rng.range(0.3, 0.42);
  const crown = H - base;
  const n = 5 + rng.int(0, 1);
  const rMax = H * 0.15 * rng.range(0.86, 1.14);
  const out = {
    style: 'pine', S, H, base,
    trunk: { a: [0, 0, 0], b: at(H), r: trunkR, rTop: trunkR * 0.34, seg: 6 },
    flare: { h: 0.6 * S, r: trunkR * 1.9, rTop: trunkR * 0.646, seg: 6 },
    limbs: [], twigs: [], blobs: [], cones: [],
  };
  for (let k = 0; k < n; k += 1) {
    const u = k / n;
    const hk = base + crown * (u + rng.range(-0.03, 0.03));
    const ck = (crown / n) * 2.15 * rng.range(0.86, 1.14);
    const rk = rMax * CEDAR_TAPER[n][k] * rng.range(0.88, 1.1);
    const p = at(hk);
    sincos(rng.range(0, TAU), SC);
    const wob = rk * 0.09;
    /* A whorl is not a lampshade: a per tier ellipse and a couple of
     * degrees of tilt break every rim out of the horizontal. */
    const ell = rng.range(0.84, 1.18);
    const dir = unit3([axis[0] + rng.range(-0.07, 0.07), axis[1], axis[2] + rng.range(-0.07, 0.07)]);
    let tone = u > 0.62 ? 0 : u < 0.26 ? 2 : 1;
    if (rng.chance(0.18)) {
      tone = (tone + 1) % 3;
    }
    out.cones.push({ c: [p[0] + SC.c * wob, p[1], p[2] + SC.s * wob], dir, r: rk, ell, h: ck, spin: rng.range(0, TAU), tone });
  }
  /* The leader, so the top is a spike. */
  {
    const ck = crown * 0.3 * rng.range(0.9, 1.25);
    out.cones.push({ c: at(base + crown * 0.86), dir: axis, r: rMax * 0.3, ell: 1, h: ck, spin: rng.range(0, TAU), tone: 0 });
  }
  /* One sprig, so no two crowns have the same outline. */
  {
    const u = rng.range(0.15, 0.8);
    const p = at(base + crown * u);
    const rk = rMax * (1 - u) * rng.range(0.45, 0.8);
    const ck = rk * rng.range(1.3, 2.0);
    sincos(rng.range(0, TAU), SC);
    out.cones.push({
      c: [p[0] + SC.c * rk * 0.55, p[1], p[2] + SC.s * rk * 0.55], dir: axis, r: rk, ell: 1, h: ck,
      spin: rng.range(0, TAU), tone: rng.chance(0.5) ? 1 : 2,
    });
  }
  return out;
}

/* The whole tree, as numbers, computed once and read by both the layout and
 * the draw so the blobs they place are the same blobs. */
function treeSpec(el) {
  const style = TREE_STYLES.includes(el.style) ? el.style : 'sakura';
  const S = dim(el, 'size', 1, 0.5, 3);
  const rng = seededRandom(seedOf(el));
  if (style === 'pine') {
    return cedarSpec(S, rng);
  }
  return style === 'street' ? groveSpec(S, rng) : sakuraSpec(S, rng);
}

/* A capsule along a cone's axis that stays inside it: the cone's inscribed
 * radius, at seven tenths, from its base to where the slant closes in. */
function coneSolid(P, cn) {
  const R = INR[7] * cn.r * Math.min(1, cn.ell);
  const H = cn.h;
  const sinA = R / rootOf(R * R + H * H);
  const rho = 0.7 * (H * sinA) / (1 + sinA);
  const y0 = rho;
  const y1 = H - rho / sinA;
  const p = (y) => [cn.c[0] + cn.dir[0] * y, cn.c[1] + cn.dir[1] * y, cn.c[2] + cn.dir[2] * y];
  P.cap('stCedar1', p(y0), p(y1 > y0 ? y1 : y0), rho, { draw: false, name: 'canopy', kind: 'canopy' });
  /* And the largest sphere the whorl holds, sitting on its base and
   * touching its slant, at 0.95: that is what fills the skirt. */
  const rin = (H * sinA) / (1 + sinA);
  P.cap('stCedar1', p(rin), p(rin), rin * 0.95, { draw: false, name: 'canopy', kind: 'canopy' });
}

export function treeLayout(el) {
  const t = treeSpec(el);
  const P = new Parts();
  const wood = t.style === 'sakura' ? 'trunk' : t.style === 'pine' ? 'stCedarWood' : 'stGroveWood';
  if (t.style === 'pine') {
    /* The stem to where the crown begins; the whorls carry it above. */
    const tr = t.trunk;
    const f = t.base / t.H;
    const neck = [tr.b[0] * f, tr.b[1] * f, tr.b[2] * f];
    capIn(P, wood, tr.a, neck, tr.r, tr.r + (tr.rTop - tr.r) * f, tr.seg, { name: 'trunk', kind: 'tree' });
  } else {
    taperIn(P, wood, t.trunk.a, t.trunk.b, t.trunk.r, t.trunk.rTop, t.trunk.seg, { name: 'trunk', kind: 'tree' });
  }
  for (const l of t.limbs) {
    capIn(P, wood, l.a, l.b, l.r, l.rTop, l.seg, { name: 'limb', kind: 'tree' });
  }
  for (const b of t.blobs) {
    P.cap('stGrove1', b.c, b.c, 0.78 * Math.min(b.r, b.ry), { draw: false, name: 'canopy', kind: 'canopy' });
  }
  for (const cn of t.cones) {
    coneSolid(P, cn);
  }
  return P.list;
}

export function treeDraw(el, parts, K) {
  const t = treeSpec(el);
  const wood = t.style === 'sakura' ? 'trunk' : t.style === 'pine' ? 'stCedarWood' : 'stGroveWood';
  const tones = t.style === 'sakura'
    ? ['blossom0', 'blossom1', 'blossom2']
    : t.style === 'pine' ? ['stCedar0', 'stCedar1', 'stCedar2'] : ['stGrove0', 'stGrove1', 'stGrove2'];
  const tr = t.trunk;
  K.cyl(wood, tr.a, tr.b, tr.r, tr.seg, tr.rTop);
  K.cyl(wood, [0, 0, 0], [0, t.flare.h, 0], t.flare.r, t.flare.seg, t.flare.rTop);
  for (const l of t.limbs) {
    K.cyl(wood, l.a, l.b, l.r, l.seg, l.rTop);
  }
  for (const l of t.twigs) {
    K.cyl(wood, l.a, l.b, l.r, l.seg, l.rTop);
  }
  for (const b of t.blobs) {
    K.blob(tones[b.tone], b.c, b.r, b.ry, b.spin);
  }
  if (t.cones.length) {
    const T = K.THREE;
    const up = new T.Vector3(0, 1, 0);
    for (const cn of t.cones) {
      const q = new T.Quaternion().setFromUnitVectors(up, new T.Vector3(cn.dir[0], cn.dir[1], cn.dir[2]));
      q.multiply(new T.Quaternion().setFromAxisAngle(up, cn.spin));
      const m = new T.Matrix4().compose(new T.Vector3(cn.c[0], cn.c[1], cn.c[2]), q, new T.Vector3(cn.r, cn.h, cn.r * cn.ell));
      K.add(tones[cn.tone], unitGeo(K, 'cone7'), m);
    }
  }
  /* Fallen petals under a cherry. */
  if (t.style === 'sakura') {
    K.patch('petals', 0, 0.02, 0, 2.4 * t.S, 7);
  }
}

/* Where a tree's canopy reaches, for the plan view: the blobs' extent. */
export function treeReach(el) {
  const t = treeSpec(el);
  let r = 0.5;
  for (const b of t.blobs) {
    r = Math.max(r, Math.hypot(b.c[0], b.c[2]) + b.r);
  }
  for (const c of t.cones) {
    r = Math.max(r, Math.hypot(c.c[0], c.c[2]) + c.r * Math.max(1, c.ell));
  }
  return r;
}

/* Re-exported so the plan view can draw a round footprint without taking a
 * sine of its own. */
export { around };
