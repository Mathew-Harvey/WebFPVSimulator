/*
 * sequence.js: flying order, and the aperture model that makes a ladder work.
 *
 * ONE OBJECT IS NOT ONE SEQUENCE ENTRY, and everything awkward about this
 * file comes from insisting on that. The thing standing on the field is a
 * structure. The thing in the flying order is ONE OPENING on that structure.
 * A three level ladder placed once can be flown at position 5 on its bottom
 * level heading north and again at position 9 on its top level heading
 * south, and both of those are entries in doc.sequence pointing at the same
 * element id with different apertureIndex and different entry signs.
 *
 * So: adding an element to the field adds ONE sequence entry, on its lowest
 * opening, because that is the common case. A double stack or a triple stack
 * is then rewritten to a spiral up by the app, because each hole is a gate.
 * Deleting an element deletes every entry that points at it. Reordering
 * moves entries, never elements.
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

import { ELEMENTS, KIND } from './elements.js';
import {
  createElement, createSequenceEntry, elementById, kindOf, aperturesOf, isSequenceable, sequenceRefCount,
} from './model.js';
import { applyAutoFaces, setYaw } from './faces.js';
import { matchingFigureOf, FIGURES, levelName, runContaining } from './figures.js';

/*
 * Append an element to the flying order, or insert it at a position.
 * Returns the new entry, or null when the element cannot be sequenced at all
 * (a barrier, a label, the start pads).
 */
export function addToSequence(doc, elementId, apertureIndex = 0, atIndex = null) {
  const el = elementById(doc, elementId);
  if (!el || !isSequenceable(el)) {
    return null;
  }
  const entry = createSequenceEntry(doc, elementId, apertureIndex);
  if (atIndex == null || atIndex < 0 || atIndex >= doc.sequence.length) {
    doc.sequence.push(entry);
  } else {
    doc.sequence.splice(atIndex, 0, entry);
  }
  applyAutoFaces(doc);
  return entry;
}

/* Add the next unused opening of a multi level structure. This is the click
 * that turns a ladder into two sequence entries. Returns the new entry, or
 * null if every level is already in the order. */
export function addNextLevel(doc, elementId) {
  const el = elementById(doc, elementId);
  if (!el || kindOf(el) !== KIND.APERTURE) {
    return null;
  }
  const used = new Set(doc.sequence.filter((s) => s.elementId === elementId).map((s) => s.apertureIndex));
  const levels = aperturesOf(el);
  for (let i = 0; i < levels.length; i += 1) {
    if (!used.has(i)) {
      return addToSequence(doc, elementId, i);
    }
  }
  /* Every level used already: a legitimate course can fly the same opening
   * twice, so add a repeat of the lowest rather than refusing. */
  return addToSequence(doc, elementId, 0);
}

export function removeFromSequence(doc, seqId) {
  const i = doc.sequence.findIndex((s) => s.id === seqId);
  if (i < 0) {
    return false;
  }
  doc.sequence.splice(i, 1);
  applyAutoFaces(doc);
  return true;
}

/* Drag to reorder. from and to are indices into doc.sequence. */
export function moveInSequence(doc, from, to) {
  if (from === to || from < 0 || from >= doc.sequence.length) {
    return false;
  }
  const clamped = Math.max(0, Math.min(doc.sequence.length - 1, to));
  const [item] = doc.sequence.splice(from, 1);
  doc.sequence.splice(clamped, 0, item);
  applyAutoFaces(doc);
  return true;
}

/* Which opening of the structure this entry flies. */
export function setApertureIndex(doc, seqId, index) {
  const seq = doc.sequence.find((s) => s.id === seqId);
  if (!seq) {
    return false;
  }
  const el = elementById(doc, seq.elementId);
  if (!el || kindOf(el) !== KIND.APERTURE) {
    return false;
  }
  const levels = aperturesOf(el);
  seq.apertureIndex = Math.max(0, Math.min(levels.length - 1, Math.round(index)));
  applyAutoFaces(doc);
  return true;
}

/* Deleting an element takes its sequence entries with it. Anything else
 * leaves the order pointing at nothing. */
