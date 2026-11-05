/*
 * fisheye.js: the FPV lens's bend, as a pilot setting beside the field of
 * view. Off by default.
 *
 * WHY. Every camera this shell has is rectilinear, r = f * tan(theta): a
 * straight line in the world stays straight on screen, and the price is
 * that the edges of a wide view are stretched. A real FPV lens is close to
 * equidistant, r = f * theta, which squeezes the edges and bends straight
 * lines near them. A pilot wrote that the rectilinear picture makes them
 * motion sick and that the FOV row did not help, because every stop on it
 * is still rectilinear (src/render/lens.js says why it has to be). This is
 * the other half of that file's last sentence: "anything closer to the real
 * lens is a fisheye shader, which is a different round". This is that round.
 *
 * THE FAMILY. One number, k, slides the projection from rectilinear to
 * equidistant:
 *
 *   r = f * tan(k * theta) / k
 *
 * k = 1 is rectilinear exactly, k = 0.5 is stereographic, and k toward 0 is
 * equidistant. The setting stores a strength in percent and k = 1 - strength.
 *
 * WHAT STAYS THE SAME: THE CORNERS. The picture is still drawn rectilinear,
 * at the FOV the pilot picked, and the bend is a remap of that picture in
 * the pass that already reads it. A remap can only show what was drawn, so
 * the corner of the screen is pinned to the corner of the drawing and every
 * other pixel is pulled inward from it. So the diagonal coverage is the FOV
 * row's, unchanged, the edges are squeezed the way a real lens squeezes
 * them, and the middle of the frame gets bigger: at 85 degrees on 16:9,
 * Slight shows the middle 1.28 times larger, Medium 1.48 and Strong 1.62
 * (fisheyeCentreScale in src/render/lens.js). A pilot who
 * wants the width back takes a wider FOV, which is the same choice a real
 * lens is.
 *
 * WHAT IT COSTS. No pass, no target, no texture tap. The grade is the pass
 * that reads the finished picture on every map and every preset, Low
 * included, and this moves the coordinate its one existing fetch reads:
 * an atan, a tan, a square root and a few multiplies per pixel, behind a
 * branch on a uniform, which every pixel takes the same way. Off, the
 * branch is not taken and the fetch reads exactly the coordinate it read
 * before. The same honest caveat as any remap: the magnified middle is
 * upsampled from the drawing, so it is a little softer at Strong, and the
 * squeezed corners are minified without mipmaps.
 *
 * WHAT ELSE HAS TO KNOW. Anything that draws on top of the picture at a
 * projected position (the target lock, the mini games' markers) has to bend
 * its point the same way, or a marker sits off its target by more the
 * further out it is. fisheyeNdc does it, and is a no op while the lens is
 * off.
 *
 * Only the pilot's own lens is bent: main.js passes a strength of zero for
 * the intro, the finish camera, a chase camera and the menus.
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

/* The stops and the note's arithmetic live in src/render/lens.js, which
 * imports nothing, so the settings screen can have them without three.js. */

/*
 * uFish = (k, k / f, 1 / tan(v / 2), aspect), all in units of the frame's
 * half height. x >= 1 means off. Shared by both post chains.
 */
export const FISHEYE_GLSL = /* glsl */ `
  uniform vec4 uFish;
  vec2 fisheyeUv( vec2 uv ) {
    if ( uFish.x >= 1.0 ) {
      return uv;
    }
    vec2 p = ( uv - 0.5 ) * vec2( 2.0 * uFish.w, 2.0 );
    float r = length( p );
    if ( r < 1e-5 ) {
      return uv;
    }
    float th = atan( r * uFish.y ) / uFish.x;
    return 0.5 + ( uv - 0.5 ) * ( tan( th ) * uFish.z / r );
  }
`;

/* The lens as the last frame set it, for fisheyeNdc. */
const state = { on: false, k: 1, kf: 0, tanV: 1, aspect: 1, s: -1, fov: 0, asp: 0 };

/*
 * Set the lens for this frame. strength in percent (0 is off), fovDeg the
 * camera's vertical field, aspect width over height. Recomputed only when
 * one of them changes, so a steady flight does no trig here at all and
 * nothing is allocated. Writes into the post chain's grade uniform.
 */
export function setFisheye(post, strength, fovDeg, aspect) {
  const s = strength > 0 ? Math.min(strength, 95) : 0;
  if (s !== state.s || (s !== 0 && (fovDeg !== state.fov || aspect !== state.asp))) {
    state.s = s;
    state.fov = fovDeg;
    state.asp = aspect;
    if (s === 0) {
      state.on = false;
      state.k = 1;
    } else {
      const k = 1 - s / 100;
      const tanV = Math.tan((fovDeg * Math.PI) / 360);
      const d = Math.sqrt(aspect * aspect + 1);
      /* Pin the corner: the output corner, radius d, maps to the drawing's
       * corner, at angle atan(d tanV) off axis. */
      const thetaC = Math.atan(d * tanV);
      state.on = true;
      state.k = k;
      state.kf = Math.tan(k * thetaC) / d;
      state.tanV = tanV;
      state.aspect = aspect;
    }
  }
  const g = post && post.grade;
  const u = g && (g.mat ? g.mat.uniforms : g.uniforms);
  if (u && u.uFish) {
    u.uFish.value.set(state.on ? state.k : 1, state.kf, 1 / state.tanV, state.aspect);
  }
}

/*
 * Bend a projected point (a THREE.Vector3 fresh from .project(camera)) the
 * way the grade bends the picture, in place. Points behind the camera are
 * left alone: their callers read a bearing from them, not a position.
 */
export function fisheyeNdc(v) {
  if (!state.on || v.z <= -1 || v.z >= 1) {
    return v;
  }
  const x = v.x * state.aspect;
  const rs = Math.sqrt(x * x + v.y * v.y);
  if (rs < 1e-6) {
    return v;
  }
  const th = Math.atan(rs * state.tanV);
  const kth = state.k * th;
  /* Past a quarter turn the bend has no image; pin it far outside. */
  const r = kth < Math.PI / 2 - 1e-3 ? Math.tan(kth) / state.kf : 1e3;
  const s = r / rs;
  v.x *= s;
  v.y *= s;
  return v;
}

/* The grade's fetch in the vendored pipeline, exactly as
 * src/maps/city/vendored/core/post.js has it. As with manga.js, the edit is
 * to this pipeline's own material: nothing under vendored/ changes, and a
 * vendored update that moves the line leaves the map drawing as before. */
const GRADE_HEAD_AT = 'varying vec2 vUv;';
const GRADE_FETCH = 'vec3 c = texture2D( tDiffuse, vUv ).rgb;';

export function fisheyePipeline(pipeline) {
  const g = pipeline.grade && pipeline.grade.mat;
  if (!g) {
    return false;
  }
  const fs = g.fragmentShader;
  if (!fs.includes(GRADE_HEAD_AT) || !fs.includes(GRADE_FETCH)) {
    return false;
  }
  g.fragmentShader = fs
    .replace(GRADE_HEAD_AT, `${GRADE_HEAD_AT}\n${FISHEYE_GLSL}`)
    .replace(GRADE_FETCH, 'vec3 c = texture2D( tDiffuse, fisheyeUv( vUv ) ).rgb;');
  g.uniforms.uFish = { value: new THREE.Vector4(1, 0, 1, 1) };
  g.needsUpdate = true;
  return true;
}
