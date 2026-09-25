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
import {
  boardOrigin, fetchTrackDocument, fetchTrackList, publishTrack, TRACK_TAGS, usableTags,
} from './board.js';
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


/*
 * THE SAME TRACK, UNDER WHATEVER ID THE BOARD HOLDS IT AT NOW.
 *
 * A board id is minted by the board and a seat remembers it, so a seat is
 * only as good as the listing it came from. Take a track off the board and
 * put it back, which is what scripts/boardpresets.js --replace does and what
 * an admin removal does, and every browser holding a seat for it is left
 * pointing at an id that no longer exists. The pilot is told their track is
 * on the public board, offered Upload, and gets "That track is not on the
 * board." with nowhere to go and a lap they cannot post. That is what this
 * is for, and it was reported from the seat on a shipped RaceGOW room.
 *
 * THE MATCH IS THE LAYOUT, NOT THE NAME. Two tracks with the same name are
 * not the same track and a time on the wrong one is worse than no time at
 * all, so a candidate only counts when layoutFingerprint agrees exactly.
 * That fingerprint reads the field, the elements and the flying order and
 * ignores the id, the name and the credit, which is precisely what survives
 * a republish. The name is used only to decide what to LOOK at first, and
 * the class narrows it before that: a whoop's lap can only belong to a room.
 *
 * The cap is what keeps this from being a crawl of the whole board. In
 * practice the first candidate is the right one, because it is the one whose
 * name matches; the cap is there for the case where it is not.
 *
 * Returns `{ found, sameName }`. `found` is a seat ready to be written.
 * `sameName` is a listing that wears the name but has a different layout,
 * which is a different message: the board's copy is not what was flown, so
 * the time does not belong on it and the pilot needs to know that rather
 * than be told the track is gone.
 */
const TWIN_LOOKUPS = 6;

