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
import { FT, IN, FRAME_TUBE_OD, GATE_SCALE, LETTER_TUBE_OD } from '../units.js';
import {
  GATE_OPENING_DEFAULT, GATE_OPENING_MAX, GATE_SPACING_NOMINAL,
  ELEVATED_SILL_MIN, PIPE_OD, POLE_FROM_GATE_MIN, ROOM_WIDTH, ROOM_DEPTH, GRID as MICRO_GRID,
} from './racegow.js';
/* The freestyle assets, as data. src/props/types.js imports nothing, so the
 * builder can list them without their layouts or a renderer. */
import {
  PROP_TYPES, PROP_GROUPS, FURNITURE_PALETTE, approxHeight, styleOf as propStyleOf, CAR_STYLES,
} from '../props/types.js';
/* What a table, a chair and a banner are worth by default, in the one place their
 * shape is written down: src/props/room.js. */
import { ROOM_SIZES } from '../props/room.js';
/* What an opening is when it is not a square, and the height a regular hexagon has over its
 * width, again in the one place the shape is written down. */
import { shapeOf, HEX_HEIGHT_RATIO } from '../props/aperture.js';
/* The capital letters as pipe, with the holes in them: what a letter piece is made of, in the one place it is
 * written down. Pure, and imports only the aperture arithmetic above. */
import {
  LETTER_DEFAULT, dimsForLetterSize, letterDefaults, letterOf, letterSizeOf, openingCount,
} from '../props/letters.js';

/* Re-exported because this module's consumers already read it from here. */
export { FRAME_TUBE_OD, LETTER_TUBE_OD };

/*
 * THE TWO TRACK CLASSES.
 *
 * 'full' is the sixty metre field this builder has always drawn, flown on a
 * 5 inch quad through MultiGP sized gates. 'micro' is a RaceGOW room: a
 * course inside 1.42 by 2.13 m, built out of 3/4 inch PVC, flown on a 65 mm
 * whoop, in somebody's living room.
 *
 * IT IS A PROPERTY OF THE TRACK, not of the pilot and not of the session.
 * A micro course is a different object from a full sized one: different
 * element sizes, a different field, a different grid, different warnings,
 * and a lap that is three seconds rather than thirty. So it is stored in the
 * document, defaulted to 'full' on read so that every track ever written
 * stays exactly what it was, and the builder picks the class for a NEW
 * track from the aircraft the pilot has seated.
 *
 * The class chooses which dims block each element definition below hands to
 * a newly placed instance, and nothing else in this file branches on it.
 * That is deliberate: a micro gate is a gate.
 */
export const TRACK_CLASSES = ['full', 'micro'];
export const TRACK_CLASS_DEFAULT = 'full';

export function trackClassOf(doc) {
  return TRACK_CLASSES.includes(doc?.trackClass) ? doc.trackClass : TRACK_CLASS_DEFAULT;
}

/*
 * The dims a newly placed element of `type` gets on a track of `cls`.
 *
 * Falls back to the full sized block for any element that has no micro
 * variant, which is the right answer for the two that genuinely have none:
 * a label is text and a ground logo is paint, and neither has a size that
 * depends on how big the quad is.
 */
export function defaultDims(type, cls) {
  const def = ELEMENTS[type];
  if (!def) {
    return null;
  }
  if (cls === 'micro' && def.microDims) {
    return { ...def.microDims };
  }
  return { ...def.dims };
}

/*
 * How high off the floor a newly placed element of `type` starts on a track
 * of `cls`. Zero for everything except the horizontal pole, which is a bar
 * in the air by definition and would be a wall on the floor.
 */
export function defaultZ(type, cls) {
  const def = ELEMENTS[type];
  if (!def) {
    return 0;
  }
  if (cls === 'micro' && def.microDefaultZ !== undefined) {
    return def.microDefaultZ;
  }
  return def.defaultZ ?? 0;
}

/* Same, for the default aperture tilt, which the dive gate changes. */
export function defaultPitch(type, cls) {
  const def = ELEMENTS[type];
  if (!def) {
    return 0;
  }
  if (cls === 'micro' && def.microPitch !== undefined) {
    return def.microPitch;
  }
  return def.pitch ?? 0;
}

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
 *   decal      is PAINTED ON THE GROUND. It has a footprint and a heading
 *              and nothing else: no height, no collider, never in the
 *              sequence, and the path warning pass ignores it because a quad
 *              cannot hit paint. A sponsor's logo on the grass is the only
 *              one of these today.
 */
export const KIND = {
  APERTURE: 'aperture',
  MARKER: 'marker',
  OBSTACLE: 'obstacle',
  START: 'start',
  ANNOTATION: 'annotation',
  DECAL: 'decal',
  /*
   * A freestyle asset: a building, a crane, a tree. Solid, never in the
   * sequence, drawn and made solid by src/props from its own layout. Only a
   * freestyle map's palette offers them.
   */
  STRUCTURE: 'structure',
  /*
   * A named gap: a scoring window in the air, like a skate game's. Not
   * solid, not drawn in the world, never in the sequence.
   */
  ZONE: 'zone',
  /*
   * A road: a line of control nodes, eased into a smooth centre line by
   * src/maps/built/road.js, painted on the ground and driven by vehicles.
   * Paint: not solid, never in the sequence. A map's only.
   */
  ROAD: 'road',
  /*
   * A vehicle driving a road, moved by the physics module itself
   * (src/native/world.c section 5): solid, but a mover, so it is never one
   * of the map's static solids and never in the sequence. A map's only.
   */
  VEHICLE: 'vehicle',
};

/*
 * WHAT A DOCUMENT IS FOR. 'race' is every track this builder has made: a
 * flying order, a lap, a clock. 'freestyle' is a map: a place made of
 * assets with no course through it. Stored in the document, written only
 * when it is freestyle so every race track's bytes stay what they were, and
 * a freestyle map is always the full sized class: freestyle is not offered
 * on the whoop (PROGRESS.md, "Freestyle is not offered on a whoop").
 */
export const DOC_MODES = ['race', 'freestyle'];

export function docModeOf(doc) {
  return doc?.mode === 'freestyle' ? 'freestyle' : 'race';
}

/*
 * HOW FAR A FREESTYLE ASSET MAY BE SUNK INTO THE GROUND, in metres. A map
 * builder asked on 1 October 2026 for "the possibility to move objects below
 * ground level to hide some part" (bug-e605ff6a): bury a container's lower
 * half, a pylon's foot, a building's ground floor so its first floor is at
 * street level. The document already held a negative base and every module
 * handled one; the inspector, the height drag in the 3D view and nothing
 * else clamped it at zero, so this is only what those two are told.
 *
 * WHAT A SUNK PART IS. Nothing. The ground is flat at zero on a map and is
 * drawn over everything under it, and the physics holds the part as it
 * holds any other (it bounds no height), but a craft cannot be under the
 * ground, and a box whose top is under the paving is never a surface
 * (indexTops in src/maps/built/place.js). So a part under the ground is
 * neither seen nor met, and the part over it is solid as drawn.
 *
 * Thirty metres is more than any asset needs sunk and a long way short of a
 * hand edited -9999 that would put a building out of reach of its own
 * inspector. Only an ASSET: a gate sunk into the ground is a shorter gate,
 * and a gate's height is what Sill height says, not its base.
 */
export const SINK_MAX = 30;

/* The lowest base an element may have in this document: under the ground
 * for an asset on a map, the ground for everything else. */
export function lowestBase(doc, el) {
  return docModeOf(doc) === 'freestyle' && ELEMENTS[el?.type]?.kind === KIND.STRUCTURE ? -SINK_MAX : 0;
}

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
 * does not spike the ground, and this is the DEFAULT length: a flagged gate
 * carries `flagH` in its own dims so an author can set it. Pole radius is
 * the tube a teardrop sail sleeves onto, not the gate's own PVC.
 */
export const GATE_FLAG_H = 1.45;
export const GATE_FLAG_POLE_R = 0.012;

/*
 * WHERE ON THE HEADER THE MAST STANDS.
 *
 * The owner's report: "a flagged gate should allow me to set the flag gate
 * on top of the actual gate, currently the flag is just ornamental". The
 * three old choices were all at the header's ENDS, so the flag was a corner
 * decoration with no way to put it over the gate at all, and `top` is the
 * missing placement: one mast on the centre of the header board, standing
 * directly over the opening.
 *
 * It is not decoration in the physical sense either, and it is worth saying
 * because the report reads as though it might be: the mast and its whip are
 * both colliders on the race field, so a pennant over the gate is something
 * a pilot can hit while diving onto the top rail. Putting it on top is a
 * course design decision with a consequence, which is what makes it worth
 * offering.
 */
export const FLAG_SIDES = ['left', 'right', 'both', 'top'];

export function normalizeFlagSide(value, fallback = 'left') {
  if (value === 'left' || value === 'right' || value === 'both' || value === 'top') {
    return value;
  }
  return fallback;
}

/*
 * Which header positions carry a pennant, as a fraction of the header's own
 * half width. Left is local -X when facing the gate, right is +X, and TOP is
 * ZERO: dead centre, over the opening. Reading these as a fraction rather
 * than as a bare sign is what lets 0 mean the middle instead of meaning
 * nothing; every drawer multiplies by the half width, so the arithmetic did
 * not have to change to gain a third place to stand.
 */
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
  if (side === 'top') {
    return [0];
  }
  return [];
}

/*
 * Which way a pennant's sail and whip LEAN, given where its mast stands.
 * Outboard from the header on an end mast, and a centre one has no outboard
 * so it takes the right, which is where a single flag hangs by convention.
 * One function because the mesh, the collider and both previews all have to
 * agree: a mast whose cloth hangs one way and whose collider leans the other
 * is the class of bug that only shows up as an invisible wall.
 */
export function flagLeanSign(sign) {
  return sign < 0 ? -1 : 1;
}

export function flagSideOf(el) {
  const def = ELEMENTS[el?.type];
  if (!def) {
    return null;
  }
  if (def.flagSide) {
    return normalizeFlagSide(el.flagSide, def.flagSide);
  }
  /* A piece that MAY carry flags, a hurdle being the one: it has them when it says so and is
   * the piece it always was when it does not, so no existing document changes. */
  if (def.flagsOptional && FLAG_SIDES.includes(el.flagSide)) {
    return el.flagSide;
  }
  return null;
}

