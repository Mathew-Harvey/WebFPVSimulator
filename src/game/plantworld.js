/*
 * plantworld.js: hand the map's solids to the plant, and keep the plant's
 * idea of where it is in the world up to date.
 *
 * Since 2026-09-24 every wall, roof, gate, tree and the train is resolved
 * inside the physics module (src/native/world.c), at 1 kHz, by the same
 * solver as everything else the plant touches. The shell used to sweep the
 * craft through view.colliders every 4 ms and write the answer back; now it
 * uploads view.colliders once, when a map is adopted, and does nothing else
 * with them on the physics path. See PROGRESS.md for the review that led
 * here and for what the old pass got wrong.
 *
 * THE ONE CONVERSION. The colliders are Three.js world metres, Y up. The
 * plant is Z up. Every position crosses through src/render/frame.js's
 * threePosToSim, the same seam every other position uses, so the basis
 * change still lives in exactly one file. The spawn transform crosses as an
 * origin and a yaw, and the module turns the yaw into a rotation with its own
 * fixed libm: no JS Math.sin or Math.cos reaches the physics.
 *
 * The indices matter. world.c numbers shapes in the order they are added,
 * and this adds them in view.colliders' own order, so a contact the module
 * reports against shape i is view.colliders' collider i, and its kind is
 * kindOf(colliders, i). Movers (the train) have their own numbers.
 *
 * ROADS AND THE CARS ON THEM (Stage D part 2, world.c section 5). A road is
 * uploaded once, and a car on it is a mover the module drives itself: its
 * pose is a pure function of the module's step clock, worked out inside the
 * module with its own arithmetic, so it is the same in every engine and the
 * shell never computes where a car is. The shell does four things:
 *
 *   uploadRoad(sim, points, closed)   once per road, after uploadWorld;
 *                                     returns the road's index (roadInfo
 *                                     says how long the module made it)
 *   addVehicle(sim, m, road, car)     a car in mover slot m (0 to 63; the
 *                                     train's cars use slots too, so a map
 *                                     with both keeps them apart)
 *   removeVehicle(sim, m)             takes it away
 *   setVehicleClock(sim, step)        the LAP clock, simTimeMs, in whole
 *                                     steps: at a run's start, on a seek, and
 *                                     before stepping whenever the lap clock
 *                                     ran on without the module stepping
 *                                     (landed, a turtle wait). The module
 *                                     advances it one a step itself, on the
 *                                     launch stand too, and sim_reset leaves
 *                                     it alone. Setting it every frame to
 *                                     simTimeMs is harmless and is the
 *                                     simplest correct use: it matches
 *                                     pushWorldSolids(simTimeMs + i) for the
 *                                     train, step for step.
 *
 * and reads every car back after a step with readVehicles(sim, poses), into
 * objects from makeVehiclePoses(), in the Three.js frame, to draw. The pose
 * read after sim_step is the one at the step the craft's state is at, which
 * is the clock view.updateAnim(simTimeMs) draws the train at, and the pose
 * the next step's contacts use: the car drawn is the car hit.
 *
 * Lengths cross through frame.js like every position; speeds, accelerations
 * and the drift gain are SI and cross as they are, as the train's velocity
 * does in setMover.
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

import { threePosToSim, threeDirToSim, simPosToThree, simQuatToThree, simLenToWorld } from '../render/frame.js';
import { contactMaterial } from './collide.js';

const A = { x: 0, y: 0, z: 0 };
const B = { x: 0, y: 0, z: 0 };
const V = { x: 0, y: 0, z: 0 };
/* frame.js's sim to Three.js functions write through .set(), as a Vector3 or
 * a Quaternion has it. */
const T3 = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const Q3 = { x: 0, y: 0, z: 0, w: 1, set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } };

/* src/native/world.c WORLD_MAX_MOVERS: the mover slots, the train's and the
 * road vehicles'. */
export const MOVER_SLOTS = 64;
/* src/native/sim_abi.h SIM_VEHICLE_POSE_DOUBLES. */
export const VEHICLE_POSE_DOUBLES = 16;
/* src/native/sim_abi.h SIM_ROAD_INFO_DOUBLES. */
const ROAD_INFO_DOUBLES = 3;

/* The kind of collider i, as the name contactMaterial takes. kindName wants
 * the kind's number, not the collider's. */
export function kindOf(colliders, i) {
  return colliders.kindName(colliders.fkind[i]);
}

function need(sim, name) {
  if (typeof sim.e[name] !== 'function') {
    throw new Error(`sim.wasm does not export ${name}`);
  }
}

