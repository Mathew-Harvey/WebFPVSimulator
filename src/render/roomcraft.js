/*
 * roomcraft.js: the other pilots in a room, drawn.
 *
 * Every other pilot's quad is the same small comic airframe in that
 * pilot's livery, inked, with spinning discs and a name tag over it. Not
 * the hero craft: the hero craft is twenty one meshes built for one
 * machine seen from a hand's width away, and a room can hold thirty
 * machines seen across a field. Not the mint ghost either, because mint
 * is a record, and these are people.
 *
 * THREE DRAW CALLS FOR THE WHOLE ROOM. One InstancedMesh carries every
 * airframe, one carries every set of prop discs, and one carries every
 * name tag, so a room of two and a room of thirty cost the same three
 * calls. Solo, the group is not even in the scene. That was the plan's
 * promise (about three calls whatever the room size, none when solo) and
 * it is what keeps a low end machine's frame where it was.
 *
 * HOW THE INK AND THE LIVERY FIT IN ONE CALL. The airframe's parts carry
 * their colours as vertex colours over an unlit material, with the cel
 * bands baked in by which way each face looks: top lit, sides a step
 * down, underside in shade. The ink is an inverted hull, as on the hero
 * craft, but merged into the same geometry: each part again, a few
 * millimetres larger, with its triangles wound backwards so only its far
 * side draws, behind the part, as a line round it. Livery is the
 * instance colour, which three multiplies into every vertex colour: the
 * canopy and the pack are near white, so they take the livery whole, the
 * carbon and the ink are near black, so they barely move.
 *
 * Name tags come from one atlas canvas, a row per pilot, redrawn only
 * when a handle or a livery changes. A tag faces the camera at a fixed
 * share of the screen's height, so a pilot two hundred metres off is a
 * readable name and not a speck, which on a 120 degree FPV lens is all a
 * quad at that distance would otherwise be. It is drawn over the
 * scenery, as a racing game draws names, because finding your friend
 * behind a building is what a name tag is for.
 *
 * Whoop rooms add a duct round each prop, so a whoop room reads as
 * whoops. Both are drawn at the five inch's size, because whoop maps are
 * built at MICRO_SCALE and the whoop there is five inch sized
 * (configs/airframes.js).
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* The five inch's own numbers (configs/airframes.js), not the collider's
 * live ones, which follow whatever this pilot is flying. */
const ARM = 0.110;
const PROP_R = 0.0635;
const MOTOR = ARM / Math.SQRT2;
const ROTOR_Y = 0.016;
const INK_W = 0.004;

const INK = 0x141a24;
const CARBON = 0x2b2f36;
const METAL = 0x9aa1ab;
const SHELL = 0xf6f2ea;
const DARK = 0x1c1f24;

/*
 * Liveries, by the avatar's livery number. The product's own colours
 * first, then the brighter ones a pilot picks so their friends can find
 * them. Kept apart from mint, which this product paints a record in.
 */
export const LIVERIES = Object.freeze([
  0xe8a8b8, 0xffd45c, 0x9db3c8, 0xf3ead4, 0xff7a59, 0x5ab0ff,
  0xb07cff, 0xff5c8a, 0x3fd0c9, 0xc9e265, 0xff9e3d, 0xe0e4ea,
]);

export function liveryColour(avatar, id) {
  const n = avatar && Number.isInteger(avatar.livery) && avatar.livery > 0
    ? avatar.livery - 1
    : id;
  return LIVERIES[((n % LIVERIES.length) + LIVERIES.length) % LIVERIES.length];
}

const TAG_COLS = 2;
const TAG_ROWS = 16;
const TAG_W = 512;
const TAG_H = 64;

