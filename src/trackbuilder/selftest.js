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
  createTrack, createElement, createSequenceEntry, deserialize, elementById, normalize, isSequenceable,
  roundTripsCleanly, serialize, aperturesOf, toPlain, startPadsOf, newElementId,
  logoForDecal, dressOrder, LOGO_SLOTS, SCHEMA_VERSION,
  SCENE_TIMES, SCENE_GROUNDS, SCENE_DEFAULT, sceneOf, deepClone, setSideBuilt,
} from './model.js';
import { applyAutoFaces, flipFace, setYaw, clearOverride, travelDirection } from './faces.js';
import {
  addToSequence, addNextLevel, sequenceLabel, faceLabel, bendIndexFor, bendLineAt, gateNumbers,
  neighboursOf, pinFacesAt, sequenceNumbers, removeElement,
} from './sequence.js';
import { applyFigure, matchingFigure, defaultFigure, upgradeStackedFigures } from './figures.js';
import {
  buildPath, elevationProfile, sequencedElementCount, knotForSeq, markerSquare, passYawOf,
} from './path.js';
import { collectWarnings, freestyleReport, FREESTYLE_SOLIDS_MAX } from './warnings.js';
import { History } from './history.js';
import {
  RAD, DEG, wrapAngle, gateSupportFeet, apertureFrame, GATE_POST_R_SCALE,
} from './geometry.js';
import { FRAME_SIDES, frameSidesOf, hasMissingSides, unbuiltSidesOf } from './elements.js';
import { PRESETS } from './presets.js';
import { ELEMENTS, PALETTE_ORDER, GATE_FLAG_H, flagSideOf, flagSideSigns, elementByKey, elementHeight,
  virtualApertureDims, countElementsByType, formatElementCounts,
  GATE_PRESETS, applyGatePreset, matchingGatePreset, levelPitchFor, FRAME_TUBE_OD,
  KIND, FREESTYLE_PALETTE_ORDER, PALETTE_EXTRA, paletteItems, docModeOf, isTrafficType,
  TUNING, tuningFor, ROAD_NODES_MAX,
} from './elements.js';
import {
  boardPlanOf, planShapeOf, snapYaw, turnsOf,
} from './view2d.js';
import { starterMap } from '../maps/built/starter.js';
import { PROP_TYPES, GAP_POINTS, FURNITURE_PALETTE, CAR_STYLES } from '../props/types.js';
import { partsOf } from '../props/catalog.js';
import { GAP_MIN } from '../props/parts.js';
import { startBlockDims, startBlockHeight, startBlockLaneOffset } from '../art/startblock.js';
import { padsLayout } from '../props/course.js';
import { placeDocument, topUnder, groundUnder, SUPPORT_TIE } from '../maps/built/place.js';
import { roadOf, nearestOn } from '../maps/built/road.js';
import { trafficOf, DRIFT } from '../maps/built/traffic.js';
import {
  addDraftNode, closesDraft, endsDraft, roadFromDraft, legCount, legMidpoints, insertNode, moveNode, deleteNode,
  pickNode, pickLeg, snapToRoad, vehiclePlace, PARK, bodiesOverlap, moduleRoad, laneXyz, lapTable, laneClashes,
} from './roadtool.js';
import { CLASH_HORIZON } from './warnings.js';
import { clubhouseSolids } from '../art/clubhouse.js';
import { BANNER_SIZE, flagMast, flagSailProfile } from '../art/banners.js';
import { courseFromDocument } from '../game/trackdoc.js';
import { GUIDE, guideFromKnots, knotsFromPath, tessellateGuide } from '../game/guide.js';
import { GATE_SCALE, MICRO_SCALE } from '../game/track.js';
import { PRACTICE_LAPS, Race, runComplete } from '../game/race.js';
import { LapVoice, lapCall, pickVoice } from '../render/voice.js';
import {
  Colliders, hitOutcome, groundOutcome, GROUND_LAND, GROUND_BOUNCE, GROUND_CRASH,
  GROUND_TUMBLE, GROUND_SLIDE, canPerch, shouldScorePass, shouldEnterTurtle,
  shouldExitTurtle, shouldParkTurtle, uprightPlantQuat, contactMaterial,
  PROP_PLANE_MAX_UP_DOT, BOUNCE_SPEED_MAX, GRAZE_SPEED_MAX,
  LAND_DESCENT_MAX, LAND_HORIZONTAL_MAX, LAND_TILT_MAX_DEG, LAND_TILT_HARD_DEG,
  LAND_TIP_SPEED_MAX, PERCH_SPEED, PERCH_RATE, TURTLE_SPEED, TURTLE_RATE,
  TURTLE_EXIT_UPZ, TURTLE_STICK_MIN, TURTLE_WAIT_RATE, TURTLE_FLIP_MS, turtleLift,
  TURTLE_INVERT_UPZ, turtleClearance, turtleFlipEase, turtleFlipLift, turtleSlerpQuat,
  makeClipWatch, clipWatchTick, CLIP_CENTER_EPS, CLIP_CONFIRM_MS, CLIP_DEEP,
  STUCK_UNRESOLVED_MS, STUCK_TRAVEL_MAX, BURIED_DEPTH, BURIED_CONFIRM_MS,
  CLIP_CRASH_HOLD_MS, BOUNCE_SEPARATION, CLIP_SPAWN_GRACE_MS,
  setCraftAirframe, dirtClearance, craftVerticalOffset, craftVerticalHalf,
  findRestSpot, restSpotAt, CRAFT_WORLD_R, CRASH_UNDERSIDE_NZ, CRASH_BELLY_UP,
  bodyUpDotWorld, solidContactCrash,
} from '../game/collide.js';
import { sincos } from '../props/trig.js';
import { AIRFRAMES, airframeById } from '../../configs/airframes.js';
import {
  inspectCourse, layoutFingerprint, publishCurrentCourse, publishedTags, rememberPublish,
  suggestRemixName, tagsToSend,
} from '../share/listing.js';
import { readBind, readEditKey, writeBind } from '../share/session.js';
import { publishTrack } from '../share/board.js';
import { keepDisplaced, readAutosave } from './storage.js';
import { FPV_FLOOR_CLEAR, FPV_NEAR_CLEAR, fpvLensClear } from '../render/lens.js';

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
 * How many times the drawn line, having left an opening along its tangent,
 * comes back across that opening's plane inside the clear rectangle.
 */
function backThroughOpening(path, el, apertureIndex = 0) {
  const knot = path.knots.find((k) => k.role === 'aperture' && k.elementId === el.id
    && (k.seq?.apertureIndex ?? 0) === apertureIndex);
  if (!knot || path.samples.length < 2) {
    return 0;
  }
  const ap = aperturesOf(el)[apertureIndex] ?? aperturesOf(el)[0];
  const f = apertureFrame(el.yaw, el.pitch);
  const c = knot.pos;
  const fwd = knot.tangent;
  const dotp = (p, q) => p.x * q.x + p.y * q.y + p.z * q.z;
  const rel = (p) => ({ x: p.x - c.x, y: p.y - c.y, z: p.z - c.z });
  let prev = path.samples[0].pos;
  let prevD = dotp(rel(prev), fwd);
  let left = prevD > 0.02;
  let n = 0;
  for (let i = 1; i < path.samples.length; i += 1) {
    const p = path.samples[i].pos;
    const d = dotp(rel(p), fwd);
    if (d > 0.02) {
      left = true;
    }
    if (left && prevD > 0 && d < 0) {
      const s = prevD / (prevD - d);
      const x = {
        x: prev.x + (p.x - prev.x) * s,
        y: prev.y + (p.y - prev.y) * s,
        z: prev.z + (p.z - prev.z) * s,
      };
      const u = dotp(rel(x), f.widthAxis);
      const v = dotp(rel(x), f.heightAxis);
      if (Math.abs(u) <= ap.clearW / 2 && Math.abs(v) <= ap.clearH / 2) {
        n += 1;
      }
    }
    prev = p;
    prevD = d;
  }
  return n;
}

/*
 * The worked example, and the track schema.md documents field by field.
 *
 * It is deliberately the awkward case the task names: ten sequenced entries
 * including a ladder flown at two different levels with two different faces,
 * a dive gate flown downward, and a flag turn, plus a barrier the line has to
 * miss, a label, and start pads that mark the grid. The lap closes at the
 * first sequenced element, not at the pads.
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
  const stacks = formatElementCounts([{ type: 'containers', label: ELEMENTS.containers.label, count: 7 }]);
  check('a label that is plural already is not pluralised again', stacks === '7 containers', stacks);

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

  check('every sequence entry produced a knot, plus a closing knot at the first element',
    path.knots.length === doc.sequence.length + 1,
    `${path.knots.length} knots for ${doc.sequence.length} entries`);
  check('the lap is a circuit because start pads exist', path.closed === true);
  const pads = startPadsOf(doc);
  check('no knot sits on the start pads',
    pads && path.knots.every((k) => k.elementId !== pads.id
      && Math.hypot(k.pos.x - pads.position.x, k.pos.y - pads.position.y) > 0.4),
    path.knots.map((k) => `${k.role}:${k.elementId}`).join(','));
  check('the closing knot is a copy of the first sequenced element',
    path.knots[path.knots.length - 1].role === 'finish'
    && path.knots[path.knots.length - 1].elementId === path.knots[0].elementId);
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

/*
 * THE STEERING PASS, IN BOTH CLASSES.
 *
 * avoidForeignApertures in path.js puts a knot outside any opening the
 * Hermite would otherwise fly through uninvited. On the field it has done
 * that since the tracks that ship were found flying clean through gates
 * they were not scoring. In a RaceGOW room it does nothing, because the
 * animations those tracks are read off cross their own openings all the
 * time, and the twelve steering knots it put on Track 7 folded the line
 * to a 2 mm radius. Neither half had a check. This is the layout that
 * trips it: three gates in a row along their own travel axis, the outer
 * two sequenced and the middle one not, so the straight line between the
 * two passes dead through the third.
 */
function suiteSteering() {
  console.log('\nsteering round a gate the lap does not score');
  const layout = (cls, pitch) => {
    const doc = createTrack('Steer', cls);
    const a = place(doc, 'gate', -pitch, 0);
    const c = place(doc, 'gate', 0, 0);
    const b = place(doc, 'gate', pitch, 0);
    doc.sequence.push(createSequenceEntry(doc, a.id, 0));
    doc.sequence.push(createSequenceEntry(doc, b.id, 0));
    return { doc, c };
  };
  /* Where the line crosses the middle gate's plane, x = 0: how far from
   * the opening's centre it is there, across and up. */
  const crossings = (path, c) => {
    const cz = (c.position.z || 0) + c.dims.sillH + c.dims.clearH / 2;
    const out = [];
    for (let i = 1; i < path.samples.length; i += 1) {
      const p = path.samples[i - 1].pos;
      const q = path.samples[i].pos;
      if ((p.x < 0) === (q.x < 0)) {
        continue;
      }
      const t = p.x / (p.x - q.x);
      out.push({
        across: Math.abs(p.y + (q.y - p.y) * t),
        up: Math.abs(p.z + (q.z - p.z) * t - cz),
      });
    }
    return out;
  };
  const inside = (x, c) => x.across < c.dims.clearW / 2 && x.up < c.dims.clearH / 2;

  {
    const { doc, c } = layout('full', 10);
    const path = buildPath(doc);
    const wraps = path.knots.filter((k) => k.role === 'wrap');
    check('on the field, a line through an unscored gate gets a steering knot',
      wraps.length >= 1, `${path.knots.length} knots, ${wraps.length} steering`);
    check('the steering knot is nobody\'s station',
      wraps.every((k) => k.seq === null && k.elementId === null));
    check('and it stands outside the opening it was steered out of',
      wraps.every((k) => Math.abs(k.pos.y) > c.dims.clearW / 2),
      wraps.map((k) => k.pos.y.toFixed(3)).join(','));
    const xs = crossings(path, c);
    check('so the line crosses that gate\'s plane outside its frame',
      xs.length > 0 && xs.every((x) => !inside(x, c)),
      xs.map((x) => `${x.across.toFixed(2)} across, ${x.up.toFixed(2)} up`).join('; ') || 'no crossing');
  }
  {
    const { doc, c } = layout('micro', 2);
    const path = buildPath(doc);
    const wraps = path.knots.filter((k) => k.role === 'wrap');
    check('in a RaceGOW room the same layout gets no steering knot',
      wraps.length === 0 && path.knots.length === 2,
      `${path.knots.length} knots, ${wraps.length} steering`);
    const xs = crossings(path, c);
    check('and the line flies through the unscored opening, as the animations do',
      xs.length === 1 && inside(xs[0], c),
      xs.map((x) => `${x.across.toFixed(3)} across, ${x.up.toFixed(3)} up`).join('; ') || 'no crossing');
  }
}

/*
 * ONCE THROUGH A GATE, ON TO THE NEXT ONE.
 *
 * Green is the entry face. After the line has left through the gate, the
 * run to the next gate must not come back through that same opening from
 * the red side. A face locked pointing away from the next gate is the case
 * that used to do it: the curve shoots out along the tangent and folds
 * back through the hole. The fold on a whoop gate is shorter than one
 * sample step, which is how the first cut of this rule missed it, and a
 * dead-centre fold is equally near the top and the side, which is how the
 * same cut sent the knot through the floor.
 */
