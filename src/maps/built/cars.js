/*
 * cars.js: the moving cars of a built map, drawn. One Object3D a vehicle,
 * posed every frame from the poses the physics module drove it to, with
 * wheels that roll, front wheels that steer, lamps that light at dusk and
 * brighten under braking, and cel drift smoke off the drift car's rear
 * wheels.
 *
 * THE SAME CAR AS THE PARKED ONE. Each body is src/art/cars.js buildCar,
 * the model every parked car in the town and on a built map is drawn with
 * (src/props/kit.js folds a parked one in), at its 'full' detail, in the
 * colour the parked car of the same element would be (carColourOf in
 * src/props/street.js, from the vehicle's seed; the r32 in the livery its
 * variant names), in the town's cel materials, and at a time of day with
 * flats its glass and plates are dimmed as the kit dims a parked car's
 * (lookedTownMaterial). The ink is the post pipeline's, which inks every
 * silhouette in the frame, a parked car's and this one's alike.
 *
 * THE WHEELS ARE INSTANCES. The body is built with wheels: false and every
 * wheel of every car of one kind (and livery) is one InstancedMesh of
 * carWheelGeometry's wheel, its tyre, rim, spokes and hub painted into one
 * vertex coloured cel batch: three kinds on a map are three draw calls for
 * all their wheels rather than one a wheel. Each wheel's matrix is written
 * every frame from its car's pose: turned by the distance the car has
 * driven over the wheel's radius (the pose's `distance`), so it rolls
 * without slipping exactly as far as the car went, and the front pair
 * steered, render only, by the bicycle angle of the road's curvature over
 * the wheelbase less the drift's slip, so a drift car countersteers into
 * its slide the way a driver holds one. The r32 stands on a touch of
 * negative camber, the tops of its wheels in, as a drift car does.
 *
 * RENDER READS THE POSE THE PHYSICS USED. Nothing here works out where a
 * car is: place() is handed two readVehicles arrays (src/game/
 * plantworld.js), the poses one step apart that the craft's two states are
 * at, and draws each car between them at the same alpha the craft is drawn
 * at. The pose objects need only on, x, y, z, hx, hz, speed, distance,
 * curvature and slip, so a caller with no module (the builder's view before
 * Play) can pose a car from traffic.js vehicleStart by filling those.
 *
 * DRIFT SMOKE. While a drift car slides past SMOKE_SLIP, each rear wheel in
 * turn puts down a puff every SMOKE_EVERY steps of the clock: a flat, cel
 * shaded cloud in the cream and violet of the town's clouds, with an ink
 * edge, that drifts on with a share of the car's speed, grows, rises and
 * dissolves from its edge inward. Every puff is a pure function of the step
 * it was put down at and the pose at that step (emit(), fed by the shell at
 * the chase's 8 step stride from poses the physics read), and of the clock
 * it is drawn at, so a pause freezes it and a dropped frame changes
 * nothing. The pool is SMOKE_MAX puffs, the oldest reused, drawn as one
 * batch of camera facing quads whose buffers are written in place: nothing
 * is allocated on a frame.
 *
 * THE API.
 *
 *   buildCars(THREE, look, traffic, opts)
 *     THREE     the three.js namespace the caller renders with
 *     look      lookOf(doc) from ./looks.js: its time decides the dimming,
 *               the lamps and the smoke's colours
 *     traffic   trafficOf(doc) from ./traffic.js: `vehicles` is read
 *     opts      nothing yet
 *   returns a car set:
 *     group               a THREE.Group named 'cars': one Object3D a car
 *                         (named 'car:' and its element id) and the smoke;
 *                         add it to the scene
 *     cars                [{ slot, element, style, label, drift, root }]
 *     place(prev, curr, alpha, now)
 *                         pose every car between two pose arrays one step
 *                         apart (makeVehiclePoses' shape, indexed by slot),
 *                         alpha 0 at prev and 1 at curr, and draw the smoke
 *                         at `now`, the clock in ms the craft is drawn at
 *                         (the step of prev plus alpha). Allocates nothing.
 *     emit(step, poses)   the smoke's feed: the poses at clock `step`, in
 *                         whole steps. Call at every multiple of 8 steps the
 *                         clock reaches (more often is harmless: only
 *                         multiples of SMOKE_EVERY put a puff down); a step
 *                         that goes back clears the smoke, as a new run does
 *     clearSmoke()        every puff gone
 *     chaseCars()         [{ slot, length, width, height, clearance, drift,
 *                         label }] for src/game/chase.js setCars: the
 *                         numbers addVehicle was given, and a name for the
 *                         meter
 *     gapAt(x, y, z, reach)   how far a point is from the nearest drawn car
 *                         box, m, up to reach: for the shell's near plane,
 *                         render only
 *     stats()             { cars, meshes, triangles, puffs }
 *     dispose()           frees everything this made; the town's shared
 *                         materials are the scene's to free
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

import {
  buildCar, carWheelGeometry, carWheelBase, r32Livery, MODEL, CAR, LAMP_FRONT, LAMP_REAR,
} from '../../art/cars.js';
import { PAL } from '../city/vendored/core/palette.js';
import { cel } from '../city/vendored/core/toon.js';
import { bake, trs } from '../city/vendored/core/util.js';
import { lookedTownMaterial } from '../../props/kit.js';
import { carColourOf } from '../../props/street.js';
import { kitLook } from './looks.js';

/* How the meter names a car nobody named, by its body. */
const STYLE_LABEL = {
  kei: 'Kei car', keivan: 'Kei van', hatch: 'Hatch', sedan: 'Sedan', wagon: 'Wagon',
  minivan: 'Minivan', van: 'Van', boxtruck: 'Box truck', minibus: 'Minibus', r32: 'Coupe',
};

