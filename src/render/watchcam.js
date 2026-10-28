/*
 * watchcam.js: the camera that rides behind another pilot's quad in a room.
 *
 * A pilot in a room can stop and watch somebody else fly: their own quad
 * waits where they left it, paused, and the camera leaves their goggles,
 * flies over to the other pilot's quad and settles in behind it, the way a
 * spotter at the field follows a friend's line. Changing pilot flies it
 * across again, and coming back flies it home into the goggles, so the
 * pilot always sees where they are being taken rather than being cut
 * there. The game's pause, the room's controls and who is watched are
 * src/net/together.js; this file is only where the camera is, frame by
 * frame, and it is render only: nothing here reaches the physics, and it
 * runs on the wall clock because the plant is paused while it does.
 *
 * BEHIND THE QUAD, NOT BEHIND THE NOSE. A chase camera that sat behind the
 * nose would swing right round the quad on every flip and every roll, and
 * an FPV quad flips. So the camera follows the quad's HEADING over the
 * ground, which is where it is going when it is going anywhere (its speed
 * across the ground, measured from the poses) and where its nose points
 * when it is hovering, blended between the two by speed, and turned
 * towards smoothly. A flip at speed leaves the camera where it was; a
 * pilot turning a corner takes it round the corner with them. The rig
 * itself is rigid in position, so a quad at 30 m/s is still the same size
 * on the screen: only the heading is smoothed.
 *
 * THE BOOM SHORTENS AGAINST A WALL. Behind a quad flying along a wall, or
 * under a ceiling in a house, the camera's place can be inside the solid.
 * The boom from the quad back to the camera is walked a step at a time
 * against the map's colliders and stops short of the first one, coming in
 * at once and going back out slowly, as a game's spring arm does. About
 * twenty gap queries a frame, against the same grid the craft's own
 * contact uses: a few microseconds.
 *
 * THE FLIGHT BETWEEN is a curve lifted over the straight line, higher the
 * further it goes, eased in and out, with the camera turning from where it
 * was looking to look at the quad it is flying to. It aims at the live
 * chase pose, so a quad that keeps flying is still caught. Back home the
 * same curve ends exactly on the goggles' own pose and lens, so the cut
 * into flight is invisible.
 *
 * THE OVERVIEW rides the same flight. Given a free rig instead of a quad
 * (src/render/overviewcam.js, the owner's ask of 28 October 2026), the
 * camera flies out of the goggles, or across from behind a quad, to the
 * rig's pose and then sits on it, and home again on the same curve. The
 * rig moves itself; this file only carries the camera to it and back.
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

/* The lens the chase is seen through, in degrees: the replay's chase and
 * the career's, so every third person view in the game is the same lens. */
export const CHASE_FOV = 70;

/*
 * The rig, in world metres. One size for both rooms: a whoop room's map is
 * built MICRO_SCALE times life size, so its whoop is drawn as big as a five
 * inch (src/render/roomcraft.js), and the camera stands as far back from
 * either. 1.3 back and 0.45 up puts the quad a third of the way down from
 * the middle of the frame with the way ahead above it, which is the picture
 * a pilot reads a line from. 2.2 back, the first try, left the quad sixty
 * pixels wide at 1280: a speck to follow rather than a quad to watch.
 */
const BACK = 1.3;
const UP = 0.45;
const AHEAD = 1.4;
const LOOK_UP = 0.12;
/* The boom never comes in closer than this, a wall or not. */
const BOOM_MIN = 0.45;
const BOOM_STEP = 0.1;
/* How far from a solid the camera stays. */
const BOOM_CLEAR = 0.16;
const BOOM_OUT_MS = 450;
/* Over the ground and the decks. */
const FLOOR_CLEAR = 0.3;

/* Ground speed, m/s, under which the nose says where the quad is going and
 * over which its travel does. */
const SLOW = 1.5;
const FAST = 5;
const TURN_MS = 260;
const SPEED_MS = 140;
/* A pose further than this from the last in one frame is a teleport: a
 * reset to the start, or the first pose after a gap. The rig is put down
 * on it rather than flown there. */
