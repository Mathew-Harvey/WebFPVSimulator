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
 * WHY THE FRAGMENT AND NOT THE BOARD. A browser never sends the fragment to a server, so
 * the track needs no account, no upload and no storage, nothing is published that the
 * pilot did not choose to publish, and not one byte of it is served by anything of ours.
 * The board sleeps between visits and waking it takes seconds, and the press has to land
 * in the air. ?fly=1 and ?map=custom do the rest, as the builder's Fly this track does.
 *
 * WHAT IT BECOMES. importtinylaps.js turns the file into a whoop track, and it is seated
 * the way a track that ships with the simulator is (`stock` in session.js): nothing on the
 * board, no time posted against it, and the builder opens it as a copy, which the pilot can
 * publish from there. Its id is a hash of the file, so the same track opened again is the
 * same seat and keeps its local best, and a changed track is a new one.
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

/*
 * A TinyLaps track in this page's address becomes the course it will fly. Returns the
 * seat that was written, null when the address carries none, and throws with a sentence
 * for the banner when it carries one that cannot be flown.
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
  if (!writeShareImport(made.share)) {
    throw new Error('This browser would not store that track, so it cannot be flown here.');
  }
  return made.share;
}
