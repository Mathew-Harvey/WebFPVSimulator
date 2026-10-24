/*
 * tinylaps.js: a track from TinyLaps, opened from a link and flown.
 *
 * TinyLaps (tinylaps.kwayzu.com) has an Open in WebFPV button. It sends the track the
 * pilot is drawing, as the file its own Export writes, in the FRAGMENT of a link to this
 * page:
 *
 *   https://webfpv.org/sim/?map=custom&craft=whoop65&fly=1#tinylaps=<payload>
 *
 * The payload is the one a #track= link carries (sharelink.js): `z.` and the raw deflate
 * of the text, or `j.` and the text itself, base64url either way. The button script that
 * writes it is ours too, handed to TinyLaps with its instructions (TINYLAPS.md).
 *
 * WHY THE FRAGMENT. A browser never sends the fragment to a server, so the link needs no
 * API key and no upload endpoint of TinyLaps' own, and TinyLaps' page does nothing but
 * deflate a text and open a tab. ?fly=1 and ?map=custom do the rest, as the builder's Fly
 * this track does.
 *
 * WHAT IT BECOMES. importtinylaps.js turns the file into a whoop track, and this page
 * publishes it to the board before flying it (publishTinyLaps, below), so it is a board
 * track like any other: times post against it, it is listed, and anyone can open it in the
 * builder. Its id is a hash of the file, so the same track sent again is the same board
 * track, and a changed track is a new one.
 *
 * READING ONE IS HOSTILE INPUT. decodeText caps what inflates, the importer never throws
 * and caps what it reads, and anything that is not a TinyLaps track is said on the banner.
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

import { decodeText } from '../trackbuilder/sharelink.js';
import { importTinyLaps } from '../trackbuilder/importtinylaps.js';
import { writeShareImport } from './session.js';
import { boardOrigin, fetchTrackDocument, publishTrack } from './board.js';
import { layoutFingerprint } from './listing.js';
import { normaliseName } from './pilot.js';

export const TINYLAPS_KEY = 'tinylaps';

/* The most a fragment may be: a few times the largest file their editor allows, encoded. */
const MAX_HASH = 4 * 1024 * 1024;

/* FNV-1a, 32 bits, as eight hex digits: an id that is the same for the same file. Not a
 * security measure, only a name. */
function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/* The payload and the designer's name a fragment carries, or null. `hash` is what
 * location.hash gives. `by` is optional: the button sends it when TinyLaps knows it. */
export function tinyLapsFromHash(hash) {
  if (typeof hash !== 'string' || !hash || hash.length > MAX_HASH) {
    return null;
  }
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const payload = params.get(TINYLAPS_KEY);
  if (!payload) {
    return null;
  }
  return { payload, by: (params.get('by') || '').slice(0, 60) };
}

/*
 * The seat for a TinyLaps file's text, as writeShareImport takes it, or { error }.
 * Pure apart from nothing: the caller writes it. Exported for the self test.
 */
export function shareFromTinyLapsText(text, by = '') {
  const got = importTinyLaps(text, { author: by });
  if (got.error) {
    return { error: got.error };
  }
  const id = `tinylaps-${hashText(text)}`;
  /* The document's own id follows the seat's, so two TinyLaps tracks are two tracks to
   * everything that keys on it, and the same one opened twice is one. */
  got.doc.id = `trk-${hashText(text)}`;
  return {
    share: {
      id,
      name: got.doc.name,
      author: by,
      board: '',
      document: got.doc,
      stock: true,
    },
    report: got.report,
  };
}

/* A name the board takes for an author (its NAME_RE, mirrored in ./pilot.js), or the
 * editor's own name when the link gives none or one it would refuse. */
function boardAuthor(by) {
  return normaliseName(by) || 'TinyLaps';
}

/* A promise that gives up after `ms`, so a board that is asleep costs the pilot a bounded
 * wait and never the flight. */
function within(promise, ms) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('The board took too long to answer.')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

const BOARD_WAIT_MS = 20000;

/*
 * ON THE BOARD, EVERY TIME. The owner's rule of 2026-10-24: "imports go straight to the
 * board, so we capture all tracks kwayzu sends us", and anyone can open one in the builder
 * from the board like any other track. So the track is published before it is flown, under
 * the designer's name when the link carries one the board takes and TinyLaps otherwise.
 *
 * ONCE PER FILE. The document's id is the hash of the file, so the same track sent twice is
 * found at its id and flown there, its times with it, and the board holds it once. A track at
 * that id that is not this layout (two files whose hashes agree, which is rare and not
 * impossible) is left alone and this one is published under a fresh id.
 *
 * NOBODY OWNS IT. The edit key the board hands back is not kept, so the pilot who happened to
 * press the button first cannot overwrite what TinyLaps sent; a change is made the way any
 * other track on the board is changed by somebody who did not publish it, as a copy from the
 * builder. An admin can mark it official to change it in place.
 *
 * A BOARD THAT DOES NOT ANSWER does not cost the flight: the track is seated as one that is
 * not on the board, flown at once, and the caller is told so it can say it.
 */
export async function publishTinyLaps(made, { origin = boardOrigin(), board = null } = {}) {
  const api = board || { fetchTrackDocument, publishTrack };
  const doc = made.share.document;
  const want = layoutFingerprint(doc);
  const author = boardAuthor(made.share.author);
  let held = null;
  try {
    held = await within(api.fetchTrackDocument(doc.id, origin), BOARD_WAIT_MS);
  } catch (e) {
    if (e && e.status !== 404) {
      throw e;
    }
  }
  const heldDoc = held && (held.document || held);
  if (heldDoc && layoutFingerprint(heldDoc) === want) {
    return {
      id: held.id || doc.id, name: held.name || doc.name, author: held.author || author, board: origin, document: heldDoc,
    };
  }
  const document = heldDoc ? { ...doc, id: `trk-${randomHex()}` } : doc;
  const got = await within(api.publishTrack({ author, document, origin, tags: ['race'] }), BOARD_WAIT_MS);
  return {
    id: got.id || document.id, name: got.name || document.name, author: got.author || author, board: origin, document,
  };
}

function randomHex() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/*
 * A TinyLaps track in this page's address becomes the course it will fly, published to the
 * board first (publishTinyLaps). Returns { share, offline } with the seat that was written,
 * null when the address carries none, and throws with a sentence for the banner when it
 * carries one that cannot be flown. `offline` is the board's refusal or silence, when the
 * track had to be flown without it.
 */
export async function adoptTinyLapsFromLocation() {
  let found = null;
  try {
    found = tinyLapsFromHash(window.location.hash);
  } catch (e) {
    return null;
  }
  if (!found) {
    return null;
  }
  const text = await decodeText(found.payload);
  if (text == null) {
    throw new Error('The TinyLaps link was cut short or damaged. Press Open in WebFPV again.');
  }
  const made = shareFromTinyLapsText(text, found.by);
  if (made.error) {
    throw new Error(made.error);
  }
  let share = made.share;
  let offline = '';
  try {
    share = await publishTinyLaps(made);
  } catch (e) {
    offline = e && e.message ? e.message : String(e);
  }
  if (!writeShareImport(share)) {
    throw new Error('This browser would not store that track, so it cannot be flown here.');
  }
  return { share, offline };
}
