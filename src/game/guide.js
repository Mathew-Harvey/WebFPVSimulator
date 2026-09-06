/*
 * guide.js: the marks on the ground that say where to fly.
 *
 * WHY THIS IS NOT THE BUILDER'S HERMITE. path.js draws a smooth cubic
 * through every knot with tangents taken off gate normals. That is the
 * right line for the plan view and for the curvature warning, because it
 * is forced through every opening square-on. It is the wrong line to
 * paint on the grass. A racer does not square up to every gate and then
 * balloon out to the next one; they pull a taut string around the flags
 * and go through the gates on the way. Painting the Hermite is how you
 * end up with a kart-track stripe that misses the side of a flag a
 * pilot would actually take.
 *
 * WHAT A RACER FLIES, as geometry:
 *
 *   a flag or a cone is a peg of radius `clearance`. The line is the
 *   taut string around that peg, on the pass side the sequence named;
 *   a gate is a point the string has to hit. The line goes through the
 *   opening's centre and does not try to wrap it;
 *   stacked wraps (split-S, spiral) are already offset knots, so they
 *   are points too. The ground mark is the plan of that wrap, which is
 *   the bit that says "go around, then back through".
 *
 * The paint is sparse on purpose. A dashed centreline, and arrows only
 * where the pilot has a height decision: two arrows side by side means
 * go up, one arrow means stay low. A comma on the fly side of an
 * isolated flag shows the pass. Close flags in a slalom get the dashes
 * only; wrapping every pole with a chevron is how the marks stacked.
 * A continuous stripe would read as a road.
 *
 * Scene frame, Y up, metres. This file does not import the builder and
 * it does not import Three.js: the field map must not pay for a track
 * document to draw its own figure eight, and the builder self test must
 * be able to check the line in Node. That includes racegow.js, so every
 * RaceGOW figure quoted below is written out as a literal with its source
 * named rather than imported.
 *
 * TWO TRACK CLASSES. Every length in GUIDE is metres of paint, and paint
 * is sized against the aircraft that flies over it and the track it is
 * drawn on. 'full' is the sixty metre field: a 1.524 m MultiGP gate, a
 * 5 inch quad that sweeps 0.1735 m to a blade tip, a lap of about 570 m.
 * 'micro' is a RaceGOW room: a 0.711 m gate out of 26.7 mm PVC, a 65 mm
 * whoop that sweeps 0.048 m, a lap of about 7 m inside a 1.42 by 2.13 m
 * envelope, in a 5 by 6 m room with a 2.4 m ceiling. The class comes in as
 * an argument, from src/game/trackdoc.js and from the builder's two views,
 * and guideFor turns it into one paint table. Nothing in this file reads a
 * global to find out which track it is drawing.
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

const TAU = Math.PI * 2;

/* Paint layout. One named place, so a denser line is a decision rather
 * than four magic numbers that drift. */
