/*
 * post.js: the post processing chain.
 *
 * Two passes that do most of the work of making this look drawn rather
 * than rendered:
 *
 * 1. Edge detection over depth and normals. Inverted hull outlines only
 *    give you a silhouette around an object; a depth and normal edge pass
 *    also finds the creases inside it and the line where an object meets
 *    the ground, which is what reads as ink. Depth edges are scaled by
 *    view distance so distant geometry does not turn into a wire mesh.
 *
 * 2. Bloom, kept deliberately tight and low. Cel shading and heavy bloom
 *    fight each other; this is here only to make the gate rings and the
 *    sun glow, which is what pulls the eye to the next gate.
 *
 * 3. A grade: mild FPV barrel distortion, a highlight shoulder, a cool
 *    lift in the blacks against a warm gain in the lights, vibrance, and
 *    a vignette. Individually invisible; together they are the difference
 *    between raw renderer output and a finished frame.
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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const OutlineShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 2000 },
    uLineColor: { value: new THREE.Color(0x1a2230) },
    uDepthBias: { value: 0.0016 },
    /* High enough that the roughly 42 degree facet dihedral of the low
     * poly canopies and rocks stays clean (normal delta about 0.7 per
     * sample pair) while true corners near 90 degrees (delta 1.4) still
     * ink. Facet creases were turning every near tree into a wire mesh. */
    uNormalBias: { value: 1.05 },
    uStrength: { value: 0.85 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform vec2 uResolution;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform vec3 uLineColor;
    uniform float uDepthBias;
    uniform float uNormalBias;
    uniform float uStrength;

    float readDepth(vec2 uv) {
      // Clamp: sampling one texel outside the frame wraps and pulls in
      // the opposite edge, which paints a false band along the border.
      uv = clamp(uv, vec2(0.0), vec2(1.0));
      float d = texture2D(tDepth, uv).x;
      float vz = perspectiveDepthToViewZ(d, uCameraNear, uCameraFar);
      return viewZToOrthographicDepth(vz, uCameraNear, uCameraFar);
    }

    void main() {
      vec2 texel = 1.0 / uResolution;
      vec4 base = texture2D(tDiffuse, vUv);

      float d0 = readDepth(vUv);
      // Roberts cross over depth, and a normal difference for creases the
      // depth pass cannot see (a fold where both faces are equidistant).
      float d1 = readDepth(vUv + vec2(texel.x, texel.y));
      float d2 = readDepth(vUv + vec2(-texel.x, -texel.y));
      float d3 = readDepth(vUv + vec2(texel.x, -texel.y));
      float d4 = readDepth(vUv + vec2(-texel.x, texel.y));
      float depthEdge = length(vec2(d1 - d2, d3 - d4));

      vec3 n1 = texture2D(tNormal, clamp(vUv + vec2(texel.x, texel.y), vec2(0.0), vec2(1.0))).xyz * 2.0 - 1.0;
      vec3 n2 = texture2D(tNormal, clamp(vUv + vec2(-texel.x, -texel.y), vec2(0.0), vec2(1.0))).xyz * 2.0 - 1.0;
      vec3 n3 = texture2D(tNormal, clamp(vUv + vec2(texel.x, -texel.y), vec2(0.0), vec2(1.0))).xyz * 2.0 - 1.0;
      vec3 n4 = texture2D(tNormal, clamp(vUv + vec2(-texel.x, texel.y), vec2(0.0), vec2(1.0))).xyz * 2.0 - 1.0;
      float normalEdge = length(n1 - n2) + length(n3 - n4);

      // Scale the depth threshold with distance or the whole horizon
      // turns into outline. Skip the sky entirely.
      float distScale = 1.0 + d0 * 260.0;
      float de = step(uDepthBias * distScale, depthEdge);
      // Crease lines are a near field effect. Past a short distance they
      // turn low poly scenery into a wire mesh, so fade them out early
      // and leave silhouettes to the depth term alone.
      float nearness = 1.0 - smoothstep(0.010, 0.055, d0);
      float ne = step(uNormalBias, normalEdge) * nearness;
      float edge = clamp(max(de, ne), 0.0, 1.0) * uStrength;
      // never draw on the sky, and let very distant geometry go clean
      edge *= step(d0, 0.999) * (1.0 - smoothstep(0.16, 0.42, d0));

      gl_FragColor = vec4(mix(base.rgb, uLineColor, edge), base.a);
    }
  `,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDistort: { value: 0.055 },
    uVignette: { value: 0.16 },
    uVibrance: { value: 0.22 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uDistort;
    uniform float uVignette;
    uniform float uVibrance;

    void main() {
      // FPV lens: mild barrel distortion, zoom compensated so the
      // corners never sample outside the frame.
      vec2 uv = vUv - 0.5;
      float r2 = dot(uv, uv);
      vec2 duv = 0.5 + uv * (1.0 + uDistort * r2) / (1.0 + uDistort * 0.5);
      vec3 c = texture2D(tDiffuse, duv).rgb;

      // Highlight shoulder: everything above the knee rolls off smoothly
      // instead of clipping, so the sky and bloom keep their hue.
      vec3 h = max(c - 0.8, vec3(0.0));
      c = min(c, vec3(0.8)) + h / (1.0 + h);

      // Cool lift in the blacks, warm gain in the lights: the same warm
      // light cool shadow logic as the ramp, applied to the whole frame.
      // Kept shallow: lifting further milks the ink lines and flattens
      // the value structure the cel look depends on.
      vec3 lift = vec3(0.006, 0.009, 0.021);
      c = c * (1.0 - lift) + lift;
      c *= vec3(1.045, 1.010, 0.965);

      // Vibrance: push saturation hardest where there is least of it, so
      // flat mid tones enrich without neon-ing what is already saturated.
      float mx = max(c.r, max(c.g, c.b));
      float mn = min(c.r, min(c.g, c.b));
      float sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, 1.0 + uVibrance * (1.0 - sat));

      // Vignette, wide and shallow: frames the view without reading as a
      // dirty lens.
      c *= 1.0 - uVignette * smoothstep(0.18, 0.52, r2);

      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export function buildComposer(renderer, scene, camera) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const dpr = renderer.getPixelRatio();
  const w = Math.max(1, Math.floor(size.x * dpr));
  const h = Math.max(1, Math.floor(size.y * dpr));

  /*
   * Depth and normals come from one prepass into a target the composer
   * never writes to. Attaching the depth texture to a composer target
   * instead means the outline pass samples the depth of the buffer it is
   * writing into, and the driver reports a feedback loop between the
   * framebuffer and an active texture. Keeping the prepass separate is
   * also what lets the outline read a clean normal buffer.
   */
  const normalTarget = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  normalTarget.depthTexture = new THREE.DepthTexture(w, h);
  normalTarget.depthTexture.type = THREE.UnsignedShortType;
  const normalMaterial = new THREE.MeshNormalMaterial();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const outline = new ShaderPass(OutlineShader);
  outline.uniforms.tDepth.value = normalTarget.depthTexture;
  outline.uniforms.tNormal.value = normalTarget.texture;
  outline.uniforms.uResolution.value.set(w, h);
  outline.uniforms.uCameraNear.value = camera.near;
  outline.uniforms.uCameraFar.value = camera.far;
  composer.addPass(outline);

  /*
   * Bloom threshold. At 0.92 on linear luminance nothing in the world
   * passed the high pass except the sun disc and a few white pips: both
   * gate ring colours sit at about 0.70, so the one thing bloom exists for
   * was the one thing it could not see. 0.78 catches the rings and the
   * warm horizon and leaves the mid greens alone. The renderer runs with
   * no tone mapping, so raising the ring colour past one instead would
   * clamp it to white and take away the hue that identifies the target.
   */
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.55, 0.78);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  /* Colour space and tone mapping conversion. Without this the composer
   * writes linear values straight to the screen and every colour reads
   * wrong. */
  composer.addPass(new OutputPass());

  /* Layer 1 is the no ink layer: sky dome, grass, flowers, water and the
   * gate rings and glows. The sky must be excluded because the override
   * material ignores its depthWrite:false and would stamp depth at the far
   * plane, leaving every outline computed against the sky instead of the
   * world. Grass and flowers are excluded because outlining individual
   * blades reads as broken glass. The emissive rings are excluded because
   * the depth pass draws a ghost ellipse inside the torus.
   *
   * Clouds are NOT on this layer any more. They used to be, and because
   * the prepass skips the whole layer they wrote no depth, so the ink pass
   * drew the silhouettes of mountains standing behind them straight across
   * the cloud. */
  function renderNormals() {
    const prevBg = scene.background;
    const prevOverride = scene.overrideMaterial;
    const prevFog = scene.fog;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = normalMaterial;
    camera.layers.disable(1);
    renderer.setRenderTarget(normalTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    camera.layers.enable(1);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    scene.fog = prevFog;
  }

  function setSize(width, height) {
    const p = renderer.getPixelRatio();
    const bw = Math.max(1, Math.floor(width * p));
    const bh = Math.max(1, Math.floor(height * p));
    composer.setSize(width, height);
    normalTarget.setSize(bw, bh);
    outline.uniforms.uResolution.value.set(bw, bh);
  }

  return {
    render() {
      renderNormals();
      composer.render();
    },
    setSize,
    outline,
    bloom,
    grade,
  };
}
