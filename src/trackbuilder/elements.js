/*
 * elements.js: the track builder's obstacle library, and the ONLY place a
 * dimension is written down.
 *
 * Every length in this file is metres. Feet appear in FT and in the comments
 * that quote the source, and nowhere else, per CLAUDE.md.
 *
 * PROVENANCE WARNING, READ BEFORE TRUSTING A NUMBER. The figures below are
 * approximations of the MultiGP obstacle standards, transcribed from memory
 * of the published page rather than read off it in this session. Every one
 * of them carries a VERIFY comment naming what has to be checked against
 * https://www.multigp.com/multigp-drone-race-course-obstacles/ before this
 * library is treated as authoritative. They are close enough to author a
 * course against and they are not a citation.
 *
 * This module is pure data and pure functions. It imports nothing, it knows
 * nothing about the DOM, the canvas, Three.js or the flight simulator, and
 * nothing outside it is allowed to write a dimension down.
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

/* FT and IN come from src/units.js, shared with src/game/track.js. The
 * builder must not import the game, so the constants they both need live in
 * a leaf module rather than being typed out twice. */
import { FT, IN, FRAME_TUBE_OD } from '../units.js';

/* Re-exported because this module's consumers already read it from here. */
export { FRAME_TUBE_OD };

/*
 * What an element IS, which decides everything the tool does with it.
 *
 *   aperture   has one or more holes to fly through, so it can appear in the
 *              sequence, once per hole, each with its own entry face.
 *   marker     is passed on one side at a clearance radius. The pass side
 *              is a virtual gate: a square beside the pole that the quad
 *              has to fly through, the same way it flies a real opening.
 *   obstacle   is solid. It never appears in the sequence, and the path
 *              warning pass tests the racing line against it.
 *   start      the lap's start position and heading. Exactly one per track.
 *   annotation text on the field. Not part of the course in any way.
 */
export const KIND = {
  APERTURE: 'aperture',
  MARKER: 'marker',
  OBSTACLE: 'obstacle',
  START: 'start',
  ANNOTATION: 'annotation',
};

/*
 * Frame tube diameter. MultiGP does not publish it. Their gates are built
 * from schedule 40 PVC and 1 inch nominal schedule 40 PVC has an outside
 * diameter of 1.315 in, which is what is used here. It sets how thick a gate
 * is drawn and how far apart the openings in a ladder sit; it does not change
 * any clear opening.
 *
 * VERIFY: whether MultiGP specifies a tube size anywhere. Treated as an
 * assumption until then.
 */

/*
 * Header pennant on a flagged gate. The mast stands on the header board, it
 * does not spike the ground, and this is the only place its length is
 * written. Pole radius is the tube a teardrop sail sleeves onto, not the
 * gate's own PVC.
 */
export const GATE_FLAG_H = 1.45;
export const GATE_FLAG_POLE_R = 0.012;

export const FLAG_SIDES = ['left', 'right', 'both'];

export function normalizeFlagSide(value, fallback = 'left') {
  if (value === 'left' || value === 'right' || value === 'both') {
    return value;
  }
  return fallback;
}

/* Which header ends carry a pennant. Left is local -X when facing the gate. */
export function flagSideSigns(side) {
  if (side === 'right') {
    return [1];
  }
  if (side === 'both') {
    return [-1, 1];
  }
  if (side === 'left') {
    return [-1];
  }
  return [];
}

export function flagSideOf(el) {
  const def = ELEMENTS[el?.type];
  if (!def?.flagSide) {
    return null;
  }
  return normalizeFlagSide(el.flagSide, def.flagSide);
}

/*
 * The scoring square a flag or a cone assigns on its pass side.
 *
 * Width is twice the clearance, so the inner edge sits on the pole and the
 * outer edge is one clearance past the racing line. Height is at least that
 * wide, and at least as tall as the marker, so a 2.5 m flag is not scored
 * by a waist-high slot. Waypoints keep a clearance of zero and do not get
 * one of these: they pin the line, they are not a hole.
 */
