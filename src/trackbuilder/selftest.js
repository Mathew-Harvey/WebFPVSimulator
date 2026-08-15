/*
 * selftest.js: the track builder's own checks, runnable without a browser.
 *
 *   node src/trackbuilder/selftest.js          run every check
 *   node src/trackbuilder/selftest.js --emit   print the worked example JSON
 *
 * WHY THIS EXISTS. The interesting half of this tool is the document, the
 * face rule and the racing line, and all three are pure functions of pure
 * data. They can therefore be checked in Node, in a second, with no DOM, no
 * canvas and no WebGL, and a check that runs in a second gets run. The DOM
 * half is left to the eye, which is the right split.
 *
 * This is NOT part of `npm run verify`. That harness belongs to the flight
 * model and the task's isolation rule forbids touching it, so this file
 * stands alone and is run by hand.
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
  createTrack, createElement, deserialize, elementById, normalize,
  roundTripsCleanly, serialize, aperturesOf,
} from './model.js';
import { applyAutoFaces, flipFace } from './faces.js';
import { addToSequence, addNextLevel, sequenceLabel, faceLabel } from './sequence.js';
import { applyFigure, matchingFigure, defaultFigure, upgradeStackedFigures } from './figures.js';
import { buildPath, elevationProfile, sequencedElementCount } from './path.js';
import { collectWarnings } from './warnings.js';
import { History } from './history.js';
import { RAD, DEG } from './geometry.js';
import { ELEMENTS, PALETTE_ORDER, GATE_FLAG_H, flagSideOf, flagSideSigns, elementByKey, elementHeight } from './elements.js';
import { startBlockDims, startBlockHeight, startBlockLaneOffset } from '../art/startblock.js';
import { courseFromDocument } from '../game/trackdoc.js';
import { guideFromKnots, knotsFromPath, tessellateGuide } from '../game/guide.js';
import { GATE_SCALE } from '../game/track.js';
import { Race } from '../game/race.js';
import { inspectCourse, layoutFingerprint, suggestRemixName } from '../share/listing.js';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}

function place(doc, type, x, y, opts = {}) {
  const el = createElement(doc, type, { x, y, z: opts.z ?? 0 }, opts.yaw ?? 0);
  if (opts.pitch != null) {
    el.pitch = opts.pitch;
  }
  if (opts.dims) {
    Object.assign(el.dims, opts.dims);
  }
  if (opts.name) {
    el.name = opts.name;
  }
  if (opts.text) {
    el.text = opts.text;
  }
  doc.elements.push(el);
  return el;
}

/*
 * The worked example, and the track schema.md documents field by field.
 *
 * It is deliberately the awkward case the task names: ten sequenced entries
 * including a ladder flown at two different levels with two different faces,
 * a dive gate flown downward, and a flag turn, plus a barrier the line has to
 * miss, a label, and start pads that close the lap.
 */
export function demoTrack() {
  const doc = createTrack('Ladder Loop, demo');
  doc.id = 'trk-demo0001';
  doc.createdUtc = '2026-01-01T00:00:00Z';
  doc.modifiedUtc = '2026-01-01T00:00:00Z';

  /*
   * THE SHAPE IS A FIGURE OF EIGHT AND THAT IS NOT DECORATION.
   *
   * A ladder flown twice IN OPPOSITE DIRECTIONS means the lap has to come
   * back through the same point heading roughly the other way, and the only
   * closed curve that does that without a hairpin is a figure of eight whose
   * crossing is the ladder. The ten positions below are read off a
   * lemniscate centred on the ladder, which is what puts every element on a
   * smooth curve with its neighbours either side of it: the auto face rule
   * takes each element's heading from the straight line between its
   * neighbours, so an element sitting at a hairpin apex, with both
   * neighbours off to one side, is the one case that rule cannot get right.
   * Laying the course on a smooth loop is what makes the whole track derive
   * itself with one manual override.
   *
   * That override is the ladder's own heading. Every other element is
   * derived; the ladder cannot be, because the auto rule refuses to rotate a
   * structure that is flown more than once, and the heading it inherited
   * from the first pass left the second pass 67 degrees off square. Setting
   * it to the bisector of the two passes is a course designer's judgement
   * and the document records it as one.
   */
  const pads = place(doc, 'startPads', 16.5, 13.5, { yaw: Math.PI, name: 'Grid' });

  const cone = place(doc, 'cone', 7.5, 14, { name: 'West marker' });
  const g1 = place(doc, 'gate', 7.5, 26);
  const g2 = place(doc, 'gate', 21.5, 26.5);
  const ladder = place(doc, 'ladder', 31, 20, { name: 'The ladder' });
  const g3 = place(doc, 'gate', 40.5, 13.5);
  const flag = place(doc, 'flag', 54.5, 14, { name: 'Turn flag' });
  const tower = place(doc, 'tower', 54.5, 26);
  /* Tilted rather than flat. MultiGP describes the dive gate as having a
   * "slight angle for entry facilitation" without dimensioning it, and a
   * fully horizontal aperture between two knots at the same height gives the
   * line a vertical tangent and a hook the curvature warning rightly
   * complains about. 55 degrees is a dive gate you can actually fly. */
  const dive = place(doc, 'diveGate', 40.5, 26.5, { pitch: 55 * RAD });
  const g4 = place(doc, 'gate', 21.5, 13.5, { name: 'Finish approach' });

  place(doc, 'barrier', 31, 33, { yaw: 0, dims: { width: 8, depth: 1, height: 2 }, name: 'Pit fence' });
  place(doc, 'label', 31, 30, { text: 'Ladder low, then high' });

  /*
   * The flying order. The ladder's SECOND pass is inserted at position 8,
   * after the dive gate, so the lap crosses the ladder eastbound on its
   * bottom level early and westbound on a higher level late. That is the
   * case the aperture model exists for: one structure on the field, two
   * entries in the flying order, two levels, two opposite faces.
   */
  for (const el of [cone, g1, g2, ladder, g3, flag, tower, dive]) {
    addToSequence(doc, el.id, 0);
  }
  addNextLevel(doc, ladder.id);
  addToSequence(doc, g4.id, 0);

  applyAutoFaces(doc);
  /* The one manual decision, explained above. */
  ladder.yaw = 0;
  ladder.yawOverridden = true;
  applyAutoFaces(doc);
  return doc;
}

