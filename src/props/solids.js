/*
 * solids.js: an asset's parts, placed in the world, as the solids the
 * physics will hold. Pure arithmetic, no Three.js, no JS trigonometry.
 *
 * The world is src/game/collide.js's Colliders, in Three.js world metres
 * with y up, which src/game/plantworld.js then hands to the physics module
 * through the one conversion in src/render/frame.js. So this file speaks
 * Three.js's axes, and so does every layout in src/props.
 *
 * TURNING A PART.
 *
 *   capsule   both ends turned about +y by the heading, with the sine and
 *             cosine of ./trig.js, which are the same bits in every engine
 *   box       only ever turned by a quarter turn, which is exact: the
 *             extents swap and no sine is taken. An asset that has boxes
 *             is 'quarter' in ./types.js and its heading is snapped before
 *             it gets here. A box met under any other heading is a layout
 *             bug; it is placed as the box that holds the turned one, which
 *             is the conservative answer, and counted so a check can fail.
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

import { sincos, quarterTurns, quarterSinCos, quarterYaw } from './trig.js';

/*
 * The heading an element is actually placed at: its own for an asset that
 * turns freely, the nearest quarter turn for one that has boxes. The mesh
 * and the solids both read this, so a building the document says is at 40
 * degrees is drawn and solid at 0, never drawn at 40 and solid at 0.
 */
export function placedYaw(turns, yaw) {
  if (turns === 'quarter') {
    return quarterYaw(quarterTurns(yaw));
  }
  return Number.isFinite(yaw) ? yaw : 0;
}

const SC = { s: 0, c: 1 };

/*
 * Place `parts` at world (x, y, z) with heading `yaw`, for an asset that
 * `turns` as it says. Appends to `out` and returns it. Each solid is
 *
 *   { kind, name, box: [x0, y0, z0, x1, y1, z1] }
 *   { kind, name, cap: [ax, ay, az, bx, by, bz, r] }
 *
 * `stats.inflated` counts boxes met under a heading that is not a quarter
 * turn.
 */
export function placeSolids(parts, x, y, z, yaw, turns, out = [], stats = null) {
  let s;
  let c;
  let exact;
  if (turns === 'quarter') {
    quarterSinCos(quarterTurns(yaw), SC);
    exact = true;
  } else {
    sincos(Number.isFinite(yaw) ? yaw : 0, SC);
    /* A heading that happens to be a quarter turn is exact either way, but
     * only if the sine came out exact, which for 1.570796 it does not. */
    exact = SC.s === 0 || SC.c === 0;
  }
  s = SC.s;
  c = SC.c;
  for (const p of parts) {
    if (!p.solid) {
      continue;
    }
    if (p.t === 'cap') {
      out.push({
        kind: p.kind,
        name: p.name,
        cap: [
          x + p.a[0] * c + p.a[2] * s, y + p.a[1], z - p.a[0] * s + p.a[2] * c,
          x + p.b[0] * c + p.b[2] * s, y + p.b[1], z - p.b[0] * s + p.b[2] * c,
          p.r,
        ],
      });
      continue;
    }
    if (!exact && stats) {
      stats.inflated = (stats.inflated || 0) + 1;
    }
    /* The four plan corners of the box, turned, and the box that holds
     * them. Under a quarter turn that is the turned box exactly. */
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const lx of [p.lo[0], p.hi[0]]) {
      for (const lz of [p.lo[2], p.hi[2]]) {
        const wx = x + lx * c + lz * s;
        const wz = z - lx * s + lz * c;
        if (wx < x0) x0 = wx;
        if (wx > x1) x1 = wx;
        if (wz < z0) z0 = wz;
        if (wz > z1) z1 = wz;
      }
    }
    out.push({ kind: p.kind, name: p.name, box: [x0, y + p.lo[1], z0, x1, y + p.hi[1], z1] });
  }
  return out;
}

/* Put solids into a src/game/collide.js Colliders. Returns how many. */
export function addSolids(colliders, solids) {
  for (const o of solids) {
    if (o.box) {
      const b = o.box;
      colliders.addBox(o.kind, b[0], b[1], b[2], b[3], b[4], b[5]);
    } else {
      const a = o.cap;
      colliders.add(o.kind, a[0], a[1], a[2], a[3], a[4], a[5], a[6]);
    }
  }
  return solids.length;
}
