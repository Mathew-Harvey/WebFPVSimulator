/*
 * Bakuon Dome: a monster truck hall, its dirt floor, its jumps and four
 * trucks running them, under a white trussed roof open at the crown.
 * Built by the built map's pipeline (../built/index.js) from a document
 * (./yard.js) and a structure of its own (./stadium.js, drawn by
 * ./draw.js), the way Ridgeline MX is, and the trucks are the plant's
 * movers in the place of the built map's cars, the way its bikes are
 * (./course.js drives them, ./trucks.js draws them).
 *
 * The flight lines are the place's: chase a truck up a ramp and over the
 * cars, through the truck tunnels and the gates in the stands, under the
 * bus bridge and the parked trucks, along the stands' faces, over the big
 * screen, and up between the roof's arches and out of the crown.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { buildMap as buildBuilt } from '../built/index.js';
import { uploadTraffic } from '../built/traffic.js';
import { warmPrograms } from '../../render/warm.js';
import { qualityFor } from '../../render/quality.js';
import { domeLayout, OUTER, KONEX } from './stadium.js';
import { domeDocument } from './yard.js';
import { domeTraffic, makeRider } from './course.js';
import { drawDome } from './draw.js';
import { buildTrucks } from './trucks.js';

/*
 * THE CHUNKS: the hall is one ('extra', where its own drawing goes), and
 * the town round it is four, a quarter each. A document's assets are
 * otherwise filed in a 48 m grid, which round a hall this size is sixty
 * cells, each a batch a colour: four quarters keep the streets to a few
 * dozen draw calls.
 */
function chunkOf(x, z) {
  if (Math.abs(x) <= OUTER.x + 8 && Math.abs(z) <= OUTER.z + 8) {
    return 'extra';
  }
  return `dm${x < 0 ? 'w' : 'e'}${z < 0 ? 'n' : 's'}`;
}

export async function buildMap(shell, onProgress, options) {
  const low = qualityFor(options && options.quality).id === 'low';
  const L = domeLayout();
  let drawn = null;
  const extra = {
    el: { id: 'dome', type: 'dome' },
    parts: L.parts,
    draw: (kit) => {
      drawn = drawDome(kit, L, { low });
    },
    chunkOf: (x, z) => chunkOf(x, z),
  };
  /* The one hidden Konex Drone sign (the owner's promise of a logo hidden
   * in every map): flat on the roof of the big screen, 37 m up, facing the
   * crown. Only a pilot who climbs over the screen and looks down sees it. */
  const markSpots = [{
    slug: 'konexdrone', key: 'dome#konexdrone~hidden', p: KONEX.p, n: KONEX.n, up: KONEX.up, w: KONEX.w, chunk: 'extra',
  }];
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: domeDocument(), extra, markSpots,
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js). */
  map.id = 'dome';
  map.source = 'dome';

  /* THE TRUCKS, in the place of the built map's cars. */
  const dome = domeTraffic();
  const rider = makeRider(dome);
  const trucks = buildTrucks(map.look || null, dome, rider);
  map.scene.add(trucks.group);
  map.traffic = dome.traffic.vehicles.length ? dome.traffic : null;
  map.restKeepOut = dome.keepOut;
  map.uploadTraffic = (sim) => uploadTraffic(sim, dome.traffic);
  map.chaseCars = () => [];
  map.poseCars = (prev, curr, alpha, now) => trucks.place(prev, curr, alpha, now);
  map.carTick = (step, poses) => trucks.emit(step, poses);
  map.clearSmoke = () => trucks.clear();
  map.carGap = (x, y, z, reach) => trucks.gapAt(x, y, z, reach);
  const baseDispose = map.dispose;
  map.dispose = () => {
    trucks.dispose();
    if (drawn) {
      for (const t of drawn.owned.textures) {
        t.dispose();
      }
      for (const m of drawn.owned.materials) {
        m.dispose();
      }
    }
    baseDispose();
  };
  const baseStats = map.stats;
  map.stats = () => {
    const s = baseStats ? baseStats() : {};
    return {
      ...s, dome: drawn ? { triangles: drawn.triangles, textures: drawn.textures } : null, trucks: trucks.stats(),
    };
  };
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
