/*
 * warnings.js: everything the results panel has to say about a track.
 *
 * WARNINGS ARE ADVISORY. Nothing in this file may stop a save, an export or
 * an edit. A course designer laying out a deliberately brutal split-S knows
 * more about it than a threshold does, and a tool that refuses to save is a
 * tool people stop using. Every warning names the element and, where it can,
 * the distance along the lap where the problem is, so it can be found.
 *
 * The five the task asks for, all present and each with its own code:
 *   no-face        an element with no entry face set
 *   reversal       two consecutive elements whose faces send the line backwards
 *   tight-corner   a radius of curvature under the track's threshold
 *   barrier        a path segment passing through a barrier
 *   out-of-field   the path leaving the field boundary
 *
 * Plus the ones a designer finds out about the hard way otherwise: an
 * element placed and never sequenced, a lap that does not close, two knots
 * on top of each other, and a line that goes underground.
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

import { ELEMENTS, KIND, TUNING } from './elements.js';
import { elementById, kindOf, startPadsOf } from './model.js';
import { sequenceLabel, unsequencedElements } from './sequence.js';
import { dist, dot, insideYawedBox, lerp, normalize, sub } from './geometry.js';

function warn(code, message, extra = {}) {
  return { level: 'warn', code, message, ...extra };
}

function note(code, message, extra = {}) {
  return { level: 'info', code, message, ...extra };
}

/*
 * Inspect a track and the line derived from it. `path` is what buildPath
 * returned; pass null to get only the checks that do not need a line.
 */
export function collectWarnings(doc, path) {
  const out = [];

  /* -------- the course itself, no line needed -------- */

  if (!doc.sequence.length) {
    out.push(note('empty', 'Nothing is in the flying order yet. Place an element and it joins the order automatically.'));
  }

  if (!startPadsOf(doc)) {
    out.push(note('no-start', 'No start pads. The line runs from the first element to the last and the lap does not close. Press S to place them.'));
  }

  for (const el of unsequencedElements(doc)) {
    const def = ELEMENTS[el.type];
    out.push(warn('unsequenced', `${el.name || def.label} is on the field but not in the flying order, so the line ignores it.`, {
      elementId: el.id,
    }));
  }

  doc.sequence.forEach((s, i) => {
    const el = elementById(doc, s.elementId);
    if (!el) {
      return;
    }
    if (kindOf(el) === KIND.APERTURE && s.entry === 0) {
      out.push(warn('no-face', `${i + 1}. ${sequenceLabel(doc, s)} has no entry face set, so the line guessed one.`, {
        seqId: s.id,
        elementId: el.id,
      }));
    }
  });

  /* Elements standing outside the field are usually a mis-drag rather than
   * a decision. Checked separately from the line, because a barrier can be
   * off the field and still matter. */
  for (const el of doc.elements) {
    const { x, y } = el.position;
    if (x < 0 || y < 0 || x > doc.field.width || y > doc.field.depth) {
      out.push(warn('element-out-of-field', `${el.name || ELEMENTS[el.type].label} is standing outside the field.`, {
        elementId: el.id,
      }));
    }
  }

  if (!path || path.knots.length < 2) {
    return out;
  }

  /* -------- reversals, read off the knots -------- */

  for (let i = 0; i < path.knots.length - 1; i += 1) {
    const a = path.knots[i];
    const b = path.knots[i + 1];
    const span = dist(a.pos, b.pos);
    if (span < 1e-6) {
      out.push(warn('coincident', `${describe(doc, a)} and ${describe(doc, b)} are in the same place, so the line has no direction between them.`, {
        seqId: a.seq?.id ?? b.seq?.id ?? null,
      }));
      continue;
    }
    if (hasFace(a) && reversed(a.tangent, a.pos, b.pos)) {
      out.push(warn('reversal', a.role === 'start'
        ? `The lap sets off away from ${describe(doc, b)}. Turn the start pads, or reorder the course.`
        : `${describe(doc, a)} faces away from ${describe(doc, b)}. The line leaves it backwards. Press X to flip the face.`, {
        seqId: a.seq?.id ?? null,
        elementId: a.elementId,
      }));
    }
    if (hasFace(b) && reversed(b.tangent, a.pos, b.pos)) {
      out.push(warn('reversal', b.role === 'finish'
        ? `The lap comes back to the start line from in front of it, after ${describe(doc, a)}. Turn the start pads, or move the last element behind them.`
        : `${describe(doc, b)} faces back towards ${describe(doc, a)}. The line arrives at it backwards. Press X to flip the face.`, {
        seqId: b.seq?.id ?? null,
        elementId: b.elementId,
      }));
    }
  }

  /* -------- curvature -------- */

  const limit = doc.settings.minCurveRadius;
  let worst = null;
  for (const smp of path.samples) {
    const seg = path.segments[smp.segment];
    /* A wrap around a stacked gate is supposed to be tight. The warning is
     * for the lap between obstacles, not for the figure itself. */
    if (seg && (seg.a.role === 'wrap' || seg.b.role === 'wrap')) {
      continue;
    }
    if (smp.radius < limit && (worst == null || smp.radius < worst.radius)) {
      worst = smp;
    }
  }
  if (worst) {
    out.push(warn('tight-corner', `The line turns tighter than ${limit.toFixed(1)} m at ${worst.s.toFixed(1)} m along the lap: ${worst.radius.toFixed(2)} m radius. Nothing flies that.`, {
      s: worst.s,
      pos: worst.pos,
    }));
  }

  /* -------- barriers -------- */

  const barriers = doc.elements.filter((e) => kindOf(e) === KIND.OBSTACLE);
  for (const bar of barriers) {
    const hit = firstBarrierHit(path, bar);
    if (hit) {
      out.push(warn('barrier', `The line passes through ${bar.name || ELEMENTS[bar.type].label} at ${hit.s.toFixed(1)} m along the lap.`, {
        elementId: bar.id,
        s: hit.s,
        pos: hit.pos,
      }));
    }
  }

  /* -------- the field, and the ground -------- */

  const slack = TUNING.boundarySlack;
  let outside = null;
  let under = null;
  for (const smp of path.samples) {
    const p = smp.pos;
    if (!outside && (p.x < -slack || p.y < -slack || p.x > doc.field.width + slack || p.y > doc.field.depth + slack)) {
      outside = smp;
    }
    if (!under && p.z < -slack) {
      under = smp;
    }
  }
  if (outside) {
    out.push(warn('out-of-field', `The line leaves the field at ${outside.s.toFixed(1)} m along the lap.`, {
      s: outside.s,
      pos: outside.pos,
    }));
  }
  if (under) {
    out.push(warn('underground', `The line goes below the ground at ${under.s.toFixed(1)} m along the lap.`, {
      s: under.s,
      pos: under.pos,
    }));
  }

  return out;
}

