/*
 * glow.js: the High preset's light. The sky bleeds a little over whatever
 * stands against it, and at dusk the lamps and lit windows glow.
 *
 * WHY, AND WHY ONLY ON HIGH. The owner, 2026-11-10: "improve the graphics
 * without impacting performance for medium or low, can increase system
 * demand at high". Everything below is extra passes and one extra fetch in
 * the grade, so it is built only when the preset says `glow` (quality.js,
 * High alone). On Low and Medium this module's function is never called:
 * no target is made, no program is linked, and the grade's shader is the
 * string it was, byte for byte.
 *
 * WHAT IT DRAWS.
 *
 *   1. LIGHT WRAP. A background painter lets the sky's light spill over the
 *      edge of a roof, a crane or a canopy, so the thing sits in the air
 *      and is not a cut out pasted on the sky. The sky is told from the
 *      land by depth, the ink pass's own test, so no material is marked and
 *      nothing that is merely pale (a cream pavement, a white wall) is
 *      taken for light. The glow target carries the blurred sky in rgb and
 *      how much of the blur was sky in alpha, and the grade mixes a pixel
 *      toward the first by the second. So open sky is left as it was (the
 *      mix of a colour with itself) and only what stands near the sky
 *      moves, by at most `sky`, and by less the darker it is drawn: the
 *      first version took the town's wires and every ink line on a skyline
 *      from black to grey, which is the opposite of a comic's pen.
 *
 *   2. LAMPS, where the time of day has them (`lamp` above zero, dusk).
 *      There the look has already dimmed every unlit colour that is not a
 *      light (flats in src/maps/built/looks.js), so what is still bright is
 *      a lamp, a lit pane, a billboard or a tail light, and a threshold on
 *      the brightest channel finds them. By day the same threshold would
 *      find every sunlit wall, so by day there is no lamp term at all.
 *
 * WHAT IT COSTS, on High only. Five small passes: the bright pass at a
 * quarter of the scene's width and height, two steps down to a sixteenth
 * and two back up, 26 fetches in all over 1/16, 1/64, 1/256, 1/64 and 1/16
 * of the frame's pixels, which is about 2.1 fetches per frame pixel; and
 * one more fetch in the grade. The pipeline's ink pass makes 6 and its
 * fxaa pass 9, so it is under a fifth on top of the post chain, and nothing
 * on top of the scene. Three half float targets, 1/16 + 1/64 + 1/256 of the
 * scene target: 1.7 MB at the High budget of 2.6 Mpx. No frame is held: the
 * glow a frame shows is made from that frame's own scene, so it adds GPU
 * time and no queue.
 *
 * The passes run from inside the grade quad's own draw, which is the one
 * point every caller of the pipeline goes through (the vendored render(),
 * the comic layer's, the harness's cost probe), so nothing else has to know
 * this exists. The vendored post.js stays byte identical.
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
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/*
 * What a time of day asks for. `sky` is how far a pixel fully inside the
 * blurred sky is taken toward it; `lamp` the gain on what passes the lamp
 * threshold, zero for none; `knee` where on the brightest channel that
 * threshold starts (it is complete at one).
 *
 * Picked by eye on Kumoi Towers, the town, Kamome Wharf and Hanabi Sound:
 * enough that a skyline softens into the air, not so much that the ink
 * line along it goes grey.
 */
export const GLOW_DAY = Object.freeze({ sky: 0.45, lamp: 0, knee: 0.8 });
export const GLOW_DUSK = Object.freeze({ sky: 0.65, lamp: 0.85, knee: 0.72 });

export const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4( position.xy, 0.0, 1.0 );
  }
`;

/* Scene colour and depth, a quarter size: sky as itself with alpha one,
 * a lamp as itself times the gain with alpha zero, everything else black. */
const BRIGHT = /* glsl */ `
  #include <packing>
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uNear, uFar, uSkyDepth, uLamp, uKnee;
  varying vec2 vUv;
  vec4 tap( vec2 uv ) {
    vec3 c = min( texture2D( tDiffuse, uv ).rgb, vec3( 1.0 ) );
    float d = -perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, uNear, uFar );
    float sky = step( uSkyDepth, d );
    float m = max( c.r, max( c.g, c.b ) );
    float lamp = ( 1.0 - sky ) * uLamp * smoothstep( uKnee, 1.0, m );
    return vec4( c * ( sky + lamp ), sky );
  }
  void main() {
    gl_FragColor = 0.25 * (
      tap( vUv + uTexel * vec2( -1.0, -1.0 ) ) + tap( vUv + uTexel * vec2( 1.0, -1.0 ) ) +
      tap( vUv + uTexel * vec2( -1.0, 1.0 ) ) + tap( vUv + uTexel * vec2( 1.0, 1.0 ) ) );
  }
