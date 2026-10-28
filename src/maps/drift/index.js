/*
 * index.js: Drift Matsuri, a map and a mini game. The owner's ask of 28
 * October 2026:
 *
 *   "design and build a mini game map where goal is to film drift races,
 *   go all out on the design, use as much existing assets as we can, but
 *   feel free to create new things as needed show me mock ups of the game
 *   before we go live. Research international drift racing, and the sakura
 *   festival japanse drift racing world to get the tracks and settings"
 *
 * THE PLACE is ./circuit.js (the course, the pits, the bank, the tower, the
 * festival, the torii and the barriers) and ./yard.js (the document: the
 * road, the drift cars, the parked cars and the trees), built by the built
 * map's pipeline as the house maps are, in the town's look at golden hour.
 * Everything it draws is the town's kit and its materials, with five
 * colours of its own (src/props/homes.js, `dr`).
 *
 * THE CARS are the built map's drift cars, unchanged: the physics module
 * drives and slides them, src/maps/built/cars.js draws them countersteering
 * with cel smoke off the rear tyres. Seven of them, in two tandem pairs and
 * a train of three.
 *
 * THE GAME is src/game/film.js: the pilot is the camera. Every take is a
 * minute from leaving the tower, scored on what the camera sees of the
 * cars, frame by frame, and cut to a card with a grade. src/main.js feeds
 * it (filmStep) and src/ui/filmhud.js shows it.
 *
 * FOR THE LATENCY RULE, measured and written in the PR: on every other map,
 * nothing (this file loads only when the map is chosen). On this map, the
 * place is drawn in one chunk of its own in the town's batches, so each
 * colour is one draw call, and the trees and cars are the built map's. Per
 * frame on the CPU: the judge, every 8 ms of flight, seven cars through the
 * lens, a few microseconds; nothing allocated.
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

import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import { Film } from '../../game/film.js';
import {
  circuitLayout, w, PITS, FAIR, TOWER,
} from './circuit.js';
import { driftDocument, groupIds, GROUPS } from './yard.js';

/* A plan heading, for a block turned onto a run: render only. */
function heading(dx, dy) {
  return Math.atan2(dy, dx);
}

/* The barriers, over their capsules: red and white zone blocks, plain
 * concrete, or stacks of tyres. */
function drawWalls(kit, walls) {
  for (const s of walls) {
    const mx = (s.a[0] + s.b[0]) / 2;
    const my = (s.a[1] + s.b[1]) / 2;
    const dx = s.b[0] - s.a[0];
    const dy = s.b[1] - s.a[1];
    const len = Math.sqrt(dx * dx + dy * dy) + 0.06;
    const p = w(mx, my);
    kit.begin(p[0], 0, p[2], heading(dx, dy), 'extra');
    if (s.look === 'tyres') {
      const n = Math.max(1, Math.round(len / 0.78));
      for (let i = 0; i < n; i += 1) {
        const x = -len / 2 + (i + 0.5) * (len / n);
        kit.cyl('drTyre', [x, 0, 0], [x, 1.1, 0], 0.38, 8);
        if (i % 3 === 0) {
          kit.cyl('white', [x, 0.48, 0], [x, 0.62, 0], 0.395, 8);
        }
      }
    } else if (s.look === 'zone') {
      kit.box(s.i % 2 ? 'white' : 'drNoboriRed', -len / 2, 0, -0.4, len / 2, 1.05, 0.4);
    } else {
      kit.box('concrete', -len / 2, 0, -0.4, len / 2, 1.0, 0.4);
      kit.box('white', -len / 2, 0.82, -0.42, len / 2, 0.92, 0.42);
    }
  }
}

/* The paving that is not road: the pit lane in front of the garages, the
 * festival's walk and the yard under the tower. Paint a few centimetres
 * over the grass, not solid. */
function drawAprons(kit) {
  kit.begin(0, 0, 0, 0, 'extra');
  const slab = (m, x0, y0, x1, y1) => {
    const a = w(x0, y0, 0.0);
    const b = w(x1, y1, 0.035);
    kit.box(m, a[0], a[1], a[2], b[0], b[1], b[2]);
  };
  slab('concreteMid', PITS.x0 - 2, PITS.y1, PITS.x1 + 2, 41);
  slab('concrete', FAIR.x0 - 4, FAIR.y - FAIR.walk / 2 - 4, FAIR.x1 + 4, FAIR.y + FAIR.walk / 2 + 4);
  slab('concrete', TOWER.x - 6, TOWER.y - 6, TOWER.x + 6, TOWER.y + 6);
}

