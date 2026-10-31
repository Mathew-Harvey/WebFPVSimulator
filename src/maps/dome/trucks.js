/*
 * trucks.js: the monster trucks of Bakuon Dome, drawn. Four on the course
 * (./course.js drives them) and two parked on the floor for the pit party,
 * each a yokai of its own, painted on a pickup body over the real thing's
 * running gear: 66 inch tyres with paddle tread, a tube chassis, two
 * coilovers and a bypass shock at each corner, solid axles with their diff
 * balls, the driveshafts, and the supercharger standing through the bonnet.
 *
 *   ONI    a red demon: two horns, angry eyes and fangs
 *   TORA   an orange tiger: black stripes, ears, whiskers
 *   KAPPA  a green river imp: the shell on its bed, the dish on its head,
 *          a beak
 *   RYU    a blue dragon: a gold spine ridge, antlers and long whiskers
 *
 * Every yokai is the folk tale's, drawn our own way; no show's truck is
 * any of them. The name on each door is lettered in the town's hand, one
 * picture for all four (nameAtlas).
 *
 * For the latency rule: two draw calls a truck (the body, its names), one
 * for every wheel of every truck, one for the dirt they throw; about 2,400
 * triangles a body. Per frame on the CPU: six trucks' matrices and their
 * wheels', nothing allocated.
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
import { paintMaterial } from '../../art/stf.js';
import { Smoke } from '../built/cars.js';
import { hash01 } from './course.js';
import { TRUCK, PARKED, FLOOR } from './stadium.js';

const R = TRUCK.wheelR;
const AX = TRUCK.base / 2;
const TZ = TRUCK.track / 2;

const COL = {
  tyre: 0x2a2830, tread: 0x1f1e25, rim: 0xd6d8de, hub: 0x8a8d96, frame: 0x34363f, gold: 0xe0a83a, chrome: 0xc9ccd4,
  glass: 0x26303f, white: 0xf6f2ea, black: 0x1d1b24, cream: 0xf1e3bd, yellow: 0xf2c230, lamp: 0xfff2cc, red: 0xd8333d,
};

/*
 * THE LIVERIES: body, a darker shade for the bed and the bumpers, the
 * accent, and the rims, with the name in kanji and in kana for the door.
 */
export const LIVERIES = [
  {
    key: 'oni', body: 0xd8333d, dark: 0x8e1f2e, accent: 0xf1e3bd, rim: 0x2b2830, kanji: '鬼', kana: 'オニ',
  },
  {
    key: 'tora', body: 0xf0791e, dark: 0xb5531a, accent: 0x1d1b24, rim: 0xf2c230, kanji: '虎', kana: 'トラ',
  },
  {
    key: 'kappa', body: 0x3aa45a, dark: 0x22693c, accent: 0xf2c230, rim: 0xf6f2ea, kanji: '河童', kana: 'カッパ',
  },
  {
    key: 'ryu', body: 0x2f6fd0, dark: 0x1f4688, accent: 0xe0a83a, rim: 0xe0a83a, kanji: '龍', kana: 'リュウ',
  },
];

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

/* The pieces a truck is made of, collected as { geometry, matrix }. */
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
  const ball = (hex, c, rx, ry, rz, w = 8, h = 6) => {
    const g = painted(new THREE.SphereGeometry(1, w, h), hex);
    _p.set(c[0], c[1], c[2]);
    out.push({ geometry: g, matrix: new THREE.Matrix4().compose(_p, _q.identity(), _s.set(rx, ry, rz)) });
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
  const cone = (hex, base, tip, r, seg = 6) => tube(hex, base, tip, r, seg, 0.001);
  return {
    out, box, tube, ball, prism, cone,
  };
}

/*
 * One truck's body and running gear, nose +x, y up, z to the right, its
 * wheels' contact on the ground at the origin. The wheels are not in it:
 * they turn, and are drawn by wheelGeometry.
 */
