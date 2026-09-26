/*
 * manga.js: the manga layer's picture, Stage F (FREESTYLE-MAPS-PLAN.md
 * section 3.2 item 1): speed lines.
 *
 * NO NEW PASS. It is folded into the grade, a pass the freestyle maps
 * already run, because the post chain has a budget (src/render/budget.js)
 * and a full screen pass is the most expensive thing that can be added to
 * it.
 *
 * Nothing here samples a texture or runs a loop, so the budget's P3 (full
 * resolution passes) and P4 (taps per pixel) cannot move, and none of it
 * allocates a target, so P5 cannot either. What it costs is arithmetic in
 * one fragment shader, and the strokes' arithmetic runs only where a
 * stroke can be: the outer ring of the frame.
 *
 * THE VENDORED PIPELINE STAYS BYTE IDENTICAL. The grade belongs to
 * src/maps/city/vendored/core/post.js. mangaPipeline edits the pipeline's
 * OWN copy of its material, by finding exact lines and adding after them,
 * the way BuiltPipeline edits its ink (src/maps/built/index.js,
 * INK_LINEAR). If a vendored update ever changes a line this looks for,
 * the edit finds nothing, the map draws exactly as it did before Stage F,
 * and `ok` says so. So there is no PATCH-*.diff for this: nothing under
 * vendored/ is changed.
 *
 * FREESTYLE ONLY, BY CONSTRUCTION. Only the town's pipeline and a built
 * map's call mangaPipeline. The race field's chain (src/render/post.js) has
 * never heard of this file, so a race track is clean whatever any setting
 * says. On a freestyle map the shell draws it only when ui.manga is true,
 * which Clean FPV makes false (src/ui/ui.js, syncManga).
 *
 * THE PERIPHERY ONLY (section 3.3). A stroke is drawn only where the
 * pixel's elliptical distance from the frame's centre, one at the middle of
 * each edge, is at least LINES_REACH_FAST. The centre third of the frame is
 * the box inside a third of that distance on both axes, whose corners are
 * at the square root of two ninths, 0.471. Every stroke starts outside
 * 0.62, so none can reach the centre third, at any speed or focus.
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

/*
 * Where a stroke may start, as the elliptical distance from the centre:
 * from 0.95 at the least speed to 0.62 at full, both over 0.471, the centre
 * third's corner. See THE PERIPHERY ONLY above.
 */
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


/* ------------------------------------------------------------------ *
 * The shaders.
 * ------------------------------------------------------------------ */

/* The grade's lines this finds, exactly as the vendored file has them. */
const GRADE_HEAD_AT = 'varying vec2 vUv;';
const GRADE_OUT = 'gl_FragColor = vec4( linearToSRGB( max( c, vec3( 0.0 ) ) ), 1.0 );';

const GRADE_HEAD = /* glsl */ `
    uniform float uMangaLines;
    uniform vec2 uMangaFocus;
    uniform vec3 uMangaFrame;
    uniform vec3 uMangaInk;

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

      /* SPEED LINES, only where a stroke can be. */
      if ( uMangaLines > 0.0 && mangaEn > ${LINES_REACH_FAST.toFixed(2)} ) {
        float s = mangaStrokes( mangaQ, uMangaFocus, mangaEn, ${LINE_COUNT.toFixed(1)},
                                mix( ${LINE_SHARE_SLOW.toFixed(2)}, ${LINE_SHARE_FAST.toFixed(2)}, uMangaLines ),
                                mix( ${LINES_REACH_SLOW.toFixed(2)}, ${LINES_REACH_FAST.toFixed(2)}, uMangaLines ),
                                ${LINE_WEIGHT.toFixed(1)} * mangaPx, 0.0, uMangaFrame.z );
        c = mix( c, uMangaInk, s * mix( 0.55, 0.9, uMangaLines ) );
      }

      gl_FragColor = vec4( linearToSRGB( max( c, vec3( 0.0 ) ) ), 1.0 );
`;


/*
 * Edit a vendored Pipeline's own grade material. Returns { ok, grade }: ok
 * when the grade took the edit. Called once, from the pipeline's
 * constructor, before the material has compiled.
 */
export function mangaPipeline(pipeline) {
  const g = pipeline.grade && pipeline.grade.mat;
  const out = { ok: false, grade: null };
  if (!g) {
    return out;
  }
  const gs = g.fragmentShader;
  if (!(gs.includes(GRADE_HEAD_AT) && gs.includes(GRADE_OUT))) {
    return out;
  }
  g.fragmentShader = gs
    .replace(GRADE_HEAD_AT, `${GRADE_HEAD_AT}\n${GRADE_HEAD}`)
    .replace(GRADE_OUT, GRADE_BODY);
  Object.assign(g.uniforms, {
    uMangaLines: { value: 0 },
    uMangaFocus: { value: new THREE.Vector2() },
    uMangaFrame: { value: new THREE.Vector3(16 / 9, 1080, 0) },
    uMangaInk: { value: new THREE.Color(0x39324f) },
  });
  g.needsUpdate = true;
  out.ok = true;
  out.grade = g.uniforms;
  return out;
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

/*
 * The layer's state from frame to frame: the smoothed amount of speed
 * lines, the smoothed focus, and the strokes' clock. One per shell. The
 * shell calls tick once a frame and frame just before the post chain
 * draws.
 */
export class MangaLayer {
  constructor() {
    this.clockMs = 0;
    /* A harness can hold the clock at a named time, so a picture of the
     * strokes is the same picture on every run. Null runs free. */
    this.clockAt = null;
    this.lines = 0;
    this.fx = 0;
    this.fy = 0;
    /* The harness's override for a measurement at a fixed camera:
     * { lines, focus: [x, y] }, either of them, or null. */
    this.force = null;
    this.shown = { lines: 0, focus: [0, 0], speed: 0 };
  }

  tick(dtMs) {
    if (this.clockAt != null) {
      this.clockMs = this.clockAt;
    } else {
      this.clockMs += dtMs > 0 ? dtMs : 0;
    }
  }

  /*
   * The uniforms for this frame. `s`:
   *   lines    the speed lines may be drawn (a freestyle map, manga on,
   *            flying, the FPV camera)
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
    let fx = this.fx;
    let fy = this.fy;
    const f = this.force;
    if (f) {
      if (f.lines != null) {
        lines = clamp01(Number(f.lines));
      }
      if (Array.isArray(f.focus)) {
        fx = Number(f.focus[0]) || 0;
        fy = Number(f.focus[1]) || 0;
      }
    }
    this.shown.lines = lines;
    this.shown.focus[0] = fx;
    this.shown.focus[1] = fy;
    this.shown.speed = s.speed;
    if (!m || !m.ok) {
      return;
    }

    const g = m.grade;
    g.uMangaLines.value = lines;
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
    /* The map's own ink, so the strokes are the same ink as the lines the
     * ink pass draws at every time of day. */
    const ink = post.ink && post.ink.mat && post.ink.mat.uniforms.uInk
      ? post.ink.mat.uniforms.uInk.value
      : null;
    if (ink) {
      g.uMangaInk.value.copy(ink);
    }
  }
}
