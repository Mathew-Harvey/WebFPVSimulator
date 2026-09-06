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

import { countElementsByType, formatElementCounts } from './elements.js';
import { normalize, serialize, toPlain, touch } from './model.js';

const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';

/*
 * THE CANVAS, ONE PER CLASS.
 *
 * The autosave is the track the builder has open and the track the shell
 * flies, and a pilot who builds a RaceGOW room and then goes back to a five
 * inch is not holding the room any more. Two seats, so switching aircraft
 * switches which track the whole product is holding and switching back gives
 * it straight back.
 *
 * The five inch keeps the original key, so every pilot who has been here
 * before opens the builder on the track they left in it. The library is NOT
 * split: a saved track carries its own class and a Load list showing both is
 * a list of everything this browser has ever built, which is what a library
 * is for.
 */
const AUTOSAVE_KEY = 'webfpv.trackbuilder.autosave.v1';
const AUTOSAVE_KEY_MICRO = 'webfpv.trackbuilder.autosave.micro.v1';

function autosaveKey(cls) {
  return (cls ?? activeTrackClass()) === 'micro' ? AUTOSAVE_KEY_MICRO : AUTOSAVE_KEY;
}

/* readJson and writeJson come from src/share/session.js, which had the same
 * two functions byte for byte. Private mode and the quota are handled there:
 * a failed write returns false and the caller tells the user. */
import { activeTrackClass, readJson, writeJson } from '../share/session.js';

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
        mix: formatElementCounts(countElementsByType(doc.elements)),
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

/* Into the seat the DOCUMENT belongs in, read off the document, so an
 * autosave cannot land in the other class's chair. */
export function writeAutosave(doc) {
  const cls = doc && doc.trackClass === 'micro' ? 'micro' : 'full';
  return writeJson(autosaveKey(cls), toPlain(doc));
}

export function readAutosave(cls) {
  const raw = readJson(autosaveKey(cls), null);
  if (!raw) {
    return null;
  }
  return normalize(raw);
}

export function clearAutosave(cls) {
  try {
    localStorage.removeItem(autosaveKey(cls));
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