export const GUIDE = {
  /* Sample spacing of the painted polyline, metres. Fine enough that a
   * 1.5 m flag wrap is a curve, coarse enough that a 570 m lap is a few
   * hundred points. */
  sample: 0.35,
  /* Dash on, gap, metres. Sparse: the dashes say "this way" without
   * paving a lane. */
  dash: 1.05,
  gap: 2.4,
  /* Shortest run of samples that is still a dash. Anything under it is the
   * painter stamping a dot on the lip of a hole rather than drawing a mark,
   * and a floor of four fifths of a sample is what drops a run of one
   * sample while keeping a run of two. */
  dashMin: 0.28,
  /* Two points closer together than this are the same point. The sampler
   * welds them rather than leaving a zero length segment, because the
   * ribbon takes its normal from the segment direction and a zero length
   * segment has none. */
  weld: 0.04,
  /* How far the end of the line has to be from the last resampled point
   * before it is worth a sample of its own. */
  tailMin: 0.05,
  /* A marker with a clearance smaller than this is a point on the line and
   * not a peg to wrap: a waypoint declares zero and is meant to be flown
   * through, not around. */
  pegRadius: 0.25,
  /* Keep the paint off the PVC. The start stands had their own, larger
   * hole while the pads were a knot on the line; the line does not go near
   * them any more. */
  holeGate: 1.15,
  holeFlag: 0.35,
  /* Arrow sits this far before a height decision, along the line. */
  approach: 6.8,
  /* How far further back the next try goes when that point is in a hole or
   * on a flag, and the last resort, which is just past the cue instead of
   * before it. */
  approachStep: 3.5,
  pastCue: 2.6,
  /* Leaving the start gate there is no line behind the cue to put an arrow
   * on, so these are tried ahead of it instead, in order. */
  startAhead: [2.2, 4.5, 7.5],
  /* How far into the lap still counts as being at the start gate. */
  startS: 1.6,
  /* A direction arrow on a long empty run with nothing else to aim at. */
  longRun: 70,
  /* How far the long run scan steps on when a candidate point is blocked.
   * Small enough to find the far side of a hole, big enough not to test
   * every sample twice. */
  runRetry: 2,
  /* Fly height at or above this, metres, is "go up". A standard 5x5
   * opening centres at 0.76 m; a 5x5 tower centres at 2.29 m. */
  highM: 2.0,
  /* Hysteresis either side of highM. Without it a course whose gates sit
   * a few centimetres apart across the threshold painted an arrow at every
   * one of them, alternating one lane and two. See lanesNext.
   *
   * 0.25 and not wider: a 5x5 tower centres at 2.29 m and MUST still read
   * as go up, so the upper edge has to stay below that. That leaves 1.75 to
   * 2.25 as the band a course has to cross to say anything. */
  highBand: 0.25,
  /* Do not sit an arrow this close to a flag pole. The wrap already
   * talks there, and a second mark is the stacked mess. */
  flagArrowClear: 4.2,
  /* Two painted wraps closer than this read as one blob. */
  wrapCluster: 5.0,
  /* Euclidean keep-out between arrows, metres. Height changes may sit
   * closer than a long-run filler. */
  arrowClear: 5.0,
  arrowClearRun: 14,
  /* Flag wrap: how much of the clearance circle is painted. A full ring
   * would say "go either side". 120 degrees on the fly side does not. */
  wrapSpan: (120 * Math.PI) / 180,
  /* Tessellated paint, metres. Sized to read from a 7.5 cm FPV camera
   * on mown turf, which is paler than meadow grass. */
  dashW: 0.30,
  arcW: 0.44,
  arrowLen: 1.85,
  arrowW: 0.52,
  arrowShaft: 0.16,
  /* Where the head meets the shaft, behind the arrow's centre. */
  arrowNotch: 0.12,
  /* Centre to centre of a dual "go up" pair. */
  pairGap: 0.98,
  /* What a marker gets when its sequence entry names no clearance. */
  markerClearance: 1.5,

  /*
   * THE MICRO SET, and it exists because every number above was chosen
   * against a 1.524 m gate, a 5 inch quad 0.347 m across and a lap of about
   * 570 m. A RaceGOW room is none of those things. Every figure quoted in
   * this block is from src/trackbuilder/racegow.js, which cites where
   * RaceGOW published it.
   *
   * They are in one block rather than scattered through the entries above,
   * so a reader can see the whole of what changes with the class and so
   * guideFor is one lookup rather than thirty. Same shape as TUNING.micro
   * in src/trackbuilder/elements.js, deliberately.
   *
   * TWO KINDS OF LENGTH SCALE DIFFERENTLY HERE, and saying it once beats
   * saying it thirty times.
   *
   * A length ACROSS the line is read through the camera. A micro pilot flies
   * at a ground gate's opening centre, 0.356 m, where a full sized one flies
   * at 0.762 m, so a mark a little under half as wide subtends the same
   * angle and the paint looks the same in the goggles.
   *
   * A length ALONG the line cannot use that ratio, because the lap did not
   * scale with the gates. 570 m became 7 m, a factor of eighty, while the
   * gate only halved: a RaceGOW track is packed, six or seven elements
   * inside 1.42 by 2.13 m, so a leg between two gates is about a metre.
   * Every along the line number below is derived from that line instead:
   * from RaceGOW's 0.762 m nominal gate spacing, from the one metre leg,
   * and from the 7 m lap.
   *
   * `wrapSpan` is deliberately absent and must stay absent. 120 degrees of
   * a circle is 120 degrees of a circle whatever the circle is.
   */
  micro: {
    /*
     * The tightest thing the polyline has to resolve is a wrap around a
     * pole, and a micro pole's clearance is RaceGOW's published 14 inch
     * minimum from the centre of a gate to a pole, 0.356 m. A 120 degree
     * window on that circle is 0.75 m of arc, and 0.08 m samples cut it
     * into nine segments, which is what the full sized 0.35 gives on a
     * 1.5 m wrap. A 7 m lap is then about ninety points, cheap enough to
     * rebuild every time an author nudges an element.
     */
    sample: 0.08,
    /*
     * The dash rhythm is a speed cue, so it is derived in time. A 5 inch at
     * 20 m/s crosses the full sized 3.45 m period in 0.17 s. A whoop's
     * technical speed is 4 to 6 m/s, so 0.80 m is the same 0.16 s at 5 m/s,
     * and the 31 percent duty cycle is the full sized 30 percent, so the
     * line stays as sparse as it reads today.
     *
     * The spatial check is the one that would have bitten. A micro leg is
     * about a metre, so a period longer than a leg paints some legs and
     * skips others, and a skipped leg reads as the line stopping rather
     * than as a gap between dashes. 0.80 m puts a dash on every leg.
     */
    dash: 0.25,
    gap: 0.55,
    /*
     * Four fifths of one 0.08 m sample, the same relation the full sized
     * 0.28 has to its own 0.35 m sample. This twin is not a nicety: a micro
     * dash is 0.25 m long and the full sized floor is 0.28 m, so leaving it
     * unscaled discards every dash on the track and the line disappears.
     */
    dashMin: 0.06,
    /*
     * 10 mm, well under the 26.7 mm pipe a RaceGOW track is built from, so
     * welding two points this close can never shift the line off the side
     * of a gate. It is also an eighth of a sample, which is what the full
     * sized 0.04 is to its 0.35.
     */
    weld: 0.01,
    /* The same argument on the resampler's tail: 0.012 m is to a 0.08 m
     * sample what the full sized 0.05 is to a 0.35 m one. */
    tailMin: 0.012,
    /*
     * A micro flag or cone carries the 14 inch pole clearance, 0.356 m, and
     * a waypoint carries zero, so the test only has to separate those two.
     * 0.05 m is a whoop's own 0.048 m sweep to a blade tip: a clearance
     * smaller than the aircraft is not something to fly around.
     *
     * The full sized 0.25 does happen to still work at the default
     * clearance, because 0.356 clears it. It stops working the moment an
     * author pulls a micro flag's clearance in, and the failure then looks
     * like the wrap code being broken rather than like a threshold sized
     * for a different aircraft.
     */
    pegRadius: 0.05,
    /*
     * The paint keep out at a gate, and it is NOT the full sized rule
     * scaled. Full sized, 1.15 m clears the whole footprint: half a 1.524 m
     * opening, plus its 33 mm tube, plus a 5 inch quad's own 0.347 m width.
     * A 570 m lap can afford 2.3 m of that at each of a dozen gates. The
     * same rule on a whoop gate is 0.48 m, and six or seven of those on a
     * 7 m lap removes more line than the lap has, so no dash would ever be
     * drawn anywhere on the track.
     *
     * So this one is derived from the structure instead. RaceGOW rule 2
     * makes every gate fully enclosed, which puts a 26.7 mm pipe flat on
     * the floor across the line at every opening. The paint has to stop
     * before that bar, far enough back that the last dash does not appear
     * to touch it: half the pipe, 0.013 m, plus one whoop's 0.096 m width.
     * The uprights sit 0.38 m either side of a 0.08 m dash and were never
     * the thing in question.
     */
    holeGate: 0.11,
    /*
     * One aircraft width off the pole, which is exactly what the full sized
     * 0.35 is: a 5 inch is 0.347 m across. A whoop is 0.096 m across, so
     * the last dash still stops a whole body clear of the pipe.
     */
    holeFlag: 0.10,
    /*
     * Where the arrow sits before the height decision it announces. The
     * full sized 6.8 m is a fifth of a 38 m leg. On a 1.42 by 2.13 m course
     * it is outside the building.
     *
     * The window derives it. A leg is about a metre, 0.11 m at each end is
     * gate keep out, and the arrow needs half its own 0.36 m length clear
     * of both, so its centre can only land between 0.29 and 0.71 m before
     * the gate. 0.45 m is that window's middle pulled a shade towards the
     * gate, because an arrow that is ambiguous about WHICH gate it belongs
     * to is worse than one read slightly late.
     */
    approach: 0.45,
    /* One gate keep out across, 2 x 0.11 m, so a rejected point clears
     * whatever rejected it in a single step instead of being tried again
     * inside the same hole. */
    approachStep: 0.22,
    /* Just past the cue: the 0.11 m keep out plus half a 0.36 m arrow, so
     * the arrow's tail clears the floor bar rather than straddling it. */
    pastCue: 0.29,
    /* Leaving the start gate. The first try is that same point past the
     * bar, and the two after it step by one arrow length, so a blocked try
     * lands a whole arrow clear of the last one. 0.87 m is most of a leg
     * and as far ahead as a 7 m lap can usefully look. */
    startAhead: [0.29, 0.58, 0.87],
    /* How far into the lap still counts as the start gate. 1.6 m of a
     * 570 m lap is the first cue and nothing else; 1.6 m of a 7 m lap is a
     * quarter of the track and would treat the first four gates as the
     * start. 0.20 m is a fifth of a leg, which catches the start gate
     * alone. */
    startS: 0.20,
    /*
     * The filler arrow, and on a micro track it should almost never fire.
     * The full sized 70 m is an eighth of a lap on a field where a pilot
     * genuinely can be on a stretch with nothing to aim at. In a 5 by 6 m
     * room the next gate is a metre ahead and the far wall is 2.5 m away,
     * so no such stretch exists. Scaling by the lap would give 0.86 m,
     * which is a filler on every leg, drowning the height cues that are the
     * only thing an arrow says here.
     *
     * Half a lap. At most one filler, and only on a track whose sequence
     * really does leave a gap with no height change in it.
     */
    longRun: 3.5,
    /* One whoop width, the smallest step that can move a blocked candidate
     * off whatever blocked it. */
    runRetry: 0.10,
    /*
     * The "go up" threshold, and RaceGOW's own published heights decide it.
     * A ground gate's opening centres at 0.356 m, because rule 2 puts the
     * bar on the floor. The second gate of a stack is at least 1.067 m by
     * rule 5, and at the nominal 30 inch pitch it lands at 1.118 m. An
     * Elevated Gate centres at 1.778 m and the top of a triple stack at
     * 1.880 m, which is as high as a 2.4 m ceiling allows.
     *
     * So the threshold has to sit between 0.356 and 1.067, and 0.711 m is
     * the midpoint of those two to within a millimetre. It is also exactly
     * one gate opening, which is the height a pilot has actually climbed
     * when they leave the bottom of a stack for the top of it.
     *
     * The full sized 2.0 m is above every height a micro track can build,
     * so leaving it unscaled makes every arrow on every micro track say
     * stay low, always, including the one under the Elevated Gate.
     */
    highM: 0.711,
    /*
     * Hysteresis either side, so 0.411 to 1.011 m is the band a track has
     * to cross before the cue changes. That leaves 0.055 m of margin at
     * BOTH ends: a ground gate at 0.356 m stays below the lower edge, and
     * rule 5's 1.067 m stack gate stays above the upper one. Those are the
     * two heights this cue must never confuse. Any wider and one of them
     * falls inside the band and stops being a height decision at all.
     */
    highBand: 0.30,
    /*
     * Do not sit an arrow this close to a pole. The comma is painted on the
     * 0.356 m clearance circle and stroked 0.12 m wide, so its outer edge
     * is at 0.416 m, and an arrow needs half its own 0.36 m length clear of
     * that. 0.60 m is where an arrow stops touching the wrap.
     *
     * The full sized 4.2 m is twice the depth of the whole course, so it
     * would leave nowhere on a micro track an arrow is allowed to be.
     */
    flagArrowClear: 0.60,
    /*
     * Two commas closer than this read as one blob, because the floor
     * between their circles is thinner than the stroke on them. Two 0.356 m
     * circles need 2 x 0.356 plus one 0.12 m stroke between centres, which
     * is 0.83 m. RaceGOW's own pole to pole minimum is 36 inches, 0.914 m,
     * so a legally built slalom keeps a comma on every pole and only a pair
     * built tighter than the rules allow is treated as one mark.
     *
     * The full sized 5.0 m is wider than the room, so every pole on a micro
     * track was inside it and no wrap was ever painted at all.
     */
    wrapCluster: 0.83,
    /*
     * Euclidean keep out between arrows. RaceGOW's nominal gate spacing is
     * 30 inches, 0.762 m, which is what a leg is, so an arrow keeps a whole
     * leg to itself and two height cues cannot stack on one stretch. The
     * full sized 5.0 m is most of a lap: at most one arrow survived the
     * whole track.
     */
    arrowClear: 0.76,
    /* A filler gives way to everything, so it needs more room than a height
     * cue does: further than the whole course is deep, 2.13 m. On a track
     * carrying any height cue at all there is then no room for one, which
     * is the same answer longRun gives and is the intended one. */
    arrowClearRun: 2.13,
    /*
     * A dash 0.86 as wide as the aircraft that flies over it, which is what
     * the full sized 0.30 m is to a 5 inch's 0.347 m. Any wider and the
     * line starts reading as a road, which is the one thing this paint must
     * never do.
     */
    dashW: 0.08,
    /* The comma is stroked one and a half dash widths, the full sized
     * ratio, so a wrap reads as a different mark from a dash rather than as
     * a bent one. */
    arcW: 0.12,
    /*
     * The arrow is sized by the LEG, not by the gate, and this is the one
     * place the micro paint deliberately drops a full sized proportion.
     *
     * The full sized pair spans its gate: 0.98 m of centres plus 0.52 m of
     * width is 1.50 m across a 1.524 m opening, and a 1.85 m arrow is
     * nothing on a 38 m leg. Holding that relation at micro scale gives an
     * 0.89 m arrow, and the shortest leg the line can have is RaceGOW's
     * 0.762 m nominal gate spacing, so it would not fit between two gates
     * at all.
     *
     * 0.36 m is half a gate opening. On that shortest leg it leaves 0.09 m
     * of clear line at each end once the 0.11 m keep outs are taken off,
     * and on a typical one metre leg it sits inside the window `approach`
     * picks from with room to spare.
     */
    arrowLen: 0.36,
    /* The same 3.6 to 1 head the full sized arrow has, so it still reads as
     * an arrow and not as a wedge. It is also one whoop across, 0.096 m,
     * which is the other way of arriving at the same number. */
    arrowW: 0.10,
    /* Shaft at 0.3 of the head's width, the full sized ratio. 30 mm of
     * paint still subtends five degrees seen from 0.356 m up. */
    arrowShaft: 0.03,
    /* Where the head meets the shaft. A pure shape fraction, 0.065 of the
     * arrow's length, exactly as the full sized 0.12 is of 1.85. */
    arrowNotch: 0.023,
    /*
     * Centre to centre of a "go up" pair. The two arrows have to read as
     * ONE mark, so the floor between them stays under one arrow wide: the
     * full sized pair leaves 0.46 m between two 0.52 m arrows, and this one
     * leaves 0.09 m between two 0.10 m arrows. Spanning the whole 0.711 m
     * opening the way the full sized pair does would put five arrow widths
     * of empty floor between them, and they would read as two separate
     * cues, which is the opposite of what a pair means.
     */
    pairGap: 0.19,
    /* A marker whose sequence entry names no clearance. RaceGOW's published
     * minimum from the centre of a gate to a pole is 14 inches, which is
     * what a micro flag and a micro cone are given in
     * src/trackbuilder/elements.js. */
    markerClearance: 0.356,
  },
};