function suiteRoundTrip() {
  console.log('\nround trip');
  const empty = createTrack();
  check('an empty track round trips byte for byte', roundTripsCleanly(empty));

  const doc = demoTrack();
  check('the demo track round trips byte for byte', roundTripsCleanly(doc));

  const text = serialize(doc);
  const back = deserialize(text);
  check('reload preserves the element count', back.doc.elements.length === doc.elements.length,
    `${back.doc.elements.length} vs ${doc.elements.length}`);
  check('reload preserves the sequence length', back.doc.sequence.length === doc.sequence.length);
  check('reload reports no repairs', back.repairs.length === 0, back.repairs.join('; '));
  check('reload produces identical JSON', serialize(back.doc) === text);

  const junk = deserialize('{ not json');
  check('junk yields an error and a usable empty track', Boolean(junk.error) && junk.doc.elements.length === 0);

  const hostile = normalize({
    schemaVersion: 1,
    elements: [
      { id: 'a', type: 'gate', position: { x: 1, y: 2 } },
      { id: 'a', type: 'gate', position: { x: 3, y: 4 } },
      { id: 'b', type: 'nonsense' },
      { id: 'c', type: 'startPads', position: { x: 0, y: 0 } },
      { id: 'd', type: 'startPads', position: { x: 5, y: 5 } },
    ],
    sequence: [
      { id: 's1', elementId: 'a', apertureIndex: 9, entry: 7 },
      { id: 's2', elementId: 'ghost' },
    ],
  });
  check('a duplicate element id is renamed rather than dropped', hostile.doc.elements.length === 3,
    `${hostile.doc.elements.length} elements`);
  check('an unknown element type is dropped', !hostile.doc.elements.some((e) => e.type === 'nonsense'));
  check('a second set of start pads is dropped', hostile.doc.elements.filter((e) => e.type === 'startPads').length === 1);
  check('an out of range aperture index is clamped', hostile.doc.sequence[0].apertureIndex === 0);
  check('an entry sign is normalised to +1 or -1', hostile.doc.sequence[0].entry === 1);
  check('a sequence entry pointing at nothing is dropped', hostile.doc.sequence.length === 1);
  check('the repairs are reported', hostile.repairs.length >= 4, `${hostile.repairs.length} repairs`);
}

function suiteFaces() {
  console.log('\nfaces and pass sides');

  /* Three gates in a line heading east. The middle one should end up facing
   * east with entry +1, without anybody touching it. */
  const doc = createTrack();
  const a = place(doc, 'gate', 0, 0);
  const b = place(doc, 'gate', 10, 0);
  const c = place(doc, 'gate', 20, 0);
  for (const el of [a, b, c]) {
    addToSequence(doc, el.id, 0);
  }
  check('a gate auto orients along the course', Math.abs(elementById(doc, b.id).yaw) < 1e-9,
    `yaw ${(elementById(doc, b.id).yaw * DEG).toFixed(1)} deg`);
  check('its entry sign is forward', doc.sequence[1].entry === 1);

  /* Move the far gate north. The middle gate should follow the new line. */
  elementById(doc, c.id).position.y = 10;
  applyAutoFaces(doc);
  const expected = Math.atan2(10 - 0, 20 - 0);
  check('it re-derives when a neighbour moves', Math.abs(elementById(doc, b.id).yaw - expected) < 1e-9,
    `${(elementById(doc, b.id).yaw * DEG).toFixed(2)} vs ${(expected * DEG).toFixed(2)} deg`);

  /* Flip it by hand, then move the neighbour again: the override must hold. */
  flipFace(doc, doc.sequence[1].id);
  const held = doc.sequence[1].entry;
  elementById(doc, c.id).position.y = -10;
  applyAutoFaces(doc);
  check('a hand set face survives a neighbour moving', doc.sequence[1].entry === held,
    `entry ${doc.sequence[1].entry}, expected ${held}`);
  check('the override is marked', doc.sequence[1].overridden === true);

  /* A ladder flown twice must not be rotated by the auto rule, because the
   * two passes want different headings and only one of them could win. */
  const two = createTrack();
  const g0 = place(two, 'gate', 0, 0);
  const lad = place(two, 'ladder', 10, 0, { yaw: 0.4 });
  const g9 = place(two, 'gate', 20, 0);
  addToSequence(two, g0.id, 0);
  addToSequence(two, lad.id, 0);
  addToSequence(two, g9.id, 0);
  addNextLevel(two, lad.id);
  /* While it was referenced once the auto rule was entitled to point it
   * along the course, and did. From the moment it is referenced twice it
   * must stop, because rotating it for one pass would break the other. */
  const yawAfter = elementById(two, lad.id).yaw;
  elementById(two, g9.id).position.y = 30;
  applyAutoFaces(two);
  check('a structure flown twice stops being rotated by the auto rule',
    Math.abs(elementById(two, lad.id).yaw - yawAfter) < 1e-12,
    `${(elementById(two, lad.id).yaw * DEG).toFixed(2)} vs ${(yawAfter * DEG).toFixed(2)} deg`);
  const refs = two.sequence.filter((s) => s.elementId === lad.id);
  check('it holds two sequence entries', refs.length === 2);
  check('on two different levels', refs[0].apertureIndex !== refs[1].apertureIndex,
    `${refs[0].apertureIndex} and ${refs[1].apertureIndex}`);
  check('and each entry carries its own face', refs.every((r) => r.entry === 1 || r.entry === -1));

  /* A left turn round a flag puts the quad on the flag's right. */
  const turn = createTrack();
  const t0 = place(turn, 'gate', 0, 0);
  const fl = place(turn, 'flag', 10, 0);
  const t1 = place(turn, 'gate', 10, 10);
  addToSequence(turn, t0.id, 0);
  addToSequence(turn, fl.id, 0);
  addToSequence(turn, t1.id, 0);
  check('a left turn passes the flag on its right', turn.sequence[1].passSide === 'right',
    turn.sequence[1].passSide);

  const turnR = createTrack();
  const r0 = place(turnR, 'gate', 0, 0);
  const fr = place(turnR, 'flag', 10, 0);
  const r1 = place(turnR, 'gate', 10, -10);
  addToSequence(turnR, r0.id, 0);
  addToSequence(turnR, fr.id, 0);
  addToSequence(turnR, r1.id, 0);
  check('a right turn passes the flag on its left', turnR.sequence[1].passSide === 'left',
    turnR.sequence[1].passSide);

  /* A dive gate between a high gate and a low one is flown downward. */
  const dv = createTrack();
  const high = place(dv, 'tower', 0, 0);
  const gate = place(dv, 'diveGate', 10, 0);
  const low = place(dv, 'gate', 20, 0);
  addToSequence(dv, high.id, 0);
  addToSequence(dv, gate.id, 0);
  addToSequence(dv, low.id, 0);
  const diveSeq = dv.sequence[1];
  /* 1e-5, not 1e-9: the document rounds every number to six decimal places
   * on the way in, which is a third of a microradian on the tilt and a
   * micrometre on a length, and is what makes the JSON round trip exact. */
  check('a dive gate defaults to a horizontal aperture',
    Math.abs(elementById(dv, gate.id).pitch - Math.PI / 2) < 1e-5,
    `${(elementById(dv, gate.id).pitch * DEG).toFixed(4)} deg`);
  check('and is flown downward through', diveSeq.entry === -1, `entry ${diveSeq.entry}`);
  check('which the inspector calls entering from above', faceLabel(dv, diveSeq) === 'enter from above',
    faceLabel(dv, diveSeq));
}

