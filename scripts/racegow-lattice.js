/*
 * racegow-lattice.js: the shipped RaceGOW tracks, each as a lattice of
 * 28 inch gates, and the script that turns them into
 * src/trackbuilder/presets.js.
 *
 * WHY A LATTICE. A RaceGOW track is built from cut lengths of 3/4 inch PVC
 * and right angle fittings. So every gate is a square, every gate stands
 * square to one of two axes or lies flat, and the distance between any two
 * things is a whole number of gate units. The official animation of a track
 * is therefore a picture of a lattice, and reading it is counting: which
 * unit squares are lit, in which order, flown which way. That reading is
 * written here as data, one small object per track, and this script does
 * the arithmetic. Run it and presets.js is rewritten:
 *
 *   node scripts/racegow-lattice.js
 *
 * WHAT ONE SQUARE IS. Two parallel pipes leaving 28 inches of daylight
 * between them, which is RaceGOW's maximum opening and what everything else
 * in this project is built around. The pipes are therefore 28 inches plus
 * one pipe apart, centre to centre, which is what UNIT is below, and the
 * frame tube is drawn on the lattice line. Adjacent squares share a pipe,
 * which is how the real thing is built. An elevated square is a gate with
 * its sill at a whole number of units, on legs to the floor that are the
 * same pipe as the square below it, so a column of squares is a tower and a
 * row of them is a rail with openings under and over it.
 *
 * WHAT A POLE IS. The animation lights a full height panel beside a pole,
 * which is what RaceGOW's pole rule means: fly past it on this side, at any
 * height. That is the builder's marker, whose scoring square stands on the
 * pass side as tall as the pole. The pole itself is the gate's own upright
 * carried on, and it stands at RaceGOW's published 14 inches from the gate
 * centre, which on this lattice is half an inch inboard of the stile.
 *
 * THE LAP is a string: one token per pass, a square's letter with the sign
 * of travel along its axis, or a pole's key on its own.
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

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTrack, createElement, createSequenceEntry, normalize, toPlain,
} from '../src/trackbuilder/model.js';
import { GATE_OPENING_MAX, PIPE_OD, POLE_FROM_GATE_MIN } from '../src/trackbuilder/racegow.js';
import { IN } from '../src/units.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * ONE UNIT OF EVERYTHING, AND IT IS SET BY THE GATE RATHER THAN BY THE PIPE.
 *
 * It was 27 inches, one length of shop pipe, because that is what RaceGOW's
 * pipe rule tells you to cut: "20 sections at 26.5 to 27.25 inches". Two
 * pipes 27 inches apart centre to centre leave 27 less one pipe of daylight,
 * so the clear opening came out at 25.95 inches and every track was built to
 * that.
 *
 * That is a quarter inch under RaceGOW's own maximum and it made this the
 * one place in the project where a RaceGOW gate was not 28 inches. The
 * builder's default opening is 28, its preset is 28, scene.js builds a room
 * around 28 and src/game/track.js scales the aircraft against 28. A pilot
 * who flew a shipped track and then built one got two different gates.
 *
 * So the unit is now derived from the gate: one clear opening plus one pipe,
 * which is exactly the centre to centre distance a 28 inch opening implies.
 * The whole lattice scales with it, which is what the season doc requires,
 * "you must scale the entire track up equally based on your gate size", and
 * every distance in the specs below is in units so nothing else moves.
 *
 * What it costs: 29.05 inches between adjacent gate centres rather than 27.
 * Rule 3 wants 27 to 33, so the old spacing sat exactly on the minimum and
 * the new one sits in the middle of the range. What it buys, besides the
 * gate: a two high stack's second centre lands at 43.05 inches, where rule 5
 * asks for 42 or more, and at 27 inch units it landed at 39.98 and did not.
 */
export const UNIT = GATE_OPENING_MAX + PIPE_OD;