export function removeElement(doc, elementId) {
  const i = doc.elements.findIndex((e) => e.id === elementId);
  if (i < 0) {
    return false;
  }
  doc.elements.splice(i, 1);
  doc.sequence = doc.sequence.filter((s) => s.elementId !== elementId);
  applyAutoFaces(doc);
  return true;
}

/*
 * BENDING THE LINE.
 *
 * The owner's words: "the flight path in 3d mode - i should be able to click
 * on any section of the flight path and drag it out to create smoother
 * radius' etc". The line is not stored anywhere (schema.md, Deriving the
 * racing line), so there is nothing on it to drag; what shapes it is the
 * knots, and the knot that exists for exactly this is a WAYPOINT: it pins
 * the line to a point, it scores nothing, nothing is built for it and the
 * game does not number it. The RaceGOW5 reconstructions are shaped by
 * waypoints already. So a grab on the line drops a waypoint where the line
 * was grabbed, in the flying order between the two stations that segment
 * runs between, and the drag moves it.
 *
 * WHERE IT GOES. Path segment `segment` runs from knot `segment` to the one
 * after it. Stepping back over any knot with no entry of its own (a stack's
 * wrap, a steering knot) finds the station the segment leaves, and the
 * waypoint goes straight after that station's entry. The closing leg of a
 * circuit leaves the last station, so a grab there appends.
 *
 * THE GATES EITHER SIDE KEEP THEIR FACES. A gate nobody turned by hand is
 * faced along the line from the station before it to the station after it,
 * so a waypoint dropped beside it would turn it towards the waypoint, and
 * the gate would swing about under the author's hand while they bent the
 * line, and so would a marker's pass side. The author is shaping the line
 * through the course as it stands, so the two neighbours are pinned first
 * the way a hand turn pins them (setYaw), and Re-derive hands them back.
 */
export function bendIndexFor(doc, path, segment) {
  const knots = path?.knots;
  /* Segment i joins knot i to knot i + 1, so the last one is two short of
   * the knot count. Anything past it is a caller's mistake, and dropping a
   * waypoint at the end of the lap for it would hide the mistake. */
  if (!knots || !Number.isInteger(segment) || segment < 0 || segment > knots.length - 2) {
    return null;
  }
  for (let i = segment; i >= 0; i -= 1) {
    const k = knots[i];
    if (k.seq && k.role !== 'finish') {
      const at = doc.sequence.findIndex((s) => s.id === k.seq.id);
      return at < 0 ? null : at + 1;
    }
  }
  return null;
}

/* Pin the faces of the entries at these positions in the flying order, as
 * a hand turn would. A waypoint has no face to pin. Returns how many were
 * pinned that were not already. */
export function pinFacesAt(doc, indices) {
  let pinned = 0;
  for (const i of indices) {
    const seq = doc.sequence[i];
    const el = seq ? elementById(doc, seq.elementId) : null;
    if (!el || el.type === 'waypoint') {
      continue;
    }
    if (kindOf(el) === KIND.APERTURE && !el.yawOverridden && sequenceRefCount(doc, el.id) === 1) {
      setYaw(doc, el.id, el.yaw);
      pinned += 1;
    } else if (!seq.overridden && seq.entry !== 0) {
      seq.overridden = true;
      pinned += 1;
    }
  }
  return pinned;
}

/* The neighbours in the flying order of every entry of this element. */
export function neighboursOf(doc, elementId) {
  const out = [];
  doc.sequence.forEach((s, i) => {
    if (s.elementId === elementId) {
      out.push(i - 1, i + 1);
    }
  });
  return out.filter((i) => i >= 0 && i < doc.sequence.length && doc.sequence[i].elementId !== elementId);
}

/*
 * Drop a waypoint on path segment `segment` at `pos`, heading `yaw`, and put
 * it in the flying order there. Returns the new element, or null when the
 * segment is not one this document has.
 */
export function bendLineAt(doc, path, segment, pos, yaw = 0) {
  const at = bendIndexFor(doc, path, segment);
  if (at == null) {
    return null;
  }
  pinFacesAt(doc, [at - 1, at]);
  const el = createElement(doc, 'waypoint', { x: pos.x, y: pos.y, z: Math.max(0, pos.z) }, yaw);
  doc.elements.push(el);
  addToSequence(doc, el.id, 0, at);
  return el;
}

/*
 * Cutting levels off a ladder can strand a sequence entry above the top of
 * the structure. Called after any dimension edit.
 */
