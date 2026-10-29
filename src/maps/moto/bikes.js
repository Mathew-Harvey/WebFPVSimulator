/*
 * bikes.js: the motocross bikes of Ridgeline MX, drawn. One mesh a bike,
 * the wheels of every bike in one instanced batch, and the roost off the
 * rear tyres in one batch of cel dirt clouds.
 *
 * THE BODY IS ONE VERTEX COLOURED MESH a bike, a bike and its rider built
 * from a few dozen boxes and tubes (the frame, the plastics in the bike's
 * colour, the pipe, the forks, the bars, and the rider crouched over them
 * in a kit and a helmet), in the town's cel material, so the post pass inks
 * every silhouette as it inks a car's. The wheels are instances of one tyre
 * and rim.
 *
 * RENDER READS THE POSE THE PHYSICS USED. Nothing here works out where a
 * bike is: place() is handed two readVehicles arrays (src/game/
 * plantworld.js) and draws each bike between them, on top of what ./ride.js
 * says it does over the ground: up a face, in the air, laid over in a
 * berm, tail out in a whip. Every wheel rolls as far as the bike drove.
 *
 * THE ROOST. Each bike puts down a puff of dirt off its rear wheel every
 * ROOST_EVERY steps of the lap clock: a trickle on the straights, and more
 * when it is leant over in a berm, when its tail is out, and when it lands.
 * A puff is a pure function of the step it was put down at, as the drift
 * cars' smoke is (src/maps/built/cars.js Smoke), so a pause freezes it and
 * a dropped frame changes nothing.
 *
 * For the latency rule: one draw call a bike, one for the wheels, one for
 * the roost; about 500 triangles a bike. Per frame on the CPU: ten bikes'
 * matrices, nothing allocated.
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
import { cel } from '../city/vendored/core/toon.js';
import { bake } from '../city/vendored/core/util.js';
import { MATERIALS } from '../../props/homes.js';
import { Smoke } from '../built/cars.js';
import { hash01 } from './profile.js';

/* Metres. The wheelbase, the wheel's radius (a 21 inch front, a 19 inch
 * rear, drawn the same), the front axle's and the rear's x. */
const WHEEL_R = 0.32;
const FRONT_X = 0.74;
const REAR_X = -0.72;
const TYRE_W = 0.1;

const COL = {
  tyre: 0x24232a, rim: 0xc9ccd4, hub: 0x8a8d96, frame: 0x3a3c46, metal: 0xaab0ba, seat: 0x1f1f26, skin: 0xebc6a2, visor: 0x1b2230, boot: 0x2a2a30, glove: 0x2a2a30,
};

/* The roost: every ROOST_EVERY steps of the lap clock. */
const ROOST_EVERY = 96;
const ROOST_FILL = 0xc99a6a;
const ROOST_SHADE = 0x8a6444;

const colourOf = (key) => (MATERIALS[key] ? MATERIALS[key].c : 0xffffff);