/* Paint a part: vertex colours with the cel bands baked in by facing. */
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.getAttribute('normal');
  const colors = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i += 1) {
    const ny = n.getY(i);
    const band = ny > 0.5 ? 1 : (ny < -0.5 ? 0.55 : 0.78);
    colors[i * 3] = c.r * band;
    colors[i * 3 + 1] = c.g * band;
    colors[i * 3 + 2] = c.b * band;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/*
 * The ink for a part: the same shape grown by INK_W on every side and
 * wound backwards, so with front faces culled only its far side shows.
 */
/* Every triangle wound the other way, in place. */
function flip(g) {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  for (let i = 0; i < pos.count; i += 3) {
    for (const attr of [pos, nor]) {
      const ax = attr.getX(i + 1);
      const ay = attr.getY(i + 1);
      const az = attr.getZ(i + 1);
      attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
      attr.setXYZ(i + 2, ax, ay, az);
    }
  }
  return g;
}

function ink(geo, grow) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone());
  g.computeBoundingBox();
  const box = g.boundingBox;
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const sx = (size.x + 2 * grow) / Math.max(size.x, 1e-6);
  const sy = (size.y + 2 * grow) / Math.max(size.y, 1e-6);
  const sz = (size.z + 2 * grow) / Math.max(size.z, 1e-6);
  g.translate(-centre.x, -centre.y, -centre.z);
  g.scale(sx, sy, sz);
  g.translate(centre.x, centre.y, centre.z);
  flip(g);
  const pos = g.getAttribute('position');
  const c = new THREE.Color(INK);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function box(w, h, d, x, y, z, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

function cylinder(r, h, seg, x, y, z, open = false) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, open);
  g.translate(x, y, z);
  return g;
}