function suiteWrongWay() {
  console.log('\nonce through a gate, on to the next');

  const locked = (cls, ax, ay, bx, by) => {
    const doc = createTrack('Wrong way', cls);
    const a = place(doc, 'gate', ax, ay, { yaw: 0 });
    const b = place(doc, 'gate', bx, by, { yaw: Math.PI });
    a.yawOverridden = true;
    b.yawOverridden = true;
    for (const el of [a, b]) {
      const s = createSequenceEntry(doc, el.id, 0);
      s.entry = 1;
      s.overridden = true;
      doc.sequence.push(s);
    }
    return { doc, a, b };
  };

  const steered = (label, cls, ax, ay, bx, by) => {
    const { doc, a, b } = locked(cls, ax, ay, bx, by);
    const path = buildPath(doc);
    const wraps = path.knots.filter((k) => k.role === 'wrap' && k.elementId === null);
    check(`${label}: the line does not come back through the gate`,
      path.samples.length > 2 && backThroughOpening(path, a) === 0,
      `${backThroughOpening(path, a)} returns`);
    check(`${label}: it goes around the frame instead`,
      wraps.length >= 1 && wraps.every((k) => Math.abs(k.pos.y - a.position.y) > a.dims.clearW / 2),
      wraps.map((k) => `${k.pos.y.toFixed(2)}`).join(',') || 'no knot');
    check(`${label}: and the knot stays above the floor`,
      path.samples.every((smp) => smp.pos.z >= -1e-6),
      `lowest ${Math.min(...path.samples.map((smp) => smp.pos.z)).toFixed(3)} m`);
    check(`${label}: the next gate is still the end of the line`,
      path.knots[path.knots.length - 1].elementId === b.id);
  };

  steered('full, next gate behind', 'full', 20, 20, 14, 21);
  steered('full, next gate dead behind', 'full', 20, 20, 14, 20);
  steered('whoop, next gate behind', 'micro', 2, 2, 0.4, 2.3);
  steered('whoop, next gate dead behind', 'micro', 3, 2.5, 0.5, 2.5);

  {
    const doc = createTrack('Straight', 'full');
    const a = place(doc, 'gate', 10, 20);
    const b = place(doc, 'gate', 20, 20);
    addToSequence(doc, a.id, 0);
    addToSequence(doc, b.id, 0);
    const path = buildPath(doc);
    const wraps = path.knots.filter((k) => k.role === 'wrap');
    check('a gate that faces the next one grows no steering knot',
      wraps.length === 0 && backThroughOpening(path, a) === 0,
      `${wraps.length} knots, ${backThroughOpening(path, a)} returns`);
  }

  {
    /* The second pass of this same opening is the next gate. The figure
     * already wraps beside the frame. This rule must not add another knot
     * on top of that, and both passes stay stations. */
    const doc = createTrack('Twice', 'full');
    const a = place(doc, 'gate', 20, 20, { yaw: 0 });
    a.yawOverridden = true;
    const first = createSequenceEntry(doc, a.id, 0);
    first.entry = 1;
    first.overridden = true;
    const second = createSequenceEntry(doc, a.id, 0);
    second.entry = -1;
    second.overridden = true;
    doc.sequence.push(first, second);
    const path = buildPath(doc);
    const steering = path.knots.filter((k) => k.role === 'wrap' && k.elementId === null);
    const passes = path.knots.filter((k) => k.role === 'aperture' && k.elementId === a.id);
    check('a second pass of the same opening is not steered away',
      steering.length === 0 && passes.length === 2,
      `${steering.length} steering knots, ${passes.length} passes`);
  }
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
  /* Second ladder pass is at the end, not consecutive with the first, so
   * the figure does not wrap the stack. The gate between them faces away
   * from that second pass, and the line goes around the gate instead of
   * coming back through it. */
  const between = buildPath(skipped);
  const onStack = between.knots.filter((k) => k.role === 'wrap' && k.elementId === lad.id);
  const around = between.knots.filter((k) => k.role === 'wrap' && k.elementId === null);
  check('a stack flown twice with a gate between does not wrap the stack',
    onStack.length === 0, `${onStack.length} stack wraps`);
  check('the gate between faces away from the next pass, so the line goes around it',
    around.length >= 1 && backThroughOpening(between, b) === 0,
    `${around.length} steering, ${backThroughOpening(between, b)} returns`);
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
  check('and both pennants lean outboard', st && st.flagLeans.join(',') === '-1,1',
    st ? st.flagLeans.join(',') : 'missing');

  /*
   * ON TOP: one mast on the CENTRE of the header, which is the placement
   * the three end choices had no way to say. The sign is zero, a position
   * and not a direction, so the lean is carried separately or the cloth and
   * the collider disagree about which way the flag hangs.
   */
  const topDoc = createTrack();
  const topG = place(topDoc, 'flaggedGate', 10, 10);
  topG.flagSide = 'top';
  addToSequence(topDoc, topG.id, 0);
  check('top is one mast', flagSideSigns(flagSideOf(topG)).join(',') === '0');
  check('and it stands on the centre of the header',
    flagSideSigns(flagSideOf(topG))[0] === 0);
  check('top round trips',
    deserialize(serialize(topDoc)).doc.elements[0].flagSide === 'top');
  const topSt = courseFromDocument(topDoc).structures.find((x) => x.type === 'flaggedGate');
  check('the field builds the centre mast', topSt && topSt.flagSigns.join(',') === '0',
    topSt ? topSt.flagSigns.join(',') : 'missing');
  check('and it leans to the right, not nowhere', topSt && topSt.flagLeans.join(',') === '1',
    topSt ? topSt.flagLeans.join(',') : 'missing');

  /* The mast height is the author's now, not a constant. */
  const tallDoc = createTrack();
  const tall = place(tallDoc, 'flaggedGate', 4, 4, { dims: { flagH: 2.6 } });
  addToSequence(tallDoc, tall.id, 0);
  const tallSt = courseFromDocument(tallDoc).structures.find((x) => x.type === 'flaggedGate');
  check('an authored mast height reaches the field',
    tallSt && Math.abs(tallSt.flagH - 2.6 * GATE_SCALE) < 1e-6,
    tallSt ? String(tallSt.flagH) : 'missing');
  check('and it raises the element height by the same amount',
    Math.abs(elementHeight(ELEMENTS.flaggedGate, tall.dims)
      - elementHeight(ELEMENTS.flaggedGate, { ...tall.dims, flagH: GATE_FLAG_H })
      - (2.6 - GATE_FLAG_H)) < 1e-6);
  /* A document written before flagH existed still builds a 1.45 m mast. */
  const oldDoc = normalize({
    schemaVersion: 2,
    elements: [{
      id: 'el-1', type: 'flaggedGate', position: { x: 5, y: 5, z: 0 }, flagSide: 'top',
      dims: { levels: 1, sillH: 0, clearW: 1.524, clearH: 1.524, levelPitch: 1.5574 },
    }],
    sequence: [{ id: 'sq-1', elementId: 'el-1', apertureIndex: 0, entry: 1 }],
  });
  const oldSt = courseFromDocument(oldDoc.doc).structures.find((x) => x.type === 'flaggedGate');
  check('a document with no flagH still gets the default mast',
    oldSt && Math.abs(oldSt.flagH - GATE_FLAG_H * GATE_SCALE) < 1e-6,
    oldSt ? String(oldSt.flagH) : 'missing');
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
/*
 * The named opening sizes. They exist so an author does not type 1.524
 * twice per gate, so what has to hold is that they ARE the library's own
 * numbers, that applying one leaves the element otherwise alone, and that
 * the tool can tell which one a set of dimensions is.
 */
function suitePresets() {
  console.log('\ngate presets');
  const ids = GATE_PRESETS.map((p) => p.id).join(',');
  check('four presets, standard first', ids === 'standard,championship,whoop,trainer', ids);
  check('every preset carries a size and a hint',
    GATE_PRESETS.every((p) => p.label && p.size && p.hint));
  check('three of them claim to be published, the trainer does not',
    GATE_PRESETS.filter((p) => p.published).length === 3
    && GATE_PRESETS.find((p) => p.id === 'trainer').published === false);

  /* The standard preset IS the library's default gate, not a second copy
   * of 1.524 that could drift from it. */
  check('standard matches the default gate exactly',
    matchingGatePreset(ELEMENTS.gate.dims)?.id === 'standard');
  check('championship matches the default dive gate',
    matchingGatePreset(ELEMENTS.diveGate.dims)?.id === 'championship');

  const doc = createTrack();
  const lad = place(doc, 'ladder', 5, 5);
  const wasLevels = lad.dims.levels;
  const wasSill = lad.dims.sillH;
  const champ = GATE_PRESETS.find((p) => p.id === 'championship');
  applyGatePreset(lad.dims, champ);
  check('a preset sets the opening', Math.abs(lad.dims.clearW - champ.clearW) < 1e-9
    && Math.abs(lad.dims.clearH - champ.clearH) < 1e-9);
  check('and the level spacing follows the opening height',
    Math.abs(lad.dims.levelPitch - levelPitchFor(champ.clearH)) < 1e-9,
    `${lad.dims.levelPitch} vs ${levelPitchFor(champ.clearH)}`);
  check('and it leaves the stack a stack',
    lad.dims.levels === wasLevels && lad.dims.sillH === wasSill);
  check('the tool can name the size it just set',
    matchingGatePreset(lad.dims)?.id === 'championship');
  lad.dims.clearW += 0.4;
  check('a size somebody typed is not a preset', matchingGatePreset(lad.dims) === null);

  /* Every library default sits on a derived spacing, which is what makes
   * the inspector's follow-the-height rule safe to apply. */
  for (const def of Object.values(ELEMENTS)) {
    if (def.dims.levelPitch == null) {
      continue;
    }
    check(`${def.id} has a derived level spacing`,
      Math.abs(def.dims.levelPitch - levelPitchFor(def.dims.clearH)) < 1e-6,
      `${def.dims.levelPitch} vs ${levelPitchFor(def.dims.clearH)}`);
  }
}

/*
 * WHAT ENDS A RUN. The rule is a prop strike and nothing else, so these
 * checks are written as the owner's sentences rather than as coverage of
 * the branches: bounce off stuff as much as you like, crash only on the
 * props, hit with the base and bounce or perch.
 *
 * This lives in the builder's selftest because it is the only Node runnable
 * suite in the repository and collide.js imports cleanly here. The flight
 * harness is the plant's and this is not plant.
 */
function suiteCrashRule() {
  console.log('\ncrash rule');

  /* Belly on, at any speed at all. The frame takes it. */
  for (const closing of [1, 10, 25, 60]) {
    check(`belly on at ${closing} m/s bounces`,
      hitOutcome('gate', closing, 1.0) === 'bounce' || hitOutcome('gate', closing, 1.0) === 'hard');
  }
  check('and so does a contact just off the belly',
    hitOutcome('gate', 40, PROP_PLANE_MAX_UP_DOT) === 'hard'
    || hitOutcome('gate', 40, PROP_PLANE_MAX_UP_DOT) === 'bounce');

  /* Edge on, in the disc plane. Every hit is a bounce. 'hard' is OSD. */
  check('edge on at a racing clip still bounces',
    hitOutcome('gate', BOUNCE_SPEED_MAX - 0.1, 0) === 'bounce');
  check('edge on at the strike speed is a hard bounce, not a wreck',
    hitOutcome('gate', BOUNCE_SPEED_MAX, 0) === 'hard');
  check('a train is a hard bounce however you meet it',
    hitOutcome('train', 1, 1.0) === 'hard');
  check('and an untaught caller gets the hard reading past the threshold',
    hitOutcome('gate', BOUNCE_SPEED_MAX + 5) === 'hard');
  check('nothing returns crash any more',
    hitOutcome('gate', 80, 0) !== 'crash' && hitOutcome('train', 40, 0) !== 'crash');

  /* THE HIT COUNT IS GONE. Fifty firm contacts in a row, none of them a
   * wreck, and every one of them still flies on: "as much as i like". */
  let bounced = 0;
  for (let i = 0; i < 50; i += 1) {
    if (hitOutcome('gate', 12, 0) === 'bounce') {
      bounced += 1;
    }
  }
  check('fifty firm contacts, fifty bounces', bounced === 50, `${bounced}`);

  /* The ground. Perch, skip, tumble. None of them is a lockout. */
  check('a gentle arrival perches',
    groundOutcome(1.0, 1.0, 0) === GROUND_LAND);
  check('the perch envelope is the slow, upright one',
    groundOutcome(PERCH_SPEED - 0.01, 0, 0) === GROUND_LAND
    && groundOutcome(PERCH_SPEED + 0.01, 0, 0) === GROUND_SLIDE);
  check('arriving flat and hard SLIDES rather than wrecking',
    groundOutcome(LAND_DESCENT_MAX + 2, 0, 0) === GROUND_BOUNCE
    && GROUND_BOUNCE === GROUND_SLIDE);
  check('and so does arriving flat and fast across the ground',
    groundOutcome(0, LAND_HORIZONTAL_MAX + 5, 0) === GROUND_BOUNCE);
  check('a blade down with speed behind it is a tumble you fly out of',
    groundOutcome(0, LAND_TIP_SPEED_MAX + 1, LAND_TILT_MAX_DEG + 1) === GROUND_CRASH
    && GROUND_CRASH === GROUND_TUMBLE);
  check('a blade down while crawling is still a perch',
    groundOutcome(0.2, 0.2, LAND_TILT_MAX_DEG + 1) === GROUND_LAND);
  check('arriving on its side is a tumble at any speed',
    groundOutcome(0, 0, LAND_TILT_HARD_DEG + 1) === GROUND_CRASH);
  check('a very hard flat arrival is STILL not a wreck',
    groundOutcome(30, 30, 0) === GROUND_BOUNCE);

  check('the graze threshold is below the strike threshold',
    GRAZE_SPEED_MAX < BOUNCE_SPEED_MAX);

  check('canPerch is upright, slow, and quiet',
    canPerch(0, 0.5, 0.5) === true);
  check('canPerch refuses a bank past the blade-touch tilt',
    canPerch(LAND_TILT_MAX_DEG + 0.1, 0, 0) === false);
  check('canPerch refuses leftover bounce speed',
    canPerch(0, PERCH_SPEED + 0.01, 0) === false);
  check('canPerch refuses leftover rate',
    canPerch(0, 0, PERCH_RATE + 0.01) === false);

  /* The inverted examples below are -0.98, flat on the back, since the
   * plant tumbles a crash flat and the gate moved to meet it (2026-09-24,
   * TUMBLE FLAT in src/native/sim.c). They were -0.9 and -0.8, which are 25
   * and 37 degrees off flat: still tumbling, now, and not a turtle. */
  check('turtle latches when inverted, slow, and on the grass',
    shouldEnterTurtle(-0.98, 0.4, 0.4, true, 0.05, false) === true);
  check('turtle does not latch while still sliding fast',
    shouldEnterTurtle(-1, TURTLE_SPEED, 0, true, 0.05, false) === false);
  check('turtle does not latch while tumbling at rate',
    shouldEnterTurtle(-1, 0, TURTLE_RATE, true, 0.05, false) === false);
  check('turtle does not latch in the air with clearance',
    shouldEnterTurtle(-0.98, 0.2, 0.2, false, 1.2, false) === false);
  check('turtle latches from the seated halo: an inverted rest reports no contact',
    shouldEnterTurtle(-0.98, 0.2, 0.2, false, 0.10, false) === true);
  check('turtle does not latch at the halo edge without contact',
    shouldEnterTurtle(-0.98, 0.2, 0.2, false, turtleClearance(), false) === false);
  check('turtle does not latch on its side: that is still a tumble',
    shouldEnterTurtle(0.2, 0, 0, true, 0.05, false) === false);
  check('turtle does not latch at a 60 degree bank',
    shouldEnterTurtle(0.49, 0, 0, true, 0.05, false) === false);
  check('just past vertical is still a tumble, not turtle',
    shouldEnterTurtle(-0.2, 0, 0, true, 0.05, false) === false);
  check('a belly-up hull past the invert gate does latch',
    shouldEnterTurtle(TURTLE_INVERT_UPZ - 0.01, 0, 0, true, 0.05, false) === true);
  check('a hull shy of the invert gate does not latch',
    shouldEnterTurtle(TURTLE_INVERT_UPZ, 0, 0, true, 0.05, false) === false);
  /* Was "past vertical, about 110 degrees", between -0.3 and -0.5. The
   * owner's decision of 2026-09-24 is that a crash tumbles flat, always, and
   * a gate at 110 degrees latched the first slow millisecond of that tumble
   * and froze the craft where it was, pointing at the sky. */
  check('the invert gate is flat on the back, within about 18 degrees',
    TURTLE_INVERT_UPZ <= -0.94 && TURTLE_INVERT_UPZ > -1);
  check('30 degrees off flat on its back is still falling over, not turtle',
    shouldEnterTurtle(-0.87, 0, 0, true, 0.05, false) === false);
  check('turtle parks while waiting, sticks centered, and in contact',
    shouldParkTurtle(true, 0, 0.2, true) === true);
  check('turtle does not park without contact',
    shouldParkTurtle(true, 0, 0, false) === false);
  check('turtle does not park while the stick is past the poke gate',
    shouldParkTurtle(true, TURTLE_STICK_MIN, 0, true) === false);
  check('turtle does not latch during launch staging',
    shouldEnterTurtle(-1, 0, 0, true, 0.05, true) === false);
  check('turtle does not latch once the hull is upright',
    shouldEnterTurtle(0.9, 0, 0, true, 0.05, false) === false);
  check('turtle stays waiting while still inverted',
    shouldExitTurtle(-0.9) === false);
  check('a poke past the gate is enough, it does not have to match the mixer',
    TURTLE_STICK_MIN <= 0.08);
  check('turtle wait-rate is below the enter-rate so leftover tumble is not seated',
    TURTLE_WAIT_RATE < TURTLE_RATE);
  check('the scripted flip has a duration',
    TURTLE_FLIP_MS > 200 && TURTLE_FLIP_MS < 800);
  check('turtle flip ease is 0 at the start and 1 at the end',
    turtleFlipEase(0) === 0 && turtleFlipEase(1) === 1);
  check('turtle flip ease is a midpoint at half',
    Math.abs(turtleFlipEase(0.5) - 0.5) < 1e-12);
  check('turtle lift is zero at the ends so the hull sits on the grass',
    turtleFlipLift(0) === 0 && turtleFlipLift(1) === 0);
  check('turtle lift peaks at mid-flip above the arm radius',
    turtleFlipLift(0.5) === turtleLift() && turtleLift() > 0.15);
  const qS0 = turtleSlerpQuat(0, 1, 0, 0, 1, 0, 0, 0, 0);
  check('turtle slerp starts at the inverted pose',
    Math.abs(qS0[0]) < 1e-12 && Math.abs(qS0[1] - 1) < 1e-12);
  const qS1 = turtleSlerpQuat(0, 1, 0, 0, 1, 0, 0, 0, 1);
  check('turtle slerp ends upright',
    Math.abs(qS1[0] - 1) < 1e-12 && Math.abs(qS1[1]) < 1e-12);
  const qSMid = turtleSlerpQuat(0, 1, 0, 0, 1, 0, 0, 0, 0.5);
  check('turtle slerp midpoint is 90 degrees about x',
    Math.abs(Math.abs(qSMid[0]) - Math.SQRT1_2) < 1e-9
      && Math.abs(Math.abs(qSMid[1]) - Math.SQRT1_2) < 1e-9
      && Math.abs(qSMid[2]) < 1e-12 && Math.abs(qSMid[3]) < 1e-12);

  const qId = uprightPlantQuat(1, 0, 0, 0);
  check('an already upright pose stays identity',
    Math.abs(qId[0] - 1) < 1e-12 && qId[1] === 0 && qId[2] === 0 && qId[3] === 0);
  const qInv = uprightPlantQuat(0, 1, 0, 0);
  check('180 about x flattens to identity, not a degenerate heading',
    Math.abs(qInv[0] - 1) < 1e-9 && Math.abs(qInv[1]) < 1e-12
      && Math.abs(qInv[2]) < 1e-12 && Math.abs(qInv[3]) < 1e-12);
  const qYaw = uprightPlantQuat(Math.SQRT1_2, 0, 0, Math.SQRT1_2);
  check('a pure yaw is kept',
    Math.abs(qYaw[0] - Math.SQRT1_2) < 1e-9 && Math.abs(qYaw[3] - Math.SQRT1_2) < 1e-9
      && qYaw[1] === 0 && qYaw[2] === 0);
  const qFlip = uprightPlantQuat(0, 0, 1, 0);
  check('180 about y keeps the flipped heading',
    Math.abs(qFlip[0]) < 1e-9 && Math.abs(Math.abs(qFlip[3]) - 1) < 1e-9
      && qFlip[1] === 0 && qFlip[2] === 0);

  check('level flight keeps the small lens floor',
    fpvLensClear(0, 1) === FPV_FLOOR_CLEAR);
  check('camera down uses the near-plane band',
    fpvLensClear(-0.5, 0.8) === FPV_NEAR_CLEAR);
  check('inverted uses the near-plane band',
    fpvLensClear(0, -1) === FPV_NEAR_CLEAR);
  check('a high inverted look at the sky still names the near-plane band',
    fpvLensClear(0.4, -0.9) === FPV_NEAR_CLEAR);

  const grass = contactMaterial('none');
  const pvc = contactMaterial('gate');
  const bark = contactMaterial('tree');
  const train = contactMaterial('train');
  check('PVC is bouncier and slicker than bark',
    pvc.e > bark.e && pvc.mu < bark.mu);
  check('a train is the least bouncy solid',
    train.e < pvc.e && train.e < grass.e);

  const flat = () => 0;
  const airPass = {
    prev: { x: 0, y: 0.9, z: 2 },
    curr: { x: 0, y: 0.9, z: -2 },
  };
  check('a flown opening in the air still scores',
    shouldScorePass(airPass.prev, airPass.curr, {
      upz: 1, clearance: 0.9, hits: 0, heightAt: flat,
    }) === true);
  check('an inverted punch in the air still scores',
    shouldScorePass(airPass.prev, airPass.curr, {
      upz: -0.8, clearance: 5, hits: 0, heightAt: flat,
    }) === true);
  check('inverted on the grass in a gate opening does not score',
    shouldScorePass({ x: 0, y: 0.08, z: 1.2 }, { x: 0, y: 0.04, z: -1.2 }, {
      upz: -1, clearance: 0.05, hits: 1, heightAt: flat,
    }) === false);
  check('inverted on the grass with no hit flag still does not score',
    shouldScorePass({ x: 0, y: 0.08, z: 1.2 }, { x: 0, y: 0.04, z: -1.2 }, {
      upz: -1, clearance: 0.08, hits: 0, heightAt: flat,
    }) === false);
  check('a side tumble on the dirt does not score',
    shouldScorePass({ x: 0, y: 0.10, z: 1.2 }, { x: 0, y: 0.06, z: -1.2 }, {
      upz: 0.35, clearance: 0.06, hits: 1, heightAt: flat,
    }) === false);
  /*
   * THESE TWO USED TO ASSERT THE OPPOSITE, and the second used to be called
   * "an upright bounce frame with no hit flag still does not score", which is
   * the owner's case by name: "its ok to bounce of the floor through a gate".
   * Props up on the deck is flight, with or without the hit flag, which a
   * bounce drops for a frame anyway.
   */
  check('an upright touch on the floor through the hole scores',
    shouldScorePass({ x: 0, y: 0.05, z: 1.2 }, { x: 0, y: 0.045, z: -1.2 }, {
      upz: 1, clearance: 0.045, hits: 1, heightAt: flat,
    }) === true);
  check('an upright bounce frame with no hit flag scores too',
    shouldScorePass({ x: 0, y: 0.05, z: 1.2 }, { x: 0, y: 0.045, z: -1.2 }, {
      upz: 1, clearance: 0.045, hits: 0, heightAt: flat,
    }) === true);
  /* The band is still pinned to the millimetre, on the side of it where it
   * is still the decision: a craft ON ITS SIDE, in and just out of the dirt. */
  check('on its side just inside the dirt band does not score',
    shouldScorePass(airPass.prev, airPass.curr, {
      upz: 0.2, clearance: 0.219, hits: 0, heightAt: flat,
    }) === false);
  check('on its side just clear of the dirt band scores',
    shouldScorePass(airPass.prev, airPass.curr, {
      upz: 0.2, clearance: 0.221, hits: 0, heightAt: flat,
    }) === true);
  check('upright just inside the dirt band scores, because it is a bounce',
    shouldScorePass(airPass.prev, airPass.curr, {
      upz: 1, clearance: 0.219, hits: 0, heightAt: flat,
    }) === true);
  check('exactly at the tilt limit on the deck is still flight',
    shouldScorePass(airPass.prev, airPass.curr, {
      upz: 0.5, clearance: 0.10, hits: 1, heightAt: flat,
    }) === true);
  check('falling through the opening into the dirt does not score',
    shouldScorePass({ x: 0, y: 0.9, z: 1.2 }, { x: 0, y: -2, z: -1.2 }, {
      upz: -0.4, clearance: -2, hits: 0, heightAt: flat,
    }) === false);
  check('a dip onto the dirt mid segment does not score',
    shouldScorePass({ x: 0, y: 0.9, z: 1.2 }, { x: 0, y: 0.04, z: -1.2 }, {
      upz: -0.8, clearance: 0.9, hits: 0, heightAt: flat,
    }) === false);
  check('under a bridge the street is the floor and a flown pass still scores',
    shouldScorePass({ x: 0, y: 1.0, z: 1.2 }, { x: 0, y: 1.0, z: -1.2 }, {
      upz: 1, clearance: 1.0, hits: 0, heightAt: () => 0,
    }) === true);

  /*
   * THE DIRT BAND ON A WHOOP, which is the aircraft the band was never
   * measured for.
   *
   * Every check above runs with the five inch seated, and the first one here
   * pins that the five inch did not move when the band stopped being a flat
   * 0.22 m. The rest are the RaceGOW class: a 0.711 m opening with its bottom
   * bar on the floor, where a five inch's band declared the bottom 31 percent
   * of the hole to be dirt and silently refused every pass flown through it.
   *
   * The airframe is seated and put back, because setCraftAirframe is module
   * state and every check after this one expects the five inch.
   */
  check('the five inch band is still exactly the 0.22 m it always was',
    Math.abs(dirtClearance() - 0.22) < 1e-12, dirtClearance());
  const fiveDims = airframeById('5inch').dims;
  setCraftAirframe(airframeById('whoop65').dims);
  const whoopBand = dirtClearance();
  /*
   * IT IS THE FIVE INCH'S BAND NOW, AND THE GUARANTEE STILL HOLDS.
   *
   * This asked for a band a quarter of the five inch's, because the whoop was
   * a quarter of the aircraft. It is not any more: it flies the five inch's
   * plant, its dims ARE the five inch's, and so is its band.
   *
   * What the check was FOR survives, and that is what is asserted instead. The
   * defect was never the number, it was the number against the hole: 0.22 m
   * declared the bottom 31 percent of a 0.711 m opening to be dirt. A micro
   * course is built MICRO_SCALE times life size now, so the same 0.22 is 9
   * percent of a 2.4387 m opening, which is what a five inch has always had
   * on the field. Same promise, reached by making the room the right size for
   * the aircraft instead of the band the right size for the room.
   */
  const RACEGOW_OPENING_BUILT = 0.7112 * MICRO_SCALE;
  check('a whoop flies the five inch band, because it is a five inch',
    Math.abs(whoopBand - 0.22) < 1e-12, whoopBand);
  check('a whoop band leaves most of a RaceGOW opening as built scoring',
    whoopBand / RACEGOW_OPENING_BUILT < 0.10, whoopBand / RACEGOW_OPENING_BUILT);
  /* The low line through a ground gate, which is the line a whoop is for. */
  check('a whoop flying the low line through a ground gate scores',
    shouldScorePass({ x: 0, y: 0.10, z: 0.6 }, { x: 0, y: 0.10, z: -0.6 }, {
      upz: 1, clearance: 0.10, hits: 0, heightAt: flat,
    }) === true);
  check('a whoop at the height a five inch band called dirt scores',
    shouldScorePass({ x: 0, y: 0.15, z: 0.6 }, { x: 0, y: 0.15, z: -0.6 }, {
      upz: 1, clearance: 0.15, hits: 0, heightAt: flat,
    }) === true);
  /* And the accidents the band exists to refuse are still refused. */
  /* The owner's case, on the aircraft it was reported on: a whoop skipping off
   * the floor and out through a ground gate is a pass. */
  check('a whoop bouncing off the floor through a gate scores',
    shouldScorePass({ x: 0, y: 0.03, z: 0.6 }, { x: 0, y: 0.018, z: -0.6 }, {
      upz: 1, clearance: 0.018, hits: 1, heightAt: flat,
    }) === true);
  /* And the accidents the predicate exists for are still refused, on a band
   * a whoop's own size rather than a five inch's. */
  check('a whoop on its side on the floor still does not score',
    shouldScorePass({ x: 0, y: 0.03, z: 0.6 }, { x: 0, y: 0.02, z: -0.6 }, {
      upz: 0.1, clearance: 0.02, hits: 1, heightAt: flat,
    }) === false);
  check('a whoop inverted on the floor still does not score',
    shouldScorePass({ x: 0, y: 0.05, z: 0.6 }, { x: 0, y: 0.04, z: -0.6 }, {
      upz: -1, clearance: 0.04, hits: 1, heightAt: flat,
    }) === false);
  /* Just clear of the band, which is 0.22 m of a 2.44 m opening: 9 percent up
   * the hole, the same place in it 0.09 was when the opening was 0.711. */
  check('a whoop on its side just clear of its own band still scores',
    shouldScorePass({ x: 0, y: 0.25, z: 0.6 }, { x: 0, y: 0.25, z: -0.6 }, {
      upz: 0.1, clearance: 0.25, hits: 0, heightAt: flat,
    }) === true);
  /*
   * THE TURTLE HALO AND THE FLIP HOP, on the same aircraft and for the same
   * reason. Both were flat five inch lengths: a 0.15 m halo called a whoop
   * seated while it was 14 cm up, which is a RaceGOW gate's height in the
   * air, and a 0.18 m hop threw it most of an opening upward to right
   * itself. Neither could MISS a gate, which is why Round 44 left them
   * alone and said so; they are here now because the owner asked.
   */
  const whoopHalo = turtleClearance();
  check('a whoop flies the five inch halo, because it is a five inch',
    Math.abs(whoopHalo - 0.15) < 1e-12, whoopHalo);
  check('a whoop halo is inside a RaceGOW opening as built\'s bottom tenth',
    whoopHalo / RACEGOW_OPENING_BUILT < 0.10, whoopHalo / RACEGOW_OPENING_BUILT);
  check('a whoop inverted on the floor still latches turtle',
    shouldEnterTurtle(-0.98, 0.2, 0.2, false, 0.02, false) === true);
  /* 0.35 m up is 10 cm of the picture, which is what this always asked: a
   * machine a RaceGOW gate's height in the air is flying, not seated. */
  check('a whoop inverted a gate\'s height up is still flying, not seated',
    shouldEnterTurtle(-0.98, 0.2, 0.2, false, 0.10 * MICRO_SCALE, false) === false);
  const whoopHop = turtleLift();
  check('a whoop flies the five inch hop, because it is a five inch',
    Math.abs(whoopHop - 0.18) < 1e-12, whoopHop);
  check('a whoop hop is bigger than the aircraft and smaller than a gate',
    whoopHop > 2 * airframeById('whoop65').dims.vHalfUp
      && whoopHop < RACEGOW_OPENING_BUILT / 4,
    `${whoopHop} between ${2 * airframeById('whoop65').dims.vHalfUp} and ${RACEGOW_OPENING_BUILT / 4}`);

  setCraftAirframe(fiveDims);
  check('the five inch is seated again for everything below',
    Math.abs(dirtClearance() - 0.22) < 1e-12, dirtClearance());
  check('and its turtle halo and hop are the flat numbers they always were',
    Math.abs(turtleClearance() - 0.15) < 1e-12 && Math.abs(turtleLift() - 0.18) < 1e-12,
    `${turtleClearance()} ${turtleLift()}`);

  const timing = new Race([{
    position: { x: 0, y: 0, z: 0 },
    heading: 0,
    pitch: 0,
    flyOrder: 0,
    apertures: [{ centreY: 2.5, clearW: 3.5, clearH: 5.0 }],
    aperture: { centreY: 2.5, clearW: 3.5, clearH: 5.0 },
  }]);
  const airSeg = { prev: { x: 0, y: 0.9, z: 2 }, curr: { x: 0, y: 0.9, z: -2 } };
  const dirtSeg = { prev: { x: 0, y: 0.08, z: 2 }, curr: { x: 0, y: 0.04, z: -2 } };
  timing.update(airSeg.prev, airSeg.curr, 10, 10);
  check('the first flown pass starts the clock, it does not finish a lap',
    timing.lap === 0 && timing.lapStartMs != null);
  const dirtAllow = shouldScorePass(dirtSeg.prev, dirtSeg.curr, {
    upz: -1, clearance: 0.05, hits: 1, heightAt: flat,
  });
  const dirtRes = timing.update(dirtSeg.prev, dirtSeg.curr, 20, 20, dirtAllow);
  check('inverted dirt through the timing hole is not a pass',
    dirtAllow === false && dirtRes.passed == null && timing.lap === 0);
  const later = timing.update(airSeg.prev, airSeg.curr, 30, 30, true);
  check('a later flown pass still completes the lap',
    later.passed != null && timing.lap === 1);
  check('one completed lap is what a 1-lap run would finish on, and only after a flown pass',
    timing.lap === 1 && timing.log.length === 1 && timing.log[0].ms != null);

  const three = new Race([{
    position: { x: 0, y: 0, z: 0 },
    heading: 0,
    pitch: 0,
    flyOrder: 0,
    apertures: [{ centreY: 2.5, clearW: 3.5, clearH: 5.0 }],
    aperture: { centreY: 2.5, clearW: 3.5, clearH: 5.0 },
  }]);
  const runLaps = 3;
  three.update(airSeg.prev, airSeg.curr, 10, 10);
  three.update(airSeg.prev, airSeg.curr, 20, 20);
  check('lap 1 of 3 is not the finished-track screen',
    three.lap === 1 && !runComplete(three.lap, runLaps));
  const midDirt = shouldScorePass(dirtSeg.prev, dirtSeg.curr, {
    upz: -1, clearance: 0.05, hits: 0, heightAt: flat,
  });
  three.update(dirtSeg.prev, dirtSeg.curr, 30, 30, midDirt);
  check('inverted dirt mid run does not steal a lap on a 3-lap race',
    midDirt === false && three.lap === 1 && !runComplete(three.lap, runLaps));
  three.update(airSeg.prev, airSeg.curr, 40, 40);
  check('lap 2 of 3 is still not the results screen',
    three.lap === 2 && !runComplete(three.lap, runLaps));
  three.update(airSeg.prev, airSeg.curr, 50, 50);
  check('only the third flown lap would finish a 3-lap run',
    three.lap === 3 && runComplete(three.lap, runLaps));
  check('and the counted runs end where they always did: 1 of 1, 5 of 5, not 4 of 5',
    runComplete(1, 1) && runComplete(5, 5) && !runComplete(4, 5) && !runComplete(0, 1));

  /*
   * PRACTICE, the launch card's fourth lap count: the same laps flown the
   * same way, and none of them is ever the last one. Twelve is past every
   * counted run, so a practice that fell back on any of them would show.
   */
  const practice = new Race([{
    position: { x: 0, y: 0, z: 0 },
    heading: 0,
    pitch: 0,
    flyOrder: 0,
    apertures: [{ centreY: 2.5, clearW: 3.5, clearH: 5.0 }],
    aperture: { centreY: 2.5, clearW: 3.5, clearH: 5.0 },
  }]);
  practice.update(airSeg.prev, airSeg.curr, 10, 10);
  let practiceOver = false;
  for (let k = 1; k <= 12; k += 1) {
    const t = 10 + k * 1000;
    practice.update(airSeg.prev, airSeg.curr, t, t);
    practiceOver = practiceOver || runComplete(practice.lap, PRACTICE_LAPS);
  }
  check('practice never finishes a run, twelve laps in',
    practice.lap === 12 && practice.laps.length === 12 && !practiceOver,
    `lap ${practice.lap}, over ${practiceOver}`);
  check('and every practice lap is timed and called out like a counted one',
    practice.lastLapMs === 1000 && practice.flashText(12010) === 'Lap 12   1.00',
    `${practice.lastLapMs} ${JSON.stringify(practice.flashText(12010))}`);
  check('practice is never over, whatever has been flown',
    !runComplete(0, PRACTICE_LAPS) && !runComplete(1, PRACTICE_LAPS) && !runComplete(500, PRACTICE_LAPS));

  /*
   * THE LAP CALLED OUT LOUD (src/render/voice.js). What is said, whether it
   * says record when the flash does, and what reaches the speech engine,
   * against a stand-in engine because node has no voice.
   */
  check('a lap is called as the flash writes it: Lap 7, 12.34',
    lapCall(7, 12340) === 'Lap 7, 12.34', lapCall(7, 12340));
  check('past a minute the time is said in words, not as a clock',
    lapCall(3, 63200, true) === 'Lap 3, 1 minute 3.20. New track record'
    && lapCall(2, 125000) === 'Lap 2, 2 minutes 5.00',
    `${lapCall(3, 63200, true)} | ${lapCall(2, 125000)}`);
  const rec = new Race([{
    position: { x: 0, y: 0, z: 0 },
    heading: 0,
    pitch: 0,
    flyOrder: 0,
    apertures: [{ centreY: 2.5, clearW: 3.5, clearH: 5.0 }],
    aperture: { centreY: 2.5, clearW: 3.5, clearH: 5.0 },
  }]);
  const recSeen = [];
  for (const t of [0, 1000, 1100, 1200]) {
    const before = rec.laps.length;
    rec.update(airSeg.prev, airSeg.curr, t, t);
    if (rec.laps.length > before) {
      recSeen.push(`${rec.lastLapMs}:${rec.lastLapRecord}:${/New track record/.test(rec.flashText(t) || '')}`);
    }
  }
  check('the call says record on exactly the laps the flash does',
    recSeen.join(' ') === '500:true:true 550:false:false 100:true:true', recSeen.join(' '));

  const voices = [
    { name: 'Network US', lang: 'en-US', localService: false, default: true },
    { name: 'Local US', lang: 'en-US', localService: true, default: false },
    { name: 'Karen', lang: 'en_AU', localService: true, default: false },
    { name: 'Amelie', lang: 'fr-FR', localService: true, default: false },
  ];
  check('the voice is the pilot\'s own English, on the machine before the network',
    pickVoice(voices, 'en-AU').name === 'Karen'
    && pickVoice(voices, 'en-US').name === 'Local US'
    && pickVoice(voices, 'de-DE').name === 'Local US',
    ['en-AU', 'en-US', 'de-DE'].map((l) => pickVoice(voices, l).name).join(', '));
  check('no English voice falls back to the default, and no voice at all is silence',
    pickVoice([voices[3]], 'en-AU').name === 'Amelie' && pickVoice([], 'en-AU') === null);

  const spoken = [];
  let cancels = 0;
  const engine = {
    speaking: false,
    pending: false,
    list: voices,
    getVoices() { return this.list; },
    speak(u) { spoken.push(u); this.speaking = true; },
    cancel() { cancels += 1; this.speaking = false; },
    addEventListener() {},
  };
  class Said {
    constructor(text) { this.text = text; }
  }
  const lv = new LapVoice({ synth: engine, Utterance: Said, lang: 'en-AU' });
  lv.prime();
  lv.prime();
  check('priming speaks once, empty and silent',
    spoken.length === 1 && spoken[0].text === '' && spoken[0].volume === 0);
  engine.speaking = false;
  spoken.length = 0;
  const first = lv.say(lapCall(7, 12340), 0.6);
  check('a call reaches the engine in the chosen voice, at the volume given',
    first && spoken.length === 1 && spoken[0].text === 'Lap 7, 12.34'
    && spoken[0].voice.name === 'Karen' && spoken[0].volume === 0.6 && spoken[0].rate > 1,
    JSON.stringify(spoken.map((u) => ({ t: u.text, v: u.voice && u.voice.name, vol: u.volume }))));
  const cancelsBefore = cancels;
  lv.say(lapCall(8, 11990), 1.5);
  check('the next lap cuts off a call still going, and volume stops at 1',
    cancels === cancelsBefore + 1 && spoken.length === 2 && spoken[1].volume === 1);
  check('at volume 0 nothing is said',
    lv.say('Lap 9, 12.00', 0) === false && spoken.length === 2);
  engine.list = [];
  const mute = new LapVoice({ synth: engine, Utterance: Said, lang: 'en-AU' });
  check('with no voice installed, a call is silence and not an error',
    mute.say('Lap 1, 12.00', 1) === false && spoken.length === 2);
  const none = new LapVoice({ synth: undefined, Utterance: undefined });
  none.prime();
  none.stop();
  check('and a browser with no speech at all is quiet too',
    none.say('Lap 1, 12.00', 1) === false);

  const free = new Race([]);
  const freeRes = free.update(airSeg.prev, airSeg.curr, 10, 10);
  check('a freestyle map never scores a gate',
    free.freestyle === true && freeRes.passed == null && free.lap === 0);

  const diveDirt = shouldScorePass(
    { x: 0, y: 0.08, z: 1.2 }, { x: 0, y: 0.04, z: -1.2 },
    { upz: -0.6, clearance: 0.04, hits: 0, heightAt: flat },
  );
  check('dirt through a dive-height opening still does not score',
    diveDirt === false);
}

/*
 * The crash reset's verdict on a solid contact (solidContactCrash and
 * bodyUpDotWorld in src/game/collide.js), in the two frames it reads. The
 * attitude is the plant's and the normal is the world's, and the plant's
 * frame is the world's turned by the spawn yaw. A craft whose nose faces
 * heading h in the world, pitched back by p, has the plant attitude
 * qz(h - yaw) qy(-p). Test code, so JS trig builds the attitudes; the
 * verdict's own turn comes from src/props/trig.js, as the shell's does.
 */
function plantQuat(heading, pitchBack, yaw) {
  const cz = Math.cos((heading - yaw) / 2);
  const sz = Math.sin((heading - yaw) / 2);
  const cy = Math.cos(-pitchBack / 2);
  const sy = Math.sin(-pitchBack / 2);
  return [cz * cy, -sz * sy, cz * sy, sz * cy];
}

/* One frame's sim_world_report: a frame contact (unless frame is 0) closing
 * at `closing` against a normal n. */
function solidReport(n, closing, frame = 1) {
  const r = new Float64Array(11);
  r[0] = 1;
  r[1] = closing;
  r[2] = closing;
  r[4] = n[0];
  r[5] = n[1];
  r[6] = n[2];
  r[8] = frame;
  r[10] = -1;
  return r;
}

function suiteCrashFrame() {
  console.log('\ncrash reset: a solid contact, judged in the plant\'s frame');

  const deg = Math.PI / 180;
  const YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 2.1, -2.9];
  const HEADINGS = [0, 1.1, Math.PI / 2, -2.4];
  const bellyWrong = [];
  const noseWrong = [];
  const tapReset = [];
  const crashMissed = [];
  for (const yaw of YAWS) {
    const t = sincos(yaw, { s: 0, c: 1 });
    for (const h of HEADINGS) {
      /* The wall is ahead along h, so its normal points back along it. */
      const n = [-Math.cos(h), -Math.sin(h), 0];
      const belly = plantQuat(h, 90 * deg, yaw);
      const nose = plantQuat(h, -50 * deg, yaw);
      const at = `yaw ${yaw.toFixed(2)} heading ${h.toFixed(2)}`;
      const db = bodyUpDotWorld(...belly, ...n, t.c, t.s);
      const dn = bodyUpDotWorld(...nose, ...n, t.c, t.s);
      if (!(Math.abs(db - 1) < 1e-9)) {
        bellyWrong.push(`${at}: ${db}`);
      }
      if (!(Math.abs(dn + Math.sin(50 * deg)) < 1e-9)) {
        noseWrong.push(`${at}: ${dn}`);
      }
      if (solidContactCrash(solidReport(n, 6), ...belly, t.c, t.s)) {
        tapReset.push(at);
      }
      if (!solidContactCrash(solidReport(n, 6), ...nose, t.c, t.s)) {
        crashMissed.push(at);
      }
    }
  }
  check('a belly flat on a wall reads 1 at every spawn yaw and wall heading',
    bellyWrong.length === 0, bellyWrong.slice(0, 3).join('; '));
  check('a nose first hit, 50 degrees down, reads -sin 50 at every one',
    noseWrong.length === 0, noseWrong.slice(0, 3).join('; '));
  check('so a belly first wall tap at 6 m/s is never a crash, whichever way the map faces',
    tapReset.length === 0, tapReset.slice(0, 3).join('; '));
  check('and a nose first hit at 6 m/s always is',
    crashMissed.length === 0, crashMissed.slice(0, 3).join('; '));

  /* The owner's report, 2026-09-25, in the headings that carried it. The
   * frame blind reading is (c, s) = (1, 0), which is what the shell used. */
  const wall = [-1, 0, 0];
  const city = sincos(Math.PI, { s: 0, c: 1 });
  const tapCity = plantQuat(0, 90 * deg, Math.PI);
  check('the city spawns at yaw pi: read frame blind, a belly on the wall was the top plate',
    bodyUpDotWorld(...tapCity, ...wall, 1, 0) < -0.99);
  check('and turned into the plant, it is the belly',
    bodyUpDotWorld(...tapCity, ...wall, city.c, city.s) > 0.99);
  const built = sincos(-Math.PI / 2, { s: 0, c: 1 });
  const tapBuilt = plantQuat(0, 90 * deg, -Math.PI / 2);
  check('a built map with no pads spawns at -pi/2: read frame blind, the belly was a side',
    Math.abs(bodyUpDotWorld(...tapBuilt, ...wall, 1, 0)) < 1e-9);
  check('and turned into the plant, it is the belly',
    bodyUpDotWorld(...tapBuilt, ...wall, built.c, built.s) > 0.99);

  /* What does not depend on the heading at all. */
  let ceiling = 0;
  let roof = 0;
  for (const yaw of YAWS) {
    const t = sincos(yaw, { s: 0, c: 1 });
    const level = plantQuat(0.7, 0, yaw);
    ceiling += solidContactCrash(solidReport([0, 0, -1], 8), ...level, t.c, t.s) ? 1 : 0;
    roof += solidContactCrash(solidReport([0, 0, 1], 8), ...level, t.c, t.s) ? 1 : 0;
  }
  check('a ceiling is never a crash: gravity takes the craft off it',
    ceiling === 0 && CRASH_UNDERSIDE_NZ > -1, `${ceiling}`);
  check('nor landing level on a roof top', roof === 0, `${roof}`);
  const nose0 = plantQuat(0, -50 * deg, 0);
  check('a prop alone is never a crash, however hard',
    !solidContactCrash(solidReport(wall, 30, 0), ...nose0, 1, 0));
  check('nor a nose first touch under the graze line',
    !solidContactCrash(solidReport(wall, GRAZE_SPEED_MAX - 0.01), ...nose0, 1, 0));
  check('and at the graze line it is',
    solidContactCrash(solidReport(wall, GRAZE_SPEED_MAX), ...nose0, 1, 0));

  /* The belly is a cone about the normal, CRASH_BELLY_UP wide: about 45
   * degrees. Pitched back 50 the belly is 40 off square and is a tap;
   * pitched back 40 it is 50 off square and is not. Unchanged by the fix. */
  check('the belly cone is about 45 degrees',
    Math.abs(Math.acos(CRASH_BELLY_UP) / deg - 45.6) < 0.1);
  check('a tap pitched back 50 degrees is the belly',
    !solidContactCrash(solidReport(wall, 6), ...plantQuat(0, 50 * deg, 0), 1, 0));
  check('pitched back 40 degrees it is not',
    solidContactCrash(solidReport(wall, 6), ...plantQuat(0, 40 * deg, 0), 1, 0));
}