function truckGeometry(lv) {
  const {
    out, box, tube, ball, prism, cone,
  } = pieces();
  const B = TRUCK.bodyY;
  /* THE RUNNING GEAR. Axles and diff balls, the tube chassis, the
   * driveshafts and the transfer case, and at every corner two coilovers
   * and a bypass shock with its reservoir. */
  for (const sx of [-1, 1]) {
    const x = sx * AX;
    tube(COL.frame, [x, R, -TZ + 0.45], [x, R, TZ - 0.45], 0.1, 8);
    ball(COL.chrome, [x, R, 0.12], 0.3, 0.28, 0.3);
    tube(COL.frame, [x - sx * 0.05, R + 0.1, 0.1], [sx * 0.45, 1.25, 0], 0.07, 6);
    for (const sz of [-1, 1]) {
      const z = sz * 0.72;
      for (const [dx, hue] of [[-0.22, COL.gold], [0.22, COL.gold], [0, COL.chrome]]) {
        const top = [x * 0.8 + dx, B + 0.35, z * 0.86];
        const bot = [x + dx * 0.6, R + 0.08, z];
        tube(COL.chrome, bot, [bot[0] + (top[0] - bot[0]) * 0.55, bot[1] + (top[1] - bot[1]) * 0.55, bot[2] + (top[2] - bot[2]) * 0.55], 0.05, 6);
        tube(hue, [bot[0] + (top[0] - bot[0]) * 0.4, bot[1] + (top[1] - bot[1]) * 0.4, bot[2] + (top[2] - bot[2]) * 0.4], top, 0.09, 8);
      }
      ball(COL.gold, [x * 0.72, B + 0.3, z * 1.15], 0.1, 0.24, 0.1);
      /* The trailing links from the axle to the chassis. */
      tube(COL.frame, [x, R - 0.1, z * 0.9], [x * 0.35, 1.05, z * 0.8], 0.05, 5);
      tube(COL.frame, [x, R + 0.2, z * 0.7], [x * 0.35, 1.35, z * 0.4], 0.05, 5);
    }
  }
  /* The chassis rails and the cage round the engine. */
  for (const sz of [-1, 1]) {
    tube(COL.frame, [-2.4, 1.3, sz * 0.55], [2.35, 1.3, sz * 0.55], 0.08, 6);
    tube(COL.frame, [-2.2, 1.3, sz * 0.55], [-2.2, B + 0.1, sz * 0.75], 0.06, 5);
    tube(COL.frame, [2.2, 1.3, sz * 0.55], [2.2, B + 0.1, sz * 0.75], 0.06, 5);
    tube(COL.frame, [0, 1.3, sz * 0.55], [-0.3, B + 0.1, sz * 0.9], 0.06, 5);
  }
  for (const x of [-2.2, -0.6, 0.9, 2.2]) {
    tube(COL.frame, [x, 1.3, -0.55], [x, 1.3, 0.55], 0.06, 5);
  }
  box(COL.frame, -0.5, 1.05, -0.32, 0.5, 1.45, 0.32);
  /* The step bars along the sides, under the doors. */
  for (const sz of [-1, 1]) {
    tube(COL.chrome, [-1.2, B - 0.15, sz * 1.18], [1.0, B - 0.15, sz * 1.18], 0.06, 6);
  }

  /* THE BODY: a pickup's side profile, the bed and the cab one shape, the
   * bonnet sloping to the nose, extruded across. */
  const bed = [-2.85, B];
  prism(lv.body, [
    bed, [2.75, B], [2.8, B + 0.55], [2.6, B + 0.98], [0.9, B + 1.08], [0.55, B + 1.95], [-0.75, B + 1.95], [-0.95, B + 1.0], [-2.85, B + 0.95],
  ], -1.22, 1.22);
  /* The bed's well, in the darker paint, and its tailgate's lip. */
  box(lv.dark, -2.75, B + 0.6, -1.05, -1.0, B + 0.97, 1.05);
  box(lv.dark, -2.9, B + 0.82, -1.24, -2.82, B + 1.0, 1.24);
  /* The bumpers and the skid plate, nose and tail. */
  box(lv.dark, 2.7, B - 0.1, -1.3, 2.95, B + 0.35, 1.3);
  box(lv.dark, -3.0, B - 0.1, -1.3, -2.8, B + 0.3, 1.3);
  /* The glass: the windscreen leaning back, the side windows, the back. */
  box(COL.glass, 0.58, B + 1.15, -1.02, 0.9, B + 1.85, 1.02, [0, 0, 0.62]);
  for (const sz of [-1, 1]) {
    box(COL.glass, -0.62, B + 1.15, sz * 1.22 - 0.02, 0.45, B + 1.82, sz * 1.22 + 0.02);
    /* The door's shut line and handle. */
    box(lv.dark, -0.95, B + 0.2, sz * 1.23 - 0.01, -0.9, B + 1.05, sz * 1.23 + 0.01);
    box(COL.chrome, -0.75, B + 0.82, sz * 1.24 - 0.01, -0.5, B + 0.87, sz * 1.24 + 0.01);
    /* The wheel arches' flares, over each tyre. */
    for (const sx of [-1, 1]) {
      box(lv.dark, sx * AX - 1.0, B - 0.05, sz * 1.23 - 0.04, sx * AX + 1.0, B + 0.12, sz * 1.23 + 0.06);
    }
  }
  box(COL.glass, -0.97, B + 1.1, -0.9, -0.93, B + 1.8, 0.9);
  /* The roll cage seen through the glass, and the roof's light bar. */
  tube(COL.frame, [-0.7, B + 1.0, -0.9], [-0.7, B + 1.88, -0.9], 0.04, 5);
  tube(COL.frame, [-0.7, B + 1.0, 0.9], [-0.7, B + 1.88, 0.9], 0.04, 5);
  box(COL.black, -0.35, B + 1.95, -0.85, -0.15, B + 2.08, 0.85);
  for (let i = 0; i < 5; i += 1) {
    box(COL.lamp, -0.37, B + 1.97, -0.75 + i * 0.36, -0.33, B + 2.06, -0.55 + i * 0.36);
  }
  /* The nose: grille, headlamps, the tow hooks. */
  box(COL.black, 2.79, B + 0.3, -0.7, 2.83, B + 0.75, 0.7);
  for (let i = 0; i < 4; i += 1) {
    box(COL.chrome, 2.8, B + 0.36 + i * 0.1, -0.68, 2.84, B + 0.39 + i * 0.1, 0.68);
  }
  for (const sz of [-1, 1]) {
    box(COL.lamp, 2.74, B + 0.55, sz * 0.82 - 0.17, 2.82, B + 0.78, sz * 0.82 + 0.17);
    box(COL.red, -2.89, B + 0.55, sz * 1.0 - 0.12, -2.84, B + 0.8, sz * 1.0 + 0.12);
    box(COL.gold, 2.95, B, sz * 0.45 - 0.05, 3.08, B + 0.18, sz * 0.45 + 0.05);
  }
  /* THE BLOWER through the bonnet: its case, the belt, the butterflies'
   * scoop and the stacks, the trademark of the breed. */
  box(COL.chrome, 1.1, B + 1.0, -0.3, 2.0, B + 1.35, 0.3);
  box(COL.black, 1.1, B + 1.35, -0.26, 1.95, B + 1.62, 0.26);
  box(COL.black, 1.6, B + 1.62, -0.24, 2.05, B + 1.82, 0.24);
  box(COL.chrome, 2.04, B + 1.64, -0.2, 2.07, B + 1.8, 0.2);
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      tube(COL.chrome, [1.25 + i * 0.3, B + 1.0, sz * 0.62], [1.1 + i * 0.3, B + 1.35, sz * 0.78], 0.045, 6);
    }
  }

  /* THE YOKAI. */
  if (lv.key === 'oni') {
    for (const sz of [-1, 1]) {
      /* Horns from the roof, out and up, cream with a dark tip. */
      cone(lv.accent, [-0.1, B + 1.9, sz * 0.55], [0.15, B + 2.75, sz * 0.95], 0.2, 7);
      cone(COL.black, [0.1, B + 2.6, sz * 0.88], [0.15, B + 2.78, sz * 0.96], 0.07, 6);
      /* Angry eyes on the bonnet's face, slanted in, with pupils. */
      box(COL.white, 2.55, B + 0.88, sz * 0.62 - 0.28, 2.62, B + 1.04, sz * 0.62 + 0.28, [sz * 0.32, 0, 0]);
      box(COL.black, 2.6, B + 0.9, sz * 0.55 - 0.08, 2.65, B + 1.01, sz * 0.55 + 0.08);
      /* Fangs over the bumper. */
      cone(COL.white, [2.9, B + 0.32, sz * 0.4], [2.92, B - 0.05, sz * 0.42], 0.08, 5);
    }
    /* A rope of shide over the bed: a demon's own. */
    for (let i = 0; i < 5; i += 1) {
      box(COL.white, -2.4 + i * 0.32, B + 0.78, -1.25, -2.3 + i * 0.32, B + 0.95, 1.25);
    }
  } else if (lv.key === 'tora') {
    /* Stripes: bands over the bonnet, the cab and the sides. */
    for (const [x, w] of [[2.3, 0.14], [1.85, 0.12], [1.45, 0.16], [-0.2, 0.14], [-1.4, 0.16], [-1.95, 0.12], [-2.45, 0.14]]) {
      for (const sz of [-1, 1]) {
        box(COL.black, x - w, B + 0.15, sz * 1.22 - 0.01, x + w, B + 0.85, sz * 1.22 + 0.02, [0, 0, 0.35]);
      }
    }
    for (const x of [-0.45, -0.05, 0.3]) {
      box(COL.black, x - 0.07, B + 1.95, -0.9, x + 0.07, B + 1.97, 0.9);
    }
    box(COL.black, 1.6, B + 1.03, -0.9, 1.75, B + 1.06, 0.9);
    for (const sz of [-1, 1]) {
      /* Ears on the roof's front corners, and their pink. */
      prism(lv.body, [[0, 0], [0.5, 0], [0.22, 0.48]], 0, 0.12);
      out[out.length - 1].matrix.makeTranslation(-0.55, B + 1.95, sz * 0.75 - 0.06);
      prism(0xf2a6bd, [[0.1, 0.02], [0.4, 0.02], [0.24, 0.3]], 0, 0.13);
      out[out.length - 1].matrix.makeTranslation(-0.55, B + 1.95, sz * 0.75 - 0.065);
      /* Yellow eyes and whiskers. */
      box(COL.yellow, 2.55, B + 0.86, sz * 0.6 - 0.22, 2.63, B + 1.04, sz * 0.6 + 0.22);
      box(COL.black, 2.6, B + 0.88, sz * 0.6 - 0.04, 2.66, B + 1.02, sz * 0.6 + 0.04);
      for (const dy of [0.12, 0.22, 0.32]) {
        tube(COL.white, [2.84, B + dy + 0.2, sz * 0.7], [3.1, B + dy + 0.25, sz * 1.25], 0.015, 4);
      }
    }
  } else if (lv.key === 'kappa') {
    /* The shell over the bed: a low dome in the dark green, plates of the
     * light one, and a rim. */
    ball(lv.dark, [-1.9, B + 0.95, 0], 1.0, 0.55, 1.18, 12, 8);
    for (const [x, z] of [[-1.9, 0], [-1.4, 0.55], [-1.4, -0.55], [-2.4, 0.55], [-2.4, -0.55]]) {
      ball(0x5fbf7f, [x, B + 1.4 - Math.abs(z) * 0.3 - Math.abs(x + 1.9) * 0.2, z], 0.26, 0.08, 0.26, 6, 4);
    }
    tube(lv.accent, [-1.9, B + 0.95, -1.18], [-1.9, B + 0.95, 1.18], 0.05, 5);
    /* The dish on its head, its rim of hair, and the beak. */
    tube(COL.cream, [-0.1, B + 1.95, 0], [-0.1, B + 2.05, 0], 0.7, 14);
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      ball(lv.dark, [-0.1 + Math.cos(a) * 0.72, B + 1.98, Math.sin(a) * 0.72], 0.16, 0.12, 0.16, 6, 4);
    }
    prism(lv.accent, [[2.75, B + 0.2], [3.25, B + 0.42], [2.75, B + 0.62]], -0.45, 0.45);
    for (const sz of [-1, 1]) {
      ball(COL.white, [2.6, B + 0.95, sz * 0.6], 0.06, 0.18, 0.18, 8, 6);
      ball(COL.black, [2.65, B + 0.95, sz * 0.6], 0.04, 0.09, 0.09, 6, 4);
    }
  } else if (lv.key === 'ryu') {
    /* The spine ridge, gold, roof to tailgate, and scales on the sides. */
    for (let i = 0; i < 9; i += 1) {
      const x = 0.55 - i * 0.42;
      const y = i < 4 ? B + 1.95 : B + 1.0;
      cone(lv.accent, [x, y, 0], [x - 0.2, y + 0.48 - (i % 2) * 0.12, 0], 0.17, 4);
    }
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 6; i += 1) {
        box(0x5f94e6, -2.5 + i * 0.6, B + 0.45, sz * 1.22 - 0.01, -2.2 + i * 0.6, B + 0.62, sz * 1.22 + 0.02, [0, 0, 0.6]);
      }
      /* Antlers from the roof, gold, with a tine. */
      tube(lv.accent, [0.3, B + 1.95, sz * 0.5], [-0.2, B + 2.7, sz * 0.75], 0.06, 5);
      tube(lv.accent, [0.0, B + 2.3, sz * 0.62], [0.35, B + 2.6, sz * 0.7], 0.045, 5);
      /* Long whiskers back from the nose, and red eyes. */
      tube(lv.accent, [2.84, B + 0.6, sz * 0.75], [3.3, B + 0.35, sz * 1.5], 0.03, 4);
      tube(lv.accent, [3.3, B + 0.35, sz * 1.5], [3.2, B + 0.05, sz * 2.0], 0.025, 4);
      box(COL.red, 2.55, B + 0.88, sz * 0.6 - 0.24, 2.63, B + 1.04, sz * 0.6 + 0.24, [sz * 0.25, 0, 0]);
      box(COL.yellow, 2.6, B + 0.92, sz * 0.6 - 0.05, 2.65, B + 1.0, sz * 0.6 + 0.05);
    }
  }
  const geo = bake(out);
  out.forEach((p) => p.geometry.dispose());
  geo.computeBoundingSphere();
  return geo;
}

