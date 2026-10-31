/*
 * index.js: Hayate Circuit as a map, built the way Sunnyfield is
 * (../sunny/index.js): the built map's pipeline (../built/index.js) does the
 * sky, the ground, the ink, the shadows, the colliders, the cull, the named
 * gaps, the cars and the marks. This file hands it the circuit's document
 * (./yard.js) and the circuit itself (./layout.js) as one structure of its
 * own, draws what the parts cannot say, hangs the signs (./signs.js), puts
 * the snow capped volcano on the horizon and names the world.
 *
 * WHAT THE DRAW ADDS, in the world frame, after the kit has drawn every
 * part the plan marks as drawn: the gravel traps and the kerbs, the armco's
 * rails and its posts, the tyre stacks, the catch fences, the marshals'
 * huts and the camera towers, the garages' tyre sets and the paddock's
 * tents, the stands' girders and their stalls, the Ferris wheel's rims and
 * spokes and its cabins, the giant tyre over the back straight, the pond
 * and its carp, the shrine's rope, the poles and their wires, and the
 * maples. Each is filed under the cull cell ./frame.js puts its place in,
 * which the pipeline also files the parts and the document's assets by, so
 * the circuit is twelve cull cells and, after the palette merge
 * (../sunny/palette.js), a handful of batches a cell.
 *
 * THE MAPLES are the builder's broadleaf, each drawn by the kit as any
 * tree is, with its leaves in four autumn colours in place of its greens,
 * and solid from the same tree's own layout. They cost what a street tree
 * costs.
 *
 * THE RACE CARS are the module's vehicles on the course (./yard.js), drawn
 * by the built map's cars. This file hands the module their cornering, the
 * one number a document cannot say: RACE_LATERAL, a race car's grip and
 * not a family car's.
 *
 * On Low, what the plan marks `fine` is not drawn: the armco's lower rail,
 * every other tyre stack, the window frames, the tool chests' drawers, the
 * cables. Nothing fine is solid, so the flight is the same.
 *
 * FOR THE LATENCY RULE: on every other map, nothing (this file loads only
 * when the map is chosen, by dynamic import from ../registry.js). On this
 * map, draws and triangles are measured in the PR against Sunnyfield and
 * Drift Matsuri; per frame on the CPU it adds nothing to the pipeline's
 * own work, because nothing here runs per frame.
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
import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import { qualityFor } from '../../render/quality.js';
import { paintMaterial } from '../../art/stf.js';
import { flat } from '../city/vendored/core/toon.js';
import { treeLayout } from '../../props/street.js';
import { sincos } from '../../props/trig.js';
import { pointAt } from '../built/road.js';
import {
  W, D, w, chunkOf, courseLine, lapped,
} from './frame.js';
import { hayateLayout } from './layout.js';
import { hayateDocument, hayateMaples, RACE_LATERAL } from './yard.js';
import { paintSigns, signMesh } from './signs.js';
import { PIT } from './pits.js';
import { mergePalette } from '../sunny/palette.js';

/* A plan heading as a yaw for kit.begin, whose local x it turns onto the
 * heading: render only. */
const yawOf = (tx, ty) => Math.atan2(ty, tx);

/* A box on the plan's axes, drawn only. */
function pbox(kit, m, x0, y0, h0, x1, y1, h1) {
  const a = w(x0, y0, h0);
  const b = w(x1, y1, h1);
  kit.box(m, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]));
}

/* Begin a local frame at a plan point, its x along the heading. */
function at(kit, x, y, h, yaw, cell) {
  const p = w(x, y, h);
  kit.begin(p[0], p[1], p[2], yaw, cell);
}

/* A ribbon lying on the ground along the course, between two offsets from
 * its centre line, from s0 to s1, facing up whichever way it is wound. */