/*
 * Clip-through catch. The adversarial cases are the point: a bounce, a
 * perch, a turtle, a wall scrape and a roof sit must never reset the
 * craft. Only a centre inside a solid, a leftover overlap that is not
 * travelling, or a fall through the terrain.
 */
function clipSample(over) {
  return {
    landed: false,
    turtle: false,
    launchStaging: false,
    hold: false,
    poseLock: false,
    spawnGrace: false,
    takingOff: false,
    unresolved: false,
    roofContact: false,
    interiorDepth: 0,
    buriedDepth: 0,
    x: 0,
    y: 1,
    z: 0,
    ...over,
  };
}

function tickClip(watch, sample, ms, dt = 16) {
  let last = null;
  let t = 0;
  while (t < ms) {
    last = clipWatchTick(watch, sample, dt);
    t += dt;
    if (last) {
      return last;
    }
  }
  return last;
}

function suiteClipCatch() {
  console.log('\nclip catch');

  check('confirm is longer than one hitch plus a leftover frame',
    CLIP_CONFIRM_MS > 100 + 32);
  check('deep inside is thicker than bounce slop and thinner than a wall',
    CLIP_DEEP > CLIP_CENTER_EPS && CLIP_DEEP < 0.20);
  check('spawn grace is shorter than a hang, longer than one bounce',
    CLIP_SPAWN_GRACE_MS > 100 && CLIP_SPAWN_GRACE_MS < CLIP_CRASH_HOLD_MS);
  check('stuck wait is longer than a violent bounce',
    STUCK_UNRESOLVED_MS > CLIP_CONFIRM_MS);
  check('centre epsilon sits past the bounce gap',
    CLIP_CENTER_EPS > BOUNCE_SEPARATION);
  check('the hold is a beat, not the old 1.4 s lockout',
    CLIP_CRASH_HOLD_MS >= 400 && CLIP_CRASH_HOLD_MS < 1400);

  const box = new Colliders();
  box.addBox('wall', 0, 0, 0, 2, 2, 2);
  box.build();
  box.hit(1, 1, 1, 1, 1, 1, 0.04);
  check('the centre of a wall box is inside',
    box.interiorOfHit(1, 1, 1) > 0.99);
  check('a point on the face is not inside',
    Math.abs(box.interiorOfHit(2, 1, 1)) < 1e-9);
  check('a point outside is negative',
    box.interiorOfHit(3, 1, 1) < -0.99 && box.interiorOfHit(3, 1, 1) > -1.01);
  check('a hull-overlap centre 5 cm outside is still outside',
    box.interiorOfHit(2.05, 1, 1) < -0.04);

  /*
   * THE HULL IS A SPAN, NOT A RADIUS, and each airframe's is its own.
   *
   * The swept ellipsoid used to be centred on the CG with one semi-axis used
   * both ways, chosen to cover whichever extent was larger. On the five inch
   * that is nearly true, 45 mm of hull below and 38 mm of prop plane above.
   * On the whoop it is not: 10 mm of duct below and 18 mm of canopy above, so
   * mirroring the canopy hung 8 mm of collider under a machine with nothing
   * there, which is 30 percent of a RaceGOW pipe and is what the pilot
   * reported as a large hit box below the whoop.
   *
   * These walk a level craft onto a slab and read off where it first touches,
   * which is the reach itself, and they pin it against the SPAN THE AIRFRAME
   * DECLARES rather than against a number typed here, so an airframe added
   * later is measured against its own figures. The declared spans in turn are
   * plant.c's hull_hz_down and hull_hz_up, which is what makes the collider
   * and the plant the same machine.
   */
  function reachRig() {
    const c = new Colliders();
    c.addBox('wall', -5, -1, -5, 5, 0, 5);   /* a floor slab, top at y = 0 */
    c.addBox('wall', -5, 1, -5, 5, 3, 5);    /* a ceiling slab, bottom at y = 1 */
    c.build();
    return c;
  }
  /* qw = 1 is level, qx = 1 is a half turn about x, which is inverted. */
  function firstTouch(c, from, to, inverted) {
    const vh = craftVerticalHalf(0);
    const vo = craftVerticalOffset();
    const qx = inverted ? 1 : 0;
    const qw = inverted ? 0 : 1;
    const n = 20000;
    for (let i = 0; i <= n; i += 1) {
      const y = from + (to - from) * (i / n);
      if (c.hit(0, y, 0, 0, y, 0, vh, qx, 0, 0, qw, vo) >= 0) {
        return y;
      }
    }
    return null;
  }
  const fiveBefore = airframeById('5inch').dims;
  for (const frame of AIRFRAMES) {
    setCraftAirframe(frame.dims);
    const rig = reachRig();
    const down = firstTouch(rig, 0.30, 0.0, false);
    const up = 1 - firstTouch(rig, 0.70, 1.0, false);
    const invDown = firstTouch(rig, 0.30, 0.0, true);
    const invUp = 1 - firstTouch(rig, 0.70, 1.0, true);
    const d = frame.dims.vHalfDown;
    const u = frame.dims.vHalfUp;
    check(`${frame.id}: the hull reaches exactly its declared ${d} m below`,
      Math.abs(down - d) < 1e-3, down);
    check(`${frame.id}: the hull reaches exactly its declared ${u} m above`,
      Math.abs(up - u) < 1e-3, up);
    check(`${frame.id}: inverted, the span turns over with the craft`,
      Math.abs(invDown - u) < 1e-3 && Math.abs(invUp - d) < 1e-3,
      `${invDown} below, ${invUp} above`);
  }
  /*
   * The whoop's is the one the report was about, named rather than left to
   * the loop, because the defect was specifically that its floor reach was
   * its CANOPY height.
   *
   * IT IS THE FIVE INCH'S REACH NOW, and the asymmetry the original defect
   * was about is still the thing being asserted. The whoop flies the five
   * inch's plant, so its down extent is that plant's 45 mm, the height it
   * actually rests at; its UP extent is the drawn canopy through the room's
   * factor, 61.7 mm, because nothing rests a craft on its canopy and what
   * reads that number is a collider deciding whether the top of the aircraft
   * met a bar. So the two are still different, still in the right order, and
   * still each owned by the thing that has a claim on them.
   */
  setCraftAirframe(airframeById('whoop65').dims);
  const whoopRig = reachRig();
  const whoopDown = firstTouch(whoopRig, 0.30, 0.0, false);
  const whoopUp = 1 - firstTouch(whoopRig, 0.70, 1.0, false);
  check('a whoop rests on the plant\'s 45 mm, which is what it settles at',
    Math.abs(whoopDown - 0.045) < 1e-3, whoopDown);
  check('and it still does not carry its canopy height under it',
    whoopUp > whoopDown, `${whoopUp} above, ${whoopDown} below`);
  setCraftAirframe(fiveBefore);

  const post = new Colliders();
  post.addPost('pole', 0, 0, 0, 2, 0.05);
  post.build();
  post.hit(0, 1, 0, 0, 1, 0, 0.04);
  check('the axis of a thin post is inside',
    post.interiorOfHit(0, 1, 0) > 0.049);
  check('a centimetre off a 5 cm post is still inside',
    post.interiorOfHit(0.01, 1, 0) > 0.03);
  check('past the bark is outside',
    post.interiorOfHit(0.08, 1, 0) < 0);

  const train = new Colliders();
  train.build();
  const car = train.addMoving('train', 1, 0.5, 2);
  train.seatMoving(car, 10, 1, 0);
  train.hit(10, 1, 0, 10, 1, 0, 0.04);
  check('the centre of a train car is inside',
    train.interiorOfHit(10, 1, 0) > 0.49);

  const wall = new Colliders();
  wall.addBox('wall', -0.1, 0, 0, 0.1, 2, 4);
  wall.build();
  wall.hit(-1, 1, 2, 1, 1, 2, 0.04);
  check('a chord through a wall is a far-face cross',
    wall.crossedHit(-1, 1, 2, 1, 1, 2) === true);
  check('a bounce that stays on the entry side is not a cross',
    wall.crossedHit(-1, 1, 2, -0.12, 1, 2) === false);
  check('a far-side eject after that chord is still a cross',
    wall.crossedHit(-1, 1, 2, 0.12, 1, 2) === true);
  check('a fly-by along the wall is not a cross',
    wall.crossedHit(-1, 1, -1, -1, 1, 5) === false);
  check('flying over a wall is not a cross',
    wall.crossedHit(-1, 3, 2, 1, 3, 2) === false);
  check('going around a wall corner is not a cross',
    wall.crossedHit(-1, 1, -0.5, 0.5, 1, -1) === false);

  const deck = new Colliders();
  deck.addBox('wall', -2, 0.50, -2, 2, 0.64, 2);
  deck.build();
  deck.hit(0, 3, 0, 0, -1, 0, 0.04);
  check('a long drop through a 14 cm deck is a far-face cross',
    deck.crossedHit(0, 3, 0, 0, -1, 0) === true);
  check('and the midpoint of that drop is not inside the slab',
    deck.interiorOfHit(0, 1, 0) < 0);
  check('landing on that deck is not a cross',
    deck.crossedHit(0, 3, 0, 0, 0.72, 0) === false);
  check('flying over that deck is not a cross',
    deck.crossedHit(-3, 2, 0, 3, 2, 0) === false);
  check('flying under that deck is not a cross',
    deck.crossedHit(-3, 0.3, 0, 3, 0.3, 0) === false);

  post.hit(-1, 1, 0, 1, 1, 0, 0.04);
  check('a chord through a post is a cross',
    post.crossedHit(-1, 1, 0, 1, 1, 0) === true);
  check('a bounce that stays on the entry side of a post is not a cross',
    post.crossedHit(-1, 1, 0, -0.08, 1, 0) === false);
  check('a far-side eject off a post after a long approach is a cross',
    post.crossedHit(-10, 1, 0, 0.08, 1, 0) === true);
  check('a fly-by 20 cm off a post is not a cross',
    post.crossedHit(-1, 1, 0.20, 1, 1, 0.20) === false);

  train.hit(8, 1, 0, 12, 1, 0, 0.04);
  check('a chord through a train car is a far-face cross',
    train.crossedHit(8, 1, 0, 12, 1, 0) === true);
  check('a scrape along the outside of a train car is not a cross',
    train.crossedHit(12.2, 1, -4, 12.2, 1, 4) === false);

  const air = makeClipWatch();
  check('open air never fires',
    tickClip(air, clipSample({}), 1000) === null);

  const bounce = makeClipWatch();
  check('one leftover frame does not fire',
    clipWatchTick(bounce, clipSample({ unresolved: true, x: 0, y: 1, z: 0 }), 16) === null);
  check('and a bounce that then clears stays quiet',
    tickClip(bounce, clipSample({ unresolved: false }), 1000) === null);

  const graze = makeClipWatch();
  check('a 50 ms graze leftover does not fire',
    tickClip(graze, clipSample({ unresolved: true }), 50) === null);

  const hull = makeClipWatch();
  check('props overlapping with the centre outside is not a clip',
    tickClip(hull, clipSample({
      unresolved: false,
      interiorDepth: -0.05,
    }), CLIP_CONFIRM_MS + 80) === null);

  const perch = makeClipWatch();
  check('a perch leftover on the grass is not stuck',
    tickClip(perch, clipSample({
      landed: true,
      unresolved: true,
      interiorDepth: 0,
    }), STUCK_UNRESOLVED_MS + 200) === null);
  check('and a perch 40 cm in the dirt is not buried',
    tickClip(perch, clipSample({
      landed: true,
      buriedDepth: 0.4,
    }), BURIED_CONFIRM_MS + 80) === null);
  check('but a perch whose centre is inside a wall still crashes',
    tickClip(makeClipWatch(), clipSample({
      landed: true,
      interiorDepth: 0.2,
    }), CLIP_CONFIRM_MS) === 'inside');

  const turtle = makeClipWatch();
  check('turtle leftover on the grass is not stuck',
    tickClip(turtle, clipSample({
      turtle: true,
      unresolved: true,
      interiorDepth: 0,
    }), STUCK_UNRESOLVED_MS + 200) === null);
  check('but turtle whose centre is inside a solid still crashes',
    tickClip(makeClipWatch(), clipSample({
      turtle: true,
      interiorDepth: 0.2,
    }), CLIP_CONFIRM_MS) === 'inside');

  const launch = makeClipWatch();
  check('launch staging skip never fires',
    tickClip(launch, clipSample({
      launchStaging: true,
      interiorDepth: 0.3,
      unresolved: true,
    }), 2000) === null);

  const lock = makeClipWatch();
  check('a harness pose lock skip never fires',
    tickClip(lock, clipSample({
      poseLock: true,
      interiorDepth: 0.5,
    }), 2000) === null);

  const hold = makeClipWatch();
  check('already holding a crash skip never fires again',
    tickClip(hold, clipSample({
      hold: true,
      interiorDepth: 0.5,
      unresolved: true,
    }), 2000) === null);

  const roof = makeClipWatch();
  check('sitting on a roof leftover is not stuck',
    tickClip(roof, clipSample({
      unresolved: true,
      roofContact: true,
      interiorDepth: 0,
    }), STUCK_UNRESOLVED_MS + 200) === null);
  check('falling through a roof, centre inside, is still a clip',
    tickClip(makeClipWatch(), clipSample({
      unresolved: true,
      roofContact: false,
      interiorDepth: 0.12,
    }), CLIP_CONFIRM_MS) === 'inside');
  check('a roof flag does not mute a centre already through the slab',
    clipWatchTick(makeClipWatch(), clipSample({
      roofContact: true,
      unresolved: true,
      interiorDepth: CLIP_DEEP,
    }), 16) === 'inside');

  const scrape = makeClipWatch();
  let scrapeHit = null;
  const scrapeDt = 16;
  const scrapeMs = STUCK_UNRESOLVED_MS + 80;
  let sx = 0;
  for (let t = 0; t < scrapeMs; t += scrapeDt) {
    sx += 10 * (scrapeDt / 1000);
    scrapeHit = clipWatchTick(scrape, clipSample({
      unresolved: true,
      x: sx,
      y: 1,
      z: 0,
    }), scrapeDt);
    if (scrapeHit) {
      break;
    }
  }
  check('a 10 m/s wall scrape does not fire',
    scrapeHit === null, scrapeHit);

  const slowSlide = makeClipWatch();
  let slowHit = null;
  let slx = 0;
  const slowDt = 16;
  for (let t = 0; t < STUCK_UNRESOLVED_MS + 80; t += slowDt) {
    slx += 5 * (slowDt / 1000);
    slowHit = clipWatchTick(slowSlide, clipSample({
      unresolved: true,
      x: slx,
      y: 1,
      z: 0,
    }), slowDt);
    if (slowHit) {
      break;
    }
  }
  check('a 5 m/s leftover slide still travels past the stuck gate',
    slowHit === null, slowHit);

  const takeoff = makeClipWatch();
  check('a takeoff 5 cm in the grass is not buried',
    tickClip(takeoff, clipSample({
      takingOff: true,
      buriedDepth: 0.05,
    }), BURIED_CONFIRM_MS + 80) === null);

  const shallow = makeClipWatch();
  check('10 cm below the terrain is not buried',
    tickClip(shallow, clipSample({ buriedDepth: 0.10 }), BURIED_CONFIRM_MS + 80) === null);

  const oneFrame = makeClipWatch();
  check('a single 16 ms shallow clip-through frame does not fire',
    clipWatchTick(oneFrame, clipSample({ interiorDepth: 0.04 }), 16) === null);

  const hitch = makeClipWatch();
  check('one 100 ms hitch shallow-inside still needs more time',
    clipWatchTick(hitch, clipSample({ interiorDepth: 0.04 }), 100) === null);
  check('a leftover 32 ms plus a hitch still sits under confirm',
    clipWatchTick(hitch, clipSample({ interiorDepth: 0.04 }), 32) === null);

  const deep = makeClipWatch();
  check('a centre 10 cm inside fires on the first frame',
    clipWatchTick(deep, clipSample({ interiorDepth: 0.10 }), 16) === 'inside');

  const inside = makeClipWatch();
  check('a centre 4 cm inside for the confirm window is a crash',
    tickClip(inside, clipSample({ interiorDepth: 0.04 }), CLIP_CONFIRM_MS) === 'inside');

  const thin = makeClipWatch();
  check('a centimetre inside a post past epsilon is a crash',
    tickClip(thin, clipSample({ interiorDepth: CLIP_CENTER_EPS + 0.002 }), CLIP_CONFIRM_MS + 16) === 'inside');

  /*
   * THE STUCK GATE ASKS ABOUT THE CENTRE, and these two cases are how that
   * is stated. They used to assert the opposite and had been failing since
   * the rule changed under them.
   *
   * The old rule was "still overlapping for 350 ms without moving 40 cm",
   * with no test on how deep. That is the definition of a WALL RIDE, and it
   * fired on one: flown head on at the town's training wall through
   * Betaflight and the plant, six approaches from 4.0 to 11.3 m/s produced
   * six crashes, every one of them clipCrashKind 'stuck' and not one of them
   * a Wall Tap. So the gate gained the depth test its own comment had always
   * described, and these two cases were left behind asserting the version
   * that caused it.
   *
   * Restated: leftover overlap alone is a bounce that has not finished, and
   * the craft flies out of it. A CENTRE through the face that is going
   * nowhere is the crash.
   */
  const jammed = makeClipWatch();
  check('leftover overlap alone is not stuck, however long it lasts',
    tickClip(jammed, clipSample({
      unresolved: true,
      x: 0,
      y: 1,
      z: 0,
    }), STUCK_UNRESOLVED_MS * 3) === null);

  /*
   * AND THE CENTRE INSIDE IS A CRASH, NAMED 'inside' RATHER THAN 'stuck'.
   *
   * Worth writing down, because it means the 'stuck' branch is now
   * unreachable. Both gates want the same thing, `unresolved` with the
   * centre past CLIP_CENTER_EPS, and both reset together the moment the
   * craft is no longer inside; but inside confirms after CLIP_CONFIRM_MS
   * and stuck after STUCK_UNRESOLVED_MS, and 180 is less than 350, so any
   * run long enough to be stuck was called inside a fifth of a second
   * earlier. That is the right answer either way, since 'inside' names the
   * cause more precisely, and the branch is left where it is rather than
   * deleted on a test's say so. See PROGRESS.md.
   */
  const jammedIn = makeClipWatch();
  check('but a centre through the face that is going nowhere is a crash',
    tickClip(jammedIn, clipSample({
      unresolved: true,
      interiorDepth: CLIP_CENTER_EPS + 0.004,
      x: 0,
      y: 1,
      z: 0,
    }), STUCK_UNRESOLVED_MS) === 'inside');

  const jitter = makeClipWatch();
  let jitterHit = null;
  for (let t = 0, n = 0; t < STUCK_UNRESOLVED_MS + 16; t += 16, n += 1) {
    jitterHit = clipWatchTick(jitter, clipSample({
      unresolved: true,
      interiorDepth: CLIP_CENTER_EPS + 0.004,
      x: (n % 2) * 0.04,
      y: 1,
      z: 0,
    }), 16);
    if (jitterHit) {
      break;
    }
  }
  check('centimetre jitter with the centre inside is a crash',
    jitterHit === 'inside', jitterHit);

  const jitterOut = makeClipWatch();
  let jitterOutHit = null;
  for (let t = 0, n = 0; t < STUCK_UNRESOLVED_MS * 2; t += 16, n += 1) {
    jitterOutHit = clipWatchTick(jitterOut, clipSample({
      unresolved: true,
      x: (n % 2) * 0.04,
      y: 1,
      z: 0,
    }), 16);
    if (jitterOutHit) {
      break;
    }
  }
  check('and the same jitter with the centre outside is a pilot on a wall',
    jitterOutHit === null, jitterOutHit);

  const buried = makeClipWatch();
  check('22 cm under the terrain for the bury window is a crash',
    tickClip(buried, clipSample({ buriedDepth: BURIED_DEPTH }), BURIED_CONFIRM_MS) === 'buried');

  const both = makeClipWatch();
  check('inside wins when both inside and stuck apply',
    tickClip(both, clipSample({
      interiorDepth: 0.2,
      unresolved: true,
    }), CLIP_CONFIRM_MS) === 'inside');

  const recover = makeClipWatch();
  tickClip(recover, clipSample({ interiorDepth: 0.04 }), CLIP_CONFIRM_MS - 32);
  check('leaving the solid mid-window forgets the count',
    clipWatchTick(recover, clipSample({ interiorDepth: 0 }), 16) === null);
  check('and the next clip has to confirm again',
    tickClip(recover, clipSample({ interiorDepth: 0.04 }), CLIP_CONFIRM_MS - 16) === null);

  const hullStuck = makeClipWatch();
  check('leftover hull overlap with the centre 5 cm outside is not stuck',
    tickClip(hullStuck, clipSample({
      unresolved: true,
      interiorDepth: -0.05,
      x: 0,
      y: 1,
      z: 0,
    }), STUCK_UNRESOLVED_MS + 80) === null);

  const crawl = makeClipWatch();
  let crawlHit = null;
  let cx = 0;
  for (let t = 0; t < STUCK_UNRESOLVED_MS + 80; t += 16) {
    cx += 1.0 * (16 / 1000);
    crawlHit = clipWatchTick(crawl, clipSample({
      unresolved: true,
      interiorDepth: -0.05,
      x: cx,
      y: 1,
      z: 0,
    }), 16);
    if (crawlHit) {
      break;
    }
  }
  check('a 1 m/s leftover crawl with the centre outside is not stuck',
    crawlHit === null, crawlHit);

  const fall = makeClipWatch();
  check('falling through the world still buries even if takingOff is latched',
    tickClip(fall, clipSample({
      takingOff: true,
      buriedDepth: 2.0,
    }), BURIED_CONFIRM_MS) === 'buried');

  const grace = makeClipWatch();
  check('spawn grace ignores a centre inside a pad leftover',
    tickClip(grace, clipSample({
      spawnGrace: true,
      landed: true,
      interiorDepth: 0.2,
      unresolved: true,
      buriedDepth: 0.4,
    }), 2000) === null);
  check('spawn grace does not mute a deep clip once airborne',
    clipWatchTick(makeClipWatch(), clipSample({
      spawnGrace: false,
      landed: false,
      interiorDepth: 0.10,
    }), 16) === 'inside');

  const fifty = makeClipWatch();
  let bounceFires = 0;
  for (let i = 0; i < 50; i += 1) {
    if (clipWatchTick(fifty, clipSample({ unresolved: true }), 16)) {
      bounceFires += 1;
    }
    clipWatchTick(fifty, clipSample({ unresolved: false }), 16);
  }
  check('fifty firm contacts that each clear, fifty not-crashes',
    bounceFires === 0, `${bounceFires}`);

  check('stuck travel max is under a slow crawl along a wall',
    STUCK_TRAVEL_MAX < 5 * (STUCK_UNRESOLVED_MS / 1000));
}

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
  /* 140.05 and 2.593 once the pads left the racing line. Before that, 139.7
   * and 2.68, and before the cone's default clearance became the flag's
   * 1.5 m, 138.9 and 2.73. A marker's knot sits at that radius, so moving
   * it moves the lap these two numbers measure; the tolerances are untouched. */
  check('schema.md quotes the right lap length', Math.abs(path.length - 139.79) < 0.05, `${path.length.toFixed(2)} m`);
  check('schema.md quotes the right tightest radius',
    Math.abs(path.tightest.radius - 2.593) < 0.005, `${path.tightest.radius.toFixed(3)} m`);
  check('and the worked example really does raise no warnings',
    collectWarnings(doc, path).filter((w) => w.level === 'warn').length === 0);
}

