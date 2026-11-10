/*
 * shade.js: the High preset's contact shade. A soft cool tone where two
 * things meet: under an eave, round the foot of a pole, between stacked
 * containers, in the corner of a room.
 *
 * WHY. The ink gives the world its lines and the sun its shadows, and
 * neither says that a thing stands ON the ground: a box on concrete in
 * the open sun has a line round it and nothing under it. A background
 * painter lays a tone into every such corner. The comic layer had this
 * (AMBIENT OCCLUSION in src/render/comic.js) and it was switched off with
 * the rest of that layer on 2026-10-09, because it ran on Medium as well
 * and an integrated laptop boots on Medium. The owner, 2026-11-10: "improve
 * the graphics without impacting performance for medium or low, can
 * increase system demand at high". So this is that estimate again, for
 * High alone, and rebuilt to cost a quarter of what it did and to lose its
 * grain.
 *
 * WHAT IS DIFFERENT FROM THE COMIC LAYER'S. That one made its eight depth
 * fetches for every pixel of the frame, inside the ink pass, and turned
 * its disc by a noise per pixel, which the eye reads as a fixed grain over
 * a moving picture. This one makes them at half the frame's width and
 * height, a quarter of the pixels, into a one channel target of its own,
 * and then blurs that with one step down and one step up of glow.js's
 * filter. The blur is what takes the grain out, and a contact tone wants
 * to be soft in any case. A blur that knows nothing of depth lets a tone
 * creep a few pixels over the edge of whatever stands in front of it, and
 * that edge is where the ink line is drawn, so the line covers it.
 *
 * WHAT IT COSTS, on High only. Three small passes and one fetch in the ink
 * pass: eight depth fetches over a quarter of the frame's pixels (two per
 * frame pixel), five over a sixteenth and eight over a quarter. Two byte
 * targets, a half and a quarter of the scene's side: 0.8 MB at High's 2.6
 * Mpx. No frame is held. On Low and Medium this module's function is never
 * called and the ink pass is the string it was.
 *
 * WebGL 2 only (the estimate takes the surface's normal from the depth's
 * own derivatives); on WebGL 1 nothing is added.
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
import { AO_GLSL, AO_TINT_GLSL, aoUniforms, updateAoCamera, comicGL2 } from './comic.js';
import { DOWN, UP, quad } from './glow.js';

/* How dark a fully closed corner goes, as a share of the way to the tint.
 * The comic layer's estimate at its own strength, taken down: a tone, not a
 * shadow. Picked by eye on the town's eaves and Kumoi Towers' steps. */
export const SHADE_STRENGTH = 2.0;
export const SHADE_AMOUNT = 0.7;
/* Metres. The tone fades out over the last two fifths of this. */
export const SHADE_FAR = 30;

const ESTIMATE = /* glsl */ `
  #include <packing>
  uniform sampler2D tDepth;
  uniform float uNear, uFar, uSkyDepth;
  varying vec2 vUv;
  float linearDepth( vec2 uv ) {
    return -perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, uNear, uFar );
  }
  #define COMIC_AO_DEPTH(uv) linearDepth(uv)
  ${AO_GLSL}
  void main() {
    float dc = linearDepth( vUv );
    float open = 1.0;
    if ( dc < uSkyDepth ) {
      vec3 P = comicAoPos( vUv, dc );
      vec3 N = normalize( cross( dFdx( P ), dFdy( P ) ) );
      N *= sign( dot( N, -P ) + 1e-6 );
      open = comicAo( vUv, P, N );
    }
    gl_FragColor = vec4( open, open, open, 1.0 );
  }
`;

/* The vendored ink pass's line the tone is laid in before, exactly as
 * src/maps/city/vendored/core/post.js has it: after the sky has left, and
 * before the line is drawn over the colour. */
const INK_HEAD_AT = '    varying vec2 vUv;';
const INK_LINE_AT = '      vec3 line = mix( uInk, col * 0.42, 0.22 );';

