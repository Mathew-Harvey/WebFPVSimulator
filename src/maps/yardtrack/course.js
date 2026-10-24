/*
 * course.js: the yard track, RaceGOW6 Track 3 by the Lego Dans, as the board
 * published it (trk-85c74ecc, by andAgainFPV, last changed on the board at
 * 2026-10-24T02:55:48Z). The owner's ask of 2026-10-24: "i want this track,
 * functional (with timer callout and gates etc) placed in heads front yard,
 * in nicks back yard and in josh bardwells yard".
 *
 * A copy and not a fetch, for two reasons. The house maps are built with no
 * network in the loop, so a board that is down cannot take the track out of
 * the yard; and the owner pays for what is served, so the track's two logo
 * pictures (380 kB of PNG in the board's copy) are not carried in the
 * document but saved beside it as WebP (assets/yardtrack/, 44 kB). Only
 * the pieces and the flying order are kept, in the document's own RaceGOW
 * metres, exactly as published, and the two ground logo pieces as
 * rectangles, where the yard lays those pictures (./yardtrack.js). A later
 * change to the board's copy does not reach here until this file is copied
 * again.
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
  id: 'trk-85c74ecc',
  name: 'RaceGOW6 Track 3 sponsored by Minifigs.me and designed by the Lego Dans',
  schemaVersion: 3,
  trackClass: 'micro',
  field: {depth: 12, width: 10, gridSize: 0.0254},
  settings: {tangentScale: 1.1, minCurveRadius: 0.45, samplesPerSegment: 48},
  elements: [
    {id: 'el-1', yaw: 1.570796, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, position: {x: 4.6482, y: 4.9276, z: 0}, yawOverridden: true},
    {id: 'el-2', yaw: 3.141593, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, position: {x: 4.2672, y: 5.3086, z: 0}, yawOverridden: true},
    {id: 'el-3', yaw: 0, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, position: {x: 4.2672, y: 6.0706, z: 0}, yawOverridden: true},
    {id: 'el-4', yaw: 3.141593, dims: {sillH: 0.762, clearH: 0.7112, clearW: 2.286, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.2672, y: 6.0706, z: 0}, yawOverridden: true},
    {id: 'el-5', yaw: 0, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, position: {x: 4.2672, y: 6.8326, z: 0}, yawOverridden: true},
    {id: 'el-6', yaw: 1.570796, dims: {sillH: 0, clearH: 1.4478, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, position: {x: 3.8862, y: 7.2136, z: 0}, yawOverridden: true},
    {id: 'el-7', yaw: 1.570796, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, position: {x: 4.6482, y: 7.2136, z: 0}, yawOverridden: true},
    {id: 'el-8', yaw: 1.570796, dims: {sillH: 0, clearH: 2.286, clearW: 2.54, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.6896, y: 7.112, z: 0}, yawOverridden: true},
    {id: 'el-9', yaw: 0, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.2672, y: 6.8326, z: 0}, yawOverridden: true},
    {id: 'el-10', yaw: -1.570796, dims: {sillH: 0, clearH: 2.286, clearW: 2.286, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 6.1976, y: 7.1882, z: 0}, yawOverridden: true},
    {id: 'el-11', yaw: 3.141593, dims: {sillH: 0, clearH: 0.7112, clearW: 2.2606, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.2672, y: 6.0706, z: 0.762}, yawOverridden: true},
    {id: 'el-12', yaw: 1.570796, dims: {sillH: 0, clearH: 1.4732, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 3.8862, y: 7.2136, z: 0}, yawOverridden: true},
    {id: 'el-13', yaw: 0, dims: {sillH: 1.524, clearH: 2.286, clearW: 2.286, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, position: {x: 4.2672, y: 6.096, z: 0}, unbuiltSides: ['top', 'left'], yawOverridden: true},
    {id: 'el-14', yaw: 3.141593, dims: {sillH: 0, clearH: 0.7112, clearW: 2.286, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.2672, y: 6.0706, z: 0.762}, yawOverridden: true},
    {id: 'el-15', yaw: 0, dims: {sillH: 0, clearH: 2.286, clearW: 2.286, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.2672, y: 8.382, z: 0}, yawOverridden: true},
    {id: 'el-16', yaw: -1.570796, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.6482, y: 4.953, z: 0}, yawOverridden: true},
    {id: 'el-17', yaw: 0.349066, dims: {height: 1.5, clearance: 0.5334, poleRadius: 0.013335}, name: '', type: 'pole', pitch: 0, position: {x: 4.2672, y: 4.953, z: 0}, yawOverridden: true},
    {id: 'el-20', yaw: -0.3473, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 3.796631, y: 7.857625, z: 0.599078}, yawOverridden: false},
    {id: 'el-21', yaw: -0.884728, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 5.510548, y: 7.343145, z: 0.513383}, yawOverridden: false},
    {id: 'el-22', yaw: -0.43296, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 5.030377, y: 7.913559, z: 0.533495}, yawOverridden: false},
  ],
  sequence: [
    {id: 'sq-1', entry: 1, passSide: null, clearance: null, elementId: 'el-1', overridden: true, apertureIndex: 0},
    {id: 'sq-3', entry: -1, passSide: null, clearance: null, elementId: 'el-3', overridden: true, apertureIndex: 0},
    {id: 'sq-2', entry: -1, passSide: null, clearance: null, elementId: 'el-2', overridden: true, apertureIndex: 0},
    {id: 'sq-4', entry: 1, passSide: null, clearance: null, elementId: 'el-4', overridden: true, apertureIndex: 0},
    {id: 'sq-6', entry: 1, passSide: null, clearance: null, elementId: 'el-6', overridden: true, apertureIndex: 0},
    {id: 'sq-18', entry: null, passSide: 'left', clearance: 0, elementId: 'el-20', overridden: false, apertureIndex: null},
    {id: 'sq-20', entry: null, passSide: 'left', clearance: 0, elementId: 'el-22', overridden: false, apertureIndex: null},
    {id: 'sq-19', entry: null, passSide: 'left', clearance: 0, elementId: 'el-21', overridden: false, apertureIndex: null},
    {id: 'sq-7', entry: 1, passSide: null, clearance: null, elementId: 'el-7', overridden: true, apertureIndex: 0},
    {id: 'sq-10', entry: 1, passSide: null, clearance: null, elementId: 'el-10', overridden: true, apertureIndex: 0},
    {id: 'sq-5', entry: -1, passSide: null, clearance: null, elementId: 'el-5', overridden: true, apertureIndex: 0},
    {id: 'sq-11', entry: -1, passSide: null, clearance: null, elementId: 'el-11', overridden: true, apertureIndex: 0},
    {id: 'sq-12', entry: -1, passSide: null, clearance: null, elementId: 'el-12', overridden: true, apertureIndex: 0},
    {id: 'sq-15', entry: 1, passSide: null, clearance: null, elementId: 'el-15', overridden: true, apertureIndex: 0},
    {id: 'sq-13', entry: -1, passSide: null, clearance: null, elementId: 'el-13', overridden: true, apertureIndex: 0},
    {id: 'sq-14', entry: -1, passSide: null, clearance: null, elementId: 'el-14', overridden: false, apertureIndex: 0},
    {id: 'sq-17', entry: null, passSide: 'right', clearance: 1.524, elementId: 'el-17', overridden: false, apertureIndex: null},
    {id: 'sq-16', entry: -1, passSide: null, clearance: null, elementId: 'el-16', overridden: true, apertureIndex: 0},
  ],
};

/* The two ground logo pieces: where each lies, how it is turned and its
 * size, document metres. */
export const GROUND_LOGOS = [
  {id: 'el-18', position: {x: 5.6896, y: 6.0706, z: 0}, yaw: 0.003491, dims: {depth: 4, width: 2.54}},
  {id: 'el-19', position: {x: 5.6896, y: 8.0264, z: 0}, yaw: -0.006981, dims: {depth: 1.27, width: 2.54}},
];

export const COURSE_ID = COURSE_DOCUMENT.id;
export const COURSE_NAME = 'RaceGOW6 Track 3';

export function courseDocument() {
  return JSON.parse(JSON.stringify(COURSE_DOCUMENT));
}
