/*
 * hatch.js: gradient tone at the foot and the head of a map's walls, on
 * the High preset only. The owner, 2026-11-08, of the school the Infected
 * mini game is played in: "for high settings hand drawn things"; on
 * 2026-11-09, of the pen hatching this file drew first: "the hatching /
 * drawing looks bad not good, the repeating patern is too much ...
 * compare to some famous manga drawings and art"; and of the screentone
 * that replaced it the same morning: "the dots are better as a graphic,
 * but still look terrible in a repeating patern".
 *
 * WHAT WAS WRONG BOTH TIMES. Each laid ONE even texture over every face in
 * shade: the pen as diagonal strokes, the screen as dots on a fixed grid.
 * The school's shade is per face (a wall turned from the light is shaded
 * from end to end), so a whole wall, a whole pillar and every desk side
 * came out the same pattern at the same density, which is what a filter
 * does and not what an artist does. The screen was also printed on the
 * frame, so in flight the dots stood still while the school slid under
 * them. A manga page is mostly paper and line. Tone is laid where the
 * artist wants weight and is almost never flat across a surface: it is a
 * gradation tone, dense in a corner and thinning to nothing across the
 * wall, so what reads is the fade and not the grid. And the colour already
 * says which face is in shade, so tone that only repeats that says
 * nothing.
 *
 * WHAT THIS DRAWS. A gradation of dots on the walls only, dense where a
 * wall meets its floor and fading up it, lighter where it meets its
 * ceiling and fading down, and a little heavier on a wall turned from the
 * light. Nothing on a floor, a ceiling, the furniture or the middle of a
 * wall. The dots are on the wall itself (a 45 degree grid in the wall's
 * plane), so they stay put as the camera moves; where they would be
 * smaller than a few pixels (a far wall, a grazing one) they melt into the
 * even grey they average to, so nothing shimmers.
 *
 * HOW. A map hands this its baked part meshes (src/props/kit.js finish:
 * one mesh per colour) and the colours to tone, and each of those cel
 * materials is swapped for a copy, so nothing is added to the scene and no
 * mesh is split. The copy is the same MeshToonMaterial, the same colour,
 * ramp and shadow tint (the town's applyShadowTint patch, called first, as
 * the original's own onBeforeCompile), with the world position passed to
 * the fragment and one block injected after the light is summed and before
 * it is tone mapped and fogged. Fog comes after, so far tone fades with
 * everything else. The ink line pass draws over the scene with its own
 * material and never sees this.
 *
 * The storeys (floor and ceiling heights, world metres) come from the map,
 * which knows where its floors are; a wall above the slab between them
 * belongs to the upper storey.
 *
 * ONE KEY. Every knob is a uniform, so every toned copy's injected source
 * is byte identical and they share one program key; three still splits it
 * where the materials' own settings differ, as it did the originals.
 * Warmed with the rest (src/render/warm.js).
 *
 * LATENCY. Nothing on Low or Medium: the copies are made only on High, so
 * below it the school builds exactly as before. On High, no draw call, no
 * triangle, no texture and no pass, and fewer toned programs than the
 * screen had (the walls' colours only). One varying, a screen derivative
 * and a handful of operations per wall pixel. Measured in the PROGRESS.md
 * entry of 2026-11-09.
 *
 * WebGL 2 only (the derivative): the map does not ask for it on WebGL 1.
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

/* The ink the dots are printed in: the comic pass's ink, a little warm, as
 * a pen on paper and not a black. Linear, because it is mixed before the
 * tone map. */
const INK = new THREE.Color(0x2a2430).convertSRGBToLinear();

/* The world position, for the fragment. Worked out there instead, the
 * wall's plane and height at the vertices compiled to nearly twice the
 * instructions on the Renoir compiler (PROGRESS.md, 2026-11-09). */
const TONE_VERT_DECL = `
varying vec3 vToneW;`;
const TONE_VERT_BODY = `#include <project_vertex>
vToneW = (modelMatrix * vec4(transformed, 1.0)).xyz;`;

const TONE_FRAG_DECL = `
uniform vec3 uToneInk;
uniform float uToneStrength;
uniform float uToneLit;
uniform float uToneDeep;
uniform vec4 uToneStorey;
uniform vec2 uToneReach;
uniform float uToneCell;
varying vec3 vToneW;`;

/*
 * The tone. tFade is the gradation: 1 where a wall meets its floor, 0 a
 * reach up it, and the same from its ceiling down at a little over half
 * the weight; squared, so it thins the way a printed gradation does and
 * not in a straight ramp. A wall turned from the light carries all of it,
 * a lit one 60 percent. A dot's area is half the coverage, so the densest
 * corner is half ink.
 *
 * The grid is on the wall, in metres, so a near wall's dots are bigger
 * than a far wall's, as any paint on it is. Where a cell would be under
 * about five pixels (tPx is a pixel in cells) the dots melt into the even
 * grey they average to, so a far or grazing wall never shimmers. A grid
 * that kept the dots one size on screen, blending octaves as the comic
 * layer's strokes do, was tried and dropped: the two octaves crossing
 * made four leaved blobs, and every far wall got dots too, which is the
 * even pattern this replaced. The grid and its derivative are worked out
 * before the branch, because a derivative inside one is undefined.
 */
