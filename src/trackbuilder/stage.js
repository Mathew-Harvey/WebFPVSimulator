/*
 * stage.js: the track as a lit object on a black floor, for the animation
 * export and nothing else.
 *
 * WHY THIS IS NOT src/render/scene.js. That file already builds gates out of
 * pipe with a moulded fitting at every corner, and it already has a dark
 * branch for a micro track, so it looks at first like the obvious base. It is
 * not. The micro branch is a room: pine board walls, an OSB ceiling with
 * joists, a mat with a concrete border and a skirting board, built
 * unconditionally with no way to ask for the object without the room, and a
 * three quarter view from above of a track in it is a view of a ceiling.
 * scene.js also exports four functions, none of which is a gate builder, so
 * the pipe geometry cannot be borrowed without traversing a built world by
 * guesswork. The RaceGOW element set is gates, stacks, ladders, towers, dive
 * gates and poles, every one of which is a pipe frame or a single pipe, so
 * building them here from the same maths the builder already uses is smaller
 * than reaching into a world for them.
 *
 * WHY NOT view3d.js EITHER. It draws a gate as four boxes with two square
 * legs, no fittings, no feet and no shadows, because it is an editor preview
 * where the reading is what matters and a joint is noise.
 *
 * WHAT IS SHARED, and it is the part that matters: every number here comes
 * from the builder's own DOM free maths, apertureFrame, apertureCorners,
 * apertureCenter, aperturesOf and gateSupportFeet. The pipe this draws stands
 * exactly where the builder says the gate is, because it is asking the same
 * functions the builder asks.
 *
 * THE FRAME. Everything below is authored in DOCUMENT coordinates, right
 * handed and Z up, under one root group rotated minus a quarter turn about X
 * so Three sees its own Y up world. That conversion happens once, here, the
 * same way view3d.js does it, and nowhere else in this file.
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

import { ELEMENTS, KIND, FRAME_TUBE_OD, isUnbuilt, trackClassOf, virtualApertureDims } from './elements.js';
import { PIPE_OD as RACEGOW_PIPE_OD } from './racegow.js';
import { aperturesOf, elementById, apertureCenter } from './model.js';
import { apertureFrame, apertureCorners, clamp } from './geometry.js';

/*
 * THE CAMERA, in six numbers.
 *
 * AZIMUTH_OFF_AXIS. The shot is taken 55 degrees off the track's own long
 * axis, which is what puts the long axis across the frame from lower left to
 * upper right instead of pointing at the lens. Straight down the axis hides
 * half the gates behind the other half.
 *
 * ELEVATION. Looking down 40 degrees. Lower and the gates overlap; higher
 * and it becomes a plan view, which the builder already draws better.
 *
 * FOV. Thirty degrees vertical, which is a long lens. This is the single
 * number that makes the picture read as a drawing of a track rather than a
 * photograph of one: perspective convergence across a 10 m room at 30
 * degrees is small enough that the gates stay comparable, which is the whole
 * point of looking at a course.
 *
 * MARGIN. Six percent on top of an exact fit. The fit below is exact
 * because it projects the real vertices, so this only has to keep the
 * outermost pipe off the edge of a frame somebody will see cropped square.
 *
 * AIM_HEIGHT. The camera aims a third of the way up rather than at the
 * middle, which leaves the lower part of the frame for the name.
 */
const AZIMUTH_OFF_AXIS = -55 * (Math.PI / 180);
const ELEVATION = 40 * (Math.PI / 180);
const FOV_DEG = 30;
const FIT_MARGIN = 1.06;
const AIM_HEIGHT = 0.35;

/*
 * THE RIBBON. A travelling segment, not a growing trail: the reference shows
 * a fixed length of line flying the course, which is what a lap looks like.
 *
 * It was three tenths of the lap and it is now under a tenth, because three
 * tenths was long enough to cover the structure it was flying through. On a
 * RaceGOW track the line doubles back through its own gates, so a long tail
 * is draped over the gates the quad has not reached yet and the reader
 * cannot tell the line from the track. A short one is an arrow: it says
 * where the quad is and which way it is pointed, and leaves the pipe
 * visible, which is the other half of what the animation is for.
 *
 * The radius scales with the track so a 10 m room and a 60 m field both
 * read, and is clamped at both ends because a ribbon thinner than a pipe
 * disappears and one thicker than a gate opening hides the gate.
 */
const TAIL_FRACTION = 0.09;
const RIBBON_R_PER_METRE = 0.004;
const RIBBON_R_MIN = 0.012;
const RIBBON_R_MAX = 0.12;
const RIBBON_SHELL_SCALE = 3.4;
const RIBBON_RADIAL_SEGMENTS = 8;
/* And the same floor for the ribbon, for the same reason. It is the subject
 * of the animation, so it may not thin out to nothing on a big course. */
const MIN_RIBBON_PX = 2.6;

/*
 * THE PALETTE, which is the simulator's rather than a new one.
 *
 * PANE is START_COLOUR from src/render/scene.js, the same green the builder
 * paints an entry face and the game paints the gate it wants next, so a
 * pilot who has seen either recognises it here.
 */