function courseRibbon(line, s0, s1, off0, off1, h) {
  const pos = [];
  const index = [];
  const n = Math.max(2, Math.ceil((s1 - s0) / 2));
  for (let i = 0; i <= n; i += 1) {
    const p = pointAt(line, lapped(s0 + ((s1 - s0) * i) / n));
    for (const off of [off0, off1]) {
      const q = w(p.x - p.ty * off, p.y + p.tx * off, h);
      pos.push(q[0], q[1], q[2]);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
    g.computeVertexNormals();
  }
  return g;
}

/* A cable's curve between two plan points, hanging `sag` at its middle. */
function wireCurve(o) {
  const a = new THREE.Vector3(...w(o.a[0], o.a[1], o.a[2]));
  const b = new THREE.Vector3(...w(o.b[0], o.b[1], o.b[2]));
  const c = a.clone().add(b).multiplyScalar(0.5);
  c.y -= 2 * o.sag;
  return new THREE.QuadraticBezierCurve3(a, c, b);
}

/* Prisms along x are drawn turned a quarter, so the kit's extrusion along
 * its local z runs east; along y they are drawn unturned and run south.
 * ../sunny/index.js drawPrisms, in this plan. */
function prism(kit, p) {
  if (p.axis === 'x') {
    kit.begin(0, 0, 0, Math.PI / 2, p.at);
    kit.extrude(p.m, p.profile.map(([a, h]) => [a - D / 2, h]), p.e0 - W / 2, p.e1 - W / 2);
  } else {
    kit.begin(0, 0, 0, 0, p.at);
    kit.extrude(p.m, p.profile.map(([a, h]) => [a - W / 2, h]), D / 2 - p.e1, D / 2 - p.e0);
  }
}
}

const CABIN = ['mxRed', 'craneYellow', 'mxBlue', 'mxGreen', 'white', 'mxOrange', 'hyPink', 'containerTeal'];
const STALL = ['mxRed', 'mxBlue', 'mxOrange', 'mxGreen', 'craneYellow', 'hyPink'];
const MAPLE = { stGrove0: 'hyMaple0', stGrove1: 'hyMaple1', stGrove2: 'hyMaple2' };
const SC = { s: 0, c: 0 };