/*
 * THE TRACKS.
 *
 * Coordinates are lattice units. x runs along the track's long axis, y
 * across it, z up. `origin` is where lattice (0, 0) stands in the room, in
 * inches from the room's near left corner, chosen to put the track in the
 * middle of the 10 by 12 m field.
 *
 * A square's `axis` is the axis its opening faces: x and y stand up, z lies
 * flat. `at` is the centre of the square in plan and `sill` the height of
 * its bottom pipe, both in units. A pole's `at` is the lattice line it
 * stands on and `side` the way its pass panel faces; `beside` names the
 * square whose centre RaceGOW's 14 inch rule is measured from. A rail is a
 * bare pipe between two lattice points that no square accounts for.
 *
 * A waypoint pins the line through a point, at a height, headed the way its
 * `heading` points, and scores nothing and is drawn nowhere. They stand
 * where the animation's line does something a cubic between two openings
 * would not do on its own: the apex of a loop beyond a pole, the top of a
 * climb over the tower, the run down the back of the far side, the swing
 * outside the start gate's leg before the lap closes through it.
 */
export const TRACKS = [
  {
    id: 'racegow5-track8',
    name: 'RaceGOW5 Track 8',
    credit: {
      designer: 'AyyyKayyy',
      series: 'RaceGOW5',
      sponsor: 'weBLEEDfpv',
      source: 'racegow.com/tracks, the official Track 8 animation',
      broughtOverBy: 'andAgainFPV',
    },
    origin: [156, 236],
    /*
     * Read off the RaceGOW5 Track 8 animation, 288 frames, every frame.
     * The structure is a 3 by 2 unit lattice: a start gate with an opening
     * over it at x 0, a rail down y 0 with an opening over and under it at
     * x 1 to 2, a table at x 2 to 3 whose top is a dive gate, two columns
     * of two openings along its far side, and a three high tower at x 3
     * carrying the tall pole. The lap is 29 passes.
     *
     * SIX OF THOSE OPENINGS ARE GAPS AND NOT GATES, marked `unbuilt`:
     * F over the start gate, C at the top of the tower, I and H along the
     * far side, and K and J under and over the rail. Every one of them was
     * built as a four sided square, and every one of those squares put
     * pipe in the air that the reference does not have: a top bar over
     * nothing, an upright boxing in a pole, two legs under a rail that is
     * carried by the structures at its ends. Each one was checked by
     * projecting the pipe this file builds on to the reference plate, and
     * what is left now lands on white PVC. See TRACK-FROM-GIF.md step 8b.
     */
    squares: {
      A: { name: 'Start gate', axis: 'x', at: [0, -0.5], sill: 0 },
      F: { name: 'Over the start gate', axis: 'x', at: [0, -0.5], sill: 1, unbuilt: true },
      N: { name: 'Tower, bottom', axis: 'x', at: [3, 0.5], sill: 0 },
      E: { name: 'Tower, middle', axis: 'x', at: [3, 0.5], sill: 1 },
      C: { name: 'Tower, top', axis: 'x', at: [3, 0.5], sill: 2, unbuilt: true },
      L: { name: 'Far side, left, low', axis: 'y', at: [1.5, 1], sill: 0 },
      I: { name: 'Far side, left, up', axis: 'y', at: [1.5, 1], sill: 1, unbuilt: true },
      M: { name: 'Far side, right, low', axis: 'y', at: [2.5, 1], sill: 0 },
      H: { name: 'Far side, right, up', axis: 'y', at: [2.5, 1], sill: 1, unbuilt: true },
      K: { name: 'Under the rail', axis: 'y', at: [1.5, 0], sill: 0, unbuilt: true },
      J: { name: 'Over the rail', axis: 'y', at: [1.5, 0], sill: 1, unbuilt: true },
      P: { name: 'Table top', axis: 'z', at: [2.5, 0.5], sill: 1 },
    },
    poles: {
      T: { name: 'Tall pole', at: [3, 0], height: 3, side: [0, -1], beside: 'N' },
      W: { name: 'Left pole', at: [0, 0], height: 2, side: [0, 1], beside: 'A' },
    },
    posts: [
      { name: 'Far side post', at: [2, 1], height: 2 },
    ],
    rails: [
      { name: 'Rail, x 0 to 1', from: [0, 0, 1], to: [1, 0, 1] },
      { name: 'Rail, x 1 to 2', from: [1, 0, 1], to: [2, 0, 1] },
    ],
    waypoints: {
      O: { name: 'Over the tower', at: [3.4, 0.5], z: 3.4, heading: [-1, 0] },
      Q: { name: 'Round the pole, low', at: [3.6, 0], z: 0.7, heading: [0, -1] },
      R: { name: 'Home straight', at: [1.5, -0.5], z: 1.5, heading: [-1, 0] },
      S: { name: 'Round the pole, mid', at: [3.6, 0.5], z: 1.3, heading: [0, 1] },
      V: { name: 'Behind the far side', at: [2.5, 1.5], z: 1.7, heading: [-1, 0] },
      X: { name: 'Outside the start gate', at: [-0.5, -1.3], z: 0.5, heading: [0, 1] },
    },
    start: { at: [-0.8, -0.5], yaw: 0 },
    lap: 'A+ T C- T E- F- W H+ I- J- K+ L+ M- T S V I- E+ T C+ O N+ Q R W F+ J+ K- T E- C+ T P- K- X',
  },
  {
    id: 'racegow5-track5',
    name: 'RaceGOW5 Track 5',
    credit: {
      designer: 'Cumber and Hotspur',
      series: 'RaceGOW5',
      sponsor: "Neo's UV Creations",
      source: 'racegow.com/tracks, the official Track 5 animation',
      broughtOverBy: 'andAgainFPV',
    },
    origin: [156, 236],
    /*
     * Read off the RaceGOW5 Track 5 animation, 192 frames, every frame.
     * A 3 by 2 unit lattice again: a long rail down y 0 with an opening
     * under and over its first unit, a frame at x 2 with an opening in it,
     * one under it and one over it, the tall pole on the frame's far post,
     * a bar on to x 3 with an opening under it, and at each end of the
     * rail a bar across to a second pole with an opening under it and one
     * over it. The lap is 20 passes.
     *
     * FIVE OF THOSE OPENINGS ARE GAPS AND NOT GATES, marked `unbuilt`:
     * C over the start gate, E at the top of the frame, L over the near
     * gate, and J and K under and over the rail's first unit. Same reason
     * as Track 8's, and checked the same way.
     */
    squares: {
      A: { name: 'Start gate', axis: 'x', at: [3, -0.5], sill: 0 },
      C: { name: 'Over the start gate', axis: 'x', at: [3, -0.5], sill: 1, unbuilt: true },
      H: { name: 'Frame, bottom', axis: 'x', at: [2, 0.5], sill: 0 },
      F: { name: 'Frame, middle', axis: 'x', at: [2, 0.5], sill: 1 },
      E: { name: 'Frame, top', axis: 'x', at: [2, 0.5], sill: 2, unbuilt: true },
      I: { name: 'Under the bar', axis: 'y', at: [2.5, 0], sill: 0 },
      J: { name: 'Under the rail', axis: 'y', at: [0.5, 0], sill: 0, unbuilt: true },
      K: { name: 'Over the rail', axis: 'y', at: [0.5, 0], sill: 1, unbuilt: true },
      N: { name: 'Near gate', axis: 'x', at: [0, -0.5], sill: 0 },
      L: { name: 'Over the near gate', axis: 'x', at: [0, -0.5], sill: 1, unbuilt: true },
    },
    poles: {
      B: { name: 'Right pole', at: [3, -1], height: 2, side: [0, -1], beside: 'A' },
      D: { name: 'Tall pole', at: [2, 1], height: 3, side: [0, 1], beside: 'F' },
      M: { name: 'Near pole', at: [0, -1], height: 2, side: [0, -1], beside: 'N' },
    },
    posts: [
      { name: 'Near post', at: [0, 0], height: 2 },
    ],
    rails: [
      { name: 'Rail, x 0 to 1', from: [0, 0, 1], to: [1, 0, 1] },
      { name: 'Rail, x 1 to 2', from: [1, 0, 1], to: [2, 0, 1] },
    ],
    waypoints: {
      Q: { name: 'Back past the frame', at: [1.3, 2.0], z: 0.8, heading: [1, 0] },
      R: { name: 'Round the tall pole', at: [2.7, 1.6], z: 1.2, heading: [-1, 0] },
      O: { name: 'Round the tall pole again', at: [1.6, 2.2], z: 0.9, heading: [1, 0] },
      V: { name: 'Back over the rail', at: [1.3, 0.3], z: 1.6, heading: [0, -1] },
      S: { name: 'Round the right pole', at: [3.6, -1.6], z: 2.4, heading: [0, -1] },
      U: { name: 'Round the near gate', at: [-0.5, 0.5], z: 1.2, heading: [0, 1] },
      T: { name: 'Round the right pole, low', at: [3.3, -2.1], z: 1.1, heading: [1, 0] },
      W: { name: 'Round the left pole', at: [-0.6, 0.2], z: 1.6, heading: [0, 1] },
    },
    start: { at: [2, -0.5], yaw: 0 },
    lap: 'A+ B T C- D E+ F- D H- Q R D O I- J+ K- J+ V L- W D S B L- M N- U K-',
  },
  {
    id: 'racegow5-track1',
    name: 'RaceGOW5 Track 1',
    credit: {
      designer: 'Skittles',
      series: 'RaceGOW5',
      sponsor: 'EMAX',
      source: 'racegow.com/tracks, the official Track 1 animation',
      broughtOverBy: 'andAgainFPV',
    },
    origin: [197, 209],
    /*
     * Read off the RaceGOW5 Track 1 animation, 96 frames, every frame. The
     * shortest of the three built so far: a 2 by 2 unit lattice carrying
     * three frames and one pole, and a six pass lap.
     *
     * EVERY FRAME HERE IS A GOALPOST. Two uprights and a top bar, with no
     * bar along the ground: the plate shows bare floor between the feet of
     * all three. The game draws one that way already, because it puts no
     * member under an opening whose sill is the floor; the GIF exporter
     * draws the bar RaceGOW's rule 2 asks for, so an export carries one
     * pipe the reference does not, lying on the floor under an opening
     * whose clear height is unchanged.
     *
     * The ground bars that ARE there join the structures to each other
     * rather than closing any gate, so they are rails.
     *
     * D IS A GAP, NOT A GATE. The opening over the left bar has that bar
     * below it and the pole beside it and nothing else: no top bar, no
     * second upright. It was built as a square, which put two lengths of
     * PVC in mid air and boxed in the pole, so it is marked `unbuilt` and
     * the structures around it draw the pipe that is really there. See
     * isUnbuilt in src/trackbuilder/elements.js.
     */
    squares: {
      A: { name: 'Start gate', axis: 'x', at: [-1, 1.5], sill: 0 },
      B: { name: 'Right frame, under the bar', axis: 'x', at: [1, 0.5], sill: 0 },
      C: { name: 'Right frame, over the bar', axis: 'x', at: [1, 0.5], sill: 1 },
      F: { name: 'Left gate', axis: 'y', at: [-0.5, 0], sill: 0 },
      D: { name: 'Over the left gate', axis: 'y', at: [-0.5, 0], sill: 1, unbuilt: true },
    },
    poles: {
      P: { name: 'Pole', at: [0, 0], height: 2, side: [1, 0], beside: 'F' },
    },
    rails: [
      { name: 'Ground bar, pole to right frame', from: [0, 0, 0], to: [1, 0, 0] },
      { name: 'Ground bar, left gate to start gate', from: [-1, 0, 0], to: [-1, 1, 0] },
    ],
    waypoints: {
      R: { name: 'Out past the right frame', at: [1.9, 0.5], z: 0.7, heading: [1, 0] },
      S: { name: 'Back to the top opening', at: [1.9, 0.5], z: 1.4, heading: [-1, 0] },
      T: { name: 'Behind the frames', at: [0.4, -1.1], z: 1.7, heading: [-1, 0] },
      Z: { name: 'Down to the gap', at: [0.8, 1.4], z: 0.8, heading: [0, -1] },
      V: { name: 'Behind the pole', at: [0.0, -0.9], z: 0.55, heading: [-1, 0] },
      W: { name: 'Out past the start gate', at: [-1.9, 0.4], z: 0.55, heading: [-1, 0] },
      Y: { name: 'Round the far end', at: [-2.7, 1.0], z: 0.5, heading: [0, 1] },
      X: { name: 'Back on to the start gate', at: [-2.2, 1.6], z: 0.5, heading: [1, 0] },
    },
    start: { at: [-1.6, 1.5], yaw: 0 },
    lap: 'A+ B+ R S C- T D+ Z P V F+ W Y X',
  },
  {
    id: 'racegow5-track2',
    name: 'RaceGOW5 Track 2',
    credit: {
      designer: 'Skittles',
      series: 'RaceGOW5',
      source: 'racegow.com/tracks, the official Track 2 animation',
      broughtOverBy: 'andAgainFPV',
    },
    origin: [152, 251],
    /*
     * Read off the RaceGOW5 Track 2 animation, 120 frames, every frame. A
     * 3 by 1 unit lattice carrying three structures in a line along x, and
     * an eight pass lap that scores every opening once and repeats none.
     *
     * At x 0 a goalpost across y, seen almost exactly edge on, which is the
     * start gate. A ground bar runs from its far foot to x 1, where a
     * second goalpost stands along x with its right leg carried up to two
     * units. A second ground bar runs on to x 3, where the frame stands
     * across y: two rungs, at one unit and at two, the far leg carried up
     * to three units as the tall pole, and the top rung carried out one
     * unit past the near leg as an overhang.
     *
     * THE CAMERA. Twelve fittings, 6.4 px rms reprojection. The integrality
     * check that settles it is step 4b's: six feet unproject on to the
     * floor within 0.08 of a whole unit and nine fitting heights within
     * 0.05, so the lattice is not a fit, it is a count.
     *
     * THREE OF THE EIGHT OPENINGS ARE GAPS AND NOT GATES, marked
     * `unbuilt`: D over the frame's top rung, E under the overhang, and G
     * over the middle goalpost's bar. Each has a bar on one side and a
     * carried up leg on the other and nothing else, so building any of
     * them as a four sided square would put pipe in the air the reference
     * does not have. Checked by projecting every pipe this file builds
     * back on to the plate: all thirteen land on white PVC at full length,
     * and the twelve members the reading denies come back dark. See
     * TRACK-FROM-GIF.md step 8b.
     *
     * TWO PANELS ARE DRAWN WIDER THAN ONE SQUARE and one taller. D is lit
     * across the whole two unit top rung, E and F across their whole two
     * unit bays. The line is the only evidence for which square is the
     * gate, so the flown path was reconstructed in three dimensions: every
     * frame's trail head gives a ray, the eight passes give anchors on
     * their own planes, and a constant pace prior fixes the depth. E is
     * crossed at 1.46 units up, so it is the upper square. D is crossed at
     * y 0.08, which is on the lattice line itself; it is built on the pole
     * side because that is the side with a bar below it and a pole beside
     * it, and because the other choice would put D and E on one line and
     * make the dive between them the needle step 9 warns about.
     *
     * F IS THE TALL POLE'S OWN PANEL and not a gap. It is the only pane
     * with a pole on one side and nothing on any other, which is the pole
     * rule drawn: past this, on this side, at any height. The pole marker's
     * scoring square lands at y 1.46 and 1.5 units up against a measured
     * crossing of y 1.66 and 1.47, which is the check that it is read
     * right.
     */
    squares: {
      A: { name: 'Start gate', axis: 'x', at: [0, -0.5], sill: 0 },
      H: { name: 'Under the middle bar', axis: 'y', at: [1.5, 0], sill: 0 },
      G: { name: 'Over the middle bar', axis: 'y', at: [1.5, 0], sill: 1, unbuilt: true },
      B: { name: 'Frame, bottom', axis: 'x', at: [3, -0.5], sill: 0 },
      C: { name: 'Frame, middle', axis: 'x', at: [3, -0.5], sill: 1 },
      D: { name: 'Over the top rung', axis: 'x', at: [3, -0.5], sill: 2, unbuilt: true },
      E: { name: 'Under the overhang', axis: 'x', at: [3, 0.5], sill: 1, unbuilt: true },
    },
    poles: {
      F: { name: 'Tall pole', at: [3, -1], height: 3, side: [0, -1], beside: 'B' },
    },
    posts: [
      { name: 'Middle post', at: [2, 0], height: 2 },
    ],
    rails: [
      { name: 'Ground bar, start gate to the middle', from: [0, 0, 0], to: [1, 0, 0] },
      { name: 'Ground bar, the middle to the frame', from: [2, 0, 0], to: [3, 0, 0] },
    ],
    waypoints: {
      J: { name: 'Out past the frame', at: [3.4, -0.4], z: 0.5, heading: [1, 0] },
      K: { name: 'Back to the middle opening', at: [3.45, -0.65], z: 1.3, heading: [-1, 0] },
      L: { name: 'Round behind the frame', at: [1.95, -1.15], z: 1.9, heading: [0, -1] },
      M: { name: 'Back along the far side', at: [2.6, -1.75], z: 2.25, heading: [1, 0] },
      N: { name: 'Round the top of the pole', at: [3.65, -1.1], z: 2.6, heading: [0, 1] },
      O: { name: 'Down off the top rung', at: [2.15, 0.45], z: 1.9, heading: [0, 1] },
      Q: { name: 'Round the outside', at: [3.88, -0.5], z: 1.42, heading: [0, -1] },
      R: { name: 'Back across the middle', at: [1.85, -1.4], z: 1.5, heading: [-0.4, 1] },
      S: { name: 'Down in front', at: [1.35, 0.55], z: 1.4, heading: [0, 1] },
      T: { name: 'Back up to the low gate', at: [1.55, 0.45], z: 0.75, heading: [0, -1] },
      U: { name: 'Out to the far side', at: [0.9, -1.3], z: 0.3, heading: [-1, -0.6] },
      V: { name: 'Round the far end', at: [0.1, -1.76], z: 0.4, heading: [-1, 0] },
      W: { name: 'Back on to the start gate', at: [-0.75, -1.1], z: 0.6, heading: [0, 1] },
      X: { name: 'Line up', at: [-0.5, -0.72], z: 0.53, heading: [1, 0] },
    },
    start: { at: [-0.8, -0.5], yaw: 0 },
    lap: 'A+ B+ J K C- L M N D- O E+ Q F R G+ S T H- U V W X',
  },
];

