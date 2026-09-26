/*
 * view2d.js: the top down authoring view. Plain Canvas2D, no library.
 *
 * This is where a track is built, so everything that edits lives here:
 * place, select, box select, move, rotate, flip, delete, pan, zoom. The 3D
 * view is a preview and does almost none of it.
 *
 * THE PLAN PROJECTION IS THE WHOLE TRICK. Every aperture is drawn as its
 * four corners flattened onto the ground, which means a vertical gate
 * collapses to a bar and a horizontal dive gate opens out into a rectangle,
 * without a single special case in the drawing code. That is exactly the
 * distinction the task asks the 2D view to make obvious, and it falls out of
 * the geometry instead of being asserted by a flag.
 *
 * Screen mapping: +X to the right, +Y UP THE SCREEN, which is what makes the
 * top down view a right handed frame seen from above and makes a left turn
 * on the field a left turn on the screen. Getting this backwards is how a
 * course ends up mirrored.
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

import {
  ELEMENTS, KIND, FRAME_TUBE_OD, flagLeanSign, flagSideOf, flagSideSigns, trackClassOf, virtualApertureDims,
  docModeOf,
} from './elements.js';
import {
  aperturesOf, elementById, kindOf, apertureCenter, logoForDecal,
} from './model.js';
import { sequenceNumbers } from './sequence.js';
import { figureCue } from './figures.js';
import { travelDirection, markerPassDir } from './faces.js';
import { guideFromKnots, knotsFromPath, tessellateGuide } from '../game/guide.js';
import {
  add, apertureCorners, clamp, dist, leftOf, normalize, pointSegment, scale, sub, wrapAngle, yawVector,
} from './geometry.js';
import { startBlockDims } from '../art/startblock.js';
/* The freestyle assets. Pure layouts, no Three.js: the plan draws the same
 * parts the physics is given, so a slot on the plan is a slot in the air. */
import { partsOf, planBounds } from '../props/catalog.js';
import { placedYaw } from '../props/solids.js';
import { styleOf as propStyleOf, styleDims } from '../props/types.js';
/* Roads and vehicles: a road's eased line, where its nodes are and where a
 * vehicle starts, worked out the way the simulator will drive them, and the
 * road tool's own arithmetic. */
import {
  roadNodesOf, roadOf, centreLine, edgesOf, nearestOn, pointAt, DRIVE_RADIUS_MIN,
} from '../maps/built/road.js';
import {
  absNodes, addDraftNode, closesDraft, footprint, legMidpoints, pickLeg, pickNode, snapToRoad,
  vehiclePlace,
} from './roadtool.js';
import { vehicleStart } from '../maps/built/traffic.js';

const RULER = 26;              /* pixels of ruler along the top and the left */
const MIN_SCALE = 2;           /* pixels per metre */
const MAX_SCALE = 220;
const HANDLE_PX = 7;           /* rotation handle radius, pixels */
const HANDLE_GAP_PX = 46;      /* how far the handle sits off the element */
const PICK_PX = 9;             /* how close a click has to be, pixels */

const C = {
  ground: '#0e1720',
  fieldFill: '#13202c',
  gridMinor: 'rgba(157, 179, 200, 0.10)',
  gridMajor: 'rgba(157, 179, 200, 0.22)',
  fieldEdge: 'rgba(247, 232, 205, 0.55)',
  ruler: '#0a121a',
  rulerText: '#9db3c8',
  element: '#cfe0ee',
  elementFill: 'rgba(157, 179, 200, 0.16)',
  selected: '#ffd45c',
  entry: '#7dffb4',
  exit: '#ff7d7d',
  marker: '#f7e8cd',
  barrier: 'rgba(255, 125, 125, 0.5)',
  barrierEdge: '#ff9a9a',
  label: '#9db3c8',
  path: '#ffd45c',
  pathShadow: 'rgba(255, 212, 92, 0.22)',
  number: '#101a26',
  numberBg: '#f7e8cd',
  numberBgSel: '#ffd45c',
  start: '#7dffb4',
  /* Ground paint. Cream, at the strength printed vinyl reads at on the
   * plan, because a decal is dressing rather than something to fly: it must
   * be findable and it must not compete with a gate. */
  decal: 'rgba(247, 232, 205, 0.7)',
  decalFill: 'rgba(247, 232, 205, 0.07)',
  ghost: 'rgba(255, 212, 92, 0.45)',
  band: 'rgba(255, 212, 92, 0.14)',
  bandEdge: 'rgba(255, 212, 92, 0.7)',
  /* A structure's outline, and the ink between its parts. The parts
   * themselves are toned by height, see structureTone. */
  structEdge: 'rgba(207, 224, 238, 0.38)',
  structInk: 'rgba(8, 14, 20, 0.7)',
  structName: '#f7e8cd',
  /* A named gap. Amber and dashed, because it is a window in the air and
   * not a thing: the same reason ground paint is dashed. */
  zone: '#ffb347',
  zoneFill: 'rgba(255, 179, 71, 0.10)',
  /* A road: dark tarmac a shade off the plot, cream edges, and a dashed
   * line down the middle of a two lane road, the way a Japanese back road
   * is painted. Under everything else, because it is paint. */
  road: 'rgba(44, 54, 66, 0.95)',
  roadEdge: 'rgba(247, 232, 205, 0.7)',
  roadPaint: 'rgba(247, 232, 205, 0.55)',
  roadArrow: 'rgba(247, 232, 205, 0.5)',
  node: '#101a26',
  /* A node the road leaves out, and one it runs straight past. */
  bad: '#ff6b6b',
  flat: '#ffb347',
  car: 'rgba(207, 224, 238, 0.9)',
  carDrift: 'rgba(255, 154, 77, 0.95)',
  carGlass: 'rgba(16, 26, 38, 0.75)',
  carInk: 'rgba(8, 14, 20, 0.85)',
};

/* How close to a road a vehicle has to be dropped to go on it, pixels past
 * the road's own edge, and how close a click has to be to a node, pixels. */
const SNAP_PX = 36;
const NODE_PX = 11;

/* ---------------- headings ---------------- */

/*
 * THE TWO HEADING RULES, in one place, because the rotate handle, Q and E,
 * the inspector's yaw field and the checks all have to agree.
 *
 * An asset with boxes is 'quarter' in src/props/types.js: it keeps to the
 * four compass headings until the physics learns turned boxes
 * (FREESTYLE-MAPS-PLAN.md, P1), and src/props/solids.js placedYaw snaps it
 * for the solids and the drawing. Snapping it HERE as well means the
 * document holds the heading that is actually built, so the inspector never
 * shows 40 degrees for a building standing at 0. Everything else, gates and
 * markers included, turns freely: 15 degree steps on the handle, and Alt for
 * any angle, which is the same modifier that turns off the grid.
 */
export const QUARTER_TURN = Math.PI / 2;
export const FREE_STEP = Math.PI / 12;

export function turnsOf(type) {
  return ELEMENTS[type]?.turns === 'quarter' ? 'quarter' : 'any';
}

/* How far a heading is from the nearest compass point, in radians. */
export function offCompass(yaw) {
  const q = Math.round(yaw / QUARTER_TURN) * QUARTER_TURN;
  return Math.abs(yaw - q);
}

/*
 * The heading an element of `type` gets when the author asks for `yaw`.
 * `free` is the Alt key on the handle; a quarter asset ignores it, because
 * the physics cannot hold what it would ask for.
 */
export function snapYaw(type, yaw, free = false) {
  if (!Number.isFinite(yaw)) {
    return 0;
  }
  if (turnsOf(type) === 'quarter') {
    return wrapAngle(placedYaw('quarter', yaw));
  }
  if (free) {
    return wrapAngle(yaw);
  }
  return wrapAngle(Math.round(yaw / FREE_STEP) * FREE_STEP);
}

/* ---------------- plan shapes, pure ---------------- */

/*
 * An asset's own plan rectangle in its local frame, cached by what shapes
 * it. The plan asks for every element's shape on every pointer move to pick
 * under the cursor, and a crane's layout is 186 parts, so running layouts
 * there would make a 300 element map stutter under the mouse. Position and
 * heading are left out of the key on purpose: they are applied afterwards,
 * so dragging a crane never re-runs its layout.
 *
 * The element's id IS in the key. A tree, a container or a bando is laid
 * out from seedOf in src/props/parts.js, the id and the variant, so two
 * equal trees are two different trees. Forty trees placed with the same
 * settings differ by up to 2.7 m at an edge of their plan rectangles, and
 * forty container stacks by 0.35 m, so sharing one cached rectangle drew
 * an outline off the element's own parts and let a click on it miss.
 */
const boundsCache = new Map();

function propKey(el) {
  return `${el.type}|${propStyleOf(el) ?? ''}|${JSON.stringify(el.dims)}|${el.pitch || 0}`;
}

export function localBoundsOf(el) {
  const key = `${el.id}|${propKey(el)}`;
  let b = boundsCache.get(key);
  if (!b) {
    if (boundsCache.size > 4000) {
      boundsCache.clear();
    }
    b = planBounds(partsOf(el));
    boundsCache.set(key, b);
  }
  return b;
}

/*
 * A local point of an asset, on the plan. The local frame is src/props/
 * parts.js's: +x the heading, +z the asset's right. The document's left is
 * +90 degrees from the heading, so local +z goes to minus the left:
 *
 *   plan = position + x * (cos, sin) - z * (-sin, cos)
 *
 * This is the drawing, not the physics, so it may use Math.cos: nothing on
 * the plan reaches the integrator. The heading is the PLACED one, so a
 * building the document has at 40 degrees is drawn where it stands, at 0.
 */
function planPoint(px, py, c, s, lx, lz) {
  return { x: px + lx * c + lz * s, y: py + lx * s - lz * c, z: 0 };
}

/* The turned rectangle of a structure's local bounds, as four plan points. */
function structureOutline(el) {
  const b = localBoundsOf(el);
  const yaw = placedYaw(turnsOf(el.type), el.yaw || 0);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const { x, y } = el.position;
  return [
    planPoint(x, y, c, s, b.x0, b.z0),
    planPoint(x, y, c, s, b.x1, b.z0),
    planPoint(x, y, c, s, b.x1, b.z1),
    planPoint(x, y, c, s, b.x0, b.z1),
  ];
}

/*
 * A named gap's footprint: its window seen from above is a bar Width long
 * across its heading. Half a metre deep along the heading, so a pointer can
 * land on it; the window itself has no depth.
 */
const ZONE_PICK_DEPTH = 0.5;

/*
 * A ROAD'S OUTLINE is its line of nodes, out along them and back, so it is
 * a line with no area: a pointer picks it near the line and never inside a
 * loop, where the yard is, and the board's card draws it as a line. The
 * card takes at most 16 points an outline, so a road of more nodes is
 * outlined through ROAD_OUTLINE_STOPS of them, evenly, ends kept.
 */