export function virtualApertureDims(el, seq) {
  const clearance = Math.max(0, seq?.clearance ?? el?.dims?.clearance ?? 0);
  const clearW = Math.max(0.8, clearance * 2);
  const poleH = Math.max(0, el?.dims?.height ?? 0);
  const clearH = Math.max(clearW, poleH);
  return {
    clearW,
    clearH,
    sillH: 0,
    centerH: clearH * 0.5,
  };
}

/*
 * Every element type, in palette order, with its hotkey and its default
 * dimensions.
 *
 * An aperture element is described by five numbers and the tool derives its
 * holes from them:
 *
 *   levels      how many openings the structure has
 *   sillH       height of the BOTTOM of the lowest opening above the ground
 *   clearW      clear opening width, the dimension a pilot flies through
 *   clearH      clear opening height
 *   levelPitch  vertical distance from one opening's bottom to the next
 *
 * All five are per instance editable in the inspector. The values here are
 * only the defaults handed to a newly placed element, which is why an old
 * saved track keeps the sizes it was authored with when a default in this
 * file changes.
 *
 * `pitch` is not a dimension and so it is not in `dims`. It is the default
 * TILT of the aperture plane in radians, the angle the normal is raised
 * above the horizontal, and it lives on the element itself next to yaw.
 */
