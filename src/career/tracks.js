/*
 * tracks.js: WebFPV's own race tracks.
 *
 * Original layouts, designed for this game, which the Steam edition ships in
 * place of the event tracks and RaceGOW rooms it may not carry (PLAN.md B2,
 * B3). The career's gate lessons fly them, and the official ones are the
 * Race list's, each with a Steam leaderboard of its own.
 *
 * Every track is a document the builder can open (./maps.js raceDoc), flown
 * on the race field: 60 by 40 m unless it says otherwise. A circuit is
 * written as its gates in flying order, and each gate faces the bisector of
 * the leg in and the leg out, so the racing line passes through square.
 * tests/career-maps.test.js holds every one to the builder's own warnings.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

import { EAST, NORTH, WEST, SOUTH, raceDoc } from './maps.js';
import { PRESETS } from '../trackbuilder/presets.js';
import { steamPreset, uttName } from '../steam/edition.js';

const BIG = { clearW: 3.0, clearH: 2.4, levels: 1, sillH: 0 };
const STD = { clearW: 1.524, clearH: 1.524, levels: 1, sillH: 0 };
const PADS = { pads: 1, spacing: 1.5, padSize: 0.6 };

/*
 * The whoop's room: the hall every room is built in (ten by twelve metres,
 * a grid in inches), 28 inch gates on 29 inch stacking, as whoop racing's
 * published rules measure them, so the builder's rule checks pass every
 * room as it ships (src/trackbuilder/warnings.js, collectRaceGowWarnings).
 * Every gate faces along one of the room's two axes, which is the rule a
 * kit of straight pipe imposes.
 */
const ROOM = { width: 10, depth: 12, trackClass: 'micro', gridSize: 0.0254, minCurveRadius: 0.45 };
const WHOOP = { levels: 1, sillH: 0, clearW: 0.7112, clearH: 0.7112, levelPitch: 0.73787 };
const WHOOP_STACK = { ...WHOOP, levels: 2 };
const WHOOP_RAISED = { ...WHOOP, sillH: 0.73787 };
const WHOOP_PADS = { pads: 1, spacing: 0.3, padSize: 0.1 };

/* The yaw that takes a closed loop of points through each square. */
function bisectors(points, closed = true) {
  const n = points.length;
  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const a = Math.atan2(p[1] - prev[1], p[0] - prev[0]);
    const b = Math.atan2(next[1] - p[1], next[0] - p[0]);
    if (!closed && i === 0) {
      return b;
    }
    if (!closed && i === n - 1) {
      return a;
    }
    return Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
  });
}

/*
 * A closed circuit of one kind of gate: pads first, then the gates, flown
 * in the order given. `pad` is [x, y, yaw].
 */
function circuit(id, name, pad, points, dims, field) {
  const yaws = bisectors(points);
  const rows = [['startPads', pad[0], pad[1], pad[2], PADS]];
  for (let i = 0; i < points.length; i += 1) {
    rows.push(['gate', points[i][0], points[i][1], yaws[i], { ...dims }]);
  }
  return raceDoc(id, name, field, rows, points.map((_, i) => [i + 1, 0, 1]));
}

