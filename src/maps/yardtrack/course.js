/*
 * course.js: the yard track, RaceGOW6 Track 4 by Hotspur and Cumber, as the
 * board published it (trk-eb699343, by andAgainFPV, last changed on the
 * board at 2026-11-07T02:49:43Z). It took the place of Track 3 in the
 * three yards on the owner's ask of 2026-11-07: "i want this track to
 * replace the current tracks on bardwell, Nick burns and heads map".
 * Track 3 is trk-85c74ecc, in git history. Both are 10 by 12 metre micro
 * fields, so the same spots hold it.
 *
 * A copy and not a fetch, for two reasons. The house maps are built with no
 * network in the loop, so a board that is down cannot take the track out of
 * the yard; and the owner pays for what is served, so the track's two logo
 * pictures (350 kB of PNG in the board's copy) are not carried in the
 * document but saved beside it as WebP (assets/yardtrack/, 33 kB). Only
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
  id: 'trk-eb699343',
  name: "RaceGow6 Track4 sponsored by Neo's UV Creations and designed by Hotspur and Cumber",
  schemaVersion: 3,
  trackClass: 'micro',
  field: {depth: 12, width: 10, gridSize: 0.0254},
  settings: {tangentScale: 1.1, minCurveRadius: 0.45, samplesPerSegment: 48},
  elements: [
    {id: 'el-3', yaw: 1.570796, dims: {depth: 0.02667, width: 0.762, height: 0.02667}, name: '', type: 'horizontalPole', pitch: 0, position: {x: 4.3434, y: 5.3594, z: 0}, yawOverridden: false},
    {id: 'el-4', yaw: 1.570796, dims: {depth: 0.02667, width: 0.762, height: 0.02667}, name: '', type: 'horizontalPole', pitch: 0, position: {x: 4.3434, y: 6.8834, z: 0}, yawOverridden: false},
    {id: 'el-5', yaw: 1.570796, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, position: {x: 4.7244, y: 4.9784, z: 0}, unbuiltSides: ['bottom'], yawOverridden: true},
    {id: 'el-6', yaw: 1.570796, dims: {sillH: 0, clearH: 0.7112, clearW: 1.4224, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, position: {x: 5.08, y: 7.2644, z: 0}, unbuiltSides: ['bottom'], yawOverridden: true},
    {id: 'el-7', yaw: -3.141593, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', decor: true, pitch: 0, position: {x: 4.3434, y: 6.1214, z: 0}, unbuiltSides: ['bottom'], yawOverridden: true},
    {id: 'el-8', yaw: -2.322873, dims: {height: 1.5, clearance: 0.3556, poleRadius: 0.013335}, name: '', type: 'pole', decor: true, pitch: 0, position: {x: 4.3434, y: 6.477, z: 0}, yawOverridden: false},
    {id: 'el-9', yaw: -3.141593, dims: {sillH: 0, clearH: 1.4224, clearW: 1.524, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.3434, y: 5.715, z: 0.7112}, yawOverridden: true},
    {id: 'el-10', yaw: -1.951163, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 6.016533, y: 7.482922, z: 0.849148}, yawOverridden: false},
    {id: 'el-11', yaw: -2.113039, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 6.02683, y: 6.244633, z: 1.043593}, yawOverridden: false},
    {id: 'el-12', yaw: 1.570796, dims: {sillH: 0.762, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', decor: true, pitch: 0, floating: true, position: {x: 4.7244, y: 7.2644, z: 0}, yawOverridden: true},
    {id: 'el-13', yaw: -1.570796, dims: {sillH: 0.762, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', decor: true, pitch: 0, floating: true, position: {x: 5.4356, y: 7.2644, z: 0}, yawOverridden: true},
    {id: 'el-14', yaw: 1.570796, dims: {height: 2.286, clearance: 0.3556, poleRadius: 0.013335}, name: '', type: 'pole', decor: true, pitch: 0, position: {x: 4.3434, y: 7.2644, z: 0}, yawOverridden: false},
    {id: 'el-15', yaw: 0.819283, dims: {height: 2.286, clearance: 0.3556, poleRadius: 0.013335}, name: '', type: 'pole', decor: true, pitch: 0, position: {x: 5.7912, y: 7.2644, z: 0}, yawOverridden: false},
    {id: 'el-16', yaw: 1.570796, dims: {sillH: 1.4732, clearH: 1.27, clearW: 1.4478, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.08, y: 7.2644, z: 0}, yawOverridden: true},
    {id: 'el-17', yaw: 1.080091, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 4.070707, y: 7.33547, z: 1.742752}, yawOverridden: false},
    {id: 'el-18', yaw: -1.570796, dims: {sillH: 0.762, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.4356, y: 7.2644, z: 0}, yawOverridden: true},
    {id: 'el-19', yaw: 0.88731, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 6.246281, y: 7.432677, z: 1.77842}, yawOverridden: false},
    {id: 'el-20', yaw: 0.281033, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 5.685044, y: 6.956554, z: 1.971469}, yawOverridden: false},
    {id: 'el-21', yaw: -1.570796, dims: {sillH: 0, clearH: 0.7112, clearW: 1.4224, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.08, y: 7.239, z: 0}, yawOverridden: true},
    {id: 'el-22', yaw: 1.570796, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 5.984324, y: 6.929247, z: 0.902177}, yawOverridden: false},
    {id: 'el-23', yaw: 2.501893, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 5.935761, y: 7.861314, z: 0.650328}, yawOverridden: false},
    {id: 'el-24', yaw: 1.570796, dims: {sillH: 0.762, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.7244, y: 7.2644, z: 0}, yawOverridden: true},
    {id: 'el-25', yaw: 1.570796, dims: {sillH: 1.4732, clearH: 1.27, clearW: 1.4478, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.08, y: 7.2644, z: 0}, yawOverridden: true},
    {id: 'el-26', yaw: -1.570796, dims: {sillH: 0.762, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 5.461, y: 7.2644, z: 0}, yawOverridden: true},
    {id: 'el-28', yaw: 3.141593, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.3434, y: 6.1214, z: 0}, yawOverridden: true},
    {id: 'el-31', yaw: -1.570796, dims: {sillH: 0, clearH: 0.7112, clearW: 0.7112, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 4.7244, y: 4.9784, z: 0}, yawOverridden: true},
    {id: 'el-32', yaw: -1.364054, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 4.026637, y: 5.01981, z: 0.3556}, yawOverridden: false},
    {id: 'el-33', yaw: -1.570796, dims: {sillH: 0, clearH: 2.286, clearW: 2.286, levels: 1, levelPitch: 0.762}, name: '', type: 'gate', pitch: 0, unbuilt: true, position: {x: 3.16282, y: 6.477, z: 0}, yawOverridden: true},
    {id: 'el-34', yaw: -0.117498, dims: {height: 0.35, clearance: 0, poleRadius: 0.008}, name: '', type: 'waypoint', pitch: 0, position: {x: 4.151876, y: 5.221216, z: 0.824347}, yawOverridden: false},
  ],
  sequence: [
    {id: 'sq-1', entry: 1, passSide: null, clearance: null, elementId: 'el-5', overridden: true, apertureIndex: 0},
    {id: 'sq-2', entry: 1, passSide: null, clearance: null, elementId: 'el-6', overridden: true, apertureIndex: 0},
    {id: 'sq-4', entry: null, passSide: 'left', clearance: 0, elementId: 'el-10', overridden: false, apertureIndex: null},
    {id: 'sq-5', entry: null, passSide: 'left', clearance: 0, elementId: 'el-11', overridden: false, apertureIndex: null},
    {id: 'sq-3', entry: 1, passSide: null, clearance: null, elementId: 'el-9', overridden: true, apertureIndex: 0},
    {id: 'sq-7', entry: null, passSide: 'left', clearance: 0, elementId: 'el-17', overridden: false, apertureIndex: null},
    {id: 'sq-6', entry: -1, passSide: null, clearance: null, elementId: 'el-16', overridden: true, apertureIndex: 0},
    {id: 'sq-10', entry: null, passSide: 'right', clearance: 0, elementId: 'el-20', overridden: false, apertureIndex: null},
    {id: 'sq-9', entry: null, passSide: 'right', clearance: 0, elementId: 'el-19', overridden: false, apertureIndex: null},
    {id: 'sq-8', entry: 1, passSide: null, clearance: null, elementId: 'el-18', overridden: true, apertureIndex: 0},
    {id: 'sq-12', entry: null, passSide: 'right', clearance: 0, elementId: 'el-22', overridden: false, apertureIndex: null},
    {id: 'sq-13', entry: null, passSide: 'right', clearance: 0, elementId: 'el-23', overridden: false, apertureIndex: null},
    {id: 'sq-11', entry: 1, passSide: null, clearance: null, elementId: 'el-21', overridden: true, apertureIndex: 0},
    {id: 'sq-14', entry: 1, passSide: null, clearance: null, elementId: 'el-24', overridden: true, apertureIndex: 0},
    {id: 'sq-15', entry: -1, passSide: null, clearance: null, elementId: 'el-25', overridden: true, apertureIndex: 0},
    {id: 'sq-16', entry: -1, passSide: null, clearance: null, elementId: 'el-26', overridden: true, apertureIndex: 0},
    {id: 'sq-23', entry: 1, passSide: null, clearance: null, elementId: 'el-33', overridden: true, apertureIndex: 0},
    {id: 'sq-24', entry: null, passSide: 'right', clearance: 0, elementId: 'el-34', overridden: false, apertureIndex: null},
    {id: 'sq-18', entry: 1, passSide: null, clearance: null, elementId: 'el-28', overridden: true, apertureIndex: 0},
    {id: 'sq-22', entry: null, passSide: 'right', clearance: 0, elementId: 'el-32', overridden: false, apertureIndex: null},
    {id: 'sq-21', entry: -1, passSide: null, clearance: null, elementId: 'el-31', overridden: true, apertureIndex: 0},
  ],
};

/* The two ground logo pieces: where each lies, how it is turned, its size
 * and the picture it wears (./yardtrack.js FLOOR_MARKS), document metres. */
export const GROUND_LOGOS = [
  {id: 'el-35', logo: 'neos', position: {x: 5.08, y: 6.1214, z: 0}, yaw: 1.576032, dims: {depth: 1.1684, width: 2.032}},
  {id: 'el-36', logo: 'racegow6', position: {x: 4.8006, y: 4.44552, z: 0}, yaw: 0.010472, dims: {depth: 1.0541, width: 1.524}},
];

export const COURSE_ID = COURSE_DOCUMENT.id;
export const COURSE_NAME = 'RaceGOW6 Track 4';

export function courseDocument() {
  return JSON.parse(JSON.stringify(COURSE_DOCUMENT));
}
