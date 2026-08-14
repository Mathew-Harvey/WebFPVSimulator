/*
 * session.js: the published course this browser is currently flying.
 *
 * THE BOARD HANDS THE SIMULATOR A TRACK THROUGH THE URL, not through a file
 * and not through postMessage. The page at the other end opens
 *
 *   {sim}/?map=custom&share={id}
 *
 * and this module is what that query becomes: a document in local storage,
 * plus the id and the board it came from, so a lap time can go back to the
 * same board. The document is the same schema.md object the builder writes,
 * logo included, so a published course arrives wearing its sponsor print.
 *
 * THE BUILDER'S AUTOSAVE IS A DIFFERENT KEY. Fly this track clears the
 * import so the working canvas wins. A shared course never overwrites the
 * draft, and a draft never overwrites a shared course. They are two seats.
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

const IMPORT_KEY = 'webfpv.share.import.v1';
const EDIT_KEY = 'webfpv.share.editkeys.v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function readShareImport() {
  const raw = readJson(IMPORT_KEY, null);
  if (!raw || typeof raw !== 'object' || !raw.document || !raw.id) {
    return null;
  }
  return raw;
}

export function writeShareImport(payload) {
  if (!payload || !payload.document || !payload.id) {
    return false;
  }
  return writeJson(IMPORT_KEY, {
    id: String(payload.id),
    name: String(payload.name || payload.document.name || 'Untitled track'),
    author: String(payload.author || ''),
    board: String(payload.board || ''),
    document: payload.document,
    importedUtc: new Date().toISOString(),
  });
}

export function clearShareImport() {
  try {
    localStorage.removeItem(IMPORT_KEY);
  } catch (e) {
    /* nothing to do about it */
  }
}

export function readEditKey(trackId) {
  const all = readJson(EDIT_KEY, {});
  const key = all && typeof all === 'object' ? all[trackId] : null;
  return typeof key === 'string' && key ? key : null;
}

export function writeEditKey(trackId, key) {
  const all = readJson(EDIT_KEY, {});
  if (!all || typeof all !== 'object' || Array.isArray(all)) {
    return false;
  }
  all[trackId] = String(key);
  return writeJson(EDIT_KEY, all);
}
