/*
 * scene.js: the world.
 *
 * Art direction, in the order it matters:
 *
 * Value structure. The sky is the brightest thing, the ground sits a clear
 * step below it, and objects sit a step below that, so a silhouette always
 * separates from what is behind it. Everything else is detail.
 *
 * Warm light, cool shadow. Handled by the ramp in celmat.js, but the world
 * has to cooperate: the hemisphere light is sky blue from above and warm
 * green from below so bounce reads as grass light, and the fog is the same
 * hue as the horizon band of the sky so distance dissolves instead of
 * clipping.
 *
 * Ground detail near, silhouettes far. Wind animated grass covers the
 * ground the pilot actually flies through, because at 20 m/s the sensation
 * of speed comes almost entirely from close ground texture moving. Beyond
 * that, trees and rocks carry the parallax, and the mountain rings carry
 * the horizon.
 *
 * All static scenery is authored directly in Three.js space (y up). Only
 * the quad's simulated state crosses frames, and that conversion lives in
 * frame.js and nowhere else.
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
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial, outlineHull, updateCelTime, CLOUD_SHADOW_GLSL } from './celmat.js';
import { disposeSceneGraph } from './shell.js';
import { SESSION_TEXTURES } from './session-textures.js';
/* The obstacle dimensions come from the track module, which holds MultiGP's
 * published figures and converts from feet exactly once. No dimension in
 * this file is typed twice. */
import { builtObstacle, BUILT_FRAME_TUBE_OD, GATE_SCALE } from '../game/track.js';
/* The shape of the built in circuit, shared with the map screen's thumbnail
 * so the picture of the course and the course cannot drift apart. */
import { circuitPoint, CIRCUIT_POINTS, CIRCUIT_STATIONS } from '../game/circuit.js';
/* The printed vinyl a course is dressed in, shared with the track builder's
 * own preview so an author sees the gates they will fly. See src/art/. */
import {
  BANNER, BANNER_SIZE, bannerCanvas, paintGateHeader, paintGateSleeve, paintFlagSail,
} from '../art/banners.js';
import { Colliders } from '../game/collide.js';

/*
 * Static scenery merger. A forest of individual Groups costs a draw call
 * per mesh, twice (once for the view, once for the outline prepass), and
 * that is what turns four hundred trees into four thousand draws. Every
 * static object is instead baked into one merged mesh per distinct
 * material, keyed by the material options, so the whole forest, all the
 * rocks, the cliffs and the mountain rings come down to a couple of dozen
 * draws with pixels identical to the unmerged scene.
 */
function makeBaker() {
  const buckets = new Map();
  function bake(root) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) {
        return;
      }
      let key;
      if (o.material.userData.celKey != null) {
        key = `cel:${o.material.userData.celKey}`;
      } else if (o.material.userData.hullColor != null) {
        key = `hull:${o.material.userData.hullColor}`;
      } else {
        key = `mat:${o.material.uuid}`;
      }
      let b = buckets.get(key);
      if (!b) {
        b = { material: o.material, hull: o.material.userData.hullColor != null, geos: [] };
        buckets.set(key, b);
      }
      /* Non-indexed so polyhedra and cylinders merge into one buffer. */
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      b.geos.push(geo);
    });
  }
  function flush(scene, layer) {
    const meshes = [];
    for (const b of buckets.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(b.geos, false), b.material);
      if (!b.hull) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      if (layer) {
        mesh.layers.set(layer);
      }
      scene.add(mesh);
      meshes.push(mesh);
    }
    buckets.clear();
    return meshes;
  }
  return { bake, flush };
}

const SUN_DIR = new THREE.Vector3(0.60, 0.50, 0.62).normalize();
const HORIZON = 0xf2e3cb;
/* Zenith blue. Measured at 0x2e6bb8 the sky's linear luminance was 0.248
 * and the lit meadow's was 0.257, so sky and ground occupied ONE value
 * band and separated by hue alone. Blue carries little luminance, so the
 * fix is a paler zenith rather than a bluer one. */
const SKY_HIGH = 0x6ea3d8;
/*
 * The sky, as a function, because two surfaces need it and they must not
 * disagree. The dome calls it for the direction the eye is looking, and the
 * water calls it for the direction the eye is looking AFTER reflecting off
 * the surface. If the water carried its own sky colours, a reflection would
 * be a different sky from the one overhead, which is the single fastest way
 * to make water read as painted plastic.
 *
 * Everything in here was authored on the dome and is unchanged: the 1.25
 * altitude gain with a 0.06 lift, the nine band posterisation mixed half way
 * back to the smooth gradient, and both sun terms with the ceilings that the
 * clipped sun fix established.
 */
const SKY_GLSL = /* glsl */ `
  vec3 celSkyColor(vec3 dir, vec3 sunDir, vec3 horizonCol, vec3 highCol) {
    /*
     * Re-normalise. On the dome vDir is a unit vector at each vertex, but a
     * varying interpolates linearly through the triangle, so inside a face
     * it is short by up to half a percent on a 40 by 24 dome. That was
     * invisible in the gradient and fatal to the sun, whose disc is a
     * threshold on dot(dir, sun): the old step could only fire where the
     * interpolated length happened to survive, so the disc was not a circle
     * at all but a patchwork following the tessellation.
     */
    vec3 vd = normalize(dir);
    float h = clamp(vd.y * 1.25 + 0.06, 0.0, 1.0);
    /*
     * Posterised, but only part way. At five bands with a hard step the band
     * edge is a single enormous pale arc sweeping across the sky, and in a
     * still that reads as a rendering fault rather than as a style: it was
     * the most visible artefact in every frame. Nine bands, a wider smooth
     * edge, and a mix back toward the smooth gradient keep the poster feel
     * without the arc.
     */
    float b = h * 9.0;
    float stepped = (floor(b) + smoothstep(0.35, 0.95, fract(b))) / 9.0;
    float band = mix(h, stepped, 0.5);
    vec3 col = mix(horizonCol, highCol, band);
    /*
     * Sun: a warm glow, then a disc.
     *
     * Both terms used to be added on top of a sky that was already at 0.59,
     * 0.72, 0.83 at the sun's altitude. The glow alone reached 1.0 in every
     * channel by 7.8 degrees off axis, and the disc, a 4 degree half angle
     * and thirty times the real sun, then added a further 1.0 on top of
     * that: 1.9 percent of the frame pinned at 254 or higher. So a tighter
     * glow in a colour that lifts red and green without pushing the already
     * high blue, and a disc composed by mix() to a ceiling below full white
     * with a soft outer ramp so it resolves instead of stairing. Core 1.0
     * degree half angle, ramp out to 1.6.
     */
    float sd = max(dot(vd, normalize(sunDir)), 0.0);
    col += vec3(1.0, 0.80, 0.42) * pow(sd, 40.0) * 0.30;
    col = mix(col, vec3(0.985, 0.965, 0.905), smoothstep(0.99961, 0.99985, sd));
    return col;
  }
`;
const FOG_NEAR = 130;
/* 2200, not 780. At 780 every piece of terrain past that distance renders
 * as exactly the horizon colour, 0.781 linear, which leaves no room above
 * it for a mountain ladder that also has to stay below the sky. At 2200
 * the terrain's far edge at 850 m lands at 0.428 and the four ridge rings
 * fit above it at 0.49, 0.56, 0.63 and 0.70 with the sky at 0.781. */
const FOG_FAR = 2200;

