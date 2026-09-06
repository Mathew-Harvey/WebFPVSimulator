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

import { ELEMENTS, KIND, TUNING, trackClassOf, tuningFor } from './elements.js';
import {
  GATE_OPENING_MIN, GATE_OPENING_MAX, GATE_SPACING_MIN, GATE_SPACING_MAX,
  GROUND_GATE_CENTRE_MAX, STACK2_CENTRE_MIN, STACK3_CENTRE_MIN,
  POLE_FROM_GATE_MIN, POLE_FROM_POLE_MIN, ROOM_HEIGHT, envelopeFor, inches,
} from './racegow.js';
import { elementById, kindOf, startPadsOf } from './model.js';
import { sequenceLabel, unsequencedElements } from './sequence.js';
import { dist, insideYawedBox, lerp, yawVector } from './geometry.js';

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
  if (trackClassOf(doc) === 'micro') {
    collectRaceGowWarnings(doc, out);
  }

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
function collectRaceGowWarnings(doc, out) {
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
      if (d < GATE_SPACING_MIN - 1e-6) {
        out.push(warn('rg-spacing',
          `${label(a)} and ${label(b)} are ${inches(d)} apart. Two gates that close are adjacent, and adjacent gates are 27 to 33 in centre to centre.`,
          { elementId: a.id }));
      } else if (d > GATE_SPACING_MAX + 1e-6 && d < GATE_SPACING_MAX * 1.25) {
        out.push(note('rg-spacing-near',
          `${label(a)} and ${label(b)} are ${inches(d)} apart. If they are meant to be a side by side pair, adjacent gates are 27 to 33 in centre to centre, nominally 30.`,
          { elementId: a.id }));
      }
    }
  }

  /* The pole clearances the Track6 diagram dimensions three times. */
  for (const p of poles) {
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