const TONE_FRAG_BODY = `
{
  vec3 tN = (vec4(normal, 0.0) * viewMatrix).xyz;
  vec2 tP = (abs(tN.x) > abs(tN.z) ? vToneW.zy : vToneW.xy) / uToneCell;
  vec2 tQ = vec2(tP.x + tP.y, tP.y - tP.x) * 0.70710678;
  float tPx = length(fwidth(tQ));
  float tWall = smoothstep(0.5, 0.8, 1.0 - abs(tN.y));
  float tY = vToneW.y;
  bool tUp = tY > 0.5 * (uToneStorey.y + uToneStorey.z);
  float tFoot = 1.0 - smoothstep(0.0, uToneReach.x, tY - (tUp ? uToneStorey.z : uToneStorey.x));
  float tHead = 1.0 - smoothstep(0.0, uToneReach.y, (tUp ? uToneStorey.w : uToneStorey.y) - tY);
  float tFade = max(tFoot * tFoot, 0.55 * tHead * tHead) * tWall;
  if (tFade > 0.01) {
    float tBase = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.02);
    float tLit = dot(outgoingLight, vec3(0.299, 0.587, 0.114)) / tBase;
    float tCov = tFade * mix(0.6, 1.0, clamp((uToneLit - tLit) / (uToneLit - uToneDeep), 0.0, 1.0));
    float tR = sqrt(tCov * (0.5 / 3.14159265));
    float tDot = clamp((tR - length(fract(tQ) - 0.5)) / max(tPx, 1e-4) + 0.5, 0.0, 1.0);
    float tInk = mix(tDot, 0.5 * tCov, smoothstep(0.15, 0.35, tPx));
    outgoingLight = mix(outgoingLight, uToneInk, tInk * uToneStrength);
  }
}
#include <opaque_fragment>`;

/*
 * The defaults. strength: how dark the ink is mixed in. lit and deep: the
 * light against the colour's own at which a wall counts as lit and as in
 * full shade. reach: how far up from a floor and down from a ceiling the
 * gradation runs, world metres. cell: the dot pitch on the wall, world
 * metres. The school's walls are ten world metres floor to ceiling (its
 * plan times 3.5), so the foot's fade runs a quarter of the way up, and a
 * cell is about 2.5 cm of the real school.
 */
export const HATCH_DEFAULTS = Object.freeze({
  strength: 0.75,
  lit: 0.8,
  deep: 0.42,
  reach: Object.freeze([2.4, 1.8]),
  cell: 0.09,
});

/*
 * A toned copy of one cel material. Its program key is the injected source
 * and not a name for it, celmat.js's rule: the key cannot disagree with
 * the shader.
 */
function tonedCopy(base, look) {
  const mat = base.clone();
  const tint = base.onBeforeCompile;
  const uniforms = {
    uToneInk: { value: INK.clone() },
    uToneStrength: { value: look.strength },
    uToneLit: { value: look.lit },
    uToneDeep: { value: look.deep },
    uToneStorey: { value: new THREE.Vector4(...look.storeys) },
    uToneReach: { value: new THREE.Vector2(...look.reach) },
    uToneCell: { value: look.cell },
  };
  mat.userData = { ...base.userData, hatch: uniforms };
  mat.onBeforeCompile = (shader, renderer) => {
    /* The original's own patch first (the shadow tint), as it was. */
    if (typeof tint === 'function') {
      tint.call(base, shader, renderer);
    }
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${TONE_VERT_DECL}`)
      .replace('#include <project_vertex>', TONE_VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TONE_FRAG_DECL}`)
      .replace('#include <opaque_fragment>', TONE_FRAG_BODY);
  };
  const key = `tone|${TONE_VERT_BODY}|${TONE_FRAG_DECL}|${TONE_FRAG_BODY}`;
  mat.customProgramCacheKey = () => key;
  return mat;
}

/*
 * Swap the cel materials in `only` (the walls' colours) under `root` for
 * their toned copies, one copy per material however many meshes share it.
 * `look.storeys` is [floor, ceiling, floor, ceiling] in world metres, the
 * lower storey first. Returns the number of materials toned, for the map's
 * checks.
 */
export function hatchMeshes(root, only, look) {
  const l = { ...HATCH_DEFAULTS, ...look };
  const copies = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material) || !o.material.isMeshToonMaterial || !only.has(o.material)) {
      return;
    }
    let m = copies.get(o.material);
    if (!m) {
      m = tonedCopy(o.material, l);
      copies.set(o.material, m);
    }
    o.material = m;
  });
  return copies.size;
}