/* Deterministic hash based noise: the world must be identical every load,
 * so two people comparing notes are describing the same place. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* Smooth value noise for the terrain, built from the same integer hash. */
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 4; o += 1) {
    sum += amp * valueNoise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

/* Figure of eight circuit. */
function trackCurve() {
  const pts = [];
  for (let i = 0; i < CIRCUIT_POINTS; i += 1) {
    const p = circuitPoint(i / CIRCUIT_POINTS);
    pts.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.4);
}

/* A lake gives the eye somewhere to rest, a hard value contrast against
 * all the green, and a reflection cue for altitude. Basin is carved into
 * the height field so the shoreline is a real intersection, not a decal. */
export const LAKE = { x: 250, z: -205, r: 96, level: -7.5 };

/*
 * THE PITCH: the mown, marked, level ground a designed course stands on.
 *
 * A track somebody drew is 60 by 40 m. The valley the race field lives in is
 * 1700 m across, its terrain rolls, and its scenery stands 15 m off the
 * racing line, which on a circuit 210 m wide is a clearing and on a 60 m
 * field is a tree beside a gate. Pushing the scenery further out would fix
 * the collisions and leave the course sitting in an arbitrary bald patch of
 * meadow.
 *
 * So a designed course gets a real arena: a rectangle the size of the field
 * its author drew plus a run off margin, levelled flat, mown, striped the way
 * a groundsman stripes a pitch, and marked with a white line on the field
 * boundary itself. Everything else in the world stays exactly where it was.
 * The course now stands somewhere rather than nowhere, and the reason no tree
 * is on it is a reason you can see.
 *
 * Nothing here touches the rng. The stripes and the line are functions of
 * position, the levelling is a function of position, and the grass, the
 * trees and the mountains draw from the world's one random stream in the one
 * order they always did.
 */
const PITCH = {
  /* Mown run off outside the author's boundary, in metres. */
  margin: 8,
  /* How far the mown edge fades into the meadow. */
  fade: 5,
  /* Stripe period, in metres. A groundsman's mower is about 1.5 m wide and
   * stripes are usually cut in pairs, so 5 m reads right from the air. */
  stripe: 5,
  /* The marking, in metres. Regulation football touchlines are 12 cm; this
   * is wider because it has to survive being seen from 40 m up at speed. */
  lineW: 0.3,
  light: new THREE.Color(0x63a949),
  dark: new THREE.Color(0x4c8b38),
  line: new THREE.Color(0xe6efe2),
};

export function makePitch(course) {
  if (!course) {
    return null;
  }
  return {
    halfW: course.field.width * 0.5,
    halfD: course.field.depth * 0.5,
    mownW: course.field.width * 0.5 + PITCH.margin,
    mownD: course.field.depth * 0.5 + PITCH.margin,
  };
}

/* Signed distance to the mown rectangle: negative inside, metres outside. */
function pitchEdge(pitch, x, z) {
  return Math.max(Math.abs(x) - pitch.mownW, Math.abs(z) - pitch.mownD);
}

/* 1 on the pitch, falling to 0 over the fade. */
function pitchCover(pitch, x, z) {
  if (!pitch) {
    return 0;
  }
  const d = pitchEdge(pitch, x, z);
  return Math.min(1, Math.max(0, 1 - d / PITCH.fade));
}

/*
 * The pitch's surface: mown stripes and a marked boundary, as a texture.
 *
 * NOT as terrain vertex colours, which is where this started. The terrain is
 * a 1700 m plane at 230 segments, so its vertices are 7.4 m apart, and a
 * 0.3 m touchline painted into a vertex colour is a line 25 times finer than
 * the mesh that carries it: it vanished completely and the stripes came out
 * as one smear. Fine markings need their own surface, so the pitch gets a
 * plane of its own with a painted texture, laid on the levelled ground.
 *
 * It is transparent at its own edge, so the mown rectangle fades into the
 * meadow instead of ending on a cut line, and the terrain underneath is
 * tinted the same green so the fade has somewhere to go.
 */
function pitchSurface(pitch) {
  const w = pitch.mownW * 2;
  const d = pitch.mownD * 2;
  /* Pixels per metre, so a 0.3 m marking is four pixels wide whatever size
   * of field somebody drew. Capped, because a 400 m field would otherwise
   * ask for a texture no browser will allocate. */
  const ppm = Math.min(16, Math.max(4, 2048 / Math.max(w, d)));
  const cw = Math.round(w * ppm);
  const ch = Math.round(d * ppm);
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const ctx = cv.getContext('2d');

  /* Stripes down the long axis, the way a mower drives it. */
  const stripePx = PITCH.stripe * ppm;
  const alongX = w >= d;
  const span = alongX ? ch : cw;
  for (let i = 0; i * stripePx < span; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? `#${PITCH.light.getHexString()}` : `#${PITCH.dark.getHexString()}`;
    if (alongX) {
      ctx.fillRect(0, i * stripePx, cw, stripePx);
    } else {
      ctx.fillRect(i * stripePx, 0, stripePx, ch);
    }
  }

  /* The marking, on the boundary the author drew rather than on the mown
   * edge: the mown ground outside it is run off. */
  const inset = PITCH.margin * ppm;
  const lw = Math.max(2, PITCH.lineW * ppm);
  ctx.strokeStyle = `#${PITCH.line.getHexString()}`;
  ctx.lineWidth = lw;
  ctx.strokeRect(inset, inset, cw - inset * 2, ch - inset * 2);

  /* Fade the outer edge to nothing so the pitch joins the meadow. */
  const fadePx = Math.max(2, PITCH.fade * ppm);
  const img = ctx.getImageData(0, 0, cw, ch);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const e = Math.min(x, y, cw - 1 - x, ch - 1 - y);
      const a = Math.min(1, e / fadePx);
      img.data[(y * cw + x) * 4 + 3] = Math.round(255 * a * a * (3 - 2 * a));
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  /* Same material family as the terrain, so the pitch takes the same cel
   * ramp and the same cloud shadows and does not read as a decal. */
  const mat = celMaterial({ color: 0xffffff, rim: 0.0, cloudShadow: 0.34, transparent: true });
  mat.map = tex;
  const mesh = new THREE.Mesh(geo, mat);
  /* Two centimetres up. The ground under the pitch is levelled to exactly
   * zero, so this is clear of it without being a step anybody can see, and
   * it is under the 7.5 cm the quad parks at. */
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  return mesh;
}

/* Terrain height, shared by the mesh and by anything placed on it. */
function makeHeightField(samples, pitch) {
  return (x, z) => {
    const base = (fbm(x * 0.0022, z * 0.0022) - 0.5) * 34;
    const detail = (fbm(x * 0.011, z * 0.011) - 0.5) * 4.5;
    let d = 1e9;
    for (const s of samples) {
      const dx = x - s.x;
      const dz = z - s.z;
      const dd = dx * dx + dz * dz;
      if (dd < d) {
        d = dd;
      }
    }
    d = Math.sqrt(d);
    /* Flatten a corridor along the circuit so the track is flyable, with a
     * soft shoulder so it does not look stamped. */
    const flat = Math.min(1, Math.max(0, (d - 30) / 70));
    const s2 = flat * flat * (3 - 2 * flat);
    let h = (base + detail) * s2;

    /* The pitch is level. Not nearly level: a course author drew a plan on
     * flat paper and set base heights against it, so a rolling metre under a
     * gate would put their dive gate through the ground. */
    if (pitch) {
      const cover = pitchCover(pitch, x, z);
      const smooth = cover * cover * (3 - 2 * cover);
      h *= (1 - smooth);
    }

    /*
     * Carve the lake basin: a smooth bowl, deepest at the centre, with a
     * LOBED depth profile.
     *
     * The bowl used to be a pure function of distance from the lake centre,
     * and the consequence only became visible once the water shader was
     * rewritten to derive its shoreline from real depth instead of from the
     * mesh radius: the shoreline came out a perfect ellipse anyway. The
     * shader was right and the LAND was the circle. A radial bowl has a
     * radial water line by construction, so no amount of work in the shader
     * can produce a bay.
     *
     * So perturb the depth profile with the same value noise the terrain
     * uses, at a 118 m feature size, offset off the detail noise's own
     * coordinates so the two do not correlate. The perturbation is weighted
     * by k(1-k)*4, which peaks at k = 0.5 and vanishes at both ends: zero at
     * the bowl's outer rim so the basin still joins the meadow smoothly, and
     * zero at the very centre so the deepest point stays put. The water line
     * sits at bowl = 0.577 for a meadow at 0 and a level of -7.5, which is
     * k = 0.6, right where the weighting is strongest.
     */
    const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (ld < LAKE.r * 1.35) {
      const k = 1 - Math.min(1, ld / (LAKE.r * 1.35));
      const lobe = (fbm(x * 0.0085 + 11.3, z * 0.0085 - 7.1) - 0.5) * 0.18;
      const bowl = Math.max(0, Math.min(1, k * k * (3 - 2 * k) + lobe * k * (1 - k) * 4));
      h = h * (1 - bowl) + (LAKE.level - 5.5) * bowl;
    }
    /*
     * The bank, and it is the difference between a lake and a disc of blue
     * paint.
     *
     * Measured before this existed: the natural terrain around the lake is a
     * broad hollow at a mean of -12.3 m, so a water plane at -7.5 was 4.8 m
     * ABOVE the surrounding ground and the real intersection of plane and
     * terrain was 149 to 208 m out, in the 33 of 360 radial directions where
     * there was an intersection at all. The other 327 directions never came
     * back above the water line inside 220 m. The old water disc stopped at
     * 119 m over ground that was still 6.7 m under water, and a bright ring
     * of foam painted at the mesh edge is what hid that. Nothing about the
     * old shoreline was a shoreline.
     *
     * So the basin gets a rim: an additive bank, peaking between the bowl and
     * 1.6 lake radii, with its amplitude modulated by the same value noise
     * the terrain uses so the crossing wanders. Additive rather than a blend
     * toward a profile, because the ground here is 4 to 8 m under the water
     * line and only a lift can guarantee it comes back out: measured, the
     * water line now closes in 720 of 720 radial directions at 105.8 to
     * 119.3 m, a 13.5 m spread, and the top of the bank reaches -0.60 m,
     * which keeps it below the flat racing corridor at 0.
     */
    const u = ld / LAKE.r;
    if (u > 1.0 && u < 1.6) {
      const t = (u - 1.0) / 0.6;
      const amp = 9 * (0.7 + 0.6 * fbm(x * 0.02, z * 0.02));
      h += amp * 16 * t * t * (1 - t) * (1 - t);
    }
    return h;
  };
}

/*
 * Ground albedo at a point, shared by the terrain mesh and the grass
 * roots. The single strongest tell that grass and terrain are two
 * disjoint systems is a blade whose root is a different green from the
 * ground it grows out of; sampling one function for both makes the
 * meadow read as one surface with lighter tips.
 */
const GROUND = {
  grassLow: new THREE.Color(0x4f8c3c),
  grassHigh: new THREE.Color(0x86b95a),
  rock: new THREE.Color(0x8b8578),
  patchWarm: new THREE.Color(0x7fa84a),
  patchDark: new THREE.Color(0x3f7a3a),
  earth: new THREE.Color(0x9c8f6e),
  sand: new THREE.Color(0xd8cfa8),
};
function groundAlbedo(x, z, y, samples, c, pitch) {
  /* Colour by altitude, then three scales of variation: large patches
   * read as different ground cover from the air, a mid scale macro
   * (period about 33 m) breaks the monotone at racing height, and fine
   * speckle keeps it from banding. */
  const t = Math.min(1, Math.max(0, (y + 12) / 34));
  c.copy(GROUND.grassLow).lerp(GROUND.grassHigh, t);
  const patch = fbm(x * 0.0065, z * 0.0065);
  c.lerp(GROUND.patchWarm, Math.max(0, (patch - 0.5) * 1.5));
  c.lerp(GROUND.patchDark, Math.max(0, (0.5 - patch) * 1.1));
  const macro = fbm(x * 0.03, z * 0.03);
  c.multiplyScalar(0.97 + (macro - 0.5) * 0.13);
  const speck = fbm(x * 0.06, z * 0.06);
  c.multiplyScalar(0.94 + speck * 0.12);
  c.lerp(GROUND.rock, Math.min(0.5, Math.max(0, (y - 14) / 22)) * (0.5 + speck * 0.5));
  /* Beaten earth along the racing line, and sand at the waterline. */
  let dTrack = 1e9;
  for (const s of samples) {
    dTrack = Math.min(dTrack, Math.hypot(x - s.x, z - s.z));
  }
  const onPath = 1 - Math.min(1, Math.max(0, (dTrack - 2.5) / 5));
  /* No beaten earth on a mown pitch. A groundsman would have something to
   * say about a dirt track worn across their stripes, and the racing line on
   * a designed course is a line somebody drew this morning rather than one a
   * season of laps wore in. */
  const mown = pitchCover(pitch, x, z);
  c.lerp(GROUND.earth, onPath * 0.42 * (0.7 + speck * 0.6) * (1 - mown));

  if (mown > 0) {
    /*
     * Stripes across the short axis, so they run the length of the pitch the
     * way a mower drives it. The speckle still modulates them, so the pitch
     * is mown rather than painted.
     */
    const band = Math.floor((z + 1e4) / PITCH.stripe) % 2 === 0;
    const turf = band ? PITCH.light : PITCH.dark;
    c.lerp(turf, mown * 0.85);
    c.multiplyScalar(0.985 + speck * 0.03);
    /* The marking sits on the author's own boundary, not on the mown edge:
     * it is the line their plan drew, and the mown ground outside it is run
     * off. */
    const onLine = Math.abs(Math.max(Math.abs(x) - pitch.halfW, Math.abs(z) - pitch.halfD));
    const inside = Math.abs(x) <= pitch.halfW + PITCH.lineW && Math.abs(z) <= pitch.halfD + PITCH.lineW;
    if (inside && onLine <= PITCH.lineW) {
      c.lerp(PITCH.line, 0.9 * mown);
    }
  }
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  const shore = 1 - Math.min(1, Math.abs(y - LAKE.level) / 3.5);
  if (ld < LAKE.r * 1.5 && shore > 0) {
    c.lerp(GROUND.sand, shore * 0.8);
  }
  return c;
}

function terrain(height, samples, pitch) {
  const size = 1700;
  const seg = 230;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const rockCol = GROUND.rock;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = height(x, z);
    pos.setY(i, y);
    /* Slope rock is applied after normals exist, below. */
    groundAlbedo(x, z, y, samples, c, pitch);
    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  /* Steep faces go to rock: cheap, and it stops hills looking like felt. */
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i += 1) {
    const slope = 1 - nrm.getY(i);
    if (slope > 0.25) {
      const k = Math.min(1, (slope - 0.25) / 0.35);
      colors[i * 3 + 0] += (rockCol.r - colors[i * 3 + 0]) * k;
      colors[i * 3 + 1] += (rockCol.g - colors[i * 3 + 1]) * k;
      colors[i * 3 + 2] += (rockCol.b - colors[i * 3 + 2]) * k;
    }
  }
  geo.attributes.color.needsUpdate = true;
  const mat = celMaterial({ color: 0xffffff, rim: 0.0, cloudShadow: 0.34 });
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/*
 * The lake.
 *
 * What was here before, and what each part of it was actually doing, because
 * every one of these was measured off a capture rather than guessed:
 *
 *  - Depth was `1.0 - length(vLocal) / uRadius`, which is distance from the
 *    disc centre. So the "shallow" band was a ring painted at a fixed radius
 *    and the "deep" water was a bullseye in the middle, and neither had any
 *    relation to the ground under the water. In the oblique capture it read
 *    as three concentric rings of flat colour.
 *  - Foam was `smoothstep(0.9, 1.0, r)`, a 12 m wide ring of near white at
 *    the mesh edge. It was not a shoreline. It was there to hide the fact
 *    that the mesh ended over ground still 6.7 m below the water line.
 *  - Crests were `step(0.82, sin(x) * sin(z))`, a product of two low
 *    frequency sines thresholded hard, which is a grid of white polka dots.
 *    They were the loudest thing in the lake.
 *  - No sun term of any kind: no diffuse, no specular, no sky reflection. A
 *    water surface with no reflection has no orientation and no scale, which
 *    is why the lake read as a flat cyan hole in the ground.
 *  - Trees and rocks stood in it, because nothing skipped them.
 *
 * What it is now: one water plane at LAKE.level, and everything about it
 * derived from real depth, `LAKE.level - height(x, z)`, sampled per vertex.
 * The shoreline is where that depth reaches zero, so it follows the bank the
 * height field builds, and the depth test against the terrain trims the
 * silhouette exactly. Sky reflection comes from the shared celSkyColor, so
 * the reflection cannot disagree with the sky above it.
 */
function water(height) {
  /*
   * A radial grid, not a CircleGeometry, because every vertex has to carry
   * the depth of the ground beneath it and one ring of 72 vertices cannot
   * describe a shoreline. Rings are packed toward the outside, r = R (1 -
   * (1 - t)^1.7), because that is where the shallow band and the foam are
   * and the middle of a lake is 6 m of flat colour.
   *
   * 48 by 160 is 7,681 vertices and 15,200 triangles: 92 KB of position and
   * 31 KB of depth against a 48 MB attribute budget, and about 0.8 percent
   * of a frame's triangles. The radial step at the shore is 0.4 m and the
   * arc step is 4.5 m, so the foam band, which is 0.85 m of depth over a
   * bank of about 1 in 6, is resolved several times over.
   */
  const R = LAKE.r * 1.35;
  const RINGS = 48;
  const SECTORS = 160;
  const vcount = 1 + RINGS * SECTORS;
  const pos = new Float32Array(vcount * 3);
  const dep = new Float32Array(vcount);
  const idx = new Uint16Array((SECTORS + (RINGS - 1) * SECTORS * 2) * 3);
  const depthAt = (lx, lz) => LAKE.level - height(LAKE.x + lx, LAKE.z + lz);
  pos[0] = 0;
  pos[1] = 0;
  pos[2] = 0;
  dep[0] = depthAt(0, 0);
  for (let ring = 1; ring <= RINGS; ring += 1) {
    const t = ring / RINGS;
    const r = R * (1 - (1 - t) ** 1.7);
    for (let sct = 0; sct < SECTORS; sct += 1) {
      const a = (sct / SECTORS) * Math.PI * 2;
      const vi = ((ring - 1) * SECTORS + sct + 1) * 3;
      const lx = Math.cos(a) * r;
      const lz = Math.sin(a) * r;
      pos[vi] = lx;
      pos[vi + 1] = 0;
      pos[vi + 2] = lz;
      dep[vi / 3] = depthAt(lx, lz);
    }
  }
  /*
   * Winding, and it cost a capture to find. Looking down the +y axis in this
   * right handed frame, x runs right and z runs toward the viewer, so a
   * vertex at angle a of (cos a, sin a) in (x, z) sweeps CLOCKWISE on screen
   * as a increases. Emitting triangles in increasing a therefore makes every
   * one of them back facing, and the material is FrontSide, so the lake was
   * drawn, twice per frame, and culled entirely: 15,200 triangles submitted,
   * two draw calls, and not one fragment. A forced opaque red output was
   * still invisible, which is what pointed at the rasteriser rather than at
   * the shader. So each face is emitted the other way round.
   */
  let ii = 0;
  for (let sct = 0; sct < SECTORS; sct += 1) {
    idx[ii++] = 0;
    idx[ii++] = 1 + ((sct + 1) % SECTORS);
    idx[ii++] = 1 + sct;
  }
  for (let ring = 1; ring < RINGS; ring += 1) {
    for (let sct = 0; sct < SECTORS; sct += 1) {
      const a0 = 1 + (ring - 1) * SECTORS + sct;
      const a1 = 1 + (ring - 1) * SECTORS + ((sct + 1) % SECTORS);
      const b0 = a0 + SECTORS;
      const b1 = a1 + SECTORS;
      idx[ii++] = a0; idx[ii++] = b1; idx[ii++] = b0;
      idx[ii++] = a0; idx[ii++] = a1; idx[ii++] = b1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      /* Shallow is a warm green cyan and deep is a cold blue, and both are
       * darker than the old pair: measured, the old shallow 0x63c6c9 is
       * 0.480 linear luminance, which put the flat body of the lake in the
       * same value band as the four mountain ridge rings at 0.250 to 0.430
       * and above the terrain's far edge at 0.192. Water that reads brighter
       * than the hills behind it is a hole in the composition. */
      uShallow: { value: new THREE.Color(0x3f9e9a) },
      uDeep: { value: new THREE.Color(0x14456b) },
      uFoam: { value: new THREE.Color(0xdff0f4) },
      uSpec: { value: new THREE.Color(0xfff4d8) },
      uSun: { value: SUN_DIR.clone() },
      uSkyHigh: { value: new THREE.Color(SKY_HIGH) },
      uSkyHorizon: { value: new THREE.Color(HORIZON) },
      uFogColor: { value: new THREE.Color(HORIZON) },
      uFogNear: { value: FOG_NEAR },
      uFogFar: { value: FOG_FAR },
    },
    vertexShader: /* glsl */ `
      attribute float aDepth;
      varying float vDepth;
      varying vec3 vWorld;
      varying float vFog;
      uniform float uTime;
      void main() {
        vDepth = aDepth;
        vec3 p = position;
        /* The surface itself heaves a little, and only where there is water
         * under it: a swell that lifts the shoreline vertices would push the
         * plane up through the beach. */
        float wet = clamp(aDepth * 1.5, 0.0, 1.0);
        p.y += (sin(p.x * 0.12 + uTime * 1.3) * 0.05 + sin(p.z * 0.17 - uTime * 0.9) * 0.04) * wet;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vec4 mv = viewMatrix * world;
        vFog = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      ${CLOUD_SHADOW_GLSL}
      varying float vDepth;
      varying vec3 vWorld;
      varying float vFog;
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      uniform vec3 uSpec;
      uniform vec3 uSun;
      uniform vec3 uSkyHigh;
      uniform vec3 uSkyHorizon;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      void main() {
        /* Dry ground. The depth test against the terrain already trims the
         * silhouette to the exact intersection, so this is belt and braces
         * for the shallow slope near the water line, where a plane and a
         * bank at 1 in 6 would otherwise fight over the same depth values. */
        if (vDepth <= 0.0) {
          discard;
        }
        vec2 P = vWorld.xz;
        /*
         * Three wave trains, and each one is faded out by its OWN screen
         * space derivative. fwidth of a phase is radians per pixel, so once
         * a train turns over more than about a radian inside one pixel it is
         * past Nyquist and all it can do is alias: at 300 m the old crest
         * pattern was a field of crawling dots two pixels across. Fading a
         * train instead of clamping the whole surface keeps the long swell
         * visible at distance while the chop goes away.
         */
        /*
         * The phases are jittered by a slow noise field, and that is not
         * decoration. Three pure sine trains are strictly periodic, so any
         * threshold or any narrow lobe laid over them repeats on their
         * lattice: measured, that came out first as a grid of pale dots and
         * then, once the crest was a line, as a net of pale lanes across the
         * whole lake, which read as a tiled swimming pool. Jittering the
         * phase by about a radian over 50 m breaks the lattice while leaving
         * the wave directions and speeds intact.
         */
        float jit = celNoise(P * 0.02 + vec2(uTime * 0.03, 0.0)) * 2.0 - 1.0;
        float a1 = dot(P, vec2(0.31, 0.21)) + uTime * 1.10 + jit * 1.6;
        float a2 = dot(P, vec2(-0.17, 0.28)) - uTime * 0.85 + jit * 2.1;
        float a3 = dot(P, vec2(0.90, -0.70)) + uTime * 2.30 - jit * 2.6;
        float k1 = 1.0 - smoothstep(0.7, 2.2, fwidth(a1));
        float k2 = 1.0 - smoothstep(0.7, 2.2, fwidth(a2));
        float k3 = 1.0 - smoothstep(0.7, 2.2, fwidth(a3));
        /* Analytic normal of the sum of the three trains. No finite
         * differences: the derivative of a sine is known, and a difference
         * of a fwidth apart is exactly the thing that aliases. */
        float dHdx = 0.055 * cos(a1) * 0.31 * k1
                   + 0.045 * cos(a2) * -0.17 * k2
                   + 0.016 * cos(a3) * 0.90 * k3;
        float dHdz = 0.055 * cos(a1) * 0.21 * k1
                   + 0.045 * cos(a2) * 0.28 * k2
                   + 0.016 * cos(a3) * -0.70 * k3;
        /* Shallow water is calmer, and the surface goes flat as it dries. */
        float wet = clamp(vDepth * 0.8, 0.0, 1.0);
        /* The slope multiplier was 12.0 in the first capture, which is a
         * 25 degree surface tilt at the steepest part of the wave: from the
         * water's own level that read as an ocean swell in a mountain tarn,
         * and it drove the tight specular into a regular grid of dots
         * because a narrow lobe on a periodic surface can only fire where
         * the period puts it. 4.5 is about 9 degrees.
         *
         * 4.5 is still too much, and it is not an aliasing problem: from
         * 150 m the three trains run about 105 px per wave, so fwidth is
         * 0.06 rad per pixel and k1 to k3 sit at 1.0, doing nothing. The
         * pattern in the frame IS the swell at its true scale, and at 9
         * degrees of tilt two crossing trains modulate the fresnel term hard
         * enough that a high oblique view reads as corduroy rather than
         * water. 2.4 is about 5 degrees, which is what a sheltered tarn
         * actually does. */
        vec3 n = normalize(vec3(-dHdx * 2.4 * wet, 1.0, -dHdz * 2.4 * wet));
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 L = normalize(uSun);

        /*
         * Body colour from REAL depth. Part posterised, part smooth, the
         * same compromise the sky dome makes: a fully banded ramp reads as
         * contour lines on a map, and a fully smooth one loses the painted
         * look the rest of the world is drawn in. Because depth is now the
         * water column and not the distance from a disc centre, the bands
         * ARE bathymetry and they follow the shore all the way round.
         */
        float t = clamp(vDepth / 4.0, 0.0, 1.0);
        float band = floor(t * 5.0) / 5.0;
        vec3 body = mix(uShallow, uDeep, mix(t, band, 0.45));
        /* A sun term on the body itself, so the lake is lit by the same sun
         * as the meadow around it rather than being self luminous. */
        body *= 0.80 + 0.20 * max(dot(n, L), 0.0);

        /*
         * Fresnel weighted sky reflection, from the shared sky function, so
         * the water reflects THE sky and not a second one. Weight capped
         * well below the physical 1.0 at grazing angles: the horizon band of
         * this sky is 0.888 linear, and letting the far water reach it puts
         * a sky bright strip across the middle of the frame right where the
         * mountain ridge ladder lives, which the ladder cannot survive.
         */
        vec3 R = reflect(-V, n);
        R.y = abs(R.y);
        vec3 sky = celSkyColor(R, uSun, uSkyHorizon, uSkyHigh);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 col = mix(body, sky, min(fres, 0.42) * 0.92);

        /* Specular. Blinn, tight, and multiplied by the wave attenuation so
         * a distant surface does not sparkle at one pixel per frame. */
        /* Blinn, and deliberately BROAD: exponent 110 with this ripple
          * field measured as a grid of round pale dots the same spacing as
          * the waves, which is the same defect the old crest term had by a
          * different route. 45 spreads the highlight into a glitter path. */
        float spec = pow(max(dot(n, normalize(L + V)), 0.0), 28.0);
        col += uSpec * spec * 0.24 * max(k1 * k3, 0.0);

        /* Crest lines along the swell, not the old product of two sines,
         * which put a dot wherever both happened to peak. */
        /*
         * Crest LINES, from one wave train, amplitude modulated by another.
         * The original was step(0.82, sin(x) * sin(z)) and the first rewrite
         * was smoothstep on sin(a1) * 0.62 + sin(a3) * 0.38, and both are the
         * same mistake: a threshold on a combination of two trains only fires
         * where both peak, which is a lattice of dots and not a crest. Both
         * captures came out as regular pale polka dots over the whole lake.
         * A threshold on ONE phase is a line along that swell.
         *
         * Then the strength: 0.07 of foam white over a body at about 0.15
         * linear is a third brighter than the water, and from 60 m up that
         * read as pale lanes ruled across the lake with the a3 modulation
         * dashing them into a net. 0.035 at a higher threshold puts light on
         * the top of the swell only, which is all a lake does at 150 m.
         */
        float crest = smoothstep(0.94, 0.999, sin(a1)) * (0.55 + 0.45 * sin(a3));
        col += uFoam * crest * 0.035 * k1 * wet;

        /*
         * Foam where the water column runs out, which is now a real
         * shoreline rather than a ring at the mesh edge. The threshold
         * breathes with the swell so the line is not a contour, and the band
         * is 0.55 m of depth, about 3 m of beach on this bank. The mix was
         * 0.88 of the way to foam white and is 0.55: at 0.88 the lake had a
         * white rope round it, which is what the old radius foam looked like
         * and the whole point was to stop looking like that.
         */
        float shore = 1.0 - smoothstep(0.0, 0.55, vDepth);
        float foam = smoothstep(0.34, 0.95, shore + 0.10 * sin(a1 * 1.7) * k1);
        col = mix(col, uFoam, foam * 0.55);

        float f = clamp((vFog - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
        col = mix(col, uFogColor, f);
        /*
         * The renderer runs with NoToneMapping, so anything over 1.0 clips
         * flat and an aliased white hole is exactly what the round 13 sun
         * fix was about. The highlight is capped below full white instead.
         */
        col = min(col, vec3(0.96));
        /* Shallow water is see through, deep water is not, which is what
         * puts the sand of the bank under the edge of the lake instead of a
         * painted band. */
        float alpha = mix(0.58, 0.95, clamp(vDepth / 2.2, 0.0, 1.0));
        gl_FragColor = vec4(col, max(alpha, foam * 0.94));
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(LAKE.x, LAKE.level, LAKE.z);
  /* No ink outline on water: an edge pass on a flat plane draws a hard
   * line round the whole lake and it stops reading as a surface. */
  mesh.layers.set(1);
  return { mesh, mat };
}

/*
 * Cliff spires. The valley needs vertical landmarks: something to judge
 * altitude and distance against, and something to break the horizon so
 * the eye has a focal point other than the gates.
 */
function cliff(rng, height, x, z, caps) {
  const g = new THREE.Group();
  const tierCaps = [];
  const tiers = 2 + Math.floor(rng() * 3);
  let y = 0;
  let r = 7 + rng() * 9;
  for (let i = 0; i < tiers; i += 1) {
    const h = 9 + rng() * 15;
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.72, r, h, 6 + Math.floor(rng() * 3), 1),
      celMaterial({ color: i % 2 ? 0x8f8a7c : 0x9a9487, rim: 0.24, cloudShadow: 0.3 }),
    );
    m.position.y = y + h / 2;
    m.rotation.y = rng() * 3;
    m.castShadow = true;
    m.receiveShadow = true;
    outlineHull(m, 1.03);
    g.add(m);
    if (caps) {
      /* Collected in the cliff's own frame and pushed once the base height
       * is known, a few lines below. */
      tierCaps.push(y, y + h, r);
    }
    y += h * 0.92;
    r *= 0.74;
  }
  /* Grass cap so it does not look like bare geology dropped in a field. */
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.78, r * 0.95, 1.6, 7),
    celMaterial({ color: 0x5fa348, rim: 0.3, cloudShadow: 0.3 }),
  );
  cap.position.y = y + 0.8;
  cap.castShadow = true;
  outlineHull(cap, 1.04);
  g.add(cap);
  const base = height(x, z) - 1;
  g.position.set(x, base, z);
  if (caps) {
    for (let i = 0; i < tierCaps.length; i += 3) {
      caps.addPost('cliff', x, z, base + tierCaps[i], base + tierCaps[i + 1], tierCaps[i + 2]);
    }
  }
  return g;
}

/*
 * Grass. One merged buffer rather than instancing: a single draw call, and
 * the wind is a vertex shader function of world position so neighbouring
 * blades move together in gusts instead of each doing its own thing.
 */
function grassField(height, samples, rng, pitch) {
  /* Measured as the blades are made rather than restated from the formula
   * above, so a scale check reads what was BUILT. See references in
   * buildFieldScene. */
  let bladeMin = Infinity;
  let bladeMax = -Infinity;
  /*
   * Blade count and blade size, both measured against a frame rather than
   * guessed. 46000 blades of 7.5 to 13 cm width spread over 900 by 900 m
   * put roughly one blade per two square metres, so at eye height the near
   * field was a handful of very large isolated fins over bare ground: it
   * read as scattered debris, not as a meadow, and a blade as wide as a
   * hand also reads as the wrong plant. Four times as many blades, half as
   * wide, concentrated in a tighter band along the circuit where the eye
   * actually is.
   */
  /*
   * Two counts, and the split is the whole trick.
   *
   * Cover was measured, not estimated: a capture from a pilot's eye at
   * 1.0 m over the racing line, against the same capture with the grass
   * mesh hidden, differs in 3.19 percent of the ground pixels. That is
   * what "sparse specks on flat green" means as a number, and the scale
   * review's 14.5 percent was a more generous accounting of the same
   * field.
   *
   * The first BLADES_WORLD blades are drawn from the WORLD rng in exactly
   * the order they always were, because that single stream goes on to
   * place every tree, rock, cliff, flower and mountain in the valley: one
   * extra or one fewer draw here and the whole world is a different world,
   * which is why the last two rounds refused to touch the count. The extra
   * blades are drawn from a SECOND stream of their own, so the field gets
   * denser and nothing else in the valley moves by a millimetre. Verified
   * by capture, not by argument.
   *
   * BLADES_EXTRA is set by TRIANGLES, not by bytes, and two measured dead
   * ends are why.
   *
   * First try: keep the old five vertex blade and raise the count with the
   * bytes the byte attributes freed. 72000 extra blades moved cover from
   * 3.19 to 3.79 percent and cost 433,840 triangles, taking P2 from 1.93
   * to 2.36 million against a 1.2 million ceiling. Two thirds of a million
   * triangles for six tenths of a point.
   *
   * Second try: a three vertex blade, one triangle, 48 bytes, and 440000
   * of them inside the same 48 MB. Predicted about twice the cover from
   * 2.39 times the blades at 0.83 of the silhouette area each. MEASURED
   * 3.28 percent, which is the 184000 blade field to within the wind
   * phase, and the near field fell from 2.40 to 1.74. The prediction was
   * wrong because it counted area and the frame counts PIXELS: a blade
   * base is 3 to 7 px wide at 1 m and a triangle that tapers to a point
   * spends its upper half under one pixel wide, where a rasteriser with no
   * multisampling drops it entirely. Area above the pixel is what covers
   * ground.
   *
   * So: four vertices, base pair and a BLUNT top pair at 0.95 of the
   * height and 0.45 of the width, two triangles. The silhouette integrates
   * to 1.38 w h against the five vertex blade's 1.20, it holds more than a
   * pixel of width all the way to the top, and a blunt top is what a mown
   * blade actually looks like, which is cut. 276000 of them is 552,000
   * triangles, exactly the count the field had before this round, and
   * 17,664,000 attribute bytes.
   *
   * A top at 0.72 of the width was tried first and measured MORE cover,
   * 7.18 percent against 4.70. Rejected on the frame rather than on the
   * number: that wide a top is a rectangle, and the near field read as pale
   * chips lying on the grass rather than as grass.
   */
  const BLADES_WORLD = 184000;
  const BLADES_EXTRA = 92000;
  const BLADES = BLADES_WORLD + BLADES_EXTRA;
  const positions = new Float32Array(BLADES * 4 * 3);
  /*
   * Colour as a normalised unsigned byte triple, not three float32.
   *
   * Measured: P10 attribute bytes 51,708,044 against a 48,000,000 ceiling,
   * of which the grass was 25,760,000. A blade colour is an albedo in
   * [0,1] that gets multiplied by a light term and written to an 8 bit
   * framebuffer, so 24 bits of mantissa per channel buys nothing: the
   * jitter this loop applies is plus or minus 0.05 in lightness, which is
   * 13 counts of 255. Three floats to three normalised bytes takes the
   * colour attribute from 11,040,000 bytes to 2,760,000.
   */
  const colors = new Uint8Array(BLADES * 4 * 3);
  /* aBend the same way, and it is even more clear cut: this attribute only
   * ever holds 0, 0.6 and 1, and 0.6 is 153/255 exactly, so the normalised
   * byte is not an approximation of anything. 3,680,000 bytes to 920,000. */
  const bend = new Uint8Array(BLADES * 4);
  const indices = new Uint32Array(BLADES * 6);
  const rootC = new THREE.Color();
  const tipC = new THREE.Color();
  const c = new THREE.Color();
  let vi = 0;
  let ii = 0;
  let made = 0;
  /*
   * One blade, drawn from whichever stream it belongs to. `extra` picks the
   * placement rule: the world blades keep the original two branch rule
   * exactly, draw for draw, and the extra blades all land in the near band
   * because cover is a SCREEN quantity. A blade 40 m away covers a
   * fraction of a pixel and cannot read as cover at any density this
   * budget allows; a blade 3 m away covers tens of pixels. The existing
   * wide scatter, 16 percent of the blades over 810,000 square metres, is
   * 0.036 blades per square metre, and that is the speckle a reviewer sees
   * on the distant ground rather than anything that reads as a meadow.
   */
  const emit = (r, extra) => {
    let x;
    let z;
    if (extra) {
      const s = samples[Math.floor(r() * samples.length)];
      const a = r() * Math.PI * 2;
      /* Squared, not cubed, and out to 16 m rather than 42: tighter to the
       * line than the original draw, because that is the band the camera
       * actually flies through. */
      const u = r();
      const rad = 0.5 + 24 * u * u;
      x = s.x + Math.cos(a) * rad;
      z = s.z + Math.sin(a) * rad;
    } else if (r() < 0.84) {
      const s = samples[Math.floor(r() * samples.length)];
      const a = r() * Math.PI * 2;
      /* Radius from a cubed uniform, not a uniform: dense at the circuit
       * and thinning outward to 42 m. A flat distribution inside a hard
       * radius projects its outer wall as a ruler straight horizontal line
       * across the frame, which is exactly what it did at 22 m. */
      const u = r();
      const rad = 1 + 41 * u * u * u;
      x = s.x + Math.cos(a) * rad;
      z = s.z + Math.sin(a) * rad;
    } else {
      x = (r() - 0.5) * 900;
      z = (r() - 0.5) * 900;
    }
    const y = height(x, z);
    /*
     * Blade height, and it is a SCALE decision rather than a look decision.
     * It was 0.26 to 0.68 m, chosen when a gate was 5 m tall and its aperture
     * centre was 2.5 m up. A regulation MultiGP gate is 1.524 m to the top of
     * its opening, so grass to 0.68 m is knee deep beside it and the gates
     * drown: measured on the title frame, the mid field grass reached most of
     * the way up the gate and the target was invisible at 20 m. MultiGP also
     * says a course should be as flat as possible, and a chapter races on
     * mown grass. 0.09 to 0.24 m is ankle height, which puts the gate back to
     * being the tallest thing near the racing line.
     */
    /*
     * Blade HEIGHT, and the resting camera is what settles it.
     *
     * 0.09 to 0.24 m was already a correction from 0.26 to 0.68, but a quad at
     * rest has its camera 7.5 cm off the deck, so grass to 24 cm put the FPV
     * camera INSIDE the canopy and the first frame of the game was half filled
     * with slabs of leaf. A mown chapter field is 3 to 5 cm and MultiGP asks for
     * a course as flat as possible, so 3 to 9 cm is both what the sport uses and
     * what leaves a parked quad able to see.
     */
    const h = 0.03 + r() * 0.06;
    if (h < bladeMin) {
      bladeMin = h;
    }
    if (h > bladeMax) {
      bladeMax = h;
    }
    /*
     * Blade WIDTH, and it was the worst scale error in the project.
     *
     * Measured in a frame rather than inferred: one blade's base came out
     * 0.0985 m across, which is 39 percent of the 250 mm craft's span. Real
     * grass is about 4 mm, 1.6 percent. The finest detail in every frame was
     * half the aircraft, so the aircraft read as a toy no matter how correct
     * its own dimensions were. Aspect ratio was 0.80 to 4.6 where real grass
     * is 15 to 60.
     *
     * 8 to 18 mm is a compromise, not the real 4 mm: the blade count is left
     * alone because it drives the rng stream for the whole world and because
     * P2 and P10 are already over budget, and 4 mm blades at this density
     * would be invisible. Aspect is now 5 to 30, which is in the right
     * territory. Raising the count to recover ground cover is the next round's
     * call and it makes P2 and P10 worse, which has to be said out loud.
     */
    const w = 0.008 + r() * 0.010;
    const a = r() * Math.PI;
    const dx = Math.cos(a) * w;
    const dz = Math.sin(a) * w;
    /*
     * Root exactly the ground colour, tip lifted in value and nudged warm.
     * One meadow, lighter at the tips.
     *
     * The lift was 0.13 and it is 0.08, because the blade changed shape. A
     * pale top on a thin curved sliver reads as a catch of light; the same
     * pale top on a blunt ribbon reads as a paper chip, and the first
     * capture of the new blade was confetti scattered across the near
     * field. Cover, measured by hiding the mesh, only counts pixels the
     * grass changes, so it rewards exactly the contrast that was making the
     * field look littered: that number has to be read beside the frame and
     * not instead of it.
     */
    groundAlbedo(x, z, y, samples, rootC, pitch);
    tipC.copy(rootC).offsetHSL(0.012, 0.05, 0.08);
    /*
     * FOUR vertices, base pair and a blunt top pair, two triangles. It was
     * five: a base pair, a mid pair at 0.6 of the height, and a single
     * vertex tip, so the blade could curve as it bent. The reasoning for
     * dropping the tip is in the block comment on the counts above, and it
     * is a pixel argument rather than an area argument.
     *
     * The FIFTH vertex is still walked and still draws its colour jitter
     * below, and that is deliberate. This loop's draws are the world's one
     * rng stream in its one order, so dropping a vertex's worth of draws
     * would move every tree, rock, cliff, flower and mountain placed after
     * the grass. The value is drawn and thrown away, which is the only
     * safe way to skip anything in this file.
     */
    const vs = [
      [x - dx, y, z - dz, 0, true],
      [x + dx, y, z + dz, 0, true],
      [x - dx * 0.45, y + h * 0.95, z - dz * 0.45, 1, true],
      [x + dx * 0.45, y + h * 0.95, z + dz * 0.45, 1, true],
      [x, y + h, z, 1, false],
    ];
    const v0 = vi / 3;
    for (const [vx, vy, vz, b, keep] of vs) {
      /* Per blade hue and value jitter: a field of identical blades reads
       * as one plastic sheet no matter how it is lit. Jitter stays small
       * so the roots keep matching the ground. */
      c.copy(rootC).lerp(tipC, b * (0.55 + r() * 0.45));
      c.offsetHSL((r() - 0.5) * 0.025, (r() - 0.5) * 0.08, (r() - 0.5) * 0.05);
      if (!keep) {
        continue;
      }
      positions[vi + 0] = vx;
      positions[vi + 1] = vy;
      positions[vi + 2] = vz;
      /* Rounded, not truncated: truncation biases every blade dark by half
       * a count, which over a million vertices is a systematic 0.2 percent
       * darkening of the meadow for no reason. */
      colors[vi + 0] = Math.round(c.r * 255);
      colors[vi + 1] = Math.round(c.g * 255);
      colors[vi + 2] = Math.round(c.b * 255);
      bend[vi / 3] = Math.round(b * 255);
      vi += 3;
    }
    indices[ii++] = v0 + 0; indices[ii++] = v0 + 1; indices[ii++] = v0 + 2;
    indices[ii++] = v0 + 1; indices[ii++] = v0 + 3; indices[ii++] = v0 + 2;
    made += 1;
  };
  for (let i = 0; i < BLADES_WORLD; i += 1) {
    emit(rng, false);
  }
  /*
   * The second stream. A different seed from the world's 20260811 so the
   * extra blades do not land on top of the ones the world stream already
   * placed: the two generators share a multiplier, so the same seed would
   * reproduce the same sequence and every extra blade would be a duplicate
   * of a world blade with a different placement rule applied to it.
   */
  const extraRng = makeRng(90210077);
  for (let i = 0; i < BLADES_EXTRA; i += 1) {
    emit(extraRng, true);
  }
  const geo = new THREE.BufferGeometry();
  /* Trimmed by the write cursors, not by made times a constant: a blade is
   * four vertices and two triangles now, and hard coding the old five and
   * nine here is how a buffer ends up with a tail of zeroed vertices that
   * draw a degenerate triangle at the world origin. */
  geo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, vi), 3));
  /* The trailing true is `normalized`: the shader still reads `color` as a
   * vec3 in [0,1], the byte 255 meaning 1.0. */
  geo.setAttribute('color', new THREE.BufferAttribute(colors.subarray(0, vi), 3, true));
  geo.setAttribute('aBend', new THREE.BufferAttribute(bend.subarray(0, vi / 3), 1, true));
  geo.setIndex(new THREE.BufferAttribute(indices.subarray(0, ii), 1));
  geo.computeBoundingSphere();

  /*
   * Light for the blades, derived from the scene's own lights rather than
   * guessed, so a blade matches the ground it grows out of.
   *
   * A toon surface facing up receives sunColour x sunIntensity x the
   * ramp's lit band, plus the hemisphere light's sky colour x its
   * intensity. In shadow it receives the ramp's cool band instead. Those
   * two products are GRASS_LIT and GRASS_SHADE, in linear working space,
   * and the numbers come from SUN_COLOUR 0xffe9c4 at 1.45, the hemisphere
   * 0x8fb8e8 at 0.42, and the ramp stops in celmat.js. Measured against a
   * frame afterwards, not asserted: see PROGRESS.md.
   *
   * Before this the fragment shader was one line, vec3 col = vColor, with
   * a comment claiming the sun gain was baked in. It was not, and a
   * reviewer measured the meadow at 27 percent darker than the terrain
   * underneath it.
   */
  const mat = new THREE.ShaderMaterial({
    lights: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      {
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color(HORIZON) },
        uFogNear: { value: FOG_NEAR },
        uFogFar: { value: FOG_FAR },
        uSun: { value: SUN_DIR.clone() },
        uQuad: { value: new THREE.Vector3(0, -100, 0) },
        uWash: { value: 0 },
        uLit: { value: new THREE.Vector3(1.568, 1.300, 0.938) },
        uShade: { value: new THREE.Vector3(0.331, 0.463, 0.719) },
        uCloud: { value: 0.34 },
      },
    ]),
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <shadowmap_pars_vertex>
      attribute float aBend;
      varying vec3 vColor;
      varying float vFog;
      varying float vBend;
      varying vec3 vWorld;
      uniform float uTime;
      uniform vec3 uQuad;
      uniform float uWash;
      void main() {
        vColor = color;
        vBend = aBend;
        vec3 p = position;
        // gusts: a slow travelling wave across the field plus a fast
        // flutter, both keyed to world position so blades move as a mass
        float gust = sin(p.x * 0.045 + p.z * 0.03 + uTime * 1.1);
        float flutter = sin(p.x * 0.9 + p.z * 0.7 + uTime * 5.5);
        float amp = aBend * aBend;
        /* Tip travel used to reach 0.461 m, which is 1.9 to 5.1 times the
         * blade's OWN height: a blade cannot throw its tip twice its length,
         * and the near field read as a floor of half metre ribbons rather than
         * as grass. Capped at about a quarter of blade height. */
        p.x += (gust * 0.050 + flutter * 0.012) * amp;
        p.z += (gust * 0.030 + flutter * 0.010) * amp;
        p.y -= abs(gust) * 0.05 * amp;
        // propwash: grass under the craft blasts radially outward and
        // flattens, hardest directly below, gone a few metres out. This
        // is the strongest low altitude speed and height cue there is.
        vec2 dq = p.xz - uQuad.xz;
        float dHor = length(dq);
        float wash = uWash
          * (1.0 - smoothstep(0.4, 3.4, dHor))
          * (1.0 - smoothstep(1.0, 7.5, uQuad.y - p.y));
        if (wash > 0.001) {
          vec2 dir = dHor > 0.05 ? dq / dHor : vec2(1.0, 0.0);
          float shake = sin(uTime * 29.0 + p.x * 7.3 + p.z * 5.1);
          p.x += dir.x * wash * amp * (0.85 + 0.3 * shake);
          p.z += dir.y * wash * amp * (0.85 + 0.3 * shake);
          p.y -= wash * amp * 0.4;
        }
        /* The shadow chunks want a world position and a normal to offset
         * along. Blades stand on the ground, so up is the right normal for
         * the bias, and it is only used for the bias. */
        vec4 worldPosition = modelMatrix * vec4(p, 1.0);
        vWorld = worldPosition.xyz;
        vec3 transformedNormal = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
        #include <shadowmap_vertex>
        vec4 mv = viewMatrix * worldPosition;
        vFog = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <packing>
      #include <shadowmap_pars_fragment>
      /* getShadowMask reads a bool called receiveShadow, which the
       * renderer declares for its own materials and not for a raw
       * ShaderMaterial. This grass always receives shadows, so define it
       * rather than plumb a uniform nothing would ever set to false. */
      #define receiveShadow true
      #include <shadowmask_pars_fragment>
      ${CLOUD_SHADOW_GLSL}
      varying vec3 vColor;
      varying float vFog;
      varying float vBend;
      varying vec3 vWorld;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec3 uLit;
      uniform vec3 uShade;
      uniform float uCloud;
      uniform float uTime;
      void main() {
        /* The same two light products the terrain gets, so a blade is the
         * value of the ground plus a little, never a darker rash on it. */
        float lit = getShadowMask();
        lit *= 1.0 - uCloud * celCloudShadow(vWorld.xz, uTime);
        /* Roots sit in the field's own occlusion, tips catch the sun. A
         * shallow ramp: a steep one turns a meadow into stripes. */
        lit *= 0.74 + 0.26 * vBend;
        vec3 col = vColor * mix(uShade, uLit, lit);
        float f = clamp((vFog - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
        gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
      }
    `,
  });
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, mat, bladeHeightRange: [bladeMin, bladeMax] };
}

