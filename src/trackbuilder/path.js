/*
 * path.js: Create Path. Turn the flying order into a racing line.
 *
 * The method, exactly as the tool implements it:
 *
 *   1. Walk the sequence. Each APERTURE contributes a knot at the opening's
 *      centre with a tangent equal to the aperture normal multiplied by the
 *      entry sign, so the tangent always points the way the quad is going.
 *   2. Each FLAG or CONE contributes a virtual knot offset from the marker
 *      by its clearance radius, perpendicular to the local direction of
 *      travel, on the chosen pass side. Its tangent is the local direction,
 *      because a marker has no plane of its own to take one from.
 *   3. If START PADS are placed the lap is a circuit, so a closing knot is
 *      appended at the FIRST sequenced element, same position and tangent.
 *      The pads are where the quad sits. They are not a hole and they do
 *      not belong on the racing line: drawing them in, then drawing the
 *      return to them, is the trail that looped around the grid.
 *   4. Fit a cubic Hermite between each consecutive pair, with both tangents
 *      scaled by settings.tangentScale multiplied by the straight line
 *      distance between that pair. One constant, in elements.js, tunable per
 *      track in doc.settings.
 *   5. Sample it, and carry arc length and curvature radius along.
 *
 * Curvature is computed from the analytic first and second derivatives of
 * the Hermite rather than from finite differences of the sampled polyline,
 * because a finite difference at this sample density reports a radius that
 * depends on the sample count, and a warning threshold that moves when you
 * change an unrelated setting is a warning nobody believes.
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

import { KIND, trackClassOf, tuningFor } from './elements.js';
import {
  apertureCenter, aperturesOf, elementById, kindOf, entryAnchor, elementNormal, startPadsOf,
} from './model.js';
import { nearbyApertureTravel, markerPassDir } from './faces.js';
import { wrapBetween } from './figures.js';
import {
  add, apertureFrame, cross, dist, dot, length, normalize, scale, sub,
} from './geometry.js';

/*
 * How many steering knots the avoidance pass below may insert before it
 * gives up. A track that still crosses a gate after this many dodges is
 * telling the author something the line cannot fix, and an unbounded loop
 * on a document somebody is typing into is worse than a wrong line.
 */
const DODGE_LIMIT = 12;

/* Samples per segment when LOOKING for a crossing. Coarser than the drawing
 * pass on purpose: this runs on every edit and a gate is never so thin that
 * 24 samples step over it. */
const DODGE_PROBE = 24;

/*
 * The knots, in order. Each carries where it is, which way the quad is going
 * through it, and enough identity for a warning to name it.
 *
 *   role   'aperture' | 'marker' | 'wrap' | 'finish'
 *   seq    the sequence entry that produced it, or null for wrap and finish
 *   index  one based position in the flying order, or null
 *
 * closeLoop asks for the closing knot whether or not the track has start
 * pads. The builder never passes it, so what an author sees is unchanged.
 * The animation export does, because a RaceGOW lap starts and finishes on
 * one designated gate, the first one flown, and that is true of a track
 * whose author has not placed pads. Without it the exported line stops at
 * the last gate and the animation cannot loop: on the shipped Living room 1,
 * dropping the pads loses the whole return leg, 5.134 m of a 7.154 m lap.
 */