const COL_FLOOR = 0x000000;
const COL_POOL = 0x202020;
const COL_PIPE = 0xc7ccd4;
const COL_PANE = 0x7dffb4;
const COL_RIBBON_CORE = 0xff6b5b;
const COL_RIBBON_SHELL = 0xff3b2a;
const COL_TEXT = 0xf2e3cb;
const COL_START_PAD = 0x2a2a2e;

/*
 * The pool of light, as a multiple of the track's own radius. Past its edge
 * the floor is black, which is what puts the track on a stage rather than in
 * a room. Measured against the TRACK and not against the floor plane, which
 * is deliberately enormous so its edge is never in shot: tying the pool to
 * the floor put an eight metre halo around a one and a half metre track.
 *
 * 1.35 rather than something more generous, because the camera frames the
 * track at about three radii across and a pool wider than that is not a pool,
 * it is a grey field with a track on it. Measured against the reference,
 * which has 22 percent of its pixels under luminance 12 and 73 percent under
 * 40: at 2.4 radii this stage had 0.3 percent under 12, so nothing in the
 * frame was actually black.
 */
const POOL_RADII = 1.15;

/*
 * SHADOW MAP SIZE. 1024, not 2048. The headless harness runs Chromium on
 * SwiftShader, a software rasteriser, and the shadow pass is drawn once per
 * frame for three hundred frames. 2048 is four times the fill for a
 * difference nobody can see at 512 by 512.
 */
const SHADOW_MAP = 1024;

/*
 * The narrowest a pipe is allowed to be on screen, in pixels. Below about
 * this a thin diagonal cylinder stops being a shape and becomes intermittent
 * aliasing, and 256 palette entries cannot rescue it.
 */
const MIN_PIPE_PX = 1.7;

/* A joint is a moulded fitting, so it is fatter than the pipe it joins. */
const JOINT_SCALE = 1.4;
/* A foot is a fitting with four short stubs lying on the floor. */
const FOOT_STUB_SCALE = 2.2;
/* A corner this close to the floor is standing on it, so it gets a foot
 * rather than a leg. */
const GROUND_EPS = 0.02;

function v3(THREE, p) {
  return new THREE.Vector3(p.x, p.y, p.z);
}

/*
 * Roughly how big the track is, before any of it is built.
 *
 * The camera fit later is exact and measures the real vertices, but the pipe
 * radius has to be chosen BEFORE there are any vertices to measure, so this
 * estimate comes first. Element positions and the racing line together bound
 * everything that will be drawn, which is all this has to be right about.
 */
function estimateRadius(doc, path) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const see = (x, y) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const el of doc.elements) {
    const def = ELEMENTS[el.type];
    if (!def || def.kind === KIND.ANNOTATION || def.kind === KIND.DECAL) {
      continue;
    }
    see(el.position.x, el.position.y);
  }
  for (const s of path.samples) {
    see(s.pos.x, s.pos.y);
  }
  if (!Number.isFinite(minX)) {
    return 1;
  }
  return Math.max(0.5, Math.hypot(maxX - minX, maxY - minY) / 2);
}

/*
 * One cylinder from a to b. Three's cylinder stands along its own +Y, so it
 * is turned onto the span and moved to the midpoint. Returned as geometry
 * rather than a mesh because every pipe on the track ends up in one buffer.
 */
function pipeGeometry(THREE, a, b, radius, radialSegments = 8) {
  const from = v3(THREE, a);
  const to = v3(THREE, b);
  const span = new THREE.Vector3().subVectors(to, from);
  const len = span.length();
  if (len < 1e-6) {
    return null;
  }
  const geo = new THREE.CylinderGeometry(radius, radius, len, radialSegments, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), span.clone().normalize(),
  );
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1),
  );
  geo.applyMatrix4(m);
  return geo;
}

function ballGeometry(THREE, p, radius) {
  const geo = new THREE.SphereGeometry(radius, 10, 8);
  geo.translate(p.x, p.y, p.z);
  return geo;
}

/*
 * Merge everything wearing one material into one buffer.
 *
 * Written here rather than imported because BufferGeometryUtils lives under
 * three/addons, and the builder's import map carries the bare three specifier
 * and nothing else. A whoop track is a few dozen meshes and a full field
 * course a few hundred, and under a software rasteriser the draw calls cost
 * more than the triangles.
 */
