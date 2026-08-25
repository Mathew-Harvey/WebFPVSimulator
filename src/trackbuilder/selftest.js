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
  roundTripsCleanly, serialize, aperturesOf, toPlain,
  logoForDecal, dressOrder, LOGO_SLOTS,
} from './model.js';
import { applyAutoFaces, flipFace, setYaw, clearOverride, travelDirection } from './faces.js';
import { addToSequence, addNextLevel, sequenceLabel, faceLabel } from './sequence.js';
import { applyFigure, matchingFigure, defaultFigure, upgradeStackedFigures } from './figures.js';
import { buildPath, elevationProfile, sequencedElementCount } from './path.js';
import { collectWarnings } from './warnings.js';
import { History } from './history.js';
import { RAD, DEG, wrapAngle } from './geometry.js';
import { ELEMENTS, PALETTE_ORDER, GATE_FLAG_H, flagSideOf, flagSideSigns, elementByKey, elementHeight, virtualApertureDims, countElementsByType, formatElementCounts } from './elements.js';
import { startBlockDims, startBlockHeight, startBlockLaneOffset } from '../art/startblock.js';
import { BANNER_SIZE, flagMast, flagSailProfile } from '../art/banners.js';
import { courseFromDocument } from '../game/trackdoc.js';
import { GUIDE, guideFromKnots, knotsFromPath, tessellateGuide } from '../game/guide.js';
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

