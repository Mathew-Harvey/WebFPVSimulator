/*
 * index.js: Ridgeline MX, a map and a mini game. The owner's ask of 29
 * October 2026:
 *
 *   "motor cross cam chase, the bikes should rip, rail, whip and just look
 *   like IRL, all single and multi player"
 *
 * THE PLACE is ./circuit.js (the course, the mounds, the berms, the tower,
 * the stand and the paddock) and ./yard.js (the document: the plot, the
 * time of day, the pilot's start, the vans and the trees), built by the
 * built map's pipeline as the drift circuit is, in the town's look at
 * golden hour, with the track laid as paint on the grass.
 *
 * THE BIKES are the physics module's movers, three lines of them
 * (./traffic.js), ridden over the mounds, laid into the berms, whipped and
 * scrubbed off the lips and drawn with their roost (./ride.js, ./bikes.js).
 * They take the place of the built map's cars: the document holds none, and
 * the hooks the shell calls for traffic are this map's own, as Heads'
 * street's are (src/maps/goats/index.js).
 *
 * THE GAME is Drift Matsuri's: src/game/film.js judges what the camera
 * sees of the bikes, frame by frame, and the same round and room play it
 * (src/game/driftround.js, driftroom.js). The mounds' lips, the berms and
 * the whoops are the zones a shot counts for more in.
 *
 * FOR THE LATENCY RULE, measured and written in the PR: on every other map,
 * nothing (this file loads only when the map is chosen). On this map, the
 * place is drawn in the built map's batches, one draw call a colour, and
 * the bikes cost a draw call each. Per frame on the CPU: ten bikes' matrices
 * and the judge, every 8 ms of flight, a few microseconds; nothing
 * allocated.
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
import { uploadTraffic } from '../built/traffic.js';
import { warmPrograms } from '../../render/warm.js';
import { Film } from '../../game/film.js';
import {
  circuitLayout, w, TOWER, MX_PAD_BASE, TRACK_WIDTH, MOUND_HALF, LANE_OFFSETS, SIGN,
} from './circuit.js';
import { motoDocument } from './yard.js';
import { motoTraffic } from './traffic.js';
import { makeRider } from './ride.js';
import { buildBikes } from './bikes.js';

/* A plan heading, for a block turned onto a run: render only. */
function heading(dx, dy) {
  return Math.atan2(dy, dx);
}

/*
 * THE TRACK as paint on the grass: a ribbon of packed dirt the width of the
 * course and, over it, the ruts the three lines have worn, in the darker
 * dirt. A few centimetres up, so it never fights the ground at a grazing
 * angle. The strip's points are the course's own, every second or third,
 * which on a straight is a long strip and in a bend a short one.
 */