/*
 * THE DRESS A GATE WEARS BESIDE THE MULTIGP ONE.
 *
 * A MultiGP gate in the world is a printed sleeve round each upright and a
 * header board a good deal wider than the frame, which is what a sponsor's
 * mark goes on. That is right for a gate standing on its own and wrong for a
 * wall of them: the sleeves of neighbours land in each other's openings and the
 * boards overlap by most of a metre. `plain` is the other dress: no sleeves, a
 * header board exactly as wide as the frame, so a pennant on the header stands
 * on the upright it belongs over and bays sit end to end. It is an optional
 * field written only when set, so every gate that exists is the MultiGP one and
 * serialises to the bytes it did. Only a vertical, square gate has a dress at
 * all: a tilted one is carried on a mast and a ring or a hexagon has no
 * uprights to sleeve.
 */
export const GATE_STYLES = ['plain'];

export function isPlain(el) {
  return Boolean(el) && el.style === 'plain' && ELEMENTS[el.type]?.kind === KIND.APERTURE
    && apertureShapeOf(el) === 'square';
}

/*
 * WHERE A ROW OF GATES HAS TO STAND FOR ITS UPRIGHTS TO MEET IN THE WORLD.
 *
 * The document holds the published sizes and the field builds every gate GATE_SCALE
 * times larger, while positions are never scaled (src/game/trackdoc.js builtDims). Two
 * gates that share an upright therefore have to be that much further apart than one
 * opening plus one tube says, or the one's built upright stands inside the other's
 * opening. The builder draws document sizes, so in it the bays of a wall show a gap of
 * about a quarter of a metre that the world does not have, and the Wall tool says so.
 */
export function wallPitchFor(dims, cls = TRACK_CLASS_DEFAULT) {
  const scale = cls === 'micro' ? 1 : GATE_SCALE;
  return scale * ((dims?.clearW ?? 0) + FRAME_TUBE_OD);
}

/*
 * AN OPENING THAT IS A GAP IN THE LATTICE RATHER THAN A GATE OF ITS OWN.
 *
 * Every aperture here builds its own four sided frame, which is what a
 * MultiGP gate is and what RaceGOW's rule 2 asks for: "All gates must be
 * fully enclosed." The official RaceGOW5 tracks are not built that way
 * throughout. A bar on two legs with one leg carried up as a pole makes two
 * scored openings, one under the bar and one over it, and the one over it
 * has a bar below and a pole beside and NOTHING ELSE. Drawing a frame there
 * puts two lengths of PVC in mid air that the real track does not have, one
 * of them straight through the flight path, and it boxes in a pole that is
 * meant to be flown around.
 *
 * So an aperture can say that nothing is built for it: the pipe that bounds
 * the opening belongs to the structures around it, and this element is the
 * hole. It still scores, still lights, still carries its number and still
 * pins the racing line. It just has no pipe of its own.
 *
 * Every renderer reads this ONE function, so the game, the exporter, the
 * builder's preview and the course card cannot disagree about which
 * openings have a frame.
 */
export function isUnbuilt(el) {
  if (!el || el.unbuilt !== true) {
    return false;
  }
  return ELEMENTS[el.type]?.kind === KIND.APERTURE;
}

/*
 * ONE SIDE OF THE FRAME AT A TIME.
 *
 * The owner's words: "delete sides of a gate, one pole at a time, this will
 * allow me to create a virtual gate so the trigger area remains but the
 * poles are not there. so each gate should have 4 deletable poles". So
 * `unbuilt` above is the all or nothing case, and this is the finer one:
 * an aperture can leave any of its four sides without a pipe, and the
 * opening still scores, still lights and still pins the racing line.
 *
 * FOUR SIDES PER STRUCTURE, NOT PER OPENING, because that is how the game
 * builds one (src/render/scene.js obstacle): two uprights from the ground to
 * the top rail, a member over the top opening, and a member under the
 * lowest opening when it is off the ground. 'left' and 'right' are those
 * two uprights, the whole height of a stack unless a stretch is taken alone (unbuiltPolesOf below); 'top' is the member over the
 * top opening and 'bottom' the one under the lowest. A member BETWEEN two
 * openings of a stack holds both of them up and is not one of the four.
 *
 * Left and right are the builder's flag convention, as seen facing the
 * gate: 'left' is the -widthAxis side and 'right' the +widthAxis side of
 * apertureFrame, 'top' is +heightAxis and 'bottom' -heightAxis. The game
 * builds each gate facing its first pass, which mirrors that for a gate
 * flown along its normal, so src/game/trackdoc.js turns these into the
 * mesh's own frame once, and nothing downstream reads left or right again.
 *
 * Stored as a list of the MISSING sides, in this order, and written only
 * when it is not empty, so every gate that has all four is the same bytes
 * it was before this existed. Every renderer reads frameSidesOf, the same
 * discipline isUnbuilt keeps.
 */
export const FRAME_SIDES = ['top', 'bottom', 'left', 'right'];

/* A list of missing sides, cleaned: known names only, each once, in
 * FRAME_SIDES order. Anything that is not an array reads as none. */
export function normalizeUnbuiltSides(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return FRAME_SIDES.filter((side) => raw.includes(side));
}

/* The sides of an aperture that have no pipe. Empty for anything that is
 * not an aperture, and all four for an opening that is a gap in the
 * lattice. */
export function unbuiltSidesOf(el) {
  if (!el || ELEMENTS[el.type]?.kind !== KIND.APERTURE) {
    return [];
  }
  if (isUnbuilt(el)) {
    return [...FRAME_SIDES];
  }
  /* A ring and a hexagon have no four sides to take away one at a time, so a list left on a
   * piece that was a gate before it was replaced is inert, and is there if it goes back. */
  if (apertureShapeOf(el) !== 'square') {
    return [];
  }
  return normalizeUnbuiltSides(el.unbuiltSides);
}

/* Which of the four sides are built, as booleans. */
export function frameSidesOf(el) {
  const missing = unbuiltSidesOf(el);
  return {
    top: !missing.includes('top'),
    bottom: !missing.includes('bottom'),
    left: !missing.includes('left'),
    right: !missing.includes('right'),
  };
}

/*
 * A LENGTH OF FRAME PIPE, NOT A RACE PIECE.
 *
 * A pole is red because it is flown round, and a horizontal pole stands on two legs of its
 * own because it is a hurdle. A track drawn in TinyLaps (src/trackbuilder/importtinylaps.js)
 * is a frame of PVC whose uprights and bars hold the openings up, so its pipe is neither: an
 * upright there is white and is not passed on a side, and a bar there rests on the uprights
 * already under it, where legs of its own would stand in the middle of the arches. So a pole
 * or a horizontal pole can say `pvc: true`, and is then drawn in the frame's white and built
 * with no legs, by every renderer through this one function. Written only when true, so
 * every pole and hurdle that exists is the JSON it was.
 */
export const PVC_TYPES = ['pole', 'horizontalPole'];

export function isPvcPipe(el) {
  return Boolean(el) && el.pvc === true && PVC_TYPES.includes(el.type);
}

/* True when some side has been taken away one at a time, or one opening's stretch of an upright
 * has. A gap in the lattice answers false: it has its own flag and its own code path. */
export function hasMissingSides(el) {
  return !isUnbuilt(el) && (unbuiltSidesOf(el).length > 0 || unbuiltPolesOf(el).length > 0);
}

/*
 * ONE OPENING'S STRETCH OF AN UPRIGHT, in a stack.
 *
 * The owner's words, 2026-10-04: with a double or triple stacked gate, deleting a vertical side "should only
 * remove that gates pole not the entire vertical pole for the entire 2 or 3 gates". So on a stack the
 * uprights are not one pipe each but one stretch per opening, and a stretch can go on its own.
 *
 * `unbuiltPoles` is a list of "side:index" strings, side being left or right as everywhere here and index
 * the opening from the bottom, 0 first. It is the finer spelling of `unbuiltSides`, which still takes the
 * whole upright away and wins over it: a stretch whose whole upright is already gone is not written. When
 * every stretch of one upright has gone the upright is gone, and that is written the old way, so a document
 * says one thing one way. Only a stack of square openings has it; the key is written only when it is not
 * empty, so every gate that exists is the JSON it was.
 */
export const POLE_SIDES = ['left', 'right'];

export function poleKey(side, index) {
  return `${side}:${index}`;
}

/* The stretches taken away, cleaned against this piece: a stack, a known side, an opening it has, each once, and
 * nothing the whole upright already covers. Ordered by side then opening. */
export function unbuiltPolesOf(el) {
  if (!el || ELEMENTS[el.type]?.kind !== KIND.APERTURE || isUnbuilt(el) || isLetterPiece(el)
    || apertureShapeOf(el) !== 'square' || !Array.isArray(el.unbuiltPoles)) {
    return [];
  }
  const count = apertureLevels(el.dims).length;
  if (count < 2) {
    return [];
  }
  const whole = normalizeUnbuiltSides(el.unbuiltSides);
  const out = [];
  for (const side of POLE_SIDES) {
    if (whole.includes(side)) {
      continue;
    }
    for (let i = 0; i < count; i += 1) {
      if (el.unbuiltPoles.includes(poleKey(side, i))) {
        out.push(poleKey(side, i));
      }
    }
  }
  return out;
}

/* Whether a whole upright is there, every stretch of it. The printed sleeve hangs on this and not on a stretch: it is
 * one board the height of the stack, so an upright with a stretch gone has no sleeve. */
export function uprightIntact(el, side) {
  return frameSidesOf(el)[side] && !unbuiltPolesOf(el).some((k) => k.startsWith(`${side}:`));
}

/* Whether one opening's stretch of one upright is built. A whole upright that is gone takes every stretch with it. */
export function poleBuilt(el, side, index) {
  return frameSidesOf(el)[side] && !unbuiltPolesOf(el).includes(poleKey(side, index));
}

