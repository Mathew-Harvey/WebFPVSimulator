/*
 * looks.js: what a built map's time of day and its ground look like.
 *
 * A map's document carries a scene, { time, ground } (sceneOf in
 * src/trackbuilder/model.js holds the vocabulary). This is what each value
 * means on screen: for a time, the whole of the town's two light anime
 * setup (the sun, its fill and bounce, the hemisphere, the fog, the sky
 * dome and its clouds, the painted ridges, the ink and the grade); for a
 * ground, the colours the plot and the land round it are painted in. The
 * built map (./index.js) paints from it, the builder's 3D preview
 * (src/trackbuilder/view3d.js) follows it, and so does the asset gallery,
 * so all three agree about what dusk is.
 *
 * GOLDEN IS THE TOWN'S OWN, NUMBER FOR NUMBER. Every golden value below is
 * the one the built map used before times existed (the town's palette, its
 * four lights at its offsets, post.js's grade), so a map that never chose a
 * scene looks exactly as it did. The others are built round it by the same
 * rules the town's palette keeps: shadows go violet rather than grey, no
 * value crushes to black, and the sky and the fog agree about the colour of
 * the horizon, since the fog is what the land fades into as it meets it.
 *
 * Pure data and plain assignments, no Three.js import: the functions below
 * set colours on objects the caller built, so this loads in Node and a check
 * can hold the table against the document's vocabulary.
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

import { PAL } from '../city/vendored/core/palette.js';
import { sceneOf } from '../../trackbuilder/model.js';

/*
 * THE TIMES OF DAY.
 *
 *   sun, fill, bounce  colour, intensity, and the offset the light stands at
 *                      from what it lights, in Three.js world metres (x east,
 *                      y up, z south). Only the offset's direction matters;
 *                      the map sets its length.
 *   soft               the sun's shadow filter radius in texels; 1 is
 *                      three.js's own, the town's hard cel edge.
 *   hemi               the hemisphere light: sky, ground, intensity.
 *   fog                colour, and multipliers on the map's own near and far
 *                      (fogFor in ./index.js), which are sized to the plot.
 *   sky                the dome's three stops, how many painted steps it
 *                      is quantised to, and the two cloud layers' colours
 *                      and opacities, over buildSky's own.
 *   hills              the painted ridges, far and near.
 *   ink, grade         the post pipeline's ink colour and anime grade.
 *   flats              what the kit multiplies every unlit material that is
 *                      not a light by (src/props/kit.js): about what the
 *                      time's lights do to a pale wall against golden hour,
 *                      so glass and paint sit in the light rather than on it.
 *   night              windows lit, lamps pooled and haloed.
 *   wire               the far wires' line colour, a flat line like glass.
 */
