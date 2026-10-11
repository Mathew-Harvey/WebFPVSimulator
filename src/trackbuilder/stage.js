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

/*
 * A NAMESPACE IMPORT, not a named one, for frameSidesOf.
 *
 * The builder boots on one copy of elements.js and draws the lap from
 * another. The page's own scripts are stamped with the deploy, and this
 * file is not among them: it is imported when somebody asks for the
 * animation, on demand or in the moment after a publish. A browser that
 * still holds the previous elements.js, which is allowed for four hours,
 * resolves that second import onto the old file. A named import of a
 * function the old file does not export fails the module before a single
 * frame is drawn, and the sentence the dialog shows is the link error.
 * The namespace import links either way. A module from before the function
 * existed draws every side, which is what every gate in that module was.
 */
import * as elementLib from './elements.js';
import {
  ELEMENTS, KIND, FRAME_TUBE_OD, isUnbuilt, trackClassOf, virtualApertureDims, isPlain, flagSideOf, flagSideSigns,
  flagLeanSign, gateFlagHeight, GATE_FLAG_POLE_R,
} from './elements.js';
import { PIPE_OD as RACEGOW_PIPE_OD } from './racegow.js';
import * as modelLib from './model.js';
import { aperturesOf, elementById, apertureCenter, logoForDecal, dressOrder } from './model.js';
import { apertureFrame, apertureCorners, clamp } from './geometry.js';
import { isRoomType, roomWorldBoxes } from '../props/room.js';
/* The game's own turf and the game's own way of painting a sponsor on it, for the race field. */
import {
  GROUND_TURF, paintGroundLogo, paintGateHeader, paintGateSleeve, paintFlagSailPair, flagMast, flagSailProfile,
  bannerCanvas, BANNER_SIZE, GATE_BANNER_H,
} from '../art/banners.js';
/* A hoop and a hex gate: the run of tubes round the hole, and a pane in its shape. */
import { frameOutline, paneFan } from '../props/aperture.js';
/* A letter: its pipe and its holes, by the namespace for the reason above (a letter is newer than the oldest copy a
 * browser may still hold of any of these files, and a document that has one is read by this module's own copy). */
import * as apertureLib from '../props/aperture.js';

const ALL_SIDES = { top: true, bottom: true, left: true, right: true };

/* Whether a piece is a letter, and what its pipe is made of: through the namespace, so a copy of elements.js from
 * before letters read every piece as the gate it always was. */
function isLetter(el) {
  return typeof elementLib.isLetterPiece === 'function' && elementLib.isLetterPiece(el)
    && typeof modelLib.letterLayoutOf === 'function';
}

function frameSidesOf(el) {
  if (typeof elementLib.frameSidesOf === 'function') {
    return elementLib.frameSidesOf(el);
  }
  return ALL_SIDES;
}

/* One opening's stretch of an upright of a stack: through the namespace for the reason above, and built when the
 * copy of elements.js a browser still holds has never heard of it. */
function uprightIntact(el, side) {
  if (typeof elementLib.uprightIntact === 'function') {
    return elementLib.uprightIntact(el, side);
  }
  return true;
}

function poleBuilt(el, side, index) {
  if (typeof elementLib.poleBuilt === 'function') {
    return elementLib.poleBuilt(el, side, index);
  }
  return true;
}

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

/*
 * THE PACE OF THE LAP IS A SPEED, NOT A DURATION.
 *
 * It was 300 frames at 25 fps for every track, twelve seconds whatever the
 * lap, so the quad's speed was the lap's length divided by twelve: Track 8
 * is 41.5 m and flew at 3.5 m/s, Track 1 is 13.4 m and crawled at 1.1 m/s.
 * The pilot's report is exactly that. "If there are many gates the pathing
 * moves very fast, if a few gates slow."
 *
 * RaceGOW'S OWN ANIMATIONS ARE THE ANSWER AND THEY WERE MEASURED. The three
 * official files are 288, 192 and 96 frames, all at 42 ms, which is 12, 8
 * and 4 seconds for laps of 41.47, 34.63 and 13.38 m. That is 3.46, 4.33
 * and 3.35 m/s, one pace picked per track and quantised to whole four
 * second blocks: 89.48 m over 24.0 s, 3.73 m/s.
 *
 * The five inch's figure is that speed scaled by the ratio of the two
 * aircraft's swept radii, 0.1735 over 0.0506, because a machine three and a
 * half times the size has to cover three and a half times the ground to
 * read as the same pace to an eye. It comes out at 12.7 m/s, which is
 * inside the 12 to 15 m/s a five inch actually laps a 400 m course at, and
 * that agreement is the check on the reasoning rather than the reasoning
 * itself.
 *
 * src/share/plan.js carries the same two numbers for the course card, with
 * the same note, so a card and a GIF of one track still move together.
 */
export const LAP_SPEED = { micro: 3.73, full: 12.7 };
/*
 * THE MICRO PACE IS NOW ALSO THE FULL PACE DIVIDED BY MICRO_SCALE, and it
 * was not arranged to be.
 *
 * 3.73 m/s was measured off real RaceGOW footage, back when a whoop was a
 * whoop and flew a room one to one. A micro course is now built MICRO_SCALE
 * times life size and flown by the five inch's plant, so the honest pace
 * against a DOCUMENT length is the field's 12.7 divided by 3.4289, which is
 * 3.704. The measured figure and the derived one agree to 0.7 percent.
 *
 * That agreement is worth writing down rather than acting on. It is evidence
 * that the scale is the right size: a real whoop's lap pace in a real room
 * already sits where geometric scaling of a five inch puts it, which is the
 * observation the whole change rests on. The measured number stays, because
 * it is measured, and nothing here needs a derived one to be correct.
 */
/*
 * And the loop's own bounds, in frames. A two gate room is four metres of
 * lap and would be a one second GIF that reads as a flicker; a 400 m
 * MultiGP course is half a minute, which is not a thing anybody shares. So
 * the pace holds between them and the ends are clamped, and --frames is
 * still there for a smoke render or a smaller file.
 */
const LAP_FRAMES_MIN = 48;
const LAP_FRAMES_MAX = 600;