const JUMP_M = 12;

/* The flight between: a short hop near, a longer flight far. */
const TRAVEL_BASE_MS = 700;
const TRAVEL_MS_PER_ROOT_M = 260;
const TRAVEL_MIN_MS = 900;
const TRAVEL_MAX_MS = 2400;
/* The curve's control point, over the middle of the straight line. A
 * quadratic curve reaches half its control's height, so the top of the
 * flight is 0.5 m plus 0.3 of the distance over the line, at most 25 m:
 * over the pines of a hop across Bardwell's field, where the first try,
 * at a quarter of this, flew through a canopy. */
const LIFT_BASE = 1;
const LIFT_PER_M = 0.6;
const LIFT_MAX = 50;

export const PHASE_OFF = '';
export const PHASE_GOING = 'going';
export const PHASE_RIDING = 'riding';
export const PHASE_LEAVING = 'leaving';
export const PHASE_HOME = 'home';

function clamp01(x) {
  return x < 0 ? 0 : (x > 1 ? 1 : x);
}

function easeInOut(u) {
  return u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2;
}

function easeOut(u) {
  return 1 - (1 - u) * (1 - u);
}

function smooth(a, b, x) {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
}

export class WatchCam {
  constructor() {
    this.phase = PHASE_OFF;
    this.t0 = 0;
    this.dur = 0;
    this.lift = 0;
    this.from = new THREE.Vector3();
    this.fromQuat = new THREE.Quaternion();
    this.fromFov = CHASE_FOV;
    /* A free rig to sit on instead of a quad to chase: { pos, quat, fov },
     * or null. */
    this.rig = null;
    /*
     * How big the quad is drawn, as a multiple of the size every length of
     * the rig above was chosen for. 1 in every pairing that flew before the
     * quad picker (2026-10-28); a five inch in a house built 3.5 times life
     * size is drawn 3.5 times larger, and a whoop in the town 3.43 times
     * smaller, so the rig stands that much further back or nearer and the
     * picture is the same one (src/main.js sets it, simLenToWorld(1)).
     */
    this.size = 1;
    /* The chase rig. */
    this.seeded = false;
    this.atMs = -1;
    this.heading = 0;
    this.boom = BACK;
    this.last = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.want = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.wantQuat = new THREE.Quaternion();
    /* Scratch. */
    this.t = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.nose = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.mid = new THREE.Vector3();
    this.homeLook = new THREE.Vector3();
    this.p = new THREE.Vector3();
    this.aim = new THREE.Quaternion();
    this.m = new THREE.Matrix4();
    this.yUp = new THREE.Vector3(0, 1, 0);
  }

  get on() {
    return this.phase !== PHASE_OFF;
  }

  /* Sit on a free rig (the overview's) rather than behind a quad, or null
   * to chase again. The next go() flies to whichever it is. */
  free(rig) {
    this.rig = rig || null;
    this.seeded = false;
  }

  /* From wherever the camera is now to behind a quad: the first pilot
   * watched, and every change of pilot after. */
  go(camera, nowMs) {
    this.snap(camera);
    this.phase = PHASE_GOING;
    this.t0 = nowMs;
    /* Worked out on the first frame the quad is seen, from how far it is. */
    this.dur = 0;
    this.seeded = false;
  }

  /* Back to the goggles. */
  leave(camera, nowMs) {
    if (this.phase === PHASE_OFF) {
      return;
    }
    this.snap(camera);
    this.phase = PHASE_LEAVING;
    this.t0 = nowMs;
    this.dur = 0;
  }

  stop() {
    this.phase = PHASE_OFF;
    this.seeded = false;
  }

  snap(camera) {
    this.from.copy(camera.position);
    this.fromQuat.copy(camera.quaternion);
    this.fromFov = camera.fov;
  }

  travelMs(d) {
    const ms = TRAVEL_BASE_MS + TRAVEL_MS_PER_ROOT_M * Math.sqrt(d);
    return ms < TRAVEL_MIN_MS ? TRAVEL_MIN_MS : (ms > TRAVEL_MAX_MS ? TRAVEL_MAX_MS : ms);
  }