function drawTrack(kit, line) {
  const THREE = kit.THREE;
  const ribbon = (offA, offB, y, stride) => {
    const pts = line.points;
    const n = pts.length;
    const idx = [];
    for (let i = 0; i < n; i += stride) {
      idx.push(i);
    }
    const pos = [];
    for (const i of idx) {
      const p = pts[i];
      const t = line.tangents[i];
      for (const off of [offA, offB]) {
        const q = w(p.x - t.y * off, p.y + t.x * off, y);
        pos.push(q[0], q[1], q[2]);
      }
    }
    const index = [];
    for (let k = 0; k < idx.length; k += 1) {
      const a = k * 2;
      const b = ((k + 1) % idx.length) * 2;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  };
  kit.begin(0, 0, 0, 0, 'extra');
  const half = TRACK_WIDTH / 2 + 0.4;
  /* The ribbon's winding faces down for a line that runs one way; the cel
   * material is single sided, so both are tried and the upward one kept by
   * flipping the normals' sign when they point down. */
  const up = (g) => {
    const nrm = g.attributes.normal;
    if (nrm.getY(0) < 0) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) {
        const t = ix[i + 1];
        ix[i + 1] = ix[i + 2];
        ix[i + 2] = t;
      }
      g.computeVertexNormals();
    }
    return g;
  };
  kit.add('mxTrack', up(ribbon(-half, half, 0.03, 2)));
  /* Wear in the bends: the inside line is scoured darker and a loose,
   * lighter shoulder is thrown to the outside, in the colours the track
   * and the ruts already have. */
  {
    const pts = line.points;
    const n = pts.length;
    const turn = new Int8Array(n);
    for (let i = 0; i < n; i += 1) {
      const a0 = line.tangents[(i + n - 3) % n];
      const b0 = line.tangents[(i + 3) % n];
      const c = a0.x * b0.y - a0.y * b0.x;
      turn[i] = c > 0.04 ? 1 : (c < -0.04 ? -1 : 0);
    }
    const strip = (offOf, width, y, mat) => {
      let i = 0;
      while (i < n) {
        if (turn[i] === 0) {
          i += 1;
          continue;
        }
        const side = turn[i];
        let j = i;
        while (j + 1 < n && turn[j + 1] === side) {
          j += 1;
        }
        const pos = [];
        const index = [];
        let k = 0;
        for (let m = i; m <= j; m += 2) {
          const p = pts[m];
          const t = line.tangents[m];
          const off = offOf(side);
          for (const o of [off - width / 2, off + width / 2]) {
            const q = w(p.x - t.y * o, p.y + t.x * o, y);
            pos.push(q[0], q[1], q[2]);
          }
          if (k > 0) {
            const a1 = (k - 1) * 2;
            index.push(a1, a1 + 2, a1 + 1, a1 + 1, a1 + 2, a1 + 3);
          }
          k += 1;
        }
        if (k > 1) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setIndex(index);
          g.computeVertexNormals();
          kit.add(mat, up(g));
        }
        i = j + 1;
      }
    };
    /* A line to the left of the line is positive; a left bend's inside is left. */
    strip((side) => side * (half - 1.9), 0.9, 0.05, 'mxDirt');
  }
  for (const d of LANE_OFFSETS) {
    for (const side of [-0.38, 0.38]) {
      kit.add('mxDirt', up(ribbon(d + side - 0.12, d + side + 0.12, 0.04, 3)));
    }
  }
}

/* The mounds, extruded from the profile ./profile.js rides over. */
function drawMounds(kit, mounds) {
  for (const m of mounds) {
    const p = w(m.x, m.y);
    kit.begin(p[0], 0, p[2], heading(m.tx, m.ty), 'extra');
    const base = m.pts[0][0];
    const end = m.pts[m.pts.length - 1][0];
    const profile = [[0, 0]];
    for (const [s, h] of m.pts) {
      profile.push([s - base, h]);
    }
    profile.push([end - base, 0]);
    kit.extrude('mxDirtDark', profile, -MOUND_HALF, MOUND_HALF);
    /* The groomed line over it, in the track's own dirt, a few centimetres
     * proud and narrower, so the shoulders stay dark and the way over
     * reads from the air. */
    kit.extrude('mxTrack', profile.map(([x, y]) => [x, y > 0.001 ? y + 0.03 : 0]), -TRACK_WIDTH / 2 + 0.3, TRACK_WIDTH / 2 - 0.3);
    /* A darker band down the lip, so the take off reads from the air. */
    if (m.kind !== 'whoops') {
      for (const [s, h] of m.pts) {
        if (h > 0.5) {
          kit.box('mxDirtDark', s - base - 0.2, h - 0.02, -TRACK_WIDTH / 2 + 0.3, s - base + 0.2, h + 0.07, TRACK_WIDTH / 2 - 0.3);
        }
      }
    }
  }
}

function turned(kit, x, y, yaw, fn) {
  const p = w(x, y);
  kit.begin(p[0], 0, p[2], yaw, 'extra');
  fn();
  kit.begin(0, 0, 0, 0, 'extra');
}

const SHIRTS = ['mxOrange', 'mxBlue', 'mxGreen', 'mxRed', 'white', 'mxHay'];