function suitePath() {
  console.log('\nracing line');
  const doc = demoTrack();
  const path = buildPath(doc);

  check('every sequence entry produced a knot, plus start and finish',
    path.knots.length === doc.sequence.length + 2,
    `${path.knots.length} knots for ${doc.sequence.length} entries`);
  check('the lap closes at the start pads', path.closed === true);
  check('the line has a sensible length', path.length > 80 && path.length < 400,
    `${path.length.toFixed(1)} m`);
  check('every sample carries an arc length that only grows',
    path.samples.every((s, i) => i === 0 || s.s >= path.samples[i - 1].s));
  check('no sample is NaN',
    path.samples.every((s) => Number.isFinite(s.pos.x) && Number.isFinite(s.pos.y) && Number.isFinite(s.pos.z)));
  check('curvature is finite or a straight',
    path.samples.every((s) => s.radius > 0));

  /* Every aperture tangent points the way the quad is going, which is the
   * property the whole face model exists to guarantee. */
  const forward = path.knots.filter((k) => k.role === 'aperture').every((k, i, arr) => {
    const at = path.knots.indexOf(k);
    const next = path.knots[at + 1];
    if (!next) {
      return true;
    }
    const dx = next.pos.x - k.pos.x;
    const dy = next.pos.y - k.pos.y;
    const dz = next.pos.z - k.pos.z;
    return (k.tangent.x * dx + k.tangent.y * dy + k.tangent.z * dz) > 0;
  });
  check('every aperture is flown towards the next knot, not away from it', forward);

  const startKnot = path.knots[0];
  const endKnot = path.knots[path.knots.length - 1];
  check('the line ends where it started', Math.hypot(endKnot.pos.x - startKnot.pos.x, endKnot.pos.y - startKnot.pos.y) < 1e-9);

  const profile = elevationProfile(path);
  check('the elevation profile spans the whole lap',
    Math.abs(profile.points[profile.points.length - 1].s - path.length) < 1e-6,
    `${profile.points[profile.points.length - 1].s.toFixed(2)} vs ${path.length.toFixed(2)}`);
  check('the profile climbs to the dive gate', profile.maxZ > 3, `${profile.maxZ.toFixed(2)} m`);
  check('the sequenced element count is under the entry count, because of the ladder',
    sequencedElementCount(doc) === doc.sequence.length - 1,
    `${sequencedElementCount(doc)} elements for ${doc.sequence.length} entries`);

  /* The tangent scale is one constant and it has to actually do something. */
  const tight = { ...doc, settings: { ...doc.settings, tangentScale: 0.05 } };
  const loose = { ...doc, settings: { ...doc.settings, tangentScale: 0.9 } };
  const a = buildPath(tight).length;
  const b = buildPath(loose).length;
  check('a bigger tangent scale makes a longer line', b > a, `${a.toFixed(1)} m vs ${b.toFixed(1)} m`);

  const none = buildPath(createTrack());
  check('an empty track produces an empty line without throwing', none.samples.length === 0 && none.length === 0);

  /*
   * THE CHECK THAT PINS DOWN settings.tangentScale.
   *
   * Gates spaced evenly round a circle have chord-derived headings that are
   * exactly tangent to that circle, so the line through them IS that circle
   * and every sample's radius of curvature has to be the circle's radius. If
   * the tangent length is wrong the curve still passes through every gate
   * and still looks plausible drawn small, and the radius collapses. That is
   * how the first version of this tool shipped a tangent scale a factor of
   * three short, with a Bezier control point offset used as a Hermite
   * tangent, and this number is what gave it away.
   *
   * FIVE gates, not eight, because the exact tangent length that draws a
   * circle depends on how far the line turns between knots:
   *
   *     m / chord = 2 tan(theta/4) / sin(theta/2)
   *
   * That is 1.0 for a straight and 1.333 at 120 degrees, so no single
   * constant is right everywhere and 1.1 is the middle of the range a racing
   * line turns through. Five gates put 72 degrees between knots, where the
   * exact answer is 1.1056, so the drawn circle should come back within a
   * couple of percent. The two INTERIOR segments are measured: the knots at
   * each end of an open line take their heading from one neighbour instead
   * of two, so they are not on the circle's tangent and never were.
   */
  const R = 12;
  const ring = createTrack();
  const onCircle = [];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    onCircle.push(place(ring, 'gate', 30 + R * Math.cos(a), 20 + R * Math.sin(a)));
  }
  for (const el of onCircle) {
    addToSequence(ring, el.id, 0);
  }
  const ringPath = buildPath(ring);
  const interior = ringPath.samples.filter((smp) => smp.segment === 1 || smp.segment === 2);
  const radii = interior.map((smp) => smp.radius).filter((r) => Number.isFinite(r));
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
  check('five gates on a 12 m circle draw a 12 m radius line',
    Math.abs(mean - R) / R < 0.03, `mean radius ${mean.toFixed(2)} m, wanted ${R}`);
  check('and every sample on it stays near that radius',
    Math.min(...radii) > R * 0.95 && Math.max(...radii) < R * 1.05,
    `${Math.min(...radii).toFixed(2)} to ${Math.max(...radii).toFixed(2)} m`);
  const arc = (interior[interior.length - 1].s - interior[0].s);
  const wanted = 2 * (2 * Math.PI * R) / 5;
  check('and its arc length is two fifths of the circumference',
    Math.abs(arc - wanted) / wanted < 0.02, `${arc.toFixed(2)} m, wanted ${wanted.toFixed(2)} m`);
}

