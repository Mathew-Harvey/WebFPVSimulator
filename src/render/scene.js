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
import { celMaterial, outlineHull } from './celmat.js';

const SUN_DIR = new THREE.Vector3(0.42, 0.78, 0.32).normalize();
const HORIZON = 0xcfe0ea;
const SKY_HIGH = 0x2f6fc4;
const FOG_NEAR = 130;
const FOG_FAR = 780;

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
    return (base + detail) * s2;
  };
}

function terrain(height) {
  const size = 1700;
  const seg = 190;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grassLow = new THREE.Color(0x4f8c3c);
  const grassHigh = new THREE.Color(0x86b95a);
  const rockCol = new THREE.Color(0x8b8578);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = height(x, z);
    pos.setY(i, y);
    /* Colour by altitude with a little noise break up; slope is applied
     * after normals exist, below. */
    const t = Math.min(1, Math.max(0, (y + 12) / 34));
    c.copy(grassLow).lerp(grassHigh, t);
    const speck = fbm(x * 0.06, z * 0.06);
    c.lerp(rockCol, Math.min(0.5, Math.max(0, (y - 14) / 22)) * (0.5 + speck * 0.5));
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
  const mat = celMaterial({ color: 0xffffff, rim: 0.0 });
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/*
 * Grass. One merged buffer rather than instancing: a single draw call, and
 * the wind is a vertex shader function of world position so neighbouring
 * blades move together in gusts instead of each doing its own thing.
 */
function grassField(height, samples, rng) {
  const BLADES = 46000;
  const positions = new Float32Array(BLADES * 5 * 3);
  const colors = new Float32Array(BLADES * 5 * 3);
  const bend = new Float32Array(BLADES * 5);
  const indices = new Uint32Array(BLADES * 9);
  const base = new THREE.Color(0x74ad4e);
  const tip = new THREE.Color(0xbfe07a);
  const c = new THREE.Color();
  let vi = 0;
  let ii = 0;
  let made = 0;
  for (let i = 0; i < BLADES; i += 1) {
    /* Bias placement toward the circuit: that is where the eye is. */
    let x;
    let z;
    if (rng() < 0.72) {
      const s = samples[Math.floor(rng() * samples.length)];
      const a = rng() * Math.PI * 2;
      const r = 3 + rng() * 40;
      x = s.x + Math.cos(a) * r;
      z = s.z + Math.sin(a) * r;
    } else {
      x = (rng() - 0.5) * 900;
      z = (rng() - 0.5) * 900;
    }
    const y = height(x, z);
    const h = 0.32 + rng() * 0.5;
    const w = 0.075 + rng() * 0.055;
    const a = rng() * Math.PI;
    const dx = Math.cos(a) * w;
    const dz = Math.sin(a) * w;
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
      c.copy(base).lerp(tip, b * (0.6 + rng() * 0.4));
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

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color(HORIZON) },
      uFogNear: { value: FOG_NEAR },
      uFogFar: { value: FOG_FAR },
      uSun: { value: SUN_DIR.clone() },
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aBend;
      varying vec3 vColor;
      varying float vFog;
      varying float vBend;
      uniform float uTime;
      void main() {
        vColor = color;
        vBend = aBend;
        vec3 p = position;
        // gusts: a slow travelling wave across the field plus a fast
        // flutter, both keyed to world position so blades move as a mass
        float gust = sin(p.x * 0.045 + p.z * 0.03 + uTime * 1.1);
        float flutter = sin(p.x * 0.9 + p.z * 0.7 + uTime * 5.5);
        float amp = aBend * aBend;
        p.x += (gust * 0.34 + flutter * 0.06) * amp;
        p.z += (gust * 0.18 + flutter * 0.05) * amp;
        p.y -= abs(gust) * 0.05 * amp;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vFog = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vFog;
      varying float vBend;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      void main() {
        // The terrain around it is lit by a 2.6 sun plus hemisphere fill,
        // so an unlit field reads as a dark rash on top of bright ground.
        // Bake the same gain in here, and keep the root to tip ramp
        // shallow so the field stays a single mass at distance.
        vec3 col = vColor * mix(1.05, 1.35, vBend);
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

function tree(rng, height, x, z) {
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
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 0),
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
  g.position.set(x, height(x, z), z);
  return g;
}

function rock(rng, height, x, z) {
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
  return m;
}

/*
 * Gate. Read at distance is everything: a bold dark frame for silhouette,
 * a saturated emissive aperture ring that bloom picks up, and a number
 * plate. Start gate is green, the rest amber.
 */
function gate(index, isStart) {
  const g = new THREE.Group();
  const w = 6.0;
  const h = 5.0;
  const frameMat = celMaterial({ color: 0x2b3240, rim: 0.3 });
  const accent = celMaterial({ color: isStart ? 0x2f9e56 : 0xd8452f, rim: 0.34 });

  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, 0.4), frameMat);
    post.position.set(sx * w * 0.5, h / 2, 0);
    post.castShadow = true;
    outlineHull(post, 1.06);
    g.add(post);
    for (let b = 0; b < 3; b += 1) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.46), accent);
      band.position.set(sx * w * 0.5, 0.6 + b * 1.6, 0);
      g.add(band);
    }
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.36, 1.5), frameMat);
    foot.position.set(sx * w * 0.5, 0.18, 0);
    foot.castShadow = true;
    outlineHull(foot, 1.05);
    g.add(foot);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, 0.42), frameMat);
  top.position.y = h;
  top.castShadow = true;
  outlineHull(top, 1.05);
  g.add(top);

  /* The aperture: emissive so bloom lifts it, and doubled with a fainter
   * larger ring so it stays visible against bright sky. */
  const ringColor = isStart ? 0x7dffb4 : 0xffd45c;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.9, 0.15, 8, 32),
    new THREE.MeshBasicMaterial({ color: ringColor, fog: true }),
  );
  ring.position.y = h * 0.5;
  g.add(ring);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(2.15, 0.06, 6, 32),
    new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.5, fog: true }),
  );
  halo.position.y = h * 0.5;
  g.add(halo);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.12), accent);
  plate.position.set(0, h + 0.75, 0);
  outlineHull(plate, 1.05);
  g.add(plate);
  /* Pip marks counting the gate number, readable as a shape at speed. */
  for (let p = 0; p < Math.min(index + 1, 8); p += 1) {
    const pip = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.34, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xfff4d6 }),
    );
    pip.position.set(-0.9 + p * 0.26, h + 0.75, 0.1);
    g.add(pip);
  }
  return g;
}