/* The airframe, in the craft frame: y up, front at minus z, metres. */
function airframeGeometry(whoop) {
  const parts = [];
  const add = (geo, hex, inked = true) => {
    parts.push(paint(geo, hex));
    if (inked) parts.push(ink(geo, INK_W));
  };
  /* Two arms crossing, the X of every freestyle frame. */
  add(box(0.014, 0.005, ARM * 2 + 0.02, 0, 0, 0, Math.PI / 4), CARBON);
  add(box(0.014, 0.005, ARM * 2 + 0.02, 0, 0, 0, -Math.PI / 4), CARBON);
  /* The canopy over the stack, in livery, and the pack under, in livery. */
  add(box(0.046, 0.026, 0.078, 0, 0.0155, 0.004), SHELL);
  add(box(0.034, 0.026, 0.072, 0, -0.0165, 0.006), SHELL);
  /* The camera at the nose, so which way it faces is never in doubt. */
  add(box(0.022, 0.020, 0.014, 0, 0.016, -0.041), DARK);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    add(cylinder(0.013, 0.016, 10, sx * MOTOR, 0.006, sz * MOTOR), METAL);
    if (whoop) {
      /* A duct, open at both ends, round the disc: its outside, and its
       * inside wound the other way, so the far wall shows from above. */
      const duct = cylinder(PROP_R + 0.006, 0.022, 16, sx * MOTOR, ROTOR_Y - 0.004, sz * MOTOR, true);
      add(duct, DARK, false);
      parts.push(flip(paint(duct, DARK)));
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function discGeometry() {
  const discs = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const g = new THREE.CircleGeometry(PROP_R, 18);
    g.rotateX(-Math.PI / 2);
    g.translate(sx * MOTOR, ROTOR_Y, sz * MOTOR);
    discs.push(g);
  }
  const merged = mergeGeometries(discs, false);
  for (const d of discs) d.dispose();
  return merged;
}

const TAG_VERTEX = /* glsl */ `
attribute vec2 aTag;
uniform vec2 uViewport;
uniform float uTagPx;
uniform float uLift;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.y += uLift;
  vec4 clip = projectionMatrix * mv;
  /* A fixed size in pixels, sitting just above the craft, whatever the
   * distance and whatever the lens: added in clip space, times w, so the
   * divide that follows leaves it exactly uTagPx tall. */
  vec2 px = vec2(position.x * uTagPx * ${TAG_W / TAG_H}.0, (position.y + 0.6) * uTagPx);
  clip.xy += px / uViewport * 2.0 * clip.w;
  /* Behind the camera, or in its lap: outside the clip volume, so not drawn. */
  gl_Position = mv.z > -0.2 ? vec4(0.0, 0.0, 2.0, 1.0) : clip;
  float slot = floor(aTag.x + 0.5);
  float col = mod(slot, ${TAG_COLS}.0);
  float row = floor(slot / ${TAG_COLS}.0);
  vUv = vec2((col + uv.x) / ${TAG_COLS}.0, 1.0 - (row + 1.0 - uv.y) / ${TAG_ROWS}.0);
  vAlpha = aTag.y;
}
`;

const TAG_FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 c = texture2D(map, vUv);
  float a = c.a * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(c.rgb, a);
  #include <colorspace_fragment>
}
`;

/*
 * capacity: the most pilots drawn at once, the board's room limit.
 * Returns { group, begin, add, end, forget, dispose }: begin() a frame,
 * add() each pilot to draw, end() to hand the frame to the GPU.
 */
export function buildRoomCraft({ capacity = 30, whoop = false } = {}) {
  const group = new THREE.Group();
  group.name = 'room-craft';
  group.visible = false;

  const bodyMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  const body = new THREE.InstancedMesh(airframeGeometry(whoop), bodyMat, capacity);
  body.name = 'room-craft-bodies';
  const discMat = new THREE.MeshBasicMaterial({
    color: 0xfff4e0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  const discs = new THREE.InstancedMesh(discGeometry(), discMat, capacity);
  discs.name = 'room-craft-discs';
  discs.renderOrder = 2;

  /* The atlas: TAG_COLS by TAG_ROWS rows of TAG_W by TAG_H. */
  const canvas = document.createElement('canvas');
  canvas.width = TAG_W * TAG_COLS;
  canvas.height = TAG_H * TAG_ROWS;
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  /* Drawn at a third of its size or less, so it is mipmapped; the canvas
   * is a power of two for exactly that. */
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  const viewport = new THREE.Vector2(1280, 720);
  const tagPx = { value: 26 };
  const tagMat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: atlas },
      uViewport: { value: viewport },
      /* Tall enough to read at 720 lines, and the same share of the
       * screen at any other. */
      uTagPx: tagPx,
      uLift: { value: 0.09 },
    },
    vertexShader: TAG_VERTEX,
    fragmentShader: TAG_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const tagGeo = new THREE.PlaneGeometry(1, 1);
  const tagAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
  tagAttr.setUsage(THREE.DynamicDrawUsage);
  tagGeo.setAttribute('aTag', tagAttr);
  const tags = new THREE.InstancedMesh(tagGeo, tagMat, capacity);
  tags.name = 'room-craft-tags';
  tags.renderOrder = 5;
  /* The size of whatever this draw lands in, the post chain's target or
   * the canvas, read at the draw so a resize or a render scale is never a
   * frame stale. */
  tags.onBeforeRender = (renderer) => {
    const target = renderer.getRenderTarget();
    if (target) {
      viewport.set(target.width, target.height);
    } else {
      renderer.getDrawingBufferSize(viewport);
    }
    tagPx.value = Math.max(18, Math.round(viewport.y * 0.036));
  };

  for (const m of [body, discs, tags]) {
    /* The instances are spread over the map; the geometry's own bounds
     * would cull them all whenever the first one left the view. */
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    group.add(m);
  }
  /* Created now, so the program is compiled with instance colours the
   * first time and never again. */
  body.setColorAt(0, new THREE.Color(1, 1, 1));
  body.instanceColor.setUsage(THREE.DynamicDrawUsage);

  /* Atlas rows, by pilot id. */
  const rowOf = new Map();
  const rowHandle = new Array(TAG_COLS * TAG_ROWS).fill(null);
  const rowLivery = new Array(TAG_COLS * TAG_ROWS).fill(-1);
  const freeRows = [];
  for (let i = TAG_COLS * TAG_ROWS - 1; i >= 0; i -= 1) freeRows.push(i);

  const panel = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fill();
  };

  function drawTag(row, handle, livery) {
    const ctx = canvas.getContext('2d');
    const x0 = (row % TAG_COLS) * TAG_W;
    const y0 = Math.floor(row / TAG_COLS) * TAG_H;
    ctx.clearRect(x0, y0, TAG_W, TAG_H);
    ctx.font = '700 34px system-ui, sans-serif';
    const text = handle.slice(0, 24);
    const w = Math.min(TAG_W - 8, ctx.measureText(text).width + 58);
    const left = x0 + (TAG_W - w) / 2;
    /* An ink panel with a livery chip, the manga furniture of the menus. */
    ctx.fillStyle = 'rgba(11, 17, 22, 0.86)';
    panel(ctx, left, y0 + 8, w, TAG_H - 16, 10);
    ctx.fillStyle = `#${livery.toString(16).padStart(6, '0')}`;
    panel(ctx, left + 10, y0 + 18, 22, TAG_H - 36, 5);
    ctx.fillStyle = '#f3ead4';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, left + 44, y0 + TAG_H / 2 + 1, w - 54);
    atlas.needsUpdate = true;
  }

  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const colour = new THREE.Color();
  let n = 0;
  let nd = 0;

  function begin() {
    n = 0;
    nd = 0;
  }

  /*
   * One pilot this frame. pose: { px, py, pz, qx, qy, qz, qw, cut,
   * spinning }, scene world. pilot: the board's { id, handle, avatar,
   * away }. A pilot inside a teleport is not drawn for the moment it
   * lasts, which is a fifth of a second at most.
   */
  function add(id, pose, pilot) {
    if (n >= capacity || pose.cut) {
      return;
    }
    let row = rowOf.get(id);
    if (row == null) {
      row = freeRows.pop();
      if (row == null) return;
      rowOf.set(id, row);
    }
    const livery = liveryColour(pilot.avatar, id);
    if (rowHandle[row] !== pilot.handle || rowLivery[row] !== livery) {
      rowHandle[row] = pilot.handle;
      rowLivery[row] = livery;
      drawTag(row, String(pilot.handle || ''), livery);
    }
    p.set(pose.px, pose.py, pose.pz);
    q.set(pose.qx, pose.qy, pose.qz, pose.qw);
    m4.compose(p, q, one);
    body.setMatrixAt(n, m4);
    body.setColorAt(n, colour.setHex(livery));
    if (pose.spinning) {
      discs.setMatrixAt(nd, m4);
      nd += 1;
    }
    m4.makeTranslation(pose.px, pose.py, pose.pz);
    tags.setMatrixAt(n, m4);
    tagAttr.setXY(n, row, pilot.away ? 0.45 : 1);
    n += 1;
  }

  function end() {
    body.count = n;
    discs.count = nd;
    tags.count = n;
    group.visible = n > 0;
    if (n) {
      body.instanceMatrix.needsUpdate = true;
      body.instanceColor.needsUpdate = true;
      tags.instanceMatrix.needsUpdate = true;
      tagAttr.needsUpdate = true;
    }
    if (nd) {
      discs.instanceMatrix.needsUpdate = true;
    }
  }

  /* A pilot who left: their atlas row goes back. */
  function forget(id) {
    const row = rowOf.get(id);
    if (row != null) {
      rowOf.delete(id);
      rowHandle[row] = null;
      rowLivery[row] = -1;
      freeRows.push(row);
    }
  }

  function dispose() {
    group.removeFromParent();
    for (const m of [body, discs, tags]) {
      m.geometry.dispose();
      m.material.dispose();
      m.dispose();
    }
    atlas.dispose();
  }

  return {
    group, begin, add, end, forget, dispose,
  };
}
