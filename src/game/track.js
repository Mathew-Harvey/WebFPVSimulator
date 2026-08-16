/*
 * track.js: the course, as published dimensions and nothing else.
 *
 * MultiGP publishes its obstacle dimensions in feet and its Universal Time
 * Trial layouts as dimensioned diagrams. This file is the one place those
 * numbers live. Every figure below is either quoted from a MultiGP page or
 * measured from a MultiGP diagram at a stated scale, and the provenance of
 * each one is in .loop/evidence/r10/utt3-layout.md. Nothing here is
 * estimated from a photograph and nothing here is invented, because the
 * whole scale of the world is measured against the gate: a 250 mm quad
 * flying through a 3.8 m hole looks like a toy in a stadium, which is what
 * this project used to look like.
 *
 * Sources:
 *   https://www.multigp.com/multigp-drone-race-course-obstacles/
 *   https://www.multigp.com/universal-time-trial-utt/
 *   https://www.multigp.com/wp-content/uploads/2017/05/
 *     MultiGP-universal-time-trial-track-3-BesselRun-002.pdf
 *
 * The guide PDFs are deliberately not vendored. They are MultiGP artwork
 * under an unstated licence, and the build needs the numbers rather than the
 * files.
 *
 * Units: feet appear only in FT and in the comments quoting the source.
 * Everything this module exports is metres, per CLAUDE.md. This module is
 * pure data and pure functions: no Three.js, no renderer, no simulator
 * state, so it can be read by the scene builder, by the race logic and by a
 * test without any of them importing each other.
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

/* FT and IN come from src/units.js, shared with the track builder: the
 * builder may not import the game, so the constants they both need live in
 * a leaf module rather than being typed out twice. */
import { FT, IN, FRAME_TUBE_OD } from '../units.js';

/* Re-exported because this module's callers already read it from here. The
 * provenance of the 1.315 in figure is written down in src/units.js. */
export { FRAME_TUBE_OD };

/*
 * The obstacle library, at published dimensions.
 *
 * `clearW` and `clearH` are the CLEAR OPENING, which is what a pilot flies
 * through and what MultiGP dimensions. `sillH` is the height of the bottom
 * of the opening above the ground: zero for a gate standing on the field,
 * and the published elevation for a tower or a dive gate.
 *
 */

/*
 * How much larger than published every obstacle is BUILT, as a pure number.
 *
 * THE PUBLISHED DIMENSIONS ABOVE DO NOT MOVE. They are quoted from MultiGP
 * and the whole value of this file is that they are quoted rather than
 * chosen; a 5x5 gate is 1.524 m because MultiGP says 5 ft, and editing that
 * number to taste would leave the file looking like a citation while being an
 * opinion. So the departure is a separate, named, single number, and every
 * consumer reads the published value through it.
 *
 * The owner asked for it twice and then exactly: "the gates need to be
 * bigger", and then "the gates need to be 15 percent larger in the track".
 * That is a deliberate playability choice against the real rulebook, made
 * with the rulebook still on the page, and it is recorded as one because a
 * future round is going to ask why a gate here is not 5 ft.
 *
 * This is now the ONLY departure from real dimensions anywhere in the world.
 * WORLD_SCALE in src/render/frame.js used to stack a second one on top, and
 * the pair of them put a 1.7526 m opening against a 0.2776 m craft, 6.31
 * gate widths to the quad where MultiGP against a real 5 inch is 4.39. That
 * scale is back to 1, so the ratio is 1.7526 against 0.347, which is 5.05
 * gate widths: the 15 percent above, and nothing else.
 *
 * Note what this constant does NOT do. It makes a gate bigger in metres, and
 * a bigger gate seen from proportionally further away looks identical, so it
 * is not the lever that decides whether a gate reads as small on screen.
 * That is the camera's field of view, and src/render/lens.js carries the
 * derivation.
 *
 * Everything with a length scales, so an obstacle grows as one object: the
 * opening, the sill a tower stands its opening on, the hurdle bar, the flag
 * offset and the frame tube itself. A gate with a 15 percent bigger hole and
 * the same pipe would read as a different product.
 */
export const GATE_SCALE = 1.15;

/* The frame tube as BUILT, which is the one the scene draws and the one a
 * collider follows. */