function bannerFlag(rng, height, x, z, colorHex) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, 3.4, 5),
    celMaterial({ color: 0xd7dbe0, rim: 0.2 }),
  );
  pole.position.y = 1.7;
  g.add(pole);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.68, 4, 2),
    new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, fog: true }),
  );
  cloth.position.set(0.58, 2.85, 0);
  g.add(cloth);
  g.position.set(x, height(x, z), z);
  g.rotation.y = rng() * Math.PI;
  return { group: g, cloth };
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
        // banded, but with a narrow smooth edge on each band so the sky
        // does not shimmer as the camera rolls
        float b = h * 5.0;
        float band = (floor(b) + smoothstep(0.72, 0.98, fract(b))) / 5.0;
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
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, fog: false });
  const shade = new THREE.MeshBasicMaterial({ color: 0xc3d4e6, fog: false });
  for (let i = 0; i < 26; i += 1) {
    const cluster = new THREE.Group();
    const puffs = 4 + Math.floor(rng() * 5);
    for (let p = 0; p < puffs; p += 1) {
      const r = 16 + rng() * 26;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
      puff.position.set((rng() - 0.5) * 70, (rng() - 0.5) * 12, (rng() - 0.5) * 40);
      puff.scale.y = 0.52;
      cluster.add(puff);
      const under = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.92, 1), shade);
      under.position.copy(puff.position).add(new THREE.Vector3(0, -r * 0.13, 0));
      under.scale.y = 0.42;
      cluster.add(under);
    }
    const a = rng() * Math.PI * 2;
    const rad = 260 + rng() * 780;
    cluster.position.set(Math.cos(a) * rad, 190 + rng() * 190, Math.sin(a) * rad);
    g.add(cluster);
  }
  return g;
}