function suiteGuide() {
  console.log('\nground marks');

  const empty = guideFromKnots([]);
  check('no knots, no paint', empty.samples.length === 0 && empty.dashes.length === 0);

  /* Left turn: gate, flag, gate. The quad passes on the flag's right, so
   * the painted wrap and the chevron have to sit on that side, not on the
   * inside of the L. */
  const turn = createTrack();
  const t0 = place(turn, 'gate', 0, 0);
  const fl = place(turn, 'flag', 10, 0);
  const t1 = place(turn, 'gate', 10, 10);
  addToSequence(turn, t0.id, 0);
  addToSequence(turn, fl.id, 0);
  addToSequence(turn, t1.id, 0);
  const turnPath = buildPath(turn);
  const turnGuide = guideFromKnots(knotsFromPath(turnPath));
  check('a left turn still produces a line', turnGuide.samples.length > 10, `${turnGuide.samples.length} samples`);
  check('and paints a wrap at the flag', turnGuide.flagArcs.length === 1, `${turnGuide.flagArcs.length} wraps`);
  check('and puts an arrow on the approach to each gate',
    turnGuide.arrows.filter((a) => a.kind === 'gate').length >= 2,
    `${turnGuide.arrows.map((a) => a.kind).join(',')}`);

  const wrap = turnGuide.flagArcs[0];
  const pole = { x: 10, z: 0 };
  if (wrap) {
    const radii = wrap.points.map((p) => Math.hypot(p.x - pole.x, p.z - pole.z));
    const meanR = radii.reduce((a, b) => a + b, 0) / radii.length;
    check('the wrap sits on the clearance circle',
      Math.abs(meanR - 1.5) < 0.08, `mean ${meanR.toFixed(3)} m`);
    /* Pass side is right: knot is south-east of the flag. The chevron
     * must be on that half, not north of the pole on the inside. */
    check('the chevron is on the fly side, not the inside of the turn',
      wrap.chevron.z < pole.z - 0.4,
      `chevron z ${wrap.chevron.z.toFixed(2)}, pole ${pole.z}`);
    const wrong = wrap.points.filter((p) => (p.x - pole.x) * (wrap.chevron.x - pole.x)
      + (p.z - pole.z) * (wrap.chevron.z - pole.z) < 0).length;
    check('the painted comma does not go the wrong side of the flag',
      wrong === 0, `${wrong} of ${wrap.points.length} points on the back side`);
  }

  /* Samples near the flag must stay outside the pole. A line through the
   * flag would be the bug this whole file exists to prevent. */
  const near = turnGuide.samples.filter((s) => Math.hypot(s.x - pole.x, s.z - pole.z) < 4);
  const minR = Math.min(...near.map((s) => Math.hypot(s.x - pole.x, s.z - pole.z)));
  check('the taut string does not run through the flag',
    minR > 1.2, `closest ${minR.toFixed(3)} m`);

  const demo = guideFromKnots(knotsFromPath(buildPath(demoTrack())));
  check('the demo lap has dashes', demo.dashes.length > 8, `${demo.dashes.length} dashes`);
  check('the demo lap has gate arrows',
    demo.arrows.some((a) => a.kind === 'gate'), `${demo.arrows.length} arrows`);
  check('the demo lap wraps its turn flag', demo.flagArcs.length >= 1, `${demo.flagArcs.length} wraps`);
  check('and tessellates into paint triangles',
    tessellateGuide(demo).length >= 60, `${tessellateGuide(demo).length} verts`);

  const course = courseFromDocument(demoTrack());
  check('the course carries a guide in scene metres',
    course.guide && course.guide.samples.length > 10,
    course.guide ? `${course.guide.samples.length} samples` : 'missing');
  check('and at least one flag wrap survived the frame conversion',
    course.guide && course.guide.flagArcs.length >= 1,
    course.guide ? `${course.guide.flagArcs.length} wraps` : 'missing');
}

function suiteWarnings() {
  console.log('\nwarnings');

  const doc = demoTrack();
  const clean = collectWarnings(doc, buildPath(doc));
  const codes = (list) => new Set(list.map((w) => w.code));
  check('the demo track has no reversal', !codes(clean).has('reversal'),
    clean.filter((w) => w.code === 'reversal').map((w) => w.message).join(' | '));
  check('the demo track stays inside the field', !codes(clean).has('out-of-field'));
  check('the demo track misses its barrier', !codes(clean).has('barrier'),
    clean.filter((w) => w.code === 'barrier').map((w) => w.message).join(' | '));
  /* The worked example in schema.md is the tool's own claim that a course
   * can be built and come out clean, so it has to actually be clean. */
  check('the demo track raises no warnings at all',
    clean.filter((w) => w.level === 'warn').length === 0,
    clean.filter((w) => w.level === 'warn').map((w) => `${w.code}: ${w.message}`).join(' | '));

  /* Force each of the five the task asks for. */
  const noFace = demoTrack();
  noFace.sequence[2].entry = 0;
  noFace.sequence[2].overridden = true;
  check('an unset face warns', codes(collectWarnings(noFace, buildPath(noFace))).has('no-face'));

  const rev = demoTrack();
  const revGate = rev.sequence.find((s) => elementById(rev, s.elementId).type === 'gate');
  flipFace(rev, revGate.id);
  check('a reversed face warns', codes(collectWarnings(rev, buildPath(rev))).has('reversal'));

  /*
   * The other half of that decision, stated as a check so nobody quietly
   * makes the reversal test three dimensional again. A FLAT dive gate is
   * flown straight up or straight down, its tangent has no horizontal part
   * at all, and which way up it is flown is a different course rather than a
   * broken one. The demo track's dive gate is tilted, so this needs its own
   * fixture with the aperture left horizontal.
   */
  const flat = createTrack();
  const high = place(flat, 'tower', 0, 0);
  const flatDive = place(flat, 'diveGate', 12, 0);
  const low = place(flat, 'gate', 24, 0);
  for (const el of [high, flatDive, low]) {
    addToSequence(flat, el.id, 0);
  }
  const flatSeq = flat.sequence[1];
  check('a flat dive gate keeps a horizontal aperture', Math.abs(flatDive.pitch - Math.PI / 2) < 1e-5);
  flipFace(flat, flatSeq.id);
  check('flipping a flat dive gate is not called a reversal',
    !codes(collectWarnings(flat, buildPath(flat))).has('reversal'),
    collectWarnings(flat, buildPath(flat)).filter((w) => w.code === 'reversal').map((w) => w.message).join(' | '));

  const tightDoc = demoTrack();
  tightDoc.settings.minCurveRadius = 500;
  check('a tight corner warns', codes(collectWarnings(tightDoc, buildPath(tightDoc))).has('tight-corner'));

  const bar = demoTrack();
  const fence = bar.elements.find((e) => e.type === 'barrier');
  const firstGate = bar.elements.find((e) => e.type === 'gate');
  fence.position.x = firstGate.position.x;
  fence.position.y = firstGate.position.y;
  fence.dims.height = 6;
  check('a barrier on the line warns', codes(collectWarnings(bar, buildPath(bar))).has('barrier'));

  const wallDoc = createTrack();
  const wall = place(wallDoc, 'barrier', 10, 10, { yaw: 0.4 });
  const wallCourse = courseFromDocument(wallDoc);
  const wallSt = wallCourse.structures.find((s) => s.type === 'barrier');
  check('a wall in the world faces the same way as in the builder',
    wallSt && Math.abs(wallSt.yaw - wall.yaw) < 1e-9,
    wallSt ? `${wallSt.yaw}` : 'missing');
  const gateDoc = createTrack();
  place(gateDoc, 'gate', 10, 10, { yaw: 0 });
  const gateSt = courseFromDocument(gateDoc).structures.find((s) => s.type === 'gate');
  check('a gate still gets the quarter turn its plane needs',
    gateSt && Math.abs(gateSt.yaw - Math.PI / 2) < 1e-9,
    gateSt ? `${gateSt.yaw}` : 'missing');

  const out = demoTrack();
  out.field.width = 20;
  out.field.depth = 20;
  check('a line leaving the field warns', codes(collectWarnings(out, buildPath(out))).has('out-of-field'));

  const orphan = demoTrack();
  place(orphan, 'gate', 5, 5);
  check('an element left out of the order warns', codes(collectWarnings(orphan, buildPath(orphan))).has('unsequenced'));

  const noStart = createTrack();
  const g = place(noStart, 'gate', 5, 5);
  addToSequence(noStart, g.id, 0);
  check('a track with no start pads says the lap does not close',
    codes(collectWarnings(noStart, buildPath(noStart))).has('no-start'));
  check('warnings never throw on an empty track', collectWarnings(createTrack(), null).length >= 1);
}

