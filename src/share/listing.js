/*
 * listing.js: how a course in this browser relates to the public board.
 *
 * The share seat is a published listing this run can post a time to. The
 * builder canvas is a different key. This file is the one place that looks
 * at both, plus the edit key, and says what the player can do next: upload
 * a time, update a name they own, or publish a copy under a new name.
 *
 * Layout is everything that makes two courses different races: the field,
 * the elements, the flying order. The title is not layout. The handle is
 * not layout either. The board uses the same split, so renaming an owned
 * course keeps the times, and changing the name this browser flies under
 * updates the author and the times posted under the old handle on courses
 * this browser published.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { duplicateTrack, toPlain } from '../trackbuilder/model.js';
import { readAutosave, writeAutosave } from '../trackbuilder/storage.js';
import { boardOrigin, fetchTrackDocument, publishTrack } from './board.js';
import { readPilotName } from './pilot.js';
import {
  clearShareImport,
  courseSeatKey,
  readAllEditKeys,
  readBind,
  readEditKey,
  readShareImport,
  writeBind,
  writeEditKey,
  writeShareImport,
} from './session.js';

/*
 * MIRRORS layoutHash in WebFPVSimulator-LeaderBoard/src/validate.js. The
 * board decides when a layout has changed enough to clear a course's times;
 * this is the client's prediction of that answer, used to warn before
 * publishing. They must agree on WHICH KEYS count as the layout, currently
 * field, elements and sequence, AND on which element types are dressing
 * rather than layout. Different hashes, same key list and same skip list:
 * change one and change the other, or the warning and the clearing
 * disagree.
 */
/*
 * Element types that are painted on rather than flown through, so changing
 * them cannot change a lap.
 *
 * THIS IS WHY A SPONSOR DOES NOT WIPE A LEADERBOARD. Selling a place on an
 * existing course means adding a mark to a track people have already flown,
 * and if that counted as a layout change every time on the board would be
 * cleared the moment the deal was signed. Paint has no collider and is not
 * in the flying order, so a lap flown before it was painted is the same lap.
 *
 * Written out as a literal rather than derived from the element library,
 * because the board has no element library and the two lists have to be
 * edited together on purpose. MIRRORS LAYOUT_SKIP in the board's
 * validate.js.
 */
const LAYOUT_SKIP = new Set(['groundLogo']);

export function layoutFingerprint(doc) {
  if (!doc || typeof doc !== 'object') {
    return '';
  }
  let plain = doc;
  try {
    if (doc.schemaVersion) {
      plain = toPlain(doc);
    }
  } catch (e) {
    plain = doc;
  }
  return JSON.stringify({
    field: plain.field ?? {},
    elements: (plain.elements ?? []).filter((e) => !LAYOUT_SKIP.has(e?.type)),
    sequence: plain.sequence ?? [],
  });
}

export function isEmptyCanvas(doc) {
  return !doc || ((doc.elements || []).length === 0 && (doc.sequence || []).length === 0);
}

export function suggestRemixName(original) {
  const base = String(original || '').trim() || 'Untitled track';
  const tagged = / remix$/i.test(base) ? base : `${base} remix`;
  return tagged.slice(0, 80);
}

export function hasFlyingOrder(doc) {
  return Boolean(doc && Array.isArray(doc.sequence) && doc.sequence.length > 0);
}

/* The custom map the shell should be showing, from the two seats. */
export function seatedCourseKey() {
  const share = readShareImport();
  if (share && share.id) {
    return courseSeatKey(share, share.document);
  }
  try {
    const saved = readAutosave();
    return courseSeatKey(null, saved && saved.doc);
  } catch (e) {
    return courseSeatKey(null, null);
  }
}

function pick(parts, key, fallback) {
  return Object.prototype.hasOwnProperty.call(parts, key) ? parts[key] : fallback();
}

function summaryOf(doc, extra) {
  return {
    name: extra.name || (doc && doc.name) || 'Untitled track',
    gates: doc && Array.isArray(doc.sequence) ? doc.sequence.length : 0,
    elements: doc && Array.isArray(doc.elements) ? doc.elements.length : 0,
    author: extra.author || '',
    shareId: extra.shareId || null,
    board: extra.board || '',
    ...extra,
    doc: doc || null,
  };
}

/*
 * What this browser will fly, and what the menus should offer.
 *
 *   community   a published course opened from the board, not ours
 *   owned       a listing this browser published, edit key in hand
 *   remix       a local copy of someone else's course, not on the board yet
 *   local       an unpublished original
 *   none        nothing to fly
 *
 * `parts` is for tests. The live path reads the two seats and the keys.
 */