/* How many frames one lap of this track is, at this frame delay. */
export function lapFrames(lengthM, cls, delayCs) {
  const speed = LAP_SPEED[cls === 'micro' ? 'micro' : 'full'];
  const fps = 100 / (delayCs > 0 ? delayCs : 4);
  const want = Math.round((lengthM / speed) * fps);
  if (!Number.isFinite(want)) {
    return LAP_FRAMES_MIN;
  }
  return Math.max(LAP_FRAMES_MIN, Math.min(LAP_FRAMES_MAX, want));
}
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
/* What lies past the mown grass of the race field: dark, and green enough to be bush and not a void. */
const COL_SURROUND = 0x0e1a10;
const COL_FIELD_LINE = '#e6efe2';
/* Mown run off outside the field's boundary, in metres, and a stripe's width: the game's own numbers (PITCH in render/scene.js). */
const FIELD_MARGIN = 8;
const FIELD_STRIPE = 5;

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
 * difference nobody can see at 512 by 512. That is the size at 512 and under:
 * a bigger picture gets a bigger map, see detailOf.
 */
const SHADOW_MAP = 1024;

/* The two images the scene paints from canvases, at the size they have always
 * been. The name is four times as wide as it is tall; the pool is square. */
const NAME_TEXTURE_W = 1024;
const POOL_TEXTURE = 512;

/*
 * THE REFERENCE EDGE. Every number in this file that is counted in pixels, a
 * pipe's readable minimum and the ribbon's, was tuned by eye on a picture 512
 * on a side. A bigger picture is meant to be that picture with more pixels in
 * it, not a thinner one. Left alone, MIN_PIPE_PX at 2048 is a quarter of the
 * weight it has at 512, and a full sized course comes out as hairlines that
 * vanish the moment the file is shown at the size of a screen: that was
 * measured on the 2025 WA States course before this existed.
 *
 * So those minimums are worked out against this edge, or against the
 * picture's own short edge when that is smaller. At 512 and under the two are
 * the same number and nothing changes, which is what keeps the 384 by 240
 * cards and the standard export exactly as they were. Above it a pipe is
 * drawn as thick in the world as it was at 512 and lands on more pixels.
 */
const REFERENCE_EDGE = 512;

/*
 * WHAT GROWS WITH THE PICTURE, which is every image the scene is made from,
 * because each was sized for 512. At 2048, before this, the name (a texture
 * 1024 wide) came out with scan lines through every letter, and the pool of
 * light (a 512 square gradient laid over a floor many times its width, so
 * about a hundred texels across the lit part) came out as flat steps with the
 * ring edges twenty pixels to the stair. At 512 neither could be seen, which
 * is why nobody needed this.
 *
 * The shadow map is the one that depends on the course. On a full sized field
 * it made no visible difference at 2048, because the floor is nearly black
 * and the pipe is drawn thick. On the micro living room, where the pipe is its
 * real 27 mm, a 1024 map drew the shadow of a pipe as a soft smear and the
 * shadow on the pipe itself as a mottled blotch, and 4096 drew both as clean
 * edges, so it grows with everything else rather than being argued per track.
 *
 * Whole doublings, because a texture or a shadow map is cheapest at a power of
 * two and a 700 pixel picture taking the next size up is simpler than taking
 * one between. Capped at 4096 and at what the graphics card says it can hold
 * (maxTexture, from the renderer), so a small card gets the biggest picture it
 * can draw instead of a texture that fails to upload.
 *
 * Pure arithmetic with no GL in it, so scripts/gif-selftest.js can pin it.
 * AT 512 AND UNDER NOTHING GROWS: steps is nought and every size is the one
 * it was before this function existed.
 */
export function detailOf(width, height, maxTexture = 4096) {
  const shortEdge = Math.max(64, Math.min(width, height));
  const steps = Math.max(0, Math.ceil(Math.log2(shortEdge / REFERENCE_EDGE)));
  const grow = (base) => Math.max(base, Math.min(base * 2 ** steps, 4096, maxTexture));
  return {
    shadowMap: grow(SHADOW_MAP),
    nameWidth: grow(NAME_TEXTURE_W),
    poolSize: grow(POOL_TEXTURE),
  };
}

/*
 * The narrowest a pipe is allowed to be on screen, in pixels, on a picture
 * REFERENCE_EDGE across. Below about this a thin diagonal cylinder stops being
 * a shape and becomes intermittent aliasing, and 256 palette entries cannot
 * rescue it.
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
 * is where the pool reaches as a fraction of the texture's half width. `size`
 * is the canvas edge: 512 is plenty for a picture 512 across, and detailOf
 * hands a bigger one to a bigger picture. */