/* The front wheels never steer past this, rad: about 34 degrees. */
const STEER_MAX = 0.6;

/* The lamps src/art/cars.js lights a car with (kit.js CAR_LAMPS),
 * LAMP_FRONT and LAMP_REAR, and what they become: a tail lamp under
 * braking, and both lit after dark. */
const LAMP_FRONT_LIT = 0xfffbf0;
const LAMP_REAR_LIT = 0xf06a58;
const LAMP_BRAKE = 0xff3a2e;
/* Braking this hard, m/s/s, lights the brake lamps. The module brakes a car
 * into a bend at its own rate and pulls away at 2.5. */
const BRAKE_DECEL = 1.5;

/* THE SMOKE. SMOKE_EVERY steps between puffs, the rear wheels in turn;
 * past SMOKE_SLIP of tan(slip / 2) (about 23 degrees) and SMOKE_SPEED m/s;
 * each lives SMOKE_LIFE s; at most SMOKE_MAX at once. */
export const SMOKE_EVERY = 16;
const SMOKE_SLIP = 0.2;
const SMOKE_SPEED = 3;
const SMOKE_LIFE = 1.6;
const SMOKE_MAX = 160;
/* A puff's half size at birth and how much it grows, m; how far it rises
 * over its life, m; how much of the car's velocity it carries away. */
const PUFF_HALF = 0.4;
const PUFF_GROW = 2.2;
const PUFF_RISE = 0.6;
const PUFF_CARRY = 0.25;
/* How near the eye a puff's nearest side may come, m: it starts to thin
 * at the first and is gone by the second. */
const SMOKE_CLEAR = [5, 1.5];
/* The smoke's paint: the lit side, the shade, as the town's clouds. */
const SMOKE_FILL = 0xf3efe8;
const SMOKE_SHADE = 0xb9b1cf;

const SMOKE_VERTEX = /* glsl */ `
  #define SMOKE_CLEAR_FAR ${SMOKE_CLEAR[0].toFixed(2)}
  #define SMOKE_CLEAR_NEAR ${SMOKE_CLEAR[1].toFixed(2)}
  attribute vec3 centre;
  attribute vec2 corner;
  attribute vec4 puff;
  varying vec2 vUv;
  varying float vCut;
  varying float vInk;
  varying vec2 vLight;
  #include <fog_pars_vertex>
  void main() {
    float c = cos( puff.y );
    float s = sin( puff.y );
    vec2 q = vec2( c * corner.x - s * corner.y, s * corner.x + c * corner.y ) * puff.x;
    vec4 mvPosition = modelViewMatrix * vec4( centre, 1.0 );
    /* A puff the eye comes near thins away to its cores and is gone before
     * the eye reaches it: a pilot on the drift car's tail flies through its
     * smoke, and a cloud across the whole lens is not something to fly by. */
    float nearCut = 1.0 - smoothstep( SMOKE_CLEAR_NEAR, SMOKE_CLEAR_FAR, -mvPosition.z - puff.x );
    mvPosition.xy += q;
    gl_Position = projectionMatrix * mvPosition;
    vUv = corner * 0.5 + 0.5;
    vCut = mix( puff.z, 1.02, nearCut );
    /* The ink rim narrows as the puff ages (puff.w, its age over its life)
     * and as the cut rises for the eye. The density is a sum of blobs with
     * broad plateaus where they overlap, so a fixed 0.07 over a cut near
     * its top took in most of a plateau: an old puff, which is the one a
     * pilot on the drift car's tail is sitting in, was drawn as a solid
     * disc of ink with a stepped edge before it vanished. */
    vInk = 0.07 * ( 1.0 - nearCut ) * ( 1.0 - puff.w * puff.w );
    /* The light from the upper left of the picture, in the puff's own
     * turned frame, so every puff is lit from the same side. */
    vec2 L = vec2( -0.7071, 0.7071 );
    vLight = vec2( c * L.x + s * L.y, -s * L.x + c * L.y );
    #include <fog_vertex>
  }
`;