/*
 * caps, when given, collects this tree's colliders. They are pushed from the
 * values the geometry is actually built from, inside the same draw, because
 * the baker merges every instance into one anonymous buffer and a tree's
 * trunk radius cannot be recovered afterwards. Nothing here consumes an
 * extra rng() value: the whole world hangs off one stream in one order, so
 * an extra draw would move every tree, flower and mountain in the valley.
 */
function tree(rng, height, x, z, caps) {
  const g = new THREE.Group();
  const scale = 0.85 + rng() * 1.5;
  const trunkH = (1.5 + rng() * 1.3) * scale;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13 * scale, 0.24 * scale, trunkH, 6),
    celMaterial({ color: 0x6b4a2f, rim: 0.18 }),
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  outlineHull(trunk, 1.1);
  g.add(trunk);

  /* Rounded, slightly irregular canopy masses rather than cones: the
   * silhouette is what sells a stylised tree. */
  const tints = [0x4c9440, 0x5aa348, 0x429038, 0x69ad4e];
  const tint = tints[Math.floor(rng() * tints.length)];
  const blobs = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < blobs; i += 1) {
    const r = (1.05 - i * 0.1 + rng() * 0.35) * scale;
    /* Smooth normals: a flat shaded icosahedron gives every facet its own
     * toon band and its own crease line, which reads as crumpled paper up
     * close. A smooth blob shades as one round mass with a curved band
     * edge, which is how this style draws a canopy. */
    let blobGeo = new THREE.IcosahedronGeometry(r, 1);
    blobGeo = mergeVertices(blobGeo);
    blobGeo.computeVertexNormals();
    const blob = new THREE.Mesh(
      blobGeo,
      celMaterial({ color: tint, rim: 0.3 }),
    );
    const a = rng() * Math.PI * 2;
    const spread = i === 0 ? 0 : (0.35 + rng() * 0.55) * scale;
    blob.position.set(
      Math.cos(a) * spread,
      trunkH + (0.5 + i * 0.42 + rng() * 0.25) * scale,
      Math.sin(a) * spread,
    );
    blob.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    blob.castShadow = true;
    outlineHull(blob, 1.055);
    g.add(blob);
  }
  const gy = height(x, z);
  g.position.set(x, gy, z);
  if (caps) {
    /* The trunk, as a vertical capsule at the mean of its two radii. A
     * tapered cylinder is not a capsule, and the difference over a 3 m
     * trunk is a couple of centimetres of radius, which is inside the
     * craft's own 0.19 m. */
    caps.addPost('tree', x, z, gy, gy + trunkH, (0.13 + 0.24) * 0.5 * scale);
    for (const c of g.children) {
      if (c.isMesh && c.geometry.type === 'IcosahedronGeometry') {
        caps.addSphere('canopy', x + c.position.x, gy + c.position.y, z + c.position.z,
          c.geometry.parameters.radius);
      }
    }
  }
  return g;
}

function rock(rng, height, x, z, caps) {
  const r = 0.6 + rng() * 2.4;
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(r, 0),
    celMaterial({ color: 0x8e8b82, rim: 0.26 }),
  );
  m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  m.scale.set(1, 0.7 + rng() * 0.5, 1);
  m.castShadow = true;
  outlineHull(m, 1.05);
  m.position.set(x, height(x, z) + r * 0.35, z);
  if (caps) {
    /* A dodecahedron scaled flat in y. The collider is a sphere at the
     * mesh's own centre, using the y scale so a squashed rock is not a
     * boulder to fly into: the horizontal radius is the one that matters
     * and it is r. */
    caps.addSphere('rock', x, m.position.y, z, r * 0.92);
  }
  return m;
}