/*
 * How much wider than the clearance corridor a marker's scoring square is,
 * metres, and the narrowest one that may ever be built.
 *
 * THE PAD IS ADDED ENTIRELY ON THE OUTER SIDE. The square's inner edge is
 * on the pole and it has to stay there: an inner edge past the pole would
 * score a pass flown on the wrong side of the flag, which is the one thing
 * a turn marker exists to prevent. So the width grows away from the
 * obstacle, and virtualApertureDims reports how far the square's centre
 * therefore sits beyond the racing-line knot.
 *
 * The owner's words: "extend the virtual gate width of a flag, so the user
 * doesn't have to fly so close to the flag". A 1.5 m clearance used to
 * yield a 3.0 m square whose far edge was 3.0 m off the pole; it now
 * yields 4.5 m and 4.5 m, so the same line flown a metre and a half wide of
 * the flag still scores. Nothing about which SIDE is passed has moved.
 */
export const MARKER_GATE_PAD = 1.5;
export const MARKER_GATE_MIN_W = 3.0;

/*
 * The same two on a micro track, and this is the single largest scale error
 * a RaceGOW course would have had: a 3 m minimum scoring square, in a room
 * that is 5 m across, around a pole 27 mm thick.
 *
 * Sized against RaceGOW's own pole rule rather than by dividing the full
 * sized numbers by something. The diagrams dimension a pole at 14 in from
 * the centre of a gate, which is the distance the course is designed around,
 * so the pad is that 14 in and the floor is twice it. That is the same
 * relationship the full sized pair has to a flag's 1.5 m clearance, arrived
 * at from the other end.
 *
 * They are separate constants rather than a ratio applied to whatever
 * clearance an element declares, deliberately: deriving them would change
 * the square on every full sized track whose author edited a clearance, and
 * some of those tracks are published with times on them.
 */
export const MICRO_MARKER_GATE_PAD = POLE_FROM_GATE_MIN;
export const MICRO_MARKER_GATE_MIN_W = POLE_FROM_GATE_MIN * 2;

/*
 * The scoring square a flag or a cone assigns on its pass side.
 *
 * Width is the clearance corridor plus MARKER_GATE_PAD, never less than
 * MARKER_GATE_MIN_W, with the inner edge still on the pole. Height is at
 * least that wide, and at least as tall as the marker, so a 2.5 m flag is
 * not scored by a waist-high slot. Waypoints keep a clearance of zero and
 * do not get one of these: they pin the line, they are not a hole.
 *
 * `outward` is how far the square's CENTRE sits beyond the racing line
 * knot, along the pass direction, which is what keeps the inner edge on the
 * pole while the width grows. Every drawer and the game read it, so the
 * plan, the preview and the race field cannot disagree about where the
 * square is.
 */
