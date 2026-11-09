/*
 * index.js: Midori Gakuen, the school the Infected mini game is played in
 * (the owner's ask of 8 November 2026), built by the built map's pipeline
 * from its own parts (./school.js) and a document of one start pad
 * (./yard.js). The game on it is src/game/infected.js, and what it needs of
 * the place is `map.infectedGame`.
 *
 * LATENCY: nothing on any other map (this loads only when the map is
 * chosen). Here, one chunk of fifteen colours, fifteen draw calls, the
 * pictures on the walls as one more (./pictures.js: the blackboards were a
 * colour of their own until they were drawn there, so the count is what it
 * was), and the partners' five signs, the same as every built map's. On
 * High only, gradient tone at the foot and head of the walls
 * (../../render/hatch.js, where its cost is said): no draw call, the
 * walls' two colours' programs, arithmetic on the walls' pixels; Low and
 * Medium compile what they did before it.
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

import * as THREE from 'three';
import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import { paintMaterial } from '../../art/stf.js';
import {
  schoolLayout, signSpots, hallLoop, CARD_LENS, SCHOOL_PLAN, S, FLOOR0, CEIL0, F1, CEIL1,
} from './school.js';
import { schoolDocument } from './yard.js';
import { paintPictures, pictureMesh } from './pictures.js';
import { INK_COLOR, comicGL2 } from '../../render/comic.js';
import { hatchMeshes } from '../../render/hatch.js';
import { propMaterial } from '../../props/kit.js';

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
  /* On High, the walls carry gradient tone at their foot and head
   * (src/render/hatch.js): the same meshes, a toned copy of the walls' two
   * colours (the plaster and the hallway's wainscot), swapped in before
   * the built map links its programs. The furniture, floors and ceilings
   * are left as they are. Low and Medium build the school exactly as
   * before, and so does WebGL 1 (the tone needs a derivative). */
  let hatched = 0;
  const extra = {
    el: { id: 'school', type: 'school' },
    parts: L.parts,
    dress: (props, graphics) => {
      const own = graphics === 'high' && comicGL2(shell.renderer) ? props.getObjectByName(`props:${CHUNK}`) : null;
      const walls = new Set([propMaterial('scWall'), propMaterial('scWainscot')]);
      hatched = own ? hatchMeshes(own, walls, { storeys: [FLOOR0 * S, CEIL0 * S, F1 * S, CEIL1 * S] }) : 0;
    },
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
  /* What is drawn on the walls, painted once, one mesh (./pictures.js).
   * The built map's dispose frees what is in its scene, this with it. */
  const atlas = paintPictures(L.pictures);
  if (atlas) {
    const tex = new THREE.CanvasTexture(atlas.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    map.scene.add(pictureMesh(THREE, L.pictures, atlas, paintMaterial(THREE, tex)));
  }
  /* How many colours were toned, for the checks: none below High. */
  map.hatched = hatched;
  houseInk(map.post);
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