export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  /* No filmic tone curve: it desaturates exactly the flat saturated
   * colour this style is built on. The OutputPass still does the colour
   * space conversion. */
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, FOG_NEAR, FOG_FAR);
  const sky = skyDome();
  sky.layers.set(1);
  scene.add(sky);

  const rng = makeRng(20260811);

  const sun = new THREE.DirectionalLight(0xfff0d4, 2.6);
  sun.position.copy(SUN_DIR).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.03;
  const shadowExtent = 58;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  scene.add(sun);
  scene.add(sun.target);
  /* Sky above, warm grass bounce below: this is what keeps shadowed faces
   * from going dead grey. */
  scene.add(new THREE.HemisphereLight(0xa8ccf0, 0x5f7a3a, 1.25));

  const curve = trackCurve();
  const samples = curve.getPoints(180);
  const height = makeHeightField(samples);

  scene.add(terrain(height));
  const grass = grassField(height, samples, rng);
  /* Layer 1 is the no ink layer, excluded from the outline prepass.
   * Grass belongs here: a per blade outline turns a field into a pile of
   * glass shards, and the blades are far too thin to need a silhouette. */
  grass.mesh.layers.set(1);
  scene.add(grass.mesh);
  const cloudGroup = clouds(rng);
  cloudGroup.traverse((o) => o.layers.set(1));
  scene.add(cloudGroup);

  const gates = [];
  const gateCount = 8;
  for (let i = 0; i < gateCount; i += 1) {
    const u = i / gateCount;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    const g = gate(i, i === 0);
    const y = height(p.x, p.z);
    g.position.set(p.x, y, p.z);
    g.rotation.y = Math.atan2(tan.x, tan.z);
    scene.add(g);
    gates.push({ position: new THREE.Vector3(p.x, y, p.z), heading: g.rotation.y });
  }

  /* Scenery, kept clear of the flight corridor. */
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
    scene.add(rng() < 0.74 ? tree(rng, height, x, z) : rock(rng, height, x, z));
  }

  /* Course markers along the circuit: close range speed reference. */
  const flags = [];
  const flagColors = [0xe8503a, 0xffd257, 0x46b0e0, 0xffffff];
  for (let i = 0; i < 72; i += 1) {
    const u = i / 72;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    const nx = -tan.z;
    const nz = tan.x;
    const side = i % 2 === 0 ? 8.5 : -8.5;
    const f = bannerFlag(rng, height, p.x + nx * side, p.z + nz * side, flagColors[i % flagColors.length]);
    scene.add(f.group);
    flags.push(f);
  }

  /* Mountain rings. Cones are centred on their origin, so the base must
   * sit at y = h/2 or the range floats. Far ring lighter for aerial
   * perspective, and both sit outside the fog so they stay as flat shapes. */
  for (let ring = 0; ring < 3; ring += 1) {
    const dist = 780 + ring * 260;
    const col = [0x7f9cbe, 0x93aecb, 0xacc2d9][ring];
    for (let i = 0; i < 34; i += 1) {
      const a = (i / 34) * Math.PI * 2 + ring * 0.09 + rng() * 0.05;
      const h = 110 + rng() * 210;
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(95 + rng() * 90, h, 5),
        new THREE.MeshBasicMaterial({ color: col, fog: false }),
      );
      m.position.set(Math.cos(a) * dist, h / 2 - 10, Math.sin(a) * dist);
      m.rotation.y = rng() * 3;
      scene.add(m);
    }
  }

  /* The craft. Betaflight motor order RR FR RL FL, front at -z. */
  const quad = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.088, 0.034, 0.155),
    celMaterial({ color: 0x272d38, rim: 0.42, spec: 0.35, specWidth: 0.02 }),
  );
  body.castShadow = true;
  outlineHull(body, 1.13);
  quad.add(body);
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.05, 0.08, 4),
    celMaterial({ color: 0xe8503a, rim: 0.4, spec: 0.4 }),
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
  const armMat = celMaterial({ color: 0x333b47, rim: 0.35 });
  const bellMat = celMaterial({ color: 0xa6aeb8, rim: 0.4, spec: 0.5 });
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

  const camera = new THREE.PerspectiveCamera(100, 1, 0.04, 2600);
  camera.layers.enable(1);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return { w, h };
  }
  resize();

  /* Shadows follow the craft: a 58 m box at 2048 gives crisp contact
   * shadows where the pilot is looking instead of mush over 1.7 km. */
  function updateShadowFocus(target) {
    sun.position.copy(target).addScaledVector(SUN_DIR, 130);
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
  }

  function updateWind(t) {
    grass.mat.uniforms.uTime.value = t;
    for (let i = 0; i < flags.length; i += 1) {
      flags[i].cloth.rotation.y = Math.sin(t * 2.2 + i * 0.7) * 0.32;
      flags[i].cloth.rotation.z = Math.sin(t * 3.1 + i) * 0.1;
    }
  }

  return {
    renderer, scene, camera, quad, discs, gates, curve,
    resize, updateShadowFocus, updateWind, height,
  };
}