/*
 * FREESTYLE MAPS IN THE BUILDER. A map is a document with mode freestyle,
 * made of the assets in src/props, with its own palette and hotkeys, its
 * own heading rule and its own warnings, checked against the solids the
 * simulator will actually build. Everything here is the pure half: the
 * palette, the inspector and the plan are left to the screenshots.
 */
function freestylePlace(doc, type, x, y, opts = {}) {
  const el = place(doc, type, x, y, opts);
  if (opts.style) {
    el.style = opts.style;
  }
  if (opts.points) {
    el.points = opts.points;
  }
  return el;
}

function codesOf(doc) {
  return freestyleReport(doc).warnings.map((w) => w.code);
}

/*
 * THE DRAWING ON A PUBLISHED MAP'S CARD.
 *
 * boardPlanOf in ./view2d.js measures it, and the board checks it with
 * inspectMapPlan in its own src/validate.js, which this file cannot import
 * because the board is another repository. So the board's rules are written
 * down here as the contract, and the two constants below MIRROR the board's
 * PIECE_TYPE_RE and MAP_PLAN_KINDS: change one side, change both. Every
 * type in the palette is drawn, so a piece added to src/props/types.js is
 * held to this the day it arrives, which is the reason the drawing is
 * measured on this side rather than kept as a list of shapes on the board.
 */
const BOARD_PIECE_TYPE_RE = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
const BOARD_PLAN_KINDS = ['structure', 'gap', 'aperture', 'obstacle', 'marker', 'start', 'decal', 'other'];

function suiteBoardPlan() {
  console.log('\nthe board drawing of a map');
  const map = createTrack(undefined, 'full', 'freestyle');
  const every = [...FREESTYLE_PALETTE_ORDER, ...PALETTE_EXTRA];
  every.forEach((type, i) => {
    freestylePlace(map, type, 10 + (i % 6) * 26, 10 + Math.floor(i / 6) * 26);
  });
  map.elements.find((e) => e.type === 'gap').name = 'CRANE GAP';
  const plan = boardPlanOf(map);
  const labels = map.elements.filter((e) => ELEMENTS[e.type].kind === KIND.ANNOTATION).length;
  check('every piece on a map is drawn, and a label is the one thing left out',
    labels === 1 && plan.marks.length === map.elements.length - labels,
    `${plan.marks.length} marks for ${map.elements.length} elements, ${labels} label(s)`);
  const refused = plan.marks.filter((m) => !BOARD_PIECE_TYPE_RE.test(m.t)
    || !BOARD_PLAN_KINDS.includes(m.k)
    || m.p.length < 2 || m.p.length > 16
    || m.p.some((pt) => pt.length !== 2 || !pt.every(Number.isFinite)));
  check('and every outline is one the board takes', refused.length === 0,
    refused.map((m) => m.t).join(', '));
  check('no piece in the palette falls through to the board\u2019s "other"',
    plan.marks.every((m) => m.k !== 'other'), plan.marks.filter((m) => m.k === 'other').map((m) => m.t).join(', '));
  const gap = plan.marks.find((m) => m.t === 'gap');
  check('a named gap is drawn as a gap and carries its name', gap && gap.k === 'gap' && gap.n === 'CRANE GAP');
  check('a solid is drawn as a structure, and carries no name',
    plan.marks.filter((m) => m.t === 'building').every((m) => m.k === 'structure' && !('n' in m)));
  /* Within a millionth of a centimetre, because 45.59 is not a binary
   * fraction and 45.59 * 100 is 4558.999999999999. */
  const onCm = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
  check('numbers are in centimetres, which is what the board keeps',
    plan.marks.every((m) => m.p.every(([x, y]) => onCm(x) && onCm(y))));
  check('and the plot is the map\u2019s own', plan.width === map.field.width && plan.depth === map.field.depth);
  /* The starter yard is what a first publish looks like, so it is the one
   * measured: its drawing rides beside a document of about nine kilobytes
   * and should not outweigh it. */
  const yard = normalize(starterMap()).doc;
  const yardPlan = boardPlanOf(yard);
  const yardBytes = JSON.stringify(yardPlan).length;
  check('the starter yard draws every piece in less than its own document weighs',
    yardPlan.marks.length === yard.elements.length && yardBytes < JSON.stringify(toPlain(yard)).length,
    `${yardPlan.marks.length} marks, ${yardBytes} bytes`);
  check('and its five named gaps keep their names',
    yardPlan.marks.filter((m) => m.k === 'gap').map((m) => m.n).join('|')
      === yard.elements.filter((e) => e.type === 'gap').map((e) => e.name).join('|'));
}

