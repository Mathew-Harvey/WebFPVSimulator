/*
 * convert.mjs: turn Velocidrone .trk files, and the 2022 MultiGP GQ
 * diagram, into track documents, then optionally publish them to the
 * public board.
 *
 * Usage, from the simulator root:
 *   node tracks/convert.mjs
 *   node tracks/convert.mjs --publish
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTrack, createElement, serialize, startPadsOf, elementById, kindOf, aperturesOf } from '../src/trackbuilder/model.js';
import { addToSequence } from '../src/trackbuilder/sequence.js';
import { applyAutoFaces, flipFace, anchorChain } from '../src/trackbuilder/faces.js';
import { elementNormal } from '../src/trackbuilder/model.js';
import { applyFigure } from '../src/trackbuilder/figures.js';
import { buildPath } from '../src/trackbuilder/path.js';
import { collectWarnings } from '../src/trackbuilder/warnings.js';
import { wrapAngle, apertureFrame } from '../src/trackbuilder/geometry.js';
import { KIND, ELEMENTS, FRAME_TUBE_OD } from '../src/trackbuilder/elements.js';
import { readCourse, isDive } from './course.mjs';
import { docYaw } from './trk.mjs';
import { TRK_FILES, trackId } from './sources.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PAD = 6;
const FT = 0.3048;
const CLEAR = 5 * FT;
const AUTHOR = 'andAgainFPV';
const BOARD = process.env.BOARD_ORIGIN || 'http://127.0.0.1:3100';
const KEYS_PATH = join(here, 'json', 'edit-keys.json');
const CRAFT = 0.18;
const LEG_HALF = CLEAR / 2 + FRAME_TUBE_OD / 2;
const FLAG_GAP = 0.6;

function addEl(doc, type, x, y, opts = {}) {
  const el = createElement(doc, type, { x, y, z: opts.z ?? 0 }, opts.yaw ?? 0);
  if (opts.name) {
    el.name = opts.name;
  }
  if (opts.pitch != null) {
    el.pitch = opts.pitch;
  }
  if (opts.flagSide) {
    el.flagSide = opts.flagSide;
  }
  if (opts.yawOverridden) {
    el.yawOverridden = true;
  }
  if (opts.dims) {
    Object.assign(el.dims, opts.dims);
  }
  doc.elements.push(el);
  return el;
}

function flagSideAt(gateYaw, gateX, gateZ, flagX, flagZ) {
  const width = apertureFrame(gateYaw, 0).widthAxis;
  const along = (flagX - gateX) * width.x + (flagZ - gateZ) * width.y;
  return along < 0 ? 'left' : 'right';
}

function minDistTo(path, x, y) {
  let best = Infinity;
  let at = 0;
  for (const smp of path.samples) {
    const d = Math.hypot(smp.pos.x - x, smp.pos.y - y);
    if (d < best) {
      best = d;
      at = smp.s;
    }
  }
  return { d: best, s: at };
}

function fixStartHeading(doc) {
  const pads = startPadsOf(doc);
  if (!pads || !doc.sequence.length) {
    return;
  }
  const path = buildPath(doc);
  const warns = collectWarnings(doc, path).filter((w) => w.code === 'reversal' && w.message.includes('sets off'));
  if (warns.length) {
    pads.yaw = wrapAngle(pads.yaw + Math.PI);
    pads.yawOverridden = true;
  }
}

function fixReversals(doc) {
  for (let n = 0; n < 6; n += 1) {
    applyAutoFaces(doc);
    const path = buildPath(doc);
    const reversals = collectWarnings(doc, path).filter((w) => w.code === 'reversal');
    let flipped = 0;
    for (const w of reversals) {
      if (!w.seqId || !w.elementId) {
        continue;
      }
      const el = elementById(doc, w.elementId);
      if (!el) {
        continue;
      }
      const refs = doc.sequence.filter((s) => s.elementId === el.id).length;
      if (refs > 1) {
        continue;
      }
      /* Only the SIGN moves. Every imported element carries the heading its
       * author gave it and yawOverridden to keep it, so flipping a face here
       * turns the line around inside the hole rather than turning the hole,
       * which is the difference between reading a track and rewriting it. */
      if (kindOf(el) === KIND.APERTURE || kindOf(el) === KIND.MARKER) {
        flipFace(doc, w.seqId);
        flipped += 1;
      }
    }
    if (!flipped) {
      break;
    }
  }
}

/*
 * A turn marker whose pole the line runs into. The line is not moved and
 * neither is the marker: an imported flag stands where its author put it, and
 * the previous import's habit of sliding markers around to quieten a warning
 * is how a course stops being the course. What CAN change without inventing
 * anything is which side of the pole the line is drawn on, and how wide the
 * berth is, both of which are sequence entry fields rather than positions.
 */
function clearMarkerPoles(doc) {
  applyAutoFaces(doc);
  let path = buildPath(doc);
  for (const el of doc.elements) {
    if (el.type !== 'flag' && el.type !== 'cone') {
      continue;
    }
    for (const seq of doc.sequence.filter((s) => s.elementId === el.id)) {
      const hit = minDistTo(path, el.position.x, el.position.y);
      const rad = (el.dims.poleRadius || 0.025) + CRAFT;
      if (hit.d >= rad) {
        continue;
      }
      flipFace(doc, seq.id);
      path = buildPath(doc);
      if (minDistTo(path, el.position.x, el.position.y).d < hit.d) {
        flipFace(doc, seq.id);
        path = buildPath(doc);
      }
      if (minDistTo(path, el.position.x, el.position.y).d < rad) {
        const need = Math.max(2.4, (seq.clearance || 1.5) + 1.2);
        seq.clearance = need;
        el.dims.clearance = need;
        path = buildPath(doc);
      }
    }
  }
}