function suiteHistory() {
  console.log('\nundo and redo');
  const h = new History();
  let doc = createTrack();
  const before = JSON.stringify(doc);

  h.begin(doc, 'place');
  place(doc, 'gate', 1, 1);
  check('a real change records a step', h.commit(doc) === true);
  check('undo restores the earlier document', JSON.stringify(h.undo(doc)) === before);

  doc = createTrack();
  h.reset();
  h.begin(doc, 'nothing');
  check('a gesture that changed nothing records nothing', h.commit(doc) === false);
  check('and leaves nothing to undo', h.canUndo() === false);

  const h2 = new History();
  let d2 = createTrack();
  h2.begin(d2, 'one');
  place(d2, 'gate', 2, 2);
  h2.commit(d2);
  const withGate = JSON.stringify(d2);
  d2 = h2.undo(d2);
  check('undo removes the gate', d2.elements.length === 0);
  d2 = h2.redo(d2);
  check('redo puts it back exactly', JSON.stringify(d2) === withGate);
}

function suiteSequenceNaming() {
  console.log('\nnaming');
  const doc = demoTrack();
  const ladderSeqs = doc.sequence.filter((s) => {
    const el = elementById(doc, s.elementId);
    return el && el.type === 'ladder';
  });
  check('a ladder entry names its level', /bottom|middle|top/.test(sequenceLabel(doc, ladderSeqs[0])),
    sequenceLabel(doc, ladderSeqs[0]));
  check('a ladder has three openings', aperturesOf(elementById(doc, ladderSeqs[0].elementId)).length === 3);
  const flagSeq = doc.sequence.find((s) => elementById(doc, s.elementId).type === 'flag');
  check('a marker names its pass side in prose', /pass on the (left|right)/.test(faceLabel(doc, flagSeq)),
    faceLabel(doc, flagSeq));
}

