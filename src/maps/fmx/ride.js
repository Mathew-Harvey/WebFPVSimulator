/*
 * ride.js: what a Shiroyama FMX bike does on top of the pose the physics
 * module gave it. Ridgeline MX's own (src/maps/moto/ride.js) read through
 * this map's profile: the same two jobs, the same scratch, and only the
 * ground and the air are this map's.
 * Pure: no Three.js, so the Node check flies the same numbers the browser
 * draws and the camera judge reads.
 *
 * The module hands a bike's x, z, heading, speed, distance driven, bend and
 * slip, all on a flat line (src/game/plantworld.js readVehicles). ./profile.js
 * says what a bike at a given place round the lap does over the ramps and
 * in the air; this joins the two through ./traffic.js's one lane, the loop.
 *
 * `rideOf` is the bike's body: how high, the nose, the tail, the lean.
 * `posed` is the same for the judge: a copy of the poses with every bike
 * where it is DRAWN, up in the air and with its tail out, so a camera that
 * frames a bike that is airborne frames it, and a tail that is out reads as
 * the slide it is. One scratch array, written in place.
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

import { rideAt } from './profile.js';

/* sin and cos of a small angle, rad, without the engine's trigonometry:
 * good to a part in a thousand out to a radian and a half. */
function sc(t, out) {
  const t2 = t * t;
  out.s = t * (1 - t2 / 6 * (1 - t2 / 20 * (1 - t2 / 42)));
  out.c = 1 - t2 / 2 * (1 - t2 / 12 * (1 - t2 / 30));
}
const SC = { s: 0, c: 1 };

export function makeRider(fmx) {
  const byslot = new Map();
  for (const b of fmx.bikes) {
    byslot.set(b.slot, { bike: b, lane: fmx.lanes[b.lane] });
  }
  const scratch = [];
  const ride = { dy: 0, pitch: 0, yaw: 0, roll: 0, air: 0 };

  /* One bike's ride at a pose, into `out`. `lap` is returned. */
  function rideOf(slot, pose, out) {
    const e = byslot.get(slot);
    if (!e || !pose || !pose.on) {
      out.dy = 0;
      out.pitch = 0;
      out.yaw = 0;
      out.roll = 0;
      out.air = 0;
      return out;
    }
    const L = e.lane.length;
    const lap = Math.floor(pose.distance / L);
    const s = e.lane.toCentre(pose.distance);
    return rideAt(slot, lap, s, pose.speed, pose.curvature || 0, out);
  }

  function posed(poses) {
    for (let m = 0; m < poses.length; m += 1) {
      const p = poses[m];
      let q = scratch[m];
      if (!q) {
        q = {
          on: false, x: 0, y: 0, z: 0, hx: 0, hz: 0, tx: 0, tz: 0, vx: 0, vy: 0, vz: 0, speed: 0, distance: 0, yawRate: 0, curvature: 0, slip: 0,
        };
        scratch[m] = q;
      }
      q.on = p.on;
      q.x = p.x;
      q.y = p.y;
      q.z = p.z;
      q.hx = p.hx;
      q.hz = p.hz;
      q.tx = p.tx;
      q.tz = p.tz;
      q.vx = p.vx;
      q.vy = p.vy;
      q.vz = p.vz;
      q.speed = p.speed;
      q.distance = p.distance;
      q.yawRate = p.yawRate;
      q.curvature = p.curvature;
      q.slip = p.slip;
      if (!p.on || !byslot.has(m)) {
        continue;
      }
      rideOf(m, p, ride);
      q.y = p.y + ride.dy;
      if (ride.yaw !== 0) {
        /* Left of the heading (hz, -hx); turned toward it by `yaw`. */
        sc(ride.yaw, SC);
        q.hx = p.hx * SC.c + p.hz * SC.s;
        q.hz = p.hz * SC.c - p.hx * SC.s;
        sc(ride.yaw * 0.5, SC);
        q.slip = p.slip + SC.s / SC.c;
      }
    }
    return scratch;
  }

  return { rideOf, posed, byslot };
}