  /*
   * Where the chase camera wants to be behind the pose this frame: want,
   * look and wantQuat. world: { floor(x, z, y), gap(x, y, z) }, the map's
   * ground under a point and its distance to the nearest solid.
   */
  chase(pose, nowMs, world) {
    const T = this.t.set(pose.px, pose.py, pose.pz);
    this.q.set(pose.qx, pose.qy, pose.qz, pose.qw);
    const dt = this.atMs < 0 ? 0 : Math.min(100, Math.max(0, nowMs - this.atMs));
    this.atMs = nowMs;
    const nose = this.nose.set(0, 0, -1).applyQuaternion(this.q);
    const nl = Math.hypot(nose.x, nose.z);
    const k = this.size;
    if (!this.seeded || T.distanceToSquared(this.last) > JUMP_M * JUMP_M * k * k) {
      this.seeded = true;
      this.vel.set(0, 0, 0);
      this.boom = BACK * k;
      if (nl > 0.05) {
        this.heading = Math.atan2(nose.x, nose.z);
      }
    } else if (dt > 0) {
      const e = 1 - Math.exp(-dt / SPEED_MS);
      const inv = 1000 / dt;
      this.vel.x += ((T.x - this.last.x) * inv - this.vel.x) * e;
      this.vel.y += ((T.y - this.last.y) * inv - this.vel.y) * e;
      this.vel.z += ((T.z - this.last.z) * inv - this.vel.z) * e;
    }
    this.last.copy(T);
    /* The heading wanted: the nose's over the ground while hovering, the
     * travel's once moving, and none at all from a nose pointing straight
     * up or down with no travel, which keeps the heading it had. */
    const speed = Math.hypot(this.vel.x, this.vel.z) / k;
    const w = smooth(SLOW, FAST, speed);
    let hx = 0;
    let hz = 0;
    if (nl > 0.2) {
      hx += (nose.x / nl) * (1 - w);
      hz += (nose.z / nl) * (1 - w);
    }
    if (speed > 0.3) {
      hx += (this.vel.x / (speed * k)) * w;
      hz += (this.vel.z / (speed * k)) * w;
    }
    if (hx * hx + hz * hz > 0.01 && dt > 0) {
      let d = Math.atan2(hx, hz) - this.heading;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.heading += d * (1 - Math.exp(-dt / TURN_MS));
    }
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    /* The boom, walked out from the quad until it meets a solid. */
    const dir = this.dir.set(-fx * BACK, UP, -fz * BACK);
    const full = dir.length() * k;
    dir.multiplyScalar(k / full);
    let reach = full;
    if (world && world.gap) {
      const min = BOOM_MIN * k;
      const step = BOOM_STEP * k;
      for (let s = min; s <= full; s += step) {
        if (world.gap(T.x + dir.x * s, T.y + dir.y * s, T.z + dir.z * s) < BOOM_CLEAR * k) {
          reach = s - step > min ? s - step : min;
          break;
        }
      }
    }
    if (reach < this.boom || dt === 0) {
      this.boom = reach;
    } else {
      this.boom += (reach - this.boom) * (1 - Math.exp(-dt / BOOM_OUT_MS));
    }
    this.want.copy(T).addScaledVector(dir, this.boom);
    if (world && world.floor) {
      const floor = world.floor(this.want.x, this.want.z, this.want.y) + FLOOR_CLEAR * k;
      if (this.want.y < floor) {
        this.want.y = floor;
      }
    }
    this.look.set(T.x + fx * AHEAD * k, T.y + LOOK_UP * k, T.z + fz * AHEAD * k);
    this.aimAt(this.want, this.look, this.wantQuat);
  }

  aimAt(from, at, out) {
    if (from.distanceToSquared(at) < 1e-8) {
      return out;
    }
    this.m.lookAt(from, at, this.yUp);
    return out.setFromRotationMatrix(this.m);
  }

