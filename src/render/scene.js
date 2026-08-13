/*
 * scene.js: the world.
 *
 * Art direction, in the order it matters:
 *
 * Value structure. The sky is the brightest thing, the ground sits a clear
 * step below it, and objects sit a step below that, so a silhouette always
 * separates from what is behind it. Everything else is detail.
 *
 * Warm light, cool shadow. Handled by the ramp in celmat.js, but the world
 * has to cooperate: the hemisphere light is sky blue from above and warm
 * green from below so bounce reads as grass light, and the fog is the same
 * hue as the horizon band of the sky so distance dissolves instead of
 * clipping.
 *
 * Ground detail near, silhouettes far. Wind animated grass covers the
 * ground the pilot actually flies through, because at 20 m/s the sensation
 * of speed comes almost entirely from close ground texture moving. Beyond
 * that, trees and rocks carry the parallax, and the mountain rings carry
 * the horizon.
 *
 * All static scenery is authored directly in Three.js space (y up). Only
 * the quad's simulated state crosses frames, and that conversion lives in
 * frame.js and nowhere else.
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
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial, outlineHull, updateCelTime, CLOUD_SHADOW_GLSL } from './celmat.js';
/* The obstacle dimensions come from the track module, which holds MultiGP's
 * published figures and converts from feet exactly once. No dimension in
 * this file is typed twice. */
import { OBSTACLES, FRAME_TUBE_OD } from '../game/track.js';
import { Colliders } from '../game/collide.js';

/*
 * Static scenery merger. A forest of individual Groups costs a draw call
 * per mesh, twice (once for the view, once for the outline prepass), and
 * that is what turns four hundred trees into four thousand draws. Every
 * static object is instead baked into one merged mesh per distinct
 * material, keyed by the material options, so the whole forest, all the
 * rocks, the cliffs and the mountain rings come down to a couple of dozen
 * draws with pixels identical to the unmerged scene.
 */
function makeBaker() {
  const buckets = new Map();
  function bake(root) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) {
        return;
      }
      let key;
      if (o.material.userData.celKey != null) {
        key = `cel:${o.material.userData.celKey}`;
      } else if (o.material.userData.hullColor != null) {
        key = `hull:${o.material.userData.hullColor}`;
      } else {
        key = `mat:${o.material.uuid}`;
      }
      let b = buckets.get(key);
      if (!b) {
        b = { material: o.material, hull: o.material.userData.hullColor != null, geos: [] };
        buckets.set(key, b);
      }
      /* Non-indexed so polyhedra and cylinders merge into one buffer. */
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      b.geos.push(geo);
    });
  }
  function flush(scene, layer) {
    const meshes = [];
    for (const b of buckets.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(b.geos, false), b.material);
      if (!b.hull) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      if (layer) {
        mesh.layers.set(layer);
      }
      scene.add(mesh);
      meshes.push(mesh);
    }
    buckets.clear();
    return meshes;
  }
  return { bake, flush };
}

const SUN_DIR = new THREE.Vector3(0.60, 0.50, 0.62).normalize();
const HORIZON = 0xf2e3cb;
/* Zenith blue. Measured at 0x2e6bb8 the sky's linear luminance was 0.248
 * and the lit meadow's was 0.257, so sky and ground occupied ONE value
 * band and separated by hue alone. Blue carries little luminance, so the
 * fix is a paler zenith rather than a bluer one. */
const SKY_HIGH = 0x6ea3d8;
const FOG_NEAR = 130;
/* 2200, not 780. At 780 every piece of terrain past that distance renders
 * as exactly the horizon colour, 0.781 linear, which leaves no room above
 * it for a mountain ladder that also has to stay below the sky. At 2200
 * the terrain's far edge at 850 m lands at 0.428 and the four ridge rings
 * fit above it at 0.49, 0.56, 0.63 and 0.70 with the sky at 0.781. */
const FOG_FAR = 2200;

/* Deterministic hash based noise: the world must be identical every load,
 * so two people comparing notes are describing the same place. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* Smooth value noise for the terrain, built from the same integer hash. */
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 4; o += 1) {
    sum += amp * valueNoise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

/* Figure of eight circuit. */
function trackCurve() {
  const pts = [];
  const n = 16;
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    const d = 1 + Math.sin(t) * Math.sin(t);
    pts.push(new THREE.Vector3((105 * Math.cos(t)) / d, 0, (118 * Math.sin(t) * Math.cos(t)) / d));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.4);
}

/* A lake gives the eye somewhere to rest, a hard value contrast against
 * all the green, and a reflection cue for altitude. Basin is carved into
 * the height field so the shoreline is a real intersection, not a decal. */
export const LAKE = { x: 250, z: -205, r: 96, level: -7.5 };

/* Terrain height, shared by the mesh and by anything placed on it. */
function makeHeightField(samples) {
  return (x, z) => {
    const base = (fbm(x * 0.0022, z * 0.0022) - 0.5) * 34;
    const detail = (fbm(x * 0.011, z * 0.011) - 0.5) * 4.5;
    let d = 1e9;
    for (const s of samples) {
      const dx = x - s.x;
      const dz = z - s.z;
      const dd = dx * dx + dz * dz;
      if (dd < d) {
        d = dd;
      }
    }
    d = Math.sqrt(d);
    /* Flatten a corridor along the circuit so the track is flyable, with a
     * soft shoulder so it does not look stamped. */
    const flat = Math.min(1, Math.max(0, (d - 30) / 70));
    const s2 = flat * flat * (3 - 2 * flat);
    let h = (base + detail) * s2;

    /* Carve the lake basin: a smooth bowl, deepest at the centre. */
    const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (ld < LAKE.r * 1.35) {
      const k = 1 - Math.min(1, ld / (LAKE.r * 1.35));
      const bowl = k * k * (3 - 2 * k);
      h = h * (1 - bowl) + (LAKE.level - 5.5) * bowl;
    }
    return h;
  };
}

/*
 * Ground albedo at a point, shared by the terrain mesh and the grass
 * roots. The single strongest tell that grass and terrain are two
 * disjoint systems is a blade whose root is a different green from the
 * ground it grows out of; sampling one function for both makes the
 * meadow read as one surface with lighter tips.
 */
const GROUND = {
  grassLow: new THREE.Color(0x4f8c3c),
  grassHigh: new THREE.Color(0x86b95a),
  rock: new THREE.Color(0x8b8578),
  patchWarm: new THREE.Color(0x7fa84a),
  patchDark: new THREE.Color(0x3f7a3a),
  earth: new THREE.Color(0x9c8f6e),
  sand: new THREE.Color(0xd8cfa8),
};
function groundAlbedo(x, z, y, samples, c) {
  /* Colour by altitude, then three scales of variation: large patches
   * read as different ground cover from the air, a mid scale macro
   * (period about 33 m) breaks the monotone at racing height, and fine
   * speckle keeps it from banding. */
  const t = Math.min(1, Math.max(0, (y + 12) / 34));
  c.copy(GROUND.grassLow).lerp(GROUND.grassHigh, t);
  const patch = fbm(x * 0.0065, z * 0.0065);
  c.lerp(GROUND.patchWarm, Math.max(0, (patch - 0.5) * 1.5));
  c.lerp(GROUND.patchDark, Math.max(0, (0.5 - patch) * 1.1));
  const macro = fbm(x * 0.03, z * 0.03);
  c.multiplyScalar(0.97 + (macro - 0.5) * 0.13);
  const speck = fbm(x * 0.06, z * 0.06);
  c.multiplyScalar(0.94 + speck * 0.12);
  c.lerp(GROUND.rock, Math.min(0.5, Math.max(0, (y - 14) / 22)) * (0.5 + speck * 0.5));
  /* Beaten earth along the racing line, and sand at the waterline. */
  let dTrack = 1e9;
  for (const s of samples) {
    dTrack = Math.min(dTrack, Math.hypot(x - s.x, z - s.z));
  }
  const onPath = 1 - Math.min(1, Math.max(0, (dTrack - 2.5) / 5));
  c.lerp(GROUND.earth, onPath * 0.42 * (0.7 + speck * 0.6));
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  const shore = 1 - Math.min(1, Math.abs(y - LAKE.level) / 3.5);
  if (ld < LAKE.r * 1.5 && shore > 0) {
    c.lerp(GROUND.sand, shore * 0.8);
  }
  return c;
}

function terrain(height, samples) {
  const size = 1700;
  const seg = 230;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const rockCol = GROUND.rock;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = height(x, z);
    pos.setY(i, y);
    /* Slope rock is applied after normals exist, below. */
    groundAlbedo(x, z, y, samples, c);
    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  /* Steep faces go to rock: cheap, and it stops hills looking like felt. */
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i += 1) {
    const slope = 1 - nrm.getY(i);
    if (slope > 0.25) {
      const k = Math.min(1, (slope - 0.25) / 0.35);
      colors[i * 3 + 0] += (rockCol.r - colors[i * 3 + 0]) * k;
      colors[i * 3 + 1] += (rockCol.g - colors[i * 3 + 1]) * k;
      colors[i * 3 + 2] += (rockCol.b - colors[i * 3 + 2]) * k;
    }
  }
  geo.attributes.color.needsUpdate = true;
  const mat = celMaterial({ color: 0xffffff, rim: 0.0, cloudShadow: 0.34 });
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/*
 * Stylised water. Flat banded colour rather than a reflection: shallow
 * water near the shore reads light and warm, deep water dark and cool,
 * with a hard band between them, and animated crests that catch the light.
 * The shoreline foam line is what sells it, because that is where the eye
 * checks whether water is water.
 */
