/*
 * index.js: Ekimae Drift, a map and a mini game. The owner's ask of 31
 * October 2026: a city map with drift cars to chase, that looks and feels
 * like a manga the way the town does.
 *
 * THE PLACE is ./plan.js (the expressway, the viaduct and the station, the
 * car park, the petrol station, the police box, the footbridge, the shrine,
 * the rotary, the arcade and the barriers) and ./yard.js (the document: the
 * course as a road, the drift cars on it, the town's own buildings along
 * every street, the poles and their wires, the trees and the parked cars),
 * built by the built map's pipeline as Drift Matsuri is, in the town's
 * look at golden hour, ink and all. Every colour it draws is one the kit
 * already has; the signs are one picture (./signs.js).
 *
 * THE CARS are the built map's drift cars, unchanged: three tandem pairs.
 * THE GAME is Drift Matsuri's (src/game/film.js): the pilot is the camera.
 *
 * FOR THE LATENCY RULE: on every other map, nothing (this file loads only
 * when the map is chosen). On this map the city is six chunks, and each
 * chunk's plain colours are folded into one batch by Sunnyfield's palette
 * merge (../sunny/palette.js), so a view of the whole city is a few dozen
 * draw calls before the cars. On Low what the plan marks `fine` is not
 * drawn: the crowd, the window frames, the rails, the lanterns' strings.
 * Nothing fine is solid, so the flight is the same on every preset. Per
 * frame on the CPU: the judge, as on Drift Matsuri, and nothing else.
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
import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import { qualityFor } from '../../render/quality.js';
import { paintMaterial } from '../../art/stf.js';
import { Film } from '../../game/film.js';
import { mergePalette } from '../sunny/palette.js';
import { W, D, w, chunkOf } from './frame.js';
import { ekimaeLayout, ekimaeMarkSpots, CP } from './plan.js';
import { ekimaeDocument, groupIds, GROUPS } from './yard.js';
import { paintSigns, signMesh } from './signs.js';

/* A plan heading, for a block turned onto a run: render only. */
function heading(dx, dy) {
  return Math.atan2(dy, dx);
}

/* Start drawing in the world frame, in the chunk a plan point is in. */
function at(kit, x, y) {
  const p = w(x, y);
  kit.begin(0, 0, 0, 0, chunkOf(p[0], p[2]));
}

/* The barriers over their capsules: concrete blocks with a white top
 * band, or red and white ones on the outside of a corner. */
function drawWalls(kit, walls, low) {
  for (const s of walls) {
    const mx = (s.a[0] + s.b[0]) / 2;
    const my = (s.a[1] + s.b[1]) / 2;
    const dx = s.b[0] - s.a[0];
    const dy = s.b[1] - s.a[1];
    const len = Math.sqrt(dx * dx + dy * dy) + 0.04;
    const p = w(mx, my);
    kit.begin(p[0], 0, p[2], heading(dx, dy), chunkOf(p[0], p[2]));
    if (s.look === 'zone') {
      kit.box(s.i % 2 ? 'white' : 'drNoboriRed', -len / 2, 0, -0.42, len / 2, 0.92, 0.42);
    } else {
      /* A jersey block: a wide foot and a narrow top. */
      kit.box('concrete', -len / 2, 0, -0.42, len / 2, 0.3, 0.42);
      kit.box('concrete', -len / 2, 0.3, -0.26, len / 2, 0.92, 0.26);
      if (!low) {
        kit.box('white', -len / 2, 0.8, -0.27, len / 2, 0.9, 0.27);
      }
    }
  }
}

function lantern(kit, c) {
  kit.cyl('lampRed', [c[0], c[1] - 0.22, c[2]], [c[0], c[1] + 0.22, c[2]], 0.18, 6);
  kit.cyl('drToriiBlack', [c[0], c[1] + 0.22, c[2]], [c[0], c[1] + 0.27, c[2]], 0.12, 6);
  kit.cyl('drToriiBlack', [c[0], c[1] - 0.27, c[2]], [c[0], c[1] - 0.22, c[2]], 0.12, 6);
}

function lanternString(kit, d) {
  const A = w(d.a[0], d.a[1], d.a[2]);
  const B = w(d.b[0], d.b[1], d.b[2]);
  const pt = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - d.sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t];
  const N = 6;
  for (let i = 0; i < N; i += 1) {
    kit.cyl('rope', pt(i / N), pt((i + 1) / N), 0.012, 4);
  }
  const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
  const n = Math.max(1, Math.floor(len / d.every));
  for (let i = 1; i < n; i += 1) {
    const p = pt(i / n);
    lantern(kit, [p[0], p[1] - 0.35, p[2]]);
  }
}

