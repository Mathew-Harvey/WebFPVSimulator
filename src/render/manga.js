/*
 * manga.js: the manga layer's picture, Stage F (FREESTYLE-MAPS-PLAN.md
 * section 3.2 items 1, 2 and 4): speed lines, screentone and the impact
 * frame.
 *
 * NO NEW PASS. All three are folded into passes the freestyle maps already
 * run, because the post chain has a budget (src/render/budget.js) and a
 * full screen pass is the most expensive thing that can be added to it:
 *
 *   the grade      speed lines, the impact frame, and the mask of the
 *                  darkest cel band, which it writes into the alpha of the
 *                  target it already writes
 *   the fxaa pass  the dots of the screentone, at the canvas's own pixels,
 *                  reading that alpha from the fetch it already makes
 *
 * Nothing here samples a texture or runs a loop, so the budget's P3 (full
 * resolution passes) and P4 (taps per pixel) cannot move, and none of it
 * allocates a target, so P5 cannot either. What it costs is arithmetic in
 * two fragment shaders, and the strokes' arithmetic runs only where a
 * stroke can be: the outer ring of the frame, while the craft is fast.
 *
 * THE VENDORED PIPELINE STAYS BYTE IDENTICAL. The grade and the fxaa pass
 * belong to src/maps/city/vendored/core/post.js. mangaPipeline edits the
 * pipeline's OWN copies of the two materials, by finding exact lines and
 * adding after them, the way BuiltPipeline edits its ink
 * (src/maps/built/index.js, INK_LINEAR). If a vendored update ever changes
 * a line this looks for, the edit finds nothing, the map draws exactly as
 * it did before Stage F, and `ok` and `tone` say so. So there is no
 * PATCH-*.diff for this: nothing under vendored/ is changed.
 *
 * FREESTYLE ONLY, BY CONSTRUCTION. Only the town's pipeline and a built
 * map's call mangaPipeline. The race field's chain (src/render/post.js) has
 * never heard of this file, so a race track is clean whatever any setting
 * says. On a freestyle map the shell draws it only when ui.manga is true,
 * which Clean FPV makes false (src/ui/ui.js, syncManga).
 *
 * THE PERIPHERY ONLY (section 3.3). A stroke is drawn only where the
 * pixel's elliptical distance from the frame's centre, one at the middle of
 * each edge, is at least STROKE_REACH_MIN. The centre third of the frame is
 * the box inside a third of that distance on both axes, whose corners are
 * at the square root of two ninths, 0.471. Every stroke starts outside
 * 0.52, so none can reach the centre third, at any speed or focus. The
 * impact frame's re-inked picture is a grade of the frame and not a thing
 * drawn over it: the centre third still shows the scene, in ink.
 *
 * Render only. Nothing here reads or writes the physics state; the shell
 * hands it a velocity already converted at the render boundary
 * (src/render/frame.js), and its clock is the frame's wall clock, which is
 * allowed to reach the picture and nothing else.
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
 * SPEED LINES from LINES_FROM, full by LINES_FULL, in m/s. The plan's
 * "above about 20 m/s": a five inch cruising a street at 15 has none, and
 * one on a straight at 25 has a few short strokes at the very edges. Full
 * at 40, which a five inch reaches on a long straight and a pilot knows is
 * fast.
 */
export const LINES_FROM = 20;
export const LINES_FULL = 40;

/* Strokes round a full turn. At 1080 lines and the focus in the middle, the
 * frame's edge is about 40 px between neighbouring strokes before any are
 * left out, and at most three in five are drawn. Widths are at the frame's
 * edge, in pixels at 1080 lines: a stroke tapers from there to a point. */
const LINE_COUNT = 120;
const LINE_SHARE_SLOW = 0.3;
const LINE_SHARE_FAST = 0.62;
const LINE_WEIGHT = 12;
const IMPACT_COUNT = 90;
const IMPACT_SHARE = 0.7;
const IMPACT_WEIGHT = 14;

/*
 * Where a stroke may start, as the elliptical distance from the centre.
 * The speed lines reach from 0.95 at the least speed to 0.62 at full; the
 * impact frame's to 0.52. Both over 0.471, the centre third's corner: see
 * THE PERIPHERY ONLY above.
 */
const STROKE_REACH_MIN = 0.52;
const LINES_REACH_SLOW = 0.95;
const LINES_REACH_FAST = 0.62;

