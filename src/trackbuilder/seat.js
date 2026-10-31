/*
 * seat.js: nothing that is built stands in the air.
 *
 * A pilot, on 29 September 2026, on FAI Turkiye 2024: "a few of the gates are
 * 20 meters above the ground. flying around/through them where they are in
 * the sky or where their supposed to be on the ground does not clear them."
 * Four flags 20 m up and a gate 15 m up, each a post or a frame of pipe with
 * nothing under it, because the source map the course came from has a
 * rooftop there and the field has not. The owner's ask: when somebody builds a
 * track or a map, no gate and no asset is left floating.
 *
 * WHAT FLOATS. An element that is BUILT (it has pipe, a post, a body) and
 * whose base, position.z, is more than SEAT_SLACK over what it stands on.
 * What it stands on is the ground, or on a map the top of another element's
 * solid box under its origin: a roof, a container, a deck, a ledge. Only a
 * box, because that is all the physics stands a craft on (topUnder in
 * src/maps/built/place.js), so an element seated on something a craft would
 * fall through is not seated. An element is where its ORIGIN is, which is the
 * middle of its footprint and, for a gate, the middle between its uprights: a
 * container half off the one under it stands on it while its middle is
 * over it and falls when the middle is not. That is a rule an author can see
 * from above, and a centre test does not call a cantilever floating on a
 * roof edge the way a test of every corner would call a gate half on a ledge.
 *
 * WHAT DOES NOT. Anything with nothing built to hold up:
 *
 *   a waypoint, a named gap    a point and a window in the air, drawn nowhere
 *   a label, a decal           the plan's ink and the ground's paint
 *   a road, a vehicle          on the ground by construction
 *   a horizontal pole          its legs reach down to the ground from the bar,
 *                              so z is the bar's height (hpoleLayout)
 *   an opening with no pipe    isUnbuilt, or all four sides taken away: the
 *                              hole in a lattice, held by its neighbours
 *
 * The first two are `standsFree` in elements.js, the rest are read off their
 * kind and their sides, so a new element type says what it is where it is
 * defined and this file does not grow a list of names.
 *
 * HOW IT IS FIXED: the element is set down, on the highest thing under its
 * origin that is not over its base, or on the ground. Raising an opening
 * off the ground is what Sill height is for, on legs; a base is for a thing
 * that stands on something.
 *
 * WHERE IT RUNS, and why not in normalize(). The document is left as it was
 * written until it is read by something that draws or flies it, because the
 * board holds the layout a time was set on and a republish that changes the
 * layout clears the times (see layoutHash in the board's src/validate.js). So
 * it runs at the doors: the builder's settle(), restore() and loadDocument(),
 * buildCourse in src/game/trackdoc.js for the race field, and buildMap for a
 * map, which places with seatDocument in src/maps/built/place.js. An old
 * published course is put right when it is read, the same as an old dive hoop
 * (plantImportedHeights), and what is stored is not touched.
 *
 * ARITHMETIC ONLY, comparisons and assignments of the document's own numbers,
 * because buildMap runs it on the way to the physics' world and that world
 * has to be the same bits in every engine.
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

import { ELEMENTS, KIND, FRAME_SIDES, docModeOf, unbuiltSidesOf } from './elements.js';

/* How far a base may be over its seat before it floats, m: more than a mat's
 * thickness and less than anything that reads as a step when the element is
 * drawn on the seat. The start pads' fs-pads-seat warning has always used
 * this number (src/trackbuilder/warnings.js), so there is one. */
export const SEAT_SLACK = 0.05;

/*
 * Whether an element is something that has to stand on something: built, and
 * not one of the things listed at the top of this file.
 */
export function needsSeat(el) {
  const def = ELEMENTS[el?.type];
  if (!def || def.standsFree) {
    return false;
  }
  switch (def.kind) {
    case KIND.ANNOTATION:
    case KIND.DECAL:
    case KIND.ZONE:
    case KIND.ROAD:
    case KIND.VEHICLE:
      return false;
    case KIND.APERTURE:
      /* No pipe at all is a hole in a lattice, whether it was said with
       * `unbuilt` or one side at a time. */
      return unbuiltSidesOf(el).length < FRAME_SIDES.length;
    default:
      return true;
  }
}

/*
 * Whether this element's base is the ground and nothing else, in this
 * document: a built thing on a track, where the field has nothing to stand it
 * on. The builder hides Base for it and gives the height drag nothing to do,
 * for the reason it already hides Base on a decal: a field that changes a
 * number nothing reads is a bug report waiting to be filed. On a map the
 * answer is never, because a map has roofs.
 */