function flagCorridor(flag, gate) {
  const frame = apertureFrame(gate.yaw, 0);
  const dx = flag.position.x - gate.position.x;
  const dy = flag.position.y - gate.position.y;
  const alongN = dx * frame.normal.x + dy * frame.normal.y;
  const alongW = dx * frame.widthAxis.x + dy * frame.widthAxis.y;
  const dist = Math.hypot(dx, dy);
  const half = (gate.dims?.clearW || CLEAR) / 2;
  const inHole = Math.abs(alongW) < half * 0.85 && Math.abs(alongN) < 0.7;
  /* Both faces of the plane. A flag 1.5 m the other side of the normal is
   * still in the hole you are about to fly, and the previous test only
   * caught the +normal side, which is how 2022 MultiGP GQ flag 8 sat on
   * gate 9's centreline and never printed FRONT. */
  const onApproach = Math.abs(alongW) < half * 0.5 && Math.abs(alongN) > 0.7 && Math.abs(alongN) < 4.2;
  return {
    gate,
    frame,
    alongN,
    alongW,
    dist,
    inHole,
    onApproach,
  };
}

function flagBeforeGate(doc, flag, gate) {
  const fi = doc.sequence.findIndex((s) => s.elementId === flag.id);
  const gi = doc.sequence.findIndex((s) => s.elementId === gate.id);
  return fi >= 0 && gi >= 0 && fi < gi;
}

/*
 * Everything the document needs settling once the elements are placed, and
 * NOTHING THAT MOVES ONE.
 *
 * The previous version of this pass slid flags sideways, pushed markers off
 * the racing line, flattened every aperture to the ground and re-aimed every
 * stack at its predecessor. All of it was compensating for an import that
 * had misread the file: turn the checkpoints back into holes and give every
 * element the heading its author gave it, and there is nothing left to
 * correct. What remains is the three things that are genuinely derived and
 * are not in the .trk at all: which way through each hole the line goes,
 * which side of a pole it passes, and how taut the spline is.
 */
/*
 * The start blocks, square to and behind the first obstacle. Always.
 *
 * The owner's rule, in their words: "the start blocks should aways be
 * straight on to the first gate or element. not 60degrees offset". It lives
 * in polish rather than in the .trk import because it is a rule about
 * COURSES, not about Velocidrone files, and the hand built 2022 MultiGP GQ
 * needed it just as much: its grid came off the published diagram, which
 * puts LAUNCH away to one side, and it sat 10.0 m off the timing gate's axis.
 *
 * Iterated, because the two facts depend on each other. The first gate's own
 * heading is derived by applyAutoFaces from the chain that STARTS at the
 * pads, so moving the pads moves the gate, which moves where the pads should
 * be. Four passes is far more than it needs: the courses here settle in two.
 *
 * The pads sit GRID_BACK metres behind that gate. 3.2 m was a body length
 * and a bit, which left the motors nowhere to spool before the opening; the
 * owner's floor is 15 m. The field then has to grow to hold them: it was
 * sized around the gates with PAD metres of grass, and 15 m back is outside
 * that box on every course that starts near an edge.
 */
const GRID_BACK = 15;

function squareGridToFirstGate(doc) {
  const pads = startPadsOf(doc);
  if (!pads || !doc.sequence.length) {
    return;
  }
  const el = elementById(doc, doc.sequence[0].elementId);
  if (!el || kindOf(el) !== KIND.APERTURE) {
    return;
  }
  /* Which way through the first gate the lap goes: towards the next element
   * that is not the first one. */
  const onward = doc.sequence
    .map((s) => elementById(doc, s.elementId))
    .find((e) => e && e.id !== el.id);
  for (let n = 0; n < 4; n += 1) {
    const normal = apertureFrame(el.yaw, 0).normal;
    let sign = 1;
    if (onward) {
      const dx = onward.position.x - el.position.x;
      const dy = onward.position.y - el.position.y;
      sign = (dx * normal.x + dy * normal.y) >= 0 ? 1 : -1;
    }
    const nx = normal.x * sign;
    const ny = normal.y * sign;
    pads.position.x = el.position.x - nx * GRID_BACK;
    pads.position.y = el.position.y - ny * GRID_BACK;
    pads.yaw = wrapAngle(Math.atan2(ny, nx));
    pads.yawOverridden = true;
    applyAutoFaces(doc);
  }
  fitFieldAround(doc);
}

/*
 * Keep every element, including the grid just placed, inside the field with
 * PAD metres of grass. Growing the far edge is a ceil of the new max;
 * crossing the origin means shifting the whole document, because a negative
 * coordinate is outside the field by definition and the race field's origin
 * is the near left corner.
 */
function fitFieldAround(doc) {
  if (!doc.elements.length) {
    return;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of doc.elements) {
    minX = Math.min(minX, el.position.x);
    minY = Math.min(minY, el.position.y);
    maxX = Math.max(maxX, el.position.x);
    maxY = Math.max(maxY, el.position.y);
  }
  const shiftX = Math.max(0, PAD - minX);
  const shiftY = Math.max(0, PAD - minY);
  if (shiftX || shiftY) {
    for (const el of doc.elements) {
      el.position.x += shiftX;
      el.position.y += shiftY;
    }
    maxX += shiftX;
    maxY += shiftY;
  }
  doc.field.width = Math.max(doc.field.width + shiftX, Math.ceil(maxX + PAD));
  doc.field.depth = Math.max(doc.field.depth + shiftY, Math.ceil(maxY + PAD));
}

/*
 * FLOW: every hole has to send the pilot towards the next one.
 *
 * Reported from the cockpit: "the tunnel on the track, the first gate is
 * asking the pilot to go the wrong way". On 2025 WA States the five gate
 * tunnel is flown east to west, and gates 17 to 20 all carried entry -1,
 * westward, while gate 16 at the mouth carried +1. The tunnel told you to
 * turn round and fly back out of it.
 *
 * WHY THE AUTO FACE RULE PICKED IT. For an element whose heading is fixed,
 * faces.js chooses the entry sign from the dot of the aperture normal with
 * the BISECTOR of the turn, the chord from the previous knot to the next. At
 * the mouth of a tunnel you arrive from the side and leave straight down it,
 * so the bisector is nearly square to the hole: at gate 16 that dot is 0.17,
 * which is noise, and the sign it produced was a coin toss that landed wrong.
 * The bisector is the right question at a corner and the wrong one here.
 *
 * WHY fixReversals DID NOT CATCH IT. Flipping gate 16 trades a departure
 * reversal for an arrival one, so the loop oscillates and gives up. But the
 * two are not equal. The DEPARTURE is a rule the pilot has to obey, because
 * it is which way through the hole they must go; the arrival is a manoeuvre,
 * and swinging round to the mouth of a tunnel is a normal thing to fly. So
 * flow is judged on the departure alone, and it wins.
 *
 * A stacked figure is exempt. Consecutive passes of one structure sit at the
 * same place, so the chord between them is a wrap rather than a leg and
 * carries no direction to agree with.
 */
