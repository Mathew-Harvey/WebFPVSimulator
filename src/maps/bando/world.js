/*
 * world.js: assemble the kiln yard and answer height queries.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
import { Colliders } from '../../game/collide.js';
import { L, STEP, CLEAR, materials, mergeStatic } from './kit.js';
import { restrictCasters } from '../compact-perf.js';
import { buildGround, groundHeight } from './ground.js';
import { buildHall } from './hall.js';
import { buildPlant } from './plant.js';
import { buildDress } from './dress.js';
import { kilnReferences } from './references.js';

export function buildWorld(scene, opts = {}) {
  const root = new THREE.Group();
  root.name = 'kiln';
  scene.add(root);

  const colliders = new Colliders();
  const platforms = [];
  const M = materials();

  buildGround(root, colliders, M);
  buildHall(root, colliders, platforms, M);
  buildPlant(root, colliders, platforms, M);
  buildDress(root, colliders, M);

  const references = kilnReferences(root, colliders, platforms);
  restrictCasters(root, opts.casterMin ?? 0.5);
  const merged = mergeStatic(root, { cell: opts.mergeCell ?? 24 });
  colliders.build();
  /*
   * LAZY. leftoverScan is an n squared pair loop over every box, and each
   * candidate slot then runs another sweep over all of them: on this site
   * that is 939 boxes, about 440 thousand pairs, on the critical path of
   * every player's map load, for a number only the harness ever reads.
   * baths already returns its audit as a function; this matches it.
   */

  function heightAt(x, z, fromY) {
    let h = groundHeight(x, z);
    const reach = fromY === undefined ? Infinity : fromY + STEP;
    for (let i = 0; i < platforms.length; i += 1) {
      const p = platforms[i];
      if (p.top > reach) {
        continue;
      }
      if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) {
        h = Math.max(h, p.top);
      }
    }
    return h;
  }

  return {
    root,
    colliders,
    platforms,
    spawn: L.spawn,
    merged,
    leftover: () => leftoverScan(colliders),
    heightAt,
    references,
  };
}