/*
 * The class a guide is painted for, normalised the way
 * src/trackbuilder/elements.js normalises a document's. Anything that is
 * not 'micro' is the sixty metre field, so every track ever published and
 * every caller that has never heard of a class keeps exactly what it has.
 */
function classOf(cls) {
  return cls === 'micro' ? 'micro' : 'full';
}

/*
 * The paint table for a track class. Falls through to the full sized value
 * for anything the micro block does not name, which is `wrapSpan` and
 * nothing else. Same shape as tuningFor in src/trackbuilder/elements.js.
 */
export function guideFor(cls) {
  if (classOf(cls) !== 'micro') {
    return GUIDE;
  }
  return { ...GUIDE, ...GUIDE.micro };
}

export function emptyGuide(cls) {
  return {
    samples: [], dashes: [], arrows: [], flagArcs: [], length: 0, trackClass: classOf(cls),
  };
}

function hypot2(dx, dz) {
  return Math.hypot(dx, dz);
}

function wrapTau(a) {
  const x = a % TAU;
  return x < 0 ? x + TAU : x;
}

/* Shortest signed turn from a to b, in (-pi, pi]. */
function turnDelta(a, b) {
  let d = wrapTau(b) - wrapTau(a);
  if (d > Math.PI) {
    d -= TAU;
  }
  if (d <= -Math.PI) {
    d += TAU;
  }
  return d;
}