const BUILDERS = {
  /* The beginner's oval: six wide gates, gentle corners. Career 2-5. */
  'meadow-wide': () => circuit('trk-c4a92001', 'Meadow Oval', [8, 8, EAST],
    [[20, 8], [40, 8], [52, 20], [40, 32], [20, 32], [8, 20]], BIG),

  /* One gate flown both ways: out through it, round the far flag, back
   * through it the other way, round the flag behind the pads. Career 7-1. */
  'one-gate': () => raceDoc('trk-c4a92002', 'One Gate', {}, [
    ['startPads', 14, 20, EAST, PADS],
    ['gate', 28, 20, EAST, { ...STD }],
    ['flag', 48, 20, EAST, { height: 2.5, poleRadius: 0.025, clearance: 1.5 }],
    ['flag', 6, 20, EAST, { height: 2.5, poleRadius: 0.025, clearance: 1.5 }],
  ], [[1, 0, 1], [2, 0, 1], [1, 0, -1], [3, 0, 1]]),

  /* Five gates in a weave up the field and the flag at the end. Career 7-2. */
  'gate-slalom': () => raceDoc('trk-c4a92003', 'Gate Slalom', {}, [
    ['startPads', 6, 20, EAST, PADS],
    ['gate', 14, 15, EAST, { ...STD }],
    ['gate', 22, 25, EAST, { ...STD }],
    ['gate', 30, 15, EAST, { ...STD }],
    ['gate', 38, 25, EAST, { ...STD }],
    ['gate', 46, 15, EAST, { ...STD }],
    ['flag', 54, 32, EAST, { height: 2.5, poleRadius: 0.025, clearance: 1.5 }],
  ], [[1], [2], [3], [4], [5], [6]]),

  /* A gate, the dive gate from above, and back round. Career 7-3. */
  'dive-in': () => raceDoc('trk-c4a92004', 'Dive In', {}, [
    ['startPads', 8, 20, EAST, PADS],
    ['gate', 20, 20, EAST, { ...STD }],
    ['diveGate', 40, 20, EAST, { levels: 1, sillH: 4.572, clearW: 2.1336, clearH: 1.8288, levelPitch: 1.862201 }, { pitch: Math.PI / 2 }],
    ['gate', 40, 34, WEST, { ...STD }],
  ], [[1], [2, 0, -1], [3]]),

  /* A double stack, top then bottom. Career 7-4. */
  'double-up': () => raceDoc('trk-c4a92005', 'Double Up', {}, [
    ['startPads', 8, 20, EAST, PADS],
    ['doubleStack', 26, 20, EAST, { levels: 2, sillH: 0, clearW: 1.524, clearH: 1.524, levelPitch: 1.557401 }],
    ['flag', 46, 20, EAST, { height: 2.5, poleRadius: 0.025, clearance: 1.5 }],
  ], [[1, 1, 1], [2], [1, 0, 1], [2]]),

  /* Two gates side by side, opposite ways, and the turn between. Career 7-5. */
  'hairpin': () => raceDoc('trk-c4a92006', 'Hairpin', {}, [
    ['startPads', 8, 14, EAST, PADS],
    ['gate', 24, 14, EAST, { ...STD }],
    ['gate', 44, 14, EAST, { ...STD }],
    ['gate', 44, 26, WEST, { ...STD }],
    ['gate', 24, 26, WEST, { ...STD }],
  ], [[1], [2], [3], [4]]),

  /* ---------------- the official tracks ---------------- */

  /* Official 1: the oval in five foot gates. */
  'meadow-sprint': () => circuit('trk-c4a92101', 'Meadow Sprint', [8, 8, EAST],
    [[20, 8], [40, 8], [52, 20], [40, 32], [20, 32], [8, 20]], STD),

  /* Official 2: a lazy S and back, eight gates. */
  'river-bend': () => circuit('trk-c4a92102', 'River Bend', [6, 6, EAST],
    [[16, 6], [30, 10], [42, 6], [54, 14], [46, 26], [32, 32], [18, 28], [8, 18]], STD),

  /* Official 3: a rectangle with a double stack on the back straight and a
   * dive gate in the far corner. */
  'stack-and-dive': () => raceDoc('trk-c4a92103', 'Stack and Dive', {}, [
    ['startPads', 6, 8, EAST, PADS],
    ['gate', 18, 8, EAST, { ...STD }],
    ['gate', 34, 8, EAST, { ...STD }],
    ['diveGate', 50, 14, NORTH, { levels: 1, sillH: 4.572, clearW: 2.1336, clearH: 1.8288, levelPitch: 1.862201 }, { pitch: Math.PI / 2 }],
    ['doubleStack', 36, 32, WEST, { levels: 2, sillH: 0, clearW: 1.524, clearH: 1.524, levelPitch: 1.557401 }],
    ['gate', 18, 32, WEST, { ...STD }],
    ['gate', 8, 20, SOUTH, { ...STD }],
  ], [[1], [2], [3, 0, -1], [4, 1], [5], [6]]),

  /* Official 4: the hairpin course, long, ten gates. */
  'switchback': () => circuit('trk-c4a92104', 'Switchback', [6, 20, EAST],
    [[14, 20], [24, 10], [36, 10], [46, 20], [54, 32], [42, 34], [34, 26], [26, 30], [16, 34], [6, 30]], STD),

  /* Official 5: the grand prix, a long flowing lap on a wider field. */
  'grand-prix': () => circuit('trk-c4a92105', 'Grand Prix', [8, 8, EAST],
    [[20, 8], [36, 12], [52, 8], [68, 14], [74, 28], [64, 40], [48, 36], [36, 44], [22, 40], [10, 28]], STD, { width: 80, depth: 52 }),

  /* ---------------- the whoop rooms ---------------- */

  /* Room 1: six gates on the floor, once round the room anticlockwise. */
  'front-room': () => raceDoc('trk-c4a92201', 'Front Room', ROOM, [
    ['startPads', 2, 2, EAST, WHOOP_PADS],
    ['gate', 4.5, 2, EAST, { ...WHOOP }],
    ['gate', 8, 4, NORTH, { ...WHOOP }],
    ['gate', 8, 8, NORTH, { ...WHOOP }],
    ['gate', 5, 10, WEST, { ...WHOOP }],
    ['gate', 2, 8, SOUTH, { ...WHOOP }],
    ['gate', 2, 4.5, SOUTH, { ...WHOOP }],
  ], [[1], [2], [3], [4], [5], [6]]),

  /* Room 2: a figure eight, anticlockwise round the left half of the room
   * and clockwise round the right, crossing in the middle twice a lap. */
  'kitchen-eight': () => raceDoc('trk-c4a92202', 'Kitchen Eight', ROOM, [
    ['startPads', 1.4, 4.2, EAST, WHOOP_PADS],
    ['gate', 3, 4.2, EAST, { ...WHOOP }],
    ['gate', 7, 7.8, EAST, { ...WHOOP }],
    ['gate', 8.8, 6, SOUTH, { ...WHOOP }],
    ['gate', 7, 4.2, WEST, { ...WHOOP }],
    ['gate', 3, 7.8, WEST, { ...WHOOP }],
    ['gate', 1.2, 6, SOUTH, { ...WHOOP }],
  ], [[1], [2], [3], [4], [5], [6]]),

  /* Room 3: up and down. The top of a two high stack, a dive to the
   * floor, a raised gate on the far wall, and the top of the second stack
   * on the way home. */
  'bunk-room': () => raceDoc('trk-c4a92203', 'Bunk Room', ROOM, [
    ['startPads', 1.6, 2, EAST, WHOOP_PADS],
    ['gate', 4, 2, EAST, { ...WHOOP }],
    ['gate', 8, 4.5, NORTH, { ...WHOOP_STACK }],
    ['gate', 8, 8.5, NORTH, { ...WHOOP }],
    ['gate', 5, 10.2, WEST, { ...WHOOP_RAISED }],
    ['gate', 2, 8, SOUTH, { ...WHOOP }],
    ['gate', 2, 4.5, SOUTH, { ...WHOOP_STACK }],
  ], [[1], [2, 1], [3], [4], [5], [6, 1]]),
};