export function buildKnots(doc, { closeLoop = false } = {}) {
  const start = startPadsOf(doc);

  /* Raw anchors first, because a marker's offset needs a direction and the
   * direction has to come from geometry that does not itself depend on the
   * offset. Same chain faces.js uses, for the same reason. */
  /* Pads stay off this list. faces.js still reads them for auto-heading.
   * Putting them here is what sent the Hermite, the 3D trail and the
   * grass dashes out to the grid and back again. */
  const raw = [];
  doc.sequence.forEach((s, i) => {
    const pos = entryAnchor(doc, s);
    if (!pos) {
      return;
    }
    const el = elementById(doc, s.elementId);
    raw.push({
      pos,
      seq: s,
      role: kindOf(el) === KIND.APERTURE ? 'aperture' : 'marker',
      index: i + 1,
    });
  });

  const n = raw.length;
  const knots = [];
  for (let i = 0; i < n; i += 1) {
    const k = raw[i];
    const before = raw[Math.max(0, i - 1)].pos;
    const after = raw[Math.min(n - 1, i + 1)].pos;
    const chainDir = n > 1 ? normalize(sub(after, before), { x: 1, y: 0, z: 0 }) : { x: 1, y: 0, z: 0 };

    const el = elementById(doc, k.seq.elementId);
    if (!el) {
      continue;
    }

    if (k.role === 'aperture') {
      const nrm = elementNormal(el);
      /* entry 0 means undecided. Point it along the course so the line is
       * still drawable; warnings.js reports the entry as unset. */
      const sign = k.seq.entry === 0 ? (dot(nrm, chainDir) >= 0 ? 1 : -1) : k.seq.entry;
      knots.push({
        pos: { ...k.pos },
        tangent: scale(nrm, sign),
        role: 'aperture',
        seq: k.seq,
        index: k.index,
        elementId: el.id,
      });
      continue;
    }

    /* Marker. Push the knot off the pole by the clearance radius, in the
     * pass direction: square to travel on the derived side, or wherever the
     * author has turned the marker to. Keep the tangent on the plan: a flag
     * has no vertical face, and a z component here is what sends the
     * Hermite between two ground markers underground.
     * A pole on a gate stile takes that gate's travel, or the square
     * stands along the PVC and a pass through the opening never hits it. */
    const travel = nearbyApertureTravel(doc, el) || chainDir;
    const off = scale(markerPassDir(el, k.seq, travel), k.seq.clearance ?? 0);
    const flat = normalize({ x: travel.x, y: travel.y, z: 0 }, { x: 1, y: 0, z: 0 });
    knots.push({
      pos: add(k.pos, off),
      tangent: flat,
      role: 'marker',
      seq: k.seq,
      index: k.index,
      elementId: el.id,
      markerPos: { ...k.pos },
    });
  }

  /*
   * Wraps between two stacked passes on the SAME structure. Without these
   * the Hermite climbs the shared XY and the line goes through the PVC.
   * A wrap is not a station: trackdoc scores aperture knots, and marker
   * knots that carry a clearance, but never these.
   */
  const withWraps = [];
  for (let i = 0; i < knots.length; i += 1) {
    withWraps.push(knots[i]);
    const a = knots[i];
    const b = knots[i + 1];
    if (!b || a.role !== 'aperture' || b.role !== 'aperture' || a.elementId !== b.elementId) {
      continue;
    }
    const stacked = elementById(doc, a.elementId);
    if (!stacked || !a.seq || !b.seq) {
      continue;
    }
    const wrap = wrapBetween(stacked, a.seq, b.seq, trackClassOf(doc));
    withWraps.push({
      pos: wrap.pos,
      tangent: wrap.tangent,
      role: 'wrap',
      seq: null,
      index: null,
      elementId: stacked.id,
    });
  }
  /*
   * A circuit closes at the first sequenced element, not at the pads. Same
   * position and tangent so the Hermite joins without a hook.
   *
   * MORE THAN ONE KNOT, because one element is not a lap. With `> 0` a
   * track holding pads and a single gate got a closing knot that was an
   * exact copy of the only knot it had: a zero length path, no racing line
   * drawn at all, and a "two knots in the same place" warning pointing at
   * one gate. That is the first thing an author sees after placing their
   * first gate, so it has to be nothing rather than a complaint.
   */
  if ((start || closeLoop) && withWraps.length > 1) {
    const first = withWraps[0];
    withWraps.push({
      pos: { ...first.pos },
      tangent: { ...first.tangent },
      role: 'finish',
      seq: first.seq,
      index: null,
      elementId: first.elementId,
      markerPos: first.markerPos ? { ...first.markerPos } : undefined,
    });
  }
  /* Last, because the closing leg back to the first gate has to be checked
   * for a gate in the way exactly like every other leg. */
  return avoidForeignApertures(doc, withWraps);
}

/*
 * NOT FLYING THROUGH A GATE THE QUAD WAS NOT SENT THROUGH.
 *
 * The Hermite between two knots is fitted from those two knots and nothing
 * else, so it has never known that a third gate is standing in the way. On
 * the tracks that ship, five of seventeen fly the line clean through an
 * opening that is not the one being scored, which is not a thing a pilot
 * would ever do: you go round.
 *
 * The fix is the mechanism the stack wrap already uses. Find where the curve
 * crosses a foreign opening, and put a steering knot at that crossing pushed
 * just outside the frame, so the curve is forced past the gate instead of
 * through it. It carries no sequence entry, exactly like a stack wrap, so
 * nothing downstream counts it as a station.
 *
 * It escapes across the NEARER edge, which is the smaller correction and the
 * one a pilot would take, and it clears by the same margin the warning pass
 * gives a barrier, because the line is a centreline and a quad is not a
 * point.
 */