function drawOp(kit, o, low, line) {
  if (low && o.fine) {
    return;
  }
  const cell = o.at;
  switch (o.t) {
    case 'box':
      kit.begin(0, 0, 0, 0, cell);
      pbox(kit, o.m, o.x0, o.y0, o.h0, o.x1, o.y1, o.h1);
      break;
    case 'obox':
      at(kit, o.x, o.y, 0, yawOf(o.tx, o.ty), cell);
      kit.box(o.m, -o.len / 2, o.h0, -o.wid / 2, o.len / 2, o.h1, o.wid / 2);
      break;
    case 'cyl':
      kit.begin(0, 0, 0, 0, cell);
      kit.cyl(o.m, w(...o.a), w(...o.b), o.r, o.seg, o.rTop);
      break;
    case 'blob':
      kit.begin(0, 0, 0, 0, cell);
      kit.blob(o.m, w(...o.c), o.r, o.ry, [0, o.k, 0]);
      break;
    case 'cone':
      kit.begin(0, 0, 0, 0, cell);
      kit.cone(o.m, w(...o.c), o.r, o.h, o.seg);
      break;
    case 'prism':
      prism(kit, o);
      break;
    case 'strip':
      kit.begin(0, 0, 0, 0, cell);
      kit.add(o.m, courseRibbon(line, o.s0, o.s1, o.off0, o.off1, o.h));
      break;
    case 'kerb':
      at(kit, o.x, o.y, 0, yawOf(o.tx, o.ty), cell);
      kit.box(o.red ? 'hyKerbRed' : 'white', -o.len / 2, 0.01, -0.55, o.len / 2, 0.07, 0.55);
      break;
    case 'tyres': {
      const p = w(o.x, o.y, 0);
      kit.begin(0, 0, 0, 0, cell);
      kit.cyl('drTyre', p, [p[0], 0.26 * o.n, p[2]], 0.36, low ? 6 : 8);
      if (o.band) {
        kit.cyl('white', [p[0], 0.26 * o.n - 0.2, p[2]], [p[0], 0.26 * o.n - 0.06, p[2]], 0.37, low ? 6 : 8);
      }
      break;
    }
    case 'net': {
      /* The catch fence: a post every five metres, a top rail and three
       * strands, which read as the fence a net is from any distance. */
      kit.begin(0, 0, 0, 0, cell);
      for (let x = o.x0; x <= o.x1 + 0.01; x += 5) {
        kit.cyl('metal', w(x, o.y, o.h0), w(x, o.y, o.h1), 0.05, 4);
      }
      for (const [h, t] of [[o.h1 - 0.05, 0.05], [o.h0 + (o.h1 - o.h0) * 0.66, 0.015], [o.h0 + (o.h1 - o.h0) * 0.33, 0.015]]) {
        pbox(kit, 'metal', o.x0, o.y - t, h - t, o.x1, o.y + t, h + t);
      }
      break;
    }
    case 'marshal': {
      /* A marshal's hut: white, a window to the track, an orange roof with
       * the post's number on it (./signs.js), and a flag pole. */
      kit.begin(0, 0, 0, 0, cell);
      pbox(kit, 'white', o.x - 1.1, o.y - 1.1, 0, o.x + 1.1, o.y + 1.1, 2.5);
      pbox(kit, 'mxOrange', o.x - 1.3, o.y - 1.3, 2.5, o.x + 1.3, o.y + 1.3, 2.88);
      const nx = -o.side * -o.ty;
      const ny = -o.side * o.tx;
      const fx = o.x + nx * 1.12;
      const fy = o.y + ny * 1.12;
      at(kit, fx, fy, 0, yawOf(-ny, nx), cell);
      kit.box('glassBlue', -0.7, 1.2, -0.03, 0.7, 2.1, 0.03);
      kit.begin(0, 0, 0, 0, cell);
      kit.cyl('flagMast', w(o.x + 1.4, o.y + 1.4, 0), w(o.x + 1.4, o.y + 1.4, 4.2), 0.04, 4);
      pbox(kit, 'craneYellow', o.x + 1.42, o.y + 1.38, 3.5, o.x + 2.3, o.y + 1.42, 4.1);
      break;
    }
    case 'boardBack': {
      at(kit, o.x, o.y, 0, yawOf(-o.ny, o.nx), cell);
      kit.box('hyInk', -o.wd / 2 - 0.06, o.h - o.ht / 2 - 0.06, -0.04, o.wd / 2 + 0.06, o.h + o.ht / 2 + 0.06, 0.04);
      break;
    }
    case 'camTower': {
      /* A TV camera's scaffold: four legs, a deck with a rail, the camera
       * on its tripod under a parasol. */
      at(kit, o.x, o.y, 0, yawOf(o.tx, o.ty), cell);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        kit.cyl('scaffold', [x, 0, z], [x, o.h + 1.0, z], 0.05, 4);
      }
      for (const y of [o.h * 0.33, o.h * 0.66]) {
        kit.box('scaffold', -1, y - 0.03, -1.03, 1, y + 0.03, -0.97);
        kit.box('scaffold', -1, y - 0.03, 0.97, 1, y + 0.03, 1.03);
      }
      kit.box('plywood', -1.15, o.h - 0.1, -1.15, 1.15, o.h, 1.15);
      kit.box('scaffold', -1.1, o.h + 0.95, -1.1, 1.1, o.h + 1.0, -1.05);
      kit.box('scaffold', -1.1, o.h + 0.95, 1.05, 1.1, o.h + 1.0, 1.1);
      kit.cyl('metalDark', [0, o.h, 0], [0, o.h + 1.3, 0], 0.05, 4);
      kit.box('metalDark', -0.25, o.h + 1.3, -0.2, 0.45, o.h + 1.7, 0.2);
      kit.cyl('metalDark', [0.45, o.h + 1.5, 0], [0.75, o.h + 1.5, 0], 0.11, 6);
      kit.cyl('flagMast', [-0.6, o.h, 0.6], [-0.6, o.h + 2.6, 0.6], 0.03, 4);
      kit.cone('white', [-0.6, o.h + 2.3, 0.6], 1.3, 0.5, 8);
      break;
    }
    case 'fan':
      kit.begin(0, 0, 0, 0, cell);
      kit.cyl('metal', w(o.x, o.y, o.h - 0.5), w(o.x, o.y, o.h), 0.5, 8);
      kit.cyl('metalDark', w(o.x, o.y, o.h), w(o.x, o.y, o.h + 0.06), 0.42, 8);
      break;
    case 'tyreStack': {
      const p = w(o.x, o.y, 0);
      kit.begin(0, 0, 0, 0, cell);
      for (let i = 0; i < o.n; i += 1) {
        kit.cyl('drTyre', [p[0], i * 0.3, p[2]], [p[0], i * 0.3 + 0.28, p[2]], 0.34, 8);
      }
      kit.cyl('metal', [p[0], o.n * 0.3 - 0.02, p[2]], [p[0], o.n * 0.3, p[2]], 0.2, 6);
      break;
    }
    case 'tyreRack': {
      at(kit, o.x, o.y, 0, 0, cell);
      kit.box('metal', -1.8, 0, -0.5, -1.7, 1.6, 0.5);
      kit.box('metal', 1.7, 0, -0.5, 1.8, 1.6, 0.5);
      kit.box('metal', -1.8, 0.75, -0.5, 1.8, 0.8, 0.5);
      for (let i = 0; i < o.n; i += 1) {
        const x = -1.35 + i * 0.9;
        kit.cyl('drTyre', [x, 0.8, -0.14], [x, 0.8, 0.14], 0.33, 8);
        kit.cyl('drTyre', [x, 1.0 + 0.33, -0.14], [x, 1.0 + 0.33, 0.14], 0.33, 8);
      }
      break;
    }
    case 'tent': {
      /* A paddock gazebo: four legs, a pyramid roof in its colour and a
       * valance round it. */
      const s = o.s / 2;
      at(kit, o.x, o.y, 0, 0, cell);
      for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
        kit.cyl('metal', [x, 0, z], [x, o.h, z], 0.05, 4);
      }
      kit.box(o.m, -s - 0.05, o.h - 0.3, -s - 0.05, s + 0.05, o.h, s + 0.05);
      kit.begin(...w(o.x, o.y, o.h), Math.PI / 4, cell);
      kit.cone(o.m, [0, 0, 0], s * 1.414, 1.1, 4);
      break;
    }
    case 'tableSet': {
      at(kit, o.x, o.y, 0, 0, cell);
      kit.box('white', -0.8, 0.72, -0.45, 0.8, 0.76, 0.45);
      kit.cyl('metal', [0, 0, 0], [0, 0.72, 0], 0.04, 4);
      for (const [x, z] of [[-1.1, 0], [1.1, 0], [0, -0.8], [0, 0.8]]) {
        kit.box('mxBlue', x - 0.22, 0.42, z - 0.22, x + 0.22, 0.46, z + 0.22);
        kit.box('mxBlue', x - 0.22, 0.46, z + (z >= 0 ? 0.18 : -0.22), x + 0.22, 0.85, z + (z >= 0 ? 0.22 : -0.18));
      }
      break;
    }
    case 'scooter': {
      at(kit, o.x, o.y, 0, (o.k % 3) * 0.4, cell);
      kit.box(['mxRed', 'mxBlue', 'white'][o.k % 3], -0.55, 0.25, -0.2, 0.55, 0.55, 0.2);
      kit.box('rope', -0.4, 0.55, -0.16, 0.2, 0.68, 0.16);
      kit.cyl('metal', [0.55, 0.3, 0], [0.6, 1.0, 0], 0.03, 4);
      kit.cyl('metal', [0.6, 1.0, -0.3], [0.6, 1.0, 0.3], 0.02, 4);
      for (const x of [-0.5, 0.55]) {
        kit.cyl('drTyre', [x, 0.2, -0.07], [x, 0.2, 0.07], 0.2, 8);
      }
      break;
    }
    case 'lamp': {
      kit.begin(0, 0, 0, 0, cell);
      kit.cyl('metal', w(o.x, o.y, 0), w(o.x, o.y, o.h), 0.09, 6);
      pbox(kit, 'metalDark', o.x - 0.6, o.y - 0.2, o.h, o.x + 0.6, o.y + 0.2, o.h + 0.3);
      pbox(kit, 'lampGlow', o.x - 0.55, o.y - 0.15, o.h - 0.02, o.x + 0.55, o.y + 0.15, o.h);
      break;
    }
    case 'girder': {
      kit.begin(0, 0, 0, 0, cell);
      pbox(kit, 'metal', o.x - 0.15, o.y0, o.h - 0.7, o.x + 0.15, o.y1, o.h - 0.55);
      pbox(kit, 'metal', o.x - 0.06, o.y0, o.h - 0.55, o.x + 0.06, o.y1, o.h);
      break;
    }
    case 'stall': {
      /* A yatai: a counter, a striped awning, a lantern. */
      const m = STALL[o.k % STALL.length];
      at(kit, o.x, o.y, 0, 0, cell);
      kit.box('hyTimber', -1.8, 0, -1.0, 1.8, 1.0, 1.0);
      kit.box('white', -1.85, 1.0, -1.05, 1.85, 1.06, 1.05);
      for (const x of [-1.75, 1.75]) {
        kit.cyl('hyTimber', [x, 1.0, -0.9], [x, 2.4, -0.9], 0.05, 4);
        kit.cyl('hyTimber', [x, 1.0, 0.9], [x, 2.6, 0.9], 0.05, 4);
      }
      for (let i = 0; i < 6; i += 1) {
        const x0 = -2 + i * (4 / 6);
        kit.box(i % 2 ? 'white' : m, x0, 2.4, -1.3, x0 + 4 / 6, 2.62, 1.2);
      }
      kit.blob('lampRed', [1.6, 2.15, -1.3], 0.18, 0.24, [0, o.k, 0]);
      break;
    }
    case 'vending': {
      kit.begin(0, 0, 0, 0, cell);
      kit.town('vending', { variant: o.k % 4, seed: o.k }, w(o.x, o.y, 0), o.yaw);
      break;
    }
    case 'flag': {
      kit.begin(0, 0, 0, 0, cell);
      kit.cyl('flagMast', w(o.x, o.y, 0), w(o.x, o.y, o.h), 0.06, 4);
      pbox(kit, o.m, o.x - 0.02, o.y, o.h - 1.4, o.x + 0.02, o.y + 2.2, o.h - 0.1);
      break;
    }
    case 'rug':
      at(kit, o.x, o.y, o.h, (o.k % 5) * 0.2, cell);
      kit.box(o.m, -1, 0, -0.75, 1, 0.03, 0.75);
      break;
    case 'parasol':
      kit.begin(0, 0, 0, 0, cell);
      kit.cyl('white', w(o.x, o.y, o.h), w(o.x, o.y, o.h + 2.1), 0.03, 4);
      kit.cone(o.m, w(o.x, o.y, o.h + 1.8), 1.3, 0.5, 8);
      break;
    case 'giantTyre': {
      /* The tyre over the back straight: a giant's racing tyre on its
       * edge, its axis east and west, a red band on its shoulder. */
      at(kit, o.x, o.y, o.h, Math.PI / 2, cell);
      const segs = low ? 24 : 40;
      kit.add('drTyre', new THREE.TorusGeometry(o.R, o.r, 8, segs));
      kit.add('hyKerbRed', new THREE.TorusGeometry(o.R + o.r * 0.55, o.r * 0.5, 4, segs).scale(1, 1, 0.25).translate(0, 0, o.r * 0.82));
      kit.add('white', new THREE.TorusGeometry(o.R + o.r * 0.55, o.r * 0.5, 4, segs).scale(1, 1, 0.25).translate(0, 0, -o.r * 0.82));
      break;
    }
    case 'wheel': {
      /* The sky wheel's rims, inner rings and spokes, over their capsules
       * (./park.js), its hub and the hub's caps. */
      const segs = low ? 32 : 48;
      for (const dy of [-o.half, o.half]) {
        at(kit, o.x, o.y + dy, o.hub, 0, cell);
        kit.add('hyWheel', new THREE.TorusGeometry(o.R, 0.22, 6, segs));
        kit.add('hyWheel', new THREE.TorusGeometry(o.R * 0.36, 0.12, 4, 32));
        kit.begin(0, 0, 0, 0, cell);
        for (let i = 0; i < o.spokes; i += 1) {
          sincos(((i + 0.5) / o.spokes) * 2 * Math.PI, SC);
          kit.cyl('hyWheel', w(o.x + SC.c * 1.4, o.y + dy, o.hub + SC.s * 1.4), w(o.x + SC.c * o.R, o.y + dy, o.hub + SC.s * o.R), 0.1, 4);
        }
      }
      kit.begin(0, 0, 0, 0, cell);
      for (let i = 0; i < o.cabins; i += 1) {
        sincos((i / o.cabins) * 2 * Math.PI, SC);
        kit.cyl('metal', w(o.x + SC.c * o.R, o.y - o.half, o.hub + SC.s * o.R), w(o.x + SC.c * o.R, o.y + o.half, o.hub + SC.s * o.R), 0.08, 4);
      }
      for (let i = 0; i < 16; i += 1) {
        sincos((i / 16) * 2 * Math.PI, SC);
        kit.blob('lampGlow', w(o.x + SC.c * (o.R + 0.3), o.y - o.half - 0.25, o.hub + SC.s * (o.R + 0.3)), 0.22, 0.22, [0, i, 0]);
      }
      kit.cyl('hyPink', w(o.x, o.y - o.legY - 0.45, o.hub), w(o.x, o.y - o.legY - 0.7, o.hub), 2.0, 12);
      kit.cyl('hyPink', w(o.x, o.y + o.legY + 0.45, o.hub), w(o.x, o.y + o.legY + 0.7, o.hub), 2.0, 12);
      break;
    }
    case 'cabin': {
      /* A gondola: a roof, a window band all round, a seat line. */
      const m = CABIN[o.k % CABIN.length];
      kit.begin(0, 0, 0, 0, cell);
      pbox(kit, 'glassBlue', o.x - 1.12, o.y - 0.97, o.h - 0.1, o.x + 1.12, o.y + 0.97, o.h + 0.75);
      pbox(kit, m, o.x - 1.2, o.y - 1.05, o.h + 1.0, o.x + 1.2, o.y + 1.05, o.h + 1.15);
      kit.blob(m, w(o.x, o.y, o.h + 1.15), 1.0, 0.35, [0, 0, 0]);
      break;
    }
    case 'bench':
      at(kit, o.x, o.y, 0, 0, cell);
      kit.box('hyTimber', -1.0, 0.42, -0.25, 1.0, 0.48, 0.25);
      kit.box('hyTimber', -1.0, 0.48, 0.2, 1.0, 0.9, 0.25);
      kit.box('metalDark', -0.9, 0, -0.2, -0.8, 0.42, 0.2);
      kit.box('metalDark', 0.8, 0, -0.2, 0.9, 0.42, 0.2);
      break;
    case 'pond': {
      /* The water, an ellipse a few centimetres up, and its stone edge. */
      at(kit, o.x, o.y, 0, 0, cell);
      const g = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2).scale(o.rx, 1, o.ry).translate(0, 0.06, 0);
      kit.add('hyWater', g);
      const e = new THREE.TorusGeometry(1, 0.025, 4, 40).rotateX(Math.PI / 2).scale(o.rx + 0.2, 6, o.ry + 0.2).translate(0, 0.08, 0);
      kit.add('hyStone', e);
      break;
    }
    case 'carp':
      kit.begin(0, 0, 0, 0, cell);
      kit.blob('hyCarp', w(o.x, o.y, 0.08), 0.5, 0.08, [0, o.x, 0]);
      kit.blob('white', w(o.x + 0.6, o.y + 0.3, 0.08), 0.35, 0.07, [0, o.y, 0]);
      break;
    case 'shimenawa': {
      /* The sacred rope round the cedar, and its paper zigzags. */
      at(kit, o.x, o.y, o.h, 0, cell);
      kit.add('mxHay', new THREE.TorusGeometry(o.r, 0.09, 5, 20).rotateX(Math.PI / 2));
      for (let i = 0; i < 5; i += 1) {
        sincos((i / 5) * 2 * Math.PI, SC);
        kit.box('white', SC.c * (o.r + 0.05) - 0.06, -0.45, -SC.s * (o.r + 0.05) - 0.06, SC.c * (o.r + 0.05) + 0.06, -0.05, -SC.s * (o.r + 0.05) + 0.06);
      }
      break;
    }
    case 'disc':
      kit.begin(0, 0, 0, 0, cell);
      kit.cyl(o.m, w(o.x, o.y, 0), w(o.x, o.y, o.h), o.r, 24);
      break;
    case 'windsock':
      kit.begin(0, 0, 0, 0, cell);
      kit.cyl('flagMast', w(o.x, o.y, 0), w(o.x, o.y, 6), 0.05, 4);
      kit.cyl('mxOrange', w(o.x, o.y, 5.8), w(o.x + 1.0, o.y, 5.65), 0.3, 8, 0.25);
      kit.cyl('white', w(o.x + 1.0, o.y, 5.65), w(o.x + 1.8, o.y, 5.45), 0.25, 8, 0.18);
      kit.cyl('mxOrange', w(o.x + 1.8, o.y, 5.45), w(o.x + 2.5, o.y, 5.2), 0.18, 8, 0.12);
      break;
    case 'pole':
      kit.begin(0, 0, 0, 0, cell);
      kit.cyl('concreteMid', w(o.x, o.y, 0), w(o.x, o.y, o.h), 0.15, 6, 0.12);
      pbox(kit, 'metalDark', o.x - 0.05, o.y - 0.8, o.h - 0.75, o.x + 0.05, o.y + 0.8, o.h - 0.65);
      break;
    case 'wires': {
      if (low) {
        break;
      }
      const curve = wireCurve(o);
      kit.begin(0, 0, 0, 0, cell);
      kit.add('rope', new THREE.TubeGeometry(curve, 8, 0.025, 3, false));
      break;
    }
    default:
      break;
  }
}