/* The document for a track id, fresh each call: callers may change it. */
export function careerTrack(id) {
  const make = BUILDERS[id];
  if (!make) {
    throw new Error(`career: no track ${id}`);
  }
  return make();
}

export const CAREER_TRACK_IDS = Object.freeze(Object.keys(BUILDERS));

/*
 * THE OFFICIAL COURSES: the five inch tracks, the WebFPV whoop rooms and the
 * UTT tracks the Steam edition ships in place of the board's (PLAN.md
 * sections 2 and 6), in order of difficulty. Each carries the medal lap
 * times the Tracks room shows (none on a UTT track, which nobody here has
 * flown to a time yet), its Steam leaderboard's name, and the id its
 * document has, which is how a lap flown on it is known for one of them
 * wherever it was seated from: the Tracks room, the builder, or a lesson.
 */
function official(list, trackClass) {
  return Object.freeze(list.map((t) => Object.freeze({
    ...t,
    trackClass,
    docId: careerTrack(t.id).id,
    name: careerTrack(t.id).name,
    board: `LAP_${t.id.toUpperCase().replace(/-/g, '_')}`,
  })));
}

export const OFFICIAL_TRACKS = official([
  { id: 'meadow-sprint', difficulty: 1, gold: 9500, silver: 12500 },
  { id: 'river-bend', difficulty: 2, gold: 12500, silver: 16000 },
  { id: 'stack-and-dive', difficulty: 3, gold: 13500, silver: 18000 },
  { id: 'switchback', difficulty: 3, gold: 15500, silver: 20000 },
  { id: 'grand-prix', difficulty: 4, gold: 19000, silver: 25000 },
], 'full');