const WRAP_CHORD = 0.5;
/* A square turn after a hole is a corner, not anti-flow. cos(90 deg) is 0,
 * and a tunnel exit whose next checkpoint sits a few degrees behind the
 * plane (2023 MultiGP GQ gate 12, 94 deg) is still that corner. Sending the
 * pilot back through the hole is closer to 180. */
const FLOW_AWAY = -0.2;

function flowScore(doc) {
  const chain = anchorChain(doc);
  const out = [];
  for (let i = 0; i < chain.length - 1; i += 1) {
    const seq = chain[i].seq;
    if (!seq || seq.entry == null) {
      continue;
    }
    const el = elementById(doc, seq.elementId);
    if (!el || kindOf(el) !== KIND.APERTURE) {
      continue;
    }
    const dx = chain[i + 1].pos.x - chain[i].pos.x;
    const dy = chain[i + 1].pos.y - chain[i].pos.y;
    const len = Math.hypot(dx, dy);
    if (len < WRAP_CHORD) {
      continue;
    }
    const n = elementNormal(el);
    out.push({
      seq,
      el,
      dx,
      dy,
      dot: ((n.x * seq.entry) * dx + (n.y * seq.entry) * dy) / len,
    });
  }
  return out;
}

/*
 * FLIPPING THE SIGN IS NOT ALWAYS ENOUGH, and the case where it is not is
 * the out and back.
 *
 * For an element whose heading is DERIVED rather than authored, faces.js
 * re-aims it every pass: el.yaw is set from the bisector and then turned a
 * half turn when entry is -1. So the tangent, which is entry times the
 * normal, always comes back to the bisector, and flipping the sign rotates
 * the gate instead of turning the line round. On a leg that goes out to a
 * gate and back the way it came, the bisector points the OPPOSITE way to the
 * departure, so the flip achieved nothing and the loop span. 2023 GQ Scale's
 * gate 14 is exactly that: in from the west, out to the west again.
 *
 * So a derived heading is re-aimed down the departure and pinned, which is
 * the only heading that can satisfy the flow rule. An AUTHORED heading is
 * never turned, because the .trk is the authority on it; there only the sign
 * moves. Neither is done to a structure flown more than once, because one
 * frame cannot face two ways and faces.js has the same rule.
 */
function fixFlow(doc) {
  for (let pass = 0; pass < 6; pass += 1) {
    let changed = 0;
    for (const row of flowScore(doc)) {
      if (row.dot >= FLOW_AWAY) {
        continue;
      }
      const refs = doc.sequence.filter((s) => s.elementId === row.el.id).length;
      if (refs === 1 && !row.el.yawOverridden) {
        row.el.yaw = wrapAngle(Math.atan2(row.dy, row.dx));
        row.el.yawOverridden = true;
        row.seq.entry = 1;
      } else {
        row.seq.entry = row.seq.entry === 1 ? -1 : 1;
      }
      row.seq.overridden = true;
      changed += 1;
    }
    applyAutoFaces(doc);
    if (!changed) {
      return;
    }
  }
}

function polish(doc) {
  if (Math.min(doc.field.width, doc.field.depth) < 32) {
    doc.settings.tangentScale = 0.65;
  }
  applyAutoFaces(doc);
  squareGridToFirstGate(doc);
  fixStartHeading(doc);
  applyAutoFaces(doc);
  squareGridToFirstGate(doc);
  fixReversals(doc);
  /* After fixReversals, because that one is allowed to shuffle signs to
   * quieten arrival warnings and this is the rule that outranks it. */
  fixFlow(doc);
  clearMarkerPoles(doc);
  applyAutoFaces(doc);
  fixFlow(doc);
  /* Headings first, then the two layout faults the cockpit actually hits:
   * a tunnel with a 90 degree gate in it, and a flag on the centreline of
   * a hole. Both set yawOverridden / move a marker, so they run after the
   * last auto-face pass that would otherwise undo them. */
  alignTunnels(doc);
  unwallSideBySide(doc);
  /* Entry signs for the headings those two just wrote. Then departure
   * wins, because applyAutoFaces still picks the sign off the bisector
   * and a U-blocker re-aimed with the pair is square to that bisector. */
  applyAutoFaces(doc);
  fixFlow(doc);
  parkFlagsOffOpenings(doc);
  easeUnderground(doc);
  renumberSequence(doc);
  return doc;
}

function pickFlagSide(doc, flag, gate, frame) {
  const fi = doc.sequence.findIndex((s) => s.elementId === flag.id);
  if (fi > 0) {
    const prev = elementById(doc, doc.sequence[fi - 1].elementId);
    if (prev) {
      const alongW = (prev.position.x - gate.position.x) * frame.widthAxis.x
        + (prev.position.y - gate.position.y) * frame.widthAxis.y;
      if (Math.abs(alongW) > 0.05) {
        return alongW < 0 ? -1 : 1;
      }
    }
  }
  return -1;
}

/*
 * A sequenced flag whose pole sits in a hole, or on that hole's approach
 * centreline, moves to the nearest leg.
 *
 * MultiGP puts a flag 2 ft off the stake, beside the frame, not in front of
 * the opening. The previous import left numbered turn flags on the
 * centreline because sliding them was how a course stopped being the
 * course. That was the right instinct for a flag that was already at the
 * leg, and the wrong one for a flag the pilot hits on the way through.
 * 2022 MultiGP GQ flag 8 was 1.50 m along gate 9's normal, which is the
 * opening, and the plate on that gate reads 5 because flags are not
 * stations.
 */
