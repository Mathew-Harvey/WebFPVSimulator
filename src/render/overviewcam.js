/*
 * overviewcam.js: the free camera over the whole field, for watching a
 * room fly.
 *
 * The owner's ask of 28 October 2026: beside the follow camera, an
 * overview, a camera that can zoom out and be moved round the field with
 * WASD and the mouse, to watch a race from above and call it, or to see
 * the whole field at once. The pilot's own flight is paused while it is
 * open, exactly as it is while following somebody (src/net/together.js),
 * so this file is render only and runs on the wall clock: nothing here
 * reaches the physics.
 *
 * A SPECTATOR, NOT A QUAD. The camera never goes under the ground or a
 * deck and stays inside the course's bounds with a margin, but it does
 * not bump into buildings: it is a commentator's eye, and the point of it
 * is to be anywhere. It moves faster the higher it is, so crossing the
 * field from eighty metres up takes the same time as crossing a room from
 * two, and it slows to a stop rather than stopping dead.
 *
 * Its pose is a position, a heading and a tilt, never a roll, so the
 * horizon is always level. Keep in view orbits a picked pilot instead: the
 * same heading and tilt, measured round the quad, at a distance the wheel
 * sets, the quad followed as it flies.
 *
 * The flight out of the goggles and back is the follow camera's own lifted
 * curve (src/render/watchcam.js), aimed at this camera's pose, so the
 * pilot always sees where they are being taken.
 *
 * Allocates nothing per frame.
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

/* The lens, in degrees: narrower than the chase's 70, because a field seen
 * from above through a wide lens is mostly sky at the top and blur at the
 * edges. */
export const OVERVIEW_FOV = 55;

/* Over the floor, the lowest the camera goes, in metres. */
const FLOOR_CLEAR = 1.2;
/* The highest it goes over the course's bounds, and how far outside them. */
const CEILING = 220;
const MARGIN = 60;
/* Speed over the ground, m/s: this much plus this share of the height. */
const SPEED_BASE = 5;
const SPEED_PER_M = 0.9;
const SPEED_MAX = 120;
const FAST = 3;
/* How quickly a move comes up to speed and dies away. */
const EASE_MS = 140;
/* The tilt's range, radians, down from level. */
const TILT_MIN = 0.05;
const TILT_MAX = 1.5;
/* Look: radians per pixel dragged, and per second from a stick. */
const LOOK_PER_PX = 0.0042;
const LOOK_RATE = 1.8;
/* The wheel: each step goes this share of the way to the ground. */
const ZOOM_STEP = 0.16;
/* Keep in view: the orbit's distance, metres. */
const ORBIT_MIN = 3;
const ORBIT_MAX = 160;

function clamp(x, a, b) {
  return x < a ? a : (x > b ? b : x);
}