/*
 * THE FOCUS stays inside the centre third. Where the craft is going is
 * usually there anyway; when it is not (a slide, a drift, a climb out of
 * a dive) the vanishing point runs off towards the edge, where the strokes
 * are, and strokes converging on a point among themselves are a knot and
 * not a direction. So the point is held to the centre third's box and the
 * strokes still lean the right way.
 */
const FOCUS_BOX_Y = 1 / 6;

/* Smoothing, in milliseconds: the amount rises faster than it falls, so a
 * dive reads at once and a flare does not snap the lines off. */
const LINES_RISE_MS = 140;
const LINES_FALL_MS = 320;
const FOCUS_MS = 90;

/* Each stroke is redrawn this many times a second, each at its own moment,
 * the way an animator redraws speed lines on every other frame. Frozen when
 * the system asks for reduced motion. */
const LINES_REDRAW_HZ = 10;

/*
 * THE IMPACT FRAME. A crash holds the last picture before the hit for
 * IMPACT_HOLD_MS, re-inked, then lets it go over IMPACT_RELEASE_MS while
 * the shell has already set the craft down. 67 ms is two frames of an
 * anime cut timed at 30, a little over one and a half at 24: long enough to
 * read on any display, short enough to be a beat and not a pause.
 *
 * GENTLE, because a flash is a photosensitivity question:
 *   - never a white flash: the dark half goes to ink and the light half
 *     to the paper tone on a curve that darkens its mid tones and keeps
 *     its lightest at their own brightness, so the frame gains contrast
 *     and loses a little light: no pixel's luminance rises by more than
 *     two percent of white;
 *   - the re-inked picture is mixed in at most IMPACT_MIX, so the scene
 *     always shows through;
 *   - the release is a fade, not a cut, so the return is not a second
 *     change of the same size in the other direction;
 *   - at most one every IMPACT_EVERY_MS, so at most half a flash a
 *     second, where the WCAG guideline's line is three;
 *   - its own switch in Settings, Clean FPV, and off whenever the system
 *     asks for reduced motion.
 */
export const IMPACT_HOLD_MS = 67;
export const IMPACT_RELEASE_MS = 240;
export const IMPACT_EVERY_MS = 2000;
const IMPACT_MIX = 0.8;

/* The paper of the impact frame: the shell's cream (index.html, --cream). */
const PAPER = new THREE.Color(0xf3ead4);

/* The screentone's pitch at 1080 lines, in canvas pixels, and how dark a
 * dot is: the ink it is mixed toward, and how far. */
const TONE_PITCH_1080 = 6;
const TONE_DEPTH = 0.55;

/*
 * THE DARKEST CEL BAND, as the grade can see it. The grade has a colour and
 * not a material, so the band is read off the scene's own linear luminance
 * before the grade: the toon ramps' first stop (80 to 96 of 255 of the sun,
 * src/maps/city/vendored/core/toon.js) on the kit's mid tones lands under
 * TONE_BAND_HI, and the tone is full depth under TONE_BAND_LO. A pale wall
 * in its shadow band is lighter than that and is left alone, which is the
 * manga's way too: tone goes into the deep shadows, not every shaded face.
 */
const TONE_BAND_LO = 0.05;
const TONE_BAND_HI = 0.09;

/* ------------------------------------------------------------------ *
 * The shaders.
 * ------------------------------------------------------------------ */

/* The grade's lines this finds, exactly as the vendored file has them. */
const GRADE_HEAD_AT = 'varying vec2 vUv;';
const GRADE_LUMA = 'float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );';
const GRADE_OUT = 'gl_FragColor = vec4( linearToSRGB( max( c, vec3( 0.0 ) ) ), 1.0 );';