/* A geometry with every vertex one colour. */
function painted(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    col[3 * i] = c.r;
    col[3 * i + 1] = c.g;
    col[3 * i + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _y = new THREE.Vector3(0, 1, 0);
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/* The pieces a bike is made of, collected as { geometry, matrix }. */
function pieces() {
  const out = [];
  const box = (hex, x0, y0, z0, x1, y1, z1) => {
    const g = painted(new THREE.BoxGeometry(1, 1, 1), hex);
    _p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    _s.set(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    out.push({ geometry: g, matrix: new THREE.Matrix4().compose(_p, _q.identity(), _s) });
  };
  const tube = (hex, a, b, r, seg = 6, rTop = null) => {
    _a.set(a[0], a[1], a[2]);
    _b.set(b[0], b[1], b[2]);
    const dir = _b.clone().sub(_a);
    const len = dir.length();
    if (len < 1e-6) {
      return;
    }
    const g = painted(new THREE.CylinderGeometry(rTop === null ? r : rTop, r, len, seg, 1), hex);
    _q.setFromUnitVectors(_y, dir.normalize());
    _p.copy(_a).add(_b).multiplyScalar(0.5);
    out.push({ geometry: g, matrix: new THREE.Matrix4().compose(_p, _q, _s.set(1, 1, 1)) });
  };
  const ball = (hex, c, rx, ry, rz) => {
    const g = painted(new THREE.SphereGeometry(1, 8, 6), hex);
    _p.set(c[0], c[1], c[2]);
    out.push({ geometry: g, matrix: new THREE.Matrix4().compose(_p, _q.identity(), _s.set(rx, ry, rz)) });
  };
  return {
    out, box, tube, ball,
  };
}

/*
 * One bike and its rider, nose +x, y up, z to the right, standing on the
 * ground at the origin, in `livery` = [plastics, kit] (keys of homes.js).
 */
function bikeGeometry(livery) {
  const plastic = colourOf(livery[0]);
  const kit = colourOf(livery[1]);
  const {
    out, box, tube, ball,
  } = pieces();
  /* The engine and frame, the swingarm and the pipe. */
  box(COL.frame, -0.28, 0.28, -0.1, 0.3, 0.7, 0.1);
  box(COL.metal, -0.1, 0.3, -0.12, 0.2, 0.52, 0.12);
  tube(COL.frame, [0.3, 0.62, 0], [0.42, 1.0, 0], 0.06);
  tube(COL.frame, [-0.72, WHEEL_R, 0.07], [-0.2, 0.36, 0.07], 0.035);
  tube(COL.frame, [-0.72, WHEEL_R, -0.07], [-0.2, 0.36, -0.07], 0.035);
  tube(COL.metal, [0.12, 0.42, 0.14], [-0.5, 0.58, 0.15], 0.05, 6, 0.065);
  box(COL.metal, -0.74, 0.5, 0.11, -0.46, 0.64, 0.19);
  /* The plastics in the bike's colour: the tank shrouds, the rear fender,
   * the front fender and the number plate. */
  box(plastic, -0.05, 0.62, -0.15, 0.46, 0.94, 0.15);
  box(plastic, -0.8, 0.66, -0.12, -0.05, 0.86, 0.12);
  box(COL.seat, -0.52, 0.86, -0.1, -0.02, 0.92, 0.1);
  box(plastic, 0.54, 0.66, -0.07, 0.96, 0.72, 0.07);
  box(0xf4f1ea, 0.5, 0.74, -0.15, 0.55, 1.0, 0.15);
  ball(COL.tyre, [0.531, 0.88, 0], 0.03, 0.07, 0.06);
  /* The forks and the bars. */
  tube(COL.metal, [FRONT_X, WHEEL_R, 0.08], [0.4, 1.0, 0.08], 0.03);
  tube(COL.metal, [FRONT_X, WHEEL_R, -0.08], [0.4, 1.0, -0.08], 0.03);
  tube(COL.frame, [0.38, 1.04, -0.42], [0.38, 1.04, 0.42], 0.025);
  box(plastic, 0.3, 1.03, -0.08, 0.4, 1.12, 0.08);
  /* The rider, crouched. The boots on the pegs, the legs to the knees on
   * the shrouds, the body forward over the tank, the arms to the bars. */
  for (const side of [-1, 1]) {
    const z = side * 0.17;
    box(COL.boot, -0.02, 0.3, z - 0.07, 0.3, 0.42, z + 0.07);
    tube(kit, [0.1, 0.4, z], [0.3, 0.78, z * 1.1], 0.075);
    tube(kit, [0.3, 0.78, z * 1.1], [-0.12, 0.98, z * 0.8], 0.085);
    tube(kit, [0.22, 1.44, side * 0.2], [0.38, 1.1, side * 0.4], 0.055);
    box(COL.glove, 0.33, 1.02, side * 0.4 - 0.05, 0.43, 1.1, side * 0.4 + 0.05);
  }
  box(kit, -0.28, 0.92, -0.17, 0.0, 1.14, 0.17);
  tube(kit, [-0.15, 1.0, 0], [0.22, 1.5, 0], 0.18, 8, 0.2);
  ball(plastic, [0.3, 1.66, 0], 0.16, 0.15, 0.15);
  box(COL.visor, 0.38, 1.62, -0.11, 0.5, 1.7, 0.11);
  box(plastic, 0.3, 1.74, -0.04, 0.5, 1.78, 0.04);
  const geo = bake(out);
  out.forEach((p) => p.geometry.dispose());
  geo.computeBoundingSphere();
  return geo;
}

/* One wheel: a knobbly tyre, a rim and a hub, axis along z, vertex
 * coloured. */
function wheelGeometry() {
  const { out } = pieces();
  const tyre = painted(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, TYRE_W, 14, 1), COL.tyre);
  tyre.rotateX(Math.PI / 2);
  out.push({ geometry: tyre });
  const rim = painted(new THREE.CylinderGeometry(WHEEL_R * 0.66, WHEEL_R * 0.66, TYRE_W * 1.1, 12, 1), COL.rim);
  rim.rotateX(Math.PI / 2);
  out.push({ geometry: rim });
  const hub = painted(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 6, 1), COL.hub);
  hub.rotateX(Math.PI / 2);
  out.push({ geometry: hub });
  /* Two spokes across, so the wheel is seen to turn. */
  for (const a of [0, Math.PI / 2]) {
    const sp = painted(new THREE.BoxGeometry(WHEEL_R * 1.3, 0.025, TYRE_W * 1.2), COL.hub);
    sp.rotateZ(a);
    out.push({ geometry: sp });
  }
  const geo = bake(out);
  out.forEach((p) => p.geometry.dispose());
  return geo;
}

/*
 * The bikes. `moto` is ./traffic.js motoTraffic's answer, `rider` ./ride.js
 * makeRider's. Returns { group, place(prev, curr, alpha, now), emit(step,
 * poses), clear(), gapAt(x, y, z, reach), stats(), dispose() }.
 */
export function buildBikes(look, moto, rider) {
  const group = new THREE.Group();
  group.name = 'bikes';
  const owned = { geometries: [], materials: [] };
  const mat = cel({ color: 0xffffff, vertexColors: true, bands: 3, tint: 0x5c5680, cache: false });
  owned.materials.push(mat);

  const bikes = moto.bikes.map((b) => {
    const geo = bikeGeometry(b.livery);
    owned.geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `bike:${b.element}`;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.visible = false;
    group.add(mesh);
    return {
      slot: b.slot, element: b.element, number: b.number, group: b.group, label: `Rider ${b.number}`, mesh, on: false, x: 0, y: 0, z: 0, hx: 1, hz: 0, air: 0, wasAir: 0,
    };
  });

  const wheelGeo = wheelGeometry();
  owned.geometries.push(wheelGeo);
  const wheels = new THREE.InstancedMesh(wheelGeo, mat, bikes.length * 2);
  wheels.name = 'bikeWheels';
  wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wheels.frustumCulled = false;
  wheels.castShadow = true;
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < bikes.length * 2; i += 1) {
    wheels.setMatrixAt(i, HIDDEN);
  }
  group.add(wheels);

  const roost = new Smoke(THREE, look, {
    max: 220, life: 1.1, fill: ROOST_FILL, shade: ROOST_SHADE, name: 'roost',
  });
  group.add(roost.mesh);

  const ride = {
    dy: 0, pitch: 0, yaw: 0, roll: 0, air: 0,
  };
  const E = new THREE.Euler();
  const Q = new THREE.Quaternion();
  const ONE = new THREE.Vector3(1, 1, 1);
  const POS = new THREE.Vector3();
  const BODY = new THREE.Matrix4();
  const LOCAL = new THREE.Matrix4();
  const WM = new THREE.Matrix4();
  const TAU = Math.PI * 2;
  const interp = { distance: 0, speed: 0, curvature: 0, on: true };

  function place(prev, curr, alpha, now) {
    const a = alpha > 0 ? (alpha < 1 ? alpha : 1) : 0;
    const b = 1 - a;
    for (let k = 0; k < bikes.length; k += 1) {
      const bike = bikes[k];
      const q = curr[bike.slot];
      const p = prev[bike.slot] && prev[bike.slot].on ? prev[bike.slot] : q;
      if (!q || !q.on) {
        if (bike.on) {
          bike.on = false;
          bike.mesh.visible = false;
          wheels.setMatrixAt(k * 2, HIDDEN);
          wheels.setMatrixAt(k * 2 + 1, HIDDEN);
          wheels.instanceMatrix.needsUpdate = true;
        }
        continue;
      }
      const x = p.x * b + q.x * a;
      const z = p.z * b + q.z * a;
      let hx = p.hx * b + q.hx * a;
      let hz = p.hz * b + q.hz * a;
      const hl = Math.sqrt(hx * hx + hz * hz);
      if (hl > 1e-9) {
        hx /= hl;
        hz /= hl;
      } else {
        hx = q.hx;
        hz = q.hz;
      }
      interp.distance = p.distance * b + q.distance * a;
      interp.speed = p.speed * b + q.speed * a;
      interp.curvature = (p.curvature || 0) * b + (q.curvature || 0) * a;
      rider.rideOf(bike.slot, interp, ride);
      bike.on = true;
      bike.x = x;
      bike.z = z;
      bike.y = ride.dy;
      bike.hx = hx;
      bike.hz = hz;
      bike.air = ride.air;
      const yaw = Math.atan2(-hz, hx) + ride.yaw;
      /* Roll about the bike's own long axis, pitch about its cross axis,
       * then the turn: Ry Rz Rx. Left lean is a roll toward -z. */
      E.set(-ride.roll, yaw, ride.pitch, 'YZX');
      Q.setFromEuler(E);
      POS.set(x, ride.dy, z);
      BODY.compose(POS, Q, ONE);
      bike.mesh.matrix.copy(BODY);
      bike.mesh.matrixWorldNeedsUpdate = true;
      bike.mesh.visible = true;
      /* The wheels: rolled as far as the bike drove, the front one
       * steered by the bend, both carried by the body's matrix. */
      const dist = interp.distance;
      const turn = WHEEL_R * TAU;
      const roll = -((dist - Math.floor(dist / turn) * turn) / WHEEL_R);
      const slipAngle = 2 * Math.atan(q.slip || 0);
      let steer = Math.atan(1.46 * interp.curvature) - slipAngle;
      steer = steer > 0.5 ? 0.5 : (steer < -0.5 ? -0.5 : steer);
      for (let w = 0; w < 2; w += 1) {
        E.set(0, w === 0 ? steer : 0, roll, 'YXZ');
        Q.setFromEuler(E);
        POS.set(w === 0 ? FRONT_X : REAR_X, WHEEL_R, 0);
        LOCAL.compose(POS, Q, ONE);
        WM.multiplyMatrices(BODY, LOCAL);
        wheels.setMatrixAt(k * 2 + w, WM);
      }
      wheels.instanceMatrix.needsUpdate = true;
    }
    roost.draw(now);
  }

  const landing = new Float32Array(bikes.length);

  /* The roost's feed, at every multiple of 8 steps; only ROOST_EVERY's put
   * a puff down. `poses` is readVehicles' array at `step`. */
  let lastStep = -1;
  function emit(step, poses) {
    if (!(step >= 0)) {
      return;
    }
    if (step < lastStep) {
      roost.clear();
    }
    lastStep = step;
    if (step % ROOST_EVERY !== 0) {
      return;
    }
    for (let k = 0; k < bikes.length; k += 1) {
      const bike = bikes[k];
      const pose = poses[bike.slot];
      if (!pose || !pose.on || !(pose.speed > 3)) {
        continue;
      }
      rider.rideOf(bike.slot, pose, ride);
      const slip = pose.slip < 0 ? -pose.slip : pose.slip;
      const lean = ride.roll < 0 ? -ride.roll : ride.roll;
      const landed = bike.wasAir > 0 && ride.air === 0;
      bike.wasAir = ride.air;
      if (ride.air > 0) {
        continue;
      }
      /* How hard it is digging: a trickle straight, more through a berm
       * and with the tail out, a burst when it lands. */
      const dig = (slip > 0.05 ? 0.5 : 0) + (lean > 0.3 ? 0.4 : 0) + (landed ? 1 : 0);
      if (dig === 0 && ((step / ROOST_EVERY) | 0) % 3 !== k % 3) {
        continue;
      }
      const h1 = hash01(step, bike.slot, 3);
      const h2 = hash01(step + 7, bike.slot, 11);
      const h3 = hash01(step + 13, bike.slot, 17);
      const back = 0.72;
      roost.put(step, pose.x - pose.hx * back, pose.y + ride.dy + 0.25, pose.z - pose.hz * back,
        -pose.vx * 0.35, -pose.vz * 0.35, 0.22 + 0.28 * (dig > 1 ? 1 : dig), h1, h2, h3);
      if (landed) {
        roost.put(step, pose.x - pose.hx * back, pose.y + 0.3, pose.z - pose.hz * back, -pose.vx * 0.5, -pose.vz * 0.5, 0.5, h2, h3, h1);
      }
    }
    void landing;
  }

  function gapAt(px, py, pz, reach) {
    let best = reach;
    for (let k = 0; k < bikes.length; k += 1) {
      const c = bikes[k];
      if (!c.on) {
        continue;
      }
      const dx = px - c.x;
      const dz = pz - c.z;
      const along = dx * c.hx + dz * c.hz;
      const across = -dx * c.hz + dz * c.hx;
      const ea = Math.max(0, (along < 0 ? -along : along) - 0.95);
      const ec = Math.max(0, (across < 0 ? -across : across) - 0.37);
      const ey = py < c.y ? c.y - py : Math.max(0, py - (c.y + 1.9));
      const d = Math.sqrt(ea * ea + ec * ec + ey * ey);
      if (d < best) {
        best = d;
      }
    }
    return best;
  }

  return {
    group,
    bikes,
    place,
    emit,
    clear() {
      roost.clear();
      lastStep = -1;
    },
    gapAt,
    stats() {
      let tris = 0;
      for (const g of owned.geometries) {
        tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      }
      return { bikes: bikes.length, meshes: bikes.length + 2, triangles: Math.round(tris + 2 * 220) };
    },
    dispose() {
      for (const g of owned.geometries) {
        g.dispose();
      }
      for (const m of owned.materials) {
        m.dispose();
      }
      roost.dispose();
      group.clear();
    },
  };
}