/* A shape in the plan's x and h, extruded along y from y0 to y1. */
function extrudeY(kit, m, profile, y0, y1) {
  kit.extrude(m, profile.map(([a, h]) => [a - W / 2, h]), D / 2 - y1, D / 2 - y0);
}

/* A roof or a lid: a profile in the plan's y and h, extruded along x. */
function prismX(kit, d) {
  const lo = Math.min(...d.profile.map(([a]) => a));
  const hi = Math.max(...d.profile.map(([a]) => a));
  const p = w((d.e0 + d.e1) / 2, (lo + hi) / 2);
  kit.begin(0, 0, 0, Math.PI / 2, chunkOf(p[0], p[2]));
  kit.extrude(d.m, d.profile.map(([a, h]) => [a - D / 2, h]), d.e0 - W / 2, d.e1 - W / 2);
}

function drawDecor(kit, decor, low) {
  for (const d of decor) {
    if (low && d.fine) {
      continue;
    }
    switch (d.t) {
      case 'fan': {
        at(kit, d.x, d.y);
        const p = w(d.x, d.y, d.h);
        const top = d.h + d.tall;
        kit.cyl(d.shirt, [p[0], d.h, p[2]], [p[0], top - 0.3, p[2]], 0.24, 6, 0.17);
        kit.blob('drSkin', [p[0], top - 0.12, p[2]], 0.17, 0.18, [0, d.x, 0]);
        if (d.cheer) {
          kit.cyl('drSkin', [p[0] + 0.15, top - 0.38, p[2]], [p[0] + 0.24, top + 0.22, p[2] + 0.05], 0.05, 4);
        }
        break;
      }
      case 'fence': {
        at(kit, d.a[0], d.a[1]);
        for (const t of [0.3, 0.55, 0.8]) {
          kit.cyl('rope', w(d.a[0], d.a[1], d.h * t), w(d.b[0], d.b[1], d.h * t), 0.012, 4);
        }
        kit.cyl('metal', w(d.a[0], d.a[1], d.h - 0.03), w(d.b[0], d.b[1], d.h - 0.03), 0.035, 4);
        break;
      }
      case 'lantern':
        at(kit, d.x, d.y);
        lantern(kit, w(d.x, d.y, d.h));
        break;
      case 'string':
        at(kit, d.a[0], d.a[1]);
        lanternString(kit, d);
        break;
      case 'cloth': {
        at(kit, d.x, d.y);
        const p = w(d.x, d.y);
        kit.box(d.m, p[0] - 0.02, d.h0, p[2] - 0.35, p[0] + 0.02, d.h1, p[2] + 0.35);
        kit.box('white', p[0] - 0.025, d.h1 - 0.35, p[2] - 0.35, p[0] + 0.025, d.h1 - 0.2, p[2] + 0.35);
        break;
      }
      case 'cyl':
        at(kit, d.a[0], d.a[1]);
        kit.cyl(d.m, w(...d.a), w(...d.b), d.r, d.seg ?? 6);
        break;
      case 'span':
        at(kit, (d.a[0] + d.b[0]) / 2, d.a[1]);
        kit.cyl(d.m, w(...d.a), w(...d.b), d.r, 3);
        break;
      case 'ball':
        at(kit, d.c[0], d.c[1]);
        kit.ball(d.m, w(...d.c), d.r);
        break;
      case 'disc': {
        at(kit, d.x, d.y);
        const p = w(d.x, d.y);
        kit.cyl(d.m, [p[0], d.h0, p[2]], [p[0], d.h1, p[2]], d.r, d.seg ?? 16);
        break;
      }
      case 'prism':
        prismX(kit, d);
        break;
      case 'arch': {
        /* The curve of a brick arch: the two haunches under the lintel,
         * so the bay's opening reads round and not square. */
        at(kit, (d.x0 + d.x1) / 2, d.y0);
        const span = d.x1 - d.x0;
        const rise = Math.min(1.6, span * 0.2);
        const curve = [];
        for (let i = 0; i <= 8; i += 1) {
          const t = i / 8;
          const a = t * Math.PI;
          curve.push([d.x0 + span * (1 - Math.cos(a)) / 2, d.h0 - rise + rise * Math.sin(a)]);
        }
        const left = [[d.x0, d.h0], ...curve.slice(0, 5)];
        const right = [...curve.slice(4), [d.x1, d.h0]];
        extrudeY(kit, 'brick', [...left, [curve[4][0], d.h0]], d.y0 - 0.02, d.y1 + 0.02);
        extrudeY(kit, 'brick', [[curve[4][0], d.h0], ...right], d.y0 - 0.02, d.y1 + 0.02);
        break;
      }
      case 'arc': {
        /* A steel arch over the arcade's lane, in segments. */
        at(kit, d.x, d.y0);
        const n = 6;
        let prev = null;
        for (let i = 0; i <= n; i += 1) {
          const t = i / n;
          const q = w(d.x, d.y0 + (d.y1 - d.y0) * t, d.h + d.rise * Math.sin(t * Math.PI));
          if (prev) {
            kit.cyl(d.m, prev, q, 0.08, 4);
          }
          prev = q;
        }
        break;
      }
      case 'tanuki': {
        /* A bronze tanuki: belly, head, straw hat, the bottle he carries. */
        at(kit, d.x, d.y);
        const p = w(d.x, d.y, d.h);
        kit.blob('rustDeep', [p[0], d.h + 0.45, p[2]], 0.42, 0.48, [0, 1, 0]);
        kit.blob('rustDeep', [p[0], d.h + 1.08, p[2]], 0.3, 0.27, [0, 2, 0]);
        kit.cyl('rustDeep', [p[0], d.h + 1.28, p[2]], [p[0], d.h + 1.34, p[2]], 0.42, 10);
        kit.cyl('rustDeep', [p[0], d.h + 1.34, p[2]], [p[0], d.h + 1.52, p[2]], 0.2, 8, 0.08);
        kit.cyl('rustDeep', [p[0] + 0.42, d.h + 0.3, p[2] + 0.1], [p[0] + 0.42, d.h + 0.7, p[2] + 0.1], 0.1, 6);
        break;
      }
      case 'bike': {
        at(kit, d.x, d.y);
        for (const dx of [-0.52, 0.52]) {
          kit.cyl('metalDark', w(d.x + dx, d.y - 0.02, 0.33), w(d.x + dx, d.y + 0.02, 0.33), 0.32, 10);
        }
        kit.cyl('metal', w(d.x - 0.52, d.y, 0.36), w(d.x + 0.1, d.y, 0.85), 0.025, 4);
        kit.cyl('metal', w(d.x + 0.52, d.y, 0.36), w(d.x + 0.4, d.y, 0.95), 0.025, 4);
        kit.cyl('metal', w(d.x + 0.1, d.y, 0.85), w(d.x + 0.4, d.y, 0.8), 0.025, 4);
        kit.box('craneYellow', ...w(d.x + 0.35, d.y - 0.14, 0.95), ...w(d.x + 0.6, d.y + 0.14, 1.05));
        break;
      }
      case 'tyres': {
        at(kit, d.x, d.y);
        const p = w(d.x, d.y);
        for (let i = 0; i < d.n; i += 1) {
          kit.cyl('drTyre', [p[0], i * 0.26, p[2]], [p[0], i * 0.26 + 0.24, p[2]], 0.34, 8);
        }
        break;
      }
      case 'car': {
        at(kit, d.x, d.y);
        kit.town('car', { kind: d.kind, colour: d.colour, variant: d.variant }, w(d.x, d.y, d.h), d.yaw);
        break;
      }
      case 'vend': {
        at(kit, d.x, d.y);
        kit.town('vending', { variant: 0, seed: Math.round(d.seed) }, w(d.x, d.y, d.h), d.yaw);
        break;
      }
      default:
        break;
    }
  }
}