/*
 * Is a tangent pointing backwards along the course?
 *
 * THE TEST IS HORIZONTAL, AND THAT IS A DECISION, not an oversight.
 *
 * A reversal is a gate facing the wrong way round, which is a thing that
 * happens on the PLAN: the line doubles back on itself. Vertical is
 * different. A dive gate's normal points at the sky, so it is flown straight
 * down through, and the previous element is almost always lower than it: the
 * quad climbs past the gate and drops back through it, which is what the
 * obstacle exists for and what the Hermite arc between the two knots draws.
 * Comparing a straight down tangent against a rising chord and calling it a
 * reversal would fire on every correctly built dive gate on every track, and
 * a warning that is always wrong is a warning nobody reads.
 *
 * So a tangent with essentially no horizontal component is exempt: it is
 * flown up or down and it cannot point backwards along the plan. The
 * curvature warning is what catches a vertical approach so extreme that
 * nothing could fly it.
 */
const HORIZONTAL_FLOOR = 0.2;

/*
 * Only a knot that HAS a face can reverse.
 *
 * A flag or a cone has no aperture and no plane. Its tangent is not a
 * property of the marker at all, it is the chord between its neighbours, so
 * comparing that tangent against one of those same chords tests the shape of
 * the course rather than anything the author set, and it fires whenever a
 * marker sits at a turn apex, which is the ONE place a turn marker is ever
 * put. Telling somebody to "flip the face" of a cone, which has no face, is
 * worse than saying nothing. A hairpin round a marker is what the curvature
 * warning is for.
 *
 * The start pads do have a heading, which the author chose and can turn, so
 * they stay in.
 */
function hasFace(knot) {
  return knot.role === 'start' || knot.role === 'finish' || knot.role === 'aperture';
}

function reversed(tangent, from, to) {
  const th = Math.hypot(tangent.x, tangent.y);
  if (th < HORIZONTAL_FLOOR) {
    return false;
  }
  const cx = to.x - from.x;
  const cy = to.y - from.y;
  const ch = Math.hypot(cx, cy);
  if (ch < 1e-6) {
    return false;
  }
  return (tangent.x * cx + tangent.y * cy) / (th * ch) < 0;
}

function describe(doc, knot) {
  if (knot.role === 'start') {
    return 'The start pads';
  }
  if (knot.role === 'finish') {
    return 'the finish line';
  }
  if (!knot.seq) {
    return 'a knot';
  }
  return `${knot.index}. ${sequenceLabel(doc, knot.seq)}`;
}

/*
 * Where the line first enters a barrier, or null.
 *
 * The polyline is subdivided four ways between samples before testing,
 * because a barrier can be thinner than the sample spacing and a test that
 * only looks at the samples would let the line pass clean through a fence.
 */
function firstBarrierHit(path, bar) {
  const halfW = bar.dims.width / 2;
  const halfD = bar.dims.depth / 2;
  const minZ = bar.position.z;
  const maxZ = bar.position.z + bar.dims.height;
  const pad = TUNING.barrierClearance;
  const sub4 = 4;
  for (let i = 0; i < path.samples.length; i += 1) {
    const a = path.samples[i];
    const b = path.samples[Math.min(path.samples.length - 1, i + 1)];
    for (let j = 0; j < sub4; j += 1) {
      const t = j / sub4;
      const p = lerp(a.pos, b.pos, t);
      if (insideYawedBox(p, bar.position, bar.yaw, halfW, halfD, minZ, maxZ, pad)) {
        return { s: a.s + (b.s - a.s) * t, pos: p };
      }
    }
  }
  return null;
}

/* Warnings first, notes after, and inside each group the order they were
 * found, which is course order. */
export function sortWarnings(list) {
  return [...list].sort((a, b) => {
    if (a.level === b.level) {
      return 0;
    }
    return a.level === 'warn' ? -1 : 1;
  });
}
