/*
 * logosurface.js: which surface a sponsor's mark is on, in a built map.
 *
 * A mark in a built map is a "ground logo" element: a footprint with a
 * centre, a heading and a size, placed in the builder. The sim has never
 * known what is under it. This decides, once, when the map loads, and the
 * answer picks the look src/art/sponsorpaint.js paints:
 *
 *   a billboard near it     the mark is framed across the billboard's face
 *   a bando near it         graffiti on the nearest wall of the bando
 *   a building near it      a fascia sign on the nearest wall
 *   otherwise, on grass     sprayed on the turf, like a pitch sponsor
 *   otherwise               today's flat paint (tarmac, concrete, dirt)
 *
 * THE RULE, plainly: "near" is the mark's centre being inside the
 * structure's plan footprint (planBounds, in the structure's own frame) or
 * within a reach of it, 4 m for a billboard and 2.5 m for a building or a
 * bando. The nearest structure wins, and a billboard beats a bando beats a
 * building on a tie. The reach exists because an author places a ground
 * decal where it can be seen from above: beside a wall, not under the slab,
 * and the mark would otherwise stay on a ground nobody sees. A mark an
 * author wants flat on the paving next to a building must be put further
 * than the reach from it.
 *
 * A wall is the footprint's rectangle: a bando's walls are not always
 * there, and a sign on a bay that is open air floats at the bounds. That is
 * the simplest honest rule and it is why the mark is sized to the wall and
 * not the other way round.
 *
 * Pure arithmetic over the placed items: no Three.js, no canvas, so a Node
 * check can drive it.
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

import { planBounds } from '../../props/catalog.js';
import { approxHeight } from '../../props/types.js';
import { billboardFace } from '../../props/street.js';
import { sincos } from '../../props/trig.js';

const REACH = { billboard: 4, bando: 2.5, building: 2.5 };
const PRIORITY = { billboard: 0, bando: 1, building: 2 };
const HALF_PI = Math.PI / 2;
/* How far a mark stands off the wall it is on. Paint, not geometry. */
const OFF = 0.012;
/* Keep a mark this far inside the ends of its wall. */
const EDGE = 0.4;
const S = { s: 0, c: 1 };

/* A world point in an item's own frame (the inverse of the map used in
 * ground.js: world = item + lx * (c, -s) + lz * (s, c)). */
function toLocal(it, x, z) {
  sincos(it.yaw, S);
  const dx = x - it.x;
  const dz = z - it.z;
  return [dx * S.c - dz * S.s, dx * S.s + dz * S.c];
}

function toWorld(it, lx, lz) {
  sincos(it.yaw, S);
  return [it.x + lx * S.c + lz * S.s, it.z - lx * S.s + lz * S.c];
}

function clampTo(v, lo, hi) {
  return hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
}

/*
 * decal   a placed groundLogo item ({ el, x, z, yaw })
 * returns { kind, ... }: kind 'ground' or 'sprayed' (stay on the ground, the
 * ground plane the caller already makes), or 'billboard', 'sign', 'graffiti'
 * with { x, y, z, yaw, w, h }: where the plane's centre stands in the world,
 * its heading (its +z is the outward normal), and its size in metres.
 */
