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
 *   3. If START PADS are placed the line starts there along the pads'
 *      heading, and a closing knot with the same position and the same
 *      tangent is appended so the lap joins up smoothly rather than arriving
 *      at the line sideways.
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

import { KIND } from './elements.js';
import {
  elementById, kindOf, entryAnchor, elementNormal, startPadsOf,
} from './model.js';
import { passOffsetSign } from './faces.js';
import { wrapBetween } from './figures.js';
import {
  add, cross, dist, dot, leftOf, length, normalize, scale, sub, yawVector,
} from './geometry.js';

/*
 * The knots, in order. Each carries where it is, which way the quad is going
 * through it, and enough identity for a warning to name it.
 *
 *   role   'start' | 'aperture' | 'marker' | 'finish'
 *   seq    the sequence entry that produced it, or null for start and finish
 *   index  one based position in the flying order, or null
 */
export function buildKnots(doc) {
  const start = startPadsOf(doc);

  /* Raw anchors first, because a marker's offset needs a direction and the
   * direction has to come from geometry that does not itself depend on the
   * offset. Same chain faces.js uses, for the same reason. */
  const raw = [];
  if (start) {
    raw.push({ pos: { ...start.position }, seq: null, role: 'start', index: null });
  }
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
  if (start && raw.length > 1) {
    raw.push({ pos: { ...start.position }, seq: null, role: 'finish', index: null });
  }

  const n = raw.length;
  const knots = [];
  for (let i = 0; i < n; i += 1) {
    const k = raw[i];
    const before = raw[Math.max(0, i - 1)].pos;
    const after = raw[Math.min(n - 1, i + 1)].pos;
    const chainDir = n > 1 ? normalize(sub(after, before), { x: 1, y: 0, z: 0 }) : { x: 1, y: 0, z: 0 };

    if (k.role === 'start' || k.role === 'finish') {
      /* The pads' own heading, both on the way out and on the way back in.
       * Sharing it is what closes the lap smoothly. */
      knots.push({
        pos: { ...k.pos },
        tangent: yawVector(start.yaw),
        role: k.role,
        seq: null,
        index: null,
        elementId: start.id,
      });
      continue;
    }

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

    /* Marker. Push the knot off the pole by the clearance radius, to the
     * left or the right of the direction of travel. Keep the tangent on
     * the plan: a flag has no vertical face, and a z component here is
     * what sends the Hermite between two ground markers underground. */
    const left = leftOf(chainDir);
    const off = scale(left, (k.seq.clearance ?? 0) * passOffsetSign(k.seq.passSide));
    const flat = normalize({ x: chainDir.x, y: chainDir.y, z: 0 }, { x: 1, y: 0, z: 0 });
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
    const wrap = wrapBetween(stacked, a.seq, b.seq);
    withWraps.push({
      pos: wrap.pos,
      tangent: wrap.tangent,
      role: 'wrap',
      seq: null,
      index: null,
      elementId: stacked.id,
    });
  }
  return withWraps;
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
 *   closed    true when the lap returns to the start pads
 *   segments  [{ a, b, from, to }] knot pairs, for the warning pass
 */
export function buildPath(doc) {
  const knots = buildKnots(doc);
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
    closed: Boolean(start) && doc.sequence.length > 0,
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
  const points = [];
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const p = path.samples[i];
    minZ = Math.min(minZ, p.pos.z);
    maxZ = Math.max(maxZ, p.pos.z);
    if (i % stride === 0 || i === n - 1) {
      points.push({ s: p.s, z: p.pos.z });
    }
  }
  return { points, minZ, maxZ, length: path.length };
}

/* Distinct elements that appear in the flying order. The results panel
 * reports both this and the number of entries, because a ladder flown twice
 * is one element and two entries and quoting only one of those is how a
 * course description ends up wrong. */
export function sequencedElementCount(doc) {
  return new Set(doc.sequence.map((s) => s.elementId)).size;
}
