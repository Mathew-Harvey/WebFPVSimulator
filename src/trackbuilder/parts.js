/*
 * parts.js: the 5 inch canvas's pieces that are made of pieces.
 *
 * A wall, a hurdle (a board, or a bar on legs) and the sizes and ways it is flown, an up gate,
 * a spiral round a flag, and flags that come and go on a gate. None is an element. Each is a way of writing ordinary elements,
 * so the document holds only what it always could (gates in a group, a barrier
 * with flags, a dive gate with a tilt, waypoints) and every reader of it, the
 * game, the board, the lap GIF and the card, needs to learn nothing. See
 * TRACK-BUILDER-5IN-PLAN.md, section 4.2.
 *
 * Pure, like the builder's other data modules: no DOM, no Three.js. Every
 * function takes the document, changes it, and says what it made, so the app
 * can run one inside a single undo step and the self test can run all of them
 * in Node.
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
  ELEMENTS, KIND, FLAG_SIDES, FRAME_TUBE_OD, GATE_FLAG_H, GATE_PRESETS, applyGatePreset, apertureShapeOf, defaultDims,
  docModeOf, elementHeight, flagSideOf, flagSideSigns, isLetterPiece, canBeDecorType, isPlain, isUnbuilt, letterDimsFor,
  levelPitchFor, trackClassOf, wallPitchFor,
} from './elements.js';
import {
  apertureCenter, aperturesOf, createElement, elementById, elementNormal, entryAnchor, initLetter, kindOf, newGroupId,
  setSideBuilt,
} from './model.js';
import { addToSequence, removeFromSequence } from './sequence.js';
import { applyAutoFaces, defaultYawFor, lastAnchorOf } from './faces.js';
import { apertureFrame, wrapAngle } from './geometry.js';
import { runGhosts } from './runs.js';
import { placeOnTrack, placementFor } from './snap.js';
import { openingCount, primaryOpening } from '../props/letters.js';
import { GATE_SCALE } from '../units.js';
import { GATE_BANNER_H } from '../art/banners.js';

/* ------------------------------------------------------------------ */
/* Flags, as one choice                                                */
/* ------------------------------------------------------------------ */

/*
 * A gate and a flagged gate are two types, a double stack and a flagged double
 * likewise, so "flags: none, left, right, both, top" is a change of type where
 * it must be and a change of side where it need not be. Everything else about
 * the piece, its place, its heading, its size, its group and its flying order,
 * stays, because the type is the only thing that differs.
 */
const FLAGGED_TWIN = { gate: 'flaggedGate', doubleStack: 'flaggedDoubleStack' };
const PLAIN_TWIN = { flaggedGate: 'gate', flaggedDoubleStack: 'doubleStack' };

export const FLAG_CHOICES = ['none', ...FLAG_SIDES];

/* Whether a piece can carry flags at all, and so whether the chips are offered. A tower, a dive
 * gate and a ladder have no flagged twin; a barrier may carry them as a hurdle does. */
export function canFlag(el) {
  if (!el) {
    return false;
  }
  return Boolean(FLAGGED_TWIN[el.type] || PLAIN_TWIN[el.type] || ELEMENTS[el.type]?.flagsOptional);
}

/* Which of the choices the piece has now. */
export function flagsOf(el) {
  if (!canFlag(el)) {
    return 'none';
  }
  if (PLAIN_TWIN[el.type] || ELEMENTS[el.type]?.flagSide) {
    return FLAG_SIDES.includes(el.flagSide) ? el.flagSide : (ELEMENTS[el.type].flagSide ?? 'left');
  }
  if (FLAGGED_TWIN[el.type]) {
    return 'none';
  }
  return FLAG_SIDES.includes(el.flagSide) ? el.flagSide : 'none';
}

/*
 * Put the flags on a piece as chosen. Returns true when the document changed. 'none' on a flagged
 * piece makes it the plain type; a side on a plain gate makes it the flagged type; a side on a
 * flagged piece moves the pennant. A hurdle (a barrier) gains or loses `flagSide` and the mast
 * height beside it, both written only while it has flags.
 */
