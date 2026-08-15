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
import { buildComposer } from '../render/post.js';
import { courseFromDocument } from '../game/trackdoc.js';
import { readAutosave } from '../trackbuilder/storage.js';
import { readShareImport } from '../share/session.js';
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

/* Enough to put a name on the menu without building anything. */
export function trackSummary() {
  const share = readShareImport();
  const doc = workingDocument();
  if (!doc) {
    return null;
  }
  const gates = doc.sequence.length;
  return {
    name: doc.name,
    gates,
    elements: doc.elements.length,
    shared: Boolean(share),
    author: share ? share.author : '',
    shareId: share ? share.id : null,
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
  const map = buildFieldScene(shell, progress, course, q);
  map.share = share
    ? { id: share.id, name: share.name || doc.name, author: share.author, board: share.board }
    : null;
  const post = buildComposer(shell.renderer, map.scene, shell.camera, q);
  const d = shell.resize();
  post.setSize(d.w, d.h);
  const sceneDispose = map.dispose;
  map.post = post;
  map.dispose = () => {
    post.dispose();
    sceneDispose();
  };
  return map;
}

/* A course with nothing in it, so the world still builds and the shell still
 * has one shape of map object to work with. */
function emptyCourse() {
  return {
    id: 'custom',
    name: 'No track yet',
    documentId: null,
    field: { width: 60, depth: 40 },
    structures: [],
    stations: [],
    spawn: { x: 0, z: 0, yaw: 0 },
    line: [],
    samples: [{ x: 0, z: 0 }],
    guide: { samples: [], dashes: [], arrows: [], flagArcs: [], length: 0 },
    warnings: ['Nothing has been built yet. Open the track builder from the title screen, place some gates, then come back.'],
    lapLength: 0,
    closed: false,
  };
}