const SMOKE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uFill;
  uniform vec3 uShade;
  uniform vec3 uInk;
  varying vec2 vUv;
  varying float vCut;
  varying float vInk;
  varying vec2 vLight;
  #include <fog_pars_fragment>
  void main() {
    float d = texture2D( uMap, vUv ).r;
    if ( d < vCut ) discard;
    /* Denser toward the light is the side turned away from it. */
    float toward = texture2D( uMap, vUv + vLight * 0.07 ).r;
    vec3 col = toward > d + 0.03 ? uShade : uFill;
    if ( d < vCut + vInk ) col = uInk;
    gl_FragColor = vec4( col, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/* A small integer hash to a number in [0, 1): the smoke's spread, from the
 * step, the car and the wheel, so the same clock puts down the same puff. */
function hash01(a, b, c) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* A geometry with every vertex painted one colour, for a vertex coloured
 * batch. */
function painted(THREE, geo, hex) {
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

/* The smoke's density: a cauliflower of soft round blobs, summed, so a cut
 * at a low density is the whole cloud and a higher one eats it from its edge
 * toward the cores. Read as data, not colour. */
function smokeTexture(THREE) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const blobs = [[0.5, 0.56, 0.3], [0.31, 0.47, 0.2], [0.69, 0.44, 0.21], [0.46, 0.3, 0.19], [0.64, 0.66, 0.18], [0.35, 0.68, 0.16]];
  for (const [x, y, r] of blobs) {
    const grad = g.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.55, 'rgba(160, 160, 160, 1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 1)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x * S, y * S, r * S, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/* A soft round glow, for the light the lamps throw after dark. */
function glowTexture(THREE) {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.4)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/*
 * The light a car's lamps throw after dark, in its own frame (nose +x): a
 * warm pool on the road ahead, a red one behind, and a halo standing on
 * each lamp where the model put it (buildCar's userData.lamps). One
 * geometry, vertex coloured, drawn additively.
 */
function glowGeometry(THREE, L, lamps) {
  const parts = [];
  const quad = (hex, k, m, w, h) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const c = new THREE.Color(hex).multiplyScalar(k);
    painted(THREE, geo, c.getHex());
    parts.push({ geometry: geo, matrix: m });
  };
  /* On the road, 3 cm up, facing up. */
  quad(0xffe0a8, 0.55, trs(L / 2 + 3.4, 0.03, 0, -Math.PI / 2), 7, 3.6);
  quad(0xff4a3a, 0.4, trs(-L / 2 - 0.9, 0.03, 0, -Math.PI / 2), 2, 2.2);
  /* On the lamps, facing out; a car with four tail lamps gets four
   * smaller halos. */
  for (const [x, y, z] of lamps.front) {
    quad(0xfff4dc, 0.9, trs(x + 0.03, y, z, 0, Math.PI / 2), 0.7, 0.5);
  }
  const k = lamps.rear.length > 2 ? 0.7 : 1;
  for (const [x, y, z] of lamps.rear) {
    quad(0xff5040, 0.7, trs(x - 0.03, y, z, 0, -Math.PI / 2), 0.45 * k, 0.4 * k);
  }
  const geo = bake(parts);
  for (const p of parts) {
    p.geometry.dispose();
  }
  geo.computeBoundingSphere();
  return geo;
}

/*
 * The drift smoke: a pool of puffs and the one batch that draws them. See
 * the header.
 */
class Smoke {
  constructor(THREE, look) {
    const N = SMOKE_MAX;
    this.t0 = new Float64Array(N).fill(-1);
    this.x = new Float32Array(N);
    this.y = new Float32Array(N);
    this.z = new Float32Array(N);
    this.vx = new Float32Array(N);
    this.vz = new Float32Array(N);
    this.size = new Float32Array(N);
    this.turn = new Float32Array(N);
    this.spin = new Float32Array(N);
    this.next = 0;
    this.lastEmit = -1;
    this.live = 0;

    const centre = new Float32Array(N * 4 * 3);
    const corner = new Float32Array(N * 4 * 2);
    const puff = new Float32Array(N * 4 * 4);
    const index = new Uint16Array(N * 6);
    const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];
    for (let i = 0; i < N; i += 1) {
      corner.set(CORNERS, i * 8);
      const v = i * 4;
      index.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    this.centre = new THREE.BufferAttribute(centre, 3);
    this.centre.setUsage(THREE.DynamicDrawUsage);
    this.puff = new THREE.BufferAttribute(puff, 4);
    this.puff.setUsage(THREE.DynamicDrawUsage);
    /* Three.js wants a position to size a draw from; the centre is it. */
    geo.setAttribute('position', this.centre);
    geo.setAttribute('centre', this.centre);
    geo.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    geo.setAttribute('puff', this.puff);
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.geometry = geo;
    this.texture = smokeTexture(THREE);

    const T = look && look.time;
    const flats = T && T.flats;
    /* Unlit paint, dimmed at a time with flats, but only halfway: smoke at
     * dusk still catches the last of the sky. */
    const dim = (hex) => {
      const c = new THREE.Color(hex);
      if (flats) {
        c.r *= Math.sqrt(flats[0]);
        c.g *= Math.sqrt(flats[1]);
        c.b *= Math.sqrt(flats[2]);
      }
      return c;
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uMap: { value: this.texture },
        uFill: { value: dim(SMOKE_FILL) },
        uShade: { value: dim(SMOKE_SHADE) },
        uInk: { value: new THREE.Color(T && T.ink != null ? T.ink : PAL.ink) },
      },
      vertexShader: SMOKE_VERTEX,
      fragmentShader: SMOKE_FRAGMENT,
      fog: true,
    });
    this.material.name = 'driftSmoke';
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'driftSmoke';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
  }

  clear() {
    this.t0.fill(-1);
    this.next = 0;
    this.lastEmit = -1;
    this.live = 0;
    this.puff.array.fill(0);
    this.puff.needsUpdate = true;
    this.mesh.visible = false;
  }

  /* Put down the puffs of clock `step` for each drift car. */
  emit(step, poses, drifters) {
    if (!(step >= 0)) {
      return;
    }
    if (step < this.lastEmit) {
      this.clear();
    }
    if (step === this.lastEmit) {
      return;
    }
    this.lastEmit = step;
    if (step % SMOKE_EVERY !== 0) {
      return;
    }
    const side = (step / SMOKE_EVERY) % 2 === 0 ? -1 : 1;
    for (let k = 0; k < drifters.length; k += 1) {
      const car = drifters[k];
      const p = poses[car.slot];
      if (!p || !p.on) {
        continue;
      }
      const slip = p.slip < 0 ? -p.slip : p.slip;
      if (slip < SMOKE_SLIP || !(p.speed >= SMOKE_SPEED)) {
        continue;
      }
      /* The rear wheel on this side: back along the heading to the rear
       * axle, across it by half the track. Right of the heading is
       * (-hz, hx) on the ground. */
      const back = car.axleRear;
      const across = side * car.track * 0.5;
      const i = this.next;
      this.next = (i + 1) % SMOKE_MAX;
      this.t0[i] = step;
      this.x[i] = p.x + p.hx * back - p.hz * across;
      this.y[i] = p.y + 0.2;
      this.z[i] = p.z + p.hz * back + p.hx * across;
      const h1 = hash01(step, car.slot, side + 3);
      const h2 = hash01(step + 7, car.slot, side + 11);
      const h3 = hash01(step + 13, car.slot, side + 17);
      this.vx[i] = p.vx * PUFF_CARRY + (h1 - 0.5) * 1.4;
      this.vz[i] = p.vz * PUFF_CARRY + (h2 - 0.5) * 1.4;
      const heavy = slip > 0.4 ? 1 : slip / 0.4;
      this.size[i] = PUFF_HALF * (0.7 + 0.3 * heavy) * (0.85 + 0.3 * h3);
      this.turn[i] = (h1 - 0.5) * 0.9;
      this.spin[i] = (h2 - 0.5) * 0.8;
    }
  }

  /* Every puff at clock `now`, ms, into the batch's buffers. */
  draw(now) {
    const C = this.centre.array;
    const P = this.puff.array;
    let live = 0;
    for (let i = 0; i < SMOKE_MAX; i += 1) {
      const t0 = this.t0[i];
      const age = (now - t0) * 0.001;
      const b3 = i * 12;
      const b4 = i * 16;
      if (t0 < 0 || !(age >= 0) || age >= SMOKE_LIFE) {
        if (P[b4] !== 0) {
          for (let v = 0; v < 4; v += 1) {
            P[b4 + v * 4] = 0;
          }
        }
        continue;
      }
      live += 1;
      const u = age / SMOKE_LIFE;
      const grow = 1 - (1 - u) * (1 - u);
      const half = this.size[i] * (1 + PUFF_GROW * grow);
      /* It leaves with its share of the car's speed and slows to a stop. */
      const carried = SMOKE_LIFE * (u - 0.5 * u * u);
      const x = this.x[i] + this.vx[i] * carried;
      const y = this.y[i] + PUFF_RISE * grow + half * 0.35;
      const z = this.z[i] + this.vz[i] * carried;
      const turn = this.turn[i] + this.spin[i] * u;
      /* The cut rises with age: the puff is eaten from its edge inward. */
      const cut = 0.07 + 0.8 * u * Math.sqrt(u);
      for (let v = 0; v < 4; v += 1) {
        C[b3 + v * 3] = x;
        C[b3 + v * 3 + 1] = y;
        C[b3 + v * 3 + 2] = z;
        P[b4 + v * 4] = half;
        P[b4 + v * 4 + 1] = turn;
        P[b4 + v * 4 + 2] = cut;
        P[b4 + v * 4 + 3] = u;
      }
    }
    if (live || this.live) {
      this.centre.needsUpdate = true;
      this.puff.needsUpdate = true;
    }
    this.live = live;
    this.mesh.visible = live > 0;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

/*
 * The cars. See the header.
 */
export function buildCars(THREE, look, traffic, opts = {}) {
  void opts;
  const group = new THREE.Group();
  group.name = 'cars';
  const klook = kitLook(look && look.timeId);
  const night = Boolean(look && look.time && look.time.night);
  const owned = { geometries: [], materials: [], textures: [] };
  const vehicles = (traffic && traffic.vehicles) || [];

  /* Shared by every car in the set: the wheels' material, and after dark
   * the lit headlamp and the glow. */
  const wheelMat = cel({ color: 0xffffff, vertexColors: true, bands: 3, tint: 0x5c5680, cache: false });
  owned.materials.push(wheelMat);
  /* A wheel not drawn: every instance starts here, and a car that goes
   * off puts its wheels back. */
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  let lampLit = null;
  let glowMat = null;
  if (night) {
    const tex = glowTexture(THREE);
    owned.textures.push(tex);
    glowMat = new THREE.MeshBasicMaterial({
      map: tex, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
    });
    glowMat.name = 'carGlow';
    lampLit = new THREE.MeshBasicMaterial({ color: LAMP_FRONT_LIT });
    lampLit.name = 'carLampLit';
    owned.materials.push(glowMat, lampLit);
  }

  const cars = [];
  let meshes = 0;
  let triangles = 0;
  const countTriangles = (geo, times = 1) => {
    triangles += times * (geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3);
  };
  /* The wheel sets: one InstancedMesh for every wheel of one kind in one
   * wheel colour, filled in below once every car has said how many it has. */
  const wheelSets = new Map();
  for (const v of vehicles) {
    const style = MODEL[v.style] ? v.style : 'kei';
    const colour = CAR[carColourOf(v.seed)] ?? CAR.white;
    const livery = style === 'r32' ? r32Livery(v.variant) : null;
    const root = new THREE.Object3D();
    root.name = `car:${v.element}`;
    root.visible = false;
    const body = buildCar({ kind: style, color: colour, variant: v.variant, wheels: false, detail: 'full' });
    let tailMat = null;
    body.traverse((o) => {
      if (!o.isMesh) {
        return;
      }
      owned.geometries.push(o.geometry);
      countTriangles(o.geometry);
      meshes += 1;
      const m = o.material;
      if (m.isMeshBasicMaterial && m.color.getHex() === LAMP_REAR) {
        /* Its own tail lamp, so it can brake on its own. */
        tailMat = m.clone();
        tailMat.color.setHex(night ? LAMP_REAR_LIT : LAMP_REAR);
        tailMat.userData = { ...m.userData };
        owned.materials.push(tailMat);
        o.material = tailMat;
      } else if (night && m.isMeshBasicMaterial && m.color.getHex() === LAMP_FRONT) {
        o.material = lampLit;
      } else if (klook && klook.flats) {
        o.material = lookedTownMaterial(m, klook);
      }
    });
    root.add(body);

    /* The wheels: where each stands on the car, and which set draws it. */
    const base = carWheelBase(style);
    const rim = livery && livery.rim ? livery.rim : null;
    const key = `${style}|${rim ?? '-'}`;
    let set = wheelSets.get(key);
    if (!set) {
      set = { style, rim, count: 0, mesh: null };
      wheelSets.set(key, set);
    }
    const wheels = [];
    for (let a = 0; a < base.axle.length; a += 1) {
      for (const side of [1, -1]) {
        wheels.push({ set, index: set.count, x: base.axle[a], z: side * base.z, side, front: a === 0 });
        set.count += 1;
      }
    }
    for (const t of base.twins) {
      wheels.push({ set, index: set.count, x: t.x, z: t.z, side: t.z > 0 ? 1 : -1, front: false });
      set.count += 1;
    }
    if (night) {
      const ggeo = glowGeometry(THREE, MODEL[style].L, body.userData.lamps);
      owned.geometries.push(ggeo);
      const glow = new THREE.Mesh(ggeo, glowMat);
      glow.name = 'carGlow';
      glow.renderOrder = 2;
      root.add(glow);
      countTriangles(ggeo);
      meshes += 1;
    }
    group.add(root);
    const label = v.name || (v.drift > 0 ? 'Drift car' : (STYLE_LABEL[v.style] ?? 'Car'));
    cars.push({
      slot: v.slot,
      element: v.element,
      style: v.style,
      label,
      drift: v.drift > 0,
      root,
      /* What place() and emit() read, kept flat. */
      wheels,
      tailMat,
      braking: false,
      R: base.R,
      camber: base.camber,
      wheelbase: base.axle[0] - base.axle[1],
      axleRear: base.axle[1],
      track: 2 * base.z,
      length: v.length,
      width: v.width,
      height: v.height,
      clearance: v.clearance || 0,
      /* The pose drawn last, for gapAt. */
      on: false,
      x: 0,
      y: 0,
      z: 0,
      hx: 1,
      hz: 0,
    });
  }

  /* Each wheel set's one batch: the kind's wheel, a matrix a wheel, written
   * by place() every frame. Never culled as a whole: its bounds would be
   * wherever the cars were when they were first measured. */
  for (const set of wheelSets.values()) {
    const geo = carWheelGeometry(set.style, { rim: set.rim });
    owned.geometries.push(geo);
    const mesh = new THREE.InstancedMesh(geo, wheelMat, set.count);
    mesh.name = 'carWheels';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < set.count; i += 1) {
      mesh.setMatrixAt(i, HIDDEN);
    }
    set.mesh = mesh;
    group.add(mesh);
    countTriangles(geo, set.count);
    meshes += 1;
  }

  const smoke = new Smoke(THREE, look);
  group.add(smoke.mesh);
  const drifters = cars.filter((c) => c.drift);
  const TAU = Math.PI * 2;
  /* place()'s scratch, made once so a frame allocates nothing. */
  const W_EULER = new THREE.Euler();
  const W_QUAT = new THREE.Quaternion();
  const W_FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const W_POS = new THREE.Vector3();
  const W_ONE = new THREE.Vector3(1, 1, 1);
  const W_LOCAL = new THREE.Matrix4();
  const W_MATRIX = new THREE.Matrix4();

  function place(prev, curr, alpha, now) {
    const a = alpha > 0 ? (alpha < 1 ? alpha : 1) : 0;
    const b = 1 - a;
    for (let k = 0; k < cars.length; k += 1) {
      const car = cars[k];
      const q = curr[car.slot];
      const p = prev[car.slot] && prev[car.slot].on ? prev[car.slot] : q;
      if (!q || !q.on) {
        if (car.on) {
          car.on = false;
          car.root.visible = false;
          for (let w = 0; w < car.wheels.length; w += 1) {
            const wh = car.wheels[w];
            wh.set.mesh.setMatrixAt(wh.index, HIDDEN);
            wh.set.mesh.instanceMatrix.needsUpdate = true;
          }
        }
        continue;
      }
      const x = p.x * b + q.x * a;
      const y = p.y * b + q.y * a;
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
      const root = car.root;
      root.visible = true;
      root.position.set(x, y, z);
      /* The model's nose is +x: a turn about y by t takes it to (cos t,
       * -sin t) on the ground. Render only, so atan2 is fine. */
      root.rotation.y = Math.atan2(-hz, hx);
      /* Rolled as far as it drove, the lap's worth taken off first so the
       * angle keeps its precision on a long run. */
      const dist = p.distance * b + q.distance * a;
      const turn = car.R * TAU;
      const roll = -((dist - Math.floor(dist / turn) * turn) / car.R);
      const slipAngle = 2 * Math.atan(q.slip || 0);
      let steer = Math.atan(car.wheelbase * (q.curvature || 0)) - slipAngle;
      steer = steer > STEER_MAX ? STEER_MAX : (steer < -STEER_MAX ? -STEER_MAX : steer);
      /* Each wheel: at its axle end, steered if it is a front one,
       * cambered, rolled, and turned out on its side, then carried by the
       * car. Written straight into its set's instance buffer. */
      root.updateMatrix();
      for (let w = 0; w < car.wheels.length; w += 1) {
        const wh = car.wheels[w];
        W_EULER.set(-wh.side * car.camber, wh.front ? steer : 0, roll, 'YXZ');
        W_QUAT.setFromEuler(W_EULER);
        if (wh.side < 0) {
          W_QUAT.multiply(W_FLIP);
        }
        W_POS.set(wh.x, car.R, wh.z);
        W_LOCAL.compose(W_POS, W_QUAT, W_ONE);
        W_MATRIX.multiplyMatrices(root.matrix, W_LOCAL);
        wh.set.mesh.setMatrixAt(wh.index, W_MATRIX);
        wh.set.mesh.instanceMatrix.needsUpdate = true;
      }
      if (car.tailMat) {
        /* One step apart, so the change in speed is a deceleration in
         * thousandths. */
        const braking = p !== q && (p.speed - q.speed) * 1000 >= BRAKE_DECEL;
        if (braking !== car.braking) {
          car.braking = braking;
          car.tailMat.color.setHex(braking ? LAMP_BRAKE : (night ? LAMP_REAR_LIT : LAMP_REAR));
        }
      }
    }
    smoke.draw(now);
  }

  function gapAt(px, py, pz, reach) {
    let best = reach;
    for (let k = 0; k < cars.length; k += 1) {
      const c = cars[k];
      if (!c.on) {
        continue;
      }
      const dx = px - c.x;
      const dz = pz - c.z;
      const along = dx * c.hx + dz * c.hz;
      const across = -dx * c.hz + dz * c.hx;
      const ea = Math.max(0, (along < 0 ? -along : along) - c.length / 2);
      const ec = Math.max(0, (across < 0 ? -across : across) - c.width / 2);
      const y0 = c.y + c.clearance;
      const ey = py < y0 ? y0 - py : Math.max(0, py - (y0 + c.height));
      const d = Math.sqrt(ea * ea + ec * ec + ey * ey);
      if (d < best) {
        best = d;
      }
    }
    return best;
  }

  return {
    group,
    cars,
    place,
    emit(step, poses) {
      smoke.emit(step, poses, drifters);
    },
    clearSmoke() {
      smoke.clear();
    },
    chaseCars() {
      return cars.map((c) => ({
        slot: c.slot,
        length: c.length,
        width: c.width,
        height: c.height,
        clearance: c.clearance,
        drift: c.drift,
        label: c.label,
      }));
    },
    gapAt,
    stats() {
      return { cars: cars.length, meshes: meshes + 1, triangles: Math.round(triangles + 2 * SMOKE_MAX), puffs: smoke.live };
    },
    dispose() {
      for (const g of owned.geometries) {
        g.dispose();
      }
      for (const m of owned.materials) {
        m.dispose();
      }
      for (const t of owned.textures) {
        t.dispose();
      }
      for (const set of wheelSets.values()) {
        set.mesh.dispose();
      }
      smoke.dispose();
      group.clear();
    },
  };
}