/*
 * Upload every collider. Returns the number of shapes. Throws if the module
 * refuses one or cannot file the town, because a world the plant does not
 * have is a world the craft flies through, and that must be loud.
 */
export function uploadWorld(sim, colliders) {
  for (const name of ['sim_world_clear', 'sim_world_box', 'sim_world_capsule', 'sim_world_build']) {
    need(sim, name);
  }
  sim.e.sim_world_clear();
  if (!colliders || !colliders.built) {
    sim.e.sim_world_build();
    return 0;
  }
  const n = colliders.count;
  for (let i = 0; i < n; i += 1) {
    const mat = contactMaterial(kindOf(colliders, i));
    threePosToSim(colliders.fax[i], colliders.fay[i], colliders.faz[i], A);
    threePosToSim(colliders.fbx[i], colliders.fby[i], colliders.fbz[i], B);
    let code;
    if (colliders.fbox[i]) {
      code = sim.e.sim_world_box(
        Math.min(A.x, B.x), Math.min(A.y, B.y), Math.min(A.z, B.z),
        Math.max(A.x, B.x), Math.max(A.y, B.y), Math.max(A.z, B.z),
        mat.e, mat.mu,
      );
    } else {
      /* A radius is a length, and threePosToSim scales lengths the way it
       * scales positions: convert (r, 0, 0) and take its size. */
      threePosToSim(colliders.fr[i], 0, 0, V);
      const r = Math.hypot(V.x, V.y, V.z);
      code = sim.e.sim_world_capsule(A.x, A.y, A.z, B.x, B.y, B.z, r, mat.e, mat.mu);
    }
    if (code !== i) {
      throw new Error(`sim_world: collider ${i} (${kindOf(colliders, i)}) was refused: ${code}`);
    }
  }
  const built = sim.e.sim_world_build();
  if (built !== n) {
    throw new Error(`sim_world_build: ${built} for ${n} colliders`);
  }
  return n;
}

/*
 * Where the plant's origin is: the start point, lifted by the spawn's own
 * offset, facing the start yaw. Must follow every move of the spawn (a map,
 * a restart, a recovery), or the world the plant sees is somewhere else.
 */
export function setWorldFrame(sim, startX, startY, startZ, yaw, spawnAlt) {
  need(sim, 'sim_world_frame');
  threePosToSim(startX, startY, startZ, A);
  const code = sim.e.sim_world_frame(A.x, A.y, A.z + spawnAlt, yaw);
  if (code !== 0) {
    throw new Error(`sim_world_frame: ${code}`);
  }
}

/*
 * Seat one moving box, from its centre and half extents in Three.js metres
 * and its velocity in Three.js metres a second. `visible` false parks it.
 * Allocates nothing: it runs every millisecond of the train's life.
 */
export function setMover(sim, m, cx, cy, cz, hx, hy, hz, vx, vy, vz, kind, visible) {
  const mat = contactMaterial(kind);
  if (!visible) {
    sim.e.sim_world_mover(m, 1, 0, 0, 0, 0, 0, 0, 0, 0, mat.e, mat.mu);
    return;
  }
  threePosToSim(cx - hx, cy - hy, cz - hz, A);
  threePosToSim(cx + hx, cy + hy, cz + hz, B);
  threeDirToSim(vx, vy, vz, V);
  sim.e.sim_world_mover(
    m,
    Math.min(A.x, B.x), Math.min(A.y, B.y), Math.min(A.z, B.z),
    Math.max(A.x, B.x), Math.max(A.y, B.y), Math.max(A.z, B.z),
    V.x, V.y, V.z, mat.e, mat.mu,
  );
}

/* A box's vertical extent, in Three.js metres: the plant's z is Three.js y. */
export function setBoxHeight(sim, i, y0, y1) {
  threePosToSim(0, y0, 0, A);
  threePosToSim(0, y1, 0, B);
  sim.e.sim_world_box_z(i, Math.min(A.z, B.z), Math.max(A.z, B.z));
}

/*
 * A length in Three.js metres as the plant's metres: the conversion every
 * position takes, on a length laid along up, where it carries no sign.
 */
function simLen(len) {
  return threePosToSim(0, len, 0, V).z;
}

