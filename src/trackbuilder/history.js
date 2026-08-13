/*
 * history.js: undo and redo, across every editing action.
 *
 * Whole document snapshots, not a command log. A track is a few kilobytes of
 * JSON and a session is a few hundred edits, so the entire history of a long
 * session is under a megabyte, and a snapshot cannot get the inverse of an
 * operation subtly wrong the way a hand written undo for "reorder the
 * sequence, which re-derived four faces, one of which was overridden" can.
 * If a track ever grows big enough for this to hurt, that is the moment to
 * write a command log, and not before.
 *
 * Gestures coalesce. A drag across the field is one undo step, not one per
 * mouse move: begin() takes the snapshot before the drag, commit() decides
 * whether anything actually changed.
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

import { deepClone } from './model.js';

const LIMIT = 200;

export class History {
  constructor(limit = LIMIT) {
    this.limit = limit;
    this.past = [];
    this.future = [];
    this.pending = null;
  }

  /* Start again from a document, throwing away everything before it. Called
   * on New, Load and Import. */
  reset() {
    this.past = [];
    this.future = [];
    this.pending = null;
  }

  /* Snapshot before a gesture. Cheap enough to call on every mousedown. */
  begin(doc, label) {
    this.pending = { doc: deepClone(doc), label };
  }

  /*
   * Close a gesture. Only records a step if the document actually moved, so
   * a click that selects and a drag of zero pixels leave no undo behind.
   * Returns true when a step was recorded.
   */
  commit(doc) {
    if (!this.pending) {
      return false;
    }
    const before = this.pending;
    this.pending = null;
    if (JSON.stringify(before.doc) === JSON.stringify(doc)) {
      return false;
    }
    this.past.push(before);
    if (this.past.length > this.limit) {
      this.past.shift();
    }
    this.future = [];
    return true;
  }

  /* Abandon a gesture without recording it. */
  cancel() {
    this.pending = null;
  }

  /* A change that is not a gesture: one snapshot, taken before and committed
   * at once. `before` is the document as it was. */
  record(before, doc, label) {
    this.pending = { doc: deepClone(before), label };
    return this.commit(doc);
  }

  canUndo() {
    return this.past.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }

  undoLabel() {
    return this.past.length ? this.past[this.past.length - 1].label : '';
  }

  redoLabel() {
    return this.future.length ? this.future[this.future.length - 1].label : '';
  }

  /* Both return the document to install, or null when there is nothing to
   * go to. `current` is the document being replaced. */
  undo(current) {
    if (!this.past.length) {
      return null;
    }
    const step = this.past.pop();
    this.future.push({ doc: deepClone(current), label: step.label });
    return deepClone(step.doc);
  }

  redo(current) {
    if (!this.future.length) {
      return null;
    }
    const step = this.future.pop();
    this.past.push({ doc: deepClone(current), label: step.label });
    return deepClone(step.doc);
  }
}
