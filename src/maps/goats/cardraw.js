/*
 * cardraw.js: the cars that drive Heads' neighbourhood (./traffic.js),
 * drawn. Every car of every kind is one instance of one mesh, so the whole
 * traffic is one draw call, and one more in the sun's pass for a stand in
 * of a few boxes a car.
 *
 * THE SAME CARS AS THE PARKED ONES. Each kind is src/art/cars.js buildCar,
 * the model every parked car on the street is drawn with, at its parked
 * detail, and its wheels are carWheelGeometry's, as a built map's moving
 * cars have (../built/cars.js). But a built map draws one mesh a material a
 * car, a dozen draw calls each, which this map's latency rule cannot pay
 * for eight cars. So every kind is baked into one geometry: each material's
 * colour into the vertices, the body's paint left white for the car's own
 * colour, a flag on what is unlit (glass, lamps, plates), and every kind
 * in it at once. A car draws only its own kind: the rest of the geometry is
 * folded to a point in the vertex shader, which costs its vertices and no
 * pixels, so there are two kinds and not the street's four. Low draws the
 * same two: a car's solid is its kind's (./traffic.js), the same on every
 * preset, and a car drawn smaller than its solid would be a box a whoop hit
 * in the air. The plates are their plain colour, without the sheet's lettering.
 *
 * THE SHADOW IS A STAND IN: the sun's pass draws each car as six boxes, its
 * body, its cabin and its four wheels (CAR_KINDS in src/props/street.js),
 * not its thousands of triangles, and the colour pass never draws the
 * boxes (shadowOnly in src/render/shadowrate.js). From a whoop the shadow
 * of a car's lamps and mirrors is not something anybody can see; the light
 * under it between the wheels is.
 *
 * THE WHEELS ROLL AND STEER in the vertex shader too, from three numbers a
 * car: its kind, how far round its wheels have turned (the distance the
 * module says it has driven, over the wheel's radius, as ../built/cars.js
 * rolls them) and the steer the road's curvature asks of its front pair.
 *
 * RENDER READS THE POSE THE PHYSICS USED. place() is handed the module's
 * poses one step apart and draws each car between them at the craft's
 * alpha, as ../built/cars.js does, a little above the module's road so its
 * tyres stand on the street's asphalt. It also writes each car's pose in
 * plan metres for the goats (./herd.js thinkCars), so they get out of the
 * way of the car they can see.
 *
 * FOR THE LATENCY RULE. One draw call, one in the sun's pass; both kinds'
 * triangles for every car, half of them folded away, and 72 a car in the
 * sun's pass; per frame one matrix and three numbers a car. Nothing
 * allocated on a frame.
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
import { buildCar, carWheelGeometry, carWheelBase, CAR } from '../../art/cars.js';
import { cel } from '../city/vendored/core/toon.js';
import { carColourOf, CAR_KINDS } from '../../props/street.js';
import { shadowOnly } from '../../render/shadowrate.js';

/* The body's paint as the car is built, so its vertices can be told from
 * every other colour's: a magenta no car is painted. Its deep shade is
 * buildCar's own deepOf of it. */
const KEY = 0xff00ff;
const deepOf = (c) => new THREE.Color(c).multiplyScalar(0.76).getHex();
const DEEP = 0.76;

/* The front wheels never steer past this, rad, as ../built/cars.js. */
const STEER_MAX = 0.6;

/* Each car's numbers in the plan for the goats, ./herd.js CAR_STRIDE:
 * x, y, heading x, heading y, speed, half length, half width, on. */
export const CAR_STRIDE = 8;

/*
 * Every kind in `kinds` in one geometry, nose along +x, real metres:
 * position, normal, colour, aCar (its kind, its paint: 1 the body's colour,
 * DEEP its shade, 0 its own; 1 if unlit; 1 if a wheel) and aHub (a wheel's
 * middle and 1 on a front one).
 */
