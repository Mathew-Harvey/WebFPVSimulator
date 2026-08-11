/*
 * scene.js: the Stage 1 world, cel shaded.
 *
 * Look: flat banded toon lighting, saturated but desaturated-at-distance
 * palette, dark rim outlines on solid objects, a warm sky gradient and
 * layered haze. The reference is Breath of the Wild: few materials, strong
 * silhouettes, colour doing the depth work rather than texture detail.
 * Everything is generated, there are no texture files.
 *
 * The track is a rudimentary circuit: eight gates around a figure of eight
 * with pylons, banners and flags for scale and motion cues. It exists to
 * give the eye something to judge speed and orientation against, which is
 * what makes a simulator feel fast or slow.
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

const SKY_TOP = 0x3f7fd0;
const SKY_HAZE = 0xbfd8e8;

/* Deterministic pseudo random so the world is the same every load. Plain
 * integer hashing, never Math.random, which would make two sessions
 * describe different worlds to a pilot comparing them. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* Banded ramp: the cel shading comes from this gradient map, not a custom
 * shader, so it survives any Three.js lighting change. */
function bandedGradient(steps) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i += 1) {
    data[i] = Math.round(60 + (195 * i) / (steps - 1));
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function toonMat(color, gradient) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradient });
}

/* Dark inverted hull, the cheap and reliable way to get an ink outline
 * without a post processing pass. */
function addOutline(mesh, scale = 1.045, color = 0x1b2330) {
  const outline = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }),
  );
  outline.scale.multiplyScalar(scale);
  mesh.add(outline);
  return mesh;
}