function suiteFigures() {
  console.log('\nstacked figures');
  const dbl = createTrack();
  const g0 = place(dbl, 'gate', 0, 0);
  const stack = place(dbl, 'doubleStack', 10, 0);
  const g1 = place(dbl, 'gate', 20, 0);
  addToSequence(dbl, g0.id, 0);
  addToSequence(dbl, stack.id, 0);
  addToSequence(dbl, g1.id, 0);
  check('a double stack has two openings', aperturesOf(stack).length === 2);
  check('placing it sequences one opening', dbl.sequence.filter((s) => s.elementId === stack.id).length === 1);
  check('a new stack wants a spiral up', defaultFigure(stack) === 'spiralUp');

  applyFigure(dbl, stack.id, 'spiralUp');
  const spiral = dbl.sequence.filter((s) => s.elementId === stack.id);
  const seqIds = dbl.sequence.map((s) => s.id);
  check('spiral up writes two passes', spiral.length === 2);
  check('figure passes keep unique sequence ids', new Set(seqIds).size === seqIds.length, seqIds.join(','));
  check('bottom then top', spiral[0].apertureIndex === 0 && spiral[1].apertureIndex === 1,
    `${spiral[0].apertureIndex} then ${spiral[1].apertureIndex}`);
  check('faces stay the same', spiral[0].entry === spiral[1].entry,
    `${spiral[0].entry} and ${spiral[1].entry}`);
  check('the figure is detected as spiral up', matchingFigure(dbl, stack) === 'spiralUp',
    matchingFigure(dbl, stack));
  check('the two passes stay consecutive in the order',
    dbl.sequence[1].elementId === stack.id && dbl.sequence[2].elementId === stack.id);

  spiral[1].entry = -spiral[0].entry;
  check('an old alternating spiral is not the current figure', matchingFigure(dbl, stack) !== 'spiralUp');
  check('upgrading it restores the same face', upgradeStackedFigures(dbl) === true);
  check('and it is a spiral up again', matchingFigure(dbl, stack) === 'spiralUp');
  check('and both holes share a face', spiral[0].entry === spiral[1].entry);

  const path = buildPath(dbl);
  const wraps = path.knots.filter((k) => k.role === 'wrap');
  check('the racing line wraps around the stack', wraps.length === 1, `${wraps.length} wraps`);
  if (wraps.length) {
    const st = stack.position;
    const off = Math.hypot(wraps[0].pos.x - st.x, wraps[0].pos.y - st.y);
    check('the wrap sits off the frame', off > 1.5, `${off.toFixed(2)} m`);
  }

  applyFigure(dbl, stack.id, 'splitS');
  const split = dbl.sequence.filter((s) => s.elementId === stack.id);
  check('split-S is top then bottom', split[0].apertureIndex === 1 && split[1].apertureIndex === 0,
    `${split[0].apertureIndex} then ${split[1].apertureIndex}`);
  check('the figure is detected as split-S', matchingFigure(dbl, stack) === 'splitS',
    matchingFigure(dbl, stack));
  check('the sequence names the figure', /Split-S/.test(sequenceLabel(dbl, split[0])),
    sequenceLabel(dbl, split[0]));

  const course = courseFromDocument(dbl);
  const stacked = course.stations.filter((s) => s.type === 'doubleStack');
  check('the course scores two stacked stations', stacked.length === 2, `${stacked.length}`);
  check('the first station cues the top of the split-S', stacked[0]?.cue === 'Split-S, top',
    stacked[0]?.cue);
  check('the second station cues the bottom', stacked[1]?.cue === 'Split-S, bottom',
    stacked[1]?.cue);
  check('the course carries one figure ribbon', course.figures.length === 1, `${course.figures.length}`);
  check('the ribbon goes opening, wrap, opening', course.figures[0]?.points.length === 3,
    `${course.figures[0]?.points.length}`);
  check('the structure is built as two openings', stacked[0].structure.dims.stack === 2,
    `${stacked[0].structure.dims.stack}`);

  const raceGates = course.stations.map((st, i) => ({
    position: { x: st.x, y: 0, z: st.z },
    heading: st.yaw,
    pitch: st.pitch ?? 0,
    flyOrder: i,
    elementId: st.elementId,
    apertureIndex: st.apertureIndex,
    apertures: [{ centreY: st.centreY, clearW: st.clearW, clearH: st.clearH }],
    aperture: { centreY: st.centreY, clearW: st.clearW, clearH: st.clearH },
  }));
  const race = new Race(raceGates);
  check('the race has two stacked stations', race.gates.filter((g) => g.elementId === stack.id).length === 2);
  check('each stacked station scores one opening',
    race.gates.filter((g) => g.elementId === stack.id).every((g) => g.apertures.length === 1));

  function flyThrough(g, toward = 1) {
    const ap = g.apertures[0];
    const cy = g.y + ap.centreY;
    const s = toward >= 0 ? 1 : -1;
    return {
      prev: { x: g.x - g.az.x * 2 * s, y: cy - g.az.y * 2 * s, z: g.z - g.az.z * 2 * s },
      curr: { x: g.x + g.az.x * 2 * s, y: cy + g.az.y * 2 * s, z: g.z + g.az.z * 2 * s },
    };
  }

  let seg = flyThrough(race.gates[0]);
  race.update(seg.prev, seg.curr, 10, 10);
  check('the lead-in leaves the first stacked hole next', race.next === 1, `next ${race.next}`);
  seg = flyThrough(race.gates[1]);
  race.update(seg.prev, seg.curr, 20, 20);
  check('one hole of the stack is one gate', race.next === 2, `next ${race.next}`);
  seg = flyThrough(race.gates[2]);
  race.update(seg.prev, seg.curr, 30, 30);
  check('the second hole is its own gate', race.next === 3, `next ${race.next}`);

  const miss = new Race(raceGates);
  seg = flyThrough(miss.gates[0]);
  miss.update(seg.prev, seg.curr, 10, 10);
  seg = flyThrough(miss.gates[2]);
  miss.update(seg.prev, seg.curr, 20, 20);
  check('the wrong hole of the stack does not void the lap',
    !(miss.flash && /void/i.test(miss.flash.text)));
  check('and does not count as the hole that was next', miss.next === 1, `next ${miss.next}`);

  /*
   * This used to assert the opposite, that a different gate flown out of
   * order voids the lap, which was MultiGP's rule. The owner overruled it:
   * an incidental crossing costs nothing. See the note in race.js update().
   * The second half is what makes it safe: nothing is gained either, because
   * the order still has to be flown and the pass advances nothing.
   */
  const skip = new Race(raceGates);
  seg = flyThrough(skip.gates[0]);
  skip.update(seg.prev, seg.curr, 10, 10);
  const wasNext = skip.next;
  seg = flyThrough(skip.gates[3]);
  skip.update(seg.prev, seg.curr, 20, 20);
  check('a different gate out of order costs nothing',
    !(skip.flash && /void/i.test(skip.flash.text)));
  check('and does not advance the order', skip.next === wasNext, `next ${skip.next}`);

  const tri = createTrack();
  const t = place(tri, 'ladder', 0, 0);
  addToSequence(tri, t.id, 0);
  applyFigure(tri, t.id, 'spiralDown');
  const down = tri.sequence.filter((s) => s.elementId === t.id);
  check('spiral down on a triple is three passes', down.length === 3);
  check('top then middle then bottom',
    down[0].apertureIndex === 2 && down[1].apertureIndex === 1 && down[2].apertureIndex === 0,
    down.map((s) => s.apertureIndex).join(','));
  check('the figure is detected as spiral down', matchingFigure(tri, t) === 'spiralDown',
    matchingFigure(tri, t));
  check('spiral down alternates faces', down[0].entry === -down[1].entry && down[1].entry === -down[2].entry,
    down.map((s) => s.entry).join(','));

  applyFigure(tri, t.id, 'splitS');
  const leap = tri.sequence.filter((s) => s.elementId === t.id);
  check('split-S on a triple skips the middle', leap.length === 2 && leap[0].apertureIndex === 2 && leap[1].apertureIndex === 0,
    leap.map((s) => s.apertureIndex).join(','));

  const skipped = createTrack();
  const a = place(skipped, 'gate', 0, 0);
  const lad = place(skipped, 'ladder', 10, 0);
  const b = place(skipped, 'gate', 20, 0);
  addToSequence(skipped, a.id, 0);
  addToSequence(skipped, lad.id, 0);
  addToSequence(skipped, b.id, 0);
  addNextLevel(skipped, lad.id);
  /* Second ladder pass is at the end, not consecutive with the first. */
  const between = buildPath(skipped);
  check('a stack flown twice with a gate between does not wrap',
    between.knots.filter((k) => k.role === 'wrap').length === 0,
    `${between.knots.filter((k) => k.role === 'wrap').length} wraps`);
}

function suiteFlaggedGate() {
  console.log('\nflagged gate');
  const doc = createTrack();
  const g = place(doc, 'flaggedGate', 10, 10);
  check('a new flagged gate defaults to left', g.flagSide === 'left');
  check('left is the minus width-axis end', flagSideSigns(flagSideOf(g)).join(',') === '-1');
  check('it is one opening, same as a gate', aperturesOf(g).length === 1);
  check('its dims match a standard gate',
    g.dims.clearW === ELEMENTS.gate.dims.clearW && g.dims.clearH === ELEMENTS.gate.dims.clearH);
  const gateH = elementHeight(ELEMENTS.gate, ELEMENTS.gate.dims);
  const flaggedH = elementHeight(ELEMENTS.flaggedGate, g.dims);
  check('its height includes the header mast', Math.abs(flaggedH - (gateH + GATE_FLAG_H)) < 1e-9,
    `${flaggedH} vs ${gateH} + ${GATE_FLAG_H}`);
  check('A arms it', elementByKey('A')?.id === 'flaggedGate');
  check('it sits next to Gate in the palette', PALETTE_ORDER[0] === 'gate' && PALETTE_ORDER[1] === 'flaggedGate');

  g.flagSide = 'both';
  check('both is both ends', flagSideSigns(flagSideOf(g)).join(',') === '-1,1');
  const back = deserialize(serialize(doc));
  const g2 = back.doc.elements.find((e) => e.type === 'flaggedGate');
  check('both round trips', g2?.flagSide === 'both');
  check('the demo track is not carrying one', !serialize(demoTrack()).includes('flaggedGate'));

  const plainDoc = createTrack();
  place(plainDoc, 'gate', 0, 0);
  check('a plain gate does not write flagSide', !serialize(plainDoc).includes('flagSide'));

  const repaired = normalize({
    schemaVersion: 1,
    elements: [{ id: 'el-1', type: 'flaggedGate', position: { x: 0, y: 0 }, flagSide: 'up' }],
  });
  check('an unknown side becomes left', repaired.doc.elements[0].flagSide === 'left');

  addToSequence(doc, g.id, 0);
  const course = courseFromDocument(doc);
  const st = course.structures.find((s) => s.type === 'flaggedGate');
  check('the field gets both signs', st && st.flagSigns.join(',') === '-1,1',
    st ? st.flagSigns.join(',') : 'missing');
  check('and the mast height is scaled', st && Math.abs(st.flagH - GATE_FLAG_H * GATE_SCALE) < 1e-9,
    st ? String(st.flagH) : 'missing');
}