function circDist(a, b) {
  return Math.abs(turnDelta(a, b));
}

function angOf(cx, cz, x, z) {
  return Math.atan2(z - cz, x - cx);
}

function onCircle(cx, cz, r, ang) {
  return { x: cx + r * Math.cos(ang), z: cz + r * Math.sin(ang), ang };
}

function isPeg(k, g) {
  return k.role === 'marker' && k.radius > g.pegRadius && k.poleX != null && k.poleZ != null;
}

function pegCrowded(knots, i, g) {
  const a = knots[i];
  for (let j = 0; j < knots.length; j += 1) {
    if (j === i || !isPeg(knots[j], g)) {
      continue;
    }
    if (hypot2(a.poleX - knots[j].poleX, a.poleZ - knots[j].poleZ) < g.wrapCluster) {
      return true;
    }
  }
  return false;
}

/*
 * External (same-side) and internal (crossing) common tangents of two
 * circles. A racing line between two flags picks the pair whose contact
 * points sit closest to the two apexes, which is how an S-bend gets the
 * crossing tangent and a same-side pair gets the outer one, without a
 * separate case for passSide.
 */
function circleTangents(c1x, c1z, r1, c2x, c2z, r2) {
  const dx = c2x - c1x;
  const dz = c2z - c1z;
  const d = Math.hypot(dx, dz);
  const out = [];
  if (!(d > 1e-6)) {
    return out;
  }
  const theta = Math.atan2(dz, dx);
  const add = (k, flip) => {
    if (Math.abs(k) > 1) {
      return;
    }
    const phi = Math.acos(k);
    for (const sign of [1, -1]) {
      const n = theta + sign * phi;
      out.push({
        a: onCircle(c1x, c1z, r1, n),
        b: onCircle(c2x, c2z, r2, flip ? n + Math.PI : n),
      });
    }
  };
  add((r1 - r2) / d, false);
  add((r1 + r2) / d, true);
  return out;
}

