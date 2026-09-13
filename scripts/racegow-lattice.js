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
      O: { name: 'Over the tower', at: [3.02, 0.83], z: 3.4, heading: [-1, 0] },
      Q: { name: 'Round the pole, low', at: [3.99, 0.27], z: 0.27, heading: [0, -1] },
      R: { name: 'Home straight', at: [1.01, -0.88], z: 1.5, heading: [-1, 0] },
      S: { name: 'Round the pole, mid', at: [3.93, -0.05], z: 1.95, heading: [0, 1] },
      V: { name: 'Behind the far side', at: [2.23, 1.61], z: 1.27, heading: [-1, 0] },
      X: { name: 'Outside the start gate', at: [-0.34, -0.82], z: 0.28, heading: [0, 1] },
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
      Q: { name: 'Back past the frame', at: [2.1, 2.22], z: 0.67, heading: [1, 0] },
      R: { name: 'Round the tall pole', at: [2.49, 1.38], z: 0.99, heading: [-1, 0] },
      O: { name: 'Round the tall pole again', at: [1.79, 2.2], z: 1.23, heading: [1, 0] },
      V: { name: 'Back over the rail', at: [1.24, 1.01], z: 1.44, heading: [0, -1] },
      S: { name: 'Round the right pole', at: [3.82, -1.27], z: 1.53, heading: [0, -1] },
      U: { name: 'Round the near gate', at: [-0.93, -0.31], z: 0.77, heading: [0, 1] },
      T: { name: 'Round the right pole, low', at: [3.07, -1.88], z: 1.53, heading: [1, 0] },
      W: { name: 'Round the left pole', at: [-0.66, -0.4], z: 1.6, heading: [0, 1] },
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
    origin: [197, 267],
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
     * IT WAS READ MIRRORED THE FIRST TIME AND THIS IS THE REPAIR. The
     * camera fitted to the first reading could only photograph this lattice
     * from behind itself, which is what a mirrored track looks like from
     * inside the arithmetic: the residual is small, the integrality is
     * exact, every pane matches, and the track is its own reflection. Every
     * y is negated here now, in the squares, the rails, the waypoints and
     * their headings, the start, and the sign of travel through the two
     * openings whose axis is y. The origin moves with it so the track
     * stands where it stood in the room. See step 4c in TRACK-FROM-GIF.md,
     * which had the wrong test in it until this was found.
     *
     * D IS A GAP, NOT A GATE. The opening over the left bar has that bar
     * below it and the pole beside it and nothing else: no top bar, no
     * second upright. It was built as a square, which put two lengths of
     * PVC in mid air and boxed in the pole, so it is marked `unbuilt` and
     * the structures around it draw the pipe that is really there. See
     * isUnbuilt in src/trackbuilder/elements.js.
     */
    squares: {
      A: { name: 'Start gate', axis: 'x', at: [-1, -1.5], sill: 0 },
      B: { name: 'Right frame, under the bar', axis: 'x', at: [1, -0.5], sill: 0 },
      C: { name: 'Right frame, over the bar', axis: 'x', at: [1, -0.5], sill: 1 },
      F: { name: 'Left gate', axis: 'y', at: [-0.5, 0], sill: 0 },
      D: { name: 'Over the left gate', axis: 'y', at: [-0.5, 0], sill: 1, unbuilt: true },
    },
    poles: {
      P: { name: 'Pole', at: [0, 0], height: 2, side: [1, 0], beside: 'F' },
    },
    rails: [
      { name: 'Ground bar, pole to right frame', from: [0, 0, 0], to: [1, 0, 0] },
      { name: 'Ground bar, left gate to start gate', from: [-1, 0, 0], to: [-1, -1, 0] },
    ],
    waypoints: {
      R: { name: 'Out past the right frame', at: [1.52, -1.1], z: 0.42, heading: [1, 0] },
      S: { name: 'Back to the top opening', at: [1.48, -1.59], z: 1.4, heading: [-1, 0] },
      T: { name: 'Behind the frames', at: [-0.25, 0.34], z: 1.38, heading: [-1, 0] },
      Z: { name: 'Down to the gap', at: [0.8, -1.29], z: 0.36, heading: [0, 1] },
      V: { name: 'Behind the pole', at: [-0.27, 0.25], z: 1.53, heading: [-1, 0] },
      W: { name: 'Out past the start gate', at: [-2.01, -0.02], z: 0.71, heading: [-1, 0] },
      Y: { name: 'Round the far end', at: [-2.21, -0.78], z: 0.39, heading: [0, -1] },
      X: { name: 'Back on to the start gate', at: [-1.66, -1.32], z: 0.34, heading: [1, 0] },
    },
    start: { at: [-1.6, -1.5], yaw: 0 },
    lap: 'A+ B+ R S C- T D- Z P V F- W Y X',
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
  {
    id: 'racegow5-track3',
    name: 'RaceGOW5 Track 3',
    credit: {
      designer: 'the Lego Dans',
      series: 'RaceGOW5',
      source: 'racegow.com/tracks, the official Track 3 animation',
      broughtOverBy: 'andAgainFPV',
    },
    origin: [240, 261],
    /*
     * Read off the RaceGOW5 Track 3 animation, 168 frames, every frame. The
     * biggest of the four: a 3 by 2 unit lattice, fifteen passes over twelve
     * openings, and a lap of 38.7 units.
     *
     * Three structures. A goalpost across x at y 0, one unit wide and one
     * high, joined by a ground bar to the tower at x 0. The tower is a frame
     * across y: a leg at y -1 two units high, a leg at y -2 one unit high,
     * a rung at one unit running the whole two units, a rung at two units
     * over the near bay only, and the near leg carried up to three units as
     * the tall pole. From the tower's far foot a long rail runs three units
     * back along x at one unit up, on a leg at every node.
     *
     * THE CAMERA. Fifteen fittings, 4.7 px rms. Step 4b's integrality is
     * what settles it: eight feet unproject on to the floor within 0.09 of
     * a whole unit and eleven fitting heights within 0.05. The twelfth, the
     * tall pole's tip at 2.925, is the end cap of a pipe and is three.
     *
     * STEP 4c PAID FOR ITSELF ON ITS FIRST USE. The first fit came back left
     * handed, which is the mirror trap Track 2 found at step 10 after the
     * whole spec was written. Here it was one line and one minute: the y
     * axis was negated before anything was written down.
     *
     * FOUR OF THE TWELVE OPENINGS ARE GAPS AND NOT GATES, marked `unbuilt`:
     * C and K over the long rail, L round its far end, and G over the
     * tower's far shoulder. None of them has a frame of its own in the
     * reference and building one would put pipe in the air the picture does
     * not have.
     *
     * THREE PANELS ARE DRAWN WIDER THAN ONE SQUARE. K is lit across the
     * whole three unit rail, C across the same face and one unit past its
     * end, and G across the tower's whole upper face. The line is the only
     * evidence for which square is the gate, so it was reconstructed in
     * three dimensions: every frame's trail head gives a ray, the twelve
     * unambiguous passes give anchors on their own planes, and a constant
     * pace prior fixes the depth. The pass frames were then iterated against
     * the reconstruction until each one sat on its own plane, which moved
     * two of them by a frame or two and left the rest alone.
     *
     * That reading says C is crossed over the rail's middle bay, K over its
     * right bay, and G over the tower's far shoulder. It also says the big
     * panel is flown TWICE, and the second crossing is one unit past the end
     * of the rail at floor level, which is L: the quad goes round the end
     * rather than through it, and the illustrator lit the whole plane
     * because that is what the rule allows.
     */
    squares: {
      A: { name: 'Goalpost', axis: 'y', at: [-1.5, 0], sill: 0 },
      I: { name: 'Tower, near bay, low', axis: 'x', at: [0, -0.5], sill: 0 },
      H: { name: 'Tower, near bay, mid', axis: 'x', at: [0, -0.5], sill: 1 },
      E: { name: 'Tower, far bay, low', axis: 'x', at: [0, -1.5], sill: 0 },
      G: { name: 'Over the tower shoulder', axis: 'x', at: [0, -1.5], sill: 2, unbuilt: true },
      J: { name: 'Under the rail, right', axis: 'y', at: [-0.5, -2], sill: 0 },
      K: { name: 'Over the rail, right', axis: 'y', at: [-0.5, -2], sill: 1, unbuilt: true },
      B: { name: 'Under the rail, middle', axis: 'y', at: [-1.5, -2], sill: 0 },
      C: { name: 'Over the rail, middle', axis: 'y', at: [-1.5, -2], sill: 1, unbuilt: true },
      D: { name: 'Under the rail, left', axis: 'y', at: [-2.5, -2], sill: 0 },
      L: { name: 'Round the end of the rail', axis: 'y', at: [-3.5, -2], sill: 0, unbuilt: true },
    },
    poles: {
      P: { name: 'Tall pole', at: [0, 0], height: 3, side: [0, 1], beside: 'I' },
    },
    posts: [],
    rails: [
      { name: 'Ground bar, goalpost to the tower', from: [-1, 0, 0], to: [0, 0, 0] },
    ],
    /*
     * Fifteen passes leave the alphabet too short, so a waypoint takes a two
     * character key here rather than steal a letter from an opening. The
     * openings keep the single letters they were read under.
     */
    waypoints: {
      Wa: { name: 'Out over the rail', at: [-1.7, -2.46], z: 1.01, heading: [-1, 0.3] },
      Wb: { name: 'Back across the rail', at: [-2.28, -1.68], z: 1.24, heading: [-1, 0] },
      Wc: { name: 'Round the rail end', at: [-2.83, -2.35], z: 0.52, heading: [-1, 0] },
      Wd: { name: 'Down the long side', at: [-0.8, -1.33], z: 0.43, heading: [1, 0] },
      We: { name: 'Out past the tower', at: [0.79, -0.96], z: 0.8, heading: [0, 1] },
      Wf: { name: 'Up the outside', at: [0.4, 0.41], z: 1.65, heading: [-1, 1] },
      Wg: { name: 'Round behind the tower', at: [-0.55, 0.27], z: 2.48, heading: [0, -1] },
      Wh: { name: 'Across the back', at: [-0.61, -1.05], z: 2.52, heading: [0, -1] },
      Wi: { name: 'Back over the tower', at: [0.35, -1.15], z: 1.85, heading: [0, 1] },
      Wj: { name: 'Round the pole again', at: [-0.66, 0.36], z: 1.62, heading: [0, 1] },
      Wk: { name: 'Down the tower face', at: [0.04, -0.68], z: 1.58, heading: [0, -1] },
      Wt: { name: 'Down the near face', at: [0.46, -1.24], z: 0.64, heading: [0, -1] },
      Wl: { name: 'Down to the low bay', at: [-0.1, -1.5], z: 1.39, heading: [0, -1] },
      Wm: { name: 'Round the near post', at: [-0.44, -0.51], z: 0.27, heading: [0, 1] },
      Wn: { name: 'Round the right end', at: [0.18, -2.66], z: 0.41, heading: [-1, 0] },
      Wo: { name: 'Back down the long side', at: [-1.97, -1.34], z: 0.54, heading: [-1, 0] },
      Wp: { name: 'Round the left end', at: [-1.85, -2.63], z: 1.13, heading: [1, 0] },
      Wq: { name: 'Home along the top', at: [-0.96, -1.77], z: 1.53, heading: [0, 1] },
      Wr: { name: 'Past the goalpost', at: [-0.74, -0.26], z: 1.48, heading: [0, 1] },
      Ws: { name: 'Round on to the goalpost', at: [-1.28, 0.52], z: 0.79, heading: [-1, -0.3] },
    },
    start: { at: [-1.5, 0.8], yaw: -Math.PI / 2 },
    lap: 'A- B- Wa C+ Wb D- Wc L+ Wd E+ We Wf P Wg Wh G+ Wi H- Wj P Wk Wt Wl E+ Wm I+ Wn J+ Wo D- Wp K+ Wq Wr Ws',
  },
  {
    id: 'racegow5-track4',
    name: 'RaceGOW5 Track 4',
    credit: {
      designer: 'the Lego Dans',
      series: 'RaceGOW5',
      source: 'racegow.com/tracks, the official Track 4 animation',
      broughtOverBy: 'andAgainFPV',
    },
    origin: [182, 222],
    /*
     * Read off the RaceGOW5 Track 4 animation, 168 frames, every frame.
     * Twelve passes over nine openings, and one of them lies flat.
     *
     * THIS IS THE FIRST SHIPPED TRACK WITH A DIVE GATE, which the owner
     * said to look for. At one unit up, the four bars between (0,0), (1,0),
     * (1,1) and (0,1) close a square that is parallel to the floor, and the
     * lap drops through it and later climbs back up through it. In the
     * builder that is `axis: 'z'`, a diveGate, the same element Track 8's
     * table top uses.
     *
     * The structure. A tower of two bays at x -1 to 0 and y 0 to 1, with a
     * ring of bars closing the dive gate at one unit and a second set of
     * bars at two units over two of its sides. The leg at (0,0) is carried
     * up to three units and is the tallest thing here; the leg at (-1,0) is
     * two units and is flown around. From the ring, a rail runs on along x
     * to (2,0) where it turns across y and drops to a gate standing almost
     * exactly edge on to the camera.
     *
     * THE CAMERA, 2.4 px rms over fifteen fittings, the best of the five.
     * Step 4c came back right handed on the first fit, so nothing was
     * mirrored. Step 4b: five feet within 0.06 of a whole unit, four heights
     * within 0.005, and the tall pole's tip at 2.909 because a pipe's end
     * cap is not its end.
     *
     * TWO OF THE NINE OPENINGS ARE GAPS, marked `unbuilt`: H and I, the two
     * over the bars at two units, each with the tall leg beside it and
     * nothing else. D is not a gap but the leg at (-1,0) drawn as the pole
     * rule says: a panel one unit wide and the full two units of its height,
     * on the side the quad passes.
     *
     * WHAT THE RUN SPLITTER GOT WRONG, and it is worth naming because it
     * would have put a thirteenth pass in the lap. The far gate stands edge
     * on, so its lit panel is a 1900 pixel sliver, and the quad's own trail
     * moving across it drops the frame to frame overlap below the threshold
     * for a frame at a time. That reads as two runs and therefore two
     * passes. The area tells the truth: it never moves off 1920 pixels from
     * frame 151 to frame 2, so it is one run and one pass.
     */
    squares: {
      A: { name: 'Far gate', axis: 'x', at: [2, -0.5], sill: 0 },
      C: { name: 'Left frame, under the bar', axis: 'y', at: [-0.5, 0], sill: 0 },
      B: { name: 'Left frame, over the bar', axis: 'y', at: [-0.5, 0], sill: 1 },
      I: { name: 'Over the left bar', axis: 'y', at: [-0.5, 0], sill: 2, unbuilt: true },
      F: { name: 'Near bay', axis: 'x', at: [0, 0.5], sill: 0 },
      H: { name: 'Over the near bar', axis: 'x', at: [0, 0.5], sill: 2, unbuilt: true },
      J: { name: 'Far bay', axis: 'y', at: [0.5, 1], sill: 1 },
      G: { name: 'Dive gate', axis: 'z', at: [0.5, 0.5], sill: 1 },
    },
    poles: {
      D: { name: 'Left pole', at: [-1, 0], height: 2, side: [-1, 0], beside: 'C' },
    },
    posts: [
      { name: 'Tall pole', at: [0, 0], height: 3 },
    ],
    rails: [
      { name: 'Rail on to the far gate', from: [1, 0, 1], to: [2, 0, 1] },
      { name: 'Bar over the near bay', from: [0, 0, 2], to: [0, 1, 2] },
    ],
    /*
     * Twelve passes and nine openings leave the alphabet short, so a
     * waypoint takes a two character key, the same way Track 3 does it.
     */
    waypoints: {
      Wa: { name: 'Down the long side', at: [0.39, -0.52], z: 0.53, heading: [-1, 0] },
      Wb: { name: 'Up to the frame', at: [-0.61, -0.26], z: 1.47, heading: [0, 1] },
      Wc: { name: 'Round the far side', at: [-0.53, 1.19], z: 1.12, heading: [1, 0] },
      Wd: { name: 'Round to the pole', at: [-1.02, -0.81], z: 0.56, heading: [-1, 0] },
      We: { name: 'Back off the pole', at: [-0.82, 0.23], z: 0.91, heading: [1, 0] },
      Wf: { name: 'Out in front', at: [0.01, -0.72], z: 0.29, heading: [1, 0] },
      Wg: { name: 'Round the near end', at: [0.54, 0.3], z: 0.2, heading: [0, 1] },
      Wh: { name: 'Up off the floor', at: [-0.18, 0.28], z: 1.31, heading: [1, 0] },
      Wi: { name: 'Out over the rail', at: [0.6, 0.12], z: 2.34, heading: [0, 1] },
      Wj: { name: 'Back down inside', at: [1.24, 0.85], z: 0.53, heading: [-1, 0] },
      Wk: { name: 'Under the dive gate', at: [0.83, 0.59], z: 0.75, heading: [-1, 0] },
      Wl: { name: 'Round the top, out', at: [-0.09, -0.73], z: 1.75, heading: [1, 0] },
      Wm: { name: 'Round the top, back', at: [0.64, -0.4], z: 2.24, heading: [0, 1] },
      Wn: { name: 'Over the back', at: [0.44, -1], z: 2.3, heading: [1, 0] },
      Wo: { name: 'Down the far side', at: [0.68, -0.6], z: 1.97, heading: [0, 1] },
      Wp: { name: 'Round the far end', at: [1.14, 1.91], z: 1.31, heading: [1, 0] },
      Wq: { name: 'Back along the far side', at: [1.55, 1.53], z: 1.21, heading: [0, -1] },
      Wr: { name: 'On to the dive gate again', at: [0.96, 0.35], z: 1.24, heading: [-1, 0] },
      Ws: { name: 'Down the rail', at: [1.45, 0.53], z: 0.81, heading: [1, 0] },
      Wv: { name: 'Along the rail, out', at: [1.99, 0.93], z: 0.29, heading: [1, 0] },
      Wt: { name: 'Round the near end', at: [2.91, 0.21], z: 0.29, heading: [0, -1] },
      Wu: { name: 'Line up on the far gate', at: [2.59, -0.34], z: 0.35, heading: [-1, 0] },
    },
    start: { at: [2.8, -0.55], yaw: Math.PI },
    lap: 'A- Wa Wb B+ Wc C- Wd D We C- Wf Wg F- Wh Wi Wj Wk G+ B- Wl Wm H- I- Wn Wo J+ Wp Wq Wr G- Ws Wv Wt Wu',
  },
  /*
   * TRACK 6, MrE's, and the first with no sill anywhere on it.
   *
   * Eight feet on a four by three lattice, x 0 to 3 and y 0 to -2, and
   * every bar at one unit or two. Reading it: a gate at the near left, a
   * back gate whose right leg carries on up, a two high frame on x 2 with
   * an opening under its cross bar and one over it, a bar each way from
   * the frame's far corner with an opening under each, and a pole at the
   * end of the right one. Four of the eight uprights are legs carried up
   * to two units, and the animation lights a full height panel beside each
   * of them, so all four are poles. The lap is 20 passes.
   *
   * WHAT IS DIFFERENT ABOUT IT. Not one of its openings has a bottom bar:
   * the five that a built square would add were projected on to the plate
   * and every one of them runs over bare floor. That costs nothing here,
   * because a vertical square at sill 0 draws two stiles and a head and no
   * sill anyway, so six of the seven are built and E, the opening over the
   * right bar, is the only gap: a top bar over it would be pipe in the air.
   *
   * AND THE MIRROR. The first reading of it was mirrored, and step 4c
   * caught it before a line of the spec was written: fitted as read, with
   * every point required to be in front of the camera, the best the
   * solver could do was 30 px with a focal length of three million and an
   * eye thirteen thousand units away, which is not a photograph. With y
   * negated it came back at 7.9 px from an eye 4.2 units up.
   */
  {
    id: 'racegow5-track6',
    name: 'RaceGOW5 Track 6',
    credit: {
      designer: 'MrE',
      series: 'RaceGOW5',
      source: 'racegow.com/tracks, the official Track 6 animation',
      broughtOverBy: 'andAgainFPV',
    },
    origin: [154, 265],
    squares: {
      A: { name: 'Front gate', axis: 'x', at: [0, -1.5], sill: 0 },
      L: { name: 'Back gate', axis: 'y', at: [1.5, 0], sill: 0 },
      B: { name: 'Frame, low', axis: 'x', at: [2, -1.5], sill: 0 },
      D: { name: 'Frame, high', axis: 'x', at: [2, -1.5], sill: 1 },
      I: { name: 'Under the left bar', axis: 'y', at: [1.5, -2], sill: 0 },
      H: { name: 'Under the right bar', axis: 'y', at: [2.5, -2], sill: 0 },
      E: { name: 'Over the right bar', axis: 'y', at: [2.5, -2], sill: 1, unbuilt: true },
    },
    poles: {
      K: { name: 'Back pole', at: [2, 0], height: 2, side: [1, 0], pass: [-1, 0], beside: 'L' },
      C: { name: 'Frame pole', at: [2, -1], height: 2, side: [0, 1], beside: 'B' },
      F: { name: 'Corner pole', at: [2, -2], height: 2, side: [-1, 0], beside: 'H' },
      J: { name: 'Right pole', at: [3, -2], height: 2, side: [1, 0], beside: 'H' },
    },
    rails: [
      { name: 'Ground bar, back pole to the frame', from: [2, 0, 0], to: [2, -1, 0] },
      { name: 'Ground bar, front gate to the left bar', from: [0, -2, 0], to: [1, -2, 0] },
    ],
    waypoints: {
      Wa: { name: 'Round the frame pole', at: [2.52, -0.85], z: 0.63, heading: [-0.17, 0.98] },
      Wb: { name: 'Back across the middle', at: [1.34, -1.84], z: 1.68, heading: [0.93, -0.37] },
      Wc: { name: 'Round the right pole', at: [2.35, -2.62], z: 0.6, heading: [-0.99, -0.17] },
      Wd: { name: 'Low through the middle', at: [1.95, -1.16], z: 0.25, heading: [0.84, -0.54] },
      We: { name: 'Out in front', at: [2.13, -2.71], z: 1.16, heading: [0.98, 0.21] },
      Wf: { name: 'Round the corner pole', at: [2.75, -1.38], z: 0.79, heading: [-0.86, -0.51] },
      Wg: { name: 'Wide in front', at: [1.55, -2.85], z: 0.95, heading: [-0.9, 0.44] },
      Wh: { name: 'Round the back of the frame', at: [2.69, -0.57], z: 0.85, heading: [0.38, -0.93] },
      Wi: { name: 'High out in front', at: [2.44, -2.5], z: 1.68, heading: [0.98, 0.21] },
      Wj: { name: 'Back inside the frame', at: [2.64, -2.03], z: 0.85, heading: [-0.94, -0.34] },
      Wk: { name: 'Low round the right pole', at: [2.65, -2.45], z: 0.24, heading: [-0.75, -0.67] },
      Wl: { name: 'Back along the front', at: [1.61, -2.41], z: 0.96, heading: [-0.98, 0.2] },
      Wm: { name: 'Up the back', at: [1.78, -0.18], z: 0.84, heading: [0.51, 0.86] },
      Wn: { name: 'High round the frame', at: [1.94, -1.2], z: 1.24, heading: [0.05, -1] },
      Wo: { name: 'Up and over', at: [1.86, -1.42], z: 1.59, heading: [0.04, 1] },
      Wp: { name: 'Round behind the back gate', at: [1.75, 1.16], z: 0.67, heading: [-0.66, 0.75] },
      Wq: { name: 'Back on to the back gate', at: [0.86, -0.6], z: 1.05, heading: [0.7, -0.71] },
      Wr: { name: 'Out to the left', at: [0.7, -0.14], z: 1.12, heading: [-0.95, 0.31] },
      Ws: { name: 'Round the far end', at: [-0.69, 0.46], z: 0.12, heading: [-0.65, -0.76] },
      Wt: { name: 'Home along the near side', at: [-0.73, -0.74], z: 0.12, heading: [0.3, -0.95] },
    },
    start: { at: [-0.85, -0.3], yaw: -Math.PI / 2 },
    lap: 'A+ B+ Wa C Wb D+ E- Wc F Wd I- We E+ Wf H- Wg I+ C Wh E- Wi J Wj H- Wk Wl F Wm C Wn D- B+ Wo Wp K Wq L+ Wr Ws Wt',
  },
  /*
   * TRACK 7, FPVBean's, and the first with a table in it since Track 8.
   *
   * Seven feet on a four by three lattice, x 0 to 3 and y 0 to -2. Reading
   * it: a two unit bar at one unit on three legs at x 0, the middle and far
   * ones carried up to two units and both flown round; and a table at x 2 to
   * 3, y -1 to -2, four legs, a square of bar at one unit, its top flown as
   * a dive gate, and the two legs along y -1 carried up to two units. One
   * bar spurs off the table's near left corner a unit in +y and stops in mid
   * air, and a ground bar runs from the far gate's foot to the table's near
   * one. The lap is 16 passes.
   *
   * THE SPUR'S END SCORES. The animation lights a square hanging off the end
   * of that bar, centred on the bar's own height rather than sitting on the
   * floor: the best fit over a quarter unit grid is a unit square at x 2 to
   * 3 in the plane y 0, from half a unit up to one and a half. It is the
   * only opening in seven tracks whose sill is not a whole number, and it is
   * what the reference draws. J in the squares below, unbuilt, because the
   * only pipe near it is the spur that makes it.
   *
   * AND THE MIRROR AGAIN. Fitted as read, with every point required to be in
   * front of the camera, the solver could only reach 34 px with a focal
   * length of four million and an eye fourteen thousand units out. With y
   * negated it came back at 6.9 px from an eye 3.8 units up. Step 4c, third
   * time.
   */
  {
    id: 'racegow5-track7',
    name: 'RaceGOW5 Track 7',
    credit: {
      designer: 'FPVBean',
      series: 'RaceGOW5',
      source: 'racegow.com/tracks, the official Track 7 animation',
      broughtOverBy: 'andAgainFPV',
    },
    origin: [154, 265],
    squares: {
      E: { name: 'Near gate', axis: 'x', at: [0, -0.5], sill: 0 },
      A: { name: 'Far gate', axis: 'x', at: [0, -1.5], sill: 0 },
      C: { name: 'Over the far gate', axis: 'x', at: [0, -1.5], sill: 1, unbuilt: true },
      F: { name: 'Under the spur', axis: 'x', at: [2, -0.5], sill: 0, unbuilt: true },
      K: { name: 'Table, left', axis: 'x', at: [2, -1.5], sill: 0, unbuilt: true },
      L: { name: 'Table, right', axis: 'x', at: [3, -1.5], sill: 0, unbuilt: true },
      G: { name: 'Table, far', axis: 'y', at: [2.5, -2], sill: 0, unbuilt: true },
      I: { name: 'Over the table', axis: 'y', at: [2.5, -1], sill: 1, unbuilt: true },
      J: { name: 'The end of the spur', axis: 'y', at: [2.5, 0], sill: 0.5, unbuilt: true },
      H: { name: 'Table top', axis: 'z', at: [2.5, -1.5], sill: 1 },
    },
    poles: {
      D: { name: 'Near pole', at: [0, -1], height: 2, side: [0, 1], beside: 'A' },
      B: { name: 'Far pole', at: [0, -2], height: 2, side: [0, -1], beside: 'A' },
    },
    posts: [
      { name: 'Table post, near left', at: [2, -1], height: 2 },
      { name: 'Table post, near right', at: [3, -1], height: 2 },
    ],
    rails: [
      { name: 'Ground bar, far gate to the table', from: [0, -2, 0], to: [2, -2, 0] },
      { name: 'The spur', from: [2, -1, 1], to: [2, 0, 1] },
    ],
    waypoints: {
      Wa: { name: 'Round the far pole', at: [0.67, -1.94], z: 0.33, heading: [0.14, -0.99] },
      Wb: { name: 'Up behind the gates', at: [-0.51, -1.85], z: 1.18, heading: [0.01, 1] },
      Wc: { name: 'Over the top', at: [0.46, 0.19], z: 2.07, heading: [-0.77, -0.63] },
      Wd: { name: 'Round the near pole', at: [-0.77, -0.48], z: 1.19, heading: [0.7, 0.71] },
      We: { name: 'Out over the table', at: [2.02, -3.57], z: 1.69, heading: [0.55, -0.84] },
      Wf: { name: 'Round the far corner', at: [2.52, -2.79], z: 1.08, heading: [0.58, -0.82] },
      Wg: { name: 'Round on to the spur', at: [2.14, -0.28], z: 1.5, heading: [-0.99, 0.13] },
      Wh: { name: 'Back over the table', at: [2.65, -1.27], z: 1.26, heading: [-0.45, -0.89] },
      Wi: { name: 'Round the right side', at: [3.52, -1.97], z: 1.3, heading: [0.59, 0.81] },
      Wj: { name: 'Away from the spur', at: [1.41, -0.89], z: 0.6, heading: [0.15, 0.99] },
      Wk: { name: 'Round the far corner again', at: [3.49, -2.41], z: 0.46, heading: [0.85, 0.52] },
      Wl: { name: 'Along the front', at: [2.31, -2], z: 0.74, heading: [-0.92, 0.39] },
      Wm: { name: 'Out to the near side', at: [2.12, -2.55], z: 0.32, heading: [-1, 0.05] },
      Wn: { name: 'On to the far gate', at: [-0.6, -1.99], z: 0.51, heading: [-0.08, 1] },
    },
    start: { at: [-0.6, -2.2], yaw: Math.PI / 2 },
    lap: 'A+ Wa B Wb C+ Wc D Wd E+ F+ We Wf G+ H+ I+ Wg J- Wh Wi H- K- Wj F+ G- Wk L- G- Wl Wm Wn',
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
    /*
     * WHICH SIDE THE QUAD GOES BY is not always the side the pole stands.
     * `side` puts the pole 14 inches from its gate's centre and is the pass
     * side on five of the six tracks, because the line goes round the
     * outside of a pole that stands beside its gate. Track 6's back pole is
     * the gate's own leg carried up and the animation lights the panel on
     * the far side of it, so `pass` names that direction and the marker's
     * yaw, which is what the racing line and the scoring square follow,
     * takes it instead. Left out, it is `side`, and nothing else moves.
     */
    const passSide = pole.pass || pole.side;
    const plen = Math.hypot(passSide[0], passSide[1]) || 1;
    const pass = { x: passSide[0] / plen, y: passSide[1] / plen };
    /* On the gate's own stile line, RaceGOW's 14 inches from its centre. */
    const at = {
      x: centre.x + dir.x * POLE_FROM_GATE_MIN,
      y: centre.y + dir.y * POLE_FROM_GATE_MIN,
    };
    const el = createElement(doc, 'pole', at, Math.atan2(pass.y, pass.x));
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