export const TIMES = {
  golden: {
    sun: { color: PAL.sun, intensity: 2.25, at: [-52, 62, 56], soft: 1 },
    fill: { color: PAL.fill, intensity: 1.08, at: [48, 26, -44] },
    bounce: { color: 0xd8cbe8, intensity: 0.34, at: [10, -18, 40] },
    hemi: { sky: PAL.hemiSky, ground: PAL.hemiGround, intensity: 1.12 },
    fog: { color: PAL.fog, near: 1, far: 1 },
    sky: {
      top: PAL.skyTop, mid: PAL.skyMid, haze: PAL.skyHaze, bands: 26,
      cloud: PAL.cloud, cloudOpacity: 0.62, cloudShade: PAL.cloudShade, cloudShadeOpacity: 0.34,
    },
    hills: { far: PAL.hillFar, near: PAL.hill },
    /* post.js's own, written out so a page that switches back to golden
     * (the builder's preview) puts them back. */
    ink: PAL.ink,
    grade: { shadowTint: 0xada8d0, lightTint: 0xfff7e8, saturation: 1.12, lift: 0.032, vignette: 0.15, warmth: 0.05 },
    flats: null,
    night: false,
    wire: 0x4c4658,
  },

  /*
   * NOON: high and crisp. The sun two thirds of the way up the sky and
   * nearly white, so shadows are short and hard under things; a deeper,
   * cleaner blue overhead with no pink at the horizon; clearer air, so the
   * fog lets a pilot see further; and the grade's late afternoon warmth
   * taken almost all the way out. About the same total light on a pale
   * wall as golden hour, so the unlit materials need no correction.
   */
  noon: {
    sun: { color: 0xfff9ee, intensity: 2.3, at: [-20, 95, 38], soft: 1 },
    fill: { color: 0x9dbbf2, intensity: 0.85, at: [44, 40, -40] },
    bounce: { color: 0xd6d2de, intensity: 0.3, at: [10, -18, 40] },
    hemi: { sky: 0xcfe4ff, ground: 0xaaa2b8, intensity: 1.0 },
    fog: { color: 0xd2e2f4, near: 1.1, far: 1.15 },
    sky: {
      top: 0x5b98df, mid: 0xa6cdf4, haze: 0xd6e6f6, bands: 26,
      cloud: 0xffffff, cloudOpacity: 0.72, cloudShade: 0xdae2f0, cloudShadeOpacity: 0.36,
    },
    hills: { far: 0xd0dbee, near: 0xb9c8e4 },
    ink: PAL.ink,
    grade: { shadowTint: 0xa0a5d6, lightTint: 0xfffbf2, saturation: 1.18, lift: 0.022, vignette: 0.12, warmth: 0.015 },
    flats: null,
    night: false,
    wire: 0x4c4658,
  },

  /*
   * DUSK: the sun on the horizon in the west south west, deep orange, so a
   * face turned to it takes a warm band and everything else is in the cool
   * blue violet of the sky opposite. The sky runs from indigo overhead to a
   * rose and amber horizon, the clouds are lit salmon from below, and the
   * ridges stand against it as violet silhouettes. The fog is the dusky
   * violet the land fades into as it meets that horizon. About half golden
   * hour's light on a pale wall, so the unlit materials are brought down
   * with it and the lights (lit windows, lamps, billboards, vending
   * machines) are what is left bright.
   */
  dusk: {
    sun: { color: 0xffa645, intensity: 2.8, at: [-86, 15, 38], soft: 1 },
    fill: { color: 0x6878cc, intensity: 1.0, at: [70, 34, -44] },
    bounce: { color: 0x8c74a0, intensity: 0.25, at: [10, -18, 40] },
    hemi: { sky: 0x7a82c4, ground: 0x4c4262, intensity: 1.05 },
    fog: { color: 0x9186b4, near: 0.9, far: 0.95 },
    sky: {
      /* Twice the town's painted steps: from indigo to amber each of its
       * 26 is a stripe across the whole sky, where on the town's pale blue
       * they are the faint airbrush the vendored sky means them to be. */
      top: 0x2e3377, mid: 0x7c77bc, haze: 0xf5aa7c, bands: 52,
      cloud: 0xf6a88c, cloudOpacity: 0.72, cloudShade: 0x7d72aa, cloudShadeOpacity: 0.52,
    },
    hills: { far: 0x958bb8, near: 0x6c6597 },
    ink: 0x28223f,
    grade: { shadowTint: 0x8783cc, lightTint: 0xffe6cc, saturation: 1.14, lift: 0.03, vignette: 0.24, warmth: 0.07 },
    flats: [0.4, 0.36, 0.52],
    night: true,
    wire: 0x2e2a3c,
  },

  /*
   * OVERCAST: flat. The sun a weak, pale, diffuse patch overhead with its
   * shadow filtered soft, so things still stand on the ground but nothing
   * casts an edge; the light is mostly the sky's, through the hemisphere,
   * so the cel ramp's bands all but close up. A low grey violet sky and a
   * fog of the same grey pulled in closer, clouds heavy and nearly opaque,
   * the grade's saturation taken below neutral and its warmth out.
   */
  overcast: {
    sun: { color: 0xe9e6f2, intensity: 0.6, at: [-30, 85, 40], soft: 6 },
    fill: { color: 0xc4c9e0, intensity: 0.45, at: [40, 60, -30] },
    bounce: { color: 0xc6bed0, intensity: 0.22, at: [10, -18, 40] },
    hemi: { sky: 0xe6e4f2, ground: 0xa7a0b3, intensity: 2.55 },
    fog: { color: 0xc9c6d6, near: 0.8, far: 0.86 },
    sky: {
      top: 0xb2afc7, mid: 0xc2bfd3, haze: 0xcecbd9, bands: 26,
      cloud: 0xaaa7be, cloudOpacity: 0.55, cloudShade: 0x918ea8, cloudShadeOpacity: 0.45,
    },
    hills: { far: 0xc6c3d6, near: 0xb8b5cb },
    ink: 0x3d3953,
    grade: { shadowTint: 0xb0aecc, lightTint: 0xf3f2f6, saturation: 0.95, lift: 0.03, vignette: 0.14, warmth: 0 },
    flats: [0.86, 0.86, 0.9],
    night: false,
    wire: 0x4a4658,
  },
};

