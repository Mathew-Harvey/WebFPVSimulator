/*
 * sky.js: painted dome and flat cel clouds for the kiln yard.
 *
 * Same three-stop quantised dome as the city, retinted to ochre haze so
 * the stack reads against a warm sky rather than blossom pink.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { PAL } from './palette.js';
import { flat } from './cel/toon.js';
import { rngKit } from './cel/util.js';

function cloudTex() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 512, 256);
  c.fillStyle = '#ffffff';
  const puffs = [
    [0.22, 0.62, 0.15], [0.36, 0.46, 0.2], [0.52, 0.4, 0.24],
    [0.68, 0.5, 0.19], [0.82, 0.63, 0.14], [0.45, 0.66, 0.2], [0.6, 0.68, 0.17],
  ];
  for (const [x, y, r] of puffs) {
    c.beginPath();
    c.ellipse(x * 512, y * 256, r * 512 * 0.55, r * 256 * 1.1, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.globalCompositeOperation = 'destination-out';
  c.fillRect(0, 256 * 0.78, 512, 256 * 0.22);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function buildSky(scene, radius = 420) {
  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: true,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(PAL.skyTop) },
      uMid: { value: new THREE.Color(PAL.skyMid) },
      uHaze: { value: new THREE.Color(PAL.skyHaze) },
      uBands: { value: 26.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHaze;
      uniform float uBands;
      varying vec3 vWorld;
      void main() {
        float h = normalize( vWorld ).y;
        float t = clamp( h * 1.15 + 0.02, 0.0, 1.0 );
        float q = floor( t * uBands ) / uBands;
        t = mix( t, q, 0.35 );
        vec3 col = mix( uHaze, uMid, smoothstep( 0.0, 0.30, t ) );
        col = mix( col, uTop, smoothstep( 0.26, 0.92, t ) );
        col = mix( col, uHaze, smoothstep( 0.12, -0.05, h ) * 0.6 );
        gl_FragColor = vec4( col, 1.0 );
      }
    `,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  dome.userData.noMerge = true;
  scene.add(dome);

  const tex = cloudTex();
  const rng = rngKit(4103);
  const clouds = new THREE.Group();
  clouds.userData.noMerge = true;
  const matA = flat({
    color: PAL.cloud, map: tex, transparent: true, opacity: 0.58,
    depthWrite: false, fog: false, cache: false,
  });
  const matB = flat({
    color: PAL.cloudShade, map: tex, transparent: true, opacity: 0.32,
    depthWrite: false, fog: false, cache: false,
  });
  matA.map.wrapS = THREE.ClampToEdgeWrapping;
  matA.map.wrapT = THREE.ClampToEdgeWrapping;
  for (let i = 0; i < 14; i += 1) {
    const r = rng.range(180, 320);
    const a = rng.range(0, Math.PI * 2);
    const w = rng.range(80, 180);
    const h = w * rng.range(0.24, 0.34);
    const y = rng.range(40, 110);
    const g = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matB);
    back.position.set(2, -h * 0.1, -1.5);
    back.userData.noMerge = true;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matA);
    front.userData.noMerge = true;
    g.add(back, front);
    g.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    g.lookAt(0, y * 0.55, 0);
    g.renderOrder = -9;
    clouds.add(g);
  }
  clouds.frustumCulled = false;
  scene.add(clouds);
  return { dome, clouds };
}

export function buildDistantHills(root, M) {
  const layers = [
    { z: -280, h: 38, mat: M.hillFar, width: 720, bumps: 8, y: -8 },
    { z: -200, h: 28, mat: M.hill, width: 620, bumps: 6, y: -6 },
  ];
  for (const layer of layers) {
    const shape = new THREE.Shape();
    const n = 72;
    shape.moveTo(-layer.width * 0.5, -50);
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = (t - 0.5) * layer.width;
      let y = 0;
      for (let b = 1; b <= layer.bumps; b += 1) {
        y += Math.sin(t * Math.PI * b * 1.7 + b * 2.1) * (layer.h / (b * 1.25));
      }
      shape.lineTo(x, Math.max(2, y * 0.55 + layer.h * 0.55));
    }
    shape.lineTo(layer.width * 0.5, -50);
    const geo = new THREE.ShapeGeometry(shape);
    const poses = [
      { x: 0, z: layer.z, ry: 0 },
      { x: -layer.z, z: 40, ry: Math.PI * 0.5 },
      { x: layer.z, z: 40, ry: -Math.PI * 0.5 },
    ];
    for (const p of poses) {
      const mesh = new THREE.Mesh(geo, layer.mat);
      mesh.position.set(p.x, layer.y, p.z);
      mesh.rotation.y = p.ry;
      mesh.userData.noMerge = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      root.add(mesh);
    }
  }
}