function parkFlagsOffOpenings(doc) {
  const apertures = doc.elements.filter((e) => kindOf(e) === KIND.APERTURE);
  for (const flag of doc.elements) {
    if (flag.type !== 'flag' && flag.type !== 'cone') {
      continue;
    }
    let best = null;
    for (const gate of apertures) {
      const row = flagCorridor(flag, gate);
      if (!(row.inHole || row.onApproach)) {
        continue;
      }
      if (!best || Math.abs(row.alongN) < Math.abs(best.alongN)) {
        best = { ...row, gate };
      }
    }
    if (!best) {
      continue;
    }
    const gate = best.gate;
    const frame = best.frame;
    const side = Math.abs(best.alongW) > 0.05
      ? (best.alongW < 0 ? -1 : 1)
      : pickFlagSide(doc, flag, gate, frame);
    const nSign = best.alongN >= 0 ? 1 : -1;
    flag.position.x = gate.position.x
      + frame.widthAxis.x * side * (LEG_HALF + FLAG_GAP)
      + frame.normal.x * nSign * 0.2;
    flag.position.y = gate.position.y
      + frame.widthAxis.y * side * (LEG_HALF + FLAG_GAP)
      + frame.normal.y * nSign * 0.2;
  }
}

/*
 * Gates in a line are a tunnel and they all face along that line.
 *
 * Pairwise "entry OR exit agrees" left 2023 MultiGP GQ's gates 10 and 12
 * facing the camera while gate 11, already re-aimed, faced down the tunnel.
 * From in front that is two openings side by side and a wall between them.
 */
function alignTunnels(doc) {
  const solid = doc.elements.filter((e) => kindOf(e) === KIND.APERTURE && e.type !== 'diveGate');
  for (const a of solid) {
    const near = solid.filter((b) => (
      b.id !== a.id
      && Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y) < 5.5
    ));
    if (!near.length) {
      continue;
    }
    const pts = [a, ...near];
    let axis = null;
    let axisLen = 0;
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        const dx = pts[j].position.x - pts[i].position.x;
        const dy = pts[j].position.y - pts[i].position.y;
        const len = Math.hypot(dx, dy);
        if (len > axisLen) {
          axisLen = len;
          axis = { ux: dx / len, uy: dy / len };
        }
      }
    }
    /* Two gates in a line are a pair, not a tunnel. Aiming both along the
     * chord between them is how FAI Turkiye 9 and 12, a corner 3 m apart,
     * got dragged onto the same heading. Three collinear is a tunnel. */
    if (!axis || axisLen < 2 || pts.length < 3) {
      continue;
    }
    let maxOff = 0;
    for (const p of pts) {
      const dx = p.position.x - a.position.x;
      const dy = p.position.y - a.position.y;
      maxOff = Math.max(maxOff, Math.abs(dx * -axis.uy + dy * axis.ux));
    }
    /* A U-combo has the middle gate a couple of metres off the line of the
     * two parallel ones. That is not a tunnel and unwallSideBySide handles
     * it. 1.2 m is inside a gate width, so a leaning stack still counts. */
    if (maxOff > 1.2) {
      continue;
    }
    const yaw = wrapAngle(Math.atan2(axis.uy, axis.ux));
    for (const p of pts) {
      const n = apertureFrame(p.yaw, 0).normal;
      const along = Math.abs(n.x * axis.ux + n.y * axis.uy);
      if (along < Math.cos(Math.PI / 6)) {
        p.yaw = yaw;
        p.yawOverridden = true;
      }
    }
  }
}

/*
 * Two parallel gates side by side, a third at 90 degrees in front of them:
 * the third is a wall across both openings. 2025 WA States gates 25 and 27
 * face east-west 3.9 m apart; gate 26 sits 2.5 m in front of them facing
 * north-south, close enough that its side panel is the thing you hit.
 *
 * Positions stay. The 90 degree gate is turned to match the pair, so it
 * becomes another opening rather than a wall. A real U-combo with room
 * around it has a frame gap bigger than this pass looks at.
 */
function unwallSideBySide(doc) {
  const solid = doc.elements.filter((e) => kindOf(e) === KIND.APERTURE && e.type !== 'diveGate');
  for (let i = 0; i < solid.length; i += 1) {
    for (let j = i + 1; j < solid.length; j += 1) {
      const a = solid[i];
      const b = solid[j];
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1.5 || dist > 6.5) {
        continue;
      }
      const fa = apertureFrame(a.yaw, 0);
      const fb = apertureFrame(b.yaw, 0);
      const planeDot = Math.abs(fa.normal.x * fb.normal.x + fa.normal.y * fb.normal.y);
      if (planeDot < 0.85) {
        continue;
      }
      const alongW = Math.abs(fa.widthAxis.x * dx + fa.widthAxis.y * dy) / dist;
      if (alongW < 0.7) {
        continue;
      }
      const midX = (a.position.x + b.position.x) / 2;
      const midY = (a.position.y + b.position.y) / 2;
      for (const c of solid) {
        if (c.id === a.id || c.id === b.id) {
          continue;
        }
        const fc = apertureFrame(c.yaw, 0);
        const cDot = Math.abs(fa.normal.x * fc.normal.x + fa.normal.y * fc.normal.y);
        if (cDot > Math.cos((50 * Math.PI) / 180)) {
          continue;
        }
        const da = Math.hypot(c.position.x - a.position.x, c.position.y - a.position.y);
        const db = Math.hypot(c.position.x - b.position.x, c.position.y - b.position.y);
        if (Math.min(da, db) > 4) {
          continue;
        }
        const alongN = (c.position.x - midX) * fa.normal.x + (c.position.y - midY) * fa.normal.y;
        if (Math.abs(alongN) < 0.3 || Math.abs(alongN) > 4) {
          continue;
        }
        c.yaw = a.yaw;
        c.yawOverridden = true;
        /* The pair is the reference. If auto-face then rotates either of
         * them, the copied heading is 90 degrees to a pair that is no
         * longer a pair, and the wall is back. */
        a.yawOverridden = true;
        b.yawOverridden = true;
      }
    }
  }
}