export const ELEMENTS = {
  gate: {
    id: 'gate',
    label: 'Gate',
    key: 'G',
    group: 'track',
    kind: KIND.APERTURE,
    note: 'Vertical square aperture. The standard element.',
    /* "5x5 Gate: opening 5 feet by 5 feet." The chapter standard gate.
     * VERIFY: the 5 ft by 5 ft clear opening on multigp.com. */
    pitch: 0,
    dims: { levels: 1, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD },
  },
  flaggedGate: {
    id: 'flaggedGate',
    label: 'Flagged gate',
    key: 'A',
    group: 'track',
    kind: KIND.APERTURE,
    /* Which end of the header the pennant sits on, as seen facing the gate.
     * Not a dimension: it is an element field like a label's text. The
     * inspector offers left, right or both; this is the default a newly
     * placed one gets. */
    flagSide: 'left',
    note: 'Standard square gate with a pennant on the header. Pick left, right or both in the inspector.',
    /* Same 5 ft opening as `gate`. The pennant is dress on the header, not
     * a second sequence marker: the hole is still one gate.
     * VERIFY: nothing on multigp.com dimensions a header flag. 1.45 m of
     * mast above the board is the tool's own length, written once as
     * GATE_FLAG_H. */
    pitch: 0,
    dims: { levels: 1, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD },
  },
  doubleStack: {
    id: 'doubleStack',
    label: 'Double stack',
    key: '2',
    group: 'track',
    kind: KIND.APERTURE,
    note: 'Two standard gates stacked. Each hole is its own gate. Placing one writes a spiral up; pick split-S or one opening in the inspector.',
    /* "5x5 Double Gate Tower: two standard gates stacked vertically", sat
     * on the ground rather than elevated. The elevated version is `tower`.
     * VERIFY: whether the published double gate tower sits on the ground. */
    pitch: 0,
    dims: { levels: 2, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD },
  },
  flaggedDoubleStack: {
    id: 'flaggedDoubleStack',
    label: 'Flagged double',
    key: 'H',
    group: 'track',
    kind: KIND.APERTURE,
    /* Same header pennant as `flaggedGate`, stood on the top board of a
     * two hole stack. The flags are dress: the holes are still two gates. */
    flagSide: 'left',
    note: 'Two standard gates stacked, with a pennant on the top header. Pick left, right or both in the inspector.',
    pitch: 0,
    dims: { levels: 2, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD },
  },
  ladder: {
    id: 'ladder',
    label: 'Triple stack',
    key: 'R',
    group: 'track',
    kind: KIND.APERTURE,
    note: 'Three standard gates stacked. Each hole is its own gate. Placing one writes a spiral up; pick spiral down, split-S or one opening in the inspector.',
    /* "5x5 Ladder: three standard gates stacked vertically." The openings
     * share a frame tube, so each sill sits one opening plus one tube above
     * the one below it.
     * VERIFY: the stack count, and whether the shared tube is the real
     * vertical spacing or whether MultiGP dimensions the overall height. */
    pitch: 0,
    dims: { levels: 3, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD },
  },
  tower: {
    id: 'tower',
    label: 'Tower',
    key: 'T',
    group: 'track',
    kind: KIND.APERTURE,
    note: 'Tall structure, apertures at multiple heights.',
    /* "5x5 Tower: opening 5 feet by 5 feet, elevation 5 feet off the
     * ground", and "5x5 Double Gate Tower: two standard gates stacked
     * vertically". The default here is the double gate tower standing on a
     * 5 ft elevation, which is the version worth two sequence entries.
     * VERIFY: the 5 ft elevation, and whether the double gate tower is
     * itself elevated or sits on the ground. */
    pitch: 0,
    dims: { levels: 2, sillH: 5 * FT, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD },
  },
  diveGate: {
    id: 'diveGate',
    label: 'Dive Gate',
    key: 'D',
    group: 'track',
    kind: KIND.APERTURE,
    note: 'Aperture plane horizontal or angled, not vertical. Flown through vertically or on a slope.',
    /* "7x6 Dive Gate: elevation 15 ft. Slight angle for entry facilitation."
     * The angle is described but never dimensioned, so the default here is a
     * fully horizontal aperture, which is the honest reading of "flown
     * through vertically", and the inspector exposes the tilt so an angled
     * dive gate is one drag away.
     * VERIFY: the 15 ft elevation, the 7 ft by 6 ft opening, and whether
     * MultiGP anywhere states the entry angle. */
    pitch: Math.PI / 2,
    dims: { levels: 1, sillH: 15 * FT, clearW: 7 * FT, clearH: 6 * FT, levelPitch: 6 * FT + FRAME_TUBE_OD },
  },
  barrier: {
    id: 'barrier',
    label: 'Barrier',
    key: 'B',
    group: 'track',
    kind: KIND.OBSTACLE,
    note: 'Solid obstacle. Not flown through. Collision geometry only.',
    /* Not a MultiGP obstacle. A barrier is the tool's way of saying "the
     * racing line must not go here": a shipping container, a fence, a stand.
     * The default is a 4 m by 1 m panel 2 m tall, which is a plausible crowd
     * barrier and is only a starting size. */
    dims: { width: 4, depth: 1, height: 2 },
  },
  flag: {
    id: 'flag',
    label: 'Flag',
    key: 'F',
    group: 'track',
    kind: KIND.MARKER,
    note: 'Turn marker. The pass side is a virtual gate: a green square beside the pole that has to be flown through.',
    /* "Split-S Gate: flag placement 1.5 ft behind and to the side of the
     * gate" is the only flag dimension MultiGP publishes, and it is an
     * offset rather than a flag. A turn flag on a course is a pole with a
     * banner; 2.5 m of pole is the common build. The clearance radius is the
     * tool's own number: how far off the pole the racing line is drawn.
     * VERIFY: whether MultiGP dimensions a standalone turn flag at all. */
    dims: { height: 2.5, poleRadius: 0.025, clearance: 1.5 },
  },
  cone: {
    id: 'cone',
    label: 'Cone',
    key: 'C',
    group: 'track',
    kind: KIND.MARKER,
    note: 'Ground marker. The pass side is a virtual gate, the same as a flag.',
    /* A standard traffic cone: 28 in tall on a 14 in square base. Not a
     * MultiGP dimension, a highway one, and near enough for a ground marker.
     * VERIFY: nothing on multigp.com, this is a road cone. */
    dims: { height: 28 * IN, baseRadius: 7 * IN, clearance: 1 },
  },
  waypoint: {
    id: 'waypoint',
    label: 'Waypoint',
    key: 'W',
    group: 'track',
    kind: KIND.MARKER,
    note: 'Nothing is standing here. The line is required to pass through this point, at this height. Not drawn on the race field.',
    /*
     * NOT AN OBSTACLE, AND THAT IS THE WHOLE POINT.
     *
     * A waypoint says "the lap goes through here" and nothing else. It exists
     * because imported courses need it: Velocidrone lets an author drop an
     * invisible trigger box in open air to pin the racing line where there is
     * no gate to fly through, and 55 of the stops across the tracks under
     * tracks/ are exactly that. Before this existed the import had to call
     * each one either a gate, which puts PVC on the field that is not on the
     * real course, or a flag, which is worse, because a flag is passed at a
     * clearance radius and so the line is pushed 1.5 m off the one point the
     * author was trying to pin it to.
     *
     * It is a MARKER because path.js already does the right thing with one:
     * the knot lands at marker plus clearance times the pass side, so a
     * clearance of ZERO puts the knot exactly on the point and takes its
     * tangent from the run of the course. A marker also cannot raise a
     * reversal warning, which is correct: a waypoint has no face to reverse.
     *
     * height is how tall it is DRAWN in the builder, so an author can see one
     * and grab it. Nothing is built for it on the race field.
     */
    dims: { height: 1.6, poleRadius: 0.02, clearance: 0 },
  },
  startPads: {
    id: 'startPads',
    label: 'Start Pads',
    key: 'S',
    group: 'extra',
    kind: KIND.START,
    note: 'Lap start position and heading. Exactly one per track.',
    /* A row of launch stands on the start line. MultiGP runs heats of four,
     * so four stands at 1.5 m spacing is the default grid. padSize is the
     * cell the stand sits in; the mesh is a two-rail wooden start block,
     * not a floor tile. See src/art/startblock.js.
     * VERIFY: MultiGP's published starting grid spacing, if any. */
    dims: { pads: 4, spacing: 1.5, padSize: 0.6 },
  },
  label: {
    id: 'label',
    label: 'Label',
    key: 'L',
    group: 'extra',
    kind: KIND.ANNOTATION,
    note: 'Text annotation on the field. Not part of the course.',
    /* Text height is a drawing size, not a course size, but it is a length
     * in metres on the field and so it lives here with the rest. */
    dims: { textHeight: 0.9 },
  },
};