export const BUILT_FRAME_TUBE_OD = FRAME_TUBE_OD * GATE_SCALE;

/* Every length in an obstacle spec, so scaling one cannot miss a field that
 * a later obstacle adds. Anything not named here is not a length: a stack
 * count, a label, a published string. */
const OBSTACLE_LENGTHS = [
  'clearW', 'clearH', 'sillH', 'barH', 'poleExtra', 'sidePanelH', 'sidePanelW', 'flagOffset',
];

export const OBSTACLES = {
  /* "5x5 Gate: Opening 5 feet x 5 feet. Vinyl mesh panels with PVC pipe
   * frame." The standard chapter gate, and the unit the whole world is
   * scaled against. */
  standardGate: {
    label: 'Standard gate, 5x5',
    published: '5 ft by 5 ft opening',
    clearW: 5 * FT,
    clearH: 5 * FT,
    sillH: 0,
    panels: 'mesh side panels and a top panel',
  },
  /* The start and finish gate on a UTT diagram is drawn as a standard gate
   * with a chequered top panel. It is the same opening. */
  timingGate: {
    label: 'Start and finish timing gate',
    published: '1 standard MultiGP start/finish timing gate',
    clearW: 5 * FT,
    clearH: 5 * FT,
    sillH: 0,
    panels: 'mesh side panels and a chequered top panel',
  },
  /* "7x6 Gate: Opening 7 feet x 6 feet." Championship size. */
  championshipGate: {
    label: 'Championship gate, 7x6',
    published: '7 ft by 6 ft opening',
    clearW: 7 * FT,
    clearH: 6 * FT,
    sillH: 0,
    panels: 'mesh side panels and a top panel',
  },
  /* "5x5 Tower: Opening 5 feet x 5 feet. Elevation: 5 feet off the ground." */
  tower5x5: {
    label: 'Tower, 5x5',
    published: '5x5 gate elevated 5 ft off the ground',
    clearW: 5 * FT,
    clearH: 5 * FT,
    sillH: 5 * FT,
    panels: 'mesh side panels and a top panel',
  },
  /* "7x6 Tower: Elevation 6 ft off the ground." */
  tower7x6: {
    label: 'Tower, 7x6',
    published: '7x6 gate elevated 6 ft off the ground',
    clearW: 7 * FT,
    clearH: 6 * FT,
    sillH: 6 * FT,
    panels: 'mesh side panels and a top panel',
  },
  /* "5x5 Double Gate Tower: two standard gates stacked vertically." The
   * second opening sits above the first, separated by the shared frame. */
  doubleGateTower: {
    label: 'Double gate tower, 5x5',
    published: 'two standard gates stacked vertically',
    clearW: 5 * FT,
    clearH: 5 * FT,
    sillH: 0,
    stack: 2,
    panels: 'mesh side panels and a top panel',
  },
  /* "5x5 Ladder: three standard gates stacked vertically." */
  ladder: {
    label: 'Ladder, 5x5',
    published: 'three standard gates stacked vertically',
    clearW: 5 * FT,
    clearH: 5 * FT,
    sillH: 0,
    stack: 3,
    panels: 'mesh side panels and a top panel',
  },
  /* "7x6 Topless Ladder: three gate ladder without the topmost panel." */
  toplessLadder: {
    label: 'Topless ladder, 7x6',
    published: 'three gate ladder without the topmost panel',
    clearW: 7 * FT,
    clearH: 6 * FT,
    sillH: 0,
    stack: 3,
    panels: 'mesh side panels, no top panel',
  },
  /* "7x6 Dive Gate: Elevation 15 ft. Slight angle for entry facilitation."
   * The angle itself is not dimensioned, so it is not stated here. */
  diveGate: {
    label: 'Dive gate, 7x6',
    published: '7x6 gate elevated 15 ft, slightly angled for entry',
    clearW: 7 * FT,
    clearH: 6 * FT,
    sillH: 15 * FT,
    panels: 'mesh side panels and a top panel',
    note: 'the entry angle is described but not dimensioned by MultiGP',
  },
  /* "7x6 Launch Gate: not angled; panels face ground for below-entry." */
  launchGate: {
    label: 'Launch gate, 7x6',
    published: '7x6, not angled, panels facing the ground for upward entry',
    clearW: 7 * FT,
    clearH: 6 * FT,
    sillH: 15 * FT,
    panels: 'panels facing the ground',
    note: 'the elevation is not separately published; it is drawn as a dive gate without the angle',
  },
  /* "7x6 Split-S Gate: flag placement 1.5 ft behind and to the side of the
   * gate." */
  splitSGate: {
    label: 'Split-S gate, 7x6',
    published: '7x6 with flags 1.5 ft behind and to the side',
    clearW: 7 * FT,
    clearH: 6 * FT,
    sillH: 0,
    flagOffset: 1.5 * FT,
    panels: 'mesh side panels and a top panel',
  },
  /* "Hurdle: Height 5 feet, Width 10 feet." A hurdle is flown OVER, so its
   * clear opening is the air above the bar and clearH is not an aperture. */
  hurdle: {
    label: 'Hurdle',
    published: '5 ft tall, 10 ft wide',
    barH: 5 * FT,
    clearW: 10 * FT,
    clearH: null,
    sillH: 5 * FT,
    panels: 'a bar between two uprights',
  },
  /* "h-Hurdle: standard hurdle plus 1 foot of additional pole height." */
  hHurdle: {
    label: 'h-Hurdle',
    published: 'standard hurdle, 5 ft tall and 10 ft wide, plus 1 ft of pole',
    barH: 5 * FT,
    clearW: 10 * FT,
    clearH: null,
    sillH: 5 * FT,
    poleExtra: 1 * FT,
    panels: 'a bar between two uprights with a gate leg panel addition',
  },
  /* "Gate + Flag: 5x5 opening, side panel minimum 5 ft tall and minimum
   * 1 ft wide." */
  gatePlusFlag: {
    label: 'Gate plus flag, 5x5',
    published: '5x5 gate with a side panel at least 5 ft tall and at least 1 ft wide',
    clearW: 5 * FT,
    clearH: 5 * FT,
    sillH: 0,
    sidePanelH: 5 * FT,
    sidePanelW: 1 * FT,
    panels: 'mesh side panels, a top panel, and a side flag panel',
  },
  /* UTT 7's own requirement text: "5 Tiny Whoop size gates: 361 sq in
   * (19"x19" or 483mm x 483mm)". 19 inches is 0.4826 m, and the published
   * 483 mm is that rounded, so the computed figure is used. */
  whoopGate: {
    label: 'Micro or whoop gate',
    published: '19 in by 19 in, 361 square inches',
    clearW: 19 * IN,
    clearH: 19 * IN,
    sillH: 0,
    panels: 'a soft square frame',
  },
};