/* One wheel: a 66 inch tyre with paddle lugs, a rim and a hub, axis along
 * z, vertex coloured in the rim's colour `rim`. */
function wheelGeometry(rim) {
  const { out, box } = pieces();
  const W = TRUCK.tyreW;
  const tyre = painted(new THREE.CylinderGeometry(R - 0.05, R - 0.05, W, 20, 1), COL.tyre);
  tyre.rotateX(Math.PI / 2);
  out.push({ geometry: tyre, matrix: new THREE.Matrix4() });
  /* The lugs, chevroned: two rows offset, each a block standing off the
   * carcass, so the tyre reads as a monster truck's from across the hall. */
  const n = 18;
  for (let i = 0; i < n; i += 1) {
    for (const side of [-1, 1]) {
      const a = ((i + (side > 0 ? 0.5 : 0)) / n) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const g = painted(new THREE.BoxGeometry(0.16, 0.12, W * 0.46), COL.tread);
      const m = new THREE.Matrix4().makeRotationZ(a + Math.PI / 2);
      m.setPosition(c * (R - 0.04), s * (R - 0.04), side * W * 0.24);
      out.push({ geometry: g, matrix: m });
    }
  }
  const rimG = painted(new THREE.CylinderGeometry(R * 0.55, R * 0.55, W * 0.9, 14, 1), rim);
  rimG.rotateX(Math.PI / 2);
  out.push({ geometry: rimG, matrix: new THREE.Matrix4() });
  const hub = painted(new THREE.CylinderGeometry(0.16, 0.16, W * 1.02, 8, 1), COL.hub);
  hub.rotateX(Math.PI / 2);
  out.push({ geometry: hub, matrix: new THREE.Matrix4() });
  /* Spokes, so the wheel is seen to turn. */
  for (let k = 0; k < 3; k += 1) {
    box(COL.hub, -R * 0.5, -0.04, W * 0.44, R * 0.5, 0.04, W * 0.47, [0, 0, (k * Math.PI) / 3]);
    box(COL.hub, -R * 0.5, -0.04, -W * 0.47, R * 0.5, 0.04, -W * 0.44, [0, 0, (k * Math.PI) / 3]);
  }
  const geo = bake(out);
  out.forEach((p) => p.geometry.dispose());
  return geo;
}

