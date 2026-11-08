/*
 * hatch.js: pen hatching drawn into the shade of a map's cel materials, on
 * the High preset only. The owner, 2026-11-08, of the school the Infected
 * mini game is played in: "for high settings hand drawn things". The cel
 * bands already say which side of a desk is in shade; a manga page says it
 * with the pen, a run of diagonal strokes on the shaded side and a second
 * run across them where it is darker still. This draws those strokes.
 *
 * HOW. A map hands this its baked part meshes (src/props/kit.js finish:
 * one mesh per colour) and each cel material is swapped for a copy that
 * draws the strokes, so nothing is added to the scene and no mesh is
 * split. The copy is the same MeshToonMaterial, the same colour, ramp and
 * shadow tint (the town's applyShadowTint patch, called first, as the
 * original's own onBeforeCompile), with three things injected:
 *
 *   - the world position, as a varying, so a stroke stays painted on the
 *     surface while the camera moves (a screen space hatch would swim
 *     across the walls like a pattern on a shower door);
 *   - in the fragment, after the light is summed and before it is tone
 *     mapped and fogged, how lit the surface is against its own colour,
 *     which picks no strokes, one run or two;
 *   - the strokes themselves, in the plane the surface faces most (a wall's
 *     strokes are drawn on the wall, a ceiling's on the ceiling), each
 *     stroke with its own weight and a slight waver so it reads as drawn
 *     and not ruled, anti aliased with fwidth, and folded to the run's flat
 *     average where strokes get finer than a pixel and a half, which is
 *     what keeps a far wall from shimmering.
 *
 * Fog comes after, so far strokes fade with everything else. The ink line
 * pass (src/render/post.js) draws over the scene with its own material and
 * never sees this.
 *
 * ONE KEY. The shadow tint is a uniform, so every hatched copy's injected
 * source is byte identical and they share one program key; three still
 * splits it where the materials' own settings differ (the school's three),
 * as it did the originals. Warmed with the rest (src/render/warm.js).
 *
 * LATENCY. Nothing on Low or Medium: the copies are made only on High, so
 * below it the school builds exactly as before (measured: the fragment
 * shaders it compiles on Medium and on Low are byte for byte main's, 23
 * and 21). On High, no draw call, no triangle, no texture and no pass, and
 * two programs more than main, 24 against 22: the originals are swapped
 * before anything is linked (the built map's `extra.dress`), where a swap
 * after the map had linked them made it 25. The cost is arithmetic on the school's pixels. Measured
 * 2026-11-08, the school at 1280 by 720:
 *
 *   - Mesa's compiler for an AMD Renoir laptop GPU (the radv recipe in the
 *     project notes): the cel program goes from 136 to 171 instructions to
 *     269 to 299, both runs counted, registers 24 to 28, waves a SIMD
 *     keeps 10 to 9. Static counts, not a frame time: a lit face skips both
 *     runs, a shaded one runs one, deep shade two.
 *   - Headless (SwiftShader, every pixel on the CPU), four views, twelve
 *     drawn frames each, two runs of each build interleaved: 576 ms a
 *     frame on main, 600 here, 4 percent, inside the 12 percent two runs
 *     of one build differ by.
 *
 * Integrated GPUs boot on Medium (bootGuessGraphics, render/quality.js), so
 * High, and this, is a pick a pilot makes on a GPU that has the headroom.
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

/* The ink the strokes are drawn in: the comic pass's ink, a little warm, as
 * a pen on paper and not a black. Linear, because it is mixed before the
 * tone map. */
const INK = new THREE.Color(0x2a2430).convertSRGBToLinear();

const HATCH_VERT_DECL = 'varying vec3 vHatchW;\nvarying vec3 vHatchN;';
const HATCH_VERT_BODY = 'vHatchW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvHatchN = mat3(modelMatrix) * objectNormal;';

/*
 * The strokes. `lit` is the summed light against the surface's own colour:
 * 1 in full light, the shadow band's fraction in shade. Above uHatchLit
 * nothing is drawn; under it one run of strokes, and under uHatchDeep a
 * second run across the first.
 *
 * Written for the arithmetic it costs, because every hatched pixel runs it:
 * linear ramps where a smoothstep's curve would not show at a pixel's
 * width, a triangle wave for the waver where a sine's shape would not show
 * either, the world normal from the vertex shader rather than worked back
 * from the view normal per pixel, and the second run only in deep shade.
 */
