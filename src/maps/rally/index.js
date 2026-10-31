/*
 * index.js: Tanada RX, a rallycross circuit under a hillside of rice
 * terraces. Section 19 of the owner's map list of 31 October 2026, built
 * by its prompt: a mixed tarmac and gravel circuit with a jump, cars to
 * chase over it, a grandstand whose roof has a gap in it, every named gap
 * registered, and the town's look.
 *
 * THE PLACE is ./circuit.js (the lap, the joker, the jump, the barriers,
 * the stand, the footbridge, the tower, the screen and the start gantry),
 * ./hill.js (the farm road, seven levels of paddies, the hamlet and the
 * shrine on the crest) and ./paddock.js (the spectator bank, the crowds,
 * the service park, the stalls and the banners), all one structure handed
 * to the built map's pipeline, which gives it the town's sky, fog, lights,
 * ink and hatching. ./yard.js is the document: the start, the gaps, the
 * poles along the farm road, the parked cars and the trees on the flat.
 *
 * THE CARS are the physics module's movers, six of them on three lines
 * (./traffic.js), drawn by the built map's car set with a livery each and
 * lifted over the jump by ./ride.js, render only. They take the place of
 * the built map's cars, as Ridgeline MX's bikes do.
 *
 * FOR THE LATENCY RULE: on every other map, nothing (this file loads only
 * when the map is chosen). On this map the place is the pipeline's batches
 * merged a look a chunk (../sunny/palette.js), the set dressing in near
 * cells switched off past NEAR_R, and Low draws none of it; the six cars
 * are a body, a livery and the shared wheel sets. Per frame on the CPU:
 * six cars' matrices, six calls of ./ride.js, and the near cull's 48 box
 * tests. Nothing allocated.
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
import { buildCars } from '../built/cars.js';
import { uploadTraffic } from '../built/traffic.js';
import { pointAt } from '../built/road.js';
import { warmPrograms } from '../../render/warm.js';
import { qualityFor } from '../../render/quality.js';
import { MATERIALS } from '../../props/rally.js';
import { cel } from '../city/vendored/core/toon.js';
import { mergePalette } from '../sunny/palette.js';
import {
  Place, w, chunkOf, nearOf,
} from './frame.js';
import {
  circuitParts, KONEX, TRACK_WIDTH, LANE_OFFSETS,
} from './circuit.js';
import { hillParts, hillStanding, standingSolids } from './hill.js';
import { paddockParts } from './paddock.js';
import { rallyDocument } from './yard.js';
import { rallyTraffic } from './traffic.js';
import { rideAt } from './ride.js';

/* The chunk a drawn thing is filed under, or its near cell if it is set
 * dressing (./frame.js dress). */
const cellOf = (thing, x, z) => (thing && thing.near ? nearOf(x, z) : chunkOf(x, z));

/* How near the set dressing is drawn, by preset; Low draws none of it.
 * Sunnyfield's numbers, for its reasons (../sunny/index.js). */
const NEAR_R = { medium: 40, high: 50 };

/* ------------------------------------------------------------------ */
/* The track, as paint on the ground                                   */
/* ------------------------------------------------------------------ */

/* A strip along a line from s0 to s1 between two offsets to its left, at
 * height h, as world geometry facing up. */
