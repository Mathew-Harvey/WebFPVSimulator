/*
 * gallery.js: lay every freestyle asset out on a plot and draw it the way a
 * built map draws it. See gallery.html for the query parameters.
 *
 * It uses the town's lights, sky and post chain exactly as
 * src/maps/city/index.js sets them up, so this page is a faithful preview,
 * and it sets window.__galleryReady once the first frame is drawn, which is
 * what scripts/shots.js waits on.
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
import { PAL } from '../maps/city/vendored/core/palette.js';
import { Pipeline } from '../maps/city/vendored/core/post.js';
import { buildSky, buildDistantHills } from '../maps/city/vendored/core/sky.js';
import { cel } from '../maps/city/vendored/core/toon.js';
import { PROPS, FURNITURE, partsOf, planBounds } from './catalog.js';
import { PROP_GROUPS, styleDims } from './types.js';
import { PropKit } from './kit.js';
import { placedYaw } from './solids.js';
import { defaultDims, ELEMENTS } from '../trackbuilder/elements.js';

const params = new URLSearchParams(window.location.search);
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(new THREE.Color(PAL.fog), 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PAL.fog, 60, 420);
const camera = new THREE.PerspectiveCamera(55, 1, 0.25, 900);

/* The town's two light anime setup. */
const sun = new THREE.DirectionalLight(PAL.sun, 2.25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const half = 70;
Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 400 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(PAL.fill, 1.08);
scene.add(fill, fill.target);
const bounce = new THREE.DirectionalLight(0xd8cbe8, 0.34);
scene.add(bounce, bounce.target);
scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.12));
const sky = buildSky(scene, 500);
buildDistantHills(scene);

/* Ground: the town's terrain colour, and a paved plot. */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), cel({ color: 0xc4c4b6, bands: 3, tint: 0x7a7396 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ---- what to show ---- */
const items = [];
const only = params.get('asset');
const row = params.get('row');
for (const [id, def] of Object.entries(PROPS)) {
  if (def.zone || (only && only !== id) || (row && def.group !== row)) {
    continue;
  }
  const styles = params.get('style') ? [params.get('style')] : (def.styles ?? [undefined]);
  for (const style of styles) {
    items.push({ id: `el-${id}-${style ?? ''}`, type: id, style, dims: { ...def.dims, ...(styleDims(id, style) ?? {}) }, position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  }
}
if (!only && !row) {
  for (const id of Object.keys(FURNITURE)) {
    const def = ELEMENTS[id];
    if (!def || id === 'groundLogo') {
      continue;
    }
    items.push({
      id: `el-${id}`, type: id, dims: defaultDims(id, 'full'), position: { x: 0, y: 0, z: def.defaultZ ?? 0 },
      yaw: 0, pitch: def.pitch ?? 0, flagSide: def.flagSide,
    });
  }
}
if (only && FURNITURE[only]) {
  const def = ELEMENTS[only];
  items.push({ id: `el-${only}`, type: only, dims: defaultDims(only, 'full'), position: { x: 0, y: 0, z: def.defaultZ ?? 0 }, yaw: 0, pitch: def.pitch ?? 0, flagSide: def.flagSide });
}

/* Lay them out in a row, left to right, each on its own footprint. */
const kit = new PropKit();
let cursor = 0;
let tallest = 0;
const placed = [];
for (const el of items) {
  const parts = partsOf(el);
  const b = planBounds(parts);
  const w = b.x1 - b.x0;
  const x = cursor - b.x0;
  const top = parts.reduce((m, p) => Math.max(m, p.t === 'box' ? p.hi[1] : Math.max(p.a[1], p.b[1]) + p.r), 1);
  tallest = Math.max(tallest, top);
  const turns = (PROPS[el.type] ?? FURNITURE[el.type]).turns;
  /* Every asset's front is its +x; a heading of -pi/2 turns that toward
   * the camera, which stands on +z. */
  const yaw = placedYaw(turns, Number(params.get('yaw') ?? -Math.PI / 2));
  kit.begin(x, el.position.z, 0, yaw, '');
  kit.element(el);
  placed.push({ el, x: x + (b.x0 + b.x1) / 2, w, d: b.z1 - b.z0, top });
  cursor += w + 6;
}
scene.add(kit.finish());

/* ---- the camera ---- */
const label = document.getElementById('label');
const spanX = Math.max(10, cursor - 6);
let eye;
let at;
if (params.get('cam')) {
  eye = new THREE.Vector3(...params.get('cam').split(',').map(Number));
  at = new THREE.Vector3(...(params.get('at') ?? '0,0,0').split(',').map(Number));
} else if (placed.length === 1 || only) {
  const p = placed[0];
  const r = Math.max(p.w, p.d, p.top) * 1.25 + 4;
  const az = Number(params.get('az') ?? 0.75);
  const el = Number(params.get('el') ?? 0.32);
  at = new THREE.Vector3(p.x, p.top * 0.45, 0);
  eye = new THREE.Vector3(p.x + Math.cos(az) * r * Math.cos(el), p.top * 0.45 + Math.sin(el) * r, Math.sin(az) * r * Math.cos(el));
  label.textContent = `${PROPS[p.el.type]?.label ?? p.el.type}${p.el.style ? `, ${p.el.style}` : ''}`;
} else {
  at = new THREE.Vector3(spanX / 2, tallest * 0.3, 0);
  eye = new THREE.Vector3(spanX / 2, tallest * 0.9 + 10, spanX * 0.62 + 20);
  label.textContent = row ? (PROP_GROUPS.find((g) => g.id === row)?.label ?? row) : 'Every asset';
}
camera.position.copy(eye);
camera.lookAt(at);

/* Lights follow the plot. */
const focus = at.clone();
sun.target.position.copy(focus);
sun.position.copy(focus).add(new THREE.Vector3(-52, 62, 56));
fill.target.position.copy(focus);
fill.position.copy(focus).add(new THREE.Vector3(48, 26, -44));
bounce.target.position.copy(focus);
bounce.position.copy(focus).add(new THREE.Vector3(10, -18, 40));
sky.dome.position.copy(camera.position);
sky.clouds.position.copy(camera.position);

const pipeline = new Pipeline(renderer, scene, camera, { pixelBudget: 2.6e6 });
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  pipeline.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

let frames = 0;
function frame() {
  pipeline.render();
  frames += 1;
  if (frames === 2) {
    window.__galleryReady = true;
  }
  if (params.get('spin')) {
    const t = performance.now() * 0.0002;
    const r = eye.distanceTo(at);
    camera.position.set(at.x + Math.cos(t) * r, eye.y, at.z + Math.sin(t) * r);
    camera.lookAt(at);
  }
  requestAnimationFrame(frame);
}
frame();
window.__gallery = { items: placed.map((p) => ({ type: p.el.type, style: p.el.style, x: p.x })), renderer };
