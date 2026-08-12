/*
 * post.js: the post processing chain.
 *
 * Three passes at full resolution, and they are three rather than four
 * because P3 allows four and the frame has to keep one in hand:
 *
 * 1. A geometry prepass into one RGBA8 target, then an edge pass over it.
 *    The prepass packs the view space normal into rg and a linear view
 *    depth into ba, so the edge pass reads normal and depth in the same
 *    fetch. Inverted hull outlines only give you a silhouette around an
 *    object; an edge pass over depth and normals also finds the creases
 *    inside it and the line where an object meets the ground, which is
 *    what reads as ink.
 *
 *    The same five geometry fetches also drive the antialiasing. There is
 *    no separate resolve: the composer target carries no multisampling,
 *    because 4x multisampling an RGBA16F target at 1080p costs 116 MB and
 *    the whole render target budget is 120 MB. The edge pass already knows
 *    where every silhouette in the frame is and which way it runs, so it
 *    resolves them with two colour taps along the depth gradient. The ink
 *    threshold is deliberately high, so it has its own much lower coverage
 *    threshold: a silhouette too subtle to ink still gets resolved.
 *
 * 2. Bloom, kept deliberately tight and low. Cel shading and heavy bloom
 *    fight each other; this is here only to make the gate rings and the
 *    sun glow, which is what pulls the eye to the next gate.
 *
 * 3. A grade, which is also the output pass: mild FPV barrel distortion, a
 *    highlight shoulder, a cool lift in the blacks against a warm gain in
 *    the lights, vibrance, a vignette, and then the sRGB transfer. It does
 *    the transfer itself rather than handing the frame to an OutputPass,
 *    because that was a fourth full resolution pass and a fourteenth
 *    texture tap to apply one curve.
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

/*
 * Depth is packed into two 8 bit channels rather than kept in a depth
 * texture, which is what takes the edge pass from eleven texture fetches
 * per pixel to six. The pair carries 16 bits over the whole 0.2 m to
 * 2600 m range, so a depth code is 4 cm everywhere. A 24 bit perspective
 * depth buffer has far more precision than that near the camera and far
 * less than that past a few hundred metres, which is exactly the wrong way
 * round for finding a mountain silhouette against another mountain.
 */
const PACK_GLSL = /* glsl */ `
  vec2 packDepth16(float v) {
    vec2 r = vec2(v, fract(v * 255.0));
    r.x -= r.y / 255.0;
    return r;
  }
  float unpackDepth16(vec2 p) {
    return p.x + p.y * (1.0 / 255.0);
  }
`;