function easeUnderground(doc) {
  for (let n = 0; n < 4; n += 1) {
    const path = buildPath(doc);
    const under = collectWarnings(doc, path).some((w) => w.code === 'underground');
    if (!under) {
      return;
    }
    const cur = doc.settings.tangentScale || 1.1;
        doc.settings.tangentScale = Math.max(0.4, cur - 0.12);
  }
}

function renumberSequence(doc) {
  const used = new Set();
  for (const seq of doc.sequence) {
    if (!used.has(seq.id)) {
      used.add(seq.id);
      continue;
    }
    let n = 1;
    while (used.has(`sq-${n}`)) {
      n += 1;
    }
    seq.id = `sq-${n}`;
    used.add(seq.id);
  }
}

function fromPlan(name, field, marks) {
  const doc = createTrack(name);
  doc.id = trackId(name);
  doc.field.width = field.width;
  doc.field.depth = field.depth;
  doc.field.gridSize = field.gridSize ?? 1;

  const placed = [];
  for (const mark of marks) {
    if (mark.skip) {
      continue;
    }
    const el = addEl(doc, mark.type, mark.x, mark.y, mark);
    placed.push({ el, mark });
  }

  for (const row of placed) {
    if (row.mark.sequence === false) {
      continue;
    }
    const type = row.mark.type;
    if (type === 'startPads' || type === 'barrier' || type === 'label') {
      continue;
    }
    if (row.mark.figure && (type === 'doubleStack' || type === 'ladder' || type === 'flaggedDoubleStack' || type === 'tower')) {
      addToSequence(doc, row.el.id, 0);
      applyFigure(doc, row.el.id, row.mark.figure);
      continue;
    }
    addToSequence(doc, row.el.id, row.mark.aperture ?? 0);
  }

  return polish(doc);
}

/* The clear opening every imported aperture is built at. The .trk does not
 * carry one: a gate mesh has no dimensions in the file and a checkpoint's box
 * is a trigger volume that sits INSIDE the hole rather than being it. So the
 * document's own MultiGP figures are used, which is also what keeps an
 * imported 5 ft gate the same size as an authored one. */
const IMPORT_W = ELEMENTS.gate.dims.clearW;
const IMPORT_H = ELEMENTS.gate.dims.clearH;

/* Which end of a gate's header a pennant is on, in document terms. */
function pennantSide(el, x, y) {
  const width = apertureFrame(el.yaw, 0).widthAxis;
  return ((x - el.position.x) * width.x + (y - el.position.y) * width.y) < 0 ? 'left' : 'right';
}

function apertureTypeFor(site) {
  if (isDive(site)) {
    return 'diveGate';
  }
  const flagged = site.pennants.length > 0;
  if (site.levels.length >= 3) {
    return 'ladder';
  }
  if (site.levels.length === 2) {
    return flagged ? 'flaggedDoubleStack' : 'doubleStack';
  }
  return flagged ? 'flaggedGate' : 'gate';
}

/*
 * The openings of one site as document dimensions.
 *
 * A hole's height comes from the CHECKPOINT that marks it, because that is
 * the only thing in the file that knows where a hole is: a gate mesh's
 * position is the foot of its frame. sillH is therefore back-calculated from
 * the opening's centre, and clamped at zero because a document dimension
 * cannot be negative and a hole cannot start below the ground.
 */
function apertureDims(site, clearH) {
  const levels = Math.max(1, site.levels.length);
  const raw = site.levels.map((l) => l.centre).filter((c) => c != null);
  if (!raw.length) {
    return { levels, sillH: 0, clearW: IMPORT_W, clearH, levelPitch: clearH + FRAME_TUBE_OD };
  }
  /*
   * A HOLE CANNOT BE CENTRED LOWER THAN HALF ITS OWN HEIGHT, and most of the
   * ground level checkpoints in these files are centred at about zero. That
   * is not a hole sunk into the turf: a trigger volume is authored tall
   * enough to catch a quad and half of it happens to be underground, so what
   * the author means is "fly low here". So a centre below the floor becomes a
   * gate standing ON the floor.
   */
  const centres = raw.map((c) => Math.max(clearH / 2, c));
  const sillH = centres[0] - clearH / 2;
  /*
   * The pitch is anchored on the TOP hole, not on the authored spacing.
   * Clamping the bottom of a stack and then keeping the spacing lifts every
   * hole above it by the same amount, which put ROX Open's 7.07 m top hole at
   * 8.04 m. Anchoring the top costs accuracy only on the middle of a three
   * hole ladder whose bottom was clamped, because the document spaces a
   * ladder evenly and a clamped stack is no longer evenly spaced.
   */
  const pitch = centres.length > 1
    ? (centres[centres.length - 1] - centres[0]) / (centres.length - 1)
    : clearH + FRAME_TUBE_OD;
  return {
    levels,
    sillH,
    clearW: IMPORT_W,
    clearH,
    levelPitch: Math.max(clearH * 0.6, pitch),
  };
}

/*
 * A Velocidrone course as a track document.
 *
 * The reading is course.mjs's; this is only the translation. One SITE on the
 * field becomes one element, however many holes it has and however many times
 * the lap goes through it, and every STOP in the flying order becomes one
 * sequence entry pointing at (that element, that hole). Those two sentences
 * are the whole of the mapping, and getting them the wrong way round is what
 * the previous import did: it keyed elements off positions it had already
 * seen, so a gate flown four times on WCMRC Round 5 became one pass and three
 * deletions.
 */