/* The maples: the builder's broadleaf, its leaves in autumn. A kit that
 * hands every leaf the maple's colour for the green it was given, and is
 * the kit in every other way. */
function mapleKit(kit) {
  return new Proxy(kit, {
    get(t, prop, r) {
      if (prop === 'leaf') {
        return (mat, ...rest) => t.leaf(MAPLE[mat] ?? mat, ...rest);
      }
      return Reflect.get(t, prop, r);
    },
  });
}

/* The maples' solids, each tree's own layout set at its place. */
function mapleParts(maples) {
  const out = [];
  for (const el of maples) {
    const p = w(el.position.x, el.position.y, 0);
    for (const q of treeLayout(el)) {
      if (q.t === 'cap') {
        out.push({
          ...q,
          a: [q.a[0] + p[0], q.a[1], q.a[2] + p[2]],
          b: [q.b[0] + p[0], q.b[1], q.b[2] + p[2]],
        });
      } else if (q.t === 'box') {
        out.push({
          ...q,
          lo: [q.lo[0] + p[0], q.lo[1], q.lo[2] + p[2]],
          hi: [q.hi[0] + p[0], q.hi[1], q.hi[2] + p[2]],
        });
      }
    }
  }
  return out;
}

/*
 * THE VOLCANO on the northern horizon, the snow on its top cut ragged, in
 * the backdrop's group so it fades with the ridge rings as the camera
 * climbs (fadeBackdrop in ../built/index.js), unlit and out of the fog as
 * they are, between the near ring and the far one so the far ring passes
 * behind it. Two meshes, two draws, about four hundred triangles.
 */