const GRADE_HEAD = /* glsl */ `
    uniform float uMangaLines;
    uniform float uMangaImpact;
    uniform float uMangaTone;
    uniform vec2 uMangaFocus;
    uniform vec3 uMangaFrame;
    uniform float uMangaSeed;
    uniform vec3 uMangaInk;
    uniform vec3 uMangaPaper;

    /* A hash with no sine in it: a sine's precision is the driver's, and
     * a stroke should be the same stroke on every GPU. */
    float mangaHash( float p ) {
      p = fract( p * 0.1031 );
      p *= p + 33.33;
      p *= p + p;
      return fract( p );
    }

    /*
     * Radial strokes about f. q is the pixel in frame units (the frame's
     * height is 1, its centre 0) and en its elliptical distance from the
     * centre (1 at the middle of each edge). count strokes round a turn,
     * the share amount of them drawn, reaching in to between reach and the
     * edge, weight pixels wide at the edge and tapering to nothing at the
     * tip. clock re-rolls each stroke at its own moment.
     */
    float mangaStrokes( vec2 q, vec2 f, float en, float count, float amount,
                        float reach, float weight, float seed, float clock ) {
      vec2 d = q - f;
      float r = length( d ) + 1e-4;
      float u = ( atan( d.y, d.x ) * 0.15915494 + 0.5 ) * count;
      float i = floor( u );
      float epoch = floor( clock + mangaHash( i * 0.618 + seed ) );
      float h1 = mangaHash( i * 1.37 + epoch * 17.31 + seed );
      float h2 = mangaHash( i * 2.91 + epoch * 5.77 + seed * 3.1 );
      float h3 = mangaHash( i * 4.17 + epoch * 9.13 + seed * 1.7 );
      float inner = mix( reach, 1.02, h2 * h2 );
      float along = smoothstep( inner, inner + max( 0.12, ( 1.02 - inner ) * 0.85 ), en );
      float w = weight * mix( 0.3, 1.0, h3 ) * along;
      float off = abs( fract( u ) - 0.5 - ( h3 - 0.5 ) * 0.4 );
      float px = off * 6.2831853 / count * r * uMangaFrame.y;
      float cov = 1.0 - smoothstep( w * 0.5 - 0.5, w * 0.5 + 0.6, px );
      return cov * step( h1, amount ) * smoothstep( inner, inner + 0.03, en );
    }
`;

const GRADE_BODY = /* glsl */ `
      vec2 mangaQ = ( vUv - 0.5 ) * vec2( uMangaFrame.x, 1.0 );
      float mangaEn = length( ( vUv - 0.5 ) * 2.0 );
      float mangaPx = uMangaFrame.y / 1080.0;

      /* THE IMPACT FRAME: the dark half to ink, the light half to paper on
       * a curve that only ever darkens it (a pixel at the paper's own
       * brightness stays there, one below it goes further below), heavy
       * strokes round the edge. More contrast, never more light: see the
       * header's GENTLE. */
      if ( uMangaImpact > 0.0 ) {
        float li = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
        float lp = dot( uMangaPaper, vec3( 0.2126, 0.7152, 0.0722 ) );
        float t = smoothstep( 0.1, 0.12, li );
        vec3 paper = uMangaPaper * min( 1.0, pow( li / lp, 1.2 ) + 0.02 );
        c = mix( c, mix( uMangaInk, paper, t ), uMangaImpact * ${IMPACT_MIX.toFixed(2)} );
        if ( mangaEn > ${STROKE_REACH_MIN.toFixed(2)} ) {
          float s = mangaStrokes( mangaQ, uMangaFocus, mangaEn, ${IMPACT_COUNT.toFixed(1)}, ${IMPACT_SHARE.toFixed(2)},
                                  ${STROKE_REACH_MIN.toFixed(2)}, ${IMPACT_WEIGHT.toFixed(1)} * mangaPx, uMangaSeed, 0.0 );
          c = mix( c, uMangaInk, s * uMangaImpact );
        }
      }

      /* SPEED LINES, only where a stroke can be: no stroke starts inside
       * the reach, so the pixels there skip the arithmetic: about six in
       * ten of the frame at 25 m/s, three in ten at full speed. */
      if ( uMangaLines > 0.0
           && mangaEn > mix( ${LINES_REACH_SLOW.toFixed(2)}, ${LINES_REACH_FAST.toFixed(2)}, uMangaLines ) ) {
        float s = mangaStrokes( mangaQ, uMangaFocus, mangaEn, ${LINE_COUNT.toFixed(1)},
                                mix( ${LINE_SHARE_SLOW.toFixed(2)}, ${LINE_SHARE_FAST.toFixed(2)}, uMangaLines ),
                                mix( ${LINES_REACH_SLOW.toFixed(2)}, ${LINES_REACH_FAST.toFixed(2)}, uMangaLines ),
                                ${LINE_WEIGHT.toFixed(1)} * mangaPx, 0.0, uMangaFrame.z );
        c = mix( c, uMangaInk, s * mix( 0.55, 0.9, uMangaLines ) );
      }

      /* The darkest cel band, for the screentone the fxaa pass draws: the
       * alpha is one less the band's depth, so an untouched frame is one.
       * The ink pass's own lines are left out: they are as dark as the
       * band, and toned they would crawl along every moving silhouette. */
      float mangaBand = uMangaTone * ( 1.0 - smoothstep( ${TONE_BAND_LO.toFixed(3)}, ${TONE_BAND_HI.toFixed(3)}, l ) )
        * smoothstep( 0.03, 0.08, distance( mangaIn, uMangaInk ) );
      gl_FragColor = vec4( linearToSRGB( max( c, vec3( 0.0 ) ) ), 1.0 - mangaBand );
`;