/* Tangents from a point to a circle. Two of them, or none if the point
 * is inside. */
function pointTangents(px, pz, cx, cz, r) {
  const dx = px - cx;
  const dz = pz - cz;
  const d = Math.hypot(dx, dz);
  if (d <= r + 1e-6) {
    return [];
  }
  const theta = Math.atan2(dz, dx);
  const phi = Math.acos(Math.min(1, r / d));
  return [
    onCircle(cx, cz, r, theta + phi),
    onCircle(cx, cz, r, theta - phi),
  ];
}

function nearestTangent(cands, cx, cz, kx, kz) {
  const want = angOf(cx, cz, kx, kz);
  let best = cands[0];
  let bestD = Infinity;
  for (const t of cands) {
    const d = circDist(t.ang, want);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/*
 * Walk the circle from `from` to `to` via `via`, the short way that still
 * contains the apex. Returns signed sweep (positive ccw) starting at from.
 */
function sweepVia(from, via, to) {
  const ccw = wrapTau(via - from) + wrapTau(to - via);
  const cw = wrapTau(from - via) + wrapTau(via - to);
  if (ccw <= cw) {
    return ccw;
  }
  return -cw;
}

function pushPoint(pts, x, z, g) {
  const last = pts[pts.length - 1];
  if (last && hypot2(x - last.x, z - last.z) < g.weld) {
    last.x = x;
    last.z = z;
    return;
  }
  pts.push({ x, z });
}

function sampleArc(pts, cx, cz, r, fromAng, sweep, g) {
  const len = Math.abs(sweep) * r;
  const steps = Math.max(2, Math.ceil(len / g.sample));
  const arc = [];
  for (let i = 0; i <= steps; i += 1) {
    const ang = fromAng + sweep * (i / steps);
    const p = onCircle(cx, cz, r, ang);
    pushPoint(pts, p.x, p.z, g);
    arc.push({ x: p.x, z: p.z, ang });
  }
  return arc;
}

function knotPoint(k) {
  return { x: k.x, z: k.z };
}

/*
 * The taut string through the knots, as a dense polyline, plus the flag
 * wraps the painter will stroke more heavily.
 */
function pickPair(pairs, angA, angB) {
  let best = pairs[0];
  let bestD = Infinity;
  for (const pair of pairs) {
    const d = circDist(pair.a.ang, angA) + circDist(pair.b.ang, angB);
    if (d < bestD) {
      bestD = d;
      best = pair;
    }
  }
  return best;
}

function stringLine(knots, g) {
  const pts = [];
  const flagArcs = [];
  if (knots.length === 0) {
    return { pts, flagArcs };
  }

  const pegAt = (i) => (isPeg(knots[i], g) ? knots[i] : null);

  /* Adjacent peg-to-peg tangents, computed once so the inbound contact
   * on flag N is the same point as the outbound contact from flag N-1. */
  const inbound = new Array(knots.length);
  const outbound = new Array(knots.length);
  for (let i = 0; i < knots.length - 1; i += 1) {
    const a = pegAt(i);
    const b = pegAt(i + 1);
    if (!a || !b) {
      continue;
    }
    const pairs = circleTangents(a.poleX, a.poleZ, a.radius, b.poleX, b.poleZ, b.radius);
    if (!pairs.length) {
      continue;
    }
    const pair = pickPair(
      pairs,
      angOf(a.poleX, a.poleZ, a.x, a.z),
      angOf(b.poleX, b.poleZ, b.x, b.z),
    );
    outbound[i] = pair.a;
    inbound[i + 1] = pair.b;
  }

  for (let i = 0; i < knots.length; i += 1) {
    const k = knots[i];
    const peg = pegAt(i);
    if (!peg) {
      pushPoint(pts, k.x, k.z, g);
      continue;
    }

    const cx = peg.poleX;
    const cz = peg.poleZ;
    const r = peg.radius;
    const apex = knotPoint(peg);
    const apexAng = angOf(cx, cz, apex.x, apex.z);

    let tin = inbound[i];
    if (!tin) {
      const prev = pts.length ? pts[pts.length - 1] : (i > 0 ? knotPoint(knots[i - 1]) : apex);
      const cands = pointTangents(prev.x, prev.z, cx, cz, r);
      tin = cands.length ? nearestTangent(cands, cx, cz, apex.x, apex.z) : { ...apex, ang: apexAng };
    }

    let tout = outbound[i];
    if (!tout) {
      const next = i + 1 < knots.length ? knotPoint(knots[i + 1]) : apex;
      const cands = pointTangents(next.x, next.z, cx, cz, r);
      tout = cands.length ? nearestTangent(cands, cx, cz, apex.x, apex.z) : { ...apex, ang: apexAng };
    }

    const sweep = sweepVia(tin.ang, apexAng, tout.ang);
    pushPoint(pts, tin.x, tin.z, g);
    sampleArc(pts, cx, cz, r, tin.ang, sweep, g);
    pushPoint(pts, tout.x, tout.z, g);

    /* The painted wrap is a window on that arc, centred on the apex, so
     * a long wrap around a hairpin does not ring the flag and a short
     * graze still gets a readable comma. */
    const dir = Math.sign(sweep || 1);
    const wrapFrom = apexAng - dir * (g.wrapSpan * 0.5);
    const wrapSweep = dir * g.wrapSpan;
    const ax = Math.cos(apexAng);
    const az = Math.sin(apexAng);
    const paint = [];
    const wrapSteps = Math.max(4, Math.ceil((r * g.wrapSpan) / g.sample));
    for (let s = 0; s <= wrapSteps; s += 1) {
      const ang = wrapFrom + wrapSweep * (s / wrapSteps);
      const p = onCircle(cx, cz, r, ang);
      /* Never paint the back of the flag. A 120 degree window centred on
       * the apex can still nibble the wrong hemisphere on a tight wrap,
       * and that nibble is exactly the "which side?" confusion this mark
       * exists to prevent. */
      if ((p.x - cx) * ax + (p.z - cz) * az < 0) {
        continue;
      }
      paint.push(p);
    }
    if (paint.length < 3) {
      paint.length = 0;
      const tight = g.wrapSpan * 0.5;
      const from = apexAng - dir * (tight * 0.5);
      const steps = 6;
      for (let s = 0; s <= steps; s += 1) {
        paint.push(onCircle(cx, cz, r, from + dir * tight * (s / steps)));
      }
    }
    /* A slalom of close flags already has the dashed string weaving
     * through. Painting a comma on every pole stacks the marks. Isolated
     * flags keep the wrap so the pass side is still named. */
    if (pegCrowded(knots, i, g)) {
      continue;
    }
    flagArcs.push({
      cx,
      cz,
      r,
      points: paint.map((p) => ({ x: p.x, z: p.z })),
    });
  }

  return { pts, flagArcs };
}

function resample(pts, g) {
  const spacing = g.sample;
  const samples = [];
  if (pts.length === 0) {
    return samples;
  }
  samples.push({ x: pts[0].x, z: pts[0].z, s: 0, hx: 1, hz: 0 });
  let s = 0;
  let acc = 0;
  for (let i = 1; i < pts.length; i += 1) {
    let ax = pts[i - 1].x;
    let az = pts[i - 1].z;
    const bx = pts[i].x;
    const bz = pts[i].z;
    let dx = bx - ax;
    let dz = bz - az;
    let seg = Math.hypot(dx, dz);
    if (seg < 1e-9) {
      continue;
    }
    dx /= seg;
    dz /= seg;
    while (acc + seg >= spacing) {
      const take = spacing - acc;
      ax += dx * take;
      az += dz * take;
      seg -= take;
      s += take;
      acc = 0;
      samples.push({ x: ax, z: az, s, hx: dx, hz: dz });
    }
    acc += seg;
    s += seg;
  }
  const last = pts[pts.length - 1];
  const prev = samples[samples.length - 1];
  if (hypot2(last.x - prev.x, last.z - prev.z) > g.tailMin) {
    const dx = last.x - prev.x;
    const dz = last.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    samples.push({
      x: last.x, z: last.z, s, hx: dx / len, hz: dz / len,
    });
  } else {
    prev.hx = samples.length > 1 ? samples[samples.length - 2].hx : prev.hx;
    prev.hz = samples.length > 1 ? samples[samples.length - 2].hz : prev.hz;
  }
  /* Headings on the first sample. */
  if (samples.length > 1) {
    samples[0].hx = samples[1].hx;
    samples[0].hz = samples[1].hz;
  }
  return samples;
}

function inHole(x, z, holes) {
  for (const h of holes) {
    if (hypot2(x - h.x, z - h.z) <= h.r) {
      return true;
    }
  }
  return false;
}

function layoutDashes(samples, holes, g) {
  const dashes = [];
  if (samples.length < 2) {
    return dashes;
  }
  const period = g.dash + g.gap;
  let run = null;
  const flush = () => {
    if (run && hypot2(run.bx - run.ax, run.bz - run.az) >= g.dashMin) {
      dashes.push(run);
    }
    run = null;
  };
  for (let i = 0; i < samples.length; i += 1) {
    const p = samples[i];
    const on = (p.s % period) < g.dash;
    const clear = !inHole(p.x, p.z, holes);
    if (on && clear) {
      if (!run) {
        run = { ax: p.x, az: p.z, bx: p.x, bz: p.z };
      } else {
        run.bx = p.x;
        run.bz = p.z;
      }
    } else {
      flush();
    }
  }
  flush();
  return dashes;
}

function nearestSample(samples, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < samples.length; i += 1) {
    const d = hypot2(samples[i].x - x, samples[i].z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function sampleAtS(samples, s) {
  if (!samples.length) {
    return null;
  }
  if (s <= samples[0].s) {
    return samples[0];
  }
  const last = samples[samples.length - 1];
  if (s >= last.s) {
    return last;
  }
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].s >= s) {
      const a = samples[i - 1];
      const b = samples[i];
      const t = (s - a.s) / Math.max(1e-9, b.s - a.s);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        s,
        hx: dx / len,
        hz: dz / len,
      };
    }
  }
  return last;
}