export function setFlags(doc, id, choice) {
  const el = elementById(doc, id);
  if (!el || !canFlag(el) || !FLAG_CHOICES.includes(choice)) {
    return false;
  }
  if (ELEMENTS[el.type].flagsOptional) {
    if (choice === 'none') {
      if (el.flagSide === undefined) {
        return false;
      }
      delete el.flagSide;
      delete el.dims.flagH;
      return true;
    }
    if (el.flagSide === choice) {
      return false;
    }
    el.flagSide = choice;
    if (!(el.dims.flagH > 0)) {
      el.dims.flagH = HURDLE.flagH;
    }
    return true;
  }
  if (choice === 'none') {
    const plain = PLAIN_TWIN[el.type];
    if (!plain) {
      return false;
    }
    el.type = plain;
    delete el.flagSide;
    delete el.dims.flagH;
    return true;
  }
  const flagged = FLAGGED_TWIN[el.type] ?? (PLAIN_TWIN[el.type] ? el.type : null);
  if (!flagged) {
    return false;
  }
  if (el.type === flagged && el.flagSide === choice) {
    return false;
  }
  el.type = flagged;
  el.flagSide = choice;
  if (!(el.dims.flagH > 0)) {
    el.dims.flagH = GATE_FLAG_H;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* The wall                                                            */
/* ------------------------------------------------------------------ */

/* Two to six bays, three when it is only clicked. */
export const WALL_MIN = 2;
export const WALL_MAX = 6;
export const WALL_DEFAULT = 3;

const unit = (v) => {
  const d = Math.hypot(v.x, v.y);
  return d > 1e-9 ? { x: v.x / d, y: v.y / d } : { x: 1, y: 0 };
};

/*
 * WHAT A DRAG ALONG THE GROUND IS AS A WALL: from where it started to where it
 * ended, the bays standing end to end in between, each facing across the wall.
 * Returns { count, dir, pitch, yaw, items: [{ x, y, yaw }] }, the first bay
 * beside where the drag began. Pure, so the ghost that follows the drag and
 * the gates that are placed are one answer.
 *
 * THE COUNT is the drag's length over the pitch, two at the least and six at the
 * most, and three for a click, which is the wall a person means by clicking, laid
 * east and west across the spot. A dragged wall starts AT the first point and runs
 * towards the second, so a wall is dragged from its first post to its last, which
 * is how a plan dimensions it.
 *
 * THE DIRECTION is the drag's, put on the nearest fifteen degrees, so a wall is
 * square to the compass when the drag is nearly so.
 *
 * THE PITCH is the world's (wallPitchFor): the uprights meet where the game builds
 * them, and the builder shows document sizes, so in the builder the bays show a
 * small gap the world does not have.
 *
 * WHICH WAY THEY FACE. Across the wall there are two ways, and the one that
 * points the way the course is heading, from the last place it has been to the
 * middle of the wall, is taken. With nothing before it, north or east.
 */
export function wallPlan(doc, a, b, opts = {}) {
  const dims = opts.dims ?? defaultDims('gate', trackClassOf(doc));
  const pitch = opts.pitch ?? wallPitchFor(dims, trackClassOf(doc));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  let dir = { x: 1, y: 0 };
  if (len > 1e-6) {
    const step = opts.square ? Math.PI / 2 : Math.PI / 12;
    const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
    dir = opts.free ? unit({ x: dx, y: dy }) : { x: Math.cos(snapped), y: Math.sin(snapped) };
  }
  const click = len < pitch * 0.5;
  const count = click
    ? WALL_DEFAULT
    : Math.max(WALL_MIN, Math.min(WALL_MAX, Math.round(len / pitch)));
  /* A click is the middle of the wall; a drag is where it begins. */
  const start = click
    ? { x: a.x - dir.x * pitch * count * 0.5, y: a.y - dir.y * pitch * count * 0.5 }
    : { x: a.x, y: a.y };
  const centre = {
    x: start.x + dir.x * pitch * count * 0.5,
    y: start.y + dir.y * pitch * count * 0.5,
  };
  const n1 = { x: -dir.y, y: dir.x };
  const n2 = { x: dir.y, y: -dir.x };
  let across = n1.x + n1.y > 0 ? n1 : n2;
  const last = lastAnchorOf(doc);
  if (last) {
    const h = { x: centre.x - last.pos.x, y: centre.y - last.pos.y };
    const d1 = n1.x * h.x + n1.y * h.y;
    const d2 = n2.x * h.x + n2.y * h.y;
    if (Math.abs(d1 - d2) > 1e-9) {
      across = d1 > d2 ? n1 : n2;
    } else {
      /* The wall is straight on from the last place the course was, so the line to it says nothing about which way
       * to go through it. The way the course LEFT that place does: it went round, and comes at the wall from the side
       * it left towards, so the first bay is flown the other way. */
      const out = exitOf(doc, last);
      const side = out ? out.x * n1.x + out.y * n1.y : 0;
      if (Math.abs(side) > 0.2) {
        across = side > 0 ? n2 : n1;
      }
    }
  }
  const yaw = wrapAngle(Math.atan2(across.y, across.x));
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push({
      x: start.x + dir.x * pitch * (i + 0.5),
      y: start.y + dir.y * pitch * (i + 0.5),
      yaw,
    });
  }
  return {
    count, dir, pitch, yaw, items,
  };
}

/* The way the course leaves an anchor on the ground, as a unit vector, or null when it leaves it no way in particular
 * (a marker, a waypoint, the start pads): a gate leaves the way it is flown. */
function exitOf(doc, anchor) {
  const seq = anchor && anchor.seq;
  const el = seq ? elementById(doc, seq.elementId) : null;
  if (!el || kindOf(el) !== KIND.APERTURE || !seq.entry) {
    return null;
  }
  const n = elementNormal(el);
  const d = unit({ x: n.x * seq.entry, y: n.y * seq.entry });
  return Math.hypot(n.x, n.y) > 1e-6 ? d : null;
}

/* The width axis of a gate, the way apertureFrame says it: the way its uprights are apart. */
function widthOf(el) {
  const f = apertureFrame(el.yaw, 0);
  return { x: f.widthAxis.x, y: f.widthAxis.y };
}

/*
 * LAY THE WALL: ordinary gates in one group, in the plain dress, the upright each
 * shares with the bay before it left out, each joined to the flying order in bay
 * order, so a wall is dragged in the order it is flown. Returns the new ids in
 * that order.
 *
 * opts: dims (the gate size), flags ('none', 'first', 'last' or 'both': which end
 * bays carry a pennant, in drag order, on their outer side), weave (true: the
 * passes alternate, a slalom through the bays; false: every pass the same way),
 * join (false: put nothing in the flying order).
 *
 * THE PASSES ARE SET, not left to be worked out. The chord between two bays is
 * square to both, which is the one case the face rule cannot read a direction
 * from, and a wall flown through is the case it is built for. They are marked as
 * set by hand, so moving a bay later does not turn it round.
 */
export function placeWall(doc, a, b, opts = {}) {
  const cls = trackClassOf(doc);
  const dims = { ...(opts.dims ?? defaultDims('gate', cls)) };
  const plan = wallPlan(doc, a, b, { ...opts, dims });
  const group = newGroupId(doc);
  const flags = opts.flags ?? 'none';
  const ids = [];
  plan.items.forEach((it, i) => {
    const el = createElement(doc, 'gate', { x: it.x, y: it.y, z: 0 }, it.yaw);
    Object.assign(el.dims, dims);
    el.dims.levels = 1;
    el.yawOverridden = true;
    el.style = 'plain';
    el.group = group;
    el.name = `Bay ${i + 1}`;
    doc.elements.push(el);
    ids.push(el.id);
  });
  ids.forEach((id, i) => {
    const el = elementById(doc, id);
    const w = widthOf(el);
    /* The upright facing the bay before it is the one before it already has. */
    if (i > 0) {
      setSideBuilt(doc, id, w.x * -plan.dir.x + w.y * -plan.dir.y > 0 ? 'right' : 'left', false);
    }
    /* A pennant on an end bay stands on its outer upright. Outer is away from the rest of the wall:
     * back along the drag for the first bay, on along it for the last. */
    const end = (i === 0 && (flags === 'first' || flags === 'both'))
      ? -1
      : ((i === ids.length - 1 && (flags === 'last' || flags === 'both')) ? 1 : 0);
    if (end !== 0) {
      const side = w.x * plan.dir.x * end + w.y * plan.dir.y * end > 0 ? 'right' : 'left';
      setFlags(doc, id, side);
    }
  });
  if (opts.join !== false) {
    ids.forEach((id, i) => {
      const seq = addToSequence(doc, id, 0);
      if (seq) {
        seq.entry = opts.weave === false || i % 2 === 0 ? 1 : -1;
        seq.overridden = true;
      }
    });
    applyAutoFaces(doc);
  }
  return ids;
}

/* The bays of the wall a gate stands in, in the order along it, or just the gate when it is on its own. */
export function wallBays(doc, id) {
  const el = elementById(doc, id);
  if (!el) {
    return [];
  }
  const bays = el.group ? doc.elements.filter((e) => e.group === el.group && kindOf(e) === KIND.APERTURE) : [el];
  if (bays.length < 2) {
    return bays;
  }
  const w = widthOf(bays[0]);
  return [...bays].sort((p, q) => (p.position.x * w.x + p.position.y * w.y) - (q.position.x * w.x + q.position.y * w.y));
}

/*
 * WHAT A GATE IS A BAY OF. A wall is gates in one group in the plain dress, laid
 * by placeWall, so a group of two or more is one: { ids, dir } with the bays in the
 * order they were dragged out (which is the order of the document, and the order
 * they were first flown in), and `dir` the unit step from one to the next. Null for
 * a gate that is on its own, for anything that is not a gate, and for a group that
 * is not a row of plain bays (a cube is a group too, and is not a wall).
 */
export function wallOf(doc, id) {
  const el = elementById(doc, id);
  if (!el || !el.group) {
    return null;
  }
  const bays = doc.elements.filter((e) => e.group === el.group);
  if (bays.length < 2 || !bays.every((b) => kindOf(b) === KIND.APERTURE && isPlain(b))) {
    return null;
  }
  const dir = unit({
    x: bays[bays.length - 1].position.x - bays[0].position.x,
    y: bays[bays.length - 1].position.y - bays[0].position.y,
  });
  return { ids: bays.map((b) => b.id), dir };
}

/* The side an end bay's outer upright is on, as the bay's own left or right: away from the rest of the wall. */
function outerSide(doc, wall, end) {
  const el = elementById(doc, wall.ids[end === 'first' ? 0 : wall.ids.length - 1]);
  const w = widthOf(el);
  const out = end === 'first' ? -1 : 1;
  return w.x * wall.dir.x * out + w.y * wall.dir.y * out > 0 ? 'right' : 'left';
}

/* Which ends of a wall carry a pennant on their outer upright: 'none', 'first', 'last' or 'both', the first being the
 * bay it was dragged from. */
export function wallFlagsOf(doc, id) {
  const wall = wallOf(doc, id);
  if (!wall) {
    return 'none';
  }
  const has = (end) => {
    const el = elementById(doc, wall.ids[end === 'first' ? 0 : wall.ids.length - 1]);
    return canFlag(el) && flagsOf(el) === outerSide(doc, wall, end) && el.type !== 'gate';
  };
  const a = has('first');
  const b = has('last');
  return a && b ? 'both' : (a ? 'first' : (b ? 'last' : 'none'));
}

/* Put the pennants on a wall's ends as chosen. Returns true when the document changed. */
export function setWallFlags(doc, id, which) {
  const wall = wallOf(doc, id);
  if (!wall || !['none', 'first', 'last', 'both'].includes(which)) {
    return false;
  }
  let changed = false;
  for (const end of ['first', 'last']) {
    const bay = elementById(doc, wall.ids[end === 'first' ? 0 : wall.ids.length - 1]);
    const wanted = which === 'both' || which === end;
    changed = setFlags(doc, bay.id, wanted ? outerSide(doc, wall, end) : 'none') || changed;
  }
  return changed;
}

/*
 * THE SIZE OF A WALL'S BAYS, as a gate preset (Standard, Wide, Championship, Trainer): every bay takes the
 * preset's opening, and the bays are laid again at the new pitch from where the first bay's outer upright
 * stood, so the wall grows or shrinks along itself and its first post does not move. Returns true when it
 * changed. A preset this canvas does not offer is refused.
 */
export function setWallSize(doc, id, presetId) {
  const wall = wallOf(doc, id);
  const preset = GATE_PRESETS.find((p) => p.id === presetId && p.id !== 'whoop');
  if (!wall || !preset) {
    return false;
  }
  const bays = wall.ids.map((bay) => elementById(doc, bay));
  const before = wallPitchFor(bays[0].dims, trackClassOf(doc));
  const next = { ...bays[0].dims };
  applyGatePreset(next, preset);
  if (Math.abs(next.clearW - bays[0].dims.clearW) < 1e-9 && Math.abs(next.clearH - bays[0].dims.clearH) < 1e-9) {
    return false;
  }
  const pitch = wallPitchFor(next, trackClassOf(doc));
  const start = {
    x: bays[0].position.x - wall.dir.x * before * 0.5,
    y: bays[0].position.y - wall.dir.y * before * 0.5,
  };
  bays.forEach((bay, i) => {
    Object.assign(bay.dims, { clearW: next.clearW, clearH: next.clearH, levelPitch: next.levelPitch });
    bay.position.x = Math.round((start.x + wall.dir.x * pitch * (i + 0.5)) * 1e6) / 1e6;
    bay.position.y = Math.round((start.y + wall.dir.y * pitch * (i + 0.5)) * 1e6) / 1e6;
  });
  applyAutoFaces(doc);
  return true;
}

/* Which preset a wall's bays are, or '' when they are a size of their own. */
export function wallSizeOf(doc, id) {
  const wall = wallOf(doc, id);
  if (!wall) {
    return '';
  }
  const d = elementById(doc, wall.ids[0]).dims;
  const hit = GATE_PRESETS.find((p) => p.id !== 'whoop' && Math.abs(p.clearW - d.clearW) < 1e-6);
  return hit ? hit.id : '';
}

/* The passes of a wall's bays, in the order they are flown. */
function wallPasses(doc, wall) {
  const own = new Set(wall.ids);
  return doc.sequence.filter((q) => own.has(q.elementId));
}

/* Whether a wall is flown as a slalom: the passes alternate, every bay the other way to the one before. */
export function wallIsWoven(doc, id) {
  const wall = wallOf(doc, id);
  if (!wall) {
    return false;
  }
  const flown = wallPasses(doc, wall);
  return flown.length > 1 && flown.every((q, i) => i === 0 || q.entry !== flown[i - 1].entry);
}

/* A wall flown as a slalom or straight through, the first bay flown the way it was. Returns true when it changed. */
export function setWallWeave(doc, id, woven) {
  const wall = wallOf(doc, id);
  if (!wall) {
    return false;
  }
  const flown = wallPasses(doc, wall);
  if (!flown.length) {
    return false;
  }
  const first = flown[0].entry === -1 ? -1 : 1;
  let changed = false;
  flown.forEach((q, i) => {
    const wanted = woven && i % 2 === 1 ? -first : first;
    if (q.entry !== wanted || !q.overridden) {
      q.entry = wanted;
      q.overridden = true;
      changed = true;
    }
  });
  if (changed) {
    applyAutoFaces(doc);
  }
  return changed;
}

/* Fly a wall the other way: every pass through its bays turned round. */
export function reverseWall(doc, id) {
  const wall = wallOf(doc, id);
  if (!wall) {
    return false;
  }
  const flown = wallPasses(doc, wall);
  for (const q of flown) {
    q.entry = q.entry === -1 ? 1 : -1;
    q.overridden = true;
  }
  if (flown.length) {
    applyAutoFaces(doc);
  }
  return flown.length > 0;
}

/* ------------------------------------------------------------------ */
/* The hurdle                                                          */
/* ------------------------------------------------------------------ */

/*
 * A board at least a metre high, four metres from flag to flag, flown over. The
 * numbers are the plan's rules box: "The hurdle is to be a minimum of 1m high. The
 * gap between the two flags of the hurdle is to be 4m." The board is a barrier
 * with flags, thin so a quad that clips it is not stopped by half a metre of
 * nothing in front of it, and the line passes a metre over its top.
 */
export const HURDLE = {
  width: 4, depth: 0.1, height: 1, flagH: 2,
};
export const HURDLE_LINE_OVER = 1;

/* The way a hurdle is turned at a spot: the board runs across the course, a quarter turn from the way it goes,
 * on the nearest fifteen degrees. */
function hurdleYaw(doc, at, square = false) {
  const last = lastAnchorOf(doc);
  const course = last
    ? Math.atan2(at.y - last.pos.y, at.x - last.pos.x)
    : 0;
  const step = square ? Math.PI / 2 : Math.PI / 12;
  return wrapAngle(Math.round((course + Math.PI / 2) / step) * step);
}

/*
 * PUT A HURDLE DOWN: the board, turned square to the line the course is on, with a
 * flag at each end, and a waypoint over the middle of it in the flying order, which
 * is what makes the lap go over the hurdle and not through it. A hurdle is not a
 * gate and nothing scores on it, so the waypoint is a point the line is held to and
 * not a station. Returns { id, waypointId }, the waypoint's null when it was not
 * joined to the order (opts.join false).
 */
export function placeHurdle(doc, at, opts = {}) {
  const yaw = hurdleYaw(doc, at, opts.square);
  const el = createElement(doc, 'barrier', { x: at.x, y: at.y, z: 0 }, yaw);
  Object.assign(el.dims, { width: HURDLE.width, depth: HURDLE.depth, height: HURDLE.height });
  el.flagSide = opts.flags ?? 'both';
  el.dims.flagH = HURDLE.flagH;
  el.yawOverridden = true;
  el.name = 'Hurdle';
  doc.elements.push(el);
  /* Another size than the plan's, which is what a hurdle was before there were sizes: the same piece, then resized. */
  if (opts.size && opts.size !== 'plan') {
    setHurdleSize(doc, el.id, opts.size);
  }
  let waypointId = null;
  if (opts.join !== false) {
    const wp = createElement(doc, 'waypoint', { x: at.x, y: at.y, z: HURDLE.height + HURDLE_LINE_OVER }, 0);
    wp.name = 'Over the hurdle';
    doc.elements.push(wp);
    addToSequence(doc, wp.id, 0);
    waypointId = wp.id;
    applyAutoFaces(doc);
    if (opts.size && opts.size !== 'plan') {
      setHurdleLine(doc, el.id, 'over');
    }
  }
  return { id: el.id, waypointId };
}

/*
 * FLY OVER A HURDLE: a waypoint a metre above the middle of its board, added to the end of the flying
 * order, which is what makes a lap go over a hurdle that was put down without one (or that was put down
 * and then had its waypoint taken out of the order). Returns { id, waypointId }, or null when the piece
 * is not a barrier. A hurdle that is already flown over at its middle is flown over again, as a gate
 * flown twice is.
 */
export function flyOver(doc, id) {
  const el = elementById(doc, id);
  if (!el || !canFlyOver(el)) {
    return null;
  }
  const top = hurdleTop(el) + HURDLE_LINE_OVER;
  const wp = createElement(doc, 'waypoint', { x: el.position.x, y: el.position.y, z: top }, 0);
  wp.name = `Over the ${overName(el)}`;
  doc.elements.push(wp);
  addToSequence(doc, wp.id, 0);
  applyAutoFaces(doc);
  return { id: el.id, waypointId: wp.id };
}

/* ------------------------------------------------------------------ */
/* The hurdle family                                                   */
/* ------------------------------------------------------------------ */

/*
 * HURDLES COME IN A FEW SIZES, and are flown a few ways. The owner's catalogue: a hurdle 10 ft by 5 ft, flown over, under,
 * skimmed or at 45 degrees; an h-hurdle; a super hurdle. MultiGP's course book gives the first two: the standard
 * hurdle is a panel 10 ft wide and 5 ft tall, and the h-hurdle is that hurdle with a gate leg panel on top, a pole
 * rising another 5 ft from one end. The pole is the hurdle's own flag mast, one end only and tall, so an h-hurdle is
 * a hurdle with a flag on one side and a mast 10 ft high, and nothing in the document is new. The super hurdle is
 * "just like the hurdle but massive", with no figure given anywhere I could find, so it is twice the standard one, the
 * assumption written here and in the plan, and its width and height are the dimension fields' to change.
 *
 * `flagSide` null is no flags, which is the standard hurdle: its panel has pole pockets and nothing else. The plan's
 * hurdle is the 2026 Nationals' own, four metres between its flags, and stays the default.
 */
export const HURDLE_SIZES = [
  {
    id: 'plan', label: 'Nationals', width: 4, height: 1, flagSide: 'both', flagH: 2,
    hint: 'The Drone Nationals plan’s hurdle: a board 4 m between its flags and 1 m high.',
  },
  {
    id: 'multigp', label: '10 x 5 ft', width: 3.048, height: 1.524, flagSide: null, flagH: 2,
    hint: 'MultiGP’s hurdle: a panel 10 ft wide and 5 ft tall.',
  },
  {
    id: 'h', label: 'h-hurdle', width: 3.048, height: 1.524, flagSide: 'left', flagH: 3.048,
    hint: 'The 10 by 5 ft hurdle with a pole another 5 ft tall standing on one end: the line goes over the board and round the pole.',
  },
  {
    id: 'super', label: 'Super', width: 6.096, height: 3.048, flagSide: null, flagH: 2,
    hint: 'A supersized hurdle, twice the standard one, 20 ft wide and 10 ft tall: the lap has to climb to clear it. MultiGP gives no figure for it, so this is twice the hurdle; the dimensions are in the details.',
  },
];

/* The ways a hurdle is flown, as how far above its top the line goes (under has no clearance: it goes beneath). */
export const HURDLE_LINES = [
  { id: 'over', label: 'Over', clear: HURDLE_LINE_OVER, hint: 'A metre above the top, a hop over it with room to spare' },
  { id: 'skim', label: 'Skim', clear: 0.3, hint: 'A hand above the top: as low as it can be flown without touching it' },
  { id: 'under', label: 'Under', clear: null, hint: 'Beneath the bar, between its legs. Only a bar hurdle has anything to go under' },
];

/* What a hurdle can be: a board on the ground, or a bar on two legs. */
export const HURDLE_TYPES = ['barrier', 'horizontalPole'];

/* The bar of a bar hurdle, its width, its height off the ground and how thick it is: 10 ft by 5 ft, one inch and a half of pipe. */
export const BAR_HURDLE = { width: 3.048, height: 1.524, thick: 0.045 };

/* How high the top of a hurdle is: a board's height, or a bar's height off the ground and half its thickness. */
export function hurdleTop(el) {
  if (el.type === 'horizontalPole') {
    return (el.position?.z ?? BAR_HURDLE.height) + (el.dims.height ?? BAR_HURDLE.thick) / 2;
  }
  /* A gate is flown over by the top of its frame, however high it stands. */
  if (ELEMENTS[el.type]?.kind === KIND.APERTURE) {
    return (el.position?.z ?? 0) + elementHeight(ELEMENTS[el.type], el.dims);
  }
  return el.dims.height ?? HURDLE.height;
}

/* What can be flown over, and has the line over it chosen: a hurdle, or a gate the lap hops over rather than through. */
export function canFlyOver(el) {
  return Boolean(el) && (HURDLE_TYPES.includes(el.type) || ELEMENTS[el.type]?.kind === KIND.APERTURE);
}

/* What the line over a piece calls it. */
function overName(el) {
  if (el.type === 'horizontalPole') {
    return 'bar';
  }
  return ELEMENTS[el.type]?.kind === KIND.APERTURE ? 'gate' : 'hurdle';
}

const HURDLE_LINE_NAME = /^(Over|Skim|Under) the (hurdle|bar|gate)$/;

/* The waypoint that is the line over (or under) a hurdle: at its middle, named for how it goes. */
function hurdleWaypoint(doc, el) {
  for (const q of doc.sequence) {
    const wp = elementById(doc, q.elementId);
    if (wp && wp.type === 'waypoint' && HURDLE_LINE_NAME.test(wp.name)
      && Math.hypot(wp.position.x - el.position.x, wp.position.y - el.position.y) < 0.05) {
      return wp;
    }
  }
  return null;
}

/* How a hurdle is flown now: 'over', 'skim', 'under', or null when nothing puts the lap there. */
export function hurdleLineOf(doc, id) {
  const el = elementById(doc, id);
  const wp = el ? hurdleWaypoint(doc, el) : null;
  return wp ? HURDLE_LINE_NAME.exec(wp.name)[1].toLowerCase() : null;
}

/* Which size a hurdle is, or null when it has been changed from all of them. */
export function hurdleSizeOf(el) {
  if (!el || !HURDLE_TYPES.includes(el.type)) {
    return null;
  }
  const near = (a, b) => Math.abs(a - b) < 0.01;
  if (el.type === 'horizontalPole') {
    if (near(el.dims.width, BAR_HURDLE.width) && near(el.position.z, BAR_HURDLE.height)) {
      return 'multigp';
    }
    return near(el.dims.width, 2 * BAR_HURDLE.width) && near(el.position.z, 2 * BAR_HURDLE.height) ? 'super' : null;
  }
  const flags = FLAG_SIDES.includes(el.flagSide) ? el.flagSide : null;
  const found = HURDLE_SIZES.find((h) => near(el.dims.width, h.width) && near(el.dims.height, h.height)
    && flags === h.flagSide && (flags === null || near(el.dims.flagH ?? 0, h.flagH)));
  return found ? found.id : null;
}

/*
 * RESIZE A HURDLE to one of the sizes, in place: its board and its flags, and the line over it, which is put at the height
 * it had above the old top, so that a hurdle made taller is still flown over and not through. A bar is resized by its width
 * and its height off the ground, 'multigp' or 'super'. Returns whether it changed.
 */
export function setHurdleSize(doc, id, sizeId) {
  const el = elementById(doc, id);
  const size = HURDLE_SIZES.find((h) => h.id === sizeId);
  if (!el || !size || !HURDLE_TYPES.includes(el.type)) {
    return false;
  }
  const line = hurdleLineOf(doc, id);
  if (el.type === 'horizontalPole') {
    if (sizeId !== 'multigp' && sizeId !== 'super') {
      return false;
    }
    const k = sizeId === 'super' ? 2 : 1;
    el.dims.width = BAR_HURDLE.width * k;
    el.position.z = BAR_HURDLE.height * k;
  } else {
    el.dims.width = size.width;
    el.dims.height = size.height;
    if (size.flagSide === null) {
      delete el.flagSide;
      delete el.dims.flagH;
    } else {
      el.flagSide = size.flagSide;
      el.dims.flagH = size.flagH;
    }
  }
  if (line) {
    setHurdleLine(doc, id, line);
  }
  return true;
}

/*
 * FLY A HURDLE OVER, SKIMMED OR UNDER: the waypoint that puts the lap there is put at the height that says it, and named
 * for it, which is how it is read back. A hurdle that nothing flew gets the waypoint at the end of the lap, as flyOver gives
 * it. Under is for a bar, which has a gap beneath it, and a board on the ground has none. Returns whether it changed.
 */
export function setHurdleLine(doc, id, lineId) {
  const el = elementById(doc, id);
  const line = HURDLE_LINES.find((l) => l.id === lineId);
  if (!el || !line || !canFlyOver(el)) {
    return false;
  }
  if (line.id === 'under' && el.type !== 'horizontalPole') {
    return false;
  }
  let wp = hurdleWaypoint(doc, el);
  if (!wp) {
    const made = flyOver(doc, id);
    wp = made ? elementById(doc, made.waypointId) : null;
  }
  if (!wp) {
    return false;
  }
  const bar = el.type === 'horizontalPole';
  const underside = bar ? el.position.z - (el.dims.height ?? BAR_HURDLE.thick) / 2 : 0;
  wp.position.z = Math.round((line.id === 'under' ? underside / 2 : hurdleTop(el) + line.clear) * 1000) / 1000;
  wp.name = `${line.label} the ${overName(el)}`;
  applyAutoFaces(doc);
  return true;
}

/*
 * PUT A BAR HURDLE DOWN: a horizontal pole 10 ft wide at 5 ft up, on two legs, turned square to the line the course is
 * on, with a waypoint over the middle of it in the flying order. Under it, over it and skimming it are the card's choice
 * afterwards, which moves that waypoint (setHurdleLine). Returns { id, waypointId }.
 */
export function placeBarHurdle(doc, at, opts = {}) {
  const yaw = hurdleYaw(doc, at, opts.square);
  const el = createElement(doc, 'horizontalPole', { x: at.x, y: at.y, z: BAR_HURDLE.height }, yaw);
  Object.assign(el.dims, { width: BAR_HURDLE.width, depth: BAR_HURDLE.thick, height: BAR_HURDLE.thick });
  el.yawOverridden = true;
  el.name = 'Bar hurdle';
  doc.elements.push(el);
  const wp = createElement(doc, 'waypoint', { x: at.x, y: at.y, z: hurdleTop(el) + HURDLE_LINE_OVER }, 0);
  wp.name = 'Over the bar';
  doc.elements.push(wp);
  addToSequence(doc, wp.id, 0);
  applyAutoFaces(doc);
  return { id: el.id, waypointId: wp.id };
}

/*
 * SET A HURDLE AT AN ANGLE to the line: square across it, or turned forty five degrees one way or the other, which is
 * how a hurdle is flown on the bias. The line is the way the lap goes through the waypoint over it, from the piece before
 * (or to the one after, when it is the first). Returns whether it changed.
 */
export function setHurdleAngle(doc, id, angle) {
  const el = elementById(doc, id);
  if (!el || !HURDLE_TYPES.includes(el.type) || !['square', 'left', 'right'].includes(angle)) {
    return false;
  }
  const wp = hurdleWaypoint(doc, el);
  const at = wp ? doc.sequence.findIndex((q) => q.elementId === wp.id) : -1;
  const n = doc.sequence.length;
  let from = null;
  let to = null;
  if (at >= 0 && n > 1) {
    const before = entryAnchor(doc, doc.sequence[(at - 1 + n) % n]);
    const after = entryAnchor(doc, doc.sequence[(at + 1) % n]);
    if (before && at > 0) {
      from = before;
      to = el.position;
    } else if (after) {
      from = el.position;
      to = after;
    }
  }
  const course = from && to ? Math.atan2(to.y - from.y, to.x - from.x) : null;
  if (course === null) {
    return false;
  }
  const quarter = Math.PI / 2;
  const turn = angle === 'square' ? 0 : (angle === 'left' ? 1 : -1) * (Math.PI / 4);
  el.yaw = Math.round(wrapAngle(course + quarter + turn) * 1e6) / 1e6;
  el.yawOverridden = true;
  return true;
}

/* How a hurdle is set to the line now: 'square', 'left', 'right', or null when it is some other angle (or unflown). */
export function hurdleAngleOf(doc, id) {
  const el = elementById(doc, id);
  const wp = el ? hurdleWaypoint(doc, el) : null;
  const at = wp ? doc.sequence.findIndex((q) => q.elementId === wp.id) : -1;
  const n = doc.sequence.length;
  if (at < 0 || n < 2) {
    return null;
  }
  const before = at > 0 ? entryAnchor(doc, doc.sequence[at - 1]) : null;
  const after = entryAnchor(doc, doc.sequence[(at + 1) % n]);
  const from = before ?? el.position;
  const to = before ? el.position : after;
  if (!to) {
    return null;
  }
  const course = Math.atan2(to.y - from.y, to.x - from.x);
  /* A board and a bar are the same turned half a turn, so the angle is read modulo that. */
  const rel = ((wrapAngle(el.yaw - course - Math.PI / 2) % Math.PI) + Math.PI) % Math.PI;
  /* A hurdle is put down on the nearest fifteen degrees to square, so square is anything within half of that. */
  const slack = (7.5 * Math.PI) / 180 + 0.01;
  if (Math.min(rel, Math.PI - rel) < slack) {
    return 'square';
  }
  if (Math.abs(rel - Math.PI / 4) < slack) {
    return 'left';
  }
  return Math.abs(rel - (3 * Math.PI) / 4) < slack ? 'right' : null;
}

/* ------------------------------------------------------------------ */
/* The up gate                                                         */
/* ------------------------------------------------------------------ */

/*
 * Leaning 45 degrees, its lower edge at least 1.5 m up, flown up through: "The 'up-gate' is
 * to have an angle no greater than 45 degrees. The lower edge of the 'up-gate' is to be a
 * minimum of 1.5m high." It is a dive gate with those two numbers, so everything that reads a
 * dive gate reads this. `sillH` is the bottom of the opening before the lean, and the lean
 * lifts the lower edge no lower than that, so a sill of 1.5 m keeps the edge past the rule.
 */
export const UP_GATE = { pitch: Math.PI / 4, sillH: 1.5 };

/*
 * PUT AN UP GATE DOWN, in the flying order, flown UP: its pass is set so the quad climbs through
 * it, because the face rule reads a tilted gate from the drop to the next knot and an up gate
 * that is followed by a loop over the top and a descent would be turned into a dive gate. The
 * heading is the course's. Returns the element.
 */
export function placeUpGate(doc, at, opts = {}) {
  const el = createElement(doc, 'diveGate', { x: at.x, y: at.y, z: 0 }, 0);
  el.pitch = UP_GATE.pitch;
  el.dims.sillH = UP_GATE.sillH;
  if (opts.square) {
    /* Square to the field, and kept so: the face rule would turn it along the line again at the next edit. */
    el.yaw = Math.round(wrapAngle(Math.round(defaultYawFor(doc, at) / (Math.PI / 2)) * (Math.PI / 2)) * 1e6) / 1e6;
    el.yawOverridden = true;
  }
  doc.elements.push(el);
  const seq = addToSequence(doc, el.id, 0);
  if (seq) {
    seq.entry = 1;
    seq.overridden = true;
  }
  applyAutoFaces(doc);
  return el;
}

/* ------------------------------------------------------------------ */
/* The invisible gate                                                  */
/* ------------------------------------------------------------------ */

/*
 * AN INVISIBLE GATE IS AN OPENING WITH NOTHING BUILT ROUND IT. The owner's words: "an opening that I need to
 * fly through, like a gate, but with no gate graphics around it, this will allow me to more easily build complex
 * elements by assigning arbitrary targets that aren't framed by a gate". It is the opening and not the frame, so
 * it is the thing `unbuilt` (isUnbuilt in elements.js) already was: an aperture that scores, lights when it is
 * the next one, numbers itself in the flying order and pins the racing line, and has no pipe, no pennant and no
 * collider. Nothing new is written to the document, so every reader of one, the game, the board, the lap GIF and
 * the card, already knows how to read it.
 *
 * ANY GATE CAN BE MADE ONE and any letter, and made visible again, because the document says only `unbuilt` and
 * the two states are one flag apart. A gate that is flagged loses its pennant when it goes: a flag on a mast
 * round nothing would hang in the air. The frame it had one side at a time (unbuiltSides) goes with it, because
 * the two spellings of a missing frame mean one thing and the flag is the one that can say all four.
 *
 * A piece that is part of a group is not offered it: a cube's faces and a wall's bays share their pipe, and
 * taking one bay's frame away would take the upright the next bay stands on.
 */
export function canBeInvisible(el) {
  return Boolean(el) && kindOf(el) === KIND.APERTURE && !el.group;
}

/* Make a piece invisible, or put its frame back. Returns true when the document changed. */
export function setInvisible(doc, id, on) {
  const el = elementById(doc, id);
  if (!canBeInvisible(el)) {
    return false;
  }
  if (on) {
    if (el.unbuilt === true) {
      return false;
    }
    if (canFlag(el) && flagsOf(el) !== 'none') {
      setFlags(doc, id, 'none');
    }
    el.unbuilt = true;
    delete el.unbuiltSides;
    delete el.unbuiltPoles;
    return true;
  }
  if (el.unbuilt !== true) {
    return false;
  }
  delete el.unbuilt;
  return true;
}

/*
 * A GATE HUNG IN THE AIR, AND A GATE THAT IS ONLY THERE (isFloating and isDecor in elements.js).
 *
 * Floating takes the legs off a raised gate: it needs a height to hang at, so it is offered on a gate that is off
 * the floor, and kept if it is already set. Decor takes the gate out of the race and leaves it standing: its passes
 * are removed from the flying order (the lap and every number after it close up) and the flag is set, and turning
 * it off puts one pass back at the end of the order, where "Add to the track" would. Both return true when the
 * document changed. A cube's faces and a letter are not offered either: they are not a gate on its own.
 */
export function canBeFloating(el) {
  return Boolean(el) && kindOf(el) === KIND.APERTURE && !el.group && !isLetterPiece(el)
    && ((el.dims?.sillH ?? 0) > 0 || el.floating === true);
}

export function setFloating(doc, id, on) {
  const el = elementById(doc, id);
  if (!canBeFloating(el) || (el.floating === true) === Boolean(on)) {
    return false;
  }
  if (on) {
    el.floating = true;
  } else {
    delete el.floating;
  }
  return true;
}

export function canBeDecor(el) {
  return Boolean(el) && canBeDecorType(el.type) && !el.group && !isLetterPiece(el);
}

export function setDecor(doc, id, on) {
  const el = elementById(doc, id);
  if (!canBeDecor(el) || (el.decor === true) === Boolean(on)) {
    return false;
  }
  if (on) {
    for (const seq of doc.sequence.filter((q) => q.elementId === id)) {
      removeFromSequence(doc, seq.id);
    }
    el.decor = true;
  } else {
    delete el.decor;
    addToSequence(doc, id, 0);
  }
  return true;
}

/*
 * PUT AN INVISIBLE GATE DOWN, in the flying order, where a gate would go and facing the way a gate would face:
 * it is placed by the rule every gate is (placeOnTrack in snap.js), and then its frame is taken away. Returns the
 * element.
 */
export function placeInvisibleGate(doc, at, opts = {}) {
  const el = placeOnTrack(doc, 'gate', at, opts);
  setInvisible(doc, el.id, true);
  return el;
}

/* ------------------------------------------------------------------ */
/* Letters, from gates and back                                        */
/* ------------------------------------------------------------------ */

/*
 * A GATE THAT IS ALREADY ON THE TRACK CAN BECOME A LETTER, which is how a track is edited and not only built: a
 * course that was drawn with a gate where its W is, or an A, takes the letter in the gate's place without a gate
 * being deleted, a letter placed and the order put right. The piece keeps what is the track's and not the
 * piece's: its id (so everything that points at it, the flying order and the figure it is flown in, still
 * does), its name if the author gave it one, where it stands, which way it faces and whether that is pinned,
 * and its place in the lap. What a letter has of its own, the letter and its size, is a new letter's. A pass
 * that was through the gate's one opening is through the letter's primary hole, the one the letter is sized by,
 * which is where a new pass through a letter goes.
 *
 * Only a plain upright gate on a five inch track: a stack, a tilted gate and a round or hexagonal one have
 * shapes and passes of their own that a letter has no answer for, and the whoop canvas and a map have no
 * letters.
 */
export function canBecomeLetter(doc, el) {
  return Boolean(el) && (el.type === 'gate' || el.type === 'flaggedGate') && !el.group
    && apertureShapeOf(el) === 'square' && Math.round(el.dims.levels) === 1
    && trackClassOf(doc) !== 'micro' && docModeOf(doc) !== 'freestyle';
}

export function turnIntoLetter(doc, id, letter) {
  const el = elementById(doc, id);
  if (!canBecomeLetter(doc, el)) {
    return false;
  }
  const named = el.name && el.name !== ELEMENTS[el.type].label;
  const keep = el.name;
  el.type = 'letter';
  delete el.flagSide;
  delete el.unbuiltSides;
  delete el.unbuiltPoles;
  delete el.style;
  el.pitch = 0;
  el.position.z = 0;
  el.dims = { ...letterDimsFor(letter) };
  initLetter(el, letter);
  if (named) {
    el.name = keep;
  }
  for (const s of doc.sequence) {
    if (s.elementId === id) {
      s.apertureIndex = primaryOpening(el.letter);
    }
  }
  applyAutoFaces(doc);
  return true;
}

/*
 * A LETTER BACK INTO A GATE, standing where its primary hole is and as big as it is: the gate a letter was a
 * gap of. The gate is centred on the racing line point of the primary hole and its opening is that hole's box,
 * so a pass through it is the pass it was. A pass through any other hole of the letter has no opening left to
 * go through and is taken out of the order, as replaceWith does for a stack that becomes a gate.
 */
export function turnIntoGate(doc, id) {
  const el = elementById(doc, id);
  if (!el || !isLetterPiece(el) || el.group) {
    return false;
  }
  const primary = primaryOpening(el.letter);
  const hole = aperturesOf(el)[primary];
  const at = apertureCenter(el, primary);
  el.type = 'gate';
  delete el.letter;
  el.position = { x: at.x, y: at.y, z: 0 };
  el.pitch = 0;
  el.dims = {
    levels: 1,
    sillH: hole.sillH,
    clearW: hole.clearW,
    clearH: hole.clearH,
    levelPitch: levelPitchFor(hole.clearH),
  };
  if (el.name && /^Letter [A-Z]$/.test(el.name)) {
    el.name = '';
  }
  for (const s of [...doc.sequence]) {
    if (s.elementId !== id) {
      continue;
    }
    if ((s.apertureIndex ?? 0) === primary) {
      s.apertureIndex = 0;
    } else {
      removeFromSequence(doc, s.id);
    }
  }
  applyAutoFaces(doc);
  return true;
}

/* ------------------------------------------------------------------ */
/* Round the flag                                                      */
/* ------------------------------------------------------------------ */

/*
 * ROUND THE FLAG, AND THROUGH. The figure the 2026 Nationals qualifier flies twice: the line goes
 * round the pennant on top of one of a gate's uprights, spiralling down as it goes, and the turn
 * ends in the ONE pass through that gate. It is flown before the pass and it is not a second pass.
 * The first reading of the plan had it as a loop out of the gate, round a post and back through,
 * which is two passes; the owner's correction of 2026-10-01 was that it is a spiral down around the
 * flag and then through the gate.
 *
 * Written as ordinary waypoints in the flying order, put in straight before the pass. Waypoints are
 * what the board, the game and the line already know, they can be dragged to reshape the figure,
 * and Undo takes it away as one step.
 *
 * THE CIRCLE is round the flag where the world stands it. The field builds a gate GATE_SCALE larger
 * and does not move it, so a mast on the header stands that much further from the middle of the
 * opening than the document's does, and the circle is centred on the world's mast with the radius
 * that brings it back through the middle of the opening. It is turned so its last part runs
 * through the gate the way the pass flies it: clockwise round a flag on the right, as flown, and
 * anticlockwise round one on the left.
 *
 * WHERE IT STARTS is where the line coming from the knot before meets the circle on a tangent, so
 * the line does not turn twice. The turns are whole turns round the flag on top of that arc: one by
 * default, which is the spiral, and none, which is the line going round the flag and straight in,
 * the way the same plan's wall is entered round the flag on its end.
 *
 * HOW HIGH. A spiral starts above the gate and comes down. Every time it crosses over the opening
 * before the last, it is SPIRAL.over clear of the top of the header board as the world builds it,
 * banner and all, and the last whole turn comes down from there to the middle of the opening. Any
 * turn before that one is SPIRAL.climb higher again, so the line only ever comes down. With no turns
 * it stays at the height of the opening.
 *
 * AGAIN MAKES IT AGAIN. The waypoints the figure put in straight before the pass are taken out
 * first, so pressing the other side, or changing the turns, replaces the figure rather than adding
 * a second one in front of the first.
 */
export const SPIRAL = { turns: 1, over: 0.6, climb: 0.5 };

/* The printed sleeve on each upright of a gate in the full dress, beside which a pennant stands (view3d.js
 * buildHeaderFlags and render/scene.js, which each say 0.42). */
const SLEEVE_W = 0.42;

/* What the figure names its waypoints, which is how it finds them again and how warnings.js knows a tight circle
 * was asked for. */
export const ROUND_NAMES = {
  left: 'Spiral left', right: 'Spiral right', round: 'Round the flag', upLeft: 'Spiral up left', upRight: 'Spiral up right',
};
export const ROUND_NAME = /^(Spiral (up )?(left|right)|Round the flag)$/;
/* The two halves of that: a figure flown into a pass (spiral down, round the flag) and one flown out of it (spiral
 * up). Kept apart because the waypoints a spiral up leaves after one gate can be the very run in front of the next
 * gate's pass, and that run is not the next gate's figure. */
const ROUND_BEFORE = /^(Spiral (left|right)|Round the flag)$/;
const ROUND_AFTER = /^Spiral up (left|right)$/;

/* An arc this short is the line already coming in past the flag: a point a few degrees round is not a figure. */
const MIN_ARC = Math.PI / 12;

/*
 * WHICH SIDES OF A PASS, AS FLOWN, HAVE A FLAG TO GO ROUND: { left, right }. A pennant's left and right are as seen
 * facing the gate (elements.js flagSideSigns), which is the pilot's right and left when the gate is flown the way it
 * faces. A pennant on top stands over the opening, which no circle through the opening can go round, and a gate
 * leant past thirty degrees carries none.
 */
export function flagsAsFlown(doc, seqId) {
  const seq = doc.sequence.find((s) => s.id === seqId);
  const el = seq ? elementById(doc, seq.elementId) : null;
  if (!el || kindOf(el) !== KIND.APERTURE || Math.abs(el.pitch ?? 0) >= Math.PI / 6) {
    return { left: false, right: false };
  }
  const e = seq.entry === -1 ? -1 : 1;
  const signs = flagSideSigns(flagSideOf(el));
  return { left: signs.includes(e), right: signs.includes(-e) };
}

const mm = (v) => Math.round(v * 1000) / 1000;

/* The waypoints of the figure in front of a pass, nearest the pass last: the run of them straight before it. */
function figureBefore(doc, seq) {
  const out = [];
  for (let k = doc.sequence.indexOf(seq) - 1; k >= 0; k -= 1) {
    const w = elementById(doc, doc.sequence[k].elementId);
    if (!w || w.type !== 'waypoint' || !ROUND_BEFORE.test(w.name ?? '')) {
      break;
    }
    out.unshift(doc.sequence[k]);
  }
  return out;
}

/* The waypoints of a spiral up out of a pass, nearest the pass first: the run of them straight after it. */
function figureAfter(doc, seq) {
  const out = [];
  for (let k = doc.sequence.indexOf(seq) + 1; k < doc.sequence.length; k += 1) {
    const w = elementById(doc, doc.sequence[k].elementId);
    if (!w || w.type !== 'waypoint' || !ROUND_AFTER.test(w.name ?? '')) {
      break;
    }
    out.push(doc.sequence[k]);
  }
  return out;
}

/* The way through a pass on the ground, and the pilot's right of it. */
function travelOf(el, seq) {
  const f = apertureFrame(el.yaw, el.pitch);
  const e = seq.entry === -1 ? -1 : 1;
  const travel = unit({ x: f.normal.x * e, y: f.normal.y * e });
  return { travel, right: { x: travel.y, y: -travel.x } };
}

/*
 * THE FIGURE IN FRONT OF A PASS, so the card can show what is there rather than what the next press would make:
 * { side, spiral } or null. Which flag it goes round is read off where its waypoints are, because every point of a
 * circle round the right hand flag is on the right of the line through the gate; whether it spirals is read off
 * the names it was given.
 */
export function roundFlagOf(doc, seqId) {
  const seq = doc.sequence.find((s) => s.id === seqId);
  const el = seq ? elementById(doc, seq.elementId) : null;
  if (!el || kindOf(el) !== KIND.APERTURE) {
    return null;
  }
  const before = figureBefore(doc, seq);
  const after = before.length ? [] : figureAfter(doc, seq);
  const run = before.length ? before : after;
  if (!run.length) {
    return null;
  }
  const centre = apertureCenter(el, seq.apertureIndex ?? 0);
  const { right } = travelOf(el, seq);
  const ws = run.map((q) => elementById(doc, q.elementId));
  const across = ws.reduce((t, w) => t + (w.position.x - centre.x) * right.x + (w.position.y - centre.y) * right.y, 0);
  const side = across >= 0 ? 'right' : 'left';
  /* `up` only when it is one, so a figure into the pass reads back exactly as it always has. */
  return after.length ? { side, spiral: true, up: true } : { side, spiral: ws.some((w) => w.name !== ROUND_NAMES.round) };
}

/* Take the figure in front of a pass out: its waypoints leave the flying order, and the document when nothing else
 * flies them. Returns true when there was one. */
export function removeSpiral(doc, seqId) {
  const seq = doc.sequence.find((s) => s.id === seqId);
  if (!seq) {
    return false;
  }
  const run = [...figureBefore(doc, seq), ...figureAfter(doc, seq)];
  for (const q of run) {
    doc.sequence.splice(doc.sequence.indexOf(q), 1);
    if (!doc.sequence.some((s) => s.elementId === q.elementId)) {
      doc.elements.splice(doc.elements.findIndex((e) => e.id === q.elementId), 1);
    }
  }
  if (run.length) {
    applyAutoFaces(doc);
  }
  return run.length > 0;
}

/* Take only a spiral up out of a pass, for a "Then" flight path laid in its place. Returns true when there was one. */
export function removeSpiralUp(doc, seqId) {
  const seq = doc.sequence.find((s) => s.id === seqId);
  const run = seq ? figureAfter(doc, seq) : [];
  for (const q of run) {
    doc.sequence.splice(doc.sequence.indexOf(q), 1);
    if (!doc.sequence.some((s) => s.elementId === q.elementId)) {
      doc.elements.splice(doc.elements.findIndex((e) => e.id === q.elementId), 1);
    }
  }
  if (run.length) {
    applyAutoFaces(doc);
  }
  return run.length > 0;
}

/* Round the flag on `side`, as flown, which has to carry one (flagsAsFlown), `opts.turns` whole turns besides the
 * arc that joins the circle. Returns { waypoints: [ids], mast, radius, sweep }, or null when the pass is not a
 * standing gate's or that side has no flag. */
/*
 * THE FLAGGED LEG OF A PASS, as the world stands it: where the pennant is on `side` (as flown), how far it is from the
 * middle of the opening (the radius of a circle round it that goes through the opening), and the way the pass goes.
 * The field builds a gate GATE_SCALE larger and does not move it, so a mast on the header stands that much further
 * from the middle of the opening than the document's does, and a gate in the full dress carries its pennant beside
 * the sleeve. Null when that side has no flag.
 */
export function legOf(doc, seqId, side) {
  if ((side !== 'left' && side !== 'right') || !flagsAsFlown(doc, seqId)[side]) {
    return null;
  }
  const seq = doc.sequence.find((s) => s.id === seqId);
  const el = elementById(doc, seq.elementId);
  const levels = aperturesOf(el);
  const top = levels[levels.length - 1];
  const centre = apertureCenter(el, seq.apertureIndex ?? 0);
  /* The way the quad goes through it, on the ground: the right of that is the right as flown. */
  const { travel, right } = travelOf(el, seq);
  const scale = trackClassOf(doc) === 'micro' ? 1 : GATE_SCALE;
  const radius = scale * (top.clearW / 2 + FRAME_TUBE_OD + (isPlain(el) ? 0 : SLEEVE_W));
  const out = side === 'right' ? 1 : -1;
  return {
    el,
    seq,
    top,
    centre,
    travel,
    right,
    scale,
    radius,
    mast: { x: centre.x + right.x * radius * out, y: centre.y + right.y * radius * out },
  };
}

export function addSpiral(doc, seqId, side, opts = {}) {
  const leg = legOf(doc, seqId, side);
  if (!leg) {
    return null;
  }
  if (opts.up) {
    return addSpiralUp(doc, leg, side, opts);
  }
  const { seq, el, top, centre, travel, scale, mast } = leg;
  const r = leg.radius;
  /* The figure already in front of this pass comes out first. */
  removeSpiral(doc, seqId);
  const at = doc.sequence.indexOf(seq);
  const index = seq.apertureIndex ?? 0;
  /* Clockwise round a flag on the right, anticlockwise round one on the left. */
  const turn = side === 'right' ? -1 : 1;
  const end = Math.atan2(centre.y - mast.y, centre.x - mast.x);

  /* Where the line comes from: the knot before, round the end of the lap for the first pass, or straight on. */
  const n0 = doc.sequence.length;
  const before = n0 > 1 ? entryAnchor(doc, doc.sequence[(at - 1 + n0) % n0]) : null;
  const from = before ?? { x: centre.x - travel.x * 6, y: centre.y - travel.y * 6 };
  let start = end;
  const d = Math.hypot(from.x - mast.x, from.y - mast.y);
  if (d > r * 1.05) {
    const a = Math.atan2(from.y - mast.y, from.x - mast.x);
    const b = Math.acos(r / d);
    for (const th of [a + b, a - b]) {
      const v = { x: -Math.sin(th) * turn, y: Math.cos(th) * turn };
      const tx = mast.x + Math.cos(th) * r - from.x;
      const ty = mast.y + Math.sin(th) * r - from.y;
      if (tx * v.x + ty * v.y > 0) {
        start = th;
        break;
      }
    }
  }
  const TAU = 2 * Math.PI;
  let arc = (((end - start) * turn) % TAU + TAU) % TAU;
  if (arc < MIN_ARC || arc > TAU - MIN_ARC) {
    arc = 0;
  }
  const turns = Math.max(0, Math.round(opts.turns ?? SPIRAL.turns));
  const sweep = arc + turns * TAU;
  const ids = [];
  if (sweep > 0) {
    const low = centre.z;
    const header = scale * (top.sillH + top.clearH + 2 * FRAME_TUBE_OD) + GATE_BANNER_H + 0.03;
    const high = el.position.z + header + SPIRAL.over;
    /* The height with `left` still to turn before the pass. */
    const height = (left) => {
      if (turns === 0) {
        return low;
      }
      return left <= TAU ? low + (high - low) * (left / TAU) : high + ((left - TAU) / TAU) * SPIRAL.climb;
    };
    /* A waypoint at least every quarter turn, evenly, the first where the line meets the circle. */
    const n = Math.max(1, Math.ceil(sweep / (Math.PI / 2) - 1e-9));
    const step = sweep / n;
    for (let k = 0; k < n; k += 1) {
      const th = start + turn * step * k;
      const wp = createElement(doc, 'waypoint', {
        x: mm(mast.x + Math.cos(th) * r),
        y: mm(mast.y + Math.sin(th) * r),
        z: mm(height(sweep - step * k)),
      }, 0);
      wp.name = turns > 0 ? ROUND_NAMES[side] : ROUND_NAMES.round;
      doc.elements.push(wp);
      addToSequence(doc, wp.id, 0, at + k);
      ids.push(wp.id);
    }
  }
  applyAutoFaces(doc);
  return { waypoints: ids, mast, radius: r, sweep };
}

/*
 * SPIRAL UP: THROUGH THE GATE FIRST, THEN A WHOLE TURN ROUND THE FLAG, CLIMBING, and over the top of the gate it
 * has just come through. The pilot's report was that a flag on a gate offered spiral down and no spiral up, and a
 * club plan draws both. It is spiral down flown backwards in time: the same circle round the same pennant, turning
 * the same way (so the line leaves the opening on the tangent it came through on), rising from the middle of the
 * opening to SPIRAL.over clear of the header by the time it is back over the gate, and then round on to the tangent
 * that leaves for the next knot. Its waypoints go straight AFTER the pass, which is the one difference in kind, so
 * they are named for it (ROUND_NAMES.upLeft and upRight) and found by figureAfter. The caller takes away whatever
 * "Then" flight path the pass had (app.js roundFlag), because the two are both the line out of that gate.
 */
function addSpiralUp(doc, leg, side, opts) {
  const { seq, el, top, centre, travel, scale, mast } = leg;
  const r = leg.radius;
  removeSpiral(doc, seq.id);
  const at = doc.sequence.indexOf(seq);
  const turn = side === 'right' ? -1 : 1;
  const start = Math.atan2(centre.y - mast.y, centre.x - mast.x);
  /* Where the line goes next: the knot after, round the end of the lap for the last pass, or straight on. */
  const n0 = doc.sequence.length;
  const after = n0 > 1 ? entryAnchor(doc, doc.sequence[(at + 1) % n0]) : null;
  const to = after ?? { x: centre.x + travel.x * 6, y: centre.y + travel.y * 6 };
  let leave = start;
  const d = Math.hypot(to.x - mast.x, to.y - mast.y);
  if (d > r * 1.05) {
    const a = Math.atan2(to.y - mast.y, to.x - mast.x);
    const b = Math.acos(r / d);
    for (const th of [a + b, a - b]) {
      const v = { x: -Math.sin(th) * turn, y: Math.cos(th) * turn };
      const tx = to.x - (mast.x + Math.cos(th) * r);
      const ty = to.y - (mast.y + Math.sin(th) * r);
      if (tx * v.x + ty * v.y > 0) {
        leave = th;
        break;
      }
    }
  }
  const TAU = 2 * Math.PI;
  let arc = (((leave - start) * turn) % TAU + TAU) % TAU;
  if (arc < MIN_ARC || arc > TAU - MIN_ARC) {
    arc = 0;
  }
  const turns = Math.max(1, Math.round(opts.turns ?? SPIRAL.turns));
  const sweep = turns * TAU + arc;
  const low = centre.z;
  const header = scale * (top.sillH + top.clearH + 2 * FRAME_TUBE_OD) + GATE_BANNER_H + 0.03;
  const high = el.position.z + header + SPIRAL.over;
  /* The height `gone` round from the pass: up to over the header in the last whole turn, a climb before it. */
  const height = (gone) => {
    const lift = turns * TAU;
    if (gone >= lift) {
      return high;
    }
    const firstTurns = (turns - 1) * TAU;
    if (gone <= firstTurns) {
      return low + (gone / TAU) * SPIRAL.climb;
    }
    const from = low + (turns - 1) * SPIRAL.climb;
    return from + (high - from) * ((gone - firstTurns) / TAU);
  };
  const n = Math.max(1, Math.ceil(sweep / (Math.PI / 2) - 1e-9));
  const step = sweep / n;
  const ids = [];
  for (let k = 1; k <= n; k += 1) {
    const th = start + turn * step * k;
    const wp = createElement(doc, 'waypoint', {
      x: mm(mast.x + Math.cos(th) * r),
      y: mm(mast.y + Math.sin(th) * r),
      z: mm(height(step * k)),
    }, 0);
    wp.name = side === 'right' ? ROUND_NAMES.upRight : ROUND_NAMES.upLeft;
    doc.elements.push(wp);
    addToSequence(doc, wp.id, 0, at + k);
    ids.push(wp.id);
  }
  applyAutoFaces(doc);
  return { waypoints: ids, mast, radius: r, sweep };
}

/* ------------------------------------------------------------------ */
/* What a tool would put down                                          */
/* ------------------------------------------------------------------ */

/*
 * THE GHOST OF A PIECE MADE OF PIECES: the elements the tool would write if it were
 * pressed now, as the room draws a ghost, each { type, position, yaw, props }, where
 * `props` are the fields the placed element carries beyond what its type gives it.
 * A wall's `a` and `b` are its two ends as for wallPlan; the others stand at `a`.
 * Pure, and built from the same functions the pieces are placed with, so what is
 * shown is what is laid.
 */
export function partGhosts(doc, type, a, b = a, opts = {}) {
  const cls = trackClassOf(doc);
  if (type === 'wall') {
    const dims = { ...(opts.dims ?? defaultDims('gate', cls)), levels: 1 };
    const plan = wallPlan(doc, a, b, { ...opts, dims });
    return {
      plan,
      items: plan.items.map((it, i) => {
        const wide = Math.hypot(plan.dir.x, plan.dir.y) > 0 ? plan.dir : { x: 1, y: 0 };
        /* The upright a bay shares with the one before it is built once, so the ghost leaves it out too. */
        const f = apertureFrame(it.yaw, 0);
        const toward = f.widthAxis.x * -wide.x + f.widthAxis.y * -wide.y > 0 ? 'right' : 'left';
        return {
          type: 'gate',
          position: { x: it.x, y: it.y, z: 0 },
          yaw: it.yaw,
          props: { dims, pitch: 0, style: 'plain', unbuiltSides: i > 0 ? [toward] : [] },
        };
      }),
    };
  }
  if (type === 'hurdle') {
    return {
      plan: null,
      items: [{
        type: 'barrier',
        position: { x: a.x, y: a.y, z: 0 },
        yaw: hurdleYaw(doc, a, opts.square),
        props: {
          dims: { ...defaultDims('barrier', cls), width: HURDLE.width, depth: HURDLE.depth, height: HURDLE.height, flagH: HURDLE.flagH },
          flagSide: 'both',
        },
      }],
    };
  }
  if (type === 'run') {
    return { plan: null, items: runGhosts(doc, a, opts.run ?? {}, { square: opts.square }) };
  }
  if (type === 'launchGate') {
    return {
      plan: null,
      items: [{
        type: 'diveGate',
        position: { x: a.x, y: a.y, z: 0 },
        yaw: opts.square ? wrapAngle(Math.round(defaultYawFor(doc, a) / (Math.PI / 2)) * (Math.PI / 2)) : defaultYawFor(doc, a),
        props: { dims: { ...defaultDims('diveGate', cls) }, pitch: ELEMENTS.diveGate.pitch },
      }],
    };
  }
  if (type === 'barHurdle') {
    return {
      plan: null,
      items: [{
        type: 'horizontalPole',
        position: { x: a.x, y: a.y, z: BAR_HURDLE.height },
        yaw: hurdleYaw(doc, a, opts.square),
        props: { dims: { ...defaultDims('horizontalPole', cls), width: BAR_HURDLE.width, depth: BAR_HURDLE.thick, height: BAR_HURDLE.thick } },
      }],
    };
  }
  if (type === 'invisibleGate') {
    return {
      plan: null,
      items: [{
        type: 'gate',
        position: { x: a.x, y: a.y, z: 0 },
        yaw: placementFor(doc, a, 'gate', { square: opts.square }).yaw,
        props: { dims: { ...defaultDims('gate', cls) }, pitch: 0, unbuilt: true },
      }],
    };
  }
  if (type === 'upGate') {
    return {
      plan: null,
      items: [{
        type: 'diveGate',
        position: { x: a.x, y: a.y, z: 0 },
        yaw: opts.square ? wrapAngle(Math.round(defaultYawFor(doc, a) / (Math.PI / 2)) * (Math.PI / 2)) : defaultYawFor(doc, a),
        props: { dims: { ...defaultDims('diveGate', cls), sillH: UP_GATE.sillH }, pitch: UP_GATE.pitch },
      }],
    };
  }
  return { plan: null, items: [] };
}
