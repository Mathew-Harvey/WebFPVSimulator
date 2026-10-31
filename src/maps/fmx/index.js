/*
 * index.js: Shiroyama FMX, a map and a camera game. Section 17 of the
 * owner's map list of 31 October 2026, "Stadium FMX": follow riders off
 * kicker ramps, gaps of 20 to 30 m, in the manga look of The town.
 *
 * THE PLACE is an open air freestyle motocross show in a castle park, at
 * golden hour, which is what makes it its own and not Ridgeline MX's
 * hillside or a domed stadium: two steel kickers and two dirt landings 26 m
 * apart on a dirt floor, a yagura festival tower with its drum between
 * them, grandstands down both sides with the north one roofed, a big screen
 * over the stage at the east end, the commentary box over the riders' gate
 * at the west, four floodlight towers, and beyond the gate a lantern path to
 * a red bridge over the moat and the castle on its stone base. ./arena.js is
 * the layout and the solids, ./dress.js draws it, ./paint.js paints what is
 * printed, ./yard.js is the document round it: the town, the trees, the
 * pilot's start and the named gaps.
 *
 * THE RIDERS are the physics module's movers, four of them a quarter of a
 * lap apart round one loop (./traffic.js), flying the arcs a bike at their
 * speed flies (./profile.js) and pulling a trick over every one, drawn by
 * Ridgeline MX's bikes (src/maps/moto/bikes.js) through ./ride.js.
 *
 * THE GAME is Ridgeline MX's: src/game/film.js judges what the camera sees
 * of the riders, the kickers, the landings and the yagura are the zones a
 * shot counts for more in.
 *
 * FOR THE LATENCY RULE, measured and written in the PR: on every other map,
 * nothing (this file loads only when the map is chosen). On this map the
 * place is in the built map's batches, one draw call a colour a chunk, in
 * three chunks, and the riders cost a draw call each. Per frame on the CPU:
 * four bikes' matrices and the judge, nothing allocated.
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
import { Film } from '../../game/film.js';
import { arenaLayout, KONEX } from './arena.js';
import { fmxDocument, FMX_NAME } from './yard.js';
import { fmxTraffic } from './traffic.js';
import { makeRider } from './ride.js';
import { buildBikes } from '../moto/bikes.js';
import {
  dress, paintedMaterials, chunkOf, CHUNK_ARENA,
} from './dress.js';

export async function buildMap(shell, onProgress, options) {
  const L = arenaLayout();
  const doc = fmxDocument();
  const low = qualityFor(options && options.quality).id === 'low';
  const painted = paintedMaterials();
  const extra = {
    el: { id: 'fmx', type: 'fmx' },
    parts: L.parts,
    padBase: 0,
    chunkOf,
    draw: (kit) => dress(kit, { mats: painted.mats, quality: low ? 'low' : 'high' }),
  };
  /* The one hidden Konex Drone sign: on the inside of the yagura's skirt,
   * under the drummers' deck, facing west. Only a quad that threads the
   * tower's legs sees it. */
  const markSpots = [{
    slug: 'konexdrone', key: 'fmx#konexdrone~hidden', p: KONEX.p, n: KONEX.n, up: KONEX.up, w: KONEX.w, chunk: CHUNK_ARENA,
  }];
  const map = await buildBuilt(shell, onProgress, { ...(options || {}), document: doc, extra, markSpots });
  map.id = 'fmx';
  map.source = 'fmx';

  /* THE RIDERS, in the place of the built map's cars. */
  const fmx = fmxTraffic();
  const rider = makeRider(fmx);
  const bikes = buildBikes(map.look || null, fmx, rider);
  map.scene.add(bikes.group);
  map.traffic = fmx.traffic.vehicles.length ? fmx.traffic : null;
  map.restKeepOut = fmx.keepOut;
  map.uploadTraffic = (sim) => uploadTraffic(sim, fmx.traffic);
  map.chaseCars = () => [];
  map.poseCars = (prev, curr, alpha, now) => bikes.place(prev, curr, alpha, now);
  map.carTick = (step, poses) => bikes.emit(step, poses);
  map.clearSmoke = () => bikes.clear();
  map.carGap = (x, y, z, reach) => bikes.gapAt(x, y, z, reach);
  const baseDispose = map.dispose;
  map.dispose = () => {
    bikes.dispose();
    baseDispose();
    for (const t of painted.owned.textures) {
      t.dispose();
    }
    for (const m of painted.owned.materials) {
      m.dispose();
    }
  };
  const baseStats = map.stats;
  map.stats = () => {
    const s = baseStats();
    return { ...s, bikes: bikes.stats() };
  };

  /* THE GAME, for the shell (filmFeed in src/main.js), as Ridgeline MX's. */
  const film = new Film();
  film.setCars(fmx.bikes.map((b) => ({
    slot: b.slot, group: b.group, height: 1.8, label: `RIDER ${b.number}`,
  })));
  film.setGroups(fmx.groups.map((g) => ({ name: g.name, size: g.bikes.length })));
  film.setZones(L.zones);
  map.filmGame = {
    film,
    zones: L.zones,
    posed: rider.posed,
    kicker: FMX_NAME,
    words: {
      find: 'Find the riders', smoke: 'In the roost!', inShot: 'Rider in shot', tandem: 'Two in frame', smokeLabel: 'In the roost', lost: 'Find a rider', tip: '\nYou are the camera. Follow the riders off the kickers for a minute.',
    },
    bikes: fmx.bikes,
    ride: rider.rideOf,
  };
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