function fromTrk(raw, displayName) {
  const course = readCourse(raw, displayName);
  const doc = createTrack(course.name);
  doc.id = trackId(course.name);

  /* The field has to hold the scenery as well as the course, or a flag that
   * is honestly outside the gates raises an out-of-field warning for being
   * where its author put it. */
  const placedProps = course.props.filter((p) => (p.role === 'flag' || p.role === 'cone') && p.attachedTo == null);
  const xs = [...course.sites.map((s) => s.x), ...placedProps.map((p) => p.x)];
  const zs = [...course.sites.map((s) => s.z), ...placedProps.map((p) => p.z)];
  if (course.grid) {
    xs.push(course.grid.x);
    zs.push(course.grid.z);
  }
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const maxX = Math.max(...xs);
  const maxZ = Math.max(...zs);
  const toDoc = (x, z) => ({ x: x - minX + PAD, y: z - minZ + PAD });
  doc.field.width = Math.max(20, Math.ceil(maxX - minX + PAD * 2));
  doc.field.depth = Math.max(20, Math.ceil(maxZ - minZ + PAD * 2));

  /* One element per site. */
  const siteEl = new Map();
  for (const site of course.sites) {
    const pos = toDoc(site.x, site.z);
    const name = site.names.join('-');
    if (site.role === 'waypoint') {
      siteEl.set(site.id, addEl(doc, 'waypoint', pos.x, pos.y, {
        name,
        z: Math.max(0, site.levels[0].centre),
      }));
      continue;
    }
    if (site.role === 'flag' || site.role === 'cone') {
      /* A marker's height is not always zero and dropping it is not
       * harmless: FAI Turkiye 2024 rounds four flags twenty metres up on a
       * structure, and a marker pinned to the ground would pull the racing
       * line down twenty metres and back for each of them. */
      siteEl.set(site.id, addEl(doc, site.role, pos.x, pos.y, {
        name,
        z: Math.max(0, site.levels[0].centre),
        yaw: wrapAngle(docYaw(site.heading)),
      }));
      continue;
    }
    const type = apertureTypeFor(site);
    const clearH = type === 'diveGate' ? ELEMENTS.diveGate.dims.clearH : IMPORT_H;
    const el = addEl(doc, type, pos.x, pos.y, {
      name,
      z: site.base || 0,
      yaw: wrapAngle(docYaw(site.heading)),
      /*
       * THE AUTHOR'S HEADING STAYS, unless the lap cannot use it. Without
       * the override the auto face rule turns every gate square to the line
       * between its neighbours, which throws away the one thing the .trk is
       * authoritative about and turns a four gate tunnel into four gates
       * facing four different ways. With it applied unconditionally, the 33
       * gates whose authored normal is more than 60 degrees off the way the
       * lap goes through them stand across the course as walls. course.mjs
       * decides which of the two a site is; this only spends the answer.
       */
      yawOverridden: site.headingTrusted,
      pitch: site.tilt,
      dims: apertureDims(site, clearH),
    });
    siteEl.set(site.id, el);
  }

  /* Pennants, once the gates exist and their headings are known. */
  for (const site of course.sites) {
    const el = siteEl.get(site.id);
    if (!el || !site.pennants.length) {
      continue;
    }
    const sides = new Set(site.pennants.map((p) => {
      const at = toDoc(p.x, p.z);
      return pennantSide(el, at.x, at.y);
    }));
    el.flagSide = sides.size > 1 ? 'both' : [...sides][0];
  }

  /* Scenery. A flag or a cone that is not a pennant and not a checkpoint is
   * a real object standing on the field, so it is placed even though nothing
   * in the flying order points at it. */
  for (const p of placedProps) {
    const at = toDoc(p.x, p.z);
    addEl(doc, p.role, at.x, at.y, {
      z: Math.max(0, p.agl),
      yaw: wrapAngle(docYaw(p.heading)),
    });
  }

  /*
   * The grid, SQUARE ON TO THE FIRST OBSTACLE.
   *
   * A start line is lined up with the gate it launches through, and this got
   * it wrong in a way that broke the lap as well as the look. It aimed the
   * pads from the first obstacle towards the SECOND, which points at the
   * first gate but says nothing about which way you have to cross it. On 2025
   * WA States that left the pads 127 degrees off gate 0's normal: you launch
   * looking at the gate edge on, and worse, applyAutoFaces reads the chain
   * pads-gate-next to pick the gate's entry SIGN, so the sign came out for a
   * crossing nobody makes and a genuine pass through the gate scored as a
   * backwards one. "The gate didn't register that I flew through" was this.
   *
   * So the launch axis is the first APERTURE'S OWN NORMAL, signed to agree
   * with where the lap goes afterwards, and the pads sit GRID_BACK metres
   * along it. A first obstacle with no plane, a flag or a waypoint, has
   * nothing to be square to, so the pads simply face it.
   *
   * The grid's authored position in the barriers is not used. It is the one
   * thing in the file worth less than the property of being straight, because
   * Velocidrone parks it wherever the designer dropped it and a grid off to
   * one side also makes the lap arrive at the finish line from in front of
   * it, which path.js turns into a zero radius cusp in the last few metres of
   * every lap.
   */
  const first = course.stops[0];
  if (first) {
    const firstEl = siteEl.get(first.siteId);
    const target = toDoc(first.x, first.z);
    const second = course.stops.find((s) => s.siteId !== first.siteId);
    const away = second ? toDoc(second.x, second.z) : { x: target.x + 1, y: target.y };
    let yaw = Math.atan2(away.y - target.y, away.x - target.x);
    if (firstEl && kindOf(firstEl) === KIND.APERTURE) {
      const n = apertureFrame(firstEl.yaw, 0).normal;
      const onward = Math.cos(yaw) * n.x + Math.sin(yaw) * n.y;
      const sign = onward >= 0 ? 1 : -1;
      yaw = Math.atan2(n.y * sign, n.x * sign);
    }
    addEl(doc, 'startPads', target.x - Math.cos(yaw) * GRID_BACK, target.y - Math.sin(yaw) * GRID_BACK, {
      name: 'Grid',
      yaw,
      yawOverridden: true,
    });
  }

  /* The flying order. One entry per stop, minus the consecutive repeats,
   * which are two knots in the same place and give the line no direction. */
  for (const stop of course.stops) {
    if (stop.repeatOf != null) {
      continue;
    }
    const el = siteEl.get(stop.siteId);
    if (!el) {
      continue;
    }
    addToSequence(doc, el.id, kindOf(el) === KIND.APERTURE ? stop.level : 0);
  }

  /*
   * A stack flown top hole first and bottom hole second is a split-S, and
   * saying so is what makes the line wrap round the outside of the structure
   * instead of climbing through its frame. Only a run of consecutive entries
   * on one element counts: a stack flown at position 4 and again at 19 is two
   * passes, not a figure.
   */
  applyAutoFaces(doc);
  for (let i = 0; i + 1 < doc.sequence.length; i += 1) {
    const a = doc.sequence[i];
    const b = doc.sequence[i + 1];
    if (a.elementId !== b.elementId) {
      continue;
    }
    const el = elementById(doc, a.elementId);
    if (!el || aperturesOf(el).length < 2) {
      continue;
    }
    if (a.apertureIndex > b.apertureIndex) {
      applyFigure(doc, el.id, 'splitS');
    }
  }

  return polish(doc);
}