function suiteFreestyle() {
  console.log('\nfreestyle maps');

  /* -------- a map, and every asset on it -------- */

  const map = createTrack(undefined, 'full', 'freestyle');
  check('a new map says it is freestyle, on the full sized class',
    docModeOf(map) === 'freestyle' && map.trackClass === 'full' && map.name === 'Untitled map');
  check('and it stands on a 160 by 160 m plot',
    map.field.width === 160 && map.field.depth === 160, `${map.field.width} by ${map.field.depth}`);

  const every = [...FREESTYLE_PALETTE_ORDER, ...PALETTE_EXTRA];
  const propIds = Object.keys(PROP_TYPES);
  check('the map palette offers every asset in src/props/types.js',
    propIds.every((id) => FREESTYLE_PALETTE_ORDER.includes(id)),
    propIds.filter((id) => !FREESTYLE_PALETTE_ORDER.includes(id)).join(', '));
  check('and every piece of course furniture', FURNITURE_PALETTE.every((id) => FREESTYLE_PALETTE_ORDER.includes(id)));
  let placedAll = true;
  every.forEach((type, i) => {
    try {
      freestylePlace(map, type, 10 + (i % 6) * 26, 10 + Math.floor(i / 6) * 26);
    } catch (e) {
      placedAll = false;
      check(`${type} can be placed on a map`, false, e.message);
    }
  });
  check(`all ${every.length} types place on a map`, placedAll && map.elements.length === every.length);
  check('nothing placed on a map joins a flying order', map.sequence.length === 0);
  check('a styled asset starts in its first style',
    map.elements.filter((e) => ELEMENTS[e.type].styles).every((e) => e.style === ELEMENTS[e.type].styles[0]));
  const gapEl = map.elements.find((e) => e.type === 'gap');
  check('a named gap starts with a name and a points tier', gapEl.name === 'GAP' && GAP_POINTS.includes(gapEl.points));

  const text = serialize(map);
  const back = deserialize(text);
  check('a map with every asset reads back with no repairs', back.repairs.length === 0, back.repairs.join('; '));
  check('and round trips byte for byte', serialize(back.doc) === text);
  check('and still says it is a map', docModeOf(back.doc) === 'freestyle' && JSON.parse(text).mode === 'freestyle');

  /* Every field a map adds, changed from its default, survives too. */
  const edited = deserialize(text).doc;
  const byType = (t) => edited.elements.find((e) => e.type === t);
  byType('building').style = 'warehouse';
  byType('building').yaw = Math.PI / 2;
  byType('building').dims.floors = 7;
  byType('containers').style = '20ft';
  byType('crane').yaw = 0.7;
  byType('crane').position.z = 3.5;
  byType('gap').points = 1000;
  byType('gap').name = 'CRANE GAP';
  byType('tree').style = 'pine';
  byType('tree').dims.variant = 42;
  const text2 = serialize(edited);
  check('an edited map round trips byte for byte', serialize(deserialize(text2).doc) === text2);
  const read2 = deserialize(text2).doc;
  check('with its styles, points, names and headings intact',
    read2.elements.find((e) => e.type === 'building').style === 'warehouse'
    && read2.elements.find((e) => e.type === 'containers').style === '20ft'
    && read2.elements.find((e) => e.type === 'gap').points === 1000
    && read2.elements.find((e) => e.type === 'gap').name === 'CRANE GAP'
    && Math.abs(read2.elements.find((e) => e.type === 'crane').yaw - 0.7) < 1e-6);

  /* -------- the scene: time of day and ground -------- */

  {
    check('a new map holds the default scene, golden over concrete',
      map.scene && map.scene.time === 'golden' && map.scene.ground === 'concrete');
    check('and does not write it, so a map saved before scenes keeps its bytes',
      !Object.prototype.hasOwnProperty.call(JSON.parse(text), 'scene'));
    let every = true;
    for (const time of SCENE_TIMES) {
      for (const ground of SCENE_GROUNDS) {
        const d = deserialize(text).doc;
        d.scene = { time, ground };
        const t = serialize(d);
        const r = deserialize(t);
        const wrote = JSON.parse(t).scene;
        const def = time === SCENE_DEFAULT.time && ground === SCENE_DEFAULT.ground;
        const ok = r.repairs.length === 0 && serialize(r.doc) === t
          && r.doc.scene.time === time && r.doc.scene.ground === ground
          && (def ? wrote === undefined : wrote.time === time && wrote.ground === ground);
        if (!ok) {
          every = false;
          check(`the scene ${time} over ${ground} round trips`, false, JSON.stringify(wrote));
        }
      }
    }
    check(`all ${SCENE_TIMES.length * SCENE_GROUNDS.length} scenes round trip byte for byte, written only when not the default`, every);

    const junk = normalize({ ...JSON.parse(text), scene: { time: 'midnight', ground: 'lava' } });
    check('an unknown time and ground read as the defaults', junk.doc.scene.time === 'golden' && junk.doc.scene.ground === 'concrete');
    check('and each says so', junk.repairs.length === 2 && junk.repairs.every((r) => r.includes('scene')), junk.repairs.join('; '));
    const half = normalize({ ...JSON.parse(text), scene: { time: 'lunchtime', ground: 'dirt' } });
    check('one bad key does not cost the good one', half.doc.scene.time === 'golden' && half.doc.scene.ground === 'dirt'
      && half.repairs.length === 1);
    const notObj = normalize({ ...JSON.parse(text), scene: 'dusk' });
    check('a scene that is not an object reads as the default, with a note',
      notObj.doc.scene.time === 'golden' && notObj.doc.scene.ground === 'concrete' && notObj.repairs.length === 1);
    check('and repaired, writes nothing', !serialize(junk.doc).includes('"scene"'));

    const race = createTrack('Race with a scene');
    const racePlain = { ...toPlain(race), scene: { time: 'dusk', ground: 'grass' } };
    const raceRead = normalize(racePlain);
    check('a race track never carries a scene, even a hand written one',
      !('scene' in raceRead.doc) && !serialize(raceRead.doc).includes('"scene"'));
    check('and sceneOf a race track is the default', sceneOf(raceRead.doc).time === 'golden' && sceneOf(raceRead.doc).ground === 'concrete');

    /* The builder's controls edit through history like any other edit. */
    const h = new History();
    let d = deserialize(text).doc;
    const before = deepClone(d);
    d.scene = { ...d.scene, time: 'dusk' };
    h.record(before, d, 'scene');
    d.scene = { ...d.scene, ground: 'tarmac' };
    h.record(deepClone({ ...d, scene: { ...d.scene, ground: 'concrete' } }), d, 'scene');
    d = h.undo(d);
    check('undo takes a ground change back', d.scene.time === 'dusk' && d.scene.ground === 'concrete');
    d = h.undo(d);
    check('and then the time', d.scene.time === 'golden' && d.scene.ground === 'concrete');
    d = h.redo(d);
    d = h.redo(d);
    check('and redo puts both back', d.scene.time === 'dusk' && d.scene.ground === 'tarmac');
  }

  /* -------- hotkeys -------- */

  const fsItems = paletteItems('full', 'freestyle');
  const fsKeys = fsItems.map((d) => d.key).filter(Boolean);
  check('every map hotkey is unique', new Set(fsKeys).size === fsKeys.length,
    fsKeys.filter((k, i) => fsKeys.indexOf(k) !== i).join(', '));
  /* app.js takes these before the palette sees them. */
  const reserved = ['Q', 'E', 'X', 'V', 'P'];
  check('no map hotkey is one the builder keeps for itself',
    !fsKeys.some((k) => reserved.includes(k)), fsKeys.filter((k) => reserved.includes(k)).join(', '));
  check('every map hotkey arms what its button says',
    fsItems.filter((d) => d.key).every((d) => elementByKey(d.key, 'full', 'freestyle') === d)
    && fsItems.filter((d) => d.key).every((d) => elementByKey(d.key.toLowerCase(), 'full', 'freestyle') === d));
  /* The race palettes, key for key, as they were before maps existed. */
  const raceKeys = {
    full: { G: 'gate', A: 'flaggedGate', 2: 'doubleStack', H: 'flaggedDoubleStack', R: 'ladder', T: 'tower', D: 'diveGate', B: 'barrier', F: 'flag', C: 'cone', W: 'waypoint', S: 'startPads', L: 'label', O: 'groundLogo' },
    micro: { G: 'gate', 2: 'doubleStack', R: 'ladder', T: 'tower', D: 'diveGate', U: 'pole', Z: 'horizontalPole', C: 'cone', B: 'barrier', W: 'waypoint', S: 'startPads', L: 'label', O: 'groundLogo' },
  };
  for (const cls of ['full', 'micro']) {
    const items = paletteItems(cls, 'race');
    const got = Object.fromEntries(items.map((d) => [d.key, d.id]));
    check(`the ${cls} race palette's keys are unchanged`,
      JSON.stringify(got) === JSON.stringify(Object.fromEntries(Object.entries(raceKeys[cls]).map(([k, v]) => [String(k), v]))),
      JSON.stringify(got));
    check(`and no asset is on the ${cls} race palette`, !items.some((d) => PROP_TYPES[d.id]));
  }
  check('an asset key does nothing on a race track',
    ['1', '3', '4', '9', '0', 'Y', 'K', 'J', 'N', 'M', 'I'].every((k) => !elementByKey(k, 'full', 'race')));

  /* -------- headings -------- */

  const deg = (d) => d * RAD;
  const near = (a, b) => Math.abs(wrapAngle(a - b)) < 1e-9;
  check('a building snaps to the nearest quarter turn: 40 to 0, 50 to 90, -100 to -90',
    near(snapYaw('building', deg(40)), 0) && near(snapYaw('building', deg(50)), deg(90))
    && near(snapYaw('building', deg(-100)), deg(-90)));
  check('and ignores Alt, because the physics cannot hold what Alt would ask for',
    near(snapYaw('containers', deg(40), true), 0));
  check('a crane keeps the 15 degree snap and takes any angle with Alt',
    near(snapYaw('crane', deg(40)), deg(45)) && near(snapYaw('crane', deg(40), true), deg(40)));
  check('course furniture turns freely on a map', turnsOf('gate') === 'any' && turnsOf('startPads') === 'any');
  check('every asset types.js calls quarter snaps, and no other',
    propIds.every((id) => (turnsOf(id) === 'quarter') === (PROP_TYPES[id].turns === 'quarter')));
  check('an asset that turns freely has no solid box to turn',
    propIds.filter((id) => PROP_TYPES[id].turns === 'any').every((id) => {
      const el = map.elements.find((e) => e.type === id);
      return !partsOf(el).some((p) => p.t === 'box' && p.solid);
    }));
  /* To the file's six decimals: pi is written 3.141593. */
  const nearFile = (a, b) => Math.abs(wrapAngle(a - b)) < 1e-6;
  check('a quarter turn is kept through a round trip, and still snaps to itself',
    [0, 1, 2, 3].every((q) => {
      const d = createTrack(undefined, 'full', 'freestyle');
      const b = freestylePlace(d, 'building', 50, 50);
      setYaw(d, b.id, snapYaw('building', q * Math.PI / 2 + 0.3));
      const r = deserialize(serialize(d)).doc.elements[0];
      return nearFile(snapYaw('building', r.yaw), r.yaw) && nearFile(r.yaw, q * Math.PI / 2);
    }));

  /* -------- plan shapes -------- */

  let finite = true;
  let sized = true;
  const bad = [];
  for (const yaw of [0, 0.7, Math.PI / 2, -2.4]) {
    for (const el of map.elements) {
      el.yaw = yaw;
      const poly = planShapeOf(el);
      const ok = poly.length === 4 && poly.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!ok) {
        finite = false;
        bad.push(`${el.type}@${yaw}`);
      }
      const kind = ELEMENTS[el.type].kind;
      if ((kind === KIND.STRUCTURE || kind === KIND.ZONE) && !(shoelace(poly) > 0.01)) {
        sized = false;
        bad.push(`${el.type} area`);
      }
    }
  }
  check('every element on a map has a finite plan shape at any heading', finite, bad.join(', '));
  check('and every asset and gap has an area to pick', sized, bad.join(', '));
  {
    const d = createTrack(undefined, 'full', 'freestyle');
    const b = freestylePlace(d, 'building', 50, 50);
    const at0 = planShapeOf(b);
    b.yaw = deg(40);
    const at40 = planShapeOf(b);
    check('a building left at 40 degrees is drawn where it stands, at 0',
      at0.every((p, i) => Math.abs(p.x - at40[i].x) < 1e-9 && Math.abs(p.y - at40[i].y) < 1e-9));
    const g = freestylePlace(d, 'gap', 20, 20, { dims: { width: 6 } });
    const gs = planShapeOf(g);
    const spanY = Math.max(...gs.map((p) => p.y)) - Math.min(...gs.map((p) => p.y));
    check('a named gap at heading 0 spans its width across the heading', Math.abs(spanY - 6) < 1e-9, `${spanY}`);
  }

  /* -------- warnings -------- */

  const fresh = () => createTrack(undefined, 'full', 'freestyle');
  {
    const d = fresh();
    freestylePlace(d, 'building', 40, 40);
    freestylePlace(d, 'crane', 100, 40);
    freestylePlace(d, 'tree', 40, 100);
    freestylePlace(d, 'gap', 120, 120);
    freestylePlace(d, 'gate', 80, 110);
    freestylePlace(d, 'startPads', 100, 100);
    const codes = codesOf(d);
    check('a clean map raises nothing at all', codes.length === 0, codes.join(', '));
    check('and the race warnings never appear on a map',
      !collectWarnings(d, null).some((w) => !w.code.startsWith('fs-')));
  }
  {
    const d = fresh();
    freestylePlace(d, 'building', 40, 40);
    check('no start pads: a note that says where the pilot starts', codesOf(d).includes('fs-no-start'));
    freestylePlace(d, 'building', 8, 80);
    check('and the start it names is checked too: a building on it is a warning',
      codesOf(d).includes('fs-spawn'));
  }
  {
    const d = fresh();
    freestylePlace(d, 'building', 40, 40);
    const pads = freestylePlace(d, 'startPads', 40, 40);
    const w = freestyleReport(d).warnings.find((x) => x.code === 'fs-spawn');
    check('start pads inside a building are a warning, pointing at the pads', w && w.elementId === pads.id);
    /* The flats are 9 m deep, front to back along their own x, so at
     * heading 0 the back wall is 4.5 m west of the centre. The balconies
     * stand out 1.8 m past it, to 6.3 m, but their slab's underside is
     * 2.72 m up, well over a craft on the ground. Measured with partsOf. */
    pads.position.x = 40 - 4.5 - 0.6;
    check('and so are pads within a metre of its wall', codesOf(d).includes('fs-spawn'));
    pads.position.x = 40 - 4.5 - 1.4;
    check('but not pads under its balconies, 1.4 m off the wall and 2.6 m below them', !codesOf(d).includes('fs-spawn'));
  }
  {
    /*
     * A ROOFTOP START. The flats' roof is open for three metres round its
     * middle (the stair head is further off), so pads raised onto it start
     * the craft on the roof, and the roof under the mat is its floor, not a
     * wall it is 0.10 m from.
     */
    const d = fresh();
    freestylePlace(d, 'building', 40, 40);
    const pads = freestylePlace(d, 'startPads', 40, 40);
    let placed = placeDocument(d);
    const inside = freestyleReport(d).warnings.find((x) => x.code === 'fs-spawn');
    check('pads at Base 0 under a building are fs-spawn, inside it', Boolean(inside) && /inside/.test(inside.message)
      && placed.spawn.y === 0, inside ? inside.message : 'no fs-spawn');
    check('and that is not fs-pads-seat: they stand on the ground they were put on', !codesOf(d).includes('fs-pads-seat'));
    const top = topUnder(placed.solids, placed.spawn.x, placed.spawn.z);
    pads.position.z = top;
    placed = placeDocument(d);
    const padsItem = placed.items.find((it) => it.el === pads);
    check('pads raised to the roof are seated on it, at its top, and drawn there',
      top > 3 && placed.spawn.y === top && placed.spawn.base === top && padsItem.y === top,
      `roof ${top}, seat ${placed.spawn.y}, base ${placed.spawn.base}, drawn at ${padsItem.y}`);
    const onRoof = codesOf(d);
    check('with the roof open round the mat that is no warning at all', onRoof.length === 0, onRoof.join(', '));
    pads.position.z = top + 0.03;
    check('a Base 3 cm off the roof is the roof, and says nothing', placeDocument(d).spawn.y === top && codesOf(d).length === 0,
      codesOf(d).join(', '));
    pads.position.z = top + 1;
    placed = placeDocument(d);
    const seat = freestyleReport(d).warnings.find((x) => x.code === 'fs-pads-seat');
    check('a Base 1 m over the roof is still seated on the roof', placed.spawn.y === top && placed.spawn.base === top + 1,
      `seat ${placed.spawn.y}`);
    check('and fs-pads-seat says where, naming the building and the roof’s height',
      Boolean(seat) && seat.elementId === pads.id && seat.message.includes('on top of Building')
      && seat.message.includes(`${top.toFixed(2)} m`), seat ? seat.message : 'no fs-pads-seat');
    check('but nothing is in the way of the craft there', !codesOf(d).includes('fs-spawn'));
    pads.position.x = 100;
    const ground = freestyleReport(d).warnings.find((x) => x.code === 'fs-pads-seat');
    check('pads raised over nothing are on the ground, and it says so',
      placeDocument(d).spawn.y === 0 && Boolean(ground) && ground.message.includes('on the ground'),
      ground ? ground.message : 'no fs-pads-seat');
  }
  {
    /*
     * A ROW ACROSS TWO HEIGHTS. Four pads with the craft's mat (the second,
     * 0.75 m along the row) over a 0.5 m ledge and the rest on the paving.
     * The row is drawn at the seat of the craft's own mat, whatever the
     * middle of the row stands on, and the builder says the other mats are
     * off it, with Base right or wrong.
     */
    const d = fresh();
    freestylePlace(d, 'ledge', 80, 80.75, { dims: { length: 6, height: 0.5, depth: 0.9 } });
    const pads = freestylePlace(d, 'startPads', 80, 80, { z: 0.5, dims: { pads: 4 } });
    const placed = placeDocument(d);
    const drawn = placed.items.find((it) => it.el === pads);
    check('a row across a ledge is drawn at the seat of the craft’s mat, on the ledge',
      placed.spawn.y === 0.5 && drawn.y === placed.spawn.y, `seat ${placed.spawn.y}, drawn at ${drawn.y}`);
    const seat = freestyleReport(d).warnings.find((x) => x.code === 'fs-pads-seat');
    check('and fs-pads-seat names a mat that is off it', Boolean(seat) && /mat 1 sits at 0\.00 m/.test(seat.message),
      seat ? seat.message : 'no fs-pads-seat');
    pads.position.z = 0;
    const low = freestyleReport(d).warnings.find((x) => x.code === 'fs-pads-seat');
    check('and with Base left at 0 it says both: where to set Base, and that the row is split',
      Boolean(low) && /Set Base to 0\.50 m/.test(low.message) && /two heights/.test(low.message),
      low ? low.message : 'no fs-pads-seat');
  }
  {
    /*
     * A START ON A BRIDGE DECK. The road bridge's girders and cross frames
     * are under its deck, within a metre of a craft on it, and under its
     * floor, not in the air it takes off into.
     */
    const d = fresh();
    freestylePlace(d, 'bridge', 80, 80, { style: 'road' });
    const deck = placeDocument(d).solids.find((s) => s.name === 'deck').box;
    freestylePlace(d, 'startPads', 80, 80.75, { z: deck[4], dims: { pads: 1 } });
    const placed = placeDocument(d);
    const codes = codesOf(d);
    check('pads on a road bridge’s deck, over a cross frame, are seated on it and say nothing',
      placed.spawn.y === deck[4] && codes.length === 0, `seat ${placed.spawn.y}, deck ${deck[4]}: ${codes.join(', ')}`);
  }
  {
    /*
     * ON A MAT. The pads' middle is bare paving between two mats whenever
     * there is an even number of them, so the spawn is moved along the row
     * onto the mat the race path uses (startBlockLaneOffset), and must land
     * on a mat's centre as padsLayout lays it, at every heading. The last
     * three rows are hand edits the builder would not make: padsLayout
     * draws a spacing under 0.3 m at 0.3, and the craft follows the drawing.
     */
    const off = [];
    for (const [n, spacing] of [[1], [2], [3], [4], [4, 0], [2, 0.1], [3, 0.2]]) {
      for (const yaw of [0, 0.7, Math.PI / 2, 2.2, -Math.PI, -1.1]) {
        const d = fresh();
        const dims = spacing === undefined ? { pads: n } : { pads: n, spacing };
        const pads = freestylePlace(d, 'startPads', 80, 80, { yaw, dims });
        const placed = placeDocument(d);
        const it = placed.items.find((i) => i.el === pads);
        const mats = padsLayout(pads).map((p) => (p.lo[2] + p.hi[2]) / 2);
        const want = mats[Math.floor((n - 1) / 2)];
        /* The spawn in the pads' own frame, turned back with plain Math:
         * this is the reference, not the physics. */
        const c = Math.cos(it.yaw);
        const s = Math.sin(it.yaw);
        const dx = placed.spawn.x - it.x;
        const dz = placed.spawn.z - it.z;
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        const heading = Math.abs(wrapAngle(placed.spawn.yaw - (pads.yaw - Math.PI / 2)));
        if (!(Math.abs(lx) < 1e-9 && Math.abs(lz - want) < 1e-9 && heading < 1e-12)) {
          off.push(`${n} pads ${spacing ?? 'default'} apart at ${yaw.toFixed(2)}: local (${lx.toFixed(4)}, ${lz.toFixed(4)}), mat at ${want}`);
        }
      }
    }
    check('the spawn is on a mat for 1, 2, 3 and 4 pads, and rows spaced under 0.3 m, at six headings, facing the pads’ way', off.length === 0, off.join('; '));
  }
  {
    /*
     * THE GROUND UNDER A POINT, which is the built map's height. The index
     * answers what walking every solid answers, at every point and every
     * height a query is made from.
     */
    const placed = placeDocument(map);
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let differ = 0;
    let roofs = 0;
    for (let i = 0; i < 20000; i += 1) {
      const x = -90 + rnd() * 180;
      const z = -90 + rnd() * 180;
      const from = rnd() < 0.1 ? undefined : -1 + rnd() * 30;
      const a = topUnder(placed.tops, x, z, from);
      if (a !== topUnder(placed.solids, x, z, from)) {
        differ += 1;
      }
      /* And asked for a craft, with its CG, the way the shell asks. */
      const cg = from === undefined ? undefined : from + rnd() * 0.6;
      if (topUnder(placed.tops, x, z, from, cg) !== topUnder(placed.solids, x, z, from, cg)) {
        differ += 1;
      }
      if (a > 0) {
        roofs += 1;
      }
    }
    check('the box top index answers exactly what the plain walk does, at 20000 points', differ === 0 && roofs > 100,
      `${differ} differ, ${roofs} over a box`);
    /* A footbridge's deck is ground to a craft on it and sky to one under
     * it, and a wall's face is not a floor from beside it: the warehouse's
     * west wall, which has nothing built off it. */
    const d = fresh();
    freestylePlace(d, 'bridge', 80, 80);
    const b = freestylePlace(d, 'building', 30, 30, { style: 'warehouse' });
    const p2 = placeDocument(d);
    /* Three metres in from the deck's end, clear of the pier in its
     * middle. */
    const deck = p2.solids.find((s) => s.name === 'deck').box;
    const mx = deck[0] + 3;
    const mz = (deck[2] + deck[5]) / 2;
    const CG = 0.045;
    const BIAS = 0.4;
    check('under a footbridge the ground is the paving, on it the deck',
      groundUnder(p2.tops, mx, mz, deck[1] - 1.5 - BIAS) === 0
      && groundUnder(p2.tops, mx, mz, deck[4] + CG - BIAS) === deck[4] - SUPPORT_TIE,
      `under ${groundUnder(p2.tops, mx, mz, deck[1] - 1.5 - BIAS)}, on ${groundUnder(p2.tops, mx, mz, deck[4] + CG - BIAS)}, deck ${deck[4]}`);
    const it = p2.items.find((i) => i.el === b);
    const roofTop = topUnder(p2.solids, it.x, it.z);
    const body = p2.solids.find((s) => s.box && s.box[4] === roofTop && s.box[0] < it.x && s.box[3] > it.x
      && s.box[2] < it.z && s.box[5] > it.z).box;
    check('a centimetre off a building’s wall at its roof’s height is the paving, a centimetre in is the roof',
      roofTop > 3 && topUnder(p2.tops, body[0] - 0.01, it.z, roofTop + CG - BIAS) === 0
      && topUnder(p2.tops, body[0] + 0.01, it.z, roofTop + CG - BIAS) === roofTop,
      `wall at x ${body[0]}, roof ${roofTop}`);
    /* A scaffold board is 5 cm, well inside the 0.15 m the query reaches
     * over the CG: to a craft under it, with the CG passed, it is sky, and
     * to a craft on it the ground. */
    const d3 = fresh();
    freestylePlace(d3, 'scaffold', 80, 80);
    const p3 = placeDocument(d3);
    const board = p3.solids.find((s) => s.name === 'board' && s.box[1] > 1).box;
    const bx = (board[0] + board[3]) / 2;
    const bz = (board[2] + board[5]) / 2;
    const under = board[1] - 0.04;
    const on = board[4] + CG;
    check('a scaffold board is sky to a craft under it, with the CG passed, and ground to one on it',
      board[4] - board[1] < 0.15
      && groundUnder(p3.tops, bx, bz, under - BIAS, under) < board[1]
      && groundUnder(p3.tops, bx, bz, under - BIAS) === board[4] - SUPPORT_TIE
      && groundUnder(p3.tops, bx, bz, on - BIAS, on) === board[4] - SUPPORT_TIE,
      `board ${board[1]} to ${board[4]}: under ${groundUnder(p3.tops, bx, bz, under - BIAS, under)}, without the CG ${groundUnder(p3.tops, bx, bz, under - BIAS)}, on ${groundUnder(p3.tops, bx, bz, on - BIAS, on)}`);
  }
  {
    const d = fresh();
    freestylePlace(d, 'startPads', 140, 140);
    freestylePlace(d, 'building', 40, 40);
    const b2 = freestylePlace(d, 'building', 44, 40);
    const w = freestyleReport(d).warnings.find((x) => x.code === 'fs-overlap');
    check('two buildings built through each other overlap, naming the later one', w && w.elementId === b2.id);
    const d2 = fresh();
    freestylePlace(d2, 'startPads', 140, 140);
    freestylePlace(d2, 'crane', 60, 60);
    freestylePlace(d2, 'crane', 60, 60, { yaw: 1.2 });
    check('two cranes through each other overlap too, capsule on capsule', codesOf(d2).includes('fs-overlap'));
  }
  {
    /*
     * MORE SHAPES IN ONE PLACE THAN THE PHYSICS LOOKS AT. Six tall stacks
     * of radius 2.4 m in a block with 1.2 m slots put some 1700 shapes in
     * two by two cells of the module's grid, which keeps 1024 of them round
     * the craft (crowdOf; the module's side of it is held in
     * scripts/props-check.js). One stack does not, and neither does the
     * starter.
     */
    const block = (n) => {
      const d = fresh();
      freestylePlace(d, 'startPads', 140, 140);
      for (let i = 0; i < n; i += 1) {
        freestylePlace(d, 'chimney', 60 + (i % 3) * 6, 60 + Math.floor(i / 3) * 6, { dims: { height: 20, radius: 2.4 } });
      }
      return d;
    };
    const six = freestyleReport(block(6)).warnings.find((x) => x.code === 'fs-crowded');
    check('six tall stacks with 1.2 m slots are more than the physics looks at, and it says so',
      Boolean(six) && /1024 at most/.test(six.message), six ? six.message : 'no fs-crowded');
    check('one is not', !codesOf(block(1)).includes('fs-crowded'));
  }
  {
    /* A ledge is one box 0.9 m deep across its heading, so two of them
     * y metres apart centre to centre leave y - 0.9 of air between. */
    const slot = (gap) => {
      const d = fresh();
      freestylePlace(d, 'startPads', 140, 140);
      freestylePlace(d, 'ledge', 40, 40);
      freestylePlace(d, 'ledge', 40, 40 + 0.9 + gap);
      return freestyleReport(d).warnings.find((x) => x.code === 'fs-slot');
    };
    const w = slot(0.8);
    check('two ledges 0.8 m apart are a slot a five inch cannot fit', Boolean(w) && Math.abs(w.clearance - 0.8) < 1e-6,
      w ? `${w.clearance}` : 'none');
    check('but 1.6 m apart they are a line', !slot(1.6));
    check('and 2 cm apart they are closed, which the gap rule allows', !slot(0.02));
    check('a slot exactly at the gap rule is allowed', !slot(GAP_MIN + 1e-6));
    const d = fresh();
    freestylePlace(d, 'startPads', 140, 140);
    /* The flats' balconies reach 6.3 m west of their centre. The lamp's arm
     * reaches 2 m along its own x, so it is turned to point away, and the
     * post alone stands 0.6 m off the balconies' parapet and slab. */
    freestylePlace(d, 'building', 40, 40);
    freestylePlace(d, 'lamp', 40 - 6.3 - 0.6, 40, { yaw: Math.PI });
    check('a lamp post 0.6 m off a building\u2019s balconies is a slot, capsule against box', codesOf(d).includes('fs-slot'));
  }
  {
    const d = fresh();
    freestylePlace(d, 'startPads', 140, 140);
    const gap = freestylePlace(d, 'gap', 40, 40, { name: 'LAMP GAP' });
    freestylePlace(d, 'lamp', 40, 40);
    const w = freestyleReport(d).warnings.find((x) => x.code === 'fs-gap-blocked');
    check('a lamp post standing in a named gap blocks it, pointing at the gap', w && w.elementId === gap.id);
    const d2 = fresh();
    freestylePlace(d2, 'startPads', 140, 140);
    /* A building's front is its own +x, so it is turned a quarter to face
     * south at the window, which lies across it: the front wall is 3 m
     * north of the window's plane and the open corridor, 1.6 m deep from
     * 2.72 m up, reaches to 1.4 m from it. The stair is on an end, 6 m or
     * more east or west of the window's side. */
    freestylePlace(d2, 'gap', 40, 40, { yaw: Math.PI / 2 });
    freestylePlace(d2, 'building', 40, 40 + 3 + 4.5, { yaw: -Math.PI / 2 });
    check('a gap across a building’s front, clear of it, is not blocked', !codesOf(d2).includes('fs-gap-blocked'));
    freestylePlace(d2, 'containers', 40, 40, { yaw: Math.PI / 2 });
    check('but a container parked in it is', codesOf(d2).includes('fs-gap-blocked'));
    const d3 = fresh();
    freestylePlace(d3, 'startPads', 140, 140);
    freestylePlace(d3, 'gap', 40, 40, { z: 4 });
    freestylePlace(d3, 'car', 40, 40, { yaw: Math.PI / 2 });
    check('a gap raised four metres over a parked car is clear', !codesOf(d3).includes('fs-gap-blocked'));
  }
  {
    const d = fresh();
    freestylePlace(d, 'startPads', 140, 140);
    freestylePlace(d, 'building', -10, 40);
    freestylePlace(d, 'building', 4, 100);
    freestylePlace(d, 'gap', 170, 40);
    const out = freestyleReport(d).warnings.filter((x) => x.code === 'fs-outside');
    check('an asset outside the plot, one reaching past its edge and a gap off it all warn', out.length === 3,
      out.map((x) => x.message).join(' | '));
  }
  {
    const d = fresh();
    freestylePlace(d, 'startPads', 5, 5);
    const perCrane = partsOf(createElement(d, 'crane', { x: 0, y: 0, z: 0 })).filter((p) => p.solid).length;
    const n = Math.floor(FREESTYLE_SOLIDS_MAX / perCrane) + 1;
    const side = Math.ceil(Math.sqrt(n));
    d.field.width = side * 80 + 40;
    d.field.depth = side * 80 + 40;
    for (let i = 0; i < n; i += 1) {
      freestylePlace(d, 'crane', 30 + (i % side) * 80, 30 + Math.floor(i / side) * 80);
    }
    const r = freestyleReport(d);
    check(`${n} cranes are ${r.solids} solids, over the budget, and it says so`,
      r.solids > FREESTYLE_SOLIDS_MAX && r.warnings.some((x) => x.code === 'fs-solids'));
    d.elements.pop();
    const under = freestyleReport(d);
    check('one crane fewer is under it and says nothing',
      under.solids <= FREESTYLE_SOLIDS_MAX && !under.warnings.some((x) => x.code === 'fs-solids'), `${under.solids}`);
  }
  {
    /* Three hundred assets, the size a real map might reach, in the time
     * an edit can afford. Generous, because this is a shared machine. */
    const d = fresh();
    d.field.width = 600;
    d.field.depth = 600;
    for (let i = 0; i < 300; i += 1) {
      freestylePlace(d, FREESTYLE_PALETTE_ORDER[i % FREESTYLE_PALETTE_ORDER.length], 20 + (i % 17) * 34, 20 + Math.floor(i / 17) * 32);
    }
    freestyleReport(d);
    const t0 = performance.now();
    freestyleReport(d);
    const ms = performance.now() - t0;
    check('a 300 element map is checked in well under a quarter second', ms < 250, `${ms.toFixed(1)} ms`);
  }

  /* -------- a race track is untouched -------- */

  {
    const race = createTrack('Plain race');
    place(race, 'gate', 10, 10);
    place(race, 'startPads', 5, 5);
    const plain = toPlain(race);
    check('a race track writes no mode key', !Object.prototype.hasOwnProperty.call(plain, 'mode')
      && !serialize(race).includes('"mode"'));
    check('and raises none of the map warnings', !collectWarnings(race, buildPath(race)).some((w) => w.code.startsWith('fs-')));
    check('and a hand written race mode reads as a race track', docModeOf(deserialize(JSON.stringify({ ...plain, mode: 'race' })).doc) === 'race');
  }
}

