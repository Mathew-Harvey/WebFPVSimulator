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

/*
 * THE ACTIVE CLASS, AND IT IS ONE ANSWER IN ONE PLACE.
 *
 * A pilot flies a five inch on a sixty metre field or a 65 mm whoop in a
 * RaceGOW room, and that choice governs everything downstream of it: which
 * track the shell loads behind the title, which canvas the builder opens,
 * which tracks the board offers. The alternative, threading a class argument
 * through the nine modules that read a seat, was tried on paper and it is
 * nine places for the answer to be different.
 *
 * The seated AIRCRAFT is the copy of record, because that is the thing a
 * pilot chooses; the class is read off it. It lives in the shell's settings
 * because the shell owns settings, and this module reads that key rather
 * than importing the shell, which would be a cycle and would pull the whole
 * user interface into the builder.
 *
 * This file still imports nothing. See the note under readJson.
 */
const SETTINGS_KEY = 'webfpv.settings.v3';
const WHOOP_AIRFRAME_ID = 'whoop65';

export function activeTrackClass() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return 'full';
    }
    const s = JSON.parse(raw);
    return s && s.airframe === WHOOP_AIRFRAME_ID ? 'micro' : 'full';
  } catch (e) {
    /* Private mode, or a blob that is not JSON. The field is what this
     * simulator has always been. */
    return 'full';
  }
}

/*
 * Move the whole experience to a class, by seating the aircraft that flies
 * it. Returns true when the setting was written.
 *
 * It writes the AIRFRAME and marks the question answered, and nothing else.
 * The tune, the pack, the rates and the camera belong to the shell, which
 * reseats any of them still belonging to the other aircraft the next time it
 * loads its settings: see reseatIfForeign in src/ui/ui.js. Doing it here
 * would mean this module knowing the airframe table, and the builder pulling
 * it in to draw a toggle.
 */
export function setActiveTrackClass(cls) {
  const want = cls === 'micro' ? WHOOP_AIRFRAME_ID : '5inch';
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? JSON.parse(raw) : {};
    const next = (s && typeof s === 'object' && !Array.isArray(s)) ? s : {};
    next.airframe = want;
    next.airframeAsked = true;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return true;
  } catch (e) {
    return false;
  }
}

/*
 * The share seat, one per class.
 *
 * A pilot holding a published room and a published field track is holding
 * two different things, and the shell reads whichever the seated aircraft
 * flies. The five inch keeps the original key, so a pilot who has been here
 * before still holds what they were holding.
 */
const IMPORT_KEY = 'webfpv.share.import.v1';
const IMPORT_KEY_MICRO = 'webfpv.share.import.micro.v1';

function importKey(cls) {
  return (cls ?? activeTrackClass()) === 'micro' ? IMPORT_KEY_MICRO : IMPORT_KEY;
}

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

/* `cls` is for the two callers that need to look at the other class's seat,
 * chiefly the builder deciding what to open. Everything else wants the seat
 * for the aircraft that is actually seated, which is the default. */
export function readShareImport(cls) {
  const raw = readJson(importKey(cls), null);
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
  /*
   * NOTHING SEATED, AND EVEN THAT HAS A CLASS.
   *
   * This is the key the shell compares the built world against, so a value
   * that is the same on both aircraft says "the world already matches" when
   * a pilot swaps from the five inch to the whoop with neither seat filled.
   * That is a new visitor, which is most of them, and it left the whoop
   * standing in the sixty metre paddock because the empty custom map is
   * built once and never rebuilt. See emptyCourse in src/maps/custom.js,
   * which is the other half: it is what makes the two empties different
   * worlds in the first place.
   */
  return `custom:empty:${activeTrackClass()}`;
}

export function writeShareImport(payload) {
  if (!payload || !payload.document || !payload.id) {
    return false;
  }
  /* The seat the DOCUMENT belongs in, not the one currently seated: a pilot
   * on a five inch who opens a room from the board is holding a room, and it
   * has to be there when they change aircraft. */
  const cls = payload.document.trackClass === 'micro' ? 'micro' : 'full';
  return writeJson(importKey(cls), {
    id: String(payload.id),
    name: String(payload.name || payload.document.name || 'Untitled track'),
    author: String(payload.author || ''),
    board: String(payload.board || ''),
    document: payload.document,
    /* A track that ships with the simulator, seated from the Track room
     * rather than fetched from the board. inspectCourse reads it: such a
     * seat is not published, cannot take a time, and opens in the builder
     * as a copy. Written as a boolean so a stale seat cannot smuggle
     * anything else in under the name. */
    stock: Boolean(payload.stock),
    importedUtc: new Date().toISOString(),
  });
}

export function clearShareImport(cls) {
  try {
    localStorage.removeItem(importKey(cls));
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
  /*
   * trackId, lapMs, and the three lap total when the run had one. There used
   * to be a `name` here holding the TRACK name, written by every caller and
   * read by none, sitting one field away from the pilot name it reads like.
   *
   * threeMs is the fastest three CONSECUTIVE clean laps of that run, which is
   * what RaceGOW scores, and it is optional in exactly the way the board
   * treats it: absent when the run never put three together, and absent on
   * every run flown on the sixty metre field, which is scored on one lap.
   */
  const three = Number(payload.threeMs);
  return writeJson(PENDING_KEY, {
    trackId: String(payload.trackId),
    lapMs: Math.round(payload.lapMs),
    threeMs: Number.isFinite(three) && three > 0 ? Math.round(three) : null,
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