function farAlong(arrows, s, min) {
  for (const a of arrows) {
    if (a.s != null && Math.abs(a.s - s) < min) {
      return false;
    }
  }
  return true;
}

function farFrom(arrows, x, z, min) {
  for (const a of arrows) {
    if (hypot2(a.x - x, a.z - z) < min) {
      return false;
    }
  }
  return true;
}

function lanesFor(y, g) {
  return (y ?? 0) >= g.highM ? 2 : 1;
}

/*
 * The lane cue WITH hysteresis, given what it currently reads.
 *
 * lanesFor is a hard edge at highM, and a course whose gates sit either
 * side of it by a few centimetres flipped the cue at every gate: an arrow
 * at each one, alternating one and two, which says "change height now" over
 * and over on a stretch that is essentially level. A height cue that fires
 * constantly is not a cue.
 *
 * Going UP has to clear highM + band, coming back DOWN has to fall below
 * highM - band, so a course has to mean it. The band is generous on
 * purpose: 0.45 m is over half a gate opening, and anything inside it is
 * not a height decision a pilot makes with the sticks.
 */
function lanesNext(y, current, g) {
  const h = y ?? 0;
  if (current == null) {
    return lanesFor(h, g);
  }
  if (current === 2) {
    return h < g.highM - g.highBand ? 1 : 2;
  }
  return h >= g.highM + g.highBand ? 2 : 1;
}

