/*
 * index.js: Hoshino Shoji, a small Japanese trading company's building,
 * flown on a whoop (./office.js has the building and why it is the way it
 * is). Built by the built map's pipeline (src/maps/built/), as Thomas
 * More's Shop is: the sky, the ground, the ink, the shadows, the colliders,
 * the gaps and the scoring are all the pipeline's.
 *
 * THE FLOORS ARE THE CHUNKS. Each storey's parts are filed under a chunk
 * of their own, and the roof, and the street, so the pipeline culls a
 * floor as one cell and bakes it to one batch a colour; the town's palette
 * merge (../sunny/palette.js) then folds a chunk's plain batches into one,
 * the colours riding on the vertices. So the office is a few draws a
 * floor, however many binders are on its shelves.
 *
 * ON LOW the fine parts are not drawn: the cups, the laptops, the rungs,
 * the seams. None of them is solid, so the flight is the same.
 *
 * THE WORDS AND PICTURES are one canvas (./signs.js) on two meshes, the
 * lit and the glowing.
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
import { qualityFor } from '../../render/quality.js';
import { paintMaterial } from '../../art/stf.js';
import { mergePalette } from '../sunny/palette.js';
import { INK_COLOR } from '../../render/comic.js';
import { officeLayout, signSpots, officeLoop, CARD_LENS, SPAWN, S } from './office.js';
import { officeDocument } from './yard.js';
import { paintSigns, signMeshes } from './signs.js';

/* The chunk a document's own element is filed in: the sales floor's,
 * where the start is. */
const DOC_CHUNK = 'of2';

/* The houses' pen and grade (../heads/index.js houseInk says why), so the
 * office is inked in the same hand as Thomas More's Shop. */
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
  const low = qualityFor(options && options.quality).id === 'low';
  const L = officeLayout();
  const extra = {
    el: { id: 'office', type: 'office' },
    parts: low ? L.parts.filter((p) => !(p.fine && !p.solid)) : L.parts,
    chunkOf: (x, z, p) => (p && p.chunk) || DOC_CHUNK,
    /* The start is on the sales floor, not on the street: the document
     * seats its pads before the building is in, so the pipeline is told
     * which floor to look for (addExtra in ../built/index.js). */
    padBase: S * SPAWN.h,
  };
  const doc = officeDocument();
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots: signSpots(),
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js), and `source` is the word
   * the board counts its partner signs under (MARK_MAP_WORDS in src/main.js). */
  map.id = 'office';
  map.source = 'office';
  /* Drawn near first: see nearFirstSort in src/main.js. */
  map.nearFirst = true;
  /* One batch a look in each chunk rather than one a colour. */
  const props = map.scene.getObjectByName('props');
  const palette = props ? mergePalette(props) : { from: 0, to: 0 };
  const stats = map.stats;
  map.stats = () => ({ ...(stats ? stats() : {}), palette });
  /* The title screen flies the sales floor, and the board's picture is
   * taken inside: see officeLoop in ./office.js. */
  map.attract = { path: officeLoop(), speed: 6, lookAhead: 14, aimDrop: 3 };
  map.cardLens = CARD_LENS;
  /* The words and pictures, one canvas on two meshes. */
  const atlas = paintSigns(L.signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const glow = new THREE.MeshBasicMaterial({
    map: tex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  for (const m of signMeshes(THREE, L.signs, atlas, paintMaterial(THREE, tex), glow)) {
    map.scene.add(m);
  }
  houseInk(map.post);
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