function apertureRects(doc) {
  const out = [];
  for (const el of doc.elements) {
    if (kindOf(el) !== KIND.APERTURE) {
      continue;
    }
    for (const ap of aperturesOf(el)) {
      out.push({
        key: `${el.id}#${ap.index}`,
        c: apertureCenter(el, ap.index),
        f: apertureFrame(el.yaw, el.pitch),
        hw: ap.clearW / 2,
        hh: ap.clearH / 2,
      });
    }
  }
  return out;
}

/* Which opening, if any, this knot is standing in. */
function keyOf(knot) {
  return knot && knot.seq ? `${knot.seq.elementId}#${knot.seq.apertureIndex ?? 0}` : null;
}

function firstCrossing(a, b, rects, kScale, clear) {
  const span = dist(a.pos, b.pos);
  if (span < 1e-6) {
    return null;
  }
  const m0 = scale(a.tangent, span * kScale);
  const m1 = scale(b.tangent, span * kScale);
  const mine = new Set([keyOf(a), keyOf(b)].filter(Boolean));
  let prev = hermite(a.pos, b.pos, m0, m1, 0);
  for (let i = 1; i <= DODGE_PROBE; i += 1) {
    const t = i / DODGE_PROBE;
    const p = hermite(a.pos, b.pos, m0, m1, t);
    for (const r of rects) {
      if (mine.has(r.key)) {
        continue;
      }
      const d0 = dot(sub(prev, r.c), r.f.normal);
      const d1 = dot(sub(p, r.c), r.f.normal);
      if (d0 === d1 || (d0 > 0) === (d1 > 0)) {
        continue;
      }
      const s = d0 / (d0 - d1);
      const x = add(prev, scale(sub(p, prev), s));
      const rel = sub(x, r.c);
      const u = dot(rel, r.f.widthAxis);
      const v = dot(rel, r.f.heightAxis);
      if (Math.abs(u) > r.hw || Math.abs(v) > r.hh) {
        continue;
      }
      /* Inside the opening. Escape across whichever edge is nearer, which
       * is the smaller correction of the two available. */
      const outU = r.hw - Math.abs(u);
      const outV = r.hh - Math.abs(v);
      const axis = outU <= outV ? r.f.widthAxis : r.f.heightAxis;
      const sign = (outU <= outV ? u : v) >= 0 ? 1 : -1;
      const push = (outU <= outV ? outU : outV) + clear;
      const tAt = (i - 1 + s) / DODGE_PROBE;
      return {
        pos: add(x, scale(axis, sign * push)),
        tangent: normalize(hermiteD1(a.pos, b.pos, m0, m1, tAt), a.tangent),
        through: r.key,
      };
    }
    prev = p;
  }
  return null;
}

function avoidForeignApertures(doc, knots) {
  const rects = apertureRects(doc);
  if (rects.length < 2 || knots.length < 2) {
    return knots;
  }
  const kScale = doc.settings.tangentScale;
  /* The same clearance the warning pass gives a barrier, which is class
   * aware: 0.35 m on a field, 0.10 m in a RaceGOW room. */
  const clear = tuningFor(trackClassOf(doc)).barrierClearance;
  const out = knots.slice();
  for (let guard = 0; guard < DODGE_LIMIT; guard += 1) {
    let inserted = false;
    for (let i = 0; i < out.length - 1; i += 1) {
      const hit = firstCrossing(out[i], out[i + 1], rects, kScale, clear);
      if (!hit) {
        continue;
      }
      out.splice(i + 1, 0, {
        pos: hit.pos,
        tangent: hit.tangent,
        role: 'wrap',
        seq: null,
        index: null,
        elementId: null,
      });
      inserted = true;
      break;
    }
    if (!inserted) {
      return out;
    }
  }
  return out;
}

/* Cubic Hermite basis, and its first two derivatives. */
function hermite(p0, p1, m0, m1, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return add(add(scale(p0, h00), scale(m0, h10)), add(scale(p1, h01), scale(m1, h11)));
}

function hermiteD1(p0, p1, m0, m1, t) {
  const t2 = t * t;
  const h00 = 6 * t2 - 6 * t;
  const h10 = 3 * t2 - 4 * t + 1;
  const h01 = -6 * t2 + 6 * t;
  const h11 = 3 * t2 - 2 * t;
  return add(add(scale(p0, h00), scale(m0, h10)), add(scale(p1, h01), scale(m1, h11)));
}

function hermiteD2(p0, p1, m0, m1, t) {
  const h00 = 12 * t - 6;
  const h10 = 6 * t - 4;
  const h01 = -12 * t + 6;
  const h11 = 6 * t - 2;
  return add(add(scale(p0, h00), scale(m0, h10)), add(scale(p1, h01), scale(m1, h11)));
}

