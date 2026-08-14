/*
 * summary.js: the name of the course this browser will fly, without
 * building it.
 *
 * The title menu and the map cards need a name. They must not import the
 * custom map, because that pulls the renderer. This file reads the two
 * seats the custom map reads, share import then builder autosave, and
 * hands back a summary.
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

import { readShareImport } from './session.js';
import { readAutosave } from '../trackbuilder/storage.js';

export function activeCourseSummary() {
  try {
    const share = readShareImport();
    if (share && share.document) {
      const doc = share.document;
      return {
        name: share.name || doc.name || 'Untitled track',
        gates: Array.isArray(doc.sequence) ? doc.sequence.length : 0,
        elements: Array.isArray(doc.elements) ? doc.elements.length : 0,
        shared: true,
        author: share.author || '',
        shareId: share.id,
        board: share.board || '',
      };
    }
    const saved = readAutosave();
    if (saved && saved.doc) {
      const doc = saved.doc;
      return {
        name: doc.name || 'Untitled track',
        gates: doc.sequence.length,
        elements: doc.elements.length,
        shared: false,
        author: '',
        shareId: null,
        board: '',
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}