function drawDecor(kit, decor) {
  kit.begin(0, 0, 0, 0, 'extra');
  for (const d of decor) {
    switch (d.t) {
      case 'brace': {
        const h = d.half;
        for (const [x0, y0, x1, y1] of [[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [h, -h, -h, -h]]) {
          kit.cyl('metal', w(d.x + x0, d.y + y0, d.h0), w(d.x + x1, d.y + y1, d.h1), 0.04, 4);
          kit.cyl('metal', w(d.x + x1, d.y + y1, d.h0), w(d.x + x0, d.y + y0, d.h1), 0.04, 4);
        }
        break;
      }
      case 'ladder':
        kit.ladder('metal', w(...d.a), w(...d.b), 0.5);
        break;
      case 'rail': {
        const { half, h, x, y } = d;
        for (const [a, b] of [[[-half, -half], [half, -half]], [[half, -half], [half, half]], [[half, half], [-half, half]], [[-half, half], [-half, -half]]]) {
          kit.cyl('metal', w(x + a[0], y + a[1], h + 1.0), w(x + b[0], y + b[1], h + 1.0), 0.03, 4);
          kit.cyl('metal', w(x + a[0], y + a[1], h + 0.5), w(x + b[0], y + b[1], h + 0.5), 0.02, 4);
        }
        break;
      }
      case 'gate': {
        /* The start gate dropped flat on the line, its white paint across
         * the track, and the pegs the riders line up on. */
        const yaw = heading(d.tx, d.ty);
        turned(kit, d.x, d.y, yaw, () => {
          kit.box('metal', -0.1, 0.0, -TRACK_WIDTH / 2, 0.1, 0.06, TRACK_WIDTH / 2);
          kit.box('white', 0.4, 0.04, -TRACK_WIDTH / 2, 0.8, 0.05, TRACK_WIDTH / 2);
          for (let i = -4; i <= 4; i += 1) {
            kit.box('mxOrange', -0.6, 0.0, i * 0.9 - 0.04, -0.2, 0.2, i * 0.9 + 0.04);
          }
        });
        break;
      }
      case 'tent': {
        const a = w(d.x, d.y, 0);
        const b = w(d.x + d.wd, d.y + d.dp, 0);
        const x0 = Math.min(a[0], b[0]);
        const x1 = Math.max(a[0], b[0]);
        const z0 = Math.min(a[2], b[2]);
        const z1 = Math.max(a[2], b[2]);
        for (const [px, pz] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.1, z0 + 0.1], [x0 + 0.1, z1 - 0.1], [x1 - 0.1, z1 - 0.1]]) {
          kit.cyl('metal', [px, 0, pz], [px, 2.4, pz], 0.05, 4);
        }
        kit.box(d.m, x0 - 0.3, 2.4, z0 - 0.3, x1 + 0.3, 2.65, z1 + 0.3);
        kit.box('white', x0 - 0.3, 2.2, z0 - 0.3, x1 + 0.3, 2.4, z0 - 0.25);
        kit.box('white', x0, 0.7, z1 - 0.7, x1, 0.8, z1 - 0.1);
        break;
      }
      case 'bikeOnStand': {
        turned(kit, d.x, d.y, d.yaw, () => {
          kit.box(d.m, -0.5, 0.5, -0.12, 0.2, 0.85, 0.12);
          kit.box('metal', -0.1, 0.25, -0.1, 0.25, 0.5, 0.1);
          for (const x of [-0.7, 0.72]) {
            kit.cyl('drTyre', [x, 0.31, -0.05], [x, 0.31, 0.05], 0.31, 10);
          }
          kit.cyl('metal', [0.5, 0.35, 0], [0.3, 1.0, 0], 0.03, 4);
          kit.box('metal', -0.1, 0.0, -0.3, 0.1, 0.25, 0.3);
        });
        break;
      }
      case 'crowd': {
        let k = 0;
        for (let r = 0; r < d.rows; r += 1) {
          for (let x = d.x0 + 0.5; x < d.x1; x += 0.95) {
            k += 1;
            const px = x + (((k * 7) % 5) - 2) * 0.05;
            const p = w(px, d.y + r * 1.4 + 0.9, r * 0.5 + 0.5);
            const top = 1.3 + ((k * 3) % 4) * 0.05;
            kit.cyl(SHIRTS[(k * 5 + r) % SHIRTS.length], [p[0], p[1], p[2]], [p[0], p[1] + top - 0.3, p[2]], 0.22, 6, 0.16);
            kit.blob('drSkin', [p[0], p[1] + top - 0.1, p[2]], 0.16, 0.17, [0, k, 0]);
            if (k % 6 === 0) {
              kit.cyl('drSkin', [p[0] + 0.15, p[1] + top - 0.4, p[2]], [p[0] + 0.22, p[1] + top + 0.2, p[2]], 0.04, 4);
            }
          }
        }
        break;
      }
      case 'hay': {
        turned(kit, d.x, d.y, heading(d.tx, d.ty), () => {
          kit.box('mxHay', -1.1, 0, -0.45, 1.1, 0.5, 0.45);
          kit.box('rope', -1.1, 0.2, -0.46, 1.1, 0.25, 0.46);
          if (d.rows > 1) {
            kit.box('mxHay', -0.8, 0.5, -0.42, 0.8, 1.0, 0.42);
          }
        });
        break;
      }
      case 'arch': {
        turned(kit, d.x, d.y, heading(d.tx, d.ty), () => {
          for (const side of [-1, 1]) {
            kit.cyl('metal', [0, 0, side * d.off], [0, d.h, side * d.off], 0.18, 6);
          }
          kit.box('metal', -0.3, d.h - 0.6, -d.off, 0.3, d.h, d.off);
          kit.box('mxOrange', -0.34, d.h - 1.5, -d.off + 0.4, -0.3, d.h - 0.6, d.off - 0.4);
          kit.box('mxOrange', 0.3, d.h - 1.5, -d.off + 0.4, 0.34, d.h - 0.6, d.off - 0.4);
          for (let i = 0; i < 24; i += 1) {
            const z0 = -d.off + 0.4 + i * ((2 * d.off - 0.8) / 24);
            const z1 = z0 + (2 * d.off - 0.8) / 24;
            kit.box(i % 2 ? 'white' : 'drTyre', -0.35, d.h - 1.1, z0, -0.31, d.h - 0.8, z1);
            kit.box(i % 2 ? 'drTyre' : 'white', -0.35, d.h - 0.8, z0, -0.31, d.h - 0.6, z1);
          }
        });
        break;
      }
      case 'bunting': {
        const a = w(d.ax, d.ay, d.h);
        const b = w(d.bx, d.by, d.h);
        kit.cyl('metal', a, b, 0.015, 3);
        const n = 12;
        const FLAGS = ['mxOrange', 'white', 'mxBlue'];
        for (let i = 1; i < n; i += 1) {
          const t = i / n;
          const sag = Math.sin(t * Math.PI) * -0.18;
          const x = a[0] + (b[0] - a[0]) * t;
          const z = a[2] + (b[2] - a[2]) * t;
          kit.box(FLAGS[i % FLAGS.length], x - 0.12, a[1] + sag - 0.34, z - 0.12, x + 0.12, a[1] + sag, z + 0.12);
        }
        break;
      }
      case 'hut': {
        turned(kit, d.x, d.y, heading(d.tx, d.ty), () => {
          kit.box('white', -1, 0, -1, 1, 2.2, 1);
          kit.box('mxRed', -1.2, 2.2, -1.2, 1.2, 2.4, 1.2);
          kit.box('drTyre', 0.99, 0.9, -0.5, 1.02, 1.6, 0.5);
          kit.cyl('metal', [1.1, 0, 1.1], [1.1, 3.4, 1.1], 0.03, 4);
          kit.box('mxHay', 1.1, 2.7, 1.1, 1.1 + 0.04, 3.4, 1.9);
        });
        break;
      }
      case 'clod': {
        const p = w(d.x, d.y);
        kit.blob('mxDirtDark', [p[0], 0.08, p[2]], 0.14 + (d.k % 4) * 0.05, 0.1 + (d.k % 3) * 0.03, [0, d.k, 0]);
        break;
      }
      case 'board': {
        const BOARDS = ['mxOrange', 'mxBlue', 'white', 'mxRed', 'mxGreen'];
        const m = BOARDS[d.k % BOARDS.length];
        const a = w(d.x, d.y, 0);
        kit.box(m, a[0], 0.15, a[2] - 0.07, a[0] + 6, 0.95, a[2] + 0.07);
        kit.box('white', a[0], 0.55, a[2] - 0.075, a[0] + 6, 0.62, a[2] + 0.075);
        kit.box('metal', a[0] + 0.1, 0, a[2] - 0.05, a[0] + 0.16, 0.15, a[2] + 0.05);
        kit.box('metal', a[0] + 5.84, 0, a[2] - 0.05, a[0] + 5.9, 0.15, a[2] + 0.05);
        break;
      }
      case 'bump': {
        turned(kit, d.x, d.y, heading(d.tx, d.ty), () => {
          kit.box('mxDirtDark', -0.15, 0, -TRACK_WIDTH / 2 + 0.8 + (d.k % 2) * 0.4, 0.15, 0.045 + (d.k % 3) * 0.01, TRACK_WIDTH / 2 - 0.8 - ((d.k + 1) % 2) * 0.4);
        });
        break;
      }
      case 'stake': {
        const p = w(d.x, d.y);
        kit.cyl('mxOrange', [p[0], 0, p[2]], [p[0], 1.1, p[2]], 0.03, 4);
        break;
      }
      default:
        break;
    }
  }
}