export function inspectCourse(parts = {}) {
  const share = pick(parts, 'share', readShareImport);
  const saved = pick(parts, 'autosave', () => {
    try {
      return readAutosave();
    } catch (e) {
      return null;
    }
  });
  const editKeyFor = parts.editKeyFor || readEditKey;
  const bindFor = parts.bindFor || readBind;
  const currentName = pick(parts, 'pilotName', () => readPilotName());

  if (share && share.document) {
    const doc = share.document;
    const id = share.id || doc.id;
    const owned = Boolean(editKeyFor(id));
    const bind = bindFor(id);
    const fp = layoutFingerprint(doc);
    const layoutMatch = !bind || !bind.layoutFingerprint || bind.layoutFingerprint === fp;
    const nameOnBoard = bind ? bind.nameOnBoard : (share.name || doc.name);
    const listedAuthor = (bind && bind.author) || share.author || '';
    const authorDrift = Boolean(owned && currentName && listedAuthor && currentName !== listedAuthor);
    return summaryOf(doc, {
      kind: owned ? 'owned' : 'community',
      published: true,
      owned,
      remix: false,
      shareId: id,
      board: share.board || (bind && bind.board) || '',
      author: listedAuthor,
      name: share.name || doc.name,
      canPostTime: layoutMatch,
      canPublishNew: false,
      canUpdateListing: owned && (!layoutMatch || nameOnBoard !== (doc.name || share.name) || authorDrift),
      layoutDrift: Boolean(owned && bind && bind.layoutFingerprint && bind.layoutFingerprint !== fp),
      nameDrift: Boolean(owned && bind && bind.nameOnBoard && bind.nameOnBoard !== (doc.name || share.name)),
      authorDrift,
      canRemix: !owned,
      sourceName: '',
      sourceAuthor: '',
    });
  }

  const doc = saved && saved.doc ? saved.doc : null;
  if (!doc) {
    return summaryOf(null, {
      kind: 'none',
      published: false,
      owned: false,
      remix: false,
      canPostTime: false,
      canPublishNew: false,
      canUpdateListing: false,
      layoutDrift: false,
      nameDrift: false,
      authorDrift: false,
      canRemix: false,
      sourceName: '',
      sourceAuthor: '',
    });
  }

  const id = doc.id;
  const owned = Boolean(editKeyFor(id));
  const bind = bindFor(id) || {};
  const remix = Boolean(bind.sourceId) && !owned;
  const fp = layoutFingerprint(doc);
  const layoutMatch = !bind.layoutFingerprint || bind.layoutFingerprint === fp;

  if (owned) {
    const authorDrift = Boolean(currentName && bind.author && currentName !== bind.author);
    return summaryOf(doc, {
      kind: 'owned',
      published: true,
      owned: true,
      remix: false,
      shareId: id,
      board: bind.board || '',
      author: bind.author || '',
      canPostTime: layoutMatch,
      canPublishNew: false,
      canUpdateListing: !layoutMatch || (bind.nameOnBoard && bind.nameOnBoard !== doc.name) || authorDrift,
      layoutDrift: Boolean(bind.layoutFingerprint && bind.layoutFingerprint !== fp),
      nameDrift: Boolean(bind.nameOnBoard && bind.nameOnBoard !== doc.name),
      authorDrift,
      canRemix: false,
      sourceName: bind.sourceName || '',
      sourceAuthor: bind.sourceAuthor || '',
    });
  }

  if (remix) {
    return summaryOf(doc, {
      kind: 'remix',
      published: false,
      owned: false,
      remix: true,
      shareId: null,
      board: bind.board || '',
      author: '',
      canPostTime: false,
      canPublishNew: hasFlyingOrder(doc),
      canUpdateListing: false,
      layoutDrift: false,
      nameDrift: false,
      authorDrift: false,
      canRemix: false,
      sourceName: bind.sourceName || '',
      sourceAuthor: bind.sourceAuthor || '',
    });
  }

  return summaryOf(doc, {
    kind: 'local',
    published: false,
    owned: false,
    remix: false,
    shareId: null,
    board: '',
    author: '',
    canPostTime: false,
    canPublishNew: hasFlyingOrder(doc),
    canUpdateListing: false,
    layoutDrift: false,
    nameDrift: false,
    authorDrift: false,
    canRemix: false,
    sourceName: '',
    sourceAuthor: '',
  });
}