export async function buildMap(shell, onProgress, options) {
  const low = qualityFor(options && options.quality).id === 'low';
  const L = ekimaeLayout();
  const doc = ekimaeDocument();
  const extra = {
    el: { id: 'ekimae', type: 'ekimae' },
    /* On Low the fine parts are left out of what is drawn; none is solid. */
    parts: low ? L.parts.filter((p) => !(p.fine && !p.solid)) : L.parts,
    /* The pilot starts on the car park's roof (./plan.js START), which the
     * document does not hold, so the pipeline is told the roof's height. */
    padBase: CP.roof,
    chunkOf: (x, z) => chunkOf(x, z),
    draw: (kit) => {
      drawWalls(kit, L.walls, low);
      drawDecor(kit, L.decor, low);
    },
  };
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, markSpots: ekimaeMarkSpots(),
  });
  map.id = 'ekimae';
  map.source = 'ekimae';
  /* One batch a look in each chunk rather than one a colour. */
  const props = map.scene.getObjectByName('props');
  const palette = props ? mergePalette(props) : { from: 0, to: 0 };
  const stats = map.stats;
  map.stats = () => ({ ...(stats ? stats() : {}), palette });
  /* The signs, one mesh on one picture. */
  const atlas = paintSigns(L.signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  map.scene.add(signMesh(THREE, L.signs, atlas, paintMaterial(THREE, tex)));
  /* THE GAME, for the shell (filmStep in src/main.js), as Drift Matsuri's. */
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