/* The fxaa pass's lines. */
const FXAA_HEAD_AT = 'varying vec2 vUv;';
const FXAA_FETCH = 'vec3 cM = texture2D( tDiffuse, vUv ).rgb;';
const FXAA_OUT = 'gl_FragColor = vec4( ( lB < lMin || lB > lMax ) ? rgbA : rgbB, 1.0 );';

const FXAA_HEAD = /* glsl */ `
    uniform float uMangaTone;
    uniform float uMangaPitch;
    uniform vec3 uMangaToneInk;
`;

const FXAA_FETCH_NEW = /* glsl */ `vec4 cM4 = texture2D( tDiffuse, vUv );
      vec3 cM = cM4.rgb;`;

/*
 * THE SCREENTONE: a 45 degree dot grid at the canvas's own pixels, so no
 * later resample turns it to moire, with each dot as big as the pixel
 * under it is deep in the darkest band. The radius is the pixel's own, not
 * the cell's, so where the band's edge moves the dots are cut along it
 * rather than popping on and off whole.
 */
const FXAA_OUT_NEW = /* glsl */ `vec3 mangaOut = ( lB < lMin || lB > lMax ) ? rgbA : rgbB;
      if ( uMangaTone > 0.0 ) {
        float band = 1.0 - cM4.a;
        vec2 g = gl_FragCoord.xy / uMangaPitch;
        vec2 cell = fract( vec2( g.x + g.y, g.x - g.y ) * 0.70710678 ) - 0.5;
        float dist = length( cell ) * uMangaPitch;
        float rad = sqrt( band ) * 0.36 * uMangaPitch;
        float dotCov = 1.0 - smoothstep( rad - 0.6, rad + 0.6, dist );
        mangaOut = mix( mangaOut, uMangaToneInk, dotCov * step( 0.02, band ) * ${TONE_DEPTH.toFixed(2)} * uMangaTone );
      }
      gl_FragColor = vec4( mangaOut, 1.0 );`;

/*
 * Edit a vendored Pipeline's own grade and fxaa materials. Returns
 * { ok, tone, grade, fxaa }: ok when the grade took the edit (speed lines
 * and the impact frame), tone when the fxaa pass did too. Called once, from
 * the pipeline's constructor, before either material has compiled.
 */