function poolTexture(THREE, frac, size = POOL_TEXTURE) {
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
 * HOW A NAME IS SET ON THE PLATE. The plate is four times as wide as it is
 * tall, and the name used to go on it as one line shrunk until it fitted or
 * until it hit a floor of 28 pixels, which is where a long name was cut off
 * at both ends: "WA State Championships 2025 Round 3 Qualifying Heat Final
 * Series Day Two" came out as "ate Championships ... Series Da". A name
 * is now broken at its spaces, onto as many as three lines, and set at the
 * LARGEST size that fits, so nothing is ever cut and a long name is as big
 * as it can be rather than as small as one line forces.
 *
 * ONE LINE IS PREFERRED, but only while it stays large (ONE_LINE_MIN_PX).
 * A name that fits on one line at 48 pixels or more is set exactly as it
 * always was, and that is every name up to about thirty letters in the
 * typefaces this is drawn in; one that would need less is broken, because a
 * name small enough to squint at is a worse picture than two lines of larger
 * type. Two lines are preferred to three on the same terms. The first version
 * of this broke at 72, which turned "WA State Champs 2025" into two lines
 * and changed the picture of a name that had never been a problem.
 *
 * `measure(text, px)` is the width of a string at a size, which is the
 * canvas's measureText in the page and any function at all in a test: this
 * is pure so that scripts/gif-selftest.js can pin it. A single word wider
 * than a line is broken between letters, and if even three lines at the
 * smallest size cannot hold the name (an eighty character name in a typeface
 * of very wide letters) the last line ends in an ellipsis. A name is never
 * cut mid letter and never runs off the plate.
 */
const NAME_FILL = 0.92;
const NAME_LEADING = 1.15;
const NAME_MAX_PX = 132;
const NAME_MIN_PX = 28;
const ONE_LINE_MIN_PX = 48;
const TWO_LINE_MIN_PX = 44;
const NAME_MAX_LINES = 3;

function wrapName(measure, text, px, maxWidth) {
  const lines = [];
  let line = '';
  const push = (word) => {
    const trial = line ? `${line} ${word}` : word;
    if (measure(trial, px) <= maxWidth || !line) {
      line = trial;
      return;
    }
    lines.push(line);
    line = word;
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (measure(word, px) <= maxWidth) {
      push(word);
      continue;
    }
    /* A word wider than the plate: between letters, because it has nowhere else to break. */
    let piece = '';
    for (const ch of word) {
      if (piece && measure(piece + ch, px) > maxWidth) {
        push(piece);
        lines.push(line);
        line = '';
        piece = '';
      }
      piece += ch;
    }
    if (piece) {
      push(piece);
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

export function fitName(measure, name, maxWidth, maxHeight) {
  const text = String(name || '').trim() || 'Untitled track';
  const fits = (lines, px) => lines.length * px * NAME_LEADING <= maxHeight
    && lines.every((l) => measure(l, px) <= maxWidth);
  for (let want = 1; want <= NAME_MAX_LINES; want += 1) {
    const floor = want === 1 ? ONE_LINE_MIN_PX : (want === 2 ? TWO_LINE_MIN_PX : NAME_MIN_PX);
    for (let px = NAME_MAX_PX; px >= floor; px -= 4) {
      const lines = wrapName(measure, text, px, maxWidth);
      if (lines.length <= want && fits(lines, px)) {
        return { px, lines };
      }
    }
  }
  /* Nothing fitted at three lines and the smallest size: keep what fits and end on an ellipsis. */
  const px = NAME_MIN_PX;
  const lines = wrapName(measure, text, px, maxWidth).slice(0, NAME_MAX_LINES);
  let last = lines[lines.length - 1];
  while (last.length > 1 && measure(`${last}\u2026`, px) > maxWidth) {
    last = last.slice(0, -1);
  }
  lines[lines.length - 1] = `${last.trimEnd()}\u2026`;
  return { px, lines };
}

/*
 * The track's name, painted into a canvas and laid on the floor.
 *
 * There is no 3D text anywhere in this repository: no FontLoader, no
 * TextGeometry, no font file. This does not add one. A canvas texture on a
 * plane lying in the floor plane reads in perspective exactly like extruded
 * type does at this size, and it costs a texture rather than a dependency
 * and a typeface licence.
 *
 * DRAWN IN 1024 BY 256 UNITS WHATEVER THE TEXTURE'S SIZE. `width` is the
 * canvas's real width, which detailOf raises for a bigger picture, and the
 * context is scaled to match, so the layout below (the fit, the centring) is
 * the same arithmetic at every size and only the pixels under it multiply.
 */
function nameTexture(THREE, name, width = NAME_TEXTURE_W, outline = false) {
  const w = NAME_TEXTURE_W;
  const h = w / 4;
  const k = width / w;
  const canvas = document.createElement('canvas');
  canvas.width = w * k;
  canvas.height = h * k;
  const ctx = canvas.getContext('2d');
  ctx.scale(k, k);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = `#${COL_TEXT.toString(16).padStart(6, '0')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = String(name || 'Untitled track');
  const font = (px) => `600 ${px}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const fit = fitName((t, px) => {
    ctx.font = font(px);
    return ctx.measureText(t).width;
  }, text, w * NAME_FILL, h * NAME_FILL);
  ctx.font = font(fit.px);
  /* On grass the cream needs an edge of its own, or the lettering is pale on mid green. */
  ctx.lineJoin = 'round';
  ctx.lineWidth = fit.px * 0.14;
  ctx.strokeStyle = 'rgba(10, 20, 12, 0.85)';
  fit.lines.forEach((line, i) => {
    const y = h / 2 + (i - (fit.lines.length - 1) / 2) * fit.px * NAME_LEADING;
    if (outline) {
      ctx.strokeText(line, w / 2, y);
    }
    ctx.fillText(line, w / 2, y);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  /*
   * ANISOTROPIC, which the name was not at first, and it was softer than it
   * needed to be for that even at 512. The plate lies in the floor and the
   * camera looks down at it 40 degrees, so a texel is about a third narrower
   * on the screen up and down than it is across. Plain trilinear filtering
   * picks the blur level from the longer side of that footprint and applies it
   * both ways, so the letters lose width they did not need to lose. Sixteen
   * is a request: three clamps it to what the card supports, and a card with
   * no support draws it as before.
   *
   * This is the one thing in this file that changes a 512 picture. With it
   * switched off a 512 export of the 2025 WA States course is the same file,
   * byte for byte, as it was before the bigger sizes existed. With it on, the
   * name is sharper and the 256 colours are shared out a little differently,
   * so edges elsewhere can move by a shade.
   */
  tex.anisotropy = 16;
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

/*
 * The shape of an element's opening. Read through the namespace, for the reason given at the import:
 * a copy of elements.js from before hoops existed has no such function, and every opening in it is a
 * square.
 */
function shapeOfEl(el) {
  return typeof elementLib.apertureShapeOf === 'function' ? elementLib.apertureShapeOf(el) : 'square';
}

/*
 * THE RACE FIELD, for an export that is asked to be set on one: the ground a
 * five inch track is flown on, seen the way the game paints it, in place of
 * the black stage and its pool of light.
 *
 * WHAT IS THE GAME'S AND NOT NEW HERE. The turf's two greens (GROUND_TURF), the
 * stripes (a mower's pairs, five metres across, down the long axis), the white
 * line on the boundary the author drew with eight metres of run off outside it,
 * and the way a sponsor is painted on it (paintGroundLogo), all as
 * src/render/scene.js lays them in the world, so the export is a picture of
 * the field a pilot flies and not a second design of it.
 *
 * THE SPONSORS ARE THE DOCUMENT'S GROUND LOGOS, one plane each. The decal
 * elements the author placed (KIND.DECAL, 'groundLogo'), each wearing the
 * logo it names, at its place and heading and in its footprint. One plane
 * per decal and not one canvas stamped over the whole field, because a ten
 * metre logo on a field a hundred and thirty across is a few dozen pixels of
 * a canvas that has to cover all of it, and at 2048 it would be the one thing
 * in the picture that was soft. Each has a canvas of its own, sized to the
 * picture like the name. A decal with no logo, or whose picture would not
 * decode, is left out, never outlined: an empty box on the grass is worse
 * than turf, which is the game's own rule.
 *
 * Authored in DOCUMENT coordinates: the field is 0 to width by 0 to depth,
 * which is how the document holds every position, and the group goes into
 * the same root as the track. A canvas has its y down and the document's y is
 * up the field, so a canvas row is counted from the top edge, and a decal's
 * heading, which is counter clockwise on the field, is the canvas's clockwise.
 */
function fieldGroup(THREE, doc, logos, sizes, keep) {
  const group = new THREE.Group();
  const W = Math.max(1, doc.field.width);
  const D = Math.max(1, doc.field.depth);
  const spanW = W + 2 * FIELD_MARGIN;
  const spanD = D + 2 * FIELD_MARGIN;

  /* The turf, as pixels per metre chosen so the long side is as wide as this
   * picture can use: 1024 at the standard size, 4096 at the largest. */
  const longPx = Math.min(4096, sizes.poolSize * 2);
  const ppm = longPx / Math.max(spanW, spanD);
  const cw = Math.max(2, Math.round(spanW * ppm));
  const ch = Math.max(2, Math.round(spanD * ppm));
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const ctx = cv.getContext('2d');
  const stripe = FIELD_STRIPE * ppm;
  const alongX = W >= D;
  const span = alongX ? ch : cw;
  for (let i = 0; i * stripe < span; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? GROUND_TURF.light : GROUND_TURF.dark;
    if (alongX) {
      ctx.fillRect(0, i * stripe, cw, stripe);
    } else {
      ctx.fillRect(i * stripe, 0, stripe, ch);
    }
  }
  ctx.strokeStyle = COL_FIELD_LINE;
  ctx.lineWidth = Math.max(2, 0.3 * ppm);
  const inset = FIELD_MARGIN * ppm;
  ctx.strokeRect(inset, inset, cw - 2 * inset, ch - 2 * inset);
  const turf = keep(new THREE.CanvasTexture(cv));
  turf.colorSpace = THREE.SRGBColorSpace;
  turf.anisotropy = 16;
  const floorGeo = keep(new THREE.PlaneGeometry(spanW, spanD));
  const floorMat = keep(new THREE.MeshStandardMaterial({ map: turf, roughness: 1, metalness: 0 }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(W / 2, D / 2, 0);
  floor.receiveShadow = true;
  group.add(floor);

  /* The sponsors. */
  const decalPx = Math.min(2048, 512 * (sizes.nameWidth / NAME_TEXTURE_W));
  for (const el of doc.elements) {
    if (ELEMENTS[el.type]?.kind !== KIND.DECAL) {
      continue;
    }
    const mark = logoForDecal(doc, el);
    const image = mark && logos ? logos.get(mark.id) : null;
    if (!image) {
      continue;
    }
    const w = Math.max(0.1, el.dims.width);
    const d = Math.max(0.1, el.dims.depth);
    const long = Math.max(w, d);
    const dw = Math.max(8, Math.round((w / long) * decalPx));
    const dh = Math.max(8, Math.round((d / long) * decalPx));
    const dc = document.createElement('canvas');
    dc.width = dw;
    dc.height = dh;
    paintGroundLogo(dc.getContext('2d'), dw, dh, { logo: image });
    const tex = keep(new THREE.CanvasTexture(dc));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    const geo = keep(new THREE.PlaneGeometry(w, d));
    /* Paint is over the grass and never fights it for depth: a field a
     * hundred metres away is shot from far enough that a couple of
     * centimetres is under the depth buffer's resolution. */
    const mat = keep(new THREE.MeshStandardMaterial({
      map: tex, roughness: 1, metalness: 0, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(el.position.x, el.position.y, 0.03);
    mesh.rotation.z = el.yaw || 0;
    mesh.renderOrder = 1;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/*
 * THE FLAG'S TWO PARTS, lofted the way the builder's 3D view lofts them
 * (sailPlaneGeometry and mastPlaneGeometry in view3d.js), which cannot be
 * imported: it is the editor's whole preview and needs a page. What IS shared
 * is everything that decides what a flag looks like, the mast's bend and
 * taper (flagMast), the sail's outline (flagSailProfile) and its print
 * (paintFlagSailPair), all in src/art/banners.js. What is copied is the loop
 * that turns those numbers into triangles, which is the part that cannot drift
 * into a different flag.
 *
 * Both are authored in XY, x out from the mast and y up, and are stood up and
 * turned to a heading by the caller, as the preview does it.
 */
function sailGeometry(THREE, poleR, h) {
  const { rows: profile } = flagSailProfile(h);
  const rows = profile.length;
  const cols = 5;
  const pos = [];
  const uvMinusZ = [];
  const uvPlusZ = [];
  const idx = [];
  for (let r = 0; r < rows; r += 1) {
    const row = profile[r];
    for (let c = 0; c < cols; c += 1) {
      const u = c / (cols - 1);
      pos.push(poleR + row.lx + (row.tx - row.lx) * u, row.ly + (row.ty - row.ly) * u, 0);
      /* Two sheets so the print reads the right way round from both sides. */
      uvMinusZ.push(1 - u * 0.5, row.t);
      uvPlusZ.push(u * 0.5, row.t);
    }
  }
  const n = rows * cols;
  const back = [];
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const a = r * cols + c;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      back.push(n + a + 1, n + a + cols, n + a, n + a + cols + 1, n + a + cols, n + a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.concat(pos), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvMinusZ.concat(uvPlusZ), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal');
  for (let i = 0; i < n; i += 1) {
    nrm.setXYZ(n + i, nrm.getX(i), nrm.getY(i), nrm.getZ(i));
  }
  geo.setIndex(idx.concat(back));
  return geo;
}

function mastGeometry(THREE, poleR, h) {
  const { points } = flagMast(h);
  const radial = 6;
  const pos = [];
  const idx = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const r = poleR * p.r;
    for (let a = 0; a < radial; a += 1) {
      const th = (a / radial) * Math.PI * 2;
      pos.push(p.x + -ty * Math.cos(th) * r, p.y + tx * Math.cos(th) * r, Math.sin(th) * r);
    }
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    for (let a = 0; a < radial; a += 1) {
      const a0 = i * radial + a;
      const a1 = i * radial + ((a + 1) % radial);
      idx.push(a0, a0 + radial, a1, a1, a0 + radial, a1 + radial);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/*
 * THE DRESS: the printed boards and sails a race field's gates and flags wear,
 * with the course's sponsors on them. The game dresses them and the builder's
 * 3D view dresses them (view3d.js, bannerKit), by one rule that lives on the
 * document (dressOrder in model.js: the flying order, one slot a structure,
 * dealt round the logos), and this reads the same rule, so gate 7 wears the
 * mark here that it wears there.
 *
 * ONE KIT PER LOGO: a header board, a sleeve and its mirror for the far leg
 * (a second print and not a negative scale, which would turn the plane inside
 * out), and a sail in navy and in red. A course with no logos still has the
 * one kit, painted without a mark, which is what the game does: a bare gate
 * on that field wears its plain banner, not a different one.
 *
 * Painted with the same painters the game and the preview use, so a header
 * and a sleeve are the sponsor's mark where they have always put it.
 * `logos` is the Map from a logo's id to its decoded image (loadLogos in
 * animate.js); a logo that did not decode is a kit with no mark.
 */
function dressKit(THREE, doc, logos, keep) {
  const list = (doc.branding && doc.branding.logos) || [];
  const n = Math.max(1, list.length);
  const imageOf = (i) => (list[i] && logos ? logos.get(list[i].id) : null) || null;
  const paint = (i, size, painter, opts) => {
    const canvas = bannerCanvas(size[0], size[1]);
    painter(canvas.getContext('2d'), size[0], size[1], { ...opts, logo: imageOf(i) });
    const tex = keep(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    return keep(new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.9, metalness: 0, side: THREE.FrontSide,
    }));
  };
  const sails = new Map();
  const sailOf = (i, accent) => {
    const key = `${i}:${accent}`;
    if (!sails.has(key)) {
      sails.set(key, paint(i, BANNER_SIZE.sailSheet, paintFlagSailPair, { accent }));
    }
    return sails.get(key);
  };
  const dress = [];
  for (let i = 0; i < n; i += 1) {
    dress.push({
      header: paint(i, BANNER_SIZE.header, paintGateHeader, {}),
      sleeve: paint(i, BANNER_SIZE.sleeve, paintGateSleeve, {}),
      sleeveFlipped: paint(i, BANNER_SIZE.sleeve, paintGateSleeve, { flip: true }),
      sails: [sailOf(i, 'navy'), sailOf(i, 'red')],
    });
  }
  /* The run of turn flags alternates navy and red down the lap, round the logos. */
  const runLength = n % 2 === 0 ? n : n * 2;
  const run = [];
  for (let i = 0; i < runLength; i += 1) {
    run.push(sailOf(i % n, i % 2 === 1 ? 'red' : 'navy'));
  }
  return {
    forGate: (slot) => dress[((Math.round(slot) % n) + n) % n],
    forFlag: (k) => run[k % run.length],
  };
}

export function buildStage(THREE, doc, path, {
  size = 512, width = size, height = size, camera: fixed = null,
  /*
   * WHETHER TO LAY THE TRACK'S NAME IN THE FLOOR, and it is on by default
   * because the picture usually travels alone. A GIF pasted into a chat is
   * the whole message and has to say what it is of.
   *
   * A card in the board's grid is the case that is not alone: the board
   * prints the name as a heading directly under the tile, in real type at
   * twice the size, and the tile's own bottom right corner already carries
   * the field size chip. Two names and a chip in one corner is how a long
   * one came out reading "RaceGOW5 Tra". So the card asks for no plate and
   * gets the track instead of the caption. See CARD_GIF in animate.js.
   */
  nameplate = true,
  /*
   * THE SIZES OF THE IMAGES THE SCENE IS PAINTED FROM, as detailOf works them
   * out. The caller that owns the renderer passes its own, with the card's
   * texture limit in it; a caller with no renderer to ask gets the default,
   * which is right for any card that can hold a 4096 texture.
   */
  detail = null,
  /*
   * SET ON A RACE FIELD, with the sponsors on the grass, instead of on the
   * black stage. `logos` is a Map from a logo's id to a decoded image, which
   * the caller loads because this is synchronous: see fieldGroup and
   * loadLogos in animate.js. A track with no logos gets the field and no
   * sponsors, which is what its field is.
   */
  field = false,
  logos = null,
} = {}) {
  const sizes = detail || detailOf(width, height);
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
   * square export the two are the same number, which is what this was.
   * Measured against REFERENCE_EDGE when the picture is bigger than that, so
   * a minimum of so many pixels is so many pixels of a 512 picture and not of
   * whatever size this one is drawn at: see REFERENCE_EDGE. */
  const shortEdge = Math.max(64, Math.min(width, height));
  const worldPerPx = (2.2 * spanR) / Math.min(shortEdge, REFERENCE_EDGE);
  const minDrawR = (MIN_PIPE_PX * worldPerPx) / 2;
  const tubeR = Math.max(tubeOD / 2, minDrawR);
  const jointR = tubeR * JOINT_SCALE;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(field ? COL_SURROUND : COL_FLOOR);

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

  /*
   * The dress of a race field's gates and flags, when it is set on one. It goes
   * in its own group beside the track and not in `statics`, because the camera
   * is fitted to the pipe and a board standing off the pipe must not move the
   * frame.
   */
  const dress = field && !micro ? dressKit(THREE, doc, logos, keep) : null;
  const dressGroup = new THREE.Group();
  track.add(dressGroup);
  const slots = dress ? dressOrder(doc) : null;
  const flagNumber = new Map();
  if (dress) {
    let k = 0;
    for (const el of doc.elements) {
      if (el.type === 'flag') {
        flagNumber.set(el.id, k);
        k += 1;
      }
    }
  }
  /* A mast and its sail, stood up at a point and turned to a heading: the mast joins the pipe, the sail is its own mesh. */
  const flagAt = (x, y, z, turn, radius, h, sailMat) => {
    const place = (mesh) => {
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.y = turn;
      mesh.position.set(x, y, z);
      mesh.updateMatrix();
      return mesh;
    };
    const mast = mastGeometry(THREE, radius, h);
    mast.applyMatrix4(place(new THREE.Object3D()).matrix);
    pipes.push(mast);
    const sail = new THREE.Mesh(keep(sailGeometry(THREE, radius, h)), sailMat);
    place(sail);
    sail.castShadow = true;
    dressGroup.add(sail);
  };

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
    /*
     * A LETTER: its tubes and its joints, in the plane of the piece, from the layout the room and the world are drawn
     * from (letterLayoutOf in model.js). Its pipe is its own and thicker than a gate's, and it stands on the ground
     * on its own feet, so there are no posts and no foot stubs to add.
     */
    if (isLetter(el)) {
      const laid = modelLib.letterLayoutOf(el);
      const f = apertureFrame(el.yaw, el.pitch);
      const at = ([x, y]) => ({
        x: el.position.x + f.widthAxis.x * x,
        y: el.position.y + f.widthAxis.y * x,
        z: base + y,
      });
      const r = (elementLib.LETTER_TUBE_OD ?? 0.06) / 2;
      for (const [a, b] of laid.tubes) {
        pipes.push(pipeGeometry(THREE, at(a), at(b), r));
      }
      for (const p of laid.joints) {
        pipes.push(ballGeometry(THREE, at(p), r * 1.4));
      }
      return;
    }
    /*
     * A HOOP OR A HEX GATE: a run of tubes round the shape, a joint at each corner, and a post and
     * a foot under each of the lowest corners. A tube wholly under the floor is not drawn, as the
     * world does not build it. The same maths as the room and the game, so the pipe stands where
     * they say the frame is.
     */
    const shape = shapeOfEl(el);
    if (shape !== 'square') {
      const ap = levels[0];
      const centre = apertureCenter(el, 0);
      const f = apertureFrame(el.yaw, el.pitch);
      const run = frameOutline(shape, ap.clearW / 2, ap.clearH / 2, tubeOD / 2).map(([x, y]) => ({
        x: centre.x + f.widthAxis.x * x + f.heightAxis.x * y,
        y: centre.y + f.widthAxis.y * x + f.heightAxis.y * y,
        z: centre.z + f.widthAxis.z * x + f.heightAxis.z * y,
      }));
      for (let i = 0; i < run.length; i += 1) {
        const a = run[i];
        const b = run[(i + 1) % run.length];
        if (Math.max(a.z, b.z) - base > 1e-6) {
          pipes.push(pipeGeometry(THREE, a, b, tubeR));
        }
        if (a.z - base > -tubeOD) {
          pipes.push(ballGeometry(THREE, a, jointR));
        }
      }
      const lowest = Math.min(...run.map((p) => p.z));
      for (const p of run) {
        if (Math.abs(p.z - lowest) > 1e-6) {
          continue;
        }
        if (p.z - base > GROUND_EPS) {
          pipes.push(pipeGeometry(THREE, { x: p.x, y: p.y, z: base }, p, tubeR));
        }
        addFoot({ x: p.x, y: p.y, z: base });
      }
      return;
    }
    /*
     * The four sides, as the builder's preview and the race field read them
     * (FRAME_SIDES in elements.js). The corners below run c0 low left, c1 low
     * right, c2 high right, c3 high left, so edge i from ci to c(i+1) is the
     * bottom, the right, the top and the left in turn. Only the lowest
     * opening's bottom and the highest's top are sides; the bars between two
     * openings hold both up. A corner joint, a stack join and a leg belong
     * to the upright on their side, so they go with it.
     */
    const sides = frameSidesOf(el);
    const last = levels.length - 1;
    let lowerTop = null;
    for (const ap of levels) {
      /* An upright is one stretch per opening on a stack, and a stretch goes on its own (unbuiltPolesOf in
       * elements.js), so the corner joints, the edges and the legs of THIS opening follow its own stretch. */
      const leftHere = poleBuilt(el, 'left', ap.index);
      const rightHere = poleBuilt(el, 'right', ap.index);
      const cornerSide = (i) => ((i === 0 || i === 3) ? leftHere : rightHere);
      const centre = apertureCenter(el, ap.index);
      /* The bar centrelines, which are the clear opening grown by half a
       * tube on each side. Exactly the rectangle view3d.js lays its boxes
       * on, so the two pictures agree about where the pipe is. */
      const c = apertureCorners(
        centre, el.yaw, el.pitch, ap.clearW + tubeOD, ap.clearH + tubeOD,
      );
      const edgeBuilt = [
        ap.index === 0 ? sides.bottom : true,
        rightHere,
        ap.index === last ? sides.top : true,
        leftHere,
      ];
      for (let i = 0; i < 4; i += 1) {
        if (edgeBuilt[i]) {
          pipes.push(pipeGeometry(THREE, c[i], c[(i + 1) % 4], tubeR));
        }
        if (cornerSide(i)) {
          pipes.push(ballGeometry(THREE, c[i], jointR));
        }
      }
      /* Corners nought and one are the lower edge of the opening, two and
       * three the upper. A stack shares its verticals, so each level is
       * joined to the one below rather than given legs of its own. */
      /* Two openings of different widths meet along the shared bar, which the wider one's own bar already is: there
       * is no upright between them to join. */
      if (lowerTop && Math.abs(ap.clearW - levels[ap.index - 1].clearW) > 1e-9) {
        /* nothing to join */
      } else if (lowerTop) {
        /* The join between two openings belongs to both stretches either side of it, and stands only when both do. */
        if (leftHere && poleBuilt(el, 'left', ap.index - 1)) {
          pipes.push(pipeGeometry(THREE, lowerTop[0], c[0], tubeR));
        }
        if (rightHere && poleBuilt(el, 'right', ap.index - 1)) {
          pipes.push(pipeGeometry(THREE, lowerTop[1], c[1], tubeR));
        }
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
        for (const [i, p] of c.entries()) {
          if (p.z > minZ + tubeOD || !cornerSide(i)) {
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
    dressGate(el, sides);
  };

  /*
   * A GATE'S PRINTED DRESS, the way the builder's 3D view hangs it (the block
   * after "NO PRINTED DRESS ON A RACEGOW GATE" in view3d.js): a header board over
   * the top rail and a sleeve down each upright, each as two planes back to back
   * so the print reads the right way round from either side, and flags on the
   * header's ends for a flagged gate. A tilted gate is carried on a mast and a
   * letter has no uprights, so neither is dressed. Every measure that goes
   * round the pipe is taken from the pipe as it is DRAWN (pipeOut), because on
   * a big field the pipe is drawn thicker than it is and a board that clears the
   * real pipe would sit inside the drawn one.
   */
  const dressGate = (el, sides) => {
    if (!dress || isLetter(el) || Math.abs(el.pitch) >= Math.PI / 6) {
      return;
    }
    const levels = aperturesOf(el);
    if (!levels.length) {
      return;
    }
    const top = levels[levels.length - 1];
    const bottom = levels[0];
    const f = apertureFrame(el.yaw, el.pitch);
    const kit = dress.forGate(slots.get(el.id) ?? 0);
    const pipeOut = Math.max(tubeOD / 2, tubeR);
    const edge = top.clearW / 2 + tubeOD / 2 + pipeOut;
    const lift = (tubeOD / 2 + pipeOut) * 2;
    const sleeveW = isPlain(el) ? 0 : 0.42;
    const sleeveBottom = bottom.sillH;
    const sleeveH = top.sillH + top.clearH + lift - sleeveBottom;
    const basis = new THREE.Matrix4().makeBasis(v3(THREE, f.widthAxis), v3(THREE, f.heightAxis), v3(THREE, f.normal));
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
    const across = v3(THREE, f.widthAxis);
    const facing = v3(THREE, f.normal);
    const base = el.position;
    const board = (w, h, mat, off, z) => {
      for (const sn of [-1, 1]) {
        const face = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), mat);
        face.quaternion.copy(quat);
        if (sn < 0) {
          face.rotateY(Math.PI);
        }
        face.position.set(
          base.x + across.x * off + facing.x * sn * (0.012 + (pipeOut - tubeOD / 2)),
          base.y + across.y * off + facing.y * sn * (0.012 + (pipeOut - tubeOD / 2)),
          base.z + z + across.z * off + facing.z * sn * (0.012 + (pipeOut - tubeOD / 2)),
        );
        face.castShadow = true;
        dressGroup.add(face);
      }
    };
    /* A sleeve is one board down an upright, so it hangs only on a stack whose openings are all one width. */
    if (sleeveW > 0 && levels.every((ap) => Math.abs(ap.clearW - top.clearW) < 1e-9)) {
      for (const sx of [-1, 1]) {
        if (uprightIntact(el, sx < 0 ? 'left' : 'right') && sides[sx < 0 ? 'left' : 'right']) {
          board(sleeveW, sleeveH, sx < 0 ? kit.sleeveFlipped : kit.sleeve, sx * (edge + sleeveW / 2), sleeveBottom + sleeveH / 2);
        }
      }
    }
    const headerW = 2 * (edge + sleeveW);
    if (sides.top) {
      board(headerW, GATE_BANNER_H, kit.header, 0, top.sillH + top.clearH + lift + GATE_BANNER_H / 2 + 0.03);
    }
    /* The pennants on a flagged gate's header, standing on the board's top edge and leaning outboard. */
    const signs = flagSideSigns(flagSideOf(el));
    const headerTop = top.sillH + top.clearH + lift + GATE_BANNER_H + 0.03;
    const h = gateFlagHeight(el.dims);
    const radius = Math.max(GATE_FLAG_POLE_R, tubeR * 0.75);
    let i = 0;
    for (const sx of signs) {
      const lean = flagLeanSign(sx);
      const turn = -Math.atan2(f.widthAxis.y * lean, f.widthAxis.x * lean);
      flagAt(
        base.x + f.widthAxis.x * sx * (headerW / 2), base.y + f.widthAxis.y * sx * (headerW / 2),
        base.z + headerTop, turn, radius, h, kit.sails[i % kit.sails.length],
      );
      i += 1;
    }
  };

  const buildMarker = (el) => {
    const h = el.dims.height ?? 1.5;
    const r = Math.max(el.dims.poleRadius ?? el.dims.baseRadius ?? tubeR, minDrawR);
    const p = el.position;
    /* A turn flag on a race field is the bent mast and its printed sail, in place of the plain post. */
    if (dress && el.type === 'flag') {
      flagAt(p.x, p.y, p.z, -el.yaw, r, h, dress.forFlag(flagNumber.get(el.id) ?? 0));
      addFoot({ x: p.x, y: p.y, z: p.z });
      return;
    }
    pipes.push(pipeGeometry(
      THREE, { x: p.x, y: p.y, z: p.z }, { x: p.x, y: p.y, z: p.z + h }, r,
    ));
    pipes.push(ballGeometry(THREE, { x: p.x, y: p.y, z: p.z + h }, r * JOINT_SCALE));
    addFoot({ x: p.x, y: p.y, z: p.z });
  };

  const buildObstacle = (el) => {
    /* Furniture is the boxes it is made of, where they stand at the quarter
     * turn it is built at: the same boxes the room draws and the game holds. */
    if (isRoomType(el.type)) {
      for (const b of roomWorldBoxes(el.type, el.dims, el.position, el.yaw)) {
        const geo = new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
        geo.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
        pipes.push(geo);
      }
      return;
    }
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

  const floorZ = box.min.y - 0.001;
  if (field) {
    /* The race field, in document coordinates, under the track. */
    const turf = fieldGroup(THREE, doc, logos, sizes, keep);
    turf.position.z = floorZ;
    root.add(turf);
  } else {
    /* The floor. Large enough that its edge is never in shot, and black past
     * the pool so the track stands on nothing. The pool is sized against the
     * track, so the two are independent. */
    const floorSpan = Math.max(doc.field.width, doc.field.depth, radius * 6) * 2;
    const poolFrac = clamp((radius * POOL_RADII) / (floorSpan / 2), 0.04, 0.95);
    const floorTex = keep(poolTexture(THREE, poolFrac, sizes.poolSize));
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
  }

  /*
   * THE NAME, laid in the floor plane in front of the track, turned so it
   * reads from wherever the camera ended up. Its own up direction points at
   * the camera, which for a plane authored in the document's XY is a turn of
   * the azimuth less a quarter.
   *
   * Its four corners are kept so the camera frames them with the track.
   * Empty when there is no plate, and the frame then belongs to the track
   * alone, which is what a 384 by 240 card wants.
   */
  const nameCorners = [];
  if (nameplate) {
    const nameTex = keep(nameTexture(THREE, doc.name, sizes.nameWidth, field));
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
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [-0.5, 0.5]) {
        const lx = sx * nameW;
        const ly = sy * nameH;
        const cz = Math.cos(nameMesh.rotation.z);
        const sz = Math.sin(nameMesh.rotation.z);
        const dx = nameMesh.position.x + lx * cz - ly * sz;
        const dy = nameMesh.position.y + lx * sz + ly * cz;
        nameCorners.push([dx, nameMesh.position.z, dy]);
      }
    }
  }

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
  for (const [dx, dz, dy] of nameCorners) {
    fitPts.push(new THREE.Vector3(dx, dz, -dy));
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
  /*
   * THE CAMERA FROM ONE DIRECTION, framed to hold the whole track. Written as
   * a function so a still can be shot from further round the track than the
   * animation's own viewpoint (look, in the return below); the first call is
   * the viewpoint the animation has always had.
   */
  const placeCamera = (az, elev) => {
    const eye = new THREE.Vector3(
      Math.cos(az) * Math.cos(elev),
      Math.sin(elev),
      -Math.sin(az) * Math.cos(elev),
    );
    const dist = Math.max(fitR * 0.5, FIT_MARGIN * fitDistance(
      THREE, fitPts, aim, eye, FOV_DEG, aspect,
    ));
    camera.position.copy(aim).addScaledVector(eye, dist);
    camera.lookAt(aim);
  };
  placeCamera(azimuth, ELEVATION);
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
  const keyEl = (60 * Math.PI) / 180;
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  const keyDist = Math.max(6, fitR * 3);
  const throwKey = (az) => {
    const keyAz = az + (40 * Math.PI) / 180;
    key.position.set(
      aim.x + Math.cos(keyAz) * Math.cos(keyEl) * keyDist,
      aim.y + Math.sin(keyEl) * keyDist,
      aim.z - Math.sin(keyAz) * Math.cos(keyEl) * keyDist,
    );
  };
  throwKey(azimuth);
  key.target.position.copy(aim);
  key.castShadow = true;
  key.shadow.mapSize.set(sizes.shadowMap, sizes.shadowMap);
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
  /* The stage is lit to leave its shadows nearly black on a black floor. Grass
   * lit that way is a dark green with black shadows, so a field gets a sky and
   * a ground to bounce off, which is what the game's hemisphere is. */
  scene.add(field
    ? new THREE.HemisphereLight(0xdfeadf, 0x2c4a2a, 0.85)
    : new THREE.HemisphereLight(0xaeb6c0, 0x08080c, 0.24));

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
  /*
   * A HOOP'S AND A HEX GATE'S PANE is the shape of its opening: a fan of triangles from the middle
   * (src/props/aperture.js), rewritten the same way the quad is. Only a track that has one of them
   * makes it, so a track of squares is exactly the objects it was.
   */
  let shapedPane = null;
  if (doc.elements.some((e) => shapeOfEl(e) !== 'square')) {
    const shapedGeo = keep(new THREE.BufferGeometry());
    shapedGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 40), 3));
    shapedPane = new THREE.Mesh(shapedGeo, paneMat);
    shapedPane.renderOrder = 3;
    shapedPane.visible = false;
    shapedPane.frustumCulled = false;
    track.add(shapedPane);
  }

  const ribbonR = Math.max(
    clamp(RIBBON_R_PER_METRE * radius, RIBBON_R_MIN, RIBBON_R_MAX),
    (MIN_RIBBON_PX * worldPerPx) / 2,
  );
  const coreMat = keep(new THREE.MeshBasicMaterial({
    color: COL_RIBBON_CORE, vertexColors: true, transparent: field, depthWrite: !field,
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

  const setTube = (mesh, pts, radius, fadeOut = false, { uniform = false, maxSegs = 220 } = {}) => {
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
    const segs = Math.max(8, Math.min(maxSegs, pts.length * 2));
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
    /*
     * On the black stage the taper is black, and black on black is nothing.
     * On grass it is a black streak at the tail of the line, so a field
     * fades the tail OUT instead: full colour with a falling alpha, which
     * needs a four component colour and a material that is transparent.
     */
    const parts = fadeOut ? 4 : 3;
    const colors = new Float32Array(count * parts);
    for (let i = 0; i < count; i += 1) {
      const ring = Math.min(rings - 1, Math.floor(i / perRing));
      const t = rings > 1 ? ring / (rings - 1) : 1;
      const f = uniform ? 1 : t * t;
      colors[i * parts] = fadeOut ? 1 : f;
      colors[i * parts + 1] = fadeOut ? 1 : f;
      colors[i * parts + 2] = fadeOut ? 1 : f;
      if (fadeOut) {
        colors[i * parts + 3] = f;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, parts));
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
    if (shapedPane) {
      shapedPane.visible = false;
    }
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
    const el = shapedPane ? elementById(doc, knot.seq.elementId) : null;
    const shape = el ? shapeOfEl(el) : 'square';
    if (el && shape !== 'square' && knot.role === 'aperture') {
      const levels = aperturesOf(el);
      const idx = Math.min(Math.max(0, knot.seq.apertureIndex ?? 0), levels.length - 1);
      const ap = levels[idx];
      const centre = apertureCenter(el, idx);
      const f = apertureFrame(el.yaw, el.pitch);
      /* A letter's hole is a polygon about its own point, which is the centre above. */
      const fan = ap.shape === 'poly' && typeof apertureLib.paneOfPolygon === 'function'
        ? apertureLib.paneOfPolygon(ap.poly, 1, 1)
        : paneFan(shape, ap.clearW, ap.clearH);
      const pos = shapedPane.geometry.getAttribute('position');
      for (let i = 0; i < fan.position.length / 3; i += 1) {
        const x = fan.position[3 * i];
        const y = fan.position[3 * i + 1];
        pos.setXYZ(
          i,
          centre.x + f.widthAxis.x * x + f.heightAxis.x * y + nx,
          centre.y + f.widthAxis.y * x + f.heightAxis.y * y + ny,
          centre.z + f.widthAxis.z * x + f.heightAxis.z * y + nz,
        );
      }
      pos.needsUpdate = true;
      shapedPane.geometry.setIndex(fan.index);
      shapedPane.geometry.setDrawRange(0, fan.index.length);
      shapedPane.geometry.computeBoundingSphere();
      shapedPane.visible = true;
      pane.visible = false;
      return;
    }
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
    setTube(core, pts, ribbonR, field);
    setTube(shell, pts, ribbonR * RIBBON_SHELL_SCALE);
    const headIdx = sampleAt(s);
    setPane(paneKnotIndex(path, samples[headIdx].segment));
  };

  setFrame(0, 1);

  /*
   * A STILL OF THE WHOLE LAP, for the export bundle's pictures. `on` draws the
   * entire racing line as one even ribbon, with no pane and no tapering tail,
   * and off hides the ribbon and the pane so what is left is the pipe. The
   * animation never calls it, so a frame of the animation is what it was.
   * More segments than the animation's tail gets, because the tail is a few
   * metres of line and this is the whole lap.
   */
  const setRoute = (on) => {
    if (!on) {
      core.visible = false;
      shell.visible = false;
      pane.visible = false;
      if (shapedPane) { shapedPane.visible = false; }
      return;
    }
    const pts = samples.map((sm) => sm.pos);
    setTube(core, pts, ribbonR, field, { uniform: true, maxSegs: 1600 });
    setTube(shell, pts, ribbonR * RIBBON_SHELL_SCALE, false, { uniform: true, maxSegs: 1600 });
    pane.visible = false;
    if (shapedPane) { shapedPane.visible = false; }
  };

  /* The camera from another side, framed to hold the track. Azimuth and
   * elevation are in the document's frame: azimuth counter clockwise from
   * east, as the animation's own is. */
  const look = (az, elev) => {
    placeCamera(az, elev);
    throwKey(az);
  };

  return {
    scene,
    camera,
    setFrame,
    setRoute,
    look,
    azimuth,
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