function mergeGeometries(THREE, geoms) {
  const kept = geoms.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
  if (!kept.length) {
    return null;
  }
  let total = 0;
  for (const g of kept) {
    total += g.getAttribute('position').count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let at = 0;
  for (const g of kept) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    pos.set(p.array.subarray(0, p.count * 3), at * 3);
    if (n) {
      nor.set(n.array.subarray(0, n.count * 3), at * 3);
    }
    at += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}

/*
 * Dim one colour.
 *
 * Per channel, because a packed RGB integer is three numbers in a trench
 * coat and multiplying it by 0.45 is arithmetic on the trench coat: 0x303030
 * scaled that way comes out 0x15af49, which is a bright green, and the first
 * render put a green field under the whole track.
 */
function dim(hex, f) {
  const r = Math.round(((hex >> 16) & 0xff) * f);
  const g = Math.round(((hex >> 8) & 0xff) * f);
  const b = Math.round((hex & 0xff) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* A radial fall off painted into a texture, which is cheaper and steadier
 * than a light with a distance decay and cannot leak onto the pipes. `frac`
 * is where the pool reaches as a fraction of the texture's half width. */
function poolTexture(THREE, frac) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(
    size / 2, size / 2, 0, size / 2, size / 2, (size / 2) * frac,
  );
  grad.addColorStop(0, dim(COL_POOL, 1));
  grad.addColorStop(0.40, dim(COL_POOL, 0.55));
  grad.addColorStop(0.72, dim(COL_POOL, 0.16));
  grad.addColorStop(1, '#000000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/*
 * How far back the camera has to stand for every one of these points to be
 * inside the frustum.
 *
 * Two shortcuts were tried and both waste the frame. A bounding SPHERE round
 * a track is far larger than the track, because a course is wide, flat and
 * low and the name lies on the floor beyond it. A bounding BOX is better but
 * still loose, because it is axis aligned to the field while the track is
 * not, so its corners are in places no pipe ever reaches. Feeding the actual
 * vertices in costs one pass at build time and frames the shot on the thing
 * that is actually there.
 */
function fitDistance(THREE, points, aim, eye, fovDeg, aspect) {
  const forward = eye.clone().negate();
  const worldUp = new THREE.Vector3(0, 1, 0);
  let right = new THREE.Vector3().crossVectors(forward, worldUp);
  if (right.lengthSq() < 1e-9) {
    right = new THREE.Vector3(1, 0, 0);
  }
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * aspect;
  const q = new THREE.Vector3();
  let need = 0;
  for (const p of points) {
    q.copy(p).sub(aim);
    const depth = q.dot(forward);
    need = Math.max(
      need,
      Math.abs(q.dot(right)) / tanH - depth,
      Math.abs(q.dot(up)) / tanV - depth,
    );
  }
  return need;
}

/*
 * The track's name, painted into a canvas and laid on the floor.
 *
 * There is no 3D text anywhere in this repository: no FontLoader, no
 * TextGeometry, no font file. This does not add one. A canvas texture on a
 * plane lying in the floor plane reads in perspective exactly like extruded
 * type does at this size, and it costs a texture rather than a dependency
 * and a typeface licence.
 */
function nameTexture(THREE, name) {
  const w = 1024;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = `#${COL_TEXT.toString(16).padStart(6, '0')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let px = 132;
  const text = String(name || 'Untitled track');
  for (;;) {
    ctx.font = `600 ${px}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    if (ctx.measureText(text).width <= w * 0.92 || px <= 28) {
      break;
    }
    px -= 4;
  }
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/*
 * Which knot the pane belongs on for a given segment.
 *
 * The segment the head is in runs from one knot to the next, and the one the
 * quad is flying TOWARDS is the one to light, which is segments[i].to. Three
 * of those need translating: a finish knot is the first gate come round
 * again, a wrap knot is a synthetic turn between two passes of one structure
 * and has no opening of its own, and a marker is a pole to be flown around
 * rather than an opening to be flown through.
 */
function paneKnotIndex(path, segIndex) {
  const seg = path.segments[segIndex];
  if (!seg) {
    return -1;
  }
  let at = seg.to;
  for (let guard = 0; guard < path.knots.length; guard += 1) {
    const knot = path.knots[at];
    if (!knot) {
      return -1;
    }
    if (knot.role === 'finish') {
      return 0;
    }
    if (knot.role === 'wrap') {
      at = (at + 1) % path.knots.length;
      continue;
    }
    return at;
  }
  return -1;
}

/*
 * The four corners of the opening a knot passes through, or null when the
 * knot has nothing to light.
 *
 * An aperture knot lights its own level. A MARKER knot lights the virtual
 * square on its pass side, the one trackdoc.js scores and the race field
 * draws: the clearance corridor plus its pad wide, as tall as the pole,
 * inner edge on the pole. The first export left markers dark, so a lap
 * round a pole showed the line swerving past nothing, and on a RaceGOW
 * track that is a fifth of the passes. A waypoint has no square and gets no
 * pane: it pins the line, it is not a hole.
 */
function paneCorners(doc, knot) {
  const el = elementById(doc, knot.seq.elementId);
  const def = el ? ELEMENTS[el.type] : null;
  if (!def) {
    return null;
  }
  if (knot.role === 'marker') {
    const clearance = knot.seq.clearance ?? 0;
    if (def.kind !== KIND.MARKER || !knot.markerPos || clearance < 0.05) {
      return null;
    }
    const dims = virtualApertureDims(el, knot.seq, trackClassOf(doc));
    const ox = knot.pos.x - knot.markerPos.x;
    const oy = knot.pos.y - knot.markerPos.y;
    const on = Math.hypot(ox, oy) || 1;
    const centre = {
      x: knot.markerPos.x + (ox / on) * (dims.clearW / 2),
      y: knot.markerPos.y + (oy / on) * (dims.clearW / 2),
      z: knot.markerPos.z + dims.centerH,
    };
    const t = knot.tangent;
    return apertureCorners(centre, Math.atan2(t.y, t.x), 0, dims.clearW, dims.clearH);
  }
  if (def.kind !== KIND.APERTURE) {
    return null;
  }
  const levels = aperturesOf(el);
  const idx = Math.min(Math.max(0, knot.seq.apertureIndex ?? 0), levels.length - 1);
  const ap = levels[idx];
  if (!ap) {
    return null;
  }
  return apertureCorners(apertureCenter(el, idx), el.yaw, el.pitch, ap.clearW, ap.clearH);
}

export function buildStage(THREE, doc, path, {
  size = 512, width = size, height = size, camera: fixed = null,
} = {}) {
  const trash = [];
  const keep = (x) => {
    trash.push(x);
    return x;
  };

  const micro = trackClassOf(doc) === 'micro';
  const tubeOD = micro ? RACEGOW_PIPE_OD : FRAME_TUBE_OD;

  /*
   * HOW THICK TO DRAW A PIPE, which is not always how thick the pipe is.
   *
   * A whoop track is a room across, so its 26.7 mm pipe lands on about five
   * pixels at 512 square and the truth is also the best picture. A full sized
   * MultiGP course is 120 m across, and its 33.4 mm pipe works out at 0.13 of
   * a pixel: every gate on the first full class export was invisible, and the
   * animation was a red line over an empty floor.
   *
   * So the pipe is drawn at its real diameter or at a readable minimum,
   * whichever is larger, and that is a deliberate exaggeration recorded here
   * rather than a number tuned until it looked right. It applies only to the
   * DRAWN radius. Every position, every opening and every span still comes
   * from the document, so the gate the pane lands on is the same size and in
   * the same place as the gate the pilot flies. view3d.js already does the
   * same kind of thing for the same reason, tracing a LineLoop round the true
   * opening so a gate stays readable at distance.
   */
  const spanR = estimateRadius(doc, path);
  /* The SHORT edge, because that is the one the frame is fitted to and so
   * the one a pipe's readable minimum has to be measured against. On a
   * square export the two are the same number, which is what this was. */
  const shortEdge = Math.max(64, Math.min(width, height));
  const worldPerPx = (2.2 * spanR) / shortEdge;
  const minDrawR = (MIN_PIPE_PX * worldPerPx) / 2;
  const tubeR = Math.max(tubeOD / 2, minDrawR);
  const jointR = tubeR * JOINT_SCALE;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL_FLOOR);

  /* The one conversion. Document is Z up, Three is Y up. */
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  scene.add(root);

  const track = new THREE.Group();
  root.add(track);
  /*
   * The pipe and the pads, kept in their own group. The framing below
   * measures THIS and not the track group, because the pane and the ribbon
   * go in beside it and a bounding box that moved with the ribbon would
   * re-frame the shot on every frame.
   */
  const statics = new THREE.Group();
  track.add(statics);

  const pipeMat = keep(new THREE.MeshStandardMaterial({
    color: COL_PIPE, roughness: 0.6, metalness: 0.0,
  }));
  const padMat = keep(new THREE.MeshStandardMaterial({
    color: COL_START_PAD, roughness: 0.9, metalness: 0.0,
  }));

  const pipes = [];
  const pads = [];

  /* A pipe standing on the floor gets a fitting and four stubs, which is
   * what the reference's splayed foot is and what a real build uses to stop
   * a gate walking. */
  const addFoot = (p) => {
    pipes.push(ballGeometry(THREE, { x: p.x, y: p.y, z: p.z + jointR }, jointR));
    const reach = jointR * FOOT_STUB_SCALE;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      pipes.push(pipeGeometry(
        THREE,
        { x: p.x, y: p.y, z: p.z + tubeR },
        { x: p.x + dx * reach, y: p.y + dy * reach, z: p.z + tubeR },
        tubeR * 0.75, 6,
      ));
    }
  };

  const buildAperture = (el) => {
    const levels = aperturesOf(el);
    if (!levels.length) {
      return;
    }
    /* A gap in the lattice is drawn by the structures around it. The pane
     * still lights when the lap reaches it; there is just no pipe of its
     * own. See isUnbuilt in elements.js. */
    if (isUnbuilt(el)) {
      return;
    }
    const base = el.position.z;
    let lowerTop = null;
    for (const ap of levels) {
      const centre = apertureCenter(el, ap.index);
      /* The bar centrelines, which are the clear opening grown by half a
       * tube on each side. Exactly the rectangle view3d.js lays its boxes
       * on, so the two pictures agree about where the pipe is. */
      const c = apertureCorners(
        centre, el.yaw, el.pitch, ap.clearW + tubeOD, ap.clearH + tubeOD,
      );
      for (let i = 0; i < 4; i += 1) {
        pipes.push(pipeGeometry(THREE, c[i], c[(i + 1) % 4], tubeR));
        pipes.push(ballGeometry(THREE, c[i], jointR));
      }
      /* Corners nought and one are the lower edge of the opening, two and
       * three the upper. A stack shares its verticals, so each level is
       * joined to the one below rather than given legs of its own. */
      if (lowerTop) {
        pipes.push(pipeGeometry(THREE, lowerTop[0], c[0], tubeR));
        pipes.push(pipeGeometry(THREE, lowerTop[1], c[1], tubeR));
      } else {
        /*
         * The lowest edge of the lowest opening carries the legs. Which
         * corners those are is read off the geometry rather than assumed,
         * because a dive gate lies flat and all four of its corners are the
         * lowest edge, so it stands on four legs and a vertical gate on two.
         */
        let minZ = Infinity;
        for (const p of c) {
          minZ = Math.min(minZ, p.z);
        }
        for (const p of c) {
          if (p.z > minZ + tubeOD) {
            continue;
          }
          if (p.z - base > GROUND_EPS) {
            pipes.push(pipeGeometry(THREE, { x: p.x, y: p.y, z: base }, p, tubeR));
          }
          addFoot({ x: p.x, y: p.y, z: base });
        }
      }
      lowerTop = [c[3], c[2]];
    }
  };

  const buildMarker = (el) => {
    const h = el.dims.height ?? 1.5;
    const r = Math.max(el.dims.poleRadius ?? el.dims.baseRadius ?? tubeR, minDrawR);
    const p = el.position;
    pipes.push(pipeGeometry(
      THREE, { x: p.x, y: p.y, z: p.z }, { x: p.x, y: p.y, z: p.z + h }, r,
    ));
    pipes.push(ballGeometry(THREE, { x: p.x, y: p.y, z: p.z + h }, r * JOINT_SCALE));
    addFoot({ x: p.x, y: p.y, z: p.z });
  };

  const buildObstacle = (el) => {
    const p = el.position;
    const len = el.dims.width ?? 1;
    const dx = Math.cos(el.yaw) * (len / 2);
    const dy = Math.sin(el.yaw) * (len / 2);
    const z = p.z + (el.dims.height ?? tubeOD) / 2;

    /*
     * A horizontal pole IS a pipe, and it is on the RaceGOW element list, so
     * it is built properly: a span at its height on two uprights with feet.
     * A barrier is not on that list and never appears on a whoop track, so
     * it gets a box, which is what view3d.js draws and is enough for it to
     * read as something not to fly through on a full sized course.
     */
    if (el.type !== 'horizontalPole') {
      const geo = new THREE.BoxGeometry(len, el.dims.depth ?? 1, el.dims.height ?? 1);
      geo.rotateZ(el.yaw);
      geo.translate(p.x, p.y, z);
      pipes.push(geo);
      return;
    }

    pipes.push(pipeGeometry(
      THREE,
      { x: p.x - dx, y: p.y - dy, z },
      { x: p.x + dx, y: p.y + dy, z },
      Math.max(el.dims.depth ?? tubeOD, el.dims.height ?? tubeOD) / 2,
    ));
    if (z - p.z > GROUND_EPS) {
      for (const s of [-1, 1]) {
        const fx = p.x + s * dx;
        const fy = p.y + s * dy;
        pipes.push(pipeGeometry(
          THREE, { x: fx, y: fy, z: p.z }, { x: fx, y: fy, z }, tubeR,
        ));
        pipes.push(ballGeometry(THREE, { x: fx, y: fy, z }, jointR));
        addFoot({ x: fx, y: fy, z: p.z });
      }
    }
  };

  const buildStart = (el) => {
    const n = Math.max(1, Math.round(el.dims.pads ?? 1));
    const spacing = el.dims.spacing ?? 1;
    const pad = el.dims.padSize ?? 0.5;
    const p = el.position;
    const ux = Math.cos(el.yaw + Math.PI / 2);
    const uy = Math.sin(el.yaw + Math.PI / 2);
    for (let i = 0; i < n; i += 1) {
      const off = (i - (n - 1) / 2) * spacing;
      const geo = new THREE.PlaneGeometry(pad, pad);
      geo.rotateZ(el.yaw);
      geo.translate(p.x + ux * off, p.y + uy * off, p.z + 0.004);
      pads.push(geo);
    }
  };

  for (const el of doc.elements) {
    const def = ELEMENTS[el.type];
    if (!def) {
      continue;
    }
    /* A label is an authoring note and a ground logo is paint. trackdoc.js
     * keeps neither out of the race field, and neither belongs here. */
    if (def.kind === KIND.ANNOTATION || def.kind === KIND.DECAL) {
      continue;
    }
    if (def.kind === KIND.APERTURE) {
      buildAperture(el);
    } else if (def.kind === KIND.MARKER) {
      /* A waypoint is a ghost. Nothing stands there on the race field, so
       * nothing stands there here either. */
      if (el.type !== 'waypoint') {
        buildMarker(el);
      }
    } else if (def.kind === KIND.OBSTACLE) {
      buildObstacle(el);
    } else if (def.kind === KIND.START) {
      buildStart(el);
    }
  }

  const pipeGeo = mergeGeometries(THREE, pipes);
  if (pipeGeo) {
    keep(pipeGeo);
    const mesh = new THREE.Mesh(pipeGeo, pipeMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    statics.add(mesh);
  }
  const padGeo = mergeGeometries(THREE, pads);
  if (padGeo) {
    keep(padGeo);
    const mesh = new THREE.Mesh(padGeo, padMat);
    mesh.receiveShadow = true;
    statics.add(mesh);
  }

  /* The bounding box of the built track, before the floor and the name are
   * added, because the floor is enormous on purpose and would swamp the
   * framing entirely. */
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(statics);
  const centre = new THREE.Vector3();
  box.getCenter(centre);
  const radius = Math.max(0.5, box.getBoundingSphere(new THREE.Sphere()).radius);

  /*
   * THE LONG AXIS. The principal axis of the elements in plan, which is the
   * direction a course is longest in. Taken from the covariance rather than
   * from the bounding box because a bounding box is aligned to the field and
   * a track laid diagonally across a room would report the room's axis.
   */
  let n = 0;
  let mx = 0;
  let my = 0;
  for (const el of doc.elements) {
    const def = ELEMENTS[el.type];
    if (!def || def.kind === KIND.ANNOTATION || def.kind === KIND.DECAL) {
      continue;
    }
    mx += el.position.x;
    my += el.position.y;
    n += 1;
  }
  let theta = 0;
  if (n > 1) {
    mx /= n;
    my /= n;
    let vxx = 0;
    let vyy = 0;
    let vxy = 0;
    for (const el of doc.elements) {
      const def = ELEMENTS[el.type];
      if (!def || def.kind === KIND.ANNOTATION || def.kind === KIND.DECAL) {
        continue;
      }
      const dx = el.position.x - mx;
      const dy = el.position.y - my;
      vxx += dx * dx;
      vyy += dy * dy;
      vxy += dx * dy;
    }
    theta = 0.5 * Math.atan2(2 * vxy, vxx - vyy);
  }
  const azimuth = theta + AZIMUTH_OFF_AXIS;

  /* The floor. Large enough that its edge is never in shot, and black past
   * the pool so the track stands on nothing. The pool is sized against the
   * track, so the two are independent. */
  const floorSpan = Math.max(doc.field.width, doc.field.depth, radius * 6) * 2;
  const poolFrac = clamp((radius * POOL_RADII) / (floorSpan / 2), 0.04, 0.95);
  const floorTex = keep(poolTexture(THREE, poolFrac));
  const floorGeo = keep(new THREE.PlaneGeometry(floorSpan, floorSpan));
  const floorMat = keep(new THREE.MeshStandardMaterial({
    map: floorTex, roughness: 1, metalness: 0,
  }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  /* Authored in document coordinates like everything else, so the plane is
   * already in the floor plane and only needs moving under the track. */
  floor.position.set(centre.x, -centre.z, box.min.y - 0.001);
  floor.receiveShadow = true;
  root.add(floor);

  /*
   * THE NAME, laid in the floor plane in front of the track, turned so it
   * reads from wherever the camera ended up. Its own up direction points at
   * the camera, which for a plane authored in the document's XY is a turn of
   * the azimuth less a quarter.
   */
  const nameTex = keep(nameTexture(THREE, doc.name));
  const nameW = radius * 1.1;
  const nameH = nameW * 0.25;
  const nameGeo = keep(new THREE.PlaneGeometry(nameW, nameH));
  const nameMat = keep(new THREE.MeshBasicMaterial({
    map: nameTex, transparent: true, depthWrite: false,
  }));
  const nameMesh = new THREE.Mesh(nameGeo, nameMat);
  const nameOut = radius * 0.92;
  nameMesh.position.set(
    centre.x + Math.cos(azimuth) * nameOut,
    -centre.z + Math.sin(azimuth) * nameOut,
    box.min.y + 0.004,
  );
  /*
   * Turned so the tops of the letters point AWAY from the camera, which is
   * what upright means for type lying on the ground: a reader standing at
   * the camera has the far edge of the word at the top of their view. The
   * first attempt pointed them at the camera and the name came out upside
   * down.
   */
  nameMesh.rotation.z = azimuth + Math.PI / 2;
  nameMesh.renderOrder = 2;
  root.add(nameMesh);

  /*
   * Everything that has to be in shot, as points rather than as a box, and
   * never the floor. A document point becomes a world point through the same
   * rotation the root group carries, document (x, y, z) to Three (x, z, minus
   * y), which is the only place in this file that conversion is written by
   * hand rather than left to the group.
   */
  scene.updateMatrixWorld(true);
  const fitPts = [];
  const addGeoPoints = (geo) => {
    if (!geo) {
      return;
    }
    const p = geo.getAttribute('position');
    /* Twenty thousand points is plenty to bound a shape, and a merged field
     * course runs to hundreds of thousands. */
    const stride = Math.max(1, Math.ceil(p.count / 20000));
    for (let i = 0; i < p.count; i += stride) {
      fitPts.push(new THREE.Vector3(p.getX(i), p.getZ(i), -p.getY(i)));
    }
  };
  addGeoPoints(pipeGeo);
  addGeoPoints(padGeo);
  for (const sx of [-0.5, 0.5]) {
    for (const sy of [-0.5, 0.5]) {
      const lx = sx * nameW;
      const ly = sy * nameH;
      const cz = Math.cos(nameMesh.rotation.z);
      const sz = Math.sin(nameMesh.rotation.z);
      const dx = nameMesh.position.x + lx * cz - ly * sz;
      const dy = nameMesh.position.y + lx * sz + ly * cz;
      fitPts.push(new THREE.Vector3(dx, nameMesh.position.z, -dy));
    }
  }

  const framedBox = new THREE.Box3().setFromPoints(fitPts);
  const fitR = Math.max(0.6, framedBox.getBoundingSphere(new THREE.Sphere()).radius);
  const fitCentre = framedBox.getCenter(new THREE.Vector3());

  /* FOV_DEG is the VERTICAL field of view, so a wider frame sees more of
   * the sides and exactly as much of the top and bottom. That is the right
   * way round for a track, which is wide. */
  const aspect = width / height;
  const camera = new THREE.PerspectiveCamera(FOV_DEG, aspect, 0.05, Math.max(200, fitR * 40));
  const aim = new THREE.Vector3(
    fitCentre.x,
    framedBox.min.y + AIM_HEIGHT * (framedBox.max.y - framedBox.min.y),
    fitCentre.z,
  );
  /* A document azimuth turns into a Three heading through the same rotation
   * the root group carries: document (x, y, z) is Three (x, z, minus y). */
  const eye = new THREE.Vector3(
    Math.cos(azimuth) * Math.cos(ELEVATION),
    Math.sin(ELEVATION),
    -Math.sin(azimuth) * Math.cos(ELEVATION),
  );
  const dist = Math.max(fitR * 0.5, FIT_MARGIN * fitDistance(
    THREE, fitPts, aim, eye, FOV_DEG, aspect,
  ));
  camera.position.copy(aim).addScaledVector(eye, dist);
  camera.lookAt(aim);
  /*
   * A CAMERA THE CALLER SUPPLIES, in document coordinates, overrides the
   * framing above. It exists so an export can be shot from exactly the
   * viewpoint of a reference picture and laid over it, which is how the
   * RaceGOW reconstructions were checked against the official animations.
   * The conversion is the root group's: document (x, y, z) is Three
   * (x, z, minus y).
   */
  if (fixed && fixed.eye && fixed.aim) {
    camera.position.set(fixed.eye.x, fixed.eye.z, -fixed.eye.y);
    camera.lookAt(new THREE.Vector3(fixed.aim.x, fixed.aim.z, -fixed.aim.y));
    if (Number.isFinite(fixed.fovDeg) && fixed.fovDeg > 1) {
      camera.fov = fixed.fovDeg;
    }
    camera.updateProjectionMatrix();
  }

  /*
   * THE LIGHT. One key, thrown 40 degrees round from the camera so the pipes
   * get a lit face and a shaded face and the shadow falls across the frame
   * rather than straight away from the eye. One dim hemisphere so the shaded
   * face is grey rather than black.
   */
  const keyAz = azimuth + (40 * Math.PI) / 180;
  const keyEl = (60 * Math.PI) / 180;
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  const keyDist = Math.max(6, fitR * 3);
  key.position.set(
    aim.x + Math.cos(keyAz) * Math.cos(keyEl) * keyDist,
    aim.y + Math.sin(keyEl) * keyDist,
    aim.z - Math.sin(keyAz) * Math.cos(keyEl) * keyDist,
  );
  key.target.position.copy(aim);
  key.castShadow = true;
  key.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = keyDist * 2.4;
  const half = fitR * 1.4;
  key.shadow.camera.left = -half;
  key.shadow.camera.right = half;
  key.shadow.camera.top = half;
  key.shadow.camera.bottom = -half;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = tubeR;
  scene.add(key);
  scene.add(key.target);
  scene.add(new THREE.HemisphereLight(0xaeb6c0, 0x08080c, 0.24));

  /*
   * THE PANE. One quad, moved, rather than one per gate lit in turn. Its
   * four corners are rewritten from apertureCorners whenever the gate
   * changes, so it is correct for any yaw and any pitch including a dive
   * gate lying flat.
   */
  const paneGeo = keep(new THREE.BufferGeometry());
  paneGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  paneGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const paneMat = keep(new THREE.MeshBasicMaterial({
    color: COL_PANE,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  const pane = new THREE.Mesh(paneGeo, paneMat);
  pane.renderOrder = 3;
  pane.visible = false;
  pane.frustumCulled = false;
  track.add(pane);

  const ribbonR = Math.max(
    clamp(RIBBON_R_PER_METRE * radius, RIBBON_R_MIN, RIBBON_R_MAX),
    (MIN_RIBBON_PX * worldPerPx) / 2,
  );
  const coreMat = keep(new THREE.MeshBasicMaterial({
    color: COL_RIBBON_CORE, vertexColors: true,
  }));
  const shellMat = keep(new THREE.MeshBasicMaterial({
    color: COL_RIBBON_SHELL,
    vertexColors: true,
    transparent: true,
    opacity: 0.30,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  const core = new THREE.Mesh(new THREE.BufferGeometry(), coreMat);
  const shell = new THREE.Mesh(new THREE.BufferGeometry(), shellMat);
  core.frustumCulled = false;
  shell.frustumCulled = false;
  shell.renderOrder = 4;
  track.add(core);
  track.add(shell);

  const samples = path.samples;
  const total = path.length;
  const tail = TAIL_FRACTION * total;

  /* The sample at or before an arc length, by bisection, because at three
   * hundred frames a linear scan of the samples is the only thing in the
   * frame loop that would grow with the track. */
  const sampleAt = (s) => {
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (samples[mid].s <= s) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  };

  const lerp = (a, b, t) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  });

  /*
   * The window of line behind the head, tail first. Walking backwards and
   * wrapping through sample zero is what makes the loop seamless: on a
   * closed lap the last sample and the first are the same point, so the
   * ribbon crosses the seam without a jump.
   */
  const windowPoints = (s) => {
    const headIdx = sampleAt(s);
    const a = samples[headIdx];
    const b = samples[Math.min(headIdx + 1, samples.length - 1)];
    const span = b.s - a.s;
    const headPos = span > 1e-9 ? lerp(a.pos, b.pos, (s - a.s) / span) : a.pos;

    const pts = [headPos];
    let idx = headIdx;
    let covered = 0;
    let prev = headPos;
    while (covered < tail && pts.length < samples.length) {
      const p = samples[idx].pos;
      const d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      if (d > 1e-6) {
        covered += d;
        pts.push(p);
        prev = p;
      }
      idx -= 1;
      if (idx < 0) {
        if (!path.closed) {
          break;
        }
        idx = samples.length - 1;
      }
    }
    pts.reverse();
    return pts;
  };

  const setTube = (mesh, pts, radius) => {
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (pts.length < 2) {
      mesh.geometry = new THREE.BufferGeometry();
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => v3(THREE, p)));
    const segs = Math.max(8, Math.min(220, pts.length * 2));
    const geo = new THREE.TubeGeometry(curve, segs, radius, RIBBON_RADIAL_SEGMENTS, false);
    /*
     * The taper is a vertex colour rather than a shrinking radius. A cone
     * reads as a cone; a bar of light that fades reads as speed. A tube's
     * vertices come out in rings, one ring per tubular segment, so the ramp
     * is a function of the ring index.
     */
    const rings = segs + 1;
    const perRing = RIBBON_RADIAL_SEGMENTS + 1;
    const count = geo.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const ring = Math.min(rings - 1, Math.floor(i / perRing));
      const t = rings > 1 ? ring / (rings - 1) : 1;
      const f = t * t;
      colors[i * 3] = f;
      colors[i * 3 + 1] = f;
      colors[i * 3 + 2] = f;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    mesh.geometry = geo;
  };

  const panePos = paneGeo.getAttribute('position');
  let paneAt = -2;

  const setPane = (knotIndex) => {
    if (knotIndex === paneAt) {
      return;
    }
    paneAt = knotIndex;
    const knot = knotIndex >= 0 ? path.knots[knotIndex] : null;
    const corners = knot && knot.seq ? paneCorners(doc, knot) : null;
    if (!corners) {
      pane.visible = false;
      return;
    }
    /* Nudged back along the way the quad is going, so the pane sits on the
     * approach side of the opening and cannot fight the bars for depth. */
    const t = knot.tangent;
    const len = Math.hypot(t.x, t.y, t.z) || 1;
    const nx = (-t.x / len) * 0.02;
    const ny = (-t.y / len) * 0.02;
    const nz = (-t.z / len) * 0.02;
    for (let i = 0; i < 4; i += 1) {
      panePos.setXYZ(i, corners[i].x + nx, corners[i].y + ny, corners[i].z + nz);
    }
    panePos.needsUpdate = true;
    paneGeo.computeBoundingSphere();
    pane.visible = true;
  };

  const setFrame = (i, frames) => {
    /*
     * Frame i of frames, and nothing else. No clock, no elapsed time, no
     * random: the same index must give the same picture in a browser and in
     * the headless harness, or the script is not checking what ships.
     *
     * The last frame is frames minus one, not frames, so the loop does not
     * hold the first picture for two beats when it comes round.
     */
    const s = total > 0 ? ((i % frames) / frames) * total : 0;
    const pts = windowPoints(s);
    setTube(core, pts, ribbonR);
    setTube(shell, pts, ribbonR * RIBBON_SHELL_SCALE);
    const headIdx = sampleAt(s);
    setPane(paneKnotIndex(path, samples[headIdx].segment));
  };

  setFrame(0, 1);

  return {
    scene,
    camera,
    setFrame,
    bbox: framedBox,
    dispose() {
      for (const t of trash) {
        if (t && typeof t.dispose === 'function') {
          t.dispose();
        }
      }
      if (core.geometry) { core.geometry.dispose(); }
      if (shell.geometry) { shell.geometry.dispose(); }
    },
  };
}