const ROAD_OUTLINE_STOPS = 9;

function roadOutline(el) {
  const nodes = roadNodesOf(el);
  if (nodes.length < 2) {
    return boxCorners(nodes[0] ?? el.position, 0, 0.5, 0.5);
  }
  const run = el.closed === true ? [...nodes, nodes[0]] : nodes;
  const stops = [];
  const k = Math.min(ROAD_OUTLINE_STOPS, run.length);
  for (let i = 0; i < k; i += 1) {
    const p = run[Math.round((i * (run.length - 1)) / (k - 1))];
    stops.push({ x: p.x, y: p.y, z: 0 });
  }
  return [...stops, ...stops.slice(1, -1).reverse()];
}

/* A VEHICLE'S FOOTPRINT is its car where it starts, on its road: its place
 * is its road and its offset (src/maps/built/traffic.js vehicleStart), so
 * it needs the document. With no road it is its place in the row the plan
 * parks roadless cars in (vehiclePlace in ./roadtool.js). Without the
 * document, a metre square at its unused position. */
function vehicleOutline(el, doc) {
  if (!doc) {
    return boxCorners(el.position, 0, 1, 1);
  }
  return footprint(vehiclePlace(doc, el)).map((p) => ({ x: p.x, y: p.y, z: 0 }));
}

/*
 * The footprint of an element on the ground, as a polygon in world metres.
 * Aperture elements project their LOWEST opening's four corners, which is
 * what turns a vertical gate into a bar and a dive gate into a rectangle.
 * Exported and pure so the checks can run it over every asset in Node.
 * `doc` is needed only for a vehicle, whose place is on its road.
 */
export function planShapeOf(el, doc = null) {
  const def = ELEMENTS[el.type];
  if (def.kind === KIND.ROAD) {
    return roadOutline(el);
  }
  if (def.kind === KIND.VEHICLE) {
    return vehicleOutline(el, doc);
  }
  if (def.kind === KIND.STRUCTURE) {
    return structureOutline(el);
  }
  if (def.kind === KIND.ZONE) {
    return boxCorners(el.position, el.yaw || 0, ZONE_PICK_DEPTH, Math.max(0.2, el.dims.width));
  }
  if (def.kind === KIND.APERTURE) {
    const aps = aperturesOf(el);
    const ap = aps[0];
    const c = apertureCenter(el, 0);
    const corners = apertureCorners(c, el.yaw, el.pitch, ap.clearW, ap.clearH);
    /*
     * Flatten the four corners onto the ground and measure how far they
     * reach along the element's own two horizontal axes: `u` across the
     * opening, `w` through it. A vertical gate reaches clearW along u and
     * NOTHING along w, so it comes out a bar; a horizontal dive gate
     * reaches clearW along u and clearH along w, so it comes out a
     * rectangle; a tilted one comes out foreshortened in between. No
     * special case anywhere, which is the point.
     */
    const u = { x: -Math.sin(el.yaw), y: Math.cos(el.yaw) };
    const w = { x: Math.cos(el.yaw), y: Math.sin(el.yaw) };
    let hu = 0;
    let hw = 0;
    for (const p of corners) {
      const dx = p.x - el.position.x;
      const dy = p.y - el.position.y;
      hu = Math.max(hu, Math.abs(dx * u.x + dy * u.y));
      hw = Math.max(hw, Math.abs(dx * w.x + dy * w.y));
    }
    /* Half a frame tube minimum, so a bar is still something a pointer can
     * land on and something the eye can see. */
    hu = Math.max(hu, FRAME_TUBE_OD / 2);
    hw = Math.max(hw, FRAME_TUBE_OD / 2);
    return boxCorners(el.position, el.yaw, hw * 2, hu * 2);
  }
  if (def.kind === KIND.OBSTACLE) {
    return boxCorners(el.position, el.yaw, el.dims.width, el.dims.depth);
  }
  if (def.kind === KIND.START) {
    /* The row lies ACROSS the heading, because that is the start line: a
     * pad element's yaw is the direction the quad faces, and trackdoc runs
     * it through headingForTravel before the mesh loop steps the stands
     * sideways off it. boxCorners spends its third argument along the yaw
     * and its fourth across, so the span is the fourth. Handing it the
     * third turned the pick box a quarter turn out of the stands it is
     * supposed to be wrapped around. */
    const span = Math.max(el.dims.padSize, (el.dims.pads - 1) * el.dims.spacing + el.dims.padSize);
    return boxCorners(el.position, el.yaw, el.dims.padSize, span);
  }
  if (def.kind === KIND.DECAL) {
    /* The painted footprint itself, so what a pointer grabs is what the
     * grass wears. Width along the heading, depth across, the same
     * reading a barrier's dimensions get. */
    return boxCorners(el.position, el.yaw, Math.max(0.2, el.dims.width), Math.max(0.2, el.dims.depth));
  }
  if (def.kind === KIND.MARKER) {
    const r = Math.max(def.dims.baseRadius ?? 0.2, 0.22);
    return boxCorners(el.position, el.yaw, r * 2, r * 2);
  }
  /* Label. A hit box roughly the size of the drawn text. */
  const wide = Math.max(1, (el.text || '').length) * el.dims.textHeight * 0.55;
  return boxCorners(el.position, 0, wide, el.dims.textHeight * 1.4);
}

/*
 * THE DRAWING ON A PUBLISHED MAP'S CARD, measured here because this is the
 * one place that knows what every piece looks like from above.
 *
 * The board keeps no list of piece types, on purpose: pieces are added to
 * the simulator all the time, and a drawing per type over there would be a
 * list that the newest piece is always missing from. So a map is published
 * with its outlines: for every piece, the ground polygon this view already
 * draws and picks by (planShapeOf), the piece's type, a kind that only
 * picks a colour, and a named gap's name. A piece added next week is drawn
 * on the board by the builder that knows it, and nothing there changes.
 *
 * Labels are left out, because they are words for the author rather than
 * things standing on the plot. A piece whose outline cannot be measured is
 * left out rather than failing the publish: the drawing is a courtesy and
 * the map is the thing being sent. The board checks the shape of this and
 * nothing else, see inspectMapPlan in its src/validate.js, and rounds to
 * the centimetre, so this does too and sends no more than it keeps.
 */
const BOARD_KINDS = {
  [KIND.STRUCTURE]: 'structure',
  [KIND.ZONE]: 'gap',
  [KIND.APERTURE]: 'aperture',
  [KIND.OBSTACLE]: 'obstacle',
  [KIND.MARKER]: 'marker',
  [KIND.START]: 'start',
  [KIND.DECAL]: 'decal',
  /* The board knows no road and no car, and needs to know none: a road is
   * paint, drawn as a line; a car is something solid, drawn where it
   * starts. */
  [KIND.ROAD]: 'decal',
  [KIND.VEHICLE]: 'obstacle',
};

const toCm = (v) => Math.round(v * 100) / 100;

export function boardPlanOf(doc) {
  const marks = [];
  for (const el of doc.elements) {
    const def = ELEMENTS[el.type];
    if (!def || def.kind === KIND.ANNOTATION) {
      continue;
    }
    let outline;
    try {
      outline = planShapeOf(el, doc);
    } catch (e) {
      continue;
    }
    const p = outline.map((q) => [toCm(q.x), toCm(q.y)]);
    if (p.length < 2 || p.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
      continue;
    }
    const mark = { t: el.type, k: BOARD_KINDS[def.kind] || 'other', p };
    if (def.kind === KIND.ZONE) {
      mark.n = String(el.name || 'GAP').trim().slice(0, 40) || 'GAP';
    }
    marks.push(mark);
  }
  return { width: doc.field.width, depth: doc.field.depth, marks };
}

/*
 * HOW TALL READS AS HOW LIGHT. A plan of a town is a map read from above,
 * and the one thing a flat plan hides is height: a two storey shop and a
 * twelve storey office are the same rectangle. So a part's fill is its top
 * height, dark at the ground and pale at forty metres, on a square root so
 * the first few storeys, which is where most of a map is, spread across
 * most of the range. Ten steps, so the parts of one element batch into a
 * handful of paths.
 */
const TONE_STEPS = 10;
const TONE_TOP = 42;

function toneStep(top) {
  const t = Math.sqrt(clamp(top / TONE_TOP, 0, 1));
  return Math.min(TONE_STEPS - 1, Math.floor(t * TONE_STEPS));
}

function structureTone(step, alpha) {
  const t = step / (TONE_STEPS - 1);
  const light = Math.round(24 + t * 58);
  const sat = Math.round(14 + t * 10);
  return `hsla(206, ${sat}%, ${light}%, ${alpha})`;
}

export class View2D {
  constructor(canvas, host) {
    this.canvas = canvas;
    this.host = host;
    this.cam = { x: -4, y: -4, scale: 14 };
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.pointer = null;        /* world position of the cursor, or null */
    this.drag = null;
    this.band = null;
    this.hover = null;
    this.bind();
  }

  /* ---------------- camera ---------------- */

  toScreen(p) {
    return {
      x: (p.x - this.cam.x) * this.cam.scale,
      y: this.h - (p.y - this.cam.y) * this.cam.scale,
    };
  }

  toWorld(px, py) {
    return {
      x: px / this.cam.scale + this.cam.x,
      y: (this.h - py) / this.cam.scale + this.cam.y,
      z: 0,
    };
  }

  /* Fit a world rectangle into the drawing area with a margin. */
  frame(minX, minY, maxX, maxY, marginPx = 60) {
    const availW = Math.max(40, this.w - RULER - marginPx);
    const availH = Math.max(40, this.h - RULER - marginPx);
    const spanX = Math.max(1e-3, maxX - minX);
    const spanY = Math.max(1e-3, maxY - minY);
    this.cam.scale = clamp(Math.min(availW / spanX, availH / spanY), MIN_SCALE, MAX_SCALE);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.cam.x = cx - (this.w / 2) / this.cam.scale;
    this.cam.y = cy - (this.h / 2) / this.cam.scale;
  }

  frameField() {
    const f = this.host.doc.field;
    this.frame(0, 0, f.width, f.depth);
  }

