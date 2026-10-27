/*
 * index.js: Thomas More's Shop as a map, built the way the houses are
 * (../heads/index.js): the built map's pipeline (../built/index.js) does
 * all of it, the sky, the ground, the ink, the shadows, the colliders, the
 * cull, the named gaps, the marks. This file hands it the hall's document
 * (./yard.js) and the hall itself (./warehouse.js) as one structure of its
 * own, hangs the partners' signs by hand on the hall's walls, and names the
 * world.
 *
 * Nothing is drawn beyond the parts: the hall is boxes in eighteen colours,
 * so it is eighteen draw calls however much is in it.
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
import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import {
  warehouseLayout, signSpots, hallLoop, CARD_LENS,
} from './warehouse.js';
import { warehouseDocument } from './yard.js';
import { INK_COLOR } from '../../render/comic.js';

const CHUNK = 'extra';

/* The houses' pen and grade (../heads/index.js houseInk says why), so the
 * hall reads like the rooms of the houses. */
const HOUSE_PEN = 1.6;
const HOUSE_KEEN = 0.9;
const HOUSE_CORNER_KEEN = 0.5;
const HOUSE_SATURATION = 0.96;
function houseInk(post) {
  const u = post && post.ink && post.ink.mat && post.ink.mat.uniforms;
  if (!u) {
    return;
  }
  u.uInk.value.setHex(INK_COLOR);
  u.uConcaveAmount.value = 1;
  u.uSens.value *= HOUSE_PEN * HOUSE_KEEN;
  u.uConcave.value *= HOUSE_PEN * HOUSE_CORNER_KEEN;
  u.uThickness.value *= HOUSE_PEN;
  post.inkWeight = (post.inkWeight || 1) * HOUSE_PEN;
  const gr = post.grade && post.grade.mat && post.grade.mat.uniforms;
  if (gr && gr.uSaturation) {
    gr.uSaturation.value = HOUSE_SATURATION;
  }
}

export async function buildMap(shell, onProgress, options) {
  const L = warehouseLayout();
  const extra = {
    el: { id: 'warehouse', type: 'warehouse' },
    parts: L.parts,
  };
  const doc = warehouseDocument();
  /* The partners' signs hung by hand, the chooser's spots off: it sees the
   * yard and not the hall. */
  const markSpots = signSpots().map((s) => ({ ...s, chunk: CHUNK }));
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots,
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js), and `source` is the word
   * the board counts its partner signs under (MARK_MAP_WORDS in src/main.js). */
  map.id = 'warehouse';
  map.source = 'warehouse';
  /* Drawn near first: see nearFirstSort in src/main.js. */
  map.nearFirst = true;
  /* The title screen flies inside, and the board's picture is taken
   * inside: see hallLoop in ./warehouse.js for why. The pace is the
   * built map's, slowed for a room. */
  map.attract = { path: hallLoop(), speed: 6, lookAhead: 14, aimDrop: 3 };
  map.cardLens = CARD_LENS;
  houseInk(map.post);
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