function shoelace(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(a) / 2;
}

/*
 * schema.md's table of the freestyle assets is written by hand from
 * src/props/types.js, so this is what keeps it honest: every asset has a
 * row, and the row names its key, its heading rule and every dimension.
 */
function suiteSchemaProps() {
  console.log('\nschema.md, the freestyle assets');
  const here = dirname(fileURLToPath(import.meta.url));
  let md = '';
  try {
    md = readFileSync(join(here, 'schema.md'), 'utf8');
  } catch (e) {
    check('schema.md is readable', false, e.message);
    return;
  }
  const rows = new Map();
  for (const line of md.split('\n')) {
    const m = line.match(/^\| `([A-Za-z]+)` \|/);
    if (m) {
      rows.set(m[1], line);
    }
  }
  const missing = [];
  const wrong = [];
  for (const [id, t] of Object.entries(PROP_TYPES)) {
    const row = rows.get(id);
    if (!row) {
      missing.push(id);
      continue;
    }
    const cells = row.split('|').map((c) => c.trim());
    const keyCell = cells[2];
    const okKey = t.key ? keyCell === t.key : (keyCell === '' || keyCell === 'none');
    const okTurns = row.includes(t.turns);
    const okDims = Object.keys(t.dims).every((k) => row.includes(`\`${k}\``));
    const okStyles = !t.styles || t.styles.every((s) => row.includes(`\`${s}\``));
    if (!okKey || !okTurns || !okDims || !okStyles) {
      wrong.push(id);
    }
  }
  check('every asset has a row in schema.md', missing.length === 0, missing.join(', '));
  check('and each row names its key, its turns, its styles and every dimension', wrong.length === 0, wrong.join(', '));
  for (const id of ['pole', 'horizontalPole']) {
    check(`the element table lists ${id}`, rows.has(id));
  }
  check('the top of schema.md names the schema version this build writes',
    md.includes(`Everything below describes \`schemaVersion: ${SCHEMA_VERSION}\``));
}

/*
 * ROADS AND VEHICLES IN THE DOCUMENT (Stage E). A road's nodes are relative
 * to its position and a vehicle's place is its road and offset, so neither
 * carries a field worked out from another; both round trip byte for byte;
 * hostile input is repaired and never throws; and a race document is
 * untouched by any of it: no road or vehicle is ever read or written on
 * one, and the race palettes and tuning are what they were. The geometry
 * and the physics are scripts/roads-check.js's.
 */
function suiteRoadsAndVehicles() {
  console.log('\nroads and vehicles');
  const map = createTrack(undefined, 'full', 'freestyle');
  const road = createElement(map, 'road', { x: 40, y: 50 });
  map.elements.push(road);
  const car = createElement(map, 'vehicle', { x: 70, y: 70 });
  car.road = road.id;
  map.elements.push(car);
  check('a new road is two nodes 20 m apart on the ground, relative to its position',
    road.nodes.length === 2 && road.nodes[0].x === 0 && road.nodes[1].x === 20 && road.position.x === 40
    && road.position.z === 0 && road.closed === false);
  check('a new vehicle has no place of its own, and starts at its style\'s speed',
    car.position.x === 0 && car.position.y === 0 && car.style === CAR_STYLES[0]
    && car.dims.speed === 11 && car.reverse === false && car.drift === false);
  check('neither is a solid of the map nor in its flying order',
    placeDocument(map).solids.length === 0 && !isSequenceable(road) && !isSequenceable(car));
  let refused = 0;
  for (const el of [road, car]) {
    try {
      createSequenceEntry(map, el.id);
    } catch (e) {
      refused += 1;
    }
  }
  check('and createSequenceEntry refuses both', refused === 2);

  const text = serialize(map);
  const back = deserialize(text);
  check('a map with a road and a vehicle reads back with no repairs', back.repairs.length === 0, back.repairs.join('; '));
  check('and round trips byte for byte', serialize(back.doc) === text);
  const edited = deserialize(text).doc;
  const er = edited.elements.find((e) => e.type === 'road');
  const ev = edited.elements.find((e) => e.type === 'vehicle');
  er.nodes = [{ x: 0, y: 0 }, { x: 30.25, y: 0 }, { x: 30.25, y: 40 }, { x: -5, y: 40 }];
  er.closed = true;
  er.dims = { width: 8.5, lanes: 1, radius: 20 };
  ev.dims = { offset: 33.3, speed: 18.5, variant: 7 };
  ev.style = 'boxtruck';
  ev.reverse = true;
  ev.drift = true;
  const text2 = serialize(edited);
  const read2 = deserialize(text2);
  const r2 = read2.doc.elements.find((e) => e.type === 'road');
  const v2 = read2.doc.elements.find((e) => e.type === 'vehicle');
  check('an edited road and vehicle round trip byte for byte, every field kept',
    read2.repairs.length === 0 && serialize(read2.doc) === text2
    && r2.nodes.length === 4 && r2.nodes[3].x === -5 && r2.closed === true && r2.dims.lanes === 1 && r2.dims.width === 8.5
    && v2.dims.offset === 33.3 && v2.dims.speed === 18.5 && v2.style === 'boxtruck' && v2.reverse === true && v2.drift === true
    && v2.road === r2.id, read2.repairs.join('; '));
  /* Dragged about in memory, a vehicle's unused place and a road's height
   * are still written as the read will keep them. */
  const moved = deserialize(text).doc;
  moved.elements.find((e) => e.type === 'vehicle').position = { x: 12, y: 34, z: 5 };
  moved.elements.find((e) => e.type === 'road').position.z = 3;
  moved.elements.find((e) => e.type === 'road').yaw = 1.2;
  check('a vehicle moved or a road raised in memory still round trips cleanly', roundTripsCleanly(moved)
    && serialize(moved).includes('"x": 40') && !serialize(moved).includes('"y": 34'));

  /* Hostile input: repaired, never thrown about. */
  let hostile = null;
  let threw = null;
  try {
    hostile = normalize({
      mode: 'freestyle',
      elements: [
        { id: 'el-1', type: 'road', position: { x: 1, y: 2, z: 9 }, yaw: 2, dims: { width: 99, lanes: 7, radius: -1 },
          nodes: [{ x: 0, y: 0 }, { x: 'a', y: 1 }, { x: 1e300, y: 0 }, null, 7, { x: 5, y: NaN }, { x: 5, y: 5 }], closed: 'yes' },
        { id: 'el-2', type: 'vehicle', position: { x: 9, y: 9 }, dims: { offset: -5, speed: 1e9, variant: 3.7 },
          style: 'tank', road: 'el-99', reverse: 1, drift: 'true' },
        { id: 'el-3', type: 'road', nodes: 'x', dims: { lanes: 0, width: 'wide' } },
        { id: 'el-4', type: 'vehicle', road: 42, dims: { speed: NaN } },
        { id: 'el-5', type: 'road', nodes: Array.from({ length: ROAD_NODES_MAX + 10 }, (_, i) => ({ x: i, y: (i % 2) * 3 })) },
      ],
    });
  } catch (e) {
    threw = e;
  }
  check('hostile roads and vehicles never throw', threw === null, threw && threw.message);
  if (hostile) {
    const [h1, h2, h3, h4, h5] = hostile.doc.elements;
    check('bad nodes are dropped, with a note', h1.nodes.length === 2 && h1.nodes[1].x === 5
      && hostile.repairs.some((r) => r.includes('el-1') && r.includes('5 nodes')), hostile.repairs.join('; '));
    check('widths, lanes and radii are clamped, a road put on the ground and turned by nothing',
      h1.dims.width === 20 && h1.dims.lanes === 2 && h1.dims.radius === 2 && h1.position.z === 0 && h1.yaw === 0
      && h1.closed === false && h3.dims.lanes === 1 && h3.dims.width === ELEMENTS.road.dims.width);
    check('nodes that are not a list read as none, with a note',
      h3.nodes.length === 0 && hostile.repairs.some((r) => r.includes('el-3') && r.includes('not a list')));
    check(`a road keeps ${ROAD_NODES_MAX} nodes and says it dropped the rest`,
      h5.nodes.length === ROAD_NODES_MAX && hostile.repairs.some((r) => r.includes('el-5') && r.includes('10 nodes')));
    check('a vehicle whose road is missing is kept, pointing at it', h2.road === 'el-99' && h4.road === '');
    check('a vehicle\'s speed, offset, variant, style and flags are repaired',
      h2.dims.speed === 50 && h2.dims.offset === 0 && h2.dims.variant === 4 && h2.style === CAR_STYLES[0]
      && h2.reverse === false && h2.drift === false && h2.position.x === 0 && h4.dims.speed === ELEMENTS.vehicle.dims.speed);
    const again = deserialize(serialize(hostile.doc));
    check('and the repaired document reads back with no repairs, byte for byte',
      again.repairs.length === 0 && serialize(again.doc) === serialize(hostile.doc), again.repairs.join('; '));
    const t = trafficOf(hostile.doc);
    check('trafficOf a hostile map leaves every vehicle parked with a problem, and never throws',
      t.vehicles.length === 0 && t.problems.filter((p) => p.code === 'tr-no-road').length === 2,
      t.problems.map((p) => p.code).join(', '));
  }

  /* A race document is untouched by any of this. */
  const race = createTrack('Race with a road');
  race.elements.push(createElement(race, 'gate', { x: 10, y: 10 }));
  const raceBytes = serialize(race);
  race.elements.push(createElement(race, 'road', { x: 20, y: 20 }));
  race.elements.push(createElement(race, 'vehicle', { x: 20, y: 20 }));
  check('a race track in memory with a road and a vehicle writes the bytes it wrote without them',
    serialize(race) === raceBytes);
  const raceRead = normalize({ ...JSON.parse(raceBytes), elements: [...JSON.parse(raceBytes).elements, ...toPlain({ ...map, elements: map.elements }).elements] });
  check('and reading one drops both, with a note each',
    raceRead.doc.elements.length === 1 && raceRead.repairs.filter((r) => r.includes('a map\'s only')).length === 2,
    raceRead.repairs.join('; '));
  check('trafficOf a race track is empty', trafficOf(race).roads.length === 0 && trafficOf(race).vehicles.length === 0);
  for (const cls of ['full', 'micro']) {
    const items = paletteItems(cls, 'race');
    check(`no road or vehicle is on the ${cls} race palette, and no key arms one`,
      !items.some((d) => isTrafficType(d.id)) && ![...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].some((k) => isTrafficType(elementByKey(k, cls, 'race')?.id)));
  }
  check('the race tuning is what it was', tuningFor('full', 'race') === TUNING && tuningFor('micro', 'race').minCurveRadius === TUNING.micro.minCurveRadius);
  check('the inventory counts neither', countElementsByType([road, car]).length === 0);

  /* schema.md's own examples of the two are what this build reads and
   * writes. */
  const here = dirname(fileURLToPath(import.meta.url));
  const md = readFileSync(join(here, 'schema.md'), 'utf8');
  const examples = [...md.matchAll(/```jsonc\r?\n([\s\S]*?)```/g)].map((m) => {
    try {
      return JSON.parse(m[1]);
    } catch (e) {
      return null;
    }
  }).filter((o) => o && (o.type === 'road' || o.type === 'vehicle'));
  const exDoc = normalize({ ...toPlain(createTrack(undefined, 'full', 'freestyle')), elements: examples });
  const plain = toPlain(exDoc.doc).elements;
  check('schema.md\'s road and vehicle examples read with no repairs and are written back exactly',
    examples.length === 2 && exDoc.repairs.length === 0
    && examples.every((ex, i) => JSON.stringify(ex) === JSON.stringify(plain[i])), exDoc.repairs.join('; '));

  /* The starter carries a loop and its traffic, with fixed ids. */
  const yard = normalize(starterMap());
  const ids = yard.doc.elements.map((e) => e.id);
  check('the starter reads with no repairs and its ids run el-1 up in order',
    yard.repairs.length === 0 && ids.every((id, i) => id === `el-${i + 1}`), yard.repairs.join('; '));
  const loop = yard.doc.elements.find((e) => e.type === 'road');
  const rl = roadOf(loop);
  check('the starter\'s road is a loop whose line has no problems', loop.closed && rl.centre.points.length > 100
    && rl.problems.length === 0, rl.problems.map((p) => p.message).join('; '));
  const traffic = trafficOf(yard.doc);
  const drift = traffic.vehicles.filter((v) => v.drift > 0);
  check('trafficOf the starter: two lanes, three vehicles, one of them the drift car, no problems',
    traffic.roads.length === 2 && traffic.vehicles.length === 3 && drift.length === 1 && drift[0].drift === DRIFT.gain
    && traffic.vehicles.some((v) => v.style === 'boxtruck') && traffic.problems.length === 0,
    traffic.problems.map((p) => p.message).join('; '));
}

/*
 * THE ROAD TOOL. Everything it decides is a pure function in ./roadtool.js,
 * so each rule is held here: laying and closing a road, inserting, moving
 * and deleting a node, putting a car on a road and where a car with none is
 * drawn, the lap time the lane warning reads, and every road warning, each
 * with a case that fires and a case that does not.
 */
function roadMap(opts = {}) {
  const d = createTrack(undefined, 'full', 'freestyle');
  const road = createElement(d, 'road', { x: 50, y: 50 });
  road.nodes = opts.nodes ?? [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }, { x: 0, y: 40 }];
  road.closed = opts.closed ?? true;
  road.dims.lanes = opts.lanes ?? 2;
  d.elements.push(road);
  freestylePlace(d, 'startPads', 80, 75);
  return { d, road };
}

function addCar(d, road, offset, opts = {}) {
  const car = createElement(d, 'vehicle', { x: 0, y: 0 });
  car.road = road.id;
  car.dims.offset = offset;
  if (opts.speed != null) {
    car.dims.speed = opts.speed;
  }
  car.reverse = opts.reverse === true;
  car.drift = opts.drift === true;
  if (opts.style) {
    car.style = opts.style;
  }
  d.elements.push(car);
  return car;
}

function roadCodes(d) {
  return freestyleReport(d).warnings.filter((w) => /^(rd|tr)-/.test(w.code) || w.code === 'fs-outside');
}

function suiteRoadTool() {
  console.log('\nthe road tool');
  const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

  /* -------- laying a road -------- */

  let draft = [];
  draft = addDraftNode(draft, { x: 10, y: 10 });
  draft = addDraftNode(draft, { x: 10, y: 10.01 });
  check('a click on the last node is not a second node', draft.length === 1);
  draft = addDraftNode(draft, { x: 40, y: 10 });
  check('two nodes finish an open road, on the last node', endsDraft(draft, 40.2, 10, 0.5) && !endsDraft(draft, 30, 10, 0.5));
  check('and do not close a loop, even on the first node', !closesDraft(draft, 10, 10, 0.5));
  draft = addDraftNode(draft, { x: 40, y: 40 });
  check('three nodes close a loop on the first node, and only there',
    closesDraft(draft, 10.3, 10.2, 0.5) && !closesDraft(draft, 12, 10, 0.5));
  const laid = roadFromDraft(draft, true);
  check('a laid road starts at its first node, its nodes measured from there',
    laid && laid.position.x === 10 && laid.position.y === 10 && laid.closed === true
    && laid.nodes[0].x === 0 && laid.nodes[2].x === 30 && laid.nodes[2].y === 30);
  check('too few nodes lay nothing', roadFromDraft(draft.slice(0, 2), true) === null
    && roadFromDraft(draft.slice(0, 1), false) === null && roadFromDraft(draft.slice(0, 2), false) !== null);

  /* -------- editing its nodes -------- */

  const open = { position: { x: 10, y: 10 }, nodes: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }], closed: false };
  const loop = { ...open, closed: true };
  check('an open road has a leg fewer than its nodes, a loop as many', legCount(open) === 2 && legCount(loop) === 3);
  const mids = legMidpoints(loop);
  check('each leg offers its middle for a new node, the loop’s closing leg too',
    mids.length === 3 && mids[0].x === 25 && mids[0].y === 10 && mids[2].x === 25 && mids[2].y === 25);
  const ins = insertNode(open, 1, { x: 45, y: 20 });
  check('a node inserted on leg 2 goes between nodes 2 and 3, and nothing else moves',
    ins && ins.index === 2 && ins.nodes.length === 4 && ins.nodes[2].x === 35 && ins.nodes[2].y === 10
    && ins.position.x === 10 && ins.nodes[3].x === 30);
  const insLoop = insertNode(loop, 2, { x: 5, y: 20 });
  check('on a loop’s closing leg it goes last', insLoop && insLoop.index === 3 && insLoop.nodes[3].x === -5);
  check('a leg the road does not have takes no node', insertNode(open, 2, { x: 0, y: 0 }) === null && insertNode(open, -1, { x: 0, y: 0 }) === null);
  const full = { position: { x: 0, y: 0 }, nodes: Array.from({ length: ROAD_NODES_MAX }, (_, i) => ({ x: i, y: 0 })), closed: false };
  check(`nor does a road of ${ROAD_NODES_MAX} nodes`, insertNode(full, 0, { x: 0.5, y: 1 }) === null);
  const mv0 = moveNode(open, 0, { x: 0, y: 5 });
  check('moving the first node moves the road’s position and leaves the rest where they were',
    mv0.position.x === 0 && mv0.position.y === 5 && mv0.nodes[0].x === 0
    && mv0.position.x + mv0.nodes[2].x === 40 && mv0.position.y + mv0.nodes[2].y === 40);
  const mv2 = moveNode(open, 2, { x: 50, y: 50 });
  check('moving another moves only it', mv2.position.x === 10 && mv2.nodes[2].x === 40 && mv2.nodes[1].x === 30);
  const del1 = deleteNode(open, 1);
  check('deleting a node leaves the others where they were', del1 && del1.nodes.length === 2 && del1.nodes[1].x === 30 && del1.nodes[1].y === 30 && del1.closed === false);
  const del0 = deleteNode(loop, 0);
  check('deleting the first node starts the road at the next, and a loop of three opens',
    del0 && del0.position.x === 40 && del0.position.y === 10 && del0.nodes.length === 2 && del0.closed === false);
  check('an open road of two nodes loses none', deleteNode(del1, 0) === null && deleteNode(open, 5) === null);
  check('a node is picked within reach, the nearest', pickNode(open, 40.3, 10.2, 1) === 1 && pickNode(open, 25, 25, 1) === -1);
  check('and a leg by its middle', pickLeg(loop, 25.4, 10, 1) === 0 && pickLeg(open, 25, 25, 1) === -1);

  /* -------- a vehicle on a road -------- */

  const { d, road } = roadMap();
  const r = roadOf(road);
  const snap = snapToRoad(d, 80, 50.5, 2);
  check('a car dropped on a road goes on it, at the nearest point of its middle',
    snap && snap.road === road.id && near(snap.offset, Math.round(nearestOn(r.centre, 80, 50.5).s * 100) / 100) && near(snap.y, 50, 1e-6));
  check('dropped too far from any road, nowhere', snapToRoad(d, 80, 70, 2) === null);
  check('on the right hand half of a two lane loop it faces the other way',
    snapToRoad(d, 80, 48.5, 2).right === true && snap.right === false && snap.twoLaneLoop === true);
  check('sliding keeps a car to its own road, however far the pointer goes',
    snapToRoad(d, 80, 140, Infinity, road.id)?.road === road.id && snapToRoad(d, 80, 140, Infinity, 'el-99') === null);
  const car = addCar(d, road, snap.offset);
  const placeOn = vehiclePlace(d, car);
  check('a car on a road is drawn where the physics starts it, on its lane, facing along it',
    placeOn.onRoad && near(placeOn.x, 80, 0.05) && near(placeOn.y, 51.5, 0.05) && near(placeOn.tx, 1, 1e-6));
  const lost = addCar(d, road, 0);
  lost.road = 'el-99';
  const lost2 = addCar(d, road, 0);
  lost2.road = '';
  const p1 = vehiclePlace(d, lost);
  const p2 = vehiclePlace(d, lost2);
  check('a car with no road is parked in a row along the south edge, nose north',
    !p1.onRoad && p1.x === PARK.x && p1.y === PARK.y && p2.x === PARK.x + PARK.step && p1.ty === 1);
  check('and a new element never takes the id a car still names',
    newElementId(d) !== 'el-99' && Number(newElementId(d).slice(3)) > 99);
  check('two bodies on top of each other overlap, two apart do not',
    bodiesOverlap({ x: 0, y: 0, tx: 1, ty: 0, length: 4, width: 2 }, { x: 2.5, y: 0.5, tx: 0, ty: 1, length: 4, width: 2 })
    && !bodiesOverlap({ x: 0, y: 0, tx: 1, ty: 0, length: 4, width: 2 }, { x: 4.5, y: 0, tx: 1, ty: 0, length: 4, width: 2 }));

  /* -------- the module's lap time, restated -------- */

  const yard = normalize(starterMap()).doc;
  const tf = trafficOf(yard);
  const lane = tf.roads[tf.vehicles.find((v) => v.style === 'boxtruck').road];
  const mroad = moduleRoad(laneXyz(lane), lane.closed);
  const truck = tf.vehicles.find((v) => v.style === 'boxtruck');
  const van = tf.vehicles.find((v) => v.style === 'keivan');
  const tTruck = lapTable(mroad, truck.topSpeed, truck.lateral).T;
  const tVan = lapTable(mroad, van.topSpeed, van.lateral).T;
  check('the module’s lap, restated: the starter’s box truck and kei van lap together to a ten thousandth of a second',
    Math.abs(tTruck - tVan) < 1e-4 && tTruck > 30, `${tTruck} and ${tVan}`);
  check('so they are never a clash, however different their top speeds', laneClashes(tf, CLASH_HORIZON).length === 0);
  check('and a car half as fast again in their lane would be',
    laneClashes({ ...tf, vehicles: [truck, { ...van, topSpeed: truck.topSpeed * 1.5, lateral: truck.lateral * 1.5 }] }, CLASH_HORIZON)
      .some((c) => c.kind === 'catch'));

  /* -------- the warnings, each firing and not -------- */

  check('the starter yard raises no road or vehicle warning', roadCodes(yard).length === 0,
    roadCodes(yard).map((w) => w.message).join(' | '));
  {
    const m = roadMap();
    addCar(m.d, m.road, 20);
    const clean = roadCodes(m.d);
    check('a clean loop with a car on it raises nothing', clean.length === 0, clean.map((w) => w.message).join(' | '));
  }
  {
    const m = roadMap();
    freestylePlace(m.d, 'building', 80, 50);
    const w = roadCodes(m.d).find((x) => x.code === 'rd-solid');
    check('a road through a building warns, on the road, naming the building',
      w && w.elementId === m.road.id && w.message.includes('Building'));
    const m2 = roadMap();
    freestylePlace(m2.d, 'building', 80, 70);
    check('and one well clear of it does not', !roadCodes(m2.d).some((x) => x.code === 'rd-solid'));
    const m3 = roadMap();
    freestylePlace(m3.d, 'lamp', 80, 50 - 1.5 - 0.7);
    const m4 = roadMap();
    freestylePlace(m4.d, 'lamp', 80, 50 - 1.5 - 1.6);
    check('a lamp post within a car’s half width of the lane warns, one a car passes does not',
      roadCodes(m3.d).some((x) => x.code === 'rd-solid') && !roadCodes(m4.d).some((x) => x.code === 'rd-solid'));
    const m5 = roadMap();
    const bridge = freestylePlace(m5.d, 'bridge', 80, 50, { yaw: Math.PI / 2 });
    bridge.dims.piers = 0;
    check('a bridge deck over the road is not in a car’s way', !roadCodes(m5.d).some((x) => x.code === 'rd-solid'),
      roadCodes(m5.d).map((x) => x.message).join(' | '));
  }
  {
    const m = roadMap();
    m.d.elements.find((e) => e.type === 'startPads').position = { x: 80, y: 50, z: 0 };
    const w = roadCodes(m.d).find((x) => x.code === 'rd-start');
    check('a road over the start pads warns', w && w.elementId === m.road.id && w.message.includes('start pads'));
    const bare = createTrack(undefined, 'full', 'freestyle');
    const through = createElement(bare, 'road', { x: 2, y: 80 });
    through.nodes = [{ x: 0, y: 0 }, { x: 30, y: 0 }];
    bare.elements.push(through);
    check('with no pads, a road through where the pilot starts warns',
      roadCodes(bare).some((x) => x.code === 'rd-start' && x.message.includes('8 m in')));
    through.position.y = 100;
    check('and one clear of it does not', !roadCodes(bare).some((x) => x.code === 'rd-start'));
  }
  {
    const m = roadMap();
    m.road.nodes[1].x = 140;
    m.road.nodes[2].x = 140;
    const w = roadCodes(m.d).find((x) => x.code === 'fs-outside');
    check('a road run past the edge of the plot warns', w && w.elementId === m.road.id);
  }
  {
    const m = roadMap();
    const c1 = addCar(m.d, m.road, 20);
    removeElement(m.d, m.road.id);
    const w = roadCodes(m.d).find((x) => x.code === 'tr-no-road');
    check('a vehicle whose road was deleted warns that its road is gone, and names the car',
      w && w.elementId === c1.id && w.message.includes('not on the map any more'));
    const m2 = roadMap();
    addCar(m2.d, m2.road, 20);
    check('and one on a road does not', !roadCodes(m2.d).some((x) => x.code === 'tr-no-road'));
  }
  {
    const fold = roadMap({ nodes: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 10, y: 0 }], closed: false });
    const w = roadCodes(fold.d).find((x) => x.code === 'rd-fold' || x.code === 'rd-tight');
    check('a node road.js has to leave out warns, naming the road and the node', w && w.level === 'warn'
      && w.elementId === fold.road.id && w.node === 1 && w.message.startsWith('Road: '), w && w.message);
    const kink = roadMap({ nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10.3, y: 0.004 }, { x: 25, y: 0.004 }], closed: false });
    const k = roadCodes(kink.d).find((x) => x.code === 'rd-kink');
    check('a node it runs straight past is a note, naming the node', k && k.level === 'info' && Number.isInteger(k.node),
      roadCodes(kink.d).map((x) => x.code).join(', '));
    check('and a road with neither says nothing of its nodes', !roadCodes(roadMap().d).some((x) => /^rd-(fold|tight|kink)/.test(x.code)));
  }
  {
    /* The physics' limits, in trafficOf's own words. */
    const m = roadMap({ nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 90 }, { x: 0, y: 90 }] });
    for (let i = 0; i < 65; i += 1) {
      addCar(m.d, m.road, i * 6);
    }
    const over = roadCodes(m.d).filter((x) => x.code === 'tr-slots');
    const last = m.d.elements[m.d.elements.length - 1];
    check('more vehicles than the physics drives warns on the one left out, in trafficOf’s words',
      over.length === 1 && over[0].elementId === last.id && over[0].message.includes('64'));
    m.d.elements.pop();
    check('and 64 do not', !roadCodes(m.d).some((x) => x.code === 'tr-slots'));
    const lanes = createTrack(undefined, 'full', 'freestyle');
    for (let i = 0; i < 17; i += 1) {
      const rr = createElement(lanes, 'road', { x: 5, y: 5 + i * 8 });
      lanes.elements.push(rr);
      addCar(lanes, rr, 5);
    }
    check('more lanes of road than the physics holds warns on the car left parked',
      roadCodes(lanes).filter((x) => x.code === 'tr-lane').length === 1);
    lanes.elements.splice(-2, 2);
    check('and 16 do not', !roadCodes(lanes).some((x) => x.code === 'tr-lane'));
  }
  {
    const m = roadMap();
    addCar(m.d, m.road, 10, { speed: 10 });
    const fast = addCar(m.d, m.road, 90, { speed: 14 });
    const w = roadCodes(m.d).find((x) => x.code === 'tr-lane-clash');
    check('two cars in one lane at different speeds warn, on the second, saying when they meet',
      w && w.elementId === fast.id && w.message.includes('36 km/h') && w.message.includes('50 km/h'), w && w.message);
    const same = roadMap();
    addCar(same.d, same.road, 10, { speed: 12 });
    addCar(same.d, same.road, 90, { speed: 12 });
    check('two at the same speed do not', !roadCodes(same.d).some((x) => x.code === 'tr-lane-clash'));
    const both = roadMap();
    addCar(both.d, both.road, 10, { speed: 10 });
    addCar(both.d, both.road, 90, { speed: 14, reverse: true });
    check('nor two in opposite lanes of a two lane loop', !roadCodes(both.d).some((x) => x.code === 'tr-lane-clash'));
    const one = roadMap({ lanes: 1 });
    addCar(one.d, one.road, 10);
    addCar(one.d, one.road, 90, { reverse: true });
    check('but two going opposite ways round a one lane loop do: head on',
      roadCodes(one.d).some((x) => x.code === 'tr-lane-clash' && x.message.includes('opposite directions')));
    const openRoad = roadMap({ closed: false });
    addCar(openRoad.d, openRoad.road, 10);
    addCar(openRoad.d, openRoad.road, 60);
    check('and so do two on one open road, out and back along its middle',
      roadCodes(openRoad.d).some((x) => x.code === 'tr-lane-clash' && x.message.includes('open road')));
  }
  {
    const m = roadMap();
    const a = addCar(m.d, m.road, 20);
    const b = addCar(m.d, m.road, 21);
    const w = roadCodes(m.d).find((x) => x.code === 'tr-overlap');
    check('two cars that start on top of each other warn, on the second', w && w.elementId === b.id && w.otherId === a.id);
    b.dims.offset = 40;
    check('and two a car apart do not', !roadCodes(m.d).some((x) => x.code === 'tr-overlap'));
  }
  check('a race track is never asked about any of it', collectWarnings(createTrack(), null).every((w) => !/^(rd|tr)-/.test(w.code)));

  /* -------- the palette -------- */

  const items = paletteItems('full', 'freestyle').map((dd) => dd.id);
  check('a map’s palette ends its assets with the road tool and the vehicle, under Roads and vehicles',
    items.includes('road') && items.includes('vehicle') && ELEMENTS.road.propGroup === 'roads' && ELEMENTS.vehicle.propGroup === 'roads'
    && items.indexOf('road') > items.indexOf(FREESTYLE_PALETTE_ORDER[FREESTYLE_PALETTE_ORDER.length - 1]));
}