/* The rooms' medals are set from their laps (tests/career-laps.test.js):
 * gold near 3.7 m/s round a lap of about 22 m, silver near 2.7, in the
 * whoop's own metres. Not yet flown by the rig, which flies the five inch. */
export const OFFICIAL_ROOMS = official([
  { id: 'front-room', difficulty: 1, gold: 6000, silver: 8000 },
  { id: 'kitchen-eight', difficulty: 2, gold: 6000, silver: 8000 },
  { id: 'bunk-room', difficulty: 3, gold: 6500, silver: 9000 },
], 'micro');

/*
 * THE UTT TRACKS: RaceGOW's eight rooms, which ship as Ultra Tiny Tracks on
 * the owner's word of 2026-10-14 (PLAN.md B3). Their documents are the
 * builder's presets (src/trackbuilder/presets.js), so a UTT track is the
 * same layout in the Tracks room, the builder's Load list and on its board.
 * In track number order, after the WebFPV rooms. No medals: a time has to
 * be flown before it is a target.
 */
const UTT_PRESETS = PRESETS
  .filter((d) => d.trackClass === 'micro' && d.credit && /RaceGOW/i.test(String(d.credit.series || '')))
  .map((d) => ({ d, n: Number((/(\d+)\s*$/.exec(d.name) || [])[1]) || 0 }))
  .sort((a, b) => a.n - b.n);

export const OFFICIAL_UTT = Object.freeze(UTT_PRESETS.map(({ d, n }) => Object.freeze({
  id: `utt-${n}`,
  preset: true,
  difficulty: 2,
  gold: null,
  silver: null,
  trackClass: 'micro',
  docId: d.id,
  name: uttName(d.name),
  designer: String(d.credit.designer || ''),
  board: `LAP_UTT_TRACK_${n}`,
})));

export const OFFICIAL_COURSES = Object.freeze([...OFFICIAL_TRACKS, ...OFFICIAL_ROOMS, ...OFFICIAL_UTT]);

/* The official course a document is, by its id, or null. */
export function officialByDoc(docId) {
  return OFFICIAL_COURSES.find((t) => t.docId === docId) || null;
}

/* A fresh document of one official course: a career track, or a UTT
 * track's preset under the name this edition gives it. */
export function officialDoc(t) {
  if (t && t.preset) {
    const d = PRESETS.find((x) => x.id === t.docId);
    return d ? JSON.parse(JSON.stringify(steamPreset(d))) : null;
  }
  return careerTrack(t.id);
}

/* Fresh documents of the official courses for one class, or all of them.
 * `presets: false` leaves out the UTT tracks, which the builder already
 * lists as its own presets. */
export function officialDocs(trackClass = null, { presets = true } = {}) {
  return OFFICIAL_COURSES
    .filter((t) => (!trackClass || t.trackClass === trackClass) && (presets || !t.preset))
    .map((t) => officialDoc(t))
    .filter(Boolean);
}