function gqTrack() {
  return fromPlan('2022 MultiGP GQ', { width: 64, depth: 34 }, [
    { type: 'startPads', x: 54, y: 3, yaw: Math.PI, yawOverridden: true, name: 'Launch' },
    { type: 'gate', x: 31, y: 15.2, name: '1 timing' },
    { type: 'flag', x: 19.5, y: 7.3, name: '2' },
    /* 3-4-5 is a U: west through 3, south through 4, then out through 5
     * toward 6. Auto-face aims each gate along the bisector of the turn, so
     * the middle of a U comes out facing across the hole, which is the wall
     * in front of the pair. The diagram's headings are the flight through
     * each opening, pinned. */
    { type: 'gate', x: 8, y: 7.3, name: '3', yaw: Math.PI, yawOverridden: true },
    { type: 'gate', x: 8, y: 4.9, name: '4', yaw: -Math.PI / 2, yawOverridden: true },
    { type: 'gate', x: 5.5, y: 7.3, name: '5', yaw: Math.atan2(24 - 7.3, 19.5 - 5.5), yawOverridden: true },
    { type: 'gate', x: 19.5, y: 24, name: '6' },
    { type: 'flag', x: 2, y: 24, name: '7' },
    /* Flag 8 is 2 ft off gate 9's left stake, not on the centreline. The
     * previous plan put it 1.5 m west of the opening, which is the hole. */
    { type: 'flag', x: 3.5 - 0.2, y: 26.2 - (LEG_HALF + FLAG_GAP), name: '8' },
    { type: 'gate', x: 3.5, y: 26.2, name: '9', yaw: 0, yawOverridden: true },
    {
      type: 'barrier',
      x: 3.5,
      y: 29.2,
      name: 'Hurdle',
      yaw: 0,
      dims: { width: 10 * FT, depth: 0.4, height: 5 * FT },
      sequence: false,
    },
    { type: 'doubleStack', x: 31, y: 26.2, name: '10-11', figure: 'splitS', yaw: 0, yawOverridden: true },
    { type: 'flag', x: 50, y: 26.2, name: '12' },
    { type: 'gate', x: 50, y: 15.2, name: '13' },
    { type: 'gate', x: 50, y: 8.5, name: '14', yaw: -Math.PI / 2, yawOverridden: true },
    { type: 'flag', x: 50 - (LEG_HALF + FLAG_GAP), y: 8.5 + 0.2, name: '15' },
  ]);
}

function sampleHitsPvc(smp, el) {
  if (kindOf(el) !== KIND.APERTURE || el.type === 'diveGate') {
    return false;
  }
  const frame = apertureFrame(el.yaw, el.pitch || 0);
  const dx = smp.pos.x - el.position.x;
  const dy = smp.pos.y - el.position.y;
  const dz = smp.pos.z - (el.position.z || 0);
  const alongN = dx * frame.normal.x + dy * frame.normal.y + dz * frame.normal.z;
  if (Math.abs(alongN) > 0.22) {
    return false;
  }
  const alongW = dx * frame.widthAxis.x + dy * frame.widthAxis.y;
  const aps = aperturesOf(el);
  if (!aps.length) {
    return false;
  }
  const halfW = (aps[0].clearW || CLEAR) / 2;
  const minH = aps[0].sillH - 0.06;
  const top = aps[aps.length - 1];
  const maxH = top.sillH + top.clearH + 0.08;
  if (alongW < -halfW - 0.12 || alongW > halfW + 0.12) {
    return false;
  }
  if (dz < minH || dz > maxH) {
    return false;
  }
  for (const ap of aps) {
    const inW = Math.abs(alongW) <= ap.clearW / 2 - 0.06;
    const inH = dz >= ap.sillH + 0.06 && dz <= ap.sillH + ap.clearH - 0.06;
    if (inW && inH) {
      return false;
    }
  }
  return true;
}