/*
 * THE GROUNDS.
 *
 *   plot      the colour the builder's preview paints the plot, and the tone
 *             ./index.js builds the plot's texture round
 *   tint      the plot's cel shadow tint
 *   terrain   the land past the verge: base, and its light and dark mottle
 *   edgeLine  the yellow line painted round the plot, in from the kerb
 *   bays      a container stack's painted bay
 *
 * Paint that means a yard (the edge line, a container's bay) is not put on
 * grass or dirt, where nobody paints lines; the launch box round the pads
 * is, in the white a pitch is marked with.
 */
export const GROUNDS = {
  concrete: {
    plot: PAL.concreteMid,
    tint: 0x6f6790,
    terrain: { base: '#c4c4b6', light: 'rgba(212, 210, 196, 0.5)', dark: 'rgba(170, 176, 150, 0.45)' },
    edgeLine: true,
    bays: true,
  },
  tarmac: {
    plot: 0x6b6978,
    tint: 0x5a5480,
    terrain: { base: '#c4c4b6', light: 'rgba(212, 210, 196, 0.5)', dark: 'rgba(170, 176, 150, 0.45)' },
    edgeLine: true,
    bays: true,
  },
  grass: {
    plot: PAL.grass,
    tint: 0x5b6f8c,
    terrain: { base: '#b9c4a2', light: 'rgba(206, 214, 180, 0.5)', dark: 'rgba(142, 164, 128, 0.45)' },
    edgeLine: false,
    bays: false,
  },
  dirt: {
    plot: 0xc2ad95,
    tint: 0x6f5f86,
    terrain: { base: '#cbc3ac', light: 'rgba(218, 208, 186, 0.5)', dark: 'rgba(172, 170, 140, 0.45)' },
    edgeLine: false,
    bays: false,
  },
};

/* A document's time and ground, as the tables' entries, with their ids. */
export function lookOf(doc) {
  const s = sceneOf(doc);
  return { time: TIMES[s.time], timeId: s.time, ground: GROUNDS[s.ground], groundId: s.ground };
}

/* What a time asks of src/props/kit.js, or null for golden, which the kit
 * draws as it always has. */
export function kitLook(timeId) {
  const T = TIMES[timeId];
  if (!T || (!T.flats && !T.night)) {
    return null;
  }
  return { key: timeId, flats: T.flats, night: T.night };
}

/*
 * The lights' colours and intensities. Where they stand is the caller's,
 * since each of the three pages seats them on something different; each
 * light's offset is T.sun.at and the rest.
 */
export function paintLights(lights, T) {
  lights.sun.color.set(T.sun.color);
  lights.sun.intensity = T.sun.intensity;
  lights.sun.shadow.radius = T.sun.soft;
  lights.fill.color.set(T.fill.color);
  lights.fill.intensity = T.fill.intensity;
  lights.bounce.color.set(T.bounce.color);
  lights.bounce.intensity = T.bounce.intensity;
  lights.hemi.color.set(T.hemi.sky);
  lights.hemi.groundColor.set(T.hemi.ground);
  lights.hemi.intensity = T.hemi.intensity;
}