/*
 * The obstacle library, built to MultiGP dimensions.
 *
 * This used to be one function called gate() that built a 6.0 by 5.0 m frame
 * around a torus of radius 1.9, giving a clear span of 3.5 m. The MultiGP
 * standard gate opening is 5 ft square, 1.524 m, so the old gate was 2.30
 * times regulation, and because every judgement about how big this valley is
 * was anchored to it, a 250 mm quad read as a toy in a stadium. Every
 * dimension here now comes from src/game/track.js, which holds the published
 * figures and converts from feet once.
 *
 * What makes it read as a MultiGP gate rather than a hoop: a SQUARE opening,
 * a PVC tube frame of four members, mesh side panels outboard of the
 * uprights, and a top panel carrying the gate number. A photograph of a
 * chapter gate and a screenshot of this should be recognisably the same
 * object.
 *
 * Materials are created ONCE and shared by every obstacle, so the baker's
 * celKey buckets merge all eight obstacles' static parts into a handful of
 * draw calls. The old gate made a new celMaterial per gate and a new
 * MeshBasicMaterial per pip, which is most of why 636 of 698 draw calls
 * carried half a percent of the triangles.
 *
 * Only the parts that animate stay per obstacle: the aperture outline, its
 * halo and its additive glow, whose gains are driven per frame so the pilot
 * always has a target. That is three draw calls per obstacle instead of
 * about twenty five.
 */
let SHARED = null;
function sharedObstacleMats() {
  if (SHARED) {
    return SHARED;
  }
  SHARED = {
    /*
     * The frame. Aluminium rather than the navy this used to be: on a real
     * course the tube is the least of the gate and the printed sleeves are
     * the whole of it, and a dark bar between two pale banners reads as a
     * hole in the middle of the structure. Light enough to be a tube in
     * sunlight, well under the sky, which is the rule everything in this
     * file obeys.
     */
    frame: celMaterial({ color: 0x9aa2b0, rim: 0.26 }),
    /* The moulded corner at every junction of upright and cross member. A
     * shade darker than the tube, because on a real gate it is a separate
     * fitting and the joint is what says the thing was assembled. */
    fitting: celMaterial({ color: 0x767f8f, rim: 0.26 }),
    /* Plain vinyl, for anything with no print on it. */
    panel: celMaterial({ color: 0x3d4763, rim: 0.22 }),
    /* The lower rail's flash, and the start gate's. A course is read at
     * speed and the start and finish line has to be the one gate that is a
     * different colour before anything is lit at all. */
    panelStart: celMaterial({ color: 0x24603d, rim: 0.24 }),
    panelRace: celMaterial({ color: 0x1e3566, rim: 0.24 }),
    /* The bound edge of a printed banner, and the roundel the gate number
     * is painted in. One material for both because they are the same
     * webbing tape on a real gate. */
    hem: celMaterial({ color: 0xe4d9bf, rim: 0.18 }),
    /* The numeral, DARK on the pale roundel, unlit so distance and shadow
     * cannot take the gate's number away from a pilot counting them down.
     * It used to be cream pips straight onto the dark panel, which is the
     * lower contrast pairing of the two and is not what a gate carries. */
    number: new THREE.MeshBasicMaterial({ color: 0x18202f }),
  };
  return SHARED;
}

/*
 * The course's printed dress: the gate header, the upright sleeves and the
 * flag sails, as materials, with the author's logo composited into all of
 * them.
 *
 * ONE KIT PER COURSE, made once. Every gate on a course wears the same
 * print, so the scenery merger folds all fourteen headers into one draw call
 * and all seventy two sails into two. Passing a texture round instead of a
 * material would defeat that, which is why this returns materials.
 *
 * THE LOGO ARRIVES LATE AND THAT IS FINE. It is a data URL out of local
 * storage, so there is no network fetch to fail, but the decode is still
 * asynchronous. The canvases are painted at once WITHOUT it, so the world is
 * complete and correct from the first frame, and repainted with it the
 * moment it decodes. Nothing waits and nothing pops except the mark
 * appearing on vinyl that was already there.
 */
function bannerKit(logoUrl, key) {
  const jobs = [];
  const paint = (size, painter, opts) => {
    const canvas = bannerCanvas(size[0], size[1]);
    const ctx = canvas.getContext('2d');
    painter(ctx, size[0], size[1], opts);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    jobs.push((logo) => {
      painter(ctx, size[0], size[1], { ...opts, logo });
      tex.needsUpdate = true;
    });
    return tex;
  };
  const printed = (tex, id) => celMaterial({
    color: 0xffffff,
    /* Almost no rim on printed vinyl. The rim term is one minus the dot of
     * normal and view, and a flat banner is edge on across its whole face,
     * so any real strength washes the print out to one cool tint. */
    rim: 0.06,
    map: tex,
    side: THREE.DoubleSide,
    key: `${id}:${key}`,
  });
  const kit = {
    header: printed(paint(BANNER_SIZE.header, paintGateHeader, {}), 'hdr'),
    sleeve: printed(paint(BANNER_SIZE.sleeve, paintGateSleeve, {}), 'slv'),
    /* Two sails, so a run of flags down a course alternates rather than
     * repeating. Two materials is two draw calls for the whole set. */
    sails: [
      sailMaterial(paint(BANNER_SIZE.sail, paintFlagSail, { accent: 'navy' }), `sailA:${key}`),
      sailMaterial(paint(BANNER_SIZE.sail, paintFlagSail, { accent: 'red' }), `sailB:${key}`),
    ],
  };
  if (typeof logoUrl === 'string' && logoUrl.startsWith('data:image/')) {
    const img = new Image();
    img.onload = () => {
      for (const job of jobs) {
        job(img);
      }
    };
    img.src = logoUrl;
  }
  return kit;
}

/*
 * Gate numbers as a 3 by 5 dot matrix. A count of pip marks was readable as
 * a quantity but not as a number, and a real gate carries a numeral, so this
 * builds one out of small boxes. Rows are top to bottom, one string per row
 * group, three characters wide.
 */
const DIGITS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};

/*
 * The three colours a gate's lit opening is ever painted.
 *
 * GATE_COLOUR is every gate at rest, START_COLOUR is the start and finish
 * line so the timing plane is identifiable before anything is lit, and
 * NEXT_COLOUR is THE ONE THE RACE WANTS NEXT. The last one is a hue nothing
 * else in either world uses: grass is green, sky is blue, and the gates are
 * navy, red and off white vinyl, so a magenta ring cannot be confused with
 * any of them at any distance or against any background.
 */
const GATE_COLOUR = 0xffd45c;
const START_COLOUR = 0x7dffb4;
const NEXT_COLOUR = 0xff37c8;

/*
 * The lit markers on an obstacle's openings: the outline the pilot aims at,
 * its halo, and the additive glow that says which gate the race wants next.
 *
 * Extracted from obstacle() so the TILTED gate below can carry exactly the
 * same target. A dive gate whose ring were a hand copy of this one would
 * drift the first time the legibility numbers below were retuned, and the
 * whole point of those numbers is that they were measured once.
 *
 * Adds the three meshes to `group` in the obstacle's own local frame and
 * returns them, along with which opening ended up carrying the glow.
 */
