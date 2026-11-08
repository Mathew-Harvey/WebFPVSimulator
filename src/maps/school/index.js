/*
 * index.js: Midori Gakuen, the school the Infected mini game is played in
 * (the owner's ask of 8 November 2026), built by the built map's pipeline
 * from its own parts (./school.js) and a document of one start pad
 * (./yard.js). The game on it is src/game/infected.js, and what it needs of
 * the place is `map.infectedGame`.
 *
 * LATENCY: nothing on any other map (this loads only when the map is
 * chosen). Here, one chunk of sixteen colours, sixteen draw calls, and the
 * partners' five signs, the same as every built map's.
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
  schoolLayout, signSpots, hallLoop, CARD_LENS, SCHOOL_PLAN,
} from './school.js';
import { schoolDocument } from './yard.js';
import { INK_COLOR } from '../../render/comic.js';

const CHUNK = 'extra';

/* The houses' pen and grade (../heads/index.js houseInk says why), so the
 * school is inked the way the houses and the shop are. */
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
  const L = schoolLayout();
  const extra = {
    el: { id: 'school', type: 'school' },
    parts: L.parts,
  };
  /* The partners' signs hung by hand, the chooser's spots off: it sees the
   * yard and not the school. */
  const markSpots = signSpots().map((s) => ({ ...s, chunk: CHUNK }));
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: schoolDocument(), extra, sponsorMarks: false, markSpots,
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js), and `source` is the word
   * the board counts its partner signs under. */
  map.id = 'school';
  map.source = 'school';
  /* Drawn near first: see nearFirstSort in src/main.js. */
  map.nearFirst = true;
  /* The title screen flies down the hallway, and the board's picture is
   * taken in it: see hallLoop in ./school.js for why. */
  map.attract = { path: hallLoop(), speed: 5, lookAhead: 12, aimDrop: 2 };
  map.cardLens = CARD_LENS;
  /* The game, for the shell (syncDogfight in src/main.js). */
  map.infectedGame = { plan: SCHOOL_PLAN };
  houseInk(map.post);
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