export function clampSequenceToApertures(doc) {
  let changed = false;
  for (const s of doc.sequence) {
    const el = elementById(doc, s.elementId);
    if (!el || kindOf(el) !== KIND.APERTURE) {
      continue;
    }
    const max = aperturesOf(el).length - 1;
    if (s.apertureIndex > max) {
      s.apertureIndex = max;
      changed = true;
    }
  }
  return changed;
}

/*
 * The number drawn on an element in both views. A structure flown twice
 * carries two numbers, one per opening, so the map returns a list.
 *
 * Returns Map<elementId, Array<{ apertureIndex, number, seq }>>, numbers
 * one based because that is what a pilot counts.
 */
export function sequenceNumbers(doc) {
  const numbers = gateNumbers(doc);
  const map = new Map();
  doc.sequence.forEach((s) => {
    const list = map.get(s.elementId) ?? [];
    list.push({ apertureIndex: s.apertureIndex ?? 0, number: numbers.get(s.id) ?? null, seq: s });
    map.set(s.elementId, list);
  });
  return map;
}

/*
 * THE NUMBER EACH ENTRY IN THE FLYING ORDER SHOWS, and a waypoint shows
 * none.
 *
 * A waypoint pins the racing line and scores nothing, and the race field
 * numbers only what it scores (the stations in src/game/trackdoc.js), so
 * counting waypoints here put a different number on a gate in the builder
 * from the one it wears in the air: RaceGOW5 Track 8 has 29 passes and 7
 * waypoints, and its last gate was 36 here and 29 there. It matters more now
 * that dragging the line in the 3D view drops a waypoint on it, because
 * every bend would otherwise renumber every gate after it.
 *
 * Returns Map<sequence id, number or null>, one based.
 */
export function gateNumbers(doc) {
  const out = new Map();
  let n = 0;
  for (const s of doc.sequence) {
    if (elementById(doc, s.elementId)?.type === 'waypoint') {
      out.set(s.id, null);
      continue;
    }
    n += 1;
    out.set(s.id, n);
  }
  return out;
}

/* The number one entry shows, or null for a waypoint or an entry that is
 * not in the order. */
export function gateNumberOf(doc, seqId) {
  return gateNumbers(doc).get(seqId) ?? null;
}

/* Human name for one row of the sequence panel. */
export function sequenceLabel(doc, seq) {
  const el = elementById(doc, seq.elementId);
  if (!el) {
    return 'missing element';
  }
  const def = ELEMENTS[el.type];
  const base = el.name || def.label;
  if (def.kind === KIND.APERTURE) {
    const levels = aperturesOf(el);
    if (levels.length > 1) {
      const fig = matchingFigureOf(el, runContaining(doc, seq));
      const level = levelName(el, seq.apertureIndex);
      if (fig && fig !== 'single') {
        return `${base}, ${FIGURES[fig].label}, ${level}`;
      }
      return `${base}, ${level}`;
    }
  }
  return base;
}

/* Short description of the face or the side, for the panel and the
 * inspector. Prose, because a signed integer means nothing to a course
 * designer looking at a list. */
export function faceLabel(doc, seq) {
  const el = elementById(doc, seq.elementId);
  if (!el) {
    return '';
  }
  const kind = kindOf(el);
  if (kind === KIND.MARKER) {
    return `pass on the ${seq.passSide}`;
  }
  if (kind !== KIND.APERTURE) {
    return '';
  }
  if (seq.entry === 0) {
    return 'no face set';
  }
  /* A steeply tilted aperture is flown up or down and saying "from the
   * front" about it would be a lie. */
  const n = el.pitch;
  if (Math.abs(n) > Math.PI / 4) {
    const upward = (n > 0 ? 1 : -1) * seq.entry > 0;
    return upward ? 'enter from below' : 'enter from above';
  }
  return seq.entry === 1 ? 'enter from the back' : 'enter from the front';
}

/* Every element that could be in the order but is not. Feeds a warning and
 * the sequence panel's "not in the course" list. */
export function unsequencedElements(doc) {
  const used = new Set(doc.sequence.map((s) => s.elementId));
  return doc.elements.filter((e) => isSequenceable(e) && !used.has(e.id));
}
