/*
 * cardgif.js: render a room's card animation and put it on the board.
 *
 * WHY IT IS A FILE OF ITS OWN. Two places publish a track. The builder's
 * own Publish dialog is the usual one, and the simulator's menu publishes
 * the track it is seated on. Both have to leave a room's card looking like
 * a room, and a room's card is an animation of the lap, so the rendering
 * and the sending are written once here and called twice rather than
 * written twice and drifting.
 *
 * WHY THE BROWSER DOES IT AT ALL. The board renders nothing: it is one Node
 * service and one Postgres, it has no WebGL and no Three, and it is not
 * going to grow either. So if the browser that publishes a room does not
 * make its picture, nothing does. The moment after a publish is the only
 * moment when the document, the edit key and a live GL context are all in
 * one place, which is why this is called there rather than put behind a
 * button an author would have to know about.
 *
 * WHY ONLY A ROOM. A sixty metre field's plan is worth drawing and the
 * board draws it from the listing for nothing. A RaceGOW room is five
 * metres across with three gates in it, so its plan is an almost empty
 * rectangle, and what a plan cannot show, height, is what a room track is
 * built out of. The board enforces this too, in inspectGif: a field track
 * is refused an animation. Two checks, and the board's is the one that
 * counts.
 *
 * WHY NOTHING HERE THROWS. The track is already on the board by the time
 * this runs. An author whose GPU refused a context, or who is publishing to
 * a board older than this feature, must be left with a published track and
 * a plan on its card. Never with an error about a picture.
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

import { trackClassOf } from '../trackbuilder/elements.js';
import { postTrackGif } from './board.js';
import { readEditKey } from './session.js';

/*
 * Base64, chunked. btoa wants a binary string and String.fromCharCode
 * applied to a hundred thousand element array overflows the call stack, so
 * the same 0x8000 stride animate.html uses for the same reason.
 */
function base64(bytes) {
  let raw = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    raw += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(raw);
}

/*
 * doc is the document as published. origin is the board it went to.
 *
 * onProgress(done, total) is called after every rendered frame, so a dialog
 * that has just said "Published" can say what it is doing with the three or
 * four seconds that follow.
 *
 * Returns { skipped } for a track this does not apply to, { error } for a
 * failure the author should be told about in a sentence, and { ok, bytes }
 * when the board took it.
 */
export async function sendCardAnimation(doc, { origin, onProgress = null } = {}) {
  if (!doc || trackClassOf(doc) !== 'micro') {
    return { skipped: 'not-a-room' };
  }
  try {
    /* Imported here rather than at the top, because animate.js pulls in
     * Three and the whole stage builder, and a pilot who never publishes a
     * room should never pay for either. */
    const { CARD_GIF, exportTrackGif } = await import('../trackbuilder/animate.js');
    const bytes = await exportTrackGif(doc, { ...CARD_GIF, onProgress });
    await postTrackGif({
      id: doc.id,
      gif: base64(bytes),
      editKey: readEditKey(doc.id),
      origin,
    });
    return { ok: true, bytes: bytes.length };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}
