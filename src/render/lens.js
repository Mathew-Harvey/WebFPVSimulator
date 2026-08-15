/*
 * lens.js: the camera's field of view, and the argument for it.
 *
 * One file, no imports, because three things need this number and none of
 * them should have to depend on the others to get it: the shell builds the
 * camera, the settings screen offers the list, and the shared orbit clip is
 * shot on the same lens so a course does not look like a different course in
 * the clip somebody posts of it.
 *
 * WHY THESE ARE NOT THE NUMBERS ON THE SIDE OF AN FPV CAMERA.
 *
 * The list used to be 90 to 120 with a note that real cameras run 135 to 160
 * degrees diagonal, as though the job were to type the lens's figure in. It
 * is not, and doing it is what made a regulation gate read as a distant hoop
 * and produced the report that started this: "the gates feel small".
 *
 * An FPV lens is a fisheye. A 2.1 mm lens on a 1/1.8 in sensor is close to
 * equidistant, r = f * theta, and its published 150 to 160 degrees is the
 * TOTAL COVERAGE of that projection. Three.js is rectilinear, r = f * tan
 * theta, which spends its image on the periphery: at a wide angle the edges
 * are stretched and the middle, which is the part a pilot flies a gate with,
 * is squeezed. Feeding a fisheye's coverage figure to a rectilinear camera
 * therefore matches the one property nobody looks at and gets wrong the one
 * they do.
 *
 * What has to match is the magnification at the CENTRE of the frame:
 *
 *   equidistant   half height h = f  * thetaV      so centre scale = f
 *   rectilinear   half height h = f' * tan(v / 2)  so centre scale = f'
 *   equal centres  =>  tan(v / 2) = thetaV in radians
 *
 * A 155 degree diagonal lens on a 4:3 sensor has a vertical half angle of
 * 77.5 * 3/5 = 46.5 degrees = 0.8116 rad, so tan(v/2) = 0.8116 and v = 78
 * degrees. The old default of 100 was showing the middle of the frame
 * tan(50)/tan(39.05) = 1.47 times too small.
 *
 * 85 is the default rather than 78 because the trade is real: a rectilinear
 * projection cannot have both a fisheye's centre magnification and its
 * peripheral coverage, and a racer needs to see the next gate before they are
 * pointed at it. At 85 on a 16:9 panel the view is still 117 degrees wide,
 * against 129 at the old 100, and the middle of the frame is 1.30 times
 * larger. The list brackets it so a pilot can take the honest 75 or give it
 * back for width, which is a lens choice on a real quad too.
 *
 * NOT THE SAME LEVER AS EITHER SCALE. GATE_SCALE in src/game/track.js makes a
 * gate bigger in metres and WORLD_SCALE in src/render/frame.js used to make
 * the aircraft smaller. Neither can change how big a gate looks, because a
 * bigger gate seen from proportionally further away is the same picture.
 * Apparent size is this file's, and only this file's.
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

/* Vertical field of view, degrees, for a rectilinear projection. */
export const CAMERA_FOVS = [75, 85, 95, 105];

export const CAMERA_FOV_DEFAULT = 85;