function suiteFlaggedDoubleStack() {
  console.log('\nflagged double stack');
  const doc = createTrack();
  const g = place(doc, 'flaggedDoubleStack', 10, 10);
  check('a new flagged double defaults to left', g.flagSide === 'left');
  check('left is the minus width-axis end', flagSideSigns(flagSideOf(g)).join(',') === '-1');
  check('it has two openings, same as a double stack', aperturesOf(g).length === 2);
  check('its dims match a double stack',
    g.dims.clearW === ELEMENTS.doubleStack.dims.clearW
    && g.dims.clearH === ELEMENTS.doubleStack.dims.clearH
    && g.dims.levels === ELEMENTS.doubleStack.dims.levels);
  const stackH = elementHeight(ELEMENTS.doubleStack, ELEMENTS.doubleStack.dims);
  const flaggedH = elementHeight(ELEMENTS.flaggedDoubleStack, g.dims);
  check('its height includes the header mast', Math.abs(flaggedH - (stackH + GATE_FLAG_H)) < 1e-9,
    `${flaggedH} vs ${stackH} + ${GATE_FLAG_H}`);
  check('H arms it', elementByKey('H')?.id === 'flaggedDoubleStack');
  check('it sits next to Double stack in the palette',
    PALETTE_ORDER[2] === 'doubleStack' && PALETTE_ORDER[3] === 'flaggedDoubleStack');
  check('a new one wants a spiral up', defaultFigure(g) === 'spiralUp');

  g.flagSide = 'right';
  check('right is the plus width-axis end', flagSideSigns(flagSideOf(g)).join(',') === '1');
  g.flagSide = 'both';
  check('both is both ends', flagSideSigns(flagSideOf(g)).join(',') === '-1,1');
  const back = deserialize(serialize(doc));
  const g2 = back.doc.elements.find((e) => e.type === 'flaggedDoubleStack');
  check('both round trips', g2?.flagSide === 'both');
  check('the demo track is not carrying one', !serialize(demoTrack()).includes('flaggedDoubleStack'));

  const plainDoc = createTrack();
  place(plainDoc, 'doubleStack', 0, 0);
  check('a plain double stack does not write flagSide', !serialize(plainDoc).includes('flagSide'));

  const repaired = normalize({
    schemaVersion: 1,
    elements: [{ id: 'el-1', type: 'flaggedDoubleStack', position: { x: 0, y: 0 }, flagSide: 'up' }],
  });
  check('an unknown side becomes left', repaired.doc.elements[0].flagSide === 'left');

  addToSequence(doc, g.id, 0);
  applyFigure(doc, g.id, 'spiralUp');
  const course = courseFromDocument(doc);
  const st = course.structures.find((s) => s.type === 'flaggedDoubleStack');
  check('the field gets both signs', st && st.flagSigns.join(',') === '-1,1',
    st ? st.flagSigns.join(',') : 'missing');
  check('and the mast height is scaled', st && Math.abs(st.flagH - GATE_FLAG_H * GATE_SCALE) < 1e-9,
    st ? String(st.flagH) : 'missing');
  check('the structure is built as two openings', st && st.dims.stack === 2,
    st ? String(st.dims.stack) : 'missing');
  const stacked = course.stations.filter((s) => s.type === 'flaggedDoubleStack');
  check('the course scores two stacked stations', stacked.length === 2, `${stacked.length}`);
}

/*
 * schema.md's worked example is copied out of this file's --emit output. A
 * schema document whose example does not parse, or does not describe the
 * track it claims to, is worse than no example at all, so the two are checked
 * against each other rather than trusted to stay in step.
 */