async function suiteListing() {
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

  /*
   * KEEPING WHAT A SEAT HELD before it is replaced (keepDisplaced in
   * ./storage.js, the builder's keepSeat and the simulator's seatLocal),
   * in a storage held in memory, then in one that is full.
   */
  const had = globalThis.localStorage;
  const store = new Map();
  let full = false;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (full) {
        throw new Error('QuotaExceededError');
      }
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
  try {
    const lib = () => Object.values(JSON.parse(store.get('webfpv.trackbuilder.library.v1') || '{}'));
    const map = createTrack('My map', 'full', 'freestyle');
    map.elements.push(createElement(map, 'tree', { x: 20, y: 20, z: 0 }, 0));
    const first = keepDisplaced(map);
    check('a seat Load does not have goes into Load as itself', first.ok && first.saved === map && lib().length === 1);
    const same = keepDisplaced(normalize(toPlain(map)).doc);
    check('the same document again needs nothing', same.ok && same.saved === null && lib().length === 1);
    map.elements.push(createElement(map, 'tree', { x: 40, y: 20, z: 0 }, 0));
    const edited = keepDisplaced(map);
    check('one edited since its Save goes in as a copy, and the saved one stays',
      edited.ok && Boolean(edited.saved) && edited.saved.id !== map.id && edited.saved.name === 'My map (unsaved changes)'
      && lib().length === 2 && lib().some((d) => d.id === map.id && d.elements.length === 1)
      && lib().some((d) => d.id === edited.saved.id && d.elements.length === 2),
      lib().map((d) => `${d.name}/${d.elements.length}`).join(', '));
    full = true;
    const other = createTrack('Other');
    other.elements.push(createElement(other, 'gate', { x: 10, y: 10, z: 0 }));
    const refused = keepDisplaced(other);
    check('and when storage refuses it, that is said, so nothing replaces it', !refused.ok && refused.saved === null);
  } finally {
    globalThis.localStorage = had;
  }

  /*
   * THE TAGS A TRACK WEARS ON THE BOARD, which this browser can only know
   * from the bind, because they are not in the document.
   *
   * writeBind named every field it kept and tags were not among them, so
   * the publish dialog opened with nothing ticked on every track and sent
   * that, and the board read the renames' missing list as an empty one.
   * Between them a track lost its tags on any republish that did not
   * re-tick them. The board's half is in its own src/selftest.js; this is
   * the simulator's: the bind keeps them, "not known" stays apart from
   * "none", and an empty list reaches the wire as one.
   */
  const hadTagStore = globalThis.localStorage;
  const tagStore = new Map();
  globalThis.localStorage = {
    getItem: (k) => (tagStore.has(k) ? tagStore.get(k) : null),
    setItem: (k, v) => {
      tagStore.set(k, String(v));
    },
    removeItem: (k) => {
      tagStore.delete(k);
    },
  };
  const board = 'http://127.0.0.1:3100';
  try {
    const listed = { board, author: 'Ada Rook', nameOnBoard: 'Ladder Loop', owned: true };
    writeBind('trk-1a2b3c4d', { ...listed, tags: ['race', 'skills'] });
    check('a bind keeps its tags',
      String(readBind('trk-1a2b3c4d').tags) === 'race,skills'
      && String(publishedTags('trk-1a2b3c4d')) === 'race,skills',
      JSON.stringify(readBind('trk-1a2b3c4d')));
    /* syncOwnedName and syncOwnedIdentity rewrite a bind by spreading it. */
    writeBind('trk-1a2b3c4d', { ...readBind('trk-1a2b3c4d'), author: 'Ada Two' });
    check('and a rename that spreads the bind keeps them',
      String(publishedTags('trk-1a2b3c4d')) === 'race,skills' && readBind('trk-1a2b3c4d').author === 'Ada Two');
    writeBind('trk-1a2b3c4d', { ...listed, tags: [] });
    check('an empty list is kept, as none',
      Array.isArray(publishedTags('trk-1a2b3c4d')) && publishedTags('trk-1a2b3c4d').length === 0);
    writeBind('trk-2b3c4d5e', listed);
    check('a bind with no list reads as not known, not as none',
      publishedTags('trk-2b3c4d5e') === null && !('tags' in readBind('trk-2b3c4d5e')));
    check('and so does a track with no bind at all', publishedTags('trk-00000000') === null);

    /* rememberPublish: the board's answer first, then what was sent, then
     * what the bind knew. */
    writeBind(doc.id, listed);
    rememberPublish(doc, { id: doc.id, name: doc.name, tags: ['race'] }, board, 'Ada Rook');
    check('a bind that never knew its tags learns them from the board’s answer',
      String(publishedTags(doc.id)) === 'race', String(publishedTags(doc.id)));
    rememberPublish(doc, { id: doc.id, name: doc.name, tags: ['race', 'experiment'] }, board, 'Ada Rook',
      { tags: ['experiment', 'race'] });
    check('and the board’s answer wins over what was sent',
      String(publishedTags(doc.id)) === 'race,experiment', String(publishedTags(doc.id)));
    rememberPublish(doc, { id: doc.id, name: 'Renamed Loop' }, board, 'Ada Two');
    check('a rename that sent no list keeps what the bind knew, when the board does not say',
      String(publishedTags(doc.id)) === 'race,experiment', String(publishedTags(doc.id)));
    rememberPublish(doc, { id: doc.id, name: doc.name }, board, 'Ada Rook', { tags: [] });
    check('an empty list that was sent is remembered as none',
      Array.isArray(publishedTags(doc.id)) && publishedTags(doc.id).length === 0);
    const fresh = createTrack('Fresh Loop');
    rememberPublish(fresh, { id: fresh.id, name: fresh.name }, board, 'Ada Rook');
    check('and when nobody knows, the bind does not pretend', publishedTags(fresh.id) === null);

    /* tagsToSend: which of the two ways of saying nothing goes. */
    check('an empty row the dialog could not see behind sends no list, which keeps the board’s',
      tagsToSend(null, []) === undefined);
    const unticked = tagsToSend(['race'], []);
    check('unticking every tag that was shown sends an empty list, which clears',
      Array.isArray(unticked) && unticked.length === 0);
    check('ticked tags go in the board’s order', String(tagsToSend(null, ['skills', 'race'])) === 'race,skills');
    check('a tag this build has no button for rides along',
      String(tagsToSend(['race', 'night'], ['skills'])) === 'skills,night', String(tagsToSend(['race', 'night'], ['skills'])));

    /* And what publishTrack puts on the wire for each. */
    const hadFetch = globalThis.fetch;
    const sent = [];
    globalThis.fetch = async (url, init) => {
      sent.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => '{}' };
    };
    try {
      const plain = toPlain(doc);
      await publishTrack({ author: 'Ada Rook', document: plain, origin: board, tags: [] });
      await publishTrack({ author: 'Ada Rook', document: plain, origin: board });
      await publishTrack({ author: 'Ada Rook', document: plain, origin: board, tags: ['race'] });
    } finally {
      globalThis.fetch = hadFetch;
    }
    check('an empty tag list goes on the wire as an empty list',
      Array.isArray(sent[0] && sent[0].tags) && sent[0].tags.length === 0, JSON.stringify(sent[0] && sent[0].tags));
    check('no tag list leaves the key out altogether', Boolean(sent[1]) && !('tags' in sent[1]));
    check('a tag list goes as it is', Boolean(sent[2]) && String(sent[2].tags) === 'race');
  } finally {
    globalThis.localStorage = hadTagStore;
  }

  /*
   * THE SHELL'S PUBLISH, WHEN THE BOARD SAYS THE ID IS TAKEN.
   *
   * publishCurrentCourse puts the track up as a copy under a new id when
   * the board answers 409, which is what the builder's own publish does.
   * From 16 August forkDocument handed back { copy, commit }, and this path
   * gave the whole of that to toPlain, which threw, so the pilot was told
   * the track could not be published and no copy went up. Nothing ran this
   * path until now.
   */
  const hadForkStore = globalThis.localStorage;
  const hadForkFetch = globalThis.fetch;
  const forkStore = new Map();
  globalThis.localStorage = {
    getItem: (k) => (forkStore.has(k) ? forkStore.get(k) : null),
    setItem: (k, v) => {
      forkStore.set(k, String(v));
    },
    removeItem: (k) => {
      forkStore.delete(k);
    },
  };
  /* A board that answers each publish with the next status in `answers`:
   * 409 is "that id is taken", and anything else takes the track. */
  const boardAnswering = (answers, posts) => async (url, init) => {
    const body = JSON.parse(init.body);
    posts.push(body);
    const status = answers[posts.length - 1] ?? 201;
    if (status === 409) {
      return {
        ok: false,
        status,
        text: async () => JSON.stringify({ error: 'This track is already on the board.', conflict: true }),
      };
    }
    return {
      ok: true,
      status,
      text: async () => JSON.stringify({
        id: body.document.id,
        name: body.document.name,
        author: body.author,
        editKey: `key-${body.document.id}`,
        updated: false,
        timesCleared: false,
        tags: [],
      }),
    };
  };
  /* Caught, so a path that throws fails the checks below rather than
   * ending the suite. */
  const tryPublish = async () => {
    try {
      return { result: await publishCurrentCourse({ doc, author: 'Ada Rook', origin: board }) };
    } catch (e) {
      return { error: e };
    }
  };
  try {
    const posts = [];
    globalThis.fetch = boardAnswering([409, 201], posts);
    const { result, error } = await tryPublish();
    check('a publish the board refuses as taken goes up as a copy, instead of throwing',
      !error && Boolean(result) && result.forked === true, error ? error.message : '');
    const copyId = result && result.doc ? result.doc.id : '';
    check('under a new id, with the same layout',
      posts.length === 2 && posts[0].document.id === doc.id && Boolean(copyId) && copyId !== doc.id
      && posts[1].document.id === copyId && result.posted.id === copyId
      && layoutFingerprint(posts[1].document) === layoutFingerprint(doc),
      `${posts.length} publish(es) sent`);
    const forkBind = copyId ? readBind(copyId) : null;
    check('and the copy is this browser’s, and remembers what it is a copy of',
      Boolean(forkBind) && forkBind.owned === true && forkBind.sourceId === doc.id
      && readEditKey(copyId) === `key-${copyId}`, JSON.stringify(forkBind));
    const canvas = readAutosave('full');
    check('and the canvas is the copy now',
      Boolean(canvas && canvas.doc) && canvas.doc.id === copyId,
      canvas && canvas.doc ? canvas.doc.id : 'no canvas');

    forkStore.clear();
    const refusedPosts = [];
    globalThis.fetch = boardAnswering([409, 409], refusedPosts);
    const refused = await tryPublish();
    const refusedId = refusedPosts[1] ? refusedPosts[1].document.id : '';
    check('a copy the board refuses as well is an error, and leaves no bind behind',
      Boolean(refused.error) && refusedPosts.length === 2 && Boolean(refusedId) && readBind(refusedId) === null,
      refused.error ? refused.error.message : 'no error');
  } finally {
    globalThis.fetch = hadForkFetch;
    globalThis.localStorage = hadForkStore;
  }
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
  /* Against SCHEMA_VERSION rather than a literal. The claim this check is
   * making is "normalize writes the CURRENT version", and it was written as
   * a literal 2, so it failed the day the version became 3 for the micro
   * track class while the behaviour it tests was unchanged. */
  check(`the document is written as version ${SCHEMA_VERSION}`,
    toPlain(migrated.doc).schemaVersion === SCHEMA_VERSION);
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

function suiteDiveSupports() {
  console.log('\ndive gate supports');
  const d = ELEMENTS.diveGate.dims;
  const tube = FRAME_TUBE_OD;
  const centerH = d.sillH + d.clearH * 0.5;
  const wx = d.clearW / 2 + tube * GATE_POST_R_SCALE;
  for (const deg of [55, 90]) {
    const pitch = deg * RAD;
    const feet = gateSupportFeet(0, pitch, d.clearW, d.clearH, centerH, tube);
    const f = apertureFrame(0, pitch);
    check(`a ${deg} deg dive has two support feet`, feet.length === 2);
    const widths = feet.map((p) => p.x * f.widthAxis.x + p.y * f.widthAxis.y);
    check(`a ${deg} deg dive keeps both posts at the sides`,
      widths.every((w) => Math.abs(Math.abs(w) - wx) < 0.02)
      && widths[0] * widths[1] < 0,
      widths.map((w) => w.toFixed(3)).join(','));
    check(`a ${deg} deg dive has no post on the opening centreline`,
      widths.every((w) => Math.abs(w) > d.clearW * 0.4));
  }
}

function inClubBox(solids, x, y, z) {
  return solids.some((c) => {
    if (!c.box) {
      return false;
    }
    const [x0, y0, z0, x1, y1, z1] = c.box;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1;
  });
}

function suiteClubhouseShell() {
  console.log('\nclubhouse shell');
  const solids = clubhouseSolids();
  check('the verandah roof is still tagged for the clearance band',
    solids.some((c) => c.tag === 'verandahRoof'));
  check('a west-room interior point is not inside a wall',
    !inClubBox(solids, -14, 2, -5));
  check('a mid-room interior point is not inside a wall',
    !inClubBox(solids, -0.25, 2, -4));
  check('the west back wall is still solid',
    inClubBox(solids, -14, 2, -11.05));
  /*
   * THE ELEVATION IS DRAWN SHUT, so it is solid. Every window is a pane of
   * glass and every door is two leaves in the mesh, and the rebuild that
   * hollowed the wings punched all ten of them: a quad flew through shut
   * glass. What the reported bug was actually about is the line below it.
   */
  check('the west social-room door is drawn shut, so it is a wall',
    inClubBox(solids, -7.6, 1.5, -0.14));
  check('an east-wing window is still glass',
    inClubBox(solids, 7.2, 0.45 + 1.35 + 0.5, -0.14));
  check('the closed roller shutter is still a wall',
    inClubBox(solids, 16.0, 1.6, -0.14));
  /*
   * And the strip of verandah in front of the glass is CLEAR. The mass this
   * shell replaced ran 0.45 m past the front face, so the line a pilot
   * takes through the pits, drawn as open air, was an invisible wall.
   */
  check('the verandah in front of that door is clear',
    !inClubBox(solids, -7.6, 1.5, 0.5));
  check('the verandah in front of the middle glazing is clear',
    !inClubBox(solids, -0.25, 1.5, 0.3));
  /*
   * And the shell has a lid. A vertical ray from inside each wing must meet
   * something: hollowing the wings deleted the box that was also the
   * ceiling, and a quad that flew in a door left through the drawn roof.
   */
  for (const [name, x, z] of [['west', -14, -5], ['mid', -0.25, -4], ['east', 14, -4]]) {
    let roofed = false;
    for (let y = 0.5; y < 12; y += 0.05) {
      if (inClubBox(solids, x, y, z)) {
        roofed = true;
        break;
      }
    }
    check(`the ${name} wing has a roof over it`, roofed);
  }
}

/*
 * WHERE A CRASH PUTS THE CRAFT BACK: set down on the flat surface nearest to
 * where it happened, the ground or a roof top, and never in the air. The
 * owner's rule of 24 September. Three rigs: the RaceGOW room the way
 * src/render/scene.js builds it (four walls from the floor to the ceiling
 * and a ceiling slab 0.10 m thick at MICRO_SCALE, 0.343 m in the world), a
 * building whose roof is a landing surface the way the city's roofs are, and
 * a kerb.
 *
 * The flight that started this: a whoop pinned under the room's ceiling was
 * put back in the AIR 0.6 m up, which from under a 0.343 m slab is on top of
 * it, where it sat. A recovery that sets the craft down cannot find that air
 * at all: the ceiling is a collider, not a surface anything lands on. The
 * wrong side of a wall is still there to be found, and that is what the
 * reachability test is for.
 */
