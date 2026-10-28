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
