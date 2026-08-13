/*
 * storage.js: the track library in local storage, autosave, and the file
 * import and export.
 *
 * Two keys, both versioned, both namespaced under webfpv.trackbuilder so
 * nothing here can collide with the simulator's own settings key:
 *
 *   webfpv.trackbuilder.library.v1   every saved track, by id
 *   webfpv.trackbuilder.autosave.v1  the working track, whether saved or not
 *
 * The autosave is what makes a refresh safe. It is written on a short timer
 * after every edit rather than on every edit, because serialising a track on
 * each mouse move is the one place this tool could be made to feel slow.
 *
 * Every read goes through model.normalize, so a hand edited local storage
 * entry or a file from an older build cannot put the tool in a state it
 * cannot draw. Every write is wrapped, because private browsing throws on
 * localStorage.setItem and losing an autosave must never lose the session.
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

import { normalize, serialize, toPlain, touch } from './model.js';

const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';
const AUTOSAVE_KEY = 'webfpv.trackbuilder.autosave.v1';

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
    /* Private mode, or the quota. The caller tells the user. */
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* The library                                                         */
/* ------------------------------------------------------------------ */

function readLibrary() {
  const lib = readJson(LIBRARY_KEY, {});
  return (lib && typeof lib === 'object' && !Array.isArray(lib)) ? lib : {};
}

/* Every saved track, newest change first, as summaries rather than whole
 * documents: the Load dialog only needs a name and a size. */
export function listTracks() {
  const lib = readLibrary();
  return Object.values(lib)
    .map((raw) => {
      const { doc } = normalize(raw);
      return {
        id: doc.id,
        name: doc.name,
        modifiedUtc: doc.modifiedUtc,
        elements: doc.elements.length,
        sequence: doc.sequence.length,
      };
    })
    .sort((a, b) => String(b.modifiedUtc).localeCompare(String(a.modifiedUtc)));
}

export function saveTrack(doc) {
  touch(doc);
  const lib = readLibrary();
  lib[doc.id] = toPlain(doc);
  return writeJson(LIBRARY_KEY, lib);
}

export function loadTrack(id) {
  const lib = readLibrary();
  if (!lib[id]) {
    return null;
  }
  return normalize(lib[id]);
}

export function deleteTrack(id) {
  const lib = readLibrary();
  if (!lib[id]) {
    return false;
  }
  delete lib[id];
  return writeJson(LIBRARY_KEY, lib);
}

export function trackExists(id) {
  return Boolean(readLibrary()[id]);
}

/* ------------------------------------------------------------------ */
/* Autosave                                                            */
/* ------------------------------------------------------------------ */

export function writeAutosave(doc) {
  return writeJson(AUTOSAVE_KEY, toPlain(doc));
}

export function readAutosave() {
  const raw = readJson(AUTOSAVE_KEY, null);
  if (!raw) {
    return null;
  }
  return normalize(raw);
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch (e) {
    /* nothing to do about it */
  }
}

/*
 * A debounced autosave. The app calls schedule() after every edit; the write
 * happens once the edits stop.
 */
export function makeAutosaver(delayMs = 700) {
  let timer = null;
  let latest = null;
  return {
    schedule(doc) {
      latest = doc;
      if (timer != null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        if (latest) {
          writeAutosave(latest);
        }
      }, delayMs);
    },
    flush() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      if (latest) {
        writeAutosave(latest);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

/* A filename that is recognisably the track and is safe on every platform. */
export function exportFilename(doc) {
  const slug = String(doc.name || 'track')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'track';
  return `${slug}.track.json`;
}

export function downloadTrack(doc) {
  const blob = new Blob([serialize(doc)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(doc);
  document.body.append(a);
  a.click();
  a.remove();
  /* Revoked on the next turn of the loop: revoking synchronously has raced
   * the download in more than one browser. */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('could not read the file'));
    reader.readAsText(file);
  });
}
