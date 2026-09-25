/*
 * gallery.js: lay every freestyle asset out on a plot and draw it the way a
 * built map draws it. See gallery.html for the query parameters, and three
 * more it does not list:
 *
 *   ?dims={"floors":8}    JSON merged over the shown asset's dimensions,
 *                         so a size can be looked at without a map
 *   ?time=dusk            a built map's time of day (golden, noon, dusk,
 *                         overcast), lit, skied and graded from
 *                         src/maps/built/looks.js; golden by default
 *   ?ground=grass         the ground painted in that map ground's colour
 *                         (concrete, tarmac, grass, dirt) instead of the
 *                         town's terrain
 *
 * window.__gallery carries the renderer (its info counts the whole last
 * frame, every pass of the post chain), the props group, and how many
 * batches the kit made, for a check to read.
 *
 * It uses the town's lights and sky as src/maps/city/index.js sets them
 * up, and the built map's own post chain and ridge line (BuiltPipeline and
 * buildBackdrop in src/maps/built/index.js), so this page is a faithful
 * preview of a built map: the town's chain inks the second difference of
 * linear depth, which on open ground draws a dark band along the horizon
 * that no built map shows, and the town's ridge flats end in cut slabs.
 * Importing them brings the built map's modules with it, which a page for
 * looking at art can afford. It sets window.__galleryReady once the
 * first frame is drawn, which is what scripts/shots.js waits on.
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
import { BuiltPipeline, buildBackdrop } from '../maps/built/index.js';
import { TIMES, GROUNDS, kitLook, paintLights, paintSky, paintPost } from '../maps/built/looks.js';
import { buildSky } from '../maps/city/vendored/core/sky.js';
import { cel } from '../maps/city/vendored/core/toon.js';
import { PROPS, FURNITURE, partsOf, planBounds } from './catalog.js';
import { PROP_GROUPS, styleDims } from './types.js';
import { PropKit } from './kit.js';
import { placedYaw } from './solids.js';
import { sincos } from './trig.js';
import { defaultDims, ELEMENTS } from '../trackbuilder/elements.js';

const params = new URLSearchParams(window.location.search);
/* The time of day and the ground, as a built map would have them. */
const timeId = Object.prototype.hasOwnProperty.call(TIMES, params.get('time')) ? params.get('time') : 'golden';
const T = TIMES[timeId];
const G = Object.prototype.hasOwnProperty.call(GROUNDS, params.get('ground')) ? GROUNDS[params.get('ground')] : null;
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(new THREE.Color(T.fog.color), 1);
/* The post chain renders several passes a frame, and three.js clears its
 * counts at every one of them by default, so the triangles it reported were
 * the last full screen quad's. Cleared once a frame instead, in frame(). */
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(T.fog.color, 60, 420);
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
const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.12);
scene.add(hemi);
paintLights({ sun, fill, bounce, hemi }, T);
const sky = buildSky(scene, 500);
paintSky(sky, T);
buildBackdrop(scene, 1, T.hills);

/* Ground: the town's terrain colour, or a map ground's. */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), G
  ? cel({ color: G.plot, bands: 3, tint: G.tint })
  : cel({ color: 0xc4c4b6, bands: 3, tint: 0x7a7396 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ---- what to show ---- */
const items = [];
const only = params.get('asset');
const row = params.get('row');
/* ?dims=, over the defaults. A page with a typo in it shows the defaults
 * and says why in the console, rather than showing nothing. */
let dimsOver = {};
if (params.get('dims')) {
  try {
    const d = JSON.parse(params.get('dims'));
    dimsOver = d && typeof d === 'object' ? d : {};
  } catch (e) {
    console.warn(`gallery: ?dims is not JSON (${e.message}), showing the defaults`);
  }
}
for (const [id, def] of Object.entries(PROPS)) {
  if (def.zone || (only && only !== id) || (row && def.group !== row)) {
    continue;
  }
  const styles = params.get('style') ? [params.get('style')] : (def.styles ?? [undefined]);
  for (const style of styles) {
    items.push({ id: `el-${id}-${style ?? ''}`, type: id, style, dims: { ...def.dims, ...(styleDims(id, style) ?? {}), ...dimsOver }, position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
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
  items.push({ id: `el-${only}`, type: only, dims: { ...defaultDims(only, 'full'), ...dimsOver }, position: { x: 0, y: 0, z: def.defaultZ ?? 0 }, yaw: 0, pitch: def.pitch ?? 0, flagSide: def.flagSide });
}

/* Lay them out in a row, left to right, each on its own footprint. */
const kit = new PropKit(kitLook(timeId));
let cursor = 0;
let tallest = 0;
const placed = [];
const SC = { s: 0, c: 1 };
for (const el of items) {
  const parts = partsOf(el);
  const b = planBounds(parts);
  const top = parts.reduce((m, p) => Math.max(m, p.t === 'box' ? p.hi[1] : Math.max(p.a[1], p.b[1]) + p.r), 1);
  tallest = Math.max(tallest, top);
  const turns = (PROPS[el.type] ?? FURNITURE[el.type]).turns;
  /* Every asset's front is its +x; a heading of -pi/2 turns that toward
   * the camera, which stands on +z. */
  const yaw = placedYaw(turns, Number(params.get('yaw') ?? -Math.PI / 2));
  /*
   * THE ROW RUNS ALONG WORLD X, AND THE ASSET STANDS TURNED, so it is
   * spaced by its plan turned to that heading: at -pi/2 a building's depth
   * lies along the row and its width across it. Spaced by the unturned
   * bounds, a wide asset took its depth's room and overlapped its
   * neighbours. The turn is kit.begin's, x' = x c + z s and z' = z c - x s.
   */
  sincos(yaw, SC);
  let e0 = Infinity;
  let e1 = -Infinity;
  let f0 = Infinity;
  let f1 = -Infinity;
  for (const lx of [b.x0, b.x1]) {
    for (const lz of [b.z0, b.z1]) {
      const wx = lx * SC.c + lz * SC.s;
      const wz = lz * SC.c - lx * SC.s;
      e0 = Math.min(e0, wx);
      e1 = Math.max(e1, wx);
      f0 = Math.min(f0, wz);
      f1 = Math.max(f1, wz);
    }
  }
  const w = e1 - e0;
  const x = cursor - e0;
  kit.begin(x, el.position.z, 0, yaw, '');
  kit.element(el);
  placed.push({ el, x: x + (e0 + e1) / 2, w, d: f1 - f0, top });
  cursor += w + 6;
}
const props = kit.finish();
scene.add(props);
let batches = 0;
props.traverse((o) => {
  if (o.isMesh) {
    batches += 1;
  }
});

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
sun.position.copy(focus).add(new THREE.Vector3(...T.sun.at));
fill.target.position.copy(focus);
fill.position.copy(focus).add(new THREE.Vector3(...T.fill.at));
bounce.target.position.copy(focus);
bounce.position.copy(focus).add(new THREE.Vector3(...T.bounce.at));
sky.dome.position.copy(camera.position);
sky.clouds.position.copy(camera.position);

const pipeline = new BuiltPipeline(renderer, scene, camera, { pixelBudget: 2.6e6 });
paintPost(pipeline, T);
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
  renderer.info.reset();
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
window.__gallery = {
  items: placed.map((p) => ({ type: p.el.type, style: p.el.style, x: p.x, w: p.w, dims: p.el.dims })),
  renderer,
  props,
  batches,
};
