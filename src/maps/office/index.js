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
 * A STOREY IS DRAWN ONLY FROM ITSELF, from outside or from by the core
 * (floorOf, below), and casts no shadow.
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
import {
  officeLayout, signSpots, officeLoop, CARD_LENS, SPAWN, S, FLOORS, FRAME, LEN, DEP, F2, F3, ROOF,
} from './office.js';
import { officeDocument } from './yard.js';
import { paintSigns, signMeshes } from './signs.js';

/* The chunk a document's own element is filed in: the sales floor's,
 * where the start is. */
const DOC_CHUNK = 'of2';

/* The storeys' chunks, ground floor first (FLOORS in ./office.js). */
const FLOOR_CHUNKS = FLOORS.map((f) => f.chunk);

/*
 * WHICH STOREY THE CAMERA CAN SEE, or 0 for all of them. Inside the
 * building a storey's floor and ceiling are solid slabs, so from one
 * storey nothing of another is in view, and drawing it is every one of its
 * triangles for nothing. Except by the core: the stair's well and the lift
 * shaft run the building's height, and through their doors the flights and
 * the shaft of the floors above and below are in view, so near the core,
 * and anywhere outside the walls (where the windows look in on every
 * floor), every storey is drawn.
 */
const CORE_NEAR = { x1: 9.6, y0: 9.4 };
function floorOf(eye) {
  const px = (eye.x - FRAME.OX) / S;
  const py = (FRAME.OZ - eye.z) / S;
  const h = eye.y / S;
  if (px < 0 || px > LEN || py < 0 || py > DEP || h >= ROOF) {
    return 0;
  }
  if (px < CORE_NEAR.x1 && py > CORE_NEAR.y0) {
    return 0;
  }
  return h < F2 ? 1 : (h < F3 ? 2 : 3);
}

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
  const props = map.scene.getObjectByName('props');
  /* Inside casts no shadow: nothing inside takes one (src/props/office.js
   * says why), and the street is shaded by the walls and the roof, which
   * are the street's chunk and the roof's. So the storeys' shadow casters
   * are a pass's worth of triangles for nothing, and they go. */
  const floors = [];
  if (props) {
    for (const g of props.children) {
      const n = FLOOR_CHUNKS.indexOf(g.name.slice('props:'.length));
      if (n < 0) {
        continue;
      }
      for (const m of [...g.children]) {
        if (m.userData.shadowProxy) {
          g.remove(m);
          m.geometry.dispose();
        }
      }
      floors.push({ group: g, n: n + 1 });
    }
  }
  /* One batch a look in each chunk rather than one a colour. */
  const palette = props ? mergePalette(props) : { from: 0, to: 0 };
  /* A storey is drawn only when it can be seen: see floorOf. */
  const seen = { n: 0 };
  const cullFloors = (eye) => {
    const n = floorOf(eye);
    seen.n = n;
    for (const f of floors) {
      f.group.visible = n === 0 || f.n === n;
    }
  };
  const focus = map.updateShadowFocus;
  map.updateShadowFocus = (target) => {
    focus(target);
    cullFloors(shell.camera.position);
  };
  cullFloors(shell.camera.position);
  const stats = map.stats;
  map.stats = () => ({ ...(stats ? stats() : {}), palette, floor: seen.n });
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