export function standsOnGround(doc, el) {
  return docModeOf(doc) !== 'freestyle' && needsSeat(el);
}

/*
 * Whether anything in the document is raised and has to stand on something,
 * which is the whole question on nearly every edit: a map with nothing raised
 * is not placed for this, and a track is not looked at twice.
 */
export function hasRaised(doc) {
  return doc.elements.some((el) => el.position.z > SEAT_SLACK && needsSeat(el));
}

/*
 * Set down every element that floats, in place, and return what was moved as
 * [{ id, type, from, to, on }], `on` being the id of the element it now stands
 * on or null for the ground. `world` is null for a track, where the ground is
 * all there is, and for a map is { seatFor(el, z) }, which answers with
 * { top, on } for the highest solid top under the element's origin that is at
 * most z + SEAT_SLACK, or null: place.js builds it from the placed solids of
 * every OTHER element, which this file cannot, because it stays free of the
 * props so the race field's boot does not load them.
 *
 * One pass sets down what floats NOW. On a map, an element that stood on one
 * that has just moved is not floating until it has, so seatDocument calls
 * this again until nothing moves.
 */
export function seatFloating(doc, world = null) {
  const moved = [];
  for (const el of doc.elements) {
    const z = el.position.z;
    /* Written so that NaN is not floating either: normalize never lets one
     * through, and a comparison that is false is the safe answer. */
    if (!(z > SEAT_SLACK) || !needsSeat(el)) {
      continue;
    }
    const held = world ? world.seatFor(el, z) : null;
    const top = held ? held.top : 0;
    if (z > top + SEAT_SLACK) {
      el.position.z = top;
      moved.push({ id: el.id, type: el.type, from: z, to: top, on: held ? held.on : null });
    }
  }
  return moved;
}

/*
 * WHAT STANDS ON A THING GOES WITH IT. The ids of every element that stands on one of `ids`, directly or on
 * something that does, not counting `ids` themselves: the billboard on the roof of a container that is being
 * moved, and the container on that one. A thing stands on what `world.seatFor` finds under its origin at its
 * base, which is what set it down in the first place, so this is the seat's own answer read the other way
 * round. Only what needs a seat and is raised has one; the rest stand on the ground and are never carried.
 */
export function standingOn(doc, ids, world) {
  const on = new Map();
  for (const el of doc.elements) {
    if (!(el.position.z > SEAT_SLACK) || !needsSeat(el)) {
      continue;
    }
    const held = world.seatFor(el, el.position.z);
    if (held && held.on) {
      on.set(el.id, held.on);
    }
  }
  const taken = new Set(ids);
  const carried = [];
  for (let grew = true; grew;) {
    grew = false;
    for (const [id, base] of on) {
      if (!taken.has(id) && taken.has(base)) {
        taken.add(id);
        carried.push(id);
        grew = true;
      }
    }
  }
  return carried;
}

/*
 * What the builder says when it has set something down, or the empty string.
 * `nameOf` turns an element into the name the warnings use ("Gate 6"), and
 * `elementOf` finds the element a move stood on, for its name.
 */
export function seatedNote(moved, nameOf, elementOf) {
  if (!moved.length) {
    return '';
  }
  /* An unnamed element is "Gate 6", numbered by the warnings' own labeller.
   * A NAMED one is its type and its name in quotes, because an imported
   * course names its elements by their checkpoint number, and "15" says
   * nothing about what was set down. */
  const called = (id, type) => {
    const el = elementOf(id);
    if (!el) {
      return type;
    }
    return el.name ? `${ELEMENTS[el.type]?.label ?? el.type} "${el.name}"` : nameOf(el);
  };
  if (moved.length === 1) {
    const m = moved[0];
    const what = called(m.id, m.type);
    return m.on
      ? `${what} was ${m.from.toFixed(1)} m up and now stands on ${called(m.on, 'the element under it')}.`
      : `${what} was ${m.from.toFixed(1)} m up with nothing under it, so it now stands on the ground.`;
  }
  const names = moved.slice(0, 3).map((m) => called(m.id, m.type));
  const more = moved.length > names.length ? ` and ${moved.length - names.length} more` : '';
  return `${moved.length} things were up in the air with nothing under them (${names.join(', ')}${more}). They now stand on what is below them, or on the ground.`;
}