/* Palette order is the order the task specifies, and the order the palette
 * draws. It is written out rather than derived from Object.keys so a future
 * reorder is one obvious edit. */
export const PALETTE_ORDER = [
  'gate', 'flaggedGate', 'doubleStack', 'flaggedDoubleStack', 'ladder', 'tower', 'diveGate', 'barrier', 'flag', 'cone', 'waypoint',
];
export const PALETTE_EXTRA = ['startPads', 'label'];

/*
 * The path toggle. It is in the palette because the task puts it there, and
 * it is not an element: pressing P shows or hides the derived racing line.
 * It carries a key so the hotkey table has one source.
 */
export const PATH_TOGGLE = { id: 'path', label: 'Path', key: 'P', note: 'Toggles display of the derived racing line.' };

/*
 * Tuning. Every number the tool uses that is a length in metres, or that the
 * task explicitly asks to be a single named constant.
 */
export const TUNING = {
  /* Default field, in metres, and the grid it snaps to. */
  fieldWidth: 60,
  fieldDepth: 40,
  gridSize: 1,

  /*
   * How long a Hermite tangent is, as a fraction of the distance to the next
   * knot. The task asks for this to be one named constant so the line can be
   * tuned, and this is it.
   *
   * DERIVED, NOT CHOSEN, and the derivation matters because the obvious
   * number is wrong by a factor of three.
   *
   * The well known figure for approximating a circular arc with a cubic is
   * k = (4/3)tan(theta/4)R, which is 0.5523R for a quarter circle. That is
   * the offset of a BEZIER CONTROL POINT from the endpoint. A Hermite
   * tangent is three times that, because the Bezier control point sits at
   * p0 + m0/3. Using the Bezier figure as a Hermite tangent makes every
   * tangent a third as long as it should be, and a cubic whose tangents are
   * too short does not gently straighten: it puts a near cusp at every knot
   * whose tangent is not already pointing along the chord. Measured on a 120
   * m demo lap it gave a radius of curvature of 0.2 m at almost every gate,
   * which is what the curvature warning is for and how this was caught.
   *
   * The correct ratio for a turn of theta through two knots is
   *
   *     m / chord = 2 tan(theta/4) / sin(theta/2)
   *
   * which is 1.000 for a straight, 1.072 at 60 degrees, 1.172 at 90 and
   * 1.333 at 120. 1.1 sits in the middle of the range a racing line actually
   * turns through, reproduces a circle to within a few percent over it, and
   * sits a shade over the Catmull-Rom value of 1.0, which is the other
   * defensible answer.
   */
  tangentScale: 1.1,

  /*
   * Minimum radius of curvature the line may reach before the results panel
   * warns, in metres. A 5 inch quad at racing speed is doing 20 m/s or so;
   * holding 20 m/s round a 2.5 m radius is 160 m/s squared of lateral
   * acceleration, over 16 g, which no quad does. So a line that dips below
   * this is telling the author the two elements either side are too close or
   * face the wrong way. Per track, in doc.settings, so it is configurable.
   */
  minCurveRadius: 2.5,

  /* How finely the spline is sampled, per segment between two knots. Arc
   * length, curvature, the barrier test and the elevation profile all read
   * this polyline, so it is one number rather than four. */
  samplesPerSegment: 48,

  /* How far outside the field boundary a sample has to stray before the
   * results panel says the line left the field. A metre of slop stops a
   * gate sitting exactly on the boundary from warning every time. */
  boundarySlack: 1.0,

  /* Clearance a barrier is given when the line is tested against it. The
   * line is a centreline and a quad is not a point. */
  barrierClearance: 0.35,

  /*
   * How far the racing line steps off a stacked gate between two passes, in
   * metres. A Hermite between two openings that share an XY climbs through
   * the PVC; this offset is what turns that climb into a wrap around the
   * structure. Sized from the 5 ft opening plus its sleeves plus a body
   * length, so the line clears the frame on a standard stack.
   */
  stackWrap: 2.6,
};