function water() {
  const geo = new THREE.CircleGeometry(LAKE.r * 1.24, 72);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0x63c6c9) },
      uDeep: { value: new THREE.Color(0x1d5f8c) },
      uFoam: { value: new THREE.Color(0xeaf7ff) },
      uFogColor: { value: new THREE.Color(HORIZON) },
      uFogNear: { value: FOG_NEAR },
      uFogFar: { value: FOG_FAR },
      uRadius: { value: LAKE.r * 1.24 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vLocal;
      varying float vFog;
      uniform float uTime;
      void main() {
        vLocal = position.xz;
        vec3 p = position;
        p.y += sin(p.x * 0.12 + uTime * 1.3) * 0.09 + sin(p.z * 0.17 - uTime * 0.9) * 0.07;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vFog = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vLocal;
      varying float vFog;
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uRadius;
      void main() {
        float r = length(vLocal) / uRadius;
        // banded depth ramp, quantised so it reads painted
        float depth = 1.0 - r;
        float band = floor(depth * 4.0) / 4.0;
        vec3 col = mix(uShallow, uDeep, band);
        // moving crest lines
        float crest = sin(vLocal.x * 0.33 + uTime * 1.1) * sin(vLocal.y * 0.27 - uTime * 0.8);
        col += uFoam * step(0.82, crest) * 0.35;
        // shoreline foam
        float foam = smoothstep(0.9, 1.0, r);
        col = mix(col, uFoam, foam * 0.85);
        float f = clamp((vFog - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
        gl_FragColor = vec4(mix(col, uFogColor, f), 0.93);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(LAKE.x, LAKE.level, LAKE.z);
  /* No ink outline on water: an edge pass on a flat plane draws a hard
   * line round the whole lake and it stops reading as a surface. */
  mesh.layers.set(1);
  return { mesh, mat };
}

/*
 * Cliff spires. The valley needs vertical landmarks: something to judge
 * altitude and distance against, and something to break the horizon so
 * the eye has a focal point other than the gates.
 */
function cliff(rng, height, x, z, caps) {
  const g = new THREE.Group();
  const tierCaps = [];
  const tiers = 2 + Math.floor(rng() * 3);
  let y = 0;
  let r = 7 + rng() * 9;
  for (let i = 0; i < tiers; i += 1) {
    const h = 9 + rng() * 15;
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.72, r, h, 6 + Math.floor(rng() * 3), 1),
      celMaterial({ color: i % 2 ? 0x8f8a7c : 0x9a9487, rim: 0.24, cloudShadow: 0.3 }),
    );
    m.position.y = y + h / 2;
    m.rotation.y = rng() * 3;
    m.castShadow = true;
    m.receiveShadow = true;
    outlineHull(m, 1.03);
    g.add(m);
    if (caps) {
      /* Collected in the cliff's own frame and pushed once the base height
       * is known, a few lines below. */
      tierCaps.push(y, y + h, r);
    }
    y += h * 0.92;
    r *= 0.74;
  }
  /* Grass cap so it does not look like bare geology dropped in a field. */
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.78, r * 0.95, 1.6, 7),
    celMaterial({ color: 0x5fa348, rim: 0.3, cloudShadow: 0.3 }),
  );
  cap.position.y = y + 0.8;
  cap.castShadow = true;
  outlineHull(cap, 1.04);
  g.add(cap);
  const base = height(x, z) - 1;
  g.position.set(x, base, z);
  if (caps) {
    for (let i = 0; i < tierCaps.length; i += 3) {
      caps.addPost('cliff', x, z, base + tierCaps[i], base + tierCaps[i + 1], tierCaps[i + 2]);
    }
  }
  return g;
}

/*
 * Grass. One merged buffer rather than instancing: a single draw call, and
 * the wind is a vertex shader function of world position so neighbouring
 * blades move together in gusts instead of each doing its own thing.
 */
