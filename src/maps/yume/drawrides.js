/*
 * drawrides.js: what moves in Yumeboshi Land, drawn: the coaster's train,
 * the big wheel's spokes and gondolas, the carousel's horses and poles,
 * the drop tower's ring of seats, the teacups, the swing ride's chairs and
 * chains, and the swinging ship. Each is posed every frame from the same
 * pure functions ./rides.js seats the solids from, at the same step, so
 * the ride drawn is the ride hit.
 *
 * CHEAP BY CONSTRUCTION. One cel material with vertex colours for the lot
 * (the trucks' way, ../dome/trucks.js), every repeated thing an instanced
 * mesh (eighteen gondolas are one draw, thirty six horses one, twenty
 * chairs one), and each ride's still bounds set once by hand so the
 * frustum drops a ride that is behind the camera without measuring it.
 * Posing is a few hundred multiplies a frame and no allocation. About
 * fourteen draws for every moving thing in the park, and a handful more
 * in the shadow pass for the big ones only: the horses, cups, chairs and
 * chains cast nothing, being small and mostly under a roof.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { cel } from '../city/vendored/core/toon.js';
import { bake } from '../city/vendored/core/util.js';
import { W, D } from './frame.js';
import {
  WHEEL, CAROUSEL, HORSES, TOWER, TEACUPS, SWINGS, SHIP,
  wheelAngle, wheelPin, carouselAngle, horseAt, towerAt, cupAt, chairAt, shipAt,
} from './rides.js';
import {
  coasterLine, trainAt, sampleAt, lerp3, CARS, CAR_PITCH, CAR,
} from './coaster.js';

const TAU = 2 * Math.PI;
const wx = (px) => px - W / 2;
const wz = (py) => D / 2 - py;

const COL = {
  white: 0xf6f3ee, cream: 0xf6ecd6, red: 0xe0524a, rail: 0xe0453f, pink: 0xf39cbe, rose: 0xe8758f, yellow: 0xf4c033,
  gold: 0xe0b44c, blue: 0x4f7fcc, sky: 0x8cc3e6, teal: 0x2f9c9a, mint: 0x9fd8bf, lilac: 0xbca4dc, purple: 0x7a62b8,
  orange: 0xf08a3c, steel: 0xb8bcc6, dark: 0x5d5668, glass: 0x4a5670, wood: 0xb0917a, woodDark: 0x765f62,
  skin: 0xf3d2b8, hair: 0x3a3048, hairB: 0x7a4a3a, lamp: 0xfff2d6,
};

/* A geometry with every vertex one colour. */
function painted(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    col[3 * i] = c.r;
    col[3 * i + 1] = c.g;
    col[3 * i + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _y = new THREE.Vector3(0, 1, 0);
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

/* The pieces a thing is made of, collected as { geometry, matrix }, and
 * baked into one geometry. */
function pieces() {
  const out = [];
  const box = (hex, x0, y0, z0, x1, y1, z1, rot = null) => {
    const g = painted(new THREE.BoxGeometry(1, 1, 1), hex);
    _p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    _s.set(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    if (rot) {
      _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
    } else {
      _q.identity();
    }
    out.push({ geometry: g, matrix: new THREE.Matrix4().compose(_p, _q, _s) });
  };
  const tube = (hex, a, b, r, seg = 6, rTop = null) => {
    _a.set(a[0], a[1], a[2]);
    _b.set(b[0], b[1], b[2]);
    const dir = _b.clone().sub(_a);
    const len = dir.length();
    if (len < 1e-6) {
      return;
    }
    const g = painted(new THREE.CylinderGeometry(rTop === null ? r : rTop, r, len, seg, 1), hex);
    _q.setFromUnitVectors(_y, dir.normalize());
    _p.copy(_a).add(_b).multiplyScalar(0.5);
    out.push({ geometry: g, matrix: new THREE.Matrix4().compose(_p, _q, _s.set(1, 1, 1)) });
  };
  const ball = (hex, c, rx, ry = rx, rz = rx, w = 8, h = 6) => {
    const g = painted(new THREE.SphereGeometry(1, w, h), hex);
    _p.set(c[0], c[1], c[2]);
    out.push({ geometry: g, matrix: new THREE.Matrix4().compose(_p, _q.identity(), _s.set(rx, ry, rz)) });
  };
  const ring = (hex, c, R, r, axis, seg = 5, round = 16) => {
    const g = painted(new THREE.TorusGeometry(R, r, seg, round), hex);
    _p.set(c[0], c[1], c[2]);
    if (axis === 'y') {
      _q.setFromEuler(_e.set(Math.PI / 2, 0, 0));
    } else if (axis === 'x') {
      _q.setFromEuler(_e.set(0, Math.PI / 2, 0));
    } else {
      _q.identity();
    }
    out.push({ geometry: g, matrix: new THREE.Matrix4().compose(_p, _q, _s.set(1, 1, 1)) });
  };
  /* A side profile [[x, y]] extruded across z from z0 to z1. */
  const prism = (hex, profile, z0, z1) => {
    const shape = new THREE.Shape();
    profile.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    shape.closePath();
    const g = painted(new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false }), hex);
    g.translate(0, 0, z0);
    out.push({ geometry: g, matrix: new THREE.Matrix4() });
  };
  const done = () => {
    const g = bake(out);
    g.computeBoundingSphere();
    return g;
  };
  return {
    box, tube, ball, ring, prism, done,
  };
}

/* A rider: a head and two arms up, for the manga's screaming crowd. Sat
 * at (x, y, z), y the seat. */
function rider(P, x, y, z, hair, armsUp = true) {
  P.box(COL.blue, x - 0.16, y, z - 0.2, x + 0.16, y + 0.42, z + 0.2);
  P.ball(COL.skin, [x, y + 0.6, z], 0.17);
  P.ball(hair, [x - 0.04, y + 0.66, z], 0.18, 0.14, 0.18);
  if (armsUp) {
    P.tube(COL.skin, [x, y + 0.36, z - 0.2], [x + 0.08, y + 0.82, z - 0.32], 0.05, 4);
    P.tube(COL.skin, [x, y + 0.36, z + 0.2], [x + 0.08, y + 0.82, z + 0.32], 0.05, 4);
  }
}

/* ---- the train: one car, nose +x, up +y, the rails' line at the origin ---- */
function carGeometry(lead) {
  const P = pieces();
  const L = CAR.len / 2;
  const hw = CAR.wide / 2 - 0.05;
  /* The running gear over the rails, and the chassis. */
  for (const sx of [-1, 1]) {
    P.box(COL.dark, sx * 0.7 - 0.25, -0.02, -0.62, sx * 0.7 + 0.25, 0.22, 0.62);
  }
  P.box(COL.dark, -L + 0.1, 0.18, -0.45, L - 0.1, 0.3, 0.45);
  /* The tub: red, with a cream band and a yellow stripe. */
  P.box(COL.rail, -L, 0.3, -hw, L - 0.25, 0.92, hw);
  P.tube(COL.rail, [L - 0.25, 0.61, -hw], [L - 0.25, 0.61, hw], 0.31, 10);
  P.box(COL.yellow, -L - 0.01, 0.66, -hw - 0.01, L - 0.2, 0.74, hw + 0.01);
  P.box(COL.cream, -L + 0.12, 0.92, -hw + 0.08, L - 0.5, 0.97, hw - 0.08);
  /* The seat back and the lap bar. */
  P.box(COL.cream, -L + 0.12, 0.92, -hw + 0.1, -L + 0.34, 1.32, hw - 0.1);
  P.tube(COL.steel, [L - 0.62, 1.05, -hw + 0.1], [L - 0.62, 1.05, hw - 0.1], 0.045, 6);
  /* Two riders, arms up, the lead car's in a hurry. */
  rider(P, -0.25, 0.86, -0.34, COL.hair);
  rider(P, -0.25, 0.86, 0.34, COL.hairB, !lead);
  if (lead) {
    /* A star on the nose: the shooting star's head. */
    P.prism(COL.yellow, [[L + 0.05, 0.4], [L + 0.4, 0.62], [L + 0.05, 0.84], [L + 0.12, 0.62]], -0.06, 0.06);
    P.ball(COL.yellow, [L + 0.06, 0.62, 0], 0.2, 0.2, 0.12);
    P.ball(COL.lamp, [L + 0.02, 0.62, -0.42], 0.09);
    P.ball(COL.lamp, [L + 0.02, 0.62, 0.42], 0.09);
  }
  return P.done();
}

/* ---- the big wheel ---- */
function spokeGeometry() {
  const P = pieces();
  const Wh = WHEEL;
  for (const side of [-1, 1]) {
    const z = side * Wh.rim;
    for (let j = 0; j < Wh.spokes; j += 1) {
      const a = (TAU * (j + 0.5)) / Wh.spokes;
      const c = Math.cos(a);
      const s = Math.sin(a);
      P.tube(j % 2 ? COL.white : COL.pink, [1.3 * c, 1.3 * s, z], [Wh.R * c, Wh.R * s, z], 0.09, 4);
    }
    /* An inner ring of lamps the spokes carry round. */
    for (let j = 0; j < Wh.spokes; j += 1) {
      const a = (TAU * (j + 0.5)) / Wh.spokes;
      P.ball(COL.lamp, [Wh.R * 0.55 * Math.cos(a), Wh.R * 0.55 * Math.sin(a), z], 0.16);
    }
  }
  return P.done();
}

/* A gondola, its pin at the origin, hanging. Body only: it takes the
 * instance's colour. */
function cabGeometry() {
  const P = pieces();
  const c = WHEEL.cab;
  const top = -c.below;
  const bot = top - c.tall;
  P.box(COL.white, -c.hx, bot + 0.2, -c.hz, c.hx, top - 0.35, c.hz);
  return P.done();
}

/* A gondola's trim: the hanger, the roof, the windows and the floor, the
 * same on every one. */
function cabTrim() {
  const P = pieces();
  const c = WHEEL.cab;
  const top = -c.below;
  const bot = top - c.tall;
  P.tube(COL.steel, [0, 0, 0], [0, top, 0], 0.07, 5);
  P.box(COL.white, -c.hx - 0.06, top - 0.38, -c.hz - 0.06, c.hx + 0.06, top - 0.1, c.hz + 0.06);
  P.box(COL.gold, -0.35, top - 0.1, -0.3, 0.35, top + 0.02, 0.3);
  P.box(COL.glass, -c.hx - 0.01, bot + 0.95, -c.hz - 0.01, c.hx + 0.01, bot + 1.7, c.hz + 0.01);
  P.box(COL.gold, -c.hx - 0.02, bot, -c.hz - 0.02, c.hx + 0.02, bot + 0.22, c.hz + 0.02);
  return P.done();
}

/* ---- the carousel ---- */
/* The deck's turning part: its poles, and painted plates on the deck. */
function carouselTurn() {
  const P = pieces();
  const C = CAROUSEL;
  for (const h of HORSES) {
    const x = h.r * h.c0;
    const z = -h.r * h.s0;
    P.tube(COL.gold, [x, C.deck, z], [x, C.canopy, z], 0.06, 5);
  }
  /* Painted boards across the deck, radial, so its turn reads. */
  const r0 = C.post + 0.3;
  const r1 = C.R - 0.4;
  const rm = (r0 + r1) / 2;
  const len = r1 - r0;
  for (let k = 0; k < 16; k += 1) {
    const a = (TAU * k) / 16;
    const x = rm * Math.cos(a);
    const z = -rm * Math.sin(a);
    P.box(k % 2 ? COL.cream : COL.pink, x - len / 2, C.deck + 0.01, z - 0.1, x + len / 2, C.deck + 0.03, z + 0.1, [0, a, 0]);
  }
  return P.done();
}

/* A horse, middle at the origin, riding +x. White, its tack tinted with
 * it. */
function horseGeometry() {
  const P = pieces();
  P.ball(COL.white, [0, 0, 0], 0.62, 0.3, 0.24, 10, 8);
  P.tube(COL.white, [0.42, 0.1, 0], [0.62, 0.48, 0], 0.13, 6);
  P.ball(COL.white, [0.72, 0.52, 0], 0.24, 0.14, 0.13, 8, 6);
  P.tube(COL.gold, [0.4, 0.26, 0], [0.62, 0.62, 0], 0.05, 4);
  P.box(COL.rose, -0.2, 0.18, -0.25, 0.2, 0.3, 0.25);
  for (const [x, sx] of [[0.38, 1], [-0.38, -1]]) {
    for (const z of [-0.12, 0.12]) {
      P.tube(COL.white, [x, -0.1, z], [x + sx * 0.18, -0.45, z], 0.05, 4);
    }
  }
  P.tube(COL.gold, [-0.6, 0.06, 0], [-0.82, -0.24, 0], 0.06, 4);
  return P.done();
}

/* ---- the drop tower's ring of seats, at its own height 0 ---- */
function towerRing() {
  const P = pieces();
  const T = TOWER;
  const a = T.half + 0.02;
  const b = T.half + T.ring.out;
  const hy = 2 * T.ring.hy;
  /* The frame, four sides. */
  P.box(COL.purple, -b, 0, -b, b, 0.35, -a);
  P.box(COL.purple, -b, 0, a, b, 0.35, b);
  P.box(COL.purple, -b, 0, -a, -a, 0.35, a);
  P.box(COL.purple, a, 0, -a, b, 0.35, a);
  P.box(COL.gold, -b, hy - 0.2, -b, b, hy, -a);
  P.box(COL.gold, -b, hy - 0.2, a, b, hy, b);
  P.box(COL.gold, -b, hy - 0.2, -a, -a, hy, a);
  P.box(COL.gold, a, hy - 0.2, -a, b, hy, a);
  /* The seats and their riders, three a side, facing out. */
  for (let side = 0; side < 4; side += 1) {
    const yaw = (side * Math.PI) / 2;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const at = (u, w) => [u * c + w * s, -u * s + w * c];
    for (const w of [-1.2, 0, 1.2]) {
      const [x0, z0] = at(a + 0.2, w - 0.42);
      const [x1, z1] = at(b - 0.1, w + 0.42);
      P.box(COL.yellow, Math.min(x0, x1), 0.35, Math.min(z0, z1), Math.max(x0, x1), 0.55, Math.max(z0, z1));
      const [hx, hz] = at(a + 0.75, w);
      P.box(COL.red, hx - 0.17, 0.55, hz - 0.17, hx + 0.17, 0.95, hz + 0.17);
      P.ball(COL.skin, [hx, 1.15, hz], 0.17);
      P.ball(w ? COL.hair : COL.hairB, [hx, 1.21, hz], 0.18, 0.13, 0.18);
      const [bx0, bz0] = at(a + 0.05, w - 0.42);
      const [bx1, bz1] = at(a + 0.25, w + 0.42);
      P.box(COL.yellow, Math.min(bx0, bx1), 0.55, Math.min(bz0, bz1), Math.max(bx0, bx1), 1.45, Math.max(bz0, bz1));
    }
  }
  return P.done();
}

/* ---- the teacups ---- */
/* A cup, its foot at the origin. White: the instance colours it. */
function cupGeometry() {
  const P = pieces();
  const C = TEACUPS.cup;
  P.tube(COL.white, [0, 0.05, 0], [0, C.tall, 0], 0.62, 14, C.half - 0.02);
  P.ring(COL.white, [0, C.tall, 0], C.half - 0.06, 0.07, 'y', 4, 18);
  P.ring(COL.white, [C.half - 0.02, C.tall * 0.55, 0], 0.26, 0.06, 'z', 4, 10);
  P.tube(COL.cream, [0, 0.05, 0], [0, 0.85, 0], 0.08, 5);
  P.ring(COL.cream, [0, 0.85, 0], 0.24, 0.04, 'y', 3, 10);
  return P.done();
}

/* The small turntables the cups go round on. */
function plateGeometry() {
  const P = pieces();
  P.tube(COL.mint, [0, TEACUPS.deck, 0], [0, TEACUPS.deck + 0.05, 0], TEACUPS.cupR + 1.2, 20);
  P.ring(COL.white, [0, TEACUPS.deck + 0.05, 0], TEACUPS.cupR + 1.2, 0.06, 'y', 3, 24);
  return P.done();
}

/* ---- the swing ride ---- */
/* A chair, hung at the origin, facing +x. */
function chairGeometry() {
  const P = pieces();
  const c = SWINGS.chair;
  const bot = -c.tall;
  P.box(COL.white, -c.half, bot, -c.half, c.half, bot + 0.12, c.half);
  P.box(COL.white, -c.half, bot + 0.12, -c.half, -c.half + 0.1, -0.05, c.half);
  P.box(COL.white, -c.half, bot + 0.12, -c.half, c.half, bot + 0.3, -c.half + 0.06);
  P.box(COL.white, -c.half, bot + 0.12, c.half - 0.06, c.half, bot + 0.3, c.half);
  P.tube(COL.steel, [c.half - 0.05, bot + 0.3, -c.half], [c.half - 0.05, bot + 0.3, c.half], 0.03, 4);
  return P.done();
}

/* A chain, a unit long up y. */
function chainGeometry() {
  const P = pieces();
  P.tube(COL.steel, [0, 0, 0], [0, 1, 0], 0.03, 3);
  return P.done();
}

/* ---- the swinging ship: its axle at the origin, its keel along x ---- */
function shipGeometry() {
  const P = pieces();
  const S = SHIP;
  const base = -S.arm + S.hullUp;
  const half = S.hullHalf - 0.15;
  const n = 20;
  const bot = [];
  const top = [];
  for (let k = 0; k <= n; k += 1) {
    const x = -7 + (14 * k) / n;
    const rise = (x * x) / 60;
    bot.push([x, base - half + rise + (Math.abs(x) > 5.5 ? (Math.abs(x) - 5.5) * 0.4 : 0)]);
    top.push([x, base + half + rise]);
  }
  const hull = [...bot, ...top.reverse()];
  const bz = S.beam - 0.1;
  P.prism(COL.woodDark, hull, -bz, bz);
  /* The gold strake, and shields down each side. */
  const strake = [];
  for (let k = 0; k <= n; k += 1) {
    const x = -7 + (14 * k) / n;
    strake.push([x, base + half - 0.55 + (x * x) / 60]);
  }
  for (let k = n; k >= 0; k -= 1) {
    const x = -7 + (14 * k) / n;
    strake.push([x, base + half - 0.3 + (x * x) / 60]);
  }
  P.prism(COL.gold, strake, -bz - 0.03, bz + 0.03);
  const shields = [COL.red, COL.blue, COL.yellow, COL.red, COL.blue, COL.yellow, COL.red];
  shields.forEach((hex, k) => {
    const x = -4.8 + k * 1.6;
    const y = base + 0.15 + (x * x) / 60;
    for (const sz of [-1, 1]) {
      P.tube(hex, [x, y, sz * (bz + 0.01)], [x, y, sz * (bz + 0.08)], 0.42, 10);
      P.tube(COL.gold, [x, y, sz * (bz + 0.08)], [x, y, sz * (bz + 0.12)], 0.12, 6);
    }
  });
  /* The deck rows and the riders on them, inside the hull's box. */
  for (let k = 0; k < 7; k += 1) {
    const x = -4.8 + k * 1.6;
    const y = base + half + 0.02 + (x * x) / 60;
    for (const z of [-1.1, 0, 1.1]) {
      P.ball(COL.skin, [x, y + 0.02, z], 0.17);
      P.ball(k % 2 ? COL.hair : COL.hairB, [x - 0.04, y + 0.08, z], 0.18, 0.13, 0.18);
    }
  }
  /* The arms up to the axle, front and back, both sides, and the hub. */
  for (const s of [-1, 1]) {
    for (const z of [-1, 1]) {
      const zz = z * (S.beam + 0.15);
      P.tube(COL.yellow, [0, 0, zz], [s * 3.6, -S.arm + 1.4, zz], 0.16, 6);
    }
  }
  P.tube(COL.yellow, [0, 0, -(S.beam + 0.3)], [0, 0, S.beam + 0.3], 0.5, 10);
  return P.done();
}

/*
 * THE RIDES. `opts.shadows` false keeps every ride out of the shadow pass
 * (Low draws no shadows). Returns { group, pose(step), stats(), dispose() }.
 */
export function buildRides(opts = {}) {
  const shadows = opts.shadows !== false;
  const group = new THREE.Group();
  group.name = 'rides';
  const owned = [];
  const mat = cel({
    color: 0xffffff, vertexColors: true, bands: 3, tint: 0x5c5680, cache: false,
  });
  let draws = 0;
  let tris = 0;
  const count = (geo, n = 1) => {
    draws += 1;
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * n;
  };
  const sphere = (x, y, z, r) => new THREE.Sphere(new THREE.Vector3(x, y, z), r);

  const mesh = (geo, name, cast, bounds) => {
    owned.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.matrixAutoUpdate = false;
    m.castShadow = shadows && cast;
    m.receiveShadow = true;
    group.add(m);
    count(geo);
    if (bounds) {
      geo.boundingSphere = bounds;
    }
    return m;
  };
  const inst = (geo, n, name, cast, bounds, colours = null) => {
    owned.push(geo);
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.name = name;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = shadows && cast;
    m.receiveShadow = true;
    if (bounds) {
      m.boundingSphere = bounds;
    }
    if (colours) {
      const c = new THREE.Color();
      for (let i = 0; i < n; i += 1) {
        m.setColorAt(i, c.setHex(colours[i % colours.length]));
      }
      m.instanceColor.needsUpdate = true;
    }
    group.add(m);
    count(geo, n);
    return m;
  };

  /* THE TRAIN: the lead car and the four behind it. */
  const lead = inst(carGeometry(true), 1, 'yume train lead', true, null);
  const cars = inst(carGeometry(false), CARS - 1, 'yume train', true, null);

  /* THE WHEEL. */
  const Wh = WHEEL;
  const hub = new THREE.Vector3(wx(Wh.px), Wh.hub, wz(Wh.py));
  const wheelBounds = sphere(hub.x, hub.y, hub.z, Wh.R + 3.5);
  const spokes = mesh(spokeGeometry(), 'yume wheel spokes', true, sphere(0, 0, 0, Wh.R + 0.5));
  const cabs = inst(cabGeometry(), Wh.gondolas, 'yume gondolas', true, wheelBounds,
    [COL.red, COL.yellow, COL.sky, COL.pink, COL.mint, COL.lilac]);
  const trims = inst(cabTrim(), Wh.gondolas, 'yume gondola trim', true, wheelBounds);

  /* THE CAROUSEL. */
  const C = CAROUSEL;
  const cc = new THREE.Vector3(wx(C.px), 0, wz(C.py));
  const turn = mesh(carouselTurn(), 'yume carousel deck', false, sphere(0, C.canopy / 2, 0, C.R + 2));
  const horses = inst(horseGeometry(), HORSES.length, 'yume horses', false, sphere(cc.x, 2, cc.z, C.R + 1),
    [0xffffff, 0xffe0ea, 0xe4f0ff, 0xfff4cc, 0xe2f6ea, 0xf0e4ff]);

  /* THE DROP TOWER. */
  const Tw = TOWER;
  const ring = mesh(towerRing(), 'yume drop ring', true, sphere(0, 0.8, 0, Tw.half + Tw.ring.out + 1));
  ring.position.set(wx(Tw.px), 0, wz(Tw.py));

  /* THE TEACUPS. */
  const Tc = TEACUPS;
  const tc = new THREE.Vector3(wx(Tc.px), 0, wz(Tc.py));
  const cupBounds = sphere(tc.x, 1, tc.z, Tc.R + 1);
  const plates = inst(plateGeometry(), 3, 'yume cup plates', false, cupBounds);
  const cups = inst(cupGeometry(), 9, 'yume cups', false, cupBounds,
    [COL.pink, COL.sky, COL.yellow, COL.mint, COL.lilac, COL.orange, COL.rose, COL.teal, COL.white]);

  /* THE SWING RIDE. */
  const Sw = SWINGS;
  const swingBounds = sphere(wx(Sw.px), Sw.hang - Sw.chain / 2, wz(Sw.py), Sw.top + Sw.chain + 2);
  const chairs = inst(chairGeometry(), Sw.chairs, 'yume swing chairs', false, swingBounds,
    [COL.red, COL.yellow, COL.blue, COL.pink, COL.mint]);
  const chains = inst(chainGeometry(), Sw.chairs, 'yume swing chains', false, swingBounds);

  /* THE SHIP. */
  const Sh = SHIP;
  const ship = mesh(shipGeometry(), 'yume ship', true, sphere(0, -Sh.arm, 0, Sh.half + 3));

  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const V = new THREE.Vector3();
  const S1 = new THREE.Vector3(1, 1, 1);
  const X = new THREE.Vector3();
  const Y = new THREE.Vector3();
  const Z = new THREE.Vector3();
  const PIN = new Float64Array(6);
  const HO = new Float64Array(6);
  const TW = [0, 0];
  const CU = new Float64Array(6);
  const CH = new Float64Array(8);
  const SH = [0, 0];
  const SA = { i: 0, f: 0 };
  const LP = new Float64Array(3);
  const LT = new Float64Array(3);
  const LU = new Float64Array(3);
  const line = coasterLine();

  function poseTrain(step) {
    const tr = trainAt(step);
    for (let k = 0; k < CARS; k += 1) {
      /* The lead car is the front one: the furthest along. */
      const a = tr.s + ((CARS - 1) / 2 - k) * CAR_PITCH;
      sampleAt(a, SA);
      lerp3(line.p, SA.i, SA.f, LP);
      lerp3(line.t, SA.i, SA.f, LT);
      lerp3(line.u, SA.i, SA.f, LU);
      X.set(LT[0], LT[2], -LT[1]).normalize();
      Y.set(LU[0], LU[2], -LU[1]);
      Z.crossVectors(X, Y).normalize();
      Y.crossVectors(Z, X);
      M.makeBasis(X, Y, Z).setPosition(wx(LP[0]), LP[2], wz(LP[1]));
      if (k === 0) {
        lead.setMatrixAt(0, M);
      } else {
        cars.setMatrixAt(k - 1, M);
      }
    }
    lead.instanceMatrix.needsUpdate = true;
    cars.instanceMatrix.needsUpdate = true;
    lead.computeBoundingSphere();
    cars.computeBoundingSphere();
  }

  function poseWheel(step) {
    spokes.matrix.makeRotationZ(wheelAngle(step)).setPosition(hub);
    spokes.matrixWorldNeedsUpdate = true;
    for (let i = 0; i < Wh.gondolas; i += 1) {
      wheelPin(step, i, PIN);
      M.makeTranslation(PIN[0], PIN[1], PIN[2]);
      cabs.setMatrixAt(i, M);
      trims.setMatrixAt(i, M);
    }
    cabs.instanceMatrix.needsUpdate = true;
    trims.instanceMatrix.needsUpdate = true;
  }

  function poseCarousel(step) {
    turn.matrix.makeRotationY(carouselAngle(step)).setPosition(cc);
    turn.matrixWorldNeedsUpdate = true;
    Y.set(0, 1, 0);
    HORSES.forEach((h, i) => {
      horseAt(step, h, HO);
      X.set(HO[3], 0, HO[4]);
      Z.crossVectors(X, Y);
      M.makeBasis(X, Y, Z).setPosition(HO[0], HO[1], HO[2]);
      horses.setMatrixAt(i, M);
    });
    horses.instanceMatrix.needsUpdate = true;
  }

  function poseTower(step) {
    towerAt(step, TW);
    ring.position.y = TW[0];
    ring.updateMatrix();
    ring.matrixWorldNeedsUpdate = true;
  }

  function poseTeacups(step) {
    /* The plates sit under each set of three cups: the mean of the three. */
    for (let j = 0; j < 3; j += 1) {
      let x = 0;
      let z = 0;
      for (let k = 0; k < 3; k += 1) {
        cupAt(step, 3 * j + k, CU);
        x += CU[0];
        z += CU[2];
        const spin = (step % 3000) / 3000 * TAU * (k % 2 ? 1 : -1);
        Q.setFromAxisAngle(_y, spin);
        V.set(CU[0], Tc.deck, CU[2]);
        M.compose(V, Q, S1);
        cups.setMatrixAt(3 * j + k, M);
      }
      M.makeTranslation(x / 3, 0, z / 3);
      plates.setMatrixAt(j, M);
    }
    cups.instanceMatrix.needsUpdate = true;
    plates.instanceMatrix.needsUpdate = true;
  }

  function poseSwings(step) {
    const cx = wx(Sw.px);
    const cz = wz(Sw.py);
    for (let i = 0; i < Sw.chairs; i += 1) {
      chairAt(step, i, CH);
      /* Facing the way it flies: across the radius. */
      Z.set(CH[0] - cx, 0, CH[2] - cz).normalize();
      X.set(Z.z, 0, -Z.x);
      M.makeBasis(X, _y, Z).setPosition(CH[0], CH[1], CH[2]);
      chairs.setMatrixAt(i, M);
      _a.set(CH[3] - CH[0], CH[4] - CH[1], CH[5] - CH[2]);
      const len = _a.length();
      Q.setFromUnitVectors(_y, _a.normalize());
      V.set(CH[0], CH[1], CH[2]);
      M.compose(V, Q, _s.set(1, len, 1));
      chains.setMatrixAt(i, M);
    }
    chairs.instanceMatrix.needsUpdate = true;
    chains.instanceMatrix.needsUpdate = true;
  }

  function poseShip(step) {
    shipAt(step, SH);
    ship.matrix.makeRotationZ(SH[0]).setPosition(wx(Sh.px), Sh.axle, wz(Sh.py));
    ship.matrixWorldNeedsUpdate = true;
  }

  return {
    group,
    pose(step) {
      poseTrain(step);
      poseWheel(step);
      poseCarousel(step);
      poseTower(step);
      poseTeacups(step);
      poseSwings(step);
      poseShip(step);
    },
    stats: () => ({ draws, triangles: Math.round(tris) }),
    dispose() {
      for (const g of owned) {
        g.dispose();
      }
      mat.dispose();
    },
  };
}