export function virtualApertureDims(el, seq, cls = TRACK_CLASS_DEFAULT) {
  const clearance = Math.max(0, seq?.clearance ?? el?.dims?.clearance ?? 0);
  const micro = cls === 'micro';
  const pad = micro ? MICRO_MARKER_GATE_PAD : MARKER_GATE_PAD;
  const minW = micro ? MICRO_MARKER_GATE_MIN_W : MARKER_GATE_MIN_W;
  const clearW = Math.max(minW, clearance * 2 + pad);
  const poleH = Math.max(0, el?.dims?.height ?? 0);
  const clearH = Math.max(clearW, poleH);
  return {
    clearW,
    clearH,
    sillH: 0,
    centerH: clearH * 0.5,
    outward: clearW * 0.5 - clearance,
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
    /* RaceGOW Single Gate, or the Start/Finish Gate, which is the same
     * object drawn green. The bar is ON THE FLOOR because rule 2 says a gate
     * must be fully enclosed and the floor cannot act as a side of it, which
     * puts the centre at 356 mm, well under the 508 mm rule 4 allows. */
    microDims: {
      levels: 1, sillH: 0,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
    },
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
    note: 'Standard square gate with a pennant on the header. Put it left, right, both ends or on top, and set how tall the mast is.',
    /* Same 5 ft opening as `gate`. The pennant is dress on the header, not
     * a second sequence marker: the hole is still one gate.
     * VERIFY: nothing on multigp.com dimensions a header flag. 1.45 m of
     * mast above the board is the tool's own length, written once as
     * GATE_FLAG_H and offered here as an editable default. */
    pitch: 0,
    dims: {
      levels: 1, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD,
      flagH: GATE_FLAG_H,
    },
    /* A pennant on a whoop gate is a real thing people build, and the mast
     * is a third of the full sized one because everything else is. */
    microDims: {
      levels: 1, sillH: 0,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
      flagH: 0.42,
    },
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
    /* RaceGOW Double Stacked Gates. At the nominal 762 mm pitch the second
     * opening's centre lands at 1118 mm, which clears rule 5's 1067 mm
     * floor, and the 762 itself is inside rule 3's 686 to 838 band. Both
     * rules are satisfied by one number, which is why 30 inches is the
     * number every diagram uses. */
    microDims: {
      levels: 2, sillH: 0,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
    },
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
    note: 'Two standard gates stacked, with a pennant on the top header. Put it left, right, both ends or on top, and set how tall the mast is.',
    pitch: 0,
    dims: {
      levels: 2, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD,
      flagH: GATE_FLAG_H,
    },
    microDims: {
      levels: 2, sillH: 0,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
      flagH: 0.42,
    },
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
    /* RaceGOW Triple Gate Stack. Third opening's centre at 1880 mm, over
     * rule 5's 1753 mm floor, and the top of the frame at 2235 mm, which is
     * under a 2.4 m domestic ceiling with 165 mm to spare. That margin is
     * why a triple is the tallest thing on a RaceGOW track. */
    microDims: {
      levels: 3, sillH: 0,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
    },
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
    /* RaceGOW Elevated Gate: ONE opening, carried above the ground gates,
     * "bottom of gate must be a minimum 56 inches above the ground". One
     * rather than two because that is what the Track8 diagram draws and
     * because a second opening at 56 plus 30 inches would put its top at
     * 2.53 m, through the ceiling. */
    microDims: {
      levels: 1, sillH: ELEVATED_SILL_MIN,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
    },
  },
  diveGate: {
    id: 'diveGate',
    label: 'Dive gate',
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
    /* RaceGOW Horizontal Gate, also called a Cube Gate: the same square
     * opening laid flat. 15 ft of elevation is a five inch's dive gate; a
     * whoop's is at 900 mm, which is chest height and is where the official
     * builds put one, because the ceiling is 2.4 m and you have to get above
     * it to drop through it. */
    microDims: {
      levels: 1, sillH: 0.900,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
    },
  },
  hoop: {
    id: 'hoop',
    label: 'Hoop',
    group: 'track',
    kind: KIND.APERTURE,
    shape: 'circle',
    note: 'A round gate. The opening is the circle inside the box a square gate would have, so the corners of the box do not score.',
    /* Not a MultiGP element and not on the five inch palette: it is here for a whoop room, where
     * people do stand a ring on a stand. The five inch default only has to exist, so that a
     * document that names a hoop on a field is drawn and not thrown away. */
    pitch: 0,
    dims: { levels: 1, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD },
    /* The same opening as the RaceGOW gate it stands in for, so the series' rules about how big
     * an opening may be, and how far apart two are, read a hoop exactly as they read a gate. A
     * ring the width of the opening is a ring the pilot flies through at the gate's own size. */
    microDims: {
      levels: 1, sillH: 0,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
    },
  },
  hexGate: {
    id: 'hexGate',
    label: 'Hex gate',
    group: 'track',
    kind: KIND.APERTURE,
    shape: 'hex',
    note: 'A six sided gate, a point at each end of its width and a flat above and below. The opening is the hexagon inside its box.',
    pitch: 0,
    dims: {
      levels: 1, sillH: 0, clearW: 5 * FT, clearH: 5 * FT * HEX_HEIGHT_RATIO,
      levelPitch: 5 * FT * HEX_HEIGHT_RATIO + FRAME_TUBE_OD,
    },
    /* Six pipes of one length make a regular hexagon: across the points it is twice a pipe and
     * flat to flat it is a pipe times the square root of three, so the width is the gate's own
     * opening and the height is that times 0.866. */
    microDims: {
      levels: 1, sillH: 0,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT * HEX_HEIGHT_RATIO,
      levelPitch: GATE_SPACING_NOMINAL,
    },
  },
  /*
   * A CAPITAL LETTER OF PIPE, WITH THE GAPS IN IT TO FLY THROUGH. The WA State Champs have a W on the course
   * and its gate is the gap between the two Vs; a letter is that in general, every capital from A to Z
   * (src/props/letters.js draws them), each with one to three holes that score. Which letter it is is the
   * element's own `letter`, a word of one capital, and the shape of the holes is the letter's, so the document
   * holds no polygon to get wrong.
   *
   * IT KEEPS THE FIVE NUMBERS OF EVERY OPENING. clearW and clearH are the size of its PRIMARY hole measured
   * axis to axis, and the whole letter is drawn round that hole in the proportions of the design, so the
   * envelope, the rules, the cards and the board's plan, which read those two numbers and nothing else, read a
   * letter as they read a gate. `levels` is how many holes the letter has (the reader sets it from the letter),
   * `sillH` is zero because a letter stands on the ground, and `levelPitch` means nothing and is kept so that
   * what reads it finds a number. The defaults here are the default letter's.
   *
   * A FIVE INCH RACE PIECE: not on the whoop palette and not on a map. Upright (its pitch is zero), and its pipe
   * is the gate's pipe.
   */
  letter: {
    id: 'letter',
    label: 'Letter',
    /* No key of its own: the free ones on the five inch palette are an asset's on a map (the self test pins that the
     * race palettes' keys are what they were), so the chip is empty and the tool is a click. */
    key: '',
    group: 'track',
    kind: KIND.APERTURE,
    shape: 'letter',
    note: 'A capital letter built of pipe, with the gaps in it to fly through: every letter from A to Z. Pick the letter under the tool. A W is the gap between its two Vs; an A has its counter and the space under the bar. Each gap is a gate of its own in the flying order.',
    pitch: 0,
    dims: {
      levels: openingCount(LETTER_DEFAULT),
      sillH: 0,
      clearW: letterDefaults(LETTER_DEFAULT).clearW,
      clearH: letterDefaults(LETTER_DEFAULT).clearH,
      levelPitch: levelPitchFor(letterDefaults(LETTER_DEFAULT).clearH),
    },
  },
  barrier: {
    id: 'barrier',
    label: 'Barrier',
    key: 'B',
    group: 'track',
    kind: KIND.OBSTACLE,
    note: 'Solid obstacle. Not flown through. Collision geometry only. The Hurdle on the palette is a low one with flags at its ends.',
    /* A barrier MAY carry the pennants a gate carries, at the ends of its top: `flagSide` on
     * the piece and the mast height as `dims.flagH`, both written only when it has them. That
     * is the whole of what a hurdle is. See flagSideOf. */
    flagsOptional: true,
    /* Not a MultiGP obstacle. A barrier is the tool's way of saying "the
     * racing line must not go here": a shipping container, a fence, a stand.
     * The default is a 4 m by 1 m panel 2 m tall, which is a plausible crowd
     * barrier and is only a starting size. */
    dims: { width: 4, depth: 1, height: 2 },
    /* A living room's furniture. A sofa is about this, and a sofa is the
     * commonest obstacle on a RaceGOW track by a wide margin. */
    microDims: { width: 1.8, depth: 0.85, height: 0.75 },
  },
  /*
   * THE FURNITURE OF A ROOM, which a RaceGOW track is flown round and under and
   * until now had a barrier to stand in for. Each is a solid obstacle like the
   * barrier, holds a width, a depth and a height like the barrier, and is made
   * of the boxes src/props/room.js writes down, so what is drawn, what is
   * solid and what the warnings test are one list. They stand on the floor, are
   * never in the flying order, and turn in quarter turns because the physics
   * holds boxes square to the room. There is no hotkey: the letters ran out.
   * The sizes are what a living room has in it and are RaceGOW's own only in
   * that the rules leave the room to the builder.
   */
  table: {
    id: 'table',
    label: 'Table',
    group: 'track',
    kind: KIND.OBSTACLE,
    turns: 'quarter',
    note: 'A table: a top on four legs. Solid, and there is room to fly under it between the legs. It stands on the floor.',
    dims: { ...ROOM_SIZES.table },
    microDims: { ...ROOM_SIZES.table },
  },
  chair: {
    id: 'chair',
    label: 'Chair',
    group: 'track',
    kind: KIND.OBSTACLE,
    turns: 'quarter',
    note: 'A chair: a seat on four legs and a solid back, which is behind it as it faces. It stands on the floor.',
    dims: { ...ROOM_SIZES.chair },
    microDims: { ...ROOM_SIZES.chair },
  },
  banner: {
    id: 'banner',
    label: 'Banner',
    group: 'track',
    kind: KIND.OBSTACLE,
    turns: 'quarter',
    note: 'A standing banner: a thin solid panel on two feet, down to the floor. It stands on the floor.',
    dims: { ...ROOM_SIZES.banner },
    microDims: { ...ROOM_SIZES.banner },
  },
  flag: {
    id: 'flag',
    label: 'Flag',
    key: 'F',
    group: 'track',
    kind: KIND.MARKER,
    note: 'Turn marker. The pass side is a virtual gate: a green square beside the pole that has to be flown through. Its inner edge is on the pole and it reaches past the clearance, so you do not have to shave the flag.',
    /* "Split-S Gate: flag placement 1.5 ft behind and to the side of the
     * gate" is the only flag dimension MultiGP publishes, and it is an
     * offset rather than a flag. A turn flag on a course is a pole with a
     * banner; 2.5 m of pole is the common build. The clearance radius is the
     * tool's own number: how far off the pole the racing line is drawn.
     * VERIFY: whether MultiGP dimensions a standalone turn flag at all. */
    dims: { height: 2.5, poleRadius: 0.025, clearance: 1.5 },
    /* A pennant on a whoop track is dress, and the mast is a length of the
     * same 3/4 inch pipe everything else is built from. The clearance is
     * RaceGOW's own 14 inch pole rule, which is the distance the diagrams
     * dimension from a gate centre to a pole. */
    microDims: { height: 0.90, poleRadius: PIPE_OD / 2, clearance: POLE_FROM_GATE_MIN },
  },
  cone: {
    id: 'cone',
    label: 'Cone',
    key: 'C',
    group: 'track',
    kind: KIND.MARKER,
    note: 'Ground marker. The pass side is a virtual gate, exactly the same as a flag: same clearance, same square, same scoring.',
    /* A standard traffic cone: 28 in tall on a 14 in square base. Not a
     * MultiGP dimension, a highway one, and near enough for a ground marker.
     * VERIFY: nothing on multigp.com, this is a road cone.
     *
     * THE CLEARANCE IS THE FLAG'S, 1.5 m, and it used to be 1.0. The owner
     * asked for cones to "function the same as a flag, a larger gate around
     * the cone to trigger a pass", and the machinery was already identical:
     * a cone is a MARKER, it takes a knot at the clearance radius and it
     * scores through the same virtual square. What was not the same was
     * this number, so a cone gave a 2.0 m hole where a flag gave 3.0 and
     * the two markers a course mixes flew differently for no reason an
     * author could see. The cone is SHORTER than a flag and that is fine:
     * virtualApertureDims floors the height at the square's own width, so
     * a 0.71 m cone is not scored by a knee-high slot. */
    dims: { height: 28 * IN, baseRadius: 7 * IN, clearance: 1.5 },
    /* A whoop sized marker cone, the kind sold for indoor courses: 100 mm
     * tall on a 60 mm base. Same clearance as the flag, for the same reason
     * the full sized pair share one. */
    microDims: { height: 0.100, baseRadius: 0.030, clearance: POLE_FROM_GATE_MIN },
  },
  waypoint: {
    id: 'waypoint',
    label: 'Waypoint',
    key: 'W',
    group: 'track',
    kind: KIND.MARKER,
    note: 'Nothing is standing here. The line is required to pass through this point, at this height. Not drawn on the track.',
    /* Nothing is built, so nothing can float: its height is where the line
     * passes, and it may be anywhere. See needsSeat in ./seat.js. */
    standsFree: true,
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
    /* Clearance stays ZERO. It is zero because a waypoint pins the line to a
     * point, and a point does not get smaller. */
    microDims: { height: 0.35, poleRadius: 0.008, clearance: 0 },
  },
  /*
   * SIDE BY SIDE GATES ARE NOT AN ELEMENT HERE, and it is worth writing down
   * why, because RaceGOW's diagrams draw them as one.
   *
   * They would need a lateral offset inside an aperture structure, and every
   * opening this builder has ever had is offset VERTICALLY: apertureLevels,
   * apertureCenter, entryAnchor, the 2D plan, the 3D frames and the sequence
   * editor all read a level's sill and centre height and nothing else. A
   * horizontal sibling means a new axis through all six.
   *
   * What a side by side actually IS, physically, is two gates 30 inches
   * apart that happen to share a vertical pipe. So it is two gates, and the
   * thing that makes it a RaceGOW side by side rather than two gates near
   * each other is rule 3, the 27 to 33 inch centre to centre band. That rule
   * is checked, on every pair of gates on a micro track, by
   * src/trackbuilder/warnings.js. The tool holds the rule; the author places
   * the second gate.
   *
   * If a compound placement is wanted later, app.js's place path is where it
   * goes, beside the auto sequencing it already does for a stack.
   */

  /*
   * VERTICAL POLE. RaceGOW's own element, a bare length of pipe stood on
   * end and flown around, drawn as a red dot in plan on every diagram.
   *
   * It is a MARKER, which is the builder's word for "passed on one side at a
   * clearance radius, and the pass side is a virtual gate". That is exactly
   * what a pole is, and it means the existing scoring, the existing racing
   * line and the existing warnings all work on one without a line of new
   * code. It is not `flag` because a flag has a pennant and a pole has not,
   * and the diagrams distinguish them.
   */
  pole: {
    id: 'pole',
    label: 'Pole',
    /* U for upright, not P. P has been the racing line toggle since before
     * this element existed and the key handler answers it first, so a pole
     * on P was a hotkey the palette advertised and the keyboard never
     * delivered: pressing it hid the line. */
    key: 'U',
    group: 'track',
    kind: KIND.MARKER,
    note: 'A bare upright pipe, flown around on one side. The pass side is a virtual gate, the same as a flag.',
    dims: { height: 2.5, poleRadius: 0.025, clearance: 1.5 },
    microDims: { height: 1.500, poleRadius: PIPE_OD / 2, clearance: POLE_FROM_GATE_MIN },
  },
  /*
   * HORIZONTAL POLE. The other RaceGOW element with no existing equivalent:
   * a single bar across the course, on two legs, flown over or under.
   *
   * An OBSTACLE rather than a marker or an aperture, and the choice is the
   * honest one: it is solid, the racing line must not go through it, and
   * nothing about it says which side of it the lap goes. The Track6 diagram
   * labels one "off upper grid", which is a track designer telling pilots to
   * go under, and that is a matter for the flying order rather than for the
   * element.
   */
  horizontalPole: {
    id: 'horizontalPole',
    label: 'Horizontal pole',
    key: 'Z',
    group: 'track',
    kind: KIND.OBSTACLE,
    note: 'A single bar across the track on two legs. Solid: fly over it or under it.',
    dims: { width: 3.0, depth: 0.08, height: 0.08 },
    /* Its legs reach down to the ground from the bar (hpoleLayout in
     * src/props/course.js), so position.z is the bar's height and not a base
     * with nothing under it. See needsSeat in ./seat.js. */
    standsFree: true,
    defaultZ: 1.60,
    /* One pipe section wide and one pipe thick, raised to where a RaceGOW
     * build puts one: a shade under the second gate of a stack, so the two
     * together make a slot. defaultZ is how high a NEWLY PLACED one starts;
     * an obstacle is drawn from its own position.z upward, so this is a bar
     * in the air rather than a wall, which is what a horizontal pole is. */
    microDims: { width: GATE_SPACING_NOMINAL, depth: PIPE_OD, height: PIPE_OD },
    microDefaultZ: 0.950,
  },
  startPads: {
    id: 'startPads',
    label: 'Start pads',
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
    /*
     * ONE PAD, and that is not a scaled down grid, it is the format.
     *
     * MultiGP runs heats of four and the full sized default is that starting
     * grid. RaceGOW has no heats at all: "every pilot flies alone at home",
     * and the whole competition is an asynchronous time trial. Four stands
     * on a RaceGOW start line would be four stands nobody is standing on.
     */
    microDims: { pads: 1, spacing: 0.30, padSize: 0.10 },
  },
  label: {
    id: 'label',
    label: 'Label',
    key: 'L',
    group: 'extra',
    kind: KIND.ANNOTATION,
    note: 'Text annotation on the field. Not part of the track.',
    /* Text height is a drawing size, not a course size, but it is a length
     * in metres on the field and so it lives here with the rest. */
    dims: { textHeight: 0.9 },
  },
  groundLogo: {
    id: 'groundLogo',
    label: 'Ground logo',
    key: 'O',
    group: 'extra',
    kind: KIND.DECAL,
    /* Which of the course's logos this one wears, as the id of an entry in
     * branding.logos. An element field like a label's text, not a
     * dimension. Empty means the first logo the course carries, so a decal
     * dropped on a course with one sponsor needs no further decision. */
    logoId: '',
    note: 'A sponsor logo painted on the grass. Pick which of the logos it wears, and its size, in the inspector.',
    /*
     * The footprint the logo is fitted inside, width along the element's own
     * heading and depth across it, the same way a barrier reads. Ten by four
     * is a wide sponsor board's proportions laid flat, which is the shape
     * most logos arrive in; the inspector resizes it and a square logo
     * fitted inside it simply paints square and smaller.
     */
    dims: { width: 10, depth: 4 },
  },
};