function overlapLen(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function occupies(ax, ay, az, bx, by, bz, isBox, k, x0, y0, z0, x1, y1, z1) {
  if (!isBox[k]) {
    return false;
  }
  return overlapLen(ax[k], bx[k], x0, x1) > 0.02
    && overlapLen(ay[k], by[k], y0, y1) > 0.02
    && overlapLen(az[k], bz[k], z0, z1) > 0.02;
}

function leftoverScan(colliders) {
  const n = colliders.count;
  const ax = colliders.fax;
  const ay = colliders.fay;
  const az = colliders.faz;
  const bx = colliders.fbx;
  const by = colliders.fby;
  const bz = colliders.fbz;
  const isBox = colliders.fbox;
  let death = 0;
  let overlap = 0;
  const samples = [];
  for (let i = 0; i < n; i += 1) {
    if (!isBox[i]) {
      continue;
    }
    for (let j = i + 1; j < n; j += 1) {
      if (!isBox[j]) {
        continue;
      }
      const ox = overlapLen(ax[i], bx[i], ax[j], bx[j]);
      const oy = overlapLen(ay[i], by[i], ay[j], by[j]);
      const oz = overlapLen(az[i], bz[i], az[j], bz[j]);
      if (ox > 0.02 && oy > 0.02 && oz > 0.02) {
        overlap += 1;
        if (samples.length < 80) {
          samples.push({
            kind: 'overlap',
            i,
            j,
            ox: Math.round(ox * 1000) / 1000,
            oy: Math.round(oy * 1000) / 1000,
            oz: Math.round(oz * 1000) / 1000,
            a: [ax[i], ay[i], az[i], bx[i], by[i], bz[i]].map((n) => Math.round(n * 100) / 100),
            b: [ax[j], ay[j], az[j], bx[j], by[j], bz[j]].map((n) => Math.round(n * 100) / 100),
          });
        }
        continue;
      }
      const slot = (overA, overB, gap) => overA > 0.25 && overB > 0.25 && gap > 0.08 && gap < CLEAR;
      let axis = null;
      let gx0 = 0;
      let gy0 = 0;
      let gz0 = 0;
      let gx1 = 0;
      let gy1 = 0;
      let gz1 = 0;
      if (ox > 0.25 && oy > 0.25 && slot(ox, oy, -oz)) {
        axis = 'z';
        gx0 = Math.max(ax[i], ax[j]);
        gx1 = Math.min(bx[i], bx[j]);
        gy0 = Math.max(ay[i], ay[j]);
        gy1 = Math.min(by[i], by[j]);
        gz0 = Math.min(bz[i], bz[j]);
        gz1 = Math.max(az[i], az[j]);
      } else if (ox > 0.25 && oz > 0.25 && slot(ox, oz, -oy)) {
        axis = 'y';
        gx0 = Math.max(ax[i], ax[j]);
        gx1 = Math.min(bx[i], bx[j]);
        gz0 = Math.max(az[i], az[j]);
        gz1 = Math.min(bz[i], bz[j]);
        gy0 = Math.min(by[i], by[j]);
        gy1 = Math.max(ay[i], ay[j]);
      } else if (oy > 0.25 && oz > 0.25 && slot(oy, oz, -ox)) {
        axis = 'x';
        gy0 = Math.max(ay[i], ay[j]);
        gy1 = Math.min(by[i], by[j]);
        gz0 = Math.max(az[i], az[j]);
        gz1 = Math.min(bz[i], bz[j]);
        gx0 = Math.min(bx[i], bx[j]);
        gx1 = Math.max(ax[i], ax[j]);
      }
      if (!axis) {
        continue;
      }
      let filled = false;
      for (let k = 0; k < n; k += 1) {
        if (k === i || k === j) {
          continue;
        }
        if (occupies(ax, ay, az, bx, by, bz, isBox, k, gx0, gy0, gz0, gx1, gy1, gz1)) {
          filled = true;
          break;
        }
      }
      if (filled) {
        continue;
      }
      death += 1;
      if (samples.length < 80) {
        samples.push({
          kind: axis,
          i,
          j,
          gap: Math.round((axis === 'x' ? -ox : axis === 'y' ? -oy : -oz) * 1000) / 1000,
          a: [ax[i], ay[i], az[i], bx[i], by[i], bz[i]].map((n) => Math.round(n * 100) / 100),
          b: [ax[j], ay[j], az[j], bx[j], by[j], bz[j]].map((n) => Math.round(n * 100) / 100),
        });
      }
    }
  }
  return { death, overlap, samples };
}

/*
 * The title camera's loop, and what it is for.
 *
 * IT IS AN ESTABLISHING SHOT, NOT A FLIGHT LINE. The two are not the same
 * thing and this loop used to be the second one: it opened at head height in
 * the yard with the pack hall six metres in front of it, went straight in at
 * the north door, climbed the INSIDE of the chimney, dropped through the
 * preheater shaft, dived into the hopper pit and finished by rocketing to
 * 64 m. Every one of those is a lovely thing to fly and every one of them is
 * a brown rectangle at 236 px wide. Reported as the world cards being close
 * ups of internal walls, which is exactly what a chimney flue is.
 *
 * So the loop opens OUTSIDE the fence now, at the same vantage the card's
 * poster is taken from, where the stack, the preheater and the length of the
 * pack hall are one frame against the sunset, and flies in from there. It
 * still goes through the hall, because a place you can fly through should
 * show that it is one, but it goes through the door and out the far end
 * rather than living in there. It still climbs the stack, on the outside,
 * where the stack is a thing you can see.
 *
 * The order below is the order the shot happens in, and the recorder starts
 * at the first point, so the first point is the establishing frame.
 */
export function attractPath(world) {
  const pts = [
    /* Outside the fence, south east, the whole works in the frame. */
    { x: 62, y: 24, z: 44 },
    { x: 44, y: 18, z: 32 },
    { x: 26, y: 12, z: 22 },
    /* Down onto the yard and in at the north door, which is the twelve metre
     * gap in the middle of the long wall. */
    { x: 0.6, y: 4.0, z: 12 },
    { x: 0.2, y: 3.4, z: 4.8 },
    /* West along the pack hall, under the kiln. */
    { x: -14, y: 3.4, z: 0 },
    { x: -26, y: 3.4, z: 0 },
    { x: -40, y: 4.8, z: 0 },
    /*
     * Turn at the stack, which the run down the hall has been pointed at
     * since it started, and come back along the yard.
     *
     * TURN AT IT, DO NOT GO ROUND IT. The old line climbed the INSIDE of the
     * flue, which is a brown tube. The first re-cut climbed the outside, the
     * second circled it, the third went behind it; all three put a fifth of
     * the loop on frames with nothing in them. Two reasons, and both are
     * about this site rather than about splines. A camera that looks where
     * the line goes cannot look at the thing it is orbiting: the thing sits
     * 90 degrees off the heading the whole way round and the lens is 44.
     * And the pad west and north of the works is bare ground inside a seven
     * metre wall, so a leg that crosses it is a leg with nothing to point
     * at. So the stack gets the approach, which is head on and fills the
     * frame, and the loop turns there and stays on the side the buildings
     * are.
     */
    { x: -44, y: 8, z: 8 },
    /* Back east along the yard side, climbing gently, with the length of
     * the hall to the right of the shot the whole way. */
    { x: -34, y: 12, z: 13 },
    { x: -16, y: 15, z: 14 },
    { x: 2, y: 18, z: 12 },
    { x: 20, y: 19, z: 8 },
    /* And out past the silos, which stand 16, 22 and 28, taking the tall
     * one close enough that it reads as a silo rather than as a mark on the
     * horizon. */
    { x: 30, y: 17, z: 18 },
    { x: 44, y: 15, z: 24 },
    { x: 52, y: 15, z: 32 },
  ];
  void world;
  return pts.map((p) => {
    const floor = groundHeight(p.x, p.z);
    return { x: p.x, y: Math.max(p.y, floor + 2.8), z: p.z };
  });
}
