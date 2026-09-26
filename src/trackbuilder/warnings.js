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

import { ELEMENTS, KIND, TUNING, trackClassOf, tuningFor, docModeOf } from './elements.js';
/* A map is checked against the world it builds, not against a racing line:
 * the same placed solids the simulator hands the physics. All pure, no
 * Three.js, so the checks run in Node too. */
import { placeDocument, topUnder } from '../maps/built/place.js';
import { placeSolids } from '../props/solids.js';
import { sincos, turnY } from '../props/trig.js';
import { GAP_MIN } from '../props/parts.js';
import {
  GATE_OPENING_MIN, GATE_OPENING_MAX, GATE_SPACING_MIN, GATE_SPACING_MAX,
  GROUND_GATE_CENTRE_MAX, STACK2_CENTRE_MIN, STACK3_CENTRE_MIN,
  POLE_FROM_GATE_MIN, POLE_FROM_POLE_MIN, PIPE_OD, ROOM_HEIGHT, envelopeFor, inches,
} from './racegow.js';
import { elementById, elementNormal, kindOf, startPadsOf } from './model.js';
import { sequenceLabel, unsequencedElements } from './sequence.js';
import { dist, insideYawedBox, lerp, wrapAngle, yawVector } from './geometry.js';
/* Roads and vehicles: what the physics will be handed (trafficOf, whose
 * problems are the limits, never restated here), the road's eased line, and
 * the road tool's own tests. */
import { trafficOf } from '../maps/built/traffic.js';
import { roadOf } from '../maps/built/road.js';
import {
  footprint, laneClashes, lineShapeDist, roadReach, startOverlaps,
} from './roadtool.js';

function warn(code, message, extra = {}) {
  return { level: 'warn', code, message, ...extra };
}

function note(code, message, extra = {}) {
  return { level: 'info', code, message, ...extra };
}

/*
 * THE POLES THAT ARE SOMEBODY'S LEG.
 *
 * RaceGOW builds much of its track by carrying one leg of a gate up past
 * the bar: the pipe above the bar is a pole and the pipe below it is the
 * gate's upright, one length of PVC on one fitting. The official Track 1,
 * Track 5 and Track 8 all do it, and two of them do it with a leg the lap
 * never flies around, which is simply the pipe that holds the opening over
 * the bar up.
 *
 * Such a pole is not a pole in the rules' sense and it is not a forgotten
 * element either, so the clearance rules and the unsequenced warning both
 * skip it. Anything standing further than half a pipe from a gate's own
 * frame line is a pole somebody put there, and every rule still holds it.
 *
 * Returns the element ids of the poles that are legs.
 */
function frameLegs(doc) {
  const legs = new Set();
  const gates = doc.elements.filter((e) => ELEMENTS[e.type]?.kind === KIND.APERTURE
    && Math.abs(e.pitch || 0) <= 1e-3);
  const poles = doc.elements.filter((e) => ELEMENTS[e.type]?.kind === KIND.MARKER
    && e.type !== 'waypoint');
  for (const p of poles) {
    for (const g of gates) {
      const w = ((g.dims?.clearW ?? 0) + PIPE_OD) / 2;
      const across = yawVector((g.yaw || 0) + Math.PI / 2);
      for (const side of [-1, 1]) {
        const sx = g.position.x + across.x * side * w;
        const sy = g.position.y + across.y * side * w;
        if (Math.hypot(p.position.x - sx, p.position.y - sy) <= PIPE_OD) {
          legs.add(p.id);
        }
      }
    }
  }
  return legs;
}

/*
 * Inspect a track and the line derived from it. `path` is what buildPath
 * returned; pass null to get only the checks that do not need a line.
 */