/*
 * THE SPACING BETWEEN TWO OPENINGS OF A STACK, derived rather than typed.
 *
 * Two openings share ONE cross member, so the distance from one sill to the
 * next is one clear height plus one tube diameter. Every default in the
 * library above is this expression, and the inspector uses it to keep a
 * resized stack sensible: change a gate's opening height and its levels
 * would otherwise stay at whatever spacing the old height implied, which
 * either overlaps the frames or leaves a gap of nothing between them.
 *
 * An author can still type any spacing they like. This is the number the
 * tool offers, not a number it enforces.
 */
/*
 * THE FREESTYLE ASSETS JOIN THE TABLE, generated from src/props/types.js so
 * the two cannot disagree. `propGroup` is the palette heading; `turns` says
 * whether the rotate handle snaps to quarter turns.
 */
for (const [id, t] of Object.entries(PROP_TYPES)) {
  ELEMENTS[id] = {
    id,
    label: t.label,
    key: t.key,
    group: 'freestyle',
    propGroup: t.group,
    kind: t.zone ? KIND.ZONE : KIND.STRUCTURE,
    turns: t.turns,
    tilt: t.tilt ?? null,
    styles: t.styles ?? null,
    note: t.note,
    dims: { ...t.dims },
    limits: t.limits,
    labels: t.labels,
  };
}

/*
 * ROADS AND VEHICLES (Stage E, FREESTYLE-MAPS-PLAN.md sections 5 and 8), a
 * map's only: normalize drops them from a race track, where no car drives
 * (the plan's decision 9). A map's palette offers both, under Roads and
 * vehicles (ROAD_PALETTE below), and src/trackbuilder/roadtool.js is how
 * they are laid, edited and placed. Their fields are in schema.md, under
 * Roads and vehicles.
 *
 *   road     `nodes`, control points RELATIVE TO `position`, so dragging a
 *            road moves its position and nothing else; `closed`; and in
 *            dims its width, its lanes (1 or 2) and the radius its bends are
 *            eased to where the nodes leave room. Paint on the ground: its
 *            position.z, yaw and pitch are written 0 and never read.
 *   vehicle  `road`, the id of the road element it drives; `style`, which
 *            of the town's cars; `reverse`, true to drive against the node
 *            order; `drift`, true for the drift car; and in dims its
 *            `offset`, metres along the road's centre line from its first
 *            node where it is at the clock's step 0, its top `speed` in m/s,
 *            and `variant`, its colour. Where it is comes from its road and
 *            its offset and nothing else, so its position, yaw and pitch
 *            are written 0 and never read: a second copy of where a car is
 *            would be a field derived from another.
 *
 * `limits` is the props' format ({ key: [min, max, kind] }, see
 * src/props/types.js), applied on read and on write by clampByLimits.
 * `speed` is a speed, not a length: m/s. A vehicle's speed starts at its
 * style's (STYLE_DIMS in src/props/types.js), as a building's size does.
 */
ELEMENTS.road = {
  id: 'road',
  label: 'Road',
  key: '',
  group: 'freestyle',
  propGroup: 'roads',
  kind: KIND.ROAD,
  styles: null,
  note: 'A road. Click to lay its nodes, click the first node to close it into a loop, or press Enter or double click to finish it open. Its bends are eased into curves a car can drive. Vehicles drive on it.',
  dims: { width: 6, lanes: 2, radius: 12 },
  limits: { width: [3, 20, 'm'], lanes: [1, 2, 'int'], radius: [2, 60, 'm'] },
  labels: { width: 'Width', lanes: 'Lanes', radius: 'Bend radius' },
};
ELEMENTS.vehicle = {
  id: 'vehicle',
  label: 'Vehicle',
  key: '',
  group: 'freestyle',
  propGroup: 'roads',
  kind: KIND.VEHICLE,
  styles: CAR_STYLES,
  note: 'A car driving a road, lap after lap of a loop, out and back along an open road. Put it on a road and slide it to where it starts. Drift makes it the drift car.',
  dims: { offset: 0, speed: 12, variant: 1 },
  limits: { offset: [0, 10000, 'm'], speed: [1, 50, 'm/s'], variant: [1, 99, 'int'] },
  labels: { offset: 'Start', speed: 'Top speed', variant: 'Variant' },
};

/* The most nodes a road keeps, and how far from its position a node may
 * be, m. A road longer than the module holds is refused by
 * src/maps/built/traffic.js, with a problem, rather than cut here. */
export const ROAD_NODES_MAX = 512;
export const ROAD_NODE_REACH = 100000;

/* Whether a type is a road or a vehicle: a map's only, never a solid of
 * the map's, never in the sequence. */
export function isTrafficType(type) {
  const k = ELEMENTS[type]?.kind;
  return k === KIND.ROAD || k === KIND.VEHICLE;
}

/* A dimension clamped into a definition's own limits, a count rounded.
 * Never throws: a value that is not a number is the default. */
export function clampByLimits(def, key, value) {
  const lim = def?.limits?.[key];
  const fallback = def?.dims?.[key] ?? 0;
  let v = Number(value);
  if (!Number.isFinite(v)) {
    v = fallback;
  }
  if (!lim) {
    return v;
  }
  if (lim[2] === 'int') {
    v = Math.round(v);
  }
  return Math.min(lim[1], Math.max(lim[0], v));
}

export function levelPitchFor(clearH) {
  return clearH + FRAME_TUBE_OD;
}

/*
 * NAMED OPENING SIZES, so an author does not have to type 1.524 twice per
 * gate.
 *
 * The owner's report: "for the track editor, include preset gate sizes so
 * the user doesn't have to customise each gate placement." Three of these
 * four are MultiGP's own published openings, quoted from the same page
 * src/game/track.js quotes and carrying the same VERIFY caveat as the rest
 * of this file. The fourth is not, and says so: a course for somebody's
 * first hour needs a hole a beginner can hit, and pretending an oversize
 * gate is in a rulebook would be worse than offering it honestly.
 *
 * Applying one sets the opening AND the level spacing, because a stack
 * whose spacing does not follow its opening height is a stack with its
 * frames overlapping or with a metre of air between them.
 */
export const GATE_PRESETS = [
  {
    id: 'standard',
    label: 'Standard',
    size: '5 x 5 ft',
    published: true,
    hint: 'The MultiGP chapter gate, 5 ft by 5 ft. The size the whole world is scaled against.',
    clearW: 5 * FT,
    clearH: 5 * FT,
  },
  {
    id: 'championship',
    label: 'Championship',
    size: '7 x 6 ft',
    published: true,
    hint: 'MultiGP championship size, 7 ft wide by 6 ft high. What a dive gate and a launch gate are built at.',
    clearW: 7 * FT,
    clearH: 6 * FT,
  },
  {
    id: 'whoop',
    label: 'Whoop',
    size: '19 x 19 in',
    published: true,
    hint: 'Tiny whoop size, 19 in square. For an indoor scale track flown on a 65 mm machine.',
    clearW: 19 * IN,
    clearH: 19 * IN,
  },
  {
    id: 'wide',
    label: 'Wide',
    size: '2 m bay',
    published: false,
    hint: 'Not a MultiGP size. About 2 m between uprights once the world builds it 15 percent larger, which is the bay the Drone Nationals plan draws, so a wall of these stands 2 m a bay.',
    clearW: 2 / GATE_SCALE - FRAME_TUBE_OD,
    clearH: 2 / GATE_SCALE - FRAME_TUBE_OD,
  },
  {
    id: 'trainer',
    label: 'Trainer',
    size: '10 x 8 ft',
    published: false,
    hint: 'Not a MultiGP size. A deliberately forgiving hole for a first track or a first pilot.',
    clearW: 10 * FT,
    clearH: 8 * FT,
  },
];

/*
 * THE MICRO PRESET: 28 INCHES, AND ONLY 28 INCHES.
 *
 * RaceGOW's rules give a range, 24 to 28, and a 24 inch option was offered
 * here alongside the 28 because the published 4 by 6 foot envelope is
 * quoted at the minimum. It is gone, and what went with it is the only way
 * a track built in this tool could come out at a size nothing else in the
 * project uses.
 *
 * Everything here is built around 28. The pipe rule says to cut 20 sections
 * at 26.5 to 27.25 inches for "the maximum allowable open area", the tube
 * weBLEEDfpv sells for these tracks is 28 inches, the RaceGOW5 tracks in
 * presets.js are generated on a lattice derived from 28, src/game/track.js
 * scales the aircraft against 28 and src/render/scene.js builds the room
 * around it. One size, everywhere, is the whole point of a series where
 * everybody builds the same track in their own living room.
 *
 * This is what the tool OFFERS. The inspector still lets an author type any
 * number, and warnings.js still checks the 24 to 28 range against what they
 * typed, so a pilot whose own pipe is shorter is told their track is legal
 * rather than stopped.
 */