function strip(line, s0, s1, offA, offB, h, step) {
  const pos = [];
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let k = 0; k <= n; k += 1) {
    const p = pointAt(line, s0 + ((s1 - s0) * k) / n);
    for (const off of [offA, offB]) {
      const q = w(p.x - p.ty * off, p.y + p.tx * off, h);
      pos.push(q[0], q[1], q[2]);
    }
  }
  const index = [];
  for (let k = 0; k < n; k += 1) {
    const a = k * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  /* The cel material is single sided: a strip whose winding came out
   * facing down is turned over. */
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

/* A strip cut into lengths of about PIECE metres, each filed in the chunk
 * its middle stands in, so the track culls with the place around it. */
const PIECE = 40;
function laid(kit, line, s0, s1, offA, offB, h, mat, step = 2) {
  const n = Math.max(1, Math.round((s1 - s0) / PIECE));
  for (let k = 0; k < n; k += 1) {
    const a = s0 + ((s1 - s0) * k) / n;
    const b = s0 + ((s1 - s0) * (k + 1)) / n;
    const m = pointAt(line, (a + b) / 2);
    const c = w(m.x, m.y);
    kit.begin(0, 0, 0, 0, chunkOf(c[0], c[2]));
    kit.add(mat, strip(line, a, b, offA, offB, h, step));
  }
}

function drawTrack(kit, Lay, low) {
  const { line, joker, surfaces, split, merge, barriers, kerbs } = Lay;
  const half = TRACK_WIDTH / 2;
  /* The surface, run by run: tarmac with its white edge lines, gravel with
   * a darker shoulder where the cars throw it wide. */
  for (const r of surfaces) {
    const tar = r.kind === 'tarmac';
    laid(kit, line, r.s0, r.s1, -half, half, 0.035, tar ? 'rxTarmac' : 'rxGravel');
    if (tar) {
      for (const side of [-1, 1]) {
        laid(kit, line, r.s0, r.s1, side * (half - 0.45), side * (half - 0.3), 0.045, 'rxPaint', 3);
      }
    } else {
      for (const side of [-1, 1]) {
        laid(kit, line, r.s0, r.s1, side * half, side * (half + 1.1), 0.03, 'rxGravelDark', 3);
      }
    }
    /* The lines the cars have worn: two wheel tracks a line, rubber on the
     * tarmac and ruts in the gravel. Fine: Low keeps the surface alone. */
    if (!low) {
      for (const d of tar ? [0] : LANE_OFFSETS) {
        for (const wheel of [-0.78, 0.78]) {
          const wd = tar ? 0.3 : 0.12;
          laid(kit, line, r.s0, r.s1, d + wheel - wd, d + wheel + wd, 0.05, tar ? 'rxTarmacWorn' : 'rxGravelDark', 3);
        }
      }
    }
  }
  /* The joker where it is off the course, gravel all the way, a shade
   * under the course where the two meet so they never fight. */
  if (split !== null && merge !== null) {
    const JL = joker.length;
    const s0 = split - 14;
    const s1 = merge + 14;
    const wrap = (v) => v - Math.floor(v / JL) * JL;
    /* Laid in two runs if it crosses the joker's own start. */
    const runs = wrap(s0) < wrap(s1) ? [[wrap(s0), wrap(s1)]] : [[wrap(s0), JL], [0, wrap(s1)]];
    for (const [a, b] of runs) {
      laid(kit, joker, a, b, -half, half, 0.025, 'rxGravel');
      laid(kit, joker, a, b, -half - 1.1, -half, 0.022, 'rxGravelDark', 3);
      laid(kit, joker, a, b, half, half + 1.1, 0.022, 'rxGravelDark', 3);
      if (!low) {
        for (const wheel of [-0.78, 0.78]) {
          laid(kit, joker, a, b, wheel - 0.12, wheel + 0.12, 0.04, 'rxGravelDark', 3);
        }
      }
    }
  }
  /* The gravel traps on the outside of the bends, from the track's edge
   * out to the tyre wall. */
  for (const b of barriers) {
    if (!b.gravelTrap) {
      continue;
    }
    const s = b.s;
    const side = b.gravelTrap;
    const c = w(b.a[0], b.a[1]);
    kit.begin(0, 0, 0, 0, chunkOf(c[0], c[2]));
    kit.add('rxGravel', strip(line, s - 1.7, s + 1.7, side * (half + 1.1), side * 11.0, 0.028, 1.7));
  }
  /* The kerbs, red and white blocks on the inside of the tarmac bends. */
  for (const k of kerbs) {
    const c = w(k.x, k.y);
    kit.begin(c[0], 0, c[2], Math.atan2(k.ty, k.tx), chunkOf(c[0], c[2]));
    kit.box(k.red ? 'rxKerbRed' : 'rxKerbWhite', -k.len / 2, 0, -0.45, k.len / 2, 0.09, 0.45);
  }
}

/* ------------------------------------------------------------------ */
/* The near cull                                                       */
/* ------------------------------------------------------------------ */

/* Sunnyfield's (../sunny/index.js nearCull), on this map's near cells. */
function nearCull(props, r) {
  const cells = [];
  const bb = new THREE.Box3();
  for (const g of props.children) {
    if (!g.name.startsWith('props:rn')) {
      continue;
    }
    bb.makeEmpty();
    for (const m of g.children) {
      if (!m.geometry) {
        continue;
      }
      if (!m.geometry.boundingBox) {
        m.geometry.computeBoundingBox();
      }
      bb.union(m.geometry.boundingBox);
    }
    if (!bb.isEmpty()) {
      cells.push({ group: g, x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, on: true });
    }
  }
  const r2 = r * r;
  return {
    to(eye) {
      for (let i = 0; i < cells.length; i += 1) {
        const c = cells[i];
        const dx = Math.max(0, c.x0 - eye.x, eye.x - c.x1);
        const dz = Math.max(0, c.z0 - eye.z, eye.z - c.z1);
        c.on = dx * dx + dz * dz <= r2;
        c.group.visible = c.on;
      }
    },
    stats: () => ({ cells: cells.length, on: cells.filter((c) => c.on).length, radius: r }),
  };
}

/* ------------------------------------------------------------------ */
/* The cars' liveries                                                  */
/* ------------------------------------------------------------------ */

/* Body colour, stripe, and the number panels' colour, by livery. */
const LIVERIES = [
  ['rxLivBlue', 'rxLivYellow', 'rxLivWhite'],
  ['rxLivYellow', 'rxLivBlack', 'rxLivWhite'],
  ['rxLivRed', 'rxLivWhite', 'rxLivWhite'],
  ['rxLivGreen', 'rxLivOrange', 'rxLivWhite'],
  ['rxLivWhite', 'rxLivRed', 'rxLivYellow'],
  ['rxLivOrange', 'rxLivBlue', 'rxLivWhite'],
];
const hexOf = (name) => MATERIALS[name].c ?? MATERIALS[name].f;

/*
 * What a rallycross car has that a town hatch does not, as one mesh in
 * the car's own frame (nose +x, ground y 0): a stripe down each side, a
 * number panel on each door and on the roof, a rear wing on two posts, a
 * splitter, mud flaps behind the wheels and a roof scoop. One geometry,
 * coloured by vertex, so it is one draw a car.
 */
function liveryGeometry(livery) {
  const [, stripe, panel] = LIVERIES[livery % LIVERIES.length];
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const box = (hex, x0, y0, z0, x1, y1, z1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    c.setHex(hex);
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      pos.push(p[i], p[i + 1], p[i + 2]);
      col.push(c.r, c.g, c.b);
    }
    g.dispose();
  };
  const S = hexOf(stripe);
  const P = hexOf(panel);
  const K = 0x2c2a33;
  for (const z of [-1, 1]) {
    const o = z * 0.855;
    box(S, -1.75, 0.5, o - 0.012, 1.75, 0.62, o + 0.012);
    box(P, -0.55, 0.66, o - 0.014, 0.15, 0.98, o + 0.014);
    box(K, -0.38, 0.72, o - 0.017, -0.02, 0.92, o + 0.017);
    /* The mud flaps, behind the rear wheels. */
    box(K, -1.42, 0.08, z * 0.62, -1.38, 0.38, z * 0.84);
  }
  /* The roof's number board and the scoop in front of it. */
  box(P, -0.75, 1.5, -0.32, -0.05, 1.55, 0.32);
  box(K, -0.6, 1.55, -0.16, -0.2, 1.56, 0.16);
  box(S, 0.05, 1.48, -0.18, 0.4, 1.6, 0.18);
  /* The rear wing on its posts, and the splitter. */
  for (const z of [-0.45, 0.45]) {
    box(K, -1.95, 1.26, z - 0.03, -1.82, 1.44, z + 0.03);
  }
  box(S, -2.12, 1.44, -0.86, -1.72, 1.5, 0.86);
  box(K, -2.14, 1.36, -0.88, -2.08, 1.56, -0.84);
  box(K, -2.14, 1.36, 0.84, -2.08, 1.56, 0.88);
  box(K, 1.9, 0.1, -0.84, 2.14, 0.14, 0.84);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ */
/* The map                                                             */
/* ------------------------------------------------------------------ */

export async function buildMap(shell, onProgress, options) {
  const low = qualityFor(options && options.quality).id === 'low';
  const T = new Place();
  const Lay = circuitParts(T);
  hillParts(T);
  paddockParts(T);

  /* The hill's trees and the hamlet's car: drawn by the kit as the
   * document's are, and solid by their own parts (./hill.js). */
  const standing = hillStanding();
  const solids = standingSolids(standing);
  const all = [...T.P.list, ...solids];

  const extra = {
    el: { id: 'rally', type: 'rally' },
    /* On Low the fine parts are left out of what is drawn; none is solid. */
    parts: low ? all.filter((p) => !(p.fine && !p.solid)) : all,
    draw: (kit) => {
      drawTrack(kit, Lay, low);
      for (const d of T.draws) {
        if (low && d.fine) {
          continue;
        }
        const [x, , z] = w(d.px, d.py);
        d.fn(kit, cellOf(d, x, z));
      }
      for (const s of standing) {
        kit.begin(s.x, s.h, s.z, 0, chunkOf(s.x, s.z));
        kit.element(s.el);
      }
    },
    chunkOf: (x, z, p) => cellOf(p, x, z),
  };
  /* The one hidden Konex Drone sign (the owner's promise of a logo hidden
   * in every map): on the back of the grandstand's back wall, in the alley
   * under the roof's overhang (./circuit.js KONEX). */
  const kp = w(KONEX.px, KONEX.py, KONEX.h);
  const markSpots = [{
    slug: 'konexdrone', key: 'rally#konexdrone~hidden', p: kp, n: KONEX.n, up: [0, 1, 0], w: KONEX.w, chunk: chunkOf(kp[0], kp[2]),
  }];
  const doc = rallyDocument();
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, markSpots, sponsorMarks: false,
  });
  map.id = 'rally';
  map.source = 'rally';

  /* The set dressing casts no shadow (Sunnyfield's reason), then one batch
   * a look a chunk, then the near cull after the pipeline's own. */
  const props = map.scene.getObjectByName('props');
  if (props) {
    for (const g of props.children) {
      if (!g.name.startsWith('props:rn')) {
        continue;
      }
      for (const m of [...g.children]) {
        if (m.userData.shadowProxy) {
          g.remove(m);
          m.geometry.dispose();
        }
      }
    }
  }
  const palette = props ? mergePalette(props) : { from: 0, to: 0 };
  const near = props && !low ? nearCull(props, NEAR_R[qualityFor(options && options.quality).id] || NEAR_R.high) : null;
  if (near) {
    const focus = map.updateShadowFocus;
    map.updateShadowFocus = (target) => {
      focus(target);
      near.to(shell.camera.position);
    };
    near.to(shell.camera.position);
  }

  /* THE CARS, in the place of the built map's. */
  const rx = rallyTraffic();
  const liveryOf = new Map(rx.cars.map((c) => [c.element, c.livery]));
  const look = { timeId: doc.scene.time, time: { night: false } };
  const carSet = buildCars(THREE, look, rx.traffic, {
    colour: (v) => hexOf(LIVERIES[(liveryOf.get(v.element) ?? 0) % LIVERIES.length][0]),
    ride: rideAt,
  });
  const liveryMat = cel({ color: 0xffffff, vertexColors: true, bands: 3, tint: 0x5c5680, cache: false });
  const liveryGeos = [];
  for (const car of carSet.cars) {
    const g = liveryGeometry(liveryOf.get(car.element) ?? 0);
    liveryGeos.push(g);
    const m = new THREE.Mesh(g, liveryMat);
    m.name = 'carLivery';
    m.castShadow = true;
    car.root.add(m);
  }
  map.scene.add(carSet.group);
  map.traffic = rx.traffic;
  map.restKeepOut = rx.keepOut;
  map.uploadTraffic = (sim) => uploadTraffic(sim, rx.traffic);
  map.chaseCars = () => carSet.chaseCars();
  map.poseCars = (prev, curr, alpha, now) => carSet.place(prev, curr, alpha, now);
  map.carTick = (step, poses) => carSet.emit(step, poses);
  map.clearSmoke = () => carSet.clearSmoke();
  map.carGap = (x, y, z, reach) => carSet.gapAt(x, y, z, reach);
  const baseDispose = map.dispose;
  map.dispose = () => {
    for (const g of liveryGeos) {
      g.dispose();
    }
    liveryMat.dispose();
    carSet.dispose();
    baseDispose();
  };
  const baseStats = map.stats;
  map.stats = () => {
    const s = baseStats();
    const c = carSet.stats();
    return {
      ...s,
      batches: s.batches + c.meshes + carSet.cars.length,
      triangles: s.triangles + c.triangles + liveryGeos.reduce((n, g) => n + g.attributes.position.count / 3, 0),
      cars: c,
      palette,
      near: near ? near.stats() : null,
    };
  };
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