function volcano(scene) {
  const backdrop = scene.getObjectByName('backdrop');
  if (!backdrop || backdrop.children.length < 2) {
    return null;
  }
  const rOf = (m) => {
    const a = m.geometry.attributes.position;
    return Math.sqrt(a.getX(0) * a.getX(0) + a.getZ(0) * a.getZ(0));
  };
  const dist = (rOf(backdrop.children[0]) + rOf(backdrop.children[1])) / 2;
  const H = 120;
  const R = dist * 0.75;
  const N = 48;
  /* A concave slope, steeper near the top, as a volcano's is. */
  const prof = [[1, 0], [0.8, 0.12], [0.58, 0.3], [0.38, 0.52], [0.22, 0.75], [0.12, 0.93], [0.09, 1]];
  const make = (from, ragged) => {
    const pos = [];
    const index = [];
    const rows = prof.length - from;
    for (let i = 0; i <= N; i += 1) {
      const a = (i / N) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      prof.slice(from).forEach(([r, h], k) => {
        let hh = h;
        let rr = r;
        if (ragged && k === 0) {
          hh = h - (i % 2 ? 0.1 : 0) - (i % 5 === 0 ? 0.08 : 0);
          rr = r + (i % 2 ? 0.07 : 0) + (i % 5 === 0 ? 0.05 : 0);
        }
        const g = ragged ? 1.004 : 1;
        pos.push(c * rr * R * g, hh * H * g - 6, s * rr * R * g);
      });
      if (i < N) {
        for (let k = 0; k + 1 < rows; k += 1) {
          const a0 = i * rows + k;
          const b0 = (i + 1) * rows + k;
          index.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(index);
    return g;
  };
  for (const [g, colour] of [[make(0, false), 0x8a9cc0], [make(3, true), 0xf6f4f0]]) {
    const mesh = new THREE.Mesh(g, flat({ color: colour, fog: false, side: THREE.DoubleSide, cache: false }));
    mesh.userData.base = mesh.material.color.clone();
    mesh.renderOrder = -9;
    mesh.frustumCulled = false;
    mesh.position.set(-dist * 0.18, 0, -dist);
    backdrop.add(mesh);
  }
  return { dist, H, R };
}

export async function buildMap(shell, onProgress, options) {
  const low = qualityFor(options && options.quality).id === 'low';
  const L = hayateLayout();
  const line = courseLine();
  const maples = hayateMaples();
  const parts = [...L.parts, ...mapleParts(maples)];
  const extra = {
    el: { id: 'hayate', type: 'hayate' },
    parts: low ? parts.filter((p) => !(p.fine && !p.solid)) : parts,
    draw: (kit) => {
      for (const o of L.ops) {
        drawOp(kit, o, low, line);
      }
      const mk = mapleKit(kit);
      for (const el of maples) {
        const p = w(el.position.x, el.position.y, 0);
        kit.begin(p[0], 0, p[2], 0, chunkOf(p[0], p[2]));
        mk.element(el);
      }
    },
    chunkOf: (x, z) => chunkOf(x, z),
    /* The pilot starts on the pit building's roof (./layout.js SPAWN). */
    padBase: PIT.top,
  };
  const doc = hayateDocument();
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots: L.markSpots,
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js), and `source` is the word
   * the board counts its partner signs under. */
  map.id = 'hayate';
  map.source = 'hayate';
  /* A race car's grip, not a family car's: the one number the document
   * cannot say. The same objects the drawing reads, before the shell
   * uploads them. */
  if (map.traffic) {
    for (const v of map.traffic.vehicles) {
      v.lateral = RACE_LATERAL;
    }
  }
  const props = map.scene.getObjectByName('props');
  const palette = props ? mergePalette(props) : { from: 0, to: 0 };
  const stats = map.stats;
  const mountain = volcano(map.scene);
  map.stats = () => ({ ...(stats ? stats() : {}), palette, volcano: mountain });
  /* The signs, one mesh on one picture. */
  const atlas = paintSigns(L.signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  map.scene.add(signMesh(THREE, L.signs, atlas, paintMaterial(THREE, tex)));
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