/*
 * THE NAMES, one picture: a cell for each truck, its kanji big and its
 * kana under it, in the town's lettering, a comic's ink round each. The
 * picture is the browser's and reaches no physics.
 */
function nameAtlas() {
  const W = 512;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H * LIVERIES.length;
  const g = c.getContext('2d');
  const face = '900 {px}px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Noto Sans CJK JP", "Arial Black", sans-serif';
  LIVERIES.forEach((lv, i) => {
    const y = i * H;
    const fg = `#${new THREE.Color(lv.accent).getHexString()}`;
    g.lineJoin = 'round';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let px = 100;
    g.font = face.replace('{px}', px);
    while (g.measureText(lv.kanji).width > W * 0.56 && px > 20) {
      px -= 4;
      g.font = face.replace('{px}', px);
    }
    g.lineWidth = 14;
    g.strokeStyle = '#1d1b24';
    g.strokeText(lv.kanji, W * 0.32, y + H * 0.5);
    g.fillStyle = fg === '#1d1b24' ? '#f6f2ea' : fg;
    g.fillText(lv.kanji, W * 0.32, y + H * 0.5);
    g.font = face.replace('{px}', 44);
    g.lineWidth = 9;
    g.strokeText(lv.kana, W * 0.78, y + H * 0.52);
    g.fillStyle = '#f6f2ea';
    g.fillText(lv.kana, W * 0.78, y + H * 0.52);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* The door and tailgate quads that carry truck `i`'s name. */
function nameGeometry(i) {
  const v0 = 1 - (i + 1) / LIVERIES.length;
  const v1 = 1 - i / LIVERIES.length;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const B = TRUCK.bodyY;
  const quad = (cx, cy, cz, nx, nz, w, h) => {
    /* Right of the face, as seen from outside, is n x up. */
    const rx = -nz;
    const rz = nx;
    const base = pos.length / 3;
    for (const [sx, sy, tu, tv] of [[-1, -1, 0, v0], [1, -1, 1, v0], [1, 1, 1, v1], [-1, 1, 0, v1]]) {
      pos.push(cx + rx * sx * w / 2, cy + sy * h / 2, cz + rz * sx * w / 2);
      nor.push(nx, 0, nz);
      uv.push(tu, tv);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  quad(-1.85, B + 0.42, 1.232, 0, 1, 1.6, 0.42);
  quad(-1.85, B + 0.42, -1.232, 0, -1, 1.6, 0.42);
  quad(0.35, B + 0.48, 1.245, 0, 1, 1.25, 0.32);
  quad(0.35, B + 0.48, -1.245, 0, -1, 1.25, 0.32);
  quad(-2.912, B + 0.45, 0, -1, 0, 1.6, 0.4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/* Dirt: every DUST_EVERY steps of the lap clock. */
const DUST_EVERY = 48;

/*
 * The trucks. `dome` is ./course.js domeTraffic's answer, `rider`
 * makeRider's. Returns { group, place(prev, curr, alpha, now), emit(step,
 * poses), clear(), gapAt(x, y, z, reach), stats(), dispose() }, the hooks
 * the shell calls for a map's traffic.
 */
export function buildTrucks(look, dome, rider) {
  const group = new THREE.Group();
  group.name = 'trucks';
  const owned = { geometries: [], materials: [], textures: [] };
  const mat = cel({
    color: 0xffffff, vertexColors: true, bands: 3, tint: 0x5c5680, cache: false,
  });
  owned.materials.push(mat);
  const tex = nameAtlas();
  owned.textures.push(tex);
  const nameMat = paintMaterial(THREE, tex);
  owned.materials.push(nameMat);

  const bodies = LIVERIES.map((lv) => {
    const g = truckGeometry(lv);
    owned.geometries.push(g);
    return g;
  });
  const names = LIVERIES.map((lv, i) => {
    const g = nameGeometry(i);
    owned.geometries.push(g);
    return g;
  });
  const wheelGeos = LIVERIES.map((lv) => {
    const g = wheelGeometry(lv.rim);
    owned.geometries.push(g);
    return g;
  });

  const mk = (i, label) => {
    const mesh = new THREE.Mesh(bodies[i], mat);
    mesh.name = label;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const nm = new THREE.Mesh(names[i], nameMat);
    nm.matrixAutoUpdate = false;
    nm.frustumCulled = false;
    nm.castShadow = false;
    group.add(mesh, nm);
    return { mesh, nm };
  };

  /* The moving ones, and the parked ones. */
  const trucks = dome.trucks.map((t) => {
    const { mesh, nm } = mk(t.livery, `truck:${t.name}`);
    mesh.visible = false;
    nm.visible = false;
    return {
      slot: t.slot, livery: t.livery, name: t.name, mesh, nm, on: false, x: 0, y: 0, z: 0, hx: 1, hz: 0, air: 0, wasAir: 0,
    };
  });
  const parked = PARKED.map((p) => {
    const { mesh, nm } = mk(p.livery, 'truck:parked');
    return { ...p, mesh, nm };
  });

  /* The wheels: one instanced mesh a livery's rims, four a truck. */
  const wheelSets = LIVERIES.map((lv, li) => {
    const count = 4 * (trucks.filter((t) => t.livery === li).length + parked.filter((p) => p.livery === li).length);
    const im = new THREE.InstancedMesh(wheelGeos[li], mat, Math.max(1, count));
    im.name = `truckWheels:${lv.key}`;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.castShadow = true;
    im.receiveShadow = true;
    im.count = count;
    group.add(im);
    return { im, next: 0 };
  });
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  const seat = (owner) => {
    const set = wheelSets[owner.livery];
    owner.wheel0 = set.next;
    owner.set = set;
    set.next += 4;
    for (let k = 0; k < 4; k += 1) {
      set.im.setMatrixAt(owner.wheel0 + k, HIDDEN);
    }
  };
  trucks.forEach(seat);
  parked.forEach(seat);

  const dust = new Smoke(THREE, look, {
    max: 320, life: 1.3, fill: 0xd2ae84, shade: 0x9c7a58, name: 'truckDust',
  });
  group.add(dust.mesh);

  const E = new THREE.Euler();
  const Q = new THREE.Quaternion();
  const ONE = new THREE.Vector3(1, 1, 1);
  const POS = new THREE.Vector3();
  const BODY = new THREE.Matrix4();
  const LOCAL = new THREE.Matrix4();
  const WM = new THREE.Matrix4();
  const TAU = Math.PI * 2;
  const WHEELS = [[AX, -TZ], [AX, TZ], [-AX, -TZ], [-AX, TZ]];

  /* A truck's body and wheels at (x, y, z), heading (hx, hz) in the
   * plane, `ride` its pitch, roll and yaw, `dist` how far it has rolled,
   * `steer` its front wheels' angle, `droop` how far its wheels hang. */
  function pose(o, x, y, z, hx, hz, ride, dist, steer, droop) {
    const yaw = Math.atan2(-hz, hx) + ride.yaw;
    E.set(-ride.roll, yaw, ride.pitch, 'YZX');
    Q.setFromEuler(E);
    POS.set(x, y, z);
    BODY.compose(POS, Q, ONE);
    o.mesh.matrix.copy(BODY);
    o.mesh.matrixWorldNeedsUpdate = true;
    o.nm.matrix.copy(BODY);
    o.nm.matrixWorldNeedsUpdate = true;
    const turn = R * TAU;
    const spin = -((dist - Math.floor(dist / turn) * turn) / R);
    for (let k = 0; k < 4; k += 1) {
      const [wx, wz] = WHEELS[k];
      E.set(0, wx > 0 ? steer : -steer * 0.6, spin, 'YXZ');
      Q.setFromEuler(E);
      POS.set(wx, R - droop, wz);
      LOCAL.compose(POS, Q, ONE);
      WM.multiplyMatrices(BODY, LOCAL);
      o.set.im.setMatrixAt(o.wheel0 + k, WM);
    }
    o.set.im.instanceMatrix.needsUpdate = true;
  }

  /* The parked trucks stand still, once. */
  const still = {
    dy: 0, pitch: 0, yaw: 0, roll: 0, air: 0,
  };
  for (const p of parked) {
    pose(p, p.x, FLOOR.dirt, p.z, Math.cos(p.yaw), -Math.sin(p.yaw), still, 0, 0.18, 0);
  }

  const ride = {
    dy: 0, pitch: 0, yaw: 0, roll: 0, air: 0,
  };
  const interp = {
    distance: 0, speed: 0, curvature: 0, on: true,
  };

  function place(prev, curr, alpha, now) {
    const a = alpha > 0 ? (alpha < 1 ? alpha : 1) : 0;
    const b = 1 - a;
    for (let k = 0; k < trucks.length; k += 1) {
      const t = trucks[k];
      const q = curr[t.slot];
      const p = prev[t.slot] && prev[t.slot].on ? prev[t.slot] : q;
      if (!q || !q.on) {
        if (t.on) {
          t.on = false;
          t.mesh.visible = false;
          t.nm.visible = false;
          for (let w = 0; w < 4; w += 1) {
            t.set.im.setMatrixAt(t.wheel0 + w, HIDDEN);
          }
          t.set.im.instanceMatrix.needsUpdate = true;
        }
        continue;
      }
      const x = p.x * b + q.x * a;
      const z = p.z * b + q.z * a;
      let hx = p.hx * b + q.hx * a;
      let hz = p.hz * b + q.hz * a;
      const hl = Math.sqrt(hx * hx + hz * hz);
      if (hl > 1e-9) {
        hx /= hl;
        hz /= hl;
      } else {
        hx = q.hx;
        hz = q.hz;
      }
      interp.distance = p.distance * b + q.distance * a;
      interp.speed = p.speed * b + q.speed * a;
      interp.curvature = (p.curvature || 0) * b + (q.curvature || 0) * a;
      rider.rideOf(t.slot, interp, ride);
      t.on = true;
      t.x = x;
      t.z = z;
      t.y = ride.dy;
      t.hx = hx;
      t.hz = hz;
      t.air = ride.air;
      const slipAngle = 2 * Math.atan(q.slip || 0);
      let steer = Math.atan(TRUCK.base * interp.curvature) - slipAngle;
      steer = steer > 0.55 ? 0.55 : (steer < -0.55 ? -0.55 : steer);
      const droop = ride.air > 0 ? 0.32 * 4 * ride.air * (1 - ride.air) + 0.08 : 0;
      pose(t, x, ride.dy, z, hx, hz, ride, interp.distance, steer, droop);
      t.mesh.visible = true;
      t.nm.visible = true;
    }
    dust.draw(now);
  }

  /* The dirt's feed, at every multiple of 8 steps; only DUST_EVERY's put a
   * puff down: a trickle down the straights, a rooster tail sliding
   * through a bend, a burst on every landing. */
  let lastStep = -1;
  function emit(step, poses) {
    if (!(step >= 0)) {
      return;
    }
    if (step < lastStep) {
      dust.clear();
    }
    lastStep = step;
    if (step % DUST_EVERY !== 0) {
      return;
    }
    for (let k = 0; k < trucks.length; k += 1) {
      const t = trucks[k];
      const q = poses[t.slot];
      if (!q || !q.on || !(q.speed > 3)) {
        continue;
      }
      rider.rideOf(t.slot, q, ride);
      const landed = t.wasAir > 0 && ride.air === 0;
      t.wasAir = ride.air;
      if (ride.air > 0) {
        continue;
      }
      const slip = q.slip < 0 ? -q.slip : q.slip;
      const dig = (slip > 0.05 ? 0.6 : 0) + (landed ? 1.2 : 0);
      if (dig === 0 && ((step / DUST_EVERY) | 0) % 2 !== k % 2) {
        continue;
      }
      const h1 = hash01(step, t.slot, 3);
      const h2 = hash01(step + 7, t.slot, 11);
      const h3 = hash01(step + 13, t.slot, 17);
      for (const sz of [-1, 1]) {
        /* Behind each rear tyre, the side across the heading. */
        const px = q.x - q.hx * (AX + 0.4) - q.hz * sz * TZ;
        const pz = q.z - q.hz * (AX + 0.4) + q.hx * sz * TZ;
        dust.put(step, px, ride.dy + 0.4, pz, -q.vx * 0.3, -q.vz * 0.3, 0.3 + 0.35 * (dig > 1 ? 1 : dig), sz > 0 ? h1 : h2, h3, h1);
      }
      if (landed) {
        dust.put(step, q.x, ride.dy + 0.5, q.z, -q.vx * 0.4, -q.vz * 0.4, 0.9, h2, h1, h3);
      }
    }
  }

  /* The nearest a point comes to any truck, for the close call. */
  function gapAt(px, py, pz, reach) {
    let best = reach;
    const check = (cx, cy, cz, hx, hz) => {
      const dx = px - cx;
      const dz = pz - cz;
      const along = dx * hx + dz * hz;
      const across = -dx * hz + dz * hx;
      const ea = Math.max(0, (along < 0 ? -along : along) - TRUCK.length / 2);
      const ec = Math.max(0, (across < 0 ? -across : across) - TRUCK.width / 2);
      const ey = py < cy ? cy - py : Math.max(0, py - (cy + TRUCK.roof));
      const d = Math.sqrt(ea * ea + ec * ec + ey * ey);
      if (d < best) {
        best = d;
      }
    };
    for (let k = 0; k < trucks.length; k += 1) {
      const t = trucks[k];
      if (t.on) {
        check(t.x, t.y, t.z, t.hx, t.hz);
      }
    }
    return best;
  }

  return {
    group,
    trucks,
    place,
    emit,
    clear() {
      dust.clear();
      lastStep = -1;
    },
    gapAt,
    stats() {
      let tris = 0;
      for (const g of bodies) {
        tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      }
      const wheel = wheelGeos[0].index ? wheelGeos[0].index.count / 3 : wheelGeos[0].attributes.position.count / 3;
      return {
        trucks: trucks.length,
        parked: parked.length,
        draws: 2 * (trucks.length + parked.length) + wheelSets.length + 1,
        bodyTriangles: Math.round(tris / bodies.length),
        wheelTriangles: Math.round(wheel),
      };
    },
    dispose() {
      for (const g of owned.geometries) {
        g.dispose();
      }
      for (const m of owned.materials) {
        m.dispose();
      }
      for (const t of owned.textures) {
        t.dispose();
      }
      dust.dispose();
      group.clear();
    },
  };
}