/*
 * One obstacle at BUILT dimensions: the published spec with every length
 * through GATE_SCALE.
 *
 * Everything that draws, measures or scores an obstacle reads it through
 * here, so the drawn frame, the load time assertion in src/render/scene.js
 * and the scoring aperture cannot disagree about how big a gate is. Reading
 * OBSTACLES directly is now reading the rulebook rather than the course, and
 * the two are deliberately different.
 *
 * The returned object is a fresh copy each call. This is build time only, so
 * one small allocation per obstacle is not on any budget, and handing back a
 * cached object would let a caller scale the library in place.
 */
export function builtObstacle(kind) {
  const o = OBSTACLES[kind];
  if (!o) {
    throw new Error(`unknown obstacle ${kind}`);
  }
  const out = { ...o };
  for (const key of OBSTACLE_LENGTHS) {
    if (typeof out[key] === 'number') {
      out[key] = out[key] * GATE_SCALE;
    }
  }
  return out;
}

/*
 * UTT 3 Bessel Run.
 *
 * "4 standard MultiGP gates and 1 standard MultiGP start/finish timing
 * gate." "Gates must be traversed in the direction indicated by arrows.
 * Gates must be traversed in this numerical sequence: 1-5." "No flags
 * allowed." The field is marked 100 yds by 40 yds, "300 ft ~91 m" by
 * "120 ft ~36.5 m".
 *
 * Course frame: x along the field's long axis, z across it, y up, origin at
 * gate 3 because gate 3 is where both of the diagram's dimension chains
 * meet. The four numbered gates are collinear along x at z = 0, and their
 * spacings are the diagram's three published dimensions. The timing gate is
 * the diagram's one published perpendicular dimension off that row.
 *
 * The timing gate's position ALONG the row is the only placement the diagram
 * does not dimension. Measured from the diagram's own scale it is 1.1 m
 * plus or minus 0.3 m from gate 3's station, which is inside the artwork's
 * own drawing tolerance, so it is built at gate 3's station exactly rather
 * than pretending to precision the diagram does not carry.
 *
 * `facing` is the axis the opening faces, read off the gate glyphs: the four
 * numbered gates are drawn as front elevations and so face across the field,
 * and the timing gate is drawn edge on and so faces along it.
 */
