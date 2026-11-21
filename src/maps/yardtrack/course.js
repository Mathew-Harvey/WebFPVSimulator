/*
 * course.js: the yard track, RaceGOW6 Track 5 by MrE and Blastaa, as the
 * board published it (trk-716de90b, by andAgainFPV, last changed on the
 * board at 2026-11-21T02:30:35Z). It took the place of Track 4 in the
 * three yards on the owner's ask of 2026-11-21: "replace the whoop tracks in
 * the josh bardwel and nick burns and heads map with this track". Earlier
 * tracks are in git history. All are 10 by 12 metre micro fields, so the
 * same spots hold them.
 *
 * A copy and not a fetch, for two reasons. The house maps are built with no
 * network in the loop, so a board that is down cannot take the track out of
 * the yard; and the owner pays for what is served, so the track's logo
 * pictures are not carried in the document but saved beside it as WebP
 * (assets/yardtrack/). Only the pieces and the flying order are kept, in
 * the document's own RaceGOW metres, exactly as published, and the ground
 * logo pieces as rectangles, where the yard lays those pictures
 * (./yardtrack.js). A later change to the board's copy does not reach here
 * until this file is copied again.
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

/* The document, as courseFromDocument (src/game/trackdoc.js) reads one.
 * Handed out as a fresh copy each time (courseDocument), because a reader
 * may repair what it is given in place. */