function suiteElementCounts() {
  console.log('\nelement counts by type');

  check('an empty field has no types and says so',
    countElementsByType([]).length === 0
    && formatElementCounts([]) === 'no elements');

  const extras = createTrack();
  place(extras, 'startPads', 0, 0);
  place(extras, 'label', 4, 0, { text: 'note' });
  check('start pads and labels do not count as course furniture',
    countElementsByType(extras.elements).length === 0);

  const doc = demoTrack();
  const rows = countElementsByType(doc.elements);
  const byType = Object.fromEntries(rows.map((r) => [r.type, r.count]));
  check('the demo names gates as gates, not a lump of elements', byType.gate === 4, `${byType.gate}`);
  check('and the ladder as a triple stack', byType.ladder === 1);
  check('and the dive gate, tower, flag, cone and barrier each on their own row',
    byType.diveGate === 1 && byType.tower === 1 && byType.flag === 1
    && byType.cone === 1 && byType.barrier === 1);
  check('start pads and labels stay out of the inventory',
    !byType.startPads && !byType.label && rows.every((r) => PALETTE_ORDER.includes(r.type)));
  check('types with none on the field are omitted',
    !byType.doubleStack && !byType.flaggedGate && !byType.waypoint);
  check('the printed mix is the palette order, pluralised',
    formatElementCounts(rows) === '4 gates, 1 triple stack, 1 tower, 1 dive gate, 1 barrier, 1 flag, 1 cone',
    formatElementCounts(rows));

  const mixed = createTrack();
  place(mixed, 'gate', 0, 0);
  place(mixed, 'flaggedGate', 4, 0);
  place(mixed, 'doubleStack', 8, 0);
  place(mixed, 'flaggedDoubleStack', 12, 0);
  const mix = countElementsByType(mixed.elements);
  check('a flagged gate stays a flagged gate, not folded into Gate',
    mix.length === 4
    && mix[0].type === 'gate' && mix[0].count === 1
    && mix[1].type === 'flaggedGate' && mix[1].count === 1
    && mix[2].type === 'doubleStack' && mix[2].count === 1
    && mix[3].type === 'flaggedDoubleStack' && mix[3].count === 1,
    formatElementCounts(mix));
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

  /*
   * TURNING A GATE MUST TURN THE WAY IT IS FLOWN, ALL THE WAY ROUND.
   *
   * Reported against WCMRC Round 5 gate 2: rotating a gate to force the
   * pilot the other way, and the tool putting the direction back. The
   * direction of travel is entry times the normal, so it follows the gate
   * until the normal passes square to the chord applyAutoFaces reads the
   * sign from, and there the sign flips and the direction jumps a half turn
   * BACK. Small turns never reach that point, which is why it read as
   * intermittent; a turn meant to reverse a gate always reaches it.
   *
   * The sweep is the test, not a single rotation, because a single rotation
   * of the wrong size passes on a broken build.
   */
  const spin = createTrack();
  const s0 = place(spin, 'gate', 0, 0);
  const s1 = place(spin, 'gate', 10, 0);
  const s2 = place(spin, 'gate', 20, 0);
  for (const e of [s0, s1, s2]) {
    addToSequence(spin, e.id, 0);
  }
  applyAutoFaces(spin);
  {
    const seqId = spin.sequence[1].id;
    const bearing = () => {
      const t = travelDirection(spin, seqId);
      return t ? Math.atan2(t.y, t.x) : null;
    };
    const wrapTo = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    let prev = bearing();
    let worst = 0;
    const STEP = 3 * RAD;
    for (let i = 0; i < 120; i += 1) {
      setYaw(spin, s1.id, elementById(spin, s1.id).yaw + STEP);
      applyAutoFaces(spin);
      const now = bearing();
      /* How far the direction moved beyond the turn that was asked for. */
      worst = Math.max(worst, Math.abs(wrapTo(now - prev - STEP)));
      prev = now;
    }
    check('turning a gate turns the way it is flown, right round the circle',
      worst < 1e-9, `worst unasked-for swing ${(worst * DEG).toFixed(1)} deg`);
  }

  /* The same, for a gate flown more than once: its passes share one frame,
   * so turning the frame has to turn all of them together rather than
   * letting the chord re-decide each one. */
  const shared = createTrack();
  const h0 = place(shared, 'gate', 0, 0);
  const hub = place(shared, 'gate', 10, 0);
  const h1 = place(shared, 'gate', 20, 6);
  const h2 = place(shared, 'gate', 4, 14);
  addToSequence(shared, h0.id, 0);
  addToSequence(shared, hub.id, 0);
  addToSequence(shared, h1.id, 0);
  addToSequence(shared, hub.id, 0);
  addToSequence(shared, h2.id, 0);
  applyAutoFaces(shared);
  {
    const ids = shared.sequence.filter((q) => q.elementId === hub.id).map((q) => q.id);
    check('the shared gate really is flown twice', ids.length === 2, `${ids.length} passes`);
    const bearings = () => ids.map((id) => {
      const t = travelDirection(shared, id);
      return t ? Math.atan2(t.y, t.x) : null;
    });
    const wrapTo = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    let prev = bearings();
    let worst = 0;
    const STEP = 3 * RAD;
    for (let i = 0; i < 120; i += 1) {
      setYaw(shared, hub.id, elementById(shared, hub.id).yaw + STEP);
      applyAutoFaces(shared);
      const now = bearings();
      now.forEach((v, k) => {
        worst = Math.max(worst, Math.abs(wrapTo(v - prev[k] - STEP)));
      });
      prev = now;
    }
    check('and turning a gate flown twice turns both of its passes with it',
      worst < 1e-9, `worst unasked-for swing ${(worst * DEG).toFixed(1)} deg`);
    check('turning it marks the passes overridden, so the inspector says so',
      ids.every((id) => shared.sequence.find((q) => q.id === id).overridden));
    /* And the escape hatch still works: Re-derive hands a pass back. */
    clearOverride(shared, ids[0]);
    check('Re-derive hands a turned pass back to the automatic rule',
      shared.sequence.find((q) => q.id === ids[0]).overridden === false
      && elementById(shared, hub.id).yawOverridden === false);
  }

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

  /*
   * TURNING A MARKER BY HAND SWINGS ITS SQUARE ROUND THE POLE, all the way
   * round and not to one of two sides. The knot is measured off the built
   * path rather than off markerPassDir, because the claim is about where
   * the racing line goes and not about what one helper returns.
   */
  {
    const before = buildPath(turn).knots.find((k) => k.elementId === fl.id);
    const bearing = (k) => Math.atan2(k.pos.y - fl.position.y, k.pos.x - fl.position.x);
    /* Whatever the automatic rule chose here, recorded rather than
     * asserted: the claim under test is that a hand turn overrides it and
     * that re-derive gives it back, not what the rule picks on this
     * particular corner, which the two checks above already own. */
    const autoBearing = bearing(before);
    for (const want of [0, 40, 135, -100, 179]) {
      setYaw(turn, fl.id, want * RAD);
      const k = buildPath(turn).knots.find((q) => q.elementId === fl.id);
      const got = bearing(k) * DEG;
      check(`a flag turned to ${want} deg puts its square there`,
        Math.abs(wrapAngle((got - want) * RAD)) < 1e-3, `${got.toFixed(2)} deg`);
      check('and the knot is still exactly one clearance off the pole',
        Math.abs(Math.hypot(k.pos.x - fl.position.x, k.pos.y - fl.position.y)
          - (k.seq.clearance ?? 0)) < 1e-6);
    }
    /* Flip side has to turn a hand turned marker, or it toggles a field
     * nothing is reading. */
    setYaw(turn, fl.id, 40 * RAD);
    flipFace(turn, turn.sequence[1].id);
    const flipped = buildPath(turn).knots.find((q) => q.elementId === fl.id);
    check('flip side turns a hand turned marker a half turn',
      Math.abs(wrapAngle(bearing(flipped) - (40 + 180) * RAD)) < 1e-3,
      `${(bearing(flipped) * DEG).toFixed(2)} deg`);
    /* And re-derive hands it back to the automatic rule. */
    clearOverride(turn, turn.sequence[1].id);
    const back = buildPath(turn).knots.find((q) => q.elementId === fl.id);
    check('re-derive puts it back on the automatic side',
      Math.abs(wrapAngle(bearing(back) - autoBearing)) < 1e-3,
      `${(bearing(back) * DEG).toFixed(2)} vs ${(autoBearing * DEG).toFixed(2)} deg`);
  }

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

  /* Inventory by type is the quote an author wants, not a single lump. */

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
   * the painted wrap has to sit on that side, not on the inside of the L. */
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
  check('and paints a wrap at the isolated flag', turnGuide.flagArcs.length === 1, `${turnGuide.flagArcs.length} wraps`);
  check('and puts one stay-low arrow on the lap, not one per gate',
    turnGuide.arrows.length >= 1
    && turnGuide.arrows.every((a) => a.lanes === 1)
    && turnGuide.arrows.filter((a) => a.kind === 'gate').length <= 1,
    `${turnGuide.arrows.map((a) => `${a.kind}:${a.lanes}`).join(',')}`);

  const wrap = turnGuide.flagArcs[0];
  const pole = { x: 10, z: 0 };
  const flyKnot = turnPath.knots.find((k) => k.role === 'marker');
  const fly = flyKnot ? { x: flyKnot.pos.x, z: flyKnot.pos.y } : pole;
  if (wrap) {
    const radii = wrap.points.map((p) => Math.hypot(p.x - pole.x, p.z - pole.z));
    const meanR = radii.reduce((a, b) => a + b, 0) / radii.length;
    check('the wrap sits on the clearance circle',
      Math.abs(meanR - 1.5) < 0.08, `mean ${meanR.toFixed(3)} m`);
    const midZ = wrap.points.reduce((s, p) => s + p.z, 0) / wrap.points.length;
    check('the wrap sits on the fly side, not the inside of the turn',
      (midZ - pole.z) * (fly.z - pole.z) > 0,
      `wrap mean z ${midZ.toFixed(2)}, fly ${fly.z.toFixed(2)}, pole ${pole.z}`);
    const wrong = wrap.points.filter((p) => (p.x - pole.x) * (fly.x - pole.x)
      + (p.z - pole.z) * (fly.z - pole.z) < 0).length;
    check('the painted comma does not go the wrong side of the flag',
      wrong === 0, `${wrong} of ${wrap.points.length} points on the back side`);
  }

  /* Samples near the flag must stay outside the pole. A line through the
   * flag would be the bug this whole file exists to prevent. */
  const near = turnGuide.samples.filter((s) => Math.hypot(s.x - pole.x, s.z - pole.z) < 4);
  const minR = Math.min(...near.map((s) => Math.hypot(s.x - pole.x, s.z - pole.z)));
  check('the taut string does not run through the flag',
    minR > 1.2, `closest ${minR.toFixed(3)} m`);
  check('and no arrow sits on the flag',
    turnGuide.arrows.every((a) => Math.hypot(a.x - pole.x, a.z - pole.z) > 3.5),
    turnGuide.arrows.map((a) => Math.hypot(a.x - pole.x, a.z - pole.z).toFixed(2)).join(','));

  /* Three flags 2.5 m apart: a slalom. Wrapping every pole stacked. */
  const slalom = createTrack();
  const sg0 = place(slalom, 'gate', 0, 0);
  const sf1 = place(slalom, 'flag', 8, 0);
  const sf2 = place(slalom, 'flag', 10.5, 0);
  const sf3 = place(slalom, 'flag', 13, 0);
  const sg1 = place(slalom, 'gate', 22, 0);
  for (const el of [sg0, sf1, sf2, sf3, sg1]) {
    addToSequence(slalom, el.id, 0);
  }
  applyAutoFaces(slalom);
  const slalomGuide = guideFromKnots(knotsFromPath(buildPath(slalom)));
  check('a tight flag slalom does not paint a wrap on every pole',
    slalomGuide.flagArcs.length === 0, `${slalomGuide.flagArcs.length} wraps`);
  const slalomPoles = [[8, 0], [10.5, 0], [13, 0]];
  const stacked = slalomGuide.arrows.filter((a) => slalomPoles.some(
    ([x, z]) => Math.hypot(a.x - x, a.z - z) < 3.5,
  ));
  check('and does not stack arrows on those flags',
    stacked.length === 0, `${stacked.length} arrows on flags`);

  const demoPath = buildPath(demoTrack());
  const demo = guideFromKnots(knotsFromPath(demoPath));
  const demoApertures = demoPath.knots.filter((k) => k.role === 'aperture').length;
  check('the demo tower is a go-up height',
    demoPath.knots.some((k) => k.role === 'aperture' && k.pos.z >= GUIDE.highM));
  check('the demo lap has dashes', demo.dashes.length > 8, `${demo.dashes.length} dashes`);
  check('the demo lap has fewer arrows than gates',
    demo.arrows.length > 0 && demo.arrows.length < demoApertures,
    `${demo.arrows.length} arrows, ${demoApertures} gates`);
  check('a dual arrow marks the climb to the tower',
    demo.arrows.some((a) => a.lanes === 2),
    demo.arrows.map((a) => `${a.kind}:${a.lanes}`).join(','));
  check('a single arrow marks a low stretch',
    demo.arrows.some((a) => a.lanes === 1),
    demo.arrows.map((a) => `${a.kind}:${a.lanes}`).join(','));
  check('the demo lap wraps its isolated turn flag', demo.flagArcs.length >= 1, `${demo.flagArcs.length} wraps`);
  check('and tessellates into paint triangles',
    tessellateGuide(demo).length >= 60, `${tessellateGuide(demo).length} verts`);

  const dual = { x: 0, z: 0, hx: 1, hz: 0, kind: 'gate', lanes: 2 };
  const single = { x: 0, z: 0, hx: 1, hz: 0, kind: 'gate', lanes: 1 };
  const emptyPaint = { dashes: [], flagArcs: [], arrows: [] };
  check('two side-by-side arrows tessellate as a pair',
    tessellateGuide({ ...emptyPaint, arrows: [dual] }).length
    === tessellateGuide({ ...emptyPaint, arrows: [single] }).length * 2);

  const course = courseFromDocument(demoTrack());
  check('the course carries a guide in scene metres',
    course.guide && course.guide.samples.length > 10,
    course.guide ? `${course.guide.samples.length} samples` : 'missing');
  check('and at least one flag wrap survived the frame conversion',
    course.guide && course.guide.flagArcs.length >= 1,
    course.guide ? `${course.guide.flagArcs.length} wraps` : 'missing');
  check('and the converted guide still codes height on its arrows',
    course.guide && course.guide.arrows.some((a) => a.lanes === 2)
    && course.guide.arrows.some((a) => a.lanes === 1),
    course.guide ? course.guide.arrows.map((a) => `${a.kind}:${a.lanes}`).join(',') : 'missing');
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

  /*
   * An OLD document's alternating spiral, and the fixture has to be faithful
   * about one thing: its faces are NOT overridden.
   *
   * The old spelling predates applyFigure, which arrived in the same commit
   * as the upgrade itself, so nothing back then could set the flag on a
   * stack's passes. They were sequenced with addNextLevel and their faces
   * were derived by applyAutoFaces, which leaves it false. Flipping an entry
   * on a run applyFigure has just written leaves the flag TRUE and describes
   * a document the old build could not produce, which is what this fixture
   * used to do.
   */
  spiral[0].overridden = false;
  spiral[1].overridden = false;
  spiral[1].entry = -spiral[0].entry;
  check('an old alternating spiral is not the current figure', matchingFigure(dbl, stack) !== 'spiralUp');
  check('upgrading it restores the same face', upgradeStackedFigures(dbl) === true);
  check('and it is a spiral up again', matchingFigure(dbl, stack) === 'spiralUp');
  check('and both holes share a face', spiral[0].entry === spiral[1].entry);

  /*
   * AND THE UPGRADE MUST KEEP ITS HANDS OFF A FACE THE AUTHOR SET.
   *
   * Reported: a triple stack flown as a spiral up with the middle pass
   * reversed by hand read "enter from the front" in the builder and flew
   * from the back in the game. The upgrade recognises an old file by its
   * shape, a stack whose passes alternate, and that is exactly the shape a
   * hand flipped spiral has. trackdoc.js runs it on every conversion into a
   * course, so it undid the author on every load.
   */
  const hand = createTrack();
  const hg0 = place(hand, 'gate', 0, 0);
  const hstack = place(hand, 'ladder', 12, 0);
  const hg1 = place(hand, 'gate', 24, 0);
  addToSequence(hand, hg0.id, 0);
  addToSequence(hand, hstack.id, 0);
  addToSequence(hand, hg1.id, 0);
  applyFigure(hand, hstack.id, 'spiralUp');
  applyAutoFaces(hand);
  {
    const passes = () => hand.sequence.filter((q) => q.elementId === hstack.id);
    check('the stack is flown three times', passes().length === 3, `${passes().length}`);
    flipFace(hand, passes()[1].id);
    const wanted = passes().map((q) => q.entry);
    check('the middle pass is reversed against its neighbours',
      wanted[1] !== wanted[0] && wanted[1] !== wanted[2], wanted.join(','));
    check('and the upgrade leaves an authored run alone',
      upgradeStackedFigures(hand) === false);
    check('so the faces the author set are still there',
      passes().map((q) => q.entry).join(',') === wanted.join(','),
      passes().map((q) => q.entry).join(','));
    /* And the whole point: it survives the trip into the game. */
    const flown = courseFromDocument(toPlain(hand))
      .stations.filter((q) => q.elementId === hstack.id);
    check('the game flies the middle pass the way the builder drew it',
      flown.length === 3 && flown[1].entry === wanted[1]
      && flown[0].entry === wanted[0] && flown[2].entry === wanted[2],
      flown.map((q) => q.entry).join(','));
    /* Measured off the station headings, not just the sign, because the sign
     * is only worth anything if it reaches the direction the gate is built
     * and scored against. */
    const sep = Math.abs(Math.atan2(
      Math.sin(flown[1].yaw - flown[0].yaw),
      Math.cos(flown[1].yaw - flown[0].yaw),
    )) * DEG;
    check('and its station really does point the other way',
      sep > 179 && sep < 181, `${sep.toFixed(1)} deg from the pass below it`);
  }

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
  /* 138.9 and 2.73 until the cone's default clearance became the flag's
   * 1.5 m. A marker's knot sits at that radius, so moving it moves the lap
   * these two numbers measure; the tolerances are untouched. */
  check('schema.md quotes the right lap length', Math.abs(path.length - 139.7) < 0.05, `${path.length.toFixed(2)} m`);
  check('schema.md quotes the right tightest radius',
    Math.abs(path.tightest.radius - 2.68) < 0.005, `${path.tightest.radius.toFixed(3)} m`);
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

/*
 * FIVE MARKS AND THE PAINT ON THE GRASS.
 *
 * The three things that can go quietly wrong here are the migration off the
 * old single logo field, the round robin that decides whose mark is on which
 * gate, and whether a decal counts as layout. The last one is the commercial
 * one: adding a sponsor to a course people have flown must not clear their
 * times.
 */
function suiteBranding() {
  console.log('branding');
  const png = (n) => `data:image/png;base64,${'a'.repeat(n)}`;

  /* Migration. A version 1 document's single logo becomes the first mark,
   * silently: it is an upgrade rather than damage. */
  const v1 = {
    schemaVersion: 1,
    id: 'trk-11111111',
    name: 'Old',
    field: { width: 60, depth: 40, gridSize: 1 },
    branding: { logo: png(120), logoName: 'acme.png' },
    elements: [],
    sequence: [],
  };
  const migrated = normalize(v1);
  check('a version 1 logo becomes the first mark',
    migrated.doc.branding.logos.length === 1
    && migrated.doc.branding.logos[0].image === png(120)
    && migrated.doc.branding.logos[0].name === 'acme.png');
  check('and the migration is silent', migrated.repairs.length === 0, migrated.repairs.join('; '));
  check('the document is written as version 2', toPlain(migrated.doc).schemaVersion === 2);
  check('and the old spelling is not written back',
    !('logo' in toPlain(migrated.doc).branding));

  /* The caps. Five slots, and one shared size budget under them. */
  const marks = (count, size) => Array.from({ length: count }, (unused, i) => ({
    id: `logo-${i + 1}`, image: png(size), name: `m${i + 1}`,
  }));
  const many = normalize({ ...v1, schemaVersion: 2, branding: { logos: marks(7, 100) } });
  check('a sixth mark is dropped', many.doc.branding.logos.length === LOGO_SLOTS);
  check('and it says so', many.repairs.length === 1, many.repairs.join('; '));
  const fat = normalize({ ...v1, schemaVersion: 2, branding: { logos: marks(3, 200 * 1024) } });
  check('marks past the shared budget are dropped',
    fat.doc.branding.logos.length === 1, `${fat.doc.branding.logos.length} kept`);
  const remote = normalize({
    ...v1,
    schemaVersion: 2,
    branding: { logos: [{ id: 'logo-1', image: 'https://evil.example/x.png', name: 'x' }, { id: 'logo-2', image: png(50), name: 'ok' }] },
  });
  check('a remote mark is dropped and the embedded one kept',
    remote.doc.branding.logos.length === 1 && remote.doc.branding.logos[0].name === 'ok');
  const clashing = normalize({
    ...v1,
    schemaVersion: 2,
    branding: { logos: [{ id: 'logo-1', image: png(50) }, { id: 'logo-1', image: png(60) }] },
  });
  check('two marks cannot share an id',
    clashing.doc.branding.logos[0].id !== clashing.doc.branding.logos[1].id);

  /*
   * THE ROUND ROBIN. Fifteen gates and five marks is three gates each, and
   * they are spread down the lap rather than bunched, which is the whole of
   * what a sponsor is buying.
   */
  const doc = createTrack('Fifteen');
  doc.branding.logos = marks(5, 60);
  for (let i = 0; i < 15; i += 1) {
    const gate = place(doc, 'gate', 4 + i * 3, 20);
    doc.sequence.push({
      id: `sq-${i + 1}`, elementId: gate.id, apertureIndex: 0, entry: 1, passSide: null, clearance: null, overridden: false,
    });
  }
  const order = dressOrder(doc);
  check('every gate in the order gets a slot', order.size === 15);
  const tally = new Array(5).fill(0);
  for (const slot of order.values()) {
    tally[slot % 5] += 1;
  }
  check('fifteen gates and five marks is three gates each',
    tally.every((n) => n === 3), tally.join(','));
  check('and consecutive gates wear different marks',
    [...order.values()].every((slot, i) => slot === i));

  /* A ladder flown three times is ONE structure and takes ONE slot: it has
   * one header board, so it can only carry one sponsor. */
  const stacked = createTrack('Stack');
  const first = place(stacked, 'gate', 10, 10);
  const ladder = place(stacked, 'ladder', 20, 10);
  const last = place(stacked, 'gate', 30, 10);
  stacked.sequence.push(
    { id: 'sq-1', elementId: first.id, apertureIndex: 0, entry: 1 },
    { id: 'sq-2', elementId: ladder.id, apertureIndex: 0, entry: 1 },
    { id: 'sq-3', elementId: ladder.id, apertureIndex: 1, entry: -1 },
    { id: 'sq-4', elementId: ladder.id, apertureIndex: 2, entry: 1 },
    { id: 'sq-5', elementId: last.id, apertureIndex: 0, entry: 1 },
  );
  const stackOrder = dressOrder(stacked);
  check('a stack flown three times takes one slot',
    stackOrder.size === 3 && stackOrder.get(ladder.id) === 1 && stackOrder.get(last.id) === 2);

  /*
   * THE PAINT. A ground logo is an element with a footprint and a heading,
   * it never reaches the flying order, it becomes a decal on the course, and
   * it is not part of the layout.
   */
  const painted = createTrack('Painted');
  painted.branding.logos = marks(2, 60);
  const gate = place(painted, 'gate', 10, 20);
  painted.sequence.push({ id: 'sq-1', elementId: gate.id, apertureIndex: 0, entry: 1 });
  const bare = layoutFingerprint(painted);
  const decal = place(painted, 'groundLogo', 30, 20, { dims: { width: 12, depth: 4 } });
  decal.logoId = 'logo-2';
  check('a ground logo cannot be added to the flying order',
    addToSequence(painted, decal.id) === null);
  check('paint on the grass is not part of the layout',
    layoutFingerprint(painted) === bare);
  check('it round trips', deserialize(serialize(painted)).doc.elements
    .some((e) => e.type === 'groundLogo' && e.logoId === 'logo-2' && e.dims.width === 12));
  check('and the mark it names is the one it gets',
    logoForDecal(painted, decal) === painted.branding.logos[1]);
  const unnamed = place(painted, 'groundLogo', 40, 20);
  check('a decal that names nothing wears the first mark',
    logoForDecal(painted, unnamed) === painted.branding.logos[0]);
  const orphan = place(painted, 'groundLogo', 50, 20);
  orphan.logoId = 'logo-9';
  check('a decal naming a mark that is gone wears nothing, rather than somebody else\u2019s',
    logoForDecal(painted, orphan) === null);

  const course = courseFromDocument(painted);
  check('the course carries the marks in order',
    course.logos.length === 2 && course.logos[0] === painted.branding.logos[0].image);
  check('a decal is not a structure',
    course.structures.every((st) => st.type !== 'groundLogo'));
  check('and the orphan is dropped rather than painted with the wrong mark',
    course.decals.length === 2, `${course.decals.length} decals`);
  const placed = course.decals.find((d) => d.logo === 1);
  /* Document (30, 20) on a 60 by 40 field is the middle of the world. */
  check('a decal lands where the document put it',
    placed && Math.abs(placed.x - 0) < 1e-9 && Math.abs(placed.z - 0) < 1e-9,
    placed ? `${placed.x}, ${placed.z}` : 'missing');
  check('and it keeps its footprint', placed && placed.w === 12 && placed.d === 4);
}

/*
 * THE FLAG'S SHAPE.
 *
 * It is a feather flag, and the three things that make it one are all
 * numbers rather than pictures: the mast bends, the sail is a tall narrow
 * panel hanging off the bend, and the print's canvas is that panel's own
 * aspect. Four consumers read this out of one module, so a check here is
 * worth four in the renderers that cannot run in Node.
 */
function suiteFlagShape() {
  console.log('flag shape');
  const h = 2.9;
  const m = flagMast(h);

  /* The mast starts at the butt and stands where a flag is planted. */
  check('the mast starts at the ground on the mast line',
    m.points[0].x === 0 && m.points[0].y === 0);

  /*
   * THE APEX IS THE STATED HEIGHT, exactly. Everything that asks how tall a
   * flag is reads that number: the collider the pilot hits, the attract
   * camera's clearance and the builder's elementHeight. The arc turns past
   * horizontal, so the apex is NOT the tip and taking the tip for the top
   * would quietly shorten every flag on the field.
   */
  const apex = Math.max(...m.points.map((p) => p.y));
  check('the mast apexes at exactly the flag height', Math.abs(apex - h) < 1e-9, String(apex));
  check('and the tip hangs a little below the apex, which is what bows it',
    m.tip.y < apex && m.tip.y > apex * 0.98, `${m.tip.y.toFixed(4)} of ${apex}`);
  check('nothing on the mast stands above the stated height',
    m.points.every((p) => p.y <= h + 1e-9));

  /* Tall and narrow. The teardrop was 0.30 of its height at its widest. */
  check('the sail is about a fifth of the height across',
    m.width > h * 0.20 && m.width < h * 0.26, m.width.toFixed(3));
  check('and three and a half times as tall as it is wide',
    m.sailH / m.width > 3.2 && m.sailH / m.width < 3.9, (m.sailH / m.width).toFixed(2));
  check('the mast reaches forward exactly as far as the sail is wide',
    Math.abs(m.tip.x - m.width) < 1e-9);

  const { rows, tBend } = flagSailProfile(h);
  check('the sail hangs clear of the grass', rows[0].ly > h * 0.1 && rows[0].ly < h * 0.2);
  check('its foot is a level hem', Math.abs(rows[0].ly - rows[0].ty) < 1e-9);
  check('its trailing edge is one straight vertical line',
    rows.every((r) => Math.abs(r.tx - m.width) < 1e-9));
  check('its trailing edge only ever rises',
    rows.every((r, i) => i === 0 || r.ty >= rows[i - 1].ty - 1e-9));
  check('its leading edge is the mast, straight below the bend',
    rows.filter((r) => r.t <= tBend).every((r) => Math.abs(r.lx) < 1e-9));
  check('and swept forward above it',
    rows.filter((r) => r.t > tBend).every((r) => r.lx > 0));
  check('the head closes on the mast tip',
    Math.abs(rows[rows.length - 1].lx - m.tip.x) < 1e-9
    && Math.abs(rows[rows.length - 1].ly - m.tip.y) < 1e-9);
  check('and the two edges meet there, so the corner is a point',
    Math.abs(rows[rows.length - 1].lx - rows[rows.length - 1].tx) < 1e-9
    && Math.abs(rows[rows.length - 1].ly - rows[rows.length - 1].ty) < 1e-9);
  /* t is the print's v. Metres per step have to match across the fold or
   * the artwork is stretched at the join. */
  const steps = rows.slice(1).map((r, i) => ({
    dv: r.t - rows[i].t,
    dm: Math.hypot(r.ty - rows[i].ty, 0) || (r.ly - rows[i].ly),
  }));
  const rate = steps.map((x) => x.dm / x.dv).filter((x) => Number.isFinite(x) && x > 0);
  check('the print has the same metres per row on both sides of the fold',
    Math.max(...rate) / Math.min(...rate) < 1.02,
    `${Math.min(...rate).toFixed(3)} to ${Math.max(...rate).toFixed(3)}`);

  /*
   * The canvas is the panel's aspect, or a chequer comes out of square. The
   * shape and the print are one decision, so this is the check that catches
   * somebody retuning FLAG and forgetting BANNER_SIZE.
   */
  const want = Math.round(BANNER_SIZE.sail[1] * (m.width / m.sailH));
  check('the sail canvas is the panel it lands on', BANNER_SIZE.sail[0] === want,
    `${BANNER_SIZE.sail[0]} against ${want}`);

  /*
   * The sheet holds the panel twice, front and reverse, and both renderers
   * read half of it per sheet of cloth on that assumption. A sheet that is
   * not exactly twice as wide puts the seam somewhere other than u = 0.5 and
   * every mark on the course lands half a flag out.
   */
  check('the sail sheet is the panel twice over',
    BANNER_SIZE.sailSheet[0] === BANNER_SIZE.sail[0] * 2
    && BANNER_SIZE.sailSheet[1] === BANNER_SIZE.sail[1],
    `${BANNER_SIZE.sailSheet.join(' by ')} against ${BANNER_SIZE.sail.join(' by ')}`);

  /* Scale free: a pennant on a gate header is the same flag, smaller. */
  const small = flagMast(GATE_FLAG_H);
  check('a header pennant is the same shape at a pennant size',
    Math.abs(small.width / GATE_FLAG_H - m.width / h) < 1e-9);
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
function raceFromCourse(course) {
  return new Race(course.stations.map((st, i) => ({
    position: { x: st.x, y: 0, z: st.z },
    heading: st.yaw,
    pitch: st.pitch ?? 0,
    flyOrder: i,
    elementId: st.elementId,
    apertureIndex: st.apertureIndex,
    kindName: st.type,
    virtual: Boolean(st.virtual),
    apertures: [{ centreY: st.centreY, clearW: st.clearW, clearH: st.clearH }],
    aperture: { centreY: st.centreY, clearW: st.clearW, clearH: st.clearH },
  })));
}

function flyAlong(g, toward = 1) {
  const ap = g.apertures[0];
  const cy = g.y + ap.centreY;
  const s = toward >= 0 ? 1 : -1;
  return {
    prev: { x: g.x - g.az.x * 2 * s, y: cy - g.az.y * 2 * s, z: g.z - g.az.z * 2 * s },
    curr: { x: g.x + g.az.x * 2 * s, y: cy + g.az.y * 2 * s, z: g.z + g.az.z * 2 * s },
  };
}

function suiteScoring() {
  console.log('\ngate scoring');

  const dv = createTrack();
  const high = place(dv, 'tower', 0, 0);
  const dive = place(dv, 'diveGate', 10, 0, { pitch: 55 * RAD });
  const low = place(dv, 'gate', 20, 0);
  for (const el of [high, dive, low]) {
    addToSequence(dv, el.id, 0);
  }
  const diveCourse = courseFromDocument(dv);
  const diveSt = diveCourse.stations.find((s) => s.type === 'diveGate');
  check('a tilted dive gate is a scoring station', Boolean(diveSt), 'missing');
  check('its travel dips below the horizontal', diveSt && diveSt.pitch < -0.2,
    diveSt ? `${(diveSt.pitch * DEG).toFixed(1)} deg` : 'missing');
  const diveRace = raceFromCourse(diveCourse);
  const diveGate = diveRace.gates.find((g) => g.kindName === 'diveGate');
  check('the race built a dive gate', Boolean(diveGate));
  diveRace.next = diveRace.gates.indexOf(diveGate);
  const diveSeg = flyAlong(diveGate);
  const diveHit = diveRace.update(diveSeg.prev, diveSeg.curr, 10, 10);
  check('flying down through a tilted dive gate registers', diveHit.passed != null,
    `passed ${diveHit.passed}`);

  const reverse = raceFromCourse(diveCourse);
  const revG = reverse.gates.find((g) => g.kindName === 'diveGate');
  reverse.next = reverse.gates.indexOf(revG);
  const back = flyAlong(revG, -1);
  const backHit = reverse.update(back.prev, back.curr, 10, 10);
  check('flying the dive gate the wrong way does not register', backHit.passed == null,
    `passed ${backHit.passed}`);

  const turn = createTrack();
  const t0 = place(turn, 'gate', 0, 0);
  const fl = place(turn, 'flag', 10, 0);
  const t1 = place(turn, 'gate', 10, 10);
  addToSequence(turn, t0.id, 0);
  addToSequence(turn, fl.id, 0);
  addToSequence(turn, t1.id, 0);
  const flagCourse = courseFromDocument(turn);
  const flagSt = flagCourse.stations.find((s) => s.type === 'flag');
  check('a flag in the order is a virtual gate', Boolean(flagSt && flagSt.virtual));
  const dims = virtualApertureDims(fl, turn.sequence[1]);
  check('the square is the clearance corridor plus the pad', flagSt && Math.abs(flagSt.clearW - dims.clearW) < 1e-9,
    flagSt ? `${flagSt.clearW}` : 'missing');
  check('the pad is real, so the square is wider than the corridor',
    dims.clearW > (turn.sequence[1].clearance ?? 0) * 2 + 1e-9,
    `${dims.clearW} vs ${(turn.sequence[1].clearance ?? 0) * 2}`);
  /* The contract the pad rests on: the inner edge is still ON the pole, so
   * the square grew away from the flag and not around it. Measured in the
   * station's own across axis rather than restated from elements.js. */
  const flagPole = flagCourse.structures.find((s) => s.type === 'flag');
  const acrossPole = Math.hypot(flagSt.x - flagPole.x, flagSt.z - flagPole.z);
  check('and its inner edge is still on the pole',
    Math.abs(acrossPole - dims.clearW / 2) < 1e-6,
    `${acrossPole.toFixed(4)} vs ${(dims.clearW / 2).toFixed(4)}`);
  const flagRace = raceFromCourse(flagCourse);
  const flagG = flagRace.gates.find((g) => g.virtual);
  check('the race scores the flag square', Boolean(flagG && flagG.virtual));
  /* First station is the lead-in gate. Fly it so the flag is next. */
  const g0 = flagRace.gates[0];
  const lead = flyAlong(g0);
  flagRace.update(lead.prev, lead.curr, 10, 10);
  check('the flag is next after the lead-in', flagRace.next === flagRace.gates.indexOf(flagG),
    `next ${flagRace.next}`);
  const flagSeg = flyAlong(flagG);
  const flagHit = flagRace.update(flagSeg.prev, flagSeg.curr, 20, 20);
  check('flying the pass-side square registers the flag', flagHit.passed != null,
    `passed ${flagHit.passed}`);

  const missFlag = raceFromCourse(flagCourse);
  missFlag.update(lead.prev, lead.curr, 10, 10);
  const pole = flagCourse.structures.find((s) => s.type === 'flag');
  const other = {
    prev: { x: pole.x - flagG.az.x * 2, y: flagG.y + flagG.apertures[0].centreY, z: pole.z - flagG.az.z * 2 },
    curr: { x: pole.x + flagG.az.x * 2, y: flagG.y + flagG.apertures[0].centreY, z: pole.z + flagG.az.z * 2 },
  };
  const missHit = missFlag.update(other.prev, other.curr, 20, 20);
  check('flying the other side of the pole does not register the flag', missHit.passed == null,
    `passed ${missHit.passed}`);

  const hang = createTrack();
  const hangDive = place(hang, 'diveGate', 10, 0, { z: 4.69, dims: { sillH: 0 } });
  addToSequence(hang, hangDive.id, 0);
  const hangCourse = courseFromDocument(hang);
  const hangSt = hangCourse.structures.find((s) => s.type === 'diveGate');
  const wantSill = (4.69 - hangDive.dims.clearH / 2) * GATE_SCALE;
  check('a floating dive mast is planted on the ground', hangSt && hangSt.baseY === 0,
    hangSt ? `baseY ${hangSt.baseY}` : 'missing');
  check('and its elevation lives in the sill', hangSt && Math.abs(hangSt.dims.sillH - wantSill) < 0.02,
    hangSt ? `sill ${hangSt.dims.sillH.toFixed(3)} vs ${wantSill.toFixed(3)}` : 'missing');

  const grass = createTrack();
  const grassDive = place(grass, 'diveGate', 10, 0, { dims: { sillH: 0 } });
  addToSequence(grass, grassDive.id, 0);
  const grassCourse = courseFromDocument(grass);
  const grassSt = grassCourse.structures.find((s) => s.type === 'diveGate');
  const want15 = ELEMENTS.diveGate.dims.sillH * GATE_SCALE;
  check('a dive on the grass is a 15 ft MultiGP dive',
    grassSt && Math.abs(grassSt.dims.sillH - want15) < 0.02,
    grassSt ? `sill ${grassSt.dims.sillH.toFixed(3)} vs ${want15.toFixed(3)}` : 'missing');
  check('and still planted on the ground', grassSt && grassSt.baseY === 0,
    grassSt ? `baseY ${grassSt.baseY}` : 'missing');

  const midPole = createTrack();
  const mp0 = place(midPole, 'gate', 0, 0);
  const mpFlag = place(midPole, 'flag', 10, 0, { z: 1.61 });
  const mp1 = place(midPole, 'gate', 20, 0);
  addToSequence(midPole, mp0.id, 0);
  addToSequence(midPole, mpFlag.id, 0);
  addToSequence(midPole, mp1.id, 0);
  const midCourse = courseFromDocument(midPole);
  const midSt = midCourse.structures.find((s) => s.type === 'flag');
  const midStation = midCourse.stations.find((s) => s.type === 'flag');
  check('a mid-pole flag origin is planted on the ground', midSt && midSt.baseY === 0,
    midSt ? `baseY ${midSt.baseY}` : 'missing');
  check('and its scoring square sits on the grass with it', midStation && midStation.baseY === 0,
    midStation ? `baseY ${midStation.baseY}` : 'missing');

  const roof = createTrack();
  const rf0 = place(roof, 'gate', 0, 0);
  const rfFlag = place(roof, 'flag', 10, 0, { z: 20 });
  const rf1 = place(roof, 'gate', 20, 0);
  addToSequence(roof, rf0.id, 0);
  addToSequence(roof, rfFlag.id, 0);
  addToSequence(roof, rf1.id, 0);
  const roofCourse = courseFromDocument(roof);
  const roofSt = roofCourse.structures.find((s) => s.type === 'flag');
  check('a rooftop flag keeps its elevation', roofSt && Math.abs(roofSt.baseY - 20) < 1e-9,
    roofSt ? `baseY ${roofSt.baseY}` : 'missing');

  const stile = createTrack();
  const stileLead = place(stile, 'gate', 0, 0);
  const stileGate = place(stile, 'gate', 10, 0, { yaw: 0 });
  stileGate.yawOverridden = true;
  const stileL = place(stile, 'flag', 10, 1.4);
  const stileR = place(stile, 'flag', 10, -1.4);
  const stileNext = place(stile, 'gate', 20, 0);
  for (const el of [stileLead, stileGate, stileL, stileR, stileNext]) {
    addToSequence(stile, el.id, 0);
  }
  const stileCourse = courseFromDocument(stile);
  const stileGateSt = stileCourse.stations.find((s) => s.elementId === stileGate.id);
  const stileFlagSt = stileCourse.stations.find((s) => s.elementId === stileL.id);
  const stileYawErr = stileGateSt && stileFlagSt
    ? Math.abs(wrapAngle(stileFlagSt.yaw - stileGateSt.yaw))
    : Infinity;
  check('a flag on a gate stile faces the opening, not along the PVC',
    stileYawErr < 15 * RAD,
    Number.isFinite(stileYawErr) ? `${(stileYawErr * DEG).toFixed(1)} deg` : 'missing');
  const stileRace = raceFromCourse(stileCourse);
  const stileGateG = stileRace.gates.find((g) => g.elementId === stileGate.id);
  const stileFlagG = stileRace.gates.find((g) => g.elementId === stileL.id);
  for (const g of stileRace.gates) {
    if (g === stileFlagG) {
      break;
    }
    const seg = flyAlong(g);
    stileRace.update(seg.prev, seg.curr, 10, 10);
  }
  check('the stile flag is next after its gate',
    stileFlagG != null && stileRace.next === stileRace.gates.indexOf(stileFlagG),
    `next ${stileRace.next}`);
  const stileHit = stileFlagG ? stileRace.update(
    flyAlong(stileFlagG).prev, flyAlong(stileFlagG).curr, 20, 20,
  ) : { passed: null };
  check('flying the stile square registers the flag', stileHit.passed != null,
    `passed ${stileHit.passed}`);

  const far = createTrack();
  const farGate = place(far, 'gate', 10, 0, { yaw: 0 });
  farGate.yawOverridden = true;
  const farA = place(far, 'flag', 10, 3.5);
  const farB = place(far, 'flag', 10, -3.5);
  const farNext = place(far, 'gate', 20, 0);
  for (const el of [farGate, farA, farB, farNext]) {
    addToSequence(far, el.id, 0);
  }
  const farCourse = courseFromDocument(far);
  const farGateSt = farCourse.stations.find((s) => s.elementId === farGate.id);
  const farFlagSt = farCourse.stations.find((s) => s.elementId === farA.id);
  const farYawErr = farGateSt && farFlagSt
    ? Math.abs(wrapAngle(farFlagSt.yaw - farGateSt.yaw))
    : 0;
  const beside = createTrack();
  const besideGate = place(beside, 'gate', 10, 0, { yaw: 0 });
  besideGate.yawOverridden = true;
  const besideFlag = place(beside, 'flag', 10, 2.75);
  const besideOther = place(beside, 'flag', 10, -1.4);
  const besideNext = place(beside, 'gate', 20, 0);
  for (const el of [besideGate, besideFlag, besideOther, besideNext]) {
    addToSequence(beside, el.id, 0);
  }
  const besideCourse = courseFromDocument(beside);
  const besideGateSt = besideCourse.stations.find((s) => s.elementId === besideGate.id);
  const besideFlagSt = besideCourse.stations.find((s) => s.elementId === besideFlag.id);
  const besideYawErr = besideGateSt && besideFlagSt
    ? Math.abs(wrapAngle(besideFlagSt.yaw - besideGateSt.yaw))
    : Infinity;
  check('a flag 2.75 m in the gate plane still faces the opening',
    besideYawErr < 15 * RAD,
    Number.isFinite(besideYawErr) ? `${(besideYawErr * DEG).toFixed(1)} deg` : 'missing');

  check('a flag 3.5 m off a gate is a real turn, not a stile snap',
    farYawErr > 60 * RAD,
    Number.isFinite(farYawErr) ? `${(farYawErr * DEG).toFixed(1)} deg` : 'missing');

  const edge = createTrack();
  const a = place(edge, 'gate', 0, 0);
  const b = place(edge, 'gate', 10, 0);
  addToSequence(edge, a.id, 0);
  addToSequence(edge, b.id, 0);
  const edgeCourse = courseFromDocument(edge);
  const edgeRace = raceFromCourse(edgeCourse);
  const eg = edgeRace.gates[0];
  const eap = eg.apertures[0];
  const cy = eg.y + eap.centreY;
  /* A line through the opening 5 cm inside the left stile, along travel.
   * The old test shrank the hole by the craft radius and this missed. */
  const inset = eap.clearW * 0.5 - 0.05;
  const prev = {
    x: eg.x + eg.ax.x * inset - eg.az.x * 2,
    y: cy - eg.az.y * 2,
    z: eg.z + eg.ax.z * inset - eg.az.z * 2,
  };
  const curr = {
    x: eg.x + eg.ax.x * inset + eg.az.x * 2,
    y: cy + eg.az.y * 2,
    z: eg.z + eg.ax.z * inset + eg.az.z * 2,
  };
  const edgeHit = edgeRace.update(prev, curr, 10, 10);
  check('a line through the opening near the stile still registers', edgeHit.passed != null,
    `passed ${edgeHit.passed}`);
}

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
  suiteElementCounts();
  suiteFaces();
  suitePath();
  suiteGuide();
  suiteWarnings();
  suiteHistory();
  suiteSequenceNaming();
  suiteFigures();
  suiteFlaggedGate();
  suiteFlaggedDoubleStack();
  suiteScoring();
  suiteWaypoint();
  suiteSchemaDoc();
  suiteListing();
  suiteBranding();
  suiteFlagShape();
  suiteStartBlock();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
