/*
 * trails.js: the long trail behind every quad in a room, drawn while the
 * overview camera is open, and never otherwise.
 *
 * ONE DRAW CALL FOR EVERY TRAIL. Each step of each trail is one instance of
 * a four corner quad: both ends of the step in world space, how faded each
 * end is, and its pilot's livery. The vertex shader projects both ends and
 * opens the step to a fixed width in pixels across the line on the screen,
 * so a trail 80 m below the camera is as readable as one 8 m away, as the
 * name tags are. The fragment draws an ink edge either side of the livery,
 * the manga furniture the rest of the game uses, so a cream or a sky trail
 * still reads over the cream lines on the grass.
 *
 * Rebuilt every frame from src/net/fieldwatch.js, only while the overview
 * is drawn: a few thousand steps for a full room, written into arrays that
 * grow when they must and are otherwise reused, so a frame allocates
 * nothing. A pilot who is flying never builds this file at all.
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

/* The lengths T steps through, in ms; 0 is off and Infinity the whole lap
 * (or everything kept, off a race). Long is the default. */
export const TRAIL_LENGTHS = Object.freeze([
  { key: 'off', label: 'Off', ms: 0 },
  { key: 'short', label: 'Short', ms: 5000 },
  { key: 'long', label: 'Long', ms: 20000 },
  { key: 'lap', label: 'Whole lap', ms: Infinity },
]);

const VERTEX = /* glsl */ `
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aCol;
uniform vec2 uViewport;
uniform float uPx;
varying vec3 vCol;
varying float vFade;
varying float vSide;
varying float vWeight;
void main() {
  vWeight = aCol.w;
  vec4 ca = projectionMatrix * modelViewMatrix * vec4(aA.xyz, 1.0);
  vec4 cb = projectionMatrix * modelViewMatrix * vec4(aB.xyz, 1.0);
  vFade = mix(aA.w, aB.w, position.x);
  vCol = aCol.rgb;
  vSide = position.y;
  /* A step with an end behind the camera is not drawn: at this lens and
   * this height it is never one the eye needs. */
  if (ca.w < 0.05 || cb.w < 0.05 || vFade <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec2 sa = ca.xy / ca.w * uViewport;
  vec2 sb = cb.xy / cb.w * uViewport;
  vec2 d = sb - sa;
  float l = length(d);
  vec2 n = l > 1e-4 ? vec2(-d.y, d.x) / l : vec2(0.0, 1.0);
  /* Wider at the quad, thinner toward the tail, wider again for the pilot
   * picked. */
  float w = uPx * aCol.w * (0.45 + 0.55 * vFade);
  vec4 c = position.x < 0.5 ? ca : cb;
  c.xy += n * position.y * w / uViewport * c.w;
  gl_Position = c;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vCol;
varying float vFade;
varying float vSide;
varying float vWeight;
void main() {
  /* A pilot dimmed while another is kept in view is a third as strong. */
  float a = vFade * vFade * (vWeight < 0.5 ? 0.35 : 1.0);
  if (a < 0.01) discard;
  float edge = step(0.62, abs(vSide));
  vec3 c = mix(vCol, vec3(0.043, 0.067, 0.086), edge);
  gl_FragColor = vec4(c, a * mix(1.0, 0.7, edge));
  #include <colorspace_fragment>
}
`;

export function buildTrails() {
  const geo = new THREE.InstancedBufferGeometry();
  /* x: which end, y: which side. */
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0,
  ]), 3));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  let cap = 0;
  let aA = null;
  let aB = null;
  let aCol = null;
  const viewport = new THREE.Vector2(1280, 720);
  const px = { value: 3.4 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uViewport: { value: viewport }, uPx: px },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'room-trails';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  /* Half the drawing size: the shader works in half widths. */
  mesh.onBeforeRender = (renderer) => {
    const target = renderer.getRenderTarget();
    if (target) {
      viewport.set(target.width, target.height);
    } else {
      renderer.getDrawingBufferSize(viewport);
    }
    viewport.multiplyScalar(0.5);
    px.value = Math.max(2, viewport.y * 0.0062);
  };

  function grow(want) {
    if (want <= cap) {
      return;
    }
    cap = Math.max(4096, cap * 2);
    while (cap < want) cap *= 2;
    aA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    aB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    for (const a of [aA, aB, aCol]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aA', aA);
    geo.setAttribute('aB', aB);
    geo.setAttribute('aCol', aCol);
  }

  const colour = new THREE.Color();

  /*
   * This frame's trails. field: the FieldWatch. lenMs: from TRAIL_LENGTHS.
   * colourOf(id): the pilot's livery as a hex number, or -1 to leave them
   * out. weightOf(id): 1, or less for a pilot dimmed and more for the one
   * picked. lapFrom(id): for the whole lap, the time on the field's clock
   * that pilot's lap began, or 0 for everything kept.
   */
  function update(field, nowMs, lenMs, colourOf, weightOf, lapFrom) {
    if (!lenMs) {
      mesh.visible = false;
      return 0;
    }
    let want = 0;
    for (const p of field.pilots.values()) want += p.n;
    grow(want);
    const A = aA.array;
    const B = aB.array;
    const C = aCol.array;
    const now = field.clock(nowMs);
    let k = 0;
    for (const [id, p] of field.pilots) {
      const hex = colourOf(id);
      if (hex < 0 || p.n < 2) {
        continue;
      }
      colour.setHex(hex);
      const wgt = weightOf(id);
      const from = lenMs === Infinity ? lapFrom(id) : now - lenMs;
      const span = lenMs === Infinity ? Math.max(1000, now - from) : lenMs;
      const buf = p.buf;
      const cap4 = buf.length;
      /* Newest to oldest, stopping at the first sample too old. */
      let j = ((p.head - 1 + field.cap) % field.cap) * 4;
      for (let s = 1; s < p.n; s += 1) {
        const i = (j - 4 + cap4) % cap4;
        const tb = buf[j + 3];
        if (tb < from) {
          break;
        }
        if (!Number.isNaN(buf[i]) && !Number.isNaN(buf[j])) {
          const ta = buf[i + 3];
          const o = k * 4;
          A[o] = buf[i];
          A[o + 1] = buf[i + 1];
          A[o + 2] = buf[i + 2];
          A[o + 3] = Math.max(0, 1 - (now - ta) / span);
          B[o] = buf[j];
          B[o + 1] = buf[j + 1];
          B[o + 2] = buf[j + 2];
          B[o + 3] = Math.max(0, 1 - (now - tb) / span);
          C[o] = colour.r;
          C[o + 1] = colour.g;
          C[o + 2] = colour.b;
          C[o + 3] = wgt;
          k += 1;
        }
        j = i;
      }
    }
    geo.instanceCount = k;
    mesh.visible = k > 0;
    if (k) {
      /* Only the steps drawn go to the GPU, not the whole array. */
      for (const a of [aA, aB, aCol]) {
        if (a.clearUpdateRanges) {
          a.clearUpdateRanges();
          a.addUpdateRange(0, k * 4);
        }
        a.needsUpdate = true;
      }
    }
    return k;
  }

  function hide() {
    mesh.visible = false;
  }

  function dispose() {
    mesh.removeFromParent();
    geo.dispose();
    mat.dispose();
  }

  return { mesh, update, hide, dispose };
}
