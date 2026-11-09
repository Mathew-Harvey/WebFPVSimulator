/*
 * hatch.js: screentone in the shade of a map's cel materials, on the High
 * preset only. The owner, 2026-11-08, of the school the Infected mini game
 * is played in: "for high settings hand drawn things"; and 2026-11-09, of
 * the pen hatching this file drew first: "the hatching / drawing looks bad
 * not good, the repeating patern is too much ... compare to some famous
 * manga drawings and art".
 *
 * WHAT WAS WRONG WITH THE PEN. It ran one run of diagonal strokes, at one
 * pitch, over every face in shade, drawn in the plane the face lies in.
 * So a ceiling, the biggest face in a room, filled the top third of the
 * frame with lines converging on the vanishing point, which on a manga
 * page is a focus or speed burst (shuuchuusen) and means impact, not
 * shade; a locker bank or a desk side came out evenly ruled, which reads
 * as wood grain or a printed fabric; and the same density everywhere is
 * an engraving's texture. A manga page shades a room with tone: a printed
 * dot screen, flat, at one angle on the page whatever the surface does,
 * coarser where it is darker, laid on what is in shadow and left off the
 * big quiet planes, with pen hatching kept for a few deep corners. This
 * draws the tone and no hatching at all.
 *
 * HOW. A map hands this its baked part meshes (src/props/kit.js finish:
 * one mesh per colour) and each cel material is swapped for a copy that
 * lays the tone, so nothing is added to the scene and no mesh is split.
 * The copy is the same MeshToonMaterial, the same colour, ramp and shadow
 * tint (the town's applyShadowTint patch, called first, as the original's
 * own onBeforeCompile), with one thing injected in the fragment, after the
 * light is summed and before it is tone mapped and fogged:
 *
 *   - how lit the surface is against its own colour, which says whether
 *     it is toned and how heavily: nothing in full light, small dots in
 *     the cel shade, bigger ones toward the deepest shade;
 *   - the dots, on a grid at 45 degrees in the frame's own pixels, as a
 *     printed screen is on the page, so they never converge with the
 *     perspective, never swim into moire on a far wall and need no
 *     derivative to stay sharp: their edge is a pixel wide by construction;
 *   - nothing on a face looking down (a ceiling, a desk's underside seen
 *     from below), where a page leaves the paper.
 *
 * The cell follows the frame's height (TONE_ROWS cells from top to bottom
 * whatever the window or the render scale), read off the target being
 * drawn by each toned mesh just before it draws: one shared number.
 *
 * Fog comes after, so far tone fades with everything else. The ink line
 * pass (src/render/post.js) draws over the scene with its own material
 * and never sees this.
 *
 * ONE KEY. The ink, the cell and the levels are uniforms, so every toned
 * copy's injected source is byte identical and they share one program
 * key; three still splits it where the materials' own settings differ
 * (the school's three), as it did the originals. Warmed with the rest
 * (src/render/warm.js).
 *
 * LATENCY. Nothing on Low or Medium: the copies are made only on High, so
 * below it the school builds exactly as before. On High, no draw call, no
 * triangle, no texture and no pass, and the same programs the pen had (the
 * originals are swapped before anything is linked, the built map's
 * `extra.dress`). The arithmetic is less than the pen's: no varying, no
 * derivative, one branch, a handful of operations on a shaded pixel and
 * none on a lit one. Measured in the PROGRESS.md entry of 2026-11-09.
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

/* The ink the dots are printed in: the comic pass's ink, a little warm, as
 * a pen on paper and not a black. Linear, because it is mixed before the
 * tone map. */
const INK = new THREE.Color(0x2a2430).convertSRGBToLinear();

/* How many tone cells from the top of the frame to the bottom: a cell of
 * five pixels at 720, which is a screen a pilot can see as dots at arm's
 * length and not a grey. */
const TONE_ROWS = 190;

/*
 * The tone. `lit` is the summed light against the surface's own colour: 1
 * in full light, the shadow band's fraction in shade. Above uHatchLit no
 * dot; from there to uHatchDeep the dots grow from a pinprick to nearly
 * touching, which is how a printed tone goes from 10 to 50 percent.
 */
const HATCH_FRAG_DECL = `
uniform vec3 uHatchInk;
uniform float uHatchCell;
uniform float uHatchStrength;
uniform float uHatchLit;
uniform float uHatchDeep;`;

const HATCH_FRAG_BODY = `
{
  float hBase = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.02);
  float hLit = dot(outgoingLight, vec3(0.299, 0.587, 0.114)) / hBase;
  float hCov = clamp((uHatchLit - hLit) / (uHatchLit - uHatchDeep), 0.0, 1.0);
  /* the world's up in the view: a face looking down is left as paper */
  float hDown = dot(viewMatrix[1].xyz, normal);
  if (hCov > 0.0 && hDown > -0.6) {
    vec2 hq = vec2(gl_FragCoord.x + gl_FragCoord.y, gl_FragCoord.y - gl_FragCoord.x) * (0.70710678 / uHatchCell);
    float hd = length(fract(hq) - 0.5) * uHatchCell;
    float hr = (0.14 + 0.22 * hCov) * uHatchCell;
    float hDot = clamp(hr - hd + 0.5, 0.0, 1.0);
    outgoingLight = mix(outgoingLight, uHatchInk, hDot * uHatchStrength);
  }
}
#include <opaque_fragment>`;

/* The defaults: toned under 80 percent of full light, heaviest at 42. */
export const HATCH_DEFAULTS = Object.freeze({
  strength: 0.5,
  lit: 0.8,
  deep: 0.42,
});

/* The cell, one number every toned copy reads: see toneCell. */
const CELL = { value: 720 / TONE_ROWS };
const SIZE = new THREE.Vector2();

/* The cell for whatever the renderer is drawing into now, in its pixels. */
function toneCell(renderer) {
  const rt = renderer.getRenderTarget();
  const h = rt ? rt.height : renderer.getDrawingBufferSize(SIZE).y;
  CELL.value = Math.max(3, h / TONE_ROWS);
}

/*
 * A toned copy of one cel material. Its program key is the injected source
 * and not a name for it, celmat.js's rule: the key cannot disagree with
 * the shader.
 */
function hatchedCopy(base, look) {
  const mat = base.clone();
  const tint = base.onBeforeCompile;
  const uniforms = {
    uHatchInk: { value: INK.clone() },
    uHatchCell: CELL,
    uHatchStrength: { value: look.strength },
    uHatchLit: { value: look.lit },
    uHatchDeep: { value: look.deep },
  };
  mat.userData = { ...base.userData, hatch: uniforms };
  mat.onBeforeCompile = (shader, renderer) => {
    /* The original's own patch first (the shadow tint), as it was. */
    if (typeof tint === 'function') {
      tint.call(base, shader, renderer);
    }
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HATCH_FRAG_DECL}`)
      .replace('#include <opaque_fragment>', HATCH_FRAG_BODY);
  };
  const key = `tone|${HATCH_FRAG_DECL}|${HATCH_FRAG_BODY}`;
  mat.customProgramCacheKey = () => key;
  return mat;
}

/*
 * Swap every cel material under `root` for its toned copy, one copy per
 * material however many meshes share it, and have each toned mesh set the
 * cell for the target it is about to draw into. Flat colours (the lamps,
 * the windows' sky) are lights and are left as they are. Returns the
 * number of materials toned, for the map's checks.
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
    const before = o.onBeforeRender;
    o.onBeforeRender = function onBeforeRender(renderer, ...rest) {
      toneCell(renderer);
      before.call(this, renderer, ...rest);
    };
  });
  return copies.size;
}