function tooCloseToFlag(x, z, holes, g) {
  for (const h of holes) {
    if (h.kind === 'flag' && hypot2(x - h.x, z - h.z) < g.flagArrowClear) {
      return true;
    }
  }
  return false;
}

function pickArrowPoint(samples, at, holes, after, g) {
  const deltas = after
    ? g.startAhead
    : [-g.approach, -(g.approach + g.approachStep), -(g.approach + g.approachStep * 2), g.pastCue];
  for (const d of deltas) {
    const p = sampleAtS(samples, at.s + d);
    if (!p) {
      continue;
    }
    if (inHole(p.x, p.z, holes) || tooCloseToFlag(p.x, p.z, holes, g)) {
      continue;
    }
    return p;
  }
  return null;
}

/*
 * Arrows are a height cue, not a breadcrumb. Two side by side: go up.
 * One: stay low. Placed on a height change, at the start of the lap,
 * and on a long empty run. Never on a flag.
 */
function layoutArrows(samples, cues, holes, g) {
  const arrows = [];
  if (samples.length < 2) {
    return arrows;
  }

  const cueS = [];
  for (const cue of cues) {
    if (cue.kind === 'flag') {
      continue;
    }
    const i = nearestSample(samples, cue.x, cue.z);
    cueS.push({ cue, at: samples[i], s: samples[i].s });
  }

  /*
   * The lane cue as it stands at this point in the lap. This is SEPARATE
   * from the last arrow actually painted: it used to be one variable, so a
   * cue whose arrow was rejected for sitting too close to its neighbour
   * left the state believing the height had not changed, and the change was
   * then re-announced at the NEXT gate, which is how a cue for one climb
   * ended up drawn somewhere down the following straight.
   */
  let laneState = null;
  let lastLanes = null;

  const tryPush = (p, kind, lanes, min) => {
    if (!p || !farFrom(arrows, p.x, p.z, min)) {
      return false;
    }
    arrows.push({
      x: p.x, z: p.z, s: p.s, hx: p.hx, hz: p.hz, kind, lanes,
    });
    lastLanes = lanes;
    return true;
  };

  /* Every cue is a gate or a flag now. The 'start' special case that used
   * to be threaded through this loop has gone with the start knot: it made
   * the first arrow unconditional and put it AFTER its hole, which is what
   * an arrow leaving the grid wants. The first cue on the line is now the
   * first gate, and `initial` already makes that one unconditional. */
  for (const row of cueS) {
    const lanes = lanesNext(row.cue.y, laneState, g);
    const initial = laneState == null;
    const changed = laneState != null && lanes !== laneState;
    /* Updated whether or not an arrow lands, so a rejected one is dropped
     * rather than deferred onto the next gate. */
    laneState = lanes;
    if (!(initial || changed)) {
      continue;
    }
    const p = pickArrowPoint(samples, row.at, holes, row.s < g.startS, g);
    tryPush(p, 'gate', lanes, g.arrowClear);
  }

  let next = g.longRun;
  for (const p of samples) {
    if (p.s < next) {
      continue;
    }
    if (inHole(p.x, p.z, holes) || tooCloseToFlag(p.x, p.z, holes, g)
        || !farAlong(arrows, p.s, g.longRun)) {
      next = p.s + g.runRetry;
      continue;
    }
    const lanes = laneState ?? lastLanes ?? 1;
    if (tryPush(p, 'run', lanes, g.arrowClearRun)) {
      next = p.s + g.longRun;
    } else {
      next = p.s + g.runRetry;
    }
  }
  return arrows;
}

function holesFromKnots(knots, g) {
  const holes = [];
  for (const k of knots) {
    if (k.role === 'aperture') {
      holes.push({ x: k.x, z: k.z, r: g.holeGate, kind: 'gate' });
    } else if (isPeg(k, g)) {
      holes.push({ x: k.poleX, z: k.poleZ, r: g.holeFlag, kind: 'flag' });
    }
  }
  return holes;
}

function cuesFromKnots(knots) {
  const cues = [];
  for (const k of knots) {
    const y = k.y ?? 0;
    if (k.role === 'aperture') {
      cues.push({ x: k.x, z: k.z, y, kind: 'gate' });
    } else if (k.role === 'marker') {
      cues.push({ x: k.x, z: k.z, y, kind: 'flag' });
    }
  }
  return cues;
}

function finishGuide(pts, flagArcs, holes, cues, g, cls) {
  if (pts.length < 2) {
    return emptyGuide(cls);
  }
  const samples = resample(pts, g);
  const dashes = layoutDashes(samples, holes, g);
  const arrows = layoutArrows(samples, cues, holes, g);
  const length = samples.length ? samples[samples.length - 1].s : 0;
  /* The class travels WITH the paint, so tessellateGuide and everything
   * downstream of it can size a triangle without being handed the class a
   * second time and without a chance of being handed a different one. */
  return {
    samples, dashes, arrows, flagArcs, length, trackClass: classOf(cls),
  };
}

