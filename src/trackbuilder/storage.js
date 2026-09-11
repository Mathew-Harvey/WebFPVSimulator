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
import { presetsForClass, presetById, isPresetId } from './presets.js';
import { duplicateTrack } from './model.js';

/* ------------------------------------------------------------------ */
/* The library                                                         */
/* ------------------------------------------------------------------ */

function readLibrary() {
  const lib = readJson(LIBRARY_KEY, {});
  return (lib && typeof lib === 'object' && !Array.isArray(lib)) ? lib : {};
}

/* Every saved track, newest change first, as summaries rather than whole
 * documents: the Load dialog only needs a name and a size. */
export function listTracks(cls = activeTrackClass()) {
  const lib = readLibrary();
  const summarise = (raw, preset) => {
    const { doc } = normalize(raw);
    return {
      id: doc.id,
      name: doc.name,
      modifiedUtc: doc.modifiedUtc,
      mix: formatElementCounts(countElementsByType(doc.elements)),
      sequence: doc.sequence.length,
      preset,
      credit: doc.credit,
    };
  };
  const mine = Object.values(lib)
    .map((raw) => summarise(raw, false))
    .sort((a, b) => String(b.modifiedUtc).localeCompare(String(a.modifiedUtc)));
  /*
   * The shipped set, after the pilot's own and only for the class being
   * built, because a whoop author has no use for a 60 m field's layouts
   * and the other way round. The class is the DOCUMENT's, passed in by the
   * builder, not the shell's seat: a hand typed ?class=micro on a browser
   * seated in the five inch is building a room and wants room presets.
   *
   * A preset never enters the library under its own id. loadTrack hands
   * back a COPY with a fresh trk- id, so the copy saves, exports and
   * publishes like any other track and the shipped one stays pristine
   * beside it. That is the whole of the copy on write.
   */
  const stock = presetsForClass(cls).map((d) => summarise(d, true));
  return [...mine, ...stock];
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
    /*
     * Not saved. It may still be one of the shipped tracks, and a preset
     * opens as a COPY with its own trk- id and the same name. It used to
     * open under the preset's id, and that copy could be saved but never
     * published: the board's validator only accepts trk- and eight hex,
     * so Put on the board answered "That track has no usable id." Found
     * by running the board's own validate.js over all six. The copy keeps
     * the credit, because saving a layout does not make it yours.
     */
    const stock = presetById(id);
    return stock ? normalize(duplicateTrack(stock, stock.name)) : null;
  }
  return normalize(lib[id]);
}

export function deleteTrack(id) {
  const lib = readLibrary();
  if (!lib[id]) {
    return false;
  }
  delete lib[id];
  /* Nothing shipped can be deleted, because nothing shipped is ever in the
   * library: a preset opens as a copy under a new id. */
  return writeJson(LIBRARY_KEY, lib);
}

export function trackExists(id) {
  return Boolean(readLibrary()[id]) || isPresetId(id);
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

/* The track's name, reduced to something safe on every platform. One rule,
 * used by both filenames below and matched by scripts/trackgif.js, so a track
 * exported by the button and by the script lands on the same name. */
function slugOf(doc) {
  return String(doc.name || 'track')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'track';
}

/* A filename that is recognisably the track and is safe on every platform. */
export function exportFilename(doc) {
  return `${slugOf(doc)}.track.json`;
}

export function animationFilename(doc) {
  return `${slugOf(doc)}.gif`;
}

/* Hand the browser some bytes as a file. Shared because the track document
 * and the animation want exactly the same dance and only differ in what is
 * in the blob. */
export function downloadBlob(data, filename, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  /* Revoked on the next turn of the loop: revoking synchronously has raced
   * the download in more than one browser. */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTrack(doc) {
  downloadBlob(serialize(doc), exportFilename(doc), 'application/json');
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('could not read the file'));
    reader.readAsText(file);
  });
}