/*
 * Upload one road: `points` is its centre line at road level, objects with
 * x, y and z in Three.js world metres, as the colliders are; `closed` joins
 * the last point back to the first, which must not be repeated. Draw it
 * dense (a point a metre or closer on a bend): the car follows the points,
 * its heading and bend are taken across 1.5 m either way, and straights are
 * cut to a metre by the module itself. Call after uploadWorld, which clears
 * the roads with everything else. Returns the road's index; throws if the
 * module refuses the road, as uploadWorld throws for a collider.
 */
export function uploadRoad(sim, points, closed) {
  need(sim, 'sim_world_road');
  const n = points.length;
  const ptr = sim.e.malloc(n * 3 * 8 || 8);
  if (!ptr) {
    throw new Error('sim_world_road: malloc failed');
  }
  try {
    const f = new Float64Array(sim.e.memory.buffer, ptr, n * 3);
    for (let i = 0; i < n; i += 1) {
      threePosToSim(points[i].x, points[i].y, points[i].z, A);
      f[3 * i] = A.x;
      f[3 * i + 1] = A.y;
      f[3 * i + 2] = A.z;
    }
    const code = sim.e.sim_world_road(ptr, n, closed ? 1 : 0);
    if (code < 0) {
      throw new Error(`sim_world_road: a road of ${n} points${closed ? ', closed,' : ''} was refused: ${code}`);
    }
    return code;
  } finally {
    sim.e.free(ptr);
  }
}

/* Road `road` as the module keeps it: { points, length, closed }, the
 * points after it cut the long segments, the length in Three.js metres. */
export function roadInfo(sim, road) {
  need(sim, 'sim_world_road_info');
  const ptr = sim.e.malloc(ROAD_INFO_DOUBLES * 8);
  try {
    const code = sim.e.sim_world_road_info(road, ptr);
    if (code !== 0) {
      throw new Error(`sim_world_road_info: ${code}`);
    }
    const f = new Float64Array(sim.e.memory.buffer, ptr, ROAD_INFO_DOUBLES);
    return { points: f[0], length: simLenToWorld(f[1]), closed: f[2] === 1 };
  } finally {
    sim.e.free(ptr);
  }
}

/*
 * A car in mover slot m, on road `road`. `car`:
 *   offset      metres along its route from the road's first point at step 0
 *               of the clock (round and round a closed road, out and back an
 *               open one, so past an open road's length is on the way back),
 *               within ten thousand kilometres either way
 *   topSpeed    m/s, 0.1 to 100
 *   lateral     the most lateral acceleration it corners at, m/s/s, 0.1 to 50
 *   drift       slip gain per m/s/s of lateral acceleration, to 1; 0, the
 *               default, is an ordinary car and a drift car is about 0.05
 *   length, width, height   its body, Three.js metres, to 50
 *   clearance   the gap under its body, Three.js metres, default 0
 *   kind        contactMaterial's name for its e and mu, default 'train',
 *               the painted steel the shell already knows moving things by
 * Throws if the module refuses it.
 */
export function addVehicle(sim, m, road, car) {
  need(sim, 'sim_world_vehicle');
  const mat = contactMaterial(car.kind || 'train');
  const code = sim.e.sim_world_vehicle(
    m, road, simLen(car.offset || 0),
    car.topSpeed, car.lateral, car.drift || 0,
    simLen(car.length), simLen(car.width), simLen(car.height), simLen(car.clearance || 0),
    mat.e, mat.mu,
  );
  if (code !== 0) {
    throw new Error(`sim_world_vehicle: slot ${m} on road ${road} was refused: ${code}`);
  }
}

/* Take the car in slot m away: the module parks the slot, as setMover does
 * for a hidden train car. */