  /* Centre on a set of elements without changing the zoom, which is what
   * "switching views preserves camera focus on the selection" needs. */
  centerOn(point) {
    this.cam.x = point.x - (this.w / 2) / this.cam.scale;
    this.cam.y = point.y - (this.h / 2) / this.cam.scale;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  /* ---------------- plan shapes ---------------- */

  /* The footprint of an element on the ground: see planShapeOf. */
  planShape(el) {
    return planShapeOf(el, this.host.doc);
  }

  /* ---------------- picking ---------------- */

  pickAt(px, py) {
    const world = this.toWorld(px, py);
    const pad = PICK_PX / this.cam.scale;
    const doc = this.host.doc;
    /*
     * ON A MAP THE SMALLEST THING UNDER THE CURSOR WINS. A crane's plan
     * rectangle is fifty metres of jib, and a lamp post or a named gap
     * standing under it would otherwise be unpickable whenever the crane
     * was placed after it. On a race track nothing is that big, and the
     * rule there stays what it always was.
     */
    if (docModeOf(doc) === 'freestyle') {
      let best = null;
      let bestArea = Infinity;
      for (let i = doc.elements.length - 1; i >= 0; i -= 1) {
        const el = doc.elements[i];
        if (isRoadEl(el)) {
          continue;
        }
        const poly = this.planShape(el);
        if (polyContains(poly, world) || polyNear(poly, world, pad)) {
          const area = polyArea(poly);
          if (area < bestArea - 1e-9) {
            best = el;
            bestArea = area;
          }
        }
      }
      if (best) {
        return best;
      }
      /* A ROAD IS PICKED LAST, and by its surface: it is paint under
       * everything, so a car on it or a lamp beside it wins, and what a
       * pointer lands on is the eased road as drawn, not its node line. */
      let road = null;
      let roadD = Infinity;
      for (const el of doc.elements) {
        if (!isRoadEl(el)) {
          continue;
        }
        const r = roadOf(el);
        if (r.centre.points.length < 2) {
          const poly = this.planShape(el);
          if (polyNear(poly, world, pad) && !road) {
            road = el;
            roadD = pad;
          }
          continue;
        }
        const hit = nearestOn(r.centre, world.x, world.y);
        if (hit.d <= r.width / 2 + pad && hit.d < roadD) {
          road = el;
          roadD = hit.d;
        }
      }
      return road;
    }
    /* Back to front, so the most recently placed thing wins a tie the way it
     * does visually. */
    for (let i = doc.elements.length - 1; i >= 0; i -= 1) {
      const el = doc.elements[i];
      const poly = this.planShape(el);
      if (polyContains(poly, world) || polyNear(poly, world, pad)) {
        return el;
      }
    }
    return null;
  }

  /* The rotation handle of the single selected element, or null. */
  handlePos() {
    const ids = [...this.host.selection];
    if (ids.length !== 1) {
      return null;
    }
    const el = elementById(this.host.doc, ids[0]);
    /* A road is turned by its nodes and a vehicle by its road, so neither
     * has a heading to drag. */
    if (!el || kindOf(el) === KIND.ANNOTATION || isRoadEl(el) || isVehicleEl(el)) {
      return null;
    }
    const gap = HANDLE_GAP_PX / this.cam.scale;
    return add({ x: el.position.x, y: el.position.y, z: 0 }, scale(yawVector(el.yaw), gap));
  }

  /* ---------------- interaction ---------------- */

  bind() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => this.onDown(e));
    cv.addEventListener('pointermove', (e) => this.onMove(e));
    cv.addEventListener('pointerup', (e) => this.onUp(e));
    cv.addEventListener('pointercancel', () => this.onCancel());
    cv.addEventListener('pointerleave', () => { this.pointer = null; this.host.requestDraw(); });
    cv.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  localPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  onWheel(e) {
    e.preventDefault();
    const p = this.localPoint(e);
    const before = this.toWorld(p.x, p.y);
    const factor = Math.exp(-e.deltaY * 0.0016);
    this.cam.scale = clamp(this.cam.scale * factor, MIN_SCALE, MAX_SCALE);
    const after = this.toWorld(p.x, p.y);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.host.requestDraw();
  }

  onDown(e) {
    const p = this.localPoint(e);
    this.canvas.setPointerCapture(e.pointerId);
    const world = this.toWorld(p.x, p.y);

    /* Middle button, or right button, pans. Right also cancels an armed
     * palette tool, which is the fastest way to stop placing; a road half
     * laid is put away first, and the tool with it on a second press. */
    if (e.button === 1 || e.button === 2) {
      if (e.button === 2 && this.host.roadDraft) {
        this.host.cancelDraft();
        return;
      }
      if (e.button === 2 && this.host.armed) {
        this.host.disarm();
        return;
      }
      this.drag = { kind: 'pan', last: p };
      return;
    }
    if (e.button !== 0) {
      return;
    }

    /* THE ROAD TOOL lays a node a click, and the road lands as one edit
     * when it is finished: on its first node to close it, on its last to
     * leave it open (a double click lands there twice), or with Enter. */
    if (this.host.armed === 'road') {
      this.host.draftClick(world, this.host.snap(world, e.altKey), NODE_PX / this.cam.scale);
      return;
    }
    /* A vehicle goes on the road nearest the click. */
    if (this.host.armed === 'vehicle') {
      this.host.dropVehicle(world, SNAP_PX / this.cam.scale);
      return;
    }

    /* An armed palette tool places on click and stays armed, so ten gates
     * are ten clicks. */
    if (this.host.armed) {
      this.host.placeAt(this.host.snap(world, e.altKey));
      return;
    }

    /* A selected road's handles come before anything under them: a node
     * to drag, or a + between two to drag a new node out of. Each is one
     * undo step, the insert and its drag together. */
    const road = this.selectedRoad();
    if (road && !e.shiftKey) {
      const reach = NODE_PX / this.cam.scale;
      const i = pickNode(road, world.x, world.y, reach);
      if (i >= 0) {
        this.host.setActiveNode(road.id, i);
        this.host.beginEdit('move node');
        this.drag = { kind: 'node', id: road.id, index: i, starts: this.host.vehicleStarts(road.id), moved: false };
        return;
      }
      const leg = pickLeg(road, world.x, world.y, reach);
      if (leg >= 0) {
        const starts = this.host.vehicleStarts(road.id);
        this.host.beginEdit('add node');
        const index = this.host.insertRoadNode(road.id, leg, this.host.snap(world, e.altKey), starts);
        if (index < 0) {
          this.host.cancelEdit();
          return;
        }
        this.drag = { kind: 'node', id: road.id, index, starts, moved: true };
        return;
      }
    }

    const handle = this.handlePos();
    if (handle && dist(handle, world) * this.cam.scale < HANDLE_PX * 2.2) {
      const id = [...this.host.selection][0];
      this.host.beginEdit('rotate');
      this.drag = { kind: 'rotate', id };
      return;
    }

    const hit = this.pickAt(p.x, p.y);
    if (!hit) {
      if (!e.shiftKey) {
        this.host.setSelection([]);
      }
      this.band = { from: world, to: world, additive: e.shiftKey };
      this.drag = { kind: 'band' };
      this.host.requestDraw();
      return;
    }

    if (e.shiftKey) {
      this.host.toggleSelection(hit.id);
      /* Shift clicking a selected element takes it OUT of the selection, so
       * there is nothing to drag by and no origin recorded for it. Starting
       * a move here used to look up the anchor's origin in a map that no
       * longer held it and throw on the first mouse move. Deselecting is the
       * whole gesture. */
      if (!this.host.selection.has(hit.id)) {
        return;
      }
    } else if (!this.host.selection.has(hit.id)) {
      this.host.setSelection([hit.id]);
    }
    /* A vehicle is not moved, it is slid along its road: where it is IS
     * how far along its road it starts. */
    if (isVehicleEl(hit) && !e.shiftKey) {
      this.host.setSelection([hit.id]);
      this.host.beginEdit('slide vehicle');
      this.drag = { kind: 'slide', id: hit.id, moved: false };
      return;
    }
    this.host.beginEdit('move');
    this.drag = {
      kind: 'move',
      anchorId: hit.id,
      grabOffset: sub({ x: hit.position.x, y: hit.position.y, z: 0 }, world),
      origin: new Map([...this.host.selection].map((id) => {
        const el = elementById(this.host.doc, id);
        return [id, { ...el.position }];
      })),
      moved: false,
    };
  }

  onMove(e) {
    const p = this.localPoint(e);
    this.pointer = this.toWorld(p.x, p.y);

    if (!this.drag) {
      const hit = this.pickAt(p.x, p.y);
      const id = hit ? hit.id : null;
      if (id !== this.hover) {
        this.hover = id;
        this.host.requestDraw();
      } else if (this.host.armed) {
        this.host.requestDraw();
      }
      /* A pointing hand over a road's handles, so they read as things to
       * take hold of; a crosshair while a road is being laid. */
      const road = this.host.armed ? null : this.selectedRoad();
      const reach = NODE_PX / this.cam.scale;
      const onHandle = road && (pickNode(road, this.pointer.x, this.pointer.y, reach) >= 0
        || pickLeg(road, this.pointer.x, this.pointer.y, reach) >= 0);
      this.canvas.style.cursor = this.host.armed === 'road' ? 'crosshair' : (onHandle ? 'pointer' : '');
      this.host.onHoverWorld(this.pointer);
      return;
    }

    if (this.drag.kind === 'node') {
      this.drag.moved = true;
      this.host.moveRoadNode(this.drag.id, this.drag.index, this.host.snap(this.pointer, e.altKey), this.drag.starts);
      return;
    }

    if (this.drag.kind === 'slide') {
      this.drag.moved = true;
      this.host.slideVehicle(this.drag.id, this.pointer, SNAP_PX / this.cam.scale);
      return;
    }

    if (this.drag.kind === 'pan') {
      const dx = (p.x - this.drag.last.x) / this.cam.scale;
      const dy = (p.y - this.drag.last.y) / this.cam.scale;
      this.cam.x -= dx;
      this.cam.y += dy;
      this.drag.last = p;
      this.host.requestDraw();
      return;
    }

    if (this.drag.kind === 'band') {
      this.band.to = this.pointer;
      this.host.requestDraw();
      return;
    }

    if (this.drag.kind === 'rotate') {
      const el = elementById(this.host.doc, this.drag.id);
      if (!el) {
        return;
      }
      const raw = Math.atan2(this.pointer.y - el.position.y, this.pointer.x - el.position.x);
      /* Snap to 15 degrees unless the modifier says otherwise, the same
       * modifier that turns off grid snapping for position. A building
       * snaps to the compass whatever the modifier says, and the first
       * time the author pulls one well off it the tool says why, rather
       * than refusing silently. */
      if (turnsOf(el.type) === 'quarter' && offCompass(raw) > QUARTER_TURN / 4) {
        this.host.noteOffCompass(el);
      }
      this.host.rotateSelected(snapYaw(el.type, raw, e.altKey));
      return;
    }

    if (this.drag.kind === 'move') {
      const anchorOrigin = this.drag.origin.get(this.drag.anchorId);
      const wanted = add(this.pointer, this.drag.grabOffset);
      const snapped = this.host.snap(wanted, e.altKey);
      const delta = { x: snapped.x - anchorOrigin.x, y: snapped.y - anchorOrigin.y, z: 0 };
      if (Math.abs(delta.x) > 1e-9 || Math.abs(delta.y) > 1e-9) {
        this.drag.moved = true;
      }
      this.host.moveSelected(this.drag.origin, delta);
    }
  }