export function surfaceFor(placed, decal, groundId) {
  const dw = Math.max(0.1, decal.el.dims.width);
  const dh = Math.max(0.1, decal.el.dims.depth);
  let best = null;
  for (const it of placed.items) {
    const type = it.el.type;
    if (!(type in REACH)) {
      continue;
    }
    const b = planBounds(it.parts);
    const [lx, lz] = toLocal(it, decal.x, decal.z);
    const ox = Math.max(b.x0 - lx, 0, lx - b.x1);
    const oz = Math.max(b.z0 - lz, 0, lz - b.z1);
    const dist = Math.sqrt(ox * ox + oz * oz);
    if (dist > REACH[type]) {
      continue;
    }
    if (!best || dist < best.dist - 1e-6
      || (Math.abs(dist - best.dist) <= 1e-6 && PRIORITY[type] < PRIORITY[best.it.el.type])) {
      best = { it, b, lx, lz, dist };
    }
  }
  if (!best) {
    return { kind: groundId === 'grass' ? 'sprayed' : 'ground' };
  }
  const { it, b, lx, lz } = best;
  const type = it.el.type;
  if (type === 'billboard') {
    const f = billboardFace(it.el);
    const [x, z] = toWorld(it, f.x + OFF * 0.5, f.z);
    return { kind: 'billboard', x, y: f.y, z, yaw: it.yaw + HALF_PI, w: f.w, h: f.h };
  }
  if (type === 'bando') {
    return onBandoWall(it, lx, lz, dw, dh, groundId);
  }
  /* The nearest of the four sides of the footprint. */
  const sides = [
    { d: Math.abs(lx - b.x1), nx: 1, nz: 0, yaw: HALF_PI },
    { d: Math.abs(lx - b.x0), nx: -1, nz: 0, yaw: -HALF_PI },
    { d: Math.abs(lz - b.z1), nx: 0, nz: 1, yaw: 0 },
    { d: Math.abs(lz - b.z0), nx: 0, nz: -1, yaw: Math.PI },
  ];
  let side = sides[0];
  for (const c of sides) {
    if (c.d < side.d - 1e-6) {
      side = c;
    }
  }
  const alongX = side.nz !== 0;
  const lo = (alongX ? b.x0 : b.z0) + EDGE;
  const hi = (alongX ? b.x1 : b.z1) - EDGE;
  const run = Math.max(1, hi - lo);
  const height = approxHeight(type, it.el.dims, it.el.style);
  /* A sign hangs over the ground floor's doors; graffiti is sprayed at
   * arm's reach, low on the wall. */
  const bottom = 2.6;
  const room = Math.max(0.8, Math.min(height - bottom - 0.5, 2.4));
  const k = Math.min(1, run / dw, room / dh);
  const w = dw * k;
  const h = dh * k;
  const along = clampTo(alongX ? lx : lz, lo + w / 2, hi - w / 2);
  const y = bottom + h / 2;
  const [x, z] = alongX
    ? toWorld(it, along, side.nz > 0 ? b.z1 + OFF : b.z0 - OFF)
    : toWorld(it, side.nx > 0 ? b.x1 + OFF : b.x0 - OFF, along);
  return { kind: 'sign', x, y, z, yaw: it.yaw + side.yaw, w, h };
}

/*
 * GRAFFITI goes on a wall that is there. A bando's footprint is mostly air:
 * whole bays are open, so a mark put on the footprint's edge hangs in the
 * sky. Its parts say which walls the wreck still has (the boxes named
 * 'wall', thin in one axis), so the mark goes on the nearest of those, on
 * the face turned to it, as high as arm's reach. No wall within WALL_REACH
 * of the mark and it stays on the ground, which is what a mark beside a
 * bay with nothing to paint on honestly is.
 */
const WALL_REACH = 5;
const MIN_WALL = 1.6;

function onBandoWall(it, lx, lz, dw, dh, groundId) {
  let best = null;
  for (const q of it.parts) {
    if (q.t !== 'box' || q.name !== 'wall') {
      continue;
    }
    const sx = q.hi[0] - q.lo[0];
    const sz = q.hi[2] - q.lo[2];
    const tall = q.hi[1] - q.lo[1];
    const alongX = sx > sz;
    const len = alongX ? sx : sz;
    if (Math.min(sx, sz) > 0.8 || len < MIN_WALL || tall < 1.8) {
      continue;
    }
    const ox = Math.max(q.lo[0] - lx, 0, lx - q.hi[0]);
    const oz = Math.max(q.lo[2] - lz, 0, lz - q.hi[2]);
    const dist = Math.sqrt(ox * ox + oz * oz);
    /* The nearest, with a longer run worth a little extra distance: a
     * two metre pier beats a sliver beside it. */
    const score = dist - 0.4 * len;
    if (dist <= WALL_REACH && (!best || score < best.score)) {
      best = { q, dist, score, alongX, len, tall };
    }
  }
  if (!best) {
    return { kind: groundId === 'grass' ? 'sprayed' : 'ground' };
  }
  const { q, alongX, len, tall } = best;
  /* The face turned to the mark. */
  const mid = alongX ? (q.lo[2] + q.hi[2]) / 2 : (q.lo[0] + q.hi[0]) / 2;
  const at = alongX ? lz : lx;
  const positive = at >= mid;
  const lo = (alongX ? q.lo[0] : q.lo[2]) + 0.1;
  const hi = (alongX ? q.hi[0] : q.hi[2]) - 0.1;
  const bottom = q.lo[1] + 0.9;
  const room = Math.max(0.6, Math.min(tall - 1.2, 2.6));
  const k = Math.min(1, Math.max(0.5, len - 0.2) / dw, room / dh);
  const w = dw * k;
  const h = dh * k;
  const along = clampTo(alongX ? lx : lz, lo + w / 2, hi - w / 2);
  const y = bottom + h / 2;
  let x;
  let z;
  let yaw;
  if (alongX) {
    [x, z] = toWorld(it, along, positive ? q.hi[2] + OFF : q.lo[2] - OFF);
    yaw = it.yaw + (positive ? 0 : Math.PI);
  } else {
    [x, z] = toWorld(it, positive ? q.hi[0] + OFF : q.lo[0] - OFF, along);
    yaw = it.yaw + (positive ? HALF_PI : -HALF_PI);
  }
  return { kind: 'graffiti', x, y, z, yaw, w, h };
}