function drawKerbs(kit, kerbs) {
  for (const k of kerbs) {
    const p = w(k.x, k.y);
    kit.begin(p[0], 0, p[2], heading(k.tx, k.ty), 'extra');
    kit.box(k.red ? 'drNoboriRed' : 'white', -k.len / 2, 0.01, -0.45, k.len / 2, 0.07, 0.45);
  }
}

/* A lantern hung at a world point: the red paper body and its black rims. */
function lantern(kit, c) {
  kit.cyl('lampRed', [c[0], c[1] - 0.2, c[2]], [c[0], c[1] + 0.2, c[2]], 0.17, 6);
  kit.cyl('drToriiBlack', [c[0], c[1] + 0.2, c[2]], [c[0], c[1] + 0.25, c[2]], 0.11, 6);
  kit.cyl('drToriiBlack', [c[0], c[1] - 0.25, c[2]], [c[0], c[1] - 0.2, c[2]], 0.11, 6);
}

/* A string of lanterns from a to b, plan points with heights, hanging in a
 * sag: the wire in six straight runs, a lantern every `every` metres. */
function lanternString(kit, d) {
  const A = w(d.a[0], d.a[1], d.a[2]);
  const B = w(d.b[0], d.b[1], d.b[2]);
  const at = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - d.sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t];
  const N = 6;
  for (let i = 0; i < N; i += 1) {
    kit.cyl('rope', at(i / N), at((i + 1) / N), 0.012, 4);
  }
  const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
  const n = Math.max(1, Math.floor(len / d.every));
  for (let i = 1; i < n; i += 1) {
    const p = at(i / n);
    lantern(kit, [p[0], p[1] - 0.35, p[2]]);
  }
}

/* The torii's beams, turned square to the road: the nuki, the red under
 * layer and the black cap of the kasagi with its ends swept up, the plaque
 * and the black bands at the pillars' feet and heads. */
function drawTorii(kit, d) {
  const c = w(d.c[0], d.c[1]);
  kit.begin(c[0], 0, c[2], heading(d.n[0], d.n[1]), 'extra');
  const S = d.span;
  const O = d.over;
  kit.box('drToriiRed', -S - 1.3, 8.4, -0.32, S + 1.3, 9.0, 0.32);
  kit.box('drToriiRed', -S - O, 10.2, -0.5, S + O, 10.7, 0.5);
  kit.box('drToriiBlack', -S - O + 1.2, 10.7, -0.7, S + O - 1.2, 11.2, 0.7);
  for (const s of [-1, 1]) {
    /* The swept ends: two blocks stepping up and out. */
    kit.box('drToriiBlack', s * (S + O - 1.4), 10.75, -0.7, s * (S + O - 0.2), 11.4, 0.7);
    kit.box('drToriiBlack', s * (S + O - 0.4), 10.9, -0.72, s * (S + O + 0.5), 11.7, 0.72);
    kit.cyl('drToriiBlack', [s * S, 0, 0], [s * S, 0.7, 0], 0.72, 12);
    kit.cyl('drToriiBlack', [s * S, 10.0, 0], [s * S, 10.25, 0], 0.66, 12);
  }
  kit.box('drToriiRed', -0.35, 9.0, -0.3, 0.35, 10.2, 0.3);
  kit.box('drToriiBlack', -1.0, 9.1, -0.36, 1.0, 10.1, 0.36);
  kit.box('craneYellow', -0.8, 9.2, -0.38, 0.8, 10.0, 0.38);
}

/* Draw `fn` in a frame stood at plan (x, y) and turned to plan heading
 * `yaw`, then back to the world's frame. */
function turned(kit, x, y, yaw, fn) {
  const p = w(x, y);
  kit.begin(p[0], 0, p[2], yaw, 'extra');
  fn();
  kit.begin(0, 0, 0, 0, 'extra');
}