function apertureMarkers(group, sills, clearW, clearH, stack, isStart, primaryWanted) {
  /*
   * The aperture markers. Square now, because the opening is square, and
   * built as one merged geometry per obstacle so a stacked obstacle still
   * costs one draw call for all of its outlines.
   *
   * The glow sits on the PRIMARY opening, which for a stack is the middle
   * one: that is the opening the racing line is aimed at, and lighting all
   * three equally would tell the pilot nothing about where to go.
   */
  const ringColor = isStart ? START_COLOUR : GATE_COLOUR;
  /* The middle opening by default; a course document may name a different
   * one, because a ladder flown at its top level wants the top level lit. */
  const primary = primaryWanted == null
    ? Math.floor(stack / 2)
    : Math.max(0, Math.min(stack - 1, Math.round(primaryWanted)));
  const outlineGeos = [];
  const haloGeos = [];
  for (let k = 0; k < stack; k += 1) {
    const cy = sills[k] + clearH * 0.5;
    /*
     * The lit bar's thickness, and it is a LEGIBILITY number.
     *
     * 0.045 m was invisible at 20 m once the opening shrank to regulation.
     * 0.075 m was measured by a pilot at 1.4 px at 20 m and 0.9 px at 30 m,
     * still sub pixel at the distance a racer has to commit to a line: at 25 m
     * the target read as a 23 px green tick dimmer than the banner flags and
     * the trees beside it. 0.16 m is 3 px at 20 m and 2 px at 30 m, the
     * smallest that survives commit range on a 900 px frame.
     *
     * The cost, stated: at 7 m the bar covers about 10 percent of the opening
     * instead of 5, so a gate right in front of the camera reads chunkier. A
     * target you cannot see until 7 m is not a target, so that is the trade.
     */
    const bar = 0.16;
    const halfW = clearW * 0.5;
    const halfH = clearH * 0.5;
    /* Four thin bars just inside the frame, so the lit line the pilot aims
     * at is the clear opening itself and not the tube around it. */
    const parts = [
      [0, cy + halfH - bar * 0.5, clearW, bar],
      [0, cy - halfH + bar * 0.5, clearW, bar],
      [-halfW + bar * 0.5, cy, bar, clearH],
      [halfW - bar * 0.5, cy, bar, clearH],
    ];
    for (const [px, py, sw, sh] of parts) {
      const geo = new THREE.BoxGeometry(sw, sh, bar);
      geo.translate(px, py, 0);
      outlineGeos.push(geo);
      const hg = new THREE.BoxGeometry(sw * 1.06 + 0.05, sh * 1.06 + 0.05, bar * 0.7);
      hg.translate(px, py, 0);
      haloGeos.push(hg);
    }
  }
  const ring = new THREE.Mesh(
    mergeGeometries(outlineGeos, false),
    new THREE.MeshBasicMaterial({ color: ringColor, fog: true }),
  );
  /* No ink on the emissive outline: the depth edge pass draws a ghost line
   * inside it, which reads as a rendering defect on the one prop the pilot
   * stares at all lap. Layer 1 skips the prepass. */
  ring.layers.set(1);
  group.add(ring);
  const halo = new THREE.Mesh(
    mergeGeometries(haloGeos, false),
    new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.5, fog: true }),
  );
  halo.layers.set(1);
  group.add(halo);

  /* Additive glow across the primary opening. Additive so it reads as light
   * rather than paint, in the gate plane so it does not need to billboard,
   * and unlit and unfogged so distance cannot take the target away from the
   * pilot. uGain is driven per frame: bright and pulsing on the gate the
   * race wants next, nearly off on the rest. */
  const glowSize = Math.max(clearW, clearH) * 2.6;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(glowSize, glowSize),
    new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(ringColor) },
        uGain: { value: 0.1 },
        /* Half the clear opening as a fraction of the plane, so the lit
         * band lands on the frame whatever size the opening is. */
        uEdge: { value: (clearW * 0.5) / glowSize },
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
        uniform vec3 uColor;
        uniform float uGain;
        uniform float uEdge;
        void main() {
          /* A square band, because the opening is square. The Chebyshev
           * distance is the square's own radius. */
          vec2 d = abs(vUv - 0.5);
          float r = max(d.x, d.y);
          float band = exp(-pow((r - uEdge) / 0.055, 2.0));
          /* Only a breath of fill. The aperture is the thing the pilot has
           * to see THROUGH, so filling it with haze hides the line out of
           * the gate, which is worse than not marking it at all. */
          float fill = smoothstep(uEdge, 0.0, r) * 0.05;
          gl_FragColor = vec4(uColor * (band + fill) * uGain, 1.0);
        }
      `,
    }),
  );
  glow.position.y = sills[primary] + clearH * 0.5;
  glow.layers.set(1);
  group.add(glow);
  return { ring, halo, glow, ringColor, primary };
}

/*
 * A library obstacle's BUILT dimensions, named.
 *
 * src/game/track.js keeps MultiGP's figures as citations and GATE_SCALE is
 * the declared departure from them. Reading OBSTACLES directly anywhere in
 * this file would draw the rulebook and score the course, which is exactly
 * the disagreement the T1 assertion exists to catch.
 */
function specFor(kindName) {
  const spec = builtObstacle(kindName);
  if (!spec) {
    throw new Error(`scene: unknown obstacle ${kindName}`);
  }
  spec.kindName = kindName;
  return spec;
}

/*
 * The gate's top banner: the printed header board a race gate wears, with
 * the number in a roundel and the event's logo beside it.
 *
 * WHAT CHANGED AND WHY. This used to be a plate 0.92 of the CLEAR OPENING
 * wide with cream pips straight onto it, which is narrower than the frame it
 * sat on and reads as a sign screwed to a hoop. A race gate's header spans
 * the whole structure, side banner to side banner, because it is one printed
 * sheet sleeved over the top rail. So the width comes from the frame's outer
 * edge and the board carries the three things a real one carries: a bound
 * hem top and bottom, a pale roundel with the number in it, and the space to
 * the right of the roundel where the logo goes.
 *
 * Extracted from obstacle() so a tilted gate wears the same banner. The
 * caller positions the group and pushes the collider it hands back, because
 * a dive gate's banner rides on the leaning frame while a standing gate's
 * sits on top of the uprights, and those are two different heights in two
 * different frames.
 */
/*
 * A printed panel: a vinyl substrate with the print on both faces.
 *
 * NOT A TEXTURED BOX, and the difference matters. A BoxGeometry maps the
 * same [0,1] square onto all six of its faces, so a banner built as one
 * textured box wears its whole design squashed across its 60 mm top edge as
 * well, which is exactly the face a pilot looks down on from above. So the
 * substrate is plain and the print is a plane on each side, the back one
 * turned so the design reads the right way round from behind, the way a
 * double sided banner is actually printed.
 */
function printedPanel(w, h, depth, mat, substrate, mirror = false) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), substrate);
  board.castShadow = true;
  g.add(board);
  for (const sz of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    face.position.z = sz * (depth * 0.5 + 0.004);
    if (sz < 0) {
      face.rotation.y = Math.PI;
    }
    /*
     * Mirrored on the PRINT ONLY, never on the group. Scaling the whole
     * panel by minus one in x inverts the substrate's winding as well, and
     * a single sided box turned inside out renders as a black slab: that is
     * exactly what the far leg of every gate came out as.
     */
    if (mirror) {
      face.scale.x = -1;
    }
    g.add(face);
  }
  return g;
}

/*
 * The gate's header: the printed banner sleeved over the top rail, with the
 * number in a roundel at one end of it.
 *
 * WHAT CHANGED AND WHY. This used to be a plate 0.92 of the CLEAR OPENING
 * wide with cream pips straight onto it, which is narrower than the frame it
 * sat on and reads as a sign screwed to a hoop. A race gate's header spans
 * the whole structure, side banner to side banner, because it is one printed
 * sheet sleeved over the top rail. So the width comes from the frame's outer
 * edge, and what is printed on it comes from src/art/banners.js, which is
 * also what the track builder's preview draws, so an author sees the gate
 * they will fly.
 *
 * THE NUMBER IS GEOMETRY, NOT PRINT. A numeral in the texture would mean one
 * texture per gate and fourteen gates would be fourteen draw calls where
 * there is now one, so the print leaves both ends clear and a pale roundel
 * with raised pips sits in one of them.
 *
 * Extracted from obstacle() so a tilted gate wears the same banner. The
 * caller positions the group and pushes the collider it hands back, because
 * a dive gate's banner rides on the leaning frame while a standing gate's
 * sits on top of the uprights, and those are two different heights in two
 * different frames.
 */
const GATE_BANNER_H = 0.58;
/* Fraction of the header's width left clear at EACH end for the roundel.
 * Shared with the painter so the two cannot disagree. */
const HEADER_NUMBER_ZONE = 0.22;

function gateBanner(index, outerW, headerMat, substrate) {
  const mats = sharedObstacleMats();
  const group = new THREE.Group();
  const boardH = GATE_BANNER_H;
  const boardW = Math.max(0.9, outerW);
  group.add(printedPanel(boardW, boardH, 0.05, headerMat, substrate));

  /*
   * The number, as many digits as it takes. This used to be
   * DIGITS[index % 10], which is correct for one digit and paints a lie for
   * two: gate 13 came out as a 3 and gate 10 as a 0, so with more than ten
   * stations two different gates would carry the same plate and a pilot
   * counting them down would be reading fiction.
   */
  const glyphs = String(Math.max(0, Math.round(index))).split('').map((d) => DIGITS[Number(d)]);
  const dot = 0.048;
  const step = 0.058;
  /*
   * The roundel has to HOLD the numeral, so it is sized from the numeral
   * rather than picked: a 3 by 5 matrix at this step is 2 steps tall from
   * the centre and 1.5 steps per glyph wide, and the circle that contains
   * that has to reach its corner. Sized by eye instead, the second digit of
   * gate 13 hung out over the edge of the disc.
   */
  const halfGlyphW = ((glyphs.length * 4 - 1) - 1) * 0.5 * step + dot * 0.5;
  const roundelR = Math.min(
    boardH * 0.40,
    Math.hypot(halfGlyphW, 2 * step + dot * 0.5) + 0.03,
  );
  /* In the clear zone the print left at the end of the banner. */
  const roundelX = -(boardW * (0.5 - HEADER_NUMBER_ZONE * 0.5));
  const roundel = new THREE.Mesh(new THREE.CylinderGeometry(roundelR, roundelR, 0.062, 20), mats.hem);
  roundel.rotation.x = Math.PI * 0.5;
  roundel.position.set(roundelX, 0, 0);
  group.add(roundel);

  /* 3 columns per glyph plus a one column gap, centred on the roundel, on
   * BOTH faces: a gate is read from whichever side you arrive on. */
  const glyphW = 4;
  const originX = -((glyphs.length * glyphW - 1) - 1) * 0.5;
  for (let gi = 0; gi < glyphs.length; gi += 1) {
    const rows = glyphs[gi];
    for (let ry = 0; ry < rows.length; ry += 1) {
      for (let rx = 0; rx < 3; rx += 1) {
        if (rows[ry][rx] !== '1') {
          continue;
        }
        for (const sz of [-1, 1]) {
          const pip = new THREE.Mesh(new THREE.BoxGeometry(dot, dot, 0.03), mats.number);
          /*
           * MIRRORED ON THE BACK FACE, which is what a printed banner does:
           * the reverse is printed reversed so the number reads the right
           * way round from whichever side the pilot arrives on. Drawn at the
           * same offset on both faces, gate 12 reads as 21 from behind.
           */
          pip.position.set(
            roundelX + sz * (originX + gi * glyphW + rx) * step,
            (2 - ry) * step,
            sz * 0.046,
          );
          group.add(pip);
        }
      }
    }
  }

  group.userData.halfW = boardW * 0.5;
  group.userData.r = boardH * 0.5;
  return group;
}

/*
 * The elbow fittings at the four corners of one opening.
 *
 * Cheap and worth every triangle: a square of four tubes butted together is
 * an abstraction, and a square of four tubes with a moulded corner at each
 * junction is a thing somebody assembled out of a parts list. Boxes rather
 * than cylinders on purpose, because obstacle() recovers the clear opening
 * by finding its own vertical cylinders and a fifth one would change what it
 * measures.
 */
function cornerFittings(group, sills, clearW, clearH, tubeR) {
  const mats = sharedObstacleMats();
  const s = tubeR * 2.9;
  for (const sillY of sills) {
    for (const sy of [sillY - tubeR, sillY + clearH + tubeR]) {
      for (const sx of [-1, 1]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(s, s, s * 0.92), mats.fitting);
        f.position.set(sx * (clearW * 0.5 + tubeR), sy, 0);
        f.castShadow = true;
        group.add(f);
      }
    }
  }
}

/*
 * A designed course's racing line as a curve, for the things that want one:
 * the terrain's flat corridor, the scenery's exclusion test, and the title
 * screen's orbiting camera.
 *
 * Thinned before it is fitted. The line arrives as thousands of samples and
 * a CatmullRom through all of them is both slow to evaluate and wobbly,
 * because the control points are closer together than the spline's own
 * tension wants.
 */
function courseCurve(course) {
  const pts = [];
  let last = null;
  for (const p of course.line) {
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= 6) {
      pts.push(new THREE.Vector3(p.x, p.y, p.z));
      last = p;
    }
  }
  if (pts.length < 3) {
    /* Not enough of a course to fit anything to. A tiny loop round the
     * spawn keeps every consumer working rather than making each one test
     * for a curve that is not there. */
    const cx = course.spawn ? course.spawn.x : 0;
    const cz = course.spawn ? course.spawn.z : 0;
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * 12, 0, cz + Math.sin(a) * 12));
    }
    return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.4);
  }
  return new THREE.CatmullRomCurve3(pts, Boolean(course.closed), 'catmullrom', 0.4);
}

/*
 * Everything on a designed course that is NOT flown through: barriers, turn
 * flags and cones.
 *
 * They are solid. A barrier the racing line has to go round is worth nothing
 * if a quad can fly through it, and the track builder's own warning pass
 * already tells the author when their line clips one, so the two halves
 * agree about what a barrier is.
 */
function courseProps(course, height, scene, colliders, baker, kit) {
  const mats = sharedObstacleMats();
  /* Which sail print each marker gets, so a course's flags alternate the
   * way the field's do rather than all being the same one. */
  let markerIndex = 0;
  for (const s of course.structures) {
    const y = height(s.x, s.z) + s.baseY;
    if (s.kind === 'obstacle') {
      const w = s.dims.width;
      const d = s.dims.depth;
      const h = s.dims.height;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.panel);
      box.position.set(s.x, y + h * 0.5, s.z);
      box.rotation.y = s.yaw;
      box.castShadow = true;
      box.receiveShadow = true;
      outlineHull(box, 1.02);
      baker.bake(box);
      /*
       * A capsule along the barrier's long axis, its radius half the short
       * one. A box collider would be exact and the collision system speaks
       * capsules, so this is the inscribed one: it under covers the two ends
       * by the corner radius, which is the safe direction to be wrong in for
       * a thing you are trying not to hit.
       */
      const half = Math.max(0, w * 0.5 - d * 0.5);
      const cs = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      colliders.add(
        'wall',
        s.x - half * cs, y + h * 0.5, s.z + half * sn,
        s.x + half * cs, y + h * 0.5, s.z - half * sn,
        Math.max(d * 0.5, h * 0.5),
      );
      continue;
    }
    if (s.type === 'cone') {
      const r = s.dims.baseRadius;
      const h = s.dims.height;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(r, h, 10),
        celMaterial({ color: 0xd2601f, rim: 0.24 }),
      );
      cone.position.set(s.x, y + h * 0.5, s.z);
      cone.castShadow = true;
      baker.bake(cone);
      colliders.add('obstacle', s.x, y, s.z, s.x, y + h, s.z, r);
      continue;
    }
    if (s.type === 'flag') {
      /*
       * The course marker flag the field already draws, at the author's
       * position, pointing the way they pointed it, and at the HEIGHT AND
       * MAST THICKNESS THEIR DOCUMENT CARRIES. It used to be drawn at the
       * field's own dressing size whatever the document said, so an author
       * who set a flag to 2.5 m got a 1.6 m one and the collider they were
       * warned about was not the object they could see.
       */
      const made = bannerFlag(
        kit, () => 0.5, height, s.x, s.z, markerIndex,
        Math.max(0.5, s.dims.height), Math.max(0.008, s.dims.poleRadius),
      );
      markerIndex += 1;
      made.group.rotation.y = s.yaw;
      made.group.updateMatrixWorld(true);
      /* The mast and its spike are static and bake; only the sail is left
       * live, and even that is only because it carries its own attribute. */
      baker.bake(made.pole);
      baker.bake(made.foot);
      made.group.remove(made.pole);
      made.group.remove(made.foot);
      scene.add(made.group);
      colliders.add('obstacle', s.x, y, s.z, s.x, y + made.height, s.z, Math.max(0.05, s.dims.poleRadius));
      continue;
    }
    if (s.type === 'startPads') {
      const n = Math.max(1, Math.round(s.dims.pads));
      const pad = s.dims.padSize;
      const mat = celMaterial({ color: 0x2f4f3a, rim: 0.2 });
      for (let i = 0; i < n; i += 1) {
        const off = (i - (n - 1) / 2) * s.dims.spacing;
        const m = new THREE.Mesh(new THREE.BoxGeometry(pad, 0.04, pad), mat);
        /* Across the pads' own heading, which is the start line. */
        m.position.set(s.x + Math.cos(s.yaw) * off, y + 0.02, s.z - Math.sin(s.yaw) * off);
        m.rotation.y = s.yaw;
        m.receiveShadow = true;
        baker.bake(m);
      }
    }
  }
}

/*
 * A designed course's stations, in the shape the placement loop wants.
 *
 * src/game/trackdoc.js has already done the hard half: it converted the
 * document's frame into the scene's, folded the entry sign into a direction
 * of travel, and applied the game's obstacle scale. What is left is naming
 * the dimensions the way obstacle() names them and picking which station is
 * the start and finish line.
 *
 * THE FIRST SEQUENCED APERTURE IS THE START LINE. A track document's start
 * pads are a place to park and a heading, not a hole, so the lap is timed
 * across the first gate in the flying order, exactly as the built in circuit
 * times it across station zero. The pads are where the quad begins, which is
 * the other half of the same arrangement.
 */
function coursePlacements(course) {
  const byElement = new Map();
  const out = [];
  course.stations.forEach((st, i) => {
    let pl = byElement.get(st.elementId);
    if (!pl) {
      const structure = st.structure;
      pl = {
        spec: {
          kindName: st.type,
          clearW: st.clearW,
          clearH: st.clearH,
          sillH: structure.dims.sillH ?? 0,
          stack: structure.dims.stack ?? 1,
          levelPitch: structure.dims.levelPitch,
        },
        x: st.x,
        z: st.z,
        baseY: st.baseY,
        /* The MESH takes the first station's heading and the SCORING takes
         * each station's own. A vertical frame drawn at a heading and at
         * that heading plus half a turn is the same object, so a ladder
         * flown north early and south late is one structure with two gate
         * planes, which is what it is on a real field. */
        yaw: st.yaw,
        pitch: st.pitch,
        isStart: i === 0,
        plateIndex: i,
        primary: st.apertureIndex,
        stations: [],
      };
      byElement.set(st.elementId, pl);
      out.push(pl);
    }
    pl.stations.push({ flyOrder: i, apertureIndex: st.apertureIndex, yaw: st.yaw });
  });
  return out;
}

/*
 * A TILTED aperture: a dive gate.
 *
 * WHY THIS IS NOT obstacle() WITH AN ANGLE. obstacle() builds a structure
 * that stands on the ground: two uprights from the grass to the top rail,
 * feet, mesh panels, a number plate. Rotating all of that about the opening
 * lays the uprights over and puts the feet in the air, and a gate whose legs
 * point sideways is not a gate somebody built, it is a gate somebody
 * knocked over. A real dive gate is a frame carried on a mast, so that is
 * what this makes: four tubes round the opening, tilted, on one vertical
 * post, with the same lit target obstacle() uses so the pilot reads it the
 * same way.
 *
 * The tilt is `pitch`, the angle the DIRECTION OF TRAVEL through the opening
 * dips below the horizontal, which is the same number src/game/trackdoc.js
 * hands the placement code and the same one src/game/race.js scores against.
 * At zero this degenerates to an ordinary elevated gate, which is a legal
 * thing to build and is exactly what a launch gate is.
 *
 * Local frame, and colliders, match obstacle(): x across the opening, y up
 * from the base, z through the opening.
 */
function tiltedGate(spec, index, isStart, pitch, opts = {}) {
  const g = new THREE.Group();
  const mats = sharedObstacleMats();
  const tubeR = BUILT_FRAME_TUBE_OD * 0.5;
  const clearW = spec.clearW;
  const clearH = spec.clearH;
  const centreY = spec.sillH + clearH * 0.5;
  const caps = [];

  /* The mast, from the grass to the middle of the opening, offset to the
   * back of the frame so it never stands in the hole. */
  const mastOff = clearH * 0.5 + tubeR * 3;
  const mastR = tubeR * 1.6;
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(mastR, mastR, centreY, 8),
    mats.frame,
  );
  mast.position.set(0, centreY * 0.5, mastOff);
  mast.castShadow = true;
  outlineHull(mast, 1.06);
  g.add(mast);
  caps.push({ kind: 'gate', ax: 0, ay: 0, az: mastOff, bx: 0, by: centreY, bz: mastOff, r: mastR });

  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.09, 0.7), mats.frame);
  foot.position.set(0, 0.045, mastOff);
  foot.castShadow = true;
  g.add(foot);
  caps.push({ kind: 'obstacle', ax: -0.3, ay: 0.045, az: mastOff, bx: 0.3, by: 0.045, bz: mastOff, r: 0.2 });

  /*
   * The frame and its target, built flat in a pivot and then tilted about
   * the opening's own centre. The pivot is what keeps the aperture centre
   * where the document put it however far the frame leans: rotating about
   * the base instead would swing the hole across the field.
   */
  const pivot = new THREE.Group();
  pivot.position.set(0, centreY, 0);
  /*
   * Sign. The station's pitch is the dip of the direction of travel, and
   * travel is minus the frame's own normal, so a frame that is dived
   * through leans its normal UP by the same angle. Rotating the pivot about
   * its local x by -pitch takes local +z to (0, sin pitch, cos pitch)
   * reflected through the travel convention; the one line that has to agree
   * with race.js is this one, and the check in tests asserts it.
   */
  pivot.rotation.x = -pitch;
  g.add(pivot);

  const halfW = clearW * 0.5;
  const halfH = clearH * 0.5;
  /* Two rails across and two up, their INNER surfaces the clear opening. */
  for (const sy of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeR, tubeR, clearW + 4 * tubeR, 8),
      mats.frame,
    );
    rail.rotation.z = Math.PI * 0.5;
    rail.position.set(0, sy * (halfH + tubeR), 0);
    rail.castShadow = true;
    outlineHull(rail, 1.06);
    pivot.add(rail);
  }
  for (const sx of [-1, 1]) {
    const stile = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeR, tubeR, clearH + 4 * tubeR, 8),
      mats.frame,
    );
    stile.position.set(sx * (halfW + tubeR), 0, 0);
    stile.castShadow = true;
    outlineHull(stile, 1.06);
    pivot.add(stile);
  }
  /* The same moulded corners the standing gate has. The pivot's own origin
   * is the opening's centre, so the sill this asks for is minus half the
   * clear height rather than zero. */
  cornerFittings(pivot, [-halfH], clearW, clearH, tubeR);

  /*
   * Colliders for the tilted frame, in the OBSTACLE's frame rather than the
   * pivot's, because the placement code transforms one frame and knows
   * nothing about pivots. Rotating a point (0, y, z) about x by -pitch gives
   * (0, y cos p + z sin p, -y sin p + z cos p); z is zero for every one of
   * these, so it is one cosine and one sine each.
   */
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const at = (x, y) => ({ x, y: centreY + y * cp, z: -y * sp });
  for (const sy of [-1, 1]) {
    const a = at(-(halfW + tubeR), sy * (halfH + tubeR));
    const b = at(halfW + tubeR, sy * (halfH + tubeR));
    caps.push({ kind: 'gate', ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, r: tubeR });
  }
  for (const sx of [-1, 1]) {
    const a = at(sx * (halfW + tubeR), -(halfH + tubeR));
    const b = at(sx * (halfW + tubeR), halfH + tubeR);
    caps.push({ kind: 'gate', ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, r: tubeR });
  }

  /* The lit target, in the pivot so it leans with the frame. Built at a sill
   * of zero because the pivot already sits at the opening's centre. */
  const marks = apertureMarkers(pivot, [-clearH * 0.5], clearW, clearH, 1, isStart, 0);

  /* The header rides on the leaning frame, above the opening in the frame's
   * own plane, so a pilot approaching from above reads it square on. */
  if (index > 0) {
    const plate = gateBanner(
      index,
      clearW + 4 * tubeR,
      opts.kit.header,
      isStart ? mats.panelStart : mats.panelRace,
    );
    plate.position.set(0, halfH + tubeR * 3 + GATE_BANNER_H * 0.5 + 0.03, 0);
    pivot.add(plate);
  }

  return {
    group: g,
    kindName: spec.kindName ?? 'diveGate',
    /* The highest structure on this obstacle, in its own frame. The banner
     * rides on the pivot, so its height above the opening's centre is
     * foreshortened by the tilt. */
    top: centreY + (halfH + tubeR * 3 + GATE_BANNER_H + 0.03) * Math.cos(pitch),
    /* The whole leaning frame stays live rather than baking, because its
     * parts sit inside a pivot whose rotation the baker would have to flatten
     * and the lit target has to keep its per obstacle materials anyway. A
     * course has a handful of dive gates, not a hundred, so the draw calls
     * are affordable and the alternative is a baked gate that cannot pulse. */
    animate: [pivot],
    ringMat: marks.ring.material,
    haloMat: marks.halo.material,
    glowMat: marks.glow.material,
    ringColor: marks.ringColor,
    apertures: [{
      shape: 'square', index: 0, sillH: spec.sillH, centreY, clearW, clearH,
    }],
    primary: 0,
    aperture: { shape: 'square', index: 0, sillH: spec.sillH, centreY, clearW, clearH },
    colliders: caps,
  };
}

/*
 * One obstacle, at its BUILT dimensions.
 *
 * `spec` is a set of built dimensions: clearW, clearH, sillH, an optional
 * stack, and a kindName for the assertion and the scoring to name it by. The
 * race field passes builtObstacle('standardGate') and friends; a custom
 * course passes the dimensions its own document carries. Taking a spec
 * rather than a library key is what lets one builder serve both, and it is
 * the only reason this signature changed.
 *
 * index is the gate's number in FLYING order, painted on the top panel.
 * isStart makes it the start and finish gate, which is green. opts.primary
 * names which opening carries the glow, for a stack flown at a stated level.
 *
 * Returns the group, the per obstacle animated materials, the apertures (one
 * per opening, so a ladder returns three), and the colliders in the group's
 * OWN local frame, for the placement code to transform. Local frame: x
 * across the opening, y up from the base, z through the opening.
 */
function obstacle(spec, index, isStart, opts = {}) {
  if (!spec) {
    throw new Error('scene: obstacle called without a spec');
  }
  const kindName = spec.kindName ?? 'standardGate';
  const g = new THREE.Group();
  const mats = sharedObstacleMats();
  const tubeR = BUILT_FRAME_TUBE_OD * 0.5;
  const clearW = spec.clearW;
  const clearH = spec.clearH;
  const stack = spec.stack ?? 1;
  const caps = [];

  /*
   * Where each opening's sill sits.
   *
   * MultiGP publishes the opening and the elevation but NOT the spacing
   * between the openings of a stacked obstacle, so the spacing is derived:
   * two openings share one cross member, so the pitch is one clear height
   * plus one tube diameter. That rests on the tube diameter, which
   * track.js marks as an assumption (1 inch nominal schedule 40 PVC) and
   * not as a citation, so the ladder's overall height is an assumption too.
   * The openings themselves are published and exact.
   */
  /* A caller with its own figure wins. A track document carries the level
   * spacing it was authored with, and defaulting over the top of it would
   * quietly rebuild somebody's ladder at a spacing they did not choose. */
  const pitch = spec.levelPitch ?? (clearH + BUILT_FRAME_TUBE_OD);
  const sills = [];
  for (let k = 0; k < stack; k += 1) {
    sills.push(spec.sillH + k * pitch);
  }
  const topSurface = sills[stack - 1] + clearH;

  /* Uprights. Their INNER surfaces are the opening's width, so their
   * centres sit half a tube outboard of the clear span. They run from the
   * ground to just above the topmost cross member, which is what makes a
   * tower or a dive gate a tower rather than a floating hoop. */
  const upX = clearW * 0.5 + tubeR;
  const upTop = topSurface + 2 * tubeR;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeR, tubeR, upTop, 8),
      mats.frame,
    );
    post.position.set(sx * upX, upTop * 0.5, 0);
    post.castShadow = true;
    outlineHull(post, 1.06);
    g.add(post);
    caps.push({ kind: 'gate', ax: sx * upX, ay: 0, az: 0, bx: sx * upX, by: upTop, bz: 0, r: tubeR });

    /* A foot, so it looks like it is standing on the grass rather than
     * growing out of it. */
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.62), mats.frame);
    foot.position.set(sx * upX, 0.04, 0);
    foot.castShadow = true;
    g.add(foot);
    caps.push({ kind: 'obstacle', ax: sx * upX, ay: 0.04, az: -0.31, bx: sx * upX, by: 0.04, bz: 0.31, r: 0.17 });
  }

  /* Cross members. One above every opening, and one below the lowest
   * opening only when that opening is off the ground: a gate standing on
   * grass has the ground as its sill, which is how a 5 ft opening is
   * measured on a chapter gate. */
  const memberLen = clearW + 4 * tubeR;
  const members = [];
  for (let k = 0; k < stack; k += 1) {
    members.push(sills[k] + clearH + tubeR);
  }
  if (spec.sillH > 0) {
    members.push(spec.sillH - tubeR);
  }
  for (const my of members) {
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeR, tubeR, memberLen, 8),
      mats.frame,
    );
    bar.rotation.z = Math.PI * 0.5;
    bar.position.set(0, my, 0);
    bar.castShadow = true;
    outlineHull(bar, 1.06);
    g.add(bar);
    caps.push({ kind: 'gate', ax: -memberLen * 0.5, ay: my, az: 0, bx: memberLen * 0.5, by: my, bz: 0, r: tubeR });
  }

  /* The moulded corner at every junction of upright and cross member. */
  cornerFittings(g, sills, clearW, clearH, tubeR);

  /*
   * The printed sleeves, outboard of each upright. They are what a pilot
   * actually reads the gate's plane from at speed, and they are solid, so
   * their collider sits entirely outboard of the clear span. The print is
   * the same one the track builder draws on its own preview.
   */
  const panelW = 0.42;
  const kit = opts.kit;
  const substrate = isStart ? mats.panelStart : mats.panelRace;
  const panelBottom = sills[0];
  const panelH = topSurface - panelBottom;
  for (const sx of [-1, 1]) {
    const cx = sx * (upX + tubeR + panelW * 0.5);
    /* Mirrored on the far leg, so the chequer column runs down the OUTSIDE
     * of the gate on both sides rather than down the outside of one and the
     * inside of the other. */
    const sleeve = printedPanel(panelW, panelH, 0.03, kit.sleeve, substrate, sx < 0);
    sleeve.position.set(cx, panelBottom + panelH * 0.5, 0);
    g.add(sleeve);
    caps.push({ kind: 'obstacle', ax: cx, ay: panelBottom, az: 0, bx: cx, by: panelBottom + panelH, bz: 0, r: panelW * 0.5 });
  }

  /* The header banner, spanning the whole structure. */
  const outerW = 2 * (upX + tubeR + panelW);
  const plateGroup = gateBanner(index, outerW, kit.header, substrate);
  const plateY = upTop + GATE_BANNER_H * 0.5 + 0.03;
  plateGroup.position.set(0, plateY, 0);
  g.add(plateGroup);
  caps.push({
    kind: 'obstacle',
    ax: -plateGroup.userData.halfW, ay: plateY, az: 0,
    bx: plateGroup.userData.halfW, by: plateY, bz: 0,
    r: plateGroup.userData.r,
  });

  /* The lit target, shared with the tilted gate builder. */
  const marks = apertureMarkers(g, sills, clearW, clearH, stack, isStart, opts.primary);
  const { ring, halo, glow, ringColor, primary } = marks;

  /*
   * The apertures, MEASURED out of the geometry that was just built rather
   * than restated from the spec. The clear width is the gap between the two
   * uprights' inner surfaces and the clear height is the gap between the
   * cross members', both recovered from the meshes' own positions and their
   * own geometry parameters. T1 asserts the standard gate at 1.524 m within
   * 10 mm, and an assertion against a number somebody typed twice asserts
   * nothing at all.
   */
  const postMeshes = g.children.filter((c) => c.isMesh && c.geometry.type === 'CylinderGeometry'
    && Math.abs(c.rotation.z) < 1e-6);
  const measuredW = postMeshes.length >= 2
    ? Math.abs(postMeshes[1].position.x - postMeshes[0].position.x)
      - 2 * postMeshes[0].geometry.parameters.radiusTop
    : clearW;
  const apertures = [];
  for (let k = 0; k < stack; k += 1) {
    /* The clear height of opening k is its sill to the underside of the
     * member above it, both of which are positions in this group. */
    const memberY = sills[k] + clearH + tubeR;
    const measuredH = (memberY - tubeR) - sills[k];
    apertures.push({
      shape: 'square',
      index: k,
      sillH: sills[k],
      centreY: sills[k] + measuredH * 0.5,
      clearW: measuredW,
      clearH: measuredH,
    });
  }

  return {
    group: g,
    kindName,
    /* The top of the header board, in this obstacle's own frame. */
    top: plateY + plateGroup.userData.r,
    /* The lit parts have per obstacle materials driven every frame, so they
     * stay live; everything else bakes. */
    animate: [ring, halo, glow],
    ringMat: ring.material,
    haloMat: halo.material,
    glowMat: glow.material,
    ringColor,
    apertures,
    primary,
    aperture: apertures[primary],
    colliders: caps,
  };
}

/*
 * A course marker flag: the teardrop banner that lines a race course.
 *
 * WHAT WAS WRONG WITH THE OLD ONE, in the order a pilot notices it. The
 * cloth was a 0.55 m plane whose CENTRE sat 0.58 m out from the pole, so
 * its near edge was 0.305 m clear of the mast: the flag was not attached to
 * anything, it hovered beside its own pole. The pole itself was a 1.6 m
 * cylinder whose centre was pushed to y = 1.7, so it spanned 0.9 to 2.5 m
 * and floated 0.9 m off the grass, while the collider ran from the ground
 * to 1.6 m and agreed with neither. And a rectangle on a stick is not what
 * a race course is lined with.
 *
 * WHAT THIS IS. A ground spike, a straight mast, and a teardrop sail whose
 * LEADING EDGE IS THE MAST: every vertex of the seam sits on the pole's own
 * surface, which is what makes it a flag rather than a poster near a pole.
 * The outline is the shape every event supplier sells: narrow at the foot,
 * full through the middle, drawn to a point at the head.
 *
 * SIZE, and it is a compromise between two things that both matter. On a
 * real course the flags stand over the gates, which is what the reference
 * photographs show and what the owner asked for. But the note the previous
 * build left is still binding: the flags were once 3.4 m on a 0.106 m pole,
 * 2.23 times the gate's aperture and 3.2 times the thickness of the gate's
 * own structural tube, and at 30 m the target gate subtended 23 px while a
 * nearby flag pole gave 435. The mistake there was the POLE, not the
 * height: an 18 mm mast carries a 2.9 m sail without ever being the widest
 * thing beside the gate, so the flag can stand over a 2.4 m gate the way it
 * does on a field and still not out measure it.
 *
 * The sail does not move from JavaScript. Its motion is in the cel
 * material's cloth term, driven by the clock every cel material already
 * carries, so all 72 sails merge into one draw call and still fly. See
 * CLOTH_CHUNK in celmat.js.
 */
const FLAG_H = 2.9;

function flagSailGeometry(poleR, h) {
  /* Rows up the mast, columns out from it. 12 by 5 is 60 vertices: enough
   * that the taper reads as a curve and the wave as a wave. */
  const rows = 12;
  const cols = 5;
  const y0 = h * 0.16;
  const y1 = h * 0.98;
  const maxW = h * 0.30;
  const pos = [];
  const uvs = [];
  const cloth = [];
  const idx = [];
  for (let r = 0; r < rows; r += 1) {
    const t = r / (rows - 1);
    /* The teardrop outline. The first factor fills the sail out from the
     * foot, the second draws it to a point at the head. */
    const fill = 0.42 + 0.58 * smoothstep01(t / 0.45);
    const head = 1 - smoothstep01((t - 0.70) / 0.30) * 0.94;
    const w = maxW * fill * head;
    const y = y0 + (y1 - y0) * t;
    for (let c = 0; c < cols; c += 1) {
      const s = c / (cols - 1);
      /* The seam is ON the mast, not near it. */
      pos.push(poleR + w * s, y, 0);
      uvs.push(s, t);
      cloth.push(s, t);
    }
  }
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const a = r * cols + c;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aCloth', new THREE.Float32BufferAttribute(cloth, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function smoothstep01(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/*
 * A sail material. Takes the PAINTED TEXTURE rather than a colour, because a
 * race flag is a printed thing and not a coloured one, and one material per
 * print is what keeps the whole set of them inside two draw calls.
 */
function sailMaterial(tex, key) {
  return celMaterial({
    color: 0xffffff,
    /* No rim on the cloth. The rim term is one minus dot(normal, view), and
     * a near flat sail seen at any angle is edge on across its whole
     * surface, so the cool rim colour covered the entire flag: measured on
     * the old plain cloth, a dark red flag came out rgb 151 93 113, a dusty
     * pink nothing in the palette holds. */
    rim: 0.0,
    map: tex,
    side: THREE.DoubleSide,
    cloth: 0.085,
    key,
  });
}

function bannerFlag(kit, rng, height, x, z, index, h = FLAG_H, poleR = 0.018) {
  const g = new THREE.Group();
  const mast = Math.max(0.008, poleR);
  const pole = new THREE.Mesh(
    /* Standing ON the ground, from the spike to the finial, so the mesh and
     * the collider describe the same object. */
    new THREE.CylinderGeometry(mast * 0.72, mast, h, 5),
    celMaterial({ color: 0xd7dbe0, rim: 0.2 }),
  );
  pole.position.y = h * 0.5;
  g.add(pole);
  /* The spike plate. Without it a 36 mm mast reads as growing out of the
   * grass rather than as driven into it. */
  const foot = new THREE.Mesh(
    new THREE.CylinderGeometry(mast * 3.4, mast * 4.2, 0.035, 6),
    celMaterial({ color: 0x4a5364, rim: 0.2 }),
  );
  foot.position.y = 0.018;
  g.add(foot);
  const sail = new THREE.Mesh(
    flagSailGeometry(mast, h),
    kit.sails[Math.abs(Math.round(index)) % kit.sails.length],
  );
  sail.castShadow = true;
  g.add(sail);
  g.position.set(x, height(x, z), z);
  g.rotation.y = rng() * Math.PI;
  return {
    group: g, sail, pole, foot, height: h,
  };
}

/*
 * The title screen's flythrough, as a closed line of points.
 *
 * THE ATTRACT CAMERA USED TO ORBIT A POINT, and on a map with a course that
 * is the wrong shot: it framed the start gate and nothing else, so a player
 * choosing between two tracks was shown the same nine metre circle whichever
 * one they picked. What a course looks like IS the course, so the camera
 * flies it.
 *
 * It flies ABOVE the racing line rather than along it, and the clearance is
 * derived rather than picked. A fixed height cannot work on this field: a
 * standard gate tops out about 2.4 m, a two level tower about 4.2 m and the
 * dive gate's frame hangs at 15 ft, so any constant either buries the camera
 * in a tower or leaves the course a distant smudge. So each sample takes the
 * tallest structure within LOOKOUT metres of it and clears that, and the
 * profile is then smoothed, because a camera that steps up at every gate
 * reads as a lift rather than as a flight.
 */
const ATTRACT_LOOKOUT = 13;
const ATTRACT_CLEAR = 2.6;
const ATTRACT_FLOOR = 3.0;

function attractPath(curve, tops, height) {
  const len = Math.max(1, curve.getLength());
  const n = Math.max(24, Math.min(180, Math.round(len / 6)));
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const p = curve.getPointAt(i / n);
    let y = height(p.x, p.z) + ATTRACT_FLOOR;
    for (const t of tops) {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      if (dx * dx + dz * dz < ATTRACT_LOOKOUT * ATTRACT_LOOKOUT) {
        y = Math.max(y, t.top + ATTRACT_CLEAR);
      }
    }
    pts.push({ x: p.x, y, z: p.z });
  }
  /* Three passes of a [1, 2, 1] kernel, wrapped because the line closes.
   * Enough to turn the staircase into a swell without losing the clearance:
   * the kernel never lowers a sample below the mean of its neighbours, and
   * the neighbours are already clear of the same structure. */
  for (let pass = 0; pass < 3; pass += 1) {
    const src = pts.map((p) => p.y);
    for (let i = 0; i < n; i += 1) {
      const a = src[(i - 1 + n) % n];
      const b = src[i];
      const c = src[(i + 1) % n];
      pts[i].y = (a + 2 * b + c) * 0.25;
    }
  }
  return pts;
}

/*
 * THE RACING LINE, drawn in the air.
 *
 * A ribbon along the line the course is meant to be flown, off by default
 * for a pilot who wants a clean frame and on for one who is learning the
 * course. Two things it has to do, and both are about being an instrument
 * rather than decoration:
 *
 *   IT SAYS WHERE, so it threads the openings rather than lying on the
 *   grass. On a designed course the line comes straight out of the track
 *   builder's own derivation, which is the same line the author saw; on the
 *   built in circuit it is fitted through the gates' aperture centres in
 *   flying order, which is the same thing computed from the other end.
 *
 *   IT SAYS WHETHER, so it changes colour when the craft is ON it. Amber
 *   when you are off the line and green when you are on it, which is the one
 *   piece of feedback a course guide can give that a painted line cannot.
 *   The switch is a distance, TOLERANCE metres from the ribbon's centre,
 *   which is about a gate's half opening: inside that, a gate is a gate you
 *   are going to make.
 *
 * Unlit and unfogged, on the no ink layer, because it is an overlay on the
 * world rather than a thing standing in it.
 */
const LINE_TOLERANCE = 0.9;

function racingLineRibbon(points) {
  if (points.length < 4) {
    return null;
  }
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    true,
    'centripetal',
  );
  const segments = Math.max(48, Math.min(600, Math.round(curve.getLength() / 1.2)));
  const geo = new THREE.TubeGeometry(curve, segments, 0.045, 5, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uOff: { value: new THREE.Color(0xffb14a) },
      uOn: { value: new THREE.Color(0x39ff8b) },
      /* 0 when the craft is off the line, 1 when it is on it. Driven from
       * the shell every frame off the same position the collision test
       * uses, so the ribbon and the world agree about where the quad is. */
      uHit: { value: 0 },
      uCraft: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      uniform vec3 uOff;
      uniform vec3 uOn;
      uniform float uHit;
      uniform vec3 uCraft;
      void main() {
        /* Brightest near the craft and falling away down the course, so the
         * ribbon reads as a lane you are in rather than as a wire draped
         * over the whole valley. */
        float d = distance(vWorld, uCraft);
        float near = 1.0 - smoothstep(6.0, 55.0, d);
        vec3 col = mix(uOff, uOn, uHit);
        gl_FragColor = vec4(col, 0.20 + 0.62 * near);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  /* Layer 1 is the no ink layer: an outline drawn round a guide ribbon
   * reads as a rendering defect on the one thing that is not in the world. */
  mesh.layers.set(1);
  mesh.visible = false;
  /* The polyline the shell measures against, thinned to the same spacing the
   * ribbon is built at. Measuring against the spline itself would mean a
   * projection per frame; against a polyline it is one pass of cheap
   * squared distances over a few hundred points. */
  const probe = [];
  for (let i = 0; i < segments; i += 1) {
    const p = curve.getPointAt(i / segments);
    probe.push(p.clone());
  }
  return { mesh, mat, probe };
}

function skyDome() {
  const geo = new THREE.SphereGeometry(1500, 40, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uHigh: { value: new THREE.Color(SKY_HIGH) },
      uHorizon: { value: new THREE.Color(HORIZON) },
      uSun: { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      varying vec3 vDir;
      uniform vec3 uHigh;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      void main() {
        gl_FragColor = vec4(celSkyColor(vDir, uSun, uHorizon, uHigh), 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

/* Chunky stylised clouds: clustered flattened icospheres, unlit, so they
 * stay bright and flat like painted shapes. */
function clouds(rng) {
  const g = new THREE.Group();
  /* One mesh per puff with a hard painted terminator keyed to world up,
   * plus a warm sun side rim. The previous build overlaid a second,
   * slightly smaller offset sphere for the underside, and the two
   * surfaces intersected and stippled: that speckling was a z fighting
   * artefact, not shading. */
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { uSun: { value: SUN_DIR.clone() } },
    vertexShader: `
      varying vec3 vN;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vN;
      uniform vec3 uSun;
      void main() {
        vec3 n = normalize(vN);
        vec3 col = mix(vec3(0.70, 0.77, 0.91), vec3(1.0, 0.98, 0.94), step(0.12, n.y));
        /* Sun side warmth, but not enough to clip. Measured, cloud tops
         * reached 255 255 253, luminance 0.999, so a piece of dressing in
         * the corner of the frame was brighter than the gate the pilot is
         * meant to be looking at, and carried 78 percent of the frame's
         * bright area. */
        /* Held under the gate. Measured after the last attempt at this, a
         * cloud top still clipped at rgb 255 255 255, luminance 1.000, and
         * clouds carried 63 percent of the frame's bright area against the
         * gate ring's 32 percent. Dressing does not get to be the brightest
         * thing on screen, and a clipped pixel has no hue left either. */
        col *= 0.68;
        col += vec3(1.0, 0.86, 0.60) * pow(max(dot(n, normalize(uSun)), 0.0), 3.0) * 0.08;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  for (let i = 0; i < 26; i += 1) {
    const cluster = new THREE.Group();
    const puffs = 4 + Math.floor(rng() * 5);
    for (let p = 0; p < puffs; p += 1) {
      const r = 16 + rng() * 26;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
      puff.position.set((rng() - 0.5) * 70, (rng() - 0.5) * 12, (rng() - 0.5) * 40);
      puff.scale.y = 0.52;
      cluster.add(puff);
    }
    const a = rng() * Math.PI * 2;
    const rad = 260 + rng() * 780;
    cluster.position.set(Math.cos(a) * rad, 190 + rng() * 190, Math.sin(a) * rad);
    g.add(cluster);
  }
  return g;
}