`;

/* The dual filter's two halves (Bjorge, ARM, 2015): five fetches down, eight
 * up, each a bilinear fetch between texels, so a wide soft blur comes out of
 * four small passes. uTexel is half a texel of the SOURCE. */
export const DOWN = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec4 s = texture2D( tDiffuse, vUv ) * 4.0;
    s += texture2D( tDiffuse, vUv - uTexel );
    s += texture2D( tDiffuse, vUv + uTexel );
    s += texture2D( tDiffuse, vUv + vec2( uTexel.x, -uTexel.y ) );
    s += texture2D( tDiffuse, vUv - vec2( uTexel.x, -uTexel.y ) );
    gl_FragColor = s * 0.125;
  }
`;
export const UP = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec4 s = texture2D( tDiffuse, vUv + vec2( -uTexel.x * 2.0, 0.0 ) );
    s += texture2D( tDiffuse, vUv + vec2( -uTexel.x, uTexel.y ) ) * 2.0;
    s += texture2D( tDiffuse, vUv + vec2( 0.0, uTexel.y * 2.0 ) );
    s += texture2D( tDiffuse, vUv + vec2( uTexel.x, uTexel.y ) ) * 2.0;
    s += texture2D( tDiffuse, vUv + vec2( uTexel.x * 2.0, 0.0 ) );
    s += texture2D( tDiffuse, vUv + vec2( uTexel.x, -uTexel.y ) ) * 2.0;
    s += texture2D( tDiffuse, vUv + vec2( 0.0, -uTexel.y * 2.0 ) );
    s += texture2D( tDiffuse, vUv + vec2( -uTexel.x, -uTexel.y ) ) * 2.0;
    gl_FragColor = s / 12.0;
  }
`;

/* The grade's one fetch, whatever coordinate the fisheye fold has given it. */
const GRADE_FETCH = /vec3 c = texture2D\( tDiffuse, ([^;]+?) \)\.rgb;/;
const GRADE_HEAD_AT = 'varying vec2 vUv;';

export function quad(fragmentShader, uniforms) {
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader, depthTest: false, depthWrite: false,
  });
  return { mat, quad: new FullScreenQuad(mat) };
}

/*
 * Fold the glow into a pipeline (the vendored Pipeline or a subclass), after
 * the manga, fisheye and comic folds have had the grade. Returns false and
 * changes nothing where the grade is not the shader this was written
 * against, and `glow` in the pipeline says which.
 */
export function glowPipeline(pipeline, want = GLOW_DAY) {
  const g = pipeline.grade && pipeline.grade.mat;
  if (!g || !pipeline.rtScene || !pipeline.rtScene.depthTexture) {
    return false;
  }
  const fs = g.fragmentShader;
  if (!GRADE_FETCH.test(fs) || !fs.includes(GRADE_HEAD_AT)) {
    return false;
  }
  const opts = {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    colorSpace: THREE.NoColorSpace,
  };
  const rts = [0, 1, 2].map(() => new THREE.WebGLRenderTarget(2, 2, opts));
  const ink = pipeline.ink.mat.uniforms;
  const bright = quad(BRIGHT, {
    tDiffuse: { value: pipeline.rtScene.texture },
    tDepth: { value: pipeline.rtScene.depthTexture },
    uTexel: { value: new THREE.Vector2() },
    /* The ink pass's own, by reference: one answer to what is sky. */
    uNear: ink.uNear,
    uFar: ink.uFar,
    uSkyDepth: ink.uSkyDepth,
    uLamp: { value: want.lamp },
    uKnee: { value: want.knee },
  });
  const down = quad(DOWN, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const up = quad(UP, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } });

  g.fragmentShader = fs
    .replace(GRADE_HEAD_AT, `${GRADE_HEAD_AT}\n    uniform sampler2D tGlow;\n    uniform float uGlowSky;`)
    .replace(GRADE_FETCH, (line, uv) => `${line}
      vec4 glow = texture2D( tGlow, ${uv} );
      /* Less on what is drawn dark: a wire or an ink line against the sky
       * is a pen stroke and stays one. */
      c += ( glow.rgb - c * glow.a ) * uGlowSky * smoothstep( 0.03, 0.3, max( c.r, max( c.g, c.b ) ) );`);
  g.uniforms.tGlow = { value: rts[0].texture };
  g.uniforms.uGlowSky = { value: want.sky };
  g.needsUpdate = true;

  const sizes = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
  const size = () => {
    const w = pipeline.size.x;
    const h = pipeline.size.y;
    rts.forEach((rt, i) => {
      const k = 4 << i;
      sizes[i].set(Math.max(2, Math.floor(w / k)), Math.max(2, Math.floor(h / k)));
      rt.setSize(sizes[i].x, sizes[i].y);
    });
    bright.mat.uniforms.uTexel.value.set(1 / w, 1 / h);
  };
  const setSize = pipeline.setSize;
  pipeline.setSize = function glowSize(...args) {
    setSize.apply(this, args);
    size();
  };

  const pass = (r, p, src, dst, halfTexelOf) => {
    if (src) {
      p.mat.uniforms.tDiffuse.value = src.texture;
      p.mat.uniforms.uTexel.value.set(0.5 / halfTexelOf.x, 0.5 / halfTexelOf.y);
    }
    r.setRenderTarget(dst);
    p.quad.render(r);
  };
  const draw = pipeline.grade.quad.render.bind(pipeline.grade.quad);
  pipeline.grade.quad.render = (r) => {
    const target = r.getRenderTarget();
    pass(r, bright, null, rts[0]);
    pass(r, down, rts[0], rts[1], sizes[0]);
    pass(r, down, rts[1], rts[2], sizes[1]);
    pass(r, up, rts[2], rts[1], sizes[1]);
    pass(r, up, rts[1], rts[0], sizes[0]);
    r.setRenderTarget(target);
    draw(r);
  };

  const dispose = pipeline.dispose;
  pipeline.dispose = function glowDispose(...args) {
    rts.forEach((rt) => rt.dispose());
    [bright, down, up].forEach((p) => {
      p.quad.dispose();
      p.mat.dispose();
    });
    return dispose.apply(this, args);
  };
  pipeline.glow = { targets: rts, bright: bright.mat.uniforms, grade: g.uniforms, passes: 5 };
  if (pipeline.size.x > 1) {
    size();
  }
  return true;
}