/* A thin run between two plan points at height h. */
function run(kit, m, a, b, h, r, seg = 4) {
  kit.cyl(m, w(a[0], a[1], h), w(b[0], b[1], h), r, seg);
}

/*
 * THE FURNITURE (circuit.js, furniture()): what is drawn over the solids,
 * or drawn only, for each piece. Everything in a colour the map already
 * draws in, so none of it is a new batch.
 */
function drawFurniture(kit, d) {
  switch (d.t) {
    case 'flood':
      /* The lamp bank on the mast's head, turned on the infield, lamps on
       * the face toward it and a cage over the top. */
      turned(kit, d.x, d.y, d.yaw, () => {
        kit.box('drToriiBlack', -0.3, d.h - 0.1, -1.7, 0.2, d.h + 1.7, 1.7);
        for (let r = 0; r < 2; r += 1) {
          for (let c = 0; c < 4; c += 1) {
            const z = -1.35 + c * 0.9;
            const y = d.h + 0.2 + r * 0.8;
            kit.box('white', 0.2, y, z - 0.33, 0.34, y + 0.6, z + 0.33);
          }
        }
        kit.box('metal', -0.25, d.h + 1.7, -1.6, 0.15, d.h + 1.8, 1.6);
      });
      break;
    case 'fence': {
      const h0 = d.h0 ?? 0;
      for (const t of [0.3, 0.55, 0.8]) {
        run(kit, 'rope', d.a, d.b, h0 + (d.h - h0) * t, 0.012);
      }
      run(kit, 'metal', d.a, d.b, d.h - 0.03, 0.035);
      break;
    }
    case 'panel': {
      const dx = d.b[0] - d.a[0];
      const dy = d.b[1] - d.a[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      turned(kit, (d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2, heading(dx, dy), () => {
        kit.box(d.m, -len / 2 + 0.1, d.h0, -0.03, len / 2 - 0.1, d.h1, 0.03);
        kit.box(d.m === 'white' ? 'drNoboriRed' : 'white', -len / 2 + 0.1, d.h1 - 0.22, -0.035, len / 2 - 0.1, d.h1 - 0.12, 0.035);
      });
      break;
    }
    case 'lattice': {
      /* Zig zag bracing between a leg's two tubes. */
      for (let h = 0.3, i = 0; h < d.h - 0.8; h += 0.8, i += 1) {
        const s = i % 2 ? 1 : -1;
        kit.cyl('metal', w(d.x - 0.5 * s, d.y, h), w(d.x + 0.5 * s, d.y, h + 0.8), 0.03, 4);
      }
      break;
    }
    case 'gantry': {
      /* The start lights in the middle of the beam, out both faces; a
       * checkered banner hung under it; a white band along its top. */
      const ym = (d.y0 + d.y1) / 2;
      for (let i = -2; i <= 2; i += 1) {
        const a = w(d.x - 0.78, ym + i * 1.1 - 0.35, d.h + 0.25);
        const b = w(d.x + 0.78, ym + i * 1.1 + 0.35, d.h + 0.95);
        kit.box('lampRed', a[0], a[1], a[2], b[0], b[1], b[2]);
      }
      for (let y = d.y0 + 1, i = 0; y < d.y1 - 1; y += 0.8, i += 1) {
        for (let r = 0; r < 2; r += 1) {
          const a = w(d.x - 0.04, y, d.h - 0.4 - r * 0.4);
          const b = w(d.x + 0.04, y + 0.8, d.h - r * 0.4 - 0.02);
          kit.box((i + r) % 2 ? 'white' : 'drToriiBlack', a[0], a[1], a[2], b[0], b[1], b[2]);
        }
      }
      const a = w(d.x - 0.5, d.y0, d.h + 1.2);
      const b = w(d.x + 0.5, d.y1, d.h + 1.45);
      kit.box('white', a[0], a[1], a[2], b[0], b[1], b[2]);
      break;
    }
    case 'screen': {
      const a = w(d.x - d.w / 2, d.y - 0.3, d.h0);
      const b = w(d.x + d.w / 2, d.y + 0.3, d.h1);
      kit.box('drToriiBlack', a[0], a[1], a[2], b[0], b[1], b[2]);
      const g0 = w(d.x - d.w / 2 + 0.35, d.y - 0.34, d.h0 + 0.35);
      const g1 = w(d.x + d.w / 2 - 0.35, d.y + 0.34, d.h1 - 0.35);
      kit.box('glassBlue', g0[0], g0[1], g0[2], g1[0], g1[1], g1[2]);
      /* The picture on it, out of both faces: the live feed of a car
       * sliding, its smoke behind it, on the road, and a caption bar. */
      const pic = (m, x0, h0, x1, h1, t) => {
        const a = w(d.x + x0, d.y - t, d.h0 + h0);
        const b = w(d.x + x1, d.y + t, d.h0 + h1);
        kit.box(m, a[0], a[1], a[2], b[0], b[1], b[2]);
      };
      pic('concreteMid', -d.w / 2 + 0.35, 0.35, d.w / 2 - 0.35, 2.3, 0.36);
      pic('white', -d.w / 2 + 0.6, 0.55, d.w / 2 - 0.6, 1.05, 0.37);
      pic('drNoboriRed', -0.4, 2.1, 2.8, 3.0, 0.38);
      pic('drToriiBlack', 0.2, 3.0, 2.0, 3.6, 0.38);
      pic('drToriiBlack', -0.1, 1.9, 0.6, 2.4, 0.39);
      pic('drToriiBlack', 2.0, 1.9, 2.7, 2.4, 0.39);
      for (let i = 0; i < 4; i += 1) {
        const c = w(d.x - 1.1 - i * 0.95, d.y, d.h0 + 2.6 + (i % 2) * 0.35);
        kit.blob('white', c, 0.55 + i * 0.08, 0.42, [0, i, 0]);
      }
      break;
    }
    case 'hutFace':
      turned(kit, d.x, d.y, d.yaw, () => {
        kit.box('glassBlue', 0.9, 1.15, -0.6, 0.94, 1.85, 0.6);
      });
      break;
    case 'flag': {
      const p = w(d.x, d.y);
      kit.box(d.m, p[0] + 0.05, d.h - 0.6, p[2] - 0.02, p[0] + 0.95, d.h, p[2] + 0.02);
      break;
    }
    case 'scaffold':
      turned(kit, d.x, d.y, d.yaw, () => {
        const h = d.h;
        /* The rail round the deck. */
        for (const [a, b] of [[[-1.3, -1.3], [1.3, -1.3]], [[1.3, -1.3], [1.3, 1.3]], [[1.3, 1.3], [-1.3, 1.3]]]) {
          kit.cyl('metal', [a[0], h + 1.0, a[1]], [b[0], h + 1.0, b[1]], 0.035, 4);
        }
        /* The tripod and the camera on it, looking out along +x. */
        for (const [x, z] of [[0.75, 0], [0.15, 0.35], [0.15, -0.35]]) {
          kit.cyl('metal', [x, h, z], [0.35, h + 1.25, 0], 0.025, 4);
        }
        kit.box('drToriiBlack', 0.05, h + 1.25, -0.15, 0.6, h + 1.55, 0.15);
        kit.cyl('drToriiBlack', [0.6, h + 1.4, 0], [0.95, h + 1.4, 0], 0.09, 8);
        kit.box('white', 0.1, h + 1.55, -0.1, 0.35, h + 1.65, 0.1);
      });
      break;
    case 'speaker': {
      const p = w(d.x, d.y);
      for (const s of [-1, 1]) {
        kit.cyl('drToriiBlack', [p[0], d.h, p[2]], [p[0], d.h - 0.12, p[2] + s * 0.65], 0.09, 8, 0.28);
      }
      kit.box('metal', p[0] - 0.12, d.h - 0.15, p[2] - 0.12, p[0] + 0.12, d.h + 0.15, p[2] + 0.12);
      break;
    }
    case 'tools': {
      /* A pegboard on the back wall over the bench, with a few tools on
       * it and a red box and a yellow drill on the bench. */
      const a = w(d.x - d.w / 2 + 0.2, d.y - 0.03, d.h + 0.4);
      const b = w(d.x + d.w / 2 - 0.2, d.y + 0.03, d.h + 1.5);
      kit.box('metal', a[0], a[1], a[2], b[0], b[1], b[2]);
      for (let i = 0; i < 5; i += 1) {
        const x = d.x - d.w / 2 + 0.5 + i * (d.w - 1) / 4;
        const t0 = w(x - 0.05, d.y + 0.03, d.h + 0.6 + (i % 2) * 0.3);
        const t1 = w(x + 0.05, d.y + 0.06, d.h + 1.1 + (i % 2) * 0.3);
        kit.box(i % 2 ? 'drNoboriRed' : 'drToriiBlack', t0[0], t0[1], t0[2], t1[0], t1[1], t1[2]);
      }
      const r0 = w(d.x - 0.9, d.y + 0.15, d.h);
      const r1 = w(d.x - 0.3, d.y + 0.5, d.h + 0.25);
      kit.box('drNoboriRed', r0[0], r0[1], r0[2], r1[0], r1[1], r1[2]);
      const y0 = w(d.x + 0.4, d.y + 0.2, d.h);
      const y1 = w(d.x + 0.6, d.y + 0.45, d.h + 0.28);
      kit.box('craneYellow', y0[0], y0[1], y0[2], y1[0], y1[1], y1[2]);
      break;
    }
    case 'extinguisher': {
      const p = w(d.x, d.y);
      kit.cyl('lampRed', [p[0], 0, p[2]], [p[0], 0.62, p[2]], 0.1, 6);
      kit.cyl('drToriiBlack', [p[0], 0.62, p[2]], [p[0], 0.72, p[2]], 0.05, 4);
      break;
    }
    case 'chest': {
      /* Drawer lines and a handle on the face toward the lane. */
      for (let i = 0; i < 4; i += 1) {
        const a = w(d.x - d.w / 2 + 0.06, d.y, 0.2 + i * 0.22);
        const b = w(d.x + d.w / 2 - 0.06, d.y + 0.03, 0.23 + i * 0.22);
        kit.box('white', a[0], a[1], a[2], b[0], b[1], b[2]);
      }
      const p = w(d.x, d.y + 0.1);
      kit.cyl('metal', [p[0] - d.w / 2 + 0.1, d.h + 0.12, p[2]], [p[0] + d.w / 2 - 0.1, d.h + 0.12, p[2]], 0.025, 4);
      break;
    }
    case 'tyres': {
      const p = w(d.x, d.y);
      for (let i = 0; i < d.n; i += 1) {
        kit.cyl('drTyre', [p[0], i * 0.26, p[2]], [p[0], i * 0.26 + 0.24, p[2]], 0.34, 8);
      }
      kit.cyl('metal', [p[0], d.n * 0.26 - 0.03, p[2]], [p[0], d.n * 0.26, p[2]], 0.19, 6);
      break;
    }
    case 'jack': {
      const p = w(d.x, d.y);
      kit.box('craneYellow', p[0] - 0.15, 0, p[2] - 0.35, p[0] + 0.15, 0.16, p[2] + 0.35);
      kit.cyl('metal', [p[0], 0.12, p[2] + 0.3], [p[0], 0.75, p[2] + 1.1], 0.025, 4);
      break;
    }
    case 'tableLegs': {
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const p = w(d.x + sx * (d.w / 2 - 0.1), d.y + sy * (d.d / 2 - 0.1));
        kit.cyl('metal', [p[0], 0, p[2]], [p[0], d.h, p[2]], 0.025, 4);
      }
      break;
    }
    case 'truck': {
      /* Wheels both sides, the windscreen on the cab's front and a stripe
       * down each side of the box. */
      for (const x of [d.x + 1.4, d.x + 2.5, d.x + 8.4]) {
        const a = w(x, d.y - 1.3, 0.5);
        const b = w(x, d.y + 1.3, 0.5);
        kit.cyl('drTyre', a, b, 0.5, 10);
      }
      const g0 = w(d.x + 9.6, d.y - 1.0, 1.7);
      const g1 = w(d.x + 9.64, d.y + 1.0, 2.7);
      kit.box('glassBlue', g0[0], g0[1], g0[2], g1[0], g1[1], g1[2]);
      const stripe = d.m === 'white' ? 'drNoboriRed' : 'white';
      for (const s of [-1, 1]) {
        const a = w(d.x + 0.3, d.y + s * 1.25, 2.1);
        const b = w(d.x + 7.2, d.y + s * 1.29, 2.45);
        kit.box(stripe, a[0], a[1], a[2], b[0], b[1], b[2]);
      }
      break;
    }
    case 'door': {
      const a = w(d.x - 0.45, d.y, 0.1);
      const b = w(d.x + 0.45, d.y + 0.03, 2.05);
      kit.box('white', a[0], a[1], a[2], b[0], b[1], b[2]);
      const l0 = w(d.x + 0.25, d.y + 0.03, 1.2);
      const l1 = w(d.x + 0.35, d.y + 0.05, 1.3);
      kit.box('lampRed', l0[0], l0[1], l0[2], l1[0], l1[1], l1[2]);
      break;
    }
    case 'vend': {
      const a = w(d.x - 0.04, d.y - 0.38, 0.95);
      const b = w(d.x, d.y + 0.38, 1.7);
      kit.box('glassBlue', a[0], a[1], a[2], b[0], b[1], b[2]);
      const s0 = w(d.x - 0.04, d.y - 0.3, 0.25);
      const s1 = w(d.x, d.y + 0.3, 0.45);
      kit.box('drToriiBlack', s0[0], s0[1], s0[2], s1[0], s1[1], s1[2]);
      break;
    }
    case 'bench': {
      const p = w(d.x, d.y);
      for (const s of [-0.75, 0.75]) {
        kit.box('metal', p[0] + s - 0.04, 0, p[2] - 0.2, p[0] + s + 0.04, 0.42, p[2] + 0.2);
      }
      const a = w(d.x - 0.9, d.y + 0.2, 0.55);
      const b = w(d.x + 0.9, d.y + 0.26, 0.9);
      kit.box('plywood', a[0], a[1], a[2], b[0], b[1], b[2]);
      break;
    }
    case 'binLid': {
      const p = w(d.x, d.y);
      kit.cyl('drToriiBlack', [p[0], 0.9, p[2]], [p[0], 0.96, p[2]], 0.31, 8);
      break;
    }
    case 'cone': {
      const p = w(d.x, d.y);
      kit.cyl('drNoboriRed', [p[0], 0, p[2]], [p[0], 0.5, p[2]], 0.16, 6, 0.03);
      kit.cyl('white', [p[0], 0.22, p[2]], [p[0], 0.3, p[2]], 0.115, 6, 0.1);
      kit.box('drNoboriRed', p[0] - 0.2, 0, p[2] - 0.2, p[0] + 0.2, 0.03, p[2] + 0.2);
      break;
    }
    case 'blanket':
      turned(kit, d.x, d.y, d.yaw, () => {
        kit.box(d.m, -1.1, 0.0, -0.8, 1.1, 0.05, 0.8);
        for (const z of [-0.4, 0.4]) {
          kit.box('white', -1.1, 0.05, z - 0.08, 1.1, 0.06, z + 0.08);
        }
      });
      break;
    case 'coolbox': {
      const p = w(d.x, d.y);
      kit.box('white', p[0] - 0.3, 0, p[2] - 0.2, p[0] + 0.3, 0.35, p[2] + 0.2);
      kit.box('wallBlue', p[0] - 0.32, 0.35, p[2] - 0.22, p[0] + 0.32, 0.42, p[2] + 0.22);
      break;
    }
    default:
      break;
  }
}

function drawDecor(kit, decor) {
  kit.begin(0, 0, 0, 0, 'extra');
  for (const d of decor) {
    switch (d.t) {
      case 'fan': {
        const p = w(d.x, d.y, d.h);
        const top = d.h + d.tall;
        /* A body narrowing to the shoulders, a head, and now and then an
         * arm up, cheering. */
        kit.cyl(d.shirt, [p[0], d.h, p[2]], [p[0], top - 0.3, p[2]], 0.24, 6, 0.17);
        kit.blob('drSkin', [p[0], top - 0.12, p[2]], 0.17, 0.18, [0, d.x, 0]);
        if (d.cheer) {
          kit.cyl('drSkin', [p[0] + 0.15, top - 0.38, p[2]], [p[0] + 0.24, top + 0.22, p[2] + 0.05], 0.05, 4);
        }
        break;
      }
      case 'string':
        lanternString(kit, d);
        break;
      case 'lantern':
        lantern(kit, w(d.x, d.y, d.h));
        break;
      case 'cloth': {
        const p = w(d.x, d.y);
        kit.box(d.m, p[0] + 0.06, d.h0, p[2] - 0.02, p[0] + 0.7, d.h1, p[2] + 0.02);
        kit.box('white', p[0] + 0.06, d.h1 - 0.35, p[2] - 0.025, p[0] + 0.7, d.h1 - 0.2, p[2] + 0.025);
        kit.cyl('flagMast', [p[0], d.h1 + 0.05, p[2]], [p[0] + 0.75, d.h1 + 0.05, p[2]], 0.025, 4);
        break;
      }
      case 'shutter': {
        const p = w(d.x, d.y);
        kit.box('shutterLight', p[0] - d.wd / 2, d.h0, p[2] - 0.03, p[0] + d.wd / 2, d.h1, p[2]);
        break;
      }
      case 'awning': {
        const n = Math.max(2, Math.round((d.x1 - d.x0) / 0.55));
        const step = (d.x1 - d.x0) / n;
        for (let i = 0; i < n; i += 1) {
          const a = w(d.x0 + i * step, d.y0, d.h);
          const b = w(d.x0 + (i + 1) * step, d.y1, d.h + 0.22);
          kit.box(i % 2 ? 'white' : d.m, a[0], a[1], a[2], b[0], b[1], b[2]);
        }
        break;
      }
      case 'brace': {
        const h = d.half;
        for (const [x0, y0, x1, y1] of [[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [-h, h, -h, -h]]) {
          kit.cyl('metal', w(d.x + x0, d.y + y0, d.h0), w(d.x + x1, d.y + y1, d.h1), 0.05, 4);
          kit.cyl('metal', w(d.x + x1, d.y + y1, d.h0), w(d.x + x0, d.y + y0, d.h1), 0.05, 4);
        }
        break;
      }
      case 'ladder':
        kit.ladder('metal', w(...d.a), w(...d.b), 0.5);
        break;
      case 'cpBoard': {
        const p = w(d.x, d.y);
        kit.box('drNoboriRed', p[0] - 0.5, 2.2, p[2] - 0.05, p[0] + 0.5, 3.2, p[2] + 0.05);
        kit.box('white', p[0] - 0.5, 2.55, p[2] - 0.06, p[0] + 0.5, 2.85, p[2] + 0.06);
        break;
      }
      case 'torii':
        drawTorii(kit, d);
        kit.begin(0, 0, 0, 0, 'extra');
        break;
      default:
        drawFurniture(kit, d);
        break;
    }
  }
}

export async function buildMap(shell, onProgress, options) {
  const L = circuitLayout();
  const doc = driftDocument();
  const extra = {
    el: { id: 'drift', type: 'drift' },
    parts: L.parts,
    draw: (kit) => {
      drawAprons(kit);
      drawWalls(kit, L.walls);
      drawKerbs(kit, L.kerbs);
      drawDecor(kit, L.decor);
    },
  };
  const map = await buildBuilt(shell, onProgress, { ...(options || {}), document: doc, extra });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js). */
  map.id = 'drift';
  map.source = 'drift';
  /* THE GAME, for the shell (filmStep in src/main.js): the judge, and
   * which mover slot is which drift car in which group, from the same
   * traffic the plant was handed. */
  const film = new Film();
  const bySlot = new Map((map.traffic ? map.traffic.vehicles : []).map((v) => [v.element, v]));
  const groups = groupIds(doc);
  const cars = [];
  groups.forEach((g, gi) => {
    for (const id of g.ids) {
      const v = bySlot.get(id);
      if (v) {
        cars.push({ slot: v.slot, group: gi, height: v.height, label: v.style.toUpperCase() });
      }
    }
  });
  film.setCars(cars);
  film.setGroups(groups.map((g, gi) => ({ name: g.name, size: GROUPS[gi].cars.length })));
  film.setZones(L.zones);
  map.filmGame = { film, zones: L.zones };
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