const GEO_VERT = /* glsl */ `
  varying vec3 vNormalView;
  varying float vViewDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalMatrix * normal;
    vViewDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

function geoFragment(sentinel) {
  return /* glsl */ `
    uniform float uNear;
    uniform float uFar;
    varying vec3 vNormalView;
    varying float vViewDepth;
    ${PACK_GLSL}
    void main() {
      float d = clamp((vViewDepth - uNear) / (uFar - uNear), 0.0, 1.0);
      ${sentinel
        ? 'gl_FragColor = vec4(0.0, 0.0, packDepth16(d));'
        : `vec3 n = normalize(vNormalView);
      gl_FragColor = vec4(n.xy * 0.5 + 0.5, packDepth16(d));`}
    }
  `;
}

const OutlineShader = {
  uniforms: {
    tDiffuse: { value: null },
    tGeo: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uLineColor: { value: new THREE.Color(0x1a2230) },
    uDepthBias: { value: 0.0016 },
    /* High enough that the roughly 42 degree facet dihedral of the low
     * poly canopies and rocks stays clean (normal delta about 0.7 per
     * sample pair) while true corners near 90 degrees (delta 1.4) still
     * ink. Facet creases were turning every near tree into a wire mesh. */
    uNormalBias: { value: 1.05 },
    uStrength: { value: 0.85 },
    /* A twentieth of the ink threshold. Coverage is wanted on every
     * silhouette in the frame; ink is wanted only on the ones that read as
     * drawn. */
    uAaBias: { value: 0.00008 },
    uAaAmount: { value: 1.0 },
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
    uniform sampler2D tGeo;
    uniform vec2 uResolution;
    uniform vec3 uLineColor;
    uniform float uDepthBias;
    uniform float uNormalBias;
    uniform float uStrength;
    uniform float uAaBias;
    uniform float uAaAmount;
    ${PACK_GLSL}

    /* Only xy is stored. z is reconstructed positive, which is what a
     * front facing surface has in view space anyway, and the two places it
     * is read (the crease term and the grazing angle term) both want a
     * magnitude rather than a sign. */
    vec3 decodeNormal(vec2 e) {
      vec2 n = e * 2.0 - 1.0;
      return vec3(n, sqrt(max(0.0, 1.0 - dot(n, n))));
    }

    void main() {
      vec2 texel = 1.0 / uResolution;
      vec4 base = texture2D(tDiffuse, vUv);

      /* Five fetches, normal and depth in each. Clamped: sampling one
       * texel outside the frame wraps and pulls in the opposite edge,
       * which paints a false band along the border. */
      vec4 g0 = texture2D(tGeo, vUv);
      vec4 g1 = texture2D(tGeo, clamp(vUv + vec2( texel.x,  texel.y), vec2(0.0), vec2(1.0)));
      vec4 g2 = texture2D(tGeo, clamp(vUv + vec2(-texel.x, -texel.y), vec2(0.0), vec2(1.0)));
      vec4 g3 = texture2D(tGeo, clamp(vUv + vec2( texel.x, -texel.y), vec2(0.0), vec2(1.0)));
      vec4 g4 = texture2D(tGeo, clamp(vUv + vec2(-texel.x,  texel.y), vec2(0.0), vec2(1.0)));

      float d0 = unpackDepth16(g0.zw);
      float d1 = unpackDepth16(g1.zw);
      float d2 = unpackDepth16(g2.zw);
      float d3 = unpackDepth16(g3.zw);
      float d4 = unpackDepth16(g4.zw);
      // Roberts cross over depth, and a normal difference for creases the
      // depth pass cannot see (a fold where both faces are equidistant).
      float depthEdge = length(vec2(d1 - d2, d3 - d4));

      vec3 n0 = decodeNormal(g0.xy);
      float normalEdge =
        length(decodeNormal(g1.xy) - decodeNormal(g2.xy)) +
        length(decodeNormal(g3.xy) - decodeNormal(g4.xy));

      /* Grass and sky pixels: rg stamped to zero, a value no encoded
       * normal can take, because rg is n.xy * 0.5 + 0.5 and reaching zero
       * in both would need an xy of length 1.41. Ink is suppressed on them
       * and within one texel of them, so blades are not outlined and
       * nothing is outlined through them. Their depth is still written and
       * still read, which is what stops the ink pass drawing the
       * silhouettes of gate legs behind the grass as empty rectangles
       * floating in the meadow. */
      float grass = step(length(g0.xy), 0.02);
      float grassNear = max(
        max(step(length(g1.xy), 0.02), step(length(g2.xy), 0.02)),
        max(step(length(g3.xy), 0.02), step(length(g4.xy), 0.02))
      );

      /* A surface seen edge on has a huge depth gradient of its own, and a
       * flat threshold inks it: the meadow carried a three pixel ink line
       * across the full width of the frame, with the same colour on both
       * sides of it. Divide the threshold by how square on the surface is,
       * using the view space normal the prepass already wrote. */
      float facing = max(abs(n0.z), 0.12);
      float distScale = (1.0 + d0 * 260.0) / facing;

      /*
       * Antialiasing, paid for entirely by fetches the ink already made.
       * The gradient of the packed depth gives the direction across the
       * silhouette; two colour taps along it and a 1 2 1 tent resolve it.
       * This is the frame's only antialiasing: the composer target carries
       * no multisampling, because 4x on RGBA16F at 1080p is 116 MB against
       * a 120 MB budget for every render target in the renderer.
       */
      vec2 grad = vec2((d1 + d3) - (d2 + d4), (d1 + d4) - (d2 + d3));
      float glen = length(grad);
      vec2 dir = glen > 1e-8 ? grad / glen : vec2(0.0, 0.0);
      float aaT = uAaBias * distScale;
      float aa = smoothstep(aaT, aaT * 5.0, depthEdge) * uAaAmount;
      vec3 c1 = texture2D(tDiffuse, clamp(vUv + dir * texel, vec2(0.0), vec2(1.0))).rgb;
      vec3 c2 = texture2D(tDiffuse, clamp(vUv - dir * texel, vec2(0.0), vec2(1.0))).rgb;
      vec3 resolved = mix(base.rgb, (base.rgb * 2.0 + c1 + c2) * 0.25, aa);

      /* Ink. smoothstep rather than step on both terms: a binary edge test
       * draws a binary line, and an aliased ink line on an antialiased
       * silhouette is worse than no antialiasing at all. */
      float dt = uDepthBias * distScale;
      float de = smoothstep(dt, dt * 1.7, depthEdge);
      // Crease lines are a near field effect. Past a short distance they
      // turn low poly scenery into a wire mesh, so fade them out early
      // and leave silhouettes to the depth term alone.
      float nearness = 1.0 - smoothstep(0.010, 0.055, d0);
      float ne = smoothstep(uNormalBias, uNormalBias * 1.35, normalEdge) * nearness;
      float edge = clamp(max(de, ne), 0.0, 1.0) * uStrength * (1.0 - max(grass, grassNear));
      // never draw on the sky, and let very distant geometry go clean
      edge *= step(d0, 0.999) * (1.0 - smoothstep(0.16, 0.42, d0));

      gl_FragColor = vec4(mix(resolved, uLineColor, edge), base.a);
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

      /* The sRGB transfer, done here instead of by a fourth full
       * resolution pass. This is the same curve three.js applies in
       * sRGBTransferOETF; the renderer runs with NoToneMapping, so the
       * tone mapping half of an OutputPass would have been a no operation
       * anyway. */
      c = clamp(c, vec3(0.0), vec3(1.0));
      vec3 lo = c * 12.92;
      vec3 hi = 1.055 * pow(c, vec3(0.41666667)) - 0.055;
      gl_FragColor = vec4(mix(lo, hi, step(vec3(0.0031308), c)), 1.0);
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
   * Normals and depth come from one prepass into a target the composer
   * never writes to. Attaching a depth texture to a composer target
   * instead means the outline pass samples the depth of the buffer it is
   * writing into, and the driver reports a feedback loop between the
   * framebuffer and an active texture.
   *
   * RGBA8, no depth texture: rg is the view normal's xy, ba is a linear
   * view depth packed to 16 bits. One fetch answers both questions, which
   * is what takes the edge pass from 11 texture fetches per output pixel
   * to 6 and leaves room in P4 for the two the antialiasing needs.
   */
  const normalTarget = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  /* Cleared to a normal of zero and a depth of one: the sky writes nothing
   * into this target and the edge pass has to read the far plane there,
   * not the near one. rgba (0, 0, 1, 0) unpacks to exactly depth 1. */
  const GEO_CLEAR = new THREE.Color(0, 0, 1);
  const geoUniforms = {
    uNear: { value: camera.near },
    uFar: { value: camera.far },
  };
  const normalMaterial = new THREE.ShaderMaterial({
    uniforms: geoUniforms,
    vertexShader: GEO_VERT,
    fragmentShader: geoFragment(false),
  });
  /* Grass is stamped with a normal of zero, which is not a value any
   * encoded normal can take, so the outline pass can recognise a grass
   * pixel and refuse to ink it while still using the depth the grass
   * wrote. Without the depth, the ink pass drew the silhouettes of gate
   * legs and tree trunks that the grass was standing in front of, as
   * rectangles floating in the meadow with nothing inside them. */
  const grassMaskMaterial = new THREE.ShaderMaterial({
    uniforms: geoUniforms,
    vertexShader: GEO_VERT,
    fragmentShader: geoFragment(true),
  });

  /*
   * No multisampling on the composer target. Measured, 4x on an RGBA16F
   * target at 1920 by 1080 is 116.1 MB, the composer keeps two of them for
   * its ping pong, and the whole render target budget for the minimum spec
   * machine is 120 MB. The second one is spent entirely on multisampling a
   * fullscreen quad, which multisampling cannot improve. Antialiasing is
   * done instead in the outline pass, out of texture fetches it was
   * already making. RGBA16F stays: the grade's highlight shoulder and the
   * bloom high pass both work on linear values, and 8 bit linear crushes
   * the shadow end of the sky gradient.
   */
  const composerTarget = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
  });
  const composer = new EffectComposer(renderer, composerTarget);
  composer.addPass(new RenderPass(scene, camera));

  const outline = new ShaderPass(OutlineShader);
  outline.uniforms.tGeo.value = normalTarget.texture;
  outline.uniforms.uResolution.value.set(w, h);
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
  /* Every one of bloom's thirteen targets is written by a fullscreen quad
   * and none of them is depth tested, but three.js gives a render target a
   * depth renderbuffer by default. Measured, that was 7.6 MB of the frame's
   * render target budget spent on depth buffers nothing reads. */
  for (const rt of bloomTargets(bloom)) {
    rt.depthBuffer = false;
  }
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  /* Layer 1 is the no ink layer: sky dome, water, flowers and the gate
   * rings and glows. The sky must be excluded because the override
   * material ignores its depthWrite:false and would stamp depth at the far
   * plane, leaving every outline computed against the sky instead of the
   * world. Flowers are excluded because outlining individual petals reads
   * as broken glass. The emissive rings are excluded because the depth
   * pass draws a ghost ellipse inside the torus.
   *
   * Clouds are NOT on this layer any more. They used to be, and because
   * the prepass skips the whole layer they wrote no depth, so the ink pass
   * drew the silhouettes of mountains standing behind them straight across
   * the cloud. */
  /* Reused rather than allocated: P8 forbids a new object anywhere in the
   * per frame path, and renderNormals runs every frame. */
  const prevClear = new THREE.Color();

  function renderNormals() {
    const prevBg = scene.background;
    const prevOverride = scene.overrideMaterial;
    const prevFog = scene.fog;
    const prevAutoClear = renderer.autoClear;
    renderer.getClearColor(prevClear);
    const prevClearAlpha = renderer.getClearAlpha();
    scene.background = null;
    scene.fog = null;
    /* The prepass overrides every material with one that samples no shadow
     * map, so rebuilding the shadow map for it is pure waste: measured, 74
     * of 310 draw calls and 113260 of 1465708 triangles per frame, because
     * the map was being rendered twice. Output is bit identical. */
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(normalTarget);
    renderer.setClearColor(GEO_CLEAR, 0);

    /* The layer mask is saved and restored as a raw value rather than
     * rebuilt with enable and disable calls. Rebuilding it is how the whole
     * world vanished from the colour pass once already: the prepass left the
     * camera looking at nothing but the inside of the sky dome, and the
     * frame came out as flat cream below the horizon. */
    const prevMask = camera.layers.mask;
    geoUniforms.uNear.value = camera.near;
    geoUniforms.uFar.value = camera.far;

    /* Pass one: everything that inks, as packed normals and depth. Layer 0. */
    scene.overrideMaterial = normalMaterial;
    camera.layers.mask = 1 << 0;
    renderer.clear();
    renderer.render(scene, camera);

    /* Pass two: the grass, sentinel normal, into the same target. Layer 2. */
    scene.overrideMaterial = grassMaskMaterial;
    camera.layers.mask = 1 << 2;
    renderer.autoClear = false;
    renderer.render(scene, camera);

    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(null);
    renderer.setClearColor(prevClear, prevClearAlpha);
    camera.layers.mask = prevMask;
    renderer.shadowMap.autoUpdate = prevShadowAuto;
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
    for (const rt of bloomTargets(bloom)) {
      rt.depthBuffer = false;
    }
  }

  /* composer and normalTarget are exposed for the cost ledger in
   * budget.js, which has to read the real targets to answer P5. Nothing in
   * the shell touches them. */
  return {
    render() {
      renderNormals();
      composer.render();
    },
    setSize,
    outline,
    bloom,
    grade,
    composer,
    normalTarget,
  };
}

function bloomTargets(bloom) {
  const out = [];
  if (bloom.renderTargetBright) {
    out.push(bloom.renderTargetBright);
  }
  for (const list of [bloom.renderTargetsHorizontal, bloom.renderTargetsVertical]) {
    for (const rt of list || []) {
      out.push(rt);
    }
  }
  return out;
}