  /*
   * One frame. pose: the watched quad's { px, py, pz, qx, qy, qz, qw, cut }
   * in scene world metres, or null while it has none to show. home: the
   * goggles, { pos, quat, fov }, for the way back. Poses the camera and
   * returns the phase: PHASE_HOME on the frame the camera reaches the
   * goggles, after which it is off.
   */
  frame(camera, pose, nowMs, world, home) {
    if (this.phase === PHASE_OFF) {
      return PHASE_OFF;
    }
    const rig = this.rig;
    if (rig) {
      this.want.copy(rig.pos);
      this.wantQuat.copy(rig.quat);
      this.p.set(0, 0, -1).applyQuaternion(rig.quat);
      this.look.copy(rig.pos).addScaledVector(this.p, 10);
      this.seeded = true;
    } else if (pose && !pose.cut) {
      this.chase(pose, nowMs, world);
    }
    const lens = rig ? rig.fov : CHASE_FOV;
    let fov = lens;
    if (this.phase === PHASE_RIDING) {
      if (this.seeded) {
        camera.position.copy(this.want);
        camera.quaternion.copy(this.wantQuat);
      }
    } else if (this.phase === PHASE_GOING) {
      if (!this.seeded) {
        /* Nothing to fly to yet: hold, and start the clock when there is. */
        this.t0 = nowMs;
        camera.position.copy(this.from);
        camera.quaternion.copy(this.fromQuat);
        fov = this.fromFov;
      } else {
        if (!this.dur) {
          const d = this.from.distanceTo(this.want);
          this.dur = this.travelMs(d);
          this.lift = Math.min(LIFT_MAX, LIFT_BASE + LIFT_PER_M * d);
        }
        const u = clamp01((nowMs - this.t0) / this.dur);
        this.fly(camera, u, this.want, this.look, this.wantQuat);
        fov = this.fromFov + (lens - this.fromFov) * easeInOut(u);
        if (u >= 1) {
          this.phase = PHASE_RIDING;
        }
      }
    } else if (this.phase === PHASE_LEAVING) {
      if (!this.dur) {
        const d = this.from.distanceTo(home.pos);
        this.dur = this.travelMs(d);
        this.lift = Math.min(LIFT_MAX, LIFT_BASE + LIFT_PER_M * d);
      }
      const u = clamp01((nowMs - this.t0) / this.dur);
      /* Looks at the pilot's own quad on the way, a lens length ahead of
       * the goggles, and turns into the goggles' own pose at the end. */
      this.p.set(0, 0, -1).applyQuaternion(home.quat);
      this.homeLook.copy(home.pos).addScaledVector(this.p, 0.6);
      this.fly(camera, u, home.pos, this.homeLook, home.quat);
      fov = this.fromFov + (home.fov - this.fromFov) * easeInOut(u);
      if (u >= 1) {
        camera.position.copy(home.pos);
        camera.quaternion.copy(home.quat);
        camera.fov = home.fov;
        camera.updateProjectionMatrix();
        this.stop();
        return PHASE_HOME;
      }
    }
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    return this.phase;
  }

  /* Along the lifted curve from where the flight began to `to`, looking at
   * `at` on the way and turning into `toQuat` as it lands. */
  fly(camera, u, to, at, toQuat) {
    const e = easeInOut(u);
    const a = 1 - e;
    this.mid.copy(this.from).add(to).multiplyScalar(0.5);
    this.mid.y += this.lift;
    camera.position.set(
      a * a * this.from.x + 2 * a * e * this.mid.x + e * e * to.x,
      a * a * this.from.y + 2 * a * e * this.mid.y + e * e * to.y,
      a * a * this.from.z + 2 * a * e * this.mid.z + e * e * to.z,
    );
    /* From the pose it left in, turned to look where it is going within the
     * first third, then settled onto the pose it lands in. */
    this.aimAt(camera.position, at, this.aim);
    this.q.copy(this.fromQuat).slerp(this.aim, easeOut(clamp01(u / 0.35)));
    this.q.slerp(toQuat, smooth(0.6, 1, u));
    camera.quaternion.copy(this.q);
  }
}