function grassField(height, samples, rng) {
  /*
   * Blade count and blade size, both measured against a frame rather than
   * guessed. 46000 blades of 7.5 to 13 cm width spread over 900 by 900 m
   * put roughly one blade per two square metres, so at eye height the near
   * field was a handful of very large isolated fins over bare ground: it
   * read as scattered debris, not as a meadow, and a blade as wide as a
   * hand also reads as the wrong plant. Four times as many blades, half as
   * wide, concentrated in a tighter band along the circuit where the eye
   * actually is.
   */
  const BLADES = 184000;
  const positions = new Float32Array(BLADES * 5 * 3);
  const colors = new Float32Array(BLADES * 5 * 3);
  const bend = new Float32Array(BLADES * 5);
  const indices = new Uint32Array(BLADES * 9);
  const rootC = new THREE.Color();
  const tipC = new THREE.Color();
  const c = new THREE.Color();
  let vi = 0;
  let ii = 0;
  let made = 0;
  for (let i = 0; i < BLADES; i += 1) {
    /* Bias placement toward the circuit: that is where the eye is. */
    let x;
    let z;
    if (rng() < 0.84) {
      const s = samples[Math.floor(rng() * samples.length)];
      const a = rng() * Math.PI * 2;
      /* Radius from a cubed uniform, not a uniform: dense at the circuit
       * and thinning outward to 42 m. A flat distribution inside a hard
       * radius projects its outer wall as a ruler straight horizontal line
       * across the frame, which is exactly what it did at 22 m. */
      const u = rng();
      const r = 1 + 41 * u * u * u;
      x = s.x + Math.cos(a) * r;
      z = s.z + Math.sin(a) * r;
    } else {
      x = (rng() - 0.5) * 900;
      z = (rng() - 0.5) * 900;
    }
    const y = height(x, z);
    /*
     * Blade height, and it is a SCALE decision rather than a look decision.
     * It was 0.26 to 0.68 m, chosen when a gate was 5 m tall and its aperture
     * centre was 2.5 m up. A regulation MultiGP gate is 1.524 m to the top of
     * its opening, so grass to 0.68 m is knee deep beside it and the gates
     * drown: measured on the title frame, the mid field grass reached most of
     * the way up the gate and the target was invisible at 20 m. MultiGP also
     * says a course should be as flat as possible, and a chapter races on
     * mown grass. 0.09 to 0.24 m is ankle height, which puts the gate back to
     * being the tallest thing near the racing line.
     */
    /*
     * Blade HEIGHT, and the resting camera is what settles it.
     *
     * 0.09 to 0.24 m was already a correction from 0.26 to 0.68, but a quad at
     * rest has its camera 7.5 cm off the deck, so grass to 24 cm put the FPV
     * camera INSIDE the canopy and the first frame of the game was half filled
     * with slabs of leaf. A mown chapter field is 3 to 5 cm and MultiGP asks for
     * a course as flat as possible, so 3 to 9 cm is both what the sport uses and
     * what leaves a parked quad able to see.
     */
    const h = 0.03 + rng() * 0.06;
    /*
     * Blade WIDTH, and it was the worst scale error in the project.
     *
     * Measured in a frame rather than inferred: one blade's base came out
     * 0.0985 m across, which is 39 percent of the 250 mm craft's span. Real
     * grass is about 4 mm, 1.6 percent. The finest detail in every frame was
     * half the aircraft, so the aircraft read as a toy no matter how correct
     * its own dimensions were. Aspect ratio was 0.80 to 4.6 where real grass
     * is 15 to 60.
     *
     * 8 to 18 mm is a compromise, not the real 4 mm: the blade count is left
     * alone because it drives the rng stream for the whole world and because
     * P2 and P10 are already over budget, and 4 mm blades at this density
     * would be invisible. Aspect is now 5 to 30, which is in the right
     * territory. Raising the count to recover ground cover is the next round's
     * call and it makes P2 and P10 worse, which has to be said out loud.
     */
    const w = 0.008 + rng() * 0.010;
    const a = rng() * Math.PI;
    const dx = Math.cos(a) * w;
    const dz = Math.sin(a) * w;
    /* Root exactly the ground colour, tip lifted about 13 percent in
     * value and nudged warm. One meadow, lighter at the tips. */
    groundAlbedo(x, z, y, samples, rootC);
    tipC.copy(rootC).offsetHSL(0.012, 0.06, 0.13);
    /* Five vertices: a tapered blade, base pair, mid pair, single tip. */
    const vs = [
      [x - dx, y, z - dz, 0],
      [x + dx, y, z + dz, 0],
      [x - dx * 0.6, y + h * 0.6, z - dz * 0.6, 0.6],
      [x + dx * 0.6, y + h * 0.6, z + dz * 0.6, 0.6],
      [x, y + h, z, 1],
    ];
    const v0 = vi / 3;
    for (const [vx, vy, vz, b] of vs) {
      positions[vi + 0] = vx;
      positions[vi + 1] = vy;
      positions[vi + 2] = vz;
      /* Per blade hue and value jitter: a field of identical blades reads
       * as one plastic sheet no matter how it is lit. Jitter stays small
       * so the roots keep matching the ground. */
      c.copy(rootC).lerp(tipC, b * (0.55 + rng() * 0.45));
      c.offsetHSL((rng() - 0.5) * 0.025, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.05);
      colors[vi + 0] = c.r;
      colors[vi + 1] = c.g;
      colors[vi + 2] = c.b;
      bend[vi / 3] = b;
      vi += 3;
    }
    indices[ii++] = v0 + 0; indices[ii++] = v0 + 1; indices[ii++] = v0 + 2;
    indices[ii++] = v0 + 1; indices[ii++] = v0 + 3; indices[ii++] = v0 + 2;
    indices[ii++] = v0 + 2; indices[ii++] = v0 + 3; indices[ii++] = v0 + 4;
    made += 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, made * 15), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors.subarray(0, made * 15), 3));
  geo.setAttribute('aBend', new THREE.BufferAttribute(bend.subarray(0, made * 5), 1));
  geo.setIndex(new THREE.BufferAttribute(indices.subarray(0, made * 9), 1));
  geo.computeBoundingSphere();

  /*
   * Light for the blades, derived from the scene's own lights rather than
   * guessed, so a blade matches the ground it grows out of.
   *
   * A toon surface facing up receives sunColour x sunIntensity x the
   * ramp's lit band, plus the hemisphere light's sky colour x its
   * intensity. In shadow it receives the ramp's cool band instead. Those
   * two products are GRASS_LIT and GRASS_SHADE, in linear working space,
   * and the numbers come from SUN_COLOUR 0xffe9c4 at 1.45, the hemisphere
   * 0x8fb8e8 at 0.42, and the ramp stops in celmat.js. Measured against a
   * frame afterwards, not asserted: see PROGRESS.md.
   *
   * Before this the fragment shader was one line, vec3 col = vColor, with
   * a comment claiming the sun gain was baked in. It was not, and a
   * reviewer measured the meadow at 27 percent darker than the terrain
   * underneath it.
   */
  const mat = new THREE.ShaderMaterial({
    lights: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      {
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color(HORIZON) },
        uFogNear: { value: FOG_NEAR },
        uFogFar: { value: FOG_FAR },
        uSun: { value: SUN_DIR.clone() },
        uQuad: { value: new THREE.Vector3(0, -100, 0) },
        uWash: { value: 0 },
        uLit: { value: new THREE.Vector3(1.568, 1.300, 0.938) },
        uShade: { value: new THREE.Vector3(0.331, 0.463, 0.719) },
        uCloud: { value: 0.34 },
      },
    ]),
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <shadowmap_pars_vertex>
      attribute float aBend;
      varying vec3 vColor;
      varying float vFog;
      varying float vBend;
      varying vec3 vWorld;
      uniform float uTime;
      uniform vec3 uQuad;
      uniform float uWash;
      void main() {
        vColor = color;
        vBend = aBend;
        vec3 p = position;
        // gusts: a slow travelling wave across the field plus a fast
        // flutter, both keyed to world position so blades move as a mass
        float gust = sin(p.x * 0.045 + p.z * 0.03 + uTime * 1.1);
        float flutter = sin(p.x * 0.9 + p.z * 0.7 + uTime * 5.5);
        float amp = aBend * aBend;
        /* Tip travel used to reach 0.461 m, which is 1.9 to 5.1 times the
         * blade's OWN height: a blade cannot throw its tip twice its length,
         * and the near field read as a floor of half metre ribbons rather than
         * as grass. Capped at about a quarter of blade height. */
        p.x += (gust * 0.050 + flutter * 0.012) * amp;
        p.z += (gust * 0.030 + flutter * 0.010) * amp;
        p.y -= abs(gust) * 0.05 * amp;
        // propwash: grass under the craft blasts radially outward and
        // flattens, hardest directly below, gone a few metres out. This
        // is the strongest low altitude speed and height cue there is.
        vec2 dq = p.xz - uQuad.xz;
        float dHor = length(dq);
        float wash = uWash
          * (1.0 - smoothstep(0.4, 3.4, dHor))
          * (1.0 - smoothstep(1.0, 7.5, uQuad.y - p.y));
        if (wash > 0.001) {
          vec2 dir = dHor > 0.05 ? dq / dHor : vec2(1.0, 0.0);
          float shake = sin(uTime * 29.0 + p.x * 7.3 + p.z * 5.1);
          p.x += dir.x * wash * amp * (0.85 + 0.3 * shake);
          p.z += dir.y * wash * amp * (0.85 + 0.3 * shake);
          p.y -= wash * amp * 0.4;
        }
        /* The shadow chunks want a world position and a normal to offset
         * along. Blades stand on the ground, so up is the right normal for
         * the bias, and it is only used for the bias. */
        vec4 worldPosition = modelMatrix * vec4(p, 1.0);
        vWorld = worldPosition.xyz;
        vec3 transformedNormal = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
        #include <shadowmap_vertex>
        vec4 mv = viewMatrix * worldPosition;
        vFog = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <packing>
      #include <shadowmap_pars_fragment>
      /* getShadowMask reads a bool called receiveShadow, which the
       * renderer declares for its own materials and not for a raw
       * ShaderMaterial. This grass always receives shadows, so define it
       * rather than plumb a uniform nothing would ever set to false. */
      #define receiveShadow true
      #include <shadowmask_pars_fragment>
      ${CLOUD_SHADOW_GLSL}
      varying vec3 vColor;
      varying float vFog;
      varying float vBend;
      varying vec3 vWorld;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec3 uLit;
      uniform vec3 uShade;
      uniform float uCloud;
      uniform float uTime;
      void main() {
        /* The same two light products the terrain gets, so a blade is the
         * value of the ground plus a little, never a darker rash on it. */
        float lit = getShadowMask();
        lit *= 1.0 - uCloud * celCloudShadow(vWorld.xz, uTime);
        /* Roots sit in the field's own occlusion, tips catch the sun. A
         * shallow ramp: a steep one turns a meadow into stripes. */
        lit *= 0.74 + 0.26 * vBend;
        vec3 col = vColor * mix(uShade, uLit, lit);
        float f = clamp((vFog - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
        gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
      }
    `,
  });
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, mat };
}

/*
 * caps, when given, collects this tree's colliders. They are pushed from the
 * values the geometry is actually built from, inside the same draw, because
 * the baker merges every instance into one anonymous buffer and a tree's
 * trunk radius cannot be recovered afterwards. Nothing here consumes an
 * extra rng() value: the whole world hangs off one stream in one order, so
 * an extra draw would move every tree, flower and mountain in the valley.
 */
function tree(rng, height, x, z, caps) {
  const g = new THREE.Group();
  const scale = 0.85 + rng() * 1.5;
  const trunkH = (1.5 + rng() * 1.3) * scale;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13 * scale, 0.24 * scale, trunkH, 6),
    celMaterial({ color: 0x6b4a2f, rim: 0.18 }),
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  outlineHull(trunk, 1.1);
  g.add(trunk);

  /* Rounded, slightly irregular canopy masses rather than cones: the
   * silhouette is what sells a stylised tree. */
  const tints = [0x4c9440, 0x5aa348, 0x429038, 0x69ad4e];
  const tint = tints[Math.floor(rng() * tints.length)];
  const blobs = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < blobs; i += 1) {
    const r = (1.05 - i * 0.1 + rng() * 0.35) * scale;
    /* Smooth normals: a flat shaded icosahedron gives every facet its own
     * toon band and its own crease line, which reads as crumpled paper up
     * close. A smooth blob shades as one round mass with a curved band
     * edge, which is how this style draws a canopy. */
    let blobGeo = new THREE.IcosahedronGeometry(r, 1);
    blobGeo = mergeVertices(blobGeo);
    blobGeo.computeVertexNormals();
    const blob = new THREE.Mesh(
      blobGeo,
      celMaterial({ color: tint, rim: 0.3 }),
    );
    const a = rng() * Math.PI * 2;
    const spread = i === 0 ? 0 : (0.35 + rng() * 0.55) * scale;
    blob.position.set(
      Math.cos(a) * spread,
      trunkH + (0.5 + i * 0.42 + rng() * 0.25) * scale,
      Math.sin(a) * spread,
    );
    blob.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    blob.castShadow = true;
    outlineHull(blob, 1.055);
    g.add(blob);
  }
  const gy = height(x, z);
  g.position.set(x, gy, z);
  if (caps) {
    /* The trunk, as a vertical capsule at the mean of its two radii. A
     * tapered cylinder is not a capsule, and the difference over a 3 m
     * trunk is a couple of centimetres of radius, which is inside the
     * craft's own 0.19 m. */
    caps.addPost('tree', x, z, gy, gy + trunkH, (0.13 + 0.24) * 0.5 * scale);
    for (const c of g.children) {
      if (c.isMesh && c.geometry.type === 'IcosahedronGeometry') {
        caps.addSphere('canopy', x + c.position.x, gy + c.position.y, z + c.position.z,
          c.geometry.parameters.radius);
      }
    }
  }
  return g;
}

function rock(rng, height, x, z, caps) {
  const r = 0.6 + rng() * 2.4;
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(r, 0),
    celMaterial({ color: 0x8e8b82, rim: 0.26 }),
  );
  m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  m.scale.set(1, 0.7 + rng() * 0.5, 1);
  m.castShadow = true;
  outlineHull(m, 1.05);
  m.position.set(x, height(x, z) + r * 0.35, z);
  if (caps) {
    /* A dodecahedron scaled flat in y. The collider is a sphere at the
     * mesh's own centre, using the y scale so a squashed rock is not a
     * boulder to fly into: the horizontal radius is the one that matters
     * and it is r. */
    caps.addSphere('rock', x, m.position.y, z, r * 0.92);
  }
  return m;
}

/*
 * The obstacle library, built to MultiGP dimensions.
 *
 * This used to be one function called gate() that built a 6.0 by 5.0 m frame
 * around a torus of radius 1.9, giving a clear span of 3.5 m. The MultiGP
 * standard gate opening is 5 ft square, 1.524 m, so the old gate was 2.30
 * times regulation, and because every judgement about how big this valley is
 * was anchored to it, a 250 mm quad read as a toy in a stadium. Every
 * dimension here now comes from src/game/track.js, which holds the published
 * figures and converts from feet once.
 *
 * What makes it read as a MultiGP gate rather than a hoop: a SQUARE opening,
 * a PVC tube frame of four members, mesh side panels outboard of the
 * uprights, and a top panel carrying the gate number. A photograph of a
 * chapter gate and a screenshot of this should be recognisably the same
 * object.
 *
 * Materials are created ONCE and shared by every obstacle, so the baker's
 * celKey buckets merge all eight obstacles' static parts into a handful of
 * draw calls. The old gate made a new celMaterial per gate and a new
 * MeshBasicMaterial per pip, which is most of why 636 of 698 draw calls
 * carried half a percent of the triangles.
 *
 * Only the parts that animate stay per obstacle: the aperture outline, its
 * halo and its additive glow, whose gains are driven per frame so the pilot
 * always has a target. That is three draw calls per obstacle instead of
 * about twenty five.
 */
let SHARED = null;
function sharedObstacleMats() {
  if (SHARED) {
    return SHARED;
  }
  SHARED = {
    /* Navy the ramp can actually band: near black frames read as untextured
     * masses because lit and shadow faces cannot separate. */
    frame: celMaterial({ color: 0x2a3352, rim: 0.3 }),
    /* Vinyl mesh panel. Real ones are a printed scrim, so a flat mid value
     * with a little rim reads closer than anything shiny. */
    panel: celMaterial({ color: 0x3d4763, rim: 0.22 }),
    panelStart: celMaterial({ color: 0x24603d, rim: 0.24 }),
    panelRace: celMaterial({ color: 0x6b2a22, rim: 0.24 }),
    /* The number, unlit so it stays legible against a dark panel at speed. */
    number: new THREE.MeshBasicMaterial({ color: 0xfff4d6 }),
  };
  return SHARED;
}

/*
 * Gate numbers as a 3 by 5 dot matrix. A count of pip marks was readable as
 * a quantity but not as a number, and a real gate carries a numeral, so this
 * builds one out of small boxes. Rows are top to bottom, one string per row
 * group, three characters wide.
 */
const DIGITS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};

/*
 * One obstacle, at its published dimensions.
 *
 * kindName indexes OBSTACLES in src/game/track.js. index is the gate's
 * number in FLYING order, painted on the top panel. isStart makes it the
 * start and finish gate, which is green.
 *
 * Returns the group, the per obstacle animated materials, the apertures (one
 * per opening, so a ladder returns three), and the colliders in the group's
 * OWN local frame, for the placement code to transform. Local frame: x
 * across the opening, y up from the base, z through the opening.
 */
function obstacle(kindName, index, isStart) {
  const spec = OBSTACLES[kindName];
  if (!spec) {
    throw new Error(`scene: unknown obstacle ${kindName}`);
  }
  const g = new THREE.Group();
  const mats = sharedObstacleMats();
  const tubeR = FRAME_TUBE_OD * 0.5;
  const clearW = spec.clearW;
  const clearH = spec.clearH;
  const stack = spec.stack ?? 1;
  const caps = [];

  /*
   * Where each opening's sill sits.
   *
   * MultiGP publishes the opening and the elevation but NOT the spacing
   * between the openings of a stacked obstacle, so the spacing is derived:
   * two openings share one cross member, so the pitch is one clear height
   * plus one tube diameter. That rests on the tube diameter, which
   * track.js marks as an assumption (1 inch nominal schedule 40 PVC) and
   * not as a citation, so the ladder's overall height is an assumption too.
   * The openings themselves are published and exact.
   */
  const pitch = clearH + FRAME_TUBE_OD;
  const sills = [];
  for (let k = 0; k < stack; k += 1) {
    sills.push(spec.sillH + k * pitch);
  }
  const topSurface = sills[stack - 1] + clearH;

  /* Uprights. Their INNER surfaces are the opening's width, so their
   * centres sit half a tube outboard of the clear span. They run from the
   * ground to just above the topmost cross member, which is what makes a
   * tower or a dive gate a tower rather than a floating hoop. */
  const upX = clearW * 0.5 + tubeR;
  const upTop = topSurface + 2 * tubeR;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeR, tubeR, upTop, 8),
      mats.frame,
    );
    post.position.set(sx * upX, upTop * 0.5, 0);
    post.castShadow = true;
    outlineHull(post, 1.06);
    g.add(post);
    caps.push({ kind: 'gate', ax: sx * upX, ay: 0, az: 0, bx: sx * upX, by: upTop, bz: 0, r: tubeR });

    /* A foot, so it looks like it is standing on the grass rather than
     * growing out of it. */
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.62), mats.frame);
    foot.position.set(sx * upX, 0.04, 0);
    foot.castShadow = true;
    g.add(foot);
    caps.push({ kind: 'obstacle', ax: sx * upX, ay: 0.04, az: -0.31, bx: sx * upX, by: 0.04, bz: 0.31, r: 0.17 });
  }

  /* Cross members. One above every opening, and one below the lowest
   * opening only when that opening is off the ground: a gate standing on
   * grass has the ground as its sill, which is how a 5 ft opening is
   * measured on a chapter gate. */
  const memberLen = clearW + 4 * tubeR;
  const members = [];
  for (let k = 0; k < stack; k += 1) {
    members.push(sills[k] + clearH + tubeR);
  }
  if (spec.sillH > 0) {
    members.push(spec.sillH - tubeR);
  }
  for (const my of members) {
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeR, tubeR, memberLen, 8),
      mats.frame,
    );
    bar.rotation.z = Math.PI * 0.5;
    bar.position.set(0, my, 0);
    bar.castShadow = true;
    outlineHull(bar, 1.06);
    g.add(bar);
    caps.push({ kind: 'gate', ax: -memberLen * 0.5, ay: my, az: 0, bx: memberLen * 0.5, by: my, bz: 0, r: tubeR });
  }

  /* Mesh side panels, outboard of each upright. They are what a pilot
   * actually reads the gate's plane from at speed, and they are solid, so
   * their collider sits entirely outboard of the clear span. */
  const panelW = 0.42;
  const panelMat = isStart ? mats.panelStart : mats.panelRace;
  const panelBottom = sills[0];
  const panelH = topSurface - panelBottom;
  for (const sx of [-1, 1]) {
    const cx = sx * (upX + tubeR + panelW * 0.5);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, 0.03), panelMat);
    panel.position.set(cx, panelBottom + panelH * 0.5, 0);
    panel.castShadow = true;
    g.add(panel);
    caps.push({ kind: 'obstacle', ax: cx, ay: panelBottom, az: 0, bx: cx, by: panelBottom + panelH, bz: 0, r: panelW * 0.5 });
  }

  /* The top panel and the number on it. */
  const plateH = 0.44;
  const plateY = upTop + plateH * 0.5;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(clearW * 0.92, plateH, 0.05), panelMat);
  plate.position.set(0, plateY, 0);
  plate.castShadow = true;
  outlineHull(plate, 1.04);
  g.add(plate);
  caps.push({ kind: 'obstacle', ax: -clearW * 0.46, ay: plateY, az: 0, bx: clearW * 0.46, by: plateY, bz: 0, r: plateH * 0.5 });

  const rows = DIGITS[index % 10] ?? DIGITS[0];
  const dot = 0.055;
  const step = 0.072;
  for (let ry = 0; ry < rows.length; ry += 1) {
    for (let rx = 0; rx < 3; rx += 1) {
      if (rows[ry][rx] !== '1') {
        continue;
      }
      const pip = new THREE.Mesh(new THREE.BoxGeometry(dot, dot, 0.03), mats.number);
      pip.position.set(
        (rx - 1) * step,
        plateY + (2 - ry) * step,
        0.04,
      );
      g.add(pip);
    }
  }

  /*
   * The aperture markers. Square now, because the opening is square, and
   * built as one merged geometry per obstacle so a stacked obstacle still
   * costs one draw call for all of its outlines.
   *
   * The glow sits on the PRIMARY opening, which for a stack is the middle
   * one: that is the opening the racing line is aimed at, and lighting all
   * three equally would tell the pilot nothing about where to go.
   */
  const ringColor = isStart ? 0x7dffb4 : 0xffd45c;
  const primary = Math.floor(stack / 2);
  const outlineGeos = [];
  const haloGeos = [];
  for (let k = 0; k < stack; k += 1) {
    const cy = sills[k] + clearH * 0.5;
    /*
     * The lit bar's thickness, and it is a LEGIBILITY number.
     *
     * 0.045 m was invisible at 20 m once the opening shrank to regulation.
     * 0.075 m was measured by a pilot at 1.4 px at 20 m and 0.9 px at 30 m,
     * still sub pixel at the distance a racer has to commit to a line: at 25 m
     * the target read as a 23 px green tick dimmer than the banner flags and
     * the trees beside it. 0.16 m is 3 px at 20 m and 2 px at 30 m, the
     * smallest that survives commit range on a 900 px frame.
     *
     * The cost, stated: at 7 m the bar covers about 10 percent of the opening
     * instead of 5, so a gate right in front of the camera reads chunkier. A
     * target you cannot see until 7 m is not a target, so that is the trade.
     */
    const bar = 0.16;
    const halfW = clearW * 0.5;
    const halfH = clearH * 0.5;
    /* Four thin bars just inside the frame, so the lit line the pilot aims
     * at is the clear opening itself and not the tube around it. */
    const parts = [
      [0, cy + halfH - bar * 0.5, clearW, bar],
      [0, cy - halfH + bar * 0.5, clearW, bar],
      [-halfW + bar * 0.5, cy, bar, clearH],
      [halfW - bar * 0.5, cy, bar, clearH],
    ];
    for (const [px, py, sw, sh] of parts) {
      const geo = new THREE.BoxGeometry(sw, sh, bar);
      geo.translate(px, py, 0);
      outlineGeos.push(geo);
      const hg = new THREE.BoxGeometry(sw * 1.06 + 0.05, sh * 1.06 + 0.05, bar * 0.7);
      hg.translate(px, py, 0);
      haloGeos.push(hg);
    }
  }
  const ring = new THREE.Mesh(
    mergeGeometries(outlineGeos, false),
    new THREE.MeshBasicMaterial({ color: ringColor, fog: true }),
  );
  /* No ink on the emissive outline: the depth edge pass draws a ghost line
   * inside it, which reads as a rendering defect on the one prop the pilot
   * stares at all lap. Layer 1 skips the prepass. */
  ring.layers.set(1);
  g.add(ring);
  const halo = new THREE.Mesh(
    mergeGeometries(haloGeos, false),
    new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.5, fog: true }),
  );
  halo.layers.set(1);
  g.add(halo);

  /* Additive glow across the primary opening. Additive so it reads as light
   * rather than paint, in the gate plane so it does not need to billboard,
   * and unlit and unfogged so distance cannot take the target away from the
   * pilot. uGain is driven per frame: bright and pulsing on the gate the
   * race wants next, nearly off on the rest. */
  const glowSize = Math.max(clearW, clearH) * 2.6;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(glowSize, glowSize),
    new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(ringColor) },
        uGain: { value: 0.1 },
        /* Half the clear opening as a fraction of the plane, so the lit
         * band lands on the frame whatever size the opening is. */
        uEdge: { value: (clearW * 0.5) / glowSize },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uGain;
        uniform float uEdge;
        void main() {
          /* A square band, because the opening is square. The Chebyshev
           * distance is the square's own radius. */
          vec2 d = abs(vUv - 0.5);
          float r = max(d.x, d.y);
          float band = exp(-pow((r - uEdge) / 0.055, 2.0));
          /* Only a breath of fill. The aperture is the thing the pilot has
           * to see THROUGH, so filling it with haze hides the line out of
           * the gate, which is worse than not marking it at all. */
          float fill = smoothstep(uEdge, 0.0, r) * 0.05;
          gl_FragColor = vec4(uColor * (band + fill) * uGain, 1.0);
        }
      `,
    }),
  );
  glow.position.y = sills[primary] + clearH * 0.5;
  glow.layers.set(1);
  g.add(glow);

  /*
   * The apertures, MEASURED out of the geometry that was just built rather
   * than restated from the spec. The clear width is the gap between the two
   * uprights' inner surfaces and the clear height is the gap between the
   * cross members', both recovered from the meshes' own positions and their
   * own geometry parameters. T1 asserts the standard gate at 1.524 m within
   * 10 mm, and an assertion against a number somebody typed twice asserts
   * nothing at all.
   */
  const postMeshes = g.children.filter((c) => c.isMesh && c.geometry.type === 'CylinderGeometry'
    && Math.abs(c.rotation.z) < 1e-6);
  const measuredW = postMeshes.length >= 2
    ? Math.abs(postMeshes[1].position.x - postMeshes[0].position.x)
      - 2 * postMeshes[0].geometry.parameters.radiusTop
    : clearW;
  const apertures = [];
  for (let k = 0; k < stack; k += 1) {
    /* The clear height of opening k is its sill to the underside of the
     * member above it, both of which are positions in this group. */
    const memberY = sills[k] + clearH + tubeR;
    const measuredH = (memberY - tubeR) - sills[k];
    apertures.push({
      shape: 'square',
      index: k,
      sillH: sills[k],
      centreY: sills[k] + measuredH * 0.5,
      clearW: measuredW,
      clearH: measuredH,
    });
  }

  return {
    group: g,
    kindName,
    ringMat: ring.material,
    haloMat: halo.material,
    glowMat: glow.material,
    ringColor,
    apertures,
    primary,
    aperture: apertures[primary],
    colliders: caps,
  };
}