export async function buildMap(shell, onProgress, options) {
  const L = circuitLayout();
  const doc = motoDocument();
  const extra = {
    el: { id: 'moto', type: 'moto' },
    parts: L.parts,
    /* The pilot starts on the photographers' tower (./circuit.js). */
    padBase: MX_PAD_BASE,
    draw: (kit) => {
      drawTrack(kit, L.line);
      drawMounds(kit, L.mounds);
      drawDecor(kit, L.decor);
    },
  };
  /* The one hidden Konex Drone sign (the owner's promise of a logo hidden in
   * every map): on the face of the sponsor board by the paddock, outside the
   * course. */
  const markSpots = [{
    slug: 'konexdrone', key: 'moto#konexdrone~hidden', p: SIGN.p, n: [0, 0, 1], up: [0, 1, 0], w: 1.2, chunk: 'extra',
  }];
  const map = await buildBuilt(shell, onProgress, { ...(options || {}), document: doc, extra, markSpots });
  map.id = 'moto';
  map.source = 'moto';

  /* THE BIKES, in the place of the built map's cars. */
  const moto = motoTraffic();
  const rider = makeRider(moto);
  const bikes = buildBikes(map.look || null, moto, rider);
  map.scene.add(bikes.group);
  map.traffic = moto.traffic.vehicles.length ? moto.traffic : null;
  map.restKeepOut = moto.keepOut;
  map.uploadTraffic = (sim) => uploadTraffic(sim, moto.traffic);
  map.chaseCars = () => [];
  map.poseCars = (prev, curr, alpha, now) => bikes.place(prev, curr, alpha, now);
  map.carTick = (step, poses) => bikes.emit(step, poses);
  map.clearSmoke = () => bikes.clear();
  map.carGap = (x, y, z, reach) => bikes.gapAt(x, y, z, reach);
  const baseDispose = map.dispose;
  map.dispose = () => {
    bikes.dispose();
    baseDispose();
  };
  const baseStats = map.stats;
  map.stats = () => {
    const s = baseStats();
    return { ...s, bikes: bikes.stats() };
  };

  /* THE GAME, for the shell (filmFeed in src/main.js): the judge, and which
   * mover slot is which bike in which pack, from the same traffic the plant
   * was handed. `posed` puts every pose where its bike is drawn. */
  const film = new Film();
  film.setCars(moto.bikes.map((b) => ({
    slot: b.slot, group: b.group, height: 1.8, label: `RIDER ${b.number}`,
  })));
  film.setGroups(moto.groups.map((g) => ({ name: g.name, size: g.bikes.length })));
  film.setZones(L.zones);
  map.filmGame = {
    film,
    zones: L.zones,
    posed: rider.posed,
    kicker: 'Ridgeline MX',
    words: {
      find: 'Find the pack', smoke: 'In the roost!', lost: 'Find a rider', tip: '\nYou are the camera. Film the riders for a minute.',
    },
    bikes: moto.bikes,
    ride: rider.rideOf,
  };
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  void TOWER;
  return map;
}