function carsGeometry(kinds) {
  const pos = [];
  const nor = [];
  const col = [];
  const car = [];
  const hub = [];
  const idx = [];
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const deep = deepOf(KEY);
  const add = (geo, matrix, colourOf, k, flat, wheel) => {
    const base = pos.length / 3;
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    const vc = geo.attributes.color;
    nm.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i += 1) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      pos.push(v.x, v.y, v.z);
      if (n) {
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      } else {
        v.set(0, 1, 0);
      }
      nor.push(v.x, v.y, v.z);
      const paint = colourOf(vc, i);
      col.push(c.r, c.g, c.b);
      car.push(k, paint, flat, wheel ? 1 : 0);
      hub.push(wheel ? wheel[0] : 0, wheel ? wheel[1] : 0, wheel ? wheel[2] : 0, wheel ? wheel[3] : 0);
    }
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i += 1) {
        idx.push(base + geo.index.getX(i));
      }
    } else {
      for (let i = 0; i < p.count; i += 1) {
        idx.push(base + i);
      }
    }
  };
  kinds.forEach((kind, k) => {
    const g = buildCar({ kind, color: KEY, wheels: false });
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh) {
        return;
      }
      const hex = o.material.color.getHex();
      const flat = o.material.isMeshBasicMaterial ? 1 : 0;
      const paint = hex === KEY ? 1 : (hex === deep ? DEEP : 0);
      add(o.geometry, o.matrixWorld, () => {
        if (paint) {
          c.setRGB(1, 1, 1);
        } else {
          c.copy(o.material.color);
        }
        return paint;
      }, k, flat, null);
    });
    const base = carWheelBase(kind);
    const wheel = carWheelGeometry(kind);
    const flip = new THREE.Matrix4().makeRotationY(Math.PI);
    base.axle.forEach((x, a) => {
      for (const side of [1, -1]) {
        const z = side * base.z;
        const m = new THREE.Matrix4().makeTranslation(x, base.R, z);
        if (side < 0) {
          m.multiply(flip);
        }
        add(wheel, m, (vc, i) => {
          c.fromBufferAttribute(vc, i);
          return 0;
        }, k, 0, [x, base.R, z, a === 0 ? 1 : 0]);
      }
    });
    wheel.dispose();
    g.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
      }
    });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aCar', new THREE.Float32BufferAttribute(car, 4));
  geo.setAttribute('aHub', new THREE.Float32BufferAttribute(hub, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/*
 * Each kind's stand in for the sun's pass, in the same frame as
 * carsGeometry and with its kind in aCar: the body from sill to waist, the
 * cabin from waist to roof, and a box for each wheel.
 */
function shadowGeometry(kinds) {
  const pos = [];
  const car = [];
  const idx = [];
  const box = (k, x0, y0, z0, x1, y1, z1) => {
    const base = pos.length / 3;
    for (const [x, y, z] of [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]) {
      pos.push(x, y, z);
      car.push(k, 0, 0, 0);
    }
    for (const f of [[0, 2, 1, 0, 3, 2], [4, 5, 6, 4, 6, 7], [0, 1, 5, 0, 5, 4], [3, 7, 6, 3, 6, 2], [0, 4, 7, 0, 7, 3], [1, 2, 6, 1, 6, 5]]) {
      for (const i of f) {
        idx.push(base + i);
      }
    }
  };
  kinds.forEach((kind, k) => {
    const c = CAR_KINDS[kind];
    const w = carWheelBase(kind);
    box(k, -c.L / 2, c.sill, -c.W / 2, c.L / 2, c.waist, c.W / 2);
    box(k, c.cab[0], c.waist, -c.W / 2 + 0.1, c.cab[1], c.roof, c.W / 2 - 0.1);
    for (const x of w.axle) {
      for (const side of [1, -1]) {
        const z = side * w.z;
        box(k, x - w.R * 0.85, 0, z - w.width / 2, x + w.R * 0.85, c.sill + 0.05, z + w.width / 2);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aCar', new THREE.Float32BufferAttribute(car, 4));
  geo.setAttribute('aHub', new THREE.Float32BufferAttribute(new Float32Array(car.length), 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/*
 * The cars in GLSL: a vertex of another kind folded to the car's middle,
 * a wheel's turned about its axle by the roll and, on the front pair,
 * about the upright by the steer. For the toon and for the sun's pass.
 */
function carPose(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', [
      '#include <common>',
      'attribute vec4 aCar;',
      'attribute vec4 aHub;',
      'attribute vec3 aDrive;',
      'vec3 carTurn(vec3 d) {',
      '  float c = cos(aDrive.y);',
      '  float s = sin(aDrive.y);',
      '  d.xy = vec2(c * d.x - s * d.y, s * d.x + c * d.y);',
      '  if (aHub.w > 0.5) {',
      '    float c2 = cos(aDrive.z);',
      '    float s2 = sin(aDrive.z);',
      '    d.xz = vec2(c2 * d.x + s2 * d.z, c2 * d.z - s2 * d.x);',
      '  }',
      '  return d;',
      '}',
      'vec3 carPose(vec3 p) {',
      '  if (abs(aCar.x - aDrive.x) > 0.5) {',
      '    return vec3(0.0);',
      '  }',
      '  return aCar.w > 0.5 ? aHub.xyz + carTurn(p - aHub.xyz) : p;',
      '}',
    ].join('\n'))
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = carPose(transformed);');
}

/* The toon's own: the normal with its wheel, the body's paint from the
 * car's colour, and what is unlit drawn as its colour. */
function carToon(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vCarFlat;')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nif (aCar.w > 0.5) { objectNormal = carTurn(objectNormal); }')
    .replace('#include <color_vertex>', [
      'vColor = vec3(1.0);',
      '#ifdef USE_COLOR',
      'vColor *= color;',
      '#endif',
      '#ifdef USE_INSTANCING_COLOR',
      'if (aCar.y > 0.0) { vColor *= instanceColor.xyz * aCar.y; }',
      '#endif',
      'vCarFlat = aCar.z;',
    ].join('\n'));
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vCarFlat;')
    .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, diffuseColor.rgb, vCarFlat);');
}

/*
 * The cars drawn: `traffic` is ./traffic.js goatTraffic's, `S` world
 * metres a real one, `lift` world metres from the module's road to the
 * asphalt's top, `toPlan(x, z)` a world point to the plan. Returns
 * { group, place(prev, curr, alpha), feed, count, gapAt, stats }.
 */
export function makeCarDraw(traffic, S, lift, toPlan) {
  const vehicles = traffic.vehicles;
  const N = vehicles.length;
  const kinds = [...new Set(vehicles.map((v) => v.style))];
  const kindOf = (style) => kinds.indexOf(style);
  const geometry = carsGeometry(kinds);
  const drive = new Float32Array(Math.max(1, N) * 3);
  const driveAttr = new THREE.InstancedBufferAttribute(drive, 3);
  driveAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aDrive', driveAttr);
  const material = cel({ color: 0xffffff, vertexColors: true, bands: 3, tint: 0x6a6288, cache: false });
  const toon = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    toon(shader, renderer);
    carPose(shader);
    carToon(shader);
  };
  material.customProgramCacheKey = () => 'goat-cars';
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, N));
  mesh.name = 'cars';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  /* The stand in, on the same matrices and the same kinds, for the sun's
   * pass alone. */
  const shadowGeo = shadowGeometry(kinds);
  shadowGeo.setAttribute('aDrive', driveAttr);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = carPose;
  depth.customProgramCacheKey = () => 'goat-cars-depth';
  const blank = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const proxy = shadowOnly(new THREE.InstancedMesh(shadowGeo, blank, Math.max(1, N)));
  proxy.name = 'cars shadow';
  proxy.castShadow = true;
  proxy.receiveShadow = false;
  proxy.customDepthMaterial = depth;
  proxy.frustumCulled = false;
  proxy.instanceMatrix = mesh.instanceMatrix;
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const paint = new THREE.Color();
  const each = vehicles.map((v, i) => {
    mesh.setColorAt(i, paint.setHex(CAR[carColourOf(v.seed)] ?? CAR.white));
    mesh.setMatrixAt(i, hidden);
    const base = carWheelBase(v.style);
    drive[i * 3] = kindOf(v.style);
    return {
      slot: v.slot,
      R: base.R,
      wheelbase: base.axle[0] - base.axle[1],
      length: v.length,
      width: v.width,
      height: v.height,
      on: false, x: 0, y: 0, z: 0, hx: 1, hz: 0,
    };
  });
  if (!N) {
    mesh.setMatrixAt(0, hidden);
    mesh.count = 0;
    proxy.count = 0;
  }
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  const group = new THREE.Group();
  group.name = 'goat cars';
  /* The goats' feed, below, read by the harness too. */
  group.userData.feed = null;
  group.add(mesh, proxy);

  /* The goats' feed, plan metres: CAR_STRIDE numbers a car. */
  const feed = new Float64Array(Math.max(1, N) * CAR_STRIDE);
  group.userData.feed = feed;
  const m = new THREE.Matrix4();
  const e = m.elements;
  const TAU = Math.PI * 2;

  function place(prev, curr, alpha) {
    const a = alpha > 0 ? (alpha < 1 ? alpha : 1) : 0;
    const b = 1 - a;
    for (let i = 0; i < N; i += 1) {
      const car = each[i];
      const q = curr[car.slot];
      const p = prev[car.slot] && prev[car.slot].on ? prev[car.slot] : q;
      const f = i * CAR_STRIDE;
      if (!q || !q.on) {
        if (car.on) {
          car.on = false;
          mesh.setMatrixAt(i, hidden);
        }
        feed[f + 7] = 0;
        continue;
      }
      const x = p.x * b + q.x * a;
      const y = p.y * b + q.y * a + lift;
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
      car.on = true;
      car.x = x;
      car.y = y;
      car.z = z;
      car.hx = hx;
      car.hz = hz;
      /* Nose +x to (hx, 0, hz), its right side +z to (-hz, 0, hx), S
       * times real size. */
      e[0] = hx * S; e[1] = 0; e[2] = hz * S; e[3] = 0;
      e[4] = 0; e[5] = S; e[6] = 0; e[7] = 0;
      e[8] = -hz * S; e[9] = 0; e[10] = hx * S; e[11] = 0;
      e[12] = x; e[13] = y; e[14] = z; e[15] = 1;
      mesh.setMatrixAt(i, m);
      /* Rolled as far as it drove, in the model's own metres, the laps'
       * worth taken off first; steered by the bicycle angle. */
      const dist = (p.distance * b + q.distance * a) / S;
      const turn = car.R * TAU;
      drive[i * 3 + 1] = -((dist - Math.floor(dist / turn) * turn) / car.R);
      let steer = Math.atan(car.wheelbase * (q.curvature || 0) * S);
      steer = steer > STEER_MAX ? STEER_MAX : (steer < -STEER_MAX ? -STEER_MAX : steer);
      drive[i * 3 + 2] = steer;
      const [px, py] = toPlan(x, z);
      feed[f] = px;
      feed[f + 1] = py;
      feed[f + 2] = hx;
      feed[f + 3] = -hz;
      feed[f + 4] = (q.speed || 0) / S;
      feed[f + 5] = car.length / S / 2;
      feed[f + 6] = car.width / S / 2;
      feed[f + 7] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
    driveAttr.needsUpdate = true;
  }

  /* How far a point is from the nearest drawn car's box, up to reach, for
   * the shell's near plane: ../built/cars.js gapAt. */
  function gapAt(px, py, pz, reach) {
    let best = reach;
    for (let i = 0; i < N; i += 1) {
      const c = each[i];
      if (!c.on) {
        continue;
      }
      const dx = px - c.x;
      const dz = pz - c.z;
      const along = dx * c.hx + dz * c.hz;
      const across = -dx * c.hz + dz * c.hx;
      const ea = Math.max(0, (along < 0 ? -along : along) - c.length / 2);
      const ec = Math.max(0, (across < 0 ? -across : across) - c.width / 2);
      const ey = py < c.y ? c.y - py : Math.max(0, py - (c.y + c.height));
      const d = Math.sqrt(ea * ea + ec * ec + ey * ey);
      if (d < best) {
        best = d;
      }
    }
    return best;
  }

  const triangles = geometry.index.count / 3;
  const shadowTriangles = shadowGeo.index.count / 3;
  return {
    group,
    place,
    feed,
    count: N,
    gapAt,
    stats: () => ({ cars: N, kinds: kinds.length, triangles, drawn: triangles * N, shadow: shadowTriangles * N }),
    dispose() {
      geometry.dispose();
      shadowGeo.dispose();
      material.dispose();
      depth.dispose();
      blank.dispose();
      mesh.dispose();
      proxy.dispose();
    },
  };
}