export const UTT3 = {
  id: 'utt3',
  name: 'UTT 3 Bessel Run',
  designer: 'MultiGP, 2016 season, track #3 v002',
  source: 'https://www.multigp.com/universal-time-trial-utt/',
  fieldLength: 300 * FT,
  fieldWidth: 120 * FT,
  flagsAllowed: false,
  /* MultiGP's own wording, from the UTT 9 guide, which states the rule more
   * completely than UTT 3's does and applies to every UTT. */
  rule: 'Obstacles must be traversed in the direction indicated by arrows. '
      + 'Obstacles must be traversed in this numerical sequence. If any '
      + 'obstacle is entered out of sequence or direction at any time the '
      + 'run is invalid.',
  gates: [
    { n: 1, kind: 'timingGate', x: 0, z: -46 * FT, facing: 'x', role: 'start and finish' },
    { n: 2, kind: 'standardGate', x: 92 * FT, z: 0, facing: 'z' },
    { n: 3, kind: 'standardGate', x: 0, z: 0, facing: 'z' },
    { n: 4, kind: 'standardGate', x: -69 * FT, z: 0, facing: 'z' },
    { n: 5, kind: 'standardGate', x: -(69 + 23) * FT, z: 0, facing: 'z' },
  ],
  /* The published dimension chain, kept as the source of the numbers above
   * so the two cannot drift apart. Read as: gate 5 to gate 4 is 23 ft, gate
   * 4 to gate 3 is 69 ft, gate 3 to gate 2 is 92 ft, and the timing gate is
   * 46 ft off the row. */
  dimensions: {
    gate5ToGate4Ft: 23,
    gate4ToGate3Ft: 69,
    gate3ToGate2Ft: 92,
    timingGateOffsetFt: 46,
  },
};

/*
 * UTT3 above is cited reference data and nothing reads it. It stays because
 * it is the published geometry this file's dimensions were derived from and
 * the provenance is worth more than the bytes.
 *
 * What used to sit here did NOT have that excuse: aperture(), courseGates(),
 * racingLine(), LOBE_DEPTH and GATE_APPROACH were a second, parallel idea of
 * what a course is, written before the track builder existed and read by
 * nothing in src, tests, scripts or tracks. A course is a document now, and
 * game/trackdoc.js turns it into stations. Two answers to "where are the
 * gates" is one more than a reader should have to choose between.
 */

/*
 * MultiGP timing. UTT is scored on a single lap, and chapter racing reports
 * the fastest three consecutive laps as well, which is what T5 asks for.
 * Both are computed from the same list of clean lap times in flying order,
 * and a voided lap breaks consecutiveness, which is the whole point of the
 * word consecutive.
 */
export function fastestLap(laps) {
  let best = null;
  for (const ms of laps) {
    if (ms != null && (best == null || ms < best)) {
      best = ms;
    }
  }
  return best;
}

/*
 * log is the race's own list of attempts in order, each { ms } for a clean
 * lap or { ms: null } for one thrown away. A run of three has to be three
 * clean laps in a row: a void in the middle ends the run.
 */
export function fastestThreeConsecutive(log) {
  let best = null;
  let run = [];
  for (const entry of log) {
    if (entry.ms == null) {
      run = [];
      continue;
    }
    run.push(entry.ms);
    if (run.length > 3) {
      run.shift();
    }
    if (run.length === 3) {
      const total = run[0] + run[1] + run[2];
      if (best == null || total < best) {
        best = total;
      }
    }
  }
  return best;
}
