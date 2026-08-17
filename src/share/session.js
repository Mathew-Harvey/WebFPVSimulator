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
 * THE BUILDER'S AUTOSAVE IS A DIFFERENT KEY. A community course opened from
 * the board sits in the share seat. The working canvas is the autosave.
 * They do not overwrite each other, unless the player asks to edit a copy.
 * Flying a course this browser published writes the share seat from the
 * canvas, so a time can still go back to the same listing.
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
const BIND_KEY = 'webfpv.share.bind.v1';
const PENDING_KEY = 'webfpv.share.pending.v1';
const POSTED_KEY = 'webfpv.share.posted.v1';
const INTENT_KEY = 'webfpv.share.builderIntent.v1';

/* Exported: src/trackbuilder/storage.js had a byte-identical pair. This
 * module imports nothing, so the builder can take them from here without a
 * cycle. */
export function readJson(key, fallback) {
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

export function writeJson(key, value) {
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

/*
 * Which course a custom world was built from, or should be built from.
 * The map id is only "custom"; two published courses share that id, so a
 * swap has to compare this key or picking a second course from the menu
 * leaves the first one standing.
 */
export function courseSeatKey(share, doc) {
  if (share && share.id) {
    return `share:${share.id}`;
  }
  if (doc && (doc.id || doc.modifiedUtc)) {
    return `local:${doc.id || 'draft'}:${doc.modifiedUtc || ''}`;
  }
  return 'custom:empty';
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

export function readAllEditKeys() {
  const all = readJson(EDIT_KEY, {});
  if (!all || typeof all !== 'object' || Array.isArray(all)) {
    return {};
  }
  return all;
}

function mapGet(key, id) {
  const all = readJson(key, {});
  if (!all || typeof all !== 'object' || Array.isArray(all) || !id) {
    return null;
  }
  const row = all[id];
  return row && typeof row === 'object' ? row : null;
}

function mapSet(key, id, value) {
  const all = readJson(key, {});
  if (!all || typeof all !== 'object' || Array.isArray(all) || !id) {
    return false;
  }
  if (value == null) {
    delete all[id];
  } else {
    all[id] = value;
  }
  return writeJson(key, all);
}

/*
 * A local document id bound to a listing on the board. Owned listings
 * carry the last name and layout we sent, so a rename can update the
 * board without touching times, and a layout change can warn first.
 */
export function readBind(trackId) {
  return mapGet(BIND_KEY, trackId);
}

export function writeBind(trackId, bind) {
  if (!bind || typeof bind !== 'object') {
    return mapSet(BIND_KEY, trackId, null);
  }
  return mapSet(BIND_KEY, trackId, {
    board: String(bind.board || ''),
    author: String(bind.author || ''),
    nameOnBoard: String(bind.nameOnBoard || ''),
    layoutFingerprint: String(bind.layoutFingerprint || ''),
    owned: Boolean(bind.owned),
    sourceId: bind.sourceId ? String(bind.sourceId) : '',
    sourceName: String(bind.sourceName || ''),
    sourceAuthor: String(bind.sourceAuthor || ''),
  });
}

export function readPendingTime() {
  const raw = readJson(PENDING_KEY, null);
  if (!raw || typeof raw !== 'object' || !raw.trackId || !Number.isFinite(raw.lapMs)) {
    return null;
  }
  return raw;
}

export function writePendingTime(payload) {
  if (!payload || !payload.trackId || !Number.isFinite(payload.lapMs)) {
    return false;
  }
  /* trackId and lapMs only. There used to be a `name` here holding the
   * COURSE name, written by every caller and read by none, sitting one
   * field away from the pilot name it reads like. */
  return writeJson(PENDING_KEY, {
    trackId: String(payload.trackId),
    lapMs: Math.round(payload.lapMs),
  });
}

export function clearPendingTime(trackId) {
  const cur = readPendingTime();
  if (trackId && cur && cur.trackId !== trackId) {
    return;
  }
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch (e) {
    /* nothing to do about it */
  }
}

export function readPostedBest(trackId) {
  const row = mapGet(POSTED_KEY, trackId);
  const ms = row && Number(row.lapMs);
  return Number.isFinite(ms) ? ms : null;
}

export function writePostedBest(trackId, lapMs) {
  const prev = readPostedBest(trackId);
  const next = Math.round(Number(lapMs));
  if (!Number.isFinite(next)) {
    return false;
  }
  if (prev != null && next >= prev) {
    return true;
  }
  return mapSet(POSTED_KEY, trackId, { lapMs: next });
}

export function writeBuilderIntent(intent) {
  if (!intent || typeof intent !== 'object') {
    return false;
  }
  return writeJson(INTENT_KEY, { kind: String(intent.kind || '') });
}

export function readBuilderIntent() {
  const raw = readJson(INTENT_KEY, null);
  if (!raw || typeof raw !== 'object' || !raw.kind) {
    return null;
  }
  return raw;
}

export function takeBuilderIntent() {
  const raw = readBuilderIntent();
  try {
    localStorage.removeItem(INTENT_KEY);
  } catch (e) {
    /* nothing to do about it */
  }
  return raw;
}