export const MICRO_GATE_PRESETS = [
  {
    id: 'racegow28',
    label: 'RaceGOW 28 in',
    size: '28 x 28 in',
    published: true,
    hint: 'The maximum RaceGOW allows, and what a 3/4 inch pipe cut at 26.5 to 27.25 in assembles to. What everybody builds.',
    clearW: GATE_OPENING_MAX,
    clearH: GATE_OPENING_MAX,
  },
];

/* The presets offered on a track of this class. */
export function gatePresetsFor(cls) {
  return cls === 'micro' ? MICRO_GATE_PRESETS : GATE_PRESETS;
}

/* Within a millimetre, which is finer than anything an author types and
 * coarser than the six decimal places the document rounds to. */
const PRESET_TOL = 0.001;

/* Which preset a set of dimensions IS, or null for a size somebody typed.
 * The inspector shows the answer, so "custom" is a state an author can see
 * rather than a silent one. */
export function matchingGatePreset(dims, shape = 'square') {
  if (!dims) {
    return null;
  }
  /* Both lists, because the answer to "which preset IS this" cannot depend
   * on which class is open: a 19 inch whoop gate on a full sized track is
   * still the Whoop preset. A hoop is a preset's width and as high as it is wide; a hex gate is a
   * preset's width and as high as a hexagon that wide is. */
  return [...GATE_PRESETS, ...MICRO_GATE_PRESETS]
    .find((p) => Math.abs(dims.clearW - p.clearW) < PRESET_TOL
      && Math.abs(dims.clearH - presetHeight(p, shape)) < PRESET_TOL) || null;
}

/* The height a preset's opening has in a shape: the preset's own for a square, its width for a hoop, and
 * a regular hexagon's for a hex gate. */
export function presetHeight(preset, shape = 'square') {
  if (shape === 'hex') {
    return preset.clearW * HEX_HEIGHT_RATIO;
  }
  return shape === 'circle' ? preset.clearW : preset.clearH;
}

/*
 * Put a preset's opening on a set of dimensions, in place.
 *
 * Levels, sill height and everything else the element carries are LEFT
 * ALONE: a preset is an opening size, not a new element. A three level
 * ladder resized to championship is still a three level ladder.
 */
export function applyGatePreset(dims, preset, shape = 'square') {
  /* A letter is not sized by a gate's preset: its two numbers are its primary hole's, and a standard gate's would make
   * a W the size of a gate. Its own size is set by width and height (letterDimsForSize). */
  if (!dims || !preset || shape === 'letter') {
    return dims;
  }
  dims.clearW = preset.clearW;
  dims.clearH = presetHeight(preset, shape);
  /* A standard size is every opening of the stack at that size, so an opening that was set apart goes back with it. */
  delete dims.openings;
  /*
   * A RACEGOW STACK'S PITCH IS A RULE, NOT A CONSEQUENCE.
   *
   * Everywhere else the level pitch follows the opening, because two MultiGP
   * openings share one cross member and the spacing is whatever the frame
   * makes it. RaceGOW fixes it independently: rule 3 puts adjacent gates 27
   * to 33 inches centre to centre whether they are stacked or side by side,
   * and rule 5 wants the second opening's centre at 42 inches or more. At
   * the 28 inch opening the frame's own pitch would be 29.05 inches, which
   * is legal by rule 3 and puts the second centre at 43.05 with an inch of
   * margin. The nominal 30 is used instead, because it is the number the
   * rules name and it is comfortably inside both, and because an author who
   * types a smaller opening then has a stack that is still legal where the
   * frame's own pitch would not be: at 24 inches that pitch is 25.05, which
   * BREAKS rule 3.
   */
  dims.levelPitch = MICRO_GATE_PRESETS.includes(preset)
    ? GATE_SPACING_NOMINAL
    : levelPitchFor(preset.clearH);
  return dims;
}

/* Palette order is the order the task specifies, and the order the palette
 * draws. It is written out rather than derived from Object.keys so a future
 * reorder is one obvious edit. */
export const PALETTE_ORDER = [
  'gate', 'flaggedGate', 'doubleStack', 'flaggedDoubleStack', 'ladder', 'tower', 'diveGate', 'letter', 'barrier', 'flag', 'cone', 'waypoint',
];

/*
 * The MICRO palette, in RaceGOW's own order and holding only RaceGOW's own
 * vocabulary. It is a different list rather than the full one with two
 * entries appended, because a palette is a statement about what this kind of
 * track is made of: a RaceGOW course has no flagged gates and no MultiGP
 * dive gate, and offering them would be the tool inventing a class rule.
 *
 * Barrier is on it because a living room has furniture in it, which is a
 * real and constant feature of these tracks, and so are a table, a chair and a
 * banner, which follow it. A hoop and a hex gate are openings, so they stand
 * with the gates, after the horizontal one and before the poles.
 */
export const MICRO_PALETTE_ORDER = [
  'gate', 'doubleStack', 'ladder', 'tower', 'diveGate', 'hoop', 'hexGate',
  'pole', 'horizontalPole', 'cone', 'barrier', 'table', 'chair', 'banner', 'waypoint',
];

/* The palette for a track class. A map's is its assets, then its roads and
 * vehicles; a race track has neither of the last two, whatever its class. */
export function paletteFor(cls, mode = 'race') {
  if (mode === 'freestyle') {
    return [...FREESTYLE_PALETTE_ORDER, ...ROAD_PALETTE];
  }
  return cls === 'micro' ? MICRO_PALETTE_ORDER : PALETTE_ORDER;
}

/*
 * THE ROAD TOOLS, a map's palette's last group (FREESTYLE-MAPS-PLAN.md 5.2).
 * Kept apart from FREESTYLE_PALETTE_ORDER, which is the placed assets: a
 * road is laid node by node and a vehicle is put on a road, not dropped at
 * a point, and neither is an asset with parts. Neither has a hotkey: the
 * digits and the free letters ran out before the assets did.
 */
export const ROAD_PALETTE = ['road', 'vehicle'];

/*
 * The freestyle palette: every asset, grouped the way src/props/types.js
 * groups them, then the builder's own gates and markers as furniture.
 */
export const FREESTYLE_PALETTE_ORDER = [
  ...PROP_GROUPS.flatMap((g) => Object.keys(PROP_TYPES).filter((id) => PROP_TYPES[id].group === g.id)),
  ...FURNITURE_PALETTE,
];

/* The heading an element sits under on the freestyle palette. */
export function paletteGroupOf(def) {
  if (def?.propGroup) {
    return def.propGroup;
  }
  return def?.group === 'extra' ? 'extra' : 'course';
}
export const PALETTE_EXTRA = ['startPads', 'label', 'groundLogo'];

/*
 * The path toggle: pressing P shows or hides the derived racing line, which is
 * the bar's Show line. It is not an element, and it is not on the palette any
 * more, where it was the bar's switch a second time and stayed lit like an
 * armed tool (MENUS-PLAN.md 1.23). It carries a key so the hotkey table has
 * one source, and P is never a piece's letter on any canvas.
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
  /* A freestyle map: a plot big enough for a block of buildings and a crane,
   * and the author can grow it. */
  freestyle: {
    fieldWidth: 160,
    fieldDepth: 160,
    gridSize: 1,
  },
  /*
   * THE MICRO SET. Every number below that is a length has a micro twin
   * here, because every one of them was chosen against a machine that
   * sweeps 0.35 m to a blade tip and flies at 20 m/s, and a whoop sweeps
   * 0.096 and flies at 4.
   *
   * They are in one block rather than scattered through the entries above
   * so that a reader can see the whole of what changes with the class, and
   * so `tuningFor` below is one lookup rather than eleven.
   */
  micro: {
    /*
     * The room, not the field. RaceGOW's own envelope is 1.22 by 1.83 m at
     * the minimum gate size, and its rules say "you will need some
     * additional space around the outside of that to fly the tracks
     * optimally". 5 by 6 m is a two car garage or a large living room, which
     * is where these are actually flown. See src/trackbuilder/racegow.js.
     */
    fieldWidth: ROOM_WIDTH,
    fieldDepth: ROOM_DEPTH,
    /* One inch. Every dimension RaceGOW publishes is a whole number of
     * inches and a metric grid would put none of them on a line. */
    gridSize: MICRO_GRID,
    /*
     * The curvature warning. A 5 inch at racing speed does 20 m/s and 2.5 m
     * of radius is 16 g, which no quad does. A whoop's fastest published lap
     * is 2.26 s over roughly 24 m, so about 10 m/s at the quickest and 4 to
     * 6 m/s round the technical parts. Holding 6 m/s round 0.45 m is 8 g,
     * which is at the edge of a 4.7:1 machine's envelope once the cosine of
     * the bank is paid for. Same reasoning, a fifth of the speed and a
     * twentieth of the radius.
     */
    minCurveRadius: 0.45,
    /* A metre of slop on a 60 m field is a gate sitting on the boundary. On
     * a 5 m room it is a fifth of the room. */
    boundarySlack: 0.25,
    /* Clearance a barrier gets when the line is tested against it. The line
     * is a centreline and a whoop is 96 mm across its ducts, so this is the
     * same fraction of the aircraft the full sized 0.35 is of a 5 inch. */
    barrierClearance: 0.10,
    /* How far the line steps off a stacked gate between two passes. Sized
     * the same way the full sized one is: the opening plus its frame plus a
     * body length, which on a 711 mm gate out of 27 mm pipe is 0.84 m. */
    stackWrap: 0.84,
  },

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

/*
 * The tuning for a track class. Falls through to the full sized value for
 * anything the micro block does not name, which is every ratio and count in
 * TUNING: a tangent scale and a samples per segment are dimensionless and do
 * not care how big the track is.
 */