const COURSE_DOCUMENT = {
  id: 'trk-716de90b',
  name: "RaceGOW6 Track5 sponsored by Average Jane & Joes and designed by MrE and Blastaa",
  schemaVersion: 3,
  trackClass: 'micro',
  field: {depth: 12, width: 10, gridSize: 0.0254},
  settings: {tangentScale: 1.1, minCurveRadius: 0.45, samplesPerSegment: 48},
  elements: [
    {id: 'el-1', yaw: 1.570796, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, position: {x: 5.334, y: 4.953, z: 0}, yawOverridden: true},
    {id: 'el-2', yaw: 3.141593, dims: {depth: 0.02667, width: 0.762, height: 0.02667}, name: '', type: 'horizontalPole', pitch: 0, position: {x: 4.572, y: 4.953, z: 0}, yawOverridden: false},
    {id: 'el-6', yaw: 3.141593, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 2, levelPitch: 0.762}, name: '', type: 'doubleStack', pitch: 0, position: {x: 4.191, y: 5.334, z: 0}, yawOverridden: true},
    {id: 'el-7', yaw: 1.904081, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 3.905809, y: 5.351233, z: 0.914981}, yawOverridden: false},
    {id: 'el-8', yaw: 3.141593, dims: {sillH: 0, clearH: 1.27, clearW: 1.27, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.191, y: 7.112, z: 0}, yawOverridden: true},
    {id: 'el-9', yaw: 3.141593, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, position: {x: 4.191, y: 6.096, z: 0}, yawOverridden: true},
    {id: 'el-10', yaw: 1.099557, dims: {height: 2.286, clearance: 0.3556, poleRadius: 0.013335}, name: '', type: 'pole', decor: true, pitch: 0, position: {x: 4.191, y: 5.6896, z: 0}, yawOverridden: true},
    {id: 'el-11', yaw: 3.141593, dims: {sillH: 0.762, clearH: 1.524, clearW: 1.524, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.1656, y: 6.4516, z: 0}, yawOverridden: true},
    {id: 'el-12', yaw: 3.141593, dims: {sillH: 1.524, clearH: 1.27, clearW: 1.778, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.1656, y: 4.7498, z: 0}, yawOverridden: true},
    {id: 'el-13', yaw: 0, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', decor: true, pitch: 0, position: {x: 5.715, y: 5.334, z: 0}, yawOverridden: true},
    {id: 'el-14', yaw: 0, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 2, levelPitch: 0.762}, name: '', type: 'doubleStack', decor: true, pitch: 0, position: {x: 5.715, y: 6.0706, z: 0}, unbuiltPoles: ['left:1', 'right:1'], unbuiltSides: ['top'], yawOverridden: true},
    {id: 'el-15', yaw: 0.741947, dims: {height: 2.286, clearance: 0.3556, poleRadius: 0.013335}, name: '', type: 'pole', decor: true, pitch: 0, position: {x: 5.715, y: 6.4516, z: 0}, yawOverridden: false},
    {id: 'el-16', yaw: 0, dims: {sillH: 0, clearH: 2.286, clearW: 1.524, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.715, y: 7.239, z: 0}, yawOverridden: true},
    {id: 'el-17', yaw: 0, dims: {sillH: 0, clearH: 1.524, clearW: 1.27, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.715, y: 5.8166, z: 0.762}, yawOverridden: true},
    {id: 'el-18', yaw: 0, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.715, y: 6.096, z: 0}, yawOverridden: true},
    {id: 'el-19', yaw: 0, dims: {sillH: 0, clearH: 2.286, clearW: 1.524, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.6896, y: 7.2136, z: 0}, yawOverridden: true},
    {id: 'el-20', yaw: -3.141593, dims: {sillH: 0.762, clearH: 1.27, clearW: 2.032, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.7404, y: 5.4102, z: 0}, yawOverridden: true},
    {id: 'el-21', yaw: 0, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.715, y: 5.334, z: 0}, yawOverridden: true},
    {id: 'el-22', yaw: 3.141593, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.191, y: 6.096, z: 0}, yawOverridden: true},
    {id: 'el-23', yaw: 0, dims: {sillH: 0, clearH: 1.524, clearW: 1.524, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.191, y: 4.2164, z: 0}, yawOverridden: true},
    {id: 'el-24', yaw: 1.570796, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.334, y: 4.953, z: 0}, yawOverridden: true},
  ],
  sequence: [
    {id: 'sq-1', entry: 1, passSide: null, clearance: null, elementId: 'el-1', overridden: true, apertureIndex: 0},
    {id: 'sq-10', entry: 1, passSide: null, clearance: null, elementId: 'el-8', overridden: false, apertureIndex: 0},
    {id: 'sq-11', entry: -1, passSide: null, clearance: null, elementId: 'el-9', overridden: false, apertureIndex: 0},
    {id: 'sq-8', entry: 1, passSide: null, clearance: null, elementId: 'el-6', overridden: true, apertureIndex: 0},
    {id: 'sq-9', wrap: 'over', entry: -1, passSide: null, clearance: null, elementId: 'el-6', overridden: true, apertureIndex: 1},
    {id: 'sq-12', entry: 1, passSide: null, clearance: null, elementId: 'el-11', overridden: true, apertureIndex: 0},
    {id: 'sq-13', entry: -1, passSide: null, clearance: null, elementId: 'el-12', overridden: false, apertureIndex: 0},
    {id: 'sq-14', entry: 1, passSide: null, clearance: null, elementId: 'el-16', overridden: true, apertureIndex: 0},
    {id: 'sq-15', entry: -1, passSide: null, clearance: null, elementId: 'el-17', overridden: false, apertureIndex: 0},
    {id: 'sq-17', entry: 1, passSide: null, clearance: null, elementId: 'el-19', overridden: true, apertureIndex: 0},
    {id: 'sq-16', entry: -1, passSide: null, clearance: null, elementId: 'el-18', overridden: true, apertureIndex: 0},
    {id: 'sq-18', entry: -1, passSide: null, clearance: null, elementId: 'el-20', overridden: true, apertureIndex: 0},
    {id: 'sq-19', entry: -1, passSide: null, clearance: null, elementId: 'el-21', overridden: false, apertureIndex: 0},
    {id: 'sq-20', entry: 1, passSide: null, clearance: null, elementId: 'el-22', overridden: false, apertureIndex: 0},
    {id: 'sq-21', entry: 1, passSide: null, clearance: null, elementId: 'el-23', overridden: true, apertureIndex: 0},
    {id: 'sq-22', entry: 1, passSide: null, clearance: null, elementId: 'el-24', overridden: true, apertureIndex: 0},
  ],
};

/* The ground logo pieces: where each lies, how it is turned, its size and
 * the picture it wears (./yardtrack.js FLOOR_MARKS), document metres. */
export const GROUND_LOGOS = [
  {id: 'el-25', logo: 'averagejane', position: {x: 5.08, y: 4.3434, z: 0}, yaw: 0, dims: {depth: 1.016, width: 1.524}},
  {id: 'el-26', logo: 'racegow6', position: {x: 5.0038, y: 5.9182, z: 0}, yaw: 1.579523, dims: {depth: 1.016, width: 1.27}},
];

export const COURSE_ID = COURSE_DOCUMENT.id;
export const COURSE_NAME = 'RaceGOW6 Track 5';

export function courseDocument() {
  return JSON.parse(JSON.stringify(COURSE_DOCUMENT));
}