/*
 * Knots in scene XZ:
 *   role     'aperture' | 'marker' | 'wrap' | 'finish'
 *
 * There is no 'start' role. src/trackbuilder/path.js stopped putting the
 * pads on the racing line, because the pads are a place to park and not a
 * hole, and nothing has produced one since. The branches that used to read
 * it are gone rather than left standing: a dead branch naming a role the
 * producer cannot emit is how the pads get put back on the line by someone
 * fixing a missing start hole.
 *   x, z     fly point (already offset, for a marker)
 *   y        fly height, metres, used to pick one arrow or two
 *   poleX, poleZ, radius   only on markers
 */
export function guideFromKnots(knots, cls) {
  const g = guideFor(cls);
  if (!knots || knots.length < 2) {
    return emptyGuide(cls);
  }
  const { pts, flagArcs } = stringLine(knots, g);
  return finishGuide(pts, flagArcs, holesFromKnots(knots, g), cuesFromKnots(knots), g, cls);
}

/*
 * A polyline that is already the racing line (the built in lemniscate,
 * sampled in the direction it is flown). Cues are gates and the start.
 */
export function guideFromPolyline(points, opts = {}) {
  const g = guideFor(opts.trackClass);
  if (!points || points.length < 2) {
    return emptyGuide(opts.trackClass);
  }
  const pts = [];
  for (const p of points) {
    pushPoint(pts, p.x, p.z, g);
  }
  const holes = (opts.holes || []).map((h) => ({
    x: h.x, z: h.z, r: h.r, kind: h.kind || 'gate',
  }));
  const cues = opts.cues || [];
  return finishGuide(pts, [], holes, cues, g, opts.trackClass);
}

/*
 * Knots the painter wants, from a builder path. Document x/y become the
 * guide's x/z, which is also how trackdoc converts after toScene: the
 * taut string does not care which horizontal frame it is in, only that
 * a marker's pole and fly point share one.
 */
export function knotsFromPath(path, cls) {
  const g = guideFor(cls);
  if (!path || !path.knots) {
    return [];
  }
  return path.knots.map((k) => {
    const out = { role: k.role, x: k.pos.x, z: k.pos.y, y: k.pos.z, radius: 0 };
    if (k.role === 'marker' && k.markerPos) {
      out.poleX = k.markerPos.x;
      out.poleZ = k.markerPos.y;
      out.radius = k.seq && k.seq.clearance != null ? k.seq.clearance : g.markerClearance;
    }
    return out;
  });
}

/*
 * Triangles in the XZ plane, three vertices per triangle, each vertex
 * {x, z}. Both the world's mesh and the builder's preview tessellate
 * from this so an arrow cannot be a different shape in the two places.
 */
export function tessellateGuide(guide) {
  const tris = [];
  if (!guide) {
    return tris;
  }
  /* The class rides on the guide itself, put there by finishGuide, so a
   * micro track cannot be handed full sized paint by a caller that forgot
   * to say which it was. */
  const g = guideFor(guide.trackClass);
  const tri = (ax, az, bx, bz, cx, cz) => {
    tris.push({ x: ax, z: az }, { x: bx, z: bz }, { x: cx, z: cz });
  };
  const quad = (ax, az, bx, bz, cx, cz, dx, dz) => {
    tri(ax, az, bx, bz, dx, dz);
    tri(bx, bz, cx, cz, dx, dz);
  };
  const ribbon = (points, halfW) => {
    if (!points || points.length < 2) {
      return;
    }
    for (let i = 1; i < points.length; i += 1) {
      const ax = points[i - 1].x;
      const az = points[i - 1].z;
      const bx = points[i].x;
      const bz = points[i].z;
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < g.weld) {
        continue;
      }
      const nx = (-dz / len) * halfW;
      const nz = (dx / len) * halfW;
      quad(ax - nx, az - nz, ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz);
    }
  };

  for (const d of guide.dashes) {
    ribbon([{ x: d.ax, z: d.az }, { x: d.bx, z: d.bz }], g.dashW * 0.5);
  }
  for (const arc of guide.flagArcs) {
    ribbon(arc.points, g.arcW * 0.5);
  }
  const stampArrow = (x, z, hx, hz) => {
    const len = Math.hypot(hx, hz) || 1;
    const fx = hx / len;
    const fz = hz / len;
    const rx = fz;
    const rz = -fx;
    const half = g.arrowLen * 0.5;
    const tipX = x + fx * half;
    const tipZ = z + fz * half;
    const baseX = x - fx * g.arrowNotch;
    const baseZ = z - fz * g.arrowNotch;
    const backX = x - fx * half;
    const backZ = z - fz * half;
    const hw = g.arrowW * 0.5;
    const sw = g.arrowShaft * 0.5;
    tri(
      tipX, tipZ,
      baseX + rx * hw, baseZ + rz * hw,
      baseX - rx * hw, baseZ - rz * hw,
    );
    quad(
      backX - rx * sw, backZ - rz * sw,
      backX + rx * sw, backZ + rz * sw,
      baseX + rx * sw, baseZ + rz * sw,
      baseX - rx * sw, baseZ - rz * sw,
    );
  };
  for (const a of guide.arrows) {
    const lanes = a.lanes === 2 ? 2 : 1;
    if (lanes === 1) {
      stampArrow(a.x, a.z, a.hx, a.hz);
      continue;
    }
    const len = Math.hypot(a.hx, a.hz) || 1;
    const rx = a.hz / len;
    const rz = -a.hx / len;
    const gap = g.pairGap * 0.5;
    stampArrow(a.x + rx * gap, a.z + rz * gap, a.hx, a.hz);
    stampArrow(a.x - rx * gap, a.z - rz * gap, a.hx, a.hz);
  }
  return tris;
}
