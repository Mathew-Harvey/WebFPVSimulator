/*
 * walls.js: nothing on a room's track stands outside the room.
 *
 * A pilot, on 30 October 2026, flying a whoop track off the board
 * (bug-dcc2264f): "The 8th door is outside the room, the map is wrong." It
 * was. The track had a double stack 2.3 m past the east wall and a hex gate
 * 0.8 m past it, so three of its fifteen gates stood in the car park and the
 * lap could not be flown. The builder had said so to its author, "Double
 * stack 2 is standing outside the field", and let it be published, because
 * a warning there is advice (warnings.js says why, and it is right on a five
 * inch field, where past the field's edge is more grass). A RaceGOW room has
 * no more grass. Its walls are solid in the game and the room is the same
 * size whatever the document says (src/render/scene.js builds it from
 * ./racegow.js), so a piece past a wall is not a bold design, it is a piece
 * nobody can reach.
 *
 * WHERE THE WALLS ARE. Where the game builds them: ROOM_WIDTH by ROOM_DEPTH
 * about the middle of the field, because src/game/trackdoc.js puts a
 * document's point in the world at `x - field.width / 2`. On a room's own
 * field, which is every room on the board, that is 0 to 10 by 0 to 12, the
 * frame the builder draws.
 *
 * WHAT IS BROUGHT IN, AND HOW FAR. A piece whose ORIGIN is past a wall, the
 * same test the builder's warning and both importers make. It comes in on
 * the axis it was out on, and only that one, to stand its own reach inside
 * the wall, so whichever way it faces nothing of it is in the plaster (a
 * gate's half span in its pipe at the least, more for a wide opening or a
 * barrier), and the track's own tightest turn past that, so the line can
 * get round it. Without the turn the ticket's hex gate, which faces the
 * wall, came in 382 mm from it and the line the builder derives swung a
 * metre into the plaster to come back through; with the room's 450 mm turn
 * the line stays inside. A piece whose origin is inside is never touched,
 * even beside a wall: a banner is hung there on purpose. Paint on the floor
 * and the plan's ink are left where they are, because neither is built or
 * flown.
 *
 * WHERE IT RUNS, and why not in normalize(), is seat.js's argument word for
 * word: the board holds the layout a time was set on, and a document is put
 * right when something draws or flies it, never when it is stored. So it
 * runs at the same doors: the builder's seat(), which every edit and every
 * arriving document goes through and which tells the author, and buildCourse
 * in src/game/trackdoc.js, silently, so a track already on the board is
 * flown with its gates in the room.
 *
 * ARITHMETIC ONLY, comparisons, additions and the document's own numbers,
 * for the reason seat.js gives: buildCourse runs it on the way to the
 * physics' world.
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

import { ELEMENTS, KIND, docModeOf, trackClassOf, tuningFor } from './elements.js';
import { ROOM_WIDTH, ROOM_DEPTH, PIPE_OD, GATE_OPENING_MAX } from './racegow.js';
import { gateWidthOf, kindOf } from './model.js';

/* The least a piece is brought in by: half the widest legal gate, in its
 * pipe, 382 mm. A cone's or a pole's line clearance is within a few mm of it. */
const GATE_HALF = GATE_OPENING_MAX / 2 + PIPE_OD;

/* The room's inner faces in the document's metres. */
export function roomWalls(doc) {
  const cx = doc.field.width / 2;
  const cy = doc.field.depth / 2;
  return { x0: cx - ROOM_WIDTH / 2, x1: cx + ROOM_WIDTH / 2, y0: cy - ROOM_DEPTH / 2, y1: cy + ROOM_DEPTH / 2 };
}

/*
 * How far from a wall a piece's origin has to be for none of it to be in
 * the wall, whichever way it faces: its half span plus its half depth, which
 * is the most a footprint that size reaches along any one axis. Without a
 * sine, so without the heading.
 */
export function wallReach(el) {
  const d = el.dims || {};
  const kind = kindOf(el);
  let r = GATE_HALF;
  if (kind === KIND.APERTURE) {
    r = Math.max(r, gateWidthOf(el) / 2 + PIPE_OD);
  } else if (kind === KIND.OBSTACLE) {
    r = Math.max(r, ((d.width || 0) + (d.depth || 0)) / 2);
  } else if (kind === KIND.MARKER) {
    r = Math.max(r, (d.clearance || 0) + (d.poleRadius || d.baseRadius || 0));
  } else if (kind === KIND.START) {
    r = Math.max(r, (((d.pads || 1) - 1) * (d.spacing || 0) + (d.padSize || 0)) / 2);
  }
  return r;
}

/* One axis: left alone inside the walls, else `r` inside the wall it was
 * past, else, in a room narrower than twice that, the middle. */
function inside(v, lo, hi, r) {
  if (v >= lo && v <= hi) {
    return v;
  }
  if (hi - lo < 2 * r) {
    return Math.round(((lo + hi) / 2) * 1e6) / 1e6;
  }
  return Math.round((v < lo ? lo + r : hi - r) * 1e6) / 1e6;
}

/*
 * Bring every piece of a room's track that stands past a wall back inside
 * it, in place, and return what moved as { id, type, from, to }, from and to
 * being { x, y }. A five inch track and a map are left alone: a field has
 * ground past its edge and a map is its own world.
 */
export function keepInRoom(doc) {
  const moved = [];
  if (trackClassOf(doc) !== 'micro' || docModeOf(doc) === 'freestyle') {
    return moved;
  }
  const w = roomWalls(doc);
  /* The line's tightest turn, as the line itself is built with it. */
  const set = doc.settings?.minCurveRadius;
  const turn = set > 0 ? set : tuningFor('micro').minCurveRadius;
  for (const el of doc.elements) {
    const kind = kindOf(el);
    if (kind === KIND.DECAL || kind === KIND.ANNOTATION) {
      continue;
    }
    const { x, y } = el.position;
    /* Written so that NaN is not outside either, as seat.js's test is. */
    if (!(x < w.x0 || x > w.x1 || y < w.y0 || y > w.y1)) {
      continue;
    }
    const r = wallReach(el) + turn;
    const to = { x: inside(x, w.x0, w.x1, r), y: inside(y, w.y0, w.y1, r) };
    el.position.x = to.x;
    el.position.y = to.y;
    moved.push({ id: el.id, type: el.type, from: { x, y }, to });
  }
  return moved;
}

/* The sentence the builder says when keepInRoom moved anything, naming
 * pieces the way seatedNote does, or the empty string. */
export function inRoomNote(moved, nameOf, elementOf) {
  if (!moved.length) {
    return '';
  }
  const called = (m) => {
    const el = elementOf(m.id);
    if (!el) {
      return ELEMENTS[m.type]?.label ?? m.type;
    }
    return el.name ? `${ELEMENTS[el.type]?.label ?? el.type} "${el.name}"` : nameOf(el);
  };
  if (moved.length === 1) {
    return `${called(moved[0])} stood outside the room's walls, where nobody can fly to it, so it now stands inside them.`;
  }
  const names = moved.slice(0, 3).map(called);
  const more = moved.length > names.length ? ` and ${moved.length - names.length} more` : '';
  return `${moved.length} things stood outside the room's walls, where nobody can fly to them (${names.join(', ')}${more}). They now stand inside the wall each was past.`;
}