function suiteRecoverSpot() {
  console.log('\nrecover spot');
  const whoop = airframeById('whoop65').dims;
  setCraftAirframe(whoop);
  const rest = whoop.vHalfDown;
  const K = MICRO_SCALE;
  const halfW = 10 * K * 0.5;
  const halfD = 12 * K * 0.5;
  const H = 4 * K;
  const T = 0.10 * K;
  const room = new Colliders();
  room.addBox('wall', -halfW - T, 0, -halfD - T, halfW + T, H, -halfD);
  room.addBox('wall', -halfW - T, 0, halfD, halfW + T, H, halfD + T);
  room.addBox('wall', -halfW - T, 0, -halfD - T, -halfW, H, halfD + T);
  room.addBox('wall', halfW, 0, -halfD - T, halfW + T, H, halfD + T);
  room.addBox('wall', -halfW - T, H, -halfD - T, halfW + T, H + T, halfD + T);
  room.build();
  const flat = () => 0;

  check('a line up through the ceiling crosses it', room.segmentCrossesAny(0, H - 0.1, 0, 0, H + T + 0.5, 0));
  check('a line that stays under it does not', !room.segmentCrossesAny(0, H - 0.1, 0, 0, H - 1.5, 0));
  check('a line out through a wall crosses it', room.segmentCrossesAny(halfW - 1, 5, 0, halfW + T + 1, 5, 0));
  check('a line that starts inside the slab does not count as crossing it',
    !room.segmentCrossesAny(0, H + T * 0.5, 0, 0, H + T + 0.5, 0));
  const pole = new Colliders();
  pole.add('wall', 0, 0, 0, 0, 3, 0, 0.2);
  pole.build();
  check('a line through a pole crosses it, one beside it does not',
    pole.segmentCrossesAny(-1, 1, 0, 1, 1, 0) && !pole.segmentCrossesAny(-1, 1, 0.5, 1, 1, 0.5));

  /* Pinned the way the contact pass leaves a craft held against a ceiling:
   * the highest centre whose hull is still clear of it. */
  const clearAt = (c, x, y, z) => c.hit(x, y, z, x, y, z, craftVerticalHalf(0), 0, 0, 0, 1, craftVerticalOffset()) < 0;
  let yClear = H - 1;
  while (clearAt(room, 0, yClear + 0.001, 0)) {
    yClear += 0.001;
  }
  const pinned = { x: 0, y: yClear, z: 0 };
  const out = { x: 0, y: 0, z: 0, surface: 0 };
  const spot = () => `${out.x.toFixed(3)} ${out.y.toFixed(3)} ${out.z.toFixed(3)} on ${out.surface}`;
  check('pinned under the ceiling, it is set down on the floor straight below, not in the air and not on the roof',
    findRestSpot(room, flat, rest, pinned.x, pinned.y, pinned.z, pinned, out)
    && out.x === 0 && out.z === 0 && out.surface === 0 && out.y === rest, spot());
  check('and with no reference at all, the same: the ceiling is not a surface anything is set down on',
    findRestSpot(room, flat, rest, pinned.x, pinned.y, pinned.z, null, out) && out.surface === 0 && out.y === rest, spot());
  const buried = { x: 0, y: H + T * 0.5, z: 0 };
  const below = { x: 0, y: H - 0.4, z: 0 };
  check('buried in the ceiling from below, it is set down on the floor under it',
    findRestSpot(room, flat, rest, buried.x, buried.y, buried.z, below, out) && out.y === rest && Math.abs(out.x) < halfW, spot());
  const above = { x: 0, y: H + T + 0.5, z: 0 };
  check('a craft that really was on top of the room is not put inside it: nothing in reach is on its side, so it goes to the line',
    !findRestSpot(room, flat, rest, buried.x, buried.y, buried.z, above, out)
    && !findRestSpot(room, flat, rest, above.x, above.y, above.z, above, out));
  const inWall = { x: halfW + T * 0.5, y: 5, z: 0 };
  const inRoom = { x: halfW - 0.4, y: 5, z: 0 };
  findRestSpot(room, flat, rest, inWall.x, inWall.y, inWall.z, null, out);
  check('stuck in a wall with no reference, the nearest floor can be the far side of it', out.x > halfW + T, spot());
  check('reachable from the room, it is set down on the room\'s floor',
    findRestSpot(room, flat, rest, inWall.x, inWall.y, inWall.z, inRoom, out) && out.x < halfW && out.y === rest, spot());

  /* A building whose roof is a landing surface, offered to a query made
   * from within a step of it and seen as the ground under the building from
   * lower down, which is how the city's heightAt treats a roof. */
  const B = { x0: 10, x1: 20, z0: -5, z1: 5, top: 7 };
  const town = new Colliders();
  town.addBox('wall', B.x0, 0, B.z0, B.x1, B.top, B.z1);
  town.build();
  const inPlan = (x, z) => x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
  const roofAt = (x, z, fromY) => (inPlan(x, z) && fromY + 0.55 >= B.top ? B.top : 0);
  check('over the roof, it is set down on the roof straight below: a roof top',
    findRestSpot(town, roofAt, rest, 15, B.top + 1.5, 0, { x: 15, y: B.top + 1.5, z: 0 }, out)
    && out.surface === B.top && out.y === B.top + rest && out.x === 15 && out.z === 0, spot());
  check('at street level beside it, on the street, outside it',
    findRestSpot(town, roofAt, rest, B.x1 + 0.3, 1, 0, { x: B.x1 + 1, y: 1, z: 0 }, out)
    && out.surface === 0 && out.x > B.x1, spot());
  check('stuck in its wall a metre under the roof, flown from the street: the street, not the roof and not inside',
    findRestSpot(town, roofAt, rest, B.x1 - 0.05, B.top - 1, 0, { x: B.x1 + 0.5, y: B.top - 1, z: 0 }, out)
    && out.surface === 0 && out.x > B.x1, spot());
  /* Colliders.topAt, which the shell's set down reads because the city's
   * heightAt knows only its platforms (2026-09-24). */
  check('topAt: a craft over the roof finds the roof top',
    town.topAt(15, 0, B.top + 0.1, 0.3) === B.top);
  check('topAt: a craft at the foot of the building does not find its roof',
    town.topAt(15, 0, 1, 0.3) === -Infinity);
  check('topAt: nothing outside the footprint',
    town.topAt(B.x1 + 1, 0, B.top + 0.1, 0.3) === -Infinity);
  const edge = { x: B.x1 - CRAFT_WORLD_R * 0.5, y: B.top + 1, z: 0 };
  check('over the roof edge, with the craft hanging off it: on the roof a metre in, not on the street seven metres down',
    findRestSpot(town, roofAt, rest, edge.x, edge.y, edge.z, edge, out)
    && out.surface === B.top && out.x <= B.x1 - CRAFT_WORLD_R, spot());

  /* A kerb 0.12 m high along x = 30, in the open. */
  const kerbAt = (x) => (x >= 30 ? 0.12 : 0);
  const kerb = (x, z) => kerbAt(x);
  const onKerb = 30 + CRAFT_WORLD_R * 0.25;
  const found = findRestSpot(null, kerb, rest, onKerb, 1, 0, null, out);
  const straddles = kerbAt(out.x - CRAFT_WORLD_R) !== kerbAt(out.x + CRAFT_WORLD_R);
  check('astride a kerb edge is not flat: it is set down clear of the edge, on one level',
    found && !straddles && out.y === out.surface + rest, spot());
  /* The city's roof as measured: reported at 6.2 m, and a box whose top is
   * 6.233 m over this part of it. A landing meets the box first, so a craft
   * set down there stands on the box. */
  const seatBox = new Colliders();
  seatBox.addBox('wall', -2, -60, -2, 2, 6.233, 2);
  seatBox.build();
  const cityRoof = () => 6.2;
  check('a roof reported at 6.2 m that is a box topped at 6.233 m: seated on the box, not refused and not in it',
    findRestSpot(seatBox, cityRoof, rest, 0, 7.5, 0, { x: 0, y: 7.5, z: 0 }, out)
    && out.x === 0 && out.z === 0 && Math.abs(out.surface - 6.233) < 0.002
    && out.y === out.surface + rest && clearAt(seatBox, out.x, out.y, out.z), spot());
  const tallBox = new Colliders();
  tallBox.addBox('wall', -2, -60, -2, 2, 6.3, 2);
  tallBox.build();
  check('a box ten centimetres up is something in the way, not a floor: set down off it',
    findRestSpot(tallBox, cityRoof, rest, 0, 7.5, 0, null, out) && Math.max(Math.abs(out.x), Math.abs(out.z)) > 2
    && out.surface === 6.2, spot());
  check('in the open over flat ground, straight down',
    findRestSpot(null, flat, rest, 3, 5, 4, null, out) && out.x === 3 && out.z === 4 && out.y === rest, spot());
  check('and a single spot can be asked about on its own',
    restSpotAt(town, roofAt, rest, 15, 0, B.top + 1, out) && out.surface === B.top
    && !restSpotAt(town, roofAt, rest, 15, 0, B.top - 1, out));
  setCraftAirframe(airframeById('5inch').dims);
}

/*
 * FRAME SIDES, ONE AT A TIME. The document half (a list of missing sides,
 * written only when there is one), the mutator the inspector and the Delete
 * key share, and the one piece of arithmetic that can put a pipe back on the
 * wrong side: turning the element's own left and right into the race
 * field's mesh frame, which faces the first pass. That turn is checked here
 * against the rotation scene.js actually applies, group yaw then pivot
 * pitch then scene to document, for standing, tilted and flat gates flown
 * both ways through.
 */
function suiteFrameSides() {
  console.log('\nframe sides, one at a time');
  const doc = createTrack('sides', 'micro');
  const a = place(doc, 'gate', 4, 5);
  const b = place(doc, 'gate', 6, 5);
  addToSequence(doc, a.id, 0);
  addToSequence(doc, b.id, 0);

  check('a gate starts with all four sides', FRAME_SIDES.every((side) => frameSidesOf(a)[side]));
  check('and nothing missing', !hasMissingSides(a) && unbuiltSidesOf(a).length === 0);
  const plain = serialize(doc);
  check('an ordinary gate writes no unbuiltSides key', !plain.includes('unbuiltSides'));

  check('taking a side away reports a change', setSideBuilt(doc, a.id, 'left', false) === true);
  setSideBuilt(doc, a.id, 'top', false);
  check('two taken away are kept in FRAME_SIDES order',
    JSON.stringify(a.unbuiltSides) === '["top","left"]', JSON.stringify(a.unbuiltSides));
  check('taking the same side twice changes nothing', setSideBuilt(doc, a.id, 'top', false) === false);
  const frame = frameSidesOf(a);
  check('frameSidesOf says which are left',
    frame.bottom && frame.right && !frame.top && !frame.left, JSON.stringify(frame));
  const back = deserialize(serialize(doc)).doc;
  check('they round trip', JSON.stringify(elementById(back, a.id).unbuiltSides) === '["top","left"]');
  check('byte for byte', roundTripsCleanly(doc));

  setSideBuilt(doc, a.id, 'top', true);
  setSideBuilt(doc, a.id, 'left', true);
  check('putting both back removes the key', !('unbuiltSides' in a));
  check('and the document is the bytes it was', serialize(doc) === plain);

  const raw = JSON.parse(serialize(doc));
  raw.elements[0].unbuiltSides = ['left', 'sideways', 'left'];
  raw.elements[1].unbuiltSides = [];
  const pole = { ...raw.elements[1], id: 'el-90', type: 'pole', unbuiltSides: ['left'] };
  raw.elements.push(pole);
  const read = normalize(raw);
  const ra = read.doc.elements.find((e) => e.id === raw.elements[0].id);
  const rb = read.doc.elements.find((e) => e.id === raw.elements[1].id);
  const rp = read.doc.elements.find((e) => e.id === 'el-90');
  check('a name that is not a side is dropped', JSON.stringify(ra.unbuiltSides) === '["left"]',
    JSON.stringify(ra.unbuiltSides));
  check('and the read says so', read.repairs.some((r) => r.includes('frame side')));
  check('an empty list reads as none at all', !('unbuiltSides' in rb));
  check('only an aperture keeps the field', rp && !('unbuiltSides' in rp));

  const c = place(doc, 'gate', 8, 5);
  c.unbuilt = true;
  check('a gap in the lattice is missing all four', unbuiltSidesOf(c).length === 4 && !hasMissingSides(c));
  setSideBuilt(doc, c.id, 'bottom', true);
  check('a side put on a gap leaves a gate missing the other three',
    c.unbuilt === undefined && JSON.stringify(c.unbuiltSides) === '["top","left","right"]',
    JSON.stringify(c));

  /* The race field's frame. The reference is scene.js's own chain: a
   * standing gate is obstacle() rotated by the station's yaw about up; a
   * tilted one is tiltedGate(), whose pivot is turned by the station's pitch
   * about its local x first. Local x and local y are then read back in the
   * document frame and matched to the element's width and height axes. */
  const refSides = (el, st, sides) => {
    const psi = st.yaw;
    const th = Math.abs(st.pitch) > 1e-6 ? st.pitch : 0;
    const X = { x: Math.cos(psi), y: Math.sin(psi), z: 0 };
    const Y = th
      ? { x: Math.sin(th) * Math.sin(psi), y: -Math.sin(th) * Math.cos(psi), z: Math.cos(th) }
      : { x: 0, y: 0, z: 1 };
    const f = apertureFrame(el.yaw, el.pitch);
    const xAlongW = X.x * f.widthAxis.x + X.y * f.widthAxis.y + X.z * f.widthAxis.z > 0;
    const yAlongH = Y.x * f.heightAxis.x + Y.y * f.heightAxis.y + Y.z * f.heightAxis.z > 0;
    return {
      xNeg: xAlongW ? sides.left : sides.right,
      xPos: xAlongW ? sides.right : sides.left,
      top: yAlongH ? sides.top : sides.bottom,
      bottom: yAlongH ? sides.bottom : sides.top,
    };
  };
  const cases = [
    ['a standing gate flown along its normal', 'gate', 0, false],
    ['a standing gate flown against it', 'gate', 0, true],
    ['a tilted gate flown along its normal', 'diveGate', 0.6, false],
    ['a tilted gate flown against it', 'diveGate', 0.6, true],
    ['a flat dive gate flown down through it', 'diveGate', Math.PI / 2, false],
    ['a flat dive gate flown up through it', 'diveGate', Math.PI / 2, true],
  ];
  for (const [what, type, pitch, flip] of cases) {
    for (const missing of [['left'], ['top', 'right'], ['bottom', 'left']]) {
      const d = createTrack('mesh', 'full');
      const g0 = place(d, 'gate', 10, 20);
      const g = place(d, type, 20, 20, { pitch, dims: type === 'diveGate' ? { sillH: 2 } : {} });
      const g2 = place(d, 'gate', 30, 20);
      for (const e of [g0, g, g2]) {
        addToSequence(d, e.id, 0);
      }
      setYaw(d, g.id, 0.3);
      const seq = d.sequence.find((q) => q.elementId === g.id);
      if (flip) {
        flipFace(d, seq.id);
      }
      applyAutoFaces(d);
      for (const side of missing) {
        setSideBuilt(d, g.id, side, false);
      }
      const course = courseFromDocument(d);
      const st = course.stations.find((q) => q.elementId === g.id);
      const got = st?.structure?.meshSides;
      const want = st ? refSides(g, st, frameSidesOf(g)) : null;
      check(`${what}, ${missing.join(' and ')} missing, is built on the side the builder shows`,
        got && want && JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)} want ${JSON.stringify(want)} entry ${seq.entry}`);
    }
  }

  /* A gate with every side takes the old path: no sides on its spec. */
  const whole = createTrack('whole', 'full');
  const w0 = place(whole, 'gate', 10, 20);
  const w1 = place(whole, 'gate', 20, 20);
  addToSequence(whole, w0.id, 0);
  addToSequence(whole, w1.id, 0);
  const wc = courseFromDocument(whole);
  check('a gate with all four sides hands the race field no sides at all',
    wc.structures.every((st) => st.meshSides === undefined && st.frameSides === undefined));

  /* Taking the pipe away takes nothing else: the openings and the scoring
   * are the same. */
  const scored = (d) => JSON.stringify(courseFromDocument(d).stations.map((st) => [
    st.elementId, st.x, st.z, st.centreY, st.clearW, st.clearH, st.yaw, st.pitch,
  ]));
  const before = scored(whole);
  for (const side of FRAME_SIDES) {
    setSideBuilt(whole, w0.id, side, false);
  }
  check('with all four taken away, every station is where and what it was', scored(whole) === before);
}

/*
 * BENDING THE LINE. A grab on a segment drops a waypoint into the flying
 * order between the two stations that segment joins, the line then runs
 * through it, the game scores exactly what it scored before, and the gates
 * either side keep their faces.
 */
function suiteBendLine() {
  console.log('\nbending the line');
  const doc = createTrack('bend', 'micro');
  place(doc, 'startPads', 3, 2, { yaw: Math.PI / 2 });
  const g1 = place(doc, 'gate', 3, 4);
  const g2 = place(doc, 'gate', 6, 6);
  const g3 = place(doc, 'gate', 7, 3);
  for (const g of [g1, g2, g3]) {
    addToSequence(doc, g.id, 0);
  }
  applyAutoFaces(doc);
  const path = buildPath(doc);
  const faces = () => doc.elements.filter((e) => e.type === 'gate').map((e) => [e.id, e.yaw]);
  const stationsBefore = courseFromDocument(doc).stations.length;

  check('segment 0 leaves the first gate, so a bend there goes second', bendIndexFor(doc, path, 0) === 1);
  const last = path.knots.length - 2;
  check('the closing leg leaves the last gate, so a bend there goes last',
    bendIndexFor(doc, path, last) === doc.sequence.length, `${bendIndexFor(doc, path, last)}`);
  check('a segment that is not there is refused',
    bendIndexFor(doc, path, path.knots.length - 1) === null && bendIndexFor(doc, path, -1) === null
    && bendIndexFor(doc, path, 0.5) === null);

  /* A grab halfway along the first leg, pulled out to one side. */
  const sample = path.samples.find((q) => q.segment === 0 && q.t >= 0.5);
  const yawsBefore = faces();

  /* Why the neighbours are pinned: the same waypoint put in the order with
   * no pin, and pulled out, turns the gates either side towards it. */
  const loose = deepClone(doc);
  const lw = createElement(loose, 'waypoint', { x: sample.pos.x + 1.2, y: sample.pos.y - 0.4, z: sample.pos.z }, 0);
  loose.elements.push(lw);
  addToSequence(loose, lw.id, 0, 1);
  const turned = loose.elements.filter((e) => e.type === 'gate')
    .filter((e) => Math.abs(e.yaw - elementById(doc, e.id).yaw) > 1e-3).length;
  check('unpinned, a bend would turn the gates either side of it', turned >= 1, `${turned} turned`);

  const wp = bendLineAt(doc, path, 0, sample.pos, 0);
  check('it drops a waypoint', wp && wp.type === 'waypoint');
  check('second in the flying order', doc.sequence[1].elementId === wp.id);
  check('the gates either side keep their faces',
    JSON.stringify(faces()) === JSON.stringify(yawsBefore));
  check('because they are pinned as a hand turn would pin them', g1.yawOverridden && g2.yawOverridden);
  check('and the one after is not touched', !g3.yawOverridden);

  wp.position.x += 1.2;
  wp.position.y -= 0.4;
  applyAutoFaces(doc);
  check('dragged out, the gates still keep their faces', JSON.stringify(faces()) === JSON.stringify(yawsBefore));
  const bent = buildPath(doc);
  const knot = bent.knots.find((k) => k.elementId === wp.id);
  check('the line runs through where it was dragged to',
    knot && Math.hypot(knot.pos.x - wp.position.x, knot.pos.y - wp.position.y) < 1e-9);
  const course = courseFromDocument(doc);
  check('the race field scores what it scored before', course.stations.length === stationsBefore,
    `${course.stations.length} against ${stationsBefore}`);

  /* The numbers a pilot counts skip the waypoint, as the race field does. */
  const numbers = gateNumbers(doc);
  check('the waypoint carries no number', numbers.get(doc.sequence[1].id) === null);
  check('and the gate after it is still gate 2', numbers.get(doc.sequence[2].id) === 2);
  const shown = sequenceNumbers(doc).get(g2.id);
  check('which is the number the views draw on it', shown && shown[0].number === 2);
  check('the neighbours of the waypoint are the two gates round it',
    JSON.stringify(neighboursOf(doc, wp.id)) === '[0,2]', JSON.stringify(neighboursOf(doc, wp.id)));
  check('pinning a waypoint pins nothing, it has no face', pinFacesAt(doc, [1]) === 0);

  /* The shipped RaceGOW tracks: their last number is the race field's
   * station count, now that waypoints are not counted. */
  for (const preset of PRESETS.filter((p) => p.trackClass === 'micro').slice(0, 3)) {
    const d = normalize(JSON.parse(JSON.stringify(preset))).doc;
    const n = [...gateNumbers(d).values()].filter((v) => v != null);
    const st = courseFromDocument(d).stations.length;
    check(`${preset.name}: the last gate number is the race field's station count`,
      n.length && n[n.length - 1] === st, `${n[n.length - 1]} against ${st}`);
  }
}

/*
 * A TURNED MARKER'S SQUARE PIVOTS ON THE POLE. The square both builder views
 * draw is read off the knot, so it is the race field's own station, and for
 * a pole turned by hand off square it stands hinged on the pole: its inner
 * edge on the pole and its plane through it, facing across the pass.
 */
function suitePoleSquare() {
  console.log('\na turned pole swings its square');
  const doc = createTrack('pole', 'micro');
  place(doc, 'startPads', 3, 2, { yaw: Math.PI / 2 });
  const g1 = place(doc, 'gate', 3, 4);
  const pole = place(doc, 'pole', 5, 6);
  const g2 = place(doc, 'gate', 7, 4);
  for (const e of [g1, pole, g2]) {
    addToSequence(doc, e.id, 0);
  }
  applyAutoFaces(doc);
  const seq = doc.sequence.find((q) => q.elementId === pole.id);

  /* Untouched, the handle starts where the square is. */
  let path = buildPath(doc);
  let square = markerSquare(doc, knotForSeq(path, seq.id));
  const shown = passYawOf(doc, path, pole);
  check('an untouched pole reports the way its square sits',
    square && Math.abs(Math.cos(shown) - square.side.x) < 1e-9 && Math.abs(Math.sin(shown) - square.side.y) < 1e-9);
  const centreBefore = square.centre;
  setYaw(doc, pole.id, shown);
  applyAutoFaces(doc);
  path = buildPath(doc);
  square = markerSquare(doc, knotForSeq(path, seq.id));
  check('so turning it from there does not throw the square round the pole',
    Math.hypot(square.centre.x - centreBefore.x, square.centre.y - centreBefore.y) < 1e-6,
    `${square.centre.x} ${square.centre.y} against ${centreBefore.x} ${centreBefore.y}`);

  for (const deg of [25, 70, 140, -110]) {
    setYaw(doc, pole.id, shown + deg * RAD);
    applyAutoFaces(doc);
    path = buildPath(doc);
    const knot = knotForSeq(path, seq.id);
    const sq = markerSquare(doc, knot);
    const station = courseFromDocument(doc).stations.find((st) => st.elementId === pole.id);
    const inner = {
      x: sq.centre.x - sq.side.x * sq.dims.clearW / 2,
      y: sq.centre.y - sq.side.y * sq.dims.clearW / 2,
    };
    check(`turned ${deg} degrees, the inner edge stays on the pole`,
      Math.hypot(inner.x - pole.position.x, inner.y - pole.position.y) < 1e-9);
    check(`turned ${deg} degrees, the square's plane runs through the pole`,
      Math.abs(sq.normal.x * sq.side.x + sq.normal.y * sq.side.y) < 1e-9,
      `normal . side ${sq.normal.x * sq.side.x + sq.normal.y * sq.side.y}`);
    /* The same square the race field scores: its heading and its centre,
     * scene frame back to document frame. The race field reads the document
     * as it is written, six decimal places, so the square it is held to is
     * the written document's; the live one differs by that rounding. */
    const written = normalize(toPlain(doc)).doc;
    const ws = markerSquare(written, knotForSeq(buildPath(written), seq.id));
    const heading = Math.atan2(-ws.normal.x, ws.normal.y);
    const f = written.field;
    const cx = station.x / MICRO_SCALE + f.width / 2;
    const cy = -station.z / MICRO_SCALE + f.depth / 2;
    /* What both views used to draw it facing: the chain direction. It is
     * not the scored plane once the pole is turned off square, which is the
     * owner's report in one number. */
    const was = travelDirection(doc, seq.id);
    const wasFlat = Math.hypot(was.x, was.y);
    const off = Math.acos(Math.min(1, Math.abs((was.x * sq.normal.x + was.y * sq.normal.y) / wasFlat))) * DEG;
    if (deg === 70) {
      check('turned 70 degrees, the chain direction the views drew with is not the scored plane',
        off > 10, `${off.toFixed(1)} degrees apart`);
    }
    check(`turned ${deg} degrees, it is the square the race field scores`,
      Math.abs(Math.atan2(Math.sin(station.yaw - heading), Math.cos(station.yaw - heading))) < 1e-9
      && Math.hypot(cx - ws.centre.x, cy - ws.centre.y) < 1e-9,
      `yaw ${station.yaw} against ${heading}, centre ${cx},${cy} against ${ws.centre.x},${ws.centre.y}`);
  }
}

async function main() {
  if (process.argv.includes('--emit')) {
    process.stdout.write(serialize(demoTrack()));
    return;
  }
  console.log('track builder self test');
  suiteRoundTrip();
  suiteElementCounts();
  suitePresets();
  suiteCrashRule();
  suiteCrashFrame();
  suiteClipCatch();
  suiteRecoverSpot();
  suiteFaces();
  suitePath();
  suiteSteering();
  suiteWrongWay();
  suiteGuide();
  suiteWarnings();
  suiteHistory();
  suiteSequenceNaming();
  suiteFigures();
  suiteFlaggedGate();
  suiteFlaggedDoubleStack();
  suiteScoring();
  suiteWaypoint();
  suiteFrameSides();
  suiteBendLine();
  suitePoleSquare();
  suiteSchemaDoc();
  suiteFreestyle();
  suiteBoardPlan();
  suiteSchemaProps();
  suiteRoadsAndVehicles();
  suiteRoadTool();
  await suiteListing();
  suiteBranding();
  suiteFlagShape();
  suiteStartBlock();
  suiteDiveSupports();
  suiteClubhouseShell();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
