/*
 * celmat.js: the cel shading model.
 *
 * The thing that separates a good cel shaded world from a flat one is not
 * the banding, it is that light and shadow are different HUES, not the
 * same hue at two brightnesses. Sunlit surfaces go warm, shadowed surfaces
 * go toward the blue of the sky bouncing into them. Breath of the Wild
 * leans on this constantly and it is why its shadows read as air rather
 * than as dirt.
 *
 * That is done here with a coloured gradient ramp. Three.js samples
 * MeshToonMaterial's gradientMap by N dot L and multiplies the result into
 * the base colour, so an RGB ramp that runs cool to warm gives the split
 * for free while keeping Three's own shadow, fog and light machinery.
 *
 * On top, onBeforeCompile injects two things Three's toon material does
 * not have: a fresnel rim light tinted toward the sky, which separates
 * silhouettes from the background at distance, and a specular band for a
 * hard painted highlight on the craft.
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

/*
 * Four band ramp, cool shadow to warm light. The steps are deliberately
 * uneven: a wide lit band, a narrow terminator, then two shadow bands, so
 * most of a curved surface reads as one flat shape with a crisp edge,
 * which is what makes it look drawn rather than shaded.
 */
function celRamp() {
  const stops = [
    [0.40, 0.47, 0.66], /* deep shadow, sky blue bounce */
    [0.55, 0.60, 0.74], /* shadow */
    [0.86, 0.86, 0.86], /* terminator */
    [1.00, 0.99, 0.94], /* sunlit, warm */
  ];
  const width = 64;
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i += 1) {
    const t = i / (width - 1);
    /* Hard steps with a one texel soft edge so it does not alias. */
    let band = 0;
    if (t > 0.30) band = 1;
    if (t > 0.48) band = 2;
    if (t > 0.56) band = 3;
    const c = stops[band];
    data[i * 4 + 0] = Math.round(c[0] * 255);
    data[i * 4 + 1] = Math.round(c[1] * 255);
    data[i * 4 + 2] = Math.round(c[2] * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

let RAMP = null;
export function celRampTexture() {
  if (!RAMP) {
    RAMP = celRamp();
  }
  return RAMP;
}

const RIM_CHUNK = /* glsl */ `
  vec3 celN = normalize(vNormal);
  vec3 celV = normalize(vViewPosition);
  float celRim = 1.0 - max(dot(celN, celV), 0.0);
  celRim = smoothstep(uRimStart, 1.0, celRim);
  // quantise the rim too, otherwise it reads as a soft 3D gloss and
  // fights everything else on screen
  celRim = step(0.5, celRim);
  gl_FragColor.rgb += uRimColor * celRim * uRimStrength;

  float celSpec = max(dot(reflect(-celV, celN), normalize(uSpecDir)), 0.0);
  celSpec = step(0.985 - uSpecWidth, celSpec);
  gl_FragColor.rgb += uSpecColor * celSpec * uSpecStrength;
`;

/*
 * opts: color, rim (0..1), rimColor, spec (0..1), specWidth
 */
export function celMaterial(opts = {}) {
  const mat = new THREE.MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    gradientMap: celRampTexture(),
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  const rimColor = new THREE.Color(opts.rimColor ?? 0x9ec8ff);
  const specColor = new THREE.Color(opts.specColor ?? 0xffffff);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uRimStrength = { value: opts.rim ?? 0.32 };
    shader.uniforms.uRimStart = { value: opts.rimStart ?? 0.55 };
    shader.uniforms.uSpecColor = { value: specColor };
    shader.uniforms.uSpecStrength = { value: opts.spec ?? 0.0 };
    shader.uniforms.uSpecWidth = { value: opts.specWidth ?? 0.01 };
    shader.uniforms.uSpecDir = { value: new THREE.Vector3(0.45, 0.8, 0.4) };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uRimColor;
         uniform float uRimStrength;
         uniform float uRimStart;
         uniform vec3 uSpecColor;
         uniform float uSpecStrength;
         uniform float uSpecWidth;
         uniform vec3 uSpecDir;`,
      )
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${RIM_CHUNK}`);
  };
  mat.userData.cel = true;
  return mat;
}

/*
 * Inverted hull outline for hero objects. The post pass draws edges from
 * depth and normals across the whole world; this adds a heavier, art
 * directed line on the things that need to pop regardless of what is
 * behind them.
 */
export function outlineHull(mesh, thickness = 1.05, color = 0x141a24) {
  const hull = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true }),
  );
  hull.scale.multiplyScalar(thickness);
  hull.castShadow = false;
  hull.receiveShadow = false;
  mesh.add(hull);
  return mesh;
}