export function shadePipeline(pipeline) {
  const mat = pipeline.ink && pipeline.ink.mat;
  if (!mat || !comicGL2(pipeline.renderer) || !pipeline.rtScene || !pipeline.rtScene.depthTexture) {
    return false;
  }
  const fs = mat.fragmentShader;
  if (!fs.includes(INK_HEAD_AT) || !fs.includes(INK_LINE_AT)) {
    return false;
  }
  const opts = {
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    colorSpace: THREE.NoColorSpace,
  };
  const half = new THREE.WebGLRenderTarget(2, 2, opts);
  const quarter = new THREE.WebGLRenderTarget(2, 2, opts);
  const ink = mat.uniforms;
  const ao = aoUniforms();
  ao.uAoStrength.value = SHADE_STRENGTH;
  /* Near things only. The estimate's disc is never under three texels of
   * this half size target, so on a far tree it was wider than the tree and
   * the blur made it a dark rim round it, which read as a thick outline
   * that sharpened as the pilot flew closer (owner, 2026-11-10). A contact
   * tone is a near thing in any case. */
  ao.uAoFar.value = SHADE_FAR;
  const estimate = quad(ESTIMATE, {
    tDepth: { value: pipeline.rtScene.depthTexture },
    uNear: ink.uNear,
    uFar: ink.uFar,
    uSkyDepth: ink.uSkyDepth,
    ...ao,
  });
  const down = quad(DOWN, { tDiffuse: { value: half.texture }, uTexel: { value: new THREE.Vector2() } });
  const up = quad(UP, { tDiffuse: { value: quarter.texture }, uTexel: { value: new THREE.Vector2() } });

  mat.fragmentShader = fs
    .replace(INK_HEAD_AT, `${INK_HEAD_AT}\n    uniform sampler2D tShade;`)
    .replace(INK_LINE_AT, `      /* High's contact shade: src/render/shade.js. */
      col *= mix( vec3( 1.0 ), mix( ${AO_TINT_GLSL}, vec3( 1.0 ), texture2D( tShade, vUv ).r ), ${SHADE_AMOUNT.toFixed(2)} );
${INK_LINE_AT}`);
  mat.uniforms.tShade = { value: half.texture };
  mat.needsUpdate = true;

  const hs = new THREE.Vector2(2, 2);
  const qs = new THREE.Vector2(2, 2);
  const size = () => {
    hs.set(Math.max(2, Math.floor(pipeline.size.x / 2)), Math.max(2, Math.floor(pipeline.size.y / 2)));
    qs.set(Math.max(2, Math.floor(pipeline.size.x / 4)), Math.max(2, Math.floor(pipeline.size.y / 4)));
    half.setSize(hs.x, hs.y);
    quarter.setSize(qs.x, qs.y);
    down.mat.uniforms.uTexel.value.set(0.5 / hs.x, 0.5 / hs.y);
    up.mat.uniforms.uTexel.value.set(0.5 / hs.x, 0.5 / hs.y);
  };
  const setSize = pipeline.setSize;
  pipeline.setSize = function shadeSize(...args) {
    setSize.apply(this, args);
    size();
  };

  /* From inside the ink quad's own draw, as glow.js runs from the grade's. */
  const draw = pipeline.ink.quad.render.bind(pipeline.ink.quad);
  pipeline.ink.quad.render = (r) => {
    const target = r.getRenderTarget();
    updateAoCamera(estimate.mat.uniforms, pipeline.camera, hs.x, hs.y);
    r.setRenderTarget(half);
    estimate.quad.render(r);
    r.setRenderTarget(quarter);
    down.quad.render(r);
    r.setRenderTarget(half);
    up.quad.render(r);
    r.setRenderTarget(target);
    draw(r);
  };

  const dispose = pipeline.dispose;
  pipeline.dispose = function shadeDispose(...args) {
    half.dispose();
    quarter.dispose();
    [estimate, down, up].forEach((p) => {
      p.quad.dispose();
      p.mat.dispose();
    });
    return dispose.apply(this, args);
  };
  pipeline.shade = { targets: [half, quarter], estimate: estimate.mat.uniforms, passes: 3 };
  if (pipeline.size.x > 1) {
    size();
  }
  return true;
}