/*
 * How a course relates to the board, in three words.
 *
 * ONE VOCABULARY, THREE SURFACES. inspectCourse already works this out
 * exactly, and until now the answer was spoken differently everywhere it
 * appeared: the track builder had a chip in its top bar, the simulator had
 * five paragraphs of prose in a help column, and the two used different
 * words for the same state. A player had to read a paragraph to learn
 * whether they could upload a time. Both callers now take the label from
 * here, so the same course wears the same badge wherever it is met.
 *
 * `tone` is the colour role, not a colour: mint is a course that is live on
 * the board, amber is one that needs an action before it can be, slate is
 * one that has never been published. The stylesheets decide the hex.
 */
export function courseChip(listing) {
  if (!listing || listing.kind === 'none') {
    return { label: 'No course', tone: 'none', note: 'Nothing loaded to fly.' };
  }
  if (listing.kind === 'owned') {
    if (listing.layoutDrift) {
      return {
        label: 'Layout not on the board',
        tone: 'warn',
        note: 'The layout changed since it was published. Update the board before uploading a time.',
      };
    }
    if (listing.nameDrift) {
      return {
        label: 'Rename waiting',
        tone: 'warn',
        note: 'The board still carries the old name. Updating it keeps the times.',
      };
    }
    return { label: 'On the board', tone: 'live', note: 'Yours, published. Fly it and upload a time.' };
  }
  if (listing.kind === 'community') {
    const by = listing.author ? ` by ${listing.author}` : '';
    return {
      label: 'On the board',
      tone: 'live',
      note: `Published${by}. Fly it and upload a time, or edit a copy under your own name.`,
    };
  }
  if (listing.kind === 'remix') {
    const of = listing.sourceName ? ` of ${listing.sourceName}` : '';
    return {
      label: `Copy${of}`,
      tone: 'warn',
      note: 'Your copy. Publish it under a new name to put it on the board.',
    };
  }
  return {
    label: 'Not on the board',
    tone: 'none',
    note: listing.canPublishNew
      ? 'Lives in this browser. Publish it to put it on the board, then you can upload a time.'
      : 'Lives in this browser. It needs a flying order before it can be published.',
  };
}

/*
 * A remix of a course, and the bind that would make it this browser's.
 *
 * The bind is RETURNED rather than written, because one of the two callers
 * asks the author to confirm first: writing it here meant declining the
 * "open a copy?" prompt still left a bind behind for a document that was
 * never opened. The caller commits when the fork actually happens.
 */
export function forkDocument(doc, extra = {}) {
  const copy = duplicateTrack(doc, extra.name || suggestRemixName(doc && doc.name));
  const bind = {
    board: extra.board || '',
    author: '',
    nameOnBoard: '',
    layoutFingerprint: '',
    owned: false,
    sourceId: extra.sourceId || (doc && doc.id) || '',
    sourceName: extra.sourceName || (doc && doc.name) || '',
    sourceAuthor: extra.sourceAuthor || '',
  };
  return { copy, commit: () => writeBind(copy.id, bind) };
}

export function rememberPublish(doc, posted, origin, author, extra = {}) {
  const plain = toPlain(doc);
  const id = (posted && posted.id) || plain.id;
  if (posted && posted.editKey) {
    writeEditKey(id, posted.editKey);
  }
  const prev = readBind(plain.id) || readBind(id) || {};
  writeBind(id, {
    board: origin || prev.board || '',
    author: author || prev.author || '',
    nameOnBoard: (posted && posted.name) || plain.name || '',
    layoutFingerprint: layoutFingerprint(plain),
    owned: true,
    sourceId: prev.sourceId || '',
    sourceName: prev.sourceName || '',
    sourceAuthor: prev.sourceAuthor || '',
  });
  if (extra.touchShare !== false) {
    writeShareImport({
      id,
      name: (posted && posted.name) || plain.name || '',
      author: author || '',
      board: origin || prev.board || '',
      document: plain,
    });
  }
  return id;
}