export function collectWarnings(doc, path) {
  /* A map has no flying order and no line, so none of the race warnings
   * mean anything on one, and the race track's list is untouched by maps. */
  if (docModeOf(doc) === 'freestyle') {
    return freestyleReport(doc).warnings;
  }
  const out = [];
  const legs = frameLegs(doc);
  if (trackClassOf(doc) === 'micro') {
    collectRaceGowWarnings(doc, out, legs);
  }

  /* -------- the course itself, no line needed -------- */

  if (!doc.sequence.length) {
    out.push(note('empty', 'Nothing is in the flying order yet. Place an element and it joins the order automatically.'));
  }

  if (!startPadsOf(doc)) {
    out.push(note('no-start', 'No start pads. The line runs from the first element to the last and the lap does not close. Press S to place them.'));
  }

  for (const el of unsequencedElements(doc)) {
    if (legs.has(el.id)) {
      continue;
    }
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
      out.push(warn('reversal', `${describe(doc, a)} faces away from ${describe(doc, b)}. The line leaves it backwards. Press X to flip the face.`, {
        seqId: a.seq?.id ?? null,
        elementId: a.elementId,
      }));
    }
    if (hasFace(b) && reversed(b.tangent, a.pos, b.pos)) {
      out.push(warn('reversal', `${describe(doc, b)} faces back towards ${describe(doc, a)}. The line arrives at it backwards. Press X to flip the face.`, {
        seqId: b.seq?.id ?? null,
        elementId: b.elementId,
      }));
    }
  }

  const pads = startPadsOf(doc);
  const first = path.knots[0];
  if (pads && first && first.role !== 'finish') {
    const heading = yawVector(pads.yaw);
    if (reversed(heading, pads.position, first.pos)) {
      out.push(warn('reversal', `The lap sets off away from ${describe(doc, first)}. Turn the start pads, or reorder the track.`, {
        elementId: pads.id,
      }));
    }
  }
  if (path.closed && path.knots.length >= 2) {
    const lastReal = path.knots[path.knots.length - 2];
    if (first.role === 'aperture' && reversed(first.tangent, lastReal.pos, first.pos)) {
      out.push(warn('reversal', `The lap comes back to ${describe(doc, first)} from in front of it, after ${describe(doc, lastReal)}. Flip that face, or move the last element behind it.`, {
        seqId: first.seq?.id ?? null,
        elementId: first.elementId,
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
  /* The clearance a barrier gets is the TRACK CLASS'S: the line is a
   * centreline and the machine that flies it is 0.35 m wide or 0.096 m
   * wide. */
  const barrierPad = tuningFor(trackClassOf(doc)).barrierClearance;
  for (const bar of barriers) {
    const hit = firstBarrierHit(path, bar, barrierPad);
    if (hit) {
      out.push(warn('barrier', `The line passes through ${bar.name || ELEMENTS[bar.type].label} at ${hit.s.toFixed(1)} m along the lap.`, {
        elementId: bar.id,
        s: hit.s,
        pos: hit.pos,
      }));
    }
  }

  /* -------- the field, and the ground -------- */

  const slack = tuningFor(trackClassOf(doc)).boundarySlack;
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
 * The start pads have a heading, which the author chose and can turn, and
 * that is checked against the first sequenced knot separately. A finish
 * knot is a copy of that first knot so the Hermite closes; it is not a
 * face of its own.
 */
function hasFace(knot) {
  return knot.role === 'aperture';
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
  /* No 'start' case: the pads are not a knot any more, and the one warning
   * that names them names the element itself. A 'finish' knot is a copy of
   * the first sequenced knot, so it describes itself as that. */
  if (knot.role === 'finish' && !knot.seq) {
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
function firstBarrierHit(path, bar, pad) {
  const halfW = bar.dims.width / 2;
  const halfD = bar.dims.depth / 2;
  const minZ = bar.position.z;
  const maxZ = bar.position.z + bar.dims.height;
  const sub4 = 4;
  /*
   * Stop one short and test the last sample on its own. The loop used to run
   * to the end and clamp b to the final index, so the last iteration had
   * a === b and interpolated the same point four times.
   */
  const n = path.samples.length;
  for (let i = 0; i < n - 1; i += 1) {
    const a = path.samples[i];
    const b = path.samples[i + 1];
    for (let j = 0; j < sub4; j += 1) {
      const t = j / sub4;
      const p = lerp(a.pos, b.pos, t);
      if (insideYawedBox(p, bar.position, bar.yaw, halfW, halfD, minZ, maxZ, pad)) {
        return { s: a.s + (b.s - a.s) * t, pos: p };
      }
    }
  }
  const last = n ? path.samples[n - 1] : null;
  if (last && insideYawedBox(last.pos, bar.position, bar.yaw, halfW, halfD, minZ, maxZ, pad)) {
    return { s: last.s, pos: last.pos };
  }
  return null;
}

/*
 * THE RACEGOW RULES, on a micro track only.
 *
 * These are not the tool's opinion about what flies well, which is what
 * every other warning in this file is. They are somebody else's PUBLISHED
 * RULES, quoted in src/trackbuilder/racegow.js, and a track that breaks one
 * of them is a track whose time would not be accepted. So they are warnings
 * rather than refusals, exactly like the rest of this file, but the message
 * says which rule and what the number should be, because an author checking
 * their build against a YouTube video needs the inches as well as the
 * millimetres.
 *
 * The one rule this cannot check is the one about the flying: "you cannot
 * intentionally fly through any gates in the opposite direction to shorten
 * your line". That is a property of a run, not of a track.
 */
function collectRaceGowWarnings(doc, out, legs) {
  const gates = [];
  const poles = [];
  for (const el of doc.elements) {
    const def = ELEMENTS[el.type];
    if (!def) {
      continue;
    }
    if (def.kind === KIND.APERTURE) {
      gates.push(el);
    } else if (def.kind === KIND.MARKER && el.type !== 'waypoint') {
      poles.push(el);
    }
  }

  /*
   * EVERY GATE FACES ALONG AN AXIS, so the angle between any two of them is
   * a multiple of 90 degrees.
   *
   * A RaceGOW track is a kit of straight pipe and right angle fittings.
   * There is no diagonal fitting, so there is no diagonal gate: the whole
   * build sits on a rectangular grid and the only headings available are
   * the four square ones.
   *
   * Nothing here checked it, and that is why this exists. The RaceGOW5
   * reconstructions were built with gates 26 degrees off the axis, from an
   * isometric render misread, and every rule in this file passed them.
   * Measured against the first gate rather than against the world, because
   * a track is allowed to sit at any angle in the room: it is the angle
   * BETWEEN gates that is square, not the angle to the wall.
   */
  if (gates.length > 1) {
    const base = gates[0].yaw;
    for (const el of gates.slice(1)) {
      /* Fold into the first quadrant: a gate flown from the other side is
       * the same wall, so 180 degrees is square and so is 90. */
      const off = Math.abs(wrapAngle(el.yaw - base));
      const q = Math.PI / 2;
      const skew = Math.abs(off - Math.round(off / q) * q);
      if (skew > 0.02) {
        out.push(warn('rg-square-headings',
          `${label(el)} is ${(skew * 180 / Math.PI).toFixed(1)} deg off square from ${label(gates[0])}. Every gate faces along one of the two track axes: set its Yaw a right angle from theirs.`,
          { elementId: el.id }));
      }
    }
  }

  /* Rule 1 and the season doc's minimum: 24 to 28 inches of clear opening. */
  for (const el of gates) {
    const w = el.dims.clearW;
    const h = el.dims.clearH;
    const big = Math.max(w, h);
    const small = Math.min(w, h);
    if (big > GATE_OPENING_MAX + 1e-6) {
      out.push(warn('rg-opening-max',
        `${label(el)} opens ${inches(big)}. A RaceGOW gate fits inside a 28 in square.`,
        { elementId: el.id }));
    } else if (small < GATE_OPENING_MIN - 1e-6) {
      out.push(warn('rg-opening-min',
        `${label(el)} opens ${inches(small)}. RaceGOW's minimum gate is 24 in.`,
        { elementId: el.id }));
    }
  }

  /*
   * "No maximum size but all your gates must be the same size. You must
   * scale the entire track up equally based on your gate size." Checked
   * against the FIRST gate rather than against a constant, because the rule
   * is uniformity, not a particular size.
   */
  if (gates.length > 1) {
    const ref = gates[0];
    const odd = gates.filter((el) => Math.abs(el.dims.clearW - ref.dims.clearW) > 0.002
      || Math.abs(el.dims.clearH - ref.dims.clearH) > 0.002);
    if (odd.length) {
      out.push(warn('rg-opening-mixed',
        `${odd.length === 1 ? label(odd[0]) : `${odd.length} gates`} ${odd.length === 1 ? 'is' : 'are'} a different size from ${label(ref)}. Every gate on a RaceGOW track is the same size.`,
        { elementId: odd[0].id }));
    }
  }

  /*
   * Rule 4 and rule 5, the heights, per opening. A stack's own levels are
   * the commonest place these are broken, and they are broken by the level
   * pitch rather than by the sill, so the message names the pitch.
   */
  for (const el of gates) {
    const levels = Math.max(1, Math.round(el.dims.levels ?? 1));
    for (let i = 0; i < levels; i += 1) {
      const sill = el.position.z + el.dims.sillH + i * (el.dims.levelPitch ?? 0);
      const centre = sill + el.dims.clearH / 2;
      if (i === 0 && el.dims.sillH < 0.001 && el.position.z < 0.001) {
        if (centre > GROUND_GATE_CENTRE_MAX + 1e-6) {
          out.push(warn('rg-ground-centre',
            `${label(el)} has its bottom opening's centre at ${inches(centre)}. A gate on the ground has its centre at 20 in or lower.`,
            { elementId: el.id }));
        }
      }
      if (i === 1 && centre < STACK2_CENTRE_MIN - 1e-6) {
        out.push(warn('rg-stack2',
          `${label(el)}'s second opening is centred at ${inches(centre)}. The top gate of a two high stack must be at least 42 in up.`,
          { elementId: el.id }));
      }
      if (i === 2 && centre < STACK3_CENTRE_MIN - 1e-6) {
        out.push(warn('rg-stack3',
          `${label(el)}'s third opening is centred at ${inches(centre)}. A third gate must be at least 69 in up.`,
          { elementId: el.id }));
      }
      /* Not a RaceGOW rule: a ceiling. These are flown indoors and a
       * domestic one is 2.4 m, so an opening whose top is through it is a
       * track nobody can build in the room this class assumes. */
      if (sill + el.dims.clearH > ROOM_HEIGHT) {
        out.push(warn('rg-ceiling',
          `${label(el)} reaches ${inches(sill + el.dims.clearH)}, through the ${ROOM_HEIGHT.toFixed(1)} m ceiling. RaceGOW tracks are flown indoors.`,
          { elementId: el.id }));
      }
    }
    /* Rule 3 applies to a stack's own levels as well as to neighbours. */
    const pitch = el.dims.levelPitch ?? 0;
    if (levels > 1 && (pitch < GATE_SPACING_MIN - 1e-6 || pitch > GATE_SPACING_MAX + 1e-6)) {
      out.push(warn('rg-stack-pitch',
        `${label(el)} stacks its openings ${inches(pitch)} apart. Adjacent gates are 27 to 33 in centre to centre, stacked or side by side.`,
        { elementId: el.id }));
    }
  }

  /*
   * Rule 3 between NEIGHBOURING structures, which is what a side by side
   * pair is, and getting the reading of it right matters more than the
   * arithmetic does.
   *
   * "All adjacent gates must be between 27 and 33 inches from center to
   * center." A first attempt tested every pair inside some adjacency radius
   * and flagged anything outside the band, which flags a course for having
   * two gates 1.1 m apart. But two gates 1.1 m apart are not adjacent gates
   * that are spaced wrongly, they are two gates. The rule constrains pairs
   * that ARE adjacent, and the only way a track can break it is by putting a
   * pair CLOSER than 27 inches, because at that point they are unavoidably
   * adjacent and unavoidably out of band.
   *
   * The upper half of the band is still worth saying, as a NOTE rather than
   * a warning, in the window where a pair is nearly a pair: an author who
   * meant a side by side and typed 36 inches wants to know. Past that the
   * tool says nothing, because there is nothing to say.
   */
  for (let i = 0; i < gates.length; i += 1) {
    for (let j = i + 1; j < gates.length; j += 1) {
      const a = gates[i];
      const b = gates[j];
      /*
       * CENTRE TO CENTRE IN THREE DIMENSIONS, and a two dimensional version
       * of this got RaceGOW's own Track 8 wrong.
       *
       * That track has an Elevated Gate "centered between the Side by Side
       * gates and on the same plane", so in plan it sits 15 inches from each
       * of them, which a flat distance reads as an illegal pair. In space it
       * is 58 inches away, because its centre is 56 inches up. Rule 3 says
       * "center to center of the gates" and a centre has three coordinates.
       */
      const d = Math.hypot(
        a.position.x - b.position.x,
        a.position.y - b.position.y,
        centreOf(a) - centreOf(b),
      );
      if (d < 1e-6) {
        continue;
      }
      /*
       * ONLY PARALLEL PAIRS. Rule 3 says which pairs it means: "both side by
       * side and vertically stacked gates", and those share a frame side, so
       * their openings face the same way. Two gates meeting at right angles
       * share a corner post instead, and RaceGOW5's own Track 8 is built
       * that way: the table under the tower is a Cube Gate whose top is one
       * opening away from the tower's bottom opening, 19 in centre to centre
       * by construction, and the table's far side is a gate at right angles
       * to the tower's, also 19 in. Neither pair is adjacent in the rule's
       * sense, and this check used to fail the official track on both.
       */
      const na = elementNormal(a);
      const nb = elementNormal(b);
      if (Math.abs(na.x * nb.x + na.y * nb.y + na.z * nb.z) < 0.98) {
        continue;
      }
      /*
       * A pair is only NEARLY a pair when it is nearly side by side or
       * nearly stacked, which is an offset along one axis. Two gates on the
       * diagonal of a 27 in lattice are 38 in apart, inside the note's
       * window, and are not a pair anybody meant: they touch at a corner.
       */
      const off = [
        a.position.x - b.position.x, a.position.y - b.position.y, centreOf(a) - centreOf(b),
      ].map(Math.abs);
      const aligned = Math.max(...off) > 0.94 * d;
      if (d < GATE_SPACING_MIN - 1e-6) {
        out.push(warn('rg-spacing',
          `${label(a)} and ${label(b)} are ${inches(d)} apart. Two gates that close are adjacent, and adjacent gates are 27 to 33 in centre to centre.`,
          { elementId: a.id }));
      } else if (aligned && d > GATE_SPACING_MAX + 1e-6 && d < GATE_SPACING_MAX * 1.25) {
        out.push(note('rg-spacing-near',
          `${label(a)} and ${label(b)} are ${inches(d)} apart. If they are meant to be a side by side pair, adjacent gates are 27 to 33 in centre to centre, nominally 30.`,
          { elementId: a.id }));
      }
    }
  }

  /* The pole clearances the Track6 diagram dimensions three times. */
  for (const p of poles) {
    if (legs.has(p.id)) {
      continue;
    }
    for (const g of gates) {
      const d = Math.hypot(p.position.x - g.position.x, p.position.y - g.position.y);
      if (d < POLE_FROM_GATE_MIN - 1e-6) {
        out.push(warn('rg-pole-gate',
          `${label(p)} is ${inches(d)} from ${label(g)}. A pole sits at least 14 in from the centre of a gate.`,
          { elementId: p.id }));
      }
    }
  }
  for (let i = 0; i < poles.length; i += 1) {
    for (let j = i + 1; j < poles.length; j += 1) {
      if (legs.has(poles[i].id) || legs.has(poles[j].id)) {
        continue;
      }
      const d = Math.hypot(poles[i].position.x - poles[j].position.x,
        poles[i].position.y - poles[j].position.y);
      if (d < POLE_FROM_POLE_MIN - 1e-6) {
        out.push(warn('rg-pole-pole',
          `${label(poles[i])} and ${label(poles[j])} are ${inches(d)} apart. Two poles sit at least 36 in apart.`,
          { elementId: poles[i].id }));
      }
    }
  }

  /*
   * The envelope. "All RaceGOW tracks will fit in a 4' x 6' rectangle (if
   * you are using the minimum gate size of 24")", scaled with the gates,
   * measured as the bounding box of everything that is part of the course.
   * A NOTE rather than a warning when it is close, because the envelope is
   * a design guide for a track author rather than a rule a run is judged
   * against, and because the room is deliberately bigger than it.
   */
  if (gates.length) {
    const opening = Math.max(...gates.map((g) => Math.max(g.dims.clearW, g.dims.clearH)));
    const env = envelopeFor(opening);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const el of [...gates, ...poles]) {
      minX = Math.min(minX, el.position.x);
      maxX = Math.max(maxX, el.position.x);
      minY = Math.min(minY, el.position.y);
      maxY = Math.max(maxY, el.position.y);
    }
    const w = maxX - minX + opening;
    const d = maxY - minY + opening;
    const fits = (w <= env.width + 0.02 && d <= env.depth + 0.02)
      || (d <= env.width + 0.02 && w <= env.depth + 0.02);
    if (!fits) {
      out.push(note('rg-envelope',
        `The track spans ${w.toFixed(2)} by ${d.toFixed(2)} m. A RaceGOW track fits ${env.width.toFixed(2)} by ${env.depth.toFixed(2)} m at this gate size.`));
    }
  }
}

/* The height of an aperture element's LOWEST opening's centre, which is what
 * rule 3 measures between. A stack's own levels are checked separately. */
function centreOf(el) {
  return el.position.z + (el.dims.sillH ?? 0) + (el.dims.clearH ?? 0) / 2;
}

/* An element's own name if it has one, its type's label if not. The rule
 * messages read as sentences and "Gate 3" reads better than an id. */
function label(el) {
  return el.name || (ELEMENTS[el.type]?.label ?? el.type);
}

/* ================================================================== */
/* A FREESTYLE MAP                                                     */
/* ================================================================== */

/*
 * WHAT A MAP CAN GET WRONG, checked against the solids it will actually be
 * built from. src/maps/built/place.js places the document exactly as the
 * simulator does, in Three.js world metres (x = docX - W/2, z = -(docY -
 * D/2), y up), and every test below is in that frame. Nothing here is the
 * physics and nothing here reaches it, so plain Math is fine.
 *
 *   fs-no-start      info  no start pads: says where the pilot will start
 *   fs-spawn         warn  the start is inside a solid or within a metre of
 *                          one, so the craft cannot take off cleanly. Measured
 *                          where the simulator seats the craft: on the mat
 *                          it starts on, on the box top under it, and not
 *                          against that box, whose top is its floor, or
 *                          against anything wholly under that floor
 *   fs-pads-seat     warn  the pads' Base is more than 5 cm from what they
 *                          stand on in the simulator: a roof they were
 *                          raised onto, or the ground they float over; or
 *                          the row stands across two heights, so the mats
 *                          beside the craft's float or are buried
 *   fs-overlap       warn  two elements' solids run into each other
 *   fs-slot          warn  a space between two elements narrower than the
 *                          gap rule's 1.4 m but more than a few centimetres:
 *                          a slot a five inch aims at and cannot fit through
 *   fs-gap-blocked   warn  a named gap with a solid across its window
 *   fs-outside       warn  an element standing outside the plot, or
 *                          reaching past its edge
 *   fs-solids        warn  more solids than a map is budgeted
 *   fs-crowded       warn  a patch of the physics' grid holding more shapes
 *                          than it looks at round the craft at once, so
 *                          some would be left out there (crowdOf)
 *
 * And a map's roads and vehicles, only when it has any (roadWarnings):
 *
 *   rd-solid         warn  a road passes within a car's reach of a solid
 *                          that stands lower than its cars' roofs
 *   rd-start         warn  a road passes over the start pads, or within a
 *                          car's reach and a metre of where the craft starts
 *   fs-outside       warn  a road running past the edge of the plot
 *   rd-tight, rd-fold, rd-kink, rd-merged, rd-too-few, rd-crossing
 *                          a road's own problems from src/maps/built/road.js:
 *                          a node it had to leave out (warn), a bend it ran
 *                          straight past (info), and the rest
 *   tr-no-road       warn  a vehicle with no road, its road deleted or never
 *                          given one
 *   tr-*             warn  everything else trafficOf left parked, in its own
 *                          words: more vehicles, lanes or road than the
 *                          physics holds
 *   tr-lane-clash    warn  two cars in one lane that will drive through
 *                          each other: laps of different times, opposite
 *                          ways round one lane, or both on an open road
 *   tr-overlap       warn  two cars that start on top of each other
 *
 * Every warning names an element, so clicking it selects the element.
 */

/* The budget. The module's world holds 49152 shapes (WORLD_MAX_SHAPES in
 * src/native/world.c); a map is kept well under that so the upload, the
 * broad phase and the plan all stay quick on a slow machine. */
export const FREESTYLE_SOLIDS_MAX = 20000;

/* Below this a space is two things touching, not a slot. A building built
 * against another is closed, which the gap rule allows. */
export const SLOT_FLOOR = 0.05;

/* The air the craft needs round the start to take off. */
export const SPAWN_CLEAR = 1.0;

/* How far the pads' Base may be from their seat before the builder says
 * so: more than a mat's thickness and less than anything that reads as a
 * step when the pads are drawn on the seat. */
const SEAT_SLACK = 0.05;

/* How far two solids have to run into each other before it is an overlap
 * rather than two faces that meet. */
const OVERLAP_EPS = 0.01;

/* How far past the edge of the plot a solid may reach before it counts as
 * outside it. */
const PLOT_SLACK = 0.5;

/* A named gap's window is shrunk by this at its edges before testing, so a
 * gap drawn to exactly fill the space between two walls is not blocked by
 * the walls it is drawn between. */
const WINDOW_INSET = 0.05;

/*
 * Place the map and check it. Returns
 *
 *   { warnings, solids, zones, bodies }
 *
 * where solids is the count the physics will hold, zones the named gaps and
 * bodies the elements that have any solid at all.
 */
export function freestyleReport(doc) {
  const out = [];
  const placed = placeDocument(doc);
  const W = placed.W;
  const D = placed.D;
  const names = labeller(doc);

  /*
   * Each element's own solids, and the box round them. place.js hands back
   * one flat list for the physics; the element each solid came from is
   * what a warning has to name, so they are placed again per element here,
   * by the same function with the same numbers.
   */
  const bodies = [];
  for (const it of placed.items) {
    const solids = placeSolids(it.parts, it.x, it.y, it.z, it.yaw, it.turns, []);
    if (!solids.length) {
      continue;
    }
    const boxes = solids.map(solidBox);
    bodies.push({ el: it.el, solids, boxes, box: unionBox(boxes) });
  }

  /* -------- where the pilot starts -------- */

  const pads = startPadsOf(doc);
  if (!pads) {
    out.push(note('fs-no-start', 'No start pads, so the pilot starts 8 m in from the left edge of the plot, halfway up it, facing right. Press S and click where they should start.'));
  }
  {
    /*
     * Where the simulator puts the craft: on the mat it starts on, on the
     * seat under it (src/maps/built/place.js spawnFrom), a hand above it.
     * The box it stands on is not in the way, because its top is the
     * floor: counting it said a craft on a roof was 0.10 m from the
     * building under it.
     */
    const sp = placed.spawn;
    const p = [sp.x, sp.y + 0.1, sp.z];
    /* On a box, what lies wholly under its top is under the floor, not in
     * the air the craft takes off into: a bridge's girders and cross frames
     * under its deck. On the paving there is nothing under the floor. */
    const floor = sp.y > 0 ? sp.y + 0.001 : -Infinity;
    let worst = null;
    let seatEl = null;
    for (const b of bodies) {
      if (boxPointDist(grow(b.box, SPAWN_CLEAR), p) > 0) {
        continue;
      }
      for (let k = 0; k < b.solids.length; k += 1) {
        const s = b.solids[k];
        if (standsOn(s, sp)) {
          seatEl = b.el;
          continue;
        }
        if (b.boxes[k][4] <= floor) {
          continue;
        }
        const d = solidPointClearance(s, p);
        if (d < SPAWN_CLEAR && (!worst || d < worst.d)) {
          worst = { d, el: b.el };
        }
      }
    }
    /* The row is drawn at the seat of the craft's own mat. A mat beside it
     * over a different height floats over it or is buried in it, whatever
     * Base says, so that is said too. */
    const split = pads ? splitMat(placed, pads) : null;
    const across = split
      ? `The row also stands across two heights: mat ${split.n} sits at ${split.y.toFixed(2)} m and the craft's mat at ${sp.y.toFixed(2)} m, so the mats are drawn at ${sp.y.toFixed(2)} m and some float or are buried. Move the row onto one surface.`
      : '';
    if (pads && Math.abs(sp.base - sp.y) > SEAT_SLACK) {
      const where = seatEl ? `on top of ${names(seatEl)} at ${sp.y.toFixed(2)} m` : 'on the ground';
      out.push(warn('fs-pads-seat', `The start pads have a Base of ${sp.base.toFixed(2)} m, but in the simulator they sit ${where}, and the craft starts there. Set Base to ${sp.y.toFixed(2)} m to see them where they will be.${across ? ` ${across}` : ''}`, {
        elementId: pads.id,
      }));
    } else if (split) {
      out.push(warn('fs-pads-seat', `The start pads stand across two heights: mat ${split.n} sits at ${split.y.toFixed(2)} m and the craft's mat at ${sp.y.toFixed(2)} m. The mats are drawn at ${sp.y.toFixed(2)} m, so some float or are buried. Move the row onto one surface.`, {
        elementId: pads.id,
      }));
    }
    if (worst) {
      const where = worst.d <= 0 ? 'inside' : `${worst.d.toFixed(2)} m from`;
      out.push(pads
        ? warn('fs-spawn', `The start pads are ${where} ${names(worst.el)}. The craft needs a metre of clear air round it to take off: move the pads into the open.`, { elementId: pads.id })
        : warn('fs-spawn', `With no start pads the pilot starts ${where} ${names(worst.el)}. Press S and put the start pads in the open.`, { elementId: worst.el.id }));
    }
  }

  /* -------- two elements against each other -------- */

  /*
   * A SWEEP, SO A BIG MAP STAYS QUICK. Bodies are sorted by the west edge
   * of their box, and each is only compared with the ones whose west edge
   * starts before its east edge plus the gap rule's width. On a map of
   * three hundred elements that is a few hundred pairs, not forty five
   * thousand, and only a pair whose boxes come within 1.4 m ever looks at
   * a single solid.
   */
  const order = [...bodies].sort((a, b) => a.box[0] - b.box[0]);
  const docIndex = new Map(doc.elements.map((e, i) => [e.id, i]));
  for (let i = 0; i < order.length; i += 1) {
    const A = order[i];
    const reach = grow(A.box, GAP_MIN);
    for (let j = i + 1; j < order.length; j += 1) {
      const B = order[j];
      if (B.box[0] > reach[3]) {
        break;
      }
      if (!boxesTouch(reach, B.box)) {
        continue;
      }
      const d = bodyClearance(A, B);
      if (d === null) {
        continue;
      }
      /* Named on the one placed later, which is nearly always the one the
       * author has just put down. */
      const [first, later] = docIndex.get(A.el.id) < docIndex.get(B.el.id) ? [A.el, B.el] : [B.el, A.el];
      if (d < -OVERLAP_EPS) {
        out.push(warn('fs-overlap', `${cap(names(later))} runs into ${names(first)}: one is built through the other. Move one of them.`, {
          elementId: later.id,
          otherId: first.id,
        }));
      } else if (d > SLOT_FLOOR && d < GAP_MIN) {
        out.push(warn('fs-slot', `${cap(names(later))} and ${names(first)} leave a ${d.toFixed(2)} m slot between them. A five inch needs ${GAP_MIN} m to get through, so close it up or open it out.`, {
          elementId: later.id,
          otherId: first.id,
          clearance: d,
        }));
      }
    }
  }

  /* -------- named gaps -------- */

  for (const zone of placed.zones) {
    const win = zoneWindow(zone);
    if (!win) {
      continue;
    }
    for (const b of bodies) {
      if (!boxesTouch(win.box, b.box)) {
        continue;
      }
      if (b.solids.some((s, k) => boxesTouch(win.box, b.boxes[k]) && solidCrossesWindow(s, win))) {
        out.push(warn('fs-gap-blocked', `${zone.name || 'A named gap'} has ${names(b.el)} across its window, so nothing flies through it clean. Move the gap or what is in it.`, {
          elementId: zone.el.id,
          otherId: b.el.id,
        }));
        break;
      }
    }
  }

  /* -------- the plot -------- */

  const bodyOf = new Map(bodies.map((b) => [b.el.id, b]));
  for (const el of doc.elements) {
    const { x, y } = el.position;
    if (x < 0 || y < 0 || x > doc.field.width || y > doc.field.depth) {
      out.push(warn('fs-outside', `${cap(names(el))} is standing outside the plot.`, { elementId: el.id }));
      continue;
    }
    const b = bodyOf.get(el.id);
    if (b && (b.box[0] < -W / 2 - PLOT_SLACK || b.box[3] > W / 2 + PLOT_SLACK
      || b.box[2] < -D / 2 - PLOT_SLACK || b.box[5] > D / 2 + PLOT_SLACK)) {
      out.push(warn('fs-outside', `${cap(names(el))} reaches past the edge of the plot.`, { elementId: el.id }));
    }
  }

  /* -------- roads and vehicles -------- */

  roadWarnings(doc, placed, bodies, names, out);

  /* -------- the budget -------- */

  if (placed.solids.length > FREESTYLE_SOLIDS_MAX) {
    const biggest = bodies.reduce((m, b) => (!m || b.solids.length > m.solids.length ? b : m), null);
    out.push(warn('fs-solids', `This map has ${placed.solids.length} solids, over the ${FREESTYLE_SOLIDS_MAX} a map is kept under so it loads and flies smoothly on a slow machine. The biggest is ${names(biggest.el)}, at ${biggest.solids.length}.`, {
      elementId: biggest.el.id,
    }));
  }

  /* -------- more shapes in one place than the physics looks at -------- */

  const crowd = crowdOf(placed.solids);
  if (crowd.max > CANDIDATES_MAX) {
    /* Named by the element with the most shapes in the patch. bodies is
     * placed.solids cut up by element, in order, so an index walks it. */
    const own = new Map();
    let at = 0;
    for (const b of bodies) {
      for (let k = 0; k < b.solids.length; k += 1) {
        if (crowd.shapes.has(at + k)) {
          own.set(b, (own.get(b) ?? 0) + 1);
        }
      }
      at += b.solids.length;
    }
    const most = [...own.entries()].sort((a, b) => b[1] - a[1])[0][0];
    out.push(warn('fs-crowded', `Round ${names(most.el)} the physics would have ${crowd.max} shapes to check against a craft, and it checks ${CANDIDATES_MAX} at most: the rest are left out, and a craft there could pass through them. Spread these elements further apart or use fewer of them.`, {
      elementId: most.el.id,
    }));
  }

  return {
    warnings: out,
    solids: placed.solids.length,
    zones: placed.zones.length,
    bodies: bodies.length,
  };
}

/*
 * A MAP'S ROADS AND VEHICLES, checked against the solids beside them, the
 * start, and each other. All of it in the document's plan, where the road
 * tool works: a solid's world box (x, z) is taken back to the plan by the
 * inverse of place.js's one conversion, plan x = x + W/2, plan y = D/2 - z.
 *
 * A road is in a solid's way when the solid comes within a car's reach of
 * the road's centre line (roadReach in ./roadtool.js: the lane's offset and
 * half the widest car on it, half its diagonal for a drift car, which
 * slides) and stands lower than the tallest of those cars' roofs, so a
 * bridge deck over a road is not in its way and the bridge's piers are.
 * The start pads are not a solid, and are held to the same reach; where the
 * craft starts is held to it and SPAWN_CLEAR more, the metre of air the
 * craft needs to take off.
 *
 * Two cars in one lane are held to CLASH_HORIZON: ten minutes of the clock,
 * a long session. The starter yard's box truck and kei van share a lane at
 * different top speeds with laps the same to a hundred thousandth of a
 * second, so they do not meet in the life of the sun, and are not warned
 * about; see laneClashes in ./roadtool.js.
 */
export const CLASH_HORIZON = 600;

/* A solid whose top is under this is paving, a mat or a kerb: a car drives
 * over it, m. */
const ROAD_FLOOR = 0.05;

/* A world box's plan rectangle in the document's plan: [x0, y0, x1, y1]. */
function planBox(b, W, D) {
  return [b[0] + W / 2, D / 2 - b[5], b[3] + W / 2, D / 2 - b[2]];
}

function rectPoly(r) {
  return [{ x: r[0], y: r[1] }, { x: r[2], y: r[1] }, { x: r[2], y: r[3] }, { x: r[0], y: r[3] }];
}

function polyBox(poly) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/* A car's top speed as the author set it, and whether it drifts. */
function speedWords(v) {
  return `${Math.round(v.topSpeed * 3.6)} km/h${v.drift ? ', drifting' : ''}`;
}

function roadWarnings(doc, placed, bodies, names, out) {
  const roads = doc.elements.filter((e) => ELEMENTS[e.type]?.kind === KIND.ROAD);
  const vehicles = doc.elements.filter((e) => ELEMENTS[e.type]?.kind === KIND.VEHICLE);
  if (!roads.length && !vehicles.length) {
    return;
  }
  const W = placed.W;
  const D = placed.D;
  const byId = new Map(doc.elements.map((e) => [e.id, e]));
  const pads = startPadsOf(doc);

  /* -------- what the physics will be handed, and what it leaves out -------- */

  const traffic = trafficOf(doc);
  for (const p of traffic.problems) {
    const el = byId.get(p.elementId);
    if (!el) {
      continue;
    }
    const level = p.level === 'info' ? 'info' : 'warn';
    if (p.code === 'tr-no-road') {
      const target = el.road ? byId.get(el.road) : null;
      const why = !el.road
        ? 'it was never put on one'
        : (target ? `it names ${names(target)}, which is not a road` : `its road, ${el.road}, is not on the map any more`);
      out.push(warn('tr-no-road', `${cap(names(el))} has no road: ${why}. It stays parked, and is drawn in the row along the south edge of the plot. Drag it onto a road, or delete it.`, {
        elementId: el.id,
      }));
      continue;
    }
    /* A road's own: a node road.js left out or ran straight past, and the
     * rest, named on the road. */
    if (ELEMENTS[el.type]?.kind === KIND.ROAD) {
      out.push({
        level,
        code: p.code,
        message: `${cap(names(el))}: ${p.message}`,
        elementId: el.id,
        ...(p.node !== undefined ? { node: p.node } : {}),
      });
      continue;
    }
    /* A vehicle the physics has no room for, in trafficOf's own words, the
     * limits included, so the builder never says a different number. */
    const message = /^A vehicle/.test(p.message)
      ? p.message.replace(/^A vehicle/, cap(names(el)))
      : `${cap(names(el))}: ${p.message}`;
    out.push({ level, code: p.code, message, elementId: el.id });
  }

  /* -------- each road against the map it runs through -------- */

  let padsPoly = null;
  if (pads) {
    const n = Math.max(1, Math.round(pads.dims.pads ?? 1));
    const size = Math.max(0.1, pads.dims.padSize ?? 0.6);
    const span = Math.max(size, (n - 1) * Math.max(0.3, pads.dims.spacing ?? 1.5) + size);
    const yaw = pads.yaw || 0;
    padsPoly = footprint({
      x: pads.position.x, y: pads.position.y, tx: Math.cos(yaw), ty: Math.sin(yaw), length: size, width: span,
    });
  }
  const spawn = [placed.spawn.x + W / 2, D / 2 - placed.spawn.z];
  for (const road of roads) {
    const r = roadOf(road);
    const line = r.centre;
    if (line.points.length < 2) {
      continue;
    }
    const pts = line.points;
    const { reach, height } = roadReach(doc, road);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    if (x0 < -PLOT_SLACK || y0 < -PLOT_SLACK || x1 > doc.field.width + PLOT_SLACK || y1 > doc.field.depth + PLOT_SLACK) {
      out.push(warn('fs-outside', `${cap(names(road))} runs past the edge of the plot.`, { elementId: road.id }));
    }
    for (const b of bodies) {
      if (b.el === pads) {
        continue;
      }
      const bb = planBox(b.box, W, D);
      if (bb[2] < x0 - reach || bb[0] > x1 + reach || bb[3] < y0 - reach || bb[1] > y1 + reach) {
        continue;
      }
      let hit = false;
      for (let k = 0; k < b.solids.length && !hit; k += 1) {
        const box = b.boxes[k];
        if (box[1] >= height || box[4] <= ROAD_FLOOR) {
          continue;
        }
        const pb = planBox(box, W, D);
        const s = b.solids[k];
        const shape = s.box
          ? { poly: rectPoly(pb) }
          : { seg: [s.cap[0] + W / 2, D / 2 - s.cap[2], s.cap[3] + W / 2, D / 2 - s.cap[5]], r: s.cap[6] };
        hit = lineShapeDist(pts, line.closed, shape, pb, reach) < reach;
      }
      if (hit) {
        out.push(warn('rd-solid', `${cap(names(road))} runs through ${names(b.el)}: a car on it would drive into it. Move the road, or ${names(b.el)}, until a car has room to pass.`, {
          elementId: road.id,
          otherId: b.el.id,
        }));
      }
    }
    if (padsPoly && lineShapeDist(pts, line.closed, { poly: padsPoly }, polyBox(padsPoly), reach) < reach) {
      out.push(warn('rd-start', `${cap(names(road))} runs over the start pads, so a car on it drives through the craft waiting to launch. Move the road or the pads.`, {
        elementId: road.id,
        otherId: pads.id,
      }));
    } else if (lineShapeDist(pts, line.closed, { point: spawn }, [spawn[0], spawn[1], spawn[0], spawn[1]], reach + SPAWN_CLEAR) < reach + SPAWN_CLEAR) {
      out.push(warn('rd-start', pads
        ? `${cap(names(road))} passes within a metre of where the craft starts, so a car on it clips the craft before it has left the pad. Move the road or the pads.`
        : `${cap(names(road))} runs through where the pilot starts, 8 m in from the left edge of the plot with no start pads, so a car on it drives through the craft. Move the road, or press S and put the start pads clear of it.`, {
        elementId: road.id,
        ...(pads ? { otherId: pads.id } : {}),
      }));
    }
  }

  /* -------- the cars against each other -------- */

  for (const c of laneClashes(traffic, CLASH_HORIZON)) {
    const a = byId.get(c.a.element);
    const b = byId.get(c.b.element);
    const road = byId.get(traffic.roads[c.a.road].element);
    if (!a || !b || !road) {
      continue;
    }
    const A = cap(names(a));
    const B = names(b);
    let message;
    if (c.kind === 'open') {
      message = `${A} and ${B} are both on ${names(road)}, an open road: every car drives its middle out to the end and back, so the two meet head on and drive through each other. Close the road into a loop, or keep one car on it.`;
    } else if (c.kind === 'head-on') {
      message = `${A} and ${B} drive ${names(road)}'s one lane in opposite directions, so they meet head on and drive through each other. Give the road two lanes, or turn one of them round.`;
    } else {
      const when = c.at < 1 ? 'at once' : (c.at < 90 ? `${Math.round(c.at)} s in` : `about ${Math.round(c.at / 60)} minutes in`);
      const fix = roadOf(road).lanes === 2
        ? 'Give them the same top speed and the same drift, or set one to Reverse so it drives the other lane.'
        : 'Give them the same top speed and the same drift, or give the road two lanes and set one to Reverse.';
      message = `${A} (${speedWords(c.a)}) and ${B} (${speedWords(c.b)}) share a lane of ${names(road)} but not a lap time, so ${when} one drives through the other: cars never touch each other. ${fix}`;
    }
    out.push(warn('tr-lane-clash', message, { elementId: b.id, otherId: a.id }));
  }
  for (const [a, b] of startOverlaps(doc)) {
    out.push(warn('tr-overlap', `${cap(names(b))} starts on top of ${names(a)}. Slide one of them along the road.`, {
      elementId: b.id,
      otherId: a.id,
    }));
  }
}

/*
 * THE PHYSICS' OWN GRID, AS IT WILL BE BUILT. src/native/world.c files
 * every shape in 8 m cells of the plant's plan (sim_world_build: the origin
 * is the least corner of every shape, and the cell doubles while there are
 * more than 2^18 of them), and a contact query gathers the cells round the
 * craft, which reaches under a quarter of a metre, so up to two by two of
 * them. It keeps the first WORLD_MAX_CAND shapes it meets and drops the
 * rest without a word (world_gather). Measured on a block of six tall
 * chimneys with 1.2 m slots: a craft 7 cm into the brick got no contact.
 * scripts/props-check.js (e) holds this copy to the module: a wall behind
 * 1100 shapes of the cell gathered before it is never touched.
 *
 * So each shape's plan bounds are taken the way the module is handed them:
 * float32 in the colliders (src/game/collide.js build), through
 * threePosToSim (sim x is -z, sim y is -x), a capsule padded by its
 * radius. Then every two by two block of cells counts its distinct shapes.
 * The origin depends on every shape in the map, so moving anything can
 * move every boundary, and this is recomputed with the rest of the report
 * on every edit. Returns { max, shapes }: the most any block holds, and
 * the indices into `solids` of the shapes in that block.
 */
export const CANDIDATES_MAX = 1024;
const WORLD_CELL_MIN = 8;
const WORLD_MAX_CELLS = 1 << 18;

export function crowdOf(solids) {
  const n = solids.length;
  if (!n) {
    return { max: 0, shapes: new Set() };
  }
  const f = Math.fround;
  const lo0 = new Float64Array(n);
  const lo1 = new Float64Array(n);
  const hi0 = new Float64Array(n);
  const hi1 = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const s = solids[i];
    if (s.box) {
      const b = s.box;
      lo0[i] = -f(Math.max(b[2], b[5]));
      hi0[i] = -f(Math.min(b[2], b[5]));
      lo1[i] = -f(Math.max(b[0], b[3]));
      hi1[i] = -f(Math.min(b[0], b[3]));
    } else {
      const c = s.cap;
      const r = f(c[6]);
      const az = -f(c[2]);
      const bz = -f(c[5]);
      const ax = -f(c[0]);
      const bx = -f(c[3]);
      lo0[i] = Math.min(az, bz) - r;
      hi0[i] = Math.max(az, bz) + r;
      lo1[i] = Math.min(ax, bx) - r;
      hi1[i] = Math.max(ax, bx) + r;
    }
  }
  let x0 = lo0[0];
  let y0 = lo1[0];
  let x1 = hi0[0];
  let y1 = hi1[0];
  for (let i = 1; i < n; i += 1) {
    x0 = lo0[i] < x0 ? lo0[i] : x0;
    y0 = lo1[i] < y0 ? lo1[i] : y0;
    x1 = hi0[i] > x1 ? hi0[i] : x1;
    y1 = hi1[i] > y1 ? hi1[i] : y1;
  }
  let cell = WORLD_CELL_MIN;
  let nx = 0;
  let ny = 0;
  for (;;) {
    nx = Math.trunc((x1 - x0) / cell) + 1;
    ny = Math.trunc((y1 - y0) / cell) + 1;
    if (nx * ny <= WORLD_MAX_CELLS) {
      break;
    }
    cell *= 2;
  }
  const cells = Array.from({ length: nx * ny }, () => []);
  for (let i = 0; i < n; i += 1) {
    const cx0 = Math.trunc((lo0[i] - x0) / cell);
    const cx1 = Math.trunc((hi0[i] - x0) / cell);
    const cy0 = Math.trunc((lo1[i] - y0) / cell);
    const cy1 = Math.trunc((hi1[i] - y0) / cell);
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        cells[cx * ny + cy].push(i);
      }
    }
  }
  const stamp = new Int32Array(n);
  let query = 0;
  let max = 0;
  let worst = null;
  for (let cx = 0; cx < nx; cx += 1) {
    for (let cy = 0; cy < ny; cy += 1) {
      query += 1;
      let count = 0;
      for (let ax = cx; ax <= cx + 1 && ax < nx; ax += 1) {
        for (let ay = cy; ay <= cy + 1 && ay < ny; ay += 1) {
          for (const i of cells[ax * ny + ay]) {
            if (stamp[i] !== query) {
              stamp[i] = query;
              count += 1;
            }
          }
        }
      }
      if (count > max) {
        max = count;
        worst = [cx, cy];
      }
    }
  }
  const shapes = new Set();
  const [wx, wy] = worst;
  for (let ax = wx; ax <= wx + 1 && ax < nx; ax += 1) {
    for (let ay = wy; ay <= wy + 1 && ay < ny; ay += 1) {
      for (const i of cells[ax * ny + ay]) {
        shapes.add(i);
      }
    }
  }
  return { max, shapes };
}

/*
 * What a warning calls an element: its own name if it has one, and if not
 * its type, numbered in document order when there is more than one of it,
 * so "Building 2 and Building 5" says which two.
 */
function labeller(doc) {
  const count = new Map();
  const nth = new Map();
  for (const el of doc.elements) {
    const n = (count.get(el.type) || 0) + 1;
    count.set(el.type, n);
    nth.set(el.id, n);
  }
  return (el) => {
    if (el.name) {
      return el.name;
    }
    const lab = ELEMENTS[el.type]?.label ?? el.type;
    return count.get(el.type) > 1 ? `${lab} ${nth.get(el.id)}` : lab;
  };
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------------- boxes ---------------- */

/* The axis aligned box round one solid: [x0, y0, z0, x1, y1, z1]. */
function solidBox(s) {
  if (s.box) {
    return s.box;
  }
  const c = s.cap;
  const r = c[6];
  return [
    Math.min(c[0], c[3]) - r, Math.min(c[1], c[4]) - r, Math.min(c[2], c[5]) - r,
    Math.max(c[0], c[3]) + r, Math.max(c[1], c[4]) + r, Math.max(c[2], c[5]) + r,
  ];
}

function unionBox(boxes) {
  const u = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    for (let k = 0; k < 3; k += 1) {
      u[k] = Math.min(u[k], b[k]);
      u[k + 3] = Math.max(u[k + 3], b[k + 3]);
    }
  }
  return u;
}

function grow(b, by) {
  return [b[0] - by, b[1] - by, b[2] - by, b[3] + by, b[4] + by, b[5] + by];
}

function boxesTouch(a, b) {
  return a[0] <= b[3] && b[0] <= a[3] && a[1] <= b[4] && b[1] <= a[4] && a[2] <= b[5] && b[2] <= a[5];
}

/*
 * The first mat of the start row whose own seat is more than SEAT_SLACK from
 * the spawn's, as { n, y } with n counted from 1, or null. Each mat's seat
 * is asked at its middle from the pads' Base, the way place.js spawnFrom
 * asks for the craft's, and the mat is turned the way placeSolids turns a
 * part.
 */
const MAT_SC = { s: 0, c: 1 };
const MAT_AT = { x: 0, z: 0 };
function splitMat(placed, pads) {
  const it = placed.items.find((i) => i.el === pads);
  if (!it) {
    return null;
  }
  const sp = placed.spawn;
  sincos(it.yaw, MAT_SC);
  let n = 0;
  for (const part of it.parts) {
    if (part.name !== 'pad') {
      continue;
    }
    n += 1;
    turnY((part.lo[0] + part.hi[0]) / 2, (part.lo[2] + part.hi[2]) / 2, MAT_SC.s, MAT_SC.c, MAT_AT);
    const y = topUnder(placed.tops, it.x + MAT_AT.x, it.z + MAT_AT.z, sp.base);
    if (Math.abs(y - sp.y) > SEAT_SLACK) {
      return { n, y };
    }
  }
  return null;
}

/* Whether a solid is the box the craft at the spawn stands on: its top is
 * the seat and its footprint holds the spawn, strictly, the way topUnder
 * finds it. */
function standsOn(s, sp) {
  const b = s.box;
  return Boolean(b) && b[4] === sp.y && sp.x > b[0] && sp.x < b[3] && sp.z > b[2] && sp.z < b[5];
}

/* Distance from a point to a box, zero inside it. */
function boxPointDist(b, p) {
  const dx = Math.max(b[0] - p[0], 0, p[0] - b[3]);
  const dy = Math.max(b[1] - p[1], 0, p[1] - b[4]);
  const dz = Math.max(b[2] - p[2], 0, p[2] - b[5]);
  return Math.hypot(dx, dy, dz);
}

/* ---------------- clearances ---------------- */

/*
 * The clear air between two solids: positive is a space that wide,
 * negative is how far they run into each other (for two boxes, the least
 * overlap on any axis; for anything with a capsule, minus the radius, which
 * is only ever read as "overlapping").
 */
function solidClearance(a, b) {
  if (a.box && b.box) {
    return boxBoxClearance(a.box, b.box);
  }
  if (a.cap && b.cap) {
    return segSegDist(a.cap, 0, 3, b.cap, 0, 3) - a.cap[6] - b.cap[6];
  }
  const box = a.box ?? b.box;
  const c = a.cap ?? b.cap;
  return segBoxDist(c, box) - c[6];
}

function boxBoxClearance(a, b) {
  const gx = Math.max(a[0] - b[3], b[0] - a[3]);
  const gy = Math.max(a[1] - b[4], b[1] - a[4]);
  const gz = Math.max(a[2] - b[5], b[2] - a[5]);
  if (gx < 0 && gy < 0 && gz < 0) {
    return Math.max(gx, gy, gz);
  }
  return Math.hypot(Math.max(gx, 0), Math.max(gy, 0), Math.max(gz, 0));
}

/* Clearance from a point to a solid: negative inside it. */
function solidPointClearance(s, p) {
  if (s.box) {
    const b = s.box;
    const d = boxPointDist(b, p);
    if (d > 0) {
      return d;
    }
    return -Math.min(p[0] - b[0], b[3] - p[0], p[1] - b[1], b[4] - p[1], p[2] - b[2], b[5] - p[2]);
  }
  const c = s.cap;
  return pointSegDist(p, c, 0, 3) - c[6];
}

/* The least clearance between any solid of A and any solid of B, or null
 * when no two of their solids even come within the gap rule's width. Stops
 * at the first overlap, which is all a warning needs to know. */
function bodyClearance(A, B) {
  let best = null;
  for (let i = 0; i < A.solids.length; i += 1) {
    const ra = grow(A.boxes[i], GAP_MIN);
    if (!boxesTouch(ra, B.box)) {
      continue;
    }
    for (let j = 0; j < B.solids.length; j += 1) {
      if (!boxesTouch(ra, B.boxes[j])) {
        continue;
      }
      const d = solidClearance(A.solids[i], B.solids[j]);
      if (best === null || d < best) {
        best = d;
        if (best < -OVERLAP_EPS) {
          return best;
        }
      }
    }
  }
  return best;
}

function pointSegDist(p, s, ia, ib) {
  const ax = s[ia];
  const ay = s[ia + 1];
  const az = s[ia + 2];
  const dx = s[ib] - ax;
  const dy = s[ib + 1] - ay;
  const dz = s[ib + 2] - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((p[0] - ax) * dx + (p[1] - ay) * dy + (p[2] - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (ax + dx * t), p[1] - (ay + dy * t), p[2] - (az + dz * t));
}

/* The distance between two segments, each given as an array holding its two
 * end points at offsets ia and ib. The standard closest points of two
 * segments, clamped, with the parallel case handled. */
function segSegDist(s, sa, sb, t, ta, tb) {
  const p1 = [s[sa], s[sa + 1], s[sa + 2]];
  const q1 = [s[sb], s[sb + 1], s[sb + 2]];
  const p2 = [t[ta], t[ta + 1], t[ta + 2]];
  const q2 = [t[tb], t[tb + 1], t[tb + 2]];
  return segSeg(p1, q1, p2, q2);
}

function segSeg(p1, q1, p2, q2) {
  const d1 = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]];
  const d2 = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]];
  const r = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const a = dot3(d1, d1);
  const e = dot3(d2, d2);
  const f = dot3(d2, r);
  let s;
  let t;
  const EPS = 1e-12;
  if (a <= EPS && e <= EPS) {
    return Math.hypot(r[0], r[1], r[2]);
  }
  if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = dot3(d1, r);
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = dot3(d1, d2);
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const x = r[0] + d1[0] * s - d2[0] * t;
  const y = r[1] + d1[1] * s - d2[1] * t;
  const z = r[2] + d1[2] * s - d2[2] * t;
  return Math.hypot(x, y, z);
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/*
 * The distance from a capsule's axis to a box. The distance from a point on
 * a segment to a convex box is a convex function along the segment, so a
 * golden section search finds its least value; forty steps narrow it to a
 * few nanometres of a fifty metre member.
 */
function segBoxDist(c, box) {
  const at = (t) => [
    c[0] + (c[3] - c[0]) * t, c[1] + (c[4] - c[1]) * t, c[2] + (c[5] - c[2]) * t,
  ];
  const f = (t) => boxPointDist(box, at(t));
  const g = (Math.sqrt(5) - 1) / 2;
  let lo = 0;
  let hi = 1;
  let x1 = hi - g * (hi - lo);
  let x2 = lo + g * (hi - lo);
  let f1 = f(x1);
  let f2 = f(x2);
  for (let k = 0; k < 40; k += 1) {
    if (f1 <= f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - g * (hi - lo);
      f1 = f(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + g * (hi - lo);
      f2 = f(x2);
    }
  }
  return Math.min(f1, f2, f(0), f(1));
}

/* ---------------- a named gap's window ---------------- */

/*
 * The window as a frame: its centre on the ground, the unit vector across
 * it and the unit vector through it (its heading), in world x and z, and
 * its extent across and up. The document's heading (cos, sin) is world
 * (cos, -sin), and its left (-sin, cos) is world (-sin, -cos): the same one
 * conversion place.js makes.
 */
function zoneWindow(zone) {
  const hw = zone.w / 2 - WINDOW_INSET;
  const y0 = zone.y + WINDOW_INSET;
  const y1 = zone.y + zone.h - WINDOW_INSET;
  if (!(hw > 0) || !(y1 > y0)) {
    return null;
  }
  const c = Math.cos(zone.yaw);
  const s = Math.sin(zone.yaw);
  const across = [-s, -c];
  const through = [c, -s];
  const ex = Math.abs(across[0]) * hw;
  const ez = Math.abs(across[1]) * hw;
  return {
    x: zone.x,
    z: zone.z,
    hw,
    y0,
    y1,
    across,
    through,
    box: [zone.x - ex, y0, zone.z - ez, zone.x + ex, y1, zone.z + ez],
  };
}

/* A world point in the window's own terms: n through it, a across it, v up. */
function inWindow(win, p) {
  const dx = p[0] - win.x;
  const dz = p[2] - win.z;
  return {
    n: dx * win.through[0] + dz * win.through[1],
    a: dx * win.across[0] + dz * win.across[1],
    v: p[1],
  };
}

function solidCrossesWindow(s, win) {
  if (s.box) {
    const b = s.box;
    if (b[4] <= win.y0 || b[1] >= win.y1) {
      return false;
    }
    /* The window seen from above is a segment across the heading; does it
     * pass through the box's plan rectangle? Clip it to the rectangle's two
     * slabs. */
    const ox = win.x - win.across[0] * win.hw;
    const oz = win.z - win.across[1] * win.hw;
    const dx = win.across[0] * 2 * win.hw;
    const dz = win.across[1] * 2 * win.hw;
    let t0 = 0;
    let t1 = 1;
    for (const [o, d, lo, hi] of [[ox, dx, b[0], b[3]], [oz, dz, b[2], b[5]]]) {
      if (Math.abs(d) < 1e-12) {
        if (o <= lo || o >= hi) {
          return false;
        }
        continue;
      }
      let ta = (lo - o) / d;
      let tb = (hi - o) / d;
      if (ta > tb) {
        [ta, tb] = [tb, ta];
      }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 >= t1) {
        return false;
      }
    }
    return true;
  }
  /*
   * A capsule crosses the window when its axis comes within its radius of
   * the window's rectangle. The nearest two points of a segment and a flat
   * convex rectangle are either where the segment passes through it, or at
   * one of the segment's ends, or on one of the rectangle's four edges.
   */
  const c = s.cap;
  const r = c[6];
  const P = inWindow(win, [c[0], c[1], c[2]]);
  const Q = inWindow(win, [c[3], c[4], c[5]]);
  const inside = (a, v) => Math.abs(a) <= win.hw && v >= win.y0 && v <= win.y1;
  if ((P.n <= 0 && Q.n >= 0) || (P.n >= 0 && Q.n <= 0)) {
    const t = Math.abs(P.n - Q.n) < 1e-12 ? 0 : P.n / (P.n - Q.n);
    if (inside(P.a + (Q.a - P.a) * t, P.v + (Q.v - P.v) * t)) {
      return true;
    }
  }
  const toRect = (X) => {
    const da = Math.max(Math.abs(X.a) - win.hw, 0);
    const dv = Math.max(win.y0 - X.v, 0, X.v - win.y1);
    return Math.hypot(X.n, da, dv);
  };
  let d = Math.min(toRect(P), toRect(Q));
  const p = [P.n, P.a, P.v];
  const q = [Q.n, Q.a, Q.v];
  const corners = [
    [0, -win.hw, win.y0], [0, win.hw, win.y0], [0, win.hw, win.y1], [0, -win.hw, win.y1],
  ];
  for (let k = 0; k < 4; k += 1) {
    d = Math.min(d, segSeg(p, q, corners[k], corners[(k + 1) % 4]));
  }
  return d < r;
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
