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
    uNormalBias: { value: 0.42 },
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

  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.7, 0.62);
  composer.addPass(bloom);
  /* Colour space and tone mapping conversion. Without this the composer
   * writes linear values straight to the screen and every colour reads
   * wrong. */
  composer.addPass(new OutputPass());

  /* Layer 1 is the no ink layer: sky dome, clouds and grass. The sky must
   * be excluded because the override material ignores its
   * depthWrite:false and would stamp depth at the far plane, leaving every
   * outline computed against the sky instead of the world. Grass is
   * excluded because outlining individual blades reads as broken glass. */
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
  };
}