/*
 * A course marker flag.
 *
 * It was 3.4 m tall on a 0.106 m pole, which is 2.23 times the gate's aperture
 * and 3.2 times thicker than the gate's own structural tube: 72 pieces of
 * dressing, each out measuring the thing the player is trying to find. At 30 m
 * the target gate subtends 23 px while a nearby flag pole gave 435. The eye
 * calibrates the gate against whatever is beside it, so the dressing has to be
 * smaller than the structure.
 */
function bannerFlag(rng, height, x, z, colorHex) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.018, 1.6, 5),
    celMaterial({ color: 0xd7dbe0, rim: 0.2 }),
  );
  pole.position.y = 1.7;
  g.add(pole);
  /* Cel shaded, not unlit: an unlit cloth holds full saturation inside a
   * cast shadow, which is the one thing the colour rule forbids. */
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.35, 4, 2),
    /* No rim on the cloth. The rim term is 1 minus dot(normal, view), and
     * a flat plane seen at any angle is edge on across its whole surface,
     * so the cool rim colour covered the entire flag: a dark red cloth
     * measured rgb 151 93 113, a dusty pink nothing in the palette
     * contains. */
    celMaterial({ color: colorHex, rim: 0.0, side: THREE.DoubleSide }),
  );
  cloth.castShadow = true;
  /* The cloth hangs off the pole, so it has to swing about the pole. A
   * mesh rotated about its own centre 0.58 m away swings off the pole and
   * back through it. */
  cloth.position.set(0.58, 0, 0);
  const clothPivot = new THREE.Group();
  clothPivot.position.set(0, 1.35, 0);
  clothPivot.add(cloth);
  g.add(clothPivot);
  g.position.set(x, height(x, z), z);
  g.rotation.y = rng() * Math.PI;
  return { group: g, cloth: clothPivot, pole };
}