export function removeVehicle(sim, m) {
  sim.e.sim_world_mover(m, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
}

/* The vehicles' clock: the lap clock in whole 1 ms steps (simTimeMs at 1 kHz).
 * See the header for when. */
export function setVehicleClock(sim, step) {
  need(sim, 'sim_world_clock');
  const code = sim.e.sim_world_clock(step);
  if (code !== 0) {
    throw new Error(`sim_world_clock: ${step} was refused: ${code}`);
  }
}

/* One object a slot, for readVehicles to fill. */
export function makeVehiclePoses() {
  const out = [];
  for (let m = 0; m < MOVER_SLOTS; m += 1) {
    out.push({
      on: false,
      x: 0, y: 0, z: 0,
      hx: 0, hz: 0,
      qx: 0, qy: 0, qz: 0, qw: 1,
      tx: 0, tz: 0,
      vx: 0, vy: 0, vz: 0,
      speed: 0, distance: 0, yawRate: 0, curvature: 0, slip: 0,
    });
  }
  return out;
}

/* Per module instance: the scratch the poses are read into, and a view of it
 * that is made again only when memory grows. */
const POSES = new WeakMap();

/* A plan vector from the plant's frame, unit, as a Three.js ground plane
 * direction into T3. frame.js has no sim to Three.js direction, and its
 * position conversion divides by the scale, so the length is divided back
 * out: a heading stays a unit vector at any scale. */
function planDir(x, y) {
  simPosToThree(x, y, 0, T3);
  const l = Math.sqrt(T3.x * T3.x + T3.z * T3.z) || 1;
  T3.x /= l;
  T3.z /= l;
}

/*
 * Every car's pose at the module's clock, in the Three.js frame, into `out`
 * (from makeVehiclePoses), slot by slot; `on` is false for a slot with no
 * car. Per car:
 *   x, y, z      the road point under its centre, Three.js metres: its
 *                body's bottom centre stands `clearance` above it
 *   hx, hz       its heading on the ground plane, unit: where its nose
 *                points, the drift in it
 *   qx..qw       the same heading as a Three.js quaternion, a turn about +y,
 *                for a model built nose along -z, as the craft's is
 *   tx, tz       the way it is going, unit; the angle from this to the
 *                heading is the drift's slip
 *   vx, vy, vz   its velocity, m/s
 *   speed        m/s along the road     distance  driven, metres, every lap
 *   yawRate      rad/s about +y         curvature 1/m, left positive
 *   slip         tan(slip / 2), left positive, 0 for an ordinary car
 * The velocity and the yaw rate are what a contact on the car reads: the
 * yaw rate is how fast its body turns from this step's pose to the next,
 * the drift's slide coming and going included, which is not speed times
 * curvature where a bend begins or ends.
 * Read-only: nothing here reaches the physics. Returns out.
 */
export function readVehicles(sim, out) {
  need(sim, 'sim_world_vehicle_poses');
  let slot = POSES.get(sim.e);
  if (!slot) {
    const ptr = sim.e.malloc(MOVER_SLOTS * VEHICLE_POSE_DOUBLES * 8);
    if (!ptr) {
      throw new Error('sim_world_vehicle_poses: malloc failed');
    }
    slot = { ptr, view: null };
    POSES.set(sim.e, slot);
  }
  const n = sim.e.sim_world_vehicle_poses(slot.ptr);
  if (n !== MOVER_SLOTS) {
    throw new Error(`sim_world_vehicle_poses: ${n} slots, the shell reads ${MOVER_SLOTS}`);
  }
  if (!slot.view || slot.view.buffer !== sim.e.memory.buffer) {
    slot.view = new Float64Array(sim.e.memory.buffer, slot.ptr, MOVER_SLOTS * VEHICLE_POSE_DOUBLES);
  }
  const f = slot.view;
  for (let m = 0; m < MOVER_SLOTS; m += 1) {
    const o = out[m];
    const b = m * VEHICLE_POSE_DOUBLES;
    o.on = f[b] === 1;
    if (!o.on) {
      continue;
    }
    simPosToThree(f[b + 1], f[b + 2], f[b + 3], T3);
    o.x = T3.x;
    o.y = T3.y;
    o.z = T3.z;
    const c = f[b + 4];
    const s = f[b + 5];
    planDir(c, s);
    o.hx = T3.x;
    o.hz = T3.z;
    /* The half angle identities: a turn about the plant's +z by the angle
     * whose cosine and sine are the heading's, with square roots only. */
    const w = Math.sqrt(Math.max(0, (1 + c) / 2));
    const z = Math.sqrt(Math.max(0, (1 - c) / 2));
    simQuatToThree(w, 0, 0, s < 0 ? -z : z, Q3);
    o.qx = Q3.x;
    o.qy = Q3.y;
    o.qz = Q3.z;
    o.qw = Q3.w;
    planDir(f[b + 12], f[b + 13]);
    o.tx = T3.x;
    o.tz = T3.z;
    simPosToThree(f[b + 8], f[b + 9], f[b + 10], T3);
    o.vx = T3.x;
    o.vy = T3.y;
    o.vz = T3.z;
    o.speed = simLenToWorld(f[b + 6]);
    o.distance = simLenToWorld(f[b + 7]);
    /* A turn about the plant's +z is a turn about Three.js +y, the same way:
     * frame.js's change of basis is a proper rotation. */
    o.yawRate = f[b + 11];
    o.curvature = f[b + 14];
    o.slip = f[b + 15];
  }
  return out;
}
