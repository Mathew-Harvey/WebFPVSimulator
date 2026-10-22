/*
 * geometry.js: the arithmetic a lesson needs to judge a flight.
 *
 * Pure functions on plain {x, y, z} objects, no THREE and no DOM, so the
 * same code judges a lesson in the shell and in the Node flight rig that
 * proves every lesson can be flown (tests/career-rig.test.js).
 *
 * TWO FRAMES. A lesson is authored in the document frame every map in the
 * game uses: metres, x east, y north, z up, origin at the plot's south west
 * corner, yaw counter clockwise from east (src/maps/built/place.js). A flight
 * is judged in the world frame the shell renders in: x east, y up, z south,
 * origin at the plot's middle. docToWorld is place.js's own mapping, restated
 * so this file imports nothing. Rendering only ever reads the world frame,
 * so nothing here crosses the physics boundary in src/render/frame.js.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

export const DEG = Math.PI / 180;

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const scale = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a) => Math.sqrt(dot(a, a));
export const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/* The document frame to the world frame, as src/maps/built/place.js maps it. */
export function docToWorld(W, D, x, y, z = 0) {
  return v3(x - W / 2, z, -(y - D / 2));
}

/* A document yaw (counter clockwise from east) as a horizontal world
 * direction. East is +x; north is -z. */
export function yawDir(yaw) {
  return v3(Math.cos(yaw), 0, -Math.sin(yaw));
}

/* The heading a world direction points along, as a document yaw. */
export function headingOf(dir) {
  return Math.atan2(-dir.z, dir.x);
}

/* The signed difference a - b, wrapped into (-pi, pi]. */
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) {
    d -= 2 * Math.PI;
  }
  while (d <= -Math.PI) {
    d += 2 * Math.PI;
  }
  return d;
}

/*
 * Does the segment a to b pass through the disc at `c` with unit normal `n`
 * and radius `r`? Returns 0 for no, +1 for through along the normal, -1 for
 * through against it. The segment is a frame's travel, so a fast craft
 * cannot tunnel a ring between two frames, which is how race.js judges a
 * gate and for the same reason.
 */
export function crossesDisc(a, b, c, n, r) {
  const da = dot(sub(a, c), n);
  const db = dot(sub(b, c), n);
  if ((da > 0 && db > 0) || (da < 0 && db < 0) || da === db) {
    return 0;
  }
  const t = da / (da - db);
  const p = add(a, scale(sub(b, a), t));
  const off = sub(p, c);
  /* Distance from the centre, measured in the disc's own plane. */
  const along = dot(off, n);
  const inPlane = sub(off, scale(n, along));
  return len(inPlane) <= r ? (db > da ? 1 : -1) : 0;
}

/*
 * Zones, all in the world frame.
 *   box       { kind:'box', c:{x,y,z}, hx, hy, hz }, axis aligned
 *   cylinder  { kind:'cylinder', c:{x,z}, r, y0, y1 }
 *   band      { kind:'band', lo, hi }, height above the ground
 *   any       { kind:'any' }
 */
export function inZone(zone, pos, height) {
  if (!zone || zone.kind === 'any') {
    return true;
  }
  if (zone.kind === 'box') {
    return Math.abs(pos.x - zone.c.x) <= zone.hx
      && Math.abs(pos.y - zone.c.y) <= zone.hy
      && Math.abs(pos.z - zone.c.z) <= zone.hz;
  }
  if (zone.kind === 'cylinder') {
    const dx = pos.x - zone.c.x;
    const dz = pos.z - zone.c.z;
    return dx * dx + dz * dz <= zone.r * zone.r && pos.y >= zone.y0 && pos.y <= zone.y1;
  }
  if (zone.kind === 'band') {
    return height >= zone.lo && height <= zone.hi;
  }
  return false;
}

/* The centre a zone's marker points at, for the HUD's arrow. */
export function zoneCentre(zone) {
  if (!zone) {
    return null;
  }
  if (zone.kind === 'box') {
    return zone.c;
  }
  if (zone.kind === 'cylinder') {
    return v3(zone.c.x, (zone.y0 + zone.y1) / 2, zone.c.z);
  }
  return null;
}

/*
 * The craft's attitude as angles a pilot would name, from its body axes in
 * the world frame: fwd is the nose, up is the top plate.
 *
 *   pitch   nose above the horizon, degrees: positive nose up
 *   roll    bank, degrees: positive right wing down, 180 inverted
 *   tilt    how far the top plate leans from straight up, degrees
 */
export function attitude(fwd, up) {
  /* right = fwd x up, the craft's right wing in the world frame. */
  const right = v3(
    fwd.y * up.z - fwd.z * up.y,
    fwd.z * up.x - fwd.x * up.z,
    fwd.x * up.y - fwd.y * up.x,
  );
  return {
    pitch: Math.asin(clamp(fwd.y, -1, 1)) / DEG,
    roll: Math.atan2(-right.y, up.y) / DEG,
    tilt: Math.acos(clamp(up.y, -1, 1)) / DEG,
    right,
  };
}