export async function findBoardTwin({ doc, name, trackClass, origin } = {}) {
  const want = layoutFingerprint(doc);
  if (!want) {
    return { found: null, sameName: null };
  }
  const board = origin || boardOrigin();
  const list = await fetchTrackList(board);
  const cls = trackClass === 'micro' ? 'micro' : 'full';
  const wanted = String(name || '').trim().toLowerCase();
  const pool = list
    .filter((t) => t.id && t.trackClass === cls)
    /* Same name first, so the usual case costs one document fetch. */
    .sort((a, b) => Number(String(b.name || '').trim().toLowerCase() === wanted)
      - Number(String(a.name || '').trim().toLowerCase() === wanted));
  let sameName = null;
  for (const t of pool.slice(0, TWIN_LOOKUPS)) {
    let payload = null;
    try {
      /* eslint-disable-next-line no-await-in-loop */
      payload = await fetchTrackDocument(t.id, t.board || board);
    } catch (e) {
      /* A candidate the board will not hand over is not a match. Carry on:
       * one bad document must not cost the pilot the others. */
      payload = null;
    }
    const held = payload && (payload.document || payload);
    if (held && layoutFingerprint(held) === want) {
      return {
        found: {
          id: (payload && payload.id) || t.id,
          name: (payload && payload.name) || t.name,
          author: (payload && payload.author) || t.author || '',
          board: t.board || board,
          document: held,
        },
        sameName: null,
      };
    }
    if (!sameName && String(t.name || '').trim().toLowerCase() === wanted) {
      sameName = t;
    }
  }
  return { found: null, sameName };
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
    /* GATES, NOT STEPS. A waypoint is a step in the flying order that
     * pins the line through a point and scores nothing, so counting the
     * order advertises gates a pilot will never fly through: the RaceGOW
     * Track 1 reconstruction has six scored passes and eight waypoints,
     * and this said fourteen. The card in src/ui/ui.js counts a stock
     * track the same way. */
    gates: doc && Array.isArray(doc.sequence)
      ? doc.sequence.filter((s) => {
        const el = (doc.elements || []).find((e) => e.id === s.elementId);
        return Boolean(el) && el.type !== 'waypoint';
      }).length
      : 0,
    elements: doc && Array.isArray(doc.elements) ? doc.elements.length : 0,
    author: extra.author || '',
    shareId: extra.shareId || null,
    board: extra.board || '',
    ...extra,
    /* Who BUILT it, where that is somebody other than who published it. The
     * document's own credit block is the source, so a track seated from the
     * board, from this browser's library or from a preset all name the same
     * person. See byLine in src/ui/ui.js. AFTER the spread, because every
     * caller passes an empty author for a track that has none and one that
     * did the same with the designer would have blanked the document's. */
    designer: extra.designer || (doc && doc.credit ? String(doc.credit.designer || '') : ''),
    series: extra.series || (doc && doc.credit ? String(doc.credit.series || '') : ''),
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

  if (share && share.document && share.stock) {
    /*
     * SHIPPED WITH THE SIMULATOR. Seated from the Track room, not fetched
     * from the board, and it behaves like a remix in waiting: nothing is
     * published, no time can be posted against it, and the builder opens
     * it as a COPY under a new id, because the board only accepts trk-
     * ids and a copy is the only thing that can be published. The record
     * key is share:<preset id>, which is stable, so local laps on a
     * shipped track accumulate against one name.
     */
    const doc = share.document;
    return summaryOf(doc, {
      kind: 'stock',
      published: false,
      owned: false,
      remix: false,
      shareId: null,
      board: '',
      author: share.author || '',
      name: share.name || doc.name,
      canPostTime: false,
      canPublishNew: false,
      canUpdateListing: false,
      layoutDrift: false,
      nameDrift: false,
      authorDrift: false,
      canRemix: true,
      sourceName: share.name || doc.name,
      sourceAuthor: share.author || '',
    });
  }

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

export function hasFlyableTrack() {
  try {
    const listing = inspectCourse();
    return Boolean(listing && listing.doc && !isEmptyCanvas(listing.doc));
  } catch (e) {
    return false;
  }
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
    return { label: 'No track', tone: 'none', note: 'Nothing loaded to fly.' };
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
  if (listing.kind === 'stock') {
    const by = listing.author ? ` by ${listing.author}` : '';
    return {
      label: 'Shipped with the simulator',
      tone: 'none',
      note: `Ships with the simulator${by}. Fly it here, or open a copy in the builder to make it yours and publish it.`,
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
    /*
     * WHAT THE BOARD IS CURRENTLY SHOWING THIS TRACK AS.
     *
     * Tags are not in the document, deliberately: they travel in the
     * publish envelope beside the author so they cannot reach the layout
     * hash and clear somebody's times. That means the document cannot
     * remember them either, so the bind does, and the publish dialog reads
     * them back to pre-tick what the track wears. Without this the dialog
     * opens with nothing ticked, and sending that takes the tags off.
     *
     * The first of these that is a list, most trusted first:
     *
     *   posted.tags  what the board says the track wears now. A board from
     *                25 September onward answers every publish with it.
     *   extra.tags   what this caller sent. A sent list replaces, so it is
     *                what a board that does not answer is holding.
     *   prev.tags    what the bind already knew. `extra.tags` undefined
     *                means the caller sent no list, which the board reads
     *                as "leave them alone" (see inspectTags in its
     *                src/validate.js), so what was known still holds.
     *
     * When none of them is a list the bind carries none, rather than an
     * empty one, and publishedTags reports "not known". See tagsToSend for
     * why that difference is the whole fix.
     */
    tags: [posted && posted.tags, extra.tags, prev.tags].find(Array.isArray),
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

/*
 * The tags the board is showing this track under: a list, empty when it
 * wears none, or null when this browser does not know. The bind is the
 * only place they live on this side: see rememberPublish.
 *
 * NULL IS NOT NONE. Every track published before binds kept their tags is
 * null here, and the board may well be showing tags on it.
 */
export function publishedTags(id) {
  const bind = id ? readBind(id) : null;
  return bind && Array.isArray(bind.tags) ? bind.tags.slice() : null;
}

/*
 * THE TAG LIST A PUBLISH SENDS, OR NONE AT ALL.
 *
 * `held` is publishedTags for the track and `ticked` is what the author
 * ticked in the publish dialog. The board reads the two ways of saying
 * nothing differently, and this is where the builder picks one:
 *
 *   tags: []      take every tag off. This is how "clear all tags" is
 *                 said, and it is sent only when `held` is a list, so the
 *                 dialog was showing the author exactly what they unticked.
 *   no tags key   leave the board's tags alone. Sent when nothing is
 *                 ticked and `held` is null, because then the empty row is
 *                 a dialog that could not see the board's tags, not an
 *                 author who chose none. That is every track published
 *                 before binds kept their tags, and sending [] for them is
 *                 the same untagging this was written to stop. The board's
 *                 answer carries what the track wears, rememberPublish
 *                 keeps it, and from then on the dialog knows.
 *
 * Tags the board holds that this build has no button for ride along, so a
 * builder changes only the tags it can show: see usableTags in ./board.js.
 * They are not counted against the dialog's limit of five, so in the rare
 * case that the two together pass it the board refuses the publish and
 * the dialog prints its reason, which is better than dropping one quietly.
 */
export function tagsToSend(held, ticked) {
  const mine = usableTags(ticked);
  if (!Array.isArray(held) && !mine.length) {
    return undefined;
  }
  const unshown = (held || []).filter((id) => !TRACK_TAGS.some((t) => t.id === id));
  return [...mine, ...unshown];
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
  /*
   * NO TAGS, ON PURPOSE. This is a rename, and a list left out is the
   * board's "leave them alone", so the track keeps what it wears whatever
   * this browser remembers of it. Sending the bind's list instead would put
   * back a stale one. Until 25 September the board read a missing list as
   * an empty one, and this call is one of the two that untagged tracks.
   * syncOwnedIdentity below is the other, and it sends none for the same
   * reason.
   */
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
      /* No tags, as in syncOwnedName: a new handle is not a retag. */
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