export function tuningFor(cls, mode = 'race') {
  if (mode === 'freestyle') {
    return { ...TUNING, ...TUNING.freestyle };
  }
  if (cls !== 'micro') {
    return TUNING;
  }
  return { ...TUNING, ...TUNING.micro };
}

/*
 * THE NAME OF A PIECE ON A CLASS'S CANVAS. RaceGOW calls what the five inch
 * calls a dive gate a Horizontal Gate (racegow.js), and a pilot building a
 * whoop track knows it by that name, so the whoop canvas says so; every other
 * piece, and every other canvas, keeps the name it has.
 */
const WHOOP_LABELS = { diveGate: 'Horizontal gate' };

export function labelOf(type, cls = TRACK_CLASS_DEFAULT) {
  return (cls === 'micro' && WHOOP_LABELS[type]) || ELEMENTS[type]?.label || type;
}

/*
 * WHAT A PIECE IS CALLED WHEN ITS AUTHOR HAS NOT NAMED IT: its type's label, and an opening with no frame says so,
 * because a gate in the strip that is not a gate to look at is the one a pilot asks about.
 */
export function pieceLabel(el, cls = TRACK_CLASS_DEFAULT) {
  const base = labelOf(el.type, cls);
  return isUnbuilt(el) ? `Invisible ${base.toLowerCase()}` : base;
}

/*
 * THE WHOOP CANVAS'S TOOLS THAT ARE NOT PIECES. A row of gates is RaceGOW's Side
 * by Side Gates, dragged out along the floor, the ruler measures between two
 * points, and Fly order adds a pass through the piece that is clicked. None is an
 * element, so they are not in ELEMENTS and not in a document; they are on the
 * palette under their own heading, with keys.
 */
export const WHOOP_TOOLS = [
  {
    id: 'row',
    label: 'Side by side',
    key: 'H',
    note: 'Drag along the floor to lay two or three gates in a row, 30 in apart, sharing their verticals. One click lays a pair.',
  },
  {
    id: 'cube',
    label: 'Cube',
    key: 'K',
    note: 'Click to put a cube down: five gates that share their pipe, in one piece. It is flown straight through, along the way it faces; change the two faces with the Fly order tool. Move it, turn it, copy it and remove it as one.',
  },
  {
    id: 'ruler',
    label: 'Ruler',
    key: 'M',
    note: 'Click two points to measure between them, in inches and millimetres. A click near a gate or a pole takes its middle. Nothing is saved with the track.',
  },
  /*
   * N, NOT O. Fly order had O, and so did Ground logo, which is on all three
   * canvases' palettes with O: the whoop palette showed one letter on two tools
   * and the key only ever reached Fly order (MENUS-PLAN.md 1.20). A piece on
   * more than one canvas keeps its letter (4.2a), so Ground logo keeps O and
   * this moved, to N for the numbers it hands out, which no race canvas uses.
   * The map has a rail on N, and every one of its 36 keys is taken, so there is
   * no letter a whoop tool could have that means nothing there.
   */
  {
    id: 'route',
    label: 'Fly order',
    key: 'N',
    note: 'Click the pieces in the order you fly them. A click on a piece again is another pass through it, which is how a gate is flown twice. Backspace takes the last pass off.',
  },
];

/*
 * THE 5 INCH CANVAS'S PIECES THAT ARE MADE OF PIECES, and its tools that are not pieces.
 *
 * None is an element, so none is in ELEMENTS and none is in a document: each writes
 * ordinary elements and the document holds only those (a wall is gates in a group, a
 * hurdle is a barrier with flags and a waypoint over it, an up gate is a dive gate with
 * the numbers the rule gives). They stand on the palette among the pieces, in the place
 * `after` names, because to a person laying a track they are pieces. See
 * src/trackbuilder/parts.js for what each writes.
 */
export const FIVE_INCH_PIECES = [
  {
    id: 'invisibleGate',
    label: 'Invisible gate',
    /* I for invisible, which is free: E and Q turn, X reverses, V is the view and P the line. */
    key: 'I',
    after: 'gate',
    note: 'A target with nothing built round it: an opening you fly through and score like a gate, lit when it is the next one, with no pipe, no flag and nothing to hit. It is an ordinary gate with its frame taken away, so it is sized, turned, copied and flown in order like one, and any gate or letter can be made invisible the same way, or have its frame put back. Use it to put a target where a structure has a gap that no gate of its own frames.',
  },
  {
    id: 'wall',
    label: 'Wall',
    key: 'K',
    after: 'flaggedGate',
    note: 'Drag along the ground to lay a row of gates that share their uprights, two to six. Each bay is a gate of its own in the flying order, so a wall can be flown straight through or as a weave. The wall is one piece: it moves, turns, copies and goes as one.',
  },
  {
    id: 'upGate',
    label: 'Up gate',
    key: '',
    after: 'diveGate',
    note: 'A gate leaning at 45 degrees with its lower edge 1.5 m up, flown up through. It is a dive gate with those numbers, which are the rule the Drone Nationals plan gives its up gate.',
  },
  {
    id: 'launchGate',
    label: 'Launch gate',
    key: '',
    after: 'diveGate',
    note: 'A horizontal gate 15 ft up, flown UP through from below: the dive gate the other way round. It comes with the line to fly it, a pull up from level to vertical on the way in and a push over on the way out, as waypoints you can drag or take out.',
  },
  {
    id: 'hurdle',
    label: 'Hurdle',
    key: 'U',
    after: 'barrier',
    note: 'A board 4 m long and 1 m high with a flag at each end, flown over. One piece, and not a gate: nothing scores on it, and the lap is pinned over the middle of it.',
  },
  {
    id: 'barHurdle',
    label: 'Bar hurdle',
    key: '',
    after: 'barrier',
    note: 'A bar 10 ft wide, 5 ft up, on two legs: flown over it, skimming it, or under it between the legs. One piece, and not a gate: the lap is pinned over (or under) the middle of it, and the card says which.',
  },
  {
    id: 'run',
    label: 'Section',
    key: 'J',
    /* After the flagged gate, where the wall is, and below it: a piece stands after an element, and the wall is not one. */
    after: 'flaggedGate',
    note: 'A section laid in one click: a straight, a sweeper, a hairpin, a chicane, esses, a step sequence, a flag slalom or a Dutch 8, as many pieces as you ask for, flown in order. Pick the shape under the tool, then click where it starts. They are ordinary pieces afterwards.',
  },
];

/*
 * THE WHOOP CANVAS'S PIECES THAT ARE MADE OF PIECES: the invisible gate, which is the same piece as the five inch
 * canvas's (an ordinary gate with `unbuilt` set, so the document holds nothing new and a track written on either
 * canvas reads on the other). It stands on the palette after the gate, as it does on the five inch one, and takes
 * the whoop room's gate: a RaceGOW 28 inch opening, 19 in the Whoop preset, whichever the canvas defaults to.
 */
export const WHOOP_PIECES = [
  {
    id: 'invisibleGate',
    label: 'Invisible gate',
    key: 'I',
    after: 'gate',
    note: 'A target with nothing built round it: an opening you fly through and score like a gate, lit when it is the next one, with no pipe and nothing to hit. It is an ordinary gate with its frame taken away, so it is sized, turned, copied and flown in order like one, and any gate can be made invisible the same way, or have its frame put back. Use it to put a target where the room has a gap that no gate of its own frames.',
  },
];

/* The pieces made of pieces a class's palette carries, which is where the invisible gate is on both. */
export function partPiecesFor(cls) {
  return cls === 'micro' ? WHOOP_PIECES : FIVE_INCH_PIECES;
}

export const FIVE_INCH_TOOLS = [
  {
    id: 'route',
    label: 'Fly order',
    /* Not O: on a field O is the ground logo, and a key that has meant something for months is not taken from it. */
    key: 'N',
    note: 'Click the pieces in the order you fly them. A click on a gate again is another pass through it, which is how a gate is flown twice. Click a hurdle to fly over it. Backspace takes the last pass off.',
  },
  {
    id: 'ruler',
    label: 'Ruler',
    key: 'M',
    note: 'Click two points to measure between them, in metres. A click near a piece takes its middle. Nothing is saved with the track.',
  },
];

/*
 * THE MAP'S TOOLS THAT ARE NOT PIECES: the ruler, and nothing else, because a map has no flying order to put
 * in order and its pieces are the palette's own. It has no key: M is the ledge on a map and the digits and
 * the free letters ran out before the assets did.
 */
export const MAP_TOOLS = [
  {
    id: 'ruler',
    label: 'Ruler',
    key: '',
    note: 'Click two points to measure between them, in metres. A click near a piece takes its middle. Nothing is saved with the map.',
  },
];

/* The tool or the piece-of-pieces a key arms on a class's palette, or undefined. A whoop
 * canvas has the tools above in WHOOP_TOOLS; a 5 inch race canvas has these two lists. A map's
 * keys are its assets' (elementByKey), and its one tool has none. */
export function toolByKey(letter, cls = 'micro', mode = 'race') {
  const up = String(letter || '').toUpperCase();
  if (!up || mode === 'freestyle') {
    return undefined;
  }
  const list = cls === 'micro' ? [...WHOOP_PIECES, ...WHOOP_TOOLS] : [...FIVE_INCH_PIECES, ...FIVE_INCH_TOOLS];
  return list.find((t) => t.key === up);
}

/* Whether an id is one of the pieces made of pieces, on either canvas. */
export function isFiveInchPiece(id) {
  return FIVE_INCH_PIECES.some((p) => p.id === id) || WHOOP_PIECES.some((p) => p.id === id);
}

/* Convenience: every element definition in palette order, extras last. */
export function paletteItems(cls = TRACK_CLASS_DEFAULT, mode = 'race') {
  return [
    ...paletteFor(cls, mode).map((id) => ELEMENTS[id]),
    ...PALETTE_EXTRA.map((id) => ELEMENTS[id]),
  ];
}

const EXTRA_TYPES = new Set(PALETTE_EXTRA);

