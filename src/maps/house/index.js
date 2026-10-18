/*
 * index.js: Nick Burns' house as a map. The built map's pipeline
 * (../built/index.js) does all of it: the sky, the ground, the ink, the
 * shadows, the colliders, the cull, the named gaps, the marks. This file
 * hands it the house's document (./yard.js) and the house itself
 * (./house.js) as one structure of its own, draws what the parts cannot
 * say, and names the world.
 *
 * WHAT THE DRAW ADDS, in the world frame, after the kit has drawn every
 * part the house marks as drawn:
 *
 *   prisms   the roofs' slopes, gables and fascias, the slide: a profile
 *            extruded along one axis. Drawn only; their solids are the
 *            roofs' bands, which are parts.
 *   discs    the cul de sac's paving, its kerb and island, the mulch
 *            round the trees: level discs and rings, drawn only.
 *   cones    the patio umbrella.
 *   scaled   the town's own trees and cars, drawn through a frame k times
 *            their size, so a street tree is a tree over a house three
 *            times life size and a car is a car on its drive. Their solids
 *            are the same parts scaled the same way (scaledParts in
 *            ./house.js), drawn nowhere.
 *
 * The trees and the cars go in chunks of their own, so the house's own
 * batch is the house and nothing else, and a tree behind the pilot culls.
 *
 * Nick himself is added after the pipeline has built the rest: his life
 * in ./nick.js, his figure and his speech balloon in ./nickdraw.js. He is
 * drawn and never solid.
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
import { houseLayout, basementFloorAt, FRAME, worldAt } from './house.js';
import { houseDocument } from './yard.js';
import { makeNick } from './nickdraw.js';

const CHUNK = 'extra';

/* Prisms along x are drawn turned a quarter, so the kit's extrusion along
 * its local z runs east; along y they are drawn unturned and run south. */
function drawPrisms(kit, prisms) {
  const { OX, OZ, S } = FRAME;
  kit.begin(0, 0, 0, Math.PI / 2, CHUNK);
  for (const p of prisms) {
    if (p.axis === 'x') {
      kit.extrude(p.m, p.profile.map(([a, h]) => [S * a - OZ, S * h]), OX + S * p.e0, OX + S * p.e1);
    }
  }
  kit.begin(0, 0, 0, 0, CHUNK);
  for (const p of prisms) {
    if (p.axis === 'y') {
      kit.extrude(p.m, p.profile.map(([a, h]) => [OX + S * a, S * h]), OZ - S * p.e1, OZ - S * p.e0);
    }
  }
}

function drawDiscs(kit, discs) {
  const { S } = FRAME;
  kit.begin(0, 0, 0, 0, CHUNK);
  for (const d of discs) {
    const [x, y, z] = worldAt(d.px, d.py, d.h);
    if (d.r0) {
      kit.ring(d.m, [x, y, z], S * d.r0, S * d.r, y);
    } else {
      kit.cyl(d.m, [x, 0, z], [x, y, z], S * d.r, 48);
    }
  }
}

function drawScaled(kit, scaled) {
  const T = kit.THREE;
  for (const a of scaled) {
    const [x, y, z] = worldAt(a.px, a.py, a.h);
    kit.begin(x, y, z, a.yaw, a.chunk);
    kit.place.multiply(new T.Matrix4().makeScale(a.k, a.k, a.k));
    kit.element(a.el);
  }
}

function drawHouse(kit, L) {
  drawPrisms(kit, L.prisms);
  drawDiscs(kit, L.discs);
  kit.begin(0, 0, 0, 0, CHUNK);
  for (const c of L.cones) {
    kit.cone(c.m, c.base, c.r, c.h, 12);
  }
  drawScaled(kit, L.scaled);
}

export async function buildMap(shell, onProgress, options) {
  const L = houseLayout();
  const extra = {
    el: { id: 'house', type: 'house' },
    parts: L.parts,
    draw: (kit) => drawHouse(kit, L),
    floor: basementFloorAt,
  };
  const map = await buildBuilt(shell, onProgress, { ...(options || {}), document: houseDocument(), extra, sponsorMarks: false });
  /* Its own world, not Your map: the shell keys the world, the results and
   * the board's refusal by this id (src/main.js, src/ui/ui.js), and `source`
   * keeps its marks out of the board's counters, which have no word for it. */
  map.id = 'house';
  map.source = 'house';
  /* Nick at his patio table (./nick.js, ./nickdraw.js): in the map's scene,
   * so its dispose frees him, posed at the clock the map is handed, and his
   * two programs linked now beside the rest, since the map warmed its own
   * before he was there (render/warm.js). */
  const nick = makeNick(shell.camera);
  map.scene.add(nick.group);
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  const anim = map.updateAnim;
  map.updateAnim = (step) => {
    anim(step);
    nick.update(step);
  };
  const stats = map.stats;
  map.stats = () => ({ ...stats(), nick: nick.stats() });
  return map;
}
