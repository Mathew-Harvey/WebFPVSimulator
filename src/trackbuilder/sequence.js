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
 * opening, because that is the common case and the panel makes adding the
 * second one a single click. Deleting an element deletes every entry that
 * points at it. Reordering moves entries, never elements.
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
  createSequenceEntry, elementById, kindOf, aperturesOf, isSequenceable,
} from './model.js';
import { applyAutoFaces } from './faces.js';

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
  const map = new Map();
  doc.sequence.forEach((s, i) => {
    const list = map.get(s.elementId) ?? [];
    list.push({ apertureIndex: s.apertureIndex ?? 0, number: i + 1, seq: s });
    map.set(s.elementId, list);
  });
  return map;
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
      return `${base}, level ${(seq.apertureIndex ?? 0) + 1} of ${levels.length}`;
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