/*
 * Build the whole line.
 *
 * Returns:
 *   knots     as above
 *   samples   [{ pos, s, radius, segment, t }] with s the arc length from
 *             the start in metres and radius the radius of curvature in
 *             metres, Infinity on a straight
 *   length    total arc length in metres
 *   closed    true when the lap returns to the first element, which is when
 *             start pads exist or the caller asked for closeLoop
 *   segments  [{ a, b, from, to }] knot pairs, for the warning pass
 *
 * closeLoop is passed straight to buildKnots and explained there. It is off
 * by default, so every existing caller gets exactly what it got before.
 */
export function buildPath(doc, { closeLoop = false } = {}) {
  const knots = buildKnots(doc, { closeLoop });
  const per = Math.max(4, Math.round(doc.settings.samplesPerSegment));
  const kScale = doc.settings.tangentScale;
  const samples = [];
  const segments = [];

  if (knots.length < 2) {
    return { knots, samples, segments, length: 0, closed: false, tightest: null };
  }

  let s = 0;
  let prev = null;
  let tightest = null;

  for (let i = 0; i < knots.length - 1; i += 1) {
    const a = knots[i];
    const b = knots[i + 1];
    const span = dist(a.pos, b.pos);
    /* Two knots on top of each other have no segment. Skip rather than
     * divide by zero; warnings.js reports the coincidence. */
    if (span < 1e-6) {
      segments.push({ a, b, from: i, to: i + 1, degenerate: true });
      continue;
    }
    const m0 = scale(a.tangent, span * kScale);
    const m1 = scale(b.tangent, span * kScale);
    segments.push({ a, b, from: i, to: i + 1, degenerate: false });

    const last = i === knots.length - 2;
    const steps = last ? per : per - 1;
    for (let j = 0; j <= steps; j += 1) {
      const t = j / per;
      const tt = last && j === steps ? 1 : t;
      const pos = hermite(a.pos, b.pos, m0, m1, tt);
      const d1 = hermiteD1(a.pos, b.pos, m0, m1, tt);
      const d2 = hermiteD2(a.pos, b.pos, m0, m1, tt);
      const speed = length(d1);
      const kappa = speed > 1e-9 ? length(cross(d1, d2)) / (speed * speed * speed) : 0;
      const radius = kappa > 1e-9 ? 1 / kappa : Infinity;
      if (prev) {
        s += dist(prev, pos);
      }
      prev = pos;
      samples.push({ pos, s, radius, segment: i, t: tt });
      if (tightest == null || radius < tightest.radius) {
        tightest = { radius, s, pos, segment: i };
      }
    }
  }

  const start = startPadsOf(doc);
  return {
    knots,
    samples,
    segments,
    length: s,
    closed: (Boolean(start) || closeLoop) && doc.sequence.length > 0,
    tightest,
  };
}

/*
 * The elevation profile: height above the ground against distance along the
 * lap. Thinned to at most `maxPoints` so the chart draws a line rather than
 * a smear, keeping the extremes because a profile that loses its highest
 * point is not a profile.
 */
export function elevationProfile(path, maxPoints = 400) {
  const n = path.samples.length;
  if (!n) {
    return { points: [], minZ: 0, maxZ: 0, length: 0 };
  }
  const stride = Math.max(1, Math.ceil(n / maxPoints));
  /*
   * Two passes, because the extremes have to be KNOWN before the thinning
   * can be told to keep them. One pass computed minZ and maxZ correctly and
   * then emitted purely on the stride, so the peak of the course was
   * reported in the axis labels and missing from the line under them
   * whenever it did not happen to land on a multiple of the stride.
   */
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minIdx = 0;
  let maxIdx = 0;
  for (let i = 0; i < n; i += 1) {
    const z = path.samples[i].pos.z;
    if (z < minZ) {
      minZ = z;
      minIdx = i;
    }
    if (z > maxZ) {
      maxZ = z;
      maxIdx = i;
    }
  }
  const points = [];
  for (let i = 0; i < n; i += 1) {
    if (i % stride === 0 || i === n - 1 || i === minIdx || i === maxIdx) {
      const p = path.samples[i];
      points.push({ s: p.s, z: p.pos.z });
    }
  }
  return { points, minZ, maxZ, length: path.length };
}

/* Distinct elements that appear in the flying order. A ladder flown twice
 * is one element and two entries; quoting only one of those is how a course
 * description ends up wrong. The results panel now breaks the field down by
 * type, and still reports the entry count separately as "in the order". */
export function sequencedElementCount(doc) {
  return new Set(doc.sequence.map((s) => s.elementId)).size;
}