/*
 * How many of each palette type stand on the field. Start pads and labels
 * are extras, not course furniture, so they stay out of this list. Types
 * that are not present are omitted, and the order is the palette order so
 * two tracks with the same mix always print the same way.
 *
 * This is the inventory an author quotes: 4 gates, 1 double stack, 1 dive
 * gate, 2 flags. It is not the flying-order length, which still lives on
 * the sequence. A flagged gate stays a flagged gate; the pennant is dress
 * but the palette tool is distinct, and collapsing it into Gate would hide
 * that.
 */
export function countElementsByType(elements, cls = TRACK_CLASS_DEFAULT) {
  const tally = new Map();
  for (const el of elements || []) {
    const type = el && el.type;
    if (!type || !ELEMENTS[type] || EXTRA_TYPES.has(type)) {
      continue;
    }
    tally.set(type, (tally.get(type) || 0) + 1);
  }
  const rows = [];
  /* Both palettes, so an inventory names every element on the track even if
   * the document mixes classes, which a hand edit can do. The order is the
   * full palette's, then whatever is only on the micro one. */
  const order = [
    ...PALETTE_ORDER,
    ...MICRO_PALETTE_ORDER.filter((id) => !PALETTE_ORDER.includes(id)),
    ...FREESTYLE_PALETTE_ORDER.filter((id) => !PALETTE_ORDER.includes(id) && !MICRO_PALETTE_ORDER.includes(id)),
  ];
  for (const id of order) {
    const count = tally.get(id) || 0;
    if (count > 0) {
      /* In the class's own words: a whoop track's dive gate is a horizontal
       * gate in Load and in its results, as it is on its palette. */
      rows.push({ type: id, label: labelOf(id, cls), count });
    }
  }
  return rows;
}

/* "4 gates, 1 triple stack, 1 dive gate". Empty field: "no elements". */
export function formatElementCounts(rows) {
  if (!rows || !rows.length) {
    return 'no elements';
  }
  return rows.map((row) => {
    /* A label that is plural already (Containers, a stack of them) keeps
     * its one s: the Load list read "7 containerss". */
    const word = row.count === 1 || /s$/.test(row.label) ? row.label : `${row.label}s`;
    return `${row.count} ${word.toLowerCase()}`;
  }).join(', ');
}

/*
 * Look up an element definition by the hotkey the user pressed. Returns
 * undefined for a key that is not on THIS CLASS'S palette.
 *
 * It used to search the micro palette and then the full one, so on a five
 * inch track Z armed a horizontal pole and U a RaceGOW pole, neither of which
 * is on that track's palette, and each of them landed at the five inch's
 * default size on a field the class never meant them for. A hotkey arms what
 * the palette shows.
 */
export function elementByKey(letter, cls = TRACK_CLASS_DEFAULT, mode = 'race') {
  const up = String(letter || '').toUpperCase();
  if (!up) {
    return undefined;
  }
  return paletteItems(cls, mode).find((d) => d.key === up);
}

/*
 * The openings a set of dimensions produces, bottom to top.
 *
 * `centerH` is the height of the opening's centre above the element's own
 * base, which is what everything downstream actually wants: the aperture's
 * world centre is the element's position raised by centerH, and the tilt
 * rotates the opening about that centre.
 */
/* The mast height an element actually carries, with the default for a
 * document written before flagH existed. One reader, so the mesh, the
 * collider, the preview and the height cannot disagree. */
export function gateFlagHeight(dims) {
  const h = dims?.flagH;
  return Number.isFinite(h) && h > 0 ? h : GATE_FLAG_H;
}

/*
 * The SHAPE of an element's openings, for a type or for a piece of that type: 'square' for every
 * gate there ever was, 'circle' for a hoop and 'hex' for a hex gate. It is a property of the
 * type, not stored on the piece, so no document has a word to get wrong and a piece cannot be
 * a hoop with a hex's name.
 */
export function apertureShapeOf(what) {
  const type = typeof what === 'string' ? what : what?.type;
  return shapeOf(ELEMENTS[type]?.shape);
}

/* Whether a piece, or the name of a type, is a letter. */
export function isLetterPiece(what) {
  return (typeof what === 'string' ? what : what?.type) === 'letter';
}

/* The letter a piece is: its own, or the default when it has none or has one this build does not draw. */
export function letterOfPiece(el) {
  return letterOf(el?.letter);
}

/*
 * THE DIMS OF A LETTER. For a letter that is new they are its defaults; for one that is being changed into another
 * (`from` is the piece as it is) they keep the author's scale: a W stretched to half as wide again as it is drawn is
 * an A stretched the same way, which is what turning a letter into another one should leave you with. `levels` is
 * the new letter's hole count, and the pitch is the one a stack of the new size would have.
 */
export function letterDimsFor(letter, from = null) {
  const next = letterOf(letter);
  const base = letterDefaults(next);
  let kx = 1;
  let ky = 1;
  if (from && from.dims && Number.isFinite(from.dims.clearW) && Number.isFinite(from.dims.clearH)) {
    const was = letterDefaults(letterOf(from.letter));
    kx = from.dims.clearW / was.clearW;
    ky = from.dims.clearH / was.clearH;
  }
  const clearW = base.clearW * kx;
  const clearH = base.clearH * ky;
  return {
    levels: openingCount(next), sillH: 0, clearW, clearH, levelPitch: levelPitchFor(clearH),
  };
}

/* How big the letter stands, pipe and all: { width, height } in metres, for the card and the height limits. */
export function letterExtent(el) {
  return letterSizeOf(letterOfPiece(el), el.dims.clearW, el.dims.clearH, LETTER_TUBE_OD);
}

/* The primary hole's size that makes a letter this wide and this tall, which is what an author asking for a
 * letter's size is asking for. */
export function letterDimsForSize(el, width, height) {
  return dimsForLetterSize(letterOfPiece(el), width, height, LETTER_TUBE_OD);
}

/*
 * EACH OPENING OF A STACK CAN BE ITS OWN SIZE. `dims.openings` is an optional list, one entry per opening from the
 * bottom, each `{ clearW?, clearH? }`: the key that is there is that opening's own size, the key that is not is the
 * stack's (`dims.clearW`, `dims.clearH`), so a piece with no list, which is every piece that has ever been saved,
 * is read exactly as it always was. Only a stack of square openings has one: a hoop, a hex gate and a letter have
 * one size each.
 *
 * What a size that is not a length is, is no size: it is dropped and the opening takes the stack's, so no reader is
 * ever handed a NaN for a height (a piece whose height was not a number once left the 3D camera framing nothing).
 * Returns null when no opening differs from the stack, so one state has one spelling.
 */
export function openingSizesOf(dims, count = null) {
  const raw = dims?.openings;
  if (!Array.isArray(raw)) {
    return null;
  }
  const n = count ?? Math.max(1, Math.round(dims.levels));
  /* One opening is the stack's own size: there is nothing to set apart. */
  if (n < 2) {
    return null;
  }
  const out = [];
  let any = false;
  for (let i = 0; i < n; i += 1) {
    const o = raw[i] && typeof raw[i] === 'object' ? raw[i] : {};
    const one = {};
    for (const key of ['clearW', 'clearH']) {
      const v = typeof o[key] === 'number' ? o[key] : Number.NaN;
      if (Number.isFinite(v) && v > 0 && Math.abs(v - dims[key]) > 1e-9) {
        one[key] = v;
        any = true;
      }
    }
    out.push(one);
  }
  return any ? out : null;
}

export function apertureLevels(dims) {
  const out = [];
  const n = Math.max(1, Math.round(dims.levels));
  const sizes = openingSizesOf(dims, n);
  /* The old arithmetic, untouched, for every piece whose openings are all the stack's size. */
  if (!sizes) {
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
  /* The openings are different heights, so the pitch can no longer be one number: each sill sits one member above
   * the opening below it, which is the gap the stack was authored with (its pitch less its clear height). */
  const gap = Number.isFinite(dims.levelPitch - dims.clearH) ? dims.levelPitch - dims.clearH : FRAME_TUBE_OD;
  let sill = dims.sillH;
  for (let i = 0; i < n; i += 1) {
    const clearW = sizes[i].clearW ?? dims.clearW;
    const clearH = sizes[i].clearH ?? dims.clearH;
    out.push({ index: i, sillH: sill, centerH: sill + clearH / 2, clearW, clearH });
    sill += clearH + gap;
  }
  return out;
}

/* Overall height of an element, for the 3D view and for the height drag
 * limits. Aperture elements are as tall as their top opening plus a tube. */
export function elementHeight(def, dims, style = null, tilt = 0) {
  if (def.kind === KIND.APERTURE && def.id === 'letter') {
    /* A letter is as tall as it is drawn, which is the letter's doing and not its top hole's: `style` is the letter. */
    return letterSizeOf(letterOf(style), dims.clearW, dims.clearH, LETTER_TUBE_OD).height;
  }
  if (def.kind === KIND.APERTURE) {
    const levels = apertureLevels(dims);
    const top = levels[levels.length - 1];
    const h = top.sillH + top.clearH + FRAME_TUBE_OD;
    /* The author's own mast, not the default, so raising a pennant raises
     * the height the 3D view's drag limits and the plan's labels use. */
    return def.flagSide ? h + gateFlagHeight(dims) : h;
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
  if (def.kind === KIND.STRUCTURE || def.kind === KIND.ZONE) {
    /* `tilt` is tiltOf(el): stood on end, an asset is as tall as it was long. */
    return approxHeight(def.id, dims, style ?? propStyleOf({ type: def.id }), tilt);
  }
  if (def.kind === KIND.ROAD || def.kind === KIND.DECAL) {
    /* Paint. A ground logo has a footprint and no height: it used to fall to
     * the last line, which reads `textHeight`, a label's size and not a
     * decal's, so topOf was NaN and a track carrying one framed its 3D camera
     * on NaN: an empty sky and every tag piled in the corner, with nothing in
     * the console because NaN is not an error. */
    return 0;
  }
  if (def.kind === KIND.VEHICLE) {
    return approxHeight('car', dims, CAR_STYLES.includes(style) ? style : CAR_STYLES[0]);
  }
  return dims.textHeight;
}
