/*
 * custom.js: the track you built, as a map.
 *
 * This is the thin end of the integration, and it is deliberately thin. The
 * race field already knows how to build a world around a course; the track
 * builder already knows how to write a document; src/game/trackdoc.js already
 * knows how to turn one into the other. All that is left is to fetch the
 * document and hand it over, which is what this file does and all it does.
 *
 * WHICH TRACK. A published course imported from the public board, if one is
 * sitting in the share seat, otherwise the one open in the builder. Flying
 * a course this browser published writes the share seat from the canvas, so
 * a time can still go back to the same listing. A remix of someone else's
 * course clears that seat, so the canvas is what flies, and the menus offer
 * to publish it under a new name.
 *
 * An optional third argument `{ document }` injects a course without touching
 * either seat. The public board's orbit thumbnail uses that so several cards
 * can show several courses at once.
 *
 * NO TRACK IS NOT AN ERROR. A player who picks this map having never opened
 * the builder gets the world with nothing in it and a note saying so, the
 * same way a freestyle map is a map with no gates rather than a broken race.
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

import { buildFieldScene } from '../render/scene.js';
import { yieldToPaint } from '../ui/loading.js';
/* The composer wrap and its dispose live with the field map, which is the
 * same world this one dresses with a designed course. */
import { attachComposer } from './field.js';
import { courseFromDocument } from '../game/trackdoc.js';
import { readAutosave } from '../trackbuilder/storage.js';
import { activeTrackClass, courseSeatKey, readShareImport } from '../share/session.js';
import { tuningFor } from '../trackbuilder/elements.js';
import { qualityFor } from '../render/quality.js';

/*
 * The document that will be built, or null. A share import wins, then the
 * builder's autosave. Never throws: a corrupt entry yields null and the map
 * says there is no track rather than refusing to boot, which is the same
 * rule the builder applies to its own reads.
 */
export function workingDocument() {
  try {
    const share = readShareImport();
    if (share && share.document) {
      return share.document;
    }
    const saved = readAutosave();
    return saved && saved.doc ? saved.doc : null;
  } catch (e) {
    return null;
  }
}

/*
 * Report a phase AND give the loading screen a frame to draw it in.
 *
 * buildFieldScene awaits whatever its progress callback returns, so this is
 * where the map decides that a report is worth a paint. It is: without it
 * the seven phases inside the build all land in one blocked run of the main
 * thread and the bar shows none of them. Two frames and a task is the
 * shortest sequence that guarantees the pixels are actually on screen; see
 * yieldToPaint in src/ui/loading.js for why one is not enough.
 */
function reporter(progress) {
  return async (f) => {
    progress(f);
    await yieldToPaint();
  };
}

export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const opts = options || {};
  const q = qualityFor(opts.quality);
  const injected = Object.prototype.hasOwnProperty.call(opts, 'document');
  const share = injected ? null : readShareImport();
  const doc = injected ? opts.document : workingDocument();
  const course = doc ? courseFromDocument(doc) : emptyCourse();
  const map = await buildFieldScene(shell, reporter(progress), course, q);
  map.share = share
    ? { id: share.id, name: share.name || doc.name, author: share.author, board: share.board }
    : null;
  /* Stamped from the document this build actually read, not from the seat
   * at adopt time: a second pick during a swap must not claim the first
   * world's geometry is already the new course. */
  map.courseKey = courseSeatKey(share, doc);
  return attachComposer(shell, map, q);
}

/*
 * A course with nothing in it, so the world still builds and the shell still
 * has one shape of map object to work with.
 *
 * IT STILL HAS A CLASS. An empty course is the FIRST thing a new visitor
 * sees, because nobody has built anything yet, and it was the one place the
 * class did not reach: hard coded to a sixty metre field, so a pilot who
 * chose the whoop on the front page got the sixty metre paddock behind it
 * with a 65 mm aircraft in the middle of it. Reported in exactly those
 * words. buildFieldScene reads trackClass to decide between a paddock and a
 * room, and attractOrbit reads it again to keep the title camera inside the
 * room, so those two lines are the whole of the fix.
 *
 * The class comes from the seated aircraft rather than from a document,
 * because there is no document. That is what activeTrackClass is for.
 */
function emptyCourse() {
  const cls = activeTrackClass();
  const T = tuningFor(cls);
  const micro = cls === 'micro';
  return {
    id: 'custom',
    name: 'No track yet',
    documentId: null,
    trackClass: cls,
    field: { width: T.fieldWidth, depth: T.fieldDepth },
    structures: [],
    stations: [],
    spawn: { x: 0, z: 0, yaw: 0 },
    line: [],
    samples: [{ x: 0, z: 0 }],
    guide: { samples: [], dashes: [], arrows: [], flagArcs: [], length: 0 },
    warnings: [micro
      ? 'Nothing has been built yet. Open the whoop track builder from the title screen, place some gates in the room, then come back.'
      : 'Nothing has been built yet. Open the track builder from the title screen, place some gates, then come back.'],
    lapLength: 0,
    closed: false,
  };
}