function skyDome() {
  const geo = new THREE.SphereGeometry(1400, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(SKY_TOP) },
      haze: { value: new THREE.Color(SKY_HAZE) },
    },
    vertexShader: `
      varying float vH;
      void main() {
        vH = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 haze;
      varying float vH;
      void main() {
        // banded sky: quantise the gradient so it reads as painted
        float t = clamp(vH * 1.6 + 0.15, 0.0, 1.0);
        t = floor(t * 6.0) / 6.0;
        gl_FragColor = vec4(mix(haze, top, t), 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

/* Rolling ground: a displaced plane, flattened along the track corridor so
 * the circuit stays flyable. */
function ground(gradient, trackPoints) {
  const size = 1600;
  const seg = 110;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const rng = makeRng(20260811);
  const phase = [];
  for (let i = 0; i < 8; i += 1) {
    phase.push({ a: rng() * 6.283, f: 0.0018 + rng() * 0.004, amp: 1.5 + rng() * 7 });
  }
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let h = 0;
    for (const p of phase) {
      h += p.amp * Math.sin(x * p.f + p.a) * Math.cos(z * p.f * 0.9 + p.a * 1.7);
    }
    /* Flatten near the circuit. */
    let d = 1e9;
    for (const t of trackPoints) {
      const dx = x - t.x;
      const dz = z - t.z;
      d = Math.min(d, Math.sqrt(dx * dx + dz * dz));
    }
    const flat = Math.min(1, Math.max(0, (d - 26) / 55));
    pos.setY(i, h * flat * flat);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, toonMat(0x6fae52, gradient));
  mesh.receiveShadow = false;
  return mesh;
}

function tree(gradient, rng) {
  const g = new THREE.Group();
  const trunkH = 1.6 + rng() * 1.4;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, trunkH, 6),
    toonMat(0x7a5433, gradient),
  );
  trunk.position.y = trunkH / 2;
  addOutline(trunk, 1.09);
  g.add(trunk);
  const tints = [0x4f9b46, 0x5fae4e, 0x57a05a, 0x3f8f4a];
  const tint = tints[Math.floor(rng() * tints.length)];
  const layers = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < layers; i += 1) {
    const r = 1.5 - i * 0.34;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(r, 1.7, 7),
      toonMat(tint, gradient),
    );
    cone.position.y = trunkH + 0.5 + i * 0.85;
    addOutline(cone, 1.06);
    g.add(cone);
  }
  return g;
}

function rock(gradient, rng) {
  const r = 0.7 + rng() * 2.2;
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(r, 0),
    toonMat(0x8d8f96, gradient),
  );
  m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  m.position.y = r * 0.55;
  addOutline(m, 1.05);
  return m;
}

/* A race gate: two pylons and a top bar, with a bright aperture ring so it
 * reads instantly at speed. */
function gate(gradient, index) {
  const g = new THREE.Group();
  const w = 5.0;
  const h = 4.2;
  const postMat = toonMat(0xe8503a, gradient);
  const barMat = toonMat(0xf2f2ef, gradient);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, h, 0.34), postMat);
    post.position.set(sx * w * 0.5, h / 2, 0);
    addOutline(post, 1.07);
    g.add(post);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.3), toonMat(0x2f3946, gradient));
    foot.position.set(sx * w * 0.5, 0.15, 0);
    addOutline(foot, 1.06);
    g.add(foot);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.34, 0.42, 0.36), barMat);
  bar.position.y = h;
  addOutline(bar, 1.05);
  g.add(bar);

  /* Aperture ring, flat colour so it pops against the sky. */
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.12, 6, 22),
    new THREE.MeshBasicMaterial({ color: index === 0 ? 0x46e07a : 0xffd257 }),
  );
  ring.position.y = h * 0.52;
  g.add(ring);

  /* Numbered banner. */
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.7, 0.08),
    toonMat(index === 0 ? 0x2f9e56 : 0x3b6ea8, gradient),
  );
  banner.position.set(0, h + 0.65, 0);
  addOutline(banner, 1.05);
  g.add(banner);
  return g;
}

function flag(gradient, rng) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 3.0, 5),
    toonMat(0xdfe3e6, gradient),
  );
  pole.position.y = 1.5;
  g.add(pole);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.6),
    new THREE.MeshBasicMaterial({
      color: [0xe8503a, 0xffd257, 0x46b0e0][Math.floor(rng() * 3)],
      side: THREE.DoubleSide,
    }),
  );
  cloth.position.set(0.5, 2.6, 0);
  g.add(cloth);
  return g;
}

/* Figure of eight circuit, sampled as a closed spline. */
function trackCurve() {
  const pts = [];
  const n = 14;
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    /* Lemniscate, scaled to a comfortable 5 inch circuit. */
    const d = 1 + Math.sin(t) * Math.sin(t);
    pts.push(new THREE.Vector3((95 * Math.cos(t)) / d, 0, (105 * Math.sin(t) * Math.cos(t)) / d));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.4);
}

export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_HAZE);
  scene.fog = new THREE.Fog(SKY_HAZE, 220, 900);
  scene.add(skyDome());

  const gradient = bandedGradient(4);

  /* Flat, high key lighting: cel shading wants few, strong sources. */
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.4);
  sun.position.set(120, 190, 80);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5c7a44, 1.5));

  const curve = trackCurve();
  const samples = curve.getPoints(160);
  scene.add(ground(gradient, samples));

  /* Gates spaced evenly around the circuit, aligned to the tangent. */
  const gates = [];
  const gateCount = 8;
  for (let i = 0; i < gateCount; i += 1) {
    const u = i / gateCount;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    const g = gate(gradient, i);
    g.position.copy(p);
    g.rotation.y = Math.atan2(tan.x, tan.z);
    scene.add(g);
    gates.push({ position: p.clone(), heading: g.rotation.y });
  }

  /* Scenery scattered outside the corridor. */
  const rng = makeRng(7717);
  for (let i = 0; i < 260; i += 1) {
    const a = rng() * Math.PI * 2;
    const rad = 40 + rng() * 620;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    let d = 1e9;
    for (const s of samples) {
      d = Math.min(d, Math.hypot(x - s.x, z - s.z));
    }
    if (d < 16) {
      continue;
    }
    const o = rng() < 0.76 ? tree(gradient, rng) : rock(gradient, rng);
    o.position.set(x, 0, z);
    const s = 0.8 + rng() * 1.5;
    o.scale.setScalar(s);
    scene.add(o);
  }
  /* Flags line the inside of the circuit for close range speed cues. */
  for (let i = 0; i < 60; i += 1) {
    const u = i / 60;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    const nx = -tan.z;
    const nz = tan.x;
    const f = flag(gradient, rng);
    const side = i % 2 === 0 ? 7.5 : -7.5;
    f.position.set(p.x + nx * side, 0, p.z + nz * side);
    scene.add(f);
  }

  /* Distant ridge line for horizon depth. Cones are centred on their
   * origin, so the base must sit at y = h / 2 or the range appears to
   * float. Aerial perspective: the far ring is lighter and bluer. */
  for (let ring = 0; ring < 2; ring += 1) {
    const dist = 820 + ring * 240;
    const col = ring === 0 ? 0x7e9ec0 : 0x9db6d2;
    for (let i = 0; i < 30; i += 1) {
      const a = (i / 30) * Math.PI * 2 + ring * 0.1;
      const h = 90 + rng() * 170;
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(90 + rng() * 80, h, 5),
        new THREE.MeshBasicMaterial({ color: col, fog: false }),
      );
      m.position.set(Math.cos(a) * dist, h / 2 - 6, Math.sin(a) * dist);
      scene.add(m);
    }
  }

  /* The quad. Betaflight motor order RR FR RL FL, front at -z, right at
   * +x, matching the plant's body frame after the frame.js conversion. */
  const quad = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, 0.032, 0.15),
    toonMat(0x262b33, gradient),
  );
  addOutline(body, 1.14);
  quad.add(body);
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.045, 0.07, 4),
    toonMat(0xe8503a, gradient),
  );
  canopy.rotation.x = -Math.PI / 2;
  canopy.rotation.z = Math.PI / 4;
  canopy.position.set(0, 0.028, -0.045);
  quad.add(canopy);

  const motorXZ = [
    [0.0778, 0.0778],
    [0.0778, -0.0778],
    [-0.0778, 0.0778],
    [-0.0778, -0.0778],
  ];
  const armMat = toonMat(0x333a44, gradient);
  const discs = [];
  for (let m = 0; m < 4; m += 1) {
    const [mx, mz] = motorXZ[m];
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.014, 0.112), armMat);
    arm.position.set(mx / 2, 0, mz / 2);
    arm.lookAt(new THREE.Vector3(mx, 0, mz));
    quad.add(arm);
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.017, 0.022, 8),
      toonMat(0x9aa3ad, gradient),
    );
    bell.position.set(mx, 0.016, mz);
    quad.add(bell);
    /* Prop disc: front pair bright so orientation is unmistakable. */
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0635, 0.0635, 0.004, 20),
      new THREE.MeshBasicMaterial({
        color: mz < 0 ? 0xff7a5c : 0x2b3038,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    );
    disc.position.set(mx, 0.03, mz);
    quad.add(disc);
    discs.push(disc);
  }
  scene.add(quad);

  const camera = new THREE.PerspectiveCamera(100, 1, 0.04, 2600);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, quad, discs, gates, curve };
}