function suiteSchemaDoc() {
  console.log('\nschema.md');
  const here = dirname(fileURLToPath(import.meta.url));
  let md = '';
  try {
    md = readFileSync(join(here, 'schema.md'), 'utf8');
  } catch (e) {
    check('schema.md is readable', false, e.message);
    return;
  }
  const blocks = [...md.matchAll(/```json\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
  check('schema.md carries exactly one worked example', blocks.length === 1, `${blocks.length} json blocks`);
  if (blocks.length !== 1) {
    return;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(blocks[0]);
  } catch (e) {
    check('the worked example is valid JSON', false, e.message);
    return;
  }
  check('the worked example is valid JSON', true);
  const { doc, repairs } = normalize(parsed);
  check('the worked example needs no repairs', repairs.length === 0, repairs.join('; '));
  check('the worked example is the track this file emits',
    serialize(doc) === serialize(demoTrack()));

  /* The numbers schema.md quotes in prose. */
  const path = buildPath(doc);
  check('schema.md quotes the right lap length', Math.abs(path.length - 138.9) < 0.05, `${path.length.toFixed(2)} m`);
  check('schema.md quotes the right tightest radius',
    Math.abs(path.tightest.radius - 2.73) < 0.005, `${path.tightest.radius.toFixed(3)} m`);
  check('and the worked example really does raise no warnings',
    collectWarnings(doc, path).filter((w) => w.level === 'warn').length === 0);
}

function suiteListing() {
  console.log('listing');
  const doc = createTrack('Ladder Loop');
  const gate = createElement(doc, 'gate', { x: 10, y: 8, z: 0 });
  doc.elements.push(gate);
  doc.sequence.push({ id: 'sq-1', elementId: gate.id, apertureIndex: 0, entry: 1 });
  const renamed = { ...doc, name: 'Renamed Loop' };
  check('layout fingerprint ignores the title', layoutFingerprint(doc) === layoutFingerprint(renamed));
  check('remix name tags a course', suggestRemixName('Ladder Loop') === 'Ladder Loop remix');
  check('remix name does not double tag', suggestRemixName('Ladder Loop remix') === 'Ladder Loop remix');
  const community = inspectCourse({
    share: { id: doc.id, name: doc.name, author: 'Ada Rook', board: 'http://127.0.0.1:3100', document: doc },
    autosave: null,
    editKeyFor: () => null,
    bindFor: () => null,
  });
  check('a board course you do not own is a community listing', community.kind === 'community' && community.canRemix && community.canPostTime);
  const owned = inspectCourse({
    share: { id: doc.id, name: doc.name, author: 'Ada Rook', board: 'http://127.0.0.1:3100', document: doc },
    autosave: null,
    editKeyFor: (id) => (id === doc.id ? 'key' : null),
    bindFor: () => ({ layoutFingerprint: layoutFingerprint(doc), nameOnBoard: doc.name, owned: true }),
  });
  check('a board course you published is owned', owned.kind === 'owned' && owned.canPostTime && !owned.canRemix);
  const remix = inspectCourse({
    share: null,
    autosave: { doc },
    editKeyFor: () => null,
    bindFor: (id) => (id === doc.id ? { sourceId: 'trk-other', sourceName: 'City Loop', sourceAuthor: 'Bo' } : null),
  });
  check('a copy of someone else is a remix', remix.kind === 'remix' && remix.canPublishNew && !remix.canPostTime && remix.sourceName === 'City Loop');
  const drifted = inspectCourse({
    share: null,
    autosave: { doc: renamed },
    editKeyFor: (id) => (id === renamed.id ? 'key' : null),
    bindFor: () => ({ layoutFingerprint: layoutFingerprint(doc), nameOnBoard: 'Old Name', owned: true }),
  });
  check('an owned rename is name drift, not layout drift', drifted.nameDrift === true && drifted.layoutDrift === false && drifted.canPostTime);
  const authorShift = inspectCourse({
    share: { id: doc.id, name: doc.name, author: 'Ada Rook', board: 'http://127.0.0.1:3100', document: doc },
    autosave: null,
    editKeyFor: (id) => (id === doc.id ? 'key' : null),
    bindFor: () => ({ layoutFingerprint: layoutFingerprint(doc), nameOnBoard: doc.name, owned: true, author: 'Ada Rook' }),
    pilotName: 'Ada Two',
  });
  check('an owned handle change is author drift, not layout drift', authorShift.authorDrift === true && authorShift.layoutDrift === false && authorShift.canUpdateListing === true);
}

function suiteStartBlock() {
  const d = startBlockDims(0.6);
  check('a default stand fits inside its pad cell', d.railLen < 0.6 && d.spanAcross < 0.6,
    `${d.railLen.toFixed(3)} x ${d.spanAcross.toFixed(3)}`);
  check('the rails leave a gap for the battery', d.gap > 0.05 && d.gap < 0.2, String(d.gap));
  check('the ramp is tilted, not a floor tile', d.tilt > 0.3 && d.tilt < 0.7, String(d.tilt));
  const h = startBlockHeight(0.6);
  check('the stand has height a 5 inch can catch', h > 0.15 && h < 0.4, String(h));
  const eh = elementHeight(ELEMENTS.startPads, ELEMENTS.startPads.dims);
  check('elementHeight matches the mesh height', Math.abs(eh - h) < 0.05, `${eh} vs ${h}`);
  const course = courseFromDocument(demoTrack());
  const pads = course.structures.find((s) => s.type === 'startPads');
  const dist = Math.hypot(course.spawn.x - pads.x, course.spawn.z - pads.z);
  const want = Math.abs(startBlockLaneOffset(pads.dims));
  check('the quad parks on a pad, not behind the grid', Math.abs(dist - want) < 0.05,
    `${dist.toFixed(3)} m from the grid, lane ${want.toFixed(3)}`);
  check('the parked pose matches the ramp', course.spawn.pitch > 0.3 && course.spawn.pitch < 0.7,
    String(course.spawn.pitch));
}

/*
 * The waypoint, which is the one element that is not a thing standing on the
 * field. Everything below is a property the import depends on: if a waypoint
 * ever grows a clearance the racing line stops going through the point the
 * author pinned, and if it ever reaches the race field it becomes an
 * obstacle that is not on the real course.
 */
function suiteWaypoint() {
  console.log('\nwaypoint');
  const doc = createTrack();
  const a = place(doc, 'gate', 0, 0);
  const w = place(doc, 'waypoint', 10, 4);
  const b = place(doc, 'gate', 20, 0);
  addToSequence(doc, a.id, 0);
  addToSequence(doc, w.id, 0);
  addToSequence(doc, b.id, 0);

  check('W arms it', elementByKey('W')?.id === 'waypoint');
  check('it is a marker, so it can be in the flying order', ELEMENTS.waypoint.kind === 'marker');
  const seq = doc.sequence[1];
  check('its clearance is zero', seq.clearance === 0, String(seq.clearance));

  /* The whole point: the knot is the waypoint, not an offset from it. */
  const path = buildPath(doc);
  const knot = path.knots.find((k) => k.elementId === w.id);
  check('the line goes through the point, not past it',
    knot && Math.hypot(knot.pos.x - 10, knot.pos.y - 4) < 1e-9,
    knot ? `${knot.pos.x}, ${knot.pos.y}` : 'no knot');

  /* A marker has no face, so it cannot be told to flip one. */
  const reversals = collectWarnings(doc, path).filter((v) => v.code === 'reversal' && v.elementId === w.id);
  check('it never raises a reversal, having no face to reverse', reversals.length === 0);

  const back = deserialize(serialize(doc));
  check('it round trips', back.doc.elements.some((e) => e.type === 'waypoint' && e.position.x === 10));

  /* Nothing is built for it on the race field. It still shapes the line. */
  const course = courseFromDocument(doc);
  check('the field builds no station for it',
    course.stations.every((st) => st.type !== 'waypoint'));
  check('and it scores nothing, so a lap counts the gates only',
    course.stations.length === 2, `${course.stations.length} stations`);
}

function main() {
  if (process.argv.includes('--emit')) {
    process.stdout.write(serialize(demoTrack()));
    return;
  }
  console.log('track builder self test');
  suiteRoundTrip();
  suiteFaces();
  suitePath();
  suiteGuide();
  suiteWarnings();
  suiteHistory();
  suiteSequenceNaming();
  suiteFigures();
  suiteFlaggedGate();
  suiteFlaggedDoubleStack();
  suiteWaypoint();
  suiteSchemaDoc();
  suiteListing();
  suiteStartBlock();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