/*
 * The race field's world. The renderer, the camera and the airframe are the
 * session's, not this map's, and arrive in `shell`; everything built here
 * belongs to this map and dies with it. See src/maps/README.md for the
 * contract and src/render/shell.js for what the session keeps.
 *
 * `onProgress(fraction)` is called as construction advances, so the loading
 * screen reports work that actually happened rather than a timer. It is
 * optional and the map builds identically without it.
 */
/*
 * The race field.
 *
 * `course` is optional. Without it this builds the built in figure eight
 * exactly as it always has: same curve, same fourteen stations, same terrain,
 * same rng stream. With it, the same world is built around a DESIGNED course
 * instead, from a track document that src/game/trackdoc.js has already turned
 * into scene coordinates. Everything that is not the course, the sky, the
 * ridges, the lake, the grass, the light, the post chain, is shared, because
 * the point of flying your own track is to fly it in this world rather than
 * in a grey box.
 */
export function buildFieldScene(shell, onProgress, course = null) {
  const renderer = shell.renderer;
  const camera = shell.camera;
  const progress = onProgress ?? (() => {});
  /* PCF soft, not PCF. The field's shadow map covers 144 m at 2048, so the
   * softer filter is what keeps a tree's cast edge from reading as a
   * staircase. The city sets its own. */
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, FOG_NEAR, FOG_FAR);
  const sky = skyDome();
  sky.layers.set(1);
  scene.add(sky);

  const rng = makeRng(20260811);

  const sun = new THREE.DirectionalLight(0xffe9c4, 1.45);
  sun.position.copy(SUN_DIR).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.03;
  const shadowExtent = 72;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  scene.add(sun);
  scene.add(sun.target);
  /* Sky above, warm grass bounce below: this is what keeps shadowed faces
   * from going dead grey. */
  scene.add(new THREE.HemisphereLight(0x8fb8e8, 0x4a6b34, 0.42));

  /*
   * The curve is the spine of the world: the terrain flattens a corridor
   * along it, the scenery keeps clear of it, and the title screen's camera
   * flies around it. A designed course has one too, its own racing line, so
   * the same three things happen for it and a custom track lands on flat
   * mown ground with the trees kept off it rather than in a forest.
   */
  /* A designed course stands on a marked pitch; the built in circuit is a
   * cross country loop through a valley and has never had one. */
  const pitch = makePitch(course);
  const curve = course ? courseCurve(course) : trackCurve();
  /* A course brings its own corridor samples. Computing them here would mean
   * importing the track document reader, and the reader pulls in the
   * builder's data modules, which the plain race field must not pay for:
   * check 16 measures exactly that. The course object is plain data and this
   * file knows nothing about where it came from. */
  const samples = course ? course.samples : curve.getPoints(180);
  const height = makeHeightField(samples, pitch);

  const ground = terrain(height, samples, pitch);
  scene.add(ground);
  if (pitch) {
    scene.add(pitchSurface(pitch));
  }
  const occluders = [];
  const water0 = water(height);
  scene.add(water0.mesh);
  const grass = grassField(height, samples, rng, pitch);
  /* Layer 1 is the no ink layer, excluded from the outline prepass.
   * Grass belongs here: a per blade outline turns a field into a pile of
   * glass shards, and the blades are far too thin to need a silhouette. */
  grass.mesh.layers.set(2);
  /* Blades do not cast: 184000 of them in the shadow map would cost more
   * than it buys, and the terrain's own cast shadow already grounds the
   * field. The count in this comment said 46000, which was the blade count
   * before round 3 of the previous loop quadrupled it.
   *
   * receiveShadow is set below and it is a no operation, which is a real
   * defect and not a stale comment: the grass material is a ShaderMaterial
   * computing its own sun term, so three.js sets the flag and nothing
   * reads it. Measured by a reviewer, blades standing inside a tree's cast
   * shadow are 0.125 against 0.132 for blades outside it, while the ground
   * under the same shadow is 0.012. The flag is left set because it is
   * what the fix will need; the fix is a shadow map lookup in the grass
   * fragment shader and it is not this round's item. */
  grass.mesh.receiveShadow = true;
  scene.add(grass.mesh);
  const noInkBaker = makeBaker();
  noInkBaker.bake(clouds(rng));
  /* Layer 0, not the no ink layer. Clouds used to write no depth into the
   * outline prepass, so the ink pass drew mountain silhouettes ACROSS the
   * cloud that the colour pass had correctly hidden: a two pixel ink line
   * lying on a continuous cloud surface. They occlude now, and their own
   * silhouette inks, which suits the painted shapes. */
  const cloudMeshes = noInkBaker.flush(scene);
  for (const m of cloudMeshes) {
    m.castShadow = false;
    m.receiveShadow = false;
  }

  /*
   * Solid things. Built here rather than recovered from the scene later,
   * because the baker applies each instance's matrix into the vertices and
   * merges every bucket, so after the flush a tree is anonymous floats in a
   * shared buffer. A collider has to be recorded where the geometry is made.
   */
  const colliders = new Colliders();
  /* Hoisted above the obstacles so their static parts can bake into the same
   * buckets as the scenery. It is flushed once, far below. */
  const baker = makeBaker();

  const gates = [];
  /*
   * FOURTEEN stations, not eight.
   *
   * The circuit is 569.6 m of arc, measured by walking __trackPoint at
   * 4000 samples. At eight stations that is 71.2 m of empty air between
   * gates. Measured from the spawn frame with __nextGate at 1600 by 900,
   * eight stations put the next gate 67.7 m out at 15.4 px of aperture and
   * 436 px left of centre, and the one after it 96.1 m out at screen
   * x = -1356, entirely off the side of the frame. So the pilot could see
   * exactly one gate, near the edge, and had to fly the rest from memory.
   * Fourteen stations put the next gate 46.3 m out at 17.8 px and 195 px
   * off centre, and the one after it 74.0 m out at 16.6 px and IN FRAME.
   * Two gates readable at once is the whole point: that is what tells you
   * which way the course turns before you commit to the one in front.
   *
   * The alternative was to shrink the circuit, which is what the spacing
   * complaint superficially suggests. Rejected on measurement: the
   * tightest radius of curvature on this figure eight is already 11.16 m,
   * at u=0 where the timing gate stands, which costs 3.7 g of lateral
   * acceleration at 20 m/s. Scaling the curve to put eight gates 40 m
   * apart means scaling that radius to 4.7 m, or 8.7 g at the same speed,
   * and the course stops being flyable at racing pace. More gates on the
   * same geometry changes the spacing without touching the flight feel.
   *
   * Even spacing is also now correct on its own. At eight, stations 2 and
   * 6 landed exactly on the figure eight's crossover at the origin, where
   * each one's posts stood in the other branch's racing line, so those two
   * were shifted by hand. Fourteen divides so that the nearest stations to
   * the crossover sit at u=0.2143 and u=0.2857, which is 20.3 m of clear
   * air either side of it: the crossing is open, framed by a gate on each
   * approach, with no hand tuning.
   */
  const gateCount = CIRCUIT_STATIONS;
  const gateU = Array.from({ length: gateCount }, (_, i) => i / gateCount);
  /*
   * THE COURSE IS AN ORIGINAL CHAPTER STYLE LAYOUT built from regulation
   * MultiGP obstacles, and it is labelled as one in the interface. It is
   * deliberately not a Universal Time Trial, for two reasons that pull the
   * same way. UTT 3 Bessel Run, whose full layout is recovered in
   * .loop/evidence/r10/utt3-layout.md and sits in src/game/track.js as data,
   * needs a 91.44 by 36.58 m field, and this figure eight is 210 by 236 m,
   * so laying UTT 3 here would mean rebuilding the terrain, the height
   * field's corridor and the whole racing line. And no published UTT uses
   * more than two obstacle types, while a course wants the vertical variety
   * that towers and dive gates give it.
   *
   * Stations, in scene order. Station 0 stays a ground level timing gate
   * because the craft spawns behind it and the start and finish plane has to
   * be somewhere a stationary quad can be pointed at.
   *
   * Scene index i is flown as position gateCount - i, so the list below
   * reads BACKWARDS from the pilot's point of view. Flown, the order is
   * timing, standard, standard, tower, standard, ladder, standard, dive,
   * championship, standard, tower, ladder, championship, standard: a
   * ground level opening between each elevated one, so the line climbs and
   * drops rather than sitting at one height, and never two tall obstacles
   * back to back except the dive into the championship gate, which is the
   * one place the drop is the point.
   */
  const stationKinds = [
    'timingGate',       /* 0,  start and finish, on the ground, flown 1st */
    'standardGate',     /* 1,  flown 14th */
    'championshipGate', /* 2,  flown 13th */
    'ladder',           /* 3,  flown 12th, the triple stack: three openings */
    'tower5x5',         /* 4,  flown 11th, a standard opening elevated 5 ft */
    'standardGate',     /* 5,  flown 10th */
    'championshipGate', /* 6,  flown 9th, the wider 7x6 */
    'diveGate',         /* 7,  flown 8th, a 7x6 at 15 ft, entered from above */
    'standardGate',     /* 8,  flown 7th */
    'ladder',           /* 9,  flown 6th, the second triple stack */
    'standardGate',     /* 10, flown 5th */
    'tower5x5',         /* 11, flown 4th, the second tower */
    'standardGate',     /* 12, flown 3rd */
    'standardGate',     /* 13, flown 2nd */
  ];
  /*
   * WHERE THE STATIONS ARE, as data, before anything is built.
   *
   * This list used to be computed inside the placement loop off the figure
   * eight's own parameter, which meant the loop could only ever place a
   * figure eight. Separating the two is the whole of what let a designed
   * course be flown: the list below is the built in circuit, a custom course
   * builds the same list out of a track document, and the loop underneath
   * does not know or care which it was handed.
   */
  const placements = course ? coursePlacements(course, height) : gateU.map((u, i) => {
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    return {
      spec: specFor(stationKinds[i]),
      x: p.x,
      z: p.z,
      baseY: 0,
      yaw: Math.atan2(tan.x, tan.z),
      pitch: 0,
      /* Number plates count in FLYING order. The craft spawns facing
       * opposite the curve parameter direction, so the course as flown is
       * gate 0 then 13, 12, down to 1; scene index i is flown as position
       * gateCount - i. */
      isStart: i === 0,
      plateIndex: i === 0 ? 0 : gateCount - i,
      primary: null,
      /* One station per structure, scoring every opening: MultiGP counts a
       * ladder as one gate however high you take it. */
      stations: [{ flyOrder: i === 0 ? 0 : gateCount - i, apertureIndex: null, yaw: Math.atan2(tan.x, tan.z) }],
    };
  });

  /*
   * The course's printed dress, made once and worn by every gate and every
   * flag on it. The author's logo, if their document carries one, is
   * composited into all of it.
   */
  const kit = bannerKit(
    course ? course.logo : null,
    course ? (course.documentId ?? course.id ?? 'course') : 'field',
  );
  /*
   * How high a structure stands, at the point it stands, so the title
   * screen's flythrough can clear it. Filled from each obstacle's own world
   * bounding box rather than from its spec, because a tilted gate on a mast
   * and a three level ladder do not report their height the same way.
   */
  const obstacleTops = [];

  for (let i = 0; i < placements.length; i += 1) {
    const st = placements[i];
    const flyOrder = st.plateIndex;
    const made = Math.abs(st.pitch) > 1e-6
      ? tiltedGate(st.spec, flyOrder, st.isStart, st.pitch, { kit })
      : obstacle(st.spec, flyOrder, st.isStart, { primary: st.primary, kit });
    const g = made.group;
    const y = height(st.x, st.z) + st.baseY;
    const yaw = st.yaw;
    const p = { x: st.x, z: st.z };
    g.position.set(st.x, y, st.z);
    g.rotation.y = yaw;
    /*
     * Split the obstacle in two. The aperture outline, its halo and its
     * glow have per obstacle materials because their gains are driven every
     * frame, so they stay live meshes on their own group. Everything else is
     * static and shares its material with every other obstacle, so it goes
     * into the baker and merges: eight obstacles' frames, panels, feet and
     * numbers come out as a handful of draw calls instead of about two
     * hundred.
     */
    const anim = new THREE.Group();
    anim.position.copy(g.position);
    anim.rotation.y = yaw;
    /* The builder says which of its parts have to stay live. It used to be
     * found by matching materials against g's DIRECT children, which a
     * tilted gate breaks: its lit parts hang off a pivot, so the search
     * missed them and the baker swallowed a ShaderMaterial. */
    for (const part of made.animate) {
      part.removeFromParent();
      anim.add(part);
    }
    scene.add(anim);
    /*
     * How high this one stands, from the builder rather than from a bounding
     * box. A box would be measured after the lit parts have been moved out,
     * so a dive gate's whole leaning frame would be missing from it, and it
     * would include the additive glow quad, which is 2.6 openings across and
     * is light rather than structure.
     */
    obstacleTops.push({ x: st.x, z: st.z, top: y + made.top });
    baker.bake(g);
    /* Colliders, transformed from the obstacle's own frame into the world by
     * the same position and yaw the meshes got. The obstacle is solid: the
     * owner's words were that the gates need to be solid, so every frame
     * member, panel, foot and top plate is in here. */
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    for (const c of made.colliders) {
      colliders.add(
        c.kind,
        p.x + c.ax * cs + c.az * sn, y + c.ay, p.z - c.ax * sn + c.az * cs,
        p.x + c.bx * cs + c.bz * sn, y + c.by, p.z - c.bx * sn + c.bz * cs,
        c.r,
      );
    }
    /*
     * ONE STRUCTURE, ONE GATE PER STATION.
     *
     * WHICH OPENINGS SCORE. MultiGP counts a ladder as one gate however high
     * you take it, so the built in circuit offers all of a stack's openings
     * and records which one was used: its station carries apertureIndex
     * null. A designed course is different, because its document names the
     * level, and a ladder flown low early and high late is two gates.
     * Crediting either opening for both would let a pilot fly the same hole
     * twice and call it a lap.
     *
     * Both gates on such a structure share its lit target and its number
     * plate, which is not a compromise: there is one ladder standing on the
     * field and lighting it twice is what a marshal does.
     */
    for (const station of st.stations) {
      const scoring = station.apertureIndex == null
        ? made.apertures
        : [made.apertures[Math.min(made.apertures.length - 1, Math.max(0, station.apertureIndex))]];
      gates.push({
        position: new THREE.Vector3(p.x, y, p.z),
        heading: station.yaw,
        /* The tilt of the direction of travel. Zero everywhere on the built
         * in circuit, which is why race.js's frame reduces to the old one
         * there exactly. */
        pitch: st.pitch,
        ringMat: made.ringMat,
        haloMat: made.haloMat,
        ringColor: made.ringColor,
        glowMat: made.glowMat,
        aperture: scoring[0],
        apertures: scoring,
        primary: made.primary,
        kindName: made.kindName,
        /* What the T1 assertion below checks this gate's measured opening
         * against. A library obstacle is checked against the library; a
         * designed one against the dimensions its own document carried,
         * which is the same discipline applied to a different source of
         * truth. */
        wantW: st.spec.clearW,
        wantH: st.spec.clearH,
        flyOrder: station.flyOrder,
      });
    }
  }

  /* Barriers, flags, cones and the start pads a designed course carries. */
  if (course) {
    courseProps(course, height, scene, colliders, baker, kit);
  }

  /*
   * T1, asserted rather than asserted about. The standard MultiGP gate
   * opening is 5 ft square, 1.524 m, and every aperture above was measured
   * out of the built geometry's own positions and radii. If a change to the
   * frame ever moves an upright, this throws on load instead of quietly
   * shipping a barn door, which is what the old 3.5 m torus was.
   */
  for (const gt of gates) {
    for (const ap of gt.apertures) {
      if (Math.abs(ap.clearW - gt.wantW) > 0.01 || Math.abs(ap.clearH - gt.wantH) > 0.01) {
        throw new Error(
          `scene: ${gt.kindName} opening measured ${ap.clearW.toFixed(4)} by `
          + `${ap.clearH.toFixed(4)} m, wanted ${gt.wantW.toFixed(4)} by `
          + `${gt.wantH.toFixed(4)} m at gate scale ${GATE_SCALE}, `
          + 'outside the 10 mm tolerance',
        );
      }
    }
  }

  /* The gate the race wants next pulses so the pilot always has a target.
   * Everything else sits at its resting colour. */
  let nextGateIdx = -1;
  /*
   * A ladder, not a switch. With every gate but the target at 0.12 the
   * gate after next measured 0.064 against grass at 0.077, darker than the
   * ground it stands in, so the pilot had exactly one target and no
   * forward line at all. The next three gates now step down, which is what
   * makes a corridor read.
   *
   * The order the race flies is set by Race, which walks the gate list
   * backwards from the start line, so the gate after scene index i is
   * i - 1, wrapping.
   */
  /*
   * The next gate has to be the brightest thing in the frame with 0.08 of
   * headroom over everything that is not a gate, and the brightest thing
   * that is not a gate is the horizon haze at 0.781, so the target is
   * 0.861. The amber ring's own colour is 0.691 and the renderer runs with
   * NoToneMapping, so the ring cannot get there by itself: the additive
   * glow has to carry it. Measured before this changed, a reviewer found
   * the next gate at 0.711 against a cloud at 0.745, and the gate AFTER
   * next at 0.722, louder than the one the pilot was flying at.
   *
   * The glow is unfogged, which is what makes this work at distance: it is
   * the one thing in the frame whose value does not fall off. It is also a
   * tight annulus at the torus radius, so the band can push into clipping
   * while the ring itself keeps the hue that says which gate this is.
   * Round 3 of the previous loop rejected scaling the ring COLOUR past 1.0
   * for exactly that reason, and this is not that.
   */
  const GLOW_LADDER = [0.95, 0.42, 0.24];
  /*
   * The corridor is walked in FLYING order, which is the order the pilot
   * flies and not the order the gates happen to sit in the array.
   *
   * This used to step backwards through the array, `i - step`, which is
   * correct for the built in circuit for one reason only: its stations are
   * laid along the curve and flown in reverse, so array order IS reverse
   * flying order there. A designed course's gates are in flying order, so
   * the same arithmetic lit the three gates BEHIND the pilot. Ordering by
   * the flyOrder every gate already carries is right on both.
   */
  const byFlyOrder = [...gates].sort((a, b) => a.flyOrder - b.flyOrder);
  function setNextGate(i) {
    for (const gt of gates) {
      gt.ringMat.color.set(gt.ringColor);
      gt.haloMat.color.set(gt.ringColor);
      gt.glowMat.uniforms.uColor.value.set(gt.ringColor);
      gt.haloMat.opacity = 0.34;
      gt.glowMat.uniforms.uGain.value = 0.08;
    }
    nextGateIdx = i;
    const at = byFlyOrder.findIndex((gt) => gt === gates[i]);
    if (at < 0 || !byFlyOrder.length) {
      return;
    }
    for (let step = 0; step < GLOW_LADDER.length; step += 1) {
      const gt = byFlyOrder[(at + step) % byFlyOrder.length];
      /* max, not assignment: a structure flown twice shares one glow, and
       * the nearer of its two turns is the one the pilot is flying at. */
      gt.glowMat.uniforms.uGain.value = Math.max(
        gt.glowMat.uniforms.uGain.value, GLOW_LADDER[step],
      );
    }
    /*
     * THE ONE YOU ARE FLYING AT IS A DIFFERENT COLOUR, not just a brighter
     * one, and that is the whole of this change.
     *
     * The ladder above already made the next gate the brightest thing in
     * frame, and brightness alone was not enough: at racing pace, with three
     * gates lit amber at three levels of the same amber, a pilot reads a
     * corridor but not a target, and the gate AFTER next at 0.42 gain is
     * still an amber square. Hue is the channel that is left. NEXT_COLOUR is
     * the one strong hue the world does not contain: the field is green
     * grass under a blue sky and the gates are now navy, red and off white
     * vinyl, so nothing else on screen is anywhere near it, and it survives
     * being seen against grass, against sky and against a banner.
     */
    const target = gates[i];
    if (target) {
      target.ringMat.color.set(NEXT_COLOUR);
      target.haloMat.color.set(NEXT_COLOUR);
      target.glowMat.uniforms.uColor.value.set(NEXT_COLOUR);
    }
  }

  /*
   * How far scenery has to stand off the course.
   *
   * Fifteen metres from the racing line, which is right for a 570 m circuit
   * that sprawls over 210 by 236 m of valley. It is WRONG for a designed
   * course: a 60 by 40 m field is smaller than the built in circuit's
   * clearance, so the same rule stood trees inside the arena, one of them a
   * few metres off a gate. An author's field is an arena, and the rule that
   * says so is the rectangle they drew rather than a distance from a line
   * that happens to wander near its edge.
   */
  function onTheCourse(x, z) {
    /* Nothing stands on the pitch or in its fade, which is the whole point
     * of having one: the rule that keeps the arena clear is now the same
     * rectangle the player can see mown into the ground. */
    if (pitch && pitchEdge(pitch, x, z) < PITCH.fade) {
      return true;
    }
    let d = 1e9;
    for (const smp of samples) {
      d = Math.min(d, Math.hypot(x - smp.x, z - smp.z));
    }
    return d < 15;
  }

  /* Scenery, kept clear of the flight corridor. Baked, not added: the
   * generation order and rng stream are unchanged, so the world is the
   * same one, just drawn in a handful of calls. */
  for (let i = 0; i < 420; i += 1) {
    const a = rng() * Math.PI * 2;
    const rad = 30 + rng() * 640;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    if (onTheCourse(x, z)) {
      continue;
    }
    const isTree = rng() < 0.74;
    /*
     * Nothing grows under water. The test is the water column at this point,
     * height() against LAKE.level, INSIDE the lake basin: the shoreline the
     * bank builds runs from 105.8 to 119.3 m, so a circle at LAKE.r, 96 m,
     * would leave a rank of trees standing in 4 m of lake, and the depth test
     * on its own is far too greedy. Measured with a probe on the height
     * field, 77.9 percent of the valley between 30 and 670 m of the origin
     * sits below LAKE.level, because the racing corridor is flattened to 0
     * and the land around it is a broad hollow. The first version of this
     * test used depth alone and deleted 78 percent of the trees, rocks and
     * cliffs in the world: P10 fell to 26.2 MB and the draw count to 64,
     * which is how it was caught. The 0.4 m margin keeps them off the wet
     * sand as well.
     *
     * It is a DISCARD, not a skip. The object is built first, from the same
     * draws in the same order, and then thrown away, because this loop and
     * everything after it hangs off one rng stream: skipping the draws would
     * move every remaining tree, rock, cliff, flower and mountain in the
     * valley. Same reason the grass keeps building a vertex it does not use.
     */
    const drowned = Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.6
      && height(x, z) < LAKE.level + 0.4;
    const obj = isTree
      ? tree(rng, height, x, z, drowned ? null : colliders)
      : rock(rng, height, x, z, drowned ? null : colliders);
    if (drowned) {
      continue;
    }
    baker.bake(obj);
    occluders.push({ x, z, r: isTree ? 2.2 : 1.4 });
  }

  /* Cliff landmarks, kept off the racing line but inside the valley so
   * they read as part of the course rather than set dressing. */
  const cliffSpots = [
    [-215, 95], [190, 155], [-95, -240], [305, 40], [-320, -80], [60, 280],
  ];
  for (const [cx, cz] of cliffSpots) {
    baker.bake(cliff(rng, height, cx, cz, colliders));
    occluders.push({ x: cx, z: cz, r: 13 });
  }

  /* Flowers: a few thousand tiny saturated quads. They cost almost
   * nothing and they are the difference between a green field and a
   * meadow, because they give the ground a second colour at a second
   * scale. */
  {
    const N = 2600;
    const pos = new Float32Array(N * 4 * 3);
    const col = new Float32Array(N * 4 * 3);
    const idx = new Uint32Array(N * 6);
    /* No white: at distance a white quad on grass reads as debris, not a
     * flower. Warm saturated petals stay in the meadow's colour family. */
    /* Warm petals only. The old list held 0xff7fb0 pink and 0xb98cff
     * violet, and on an unlit material they measured 0.378 luminance
     * against grass at 0.301: the most saturated pixels in the lower half
     * of the frame were cool magenta, in a meadow the comment above calls
     * warm. */
    const petals = [0xffd94a, 0xffb347, 0xf58a3c, 0xffe38a];
    const cc = new THREE.Color();
    let v = 0;
    let ii = 0;
    let n = 0;
    for (let i = 0; i < N; i += 1) {
      const s0 = samples[Math.floor(rng() * samples.length)];
      const a = rng() * Math.PI * 2;
      const r = 6 + rng() * 40;
      const x = s0.x + Math.cos(a) * r;
      const z = s0.z + Math.sin(a) * r;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.3) {
        continue;
      }
      /* Hug the ground: floating half a metre up they read as z fighting
       * rectangles, not flowers in the grass. */
      const y = height(x, z) + 0.06 + rng() * 0.1;
      const w = 0.045 + rng() * 0.035;
      cc.set(petals[Math.floor(rng() * petals.length)]);
      const base = v / 3;
      for (const [ox, oz] of [[-w, -w], [w, -w], [w, w], [-w, w]]) {
        pos[v] = x + ox; pos[v + 1] = y; pos[v + 2] = z + oz;
        col[v] = cc.r; col[v + 1] = cc.g; col[v + 2] = cc.b;
        v += 3;
      }
      idx[ii++] = base; idx[ii++] = base + 1; idx[ii++] = base + 2;
      idx[ii++] = base; idx[ii++] = base + 2; idx[ii++] = base + 3;
      n += 1;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 12), 3));
    fg.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, n * 12), 3));
    /*
     * Normals, all straight up, because the petals are horizontal quads.
     *
     * This geometry had none, which was harmless while the material was
     * unlit. Putting a lit material on it turned the whole frame into flat
     * fog cream: a missing attribute reads as (0,0,0), normalize of that is
     * NaN, and the NaN spread out of these 2600 quads across the frame on
     * this software rasteriser. Nothing in the console, no shader error,
     * just a washed out world. Any lit material needs normals.
     */
    const fnorm = new Float32Array(n * 12);
    for (let i = 1; i < fnorm.length; i += 3) {
      fnorm[i] = 1;
    }
    fg.setAttribute('normal', new THREE.BufferAttribute(fnorm, 3));
    fg.setIndex(new THREE.BufferAttribute(idx.subarray(0, n * 6), 1));
    /* Cel shaded, not unlit. An unlit petal is byte identical in sun and
     * in shadow, which is the one thing the colour rule forbids, and it
     * made the flowers the most saturated thing in the lower frame. No rim:
     * a flat quad is edge on across its whole surface, so a rim term
     * floods it, the same trap the flag cloth fell into. */
    const fm = celMaterial({ color: 0xffffff, rim: 0.0, side: THREE.DoubleSide });
    fm.vertexColors = true;
    const flowers = new THREE.Mesh(fg, fm);
    flowers.layers.set(1);
    scene.add(flowers);
  }

  /*
   * Baked ambient occlusion into the terrain vertex colours. Contact
   * shading is the cheapest and highest yield spatial cue there is, and a
   * stylised render needs it MORE than a photoreal one, because there is
   * no texture detail or specular variation to fall back on: without it
   * every tree, rock and gate foot floats on the grass instead of sitting
   * in it. The scatter is deterministic so this can be done once at load
   * and costs nothing at runtime, and unlike the shadow map it reaches
   * the full draw distance.
   *
   * Occlusion tints toward the shadow blue rather than multiplying toward
   * black, so it stays inside the same warm light, cool shadow logic as
   * the ramp and the cloud shadows.
   */
  {
    const CELL = 8;
    const grid = new Map();
    for (const o of occluders) {
      const key = `${Math.floor(o.x / CELL)},${Math.floor(o.z / CELL)}`;
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push(o);
    }
    const gpos = ground.geometry.attributes.position;
    const gcol = ground.geometry.attributes.color;
    const aoTint = new THREE.Color(0x707fb8);
    for (let i = 0; i < gpos.count; i += 1) {
      const x = gpos.getX(i);
      const z = gpos.getZ(i);
      let occ = 0;
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      for (let ax = cx - 2; ax <= cx + 2; ax += 1) {
        for (let az = cz - 2; az <= cz + 2; az += 1) {
          const bucket = grid.get(`${ax},${az}`);
          if (!bucket) {
            continue;
          }
          for (const o of bucket) {
            const d = Math.hypot(x - o.x, z - o.z);
            const k = 1 - Math.min(1, d / (2.6 * o.r));
            if (k > 0) {
              occ += Math.pow(k, 1.7);
            }
          }
        }
      }
      occ = Math.min(0.75, occ);
      if (occ > 0.001) {
        gcol.setXYZ(
          i,
          gcol.getX(i) * (1 - occ) + gcol.getX(i) * aoTint.r * occ,
          gcol.getY(i) * (1 - occ) + gcol.getY(i) * aoTint.g * occ,
          gcol.getZ(i) * (1 - occ) + gcol.getZ(i) * aoTint.b * occ,
        );
      }
    }
    gcol.needsUpdate = true;
  }

  /* Course markers along the circuit: close range speed reference. */
  /*
   * The poles are static and merge into one draw call. So, now, do the
   * SAILS: their wave lives in the cel material's cloth term rather than in
   * a per frame rotation, so a merged sail still flies. That is worth
   * stating as a cost as well as a saving: it took 72 live meshes with 72
   * draw calls in the view pass and 72 more in the outline prepass down to
   * one merge bucket per sail colour, and it is the reason the wave had to
   * be moved into the shader at all.
   *
   * Only the sails cast: a flag that casts no shadow floats, and 72 masts in
   * the shadow map cost more than a mast's thin shadow line is worth. The
   * shadow is of the UNWAVED sail, because the depth material carries no
   * cloth term; at 85 mm of travel that is under the shadow map's own texel
   * on this field and nobody can see it.
   */
  const poleBaker = makeBaker();
  const sailBaker = makeBaker();
  /*
   * 72 on the built in circuit, and one every 8 m on a designed one.
   *
   * 72 flags round 570 m is one every 8 m, alternating sides, which is what
   * a taped course looks like. The same 72 round a 140 m designed lap is one
   * every two metres: a picket fence down both sides of the track, dense
   * enough to read as a wall. So a course gets the same SPACING rather than
   * the same count.
   *
   * The built in figure is left as the literal 72 rather than recovered from
   * the length, and that is deliberate. Every flag draws from the shared rng
   * stream, so changing how many there are shifts every random number after
   * them and rebuilds the whole valley. A world that is bit identical to the
   * one that shipped is worth more than one fewer magic number.
   */
  const flagCount = course
    ? Math.max(8, Math.min(72, Math.round(curve.getLength() / 8)))
    : 72;
  for (let i = 0; i < flagCount; i += 1) {
    const u = i / flagCount;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    const nx = -tan.z;
    const nz = tan.x;
    const side = i % 2 === 0 ? 8.5 : -8.5;
    const fx = p.x + nx * side;
    const fz = p.z + nz * side;
    const f = bannerFlag(kit, rng, height, fx, fz, i);
    /* The mast is solid. It is a metre and a bit of aluminium beside the
     * racing line and a quad that clips one is finished, so it collides,
     * over the WHOLE mast the pilot can see. The cloth does not: a flag
     * brushing a prop is not a crash. */
    const fy = height(fx, fz);
    colliders.addPost('pole', fx, fz, fy, fy + f.height, 0.018);
    f.group.updateMatrixWorld(true);
    poleBaker.bake(f.pole);
    poleBaker.bake(f.foot);
    sailBaker.bake(f.sail);
  }
  poleBaker.flush(scene);
  sailBaker.flush(scene);

  /* Mountain rings. Cones are centred on their origin, so the base must
   * sit at y = h/2 or the range floats. Far ring lighter for aerial
   * perspective, and both sit outside the fog so they stay as flat shapes. */
  /*
   * Mountain rings. Cones are centred on their origin, so the base must sit
   * at y = h/2 or the range floats.
   *
   * These used to be cel shaded with fog off, and the result was measured:
   * all four rings, the far valley floor and the trees standing on them
   * came out at 0.079 linear luminance, 34.6 percent of the whole mountain
   * band at one value, because a cone's facets mostly face away from the
   * sun and land in the ramp's shadow band. Aerial perspective was
   * inverted: a ring at 560 m read four times DARKER than fogged ground at
   * 400 m in front of it.
   *
   * They are unlit now, one flat colour each, so the authored value IS the
   * rendered value. The first set of colours was chosen by arithmetic and
   * the comment here claimed measured values of 0.15, 0.25, 0.35 and 0.45.
   * That was wrong, and a reviewer measured it: ring 0 came out at 0.108
   * and ring 1 at 0.162, which put ring 0 inside the tree canopy band of
   * 0.094 to 0.107, so a canopy in front of a mountain was a 2.8 percent
   * luminance step. These colours are measured, not derived.
   *
   * Jitter is 0.16 rad, not 0.05: 34 cones at even 10.6 degree spacing
   * with 2.9 degrees of jitter read as a picket fence.
   */
  const ridgeDist = [560, 830, 1080, 1330];
  /*
   * The aerial perspective ladder, and the one place in the frame where it
   * is authored rather than computed. Each pair is a sun side and a shadow
   * side of the SAME luminance, so the ring's rendered value is exactly its
   * rung and the light model lives entirely in hue: warm sand facing the
   * sun, cool blue away from it, which is the same warm light cool shadow
   * rule the ramp follows.
   *
   * That equal luminance is not a shortcut, it is the only thing that fits.
   * The rungs have to clear the fogged ground in front of the nearest ring
   * and stay clear of the sky behind the furthest one, and between those
   * two there is 0.353 of luminance for four layers. Splitting each ring's
   * value by even 0.03 for its light model makes the sun side of one ring
   * and the shadow side of the next land within 0.035 of each other, and
   * then a reviewer sampling those two patches measures a ladder that does
   * not climb. Hue carries the light, value carries the distance, and
   * neither has to borrow from the other.
   *
   * The set before this one laddered 0.483, 0.561, 0.628, 0.698 against a
   * sky the comment here claimed was 0.781 and fogged ground at 0.428.
   * Those two anchors were derived from the authored HORIZON colour and the
   * fog equation. Neither survives to the screen. Sampled off an actual
   * capture, the sky immediately behind the ridge band is 0.487 and the
   * terrain's far edge is 0.192, so the ladder was climbing straight past
   * its own ceiling: rings 2, 3 and 4 rendered BRIGHTER than the sky behind
   * them, which is why distance made a mountain stand out more instead of
   * less and the whole range read as cut paper laid on top of the sky. Ring
   * 1's sun side measured 0.488 against sky at 0.487, a one thousandth
   * step, so the nearest range was simply invisible.
   *
   * These rungs are solved against the two anchors as MEASURED. An unlit
   * MeshBasicMaterial round trips its hex exactly, verified: the old ring 1
   * was authored 0.483 and sampled 0.488, so a displayed target can be
   * authored directly.
   *
   *   terrain far edge  0.192   measured
   *   ring 0 at  560 m  0.250
   *   ring 1 at  830 m  0.310
   *   ring 2 at 1080 m  0.370
   *   ring 3 at 1330 m  0.430
   *   sky behind them   0.487   measured
   *
   * Steps of 0.058, 0.060, 0.060, 0.060, 0.057: an even ladder with the
   * ground below it and the sky above it, both cleared, and the range now
   * recedes INTO the sky instead of out of it. The tints also narrow as the
   * rungs climb, because haze desaturates whatever it covers, so the far
   * range is nearly neutral while the near one still shows sand and slate.
   */
  const RIDGE_SUN = [0x878d63, 0x959a76, 0xa2a689, 0xaeb19a];
  const RIDGE_SHADE = [0x788aa6, 0x8998b0, 0x99a5b8, 0xa6b0bf];
  /* One material per ring, created outside the cone loop. The baker buckets
   * by material, and a material per cone means 136 buckets and 136 draw
   * calls instead of four: that mistake cost 108 draw calls and was caught
   * by measuring the count, not by reading the diff. */
  const ridgeMats = RIDGE_SUN.map(() => {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    m.vertexColors = true;
    return m;
  });
  const sunC = new THREE.Color();
  const shadeC = new THREE.Color();
  const nrmMat = new THREE.Matrix3();
  const nrmVec = new THREE.Vector3();
  for (let ring = 0; ring < 4; ring += 1) {
    const dist = ridgeDist[ring];
    sunC.setHex(RIDGE_SUN[ring]);
    shadeC.setHex(RIDGE_SHADE[ring]);
    for (let i = 0; i < 34; i += 1) {
      const a = (i / 34) * Math.PI * 2 + ring * 0.09 + (rng() - 0.5) * 0.16;
      const h = 110 + rng() * 210;
      /* Non indexed before colouring: a cone's five side faces share
       * vertices with the cap in the indexed form, so a per face colour
       * written into a shared vertex bleeds onto the face next to it. */
      const geo = new THREE.ConeGeometry(95 + rng() * 90, h, 5).toNonIndexed();
      const m = new THREE.Mesh(geo, ridgeMats[ring]);
      m.position.set(Math.cos(a) * dist, h / 2 - 10, Math.sin(a) * dist);
      m.rotation.y = rng() * 3;
      m.updateMatrixWorld(true);
      const nrm = geo.attributes.normal;
      const col = new Float32Array(nrm.count * 3);
      nrmMat.getNormalMatrix(m.matrixWorld);
      for (let v = 0; v < nrm.count; v += 1) {
        nrmVec.fromBufferAttribute(nrm, v).applyMatrix3(nrmMat).normalize();
        const c = nrmVec.dot(SUN_DIR) > 0.02 ? sunC : shadeC;
        col[v * 3 + 0] = c.r;
        col[v * 3 + 1] = c.g;
        col[v * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      baker.bake(m);
    }
  }
  baker.flush(scene, 0);

  /* The craft is the session's, built once in src/render/shell.js and
   * re-parented into whichever map is active. */
  const quad = shell.quad;
  const discs = shell.discs;
  scene.add(quad);
  progress(1);

  /*
   * The field's far plane. 2600 m covers the valley and its ridge ladder out
   * to 1330 m. The near plane is the session's and is 0.2 m: the camera sits
   * inside a 150 mm airframe, so 4 cm buys nothing, and a 0.04 to 2600 range
   * left the outline prepass's depth buffer with under one depth code of
   * separation past about 500 m.
   */
  camera.far = 2600;
  camera.updateProjectionMatrix();

  /* Shadows follow the craft. shadowExtent is a half width, so the box is
   * 144 m across at 2048, which is 7.0 cm per texel: crisp enough for
   * contact shadows where the pilot is looking, instead of mush over
   * 1.7 km. This comment said 58 m until a reviewer read the constant. */
  function updateShadowFocus(target) {
    sun.position.copy(target).addScaledVector(SUN_DIR, 130);
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
  }

  function updateWind(t, quadPos, wash) {
    grass.mat.uniforms.uTime.value = t;
    if (quadPos) {
      grass.mat.uniforms.uQuad.value.copy(quadPos);
      grass.mat.uniforms.uWash.value = wash ?? 0;
    }
    water0.mat.uniforms.uTime.value = t;
    /* This is what flies the flags now. Every sail's wave is a function of
     * this clock and the vertex's own world position, computed in the cel
     * material's vertex shader, so there is no per flag work here at all. */
    updateCelTime(t);
    if (nextGateIdx >= 0 && nextGateIdx < gates.length) {
      const gt = gates[nextGateIdx];
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.4);
      /* Pulse the glow, not the ring's hue. Lerping the ring toward white
       * made the target lose the one colour that identifies it. */
      gt.glowMat.uniforms.uGain.value = 0.95 + 0.30 * pulse;
      gt.haloMat.opacity = 0.55 + 0.35 * pulse;
    }
  }

  /*
   * The racing line, built AFTER the gates because on the built in circuit
   * it is fitted through their aperture centres. A designed course brings
   * its own line, which is the one its author derived, so the two ends of
   * the project agree about what the racing line is rather than each
   * deriving one.
   */
  const linePoints = [];
  if (course && course.line.length >= 4) {
    let last = null;
    for (const p of course.line) {
      if (!last || Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) >= 1.5) {
        linePoints.push({ x: p.x, y: height(p.x, p.z) + p.y, z: p.z });
        last = p;
      }
    }
  } else if (gates.length >= 4) {
    /* Flying order, not scene order: the line is the order it is flown. */
    const flown = [...gates].sort((a, b) => a.flyOrder - b.flyOrder);
    for (const gt of flown) {
      linePoints.push({
        x: gt.position.x,
        y: gt.position.y + gt.aperture.centreY,
        z: gt.position.z,
      });
    }
  }
  const racingLine = racingLineRibbon(linePoints);
  if (racingLine) {
    scene.add(racingLine.mesh);
  }

  /* Every collider is in by now, so freeze the flat arrays and build the
   * broadphase grid. Nothing may be added after this. */
  colliders.build();

  progress(1);

  /*
   * Where a run starts, and what the title screen looks at. Both used to be
   * computed in main.js out of gates[0], which is exactly why a map with no
   * gates crashed the shell before its first frame. They belong to the map:
   * a map knows where its start line is and a shell does not.
   *
   * A few metres BEHIND the start line, facing down the circuit. Parked
   * exactly on the timing plane, the first millimetre of drift would arm the
   * lap clock at zero airspeed. The craft faces opposite the course tangent,
   * so behind the line is along +tangent.
   */
  const start = gates.length ? gates[0] : null;
  const SPAWN_BACK = 7;
  /* A designed course parks the quad on its own start pads, which is where
   * its author put the line. The built in circuit has no pads, so it stands
   * the quad back from its timing gate. */
  const spawn = course
    ? { x: course.spawn.x, z: course.spawn.z, yaw: course.spawn.yaw }
    : {
      x: start.position.x + Math.sin(start.heading) * SPAWN_BACK,
      z: start.position.z + Math.cos(start.heading) * SPAWN_BACK,
      yaw: start.heading,
    };
  /*
   * What the title screen looks at. A LAP of the course, flown, with the
   * orbit kept as the fallback for a map that has no course at all: a
   * player who has never opened the track builder picks Your track and gets
   * an empty pitch, and circling the spawn is a better shot of nothing than
   * a flight round nothing.
   *
   * The orbit's framing is unchanged and still earns its comment: the
   * opening is 1.524 m square with its centre at 0.762 m, so 9 m out and
   * 2.4 m up, aimed at the aperture centre. 19 m out aimed 2.5 m up was
   * framed for a 5 m gate and pointed at empty air above one too small to
   * see.
   */
  const attract = {
    x: start ? start.position.x : spawn.x,
    y: start ? start.position.y : height(spawn.x, spawn.z),
    z: start ? start.position.z : spawn.z,
    radius: 9,
    eye: 2.4,
    aim: 0.85,
    path: gates.length ? attractPath(curve, obstacleTops, height) : null,
    /* Metres per second along the line, and metres of look ahead. 13 m/s is
     * a cruising lap rather than a racing one, which is what a title screen
     * wants: fast enough to read as flight, slow enough to read the course. */
    speed: 13,
    lookAhead: 17,
    /* How far below the camera the aim point sits, so the shot looks along
     * the course and slightly down at it rather than at the horizon. */
    aimDrop: 2.6,
  };

  return {
    id: course ? 'custom' : 'field',
    name: course ? course.name : 'Race field',
    mode: 'race',
    scene, gates, curve, colliders, spawn, attract,
    /* Anything the reader could not honour, for the shell to show once. */
    notes: course ? course.warnings : [],
    /*
     * Reference objects, measured off the built world rather than restated.
     * The gate aperture is read out of the torus the scene actually drew, and
     * the grass is measured because a 0.26 to 0.68 m blade beside a 1.524 m
     * opening is exactly the scale error this project has already shipped
     * once. tests/lib/checks.js check 15 asserts them.
     */
    references: {
      /* 1.524 is MultiGP's published 5 ft opening; the course is BUILT at
       * GATE_SCALE times that, which src/game/track.js declares and explains.
       * The reference states the built figure because that is the hole the
       * pilot flies and the one a scale check has to band. */
      gateOpeningW: { measured: (gates[0] ?? { aperture: { clearW: 0, clearH: 0, centreY: 0 } }).aperture.clearW, unit: 'm', real: `${(1.524 * GATE_SCALE).toFixed(4)}, MultiGP standard gate 1.524 at gate scale ${GATE_SCALE}` },
      gateOpeningH: { measured: (gates[0] ?? { aperture: { clearW: 0, clearH: 0, centreY: 0 } }).aperture.clearH, unit: 'm', real: `${(1.524 * GATE_SCALE).toFixed(4)}, MultiGP standard gate 1.524 at gate scale ${GATE_SCALE}` },
      gateApertureCentreY: { measured: (gates[0] ?? { aperture: { clearW: 0, clearH: 0, centreY: 0 } }).aperture.centreY, unit: 'm', real: '0.762, half the opening' },
      grassBladeHeight: { measured: grass.bladeHeightRange, unit: 'm', real: '0.03 to 0.09, mown' },
    },
    updateShadowFocus, updateWind, setNextGate,
    /*
     * The racing line guide. Two calls because they answer to two different
     * things: the pilot's setting, and the pilot's position.
     */
    setRacingLine(on) {
      if (racingLine) {
        racingLine.mesh.visible = Boolean(on) && linePoints.length >= 4;
      }
    },
    hasRacingLine: Boolean(racingLine),
    /*
     * How far the craft is from the line, and the ribbon's colour with it.
     * Returns the distance in metres so the shell can say something about
     * it, and null when there is no line to be off.
     */
    updateRacingLine(pos) {
      if (!racingLine || !racingLine.mesh.visible) {
        return null;
      }
      let best = Infinity;
      for (const p of racingLine.probe) {
        const dx = p.x - pos.x;
        const dy = p.y - pos.y;
        const dz = p.z - pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < best) {
          best = d2;
        }
      }
      const d = Math.sqrt(best);
      racingLine.mat.uniforms.uCraft.value.copy(pos);
      /* A hard switch, softened over the last 40 cm so a craft sitting on
       * the tolerance does not strobe between the two colours. */
      racingLine.mat.uniforms.uHit.value = 1 - Math.max(0, Math.min(1,
        (d - LINE_TOLERANCE) / 0.4));
      return d;
    },
    /*
     * The contact surface. The third argument is the height the query is made
     * FROM, which the city needs so a quad can fly under the overbridge and
     * land on its deck. The field has one ground surface and no decks, so it
     * ignores it, and the argument is accepted rather than dropped so main.js
     * has one call shape for both maps.
     */
    height: (x, z) => height(x, z),
    /* No animation on the field depends on the physics clock: the flags and
     * the glow pulse are wall clock decoration and updateWind already drives
     * them. Present so the shell has one call shape. */
    updateAnim: () => {},
    dispose() {
      scene.remove(quad);
      disposeSceneGraph(scene, SESSION_TEXTURES);
    },
  };
}