export class OverviewCam {
  constructor() {
    this.pos = new THREE.Vector3(0, 30, 30);
    this.quat = new THREE.Quaternion();
    this.fov = OVERVIEW_FOV;
    this.heading = 0;
    this.tilt = 0.7;
    this.vel = new THREE.Vector3();
    /* The course's bounds, scene world: minX, maxX, minZ, maxZ, floor. */
    this.bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50, y: 0 };
    /* Keep in view: the pilot's position, and the orbit's distance. */
    this.keep = false;
    this.orbit = 18;
    this.target = new THREE.Vector3();
    /* Scratch. */
    this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.f = new THREE.Vector3();
    this.r = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.w = new THREE.Vector3();
    this.aim();
  }

  /* The quaternion from the heading and the tilt. */
  aim() {
    this.e.set(-this.tilt, this.heading, 0, 'YXZ');
    this.quat.setFromEuler(this.e);
  }

  setBounds(b) {
    this.bounds.minX = b.minX;
    this.bounds.maxX = b.maxX;
    this.bounds.minZ = b.minZ;
    this.bounds.maxZ = b.maxZ;
    this.bounds.y = b.y || 0;
  }

  /*
   * The whole course in frame, from its south side at about forty degrees,
   * the grandstand's view. aspect: the screen's. Clears keep in view.
   */
  whole(aspect = 16 / 9) {
    const b = this.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const hx = Math.max(8, (b.maxX - b.minX) / 2);
    const hz = Math.max(8, (b.maxZ - b.minZ) / 2);
    const half = THREE.MathUtils.degToRad(this.fov / 2);
    /* Far enough back that the width fits across and the depth fits up. */
    const d = Math.max(hx / (Math.tan(half) * Math.min(aspect, 2)), hz * 1.15 / Math.tan(half)) * 1.1;
    this.keep = false;
    this.heading = 0;
    this.tilt = 0.72;
    this.pos.set(cx, b.y + d * Math.sin(this.tilt), cz + d * Math.cos(this.tilt));
    this.vel.set(0, 0, 0);
    this.aim();
  }

  /* Straight down over the middle, high enough for all of it. */
  map(aspect = 16 / 9) {
    const b = this.bounds;
    const hx = Math.max(8, (b.maxX - b.minX) / 2);
    const hz = Math.max(8, (b.maxZ - b.minZ) / 2);
    const half = THREE.MathUtils.degToRad(this.fov / 2);
    const h = Math.max(hz, hx / Math.min(aspect, 2)) / Math.tan(half) * 1.12;
    this.keep = false;
    this.heading = 0;
    this.tilt = TILT_MAX;
    this.pos.set((b.minX + b.maxX) / 2, b.y + h, (b.minZ + b.maxZ) / 2 + h * Math.cos(TILT_MAX));
    this.vel.set(0, 0, 0);
    this.aim();
  }

  /* Orbit a pilot from where the camera is now, at least a few metres off. */
  keepOn(x, y, z) {
    this.keep = true;
    this.target.set(x, y, z);
    this.orbit = clamp(this.pos.distanceTo(this.target), ORBIT_MIN, 40);
    this.vel.set(0, 0, 0);
  }

  release() {
    this.keep = false;
  }

  /*
   * The wheel or a pinch, steps > 0 in. ray: the direction to go, the
   * pointer's ray from the camera, or null for straight ahead. world: the
   * floor under a point, to measure how far there is to go.
   */
  zoom(steps, ray, world) {
    if (this.keep) {
      this.orbit = clamp(this.orbit * (1 - ZOOM_STEP) ** steps, ORBIT_MIN, ORBIT_MAX);
      return;
    }
    const dir = ray || this.f.set(0, 0, -1).applyQuaternion(this.quat);
    const floor = world ? world.floor(this.pos.x, this.pos.z, this.pos.y) : this.bounds.y;
    const up = Math.max(1, this.pos.y - floor);
    /* How far along the ray the ground is, or the height when the ray
     * points at the sky. */
    const reach = dir.y < -0.05 ? up / -dir.y : up;
    const go = clamp(reach * ZOOM_STEP * steps, -reach * 0.5, reach - FLOOR_CLEAR * 2);
    this.pos.addScaledVector(dir, go);
  }

  /*
   * Drag the ground under the pointer: dx, dy in pixels, h the screen's
   * height. The ground moves with the pointer at the distance it is from
   * the camera, as a map does under a finger.
   */
  grab(dx, dy, h, world) {
    if (this.keep) {
      this.look(dx, dy);
      return;
    }
    const floor = world ? world.floor(this.pos.x, this.pos.z, this.pos.y) : this.bounds.y;
    const up = Math.max(2, this.pos.y - floor);
    const dist = up / Math.max(0.2, Math.sin(this.tilt));
    const perPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.fov / 2))) / Math.max(1, h);
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    /* Right on the screen is (c, -s) over the ground and forward is
     * (-s, -c). The ground goes with the pointer, so the camera goes the
     * other way: left for a drag right, forward for a drag down. */
    this.pos.x += -dx * perPx * c - dy * perPx * s;
    this.pos.z += dx * perPx * s - dy * perPx * c;
  }

  /* Turn and tilt: dx, dy in pixels dragged. */
  look(dx, dy) {
    this.heading -= dx * LOOK_PER_PX;
    this.tilt = clamp(this.tilt + dy * LOOK_PER_PX, TILT_MIN, TILT_MAX);
  }

  /*
   * One frame. ctl: { x, z, y, turn, tilt, fast } this frame's held moves,
   * x right, z forward, y up, each -1 to 1, turn and tilt from a stick.
   * target: the pilot kept in view, { x, y, z }, or null. world: { floor }.
   * dtMs: wall clock since the last frame.
   */
  frame(dtMs, ctl, target, world) {
    const dt = Math.min(100, Math.max(0, dtMs)) / 1000;
    if (ctl.turn || ctl.tilt) {
      this.heading -= ctl.turn * LOOK_RATE * dt;
      this.tilt = clamp(this.tilt + ctl.tilt * LOOK_RATE * dt, TILT_MIN, TILT_MAX);
    }
    const floorHere = world ? world.floor(this.pos.x, this.pos.z, this.pos.y) : this.bounds.y;
    if (this.keep && target) {
      this.target.set(target.x, target.y, target.z);
      if (ctl.y) {
        this.orbit = clamp(this.orbit * (1 - ctl.y * dt * 1.5), ORBIT_MIN, ORBIT_MAX);
      }
      this.aim();
      this.f.set(0, 0, -1).applyQuaternion(this.quat);
      this.pos.copy(this.target).addScaledVector(this.f, -this.orbit);
    } else {
      const up = Math.max(0, this.pos.y - floorHere);
      const speed = Math.min(SPEED_MAX, SPEED_BASE + SPEED_PER_M * up) * (ctl.fast ? FAST : 1);
      const s = Math.sin(this.heading);
      const c = Math.cos(this.heading);
      /* Forward over the ground is (-s, -c), right is (c, -s). */
      this.w.set(
        (ctl.x * c - ctl.z * s) * speed,
        ctl.y * speed * 0.7,
        (-ctl.x * s - ctl.z * c) * speed,
      );
      const k = 1 - Math.exp(-dtMs / EASE_MS);
      this.vel.lerp(this.w, k);
      this.pos.addScaledVector(this.vel, dt);
      this.aim();
    }
    this.clampPos(world);
  }

  clampPos(world) {
    const b = this.bounds;
    this.pos.x = clamp(this.pos.x, b.minX - MARGIN, b.maxX + MARGIN);
    this.pos.z = clamp(this.pos.z, b.minZ - MARGIN, b.maxZ + MARGIN);
    const floor = world ? world.floor(this.pos.x, this.pos.z, this.pos.y) : b.y;
    this.pos.y = clamp(this.pos.y, floor + FLOOR_CLEAR, b.y + CEILING);
  }
}