/*
 * A lattice point in the room, in metres.
 *
 * The unit is UNIT and not a second copy of 27: this held the literal while
 * the frames were sized from UNIT, so the two would have come apart the
 * moment either moved, which is exactly what changing the gate size does.
 * The origin is still inches from the room's near left corner.
 */
function place(track, x, y) {
  return {
    x: track.origin[0] * IN + x * UNIT,
    y: track.origin[1] * IN + y * UNIT,
  };
}

function buildTrack(spec) {
  const doc = createTrack(spec.name, 'micro');
  doc.id = spec.id;
  doc.createdUtc = '2026-09-11T00:00:00Z';
  doc.modifiedUtc = '2026-09-11T00:00:00Z';
  doc.credit = { ...spec.credit };

  const ids = {};
  const clear = UNIT - PIPE_OD;

  const pads = createElement(doc, 'startPads', place(spec, ...spec.start.at), spec.start.yaw);
  pads.yawOverridden = true;
  doc.elements.push(pads);

  for (const [key, sq] of Object.entries(spec.squares)) {
    const type = sq.axis === 'z' ? 'diveGate' : 'gate';
    const yaw = sq.axis === 'y' ? Math.PI / 2 : 0;
    const el = createElement(doc, type, place(spec, ...sq.at), yaw);
    el.name = sq.name;
    el.yawOverridden = true;
    el.dims.levels = 1;
    el.dims.clearW = clear;
    el.dims.clearH = clear;
    el.dims.levelPitch = UNIT;
    /*
     * A flat square's plane is its sill plus half its height, because the
     * model puts every opening's centre there whatever its pitch. So the
     * sill of a table top is set back by half an opening and the plane
     * lands on the lattice line, where the pipe is.
     */
    el.dims.sillH = sq.axis === 'z' ? sq.sill * UNIT - clear / 2 : sq.sill * UNIT;
    /*
     * A GAP IN THE LATTICE, NOT A GATE. The opening over a bar has the bar
     * below it and a pole beside it and nothing else: see the comment on
     * the squares above, and isUnbuilt in src/trackbuilder/elements.js.
     */
    if (sq.unbuilt) {
      el.unbuilt = true;
    }
    doc.elements.push(el);
    ids[key] = el.id;
  }

  for (const [key, pole] of Object.entries(spec.poles)) {
    const beside = spec.squares[pole.beside];
    const centre = place(spec, ...beside.at);
    const len = Math.hypot(pole.side[0], pole.side[1]) || 1;
    const dir = { x: pole.side[0] / len, y: pole.side[1] / len };
    /* On the gate's own stile line, RaceGOW's 14 inches from its centre. */
    const at = {
      x: centre.x + dir.x * POLE_FROM_GATE_MIN,
      y: centre.y + dir.y * POLE_FROM_GATE_MIN,
    };
    const el = createElement(doc, 'pole', at, Math.atan2(dir.y, dir.x));
    el.name = pole.name;
    el.yawOverridden = true;
    el.dims.height = pole.height * UNIT;
    doc.elements.push(el);
    ids[key] = el.id;
  }

  /*
   * A BARE UPRIGHT THAT THE LAP DOES NOT SCORE.
   *
   * Where a structure's leg is carried up past its bar, the pipe above the
   * bar is a pole standing on the lattice line. Some of them are flown
   * around and are in `poles`, with RaceGOW's 14 inch offset from the gate
   * they belong to; these are the ones the lap only flies past, so they
   * stand exactly on their node and take no sequence entry. The builder
   * says so when the preset is opened, which is true: the line does ignore
   * them. They are still what holds up the openings marked `unbuilt`.
   */
  for (const post of spec.posts || []) {
    const el = createElement(doc, 'pole', place(spec, ...post.at), 0);
    el.name = post.name;
    el.yawOverridden = true;
    el.dims.height = post.height * UNIT;
    doc.elements.push(el);
  }

  for (const [key, wp] of Object.entries(spec.waypoints || {})) {
    const el = createElement(doc, 'waypoint', place(spec, ...wp.at),
      Math.atan2(wp.heading[1], wp.heading[0]));
    el.name = wp.name;
    el.yawOverridden = true;
    el.position.z = wp.z * UNIT;
    doc.elements.push(el);
    ids[key] = el.id;
  }

  for (const rail of spec.rails) {
    const a = place(spec, rail.from[0], rail.from[1]);
    const b = place(spec, rail.to[0], rail.to[1]);
    const el = createElement(doc, 'horizontalPole',
      { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, Math.atan2(b.y - a.y, b.x - a.x));
    el.name = rail.name;
    el.yawOverridden = true;
    el.dims.width = Math.hypot(b.x - a.x, b.y - a.y);
    /* The pipe's centreline on the lattice line: the bar is drawn from
     * position.z up by its own thickness. */
    /* The pipe's centreline on the lattice line, and never below the floor:
     * a ground bar's line IS the floor, so it rests on it instead of being
     * half buried in it. */
    el.position.z = Math.max(0, rail.from[2] * UNIT - PIPE_OD / 2);
    doc.elements.push(el);
  }

  for (const token of spec.lap.split(/\s+/)) {
    const key = token.replace(/[+-]$/, '');
    const sign = token.endsWith('-') ? -1 : 1;
    if (!ids[key]) {
      throw new Error(`${spec.id}: lap names ${key}, which is not a square or a pole`);
    }
    const entry = createSequenceEntry(doc, ids[key], 0);
    if (spec.squares[key]) {
      entry.entry = sign;
    }
    /* Hand set, every one: the auto face pass leaves an overridden entry
     * alone, and a lap read off the official animation is not a guess for
     * the tool to improve on. */
    entry.overridden = true;
    doc.sequence.push(entry);
  }

  const { doc: clean, repairs } = normalize(toPlain(doc));
  if (repairs.length) {
    throw new Error(`${spec.id} needed repair: ${repairs.join('; ')}`);
  }
  return toPlain(clean);
}

const HEADER = `/*
 * presets.js: the tracks that ship with the builder, and nothing else.
 *
 * GENERATED by scripts/racegow-lattice.js from the lattice specs in that
 * file. Edit the spec and run the script; do not edit this file by hand.
 *
 * Copyright (C) 2026 WebFPVSimulator contributors
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

/*
 * THE RaceGOW5 SET, read off the official animations.
 *
 * RaceGOW is a home whoop time trial series: everybody builds the same track
 * out of the same 3/4 inch pipe kit in their own living room and flies it
 * against the same leaderboard. Each track is published as an animation of
 * one lap, gate by gate, and those animations are what these tracks are
 * built from, every frame of them.
 *
 * They can be built exactly because the kit is a lattice. Every fitting is
 * a right angle, so every gate is a square standing square to one of two
 * axes or lying flat, and every distance is a whole number of gate units.
 * Reading a track is counting which unit squares the animation lights, in
 * what order, flown which way. The count for each track is in
 * scripts/racegow-lattice.js, and this file is what that script writes. A
 * track that is not in that script is not here, which is why the set is the
 * size it is: the earlier six were reconstructions from a single render,
 * close in shape and wrong in detail, and the owner replaced them.
 *
 * EVERY GATE IS 28 INCHES, which is RaceGOW's maximum and the size the rest
 * of this project is built around: the builder's only micro preset, the room
 * scene.js builds, and the scale src/game/track.js measures the aircraft
 * against. The unit is therefore 28 inches plus one pipe, 29.05, which is
 * what two gates sharing a pipe are apart centre to centre. These tracks
 * were generated on a 27 inch unit once, which left a 25.95 inch opening and
 * a two high stack an inch under rule 5's minimum.
 *
 * A pole is a marker whose pass panel is the animation's own: full height,
 * one side. It stands at RaceGOW's 14 inches from the gate centre, half an
 * inch inboard of the stile. The start gate is the first pass of the lap and
 * the lap closes on it.
 *
 * CREDIT GOES TO THE DESIGNER, one per track, as the site names them.
 */
`;

const FOOTER = `
/* Every preset that belongs to a track class, newest first is meaningless
 * here so they stay in the order the series numbers them. */
export function presetsForClass(cls) {
  return PRESETS.filter((d) => d.trackClass === cls);
}

/* The document for a preset id, or null. Returned as a deep copy, because
 * the caller edits what it is given and a shared module constant that the
 * builder mutates would change under every other reader. */
export function presetById(id) {
  const found = PRESETS.find((d) => d.id === id);
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

/* Whether an id names a preset. storage.js uses it to keep a preset out of
 * the delete path and to know that a save is making a copy. */
export function isPresetId(id) {
  return PRESETS.some((d) => d.id === id);
}
`;

export function buildAll() {
  return TRACKS.map(buildTrack);
}

/* The exact text of presets.js for a given set of documents. Exported so a
 * check can build it and compare, which is how micro-check proves that the
 * shipped file is this script's output and holds nothing else. */
export function renderPresets(docs) {
  const body = docs
    .map((d) => JSON.stringify(d, null, 2).split('\n').map((line) => `  ${line}`).join('\n'))
    .join(',\n');
  return `${HEADER}export const PRESETS = [\n${body},\n];\n${FOOTER}`;
}

export const PRESETS_PATH = join(root, 'src/trackbuilder/presets.js');

/* Only when run as a script. Importing this file must not write to the
 * source tree: micro-check imports it to compare, and a check that
 * rewrites the thing it is checking proves nothing. */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const docs = buildAll();
  writeFileSync(PRESETS_PATH, renderPresets(docs));
  for (const d of docs) {
    console.log(`${d.id}: ${d.elements.length} elements, ${d.sequence.length} passes`);
  }
  console.log(`wrote ${PRESETS_PATH}`);
}