function inspectFlight(doc) {
  const path = buildPath(doc);
  const warnings = collectWarnings(doc, path);
  const clips = [];
  for (const el of doc.elements) {
    if (el.type !== 'flag' && el.type !== 'cone') {
      continue;
    }
    const hit = minDistTo(path, el.position.x, el.position.y);
    const rad = (el.dims.poleRadius || 0.025) + CRAFT;
    const seq = doc.sequence.find((s) => s.elementId === el.id);
    if (hit.d < rad) {
      clips.push(`${el.name || el.type} CLIP d=${hit.d.toFixed(2)}m at ${hit.s.toFixed(0)}m ${seq ? `pass ${seq.passSide}` : 'unsequenced'}`);
    }
  }
  const flagged = doc.elements.filter((e) => e.type === 'flaggedGate' || e.type === 'flaggedDoubleStack');
  /*
   * Openings well off the ground. NOT a fault any more, and the change is
   * the point: the old import pinned every aperture to z=0, so anything
   * above it was a bug, and this listed them. Heights now come from the
   * checkpoints that mark the holes, so a raised opening is usually the
   * author's. It is still worth printing, because a gate 15 m up is either
   * FAI Turkiye's rooftop section or a misread, and only a person can tell.
   */
  const raised = doc.elements.filter((el) => (
    kindOf(el) === KIND.APERTURE
    && el.type !== 'diveGate'
    && ((el.position.z || 0) + (el.dims?.sillH || 0)) > 1.5
  )).map((el) => `${el.name || el.type} at ${((el.position.z || 0) + (el.dims?.sillH || 0)).toFixed(2)} m`);
  const inFront = [];
  const apertures = doc.elements.filter((e) => kindOf(e) === KIND.APERTURE);
  for (const flag of doc.elements) {
    if (flag.type !== 'flag' && flag.type !== 'cone') {
      continue;
    }
    for (const gate of apertures) {
      const row = flagCorridor(flag, gate);
      const blocking = row.inHole || (row.onApproach && flagBeforeGate(doc, flag, gate));
      if (blocking) {
        inFront.push(`${flag.name || 'flag'} in line of ${gate.name || gate.type}`);
      }
    }
  }
  const pvc = [];
  const wrapSeg = new Set();
  path.knots.forEach((k, i) => {
    if (k.role === 'wrap') {
      wrapSeg.add(i - 1);
      wrapSeg.add(i);
    }
  });
  for (const smp of path.samples) {
    if (wrapSeg.has(smp.segment)) {
      continue;
    }
    for (const el of apertures) {
      let nearKnot = false;
      for (const k of path.knots) {
        if (k.elementId !== el.id) {
          continue;
        }
        if (Math.hypot(smp.pos.x - k.pos.x, smp.pos.y - k.pos.y, (smp.pos.z || 0) - (k.pos.z || 0)) < 0.5) {
          nearKnot = true;
          break;
        }
      }
      if (nearKnot) {
        continue;
      }
      const a = path.knots[smp.segment];
      const b = path.knots[smp.segment + 1];
      if (el.id === a?.elementId || el.id === b?.elementId) {
        continue;
      }
      if (sampleHitsPvc(smp, el)) {
        pvc.push(`${el.name || el.type} at ${smp.s.toFixed(0)}m`);
        break;
      }
    }
  }
  const seqIds = doc.sequence.map((s) => s.id);
  const dupIds = seqIds.filter((id, i) => seqIds.indexOf(id) !== i);
  const seqBrief = doc.sequence.map((s) => {
    const el = elementById(doc, s.elementId);
    const tag = el?.type === 'flag' ? `F${s.passSide?.[0] || '?'}` : (el?.type || '?');
    const ap = s.apertureIndex != null ? `@${s.apertureIndex}` : '';
    return `${el?.name || tag}${ap}`;
  }).join('>');
  return {
    path,
    warnings,
    clips,
    flagged: flagged.map((e) => `${e.name || e.type}:${e.flagSide}`).join(','),
    raised,
    inFront,
    pvc: [...new Set(pvc)],
    dupIds,
    seqBrief,
  };
}

function summarise(doc) {
  const flight = inspectFlight(doc);
  const warns = flight.warnings.filter((w) => w.level === 'warn').map((w) => w.code);
  return {
    name: doc.name,
    id: doc.id,
    gates: doc.sequence.length,
    elements: doc.elements.length,
    field: `${doc.field.width}x${doc.field.depth}`,
    lapM: flight.path.length ? flight.path.length.toFixed(1) : '0',
    warns,
    clips: flight.clips,
    flagged: flight.flagged,
    raised: flight.raised,
    inFront: flight.inFront,
    pvc: flight.pvc,
    dupIds: flight.dupIds,
    seqBrief: flight.seqBrief,
    messages: flight.warnings,
  };
}

async function loadKeys() {
  try {
    return JSON.parse(await readFile(KEYS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function saveKeys(keys) {
  await writeFile(KEYS_PATH, `${JSON.stringify(keys, null, 2)}\n`);
}

async function publish(doc, keys) {
  const res = await fetch(`${BOARD}/api/tracks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      author: AUTHOR,
      document: JSON.parse(serialize(doc)),
      editKey: keys[doc.id] || '',
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `board ${res.status}`);
  }
  if (body.editKey) {
    keys[doc.id] = body.editKey;
  }
  return body;
}

const doPublish = process.argv.includes('--publish');
/* Every warning in full rather than a list of codes. A course that trips
 * eleven reversals is either eleven hairpins or one mistake, and the codes
 * alone cannot tell you which. */
const doExplain = process.argv.includes('--warnings');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const docs = [];
for (const spec of TRK_FILES) {
  if (only && !spec.name.toLowerCase().includes(only.toLowerCase())) {
    continue;
  }
  const raw = await readFile(join(here, spec.file), 'utf8');
  docs.push(fromTrk(raw, spec.name));
}
if (!only) {
  docs.push(gqTrack());
}

const outDir = join(here, 'json');
await mkdir(outDir, { recursive: true });
const keys = await loadKeys();

for (const doc of docs) {
  const info = summarise(doc);
  const jsonPath = join(outDir, `${doc.id}.json`);
  await writeFile(jsonPath, serialize(doc));
  const extra = [
    info.warns.length ? info.warns.join(',') : 'clean',
    info.flagged ? `flags ${info.flagged}` : '',
    info.clips.length ? `CLIPS ${info.clips.join(' | ')}` : '',
    info.raised?.length ? `RAISED ${info.raised.join(' | ')}` : '',
    info.inFront?.length ? `FRONT ${info.inFront.join(' | ')}` : '',
    info.pvc?.length ? `PVC ${info.pvc.join(' | ')}` : '',
    info.dupIds?.length ? `DUP ${info.dupIds.join(',')}` : '',
    info.seqBrief ? `seq ${info.seqBrief}` : '',
  ].filter(Boolean).join('  ');
  console.log(`${info.name}  ${info.id}  ${info.field}  ${info.gates} gates  lap ${info.lapM} m  ${extra}`);
  if (doExplain) {
    for (const w of info.messages) {
      console.log(`    ${w.level === 'warn' ? 'WARN' : 'note'} ${w.code}: ${w.message}`);
    }
  }
  if (doPublish) {
    try {
      const posted = await publish(doc, keys);
      console.log(`  published ${posted.id} ${posted.updated ? 'updated' : 'new'}`);
    } catch (e) {
      console.log(`  publish failed: ${e.message}`);
    }
  }
}

await saveKeys(keys);
console.log(`wrote ${docs.length} documents to ${outDir}`);