function skyDome() {
  const geo = new THREE.SphereGeometry(1500, 40, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uHigh: { value: new THREE.Color(SKY_HIGH) },
      uHorizon: { value: new THREE.Color(HORIZON) },
      uSun: { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uHigh;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      void main() {
        float h = clamp(vDir.y * 1.25 + 0.06, 0.0, 1.0);
        // Posterised, but only part way. At five bands with a hard step the
        // band edge is a single enormous pale arc sweeping across the sky,
        // and in a still that reads as a rendering fault rather than as a
        // style: it was the most visible artefact in every frame. Nine
        // bands, a wider smooth edge, and a mix back toward the smooth
        // gradient keep the poster feel without the arc.
        float b = h * 9.0;
        float stepped = (floor(b) + smoothstep(0.35, 0.95, fract(b))) / 9.0;
        float band = mix(h, stepped, 0.5);
        vec3 col = mix(uHorizon, uHigh, band);
        // warm glow around the sun, and a hard disc
        float sd = max(dot(vDir, normalize(uSun)), 0.0);
        col += vec3(1.0, 0.86, 0.62) * pow(sd, 22.0) * 0.5;
        col += vec3(1.0, 0.95, 0.8) * step(0.9975, sd);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

/* Chunky stylised clouds: clustered flattened icospheres, unlit, so they
 * stay bright and flat like painted shapes. */
function clouds(rng) {
  const g = new THREE.Group();
  /* One mesh per puff with a hard painted terminator keyed to world up,
   * plus a warm sun side rim. The previous build overlaid a second,
   * slightly smaller offset sphere for the underside, and the two
   * surfaces intersected and stippled: that speckling was a z fighting
   * artefact, not shading. */
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { uSun: { value: SUN_DIR.clone() } },
    vertexShader: `
      varying vec3 vN;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vN;
      uniform vec3 uSun;
      void main() {
        vec3 n = normalize(vN);
        vec3 col = mix(vec3(0.70, 0.77, 0.91), vec3(1.0, 0.98, 0.94), step(0.12, n.y));
        /* Sun side warmth, but not enough to clip. Measured, cloud tops
         * reached 255 255 253, luminance 0.999, so a piece of dressing in
         * the corner of the frame was brighter than the gate the pilot is
         * meant to be looking at, and carried 78 percent of the frame's
         * bright area. */
        /* Held under the gate. Measured after the last attempt at this, a
         * cloud top still clipped at rgb 255 255 255, luminance 1.000, and
         * clouds carried 63 percent of the frame's bright area against the
         * gate ring's 32 percent. Dressing does not get to be the brightest
         * thing on screen, and a clipped pixel has no hue left either. */
        col *= 0.68;
        col += vec3(1.0, 0.86, 0.60) * pow(max(dot(n, normalize(uSun)), 0.0), 3.0) * 0.08;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  for (let i = 0; i < 26; i += 1) {
    const cluster = new THREE.Group();
    const puffs = 4 + Math.floor(rng() * 5);
    for (let p = 0; p < puffs; p += 1) {
      const r = 16 + rng() * 26;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
      puff.position.set((rng() - 0.5) * 70, (rng() - 0.5) * 12, (rng() - 0.5) * 40);
      puff.scale.y = 0.52;
      cluster.add(puff);
    }
    const a = rng() * Math.PI * 2;
    const rad = 260 + rng() * 780;
    cluster.position.set(Math.cos(a) * rad, 190 + rng() * 190, Math.sin(a) * rad);
    g.add(cluster);
  }
  return g;
}

export function buildScene(canvas) {
  /* No depth and no stencil on the default framebuffer. The only thing
   * ever drawn into it is the grade pass's fullscreen quad, which is
   * neither depth tested nor stencilled, and a browser hands out a
   * D24S8 buffer by default: measured, 8.3 MB of the frame's 120 MB
   * render target budget for a buffer nothing reads. antialias stays off
   * because EffectComposer allocates its own targets, so the flag would
   * multisample that same one quad. */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    depth: false,
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  /* No filmic tone curve: it desaturates exactly the flat saturated
   * colour this style is built on. The grade pass in post.js does the
   * colour space conversion, at the end of its own shader; there is no
   * OutputPass any more, and this comment said there was. */
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, FOG_NEAR, FOG_FAR);
  const sky = skyDome();
  sky.layers.set(1);
  scene.add(sky);

  const rng = makeRng(20260811);

  const sun = new THREE.DirectionalLight(0xffe9c4, 1.45);
  sun.position.copy(SUN_DIR).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.03;
  const shadowExtent = 72;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  scene.add(sun);
  scene.add(sun.target);
  /* Sky above, warm grass bounce below: this is what keeps shadowed faces
   * from going dead grey. */
  scene.add(new THREE.HemisphereLight(0x8fb8e8, 0x4a6b34, 0.42));

  const curve = trackCurve();
  const samples = curve.getPoints(180);
  const height = makeHeightField(samples);

  const ground = terrain(height, samples);
  scene.add(ground);
  const occluders = [];
  const water0 = water();
  scene.add(water0.mesh);
  const grass = grassField(height, samples, rng);
  /* Layer 1 is the no ink layer, excluded from the outline prepass.
   * Grass belongs here: a per blade outline turns a field into a pile of
   * glass shards, and the blades are far too thin to need a silhouette. */
  grass.mesh.layers.set(2);
  /* Blades do not cast: 184000 of them in the shadow map would cost more
   * than it buys, and the terrain's own cast shadow already grounds the
   * field. The count in this comment said 46000, which was the blade count
   * before round 3 of the previous loop quadrupled it.
   *
   * receiveShadow is set below and it is a no operation, which is a real
   * defect and not a stale comment: the grass material is a ShaderMaterial
   * computing its own sun term, so three.js sets the flag and nothing
   * reads it. Measured by a reviewer, blades standing inside a tree's cast
   * shadow are 0.125 against 0.132 for blades outside it, while the ground
   * under the same shadow is 0.012. The flag is left set because it is
   * what the fix will need; the fix is a shadow map lookup in the grass
   * fragment shader and it is not this round's item. */
  grass.mesh.receiveShadow = true;
  scene.add(grass.mesh);
  const noInkBaker = makeBaker();
  noInkBaker.bake(clouds(rng));
  /* Layer 0, not the no ink layer. Clouds used to write no depth into the
   * outline prepass, so the ink pass drew mountain silhouettes ACROSS the
   * cloud that the colour pass had correctly hidden: a two pixel ink line
   * lying on a continuous cloud surface. They occlude now, and their own
   * silhouette inks, which suits the painted shapes. */
  const cloudMeshes = noInkBaker.flush(scene);
  for (const m of cloudMeshes) {
    m.castShadow = false;
    m.receiveShadow = false;
  }

  /*
   * Solid things. Built here rather than recovered from the scene later,
   * because the baker applies each instance's matrix into the vertices and
   * merges every bucket, so after the flush a tree is anonymous floats in a
   * shared buffer. A collider has to be recorded where the geometry is made.
   */
  const colliders = new Colliders();
  /* Hoisted above the obstacles so their static parts can bake into the same
   * buckets as the scenery. It is flushed once, far below. */
  const baker = makeBaker();

  const gates = [];
  const gateCount = 8;
  /* Even spacing puts gates 2 and 6 both exactly on the figure eight's
   * crossover at the origin, where each one's posts stand in the other
   * branch's racing line. Shift those two along their own branches so the
   * crossover is open air, framed by a gate on either side. */
  const gateU = [0, 1 / 8, 0.222, 3 / 8, 4 / 8, 5 / 8, 0.778, 7 / 8];
  /*
   * THE COURSE IS AN ORIGINAL CHAPTER STYLE LAYOUT built from regulation
   * MultiGP obstacles, and it is labelled as one in the interface. It is
   * deliberately not a Universal Time Trial, for two reasons that pull the
   * same way. UTT 3 Bessel Run, whose full layout is recovered in
   * .loop/evidence/r10/utt3-layout.md and sits in src/game/track.js as data,
   * needs a 91.44 by 36.58 m field, and this figure eight is 210 by 236 m,
   * so laying UTT 3 here would mean rebuilding the terrain, the height
   * field's corridor and the whole racing line. And no published UTT uses
   * more than two obstacle types, while a course wants the vertical variety
   * that towers and dive gates give it.
   *
   * Stations, in scene order, chosen so the line climbs and drops rather
   * than staying at one height. Station 0 stays a ground level standard gate
   * because the craft spawns behind it and the start and finish plane has to
   * be somewhere a stationary quad can be pointed at.
   */
  const stationKinds = [
    'timingGate',       /* 0, start and finish, on the ground */
    'standardGate',     /* 1 */
    'tower5x5',         /* 2, a standard opening elevated 5 ft */
    'ladder',           /* 3, the triple stack: three openings */
    'standardGate',     /* 4 */
    'diveGate',         /* 5, a 7x6 opening at 15 ft, entered from above */
    'championshipGate', /* 6, the wider 7x6 */
    'ladder',           /* 7, the second triple stack */
  ];
  for (let i = 0; i < gateCount; i += 1) {
    const u = gateU[i];
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    /* Number plates count in FLYING order. The craft spawns facing
     * opposite the curve parameter direction, so the course as flown is
     * gate 0 then 7, 6, down to 1; scene index i is flown as position
     * gateCount - i. */
    const flyOrder = i === 0 ? 0 : gateCount - i;
    const made = obstacle(stationKinds[i], flyOrder, i === 0);
    const g = made.group;
    const y = height(p.x, p.z);
    const yaw = Math.atan2(tan.x, tan.z);
    g.position.set(p.x, y, p.z);
    g.rotation.y = yaw;
    /*
     * Split the obstacle in two. The aperture outline, its halo and its
     * glow have per obstacle materials because their gains are driven every
     * frame, so they stay live meshes on their own group. Everything else is
     * static and shares its material with every other obstacle, so it goes
     * into the baker and merges: eight obstacles' frames, panels, feet and
     * numbers come out as a handful of draw calls instead of about two
     * hundred.
     */
    const anim = new THREE.Group();
    anim.position.copy(g.position);
    anim.rotation.y = yaw;
    for (const m of [made.ringMat, made.haloMat, made.glowMat]) {
      const child = g.children.find((c) => c.isMesh && c.material === m);
      if (child) {
        g.remove(child);
        anim.add(child);
      }
    }
    scene.add(anim);
    baker.bake(g);
    /* Colliders, transformed from the obstacle's own frame into the world by
     * the same position and yaw the meshes got. The obstacle is solid: the
     * owner's words were that the gates need to be solid, so every frame
     * member, panel, foot and top plate is in here. */
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    for (const c of made.colliders) {
      colliders.add(
        c.kind,
        p.x + c.ax * cs + c.az * sn, y + c.ay, p.z - c.ax * sn + c.az * cs,
        p.x + c.bx * cs + c.bz * sn, y + c.by, p.z - c.bx * sn + c.bz * cs,
        c.r,
      );
    }
    gates.push({
      position: new THREE.Vector3(p.x, y, p.z),
      heading: g.rotation.y,
      ringMat: made.ringMat,
      haloMat: made.haloMat,
      ringColor: made.ringColor,
      glowMat: made.glowMat,
      aperture: made.aperture,
      apertures: made.apertures,
      primary: made.primary,
      kindName: made.kindName,
      flyOrder,
    });
  }

  /*
   * T1, asserted rather than asserted about. The standard MultiGP gate
   * opening is 5 ft square, 1.524 m, and every aperture above was measured
   * out of the built geometry's own positions and radii. If a change to the
   * frame ever moves an upright, this throws on load instead of quietly
   * shipping a barn door, which is what the old 3.5 m torus was.
   */
  for (const gt of gates) {
    const want = OBSTACLES[gt.kindName];
    for (const ap of gt.apertures) {
      if (Math.abs(ap.clearW - want.clearW) > 0.01 || Math.abs(ap.clearH - want.clearH) > 0.01) {
        throw new Error(
          `scene: ${gt.kindName} opening measured ${ap.clearW.toFixed(4)} by `
          + `${ap.clearH.toFixed(4)} m, published ${want.clearW.toFixed(4)} by `
          + `${want.clearH.toFixed(4)} m, outside the 10 mm tolerance`,
        );
      }
    }
  }

  /* The gate the race wants next pulses so the pilot always has a target.
   * Everything else sits at its resting colour. */
  let nextGateIdx = -1;
  /*
   * A ladder, not a switch. With every gate but the target at 0.12 the
   * gate after next measured 0.064 against grass at 0.077, darker than the
   * ground it stands in, so the pilot had exactly one target and no
   * forward line at all. The next three gates now step down, which is what
   * makes a corridor read.
   *
   * The order the race flies is set by Race, which walks the gate list
   * backwards from the start line, so the gate after scene index i is
   * i - 1, wrapping.
   */
  /*
   * The next gate has to be the brightest thing in the frame with 0.08 of
   * headroom over everything that is not a gate, and the brightest thing
   * that is not a gate is the horizon haze at 0.781, so the target is
   * 0.861. The amber ring's own colour is 0.691 and the renderer runs with
   * NoToneMapping, so the ring cannot get there by itself: the additive
   * glow has to carry it. Measured before this changed, a reviewer found
   * the next gate at 0.711 against a cloud at 0.745, and the gate AFTER
   * next at 0.722, louder than the one the pilot was flying at.
   *
   * The glow is unfogged, which is what makes this work at distance: it is
   * the one thing in the frame whose value does not fall off. It is also a
   * tight annulus at the torus radius, so the band can push into clipping
   * while the ring itself keeps the hue that says which gate this is.
   * Round 3 of the previous loop rejected scaling the ring COLOUR past 1.0
   * for exactly that reason, and this is not that.
   */
  const GLOW_LADDER = [0.95, 0.42, 0.24];
  function setNextGate(i) {
    for (const gt of gates) {
      gt.ringMat.color.set(gt.ringColor);
      gt.haloMat.opacity = 0.34;
      gt.glowMat.uniforms.uGain.value = 0.08;
    }
    nextGateIdx = i;
    for (let step = 0; step < GLOW_LADDER.length; step += 1) {
      const idx = ((i - step) % gates.length + gates.length) % gates.length;
      gates[idx].glowMat.uniforms.uGain.value = GLOW_LADDER[step];
    }
  }

  /* Scenery, kept clear of the flight corridor. Baked, not added: the
   * generation order and rng stream are unchanged, so the world is the
   * same one, just drawn in a handful of calls. */
  for (let i = 0; i < 420; i += 1) {
    const a = rng() * Math.PI * 2;
    const rad = 30 + rng() * 640;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    let d = 1e9;
    for (const s of samples) {
      d = Math.min(d, Math.hypot(x - s.x, z - s.z));
    }
    if (d < 15) {
      continue;
    }
    const isTree = rng() < 0.74;
    baker.bake(isTree
      ? tree(rng, height, x, z, colliders)
      : rock(rng, height, x, z, colliders));
    occluders.push({ x, z, r: isTree ? 2.2 : 1.4 });
  }

  /* Cliff landmarks, kept off the racing line but inside the valley so
   * they read as part of the course rather than set dressing. */
  const cliffSpots = [
    [-215, 95], [190, 155], [-95, -240], [305, 40], [-320, -80], [60, 280],
  ];
  for (const [cx, cz] of cliffSpots) {
    baker.bake(cliff(rng, height, cx, cz, colliders));
    occluders.push({ x: cx, z: cz, r: 13 });
  }

  /* Flowers: a few thousand tiny saturated quads. They cost almost
   * nothing and they are the difference between a green field and a
   * meadow, because they give the ground a second colour at a second
   * scale. */
  {
    const N = 2600;
    const pos = new Float32Array(N * 4 * 3);
    const col = new Float32Array(N * 4 * 3);
    const idx = new Uint32Array(N * 6);
    /* No white: at distance a white quad on grass reads as debris, not a
     * flower. Warm saturated petals stay in the meadow's colour family. */
    /* Warm petals only. The old list held 0xff7fb0 pink and 0xb98cff
     * violet, and on an unlit material they measured 0.378 luminance
     * against grass at 0.301: the most saturated pixels in the lower half
     * of the frame were cool magenta, in a meadow the comment above calls
     * warm. */
    const petals = [0xffd94a, 0xffb347, 0xf58a3c, 0xffe38a];
    const cc = new THREE.Color();
    let v = 0;
    let ii = 0;
    let n = 0;
    for (let i = 0; i < N; i += 1) {
      const s0 = samples[Math.floor(rng() * samples.length)];
      const a = rng() * Math.PI * 2;
      const r = 6 + rng() * 40;
      const x = s0.x + Math.cos(a) * r;
      const z = s0.z + Math.sin(a) * r;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.3) {
        continue;
      }
      /* Hug the ground: floating half a metre up they read as z fighting
       * rectangles, not flowers in the grass. */
      const y = height(x, z) + 0.06 + rng() * 0.1;
      const w = 0.045 + rng() * 0.035;
      cc.set(petals[Math.floor(rng() * petals.length)]);
      const base = v / 3;
      for (const [ox, oz] of [[-w, -w], [w, -w], [w, w], [-w, w]]) {
        pos[v] = x + ox; pos[v + 1] = y; pos[v + 2] = z + oz;
        col[v] = cc.r; col[v + 1] = cc.g; col[v + 2] = cc.b;
        v += 3;
      }
      idx[ii++] = base; idx[ii++] = base + 1; idx[ii++] = base + 2;
      idx[ii++] = base; idx[ii++] = base + 2; idx[ii++] = base + 3;
      n += 1;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 12), 3));
    fg.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, n * 12), 3));
    /*
     * Normals, all straight up, because the petals are horizontal quads.
     *
     * This geometry had none, which was harmless while the material was
     * unlit. Putting a lit material on it turned the whole frame into flat
     * fog cream: a missing attribute reads as (0,0,0), normalize of that is
     * NaN, and the NaN spread out of these 2600 quads across the frame on
     * this software rasteriser. Nothing in the console, no shader error,
     * just a washed out world. Any lit material needs normals.
     */
    const fnorm = new Float32Array(n * 12);
    for (let i = 1; i < fnorm.length; i += 3) {
      fnorm[i] = 1;
    }
    fg.setAttribute('normal', new THREE.BufferAttribute(fnorm, 3));
    fg.setIndex(new THREE.BufferAttribute(idx.subarray(0, n * 6), 1));
    /* Cel shaded, not unlit. An unlit petal is byte identical in sun and
     * in shadow, which is the one thing the colour rule forbids, and it
     * made the flowers the most saturated thing in the lower frame. No rim:
     * a flat quad is edge on across its whole surface, so a rim term
     * floods it, the same trap the flag cloth fell into. */
    const fm = celMaterial({ color: 0xffffff, rim: 0.0, side: THREE.DoubleSide });
    fm.vertexColors = true;
    const flowers = new THREE.Mesh(fg, fm);
    flowers.layers.set(1);
    scene.add(flowers);
  }

  /*
   * Baked ambient occlusion into the terrain vertex colours. Contact
   * shading is the cheapest and highest yield spatial cue there is, and a
   * stylised render needs it MORE than a photoreal one, because there is
   * no texture detail or specular variation to fall back on: without it
   * every tree, rock and gate foot floats on the grass instead of sitting
   * in it. The scatter is deterministic so this can be done once at load
   * and costs nothing at runtime, and unlike the shadow map it reaches
   * the full draw distance.
   *
   * Occlusion tints toward the shadow blue rather than multiplying toward
   * black, so it stays inside the same warm light, cool shadow logic as
   * the ramp and the cloud shadows.
   */
  {
    const CELL = 8;
    const grid = new Map();
    for (const o of occluders) {
      const key = `${Math.floor(o.x / CELL)},${Math.floor(o.z / CELL)}`;
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push(o);
    }
    const gpos = ground.geometry.attributes.position;
    const gcol = ground.geometry.attributes.color;
    const aoTint = new THREE.Color(0x707fb8);
    for (let i = 0; i < gpos.count; i += 1) {
      const x = gpos.getX(i);
      const z = gpos.getZ(i);
      let occ = 0;
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      for (let ax = cx - 2; ax <= cx + 2; ax += 1) {
        for (let az = cz - 2; az <= cz + 2; az += 1) {
          const bucket = grid.get(`${ax},${az}`);
          if (!bucket) {
            continue;
          }
          for (const o of bucket) {
            const d = Math.hypot(x - o.x, z - o.z);
            const k = 1 - Math.min(1, d / (2.6 * o.r));
            if (k > 0) {
              occ += Math.pow(k, 1.7);
            }
          }
        }
      }
      occ = Math.min(0.75, occ);
      if (occ > 0.001) {
        gcol.setXYZ(
          i,
          gcol.getX(i) * (1 - occ) + gcol.getX(i) * aoTint.r * occ,
          gcol.getY(i) * (1 - occ) + gcol.getY(i) * aoTint.g * occ,
          gcol.getZ(i) * (1 - occ) + gcol.getZ(i) * aoTint.b * occ,
        );
      }
    }
    gcol.needsUpdate = true;
  }

  /* Course markers along the circuit: close range speed reference. */
  const flags = [];
  /* No white. A white flag measured brighter than the sky, which inverts
   * the value hierarchy this file claims to enforce and made 72 pieces of
   * dressing louder than the gate. */
  const flagColors = [0xc4452f, 0xcf8a2a, 0x3f8fbf, 0x3f6fa8];
  /* The 72 poles are static, so they merge into one draw call. Only the
   * cloths stay as separate objects, because they swing, and only the
   * cloths cast: a flag that casts no shadow floats, and 72 poles in the
   * shadow map cost more than a pole's thin shadow line is worth. */
  const poleBaker = makeBaker();
  for (let i = 0; i < 72; i += 1) {
    const u = i / 72;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    const nx = -tan.z;
    const nz = tan.x;
    const side = i % 2 === 0 ? 8.5 : -8.5;
    const fx = p.x + nx * side;
    const fz = p.z + nz * side;
    const f = bannerFlag(rng, height, fx, fz, flagColors[i % flagColors.length]);
    /* The pole is solid. It is 5 cm of aluminium beside the racing line and
     * a quad that clips one is finished, so it collides. The cloth does not:
     * a flag brushing a prop is not a crash. */
    const fy = height(fx, fz);
    colliders.addPost('pole', fx, fz, fy, fy + 1.6, 0.018);
    f.group.updateMatrixWorld(true);
    poleBaker.bake(f.pole);
    f.group.remove(f.pole);
    scene.add(f.group);
    flags.push(f);
  }
  poleBaker.flush(scene);

  /* Mountain rings. Cones are centred on their origin, so the base must
   * sit at y = h/2 or the range floats. Far ring lighter for aerial
   * perspective, and both sit outside the fog so they stay as flat shapes. */
  /*
   * Mountain rings. Cones are centred on their origin, so the base must sit
   * at y = h/2 or the range floats.
   *
   * These used to be cel shaded with fog off, and the result was measured:
   * all four rings, the far valley floor and the trees standing on them
   * came out at 0.079 linear luminance, 34.6 percent of the whole mountain
   * band at one value, because a cone's facets mostly face away from the
   * sun and land in the ramp's shadow band. Aerial perspective was
   * inverted: a ring at 560 m read four times DARKER than fogged ground at
   * 400 m in front of it.
   *
   * They are unlit now, one flat colour each, so the authored value IS the
   * rendered value. The first set of colours was chosen by arithmetic and
   * the comment here claimed measured values of 0.15, 0.25, 0.35 and 0.45.
   * That was wrong, and a reviewer measured it: ring 0 came out at 0.108
   * and ring 1 at 0.162, which put ring 0 inside the tree canopy band of
   * 0.094 to 0.107, so a canopy in front of a mountain was a 2.8 percent
   * luminance step. These colours are measured, not derived.
   *
   * Jitter is 0.16 rad, not 0.05: 34 cones at even 10.6 degree spacing
   * with 2.9 degrees of jitter read as a picket fence.
   */
  const ridgeDist = [560, 830, 1080, 1330];
  /*
   * The aerial perspective ladder, and the one place in the frame where it
   * is authored rather than computed. Each pair is a sun side and a shadow
   * side of the SAME luminance, so the ring's rendered value is exactly its
   * rung and the light model lives entirely in hue: warm sand facing the
   * sun, cool blue away from it, which is the same warm light cool shadow
   * rule the ramp follows.
   *
   * That equal luminance is not a shortcut, it is the only thing that fits.
   * The rungs have to clear the fogged ground in front of the nearest ring
   * and stay clear of the sky behind the furthest one, and between those
   * two there is 0.353 of luminance for four layers. Splitting each ring's
   * value by even 0.03 for its light model makes the sun side of one ring
   * and the shadow side of the next land within 0.035 of each other, and
   * then a reviewer sampling those two patches measures a ladder that does
   * not climb. Hue carries the light, value carries the distance, and
   * neither has to borrow from the other.
   *
   * Measured targets, Rec. 709 linear: 0.49, 0.56, 0.63, 0.70, against
   * ground at 850 m at 0.428 and sky at 0.781. Steps 0.062, 0.07, 0.07,
   * 0.07, 0.081.
   *
   * The previous set was one flat unlit colour per ring at 0.186, 0.275,
   * 0.409 and 0.596. A reviewer measured ring 0 at 0.195 against fogged
   * ground at 400 m at 0.352: the layer 160 m further away was 0.157
   * DARKER, so the aerial perspective ran backwards. It also put one exact
   * colour across 14.8 percent of the frame with no light model at all.
   */
  const RIDGE_SUN = [0xb0c08e, 0xbfcaa2, 0xcdd3b4, 0xd8dcc6];
  const RIDGE_SHADE = [0x99bfda, 0xabc9e2, 0xbcd2e8, 0xcddbeb];
  /* One material per ring, created outside the cone loop. The baker buckets
   * by material, and a material per cone means 136 buckets and 136 draw
   * calls instead of four: that mistake cost 108 draw calls and was caught
   * by measuring the count, not by reading the diff. */
  const ridgeMats = RIDGE_SUN.map(() => {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    m.vertexColors = true;
    return m;
  });
  const sunC = new THREE.Color();
  const shadeC = new THREE.Color();
  const nrmMat = new THREE.Matrix3();
  const nrmVec = new THREE.Vector3();
  for (let ring = 0; ring < 4; ring += 1) {
    const dist = ridgeDist[ring];
    sunC.setHex(RIDGE_SUN[ring]);
    shadeC.setHex(RIDGE_SHADE[ring]);
    for (let i = 0; i < 34; i += 1) {
      const a = (i / 34) * Math.PI * 2 + ring * 0.09 + (rng() - 0.5) * 0.16;
      const h = 110 + rng() * 210;
      /* Non indexed before colouring: a cone's five side faces share
       * vertices with the cap in the indexed form, so a per face colour
       * written into a shared vertex bleeds onto the face next to it. */
      const geo = new THREE.ConeGeometry(95 + rng() * 90, h, 5).toNonIndexed();
      const m = new THREE.Mesh(geo, ridgeMats[ring]);
      m.position.set(Math.cos(a) * dist, h / 2 - 10, Math.sin(a) * dist);
      m.rotation.y = rng() * 3;
      m.updateMatrixWorld(true);
      const nrm = geo.attributes.normal;
      const col = new Float32Array(nrm.count * 3);
      nrmMat.getNormalMatrix(m.matrixWorld);
      for (let v = 0; v < nrm.count; v += 1) {
        nrmVec.fromBufferAttribute(nrm, v).applyMatrix3(nrmMat).normalize();
        const c = nrmVec.dot(SUN_DIR) > 0.02 ? sunC : shadeC;
        col[v * 3 + 0] = c.r;
        col[v * 3 + 1] = c.g;
        col[v * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      baker.bake(m);
    }
  }
  baker.flush(scene, 0);

  /* The craft. Betaflight motor order RR FR RL FL, front at -z. */
  const quad = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.088, 0.034, 0.155),
    celMaterial({ color: 0x272d38, rim: 0.28, spec: 0.35, specWidth: 0.02 }),
  );
  body.castShadow = true;
  outlineHull(body, 1.13);
  quad.add(body);
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.05, 0.08, 4),
    celMaterial({ color: 0xe8503a, rim: 0.28, spec: 0.4 }),
  );
  canopy.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
  canopy.position.set(0, 0.03, -0.048);
  canopy.castShadow = true;
  outlineHull(canopy, 1.1);
  quad.add(canopy);

  const motorXZ = [
    [0.0778, 0.0778],
    [0.0778, -0.0778],
    [-0.0778, 0.0778],
    [-0.0778, -0.0778],
  ];
  const armMat = celMaterial({ color: 0x333b47, rim: 0.26 });
  const bellMat = celMaterial({ color: 0xa6aeb8, rim: 0.28, spec: 0.5 });
  const discs = [];
  for (let m = 0; m < 4; m += 1) {
    const [mx, mz] = motorXZ[m];
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.015, 0.115), armMat);
    arm.position.set(mx / 2, 0, mz / 2);
    arm.lookAt(new THREE.Vector3(mx, 0, mz));
    arm.castShadow = true;
    outlineHull(arm, 1.1);
    quad.add(arm);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.024, 8), bellMat);
    bell.position.set(mx, 0.018, mz);
    bell.castShadow = true;
    quad.add(bell);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0635, 0.0635, 0.004, 22),
      new THREE.MeshBasicMaterial({
        color: mz < 0 ? 0xff8a63 : 0x39404a,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        fog: true,
      }),
    );
    disc.position.set(mx, 0.032, mz);
    quad.add(disc);
    discs.push(disc);
  }
  scene.add(quad);

  /*
   * Near plane at 0.2 m, not 0.04. The camera sits inside a 150 mm
   * airframe, so 4 cm buys nothing, and a 0.04 to 2600 range left the
   * outline prepass's depth buffer with under one depth code of separation
   * past about 500 m: that is why the ink had to be faded out by 50 m and
   * why grass blades a few centimetres from the lens filled the frame.
   */
  const camera = new THREE.PerspectiveCamera(100, 1, 0.2, 2600);
  camera.layers.enable(1);
  /* Layer 2 is the grass. It needs to be separable from the rest of the no
   * ink layer, because it has to write depth into the outline prepass
   * without being inked itself. See renderNormals in post.js. */
  camera.layers.enable(2);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return { w, h };
  }
  resize();

  /* Shadows follow the craft. shadowExtent is a half width, so the box is
   * 144 m across at 2048, which is 7.0 cm per texel: crisp enough for
   * contact shadows where the pilot is looking, instead of mush over
   * 1.7 km. This comment said 58 m until a reviewer read the constant. */
  function updateShadowFocus(target) {
    sun.position.copy(target).addScaledVector(SUN_DIR, 130);
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
  }

  function updateWind(t, quadPos, wash) {
    grass.mat.uniforms.uTime.value = t;
    if (quadPos) {
      grass.mat.uniforms.uQuad.value.copy(quadPos);
      grass.mat.uniforms.uWash.value = wash ?? 0;
    }
    water0.mat.uniforms.uTime.value = t;
    updateCelTime(t);
    for (let i = 0; i < flags.length; i += 1) {
      flags[i].cloth.rotation.y = Math.sin(t * 2.2 + i * 0.7) * 0.32;
      flags[i].cloth.rotation.z = Math.sin(t * 3.1 + i) * 0.1;
    }
    if (nextGateIdx >= 0 && nextGateIdx < gates.length) {
      const gt = gates[nextGateIdx];
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.4);
      /* Pulse the glow, not the ring's hue. Lerping the ring toward white
       * made the target lose the one colour that identifies it. */
      gt.glowMat.uniforms.uGain.value = 0.95 + 0.30 * pulse;
      gt.haloMat.opacity = 0.55 + 0.35 * pulse;
    }
  }

  /* Every collider is in by now, so freeze the flat arrays and build the
   * broadphase grid. Nothing may be added after this. */
  colliders.build();

  return {
    renderer, scene, camera, quad, discs, gates, curve,
    resize, updateShadowFocus, updateWind, height, setNextGate,
    colliders,
  };
}