export function mangaPipeline(pipeline) {
  const g = pipeline.grade && pipeline.grade.mat;
  const out = { ok: false, tone: false, grade: null, fxaa: null };
  if (!g) {
    return out;
  }
  const gs = g.fragmentShader;
  if (!(gs.includes(GRADE_HEAD_AT) && gs.includes(GRADE_LUMA) && gs.includes(GRADE_OUT))) {
    return out;
  }
  g.fragmentShader = gs
    .replace(GRADE_HEAD_AT, `${GRADE_HEAD_AT}\n${GRADE_HEAD}`)
    .replace(GRADE_LUMA, `${GRADE_LUMA}\n      vec3 mangaIn = c;`)
    .replace(GRADE_OUT, GRADE_BODY);
  Object.assign(g.uniforms, {
    uMangaLines: { value: 0 },
    uMangaImpact: { value: 0 },
    uMangaTone: { value: 0 },
    uMangaFocus: { value: new THREE.Vector2() },
    uMangaFrame: { value: new THREE.Vector3(16 / 9, 1080, 0) },
    uMangaSeed: { value: 0 },
    uMangaInk: { value: new THREE.Color(0x39324f) },
    uMangaPaper: { value: PAPER.clone() },
  });
  g.needsUpdate = true;
  out.ok = true;
  out.grade = g.uniforms;

  const f = pipeline.fxaa && pipeline.fxaa.mat;
  const fs = f ? f.fragmentShader : '';
  if (f && fs.includes(FXAA_HEAD_AT) && fs.includes(FXAA_FETCH) && fs.includes(FXAA_OUT)) {
    f.fragmentShader = fs
      .replace(FXAA_HEAD_AT, `${FXAA_HEAD_AT}\n${FXAA_HEAD}`)
      .replace(FXAA_FETCH, FXAA_FETCH_NEW)
      .replace(FXAA_OUT, FXAA_OUT_NEW);
    Object.assign(f.uniforms, {
      uMangaTone: { value: 0 },
      uMangaPitch: { value: TONE_PITCH_1080 },
      uMangaToneInk: { value: new THREE.Color(0x39324f) },
    });
    f.needsUpdate = true;
    out.tone = true;
    out.fxaa = f.uniforms;
  }
  return out;
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

/* The screentone's ink is written after the sRGB transfer, so it is taken
 * to sRGB here from the linear colour the ink pass uses. */
function linearToSrgb(v) {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * (v ** (1 / 2.4)) - 0.055;
}

/*
 * The layer's state from frame to frame: the smoothed amount of speed
 * lines, the smoothed focus, and the impact frame's clock. One per shell.
 * The shell calls tick once a frame, impact on a crash, holding while it
 * places the camera, and frame just before the post chain draws.
 */
export class MangaLayer {
  constructor() {
    this.clockMs = 0;
    /* A harness can hold the clock at a named time, so a picture of the
     * impact frame is the same picture on every run. Null runs free. */
    this.clockAt = null;
    this.lines = 0;
    this.fx = 0;
    this.fy = 0;
    this.impactAt = -1e9;
    this.impacts = 0;
    this.seed = 0;
    this.holdPos = new THREE.Vector3();
    this.holdQuat = new THREE.Quaternion();
    this.holdSet = false;
    /* The harness's override for a measurement at a fixed camera:
     * { lines, focus: [x, y], impact }, any of them, or null. */
    this.force = null;
    this.shown = { lines: 0, impact: 0, tone: 0, focus: [0, 0], speed: 0 };
  }

  tick(dtMs) {
    if (this.clockAt != null) {
      this.clockMs = this.clockAt;
    } else {
      this.clockMs += dtMs > 0 ? dtMs : 0;
    }
  }

  /*
   * A crash. Starts an impact frame holding `camera`'s pose, unless one
   * began under IMPACT_EVERY_MS ago, and returns whether it did. Each one
   * has its own strokes: the seed is new every time, so no two impact
   * frames are the same drawing.
   */
  impact(camera) {
    if (this.clockMs - this.impactAt < IMPACT_EVERY_MS) {
      return false;
    }
    this.impactAt = this.clockMs;
    this.impacts += 1;
    this.seed = ((this.impacts * 0.6180339887) % 1) * 97.0 + 3.0;
    if (camera) {
      this.holdPos.copy(camera.position);
      this.holdQuat.copy(camera.quaternion);
      this.holdSet = true;
    } else {
      this.holdSet = false;
    }
    return true;
  }

  /* Whether the camera is held on the moment of the hit. */
  holding() {
    const t = this.clockMs - this.impactAt;
    return this.holdSet && t >= 0 && t < IMPACT_HOLD_MS;
  }

  impactAmount() {
    const t = this.clockMs - this.impactAt;
    if (t < 0 || t >= IMPACT_HOLD_MS + IMPACT_RELEASE_MS) {
      return 0;
    }
    if (t < IMPACT_HOLD_MS) {
      return 1;
    }
    const u = 1 - (t - IMPACT_HOLD_MS) / IMPACT_RELEASE_MS;
    return u * u;
  }

  /*
   * The uniforms for this frame. `s`:
   *   lines    the speed lines may be drawn (a freestyle map, manga on,
   *            flying, the FPV camera)
   *   impact   the impact frame may be drawn
   *   tone     the screentone may be drawn (and the tier is High)
   *   still    the system asks for reduced motion: the strokes stop
   *            redrawing themselves
   *   speed    the craft's speed, m/s
   *   vel      its velocity in the camera's frame (looking down -z)
   *   tanHalf  the tangent of half the camera's vertical field of view
   *   dtMs     the frame's wall clock step
   * A post chain without the edit (the race field, or a vendored file this
   * could not edit) is left alone.
   */
  frame(post, s) {
    const m = post && post.manga;
    const dt = s.dtMs > 0 ? s.dtMs : 0;
    let want = 0;
    if (s.lines && s.speed > LINES_FROM) {
      want = clamp01((s.speed - LINES_FROM) / (LINES_FULL - LINES_FROM));
    }
    const tau = want > this.lines ? LINES_RISE_MS : LINES_FALL_MS;
    this.lines += (want - this.lines) * (1 - Math.exp(-dt / tau));
    if (this.lines < 0.002 && want === 0) {
      this.lines = 0;
    }

    /* Where the craft is going, on the screen: the velocity's vanishing
     * point, or its opposite's when flying backwards, which draws the same
     * radial lines. Kept where it was while the craft is nearly still. */
    const v = s.vel;
    const vl = v ? Math.hypot(v.x, v.y, v.z) : 0;
    if (vl > 1 && s.tanHalf > 0) {
      let z = -v.z;
      let x = v.x;
      let y = v.y;
      if (z < 0) {
        z = -z;
        x = -x;
        y = -y;
      }
      z = Math.max(z, vl * 0.02);
      const aspect = post && post.size ? post.size.x / Math.max(1, post.size.y) : 16 / 9;
      const bx = (aspect * FOCUS_BOX_Y);
      const tx = Math.max(-bx, Math.min(bx, (x / z) * (0.5 / s.tanHalf)));
      const ty = Math.max(-FOCUS_BOX_Y, Math.min(FOCUS_BOX_Y, (y / z) * (0.5 / s.tanHalf)));
      const k = 1 - Math.exp(-dt / FOCUS_MS);
      this.fx += (tx - this.fx) * k;
      this.fy += (ty - this.fy) * k;
    }

    let lines = this.lines;
    let impact = s.impact ? this.impactAmount() : 0;
    let fx = this.fx;
    let fy = this.fy;
    const f = this.force;
    if (f) {
      if (f.lines != null) {
        lines = clamp01(Number(f.lines));
      }
      if (f.impact != null) {
        impact = clamp01(Number(f.impact));
      }
      if (Array.isArray(f.focus)) {
        fx = Number(f.focus[0]) || 0;
        fy = Number(f.focus[1]) || 0;
      }
    }
    const tone = s.tone && m && m.tone && post.enabled && post.enabled.fxaa ? 1 : 0;
    this.shown.lines = lines;
    this.shown.impact = impact;
    this.shown.tone = tone;
    this.shown.focus[0] = fx;
    this.shown.focus[1] = fy;
    this.shown.speed = s.speed;
    if (!m || !m.ok) {
      return;
    }

    const g = m.grade;
    g.uMangaLines.value = lines;
    g.uMangaImpact.value = impact;
    g.uMangaTone.value = tone;
    g.uMangaFocus.value.set(fx, fy);
    /* The grade draws into the fxaa pass's target when there is one and
     * onto the canvas when there is not: the strokes' widths are in the
     * pixels of whichever it is. */
    const outH = post.enabled && post.enabled.fxaa
      ? post.size.y
      : (post.renderer ? post.renderer.domElement.height : post.size.y);
    g.uMangaFrame.value.set(
      post.size.x / Math.max(1, post.size.y),
      outH,
      s.still ? 0 : (this.clockMs * 0.001 * LINES_REDRAW_HZ) % 4096,
    );
    g.uMangaSeed.value = this.seed;
    /* The map's own ink, so the strokes are the same ink as the lines the
     * ink pass draws at every time of day. */
    const ink = post.ink && post.ink.mat && post.ink.mat.uniforms.uInk
      ? post.ink.mat.uniforms.uInk.value
      : null;
    if (ink) {
      g.uMangaInk.value.copy(ink);
    }
    if (m.fxaa) {
      m.fxaa.uMangaTone.value = tone;
      if (tone) {
        const h = post.renderer ? post.renderer.domElement.height : 1080;
        m.fxaa.uMangaPitch.value = Math.max(4, TONE_PITCH_1080 * (h / 1080));
        const c = g.uMangaInk.value;
        m.fxaa.uMangaToneInk.value.setRGB(linearToSrgb(c.r), linearToSrgb(c.g), linearToSrgb(c.b));
      }
    }
  }
}