/*
 * THE DOME'S OWN SHADING, with two changes, on the dome's material after
 * buildSky made it (so the vendored file stays byte identical).
 *
 * Its height is the direction from the dome's centre, the object space
 * position, where the vendored shader took normalize(vWorld). The dome is
 * trailed on the camera, so from 120 m up the world position put the haze
 * 13.9 degrees under the true horizon and sky colour at it. And under the
 * horizon it goes to the fog's colour, uFog. The dome writes depth and
 * the land stops at it, or at the far plane, short of the horizon from any
 * height, and at dusk the amber haze filled that gap: from altitude an
 * amber band lay under the horizon where the violet fogged land should be,
 * and the map read as a disc hanging in the sky. Now the dome carries the
 * fogged land on to the horizon. At the ground the gap is a fifth of a
 * degree and nothing changes. The vendored shader's reversed smoothstep is
 * written the other way round here, the same curve, because GLSL leaves a
 * smoothstep whose first edge is the higher undefined.
 */
const DOME_VERTEX = /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `;
const DOME_FRAGMENT = /* glsl */ `
      uniform vec3 uTop, uMid, uHaze, uFog;
      uniform float uBands;
      varying vec3 vDir;

      void main() {
        float h = normalize( vDir ).y;
        float t = clamp( h * 1.15 + 0.02, 0.0, 1.0 );
        float q = floor( t * uBands ) / uBands;
        t = mix( t, q, 0.35 );

        vec3 col = mix( uHaze, uMid, smoothstep( 0.0, 0.30, t ) );
        col = mix( col, uTop, smoothstep( 0.26, 0.92, t ) );
        col = mix( col, uHaze, ( 1.0 - smoothstep( -0.05, 0.12, h ) ) * 0.6 );
        col = mix( col, uFog, 1.0 - smoothstep( -0.03, 0.0, h ) );
        gl_FragColor = vec4( col, 1.0 );
      }
    `;

/*
 * The dome and the clouds, as buildSky in the vendored core/sky.js made
 * them: it takes no colours, so they are set here after it has built them,
 * and the vendored file stays byte identical. Each puff is a group of two
 * planes, the shade behind and the lit one in front, and every puff shares
 * the same two materials; those are the sky's own (made with cache: false),
 * so setting them touches nothing else.
 */
export function paintSky(sky, T) {
  const m = sky.dome.material;
  const u = m.uniforms;
  if (m.fragmentShader !== DOME_FRAGMENT) {
    u.uFog = { value: u.uHaze.value.clone() };
    m.vertexShader = DOME_VERTEX;
    m.fragmentShader = DOME_FRAGMENT;
    m.needsUpdate = true;
  }
  u.uFog.value.set(T.fog.color);
  u.uTop.value.set(T.sky.top);
  u.uMid.value.set(T.sky.mid);
  u.uHaze.value.set(T.sky.haze);
  u.uBands.value = T.sky.bands;
  const puff = sky.clouds.children[0];
  if (puff && puff.children.length === 2) {
    const [shade, lit] = puff.children;
    lit.material.color.set(T.sky.cloud);
    lit.material.opacity = T.sky.cloudOpacity;
    shade.material.color.set(T.sky.cloudShade);
    shade.material.opacity = T.sky.cloudShadeOpacity;
  }
}

/* The ink and the grade, on a pipeline's own copies of post.js's
 * uniforms (makeQuad clones them), so nothing shared is touched. */
export function paintPost(pipeline, T) {
  pipeline.ink.mat.uniforms.uInk.value.set(T.ink);
  const g = pipeline.grade.mat.uniforms;
  g.uShadowTint.value.set(T.grade.shadowTint);
  g.uLightTint.value.set(T.grade.lightTint);
  g.uSaturation.value = T.grade.saturation;
  g.uLift.value = T.grade.lift;
  g.uVignette.value = T.grade.vignette;
  g.uWarmth.value = T.grade.warmth;
}
