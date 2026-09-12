/*
 * racegow-lattice.js: the shipped RaceGOW tracks, each as a lattice of
 * 27 inch squares, and the script that turns them into
 * src/trackbuilder/presets.js.
 *
 * WHY A LATTICE. A RaceGOW track is built from one length of 3/4 inch PVC,
 * 27 inches, and right angle fittings. So every gate is a 27 inch square,
 * every gate stands square to one of two axes or lies flat, and the distance
 * between any two things is a whole number of 27 inch units. The official
 * animation of a track is therefore a picture of a lattice, and reading it
 * is counting: which unit squares are lit, in which order, flown which way.
 * That reading is written here as data, one small object per track, and
 * this script does the arithmetic. Run it and presets.js is rewritten:
 *
 *   node scripts/racegow-lattice.js
 *
 * WHAT ONE SQUARE IS. Two parallel pipes 27 inches apart, centre to centre,
 * leave 27 inches less one pipe of daylight between them, so the clear
 * opening is that and the frame tube is drawn on the lattice line. Adjacent
 * squares then share a pipe, which is how the real thing is built. An
 * elevated square is a gate with its sill at a whole number of units, on
 * legs to the floor that are the same pipe as the square below it, so a
 * column of squares is a tower and a row of them is a rail with openings
 * under and over it.
 *
 * WHAT A POLE IS. The animation lights a full height panel beside a pole,
 * which is what RaceGOW's pole rule means: fly past it on this side, at any
 * height. That is the builder's marker, whose scoring square stands on the
 * pass side as tall as the pole. The pole itself is the gate's own upright
 * carried on, and it stands at RaceGOW's published 14 inches from the gate
 * centre, which on a 27 inch lattice is half an inch outboard of the stile.
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
import { PIPE_OD, POLE_FROM_GATE_MIN } from '../src/trackbuilder/racegow.js';
import { IN } from '../src/units.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* One length of pipe, and one unit of everything. */
export const UNIT = 27 * IN;

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
const TRACKS = [
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
     * The structure is a 3 by 2 unit lattice: a start gate with a square
     * over it at x 0, a rail down y 0 with a square over and under it at
     * x 1 to 2, a table at x 2 to 3 whose top is a dive gate, two columns
     * of two squares along its far side, and a three high tower at x 3
     * carrying the tall pole. The lap is 29 passes.
     */
    squares: {
      A: { name: 'Start gate', axis: 'x', at: [0, -0.5], sill: 0 },
      F: { name: 'Over the start gate', axis: 'x', at: [0, -0.5], sill: 1 },
      N: { name: 'Tower, bottom', axis: 'x', at: [3, 0.5], sill: 0 },
      E: { name: 'Tower, middle', axis: 'x', at: [3, 0.5], sill: 1 },
      C: { name: 'Tower, top', axis: 'x', at: [3, 0.5], sill: 2 },
      L: { name: 'Far side, left, low', axis: 'y', at: [1.5, 1], sill: 0 },
      I: { name: 'Far side, left, up', axis: 'y', at: [1.5, 1], sill: 1 },
      M: { name: 'Far side, right, low', axis: 'y', at: [2.5, 1], sill: 0 },
      H: { name: 'Far side, right, up', axis: 'y', at: [2.5, 1], sill: 1 },
      K: { name: 'Under the rail', axis: 'y', at: [1.5, 0], sill: 0 },
      J: { name: 'Over the rail', axis: 'y', at: [1.5, 0], sill: 1 },
      P: { name: 'Table top', axis: 'z', at: [2.5, 0.5], sill: 1 },
    },
    poles: {
      T: { name: 'Tall pole', at: [3, 0], height: 3, side: [0, -1], beside: 'N' },
      W: { name: 'Left pole', at: [0, 0], height: 2, side: [0, 1], beside: 'A' },
    },
    rails: [
      { name: 'Rail', from: [0, 0, 1], to: [1, 0, 1] },
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
     * A 3 by 2 unit lattice again: a long rail down y 0 with a square under
     * and over its first unit, a frame at x 2 with a square in it, one
     * under it and one over it, the tall pole on the frame's far post, a
     * bar on to x 3 with a square under it, and at each end of the rail a
     * bar across to a second pole with a square under it and one over it.
     * The lap is 20 passes.
     */
    squares: {
      A: { name: 'Start gate', axis: 'x', at: [3, -0.5], sill: 0 },
      C: { name: 'Over the start gate', axis: 'x', at: [3, -0.5], sill: 1 },
      H: { name: 'Frame, bottom', axis: 'x', at: [2, 0.5], sill: 0 },
      F: { name: 'Frame, middle', axis: 'x', at: [2, 0.5], sill: 1 },
      E: { name: 'Frame, top', axis: 'x', at: [2, 0.5], sill: 2 },
      I: { name: 'Under the bar', axis: 'y', at: [2.5, 0], sill: 0 },
      J: { name: 'Under the rail', axis: 'y', at: [0.5, 0], sill: 0 },
      K: { name: 'Over the rail', axis: 'y', at: [0.5, 0], sill: 1 },
      N: { name: 'Near gate', axis: 'x', at: [0, -0.5], sill: 0 },
      L: { name: 'Over the near gate', axis: 'x', at: [0, -0.5], sill: 1 },
    },
    poles: {
      B: { name: 'Right pole', at: [3, -1], height: 2, side: [0, -1], beside: 'A' },
      D: { name: 'Tall pole', at: [2, 1], height: 3, side: [0, 1], beside: 'F' },
      M: { name: 'Near pole', at: [0, -1], height: 2, side: [0, -1], beside: 'N' },
    },
    rails: [
      { name: 'Rail', from: [1, 0, 1], to: [2, 0, 1] },
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
];

/* A lattice point in the room, in metres. */
function place(track, x, y) {
  return {
    x: (track.origin[0] + x * 27) * IN,
    y: (track.origin[1] + y * 27) * IN,
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
    el.position.z = rail.from[2] * UNIT - PIPE_OD / 2;
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
 * They can be built exactly because the kit is a lattice. Every pipe is 27
 * inches, every fitting is a right angle, so every gate is a 27 inch square
 * standing square to one of two axes or lying flat, and every distance is a
 * whole number of 27 inch units. Reading a track is counting which unit
 * squares the animation lights, in what order, flown which way. The count
 * for each track is in scripts/racegow-lattice.js, and this file is what
 * that script writes. A track that is not in that script is not here, which
 * is why the set is the size it is: the earlier six were reconstructions
 * from a single render, close in shape and wrong in detail, and the owner
 * replaced them.
 *
 * A pole is a marker whose pass panel is the animation's own: full height,
 * one side. It stands on the gate's stile line at RaceGOW's 14 inches from
 * the gate centre. The start gate is the first pass of the lap and the lap
 * closes on it.
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

const docs = buildAll();
const body = docs
  .map((d) => JSON.stringify(d, null, 2).split('\n').map((line) => `  ${line}`).join('\n'))
  .join(',\n');
const out = `${HEADER}export const PRESETS = [\n${body},\n];\n${FOOTER}`;
const target = join(root, 'src/trackbuilder/presets.js');
writeFileSync(target, out);
for (const d of docs) {
  console.log(`${d.id}: ${d.elements.length} elements, ${d.sequence.length} passes`);
}
console.log(`wrote ${target}`);