  onUp(e) {
    if (!this.drag) {
      return;
    }
    const kind = this.drag.kind;
    if (kind === 'band' && this.band) {
      const ids = this.elementsInBand(this.band);
      this.host.setSelection(ids, this.band.additive);
      this.band = null;
    }
    /* A click on a node or a car that did not move it is a pick, not an
     * edit, and leaves no undo step behind. */
    if ((kind === 'node' || kind === 'slide') && !this.drag.moved) {
      this.host.cancelEdit();
    } else if (kind === 'move' || kind === 'rotate' || kind === 'node' || kind === 'slide') {
      this.host.endEdit();
    }
    this.drag = null;
    this.host.requestDraw();
    if (e && this.canvas.hasPointerCapture?.(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
  }

  onCancel() {
    if (this.drag && ['move', 'rotate', 'node', 'slide'].includes(this.drag.kind)) {
      this.host.cancelEdit();
    }
    this.drag = null;
    this.band = null;
    this.host.requestDraw();
  }

  /* The one road that is selected, alone, or null: its handles are the
   * ones on show. */
  selectedRoad() {
    if (this.host.selection.size !== 1) {
      return null;
    }
    const el = elementById(this.host.doc, [...this.host.selection][0]);
    return el && isRoadEl(el) ? el : null;
  }

  /* What a box select takes: an element whose place is inside it. A road's
   * place is all its nodes, a vehicle's where it is drawn. */
  elementsInBand(band) {
    const minX = Math.min(band.from.x, band.to.x);
    const maxX = Math.max(band.from.x, band.to.x);
    const minY = Math.min(band.from.y, band.to.y);
    const maxY = Math.max(band.from.y, band.to.y);
    const inside = (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    const doc = this.host.doc;
    return doc.elements
      .filter((el) => {
        if (isRoadEl(el)) {
          const nodes = absNodes(el);
          return nodes.length > 0 && nodes.every(inside);
        }
        if (isVehicleEl(el)) {
          return inside(vehiclePlace(doc, el));
        }
        return inside(el.position);
      })
      .map((el) => el.id);
  }

  /* ---------------- drawing ---------------- */

  draw() {
    const ctx = this.canvas.getContext('2d');
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = C.ground;
    ctx.fillRect(0, 0, this.w, this.h);

    const doc = this.host.doc;
    /* A map has no flying order, so no racing line, no guide paint and no
     * numbers: a gate on a map is furniture. */
    const freestyle = docModeOf(doc) === 'freestyle';
    this.drawField(ctx, doc);
    this.drawGrid(ctx, doc);

    if (!freestyle && this.host.path && this.host.path.samples.length > 1) {
      this.drawGuidePaint(ctx, this.host.path);
    }
    if (!freestyle && this.host.pathVisible && this.host.path) {
      this.drawPath(ctx, this.host.path);
    }

    const numbers = freestyle ? new Map() : sequenceNumbers(doc);
    /* Roads first, because they are paint on the ground and everything
     * stands on them; vehicles last, over a bridge they pass under, because
     * a car an author cannot see is a car they cannot drag. */
    if (freestyle) {
      for (const el of doc.elements) {
        if (isRoadEl(el)) {
          this.drawRoad(ctx, el);
        }
      }
    }
    for (const el of doc.elements) {
      if (!isRoadEl(el) && !isVehicleEl(el)) {
        this.drawElement(ctx, el, numbers.get(el.id) ?? []);
      }
    }
    if (freestyle) {
      for (const el of doc.elements) {
        if (isVehicleEl(el)) {
          this.drawVehicle(ctx, el);
        }
      }
      this.drawRoadHandles(ctx);
      this.drawDraft(ctx);
      this.pruneStructureCache(doc);
    }

    this.drawHandle(ctx);
    this.drawBand(ctx);
    this.drawGhost(ctx);
    this.drawRulers(ctx, doc);
    ctx.restore();
  }

  drawField(ctx, doc) {
    const a = this.toScreen({ x: 0, y: 0 });
    const b = this.toScreen({ x: doc.field.width, y: doc.field.depth });
    ctx.fillStyle = C.fieldFill;
    ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
    ctx.strokeStyle = C.fieldEdge;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(a.x, b.y, b.x - a.x, a.y - b.y);
  }

  drawGrid(ctx, doc) {
    const g = doc.field.gridSize;
    /* Below six pixels a 1 m grid is a grey wash, so it steps up by tens
     * until it is legible again. */
    let step = g;
    while (step * this.cam.scale < 6) {
      step *= 10;
    }
    const major = step * 10;
    ctx.lineWidth = 1;
    for (let pass = 0; pass < 2; pass += 1) {
      const s = pass === 0 ? step : major;
      ctx.strokeStyle = pass === 0 ? C.gridMinor : C.gridMajor;
      ctx.beginPath();
      for (let x = 0; x <= doc.field.width + 1e-6; x += s) {
        const p = this.toScreen({ x, y: 0 });
        const q = this.toScreen({ x, y: doc.field.depth });
        ctx.moveTo(Math.round(p.x) + 0.5, p.y);
        ctx.lineTo(Math.round(q.x) + 0.5, q.y);
      }
      for (let y = 0; y <= doc.field.depth + 1e-6; y += s) {
        const p = this.toScreen({ x: 0, y });
        const q = this.toScreen({ x: doc.field.width, y });
        ctx.moveTo(p.x, Math.round(p.y) + 0.5);
        ctx.lineTo(q.x, Math.round(q.y) + 0.5);
      }
      ctx.stroke();
    }
  }

  drawRulers(ctx, doc) {
    ctx.fillStyle = C.ruler;
    ctx.fillRect(0, 0, this.w, RULER);
    ctx.fillRect(0, 0, RULER, this.h);
    ctx.fillStyle = C.rulerText;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';

    let step = doc.field.gridSize;
    while (step * this.cam.scale < 44) {
      step *= step === doc.field.gridSize ? 5 : 2;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let x = 0; x <= doc.field.width + 1e-6; x += step) {
      const p = this.toScreen({ x, y: 0 });
      if (p.x < RULER + 8 || p.x > this.w - 4) {
        continue;
      }
      ctx.fillText(`${round1(x)}`, p.x, RULER / 2);
      ctx.fillRect(Math.round(p.x), RULER - 4, 1, 4);
    }
    ctx.textAlign = 'center';
    for (let y = 0; y <= doc.field.depth + 1e-6; y += step) {
      const p = this.toScreen({ x: 0, y });
      if (p.y < RULER + 8 || p.y > this.h - 4) {
        continue;
      }
      ctx.save();
      ctx.translate(RULER / 2, p.y);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${round1(y)}`, 0, 0);
      ctx.restore();
      ctx.fillRect(RULER - 4, Math.round(p.y), 4, 1);
    }
    ctx.fillStyle = C.rulerText;
    ctx.textAlign = 'center';
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('m', RULER / 2, RULER / 2);
  }

  drawElement(ctx, el, numbers) {
    const def = ELEMENTS[el.type];
    const selected = this.host.selection.has(el.id);
    const hovered = this.hover === el.id;

    if (def.kind === KIND.ROAD) {
      this.drawRoad(ctx, el);
      return;
    }
    if (def.kind === KIND.VEHICLE) {
      this.drawVehicle(ctx, el);
      return;
    }
    if (def.kind === KIND.ANNOTATION) {
      this.drawLabel(ctx, el, selected);
      return;
    }
    if (def.kind === KIND.START) {
      this.drawStart(ctx, el, selected);
      return;
    }
    if (def.kind === KIND.MARKER) {
      this.drawMarker(ctx, el, numbers, selected, hovered);
      return;
    }
    if (def.kind === KIND.OBSTACLE) {
      this.drawBarrier(ctx, el, selected, hovered);
      return;
    }
    if (def.kind === KIND.DECAL) {
      this.drawGroundLogo(ctx, el, selected, hovered);
      return;
    }
    if (def.kind === KIND.STRUCTURE) {
      this.drawStructure(ctx, el, selected, hovered);
      return;
    }
    if (def.kind === KIND.ZONE) {
      this.drawZone(ctx, el, selected, hovered);
      return;
    }
    this.drawAperture(ctx, el, numbers, selected, hovered);
  }

  /*
   * A FREESTYLE ASSET, DRAWN FROM ITS OWN PARTS.
   *
   * The same boxes and capsules src/props hands the physics, flattened onto
   * the ground: a box as a filled rectangle toned by how tall it stands, a
   * capsule as a stroke as wide as it is (never under a pixel, so a lattice
   * member does not vanish when zoomed out). A part that is drawn but not
   * solid is faint, because a quad goes through it. Taller parts are drawn
   * last, so a roof covers the ground floor under it the way it does from
   * the air. Then a thin outline of the element's plan rectangle, which is
   * also what picks it, and its name.
   *
   * THE PARTS ARE BATCHED AND CACHED. A crane is 186 parts and a map may
   * carry three hundred elements, and this runs on every pointer move. Each
   * element's parts become at most a few Path2D objects in its OWN local
   * frame, one per height tone, cached by what shapes it (type, style,
   * dims, base height). The position and the placed heading go on as a
   * canvas transform at draw time, so moving or turning an element never
   * re-runs its layout, and a static element never re-runs anything.
   */
  structurePaths(el) {
    if (!this.structCache) {
      this.structCache = new Map();
    }
    const key = `${propKey(el)}|${el.position.z || 0}`;
    const hit = this.structCache.get(el.id);
    if (hit && hit.key === key) {
      return hit;
    }
    const base = el.position.z || 0;
    const buckets = new Map();
    const bucket = (step, solid, kind, r = 0) => {
      const id = `${step}|${solid ? 1 : 0}|${kind}|${kind === 'cap' ? Math.round(r * 1000) : 0}`;
      let b = buckets.get(id);
      if (!b) {
        b = { step, solid, kind, r, path: new Path2D() };
        buckets.set(id, b);
      }
      return b;
    };
    for (const p of partsOf(el)) {
      if (!p.solid && !p.draw) {
        continue;
      }
      /* Local (x, z) to the canvas frame this is drawn in, which is the
       * document's with the element at the origin and its heading along
       * +x: plan y is minus local z, see planPoint. */
      if (p.t === 'box') {
        const b = bucket(toneStep(base + p.hi[1]), p.solid, 'box');
        b.path.rect(p.lo[0], -p.hi[2], p.hi[0] - p.lo[0], p.hi[2] - p.lo[2]);
      } else {
        const b = bucket(toneStep(base + Math.max(p.a[1], p.b[1]) + p.r), p.solid, 'cap', p.r);
        const ax = p.a[0];
        const ay = -p.a[2];
        const bx = p.b[0];
        const by = -p.b[2];
        if (Math.hypot(bx - ax, by - ay) < 1e-3) {
          /* Straight up: a post, a leg, a trunk. On the plan it is its own
           * round section, drawn as a dot the stroke's width. */
          b.dots = b.dots || [];
          b.dots.push([ax, ay]);
        } else {
          b.path.moveTo(ax, ay);
          b.path.lineTo(bx, by);
        }
      }
    }
    const list = [...buckets.values()].sort((a, b) => (a.step - b.step)
      || ((a.kind === 'box' ? 0 : 1) - (b.kind === 'box' ? 0 : 1)));
    const entry = { key, list };
    this.structCache.set(el.id, entry);
    return entry;
  }

  /* Forget the cached drawing of anything no longer on the map. */
  pruneStructureCache(doc) {
    if (!this.structCache || this.structCache.size <= doc.elements.length) {
      return;
    }
    const live = new Set(doc.elements.map((e) => e.id));
    for (const id of this.structCache.keys()) {
      if (!live.has(id)) {
        this.structCache.delete(id);
      }
    }
  }

  drawStructure(ctx, el, selected, hovered) {
    const { list } = this.structurePaths(el);
    const yaw = placedYaw(turnsOf(el.type), el.yaw || 0);
    const k = this.cam.scale;
    const px = 1 / k;
    ctx.save();
    /* The camera, then the element: document metres, +y up the screen. */
    ctx.transform(k, 0, 0, -k, -this.cam.x * k, this.h + this.cam.y * k);
    ctx.translate(el.position.x, el.position.y);
    ctx.rotate(yaw);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const b of list) {
      const alpha = b.solid ? 0.95 : 0.35;
      if (b.kind === 'box') {
        ctx.fillStyle = structureTone(b.step, alpha);
        ctx.fill(b.path);
        ctx.strokeStyle = C.structInk;
        ctx.lineWidth = px;
        ctx.stroke(b.path);
      } else {
        const w = Math.max(2 * b.r, px);
        ctx.strokeStyle = structureTone(b.step, alpha);
        ctx.lineWidth = w;
        ctx.stroke(b.path);
        if (b.dots) {
          ctx.fillStyle = structureTone(b.step, alpha);
          ctx.beginPath();
          for (const [x, y] of b.dots) {
            ctx.moveTo(x + w / 2, y);
            ctx.arc(x, y, w / 2, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
    }
    ctx.restore();

    const poly = this.planShape(el).map((p) => this.toScreen(p));
    ctx.beginPath();
    poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = selected ? C.selected : (hovered ? '#ffffff' : C.structEdge);
    ctx.lineWidth = selected ? 2.2 : 1;
    ctx.setLineDash(selected || hovered ? [] : [4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (el.name) {
      this.drawTag(ctx, el.name, poly, selected ? C.selected : C.structName);
    }
  }

  /* A name over an element, at the top of its outline on screen, with a dark
   * backing so it reads over a pale roof. */
  drawTag(ctx, text, poly, colour) {
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const top = Math.min(...ys) - 8;
    ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(8, 14, 20, 0.72)';
    ctx.fillRect(cx - w / 2 - 4, top - 8, w + 8, 16);
    ctx.fillStyle = colour;
    ctx.fillText(text, cx, top + 0.5);
  }

  /* A list of plan points as a canvas path, closed or not. */
  tracePath(ctx, pts, closed) {
    ctx.beginPath();
    pts.forEach((q, i) => {
      const s = this.toScreen(q);
      if (i === 0) {
        ctx.moveTo(s.x, s.y);
      } else {
        ctx.lineTo(s.x, s.y);
      }
    });
    if (closed) {
      ctx.closePath();
    }
  }

  /*
   * A ROAD, DRAWN AS IT WILL BE DRIVEN: its eased centre line from
   * src/maps/built/road.js, not the line of nodes, as a band of tarmac its
   * own width with cream edges and, on two lanes, a dashed line down the
   * middle. Then what road.js made of the nodes (drawRoadMarks). A road with
   * no line to drive is drawn as its nodes, dashed red, so it can be found
   * and fixed.
   */
  drawRoad(ctx, el) {
    const selected = this.host.selection.has(el.id);
    const hovered = this.hover === el.id;
    const r = roadOf(el);
    const line = r.centre;
    if (line.points.length < 2) {
      const nodes = absNodes(el);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = selected ? C.selected : C.bad;
      ctx.lineWidth = 2;
      this.tracePath(ctx, nodes, el.closed === true);
      ctx.stroke();
      ctx.restore();
      this.drawRoadMarks(ctx, el, r, selected);
      return;
    }
    this.paintRoad(ctx, line, r.width, r.lanes, { selected, hovered });
    if (selected) {
      this.drawRoadArrows(ctx, line);
    }
    this.drawRoadMarks(ctx, el, r, selected);
    if (el.name) {
      const at = this.toScreen(line.points[0]);
      this.drawTag(ctx, el.name, [at], selected ? C.selected : C.structName);
    }
  }

  /* A line painted as a road: tarmac, two edges, and the middle line. */
  paintRoad(ctx, line, width, lanes, opts = {}) {
    const k = this.cam.scale;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    if (opts.draft) {
      ctx.globalAlpha = 0.72;
    }
    this.tracePath(ctx, line.points, line.closed);
    ctx.strokeStyle = C.road;
    ctx.lineWidth = Math.max(2, width * k);
    ctx.stroke();
    const edges = opts.draft ? edgesOf(line, width) : edgesFor(line, width);
    ctx.strokeStyle = opts.selected ? C.selected : (opts.hovered ? '#ffffff' : C.roadEdge);
    ctx.lineWidth = opts.selected ? 2 : 1.2;
    for (const side of [edges.left, edges.right]) {
      this.tracePath(ctx, side, line.closed);
      ctx.stroke();
    }
    if (lanes === 2 && width * k > 10) {
      const dash = Math.max(4, 3 * k);
      ctx.setLineDash([dash, dash]);
      ctx.strokeStyle = C.roadPaint;
      ctx.lineWidth = Math.max(1, 0.15 * k);
      this.tracePath(ctx, line.points, line.closed);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Which way the road's nodes run, a chevron every so often down its
   * middle: the way Forward drives it. Shown on the selected road. */
  drawRoadArrows(ctx, line) {
    const every = Math.max(12, 70 / this.cam.scale);
    for (let s = every / 2; s < line.length; s += every) {
      const at = pointAt(line, s);
      const p = this.toScreen(at);
      arrowHead(ctx, p.x, p.y, Math.atan2(-at.ty, at.tx), 4.5, C.roadArrow);
    }
  }

  /*
   * WHAT road.js MADE OF THE NODES, where it made it: a node it had to leave
   * out (a fold, or a turn no bend fits) ringed red and crossed; one it ran
   * straight past, or read as the node before it, ringed amber; a place the
   * road crosses itself crossed red. On the selected road, a bend eased
   * tighter than the road's own radius, because its nodes are close, says
   * its radius at its apex: tighter by more than a twentieth, since every
   * bend is a few centimetres off the radius asked for where its steps
   * are rounded to whole numbers.
   */
  drawRoadMarks(ctx, el, r, selected) {
    const nodes = absNodes(el);
    const ring = (q, colour, cross) => {
      const p = this.toScreen(q);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      if (cross) {
        ctx.beginPath();
        ctx.moveTo(p.x - 5, p.y - 5);
        ctx.lineTo(p.x + 5, p.y + 5);
        ctx.moveTo(p.x + 5, p.y - 5);
        ctx.lineTo(p.x - 5, p.y + 5);
        ctx.stroke();
      }
    };
    for (const pr of r.problems) {
      const q = Number.isInteger(pr.node) ? nodes[pr.node] : null;
      if (pr.code === 'rd-crossing' && r.report.crossing) {
        ring(r.report.crossing, C.bad, true);
      } else if (q && (pr.code === 'rd-tight' || pr.code === 'rd-fold')) {
        ring(q, C.bad, true);
      } else if (q) {
        ring(q, C.flat, false);
      }
    }
    if (!selected) {
      return;
    }
    ctx.font = '600 10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of r.centre.corners) {
      if (c.radius < r.radius * 0.95) {
        const p = this.toScreen(c);
        const text = `${c.radius.toFixed(1)} m`;
        const w = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(8, 14, 20, 0.72)';
        ctx.fillRect(p.x - w / 2 - 3, p.y - 7, w + 6, 14);
        ctx.fillStyle = C.flat;
        ctx.fillText(text, p.x, p.y + 0.5);
      }
    }
  }

  /*
   * THE SELECTED ROAD'S HANDLES: its node line faint and dashed, a round
   * handle on every node (the first bigger, since a car's start is measured
   * from it and a loop starts there; the picked one filled amber), and a +
   * on the middle of every leg to drag a new node out of.
   */
  drawRoadHandles(ctx) {
    const road = this.selectedRoad();
    if (!road) {
      return;
    }
    const nodes = absNodes(road);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(255, 212, 92, 0.45)';
    ctx.lineWidth = 1;
    this.tracePath(ctx, nodes, road.closed === true);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const m of legMidpoints(road)) {
      const p = this.toScreen(m);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 26, 38, 0.85)';
      ctx.fill();
      ctx.strokeStyle = C.selected;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 3, p.y);
      ctx.lineTo(p.x + 3, p.y);
      ctx.moveTo(p.x, p.y - 3);
      ctx.lineTo(p.x, p.y + 3);
      ctx.stroke();
    }
    const active = this.host.activeNode;
    nodes.forEach((q, i) => {
      const p = this.toScreen(q);
      const on = active && active.id === road.id && active.index === i;
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === 0 ? 7 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = on ? C.selected : C.node;
      ctx.fill();
      ctx.strokeStyle = C.selected;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.restore();
  }

  /*
   * A VEHICLE, WHERE IT STARTS: its body the drawn car's own length and
   * width, turned the way it faces, its windscreen darker so the nose reads,
   * and an arrow ahead of it the way it drives. The drift car is orange. A
   * vehicle with no road is drawn in the parking row, dashed red.
   */
  drawVehicle(ctx, el) {
    const doc = this.host.doc;
    const selected = this.host.selection.has(el.id);
    const hovered = this.hover === el.id;
    const at = vehiclePlace(doc, el);
    this.paintCar(ctx, at, {
      fill: !at.onRoad ? 'rgba(255, 125, 125, 0.3)' : (el.drift ? C.carDrift : C.car),
      edge: selected ? C.selected : (hovered ? '#ffffff' : (at.onRoad ? C.carInk : C.bad)),
      width: selected ? 2.2 : 1.2,
      dashed: !at.onRoad,
      arrow: at.onRoad ? (selected ? C.selected : C.start) : null,
    });
    const tag = !at.onRoad ? `${el.name ? `${el.name}, ` : ''}no road` : el.name;
    if (tag) {
      const poly = footprint(at).map((q) => this.toScreen(q));
      this.drawTag(ctx, tag, poly, !at.onRoad ? C.bad : (selected ? C.selected : C.structName));
    }
  }

  /* A car's body in plan, from { x, y, tx, ty, length, width }. */
  paintCar(ctx, at, o) {
    const poly = footprint(at).map((q) => this.toScreen(q));
    ctx.save();
    ctx.beginPath();
    poly.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
    ctx.closePath();
    ctx.fillStyle = o.fill;
    ctx.fill();
    ctx.setLineDash(o.dashed ? [4, 3] : []);
    ctx.strokeStyle = o.edge;
    ctx.lineWidth = o.width;
    ctx.stroke();
    ctx.setLineDash([]);
    /* The windscreen: a band across the body a fifth of its length back
     * from the nose. */
    const f0 = 0.12;
    const f1 = 0.3;
    const glass = footprint({ ...at, x: at.x + at.tx * at.length * (0.5 - (f0 + f1) / 2), y: at.y + at.ty * at.length * (0.5 - (f0 + f1) / 2), length: at.length * (f1 - f0), width: at.width * 0.8 })
      .map((q) => this.toScreen(q));
    ctx.beginPath();
    glass.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
    ctx.closePath();
    ctx.fillStyle = C.carGlass;
    ctx.fill();
    if (o.arrow) {
      const nose = this.toScreen({ x: at.x + at.tx * at.length / 2, y: at.y + at.ty * at.length / 2 });
      const len = Math.max(12, 1.6 * this.cam.scale);
      const ang = Math.atan2(-at.ty, at.tx);
      const tip = { x: nose.x + Math.cos(ang) * len, y: nose.y + Math.sin(ang) * len };
      ctx.strokeStyle = o.arrow;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(nose.x, nose.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      arrowHead(ctx, tip.x, tip.y, ang, 5, o.arrow);
    }
    ctx.restore();
  }

  /*
   * THE ROAD BEING LAID: its eased line through the nodes so far and on to
   * the pointer, painted the way it will be, so the author sees the curve
   * they are making rather than the corners they are clicking. With three
   * nodes down, the pointer on the first node shows the loop closed, and
   * the first node rings to say a click there closes it. Nodes road.js
   * would leave out are ringed as they would be on a laid road.
   */
  drawDraft(ctx) {
    const nodes = this.host.roadDraft;
    if (this.host.armed !== 'road' || !nodes || !nodes.length) {
      return;
    }
    const reach = NODE_PX / this.cam.scale;
    const raw = this.pointer;
    const closing = raw && closesDraft(nodes, raw.x, raw.y, reach);
    const pts = closing || !raw ? nodes : addDraftNode(nodes, this.host.snap(raw, false));
    const def = ELEMENTS.road.dims;
    if (pts.length >= 2) {
      const laneOffset = closing && def.lanes === 2 ? def.width / 4 : 0;
      const line = centreLine(pts.map((q, i) => ({ x: q.x, y: q.y, node: i })), Boolean(closing), {
        radius: def.radius, floor: DRIVE_RADIUS_MIN + laneOffset,
      });
      if (line.points.length >= 2) {
        this.paintRoad(ctx, line, def.width, def.lanes, { draft: true });
      }
      for (const pr of line.problems) {
        const q = Number.isInteger(pr.node) ? pts[pr.node] : null;
        if (q && pr.level !== 'info') {
          const p = this.toScreen(q);
          ctx.strokeStyle = C.bad;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(255, 212, 92, 0.45)';
    ctx.lineWidth = 1;
    this.tracePath(ctx, pts, Boolean(closing));
    ctx.stroke();
    ctx.setLineDash([]);
    nodes.forEach((q, i) => {
      const p = this.toScreen(q);
      const first = i === 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, first ? (closing ? 10 : 7) : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = first && closing ? C.selected : C.node;
      ctx.fill();
      ctx.strokeStyle = C.selected;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.restore();
  }

  /*
   * A NAMED GAP, which is a window in the air: Width across its heading and
   * Height up from its base. From above that is a line, so it is drawn as a
   * dashed amber bar with a tick at each end, over a faint band the depth a
   * pointer picks, and labelled with its name and what it is worth.
   */
  drawZone(ctx, el, selected, hovered) {
    const yaw = el.yaw || 0;
    const across = { x: -Math.sin(yaw), y: Math.cos(yaw) };
    const along = { x: Math.cos(yaw), y: Math.sin(yaw) };
    const hw = Math.max(0.1, el.dims.width) / 2;
    const c = el.position;
    const a = this.toScreen({ x: c.x - across.x * hw, y: c.y - across.y * hw });
    const b = this.toScreen({ x: c.x + across.x * hw, y: c.y + across.y * hw });
    const colour = selected ? C.selected : (hovered ? '#ffffff' : C.zone);

    const band = this.planShape(el).map((p) => this.toScreen(p));
    ctx.beginPath();
    band.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = C.zoneFill;
    ctx.fill();

    ctx.strokeStyle = colour;
    ctx.lineWidth = selected ? 3.2 : 2.6;
    ctx.lineCap = 'butt';
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    /* End ticks along the heading, so the bar reads as a span with two
     * ends, like a dimension line, rather than as a stray dash. */
    const tick = 6;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const p of [a, b]) {
      ctx.moveTo(p.x - along.x * tick, p.y + along.y * tick);
      ctx.lineTo(p.x + along.x * tick, p.y - along.y * tick);
    }
    ctx.stroke();

    /* The label sits off the bar's far end, clear of it whichever way the
     * gap is turned: it is pushed out along the bar by its own half extent
     * in that direction, so it never covers the window it names. */
    const label = `${el.name || 'GAP'}  ${el.points ?? ''}`.trim();
    ctx.font = 'italic 700 11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width;
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = span > 1e-6 ? (b.x - a.x) / span : 0;
    const uy = span > 1e-6 ? (b.y - a.y) / span : -1;
    const push = Math.abs(ux) * (w / 2 + 4) + Math.abs(uy) * 8 + 8;
    const ox = b.x + ux * push;
    const oy = b.y + uy * push;
    ctx.fillStyle = 'rgba(8, 14, 20, 0.72)';
    ctx.fillRect(ox - w / 2 - 4, oy - 8, w + 8, 16);
    ctx.fillStyle = colour;
    ctx.fillText(label, ox, oy + 0.5);
  }

  /*
   * A sponsor's logo painted on the grass: the footprint, and the logo
   * itself inside it once it has decoded.
   *
   * THE PICTURE IS DRAWN, not a name in a box, because the whole question
   * an author has about a ground decal is whether it is the right way up,
   * the right size and in the right place, and a rectangle labelled
   * "logo-2" answers none of them. It is fitted inside the footprint by the
   * same rule the world fits it by, so a logo that paints small here paints
   * small on the field, which is the cue to resize the footprint.
   *
   * A footprint with no logo behind it is drawn hollow and said so. That
   * happens when the course carries no logos yet, or when the one this
   * decal named has been removed, and both are things to fix rather than
   * things to hide.
   */
  drawGroundLogo(ctx, el, selected, hovered) {
    const poly = this.planShape(el).map((p) => this.toScreen(p));
    const c = this.toScreen(el.position);
    const wpx = Math.max(1, el.dims.width * this.cam.scale);
    const dpx = Math.max(1, el.dims.depth * this.cam.scale);
    const logo = logoForDecal(this.host.doc, el);
    const img = logo ? this.logoImage(logo.image) : null;

    ctx.save();
    ctx.beginPath();
    poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = C.decalFill;
    ctx.fill();
    /* Dashed, because paint has no edge you could hit. A barrier is solid
     * and drawn solid; this is not. */
    ctx.setLineDash(selected ? [] : [5, 4]);
    ctx.strokeStyle = selected ? C.selected : (hovered ? '#ffffff' : C.decal);
    ctx.lineWidth = selected ? 2.4 : 1.2;
    ctx.stroke();
    ctx.restore();

    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.clip();
      ctx.translate(c.x, c.y);
      /* MINUS the yaw. toScreen flips Y so the document's +Y runs UP the
       * plan, and a canvas rotation turns the other way from a document
       * one. The same sign appears in the world's pitch canvas for the same
       * reason. Get it wrong and every ground logo is mirrored, which
       * nothing else on the plan would show. */
      ctx.rotate(-el.yaw);
      const k = Math.min(wpx / img.naturalWidth, dpx / img.naturalHeight);
      const iw = img.naturalWidth * k;
      const ih = img.naturalHeight * k;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(img, -iw * 0.5, -ih * 0.5, iw, ih);
      ctx.restore();
      return;
    }
    if (!logo) {
      const px = Math.max(8, Math.min(13, dpx * 0.3));
      ctx.font = `${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = selected ? C.selected : C.decal;
      ctx.fillText('no logo', c.x, c.y);
    }
  }

  /*
   * A decoded logo, cached on the view by its data URL.
   *
   * Cached because drawElement runs on every pointer move over a field that
   * may carry five decals, and starting a decode per frame is how a plan
   * that used to pan smoothly stops. Keyed by the data URL rather than by
   * the logo's id, so replacing a sponsor's artwork under the same id gets
   * a new decode rather than the old picture.
   */
  logoImage(url) {
    if (typeof url !== 'string' || !url) {
      return null;
    }
    if (!this.logoImages) {
      this.logoImages = new Map();
    }
    let img = this.logoImages.get(url);
    if (!img) {
      img = new Image();
      img.onload = () => this.host.requestDraw();
      img.src = url;
      this.logoImages.set(url, img);
    }
    return img;
  }

  drawAperture(ctx, el, numbers, selected, hovered) {
    const poly = this.planShape(el).map((p) => this.toScreen(p));
    const dive = Math.abs(el.pitch) > Math.PI / 4;

    ctx.beginPath();
    poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = dive ? 'rgba(125, 255, 180, 0.10)' : C.elementFill;
    ctx.fill();
    ctx.strokeStyle = selected ? C.selected : (hovered ? '#ffffff' : C.element);
    ctx.lineWidth = selected ? 2.4 : 1.6;
    ctx.stroke();

    /* A dive gate is hatched, so a horizontal aperture never reads as a
     * barrier or as a wide gate seen edge on. */
    if (dive) {
      this.hatch(ctx, poly);
    }

    /* Every level of a multi level structure gets a tick along the frame, so
     * a ladder is visibly not a gate from the plan alone. */
    const levels = aperturesOf(el);
    if (levels.length > 1 && !dive) {
      const c = this.toScreen(el.position);
      ctx.fillStyle = selected ? C.selected : C.element;
      for (let i = 0; i < levels.length; i += 1) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.2 + i * 2.6, 0.2, Math.PI - 0.2);
        ctx.strokeStyle = selected ? C.selected : C.element;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    for (const n of numbers) {
      this.drawArrowFor(ctx, el, n, dive);
    }
    this.drawHeaderFlags(ctx, el, selected);
    this.drawNumbers(ctx, el, numbers, selected);
  }

  /*
   * Tiny pennants on the header, so a flagged gate is not a plain gate on
   * the plan. Left and right are the width-axis ends as seen facing the
   * gate and top is the centre, matching the inspector cards.
   */
  drawHeaderFlags(ctx, el, selected) {
    const signs = flagSideSigns(flagSideOf(el));
    if (!signs.length) {
      return;
    }
    const u = { x: -Math.sin(el.yaw), y: Math.cos(el.yaw) };
    const half = el.dims.clearW * 0.5;
    ctx.fillStyle = selected ? C.selected : C.marker;
    for (const sx of signs) {
      const lean = flagLeanSign(sx);
      const base = {
        x: el.position.x + u.x * sx * half,
        y: el.position.y + u.y * sx * half,
      };
      /* The cloth hangs along the LEAN, which a centre mast has and a sign
       * of zero does not: without this a top pennant drew as a zero length
       * stroke and vanished from the plan. */
      const tip = {
        x: base.x + u.x * lean * 0.55,
        y: base.y + u.y * lean * 0.55,
      };
      const p = this.toScreen(base);
      const q = this.toScreen(tip);
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.lineTo(p.x + dx * 0.62 - dy * 0.42, p.y + dy * 0.62 + dx * 0.42);
      ctx.closePath();
      ctx.fill();
    }
  }

  /*
   * The arrow through an aperture, in the direction of travel.
   *
   * A vertical gate gets a straight arrow across the plan. A dive gate is
   * flown up or down, and an arrow drawn on the plan for a vertical move
   * would be a dot, so it gets a ringed glyph instead: a circle with a cross
   * for "down through here" and a circle with a dot for "up through here",
   * which is the same convention every drawing uses for a vector going into
   * or out of the page. When a dive gate is tilted rather than flat, the
   * horizontal part of the travel is drawn as a short tail off the glyph so
   * the slope direction is readable too.
   */
  drawArrowFor(ctx, el, entry, dive) {
    const seq = entry.seq;
    const dir = travelDirection(this.host.doc, seq.id);
    if (!dir) {
      return;
    }
    const c = this.toScreen(el.position);
    const flat = { x: dir.x, y: dir.y, z: 0 };
    const flatLen = Math.hypot(flat.x, flat.y);

    if (dive) {
      const r = 9;
      ctx.strokeStyle = C.entry;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (dir.z < 0) {
        /* Going away from the reader: a cross, the tail of the arrow. */
        const k = r * 0.62;
        ctx.beginPath();
        ctx.moveTo(c.x - k, c.y - k);
        ctx.lineTo(c.x + k, c.y + k);
        ctx.moveTo(c.x + k, c.y - k);
        ctx.lineTo(c.x - k, c.y + k);
        ctx.stroke();
      } else {
        ctx.fillStyle = C.entry;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
      if (flatLen > 0.08) {
        const u = normalize(flat);
        const tail = 26;
        ctx.beginPath();
        ctx.moveTo(c.x + u.x * r, c.y - u.y * r);
        ctx.lineTo(c.x + u.x * (r + tail), c.y - u.y * (r + tail));
        ctx.stroke();
        arrowHead(ctx, c.x + u.x * (r + tail), c.y - u.y * (r + tail), Math.atan2(-u.y, u.x), 6, C.entry);
      }
      return;
    }

    if (flatLen < 1e-6) {
      return;
    }
    const u = { x: flat.x / flatLen, y: flat.y / flatLen };
    const half = Math.max(18, el.dims.clearW * this.cam.scale * 0.85);
    const ax = c.x - u.x * half;
    const ay = c.y + u.y * half;
    const bx = c.x + u.x * half;
    const by = c.y - u.y * half;
    ctx.strokeStyle = C.entry;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    arrowHead(ctx, bx, by, Math.atan2(-u.y, u.x), 7, C.entry);
    /* A short red stub on the exit face, so entry green and exit red read
     * the same in 2D as they do in 3D. */
    ctx.strokeStyle = C.exit;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + u.x * 5, by - u.y * 5);
    ctx.stroke();
  }

  drawMarker(ctx, el, numbers, selected, hovered) {
    const def = ELEMENTS[el.type];
    const c = this.toScreen(el.position);
    const r = Math.max(4, (def.dims.baseRadius ?? 0.12) * this.cam.scale);

    /* A waypoint is drawn hollow, because nothing is standing there. A solid
     * dot would read as an obstacle, which is the one thing it is not. */
    if (el.type === 'waypoint') {
      const rr = Math.max(5, 0.45 * this.cam.scale);
      ctx.beginPath();
      ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
      ctx.strokeStyle = selected ? C.selected : C.marker;
      ctx.lineWidth = hovered ? 2.5 : 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = selected ? C.selected : C.marker;
      ctx.fill();
      this.drawNumbers(ctx, el, numbers, selected);
      return;
    }

    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = selected ? C.selected : C.marker;
    ctx.fill();
    if (hovered) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (el.type === 'flag') {
      /* A little pennant, so a flag is not a cone at a glance. */
      const d = yawVector(el.yaw);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + d.x * 12, c.y - d.y * 12);
      ctx.lineTo(c.x + d.x * 8 - d.y * 7, c.y - d.y * 8 - d.x * 7);
      ctx.closePath();
      ctx.fillStyle = selected ? C.selected : C.marker;
      ctx.fill();
    }

    for (const n of numbers) {
      this.drawChevron(ctx, el, n.seq);
    }
    this.drawNumbers(ctx, el, numbers, selected);
  }

  /*
   * The pass side chevron: drawn on the side of the marker the QUAD goes,
   * at the clearance radius, pointing along the direction of travel. Two
   * strokes so it reads as a chevron and not as an arrow, because it marks a
   * side rather than a heading.
   */
  drawChevron(ctx, el, seq) {
    const dir = travelDirection(this.host.doc, seq.id);
    if (!dir) {
      return;
    }
    const u = normalize({ x: dir.x, y: dir.y, z: 0 }, { x: 1, y: 0, z: 0 });
    /* Which way off the pole the pass is: square to travel on the derived
     * side, or the marker's own heading once the author has turned it. One
     * function, shared with path.js and the 3D preview, so the plan cannot
     * draw the square somewhere the racing line does not go. */
    const side = markerPassDir(el, seq, u);
    const at = add(el.position, scale(side, seq.clearance ?? 0));
    const p = this.toScreen(at);
    const ang = Math.atan2(-u.y, u.x);

    if ((seq.clearance ?? 0) >= 0.05) {
      const dims = virtualApertureDims(el, seq, trackClassOf(this.host.doc));
      /* The virtual gate, in plan: a green bar the width of the scoring
       * square, sitting on the pass side. A vertical square collapses to a
       * bar the same way a real gate does. Its centre is `outward` past the
       * racing line knot, which is what holds the inner edge on the pole
       * now that the square is wider than the clearance corridor. */
      const hw = dims.clearW / 2;
      const hd = 0.18;
      /* WHERE it sits follows the pass direction, all the way round a
       * turned marker. WHICH WAY IT FACES does not: race.js builds every
       * scoring frame from the heading alone, so the square's width is
       * always across the direction of travel and its plane always square
       * to it. Drawing it any other way would draw a hole that is not the
       * hole being scored. */
      const left = leftOf(u);
      const gateAt = add(at, scale(side, dims.outward));
      const corners = [
        add(gateAt, add(scale(left, -hw), scale(u, -hd))),
        add(gateAt, add(scale(left, hw), scale(u, -hd))),
        add(gateAt, add(scale(left, hw), scale(u, hd))),
        add(gateAt, add(scale(left, -hw), scale(u, hd))),
      ].map((q) => this.toScreen(q));
      ctx.beginPath();
      corners.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(125, 255, 180, 0.22)';
      ctx.fill();
      ctx.strokeStyle = C.entry;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    /* The clearance circle, so the radius is a thing you can see and not a
     * number in a panel. */
    const c = this.toScreen(el.position);
    ctx.strokeStyle = 'rgba(247, 232, 205, 0.28)';
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(3, (seq.clearance ?? 0) * this.cam.scale), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.strokeStyle = C.entry;
    ctx.lineWidth = 2.2;
    for (const off of [-4, 3]) {
      ctx.beginPath();
      ctx.moveTo(off - 5, -7);
      ctx.lineTo(off + 3, 0);
      ctx.lineTo(off - 5, 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBarrier(ctx, el, selected, hovered) {
    const poly = this.planShape(el).map((p) => this.toScreen(p));
    ctx.beginPath();
    poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = C.barrier;
    ctx.fill();
    ctx.strokeStyle = selected ? C.selected : (hovered ? '#ffffff' : C.barrierEdge);
    ctx.lineWidth = selected ? 2.4 : 1.4;
    ctx.stroke();
  }

  drawStart(ctx, el, selected) {
    const poly = this.planShape(el).map((p) => this.toScreen(p));
    ctx.beginPath();
    poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(125, 255, 180, 0.12)';
    ctx.fill();
    ctx.strokeStyle = selected ? C.selected : C.start;
    ctx.lineWidth = selected ? 2.4 : 1.8;
    ctx.stroke();

    /* Each stand as a U: two rails along the heading and a brace at the
     * back, which is the plan of a real launch block rather than a tile. */
    const n = Math.max(1, Math.round(el.dims.pads));
    const fwd = yawVector(el.yaw);
    const side = leftOf(fwd);
    const d = startBlockDims(el.dims.padSize);
    const fill = selected ? C.selected : '#c4a06a';
    const foam = selected ? C.selected : '#3a3a3a';
    for (let i = 0; i < n; i += 1) {
      const off = (i - (n - 1) / 2) * el.dims.spacing;
      const cx = el.position.x + side.x * off;
      const cy = el.position.y + side.y * off;
      this.fillWorldRect(ctx, cx, cy, fwd, side, d.railLen / 2, d.spanAcross / 2, 'rgba(122, 82, 48, 0.35)');
      for (const s of [-1, 1]) {
        const rx = cx + side.x * s * d.railX;
        const ry = cy + side.y * s * d.railX;
        this.fillWorldRect(ctx, rx, ry, fwd, side, d.railLen / 2, d.railW / 2, foam);
        this.fillWorldRect(ctx, rx, ry, fwd, side, d.railLen / 2, d.railW * 0.28, fill);
      }
      const bx = cx - fwd.x * (d.railLen / 2 - d.braceT);
      const by = cy - fwd.y * (d.railLen / 2 - d.braceT);
      this.fillWorldRect(ctx, bx, by, fwd, side, d.braceT, (d.gap + 2 * d.railW) / 2, fill);
    }

    const c = this.toScreen(el.position);
    const u = yawVector(el.yaw);
    const len = 34;
    ctx.strokeStyle = C.start;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + u.x * len, c.y - u.y * len);
    ctx.stroke();
    arrowHead(ctx, c.x + u.x * len, c.y - u.y * len, Math.atan2(-u.y, u.x), 7, C.start);
  }

  fillWorldRect(ctx, cx, cy, fwd, side, halfAlong, halfAcross, colour) {
    const pts = [
      { x: cx + fwd.x * halfAlong + side.x * halfAcross, y: cy + fwd.y * halfAlong + side.y * halfAcross },
      { x: cx + fwd.x * halfAlong - side.x * halfAcross, y: cy + fwd.y * halfAlong - side.y * halfAcross },
      { x: cx - fwd.x * halfAlong - side.x * halfAcross, y: cy - fwd.y * halfAlong - side.y * halfAcross },
      { x: cx - fwd.x * halfAlong + side.x * halfAcross, y: cy - fwd.y * halfAlong + side.y * halfAcross },
    ].map((p) => this.toScreen(p));
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
  }

  drawLabel(ctx, el, selected) {
    const c = this.toScreen(el.position);
    const px = Math.max(9, el.dims.textHeight * this.cam.scale);
    ctx.font = `${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = selected ? C.selected : C.label;
    ctx.fillText(el.text || 'Label', c.x, c.y);
    if (selected) {
      const w = ctx.measureText(el.text || 'Label').width;
      ctx.strokeStyle = C.selected;
      ctx.lineWidth = 1;
      ctx.strokeRect(c.x - w / 2 - 4, c.y - px * 0.7, w + 8, px * 1.4);
    }
  }

  drawNumbers(ctx, el, numbers, selected) {
    if (!numbers.length) {
      return;
    }
    const c = this.toScreen(el.position);
    /* Stacked upward when a structure carries more than one, so a ladder
     * flown twice shows both of its positions. */
    numbers.forEach((n, i) => {
      const y = c.y - 16 - i * 19;
      ctx.beginPath();
      ctx.arc(c.x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = selected ? C.numberBgSel : C.numberBg;
      ctx.fill();
      ctx.fillStyle = C.number;
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n.number), c.x, y + 0.5);
      const levels = aperturesOf(el);
      if (levels.length > 1) {
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = C.numberBg;
        ctx.textAlign = 'left';
        ctx.fillText(figureCue(this.host.doc, el, n.seq) || `L${(n.apertureIndex ?? 0) + 1}`, c.x + 12, y + 0.5);
      }
    });
  }

  drawHandle(ctx) {
    const h = this.handlePos();
    if (!h) {
      return;
    }
    const ids = [...this.host.selection];
    const el = elementById(this.host.doc, ids[0]);
    const c = this.toScreen(el.position);
    const p = this.toScreen(h);
    ctx.strokeStyle = C.selected;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_PX, 0, Math.PI * 2);
    ctx.fillStyle = C.selected;
    ctx.fill();
    /* The handle says it snaps to the compass, on the handle, so a building
     * that will not turn to 40 degrees is never a mystery. */
    if (turnsOf(el.type) === 'quarter') {
      ctx.font = '600 10px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.selected;
      ctx.fillText('90° steps', p.x + HANDLE_PX + 4, p.y);
    }
  }

  drawBand(ctx) {
    if (!this.band) {
      return;
    }
    const a = this.toScreen(this.band.from);
    const b = this.toScreen(this.band.to);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    ctx.fillStyle = C.band;
    ctx.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.strokeStyle = C.bandEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  }

  /* The armed palette tool, drawn under the cursor before it is placed. */
  drawGhost(ctx) {
    if (!this.host.armed || !this.pointer) {
      return;
    }
    const at = this.host.snap(this.pointer, false);
    const p = this.toScreen(at);
    const def = ELEMENTS[this.host.armed];
    if (def.kind === KIND.ROAD || def.kind === KIND.VEHICLE) {
      this.drawTrafficGhost(ctx, def, at, p);
      return;
    }
    ctx.strokeStyle = C.ghost;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.stroke();
    /* A freestyle asset shows the ground it will take before it is placed,
     * at the heading it will be placed at, because a warehouse is twenty six
     * metres across and a circle under the cursor says nothing about that. */
    if (def.kind === KIND.STRUCTURE || def.kind === KIND.ZONE) {
      const ghost = {
        type: def.id,
        style: def.styles ? def.styles[0] : undefined,
        dims: { ...def.dims, ...(def.styles ? styleDims(def.id, def.styles[0]) ?? {} : {}) },
        position: { x: at.x, y: at.y, z: 0 },
        yaw: typeof this.host.newYawFor === 'function' ? this.host.newYawFor(def.id) : 0,
        pitch: 0,
      };
      const poly = planShapeOf(ghost).map((q) => this.toScreen(q));
      ctx.beginPath();
      poly.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
      ctx.closePath();
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = C.ghost;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${def.label}  ${round1(at.x)}, ${round1(at.y)} m`, p.x + 18, p.y);
  }

  /*
   * The road tool and the vehicle under the cursor. The road tool says what
   * the next click does. A vehicle shows the car on the road it would go
   * on, at the point it would start and facing the way it would drive, or
   * says there is no road near enough.
   */
  drawTrafficGhost(ctx, def, at, p) {
    let text;
    if (def.kind === KIND.ROAD) {
      const nodes = this.host.roadDraft ?? [];
      const raw = this.pointer;
      if (!nodes.length) {
        text = 'Road: click to lay its first node';
      } else if (closesDraft(nodes, raw.x, raw.y, NODE_PX / this.cam.scale)) {
        text = 'Click to close the loop';
      } else {
        text = `Node ${nodes.length + 1}. Enter or double click finishes, Esc cancels`;
      }
      ctx.strokeStyle = C.ghost;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const snap = snapToRoad(this.host.doc, this.pointer.x, this.pointer.y, SNAP_PX / this.cam.scale);
      const start = snap ? vehicleStart(this.host.doc, {
        type: 'vehicle', road: snap.road, dims: { offset: snap.offset }, style: 'kei', reverse: snap.twoLaneLoop && snap.right,
      }) : null;
      if (start) {
        this.paintCar(ctx, start, { fill: 'rgba(255, 212, 92, 0.18)', edge: C.ghost, width: 1.5, dashed: true, arrow: C.ghost });
        text = `Vehicle, ${snap.offset.toFixed(1)} m along the road`;
      } else {
        ctx.strokeStyle = C.ghost;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        text = 'Vehicle: click on a road';
      }
    }
    ctx.fillStyle = C.ghost;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, p.x + 18, p.y);
  }

  /*
   * The taut-string paint, the same triangles the race field stamps on
   * the pitch. Always on, so the plan and the flown course agree about
   * which side of a flag the quad goes.
   */
  drawGuidePaint(ctx, path) {
    /* Same class the 3D preview and the race field read, for the same
     * reason: a whoop track's paint is sized against a 0.711 m gate. */
    const cls = trackClassOf(this.host.doc);
    const tris = tessellateGuide(guideFromKnots(knotsFromPath(path, cls), cls));
    if (tris.length < 3) {
      return;
    }
    ctx.fillStyle = 'rgba(255, 239, 154, 0.88)';
    ctx.beginPath();
    for (let i = 0; i < tris.length; i += 3) {
      const a = this.toScreen({ x: tris[i].x, y: tris[i].z });
      const b = this.toScreen({ x: tris[i + 1].x, y: tris[i + 1].z });
      const c = this.toScreen({ x: tris[i + 2].x, y: tris[i + 2].z });
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
    }
    ctx.fill();
  }

  drawPath(ctx, path) {
    if (path.samples.length < 2) {
      return;
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    /* A wide soft pass under a thin bright one, so the line stays readable
     * where it crosses itself. */
    for (const [width, colour] of [[7, C.pathShadow], [2.2, C.path]]) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      path.samples.forEach((s, i) => {
        const p = this.toScreen(s.pos);
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });
      ctx.stroke();
    }
    /* Direction arrows every eight metres of arc length. */
    let nextAt = 4;
    for (let i = 1; i < path.samples.length; i += 1) {
      const s = path.samples[i];
      if (s.s < nextAt) {
        continue;
      }
      nextAt = s.s + 8;
      const a = this.toScreen(path.samples[i - 1].pos);
      const b = this.toScreen(s.pos);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      arrowHead(ctx, b.x, b.y, ang, 6, C.path);
    }
    for (const k of path.knots) {
      const p = this.toScreen(k.pos);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = k.role === 'marker' ? C.entry : C.path;
      ctx.fill();
    }
  }

  hatch(ctx, poly) {
    ctx.save();
    ctx.beginPath();
    poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.clip();
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    ctx.strokeStyle = 'rgba(125, 255, 180, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let d = minX - (maxY - minY); d < maxX; d += 7) {
      ctx.moveTo(d, maxY);
      ctx.lineTo(d + (maxY - minY), minY);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------------- small helpers ---------------- */

function isRoadEl(el) {
  return ELEMENTS[el?.type]?.kind === KIND.ROAD;
}

function isVehicleEl(el) {
  return ELEMENTS[el?.type]?.kind === KIND.VEHICLE;
}

/* A road's two edges, cached by its line: roadOf hands back the same line
 * until the road changes, so a plan redrawn on every pointer move works
 * each road's edges out once an edit. */
const edgeCache = new WeakMap();

function edgesFor(line, width) {
  let hit = edgeCache.get(line);
  if (!hit || hit.width !== width) {
    hit = { width, ...edgesOf(line, width) };
    edgeCache.set(line, hit);
  }
  return hit;
}

function round1(x) {
  return Math.abs(x - Math.round(x)) < 1e-6 ? String(Math.round(x)) : x.toFixed(1);
}

function boxCorners(center, yaw, width, depth) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const hw = width / 2;
  const hd = depth / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => ({
    x: center.x + lx * c - ly * s,
    y: center.y + lx * s + ly * c,
    z: 0,
  }));
}

function polyContains(poly, p) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/* Area of a simple polygon, by the shoelace. */
function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(a) / 2;
}

function polyNear(poly, p, pad) {
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (pointSegment(p, a, b).dist <= pad) {
      return true;
    }
  }
  return false;
}

function arrowHead(ctx, x, y, angle, size, colour) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size * 1.6, -size * 0.72);
  ctx.lineTo(-size * 1.6, size * 0.72);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
}