/* Convenience: every element definition in palette order, extras last. */
export function paletteItems() {
  return [
    ...PALETTE_ORDER.map((id) => ELEMENTS[id]),
    ...PALETTE_EXTRA.map((id) => ELEMENTS[id]),
  ];
}

/* Look up an element definition by the hotkey the user pressed. Returns
 * undefined for a key that is not a palette key. */
export function elementByKey(letter) {
  const up = String(letter || '').toUpperCase();
  return paletteItems().find((d) => d.key === up);
}

/*
 * The openings a set of dimensions produces, bottom to top.
 *
 * `centerH` is the height of the opening's centre above the element's own
 * base, which is what everything downstream actually wants: the aperture's
 * world centre is the element's position raised by centerH, and the tilt
 * rotates the opening about that centre.
 */
export function apertureLevels(dims) {
  const out = [];
  const n = Math.max(1, Math.round(dims.levels));
  for (let i = 0; i < n; i += 1) {
    const sill = dims.sillH + i * dims.levelPitch;
    out.push({
      index: i,
      sillH: sill,
      centerH: sill + dims.clearH / 2,
      clearW: dims.clearW,
      clearH: dims.clearH,
    });
  }
  return out;
}

/* Overall height of an element, for the 3D view and for the height drag
 * limits. Aperture elements are as tall as their top opening plus a tube. */
export function elementHeight(def, dims) {
  if (def.kind === KIND.APERTURE) {
    const levels = apertureLevels(dims);
    const top = levels[levels.length - 1];
    const h = top.sillH + top.clearH + FRAME_TUBE_OD;
    return def.flagSide ? h + GATE_FLAG_H : h;
  }
  if (def.kind === KIND.OBSTACLE) {
    return dims.height;
  }
  if (def.kind === KIND.MARKER) {
    return dims.height;
  }
  if (def.kind === KIND.START) {
    /* Visual height of the launch stand in src/art/startblock.js. */
    return Math.max(0.08, dims.padSize * 0.40);
  }
  return dims.textHeight;
}