const HATCH_FRAG_DECL = `
varying vec3 vHatchW;
varying vec3 vHatchN;
uniform vec3 uHatchInk;
uniform float uHatchPitch;
uniform float uHatchStrength;
uniform float uHatchLit;
uniform float uHatchDeep;
/*
 * One run of strokes across the plane: d counts strokes, across runs along
 * them, fw is d's screen derivative. It is taken by the caller, outside any
 * branch, because a derivative inside one is undefined where the 2 by 2
 * pixel quad it is taken over splits.
 */
float hatchRun(float d, float across, float w, float fw) {
  /* each stroke its own weight, a slight waver and a break along its
   * length, phased by which stroke it is, so no two read alike and a run
   * reads as strokes laid one by one and not as a ruled screen */
  float k = floor(d);
  float r = fract(k * 0.618);
  float f = abs(fract(d + 0.1 * abs(fract(across * 0.04 + r) - 0.5)) - 0.5);
  float s = fract(across * 0.035 + r * 7.31);
  /* the pen lands thin, presses, and lifts off thin, then the gap */
  float t = min(s, 0.9 - s);
  float wk = w * (0.7 + 0.6 * r) * clamp(t * 6.0, 0.0, 1.0);
  float line = clamp((wk * 0.5 - f) / fw + 0.5, 0.0, 1.0) * clamp(t * 40.0, 0.0, 1.0);
  /* finer than a pixel and a half, the run's flat average, not a shimmer */
  return mix(line, w * 0.8, clamp(fw * 2.5 - 0.875, 0.0, 1.0));
}`;

const HATCH_FRAG_BODY = `
{
  vec3 hn = abs(vHatchN);
  vec2 hp = hn.y > max(hn.x, hn.z) ? vHatchW.xz : (hn.x > hn.z ? vHatchW.zy : vHatchW.xy);
  hp /= uHatchPitch;
  float hA = hp.x + hp.y;
  float hB = hp.x - hp.y;
  float fA = fwidth(hA);
  float fB = fwidth(hB);
  float hBase = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.02);
  float hLit = dot(outgoingLight, vec3(0.299, 0.587, 0.114)) / hBase;
  float one = clamp((uHatchLit - hLit) * 12.5 + 0.5, 0.0, 1.0);
  float two = clamp((uHatchDeep - hLit) * 12.5 + 0.5, 0.0, 1.0);
  float ink = 0.0;
  if (one > 0.0) {
    ink = hatchRun(hA, hB, 0.34, fA) * one;
    if (two > 0.0) {
      ink = max(ink, hatchRun(hB + 0.5, hA, 0.28, fB) * two);
    }
  }
  outgoingLight = mix(outgoingLight, uHatchInk, ink * uHatchStrength);
}
#include <opaque_fragment>`;

/*
 * The defaults, for a map at the whoop scale of the school (metres of
 * world, its plan scaled by 3.5): a stroke every 12 cm of wall, which is
 * about eight pixels apart across a classroom at 1280 by 720.
 */
export const HATCH_DEFAULTS = Object.freeze({
  pitch: 0.12,
  strength: 0.42,
  lit: 0.8,
  deep: 0.42,
});

/*
 * A hatched copy of one cel material. Its program key is the injected
 * source and not a name for it, celmat.js's rule: the key cannot disagree
 * with the shader.
 */
function hatchedCopy(base, look) {
  const mat = base.clone();
  const tint = base.onBeforeCompile;
  const uniforms = {
    uHatchInk: { value: INK.clone() },
    uHatchPitch: { value: look.pitch },
    uHatchStrength: { value: look.strength },
    uHatchLit: { value: look.lit },
    uHatchDeep: { value: look.deep },
  };
  mat.userData = { ...base.userData, hatch: uniforms };
  /* fwidth on WebGL 1 is an extension; on WebGL 2 this does nothing. */
  mat.extensions = { ...(mat.extensions || {}), derivatives: true };
  mat.onBeforeCompile = (shader, renderer) => {
    /* The original's own patch first (the shadow tint), as it was. */
    if (typeof tint === 'function') {
      tint.call(base, shader, renderer);
    }
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HATCH_VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${HATCH_VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HATCH_FRAG_DECL}`)
      .replace('#include <opaque_fragment>', HATCH_FRAG_BODY);
  };
  const key = `hatch|${HATCH_VERT_DECL}|${HATCH_VERT_BODY}|${HATCH_FRAG_DECL}|${HATCH_FRAG_BODY}`;
  mat.customProgramCacheKey = () => key;
  return mat;
}

/*
 * Swap every cel material under `root` for its hatched copy, one copy per
 * material however many meshes share it. Flat colours (the lamps, the
 * windows' sky) are lights and are left as they are. Returns the number of
 * materials hatched, for the map's checks.
 */
export function hatchMeshes(root, look = {}) {
  const l = { ...HATCH_DEFAULTS, ...look };
  const copies = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material) || !o.material.isMeshToonMaterial) {
      return;
    }
    let m = copies.get(o.material);
    if (!m) {
      m = hatchedCopy(o.material, l);
      copies.set(o.material, m);
    }
    o.material = m;
  });
  return copies.size;
}