export async function syncOwnedName(doc, origin) {
  const plain = doc && doc.schemaVersion ? toPlain(doc) : doc;
  if (!plain || !plain.id) {
    return { skipped: 'no-doc' };
  }
  const key = readEditKey(plain.id);
  if (!key) {
    return { skipped: 'not-owned' };
  }
  const bind = readBind(plain.id) || {};
  const board = origin || bind.board || boardOrigin();
  const author = readPilotName() || bind.author || '';
  if (!author) {
    return { skipped: 'no-author' };
  }
  const authorChanged = Boolean(author && bind.author && bind.author !== author);
  if (bind.nameOnBoard && bind.nameOnBoard === plain.name && !authorChanged) {
    return { skipped: 'current' };
  }
  let publishedFp = bind.layoutFingerprint || '';
  if (!publishedFp) {
    try {
      const payload = await fetchTrackDocument(plain.id, board);
      const remote = payload.document || payload;
      publishedFp = layoutFingerprint(remote);
      const remoteName = payload.name || remote.name;
      const remoteAuthor = payload.author || '';
      if (remoteName === plain.name && (!remoteAuthor || remoteAuthor === author)) {
        writeBind(plain.id, {
          ...bind,
          board,
          author: remoteAuthor || author,
          nameOnBoard: remoteName,
          layoutFingerprint: publishedFp,
          owned: true,
        });
        return { skipped: 'current' };
      }
    } catch (e) {
      return { skipped: 'offline', error: e };
    }
  }
  if (publishedFp && publishedFp !== layoutFingerprint(plain)) {
    return { skipped: 'layout-changed' };
  }
  const posted = await publishTrack({
    author,
    document: plain,
    editKey: key,
    origin: board,
  });
  rememberPublish(plain, posted, board, author);
  return { ok: true, posted };
}

/*
 * The handle lives in this browser. Courses and times on the board still
 * carry the name they were sent with, until this browser pushes the new
 * one. Courses this browser published are the ones it can retitle: the
 * author line, and times posted under the old handle on those courses.
 */
export async function syncOwnedIdentity(origin) {
  const author = readPilotName();
  if (!author) {
    return { skipped: 'no-author' };
  }
  const keys = readAllEditKeys();
  const ids = Object.keys(keys).filter((id) => keys[id]);
  if (!ids.length) {
    return { skipped: 'none-owned' };
  }
  const share = readShareImport();
  const results = [];
  for (const id of ids) {
    const bind = readBind(id) || {};
    if (bind.author && bind.author === author) {
      results.push({ id, skipped: 'current' });
      continue;
    }
    const board = origin || bind.board || boardOrigin();
    try {
      const payload = await fetchTrackDocument(id, board);
      const document = payload.document || payload;
      const remoteAuthor = payload.author || '';
      if (remoteAuthor === author) {
        writeBind(id, {
          ...bind,
          board,
          author,
          nameOnBoard: payload.name || document.name || bind.nameOnBoard || '',
          layoutFingerprint: bind.layoutFingerprint || layoutFingerprint(document),
          owned: true,
        });
        results.push({ id, skipped: 'current' });
        continue;
      }
      const posted = await publishTrack({
        author,
        document,
        editKey: keys[id],
        origin: board,
      });
      rememberPublish(document, posted, board, author, {
        touchShare: Boolean(share && share.id === id),
      });
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, error: e });
    }
  }
  return { results };
}

export async function pushOwnedListing(doc, origin) {
  let named = null;
  if (doc) {
    named = await syncOwnedName(doc, origin);
  }
  const identity = await syncOwnedIdentity(origin);
  return { named, identity };
}

export async function publishCurrentCourse({ doc, author, origin, courseName }) {
  let working = toPlain(doc);
  if (courseName && courseName !== working.name) {
    working = { ...working, name: courseName };
  }
  const board = origin || readBind(working.id)?.board || boardOrigin();
  const trySend = async (payload) => publishTrack({
    author,
    document: payload,
    editKey: readEditKey(payload.id),
    origin: board,
  });
  try {
    const posted = await trySend(working);
    rememberPublish(working, posted, board, author);
    writeAutosave(working);
    return { posted, doc: working, forked: false };
  } catch (e) {
    if (!e || !e.conflict) {
      throw e;
    }
    const copy = forkDocument(working, {
      name: working.name,
      board,
      sourceId: working.id,
      sourceName: working.name,
      sourceAuthor: '',
    });
    const plain = toPlain(copy);
    const posted = await trySend(plain);
    rememberPublish(plain, posted, board, author);
    writeAutosave(plain);
    return { posted, doc: plain, forked: true };
  }
}

export function bindOwnedCanvas(doc, origin, author) {
  const plain = toPlain(doc);
  const bind = readBind(plain.id) || {};
  writeShareImport({
    id: plain.id,
    name: plain.name,
    author: author || bind.author || readPilotName() || '',
    board: origin || bind.board || boardOrigin(),
    document: plain,
  });
}

export function flyCanvasWithoutListing() {
  clearShareImport();
}
